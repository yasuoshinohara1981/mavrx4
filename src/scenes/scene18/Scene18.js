/**
 * Scene18: AKIRA Fiber Core
 * 中央の白い巨大球体から、ランダムな太さのケーブルが重力で垂れ下がるシーン
 * AKIRAの「アキラ」の核をイメージ
 * トラック5で赤い光が中を駆け抜ける
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { StudioBox } from '../../lib/StudioBox.js';

export class Scene18 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'Fiber Core';
        this.initialized = false;
        this.sceneNumber = 18;
        this.kitNo = 18;
        
        this.sharedResourceManager = sharedResourceManager;
        
        // ケーブル関連
        this.cables = [];
        this.cableCount = 70; // 80 -> 70 (さらに軽量化してヌルヌルにするやで！)
        this.cableGroup = new THREE.Group();

        // 中央の球体
        this.centralSphere = null;
        this.coreRadius = 1300; // 1000 -> 1300 (さらに巨大化！もはや天体や！)
        this.detailGroup = new THREE.Group(); // 球体やケーブルの部品用
        this.clusterPositions = []; // パーツの配置場所を記録してケーブルと被らんようにするで！

        // 光の弾丸（ファイバーエフェクト）管理
        this.pulses = [];

        // 撮影用スタジオ
        this.studio = null;
        
        // エフェクト設定
        this.useDOF = true; 
        this.useBloom = true; 
        this.bloomPass = null;

        // ストロボエフェクト管理
        this.strobeActive = false;
        this.strobeEndTime = 0;

        // カラー管理（トラック8で変化）
        this.pulseColor = new THREE.Color(1.0, 0.0, 0.0); // 初期値は赤
        this.targetPulseColor = new THREE.Color(1.0, 0.0, 0.0);
        this.colorIndex = 0; // トラック8が鳴る度に切り替えるためのインデックス
        this.colors = [
            new THREE.Color(1.0, 0.0, 0.0), // 赤
            new THREE.Color(0.0, 1.0, 0.0), // 緑
            new THREE.Color(0.0, 0.0, 1.0), // 青
            new THREE.Color(1.0, 1.0, 1.0), // 白
            new THREE.Color(1.0, 0.0, 1.0), // 紫
            new THREE.Color(0.0, 1.0, 1.0)  // 水色
        ];

        // 球体の発光管理（トラック5で変化）
        this.coreEmissiveIntensity = 0.1;
        this.targetCoreEmissiveIntensity = 0.1;

        // ライト管理（パルス連動）
        this.pointLight = null;
        this.lightIntensity = 0.0;
        this.targetLightIntensity = 0.0;

        this.trackEffects = {
            1: true, 2: false, 3: false, 4: false, 5: true, 6: true, 7: false, 8: false, 9: false
        };

        this.setScreenshotText(this.title);
    }

    setupCameraParticleDistance(cameraParticle) {
        // 球体の半径が1300、中心高さ400
        // 最小距離をさらに離して（2000 -> 3500）、強制的に引きの絵を作るやで！
        cameraParticle.minDistance = 3500; 
        cameraParticle.maxDistance = 6500; // 8500 -> 6500 (スタジオの外に出すぎないように調整！)
        
        // 高さのバリエーションも調整！
        cameraParticle.minY = 200; 
        cameraParticle.maxY = 4500; // 6000 -> 4500 (天井突き抜け防止)
    }

    /**
     * カメラの位置を更新（SceneBaseのオーバーライド）
     */
    updateCamera() {
        if (this.cameraParticles[this.currentCameraIndex]) {
            const cp = this.cameraParticles[this.currentCameraIndex];
            const cameraPos = cp.getPosition();
            
            // --- 球体の内部に入らないように強制補正 ---
            const coreCenter = new THREE.Vector3(0, 400, 0);
            const distToCore = cameraPos.distanceTo(coreCenter);
            
            // 安全距離（半径1300 + 余裕分）
            const safeDistance = 2500; // 1600 -> 2500 (近すぎを物理的に排除！)
            
            if (distToCore < safeDistance) {
                const dir = cameraPos.clone().sub(coreCenter).normalize();
                cameraPos.copy(coreCenter.clone().add(dir.multiplyScalar(safeDistance)));
            }

            // 部屋の境界（StudioBox）を突き抜けないようにクランプ
            // StudioBoxのデフォルトサイズは10000x10000x10000（中心0,0,0）
            // なので、-5000〜5000の範囲に収める必要があるんや！
            const roomLimit = 4800; // 7500 -> 4800 (壁の厚みを考慮)
            cameraPos.x = THREE.MathUtils.clamp(cameraPos.x, -roomLimit, roomLimit);
            cameraPos.z = THREE.MathUtils.clamp(cameraPos.z, -roomLimit, roomLimit);
            cameraPos.y = THREE.MathUtils.clamp(cameraPos.y, 150, 4800); // 床下(0以下)に行かないように！
            
            this.camera.position.copy(cameraPos);
            this.camera.lookAt(coreCenter);
            this.camera.matrixWorldNeedsUpdate = false;
        }
    }

    /**
     * カメラをランダムに切り替える（SceneBase de override）
     */
    switchCameraRandom() {
        super.switchCameraRandom();
        
        const cp = this.cameraParticles[this.currentCameraIndex];
        if (cp) {
            // ランダム切り替え時に、スタジオ内に収まるように位置を調整するやで！
            const rand = Math.random();
            const roomLimit = 4500;
            if (rand < 0.4) {
                // 引きの絵（部屋の隅っこ）
                const angle = Math.random() * Math.PI * 2;
                const dist = 3500 + Math.random() * 1000;
                cp.position.set(
                    Math.cos(angle) * dist,
                    1000 + Math.random() * 2000,
                    Math.sin(angle) * dist
                );
            } else if (rand < 0.7) {
                // ローアングル
                const angle = Math.random() * Math.PI * 2;
                const dist = 3000 + Math.random() * 1500;
                cp.position.set(
                    Math.cos(angle) * dist,
                    250 + Math.random() * 400,
                    Math.sin(angle) * dist
                );
            } else {
                // 俯瞰
                const angle = Math.random() * Math.PI * 2;
                const dist = 3500 + Math.random() * 1000;
                cp.position.set(
                    Math.cos(angle) * dist,
                    3500 + Math.random() * 1000,
                    Math.sin(angle) * dist
                );
            }
        }
    }

    async setup() {
        if (this.initialized) return;
        await super.setup();

        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.3;

        // 初期位置も十分に離す
        this.camera.position.set(0, 5000, 10000); 
        this.camera.lookAt(0, 400, 0);
        if (this.camera.fov !== 60) {
            this.camera.fov = 60;
            this.camera.updateProjectionMatrix();
        }

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // CubeCameraのセットアップ（反射用）
        this.cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, { 
            generateMipmaps: true, 
            minFilter: THREE.LinearMipmapLinearFilter 
        });
        this.cubeCamera = new THREE.CubeCamera(10, 10000, this.cubeRenderTarget);
        this.cubeCamera.position.set(0, 500, 0);
        this.scene.add(this.cubeCamera);

        this.setupLights();
        this.createStudioBox();
        this.createCore();
        this.createSphereDetails(); // 球体の部品追加
        this.createCables();
        this.initPostProcessing();
        this.setParticleCount(this.cableCount); // HUDのOBJECTSにケーブル本数を表示！
        this.initialized = true;
    }

    setupLights() {
        const pureWhite = 0xffffff; 
        // 環境光を大幅に上げる（0.12 -> 0.6）
        const hemiLight = new THREE.HemisphereLight(pureWhite, 0x444444, 0.6); 
        this.scene.add(hemiLight);

        const ambientLight = new THREE.AmbientLight(pureWhite, 0.4); // 0.08 -> 0.4
        this.scene.add(ambientLight);

        // 指向性ライトも強化（0.25 -> 1.2）
        const directionalLight = new THREE.DirectionalLight(pureWhite, 1.2); 
        directionalLight.position.set(2000, 3000, 2000);
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.left = -8000;
        directionalLight.shadow.camera.right = 8000;
        directionalLight.shadow.camera.top = 8000;
        directionalLight.shadow.camera.bottom = -8000;
        directionalLight.shadow.camera.near = 100;
        directionalLight.shadow.camera.far = 15000;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.bias = -0.0001;
        this.scene.add(directionalLight);

        // パルス連動用の点光源は残しつつ、ベースの明るさを確保
        this.pointLight = new THREE.PointLight(pureWhite, 0.0, 8000); 
        this.pointLight.position.set(0, 500, 0); 
        this.pointLight.castShadow = false; 
        this.scene.add(this.pointLight);
    }

    createStudioBox() {
        this.studio = new StudioBox(this.scene); // デフォルト設定（Scene14と同じ）
    }

    createCore() {
        const coreColor = 0xaaaaaa; // 0x777777 -> 0xaaaaaa (さらに明るめのグレーに！)
        const textures = this.generateDirtyTextures(1024, coreColor, true); 
        const sphereGeo = new THREE.SphereGeometry(this.coreRadius, 64, 64);
        const sphereMat = new THREE.MeshStandardMaterial({
            color: coreColor,
            map: textures.map,
            bumpMap: textures.bumpMap,
            bumpScale: 2.0, 
            emissive: 0x444444, // 自己発光も少し明るく
            emissiveIntensity: 0.1, 
            metalness: 0.1,
            roughness: 0.9,
            envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
            envMapIntensity: 0.5
        });
        this.centralSphere = new THREE.Mesh(sphereGeo, sphereMat);
        this.centralSphere.position.y = 400;
        this.centralSphere.castShadow = true;
        this.centralSphere.receiveShadow = true;
        this.scene.add(this.centralSphere);
        this.scene.add(this.detailGroup);
    }

    generateDirtyTextures(size = 512, baseColor = 0xffffff, isMatte = false) {
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size; colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');
        
        // ベースカラー
        const hex = '#' + new THREE.Color(baseColor).getHexString();
        cCtx.fillStyle = hex;
        cCtx.fillRect(0, 0, size, size);
        
        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size; bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');
        bCtx.fillStyle = '#808080'; // 中間グレー
        bCtx.fillRect(0, 0, size, size);
        
        // 汚れ・かすれの描画（密度を大幅に下げて、粗さを抑えるやで！）
        const dirtCount = isMatte ? 500 : 300; // 4000 -> 500 (かなり減らしたで！)
        for (let i = 0; i < dirtCount; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = Math.random() * (isMatte ? 4 : 2); // サイズも少し小さめに
            const alpha = Math.random() * 0.15; // 透明度も下げて馴染ませる
            
            // カラーキャンバスに暗い汚れ
            cCtx.fillStyle = `rgba(40, 40, 40, ${alpha})`;
            cCtx.beginPath();
            cCtx.arc(x, y, r, 0, Math.PI * 2);
            cCtx.fill();
            
            // バンプキャンバスに凹凸（コントラストを抑えて滑らかに）
            const val = 128 + (Math.random() - 0.5) * 40;
            bCtx.fillStyle = `rgb(${val}, ${val}, ${val})`;
            bCtx.beginPath();
            bCtx.arc(x, y, r, 0, Math.PI * 2);
            bCtx.fill();
        }

        // ひっかき傷も控えめに
        for (let i = 0; i < 50; i++) { // 200 -> 50
            const x = Math.random() * size;
            const y = Math.random() * size;
            const len = 5 + Math.random() * 30;
            const angle = Math.random() * Math.PI * 2;
            
            bCtx.strokeStyle = Math.random() > 0.5 ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
            bCtx.lineWidth = 0.5;
            bCtx.beginPath();
            bCtx.moveTo(x, y);
            bCtx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
            bCtx.stroke();
        }

        // ケーブル用のかすれた線（プラスチック感）
        if (!isMatte) {
            for (let i = 0; i < 100; i++) {
                const x = Math.random() * size;
                const y = Math.random() * size;
                const len = 20 + Math.random() * 100;
                const angle = Math.random() * Math.PI * 2;
                
                cCtx.strokeStyle = `rgba(100, 100, 100, 0.1)`;
                cCtx.lineWidth = 1;
                cCtx.beginPath();
                cCtx.moveTo(x, y);
                cCtx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
                cCtx.stroke();
                
                bCtx.strokeStyle = `rgb(100, 100, 100)`;
                bCtx.beginPath();
                bCtx.moveTo(x, y);
                bCtx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
                bCtx.stroke();
            }
        }
        
        const map = new THREE.CanvasTexture(colorCanvas);
        const bumpMap = new THREE.CanvasTexture(bumpCanvas);
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
        
        return { map, bumpMap };
    }

    createSphereDetails() {
        const clusterCount = 100; // 40 -> 100 (パーツをガッツリ増やすで！)
        this.clusterPositions = []; // 初期化
        
        // ジオメトリをマージするための準備（色ごとに分けるやで！）
        const geometriesByColor = {
            dark: [],
            mid: [],
            light: []
        };

        for (let i = 0; i < clusterCount; i++) {
            const phi = Math.random() * Math.PI * 2;
            const theta = Math.random() * Math.PI;
            
            const x = this.coreRadius * Math.sin(theta) * Math.cos(phi);
            const y = this.coreRadius * Math.cos(theta) + 400;
            const z = this.coreRadius * Math.sin(theta) * Math.sin(phi);
            const pos = new THREE.Vector3(x, y, z);
            const normal = pos.clone().sub(new THREE.Vector3(0, 400, 0)).normalize();

            // 下半分に集中させる（メインケーブルとの調和）
            if (y > 600 && Math.random() > 0.4) continue; // 少し判定を緩めてパーツを残す

            this.clusterPositions.push(pos); // 位置を記録！
            const clusterType = Math.floor(Math.random() * 4); 

            // このクラスターの色を決定（濃淡バリエーション！）
            const colorTypeRand = Math.random();
            let targetList;
            if (colorTypeRand < 0.4) targetList = geometriesByColor.dark;
            else if (colorTypeRand < 0.8) targetList = geometriesByColor.mid;
            else targetList = geometriesByColor.light;

            // ダミーのObject3Dを使って行列計算を楽にするやで
            const dummy = new THREE.Object3D();
            dummy.position.copy(pos);
            dummy.lookAt(pos.clone().add(normal));
            dummy.updateMatrix();

            if (clusterType === 0) {
                // --- パネルユニット (ベースプレート + Box + スイッチ列) ---
                const baseWidth = 300 + Math.random() * 400; // 150-350 -> 300-700
                const baseHeight = 300 + Math.random() * 400;
                const baseGeo = new THREE.BoxGeometry(baseWidth, baseHeight, 40); // 厚みもアップ
                baseGeo.applyMatrix4(dummy.matrix);
                targetList.push(baseGeo);

                // パネルの上のBox
                const boxGeo = new THREE.BoxGeometry(baseWidth * 0.7, baseHeight * 0.7, 80);
                const boxMatrix = dummy.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 40));
                boxGeo.applyMatrix4(boxMatrix);
                targetList.push(boxGeo);

                // スイッチの列（スイッチも巨大化！）
                const switchCount = 3 + Math.floor(Math.random() * 3);
                const switchGeo = new THREE.BoxGeometry(50, 50, 60);
                for (let j = 0; j < switchCount; j++) {
                    const sGeo = switchGeo.clone();
                    const sMatrix = dummy.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(
                        (j / (switchCount - 1) - 0.5) * baseWidth * 0.8,
                        -baseHeight * 0.3,
                        70
                    ));
                    sGeo.applyMatrix4(sMatrix);
                    targetList.push(sGeo);
                }
            } else if (clusterType === 1) {
                // --- 円形コネクタユニット (大円盤 + 小円盤 + パイプ) ---
                const baseRadius = 250 + Math.random() * 200; // 120-220 -> 250-450
                const baseGeo = new THREE.CylinderGeometry(baseRadius, baseRadius, 40, 24);
                const baseMatrix = dummy.matrix.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
                baseGeo.applyMatrix4(baseMatrix);
                targetList.push(baseGeo);

                // 重ねる小円盤
                const subGeo = new THREE.CylinderGeometry(baseRadius * 0.6, baseRadius * 0.6, 60, 24);
                const subMatrix = baseMatrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 30, 0));
                subGeo.applyMatrix4(subMatrix);
                targetList.push(subGeo);

                // 突き出るパイプ（太く長く！）
                const pipeGeo = new THREE.CylinderGeometry(50, 50, 300, 12);
                const pipeMatrix = baseMatrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 100, 0));
                pipeGeo.applyMatrix4(pipeMatrix);
                targetList.push(pipeGeo);
            } else if (clusterType === 2) {
                // --- メンテナンスハッチユニット (プレート + ボルト風ディテール) ---
                const size = 300 + Math.random() * 250; // 150-250 -> 300-550
                const hatchGeo = new THREE.CylinderGeometry(size, size, 30, 6);
                const hatchMatrix = dummy.matrix.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
                hatchGeo.applyMatrix4(hatchMatrix);
                targetList.push(hatchGeo);

                // ボルト風の小さい円柱を角に配置（ボルトもデカい！）
                const boltGeo = new THREE.CylinderGeometry(30, 30, 50, 8);
                for (let j = 0; j < 6; j++) {
                    const bGeo = boltGeo.clone();
                    const angle = (j / 6) * Math.PI * 2;
                    const bMatrix = hatchMatrix.clone().multiply(new THREE.Matrix4().makeTranslation(
                        Math.cos(angle) * size * 0.8,
                        20,
                        Math.sin(angle) * size * 0.8
                    ));
                    bGeo.applyMatrix4(bMatrix);
                    targetList.push(bGeo);
                }
            } else {
                // --- サブケーブル・ジャンクションユニット ---
                const boxSize = 250 + Math.random() * 200;
                const baseGeo = new THREE.BoxGeometry(boxSize, boxSize, 100);
                baseGeo.applyMatrix4(dummy.matrix);
                targetList.push(baseGeo);

                // そこから生える細いケーブル（サブケーブルも太く！）
                const subCableCount = 2 + Math.floor(Math.random() * 2);
                for (let j = 0; j < subCableCount; j++) {
                    const subRadius = 25 + Math.random() * 15; // 12-22 -> 25-40
                    const subPoints = [];
                    const startOffset = new THREE.Vector3((j - 0.5) * 100, 0, 50).applyQuaternion(dummy.quaternion);
                    const subStartPos = pos.clone().add(startOffset);
                    subPoints.push(subStartPos);
                    
                    subPoints.push(subStartPos.clone().add(normal.clone().multiplyScalar(400)).add(new THREE.Vector3(0, -600, 0)));
                    subPoints.push(new THREE.Vector3(pos.x * 1.6, -498, pos.z * 1.6));

                    const subCurve = new THREE.CatmullRomCurve3(subPoints);
                    const subGeo = new THREE.TubeGeometry(subCurve, 32, subRadius, 8, false);
                    targetList.push(subGeo);
                }
            }
        }

        // 色ごとのマテリアル作成とメッシュ生成
        const colors = {
            dark: 0x666666,  // 0x444444 -> 0x666666 (全体的に一段階アップ！)
            mid: 0x999999,   // 0x888888 -> 0x999999
            light: 0xdddddd  // 0xcccccc -> 0xdddddd
        };

        this.detailMaterials = []; // 管理用

        for (const [key, geoList] of Object.entries(geometriesByColor)) {
            if (geoList.length > 0) {
                const color = colors[key];
                const textures = this.generateDirtyTextures(512, color, false);
                const mat = new THREE.MeshStandardMaterial({
                    color: color,
                    map: textures.map,
                    bumpMap: textures.bumpMap,
                    bumpScale: 1.5,
                    emissive: 0x222222,
                    emissiveIntensity: 0.1,
                    metalness: 0.2,
                    roughness: 0.8,
                    envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
                    envMapIntensity: 0.5
                });
                this.detailMaterials.push(mat);

                const mergedGeo = BufferGeometryUtils.mergeGeometries(geoList);
                const mergedMesh = new THREE.Mesh(mergedGeo, mat);
                mergedMesh.castShadow = true;
                mergedMesh.receiveShadow = true;
                this.detailGroup.add(mergedMesh);
            }
        }
    }

    createCableRings(curve, cableRadius, ringColor) {
        const ringCount = 2 + Math.floor(Math.random() * 4); 
        const ringMat = new THREE.MeshStandardMaterial({
            color: ringColor,
            metalness: 0.5, 
            roughness: 0.6, 
            envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
            envMapIntensity: 1.0 
        });

        for (let i = 0; i < ringCount; i++) {
            const t = 0.1 + Math.random() * 0.8; // 根本と先端を避ける
            const pos = curve.getPointAt(t);
            const tangent = curve.getTangentAt(t);

            const ringGeo = new THREE.TorusGeometry(cableRadius * 1.2, cableRadius * 0.2, 12, 24);
            const ring = new THREE.Mesh(ringGeo, ringMat);
            
            ring.position.copy(pos);
            ring.lookAt(pos.clone().add(tangent));
            
            ring.castShadow = true;
            ring.receiveShadow = true;
            this.detailGroup.add(ring);
        }
    }

    createCables() {
        const cableColor = 0x222222; // ケーブルはかなり黒く
        this.scene.add(this.cableGroup);
        const floorY = -498;
        const cableTextures = this.generateDirtyTextures(1024, cableColor, false); 

        let generatedCount = 0;
        let attempts = 0;
        const maxAttempts = 5000; // 試行回数を大幅に増やして確実に生成するやで！

        // --- 束感（Bundle）のロジック ---
        const bundleCount = 25; // 束の数を固定して安定させる
        
        while (generatedCount < this.cableCount && attempts < maxAttempts) {
            attempts++;
            
            // 束の基点となる方向を決定
            const bundlePhi = Math.acos(2 * Math.random() - 1);
            const bundleTheta = Math.random() * Math.PI * 2;
            
            // 束の中のケーブル本数（2〜5本）
            const cablesInBundle = 2 + Math.floor(Math.random() * 4);
            
            // 束ごとの終端の偏り（ノイズ）
            const bundleEndOffsetX = (Math.random() - 0.5) * 2000;
            const bundleEndOffsetZ = (Math.random() - 0.5) * 2000;

            for (let c = 0; c < cablesInBundle && generatedCount < this.cableCount; c++) {
                // 束から外れる「はぐれケーブル」をさらに低確率にするやで！
                const isLoneCable = Math.random() < 0.05; // 15% -> 5% に大幅ダウン！

                // 束の中で少しだけ位置をずらす
                const phi = bundlePhi + (Math.random() - 0.5) * (isLoneCable ? 0.8 : 0.15);
                const theta = bundleTheta + (Math.random() - 0.5) * (isLoneCable ? 0.8 : 0.15);
                
                const normal = new THREE.Vector3(
                    Math.sin(phi) * Math.cos(theta),
                    Math.cos(phi),
                    Math.sin(phi) * Math.sin(theta)
                );

                const startPos = normal.clone().multiplyScalar(this.coreRadius);
                startPos.y += 400;

                // 既存のパーツ位置との距離をチェック（少し判定を甘くして生成しやすくする）
                let isTooClose = false;
                for (const clusterPos of this.clusterPositions) {
                    if (startPos.distanceTo(clusterPos) < 120) { // 150 -> 120
                        isTooClose = true;
                        break;
                    }
                }
                if (isTooClose) continue;

                generatedCount++;

                // --- ケーブルの属性決定 ---
                const colorRand = Math.random();
                let finalCableColor;
                let isWhiteNonGlowing = false;
                let isGreyNonGlowing = false;

                if (colorRand < 0.05) {
                    finalCableColor = 0xffffff;
                    isWhiteNonGlowing = true;
                } else if (colorRand < 0.1) {
                    finalCableColor = 0x666666;
                    isGreyNonGlowing = true;
                } else {
                    finalCableColor = 0x111111;
                }

                const isNonGlowing = isWhiteNonGlowing || isGreyNonGlowing;

                let radius;
                if (isNonGlowing) {
                    radius = 40 + Math.random() * 60; 
                } else {
                    const radiusRand = Math.random();
                    if (radiusRand < 0.5) {
                        radius = 15 + Math.random() * 15;
                    } else if (radiusRand < 0.9) {
                        radius = 35 + Math.random() * 30;
                    } else {
                        radius = 80 + Math.random() * 40;
                    }
                }

                // --- 接続ユニット ---
                const unitGroup = new THREE.Group();
                unitGroup.position.copy(startPos);
                unitGroup.lookAt(startPos.clone().add(normal));
                this.detailGroup.add(unitGroup);

                const flangeGeo = new THREE.CylinderGeometry(radius * 2.0, radius * 2.0, 15, 8);
                const unitMat = new THREE.MeshStandardMaterial({
                    color: isNonGlowing ? finalCableColor : 0x444444, 
                    metalness: isNonGlowing ? 0.0 : 0.6,
                    roughness: isNonGlowing ? 1.0 : 0.4,
                    envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
                    envMapIntensity: isNonGlowing ? 0.1 : 1.0
                });
                const flange = new THREE.Mesh(flangeGeo, unitMat);
                flange.rotateX(Math.PI / 2);
                unitGroup.add(flange);

                const coreGeo = new THREE.CylinderGeometry(radius * 1.4, radius * 1.6, 30, 16);
                const coreSocket = new THREE.Mesh(coreGeo, unitMat);
                coreSocket.rotateX(Math.PI / 2);
                coreSocket.position.z = 15;
                unitGroup.add(coreSocket);

                const points = [];
                points.push(startPos.clone());
                
                const isUpper = startPos.y > 400;
                const pushDist = (isUpper ? 300 : 150) + (radius * 2.0) + (Math.random() * 100);
                const point1 = startPos.clone().add(normal.clone().multiplyScalar(pushDist));
                points.push(point1);

                // --- 終端の計算（束ごとの偏りを適用、はぐれケーブルはさらにランダム） ---
                let groundDist = isUpper ? (3500 + Math.random() * 3000) : (2000 + Math.random() * 2500);
                const groundAngle = Math.atan2(normal.z, normal.x) + (Math.random() - 0.5) * (isLoneCable ? 1.5 : 0.5);
                
                // 束のオフセットをノイズ的に加える（はぐれケーブルはオフセットを無視してランダムに飛ぶ）
                let groundX, groundZ;
                if (isLoneCable) {
                    groundX = Math.cos(groundAngle) * groundDist;
                    groundZ = Math.sin(groundAngle) * groundDist;
                } else {
                    groundX = Math.cos(groundAngle) * groundDist + bundleEndOffsetX * (0.8 + Math.random() * 0.4);
                    groundZ = Math.sin(groundAngle) * groundDist + bundleEndOffsetZ * (0.8 + Math.random() * 0.4);
                }

                const roomLimit = 4500;
                if (Math.abs(groundX) > roomLimit || Math.abs(groundZ) > roomLimit) {
                    const scale = roomLimit / Math.max(Math.abs(groundX), Math.abs(groundZ));
                    groundX *= scale;
                    groundZ *= scale;
                }
                
                if (isUpper) {
                    const bulgeScale = 1.4 + (radius < 40 ? 0.4 : (radius / 250)); 
                    const midY = Math.max(point1.y * 0.5, 600); 
                    points.push(new THREE.Vector3(
                        point1.x * bulgeScale,
                        midY,
                        point1.z * bulgeScale
                    ));
                } else {
                    const midDistScale = 1.6 + (radius < 40 ? 0.5 : 0.0);
                    points.push(new THREE.Vector3(
                        point1.x * midDistScale,
                        floorY + 300,
                        point1.z * midDistScale
                    ));
                }

                const endPos = new THREE.Vector3(groundX, floorY, groundZ);
                const approachHeight = 200 + (radius * 1.2);
                points.push(new THREE.Vector3(groundX, floorY + approachHeight, groundZ)); 
                points.push(endPos);

                const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.2); 
                const segments = radius > 60 ? 140 : 70;
                const geometry = new THREE.TubeGeometry(curve, segments, radius, 10, false); 
                
                const material = new THREE.MeshStandardMaterial({
                    color: finalCableColor,
                    bumpScale: 2.5,
                    emissive: isWhiteNonGlowing ? 0xffffff : (isGreyNonGlowing ? 0x666666 : 0x000000), 
                    emissiveIntensity: isWhiteNonGlowing ? 0.15 : (isGreyNonGlowing ? 0.08 : 0.0),
                    metalness: isNonGlowing ? 0.0 : 0.8, 
                    roughness: isNonGlowing ? 1.0 : 0.2, 
                    envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
                    envMapIntensity: isNonGlowing ? 0.0 : 2.0 
                });
                
                if (!isNonGlowing) {
                    material.map = cableTextures.map;
                    material.bumpMap = cableTextures.bumpMap;
                }

                if (!isWhiteNonGlowing) {
                    material.onBeforeCompile = (shader) => {
                        shader.uniforms.uPulses = { value: new Float32Array(10).fill(-1.0) };
                        shader.uniforms.uPulseColor = { value: this.pulseColor };
                        
                        shader.vertexShader = `
                            varying vec2 vUv;
                            ${shader.vertexShader}
                        `.replace(
                            `#include <begin_vertex>`,
                            `#include <begin_vertex>
                            vUv = uv;`
                        );

                        shader.fragmentShader = `
                            uniform float uPulses[10];
                            uniform vec3 uPulseColor;
                            varying vec2 vUv;
                            ${shader.fragmentShader}
                        `.replace(
                            `#include <dithering_fragment>`,
                            `
                            #include <dithering_fragment>
                            float pulseEffect = 0.0;
                            for(int i = 0; i < 10; i++) {
                                if(uPulses[i] >= 0.0) {
                                    float dist = abs(vUv.x - uPulses[i]);
                                    pulseEffect += smoothstep(0.03, 0.0, dist);
                                }
                            }
                            vec3 pCol = uPulseColor;
                            float constantGlow = smoothstep(0.15, 0.0, vUv.x) * 0.3;
                            gl_FragColor.rgb += pCol * (pulseEffect * 12.0 + constantGlow); 
                            `
                        );
                        material.userData.shader = shader;
                    };
                }

                const mesh = new THREE.Mesh(geometry, material);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.cableGroup.add(mesh);
                this.cables.push({ mesh, material, isGlowing: !isWhiteNonGlowing });

                const endRingGeo = new THREE.TorusGeometry(radius * 1.3, radius * 0.3, 10, 20);
                const endRingMat = new THREE.MeshStandardMaterial({
                    color: finalCableColor,
                    metalness: 0.5, 
                    roughness: 0.6, 
                    envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
                    envMapIntensity: 1.0 
                });
                const endRing = new THREE.Mesh(endRingGeo, endRingMat);
                endRing.position.copy(endPos);
                endRing.rotateX(Math.PI / 2);
                endRing.castShadow = true;
                endRing.receiveShadow = true;
                this.detailGroup.add(endRing);

                if (Math.random() > 0.4) {
                    this.createCableRings(curve, radius, finalCableColor);
                }
            }
        }
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;

        // カメラの更新を明示的に呼ぶ
        this.updateCamera();

        // カラーの補間（トラック8で変化）
        this.pulseColor.lerp(this.targetPulseColor, 0.1);

        // 球体の発光強度の補間（トラック5連動は解除！）
        this.coreEmissiveIntensity = 0.1; // ベースの明るさに固定
        if (this.centralSphere && this.centralSphere.material) {
            this.centralSphere.material.emissiveIntensity = this.coreEmissiveIntensity;
            this.centralSphere.material.emissive.setHex(0x222222); // 固定色
        }
        // パーツのマテリアルも固定！
        if (this.detailMaterials) {
            this.detailMaterials.forEach(mat => {
                mat.emissiveIntensity = this.coreEmissiveIntensity;
                mat.emissive.setHex(0x111111);
            });
        }

        // ライト強度の補間（パルス連動）
        this.lightIntensity += (this.targetLightIntensity - this.lightIntensity) * 0.15;
        if (this.pointLight) {
            this.pointLight.intensity = this.lightIntensity;
            // ライトの色もパルス色に合わせる！
            this.pointLight.color.copy(this.pulseColor);
        }
        // ライトもすぐに暗く戻ろうとする
        this.targetLightIntensity += (0.0 - this.targetLightIntensity) * 0.1;

        for (let i = this.pulses.length - 1; i >= 0; i--) {
            const p = this.pulses[i];
            p.progress += deltaTime * p.speed;
            if (p.progress > 1.2) {
                this.pulses.splice(i, 1);
            }
        }

        this.cables.forEach(cable => {
            if (cable.material.userData.shader) {
                const shader = cable.material.userData.shader;
                const pulseArray = new Float32Array(10).fill(-1.0);
                this.pulses.forEach((p, idx) => {
                    if (idx < 10) pulseArray[idx] = p.progress;
                });
                shader.uniforms.uPulses.value = pulseArray;
                shader.uniforms.uPulseColor.value = this.pulseColor; // 補間後の色を渡す！
            }
        });

        if (this.cubeCamera && Math.floor(this.time * 60) % 4 === 0) {
            this.cubeCamera.update(this.renderer, this.scene);
        }
        
        this.updateAutoFocus();
    }

    triggerPulse(velocity = 127) {
        const speed = 0.3 + (velocity / 127.0) * 1.0;
        this.pulses.push({
            progress: 0.0,
            speed: speed
        });

        // 球体は光らせない（ロジック削除）

        // ライトを光らせる！
        this.targetLightIntensity = (velocity / 127.0) * 10.0; // 瞬間的に強く照らす！
    }

    initPostProcessing() {
        if (!this.composer) {
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
        }
        if (this.useBloom) {
            this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 4, window.innerHeight / 4), 0.2, 0.05, 0.9);
            this.composer.addPass(this.bloomPass);
        }
        if (this.useDOF) {
            this.initDOF({
                focus: 2500,
                aperture: 0.00001,
                maxblur: 0.005
            });
        }
    }

    handleTrackNumber(trackNumber, message) {
        if (trackNumber === 2) {
            const args = message.args || [];
            const durationMs = (args.length >= 3) ? args[2] : 500;
            this.strobeActive = true; 
            this.strobeEndTime = Date.now() + durationMs;
        }
        // トラック5と6の両方でパルスをトリガーできるようにするやで！
        if (trackNumber === 5 || trackNumber === 6) {
            const args = message.args || [];
            const velocity = args[1] !== undefined ? args[1] : 127;
            this.triggerPulse(velocity);
        }

        // トラック8で色を変化させるやで！
        if (trackNumber === 8) {
            const args = message.args || [];
            const velocity = args[1] !== undefined ? args[1] : 0;
            
            // トラック8が鳴る（velocity > 0）度に色を切り替えるやで！
            if (velocity > 0) {
                this.colorIndex = (this.colorIndex + 1) % this.colors.length;
                this.targetPulseColor.copy(this.colors[this.colorIndex]);
            }
        }
    }

    updateAutoFocus() {
        if (!this.useDOF || !this.bokehPass || !this.centralSphere) return;
        
        // カメラのワールド座標を確実に取得
        const cameraWorldPos = new THREE.Vector3();
        this.camera.getWorldPosition(cameraWorldPos);
        
        // 球体（核）の中心座標（動的に取得するように変更！）
        const coreCenter = new THREE.Vector3();
        this.centralSphere.getWorldPosition(coreCenter);
        
        // カメラから球体中心までの距離
        const distToCenter = cameraWorldPos.distanceTo(coreCenter);
        
        // 【重要】中心ではなく「球体の表面」にピントを合わせるやで！
        // 距離から半径を引くことで、カメラに一番近い表面にフォーカスが来るはずや！
        let focusDist = distToCenter - this.coreRadius;
        
        // 万が一カメラが球体の中に入ったり近すぎたりした時のための安全策
        if (focusDist < 10) focusDist = 10;
        
        // フォーカスを更新
        this.bokehPass.uniforms.focus.value = focusDist;
    }

    render() {
        if (this.strobeActive) {
            const isWhite = Math.floor(performance.now() / 32) % 2 === 0;
            this.renderer.setClearColor(isWhite ? 0xffffff : 0x000000);
        } else {
            this.renderer.setClearColor(0x000000);
        }
        super.render();
    }

    dispose() {
        this.initialized = false;
        if (this.studio) this.studio.dispose();
        if (this.cubeRenderTarget) this.cubeRenderTarget.dispose();
        if (this.centralSphere) {
            this.scene.remove(this.centralSphere);
            this.centralSphere.geometry.dispose();
            this.centralSphere.material.dispose();
        }
        if (this.detailGroup) {
            this.detailGroup.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.scene.remove(this.detailGroup);
        }
        this.cables.forEach(c => {
            this.cableGroup.remove(c.mesh);
            c.mesh.geometry.dispose();
            c.mesh.material.dispose();
        });
        this.cables = [];
        this.scene.remove(this.cableGroup);
        super.dispose();
    }
}
