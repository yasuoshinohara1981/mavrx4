/**
 * Scene09: SPH Fluid Simulation
 * SPH（Smoothed Particle Hydrodynamics）による流体シミュレーション
 */

import { SceneBase } from '../SceneBase.js';
import { GPUParticleSystem } from '../../lib/GPUParticleSystem.js';
import * as THREE from 'three';

export class Scene09 extends SceneBase {
    constructor(renderer, camera) {
        super(renderer, camera);
        this.title = 'mathym | Scene09 - SPH Fluid Simulation';
        console.log('Scene09: コンストラクタ実行', this.title);
        
        // 表示設定
        this.SHOW_PARTICLES = true;
        this.SHOW_LINES = false;
        
        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
        
        // エフェクト設定
        this.trackEffects[1] = false;  // カメラランダマイズはデフォルトでオフ
        this.trackEffects[2] = true;
        this.trackEffects[4] = false;
        this.trackEffects[6] = false;  // トラック6エフェクト（アトラクター）はデフォルトでオフ
        this.showHUD = true;
        
        // パーティクル設定
        this.particleCount = 500000;  // 粒数（100万）
        // テクスチャサイズを粒数から自動計算（平方根を計算して適切なサイズに）
        const textureSize = Math.ceil(Math.sqrt(this.particleCount));
        this.cols = textureSize;
        this.rows = textureSize;
        // 実際のパーティクル数（テクスチャサイズに合わせて調整される）
        const actualParticleCount = this.cols * this.rows;
        console.log(`Scene09: パーティクル数 ${this.particleCount} → テクスチャサイズ ${this.cols}x${this.rows} = ${actualParticleCount}粒`);
        this.baseRadius = 0.0;  // パーティクルの基本サイズ（球面上に配置しないように0に設定）
        this.particleSize = 3.0;  // パーティクルの表示サイズ（大きくする）
        
        // ボックスパラメータ
        this.boxSize = 100.0;  // ボックスのサイズ（一辺の長さ）
        
        // ノイズパラメータ
        this.noiseScale = 0.01;  // ノイズのスケール
        this.noiseStrength = 50.0;  // ノイズの強さ
        
        // 力のパラメータ（トラック5用）
        this.forcePoint = new THREE.Vector3(0, 0, 0);  // 力の位置
        this.forceStrength = 0.0;  // 力の強さ
        this.forceRadius = 60.0;  // 力の影響範囲
        
        // GPUパーティクルシステム
        this.gpuParticleSystem = null;
        
        // ボックスメッシュ
        this.boxMesh = null;
        
        // 時間変数
        this.time = 0.0;
    }
    
    async setup() {
        await super.setup();
        
        // カメラパーティクルの距離パラメータを設定
        if (this.cameraParticles) {
            for (const cameraParticle of this.cameraParticles) {
                this.setupCameraParticleDistance(cameraParticle);
            }
        }
        
        // カメラを設定
        this.setupCamera();
        
        // ライトを設定
        this.setupLights();
        
        // ボックスを作成
        this.createBox();
        
        // GPUパーティクルシステムを初期化
        // baseRadiusを0に設定して、球面上に初期配置されないようにする
        const particleCount = this.cols * this.rows;
        this.gpuParticleSystem = new GPUParticleSystem(
            this.renderer,
            particleCount,
            this.cols,
            this.rows,
            0.0,  // baseRadiusを0にして球面上に配置しない
            'scene09',  // シェーダーパス
            this.particleSize  // パーティクルサイズ（表示サイズ）
        );
        
        // シェーダーの読み込み完了を待つ
        await this.gpuParticleSystem.initPromise;
        console.log('Scene09: GPUParticleSystem初期化完了', particleCount, 'particles');
        
        // パーティクルシステムをシーンに追加
        const particleSystem = this.gpuParticleSystem.getParticleSystem();
        if (particleSystem) {
            particleSystem.visible = this.SHOW_PARTICLES;
            
            // 通常の合成モードに設定（加算合成はやめる）
            if (this.gpuParticleSystem.particleMaterial) {
                this.gpuParticleSystem.particleMaterial.transparent = true;
                this.gpuParticleSystem.particleMaterial.depthWrite = false;
                this.gpuParticleSystem.particleMaterial.blending = THREE.NormalBlending;
            }
            
            this.scene.add(particleSystem);
        }
        
        // 初期パーティクルデータをボックス内に配置するように上書き
        // 初期パーティクルデータをボックス内に配置するように上書き
        // GPUParticleSystemの初期化が完了してから確実に上書き
        this.initializeParticleDataInBox();
        
        // レンダリングを一度実行してから再度上書き（確実に反映されるように）
        await new Promise(resolve => setTimeout(resolve, 100));
        this.initializeParticleDataInBox();
        
        // uniformsを初期化（一度だけ、メモリリーク防止）
        this.initializeUniforms();
    }
    
