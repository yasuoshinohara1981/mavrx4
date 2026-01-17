/**
 * GPU Physics System for Scene05
 * 物理演算をGPUで行うシステム（重力、復元力、速度更新）
 */

import * as THREE from 'three';

export class GPUPhysicsSystem {
    constructor(renderer, gridSizeX, gridSizeZ) {
        if (!renderer) {
            throw new Error('GPUPhysicsSystem: renderer is required');
        }
        
        this.renderer = renderer;
        this.gridSizeX = gridSizeX;
        this.gridSizeZ = gridSizeZ;
        this.particleCount = gridSizeX * gridSizeZ;
        
        // テクスチャサイズ（パーティクル数に合わせる）
        this.width = gridSizeX;
        this.height = gridSizeZ;
        
        // Ping-pongバッファ用のRenderTarget
        this.positionRenderTargets = [];
        this.velocityRenderTargets = [];
        this.initialPositionRenderTarget = null;
        this.currentPositionBuffer = 0;
        this.currentVelocityBuffer = 0;
        
        // 更新用シェーダーマテリアル
        this.physicsUpdateMaterial = null;
        this.velocityUpdateMaterial = null;
        this.physicsUpdateMesh = null;
        this.velocityUpdateMesh = null;
        
        // 更新用シーンとカメラ
        this.updateScene = null;
        this.updateCamera = null;
        
        // シェーダー
        this.shaders = null;
        
        // 初期化
        this.initPromise = this.init();
    }
    
    async init() {
        // RenderTargetを作成
        this.createRenderTargets();
        
        // シェーダーを読み込む
        await this.loadShaders();
        
        // 更新用シェーダーを作成
        this.createUpdateShader();
    }
    
    /**
     * シェーダーファイルを読み込む
     */
    async loadShaders() {
        try {
            const shaderBasePath = '/shaders/scene05/';
            
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
            
            const [physicsVert, physicsFrag, velocityFrag] = await Promise.all([
                loadShader(`${shaderBasePath}physicsUpdate.vert`, 'physicsUpdate.vert'),
                loadShader(`${shaderBasePath}physicsUpdate.frag`, 'physicsUpdate.frag'),
                loadShader(`${shaderBasePath}velocityUpdate.frag`, 'velocityUpdate.frag')
            ]);
            
            this.shaders = {
                physicsUpdate: { vertex: physicsVert, fragment: physicsFrag },
                velocityUpdate: { vertex: physicsVert, fragment: velocityFrag }
            };
            
            console.log(`✓ シェーダー読み込み完了: scene05`);
        } catch (error) {
            console.error('✗ シェーダーの読み込みエラー:', error);
            throw error;
        }
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
        
        // 位置用RenderTarget（ping-pong）
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
        
        // 速度用RenderTarget（ping-pong）
        this.velocityRenderTargets[0] = new THREE.WebGLRenderTarget(
            this.width,
            this.height,
            rtOptions
        );
        
        this.velocityRenderTargets[1] = new THREE.WebGLRenderTarget(
            this.width,
            this.height,
            rtOptions
        );
        
        // 初期位置用RenderTarget（読み取り専用）
        this.initialPositionRenderTarget = new THREE.WebGLRenderTarget(
            this.width,
            this.height,
            rtOptions
        );
    }
    
    /**
     * 更新用シェーダーを作成
     */
    createUpdateShader() {
        if (!this.shaders) {
            console.error('シェーダーが読み込まれていません');
            return;
        }
        
        const physicsUniforms = {
            positionTexture: { value: null },
            velocityTexture: { value: null },
            initialPositionTexture: { value: null },
            deltaTime: { value: 0.0 },
            gravity: { value: new THREE.Vector3(0, -3.5, 0) },
            restoreStiffness: { value: 0.01 },
            restoreDamping: { value: 0.005 },
            groundY: { value: 0.0 },
            sphereRadius: { value: 1.0 },
            gridSizeX: { value: this.gridSizeX },
            gridSizeZ: { value: this.gridSizeZ },
            gridSpacing: { value: 10.0 },
            forceCenter: { value: new THREE.Vector3(0, 0, 0) },
            forceStrength: { value: 0.0 },
            forceRadius: { value: 0.0 },
            width: { value: this.width },
            height: { value: this.height },
            springStiffness: { value: 0.15 },
            springDamping: { value: 0.05 },
            restLength: { value: 10.0 }
        };
        
        // 速度更新用のuniformsをコピー（参照を共有）
        const velocityUniforms = Object.assign({}, physicsUniforms);
        
        this.physicsUpdateMaterial = new THREE.ShaderMaterial({
            uniforms: physicsUniforms,
            vertexShader: this.shaders.physicsUpdate.vertex,
            fragmentShader: this.shaders.physicsUpdate.fragment
        });
        
        this.velocityUpdateMaterial = new THREE.ShaderMaterial({
            uniforms: velocityUniforms,
            vertexShader: this.shaders.velocityUpdate.vertex,
            fragmentShader: this.shaders.velocityUpdate.fragment
        });
        
        // 更新用メッシュを作成
        const geometry = new THREE.PlaneGeometry(2, 2);
        this.physicsUpdateMesh = new THREE.Mesh(geometry, this.physicsUpdateMaterial);
        this.velocityUpdateMesh = new THREE.Mesh(geometry.clone(), this.velocityUpdateMaterial);
        this.updateScene = new THREE.Scene();
        this.updateScene.add(this.physicsUpdateMesh);
        this.updateScene.add(this.velocityUpdateMesh);
        this.updateCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }
    
