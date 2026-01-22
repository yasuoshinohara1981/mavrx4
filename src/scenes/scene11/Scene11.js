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
import { MeshLine, MeshLineMaterial } from 'three.meshline';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
        
        // エッジ表示設定
        this.showEdges = true;  // エッジ表示の有効/無効
        this.edgeColor = 0x888888;  // エッジの色（薄いグレー）
        this.edgeLineWidth = 1;  // エッジの線幅
        
        // グリッド表示設定
        this.showGridLines = false;  // グリッドの線を表示するか（デフォルト: false）
        
        // 床の平面
        this.floorPlane = null;  // 床の塗りつぶし平面
        
        // 道のネットワーク
        this.roadMaterial = null;
        this.roadMesh = null;
        this.roadColor = 0xffaa00;  // 道の色（オレンジ）
        
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
        
        // 道のネットワークを読み込む
        await this.loadRoadNetwork();
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
        const floorY = this.offsetY - 10;  // 地面より少し下に配置
        const floorSize = Math.max(gridSize.x, gridSize.z) * 1.2;  // 床のサイズ
        
        // グリッドの線を表示するかどうかでフラグを設定
        this.showGridRuler3D = this.showGridLines;
        
        if (this.showGridLines) {
            this.initGridRuler3D({
                center: center,
                size: gridSize,
                floorY: floorY,
                floorSize: floorSize,
                floorDivisions: 40,
                divX: 20,
                divY: 10,
                divZ: 20,
                labelMax: 100,  // ラベルの最大値
                color: 0xffffff,
                opacity: 0.5
            });
        }
        
        // 床の塗りつぶし平面を追加
        const floorGeometry = new THREE.PlaneGeometry(floorSize, floorSize);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,  // 暗いグレー
            metalness: 0.1,
            roughness: 0.9,
            side: THREE.DoubleSide
        });
        this.floorPlane = new THREE.Mesh(floorGeometry, floorMaterial);
        this.floorPlane.rotation.x = -Math.PI / 2;  // XZ平面に配置
        this.floorPlane.position.set(center.x, floorY, center.z);
        this.floorPlane.receiveShadow = true;  // シャドウを受ける
        this.scene.add(this.floorPlane);
        
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
                        
                        // エッジを追加
                        if (this.showEdges && child.geometry) {
                            const edgesGeometry = new THREE.EdgesGeometry(child.geometry);
                            const edgesMaterial = new THREE.LineBasicMaterial({ 
                                color: this.edgeColor,
                                linewidth: this.edgeLineWidth
                            });
                            const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
                            child.add(edges);
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
     * 道のネットワークのマテリアルを作成
     */
    createRoadMaterial() {
        const roadMaterial = new MeshLineMaterial({
            transparent: true,
            lineWidth: 3,  // 道の幅
            color: new THREE.Color(this.roadColor),
            opacity: 0.8
        });
        
        return roadMaterial;
    }
    
    /**
     * 道の色を変更
     */
    setRoadColor(color) {
        this.roadColor = color;
        if (this.roadMaterial) {
            this.roadMaterial.color = new THREE.Color(color);
        }
    }
    
    /**
     * 道のネットワークを読み込む
     */
    async loadRoadNetwork() {
        try {
            console.log('Scene11: Loading road network...');
            
            // ノードデータを読み込む
            const nodeResponse = await fetch('/nw/Shinjuku_node.geojson');
            const nodeData = await nodeResponse.json();
            
            // ノードIDと座標のマップを作成
            const nodeMap = new Map();
            nodeData.features.forEach((feature) => {
                nodeMap.set(feature.properties.node_id, {
                    coordinates: feature.geometry.coordinates,
                    ordinal: feature.properties.ordinal || 0
                });
            });
            
            // リンクデータを読み込む
            const linkResponse = await fetch('/nw/Shinjuku_link.geojson');
            const linkData = await linkResponse.json();
            
            // メッシュラインの配列
            const meshLines = [];
            this.roadMaterial = this.createRoadMaterial();
            
            // 座標変換の基準点（建物の座標系に合わせる）
            const positionScale = 0.01;  // 建物と同じスケール
            const roadYOffset = this.offsetY + 1;  // 道を地面の少し上に配置
            
            // 最初の建物の中心座標を基準にする
            if (!this.firstBuildingCenter) {
                console.warn('Scene11: firstBuildingCenter is not set, using first node as reference');
                const firstNode = nodeData.features[0];
                if (firstNode) {
                    this.firstBuildingCenter = new THREE.Vector3(
                        firstNode.geometry.coordinates[0],
                        0,
                        firstNode.geometry.coordinates[1]
                    );
                }
            }
            
            const baseCenter = this.firstBuildingCenter;
            
            if (!baseCenter) {
                console.error('Scene11: Cannot determine base center for road network');
                return;
            }
            
            linkData.features.forEach((feature) => {
                const coordinates = feature.geometry.coordinates;
                
                // ノードデータからstart_idとend_idの取得
                const startNode = nodeMap.get(feature.properties.start_id);
                const endNode = nodeMap.get(feature.properties.end_id);
                
                // 3次元のpointの配列を作成
                const points = coordinates.map((point, index) => {
                    let y = roadYOffset;
                    
                    // ノードのordinalを使用してY座標を設定
                    if (startNode && endNode) {
                        if (index === 0) {
                            y = roadYOffset + startNode.ordinal * 0.1;
                        } else if (index === coordinates.length - 1) {
                            y = roadYOffset + endNode.ordinal * 0.1;
                        } else {
                            y = roadYOffset + (startNode.ordinal + endNode.ordinal) / 2 * 0.1;
                        }
                    } else if (startNode) {
                        y = roadYOffset + startNode.ordinal * 0.1;
                    } else if (endNode) {
                        y = roadYOffset + endNode.ordinal * 0.1;
                    }
                    
                    // 座標変換：GeoJSON座標を建物の座標系に変換
                    let x, z;
                    if (baseCenter) {
                        x = (point[0] - baseCenter.x) * positionScale;
                        z = -(point[1] - baseCenter.z) * positionScale;  // Z軸を反転
                    } else {
                        x = point[0] * positionScale;
                        z = -point[1] * positionScale;
                    }
                    
                    // 建物のオフセットを適用（firstBuildingCenterOffsetが設定されている場合）
                    if (this.firstBuildingCenterOffset) {
                        x += this.firstBuildingCenterOffset.x;
                        z += this.firstBuildingCenterOffset.z;
                    }
                    
                    return new THREE.Vector3(x, y, z);
                });
                
                // pointの配列からMeshLineを作成
                points.forEach((point, index) => {
                    // 最後の点の場合は処理を終了
                    if (index + 1 === points.length) return;
                    
                    // MeshLineを作成。2点間のMeshLineを別々に作成する
                    const geometry = new THREE.BufferGeometry().setFromPoints([point, points[index + 1]]);
                    const line = new MeshLine();
                    line.setGeometry(geometry);
                    
                    // 2点間の距離を計算
                    const distance = point.distanceTo(points[index + 1]);
                    
                    // MeshLineの頂点数を取得
                    const numVerticesAfter = line.geometry.getAttribute('position').count;
                    
                    // 頂点数に基づいて distances 配列を生成しsetAttributeで頂点属性を追加
                    const distances = new Float32Array(numVerticesAfter).fill(distance);
                    line.setAttribute('uDistance', new THREE.BufferAttribute(distances, 1));
                    
                    // MeshLineの配列に追加
                    meshLines.push(line.geometry);
                });
            });
            
            // MeshLineをマージ
            if (meshLines.length > 0) {
                const mergedGeometry = BufferGeometryUtils.mergeGeometries(meshLines);
                const roadMesh = new THREE.Mesh(mergedGeometry, this.roadMaterial);
                roadMesh.name = 'road';
                this.roadMesh = roadMesh;
                this.scene.add(roadMesh);
                console.log(`Scene11: Road network loaded (${meshLines.length} segments)`);
            } else {
                console.warn('Scene11: No road segments found');
            }
        } catch (error) {
            console.error('Scene11: Error loading road network:', error);
        }
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
        
        if (trackNumber === 5) {
            // トラック5: 道の色を変更（velocity値で色を制御）
            const velocity = args[1] || 127.0;
            // velocityを0-255の範囲で色に変換
            const hue = (velocity / 255.0) * 360;  // 0-360度の色相
            const color = new THREE.Color().setHSL(hue / 360, 1.0, 0.5);
            this.setRoadColor(color.getHex());
            console.log(`Scene11: Road color changed to ${color.getHexString()}`);
        } else if (trackNumber === 6) {
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
        
        // 床の平面を削除
        if (this.floorPlane) {
            this.scene.remove(this.floorPlane);
            if (this.floorPlane.geometry) {
                this.floorPlane.geometry.dispose();
            }
            if (this.floorPlane.material) {
                this.floorPlane.material.dispose();
            }
            this.floorPlane = null;
        }
        
        // 道のネットワークを削除
        if (this.roadMesh) {
            this.scene.remove(this.roadMesh);
            if (this.roadMesh.geometry) {
                this.roadMesh.geometry.dispose();
            }
            if (this.roadMaterial) {
                this.roadMaterial.dispose();
            }
            this.roadMesh = null;
            this.roadMaterial = null;
        }
        
        // データをクリア
        this.buildingData = [];
        
        super.dispose();
    }
}
