/**
 * Scene18: AKIRA Fiber Core
 * 中央の白い巨大球体から、ランダムな太さのケーブルが重力で垂れ下がるシーン
 * AKIRAの「アキラ」の核をイメージ
 * トラック5で赤い光が中を駆け抜ける
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
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
        this.cableCount = 100; // 120 -> 100 (少し減らしてバランス調整！)
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

        this.trackEffects = {
            1: true, 2: false, 3: false, 4: false, 5: true, 6: true, 7: false, 8: false, 9: false
        };

        this.setScreenshotText(this.title);
    }

    setupCameraParticleDistance(cameraParticle) {
        // 球体の半径が1300、中心高さが400
        cameraParticle.minDistance = 2500; 
        cameraParticle.maxDistance = 4800; 
        cameraParticle.minY = 300; 
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
            const safeDistance = 1800; 
            
            if (distToCore < safeDistance) {
                const dir = cameraPos.clone().sub(coreCenter).normalize();
                cameraPos.copy(coreCenter.clone().add(dir.multiplyScalar(safeDistance)));
            }
            
            this.camera.position.copy(cameraPos);
            this.camera.lookAt(coreCenter);
            this.camera.matrixWorldNeedsUpdate = false;
        }
    }

    /**
     * カメラをランダムに切り替える（SceneBaseのオーバーライド）
     */
    switchCameraRandom() {
        super.switchCameraRandom();
        
        const cp = this.cameraParticles[this.currentCameraIndex];
        if (cp) {
            const dist = cp.position.length();
            if (dist > 4800) {
                cp.position.normalize().multiplyScalar(4800);
            }
            if (dist < 2500) {
                cp.position.normalize().multiplyScalar(3500 + Math.random() * 1000);
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
        const hemiLight = new THREE.HemisphereLight(pureWhite, 0x888888, 0.8); // 1.5 -> 0.8
        this.scene.add(hemiLight);

        const ambientLight = new THREE.AmbientLight(pureWhite, 0.3); // 1.0 -> 0.3
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(pureWhite, 1.5); // 5.0 -> 1.5
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

        const pointLight = new THREE.PointLight(pureWhite, 2.5, 5000); 
        pointLight.position.set(0, 500, 0); 
        pointLight.castShadow = false; // 影をオフにして爆速化や！PointLightの影は激重なんや...
        this.scene.add(pointLight);
    }

    createStudioBox() {
        this.studio = new StudioBox(this.scene); // デフォルト設定（Scene14と同じ）
    }

    createCore() {
        const coreColor = 0xcccccc; // 0xffffff -> 0xcccccc (少しグレー寄りに)
        const textures = this.generateDirtyTextures(1024, coreColor, true); 
        const sphereGeo = new THREE.SphereGeometry(this.coreRadius, 64, 64);
        const sphereMat = new THREE.MeshStandardMaterial({
            color: coreColor,
            map: textures.map,
            bumpMap: textures.bumpMap,
            bumpScale: 5.0,
            emissive: coreColor,
            emissiveIntensity: 0.1, // 0.2 -> 0.1 (発光も少し抑えて重厚に)
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
        
        // 汚れ・かすれの描画
        for (let i = 0; i < 2000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = Math.random() * (isMatte ? 5 : 2);
            const alpha = Math.random() * 0.3;
            
            // カラーキャンバスに暗い汚れ
            cCtx.fillStyle = `rgba(50, 50, 50, ${alpha})`;
            cCtx.beginPath();
            cCtx.arc(x, y, r, 0, Math.PI * 2);
            cCtx.fill();
            
            // バンプキャンバスに凹凸
            const val = 128 + (Math.random() - 0.5) * 60;
            bCtx.fillStyle = `rgb(${val}, ${val}, ${val})`;
            bCtx.beginPath();
            bCtx.arc(x, y, r, 0, Math.PI * 2);
            bCtx.fill();
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
        const detailColor = 0xcccccc; // 球体に合わせてグレーに
        const clusterCount = 100; // 40 -> 100 (パーツをガッツリ増やすで！)
        this.clusterPositions = []; // 初期化
        const textures = this.generateDirtyTextures(512, detailColor, false); 
        const metallicMat = new THREE.MeshStandardMaterial({
            color: detailColor, 
            map: textures.map,
            bumpMap: textures.bumpMap,
            bumpScale: 2.0,
            metalness: 0.2, 
            roughness: 0.8, 
            envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
            envMapIntensity: 0.5 
        });

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

            if (clusterType === 0) {
                // --- パネルユニット (ベースプレート + Box + スイッチ列) ---
                const baseWidth = 150 + Math.random() * 200; 
                const baseHeight = 150 + Math.random() * 200;
                const baseGeo = new THREE.BoxGeometry(baseWidth, baseHeight, 20);
                const baseMesh = new THREE.Mesh(baseGeo, metallicMat);
                baseMesh.position.copy(pos);
                baseMesh.lookAt(pos.clone().add(normal));
                this.detailGroup.add(baseMesh);

                // パネルの上のBox
                const boxGeo = new THREE.BoxGeometry(baseWidth * 0.6, baseHeight * 0.6, 40);
                const boxMesh = new THREE.Mesh(boxGeo, metallicMat);
                boxMesh.position.copy(pos).add(normal.clone().multiplyScalar(20));
                boxMesh.quaternion.copy(baseMesh.quaternion);
                this.detailGroup.add(boxMesh);

                // スイッチの列
                const switchCount = 4 + Math.floor(Math.random() * 4);
                const switchGeo = new THREE.BoxGeometry(20, 20, 30);
                for (let j = 0; j < switchCount; j++) {
                    const sMesh = new THREE.Mesh(switchGeo, metallicMat);
                    const offset = new THREE.Vector3(
                        (j / (switchCount - 1) - 0.5) * baseWidth * 0.8,
                        -baseHeight * 0.3,
                        30
                    );
                    sMesh.position.copy(pos).add(offset.applyQuaternion(baseMesh.quaternion));
                    sMesh.quaternion.copy(baseMesh.quaternion);
                    this.detailGroup.add(sMesh);
                }
            } else if (clusterType === 1) {
                // --- 円形コネクタユニット (大円盤 + 小円盤 + パイプ) ---
                const baseRadius = 120 + Math.random() * 100;
                const baseGeo = new THREE.CylinderGeometry(baseRadius, baseRadius, 20, 24);
                const baseMesh = new THREE.Mesh(baseGeo, metallicMat);
                baseMesh.position.copy(pos);
                baseMesh.lookAt(pos.clone().add(normal));
                baseMesh.rotateX(Math.PI / 2);
                this.detailGroup.add(baseMesh);

                // 重ねる小円盤
                const subGeo = new THREE.CylinderGeometry(baseRadius * 0.6, baseRadius * 0.6, 30, 24);
                const subMesh = new THREE.Mesh(subGeo, metallicMat);
                subMesh.position.copy(pos).add(normal.clone().multiplyScalar(15));
                subMesh.quaternion.copy(baseMesh.quaternion);
                this.detailGroup.add(subMesh);

                // 突き出るパイプ
                const pipeGeo = new THREE.CylinderGeometry(20, 20, 150, 12);
                const pipeMesh = new THREE.Mesh(pipeGeo, metallicMat);
                pipeMesh.position.copy(pos).add(normal.clone().multiplyScalar(50));
                pipeMesh.quaternion.copy(baseMesh.quaternion);
                this.detailGroup.add(pipeMesh);
            } else if (clusterType === 2) {
                // --- メンテナンスハッチユニット (プレート + ボルト風ディテール) ---
                const size = 150 + Math.random() * 100;
                const hatchGeo = new THREE.CylinderGeometry(size, size, 15, 6);
                const hatchMesh = new THREE.Mesh(hatchGeo, metallicMat);
                hatchMesh.position.copy(pos);
                hatchMesh.lookAt(pos.clone().add(normal));
                hatchMesh.rotateX(Math.PI / 2);
                this.detailGroup.add(hatchMesh);

                // ボルト風の小さい円柱を角に配置
                const boltGeo = new THREE.CylinderGeometry(12, 12, 25, 8);
                for (let j = 0; j < 6; j++) {
                    const bMesh = new THREE.Mesh(boltGeo, metallicMat);
                    const angle = (j / 6) * Math.PI * 2;
                    const offset = new THREE.Vector3(Math.cos(angle) * size * 0.8, Math.sin(angle) * size * 0.8, 15);
                    bMesh.position.copy(pos).add(offset.applyQuaternion(hatchMesh.quaternion));
                    bMesh.quaternion.copy(hatchMesh.quaternion);
                    this.detailGroup.add(bMesh);
                }
            } else {
                // --- サブケーブル・ジャンクションユニット ---
                const baseGeo = new THREE.BoxGeometry(120, 120, 40);
                const baseMesh = new THREE.Mesh(baseGeo, metallicMat);
                baseMesh.position.copy(pos);
                baseMesh.lookAt(pos.clone().add(normal));
                this.detailGroup.add(baseMesh);

                // そこから生える細いケーブル
                const subCableCount = 2 + Math.floor(Math.random() * 3);
                for (let j = 0; j < subCableCount; j++) {
                    const subRadius = 12 + Math.random() * 10;
                    const subPoints = [];
                    const startOffset = new THREE.Vector3((j - 1) * 30, 0, 25).applyQuaternion(baseMesh.quaternion);
                    const subStartPos = pos.clone().add(startOffset);
                    subPoints.push(subStartPos);
                    
                    subPoints.push(subStartPos.clone().add(normal.clone().multiplyScalar(250)).add(new THREE.Vector3(0, -400, 0)));
                    subPoints.push(new THREE.Vector3(pos.x * 1.4, -498, pos.z * 1.4));

                    const subCurve = new THREE.CatmullRomCurve3(subPoints);
                    const subGeo = new THREE.TubeGeometry(subCurve, 32, subRadius, 8, false);
                    const subMesh = new THREE.Mesh(subGeo, metallicMat);
                    subMesh.castShadow = true;
                    this.detailGroup.add(subMesh);
                }
            }
        }
    }

    createCableRings(curve, cableRadius) {
        const ringColor = 0x222222; // リングはかなり黒く
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
        const maxAttempts = 2000; // 確実に100本生やすために試行回数を増やす

        while (generatedCount < this.cableCount && attempts < maxAttempts) {
            attempts++;
            
            const phi = Math.acos(2 * Math.random() - 1);
            const theta = Math.random() * Math.PI * 2;
            
            const normal = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            );

            const startPos = normal.clone().multiplyScalar(this.coreRadius);
            startPos.y += 400; // 球体の中心高さ

            // --- 生え方の調整（ノイズを使って不均一に偏らせる） ---
            const spawnNoise = Math.sin(phi * 4.0) * Math.cos(theta * 4.0) + Math.sin(phi * 8.0) * 0.5;
            if (spawnNoise < -0.2 && Math.random() > 0.2) continue;

            const isUpper = startPos.y > 400;
            if (isUpper && Math.random() > 0.5) continue; 
            
            const isEquator = Math.abs(startPos.y - 400) < 300;
            if (!isEquator && !isUpper && Math.random() > 0.3) continue;

            // 既存のパーツ位置との距離をチェック
            let isTooClose = false;
            for (const clusterPos of this.clusterPositions) {
                if (startPos.distanceTo(clusterPos) < 180) {
                    isTooClose = true;
                    break;
                }
            }
            if (isTooClose) continue;

            // ここまで来たら生成確定！
            generatedCount++;

            // --- ケーブルの属性決定 ---
            const isWhiteNonGlowing = Math.random() < 0.2; // 20%の確率で球体と同じ色の光らないケーブルに！
            const finalCableColor = isWhiteNonGlowing ? 0xcccccc : cableColor;

            // 太さを調整 (極太を絞って、バランスを整える)
            const radiusRand = Math.random();
            let radius;
            if (radiusRand < 0.4) {
                radius = 15 + Math.random() * 20; // 40%は細め
            } else if (radiusRand < 0.9) {
                radius = 40 + Math.random() * 40; // 50%は中くらい
            } else {
                radius = 90 + Math.random() * 40; // 10%は超極太！
            }

            // --- 根本の「意味ありげな」接続ユニットユニット ---
            const unitGroup = new THREE.Group();
            unitGroup.position.copy(startPos);
            unitGroup.lookAt(startPos.clone().add(normal));
            this.detailGroup.add(unitGroup);

            // 1. ベースの巨大なフランジ（多角形プレート）
            const flangeGeo = new THREE.CylinderGeometry(radius * 2.2, radius * 2.2, 15, 8);
            const unitMat = new THREE.MeshStandardMaterial({
                color: finalCableColor, // ケーブルの色に合わせる
                metalness: 0.6,
                roughness: 0.4,
                envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
                envMapIntensity: 1.0
            });
            const flange = new THREE.Mesh(flangeGeo, unitMat);
            flange.rotateX(Math.PI / 2);
            unitGroup.add(flange);

            // 2. 接続コア（少し複雑な形状のソケット）
            const coreGeo = new THREE.CylinderGeometry(radius * 1.5, radius * 1.8, 40, 16);
            const coreSocket = new THREE.Mesh(coreGeo, unitMat);
            coreSocket.rotateX(Math.PI / 2);
            coreSocket.position.z = 20;
            unitGroup.add(coreSocket);

            // 3. 周囲の固定ボルト
            const boltGeo = new THREE.CylinderGeometry(radius * 0.2, radius * 0.2, 20, 8);
            for (let j = 0; j < 8; j++) {
                const bolt = new THREE.Mesh(boltGeo, unitMat);
                const angle = (j / 8) * Math.PI * 2;
                bolt.position.set(Math.cos(angle) * radius * 1.8, Math.sin(angle) * radius * 1.8, 10);
                bolt.rotateX(Math.PI / 2);
                unitGroup.add(bolt);
            }

            // 4. ユニットから派生する細いサブワイヤー
            const subWireCount = 2 + Math.floor(Math.random() * 3);
            for (let j = 0; j < subWireCount; j++) {
                const subRadius = 3 + Math.random() * 4;
                const subPoints = [];
                const angle = (j / subWireCount) * Math.PI * 2;
                const wireStart = new THREE.Vector3(Math.cos(angle) * radius * 1.2, Math.sin(angle) * radius * 1.2, 10);
                subPoints.push(wireStart.clone());
                subPoints.push(wireStart.clone().add(new THREE.Vector3(0, 0, 100 + Math.random() * 200)));
                subPoints.push(new THREE.Vector3(wireStart.x * 2, -498 + 400, wireStart.z * 2)); // 地面へ

                const subCurve = new THREE.CatmullRomCurve3(subPoints.map(p => p.applyQuaternion(unitGroup.quaternion).add(startPos)));
                const subGeo = new THREE.TubeGeometry(subCurve, 20, subRadius, 6, false);
                const subMesh = new THREE.Mesh(subGeo, unitMat);
                this.detailGroup.add(subMesh);
            }

            const points = [];
            points.push(startPos.clone()); // 根本
            
            // 中間点1：法線方向に突き出す（上なら上へ、下なら横へ）
            const pushDist = isUpper ? (200 + Math.random() * 400) : (100 + Math.random() * 200);
            const point1 = startPos.clone().add(normal.clone().multiplyScalar(pushDist));
            points.push(point1);

            // 中間点2：重力の影響
            const groundDist = isUpper ? (2500 + Math.random() * 3000) : (1500 + Math.random() * 2000);
            const groundAngle = Math.atan2(normal.z, normal.x) + (Math.random() - 0.5) * 1.5;
            const groundX = Math.cos(groundAngle) * groundDist;
            const groundZ = Math.sin(groundAngle) * groundDist;
            
            if (isUpper) {
                // 上から生える場合は、一度大きく外に回ってから地面へ
                points.push(new THREE.Vector3(
                    point1.x * 1.2,
                    point1.y * 0.5,
                    point1.z * 1.2
                ));
            } else {
                // 下から生える場合は、地面を這うように
                points.push(new THREE.Vector3(
                    groundX * 0.5,
                    floorY + 300,
                    groundZ * 0.5
                ));
            }

            // 終点：地面に向かって垂直に突き刺さるような配置
            const endPos = new THREE.Vector3(groundX, floorY, groundZ);
            points.push(new THREE.Vector3(groundX, floorY + 300, groundZ)); 
            points.push(endPos);

            const curve = new THREE.CatmullRomCurve3(points);
            const geometry = new THREE.TubeGeometry(curve, 64, radius, 8, false); // 128, 12 -> 64, 8 (セグメントを減らして軽量化！)
            
            const material = new THREE.MeshStandardMaterial({
                color: finalCableColor,
                map: cableTextures.map,
                bumpMap: cableTextures.bumpMap,
                bumpScale: 3.0,
                metalness: isWhiteNonGlowing ? 0.1 : 0.9, // 白いのはマットに、黒いのはテカテカに
                roughness: isWhiteNonGlowing ? 0.9 : 0.1, 
                envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
                envMapIntensity: isWhiteNonGlowing ? 0.5 : 2.5 
            });

            if (!isWhiteNonGlowing) {
                material.onBeforeCompile = (shader) => {
                    shader.uniforms.uPulses = { value: new Float32Array(10).fill(-1.0) };
                    
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
                                // 0.1 -> 0.03 (光の弾丸を短く鋭く！)
                                pulseEffect += smoothstep(0.03, 0.0, dist);
                            }
                        }
                        vec3 pulseColor = vec3(1.0, 0.0, 0.0);
                        float constantGlow = smoothstep(0.15, 0.0, vUv.x) * 0.3;
                        gl_FragColor.rgb += pulseColor * (pulseEffect * 12.0 + constantGlow); 
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

            // --- 先端のリング（地面への固定感） ---
            const endRingGeo = new THREE.TorusGeometry(radius * 1.4, radius * 0.4, 12, 24);
            const endRingMat = new THREE.MeshStandardMaterial({
                color: finalCableColor,
                metalness: 0.5, 
                roughness: 0.6, 
                envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
                envMapIntensity: 1.0 
            });
            const endRing = new THREE.Mesh(endRingGeo, endRingMat);
            endRing.position.copy(endPos);
            endRing.rotateX(Math.PI / 2); // 床に水平に置く
            endRing.castShadow = true;
            endRing.receiveShadow = true;
            this.detailGroup.add(endRing);

            // ケーブルにリングを追加
            if (Math.random() > 0.3) {
                this.createCableRings(curve, radius);
            }
        }
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;

        // カメラの更新を明示的に呼ぶ
        this.updateCamera();

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
    }

    updateAutoFocus() {
        if (!this.useDOF || !this.bokehPass || !this.centralSphere) return;
        // 球体（核）までの距離を計算して動的にフォーカスを合わせるやで！
        const dist = this.camera.position.distanceTo(this.centralSphere.position);
        this.bokehPass.uniforms.focus.value = dist;
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
