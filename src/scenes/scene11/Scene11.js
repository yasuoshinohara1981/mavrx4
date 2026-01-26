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
import { loadHdrCached } from '../../lib/hdrCache.js';
import hdri from '../../assets/autumn_field_puresky_1k.hdr';

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
        
        // トラック5用：建物コールアウト表示
        this.buildingCalloutIndex = 0;  // 現在表示中の建物インデックス
        this.buildingCalloutActive = false;  // コールアウト表示中かどうか
        this.buildingCalloutEndTime = 0;  // コールアウト表示終了時刻
        this.buildingCalloutDuration = 2000;  // 各建物のコールアウト表示時間（ms）
        this.buildingCalloutCache = new Map();  // 建物のバウンディングボックスをキャッシュ
        
        // パフォーマンス計測用
        this.performanceStats = {
            frameCount: 0,
            lastLogTime: Date.now(),
            updateTimes: [],
            renderTimes: [],
            drawCalloutTimes: []
        };  // 現在表示中の建物インデックス
        this.buildingCalloutActive = false;  // コールアウト表示中かどうか
        this.buildingCalloutEndTime = 0;  // コールアウト表示終了時刻
        this.buildingCalloutDuration = 2000;  // 各建物のコールアウト表示時間（ms）
        
        // トラック1のエフェクトをデフォルトON（カメラ1のパーティクルに力を加える）
        this.trackEffects[1] = true;
        
        // GridRuler3D削除フラグ（一度だけ削除するため）
        this.gridRuler3DRemoved = false;
        
        // カメラ1を常に使用floorY
        this.currentCameraIndex = 0;
        
        // カメラ1の歩行用
        this.roadPath = [];  // 道のパス（3D座標の配列）
        this.camera1WalkSpeed = 2.0;  // カメラ1の歩行速度（単位/秒、人間の歩行速度に近づける）
        this.camera1WalkIndex = 0;  // 現在のパスインデックス
        this.camera1WalkHeight = 50;  // カメラ1の高さ（人間の目線、cm単位、floorYからのオフセット、もっと低く）
        
        // カメラ1の円周運動用（非推奨、歩行に置き換え）
        this.cityCenter = null;  // 街の中心座標（建物群の中心）
        this.camera1OrbitRadius = 2000.0;  // カメラ1の円周運動の半径（近づける）
        this.camera1OrbitSpeed = 0.05;  // カメラ1の円周運動の速度（もっとゆっくりに）
        this.camera1OrbitAngle = 0;  // カメラ1の円周運動の角度
        this.camera1OrbitHeight = -300.0;  // カメラ1のY座標（もっと下に）
        
        // 建物の生成範囲
        this.spawnRadius = 5000.0;  // 範囲を広げて間隔を確保
        this.groundY = 0;
        this.offsetY = -520;  // Y座標のオフセット（調整用、建物を少し下げる）
        this.floorY = this.offsetY - 200;  // グリッドのY座標（カメラ制限用、建物の底面もこれに合わせる、大分下げる）
        
        // 物理演算設定
        this.gravity = new THREE.Vector3(0, -9.8, 0);  // 重力
        this.physicsEnabled = false;  // 物理演算の有効/無効
        
        // ライト
        this.ambientLight = null;
        this.directionalLight = null;
        
        // エッジ表示設定
        this.showEdges = false;  // エッジ表示の有効/無効
        this.edgeColor = 0x888888;  // エッジの色（薄いグレー）
        this.edgeLineWidth = 1;  // エッジの線幅
        
        // グリッド表示設定
        this.showGridLines = true;  // グリッドの線を表示するか（デフォルト: true、gキーでトグル）
        
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
        
        // 環境マップ（HDRI）を設定 - 金属質感のために必要
        try {
            const envMap = await loadHdrCached(hdri);
            this.scene.environment = envMap;
            this.scene.environmentIntensity = 0.5;
        } catch (e) {
            console.error('HDRI load failed:', e);
        }
        
        // カメラ1を常に使用
        this.currentCameraIndex = 0;
        
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
        
        // GridRuler3Dを削除（縦のグリッドと赤い十字を削除するため）
        if (this.gridRuler3D) {
            this.gridRuler3D.dispose();
            this.scene.remove(this.gridRuler3D.group);
            this.gridRuler3D = null;
        }
        
        // シーンをトラバースしてGridRuler3Dのグループを探して削除
        this.scene.traverse((object) => {
            if (object.name === 'GridRuler3D' || (object.parent && object.parent.name === 'GridRuler3D')) {
                this.scene.remove(object);
                if (object.dispose) object.dispose();
            }
        });
        
        // 建物群のバウンディングボックスを計算（カメラ1の方向ランダマイズ用）
        this.calculateBuildingBounds();
        
        // カメラパーティクルの境界を設定（グリッドより下に行かないように）
        this.setupCameraParticleBoundaries();
        
        // 道のネットワークを読み込む（表示のみ、カメラ制御には使用しない）
        await this.loadRoadNetwork();
        
        // カメラの初期位置を設定（道のパスが読み込まれていない場合は街の中心に配置）
        if (this.cameraParticles && this.cameraParticles[0]) {
            if (this.roadPath && this.roadPath.length > 0) {
                // 道のパスが読み込まれている場合、最初の位置に設定
                const startPoint = this.roadPath[0];
                this.cameraParticles[0].position.set(
                    startPoint.x,
                    this.floorY + this.camera1WalkHeight,
                    startPoint.z
                );
                this.camera1WalkIndex = 0;
            } else if (this.cityCenter) {
                // 道のパスが読み込まれていない場合、街の中心に配置
                // 建物の範囲内に確実に配置するため、バウンディングボックスを計算
                const box = new THREE.Box3();
                this.specialBuildings.forEach(building => {
                    building.updateMatrixWorld(true);
                    const buildingBox = new THREE.Box3().setFromObject(building);
                    box.union(buildingBox);
                });
                
                if (!box.isEmpty()) {
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    // 建物の範囲内、中心から少し離れた位置に配置（建物が見えるように）
                    // 建物のサイズに応じてオフセットを調整
                    const offsetX = Math.min(size.x * 0.1, 20);  // 最大20単位、建物に近づける
                    const offsetZ = Math.min(size.z * 0.1, 20);
                    
                    const cameraPos = new THREE.Vector3(
                        center.x + offsetX,
                        this.floorY + this.camera1WalkHeight,
                        center.z + offsetZ
                    );
                    
                    this.cameraParticles[0].position.set(
                        cameraPos.x,
                        cameraPos.y,
                        cameraPos.z
                    );
                    
                    // デバッグ用：カメラの位置をログ出力
                    console.log('Camera position:', cameraPos);
                    console.log('City center:', center);
                    console.log('Building size:', size);
                } else {
                    // バウンディングボックスが空の場合は街の中心に配置
                    this.cameraParticles[0].position.set(
                        this.cityCenter.x,
                        this.floorY + this.camera1WalkHeight,
                        this.cityCenter.z
                    );
                }
            } else {
                // どちらもない場合、原点に配置
                this.cameraParticles[0].position.set(
                    0,
                    this.floorY + this.camera1WalkHeight,
                    0
                );
            }
        }
    }
    
    /**
     * カメラパーティクルの境界を設定（グリッドより下に行かないように）
     */
    setupCameraParticleBoundaries() {
        // floorYはコンストラクタで設定済み
        if (!this.floorY) {
            // floorYが設定されていない場合はスキップ
            return;
        }
        
        // カメラの最小Y座標をグリッドより少し上に設定
        const cameraMinY = this.floorY + 50;  // グリッドより50上
        
        // 全てのカメラパーティクルに境界を設定
        this.cameraParticles.forEach(cp => {
            if (cp) {
                // 既存のboxMin/boxMaxがある場合は、Y座標のみ更新
                if (cp.boxMin && cp.boxMax) {
                    cp.boxMin.y = Math.max(cp.boxMin.y, cameraMinY);
                } else {
                    // boxMin/boxMaxがない場合は、広い範囲で設定（Y座標のみ制限）
                    const largeSize = 10000.0;
                    cp.boxMin = new THREE.Vector3(-largeSize, cameraMinY, -largeSize);
                    cp.boxMax = new THREE.Vector3(largeSize, largeSize, largeSize);
                }
            }
        });
        
    }
    
    /**
     * ライトを設定
     */
    setupLights() {
        // 環境光（少し控えめに）
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(this.ambientLight);
        
        // 指向性ライト（メインライト）
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        this.directionalLight.position.set(1000, 2000, 1000);
        this.directionalLight.castShadow = true;
        
        // fillLightは削除（のっぺり感を減らすため）
        
        // シャドウマップの設定（範囲を広げて全建物にシャドウが出るように）
        this.directionalLight.shadow.mapSize.width = 2048;  // 解像度を下げてパフォーマンス改善
        this.directionalLight.shadow.mapSize.height = 2048;
        this.directionalLight.shadow.camera.near = 0.5;
        this.directionalLight.shadow.camera.far = 10000;  // 遠くまで見えるように
        this.directionalLight.shadow.camera.left = -5000;  // 範囲を広げる
        this.directionalLight.shadow.camera.right = 5000;
        this.directionalLight.shadow.camera.top = 5000;
        this.directionalLight.shadow.camera.bottom = -5000;
        
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
            color: 0x333333,  // 濃いグレー
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
            // デフォルト値で床を作成
            const defaultFloorSize = 10000;  // デフォルトの床サイズ
            const defaultCenter = new THREE.Vector3(0, 0, 0);
            const floorY = this.floorY;
            
            // 床のグリッドを追加（斜めの線を避けるためGridHelperを使用）
            // GridHelperはデフォルトでXZ平面（水平面）に配置されるので回転不要
            const divisions = Math.ceil(defaultFloorSize / 100);
            const gridHelper = new THREE.GridHelper(defaultFloorSize, divisions, 0x888888, 0x888888);
            gridHelper.position.set(defaultCenter.x, floorY, defaultCenter.z);
            this.floorPlane = gridHelper;
            this.scene.add(gridHelper);
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
        
        // サイズが無効な場合はデフォルト値を使用
        if (isNaN(size.x) || isNaN(size.y) || isNaN(size.z) || 
            size.x <= 0 || size.y <= 0 || size.z <= 0) {
            const defaultFloorSize = 10000;
            const floorY = this.floorY;
            
            const floorGeometry = new THREE.PlaneGeometry(defaultFloorSize, defaultFloorSize);
            const floorMaterial = new THREE.MeshStandardMaterial({
                color: 0x888888,  // グレー
                wireframe: true,  // ワイヤーフレーム表示
                side: THREE.DoubleSide
            });
            this.floorPlane = new THREE.Mesh(floorGeometry, floorMaterial);
            this.floorPlane.rotation.x = -Math.PI / 2;
            this.floorPlane.position.set(0, floorY, 0);
            this.floorPlane.receiveShadow = true;
            this.scene.add(this.floorPlane);
            return;
        }
        
        // グリッドのパラメータを設定
        // 建物の範囲に少し余白を追加
        const padding = 100;  // 余白
        const gridSize = {
            x: size.x + padding * 2,
            y: size.y + padding * 2,
            z: size.z + padding * 2
        };
        
        // グリッドを初期化
        const floorY = this.floorY;  // コンストラクタで設定済み
        const floorSize = Math.max(gridSize.x, gridSize.z) * 1.2;  // 床のサイズ
        
        // floorSizeが無効な場合はデフォルト値を使用
        if (isNaN(floorSize) || floorSize <= 0 || !isFinite(floorSize)) {
            const defaultFloorSize = 10000;
            
            // 床のグリッドを追加（斜めの線を避けるためGridHelperを使用）
            // GridHelperはデフォルトでXZ平面（水平面）に配置されるので回転不要
            const divisions = Math.ceil(defaultFloorSize / 100);
            const gridHelper = new THREE.GridHelper(defaultFloorSize, divisions, 0x888888, 0x888888);
            gridHelper.position.set(center.x || 0, floorY, center.z || 0);
            this.floorPlane = gridHelper;
            this.scene.add(gridHelper);
            return;
        }
        
        // グリッドの線を表示するかどうかでフラグを設定
        this.showGridRuler3D = false;  // GridRuler3Dを無効化（縦のグリッドと赤い十字を削除）
        
        // 既存のGridRuler3Dを削除（縦のグリッドと赤い十字を削除するため）
        if (this.gridRuler3D) {
            this.gridRuler3D.dispose();
            this.scene.remove(this.gridRuler3D.group);
            this.gridRuler3D = null;
        }
        
        // GridRuler3Dは無効化（縦のグリッドと赤い十字が表示されるため）
        // if (this.showGridLines) {
        //     // labelMaxを都市のサイズに合わせて動的に設定
        //     const maxSize = Math.max(gridSize.x, gridSize.y, gridSize.z);
        //     const labelMax = Math.ceil(maxSize / 100) * 100;  // 100の倍数に切り上げ
        //     
        //     this.initGridRuler3D({
        //         center: center,
        //         size: gridSize,
        //         floorY: floorY,
        //         floorSize: floorSize,
        //         floorDivisions: 40,
        //         divX: 2,  // 分割数をさらに減らして赤い十字を減らす
        //         divY: 2,
        //         divZ: 2,
        //         labelMax: labelMax,  // 都市のサイズに合わせて動的に設定
        //         color: 0xffffff,
        //         opacity: 0.5
        //     });
        // }
        
        // 床のグリッドを追加（斜めの線を避けるためGridHelperを使用）
        // GridHelperはデフォルトでXZ平面（水平面）に配置されるので回転不要
        const floorGridSize = Math.max(floorSize, 1000);  // 最小サイズを確保
        const divisions = Math.ceil(floorGridSize / 100);  // 100単位ごとに分割
        const gridHelper = new THREE.GridHelper(floorGridSize, divisions, 0x888888, 0x888888);
        gridHelper.position.set(center.x, floorY, center.z);
        this.floorPlane = gridHelper;  // 後で削除できるように保存
        this.scene.add(gridHelper);
    }
    
    /**
     * 建物群のバウンディングボックスを計算（街の中心を取得）
     */
    calculateBuildingBounds() {
        if (this.specialBuildings.length === 0) {
            return;
        }
        
        const box = new THREE.Box3();
        
        this.specialBuildings.forEach(building => {
            building.updateMatrixWorld(true);
            const buildingBox = new THREE.Box3().setFromObject(building);
            box.union(buildingBox);
        });
        
        // 街の中心を計算
        this.cityCenter = box.getCenter(new THREE.Vector3());
    }
    
    /**
     * 特殊な形状の建物（3Dモデル）を読み込む
     * Project PLATEAUのOBJデータを読み込む
     */
    async loadSpecialBuildings() {
        // LOD2のOBJファイルを読み込む（テクスチャ付き、より詳細）
        const lod2BasePath = '/assets/533946_2/LOD2';
        
        const objLoader = new OBJLoader();
        const mtlLoader = new MTLLoader();
        
        // 読み込みカウンター
        let loadedCount = 0;
        let skippedCount = 0;
        const maxLoadCount = 29;  // LOD2には29個のフォルダがある（全て読み込む）
        
        // 順次読み込みに戻す（確実に全て読み込むため）
        // LOD2の全フォルダを順次読み込む（フォルダ名は533946001から始まる）
        for (let i = 1; i <= maxLoadCount; i++) {
            const folder = `533946${String(i).padStart(3, '0')}`;
            
            const objPath = `${lod2BasePath}/${folder}/${folder}_bldg_6677.obj`;
            const mtlPath = `${lod2BasePath}/${folder}/materials.mtl`;
            
            try {
                let model = null;
                
                // MTLファイルがある場合は先に読み込む（テクスチャパスも設定）
                // テクスチャは読み込まない（パフォーマンス改善のため）
                try {
                    // MTLファイルのパスを設定（テクスチャの読み込み用）
                    mtlLoader.setPath(`${lod2BasePath}/${folder}/`);
                    const materials = await mtlLoader.loadAsync('materials.mtl');
                    materials.preload();
                    
                    // テクスチャを無効化（パフォーマンス改善）
                    Object.keys(materials.materials).forEach(key => {
                        const mat = materials.materials[key];
                        // テクスチャマップを全て無効化
                        mat.map_Kd = null;
                        mat.map_Ks = null;
                        mat.map_Bump = null;
                        mat.map_Normal = null;
                    });
                    
                    objLoader.setMaterials(materials);
                } catch (mtlError) {
                    // MTLファイルがない場合はスキップ（OBJのみで読み込む）
                    // MTLがない場合でもOBJは読み込めるので続行
                }
                
                // OBJファイルを読み込む（404エラーはOBJLoaderでキャッチされる）
                try {
                    model = await objLoader.loadAsync(objPath);
                } catch (objError) {
                    // OBJファイルが存在しない、または404エラーの場合はスキップ
                    skippedCount++;
                    continue;
                }
                
                if (!model) {
                    skippedCount++;
                    continue;
                }
                
                // モデルがHTML（404エラーページ）でないかチェック
                // OBJLoaderがHTMLを返した場合、model.childrenが空または不正な形式になる
                if (model.children.length === 0) {
                    skippedCount++;
                    continue;
                }
                
                // モデルが有効かどうかを確認（geometryが存在するか、NaN値がないか）
                let hasValidGeometry = false;
                let hasNaNValues = false;
                
                model.traverse((child) => {
                    if (child.isMesh && child.geometry) {
                        const position = child.geometry.attributes.position;
                        if (position && position.count > 0) {
                            // NaN値がないかチェック（最初の100個だけチェックして高速化）
                            const positions = position.array;
                            for (let j = 0; j < Math.min(100, positions.length); j++) {
                                if (isNaN(positions[j]) || !isFinite(positions[j])) {
                                    hasNaNValues = true;
                                    break;
                                }
                            }
                            if (!hasNaNValues) {
                                hasValidGeometry = true;
                            }
                        }
                    }
                });
                
                // NaN値があっても、geometryが存在すれば続行（バウンディングボックス計算時に再度チェック）
                if (!hasValidGeometry) {
                    skippedCount++;
                    continue;
                }
                
                loadedCount++;
                    
                // モデルの設定
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        
                        // マテリアルをMeshStandardMaterialに変換（黒っぽい金属質感）
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                const newMaterials = [];
                                for (let i = 0; i < child.material.length; i++) {
                                    const oldMat = child.material[i];
                                    const newMat = new THREE.MeshStandardMaterial({
                                        color: new THREE.Color(0x1a1a1a),  // 黒っぽい色
                                        metalness: 1.0,
                                        roughness: 0.05,  // より滑らかに
                                        envMapIntensity: 2.0  // 環境マップの強度を上げる
                                    });
                                    newMaterials.push(newMat);
                                    if (oldMat.dispose) oldMat.dispose();
                                }
                                child.material = newMaterials;
                            } else {
                                const oldMat = child.material;
                                const newMat = new THREE.MeshStandardMaterial({
                                    color: new THREE.Color(0x1a1a1a),  // 黒っぽい色
                                    metalness: 1.0,
                                    roughness: 0.05,  // より滑らかに
                                    envMapIntensity: 2.0  // 環境マップの強度を上げる
                                });
                                if (oldMat.dispose) oldMat.dispose();
                                child.material = newMat;
                            }
                        }
                        
                        // エッジを追加（geometryが有効な場合のみ）
                        if (this.showEdges && child.geometry) {
                            // geometryにNaN値がないかチェック
                            const position = child.geometry.attributes.position;
                            if (position && position.count > 0) {
                                const positions = position.array;
                                let hasNaN = false;
                                for (let i = 0; i < Math.min(100, positions.length); i++) {
                                    if (isNaN(positions[i]) || !isFinite(positions[i])) {
                                        hasNaN = true;
                                        break;
                                    }
                                }
                                if (!hasNaN) {
                                    try {
                                        const edgesGeometry = new THREE.EdgesGeometry(child.geometry);
                                        const edgesMaterial = new THREE.LineBasicMaterial({ 
                                            color: this.edgeColor,
                                            linewidth: this.edgeLineWidth
                                        });
                                        const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
                                        child.add(edges);
                                    } catch (edgeError) {
                                    }
                                }
                            }
                        }
                    }
                });
                
                // 座標の調整（Qiita記事参考：座標が中央から離れているので調整が必要）
                // 参考: https://qiita.com/ProjectPLATEAU/items/a5a64d681045ea2f76b6
                
                // 回転前に元の座標（PLATEAU実座標）を取得
                // モデルが正しく読み込まれているか確認
                model.updateMatrixWorld(true);
                
                // geometryのNaN値をチェック（バウンディングボックス計算前に）
                // ただし、NaN値があってもバウンディングボックス計算を試みる（エラーが出たらスキップ）
                let geometryHasNaN = false;
                try {
                    model.traverse((child) => {
                        if (child.isMesh && child.geometry) {
                            const position = child.geometry.attributes.position;
                            if (position) {
                                const positions = position.array;
                                for (let j = 0; j < Math.min(100, positions.length); j++) {  // 最初の100個だけチェック
                                    if (isNaN(positions[j]) || !isFinite(positions[j])) {
                                        geometryHasNaN = true;
                                        return;
                                    }
                                }
                            }
                        }
                    });
                } catch (checkError) {
                    geometryHasNaN = true;
                }
                
                // NaN値があっても、バウンディングボックス計算を試みる
                let boxBefore;
                try {
                    boxBefore = new THREE.Box3().setFromObject(model);
                } catch (boxError) {
                    skippedCount++;
                    continue;
                }
                
                // バウンディングボックスが有効かどうかを確認
                const boxSize = boxBefore.getSize(new THREE.Vector3());
                if (isNaN(boxSize.x) || isNaN(boxSize.y) || isNaN(boxSize.z) ||
                    boxSize.x <= 0 || boxSize.y <= 0 || boxSize.z <= 0) {
                    skippedCount++;
                    continue;
                }
                
                const originalCenter = boxBefore.getCenter(new THREE.Vector3());
                
                // 中心座標が有効かどうかを確認
                if (isNaN(originalCenter.x) || isNaN(originalCenter.y) || isNaN(originalCenter.z)) {
                    skippedCount++;
                    continue;
                }
                
                // 最初の建物の座標を基準として保存
                if (this.specialBuildings.length === 0) {
                    this.firstBuildingCenter = originalCenter.clone();
                }
                
                // スケールを調整（記事では0.3推奨）
                const modelScale = 1.0;
                model.scale.set(modelScale, modelScale, modelScale);
                
                // 回転を調整（縦向きになっているのを修正）
                model.rotation.x = -Math.PI / 2;  // X軸で-90度回転
                
                // 回転後にバウンディングボックスを計算（Y座標用）
                model.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(model);
                
                // バウンディングボックスが有効かどうかを確認
                const size = box.getSize(new THREE.Vector3());
                if (isNaN(size.x) || isNaN(size.y) || isNaN(size.z) ||
                    size.x <= 0 || size.y <= 0 || size.z <= 0) {
                    skippedCount++;
                    continue;
                }
                
                const center = box.getCenter(new THREE.Vector3());
                const min = box.min;  // バウンディングボックスの最小値（底面）
                
                // 中心座標が有効かどうかを確認
                if (isNaN(center.x) || isNaN(center.y) || isNaN(center.z) ||
                    isNaN(min.x) || isNaN(min.y) || isNaN(min.z)) {
                    skippedCount++;
                    continue;
                }
                
                // PLATEAUの元の座標から相対位置を計算（位置関係を保つ）
                // 座標をスケールダウンして画面内に収める
                const positionScale = 0.01;  // 1/100にスケールダウン
                const relativeX = (originalCenter.x - this.firstBuildingCenter.x) * positionScale;
                const relativeZ = (originalCenter.z - this.firstBuildingCenter.z) * positionScale;
                
                // 建物を配置
                // 全ての建物を同じ座標系で配置（最初の建物のcenterオフセット + 相対位置）
                if (this.specialBuildings.length === 0) {
                    // 最初の建物：centerオフセットを保存
                    this.firstBuildingCenterOffset = new THREE.Vector3(-center.x, 0, -center.z);
                }
                
                // Y座標：建物の底面をfloorYに合わせる
                // 各建物の底面（min.y）を直接floorYに合わせる
                const yPosition = this.floorY - min.y;
                
                // 全ての建物：最初の建物のcenterオフセット + 相対位置
                model.position.set(
                    this.firstBuildingCenterOffset.x + relativeX,
                    yPosition,
                    this.firstBuildingCenterOffset.z + relativeZ
                );
                
                // シーンに追加（最初の建物も含めて全て同じ処理）
                this.scene.add(model);
                this.specialBuildings.push(model);
                
                // 物理演算用のParticleインスタンスを作成（建物の位置）
                const particle = new Particle(
                    this.firstBuildingCenterOffset.x + relativeX,
                    yPosition,  // 建物のY位置（底面がfloorYに合わせた位置）
                    this.firstBuildingCenterOffset.z + relativeZ
                );
                particle.friction = 0.98;  // 摩擦を強めに設定
                particle.maxSpeed = 50.0;  // 最大速度
                this.buildingParticles.push(particle);
                
            } catch (error) {
                skippedCount++;
                // エラーが発生しても続行
            }
        }
        
        if (loadedCount === 0) {
            console.error('Scene11: No buildings were loaded! Check file paths and console for errors.');
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
            
            // 道のパスを保存（カメラの歩行用）
            this.roadPath = [];
            
            // 座標変換の基準点（建物の座標系に合わせる）
            const positionScale = 0.01;  // 建物と同じスケール
            const roadYOffset = this.offsetY + 1;  // 道を地面の少し上に配置
            
            // 最初の建物の中心座標を基準にする
            if (!this.firstBuildingCenter) {
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
                
                // 道のパスに追加（カメラの歩行用）
                this.roadPath.push(...points);
                
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
            }
            
            // カメラの初期位置を道のパスの最初の位置に設定（loadRoadNetwork内では設定しない）
            // setup()の最後で統一して設定するため、ここでは設定しない
        } catch (error) {
            // Error loading road network
        }
    }
    
    /**
     * カメラの位置を更新
     */
    updateCamera() {
        if (this.cameraParticles[this.currentCameraIndex]) {
            const cameraPos = this.cameraParticles[this.currentCameraIndex].getPosition();
            this.camera.position.copy(cameraPos);
            
            // カメラ1は街の中心を見る
            if (this.currentCameraIndex === 0 && this.cityCenter) {
                this.camera.lookAt(this.cityCenter);
            } else {
                // デフォルトは原点を見る
                this.camera.lookAt(0, 0, 0);
            }
            
            this.camera.matrixWorldNeedsUpdate = false;
        }
    }
    
    
    /**
     * カメラ1を道の上を歩かせる
     */
    updateCamera1Walk(deltaTime) {
        // 道のパスが読み込まれていない場合、街の中心に近い位置にカメラを配置
        if (!this.roadPath || this.roadPath.length === 0) {
            if (this.cityCenter && this.cameraParticles && this.cameraParticles[0]) {
                // 街の中心にカメラを配置
                this.cameraParticles[0].position.set(
                    this.cityCenter.x,
                    this.floorY + this.camera1WalkHeight,
                    this.cityCenter.z
                );
            }
            return;
        }
        
        if (!this.cameraParticles || !this.cameraParticles[0]) {
            return;
        }
        
        // 現在のパスインデックスを更新
        const distance = this.camera1WalkSpeed * deltaTime;  // 速度を単位/秒に変換（deltaTimeは秒単位）
        
        // 現在の位置から次のポイントまでの距離を計算
        let currentIndex = Math.floor(this.camera1WalkIndex);
        if (currentIndex >= this.roadPath.length - 1) {
            // パスの終端に達したら最初に戻る
            this.camera1WalkIndex = 0;
            currentIndex = 0;
        }
        
        const currentPoint = this.roadPath[currentIndex];
        const nextIndex = Math.min(currentIndex + 1, this.roadPath.length - 1);
        const nextPoint = this.roadPath[nextIndex];
        
        // 現在のセグメントの長さを計算
        const segmentLength = currentPoint.distanceTo(nextPoint);
        
        // セグメント内での進捗を計算
        const segmentProgress = this.camera1WalkIndex - currentIndex;
        const segmentDistance = segmentProgress * segmentLength;
        
        // 進む距離をセグメントに適用
        let remainingDistance = distance;
        let newIndex = this.camera1WalkIndex;
        
        while (remainingDistance > 0 && newIndex < this.roadPath.length - 1) {
            const idx = Math.floor(newIndex);
            const nextIdx = Math.min(idx + 1, this.roadPath.length - 1);
            const p1 = this.roadPath[idx];
            const p2 = this.roadPath[nextIdx];
            const segLen = p1.distanceTo(p2);
            
            const localProgress = newIndex - idx;
            const remainingInSegment = (1 - localProgress) * segLen;
            
            if (remainingDistance <= remainingInSegment) {
                // 現在のセグメント内で完結
                newIndex += remainingDistance / segLen;
                remainingDistance = 0;
            } else {
                // 次のセグメントに進む
                newIndex = nextIdx;
                remainingDistance -= remainingInSegment;
            }
        }
        
        // パスの終端に達したら最初に戻る
        if (newIndex >= this.roadPath.length - 1) {
            newIndex = 0;
        }
        
        this.camera1WalkIndex = newIndex;
        
        // 現在の位置を補間で計算
        const idx = Math.floor(this.camera1WalkIndex);
        const nextIdx = Math.min(idx + 1, this.roadPath.length - 1);
        const t = this.camera1WalkIndex - idx;
        
        const p1 = this.roadPath[idx];
        const p2 = this.roadPath[nextIdx];
        
        // 位置を補間
        const x = p1.x + (p2.x - p1.x) * t;
        const z = p1.z + (p2.z - p1.z) * t;
        const y = this.floorY + this.camera1WalkHeight;  // 人間の目線の高さ
        
        // カメラパーティクル1の位置を設定
        this.cameraParticles[0].position.set(x, y, z);
        // 速度と力をリセット（物理演算の影響を無効化）
        this.cameraParticles[0].velocity.set(0, 0, 0);
        this.cameraParticles[0].force.set(0, 0, 0);
        this.cameraParticles[0].acceleration.set(0, 0, 0);
    }
    
    /**
     * カメラ1を円周運動させる（非推奨、歩行に置き換え）
     */
    updateCamera1Orbit(deltaTime) {
        if (!this.cityCenter || !this.cameraParticles || !this.cameraParticles[0]) {
            if (!this.cityCenter) {
            }
            return;
        }
        
        // 角度を更新
        this.camera1OrbitAngle += this.camera1OrbitSpeed * deltaTime;
        
        // 円周上の位置を計算
        const x = this.cityCenter.x + Math.cos(this.camera1OrbitAngle) * this.camera1OrbitRadius;
        const z = this.cityCenter.z + Math.sin(this.camera1OrbitAngle) * this.camera1OrbitRadius;
        const y = this.camera1OrbitHeight;  // Y座標は0に近い値（街の中心のY座標ではなく固定値）
        
        // カメラパーティクル1の位置を設定
        this.cameraParticles[0].position.set(x, y, z);
        // 速度と力をリセット（物理演算の影響を無効化）
        this.cameraParticles[0].velocity.set(0, 0, 0);
        this.cameraParticles[0].force.set(0, 0, 0);
        this.cameraParticles[0].acceleration.set(0, 0, 0);
        
    }
    
    /**
     * 更新処理（毎フレーム呼ばれる）
     */
    onUpdate(deltaTime) {
        // GridRuler3Dを確実に削除（縦のグリッドと赤い十字を削除するため、毎フレームチェック）
        if (this.scene) {
            // GridRuler3Dインスタンスを削除
            if (this.gridRuler3D) {
                this.gridRuler3D.dispose();
                if (this.gridRuler3D.group) {
                    this.scene.remove(this.gridRuler3D.group);
                }
                this.gridRuler3D = null;
            }
            
            // シーンをトラバースしてGridRuler3Dのグループを探して削除
            this.scene.traverse((object) => {
                if (object.name === 'GridRuler3D' || (object.parent && object.parent.name === 'GridRuler3D')) {
                    this.scene.remove(object);
                    if (object.dispose) object.dispose();
                }
            });
        }
        
        // 時間を更新
        this.time += deltaTime;
        
        // 親クラスの更新処理を先に呼ぶ
        super.onUpdate(deltaTime);
        
        // カメラの位置を更新
        this.updateCamera();
        
        // 物理演算が有効な場合、建物を更新
        if (this.physicsEnabled && this.buildingParticles.length > 0) {
            for (let i = 0; i < this.buildingParticles.length; i++) {
                const particle = this.buildingParticles[i];
                const building = this.specialBuildings[i];
                
                if (!particle || !building) continue;
                
                particle.addForce(this.gravity);
                particle.update();
                
                const pos = particle.getPosition();
                if (pos.y < this.groundY) {
                    pos.y = this.groundY;
                    particle.velocity.y *= -0.5;
                    particle.velocity.x *= 0.8;
                    particle.velocity.z *= 0.8;
                }
                
                building.position.copy(pos);
            }
        }
        
        // 建物のコールアウト表示を更新
        this.updateBuildingCallout();

    }
    
    /**
     * OSCメッセージの処理（SceneBase.handleOSC()をオーバーライド）
     */
    handleOSC(message) {
        // /phase/メッセージを処理（/phase/ または /phase の両方に対応）
        if (message.address === '/phase/' || message.address === '/phase') {
            const args = message.args || [];
            if (args.length > 0) {
                const phaseValue = typeof args[0] === 'number' ? args[0] : parseFloat(args[0]);
                if (!isNaN(phaseValue)) {
                    this.phase = Math.floor(phaseValue);  // integerとして保存
                }
            }
            return;  // 処理済み
        }
        
        // /actual_tick/メッセージを処理（/actual_tick/ または /actual_tick の両方に対応）
        if (message.address === '/actual_tick/' || message.address === '/actual_tick' || message.address === '/tick/' || message.address === '/tick') {
            const args = message.args || [];
            if (args.length > 0) {
                const tickValue = typeof args[0] === 'number' ? args[0] : parseFloat(args[0]);
                if (!isNaN(tickValue)) {
                    this.actualTick = Math.floor(tickValue);  // integerとして保存
                }
            }
            return;  // 処理済み
        }
        
        // /kit/メッセージを処理（/kit/ または /kit の両方に対応）
        // 注意: このメッセージはSceneManagerで処理されるため、ここでは処理しない
        // SceneManagerでシーン切り替えが行われる
        
        const trackNumber = message.trackNumber;
        
        // trackEffectsの状態をチェック（オフの場合は処理をスキップ）
        if (trackNumber >= 1 && trackNumber <= 9 && !this.trackEffects[trackNumber]) {
            return;
        }
        
        // トラック1はhandleTrackNumberで処理（他のシーン同様にswitchCameraRandom()を呼ぶ）
        // 他のトラックは親クラスの処理を呼ぶ
        super.handleOSC(message);
    }
    
    /**
     * OSCメッセージの処理
     */
    handleTrackNumber(trackNumber, message) {
        const args = message.args || [];
        
        // トラック1: カメラをランダムに切り替え（他のシーン同様）
        if (trackNumber === 1) {
            this.switchCameraRandom();
            return;
        }
        
        // 他のトラックは通常通り処理
        super.handleTrackNumber(trackNumber, message);
        
        if (trackNumber === 5) {
            // トラック5: 建物情報をコールアウト表示
            const velocity = args[1] || 127.0;
            // velocity値に応じてコールアウト表示を開始/継続
            if (velocity > 0) {
                this.startBuildingCallout();
            }
            // 道の色変更は削除（建物情報表示に変更）
        } else if (trackNumber === 6) {
            // トラック6: 物理演算ON/OFF
            this.physicsEnabled = !this.physicsEnabled;
        } else if (trackNumber === 7) {
            // トラック7: 中心から放射状に爆発
            this.applyExplosionForce(new THREE.Vector3(0, 0, 0), 1000.0, 50.0);
        }
    }
    
    /**
     * 建物コールアウト表示を開始
     */
    startBuildingCallout() {
        if (this.specialBuildings.length === 0) {
            return;
        }
        
        this.buildingCalloutActive = true;
        this.buildingCalloutIndex = 0;
        this.buildingCalloutEndTime = Date.now() + this.buildingCalloutDuration;
    }
    
    /**
     * 建物コールアウト表示を更新
     */
    updateBuildingCallout() {
        if (!this.buildingCalloutActive) {
            return;
        }
        
        const currentTime = Date.now();
        
        // 現在の建物の表示時間が終了したら次の建物へ
        if (currentTime >= this.buildingCalloutEndTime) {
            this.buildingCalloutIndex++;
            
            // 全ての建物を表示し終えたら終了
            if (this.buildingCalloutIndex >= this.specialBuildings.length) {
                this.buildingCalloutActive = false;
                this.buildingCalloutIndex = 0;
                return;
            }
            
            // 次の建物の表示時間を設定
            this.buildingCalloutEndTime = currentTime + this.buildingCalloutDuration;
        }
    }
    
    /**
     * 建物のコールアウトを描画
     */
    drawBuildingCallout(building, index) {
        if (!this.hud || !this.hud.ctx) return;
        
        const ctx = this.hud.ctx;
        const canvas = this.hud.canvas;
        
        // バウンディングボックスをキャッシュから取得（なければ計算してキャッシュ）
        let cachedData = this.buildingCalloutCache.get(building);
        if (!cachedData) {
            // 初回のみ計算（重たい処理）
            building.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(building);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            cachedData = { center, size };
            this.buildingCalloutCache.set(building, cachedData);
        }
        
        const center = cachedData.center;
        const size = cachedData.size;
        
        // 建物の中心位置を2D座標に変換（毎フレーム必要）
        const buildingCenter3D = center.clone();
        buildingCenter3D.project(this.camera);
        
        // 画面座標に変換
        const centerScreenX = (buildingCenter3D.x * 0.5 + 0.5) * canvas.width;
        const centerScreenY = (buildingCenter3D.y * -0.5 + 0.5) * canvas.height;
        
        // 画面外の場合は描画しない
        if (centerScreenX < 0 || centerScreenX > canvas.width || 
            centerScreenY < 0 || centerScreenY > canvas.height ||
            buildingCenter3D.z > 1.0) {
            return;
        }
        
        // 建物の上端の3D位置を計算
        const buildingTop3D = new THREE.Vector3(center.x, center.y + size.y / 2, center.z);
        buildingTop3D.project(this.camera);
        
        // 建物の上端の画面座標
        const startX = (buildingTop3D.x * 0.5 + 0.5) * canvas.width;
        const startY = (buildingTop3D.y * -0.5 + 0.5) * canvas.height;
        
        // 画面の位置に応じてコールアウトの方向を自動決定
        const screenCenterX = canvas.width / 2;
        const useRight = centerScreenX >= screenCenterX;
        
        // 角度を調整
        const distanceFromCenter = Math.abs(centerScreenX - screenCenterX) / screenCenterX;
        const minAngle = Math.PI / 2;
        const maxAngle = Math.PI * 0.85;
        const diagonalAngle = minAngle + (maxAngle - minAngle) * distanceFromCenter;
        
        const diagonalDirX = useRight ? Math.cos(diagonalAngle) : -Math.cos(diagonalAngle);
        const diagonalDirY = -Math.sin(diagonalAngle);
        
        // 斜めの線の長さ
        const diagonalLength = 80.0;
        const end1X = startX + diagonalDirX * diagonalLength;
        const end1Y = startY + diagonalDirY * diagonalLength;
        
        // 水平線
        const horizontalLength = 200.0;
        const end2X = end1X + horizontalLength;
        const end2Y = end1Y;
        
        // 線を描画
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.78)';
        
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(end1X, end1Y);
        ctx.moveTo(end1X, end1Y);
        ctx.lineTo(end2X, end2Y);
        ctx.stroke();
        
        // テキストを描画
        ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
        ctx.font = '16px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        
        const lineHeight = 20;
        const textX = end2X + 10;
        let textY = end2Y - 120;
        
        // カメラからの距離を計算
        const cameraPos = this.camera.position;
        const distance = center.distanceTo(cameraPos);
        
        // 建物情報を表示
        ctx.fillText('BUILDING INFO', textX, textY);
        textY += lineHeight;
        ctx.fillText(`ID: ${index + 1}`, textX, textY);
        textY += lineHeight;
        ctx.fillText(`X: ${center.x.toFixed(2)}`, textX, textY);
        textY += lineHeight;
        ctx.fillText(`Y: ${center.y.toFixed(2)}`, textX, textY);
        textY += lineHeight;
        ctx.fillText(`Z: ${center.z.toFixed(2)}`, textX, textY);
        textY += lineHeight;
        ctx.fillText(`W: ${size.x.toFixed(2)}`, textX, textY);
        textY += lineHeight;
        ctx.fillText(`H: ${size.y.toFixed(2)}`, textX, textY);
        textY += lineHeight;
        ctx.fillText(`D: ${size.z.toFixed(2)}`, textX, textY);
        textY += lineHeight;
        ctx.fillText(`DST: ${distance.toFixed(2)}`, textX, textY);
        
        ctx.restore();
    }
    
    /**
     * 描画処理（オーバーライド）
     */
    render() {
        // SceneBaseのrenderメソッドを使用
        super.render();
        
        // 建物のコールアウトを描画（HUDの後に描画）
        if (this.buildingCalloutActive && this.hud && this.hud.ctx) {
            const building = this.specialBuildings[this.buildingCalloutIndex];
            if (building) {
                this.drawBuildingCallout(building, this.buildingCalloutIndex);
            }
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
