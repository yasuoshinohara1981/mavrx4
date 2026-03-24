/**
 * Scene21: Hard-surface industrial sci-fi
 * - reactor: sphere shell + red core … reactorGroup
 * - abstract: modular cluster … abstractMassGroup
 * - ship: asymmetric industrial spacecraft + rear propulsion … spacecraftGroup
 * - ring: massive segmented industrial torus + inner mechanisms … ringGroup
 * - retroSphere: layered sphere, dense vs clean plates, cutaways, retro-industrial … retroSphereGroup
 * - tacticalSphere: faceted armor, bold planes, militarized hard-surface … tacticalSphereGroup
 * designMode 切替: トラック7 循環 / toggleEffect(7) / setDesignMode()
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { StudioBox } from '../../lib/StudioBox.js';

export class Scene21 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'Industrial Reactor Sphere';
        this.initialized = false;
        this.sceneNumber = 21;
        this.kitNo = 21;
        this.sharedResourceManager = sharedResourceManager;

        /** @type {'reactor'|'abstract'|'ship'|'ring'|'retroSphere'|'tacticalSphere'} */
        this.designMode = 'reactor';

        this.studio = null;
        this.coreRadius = 1180;
        this.abstractFocusRadius = 1480;
        this.shipFocusRadius = 1650;
        /** リング外接に近いフォーカス／コールアウト用 */
        this.ringFocusRadius = 2400;
        /** レトロ球（外殻半径に合わせる） */
        this.retroFocusRadius = 1280;
        /** 戦術装甲球 */
        this.tacticalFocusRadius = 1240;
        this.coreCenterY = 1200;
        this.lookAtY = this.coreCenterY;

        this.reactorGroup = null;
        this.innerMachinery = null;
        this.reactorCore = null;
        this.coreGlowMesh = null;

        this.abstractMassGroup = null;
        this.abstractMechanism = null;
        this.abstractCoreMesh = null;
        this.abstractCoreGlow = null;
        this.abstractEmissiveNodes = [];
        this.abstractPistonGroups = [];

        this.spacecraftGroup = null;
        this.shipPropulsionGroup = null;
        this.shipEmissiveNodes = [];
        this.shipEngineGlowMeshes = [];

        this.ringGroup = null;
        this.ringSpinGroup = null;
        this.ringInnerRotate = null;
        this.ringArticulated = null;
        this.ringEmissiveNodes = [];

        this.retroSphereGroup = null;
        this.retroDetailGroup = null;
        this.retroInnerMachinery = null;
        this.retroCoreMesh = null;
        this.retroEmissiveNodes = [];
        this.retroPistonRoots = [];

        this.tacticalSphereGroup = null;

        /** @type {THREE.Sphere} DOF フォールバック用（レイが外れたとき） */
        this._focusSphereReactor = new THREE.Sphere();
        this._focusSphereAbstract = new THREE.Sphere();
        this._focusSphereShip = new THREE.Sphere();
        this._focusSphereRing = new THREE.Sphere();
        this._focusSphereRetro = new THREE.Sphere();
        this._focusSphereTactical = new THREE.Sphere();
        this._focusRay = new THREE.Ray();
        this._focusHit = new THREE.Vector3();

        this.cubeRenderTarget = null;
        this.cubeCamera = null;
        this.detailGroup = new THREE.Group();

        this.statusLights = [];
        this.pistonRoots = [];

        this.sceneFillPoint = null;

        this.useDOF = true;
        this.useBloom = true;
        this.useFilmGrain = true;
        this.bloomPass = null;

        this.strobeActive = false;
        this.strobeEndTime = 0;

        this.trackEffects = {
            1: true, 2: false, 3: false, 4: false, 5: true, 6: true, 7: false, 8: false, 9: false
        };
        this.setScreenshotText(this.title);

        if (this.calloutSystem) {
            this.calloutSystem.setUse3DCallouts(true);
            this.calloutSystem.setLabels([
                'REACTOR: ONLINE', 'SHELL: SEGMENTED', 'CORE_TEMP: CRITICAL',
                'PRESSURE: NOMINAL', 'GREEBLE_DENSITY: HIGH', 'MODE: INDUSTRIAL'
            ]);
        }
    }

    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 3500;
        cameraParticle.maxDistance = 6500;
        cameraParticle.minY = 200;
        cameraParticle.maxY = 5500;
    }

    updateCamera() {
        if (this.cameraParticles[this.currentCameraIndex]) {
            const cp = this.cameraParticles[this.currentCameraIndex];
            const cameraPos = cp.getPosition();
            const coreCenter = new THREE.Vector3(0, this.coreCenterY, 0);
            const distToCore = cameraPos.distanceTo(coreCenter);
            let safeDistance = 2500;
            if (this.designMode === 'ship') safeDistance = 3200;
            else if (this.designMode === 'ring') safeDistance = 4200;
            else if (this.designMode === 'retroSphere') safeDistance = 2800;
            else if (this.designMode === 'tacticalSphere') safeDistance = 2700;
            if (distToCore < safeDistance) {
                const dir = cameraPos.clone().sub(coreCenter).normalize();
                cameraPos.copy(coreCenter.clone().add(dir.multiplyScalar(safeDistance)));
            }
            const roomLimit = 4800;
            cameraPos.x = THREE.MathUtils.clamp(cameraPos.x, -roomLimit, roomLimit);
            cameraPos.z = THREE.MathUtils.clamp(cameraPos.z, -roomLimit, roomLimit);
            cameraPos.y = THREE.MathUtils.clamp(cameraPos.y, 150, 4800);
            this.camera.position.copy(cameraPos);
            this.camera.lookAt(coreCenter);
            this.camera.matrixWorldNeedsUpdate = false;
        }
    }

    switchCameraRandom() {
        super.switchCameraRandom();
        const cp = this.cameraParticles[this.currentCameraIndex];
        if (cp) {
            const rand = Math.random();
            const roomLimit = 4500;
            if (rand < 0.4) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 3500 + Math.random() * 1000;
                cp.position.set(Math.cos(angle) * dist, 1000 + Math.random() * 2000, Math.sin(angle) * dist);
            } else if (rand < 0.7) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 3000 + Math.random() * 1500;
                cp.position.set(Math.cos(angle) * dist, 250 + Math.random() * 400, Math.sin(angle) * dist);
            } else {
                const angle = Math.random() * Math.PI * 2;
                const dist = 3500 + Math.random() * 1000;
                cp.position.set(Math.cos(angle) * dist, 3500 + Math.random() * 1000, Math.sin(angle) * dist);
            }
        }
    }

    async setup() {
        if (this.initialized) return;
        await super.setup();

        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.camera.position.set(0, 5000, 10000);
        this.camera.lookAt(0, this.coreCenterY, 0);
        if (this.camera.fov !== 60) {
            this.camera.fov = 60;
            this.camera.updateProjectionMatrix();
        }

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
            generateMipmaps: true,
            minFilter: THREE.LinearMipmapLinearFilter
        });
        this.cubeCamera = new THREE.CubeCamera(10, 10000, this.cubeRenderTarget);
        this.cubeCamera.position.set(0, this.coreCenterY, 0);
        this.scene.add(this.cubeCamera);

        this.setupLights();
        if (this.calloutSystem) {
            this.calloutSystem.setScene(this.scene);
        }
        this.createStudioBox();
        this.buildIndustrialSphere();
        this.buildAbstractClusterMass();
        this.buildSpacecraft();
        this.buildIndustrialRing();
        this.buildRetroSphere();
        this.buildTacticalSphere();
        this.applyDesignVisibility();
        this.refreshFocusBounds();
        this.initPostProcessing();

        let meshCount = 0;
        const countMeshes = (root) => {
            root.traverse((o) => {
                if (o.isMesh) meshCount++;
            });
        };
        if (this.reactorGroup) countMeshes(this.reactorGroup);
        if (this.abstractMassGroup) countMeshes(this.abstractMassGroup);
        if (this.spacecraftGroup) countMeshes(this.spacecraftGroup);
        if (this.ringGroup) countMeshes(this.ringGroup);
        if (this.retroSphereGroup) countMeshes(this.retroSphereGroup);
        if (this.tacticalSphereGroup) countMeshes(this.tacticalSphereGroup);
        this.setParticleCount(meshCount);
        this.initialized = true;
    }

    /** 可視グループのバウンディング球（レイキャスト失敗時の DOF 用） */
    refreshFocusBounds() {
        const box = new THREE.Box3();
        const apply = (group, sphere) => {
            sphere.makeEmpty();
            if (!group) return;
            group.updateMatrixWorld(true);
            box.setFromObject(group);
            if (!box.isEmpty()) box.getBoundingSphere(sphere);
        };
        apply(this.reactorGroup, this._focusSphereReactor);
        apply(this.abstractMassGroup, this._focusSphereAbstract);
        apply(this.spacecraftGroup, this._focusSphereShip);
        apply(this.ringGroup, this._focusSphereRing);
        apply(this.retroSphereGroup, this._focusSphereRetro);
        apply(this.tacticalSphereGroup, this._focusSphereTactical);
    }

    setupLights() {
        // Scene12 相当の明るさ（半球・環境・平行光＋中心フィル）
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x888888, 0.8);
        this.scene.add(hemiLight);

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.3));

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight.position.set(2000, 2800, 2000);
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.left = -8000;
        directionalLight.shadow.camera.right = 8000;
        directionalLight.shadow.camera.top = 8000;
        directionalLight.shadow.camera.bottom = -8000;
        directionalLight.shadow.camera.near = 100;
        directionalLight.shadow.camera.far = 16000;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.bias = -0.0001;
        this.scene.add(directionalLight);

        this.sceneFillPoint = new THREE.PointLight(0xffffff, 2.5, 8000);
        this.sceneFillPoint.position.set(0, this.coreCenterY, 0);
        this.scene.add(this.sceneFillPoint);

        this.pointLight = new THREE.PointLight(0xff3322, 0, 12000);
        this.pointLight.position.set(0, this.coreCenterY, 0);
        this.scene.add(this.pointLight);
    }

    createStudioBox() {
        this.studio = new StudioBox(this.scene);
    }

    envMap() {
        return this.cubeRenderTarget ? this.cubeRenderTarget.texture : null;
    }

    makeHullMat(colorHex, rough = 0.78, metal = 0.72) {
        const tex = this.generateWearTexture(512, colorHex);
        return new THREE.MeshStandardMaterial({
            color: colorHex,
            map: tex.map,
            bumpMap: tex.bumpMap,
            bumpScale: 6,
            metalness: metal,
            roughness: rough,
            envMap: this.envMap(),
            envMapIntensity: 0.45,
            flatShading: false
        });
    }

    makeDarkMat() {
        return this.makeHullMat(0x3d4248, 0.88, 0.82);
    }

    /** 戦術装甲用：フラットシェード＋ダークマット寄り */
    makeTacticalMat(colorHex) {
        const m = this.makeHullMat(colorHex, 0.94, 0.4);
        m.flatShading = true;
        m.envMapIntensity = 0.2;
        return m;
    }

    generateWearTexture(size, baseColor) {
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size;
        colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');
        const hex = '#' + new THREE.Color(baseColor).getHexString();
        cCtx.fillStyle = hex;
        cCtx.fillRect(0, 0, size, size);

        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size;
        bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');
        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);

        for (let i = 0; i < 8000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const v = 110 + (Math.random() - 0.5) * 70;
            bCtx.fillStyle = `rgb(${v},${v},${v})`;
            bCtx.fillRect(x, y, 2, 2);
        }
        for (let i = 0; i < 400; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 4 + Math.random() * 20;
            cCtx.fillStyle = `rgba(20,22,28,${Math.random() * 0.25})`;
            cCtx.beginPath();
            cCtx.arc(x, y, r, 0, Math.PI * 2);
            cCtx.fill();
            const bv = 100 + (Math.random() - 0.5) * 50;
            bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
            bCtx.beginPath();
            bCtx.arc(x, y, r, 0, Math.PI * 2);
            bCtx.fill();
        }
        for (let i = 0; i < 120; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const len = 15 + Math.random() * 80;
            const ang = Math.random() * Math.PI * 2;
            bCtx.strokeStyle = Math.random() > 0.5 ? 'rgba(200,200,210,0.35)' : 'rgba(30,30,35,0.4)';
            bCtx.lineWidth = 1;
            bCtx.beginPath();
            bCtx.moveTo(x, y);
            bCtx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
            bCtx.stroke();
        }

        const map = new THREE.CanvasTexture(colorCanvas);
        const bumpMap = new THREE.CanvasTexture(bumpCanvas);
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
        return { map, bumpMap };
    }

    buildIndustrialSphere() {
        this.reactorGroup = new THREE.Group();
        this.reactorGroup.position.y = this.coreCenterY;
        this.scene.add(this.reactorGroup);
        this.reactorGroup.add(this.detailGroup);

        const R = this.coreRadius;
        const hull = this.makeHullMat(0x9aa0a8, 0.8, 0.68);
        const hullLight = this.makeHullMat(0xc5c9ce, 0.72, 0.55);
        const dark = this.makeDarkMat();

        const thetaSegs = 12;
        const gap = 0.018;

        const cutaway = (thetaIndex, band) => {
            if (band !== 1) return false;
            return thetaIndex >= 2 && thetaIndex <= 4;
        };

        const addShell = (radiusScale, mat, phiBands) => {
            const r = R * radiusScale;
            phiBands.forEach((band, bi) => {
                const phi0 = band.p0;
                const phi1 = band.p1;
                for (let ti = 0; ti < thetaSegs; ti++) {
                    if (cutaway(ti, bi)) continue;
                    const t0 = (ti / thetaSegs) * Math.PI * 2;
                    const t1 = ((ti + 1) / thetaSegs) * Math.PI * 2;
                    const geo = new THREE.SphereGeometry(
                        r,
                        48,
                        48,
                        t0 + gap,
                        t1 - t0 - gap * 2,
                        phi0 + gap,
                        phi1 - phi0 - gap * 2
                    );
                    const mesh = new THREE.Mesh(geo, ti % 3 === 0 ? hullLight : hull);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    const midPhi = (phi0 + phi1) * 0.5;
                    const midTheta = (t0 + t1) * 0.5;
                    const nx = Math.sin(midPhi) * Math.cos(midTheta);
                    const ny = Math.cos(midPhi);
                    const nz = Math.sin(midPhi) * Math.sin(midTheta);
                    mesh.position.set(nx * 4, ny * 4, nz * 4);
                    this.reactorGroup.add(mesh);
                }
            });
        };

        const outerBands = [
            { p0: 0, p1: Math.PI * 0.22 },
            { p0: Math.PI * 0.22, p1: Math.PI * 0.78 },
            { p0: Math.PI * 0.78, p1: Math.PI }
        ];
        addShell(1.0, hull, outerBands);

        const midBands = [
            { p0: Math.PI * 0.18, p1: Math.PI * 0.42 },
            { p0: Math.PI * 0.42, p1: Math.PI * 0.62 },
            { p0: Math.PI * 0.62, p1: Math.PI * 0.82 }
        ];
        addShell(0.93, hull, midBands);

        this.addGreebleRings(R, dark, hull);
        this.addVentsAndBolts(R, dark);
        this.addRadialCables(R, dark);
        this.addPistons(R, dark);
        this.buildInnerMachinery(R * 0.52);
        this.buildReactorCore(R * 0.14);
        this.addStatusLights(R);
    }

    addGreebleRings(R, darkMat, hullMat) {
        const phis = [0.28, 0.5, 0.72].map((p) => p * Math.PI);
        phis.forEach((phi) => {
            const ringR = R * Math.sin(phi) * 0.98;
            const torus = new THREE.Mesh(
                new THREE.TorusGeometry(ringR, 14, 10, 96),
                darkMat
            );
            torus.rotation.x = Math.PI / 2;
            torus.position.y = R * Math.cos(phi);
            torus.castShadow = true;
            this.detailGroup.add(torus);

            for (let i = 0; i < 32; i++) {
                const a = (i / 32) * Math.PI * 2;
                const bx = Math.cos(a) * (ringR + 20);
                const bz = Math.sin(a) * (ringR + 20);
                const bolt = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 18, 6), hullMat);
                const pos = new THREE.Vector3(bx, R * Math.cos(phi), bz);
                bolt.position.copy(pos);
                bolt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
                bolt.castShadow = true;
                this.detailGroup.add(bolt);
            }
        });
    }

    addVentsAndBolts(R, darkMat) {
        for (let k = 0; k < 48; k++) {
            const phi = 0.25 * Math.PI + Math.random() * 0.5 * Math.PI;
            const theta = Math.random() * Math.PI * 2;
            const n = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            ).normalize();
            const p = n.clone().multiplyScalar(R * 1.01);
            if (Math.random() > 0.55) {
                const vent = new THREE.Mesh(new THREE.BoxGeometry(44, 8, 22), darkMat);
                vent.position.copy(p);
                vent.lookAt(p.clone().add(n));
                vent.castShadow = true;
                this.detailGroup.add(vent);
            } else {
                const groove = new THREE.Mesh(new THREE.BoxGeometry(70, 4, 12), darkMat);
                groove.position.copy(p.clone().add(n.clone().multiplyScalar(4)));
                groove.lookAt(p.clone().add(n.clone().multiplyScalar(8)));
                groove.castShadow = true;
                this.detailGroup.add(groove);
            }
        }
    }

    addRadialCables(R, darkMat) {
        for (let i = 0; i < 14; i++) {
            const phi = Math.acos(2 * Math.random() - 1);
            const theta = Math.random() * Math.PI * 2;
            const n = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            ).normalize();
            const start = n.clone().multiplyScalar(R * 0.98);
            const mid = n.clone().multiplyScalar(R * 0.62);
            const end = n.clone().multiplyScalar(R * 0.38);
            const curve = new THREE.CatmullRomCurve3([start, mid, end], false, 'centripetal', 0.35);
            const tube = new THREE.Mesh(
                new THREE.TubeGeometry(curve, 24, 7 + Math.random() * 5, 8, false),
                darkMat
            );
            tube.castShadow = true;
            this.detailGroup.add(tube);
        }
    }

    addPistons(R, darkMat) {
        const count = 16;
        for (let i = 0; i < count; i++) {
            const phi = (i / count) * Math.PI * 0.6 + Math.PI * 0.2;
            const theta = (i * 2.7) % (Math.PI * 2);
            const n = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            ).normalize();
            const g = new THREE.Group();
            const base = new THREE.Mesh(new THREE.CylinderGeometry(22, 28, 40, 8), darkMat);
            base.rotateZ(Math.PI / 2);
            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 120, 8), darkMat);
            shaft.position.x = 70;
            shaft.rotateZ(Math.PI / 2);
            g.add(base);
            g.add(shaft);
            g.position.copy(n.clone().multiplyScalar(R * 0.99));
            g.lookAt(n.clone().multiplyScalar(R * 2));
            this.detailGroup.add(g);
            this.pistonRoots.push({ group: g, normal: n.clone(), phase: i * 0.7 });
        }
    }

    buildInnerMachinery(radius) {
        this.innerMachinery = new THREE.Group();
        const innerMat = this.makeHullMat(0x5c6068, 0.82, 0.75);
        const accent = this.makeHullMat(0x8e949c, 0.7, 0.65);

        const t1 = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.95, 22, 12, 48), innerMat);
        t1.rotation.x = Math.PI / 2;
        const t2 = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.72, 16, 10, 40), accent);
        t2.rotation.x = Math.PI / 2;
        t2.rotation.z = Math.PI / 3;
        this.innerMachinery.add(t1);
        this.innerMachinery.add(t2);

        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const box = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.4, 28, 18), innerMat);
            box.position.set(Math.cos(a) * radius * 0.5, 0, Math.sin(a) * radius * 0.5);
            box.lookAt(0, 0, 0);
            this.innerMachinery.add(box);
        }

        const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.25, radius * 0.3, 50, 12), this.makeDarkMat());
        hub.rotation.x = Math.PI / 2;
        this.innerMachinery.add(hub);

        this.reactorGroup.add(this.innerMachinery);
    }

    buildReactorCore(rCore) {
        const mat = new THREE.MeshStandardMaterial({
            color: 0x1a0505,
            metalness: 0.4,
            roughness: 0.35,
            emissive: 0xff1100,
            emissiveIntensity: 1.2,
            envMap: this.envMap(),
            envMapIntensity: 0.2
        });
        this.reactorCore = new THREE.Mesh(new THREE.SphereGeometry(rCore, 48, 48), mat);
        this.reactorCore.castShadow = true;
        this.reactorGroup.add(this.reactorCore);

        this.coreGlowMesh = new THREE.Mesh(
            new THREE.SphereGeometry(rCore * 1.35, 32, 32),
            new THREE.MeshBasicMaterial({
                color: 0xff2200,
                transparent: true,
                opacity: 0.12,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        );
        this.reactorGroup.add(this.coreGlowMesh);
    }

    addStatusLights(R) {
        const colors = [0xff3300, 0xffaa00, 0x00ff66, 0xff0044];
        for (let i = 0; i < 36; i++) {
            const phi = Math.acos(2 * Math.random() - 1);
            const theta = Math.random() * Math.PI * 2;
            const n = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            ).normalize();
            const c = colors[i % colors.length];
            const mat = new THREE.MeshStandardMaterial({
                color: 0x111111,
                emissive: c,
                emissiveIntensity: 0.8,
                metalness: 0.6,
                roughness: 0.4
            });
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(10, 8, 8), mat);
            bulb.position.copy(n.multiplyScalar(R * 1.02));
            this.detailGroup.add(bulb);
            this.statusLights.push({
                mesh: bulb,
                base: 0.5 + Math.random() * 0.5,
                speed: 4 + Math.random() * 6,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    /**
     * 抽象メカ塊（認識しやすい単一形状を避け、モジュール密集＋カットアウト）
     */
    buildAbstractClusterMass() {
        this.abstractMassGroup = new THREE.Group();
        this.abstractMassGroup.position.y = this.coreCenterY;
        this.scene.add(this.abstractMassGroup);

        const hull = this.makeHullMat(0x8e939a, 0.82, 0.7);
        const hullHi = this.makeHullMat(0xb8bdc4, 0.74, 0.58);
        const dark = this.makeDarkMat();
        const cell = 168;
        const extent = 7;

        const cutaway = (ix, iy, iz) => {
            if (ix >= 3 && ix <= 5 && iy >= 1 && iz >= 3 && iz <= 5) return true;
            if (ix <= -4 && iy >= 2 && Math.abs(iz) <= 3) return true;
            return false;
        };

        for (let ix = -extent; ix <= extent; ix++) {
            for (let iy = -extent; iy <= extent; iy++) {
                for (let iz = -extent; iz <= extent; iz++) {
                    const d = Math.sqrt(ix * ix + iy * iy * 0.85 + iz * iz);
                    const noise = (Math.sin(ix * 2.1) + Math.cos(iy * 1.7) + Math.sin(iz * 2.3)) * 0.35;
                    if (d + noise > extent * 0.92) continue;
                    if (cutaway(ix, iy, iz)) continue;

                    const jx = (Math.random() - 0.5) * cell * 0.22;
                    const jy = (Math.random() - 0.5) * cell * 0.22;
                    const jz = (Math.random() - 0.5) * cell * 0.22;
                    const sx = cell * (0.55 + Math.random() * 0.45);
                    const sy = cell * (0.45 + Math.random() * 0.55);
                    const sz = cell * (0.5 + Math.random() * 0.5);
                    const geo = new THREE.BoxGeometry(sx, sy, sz);
                    const mesh = new THREE.Mesh(geo, (ix + iy + iz) % 3 === 0 ? hullHi : hull);
                    mesh.position.set(ix * cell + jx, iy * cell + jy, iz * cell + jz);
                    mesh.rotation.set(
                        (Math.random() - 0.5) * 0.12,
                        (Math.random() - 0.5) * 0.12,
                        (Math.random() - 0.5) * 0.12
                    );
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    this.abstractMassGroup.add(mesh);

                    if (Math.random() > 0.65) {
                        const rivet = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 16, 6), dark);
                        rivet.position.copy(mesh.position).add(new THREE.Vector3(sx * 0.35, sy * 0.35, sz * 0.45));
                        rivet.lookAt(0, 0, 0);
                        rivet.rotateX(Math.PI / 2);
                        this.abstractMassGroup.add(rivet);
                    }
                }
            }
        }

        for (let n = 0; n < 160; n++) {
            const p = new THREE.Vector3(
                (Math.random() - 0.5) * cell * extent * 1.05,
                (Math.random() - 0.5) * cell * extent * 1.05,
                (Math.random() - 0.5) * cell * extent * 1.05
            );
            if (p.length() > cell * extent * 0.92) continue;
            const vent = new THREE.Mesh(new THREE.BoxGeometry(52 + Math.random() * 56, 9, 20), dark);
            vent.position.copy(p);
            vent.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.3);
            vent.castShadow = true;
            this.abstractMassGroup.add(vent);
        }

        this.abstractMechanism = new THREE.Group();
        const mechMat = this.makeHullMat(0x6a6f76, 0.84, 0.72);
        const ring1 = new THREE.Mesh(new THREE.TorusGeometry(440, 38, 12, 56), mechMat);
        ring1.rotation.x = Math.PI / 2;
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(300, 26, 10, 44), mechMat);
        ring2.rotation.x = Math.PI / 2;
        ring2.rotation.z = Math.PI / 4;
        this.abstractMechanism.add(ring1);
        this.abstractMechanism.add(ring2);
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const arm = new THREE.Mesh(new THREE.BoxGeometry(340, 34, 26), mechMat);
            arm.position.set(Math.cos(a) * 220, Math.sin(a * 2) * 62, Math.sin(a) * 220);
            arm.lookAt(0, 0, 0);
            this.abstractMechanism.add(arm);
        }
        this.abstractMassGroup.add(this.abstractMechanism);

        const coreR = 148;
        this.abstractCoreMesh = new THREE.Mesh(
            new THREE.SphereGeometry(coreR, 40, 40),
            new THREE.MeshStandardMaterial({
                color: 0x0a1218,
                metalness: 0.5,
                roughness: 0.4,
                emissive: 0x66aacc,
                emissiveIntensity: 0.35,
                envMap: this.envMap(),
                envMapIntensity: 0.25
            })
        );
        this.abstractMassGroup.add(this.abstractCoreMesh);

        this.abstractCoreGlow = new THREE.Mesh(
            new THREE.SphereGeometry(coreR * 1.45, 24, 24),
            new THREE.MeshBasicMaterial({
                color: 0x88ccff,
                transparent: true,
                opacity: 0.06,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        );
        this.abstractMassGroup.add(this.abstractCoreGlow);

        const emColors = [0x4488aa, 0xff6622, 0xeedd88, 0x66ffaa];
        const emSpread = cell * extent * 0.95;
        for (let e = 0; e < 56; e++) {
            const p = new THREE.Vector3(
                (Math.random() - 0.5) * emSpread,
                (Math.random() - 0.5) * emSpread,
                (Math.random() - 0.5) * emSpread
            );
            if (p.length() < coreR * 2.2) continue;
            const em = emColors[e % emColors.length];
            const mat = new THREE.MeshStandardMaterial({
                color: 0x222222,
                emissive: em,
                emissiveIntensity: 0.4,
                metalness: 0.65,
                roughness: 0.45
            });
            const m =
                Math.random() > 0.5
                    ? new THREE.Mesh(new THREE.BoxGeometry(12, 12, 32), mat)
                    : new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 24, 6), mat);
            m.position.copy(p);
            m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
            this.abstractMassGroup.add(m);
            this.abstractEmissiveNodes.push({
                mesh: m,
                base: 0.25 + Math.random() * 0.45,
                speed: 2 + Math.random() * 5,
                phase: Math.random() * Math.PI * 2
            });
        }

        this.abstractPistonGroups = [];
        const pistonR = cell * extent * 0.58;
        for (let p = 0; p < 12; p++) {
            const phi = (p / 12) * Math.PI * 2;
            const z = (p % 2 === 0 ? 1 : -1) * (280 + Math.random() * 260);
            const g = new THREE.Group();
            const base = new THREE.Mesh(new THREE.BoxGeometry(62, 78, 62), dark);
            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 240, 8), mechMat);
            shaft.rotation.z = Math.PI / 2;
            shaft.position.x = 130;
            g.add(base);
            g.add(shaft);
            g.position.set(
                Math.cos(phi) * pistonR,
                (Math.random() - 0.5) * 320,
                Math.sin(phi) * pistonR + z * 0.15
            );
            g.lookAt(0, 0, 0);
            this.abstractMassGroup.add(g);
            this.abstractPistonGroups.push({ group: g, shaft, phase: p * 0.9 });
        }
    }

    /**
     * 大型産業系宇宙船（非対称ハル、グリーブル、半開放、後部推進）
     */
    buildSpacecraft() {
        this.spacecraftGroup = new THREE.Group();
        this.spacecraftGroup.position.y = this.coreCenterY;
        this.scene.add(this.spacecraftGroup);

        const hull = this.makeHullMat(0x9298a0, 0.8, 0.68);
        const hullDark = this.makeHullMat(0x6d737a, 0.85, 0.72);
        const dark = this.makeDarkMat();

        const main = new THREE.Mesh(new THREE.BoxGeometry(440, 260, 2200), hull);
        main.position.set(-100, 40, 0);
        main.castShadow = true;
        main.receiveShadow = true;
        this.spacecraftGroup.add(main);

        const pod = new THREE.Mesh(new THREE.BoxGeometry(220, 170, 780), hullDark);
        pod.position.set(240, -30, -220);
        pod.castShadow = true;
        this.spacecraftGroup.add(pod);

        const belly = new THREE.Mesh(new THREE.BoxGeometry(320, 100, 1300), dark);
        belly.position.set(-50, -155, 80);
        belly.castShadow = true;
        this.spacecraftGroup.add(belly);

        const nose = new THREE.Mesh(new THREE.BoxGeometry(300, 200, 420), hull);
        nose.position.set(-60, 30, -1280);
        this.spacecraftGroup.add(nose);

        const spine = new THREE.Mesh(new THREE.BoxGeometry(140, 70, 1700), hullDark);
        spine.position.set(50, 130, -80);
        this.spacecraftGroup.add(spine);

        for (let i = 0; i < 14; i++) {
            const strut = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 160 + i * 8), dark);
            strut.position.set(-310 - (i % 3) * 8, -40 + i * 12, -500 + i * 95);
            this.spacecraftGroup.add(strut);
        }

        const conduitMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            metalness: 0.75,
            roughness: 0.35,
            emissive: 0xff3311,
            emissiveIntensity: 0.45,
            envMap: this.envMap(),
            envMapIntensity: 0.2
        });
        for (let i = 0; i < 10; i++) {
            const c = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 100 + i * 10, 8), conduitMat.clone());
            c.rotation.z = Math.PI / 2;
            c.position.set(-285, 10, -350 + i * 130);
            this.spacecraftGroup.add(c);
            this.shipEmissiveNodes.push({
                mesh: c,
                base: 0.4 + Math.random() * 0.35,
                speed: 4 + Math.random() * 4,
                phase: Math.random() * Math.PI * 2,
                isRed: true
            });
        }

        for (let g = 0; g < 200; g++) {
            const z = (Math.random() - 0.5) * 2000;
            const x = (Math.random() - 0.5) * 520;
            const y = (Math.random() - 0.5) * 200;
            if (Math.abs(x) < 120 && Math.abs(z) < 250) continue;
            const p = new THREE.Vector3(x, y, z);
            if (p.length() > 1150) continue;
            if (Math.random() > 0.48) {
                const v = new THREE.Mesh(
                    new THREE.BoxGeometry(16 + Math.random() * 50, 5, 10 + Math.random() * 20),
                    dark
                );
                v.position.copy(p);
                v.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.4);
                v.castShadow = true;
                this.spacecraftGroup.add(v);
            } else {
                const b = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 12, 6), hull);
                b.position.copy(p);
                b.castShadow = true;
                this.spacecraftGroup.add(b);
            }
        }

        for (let w = 0; w < 32; w++) {
            const p0 = new THREE.Vector3(
                (Math.random() - 0.5) * 450,
                (Math.random() - 0.5) * 120,
                (Math.random() - 0.5) * 1800
            );
            const p1 = p0.clone().add(new THREE.Vector3((Math.random() - 0.5) * 180, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 280));
            const mid = p0.clone().lerp(p1, 0.5).add(new THREE.Vector3(0, 40 + Math.random() * 40, 0));
            const curve = new THREE.CatmullRomCurve3([p0, mid, p1], false, 'centripetal', 0.4);
            const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 3.5 + Math.random() * 2.5, 6, false), dark);
            tube.castShadow = true;
            this.spacecraftGroup.add(tube);
        }

        this.shipPropulsionGroup = new THREE.Group();
        this.shipPropulsionGroup.position.set(0, 0, 1380);
        this.spacecraftGroup.add(this.shipPropulsionGroup);

        const engineMat = this.makeHullMat(0x454a52, 0.88, 0.76);
        const bell = new THREE.Mesh(new THREE.CylinderGeometry(130, 200, 220, 28, 1, true), engineMat);
        bell.rotation.x = Math.PI / 2;
        bell.position.z = 90;
        bell.castShadow = true;
        this.shipPropulsionGroup.add(bell);

        const mainGlow = new THREE.Mesh(
            new THREE.CylinderGeometry(95, 125, 36, 24),
            new THREE.MeshBasicMaterial({
                color: 0xff2200,
                transparent: true,
                opacity: 0.55,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            })
        );
        mainGlow.rotation.x = Math.PI / 2;
        mainGlow.position.z = 50;
        this.shipPropulsionGroup.add(mainGlow);
        this.shipEngineGlowMeshes.push(mainGlow);

        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const sm = new THREE.Mesh(new THREE.CylinderGeometry(38, 58, 100, 12), engineMat);
            sm.rotation.x = Math.PI / 2;
            sm.position.set(Math.cos(a) * 230, Math.sin(a) * 130, -20);
            sm.castShadow = true;
            this.shipPropulsionGroup.add(sm);
            const disc = new THREE.Mesh(
                new THREE.CircleGeometry(32, 20),
                new THREE.MeshBasicMaterial({
                    color: 0xff5500,
                    transparent: true,
                    opacity: 0.45,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    side: THREE.DoubleSide
                })
            );
            disc.rotation.x = Math.PI / 2;
            disc.position.copy(sm.position).add(new THREE.Vector3(0, 0, 52));
            this.shipPropulsionGroup.add(disc);
            this.shipEngineGlowMeshes.push(disc);
        }

        const warnColors = [0xffaa00, 0xff2200, 0xffcc00];
        for (let i = 0; i < 45; i++) {
            const z = (Math.random() - 0.5) * 2000;
            const x = (Math.random() - 0.5) * 480;
            const y = (Math.random() - 0.5) * 200;
            const p = new THREE.Vector3(x, y, z);
            if (p.length() > 1050) continue;
            const col = warnColors[Math.floor(Math.random() * warnColors.length)];
            const mat = new THREE.MeshStandardMaterial({
                color: 0x111111,
                emissive: col,
                emissiveIntensity: 0.55,
                metalness: 0.6,
                roughness: 0.42
            });
            const bulb = new THREE.Mesh(new THREE.BoxGeometry(9, 9, 5), mat);
            bulb.position.copy(p);
            bulb.lookAt(0, 0, 0);
            this.spacecraftGroup.add(bulb);
            this.shipEmissiveNodes.push({
                mesh: bulb,
                base: 0.35 + Math.random() * 0.45,
                speed: 3 + Math.random() * 6,
                phase: Math.random() * Math.PI * 2,
                isRed: col === 0xff2200
            });
        }
    }

    /**
     * 巨大産業系トーラスリング（モジュールセグメント、グリーブル、内側機構、赤エミッシブ同期パルス）
     */
    buildIndustrialRing() {
        this.ringGroup = new THREE.Group();
        this.ringGroup.position.y = this.coreCenterY;
        this.scene.add(this.ringGroup);

        this.ringSpinGroup = new THREE.Group();
        this.ringGroup.add(this.ringSpinGroup);

        const R = 1680;
        const tube = 260;
        const segments = 26;
        const hull = this.makeHullMat(0x8a9098, 0.82, 0.7);
        const hullPlate = this.makeHullMat(0x757b84, 0.86, 0.74);
        const dark = this.makeDarkMat();

        const redStripMat = new THREE.MeshStandardMaterial({
            color: 0x1a0808,
            metalness: 0.55,
            roughness: 0.48,
            emissive: 0xff1100,
            emissiveIntensity: 0.55,
            envMap: this.envMap(),
            envMapIntensity: 0.25
        });

        const arc = (2 * Math.PI) / segments;
        const panelW = 2 * R * Math.sin(arc / 2) * 0.92;

        for (let i = 0; i < segments; i++) {
            const theta = i * arc;
            const cx = Math.cos(theta) * R;
            const cz = Math.sin(theta) * R;
            const out = new THREE.Vector3(cx, 0, cz).normalize();

            const seg = new THREE.Group();
            seg.position.copy(out.clone().multiplyScalar(R));
            seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);

            const mainPlate = new THREE.Mesh(
                new THREE.BoxGeometry(panelW, tube * 1.35, 52),
                i % 2 === 0 ? hull : hullPlate
            );
            mainPlate.position.z = tube * 0.5 + 18;
            mainPlate.castShadow = true;
            mainPlate.receiveShadow = true;
            seg.add(mainPlate);

            const innerSkin = new THREE.Mesh(
                new THREE.BoxGeometry(panelW * 0.96, tube * 1.1, 36),
                dark
            );
            innerSkin.position.z = -tube * 0.35;
            innerSkin.castShadow = true;
            seg.add(innerSkin);

            for (let v = 0; v < 5; v++) {
                const vent = new THREE.Mesh(
                    new THREE.BoxGeometry(18 + v * 6, 4, 28 + (i % 3) * 8),
                    dark
                );
                vent.position.set(
                    (Math.random() - 0.5) * panelW * 0.75,
                    (v - 2) * (tube * 0.22),
                    tube * 0.5 + 42
                );
                vent.rotation.z = (Math.random() - 0.5) * 0.15;
                vent.castShadow = true;
                seg.add(vent);
            }

            for (let b = 0; b < 14; b++) {
                const bolt = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 9, 6), hullPlate);
                bolt.rotation.x = Math.PI / 2;
                bolt.position.set(
                    (Math.random() - 0.5) * panelW * 0.85,
                    (Math.random() - 0.5) * tube * 0.9,
                    tube * 0.5 + 48 + Math.random() * 4
                );
                bolt.castShadow = true;
                seg.add(bolt);
            }

            for (let g = 0; g < 10; g++) {
                const greeble = new THREE.Mesh(
                    new THREE.BoxGeometry(12 + Math.random() * 40, 8 + Math.random() * 14, 10 + Math.random() * 18),
                    Math.random() > 0.55 ? dark : hull
                );
                greeble.position.set(
                    (Math.random() - 0.5) * panelW * 0.8,
                    (Math.random() - 0.5) * tube * 0.75,
                    tube * 0.5 + 30 + Math.random() * 35
                );
                greeble.rotation.set(Math.random() * 0.2, Math.random() * 0.3, Math.random() * 0.2);
                greeble.castShadow = true;
                seg.add(greeble);
            }

            const strip = new THREE.Mesh(
                new THREE.BoxGeometry(panelW * 0.88, 14, 8),
                redStripMat.clone()
            );
            strip.position.set(0, tube * 0.42, tube * 0.5 + 58);
            seg.add(strip);
            this.ringEmissiveNodes.push({
                mesh: strip,
                base: 0.5,
                speed: 2.4,
                ringPhase: (i / segments) * Math.PI * 2
            });

            for (let e = 0; e < 3; e++) {
                const nodeMat = redStripMat.clone();
                const node = new THREE.Mesh(new THREE.BoxGeometry(22, 10, 7), nodeMat);
                node.position.set(
                    (e - 1) * panelW * 0.28,
                    -tube * 0.38,
                    tube * 0.5 + 52
                );
                seg.add(node);
                this.ringEmissiveNodes.push({
                    mesh: node,
                    base: 0.42 + e * 0.08,
                    speed: 2.8,
                    ringPhase: (i / segments) * Math.PI * 2 + e * 0.4
                });
            }

            this.ringSpinGroup.add(seg);
        }

        this.ringInnerRotate = new THREE.Group();
        this.ringSpinGroup.add(this.ringInnerRotate);

        const Rin = 1180;
        const innerSegs = 20;
        const iArc = (2 * Math.PI) / innerSegs;
        for (let j = 0; j < innerSegs; j++) {
            const th = j * iArc;
            const ox = Math.cos(th) * Rin;
            const oz = Math.sin(th) * Rin;
            const rout = new THREE.Vector3(ox, 0, oz).normalize();

            const block = new THREE.Mesh(
                new THREE.BoxGeometry(120, 70, 90),
                dark
            );
            block.position.copy(rout.clone().multiplyScalar(Rin));
            block.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), rout);
            block.position.add(rout.clone().multiplyScalar(-40));
            block.castShadow = true;
            this.ringInnerRotate.add(block);

            const conduit = new THREE.Mesh(
                new THREE.CylinderGeometry(10, 10, 160 + (j % 5) * 20, 10),
                hullPlate
            );
            conduit.rotation.x = Math.PI / 2;
            conduit.position.copy(rout.clone().multiplyScalar(Rin - 80));
            conduit.position.y = (j % 2 === 0 ? 1 : -1) * 35;
            this.ringInnerRotate.add(conduit);
        }

        this.ringArticulated = new THREE.Group();
        this.ringInnerRotate.add(this.ringArticulated);

        for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2;
            const arm = new THREE.Group();
            arm.position.set(Math.cos(a) * (Rin - 120), 0, Math.sin(a) * (Rin - 120));
            arm.rotation.y = -a;

            const beam = new THREE.Mesh(new THREE.BoxGeometry(200, 24, 18), hull);
            beam.position.x = 90;
            beam.castShadow = true;
            arm.add(beam);

            const joint = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 28, 8), hullPlate);
            joint.rotation.z = Math.PI / 2;
            joint.castShadow = true;
            arm.add(joint);

            this.ringArticulated.add(arm);
        }

        const hub = new THREE.Mesh(
            new THREE.CylinderGeometry(140, 160, 120, 20),
            hullPlate
        );
        hub.rotation.x = Math.PI / 2;
        hub.castShadow = true;
        this.ringInnerRotate.add(hub);

        const hubGlow = new THREE.Mesh(
            new THREE.CylinderGeometry(100, 120, 24, 20),
            new THREE.MeshStandardMaterial({
                color: 0x220000,
                emissive: 0xff2200,
                emissiveIntensity: 0.35,
                metalness: 0.4,
                roughness: 0.5,
                transparent: true,
                opacity: 0.85
            })
        );
        hubGlow.rotation.x = Math.PI / 2;
        this.ringInnerRotate.add(hubGlow);
        this.ringEmissiveNodes.push({
            mesh: hubGlow,
            base: 0.35,
            speed: 1.8,
            ringPhase: 0
        });
    }

    /**
     * レトロ産業系イラスト風：多層球、大きな曲面板 vs 超高密度ゾーン、開口、内側機構
     */
    buildRetroSphere() {
        this.retroSphereGroup = new THREE.Group();
        this.retroSphereGroup.position.y = this.coreCenterY;
        this.scene.add(this.retroSphereGroup);

        this.retroDetailGroup = new THREE.Group();
        this.retroSphereGroup.add(this.retroDetailGroup);

        const R = 1280;
        const plateClean = this.makeHullMat(0x9a9288, 0.78, 0.48);
        const plateWorn = this.makeHullMat(0x7d7268, 0.88, 0.52);
        const plateDense = this.makeHullMat(0x6a6056, 0.9, 0.54);
        const dark = this.makeHullMat(0x3f3a36, 0.92, 0.58);
        const brass = this.makeHullMat(0x6d5c48, 0.8, 0.62);

        const thetaSegs = 6;
        const phiBands = 5;
        const gap = 0.024;

        const cutaway = (ti, bi) => {
            if (bi === 2) return ti === 0 || ti === 1 || ti === 5;
            if (bi === 3) return ti === 0 || ti === 1;
            return false;
        };

        const isDenseZone = (ti, bi) => bi >= 1 && bi <= 3 && ti >= 2 && ti <= 4;

        for (let bi = 0; bi < phiBands; bi++) {
            const phi0 = (bi / phiBands) * Math.PI;
            const phi1 = ((bi + 1) / phiBands) * Math.PI;
            for (let ti = 0; ti < thetaSegs; ti++) {
                if (cutaway(ti, bi)) continue;
                const t0 = (ti / thetaSegs) * Math.PI * 2;
                const t1 = ((ti + 1) / thetaSegs) * Math.PI * 2;
                const geo = new THREE.SphereGeometry(
                    R,
                    28,
                    28,
                    t0 + gap,
                    t1 - t0 - gap * 2,
                    phi0 + gap,
                    phi1 - phi0 - gap * 2
                );
                const mat = isDenseZone(ti, bi) ? plateDense : plateClean;
                const mesh = new THREE.Mesh(geo, mat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                const midPhi = (phi0 + phi1) * 0.5;
                const midTheta = (t0 + t1) * 0.5;
                const nx = Math.sin(midPhi) * Math.cos(midTheta);
                const ny = Math.cos(midPhi);
                const nz = Math.sin(midPhi) * Math.sin(midTheta);
                mesh.position.set(nx * 10, ny * 10, nz * 10);
                this.retroSphereGroup.add(mesh);

                if (isDenseZone(ti, bi)) {
                    this.retroAddDenseGreeble(R, t0, t1, phi0, phi1, dark, plateWorn, brass);
                }
            }
        }

        this.retroBuildRetroInnerLayers(R, dark, brass, plateWorn);
        this.retroBuildRetroInnerMachinery(R * 0.5);
        this.retroAddRetroPistons(R);
        this.retroAddRetroCableWeave(R, dark);
    }

    retroAddDenseGreeble(R, t0, t1, phi0, phi1, darkMat, hullMat, brassMat) {
        const rnd = (a, b) => a + Math.random() * (b - a);
        const n = 52;
        for (let i = 0; i < n; i++) {
            const phi = rnd(phi0, phi1);
            const theta = rnd(t0, t1);
            const nrm = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            ).normalize();
            const pos = nrm.clone().multiplyScalar(R * 1.008);
            const k = i % 7;

            if (k === 0 || k === 1) {
                const pipe = new THREE.Mesh(
                    new THREE.CylinderGeometry(5 + Math.random() * 4, 6 + Math.random() * 4, rnd(18, 65), 6),
                    brassMat
                );
                const tan = new THREE.Vector3().crossVectors(nrm, new THREE.Vector3(0, 1, 0));
                if (tan.lengthSq() < 0.01) tan.crossVectors(nrm, new THREE.Vector3(1, 0, 0));
                tan.normalize();
                pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
                pipe.position.copy(pos.clone().add(nrm.clone().multiplyScalar(4)));
                pipe.castShadow = true;
                this.retroDetailGroup.add(pipe);
            } else if (k === 2 || k === 3) {
                const vent = new THREE.Mesh(
                    new THREE.BoxGeometry(rnd(14, 48), rnd(4, 9), rnd(12, 36)),
                    darkMat
                );
                vent.position.copy(pos.clone().add(nrm.clone().multiplyScalar(6)));
                vent.lookAt(pos.clone().add(nrm.clone().multiplyScalar(20)));
                vent.castShadow = true;
                this.retroDetailGroup.add(vent);
            } else if (k === 4) {
                const mod = new THREE.Mesh(
                    new THREE.BoxGeometry(rnd(10, 28), rnd(8, 22), rnd(10, 24)),
                    hullMat
                );
                mod.position.copy(pos.clone().add(nrm.clone().multiplyScalar(8)));
                mod.rotation.set(Math.random() * 0.35, Math.random() * 0.35, Math.random() * 0.35);
                mod.castShadow = true;
                this.retroDetailGroup.add(mod);
            } else {
                const bolt = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, rnd(6, 14), 5), brassMat);
                bolt.position.copy(pos.clone().add(nrm.clone().multiplyScalar(3)));
                bolt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
                bolt.castShadow = true;
                this.retroDetailGroup.add(bolt);
            }
        }
    }

    retroBuildRetroInnerLayers(R, darkMat, brassMat, hullMat) {
        const rMid = R * 0.88;
        for (let band = 0; band < 3; band++) {
            const phi0 = (0.25 + band * 0.12) * Math.PI;
            const phi1 = phi0 + 0.1 * Math.PI;
            for (let ti = 0; ti < 10; ti++) {
                const t0 = (ti / 10) * Math.PI * 2;
                const t1 = ((ti + 1) / 10) * Math.PI * 2;
                if (band === 1 && (ti === 0 || ti === 1 || ti === 9)) continue;
                const geo = new THREE.SphereGeometry(
                    rMid,
                    20,
                    20,
                    t0 + 0.02,
                    t1 - t0 - 0.04,
                    phi0 + 0.02,
                    phi1 - phi0 - 0.04
                );
                const mesh = new THREE.Mesh(geo, band === 1 ? brassMat : darkMat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                const midPhi = (phi0 + phi1) * 0.5;
                const midTheta = (t0 + t1) * 0.5;
                const nx = Math.sin(midPhi) * Math.cos(midTheta);
                const ny = Math.cos(midPhi);
                const nz = Math.sin(midPhi) * Math.sin(midTheta);
                mesh.position.set(nx * 6, ny * 6, nz * 6);
                this.retroDetailGroup.add(mesh);
            }
        }

        for (let i = 0; i < 36; i++) {
            const phi = Math.acos(2 * Math.random() - 1);
            const theta = Math.random() * Math.PI * 2;
            const n = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            ).normalize();
            const start = n.clone().multiplyScalar(R * 0.96);
            const end = n.clone().multiplyScalar(rMid * 0.92);
            const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80));
            const curve = new THREE.CatmullRomCurve3([start, mid, end], false, 'centripetal', 0.4);
            const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 4 + Math.random() * 3, 6, false), hullMat);
            tube.castShadow = true;
            this.retroDetailGroup.add(tube);
        }
    }

    retroBuildRetroInnerMachinery(radius) {
        this.retroInnerMachinery = new THREE.Group();
        const mat = this.makeHullMat(0x524a42, 0.86, 0.56);
        const accent = this.makeHullMat(0x7a6b58, 0.78, 0.58);

        const t1 = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.92, 18, 10, 40), mat);
        t1.rotation.x = Math.PI / 2;
        const t2 = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.68, 12, 8, 32), accent);
        t2.rotation.x = Math.PI / 2;
        t2.rotation.z = Math.PI / 4;
        this.retroInnerMachinery.add(t1);
        this.retroInnerMachinery.add(t2);

        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            const box = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.38, 32, 22), mat);
            box.position.set(Math.cos(a) * radius * 0.45, (Math.random() - 0.5) * 120, Math.sin(a) * radius * 0.45);
            box.lookAt(0, 0, 0);
            box.castShadow = true;
            this.retroInnerMachinery.add(box);
        }

        const coreMat = new THREE.MeshStandardMaterial({
            color: 0x1a1510,
            metalness: 0.45,
            roughness: 0.42,
            emissive: 0x884400,
            emissiveIntensity: 0.35,
            envMap: this.envMap(),
            envMapIntensity: 0.18
        });
        this.retroCoreMesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.22, 32, 32), coreMat);
        this.retroCoreMesh.castShadow = true;
        this.retroInnerMachinery.add(this.retroCoreMesh);

        for (let i = 0; i < 28; i++) {
            const phi = Math.acos(2 * Math.random() - 1);
            const theta = Math.random() * Math.PI * 2;
            const n = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            ).normalize();
            const p = n.clone().multiplyScalar(radius * 0.78);
            const amber = new THREE.MeshStandardMaterial({
                color: 0x1a1810,
                emissive: 0xbb6600,
                emissiveIntensity: 0.22,
                metalness: 0.55,
                roughness: 0.72
            });
            const bulb = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 4), amber);
            bulb.position.copy(p);
            bulb.lookAt(0, 0, 0);
            this.retroInnerMachinery.add(bulb);
            this.retroEmissiveNodes.push({
                mesh: bulb,
                base: 0.2 + Math.random() * 0.15,
                speed: 1.8 + Math.random() * 2.5,
                phase: Math.random() * Math.PI * 2
            });
        }

        this.retroSphereGroup.add(this.retroInnerMachinery);
    }

    retroAddRetroPistons(R) {
        const dark = this.makeHullMat(0x4a4540, 0.9, 0.58);
        for (let i = 0; i < 14; i++) {
            const phi = Math.random() * Math.PI * 0.55 + Math.PI * 0.22;
            const theta = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
            const n = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            ).normalize();
            const g = new THREE.Group();
            const base = new THREE.Mesh(new THREE.CylinderGeometry(20, 26, 36, 8), dark);
            base.rotateZ(Math.PI / 2);
            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 100, 8), dark);
            shaft.position.x = 58;
            shaft.rotateZ(Math.PI / 2);
            g.add(base);
            g.add(shaft);
            g.position.copy(n.clone().multiplyScalar(R * 0.98));
            g.lookAt(n.clone().multiplyScalar(R * 2));
            this.retroDetailGroup.add(g);
            this.retroPistonRoots.push({ group: g, phase: i * 0.55 });
        }
    }

    retroAddRetroCableWeave(R, darkMat) {
        for (let i = 0; i < 22; i++) {
            const phi = Math.acos(2 * Math.random() - 1);
            const theta = Math.random() * Math.PI * 2;
            const n = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            ).normalize();
            const start = n.clone().multiplyScalar(R * 0.55);
            const mid = n.clone().multiplyScalar(R * 0.78).add(new THREE.Vector3((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200));
            const end = n.clone().multiplyScalar(R * 0.94);
            const curve = new THREE.CatmullRomCurve3([start, mid, end], false, 'centripetal', 0.38);
            const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 5 + Math.random() * 4, 7, false), darkMat);
            tube.castShadow = true;
            this.retroDetailGroup.add(tube);
        }
    }

    /**
     * 戦術ハードサーフェス球：大きな面取り装甲、交差する厚板、開口、帯状補強（細かいグリーブルは避ける）
     */
    buildTacticalSphere() {
        this.tacticalSphereGroup = new THREE.Group();
        this.tacticalSphereGroup.position.y = this.coreCenterY;
        this.scene.add(this.tacticalSphereGroup);

        const R = 1240;
        const innerR = R * 0.82;

        const innerMat = this.makeTacticalMat(0x141518);
        const inner = new THREE.Mesh(new THREE.SphereGeometry(innerR, 10, 8), innerMat);
        inner.castShadow = true;
        inner.receiveShadow = true;
        this.tacticalSphereGroup.add(inner);

        const thetaSegs = 6;
        const phiBands = 5;
        const gap = 0.032;

        const opening = (ti, bi) => {
            if (bi === 2 && (ti === 2 || ti === 5)) return true;
            if (bi === 3 && ti === 0) return true;
            return false;
        };

        const plateTints = [0x262a2e, 0x2a2e34, 0x2e3238, 0x22262a];

        for (let bi = 0; bi < phiBands; bi++) {
            const phi0 = (bi / phiBands) * Math.PI;
            const phi1 = ((bi + 1) / phiBands) * Math.PI;
            for (let ti = 0; ti < thetaSegs; ti++) {
                if (opening(ti, bi)) continue;
                const t0 = (ti / thetaSegs) * Math.PI * 2;
                const t1 = ((ti + 1) / thetaSegs) * Math.PI * 2;
                const geo = new THREE.SphereGeometry(
                    R,
                    5,
                    4,
                    t0 + gap,
                    t1 - t0 - gap * 2,
                    phi0 + gap,
                    phi1 - phi0 - gap * 2
                );
                const mat = this.makeTacticalMat(plateTints[(ti + bi) % plateTints.length]);
                const mesh = new THREE.Mesh(geo, mat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                const midPhi = (phi0 + phi1) * 0.5;
                const midTheta = (t0 + t1) * 0.5;
                const nx = Math.sin(midPhi) * Math.cos(midTheta);
                const ny = Math.cos(midPhi);
                const nz = Math.sin(midPhi) * Math.sin(midTheta);
                mesh.position.set(nx * 8, ny * 8, nz * 8);
                this.tacticalSphereGroup.add(mesh);
            }
        }

        const span = R * 2.35;
        const thick = 72;
        for (let i = 0; i < 4; i++) {
            const slab = new THREE.Mesh(
                new THREE.BoxGeometry(thick, span, span),
                this.makeTacticalMat(0x22262c + i * 0x020202)
            );
            slab.rotation.y = (i / 4) * Math.PI * 0.5;
            slab.castShadow = true;
            slab.receiveShadow = true;
            this.tacticalSphereGroup.add(slab);
        }

        const up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i < 8; i++) {
            const theta = (i / 8) * Math.PI * 2;
            const n = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
            const east = new THREE.Vector3().crossVectors(up, n).normalize();
            const basis = new THREE.Matrix4().makeBasis(east, up, n);
            const rib = new THREE.Mesh(
                new THREE.BoxGeometry(130, 520, 92),
                this.makeTacticalMat(0x232830)
            );
            rib.setRotationFromMatrix(basis);
            rib.position.copy(n.clone().multiplyScalar(R * 0.985 + 46));
            rib.castShadow = true;
            rib.receiveShadow = true;
            this.tacticalSphereGroup.add(rib);
        }

        for (let b = 0; b < 3; b++) {
            const phi = (0.32 + b * 0.14) * Math.PI;
            const ringR = R * Math.sin(phi) * 0.98;
            const band = new THREE.Mesh(
                new THREE.TorusGeometry(ringR, 54, 6, 56),
                this.makeTacticalMat(0x1a1e24)
            );
            band.rotation.x = Math.PI / 2;
            band.position.y = R * Math.cos(phi);
            band.castShadow = true;
            band.receiveShadow = true;
            this.tacticalSphereGroup.add(band);
        }
    }

    applyDesignVisibility() {
        const m = this.designMode;
        if (this.reactorGroup) this.reactorGroup.visible = m === 'reactor';
        if (this.abstractMassGroup) this.abstractMassGroup.visible = m === 'abstract';
        if (this.spacecraftGroup) this.spacecraftGroup.visible = m === 'ship';
        if (this.ringGroup) this.ringGroup.visible = m === 'ring';
        if (this.retroSphereGroup) this.retroSphereGroup.visible = m === 'retroSphere';
        if (this.tacticalSphereGroup) this.tacticalSphereGroup.visible = m === 'tacticalSphere';

        if (m === 'abstract') this.title = 'Abstract Mechanical Mass';
        else if (m === 'ship') this.title = 'Industrial Heavy Spacecraft';
        else if (m === 'ring') this.title = 'Industrial Torus Ring';
        else if (m === 'retroSphere') this.title = 'Retro Industrial Sphere';
        else if (m === 'tacticalSphere') this.title = 'Tactical Armor Sphere';
        else this.title = 'Industrial Reactor Sphere';

        this.setScreenshotText(this.title);
        this.trackEffects[7] = m !== 'reactor';
    }

    /** @param {'reactor'|'abstract'|'ship'|'ring'|'retroSphere'|'tacticalSphere'} mode */
    setDesignMode(mode) {
        if (
            mode !== 'reactor' &&
            mode !== 'abstract' &&
            mode !== 'ship' &&
            mode !== 'ring' &&
            mode !== 'retroSphere' &&
            mode !== 'tacticalSphere'
        ) {
            return;
        }
        this.designMode = mode;
        this.applyDesignVisibility();
    }

    cycleDesignMode() {
        const order = ['reactor', 'abstract', 'ship', 'ring', 'retroSphere', 'tacticalSphere'];
        const i = order.indexOf(this.designMode);
        this.designMode = order[(i + 1) % order.length];
        this.applyDesignVisibility();
    }

    /** @deprecated 互換: 抽象のみトグル（ship を挟まない） */
    setAbstractClusterMass(enabled) {
        this.setDesignMode(enabled ? 'abstract' : 'reactor');
    }

    toggleEffect(trackNumber) {
        if (trackNumber === 7) {
            this.cycleDesignMode();
            return;
        }
        super.toggleEffect(trackNumber);
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;

        this.updateCamera();

        if (this.designMode === 'abstract') {
            const ap = 0.5 + 0.5 * Math.sin(this.time * 1.9);
            if (this.abstractCoreMesh && this.abstractCoreMesh.material) {
                this.abstractCoreMesh.material.emissiveIntensity = 0.2 + ap * 0.45;
            }
            if (this.abstractCoreGlow && this.abstractCoreGlow.material) {
                this.abstractCoreGlow.material.opacity = 0.04 + ap * 0.08;
            }
            if (this.pointLight) {
                this.pointLight.intensity = 1.2 + ap * 3;
                this.pointLight.color.setHex(0x99bbdd);
            }
            if (this.abstractMechanism) {
                this.abstractMechanism.rotation.y += deltaTime * 0.1;
                this.abstractMechanism.rotation.z += deltaTime * 0.06;
            }
            for (const s of this.abstractEmissiveNodes) {
                const flick = 0.3 + 0.7 * Math.abs(Math.sin(this.time * s.speed + s.phase));
                s.mesh.material.emissiveIntensity = s.base * (0.35 + 0.65 * flick);
            }
            for (const p of this.abstractPistonGroups) {
                const o = Math.sin(this.time * 1.8 + p.phase) * 42;
                p.shaft.position.x = 130 + o;
            }
        } else if (this.designMode === 'ship') {
            const ep = 0.5 + 0.5 * Math.sin(this.time * 2.2);
            for (const g of this.shipEngineGlowMeshes) {
                if (g.material && g.material.opacity !== undefined) {
                    g.material.opacity = 0.32 + ep * 0.38;
                }
            }
            if (this.shipPropulsionGroup) {
                this.shipPropulsionGroup.rotation.y += deltaTime * 0.08;
                this.shipPropulsionGroup.rotation.z = Math.sin(this.time * 0.35) * 0.04;
            }
            for (const s of this.shipEmissiveNodes) {
                const flick = 0.3 + 0.7 * Math.abs(Math.sin(this.time * s.speed + s.phase));
                const mul = s.isRed ? 1.15 : 1.0;
                s.mesh.material.emissiveIntensity = s.base * (0.35 + 0.65 * flick) * mul;
            }
            if (this.pointLight) {
                this.pointLight.intensity = 1.4 + ep * 5;
                this.pointLight.color.setHex(0xff5522);
            }
        } else if (this.designMode === 'ring') {
            const rp = 0.5 + 0.5 * Math.sin(this.time * 2.2);
            if (this.ringSpinGroup) {
                this.ringSpinGroup.rotation.y += deltaTime * 0.026;
            }
            if (this.ringInnerRotate) {
                this.ringInnerRotate.rotation.y -= deltaTime * 0.12;
            }
            if (this.ringArticulated) {
                this.ringArticulated.children.forEach((arm, idx) => {
                    arm.rotation.x = Math.sin(this.time * 1.85 + idx * 0.55) * 0.09;
                    arm.rotation.z = Math.sin(this.time * 1.2 + idx * 0.35) * 0.05;
                });
            }
            const sync = this.time * 2.5;
            for (const s of this.ringEmissiveNodes) {
                const wave = 0.28 + 0.72 * Math.pow(Math.sin(sync + s.ringPhase), 2);
                if (s.mesh.material && s.mesh.material.emissiveIntensity !== undefined) {
                    s.mesh.material.emissiveIntensity = (s.base || 0.5) * (0.35 + 0.65 * wave);
                }
            }
            if (this.pointLight) {
                this.pointLight.intensity = 1.6 + rp * 5.5;
                this.pointLight.color.setHex(0xff2200);
            }
        } else if (this.designMode === 'retroSphere') {
            const rp = 0.5 + 0.5 * Math.sin(this.time * 2.1);
            if (this.retroInnerMachinery) {
                this.retroInnerMachinery.rotation.y += deltaTime * 0.095;
                this.retroInnerMachinery.rotation.x += deltaTime * 0.028;
            }
            if (this.retroCoreMesh && this.retroCoreMesh.material) {
                this.retroCoreMesh.material.emissiveIntensity = 0.28 + rp * 0.45;
            }
            for (const s of this.retroEmissiveNodes) {
                const flick = 0.25 + 0.75 * Math.abs(Math.sin(this.time * s.speed + s.phase));
                if (s.mesh.material && s.mesh.material.emissiveIntensity !== undefined) {
                    s.mesh.material.emissiveIntensity = s.base * (0.4 + 0.6 * flick);
                }
            }
            for (const p of this.retroPistonRoots) {
                const o = Math.sin(this.time * 1.95 + p.phase) * 14;
                p.group.children[1].position.x = 58 + o;
            }
            if (this.pointLight) {
                this.pointLight.intensity = 1.5 + rp * 4.5;
                this.pointLight.color.setHex(0xcc7744);
            }
        } else if (this.designMode === 'tacticalSphere') {
            const tp = 0.5 + 0.5 * Math.sin(this.time * 1.75);
            if (this.tacticalSphereGroup) {
                this.tacticalSphereGroup.rotation.y += deltaTime * 0.018;
            }
            if (this.pointLight) {
                this.pointLight.intensity = 0.85 + tp * 2.8;
                this.pointLight.color.setHex(0x556678);
            }
        } else {
            const pulse = 0.55 + 0.45 * Math.sin(this.time * 2.8);
            if (this.reactorCore && this.reactorCore.material) {
                this.reactorCore.material.emissiveIntensity = 0.9 + pulse * 1.4;
            }
            if (this.coreGlowMesh && this.coreGlowMesh.material) {
                this.coreGlowMesh.material.opacity = 0.06 + pulse * 0.12;
            }
            if (this.pointLight) {
                this.pointLight.intensity = 2 + pulse * 6;
                this.pointLight.color.setHex(0xff3311);
            }
            if (this.innerMachinery) {
                this.innerMachinery.rotation.y += deltaTime * 0.12;
                this.innerMachinery.rotation.x += deltaTime * 0.04;
            }
            for (const s of this.statusLights) {
                const flick = 0.35 + 0.65 * Math.abs(Math.sin(this.time * s.speed + s.phase));
                s.mesh.material.emissiveIntensity = s.base * (0.4 + 0.6 * flick);
            }
            for (const p of this.pistonRoots) {
                const o = Math.sin(this.time * 2.1 + p.phase) * 12;
                p.group.children[1].position.x = 70 + o;
            }
        }

        if (this.cubeCamera && Math.floor(this.time * 60) % 8 === 0) {
            this.cubeCamera.update(this.renderer, this.scene);
        }

        this.updateAutoFocus();

        if (this.strobeActive && this.strobeEndTime > 0 && Date.now() >= this.strobeEndTime) {
            this.strobeActive = false;
        }

        if (this.calloutSystem) {
            this.calloutSystem.update(deltaTime, this.time, this.camera, {
                autoGenerate: false,
                maxCount: 15,
                margin: 200
            });
        }
    }

    updateAutoFocus() {
        if (!this.useDOF || !this.bokehPass) return;

        let group = this.reactorGroup;
        if (this.designMode === 'abstract') group = this.abstractMassGroup;
        else if (this.designMode === 'ship') group = this.spacecraftGroup;
        else if (this.designMode === 'ring') group = this.ringGroup;
        else if (this.designMode === 'retroSphere') group = this.retroSphereGroup;
        else if (this.designMode === 'tacticalSphere') group = this.tacticalSphereGroup;

        let focusDist = null;
        if (group) {
            this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
            const intersects = this.raycaster.intersectObjects([group], true);
            if (intersects.length > 0) {
                focusDist = intersects[0].distance;
            }
        }

        if (focusDist == null) {
            const cameraWorldPos = new THREE.Vector3();
            this.camera.getWorldPosition(cameraWorldPos);
            this.camera.getWorldDirection(this._focusRay.direction);
            this._focusRay.origin.copy(cameraWorldPos);

            let sphere = this._focusSphereReactor;
            if (this.designMode === 'abstract') sphere = this._focusSphereAbstract;
            else if (this.designMode === 'ship') sphere = this._focusSphereShip;
            else if (this.designMode === 'ring') sphere = this._focusSphereRing;
            else if (this.designMode === 'retroSphere') sphere = this._focusSphereRetro;
            else if (this.designMode === 'tacticalSphere') sphere = this._focusSphereTactical;

            if (sphere && !sphere.isEmpty() && this._focusRay.intersectSphere(sphere, this._focusHit)) {
                focusDist = cameraWorldPos.distanceTo(this._focusHit);
            } else {
                const coreCenter = new THREE.Vector3(0, this.coreCenterY, 0);
                const distToCenter = cameraWorldPos.distanceTo(coreCenter);
                let effR = this.coreRadius;
                if (this.designMode === 'abstract') effR = this.abstractFocusRadius;
                else if (this.designMode === 'ship') effR = this.shipFocusRadius;
                else if (this.designMode === 'ring') effR = this.ringFocusRadius;
                else if (this.designMode === 'retroSphere') effR = this.retroFocusRadius;
                else if (this.designMode === 'tacticalSphere') effR = this.tacticalFocusRadius;
                focusDist = distToCenter - effR;
            }
        }

        if (focusDist < 10) focusDist = 10;
        const currentFocus = this.bokehPass.uniforms.focus.value;
        this.bokehPass.uniforms.focus.value = currentFocus + (focusDist - currentFocus) * 0.1;
    }

    initPostProcessing() {
        if (!this.composer) {
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
        }
        if (this.useBloom) {
            this.bloomPass = new UnrealBloomPass(
                new THREE.Vector2(window.innerWidth / 4, window.innerHeight / 4),
                0.2,
                0.1,
                1.2
            );
            this.composer.addPass(this.bloomPass);
        }
        if (this.useDOF) {
            this.initDOF({
                focus: 2500,
                aperture: 0.00001,
                maxblur: 0.005
            });
        }
        this.addFilmGrainIfEnabled(0.35, false);
    }

    handleTrackNumber(trackNumber, message) {
        if (trackNumber === 2) {
            const args = message.args || [];
            const durationMs = (args.length >= 3) ? args[2] : 500;
            this.strobeActive = true;
            this.strobeEndTime = Date.now() + durationMs;
        }

        if (trackNumber === 5) {
            const args = message.args || [];
            const durationMs = args[2] !== undefined ? args[2] : 2000;
            if (this.calloutSystem) {
                const phi = Math.random() * Math.PI * 2;
                const theta = Math.random() * Math.PI;
                let r = this.coreRadius;
                if (this.designMode === 'abstract') r = this.abstractFocusRadius;
                else if (this.designMode === 'ship') r = this.shipFocusRadius;
                else if (this.designMode === 'ring') r = this.ringFocusRadius;
                else if (this.designMode === 'retroSphere') r = this.retroFocusRadius;
                else if (this.designMode === 'tacticalSphere') r = this.tacticalFocusRadius;
                const worldPos = new THREE.Vector3(
                    r * Math.sin(theta) * Math.cos(phi),
                    r * Math.cos(theta) + this.coreCenterY,
                    r * Math.sin(theta) * Math.sin(phi)
                );
                const durationSec = Math.max(1.2, durationMs / 1000.0);
                this.calloutSystem.createCallout({
                    worldPos,
                    time: this.time,
                    duration: durationSec
                });
            }
        }

        if (trackNumber === 6) {
            const args = message.args || [];
            const v = args[1] !== undefined ? args[1] : 127;
            const bump = (v / 127) * 4;
            if (this.pointLight) {
                this.pointLight.intensity = 8 + bump * 8;
            }
            if (this.designMode === 'abstract') {
                if (this.abstractCoreMesh && this.abstractCoreMesh.material) {
                    this.abstractCoreMesh.material.emissiveIntensity = 0.5 + bump * 1.2;
                }
            } else if (this.designMode === 'ship') {
                for (const g of this.shipEngineGlowMeshes) {
                    if (g.material && g.material.opacity !== undefined) {
                        g.material.opacity = Math.min(0.95, 0.45 + bump * 0.15);
                    }
                }
                for (const s of this.shipEmissiveNodes) {
                    if (s.mesh.material.emissive) {
                        s.mesh.material.emissiveIntensity = s.base * (1.2 + bump * 0.8);
                    }
                }
            } else if (this.designMode === 'ring') {
                for (const s of this.ringEmissiveNodes) {
                    if (s.mesh.material && s.mesh.material.emissiveIntensity !== undefined) {
                        s.mesh.material.emissiveIntensity = (s.base || 0.5) * (1.4 + bump * 1.2);
                    }
                }
            } else if (this.designMode === 'retroSphere') {
                if (this.retroCoreMesh && this.retroCoreMesh.material) {
                    this.retroCoreMesh.material.emissiveIntensity = 0.4 + bump * 0.9;
                }
                for (const s of this.retroEmissiveNodes) {
                    if (s.mesh.material && s.mesh.material.emissiveIntensity !== undefined) {
                        s.mesh.material.emissiveIntensity = s.base * (1.3 + bump * 1.0);
                    }
                }
            } else if (this.designMode === 'tacticalSphere') {
                if (this.pointLight) {
                    this.pointLight.intensity = 6 + bump * 10;
                    this.pointLight.color.setHex(0x667a8a);
                }
            } else if (this.reactorCore && this.reactorCore.material) {
                this.reactorCore.material.emissiveIntensity = 2 + bump * 2;
            }
        }

        if (trackNumber === 7) {
            const args = message.args || [];
            const velocity = args[1] !== undefined ? args[1] : 127;
            if (velocity > 0) {
                this.cycleDesignMode();
            }
        }
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
        this.statusLights = [];
        this.pistonRoots = [];
        this.abstractEmissiveNodes = [];
        this.abstractPistonGroups = [];
        this.shipEmissiveNodes = [];
        this.shipEngineGlowMeshes = [];
        this.ringEmissiveNodes = [];
        this.retroEmissiveNodes = [];
        this.retroPistonRoots = [];

        if (this.studio) this.studio.dispose();

        if (this.sceneFillPoint) {
            this.scene.remove(this.sceneFillPoint);
            this.sceneFillPoint = null;
        }
        if (this.pointLight) {
            this.scene.remove(this.pointLight);
            this.pointLight = null;
        }

        if (this.cubeRenderTarget) this.cubeRenderTarget.dispose();

        const disposeGroup = (g) => {
            if (!g) return;
            this.scene.remove(g);
            g.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) {
                    const m = o.material;
                    if (m.map) m.map.dispose();
                    if (m.bumpMap) m.bumpMap.dispose();
                    m.dispose();
                }
            });
        };

        disposeGroup(this.reactorGroup);
        this.reactorGroup = null;
        this.reactorCore = null;
        this.coreGlowMesh = null;
        this.innerMachinery = null;

        disposeGroup(this.abstractMassGroup);
        this.abstractMassGroup = null;
        this.abstractMechanism = null;
        this.abstractCoreMesh = null;
        this.abstractCoreGlow = null;

        disposeGroup(this.spacecraftGroup);
        this.spacecraftGroup = null;
        this.shipPropulsionGroup = null;

        disposeGroup(this.ringGroup);
        this.ringGroup = null;
        this.ringSpinGroup = null;
        this.ringInnerRotate = null;
        this.ringArticulated = null;

        disposeGroup(this.retroSphereGroup);
        this.retroSphereGroup = null;
        this.retroDetailGroup = null;
        this.retroInnerMachinery = null;
        this.retroCoreMesh = null;

        disposeGroup(this.tacticalSphereGroup);
        this.tacticalSphereGroup = null;

        if (this.calloutSystem) {
            this.calloutSystem.setScene(null);
        }

        super.dispose();
    }
}
