/**
 * Scene05: シンプルなGPUパーティクル
 * Scene01を参考にしたシンプルな実装
 */

import { SceneBase } from '../SceneBase.js';
import { GPUParticleSystem } from '../../lib/GPUParticleSystem.js';
import * as THREE from 'three';

export class Scene05 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'mathym | Scene05';
        this.sceneNumber = 5;
        
        // 共有リソースマネージャー
        this.sharedResourceManager = sharedResourceManager;
        this.useSharedResources = !!sharedResourceManager;
        
        // 表示設定（デフォルトでパーティクルを表示）
        this.SHOW_PARTICLES = true;
        this.SHOW_LINES = false;
        
        // グリッドパラメータ（150万パーティクル）
        this.cols = 1500;
        this.rows = 1000;
        
        // 球体パラメータ
        this.baseRadius = 400.0;
        
        // 円配置パラメータ
        this.circleRadius = 400.0;
        this.circleThickness = 20.0;
        this.minLifetime = 20.0;
        this.maxLifetime = 60.0;
        
        // ノイズパラメータ
        this.noiseScale = 1.0;
        this.noiseStrength = 50.0;  // 元に戻す
        this.time = 0.0;
        this.timeIncrement = 0.001;  // 元に戻す
        this.curlNoiseSpeed = 3.0;  // カールノイズのスピード倍率
        this.baseCurlNoiseSpeed = 3.0;  // ベーススピード
        this.track5SpeedMultiplier = 1.0;  // トラック5のスピード倍率
        this.track5EndTime = 0;  // トラック5のサスティン終了時刻
        
        // 時間経過管理
        this.sketchStartTime = Date.now();
        this.fadeInDuration = 30000.0;  // 30秒
        
        // GPUパーティクルシステム
        this.gpuParticleSystem = null;
        
        // 線描画用
        this.lineSystem = null;
        
        // 背景グラデーション
        this.backgroundGradientMesh = null;
        
        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
    }
    
    /**
     * セットアップ処理（シーン切り替え時に呼ばれる）
     */
    async setup() {
        // 親クラスのsetup()を呼ぶ（ColorInversionの初期化を含む）
        await super.setup();
        
        // カメラパーティクルの距離パラメータを再設定
        if (this.cameraParticles) {
            for (const cameraParticle of this.cameraParticles) {
                this.setupCameraParticleDistance(cameraParticle);
            }
        }
        
        // GPUパーティクルシステムを初期化
        const particleCount = this.cols * this.rows;
        
        if (this.useSharedResources && this.sharedResourceManager) {
            // 共有リソースから取得（既に初期化済み）
            this.gpuParticleSystem = this.sharedResourceManager.getGPUParticleSystem('scene05');
            console.log('[Scene05] 共有リソースからGPUパーティクルシステムを取得');
            
            // パーティクルシステムのローテーションXを90度に設定
            const particleSystem = this.gpuParticleSystem.getParticleSystem();
            if (particleSystem) {
                particleSystem.rotation.x = Math.PI / 2.0;
            }
        } else {
            // 通常通り新規作成
            this.gpuParticleSystem = new GPUParticleSystem(
                this.renderer,
                particleCount,
                this.cols,
                this.rows,
                this.baseRadius,
                'scene05',  // scene05専用のシェーダーを使用
                6.0,  // particleSize（大きく）
                'circle',  // placementType: 円配置
                {
                    circleRadius: this.circleRadius,
                    circleThickness: this.circleThickness,
                    minLifetime: this.minLifetime,
                    maxLifetime: this.maxLifetime
                }
            );
            
            // シェーダーの読み込み完了を待つ
            await this.gpuParticleSystem.initPromise;
        }
        
        // パーティクルシステムをシーンに追加
        const particleSystem = this.gpuParticleSystem.getParticleSystem();
        if (particleSystem) {
            // パーティクルシステムのローテーションXを90度に設定（カメラ真正面から見て円になるように）
            particleSystem.rotation.x = Math.PI / 2.0;
            this.scene.add(particleSystem);
        }
        
        // パーティクル数を設定
        this.setParticleCount(particleCount);
        
        // LFOは使用しない
        
        // スケッチ開始時刻を記録
        this.sketchStartTime = Date.now();
        
        // ライトを追加（scene01と同じ）
        const ambientLight = new THREE.AmbientLight(0x3f1f1f, 0.5);
        this.scene.add(ambientLight);
        
        this.directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight1.position.set(-1, 0, 0);
        this.scene.add(this.directionalLight1);
        
        this.directionalLight2 = new THREE.DirectionalLight(0xffa500, 0.8);
        this.directionalLight2.position.set(0.3, -0.8, -0.5);
        this.scene.add(this.directionalLight2);
        
        // 線描画システムを初期化
        if (this.SHOW_LINES && this.gpuParticleSystem) {
            this.gpuParticleSystem.createLineSystem({
                linewidth: 5,
                scene: this.scene
            }).then(lineSystem => {
                this.lineSystem = lineSystem;
            });
        }
        
        // 背景グラデーションを初期化
        await this.initBackgroundGradient();
        
        // 3Dグリッドとルーラーを初期化
        this.showGridRuler3D = true;  // デフォルトで表示
        this.initGridRuler3D({
            center: { x: 0, y: 0, z: 0 },
            size: { x: 2000, y: 1000, z: 2000 },
            floorY: -500,
            floorSize: 2000,
            floorDivisions: 40,
            labelMax: 64,
            color: 0xffffff,  // 常に白
            opacity: 0.65
        });
    }
    
    /**
     * 背景グラデーションを初期化
     */
    async initBackgroundGradient() {
        try {
            // シェーダーを読み込む
            const shaderBasePath = `/shaders/scene05/`;
            const [vertexShader, fragmentShader] = await Promise.all([
                fetch(`${shaderBasePath}backgroundGradient.vert`).then(r => r.text()),
                fetch(`${shaderBasePath}backgroundGradient.frag`).then(r => r.text())
            ]);
            
            // 背景用のSphereジオメトリを作成（大きめの半径で背景を覆う）
            const geometry = new THREE.SphereGeometry(5000, 32, 32);
            
            // シェーダーマテリアルを作成
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    centerColor: { value: new THREE.Vector3(1.0, 1.0, 1.0) },  // 中心部：明るい白
                    edgeColor: { value: new THREE.Vector3(0.3, 0.3, 0.3) },    // 外側：うっすら白
                    intensity: { value: 0.15 }  // グラデーションの強度（うっすら）
                },
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                side: THREE.BackSide  // 内側から見る
            });
            
            // メッシュを作成
            this.backgroundGradientMesh = new THREE.Mesh(geometry, material);
            this.scene.add(this.backgroundGradientMesh);
            
            console.log('[Scene05] 背景グラデーションを初期化しました');
        } catch (err) {
            console.error('[Scene05] 背景グラデーションの初期化に失敗:', err);
        }
    }
    
    /**
     * カメラパーティクルの距離パラメータを設定
     */
    setupCameraParticleDistance(cameraParticle) {
        // Scene05用：カメラを適切な距離に設定
        cameraParticle.minDistance = 400.0;
        cameraParticle.maxDistance = 1500.0;
        cameraParticle.maxDistanceReset = 1000.0;
    }
    
    /**
     * 更新処理
     */
    onUpdate(deltaTime) {
        // 時間の更新
        this.time += this.timeIncrement;
        // SceneBaseのtimeも更新（HUD表示用）
        super.time = this.time;
        
        // トラック5のサスティン終了をチェック
        if (this.track5EndTime > 0 && Date.now() >= this.track5EndTime) {
            // サスティン終了：スピードを元に戻す
            this.track5SpeedMultiplier = 1.0;
            this.curlNoiseSpeed = this.baseCurlNoiseSpeed;
            this.track5EndTime = 0;
        }
        
        // GPUパーティクルの更新
        if (this.SHOW_PARTICLES && this.gpuParticleSystem) {
            // カールノイズのスピードを早くするため、timeに倍率を掛ける
            this.gpuParticleSystem.update({
                time: this.time * this.curlNoiseSpeed,
                deltaTime: deltaTime,
                noiseScale: this.noiseScale,
                noiseStrength: this.noiseStrength,
                baseRadius: this.baseRadius,
                maxLifetime: this.maxLifetime,
                circleRadius: this.circleRadius,
                circleThickness: this.circleThickness
            });
        }
        
        // 線描画の更新
        if (this.SHOW_LINES && this.lineSystem && this.gpuParticleSystem) {
            this.gpuParticleSystem.updateLineSystem();
        }
        
        // GridRuler3Dの更新（カメラに向ける）
        if (this.gridRuler3D && this.camera) {
            this.gridRuler3D.update(this.camera);
        }
    }
    
    /**
     * 描画処理（オーバーライド）
     */
    render() {
        // 背景は常に黒
        this.backgroundWhite = false;
        
        // 背景色を設定
        this.renderer.setClearColor(0x000000);
        
        // GridRuler3Dの色は常に白（赤い十字は赤のまま）
        if (this.gridRuler3D && this.gridRuler3D._materials) {
            const gridColor = 0xffffff;  // グリッド線は白
            const redCrossColor = 0xff3333;  // 赤い十字の色（この色のマテリアルは更新しない）
            this.gridRuler3D._materials.forEach(mat => {
                if (mat && mat.color !== undefined) {
                    // 赤い十字のマテリアル（色が0xff3333）は赤のまま、それ以外は白に更新
                    const currentColor = mat.color.getHex();
                    if (currentColor !== redCrossColor) {
                        mat.color.setHex(gridColor);
                    }
                }
            });
            // ラベルの色も更新
            if (this.gridRuler3D._labelSprites) {
                this.gridRuler3D._labelSprites.forEach(sprite => {
                    if (sprite && sprite.material && sprite.material.color !== undefined) {
                        sprite.material.color.setHex(gridColor);
                    }
                });
            }
        }
        
        // 色反転エフェクトが有効な場合はColorInversionのcomposerを使用
        if (this.colorInversion && this.colorInversion.isEnabled()) {
            // ColorInversionのcomposerがシーンをレンダリングして色反転を適用
            const rendered = this.colorInversion.render();
            if (!rendered) {
                // レンダリングに失敗した場合は通常のレンダリング
                if (this.scene) {
                    this.renderer.render(this.scene, this.camera);
                }
            }
        } else {
            // ポストプロセッシングエフェクトが有効な場合はEffectComposerを使用
            if (this.composer && 
                ((this.chromaticAberrationPass && this.chromaticAberrationPass.enabled) ||
                 (this.glitchPass && this.glitchPass.enabled) ||
                 (this.bloomPass && this.bloomPass.enabled))) {
                this.composer.render();
            } else {
                // 通常のレンダリング
                if (this.scene) {
                    this.renderer.render(this.scene, this.camera);
                }
            }
        }
        
        // HUDを描画（非表示の時はCanvasをクリア）
        if (this.hud) {
            if (this.showHUD) {
                const cameraPos = this.cameraParticles[this.currentCameraIndex]?.getPosition() || new THREE.Vector3();
                const now = performance.now();
                const frameRate = this.lastFrameTime ? 1.0 / ((now - this.lastFrameTime) / 1000.0) : 60.0;
                this.lastFrameTime = now;
                
                // HUDは常に白
                this.hud.display(
                    frameRate,
                    this.currentCameraIndex,
                    cameraPos,
                    0, // activeSpheres（サブクラスで設定）
                    this.time, // time（サブクラスで設定）
                    this.cameraParticles[this.currentCameraIndex]?.getRotationX() || 0,
                    this.cameraParticles[this.currentCameraIndex]?.getRotationY() || 0,
                    cameraPos.length(),
                    0, // noiseLevel（サブクラスで設定）
                    false, // backgroundWhite（false=白、true=黒）
                    this.oscStatus,
                    this.particleCount,
                    this.trackEffects,  // エフェクト状態を渡す
                    this.phase,  // phase値を渡す
                    null,  // hudScales（サブクラスで設定可能）
                    null,  // hudGrid（サブクラスで設定可能）
                    0,  // currentBar（サブクラスで設定可能）
                    '',  // debugText（サブクラスで設定可能）
                    this.actualTick,  // actualTick（OSCから受け取る値）
                    null,  // cameraModeName（サブクラスで設定可能）
                    this.sceneNumber  // sceneNumber（各シーンで設定）
                );
            } else {
                // HUDが非表示の時はCanvasをクリア
                this.hud.clear();
            }
        }
        
        // スクリーンショットテキストを描画
        this.drawScreenshotText();
    }
    
    /**
     * OSCメッセージの処理
     */
    handleTrackNumber(trackNumber, message) {
        const args = message.args || [];
        
        // トラック1: カメラをランダムに切り替え（SceneBaseで処理済み）
        // トラック2-4: エフェクト（SceneBaseで処理済み）
        
        // トラック5: ノイズの動きを早める
        if (trackNumber === 5) {
            const velocity = args[1] || 127.0;  // ベロシティ（0-127）
            const durationMs = args[2] || 0.0;  // デュレーション（ms）
            
            // ベロシティに応じてスピード倍率を計算（0-127 → 1.0-5.0）
            this.track5SpeedMultiplier = 1.0 + (velocity / 127.0) * 4.0;  // 1.0〜5.0
            
            // カールノイズのスピードを更新
            this.curlNoiseSpeed = this.baseCurlNoiseSpeed * this.track5SpeedMultiplier;
            
            // サスティン終了時刻を設定（durationMsが0の場合は無期限）
            if (durationMs > 0) {
                this.track5EndTime = Date.now() + durationMs;
            } else {
                this.track5EndTime = 0;  // 無期限
            }
        }
    }
    
    /**
     * リセット処理
     */
    reset() {
        super.reset(); // TIMEをリセット
        this.time = 0;
        this.sketchStartTime = Date.now();
        
        // 線描画システムを削除
        if (this.lineSystem) {
            this.lineSystem.children.forEach(line => {
                line.geometry.dispose();
                line.material.dispose();
            });
            this.scene.remove(this.lineSystem);
            this.lineSystem = null;
        }
        
        // GPUパーティクルシステムを再初期化
        if (this.gpuParticleSystem) {
            const particleSystem = this.gpuParticleSystem.getParticleSystem();
            if (particleSystem) {
                this.scene.remove(particleSystem);
            }
            if (!this.useSharedResources || !this.sharedResourceManager) {
                this.gpuParticleSystem.dispose();
            }
        }
        
        // 共有リソースを使っている場合は、パーティクルシステムを再取得
        if (this.useSharedResources && this.sharedResourceManager) {
            this.gpuParticleSystem = this.sharedResourceManager.getGPUParticleSystem('scene05');
            if (this.gpuParticleSystem) {
                this.gpuParticleSystem.initializeParticleData();
                const particleSystem = this.gpuParticleSystem.getParticleSystem();
                if (particleSystem) {
                    // パーティクルシステムのローテーションXを90度に設定
                    particleSystem.rotation.x = Math.PI / 2.0;
                    this.scene.add(particleSystem);
                }
            }
        }
        
        // GPUパーティクルシステムを再作成
        if (!this.useSharedResources || !this.sharedResourceManager) {
            const particleCount = this.cols * this.rows;
            this.gpuParticleSystem = new GPUParticleSystem(
                this.renderer,
                particleCount,
                this.cols,
                this.rows,
                this.baseRadius,
                'scene01',
                6.0,  // particleSize（大きく）
                'circle',  // placementType: 円配置
                {
                    circleRadius: this.circleRadius,
                    circleThickness: this.circleThickness,
                    minLifetime: this.minLifetime,
                    maxLifetime: this.maxLifetime
                }
            );
            this.gpuParticleSystem.initPromise.then(() => {
                const newParticleSystem = this.gpuParticleSystem.getParticleSystem();
                if (newParticleSystem) {
                    // パーティクルシステムのローテーションXを90度に設定
                    newParticleSystem.rotation.x = Math.PI / 2.0;
                    this.scene.add(newParticleSystem);
                }
                // 線描画システムを再作成
                if (this.SHOW_LINES && this.gpuParticleSystem) {
                    this.gpuParticleSystem.createLineSystem({
                        linewidth: 5,
                        scene: this.scene
                    }).then(lineSystem => {
                        this.lineSystem = lineSystem;
                    });
                }
            });
        } else {
            // 共有リソースを使っている場合は、線描画システムのみ再作成
            if (this.SHOW_LINES && this.gpuParticleSystem) {
                this.gpuParticleSystem.createLineSystem({
                    linewidth: 5,
                    scene: this.scene
                }).then(lineSystem => {
                    this.lineSystem = lineSystem;
                });
            }
        }
    }
    
    /**
     * リサイズ処理
     */
    onResize() {
        // 親クラスのonResizeを呼ぶ
        super.onResize();
    }
    
    /**
     * クリーンアップ処理（シーン切り替え時に呼ばれる）
     */
    dispose() {
        console.log('Scene05.dispose: クリーンアップ開始');
        
        // GPUパーティクルシステムを破棄
        if (this.gpuParticleSystem) {
            const particleSystem = this.gpuParticleSystem.getParticleSystem();
            if (particleSystem) {
                this.scene.remove(particleSystem);
            }
            
            if (this.useSharedResources && this.sharedResourceManager) {
                this.sharedResourceManager.releaseGPUParticleSystem('scene05');
                console.log('[Scene05] 共有リソースを返却');
            } else {
                this.gpuParticleSystem.dispose();
            }
            this.gpuParticleSystem = null;
        }
        
        // 線描画システムを破棄
        if (this.lineSystem) {
            this.lineSystem.children.forEach(line => {
                line.geometry.dispose();
                line.material.dispose();
            });
            this.scene.remove(this.lineSystem);
            this.lineSystem = null;
        }
        
        // 背景グラデーションを破棄
        if (this.backgroundGradientMesh) {
            this.backgroundGradientMesh.geometry.dispose();
            this.backgroundGradientMesh.material.dispose();
            this.scene.remove(this.backgroundGradientMesh);
            this.backgroundGradientMesh = null;
        }
        
        // GridRuler3Dを破棄
        if (this.gridRuler3D) {
            this.gridRuler3D.dispose();
            this.gridRuler3D = null;
        }
        
        // ライトを削除
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
        
        this.directionalLight1 = null;
        this.directionalLight2 = null;
        
        
        console.log('Scene05.dispose: クリーンアップ完了');
        
        // 親クラスのdisposeを呼ぶ
        super.dispose();
    }
}