    /**
     * uniformsを初期化（一度だけ実行）
     */
    initializeUniforms() {
        if (!this.gpuParticleSystem) return;
        
        const positionUpdateMaterial = this.gpuParticleSystem.getPositionUpdateMaterial();
        if (positionUpdateMaterial && positionUpdateMaterial.uniforms) {
            // 必要なuniformsを一度だけ初期化
            if (!positionUpdateMaterial.uniforms.boxSize) {
                positionUpdateMaterial.uniforms.boxSize = { value: this.boxSize };
            }
            if (!positionUpdateMaterial.uniforms.deltaTime) {
                positionUpdateMaterial.uniforms.deltaTime = { value: 0.0 };
            }
            // ノイズパラメータ
            if (!positionUpdateMaterial.uniforms.noiseScale) {
                positionUpdateMaterial.uniforms.noiseScale = { value: this.noiseScale };
            }
            if (!positionUpdateMaterial.uniforms.noiseStrength) {
                positionUpdateMaterial.uniforms.noiseStrength = { value: this.noiseStrength };
            }
            // 力のパラメータ（トラック5用）
            if (!positionUpdateMaterial.uniforms.forcePoint) {
                positionUpdateMaterial.uniforms.forcePoint = { value: new THREE.Vector3(0, 0, 0) };
            }
            if (!positionUpdateMaterial.uniforms.forceStrength) {
                positionUpdateMaterial.uniforms.forceStrength = { value: 0.0 };
            }
            if (!positionUpdateMaterial.uniforms.forceRadius) {
                positionUpdateMaterial.uniforms.forceRadius = { value: this.forceRadius };
            }
        }
    }
    
    /**
     * カメラを設定
     */
    setupCamera() {
        this.camera.position.set(0, 0, 200);
        this.camera.lookAt(0, 0, 0);
    }
    
    /**
     * ライトを設定
     */
    setupLights() {
        // 環境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambientLight);
        
        // 指向性ライト
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        this.scene.add(directionalLight);
        this.directionalLight = directionalLight;
    }
    
