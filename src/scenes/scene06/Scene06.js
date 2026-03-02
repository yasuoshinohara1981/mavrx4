/**
 * Scene06: パーティクル爆発テストシーン
 * 5000個のSphereパーティクルで爆発の力をテスト
 */

import { SceneBase } from '../SceneBase.js';
import { Particle } from '../../lib/Particle.js';
import { Scene06_Explosion } from './Scene06_Explosion.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export class Scene06 extends SceneBase {
    constructor(renderer, camera) {
        super(renderer, camera);
        this.title = 'mathym | 07-XPL';
        this.sceneNumber = 6;
        this.kitNo = 23;  // キット番号を設定
        
        // パーティクル設定
        this.numParticles = 120000;
        this.particles = [];
        this.particleMeshes = [];
        this.particleAngularVelocities = []; // 各パーティクルの角速度
        this.particleRotations = []; // 各パーティクルの累積回転（オイラー角）
        this.particleSizes = []; // 各パーティクルのサイズ（widthX, widthZ, height）
        this.particleMasses = []; // 各パーティクルの質量
        this.instancedManager = null; // GPUインスタンシング管理クラス
        this.particleNeedsUpdate = []; // 各パーティクルが更新が必要かどうか（パフォーマンス最適化）
        
        // 建物のサイズパラメータ
        this.BUILDING_WIDTH_MIN = 2.5;
        this.BUILDING_WIDTH_MAX = 28.0;
        this.BUILDING_HEIGHT_MIN = 15.0;
        this.BUILDING_HEIGHT_MAX = 200.0;
        this.LANDMARK_WIDTH_MIN = 40.0;
        this.LANDMARK_WIDTH_MAX = 65.0;
        this.LANDMARK_HEIGHT_MIN = 320.0;
        this.LANDMARK_HEIGHT_MAX = 480.0;
        // 中心部の巨大ビル（ランドマークよりさらに大きく、極端に幅広）
        this.CENTER_LANDMARK_WIDTH_MIN = 200.0;
        this.CENTER_LANDMARK_WIDTH_MAX = 400.0;
        this.CENTER_LANDMARK_HEIGHT_MIN = 700.0;
        this.CENTER_LANDMARK_HEIGHT_MAX = 1200.0;
        this.SMALL_BOX_SIZE_MIN = 2.0;
        this.SMALL_BOX_SIZE_MAX = 4.0;
        // 低い建物群のサイズパラメータ
        this.LOW_BUILDING_WIDTH_MIN = 5.0;
        this.LOW_BUILDING_WIDTH_MAX = 20.0;
        this.LOW_BUILDING_HEIGHT_MIN = 5.0;
        this.LOW_BUILDING_HEIGHT_MAX = 30.0;
        
        // 建物の種類の割合（長めのビルを減らし、小さめのBoxを増やす）
        this.numCenterLandmarks = 15; // 中心部の巨大ビル（固定数、バリエーション豊富に）
        this.numLandmarks = Math.min(5, Math.floor(this.numParticles * 0.00005)); // 5本未満（さらに減らす）
        const remainingParticles = this.numParticles - this.numLandmarks - this.numCenterLandmarks;
        this.numLowBuildings = Math.floor(remainingParticles * 0.70); // 70%（低層ビル）
        const afterLowBuildings = remainingParticles - this.numLowBuildings;
        this.numSmallBoxes = Math.floor(afterLowBuildings * 0.95); // 残りの95%（小さめのBoxを大幅に増やす）
        this.numBuildings = afterLowBuildings - this.numSmallBoxes; // 残り（約1.5%、長めのビルを大幅に減らす）
        
        // ノイズ用のシード
        this.noiseSeed = Math.random() * 1000.0;
        
        // 爆発設定
        this.explosions = []; // 複数の爆発を管理
        this.explosionLights = []; // 爆発のポイントライト（最大8個）
        this.maxLights = 8; // 同時ライトの最大数
        
        // 時間変数
        this.time = 0.0;
        
        // 地面設定
        this.groundY = 0.0;
        this.groundRadius = 5000.0; // 分布範囲と同じサイズ
        
        // 重力設定
        this.gravity = new THREE.Vector3(0, -3.5, 0); // 下向きの重力（適度な速度）
        
        // ノイズベースの地形システム（等高線・島感）
        this.noiseScale = 0.002; // ノイズのスケール（小さいほど細かい地形、大きく広がる）
        this.noiseThreshold = 0.30; // ノイズの閾値（この値以上ならビルを配置、島の高さ）0.35 → 0.15に下げた（ビルを立てる閾値を下げる）
        this.noiseOctaves = 3; // ノイズのオクターブ数（地形の詳細度）
        
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
        
        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
    }
    
    async setup() {
        await super.setup();
        
        // カメラパーティクルの距離パラメータを再設定（親クラスで設定された後に上書き）
        if (this.cameraParticles) {
            for (const cameraParticle of this.cameraParticles) {
                this.setupCameraParticleDistance(cameraParticle);
            }
        }
        
        // レンダラーでClippingPlaneを有効化（爆発sphereの地面クリッピング用）
        this.renderer.localClippingEnabled = true;
        
        // ライトを設定
        this.setupLights();
        
        // 地面を作成
        this.createGround();
        
        // パーティクルを作成
        this.createParticles();
        
        // 色収差エフェクトを初期化（非同期で実行、重い処理を後回し）
        // グリッチエフェクトはinitChromaticAberration内で初期化される
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
     * 地面を作成（円形のグリッド）
     */
    createGround() {
        // 白い線のマテリアル
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x888888,
            transparent: false,
            opacity: 1.0
        });
        
        // 同心円の線
        const rings = 20; // 同心円の数
        const segments = 40; // 各円のセグメント数（放射状の線の数）
        
        for (let i = 1; i <= rings; i++) {
            const radius = (this.groundRadius / rings) * i;
            const points = [];
            for (let j = 0; j <= segments; j++) {
                const angle = (j / segments) * Math.PI * 2;
                const x = radius * Math.cos(angle);
                const z = radius * Math.sin(angle);
                points.push(new THREE.Vector3(x, this.groundY + 0.1, z));
            }
            const ringGeometry = new THREE.BufferGeometry().setFromPoints(points);
            const ring = new THREE.Line(ringGeometry, lineMaterial);
            ring.renderOrder = -1; // HUDより後ろに描画されるように
            this.scene.add(ring);
        }
        
        // 放射状の線（中心から外側へ）
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const x1 = 0;
            const z1 = 0;
            const x2 = this.groundRadius * Math.cos(angle);
            const z2 = this.groundRadius * Math.sin(angle);
            
            const points = [
                new THREE.Vector3(x1, this.groundY + 0.1, z1),
                new THREE.Vector3(x2, this.groundY + 0.1, z2)
            ];
            
            const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(lineGeometry, lineMaterial);
            line.renderOrder = -1; // HUDより後ろに描画されるように
            this.scene.add(line);
        }
    }
    
    /**
     * ノイズベースの地形高さを取得（等高線・島感）
     * @param {number} x - X座標
     * @param {number} z - Z座標
     * @returns {number} - ノイズ値（0.0〜1.0）
     */
    getTerrainNoise(x, z) {
        let noiseValue = 0.0;
        let amplitude = 1.0;
        let frequency = 1.0;
        let maxValue = 0.0;
        
        // オクターブノイズ（複数の周波数を重ね合わせて地形の詳細度を上げる）
        for (let i = 0; i < this.noiseOctaves; i++) {
            const nx = x * this.noiseScale * frequency;
            const nz = z * this.noiseScale * frequency;
            noiseValue += this.noise(nx, nz, 0) * amplitude;
            maxValue += amplitude;
            amplitude *= 0.5; // 各オクターブで振幅を半分に
            frequency *= 2.0; // 各オクターブで周波数を倍に
        }
        
        // 正規化（0.0〜1.0の範囲に）
        return noiseValue / maxValue;
    }
    
    /**
     * 指定位置が建物を配置できる高さ（島）かどうかをチェック
     * @param {number} x - X座標
     * @param {number} z - Z座標
     * @returns {boolean} - 建物を配置できる高さならtrue
     */
    canPlaceBuilding(x, z) {
        const noiseValue = this.getTerrainNoise(x, z);
        return noiseValue >= this.noiseThreshold;
    }
    
    /**
     * パーティクルを作成（GPUインスタンシング使用、3種類の建物）
     */
    createParticles() {
        // 基準となるジオメトリ（1x1x1のBox、スケールでサイズを変える）
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.3,
            roughness: 0.7,
            wireframe: false
        });
        
        // 線用のマテリアル（エッジを強調）
        const wireframeMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000, // 黒
            wireframe: true,
            transparent: true,
            opacity: 0.8, // より不透明に
            depthTest: true,
            depthWrite: false, // 深度書き込みを無効にして、メインメッシュの上に描画
            side: THREE.DoubleSide
        });
        
        // InstancedMeshManagerを作成（GPUインスタンシング）
        this.instancedManager = new InstancedMeshManager(
            this.scene,
            geometry,
            material,
            this.numParticles,
            {
                wireframeMaterial: wireframeMaterial,
                wireframeRenderOrder: 1
            }
        );
        
        // 建物の生成範囲（もっと広く分布）
        const spawnRadius = 5000.0;
        
        let particleIndex = 0;
        let lowBuildingCount = 0;
        let smallBoxCount = 0;
        let buildingCount = 0;
        let landmarkCount = 0;
        let centerLandmarkCount = 0;
        
        // 1. 低い建物群を作成（一番確率が高い、ノイズベースの地形に配置）
        let lowBuildingAttempts = 0;
        const maxLowBuildingAttempts = this.numLowBuildings * 5; // 最大試行回数
        
        while (lowBuildingCount < this.numLowBuildings && lowBuildingAttempts < maxLowBuildingAttempts && particleIndex < this.numParticles) {
            lowBuildingAttempts++;
            
            const widthX = this.LOW_BUILDING_WIDTH_MIN + Math.random() * (this.LOW_BUILDING_WIDTH_MAX - this.LOW_BUILDING_WIDTH_MIN);
            const widthZ = this.LOW_BUILDING_WIDTH_MIN + Math.random() * (this.LOW_BUILDING_WIDTH_MAX - this.LOW_BUILDING_WIDTH_MIN);
            const height = this.LOW_BUILDING_HEIGHT_MIN + Math.random() * (this.LOW_BUILDING_HEIGHT_MAX - this.LOW_BUILDING_HEIGHT_MIN);
            
            // ランダムな位置を生成
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * spawnRadius;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            // ノイズベースの地形チェック（島の高さ以上なら配置）
            if (!this.canPlaceBuilding(x, z)) {
                continue; // 低地（海）なのでスキップ
            }
            
            const y = this.groundY + height / 2.0; // 地面の上
            
            const particle = this.createBuildingParticle(x, y, z, widthX, widthZ, height, particleIndex);
            particleIndex++;
            lowBuildingCount++;
        }
        
        // 2. 小さいBoxを作成（ノイズベースの地形に配置、島の高さ以上なら配置）
        let smallBoxAttempts = 0;
        const maxSmallBoxAttempts = this.numSmallBoxes * 5;
        
        while (smallBoxCount < this.numSmallBoxes && smallBoxAttempts < maxSmallBoxAttempts && particleIndex < this.numParticles) {
            smallBoxAttempts++;
            
            const widthX = this.SMALL_BOX_SIZE_MIN + Math.random() * (this.SMALL_BOX_SIZE_MAX - this.SMALL_BOX_SIZE_MIN);
            const widthZ = this.SMALL_BOX_SIZE_MIN + Math.random() * (this.SMALL_BOX_SIZE_MAX - this.SMALL_BOX_SIZE_MIN);
            const height = this.SMALL_BOX_SIZE_MIN + Math.random() * (this.SMALL_BOX_SIZE_MAX - this.SMALL_BOX_SIZE_MIN);
            
            // ランダムな位置を生成
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * spawnRadius;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            // ノイズベースの地形チェック（島の高さ以上なら配置）
            if (!this.canPlaceBuilding(x, z)) {
                continue; // 低地（海）なのでスキップ
            }
            
            const y = this.groundY + height / 2.0; // 地面の上
            
            const particle = this.createBuildingParticle(x, y, z, widthX, widthZ, height, particleIndex);
            particleIndex++;
            smallBoxCount++;
        }
        
        // 3. 通常のビルを作成（ノイズベースの地形に配置、端っこに行くほど低層ビルに変換）
        let buildingAttempts = 0;
        const maxBuildingAttempts = this.numBuildings * 10; // 端っこで低層ビルに変換されるため試行回数を増やす
        
        while (buildingCount < this.numBuildings && buildingAttempts < maxBuildingAttempts && particleIndex < this.numParticles) {
            buildingAttempts++;
            
            // ランダムな位置を生成
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * spawnRadius;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            // ノイズベースの地形チェック（島の高さ以上なら配置）
            if (!this.canPlaceBuilding(x, z)) {
                continue; // 低地（海）なのでスキップ
            }
            
            // 中心からの距離に応じて低層ビルに変換する確率を計算
            const distanceFromCenter = Math.sqrt(x * x + z * z);
            const normalizedDistance = distanceFromCenter / spawnRadius; // 0.0（中心）〜1.0（端）
            const lowBuildingProbability = normalizedDistance * 0.8; // 端っこに行くほど80%まで低層ビルに変換
            
            // 端っこに行くほど低層ビルに変換
            if (Math.random() < lowBuildingProbability) {
                // 低層ビルとして配置
                const widthX = this.LOW_BUILDING_WIDTH_MIN + Math.random() * (this.LOW_BUILDING_WIDTH_MAX - this.LOW_BUILDING_WIDTH_MIN);
                const widthZ = this.LOW_BUILDING_WIDTH_MIN + Math.random() * (this.LOW_BUILDING_WIDTH_MAX - this.LOW_BUILDING_WIDTH_MIN);
                const height = this.LOW_BUILDING_HEIGHT_MIN + Math.random() * (this.LOW_BUILDING_HEIGHT_MAX - this.LOW_BUILDING_HEIGHT_MIN);
                const y = this.groundY + height / 2.0;
                const particle = this.createBuildingParticle(x, y, z, widthX, widthZ, height, particleIndex);
                particleIndex++;
                lowBuildingCount++; // 低層ビルとしてカウント
                continue; // 通常のビルとしてはカウントしない
            }
            
            // ノイズで建物密度を調整（密集エリアと疎なエリアを作る）
            const densityNoiseScale = 0.01;
            const densityNoiseValue = this.noise(x * densityNoiseScale, z * densityNoiseScale, 100);
            if (densityNoiseValue < 0.3) {
                // 密度が低いエリアはスキップ
                continue;
            }
            
            const widthX = this.BUILDING_WIDTH_MIN + Math.random() * (this.BUILDING_WIDTH_MAX - this.BUILDING_WIDTH_MIN);
            const widthZ = this.BUILDING_WIDTH_MIN + Math.random() * (this.BUILDING_WIDTH_MAX - this.BUILDING_WIDTH_MIN);
            const height = this.BUILDING_HEIGHT_MIN + Math.random() * (this.BUILDING_HEIGHT_MAX - this.BUILDING_HEIGHT_MIN);
            
            const y = this.groundY + height / 2.0; // 地面の上
            
            const particle = this.createBuildingParticle(x, y, z, widthX, widthZ, height, particleIndex);
            particleIndex++;
            buildingCount++;
        }
        
        // 4. 中心部の巨大ビルを作成（最も中心部に配置、ランドマークよりさらに大きく）
        let centerLandmarkAttempts = 0;
        const maxCenterLandmarkAttempts = this.numCenterLandmarks * 20;
        
        while (centerLandmarkCount < this.numCenterLandmarks && centerLandmarkAttempts < maxCenterLandmarkAttempts && particleIndex < this.numParticles) {
            centerLandmarkAttempts++;
            
            // 中心部のランダムな位置を生成（半径の20%以内）
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * spawnRadius * 0.2; // 中心部（半径の20%以内）
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            // ノイズベースの地形チェック（島の高さ以上なら配置）
            if (!this.canPlaceBuilding(x, z)) {
                continue; // 低地（海）なのでスキップ
            }
            
            // バリエーション豊富な形状を生成
            const shapeType = Math.random();
            let widthX, widthZ;
            
            if (shapeType < 0.33) {
                // 幅広のビル（幅Xが大きく、幅Zが小さい）
                widthX = this.CENTER_LANDMARK_WIDTH_MIN + Math.random() * (this.CENTER_LANDMARK_WIDTH_MAX - this.CENTER_LANDMARK_WIDTH_MIN);
                widthZ = this.CENTER_LANDMARK_WIDTH_MIN * 0.5 + Math.random() * (this.CENTER_LANDMARK_WIDTH_MIN * 0.5);
            } else if (shapeType < 0.66) {
                // 長方形のビル（幅Xと幅Zが大きく異なる）
                if (Math.random() < 0.5) {
                    widthX = this.CENTER_LANDMARK_WIDTH_MIN + Math.random() * (this.CENTER_LANDMARK_WIDTH_MAX - this.CENTER_LANDMARK_WIDTH_MIN);
                    widthZ = this.CENTER_LANDMARK_WIDTH_MIN * 0.6 + Math.random() * (this.CENTER_LANDMARK_WIDTH_MIN * 0.4);
                } else {
                    widthX = this.CENTER_LANDMARK_WIDTH_MIN * 0.6 + Math.random() * (this.CENTER_LANDMARK_WIDTH_MIN * 0.4);
                    widthZ = this.CENTER_LANDMARK_WIDTH_MIN + Math.random() * (this.CENTER_LANDMARK_WIDTH_MAX - this.CENTER_LANDMARK_WIDTH_MIN);
                }
            } else {
                // 正方形に近いビル（幅Xと幅Zが近い）
                const baseSize = this.CENTER_LANDMARK_WIDTH_MIN + Math.random() * (this.CENTER_LANDMARK_WIDTH_MAX - this.CENTER_LANDMARK_WIDTH_MIN);
                const variation = baseSize * 0.2; // 20%のバリエーション
                widthX = baseSize - variation / 2 + Math.random() * variation;
                widthZ = baseSize - variation / 2 + Math.random() * variation;
            }
            
            const height = this.CENTER_LANDMARK_HEIGHT_MIN + Math.random() * (this.CENTER_LANDMARK_HEIGHT_MAX - this.CENTER_LANDMARK_HEIGHT_MIN);
            
            const y = this.groundY + height / 2.0; // 地面の上
            
            const particle = this.createBuildingParticle(x, y, z, widthX, widthZ, height, particleIndex);
            particleIndex++;
            centerLandmarkCount++;
        }
        
        // 5. ランドマークを作成（ノイズベースの地形に配置、中心寄り）
        let landmarkAttempts = 0;
        const maxLandmarkAttempts = this.numLandmarks * 10;
        
        while (landmarkCount < this.numLandmarks && landmarkAttempts < maxLandmarkAttempts && particleIndex < this.numParticles) {
            landmarkAttempts++;
            
            // 中心寄りのランダムな位置を生成
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * spawnRadius * 0.5; // 中心寄り
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            // ノイズベースの地形チェック（島の高さ以上なら配置）
            if (!this.canPlaceBuilding(x, z)) {
                continue; // 低地（海）なのでスキップ
            }
            
            const widthX = this.LANDMARK_WIDTH_MIN + Math.random() * (this.LANDMARK_WIDTH_MAX - this.LANDMARK_WIDTH_MIN);
            const widthZ = this.LANDMARK_WIDTH_MIN + Math.random() * (this.LANDMARK_WIDTH_MAX - this.LANDMARK_WIDTH_MIN);
            const height = this.LANDMARK_HEIGHT_MIN + Math.random() * (this.LANDMARK_HEIGHT_MAX - this.LANDMARK_HEIGHT_MIN);
            
            const y = this.groundY + height / 2.0; // 地面の上
            
            const particle = this.createBuildingParticle(x, y, z, widthX, widthZ, height, particleIndex);
            particleIndex++;
            landmarkCount++;
        }
        
        this.instancedManager.markNeedsUpdate();
        this.setParticleCount(particleIndex);
    }
    
    /**
     * 簡易パーリンノイズ関数（Processingのnoise()に近い）
     */
    noise(x, y = 0, z = 0) {
        // Math.sin()を使ったシンプルなハッシュ関数
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
        
        // スムーズステップ補間
        const u = fX * fX * (3.0 - 2.0 * fX);
        const v = fY * fY * (3.0 - 2.0 * fY);
        const w = fZ * fZ * (3.0 - 2.0 * fZ);
        
        // 8つのコーナーのハッシュ値
        const a = hash(iX, iY, iZ);
        const b = hash(iX + 1, iY, iZ);
        const c = hash(iX, iY + 1, iZ);
        const d = hash(iX + 1, iY + 1, iZ);
        const e = hash(iX, iY, iZ + 1);
        const f = hash(iX + 1, iY, iZ + 1);
        const g = hash(iX, iY + 1, iZ + 1);
        const h = hash(iX + 1, iY + 1, iZ + 1);
        
        // 線形補間
        const x1 = a + (b - a) * u;
        const x2 = c + (d - c) * u;
        const y1 = x1 + (x2 - x1) * v;
        
        const x3 = e + (f - e) * u;
        const x4 = g + (h - g) * u;
        const y2 = x3 + (x4 - x3) * v;
        
        return y1 + (y2 - y1) * w;
    }
    
    /**
     * 建物パーティクルを作成（共通処理）
     */
    createBuildingParticle(x, y, z, widthX, widthZ, height, index) {
        // 範囲チェック
        if (index < 0 || index >= this.numParticles) {
            console.warn(`createBuildingParticle: index ${index} is out of range (0-${this.numParticles - 1})`);
            return null;
        }
        
        // 質量を計算（体積に比例、ただし高さも考慮して長めのビルを重くする）
        const volume = widthX * widthZ * height;
        const maxVolume = this.LANDMARK_WIDTH_MAX * this.LANDMARK_WIDTH_MAX * this.LANDMARK_HEIGHT_MAX;
        const minVolume = this.SMALL_BOX_SIZE_MIN * this.SMALL_BOX_SIZE_MIN * this.SMALL_BOX_SIZE_MIN;
        
        // 基本質量（体積に比例）
        let mass = THREE.MathUtils.mapLinear(volume, minVolume, maxVolume, 1.5, 100.0);
        
        // 長めのビル（BUILDING）の場合は高さを考慮して質量を増やす
        // BUILDING_HEIGHT_MIN以上で、BUILDING_WIDTH_MAX以下の場合は長めのビルと判定
        if (height >= this.BUILDING_HEIGHT_MIN && widthX <= this.BUILDING_WIDTH_MAX && widthZ <= this.BUILDING_WIDTH_MAX) {
            // 高さに応じて質量を増やす（高さが高いほど重く）
            const heightFactor = (height - this.BUILDING_HEIGHT_MIN) / (this.BUILDING_HEIGHT_MAX - this.BUILDING_HEIGHT_MIN);
            // 高さに応じて1.5倍〜2.5倍まで質量を増やす
            const massMultiplier = 1.5 + heightFactor * 1.0; // 1.5〜2.5倍
            mass *= massMultiplier;
        }
        
        this.particleMasses.push(mass);
        
        // パーティクルオブジェクトを作成
        const particle = new Particle(x, y, z);
        // 物理パラメータを質量に応じて調整（重いほど動きにくい）
        // 質量の範囲を200.0まで拡張（長めのビルが重くなるため）
        const maxMass = 200.0;
        particle.maxForce = THREE.MathUtils.mapLinear(mass, 1.5, maxMass, 10.0, 4.0); // 重いほど力が弱い
        particle.maxSpeed = THREE.MathUtils.mapLinear(mass, 1.5, maxMass, 20.0, 8.0); // 重いほど速度が遅い
        particle.friction = THREE.MathUtils.mapLinear(mass, 1.5, maxMass, 0.01, 0.03); // 重いほど摩擦が強い
        particle.mass = mass; // 質量を保存
        this.particles.push(particle);
        
        // サイズを保存
        this.particleSizes.push(new THREE.Vector3(widthX, height, widthZ));
        
        // 角速度と回転を初期化（0, 0, 0）
        this.particleAngularVelocities.push(new THREE.Vector3(0, 0, 0));
        const initialRotation = new THREE.Euler(0, 0, 0, 'XYZ');
        this.particleRotations.push(initialRotation);
        
        // 更新フラグを初期化（初期状態では更新が必要）
        this.particleNeedsUpdate.push(true);
        
        // 初期位置とスケールを設定（回転なし）
        const scale = new THREE.Vector3(widthX, height, widthZ);
        this.instancedManager.setMatrixAt(
            index,
            new THREE.Vector3(x, y, z),
            initialRotation,
            scale
        );
        
        return particle;
    }
    
    /**
     * カメラパーティクルの距離パラメータを設定
     */
    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 4000.0;
        cameraParticle.maxDistance = 8000.0;
        cameraParticle.maxDistanceReset = 6000.0;
        
        const cameraBoxSize = 6000.0;
        const cameraMinY = 1000.0;
        const cameraMaxY = 3000.0;
        cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSize, cameraMinY, -cameraBoxSize);
        cameraParticle.boxMax = new THREE.Vector3(cameraBoxSize, cameraMaxY, cameraBoxSize);
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
     * 更新処理
     */
    onUpdate(deltaTime) {
        this.time += deltaTime;
        
        // 爆発の更新（全ての爆発を更新）
        this.explosions = this.explosions.filter(explosion => {
            explosion.update();
            explosion.updateThreeObjects();
            
            // ライトの位置と強さを更新
            for (let i = this.explosionLights.length - 1; i >= 0; i--) {
                const lightData = this.explosionLights[i];
                if (lightData.explosion === explosion) {
                    const center = explosion.getCenter();
                    const radius = explosion.getRadius();
                    const intensity = explosion.getIntensity();
                    
                    lightData.light.position.copy(center);
                    lightData.light.intensity = intensity * 2.0; // 強さを調整
                    lightData.light.distance = radius * 2;
                    
                    // 爆発が終了したらライトを削除
                    if (explosion.isFinished()) {
                        this.scene.remove(lightData.light);
                        lightData.light.dispose();
                        this.explosionLights.splice(i, 1);
                    }
                }
            }
            
            if (explosion.isFinished()) {
                explosion.dispose(this.scene);
                return false;
            }
            return true;
        });
        
        // パーティクルの更新（GPUインスタンシング用）
        if (!this.instancedManager || this.particles.length === 0) {
            return; // まだ初期化されていない場合はスキップ
        }
        
        // 爆発の影響範囲を事前計算（距離の2乗を使用してパフォーマンス向上）
        const explosionRanges = [];
        for (const explosion of this.explosions) {
            if (!explosion.isActive() && explosion.getAge() >= explosion.getLifetime()) continue;
            const explosionCenter = explosion.getCenter();
            const explosionRadius = explosion.getRadius();
            explosionRanges.push({
                center: explosionCenter,
                radiusSquared: (explosionRadius * 1.5) * (explosionRadius * 1.5), // 距離の2乗を事前計算
                explosion: explosion
            });
        }
        
        let updatedCount = 0; // 更新されたパーティクル数（デバッグ用）
        
        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i];
            const angularVel = this.particleAngularVelocities[i];
            const particleSize = this.particleSizes[i];
            const particleMass = this.particleMasses[i];
            const particlePos = particle.getPosition();
            const particleHeight = particleSize.y; // 建物の高さ
            const particleBottom = particlePos.y - particleHeight / 2.0; // 建物の底のY座標
            
            // パフォーマンス最適化: 動いているパーティクルのみ更新
            const vel = particle.getVelocity();
            const velLength = vel.length();
            const angularVelLength = angularVel.length();
            const isMoving = velLength > 0.01 || angularVelLength > 0.001;
            
            // 動いていないパーティクルはスキップ（ただし、爆発の影響範囲内の場合は更新）
            let isInExplosionRange = false;
            if (!isMoving && explosionRanges.length > 0) {
                // 距離の2乗を使用してパフォーマンス向上（sqrtを避ける）
                for (const range of explosionRanges) {
                    const dx = particlePos.x - range.center.x;
                    const dy = particlePos.y - range.center.y;
                    const dz = particlePos.z - range.center.z;
                    const distanceSquared = dx * dx + dy * dy + dz * dz;
                    if (distanceSquared < range.radiusSquared) {
                        isInExplosionRange = true;
                        break;
                    }
                }
                if (!isInExplosionRange) {
                    // 動いていないかつ爆発の影響範囲外のパーティクルはスキップ
                    this.particleNeedsUpdate[i] = false;
                    continue;
                }
            }
            
            // 更新が必要なパーティクル
            this.particleNeedsUpdate[i] = true;
            updatedCount++;
            
            // 重力を適用（質量に応じて重いほど強く）
            const massGravityMultiplier = THREE.MathUtils.mapLinear(particleMass, 1.5, 200.0, 1.0, 1.5); // 重いほど1.5倍まで
            const gravity = this.gravity.clone().multiplyScalar(massGravityMultiplier);
            particle.addForce(gravity);
            
            // 全ての爆発の力を適用（距離の2乗を使用してパフォーマンス向上）
            for (const explosion of this.explosions) {
                if (!explosion.isActive() && explosion.getAge() >= explosion.getLifetime()) continue;
                
                const explosionCenter = explosion.getCenter();
                // Vector3の生成を避けて直接計算（パフォーマンス向上）
                const dx = particlePos.x - explosionCenter.x;
                const dy = particlePos.y - explosionCenter.y;
                const dz = particlePos.z - explosionCenter.z;
                const distanceSquared = dx * dx + dy * dy + dz * dz; // 距離の2乗
                const explosionRadius = explosion.getRadius();
                const explosionRadiusSquared = explosionRadius * explosionRadius; // 半径の2乗
                const explosionAge = explosion.getAge();
                const explosionLifetime = explosion.getLifetime();
                
                // 爆発の進行度（0.0〜1.0）
                const explosionProgress = explosionAge / explosionLifetime;
                
                // 球体の中にいる場合、消えるまでは押し出される（距離の2乗で判定）
                if (distanceSquared < explosionRadiusSquared && distanceSquared > 0.01) {
                    const distance = Math.sqrt(distanceSquared); // 実際の距離が必要な時だけ計算
                    // 距離に応じた力の強さ
                    const normalizedDist = distance / explosionRadius;
                    let baseForceStrength = 50.0 * (1.0 - normalizedDist) * (1.0 - normalizedDist);
                    
                    // 時間経過に応じた力の強さ（最初は0からだんだん強くなる、最初の50%で最大に）
                    let timeForceMultiplier;
                    if (explosionProgress < 0.5) {
                        // 最初の50%で0から1.0まで急激に強くなる
                        timeForceMultiplier = explosionProgress / 0.5;
                    } else {
                        // 残り50%でゆっくり弱くなる（消えるまで継続）
                        const fadeProgress = (explosionProgress - 0.5) / 0.5;
                        timeForceMultiplier = 1.0 * (1.0 - fadeProgress * 0.3); // 最大でも30%まで弱くなる（消えるまで押し出す）
                    }
                    baseForceStrength *= timeForceMultiplier;
                    
                    // 質量に応じて力を調整（重いほど力を受けにくい）
                    const massForceMultiplier = THREE.MathUtils.mapLinear(particleMass, 1.5, 200.0, 1.0, 0.4); // 重いほど0.4倍まで
                    baseForceStrength *= massForceMultiplier;
                    
                    // 球体の内側にいる場合、力を強化
                    const innerForceStrength = baseForceStrength * 10.0;
                    // Vector3の生成を避けて直接計算（パフォーマンス向上）
                    const invDistance = 1.0 / distance;
                    const forceDir = new THREE.Vector3(dx * invDistance, dy * invDistance, dz * invDistance).multiplyScalar(innerForceStrength);
                    particle.addForce(forceDir);
                    
                    // 角速度を追加（横回転を優先、縦回転は強い力の時だけ）
                    const angularPower = innerForceStrength * 0.01; // 力に応じた角速度
                    const normalizedDir = new THREE.Vector3(dx * invDistance, dy * invDistance, dz * invDistance);
                    // 横回転（X軸とZ軸）を優先 - ビルが倒れるように
                    angularVel.x += normalizedDir.z * angularPower * 1.2; // X軸回転を強化
                    angularVel.z += -normalizedDir.x * angularPower * 1.2; // Z軸回転を強化
                    // 縦回転（Y軸）は強い力の時だけ少し入れる（力が大きいほど少し増やす）
                    const yAxisRotationFactor = Math.min(innerForceStrength / 100.0, 0.3); // 最大0.3倍まで
                    angularVel.y += (Math.random() - 0.5) * angularPower * 0.1 * yAxisRotationFactor; // 縦回転を大幅に減らす
                } else if (distanceSquared < explosionRadiusSquared * 2.25 && distanceSquared > 0.01) {
                    // 外側は通常の力（弱め）
                    const distance = Math.sqrt(distanceSquared); // 実際の距離が必要な時だけ計算
                    const normalizedDist = distance / (explosionRadius * 1.5);
                    let baseForceStrength = 30.0 * (1.0 - normalizedDist) * (1.0 - normalizedDist);
                    
                    // 時間経過に応じた力の強さ
                    let timeForceMultiplier;
                    if (explosionProgress < 0.5) {
                        timeForceMultiplier = explosionProgress / 0.5;
            } else {
                        const fadeProgress = (explosionProgress - 0.5) / 0.5;
                        timeForceMultiplier = 1.0 * (1.0 - fadeProgress * 0.5);
                    }
                    baseForceStrength *= timeForceMultiplier;
                    
                    // 質量に応じて力を調整（重いほど力を受けにくい）
                    const massForceMultiplier = THREE.MathUtils.mapLinear(particleMass, 1.0, 100.0, 1.0, 0.5);
                    baseForceStrength *= massForceMultiplier;
                    
                    // Vector3の生成を避けて直接計算（パフォーマンス向上）
                    const invDistance = 1.0 / distance;
                    const forceDir = new THREE.Vector3(dx * invDistance, dy * invDistance, dz * invDistance).multiplyScalar(baseForceStrength);
                    particle.addForce(forceDir);
                    
                    // 角速度を追加（弱め、横回転を優先）
                    const angularPower = baseForceStrength * 0.005;
                    const normalizedDir = new THREE.Vector3(dx * invDistance, dy * invDistance, dz * invDistance);
                    // 横回転（X軸とZ軸）を優先
                    angularVel.x += normalizedDir.z * angularPower * 1.2; // X軸回転を強化
                    angularVel.z += -normalizedDir.x * angularPower * 1.2; // Z軸回転を強化
                    // 縦回転（Y軸）はほとんど入れない（弱い力なので）
                    angularVel.y += (Math.random() - 0.5) * angularPower * 0.05; // 縦回転を大幅に減らす
                }
            }
            
            // パーティクルを更新
            particle.update();
            
            // 地面との衝突判定
            if (particleBottom <= this.groundY) {
                // 地面に当たったら位置を修正
                particlePos.y = this.groundY + particleHeight / 2.0;
                particle.position.copy(particlePos);
                
                // 速度を減らす（反発と摩擦、質量に応じて重いほど強く減衰）
                const vel = particle.getVelocity();
                if (vel.y < 0) {
                    vel.y *= -0.3; // 反発係数
                }
                // 質量に応じて摩擦を調整（重いほど強く減衰、早く止まる）
                const groundFriction = THREE.MathUtils.mapLinear(particleMass, 1.5, 200.0, 0.98, 0.93);
                vel.x *= groundFriction; // 小さいBoxは0.98、大きいビルは0.95
                vel.z *= groundFriction;
                particle.velocity.copy(vel);
            }
            
            // 角速度を減衰（摩擦、質量に応じて重いほど強く減衰）
            // 長めのビルの場合はより強く減衰させる
            // particleSizeは既に653行目で宣言されているので、constを付けない
            const isLongBuilding = particleSize && particleSize.y >= this.BUILDING_HEIGHT_MIN && 
                                   particleSize.x <= this.BUILDING_WIDTH_MAX && 
                                   particleSize.z <= this.BUILDING_WIDTH_MAX;
            
            let angularFriction;
            if (isLongBuilding) {
                // 長めのビルはより強く減衰（0.97〜0.94）
                angularFriction = THREE.MathUtils.mapLinear(particleMass, 1.5, 200.0, 0.97, 0.94);
            } else {
                // 通常の減衰（0.99〜0.96）
                angularFriction = THREE.MathUtils.mapLinear(particleMass, 1.5, 100.0, 0.99, 0.96);
            }
            angularVel.multiplyScalar(angularFriction);
            
            // 回転を累積
            const rotation = this.particleRotations[i];
            rotation.x += angularVel.x;
            rotation.y += angularVel.y;
            rotation.z += angularVel.z;
            
            // インスタンスのマトリックスを更新（スケールも含める）
            const scale = new THREE.Vector3(particleSize.x, particleSize.y, particleSize.z);
            this.instancedManager.setMatrixAt(i, particlePos, rotation, scale);
        }
        
        // インスタンスマトリックスを更新（更新が必要なパーティクルがある場合のみ）
        if (updatedCount > 0) {
            this.instancedManager.markNeedsUpdate();
        }
        
        // カメラの位置を更新（SceneBase.update()で既にカメラパーティクルは更新済み）
        this.updateCamera();
        
        // 色収差エフェクトの更新（サスティン終了チェック）
        this.updateChromaticAberration();
        
        // グリッチエフェクトの更新（サスティン終了チェックと時間更新）
        this.updateGlitch();
    }
    
    /**
     * 爆発を開始
     * @param {number} noteNumber - ノート番号（36が0、地上からの高さ）
     * @param {number} velocity - ベロシティ（0-127、爆発の強さ）
     * @param {number} durationMs - デュレーション（ms、爆発の長さ）
     */
    triggerExplosion(noteNumber = null, velocity = null, durationMs = null) {
        // 爆発の中心位置をランダムに設定（分布と同じ広さ）
        const spawnRadius = 5000.0;
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * spawnRadius;
        
        // ノート番号から地上からの高さを計算（36が0）
        let heightY = 0.0;
        if (noteNumber !== null) {
            heightY = (noteNumber - 36) * 10.0; // ノート1つで10ユニット上昇
        } else {
            heightY = (Math.random() - 0.5) * 500; // デフォルトはランダム
        }
        
        const explosionCenter = new THREE.Vector3(
            Math.cos(angle) * radius,
            this.groundY + heightY,
            Math.sin(angle) * radius
        );
        
        // ベロシティから爆発の強さを計算（0-127 → 半径100-400）
        let explosionMaxRadius = 150 + Math.random() * 100; // デフォルト
        if (velocity !== null) {
            const velocityNormalized = velocity / 127.0; // 0.0-1.0
            explosionMaxRadius = 100 + velocityNormalized * 300; // 100-400
        }
        
        // デュレーションから爆発の長さを計算（ms → フレーム数、60fps想定）
        let explosionLifetime = 90; // デフォルト（約1.5秒）
        if (durationMs !== null && durationMs > 0) {
            explosionLifetime = Math.floor((durationMs / 1000.0) * 60); // ms → フレーム数
        }
        
        // 新しい爆発を作成
        const explosion = new Scene06_Explosion(explosionCenter, explosionMaxRadius, explosionLifetime);
        explosion.createThreeObjects(this.scene);
        this.explosions.push(explosion);
        
        // ポイントライトを追加（最大8個まで）
        if (this.explosionLights.length < this.maxLights) {
            const light = new THREE.PointLight(0xffffff, 2.0, explosionMaxRadius * 2);
            light.position.copy(explosionCenter);
            this.scene.add(light);
            this.explosionLights.push({ light: light, explosion: explosion });
        }
        
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
                    this.explosions.length > 0 ? this.explosions[this.explosions.length - 1].getIntensity() : 0,
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
        
        // 爆発のコールアウトを描画（全ての爆発に対して、HUDの後に描画して一番手前に表示）
        // 爆発sphereが表示されている時だけコールアウトを表示
        for (const explosion of this.explosions) {
            if (explosion.explosionMesh && explosion.explosionMesh.visible) {
                this.drawExplosionCallout(explosion);
            }
        }
        
        // スクリーンショットテキストを描画
        this.drawScreenshotText();
        
        // デバッグ用シーンを描画（エフェクト適用後、HUDと同じタイミング）
        // カメラデバッグとAxesHelperはエフェクトから除外
        // SHOW_CAMERA_DEBUGがtrueの時のみレンダリング
        if (this.SHOW_CAMERA_DEBUG && this.debugScene) {
            // debugSceneの背景を確実に透明にする
            this.debugScene.background = null;
            
            // autoClearを一時的にfalseにして、sceneの描画結果を保持したまま
            // debugSceneを上書きレンダリングする
            const originalAutoClear = this.renderer.autoClear;
            this.renderer.autoClear = false;
            
            this.renderer.render(this.debugScene, this.camera);
            
            // autoClearを復元
            this.renderer.autoClear = originalAutoClear;
        }
        
        // カメラデバッグを描画（テキスト）
        this.drawCameraDebug();
    }
    
    /**
     * 爆心地にコールアウトを描画（情報表示、2D描画、Processing版と同じ）
     */
    drawExplosionCallout(explosion) {
        if (!this.hud || !this.hud.ctx) return;
        
        const ctx = this.hud.ctx;
        const canvas = this.hud.canvas;
        
        // 爆発の中心位置を2D座標に変換
        const explosionCenter = explosion.getCenter().clone();
        explosionCenter.project(this.camera);
        
        // 画面座標に変換（-1.0〜1.0 → 0〜canvas.width/height）
        const centerScreenX = (explosionCenter.x * 0.5 + 0.5) * canvas.width;
        const centerScreenY = (explosionCenter.y * -0.5 + 0.5) * canvas.height;
        
        // 画面外の場合は描画しない
        if (centerScreenX < 0 || centerScreenX > canvas.width || 
            centerScreenY < 0 || centerScreenY > canvas.height) {
            return;
        }
        
        const explosionRadius = explosion.getRadius();
        const explosionIntensity = explosion.getIntensity();
        
        // コールアウトの開始位置（爆発の中心から少し上、2D座標で）
        const startX = centerScreenX;
        const startY = centerScreenY - 30.0;  // 中心から30ピクセル上
        
        // 斜めの線の方向（右または左、2D的に常に一定の角度で斜め）
        const useRight = explosion.getCalloutRight();
        // 2D的に常に45度の角度で斜めにする（X方向とY方向の比率を1:1に固定）
        const diagonalAngle = Math.PI / 4; // 45度（ラジアン）
        const diagonalDirX = useRight ? Math.cos(diagonalAngle) : -Math.cos(diagonalAngle);  // 右なら右斜め上、左なら左斜め上
        const diagonalDirY = -Math.sin(diagonalAngle);  // 上方向（常に一定）
        
        // 斜めの線の長さ
        const diagonalLength = 80.0;  // 2D座標で80ピクセル
        const end1X = startX + diagonalDirX * diagonalLength;
        const end1Y = startY + diagonalDirY * diagonalLength;
        
        // 画面のX軸に対して並行な線（右方向、2D座標で）
        const horizontalLength = 150.0;  // 水平線の長さ（2D座標で）
        const end2X = end1X + horizontalLength;
        const end2Y = end1Y;  // 水平なのでY座標は同じ
        
        // 線を描画（赤色、完全に2D）
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.78)';  // 赤い線
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(end1X, end1Y);  // 斜めの線
        ctx.moveTo(end1X, end1Y);
        ctx.lineTo(end2X, end2Y);  // 水平線
        ctx.stroke();
        
        // テキストを描画（水平線の上、完全に2D）
        ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';  // 白いテキスト
        ctx.font = '16px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        
        // 爆発の情報を表示（3〜4行）
        const lineHeight = 20;
        const textX = end2X + 10;  // 水平線の終端から少し右に
        let textY = end2Y - 60;  // 水平線の上に
        
        // 影響範囲内のパーティクル数を計算（距離の2乗を使用してパフォーマンス向上）
        let affectedParticles = 0;
        const explosionCenter3D = explosion.getCenter(); // 3D座標（2D座標変換用のexplosionCenterとは別）
        const explosionRadiusSquared = (explosionRadius * 1.5) * (explosionRadius * 1.5); // 距離の2乗を事前計算
        // サンプリングして概算（全パーティクルをチェックしない）
        const sampleSize = Math.min(1000, this.particles.length); // 最大1000個をサンプリング
        const step = Math.max(1, Math.floor(this.particles.length / sampleSize));
        for (let i = 0; i < this.particles.length; i += step) {
            const particlePos = this.particles[i].getPosition();
            const dx = particlePos.x - explosionCenter3D.x;
            const dy = particlePos.y - explosionCenter3D.y;
            const dz = particlePos.z - explosionCenter3D.z;
            const distanceSquared = dx * dx + dy * dy + dz * dz;
            if (distanceSquared < explosionRadiusSquared) {
                affectedParticles++;
            }
        }
        // サンプリング結果を全体に拡張
        affectedParticles = Math.floor(affectedParticles * (this.particles.length / sampleSize));
        
        ctx.fillText('EXPLOSION DATA', textX, textY);
        textY += lineHeight;
        ctx.fillText(`RADIUS: ${explosionRadius.toFixed(1)}`, textX, textY);
        textY += lineHeight;
        ctx.fillText(`INTENSITY: ${(explosionIntensity * 100).toFixed(1)}%`, textX, textY);
        textY += lineHeight;
        ctx.fillText(`AFFECTED: ${affectedParticles}`, textX, textY);
        
        ctx.restore();
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
        // トラック5: 爆発を開始（ノート、ベロシティ、デュレーション付き）
        else if (trackNumber === 5) {
            const noteNumber = args[0] !== undefined ? args[0] : null; // ノート（36が0）
            const velocity = args[1] !== undefined ? args[1] : null; // ベロシティ（0-127、爆発の強さ）
            const durationMs = args[2] !== undefined ? args[2] : null; // デュレーション（ms、爆発の長さ）
            this.triggerExplosion(noteNumber, velocity, durationMs);
        }
    }
    
    /**
     * リセット処理
     */
    reset() {
        super.reset(); // TIMEをリセット
        // パーティクルをリセット（上に配置）
        if (!this.instancedManager || this.particles.length === 0) {
            return; // まだ初期化されていない場合はスキップ
        }
        
        const spawnRadius = 5000.0; // もっと広く分布
        
        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i];
            const particleSize = this.particleSizes[i];
            particle.reset();
            
            // ノイズベースの地形に配置（島の高さ以上なら配置）
            let attempts = 0;
            const maxAttempts = 20; // 最大試行回数
            let x, z;
            
            do {
        const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * spawnRadius;
                x = Math.cos(angle) * radius;
                z = Math.sin(angle) * radius;
                attempts++;
            } while (!this.canPlaceBuilding(x, z) && attempts < maxAttempts);
            
            // 試行回数が上限に達した場合は、最後の位置を使用（強制的に配置）
            const y = this.groundY + particleSize.y / 2.0; // 地面の上
            particle.position.set(x, y, z);
            
            // 角速度と回転をリセット
            this.particleAngularVelocities[i].set(0, 0, 0);
            this.particleRotations[i].set(0, 0, 0, 'XYZ');
            
            // 更新フラグをリセット
            this.particleNeedsUpdate[i] = true;
            
            // インスタンスのマトリックスを更新（スケールも含める）
            const scale = new THREE.Vector3(particleSize.x, particleSize.y, particleSize.z);
            this.instancedManager.setMatrixAt(i, particle.getPosition(), this.particleRotations[i], scale);
        }
        
        this.instancedManager.markNeedsUpdate();
        
        // 爆発をリセット
        for (const explosion of this.explosions) {
            explosion.dispose(this.scene);
        }
        this.explosions = [];
        
        // ライトをリセット
        for (const lightData of this.explosionLights) {
            this.scene.remove(lightData.light);
            lightData.light.dispose();
    }
        this.explosionLights = [];
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
            
            // グリッチエフェクトも初期化（composerが作成された後）
            await this.initGlitchShader();
        } catch (err) {
            console.error('色収差シェーダーの読み込みに失敗:', err);
            // エラーが発生してもcomposerは作成しておく（グリッチシェーダー用）
            if (!this.composer) {
                this.composer = new EffectComposer(this.renderer);
                const renderPass = new RenderPass(this.scene, this.camera);
                this.composer.addPass(renderPass);
            }
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
            
            // ShaderPassを追加（composerが存在することを再確認）
            if (!this.composer) {
                console.warn('グリッチシェーダー: composerが存在しません');
                return;
            }
            
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
// インスタンスメッシュマネージャーを破棄
        if (this.instancedManager) {
            this.instancedManager.dispose();
            this.instancedManager = null;
        }
        
        // パーティクルをクリア
        this.particles = [];
        this.particleMeshes = [];
        this.particleAngularVelocities = [];
        this.particleRotations = [];
        this.particleSizes = [];
        this.particleMasses = [];
        this.particleNeedsUpdate = [];
        
        // 爆発を破棄
        this.explosions.forEach(explosion => {
            if (explosion.dispose) {
                explosion.dispose(this.scene);
            }
        });
        this.explosions = [];
        
        // ライトを破棄
        this.explosionLights.forEach(lightData => {
            this.scene.remove(lightData.light);
            if (lightData.light.dispose) {
                lightData.light.dispose();
            }
        });
        this.explosionLights = [];
        
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
// 親クラスのdisposeを呼ぶ
        super.dispose();
    }
}
