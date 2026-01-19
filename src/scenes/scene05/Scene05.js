/**
 * Scene05: 格子状のSphereネットワーク
 * GPUインスタンシングで格子状に配置されたSphereが線で繋がれ、力が加わるとニットのように広がる
 */

import { SceneBase } from '../SceneBase.js';
import { Particle } from '../../lib/Particle.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export class Scene05 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'mathym | Kch20';
        this.sceneNumber = 5;
        this.kitNo = 5;  // キット番号を設定
        
        // カメラデバッグを有効化
        this.SHOW_CAMERA_DEBUG = false;
        
        // 共有リソースマネージャー
        this.sharedResourceManager = sharedResourceManager;
        this.useSharedResources = !!sharedResourceManager;
        
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
        
        // 赤い十字と数字のマーカー
        this.markerGroup = null;
        this.markerCrosses = [];
        this.markerLabels = [];
        
        // トラック6用の赤いライン（ポリフォニック対応）
        this.redLines = []; // { line: THREE.Line3, mesh: THREE.Line, startTime: number, speed: number, z: number }[]
        
        // コード進行管理
        this.chords = []; // 現在のコード進行 [{ notes: [note1, note2, ...], center: Vector3, timestamp: number }]
        this.chordSpheres = []; // コードのSphere [{ mesh: THREE.Mesh, chordIndex: number }]
        this.chordLines = []; // コードのSphere同士を接続する線 [{ line: THREE.Line, geometry: THREE.BufferGeometry, material: THREE.LineBasicMaterial, chordIndex: number }]
        this.chordTexts = []; // コードのビルボードテキスト [{ sprite: THREE.Sprite, material: THREE.SpriteMaterial, chordIndex: number, createdAt: number }]
        this.chordLookAtTarget = new THREE.Vector3(0, 0, 0); // カメラの注視点（コード位置に向かう）
        this.chordLookAtGoal = new THREE.Vector3(0, 0, 0); // カメラの目標注視点
        this.chordLookAtLerp = 0.05; // カメラ注視の補間係数（自然に中心に戻る）
        this.chordTextLifetime = 3.0; // テキストの表示時間（秒）
        this.chordHeightRange = [this.groundY + this.sphereRadius * 2.0, this.groundY + this.gridSizeZ * this.gridSpacing * 0.3]; // コードの高さ範囲
        
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
        
        // カメラパーティクルの距離パラメータを再設定（8個それぞれ異なるアングル）
        if (this.cameraParticles) {
            for (let i = 0; i < this.cameraParticles.length; i++) {
                this.setupCameraParticleDistance(this.cameraParticles[i], i);
            }
        }
        
        // 色収差エフェクトを初期化（非同期で実行、重い処理を後回し）
        // グリッチエフェクトとブルームエフェクトはinitChromaticAberration内で初期化される
        this.initChromaticAberration();
        
        // 赤い十字と数字のマーカーを初期化
        this.initMarkers();
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
                    // エラーログは削除（デバッグ時のみ必要）
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
                            // ログは削除（デバッグ時のみ必要）
                            resolve(true);
        } else {
                            // エラーログは削除（デバッグ時のみ必要）
                            resolve(false);
                        }
                    })
                    .catch(error => {
                        // エラーログは削除（デバッグ時のみ必要）
                        resolve(false);
                    });
                };
                reader.onerror = () => {
                    // エラーログは削除（デバッグ時のみ必要）
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
            // ログは削除（デバッグ時のみ必要）
        } catch (error) {
            // テクスチャが存在しない場合は生成
            // ログは削除（デバッグ時のみ必要）
            const canvas = this.generateGlowTexture();
            
            // サーバーに保存（非同期、エラーでも続行）
            this.saveGlowTextureToServer(canvas).catch(err => {
                // エラーログは削除（デバッグ時のみ必要）
            });
            
            // Canvasからテクスチャを作成
            glowTexture = new THREE.CanvasTexture(canvas);
            glowTexture.colorSpace = THREE.SRGBColorSpace;
            // ログは削除（デバッグ時のみ必要）
        }
        
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
        // ログは削除（デバッグ時のみ必要）
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
        
        // ログは削除（デバッグ時のみ必要）
    }
    
    /**
     * カメラパーティクルの距離パラメータを設定（8個それぞれ異なるアングル）
     * @param {CameraParticle} cameraParticle - カメラパーティクル
     * @param {number} index - カメラパーティクルのインデックス（0-7）
     */
    setupCameraParticleDistance(cameraParticle, index = 0) {
        // グリッド範囲を計算
        const gridWidth = (this.gridSizeX - 1) * this.gridSpacing;
        const gridDepth = (this.gridSizeZ - 1) * this.gridSpacing;
        const gridSize = Math.max(gridWidth, gridDepth);
        
        // 8個のカメラパーティクルそれぞれに異なる設定
        switch (index) {
            case 0: // 低い位置から横から見る
                this.setupLowSideView(cameraParticle, gridSize);
                break;
            case 1: // 高い位置から上から見下ろす
                this.setupHighTopView(cameraParticle, gridSize);
                break;
            case 2: // 中程度の高さから横から見る
                this.setupMidSideView(cameraParticle, gridSize);
                break;
            case 3: // 低い位置から正面から見る
                this.setupLowFrontView(cameraParticle, gridSize);
                break;
            case 4: // 高い位置から斜め上から見る
                this.setupHighObliqueView(cameraParticle, gridSize);
                break;
            case 5: // 地面すれすれから見る
                this.setupGroundLevelView(cameraParticle, gridSize);
                break;
            case 6: // 中程度の高さから斜めから見る
                this.setupMidObliqueView(cameraParticle, gridSize);
                break;
            case 7: // 高い位置から横から見る
                this.setupHighSideView(cameraParticle, gridSize);
                break;
            default:
                this.setupLowSideView(cameraParticle, gridSize);
                break;
        }
    }
    
    /**
     * 低い位置から横から見る設定
     */
    setupLowSideView(cameraParticle, gridSize) {
        const cameraDistance = gridSize * 0.6;
        cameraParticle.minDistance = cameraDistance * 0.7;
        cameraParticle.maxDistance = cameraDistance * 2.5;
        cameraParticle.maxDistanceReset = cameraDistance * 1.5;
        const cameraBoxSizeXZ = gridSize * 0.8;
        const cameraMinY = gridSize * 0.05;
        const cameraMaxY = gridSize * 0.25;
        cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSizeXZ, cameraMinY, -cameraBoxSizeXZ);
        cameraParticle.boxMax = new THREE.Vector3(cameraBoxSizeXZ, cameraMaxY, cameraBoxSizeXZ);
    }
    
    /**
     * 高い位置から上から見下ろす設定
     */
    setupHighTopView(cameraParticle, gridSize) {
        const cameraDistance = gridSize * 0.4;
        cameraParticle.minDistance = cameraDistance * 0.8;
        cameraParticle.maxDistance = cameraDistance * 3.0;
        cameraParticle.maxDistanceReset = cameraDistance * 2.0;
        const cameraBoxSizeXZ = gridSize * 0.3;
        const cameraMinY = gridSize * 0.5;
        const cameraMaxY = gridSize * 0.8;
        cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSizeXZ, cameraMinY, -cameraBoxSizeXZ);
        cameraParticle.boxMax = new THREE.Vector3(cameraBoxSizeXZ, cameraMaxY, cameraBoxSizeXZ);
    }
    
    /**
     * 中程度の高さから横から見る設定
     */
    setupMidSideView(cameraParticle, gridSize) {
        const cameraDistance = gridSize * 0.7;
        cameraParticle.minDistance = cameraDistance * 0.6;
        cameraParticle.maxDistance = cameraDistance * 2.0;
        cameraParticle.maxDistanceReset = cameraDistance * 1.3;
        const cameraBoxSizeXZ = gridSize * 0.9;
        const cameraMinY = gridSize * 0.15;
        const cameraMaxY = gridSize * 0.4;
        cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSizeXZ, cameraMinY, -cameraBoxSizeXZ);
        cameraParticle.boxMax = new THREE.Vector3(cameraBoxSizeXZ, cameraMaxY, cameraBoxSizeXZ);
    }
    
    /**
     * 低い位置から正面から見る設定
     */
    setupLowFrontView(cameraParticle, gridSize) {
        const cameraDistance = gridSize * 0.65;
        cameraParticle.minDistance = cameraDistance * 0.7;
        cameraParticle.maxDistance = cameraDistance * 2.2;
        cameraParticle.maxDistanceReset = cameraDistance * 1.4;
        // 正面から見るので、Z方向を狭く、X方向を広く
        const cameraBoxSizeX = gridSize * 0.6;
        const cameraBoxSizeZ = gridSize * 0.3; // 正面から見るので狭く
        const cameraMinY = gridSize * 0.08;
        const cameraMaxY = gridSize * 0.3;
        cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSizeX, cameraMinY, -cameraBoxSizeZ);
        cameraParticle.boxMax = new THREE.Vector3(cameraBoxSizeX, cameraMaxY, cameraBoxSizeZ);
    }
    
    /**
     * 高い位置から斜め上から見る設定
     */
    setupHighObliqueView(cameraParticle, gridSize) {
        const cameraDistance = gridSize * 0.5;
        cameraParticle.minDistance = cameraDistance * 0.8;
        cameraParticle.maxDistance = cameraDistance * 2.8;
        cameraParticle.maxDistanceReset = cameraDistance * 1.8;
        const cameraBoxSizeXZ = gridSize * 0.5;
        const cameraMinY = gridSize * 0.4;
        const cameraMaxY = gridSize * 0.7;
        cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSizeXZ, cameraMinY, -cameraBoxSizeXZ);
        cameraParticle.boxMax = new THREE.Vector3(cameraBoxSizeXZ, cameraMaxY, cameraBoxSizeXZ);
    }
    
    /**
     * 地面すれすれから見る設定
     */
    setupGroundLevelView(cameraParticle, gridSize) {
        const cameraDistance = gridSize * 0.7;
        cameraParticle.minDistance = cameraDistance * 0.6;
        cameraParticle.maxDistance = cameraDistance * 2.3;
        cameraParticle.maxDistanceReset = cameraDistance * 1.4;
        const cameraBoxSizeXZ = gridSize * 1.0; // 広めに
        const cameraMinY = gridSize * 0.01; // 地面すれすれ
        const cameraMaxY = gridSize * 0.15; // 低め
        cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSizeXZ, cameraMinY, -cameraBoxSizeXZ);
        cameraParticle.boxMax = new THREE.Vector3(cameraBoxSizeXZ, cameraMaxY, cameraBoxSizeXZ);
    }
    
    /**
     * 中程度の高さから斜めから見る設定
     */
    setupMidObliqueView(cameraParticle, gridSize) {
        const cameraDistance = gridSize * 0.65;
        cameraParticle.minDistance = cameraDistance * 0.7;
        cameraParticle.maxDistance = cameraDistance * 2.4;
        cameraParticle.maxDistanceReset = cameraDistance * 1.5;
        const cameraBoxSizeXZ = gridSize * 0.7;
        const cameraMinY = gridSize * 0.2;
        const cameraMaxY = gridSize * 0.45;
        cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSizeXZ, cameraMinY, -cameraBoxSizeXZ);
        cameraParticle.boxMax = new THREE.Vector3(cameraBoxSizeXZ, cameraMaxY, cameraBoxSizeXZ);
    }
    
    /**
     * 高い位置から横から見る設定
     */
    setupHighSideView(cameraParticle, gridSize) {
        const cameraDistance = gridSize * 0.55;
        cameraParticle.minDistance = cameraDistance * 0.75;
        cameraParticle.maxDistance = cameraDistance * 2.6;
        cameraParticle.maxDistanceReset = cameraDistance * 1.7;
        const cameraBoxSizeXZ = gridSize * 0.6;
        const cameraMinY = gridSize * 0.35;
        const cameraMaxY = gridSize * 0.65;
        cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSizeXZ, cameraMinY, -cameraBoxSizeXZ);
        cameraParticle.boxMax = new THREE.Vector3(cameraBoxSizeXZ, cameraMaxY, cameraBoxSizeXZ);
    }
    
    /**
     * 赤い十字と数字のマーカーを初期化
     */
    initMarkers() {
        // マーカーグループを作成
        this.markerGroup = new THREE.Group();
        this.markerGroup.name = 'Markers';
        this.scene.add(this.markerGroup);
        
        // グリッド範囲を計算
        const gridWidth = (this.gridSizeX - 1) * this.gridSpacing;
        const gridDepth = (this.gridSizeZ - 1) * this.gridSpacing;
        const gridSize = Math.max(gridWidth, gridDepth);
        
        // マーカーのサイズ（グリッドサイズに応じて調整）
        const crossSize = gridSize * 0.02; // グリッドサイズの2%
        const markerY = this.groundY + 5.0; // 地面より少し上
        
        // マーカーの位置（グリッドの端と中心）
        const markerPositions = [
            { x: -gridWidth / 2, z: -gridDepth / 2 },      // 左下
            { x: gridWidth / 2, z: -gridDepth / 2 },      // 右下
            { x: -gridWidth / 2, z: gridDepth / 2 },      // 左上
            { x: gridWidth / 2, z: gridDepth / 2 },       // 右上
            { x: 0, z: 0 },                                 // 中心
            { x: -gridWidth / 2, z: 0 },                  // 左中央
            { x: gridWidth / 2, z: 0 },                   // 右中央
            { x: 0, z: -gridDepth / 2 },                 // 前中央
            { x: 0, z: gridDepth / 2 }                    // 後中央
        ];
        
        // 赤い十字のマテリアル
        const crossMaterial = new THREE.LineBasicMaterial({
            color: 0xff3333,
            transparent: true,
            opacity: 0.9,
            depthTest: true,
            depthWrite: false
        });
        
        // 各マーカー位置に赤い十字と数字を追加
        markerPositions.forEach((pos, index) => {
            // ワールド座標からグリッド座標を計算
            const gridX = Math.round((pos.x + gridWidth / 2) / this.gridSpacing);
            const gridZ = Math.round((pos.z + gridDepth / 2) / this.gridSpacing);
            const label = `(${gridX}, ${gridZ})`;
            // 赤い十字を作成
            const crossGeometry = new THREE.BufferGeometry();
            const crossVerts = new Float32Array([
                pos.x - crossSize, markerY, pos.z,  // X方向の線（左端）
                pos.x + crossSize, markerY, pos.z, // X方向の線（右端）
                pos.x, markerY, pos.z - crossSize,  // Z方向の線（手前）
                pos.x, markerY, pos.z + crossSize  // Z方向の線（奥）
            ]);
            crossGeometry.setAttribute('position', new THREE.BufferAttribute(crossVerts, 3));
            const crossLines = new THREE.LineSegments(crossGeometry, crossMaterial);
            crossLines.name = `markerCross_${index}`;
            this.markerGroup.add(crossLines);
            this.markerCrosses.push(crossLines);
            
            // 数字のラベルを作成（グリッド座標形式）
            const labelSprite = this.createLabelSprite(label, new THREE.Vector3(pos.x, markerY + crossSize * 2, pos.z));
            this.markerGroup.add(labelSprite);
            this.markerLabels.push(labelSprite);
        });
        
        // ログは削除（デバッグ時のみ必要）
    }
    
    /**
     * ラベルスプライトを作成（GridRuler3Dを参考）
     */
    createLabelSprite(text, position) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#00000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 白いテキスト
        ctx.font = '22px "Inter", "Roboto", "Helvetica Neue", "Helvetica", "Arial", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        const mat = new THREE.SpriteMaterial({
            map: tex,
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(mat);
        sprite.position.copy(position);
        
        // スケールをグリッドサイズに応じて調整
        const gridWidth = (this.gridSizeX - 1) * this.gridSpacing;
        const gridDepth = (this.gridSizeZ - 1) * this.gridSpacing;
        const gridSize = Math.max(gridWidth, gridDepth);
        const labelScale = gridSize * 0.04;
        sprite.scale.set(labelScale, labelScale * 0.5, 1);
        sprite.renderOrder = 10;
        sprite.frustumCulled = false;
        
        return sprite;
    }
    
    /**
     * カメラの位置を更新（低い位置から横から見る）
     */
    updateCamera() {
        if (this.cameraParticles[this.currentCameraIndex]) {
            const cameraPos = this.cameraParticles[this.currentCameraIndex].getPosition();
            this.camera.position.copy(cameraPos);
            
            // コードの注視点がある場合はそれを使用、なければグリッドの中心を見る
            const defaultLookAt = new THREE.Vector3(0, this.groundY + this.gridSizeZ * this.gridSpacing * 0.1, 0);
            if (this.chordLookAtTarget && this.chordLookAtTarget.lengthSq() > 0.01) {
                // コードの注視点とデフォルト位置を補間（自然に中心に戻る）
                const blendedLookAt = new THREE.Vector3().lerpVectors(this.chordLookAtTarget, defaultLookAt, 0.3);
                this.camera.lookAt(blendedLookAt);
            } else {
                this.camera.lookAt(defaultLookAt);
            }
            this.camera.up.set(0, 1, 0);
        }
        
        // マーカーのラベルをカメラに向ける（ビルボード）
        if (this.markerLabels) {
            this.markerLabels.forEach(label => {
                if (label && this.camera) {
                    label.quaternion.copy(this.camera.quaternion);
                }
            });
        }
        
        // コードのテキストもカメラに向ける（ビルボード）
        if (this.chordTexts) {
            this.chordTexts.forEach(textInfo => {
                if (textInfo.sprite && this.camera) {
                    textInfo.sprite.quaternion.copy(this.camera.quaternion);
                }
            });
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
        // SceneBaseのtimeも更新（HUD表示用）
        super.time = this.time;
        
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
                // 方向ベクトルを正規化（一度だけ、効率的に）
                const invLength = 1.0 / currentLength;
                diff.multiplyScalar(invLength); // 正規化（diffを直接変更）
                
                // 理想的な距離からのずれ
                const stretch = currentLength - this.restLength;
                
                // スプリング力（フックの法則）
                const springForce = stretch * this.springStiffness;
                
                // 速度差による減衰
                const velA = particleA.getVelocity();
                const velB = particleB.getVelocity();
                const velDiff = new THREE.Vector3().subVectors(velB, velA);
                const dampingForce = velDiff.dot(diff) * this.springDamping;
                
                // 力を適用
                const totalForce = springForce + dampingForce;
                
                // 粒子Aに力を加える（B方向、clone()を避けて直接計算）
                const forceA = diff.clone().multiplyScalar(totalForce);
                particleA.addForce(forceA);
                // 粒子Bに力を加える（A方向、反対向き）
                particleB.addForce(diff.multiplyScalar(-totalForce));
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
                // 方向ベクトルを正規化（clone()を避けて直接正規化）
                restoreDiff.normalize();
                
                // 復元力（フックの法則）
                const restoreForce = restoreDistance * this.restoreStiffness;
                
                // 速度による減衰
                const vel = particle.getVelocity();
                const velDot = vel.dot(restoreDiff);
                const restoreDamping = velDot * this.restoreDamping;
                
                // 復元力を適用
                const totalRestoreForce = restoreForce + restoreDamping;
                particle.addForce(restoreDiff.multiplyScalar(totalRestoreForce));
            }
            
            // 重力を適用（clone()は不要、固定値なので直接渡す）
            particle.addForce(this.gravity);
            
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
        
        // 赤いラインの位置を更新（左から右へ流れる）
        this.updateRedLines(deltaTime);
        
        // コードエフェクトを更新（テキストのフェードアウトとカメラの注視）
        this.updateChordEffects(deltaTime);
        
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
     * ヒートマップの色を計算（0.0-1.0の値から色を生成、黒 → 白のグラデーション）
     * @param {number} value - 0.0（低い値）から1.0（高い値）
     * @returns {THREE.Color} ヒートマップの色
     */
    getHeatMapColor(value) {
        // 黒 → 白 のグラデーション
        const color = new THREE.Color();
        
        // valueが0.0の時は黒（0, 0, 0）、1.0の時は白（1, 1, 1）
        color.r = value;
        color.g = value;
        color.b = value;
        
        return color;
    }
    
    /**
     * ライン用のヒートマップ色を計算（Velocity 0-127 → 青→赤のHSLヒートマップ）
     * @param {number} value - 正規化された値（0.0-1.0、velocity/127.0）
     * @returns {THREE.Color} ヒートマップの色（青→赤）
     */
    getHeatMapColorForLine(value) {
        // 赤色のヒートマップ：黒（0）→ 赤（127）
        const color = new THREE.Color();
        
        // valueが0.0の時は黒（0, 0, 0）、1.0の時は赤（1, 0, 0）
        // 黒から赤へのグラデーション
        color.r = value; // 0.0 → 1.0（黒 → 赤）
        color.g = 0.0;
        color.b = 0.0;
        
        // デバッグログは削除（FPS向上のため）
        
        return color;
    }
    
    /**
     * 赤いラインの位置を更新（縦線が左から右へ流れる、一小節で移動）
     */
    updateRedLines(deltaTime) {
        if (!this.redLines || this.redLines.length === 0) return;
        
        // 現在のactualTickを取得（SceneBaseから継承）
        const currentTick = this.actualTick || 0;
        
        // 各ラインを更新
        for (let i = this.redLines.length - 1; i >= 0; i--) {
            const lineInfo = this.redLines[i];
            
            // 経過したtick数を計算
            const elapsedTicks = currentTick - lineInfo.startTick;
            
            // 一小節（384 ticks）で左端から右端まで移動
            const progress = elapsedTicks / lineInfo.ticksPerMeasure; // 0.0-1.0
            
            // 右端に到達したら削除
            if (progress >= 1.0) {
                this.scene.remove(lineInfo.line);
                lineInfo.geometry.dispose();
                lineInfo.material.dispose();
                this.redLines.splice(i, 1);
                continue;
            }
            
            // 現在のX位置を計算（左端から右端へ）
            const currentX = lineInfo.startX + progress * (lineInfo.endX - lineInfo.startX);
            
            // ラインの位置を更新（BufferGeometryを使用しているため、positionsを更新）
            const positions = lineInfo.positions;
            positions[0] = currentX; // 縦線の下端のX
            positions[1] = lineInfo.y;
            positions[2] = lineInfo.zMin;
            positions[3] = currentX; // 縦線の上端のX
            positions[4] = lineInfo.y;
            positions[5] = lineInfo.zMax;
            
            lineInfo.geometry.attributes.position.needsUpdate = true;
            
            // 透明度を更新（右に行くほど透明に）
            // progressが0.0（左端）の時はopacity=1.0、progressが1.0（右端）の時はopacity=0.0
            const opacity = 1.0 - progress;
            lineInfo.material.opacity = Math.max(0.0, opacity);
            
            // デバッグログは削除（FPS向上のため）
        }
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
        
        // ベロシティから力の強さを計算（0-127 → 力の強さ、さらに弱めに調整）
        let forceStrength = 800.0; // デフォルト（さらに弱めに調整）
        let forceRadius = 50.0; // デフォルトの影響範囲
        if (velocity !== null) {
            const velocityNormalized = velocity / 127.0; // 0.0-1.0
            forceStrength = 800.0 + velocityNormalized * 2000.0; // 800-2800（さらに弱めに調整）
            // 影響範囲もVelocityに応じて変える（小さいvelocityでは小さく、大きいvelocityでは大きく）
            forceRadius = 100.0 + velocityNormalized * 200.0; // 100-300の範囲
        }
        
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
                
                // ノイズを使って高さに緩急を付ける
                // パーティクルのXZ位置からノイズ値を計算
                const noiseScale = 0.1; // ノイズのスケール
                const noiseValue = this.fractalNoise(
                    particlePos.x * noiseScale,
                    particlePos.z * noiseScale,
                    this.time * 0.1
                );
                // ノイズ値を0.0-1.0の範囲に正規化
                const noiseNormalized = (noiseValue + 1.0) * 0.5; // -1.0～1.0 → 0.0～1.0
                
                // ノイズを使って力の強さに緩急を付ける（0.5倍～1.5倍の範囲）
                const noiseMultiplier = 0.5 + noiseNormalized * 1.0; // 0.5～1.5
                const upwardForce = localForceStrength * noiseMultiplier;
                
                // 中心から外側への放射状の力（山なりにするため）
                // XZ平面での方向ベクトルを計算
                const horizontalDir = new THREE.Vector3(toParticle.x, 0, toParticle.z).normalize();
                const outwardForceStrength = localForceStrength * 0.3; // 外側への力は上方向の30%
                const outwardForce = horizontalDir.multiplyScalar(outwardForceStrength);
                
                // 力を合成（上方向 + 外側方向）
                const totalForce = new THREE.Vector3(outwardForce.x, upwardForce, outwardForce.z);
                
                // 力を適用
                particle.addForce(totalForce);
                affectedCount++;
            }
        }
        
        // デバッグログは削除（FPS向上のため）
    }
    
    /**
     * 赤いラインを作成（トラック6用、縦線が左から右へ流れる）
     * @param {number} velocity - ベロシティ（0-127、色に影響）
     * @param {number} noteNumber - ノート番号（未使用、将来の拡張用）
     */
    createRedLine(velocity = 127.0, noteNumber = 64.0) {
        // グリッド範囲を計算
        const gridWidth = (this.gridSizeX - 1) * this.gridSpacing;
        const gridDepth = (this.gridSizeZ - 1) * this.gridSpacing;
        
        // マーカーの高さと同じ
        const markerY = this.groundY + 5.0;
        
        // 左端と右端のX位置
        const leftX = -gridWidth / 2;
        const rightX = gridWidth / 2;
        
        // 縦線のZ範囲（グリッド全体をカバー）
        const zMin = -gridDepth / 2;
        const zMax = gridDepth / 2;
        
        // 一小節 = 384 ticksで左端から右端まで移動
        const ticksPerMeasure = 384;
        
        // Velocityから色を計算（0-127 → 黒→赤のヒートマップ）
        const velocityNormalized = Math.max(0.0, Math.min(1.0, velocity / 127.0)); // 0.0-1.0
        const heatMapColor = this.getHeatMapColorForLine(velocityNormalized);
        
        // ラインのジオメトリを作成（縦線、初期位置は左端）
        const lineGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array([
            leftX, markerY, zMin,  // 縦線の下端
            leftX, markerY, zMax   // 縦線の上端
        ]);
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        // ラインのマテリアル（velocityに応じた色、透明度は動的に更新）
        // LineBasicMaterialを使用（linewidthは多くの環境で無視されるが、シンプルな線として表示）
        const lineMaterial = new THREE.LineBasicMaterial({
            color: new THREE.Color(heatMapColor.r, heatMapColor.g, heatMapColor.b),  // 新しいColorオブジェクトを作成
            linewidth: 5.0,  // 5ピクセル（多くの環境で無視されるが、設定しておく）
            transparent: true,
            opacity: 1.0  // 初期は不透明、右に行くほど透明に
        });
        
        // ラインのメッシュを作成（Lineを使用）
        const lineMesh = new THREE.Line(lineGeometry, lineMaterial);
        this.scene.add(lineMesh);
        
        // ライン情報を保存（ポリフォニック対応）
        this.redLines.push({
            line: lineMesh,
            material: lineMaterial,
            startX: leftX,
            endX: rightX,
            y: markerY,
            zMin: zMin,
            zMax: zMax,
            ticksPerMeasure: ticksPerMeasure,
            startTick: this.actualTick || 0,  // 開始時のactualTickを記録
            geometry: lineGeometry,
            positions: positions,  // 位置データを保存
            velocity: velocity  // velocityを保存（将来の拡張用）
        });
        
        // ログは削除（デバッグ時のみ必要）
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
                    null,  // hudScales
                    null,  // hudGrid
                    0,  // currentBar
                    '',  // debugText
                    this.actualTick || 0,  // actualTick（OSCから受け取る値）
                    null,  // cameraModeName
                    this.sceneNumber  // sceneNumber
                );
            } else {
                this.hud.clear();
            }
        }
        
        // スクリーンショットテキストを描画
        this.drawScreenshotText();
        
        // カメラデバッグを描画（テキスト）
        this.drawCameraDebug();
    }
    
    /**
     * OSCメッセージの処理（SceneBaseをオーバーライド）
     */
    handleOSC(message) {
        // /chord/メッセージを処理
        if (message.address === '/chord/' || message.address === '/chord') {
            const args = message.args || [];
            if (args.length >= 3) {
                const noteNumber = args[0] !== undefined ? args[0] : 64.0;
                const velocity = args[1] !== undefined ? args[1] : 127.0;
                const durationMs = args[2] !== undefined ? args[2] : 0.0;
                this.handleChord(noteNumber, velocity, durationMs);
            }
            return; // 処理済み
        }
        
        // 親クラスのhandleOSCを呼び出す
        super.handleOSC(message);
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
        // トラック6: 赤いラインが左から右へ流れる（ポリフォニック対応）
        // argsの順序: [ノート, ベロシティ, デュレーション, ミュート]
        else if (trackNumber === 6) {
            const noteNumber = args[0] !== undefined ? args[0] : 64.0; // ノート（Z座標の位置に影響）
            const velocity = args[1] !== undefined ? args[1] : 127.0; // ベロシティ（0-127、色に影響）
            const durationMs = args[2] !== undefined ? args[2] : 0.0; // デュレーション（未使用）
            const mute = args[3] !== undefined ? args[3] : 0.0; // ミュート（未使用）
            // デバッグログは削除（FPS向上のため）
            this.createRedLine(velocity, noteNumber);
        }
    }
    
    /**
     * ノート番号からコード名を取得
     * @param {number[]} notes - ノート番号の配列
     * @returns {string} コード名（例: "Cmaj7", "Am"）
     */
    getChordName(notes) {
        if (!notes || notes.length === 0) return '?';
        
        // ノート番号をMIDIノート（0-127）から12音階に変換
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const rootNote = Math.floor(notes[0]) % 12;
        const rootName = noteNames[rootNote];
        
        // 簡易的なコード判定（完全なコード解析は複雑なので、シンプルに）
        if (notes.length === 3) {
            // 3音の場合はトライアド
            const intervals = notes.slice(1).map(n => (Math.floor(n) - Math.floor(notes[0]) + 12) % 12).sort((a, b) => a - b);
            if (intervals[0] === 3 && intervals[1] === 7) return rootName + 'm'; // 短三和音
            if (intervals[0] === 4 && intervals[1] === 7) return rootName; // 長三和音
        } else if (notes.length === 4) {
            // 4音の場合はセブンスコード
            const intervals = notes.slice(1).map(n => (Math.floor(n) - Math.floor(notes[0]) + 12) % 12).sort((a, b) => a - b);
            if (intervals.includes(3) && intervals.includes(7) && intervals.includes(10)) return rootName + 'm7';
            if (intervals.includes(4) && intervals.includes(7) && intervals.includes(11)) return rootName + 'maj7';
            if (intervals.includes(4) && intervals.includes(7) && intervals.includes(10)) return rootName + '7';
        }
        
        // デフォルトはルート音のみ
        return rootName;
    }
    
    /**
     * コード進行を処理（和音を管理）
     * @param {number} noteNumber - ノート番号
     * @param {number} velocity - ベロシティ
     * @param {number} durationMs - デュレーション
     */
    handleChord(noteNumber, velocity, durationMs) {
        const currentTime = performance.now();
        const chordWindow = 100; // 100ms以内に来たノートは同じコードとして扱う
        
        // 最新のコードを取得、または新規作成
        let currentChord = this.chords[this.chords.length - 1];
        if (!currentChord || (currentTime - currentChord.timestamp) > chordWindow) {
            // 新しいコードを作成
            const gridWidth = (this.gridSizeX - 1) * this.gridSpacing;
            const gridDepth = (this.gridSizeZ - 1) * this.gridSpacing;
            
            // ランダムな中心位置を決定（高さもランダム）
            const centerX = (Math.random() - 0.5) * gridWidth * 0.8;
            const centerZ = (Math.random() - 0.5) * gridDepth * 0.8;
            const centerY = this.chordHeightRange[0] + Math.random() * (this.chordHeightRange[1] - this.chordHeightRange[0]);
            
            currentChord = {
                notes: [],
                center: new THREE.Vector3(centerX, centerY, centerZ),
                timestamp: currentTime,
                chordIndex: this.chords.length
            };
            this.chords.push(currentChord);
        }
        
        // ノートを追加
        if (!currentChord.notes.find(n => Math.abs(n - noteNumber) < 0.1)) {
            currentChord.notes.push(noteNumber);
        }
        
        // 和音が完成したら（3-4音）、Sphereとテキストを作成
        if (currentChord.notes.length >= 3 && currentChord.notes.length <= 4) {
            // ノート番号の平均値に応じて高さを設定
            const avgNote = currentChord.notes.reduce((sum, n) => sum + n, 0) / currentChord.notes.length;
            const noteMin = 36; // 最低ノート
            const noteMax = 127; // 最高ノート
            const normalizedNote = Math.max(0, Math.min(1, (avgNote - noteMin) / (noteMax - noteMin)));
            const heightRange = this.chordHeightRange[1] - this.chordHeightRange[0];
            currentChord.center.y = this.chordHeightRange[0] + normalizedNote * heightRange;
            
            this.createChordSpheres(currentChord);
            this.createChordText(currentChord);
            
            // カメラをその位置に注視させる
            this.chordLookAtGoal.copy(currentChord.center);
        }
    }
    
    /**
     * ノート番号から色を取得（ヒートマップ：36が青、127が赤）
     * @param {number} noteNumber - ノート番号（36-127）
     * @returns {THREE.Color} 色
     */
    getHeatMapColorForNote(noteNumber) {
        const noteMin = 36;
        const noteMax = 127;
        // より大げさな色の変化のために、範囲を拡張して正規化
        const normalized = Math.max(0, Math.min(1, (noteNumber - noteMin) / (noteMax - noteMin)));
        
        // 色の変化をより大げさにするために、非線形マッピング
        const enhancedNormalized = Math.pow(normalized, 0.7); // 0.7乗でより早く色が変わる
        
        // 青（36）→ シアン → 緑 → 黄 → オレンジ → 赤（127）のヒートマップ
        const color = new THREE.Color();
        if (enhancedNormalized < 0.2) {
            // 青 → シアン（より青を強調）
            const t = enhancedNormalized / 0.2;
            color.r = 0.0;
            color.g = t * 0.5;
            color.b = 1.0;
        } else if (enhancedNormalized < 0.4) {
            // シアン → 緑
            const t = (enhancedNormalized - 0.2) / 0.2;
            color.r = 0.0;
            color.g = 0.5 + t * 0.5;
            color.b = 1.0 - t;
        } else if (enhancedNormalized < 0.6) {
            // 緑 → 黄
            const t = (enhancedNormalized - 0.4) / 0.2;
            color.r = t;
            color.g = 1.0;
            color.b = 0.0;
        } else if (enhancedNormalized < 0.8) {
            // 黄 → オレンジ
            const t = (enhancedNormalized - 0.6) / 0.2;
            color.r = 1.0;
            color.g = 1.0 - t * 0.5;
            color.b = 0.0;
            } else {
            // オレンジ → 赤
            const t = (enhancedNormalized - 0.8) / 0.2;
            color.r = 1.0;
            color.g = 0.5 - t * 0.5;
            color.b = 0.0;
        }
        
        return color;
    }
    
    /**
     * コードのSphereを作成
     * @param {Object} chord - コード情報
     */
    createChordSpheres(chord) {
        const sphereRadius = this.sphereRadius * 3.0; // 通常のSphereより大きく
        const spreadRadius = this.gridSpacing * 2.0; // 和音同士の距離
        
        const spherePositions = []; // Sphereの位置を保存（線の接続用）
        
        chord.notes.forEach((noteNumber, index) => {
            // ノート番号に応じて高さを設定（より大げさに）
            const noteMin = 36;
            const noteMax = 127;
            const normalizedNote = Math.max(0, Math.min(1, (noteNumber - noteMin) / (noteMax - noteMin)));
            // 高さの変化をより大げさにする（グリッド間隔の5倍まで）
            const heightOffset = normalizedNote * this.gridSpacing * 5.0; // ノートが高いほど上に
            
            // 中心位置からランダムに配置（円形の範囲内でランダム）
            const randomAngle = Math.random() * Math.PI * 2.0;
            const randomRadius = Math.random() * spreadRadius; // 0からspreadRadiusまでのランダムな距離
            const offsetX = Math.cos(randomAngle) * randomRadius;
            const offsetZ = Math.sin(randomAngle) * randomRadius;
            
            // さらにランダム性を追加（完全にランダムなオフセット）
            const additionalRandomX = (Math.random() - 0.5) * spreadRadius * 0.5;
            const additionalRandomZ = (Math.random() - 0.5) * spreadRadius * 0.5;
            
            const position = new THREE.Vector3(
                chord.center.x + offsetX + additionalRandomX,
                chord.center.y + heightOffset,
                chord.center.z + offsetZ + additionalRandomZ
            );
            
            spherePositions.push(position.clone()); // 位置を保存
            
            // ノート番号に応じた色を取得（ヒートマップ）
            const heatMapColor = this.getHeatMapColorForNote(noteNumber);
            
            // Sphereジオメトリとマテリアルを作成
            const geometry = new THREE.SphereGeometry(sphereRadius, 16, 16);
            const material = new THREE.MeshStandardMaterial({
                color: heatMapColor,
                emissive: heatMapColor.clone().multiplyScalar(0.2), // 少し発光
                metalness: 0.3,
                roughness: 0.7
            });
            
            const sphere = new THREE.Mesh(geometry, material);
            sphere.position.copy(position);
            this.scene.add(sphere);
            
            this.chordSpheres.push({
                mesh: sphere,
                chordIndex: chord.chordIndex
            });
        });
        
        // Sphere同士をグレーの線で接続
        if (spherePositions.length >= 2) {
            // 全てのSphere同士を接続（完全グラフ）
            const positions = [];
            for (let i = 0; i < spherePositions.length; i++) {
                for (let j = i + 1; j < spherePositions.length; j++) {
                    positions.push(
                        spherePositions[i].x, spherePositions[i].y, spherePositions[i].z,
                        spherePositions[j].x, spherePositions[j].y, spherePositions[j].z
                    );
                }
            }
            
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
            
            const material = new THREE.LineBasicMaterial({
                color: 0x888888, // グレー
                linewidth: 1.0,
                transparent: true,
                opacity: 0.6
            });
            
            const line = new THREE.LineSegments(geometry, material);
            this.scene.add(line);
            
            this.chordLines.push({
                line: line,
                geometry: geometry,
                material: material,
                chordIndex: chord.chordIndex
            });
        }
    }
    
    /**
     * コードのビルボードテキストを作成
     * @param {Object} chord - コード情報
     */
    createChordText(chord) {
        const chordName = this.getChordName(chord.notes);
        const text = `${chordName} (${chord.notes.map(n => Math.floor(n)).join(',')})`;
        
        // テキスト位置はコードの中心の上
        const textPosition = new THREE.Vector3(
            chord.center.x,
            chord.center.y + this.sphereRadius * 5.0,
            chord.center.z
        );
        
        const sprite = this.createLabelSprite(text, textPosition);
        this.scene.add(sprite);
        
        this.chordTexts.push({
            sprite: sprite,
            material: sprite.material,
            chordIndex: chord.chordIndex,
            createdAt: performance.now()
        });
    }
    
    /**
     * コードエフェクトを更新（テキストのフェードアウトとカメラの注視）
     * @param {number} deltaTime - 経過時間（秒）
     */
    updateChordEffects(deltaTime) {
        const currentTime = performance.now();
        
        // テキストのフェードアウト
        this.chordTexts.forEach((textInfo, index) => {
            const age = (currentTime - textInfo.createdAt) / 1000.0; // 秒
            if (age > this.chordTextLifetime) {
                // テキストを削除
                this.scene.remove(textInfo.sprite);
                if (textInfo.material.map) {
                    textInfo.material.map.dispose();
                }
                textInfo.material.dispose();
                this.chordTexts.splice(index, 1);
            } else {
                // フェードアウト
                const fadeProgress = age / this.chordTextLifetime;
                textInfo.material.opacity = 1.0 - fadeProgress;
            }
        });
        
        // カメラの注視を自然に中心に戻す
        this.chordLookAtTarget.lerp(this.chordLookAtGoal, this.chordLookAtLerp);
        
        // 目標注視点を中心に戻す（自然に戻る）
        const center = new THREE.Vector3(0, this.groundY + this.gridSizeZ * this.gridSpacing * 0.1, 0);
        this.chordLookAtGoal.lerp(center, 0.01); // ゆっくり中心に戻る
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
    
        // ログは削除（デバッグ時のみ必要）
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
            // エラーログは削除（デバッグ時のみ必要）
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
            // エラーログは削除（デバッグ時のみ必要）
        }
    }
    
    /**
     * 色収差エフェクトを適用（ノート、ベロシティ、デュレーション付き）
     */
    applyChromaticAberration(velocity, noteNumber, durationMs) {
        if (!this.chromaticAberrationPass) {
            // エラーログは削除（デバッグ時のみ必要）
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
        
        // ログは削除（デバッグ時のみ必要）
    }
    
    /**
     * グリッチエフェクトを適用（ノート、ベロシティ、デュレーション付き）
     */
    applyGlitch(velocity, noteNumber, durationMs) {
        if (!this.glitchPass) {
            // エラーログは削除（デバッグ時のみ必要）
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
        
        // ログは削除（デバッグ時のみ必要）
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
        // ログは削除（デバッグ時のみ必要）
        
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
        
        // マーカーを破棄
        if (this.markerGroup) {
            this.scene.remove(this.markerGroup);
            this.markerCrosses.forEach(cross => {
                if (cross.geometry) cross.geometry.dispose();
                if (cross.material) cross.material.dispose();
            });
            this.markerLabels.forEach(label => {
                if (label.material) {
                    if (label.material.map) label.material.map.dispose();
                    label.material.dispose();
                }
            });
            this.markerGroup = null;
            this.markerCrosses = [];
            this.markerLabels = [];
        }
        
        // 赤いラインを破棄
        if (this.redLines && this.redLines.length > 0) {
            this.redLines.forEach(lineInfo => {
                if (lineInfo.line) {
                    this.scene.remove(lineInfo.line);
                }
                if (lineInfo.geometry) {
                    lineInfo.geometry.dispose();
                }
                if (lineInfo.line && lineInfo.line.material) {
                    lineInfo.line.material.dispose();
                }
            });
            this.redLines = [];
        }
        
        // コード進行を破棄
        if (this.chordSpheres && this.chordSpheres.length > 0) {
            this.chordSpheres.forEach(sphereInfo => {
                if (sphereInfo.mesh) {
                    this.scene.remove(sphereInfo.mesh);
                    if (sphereInfo.mesh.geometry) {
                        sphereInfo.mesh.geometry.dispose();
                    }
                    if (sphereInfo.mesh.material) {
                        sphereInfo.mesh.material.dispose();
                    }
                }
            });
            this.chordSpheres = [];
        }
        
        if (this.chordLines && this.chordLines.length > 0) {
            this.chordLines.forEach(lineInfo => {
                if (lineInfo.line) {
                    this.scene.remove(lineInfo.line);
                }
                if (lineInfo.geometry) {
                    lineInfo.geometry.dispose();
                }
                if (lineInfo.material) {
                    lineInfo.material.dispose();
                }
            });
            this.chordLines = [];
        }
        
        if (this.chordTexts && this.chordTexts.length > 0) {
            this.chordTexts.forEach(textInfo => {
                if (textInfo.sprite) {
                    this.scene.remove(textInfo.sprite);
                }
                if (textInfo.material) {
                    if (textInfo.material.map) {
                        textInfo.material.map.dispose();
                    }
                    textInfo.material.dispose();
                }
            });
            this.chordTexts = [];
        }
        
        this.chords = [];
        
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
        
        // ログは削除（デバッグ時のみ必要）
        
        // 親クラスのdisposeを呼ぶ
        super.dispose();
    }
}