    /**
     * ボックスを作成
     */
    createBox() {
        const boxGeometry = new THREE.BoxGeometry(this.boxSize, this.boxSize, this.boxSize);
        const boxMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            wireframe: true,
            transparent: true,
            opacity: 0.3
        });
        this.boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
        this.scene.add(this.boxMesh);
        
        // Boxの底面に地面メッシュを追加
        const halfBox = this.boxSize * 0.5;
        const floorGeometry = new THREE.PlaneGeometry(this.boxSize, this.boxSize);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0x666666,  // グレー
            roughness: 0.8,
            metalness: 0.2
        });
        this.floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        this.floorMesh.rotation.x = -Math.PI / 2;
        this.floorMesh.position.y = -halfBox;  // Boxの底面
        this.scene.add(this.floorMesh);
    }
    
    /**
     * カメラパーティクルの距離パラメータを設定
     */
    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 50;  // より小さく
        cameraParticle.maxDistance = 120;  // より小さく
    }
    
    /**
     * 更新処理
     */
    onUpdate(deltaTime) {
        this.time += deltaTime;
        
        if (this.gpuParticleSystem) {
            // uniformを更新（既存のuniformsの値のみ更新、新規作成はしない）
            const positionUpdateMaterial = this.gpuParticleSystem.getPositionUpdateMaterial();
            if (positionUpdateMaterial && positionUpdateMaterial.uniforms) {
                // 既存のuniformの値のみ更新（メモリリーク防止）
                if (positionUpdateMaterial.uniforms.time) {
                    positionUpdateMaterial.uniforms.time.value = this.time;
                }
                if (positionUpdateMaterial.uniforms.boxSize) {
                    positionUpdateMaterial.uniforms.boxSize.value = this.boxSize;
                }
                if (positionUpdateMaterial.uniforms.deltaTime) {
                    positionUpdateMaterial.uniforms.deltaTime.value = deltaTime;
                }
                // ノイズパラメータを更新
                if (positionUpdateMaterial.uniforms.noiseScale) {
                    positionUpdateMaterial.uniforms.noiseScale.value = this.noiseScale;
                }
                if (positionUpdateMaterial.uniforms.noiseStrength) {
                    positionUpdateMaterial.uniforms.noiseStrength.value = this.noiseStrength;
                }
                // 力のuniformを更新（トラック5用）
                if (positionUpdateMaterial.uniforms.forcePoint) {
                    positionUpdateMaterial.uniforms.forcePoint.value.copy(this.forcePoint);
                }
                if (positionUpdateMaterial.uniforms.forceStrength) {
                    positionUpdateMaterial.uniforms.forceStrength.value = this.forceStrength;
                }
                if (positionUpdateMaterial.uniforms.forceRadius) {
                    positionUpdateMaterial.uniforms.forceRadius.value = this.forceRadius;
                }
            }
            
            // パーティクルを更新
            this.gpuParticleSystem.update({
                time: this.time,
                deltaTime: deltaTime
            });
        }
    }
    
    /**
     * 描画処理
     */
    render() {
        // SceneBaseのrenderメソッドを呼ぶ
        super.render();
    }
    
    /**
     * 初期パーティクルデータを流体用に配置（水たまりのような初期配置）
     */
    initializeParticleDataInBox() {
        if (!this.gpuParticleSystem) return;
        
        const width = this.cols;
        const height = this.rows;
        const dataSize = width * height * 4;
        const positionData = new Float32Array(dataSize);
        const colorData = new Float32Array(dataSize);
        
        // 完全ランダムに配置（流体の初期配置）
        const halfBox = this.boxSize * 0.5;
        const fluidWidth = halfBox * 1.6;  // 流体の幅（ボックスの80%）
        const fluidDepth = halfBox * 1.6;  // 流体の奥行き（ボックスの80%）
        const fluidHeight = this.boxSize * 0.3;  // 流体の高さ（ボックスの30%）
        const fluidBottom = -halfBox;  // 流体の底
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4;
                
                // 複数のハッシュ関数で完全ランダムな値を生成
                const hash1 = (x * 73856093) ^ (y * 19349663);
                const hash2 = (x * 19349663) ^ (y * 73856093);
                const hash3 = (x * 83492791) ^ (y * 19834729);
                
                const randX = ((hash1 & 0x7fffffff) / 0x7fffffff);  // 0.0～1.0
                const randY = ((hash2 & 0x7fffffff) / 0x7fffffff);  // 0.0～1.0
                const randZ = ((hash3 & 0x7fffffff) / 0x7fffffff);  // 0.0～1.0
                
                // 完全ランダムに配置（矩形の領域内）
                const posX = (randX - 0.5) * fluidWidth;
                const posY = fluidBottom + randY * fluidHeight;
                const posZ = (randZ - 0.5) * fluidDepth;
                
                // デバッグ: 最初の数個のパーティクルの位置を確認
                if (x < 5 && y < 5) {
                    console.log(`Scene09: パーティクル[${x},${y}] 初期位置: (${posX.toFixed(2)}, ${posY.toFixed(2)}, ${posZ.toFixed(2)})`);
                }
                
                // 位置データ（x, y, z, unused）
                positionData[index] = posX;
                positionData[index + 1] = posY;
                positionData[index + 2] = posZ;
                positionData[index + 3] = 0.0;  // unused
                
                // 色データ（R: 速度X, G: 速度Y, B: 速度Z, A: 位置X）
                // 初期速度は0
                colorData[index] = 0.5;     // r (速度X = 0 → 0.5)
                colorData[index + 1] = 0.5; // g (速度Y = 0 → 0.5)
                colorData[index + 2] = 0.5; // b (速度Z = 0 → 0.5)
                colorData[index + 3] = Math.max(0.0, Math.min(1.0, (posX / 200.0) + 0.5)); // a (位置X)
            }
        }
        
        // テクスチャを作成してRenderTargetにコピー
        const positionTexture = new THREE.DataTexture(
            positionData,
            width,
            height,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        positionTexture.needsUpdate = true;
        
        const colorTexture = new THREE.DataTexture(
            colorData,
            width,
            height,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        colorTexture.needsUpdate = true;
        
        // RenderTargetにコピー
        console.log('Scene09: 初期データをRenderTargetにコピー開始');
        this.gpuParticleSystem.copyTextureToRenderTarget(positionTexture, this.gpuParticleSystem.positionRenderTargets[0]);
        this.gpuParticleSystem.copyTextureToRenderTarget(colorTexture, this.gpuParticleSystem.colorRenderTargets[0]);
        console.log('Scene09: 初期データをRenderTargetにコピー完了');
        
        // デバッグ: コピー後のデータを確認（最初の数個のパーティクル）
        // 注意: これは非同期なので、次のフレームで確認する必要がある
    }
    
    /**
     * リセット処理
     */
    reset() {
        if (this.gpuParticleSystem) {
            // パーティクルシステムを再初期化
            this.initializeParticleDataInBox();
        }
    }
    
    /**
     * トラック番号に応じたエフェクト処理
     */
    handleTrackNumber(trackNumber, message) {
        if (trackNumber === 5) {
            // Box内のランダムな位置を選ぶ
            const halfBox = this.boxSize * 0.5;
            this.forcePoint.set(
                (Math.random() - 0.5) * this.boxSize * 0.8,
                (Math.random() - 0.5) * this.boxSize * 0.8,
                (Math.random() - 0.5) * this.boxSize * 0.8
            );
            this.forceStrength = 1000.0;  // 力の強さ
            this.forceRadius = 60.0;  // 力の影響範囲
            
            // 力を一時的に適用（2000ms後にリセット）
            setTimeout(() => {
                this.forceStrength = 0.0;
            }, 2000);
        }
    }
}
