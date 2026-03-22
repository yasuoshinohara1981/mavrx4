/**
 * Scene21: Hard-surface industrial sci-fi reactor sphere
 * Modular segmented shells, greeble, cutaway panels, emissive core, status lights
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

        this.studio = null;
        this.coreRadius = 1180;
        this.coreCenterY = 1200;
        this.lookAtY = this.coreCenterY;

        this.centralSphere = null;
        this.innerMachinery = null;
        this.reactorCore = null;
        this.coreGlowMesh = null;
        this.cubeRenderTarget = null;
        this.cubeCamera = null;
        this.detailGroup = new THREE.Group();

        this.statusLights = [];
        this.pistonRoots = [];

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
            const safeDistance = 2500;
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
        this.renderer.toneMappingExposure = 1.0;
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
        this.initPostProcessing();

        let meshCount = 0;
        this.centralSphere.traverse((o) => {
            if (o.isMesh) meshCount++;
        });
        this.setParticleCount(meshCount);
        this.initialized = true;
    }

    setupLights() {
        const pureWhite = 0xffffff;
        this.scene.add(new THREE.HemisphereLight(pureWhite, 0x2a2d35, 0.32));
        this.scene.add(new THREE.AmbientLight(0xb8c0c8, 0.18));

        const key = new THREE.DirectionalLight(0xe8eef5, 0.85);
        key.position.set(2800, 4200, 2400);
        key.castShadow = true;
        key.shadow.camera.left = -9000;
        key.shadow.camera.right = 9000;
        key.shadow.camera.top = 9000;
        key.shadow.camera.bottom = -9000;
        key.shadow.camera.near = 100;
        key.shadow.camera.far = 16000;
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.bias = -0.00015;
        this.scene.add(key);

        const fill = new THREE.DirectionalLight(0x8899aa, 0.35);
        fill.position.set(-2000, 1500, -3200);
        this.scene.add(fill);

        this.pointLight = new THREE.PointLight(0xff3322, 0, 12000);
        this.pointLight.position.set(0, this.coreCenterY, 0);
        this.scene.add(this.pointLight);
    }

    createStudioBox() {
        this.studio = new StudioBox(this.scene, { color: 0x9ca4ac });
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
        this.centralSphere = new THREE.Group();
        this.centralSphere.position.y = this.coreCenterY;
        this.scene.add(this.centralSphere);
        this.centralSphere.add(this.detailGroup);

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
                    this.centralSphere.add(mesh);
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

        this.centralSphere.add(this.innerMachinery);
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
        this.centralSphere.add(this.reactorCore);

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
        this.centralSphere.add(this.coreGlowMesh);
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

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;

        this.updateCamera();

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
        if (!this.useDOF || !this.bokehPass || !this.centralSphere) return;
        const cameraWorldPos = new THREE.Vector3();
        this.camera.getWorldPosition(cameraWorldPos);
        const coreCenter = new THREE.Vector3();
        this.centralSphere.getWorldPosition(coreCenter);
        const distToCenter = cameraWorldPos.distanceTo(coreCenter);
        let focusDist = distToCenter - this.coreRadius;
        if (focusDist < 10) focusDist = 10;
        const currentFocus = this.bokehPass.uniforms.focus.value;
        this.bokehPass.uniforms.focus.value = currentFocus + (focusDist - currentFocus) * 0.08;
    }

    initPostProcessing() {
        if (!this.composer) {
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
        }
        if (this.useBloom) {
            this.bloomPass = new UnrealBloomPass(
                new THREE.Vector2(window.innerWidth / 4, window.innerHeight / 4),
                0.22,
                0.06,
                0.88
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
        this.addFilmGrainIfEnabled(0.32, false);
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
                const worldPos = new THREE.Vector3(
                    this.coreRadius * Math.sin(theta) * Math.cos(phi),
                    this.coreRadius * Math.cos(theta) + this.coreCenterY,
                    this.coreRadius * Math.sin(theta) * Math.sin(phi)
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
            if (this.reactorCore && this.reactorCore.material) {
                this.reactorCore.material.emissiveIntensity = 2 + bump * 2;
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

        if (this.studio) this.studio.dispose();

        if (this.cubeRenderTarget) this.cubeRenderTarget.dispose();

        if (this.centralSphere) {
            this.scene.remove(this.centralSphere);
            this.centralSphere.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) {
                    const m = o.material;
                    if (m.map) m.map.dispose();
                    if (m.bumpMap) m.bumpMap.dispose();
                    m.dispose();
                }
            });
            this.centralSphere = null;
        }

        this.reactorCore = null;
        this.coreGlowMesh = null;
        this.innerMachinery = null;

        if (this.calloutSystem) {
            this.calloutSystem.setScene(null);
        }

        super.dispose();
    }
}
