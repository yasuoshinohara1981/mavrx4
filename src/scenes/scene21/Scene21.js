/**
 * Scene21: コンクリート空間（床＋壁＋StudioBox 相当の天井発光）
 * 部屋・ライト・カメラは Scene16 と同型（StudioBox の蛍光灯＋半球/環境/平行光/ポイント）
 * 床・壁の質感は PBR コンクリート、ポストは ACES・弱 DOF・最小 bloom・軽フォグ
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { StudioBox } from '../../lib/StudioBox.js';

export class Scene21 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'Concrete Room';
        this.initialized = false;
        this.sceneNumber = 21;
        this.kitNo = 21;
        this.sharedResourceManager = sharedResourceManager;

        this.studio = null;
        this.roomGroup = null;
        this.ceilingMesh = null;
        /** 試験用：中央の発光球＋ポイントライト */
        this.centerLightGroup = null;
        this.pmremGenerator = null;
        this._roomEnvTexture = null;

        this.useDOF = true;
        this.useBloom = true;
        this.useFilmGrain = true;
        this.bloomPass = null;

        /** Scene16 と同じトラック初期状態 */
        this.trackEffects = {
            1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false, 9: false
        };
        this.setScreenshotText(this.title);

        if (this.calloutSystem) {
            this.calloutSystem.setUse3DCallouts(true);
            this.calloutSystem.setLabels(['CONCRETE', 'PBR', 'AO', 'ACES']);
        }

        /** StudioBox と同スケール（内寸の目安） */
        this.roomHalfW = 5000;
        this.roomHalfD = 5000;
        this.floorTopY = -498;
        this.ceilingY = 5500;
    }

    /** Scene16 と同じカメラ距離 */
    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 750;
        cameraParticle.maxDistance = 4850;
        cameraParticle.maxDistanceReset = 4500;
        cameraParticle.minY = -200;
        cameraParticle.maxY = 4500;
        cameraParticle.initializePosition?.();
    }

    updateCamera() {
        if (this.cameraParticles[this.currentCameraIndex]) {
            const cp = this.cameraParticles[this.currentCameraIndex];
            const cameraPos = cp.getPosition();
            const dist = cameraPos.length();
            if (dist < cp.minDistance) {
                cameraPos.normalize().multiplyScalar(cp.minDistance);
            }
            this.camera.position.copy(cameraPos);
            this.camera.lookAt(0, 400, 0);
            this.camera.matrixWorldNeedsUpdate = false;
        }
    }

    switchCameraRandom() {
        super.switchCameraRandom();
        const cp = this.cameraParticles[this.currentCameraIndex];
        if (cp) {
            const d = cp.position.length();
            if (d < cp.minDistance) {
                cp.position.normalize().multiplyScalar(cp.minDistance + 500);
            }
        }
    }

    generateConcretePBRTextures(size = 1024) {
        const albedoCanvas = document.createElement('canvas');
        albedoCanvas.width = size;
        albedoCanvas.height = size;
        const aCtx = albedoCanvas.getContext('2d');
        const hCanvas = document.createElement('canvas');
        hCanvas.width = size;
        hCanvas.height = size;
        const hCtx = hCanvas.getContext('2d');
        const roughCanvas = document.createElement('canvas');
        roughCanvas.width = size;
        roughCanvas.height = size;
        const rCtx = roughCanvas.getContext('2d');
        const aoCanvas = document.createElement('canvas');
        aoCanvas.width = size;
        aoCanvas.height = size;
        const aoCtx = aoCanvas.getContext('2d');

        const rnd = (x, y) => {
            const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
            return s - Math.floor(s);
        };
        const smooth = (x, y) => {
            const x0 = Math.floor(x);
            const y0 = Math.floor(y);
            const fx = x - x0;
            const fy = y - y0;
            const u = fx * fx * (3 - 2 * fx);
            const v = fy * fy * (3 - 2 * fy);
            const a = rnd(x0, y0);
            const b = rnd(x0 + 1, y0);
            const c = rnd(x0, y0 + 1);
            const d = rnd(x0 + 1, y0 + 1);
            return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
        };
        const fbm = (x, y, oct) => {
            let amp = 0.5;
            let f = 0;
            let xx = x;
            let yy = y;
            for (let o = 0; o < oct; o++) {
                f += smooth(xx, yy) * amp;
                xx *= 2.05;
                yy *= 2.03;
                amp *= 0.5;
            }
            return f;
        };

        const heightData = new Float32Array(size * size);
        const roughData = new Float32Array(size * size);
        const aoData = new Float32Array(size * size);

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const u = x / size;
                const v = y / size;
                const nx = x * 0.018;
                const ny = y * 0.018;

                const h =
                    fbm(nx, ny, 5) * 0.55 +
                    fbm(nx * 2.2 + 10, ny * 2.1 - 4, 4) * 0.28 +
                    Math.sin(u * 40 + v * 12) * 0.04;
                heightData[y * size + x] = h;

                const rVar =
                    fbm(nx * 1.7 + 50, ny * 1.6 - 20, 5) * 0.55 +
                    fbm(nx * 5.1, ny * 4.8, 3) * 0.35;
                roughData[y * size + x] = THREE.MathUtils.clamp(0.38 + rVar * 0.58, 0, 1);

                const cx = u - 0.5;
                const cy = v - 0.5;
                const edge = 1 - Math.min(1, Math.sqrt(cx * cx + cy * cy) * 1.85);
                const contact = Math.pow(Math.max(0, edge), 1.35);
                const stain = fbm(nx * 0.8 + 100, ny * 0.7, 3);
                aoData[y * size + x] = THREE.MathUtils.clamp(0.52 + contact * 0.28 + stain * 0.08, 0, 1);
            }
        }

        const aImg = aCtx.createImageData(size, size);
        const nImg = aCtx.createImageData(size, size);
        const rImg = rCtx.createImageData(size, size);
        const aoImg = aoCtx.createImageData(size, size);

        const baseCol = new THREE.Color(0x8e949e);
        const cold = new THREE.Color(0x7a808a);
        const stainCol = new THREE.Color(0x5c6068);
        const pixCol = new THREE.Color();

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const i = (y * size + x) * 4;
                const h = heightData[y * size + x];
                const hx = x < size - 1 ? heightData[y * size + x + 1] : h;
                const hxm = x > 0 ? heightData[y * size + x - 1] : h;
                const hy = y < size - 1 ? heightData[(y + 1) * size + x] : h;
                const hym = y > 0 ? heightData[(y - 1) * size + x] : h;
                const dx = (hxm - hx) * 4.2;
                const dy = (hym - hy) * 4.2;
                const nz = Math.sqrt(Math.max(0.0001, 1 - dx * dx - dy * dy));
                const nx = dx * 0.5 + 0.5;
                const ny = dy * 0.5 + 0.5;
                const nzp = nz * 0.5 + 0.5;
                nImg.data[i] = Math.floor(nx * 255);
                nImg.data[i + 1] = Math.floor(ny * 255);
                nImg.data[i + 2] = Math.floor(nzp * 255);
                nImg.data[i + 3] = 255;

                const u = x / size;
                const v = y / size;
                const blot = fbm(x * 0.04, y * 0.04, 4);
                const drip = Math.sin(u * 90 + v * 22) * 0.5 + 0.5;
                const wear = fbm(x * 0.09 + 20, y * 0.11, 3);
                pixCol.copy(baseCol).lerp(cold, blot * 0.35);
                pixCol.lerp(stainCol, drip * 0.12 * wear);
                pixCol.multiplyScalar(0.96 + h * 0.14);
                const speck = rnd(x * 0.37, y * 0.41);
                if (speck < 0.0009) {
                    pixCol.multiplyScalar(0.86 + speck * 14);
                }

                aImg.data[i] = Math.floor(pixCol.r * 255);
                aImg.data[i + 1] = Math.floor(pixCol.g * 255);
                aImg.data[i + 2] = Math.floor(pixCol.b * 255);
                aImg.data[i + 3] = 255;

                const rg = roughData[y * size + x];
                const gCh = Math.floor(rg * 255);
                rImg.data[i] = 0;
                rImg.data[i + 1] = gCh;
                rImg.data[i + 2] = 0;
                rImg.data[i + 3] = 255;

                const ao = aoData[y * size + x];
                const ar = Math.floor(ao * 255);
                aoImg.data[i] = ar;
                aoImg.data[i + 1] = ar;
                aoImg.data[i + 2] = ar;
                aoImg.data[i + 3] = 255;
            }
        }

        aCtx.putImageData(aImg, 0, 0);
        hCtx.putImageData(nImg, 0, 0);
        rCtx.putImageData(rImg, 0, 0);
        aoCtx.putImageData(aoImg, 0, 0);

        const wrap = (canvasTex) => {
            canvasTex.wrapS = canvasTex.wrapT = THREE.RepeatWrapping;
            canvasTex.colorSpace = THREE.SRGBColorSpace;
            canvasTex.anisotropy = 8;
            canvasTex.needsUpdate = true;
        };

        const map = new THREE.CanvasTexture(albedoCanvas);
        wrap(map);

        const normalMap = new THREE.CanvasTexture(hCanvas);
        normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
        normalMap.colorSpace = THREE.LinearSRGBColorSpace;
        normalMap.anisotropy = 8;
        normalMap.needsUpdate = true;

        const roughnessMap = new THREE.CanvasTexture(roughCanvas);
        roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
        roughnessMap.colorSpace = THREE.LinearSRGBColorSpace;
        roughnessMap.anisotropy = 8;
        roughnessMap.needsUpdate = true;

        const aoMap = new THREE.CanvasTexture(aoCanvas);
        aoMap.wrapS = aoMap.wrapT = THREE.RepeatWrapping;
        aoMap.colorSpace = THREE.LinearSRGBColorSpace;
        aoMap.anisotropy = 8;
        aoMap.needsUpdate = true;

        return { map, normalMap, roughnessMap, aoMap };
    }

    applyEnvMapToMaterials(envMap, wallMat, floorMat) {
        wallMat.envMap = envMap;
        floorMat.envMap = envMap;
    }

    ensureUv2(geometry) {
        const uv = geometry.attributes.uv;
        if (!geometry.attributes.uv2) {
            geometry.setAttribute('uv2', uv.clone());
        }
    }

    buildRoom(textures) {
        const repeat = 2.8;
        ['map', 'normalMap', 'roughnessMap', 'aoMap'].forEach((k) => {
            const t = textures[k];
            if (t) {
                t.repeat.set(repeat, repeat);
            }
        });

        /** 壁・床で同一（見た目の明るさを揃える） */
        const concreteMat = new THREE.MeshStandardMaterial({
            color: 0xe8eaee,
            map: textures.map,
            normalMap: textures.normalMap,
            normalScale: new THREE.Vector2(0.55, 0.55),
            roughnessMap: textures.roughnessMap,
            roughness: 0.9,
            metalness: 0,
            aoMap: textures.aoMap,
            aoMapIntensity: 0.5,
            envMapIntensity: 0.95
        });

        this.roomGroup = new THREE.Group();
        const hw = this.roomHalfW;
        const hd = this.roomHalfD;
        const floorTopY = this.floorTopY;
        const ceilingY = this.ceilingY;
        const wallH = ceilingY - floorTopY;
        const wallCenterY = floorTopY + wallH * 0.5;
        const slab = 24;

        const floorGeo = new THREE.BoxGeometry(hw * 2, slab, hd * 2, 1, 1, 1);
        this.ensureUv2(floorGeo);
        const floor = new THREE.Mesh(floorGeo, concreteMat);
        floor.position.set(0, floorTopY - slab * 0.5, 0);
        floor.receiveShadow = true;
        floor.castShadow = false;
        this.roomGroup.add(floor);

        const mkWall = (w, height, d, px, py, pz) => {
            const geo = new THREE.BoxGeometry(w, height, d, 1, 1, 1);
            this.ensureUv2(geo);
            const mesh = new THREE.Mesh(geo, concreteMat);
            mesh.position.set(px, py, pz);
            mesh.receiveShadow = true;
            mesh.castShadow = true;
            this.roomGroup.add(mesh);
        };

        mkWall(slab, wallH, hd * 2, -hw - slab * 0.5, wallCenterY, 0);
        mkWall(slab, wallH, hd * 2, hw + slab * 0.5, wallCenterY, 0);
        mkWall(hw * 2, wallH, slab, 0, wallCenterY, -hd - slab * 0.5);
        mkWall(hw * 2, wallH, slab, 0, wallCenterY, hd + slab * 0.5);

        const ceilingGeo = new THREE.PlaneGeometry(hw * 2, hd * 2);
        ceilingGeo.rotateX(Math.PI / 2);
        const ceilingMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            roughness: 0.8,
            metalness: 0,
            emissive: 0xffffff,
            emissiveIntensity: 8.5,
            envMapIntensity: 1.0
        });
        this.ceilingMesh = new THREE.Mesh(ceilingGeo, ceilingMat);
        this.ceilingMesh.position.set(0, ceilingY, 0);
        this.ceilingMesh.receiveShadow = false;
        this.ceilingMesh.castShadow = false;
        this.roomGroup.add(this.ceilingMesh);

        this.scene.add(this.roomGroup);
    }

    /**
     * 部屋中央に発光球（エミッシブ＋弱い加算グロー）と実光源として PointLight
     */
    createCenterLightSphere() {
        this.centerLightGroup = new THREE.Group();
        const radius = 180;
        const geo = new THREE.SphereGeometry(radius, 48, 48);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x1a2028,
            emissive: 0x66ccff,
            emissiveIntensity: 6.5,
            metalness: 0.15,
            roughness: 0.35,
            envMap: this.scene.environment,
            envMapIntensity: 1.0
        });
        const sphere = new THREE.Mesh(geo, mat);
        sphere.castShadow = false;
        sphere.receiveShadow = false;
        this.centerLightGroup.add(sphere);

        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(radius * 1.4, 32, 32),
            new THREE.MeshBasicMaterial({
                color: 0x99eeff,
                transparent: true,
                opacity: 0.2,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        );
        this.centerLightGroup.add(glow);

        const pl = new THREE.PointLight(0xaaddff, 20.0, 10000, 1.45);
        pl.castShadow = false;
        this.centerLightGroup.add(pl);

        this.centerLightGroup.position.set(0, 400, 0);
        this.scene.add(this.centerLightGroup);
    }

    setupEnvironment() {
        this.pmremGenerator = new PMREMGenerator(this.renderer);
        this.pmremGenerator.compileEquirectangularShader();
        const envScene = new RoomEnvironment();
        this._roomEnvTexture = this.pmremGenerator.fromScene(envScene, 0.04).texture;
        this.scene.environment = this._roomEnvTexture;
    }

    /** Scene16 と同じ（半球・環境・平行光＋ポイント） */
    setupLights() {
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0xf4f6f8, 1.05);
        this.scene.add(hemiLight);

        const ambientLight = new THREE.AmbientLight(0xf5f6f8, 0.95);
        this.scene.add(ambientLight);

        const keyLight = new THREE.DirectionalLight(0xffffff, 2.75);
        keyLight.position.set(2000, 5000, 2000);
        keyLight.castShadow = true;

        const sSize = 8000;
        keyLight.shadow.camera.left = -sSize;
        keyLight.shadow.camera.right = sSize;
        keyLight.shadow.camera.top = sSize;
        keyLight.shadow.camera.bottom = -sSize;
        keyLight.shadow.camera.near = 100;
        keyLight.shadow.camera.far = 10000;

        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.radius = 6;
        keyLight.shadow.bias = -0.00035;

        this.scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xe8eef5, 1.35);
        fillLight.position.set(-3500, 2800, -2200);
        fillLight.castShadow = false;
        this.scene.add(fillLight);

        const pointLight = new THREE.PointLight(0xffffff, 3.4, 10000);
        pointLight.position.set(0, 1000, 0);
        pointLight.castShadow = false;
        this.scene.add(pointLight);
    }

    async setup() {
        if (this.initialized) return;
        await super.setup();

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.45;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.scene.background = new THREE.Color(0x1a1f28);
        this.scene.fog = new THREE.FogExp2(0x1c222c, 0.00009);

        if (this.camera.fov < 35 || this.camera.fov > 50) {
            this.camera.fov = 42;
        }
        this.camera.near = 12;
        this.camera.far = 12000;
        this.camera.updateProjectionMatrix();
        this.camera.position.set(0, 1000, 4500);
        this.camera.lookAt(0, 400, 0);

        this.setupEnvironment();

        this.studio = new StudioBox(this.scene, {
            envMap: this._roomEnvTexture,
            envMapIntensity: 1.0,
            useFloorTile: false,
            lightIntensity: 22.0
        });
        if (this.studio.studioBox) {
            this.studio.studioBox.visible = false;
        }
        if (this.studio.studioFloor) {
            this.studio.studioFloor.visible = false;
        }

        const textures = this.generateConcretePBRTextures(1024);
        this.buildRoom(textures);

        const sharedConcrete = this.roomGroup.children[0].material;
        this.applyEnvMapToMaterials(this.scene.environment, sharedConcrete, sharedConcrete);

        this.createCenterLightSphere();

        this.setupLights();

        if (this.calloutSystem) {
            this.calloutSystem.setScene(this.scene);
        }

        this.setupCameraParticleDistances();
        this.initPostProcessing();
        this.setParticleCount(10);
        this.initialized = true;
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;
        this.updateCamera();
        this.updateAutoFocus([this.roomGroup, this.centerLightGroup]);

        if (this.calloutSystem) {
            this.calloutSystem.update(deltaTime, this.time, this.camera, {
                autoGenerate: false,
                maxCount: 8,
                margin: 200
            });
        }
    }

    initPostProcessing() {
        if (!this.composer) {
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
        }
        if (this.useBloom) {
            this.bloomPass = new UnrealBloomPass(
                new THREE.Vector2(Math.max(64, window.innerWidth / 6), Math.max(64, window.innerHeight / 6)),
                0.14,
                0.72,
                0.68
            );
            this.composer.addPass(this.bloomPass);
        }
        if (this.useDOF) {
            this.initDOF({
                focus: 1500,
                aperture: 0.00001,
                maxblur: 0.005
            });
        }
        this.addFilmGrainIfEnabled(0.22, true);
    }

    render() {
        this.renderer.setClearColor(0x1a1f28);
        super.render();
    }

    dispose() {
        this.initialized = false;
        this.scene.fog = null;

        if (this.studio) {
            this.studio.dispose();
            this.studio = null;
        }

        if (this.centerLightGroup) {
            this.scene.remove(this.centerLightGroup);
            this.centerLightGroup.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) {
                    const m = o.material;
                    if (Array.isArray(m)) m.forEach((x) => x.dispose());
                    else m.dispose();
                }
            });
            this.centerLightGroup = null;
        }

        if (this.roomGroup) {
            this.scene.remove(this.roomGroup);
            const seenMats = new Set();
            this.roomGroup.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material && !seenMats.has(o.material)) {
                    seenMats.add(o.material);
                    const m = o.material;
                    if (m.map) m.map.dispose();
                    if (m.normalMap) m.normalMap.dispose();
                    if (m.roughnessMap) m.roughnessMap.dispose();
                    if (m.aoMap) m.aoMap.dispose();
                    m.dispose();
                }
            });
            this.roomGroup = null;
        }
        this.ceilingMesh = null;

        if (this._roomEnvTexture) {
            this._roomEnvTexture.dispose();
            this._roomEnvTexture = null;
        }
        if (this.pmremGenerator) {
            this.pmremGenerator.dispose();
            this.pmremGenerator = null;
        }
        this.scene.environment = null;

        if (this.calloutSystem) {
            this.calloutSystem.setScene(null);
        }

        super.dispose();
    }
}
