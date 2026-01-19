/**
 * Scene11: 街の3Dモデル表示（Project PLATEAU）
 */

import { SceneTemplate } from '../SceneTemplate.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';

export class Scene11 extends SceneTemplate {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera, sharedResourceManager);
        this.title = 'mathym | Scene11 - 街';
        this.sceneNumber = 11;
        this.kitNo = 11;  // キット番号を設定
        
        // 建物の設定
        this.buildings = [];  // 個別の建物（CPUパーティクル）
        this.instancedBuildings = null;  // インスタンシング用の建物マネージャー
        this.numSimpleBuildings = 500;  // シンプルな建物（Box）の数
        this.specialBuildings = [];  // 特殊な形状の建物（3Dモデル）
        
        // 建物の生成範囲
        this.spawnRadius = 2000.0;
        this.groundY = 0;
        
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
        this.createSimpleBuildings();
        
        // 特殊な形状の建物（3Dモデル）を読み込む
        await this.loadSpecialBuildings();
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
            
            // 建物のサイズをランダムに決定
            const width = 20 + Math.random() * 80;  // 20-100
            const depth = 20 + Math.random() * 80;  // 20-100
            const height = 30 + Math.random() * 200;  // 30-230
            
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
        
        console.log(`Scene11: ${this.numSimpleBuildings} simple buildings created (instanced)`);
    }
    
    /**
     * 特殊な形状の建物（3Dモデル）を読み込む
     */
    async loadSpecialBuildings() {
        // 3Dモデルのパス（public/models/plateau/に配置する想定）
        const modelPaths = [
            // '/models/plateau/building1.glb',
            // '/models/plateau/building2.obj',
            // 例として、実際のパスを指定する必要がある
        ];
        
        if (modelPaths.length === 0) {
            console.log('Scene11: No special building models to load');
            return;
        }
        
        const gltfLoader = new GLTFLoader();
        const objLoader = new OBJLoader();
        
        for (const path of modelPaths) {
            try {
                let model = null;
                
                // ファイル拡張子でローダーを選択
                if (path.endsWith('.glb') || path.endsWith('.gltf')) {
                    const gltf = await gltfLoader.loadAsync(path);
                    model = gltf.scene;
                } else if (path.endsWith('.obj')) {
                    model = await objLoader.loadAsync(path);
                } else {
                    console.warn(`Scene11: Unsupported model format: ${path}`);
                    continue;
                }
                
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
                
                // 位置をランダムに決定
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * this.spawnRadius;
                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;
                
                // スケールを調整（必要に応じて）
                const scale = 1.0;  // モデルのサイズに応じて調整
                model.scale.set(scale, scale, scale);
                
                // 位置を設定
                model.position.set(x, this.groundY, z);
                
                // 回転（Y軸周りにランダムに回転）
                model.rotation.y = Math.random() * Math.PI * 2;
                
                // シーンに追加
                this.scene.add(model);
                this.specialBuildings.push(model);
                
                console.log(`Scene11: Loaded special building: ${path}`);
            } catch (error) {
                console.error(`Scene11: Error loading model ${path}:`, error);
            }
        }
        
        console.log(`Scene11: ${this.specialBuildings.length} special buildings loaded`);
    }
    
    /**
     * 更新処理（毎フレーム呼ばれる）
     */
    onUpdate(deltaTime) {
        super.onUpdate(deltaTime);
        
        // 時間を更新
        this.time += deltaTime;
        
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
     * リセット処理
     */
    reset() {
        super.reset();
        
        // 時間をリセット
        this.time = 0.0;
        
        // 建物の位置をリセット（必要に応じて）
        // ここでは実装しないが、必要に応じて追加可能
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
