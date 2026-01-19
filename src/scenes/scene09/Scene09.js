/**
 * Scene09: 新宿駅構内3D可視化
 */

import { SceneTemplate } from '../SceneTemplate.js';
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshLine, MeshLineMaterial } from 'three.meshline';

export class Scene09 extends SceneTemplate {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera, sharedResourceManager);
        this.title = 'mathym | Scene09 - 新宿駅構内';
        this.sceneNumber = 9;
        this.kitNo = 0;  // キット番号を設定
        
        // コントロール
        this.mapControls = null;
        this.zoomControls = null;
        
        // グループ
        this.groups = {};
        this.groupList = [4, 3, 2, 1, 0, -1, -2, -3];
        this.layers = ['4F', '3F', '2F', '1F', '0', 'B1', 'B2', 'B3'];
        
        // シーンの中心にする地理座標(EPSG:6677)
        this.center = [-12035.29, -34261.85];
        
        // 階ごとに離すY軸方向の距離
        this.verticalOffset = 30;
        
        // 歩行者ネットワーク
        this.linkMaterial = null;
        this.linkMesh = null;
        this.linkTime = 0.0;
        
        // ローディング状態
        this.loadingComplete = false;
        
        // カメラの初期位置を設定
        this.camera.position.set(-190, 280, -350);
        this.camera.lookAt(0, 0, 0);
        
        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
    }
    
    /**
     * セットアップ処理（シーン切り替え時に呼ばれる）
     */
    async setup() {
        await super.setup();
        
        // コントロールを初期化
        this.initControls();
        
        // グループを作成
        this.createGroups();
        
        // GeoJSONファイルを読み込む
        await this.loadGeoJSONFiles();
        
        // 歩行者ネットワークを読み込む
        await this.loadPedestrianNetwork();
        
        // 基盤地図情報道路データを読み込む
        await this.loadRoadData();
        
        this.loadingComplete = true;
    }
    
    /**
     * コントロールを初期化
     */
    initControls() {
        const canvas = this.renderer.domElement;
        
        // MapControls（パン・回転）
        this.mapControls = new MapControls(this.camera, canvas);
        this.mapControls.enableDamping = true;
        this.mapControls.enableZoom = false;
        this.mapControls.maxDistance = 1000;
        
        // TrackballControls（ズーム）
        this.zoomControls = new TrackballControls(this.camera, canvas);
        this.zoomControls.noPan = true;
        this.zoomControls.noRotate = true;
        this.zoomControls.noZoom = false;
        this.zoomControls.zoomSpeed = 0.5;
    }
    
    /**
     * グループを作成
     */
    createGroups() {
        this.groupList.forEach((num, i) => {
            const group = new THREE.Group();
            group.name = `group${num}`;
            group.visible = true;
            this.scene.add(group);
            this.groups[`group${num}`] = group;
        });
    }
    
    /**
     * 階層番号を取得
     */
    getFloorNumber(geojson, type) {
        const regex = new RegExp(`ShinjukuTerminal_([-B\\d]+)(out)?_${type}`);
        const match = geojson.match(regex);
        if (!match) return null;
        
        let floor = match[1].replace('B', '-');
        return parseInt(match[2] === 'out' ? floor.replace('out', '') : floor, 10);
    }
    
    /**
     * ポリゴンからExtrudeGeometryを返す関数
     */
    createExtrudedGeometry(coordinates, depth) {
        const shape = new THREE.Shape();
        
        // ポリゴンの座標からShapeを作成
        coordinates[0].forEach((point, index) => {
            const [x, y] = point.map((coord, idx) => coord - this.center[idx]);
            if (index === 0) {
                shape.moveTo(x, y);
            } else if (index + 1 === coordinates[0].length) {
                shape.closePath();
            } else {
                shape.lineTo(x, y);
            }
        });
        
        return new THREE.ExtrudeGeometry(shape, {
            steps: 1,
            depth: depth,
            bevelEnabled: false,
        });
    }
    
    /**
     * ファイルを読み込んで、シーンに追加
     */
    async loadAndAddToScene(geojsonPath, floorNumber, depth) {
        try {
            const response = await fetch(geojsonPath);
            const data = await response.json();
            
            // Lineのマテリアル
            const lineMaterial = new THREE.LineBasicMaterial({ color: 'rgb(255, 255, 255)' });
            
            // geometryの情報がないものは除外
            data.features
                .filter((feature) => feature.geometry)
                .forEach((feature) => {
                    // ExtrudeGeometryを作成
                    const geometry = this.createExtrudedGeometry(feature.geometry.coordinates, depth);
                    
                    // 90度回転させる
                    const matrix = new THREE.Matrix4().makeRotationX(Math.PI / -2);
                    geometry.applyMatrix4(matrix);
                    
                    // ExtrudeGeometryからLineを作成
                    const edges = new THREE.EdgesGeometry(geometry);
                    const line = new THREE.LineSegments(edges, lineMaterial);
                    line.position.y += floorNumber * this.verticalOffset - 1;
                    
                    // Groupに追加
                    const group = this.groups[`group${floorNumber}`];
                    if (group) {
                        group.add(line);
                    }
                });
        } catch (error) {
            console.error(`Error loading ${geojsonPath}:`, error);
        }
    }
    
    /**
     * GeoJSONファイルを読み込む
     */
    async loadGeoJSONFiles() {
        // Spaceの配列
        const SpaceLists = [
            '/ShinjukuTerminal/ShinjukuTerminal_B3_Space.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_B2_Space.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_B1_Space.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_0_Space.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_1_Space.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_2_Space.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_2out_Space.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_3_Space.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_3out_Space.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_4_Space.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_4out_Space.geojson',
        ];
        
        // Spaceの読み込み
        for (const geojson of SpaceLists) {
            const floorNumber = this.getFloorNumber(geojson, 'Space');
            if (floorNumber !== null) {
                await this.loadAndAddToScene(geojson, floorNumber, 5);
            }
        }
        
        // Floorの配列
        const FloorLists = [
            '/ShinjukuTerminal/ShinjukuTerminal_B3_Floor.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_B2_Floor.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_B1_Floor.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_0_Floor.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_1_Floor.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_2_Floor.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_2out_Floor.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_3_Floor.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_3out_Floor.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_4_Floor.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_4out_Floor.geojson',
        ];
        
        // Floorの読み込み
        for (const geojson of FloorLists) {
            const floorNumber = this.getFloorNumber(geojson, 'Floor');
            if (floorNumber !== null) {
                await this.loadAndAddToScene(geojson, floorNumber, 0.5);
            }
        }
        
        // Fixtureの配列
        const FixtureLists = [
            '/ShinjukuTerminal/ShinjukuTerminal_B3_Fixture.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_B2_Fixture.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_B1_Fixture.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_0_Fixture.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_2_Fixture.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_2out_Fixture.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_3_Fixture.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_3out_Fixture.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_4_Fixture.geojson',
            '/ShinjukuTerminal/ShinjukuTerminal_4out_Fixture.geojson',
        ];
        
        // Fixtureの読み込み
        for (const geojson of FixtureLists) {
            const floorNumber = this.getFloorNumber(geojson, 'Fixture');
            if (floorNumber !== null) {
                await this.loadAndAddToScene(geojson, floorNumber, 5);
            }
        }
    }
    
    /**
     * 歩行者ネットワークのマテリアルを作成
     */
    createLinkMaterial() {
        const linkMaterial = new MeshLineMaterial({
            transparent: true,
            lineWidth: 1,
            color: new THREE.Color('rgb(0, 255, 255)'),
        });
        
        // Shaderを追加
        linkMaterial.onBeforeCompile = (shader) => {
            // userDataにuniformsを追加
            Object.assign(shader.uniforms, linkMaterial.userData.uniforms);
            
            const keyword2 = 'void main() {';
            shader.vertexShader = shader.vertexShader.replace(
                keyword2,
                /* GLSL */ `
                varying vec2 vUv;
                attribute float uDistance;
                attribute float uDirection;
                varying float vDistance;
                varying float vDirection;
                ${keyword2}`,
            );
            
            // 置換してシェーダーに追記する
            const keyword3 = 'vUV = uv;';
            shader.vertexShader = shader.vertexShader.replace(
                keyword3,
                /* GLSL */ `
                ${keyword3}
                vUv = uv;
                vDistance = uDistance;
                vDirection = uDirection;
                `,
            );
            
            const keyword1 = 'void main() {';
            shader.fragmentShader = shader.fragmentShader.replace(
                keyword1,
                /* GLSL */ `
                uniform float uTime;
                varying float vDirection;
                varying float vDistance;
                varying vec2 vUv;
                ${keyword1}`,
            );
            // 置換してシェーダーに追記する
            const keyword = 'gl_FragColor.a *= step(vCounters, visibility);';
            shader.fragmentShader = shader.fragmentShader.replace(
                keyword,
                /* GLSL */ `${keyword}
                vec2 p;
                p.x = vUv.x * vDistance;
                p.y = vUv.y * 1.0 - 0.5;
                
                float centerDistY = p.y; // 中心からのY距離
                float offset = abs(centerDistY) * 0.5; // 斜めの強さを制御
                
                float time = uTime;
                // 中心より上と下で斜めの方向を変える
                if(centerDistY < 0.0) {
                    if(vDirection == 1.0){
                        time = -uTime;
                        offset = -offset;
                    }else if(vDirection == 2.0) {
                        offset = offset;
                    }
                }
                
                // mod関数と中心からのy距離に基づくオフセットを使用して線を生成
                float line = mod(p.x - time + offset, 1.9) < 0.9 ? 1.0 : 0.0;
                vec3 mainColor;
                
                // 方向によって色を変える
                if(vDirection == 1.0) {
                    mainColor = vec3(0.0, 1.0, 1.0);
                } else if(vDirection == 2.0) {
                    mainColor = vec3(1.0, 1.0, 0.0);
                }
                vec3 color = mix(mainColor, mainColor, line);
                
                gl_FragColor = vec4(color, line * 0.7);
                `,
            );
        };
        
        // uniforms変数にuTime（時間）を追加
        Object.assign(linkMaterial.userData, {
            uniforms: {
                uTime: { value: 0 },
            },
        });
        
        return linkMaterial;
    }
    
    /**
     * 歩行者ネットワークを読み込む
     */
    async loadPedestrianNetwork() {
        try {
            // ノードデータを読み込む
            const nodeResponse = await fetch('/nw/Shinjuku_node.geojson');
            const nodeData = await nodeResponse.json();
            const nodeIds = nodeData.features.map((feature) => {
                return {
                    node_id: feature.properties.node_id,
                    ordinal: feature.properties.ordinal,
                };
            });
            
            // リンクデータを読み込む
            const linkResponse = await fetch('/nw/Shinjuku_link.geojson');
            const linkData = await linkResponse.json();
            
            // メッシュラインの配列
            const meshLines = [];
            this.linkMaterial = this.createLinkMaterial();
            
            linkData.features.forEach((feature) => {
                const coordinates = feature.geometry.coordinates;
                
                // ノードデータからstart_idとend_idの取得
                const start_id = nodeIds.find((node) => node.node_id === feature.properties.start_id);
                const end_id = nodeIds.find((node) => node.node_id === feature.properties.end_id);
                
                // 3次元のpointの配列を作成
                const points = coordinates.map((point, index) => {
                    let y;
                    
                    if (!start_id && !end_id) {
                        y = 0;
                    } else if (start_id && !end_id) {
                        y = start_id.ordinal;
                    } else if (!start_id && end_id) {
                        y = end_id.ordinal;
                    } else {
                        if (index === 0) {
                            y = start_id.ordinal;
                        } else if (index === coordinates.length - 1) {
                            y = end_id.ordinal;
                        } else if (start_id.ordinal === end_id.ordinal) {
                            y = end_id.ordinal;
                        } else {
                            y = Math.round((start_id.ordinal + end_id.ordinal) / 2);
                        }
                    }
                    return new THREE.Vector3(point[0] - this.center[0], y * this.verticalOffset + 1, -(point[1] - this.center[1]));
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
                    
                    // 頂点数に基づいて directions 配列を生成しsetAttributeで頂点属性を追加
                    const directions = new Float32Array(numVerticesAfter).fill(feature.properties.direction);
                    line.setAttribute('uDirection', new THREE.BufferAttribute(directions, 1));
                    
                    // MeshLineの配列に追加
                    meshLines.push(line.geometry);
                });
            });
            
            // MeshLineをマージ
            if (meshLines.length > 0) {
                const linkGeometry = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(meshLines), this.linkMaterial);
                linkGeometry.name = 'link';
                this.linkMesh = linkGeometry;
                this.scene.add(linkGeometry);
            }
        } catch (error) {
            console.error('Error loading pedestrian network:', error);
        }
    }
    
    /**
     * 基盤地図情報道路データを読み込む
     */
    async loadRoadData() {
        try {
            const response = await fetch('/fg.geojson');
            const data = await response.json();
            
            const material = new THREE.LineBasicMaterial({
                color: new THREE.Color('rgb(209, 102, 255)'),
            });
            
            data.features.forEach((feature) => {
                const coordinates = feature.geometry.coordinates;
                const points = coordinates[0].map((point) => {
                    return new THREE.Vector3(point[0] - this.center[0], point[1] - this.center[1], 0);
                });
                
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const matrix = new THREE.Matrix4().makeRotationX(Math.PI / -2);
                geometry.applyMatrix4(matrix);
                
                const line = new THREE.Line(geometry, material);
                const group = this.groups['group0'];
                if (group) {
                    group.add(line);
                }
            });
        } catch (error) {
            console.error('Error loading road data:', error);
        }
    }
    
    /**
     * 更新処理（毎フレーム呼ばれる）
     */
    onUpdate(deltaTime) {
        super.onUpdate(deltaTime);
        
        // 時間を更新
        this.time += deltaTime;
        
        // コントロールを更新
        if (this.mapControls) {
            const target = this.mapControls.target;
            this.mapControls.update();
            if (this.zoomControls) {
                this.zoomControls.target.set(target.x, target.y, target.z);
                this.zoomControls.update();
            }
        }
        
        // 歩行者ネットワークのアニメーション
        if (this.linkMaterial && this.linkMaterial.userData && this.linkMaterial.userData.uniforms) {
            this.linkTime += 0.1;
            this.linkMaterial.userData.uniforms.uTime.value = this.linkTime;
        }
    }
    
    /**
     * リセット処理
     */
    reset() {
        super.reset();
        
        // 時間をリセット
        this.time = 0.0;
        this.linkTime = 0.0;
        
        // カメラを初期位置に戻す
        this.camera.position.set(-190, 280, -350);
        this.camera.lookAt(0, 0, 0);
        
        if (this.mapControls) {
            this.mapControls.target.set(0, 0, 0);
            this.mapControls.update();
        }
        if (this.zoomControls) {
            this.zoomControls.target.set(0, 0, 0);
            this.zoomControls.update();
        }
    }
    
    /**
     * クリーンアップ処理
     */
    dispose() {
        // コントロールを破棄
        if (this.mapControls) {
            this.mapControls.dispose();
            this.mapControls = null;
        }
        if (this.zoomControls) {
            this.zoomControls.dispose();
            this.zoomControls = null;
        }
        
        // リンクマテリアルを破棄
        if (this.linkMaterial) {
            this.linkMaterial.dispose();
            this.linkMaterial = null;
        }
        
        // リンクメッシュを削除
        if (this.linkMesh) {
            this.scene.remove(this.linkMesh);
            if (this.linkMesh.geometry) {
                this.linkMesh.geometry.dispose();
            }
            if (this.linkMesh.material) {
                this.linkMesh.material.dispose();
            }
            this.linkMesh = null;
        }
        
        // グループをクリア
        Object.values(this.groups).forEach(group => {
            if (group) {
                while (group.children.length > 0) {
                    const child = group.children[0];
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                    group.remove(child);
                }
            }
        });
        this.groups = {};
        
        super.dispose();
    }
    
    /**
     * リサイズ処理
     */
    onResize() {
        super.onResize();
        
        if (this.mapControls) {
            this.mapControls.handleResize();
        }
        if (this.zoomControls) {
            this.zoomControls.handleResize();
        }
    }
}
