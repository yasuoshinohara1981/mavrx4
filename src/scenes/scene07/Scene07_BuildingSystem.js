/**
 * Scene07_BuildingSystem: CPU版でビルを管理
 * 各ビルを個別のMeshとして描画（Processing版と同じ）
 */

import * as THREE from 'three';
import { Scene07_Building } from './Scene07_Building.js';

export class Scene07_BuildingSystem {
    constructor(scene, numBuildings = 7000, numLandmarkBuildings = 5) {
        this.scene = scene;
        this.numBuildings = numBuildings;
        this.numLandmarkBuildings = numLandmarkBuildings;
        
        // ノイズ関数用のシード
        this.noiseSeed = Math.random() * 1000.0;
        
        // ビルのパラメータ（Processing版と同じ）
        this.BUILDING_WIDTH_MIN = 2.5;
        this.BUILDING_WIDTH_MAX = 28.0;
        this.BUILDING_HEIGHT_MIN = 15.0;
        this.BUILDING_HEIGHT_MAX = 200.0;
        this.LANDMARK_WIDTH_MIN = 40.0;
        this.LANDMARK_WIDTH_MAX = 65.0;
        this.LANDMARK_HEIGHT_MIN = 320.0;
        this.LANDMARK_HEIGHT_MAX = 480.0;
        this.buildingSpawnRadius = 1300.0;
        this.groundY = 0.0;
        
        // ビルのリスト
        this.buildings = [];
        
        // 初期化
        this.initializeBuildings();
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
     * ビルを初期化
     */
    initializeBuildings() {
        this.buildings = [];
        
        const landmarkPositions = [];
        const landmarkInfluenceRadius = 400.0;
        
        // 超高層ビル（ランドマーク）を生成
        for (let i = 0; i < this.numLandmarkBuildings; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * this.buildingSpawnRadius * 0.5;
            
            const x = radius * Math.cos(angle);
            const z = radius * Math.sin(angle);
            
            const widthX = THREE.MathUtils.randFloat(this.LANDMARK_WIDTH_MIN, this.LANDMARK_WIDTH_MAX);
            const widthZ = THREE.MathUtils.randFloat(this.LANDMARK_WIDTH_MIN, this.LANDMARK_WIDTH_MAX);
            const height = THREE.MathUtils.randFloat(this.LANDMARK_HEIGHT_MIN, this.LANDMARK_HEIGHT_MAX);
            
            const y = this.groundY + height / 2.0;
            const pos = new THREE.Vector3(x, y, z);
            
            landmarkPositions.push(new THREE.Vector3(x, 0, z));
            
            const building = new Scene07_Building(pos, widthX, widthZ, height, true);
            this.buildings.push(building);
            
            // Three.jsメッシュを作成してシーンに追加
            this.createBuildingMesh(building);
        }
        
        // 通常のビルを生成
        for (let i = 0; i < this.numBuildings; i++) {
            const noiseScalePos = 0.003;
            const noiseAngle = this.noise(i * noiseScalePos, 0, 0) * Math.PI * 2;
            const noiseRadius = this.noise(i * noiseScalePos + 5000.0, 0, 0) * this.buildingSpawnRadius;
            
            const angle = noiseAngle + (Math.random() - 0.5) * Math.PI * 0.6;
            const radius = noiseRadius + (Math.random() - 0.5) * this.buildingSpawnRadius * 0.6;
            const clampedRadius = Math.min(Math.max(radius, 0), this.buildingSpawnRadius * 1.2);
            
            const x = clampedRadius * Math.cos(angle);
            const z = clampedRadius * Math.sin(angle);
            
            const noiseScale = 0.008;
            const noiseX = this.noise(x * noiseScale, z * noiseScale, 0);
            const noiseZ = this.noise(x * noiseScale + 1000.0, z * noiseScale + 1000.0, 0);
            const noiseH = this.noise(x * noiseScale + 2000.0, z * noiseScale + 2000.0, 0);
            
            let height = THREE.MathUtils.mapLinear(noiseH, 0.0, 1.0, this.BUILDING_HEIGHT_MIN, this.BUILDING_HEIGHT_MAX);
            let widthX = THREE.MathUtils.mapLinear(noiseX, 0.0, 1.0, this.BUILDING_WIDTH_MIN, this.BUILDING_WIDTH_MAX);
            let widthZ = THREE.MathUtils.mapLinear(noiseZ, 0.0, 1.0, this.BUILDING_WIDTH_MIN, this.BUILDING_WIDTH_MAX);
            
            const aspectRatio = Math.random() * 2.0 + 0.5;
            if (Math.random() > 0.5) {
                widthX *= aspectRatio;
            } else {
                widthZ *= aspectRatio;
            }
            
            widthX = THREE.MathUtils.clamp(widthX, this.BUILDING_WIDTH_MIN, this.BUILDING_WIDTH_MAX);
            widthZ = THREE.MathUtils.clamp(widthZ, this.BUILDING_WIDTH_MIN, this.BUILDING_WIDTH_MAX);
            
            // ランドマークの近くかチェック
            let minDistanceToLandmark = Infinity;
            for (const landmarkPos of landmarkPositions) {
                const dx = x - landmarkPos.x;
                const dz = z - landmarkPos.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                if (distance < minDistanceToLandmark) {
                    minDistanceToLandmark = distance;
                }
            }
            
            if (minDistanceToLandmark < landmarkInfluenceRadius) {
                const influence = 1.0 - (minDistanceToLandmark / landmarkInfluenceRadius);
                const influenceClamped = Math.max(0.0, Math.min(1.0, influence));
                
                let heightValue;
                if (noiseH < 0.3) {
                    heightValue = THREE.MathUtils.mapLinear(
                        noiseH, 0.0, 0.3,
                        this.BUILDING_HEIGHT_MIN,
                        this.BUILDING_HEIGHT_MIN + (this.BUILDING_HEIGHT_MAX - this.BUILDING_HEIGHT_MIN) * 0.2
                    );
                } else if (noiseH < 0.7) {
                    heightValue = THREE.MathUtils.mapLinear(
                        noiseH, 0.3, 0.7,
                        this.BUILDING_HEIGHT_MIN + (this.BUILDING_HEIGHT_MAX - this.BUILDING_HEIGHT_MIN) * 0.2,
                        this.BUILDING_HEIGHT_MIN + (this.BUILDING_HEIGHT_MAX - this.BUILDING_HEIGHT_MIN) * 0.85
                    );
                } else {
                    heightValue = THREE.MathUtils.mapLinear(
                        noiseH, 0.7, 1.0,
                        this.BUILDING_HEIGHT_MIN + (this.BUILDING_HEIGHT_MAX - this.BUILDING_HEIGHT_MIN) * 0.85,
                        this.BUILDING_HEIGHT_MAX
                    );
                }
                
                height = height * (1.0 - influenceClamped) + heightValue * influenceClamped;
            }
            
            const noiseDetailX = this.noise(x * noiseScale * 3.0, z * noiseScale * 3.0, 0);
            const noiseDetailZ = this.noise(x * noiseScale * 3.0 + 5000.0, z * noiseScale * 3.0 + 5000.0, 0);
            const noiseDetailH = this.noise(x * noiseScale * 3.0 + 10000.0, z * noiseScale * 3.0 + 10000.0, 0);
            
            widthX += THREE.MathUtils.mapLinear(noiseDetailX, 0.0, 1.0, -(this.BUILDING_WIDTH_MAX - this.BUILDING_WIDTH_MIN) * 0.2, (this.BUILDING_WIDTH_MAX - this.BUILDING_WIDTH_MIN) * 0.2);
            widthZ += THREE.MathUtils.mapLinear(noiseDetailZ, 0.0, 1.0, -(this.BUILDING_WIDTH_MAX - this.BUILDING_WIDTH_MIN) * 0.2, (this.BUILDING_WIDTH_MAX - this.BUILDING_WIDTH_MIN) * 0.2);
            height += THREE.MathUtils.mapLinear(noiseDetailH, 0.0, 1.0, -(this.BUILDING_HEIGHT_MAX - this.BUILDING_HEIGHT_MIN) * 0.2, (this.BUILDING_HEIGHT_MAX - this.BUILDING_HEIGHT_MIN) * 0.2);
            
            widthX = THREE.MathUtils.clamp(widthX, this.BUILDING_WIDTH_MIN, this.BUILDING_WIDTH_MAX);
            widthZ = THREE.MathUtils.clamp(widthZ, this.BUILDING_WIDTH_MIN, this.BUILDING_WIDTH_MAX);
            height = THREE.MathUtils.clamp(height, this.BUILDING_HEIGHT_MIN, this.BUILDING_HEIGHT_MAX);
            
            const y = this.groundY + height / 2.0;
            const pos = new THREE.Vector3(x, y, z);
            
            const building = new Scene07_Building(pos, widthX, widthZ, height, false);
            this.buildings.push(building);
            
            // Three.jsメッシュを作成してシーンに追加
            this.createBuildingMesh(building);
        }
        
        console.log(`Scene07: ${this.buildings.length} buildings initialized (CPU版)`);
    }
    
    /**
     * ビルのThree.jsメッシュを作成
     * Processing版: box(widthX, height, widthZ) を完璧に再現
     */
    createBuildingMesh(building) {
        // Processing版と同じサイズのBoxGeometryを直接作成
        const geometry = new THREE.BoxGeometry(building.widthX, building.height, building.widthZ);
        
        // マテリアル
        const material = new THREE.MeshStandardMaterial({
            color: building.color,
            roughness: 0.7,
            metalness: 0.0,
            flatShading: false
        });
        
        // メッシュ
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(building.position);
        mesh.rotation.copy(building.rotation);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        
        // エッジライン（パフォーマンス最適化のため一時的に無効化）
        // const edgesGeometry = new THREE.EdgesGeometry(geometry);
        // const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x505050 });
        // const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
        // mesh.add(edges);
        
        building.mesh = mesh;
        building.geometry = geometry;
        building.material = material;
        // building.edgesGeometry = edgesGeometry;
        this.scene.add(mesh);
    }
    
    /**
     * ビルを更新（パフォーマンス最適化：動いてるビルのみ更新）
     */
    updateInstances() {
        for (const building of this.buildings) {
            if (building.mesh) {
                const vel = building.getVelocity();
                const velLength = vel.length();
                const angularVelLength = building.angularVelocity.length();
                
                // 動いてるビルのみ更新（速度が0.1以上、または角速度が0.01以上）
                if (velLength > 0.1 || angularVelLength > 0.01 || building.hasExploded) {
                    building.mesh.position.copy(building.position);
                    building.mesh.rotation.copy(building.rotation);
                    building.mesh.material.color.copy(building.color);
                }
            }
        }
    }
    
    /**
     * ビルを取得
     */
    getBuildings() {
        return this.buildings;
    }
    
    /**
     * リソースを解放
     */
    dispose() {
        for (const building of this.buildings) {
            if (building.mesh) {
                this.scene.remove(building.mesh);
                building.geometry.dispose();
                building.material.dispose();
                if (building.edgesGeometry) {
                    building.edgesGeometry.dispose();
                }
                building.mesh = null;
            }
        }
        this.buildings = [];
    }
}
