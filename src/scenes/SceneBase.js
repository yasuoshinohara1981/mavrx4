/**
 * シーンの基底クラス
 * すべてのシーンはこのクラスを継承
 */

import * as THREE from 'three';
import { CameraParticle } from '../lib/CameraParticle.js';
import { HUD } from '../lib/HUD.js';
import { ColorInversion } from '../lib/ColorInversion.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export class SceneBase {
    constructor(renderer, camera) {
        this.renderer = renderer;
        this.camera = camera;
        this.scene = null;
        this.title = 'Base Scene';
        
        // 背景色の制御
        this.backgroundWhite = false;
        this.backgroundWhiteEndTime = 0;
        
        // カメラパーティクル
        this.cameraParticles = [];
        this.currentCameraIndex = 0;
        this.cameraTriggerCounter = 0;
        this.cameraTriggerInterval = 180;
        
        // HUD
        this.hud = null;
        this.showHUD = true;
        this.lastFrameTime = null;  // FPS計算用
        this.oscStatus = 'Unknown';  // OSC接続状態
        this.particleCount = 0;  // パーティクル数
        this.time = 0.0;  // 時間変数（サブクラスで設定）
        
        // 色反転エフェクト（共通化）
        this.colorInversion = null;
        
        // ポストプロセッシングエフェクト（共通化）
        this.composer = null;
        this.chromaticAberrationPass = null;
        this.chromaticAberrationAmount = 0.0;  // 色収差の強度（0.0〜1.0）
        this.chromaticAberrationEndTime = 0;  // エフェクト終了時刻（サスティン用）
        this.chromaticAberrationKeyPressed = false;  // キーが押されているか
        
        this.glitchPass = null;
        this.glitchAmount = 0.0;  // グリッチの強度（0.0〜1.0）
        this.glitchEndTime = 0;  // エフェクト終了時刻（サスティン用）
        this.glitchKeyPressed = false;  // キーが押されているか
        
        // 表示設定
        this.SHOW_PARTICLES = false;
        this.SHOW_LINES = true;
        this.SHOW_CAMERA_DEBUG = false;  // カメラパーティクルのデバッグ表示（デフォルトオフ、'c'キーで切り替え）
        this.SHOW_CAMERA_DEBUG_CIRCLES = false;  // カメラ周りのCircle表示（デフォルトオフ）
        
        // カメラデバッグ用オブジェクト
        this.cameraDebugGroup = null;
        this.cameraDebugSpheres = [];
        this.cameraDebugLines = [];
        this.cameraDebugCircles = [];  // 周囲のCircle
        this.cameraDebugCanvas = null;
        this.cameraDebugCtx = null;
        this.cameraDebugTextPositions = []; // テキスト位置のスムーズ化用
        
        // 座標軸ヘルパー（AxesHelper）
        this.axesHelper = null;
        this.SHOW_AXES = false;  // デバッグ用：座標軸を表示するか
        
        // スクリーンショット用テキスト
        this.screenshotText = '';
        this.showScreenshotText = false;
        this.pendingScreenshot = false;
        this.screenshotTextEndTime = 0;
        this.screenshotTextX = 0;
        this.screenshotTextY = 0;
        this.screenshotTextSize = 48;
        this.pendingScreenshotFilename = '';
        this.screenshotCanvas = null;
        this.screenshotCtx = null;
        this.screenshotExecuting = false;  // スクリーンショット実行中フラグ
        
        // エフェクト状態管理（トラック1-9のオン/オフ）
        // デフォルト：3と4以外はオン
        this.trackEffects = {
            1: true,   // カメラ切り替え（表示のみ、実際の切り替えは別処理）
            2: true,   // 色反転
            3: false,  // 色収差（オフ）
            4: false,  // グリッチ（オフ）
            5: true,   // シーン固有のエフェクト（爆発、圧力など）
            6: true,   // 予備
            7: true,   // 予備
            8: true,   // 予備
            9: true    // 予備
        };
        
        this.init();
    }
    
    init() {
        // シーンを作成
        this.scene = new THREE.Scene();
        
        // デバッグ用シーンを作成（エフェクトから除外するため）
        this.debugScene = new THREE.Scene();
        
        // カメラとHUDを初期化
        this.initializeCameraAndHUD();
        
        // カメラデバッグ用グループを作成（元のsceneに追加）
        this.cameraDebugGroup = new THREE.Group();
        this.scene.add(this.cameraDebugGroup);
        
        // カメラデバッグ用Canvasを作成
        this.cameraDebugCanvas = document.createElement('canvas');
        this.cameraDebugCanvas.width = window.innerWidth;
        this.cameraDebugCanvas.height = window.innerHeight;
        this.cameraDebugCanvas.style.position = 'absolute';
        this.cameraDebugCanvas.style.top = '0';
        this.cameraDebugCanvas.style.left = '0';
        this.cameraDebugCanvas.style.pointerEvents = 'none';
        this.cameraDebugCanvas.style.zIndex = '1000';
        this.cameraDebugCtx = this.cameraDebugCanvas.getContext('2d');
        this.cameraDebugCtx.font = '16px monospace';
        this.cameraDebugCtx.textAlign = 'center';
        this.cameraDebugCtx.textBaseline = 'bottom';
        document.body.appendChild(this.cameraDebugCanvas);
        
        // カメラデバッグ用オブジェクトを初期化
        this.initCameraDebugObjects();
        
        // 座標軸ヘルパーを作成（元のsceneに追加）
        this.axesHelper = new THREE.AxesHelper(1000);  // 1000の長さの軸
        this.axesHelper.visible = this.SHOW_AXES;
        this.scene.add(this.axesHelper);
    }
    
    /**
     * カメラとHUDの初期化（共通処理）
     */
    initializeCameraAndHUD() {
        // カメラ用パーティクルを初期化（8個）
        for (let i = 0; i < 8; i++) {
            const cameraParticle = new CameraParticle();
            this.setupCameraParticleDistance(cameraParticle);
            this.cameraParticles.push(cameraParticle);
        }
        this.currentCameraIndex = 0;
        
        // HUDを初期化
        this.hud = new HUD();
        
        // スクリーンショット用Canvasを初期化
        this.initScreenshotCanvas();
    }
    
    /**
     * スクリーンショット用Canvasを初期化
     */
    initScreenshotCanvas() {
        if (this.screenshotCanvas) return;
        
        this.screenshotCanvas = document.createElement('canvas');
        this.screenshotCanvas.style.position = 'absolute';
        this.screenshotCanvas.style.top = '0';
        this.screenshotCanvas.style.left = '0';
        this.screenshotCanvas.style.pointerEvents = 'none';
        this.screenshotCanvas.style.zIndex = '1000';
        this.screenshotCtx = this.screenshotCanvas.getContext('2d');
        
        // レンダラーの親要素に追加
        if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentElement) {
            this.renderer.domElement.parentElement.appendChild(this.screenshotCanvas);
        }
        
        this.resizeScreenshotCanvas();
    }
    
    /**
     * スクリーンショット用Canvasのサイズを更新
     */
    resizeScreenshotCanvas() {
        if (!this.screenshotCanvas || !this.renderer) return;
        
        const size = new THREE.Vector2();
        this.renderer.getSize(size);
        const width = size.width;
        const height = size.height;
        
        this.screenshotCanvas.width = width;
        this.screenshotCanvas.height = height;
        this.screenshotCanvas.style.width = `${width}px`;
        this.screenshotCanvas.style.height = `${height}px`;
    }
    
    /**
     * カメラパーティクルの距離パラメータを設定（各Sceneでオーバーライド可能）
     */
    setupCameraParticleDistance(cameraParticle) {
        // デフォルト値を使用（各Sceneで必要に応じてオーバーライド）
    }
    
    /**
     * セットアップ処理（シーン切り替え時に呼ばれる）
     */
    async setup() {
        // 色反転エフェクトを初期化（すべてのシーンで使用可能）
        console.log('SceneBase.setup: ColorInversion初期化開始');
        this.colorInversion = new ColorInversion(this.renderer, this.scene, this.camera);
        console.log('SceneBase.setup: ColorInversionインスタンス作成完了');
        
        // init()はコンストラクタで呼ばれるが、非同期処理が完了するまで待つ
        // シェーダーの読み込みが完了するまで待つ（最大2秒）
        let waitCount = 0;
        while (!this.colorInversion.initialized && waitCount < 100) {
            await new Promise(resolve => setTimeout(resolve, 20));
            waitCount++;
        }
        if (this.colorInversion.initialized) {
            console.log('SceneBase.setup: ColorInversion初期化完了');
        } else {
            console.warn('SceneBase.setup: ColorInversion初期化タイムアウト');
        }
        
        // ポストプロセッシングエフェクトを初期化（すべてのシーンで使用可能）
        await this.initChromaticAberration();
        
        // エフェクトの初期状態を設定（全てオフ）
        this.initializeEffectStates();
        
        // サブクラスで実装
    }
    
    /**
     * エフェクトの初期状態を設定（デフォルトは全てオフ）
     */
    initializeEffectStates() {
        console.log('initializeEffectStates: 開始');
        
        // トラック2: 色反転エフェクト（デフォルトはオフ）
        if (this.colorInversion) {
            console.log('initializeEffectStates: 色反転エフェクトをオフに設定');
            this.colorInversion.setEnabled(false);
            // 確実にオフにするため、もう一度確認
            if (this.colorInversion.inversionPass) {
                this.colorInversion.inversionPass.enabled = false;
            }
        } else {
            console.warn('initializeEffectStates: colorInversionがnull');
        }
        
        // トラック3: 色収差エフェクト（デフォルトはオフ）
        if (this.chromaticAberrationPass) {
            console.log('initializeEffectStates: 色収差エフェクトをオフに設定');
            this.chromaticAberrationPass.enabled = false;
            this.chromaticAberrationAmount = 0.0;
            this.chromaticAberrationEndTime = 0;
            this.chromaticAberrationKeyPressed = false;
        } else {
            console.warn('initializeEffectStates: chromaticAberrationPassがnull');
        }
        
        // トラック4: グリッチエフェクト（デフォルトはオフ）
        if (this.glitchPass) {
            console.log('initializeEffectStates: グリッチエフェクトをオフに設定');
            this.glitchPass.enabled = false;
            this.glitchAmount = 0.0;
            this.glitchEndTime = 0;
            this.glitchKeyPressed = false;
        } else {
            console.warn('initializeEffectStates: glitchPassがnull');
        }
        
        console.log('initializeEffectStates: 完了 - 全てオフ');
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
        } catch (err) {
            console.error('色収差シェーダーの読み込みに失敗:', err);
        }
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
     * 更新処理（毎フレーム呼ばれる）
     * @param {number} deltaTime - 前フレームからの経過時間（秒）
     */
    update(deltaTime) {
        // 背景色のタイマーチェック
        if (this.backgroundWhiteEndTime > 0 && Date.now() >= this.backgroundWhiteEndTime) {
            this.backgroundWhite = false;
            this.backgroundWhiteEndTime = 0;
        }
        
        // カメラパーティクルの移動を有効/無効化（trackEffects[1]に基づく）
        this.cameraParticles.forEach(cp => {
            cp.enableMovement = this.trackEffects[1];
        });
        
        // カメラパーティクルを更新（全部のカメラパーティクルを更新）
        this.cameraParticles.forEach(cp => {
            cp.update();
        });
        
        // カメラにランダムな力を加える
        this.updateCameraForce();
        
        // カメラの位置を更新
        this.updateCamera();
        
        // 色反転エフェクトの更新（サスティン終了チェック）
        if (this.colorInversion) {
            this.colorInversion.update();
            // trackEffects[2]がfalseの場合は確実にオフにする
            if (!this.trackEffects[2] && this.colorInversion.isEnabled()) {
                this.colorInversion.setEnabled(false);
            }
        }
        
        // 色収差エフェクトの更新（サスティン終了チェック）
        this.updateChromaticAberration();
        // trackEffects[3]がfalseの場合は確実にオフにする
        if (!this.trackEffects[3] && this.chromaticAberrationPass && this.chromaticAberrationPass.enabled) {
            this.chromaticAberrationPass.enabled = false;
            this.chromaticAberrationAmount = 0.0;
            this.chromaticAberrationEndTime = 0;
            this.chromaticAberrationKeyPressed = false;
        }
        
        // グリッチエフェクトの更新（サスティン終了チェックと時間更新）
        this.updateGlitch();
        // trackEffects[4]がfalseの場合は確実にオフにする
        if (!this.trackEffects[4] && this.glitchPass && this.glitchPass.enabled) {
            this.glitchPass.enabled = false;
            this.glitchAmount = 0.0;
            this.glitchEndTime = 0;
            this.glitchKeyPressed = false;
        }
        
        // 時間を更新（HUD表示用、共通処理）
        // ただし、サブクラスで独自の時間更新（timeIncrementなど）を使っている場合は、そちらで更新される
        // Scene01やScene07は独自のtimeIncrementを使うため、ここでは更新しない
        // Scene02など、deltaTimeを使うシーンのみ、ここで更新する
        // this.time += deltaTime;  // サブクラスで独自更新するため、コメントアウト
        
        // サブクラスの更新処理
        this.onUpdate(deltaTime);
    }
    
    /**
     * カメラにランダムな力を加える（共通処理）
     */
    updateCameraForce() {
        // trackEffects[1]がオフの場合は処理をスキップ
        if (!this.trackEffects[1]) {
            return;
        }
        
        this.cameraTriggerCounter++;
        if (this.cameraTriggerCounter >= this.cameraTriggerInterval) {
            if (this.cameraParticles[this.currentCameraIndex]) {
                this.cameraParticles[this.currentCameraIndex].applyRandomForce();
            }
            this.cameraTriggerCounter = 0;
        }
    }
    
    /**
     * カメラの位置を更新（最適化：matrixWorldNeedsUpdateを回避）
     */
    updateCamera() {
        if (this.cameraParticles[this.currentCameraIndex]) {
            const cameraPos = this.cameraParticles[this.currentCameraIndex].getPosition();
            this.camera.position.copy(cameraPos);
            this.camera.lookAt(0, 0, 0);
            // matrixWorldNeedsUpdateをfalseにして不要な再計算を回避
            this.camera.matrixWorldNeedsUpdate = false;
        }
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
     * サブクラスの更新処理（オーバーライド用）
     */
    onUpdate(deltaTime) {
        // サブクラスで実装
    }
    
    /**
     * 描画処理
     */
    render() {
        // 背景色を設定
        if (this.backgroundWhite) {
            this.renderer.setClearColor(0xffffff);
        } else {
            this.renderer.setClearColor(0x000000);
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
                 (this.glitchPass && this.glitchPass.enabled))) {
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
                
                // 色反転エフェクトが有効な場合は、HUDの色も反転する
                const isInverted = this.colorInversion && this.colorInversion.isEnabled();
                
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
                    isInverted, // backgroundWhite（色反転エフェクトが有効な場合はtrue）
                    this.oscStatus,
                    this.particleCount,
                    this.trackEffects  // エフェクト状態を渡す
                );
            } else {
                // HUDが非表示の時はCanvasをクリア
                this.hud.clear();
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
     * OSCメッセージのハンドリング
     * @param {Object} message - OSCメッセージ
     */
    handleOSC(message) {
        const trackNumber = message.trackNumber;
        
        // trackEffectsの状態をチェック（オフの場合は処理をスキップ）
        if (trackNumber >= 1 && trackNumber <= 9 && !this.trackEffects[trackNumber]) {
            console.log(`Track ${trackNumber}: オフのため処理をスキップ`);
            return;
        }
        
        // トラック1: カメラをランダムに切り替え（全シーン共通）
        if (trackNumber === 1) {
            this.switchCameraRandom();
            return;  // 処理済み
        }
        
        // トラック2: 色反転エフェクト（OSCで制御、共通化）
        if (trackNumber === 2) {
            const args = message.args || [];
            const velocity = args[0] || 127.0;
            const durationMs = args[2] || 0.0;
            if (this.colorInversion) {
                // durationMsが0の場合はトグル動作（キー入力時）
                if (durationMs === 0 && args.length === 0) {
                    const currentState = this.colorInversion.isEnabled();
                    this.colorInversion.setEnabled(!currentState);
                    console.log(`Track 2: Color inversion ${!currentState ? 'ON' : 'OFF'}`);
                } else {
                    // durationMsが指定されている場合はapplyを使用（OSC時）
                    this.colorInversion.apply(velocity, durationMs);
                }
            }
            return;  // 処理済み
        }
        
        // トラック3: 色収差エフェクト（共通化）
        if (trackNumber === 3) {
            const args = message.args || [];
            const velocity = args[1] || 127.0;
            const noteNumber = args[0] || 64.0;
            const durationMs = args[2] || 0.0;
            this.applyChromaticAberration(velocity, noteNumber, durationMs);
            return;  // 処理済み
        }
        
        // トラック4: グリッチエフェクト（共通化）
        if (trackNumber === 4) {
            const args = message.args || [];
            const velocity = args[1] || 127.0;
            const noteNumber = args[0] || 64.0;
            const durationMs = args[2] || 0.0;
            this.applyGlitch(velocity, noteNumber, durationMs);
            return;  // 処理済み
        }
        
        // その他のトラックはサブクラスで処理
        // サブクラスのOSC処理
        this.handleTrackNumber(trackNumber, message);
    }
    
    /**
     * キーダウン処理（全シーン共通）
     * 注意: 数字キー1-9はtoggleEffect()で処理されるため、ここでは呼ばれない
     * このメソッドは主にOSCメッセージからの呼び出し用
     */
    handleKeyDown(trackNumber) {
        // このメソッドは主にOSCメッセージからの呼び出し用
        // 数字キー1-9はtoggleEffect()で処理される
    }
    
    /**
     * キーアップ処理（全シーン共通）
     */
    handleKeyUp(trackNumber) {
        // トラック2: 色反転エフェクト（キーが離されたら無効）
        if (trackNumber === 2) {
            if (this.colorInversion) {
                this.colorInversion.setEnabled(false);
                console.log('Track 2: Color inversion OFF');
            }
        }
        // トラック3: 色収差エフェクト（キーが離されたら無効）
        else if (trackNumber === 3) {
            this.chromaticAberrationKeyPressed = false;
            if (this.chromaticAberrationPass) {
                this.chromaticAberrationPass.enabled = false;
                this.chromaticAberrationAmount = 0.0;
                this.chromaticAberrationEndTime = 0;
            }
        }
        // トラック4: グリッチエフェクト（キーが離されたら無効）
        else if (trackNumber === 4) {
            this.glitchKeyPressed = false;
            if (this.glitchPass) {
                this.glitchPass.enabled = false;
                this.glitchAmount = 0.0;
                this.glitchEndTime = 0;
            }
        }
    }
    
    /**
     * トラック番号を処理（サブクラスでオーバーライド）
     */
    handleTrackNumber(trackNumber, message) {
        // サブクラスで実装
    }
    
    /**
     * エフェクトのオン/オフを切り替え（数字キー1-9用）
     * @param {number} trackNumber - トラック番号（1-9）
     */
    toggleEffect(trackNumber) {
        if (trackNumber < 1 || trackNumber > 9) return;
        
        // エフェクト状態を切り替え
        this.trackEffects[trackNumber] = !this.trackEffects[trackNumber];
        const isOn = this.trackEffects[trackNumber];
        
        console.log(`Track ${trackNumber}: ${isOn ? 'ON' : 'OFF'}`);
        
        // 各トラックのエフェクトを実際に適用/解除
        if (trackNumber === 1) {
            // トラック1: カメラをランダムに切り替え（ONの時のみ実行）
            if (isOn) {
                this.switchCameraRandom();
            }
        } else if (trackNumber === 2) {
            // 色反転エフェクト
            if (this.colorInversion) {
                this.colorInversion.setEnabled(isOn);
            }
        } else if (trackNumber === 3) {
            // 色収差エフェクト
            if (this.chromaticAberrationPass) {
                this.chromaticAberrationPass.enabled = isOn;
                if (!isOn) {
                    this.chromaticAberrationAmount = 0.0;
                    this.chromaticAberrationEndTime = 0;
                    this.chromaticAberrationKeyPressed = false;
                }
            }
        } else if (trackNumber === 4) {
            // グリッチエフェクト
            if (this.glitchPass) {
                this.glitchPass.enabled = isOn;
                if (!isOn) {
                    this.glitchAmount = 0.0;
                    this.glitchEndTime = 0;
                    this.glitchKeyPressed = false;
                }
            }
        }
        // トラック5-9は各シーンで個別に処理（爆発、圧力など）
        // サブクラスでhandleTrackNumber()をオーバーライドして処理
    }
    
    
    /**
     * 背景を白にする
     */
    setBackgroundWhite(white, endTime = null) {
        this.backgroundWhite = white;
        if (endTime !== null) {
            this.backgroundWhiteEndTime = endTime;
        }
    }
    
    /**
     * カメラをランダムに切り替える
     */
    switchCameraRandom() {
        let newIndex = this.currentCameraIndex;
        while (newIndex === this.currentCameraIndex) {
            newIndex = Math.floor(Math.random() * this.cameraParticles.length);
        }
        this.currentCameraIndex = newIndex;
        
        // 8個全部のカメラにランダムな力を加える
        console.log(`switchCameraRandom: Applying random force to all ${this.cameraParticles.length} camera particles`);
        this.cameraParticles.forEach((cp, index) => {
            cp.applyRandomForce();
            console.log(`  - Camera particle #${index + 1}: force applied`);
        });
        
        console.log(`Camera switched to index: ${this.currentCameraIndex}`);
    }
    
    /**
     * リセット処理
     */
    reset() {
        // TIMEをリセット（エフェクトはそのまま）
        if (this.hud && this.hud.resetTime) {
            this.hud.resetTime();
        }
        
        // サブクラスで実装
    }
    
    /**
     * クリーンアップ処理（シーン切り替え時に呼ばれる）
     * Three.jsのオブジェクトを破棄してメモリリークを防ぐ
     */
    dispose() {
        console.log('SceneBase.dispose: クリーンアップ開始');
        
        // シーン内のすべてのオブジェクトを破棄
        if (this.scene) {
            this.scene.traverse((object) => {
                // ジオメトリを破棄
                if (object.geometry) {
                    object.geometry.dispose();
                }
                
                // マテリアルを破棄
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
                
                // テクスチャを破棄
                if (object.material && object.material.map) {
                    object.material.map.dispose();
                }
            });
            
            // シーンをクリア
            while (this.scene.children.length > 0) {
                this.scene.remove(this.scene.children[0]);
            }
        }
        
        // デバッグシーンも同様にクリア
        if (this.debugScene) {
            while (this.debugScene.children.length > 0) {
                this.debugScene.remove(this.debugScene.children[0]);
            }
        }
        
        // カメラデバッググループをクリア
        if (this.cameraDebugGroup) {
            while (this.cameraDebugGroup.children.length > 0) {
                this.cameraDebugGroup.remove(this.cameraDebugGroup.children[0]);
            }
        }
        
        // EffectComposerを破棄
        if (this.composer) {
            this.composer.dispose();
            this.composer = null;
        }
        
        // ColorInversionを破棄
        if (this.colorInversion && this.colorInversion.dispose) {
            this.colorInversion.dispose();
            this.colorInversion = null;
        }
        
        // カメラデバッグ用Canvasを削除
        if (this.cameraDebugCanvas && this.cameraDebugCanvas.parentElement) {
            this.cameraDebugCanvas.parentElement.removeChild(this.cameraDebugCanvas);
            this.cameraDebugCanvas = null;
            this.cameraDebugCtx = null;
        }
        
        // スクリーンショット用Canvasを削除
        if (this.screenshotCanvas && this.screenshotCanvas.parentElement) {
            this.screenshotCanvas.parentElement.removeChild(this.screenshotCanvas);
            this.screenshotCanvas = null;
            this.screenshotCtx = null;
        }
        
        // 配列をクリア
        this.cameraDebugSpheres = [];
        this.cameraDebugLines = [];
        this.cameraDebugCircles = [];
        this.cameraDebugTextPositions = [];
        
        console.log('SceneBase.dispose: クリーンアップ完了');
        
        // サブクラスで追加のクリーンアップ処理を実装可能
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
     * リサイズ処理
     */
    onResize() {
        // 色反転エフェクトのリサイズ
        if (this.colorInversion) {
            this.colorInversion.onResize();
        }
        
        // ポストプロセッシングエフェクトのリサイズ
        if (this.composer) {
            this.composer.setSize(window.innerWidth, window.innerHeight);
        }
        
        // サブクラスで実装
    }
    
    /**
     * OSC状態を設定
     */
    setOSCStatus(status) {
        this.oscStatus = status;
    }
    
    /**
     * パーティクル数を設定
     */
    setParticleCount(count) {
        this.particleCount = count;
    }
    
    /**
     * スクリーンショット用テキストを設定
     */
    setScreenshotText(text) {
        this.screenshotText = text;
    }
    
    /**
     * スクリーンショットを撮影
     * @param {boolean} is16_9 - trueの場合は16:9枠、falseの場合は正方形枠
     */
    takeScreenshot(is16_9) {
        // 既にスクリーンショット処理中の場合はスキップ
        if (this.pendingScreenshot || this.screenshotExecuting) {
            return;
        }
        
        if (!this.renderer || !this.renderer.domElement) {
            return;
        }
        
        // スクリーンショットファイル名を生成
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const second = String(now.getSeconds()).padStart(2, '0');
        const filename = `screenshot_${year}${month}${day}_${hour}${minute}${second}.png`;
        
        const size = new THREE.Vector2();
        this.renderer.getSize(size);
        const width = size.width;
        const height = size.height;
        
        let frameWidth, frameHeight, frameX, frameY;
        
        if (is16_9) {
            // YouTube用16:9の枠を計算（中央配置）
            const aspect16_9 = 16.0 / 9.0;
            
            // 画面の高さを基準に16:9の幅を計算
            frameHeight = height;
            frameWidth = frameHeight * aspect16_9;
            
            // 幅が画面より大きい場合は、幅を基準に高さを計算
            if (frameWidth > width) {
                frameWidth = width;
                frameHeight = frameWidth / aspect16_9;
            }
            
            // 中央に配置
            frameX = (width - frameWidth) / 2;
            frameY = (height - frameHeight) / 2;
        } else {
            // 正方形の枠を計算（中央配置）
            const squareSize = Math.min(width, height);
            frameWidth = squareSize;
            frameHeight = squareSize;
            frameX = (width - squareSize) / 2;
            frameY = (height - squareSize) / 2;
        }
        
        // テキストサイズを固定（画像のサイズに合わせて調整）
        this.screenshotTextSize = is16_9 ? 260 : 175;
        
        // テキストの位置をランダムに決定（より広い範囲でランダムに）
        const margin = 20;  // マージンを小さくしてより広い範囲を使用
        
        // テキストの幅を事前に計算（仮のフォントで）
        if (this.screenshotCtx) {
            this.screenshotCtx.font = `${this.screenshotTextSize}px Helvetica, Arial, sans-serif`;
            const textWidth = this.screenshotCtx.measureText(this.screenshotText).width;
            const textHeight = this.screenshotTextSize * 1.2;
            
            // テキストが枠からはみ出さない範囲を計算（CENTER揃えなので、中心位置の範囲）
            // マージンを小さくして、より広い範囲を使用
            const minX = frameX + margin + textWidth / 2;
            const maxX = frameX + frameWidth - margin - textWidth / 2;
            
            // X位置をランダムに決定（可能な限り広い範囲で）
            if (maxX < minX) {
                // テキストが大きすぎる場合は中央に配置
                this.screenshotTextX = frameX + frameWidth / 2;
            } else {
                // ランダムな位置を決定（広い範囲で）
                this.screenshotTextX = minX + Math.random() * (maxX - minX);
            }
            
            // Y位置もランダムに決定（より広い範囲で）
            const minY = frameY + margin + textHeight / 2;
            const maxY = frameY + frameHeight - margin - textHeight / 2;
            if (maxY < minY) {
                // テキストが大きすぎる場合は中央に配置
                this.screenshotTextY = frameY + frameHeight / 2;
            } else {
                // ランダムな位置を決定（広い範囲で）
                this.screenshotTextY = minY + Math.random() * (maxY - minY);
            }
        }
        
        // テキストを表示してからスクリーンショットを取る（次のフレームで）
        this.showScreenshotText = true;
        this.pendingScreenshot = true;
        this.pendingScreenshotFilename = filename;
        this.screenshotTextEndTime = Date.now() + 1000; // 1秒後
    }
    
    /**
     * スクリーンショットテキストを描画
     */
    drawScreenshotText() {
        if (!this.showScreenshotText || !this.screenshotText || this.screenshotText === '') {
            if (this.screenshotCanvas && this.screenshotCtx) {
                // テキストをクリア
                this.screenshotCtx.clearRect(0, 0, this.screenshotCanvas.width, this.screenshotCanvas.height);
            }
            return;
        }
        
        // タイマーチェック
        if (this.screenshotTextEndTime > 0 && Date.now() >= this.screenshotTextEndTime) {
            this.showScreenshotText = false;
            this.screenshotTextEndTime = 0;
            this.pendingScreenshot = false;
            if (this.screenshotCtx) {
                this.screenshotCtx.clearRect(0, 0, this.screenshotCanvas.width, this.screenshotCanvas.height);
            }
            return;
        }
        
        if (!this.screenshotCanvas || !this.screenshotCtx) {
            this.initScreenshotCanvas();
            if (!this.screenshotCanvas || !this.screenshotCtx) return;
        }
        
        // Canvasをクリア
        this.screenshotCtx.clearRect(0, 0, this.screenshotCanvas.width, this.screenshotCanvas.height);
        
        // フォントを設定
        this.screenshotCtx.font = `${this.screenshotTextSize}px Helvetica, Arial, sans-serif`;
        this.screenshotCtx.textAlign = 'center';
        this.screenshotCtx.textBaseline = 'middle';
        
        // テキストを描画（背景に応じて色を変更）
        if (this.backgroundWhite) {
            this.screenshotCtx.fillStyle = 'rgba(0, 0, 0, 1.0)';  // 白背景の場合は黒テキスト
        } else {
            this.screenshotCtx.fillStyle = 'rgba(255, 255, 255, 1.0)';  // 黒背景の場合は白テキスト
        }
        
        // テキストの位置が設定されているか確認
        if (this.screenshotTextX > 0 && this.screenshotTextY > 0) {
            this.screenshotCtx.fillText(this.screenshotText, this.screenshotTextX, this.screenshotTextY);
        } else {
            // 位置が設定されていない場合は中央に配置
            const size = new THREE.Vector2();
            this.renderer.getSize(size);
            this.screenshotTextX = size.width / 2;
            this.screenshotTextY = size.height / 2;
            this.screenshotCtx.fillText(this.screenshotText, this.screenshotTextX, this.screenshotTextY);
        }
        
        // スクリーンショットを実行（テキスト表示後に）
        // 注意: executePendingScreenshot()は1回だけ実行されるように、フラグをチェック
        if (this.pendingScreenshot && !this.screenshotExecuting) {
            // 次のフレームで実行するように遅延（テキストが確実に描画されるように）
            requestAnimationFrame(() => {
                if (this.pendingScreenshot && this.showScreenshotText && !this.screenshotExecuting) {
                    this.executePendingScreenshot();
                }
            });
        }
    }
    
    /**
     * スクリーンショットを実際に撮影（テキスト表示後に呼ばれる）
     */
    executePendingScreenshot() {
        // 既に実行中の場合はスキップ（念のため）
        if (this.screenshotExecuting) {
            return;
        }
        
        // 実行中フラグを設定（重複実行を防ぐ）
        this.screenshotExecuting = true;
        
        if (!this.pendingScreenshot || !this.showScreenshotText) {
            this.screenshotExecuting = false;
            return;
        }
        if (!this.renderer || !this.renderer.domElement) {
            this.screenshotExecuting = false;
            return;
        }
        
        // ファイル名をローカル変数に保存（非同期処理中にリセットされないように）
        const filename = this.pendingScreenshotFilename;
        
        if (!filename) {
            console.error('❌ ファイル名が設定されていません');
            this.pendingScreenshot = false;
            this.pendingScreenshotFilename = '';
            this.screenshotExecuting = false;
            return;
        }
        
        console.log(`📸 スクリーンショット撮影開始: ${filename}`);
        
        // Three.jsのCanvasとスクリーンショット用Canvasを合成
        const size = new THREE.Vector2();
        this.renderer.getSize(size);
        const width = size.width;
        const height = size.height;
        
        // 一時的なCanvasを作成して合成
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Three.jsのCanvasを描画
        tempCtx.drawImage(this.renderer.domElement, 0, 0);
        
        // HUDのCanvasを描画（HUDが表示されている場合）
        if (this.hud && this.hud.canvas && this.showHUD) {
            tempCtx.drawImage(this.hud.canvas, 0, 0);
        }
        
        // スクリーンショット用Canvas（テキスト）を描画
        if (this.screenshotCanvas) {
            tempCtx.drawImage(this.screenshotCanvas, 0, 0);
        }
        
        // 画像をBase64に変換してサーバーに送信
        tempCanvas.toBlob((blob) => {
            if (!blob) {
                console.error('❌ Blobの作成に失敗しました');
                this.pendingScreenshot = false;
                this.pendingScreenshotFilename = '';
                this.screenshotExecuting = false;
                return;
            }
            
            // BlobをBase64に変換
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result;
                
                // データの検証
                if (!base64data) {
                    console.error('❌ Base64データが生成されていません');
                    this.pendingScreenshot = false;
                    this.pendingScreenshotFilename = '';
                    this.screenshotExecuting = false;
                    return;
                }
                
                const requestData = {
                    filename: filename,
                    imageData: base64data
                };
                
                // サーバーに送信
                fetch('http://localhost:3001/api/screenshot', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestData)
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        console.log(`✅ スクリーンショット保存成功: ${data.path}`);
                    } else {
                        console.error('❌ スクリーンショット保存エラー:', data.error);
                    }
                    // 成功/失敗に関わらず、フラグをリセット
                    this.pendingScreenshot = false;
                    this.pendingScreenshotFilename = '';
                    this.screenshotExecuting = false;
                })
                .catch(error => {
                    console.error('❌ スクリーンショット送信エラー:', error.message);
                    // エラー時もフラグをリセット
                    this.pendingScreenshot = false;
                    this.pendingScreenshotFilename = '';
                    this.screenshotExecuting = false;
                });
            };
            reader.onerror = (error) => {
                console.error('❌ FileReaderエラー:', error);
                this.pendingScreenshot = false;
                this.pendingScreenshotFilename = '';
                this.screenshotExecuting = false;
            };
            reader.readAsDataURL(blob);
        }, 'image/png');
    }
    
    /**
     * リサイズ処理（オーバーライド用）
     */
    onResize() {
        this.resizeScreenshotCanvas();
        
        // カメラデバッグ用Canvasをリサイズ
        if (this.cameraDebugCanvas) {
            this.cameraDebugCanvas.width = window.innerWidth;
            this.cameraDebugCanvas.height = window.innerHeight;
        }
    }
    
    /**
     * キー入力処理（c/Cキーでカメラデバッグ表示を切り替え、またはカメラを切り替え）
     */
    handleKeyPress(key) {
        if (key === 'c' || key === 'C') {
            // 小文字のc: カメラデバッグ表示を切り替え
            if (key === 'c') {
                this.SHOW_CAMERA_DEBUG = !this.SHOW_CAMERA_DEBUG;
                console.log(`Camera debug: ${this.SHOW_CAMERA_DEBUG ? 'ON' : 'OFF'}`);
                
                // カメラデバッググループの表示/非表示を切り替え
                if (this.cameraDebugGroup) {
                    this.cameraDebugGroup.visible = this.SHOW_CAMERA_DEBUG;
                }
                
                // 座標軸も連動させる
                this.SHOW_AXES = this.SHOW_CAMERA_DEBUG;
                if (this.axesHelper) {
                    this.axesHelper.visible = this.SHOW_AXES;
                }
            }
            // 大文字のC: カメラを切り替え
            else if (key === 'C') {
                this.currentCameraIndex = (this.currentCameraIndex + 1) % this.cameraParticles.length;
                console.log(`Camera switched to #${this.currentCameraIndex + 1}`);
            }
        }
        // aキー: 座標軸（AxesHelper）の表示/非表示を切り替え
        else if (key === 'a' || key === 'A') {
            this.SHOW_AXES = !this.SHOW_AXES;
            if (this.axesHelper) {
                this.axesHelper.visible = this.SHOW_AXES;
            }
            console.log(`Axes helper: ${this.SHOW_AXES ? 'ON' : 'OFF'}`);
        }
    }
    
    /**
     * カメラデバッグ用オブジェクトを初期化
     */
    initCameraDebugObjects() {
        if (!this.cameraDebugGroup) return;
        
        // 各カメラパーティクル用のSphereとLineを作成
        for (let i = 0; i < this.cameraParticles.length; i++) {
            // 赤いSphere（塗りつぶし、ライティングあり）
            const sphereSize = 15;  // 大きく（5 → 15）
            const sphereGeometry = new THREE.SphereGeometry(sphereSize, 32, 32);
            const sphereMaterial = new THREE.MeshStandardMaterial({
                color: 0xff0000,  // 赤
                transparent: true,
                opacity: 0.8,
                emissive: 0x330000,  // 発光色（控えめ）
                emissiveIntensity: 0.2,
                roughness: 0.8,
                metalness: 0.0
            });
            const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
            sphere.visible = false;
            this.cameraDebugGroup.add(sphere);
            this.cameraDebugSpheres.push(sphere);
            
            // 周囲のCircle（3つの方向に配置）
            // Circleの大きさは固定（SphereとCircleの間を太くするため）
            const circleRadius = 30;  // 大きく（12 → 30）して見やすくする
            const circleSegments = 32;
            
            // X-Y平面のCircle（前回より少し細く：0.9 → 0.94）
            const circleXYGeometry = new THREE.RingGeometry(circleRadius * 0.94, circleRadius, circleSegments);
            const circleXYMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,  // 赤
                transparent: true,
                opacity: 1.0,  // 0.6 → 1.0（見やすくする）
                side: THREE.DoubleSide,
                depthWrite: false  // 深度書き込みを無効化（透明なオブジェクトの描画順の問題を回避）
            });
            const circleXY = new THREE.Mesh(circleXYGeometry, circleXYMaterial);
            circleXY.rotation.x = -Math.PI / 2;  // X-Y平面に配置
            circleXY.visible = false;
            circleXY.renderOrder = 1000;  // 描画順を後ろに（他のオブジェクトの上に描画）
            this.cameraDebugGroup.add(circleXY);
            
            // X-Z平面のCircle（前回より少し細く：0.9 → 0.94）
            const circleXZGeometry = new THREE.RingGeometry(circleRadius * 0.94, circleRadius, circleSegments);
            const circleXZMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,  // 赤
                transparent: true,
                opacity: 1.0,  // 0.6 → 1.0（見やすくする）
                side: THREE.DoubleSide,
                depthWrite: false  // 深度書き込みを無効化
            });
            const circleXZ = new THREE.Mesh(circleXZGeometry, circleXZMaterial);
            circleXZ.visible = false;
            circleXZ.renderOrder = 1000;  // 描画順を後ろに
            this.cameraDebugGroup.add(circleXZ);
            
            // Y-Z平面のCircle（前回より少し細く：0.9 → 0.94）
            const circleYZGeometry = new THREE.RingGeometry(circleRadius * 0.94, circleRadius, circleSegments);
            const circleYZMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,  // 赤
                transparent: true,
                opacity: 1.0,  // 0.6 → 1.0（見やすくする）
                side: THREE.DoubleSide,
                depthWrite: false  // 深度書き込みを無効化
            });
            const circleYZ = new THREE.Mesh(circleYZGeometry, circleYZMaterial);
            circleYZ.rotation.y = Math.PI / 2;  // Y-Z平面に配置
            circleYZ.visible = false;
            circleYZ.renderOrder = 1000;  // 描画順を後ろに
            this.cameraDebugGroup.add(circleYZ);
            
            this.cameraDebugCircles.push([circleXY, circleXZ, circleYZ]);
            
            // デバッグ: Circleが正しく作成されたか確認
            if (i === 0) {
                console.log(`initCameraDebugObjects: Created circles for camera particle #${i + 1}`, {
                    circleXY: !!circleXY,
                    circleXZ: !!circleXZ,
                    circleYZ: !!circleYZ,
                    circlesArray: this.cameraDebugCircles[i]
                });
            }
            
            // 中心への赤い線を作成
            const lineGeometry = new THREE.BufferGeometry();
            const lineMaterial = new THREE.LineBasicMaterial({
                color: 0xff0000,  // 赤
                transparent: true,
                opacity: 0.6
            });
            const line = new THREE.Line(lineGeometry, lineMaterial);
            line.visible = false;
            this.cameraDebugGroup.add(line);
            this.cameraDebugLines.push(line);
        }
        
        this.cameraDebugGroup.visible = this.SHOW_CAMERA_DEBUG;
    }
    
    /**
     * カメラデバッグを描画
     */
    drawCameraDebug() {
        // Canvasをクリア（SHOW_CAMERA_DEBUGがfalseの時もクリアする）
        if (this.cameraDebugCtx && this.cameraDebugCanvas) {
            this.cameraDebugCtx.clearRect(0, 0, this.cameraDebugCanvas.width, this.cameraDebugCanvas.height);
        }
        
        if (!this.SHOW_CAMERA_DEBUG || !this.cameraDebugGroup) return;
        
        // 中心位置を取得（サブクラスでオーバーライド可能）
        const center = this.getCameraDebugCenter ? this.getCameraDebugCenter() : new THREE.Vector3(0, 0, 0);
        
        // 各カメラパーティクルを描画
        for (let i = 0; i < this.cameraParticles.length; i++) {
            const cp = this.cameraParticles[i];
            const pos = cp.getPosition();
            
            // Sphereを更新
            if (i < this.cameraDebugSpheres.length) {
                const sphere = this.cameraDebugSpheres[i];
                sphere.position.copy(pos);
                sphere.visible = true;
            }
            
            // 周囲のCircleを更新（スケールも確実に1.0に設定）
            // SHOW_CAMERA_DEBUG_CIRCLESフラグで制御
            if (this.SHOW_CAMERA_DEBUG_CIRCLES && i < this.cameraDebugCircles.length) {
                const circles = this.cameraDebugCircles[i];
                if (circles && Array.isArray(circles)) {
                    circles.forEach((circle, circleIndex) => {
                        if (circle) {
                            circle.position.copy(pos);
                            circle.scale.set(1.0, 1.0, 1.0);  // スケールを確実に1.0に設定（巨大化を防ぐ）
                            circle.visible = true;
                            
                            // マテリアルのopacityも確認
                            if (circle.material) {
                                circle.material.opacity = 1.0;  // 確実に不透明に
                                circle.material.needsUpdate = true;
                            }
                        } else {
                            console.warn(`drawCameraDebug: Camera particle #${i + 1}, circle #${circleIndex} is null`);
                        }
                    });
                } else {
                    console.warn(`drawCameraDebug: Camera particle #${i + 1} has invalid circles array`, circles);
                }
            } else if (i < this.cameraDebugCircles.length) {
                // SHOW_CAMERA_DEBUG_CIRCLESがfalseの場合はCircleを非表示
                const circles = this.cameraDebugCircles[i];
                if (circles && Array.isArray(circles)) {
                    circles.forEach((circle) => {
                        if (circle) {
                            circle.visible = false;
                        }
                    });
                }
            }
            
            // 中心への線を更新
            if (i < this.cameraDebugLines.length) {
                const line = this.cameraDebugLines[i];
                if (line && line.geometry) {
                    const positions = new Float32Array([
                        pos.x, pos.y, pos.z,
                        center.x, center.y, center.z
                    ]);
                    line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    line.geometry.attributes.position.needsUpdate = true;
                    line.visible = true;
                } else {
                    console.warn(`drawCameraDebug: Camera particle #${i + 1} has no line or line.geometry`);
                }
            }
            
            // テキストを描画（位置を安定させるため、前フレームの位置を保持）
            if (this.cameraDebugCtx && this.cameraDebugCanvas) {
                const vector = pos.clone();
                vector.project(this.camera);
                
                const x = (vector.x * 0.5 + 0.5) * this.cameraDebugCanvas.width;
                const y = (-vector.y * 0.5 + 0.5) * this.cameraDebugCanvas.height;
                
                // 画面外や背面の場合は描画しない
                if (x >= 0 && x <= this.cameraDebugCanvas.width && y >= 0 && y <= this.cameraDebugCanvas.height && vector.z < 1.0 && vector.z > -1.0) {
                    // 位置が急激に変化する場合は描画をスキップ（ちらつき防止）
                    if (!this.cameraDebugTextPositions) {
                        this.cameraDebugTextPositions = [];
                    }
                    if (!this.cameraDebugTextPositions[i]) {
                        this.cameraDebugTextPositions[i] = { x, y };
                    }
                    
                    // 前フレームとの距離を計算
                    const prevPos = this.cameraDebugTextPositions[i];
                    const dx = x - prevPos.x;
                    const dy = y - prevPos.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    // 急激な変化（100px以上）の場合は描画をスキップ
                    if (distance < 100) {
                        // スムーズに補間（前フレームの位置と現在の位置を混ぜる）
                        const smoothX = prevPos.x * 0.3 + x * 0.7;
                        const smoothY = prevPos.y * 0.3 + y * 0.7;
                        
                        this.cameraDebugCtx.save();
                        this.cameraDebugCtx.fillStyle = 'white';  // 白
                        this.cameraDebugCtx.font = '16px monospace';
                        this.cameraDebugCtx.textAlign = 'center';
                        this.cameraDebugCtx.textBaseline = 'bottom';
                        
                        // カメラ番号と座標を表示
                        const cameraText = `camera #${i + 1}`;
                        const coordText = `(${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)})`;
                        this.cameraDebugCtx.fillText(cameraText, smoothX, smoothY - 80);
                        this.cameraDebugCtx.fillText(coordText, smoothX, smoothY - 60);
                        
                        this.cameraDebugCtx.restore();
                        
                        // 位置を更新
                        this.cameraDebugTextPositions[i] = { x: smoothX, y: smoothY };
                    } else {
                        // 急激な変化の場合は位置だけ更新（描画はスキップ）
                        this.cameraDebugTextPositions[i] = { x, y };
                    }
                }
            }
        }
    }
}

