/**
 * Scene03: 球体パーティクル + クレーター + レーザースキャン
 * Scene01をベースに、ノイズ変形とミサイルを削除し、クレーターとレーザースキャンを追加
 */

import { SceneBase } from '../SceneBase.js';
import { GPUParticleSystem } from '../../lib/GPUParticleSystem.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export class Scene03 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'mathym | uiojp';
        
        // 共有リソースマネージャー
        this.sharedResourceManager = sharedResourceManager;
        this.useSharedResources = !!sharedResourceManager;
        
        // 表示設定（デフォルトでパーティクルを表示）
        this.SHOW_PARTICLES = true;
        this.SHOW_LINES = true;
        
        // グリッドパラメータ（150万粒 = 1225 x 1225 = 1,500,625粒）
        this.cols = 1225;
        this.rows = 1225;
        
        // 球体パラメータ
        this.baseRadius = 400.0;  // Processingと同じ
        
        // 時間変数
        this.time = 0.0;
        this.timeIncrement = 0.001;
        
        // 時間経過管理
        this.sketchStartTime = Date.now();
        
        // カメラ設定
        this.centerOffsetRatio = 0.3;
        this.pointRotationX = 0.0;
        
        // GPUパーティクルシステム
        this.gpuParticleSystem = null;
        this.isInitializing = false;  // 初期化中フラグ（リセット時のフリーズ防止）
        
        // 線描画用
        this.lineSystem = null;
        
        // 色収差エフェクト（トラック3用）
        this.composer = null;
        this.chromaticAberrationPass = null;
        this.chromaticAberrationAmount = 0.0;  // 色収差の強度（0.0〜1.0）
        this.chromaticAberrationEndTime = 0;  // エフェクト終了時刻（サスティン用）
        this.chromaticAberrationKeyPressed = false;  // キーが押されているか
        
        // グリッチエフェクト（トラック4用）
        this.glitchPass = null;
        this.glitchAmount = 0.0;  // グリッチの強度（0.0〜1.0）
        this.glitchEndTime = 0;  // エフェクト終了時刻（サスティン用）
        this.glitchKeyPressed = false;  // キーが押されているか
        
        // クレーター（5キー/5トラックで作成）
        this.craters = [];  // クレーターキュー（処理待ちのクレーター）
        this.currentCrater = null;  // 現在処理中のクレーター（変形が完了したら削除）
        // クレーターは永続的に残す（削除しない）
        
        // レーザースキャンエフェクト（6キー/6トラック用、ポリフォニック対応）
        this.laserScanPass = null;
        this.laserScans = [];  // 複数のレーザースキャンを管理（ポリフォニック）
        // { position: float, speed: float, intensity: float, width: float, endTime: number }
        this.laserScanWidth = 0.1;  // スキャンラインの幅（緯度の範囲、ラジアン、Processing版と同じ）
        this.laserScanKeyPressed = false;  // キーが押されているか
        
        // パフォーマンス最適化：Float32Arrayを再利用（毎フレーム新規作成を避ける）
        this.maxScans = 10;
        this.laserScanPositions = new Float32Array(this.maxScans);
        this.laserScanWidths = new Float32Array(this.maxScans);
        this.laserScanIntensities = new Float32Array(this.maxScans);
        
        // 線描画システムの更新頻度を下げる（フレームカウンター）
        this.lineUpdateFrameCounter = 0;
        this.lineUpdateInterval = 2;  // 2フレームに1回更新（30fps相当）
        
        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
    }
    
    async setup() {
        // 親クラスのsetup()を呼ぶ（ColorInversionの初期化を含む）
        await super.setup();
        
        // カメラパーティクルの距離パラメータを再設定（親クラスで設定された後に上書き）
        // カメラは共有リソースとして使いまわすため、初期化は不要
        if (this.cameraParticles) {
            for (const cameraParticle of this.cameraParticles) {
                this.setupCameraParticleDistance(cameraParticle);
            }
        }
        
        // GPUパーティクルシステムを初期化（共有リソースを使う場合は取得、そうでない場合は新規作成）
        const particleCount = this.cols * this.rows;
        
        if (this.useSharedResources && this.sharedResourceManager) {
            // 共有リソースから取得（既に初期化済み）
            this.gpuParticleSystem = this.sharedResourceManager.getGPUParticleSystem('scene03');
            console.log('[Scene03] 共有リソースからGPUパーティクルシステムを取得');
        } else {
            // 通常通り新規作成
        this.gpuParticleSystem = new GPUParticleSystem(
            this.renderer,
            particleCount,
            this.cols,
            this.rows,
            this.baseRadius,
            'scene03',  // シェーダーパス
            3.0,  // particleSize
            'sphere'  // placementType: 球体マッピング
        );
        
        // シェーダーの読み込み完了を待つ
        await this.gpuParticleSystem.initPromise;
        }
        
        // Scene03専用：クレーター用のuniformを追加
        const positionUpdateMaterial = this.gpuParticleSystem.getPositionUpdateMaterial();
        if (positionUpdateMaterial && positionUpdateMaterial.uniforms) {
            // シェーダーに定義されているuniformを追加（シェーダー側では既に定義済み）
            positionUpdateMaterial.uniforms.craterActive = { value: 0 };
            positionUpdateMaterial.uniforms.craterLatitude = { value: 0.0 };
            positionUpdateMaterial.uniforms.craterLongitude = { value: 0.0 };
            positionUpdateMaterial.uniforms.craterRadius = { value: 0.0 };
            positionUpdateMaterial.uniforms.craterDepth = { value: 0.0 };
            positionUpdateMaterial.uniforms.craterAge = { value: 0.0 };
        }
        
        // パーティクルシステムをシーンに追加
        const particleSystem = this.gpuParticleSystem.getParticleSystem();
        if (particleSystem) {
            this.scene.add(particleSystem);
        }
        
        // パーティクル数を設定
        this.setParticleCount(particleCount);
        
        // パーティクルマテリアルにレーザースキャン用のuniformを追加
        if (this.gpuParticleSystem && this.gpuParticleSystem.particleMaterial && 
            this.gpuParticleSystem.particleMaterial.uniforms) {
            const uniforms = this.gpuParticleSystem.particleMaterial.uniforms;
            uniforms.baseRadius = { value: this.baseRadius };
            // ポリフォニック対応：複数のレーザースキャン用のuniform配列（最大10個）
            // 初期化時に全て0で埋める
            const initPositions = new Float32Array(10);
            const initWidths = new Float32Array(10);
            const initIntensities = new Float32Array(10);
            for (let i = 0; i < 10; i++) {
                initPositions[i] = -Math.PI / 2;
                initWidths[i] = 0.0;
                initIntensities[i] = 0.0;
            }
            uniforms.laserScanCount = { value: 0 };
            uniforms.laserScanPositions = { value: initPositions };
            uniforms.laserScanWidths = { value: initWidths };
            uniforms.laserScanIntensities = { value: initIntensities };
        }
        
        // スケッチ開始時刻を記録
        this.sketchStartTime = Date.now();
        
        // ライトを追加（Processingと同じ）
        // ambientLight(63, 31, 31) - オレンジがかった環境光
        const ambientLight = new THREE.AmbientLight(0x3f1f1f, 0.5);
        this.scene.add(ambientLight);
        
        // directionalLight(255, 255, 255, -1, 0, 0) - 白い指向性ライト（左から）
        this.directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight1.position.set(-1, 0, 0);
        this.scene.add(this.directionalLight1);
        
        // directionalLight(255, 165, 0, 0.3, -0.8, -0.5) - オレンジ色のライト（上から斜めに）
        this.directionalLight2 = new THREE.DirectionalLight(0xffa500, 0.8);
        this.directionalLight2.position.set(0.3, -0.8, -0.5);
        this.scene.add(this.directionalLight2);
        
        // 線描画システムを初期化（GPUParticleSystem側で作成）
        if (this.SHOW_LINES && this.gpuParticleSystem) {
            this.gpuParticleSystem.createLineSystem({
                linewidth: 5,
                additionalUniforms: {
                    baseRadius: { value: this.baseRadius },
                    laserScanCount: { value: 0 },
                    laserScanPositions: { value: (() => {
                        const arr = new Float32Array(10);
                        for (let i = 0; i < 10; i++) arr[i] = -Math.PI / 2;
                        return arr;
                    })() },
                    laserScanWidths: { value: new Float32Array(10) },
                    laserScanIntensities: { value: new Float32Array(10) }
                },
                scene: this.scene
            }).then(lineSystem => {
                this.lineSystem = lineSystem;
            });
        }
        
        // 色収差エフェクトを初期化
        this.initChromaticAberration();
        
        // グリッチエフェクトを初期化
        this.initGlitch();
    }
    
    /**
     * 色収差エフェクトを初期化
     */
    async initChromaticAberration() {
        // シェーダーを読み込む
        const shaderBasePath = `/shaders/common/`;
        try {
            const [vertexShader, fragmentShader] = await Promise.all([
            fetch(`${shaderBasePath}chromaticAberration.vert`).then(r => r.text()),
            fetch(`${shaderBasePath}chromaticAberration.frag`).then(r => r.text())
            ]);
            // EffectComposerを作成
            if (!this.composer) {
                this.composer = new EffectComposer(this.renderer);
                
                // RenderPassを追加（通常のシーン描画）
                const renderPass = new RenderPass(this.scene, this.camera);
                this.composer.addPass(renderPass);
            }
            
            // 色収差シェーダーを作成
            const chromaticAberrationShader = {
                uniforms: {
                    tDiffuse: { value: null },
                    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                    amount: { value: 0.0 }
                },
                vertexShader: vertexShader,
                fragmentShader: fragmentShader
            };
            
            // ShaderPassを追加
            this.chromaticAberrationPass = new ShaderPass(chromaticAberrationShader);
            this.chromaticAberrationPass.enabled = false;  // デフォルトでは無効
            this.composer.addPass(this.chromaticAberrationPass);
            
            // グリッチエフェクトも初期化（composerが作成された後）
            await this.initGlitchShader();
            
            // レーザースキャンエフェクトも初期化（composerが作成された後）
            await this.initLaserScanShader();
        } catch (err) {
            console.error('色収差シェーダーの読み込みに失敗:', err);
        }
    }
    
    /**
     * グリッチエフェクトを初期化
     */
    initGlitch() {
        // composerが作成されるまで待つ（initChromaticAberration内で作成される）
        // 実際の初期化はinitChromaticAberration内で行う
    }
    
    /**
     * グリッチシェーダーを初期化（composer作成後）
     */
    async initGlitchShader() {
        if (!this.composer) return;
        
        // シェーダーを読み込む
        const shaderBasePath = `/shaders/common/`;
        try {
            const [vertexShader, fragmentShader] = await Promise.all([
            fetch(`${shaderBasePath}glitch.vert`).then(r => r.text()),
            fetch(`${shaderBasePath}glitch.frag`).then(r => r.text())
            ]);
            // グリッチシェーダーを作成
            const glitchShader = {
                uniforms: {
                    tDiffuse: { value: null },
                    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                    amount: { value: 0.0 },
                    time: { value: 0.0 }
                },
                vertexShader: vertexShader,
                fragmentShader: fragmentShader
            };
            
            // ShaderPassを追加
            this.glitchPass = new ShaderPass(glitchShader);
            this.glitchPass.enabled = false;  // デフォルトでは無効
            this.composer.addPass(this.glitchPass);
        } catch (err) {
            console.error('グリッチシェーダーの読み込みに失敗:', err);
        }
    }
    
    /**
     * レーザースキャンシェーダーを初期化（composer作成後）
     */
    async initLaserScanShader() {
        if (!this.composer) return;
        
        // シェーダーを読み込む
        const shaderBasePath = `/shaders/scene03/`;
        try {
            const [vertexShader, fragmentShader] = await Promise.all([
            fetch(`${shaderBasePath}laserScan.vert`).then(r => r.text()),
            fetch(`${shaderBasePath}laserScan.frag`).then(r => r.text())
            ]);
            
            // レーザースキャンシェーダーを作成
            const laserScanShader = {
                uniforms: {
                    tDiffuse: { value: null },
                    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                    scanPosition: { value: 0.0 },
                    scanWidth: { value: 0.05 },
                    intensity: { value: 0.0 }
                },
                vertexShader: vertexShader,
                fragmentShader: fragmentShader
            };
            
            // ShaderPassを追加
            this.laserScanPass = new ShaderPass(laserScanShader);
            this.laserScanPass.enabled = false;  // デフォルトでは無効
            this.composer.addPass(this.laserScanPass);
        } catch (err) {
            console.error('レーザースキャンシェーダーの読み込みに失敗:', err);
        }
    }
    
    
    /**
     * カメラパーティクルの距離パラメータを設定
     */
    setupCameraParticleDistance(cameraParticle) {
        // Scene03用：カメラを適切な距離に設定
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
        
        // GPUパーティクルの更新（SHOW_PARTICLESがtrueの場合のみ）
        // パフォーマンス最適化：初期化中または初期化未完了の場合はスキップ（フリーズ防止）
        if (this.SHOW_PARTICLES && this.gpuParticleSystem && !this.isInitializing) {
            // 初期化が完了しているかチェック
            const positionUpdateMaterial = this.gpuParticleSystem.getPositionUpdateMaterial();
            if (positionUpdateMaterial && positionUpdateMaterial.uniforms) {
                // 現在処理中のクレーターを取得（最新の1つだけ）
                // クレーター情報は保持する必要がなく、位置テクスチャに直接変形を焼き込む
                let activeCrater = null;
                if (this.currentCrater && this.currentCrater.age < 60.0) {
                    // 現在のクレーターがまだ変形中（60フレーム未満）の場合
                    this.currentCrater.age += deltaTime * 60.0;  // フレーム単位で年齢を更新
                    activeCrater = this.currentCrater;
                } else if (this.currentCrater && this.currentCrater.age >= 60.0) {
                    // 変形が完了したら、currentCraterをnullにする（次のクレーターは手動で作成されるまで待つ）
                    this.currentCrater = null;
                }
                
                // 新しいクレーターがキューに追加された場合のみ処理を開始
                if (!this.currentCrater && this.craters.length > 0) {
                    this.currentCrater = this.craters.shift();  // 古いクレーターから順に処理
                    this.currentCrater.age = 0.0;
                    activeCrater = this.currentCrater;
                }
                
                // Scene03専用：クレーターのuniformsを直接設定（update()の前に設定する必要がある）
                if (activeCrater) {
                    positionUpdateMaterial.uniforms.craterActive.value = 1;
                    positionUpdateMaterial.uniforms.craterLatitude.value = activeCrater.latitude;
                    positionUpdateMaterial.uniforms.craterLongitude.value = activeCrater.longitude;
                    positionUpdateMaterial.uniforms.craterRadius.value = activeCrater.radius;
                    positionUpdateMaterial.uniforms.craterDepth.value = activeCrater.depth;
                    positionUpdateMaterial.uniforms.craterAge.value = activeCrater.age;
                } else {
                    positionUpdateMaterial.uniforms.craterActive.value = 0;
                }
                
                // GPUParticleSystemの基本更新（uniforms設定後に呼ぶ）
                this.gpuParticleSystem.update({
                    time: this.time,
                    noiseScale: 0.0,  // ノイズ変形なし
                    noiseStrength: 0.0,  // ノイズ変形なし
                    baseRadius: this.baseRadius
                });
            }
            // まだ初期化が完了していない場合はスキップ（他の更新処理は続行）
        }
        
        // 線描画の更新（SHOW_LINESがtrueの場合のみ、更新頻度を下げる）
        if (this.SHOW_LINES && this.lineSystem && this.gpuParticleSystem) {
            this.lineUpdateFrameCounter++;
            if (this.lineUpdateFrameCounter >= this.lineUpdateInterval) {
                this.updateLineSystem();
                this.lineUpdateFrameCounter = 0;
            }
        }
        
        // 色収差エフェクトの更新（サスティン終了チェック）
        this.updateChromaticAberration();
        
        // グリッチエフェクトの更新（サスティン終了チェックと時間更新）
        this.updateGlitch();
        
        // レーザースキャンエフェクトの更新
        this.updateLaserScan(deltaTime);
    }
    
    /**
     * 色収差エフェクトの更新（サスティン終了チェック）
     */
    updateChromaticAberration() {
        if (this.chromaticAberrationPass && this.chromaticAberrationPass.enabled) {
            // キーが押されている場合は無効化しない
            if (this.chromaticAberrationKeyPressed) {
                return;
            }
            
            const currentTime = Date.now();
            if (this.chromaticAberrationEndTime > 0 && currentTime >= this.chromaticAberrationEndTime) {
                // サスティン終了
                this.chromaticAberrationPass.enabled = false;
                this.chromaticAberrationAmount = 0.0;
                this.chromaticAberrationEndTime = 0;
            }
        }
    }
    
    /**
     * グリッチエフェクトの更新（サスティン終了チェックと時間更新）
     */
    updateGlitch() {
        if (this.glitchPass && this.glitchPass.enabled) {
            // 時間を更新
            if (this.glitchPass.material && this.glitchPass.material.uniforms && this.glitchPass.material.uniforms.time) {
                this.glitchPass.material.uniforms.time.value = this.time * 0.1;  // 時間をスケール
            }
            
            // キーが押されている場合は無効化しない
            if (this.glitchKeyPressed) {
                return;
            }
            
            // サスティン終了チェック
            const currentTime = Date.now();
            if (this.glitchEndTime > 0 && currentTime >= this.glitchEndTime) {
                // サスティン終了
                this.glitchPass.enabled = false;
                this.glitchAmount = 0.0;
                this.glitchEndTime = 0;
            }
        }
    }
    
    /**
     * レーザースキャンエフェクトの更新（ポリフォニック対応）
     */
    updateLaserScan(deltaTime) {
        const currentTime = Date.now();
        
        // 全てのレーザースキャンを更新
        this.laserScans = this.laserScans.filter(scan => {
            // スキャン位置を更新（下から上へ、緯度ベース）
            scan.position += scan.speed * deltaTime * 60.0;  // 60fps想定
            
            // 上端（HALF_PI）に達したら配列から削除
            if (scan.position >= Math.PI / 2) {
                return false;  // 上端に到達したら削除
            }
            
            // サスティン終了チェック（キーが押されている場合は無効化しない）
            if (!this.laserScanKeyPressed && scan.endTime > 0 && currentTime >= scan.endTime) {
                // 終了したスキャンは削除
                return false;
            }
            
            return true;
        });
        
        // パーティクルマテリアルのuniformを更新（最大10個のレーザースキャン）
        // パフォーマンス最適化：Float32Arrayを再利用（毎フレーム新規作成を避ける）
        const scanCount = Math.min(this.laserScans.length, this.maxScans);
        
        if (this.gpuParticleSystem && this.gpuParticleSystem.particleMaterial && 
            this.gpuParticleSystem.particleMaterial.uniforms) {
            const uniforms = this.gpuParticleSystem.particleMaterial.uniforms;
            
            // 再利用可能なFloat32Arrayを更新
            for (let i = 0; i < scanCount; i++) {
                const scan = this.laserScans[i];
                this.laserScanPositions[i] = scan.position;
                this.laserScanWidths[i] = scan.width;
                this.laserScanIntensities[i] = scan.intensity;
            }
            
            // 残りのスロットを0で埋める
            for (let i = scanCount; i < this.maxScans; i++) {
                this.laserScanPositions[i] = -Math.PI / 2;
                this.laserScanWidths[i] = 0.0;
                this.laserScanIntensities[i] = 0.0;
            }
            
            if (uniforms.laserScanCount) {
                uniforms.laserScanCount.value = scanCount;
            }
            if (uniforms.laserScanPositions) {
                const existingPositions = uniforms.laserScanPositions.value;
                if (existingPositions && existingPositions.length === this.laserScanPositions.length) {
                    existingPositions.set(this.laserScanPositions);
                } else {
                    uniforms.laserScanPositions.value = this.laserScanPositions;
                }
            }
            if (uniforms.laserScanWidths) {
                const existingWidths = uniforms.laserScanWidths.value;
                if (existingWidths && existingWidths.length === this.laserScanWidths.length) {
                    existingWidths.set(this.laserScanWidths);
                } else {
                    uniforms.laserScanWidths.value = this.laserScanWidths;
                }
            }
            if (uniforms.laserScanIntensities) {
                const existingIntensities = uniforms.laserScanIntensities.value;
                if (existingIntensities && existingIntensities.length === this.laserScanIntensities.length) {
                    existingIntensities.set(this.laserScanIntensities);
                } else {
                    uniforms.laserScanIntensities.value = this.laserScanIntensities;
                }
            }
            if (uniforms.baseRadius) {
                uniforms.baseRadius.value = this.baseRadius;
            }
            
            // 線描画システムのuniformも更新（レーザースキャンが変更された場合のみ）
            if (this.lineSystem && this.lineSystem.children) {
                this.lineSystem.children.forEach(line => {
                    if (line.material && line.material.uniforms) {
                        const lineUniforms = line.material.uniforms;
                        if (lineUniforms.laserScanCount) {
                            lineUniforms.laserScanCount.value = scanCount;
                        }
                        if (lineUniforms.laserScanPositions) {
                            const existingPositions = lineUniforms.laserScanPositions.value;
                            if (existingPositions && existingPositions.length === this.laserScanPositions.length) {
                                existingPositions.set(this.laserScanPositions);
                            } else {
                                lineUniforms.laserScanPositions.value = this.laserScanPositions;
                            }
                        }
                        if (lineUniforms.laserScanWidths) {
                            const existingWidths = lineUniforms.laserScanWidths.value;
                            if (existingWidths && existingWidths.length === this.laserScanWidths.length) {
                                existingWidths.set(this.laserScanWidths);
                            } else {
                                lineUniforms.laserScanWidths.value = this.laserScanWidths;
                            }
                        }
                        if (lineUniforms.laserScanIntensities) {
                            const existingIntensities = lineUniforms.laserScanIntensities.value;
                            if (existingIntensities && existingIntensities.length === this.laserScanIntensities.length) {
                                existingIntensities.set(this.laserScanIntensities);
                            } else {
                                lineUniforms.laserScanIntensities.value = this.laserScanIntensities;
                            }
                        }
                    }
                });
            }
        }
    }
    
    /**
     * 描画処理（オーバーライド）
     */
    render() {
        // 背景色を設定
        this.renderer.setClearColor(0x000000);  // 常に黒背景（色反転で白になる）
        
        // 色反転エフェクトが有効な場合はSceneBaseのrenderメソッドを使用（画面全体を反転）
        if (this.colorInversion && this.colorInversion.isEnabled()) {
            // SceneBaseのrenderメソッドを呼ぶ（色反転エフェクトを適用）
            super.render();
        } else {
            // 色反転エフェクトが無効な場合は通常のレンダリング
            // ポストプロセッシングエフェクトが有効な場合はEffectComposerを使用
            if (this.composer && 
                ((this.chromaticAberrationPass && this.chromaticAberrationPass.enabled) ||
                 (this.glitchPass && this.glitchPass.enabled))) {
                this.composer.render();
            } else {
                // 通常のレンダリング
                if (this.scene) {
                    this.renderer.render(this.scene, this.camera);
                }
            }
            
            // HUDを描画（色反転エフェクトが無効な場合）
            if (this.hud) {
                if (this.showHUD) {
                    const cameraPos = this.cameraParticles[this.currentCameraIndex]?.getPosition() || new THREE.Vector3();
                    const now = performance.now();
                    const frameRate = this.lastFrameTime ? 1.0 / ((now - this.lastFrameTime) / 1000.0) : 60.0;
                    this.lastFrameTime = now;
                    
                    this.hud.display(
                        frameRate,
                        this.currentCameraIndex,
                        cameraPos,
                        0, // activeSpheres
                        this.time,
                        this.cameraParticles[this.currentCameraIndex]?.getRotationX() || 0,
                        this.cameraParticles[this.currentCameraIndex]?.getRotationY() || 0,
                        cameraPos.length(),
                        0, // noiseLevel
                        this.backgroundWhite,
                        this.oscStatus,
                        this.particleCount,
                        this.trackEffects,  // エフェクト状態を渡す
                        this.phase,  // phase値を渡す
                        this.title || null,  // sceneName
                        this.sceneIndex !== undefined ? this.sceneIndex : null  // sceneIndex
                    );
                } else {
                    this.hud.clear();
                }
            }
        }
        
        // スクリーンショットテキストを描画
        this.drawScreenshotText();
        
        // デバッグ用シーンを描画（エフェクト適用後、HUDと同じタイミング）
        // カメラデバッグとAxesHelperはエフェクトから除外
        // 一時的に無効化（問題が発生しているため）
        // if (this.debugScene) {
        //     this.renderer.render(this.debugScene, this.camera, null, false);
        // }
        
        // カメラデバッグを描画（テキスト）
        this.drawCameraDebug();
    }
    
    /**
     * 線描画システムを更新（GPUParticleSystem側で更新）
     */
    updateLineSystem() {
        if (this.gpuParticleSystem) {
            this.gpuParticleSystem.updateLineSystem();
        }
    }
    
    /**
     * レーザースキャンのuniformを更新（線描画システム用）
     */
    updateLaserScanUniforms() {
        if (!this.lineSystem) return;
        
        // 各線のマテリアルにレーザースキャンのuniformを設定
        this.lineSystem.children.forEach(line => {
            if (line.material && line.material.uniforms) {
                if (line.material.uniforms.baseRadius) {
                    line.material.uniforms.baseRadius.value = this.baseRadius;
                }
            }
        });
    }
    
    /**
     * クレーターを作成（ランダムな位置に、ベロシティとデュレーションに応じて）
     * ベロシティ: クレーターの範囲（radius）
     * デュレーション: 中心部まで届くようなクレーターの長さ（depth）
     */
    createCrater(velocity = 127.0, durationMs = 0.0) {
        console.log(`[Scene03] createCrater called: velocity=${velocity}, durationMs=${durationMs}`);
        
        // ランダムな位置を生成（球面上）
        const latitude = (Math.random() - 0.5) * Math.PI;  // -PI/2 〜 PI/2
        const longitude = Math.random() * Math.PI * 2;  // 0 〜 2*PI
        
        // クレーターパラメータ
        // ベロシティで範囲（radius）を制御
        const baseRadius = 0.1;  // ベース半径（ラジアン）- もっと大きく
        const maxRadius = 0.4;  // 最大半径（ラジアン）- もっと大きく
        let radius = THREE.MathUtils.mapLinear(velocity, 0, 127, baseRadius, maxRadius);
        
        // ランダムに大きさを変える（0.7倍〜2.0倍の範囲でランダム、より広い範囲）
        const randomMultiplier = 0.7 + Math.random() * 1.3;  // 0.7 〜 2.0
        radius *= randomMultiplier;
        
        // デュレーションでクレーターの深さ（depth）を制御
        // デュレーションが大きいほど深く（ただし浅い範囲で）
        // デュレーションの範囲: 0ms 〜 5000ms（5秒）を想定
        const baseDepth = 5.0;  // ベース深さ（球体を押し付けたような浅さ）
        const maxDepth = 20.0;  // 最大深さ（球体を押し付けたような浅さ）
        // デュレーションが0の場合はベース深さ、5000msで最大深さ
        const depth = durationMs > 0 
            ? THREE.MathUtils.mapLinear(durationMs, 0, 5000, baseDepth, maxDepth)
            : baseDepth;
        
        // クレーターを追加（永続的に残す）
        this.craters.push({
            latitude: latitude,
            longitude: longitude,
            radius: radius,
            depth: depth,
            age: 0.0  // 年齢（時間経過で徐々に凹む）
        });
        
        console.log(`[Scene03] Crater created: lat=${latitude.toFixed(3)}, lon=${longitude.toFixed(3)}, velocity=${velocity}, duration=${durationMs}ms, radius=${radius.toFixed(3)}, depth=${depth.toFixed(1)}, totalCraters=${this.craters.length}`);
    }
    
    /**
     * OSCメッセージの処理
     */
    handleTrackNumber(trackNumber, message) {
        const args = message.args || [];
        
        // トラック1: カメラをランダムに切り替え（SceneBaseで処理済み）
        // トラック2: 色反転エフェクト（SceneBaseで処理済み）
        // トラック3: 色収差エフェクト（ノート、ベロシティ、デュレーション付き）
        if (trackNumber === 3) {
            const velocity = args[0] || 127.0;
            const noteNumber = args[1] || 64.0;
            const durationMs = args[2] || 0.0;
            this.applyChromaticAberration(velocity, noteNumber, durationMs);
        }
        // トラック4: グリッチエフェクト（ノート、ベロシティ、デュレーション付き）
        else if (trackNumber === 4) {
            const velocity = args[0] || 127.0;
            const noteNumber = args[1] || 64.0;
            const durationMs = args[2] || 0.0;
            this.applyGlitch(velocity, noteNumber, durationMs);
        }
        // トラック5: クレーターを作成（ベロシティとデュレーションに応じて）
        else if (trackNumber === 5) {
            const velocity = args[0] || 127.0;
            const noteNumber = args[1] || 64.0;
            const durationMs = args[2] || 0.0;
            console.log(`[Scene03] Track 5: velocity=${velocity}, durationMs=${durationMs}`);
            this.createCrater(velocity, durationMs);
        }
        // トラック6: レーザースキャンエフェクト（ベロシティとデュレーションに応じて）
        else if (trackNumber === 6) {
            const velocity = args[0] || 127.0;
            const noteNumber = args[1] || 64.0;
            const durationMs = args[2] || 0.0;
            console.log(`[Scene03] Track 6: velocity=${velocity}, durationMs=${durationMs}`);
            this.applyLaserScan(velocity, noteNumber, durationMs);
        }
    }
    
    /**
     * 色収差エフェクトを適用（ノート、ベロシティ、デュレーション付き）
     */
    applyChromaticAberration(velocity, noteNumber, durationMs) {
        if (!this.chromaticAberrationPass) {
            console.warn('色収差エフェクトが初期化されていません');
            return;
        }
        
        // ベロシティ（0〜127）を色収差の強度（0.0〜1.0）に変換
        // ベロシティが大きいほど強度が高い
        const amount = THREE.MathUtils.mapLinear(velocity, 0, 127, 0.0, 1.0);
        this.chromaticAberrationAmount = amount;
        
        // シェーダーのuniformを更新
        if (this.chromaticAberrationPass.material && this.chromaticAberrationPass.material.uniforms) {
            this.chromaticAberrationPass.material.uniforms.amount.value = amount;
        }
        
        // エフェクトを有効化
        this.chromaticAberrationPass.enabled = true;
        
        // デュレーション（サスティン）を設定
        if (durationMs > 0) {
            this.chromaticAberrationEndTime = Date.now() + durationMs;
        } else {
            // デュレーションが0の場合は無期限（キーが離されるまで）
            this.chromaticAberrationEndTime = 0;
        }
        
        console.log(`Track 3: Chromatic aberration applied (velocity: ${velocity}, note: ${noteNumber}, amount: ${amount.toFixed(2)}, duration: ${durationMs}ms)`);
    }
    
    /**
     * グリッチエフェクトを適用（ノート、ベロシティ、デュレーション付き）
     */
    applyGlitch(velocity, noteNumber, durationMs) {
        if (!this.glitchPass) {
            console.warn('グリッチエフェクトが初期化されていません');
            return;
        }
        
        // ベロシティ（0〜127）をグリッチの強度（0.0〜1.0）に変換
        // ベロシティが大きいほど強度が高い
        const amount = THREE.MathUtils.mapLinear(velocity, 0, 127, 0.0, 1.0);
        this.glitchAmount = amount;
        
        // シェーダーのuniformを更新
        if (this.glitchPass.material && this.glitchPass.material.uniforms) {
            this.glitchPass.material.uniforms.amount.value = amount;
        }
        
        // エフェクトを有効化
        this.glitchPass.enabled = true;
        
        // デュレーション（サスティン）を設定
        if (durationMs > 0) {
            this.glitchEndTime = Date.now() + durationMs;
        } else {
            // デュレーションが0の場合は無期限（キーが離されるまで）
            this.glitchEndTime = 0;
        }
        
        console.log(`Track 4: Glitch effect applied (velocity: ${velocity}, note: ${noteNumber}, amount: ${amount.toFixed(2)}, duration: ${durationMs}ms)`);
    }
    
    /**
     * レーザースキャンエフェクトを適用（ベロシティとデュレーションに応じて、ポリフォニック対応）
     */
    applyLaserScan(velocity, noteNumber, durationMs) {
        // ベロシティ（0〜127）をスキャン速度と強度に変換
        // ベロシティが大きいほど速度と強度が高い
        const speed = THREE.MathUtils.mapLinear(velocity, 0, 127, 0.01, 0.1);  // スキャン速度
        const intensity = THREE.MathUtils.mapLinear(velocity, 0, 127, 0.3, 1.0);  // エフェクト強度
        
        // デュレーション（サスティン）を設定
        // デュレーションが短すぎる場合は、最低でも1秒は表示する
        const minDuration = 1000;  // 最低1秒
        const actualDuration = Math.max(durationMs, minDuration);
        const endTime = actualDuration > 0 ? Date.now() + actualDuration : 0;
        
        // 新しいレーザースキャンを追加（ポリフォニック）
        this.laserScans.push({
            position: -Math.PI / 2,  // 下端から開始（緯度 -PI/2）
            speed: speed,
            intensity: intensity,
            width: this.laserScanWidth,
            endTime: endTime
        });
        
        // 最大10個まで（シェーダーのuniform配列の制限）
        if (this.laserScans.length > 10) {
            this.laserScans.shift();  // 古いスキャンを削除
        }
        
        console.log(`Track 6: Laser scan applied (velocity: ${velocity}, note: ${noteNumber}, speed: ${speed.toFixed(3)}, intensity: ${intensity.toFixed(2)}, duration: ${durationMs}ms, totalScans: ${this.laserScans.length})`);
    }
    
    /**
     * キーが押された時の処理（キー3、4、6専用、押している間だけ有効）
     */
    handleKeyDown(trackNumber) {
        // 親クラスのhandleKeyDownを呼ぶ（トラック2の色反転など）
        super.handleKeyDown(trackNumber);
        
        if (trackNumber === 3) {
            // キー3: 色収差エフェクトを有効化
            this.chromaticAberrationKeyPressed = true;
            this.applyChromaticAberration(127.0, 64.0, 0.0);  // デフォルト値で有効化
        } else if (trackNumber === 4) {
            // キー4: グリッチエフェクトを有効化
            this.glitchKeyPressed = true;
            this.applyGlitch(127.0, 64.0, 0.0);  // デフォルト値で有効化
        } else if (trackNumber === 6) {
            // キー6: レーザースキャンエフェクトを有効化
            this.laserScanKeyPressed = true;
            this.applyLaserScan(127.0, 64.0, 0.0);  // デフォルト値で有効化
        }
        // トラック5はhandleTrackNumberで処理（OSCメッセージ経由でも動作するため）
    }
    
    /**
     * キーが離された時の処理（キー3、4、6専用）
     */
    handleKeyUp(trackNumber) {
        // 親クラスのhandleKeyUpを呼ぶ（トラック2の色反転など）
        super.handleKeyUp(trackNumber);
        
        if (trackNumber === 3) {
            // キー3: 色収差エフェクトを無効化
            this.chromaticAberrationKeyPressed = false;
            if (this.chromaticAberrationPass) {
                this.chromaticAberrationPass.enabled = false;
                this.chromaticAberrationAmount = 0.0;
                this.chromaticAberrationEndTime = 0;
            }
        } else if (trackNumber === 4) {
            // キー4: グリッチエフェクトを無効化
            this.glitchKeyPressed = false;
            if (this.glitchPass) {
                this.glitchPass.enabled = false;
                this.glitchAmount = 0.0;
                this.glitchEndTime = 0;
            }
        } else if (trackNumber === 6) {
            // キー6: レーザースキャンエフェクトを無効化（キーが離されたら全てのスキャンを削除）
            this.laserScanKeyPressed = false;
            this.laserScans = [];  // 全てのスキャンを削除
            
            // パーティクルマテリアルのuniformをリセット
            if (this.gpuParticleSystem && this.gpuParticleSystem.particleMaterial && 
                this.gpuParticleSystem.particleMaterial.uniforms) {
                const uniforms = this.gpuParticleSystem.particleMaterial.uniforms;
                if (uniforms.laserScanCount) {
                    uniforms.laserScanCount.value = 0;
                }
                if (uniforms.laserScanIntensities) {
                    uniforms.laserScanIntensities.value = new Float32Array(10);
                }
            }
        }
    }
    
    /**
     * リセット
     */
    reset() {
        super.reset(); // TIMEをリセット
        this.time = 0;
        this.sketchStartTime = Date.now();
        
        // 初期化中フラグを設定（フリーズ防止）
        this.isInitializing = true;
        
        // 線描画システムを削除
        if (this.lineSystem) {
            this.lineSystem.children.forEach(line => {
                line.geometry.dispose();
                line.material.dispose();
            });
            this.scene.remove(this.lineSystem);
            this.lineSystem = null;
        }
        
        // GPUパーティクルシステムを再初期化（共有リソースを使っている場合はスキップ）
        if (this.gpuParticleSystem) {
            const particleSystem = this.gpuParticleSystem.getParticleSystem();
            if (particleSystem) {
                this.scene.remove(particleSystem);
            }
            if (!this.useSharedResources || !this.sharedResourceManager) {
            this.gpuParticleSystem.dispose();
            }
            this.gpuParticleSystem = null;
        }
        
        // 共有リソースを使っている場合は、パーティクルシステムを再取得
        if (this.useSharedResources && this.sharedResourceManager) {
            this.gpuParticleSystem = this.sharedResourceManager.getGPUParticleSystem('scene03');
            if (this.gpuParticleSystem) {
                // パーティクルデータを再初期化
                this.gpuParticleSystem.initializeParticleData();
                // パーティクルシステムをシーンに追加
                const particleSystem = this.gpuParticleSystem.getParticleSystem();
                if (particleSystem) {
                    this.scene.add(particleSystem);
                }
            }
        }
        
        // クレーターをクリア
        this.craters = [];
        this.currentCrater = null;
        
        // レーザースキャンをリセット
        this.laserScans = [];  // レーザースキャンをクリア
        // Float32Arrayをリセット
        for (let i = 0; i < this.maxScans; i++) {
            this.laserScanPositions[i] = -Math.PI / 2;
            this.laserScanWidths[i] = 0.0;
            this.laserScanIntensities[i] = 0.0;
        }
        if (this.laserScanPass) {
            this.laserScanPass.enabled = false;
        }
        
        // GPUパーティクルシステムを再作成（共有リソースを使っている場合はスキップ）
        if (!this.useSharedResources || !this.sharedResourceManager) {
        const particleCount = this.cols * this.rows;
        this.gpuParticleSystem = new GPUParticleSystem(
            this.renderer,
            particleCount,
            this.cols,
            this.rows,
            this.baseRadius,
            'scene03'  // シェーダーパス
        );
        
        // シェーダーの読み込み完了を待つ
        this.gpuParticleSystem.initPromise.then(() => {
            const newParticleSystem = this.gpuParticleSystem.getParticleSystem();
            if (newParticleSystem) {
                this.scene.add(newParticleSystem);
            }
            
            // Scene03専用：クレーター用のuniformを追加
            const positionUpdateMaterial = this.gpuParticleSystem.getPositionUpdateMaterial();
            if (positionUpdateMaterial && positionUpdateMaterial.uniforms) {
                // シェーダーに定義されているuniformを追加（シェーダー側では既に定義済み）
                positionUpdateMaterial.uniforms.craterActive = { value: 0 };
                positionUpdateMaterial.uniforms.craterLatitude = { value: 0.0 };
                positionUpdateMaterial.uniforms.craterLongitude = { value: 0.0 };
                positionUpdateMaterial.uniforms.craterRadius = { value: 0.0 };
                positionUpdateMaterial.uniforms.craterDepth = { value: 0.0 };
                positionUpdateMaterial.uniforms.craterAge = { value: 0.0 };
            }
            
            // パーティクルマテリアルにレーザースキャン用のuniformを追加
            if (this.gpuParticleSystem && this.gpuParticleSystem.particleMaterial && 
                this.gpuParticleSystem.particleMaterial.uniforms) {
                const uniforms = this.gpuParticleSystem.particleMaterial.uniforms;
                uniforms.baseRadius = { value: this.baseRadius };
                // ポリフォニック対応：複数のレーザースキャン用のuniform配列（最大10個）
                // 初期化時に全て0で埋める
                const initPositions = new Float32Array(10);
                const initWidths = new Float32Array(10);
                const initIntensities = new Float32Array(10);
                for (let i = 0; i < 10; i++) {
                    initPositions[i] = -Math.PI / 2;
                    initWidths[i] = 0.0;
                    initIntensities[i] = 0.0;
                }
                uniforms.laserScanCount = { value: 0 };
                uniforms.laserScanPositions = { value: initPositions };
                uniforms.laserScanWidths = { value: initWidths };
                uniforms.laserScanIntensities = { value: initIntensities };
            }
            
            // 線描画システムを再作成
            // 線描画システムを再作成（GPUParticleSystem側で作成）
            if (this.SHOW_LINES && this.gpuParticleSystem) {
                this.gpuParticleSystem.createLineSystem({
                    linewidth: 5,
                    additionalUniforms: {
                        baseRadius: { value: this.baseRadius },
                        laserScanCount: { value: 0 },
                        laserScanPositions: { value: (() => {
                            const arr = new Float32Array(10);
                            for (let i = 0; i < 10; i++) arr[i] = -Math.PI / 2;
                            return arr;
                        })() },
                        laserScanWidths: { value: new Float32Array(10) },
                        laserScanIntensities: { value: new Float32Array(10) }
                    },
                    scene: this.scene
                }).then(lineSystem => {
                    this.lineSystem = lineSystem;
                });
            }
            
            // 初期化完了
            this.isInitializing = false;
        }).catch(err => {
            console.error('Scene03 reset: GPUパーティクルシステムの初期化に失敗:', err);
            this.isInitializing = false;
        });
        } else {
            // 共有リソースを使っている場合は、線描画システムのみ再作成（パーティクルシステムは上で処理済み）
            // 線描画システムを再作成（GPUParticleSystem側で作成）
            if (this.SHOW_LINES && this.gpuParticleSystem) {
                this.gpuParticleSystem.createLineSystem({
                    linewidth: 5,
                    additionalUniforms: {
                        baseRadius: { value: this.baseRadius },
                        laserScanCount: { value: 0 },
                        laserScanPositions: { value: (() => {
                            const arr = new Float32Array(10);
                            for (let i = 0; i < 10; i++) arr[i] = -Math.PI / 2;
                            return arr;
                        })() },
                        laserScanWidths: { value: new Float32Array(10) },
                        laserScanIntensities: { value: new Float32Array(10) }
                    },
                    scene: this.scene
                }).then(lineSystem => {
                    this.lineSystem = lineSystem;
                });
            }
            this.isInitializing = false;
        }
    }
    
    /**
     * リサイズ処理
     */
    onResize() {
        // 親クラスのonResizeを呼ぶ（スクリーンショット用Canvasのリサイズ）
        super.onResize();
        
        // EffectComposerのサイズを更新
        if (this.composer) {
            this.composer.setSize(window.innerWidth, window.innerHeight);
        }
        
        // 色収差シェーダーのresolutionを更新
        if (this.chromaticAberrationPass && this.chromaticAberrationPass.material && this.chromaticAberrationPass.material.uniforms) {
            this.chromaticAberrationPass.material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
        }
        
        // グリッチシェーダーのresolutionを更新
        if (this.glitchPass && this.glitchPass.material && this.glitchPass.material.uniforms) {
            this.glitchPass.material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
        }
        
        // レーザースキャンシェーダーのresolutionを更新
        if (this.laserScanPass && this.laserScanPass.material && this.laserScanPass.material.uniforms) {
            this.laserScanPass.material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
        }
    }
    
    /**
     * リソースの有効/無効を切り替え（update/レンダリングのスキップ制御）
     */
    setResourceActive(active) {
        if (this.gpuParticleSystem && this.gpuParticleSystem.setActive) {
            this.gpuParticleSystem.setActive(active);
        }
    }
    
    /**
     * シーン固有の要素をクリーンアップ（共有リソースを使っている場合でも呼ばれる）
     * GPUパーティクルシステム以外の要素をクリーンアップ
     */
    cleanupSceneSpecificElements() {
        console.log('Scene03.cleanupSceneSpecificElements: シーン固有要素をクリーンアップ');
        
        // 線描画システムを破棄
        if (this.lineSystem) {
            this.lineSystem.children.forEach(line => {
                if (line.geometry) line.geometry.dispose();
                if (line.material) line.material.dispose();
            });
            this.scene.remove(this.lineSystem);
            this.lineSystem = null;
        }
        
        // クレーターをクリア
        this.craters = [];
        this.currentCrater = null;
        
        // レーザースキャンをリセット
        this.laserScans = [];
        if (this.laserScanPass) {
            this.laserScanPass.enabled = false;
        }
        
        // 時間変数をリセット
        this.time = 0.0;
        this.sketchStartTime = Date.now();
    }
    
    /**
     * クリーンアップ処理（シーン切り替え時に呼ばれる）
     */
    dispose() {
        console.log('Scene03.dispose: クリーンアップ開始');
        
        // GPUパーティクルシステムを破棄（共有リソースを使っている場合は返却のみ）
        if (this.gpuParticleSystem) {
            const particleSystem = this.gpuParticleSystem.getParticleSystem();
            if (particleSystem) {
                this.scene.remove(particleSystem);
            }
            
            if (this.useSharedResources && this.sharedResourceManager) {
                // 共有リソースの場合は返却のみ（disposeしない）
                this.sharedResourceManager.releaseGPUParticleSystem('scene03');
                console.log('[Scene03] 共有リソースを返却（メモリ上には保持）');
            } else {
                // 通常の場合はdispose
            this.gpuParticleSystem.dispose();
            }
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
        
        // 個別に保持しているライトもクリア
        this.directionalLight1 = null;
        this.directionalLight2 = null;
        
        // クレーターをクリア
        this.craters = [];
        this.currentCrater = null;
        
        // レーザースキャンをクリア
        this.laserScans = [];
        
        // エフェクトパスを破棄
        if (this.chromaticAberrationPass) {
            this.chromaticAberrationPass = null;
        }
        if (this.glitchPass) {
            this.glitchPass = null;
        }
        if (this.laserScanPass) {
            this.laserScanPass = null;
        }
        if (this.composer) {
            this.composer.dispose();
            this.composer = null;
        }
        
        console.log('Scene03.dispose: クリーンアップ完了');
        
        // 親クラスのdisposeを呼ぶ
        super.dispose();
    }
}

