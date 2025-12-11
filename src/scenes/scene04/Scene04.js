/**
 * Scene04: 1000x1000のTerrain表示
 */

import { SceneBase } from '../SceneBase.js';
import { GPUParticleSystem } from '../../lib/GPUParticleSystem.js';
import { Scene04_PunchSphere } from './Scene04_PunchSphere.js';
import * as THREE from 'three';

export class Scene04 extends SceneBase {
    constructor(renderer, camera) {
        super(renderer, camera);
        this.title = 'mathym | drmsh';
        console.log('Scene04: コンストラクタ実行', this.title);
        
        // 表示設定
        this.SHOW_PARTICLES = true;
        this.SHOW_LINES = true;  // 線描画（オン）
        
        // グリッド設定（1000x1000の100万パーティクル）
        this.cols = 1000;
        this.rows = 1000;
        this.scl = 5;  // スケール
        this.w = this.cols * this.scl;  // 5000
        this.h = this.rows * this.scl;  // 5000
        
        // GPUパーティクルシステム
        this.gpuParticleSystem = null;
        
        // 線描画用
        this.lineSystem = null;
        
        // ノイズパラメータ
        this.noiseScale = 0.0001;  // 1/100に変更（0.0005 → 0.000005）
        this.noiseStrength = 0.75;
        this.time = 0.0;
        this.timeIncrement = 0.006;
        
        // ノイズシード
        this.noiseSeed = Math.random() * 10000.0;
        
        // ノイズオフセットテクスチャ
        this.noiseOffsetTexture = null;
        
        // 地形の回転角度（回転なし）
        this.terrainRotationX = 0;
        
        // 圧力（PunchSphere）のパラメータ
        this.punchSpheres = [];
        this.pendingSpheres = [];
        this.punchDecay = 0.92;
        
        // 力の発生範囲（Processing版と同じ、地面の範囲内）
        this.punchXMin = 0.2;
        this.punchXMax = 0.8;
        this.punchYMin = 0.2;
        this.punchYMax = 0.8;
        this.punchZMin = -300.0;
        this.punchZMax = -150.0;
        // 圧力を浅くする（強さを小さく）
        this.punchStrengthMin = 5.0;   // 10.0 → 5.0
        this.punchStrengthMax = 25.0;  // 60.0 → 25.0
        // 圧力の範囲を広くする（半径を大きく）
        this.punchRadiusMin = 600.0;   // 300.0 → 600.0
        this.punchRadiusMax = 1500.0;  // 800.0 → 1500.0
        
        // グループ
        this.sphereGroup = null;
        
        // テキスト表示用Canvas
        this.scopeCanvas = null;
        this.scopeCtx = null;
        
        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
        
        // トラック4（グリッチエフェクト）をオフにする
        this.trackEffects[4] = false;
    }
    
    async setup() {
        // 親クラスのsetup()を呼ぶ
        await super.setup();
        
        // カメラパーティクルの距離パラメータを再設定（親クラスで設定された後に上書き）
        if (this.cameraParticles) {
            for (const cameraParticle of this.cameraParticles) {
                this.setupCameraParticleDistance(cameraParticle);
            }
        }
        
        // 初期カメラを設定
        this.setupCamera();
        
        // ライトを追加
        this.setupLights();
        
        // GPUパーティクルシステムを初期化
        const particleCount = this.cols * this.rows;
        this.gpuParticleSystem = new GPUParticleSystem(
            this.renderer,
            particleCount,
            this.cols,
            this.rows,
            0,  // baseRadiusは使用しない（地形なので）
            'scene04'  // シェーダーパス
        );
        
        // シェーダーの読み込み完了を待つ
        await this.gpuParticleSystem.initPromise;
        console.log('Scene04: GPUParticleSystem初期化完了');
        
        // パーティクルシステムをシーンに追加
        const particleSystem = this.gpuParticleSystem.getParticleSystem();
        if (particleSystem) {
            particleSystem.visible = this.SHOW_PARTICLES;
            this.scene.add(particleSystem);
        
            // パーティクルマテリアルを透明にする（地形用）
            if (this.gpuParticleSystem.particleMaterial) {
                this.gpuParticleSystem.particleMaterial.transparent = true;
                this.gpuParticleSystem.particleMaterial.depthWrite = false;
            }
            
            // パーティクルサイズを大きくする（地形用）
            const sizeAttribute = this.gpuParticleSystem.particleGeometry.getAttribute('size');
            if (sizeAttribute) {
                const sizes = sizeAttribute.array;
                for (let i = 0; i < sizes.length; i++) {
                    sizes[i] = 10.0;  // 地形用にサイズを大きく（5.0 → 10.0）
                }
                sizeAttribute.needsUpdate = true;
            }
        }
        
        // パーティクル数を設定
        this.setParticleCount(particleCount);
        
        // 初期位置データを設定
        this.initializeParticleData();
        
        // 初期色を計算
        this.updateInitialColors();
        
        // グループを作成
        this.sphereGroup = new THREE.Group();
        this.scene.add(this.sphereGroup);
        
        // テキスト表示用Canvasを初期化
        this.scopeCanvas = document.createElement('canvas');
        this.scopeCanvas.width = window.innerWidth;
        this.scopeCanvas.height = window.innerHeight;
        this.scopeCanvas.style.position = 'absolute';
        this.scopeCanvas.style.top = '0';
        this.scopeCanvas.style.left = '0';
        this.scopeCanvas.style.pointerEvents = 'none';
        this.scopeCanvas.style.zIndex = '1000';
        this.scopeCtx = this.scopeCanvas.getContext('2d');
        this.scopeCtx.font = '14px monospace';
        this.scopeCtx.textAlign = 'center';
        this.scopeCtx.textBaseline = 'top';
        document.body.appendChild(this.scopeCanvas);
        
        // 線描画システムを作成
        this.createLineSystem();
    }
    
