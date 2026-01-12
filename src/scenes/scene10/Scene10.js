/**
 * Scene10: カラビ・ヤウ多様体
 */

import { SceneBase } from '../SceneBase.js';
import { GPUParticleSystem } from '../../lib/GPUParticleSystem.js';
import { Scene10_ManifoldSphere } from './Scene10_ManifoldSphere.js';
import { debugLog } from '../../lib/DebugLogger.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export class Scene10 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'mathym | SP-n(Hrrr)';
        debugLog('scene10', 'コンストラクタ実行', this.title);
        
        // 共有リソースマネージャー
        this.sharedResourceManager = sharedResourceManager;
        this.useSharedResources = !!sharedResourceManager;
        
        // 表示設定
        this.SHOW_PARTICLES = true;
        this.SHOW_LINES = true;  // 線描画（オン）
        
        // グリッド設定（カラビ・ヤウ多様体の解像度、120万パーティクル）
        // 1100x1100 = 1,210,000パーティクル（約120万）
        this.cols = 1100;
        this.rows = 1100;
        this.scl = 2.0;  // スケール
        this.w = this.cols * this.scl;  // 1000
        this.h = this.rows * this.scl;  // 1000
        
        // GPUパーティクルシステム
        this.gpuParticleSystem = null;
        
        // 線描画用
        this.lineSystem = null;
        
        // カラビ・ヤウ多様体のパラメータ
        this.time = 0.0;
        this.timeIncrement = 0.005;  // アニメーション速度（もっとゆっくりに：0.012 → 0.005）
        this.manifoldScale = 250.0;  // 多様体のスケール（大きく）
        this.manifoldComplexity = 2.5;  // 初期複雑さ（時間とともに増加するため初期値は控えめに）
        this.baseManifoldComplexity = 2.5;  // ベース複雑さ（トラック6でリセット用）
        this.baseManifoldScale = 250.0;  // ベーススケール（トラック6でリセット用）
        
        // グループ
        this.manifoldGroup = null;
        
        // マーカースフィア（トラック5用）
        this.manifoldSpheres = [];
        
        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
        
        // トラック4（グリッチエフェクト）をオフにする
        this.trackEffects[4] = false;
        
        // 2Dテキストエフェクト用（トラック6）- Canvas 2Dで実装（軍事風情報表示）
        this.textEffectActive = false;
        this.textEffectEndTime = 0;  // エフェクト終了時刻（デュレーション用）
        this.textEffectCanvas = null;
        this.textEffectCtx = null;
        this.currentText = '';  // 1行の長い軍事風情報（画面横幅いっぱい）
        this.textEffectFrameCounter = 0;  // フレームカウンター（超高速切り替え用）
        this.textEffectChangeInterval = 1;  // テキスト切り替え間隔（1フレームごと = 超高速）
        this.currentTrackNumber = 6;  // 現在のトラック番号
        
        // レーザースキャンエフェクト（トラック8用、Z方向、手前から奥へ）
        this.laserScans = [];  // 複数のレーザースキャンを管理（ポリフォニック）
        // { position: float, speed: float, intensity: float, width: float, endTime: number }
        this.laserScanWidth = 0.1;  // スキャンラインの幅（正規化Z座標の範囲）
        this.laserScanKeyPressed = false;  // キーが押されているか
        this.maxScans = 10;  // 最大スキャン数
        this.laserScanPositions = new Float32Array(this.maxScans);
        this.laserScanWidths = new Float32Array(this.maxScans);
        this.laserScanIntensities = new Float32Array(this.maxScans);
        this.zRange = 600.0;  // Z座標の範囲（正規化用、manifoldScaleに合わせる）
        
        // Scene10専用の色反転フラグ（ColorInversionの影響を受けずに独自管理）
        this.scene10ColorInverted = false;
        this.scene10ColorInversionEndTime = 0;
        this.scene10ColorInversionKeyPressed = false;
        
        // カメラの視点オフセット（映画的な動き用）
        this.cameraLookAtOffset = new THREE.Vector3(0, 0, 0);
        this.cameraLookAtOffsetTime = 0.0;  // 視点オフセットの時間変数
    }
    
    async setup() {
        // 親クラスのsetup()を呼ぶ
        await super.setup();
        
        // カメラパーティクルの距離パラメータを再設定
        // カメラは共有リソースとして使いまわすため、初期化は不要
        if (this.cameraParticles) {
            for (const cameraParticle of this.cameraParticles) {
                this.setupCameraParticleDistance(cameraParticle);
            }
        }
        
        // ライトを追加
        this.setupLights();
        
        // GPUパーティクルシステムを初期化（共有リソースを使う場合は取得、そうでない場合は新規作成）
        const particleCount = this.cols * this.rows;
        
        if (this.useSharedResources && this.sharedResourceManager) {
            // 共有リソースから取得（既に初期化済み）
            this.gpuParticleSystem = this.sharedResourceManager.getGPUParticleSystem('scene10');
            debugLog('scene10', '共有リソースからGPUパーティクルシステムを取得');
            
            // Scene10固有：初期位置データを設定（SharedResourceManagerから分離）
            // 共有リソースを使う場合でも、初期位置データはシーン側で設定する
            console.log('[Scene10] 初期位置データを計算中...');
            const calcStartTime = performance.now();
            this.initializeParticleData();
            const calcEndTime = performance.now();
            console.log(`[Scene10] 初期位置データ計算完了 (${(calcEndTime - calcStartTime).toFixed(2)}ms)`);
        } else {
            // 通常通り新規作成
            this.gpuParticleSystem = new GPUParticleSystem(
                this.renderer,
                particleCount,
                this.cols,
                this.rows,
                0,  // baseRadiusは使用しない
                'scene10'  // シェーダーパス
            );
            
            // シェーダーの読み込み完了を待つ
            await this.gpuParticleSystem.initPromise;
        }
        debugLog('scene10', 'GPUParticleSystem初期化完了');
        
        // パーティクルシステムをシーンに追加
        const particleSystem = this.gpuParticleSystem.getParticleSystem();
        if (particleSystem) {
            particleSystem.visible = this.SHOW_PARTICLES;
            this.scene.add(particleSystem);
            debugLog('scene10', 'パーティクルシステムをシーンに追加', particleSystem);
        
            // パーティクルマテリアルを透明にする
            if (this.gpuParticleSystem.particleMaterial) {
                this.gpuParticleSystem.particleMaterial.transparent = true;
                this.gpuParticleSystem.particleMaterial.depthWrite = false;
                debugLog('scene10', 'パーティクルマテリアル設定完了');
            }
            
            // パーティクルサイズを設定
            const sizeAttribute = this.gpuParticleSystem.particleGeometry.getAttribute('size');
            if (sizeAttribute) {
                const sizes = sizeAttribute.array;
                for (let i = 0; i < sizes.length; i++) {
                    sizes[i] = 4.0;  // カラビ・ヤウ多様体用のサイズ（120万パーティクル用に細く）
                }
                sizeAttribute.needsUpdate = true;
                debugLog('scene10', 'パーティクルサイズ設定完了', sizes.length);
            }
        } else {
            console.error('Scene10: パーティクルシステムが取得できません');
        }
        
        // パーティクル数を設定
        this.setParticleCount(particleCount);
        
        // 初期位置データを設定（共有リソースを使っている場合はスキップ、既にテクスチャに保存済み）
        if (!this.useSharedResources) {
            // 通常の場合は初期化
            this.initializeParticleData();
            
            // 初期色を計算
            this.updateInitialColors();
        }
        // 共有リソースを使っている場合は、テクスチャリセット後にSceneManagerから呼ばれる
        
        // パーティクルマテリアルのテクスチャを明示的に設定（初期化時）
        if (this.gpuParticleSystem && this.gpuParticleSystem.particleMaterial && this.gpuParticleSystem.particleMaterial.uniforms) {
            if (this.gpuParticleSystem.positionRenderTargets && this.gpuParticleSystem.positionRenderTargets[0]) {
                if (this.gpuParticleSystem.particleMaterial.uniforms.positionTexture) {
                    this.gpuParticleSystem.particleMaterial.uniforms.positionTexture.value = 
                        this.gpuParticleSystem.positionRenderTargets[0].texture;
                    debugLog('scene10', 'positionTexture設定完了');
                }
            }
            if (this.gpuParticleSystem.colorRenderTargets && this.gpuParticleSystem.colorRenderTargets[0]) {
                if (this.gpuParticleSystem.particleMaterial.uniforms.colorTexture) {
                    this.gpuParticleSystem.particleMaterial.uniforms.colorTexture.value = 
                        this.gpuParticleSystem.colorRenderTargets[0].texture;
                    debugLog('scene10', 'colorTexture設定完了');
                }
            }
            
            // レーザースキャン用のuniformsを追加
            const uniforms = this.gpuParticleSystem.particleMaterial.uniforms;
            uniforms.laserScanCount = { value: 0 };
            uniforms.laserScanPositions = { value: new Float32Array(this.maxScans) };
            uniforms.laserScanWidths = { value: new Float32Array(this.maxScans) };
            uniforms.laserScanIntensities = { value: new Float32Array(this.maxScans) };
            uniforms.zRange = { value: this.zRange };
            debugLog('laserScan', 'レーザースキャン用uniformsを追加');
        }
        
        // グループを作成
        this.manifoldGroup = new THREE.Group();
        this.scene.add(this.manifoldGroup);
        
        // 3Dグリッドとルーラーを初期化（共通クラスを使用）
        this.showGridRuler3D = true;  // デフォルトで表示
        this.initGridRuler3D({
            center: { x: 0, y: 0, z: 0 },
            size: { x: this.w, y: 1000, z: this.h },
            floorY: -500,
            floorSize: 2000,
            floorDivisions: 40,
            labelMax: 64
        });
        
        // 線描画システムを作成
        this.createLineSystem();
        
        // 2Dテキストエフェクト用Canvasを初期化
        this.initTextEffectCanvas();
        
        // initChromaticAberration()の完了を待つ（色反転passが確実に追加されるように）
        // SceneBaseのsetup()で非同期で呼ばれているが、完了を待つ必要がある
        try {
            if (this.initChromaticAberration && typeof this.initChromaticAberration === 'function') {
                await this.initChromaticAberration();
            }
        } catch (err) {
            console.error('[Scene10] initChromaticAberrationエラー:', err);
        }
        
        // initChromaticAberration()の後でcolorInversionPassを確実に無効にする
        // (super.setup()のinitializeEffectStates()はcolorInversionPass作成前に呼ばれるため)
        if (this.colorInversionPass) {
            this.colorInversionPass.enabled = false;
        }
    }
    
    /**
     * エフェクトの初期状態を設定（デフォルトは全てオフ）
     * Scene10独自のcolorInversionPassも無効にする
     */
    initializeEffectStates() {
        // 親クラスのinitializeEffectStatesを呼ぶ
        super.initializeEffectStates();
        
        // Scene10独自のcolorInversionPassを無効にする
        if (this.colorInversionPass) {
            this.colorInversionPass.enabled = false;
        }
    }
    
    /**
     * 2Dテキストエフェクト用Canvasを初期化
     */
    initTextEffectCanvas() {
        // 既存のCanvasがあれば削除
        const existingCanvas = document.getElementById('scene10-text-effect-canvas');
        if (existingCanvas) {
            existingCanvas.parentElement?.removeChild(existingCanvas);
        }
        
        this.textEffectCanvas = document.createElement('canvas');
        this.textEffectCanvas.id = 'scene10-text-effect-canvas';
        this.textEffectCanvas.width = window.innerWidth;
        this.textEffectCanvas.height = window.innerHeight;
        this.textEffectCanvas.style.position = 'absolute';
        this.textEffectCanvas.style.top = '0';
        this.textEffectCanvas.style.left = '0';
        this.textEffectCanvas.style.pointerEvents = 'none';
        this.textEffectCanvas.style.zIndex = '1002'; // HUDより上に表示
        this.textEffectCtx = this.textEffectCanvas.getContext('2d');
        document.body.appendChild(this.textEffectCanvas);
    }
    
    /**
     * 色収差エフェクトを初期化（Bloomエフェクトも追加）
     */
    async initChromaticAberration() {
        // 既に初期化中または完了している場合はスキップ
        if (this._initChromaticAberrationRunning || this.colorInversionPass) return;
        this._initChromaticAberrationRunning = true;
        
        // シェーダーを読み込む
        const shaderBasePath = `/shaders/common/`;
        try {
            const [vertexShader, fragmentShader, colorInversionVert, colorInversionFrag] = await Promise.all([
                fetch(`${shaderBasePath}chromaticAberration.vert`).then(r => r.text()),
                fetch(`${shaderBasePath}chromaticAberration.frag`).then(r => r.text()),
                fetch(`${shaderBasePath}colorInversion.vert`).then(r => r.text()),
                fetch(`${shaderBasePath}colorInversion.frag`).then(r => r.text())
            ]);
            
            // EffectComposerを作成
            const isNewComposer = !this.composer;
            if (isNewComposer) {
                this.composer = new EffectComposer(this.renderer);
                
                // RenderPassを追加（通常のシーン描画 - GPUパーティクル、トラック5のエフェクトなどすべてを含む）
                const renderPass = new RenderPass(this.scene, this.camera);
                this.composer.addPass(renderPass);
            }
            
            // 色収差シェーダーを作成（既に存在する場合はスキップ）
            if (!this.chromaticAberrationPass) {
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
            }
            
            // ブルームエフェクトは削除（効果がなかったため）
            // トラック8用のbloomPassは使用しない
            
            // グリッチエフェクトも初期化（composerが作成された後、既に存在する場合はスキップ）
            if (!this.glitchPass) {
                await this.initGlitchShader();
            }
            
            // 色反転シェーダーを作成（トラック2用、画面全体を反転）
            // GPUパーティクル、Bloom、色収差など、すべてのエフェクトが適用された後に色反転を適用
            // そのため、色反転passは最後に追加する
            // 既にcolorInversionPassが存在する場合は追加しない（重複を防ぐ）
            if (!this.colorInversionPass) {
                const colorInversionShader = {
                    uniforms: {
                        tDiffuse: { value: null },
                        intensity: { value: 1.0 }  // 反転の強度（0.0〜1.0、完全反転のため常に1.0）
                    },
                    vertexShader: colorInversionVert,
                    fragmentShader: colorInversionFrag
                };
                
                // 色反転ShaderPassを作成
                this.colorInversionPass = new ShaderPass(colorInversionShader);
                this.colorInversionPass.enabled = false;  // デフォルトでは無効
                this.colorInversionPass.renderToScreen = true;  // 画面に直接レンダリング
                
                // 最後に追加（すべてのエフェクトが適用された後に色反転）
                this.composer.addPass(this.colorInversionPass);
                debugLog('colorInversion', '色反転passを追加しました（最後）:', {
                    totalPasses: this.composer.passes.length,
                    passOrder: this.composer.passes.map((p, i) => `${i}: ${p.constructor.name}`).join(', ')
                });
            } else {
                debugLog('colorInversion', 'colorInversionPassは既に存在します');
            }
        } catch (err) {
            console.error('色収差シェーダーの読み込みに失敗:', err);
        }
    }
    
    /**
     * ライトを設定
     */
    setupLights() {
        // 環境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        // 指向性ライト
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
        directionalLight.position.set(1000, 2000, 1000);
        this.scene.add(directionalLight);
    }
    
    /**
     * 初期パーティクルデータを設定（カラビ・ヤウ多様体の表面に配置）
     */
    initializeParticleData() {
        if (!this.gpuParticleSystem) return;
        
        const width = this.cols;
        const height = this.rows;
        const dataSize = width * height * 4;
        const positionData = new Float32Array(dataSize);
        const colorData = new Float32Array(dataSize);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4;
                
                // パラメータ空間での座標（-1 ～ 1）
                const u = (x / width) * 2.0 - 1.0;
                const v = (y / height) * 2.0 - 1.0;
                
                // カラビ・ヤウ多様体のパラメトリック方程式
                // 3次元空間でのパラメトリック曲面
                const pos = this.calabiYauPosition(u, v, 0.0);
                
                // 位置データ
                positionData[index] = pos.x * this.manifoldScale;
                positionData[index + 1] = pos.y * this.manifoldScale;
                positionData[index + 2] = pos.z * this.manifoldScale;
                positionData[index + 3] = pos.z * this.manifoldScale;  // 基準位置のZ
                
                // 色データ（初期色、明るく）
                colorData[index] = 0.9;
                colorData[index + 1] = 0.9;
                colorData[index + 2] = 0.9;
                colorData[index + 3] = 1.0;
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
        
        // RenderTargetにコピー
        this.gpuParticleSystem.copyTextureToRenderTarget(positionTexture, this.gpuParticleSystem.positionRenderTargets[0]);
        this.gpuParticleSystem.copyTextureToRenderTarget(colorTexture, this.gpuParticleSystem.colorRenderTargets[0]);
    }
    
    /**
     * カラビ・ヤウ多様体のパラメトリック方程式（JavaScript版、シェーダーと同じ計算）
     * @param {number} u - パラメータ1 (-1 ～ 1)
     * @param {number} v - パラメータ2 (-1 ～ 1)
     * @param {number} t - 時間パラメータ
     * @returns {THREE.Vector3} 3D位置
     */
    calabiYauPosition(u, v, t) {
        // シェーダーと完全に同じ計算をJavaScriptで実装
        const r = Math.sqrt(u * u + v * v);
        const theta = Math.atan2(v, u);
        
        // RandomLFOの実装（シェーダーと同じロジック）
        const hash = (n) => {
            const s = Math.sin(n) * 43758.5453;
            return ((s % 1) + 1) % 1;  // 0.0 ～ 1.0
        };
        
        const randomLFO = (t, seed) => {
            const freq = 0.1 + hash(seed) * 0.4;
            const phase = hash(seed * 1.5) * Math.PI * 2;
            const waveType = hash(seed * 2.3);
            
            let value;
            if (waveType < 0.33) {
                value = Math.sin(t * freq * Math.PI * 2 + phase);
            } else if (waveType < 0.66) {
                value = Math.cos(t * freq * Math.PI * 2 + phase);
            } else {
                value = Math.sin(t * freq * Math.PI * 2 + phase) * Math.cos(t * freq * 0.5 * Math.PI * 2 + phase * 0.7);
            }
            
            const ampMod = 0.5 + 0.5 * hash(seed * 3.7);
            return value * ampMod;
        };
        
        const getComplexityModulation = (t) => {
            // 30秒周期（30.0秒）
            const period = 30.0;
            
            // 周期内での位置（0.0 ～ 1.0）
            const cyclePosition = (t % period) / period;
            
            // リニアに0.0（簡単）から1.0（複雑）に変化
            return cyclePosition;
        };
        
        const complexityMod = getComplexityModulation(t);
        // 複雑さの範囲（0.3倍（簡単）～ 1.0倍（複雑））
        const minComplexity = 0.3;
        const maxComplexity = 1.0;
        const timeComplexity = minComplexity + (maxComplexity - minComplexity) * complexityMod;
        const dynamicComplexity = this.manifoldComplexity * timeComplexity;
        
        // 複数の周波数を組み合わせ（シェーダーと同じ）
        const freq1 = dynamicComplexity * 1.0;
        const freq2 = dynamicComplexity * 2.5;
        const freq3 = dynamicComplexity * 4.0;
        const highFreqMod1 = getComplexityModulation(t * 0.3);
        const highFreqMod2 = getComplexityModulation(t * 0.25);
        const freq4 = dynamicComplexity * 6.0 * highFreqMod1;
        const freq5 = dynamicComplexity * 8.0 * highFreqMod2;
        
        // 時間アニメーション（シェーダーと同じ、時間とともに速度も変化）
        const t1 = t * (0.3 + 0.1 * Math.sin(t * 0.1));
        const t2 = t * (0.5 + 0.1 * Math.cos(t * 0.12));
        const t3 = t * (0.7 + 0.1 * Math.sin(t * 0.14));
        const t4 = t * (0.4 + 0.2 * Math.sin(t * 0.08));
        const t5 = t * (0.6 + 0.2 * Math.cos(t * 0.09));
        
        // ノイズの実装（シェーダーのsmoothNoiseを再現）
        const smoothNoise = (p) => {
            const i = {
                x: Math.floor(p.x),
                y: Math.floor(p.y),
                z: Math.floor(p.z)
            };
            const f = {
                x: p.x - i.x,
                y: p.y - i.y,
                z: p.z - i.z
            };
            // smoothstep
            f.x = f.x * f.x * (3.0 - 2.0 * f.x);
            f.y = f.y * f.y * (3.0 - 2.0 * f.y);
            f.z = f.z * f.z * (3.0 - 2.0 * f.z);
            
            const n = i.x + i.y * 57.0 + i.z * 113.0;
            const a = hash(n);
            const b = hash(n + 1.0);
            const c = hash(n + 57.0);
            const d = hash(n + 58.0);
            const e = hash(n + 113.0);
            const f1 = hash(n + 114.0);
            const g = hash(n + 170.0);
            const h = hash(n + 171.0);
            
            const x1 = a + (b - a) * f.x;
            const x2 = c + (d - c) * f.x;
            const y1 = x1 + (x2 - x1) * f.y;
            
            const x3 = e + (f1 - e) * f.x;
            const x4 = g + (h - g) * f.x;
            const y2 = x3 + (x4 - x3) * f.y;
            
            return y1 + (y2 - y1) * f.z;
        };
        
        const noiseScaleMod = getComplexityModulation(t * 0.4);
        const noiseScale = 0.3 + noiseScaleMod * 0.4;
        const noiseStrengthMod = getComplexityModulation(t * 0.35);
        const noiseStrength = 0.08 + noiseStrengthMod * 0.12;
        const noisePos = { x: u * 2.0 + t1, y: v * 2.0 + t2, z: t3 };
        const noiseValue = smoothNoise({ x: noisePos.x * noiseScale, y: noisePos.y * noiseScale, z: noisePos.z * noiseScale }) * noiseStrength;
        const highNoiseMod = getComplexityModulation(t * 0.45);
        const noisePos2 = { x: u * 3.0 + t4, y: v * 3.0 + t5, z: t * 0.5 };
        const noiseValue2 = smoothNoise({ x: noisePos2.x * noiseScale * 1.5, y: noisePos2.y * noiseScale * 1.5, z: noisePos2.z * noiseScale * 1.5 }) * (noiseStrength * 0.5) * highNoiseMod;
        
        // 複数のsin波を組み合わせ（シェーダーと同じ）
        const R1 = 1.0 + 0.15 * Math.sin(freq1 * theta + t1);
        const R2 = 0.12 * Math.sin(freq2 * theta + t2);
        const R3 = 0.08 * Math.sin(freq3 * theta + t3);
        const R4Mod = getComplexityModulation(t * 0.3);
        const R5Mod = getComplexityModulation(t * 0.25);
        const R4 = 0.06 * Math.sin(freq4 * theta + t4) * R4Mod;
        const R5 = 0.04 * Math.sin(freq5 * theta + t5) * R5Mod;
        const R = R1 + R2 + R3 + R4 + R5 + noiseValue + noiseValue2;
        
        // phiを複雑に（シェーダーと同じ）
        const phi = r * Math.PI;
        const phiMod1 = 0.12 * Math.sin(2.0 * theta + t1);
        const phiMod2 = 0.08 * Math.sin(3.0 * r + t2);
        const phiMod3Mod = getComplexityModulation(t * 0.35);
        const phiMod4Mod = getComplexityModulation(t * 0.3);
        const phiMod3 = 0.06 * Math.sin(4.0 * theta + 2.0 * r + t3) * phiMod3Mod;
        const phiMod4 = 0.04 * Math.sin(5.0 * theta + 3.0 * r + t4) * phiMod4Mod;
        const phiMod = phi + phiMod1 + phiMod2 + phiMod3 + phiMod4;
        
        // 3D座標を計算（シェーダーと同じ）
        const x = R * Math.cos(theta) * Math.sin(phiMod);
        const y = R * Math.sin(theta) * Math.sin(phiMod);
        
        const z1 = Math.cos(phiMod);
        const z2 = 0.12 * Math.sin(2.0 * theta + t1);
        const z3 = 0.08 * Math.cos(3.0 * r + t2);
        const z4 = 0.06 * Math.sin(5.0 * theta + t3);
        const z5Mod = getComplexityModulation(t * 0.4);
        const z6Mod = getComplexityModulation(t * 0.35);
        const z5 = 0.04 * Math.cos(6.0 * theta + 2.0 * r + t4) * z5Mod;
        const z6 = 0.03 * Math.sin(7.0 * theta + 3.0 * r + t5) * z6Mod;
        const z = z1 + z2 + z3 + z4 + z5 + z6;
        
        // 追加の変形（シェーダーと同じ）
        const twistMod = getComplexityModulation(t * 0.5);
        const twistStrength = 0.04 + twistMod * 0.08;
        const twist = twistStrength * Math.sin(4.0 * theta + 2.0 * t);
        const twist2Mod = getComplexityModulation(t * 0.45);
        const twist2 = twistStrength * 0.5 * Math.cos(5.0 * theta + 3.0 * t) * twist2Mod;
        let finalX = x + twist * Math.cos(theta) + twist2 * Math.sin(theta);
        let finalY = y + twist * Math.sin(theta) + twist2 * Math.cos(theta);
        const zMod1 = getComplexityModulation(t * 0.4);
        let finalZ = z + 0.04 * Math.cos(6.0 * theta + 1.5 * t) + 0.02 * Math.sin(8.0 * theta + 2.5 * t) * zMod1;
        
        // さらに高次の変形（シェーダーと同じ）
        const highFreqModX = getComplexityModulation(t * 0.5);
        const highFreqModY = getComplexityModulation(t * 0.48);
        const highFreqModZ = getComplexityModulation(t * 0.46);
        finalX += 0.02 * Math.sin(9.0 * theta + 4.0 * r + t * 1.2) * highFreqModX;
        finalY += 0.02 * Math.cos(10.0 * theta + 5.0 * r + t * 1.3) * highFreqModY;
        finalZ += 0.02 * Math.sin(11.0 * theta + 6.0 * r + t * 1.4) * highFreqModZ;
        
        return new THREE.Vector3(finalX, finalY, finalZ);
    }
    
    /**
     * 初期色を計算（色更新シェーダーを実行）
     */
    updateInitialColors() {
        if (!this.gpuParticleSystem) return;
        
        // 色更新用シェーダーにuniformを設定
        const colorUpdateMaterial = this.gpuParticleSystem.colorUpdateMaterial;
        if (colorUpdateMaterial && colorUpdateMaterial.uniforms) {
            if (!colorUpdateMaterial.uniforms.minZOffset) {
                colorUpdateMaterial.uniforms.minZOffset = { value: -400.0 };
            } else {
                colorUpdateMaterial.uniforms.minZOffset.value = -400.0;
            }
            if (!colorUpdateMaterial.uniforms.maxZOffset) {
                colorUpdateMaterial.uniforms.maxZOffset = { value: 400.0 };
            } else {
                colorUpdateMaterial.uniforms.maxZOffset.value = 400.0;
            }
            // 時間を色更新シェーダーにも渡す
            if (!colorUpdateMaterial.uniforms.time) {
                colorUpdateMaterial.uniforms.time = { value: this.time };
            } else {
                colorUpdateMaterial.uniforms.time.value = this.time;
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
                if (this.gpuParticleSystem.particleMaterial.uniforms.positionTexture) {
                    this.gpuParticleSystem.particleMaterial.uniforms.positionTexture.value = this.gpuParticleSystem.positionRenderTargets[0].texture;
                }
                if (this.gpuParticleSystem.particleMaterial.uniforms.colorTexture) {
                    this.gpuParticleSystem.particleMaterial.uniforms.colorTexture.value = this.gpuParticleSystem.colorRenderTargets[0].texture;
                }
                debugLog('scene10', 'updateInitialColors - テクスチャ設定完了');
            } else {
                console.error('Scene10: updateInitialColors - particleMaterialまたはuniformsが存在しません');
            }
        } else {
            console.error('Scene10: updateInitialColors - colorUpdateMaterialまたはcolorRenderTargetsが存在しません');
        }
    }
    
    /**
     * カメラパーティクルの距離パラメータを設定（少し近めに）
     */
    setupCameraParticleDistance(cameraParticle) {
        // カラビ・ヤウ多様体に近づける（manifoldScale=250.0、範囲は約-400～400程度）
        cameraParticle.minDistance = 600.0;  // 800.0 → 600.0（さらに近く）
        cameraParticle.maxDistance = 1200.0;  // 1500.0 → 1200.0（さらに近く）
        cameraParticle.maxDistanceReset = 900.0;  // 1150.0 → 900.0（さらに近く）
        
        // カメラの移動範囲を設定（オブジェクトにさらに近く）
        const cameraBoxSize = 1000.0;  // 1200.0 → 1000.0（さらに近く）
        const cameraMinY = -400.0;  // -500.0 → -400.0
        const cameraMaxY = 400.0;  // 500.0 → 400.0
        cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSize, cameraMinY, -cameraBoxSize);
        cameraParticle.boxMax = new THREE.Vector3(cameraBoxSize, cameraMaxY, cameraBoxSize);
    }
    
    /**
     * 更新処理
     */
    onUpdate(deltaTime) {
        // 時間を更新
        this.time += this.timeIncrement;
        
        // カメラの視点オフセット時間を更新
        this.cameraLookAtOffsetTime += 0.001;
        
        // マーカースフィアを更新
        this.updateManifoldSpheres();
        
        // レーザースキャンエフェクトの更新
        this.updateLaserScan(deltaTime);
        
        // Scene10専用色反転のサスティン終了チェック
        if (this.scene10ColorInverted && !this.scene10ColorInversionKeyPressed) {
            if (this.scene10ColorInversionEndTime > 0 && Date.now() >= this.scene10ColorInversionEndTime) {
                this.scene10ColorInverted = false;
                this.scene10ColorInversionEndTime = 0;
                debugLog('colorInversion', '色反転OFF (サスティン終了)');
            }
        }
        
        // GPUパーティクルシステムの更新
        if (this.gpuParticleSystem) {
            const positionUpdateMaterial = this.gpuParticleSystem.getPositionUpdateMaterial();
            if (positionUpdateMaterial && positionUpdateMaterial.uniforms) {
                // Scene10専用のuniformを設定
                if (!positionUpdateMaterial.uniforms.scl) {
                    positionUpdateMaterial.uniforms.scl = { value: this.scl };
                } else {
                    positionUpdateMaterial.uniforms.scl.value = this.scl;
                }
                if (!positionUpdateMaterial.uniforms.manifoldScale) {
                    positionUpdateMaterial.uniforms.manifoldScale = { value: this.manifoldScale };
                } else {
                    positionUpdateMaterial.uniforms.manifoldScale.value = this.manifoldScale;
                }
                if (!positionUpdateMaterial.uniforms.manifoldComplexity) {
                    positionUpdateMaterial.uniforms.manifoldComplexity = { value: this.manifoldComplexity };
                } else {
                    positionUpdateMaterial.uniforms.manifoldComplexity.value = this.manifoldComplexity;
                }
                // widthとheightも設定（GPUParticleSystemで設定されているが、念のため）
                if (positionUpdateMaterial.uniforms.width) {
                    positionUpdateMaterial.uniforms.width.value = this.cols;
                }
                if (positionUpdateMaterial.uniforms.height) {
                    positionUpdateMaterial.uniforms.height.value = this.rows;
                }
                // トラック8の時間スケールは削除（Bloomエフェクトに変更）
            }
            
            // 色更新用シェーダーにuniformを設定（update()の前に設定する必要がある）
            const colorUpdateMaterial = this.gpuParticleSystem.colorUpdateMaterial;
            if (colorUpdateMaterial && colorUpdateMaterial.uniforms) {
                // 時間を設定
                if (!colorUpdateMaterial.uniforms.time) {
                    colorUpdateMaterial.uniforms.time = { value: this.time };
                } else {
                    colorUpdateMaterial.uniforms.time.value = this.time;
                }
                // minZOffsetとmaxZOffsetを設定
                if (!colorUpdateMaterial.uniforms.minZOffset) {
                    colorUpdateMaterial.uniforms.minZOffset = { value: -400.0 };
                } else {
                    colorUpdateMaterial.uniforms.minZOffset.value = -400.0;
                }
                if (!colorUpdateMaterial.uniforms.maxZOffset) {
                    colorUpdateMaterial.uniforms.maxZOffset = { value: 400.0 };
                } else {
                    colorUpdateMaterial.uniforms.maxZOffset.value = 400.0;
                }
            }
            
            // GPUParticleSystemの基本更新（この中で色更新も実行される）
            this.gpuParticleSystem.update({
                time: this.time,
                noiseScale: 0.0,  // ノイズは使用しない
                noiseStrength: 0.0,
                baseRadius: 0
            });
        }
        
        // 線描画の更新（SHOW_LINESがtrueの場合のみ）
        if (this.SHOW_LINES && this.lineSystem && this.gpuParticleSystem) {
            this.updateLineSystem();
        }
        
        // 2Dテキストエフェクトのデュレーション管理
        if (this.textEffectActive && this.textEffectEndTime > 0) {
            const currentTime = Date.now();
            if (currentTime >= this.textEffectEndTime) {
                // デュレーション終了
                this.textEffectActive = false;
                this.currentText = '';
            }
        }
        
        // 2Dテキストエフェクトの更新（高速切り替え - ギリギリ読めない速度）
        if (this.textEffectActive) {
            this.updateTextEffect();
        }
    }
    
    
    /**
     * 軍事風情報を生成（1行の長い文字列、画面横幅いっぱい）
     */
    generateMilitaryInfo() {
        const now = Date.now();
        const timestamp = (now / 1000.0).toFixed(7);
        const cameraPos = this.cameraParticles[this.currentCameraIndex]?.getPosition() || new THREE.Vector3();
        const fps = this.lastFrameTime ? (1.0 / ((performance.now() - this.lastFrameTime) / 1000.0)).toFixed(1) : '60.0';
        
        // 軍事風の情報を1行の長い文字列として生成（画面横幅いっぱいになるように）
        const parts = [
            `osc~~${this.currentTrackNumber} : ${(Math.random() * 1000000).toFixed(7)}`,
            `track_${this.currentTrackNumber}_status : ACTIVE`,
            `timestamp : ${timestamp}`,
            `coords : x:${cameraPos.x.toFixed(6)} y:${cameraPos.y.toFixed(6)} z:${cameraPos.z.toFixed(6)}`,
            `fps : ${fps}`,
            `particles : ${this.particleCount || 0}`,
            `manifold_complexity : ${this.manifoldComplexity.toFixed(4)}`,
            `manifold_scale : ${this.manifoldScale.toFixed(2)}`,
            `camera_index : ${this.currentCameraIndex}`,
            `rotation_x : ${(this.cameraParticles[this.currentCameraIndex]?.getRotationX() || 0).toFixed(4)}`,
            `rotation_y : ${(this.cameraParticles[this.currentCameraIndex]?.getRotationY() || 0).toFixed(4)}`,
            `distance : ${cameraPos.length().toFixed(4)}`,
            `time : ${this.time.toFixed(4)}`,
            `active_spheres : ${this.manifoldSpheres.filter(s => s.isActive()).length}`,
            `signal_strength : ${(Math.random() * 100).toFixed(2)}%`,
            `data_rate : ${(Math.random() * 10000).toFixed(0)} bps`,
            `packet_loss : ${(Math.random() * 5).toFixed(2)}%`,
            `latency : ${(Math.random() * 100).toFixed(2)}ms`,
            `bandwidth : ${(Math.random() * 1000).toFixed(0)} Mbps`,
            `memory_usage : ${(Math.random() * 100).toFixed(1)}%`,
            `cpu_load : ${(Math.random() * 100).toFixed(1)}%`,
            `network_status : ${Math.random() > 0.5 ? 'CONNECTED' : 'STANDBY'}`,
            `protocol : UDP/${this.currentTrackNumber}`,
            `sequence : ${Math.floor(Math.random() * 100000)}`,
            `checksum : 0x${Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0')}`,
            `buffer_size : ${Math.floor(Math.random() * 10000)} bytes`,
            `queue_depth : ${Math.floor(Math.random() * 100)}`,
            `error_count : ${Math.floor(Math.random() * 10)}`,
            `retry_count : ${Math.floor(Math.random() * 5)}`,
            `connection_id : ${Math.floor(Math.random() * 1000000)}`,
            `session_key : ${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
            `encryption : ${Math.random() > 0.5 ? 'AES-256' : 'TLS-1.3'}`,
            `auth_status : ${Math.random() > 0.5 ? 'AUTHENTICATED' : 'PENDING'}`,
            `sync_status : ${Math.random() > 0.5 ? 'SYNCED' : 'SYNCING'}`,
            `last_update : ${new Date().toISOString()}`
        ];
        
        // 配列をランダムにシャッフル
        for (let i = parts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [parts[i], parts[j]] = [parts[j], parts[i]];
        }
        
        // すべての情報をスペース区切りで1行に結合（画面横幅いっぱいになるように）
        this.currentText = parts.join(' | ');
    }
    
    /**
     * 2Dテキストエフェクトを更新（超高速切り替え - 1フレームごと）
     */
    updateTextEffect() {
        this.textEffectFrameCounter++;
        
        // 1フレームごとに軍事風情報を再生成（超高速）
        if (this.textEffectFrameCounter >= this.textEffectChangeInterval) {
            this.textEffectFrameCounter = 0;
            this.generateMilitaryInfo();
        }
        
        // 最初のフレームでも情報を生成（エフェクト開始時）
        if (!this.currentText) {
            this.generateMilitaryInfo();
        }
    }
    
    /**
     * 描画処理
     */
    render() {
        // カメラを設定
        this.setupCamera();
        
        // パーティクルシステムの位置を設定
        if (this.gpuParticleSystem) {
            const particleSystem = this.gpuParticleSystem.getParticleSystem();
            if (particleSystem) {
                particleSystem.visible = this.SHOW_PARTICLES;
                particleSystem.position.set(0, 0, 0);
            }
            
            // パーティクルマテリアルのテクスチャを設定（毎フレーム更新）
            if (this.gpuParticleSystem.particleMaterial && this.gpuParticleSystem.particleMaterial.uniforms) {
                const currentPositionBuffer = this.gpuParticleSystem.currentPositionBuffer;
                const currentColorBuffer = this.gpuParticleSystem.currentColorBuffer;
                
                if (this.gpuParticleSystem.positionRenderTargets && 
                    this.gpuParticleSystem.positionRenderTargets[currentPositionBuffer]) {
                    if (this.gpuParticleSystem.particleMaterial.uniforms.positionTexture) {
                        this.gpuParticleSystem.particleMaterial.uniforms.positionTexture.value = 
                            this.gpuParticleSystem.positionRenderTargets[currentPositionBuffer].texture;
                    }
                }
                
                if (this.gpuParticleSystem.colorRenderTargets && 
                    this.gpuParticleSystem.colorRenderTargets[currentColorBuffer]) {
                    if (this.gpuParticleSystem.particleMaterial.uniforms.colorTexture) {
                        this.gpuParticleSystem.particleMaterial.uniforms.colorTexture.value = 
                            this.gpuParticleSystem.colorRenderTargets[currentColorBuffer].texture;
                    }
                }
            }
        }
        
        // 背景色を設定
        if (this.backgroundWhite) {
            this.renderer.setClearColor(0xffffff);
        } else {
            this.renderer.setClearColor(0x000000);
        }
        
        // Scene10独自のcomposerでレンダリング（色収差、グリッチなど）
        // 色反転は無効化
        if (this.composer) {
            this.composer.render();
        } else if (this.scene) {
            this.renderer.render(this.scene, this.camera);
        }
        
        // 2Dテキストエフェクトを描画（黒い矩形 + 高速切り替えテキスト）
        // エフェクトがアクティブな時のみ描画（デュレーション終了時は描画しない）
        if (this.textEffectActive && this.textEffectCtx && this.textEffectCanvas) {
            this.drawTextEffect();
        } else if (this.textEffectCtx && this.textEffectCanvas) {
            // エフェクトが非アクティブな時はCanvasをクリア（黒い矩形も消す）
            this.textEffectCtx.clearRect(0, 0, this.textEffectCanvas.width, this.textEffectCanvas.height);
        }
        
        // Scene10専用色反転が有効な場合はCanvas 2Dの内容も反転
        if (this.scene10ColorInverted && this.textEffectCtx && this.textEffectCanvas) {
            this.textEffectCtx.save();
            this.textEffectCtx.globalCompositeOperation = 'difference';
            this.textEffectCtx.fillStyle = 'white';
            this.textEffectCtx.fillRect(0, 0, this.textEffectCanvas.width, this.textEffectCanvas.height);
            this.textEffectCtx.restore();
        }
        
        // HUDを描画（常に描画、composer使用時も）
        if (this.hud) {
            if (this.showHUD) {
                const cameraPos = this.cameraParticles[this.currentCameraIndex]?.getPosition() || new THREE.Vector3();
                const now = performance.now();
                const frameRate = this.lastFrameTime ? 1.0 / ((now - this.lastFrameTime) / 1000.0) : 60.0;
                this.lastFrameTime = now;
                
                // Scene10専用の色反転フラグを使用（HUDの色も反転する）
                const isInverted = this.scene10ColorInverted;
                
                this.hud.display(
                    frameRate,
                    this.currentCameraIndex,
                    cameraPos,
                    0, // activeSpheres
                    this.time, // time
                    this.cameraParticles[this.currentCameraIndex]?.getRotationX() || 0,
                    this.cameraParticles[this.currentCameraIndex]?.getRotationY() || 0,
                    cameraPos.length(),
                    0, // noiseLevel
                    isInverted, // backgroundWhite（色反転エフェクトが有効な場合はtrue）
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
        
        // マーカースフィアのコールアウトを描画（HUDの後に描画、時間経過で自動的に消える）
        if (this.hud && this.hud.ctx) {
            this.manifoldSpheres.forEach(sphere => {
                if (sphere.isActive() && sphere.shouldShowCallout()) {
                    this.drawManifoldSphereCallout(sphere);
                }
            });
        }
        
        // スクリーンショットテキストを描画
        this.drawScreenshotText();
        
    }
    
    /**
     * 2Dテキストエフェクトを描画（黒い帯の中に1行で長い情報を表示）
     */
    drawTextEffect() {
        const ctx = this.textEffectCtx;
        const canvas = this.textEffectCanvas;
        
        if (!ctx || !canvas || !this.currentText) return;
        
        // Canvasをクリア
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 画面中央に黒い矩形を描画（帯状、文字より少し太い程度）
        const fontSize = 20;
        const rectHeight = fontSize * 1.5;  // 文字サイズの1.5倍（30px）
        const rectY = (canvas.height - rectHeight) / 2;
        ctx.fillStyle = 'rgba(0, 0, 0, 1.0)';  // 真っ黒
        ctx.fillRect(0, rectY, canvas.width, rectHeight);
        
        // 細くてモダンなフォント（小さめサイズ）
        ctx.font = `300 ${fontSize}px "Inter", "Roboto", "Arial", monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';  // 白色
        
        // 黒い帯の中央に1行で長い情報を表示
        const centerY = canvas.height / 2;
        const padding = 20;
        ctx.fillText(this.currentText, padding, centerY);
    }
    
    
    /**
     * 線描画システムを作成
     */
    createLineSystem() {
        if (!this.SHOW_LINES) return;
        
        // シェーダーを読み込む（非同期）
        const shaderBasePath = `/shaders/scene10/`;
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
                linewidth: 12  // 線をもっと太くする（8 → 12）
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
                linewidth: 12  // 線をもっと太くする（8 → 12）
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
        return new THREE.Vector3(0, 0, 0);
    }
    
    /**
     * カメラを設定（映画的な視点の外し方）
     */
    setupCamera() {
        const eye = this.cameraParticles[this.currentCameraIndex].getPosition();
        const center = new THREE.Vector3(0, 0, 0);
        const up = new THREE.Vector3(0, 1, 0);
        
        // 映画的な視点の外し方：時間と共にゆっくりと視点をずらす
        // 円形の軌道で視点をずらす（映画的な動き）
        const offsetRadius = 50.0;  // オフセットの半径
        const offsetSpeed = 0.3;  // オフセットの速度（ゆっくり）
        const offsetX = Math.sin(this.cameraLookAtOffsetTime * offsetSpeed) * offsetRadius;
        const offsetY = Math.cos(this.cameraLookAtOffsetTime * offsetSpeed * 0.7) * offsetRadius * 0.5;
        const offsetZ = Math.sin(this.cameraLookAtOffsetTime * offsetSpeed * 0.5) * offsetRadius * 0.3;
        
        this.cameraLookAtOffset.set(offsetX, offsetY, offsetZ);
        
        // 中心位置にオフセットを追加
        const lookAtTarget = center.clone().add(this.cameraLookAtOffset);
        
        this.camera.position.copy(eye);
        this.camera.lookAt(lookAtTarget);
        this.camera.up.copy(up);
    }
    
    /**
     * マーカースフィアを更新
     */
    updateManifoldSpheres() {
        this.manifoldSpheres.forEach(sphere => {
            sphere.update();
            
            // 時間とともに位置を更新（パーティクルと同じ計算）
            if (sphere.u !== undefined && sphere.v !== undefined) {
                const pos = this.calabiYauPosition(sphere.u, sphere.v, this.time);
                const newPosition = new THREE.Vector3(
                    pos.x * this.manifoldScale,
                    pos.y * this.manifoldScale,
                    pos.z * this.manifoldScale
                );
                sphere.position.copy(newPosition);
            }
            
            sphere.updateThreeObjects();
        });
        
        // 終了したsphereを削除
        this.manifoldSpheres = this.manifoldSpheres.filter(sphere => {
            if (!sphere.isActive()) {
                sphere.dispose(this.scene);
                return false;
            }
            return true;
        });
    }
    
    /**
     * マーカースフィアのコールアウトを描画
     */
    drawManifoldSphereCallout(sphere) {
        if (!this.hud || !this.hud.ctx) return;
        
        const ctx = this.hud.ctx;
        const canvas = this.hud.canvas;
        
        // sphereの3D位置を取得
        const sphere3DPos = sphere.getPosition();
        
        // sphereの中心位置を2D座標に変換
        const sphereCenter3D = new THREE.Vector3(sphere3DPos.x, sphere3DPos.y, sphere3DPos.z);
        sphereCenter3D.project(this.camera);
        
        // 画面座標に変換
        const centerScreenX = (sphereCenter3D.x * 0.5 + 0.5) * canvas.width;
        const centerScreenY = (sphereCenter3D.y * -0.5 + 0.5) * canvas.height;
        
        // 画面外の場合は描画しない
        if (centerScreenX < 0 || centerScreenX > canvas.width || 
            centerScreenY < 0 || centerScreenY > canvas.height ||
            sphereCenter3D.z > 1.0) {
            return;
        }
        
        // sphereの表面（上端）の3D位置を計算
        const sphereRadius = 2.0;  // sphereの半径
        const sphereTop3D = new THREE.Vector3(sphere3DPos.x, sphere3DPos.y + sphereRadius, sphere3DPos.z);
        sphereTop3D.project(this.camera);
        
        // sphereの表面（上端）の画面座標
        const startX = (sphereTop3D.x * 0.5 + 0.5) * canvas.width;
        const startY = (sphereTop3D.y * -0.5 + 0.5) * canvas.height;
        
        // 画面の位置に応じてコールアウトの方向を自動決定（90度以上になるように）
        // 画面の右側にある場合は右向き、左側にある場合は左向きにコールアウト
        const screenCenterX = canvas.width / 2;
        const useRight = centerScreenX >= screenCenterX;  // 右側なら右向き、左側なら左向き
        
        // 角度を調整（90度以上になるように、大きく開く）
        // 画面端に近いほど角度を大きく開く（より水平に近く）
        const distanceFromCenter = Math.abs(centerScreenX - screenCenterX) / screenCenterX;  // 0.0 ～ 1.0
        const minAngle = Math.PI / 2;  // 90度（最小角度、中心付近）
        const maxAngle = Math.PI * 0.85;  // 約153度（最大角度、画面端、もっと大きく開く）
        const diagonalAngle = minAngle + (maxAngle - minAngle) * distanceFromCenter;  // 画面端に近いほど角度が大きく開く
        
        const diagonalDirX = useRight ? Math.cos(diagonalAngle) : -Math.cos(diagonalAngle);
        const diagonalDirY = -Math.sin(diagonalAngle);
        
        // 斜めの線の長さ
        const diagonalLength = 80.0;
        const end1X = startX + diagonalDirX * diagonalLength;
        const end1Y = startY + diagonalDirY * diagonalLength;
        
        // 水平線（テキストの長さに応じて調整）
        const horizontalLength = 180.0;  // テキストが増えたので少し長く
        const end2X = end1X + horizontalLength;
        const end2Y = end1Y;
        
        // 線を描画（色反転時はシアン、通常時は赤）
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.scene10ColorInverted ? 'rgba(0, 255, 255, 0.78)' : 'rgba(255, 0, 0, 0.78)';
        
        // コールアウトの線を描画
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(end1X, end1Y);  // 斜めの線
        ctx.moveTo(end1X, end1Y);
        ctx.lineTo(end2X, end2Y);  // 水平線
        ctx.stroke();
        
        // テキストを描画（色反転時は黒、通常時は白）
        ctx.fillStyle = this.scene10ColorInverted ? 'rgba(0, 0, 0, 1.0)' : 'rgba(255, 255, 255, 1.0)';
        ctx.font = '16px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        
        const lineHeight = 20;
        const textX = end2X + 10;
        let textY = end2Y - 100;  // テキストが増えたので上に移動
        
        const label = sphere.getLabel();
        const pos = sphere.getPosition();
        
        // 時間ベースの変動値（解析しているような感じ）
        const time = this.time || 0.0;
        const sphereAge = sphere.age || 0.0;
        
        // 各値にノイズを追加（解析中の変動をシミュレート）
        const noiseX = Math.sin(time * 2.0 + sphereAge * 0.1) * 0.3;
        const noiseY = Math.cos(time * 1.7 + sphereAge * 0.15) * 0.3;
        const noiseZ = Math.sin(time * 1.5 + sphereAge * 0.12) * 0.3;
        const noiseDist = Math.sin(time * 1.3 + sphereAge * 0.08) * 0.5;
        
        // 変動する値を計算
        const varX = pos.x + noiseX;
        const varY = pos.y + noiseY;
        const varZ = pos.z + noiseZ;
        const distance = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z) + noiseDist;
        const curvature = Math.sin(time * 0.8 + sphereAge * 0.05) * 0.1 + 0.5;
        
        // テキストを描画（解析中のような感じで変動）
        ctx.fillText('MANIFOLD MARKER', textX, textY);
        textY += lineHeight;
        ctx.fillText(`LABEL: ${label}`, textX, textY);
        textY += lineHeight;
        ctx.fillText(`X: ${varX.toFixed(2)}`, textX, textY);
        textY += lineHeight;
        ctx.fillText(`Y: ${varY.toFixed(2)}`, textX, textY);
        textY += lineHeight;
        ctx.fillText(`Z: ${varZ.toFixed(2)}`, textX, textY);
        textY += lineHeight;
        ctx.fillText(`DIST: ${distance.toFixed(2)}`, textX, textY);
        textY += lineHeight;
        ctx.fillText(`CURV: ${curvature.toFixed(3)}`, textX, textY);
        
        ctx.restore();
    }
    
    /**
     * マーカースフィアを作成（トラック5用）
     */
    createManifoldSphere(noteNumber = null, velocity = null) {
        // カラビ・ヤウ多様体上のランダムな位置を選択
        // パラメータ空間でのランダムな位置（パーティクルのグリッドと同じ範囲）
        const u = (Math.random() - 0.5) * 2.0;  // -1 ～ 1
        const v = (Math.random() - 0.5) * 2.0;  // -1 ～ 1
        
        // カラビ・ヤウ多様体の位置を計算（現在の時間を使用、パーティクルと同じ）
        const pos = this.calabiYauPosition(u, v, this.time);
        const position = new THREE.Vector3(
            pos.x * this.manifoldScale,
            pos.y * this.manifoldScale,
            pos.z * this.manifoldScale
        );
        
        // ラベルを生成（ノート番号に基づく）
        let label = 'POINT';
        if (noteNumber !== null) {
            label = `N${noteNumber}`;
        } else {
            label = `P${this.manifoldSpheres.length + 1}`;
        }
        
        // マーカースフィアを作成（u, vパラメータも保存して、時間とともに更新できるように）
        const sphere = new Scene10_ManifoldSphere(position, label);
        sphere.u = u;  // パラメータ空間のu座標を保存
        sphere.v = v;  // パラメータ空間のv座標を保存
        sphere.createThreeObjects(this.scene);
        this.manifoldSpheres.push(sphere);
        
        debugLog('scene10', `マーカースフィアを作成: ${label} at (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`);
        debugLog('scene10', `  パラメータ: u=${u.toFixed(3)}, v=${v.toFixed(3)}`);
        debugLog('scene10', `  現在のマーカースフィア数: ${this.manifoldSpheres.length}`);
    }
    
    
    /**
     * OSCメッセージのハンドリング（Scene10専用オーバーライド）
     * トラック2の色反転はScene10では無効（技術的問題のため）
     */
    handleOSC(message) {
        const trackNumber = message.trackNumber;
        
        // トラック2: Scene10では色反転を無効化（SceneBaseの処理もスキップ）
        if (trackNumber === 2) {
            // 何もせずreturn（色反転を無効）
            return;
        }
        
        // その他のトラックは親クラスに委譲
        super.handleOSC(message);
    }
    
    /**
     * OSCメッセージの処理
     */
    handleTrackNumber(trackNumber, message) {
        // トラック1: カメラをランダムに切り替える
        if (trackNumber === 1) {
            this.switchCameraRandom();
        }
        // トラック5: マーカースフィアを作成
        else if (trackNumber === 5) {
            const args = message.args || [];
            const noteNumber = args[0] !== undefined ? args[0] : null;
            const velocity = args[1] !== undefined ? args[1] : null;
            this.createManifoldSphere(noteNumber, velocity);
        }
        // トラック6: 多様体の複雑さや形を変形 + 2Dテキストエフェクト
        else if (trackNumber === 6) {
            const args = message.args || [];
            const noteNumber = args[0] !== undefined ? args[0] : null;
            const velocity = args[1] !== undefined ? args[1] : null;
            const durationMs = args[2] !== undefined ? args[2] : 0.0;  // デュレーション（ms）
            this.transformManifold(noteNumber, velocity);
            
            // 2Dテキストエフェクトを有効化（軍事風情報表示）
            this.textEffectActive = true;
            this.textEffectFrameCounter = 0;
            this.currentTrackNumber = trackNumber;
            // 最初の軍事風情報を生成
            this.generateMilitaryInfo();
            
            // デュレーションに合わせてエフェクト終了時刻を設定
            if (durationMs > 0) {
                this.textEffectEndTime = Date.now() + durationMs;
            } else {
                // デュレーションが指定されていない場合は無期限（手動でオフにするまで）
                this.textEffectEndTime = 0;
            }
        }
        // トラック2はhandleOSC()で処理済み
        // トラック8: レーザースキャン（Z方向、手前から奥へ）
        else if (trackNumber === 8) {
            const args = message.args || [];
            const velocity = args[1] !== undefined ? args[1] : 127.0;
            const noteNumber = args[0] !== undefined ? args[0] : 64.0;
            const durationMs = args[2] !== undefined ? args[2] : 1000.0;
            this.applyLaserScan(velocity, noteNumber, durationMs);
        }
    }
    
    /**
     * レーザースキャンエフェクトを適用（Z方向、手前から奥へ、ポリフォニック対応）
     */
    applyLaserScan(velocity, noteNumber, durationMs) {
        // ベロシティ（0〜127）をスキャン速度と強度に変換
        const speed = THREE.MathUtils.mapLinear(velocity, 0, 127, 0.01, 0.08);  // スキャン速度
        const intensity = THREE.MathUtils.mapLinear(velocity, 0, 127, 0.3, 1.0);  // エフェクト強度
        
        // デュレーション（サスティン）を設定
        const minDuration = 1000;  // 最低1秒
        const actualDuration = Math.max(durationMs, minDuration);
        const endTime = actualDuration > 0 ? Date.now() + actualDuration : 0;
        
        // 新しいレーザースキャンを追加（ポリフォニック）
        // 手前（Z = +zRange）から奥（Z = -zRange）へスキャン
        this.laserScans.push({
            position: 1.0,  // 手前から開始（正規化Z座標 = 1.0）
            speed: speed,
            intensity: intensity,
            width: this.laserScanWidth,
            endTime: endTime
        });
        
        // 最大10個まで（シェーダーのuniform配列の制限）
        if (this.laserScans.length > this.maxScans) {
            this.laserScans.shift();  // 古いスキャンを削除
        }
        
        debugLog('laserScan', `applied - velocity:${velocity}, speed:${speed.toFixed(3)}, intensity:${intensity.toFixed(2)}, duration:${durationMs}ms, totalScans:${this.laserScans.length}`);
    }
    
    /**
     * レーザースキャンエフェクトの更新（Z方向、ポリフォニック対応）
     */
    updateLaserScan(deltaTime) {
        const currentTime = Date.now();
        
        // 全てのレーザースキャンを更新
        this.laserScans = this.laserScans.filter(scan => {
            // スキャン位置を更新（手前から奥へ、Z軸方向）
            scan.position -= scan.speed * deltaTime * 60.0;  // 60fps想定
            
            // 奥端（-1.0）に達したら配列から削除
            if (scan.position <= -1.0) {
                return false;
            }
            
            // サスティン終了チェック（キーが押されている場合は無効化しない）
            if (!this.laserScanKeyPressed && scan.endTime > 0 && currentTime >= scan.endTime) {
                return false;
            }
            
            return true;
        });
        
        // パーティクルマテリアルのuniformを更新（最大10個のレーザースキャン）
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
                this.laserScanPositions[i] = 1.0;  // 手前側（見えない位置）
                this.laserScanWidths[i] = 0.0;
                this.laserScanIntensities[i] = 0.0;
            }
            
            // uniformsを更新
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
        }
    }
    
    /**
     * 多様体の複雑さや形を変形（トラック6用、急激に変形）
     */
    transformManifold(noteNumber = null, velocity = null) {
        // ノート番号に応じて異なる変形モード（より極端な変形）
        // 0-11: 複雑さを急激に変更（0.3 ～ 8.0の範囲、より広く）
        // 12-23: スケールを急激に変更（50.0 ～ 500.0の範囲、より広く）
        // 24-35: 複雑さとスケールの急激な組み合わせ
        
        if (noteNumber === null) {
            // ノート番号がない場合はランダムに急激に変形
            const mode = Math.floor(Math.random() * 3);
            if (mode === 0) {
                // 複雑さを急激に変更（より極端な値）
                this.manifoldComplexity = 0.3 + Math.random() * 7.7;  // 0.3 ～ 8.0
                debugLog('scene10', `複雑さを急激に変更: ${this.manifoldComplexity.toFixed(2)}`);
            } else if (mode === 1) {
                // スケールを急激に変更（より極端な値）
                this.manifoldScale = 50.0 + Math.random() * 450.0;  // 50.0 ～ 500.0
                debugLog('scene10', `スケールを急激に変更: ${this.manifoldScale.toFixed(2)}`);
            } else {
                // 両方を急激に変更
                this.manifoldComplexity = 0.3 + Math.random() * 7.7;
                this.manifoldScale = 50.0 + Math.random() * 450.0;
                debugLog('scene10', `複雑さとスケールを急激に変更: ${this.manifoldComplexity.toFixed(2)}, ${this.manifoldScale.toFixed(2)}`);
            }
        } else {
            // ノート番号に基づいて急激に変形
            if (noteNumber < 12) {
                // 0-11: 複雑さを急激に変更（0.3 ～ 8.0）
                const complexityRange = 7.7;  // より広い範囲
                this.manifoldComplexity = 0.3 + (noteNumber / 11.0) * complexityRange;
                debugLog('scene10', `複雑さを急激に変更 (Note ${noteNumber}): ${this.manifoldComplexity.toFixed(2)}`);
            } else if (noteNumber < 24) {
                // 12-23: スケールを急激に変更（50.0 ～ 500.0）
                const scaleRange = 450.0;  // より広い範囲
                const normalizedNote = (noteNumber - 12) / 11.0;
                this.manifoldScale = 50.0 + normalizedNote * scaleRange;
                debugLog('scene10', `スケールを急激に変更 (Note ${noteNumber}): ${this.manifoldScale.toFixed(2)}`);
            } else if (noteNumber < 36) {
                // 24-35: 複雑さとスケールの急激な組み合わせ（極端な値）
                const normalizedNote = (noteNumber - 24) / 11.0;
                this.manifoldComplexity = 0.3 + normalizedNote * 7.7;
                this.manifoldScale = 50.0 + (1.0 - normalizedNote) * 450.0;  // 逆相関
                debugLog('scene10', `複雑さとスケールを急激に変更 (Note ${noteNumber}): ${this.manifoldComplexity.toFixed(2)}, ${this.manifoldScale.toFixed(2)}`);
            } else {
                // 36以上: リセット
                this.manifoldComplexity = this.baseManifoldComplexity;
                this.manifoldScale = this.baseManifoldScale;
                debugLog('scene10', `リセット: ${this.manifoldComplexity.toFixed(2)}, ${this.manifoldScale.toFixed(2)}`);
            }
        }
        
        // ベロシティに応じて変形の強度をさらに調整（より極端に）
        if (velocity !== null && velocity > 0) {
            const velocityFactor = velocity / 127.0;  // 0.0 ～ 1.0
            // ベロシティが高いほど変形がさらに強くなる
            const complexityBoost = (velocityFactor - 0.5) * 2.0;  // -1.0 ～ 1.0
            const scaleBoost = (velocityFactor - 0.5) * 100.0;  // -50.0 ～ 50.0
            this.manifoldComplexity += complexityBoost;
            this.manifoldScale += scaleBoost;
            // 範囲を制限
            this.manifoldComplexity = Math.max(0.1, Math.min(10.0, this.manifoldComplexity));
            this.manifoldScale = Math.max(30.0, Math.min(600.0, this.manifoldScale));
        }
    }
    
    
    /**
     * キーダウン処理
     */
    handleKeyDown(trackNumber) {
        super.handleKeyDown(trackNumber);
        
        // トラック2: Scene10専用色反転開始
        if (trackNumber === 2) {
            this.scene10ColorInversionKeyPressed = true;
            this.scene10ColorInverted = true;
            debugLog('colorInversion', '色反転ON (キー押下)');
        }
        // トラック8: レーザースキャン開始
        else if (trackNumber === 8) {
            this.laserScanKeyPressed = true;
            this.applyLaserScan(127.0, 64.0, 0.0);  // デフォルト値で有効化
        }
    }
    
    /**
     * キーが離された時の処理
     */
    handleKeyUp(trackNumber) {
        super.handleKeyUp(trackNumber);
        
        // トラック2: Scene10専用色反転キー解放
        if (trackNumber === 2) {
            this.scene10ColorInversionKeyPressed = false;
            this.scene10ColorInverted = false;
            debugLog('colorInversion', '色反転OFF (キー解放)');
        }
        // トラック8: レーザースキャンキー解放
        else if (trackNumber === 8) {
            this.laserScanKeyPressed = false;
            // キーが離されたらすべてのスキャンを削除
            this.laserScans = [];
            
            // uniformsをリセット
            if (this.gpuParticleSystem && this.gpuParticleSystem.particleMaterial && 
                this.gpuParticleSystem.particleMaterial.uniforms) {
                const uniforms = this.gpuParticleSystem.particleMaterial.uniforms;
                if (uniforms.laserScanCount) {
                    uniforms.laserScanCount.value = 0;
                }
                if (uniforms.laserScanIntensities) {
                    uniforms.laserScanIntensities.value = new Float32Array(this.maxScans);
                }
            }
        }
    }
    
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
        
        // すべてのマーカースフィアを削除
        this.manifoldSpheres.forEach(sphere => {
            sphere.dispose(this.scene);
        });
        this.manifoldSpheres = [];
        
        // レーザースキャンをリセット
        this.laserScans = [];
        this.laserScanKeyPressed = false;
        for (let i = 0; i < this.maxScans; i++) {
            this.laserScanPositions[i] = 1.0;
            this.laserScanWidths[i] = 0.0;
            this.laserScanIntensities[i] = 0.0;
        }
        
        debugLog('scene10', 'reset');
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
        debugLog('scene10', 'cleanupSceneSpecificElements');
        
        // Scene10独自のcolorInversionPassを無効にする（シーン切り替え時にリセット）
        if (this.colorInversionPass) {
            this.colorInversionPass.enabled = false;
        }
        
        // HUDのCanvasをクリア（テキストが残らないように）
        if (this.hud && this.hud.ctx && this.hud.canvas) {
            this.hud.ctx.clearRect(0, 0, this.hud.canvas.width, this.hud.canvas.height);
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
        
        // グループをクリア
        if (this.manifoldGroup) {
            while (this.manifoldGroup.children.length > 0) {
                const child = this.manifoldGroup.children[0];
                this.manifoldGroup.remove(child);
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            }
            this.scene.remove(this.manifoldGroup);
            this.manifoldGroup = null;
        }
        
        // すべてのマーカースフィアを破棄
        this.manifoldSpheres.forEach(sphere => {
            if (sphere.dispose) {
                sphere.dispose(this.scene);
            }
        });
        this.manifoldSpheres = [];
        
        // 時間変数をリセット
        this.time = 0.0;
        this.sketchStartTime = Date.now();
        
        // 2Dテキストエフェクトを無効化
        this.textEffectActive = false;
        this.textEffectEndTime = 0;
        this.currentText = '';
        this.textEffectFrameCounter = 0;
        if (this.textEffectCtx && this.textEffectCanvas) {
            this.textEffectCtx.clearRect(0, 0, this.textEffectCanvas.width, this.textEffectCanvas.height);
        }
        
    }
    
    /**
     * クリーンアップ処理（シーン切り替え時に呼ばれる）
     */
    dispose() {
        debugLog('scene10', 'dispose開始');
        
        // GPUパーティクルシステムを破棄（共有リソースを使っている場合は返却のみ）
        if (this.gpuParticleSystem) {
            const particleSystem = this.gpuParticleSystem.getParticleSystem();
            if (particleSystem) {
                this.scene.remove(particleSystem);
            }
            
            if (this.useSharedResources && this.sharedResourceManager) {
                // 共有リソースの場合は返却のみ（disposeしない）
                this.sharedResourceManager.releaseGPUParticleSystem('scene10');
                debugLog('scene10', '共有リソースを返却');
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
        
        // グループをクリア
        if (this.manifoldGroup) {
            while (this.manifoldGroup.children.length > 0) {
                const child = this.manifoldGroup.children[0];
                this.manifoldGroup.remove(child);
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            }
            this.scene.remove(this.manifoldGroup);
            this.manifoldGroup = null;
        }
        
        // すべてのマーカースフィアを破棄
        this.manifoldSpheres.forEach(sphere => {
            sphere.dispose(this.scene);
        });
        this.manifoldSpheres = [];
        
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
        
        // 2Dテキストエフェクト用Canvasを削除
        if (this.textEffectCanvas) {
            if (this.textEffectCanvas.parentElement) {
                this.textEffectCanvas.parentElement.removeChild(this.textEffectCanvas);
            }
            if (document.body.contains(this.textEffectCanvas)) {
                document.body.removeChild(this.textEffectCanvas);
            }
            this.textEffectCanvas = null;
            this.textEffectCtx = null;
        }
        
        this.currentText = '';
        this.textEffectFrameCounter = 0;
        
        debugLog('scene10', 'dispose完了');
        
        // 親クラスのdisposeを呼ぶ
        super.dispose();
    }
    
    /**
     * リサイズ処理
     */
    onResize() {
        super.onResize();
        
        // 2Dテキストエフェクト用Canvasのサイズを更新
        if (this.textEffectCanvas) {
            this.textEffectCanvas.width = window.innerWidth;
            this.textEffectCanvas.height = window.innerHeight;
        }
        
        // 2Dテキストエフェクト用Canvasもリサイズ
        if (this.textEffectCanvas) {
            this.textEffectCanvas.width = window.innerWidth;
            this.textEffectCanvas.height = window.innerHeight;
        }
        
        // composerの解像度も更新
        if (this.composer) {
            this.composer.setSize(window.innerWidth, window.innerHeight);
        }
    }
}
