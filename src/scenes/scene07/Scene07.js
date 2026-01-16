/**
 * Scene07: 格子状のSphereネットワーク
 * GPUインスタンシングで格子状に配置されたSphereが線で繋がれ、力が加わるとニットのように広がる
 */

import { SceneBase } from '../SceneBase.js';
import { Particle } from '../../lib/Particle.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export class Scene07 extends SceneBase {
    constructor(renderer, camera) {
        super(renderer, camera);
        this.title = 'mathym | t7:Romls';
        this.sceneNumber = 7;
        
        // グリッド設定
        this.gridSizeX = 200; // グリッドのX方向の数
        this.gridSizeZ = 200; // グリッドのZ方向の数
        this.gridSpacing = 10.0; // グリッド間隔
        this.sphereRadius = 1.0; // Sphereの半径
        
        // スプリング拘束設定（ニットっぽくするため）
        this.springStiffness = 0.15; // スプリングの剛性
        this.springDamping = 0.05; // スプリングの減衰
        this.restLength = this.gridSpacing; // スプリングの自然長（グリッド間隔と同じ）
        
        // 復元力設定（元の位置に戻る力）
        this.restoreStiffness = 0.01; // 復元力の剛性
        this.restoreDamping = 0.005; // 復元力の減衰
        
        // パーティクル設定
        this.numParticles = this.gridSizeX * this.gridSizeZ; // グリッド数に合わせる
        this.particles = [];
        this.particleMasses = []; // 各パーティクルの質量
        this.initialPositions = []; // 各パーティクルの初期位置（復元力用）
        this.instancedManager = null; // GPUインスタンシング管理クラス
        
        // ヒートマップ用の色設定（赤になりにくくする）
        this.heatMapMinValue = 0.0; // 最小値（速度や高さ）
        this.heatMapMaxValue = 100.0; // 最大値（8.0 → 100.0に大幅に上げて赤になりにくく）
        
        // 線で接続するための情報
        this.connections = []; // 接続情報 [{from: index, to: index}, ...]
        this.lineGeometry = null; // 線のジオメトリ
        this.lineMesh = null; // 線のメッシュ
        
        // 時間変数
        this.time = 0.0;
        
        // 地形ノイズ設定
        this.terrainNoiseSpeed = 0.01; // ノイズの変化速度（ゆっくり）
        this.terrainNoiseScale = 0.002; // ノイズのスケール（細かさ）
        this.terrainNoiseAmplitude = 200.0; // ノイズの振幅（高さの変化幅）
        this.terrainNoiseTime = 0.0; // ノイズ用の時間変数
        
        // ポイントサイズノイズ設定
        this.sizeNoiseScale = 0.01; // サイズノイズのスケール
        this.sizeNoiseAmplitude = 0.5; // サイズノイズの振幅（基本サイズの倍率）
        
        // 地面設定
        this.groundY = 0.0;
        
        // 重力設定
        this.gravity = new THREE.Vector3(0, -3.5, 0); // 下向きの重力
        
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
        
        // ブルームエフェクト
        this.bloomPass = null;
        this.bloomEnabled = true;  // デフォルトで有効
        
        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
    }
    
    async setup() {
        await super.setup();
        
        // ライトを設定
        this.setupLights();
        
        // パーティクルを作成（格子状に配置、非同期）
        await this.createParticles();
        
        // 線で接続
        this.createConnections();
        
        // カメラパーティクルの距離パラメータを再設定（親クラスで設定された後に上書き）
        if (this.cameraParticles) {
            for (const cameraParticle of this.cameraParticles) {
                this.setupCameraParticleDistance(cameraParticle);
            }
        }
        
        // 色収差エフェクトを初期化（非同期で実行、重い処理を後回し）
        // グリッチエフェクトとブルームエフェクトはinitChromaticAberration内で初期化される
        this.initChromaticAberration();
    }
    
    /**
     * ライトを設定
     */
    setupLights() {
        // 環境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        // ディレクショナルライト
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(0, 1000, 1000);
        this.scene.add(directionalLight);
    }
    
    
    /**
     * 発光体のPNG画像を生成
     * @returns {HTMLCanvasElement} 発光体のCanvas
     */
    generateGlowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const maxRadius = Math.min(centerX, centerY);
        
        // 放射状のグラデーション（中心が明るく、外側が透明）
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)'); // 中心: 完全に白
        gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.4)');
        gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.1)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)'); // 外側: 完全に透明
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        return canvas;
    }
    
    /**
     * 発光体テクスチャをサーバーに保存
     * @param {HTMLCanvasElement} canvas - 発光体のCanvas
     */
    async saveGlowTextureToServer(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    console.warn('発光体テクスチャのBlob生成に失敗');
                    resolve(false);
                    return;
                }
                
                // BlobをBase64に変換
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64data = reader.result;
                    
                    // サーバーに送信
                    fetch('http://localhost:3001/api/save-texture', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            filename: 'glow.png',
                            imageData: base64data,
                            path: 'textures' // public/textures/に保存
                        })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            console.log(`✅ 発光体テクスチャを保存しました: ${data.path}`);
                            resolve(true);
                        } else {
                            console.warn('発光体テクスチャの保存に失敗:', data.error);
                            resolve(false);
                        }
                    })
                    .catch(error => {
                        console.warn('発光体テクスチャの保存エラー:', error);
                        resolve(false);
                    });
                };
                reader.onerror = () => {
                    console.warn('FileReaderエラー');
                    resolve(false);
                };
                reader.readAsDataURL(blob);
            }, 'image/png');
        });
    }
    
    /**
     * パーティクルを作成（格子状にビルボードを配置）
     */
    async createParticles() {
        // 発光体のテクスチャを読み込む（存在しない場合は生成）
        let glowTexture;
        const textureLoader = new THREE.TextureLoader();
        
        try {
            // まず既存のテクスチャを読み込もうとする
            glowTexture = await new Promise((resolve, reject) => {
                textureLoader.load(
                    '/textures/glow.png',
                    (texture) => {
                        texture.colorSpace = THREE.SRGBColorSpace;
                        resolve(texture);
                    },
                    undefined,
                    (error) => {
                        reject(error);
                    }
                );
            });
            console.log('✅ 既存の発光体テクスチャを読み込みました');
        } catch (error) {
            // テクスチャが存在しない場合は生成
            console.log('📝 発光体テクスチャを生成中...');
            const canvas = this.generateGlowTexture();
            
            // サーバーに保存（非同期、エラーでも続行）
            this.saveGlowTextureToServer(canvas).catch(err => {
                console.warn('テクスチャの保存に失敗しましたが、続行します:', err);
            });
            
            // Canvasからテクスチャを作成
            glowTexture = new THREE.CanvasTexture(canvas);
            glowTexture.colorSpace = THREE.SRGBColorSpace;
            console.log('✅ 発光体テクスチャを生成しました');
        }
        
        // ビルボード用のPlaneGeometry（常にカメラを向く）
        const geometry = new THREE.PlaneGeometry(1, 1);
        
        // ビルボード用のマテリアル（カスタムシェーダーでビルボードを実装）
        const billboardSize = this.sphereRadius * 2.0;
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: glowTexture },
                time: { value: 0.0 },
                billboardSize: { value: billboardSize }
            },
            vertexShader: `
                // instanceColorはThree.jsが自動的に提供するので宣言不要
                varying vec3 vColor;
                varying vec2 vUv;
                
                uniform float billboardSize;
                
                void main() {
                    vUv = uv;
                    // instanceColorはThree.jsが自動的に提供
                    vColor = instanceColor;
                    
                    // ビルボード: 常にカメラを向く
                    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
                    
                    // ビルボードのサイズを設定（カメラ空間で）
                    vec2 scale = vec2(billboardSize);
                    vec2 alignedPosition = (position.xy - 0.5) * scale;
                    
                    // カメラの右方向と上方向を取得
                    vec3 cameraRight = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
                    vec3 cameraUp = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
                    
                    // ビルボードの位置を計算
                    mvPosition.xyz += cameraRight * alignedPosition.x + cameraUp * alignedPosition.y;
                    
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D uTexture;
                varying vec3 vColor;
                varying vec2 vUv;
                
                void main() {
                    vec4 texColor = texture2D(uTexture, vUv);
                    // 色を適用（青から白へのグラデーション）
                    vec3 finalColor = texColor.rgb * vColor;
                    gl_FragColor = vec4(finalColor, texColor.a);
                }
            `,
                transparent: true,
                depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        // THREE.Pointsを使用（より軽量）
        const positions = new Float32Array(this.numParticles * 3);
        const colors = new Float32Array(this.numParticles * 3);
        const sizes = new Float32Array(this.numParticles);
        
        const pointsGeometry = new THREE.BufferGeometry();
        pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        pointsGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        // PointsMaterialを使用（シンプルな円形ポイント）
        const pointsMaterial = new THREE.PointsMaterial({
            size: this.sphereRadius * 2.0,
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
            alphaTest: 0.1
        });
        
        // Pointsメッシュを作成
        this.pointsMesh = new THREE.Points(pointsGeometry, pointsMaterial);
        this.scene.add(this.pointsMesh);
        
        // 後で更新するために保存
        this.pointsPositions = positions;
        this.pointsColors = colors;
        this.pointsSizes = sizes;
        
        // グリッドの範囲を計算
        const gridWidth = (this.gridSizeX - 1) * this.gridSpacing;
        const gridDepth = (this.gridSizeZ - 1) * this.gridSpacing;
        
        // 格子状にSphereを配置
        let particleIndex = 0;
        for (let z = 0; z < this.gridSizeZ; z++) {
            for (let x = 0; x < this.gridSizeX; x++) {
                // グリッド位置を計算（中心を原点に）
                const gridX = -gridWidth / 2 + x * this.gridSpacing;
                const gridZ = -gridDepth / 2 + z * this.gridSpacing;
                const y = this.groundY + this.sphereRadius; // 地面の上
                
                // パーティクルを作成
                const particle = new Particle(gridX, y, gridZ);
                particle.maxSpeed = 100.0; // 速度の上限を大幅に上げる（20.0 → 1000.0）
                particle.maxForce = 100.0; // 力の上限を大幅に上げる（10.0 → 100000.0）
                particle.friction = 0.02;
                particle.mass = 1.0;
                this.particles.push(particle);
                this.particleMasses.push(1.0);
                
                // 初期位置を保存（復元力用）
                this.initialPositions.push(new THREE.Vector3(gridX, y, gridZ));
                
                // Pointsの位置とサイズを設定
                const idx = particleIndex * 3;
                this.pointsPositions[idx] = gridX;
                this.pointsPositions[idx + 1] = y;
                this.pointsPositions[idx + 2] = gridZ;
                this.pointsSizes[particleIndex] = this.sphereRadius * 2.0;
                
                // 初期色（青）
                this.pointsColors[idx] = 0.0;     // R
                this.pointsColors[idx + 1] = 0.0; // G
                this.pointsColors[idx + 2] = 1.0; // B
                
                particleIndex++;
            }
        }
        
        // Pointsの属性を更新
        pointsGeometry.attributes.position.needsUpdate = true;
        pointsGeometry.attributes.color.needsUpdate = true;
        pointsGeometry.attributes.size.needsUpdate = true;
        
        this.setParticleCount(particleIndex);
        console.log(`✅ ${particleIndex}個のPointsを格子状に配置しました`);
    }
    
    /**
     * 線で接続（隣接するSphere同士を線で繋ぐ）
     */
    createConnections() {
        this.connections = [];
        
        // 各Sphereに対して、隣接するSphereを接続
        for (let z = 0; z < this.gridSizeZ; z++) {
            for (let x = 0; x < this.gridSizeX; x++) {
                const index = z * this.gridSizeX + x;
                
                // 右隣（X+1）
                if (x < this.gridSizeX - 1) {
                    const rightIndex = z * this.gridSizeX + (x + 1);
                    this.connections.push({ from: index, to: rightIndex });
                }
                
                // 下隣（Z+1）
                if (z < this.gridSizeZ - 1) {
                    const bottomIndex = (z + 1) * this.gridSizeX + x;
                    this.connections.push({ from: index, to: bottomIndex });
                }
                
                // 右下対角線（X+1, Z+1）
                if (x < this.gridSizeX - 1 && z < this.gridSizeZ - 1) {
                    const diagonalIndex = (z + 1) * this.gridSizeX + (x + 1);
                    this.connections.push({ from: index, to: diagonalIndex });
                }
                
                // 左下対角線（X-1, Z+1）
                if (x > 0 && z < this.gridSizeZ - 1) {
                    const diagonalIndex = (z + 1) * this.gridSizeX + (x - 1);
                    this.connections.push({ from: index, to: diagonalIndex });
                }
            }
        }
        
        // 線のジオメトリを作成
        const positions = new Float32Array(this.connections.length * 6); // 各接続に2点（from, to）
        const lineColors = new Float32Array(this.connections.length * 6); // 各接続に2点の色（RGB）
        this.lineGeometry = new THREE.BufferGeometry();
        this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
        this.lineGeometry.setDrawRange(0, this.connections.length * 2);
        
        // 線のマテリアル（頂点カラーを使用）
        const lineMaterial = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.6
        });
        
        // 線のメッシュを作成
        this.lineMesh = new THREE.LineSegments(this.lineGeometry, lineMaterial);
        this.lineMesh.renderOrder = 0;
        this.scene.add(this.lineMesh);
        
        console.log(`✅ ${this.connections.length}本の接続線を作成しました`);
    }
    
    /**
     * カメラパーティクルの距離パラメータを設定（上から見下ろす感じで近めの距離、範囲を狭める）
     */
    setupCameraParticleDistance(cameraParticle) {
        // グリッド範囲を計算
        const gridWidth = (this.gridSizeX - 1) * this.gridSpacing;
        const gridDepth = (this.gridSizeZ - 1) * this.gridSpacing;
        const gridSize = Math.max(gridWidth, gridDepth);
        
        // 上から見下ろす感じで適度な距離に設定
        const cameraDistance = gridSize * 0.4;
        cameraParticle.minDistance = cameraDistance * 0.8; // 最小距離
        cameraParticle.maxDistance = cameraDistance * 5.0; // 最大距離（1.3 → 5.0に大幅に拡大）
        cameraParticle.maxDistanceReset = cameraDistance * 3.0; // リセット距離（1.2 → 3.0に拡大）
        
        // XZ平面の範囲（グリッドの範囲内または少し外側）
        const cameraBoxSizeXZ = gridSize * 0.3;
        
        // Y座標（上から見下ろす高さ）
        const cameraMinY = gridSize * 0.35;
        const cameraMaxY = gridSize * 0.6;
        
        cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSizeXZ, cameraMinY, -cameraBoxSizeXZ);
        cameraParticle.boxMax = new THREE.Vector3(cameraBoxSizeXZ, cameraMaxY, cameraBoxSizeXZ);
    }
    
    /**
     * カメラの位置を更新
     */
    updateCamera() {
        if (this.cameraParticles[this.currentCameraIndex]) {
            const cameraPos = this.cameraParticles[this.currentCameraIndex].getPosition();
            this.camera.position.copy(cameraPos);
            this.camera.lookAt(0, 0, 0);
            this.camera.up.set(0, 1, 0);
        }
    }
    
    /**
     * ノイズ関数（シンプルなパーリンノイズ風）
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @param {number} time - 時間
     * @returns {number} ノイズ値（-1.0 から 1.0）
     */
    noise(x, y, time) {
        // シンプルなノイズ関数（Math.sinとMath.cosを組み合わせ）
        const n = Math.sin(x * 12.9898 + y * 78.233 + time) * 43758.5453;
        return (n - Math.floor(n)) * 2.0 - 1.0; // -1.0 から 1.0
    }
    
    /**
     * フラクタルノイズ（複数のオクターブを組み合わせ）
     * @param {number} x - X座標
     * @param {number} z - Z座標
     * @param {number} time - 時間
     * @returns {number} ノイズ値（-1.0 から 1.0）
     */
    fractalNoise(x, z, time) {
        let value = 0.0;
        let amplitude = 1.0;
        let frequency = 1.0;
        
        // 複数のオクターブを組み合わせ
        for (let i = 0; i < 4; i++) {
            value += this.noise(x * frequency, z * frequency, time * 0.1) * amplitude;
            amplitude *= 0.5;
            frequency *= 2.0;
        }
        
        return value / 2.0; // 正規化
    }
    
    /**
     * 更新処理
     */
    onUpdate(deltaTime) {
        this.time += deltaTime;
        
        // パーティクルの更新（Points用）
        if (!this.pointsMesh || this.particles.length === 0) {
            return; // まだ初期化されていない場合はスキップ
        }
        
        // スプリング拘束を適用（ニットっぽくするため、接続されているsphere同士の距離を維持）
        for (const connection of this.connections) {
            const particleA = this.particles[connection.from];
            const particleB = this.particles[connection.to];
            const posA = particleA.getPosition();
            const posB = particleB.getPosition();
            
            // 現在の距離
            const diff = new THREE.Vector3().subVectors(posB, posA);
            const currentLength = diff.length();
            
            if (currentLength > 0.01) {
                // 方向ベクトルを正規化（一度だけ）
                const forceDir = diff.clone().normalize();
                
                // 理想的な距離からのずれ
                const stretch = currentLength - this.restLength;
                
                // スプリング力（フックの法則）
                const springForce = stretch * this.springStiffness;
                
                // 速度差による減衰
                const velA = particleA.getVelocity();
                const velB = particleB.getVelocity();
                const velDiff = new THREE.Vector3().subVectors(velB, velA);
                const dampingForce = velDiff.dot(forceDir) * this.springDamping;
                
                // 力を適用
                const totalForce = springForce + dampingForce;
                
                // 粒子Aに力を加える（B方向）
                particleA.addForce(forceDir.clone().multiplyScalar(totalForce));
                // 粒子Bに力を加える（A方向、反対向き）
                particleB.addForce(forceDir.multiplyScalar(-totalForce));
            }
        }
        
        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i];
            const particleMass = this.particleMasses[i];
            const particlePos = particle.getPosition();
            const initialPos = this.initialPositions[i];
            
            // 復元力（元の位置に戻ろうとする力）
            const restoreDiff = new THREE.Vector3().subVectors(initialPos, particlePos);
            const restoreDistance = restoreDiff.length();
            
            if (restoreDistance > 0.01) {
                // 方向ベクトルを正規化（一度だけ）
                const restoreDir = restoreDiff.clone().normalize();
                
                // 復元力（フックの法則）
                const restoreForce = restoreDistance * this.restoreStiffness;
                
                // 速度による減衰
                const vel = particle.getVelocity();
                const velDot = vel.dot(restoreDir);
                const restoreDamping = velDot * this.restoreDamping;
                
                // 復元力を適用
                const totalRestoreForce = restoreForce + restoreDamping;
                particle.addForce(restoreDir.multiplyScalar(totalRestoreForce));
            }
            
            // 重力を適用
            const gravity = this.gravity.clone();
            particle.addForce(gravity);
            
            // パーティクルを更新
            particle.update();
            
            // 地面との衝突判定
            if (particlePos.y - this.sphereRadius <= this.groundY) {
                // 地面に当たったら位置を修正
                particlePos.y = this.groundY + this.sphereRadius;
                particle.position.copy(particlePos);
                
                // 速度を減らす（反発と摩擦）
                const vel = particle.getVelocity();
                if (vel.y < 0) {
                    vel.y *= -0.3; // 反発係数
                }
                // 摩擦を適用
                const groundFriction = 0.98;
                vel.x *= groundFriction;
                vel.z *= groundFriction;
                particle.velocity.copy(vel);
            }
            
            // Pointsの位置を更新
            const idx = i * 3;
            this.pointsPositions[idx] = particlePos.x;
            this.pointsPositions[idx + 1] = particlePos.y;
            this.pointsPositions[idx + 2] = particlePos.z;
            
            // ノイズでポイントのサイズを変える（initialPosは復元力の処理で既に定義済み）
            const sizeNoiseX = initialPos.x * this.sizeNoiseScale;
            const sizeNoiseZ = initialPos.z * this.sizeNoiseScale;
            const sizeNoiseValue = this.fractalNoise(sizeNoiseX, sizeNoiseZ, this.terrainNoiseTime);
            const sizeMultiplier = 1.0 + sizeNoiseValue * this.sizeNoiseAmplitude;
            this.pointsSizes[i] = this.sphereRadius * 2.0 * sizeMultiplier;
            
            // ヒートマップの色を計算（速度の大きさに基づく）
            const vel = particle.getVelocity();
            const speed = vel.length();
            const normalizedSpeed = Math.min(Math.max((speed - this.heatMapMinValue) / (this.heatMapMaxValue - this.heatMapMinValue), 0), 1);
            const color = this.getHeatMapColor(normalizedSpeed);
            
            // Pointsの色を設定（ヒートマップ）
            this.pointsColors[idx] = color.r;
            this.pointsColors[idx + 1] = color.g;
            this.pointsColors[idx + 2] = color.b;
        }
        
        // Pointsの属性を更新
        if (this.pointsMesh && this.pointsMesh.geometry) {
            this.pointsMesh.geometry.attributes.position.needsUpdate = true;
            this.pointsMesh.geometry.attributes.color.needsUpdate = true;
            this.pointsMesh.geometry.attributes.size.needsUpdate = true;
        }
        
        // 線の位置と色を更新
        this.updateConnections();
        
        // カメラパーティクルのバウンド処理（SceneBase.update()で既に更新済み）
        if (this.cameraParticles && this.cameraParticles[this.currentCameraIndex]) {
            const cameraParticle = this.cameraParticles[this.currentCameraIndex];
            
            // boxの端に当たったらバウンド（ランダムのときの力が残っていれば、速度が一定以上ある場合のみ）
            const pos = cameraParticle.getPosition();
            const vel = cameraParticle.getVelocity();
            const boxMin = cameraParticle.boxMin;
            const boxMax = cameraParticle.boxMax;
            
            // 速度が一定以上ある場合のみバウンド（ランダムのときの力が残っている）
            const minVelocityForBounce = 0.1;
            if (vel.length() > minVelocityForBounce && boxMin && boxMax) {
                // X方向のバウンド
                if (pos.x <= boxMin.x) {
                    pos.x = boxMin.x;
                    vel.x *= -1.0; // バウンド（-1.0）
                    cameraParticle.position.copy(pos);
                    cameraParticle.velocity.copy(vel);
                } else if (pos.x >= boxMax.x) {
                    pos.x = boxMax.x;
                    vel.x *= -1.0; // バウンド（-1.0）
                    cameraParticle.position.copy(pos);
                    cameraParticle.velocity.copy(vel);
                }
                
                // Y方向のバウンド
                if (pos.y <= boxMin.y) {
                    pos.y = boxMin.y;
                    vel.y *= -1.0; // バウンド（-1.0）
                    cameraParticle.position.copy(pos);
                    cameraParticle.velocity.copy(vel);
                } else if (pos.y >= boxMax.y) {
                    pos.y = boxMax.y;
                    vel.y *= -1.0; // バウンド（-1.0）
                    cameraParticle.position.copy(pos);
                    cameraParticle.velocity.copy(vel);
                }
                
                // Z方向のバウンド
                if (pos.z <= boxMin.z) {
                    pos.z = boxMin.z;
                    vel.z *= -1.0; // バウンド（-1.0）
                    cameraParticle.position.copy(pos);
                    cameraParticle.velocity.copy(vel);
                } else if (pos.z >= boxMax.z) {
                    pos.z = boxMax.z;
                    vel.z *= -1.0; // バウンド（-1.0）
                    cameraParticle.position.copy(pos);
                    cameraParticle.velocity.copy(vel);
                }
            }
        }
        
        // カメラを更新
        this.updateCamera();
        
        // 色収差エフェクトの更新（サスティン終了チェック）
        this.updateChromaticAberration();
        
        // グリッチエフェクトの更新（サスティン終了チェックと時間更新）
        this.updateGlitch();
    }
    
    /**
     * ヒートマップの色を計算（0.0-1.0の値から色を生成、赤になりにくくする）
     * @param {number} value - 0.0（低い値）から1.0（高い値）
     * @returns {THREE.Color} ヒートマップの色
     */
    getHeatMapColor(value) {
        // 青 → シアン → 緑 → 黄 → 赤 のグラデーション（赤になりにくく調整）
        const color = new THREE.Color();
        
        // 赤になる閾値を上げる（0.6 → 0.85）
        if (value < 0.2) {
            // 青 → シアン
            const t = value / 0.2;
            color.r = 0.0;
            color.g = t * 0.5;
            color.b = 1.0;
        } else if (value < 0.5) {
            // シアン → 緑
            const t = (value - 0.2) / 0.3;
            color.r = 0.0;
            color.g = 0.5 + t * 0.5;
            color.b = 1.0 - t;
        } else if (value < 0.85) {
            // 緑 → 黄
            const t = (value - 0.5) / 0.35;
            color.r = t;
            color.g = 1.0;
            color.b = 0.0;
        } else {
            // 黄 → 赤（0.85以上で赤になる）
            const t = (value - 0.85) / 0.15;
            color.r = 1.0;
            color.g = 1.0 - t;
            color.b = 0.0;
        }
        
        // 赤い時は発光を強くする（emissiveとして使用するため、色を明るく）
        if (value > 0.85) {
            const intensity = (value - 0.85) / 0.15; // 0.0-1.0
            color.r = Math.min(1.0, color.r + intensity * 0.5);
            color.g = Math.max(0.0, color.g - intensity * 0.3);
            color.b = 0.0;
        }
        
        return color;
    }
    
    /**
     * 線の位置と色を更新（Sphereの位置に追従、ヒートマップ色を適用）
     */
    updateConnections() {
        if (!this.lineGeometry || !this.lineMesh) return;
        
        const positions = this.lineGeometry.attributes.position.array;
        const colors = this.lineGeometry.attributes.color.array;
        let offset = 0;
        let colorOffset = 0;
        
        for (const connection of this.connections) {
            const fromParticle = this.particles[connection.from];
            const toParticle = this.particles[connection.to];
            const fromPos = fromParticle.getPosition();
            const toPos = toParticle.getPosition();
            
            // 速度の平均を計算（線の色に使用）
            const fromVel = fromParticle.getVelocity();
            const toVel = toParticle.getVelocity();
            const avgSpeed = (fromVel.length() + toVel.length()) / 2.0;
            const normalizedSpeed = Math.min(Math.max((avgSpeed - this.heatMapMinValue) / (this.heatMapMaxValue - this.heatMapMinValue), 0), 1);
            const color = this.getHeatMapColor(normalizedSpeed);
            
            // from位置
            positions[offset++] = fromPos.x;
            positions[offset++] = fromPos.y;
            positions[offset++] = fromPos.z;
            
            // from色
            colors[colorOffset++] = color.r;
            colors[colorOffset++] = color.g;
            colors[colorOffset++] = color.b;
            
            // to位置
            positions[offset++] = toPos.x;
            positions[offset++] = toPos.y;
            positions[offset++] = toPos.z;
            
            // to色
            colors[colorOffset++] = color.r;
            colors[colorOffset++] = color.g;
            colors[colorOffset++] = color.b;
        }
        
        this.lineGeometry.attributes.position.needsUpdate = true;
        this.lineGeometry.attributes.color.needsUpdate = true;
    }
    
    /**
     * 力を加える（トラック5用、下から上に吹き飛ばす）
     * @param {number} noteNumber - ノート番号（36が0、地上からの高さ）
     * @param {number} velocity - ベロシティ（0-127、力の強さ）
     * @param {number} durationMs - デュレーション（ms、力の長さ）
     */
    applyForce(noteNumber = null, velocity = null, durationMs = null) {
        // 力の中心位置をランダムに設定（XZ平面）
        const gridWidth = (this.gridSizeX - 1) * this.gridSpacing;
        const gridDepth = (this.gridSizeZ - 1) * this.gridSpacing;
        const centerX = (Math.random() - 0.5) * gridWidth;
        const centerZ = (Math.random() - 0.5) * gridDepth;
        
        // 力の中心位置は地面の下（拳が下から突き上げる感じ）
        const heightY = this.groundY - 50.0; // 地面の下50ユニット（拳の位置）
        
        const forceCenter = new THREE.Vector3(centerX, heightY, centerZ);
        
        // ベロシティから力の強さを計算（0-127 → 力の強さ）
        let forceStrength = 100.0; // デフォルト（拳で持ち上げる強さ、3000.0 → 150000.0に50倍強化）
        if (velocity !== null) {
            const velocityNormalized = velocity / 127.0; // 0.0-1.0
            forceStrength = 100000.0 + velocityNormalized * 150000.0; // 100000-250000（2000-5000 → 100000-250000に50倍強化）
        }
        
        // 力の影響範囲（拳で持ち上げる範囲）
        const forceRadius = 400.0; // 元の範囲に戻す
        
        // 影響範囲内のSphereに力を加える（下から上に）
        let affectedCount = 0;
        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i];
            const particlePos = particle.getPosition();
            const toParticle = new THREE.Vector3().subVectors(particlePos, forceCenter);
            const distance = toParticle.length();
            
            if (distance < forceRadius && distance > 0.1) {
                // 距離に応じた力の強さ（中心に近いほど強い）
                const normalizedDist = distance / forceRadius;
                const localForceStrength = forceStrength * (1.0 - normalizedDist) * (1.0 - normalizedDist);
                
                // 上方向への力（下から上に吹き飛ばす）
                const upwardForce = new THREE.Vector3(0, localForceStrength, 0);
                
                // 力を適用（上方向）
                particle.addForce(upwardForce);
                affectedCount++;
            }
        }
        
        console.log(`💪 力を適用！位置: (${forceCenter.x.toFixed(1)}, ${forceCenter.y.toFixed(1)}, ${forceCenter.z.toFixed(1)})`);
        console.log(`   強さ: ${forceStrength.toFixed(1)}, 影響範囲: ${forceRadius.toFixed(1)}, 影響を受けたSphere: ${affectedCount}個`);
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
        
        // HUDを描画
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
                    this.numParticles,
                    this.time,
                    0,
                    0,
                    cameraPos.length(),
                    0,
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
     * OSCメッセージの処理
     */
    handleTrackNumber(trackNumber, message) {
        const args = message.args || [];
        
        // トラック1: カメラをランダムに切り替え（SceneBaseで共通処理されているが、明示的に処理）
        if (trackNumber === 1) {
            this.switchCameraRandom();
        }
        // トラック2: 色反転エフェクト（SceneBaseで共通化されているため、ここでは処理しない）
        // else if (trackNumber === 2) {
        //     // SceneBaseで処理済み
        // }
        // トラック3: 色収差エフェクト（ノート、ベロシティ、デュレーション付き）
        else if (trackNumber === 3) {
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
        // トラック5: 力を加える（ノート、ベロシティ、デュレーション付き）
        else if (trackNumber === 5) {
            const noteNumber = args[0] !== undefined ? args[0] : null; // ノート（36が0）
            const velocity = args[1] !== undefined ? args[1] : null; // ベロシティ（0-127、力の強さ）
            const durationMs = args[2] !== undefined ? args[2] : null; // デュレーション（ms、力の長さ）
            this.applyForce(noteNumber, velocity, durationMs);
        }
    }
    
    /**
     * リセット処理
     */
    reset() {
        super.reset(); // TIMEをリセット
        // パーティクルをリセット（格子状に配置）
        if (!this.pointsMesh || this.particles.length === 0) {
            return; // まだ初期化されていない場合はスキップ
        }
        
        // グリッドの範囲を計算
        const gridWidth = (this.gridSizeX - 1) * this.gridSpacing;
        const gridDepth = (this.gridSizeZ - 1) * this.gridSpacing;
        
        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i];
            particle.reset();
            
            // グリッド位置を計算
            const z = Math.floor(i / this.gridSizeX);
            const x = i % this.gridSizeX;
            const gridX = -gridWidth / 2 + x * this.gridSpacing;
            const gridZ = -gridDepth / 2 + z * this.gridSpacing;
            const y = this.groundY + this.sphereRadius; // 地面の上
            
            particle.position.set(gridX, y, gridZ);
            
            // Pointsの位置を更新
            const idx = i * 3;
            this.pointsPositions[idx] = gridX;
            this.pointsPositions[idx + 1] = y;
            this.pointsPositions[idx + 2] = gridZ;
            
            // 初期色（青）
            this.pointsColors[idx] = 0.0;
            this.pointsColors[idx + 1] = 0.0;
            this.pointsColors[idx + 2] = 1.0;
        }
        
        // Pointsの属性を更新
        if (this.pointsMesh && this.pointsMesh.geometry) {
            this.pointsMesh.geometry.attributes.position.needsUpdate = true;
            this.pointsMesh.geometry.attributes.color.needsUpdate = true;
        }
        
        // 線の位置を更新
        this.updateConnections();
    
        console.log('🔄 シーンをリセットしました');
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
            this.composer = new EffectComposer(this.renderer);
            
            // RenderPassを追加（通常のシーン描画）
            const renderPass = new RenderPass(this.scene, this.camera);
            this.composer.addPass(renderPass);
            
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
            
            // ブルームエフェクトを追加
            this.bloomPass = new UnrealBloomPass(
                new THREE.Vector2(window.innerWidth, window.innerHeight),
                1.5,  // strength（強度）
                0.4,  // radius（半径）
                0.85  // threshold（閾値）
            );
            this.bloomPass.enabled = this.bloomEnabled;
            this.composer.addPass(this.bloomPass);
            
            // グリッチエフェクトも初期化（composerが作成された後）
            await this.initGlitchShader();
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
     * 色収差エフェクトを適用（ノート、ベロシティ、デュレーション付き）
     */
    applyChromaticAberration(velocity, noteNumber, durationMs) {
        if (!this.chromaticAberrationPass) {
            console.warn('色収差エフェクトが初期化されていません');
            return;
        }
        
        // ベロシティ（0〜127）を色収差の強度（0.0〜1.0）に変換
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
            this.glitchEndTime = 0;
        }
        
        console.log(`Track 4: Glitch effect applied (velocity: ${velocity}, note: ${noteNumber}, amount: ${amount.toFixed(2)}, duration: ${durationMs}ms)`);
    }
    
    /**
     * キーが押された時の処理（キー3、4専用、押している間だけ有効）
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
        }
    }
    
    /**
     * キーが離された時の処理（キー3、4専用）
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
            if (this.glitchPass.material && this.glitchPass.material.uniforms) {
                this.glitchPass.material.uniforms.time.value = this.time;
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
     * クリーンアップ処理（シーン切り替え時に呼ばれる）
     */
    dispose() {
        console.log('Scene07.dispose: クリーンアップ開始');
        
        // Pointsメッシュを破棄
        if (this.pointsMesh) {
            this.scene.remove(this.pointsMesh);
            if (this.pointsMesh.geometry) {
                this.pointsMesh.geometry.dispose();
            }
            if (this.pointsMesh.material) {
                this.pointsMesh.material.dispose();
            }
            this.pointsMesh = null;
        }
        
        this.pointsPositions = null;
        this.pointsColors = null;
        this.pointsSizes = null;
        
        // パーティクルをクリア
        this.particles = [];
        this.particleMasses = [];
        
        // 線を破棄
        if (this.lineMesh) {
            this.scene.remove(this.lineMesh);
            if (this.lineGeometry) {
                this.lineGeometry.dispose();
            }
            if (this.lineMesh.material) {
                this.lineMesh.material.dispose();
            }
            this.lineMesh = null;
            this.lineGeometry = null;
        }
        
        this.connections = [];
        
        // エフェクトパスを破棄
        if (this.chromaticAberrationPass) {
            this.chromaticAberrationPass = null;
        }
        if (this.glitchPass) {
            this.glitchPass = null;
        }
        if (this.composer) {
            this.composer.dispose();
            this.composer = null;
        }
        
        // すべてのライトを削除（爆発のライトも含む）
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
        
        console.log('Scene07.dispose: クリーンアップ完了');
        
        // 親クラスのdisposeを呼ぶ
        super.dispose();
    }
}