    /**
     * ライトを設定
     */
    setupLights() {
        // 環境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        // 指向性ライト
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1000, 2000, 1000);
            this.scene.add(directionalLight);
    }
    
    /**
     * 初期パーティクルデータを設定（グリッド状に配置）
     */
    initializeParticleData() {
        if (!this.gpuParticleSystem) return;
        
        const width = this.cols;
        const height = this.rows;
        const dataSize = width * height * 4;
        const positionData = new Float32Array(dataSize);
        const colorData = new Float32Array(dataSize);
        const noiseOffsetData = new Float32Array(dataSize);
        
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const index = (y * width + x) * 4;
                    // 地形の中心を画面の中心（0, 0, 0）に合わせる
                    const px = (x - width / 2) * this.scl;
                    const py = (y - height / 2) * this.scl;
                
                // ノイズオフセットデータ（更新時用、各パーティクルで異なる値）
                const noiseOffsetX = Math.random() * 10000.0;
                const noiseOffsetY = Math.random() * 10000.0;
                const noiseOffsetZ = Math.random() * 10000.0;
                
                // 初期化時のZ値をノイズで計算
                // noiseScaleを使うように変更（0.1は元のnoiseScale=0.0005の時の値）
                // 0.1 / 0.0005 = 200 なので、noiseScale * 200で元のスケールを維持
                const noiseX = x * this.noiseScale * 200.0;
                const noiseY = y * this.noiseScale * 200.0;
                const pz = this.map(this.noise(noiseX, noiseY), 0, 1, -100, 100);
                
                // 位置データ（基準位置のZをwに保存）
                positionData[index] = px;
                positionData[index + 1] = py;
                positionData[index + 2] = pz;
                positionData[index + 3] = pz;  // 基準位置のZ
                
                // 色データ（初期色、明るくする）
                colorData[index] = 0.8;  // 0.5 → 0.8（明るく）
                colorData[index + 1] = 0.8;  // 0.5 → 0.8（明るく）
                colorData[index + 2] = 0.8;  // 0.5 → 0.8（明るく）
                colorData[index + 3] = 1.0;
                
                // ノイズオフセットデータを保存
                noiseOffsetData[index] = noiseOffsetX;
                noiseOffsetData[index + 1] = noiseOffsetY;
                noiseOffsetData[index + 2] = noiseOffsetZ;
                noiseOffsetData[index + 3] = 0.0;
            }
        }
        
        // RenderTargetにデータを書き込む
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
        
        // ノイズオフセットテクスチャを作成
        this.noiseOffsetTexture = new THREE.DataTexture(
            noiseOffsetData,
            width,
            height,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        this.noiseOffsetTexture.needsUpdate = true;
        
        // RenderTargetにコピー
        this.gpuParticleSystem.copyTextureToRenderTarget(positionTexture, this.gpuParticleSystem.positionRenderTargets[0]);
        this.gpuParticleSystem.copyTextureToRenderTarget(colorTexture, this.gpuParticleSystem.colorRenderTargets[0]);
    }
    
    /**
     * 初期色を計算（色更新シェーダーを実行）
     */
    updateInitialColors() {
        if (!this.gpuParticleSystem) return;
        
        // 色更新用シェーダーにuniformを設定
        const colorUpdateMaterial = this.gpuParticleSystem.colorUpdateMaterial;
        if (colorUpdateMaterial && colorUpdateMaterial.uniforms) {
            // もっとガッツリ凹ませるので、Zオフセットの範囲も拡大
            if (!colorUpdateMaterial.uniforms.minZOffset) {
                colorUpdateMaterial.uniforms.minZOffset = { value: -200.0 };  // ヒートマップを敏感に（-500.0 → -200.0）
            } else {
                colorUpdateMaterial.uniforms.minZOffset.value = -200.0;
            }
            if (!colorUpdateMaterial.uniforms.maxZOffset) {
                colorUpdateMaterial.uniforms.maxZOffset = { value: 200.0 };  // ヒートマップを敏感に（500.0 → 200.0）
            } else {
                colorUpdateMaterial.uniforms.maxZOffset.value = 200.0;
            }
            
            // 位置テクスチャを設定
            if (this.gpuParticleSystem.positionRenderTargets && this.gpuParticleSystem.positionRenderTargets[0]) {
                colorUpdateMaterial.uniforms.positionTexture.value = this.gpuParticleSystem.positionRenderTargets[0].texture;
            }
        }
        
        // 色更新シェーダーを実行
        if (colorUpdateMaterial && this.gpuParticleSystem.colorRenderTargets && this.gpuParticleSystem.colorRenderTargets[0]) {
            this.gpuParticleSystem.positionUpdateMesh.visible = false;
            this.gpuParticleSystem.colorUpdateMesh.visible = true;
            
            this.renderer.setRenderTarget(this.gpuParticleSystem.colorRenderTargets[0]);
            this.renderer.render(this.gpuParticleSystem.updateScene, this.gpuParticleSystem.updateCamera);
            this.renderer.setRenderTarget(null);
            
            // 描画用シェーダーにテクスチャを設定
            if (this.gpuParticleSystem.particleMaterial && this.gpuParticleSystem.particleMaterial.uniforms) {
                if (this.gpuParticleSystem.particleMaterial.uniforms.colorTexture) {
                    this.gpuParticleSystem.particleMaterial.uniforms.colorTexture.value = this.gpuParticleSystem.colorRenderTargets[0].texture;
                }
            }
        }
    }
    
    /**
     * カメラパーティクルの距離パラメータを設定（Scene07と同じ画角にする）
     */
    setupCameraParticleDistance(cameraParticle) {
        // Scene07と同じ設定で斜めから見下ろす角度にする
        cameraParticle.minDistance = 4000.0;
        cameraParticle.maxDistance = 8000.0;
        cameraParticle.maxDistanceReset = 6000.0;
        
        // カメラの移動範囲を設定（Scene07と同じ）
        const cameraBoxSize = 6000.0;
        const cameraMinY = 1000.0;  // 斜めから見下ろすためにY座標を高めに
        const cameraMaxY = 3000.0;
        cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSize, cameraMinY, -cameraBoxSize);
        cameraParticle.boxMax = new THREE.Vector3(cameraBoxSize, cameraMaxY, cameraBoxSize);
    }
    
    /**
     * 簡易パーリンノイズ関数（Processingのnoise()に近い実装）
     */
    noise(x, y = 0, z = 0) {
        // より良いハッシュ関数（周期的にならないように改善）
        const hash = (ix, iy, iz) => {
            const seed = Math.floor(this.noiseSeed);
            // Processingのnoise()に近いハッシュ関数
            // より大きな素数を使うことで周期性を減らす
            // JavaScriptで安全に動作するように、ビット演算を避ける
            let n = ix * 73856093.0;
            n = n + iy * 19349663.0;
            n = n + iz * 83492791.0;
            n = n + seed * 1103515245.0;
            // フラクショナル部分を返す（0.0-1.0の範囲）
            // より良いハッシュ関数（周期的にならないように）
            // 複数のsin()を組み合わせて、よりランダムな値を生成
            const sin1 = Math.sin(n) * 43758.5453;
            const sin2 = Math.sin(n * 0.5) * 12345.6789;
            const sin3 = Math.sin(n * 0.25) * 98765.4321;
            const combined = (sin1 + sin2 + sin3) % 1.0;
            return Math.abs(combined);
        };
        
        const iX = Math.floor(x);
        const iY = Math.floor(y);
        const iZ = Math.floor(z);
        const fX = x - iX;
        const fY = y - iY;
        const fZ = z - iZ;
        
        const u = fX * fX * (3.0 - 2.0 * fX);
        const v = fY * fY * (3.0 - 2.0 * fY);
        const w = fZ * fZ * (3.0 - 2.0 * fZ);
        
        const a = hash(iX, iY, iZ);
        const b = hash(iX + 1, iY, iZ);
        const c = hash(iX, iY + 1, iZ);
        const d = hash(iX + 1, iY + 1, iZ);
        const e = hash(iX, iY, iZ + 1);
        const f = hash(iX + 1, iY, iZ + 1);
        const g = hash(iX, iY + 1, iZ + 1);
        const h = hash(iX + 1, iY + 1, iZ + 1);
        
        const x1 = a + (b - a) * u;
        const x2 = c + (d - c) * u;
        const y1 = x1 + (x2 - x1) * v;
        
        const x3 = e + (f - e) * u;
        const x4 = g + (h - g) * u;
        const y2 = x3 + (x4 - x3) * v;
        
        return y1 + (y2 - y1) * w;
    }
    
    /**
     * map関数（Processingと同じ）
     */
    map(value, start1, stop1, start2, stop2) {
        return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
    }
    
    /**
     * 更新処理
     */
    onUpdate(deltaTime) {
        // 時間を更新
        this.time += this.timeIncrement;
        
        // キューからsphereを追加
        this.processPendingSpheres();
        
        // すべてのsphereを更新
        this.updatePunchSpheres();
        
        // GPUパーティクルシステムの更新
        if (this.gpuParticleSystem) {
            const positionUpdateMaterial = this.gpuParticleSystem.getPositionUpdateMaterial();
            if (positionUpdateMaterial && positionUpdateMaterial.uniforms) {
                // Scene04専用のuniformを設定
                if (!positionUpdateMaterial.uniforms.scl) {
                    positionUpdateMaterial.uniforms.scl = { value: this.scl };
                } else {
                    positionUpdateMaterial.uniforms.scl.value = this.scl;
                }
                // ノイズオフセットテクスチャを設定
                if (!positionUpdateMaterial.uniforms.noiseOffsetTexture) {
                    positionUpdateMaterial.uniforms.noiseOffsetTexture = { value: this.noiseOffsetTexture };
                } else {
                    positionUpdateMaterial.uniforms.noiseOffsetTexture.value = this.noiseOffsetTexture;
                }
                // 地形のオフセットを設定（地形の中心を画面の中心（0, 0, 0）に合わせたので、オフセットは0）
                if (!positionUpdateMaterial.uniforms.terrainOffset) {
                    positionUpdateMaterial.uniforms.terrainOffset = { 
                        value: new THREE.Vector3(0, 0, 0) 
                    };
                } else {
                    positionUpdateMaterial.uniforms.terrainOffset.value.set(0, 0, 0);
                }
                
                // 圧力用のuniformを設定
                const maxSpheres = 10;
                const activeSpheres = this.punchSpheres.filter(ps => {
                    const strength = ps.getStrength();
                    return strength > 0.01;
                }).slice(0, maxSpheres);
                
                // デバッグ: activeSpheresの数を確認（毎回ログ出力）
                if (this.punchSpheres.length > 0) {
                    console.log(`onUpdate: activeSpheres.length: ${activeSpheres.length}, total punchSpheres: ${this.punchSpheres.length}`);
                    if (activeSpheres.length > 0) {
                        activeSpheres.forEach((ps, idx) => {
                            console.log(`  activeSphere #${idx + 1}: strength=${ps.getStrength().toFixed(2)}, radius=${ps.getRadius().toFixed(2)}, pos=(${ps.getPosition().x.toFixed(1)}, ${ps.getPosition().y.toFixed(1)}, ${ps.getPosition().z.toFixed(1)})`);
                        });
                    } else {
                        // activeSpheresが空の場合、strengthを確認
                        console.log(`  No active spheres! Checking strengths:`);
                        this.punchSpheres.slice(0, 5).forEach((ps, idx) => {
                            console.log(`    punchSphere #${idx + 1}: strength=${ps.getStrength().toFixed(4)}, radius=${ps.getRadius().toFixed(2)}`);
                        });
                    }
                }
                
                if (!positionUpdateMaterial.uniforms.punchSphereCount) {
                    positionUpdateMaterial.uniforms.punchSphereCount = { value: 0 };
                }
                if (!positionUpdateMaterial.uniforms.punchSphereCenters) {
                    // vec3の配列をFloat32Arrayで表現（x, y, z, x, y, z, ...）
                    positionUpdateMaterial.uniforms.punchSphereCenters = { 
                        value: new Float32Array(maxSpheres * 3)
                    };
                }
                if (!positionUpdateMaterial.uniforms.punchSphereStrengths) {
                    positionUpdateMaterial.uniforms.punchSphereStrengths = { value: new Float32Array(maxSpheres) };
                }
                if (!positionUpdateMaterial.uniforms.punchSphereRadii) {
                    positionUpdateMaterial.uniforms.punchSphereRadii = { value: new Float32Array(maxSpheres) };
                }
                if (!positionUpdateMaterial.uniforms.punchSphereReturnProbs) {
                    positionUpdateMaterial.uniforms.punchSphereReturnProbs = { value: new Float32Array(maxSpheres) };
                }
                
                positionUpdateMaterial.uniforms.punchSphereCount.value = activeSpheres.length;
                
                const centers = positionUpdateMaterial.uniforms.punchSphereCenters.value;
                const strengths = positionUpdateMaterial.uniforms.punchSphereStrengths.value;
                const radii = positionUpdateMaterial.uniforms.punchSphereRadii.value;
                const returnProbs = positionUpdateMaterial.uniforms.punchSphereReturnProbs.value;
                
                for (let i = 0; i < maxSpheres; i++) {
                    if (i < activeSpheres.length) {
                        const ps = activeSpheres[i];
                        const pos = ps.getPosition();  // 位置を取得（更新された位置）
                        // パーティクルの位置は地形のオフセット（-w/2, -h/2, 0）を考慮しているので、
                        // sphereの位置も同じ座標系で渡す（既に地形の座標系で計算されているのでそのまま）
                        // Float32Arrayにx, y, zを順番に格納
                        centers[i * 3] = pos.x;
                        centers[i * 3 + 1] = pos.y;
                        centers[i * 3 + 2] = pos.z;
                        strengths[i] = ps.getStrength();
                        radii[i] = ps.getRadius();
                        returnProbs[i] = ps.getReturnProbability();
                        
                        // デバッグ: 最初のsphereのみログ出力
                        if (i === 0 && Math.random() < 0.01) {
                            console.log(`Setting uniform for sphere #${i + 1}:`, {
                                center: `(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`,
                                strength: strengths[i].toFixed(2),
                                radius: radii[i].toFixed(2)
                            });
                        }
                    } else {
                        centers[i * 3] = 0;
                        centers[i * 3 + 1] = 0;
                        centers[i * 3 + 2] = 0;
                        strengths[i] = 0;
                        radii[i] = 0;
                        returnProbs[i] = 0;
                    }
                }
                
                // uniformの更新を確実にする
                if (positionUpdateMaterial.uniforms.punchSphereCenters) {
                    positionUpdateMaterial.uniforms.punchSphereCenters.needsUpdate = true;
                }
                if (positionUpdateMaterial.uniforms.punchSphereStrengths) {
                    positionUpdateMaterial.uniforms.punchSphereStrengths.needsUpdate = true;
                }
                if (positionUpdateMaterial.uniforms.punchSphereRadii) {
                    positionUpdateMaterial.uniforms.punchSphereRadii.needsUpdate = true;
                }
                if (positionUpdateMaterial.uniforms.punchSphereReturnProbs) {
                    positionUpdateMaterial.uniforms.punchSphereReturnProbs.needsUpdate = true;
                }
            }
            
            // 色更新用シェーダーにuniformを設定
            const colorUpdateMaterial = this.gpuParticleSystem.colorUpdateMaterial;
            if (colorUpdateMaterial && colorUpdateMaterial.uniforms) {
                // もっとガッツリ凹ませるので、Zオフセットの範囲も拡大
                if (!colorUpdateMaterial.uniforms.minZOffset) {
                    colorUpdateMaterial.uniforms.minZOffset = { value: -500.0 };  // -120.0 → -500.0
                } else {
                    colorUpdateMaterial.uniforms.minZOffset.value = -500.0;
                }
                if (!colorUpdateMaterial.uniforms.maxZOffset) {
                    colorUpdateMaterial.uniforms.maxZOffset = { value: 500.0 };  // 120.0 → 500.0
                } else {
                    colorUpdateMaterial.uniforms.maxZOffset.value = 500.0;
                }
            }
            
            // GPUParticleSystemの基本更新
            this.gpuParticleSystem.update({
                time: this.time,
                noiseScale: this.noiseScale,
                noiseStrength: this.noiseStrength,
                baseRadius: 0
            });
        }
        
        // 線描画の更新（SHOW_LINESがtrueの場合のみ）
        if (this.SHOW_LINES && this.lineSystem && this.gpuParticleSystem) {
            this.updateLineSystem();
        }
        
        // テキスト表示用Canvasをクリア（drawText()の前にクリアしない）
        // テキストはdrawText()内で描画されるので、ここではクリアしない
        // if (this.scopeCtx) {
        //     this.scopeCtx.clearRect(0, 0, this.scopeCanvas.width, this.scopeCanvas.height);
        // }
    }
    
    /**
     * 描画処理
     */
    render() {
        // カメラを設定
        this.setupCamera();
        
        // 地形の位置を設定（回転なし）
        if (this.gpuParticleSystem) {
            const particleSystem = this.gpuParticleSystem.getParticleSystem();
            if (particleSystem) {
                particleSystem.visible = this.SHOW_PARTICLES;
                particleSystem.rotation.x = 0;  // 回転なし
                // 地形の中心を画面の中心（0, 0, 0）に合わせたので、パーティクルシステムの位置も0
                particleSystem.position.set(0, 0, 0);
            }
        }
        
        // テキスト表示用Canvasをクリア（すべてのテキストを描画する前にクリア）
        if (this.scopeCtx && this.scopeCanvas) {
            this.scopeCtx.clearRect(0, 0, this.scopeCanvas.width, this.scopeCanvas.height);
        }
        
        // sphereを描画
        this.drawPunchSpheres();
        
        // SceneBaseのrenderメソッドを使用（カメラデバッグも含む）
        super.render();
        
        // すべてのsphereのテキストを描画（エフェクト適用後）
        this.punchSpheres.forEach(ps => {
            ps.drawText(this.camera);
        });
    }
    
    /**
     * 線描画システムを作成
     */
    createLineSystem() {
        if (!this.SHOW_LINES) return;
        
        // シェーダーを読み込む（非同期）
        const shaderBasePath = `/shaders/scene04/`;
        Promise.all([
            fetch(`${shaderBasePath}lineRender.vert`).then(r => r.text()),
            fetch(`${shaderBasePath}lineRender.frag`).then(r => r.text())
        ]).then(([vertexShader, fragmentShader]) => {
            this.createLineSystemWithShaders(vertexShader, fragmentShader);
        }).catch(err => {
            console.error('線描画シェーダーの読み込みに失敗:', err);
        });
    }
    
    /**
     * シェーダーを使って線描画システムを作成
     */
    createLineSystemWithShaders(vertexShader, fragmentShader) {
        const lineGeometries = [];
        const lineMaterials = [];
        
        // 縦線：各行ごとに、左右の列を結ぶ線
        for (let y = 0; y < this.rows - 1; y++) {
            const vertexCount = this.cols * 2;
            const rowIndices = new Float32Array(vertexCount);
            const colIndices = new Float32Array(vertexCount);
            
            for (let x = 0; x < this.cols; x++) {
                const index = x * 2;
                rowIndices[index] = y;
                colIndices[index] = x;
                rowIndices[index + 1] = y + 1;
                colIndices[index + 1] = x;
            }
            
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(vertexCount * 3);
            const colors = new Float32Array(vertexCount * 3);
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            geometry.setAttribute('rowIndex', new THREE.BufferAttribute(rowIndices, 1));
            geometry.setAttribute('colIndex', new THREE.BufferAttribute(colIndices, 1));
            
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    positionTexture: { value: null },
                    colorTexture: { value: null },
                    width: { value: this.cols },
                    height: { value: this.rows }
                },
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                transparent: true,
                vertexColors: true,
                linewidth: 1
            });
            
            lineGeometries.push(geometry);
            lineMaterials.push(material);
        }
        
        // 横線：各列ごとに、上下の行を結ぶ線
        for (let x = 0; x < this.cols - 1; x++) {
            const vertexCount = this.rows * 2;
            const rowIndices = new Float32Array(vertexCount);
            const colIndices = new Float32Array(vertexCount);
            
            for (let y = 0; y < this.rows; y++) {
                const index = y * 2;
                rowIndices[index] = y;
                colIndices[index] = x;
                rowIndices[index + 1] = y;
                colIndices[index + 1] = x + 1;
            }
            
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(vertexCount * 3);
            const colors = new Float32Array(vertexCount * 3);
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            geometry.setAttribute('rowIndex', new THREE.BufferAttribute(rowIndices, 1));
            geometry.setAttribute('colIndex', new THREE.BufferAttribute(colIndices, 1));
            
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    positionTexture: { value: null },
                    colorTexture: { value: null },
                    width: { value: this.cols },
                    height: { value: this.rows }
                },
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                transparent: true,
                vertexColors: true,
                linewidth: 1
            });
            
            lineGeometries.push(geometry);
            lineMaterials.push(material);
        }
        
        // すべての線を1つのグループとして管理
        this.lineSystem = new THREE.Group();
        for (let i = 0; i < lineGeometries.length; i++) {
            const line = new THREE.LineSegments(lineGeometries[i], lineMaterials[i]);
            this.lineSystem.add(line);
        }
        
        this.scene.add(this.lineSystem);
    }
    
    /**
     * 線描画システムを更新
     */
    updateLineSystem() {
        if (!this.lineSystem || !this.gpuParticleSystem) return;
        
        const positionTexture = this.gpuParticleSystem.getPositionTexture();
        const colorTexture = this.gpuParticleSystem.getColorTexture ? 
            this.gpuParticleSystem.getColorTexture() : null;
        
        if (!positionTexture || !colorTexture) return;
        
        // 各線のマテリアルにテクスチャを設定
        this.lineSystem.children.forEach(line => {
            if (line.material && line.material.uniforms) {
                line.material.uniforms.positionTexture.value = positionTexture;
                line.material.uniforms.colorTexture.value = colorTexture;
            }
        });
    }
    
    /**
     * カメラデバッグの中心位置を取得（SceneBaseで使用）
     */
    getCameraDebugCenter() {
        // 地形の中心位置を返す（地形の中心を画面の中心（0, 0, 0）に合わせた）
        return new THREE.Vector3(0, 0, 0);
    }
    
    /**
     * カメラを設定
     */
    setupCamera() {
        const eye = this.cameraParticles[this.currentCameraIndex].getPosition();
        // 地形の中心位置（地形の中心を画面の中心（0, 0, 0）に合わせた）
        const terrainCenter = new THREE.Vector3(0, 0, 0);
        const up = new THREE.Vector3(0, 1, 0);
        
        this.camera.position.copy(eye);
        this.camera.lookAt(terrainCenter);
        this.camera.up.copy(up);
    }
    
    /**
     * キューからsphereを追加
     */
    processPendingSpheres() {
        if (this.pendingSpheres.length > 0) {
            console.log(`processPendingSpheres: Processing ${this.pendingSpheres.length} pending spheres`);
            this.pendingSpheres.forEach((ps, index) => {
                ps.createThreeObjects(this.scene, this.sphereGroup, this.scene, this.terrainRotationX);
                ps.initScopeCanvas(this.scopeCanvas, this.scopeCtx);
                this.punchSpheres.push(ps);
                console.log(`  Processed sphere #${index + 1}, total punchSpheres: ${this.punchSpheres.length}`);
            });
            this.pendingSpheres = [];
        }
    }
    
    /**
     * すべてのsphereを更新
     */
    updatePunchSpheres() {
        // ノイズ関数とmap関数を渡して、地形のZ位置を計算
        // 赤いSphereは永続的に残す（削除しない）
        this.punchSpheres.forEach(ps => {
            ps.update(
                (x, y) => this.noise(x, y),  // ノイズ関数
                (value, start1, stop1, start2, stop2) => this.map(value, start1, stop1, start2, stop2),  // map関数
                this.noiseScale,  // ノイズスケール
                this.cols,  // 列数
                this.rows,  // 行数
                this.scl    // スケール
            );
            ps.updateThreeObjects();
            ps.drawText(this.camera);
        });
    }
    
    /**
     * sphereを描画
     */
    drawPunchSpheres() {
        // updateThreeObjects()で既に描画されているので、ここでは何もしない
    }
    
    /**
     * 力を発生させる（単純に地面のどこかにランダムで圧力を掛ける）
     */
    updatePunchForces(forceTrigger = false) {
        console.log(`updatePunchForces called with forceTrigger: ${forceTrigger}`);
        if (forceTrigger) {
            // 地面の範囲内にランダムで発生（地形の中心を画面の中心（0, 0, 0）に合わせた）
            // 地形の実際の範囲: (-w/2, -h/2) から (w/2, h/2)
            const terrainMinX = -this.w / 2;
            const terrainMaxX = this.w / 2;
            const terrainMinY = -this.h / 2;
            const terrainMaxY = this.h / 2;
            
            // punchXMin/Max, punchYMin/Maxは0.0〜1.0の範囲で指定されているので、地形の範囲に変換
            const punchX = THREE.MathUtils.randFloat(
                terrainMinX + (terrainMaxX - terrainMinX) * this.punchXMin,
                terrainMinX + (terrainMaxX - terrainMinX) * this.punchXMax
            );
            const punchY = THREE.MathUtils.randFloat(
                terrainMinY + (terrainMaxY - terrainMinY) * this.punchYMin,
                terrainMinY + (terrainMaxY - terrainMinY) * this.punchYMax
            );
            
            // Zは地形の高さを計算（その位置のパーティクルのZ位置を取得）
            // 地形の中心を画面の中心（0, 0, 0）に合わせたので、グリッド座標を計算
            const gridX = Math.floor((punchX - terrainMinX) / this.scl);
            const gridY = Math.floor((punchY - terrainMinY) / this.scl);
            const clampedGridX = Math.max(0, Math.min(this.cols - 1, gridX));
            const clampedGridY = Math.max(0, Math.min(this.rows - 1, gridY));
            
            // その位置のノイズ値を計算してZ位置を取得
            const noiseX = clampedGridX * this.noiseScale * 200.0;
            const noiseY = clampedGridY * this.noiseScale * 200.0;
            const punchZ = this.map(this.noise(noiseX, noiseY), 0, 1, -100, 100);
            
            const punchStrength = THREE.MathUtils.randFloat(this.punchStrengthMin, this.punchStrengthMax);
            const punchRadius = THREE.MathUtils.randFloat(this.punchRadiusMin, this.punchRadiusMax);
            const punchReturnProbability = Math.random();
            
            console.log(`Creating punch sphere at (${punchX.toFixed(1)}, ${punchY.toFixed(1)}, ${punchZ.toFixed(1)}), strength: ${punchStrength.toFixed(1)}, radius: ${punchRadius.toFixed(1)}`);
            console.log(`  pendingSpheres.length before: ${this.pendingSpheres.length}`);
            
            this.createPunchSphere(punchX, punchY, punchZ, punchStrength, punchRadius, punchReturnProbability);
            
            console.log(`  pendingSpheres.length after: ${this.pendingSpheres.length}`);
        } else {
            console.log(`updatePunchForces: forceTrigger is false, skipping`);
        }
    }
    
    /**
     * sphereを作成
     */
    createPunchSphere(x, y, z, strength, radius, returnProbability) {
        const punchCenter = new THREE.Vector3(x, y, z);
        const sphere = new Scene04_PunchSphere(punchCenter, strength, radius, returnProbability);
        this.pendingSpheres.push(sphere);
        console.log(`createPunchSphere: Added sphere to pendingSpheres, total: ${this.pendingSpheres.length}`);
    }
    
    /**
     * OSCメッセージの処理
     */
    handleTrackNumber(trackNumber, message) {
        // トラック1: カメラをランダムに切り替える
        if (trackNumber === 1) {
            this.switchCameraRandom();
        }
        // トラック2: 背景を白にする（親クラスで処理）
        // トラック5: 力の発生
        else if (trackNumber === 5) {
            this.updatePunchForces(true);
        }
    }
    
    /**
     * キーダウン処理
     */
    handleKeyDown(trackNumber) {
        super.handleKeyDown(trackNumber);
        
        // トラック5: 力の発生（handleTrackNumberでも呼ばれるので、ここでは何もしない）
        // if (trackNumber === 5) {
        //     this.updatePunchForces(true);
        // }
    }
    
    
    // switchCameraRandom()は基底クラスの実装を使用（8個全部のカメラをランダマイズ）
    
    /**
     * リセット処理
     */
    reset() {
        super.reset(); // TIMEをリセット
        // 初期パーティクルデータを再設定
        this.initializeParticleData();
        
        // すべてのカメラパーティクルをリセット
        this.cameraParticles.forEach(cp => cp.reset());
        this.currentCameraIndex = 0;
        
        // すべてのsphereをクリア
        this.punchSpheres.forEach(ps => ps.dispose(this.scene, this.sphereGroup));
        this.punchSpheres = [];
        this.pendingSpheres = [];
        
        // グループをクリア（既存のCircleも削除）
        if (this.sphereGroup) {
            // 既存のオブジェクトをすべて削除
            while (this.sphereGroup.children.length > 0) {
                const child = this.sphereGroup.children[0];
                this.sphereGroup.remove(child);
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            }
        }
        
        // シーンから直接Circleを削除（念のため）
        if (this.scene) {
            const objectsToRemove = [];
            this.scene.traverse((object) => {
                if (object.userData && object.userData.isPunchSphereCircle) {
                    objectsToRemove.push(object);
                }
            });
            objectsToRemove.forEach(obj => {
                this.scene.remove(obj);
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            });
        }
        
        // テキスト表示用Canvasをクリア
        if (this.scopeCtx && this.scopeCanvas) {
            this.scopeCtx.clearRect(0, 0, this.scopeCanvas.width, this.scopeCanvas.height);
        }
        
        console.log('Scene04 reset');
    }
    
    /**
     * リサイズ処理
     */
    onResize() {
        super.onResize();
        
        if (this.scopeCanvas) {
            this.scopeCanvas.width = window.innerWidth;
            this.scopeCanvas.height = window.innerHeight;
        }
    }
    
    /**
     * クリーンアップ処理（シーン切り替え時に呼ばれる）
     */
    dispose() {
        console.log('Scene04.dispose: クリーンアップ開始');
        
        // GPUパーティクルシステムを破棄
        if (this.gpuParticleSystem) {
            const particleSystem = this.gpuParticleSystem.getParticleSystem();
            if (particleSystem) {
                this.scene.remove(particleSystem);
            }
            this.gpuParticleSystem.dispose();
            this.gpuParticleSystem = null;
        }
        
        // 線描画システムを破棄
        if (this.lineSystem) {
            this.lineSystem.children.forEach(line => {
                if (line.geometry) line.geometry.dispose();
                if (line.material) line.material.dispose();
            });
            this.scene.remove(this.lineSystem);
            this.lineSystem = null;
        }
        
        // すべてのsphereを破棄
        this.punchSpheres.forEach(ps => {
            if (ps.dispose) {
                ps.dispose(this.scene, this.sphereGroup);
            }
        });
        this.punchSpheres = [];
        this.pendingSpheres = [];
        
        // グループをクリア
        if (this.sphereGroup) {
            while (this.sphereGroup.children.length > 0) {
                const child = this.sphereGroup.children[0];
                this.sphereGroup.remove(child);
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            }
            this.scene.remove(this.sphereGroup);
            this.sphereGroup = null;
        }
        
        // テキスト表示用Canvasを削除
        if (this.scopeCanvas && this.scopeCanvas.parentElement) {
            this.scopeCanvas.parentElement.removeChild(this.scopeCanvas);
            this.scopeCanvas = null;
            this.scopeCtx = null;
        }
        
        // ノイズオフセットテクスチャを破棄
        if (this.noiseOffsetTexture) {
            this.noiseOffsetTexture.dispose();
            this.noiseOffsetTexture = null;
        }
        
        // すべてのライトを削除
        const lightsToRemove = [];
        this.scene.traverse((object) => {
            if (object instanceof THREE.Light) {
                lightsToRemove.push(object);
            }
        });
        lightsToRemove.forEach(light => {
            this.scene.remove(light);
            if (light.dispose) {
                light.dispose();
            }
        });
        
        console.log('Scene04.dispose: クリーンアップ完了');
        
        // 親クラスのdisposeを呼ぶ
        super.dispose();
    }
}
