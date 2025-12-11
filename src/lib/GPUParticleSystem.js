/**
 * GPU Particle System
 * Three.jsでGPUパーティクルを実装（RenderTarget + Ping-pongバッファを使用）
 * ノイズ計算と色計算をGPU側で行う
 */

import * as THREE from 'three';

export class GPUParticleSystem {
    constructor(renderer, particleCount, cols, rows, baseRadius, shaderPath = 'scene01', particleSize = 3.0) {
        if (!renderer) {
            throw new Error('GPUParticleSystem: renderer is required');
        }
        
        this.renderer = renderer;
        this.particleCount = particleCount;
        this.cols = cols;
        this.rows = rows;
        this.baseRadius = baseRadius;
        this.shaderPath = shaderPath;
        this.particleSize = particleSize;  // パーティクルサイズ（シーン側から指定可能）
        
        // テクスチャサイズ（パーティクル数に合わせる）
        this.width = cols;
        this.height = rows;
        
        // Ping-pongバッファ用のRenderTarget
        this.positionRenderTargets = [];
        this.colorRenderTargets = [];
        this.currentPositionBuffer = 0;
        this.currentColorBuffer = 0;
        
        // 更新用シェーダーマテリアル
        this.positionUpdateMaterial = null;
        this.colorUpdateMaterial = null;
        this.positionUpdateMesh = null;
        this.colorUpdateMesh = null;
        
        // 描画用ジオメトリとマテリアル
        this.particleGeometry = null;
        this.particleMaterial = null;
        this.particleSystem = null;
        
        // 更新用シーンとカメラ（createUpdateShaderで初期化）
        this.updateScene = null;
        this.updateCamera = null;
        
        // シェーダーソース
        this.shaders = null;
        
        // 初期化（非同期）
        this.initPromise = this.init();
    }
    
    async init() {
        // RenderTargetを作成
        this.createRenderTargets();
        
        // シェーダーを読み込む
        await this.loadShaders();
        
        // 更新用シェーダーを作成
        this.createUpdateShader();
        
        // 描画用シェーダーを作成
        this.createRenderShader();
        
        // 初期データを設定
        this.initializeParticleData();
        
        // 初期テクスチャを設定（render()が先に呼ばれる場合に備える）
        if (this.particleMaterial && this.particleMaterial.uniforms && 
            this.positionRenderTargets && this.positionRenderTargets[0] &&
            this.colorRenderTargets && this.colorRenderTargets[0]) {
            if (this.particleMaterial.uniforms.positionTexture) {
                this.particleMaterial.uniforms.positionTexture.value = this.positionRenderTargets[0].texture;
            }
            if (this.particleMaterial.uniforms.colorTexture) {
                this.particleMaterial.uniforms.colorTexture.value = this.colorRenderTargets[0].texture;
            }
        }
    }
    
    /**
     * シェーダーファイルを読み込む
     */
    async loadShaders() {
        try {
            // publicフォルダからシェーダーを読み込む
            const shaderBasePath = `/shaders/${this.shaderPath}/`;
            
            console.log(`シェーダー読み込み開始: ${shaderBasePath}`);
            
            const loadShader = async (path, name) => {
                const response = await fetch(path);
                if (!response.ok) {
                    throw new Error(`Failed to load ${name}: ${response.status} ${response.statusText}`);
                }
                const text = await response.text();
                if (!text || text.trim().length === 0) {
                    throw new Error(`Empty shader file: ${name}`);
                }
                console.log(`✓ ${name} loaded (${text.length} chars)`);
                return text;
            };
            
            const [positionVert, positionFrag, colorVert, colorFrag, renderVert, renderFrag] = await Promise.all([
                loadShader(`${shaderBasePath}positionUpdate.vert`, 'positionUpdate.vert'),
                loadShader(`${shaderBasePath}positionUpdate.frag`, 'positionUpdate.frag'),
                loadShader(`${shaderBasePath}colorUpdate.vert`, 'colorUpdate.vert'),
                loadShader(`${shaderBasePath}colorUpdate.frag`, 'colorUpdate.frag'),
                loadShader(`${shaderBasePath}particleRender.vert`, 'particleRender.vert'),
                loadShader(`${shaderBasePath}particleRender.frag`, 'particleRender.frag')
            ]);
            
            this.shaders = {
                positionUpdate: { vertex: positionVert, fragment: positionFrag },
                colorUpdate: { vertex: colorVert, fragment: colorFrag },
                particleRender: { vertex: renderVert, fragment: renderFrag }
            };
            
            console.log(`✓ シェーダー読み込み完了: ${this.shaderPath}`);
        } catch (error) {
            console.error('✗ シェーダーの読み込みエラー:', error);
            console.warn('デフォルトシェーダーを使用します');
            // フォールバック: デフォルトシェーダーを使用
            this.shaders = this.getDefaultShaders();
        }
    }
    
