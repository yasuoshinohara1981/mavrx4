/**
 * Scene11: 街の3Dモデル表示（Project PLATEAU）
 */

import { SceneTemplate } from '../SceneTemplate.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import { Particle } from '../../lib/Particle.js';

export class Scene11 extends SceneTemplate {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera, sharedResourceManager);
        this.title = 'mathym | Scene11 - 街';
        this.sceneNumber = 11;
        this.kitNo = 11;  // キット番号を設定
        
        // 建物の設定
        this.buildings = [];  // 個別の建物（CPUパーティクル）
        this.instancedBuildings = null;  // インスタンシング用の建物マネージャー
        this.numSimpleBuildings = 4900;  // シンプルな建物（Box）の数（5000 - 100 = 4900）
        this.specialBuildings = [];  // 特殊な形状の建物（3Dモデル）
        this.buildingParticles = [];  // 各建物の物理演算用Particleインスタンス
        this.firstBuildingCenter = null;  // 最初の建物の中心座標（相対位置計算用）
        this.firstBuildingCenterOffset = null;  // 最初の建物のcenterオフセット（全建物の基準位置）
        this.totalBuildingCount = 0;  // 総建物数（HUD表示用）
        
        // 建物の生成範囲
        this.spawnRadius = 5000.0;  // 範囲を広げて間隔を確保
        this.groundY = 0;
        this.offsetY = -500;  // Y座標のオフセット（調整用）
        
        // 物理演算設定
        this.gravity = new THREE.Vector3(0, -9.8, 0);  // 重力
        this.physicsEnabled = false;  // 物理演算の有効/無効
        
        // ライト
        this.ambientLight = null;
        this.directionalLight = null;
        
        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
    }
    
    /**
     * セットアップ処理（シーン切り替え時に呼ばれる）
     */
    async setup() {
        await super.setup();
        
        // ライトを設定
        this.setupLights();
        
        // シンプルな建物（Box）をインスタンシングで作成
        // this.createSimpleBuildings();  // 一旦コメントアウト
        
        // 特殊な形状の建物（3Dモデル）を読み込む
        await this.loadSpecialBuildings();
        
        // 建物数を更新（HUD表示用）
        this.updateBuildingCount();
        
        // 建物の範囲をカバーするグリッドを配置
        this.setupBuildingGrid();
    }
    
    /**
     * ライトを設定
     */
    setupLights() {
        // 環境光
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(this.ambientLight);
        
        // 指向性ライト
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight.position.set(1000, 2000, 1000);
        this.directionalLight.castShadow = true;
        
        // シャドウマップの設定
        this.directionalLight.shadow.mapSize.width = 2048;
        this.directionalLight.shadow.mapSize.height = 2048;
        this.directionalLight.shadow.camera.near = 0.5;
        this.directionalLight.shadow.camera.far = 5000;
        this.directionalLight.shadow.camera.left = -2000;
        this.directionalLight.shadow.camera.right = 2000;
        this.directionalLight.shadow.camera.top = 2000;
        this.directionalLight.shadow.camera.bottom = -2000;
        
        this.scene.add(this.directionalLight);
        
        // レンダラーのシャドウマップを有効化
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    
    /**
     * シンプルな建物（Box）をインスタンシングで作成
     */
    createSimpleBuildings() {
        // 基準となるジオメトリ（1x1x1のBox、スケールでサイズを変える）
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            metalness: 0.2,
            roughness: 0.8,
            wireframe: false
        });
        
        // ワイヤーフレーム用のマテリアル（オプション）
        const wireframeMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            wireframe: true,
            transparent: true,
            opacity: 0.3,
            depthTest: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        
        // InstancedMeshManagerを作成
        this.instancedBuildings = new InstancedMeshManager(
            this.scene,
            geometry,
            material,
            this.numSimpleBuildings,
            {
                wireframeMaterial: wireframeMaterial,
                wireframeRenderOrder: 1
            }
        );
        
        // 建物の配置データ
        this.buildingData = [];
        
        // ランダムに建物を配置
        for (let i = 0; i < this.numSimpleBuildings; i++) {
            // 位置をランダムに決定（円形の範囲内）
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * this.spawnRadius;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            // 建物のサイズをランダムに決定（PLATEAUの建物と整合性を取るため少し大きく）
            const width = 50 + Math.random() * 150;  // 50-200
            const depth = 50 + Math.random() * 150;  // 50-200
            const height = 50 + Math.random() * 300;  // 50-350
            
            // 位置（Y座標は地面の高さ + 建物の高さの半分）
            const y = this.groundY + height / 2.0;
            const position = new THREE.Vector3(x, y, z);
            
            // スケール
            const scale = new THREE.Vector3(width, height, depth);
            
            // 回転（Y軸周りにランダムに回転）
            const rotation = new THREE.Euler(0, Math.random() * Math.PI * 2, 0);
            
            // インスタンスに設定
            this.instancedBuildings.setMatrixAt(i, position, rotation, scale);
            
            // データを保存（後で更新する場合に使用）
            this.buildingData.push({
                position: position,
                scale: scale,
                rotation: rotation
            });
        }
        
        // 更新をマーク
        this.instancedBuildings.markNeedsUpdate();
    }
    
    /**
     * 建物数を更新（HUD表示用）
     */
    updateBuildingCount() {
        const instancedCount = this.instancedBuildings ? this.instancedBuildings.getCount() : 0;
        const specialCount = this.specialBuildings.length;
        this.totalBuildingCount = instancedCount + specialCount;
        this.setParticleCount(this.totalBuildingCount);
    }
    
    /**
     * 建物の範囲をカバーするグリッドを配置
     */
    setupBuildingGrid() {
        if (this.specialBuildings.length === 0) {
            console.warn('Scene11: No buildings to calculate grid bounds');
            return;
        }
        
        // 全ての建物を含むバウンディングボックスを計算
        const box = new THREE.Box3();
        
        this.specialBuildings.forEach(building => {
            building.updateMatrixWorld(true);
            const buildingBox = new THREE.Box3().setFromObject(building);
            box.union(buildingBox);
        });
        
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        // グリッドのパラメータを設定
        // 建物の範囲に少し余白を追加
        const padding = 100;  // 余白
        const gridSize = {
            x: size.x + padding * 2,
            y: size.y + padding * 2,
            z: size.z + padding * 2
        };
        
        // グリッドを初期化
        this.showGridRuler3D = true;
        this.initGridRuler3D({
            center: center,
            size: gridSize,
            floorY: this.offsetY - 10,  // 地面より少し下に配置
            floorSize: Math.max(gridSize.x, gridSize.z) * 1.2,  // 床のサイズ
            floorDivisions: 40,
            divX: 20,
            divY: 10,
            divZ: 20,
            labelMax: 100,  // ラベルの最大値
            color: 0xffffff,
            opacity: 0.5
        });
        
        console.log('Scene11: Grid initialized for building bounds:', {
            center: center,
            size: size,
            gridSize: gridSize
        });
    }
    
    /**
     * 特殊な形状の建物（3Dモデル）を読み込む
     * Project PLATEAUのOBJデータを読み込む
     */
    async loadSpecialBuildings() {
        // LOD1のOBJファイルを全て読み込む（100個）
        const lod1BasePath = '/assets/533946_2/LOD1';
        
        const objLoader = new OBJLoader();
        const mtlLoader = new MTLLoader();
        
        // 読み込みカウンター
        let loadedCount = 0;
        const maxLoadCount = 60;  // 60個の建物を読み込み
        
        // LOD1の全フォルダを順次読み込む
        for (let i = 0; i < maxLoadCount; i++) {
            const folder = `533946${String(i).padStart(2, '0')}`;
            
            const objPath = `${lod1BasePath}/${folder}/${folder}_bldg_6677.obj`;
            const mtlPath = `${lod1BasePath}/${folder}/${folder}_bldg_6677.mtl`;
            
            try {
                let model = null;
                
                // MTLファイルがある場合は先に読み込む
                try {
                    const materials = await mtlLoader.loadAsync(mtlPath);
                    materials.preload();
                    objLoader.setMaterials(materials);
                } catch (mtlError) {
                    // MTLファイルがない場合はスキップ（OBJのみで読み込む）
                }
                
                // OBJファイルを読み込む
                model = await objLoader.loadAsync(objPath);
                
                // モデルの設定
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        
                        // マテリアルを調整（必要に応じて）
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(mat => {
                                    if (mat.isMeshStandardMaterial || mat.isMeshPhongMaterial) {
                                        mat.metalness = 0.2;
                                        mat.roughness = 0.8;
                                    }
                                });
                            } else {
                                if (child.material.isMeshStandardMaterial || child.material.isMeshPhongMaterial) {
                                    child.material.metalness = 0.2;
                                    child.material.roughness = 0.8;
                                }
                            }
                        }
                    }
                });
                
                // 座標の調整（Qiita記事参考：座標が中央から離れているので調整が必要）
                // 参考: https://qiita.com/ProjectPLATEAU/items/a5a64d681045ea2f76b6
                
                // 回転前に元の座標（PLATEAU実座標）を取得
                const boxBefore = new THREE.Box3().setFromObject(model);
                const originalCenter = boxBefore.getCenter(new THREE.Vector3());
                
                // 最初の建物の座標を基準として保存
                if (this.specialBuildings.length === 0) {
                    this.firstBuildingCenter = originalCenter.clone();
                    console.log('Scene11: First building center:', this.firstBuildingCenter);
                }
                
                // スケールを調整（記事では0.3推奨）
                const modelScale = 1.0;
                model.scale.set(modelScale, modelScale, modelScale);
                
                // 回転を調整（縦向きになっているのを修正）
                model.rotation.x = -Math.PI / 2;  // X軸で-90度回転
                
                // 回転後にバウンディングボックスを計算（Y座標用）
                model.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(model);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                
                // PLATEAUの元の座標から相対位置を計算（位置関係を保つ）
                // 座標をスケールダウンして画面内に収める
                const positionScale = 0.01;  // 1/100にスケールダウン
                const relativeX = (originalCenter.x - this.firstBuildingCenter.x) * positionScale;
                const relativeZ = (originalCenter.z - this.firstBuildingCenter.z) * positionScale;
                
                console.log(`Scene11: Building ${this.specialBuildings.length} - relativePos: (${relativeX.toFixed(2)}, ${relativeZ.toFixed(2)}), center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`);
                
                // 建物を配置
                // 全ての建物を同じ座標系で配置（最初の建物のcenterオフセット + 相対位置）
                if (this.specialBuildings.length === 0) {
                    // 最初の建物：centerオフセットを保存
                    this.firstBuildingCenterOffset = new THREE.Vector3(-center.x, 0, -center.z);
                }
                
                // Y座標：単純にoffsetYで下げる
                const yPosition = this.offsetY;
                
                // 全ての建物：最初の建物のcenterオフセット + 相対位置
                model.position.set(
                    this.firstBuildingCenterOffset.x + relativeX,
                    yPosition,
                    this.firstBuildingCenterOffset.z + relativeZ
                );
                
                // シーンに追加
                this.scene.add(model);
                this.specialBuildings.push(model);
                
                // 物理演算用のParticleインスタンスを作成
                const particle = new Particle(
                    this.firstBuildingCenterOffset.x + relativeX,
                    yPosition,
                    this.firstBuildingCenterOffset.z + relativeZ
                );
                particle.friction = 0.98;  // 摩擦を強めに設定
                particle.maxSpeed = 50.0;  // 最大速度
                this.buildingParticles.push(particle);
                
                loadedCount++;
            } catch (error) {
                console.warn(`Scene11: Error loading model ${objPath}:`, error);
                // エラーが発生しても続行
            }
        }
        
        // 建物数を更新（HUD表示用）
        this.updateBuildingCount();
    }
    
    /**
     * LOD2の建物を読み込む（テクスチャ付き、より詳細）
     * パフォーマンスを考慮して、必要に応じて使用
     */
    async loadLOD2Buildings() {
        const lod2BasePath = '/assets/533946_2/LOD2';
        // LOD2の構造を確認して実装
        // テクスチャも読み込む必要がある
    }
    
    /**
     * 更新処理（毎フレーム呼ばれる）
     */
    onUpdate(deltaTime) {
        super.onUpdate(deltaTime);
        
        // 時間を更新
        this.time += deltaTime;
        
        // 物理演算が有効な場合、建物を更新
        if (this.physicsEnabled && this.buildingParticles.length > 0) {
            for (let i = 0; i < this.buildingParticles.length; i++) {
                const particle = this.buildingParticles[i];
                const building = this.specialBuildings[i];
                
                if (!particle || !building) continue;
                
                // 重力を適用
                particle.addForce(this.gravity);
                
                // パーティクルを更新
                particle.update();
                
                // 地面との衝突判定（バウンド）
                const pos = particle.getPosition();
                if (pos.y < this.groundY) {
                    pos.y = this.groundY;
                    particle.velocity.y *= -0.5;  // バウンド（反発係数0.5）
                    particle.velocity.x *= 0.8;  // 地面での摩擦
                    particle.velocity.z *= 0.8;
                }
                
                // 建物のメッシュ位置を更新
                building.position.copy(pos);
            }
        }
        
        // 建物のアニメーション（必要に応じて）
        // 例：建物が上下に揺れる、回転するなど
        // ここでは実装しないが、必要に応じて追加可能
    }
    
    /**
     * OSCメッセージの処理
     */
    handleTrackNumber(trackNumber, message) {
        super.handleTrackNumber(trackNumber, message);
        
        const args = message.args || [];
        
        // トラック5: 建物の表示/非表示を切り替え
        if (trackNumber === 5) {
            const velocity = args[1] || 127.0;
            const isVisible = velocity > 64;
            
            if (this.instancedBuildings) {
                this.instancedBuildings.getMainMesh().visible = isVisible;
                if (this.instancedBuildings.getWireframeMesh()) {
                    this.instancedBuildings.getWireframeMesh().visible = isVisible;
                }
            }
            
            this.specialBuildings.forEach(building => {
                building.visible = isVisible;
            });
        }
    }
    
    /**
     * トラック番号を処理
     */
    handleTrackNumber(trackNumber, message) {
        // トラック5の処理は削除（建物が消えたり現れたりする問題を回避）
        if (trackNumber === 6) {
            // トラック6: 物理演算ON/OFF
            this.physicsEnabled = !this.physicsEnabled;
            console.log(`Scene11: Physics ${this.physicsEnabled ? 'ON' : 'OFF'}`);
        } else if (trackNumber === 7) {
            // トラック7: 中心から放射状に爆発
            this.applyExplosionForce(new THREE.Vector3(0, 0, 0), 1000.0, 50.0);
        }
    }
    
    /**
     * 爆発の力を適用（中心点から放射状に力を加える）
     */
    applyExplosionForce(center, radius, strength) {
        for (let i = 0; i < this.buildingParticles.length; i++) {
            const particle = this.buildingParticles[i];
            const building = this.specialBuildings[i];
            
            if (!particle || !building) continue;
            
            const pos = particle.getPosition();
            const direction = new THREE.Vector3().subVectors(pos, center);
            const distance = direction.length();
            
            if (distance < radius && distance > 0) {
                // 距離に応じた力の減衰
                const forceMagnitude = strength * (1.0 - distance / radius);
                direction.normalize().multiplyScalar(forceMagnitude);
                particle.addForce(direction);
                
                // 物理演算を有効化（爆発時は自動的にON）
                this.physicsEnabled = true;
            }
        }
    }
    
    /**
     * リセット処理
     */
    reset() {
        super.reset();
        
        // 時間をリセット
        this.time = 0.0;
        
        // 物理演算をリセット
        this.physicsEnabled = false;
        for (let i = 0; i < this.buildingParticles.length; i++) {
            const particle = this.buildingParticles[i];
            if (particle) {
                particle.reset();
            }
        }
    }
    
    /**
     * クリーンアップ処理
     */
    dispose() {
        // インスタンシング用の建物を破棄
        if (this.instancedBuildings) {
            this.instancedBuildings.dispose();
            this.instancedBuildings = null;
        }
        
        // 特殊な建物を破棄
        this.specialBuildings.forEach(building => {
            this.scene.remove(building);
            building.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => mat.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            });
        });
        this.specialBuildings = [];
        
        // ライトを削除
        if (this.ambientLight) {
            this.scene.remove(this.ambientLight);
            this.ambientLight = null;
        }
        if (this.directionalLight) {
            this.scene.remove(this.directionalLight);
            this.directionalLight = null;
        }
        
        // データをクリア
        this.buildingData = [];
        
        super.dispose();
    }
}