    /**
     * 初期パーティクルデータを設定
     */
    initializeParticleData(initialPositions, initialVelocities = null) {
        const dataSize = this.width * this.height * 4;
        const positionData = new Float32Array(dataSize);
        const velocityData = new Float32Array(dataSize);
        const initialPositionData = new Float32Array(dataSize);
        
        for (let i = 0; i < this.particleCount; i++) {
            const pos = initialPositions[i];
            const idx = i * 4;
            
            // 位置データ
            positionData[idx] = pos.x;
            positionData[idx + 1] = pos.y;
            positionData[idx + 2] = pos.z;
            positionData[idx + 3] = 1.0;
            
            // 初期位置データ
            initialPositionData[idx] = pos.x;
            initialPositionData[idx + 1] = pos.y;
            initialPositionData[idx + 2] = pos.z;
            initialPositionData[idx + 3] = 1.0;
            
            // 速度データ（初期値は0）
            if (initialVelocities && initialVelocities[i]) {
                const vel = initialVelocities[i];
                velocityData[idx] = vel.x;
                velocityData[idx + 1] = vel.y;
                velocityData[idx + 2] = vel.z;
            } else {
                velocityData[idx] = 0.0;
                velocityData[idx + 1] = 0.0;
                velocityData[idx + 2] = 0.0;
            }
            velocityData[idx + 3] = 1.0;
        }
        
        // テクスチャに書き込む
        const positionTexture = new THREE.DataTexture(
            positionData,
            this.width,
            this.height,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        positionTexture.needsUpdate = true;
        
        const velocityTexture = new THREE.DataTexture(
            velocityData,
            this.width,
            this.height,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        velocityTexture.needsUpdate = true;
        
        const initialPositionTexture = new THREE.DataTexture(
            initialPositionData,
            this.width,
            this.height,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        initialPositionTexture.needsUpdate = true;
        
        // RenderTargetにコピー
        this.renderer.setRenderTarget(this.positionRenderTargets[0]);
        this.renderer.clear();
        const tempScene = new THREE.Scene();
        const tempCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const tempMaterial = new THREE.MeshBasicMaterial({ map: positionTexture });
        const tempMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), tempMaterial);
        tempScene.add(tempMesh);
        this.renderer.render(tempScene, tempCamera);
        
        this.renderer.setRenderTarget(this.velocityRenderTargets[0]);
        this.renderer.clear();
        tempMaterial.map = velocityTexture;
        this.renderer.render(tempScene, tempCamera);
        
        this.renderer.setRenderTarget(this.initialPositionRenderTarget);
        this.renderer.clear();
        tempMaterial.map = initialPositionTexture;
        this.renderer.render(tempScene, tempCamera);
        
        this.renderer.setRenderTarget(null);
        
        console.log(`✅ GPU物理演算システムの初期データを設定しました (${this.particleCount} particles)`);
    }
    
    /**
     * 物理演算を更新（GPU側で計算）
     */
    update(deltaTime, uniforms = {}) {
        if (!this.physicsUpdateMaterial || !this.physicsUpdateMaterial.uniforms) {
            return;
        }
        
        // uniformを更新
        this.physicsUpdateMaterial.uniforms.deltaTime.value = deltaTime;
        
        // カスタムuniformを適用
        if (uniforms.gravity !== undefined) {
            this.physicsUpdateMaterial.uniforms.gravity.value = uniforms.gravity;
        }
        if (uniforms.restoreStiffness !== undefined) {
            this.physicsUpdateMaterial.uniforms.restoreStiffness.value = uniforms.restoreStiffness;
        }
        if (uniforms.restoreDamping !== undefined) {
            this.physicsUpdateMaterial.uniforms.restoreDamping.value = uniforms.restoreDamping;
        }
        if (uniforms.groundY !== undefined) {
            this.physicsUpdateMaterial.uniforms.groundY.value = uniforms.groundY;
        }
        if (uniforms.sphereRadius !== undefined) {
            this.physicsUpdateMaterial.uniforms.sphereRadius.value = uniforms.sphereRadius;
        }
        if (uniforms.gridSpacing !== undefined) {
            this.physicsUpdateMaterial.uniforms.gridSpacing.value = uniforms.gridSpacing;
        }
        if (uniforms.forceCenter !== undefined) {
            this.physicsUpdateMaterial.uniforms.forceCenter.value = uniforms.forceCenter;
        }
        if (uniforms.forceStrength !== undefined) {
            this.physicsUpdateMaterial.uniforms.forceStrength.value = uniforms.forceStrength;
        }
        if (uniforms.forceRadius !== undefined) {
            this.physicsUpdateMaterial.uniforms.forceRadius.value = uniforms.forceRadius;
        }
        if (uniforms.springStiffness !== undefined) {
            this.velocityUpdateMaterial.uniforms.springStiffness.value = uniforms.springStiffness;
        }
        if (uniforms.springDamping !== undefined) {
            this.velocityUpdateMaterial.uniforms.springDamping.value = uniforms.springDamping;
        }
        if (uniforms.restLength !== undefined) {
            this.velocityUpdateMaterial.uniforms.restLength.value = uniforms.restLength;
        }
        
        // 読み取りバッファ
        const readPositionBuffer = this.currentPositionBuffer;
        const readVelocityBuffer = this.currentVelocityBuffer;
        
        // 書き込み先バッファ
        const writePositionBuffer = 1 - readPositionBuffer;
        const writeVelocityBuffer = 1 - readVelocityBuffer;
        
        // 位置と速度のテクスチャを設定（両方のマテリアルに設定）
        this.physicsUpdateMaterial.uniforms.positionTexture.value = this.positionRenderTargets[readPositionBuffer].texture;
        this.physicsUpdateMaterial.uniforms.velocityTexture.value = this.velocityRenderTargets[readVelocityBuffer].texture;
        this.physicsUpdateMaterial.uniforms.initialPositionTexture.value = this.initialPositionRenderTarget.texture;
        
        this.velocityUpdateMaterial.uniforms.positionTexture.value = this.positionRenderTargets[readPositionBuffer].texture;
        this.velocityUpdateMaterial.uniforms.velocityTexture.value = this.velocityRenderTargets[readVelocityBuffer].texture;
        this.velocityUpdateMaterial.uniforms.initialPositionTexture.value = this.initialPositionRenderTarget.texture;
        
        // まず速度を更新（位置はまだ古い値を使用）
        this.velocityUpdateMesh.visible = true;
        this.physicsUpdateMesh.visible = false;
        this.renderer.setRenderTarget(this.velocityRenderTargets[writeVelocityBuffer]);
        this.renderer.render(this.updateScene, this.updateCamera);
        
        // 次に位置を更新（更新された速度を使用）
        this.velocityUpdateMaterial.uniforms.velocityTexture.value = this.velocityRenderTargets[writeVelocityBuffer].texture;
        this.physicsUpdateMaterial.uniforms.velocityTexture.value = this.velocityRenderTargets[writeVelocityBuffer].texture;
        
        this.velocityUpdateMesh.visible = false;
        this.physicsUpdateMesh.visible = true;
        this.renderer.setRenderTarget(this.positionRenderTargets[writePositionBuffer]);
        this.renderer.render(this.updateScene, this.updateCamera);
        
        // バッファを切り替え
        this.currentPositionBuffer = writePositionBuffer;
        this.currentVelocityBuffer = writeVelocityBuffer;
    }
    
    /**
     * 現在の位置テクスチャを取得
     */
    getPositionTexture() {
        return this.positionRenderTargets[this.currentPositionBuffer].texture;
    }
    
    /**
     * 現在の速度テクスチャを取得
     */
    getVelocityTexture() {
        return this.velocityRenderTargets[this.currentVelocityBuffer].texture;
    }
    
    /**
     * 位置データをCPUに読み込む（デバッグ用、パフォーマンスに注意）
     */
    readPositionData() {
        const renderTarget = this.positionRenderTargets[this.currentPositionBuffer];
        const width = renderTarget.width;
        const height = renderTarget.height;
        const size = width * height * 4;
        
        // FloatTypeのRenderTargetから読み取る
        // WebGLでは、FloatTypeのRenderTargetから直接Float32Arrayを読み取れる場合と、Uint8Arrayで読み取る必要がある場合がある
        let floatPixels;
        try {
            // まずFloat32Arrayで直接読み取ってみる
            floatPixels = new Float32Array(size);
            this.renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, floatPixels);
        } catch (e) {
            // Float32Arrayで読み取れない場合は、Uint8Arrayで読み取ってから変換
            console.warn('Float32Arrayで読み取れないため、Uint8Array経由で変換します');
            const uint8Pixels = new Uint8Array(size * 4);
            this.renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, uint8Pixels);
            
            // Uint8ArrayをFloat32Arrayに変換
            floatPixels = new Float32Array(size);
            const buffer = new ArrayBuffer(size * 4);
            const view = new DataView(buffer);
            for (let i = 0; i < size; i++) {
                const byteOffset = i * 4;
                view.setUint8(byteOffset, uint8Pixels[byteOffset]);
                view.setUint8(byteOffset + 1, uint8Pixels[byteOffset + 1]);
                view.setUint8(byteOffset + 2, uint8Pixels[byteOffset + 2]);
                view.setUint8(byteOffset + 3, uint8Pixels[byteOffset + 3]);
                floatPixels[i] = view.getFloat32(byteOffset, true);
            }
        }
        
