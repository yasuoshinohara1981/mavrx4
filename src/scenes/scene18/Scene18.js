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
        this.title = 'Xeno Lab: Nucleus';
        this.initialized = false;
        this.sceneNumber = 18;
        this.kitNo = 18;
        
        this.sharedResourceManager = sharedResourceManager;
        
        // ケーブル関連
        this.cables = [];
        this.cableCount = 80; // 70 -> 80 (安定してるから増量！さらに密度を上げるやで！)
        this.cableGroup = new THREE.Group();

        // 中央の球体
        this.centralSphere = null;
        this.coreRadius = 1300; 
        this.coreCenterY = 1200; // 400 -> 1200 (球体を浮かせるやで！)
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
        // 球体の半径が1300、中心高さが coreCenterY
        cameraParticle.minDistance = 3500; 
        cameraParticle.maxDistance = 6500; 
        
        // 高さのバリエーションも調整！
        cameraParticle.minY = 200; 
        cameraParticle.maxY = 5500; // 4500 -> 5500 (球体が上がった分、上も広げる)
    }

    /**
     * カメラの位置を更新（SceneBaseのオーバーライド）
     */
    updateCamera() {
        if (this.cameraParticles[this.currentCameraIndex]) {
            const cp = this.cameraParticles[this.currentCameraIndex];
            const cameraPos = cp.getPosition();
            
            // --- 球体の内部に入らないように強制補正 ---
            const coreCenter = new THREE.Vector3(0, this.coreCenterY, 0);
            const distToCore = cameraPos.distanceTo(coreCenter);
            
            // 安全距離（半径1300 + 余裕分）
            const safeDistance = 2500; 
            
            if (distToCore < safeDistance) {
                const dir = cameraPos.clone().sub(coreCenter).normalize();
                cameraPos.copy(coreCenter.clone().add(dir.multiplyScalar(safeDistance)));
            }

            // 部屋の境界（StudioBox）を突き抜けないようにクランプ
            const roomLimit = 4800; 
            cameraPos.x = THREE.MathUtils.clamp(cameraPos.x, -roomLimit, roomLimit);
            cameraPos.z = THREE.MathUtils.clamp(cameraPos.z, -roomLimit, roomLimit);
            cameraPos.y = THREE.MathUtils.clamp(cameraPos.y, 150, 4800); 
            
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
        this.camera.lookAt(0, this.coreCenterY, 0);
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
        this.createEntranceUnit(); // 先に入口ユニットを作って位置を確定させる！
        this.createCables(); // ケーブルは後から作って入口を避ける！
        this.createStabilizerPipes(); // 安定パイプを追加！
        this.initPostProcessing();
        this.setParticleCount(this.cableCount); // HUDのOBJECTSにケーブル本数を表示！
        this.initialized = true;
    }

    setupLights() {
        const pureWhite = 0xffffff; 
        // 環境光を元の明るさに戻す（0.6）
        const hemiLight = new THREE.HemisphereLight(pureWhite, 0x444444, 0.6); 
        this.scene.add(hemiLight);

        const ambientLight = new THREE.AmbientLight(pureWhite, 0.4); // 元の0.4に戻す
        this.scene.add(ambientLight);

        // 指向性ライトも元の強度に戻す（1.2）
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

        // パルス連動用の点光源は維持
        this.pointLight = new THREE.PointLight(pureWhite, 0.0, 8000); 
        this.pointLight.position.set(0, 500, 0); 
        this.pointLight.castShadow = false; 
        this.scene.add(this.pointLight);
    }

    createStudioBox() {
        this.studio = new StudioBox(this.scene); // デフォルト設定（Scene14と同じ）
    }

    createCore() {
        // --- 明るめの古い金属（経年劣化したアルミやスチール）風のカラー設定 ---
        const coreColor = 0x888078; // 暗すぎず、少し温かみのあるグレーベージュ
        const textures = this.generateDirtyTextures(1024, coreColor, true); 
        
        // --- 球体の工業化：分割パーツによる再構築や！ ---
        this.centralSphere = new THREE.Group();
        this.centralSphere.position.y = this.coreCenterY;
        this.scene.add(this.centralSphere);

        const sphereMat = new THREE.MeshStandardMaterial({
            color: coreColor,
            map: textures.map,
            bumpMap: textures.bumpMap,
            bumpScale: 10.0, // 12.0 -> 10.0 (少し抑えて清潔感を出す)
            emissive: 0x332211, // ほんのり温かみのある照り返し
            emissiveIntensity: 0.1, 
            metalness: 0.6, // 0.5 -> 0.6 (金属の輝きを少し戻す)
            roughness: 0.6, // 0.8 -> 0.6 (少し滑らかに)
            envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
            envMapIntensity: 0.6, // 0.4 -> 0.6 (反射を少し強めて明るく見せる)
            side: THREE.FrontSide 
        });

        // 緯度（Vertical）と経度（Horizontal）で分割して、工業パーツを作るで！
        const offsetTheta = 0.2; 

        // 1. 上蓋 (Top Cap)
        this.createSpherePart(0, Math.PI * 0.2, 0, Math.PI * 2, sphereMat);
        
        // 2. 中段 (Middle Ring) を4分割
        for (let i = 0; i < 4; i++) {
            this.createSpherePart(Math.PI * 0.2, Math.PI * 0.5, (Math.PI * 2 / 4) * i + offsetTheta, (Math.PI * 2 / 4), sphereMat);
            // 縦の継ぎ目に沿ったリブパーツを追加！
            this.createSeamDetail(Math.PI * 0.2, Math.PI * 0.5, (Math.PI * 2 / 4) * i + offsetTheta, true);
        }

        // 緯度の継ぎ目（横ライン）に沿ったリングパーツを追加！
        this.createSeamDetail(Math.PI * 0.2, 0, 0, false); // 上段と中段の間
        this.createSeamDetail(Math.PI * 0.7, 0, 0, false); // 中段と下段の間

        // 3. 下段 (Bottom Ring) を3分割
        for (let i = 0; i < 3; i++) {
            this.createSpherePart(Math.PI * 0.5, Math.PI * 0.8, (Math.PI * 2 / 3) * i + offsetTheta, (Math.PI * 2 / 3), sphereMat);
            // 縦の継ぎ目
            this.createSeamDetail(Math.PI * 0.5, Math.PI * 0.8, (Math.PI * 2 / 3) * i + offsetTheta, true);
        }

        // 4. 底蓋 (Bottom Cap)
        this.createSpherePart(Math.PI * 0.8, Math.PI, 0, Math.PI * 2, sphereMat);

        // --- 継ぎ目の交差点（ジャンクション）にディテールを追加！ ---
        this.createJunctionDetails(offsetTheta);

        // --- 頑丈なドア（Heavy Doors）を追加！ ---
        // 上部ドア
        this.createHeavyDoor(0.15 * Math.PI, 0.5, "Upper Hatch");
        // 下部ドア
        this.createHeavyDoor(0.85 * Math.PI, 2.5, "Lower Access");

        // --- 継ぎ目の「凹み」を表現するためのインナー球体（光る核にするで！） ---
        const innerGeo = new THREE.SphereGeometry(this.coreRadius - 5, 64, 64); // -15 -> -5 (外殻にギリギリまで近づける)
        const innerMat = new THREE.MeshStandardMaterial({
            color: 0x000000, 
            roughness: 0.1, 
            metalness: 0.9, 
            emissive: this.pulseColor, 
            emissiveIntensity: 0.0 
        });
        this.innerSphere = new THREE.Mesh(innerGeo, innerMat);
        this.centralSphere.add(this.innerSphere);

        // さらに内側に、より強い光を放つコアを追加（ブルーム効果を狙う）
        const coreGlowGeo = new THREE.SphereGeometry(this.coreRadius - 10, 32, 32); // -30 -> -10 (さらに外側に広げる)
        const coreGlowMat = new THREE.MeshBasicMaterial({
            color: this.pulseColor,
            transparent: true,
            opacity: 0.0, 
            blending: THREE.AdditiveBlending 
        });
        this.coreGlow = new THREE.Mesh(coreGlowGeo, coreGlowMat);
        this.centralSphere.add(this.coreGlow);

        this.scene.add(this.detailGroup);
    }

    /**
     * 継ぎ目の交差点（ジャンクション）にディテールを追加するやで！
     */
    createJunctionDetails(offsetTheta) {
        const detailMat = new THREE.MeshStandardMaterial({
            color: 0x444444,
            metalness: 0.8,
            roughness: 0.2,
            envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
            envMapIntensity: 1.0
        });

        const phis = [Math.PI * 0.2, Math.PI * 0.5, Math.PI * 0.8];
        const thetaCounts = [4, 4, 3];

        phis.forEach((phi, pIdx) => {
            const count = thetaCounts[pIdx];
            for (let i = 0; i < count; i++) {
                const theta = (Math.PI * 2 / count) * i + offsetTheta;
                const pos = new THREE.Vector3(
                    this.coreRadius * Math.sin(phi) * Math.cos(theta),
                    this.coreRadius * Math.cos(phi),
                    this.coreRadius * Math.sin(phi) * Math.sin(theta)
                );
                const normal = pos.clone().normalize();

                // 1. 交差点の巨大なハブ
                const hubGeo = new THREE.CylinderGeometry(60, 70, 40, 8);
                const hub = new THREE.Mesh(hubGeo, detailMat);
                hub.position.copy(pos.clone().add(normal.multiplyScalar(15)));
                hub.lookAt(pos.clone().add(normal));
                hub.rotateX(Math.PI / 2);
                this.centralSphere.add(hub);

                // 警告ライトは飛び出して不自然やったから削除したで！
            }
        });
    }

    /**
     * 頑丈なドア（ハッチ）を生成するやで！
     */
    createHeavyDoor(phi, theta, labelText) {
        const doorGroup = new THREE.Group();
        const radius = this.coreRadius + 10;
        const pos = new THREE.Vector3(
            radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
        );
        doorGroup.position.copy(pos);
        doorGroup.lookAt(pos.clone().add(pos.clone().normalize()));
        this.centralSphere.add(doorGroup);

        const doorMat = new THREE.MeshStandardMaterial({
            color: 0x333333,
            metalness: 0.8,
            roughness: 0.2,
            envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
            envMapIntensity: 1.0
        });

        // 1. メインドア（少し盛り上がった厚みのある円柱）
        const doorGeo = new THREE.CylinderGeometry(180, 200, 40, 32);
        const door = new THREE.Mesh(doorGeo, doorMat);
        door.rotateX(Math.PI / 2);
        doorGroup.add(door);

        // 2. 補強フレーム（外枠）
        const frameGeo = new THREE.TorusGeometry(210, 15, 16, 32);
        const frame = new THREE.Mesh(frameGeo, doorMat);
        doorGroup.add(frame);

        // 3. 固定ボルト（周囲に配置）
        const boltGeo = new THREE.CylinderGeometry(15, 15, 30, 8);
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const bolt = new THREE.Mesh(boltGeo, doorMat);
            bolt.position.set(Math.cos(angle) * 210, Math.sin(angle) * 210, 10);
            bolt.rotateX(Math.PI / 2);
            doorGroup.add(bolt);
        }

        // 4. 中央のハンドル/ロック機構
        const lockGeo = new THREE.BoxGeometry(100, 30, 30);
        const lock = new THREE.Mesh(lockGeo, doorMat);
        lock.position.z = 30;
        doorGroup.add(lock);

        // 5. ラベル（CanvasTexture）
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#111111';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, canvas.width / 2, canvas.height / 2);
        
        const textTex = new THREE.CanvasTexture(canvas);
        const textMat = new THREE.MeshBasicMaterial({ map: textTex, transparent: true });
        const textGeo = new THREE.PlaneGeometry(120, 30);
        const textMesh = new THREE.Mesh(textGeo, textMat);
        textMesh.position.set(0, -60, 25);
        doorGroup.add(textMesh);
    }

    /**
     * 継ぎ目に沿ったディテールパーツ（リブ、ボルト等）を生成するやで！
     */
    createSeamDetail(phi, phiEnd, theta, isVertical) {
        const detailMat = new THREE.MeshStandardMaterial({
            color: 0x333333,
            metalness: 0.7,
            roughness: 0.3,
            envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
            envMapIntensity: 0.8
        });

        if (isVertical) {
            // 縦の継ぎ目に沿った補強リブ（配管は削除して隙間を強調！）
            const steps = 12;
            const points = [];

            for (let i = 0; i <= steps; i++) {
                const p = phi + (phiEnd - phi) * (i / steps);
                const pos = new THREE.Vector3(
                    this.coreRadius * Math.sin(p) * Math.cos(theta),
                    this.coreRadius * Math.cos(p),
                    this.coreRadius * Math.sin(p) * Math.sin(theta)
                );
                points.push(pos);

                const normal = pos.clone().normalize();
                
                // 等間隔にクランプ（固定具）を配置
                if (i % 2 === 0) {
                    const clampGeo = new THREE.BoxGeometry(60, 30, 60);
                    const clamp = new THREE.Mesh(clampGeo, detailMat);
                    // 少し沈めて、隙間から光が漏れるのを邪魔しないようにする
                    clamp.position.copy(pos.clone().add(normal.multiplyScalar(5)));
                    clamp.lookAt(pos.clone().add(normal));
                    this.centralSphere.add(clamp);
                }
            }
            // 配管（TubeGeometry）の生成を削除！

        } else {
            // 横の継ぎ目に沿ったリングフレーム（配管束は削除！）
            // 1. メインのリング（少し細くして隙間を見せる）
            const ringGeo = new THREE.TorusGeometry(this.coreRadius * Math.sin(phi), 12, 16, 100);
            const ring = new THREE.Mesh(ringGeo, detailMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.y = this.coreRadius * Math.cos(phi);
            this.centralSphere.add(ring);
            
            // 2. 周囲を走る細い配管束を削除！

            // リング上の固定ユニット
            for (let i = 0; i < 16; i++) {
                const angle = (i / 16) * Math.PI * 2;
                const boltPos = new THREE.Vector3(
                    (this.coreRadius + 10) * Math.sin(phi) * Math.cos(angle),
                    this.coreRadius * Math.cos(phi),
                    (this.coreRadius + 10) * Math.sin(phi) * Math.sin(angle)
                );
                
                const unitGroup = new THREE.Group();
                unitGroup.position.copy(boltPos);
                unitGroup.lookAt(new THREE.Vector3(0, boltPos.y, 0));
                unitGroup.rotateX(Math.PI / 2);
                
                const baseGeo = new THREE.BoxGeometry(30, 30, 15);
                const base = new THREE.Mesh(baseGeo, detailMat);
                unitGroup.add(base);
                
                const boltGeo = new THREE.CylinderGeometry(10, 10, 30, 8);
                const bolt = new THREE.Mesh(boltGeo, detailMat);
                bolt.position.set(0, 0, 10);
                unitGroup.add(bolt);
                
                this.centralSphere.add(unitGroup);
            }
        }
    }

    /**
     * 球体の一部（パーツ）を生成して centralSphere に追加するやで！
     */
    createSpherePart(phiStart, phiLength, thetaStart, thetaLength, material) {
        // 隙間（継ぎ目）を少し広げて、光が漏れやすくする！ (0.005 -> 0.015)
        const gap = 0.015; 
        const geo = new THREE.SphereGeometry(
            this.coreRadius, 
            64, 64, 
            thetaStart + gap, thetaLength - gap * 2, 
            phiStart + gap, phiLength - gap * 2
        );
        
        const mesh = new THREE.Mesh(geo, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        const normal = new THREE.Vector3(
            Math.sin(phiStart + phiLength/2) * Math.cos(thetaStart + thetaLength/2),
            Math.cos(phiStart + phiLength/2),
            Math.sin(phiStart + phiLength/2) * Math.sin(thetaStart + thetaLength/2)
        );
        // パーツを少し浮かせて隙間をハッキリさせる (1.0 -> 2.0)
        mesh.position.add(normal.multiplyScalar(2.0)); 

        this.centralSphere.add(mesh);
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
        
        // --- 「古びた金属」感を出すためのノイズ強化 ---
        // 1. 全体的なザラつき（微細なノイズ）
        for (let i = 0; i < (isMatte ? 10000 : 5000); i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = Math.random() * 1.5;
            const val = 128 + (Math.random() - 0.5) * 60; // バンプの凹凸を激しく
            bCtx.fillStyle = `rgb(${val}, ${val}, ${val})`;
            bCtx.beginPath();
            bCtx.arc(x, y, r, 0, Math.PI * 2);
            bCtx.fill();
        }

        // 2. 汚れ・腐食（大きめのシミ）
        const dirtCount = isMatte ? 1000 : 600; 
        for (let i = 0; i < dirtCount; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = Math.random() * (isMatte ? 15 : 8); // シミを大きく
            const alpha = Math.random() * 0.3; 
            
            cCtx.fillStyle = `rgba(30, 30, 30, ${alpha})`;
            cCtx.beginPath();
            cCtx.arc(x, y, r, 0, Math.PI * 2);
            cCtx.fill();
            
            const val = 128 + (Math.random() - 0.5) * 100; // 凹凸を深く
            bCtx.fillStyle = `rgb(${val}, ${val}, ${val})`;
            bCtx.beginPath();
            bCtx.arc(x, y, r, 0, Math.PI * 2);
            bCtx.fill();
        }

        // 3. ひっかき傷（金属の劣化感）
        for (let i = 0; i < 150; i++) { 
            const x = Math.random() * size;
            const y = Math.random() * size;
            const len = 10 + Math.random() * 60;
            const angle = Math.random() * Math.PI * 2;
            
            bCtx.strokeStyle = Math.random() > 0.5 ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)';
            bCtx.lineWidth = 1.0;
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
        const clusterCount = 150; // 100 -> 150 (パーツをさらに増量！)
        this.clusterPositions = []; // 初期化
        
        // ジオメトリをマージするための準備
        const geometriesByColor = {
            dark: [],
            mid: [],
            light: []
        };

        let junctionUnitCount = 0;
        let switchPanelCount = 0;
        const maxSwitchPanels = 4 + Math.floor(Math.random() * 4); // 1〜2 -> 4〜8個に増加！

        for (let i = 0; i < clusterCount; i++) {
            const phi = Math.random() * Math.PI * 2;
            const theta = Math.random() * Math.PI;
            
            const x = this.coreRadius * Math.sin(theta) * Math.cos(phi);
            const y = this.coreRadius * Math.cos(theta) + this.coreCenterY;
            const z = this.coreRadius * Math.sin(theta) * Math.sin(phi);
            const pos = new THREE.Vector3(x, y, z);
            const normal = pos.clone().sub(new THREE.Vector3(0, this.coreCenterY, 0)).normalize();

            // 球体全体に散らす（下半分への集中を少し緩和）
            if (y > (this.coreCenterY + 400) && Math.random() > 0.6) continue; 

            // --- パーツ同士の衝突判定 ---
            let isTooClose = false;
            for (const clusterPos of this.clusterPositions) {
                if (pos.distanceTo(clusterPos) < 350) { // 450 -> 350 (少し密集を許容)
                    isTooClose = true;
                    break;
                }
            }
            if (isTooClose) continue;

            // --- パーツの選別ロジック ---
            let clusterType = -1;
            const rand = Math.random();
            
            // 低確率で「高層パーツ」化フラグを立てる（約15%）
            const isTall = Math.random() < 0.15;
            // 面積（幅・高さ）は控えめに（1.0〜1.2倍）、厚み（高さ）を大幅に（3.0〜8.0倍）ブースト
            const sizeScale = isTall ? (1.0 + Math.random() * 0.2) : 1.0;
            const heightScale = isTall ? (3.0 + Math.random() * 5.0) : 1.0;

            if (rand < 0.15) {
                clusterType = 0; // スイッチパネル
            } else if (rand < 0.25) {
                clusterType = 3; // ジャンクション/サブケーブル
            } else if (rand < 0.45) {
                clusterType = 4; // 平べったいBox + 追加パーツ
            } else if (rand < 0.65) {
                clusterType = 5; // 電子機器っぽい形状
            }

            if (clusterType === -1) continue; 

            this.clusterPositions.push(pos); 

            const dummy = new THREE.Object3D();
            dummy.position.copy(pos);
            dummy.lookAt(pos.clone().add(normal));
            dummy.updateMatrix();

            const colorTypeRand = Math.random();
            let targetList;
            if (colorTypeRand < 0.4) targetList = geometriesByColor.dark;
            else if (colorTypeRand < 0.8) targetList = geometriesByColor.mid;
            else targetList = geometriesByColor.light;

            if (clusterType === 0) {
                // --- スイッチパネルユニット（リベット付き） ---
                const baseWidth = (200 + Math.random() * 200) * sizeScale;
                const baseHeight = (200 + Math.random() * 200) * sizeScale;
                const baseDepth = 30 * heightScale;
                const baseGeo = new THREE.BoxGeometry(baseWidth, baseHeight, baseDepth);
                baseGeo.applyMatrix4(dummy.matrix);
                targetList.push(baseGeo);

                // パネルの四隅にリベット
                const rivetGeo = new THREE.SphereGeometry(10 * sizeScale, 8, 8);
                const corners = [
                    {x: 0.4, y: 0.4}, {x: -0.4, y: 0.4},
                    {x: 0.4, y: -0.4}, {x: -0.4, y: -0.4}
                ];
                corners.forEach(c => {
                    const rGeo = rivetGeo.clone();
                    const rMatrix = dummy.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(
                        c.x * baseWidth, c.y * baseHeight, baseDepth / 2
                    ));
                    rGeo.applyMatrix4(rMatrix);
                    targetList.push(rGeo);
                });

                // スイッチ
                const switchCount = 2 + Math.floor(Math.random() * 3);
                const switchGeo = new THREE.CylinderGeometry(15 * sizeScale, 15 * sizeScale, 40 * heightScale, 16);
                for (let j = 0; j < switchCount; j++) {
                    const sGeo = switchGeo.clone();
                    const sMatrix = dummy.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(
                        (j / (switchCount - 1) - 0.5) * baseWidth * 0.6,
                        0,
                        baseDepth / 2 + 10
                    ));
                    sMatrix.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
                    sGeo.applyMatrix4(sMatrix);
                    targetList.push(sGeo);
                }
            } else if (clusterType === 3) {
                // --- ジャンクションユニット ---
                const boxSize = (150 + Math.random() * 150) * sizeScale;
                const baseDepth = 60 * heightScale;
                const baseGeo = new THREE.BoxGeometry(boxSize, boxSize, baseDepth);
                baseGeo.applyMatrix4(dummy.matrix);
                targetList.push(baseGeo);

                const subRadius = (15 + Math.random() * 10) * sizeScale;
                const subPoints = [
                    new THREE.Vector3(0, 0, baseDepth / 2).applyMatrix4(dummy.matrix),
                    new THREE.Vector3(0, 0, 150 * heightScale).applyMatrix4(dummy.matrix).add(normal.clone().multiplyScalar(100))
                ];
                const subCurve = new THREE.CatmullRomCurve3(subPoints);
                const subGeo = new THREE.TubeGeometry(subCurve, 8, subRadius, 8, false);
                targetList.push(subGeo);
            } else if (clusterType === 4) {
                // --- 平べったいBox + 追加パーツ ---
                const baseSize = (250 + Math.random() * 200) * sizeScale;
                const baseDepth = 20 * heightScale;
                const baseGeo = new THREE.BoxGeometry(baseSize, baseSize, baseDepth);
                baseGeo.applyMatrix4(dummy.matrix);
                targetList.push(baseGeo);

                // その上に乗る小さなBoxやシリンダー
                const topGeo = Math.random() > 0.5 ? 
                    new THREE.BoxGeometry(baseSize * 0.4, baseSize * 0.4, 40 * heightScale) :
                    new THREE.CylinderGeometry(baseSize * 0.2, baseSize * 0.2, 40 * heightScale, 16);
                const topMatrix = dummy.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(
                    (Math.random() - 0.5) * baseSize * 0.4,
                    (Math.random() - 0.5) * baseSize * 0.4,
                    baseDepth / 2 + 10
                ));
                if (!(topGeo instanceof THREE.BoxGeometry)) topMatrix.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
                topGeo.applyMatrix4(topMatrix);
                targetList.push(topGeo);
            } else if (clusterType === 5) {
                // --- 電子機器っぽいパーツ（フィンやコネクタ） ---
                const baseWidth = (150 + Math.random() * 150) * sizeScale;
                const baseHeight = (200 + Math.random() * 200) * sizeScale;
                const baseDepth = 40 * heightScale;
                const baseGeo = new THREE.BoxGeometry(baseWidth, baseHeight, baseDepth);
                baseGeo.applyMatrix4(dummy.matrix);
                targetList.push(baseGeo);

                // 冷却フィンっぽい薄い板を並べる
                const finGeo = new THREE.BoxGeometry(baseWidth * 0.8, 10 * sizeScale, 30 * heightScale);
                for (let j = 0; j < 5; j++) {
                    const fGeo = finGeo.clone();
                    const fMatrix = dummy.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(
                        0, (j / 4 - 0.5) * baseHeight * 0.7, baseDepth / 2 + 10
                    ));
                    fGeo.applyMatrix4(fMatrix);
                    targetList.push(fGeo);
                }
            }
        }

        // 色ごとのマテリアル作成とメッシュ生成
        const colors = {
            dark: 0x665544,  // 0x443322 -> 0x665544 (少し明るいブロンズ)
            mid: 0x887766,   // 0x665544 -> 0x887766 (経年劣化したスチール)
            light: 0xaa9988  // 0x887766 -> 0xaa9988 (明るめの真鍮)
        };

        this.detailMaterials = []; 

        for (const [key, geoList] of Object.entries(geometriesByColor)) {
            if (geoList.length > 0) {
                const color = colors[key];
                const textures = this.generateDirtyTextures(512, color, false);
                const mat = new THREE.MeshStandardMaterial({
                    color: color,
                    map: textures.map,
                    bumpMap: textures.bumpMap,
                    bumpScale: 6.0,
                    emissive: 0x222222,
                    emissiveIntensity: 0.1,
                    metalness: 0.4,
                    roughness: 0.6,
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

        // --- たまに「継ぎ目（シリンダー）」を追加するやで！ ---
        if (Math.random() > 0.7) { // 30%の確率で継ぎ目出現
            const t = 0.3 + Math.random() * 0.4; // 中間あたり
            const pos = curve.getPointAt(t);
            const tangent = curve.getTangentAt(t);

            const jointGroup = new THREE.Group();
            jointGroup.position.copy(pos);
            jointGroup.lookAt(pos.clone().add(tangent));
            this.detailGroup.add(jointGroup);

            // メインのシリンダー
            const jointGeo = new THREE.CylinderGeometry(cableRadius * 1.8, cableRadius * 1.8, cableRadius * 4, 16);
            const jointMat = new THREE.MeshStandardMaterial({
                color: 0x444444,
                metalness: 0.8,
                roughness: 0.3,
                envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
                envMapIntensity: 1.0
            });
            const joint = new THREE.Mesh(jointGeo, jointMat);
            joint.rotateX(Math.PI / 2);
            jointGroup.add(joint);

            // 両端のボルトリング
            const boltRingGeo = new THREE.TorusGeometry(cableRadius * 2.0, cableRadius * 0.3, 8, 16);
            const boltRing1 = new THREE.Mesh(boltRingGeo, jointMat);
            boltRing1.position.z = cableRadius * 1.5;
            jointGroup.add(boltRing1);

            const boltRing2 = new THREE.Mesh(boltRingGeo, jointMat);
            boltRing2.position.z = -cableRadius * 1.5;
            jointGroup.add(boltRing2);
        }
    }

    createCables() {
        const cableColor = 0x222222; // ケーブルはかなり黒く
        this.scene.add(this.cableGroup);
        const floorY = -498;
        const cableTextures = this.generateDirtyTextures(1024, cableColor, false); 

        let generatedCount = 0;
        let attempts = 0;
        const maxAttempts = 15000; // 衝突判定を入れるので試行回数をさらに増やす

        // ケーブルの根本位置と半径を記録して、衝突判定に使うやで！
        const cableRootPositions = [];

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
                // 束の中でさらに密集させるやで！
                const spread = 0.08; // 生え際をタイトに！
                const phi = bundlePhi + (Math.random() - 0.5) * spread;
                const theta = bundleTheta + (Math.random() - 0.5) * spread;
                
                const normal = new THREE.Vector3(
                    Math.sin(phi) * Math.cos(theta),
                    Math.cos(phi),
                    Math.sin(phi) * Math.sin(theta)
                ).normalize();

                const startPos = normal.clone().multiplyScalar(this.coreRadius);
                startPos.y += this.coreCenterY;

                // 1. 入口ユニットとの距離チェック
                if (this.entrancePos && startPos.distanceTo(this.entrancePos) < 600) continue;

                // 2. 属性決定（太さを先に決める）
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
                const isSuperThick = Math.random() < 0.025;
                if (isSuperThick) {
                    radius = 150 + Math.random() * 50; 
                } else if (isNonGlowing) {
                    radius = 40 + Math.random() * 60; 
                } else {
                    const radiusRand = Math.random();
                    if (radiusRand < 0.5) radius = 15 + Math.random() * 15;
                    else if (radiusRand < 0.9) radius = 35 + Math.random() * 30;
                    else radius = 80 + Math.random() * 40;
                }

                // 3. ケーブル同士の衝突判定（ここが追加ポイント！）
                let isOverlapping = false;
                for (const other of cableRootPositions) {
                    // 半径の合計の80%（少しのめり込みを許容して密度を出す）を最小距離にするやで！
                    const minDist = (radius + other.radius) * 0.8; 
                    if (startPos.distanceTo(other.pos) < minDist) {
                        isOverlapping = true;
                        break;
                    }
                }
                if (isOverlapping) continue;

                // 生成成功！
                generatedCount++;
                cableRootPositions.push({ pos: startPos.clone(), radius: radius });

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
                
                const isUpper = startPos.y > this.coreCenterY;
                const pushDist = (isUpper ? 300 : 150) + (radius * 2.0) + (Math.random() * 50); 
                const point1 = startPos.clone().add(normal.clone().multiplyScalar(pushDist));
                points.push(point1);

                // --- 終端の計算（目的地への集中度をアップ！） ---
                let groundDist = isUpper ? (3500 + Math.random() * 3000) : (2000 + Math.random() * 2500);
                const groundAngle = Math.atan2(normal.z, normal.x) + (Math.random() - 0.5) * 0.2; 
                
                // 束のオフセットをノイズ的に加える（ばらつきを抑えて目的地を集中させる）
                let groundX = Math.cos(groundAngle) * groundDist + bundleEndOffsetX * (0.9 + Math.random() * 0.2);
                let groundZ = Math.sin(groundAngle) * groundDist + bundleEndOffsetZ * (0.9 + Math.random() * 0.2);

                const roomLimit = 4500;
                if (Math.abs(groundX) > roomLimit || Math.abs(groundZ) > roomLimit) {
                    const scale = roomLimit / Math.max(Math.abs(groundX), Math.abs(groundZ));
                    groundX *= scale;
                    groundZ *= scale;
                }
                
                if (isUpper) {
                    const bulgeScale = 1.5 + (radius < 40 ? 0.3 : (radius / 250)); // 1.6 -> 1.5 (少しだけ絞る)
                    const midY = Math.max(point1.y * 0.5, this.coreCenterY + 100); // 0.6 -> 0.5, +400 -> +100 (マイルドに下げる)
                    
                    // 球体の中心から外側へ向かうベクトルを計算して、中間地点を球体の外側に押し出す
                    const midPos = new THREE.Vector3(
                        point1.x * bulgeScale,
                        midY,
                        point1.z * bulgeScale
                    );
                    
                    // 球体中心（0, coreCenterY, 0）からの距離をチェック
                    const coreCenter = new THREE.Vector3(0, this.coreCenterY, 0);
                    const distToCenter = midPos.distanceTo(coreCenter);
                    const safeRadius = this.coreRadius + 250; // 300 -> 250 (少し球体に寄せる)
                    
                    if (distToCenter < safeRadius) {
                        const pushDir = midPos.clone().sub(coreCenter).normalize();
                        midPos.copy(coreCenter.clone().add(pushDir.multiplyScalar(safeRadius)));
                    }
                    
                    points.push(midPos);
                } else {
                    const midDistScale = 1.6 + (radius < 40 ? 0.4 : 0.0); // 1.8 -> 1.6
                    const midPos = new THREE.Vector3(
                        point1.x * midDistScale,
                        floorY + 300, // 400 -> 300 (少し床に近づける)
                        point1.z * midDistScale
                    );
                    
                    // 下側も同様に球体を避ける
                    const coreCenter = new THREE.Vector3(0, this.coreCenterY, 0);
                    const distToCenter = midPos.distanceTo(coreCenter);
                    const safeRadius = this.coreRadius + 180; // 200 -> 180
                    
                    if (distToCenter < safeRadius) {
                        const pushDir = midPos.clone().sub(coreCenter).normalize();
                        midPos.copy(coreCenter.clone().add(pushDir.multiplyScalar(safeRadius)));
                    }
                    
                    points.push(midPos);
                }

                const endPos = new THREE.Vector3(groundX, floorY, groundZ);
                
                // --- 床付近で「やや平行かも」ぐらいに曲げる ---
                const approachDist = 0.8; // 終点までの80%の位置
                const preEndX = groundX * approachDist;
                const preEndZ = groundZ * approachDist;
                // 床から少しだけ浮かせた位置（radius + 100 くらい）を通らせる
                const preEndPos = new THREE.Vector3(preEndX, floorY + 100 + (radius * 0.5), preEndZ);
                points.push(preEndPos);

                points.push(endPos);

                const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.2); 
                
                // --- バグ修正：TubeGeometryの生成に失敗する場合の安全策 ---
                let geometry;
                try {
                    const segments = radius > 60 ? 140 : 70;
                    geometry = new THREE.TubeGeometry(curve, segments, radius, 10, false); 
                } catch (e) {
                    console.error("TubeGeometry creation failed:", e);
                    continue; // このケーブルの生成をスキップ
                }
                
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

    createEntranceUnit() {
        // 球体の正面（Z軸方向）に入口っぽいパーツを配置するやで！
        const entranceGroup = new THREE.Group();
        const radius = this.coreRadius + 5; 
        
        // テクスチャを生成（プレート用）
        const textures = this.generateDirtyTextures(512, 0x444444, false);
        
        // --- 位置の調整（真ん中よりちょい上！） ---
        const yOffset = 500; 
        const zPos = Math.sqrt(radius * radius - yOffset * yOffset);
        const finalPos = new THREE.Vector3(0, this.coreCenterY + yOffset, zPos);
        
        entranceGroup.position.copy(finalPos);
        const lookTarget = finalPos.clone().add(new THREE.Vector3(0, yOffset, zPos).normalize());
        entranceGroup.lookAt(lookTarget);
        this.scene.add(entranceGroup);

        // 1. ベースプレート（復活！でもより洗練されたデザインにするで）
        const plateGeo = new THREE.BoxGeometry(450, 180, 15);
        const plateMat = new THREE.MeshStandardMaterial({ 
            color: 0x444444, 
            metalness: 0.5, 
            roughness: 0.4,
            bumpMap: textures.bumpMap, // 球体と同じバンプを適用して馴染ませる
            bumpScale: 4.0
        });
        const plate = new THREE.Mesh(plateGeo, plateMat);
        plate.position.set(0, 20, 0); // 少し上にずらしてランプとテキストを乗せる
        plate.castShadow = true;
        plate.receiveShadow = true;
        entranceGroup.add(plate);

        // 2. 赤いランプ（中央に1つだけ）
        const lampGeo = new THREE.SphereGeometry(10, 16, 16); 
        const lampMat = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 10.0 
        });
        
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(0, 60, 10); // プレートの上に乗せる
        entranceGroup.add(lamp);

        // 3. 「MAVRX4」テキストラベル
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        // 背景なし（透明）
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // テキスト描画（濃いめのグレー）
        ctx.fillStyle = '#111111'; 
        ctx.font = 'bold 90px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('MAVRX4', canvas.width / 2, canvas.height / 2);
        
        const textTex = new THREE.CanvasTexture(canvas);
        const textMat = new THREE.MeshBasicMaterial({ map: textTex, transparent: true });
        const textGeo = new THREE.PlaneGeometry(400, 100);
        const textMesh = new THREE.Mesh(textGeo, textMat);
        textMesh.position.set(0, -10, 10); // プレートの表面に配置
        entranceGroup.add(textMesh);

        // 入口ユニットの位置を記録して、ケーブルが被らんようにするで！
        this.entrancePos = finalPos.clone();
        this.entranceUnit = entranceGroup;
    }

    /**
     * 部屋の四隅から球体へ伸びる直線的な安定パイプを生成するやで！
     */
    createStabilizerPipes() {
        const pipeGroup = new THREE.Group();
        this.stabilizerPipes = pipeGroup; // 管理用に追加
        this.scene.add(pipeGroup);

        // パイプ用の硬質な黒色金属マテリアル
        const pipeMat = new THREE.MeshStandardMaterial({
            color: 0x050505,
            metalness: 0.9,
            roughness: 0.1,
            envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
            envMapIntensity: 1.5
        });

        // 設置パーツ用のマテリアル
        const connectorMat = new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.8,
            roughness: 0.3,
            envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
            envMapIntensity: 1.0
        });

        const roomLimit = 4800; // 壁の位置
        const corners = [
            { x: roomLimit, z: roomLimit },
            { x: -roomLimit, z: roomLimit },
            { x: roomLimit, z: -roomLimit },
            { x: -roomLimit, z: -roomLimit }
        ];
        
        // 天井ギリギリと地面ギリギリの「壁」の高さ
        const heights = [4500, -4500]; 

        const pipeRadius = 30; 
        const coreCenter = new THREE.Vector3(0, this.coreCenterY, 0);

        corners.forEach(corner => {
            heights.forEach(y => {
                // 四隅の壁（天井付近4箇所、床付近4箇所）からスタート
                const startPos = new THREE.Vector3(corner.x, y, corner.z);
                
                // --- 修正：球体表面への到達点を正しく計算 ---
                // startPos から coreCenter へのベクトル
                const toCore = coreCenter.clone().sub(startPos);
                const distToCenter = toCore.length();
                const dir = toCore.normalize();
                
                // 球体表面までの距離 = 中心までの距離 - 半径
                const distToSurface = distToCenter - this.coreRadius;
                
                // 到達点
                const endPos = startPos.clone().add(dir.clone().multiplyScalar(distToSurface));

                // 1. パイプ（直線）
                const pipeLength = distToSurface;
                const pipeGeo = new THREE.CylinderGeometry(pipeRadius, pipeRadius, pipeLength, 16);
                const pipe = new THREE.Mesh(pipeGeo, pipeMat);
                
                // パイプの中点を配置位置にする
                const midPoint = startPos.clone().add(endPos).multiplyScalar(0.5);
                pipe.position.copy(midPoint);
                
                // パイプを方向に向ける (CylinderはデフォルトでY軸方向)
                pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
                pipeGroup.add(pipe);

                // 2. 壁側の設置パーツ
                this.createPipeConnector(startPos, dir, pipeRadius, connectorMat, pipeGroup);

                // 3. 球体側の設置パーツ
                this.createPipeConnector(endPos, dir.clone().negate(), pipeRadius, connectorMat, pipeGroup);
            });
        });
    }

    /**
     * パイプの端点の設置パーツを生成するやで！
     */
    createPipeConnector(pos, dir, pipeRadius, material, group) {
        const connectorGroup = new THREE.Group();
        connectorGroup.position.copy(pos);
        connectorGroup.lookAt(pos.clone().add(dir));
        group.add(connectorGroup);

        // ベースフランジ
        const baseGeo = new THREE.CylinderGeometry(pipeRadius * 3, pipeRadius * 3.5, 20, 16);
        const base = new THREE.Mesh(baseGeo, material);
        base.rotateX(Math.PI / 2);
        connectorGroup.add(base);

        // 補強リング
        const ringGeo = new THREE.TorusGeometry(pipeRadius * 2, pipeRadius * 0.5, 12, 24);
        const ring = new THREE.Mesh(ringGeo, material);
        connectorGroup.add(ring);

        // 固定ボルト
        const boltGeo = new THREE.CylinderGeometry(8, 8, 30, 8);
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const bolt = new THREE.Mesh(boltGeo, material);
            bolt.position.set(Math.cos(angle) * pipeRadius * 2.8, Math.sin(angle) * pipeRadius * 2.8, 0);
            bolt.rotateX(Math.PI / 2);
            connectorGroup.add(bolt);
        }
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;

        // カメラの更新を明示的に呼ぶ
        this.updateCamera();

        // カラーの補間（トラック8で変化）
        this.pulseColor.lerp(this.targetPulseColor, 0.1);

        // --- インナーグロウ（球体内部の発光）の更新 ---
        if (this.innerSphere && this.innerSphere.material) {
            // 徐々に減衰させる
            this.innerSphere.material.emissiveIntensity *= 0.92;
            this.innerSphere.material.emissive.copy(this.pulseColor);
        }
        if (this.coreGlow && this.coreGlow.material) {
            // 徐々に減衰させる
            this.coreGlow.material.opacity *= 0.9;
            this.coreGlow.material.color.copy(this.pulseColor);
        }

        // 球体の発光強度の補間（トラック5連動は解除！）
        this.coreEmissiveIntensity = 0.1; // 元の明るさに戻す
        if (this.centralSphere && this.centralSphere.material) {
            this.centralSphere.material.emissiveIntensity = this.coreEmissiveIntensity;
            this.centralSphere.material.emissive.setHex(0x222222); // 元の色に戻す
        }
        // パーツのマテリアルも元に戻す！
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

        // --- インナーグロウをトリガー！ ---
        const intensity = (velocity / 127.0) * 12.0; // 5.0 -> 12.0 (さらにビカビカに！)
        if (this.innerSphere && this.innerSphere.material) {
            this.innerSphere.material.emissiveIntensity = intensity;
        }
        if (this.coreGlow && this.coreGlow.material) {
            this.coreGlow.material.opacity = Math.min(intensity * 0.1, 1.0); // 0.2 -> 0.1, max 0.8 -> 1.0
        }

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
            this.centralSphere.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
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
        if (this.entranceUnit) {
            this.scene.remove(this.entranceUnit);
            this.entranceUnit.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => {
                            if (m.map) m.map.dispose();
                            m.dispose();
                        });
                    } else {
                        if (child.material.map) child.material.map.dispose();
                        child.material.dispose();
                    }
                }
            });
        }
        if (this.stabilizerPipes) {
            this.scene.remove(this.stabilizerPipes);
            this.stabilizerPipes.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
                // Group（コネクタ）の中身も再帰的に処理
                if (child.children) {
                    child.children.forEach(grandChild => {
                        if (grandChild.geometry) grandChild.geometry.dispose();
                        if (grandChild.material) grandChild.material.dispose();
                    });
                }
            });
        }
        super.dispose();
    }
}