    /**
     * デフォルトシェーダー（フォールバック用・汎用的な実装）
     */
    getDefaultShaders() {
        return {
            positionUpdate: {
                vertex: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragment: `
                    uniform sampler2D positionTexture;
                    uniform float time;
                    uniform float noiseScale;
                    uniform float noiseStrength;
                    uniform float baseRadius;
                    uniform float width;
                    uniform float height;
                    varying vec2 vUv;
                    
                    // 汎用的な実装：位置をそのまま返す（変形なし）
                    void main() {
                        vec4 posData = texture2D(positionTexture, vUv);
                        // 位置をそのまま出力（baseRadiusをwに保存）
                        gl_FragColor = posData;
                    }
                `
            },
            colorUpdate: {
                vertex: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragment: `
                    uniform sampler2D positionTexture;
                    uniform float baseRadius;
                    varying vec2 vUv;
                    
                    // 汎用的な実装：位置から基本的な色を計算
                    void main() {
                        vec4 posData = texture2D(positionTexture, vUv);
                        vec3 currentPos = posData.xyz;
                        
                        // 位置から基本的な色を計算（シーン固有のロジックなし）
                        // 単純に位置の正規化された値を使用
                        vec3 normalizedPos = normalize(currentPos + vec3(1.0));
                        vec3 color = normalizedPos * 0.5 + 0.5;  // 0.0-1.0の範囲に正規化
                        
                        gl_FragColor = vec4(color, 1.0);
                    }
                `
            },
            particleRender: {
                vertex: `
                    uniform sampler2D positionTexture;
                    uniform sampler2D colorTexture;
                    uniform float width;
                    uniform float height;
                    attribute float size;
                    attribute vec2 particleUv;
                    varying vec3 vColor;
                    void main() {
                        vec2 pixelUv = vec2((floor(particleUv.x * width) + 0.5) / width, (floor(particleUv.y * height) + 0.5) / height);
                        vec4 posData = texture2D(positionTexture, pixelUv);
                        vec4 colorData = texture2D(colorTexture, pixelUv);
                        vec3 position = posData.xyz;
                        vColor = colorData.rgb;
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                        gl_PointSize = size * (300.0 / -mvPosition.z);
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `,
                fragment: `
                    varying vec3 vColor;
                    void main() {
                        float dist = distance(gl_PointCoord, vec2(0.5));
                        if (dist > 0.5) discard;
                        float alpha = 1.0 - (dist * 2.0);
                        gl_FragColor = vec4(vColor, alpha);
                    }
                `
            }
        };
    }
    
    /**
     * RenderTargetを作成（ping-pong用）
     */
    createRenderTargets() {
        const rtOptions = {
            type: THREE.FloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            generateMipmaps: false
        };
        
        // 位置用RenderTarget（ping-pong）- 別々に作成
        this.positionRenderTargets[0] = new THREE.WebGLRenderTarget(
            this.width,
            this.height,
            rtOptions
        );
        
        this.positionRenderTargets[1] = new THREE.WebGLRenderTarget(
            this.width,
            this.height,
            rtOptions
        );
        
        // 色用RenderTarget（ping-pong）- 別々に作成
        this.colorRenderTargets[0] = new THREE.WebGLRenderTarget(
            this.width,
            this.height,
            rtOptions
        );
        
        this.colorRenderTargets[1] = new THREE.WebGLRenderTarget(
            this.width,
            this.height,
            rtOptions
        );
    }
    
