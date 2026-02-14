/**
 * Scene11: 街の3Dモデル表示（Project PLATEAU）
 */

import { SceneTemplate } from '../SceneTemplate.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import { Particle } from '../../lib/Particle.js';
import { PlayerParticle } from '../../lib/PlayerParticle.js';
import { Scene11_CircleEffect } from './Scene11_CircleEffect.js';
import { MeshLine, MeshLineMaterial } from 'three.meshline';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadHdrCached } from '../../lib/hdrCache.js';
import hdri from '../../assets/autumn_field_puresky_1k.hdr';

export class Scene11 extends SceneTemplate {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera, sharedResourceManager);
        this.title = 'mathym | chp-pi413';
        this.sceneNumber = 11;
        this.kitNo = 33;
        
        // 建物の設定
        this.specialBuildings = [];
        this.demObjects = [];
        this.buildingParticles = [];
        this.firstBuildingCenter = null;
        this.totalBuildingCount = 0;
        
        // トラック5用：建物コールアウト表示（ポリフォニック対応）
        this.activeCallouts = []; // 現在表示中のコールアウトのリスト
        this.buildingCalloutDuration = 2000;
        this.buildingCalloutCache = new Map();
        
        // エフェクト状態管理
        this.trackEffects[1] = true;
        this.trackEffects[2] = true;
        this.trackEffects[3] = true;
        this.trackEffects[4] = true;
        
        this.currentCameraIndex = 0;
        this.camera1WalkHeight = 2.0;
        
        // 建物の生成範囲
        this.spawnRadius = 100.0;  
        this.groundY = 0;
        this.floorY = -0.1;
        
        // 物理演算設定
        this.gravity = new THREE.Vector3(0, -0.098, 0);
        this.physicsEnabled = false;
        
        this.ambientLight = null;
        this.directionalLight = null;
        
        this.showBuildings = true;
        this.roadColor = 0xff0000;

        // エフェクト設定
        this.useBuildingTextures = false; // 重いので一時的にオフに設定
        this.useBuildingBumpMap = false;  // バンプマップ（ザラザラ感）を使用するかどうかのフラグ
        this.useDOF = true;              // SceneBaseのフラグを使用

        // バンプマップ用のノイズテクスチャ
        this.noiseTexture = null;
        if (this.useBuildingBumpMap) {
            this.noiseTexture = this.generateNoiseTexture();
            if (this.noiseTexture) {
                this.noiseTexture.matrix = new THREE.Matrix3();
            }
        }

        // プレイヤーパーティクルの初期化（初期高度をさらに低く設定）
        this.player = new PlayerParticle(0, 1.5, 0);

        // トラック6用：Circleエフェクト
        this.circleEffects = [];

        // プレイヤー可視化用のデバッグオブジェクト（非表示に設定）
        const playerGeo = new THREE.SphereGeometry(5, 32, 32);
        const playerMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.playerMesh = new THREE.Mesh(playerGeo, playerMat);
        this.playerMesh.visible = false; // 最初から非表示
        this.scene.add(this.playerMesh);

        // プレイヤー周囲を照らす赤いライト
        this.playerLight = new THREE.PointLight(0xff0000, 100.0, 2000);
        this.scene.add(this.playerLight);
    }
    
    async setup() {
        // console.log('=== Scene11 setup() START ===');
        
        // スクリーンショット用テキストを更新
        this.setScreenshotText(this.title);

        // カメラの描画距離を大幅に伸ばす
        if (this.camera) {
            this.camera.far = 100000;
            this.camera.updateProjectionMatrix();
        }

        await super.setup();
        
            // 環境マップ（HDRI）を設定
        try {
            const envMap = await loadHdrCached(hdri);
            this.scene.environment = envMap;
            this.scene.environmentIntensity = 2.5; // 金属質感を強調するために強度アップ
            
            // 3D空間としての夕焼け空（スカイスフィア）を作成
            this.createSkysphere();

            // モノトーンの空気感を出すためにフォグをグレーに調整
            this.scene.fog = new THREE.FogExp2(0x333333, 0.00015);
        } catch (e) {
            console.error('HDRI load failed:', e);
        }
        
        this.currentCameraIndex = 0;
        this.setupLights();
        
        // 読み込み開始
        await this.loadSpecialBuildings();
        await this.loadDEM();
        
        this.updateBuildingCount();
        this.setupBuildingGrid();
        this.calculateBuildingBounds();
        this.centerAllObjects();  // 全オブジェクトの中心を0,0,0にずらす
        this.generateBuildingWalkPath();
        
        // プレイヤーの初期位置をリセット（オブジェクト移動後に合わせる）
        if (this.player) {
            this.player.position.set(0, 1.5, 0); // 3 → 1.5（さらに地面に近づける）
            this.player.velocity.set(0, 0, 0);
            this.player.updateTarget(); // 新しい中心付近でターゲット再設定
        }
        
        // カメラの初期位置を強制的に設定（スケール1.0に合わせて調整）
        if (this.cameraParticles && this.cameraParticles[0]) {
            const initPos = new THREE.Vector3(1000, 500, 1000); // 少し近づける
            this.cameraParticles[0].position.copy(initPos);
            this.cameraParticles[0].velocity.set(0, 0, 0);
            this.cameraParticles[0].acceleration.set(0, 0, 0);
            
            this.camera.position.copy(initPos);
            this.camera.lookAt(0, 0, 0);
        }

        // DOF（BokehPass）の初期化
        if (this.useDOF) {
            this.initDOF({
                focus: 500.0,
                aperture: 0.000002,
                maxblur: 0.0015
            });
        }
    }

    /**
     * カメラパーティクルの距離パラメータを設定
     * 役割を持たせた複数のカメラ設定を実装
     */
    setupCameraParticleDistance(cameraParticle, index = 0) {
        // インデックスに応じて役割を分ける（全8台対応）
        const role = index % 8;
        
        if (role === 0) {
            // 【カメラ1：ドローン】ビルの中を進む低空飛行
            cameraParticle.friction = 0.01; // 摩擦を減らして滑らかに
            cameraParticle.maxSpeed = 30.0; // 速度アップ
            cameraParticle.maxForce = 10.0;
            cameraParticle.minDistance = 0.0;
            cameraParticle.maxDistance = 50000.0;
            
            const cameraBoxSize = 12000.0;
            cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSize, -2000.0, -cameraBoxSize); // 地下に突き抜ける
            cameraParticle.boxMax = new THREE.Vector3(cameraBoxSize, 2000.0, cameraBoxSize);
        } else if (role === 1) {
            // 【カメラ2：低空高速】ビルスレスレを駆け抜ける
            cameraParticle.friction = 0.005; // 超低摩擦
            cameraParticle.maxSpeed = 60.0; // 超高速
            cameraParticle.maxForce = 15.0;
            cameraParticle.minDistance = 100.0;
            cameraParticle.maxDistance = 5000.0;
            
            const cameraBoxSize = 10000.0;
            cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSize, -1000.0, -cameraBoxSize); // 地下に突き抜ける
            cameraParticle.boxMax = new THREE.Vector3(cameraBoxSize, 1000.0, cameraBoxSize);
        } else if (role === 2) {
            // 【カメラ3：空撮・中層】街を見下ろす
            cameraParticle.friction = 0.02;
            cameraParticle.maxSpeed = 25.0;
            cameraParticle.maxForce = 5.0;
            cameraParticle.minDistance = 3000.0;
            cameraParticle.maxDistance = 15000.0;
            
            const cameraBoxSize = 15000.0;
            cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSize, -5000.0, -cameraBoxSize); // 大幅に広げる
            cameraParticle.boxMax = new THREE.Vector3(cameraBoxSize, 10000.0, cameraBoxSize);
        } else if (role === 3) {
            // 【カメラ4：超高空】衛星視点っぽい広域俯瞰
            cameraParticle.friction = 0.05;
            cameraParticle.maxSpeed = 20.0;
            cameraParticle.maxForce = 3.0;
            cameraParticle.minDistance = 10000.0;
            cameraParticle.maxDistance = 40000.0;
            
            const cameraBoxSize = 30000.0;
            cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSize, -20000.0, -cameraBoxSize); // 上下反転レベル
            cameraParticle.boxMax = new THREE.Vector3(cameraBoxSize, 30000.0, cameraBoxSize);
        } else if (role === 4) {
            // 【カメラ5：ビル群追跡】中低層を複雑に動く
            cameraParticle.friction = 0.015;
            cameraParticle.maxSpeed = 40.0;
            cameraParticle.maxForce = 12.0;
            cameraParticle.minDistance = 500.0;
            cameraParticle.maxDistance = 8000.0;
            
            const cameraBoxSize = 12000.0;
            cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSize, -3000.0, -cameraBoxSize);
            cameraParticle.boxMax = new THREE.Vector3(cameraBoxSize, 4000.0, cameraBoxSize);
        } else if (role === 5) {
            // 【カメラ6：シネマティック俯瞰】ゆっくり高度を下げていくような動き
            cameraParticle.friction = 0.02;
            cameraParticle.maxSpeed = 25.0;
            cameraParticle.maxForce = 4.0;
            cameraParticle.minDistance = 4000.0;
            cameraParticle.maxDistance = 12000.0;
            
            const cameraBoxSize = 18000.0;
            cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSize, -5000.0, -cameraBoxSize);
            cameraParticle.boxMax = new THREE.Vector3(cameraBoxSize, 12000.0, cameraBoxSize);
        } else if (role === 6) {
            // 【カメラ7：ストリートレベル】ほぼ地面の高さ
            cameraParticle.friction = 0.01;
            cameraParticle.maxSpeed = 30.0;
            cameraParticle.maxForce = 8.0;
            cameraParticle.minDistance = 50.0;
            cameraParticle.maxDistance = 2000.0;
            
            const cameraBoxSize = 8000.0;
            cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSize, -1000.0, -cameraBoxSize);
            cameraParticle.boxMax = new THREE.Vector3(cameraBoxSize, 500.0, cameraBoxSize);
        } else {
            // 【カメラ8：バランス俯瞰】標準的な空撮
            cameraParticle.friction = 0.015;
            cameraParticle.maxSpeed = 35.0;
            cameraParticle.maxForce = 6.0;
            cameraParticle.minDistance = 2000.0;
            cameraParticle.maxDistance = 10000.0;
            
            const cameraBoxSize = 15000.0;
            cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSize, -4000.0, -cameraBoxSize);
            cameraParticle.boxMax = new THREE.Vector3(cameraBoxSize, 8000.0, cameraBoxSize);
        }
        
        cameraParticle.maxDistanceReset = cameraParticle.maxDistance * 0.8;
    }
    
    setupLights() {
        // モノトーンの背景に赤いライトでエッジを効かせる
        this.ambientLight = new THREE.AmbientLight(0xff0000, 0.8); // 赤
        this.scene.add(this.ambientLight);
        
        this.directionalLight = new THREE.DirectionalLight(0xff0000, 1.5); // 赤
        this.directionalLight.position.set(100, 40, 100);
        this.directionalLight.castShadow = true;
        
        this.directionalLight.shadow.mapSize.width = 2048;
        this.directionalLight.shadow.mapSize.height = 2048;
        this.directionalLight.shadow.camera.near = 0.1;
        this.directionalLight.shadow.camera.far = 500;
        this.directionalLight.shadow.camera.left = -200;
        this.directionalLight.shadow.camera.right = 200;
        this.directionalLight.shadow.camera.top = 200;
        this.directionalLight.shadow.camera.bottom = -200;
        
        this.scene.add(this.directionalLight);
        
        const pointLight = new THREE.PointLight(0xff0000, 1.0); // 赤
        pointLight.position.set(-20, 30, -20);
        this.scene.add(pointLight);
        
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    
    updateBuildingCount() {
        this.totalBuildingCount = this.specialBuildings.length;
        this.setParticleCount(this.totalBuildingCount);
    }
    
    setupBuildingGrid() {
        this.showGridRuler3D = false;
        if (this.specialBuildings.length === 0) return;
        
        const box = new THREE.Box3();
        this.specialBuildings.forEach(building => {
            building.updateMatrixWorld(true);
            box.union(new THREE.Box3().setFromObject(building));
        });
        
        const center = box.getCenter(new THREE.Vector3());
        const floorY = this.floorY;
        const gridHelper = new THREE.GridHelper(1000, 10, 0x888888, 0x888888);
        gridHelper.position.set(center.x, floorY, center.z);
        this.floorPlane = gridHelper;
    }
    
    calculateBuildingBounds() {
        if (this.specialBuildings.length === 0) return;
        const box = new THREE.Box3();
        this.specialBuildings.forEach(building => {
            building.updateMatrixWorld(true);
            box.union(new THREE.Box3().setFromObject(building));
        });
        
        // 建物だけの範囲を保存（プレイヤーの移動制限用）
        this.buildingOnlyBounds = box.clone();

        // DEMオブジェクトも含めて全体の中心を出す（移動用）
        this.demObjects.forEach(dem => {
            dem.updateMatrixWorld(true);
            box.union(new THREE.Box3().setFromObject(dem));
        });
        this.cityCenter = box.getCenter(new THREE.Vector3());
    }
    
    /**
     * 全オブジェクトを中心が0,0,0になるようにずらす
     */
    centerAllObjects() {
        if (!this.cityCenter) return;
        
        const offset = this.cityCenter.clone();
        
        // 建物範囲もオフセット分ずらす
        if (this.buildingOnlyBounds) {
            this.buildingOnlyBounds.min.sub(offset);
            this.buildingOnlyBounds.max.sub(offset);
        }
        
        // 全建物を移動
        this.specialBuildings.forEach((building, i) => {
            building.position.sub(offset);
            // buildingParticlesも移動
            if (this.buildingParticles[i]) {
                const particlePos = this.buildingParticles[i].getPosition();
                particlePos.sub(offset);
            }
        });
        
        // DEMオブジェクトも移動
        this.demObjects.forEach(dem => {
            dem.position.sub(offset);
        });
        
        // プレイヤーの移動制限を建物範囲に設定
        if (this.player && this.buildingOnlyBounds) {
            // 少しマージンを持たせる
            this.player.boxMin.copy(this.buildingOnlyBounds.min);
            this.player.boxMax.copy(this.buildingOnlyBounds.max);
            // 高度はさらに低く維持（1.5m〜3m）
            this.player.boxMin.y = 1.0;
            this.player.boxMax.y = 3.0;
            
            console.log("Player movement restricted to building bounds:", this.buildingOnlyBounds);
        }
        
        // cityCenterをリセット（もう原点が中心）
        this.cityCenter.set(0, 0, 0);
    }
    
    async loadSpecialBuildings() {
        // console.log('=== loadSpecialBuildings() START ===');
        const lod2BasePath = '/assets/533946_2/LOD2';
        const objLoader = new OBJLoader();
        const mtlLoader = new MTLLoader();
        
        // マテリアルのキャッシュ（カクつき防止）
        const materialCache = new Map();
        
        const lod2Folders = [
            '533946001', '533946002', '533946003', '533946004',
            '533946011', '533946012', '533946013', '533946014',
            '533946021', '533946022', '533946023', '533946024',
            '533946101', '533946102', '533946103', '533946104',
            '533946111', '533946112', '533946113', '533946114',
            '533946121', '533946122', '533946123', '533946124',
            '533946201', '533946202', '533946203', '533946204',
            '533946211', '533946212', '533946213', '533946214',
            '533946221', '533946222', '533946223', '533946224'
        ];
        
        for (const folder of lod2Folders) {
            const id = folder;
            const objPath = `${lod2BasePath}/${folder}/${folder}_bldg_6677.obj`;
            
            try {
                // ファイルが存在するか、かつHTMLが返ってきていないか事前にチェック
                const response = await fetch(objPath, { method: 'HEAD' });
                if (!response.ok || !response.headers.get('content-type')?.includes('text/plain') && !objPath.endsWith('.obj')) {
                    // HEADリクエストが失敗するか、タイプがおかしい場合はスキップ
                    continue;
                }

                try {
                    mtlLoader.setPath(`${lod2BasePath}/${folder}/`);
                    const materials = await mtlLoader.loadAsync('materials.mtl');
                    materials.preload();
                    
                    // 写真テクスチャの使用フラグに応じて読み込みを制御
                    // falseの場合はテクスチャ情報を抹消して読み込み負荷を最小限にする
                    if (!this.useBuildingTextures) {
                        Object.keys(materials.materials).forEach(key => {
                            const mat = materials.materials[key];
                            mat.map_Kd = null;
                            mat.map_Ks = null;
                            mat.map_Bump = null;
                            mat.map_Normal = null;
                        });
                    }
                    objLoader.setMaterials(materials);
                } catch (e) {
                    objLoader.setMaterials(null);
                }
                
                // OBJ読み込み
                const model = await objLoader.loadAsync(objPath);
                if (!model || model.children.length === 0) continue;
                
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        
                        const oldMat = child.material;
                        
                        if (!this.useBuildingTextures) {
                            // 【究極の浄化】テクスチャを知らない新品のマテリアルに差し替え
                            // 色を暗いトーン内でランダマイズ（0x080808 〜 0x1a1a1a 程度）
                            const grayVal = 0.05 + Math.random() * 0.05; // 0.05 〜 0.10
                            const grayKey = Math.floor(grayVal * 100); // キャッシュ用にキー化
                            
                            if (materialCache.has(grayKey)) {
                                child.material = materialCache.get(grayKey);
                            } else {
                                const buildingColor = new THREE.Color(grayVal, grayVal, grayVal);
                                const matParams = {
                                    color: buildingColor,
                                    metalness: 0.9,
                                    roughness: 0.2,
                                    envMapIntensity: 2.0,
                                    map: null,
                                    normalMap: null,
                                    specMap: null
                                };

                                // バンプマップが有効なら追加
                                if (this.useBuildingBumpMap && this.noiseTexture) {
                                    matParams.bumpMap = this.noiseTexture;
                                    matParams.bumpScale = 3.0;
                                }

                                child.material = new THREE.MeshStandardMaterial(matParams);
                                materialCache.set(grayKey, child.material);
                            }
                            
                            child.renderOrder = 10;
                            if (oldMat.dispose) oldMat.dispose();
                        } else {
                            // オンなら本来の色（白）に戻す（テクスチャはそのまま活かす）
                            if (oldMat.color) oldMat.color.set(0xffffff);
                            child.renderOrder = 10;
                        }

                        // マテリアルの更新を強制（シェーダーの再コンパイルを促す）
                        child.material.needsUpdate = true;
                    }
                });

                // 座標調整
                model.rotation.x = -Math.PI / 2;
                model.updateMatrixWorld(true);
                
                // バウンディングボックスの計算前にジオメトリを更新
                let hasValidGeometry = false;
                model.traverse(child => {
                    if (child.isMesh && child.geometry) {
                        child.geometry.computeBoundingBox();
                        const boundingBox = child.geometry.boundingBox;
                        if (boundingBox && !isNaN(boundingBox.min.x)) {
                            hasValidGeometry = true;
                        }
                    }
                });
                
                if (!hasValidGeometry) {
                    continue;
                }
                
                const box = new THREE.Box3().setFromObject(model);
                const center = box.getCenter(new THREE.Vector3());
                
                if (isNaN(center.x) || isNaN(center.y) || isNaN(center.z)) {
                    console.warn(`[Scene11] Warning: NaN detected in building center calculation.`);
                    continue;
                }
                
                if (!this.firstBuildingCenter) {
                    this.firstBuildingCenter = center.clone();
                }
                
                // ジオメトリのセンタリング
                model.traverse(child => {
                    if (child.isMesh && child.geometry) {
                        const localCenter = child.worldToLocal(center.clone());
                        child.geometry.translate(-localCenter.x, -localCenter.y, -localCenter.z);
                    }
                });

                const positionScale = 1.0;  // 0.1 → 1.0 に変更（さらに10倍大きく）
                const finalPos = new THREE.Vector3(
                    (center.x - this.firstBuildingCenter.x) * positionScale,
                    (center.y - this.firstBuildingCenter.y) * positionScale,
                    (center.z - this.firstBuildingCenter.z) * positionScale
                );
                
                model.position.copy(finalPos);
                model.scale.set(positionScale, positionScale, positionScale);
                
                const particle = new Particle(finalPos.x, finalPos.y, finalPos.z);
                particle.friction = 0.98;
                particle.maxSpeed = 10.0;
                this.buildingParticles.push(particle);
                
                this.scene.add(model);
                this.specialBuildings.push(model);
                // console.log(`[Diagnostic-Building] ID: ${id}, Final Position:`, JSON.stringify(model.position));
                
            } catch (error) {
                console.error(`Error loading building ${id}:`, error);
            }
        }
        this.updateBuildingCount();
    }
    
    async loadDEM() {
        const demDir = '/assets/533946_2/dem/';
        const demIds = [
            '53394600', '53394601', '53394602', '53394603', '53394604',
            '53394610', '53394611', '53394612', '53394613', '53394614',
            '53394620', '53394621', '53394622', '53394623', '53394624'
        ];
        const loader = new OBJLoader();
        
        for (const id of demIds) {
            const url = `${demDir}${id}/${id}_dem_6677.obj`;
            try {
                // ファイル存在チェック
                const response = await fetch(url, { method: 'HEAD' });
                if (!response.ok) continue;

                const model = await loader.loadAsync(url);
                if (!model) continue;
                
                model.rotation.x = -Math.PI / 2;
                model.updateMatrixWorld(true);
                
                // バウンディングボックスの計算前にジオメトリを更新
                let hasValidGeometry = false;
                model.traverse(child => {
                    if (child.isMesh && child.geometry) {
                        child.geometry.computeBoundingBox();
                        const boundingBox = child.geometry.boundingBox;
                        if (boundingBox && !isNaN(boundingBox.min.x)) {
                            hasValidGeometry = true;
                        }
                    }
                });
                
                if (!hasValidGeometry) {
                    continue;
                }
                
                const box = new THREE.Box3().setFromObject(model);
                const center = box.getCenter(new THREE.Vector3());
                
                if (isNaN(center.x) || isNaN(center.y) || isNaN(center.z)) {
                    console.warn(`[Scene11] Warning: NaN detected in DEM center calculation.`);
                    continue;
                }
                
                if (!this.firstBuildingCenter) {
                    this.firstBuildingCenter = center.clone();
                }
                
                        model.traverse(child => {
                    if (child.isMesh && child.geometry) {
                        const localCenter = child.worldToLocal(center.clone());
                        child.geometry.translate(-localCenter.x, -localCenter.y, -localCenter.z);
                        
                        child.material = new THREE.MeshBasicMaterial({
                            color: 0xffffff, // 純白
                            wireframe: true,
                            transparent: true,
                            opacity: 0.6,
                            side: THREE.FrontSide // 裏面を描画しない
                        });
                        child.renderOrder = 0; // 地形は一番後ろ
                    }
                });
                
                const positionScale = 1.0;  // 0.1 → 1.0 に変更（さらに10倍大きく）
                const finalPos = new THREE.Vector3(
                    (center.x - this.firstBuildingCenter.x) * positionScale,
                    (center.y - this.firstBuildingCenter.y) * positionScale,
                    (center.z - this.firstBuildingCenter.z) * positionScale
                );
                model.position.copy(finalPos);
                model.scale.set(positionScale, positionScale, positionScale);
                
                this.scene.add(model);
                this.demObjects.push(model);
                // console.log(`[Diagnostic-DEM] ID: ${id}, Final Position:`, JSON.stringify(model.position));
            } catch (e) {}
        }
    }

    toggleEffect(trackNumber) {
        // 全てのトラックエフェクトを有効化（親クラスの処理を呼ぶ）
        super.toggleEffect(trackNumber);
    }

    /**
     * カメラをランダムに切り替える
     */
    switchCameraRandom() {
        super.switchCameraRandom();
    }

    /**
     * カメラにランダムな力を加える
     */
    updateCameraForce() {
        // trackEffects[1]がオフの場合は処理をスキップ
        if (!this.trackEffects[1]) return;
        
        this.cameraTriggerCounter++;
        // 他のシーンより頻繁に力を加えて、より活発に動かす
        if (this.cameraTriggerCounter >= 60) {
            if (this.cameraParticles[this.currentCameraIndex]) {
                // カメラ1（index 0）以外の場合のみランダムな力を加える
                if (this.currentCameraIndex !== 0) {
                    // 通常のランダムフォース
                    this.cameraParticles[this.currentCameraIndex].applyRandomForce();
                    
                    // さらに追加で大きな力を加えて、ダイナミックな移動を促す
                    const force = new THREE.Vector3(
                        (Math.random() - 0.5) * 10.0,
                        (Math.random() - 0.5) * 2.0,
                        (Math.random() - 0.5) * 10.0
                    );
                    this.cameraParticles[this.currentCameraIndex].addForce(force);
                }
            }
            this.cameraTriggerCounter = 0;
        }
    }

    /**
     * カメラの位置を更新
     */
    updateCamera() {
        if (!this.cameraParticles[this.currentCameraIndex] || !this.player) return;

        const playerPos = this.player.getPosition();
        
        if (this.currentCameraIndex === 0) {
            // 【カメラ1：本人視点】
            // 位置をプレイヤーと完全に同期
            this.camera.position.set(playerPos.x, playerPos.y, playerPos.z);
            // プレイヤーの進む方向を観る
            const lookAtTarget = this.player.getLookAtTarget();
            this.camera.lookAt(lookAtTarget.x, lookAtTarget.y, lookAtTarget.z);
            
            // 自分のメッシュは隠す
            if (this.playerMesh) this.playerMesh.visible = false;
        } else {
            // 【その他のカメラ：追跡視点】
            const cameraPos = this.cameraParticles[this.currentCameraIndex].getPosition();
            this.camera.position.set(cameraPos.x, cameraPos.y, cameraPos.z);
            // 常にプレイヤーを観る
            this.camera.lookAt(playerPos.x, playerPos.y, playerPos.z);
            
            // 他のカメラからも非表示を維持
            if (this.playerMesh) this.playerMesh.visible = false;
        }
        
        this.camera.up.set(0, 1, 0);
        this.camera.updateMatrixWorld(true);
    }

    onUpdate(deltaTime) {
        // カクつき対策：HUDの更新頻度を下げる、または重い処理を間引く
        this._updateCounter = (this._updateCounter || 0) + 1;
        
        if (!this._lastCamLog || Date.now() - this._lastCamLog > 1000) {
            // console.log(`[Diagnostic-Camera] Pos: (${this.camera.position.x.toFixed(2)}, ${this.camera.position.y.toFixed(2)}, ${this.camera.position.z.toFixed(2)})`);
            this._lastCamLog = Date.now();
        }

        if (!this._keyDebugInitialized) {
            window.addEventListener('keydown', (e) => {
                if (e.key.toLowerCase() === 'b') this.handleKeyPress('b');
            });
            this._keyDebugInitialized = true;
        }

        // GridRuler3Dの毎フレーム監視は重いので削除
        
        this.time += deltaTime;
        
        if (this.physicsEnabled && this.buildingParticles.length > 0) {
            for (let i = 0; i < this.buildingParticles.length; i++) {
                const particle = this.buildingParticles[i];
                const building = this.specialBuildings[i];
                if (!particle || !building) continue;
                particle.addForce(this.gravity || new THREE.Vector3(0, -0.098, 0));
                particle.update();
                const pos = particle.getPosition();
                if (pos.y < this.groundY) {
                    pos.y = this.groundY;
                    particle.velocity.y *= -0.5;
                }
                building.position.copy(pos);
            }
        }
        
        // 2フレームに1回更新に間引く
        if (this._updateCounter % 2 === 0) {
            this.updateBuildingCallout();
            
            // 行列の更新をここで行う（drawBuildingCalloutでの重複を避ける）
            this.specialBuildings.forEach(b => {
                if (b.visible) b.updateMatrixWorld(true);
            });
        }
        
        // Circleエフェクトの更新
        this.circleEffects = this.circleEffects.filter(effect => {
            effect.update();
            if (effect.isFinished) {
                effect.dispose(this.scene);
                return false;
            }
            return true;
        });
        
        // プレイヤーの更新
        if (this.player) {
            this.player.update();
            const playerPos = this.player.getPosition();
            
            // デバッグ用メッシュとライトの位置を更新
            if (this.playerMesh && this.playerMesh.visible) this.playerMesh.position.copy(playerPos);
            if (this.playerLight) this.playerLight.position.copy(playerPos);
        }
        
        this.updateCamera(); // 明示的に呼ぶ

        // スカイスフィアをカメラ位置に追従させる（常に中心に空があるように）
        if (this.skysphere) {
            this.skysphere.position.copy(this.camera.position);
        }

        // DOFの更新（フォーカスをプレイヤーに合わせるなど）
        if (this.useDOF && this.bokehPass && this.player) {
            super.updateAutoFocus([this.playerMesh]);
        }
    }
    
    handleKeyPress(key) {
        if (super.handleKeyPress) super.handleKeyPress(key);
        const k = key.toLowerCase();
        if (k === 'b') {
            this.showBuildings = !this.showBuildings;
            this.specialBuildings.forEach(b => b.visible = this.showBuildings);
        }
    }

    handleOSC(message) {
        if (message.address === '/phase/' || message.address === '/phase') {
            const args = message.args || [];
            if (args.length > 0) this.phase = Math.floor(args[0]);
            return;
        }
        if (message.address === '/actual_tick/' || message.address === '/actual_tick' || message.address === '/tick/' || message.address === '/tick') {
            const args = message.args || [];
            if (args.length > 0) this.actualTick = Math.floor(args[0]);
            return;
        }
        // trackNumber 1 の return を削除（SceneBaseでカメラ切り替えさせるため）
        if (message.trackNumber >= 1 && message.trackNumber <= 9 && !this.trackEffects[message.trackNumber]) return;
        super.handleOSC(message);
    }
    
    handleTrackNumber(trackNumber, message) {
        // trackNumber 1 の return を削除
        super.handleTrackNumber(trackNumber, message);
        if (trackNumber === 5) {
            const args = message.args || [];
            const velocity = args[1] || 127;
            const duration = args[2] || this.buildingCalloutDuration;
            if (velocity > 0) this.startBuildingCallout(duration);
        } else if (trackNumber === 6) {
            const args = message.args || [];
            const velocity = args[1] || 127;
            const duration = args[2] || 1000;
            this.triggerCircleEffect(velocity, duration);
        } else if (trackNumber === 7) {
            this.applyExplosionForce(new THREE.Vector3(0, 0, 0), 10.0, 5.0);
        }
    }
    
    startBuildingCallout(duration = 2000) {
        if (this.specialBuildings.length === 0) return;
        
        // ランダムな建物を選択
        const index = Math.floor(Math.random() * this.specialBuildings.length);
        const building = this.specialBuildings[index];
        
        // 新しいコールアウトを追加（ポリフォニック）
        this.activeCallouts.push({
            building: building,
            index: index,
            endTime: Date.now() + duration,
            startTime: Date.now(),
            duration: duration
        });
    }

    /**
     * トラック6：Circleエフェクトを開始
     */
    triggerCircleEffect(velocity, durationMs) {
        // 建物と地形の範囲（buildingOnlyBounds）内でランダムな位置を決定
        let center = new THREE.Vector3(0, this.groundY, 0);
        
        if (this.buildingOnlyBounds) {
            const min = this.buildingOnlyBounds.min;
            const max = this.buildingOnlyBounds.max;
            
            center.x = min.x + Math.random() * (max.x - min.x);
            center.z = min.z + Math.random() * (max.z - min.z);
        } else {
            // フォールバック：半径8000ユニット
            const spawnRadius = 8000.0;
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * spawnRadius;
            center.x = Math.cos(angle) * radius;
            center.z = Math.sin(angle) * radius;
        }
        
        const effect = new Scene11_CircleEffect(center, velocity, durationMs);
        effect.createThreeObjects(this.scene);
        this.circleEffects.push(effect);
    }
    
    updateBuildingCallout() {
        const now = Date.now();
        // 期限切れのコールアウトを削除
        this.activeCallouts = this.activeCallouts.filter(c => now < c.endTime);
    }
    
    drawBuildingCallout(callout) {
        const { building, index } = callout;
        if (!this.hud || !this.hud.ctx) return;
        const ctx = this.hud.ctx;
        const canvas = this.hud.canvas;
        
        // 画面外チェックを先に行う
        // updateMatrixWorldは重いので、onUpdateで一括で行うか、ここでは省略を検討
        // building.updateMatrixWorld(true); 
        const worldPos = new THREE.Vector3();
        building.getWorldPosition(worldPos);
        const projected = worldPos.clone().project(this.camera);
        
        if (projected.z > 1.0 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) return;

        // カメラとの距離チェック（近すぎると重い可能性があるため）
        const dist = worldPos.distanceTo(this.camera.position);
        if (dist < 10) return; 

        let cachedData = this.buildingCalloutCache.get(building);
        if (!cachedData) {
            const box = new THREE.Box3().setFromObject(building);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            cachedData = { center, size };
            this.buildingCalloutCache.set(building, cachedData);
        }
        const { center, size } = cachedData;
        const buildingCenter3D = center.clone().project(this.camera);
        const centerScreenX = (buildingCenter3D.x * 0.5 + 0.5) * canvas.width;
        const centerScreenY = (buildingCenter3D.y * -0.5 + 0.5) * canvas.height;
        
        const buildingTop3D = new THREE.Vector3(center.x, center.y + size.y / 2, center.z).project(this.camera);
        const startX = (buildingTop3D.x * 0.5 + 0.5) * canvas.width;
        const startY = (buildingTop3D.y * -0.5 + 0.5) * canvas.height;
        
        const useRight = centerScreenX >= canvas.width / 2;
        // 角度を100度以上に確保（Math.PI * 0.6 = 108度）
        const diagonalAngle = Math.PI * 0.6 + (Math.PI * 0.25) * (Math.abs(centerScreenX - canvas.width / 2) / (canvas.width / 2));
        const diagonalDirX = useRight ? Math.cos(diagonalAngle) : -Math.cos(diagonalAngle);
        const diagonalDirY = -Math.sin(diagonalAngle);
        const end1X = startX + diagonalDirX * 80;
        const end1Y = startY + diagonalDirY * 80;
        const horizontalLength = useRight ? 200 : -200;
        const end2X = end1X + horizontalLength;
        
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.78)';
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(end1X, end1Y);
        ctx.lineTo(end2X, end1Y);
        ctx.stroke();
        
        ctx.fillStyle = 'white';
        ctx.font = '14px monospace';
        const textX = useRight ? end2X + 10 : end2X - 280;
        let textY = end1Y - 120;
        
        // 項目自体を入れ替えまくる超高速情報羅列（ポリフォニック対応）
        const labels = [
            "DATA_STREAM", "SIGNAL_INT", "BUFFER_VAL", "LATENCY_MS", "PACKET_LOSS",
            "HEX_DUMP", "MEM_ADDR", "CPU_LOAD", "GPU_TEMP", "NODE_ID",
            "VECTOR_X", "VECTOR_Y", "VECTOR_Z", "QUATERNION", "MATRIX_W",
            "LOD_LEVEL", "TEX_ID", "VERT_COUNT", "POLY_INDEX", "SHADER_REF"
        ];
        
        const timeSeed = Date.now();
        for(let i=0; i<8; i++) {
            const labelIdx = (Math.floor(timeSeed / 50) + i) % labels.length;
            const label = labels[labelIdx];
            const val = Math.random().toString(16).substring(2, 10).toUpperCase();
            ctx.fillText(`${label}: ${val}`, textX, textY + (i * 18));
        }
        
        ctx.restore();
    }
    
    render() {
        super.render();
        if (this.hud && this.hud.ctx) {
            // 全てのアクティブなコールアウトを描画（ポリフォニック）
            this.activeCallouts.forEach(callout => {
                this.drawBuildingCallout(callout);
            });
        }
    }
    
    applyExplosionForce(center, radius, strength) {
        for (let i = 0; i < this.buildingParticles.length; i++) {
            const particle = this.buildingParticles[i];
            if (!particle) continue;
            const pos = particle.getPosition();
            const direction = new THREE.Vector3().subVectors(pos, center);
            const distance = direction.length();
            if (distance < radius && distance > 0) {
                const forceMagnitude = strength * (1.0 - distance / radius);
                particle.addForce(direction.normalize().multiplyScalar(forceMagnitude));
                this.physicsEnabled = true;
            }
        }
    }
    
    reset() {
        super.reset();
        this.time = 0.0;
        this.physicsEnabled = false;
        this.buildingParticles.forEach(p => p.reset());
        
        // Circleエフェクトをリセット
        this.circleEffects.forEach(e => e.dispose(this.scene));
        this.circleEffects = [];
    }
    
    dispose() {
        this.specialBuildings.forEach(b => {
            this.scene.remove(b);
            b.traverse(c => {
                if (c.isMesh) {
                    if (c.geometry) c.geometry.dispose();
                    if (c.material) {
                        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
                        else c.material.dispose();
                    }
                }
            });
        });
        this.specialBuildings = [];
        this.demObjects.forEach(o => {
            this.scene.remove(o);
            o.traverse(c => {
                if (c.isMesh) {
                    if (c.geometry) c.geometry.dispose();
                    if (c.material) c.material.dispose();
                }
            });
        });
        this.demObjects = [];
        
        // スカイスフィアの破棄
        if (this.skysphere) {
            this.scene.remove(this.skysphere);
            if (this.skysphere.geometry) this.skysphere.geometry.dispose();
            if (this.skysphere.material) {
                if (this.skysphere.material.map) this.skysphere.material.map.dispose();
                this.skysphere.material.dispose();
            }
            this.skysphere = null;
        }
        
        // Circleエフェクトを破棄
        this.circleEffects.forEach(e => e.dispose(this.scene));
        this.circleEffects = [];

        if (this.ambientLight) this.scene.remove(this.ambientLight);
        if (this.directionalLight) this.scene.remove(this.directionalLight);
        super.dispose();
    }
    
    generateBuildingWalkPath() {
        // フォールバック用のダミー実装
        this.buildingWalkPath = [new THREE.Vector3(0,0,0)];
    }

    /**
     * 3D空間としての夕焼け空（スカイスフィア）を作成
     */
    createSkysphere() {
        // 巨大な球体を作成（far planeの手前）
        const geometry = new THREE.SphereGeometry(90000, 32, 32);
        const texture = this.createSunsetGradient();
        
        // 内側を描画するように設定
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.BackSide,
            fog: false // 空自体はフォグの影響を受けないようにする
        });

        this.skysphere = new THREE.Mesh(geometry, material);
        this.scene.add(this.skysphere);
        
        console.log("Skysphere created.");
    }

    /**
     * 夕焼け風のグラデーションテクスチャを生成
     */
    createSunsetGradient() {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createLinearGradient(0, 0, 0, size);
        gradient.addColorStop(0.0, '#000000'); // 頂点：真っ黒
        gradient.addColorStop(0.5, '#333333'); // 中間：濃いグレー
        gradient.addColorStop(1.0, '#666666'); // 地面付近：明るいグレー

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    /**
     * バンプマップ用のノイズテクスチャを生成
     */
    generateNoiseTexture() {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        const imageData = ctx.createImageData(size, size);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            // コントラストを強めるために、0か255に近い値が出やすいように調整
            const rand = Math.random();
            const val = rand > 0.5 ? 
                Math.floor(200 + Math.random() * 55) : // 明るいグレー
                Math.floor(Math.random() * 55);       // 暗いグレー
            data[i] = val;     // R
            data[i + 1] = val; // G
            data[i + 2] = val; // B
            data[i + 3] = 255; // A
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        // リピート回数を増やして、より細かいザラザラ感を出す
        texture.repeat.set(20, 20);
        
        return texture;
    }
}
