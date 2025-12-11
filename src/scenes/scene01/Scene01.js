/**
 * Scene01: 球体パーティクル + ミサイル
 * ProcessingのScene01を移植
 */

import { SceneBase } from '../SceneBase.js';
import { LFO } from '../../lib/LFO.js';
import { GPUParticleSystem } from '../../lib/GPUParticleSystem.js';
import { Scene01_Missile } from './Scene01_Missile.js';
import { Scene01_Scope } from './Scene01_Scope.js';
import { BackgroundGradient } from '../../lib/BackgroundGradient.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export class Scene01 extends SceneBase {
    constructor(renderer, camera) {
        super(renderer, camera);
        this.title = 'mathym | wzswrs';
        
        // 表示設定（デフォルトでパーティクルを表示）
        this.SHOW_PARTICLES = true;
        this.SHOW_LINES = true;
        
        // 表示設定（デフォルトでパーティクルを表示）
        this.SHOW_PARTICLES = true;
        this.SHOW_LINES = true;
        
        // グリッドパラメータ（150万粒 = 1225 x 1225 = 1,500,625粒）
        this.cols = 1225;
        this.rows = 1225;
        
        // 球体パラメータ
        this.baseRadius = 400.0;  // Processingと同じ
        
        // ノイズパラメータ（緩めのノイズ）
        // ノイズスケールを大きめ（緩め）に設定
        this.noiseScale = 1.0;  // 緩めのノイズ（値が小さいほど緩い）
        this.noiseStrength = 50.0;  // Processingと同じ初期値（LFOで10.0〜200.0に変化）
        this.time = 0.0;
        this.timeIncrement = 0.001;
        
        // LFO
        this.noiseScaleLFO = null;
        this.noiseStrengthLFO = null;
        
        // 時間経過管理
        this.sketchStartTime = Date.now();
        this.fadeInDuration = 30000.0;  // 30秒
        
        // ミサイル
        this.missiles = [];
        this.lastMissileStartPos = null;
        this.lastMissileTime = 0;
        
        // スコープ
        this.activeScopes = [];
        
        // スコープ用の共有Canvas（全スコープで1つのCanvasを使用してパフォーマンス向上）
        this.scopeCanvas = null;
        this.scopeCtx = null;
        
        // カメラ設定
        this.centerOffsetRatio = 0.3;
        this.pointRotationX = 0.0;
        
        
        // GPUパーティクルシステム
        this.gpuParticleSystem = null;
        
        // 線描画用
        this.lineSystem = null;
        
        // 色反転エフェクト、glitch、chromaticAberrationはSceneBaseで共通化されているため、ここでは宣言しない
        
        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
    }
    
    async setup() {
        // 親クラスのsetup()を呼ぶ（ColorInversionの初期化を含む）
        await super.setup();
        
        // カメラパーティクルの距離パラメータを再設定（親クラスで設定された後に上書き）
        if (this.cameraParticles) {
            for (const cameraParticle of this.cameraParticles) {
                this.setupCameraParticleDistance(cameraParticle);
            }
        }
        
        // GPUパーティクルシステムを初期化（シェーダーパスを指定）
        const particleCount = this.cols * this.rows;
        this.gpuParticleSystem = new GPUParticleSystem(
            this.renderer,
            particleCount,
            this.cols,
            this.rows,
            this.baseRadius,
            'scene01'  // シェーダーパス
        );
        
        // シェーダーの読み込み完了を待つ
        await this.gpuParticleSystem.initPromise;
        
        // パーティクルシステムをシーンに追加
        const particleSystem = this.gpuParticleSystem.getParticleSystem();
        if (particleSystem) {
            this.scene.add(particleSystem);
        }
        
        // パーティクル数を設定
        this.setParticleCount(particleCount);
        
        // LFOを初期化
        // noiseScaleを0.5〜8.0の間で揺らす（rate: 0.001、値が大きいほど細かいノイズ）
        this.noiseScaleLFO = new LFO(0.001, 0.5, 8.0);
        // noiseStrengthを0.0から始めて徐々に10.0〜200.0に近づく（rate: 0.03）
        this.noiseStrengthLFO = new LFO(0.03, 0.0, 0.0);
        
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
        
        // 背景グラデーションを初期化
        this.backgroundGradient = new BackgroundGradient(this.scene, this.renderer);
        
        // 色反転エフェクトはSceneBaseで共通化されているため、ここでは初期化しない
        // this.colorInversion = new ColorInversion(this.renderer, this.scene, this.camera);
        
        // 線描画システムを初期化
        this.createLineSystem();
        
        // 色収差エフェクトとグリッチエフェクトはSceneBaseで初期化される
        
        // スコープ用の共有Canvasを初期化（既存のCanvasがあれば削除してから作成）
        const existingScopeCanvas = document.getElementById('scene01-scope-canvas');
        if (existingScopeCanvas) {
            existingScopeCanvas.parentElement?.removeChild(existingScopeCanvas);
        }
        
        this.scopeCanvas = document.createElement('canvas');
        this.scopeCanvas.id = 'scene01-scope-canvas';
        this.scopeCanvas.width = window.innerWidth;
        this.scopeCanvas.height = window.innerHeight;
        this.scopeCanvas.style.position = 'absolute';
        this.scopeCanvas.style.top = '0';
        this.scopeCanvas.style.left = '0';
        this.scopeCanvas.style.pointerEvents = 'none';
        this.scopeCanvas.style.zIndex = '1001'; // HUDより上に表示
        this.scopeCtx = this.scopeCanvas.getContext('2d');
        // フォントを一度だけ設定（パフォーマンス最適化）
        this.scopeCtx.font = '20px monospace';
        this.scopeCtx.textAlign = 'center';
        this.scopeCtx.textBaseline = 'top';
        document.body.appendChild(this.scopeCanvas);
    }
    
    /**
     * 線描画システムを作成
     */
    createLineSystem() {
        if (!this.SHOW_LINES) return;
        
        // シェーダーを読み込む（非同期）
        const shaderBasePath = `/shaders/${'scene01'}/`;
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
        
        // 縦線（各緯度ごとに、上下の緯度を結ぶ線）と横線（各経度ごとに、左右の経度を結ぶ線）を描画
        const lineGeometries = [];
        const lineMaterials = [];
        
        // 縦線：各緯度ごとに、上下の緯度を結ぶ線（Processingと同じ：TRIANGLE_STRIPで連続描画）
        for (let y = 0; y < this.rows - 1; y++) {
            // Processingと同じ：各経度ごとに上下2つの頂点を交互に配置
            // 頂点数: cols * 2 (各経度ごとに上下2つの頂点)
            const vertexCount = this.cols * 2;
            const rowIndices = new Float32Array(vertexCount);
            const colIndices = new Float32Array(vertexCount);
            
            for (let x = 0; x < this.cols; x++) {
                const index = x * 2;
                // 上側の頂点（現在の緯度）
                rowIndices[index] = y;
                colIndices[index] = x;
                // 下側の頂点（次の緯度）
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
                linewidth: 5  // 線の太さ（大きく設定）
            });
            
            lineGeometries.push(geometry);
            lineMaterials.push(material);
        }
        
        // 横線：各経度ごとに、左右の経度を結ぶ線（Processingと同じ：TRIANGLE_STRIPで連続描画）
        for (let x = 0; x < this.cols - 1; x++) {
            // Processingと同じ：各緯度ごとに左右2つの頂点を交互に配置
            // 頂点数: rows * 2 (各緯度ごとに左右2つの頂点)
            const vertexCount = this.rows * 2;
            const rowIndices = new Float32Array(vertexCount);
            const colIndices = new Float32Array(vertexCount);
            
            for (let y = 0; y < this.rows; y++) {
                const index = y * 2;
                // 左側の頂点（現在の経度）
                rowIndices[index] = y;
                colIndices[index] = x;
                // 右側の頂点（次の経度）
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
                linewidth: 5  // 線の太さ（大きく設定）
            });
            
            lineGeometries.push(geometry);
            lineMaterials.push(material);
        }
        
        // すべての線を1つのグループとして管理
        this.lineSystem = new THREE.Group();
        for (let i = 0; i < lineGeometries.length; i++) {
            // LineSegmentsで描画（Processingと同じTRIANGLE_STRIPの代わりに）
            const line = new THREE.LineSegments(lineGeometries[i], lineMaterials[i]);
            this.lineSystem.add(line);
        }
        
        this.scene.add(this.lineSystem);
    }
    
    /**
     * カメラパーティクルの距離パラメータを設定
     */
    setupCameraParticleDistance(cameraParticle) {
        // Scene01用：カメラを適切な距離に設定
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
        
        // LFOを更新（deltaTimeを渡す）
        if (this.noiseScaleLFO) {
            this.noiseScaleLFO.update(deltaTime);
        }
        if (this.noiseStrengthLFO) {
            this.noiseStrengthLFO.update(deltaTime);
        }
        
        // 時間経過を計算
        const elapsedTime = Date.now() - this.sketchStartTime;
        const fadeProgress = Math.max(0, Math.min(1, elapsedTime / this.fadeInDuration));
        
        // noiseStrengthLFOの範囲を時間経過で調整（Processingを参考に）
        const targetMin = 10.0;
        const targetMax = 200.0;
        const currentMin = 0.0 + (targetMin - 0.0) * fadeProgress;
        const currentMax = 0.0 + (targetMax - 0.0) * fadeProgress;
        if (this.noiseStrengthLFO) {
            this.noiseStrengthLFO.setRange(currentMin, currentMax);
        }
        
        // LFOの値を使ってnoiseScaleとnoiseStrengthを揺らす
        if (this.noiseScaleLFO) {
            this.noiseScale = this.noiseScaleLFO.getValue();
        }
        if (this.noiseStrengthLFO) {
            this.noiseStrength = this.noiseStrengthLFO.getValue();
        }
        
        // GPUパーティクルの更新（SHOW_PARTICLESがtrueの場合のみ）
        if (this.SHOW_PARTICLES && this.gpuParticleSystem) {
            this.gpuParticleSystem.update({
                time: this.time,
                noiseScale: this.noiseScale,
                noiseStrength: this.noiseStrength,
                baseRadius: this.baseRadius
            });
        }
        
        // DEBUG: 線描画の更新を無効化（パフォーマンステスト用）
        // 線描画の更新（SHOW_LINESがtrueの場合のみ）
        // if (this.SHOW_LINES && this.lineSystem && this.gpuParticleSystem) {
        //     this.updateLineSystem();
        // }
        if (false && this.SHOW_LINES && this.lineSystem && this.gpuParticleSystem) {
            this.updateLineSystem();
        }
        
        // ミサイルの更新
        this.updateMissiles();
        
        // スコープの更新
        this.updateScopes();
        
        // 色収差エフェクトとグリッチエフェクトの更新はSceneBaseで処理される
        
        // 背景グラデーションの更新（サスティン終了チェック）
        if (this.backgroundGradient) {
            this.backgroundGradient.update();
        }
        
        // 色反転エフェクトの更新（SceneBaseで共通化されているため、ここでは処理しない）
        // if (this.colorInversion) {
        //     this.colorInversion.update();
        // }
    }
    
    /**
     * 描画処理（オーバーライド）
     */
    render() {
        // 背景色を設定（グラデーションが有効な場合は黒、無効な場合は通常通り）
        if (this.backgroundGradient && this.backgroundGradient.intensity > 0.0) {
            // グラデーションが有効な場合は背景を黒にして、グラデーションメッシュが見えるようにする
            this.renderer.setClearColor(0x000000);
        } else {
            this.renderer.setClearColor(0x000000);  // 常に黒背景（色反転で白になる）
        }
        
        // SceneBaseのrenderメソッドを使用（色反転、glitch、chromaticAberrationを含む）
        super.render();
        
        // スコープを描画（Canvas2Dで描画される）
        // updateScopes()で既に描画されている
        
        // 注意: super.render()で既にdrawScreenshotText()が呼ばれているが、
        // 念のため明示的に呼んでいる（重複しても問題ない）
        this.drawScreenshotText();
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
        
        // カメラ位置を取得
        const cameraPos = this.cameraParticles[this.currentCameraIndex]?.getPosition() || new THREE.Vector3();
        
        // 各線のマテリアルにテクスチャを設定
        this.lineSystem.children.forEach(line => {
            if (line.material && line.material.uniforms) {
                line.material.uniforms.positionTexture.value = positionTexture;
                line.material.uniforms.colorTexture.value = colorTexture;
            }
        });
    }
    
    /**
     * ミサイルの更新
     */
    updateMissiles() {
        this.missiles = this.missiles.filter(missile => {
            const wasActive = missile.getIsActive();
            missile.update();
            missile.updateThreeObjects(this.scene);
            
            // 着弾後、フェードアウトが完了したら削除（progressが1.0で完全に消えたら）
            if (!missile.getIsActive() && missile.progress >= 1.0) {
                // 軌跡が完全に消えたかチェック（透明度が0になったら）
                if (missile.trailMaterial && missile.trailMaterial.opacity <= 0.0) {
                    missile.dispose(this.scene);
                    return false;
                }
            }
            return true;
        });
    }
    
    /**
     * スコープの更新
     */
    updateScopes() {
        // 共有Canvasが初期化されていない場合は初期化
        if (!this.scopeCanvas || !this.scopeCtx) {
            // 既存のCanvasがあれば削除してから作成
            const existingScopeCanvas = document.getElementById('scene01-scope-canvas');
            if (existingScopeCanvas) {
                existingScopeCanvas.parentElement?.removeChild(existingScopeCanvas);
            }
            
            this.scopeCanvas = document.createElement('canvas');
            this.scopeCanvas.id = 'scene01-scope-canvas';
            this.scopeCanvas.width = window.innerWidth;
            this.scopeCanvas.height = window.innerHeight;
            this.scopeCanvas.style.position = 'absolute';
            this.scopeCanvas.style.top = '0';
            this.scopeCanvas.style.left = '0';
            this.scopeCanvas.style.pointerEvents = 'none';
            this.scopeCanvas.style.zIndex = '1001'; // HUDより上に表示
            this.scopeCtx = this.scopeCanvas.getContext('2d');
            // フォントを一度だけ設定（パフォーマンス最適化）
            this.scopeCtx.font = '20px monospace';
            this.scopeCtx.textAlign = 'center';
            this.scopeCtx.textBaseline = 'top';
            document.body.appendChild(this.scopeCanvas);
        }
        
        // 共有Canvasをクリア（常にクリアしてから描画）
        if (this.scopeCtx && this.scopeCanvas) {
            this.scopeCtx.clearRect(0, 0, this.scopeCanvas.width, this.scopeCanvas.height);
        }
        
        // アクティブなスコープがない場合はここで終了（Canvasは既にクリア済み）
        if (this.activeScopes.length === 0) {
            return;
        }
        
        this.activeScopes = this.activeScopes.filter(scope => {
            scope.update();
            if (scope.isDead()) {
                scope.dispose(this.scene);
                return false;
            }
            // 共有Canvasを使用して描画
            if (this.scopeCtx && this.scopeCanvas) {
                scope.updateThreeObjects(this.scopeCtx, this.scopeCanvas);
            }
            return true;
        });
    }
    
    /**
     * ミサイルを発射
     */
    launchMissile(velocity = 127.0, noteNumber = 64.0, durationMs = 0.0) {
        const currentTime = Date.now();
        const timeDiff = currentTime - this.lastMissileTime;
        
        // 起点を計算
        let startPos;
        if (this.lastMissileStartPos && timeDiff < 2000) {
            // 前回の位置に近い位置に
            const lastNormalized = this.lastMissileStartPos.clone().normalize();
            let lastLat = Math.asin(lastNormalized.y);
            let lastLon = Math.atan2(lastNormalized.z, lastNormalized.x);
            if (lastLon < 0) lastLon += Math.PI * 2;
            
            const distanceFactor = Math.max(0.1, Math.min(1.0, timeDiff / 2000));
            const maxLatOffset = (Math.PI / 2) * distanceFactor;
            const maxLonOffset = Math.PI * distanceFactor;
            
            let startLat = lastLat + (Math.random() - 0.5) * 2 * maxLatOffset;
            let startLon = lastLon + (Math.random() - 0.5) * 2 * maxLonOffset;
            
            startLat = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, startLat));
            if (startLon < 0) startLon += Math.PI * 2;
            if (startLon >= Math.PI * 2) startLon -= Math.PI * 2;
            
            startPos = new THREE.Vector3(
                this.baseRadius * Math.cos(startLat) * Math.cos(startLon),
                this.baseRadius * Math.sin(startLat),
                this.baseRadius * Math.cos(startLat) * Math.sin(startLon)
            );
        } else {
            // 完全にランダムな位置
            const startLat = (Math.random() - 0.5) * Math.PI;
            const startLon = Math.random() * Math.PI * 2;
            startPos = new THREE.Vector3(
                this.baseRadius * Math.cos(startLat) * Math.cos(startLon),
                this.baseRadius * Math.sin(startLat),
                this.baseRadius * Math.cos(startLat) * Math.sin(startLon)
            );
        }
        
        // 終点を計算
        const targetLat = (Math.random() - 0.5) * Math.PI;
        const targetLon = Math.random() * Math.PI * 2;
        const targetPos = new THREE.Vector3(
            this.baseRadius * Math.cos(targetLat) * Math.cos(targetLon),
            this.baseRadius * Math.sin(targetLat),
            this.baseRadius * Math.cos(targetLat) * Math.sin(targetLon)
        );
        
        // ミサイルを作成
        const missile = new Scene01_Missile(startPos, targetPos, velocity, noteNumber, durationMs);
        missile.createThreeObjects(this.scene);
        this.missiles.push(missile);
        
        // スコープを追加
        const scope = new Scene01_Scope(startPos, velocity, this.renderer, this.camera);
        scope.createThreeObjects(this.scene);
        this.activeScopes.push(scope);
        
        // 前回の位置とタイムを更新
        this.lastMissileStartPos = startPos.clone();
        this.lastMissileTime = currentTime;
    }
    
    /**
     * OSCメッセージの処理
     */
    handleTrackNumber(trackNumber, message) {
        const args = message.args || [];
        
        // トラック1: カメラをランダムに切り替え
        if (trackNumber === 1) {
            this.switchCameraRandom();
        }
        // トラック2: 色反転エフェクト（SceneBaseで共通化されているため、ここでは処理しない）
        // else if (trackNumber === 2) {
        //     // SceneBaseで処理済み
        // }
        // トラック3,4はSceneBaseで処理される
        // トラック5: ミサイルを発射
        else if (trackNumber === 5) {
            const velocity = args[0] || 127.0;
            const noteNumber = args[1] || 64.0;
            const durationMs = args[2] || 0.0;
            this.launchMissile(velocity, noteNumber, durationMs);
        }
    }
    
    /**
     * キーが押された時の処理（SceneBaseでトラック2,3,4を処理）
     */
    handleKeyDown(trackNumber) {
        // 親クラスのhandleKeyDownを呼ぶ（トラック2,3,4のエフェクトなど）
        super.handleKeyDown(trackNumber);
    }
    
    /**
     * キーが離された時の処理（SceneBaseでトラック2,3,4を処理）
     */
    handleKeyUp(trackNumber) {
        // 親クラスのhandleKeyUpを呼ぶ（トラック2,3,4のエフェクトなど）
        super.handleKeyUp(trackNumber);
    }
    
    /**
     * リセット
     */
    reset() {
        super.reset(); // TIMEをリセット
        this.time = 0;
        this.sketchStartTime = Date.now();
        if (this.noiseScaleLFO) {
            this.noiseScaleLFO.reset();
        }
        if (this.noiseStrengthLFO) {
            this.noiseStrengthLFO.reset();
        }
        
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
            this.gpuParticleSystem.dispose();
        }
        
        // GPUパーティクルシステムを再作成
        const particleCount = this.cols * this.rows;
        this.gpuParticleSystem = new GPUParticleSystem(
            this.renderer,
            particleCount,
            this.cols,
            this.rows,
            this.baseRadius,
            'scene01'  // シェーダーパス
        );
        // シェーダーの読み込み完了を待つ
        this.gpuParticleSystem.initPromise.then(() => {
            const newParticleSystem = this.gpuParticleSystem.getParticleSystem();
            if (newParticleSystem) {
                this.scene.add(newParticleSystem);
            }
            // 線描画システムを再作成
            this.createLineSystem();
        });
        
        // ミサイルとスコープを削除
        this.missiles.forEach(missile => {
            missile.dispose(this.scene);
        });
        this.missiles = [];
        
        this.activeScopes.forEach(scope => {
            scope.dispose(this.scene);
        });
        this.activeScopes = [];
        
        // スコープ用の共有Canvasをクリア
        if (this.scopeCtx && this.scopeCanvas) {
            this.scopeCtx.clearRect(0, 0, this.scopeCanvas.width, this.scopeCanvas.height);
        }
        
        this.lastMissileStartPos = null;
        this.lastMissileTime = 0;
    }
    
    /**
     * リサイズ処理
     */
    onResize() {
        // 親クラスのonResizeを呼ぶ（スクリーンショット用Canvasのリサイズ）
        super.onResize();
        
        // スコープ用の共有Canvasをリサイズ
        if (this.scopeCanvas) {
            this.scopeCanvas.width = window.innerWidth;
            this.scopeCanvas.height = window.innerHeight;
        }
        
        // EffectComposerとシェーダーのリサイズはSceneBaseで処理される
        
        // 色反転エフェクトのリサイズ（SceneBaseで共通化されているため、ここでは処理しない）
        // if (this.colorInversion) {
        //     this.colorInversion.onResize();
        // }
    }
    
    /**
     * クリーンアップ処理（シーン切り替え時に呼ばれる）
     */
    dispose() {
        console.log('Scene01.dispose: クリーンアップ開始');
        
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
        
        // ミサイルを破棄
        this.missiles.forEach(missile => {
            if (missile.dispose) {
                missile.dispose(this.scene);
            }
        });
        this.missiles = [];
        
        // スコープを破棄
        this.activeScopes.forEach(scope => {
            if (scope.dispose) {
                scope.dispose(this.scene);
            }
        });
        this.activeScopes = [];
        
        // スコープ用Canvasを削除（確実にクリアしてから削除）
        // IDで確実に削除（既存のCanvasがあれば削除）
        const existingScopeCanvas = document.getElementById('scene01-scope-canvas');
        if (existingScopeCanvas) {
            // まずCanvasの内容をクリア
            const ctx = existingScopeCanvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, existingScopeCanvas.width, existingScopeCanvas.height);
            }
            // DOMから削除
            if (existingScopeCanvas.parentElement) {
                existingScopeCanvas.parentElement.removeChild(existingScopeCanvas);
            }
            // 念のため、document.bodyからも削除を試みる
            if (document.body.contains(existingScopeCanvas)) {
                document.body.removeChild(existingScopeCanvas);
            }
        }
        
        // インスタンス変数もクリア
        if (this.scopeCanvas) {
            if (this.scopeCtx) {
                this.scopeCtx.clearRect(0, 0, this.scopeCanvas.width, this.scopeCanvas.height);
            }
            this.scopeCanvas = null;
            this.scopeCtx = null;
        }
        
        // 背景グラデーションを破棄
        if (this.backgroundGradient && this.backgroundGradient.dispose) {
            this.backgroundGradient.dispose();
            this.backgroundGradient = null;
        }
        
        // すべてのライトを削除（ambientLightも含む）
        // シーンからすべてのライトを削除
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
        
        // LFOをクリア
        this.noiseScaleLFO = null;
        this.noiseStrengthLFO = null;
        
        console.log('Scene01.dispose: クリーンアップ完了');
        
        // 親クラスのdisposeを呼ぶ（最後に呼ぶ）
        super.dispose();
    }
}