    /**
     * 初期パーティクルデータを設定
     */
    initializeParticleData() {
        const dataSize = this.width * this.height * 4;
        const positionData = new Float32Array(dataSize);
        const colorData = new Float32Array(dataSize);
        
        // 球面上に初期配置
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const index = (y * this.width + x) * 4;
                
                // 緯度・経度を計算
                const latitude = (y / (this.height - 1) - 0.5) * Math.PI;
                const longitude = (x / (this.width - 1)) * Math.PI * 2;
                
                // 球面上の位置
                const posX = this.baseRadius * Math.cos(latitude) * Math.cos(longitude);
                const posY = this.baseRadius * Math.sin(latitude);
                const posZ = this.baseRadius * Math.cos(latitude) * Math.sin(longitude);
                
                // 位置データ（x, y, z, baseRadius）
                positionData[index] = posX;
                positionData[index + 1] = posY;
                positionData[index + 2] = posZ;
                positionData[index + 3] = this.baseRadius;
                
                // 色データ（初期は青）
                colorData[index] = 0.0;     // r
                colorData[index + 1] = 0.5; // g
                colorData[index + 2] = 1.0; // b
                colorData[index + 3] = 1.0; // a
            }
        }
        
        // 初期テクスチャを作成してRenderTargetにコピー
        const positionTexture = new THREE.DataTexture(
            positionData,
            this.width,
            this.height,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        positionTexture.needsUpdate = true;
        
        const colorTexture = new THREE.DataTexture(
            colorData,
            this.width,
            this.height,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        colorTexture.needsUpdate = true;
        
        // RenderTargetにコピー
        this.copyTextureToRenderTarget(positionTexture, this.positionRenderTargets[0]);
        this.copyTextureToRenderTarget(colorTexture, this.colorRenderTargets[0]);
    }
    
    /**
     * テクスチャをRenderTargetにコピー
     */
    copyTextureToRenderTarget(texture, renderTarget) {
        // 一時的なシーンとカメラを作成
        const tempScene = new THREE.Scene();
        const tempCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        // FloatTypeのテクスチャをコピーするためのシェーダーマテリアル
        const copyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                sourceTexture: { value: texture }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D sourceTexture;
                varying vec2 vUv;
                void main() {
                    gl_FragColor = texture2D(sourceTexture, vUv);
                }
            `
        });
            
            const geometry = new THREE.PlaneGeometry(2, 2);
        const mesh = new THREE.Mesh(geometry, copyMaterial);
        tempScene.add(mesh);
        
        this.renderer.setRenderTarget(renderTarget);
        this.renderer.render(tempScene, tempCamera);
        this.renderer.setRenderTarget(null);
        
        // クリーンアップ
        tempScene.remove(mesh);
        geometry.dispose();
        copyMaterial.dispose();
    }
    
    /**
     * 更新用シェーダーを作成
     */
    createUpdateShader() {
        if (!this.shaders) {
            console.error('シェーダーが読み込まれていません');
            return;
        }
        
        // 位置更新用シェーダー
        this.positionUpdateMaterial = new THREE.ShaderMaterial({
            uniforms: {
                positionTexture: { value: null },
                colorTexture: { value: null },
                time: { value: 0.0 },
                deltaTime: { value: 0.0 },
                noiseScale: { value: 0.01 },  // ノイズスケール（scene09用）
                noiseStrength: { value: 50.0 },  // ノイズ強度（scene09用）
                baseRadius: { value: 400.0 },
                width: { value: this.width },
                height: { value: this.height },
                boxSize: { value: 200.0 },  // scene09で使用
                forcePoint: { value: new THREE.Vector3(0, 0, 0) },  // scene09で使用
                forceStrength: { value: 0.0 },  // scene09で使用
                forceRadius: { value: 60.0 }  // scene09で使用
            },
            vertexShader: this.shaders.positionUpdate.vertex,
            fragmentShader: this.shaders.positionUpdate.fragment
        });
        
        // 色更新用シェーダー
        this.colorUpdateMaterial = new THREE.ShaderMaterial({
            uniforms: {
                positionTexture: { value: null },
                colorTexture: { value: null },  // colorUpdate.fragで使用するため追加
                baseRadius: { value: 400.0 },
                deltaTime: { value: 0.0 },
                width: { value: this.width },
                height: { value: this.height },
                time: { value: 0.0 }
            },
            vertexShader: this.shaders.colorUpdate.vertex,
            fragmentShader: this.shaders.colorUpdate.fragment
        });
        
        // 更新用メッシュを作成
        const geometry = new THREE.PlaneGeometry(2, 2);
        this.positionUpdateMesh = new THREE.Mesh(geometry, this.positionUpdateMaterial);
        this.colorUpdateMesh = new THREE.Mesh(geometry, this.colorUpdateMaterial);
        this.updateScene = new THREE.Scene();
        this.updateScene.add(this.positionUpdateMesh);
        this.updateScene.add(this.colorUpdateMesh);
        this.updateCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }
    
    /**
     * 描画用シェーダーを作成
     */
    createRenderShader() {
        // パーティクル用のジオメトリを作成（UV座標を使用）
        const positions = new Float32Array(this.particleCount * 3);
        const uvs = new Float32Array(this.particleCount * 2);
        const sizes = new Float32Array(this.particleCount);
        
        // 各パーティクルにUV座標を設定
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const index = y * this.width + x;
                const u = (x + 0.5) / this.width;
                const v = (y + 0.5) / this.height;
                
                uvs[index * 2] = u;
                uvs[index * 2 + 1] = v;
                
                // パーティクルサイズを1.0～3.0の範囲でランダムに設定（シーン09専用の処理）
                // シーン09ではサイズと質量を連動させるため、ランダムなサイズを設定
                if (this.shaderPath === 'scene09') {
                    // ハッシュ関数でランダムなサイズを生成（particleSizeを基準に1.0～3.0の範囲）
                    const hash = (x * 73856093) ^ (y * 19349663);
                    const normalizedHash = ((hash & 0x7fffffff) / 0x7fffffff);  // 0.0～1.0
                    // particleSizeを基準に、1.0～3.0の範囲でスケール
                    const sizeMultiplier = 1.0 + normalizedHash * 2.0;  // 1.0～3.0
                    sizes[index] = this.particleSize * sizeMultiplier;  // particleSizeを基準にスケール
                } else {
                    sizes[index] = this.particleSize;  // 他のシーンでは固定サイズ
                }
            }
        }
        
        this.particleGeometry = new THREE.BufferGeometry();
        this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.particleGeometry.setAttribute('particleUv', new THREE.BufferAttribute(uvs, 2));
        this.particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        // 描画用シェーダーマテリアル
        if (!this.shaders) {
            console.error('シェーダーが読み込まれていません');
            return;
        }
        
        // ShaderMaterialを使用（RawShaderMaterialは問題があったため元に戻す）
        // ライティングを有効化
        // 初期テクスチャを作成（nullの代わりにダミーテクスチャを使用）
        const dummyTexture = new THREE.DataTexture(
            new Float32Array(4),
            1,
            1,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        dummyTexture.needsUpdate = true;
        
        this.particleMaterial = new THREE.ShaderMaterial({
            uniforms: {
                positionTexture: { value: dummyTexture },
                colorTexture: { value: dummyTexture },
                width: { value: this.width },
                height: { value: this.height }
            },
            vertexShader: this.shaders.particleRender.vertex,
            fragmentShader: this.shaders.particleRender.fragment,
            transparent: false,  // 完全に不透明にする
            vertexColors: true,
            lights: false,  // ライティングを無効化（シェーダーで使用していないため）
            depthTest: true,  // 深度テストを有効化（裏側を隠す）
            depthWrite: true  // 深度バッファに書き込み（裏側を隠す）
        });
        
        this.particleSystem = new THREE.Points(this.particleGeometry, this.particleMaterial);
    }
    
    /**
     * パーティクルを更新（GPU側で計算）
     */
    update(uniforms) {
        // 初期化が完了していない場合は何もしない
        if (!this.particleMaterial || !this.particleMaterial.uniforms) {
            return;
        }
        
        // 位置更新用シェーダーにuniformを設定
        if (this.positionUpdateMaterial && this.positionUpdateMaterial.uniforms) {
            if (this.positionUpdateMaterial.uniforms.time) {
                this.positionUpdateMaterial.uniforms.time.value = uniforms.time || 0.0;
            }
            if (this.positionUpdateMaterial.uniforms.noiseScale) {
                this.positionUpdateMaterial.uniforms.noiseScale.value = uniforms.noiseScale || 1.0;  // 緩めのノイズ（デフォルト値）
            }
            if (this.positionUpdateMaterial.uniforms.noiseStrength) {
                this.positionUpdateMaterial.uniforms.noiseStrength.value = uniforms.noiseStrength || 50.0;  // Processingと同じデフォルト値
            }
            if (this.positionUpdateMaterial.uniforms.baseRadius) {
                this.positionUpdateMaterial.uniforms.baseRadius.value = uniforms.baseRadius || 400.0;
            }
        }
        
        // 色更新用シェーダーにuniformを設定
        if (this.colorUpdateMaterial && this.colorUpdateMaterial.uniforms) {
            if (this.colorUpdateMaterial.uniforms.baseRadius) {
                this.colorUpdateMaterial.uniforms.baseRadius.value = uniforms.baseRadius || 400.0;
            }
        }
        
        // 現在のバッファから読み取り
        const readPositionBuffer = this.currentPositionBuffer;
        
        // 書き込み先バッファ
        const writePositionBuffer = 1 - readPositionBuffer;
        
        // 位置を更新
        if (this.positionUpdateMaterial && this.positionUpdateMaterial.uniforms && 
            this.positionRenderTargets && this.positionRenderTargets[readPositionBuffer]) {
            if (this.positionUpdateMaterial.uniforms.positionTexture) {
                this.positionUpdateMaterial.uniforms.positionTexture.value = this.positionRenderTargets[readPositionBuffer].texture;
            }
            // colorTextureを設定（読み取りバッファから）
            if (this.positionUpdateMaterial.uniforms.colorTexture && 
                this.colorRenderTargets && this.colorRenderTargets[this.currentColorBuffer]) {
                this.positionUpdateMaterial.uniforms.colorTexture.value = this.colorRenderTargets[this.currentColorBuffer].texture;
            }
            this.positionUpdateMesh.visible = true;
            this.colorUpdateMesh.visible = false;
            
            this.renderer.setRenderTarget(this.positionRenderTargets[writePositionBuffer]);
            this.renderer.render(this.updateScene, this.updateCamera);
        }
        
        // 色を更新（更新された位置テクスチャから色を計算）
        if (this.colorUpdateMaterial && this.colorUpdateMaterial.uniforms && 
            this.positionRenderTargets && this.positionRenderTargets[writePositionBuffer]) {
            if (this.colorUpdateMaterial.uniforms.positionTexture) {
                this.colorUpdateMaterial.uniforms.positionTexture.value = this.positionRenderTargets[writePositionBuffer].texture;
            }
            // colorTextureを設定（読み取りバッファから）
            if (this.colorUpdateMaterial.uniforms.colorTexture && 
                this.colorRenderTargets && this.colorRenderTargets[this.currentColorBuffer]) {
                this.colorUpdateMaterial.uniforms.colorTexture.value = this.colorRenderTargets[this.currentColorBuffer].texture;
            }
            // deltaTime, width, height, timeを設定
            if (this.colorUpdateMaterial.uniforms.deltaTime) {
                this.colorUpdateMaterial.uniforms.deltaTime.value = uniforms.deltaTime || 0.0;
            }
            if (this.colorUpdateMaterial.uniforms.width) {
                this.colorUpdateMaterial.uniforms.width.value = this.width;
            }
            if (this.colorUpdateMaterial.uniforms.height) {
                this.colorUpdateMaterial.uniforms.height.value = this.height;
            }
            if (this.colorUpdateMaterial.uniforms.time) {
                this.colorUpdateMaterial.uniforms.time.value = uniforms.time || 0.0;
            }
            this.positionUpdateMesh.visible = false;
            this.colorUpdateMesh.visible = true;
            
            this.renderer.setRenderTarget(this.colorRenderTargets[writePositionBuffer]);
            this.renderer.render(this.updateScene, this.updateCamera);
        }
        
        this.renderer.setRenderTarget(null);
        
        // バッファをスワップ
        this.currentPositionBuffer = writePositionBuffer;
        this.currentColorBuffer = writePositionBuffer;
        
        // 描画用シェーダーにテクスチャを設定
        if (this.particleMaterial && this.particleMaterial.uniforms) {
            if (this.particleMaterial.uniforms.positionTexture && 
                this.positionRenderTargets && this.positionRenderTargets[this.currentPositionBuffer] &&
                this.positionRenderTargets[this.currentPositionBuffer].texture) {
                this.particleMaterial.uniforms.positionTexture.value = this.positionRenderTargets[this.currentPositionBuffer].texture;
            }
            if (this.particleMaterial.uniforms.colorTexture && 
                this.colorRenderTargets && this.colorRenderTargets[this.currentColorBuffer] &&
                this.colorRenderTargets[this.currentColorBuffer].texture) {
                this.particleMaterial.uniforms.colorTexture.value = this.colorRenderTargets[this.currentColorBuffer].texture;
            }
        }
    }
    
    
    /**
     * パーティクルシステムを取得
     */
    getParticleSystem() {
        return this.particleSystem;
    }
    
    /**
     * 位置テクスチャを取得（シャドウ用）
     */
    getPositionTexture() {
        if (this.positionRenderTargets && this.positionRenderTargets[this.currentPositionBuffer]) {
            return this.positionRenderTargets[this.currentPositionBuffer].texture;
        }
        return null;
    }
    
    /**
     * 色テクスチャを取得（線描画用）
     */
    getColorTexture() {
        if (this.colorRenderTargets && this.colorRenderTargets[this.currentColorBuffer]) {
            return this.colorRenderTargets[this.currentColorBuffer].texture;
        }
        return null;
    }
    
    /**
     * 位置更新用シェーダーマテリアルを取得（シーン固有のuniform設定用）
     */
    getPositionUpdateMaterial() {
        return this.positionUpdateMaterial;
    }
    
    /**
     * リソースを解放
     */
    dispose() {
        if (this.positionRenderTargets[0]) this.positionRenderTargets[0].dispose();
        if (this.positionRenderTargets[1]) this.positionRenderTargets[1].dispose();
        if (this.colorRenderTargets[0]) this.colorRenderTargets[0].dispose();
        if (this.colorRenderTargets[1]) this.colorRenderTargets[1].dispose();
        if (this.positionUpdateMaterial) this.positionUpdateMaterial.dispose();
        if (this.colorUpdateMaterial) this.colorUpdateMaterial.dispose();
        if (this.particleMaterial) this.particleMaterial.dispose();
        if (this.particleGeometry) this.particleGeometry.dispose();
        if (this.positionUpdateMesh) {
            this.positionUpdateMesh.geometry.dispose();
            if (this.updateScene) {
                this.updateScene.remove(this.positionUpdateMesh);
            }
        }
        if (this.colorUpdateMesh) {
            this.colorUpdateMesh.geometry.dispose();
            if (this.updateScene) {
                this.updateScene.remove(this.colorUpdateMesh);
            }
        }
    }
}
