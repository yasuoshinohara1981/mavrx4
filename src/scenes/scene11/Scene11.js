/**
 * Scene11: 引力Sphereと瓦礫のシーン
 * Scene06をベースに、中心の引力Sphereに引き寄せられる瓦礫を表現
 */

import { SceneBase } from '../SceneBase.js';
import { Particle } from '../../lib/Particle.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import { Scene11_AttractorSphere } from './Scene11_AttractorSphere.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import * as THREE from 'three';

export class Scene11 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'mathym | KRk';
        console.log('Scene11: コンストラクタ実行', this.title);
        
        // 共有リソースマネージャー
        this.sharedResourceManager = sharedResourceManager;
        this.useSharedResources = !!sharedResourceManager;
        
        // 表示設定
        this.SHOW_PARTICLES = false;
        this.SHOW_LINES = false;
        
        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
        
        // パーティクル設定（瓦礫）
        this.numParticles = 800; // 800個
        this.particles = [];
        this.particleAngularVelocities = [];
        this.particleRotations = [];
        this.particleSizes = [];
        this.particleMasses = [];
        this.instancedManager = null;
        
        // 尻尾線（トレイル）の設定
        this.trailGroup = null; // 尻尾線を管理するグループ
        this.trailMeshes = []; // 各パーティクルの尻尾線メッシュ
        this.trailLineRadius = 1.0; // 線の太さ（シーン2参考）
        this.maxTrailLength = 50.0; // 最大の尻尾の長さ
        
        // 瓦礫のサイズパラメータ（小さく）
        this.DEBRIS_WIDTH_MIN = 10.0;  // 小さく
        this.DEBRIS_WIDTH_MAX = 50.0;  // 小さく
        this.DEBRIS_HEIGHT_MIN = 15.0;  // 小さく
        this.DEBRIS_HEIGHT_MAX = 100.0;  // 小さく
        this.SMALL_DEBRIS_SIZE_MIN = 8.0;  // 小さく
        this.SMALL_DEBRIS_SIZE_MAX = 30.0;  // 小さく
        
        // 瓦礫の種類の割合
        this.numSmallDebris = Math.floor(this.numParticles * 0.80); // 80%（小さな瓦礫）
        this.numDebris = this.numParticles - this.numSmallDebris; // 残り（通常の瓦礫）
        
        // ノイズ用のシード
        this.noiseSeed = Math.random() * 1000.0;
        
        // 時間変数
        this.time = 0.0;
        
        // 地面設定
        this.groundY = 0.0;
        this.groundSize = 2000.0; // 地面のサイズ（正方形、狭く）
        this.gridSize = 200.0; // グリッドのセルサイズ（狭く）
        
        // 重力設定
        this.gravity = new THREE.Vector3(0, 0, 0); // 重力なし
        
        // 中心の引力Sphere
        this.attractorSphere = null;
        this.attractorRadius = 400.0; // 他のシーンと同じぐらい（400）
        this.attractionEnabled = false; // 引力のON/OFF（デフォルトはOFF）
        
        // Sphereの移動範囲（Box）- 地面の格子に合わせる（狭く）
        const halfGroundSize = this.groundSize / 2.0;
        this.sphereBoxMin = new THREE.Vector3(-halfGroundSize, 400.0, -halfGroundSize);
        this.sphereBoxMax = new THREE.Vector3(halfGroundSize, 800.0, halfGroundSize);
        this.sphereBoxMesh = null; // ワイヤーフレームのBox
        
        // Bloomエフェクトの設定
        this.bloomPass = null;
        this.bloomEnabled = true; // デフォルトで有効
    }
    
    async setup() {
        await super.setup();
        
        // ポストプロセッシングエフェクトを初期化
        await this.initChromaticAberration();
        
        // トラック3の色収差エフェクトを最初からONにする（初期化完了を待つ）
        this.trackEffects[3] = true;
        // 非同期で初期化される可能性があるので、少し待ってから有効化
        requestAnimationFrame(() => {
            if (this.chromaticAberrationPass) {
                this.chromaticAberrationPass.enabled = true;
                this.chromaticAberrationAmount = 0.3; // 適度な強度
                if (this.chromaticAberrationPass.material && this.chromaticAberrationPass.material.uniforms) {
                    this.chromaticAberrationPass.material.uniforms.amount.value = 0.3;
                }
            }
        });
        
        // カメラパーティクルの距離パラメータを再設定
        if (this.cameraParticles) {
            for (const cameraParticle of this.cameraParticles) {
                this.setupCameraParticleDistance(cameraParticle);
            }
        }
        
        // ライトを設定
        this.setupLights();
        
        // 地面を作成（格子状の四角形）
        this.createGround();
        
        // Sphereの移動範囲Boxを作成（ワイヤーフレーム）
        this.createSphereBox();
        
        // 中心の引力Sphereを作成
        this.createAttractorSphere();
        
        // パーティクル（瓦礫）を作成
        this.createParticles();
        
        // 尻尾線を作成
        this.createTrails();
    }
    
    /**
     * 色収差エフェクトを初期化（Bloomエフェクトも追加）
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
            
            // ブルームエフェクトを追加（既に存在する場合はスキップ）
            if (!this.bloomPass) {
                this.bloomPass = new UnrealBloomPass(
                    new THREE.Vector2(window.innerWidth, window.innerHeight),
                    1.5,  // strength（強度）
                    0.4,  // radius（半径）
                    0.85  // threshold（閾値）
                );
                this.bloomPass.enabled = this.bloomEnabled; // デフォルトで有効
                this.composer.addPass(this.bloomPass);
            }
            
            // グリッチエフェクトも初期化（composerが作成された後）
            await this.initGlitchShader();
        } catch (err) {
            console.error('色収差シェーダーの読み込みに失敗:', err);
        }
    }
    
    /**
     * ライトを設定
     */
    setupLights() {
        // 環境光を追加（PointLightの効果を目立たせるため弱めに）
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
        this.scene.add(ambientLight);
    }
    
    /**
     * 地面を作成（格子状の四角形）
     */
    createGround() {
        // グリッド線のマテリアル
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x888888,
            transparent: false,
            opacity: 1.0
        });
        
        const halfSize = this.groundSize / 2.0;
        const numCells = Math.floor(this.groundSize / this.gridSize);
        
        // 縦の線（X方向に並行）
        for (let i = 0; i <= numCells; i++) {
            const x = -halfSize + (i * this.gridSize);
            const points = [
                new THREE.Vector3(x, this.groundY + 0.1, -halfSize),
                new THREE.Vector3(x, this.groundY + 0.1, halfSize)
            ];
            const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(lineGeometry, lineMaterial);
            line.renderOrder = -1;
            this.scene.add(line);
        }
        
        // 横の線（Z方向に並行）
        for (let i = 0; i <= numCells; i++) {
            const z = -halfSize + (i * this.gridSize);
            const points = [
                new THREE.Vector3(-halfSize, this.groundY + 0.1, z),
                new THREE.Vector3(halfSize, this.groundY + 0.1, z)
            ];
            const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(lineGeometry, lineMaterial);
            line.renderOrder = -1;
            this.scene.add(line);
        }
    }
    
    /**
     * Sphereの移動範囲Boxを作成（ワイヤーフレーム）
     */
    createSphereBox() {
        const boxWidth = this.sphereBoxMax.x - this.sphereBoxMin.x;
        const boxHeight = this.sphereBoxMax.y - this.sphereBoxMin.y;
        const boxDepth = this.sphereBoxMax.z - this.sphereBoxMin.z;
        
        const boxGeometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
        const boxEdges = new THREE.EdgesGeometry(boxGeometry);
        const boxMaterial = new THREE.LineBasicMaterial({
            color: 0x888888,
            transparent: true,
            opacity: 0.6
        });
        
        this.sphereBoxMesh = new THREE.LineSegments(boxEdges, boxMaterial);
        this.sphereBoxMesh.position.set(
            (this.sphereBoxMin.x + this.sphereBoxMax.x) / 2,
            (this.sphereBoxMin.y + this.sphereBoxMax.y) / 2,
            (this.sphereBoxMin.z + this.sphereBoxMax.z) / 2
        );
        this.scene.add(this.sphereBoxMesh);
    }
    
    /**
     * 中心の引力Sphereを作成
     */
    createAttractorSphere() {
        const centerPos = new THREE.Vector3(0, this.attractorRadius, 0); // 地面から半径分上に配置
        this.attractorSphere = new Scene11_AttractorSphere(centerPos, this.attractorRadius);
        this.attractorSphere.createThreeObjects(this.scene);
        
        // Sphereの描画をオフにする（ライトは残す）
        if (this.attractorSphere.mesh) {
            this.attractorSphere.mesh.visible = false;
        }
        
        // Sphereの移動範囲を設定
        this.attractorSphere.boxMin = this.sphereBoxMin.clone();
        this.attractorSphere.boxMax = this.sphereBoxMax.clone();
        
        // デバッグ: PointLightが正しく設定されているか確認
        if (this.attractorSphere.light) {
            console.log('✅ PointLight設定:', {
                intensity: this.attractorSphere.light.intensity,
                distance: this.attractorSphere.light.distance,
                decay: this.attractorSphere.light.decay,
                position: this.attractorSphere.light.position
            });
        }
    }
    
    /**
     * 簡易パーリンノイズ関数
     */
    noise(x, y = 0, z = 0) {
        const hash = (ix, iy, iz) => {
            const seed = Math.floor(this.noiseSeed);
            const n = ix * 12.9898 + iy * 78.233 + iz * 37.719 + seed * 43.758;
            const sinValue = Math.sin(n);
            return Math.abs(sinValue - Math.floor(sinValue));
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
     * パーティクル（瓦礫）を作成
     */
    createParticles() {
        // 基準となるジオメトリ（Sphere、詳細度を下げて軽量化）
        const geometry = new THREE.SphereGeometry(1, 16, 16);
        const material = new THREE.MeshStandardMaterial({
            color: 0x666666, // 明るいグレー
            metalness: 0.0, // 金属感を0にしてライトの反射を強く
            roughness: 0.5, // 粗さを調整してライトの影響を明確に
            wireframe: false,
            flatShading: false // スムーズシェーディングを有効にする
        });
        
        // InstancedMeshManagerを作成
        this.instancedManager = new InstancedMeshManager(
            this.scene,
            geometry,
            material,
            this.numParticles
        );
        
        // Sphereの中心位置を取得
        const sphereCenter = this.attractorSphere ? this.attractorSphere.position : new THREE.Vector3(0, this.attractorRadius, 0);
        const sphereRadius = this.attractorRadius;
        
        let particleIndex = 0;
        let smallDebrisCount = 0;
        let debrisCount = 0;
        
        // 1. 小さな瓦礫を作成（Sphereの表面に配置）
        let smallDebrisAttempts = 0;
        const maxSmallDebrisAttempts = this.numSmallDebris * 5;
        
        while (smallDebrisCount < this.numSmallDebris && smallDebrisAttempts < maxSmallDebrisAttempts && particleIndex < this.numParticles) {
            smallDebrisAttempts++;
            
            const widthX = this.SMALL_DEBRIS_SIZE_MIN + Math.random() * (this.SMALL_DEBRIS_SIZE_MAX - this.SMALL_DEBRIS_SIZE_MIN);
            const widthZ = this.SMALL_DEBRIS_SIZE_MIN + Math.random() * (this.SMALL_DEBRIS_SIZE_MAX - this.SMALL_DEBRIS_SIZE_MIN);
            const height = this.SMALL_DEBRIS_SIZE_MIN + Math.random() * (this.SMALL_DEBRIS_SIZE_MAX - this.SMALL_DEBRIS_SIZE_MIN);
                
            // Sphereの表面にランダムに配置（角度をランダマイズ）
            const theta = Math.random() * Math.PI * 2; // 水平方向の角度（完全ランダム）
            const phi = Math.random() * Math.PI; // 垂直方向の角度（完全ランダム、均等分布ではない）
            const particleRadius = Math.max(widthX, widthZ, height) / 2.0;
            const surfaceRadius = sphereRadius + particleRadius; // パーティクルのサイズを考慮
            
            const x = sphereCenter.x + surfaceRadius * Math.sin(phi) * Math.cos(theta);
            const y = sphereCenter.y + surfaceRadius * Math.cos(phi); // Y軸が上向き
            const z = sphereCenter.z + surfaceRadius * Math.sin(phi) * Math.sin(theta);
            
            const particle = this.createDebrisParticle(x, y, z, widthX, widthZ, height, particleIndex);
            particleIndex++;
            smallDebrisCount++;
        }
        
        // 2. 通常の瓦礫を作成（Sphereの表面に配置）
        let debrisAttempts = 0;
        const maxDebrisAttempts = this.numDebris * 5;
        
        while (debrisCount < this.numDebris && debrisAttempts < maxDebrisAttempts && particleIndex < this.numParticles) {
            debrisAttempts++;
            
            const widthX = this.DEBRIS_WIDTH_MIN + Math.random() * (this.DEBRIS_WIDTH_MAX - this.DEBRIS_WIDTH_MIN);
            const widthZ = this.DEBRIS_WIDTH_MIN + Math.random() * (this.DEBRIS_WIDTH_MAX - this.DEBRIS_WIDTH_MIN);
            const height = this.DEBRIS_HEIGHT_MIN + Math.random() * (this.DEBRIS_HEIGHT_MAX - this.DEBRIS_HEIGHT_MIN);
            
            // Sphereの表面にランダムに配置（角度をランダマイズ）
            const theta = Math.random() * Math.PI * 2; // 水平方向の角度（完全ランダム）
            const phi = Math.random() * Math.PI; // 垂直方向の角度（完全ランダム、均等分布ではない）
            const particleRadius = Math.max(widthX, widthZ, height) / 2.0;
            const surfaceRadius = sphereRadius + particleRadius; // パーティクルのサイズを考慮
            
            const x = sphereCenter.x + surfaceRadius * Math.sin(phi) * Math.cos(theta);
            const y = sphereCenter.y + surfaceRadius * Math.cos(phi); // Y軸が上向き
            const z = sphereCenter.z + surfaceRadius * Math.sin(phi) * Math.sin(theta);
            
            const particle = this.createDebrisParticle(x, y, z, widthX, widthZ, height, particleIndex);
            particleIndex++;
            debrisCount++;
    }
    
        this.instancedManager.markNeedsUpdate();
        this.setParticleCount(particleIndex);
        console.log(`✅ ${particleIndex}個の瓦礫をGPUインスタンシングで作成しました`);
        console.log(`   小さな瓦礫: ${smallDebrisCount}個`);
        console.log(`   通常の瓦礫: ${debrisCount}個`);
    }
    
    /**
     * 尻尾線を作成（各パーティクルに動いているベクトルと逆方向の赤い線）
     */
    createTrails() {
        // 尻尾線用のグループを作成
        this.trailGroup = new THREE.Group();
        this.scene.add(this.trailGroup);
        
        // 各パーティクル用の尻尾線メッシュを作成
        this.trailMeshes = [];
        
        for (let i = 0; i < this.numParticles; i++) {
            // 円柱のジオメトリを作成（初期長さは0、セグメント数を減らして軽量化）
            const cylinderGeometry = new THREE.CylinderGeometry(
                this.trailLineRadius,
                this.trailLineRadius,
                0.1, // 初期長さは短く
                4, // セグメント数を8→4に減らして軽量化
                1
            );
            
            // 赤い金属っぽいマテリアル（シーン2参考）
            const material = new THREE.MeshStandardMaterial({
                color: 0xff0000, // 赤色
                metalness: 0.8, // 金属感
                roughness: 0.2, // 滑らか
                emissive: 0x330000, // 弱い発光
                emissiveIntensity: 0.3
            });
            
            const trailMesh = new THREE.Mesh(cylinderGeometry, material);
            trailMesh.visible = false; // 初期状態では非表示
            this.trailGroup.add(trailMesh);
            this.trailMeshes.push(trailMesh);
        }
    }
    
    /**
     * 瓦礫パーティクルを作成
     */
    createDebrisParticle(x, y, z, widthX, widthZ, height, index) {
        if (index < 0 || index >= this.numParticles) {
            console.warn(`createDebrisParticle: index ${index} is out of range`);
            return null;
    }
    
        // 質量を計算（体積に比例）
        const volume = widthX * widthZ * height;
        const maxVolume = this.DEBRIS_WIDTH_MAX * this.DEBRIS_WIDTH_MAX * this.DEBRIS_HEIGHT_MAX;
        const minVolume = this.SMALL_DEBRIS_SIZE_MIN * this.SMALL_DEBRIS_SIZE_MIN * this.SMALL_DEBRIS_SIZE_MIN;
        const mass = THREE.MathUtils.mapLinear(volume, minVolume, maxVolume, 0.5, 20.0);
        
        this.particleMasses.push(mass);
        
        // パーティクルオブジェクトを作成
        const particle = new Particle(x, y, z);
        particle.maxForce = THREE.MathUtils.mapLinear(mass, 0.5, 20.0, 10.0, 4.0);
        particle.maxSpeed = THREE.MathUtils.mapLinear(mass, 0.5, 20.0, 20.0, 8.0);
        particle.friction = THREE.MathUtils.mapLinear(mass, 0.5, 20.0, 0.01, 0.03);
        particle.mass = mass;
        this.particles.push(particle);
        
        // サイズを保存
        this.particleSizes.push(new THREE.Vector3(widthX, height, widthZ));
        
        // 角速度と回転を初期化（ランダムな角度）
        this.particleAngularVelocities.push(new THREE.Vector3(0, 0, 0));
        const initialRotation = new THREE.Euler(
            Math.random() * Math.PI * 2, // X軸回転（ランダム）
            Math.random() * Math.PI * 2, // Y軸回転（ランダム）
            Math.random() * Math.PI * 2, // Z軸回転（ランダム）
            'XYZ'
        );
        this.particleRotations.push(initialRotation);
        
        // 初期位置とスケールを設定（Sphereなので均一なスケール）
        const radius = Math.max(widthX, widthZ, height) / 2.0; // 最大サイズを半径として使用
        const scale = new THREE.Vector3(radius, radius, radius);
        const pos = new THREE.Vector3(x, y, z);
        this.instancedManager.setMatrixAt(
            index,
            pos,
            initialRotation,
            scale
        );
        
        return particle;
    }
    
    /**
     * カメラパーティクルの距離パラメータを設定
     */
    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 800.0;  // 狭く
        cameraParticle.maxDistance = 1500.0;  // 狭く
        cameraParticle.maxDistanceReset = 1200.0;  // 狭く
        
        const cameraBoxSize = 1000.0;  // 狭く
        const cameraMinY = 400.0;  // 狭く
        const cameraMaxY = 900.0;  // 狭く
        cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSize, cameraMinY, -cameraBoxSize);
        cameraParticle.boxMax = new THREE.Vector3(cameraBoxSize, cameraMaxY, cameraBoxSize);
    }
    
    /**
     * カメラの位置を更新（SphereをLookAt）
     */
    updateCamera() {
        if (this.cameraParticles[this.currentCameraIndex]) {
            let cameraPos = this.cameraParticles[this.currentCameraIndex].getPosition();
            
            // カメラがSphereの中に入らないように制限
            if (this.attractorSphere) {
                const toCamera = new THREE.Vector3().subVectors(cameraPos, this.attractorSphere.position);
                const distance = toCamera.length();
                const minDistance = this.attractorRadius + 50.0; // Sphereの半径 + 余裕を持たせる
                
                if (distance < minDistance) {
                    // Sphereの外側に押し出す
                    const direction = toCamera.clone().normalize();
                    cameraPos = this.attractorSphere.position.clone().add(direction.multiplyScalar(minDistance));
                    // カメラパーティクルの位置も更新（次のフレームで反映される）
                    this.cameraParticles[this.currentCameraIndex].position.copy(cameraPos);
                }
            }
            
            this.camera.position.copy(cameraPos);
            
            // Sphereの位置をLookAt
            if (this.attractorSphere) {
                this.camera.lookAt(this.attractorSphere.position);
            } else {
                this.camera.lookAt(0, this.attractorRadius, 0);
            }
            this.camera.matrixWorldNeedsUpdate = false;
        }
    }
    
    /**
     * 更新処理
     */
    onUpdate(deltaTime) {
        this.time += deltaTime;
        
        // 引力Sphereの更新（Box内で制限）
        if (this.attractorSphere) {
            this.attractorSphere.update();
            
            // Boxの範囲内に制限
            const pos = this.attractorSphere.position;
            pos.x = THREE.MathUtils.clamp(pos.x, this.sphereBoxMin.x, this.sphereBoxMax.x);
            pos.y = THREE.MathUtils.clamp(pos.y, this.sphereBoxMin.y, this.sphereBoxMax.y);
            pos.z = THREE.MathUtils.clamp(pos.z, this.sphereBoxMin.z, this.sphereBoxMax.z);
            this.attractorSphere.position.copy(pos);
        }
        
        // カメラパーティクルがSphereの中に入らないように制限
        if (this.attractorSphere && this.cameraParticles) {
            for (let i = 0; i < this.cameraParticles.length; i++) {
                const cameraParticle = this.cameraParticles[i];
                const cameraPos = cameraParticle.getPosition();
                const toCamera = new THREE.Vector3().subVectors(cameraPos, this.attractorSphere.position);
                const distance = toCamera.length();
                const minDistance = this.attractorRadius + 50.0; // Sphereの半径 + 余裕を持たせる
                
                if (distance < minDistance) {
                    // Sphereの外側に押し出す
                    const direction = toCamera.clone().normalize();
                    const correctedPos = this.attractorSphere.position.clone().add(direction.multiplyScalar(minDistance));
                    cameraParticle.position.copy(correctedPos);
                }
            }
        }
        
        // パーティクルの更新
        if (!this.instancedManager || this.particles.length === 0) {
            return;
        }
        
        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i];
            const angularVel = this.particleAngularVelocities[i];
            const particleSize = this.particleSizes[i];
            const particlePos = particle.getPosition();
            
            // パフォーマンス最適化: 動いているパーティクルのみ更新
            const vel = particle.getVelocity();
            const velLength = vel.length();
            const angularVelLength = angularVel.length();
            const isMoving = velLength > 0.01 || angularVelLength > 0.001;
            
            if (!isMoving && this.attractorSphere) {
                // 静止している場合でも、引力Sphereの影響範囲内なら更新
                const toAttractor = new THREE.Vector3().subVectors(particlePos, this.attractorSphere.position);
                const distanceToAttractor = toAttractor.length();
                const influenceRadius = this.attractorRadius * 10.0; // 影響範囲（元に戻す）
                if (distanceToAttractor > influenceRadius) {
                    continue; // 影響範囲外ならスキップ
                }
            }
            
            // 重力を適用（質量に応じて重いほど強く）
            const particleMass = this.particleMasses[i];
            const massGravityMultiplier = THREE.MathUtils.mapLinear(particleMass, 0.5, 20.0, 1.0, 1.5); // 重いほど1.5倍まで
            const gravity = this.gravity.clone().multiplyScalar(massGravityMultiplier);
            particle.addForce(gravity);
            
            // 引力Sphereの引力を適用（トラック11がONの時のみ）
            if (this.attractorSphere && this.attractionEnabled) {
                const beforePos = particlePos.clone();
                this.attractorSphere.applyAttraction(particle, particleSize);
                const afterPos = particle.getPosition();
                
                // 引力による移動に応じて角速度を追加（回転効果）
                const movement = new THREE.Vector3().subVectors(afterPos, beforePos);
                if (movement.length() > 0.01) {
                    const angularPower = movement.length() * 0.01;
                    angularVel.x += movement.z * angularPower;
                    angularVel.z += -movement.x * angularPower;
                }
            }
            
            // パーティクルを更新
            particle.update();
            
            // 地面との衝突判定
            const particleHeight = particleSize.y;
            const particleBottom = particle.getPosition().y - particleHeight / 2.0;
            if (particleBottom <= this.groundY) {
                // 地面に当たったら位置を修正
                const particlePos = particle.getPosition();
                particlePos.y = this.groundY + particleHeight / 2.0;
                particle.position.copy(particlePos);
                
                // 速度を減らす（反発と摩擦）
                const vel = particle.getVelocity();
                if (vel.y < 0) {
                    vel.y *= -0.3; // 反発係数
                }
                // 質量に応じて摩擦を調整
                const groundFriction = THREE.MathUtils.mapLinear(particleMass, 0.5, 20.0, 0.98, 0.93);
                vel.x *= groundFriction;
                vel.z *= groundFriction;
                particle.velocity.copy(vel);
            }
            
            // パーティクルがSphereにめり込まないように確実にチェック・修正
            if (this.attractorSphere) {
                const updatedPos = particle.getPosition();
                const toParticle = new THREE.Vector3().subVectors(updatedPos, this.attractorSphere.position);
                const distance = toParticle.length();
                const particleRadius = Math.max(particleSize.x, particleSize.z, particleSize.y) / 2.0;
                const minDistance = this.attractorRadius + particleRadius;
                
                // めり込んでいる場合は確実に表面に押し出す
                if (distance < minDistance && distance > 0.01) {
                    const direction = toParticle.clone().normalize();
                    const surfacePos = direction.multiplyScalar(minDistance);
                    const correctedPos = this.attractorSphere.position.clone().add(surfacePos);
                    particle.position.copy(correctedPos);
        
                    // 速度を減らす（反発を完全に無くして、くっつくように）
                    const vel = particle.getVelocity();
                    
                    // Sphereに向かう方向の速度成分を完全に0にする（常に）
                    const velToSphere = direction.clone().multiplyScalar(vel.dot(direction));
                    vel.sub(velToSphere);
                    
                    // 表面での摩擦を非常に強くして、くっつくように（反発を完全に防ぐ）
                    vel.multiplyScalar(0.05); // 摩擦を非常に強く（速度を5%に減らす）
                    
                    // 念のため、再度Sphereに向かう方向の速度成分をチェックして0にする
                    const finalVelToSphere = direction.clone().multiplyScalar(vel.dot(direction));
                    if (Math.abs(finalVelToSphere.dot(direction)) > 0.001) {
                        vel.sub(finalVelToSphere);
                    }
                    
                    // 速度が非常に小さい場合は完全に0にする
                    if (vel.length() < 0.1) {
                        vel.set(0, 0, 0);
                    }
                    
                    particle.velocity.copy(vel);
                }
            }
        }
        
        // パーティクル同士の衝突判定（全ペアチェック）
        for (let i = 0; i < this.particles.length; i++) {
            const particleA = this.particles[i];
            const sizeA = this.particleSizes[i];
            const posA = particleA.getPosition();
            const velA = particleA.getVelocity();
            const massA = this.particleMasses[i];
            
            for (let j = i + 1; j < this.particles.length; j++) {
                const particleB = this.particles[j];
                const sizeB = this.particleSizes[j];
                const posB = particleB.getPosition();
                const velB = particleB.getVelocity();
                const massB = this.particleMasses[j];
                
                // AABB（Axis-Aligned Bounding Box）衝突判定
                const halfSizeA = new THREE.Vector3(sizeA.x / 2.0, sizeA.y / 2.0, sizeA.z / 2.0);
                const halfSizeB = new THREE.Vector3(sizeB.x / 2.0, sizeB.y / 2.0, sizeB.z / 2.0);
                
                const minA = new THREE.Vector3().subVectors(posA, halfSizeA);
                const maxA = new THREE.Vector3().addVectors(posA, halfSizeA);
                const minB = new THREE.Vector3().subVectors(posB, halfSizeB);
                const maxB = new THREE.Vector3().addVectors(posB, halfSizeB);
                
                // 衝突判定
                const isColliding = (
                    minA.x <= maxB.x && maxA.x >= minB.x &&
                    minA.y <= maxB.y && maxA.y >= minB.y &&
                    minA.z <= maxB.z && maxA.z >= minB.z
                );
                
                if (isColliding) {
                    // 衝突方向を計算（中心から中心へのベクトル）
                    const collisionDir = new THREE.Vector3().subVectors(posB, posA);
                    const distance = collisionDir.length();
                    
                    if (distance > 0.01) {
                        collisionDir.normalize();
                        
                        // めり込み量を計算
                        const overlapX = Math.min(maxA.x - minB.x, maxB.x - minA.x);
                        const overlapY = Math.min(maxA.y - minB.y, maxB.y - minA.y);
                        const overlapZ = Math.min(maxA.z - minB.z, maxB.z - minA.z);
                        
                        // 最小のオーバーラップ方向で分離
                        let separationDir = new THREE.Vector3(1, 0, 0);
                        let minOverlap = overlapX;
                        
                        if (overlapY < minOverlap) {
                            minOverlap = overlapY;
                            separationDir = new THREE.Vector3(0, 1, 0);
                        }
                        if (overlapZ < minOverlap) {
                            minOverlap = overlapZ;
                            separationDir = new THREE.Vector3(0, 0, 1);
                        }
                        
                        // 分離方向を決定（衝突方向に基づく）
                        if (separationDir.x !== 0) {
                            separationDir.x = collisionDir.x > 0 ? -1 : 1;
                        } else if (separationDir.y !== 0) {
                            separationDir.y = collisionDir.y > 0 ? -1 : 1;
                        } else {
                            separationDir.z = collisionDir.z > 0 ? -1 : 1;
                        }
                        
                        // 質量比で分離量を分配
                        const totalMass = massA + massB;
                        const separationAmount = minOverlap * 0.5; // 半分ずつ分離
                        const separationA = separationDir.clone().multiplyScalar(separationAmount * (massB / totalMass));
                        const separationB = separationDir.clone().multiplyScalar(-separationAmount * (massA / totalMass));
                        
                        // 位置を修正
                        particleA.position.add(separationA);
                        particleB.position.add(separationB);
                        
                        // 速度を反発（弾性衝突）
                        const relativeVel = new THREE.Vector3().subVectors(velB, velA);
                        const velAlongNormal = relativeVel.dot(collisionDir);
                        
                        // 離れる方向に動いている場合は衝突しない
                        if (velAlongNormal > 0) continue;
                        
                        // 反発係数
                        const restitution = 0.3; // 非弾性衝突（エネルギーが失われる）
                        
                        // 衝突後の速度を計算
                        const impulse = (1.0 + restitution) * velAlongNormal / totalMass;
                        const impulseVec = collisionDir.clone().multiplyScalar(impulse);
                        
                        const newVelA = velA.clone().add(impulseVec.clone().multiplyScalar(massB));
                        const newVelB = velB.clone().sub(impulseVec.clone().multiplyScalar(massA));
                        
                        particleA.velocity.copy(newVelA);
                        particleB.velocity.copy(newVelB);
                    }
                }
            }
        }
        
        // 角速度と回転の更新
        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i];
            const angularVel = this.particleAngularVelocities[i];
            const rotation = this.particleRotations[i];
            const particleSize = this.particleSizes[i];
            
            // 運動方向に対して長辺（Y軸）が垂直になるように回転を設定
            const velocity = particle.getVelocity();
            const speed = velocity.length();
            
            if (speed > 0.1) {
                // 速度ベクトルを正規化（forward方向）
                const forward = velocity.clone().normalize();
                
                // Y軸（up方向）を基準に、forward方向に対して垂直になるように回転を計算
                // forward方向をZ軸として扱い、Y軸をup方向として扱う
                const up = new THREE.Vector3(0, 1, 0);
                const right = new THREE.Vector3().crossVectors(forward, up).normalize();
                
                // rightとforwardが平行な場合（速度がY軸方向）は、別のupベクトルを使う
                if (right.length() < 0.1) {
                    const tempUp = new THREE.Vector3(1, 0, 0);
                    right.crossVectors(forward, tempUp).normalize();
                }
                
                // 新しいupベクトルを計算
                const newUp = new THREE.Vector3().crossVectors(right, forward).normalize();
                
                // 回転行列を作成（forwardをZ軸、newUpをY軸、rightをX軸として）
                const quaternion = new THREE.Quaternion();
                const matrix = new THREE.Matrix4();
                
                // 行列の各列を設定
                matrix.makeBasis(right, newUp, forward);
                quaternion.setFromRotationMatrix(matrix);
                
                // QuaternionからEulerに変換（スムーズに補間するため）
                const targetEuler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
                
                // 現在の回転から目標回転へスムーズに補間
                const lerpFactor = 0.3; // 補間係数（0.0-1.0、大きいほど速く追従）
                rotation.x = THREE.MathUtils.lerp(rotation.x, targetEuler.x, lerpFactor);
                rotation.y = THREE.MathUtils.lerp(rotation.y, targetEuler.y, lerpFactor);
                rotation.z = THREE.MathUtils.lerp(rotation.z, targetEuler.z, lerpFactor);
            } else {
                // 速度が小さい場合は角速度で回転
                const angularFriction = 0.98;
                angularVel.multiplyScalar(angularFriction);
                
                // 回転を累積
                rotation.x += angularVel.x * 0.01;
                rotation.y += angularVel.y * 0.01;
                rotation.z += angularVel.z * 0.01;
            }
            
            // インスタンスのマトリックスを更新（Sphereなので均一なスケール）
            const finalPos = particle.getPosition();
            const radius = Math.max(particleSize.x, particleSize.y, particleSize.z) / 2.0; // 最大サイズを半径として使用
            const scale = new THREE.Vector3(radius, radius, radius);
            this.instancedManager.setMatrixAt(i, finalPos, rotation, scale);
            
            // 尻尾線を更新
            this.updateTrail(i, particle, particleSize);
        }
        
        // インスタンスマトリックスを更新
        this.instancedManager.markNeedsUpdate();
    }
    
    /**
     * 尻尾線を更新（動いているベクトルと逆方向に赤い線を表示）
     */
    updateTrail(index, particle, particleSize) {
        if (index >= this.trailMeshes.length) return;
        
        const trailMesh = this.trailMeshes[index];
        const velocity = particle.getVelocity();
        const speed = velocity.length();
        
        // 速度が小さい場合は非表示
        if (speed < 0.1) {
            trailMesh.visible = false;
            return;
        }
        
        // 速度ベクトルと逆方向を計算
        const reverseDirection = velocity.clone().normalize().multiplyScalar(-1);
        
        // 速度の大きさに応じて線の長さを計算（最大maxTrailLengthまで）
        const trailLength = Math.min(speed * 2.0, this.maxTrailLength);
        
        // パーティクルの位置
        const particlePos = particle.getPosition();
        const particleRadius = Math.max(particleSize.x, particleSize.y, particleSize.z) / 2.0;
        
        // 尻尾の開始位置（パーティクルの中心から少し後ろ）
        const trailStart = particlePos.clone().add(reverseDirection.clone().multiplyScalar(particleRadius));
        // 尻尾の終了位置
        const trailEnd = trailStart.clone().add(reverseDirection.clone().multiplyScalar(trailLength));
        
        // 円柱のジオメトリを更新（ジオメトリを再利用して軽量化）
        const distance = trailStart.distanceTo(trailEnd);
        if (distance > 0.01) {
            // ジオメトリを再利用（毎フレーム破棄・再作成しない）
            // 長さが変わった場合のみスケールで調整
            if (trailMesh.geometry) {
                // 既存のジオメトリの長さを取得
                const currentLength = trailMesh.geometry.parameters.height;
                if (Math.abs(currentLength - distance) > 0.1) {
                    // 長さが大きく変わった場合のみ再作成
                    trailMesh.geometry.dispose();
                    const cylinderGeometry = new THREE.CylinderGeometry(
                        this.trailLineRadius,
                        this.trailLineRadius,
                        distance,
                        4, // セグメント数を8→4に減らして軽量化
                        1
                    );
                    trailMesh.geometry = cylinderGeometry;
                }
            } else {
                // 初回のみ作成
                const cylinderGeometry = new THREE.CylinderGeometry(
                    this.trailLineRadius,
                    this.trailLineRadius,
                    distance,
                    4, // セグメント数を8→4に減らして軽量化
                    1
                );
                trailMesh.geometry = cylinderGeometry;
            }
            
            // 線の方向に回転
            const up = new THREE.Vector3(0, 1, 0);
            const direction = reverseDirection.clone().normalize();
            const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
            trailMesh.setRotationFromQuaternion(quaternion);
            
            // 線の中心位置を設定
            const midPoint = new THREE.Vector3().addVectors(trailStart, trailEnd).multiplyScalar(0.5);
            trailMesh.position.copy(midPoint);
            
            trailMesh.visible = true;
        } else {
            trailMesh.visible = false;
        }
    }
    
    /**
     * OSCメッセージの処理（トラック5-9）
     */
    handleTrackNumber(trackNumber, message) {
        const args = message.args || [];
        
        // トラック5: Sphereに力を加えて運動させる + 引力をON/OFF
        if (trackNumber === 5) {
            if (this.attractorSphere) {
                // 引力をONにする
                this.attractionEnabled = true;
                // Sphereに力を加える
                this.attractorSphere.applyRandomForce();
                console.log('[Scene11] トラック5: 引力をON、Sphereに力を加えました');
            }
        }
        // トラック8: Sphereの光と色を同期（velocityで光の強度と色を制御）
        else if (trackNumber === 8) {
            if (this.attractorSphere) {
                const velocity = args[0] !== undefined ? args[0] : 127.0; // デフォルトは最大
                const noteNumber = args[1] !== undefined ? args[1] : 64.0; // デフォルトは中央
                
                // velocity (0-127) を正規化 (0.0-1.0) に変換
                const normalized = Math.max(0, Math.min(127, velocity)) / 127.0;
                
                // 光の強度を計算（velocity=0で0、velocity=127で最大）
                const lightIntensity = normalized * 50.0; // 最大50.0まで
                const emissiveIntensity = normalized * 3.0; // 最大3.0まで
                
                // 色を計算（velocity=0で黒、velocity=127で白）
                const colorValue = Math.floor(normalized * 255);
                const colorHex = (colorValue << 16) | (colorValue << 8) | colorValue; // RGBを同じ値に
                
                // PointLightの強度と色を更新
                if (this.attractorSphere.light) {
                    this.attractorSphere.light.intensity = lightIntensity;
                    this.attractorSphere.light.color.setHex(colorHex);
                }
                
                // Meshの色、emissive、emissiveIntensityを更新
                if (this.attractorSphere.mesh && this.attractorSphere.mesh.material) {
                    this.attractorSphere.mesh.material.color.setHex(colorHex);
                    this.attractorSphere.mesh.material.emissive.setHex(colorHex);
                    this.attractorSphere.mesh.material.emissiveIntensity = emissiveIntensity;
                }
                
                console.log(`[Scene11] トラック8: 光と色を同期 (velocity: ${velocity}, intensity: ${lightIntensity.toFixed(2)}, color: #${colorHex.toString(16).padStart(6, '0')})`);
            }
        }
    }
    
    /**
     * リセット処理
     */
    reset() {
        super.reset();
        
        // パーティクルをリセット
        if (!this.instancedManager || this.particles.length === 0) {
            return;
        }
        
        // Sphereの中心位置を取得
        const sphereCenter = this.attractorSphere ? this.attractorSphere.position : new THREE.Vector3(0, this.attractorRadius, 0);
        const sphereRadius = this.attractorRadius;
        
        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i];
            const particleSize = this.particleSizes[i];
            particle.reset();
            
            // Sphereの表面に再配置（角度をランダマイズ）
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI; // 完全ランダム
            const particleRadius = Math.max(particleSize.x, particleSize.z, particleSize.y) / 2.0;
            const surfaceRadius = sphereRadius + particleRadius;
            
            const x = sphereCenter.x + surfaceRadius * Math.sin(phi) * Math.cos(theta);
            const y = sphereCenter.y + surfaceRadius * Math.cos(phi); // Y軸が上向き
            const z = sphereCenter.z + surfaceRadius * Math.sin(phi) * Math.sin(theta);
            particle.position.set(x, y, z);
            
            // 角速度と回転をリセット（ランダムな角度）
            this.particleAngularVelocities[i].set(0, 0, 0);
            this.particleRotations[i].set(
                Math.random() * Math.PI * 2, // X軸回転（ランダム）
                Math.random() * Math.PI * 2, // Y軸回転（ランダム）
                Math.random() * Math.PI * 2, // Z軸回転（ランダム）
                'XYZ'
            );
            
            // インスタンスのマトリックスを更新（Sphereなので均一なスケール）
            const radius = Math.max(particleSize.x, particleSize.y, particleSize.z) / 2.0; // 最大サイズを半径として使用
            const scale = new THREE.Vector3(radius, radius, radius);
            const finalPos = particle.getPosition();
            const rotation = this.particleRotations[i];
            this.instancedManager.setMatrixAt(i, finalPos, rotation, scale);
        }
        
        this.instancedManager.markNeedsUpdate();
        
        console.log('🔄 シーンをリセットしました');
    }
    
    /**
     * クリーンアップ処理
     */
    dispose() {
        console.log('Scene11.dispose: クリーンアップ開始');
        
        // 引力Sphereを破棄
        if (this.attractorSphere) {
            this.attractorSphere.dispose(this.scene);
            this.attractorSphere = null;
        }
        
        // Boxメッシュを破棄
        if (this.sphereBoxMesh) {
            this.scene.remove(this.sphereBoxMesh);
            this.sphereBoxMesh.geometry.dispose();
            this.sphereBoxMesh.material.dispose();
            this.sphereBoxMesh = null;
        }
        
        // インスタンスメッシュマネージャーを破棄
        if (this.instancedManager) {
            this.instancedManager.dispose();
            this.instancedManager = null;
        }
        
        // 尻尾線を破棄
        if (this.trailGroup) {
            this.trailMeshes.forEach(trailMesh => {
                if (trailMesh.geometry) {
                    trailMesh.geometry.dispose();
                }
                if (trailMesh.material) {
                    trailMesh.material.dispose();
                }
            });
            this.scene.remove(this.trailGroup);
            this.trailGroup = null;
            this.trailMeshes = [];
        }
        
        // パーティクルをクリア
        this.particles = [];
        this.particleAngularVelocities = [];
        this.particleRotations = [];
        this.particleSizes = [];
        this.particleMasses = [];
        
        console.log('Scene11.dispose: クリーンアップ完了');
        
        super.dispose();
    }
}
