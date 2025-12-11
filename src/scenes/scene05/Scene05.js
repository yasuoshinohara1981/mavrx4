/**
 * Scene05: 棒パーティクルを表示するジェネレーティブアート
 * トラック1〜9をそれぞれ色違いで棒パーティクル表示
 * Processing版のScene05_BarParticle.pdeを参考
 * 完全2D実装（Canvas 2Dで描画）
 */

import { SceneBase } from '../SceneBase.js';
import { Scene05_CollisionCircle } from './Scene05_CollisionCircle.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export class Scene05 extends SceneBase {
    constructor(renderer, camera) {
        super(renderer, camera);
        this.title = 'mathym | Oxi_#09';
        console.log('Scene05: コンストラクタ実行', this.title);
        
        // トラック1〜16の波形データ（増やした）
        this.trackWaveforms = [];
        this.numTracks = 16;
        
        // 衝突エフェクトのリスト（全トラック共通）
        this.collisionCircles = [];
        
        // 衝突エフェクトの表示フラグ（パフォーマンス最適化用）
        this.showCollisionCircles = false;  // デフォルトはオフ（Circle自体をオフ）
        this.showCollisionText = false;  // デフォルトはオフ（テキストのみ）
        
        // 波形生成パラメータ
        this.baseNoiseScale = 0.01;
        this.noteNoiseScale = 0.05;
        this.sustainDecayRate = 0.995;
        this.idleAmplitude = 20.0;
        
        // 周波数スペクトラム用パラメータ
        this.minFrequencyScale = 0.005;
        this.maxFrequencyScale = 0.1;
        
        // イージング用パラメータ
        this.attackTime = 0.1;
        this.releaseTime = 0.3;
        
        // テキスト表示用パラメータ
        this.textWords = [
            // 研究開発系
            'RESEARCH', 'DEVELOPMENT', 'EXPERIMENT', 'TECHNOLOGY', 'INNOVATION', 'PROTOTYPE',
            'ALGORITHM', 'DATA ANALYSIS', 'MACHINE LEARNING', 'AI', 'QUANTUM', 'BIOTECHNOLOGY',
            'NANOTECHNOLOGY', 'ROBOTICS', 'CYBERNETICS', 'NEURAL NETWORK', 'DEEP LEARNING',
            'BIG DATA', 'CLOUD COMPUTING', 'BLOCKCHAIN', 'CRYPTOGRAPHY', 'ENCRYPTION',
            'PROTOCOL', 'SYSTEM', 'NETWORK', 'ARCHITECTURE', 'FRAMEWORK',
            // 自然科学
            'PHYSICS', 'CHEMISTRY', 'BIOLOGY', 'COSMOS', 'ATOM', 'MOLECULE', 'GENE', 'EVOLUTION',
            'ECOSYSTEM', 'CLIMATE', 'GEOLOGY', 'ASTROPHYSICS', 'ASTROBIOLOGY',
            'NEUROSCIENCE', 'GENETICS', 'GENOMICS', 'PROTEOMICS', 'METABOLISM', 'CELL',
            'ORGANISM', 'SPECIES', 'BIODIVERSITY', 'PHOTOSYNTHESIS', 'RESPIRATION',
            'THERMODYNAMICS', 'ENTROPY', 'ENTHALPY', 'CATALYST', 'REACTION',
            // 解析
            'ANALYSIS', 'STATISTICS', 'MODEL', 'PREDICTION', 'SIMULATION', 'COMPUTATION',
            'NUMERICAL', 'EQUATION', 'DIFFERENTIAL', 'INTEGRAL', 'CALCULUS', 'OPTIMIZATION',
            'REGRESSION', 'CORRELATION', 'VARIANCE', 'STANDARD DEVIATION', 'MEAN', 'MEDIAN',
            'DISTRIBUTION', 'PROBABILITY DENSITY', 'SAMPLING', 'HYPOTHESIS', 'TESTING',
            'MONTE CARLO', 'MARKOV CHAIN', 'BAYESIAN', 'FOURIER', 'TRANSFORM',
            // 数学
            'MATHEMATICS', 'GEOMETRY', 'ALGEBRA', 'PROBABILITY', 'TOPOLOGY', 'FRACTAL',
            'VECTOR', 'MATRIX', 'THEOREM', 'PROOF', 'AXIOM', 'LEMMA', 'COROLLARY',
            'SET THEORY', 'GROUP THEORY', 'NUMBER THEORY', 'GRAPH THEORY', 'LOGIC',
            'BOOLEAN', 'BINARY', 'HEXADECIMAL', 'OCTAL', 'DECIMAL',
            'π', 'e', '∞', '∑', '∫', '∂', '∇', '√', '±', '≈',
            // 物理学
            'MECHANICS', 'ELECTROMAGNETISM', 'QUANTUM', 'RELATIVITY', 'ENERGY', 'WAVE',
            'PARTICLE', 'FIELD', 'FORCE', 'MOTION', 'MOMENTUM', 'VELOCITY', 'ACCELERATION',
            'GRAVITY', 'ELECTRICITY', 'MAGNETISM', 'OPTICS', 'THERMODYNAMICS',
            'ENTROPY', 'TEMPERATURE', 'PRESSURE', 'VOLUME', 'DENSITY', 'MASS',
            'CHARGE', 'CURRENT', 'VOLTAGE', 'RESISTANCE', 'CAPACITANCE', 'INDUCTANCE',
            'FREQUENCY', 'WAVELENGTH', 'AMPLITUDE', 'PHASE', 'INTERFERENCE', 'DIFFRACTION',
            // 数字・数値データ
            '3.14159', '2.71828', '1.61803', '299792458', '6.022e23', '1.380649e-23',
            '6.62607015e-34', '9.1093837e-31', '1.6726219e-27', '1.6749275e-27',
            '0.0000000001', '1000000000', '0.01', '0.001', '0.0001', '0.00001',
            '1.0', '2.0', '3.0', '4.0', '5.0', '10.0', '100.0', '1000.0', '10000.0',
            '2024', '2025', '2030', '2050', '2100', '7.8 BILLION', '8.0 BILLION',
            '100%', '50%', '25%', '10%', '1%', '0.1%', '0.01%', '0.001%',
            '±0.001', '±0.01', '±0.1', '±1.0', '±10.0', '±100.0',
            '[0,0,0]', '[1,0,0]', '[0,1,0]', '[0,0,1]', '[255,255,255]',
            'X: 0.000', 'Y: 0.000', 'Z: 0.000', 'R: 0.000', 'G: 0.000', 'B: 0.000',
            'LAT: 0.0°', 'LON: 0.0°', 'ALT: 0.0m', 'SPD: 0.0m/s', 'HDG: 0.0°',
            // 物理定数・数式
            'E=mc²', 'F=ma', 'E=hf', 'PV=nRT', 'E=½mv²', 'F=G(m₁m₂)/r²',
            'c=299792458 m/s', 'h=6.626e-34 J·s', 'k=1.381e-23 J/K',
            'G=6.674e-11 N·m²/kg²', 'e=1.602e-19 C', 'mₑ=9.109e-31 kg',
            'SPEED OF LIGHT', 'PLANCK CONSTANT', 'AVOGADRO NUMBER', 'BOLTZMANN CONSTANT',
            'GRAVITATIONAL CONSTANT', 'ELEMENTARY CHARGE', 'ELECTRON MASS',
            // 戦争・軍事
            'WAR', 'CONFLICT', 'MILITARY', 'WEAPON', 'STRATEGY', 'DEFENSE', 'SECURITY',
            'NUCLEAR', 'WEAPON DEVELOPMENT', 'MISSILE', 'DRONE', 'SATELLITE',
            'RADAR', 'SONAR', 'STEALTH', 'COUNTERMEASURE', 'INTELLIGENCE',
            'SURVEILLANCE', 'RECONNAISSANCE', 'ESPIONAGE', 'CYBER WARFARE',
            'BIOLOGICAL WEAPON', 'CHEMICAL WEAPON', 'RADIOLOGICAL', 'TACTICAL',
            'STRATEGIC', 'DETERRENCE', 'ALLIANCE', 'TREATY', 'ARMISTICE',
            // 世界情勢
            'POLITICS', 'ECONOMY', 'INTERNATIONAL', 'DIPLOMACY', 'TRADE', 'GLOBAL',
            'SOCIETY', 'CULTURE', 'HISTORY', 'FUTURE', 'DEMOCRACY', 'AUTOCRACY',
            'CAPITALISM', 'SOCIALISM', 'COMMUNISM', 'NATIONALISM', 'IMPERIALISM',
            'COLONIALISM', 'INDEPENDENCE', 'REVOLUTION', 'REFORM', 'PROTEST',
            'ELECTION', 'GOVERNMENT', 'PARLIAMENT', 'CONGRESS', 'SENATE',
            'CABINET', 'MINISTRY', 'DEPARTMENT', 'AGENCY', 'BUREAU',
            'GDP', 'GNP', 'INFLATION', 'DEFLATION', 'RECESSION', 'DEPRESSION',
            'UNEMPLOYMENT', 'EMPLOYMENT', 'WAGE', 'SALARY', 'TAX', 'BUDGET',
            'DEBT', 'SURPLUS', 'DEFICIT', 'BALANCE', 'EXCHANGE RATE',
            'CURRENCY', 'DOLLAR', 'EURO', 'YEN', 'YUAN', 'POUND', 'FRANC',
            'STOCK', 'BOND', 'SHARE', 'MARKET', 'INDEX', 'VOLATILITY',
            'CRISIS', 'EMERGENCY', 'DISASTER', 'PANDEMIC', 'EPIDEMIC',
            'MIGRATION', 'REFUGEE', 'IMMIGRATION', 'EMIGRATION', 'POPULATION',
            'URBANIZATION', 'INDUSTRIALIZATION', 'MODERNIZATION', 'GLOBALIZATION',
            'CLIMATE CHANGE', 'GLOBAL WARMING', 'CARBON EMISSION', 'RENEWABLE ENERGY',
            'SUSTAINABILITY', 'ENVIRONMENT', 'POLLUTION', 'CONSERVATION', 'PRESERVATION'
        ];
        
        this.currentText = '';
        this.textChangeInterval = 3;
        this.frameCountForText = 0;
        
        // 描画用Canvas（完全2D）
        this.drawCanvas = null;
        this.drawCtx = null;
        
        // テキスト表示用Canvas
        this.textCanvas = null;
        this.textCtx = null;
        
        // ボケエフェクト用（シェーダー）
        this.blurComposer = null;
        this.blurPass = null;
        this.canvasTexture = null;
        this.canvasPlane = null;
        
        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
        
        // トラック2（色反転エフェクト）をオンにする
        this.trackEffects[2] = true;
        // トラック4（グリッチエフェクト）をオフにする
        this.trackEffects[4] = false;
        
        // 2Dシーンのため、カメラのランダマイズを無効化
        this.cameraTriggerInterval = 999999;
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
        
        // カメラを2D用に設定（正投影カメラ）
        const halfWidth = window.innerWidth / 2;
        const halfHeight = window.innerHeight / 2;
        this.camera = new THREE.OrthographicCamera(
            -halfWidth,
            halfWidth,
            halfHeight,
            -halfHeight,
            0.1,
            1000
        );
        this.camera.position.z = 1;
        
        // トラック1〜9の波形データを初期化
        for (let i = 0; i < this.numTracks; i++) {
            this.trackWaveforms.push(new Scene05_TrackWaveform(i + 1));
        }
        
        // 初期テキストを設定
        if (this.textWords.length > 0) {
            this.currentText = this.textWords[Math.floor(Math.random() * this.textWords.length)];
        }
        
        // 描画用Canvasを初期化（完全2D）
        this.drawCanvas = document.createElement('canvas');
        this.drawCanvas.width = window.innerWidth;
        this.drawCanvas.height = window.innerHeight;
        this.drawCanvas.style.position = 'absolute';
        this.drawCanvas.style.top = '0';
        this.drawCanvas.style.left = '0';
        this.drawCanvas.style.pointerEvents = 'none';
        this.drawCanvas.style.zIndex = '100';
        this.drawCtx = this.drawCanvas.getContext('2d');
        document.body.appendChild(this.drawCanvas);
        
        // テキスト表示用Canvasを初期化
        this.textCanvas = document.createElement('canvas');
        this.textCanvas.width = window.innerWidth;
        this.textCanvas.height = window.innerHeight;
        this.textCanvas.style.position = 'absolute';
        this.textCanvas.style.top = '0';
        this.textCanvas.style.left = '0';
        this.textCanvas.style.pointerEvents = 'none';
        this.textCanvas.style.zIndex = '1000';
        this.textCtx = this.textCanvas.getContext('2d');
        // フォント設定は一度だけ（毎フレーム設定しない）
        this.textCtx.font = '48px Helvetica, Arial, sans-serif';
        this.textCtx.textAlign = 'center';
        this.textCtx.textBaseline = 'center';
        document.body.appendChild(this.textCanvas);
        
        // テキスト描画用のキャッシュ
        this.textFontSet = false;
        
        // ボケエフェクト用のシェーダーを初期化
        this.initBlurShader();
    }
    
    /**
     * ボケエフェクト用のシェーダーを初期化
     */
    async initBlurShader() {
        // ボケシェーダーを読み込む
        const shaderBasePath = `/shaders/common/`;
        try {
            const [vertexShader, fragmentShader] = await Promise.all([
                fetch(`${shaderBasePath}blur.vert`)
                    .then(r => {
                        if (!r.ok) throw new Error('Failed to fetch vertex shader');
                        return r.text();
                    })
                    .then(text => {
                        // HTMLが返ってきた場合はデフォルトシェーダーを使用
                        if (text.includes('<!DOCTYPE') || text.includes('<html')) {
                            return this.getDefaultBlurVertexShader();
                        }
                        return text;
                    })
                    .catch(() => this.getDefaultBlurVertexShader()),
                fetch(`${shaderBasePath}blur.frag`)
                    .then(r => {
                        if (!r.ok) throw new Error('Failed to fetch fragment shader');
                        return r.text();
                    })
                    .then(text => {
                        // HTMLが返ってきた場合はデフォルトシェーダーを使用
                        if (text.includes('<!DOCTYPE') || text.includes('<html')) {
                            return this.getDefaultBlurFragmentShader();
                        }
                        return text;
                    })
                    .catch(() => this.getDefaultBlurFragmentShader())
            ]);
            
            // EffectComposerを作成
            this.blurComposer = new EffectComposer(this.renderer);
            
            // Canvas 2Dの内容をテクスチャに変換
            this.canvasTexture = new THREE.CanvasTexture(this.drawCanvas);
            this.canvasTexture.needsUpdate = true;
            this.canvasTexture.minFilter = THREE.LinearFilter;
            this.canvasTexture.magFilter = THREE.LinearFilter;
            
            // シーンにCanvasを表示するためのPlaneを作成
            const planeGeometry = new THREE.PlaneGeometry(window.innerWidth, window.innerHeight);
            const planeMaterial = new THREE.MeshBasicMaterial({
                map: this.canvasTexture,
                transparent: true
            });
            this.canvasPlane = new THREE.Mesh(planeGeometry, planeMaterial);
            this.canvasPlane.position.set(0, 0, 0);
            this.scene.add(this.canvasPlane);
            
            // RenderPassを追加
            const renderPass = new RenderPass(this.scene, this.camera);
            this.blurComposer.addPass(renderPass);
            
            // ボケシェーダーパスを追加
            const blurShader = {
                uniforms: {
                    tDiffuse: { value: null },
                    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                    blurAmount: { value: 1.0 }
                },
                vertexShader: vertexShader,
                fragmentShader: fragmentShader
            };
            
            this.blurPass = new ShaderPass(blurShader);
            this.blurPass.enabled = true;
            this.blurComposer.addPass(this.blurPass);
            
            console.log('Scene05: ボケシェーダー初期化完了');
        } catch (err) {
            console.error('Scene05: ボケシェーダーの読み込みに失敗:', err);
            // フォールバック: 疑似ボケを使用
        }
    }
    
    /**
     * デフォルトのボケ頂点シェーダー
     */
    getDefaultBlurVertexShader() {
        return `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
    }
    
    /**
     * デフォルトのボケフラグメントシェーダー
     */
    getDefaultBlurFragmentShader() {
        return `
            uniform sampler2D tDiffuse;
            uniform vec2 resolution;
            uniform float blurAmount;
            varying vec2 vUv;
            
            void main() {
                vec2 uv = vUv;
                vec4 color = vec4(0.0);
                float total = 0.0;
                float radius = blurAmount;
                
                // ガウシアンブラー
                for (float x = -radius; x <= radius; x += 1.0) {
                    for (float y = -radius; y <= radius; y += 1.0) {
                        vec2 offset = vec2(x, y) / resolution;
                        float weight = exp(-(x * x + y * y) / (2.0 * radius * radius));
                        color += texture2D(tDiffuse, uv + offset) * weight;
                        total += weight;
                    }
                }
                
                gl_FragColor = color / total;
            }
        `;
    }
    
    /**
     * 更新処理
     */
    onUpdate(deltaTime) {
        const time = Date.now() / 1000.0;
        
        // 各トラックの波形を更新
        for (let i = 0; i < this.numTracks; i++) {
            this.trackWaveforms[i].update(
                time,
                this.baseNoiseScale,
                this.noteNoiseScale,
                this.sustainDecayRate,
                this.idleAmplitude,
                this.minFrequencyScale,
                this.maxFrequencyScale,
                this.attackTime,
                this.releaseTime,
                this.collisionCircles
            );
        }
        
        // 衝突エフェクトを更新
        this.updateCollisionCircles();
        
        // テキストを更新
        this.updateText();
    }
    
    /**
     * 衝突エフェクトを更新
     */
    updateCollisionCircles() {
        for (let i = this.collisionCircles.length - 1; i >= 0; i--) {
            const circle = this.collisionCircles[i];
            circle.update();
            if (!circle.isActive()) {
                this.collisionCircles.splice(i, 1);
            }
        }
    }
    
    /**
     * テキストを更新
     */
    updateText() {
        this.frameCountForText++;
        
        // 指定間隔でテキストをランダマイズ
        if (this.frameCountForText >= this.textChangeInterval) {
            this.frameCountForText = 0;
            if (this.textWords.length > 0) {
                this.currentText = this.textWords[Math.floor(Math.random() * this.textWords.length)];
            }
        }
    }
    
    /**
     * 描画処理
     */
    render() {
        // パーティクル数を計算（全トラックの棒パーティクル数）
        let totalParticles = 0;
        for (let i = 0; i < this.numTracks; i++) {
            if (this.trackWaveforms[i]) {
                totalParticles += this.trackWaveforms[i].waveformPoints;
            }
        }
        this.particleCount = totalParticles;
        
        // 背景色を設定
        if (this.backgroundWhite) {
            this.renderer.setClearColor(0xffffff, 1.0);
        } else {
            this.renderer.setClearColor(0x000000, 1.0);
        }
        
        // カメラを更新（リサイズ対応）
        const halfWidth = window.innerWidth / 2;
        const halfHeight = window.innerHeight / 2;
        this.camera.left = -halfWidth;
        this.camera.right = halfWidth;
        this.camera.top = halfHeight;
        this.camera.bottom = -halfHeight;
        this.camera.updateProjectionMatrix();
        
        // 描画用Canvasをクリア
        if (this.drawCtx) {
            this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
        }
        
        // 波形を描画（Canvas 2D、ボケなしで描画）
        this.drawWaveforms();
        
        // 上下の境界を黒でマスク（衝突する部分を隠す）
        if (this.drawCtx) {
            const topBoundary = window.innerHeight * 0.25;
            const bottomBoundary = window.innerHeight * 0.75;
            const maskHeight = 50.0;  // マスクの高さ（上下それぞれ）
            
            // 上端のマスク（黒で上書き）
            this.drawCtx.fillStyle = this.backgroundWhite ? '#ffffff' : '#000000';
            this.drawCtx.fillRect(0, 0, window.innerWidth, topBoundary + maskHeight);
            
            // 下端のマスク（黒で上書き）
            this.drawCtx.fillRect(0, bottomBoundary - maskHeight, window.innerWidth, window.innerHeight - (bottomBoundary - maskHeight));
        }
        
        // 衝突エフェクトを描画（マスクの上から描画）
        this.drawCollisionCircles();
        
        // Canvas 2Dの内容をテクスチャに更新
        if (this.canvasTexture) {
            this.canvasTexture.needsUpdate = true;
        }
        
        // 色反転エフェクトが有効な場合はCanvas 2Dの内容も反転
        if (this.colorInversion && this.colorInversion.isEnabled()) {
            // Canvas 2Dの内容を反転（globalCompositeOperationを使用）
            if (this.drawCtx) {
                this.drawCtx.save();
                this.drawCtx.globalCompositeOperation = 'difference';
                this.drawCtx.fillStyle = 'white';
                this.drawCtx.fillRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
                this.drawCtx.restore();
            }
            if (this.textCtx) {
                this.textCtx.save();
                this.textCtx.globalCompositeOperation = 'difference';
                this.textCtx.fillStyle = 'white';
                this.textCtx.fillRect(0, 0, this.textCanvas.width, this.textCanvas.height);
                this.textCtx.restore();
            }
            // Canvas 2Dの内容をテクスチャに更新（反転後）
            if (this.canvasTexture) {
                this.canvasTexture.needsUpdate = true;
            }
        }
        
        // ボケエフェクトを適用（シェーダー）
        if (this.blurComposer && this.blurPass && this.blurPass.enabled) {
            // ボケの強度をZ座標に応じて調整（後処理では全体にボケをかける）
            // ここでは簡易的に固定値を使用
            if (this.blurPass.uniforms) {
                this.blurPass.uniforms.blurAmount.value = 2.0;
            }
            this.blurComposer.render();
        } else {
            // ボケエフェクトがない場合は通常のレンダリング
            if (this.canvasPlane) {
                this.renderer.render(this.scene, this.camera);
            }
        }
        
        // テキストを描画（Canvas 2D、ボケなし）
        this.drawText();
        
        // SceneBaseのrenderメソッドを呼ぶ（HUDなど）
        super.render();
    }
    
    /**
     * 波形を描画（Canvas 2D）
     */
    drawWaveforms() {
        if (!this.drawCtx) return;
        
        // 各トラックの波形を描画（アクティブなトラックのみ）
        for (let i = 0; i < this.numTracks; i++) {
            if (this.trackWaveforms[i].isActive()) {
                this.trackWaveforms[i].draw(this.drawCtx, this.backgroundWhite);
            }
        }
    }
    
    /**
     * 衝突エフェクトを描画
     */
    drawCollisionCircles() {
        if (!this.drawCtx || !this.showCollisionCircles) return;  // フラグでオフ
        
        for (const circle of this.collisionCircles) {
            if (circle.isActive()) {
                // テキスト表示フラグを設定
                circle.showText = this.showCollisionText;
                circle.draw(this.drawCtx, this.backgroundWhite);
            }
        }
    }
    
    /**
     * テキストを描画（画面上部の余白の中心に高速でランダマイズ）
     */
    drawText() {
        if (!this.textCtx || !this.currentText) return;
        
        // Canvasをクリア
        this.textCtx.clearRect(0, 0, this.textCanvas.width, this.textCanvas.height);
        
        // フォント設定は一度だけ（毎フレーム設定しない、パフォーマンス最適化）
        // ただし、リサイズ時は再設定される
        if (!this.textFontSet) {
            // 固定サイズで表示（48px）
            this.textCtx.font = '48px Helvetica, Arial, sans-serif';
            this.textCtx.textAlign = 'center';
            this.textCtx.textBaseline = 'center';
            this.textFontSet = true;
        }
        
        // 画面上部の余白の中心に描画（0〜height*0.25の範囲の中心 = height*0.125）
        const textY = window.innerHeight * 0.125;
        const textX = window.innerWidth / 2.0;
        
        // 背景色に応じてテキストの色を設定（Processing版と同じ、alpha=200）
        const textColor = this.backgroundWhite 
            ? { r: 0, g: 0, b: 0, a: 200 }
            : { r: 255, g: 255, b: 255, a: 200 };
        
        // ブルーム効果のパラメータ（軽量化）
        const blurStrength = 0.8;
        const blurLayers = 8;  // 30 → 8に削減（パフォーマンス最適化）
        const blurOffset = blurStrength * 15.0;
        const blurAlpha = 200.0 / blurLayers;
        
        // テキストの色を事前に計算（毎フレーム計算しない）
        const blurColorStr = `rgba(${textColor.r}, ${textColor.g}, ${textColor.b}, ${blurAlpha / 255.0})`;
        const mainColorStr = `rgba(${textColor.r}, ${textColor.g}, ${textColor.b}, ${textColor.a / 255.0})`;
        
        // 複数レイヤーで重ねて描画（ブルーム効果、軽量化）
        this.textCtx.fillStyle = blurColorStr;
        for (let layer = 0; layer < blurLayers; layer++) {
            // 各レイヤーを少しずつずらす（ランダムに）
            const offsetX = (Math.random() - 0.5) * blurOffset * 2;
            const offsetY = (Math.random() - 0.5) * blurOffset * 2;
            
            // テキストを描画（ずらした位置に）
            this.textCtx.fillText(this.currentText, textX + offsetX, textY + offsetY);
        }
        
        // 最後にクリアなテキストを上に重ねる（メインのテキスト）
        this.textCtx.fillStyle = mainColorStr;
        this.textCtx.fillText(this.currentText, textX, textY);
    }
    
    /**
     * OSCメッセージの処理
     */
    handleTrackNumber(trackNumber, message) {
        // トラック1: 全パーティクルに力を加えて動かす
        if (trackNumber === 1) {
            if (message && message.length >= 2) {
                const velocity = message[1] || 127.0;
                const noteNumber = message[0] || 64.0;
                const durationMs = message.length >= 3 ? message[2] : 0.0;
                
                // 全トラックのパーティクルに力を加える
                for (let i = 0; i < this.numTracks; i++) {
                    if (this.trackWaveforms[i]) {
                        // トラック1のノートをトリガー
                        this.trackWaveforms[i].triggerNote(noteNumber, velocity, durationMs);
                        
                        // パーティクルを積極的に動かす：追加の力を加える
                        const baseForce = THREE.MathUtils.mapLinear(velocity, 0, 127, 4.0, 18.0);
                        const randomForce = baseForce * (0.8 + Math.random() * 0.4);  // ランダムな強度
                        
                        // 全パーティクルに力を加える
                        const waveform = this.trackWaveforms[i];
                        for (let j = 0; j < waveform.waveformPoints; j++) {
                            const direction = Math.random() > 0.5 ? 1.0 : -1.0;
                            waveform.barParticles[j].applyForce(randomForce * direction);
                        }
                    }
                }
            }
            return;
        }
        
        // トラック2: 画面全体の色反転エフェクト（SceneBaseで処理）
        if (trackNumber === 2) {
            // SceneBaseのhandleOSCを呼ぶ（画面全体の色反転エフェクトを適用）
            const oscMessage = {
                trackNumber: 2,
                args: message || []
            };
            super.handleOSC(oscMessage);
            return;
        }
        
        // トラック3〜16のみ処理
        if (trackNumber >= 3 && trackNumber <= 16) {
            if (message && message.length >= 2) {
                const noteNumber = message[0] || 64.0;
                const velocity = message[1] || 127.0;
                const durationMs = message.length >= 3 ? message[2] : 0.0;
                
                // 対応するトラックの波形にノートを追加
                const trackIndex = trackNumber - 1;
                if (trackIndex >= 0 && trackIndex < this.numTracks) {
                    this.trackWaveforms[trackIndex].triggerNote(noteNumber, velocity, durationMs);
                    
                    // パーティクルを積極的に動かす：追加の力を加える
                    const baseForce = THREE.MathUtils.mapLinear(velocity, 0, 127, 3.0, 15.0);
                    const randomForce = baseForce * (0.8 + Math.random() * 0.4);  // ランダムな強度
                    
                    // 対応するトラックの全パーティクルに力を加える
                    const waveform = this.trackWaveforms[trackIndex];
                    for (let i = 0; i < waveform.waveformPoints; i++) {
                        const direction = Math.random() > 0.5 ? 1.0 : -1.0;
                        waveform.barParticles[i].applyForce(randomForce * direction);
                    }
                }
            }
        }
    }
    
    /**
     * リセット処理
     */
    reset() {
        super.reset();
        
        // 全トラックの波形データをクリア
        for (let i = 0; i < this.numTracks; i++) {
            this.trackWaveforms[i].reset();
        }
        
        // 衝突エフェクトをクリア
        this.collisionCircles = [];
        
        // テキストをリセット
        this.frameCountForText = 0;
        if (this.textWords.length > 0) {
            this.currentText = this.textWords[Math.floor(Math.random() * this.textWords.length)];
        }
    }
    
    /**
     * リサイズ処理
     */
    onResize() {
        super.onResize();
        
        if (this.drawCanvas) {
            this.drawCanvas.width = window.innerWidth;
            this.drawCanvas.height = window.innerHeight;
        }
        
        if (this.textCanvas) {
            this.textCanvas.width = window.innerWidth;
            this.textCanvas.height = window.innerHeight;
            // リサイズ時にフォントを再設定
            this.textFontSet = false;
        }
        
        // 縦線のキャッシュをクリア（リサイズ時に再計算）
        for (let i = 0; i < this.numTracks; i++) {
            if (this.trackWaveforms[i]) {
                this.trackWaveforms[i].verticalLinesCache = null;
            }
        }
    }
    
    /**
     * クリーンアップ処理
     */
    dispose() {
        console.log('Scene05.dispose: クリーンアップ開始');
        
        // 全トラックの波形データをクリア
        for (let i = 0; i < this.numTracks; i++) {
            this.trackWaveforms[i].reset();
        }
        this.trackWaveforms = [];
        
        // 衝突エフェクトをクリア
        this.collisionCircles = [];
        
        // 描画用Canvasを削除
        if (this.drawCanvas && this.drawCanvas.parentElement) {
            this.drawCanvas.parentElement.removeChild(this.drawCanvas);
            this.drawCanvas = null;
            this.drawCtx = null;
        }
        
        // テキスト表示用Canvasを削除
        if (this.textCanvas && this.textCanvas.parentElement) {
            this.textCanvas.parentElement.removeChild(this.textCanvas);
            this.textCanvas = null;
            this.textCtx = null;
        }
        
        console.log('Scene05.dispose: クリーンアップ完了');
        
        // 親クラスのdisposeを呼ぶ
        super.dispose();
    }
    
    /**
     * カメラにランダムな力を加える（2Dシーンのため無効化）
     */
    updateCameraForce() {
        // 2Dシーンのため、カメラのランダマイズは行わない
    }
    
    /**
     * カメラをランダムに切り替える（2Dシーンのため無効化）
     */
    switchCameraRandom() {
        // 2Dシーンのため、カメラの切り替えは行わない
    }
}

/**
 * Scene05_TrackWaveform: 各トラックの波形データを管理するクラス
 */
class Scene05_TrackWaveform {
    constructor(trackNumber) {
        this.trackNumber = trackNumber;
        this.waveformPoints = 50;  // 70 → 50に削減（パフォーマンス最適化）
        this.barParticles = [];
        this.barXPositions = [];
        this.barZPositions = [];
        this.lastCollisionTime = [];
        this.collisionCooldownMs = 1000.0;
        
        // パフォーマンス最適化用キャッシュ
        this.verticalLinesCache = null;
        
        // ノート状態
        this.isNoteActive = false;
        this.noteStartTime = 0;
        this.noteEndTime = 0;
        this.noteNumber = 64.0;
        this.noteVelocity = 0.0;
        this.noteDurationMs = 0.0;
        
        // パラメータ
        this.friction = 0.95;
        
        // LibRandomLFO（動きの速度と振幅を変動させる）
        this.movementLFO = new LibRandomLFO(0.001, 0.01, 0.3, 2.0);
        
        // 画面幅に均等に配置
        this.initializeBarPositions();
        
        // 50本の棒パーティクルを初期化
        for (let i = 0; i < this.waveformPoints; i++) {
            this.barParticles.push(new Scene05_BarParticle());
            this.lastCollisionTime.push(0);
        }
    }
    
    /**
     * 画面幅に均等に配置（X座標とZ座標を設定）
     */
    initializeBarPositions() {
        for (let i = 0; i < this.waveformPoints; i++) {
            this.barXPositions.push(
                THREE.MathUtils.mapLinear(i, 0, this.waveformPoints - 1, window.innerWidth * 0.1, window.innerWidth * 0.9)
            );
            // Z座標は-500（手前）〜500（奥）の範囲でランダムに設定（ボケエフェクト用）
            this.barZPositions.push(Math.random() * 1000 - 500);
        }
    }
    
    /**
     * ノートをトリガー
     */
    triggerNote(noteNum, velocity, durationMs) {
        this.isNoteActive = true;
        this.noteNumber = noteNum;
        this.noteVelocity = velocity;
        this.noteDurationMs = durationMs;
        this.noteStartTime = Date.now();
        
        if (durationMs > 0) {
            this.noteEndTime = Date.now() + durationMs;
        } else {
            this.noteEndTime = 0;
        }
        
        // LibRandomLFOの現在の値を使って力を調整
        const movementMultiplier = this.movementLFO.getValue();
        const lfoInfluence = THREE.MathUtils.lerp(0.9, 1.1, (movementMultiplier - 0.3) / 1.7);
        
        // 各棒に素早く動く力を加える
        const baseForce = THREE.MathUtils.mapLinear(velocity, 0, 127, 2.0, 10.0);
        const force = baseForce * lfoInfluence;
        
        for (let i = 0; i < this.waveformPoints; i++) {
            const direction = Math.random() > 0.5 ? 1.0 : -1.0;
            this.barParticles[i].applyForce(force * direction);
        }
    }
    
    /**
     * 更新処理
     */
    update(time, baseNoiseScale, noteNoiseScale, sustainDecayRate, idleAmplitudeValue,
           minFreqScale, maxFreqScale, attackTimeValue, releaseTimeValue, collisionCircles) {
        // ノート終了時刻をチェック
        if (this.noteEndTime > 0 && Date.now() >= this.noteEndTime) {
            this.isNoteActive = false;
            this.noteEndTime = 0;
        }
        
        // LibRandomLFOを更新
        this.movementLFO.update();
        
        // ベロシティに応じた速度倍率を計算
        const velocityMultiplier = THREE.MathUtils.mapLinear(this.noteVelocity, 0, 127, 0.5, 2.0);
        
        // LFOの値を使って動きを微調整
        const movementMultiplier = this.movementLFO.getValue();
        const lfoInfluence = THREE.MathUtils.lerp(0.9, 1.1, (movementMultiplier - 0.3) / 1.7);
        
        // 摩擦はベロシティに応じて調整（もっと早く動くように摩擦を減らす）
        const adjustedFriction = THREE.MathUtils.lerp(0.90, 0.80, this.noteVelocity / 127.0);  // 0.92-0.85 → 0.90-0.80（さらに摩擦を減らす）
        
        // 最終的な速度倍率（もっと早く動くように倍率を上げる）
        const finalSpeedMultiplier = velocityMultiplier * lfoInfluence * 2.0;  // 1.5 → 2.0に（さらに速く）
        
        // 各棒パーティクルを更新（衝突検出も行う）
        for (let i = 0; i < this.waveformPoints; i++) {
            const prevPosition = this.barParticles[i].getPosition();
            
            // ノイズベースの動きを追加
            const normalizedX = THREE.MathUtils.mapLinear(i, 0, this.waveformPoints - 1, 0.0, 1.0);
            const noiseScale = THREE.MathUtils.lerp(minFreqScale, maxFreqScale, normalizedX);
            
            // ノート時とアイドル時で異なるノイズを使用
            const currentNoiseScale = this.isNoteActive ? noteNoiseScale : baseNoiseScale;
            // Processingのnoise()関数に近い実装
            const noiseValue = this.noise(this.barXPositions[i] * currentNoiseScale, time * noiseScale);
            const noiseForce = THREE.MathUtils.mapLinear(noiseValue, 0, 1, -idleAmplitudeValue, idleAmplitudeValue);
            
            // ノイズによる力を適用（もっと早く動くように力を強める）
            this.barParticles[i].applyForce(noiseForce * 0.3);  // 0.2 → 0.3（さらに強める）
            
            // ニューラルネットワーク風：活性化値を更新（ノイズと位置に基づいて）
            const normalizedPosition = THREE.MathUtils.mapLinear(
                this.barParticles[i].getPosition(),
                window.innerHeight * 0.25,
                window.innerHeight * 0.75,
                0.0,
                1.0
            );
            // 活性化値は位置とノイズの組み合わせで決定
            const targetActivation = THREE.MathUtils.clamp(
                normalizedPosition * 0.5 + noiseValue * 0.5,
                0.0,
                1.0
            );
            // スムーズに補間
            const currentActivation = this.barParticles[i].activation || 0.5;
            this.barParticles[i].activation = THREE.MathUtils.lerp(currentActivation, targetActivation, 0.1);
            
            this.barParticles[i].update(adjustedFriction, finalSpeedMultiplier);
            const currentPosition = this.barParticles[i].getPosition();
            
            const topBoundary = window.innerHeight * 0.25;
            const bottomBoundary = window.innerHeight * 0.75;
            const boundaryThreshold = 10.0;
            
            // 既に衝突している場合（境界付近にいて、同じ方向に進んでいる場合）は逆方向に力を加える
            const currentVelocity = this.barParticles[i].getVelocity();
            
            // 上端付近にいて、上方向に進んでいる場合
            if (currentPosition <= topBoundary + boundaryThreshold && currentVelocity < -0.3) {
                this.barParticles[i].applyForce(Math.abs(currentVelocity) * 0.5);
            }
            // 下端付近にいて、下方向に進んでいる場合
            else if (currentPosition >= bottomBoundary - boundaryThreshold && currentVelocity > 0.3) {
                this.barParticles[i].applyForce(-Math.abs(currentVelocity) * 0.5);
            }
            
            // 衝突検出（上端または下端に到達したら、速度が一定以上の場合のみ）
            const minCollisionVelocity = 3.0;
            const absVelocity = Math.abs(this.barParticles[i].getVelocity());
            const currentTime = Date.now();
            
            if (absVelocity >= minCollisionVelocity && 
                (currentTime - this.lastCollisionTime[i]) >= this.collisionCooldownMs) {
                
                // 上端に衝突した場合（境界を越えた瞬間のみ）
                if (prevPosition > topBoundary && currentPosition <= topBoundary) {
                    const circle = new Scene05_CollisionCircle(
                        this.barXPositions[i],
                        topBoundary,
                        this.noteNumber,
                        this.noteVelocity,
                        this.noteDurationMs,
                        true
                    );
                    collisionCircles.push(circle);
                    this.lastCollisionTime[i] = currentTime;
                }
                // 下端に衝突した場合（境界を越えた瞬間のみ）
                else if (prevPosition < bottomBoundary && currentPosition >= bottomBoundary) {
                    const circle = new Scene05_CollisionCircle(
                        this.barXPositions[i],
                        bottomBoundary,
                        this.noteNumber,
                        this.noteVelocity,
                        this.noteDurationMs,
                        false
                    );
                    collisionCircles.push(circle);
                    this.lastCollisionTime[i] = currentTime;
                }
            }
        }
    }
    
    /**
     * Processingのnoise()関数に近い実装
     */
    noise(x, y = 0, z = 0) {
        // より良いハッシュ関数
        const hash = (ix, iy, iz) => {
            let n = ix * 73856093.0;
            n = n + iy * 19349663.0;
            n = n + iz * 83492791.0;
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
     * 波形を描画（Canvas 2D、シェーダーでボケを実装）
     */
    draw(ctx, backgroundWhite) {
        if (!ctx || this.barParticles.length < 2) return;
        
        // トラック番号に応じた色を取得（青系のグラデーション）
        const trackColor = this.getTrackColor(this.trackNumber, backgroundWhite);
        const trackAlpha = trackColor.a;
        
        // Z座標の範囲を取得（手前=-500、奥=500）
        const minZ = -500;
        const maxZ = 500;
        
        ctx.save();
        
        // 画面全体に上下を結ぶ縦線を描画（パーティクルとは関係なく、横位置はランダム）
        // パフォーマンス最適化：色と位置を事前計算してキャッシュ
        const topY = window.innerHeight * 0.25;
        const bottomY = window.innerHeight * 0.75;
        const numVerticalLines = 100;  // 1000 → 100に削減（パフォーマンス最適化）
        
        // 縦線のデータを事前計算（初回のみ、またはリサイズ時のみ）
        if (!this.verticalLinesCache || this.verticalLinesCache.length !== numVerticalLines) {
            this.verticalLinesCache = [];
            for (let i = 0; i < numVerticalLines; i++) {
                // 横位置をランダムに（固定）
                const x = Math.random() * window.innerWidth;
                
                // 青寄りのランダムな色（固定）
                const hue = THREE.MathUtils.randFloat(180 / 360, 240 / 360);
                const saturation = THREE.MathUtils.randFloat(0.7, 1.0);
                const lightness = THREE.MathUtils.randFloat(0.5, 0.8);
                const lineColor = new THREE.Color().setHSL(hue, saturation, lightness);
                
                this.verticalLinesCache.push({
                    x: x,
                    r: Math.round(lineColor.r * 255),
                    g: Math.round(lineColor.g * 255),
                    b: Math.round(lineColor.b * 255)
                });
            }
        }
        
        // 線の透明度と太さ（固定値）
        const lineAlpha = trackAlpha * 0.15;
        const lineWidth = 0.5;
        
        // 同じ色の線をまとめて描画（パフォーマンス最適化）
        ctx.lineWidth = lineWidth;
        for (let i = 0; i < this.verticalLinesCache.length; i++) {
            const line = this.verticalLinesCache[i];
            ctx.strokeStyle = `rgba(${line.r}, ${line.g}, ${line.b}, ${lineAlpha})`;
            ctx.beginPath();
            ctx.moveTo(line.x, topY);
            ctx.lineTo(line.x, bottomY);
            ctx.stroke();
        }
        
        // ニューラルネットワーク風：接続線を描画（棒同士を結ぶ、活性化値に応じて色と太さを調整）
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        for (let i = 0; i < this.waveformPoints - 1; i++) {
            const x1 = this.barXPositions[i];
            const y1 = this.barParticles[i].getPosition();
            const z1 = this.barZPositions[i];
            const x2 = this.barXPositions[i + 1];
            const y2 = this.barParticles[i + 1].getPosition();
            const z2 = this.barZPositions[i + 1];
            
            // 2つの棒のZ座標の平均を計算
            const avgZ = (z1 + z2) / 2.0;
            
            // Z座標に応じたサイズとボケの係数を計算（手前=1.0、奥=0.3）
            const normalizedZ = THREE.MathUtils.mapLinear(avgZ, minZ, maxZ, 0.0, 1.0);
            const blurMultiplier = THREE.MathUtils.lerp(0.0, 2.5, normalizedZ);
            const lineWidth = THREE.MathUtils.lerp(4.0, 1.0, normalizedZ);
            
            // ニューラルネットワーク風：活性化値に応じて接続の強度を表現
            const activation1 = this.barParticles[i].activation || 0.5;
            const activation2 = this.barParticles[i + 1].activation || 0.5;
            const connectionStrength = (activation1 + activation2) / 2.0;
            
            // 接続の強度に応じて色を変える（青寄り、強度が高いほど明るく）
            const connectionHue = THREE.MathUtils.lerp(200 / 360, 180 / 360, connectionStrength);  // 青〜シアン
            const connectionSaturation = THREE.MathUtils.lerp(0.6, 1.0, connectionStrength);
            const connectionLightness = THREE.MathUtils.lerp(0.4, 0.8, connectionStrength);
            const connectionColor = new THREE.Color().setHSL(connectionHue, connectionSaturation, connectionLightness);
            
            // 線の透明度をボケと接続強度に応じて調整
            const lineAlpha = trackAlpha * 0.5 * (1.0 - blurMultiplier * 0.4) * connectionStrength;
            
            ctx.strokeStyle = `rgba(${Math.round(connectionColor.r * 255)}, ${Math.round(connectionColor.g * 255)}, ${Math.round(connectionColor.b * 255)}, ${lineAlpha})`;
            ctx.lineWidth = lineWidth * (0.5 + connectionStrength * 0.5);  // 接続強度に応じて太さを変える
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        
        // 各棒を描画（Z座標に応じてサイズとボケを調整）
        for (let i = 0; i < this.waveformPoints; i++) {
            const x = this.barXPositions[i];
            const y = this.barParticles[i].getPosition();
            const z = this.barZPositions[i];
            const barLength = this.barParticles[i].getBarLength();
            
            // Z座標に応じたサイズとボケの係数を計算
            const normalizedZ = THREE.MathUtils.mapLinear(z, minZ, maxZ, 0.0, 1.0);
            const sizeMultiplier = THREE.MathUtils.lerp(1.0, 0.3, normalizedZ);
            const blurMultiplier = THREE.MathUtils.lerp(0.0, 2.5, normalizedZ);
            const barWidth = THREE.MathUtils.lerp(10.0, 3.0, normalizedZ);
            const adjustedBarLength = barLength * sizeMultiplier;
            
            // 各棒パーティクルに上下を結ぶ縦線を複数本描画（棒の下に、青〜紫のランダムな色）
            const topY = y - adjustedBarLength / 2.0;
            const bottomY = y + adjustedBarLength / 2.0;
            const verticalLineWidth = THREE.MathUtils.lerp(2.0, 0.5, normalizedZ);
            const verticalLineAlpha = trackAlpha * 0.7 * (1.0 - blurMultiplier * 0.3);
            
        // 縦線を描画（上下を結ぶ線、青寄りのランダムな色、各棒ごとに固定）
        // パフォーマンス最適化：描画を簡略化
        const numVerticalLines = this.barParticles[i].verticalLineColors.length;  // 5本（30→5に削減）
            // 棒の幅全体に均等に配置（棒の外側にも線を引く）
            const totalLineWidth = barWidth * 2.0;
            const lineSpacing = totalLineWidth / (numVerticalLines + 1);
            const startX = x - totalLineWidth / 2.0;
            
            // 線の透明度と太さ（固定値）
            const lineAlpha = verticalLineAlpha * 0.6;
            const lineWidth = verticalLineWidth * 0.8;
            
            ctx.lineWidth = lineWidth;
            
            // 同じ色の線をまとめて描画（パフォーマンス最適化）
            for (let lineIdx = 0; lineIdx < numVerticalLines; lineIdx++) {
                const lineX = startX + lineSpacing * (lineIdx + 1);
                const verticalLineColor = this.barParticles[i].verticalLineColors[lineIdx];
                
                ctx.strokeStyle = `rgba(${Math.round(verticalLineColor.r * 255)}, ${Math.round(verticalLineColor.g * 255)}, ${Math.round(verticalLineColor.b * 255)}, ${lineAlpha})`;
                ctx.beginPath();
                ctx.moveTo(lineX, topY);
                ctx.lineTo(lineX, bottomY);
                ctx.stroke();
            }
            
            // ニューラルネットワーク風：活性化値に応じてノード（棒）の色とサイズを調整
            const activation = this.barParticles[i].activation || 0.5;
            
            // 活性化値に応じて色を変える（活性化が高いほど明るく、青寄り）
            const nodeHue = THREE.MathUtils.lerp(200 / 360, 180 / 360, activation);  // 青〜シアン
            const nodeSaturation = THREE.MathUtils.lerp(0.6, 1.0, activation);
            const nodeLightness = THREE.MathUtils.lerp(0.4, 0.9, activation);
            const nodeColor = new THREE.Color().setHSL(nodeHue, nodeSaturation, nodeLightness);
            
            // 棒の透明度をボケと活性化値に応じて調整
            const barAlpha = trackAlpha * (1.0 - blurMultiplier * 0.3) * (0.5 + activation * 0.5);
            
            // 活性化値に応じてサイズを変える（活性化が高いほど大きい）
            const activationSizeMultiplier = 0.7 + activation * 0.3;
            const adjustedBarWidth = barWidth * activationSizeMultiplier;
            const adjustedBarLength2 = adjustedBarLength * activationSizeMultiplier;
            
            ctx.fillStyle = `rgba(${Math.round(nodeColor.r * 255)}, ${Math.round(nodeColor.g * 255)}, ${Math.round(nodeColor.b * 255)}, ${barAlpha})`;
            ctx.fillRect(
                x - adjustedBarWidth / 2.0,
                y - adjustedBarLength2 / 2.0,
                adjustedBarWidth,
                adjustedBarLength2
            );
        }
        
        ctx.restore();
    }
    
    /**
     * トラック番号に応じた色を取得（青系のグラデーション）
     * Processing版: HSB(150-180, 200, 255, 100-255)
     * トラック数が増えたので、色の範囲を調整
     */
    getTrackColor(trackNum, backgroundWhite) {
        // Processing版: HSB(150-180, 200, 255, 100-255)
        // トラック数が16個になったので、色の範囲を調整（150-180度の範囲を16個に分割）
        const hueDegrees = THREE.MathUtils.mapLinear(trackNum, 1, 16, 150, 180);
        const saturation = 200 / 255.0;  // 0-1の範囲に変換
        const brightness = 255 / 255.0;  // 0-1の範囲に変換（HSVのValue）
        const alpha = THREE.MathUtils.mapLinear(trackNum, 1, 16, 100, 255) / 255.0;
        
        // HSVからRGBに変換（ProcessingのHSBと同じ）
        const color = this.hsvToRgb(hueDegrees, saturation, brightness);
        return { 
            r: color.r, 
            g: color.g, 
            b: color.b, 
            a: alpha 
        };
    }
    
    /**
     * HSVからRGBに変換（ProcessingのHSBと同じ）
     */
    hsvToRgb(h, s, v) {
        // h: 0-360度、s: 0-1、v: 0-1
        h = h % 360;
        if (h < 0) h += 360;
        
        const c = v * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = v - c;
        
        let r = 0, g = 0, b = 0;
        
        if (h < 60) {
            r = c; g = x; b = 0;
        } else if (h < 120) {
            r = x; g = c; b = 0;
        } else if (h < 180) {
            r = 0; g = c; b = x;
        } else if (h < 240) {
            r = 0; g = x; b = c;
        } else if (h < 300) {
            r = x; g = 0; b = c;
        } else {
            r = c; g = 0; b = x;
        }
        
        return new THREE.Color(r + m, g + m, b + m);
    }
    
    /**
     * アクティブかどうかを返す
     */
    isActive() {
        if (this.isNoteActive) return true;
        
        for (let i = 0; i < this.waveformPoints; i++) {
            if (Math.abs(this.barParticles[i].getVelocity()) > 0.1) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * リセット
     */
    reset() {
        for (let i = 0; i < this.waveformPoints; i++) {
            this.barParticles[i].reset();
        }
        if (this.movementLFO) {
            this.movementLFO.reset();
        }
        this.isNoteActive = false;
        this.noteEndTime = 0;
        this.noteNumber = 64.0;
        this.noteVelocity = 0.0;
        this.noteDurationMs = 0.0;
        
        // キャッシュをクリア（リサイズ時に再計算）
        this.verticalLinesCache = null;
    }
}

/**
 * LibRandomLFO: ランダムLFO（Processing版を移植）
 */
class LibRandomLFO {
    constructor(minSpeed, maxSpeed, minValue, maxValue) {
        this.minSpeed = minSpeed;
        this.maxSpeed = maxSpeed;
        this.minValue = minValue;
        this.maxValue = maxValue;
        this.currentValue = (minValue + maxValue) / 2.0;
        this.targetValue = this.currentValue;
        this.speed = (minSpeed + maxSpeed) / 2.0;
        this.time = 0.0;
    }
    
    update() {
        this.time += 0.016; // 約60fps
        
        // ランダムにターゲット値を変更
        if (Math.random() < 0.01) {
            this.targetValue = THREE.MathUtils.randFloat(this.minValue, this.maxValue);
            this.speed = THREE.MathUtils.randFloat(this.minSpeed, this.maxSpeed);
        }
        
        // ターゲット値に向かって補間
        const diff = this.targetValue - this.currentValue;
        this.currentValue += diff * this.speed;
    }
    
    getValue() {
        return this.currentValue;
    }
    
    reset() {
        this.currentValue = (this.minValue + this.maxValue) / 2.0;
        this.targetValue = this.currentValue;
        this.speed = (this.minSpeed + this.maxSpeed) / 2.0;
        this.time = 0.0;
    }
}

/**
 * Scene05_BarParticle: 各棒を表すパーティクルクラス
 */
class Scene05_BarParticle {
    constructor() {
        this.position = window.innerHeight * 0.5;
        this.velocity = 0.0;
        this.friction = 0.95;
        this.barLength = -1.0;
        
        // 青寄りのランダムな色を生成（各棒ごとに固定、ニューラルネットワーク風）
        // 青: 200度、シアン: 180度、より青寄りに
        const hue = THREE.MathUtils.randFloat(180 / 360, 240 / 360);  // 180-240度（シアン〜青）
        const saturation = THREE.MathUtils.randFloat(0.7, 1.0);  // より鮮やかに
        const lightness = THREE.MathUtils.randFloat(0.5, 0.8);  // より明るく
        this.barColor = new THREE.Color().setHSL(hue, saturation, lightness);
        
        // 縦線の色も生成（各棒ごとに固定、青寄り）
        this.verticalLineColors = [];
        const numVerticalLines = 5;  // 30 → 5に削減（パフォーマンス最適化）
        for (let i = 0; i < numVerticalLines; i++) {
            const lineHue = THREE.MathUtils.randFloat(180 / 360, 240 / 360);  // 青寄り
            const lineSaturation = THREE.MathUtils.randFloat(0.7, 1.0);
            const lineLightness = THREE.MathUtils.randFloat(0.5, 0.8);
            this.verticalLineColors.push(new THREE.Color().setHSL(lineHue, lineSaturation, lineLightness));
        }
        
        // ニューラルネットワーク風：活性化値（0.0〜1.0）
        this.activation = Math.random();
        this.targetActivation = this.activation;
    }
    
    /**
     * 力を加える
     */
    applyForce(force) {
        this.velocity += force;
    }
    
    /**
     * 更新処理
     */
    update(frictionValue, movementMultiplier) {
        this.friction = frictionValue;
        
        // 初期化（初回のみ）
        if (this.barLength < 0) {
            this.barLength = Math.random() * window.innerHeight * 0.1 + window.innerHeight * 0.05;
        }
        
        // 中心に戻る力（弱い、もっと早く動くように強める）
        if (Math.abs(this.velocity) < 0.1) {
            const centerY = window.innerHeight * 0.5;
            const returnForce = (centerY - this.position) * 0.06;  // 0.04 → 0.06（さらに強める）
            this.velocity += returnForce;
        }
        
        // 速度に摩擦を適用
        this.velocity *= this.friction;
        
        // 位置を更新（もっと早く動くように倍率を上げる）
        this.position += this.velocity * movementMultiplier * 1.5;  // 1.2 → 1.5に（さらに速く）
        
        // 位置を範囲内に制限
        this.position = THREE.MathUtils.clamp(
            this.position,
            window.innerHeight * 0.25,
            window.innerHeight * 0.75
        );
    }
    
    /**
     * 位置を取得
     */
    getPosition() {
        return this.position;
    }
    
    /**
     * 速度を取得
     */
    getVelocity() {
        return this.velocity;
    }
    
    /**
     * 棒の長さを取得
     */
    getBarLength() {
        return this.barLength;
    }
    
    /**
     * リセット
     */
    reset() {
        this.position = window.innerHeight * 0.5;
        this.velocity = 0.0;
        this.barLength = Math.random() * window.innerHeight * 0.1 + window.innerHeight * 0.05;
    }
}