        // 位置データを配列に変換
        const positions = [];
        for (let i = 0; i < this.particleCount; i++) {
            const idx = i * 4;
            positions.push(new THREE.Vector3(floatPixels[idx], floatPixels[idx + 1], floatPixels[idx + 2]));
        }
        
        return positions;
    }
    
    /**
     * 速度データをCPUに読み込む（デバッグ用、パフォーマンスに注意）
     */
    readVelocityData() {
        const renderTarget = this.velocityRenderTargets[this.currentVelocityBuffer];
        const width = renderTarget.width;
        const height = renderTarget.height;
        const size = width * height * 4;
        
        // FloatTypeのRenderTargetから読み取る
        let floatPixels;
        try {
            // まずFloat32Arrayで直接読み取ってみる
            floatPixels = new Float32Array(size);
            this.renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, floatPixels);
        } catch (e) {
            // Float32Arrayで読み取れない場合は、Uint8Arrayで読み取ってから変換
            console.warn('Float32Arrayで読み取れないため、Uint8Array経由で変換します');
            const uint8Pixels = new Uint8Array(size * 4);
            this.renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, uint8Pixels);
            
            // Uint8ArrayをFloat32Arrayに変換
            floatPixels = new Float32Array(size);
            const buffer = new ArrayBuffer(size * 4);
            const view = new DataView(buffer);
            for (let i = 0; i < size; i++) {
                const byteOffset = i * 4;
                view.setUint8(byteOffset, uint8Pixels[byteOffset]);
                view.setUint8(byteOffset + 1, uint8Pixels[byteOffset + 1]);
                view.setUint8(byteOffset + 2, uint8Pixels[byteOffset + 2]);
                view.setUint8(byteOffset + 3, uint8Pixels[byteOffset + 3]);
                floatPixels[i] = view.getFloat32(byteOffset, true);
            }
        }
        
        // 速度データを配列に変換
        const velocities = [];
        for (let i = 0; i < this.particleCount; i++) {
            const idx = i * 4;
            velocities.push(new THREE.Vector3(floatPixels[idx], floatPixels[idx + 1], floatPixels[idx + 2]));
        }
        
        return velocities;
    }
    
    /**
     * 破棄
     */
    dispose() {
        // RenderTargetを破棄
        this.positionRenderTargets.forEach(rt => rt.dispose());
        this.velocityRenderTargets.forEach(rt => rt.dispose());
        if (this.initialPositionRenderTarget) {
            this.initialPositionRenderTarget.dispose();
        }
        
        // マテリアルを破棄
        if (this.physicsUpdateMaterial) {
            this.physicsUpdateMaterial.dispose();
        }
        if (this.velocityUpdateMaterial) {
            this.velocityUpdateMaterial.dispose();
        }
        
        // メッシュを破棄
        if (this.physicsUpdateMesh) {
            this.physicsUpdateMesh.geometry.dispose();
            if (this.physicsUpdateMesh.material) {
                this.physicsUpdateMesh.material.dispose();
            }
        }
        if (this.velocityUpdateMesh) {
            this.velocityUpdateMesh.geometry.dispose();
            if (this.velocityUpdateMesh.material) {
                this.velocityUpdateMesh.material.dispose();
            }
        }
    }
}
