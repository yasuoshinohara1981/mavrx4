/**
 * Scene22: 床・箱なし。巨大スフィア内側（暖みのある暗色金属）＋円上の金色エミッシブ管（ブルーム強め）＋暖色フォグ。
 * 飛行パーティクルは金色の立方体（InstancedMesh / BoxGeometry）。運動モード11種は独自実装。OSC トラック6。WindDebrisPoints。
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { createCosmeticSkyTextureSet } from '../../lib/cosmeticSkyTextures.js';
import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { WindDebrisPoints } from '../../lib/WindDebrisPoints.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import { Scene13Particle } from '../scene13/Scene13Particle.js';
export class Scene22 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'mathym | Xenofog';
        this.initialized = false;
        this.sceneNumber = 22;
        this.kitNo = 22;
        this.sharedResourceManager = sharedResourceManager;

        /** 巨大スフィア内側（ダークスタジオ金属）。終わりの見えない空間用 */
        this._skyDome = null;
        /** 蛍光灯管グループ（円配置・共有 geo/mat） */
        this._fluoroGroup = null;
        this._fluoroSharedGeo = null;
        this._fluoroSharedMat = null;
        /** @type {THREE.PointLight[]} */
        this._fluoroPointLights = [];
        this.pmremGenerator = null;
        this._roomEnvTexture = null;

        /** 21 と共通。他シーン互換のため残す（実際のライト強度は sceneLightingScaleEffective） */
        this.sceneLightingScale = 0.22;
        /** ライト・管のポイント用。0.22 のままだと Hemi/Amb が実質ゼロで空間が真っ黒になる */
        this.sceneLightingScaleEffective = 0.78;
        /** トーンマップ露出（空間の明るさの土台） */
        this.sceneToneMappingExposure = 1.32;

        this.useDOF = true;
        this.useBloom = true;
        /** フォグが遠景を霞に寄せすぎると暗く見えるためオフ（スカイドームで空気感は担保） */
        this.useSceneFog = false;
        /** useSceneFog 再開時用：極薄 */
        this.sceneFogDensity = 0.000025;
        /** ゴージャスCM寄り：アンバーがかった霞（暗く潰れないようやや明るめ） */
        this.sceneFogColor = 0xf0e6dc;
        /** 巨大スカイは depth 扱いで SSAO が全体を潰しやすいのでオフ */
        this.useSSAO = false;
        this.useFilmGrain = true;
        this.useAutoFocusDOF = false;
        this.bloomPass = null;
        this.ssaoPass = null;
        this.saoPass = null;
        this.aoDepthTexture = null;
        this.ssaoNearKernelRadius = 5.5;
        this.ssaoNearMinDistance = 0.024;
        this.ssaoNearMaxDistance = 0.11;
        this.ssaoFarAttenuation = 0.38;
        this.outputPass = null;

        this.trackEffects = {
            1: true,
            2: false,
            3: false,
            4: false,
            5: false,
            6: true,
            7: false,
            8: false,
            9: false
        };
        this.setScreenshotText(this.title);

        this.roomHalfW = 5000;
        this.roomHalfD = 5000;
        this.floorTopY = -498;
        this.ceilingY = 5500;

        /** Scene13 同等：インスタンス数 */
        this.sphereCount = 2500;
        this.spawnRadius = 1200;
        this.instancedMeshManager = null;
        this.particles = [];
        this.gridSize = 120;
        this.grid = new Map();
        this.expandSpheres = [];
        this.modeTimer = 0;
        this.modeInterval = 10.0;
        this.totalModeCount = 11;
        this.useGravity = false;
        this.spiralMode = false;
        this.torusMode = false;
        this.useWallCollision = true;
        this.currentVisibleCount = this.sphereCount;

        /** 以下 11 モードは旧実装から全面差し替え（番号のみ互換） */
        this.MODE_DRIFT_FIELD = 0;
        this.MODE_UPTHRUST = 1;
        this.MODE_HELIX_RAIL = 2;
        this.MODE_LEMNISCATE = 3;
        this.MODE_HONEYCOMB = 4;
        this.MODE_BEAT_INTERFERENCE = 5;
        this.MODE_BINARY_ROTATE = 6;
        this.MODE_DNA_HELIX = 7;
        this.MODE_TOROIDAL_VORTEX = 8;
        this.MODE_TRIPLE_WELL = 9;
        this.MODE_PRECESS_ORBIT = 10;

        this.currentMode = this.MODE_DRIFT_FIELD;
        this.modeHistory = new Set([this.MODE_DRIFT_FIELD]);

        /** スタジオ空気感の塵（WindDebrisPoints） */
        this._windDebris = null;

        /** Scene12 と同型ライト（参照は dispose 用） */
        /** @type {THREE.HemisphereLight | null} */
        this._hemiLight = null;
        /** @type {THREE.AmbientLight | null} */
        this._ambientLight = null;
        /** @type {THREE.DirectionalLight | null} */
        this._dirLight = null;
        /** @type {THREE.PointLight | null} */
        this._pointLight = null;

        this._tmpV = new THREE.Vector3();
        this._mat = new THREE.Matrix4();
        this._quat = new THREE.Quaternion();
        this._scale = new THREE.Vector3();
        this._centerSmoothed = new THREE.Vector3(0, 900, 0);
        this._colorTmp = new THREE.Color();
    }

    setupEnvironment() {
        this.pmremGenerator = new PMREMGenerator(this.renderer);
        this.pmremGenerator.compileEquirectangularShader();
        const envScene = new RoomEnvironment();
        // 内側ドームの金属反射が読めるよう、環境をやや強めに焼く
        this._roomEnvTexture = this.pmremGenerator.fromScene(envScene, 0.16).texture;
        this.scene.environment = this._roomEnvTexture;
    }

    /**
     * 巨大な球の内側。内側から見る前提で法線を内向きに反転（scale -1 + FrontSide）し、金属の IBL／ライトが乗るようにする。
     */
    _createSkyDome() {
        if (this._skyDome) return;
        const { map, normalMap, roughnessMap } = createCosmeticSkyTextureSet(2048, { preset: 'darkStudio' });
        const R = 42000;
        const geo = new THREE.SphereGeometry(R, 96, 64);
        geo.scale(-1, 1, 1);
        if (geo.index && geo.attributes.uv && geo.attributes.normal) {
            geo.computeTangents();
        }
        const mat = new THREE.MeshPhysicalMaterial({
            color: 0xf8efe6,
            map,
            emissiveMap: map,
            emissive: 0xfff0e0,
            emissiveIntensity: 1.25,
            normalMap,
            normalScale: new THREE.Vector2(-0.28, 0.28),
            roughnessMap,
            roughness: 0.2,
            metalness: 0.48,
            envMap: this.scene.environment,
            envMapIntensity: 3.2,
            clearcoat: 0.15,
            clearcoatRoughness: 0.18,
            side: THREE.FrontSide,
            depthWrite: true,
            fog: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        mesh.renderOrder = -1000;
        this.scene.add(mesh);
        this._skyDome = mesh;
    }

    /**
     * 金色〜アンバー系エミッシブ円柱を 6 本、円上に配置（ブルーム用の高輝度＋補助ポイントライト）。
     */
    _createFluorescentRig() {
        if (this._fluoroGroup) return;
        const L = this.sceneLightingScaleEffective ?? this.sceneLightingScale ?? 1;
        const n = 6;
        const ringR = 2280;
        const tubeH = 3600;
        const tubeR = 11;
        const yCenter = 920;
        const goldEmissive = 0xffc878;
        const goldLight = 0xffddb0;

        const geo = new THREE.CylinderGeometry(tubeR, tubeR, tubeH, 28, 1, false);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x3a2618,
            emissive: goldEmissive,
            emissiveIntensity: 28,
            metalness: 0.18,
            roughness: 0.2
        });

        const group = new THREE.Group();
        group.name = 'FluorescentRig';

        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.PI / n;
            const depthWave = Math.sin(i * 1.7) * 140 + Math.cos(i * 0.9) * 90;
            const rEff = ringR + depthWave * 0.12;
            const x = Math.cos(a) * rEff;
            const z = Math.sin(a) * rEff;
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, yCenter, z);
            group.add(mesh);

            const pl = new THREE.PointLight(goldLight, 11.5 * L, 16000, 1.75);
            pl.position.set(x, yCenter, z);
            pl.castShadow = false;
            this.scene.add(pl);
            this._fluoroPointLights.push(pl);
        }

        this.scene.add(group);
        this._fluoroGroup = group;
        this._fluoroSharedGeo = geo;
        this._fluoroSharedMat = mat;
    }

    /**
     * Hemi + Ambient + Directional + Point（Scene21 と同趣旨で影を濃く：補助弱め・主光強め）。
     * ポイントは影を落とさず、床の影が二重に薄まるのを防ぐ。
     */
    setupLights() {
        const L = this.sceneLightingScaleEffective ?? this.sceneLightingScale ?? 1;

        const hemiLight = new THREE.HemisphereLight(0xfff5e8, 0x5a4a3e, 0.52 * L);
        this.scene.add(hemiLight);
        this._hemiLight = hemiLight;

        const ambientLight = new THREE.AmbientLight(0xf8ecdd, 0.22 * L);
        this.scene.add(ambientLight);
        this._ambientLight = ambientLight;

        const directionalLight = new THREE.DirectionalLight(0xffeed8, 3.2 * L);
        directionalLight.position.set(3200, 5200, 2600);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.set(4096, 4096);
        directionalLight.shadow.radius = 2.2;
        directionalLight.shadow.bias = -0.00012;
        directionalLight.shadow.normalBias = 0.03;
        const dsh = directionalLight.shadow.camera;
        dsh.left = -7200;
        dsh.right = 7200;
        dsh.top = 7200;
        dsh.bottom = -7200;
        dsh.near = 80;
        dsh.far = 18000;
        dsh.updateProjectionMatrix();
        directionalLight.target.position.set(0, 400, -1200);
        this.scene.add(directionalLight.target);
        this.scene.add(directionalLight);
        this._dirLight = directionalLight;

        const pointLight = new THREE.PointLight(0xffe4cc, 1.35 * L, 12000);
        pointLight.position.set(0, 200, 0);
        pointLight.castShadow = false;
        this.scene.add(pointLight);
        this._pointLight = pointLight;
    }

    /**
     * ゴールド系（濃淡だけランダム）
     * @param {THREE.Color} out
     */
    _setRandomVividSphereColor(out) {
        const palette = [
            0xffd700,
            0xffc940,
            0xe6c35c,
            0xd4af37,
            0xc9a530,
            0xf0e68c,
            0xdaa520,
            0xffe066,
            0xb8860b,
            0xedc967,
            0xf4e4bc,
            0xe8c547,
            0xffec9f,
            0xcdaa3d,
            0xc5a028,
            0xffd54a
        ];
        out.setHex(palette[Math.floor(Math.random() * palette.length)]);
        out.offsetHSL(
            (Math.random() - 0.5) * 0.04,
            (Math.random() - 0.5) * 0.12,
            (Math.random() - 0.5) * 0.1
        );
        const hsl = { h: 0, s: 0, l: 0 };
        out.getHSL(hsl);
        const sat = THREE.MathUtils.clamp(hsl.s * 0.82, 0.42, 0.92);
        const light = THREE.MathUtils.clamp(hsl.l, 0.42, 0.78);
        out.setHSL(hsl.h, sat, light);
    }

    _applyEnvMapToSphereMaterial() {
        const m = this.instancedMeshManager?.getMainMesh()?.material;
        const env = this.scene?.environment;
        if (m && env) {
            m.envMap = env;
            m.needsUpdate = true;
        }
    }

    /**
     * Scene13 同等：キャンバス生成の map / bump（コンクリート風のムラと凹凸）
     */
    generateFleshTextures() {
        const size = 512;
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size;
        colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');
        cCtx.fillStyle = '#ffffff';
        cCtx.fillRect(0, 0, size, size);

        for (let i = 0; i < 60; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 5 + Math.random() * 30;
            const grad = cCtx.createRadialGradient(x, y, 0, x, y, r);
            const grayVal = 200 + Math.random() * 40;
            grad.addColorStop(0, `rgba(${grayVal}, ${grayVal}, ${grayVal}, 0.2)`);
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            cCtx.fillStyle = grad;
            cCtx.beginPath();
            cCtx.arc(x, y, r, 0, Math.PI * 2);
            cCtx.fill();
        }

        for (let i = 0; i < 200; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 0.5 + Math.random() * 1.5;
            cCtx.fillStyle = Math.random() > 0.5 ? 'rgba(60, 60, 60, 0.4)' : 'rgba(200, 200, 200, 0.4)';
            cCtx.beginPath();
            cCtx.arc(x, y, r, 0, Math.PI * 2);
            cCtx.fill();
        }

        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size;
        bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');
        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);

        bCtx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        for (let i = 0; i < 30; i++) {
            bCtx.lineWidth = 1 + Math.random() * 2;
            let x = Math.random() * size;
            let y = Math.random() * size;
            bCtx.beginPath();
            bCtx.moveTo(x, y);
            for (let j = 0; j < 8; j++) {
                x += (Math.random() - 0.5) * 60;
                y += (Math.random() - 0.5) * 60;
                bCtx.lineTo(x, y);
            }
            bCtx.stroke();
        }

        for (let i = 0; i < 100; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 5 + Math.random() * 20;
            const grad = bCtx.createRadialGradient(x, y, 0, x, y, r);
            const isUp = Math.random() > 0.3;
            const val = isUp ? 255 : 0;
            grad.addColorStop(0, `rgba(${val}, ${val}, ${val}, 0.5)`);
            grad.addColorStop(1, 'rgba(128, 128, 128, 0)');
            bCtx.fillStyle = grad;
            bCtx.beginPath();
            bCtx.arc(x, y, r, 0, Math.PI * 2);
            bCtx.fill();
        }

        const colorTex = new THREE.CanvasTexture(colorCanvas);
        colorTex.wrapS = colorTex.wrapT = THREE.RepeatWrapping;
        const bumpTex = new THREE.CanvasTexture(bumpCanvas);
        bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;

        return { map: colorTex, bumpMap: bumpTex };
    }

    createSpheres() {
        const n = this.sphereCount;
        const geo = new THREE.BoxGeometry(1, 1, 1);
        {
            const nv = geo.attributes.position.count;
            const white = new Float32Array(nv * 3);
            white.fill(1);
            geo.setAttribute('color', new THREE.BufferAttribute(white, 3));
        }
        const textures = this.generateFleshTextures();
        const mat = new THREE.MeshPhysicalMaterial({
            color: 0xfff6e8,
            map: textures.map,
            bumpMap: textures.bumpMap,
            bumpScale: 0.35,
            roughness: 0.09,
            metalness: 0.52,
            clearcoat: 0.72,
            clearcoatRoughness: 0.06,
            envMapIntensity: 2.05,
            specularIntensity: 1.15,
            fog: true,
            vertexColors: true
        });
        if (this.scene?.environment) mat.envMap = this.scene.environment;

        this.instancedMeshManager = new InstancedMeshManager(this.scene, geo, mat, n);
        const mainMesh = this.instancedMeshManager.getMainMesh();
        mainMesh.castShadow = true;
        mainMesh.receiveShadow = true;
        mainMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            alphaTest: 0.5
        });

        for (let i = 0; i < n; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = Math.pow(Math.random(), 1.5) * this.spawnRadius;
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            let worldR;
            const sizeRand = Math.random();
            if (sizeRand < 0.7) worldR = 10 + Math.random() * 10;
            else if (sizeRand < 0.95) worldR = 20 + Math.random() * 12;
            else worldR = 32 + Math.random() * 14;

            const scale = new THREE.Vector3(worldR, worldR, worldR);
            const radius = Math.max(scale.x, scale.y, scale.z) * 0.5;
            const p = new Scene13Particle(x, y, z, radius, scale);
            p.angularVelocity.multiplyScalar(2.0);
            this.particles.push(p);

            this._setRandomVividSphereColor(this._colorTmp);
            this.instancedMeshManager.setColorAt(i, this._colorTmp);
            this.instancedMeshManager.setMatrixAt(i, p.position, p.rotation, p.scale);
        }
        this.instancedMeshManager.markColorsNeedsUpdate();
        this.instancedMeshManager.markNeedsUpdate();
        this.setParticleCount(n);
    }

    updatePhysics(deltaTime) {
        const subSteps = 2;
        const dt = deltaTime / subSteps;
        const halfSize = 4950;
        const tempVec = new THREE.Vector3();
        const visibleCount = Math.min(this.currentVisibleCount || 0, this.particles.length);

        for (let s = 0; s < subSteps; s++) {
            this.grid.clear();
            for (let i = 0; i < visibleCount; i++) {
                const p = this.particles[i];
                const gx = Math.floor(p.position.x / this.gridSize);
                const gy = Math.floor(p.position.y / this.gridSize);
                const gz = Math.floor(p.position.z / this.gridSize);
                const key = (gx + 100) + (gy + 100) * 200 + (gz + 100) * 40000;
                if (!this.grid.has(key)) this.grid.set(key, []);
                this.grid.get(key).push(i);
            }

            for (let idx = 0; idx < visibleCount; idx++) {
                const p = this.particles[idx];

                if (this.currentMode === this.MODE_DRIFT_FIELD) {
                    const x = p.position.x;
                    const y = p.position.y;
                    const z = p.position.z;
                    const tt = this.time;
                    const fx =
                        Math.sin(y * 0.0011 + tt * 0.37) * Math.cos(z * 0.00085 + tt * 0.21);
                    const fy =
                        Math.sin(z * 0.001 + tt * 0.29) * Math.cos(x * 0.00092 + tt * 0.18);
                    const fz =
                        Math.sin(x * 0.00115 + tt * 0.33) * Math.cos(y * 0.00088 + tt * 0.24);
                    tempVec.set(fx, fy, fz).multiplyScalar(38 * p.strayFactor);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_UPTHRUST) {
                    p.velocity.multiplyScalar(0.97);
                    tempVec.set(0, 14 * p.strayFactor, 0);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_HELIX_RAIL) {
                    const R = 820 * p.strayRadiusOffset;
                    const pitch = 0.42;
                    const theta = idx * 0.12 + p.phaseOffset * 0.4 + this.time * 0.38;
                    const ty = (theta * pitch * 180) % 4200 - 400;
                    const tx = Math.cos(theta) * R;
                    const tz = Math.sin(theta) * R;
                    p.velocity.y *= 0.9;
                    const spiralSpringK = 0.048 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * spiralSpringK, 0, (tz - p.position.z) * spiralSpringK);
                    p.addForce(tempVec);
                    const hSpring = 0.035 * p.strayFactor;
                    tempVec.set(0, (ty - p.position.y) * hSpring, 0);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_LEMNISCATE) {
                    const t = this.time * 0.52 + idx * 0.0012 + p.phaseOffset;
                    const a = 900 * p.strayRadiusOffset;
                    const tx = (a * Math.sin(t)) / (1 + Math.sin(t) * Math.sin(t));
                    const ty = 700 + a * 0.5 * Math.sin(t) * Math.cos(t);
                    const tz = a * 0.55 * Math.sin(2 * t + 0.3);
                    const springK = 0.012 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * springK, (ty - p.position.y) * springK, (tz - p.position.z) * springK);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_HONEYCOMB) {
                    const q = idx % 56;
                    const r = Math.floor(idx / 56) % 44;
                    const size = 95;
                    const tx = size * (1.5 * q) + p.targetOffset.x * 0.04;
                    const tz = size * (0.5 * Math.sqrt(3) * q + Math.sqrt(3) * r) + p.targetOffset.z * 0.04;
                    const ty = (q * 0.12 + r * 0.09) * 55 + 520 + p.targetOffset.y * 0.05;
                    const wallSpringK = 0.011 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * wallSpringK, (ty - p.position.y) * wallSpringK, (tz - p.position.z) * wallSpringK);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_BEAT_INTERFERENCE) {
                    const w1 = 1.07;
                    const w2 = 1.19;
                    const cols = Math.floor(Math.sqrt(this.sphereCount));
                    const spacing = 4200 / cols;
                    const tx = ((idx % cols) - cols * 0.5) * spacing + p.targetOffset.x * 0.06;
                    const tz = (Math.floor(idx / cols) - cols * 0.5) * spacing + p.targetOffset.z * 0.06;
                    const ty =
                        820 +
                        Math.sin(w1 * this.time + idx * 0.07) * 520 * p.strayRadiusOffset +
                        Math.sin(w2 * this.time + idx * 0.11) * 380 * p.strayRadiusOffset;
                    const waveSpringK = 0.01 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * waveSpringK, (ty - p.position.y) * waveSpringK, (tz - p.position.z) * waveSpringK);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_BINARY_ROTATE) {
                    const t = this.time * 0.24;
                    const cx = Math.cos(t) * 780;
                    const cz = Math.sin(t) * 780;
                    const c1x = cx;
                    const c1z = cz;
                    const c2x = -cx;
                    const c2z = -cz;
                    const soft = 120;
                    const d1 = Math.hypot(p.position.x - c1x, p.position.z - c1z) + soft;
                    const d2 = Math.hypot(p.position.x - c2x, p.position.z - c2z) + soft;
                    const pull = 52000 * p.strayFactor;
                    tempVec.set(
                        ((c1x - p.position.x) * pull) / (d1 * d1) + ((c2x - p.position.x) * pull) / (d2 * d2),
                        ((900 - p.position.y) * 0.022 * p.strayFactor),
                        ((c1z - p.position.z) * pull) / (d1 * d1) + ((c2z - p.position.z) * pull) / (d2 * d2)
                    );
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_DNA_HELIX) {
                    const strand = idx % 2;
                    const along = Math.floor(idx / 2);
                    const theta = along * 0.065 + this.time * 0.48 + p.phaseOffset;
                    const R = 340 * p.strayRadiusOffset;
                    const rise = along * 2.4 - 900;
                    const tx = Math.cos(theta + strand * Math.PI) * R;
                    const tz = Math.sin(theta + strand * Math.PI) * R;
                    const ty = rise + strand * 55 + 1100;
                    const pillarSpringK = 0.0115 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * pillarSpringK, (ty - p.position.y) * pillarSpringK, (tz - p.position.z) * pillarSpringK);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_TOROIDAL_VORTEX) {
                    const xz = Math.sqrt(p.position.x * p.position.x + p.position.z * p.position.z) + 1e-4;
                    const s = 0.016 * p.strayFactor;
                    const fx = -p.position.z * s;
                    const fz = p.position.x * s;
                    const fy = Math.sin((xz - 820) * 0.0031 + this.time * 0.5) * 0.45 * p.strayFactor;
                    tempVec.set(fx, fy, fz);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_TRIPLE_WELL) {
                    const wells = [
                        [0, 900, 0],
                        [-520, 750, 420],
                        [480, 820, -380]
                    ];
                    let fx = 0;
                    let fy = 0;
                    let fz = 0;
                    for (let w = 0; w < 3; w++) {
                        const dx = wells[w][0] - p.position.x;
                        const dy = wells[w][1] - p.position.y;
                        const dz = wells[w][2] - p.position.z;
                        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 90;
                        const pull = (420 * p.strayFactor) / d;
                        fx += (dx / d) * pull;
                        fy += (dy / d) * pull;
                        fz += (dz / d) * pull;
                    }
                    tempVec.set(fx, fy, fz);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_PRECESS_ORBIT) {
                    const t = this.time * 0.44 + idx * 0.0011;
                    const pre = this.time * 0.1 + p.phaseOffset * 0.2;
                    const a = 640 * p.strayRadiusOffset;
                    const b = 400 * p.strayRadiusOffset;
                    const x0 = Math.cos(pre) * (a * Math.cos(t)) - Math.sin(pre) * (b * Math.sin(t));
                    const z0 = Math.sin(pre) * (a * Math.cos(t)) + Math.cos(pre) * (b * Math.sin(t));
                    const y0 = 920 + Math.sin(t * 2.1 + p.phaseOffset) * 220;
                    const springK = 0.012 * p.strayFactor;
                    tempVec.set((x0 - p.position.x) * springK, (y0 - p.position.y) * springK, (z0 - p.position.z) * springK);
                    p.addForce(tempVec);
                } else {
                    const tx = p.targetOffset.x;
                    const ty = p.targetOffset.y + 200;
                    const tz = p.targetOffset.z;
                    const defSpringK = 0.0005 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * defSpringK, (ty - p.position.y) * defSpringK, (tz - p.position.z) * defSpringK);
                    p.addForce(tempVec);
                }

                p.update();
                p.velocity.multiplyScalar(0.95);

                if (this.useWallCollision) {
                    if (p.position.x > halfSize) { p.position.x = halfSize; p.velocity.x *= -0.3; }
                    if (p.position.x < -halfSize) { p.position.x = -halfSize; p.velocity.x *= -0.3; }
                    if (p.position.y > 4500) {
                        if (this.currentMode === this.MODE_HELIX_RAIL) {
                            p.position.y = -450;
                            p.velocity.y *= 0.1;
                        } else {
                            p.position.y = 4500;
                            p.velocity.y *= -0.3;
                        }
                    }
                    if (p.position.y < -450) {
                        p.position.y = -450;
                        p.velocity.y *= -0.1;
                        const rollFactor = 0.05 / (p.radius / 30);
                        p.angularVelocity.z = -p.velocity.x * rollFactor;
                        p.angularVelocity.x = p.velocity.z * rollFactor;
                        p.velocity.x *= 0.98;
                        p.velocity.z *= 0.98;
                    }
                    if (p.position.z > halfSize) { p.position.z = halfSize; p.velocity.z *= -0.3; }
                    if (p.position.z < -halfSize) { p.position.z = -halfSize; p.velocity.z *= -0.3; }
                }
                p.updateRotation(dt);
            }
        }

        if (this.instancedMeshManager) {
            for (let i = 0; i < visibleCount; i++) {
                const p = this.particles[i];
                this.instancedMeshManager.setMatrixAt(i, p.position, p.rotation, p.scale);
            }
            this.instancedMeshManager.markNeedsUpdate();
        }
    }

    triggerExpandEffect(velocity = 127) {
        const center = new THREE.Vector3(
            (Math.random() - 0.5) * this.spawnRadius * 0.4,
            (Math.random() - 0.5) * this.spawnRadius * 0.4,
            (Math.random() - 0.5) * this.spawnRadius * 0.4
        );
        const explosionRadius = 2000;
        const vFactor = velocity / 127.0;
        const explosionForce = 250.0 * vFactor;

        this.particles.forEach((p) => {
            const diff = p.position.clone().sub(center);
            const dist = diff.length();
            if (dist < explosionRadius) {
                const strength = Math.pow(1.0 - dist / explosionRadius, 2.0) * explosionForce;
                p.addForce(diff.normalize().multiplyScalar(strength));
            }
        });
    }

    updateExpandSpheres() {
        const now = Date.now();
        for (let i = this.expandSpheres.length - 1; i >= 0; i--) {
            const effect = this.expandSpheres[i];
            const progress = (now - effect.startTime) / effect.duration;
            if (progress >= 1.0) {
                if (effect.light) this.scene.remove(effect.light);
                if (effect.mesh) {
                    this.scene.remove(effect.mesh);
                    effect.mesh.geometry.dispose();
                    effect.mesh.material.dispose();
                }
                this.expandSpheres.splice(i, 1);
            } else {
                if (effect.light) effect.light.intensity = effect.maxIntensity * (1.0 - Math.pow(progress, 0.5));
                if (effect.mesh) effect.mesh.scale.setScalar(1.0 - progress);
            }
        }
    }

    applyCameraModeForMovement() {
        const cp = this.cameraParticles[this.currentCameraIndex];
        if (!cp) return;
        const mode = this.currentMode;
        switch (mode) {
            case this.MODE_DRIFT_FIELD:
                cp.applyPreset('DEFAULT');
                break;
            case this.MODE_UPTHRUST:
                cp.applyPreset('LOOK_UP');
                break;
            case this.MODE_HELIX_RAIL:
                cp.applyPreset('SKY_HIGH');
                break;
            case this.MODE_LEMNISCATE:
                cp.applyPreset('WIDE_VIEW', { distance: 2900 });
                break;
            case this.MODE_HONEYCOMB:
                cp.applyPreset('FRONT_SIDE', { z: 1600, x: 3100 });
                break;
            case this.MODE_BEAT_INTERFERENCE:
                cp.applyPreset('DRONE_SURFACE', { y: -280 });
                break;
            case this.MODE_BINARY_ROTATE:
                cp.applyPreset('WIDE_VIEW', { distance: 3200 });
                break;
            case this.MODE_DNA_HELIX:
                cp.applyPreset('PILLAR_WALK');
                break;
            case this.MODE_TOROIDAL_VORTEX:
                cp.applyPreset('CHAOTIC');
                break;
            case this.MODE_TRIPLE_WELL:
                cp.applyPreset('WIDE_VIEW', { distance: 2100 });
                break;
            case this.MODE_PRECESS_ORBIT:
                cp.applyPreset('WIDE_VIEW', { distance: 2750 });
                break;
            default:
                cp.applyPreset('DEFAULT');
                break;
        }
    }

    switchCameraRandom() {
        let newIndex = this.currentCameraIndex;
        while (newIndex === this.currentCameraIndex) {
            newIndex = Math.floor(Math.random() * this.cameraParticles.length);
        }
        this.currentCameraIndex = newIndex;
        const cp = this.cameraParticles[this.currentCameraIndex];
        this.cameraParticles.forEach((p) => {
            p.minDistance = 400;
            p.maxDistance = 2000;
            p.boxMin = null;
            p.boxMax = null;
            p.maxSpeed = 8.0;
        });
        const angle1 = Math.random() * Math.PI * 2;
        const angle2 = Math.random() * Math.PI;
        const dist = 1000 + Math.random() * 2000;
        cp.position.set(
            Math.cos(angle1) * Math.sin(angle2) * dist,
            Math.sin(angle1) * Math.sin(angle2) * dist + 500,
            Math.cos(angle2) * dist
        );
        cp.applyRandomForce();
    }

    _smoothCenterFromParticles(dt) {
        const n = Math.min(this.currentVisibleCount || 0, this.particles.length);
        if (n <= 0) return;
        this._tmpV.set(0, 0, 0);
        for (let i = 0; i < n; i++) {
            this._tmpV.add(this.particles[i].position);
        }
        this._tmpV.multiplyScalar(1 / n);
        const a = 1 - Math.exp(-Math.min(dt, 0.1) * 2.8);
        this._centerSmoothed.lerp(this._tmpV, a);
    }

    async setup() {
        if (this.initialized) return;
        await super.setup();

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.shadowMap.autoUpdate = true;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        const Lexp = this.sceneLightingScale ?? 1;
        this.renderer.toneMappingExposure =
            this.sceneToneMappingExposure != null
                ? this.sceneToneMappingExposure
                : THREE.MathUtils.lerp(0.42, 0.92, Lexp);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.scene.background = new THREE.Color(0x6b5848);
        this.scene.fog = this.useSceneFog
            ? new THREE.FogExp2(this.sceneFogColor ?? 0xdfcfc2, this.sceneFogDensity ?? 0.00007)
            : null;

        this.camera.near = 12;
        this.camera.far = 65000;
        if (this.camera.fov < 35 || this.camera.fov > 50) this.camera.fov = 42;
        this.camera.updateProjectionMatrix();
        this.camera.position.set(0, 1400, 5200);
        this.camera.lookAt(0, 600, 0);

        this.setupEnvironment();

        this._createSkyDome();
        this._createFluorescentRig();

        this.setupLights();

        this.showGridRuler3D = false;
        this.initGridRuler3D({
            center: { x: 0, y: 0, z: 0 },
            size: { x: 5000, y: 5000, z: 5000 },
            floorY: -498,
            floorSize: 10000,
            floorDivisions: 48,
            labelMax: 256,
            color: 0xffffff,
            opacity: 0.55
        });

        this.createSpheres();
        this._applyEnvMapToSphereMaterial();

        this._windDebris = new WindDebrisPoints(this.camera, {
            count: 650,
            windDirection: new THREE.Vector3(0.35, 0.04, -0.12),
            windSpeed: 38,
            minSpawnRadius: 900,
            maxSpawnRadius: 3800,
            cullDistance: 12000,
            maxForwardDot: 25000,
            pointSize: 5.5,
            opacity: 0.55,
            depthTest: false
        });
        this.scene.add(this._windDebris.mesh);

        if (this.calloutSystem) this.calloutSystem.setScene(this.scene);

        this.setupCameraParticleDistances();
        this.initPostProcessing();
        this.initialized = true;
    }

    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 750;
        cameraParticle.maxDistance = 4850;
        cameraParticle.maxDistanceReset = 4500;
        cameraParticle.minY = -200;
        cameraParticle.maxY = 4500;
        cameraParticle.initializePosition?.();
    }

    updateCamera() {
        if (this.trackEffects[1] && this.cameraParticles[this.currentCameraIndex]) {
            const cp = this.cameraParticles[this.currentCameraIndex];
            this.camera.position.copy(cp.getPosition());
            this.camera.lookAt(this._centerSmoothed.x, this._centerSmoothed.y, this._centerSmoothed.z);
            this.camera.matrixWorldNeedsUpdate = false;
            return;
        }
        this.camera.lookAt(this._centerSmoothed.x, this._centerSmoothed.y, this._centerSmoothed.z);
        this.camera.matrixWorldNeedsUpdate = false;
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;

        this.currentVisibleCount = this.sphereCount;
        this.setParticleCount(this.sphereCount);
        if (this.instancedMeshManager) {
            const mainMesh = this.instancedMeshManager.getMainMesh();
            if (mainMesh) {
                mainMesh.count = this.sphereCount;
                mainMesh.instanceMatrix.needsUpdate = true;
            }
        }

        this.modeTimer += deltaTime;
        if (this.modeTimer >= this.modeInterval) {
            this.modeTimer = 0;
            const weights = [1.0, 1.2, 1.5, 1.5, 1.0, 1.0, 1.2, 1.0, 0.8, 1.5, 1.05];
            const unvisitedModes = [];
            for (let i = 0; i < this.totalModeCount; i++) {
                if (!this.modeHistory.has(i)) unvisitedModes.push(i);
            }
            let nextMode = -1;
            if (unvisitedModes.length > 0) {
                let subTotalWeight = 0;
                unvisitedModes.forEach((m) => { subTotalWeight += weights[m]; });
                let random = Math.random() * subTotalWeight;
                for (const m of unvisitedModes) {
                    if (random < weights[m]) {
                        nextMode = m;
                        break;
                    }
                    random -= weights[m];
                }
                if (nextMode === -1) nextMode = unvisitedModes[0];
            } else {
                const totalWeight = weights.reduce((a, b) => a + b, 0);
                let random = Math.random() * totalWeight;
                for (let i = 0; i < weights.length; i++) {
                    if (random < weights[i]) {
                        nextMode = i;
                        break;
                    }
                    random -= weights[i];
                }
                if (nextMode === this.currentMode) {
                    nextMode = (nextMode + 1) % this.totalModeCount;
                }
            }
            this.currentMode = nextMode;
            this.modeHistory.add(nextMode);
            if (this.modeHistory.size >= this.totalModeCount) {
                this.modeHistory.clear();
                this.modeHistory.add(this.currentMode);
            }
            this.useGravity = false;
            this.spiralMode = this.currentMode === this.MODE_HELIX_RAIL;
            this.torusMode = false;
            this.applyCameraModeForMovement();
            if (this.currentMode === this.MODE_UPTHRUST) {
                this.particles.forEach((part) => {
                    if (part.velocity.y < 0) part.velocity.y *= 0.65;
                });
            } else if (this.currentMode === this.MODE_HELIX_RAIL) {
                this.particles.forEach((p) => {
                    const rr = Math.random() * this.spawnRadius;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.random() * Math.PI;
                    p.position.set(
                        rr * Math.sin(phi) * Math.cos(theta),
                        p.spiralHeightFactor * 5000 - 500,
                        rr * Math.sin(phi) * Math.sin(theta)
                    );
                    p.velocity.set(0, 0, 0);
                });
            }
        }

        this.updatePhysics(deltaTime);
        this.updateExpandSpheres();
        this._smoothCenterFromParticles(deltaTime);
        this._windDebris?.update(deltaTime);
        this.updateCamera();

        /** Scene21 と同型：固定 DOF（オートフォーカスでピント域が狭く見えるのを防ぐ） */
        const mainInst = this.instancedMeshManager?.getMainMesh();
        const focusTargets = [mainInst, this._windDebris?.mesh].filter(Boolean);
        if (this.useAutoFocusDOF) {
            this.updateAutoFocus(focusTargets);
        } else if (this.bokehPass?.uniforms?.focus) {
            this.bokehPass.uniforms.focus.value = this.dofParams.focus;
        }
        const aoPass = this.ssaoPass || this.saoPass;
        if (aoPass) {
            const focusPos = this._centerSmoothed;
            const camDist = this.camera.position.distanceTo(focusPos);
            const nearD = 900;
            const farD = 6200;
            const t = THREE.MathUtils.clamp((camDist - nearD) / (farD - nearD), 0, 1);
            const aoScale = THREE.MathUtils.lerp(1.0, this.ssaoFarAttenuation, t);
            if ('kernelRadius' in aoPass) aoPass.kernelRadius = this.ssaoNearKernelRadius * aoScale;
            if ('minDistance' in aoPass) aoPass.minDistance = this.ssaoNearMinDistance * aoScale;
            if ('maxDistance' in aoPass) aoPass.maxDistance = this.ssaoNearMaxDistance * aoScale;
            this._syncAODepthAndCameraUniforms(aoPass);
        }

        if (this.calloutSystem) {
            this.calloutSystem.update(deltaTime, this.time, this.camera, {
                autoGenerate: false,
                maxCount: 8,
                margin: 200
            });
        }
    }

    static parseTrackNumber(trackNumber, message) {
        if (trackNumber !== undefined && trackNumber !== null && trackNumber !== '') {
            const num = typeof trackNumber === 'string' ? parseInt(trackNumber, 10) : Number(trackNumber);
            if (!Number.isNaN(num)) return num;
        }
        const addr = message && message.address;
        if (typeof addr === 'string') {
            let m = addr.match(/\/track\/(\d+)/i);
            if (!m) m = addr.match(/\/track(\d+)(?:\/|$)/i);
            if (m) return parseInt(m[1], 10);
        }
        return null;
    }

    handleTrackNumber(trackNumber, message) {
        const tn = Scene22.parseTrackNumber(trackNumber, message);
        if (tn !== 6) return;
        const args = message.args || [];
        const v1 = args[1] != null ? Number(args[1]) : NaN;
        const v0 = args[0] != null ? Number(args[0]) : NaN;
        let velocity = Number.isFinite(v1) ? v1 : Number.isFinite(v0) ? v0 : 127;
        if (!Number.isFinite(velocity) || velocity <= 0) return;
        if (this.trackEffects[6]) this.triggerExpandEffect(velocity);
    }

    initPostProcessing() {
        if (!this.composer) {
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
        }
        if (this.useSSAO && !this.ssaoPass) {
            this.ssaoPass = new SSAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
            this.ssaoPass.kernelRadius = this.ssaoNearKernelRadius;
            this.ssaoPass.minDistance = this.ssaoNearMinDistance;
            this.ssaoPass.maxDistance = this.ssaoNearMaxDistance;
            this.composer.addPass(this.ssaoPass);
            this._syncAODepthAndCameraUniforms(this.ssaoPass);
        }
        if (this.useBloom) {
            this.bloomPass = new UnrealBloomPass(
                new THREE.Vector2(Math.max(64, window.innerWidth / 6), Math.max(64, window.innerHeight / 6)),
                0.14,
                0.36,
                0.9
            );
            this.composer.addPass(this.bloomPass);
        }
        if (this.useDOF) {
            // Scene21 と同一：ミニチュア感を避けピント域を広げる
            this.initDOF({
                focus: 2100,
                aperture: 0.0000044,
                maxblur: 0.0031
            });
        }
        if (!this.outputPass) {
            this.outputPass = new OutputPass();
            this.composer.addPass(this.outputPass);
        }
        this.addFilmGrainIfEnabled(0.22, false);
    }

    _syncAODepthAndCameraUniforms(aoPass) {
        if (!aoPass) return;
        if (!this.aoDepthTexture && this.composer?.renderTarget1) {
            const size = this.renderer.getSize(new THREE.Vector2());
            const ratio = this.renderer.getPixelRatio();
            const w = Math.max(1, Math.floor(size.x * ratio));
            const h = Math.max(1, Math.floor(size.y * ratio));
            this.aoDepthTexture = new THREE.DepthTexture(w, h);
            this.aoDepthTexture.type = THREE.UnsignedIntType;
            this.aoDepthTexture.format = THREE.DepthFormat;
            this.composer.renderTarget1.depthTexture = this.aoDepthTexture;
            this.composer.renderTarget1.depthBuffer = true;
        }

        const candidateDepth =
            aoPass.beautyRenderTarget?.depthTexture ||
            aoPass.normalRenderTarget?.depthTexture ||
            aoPass.depthRenderTarget?.depthTexture ||
            this.aoDepthTexture ||
            null;

        const maybeMaterials = [
            aoPass.ssaoMaterial,
            aoPass.saoMaterial,
            aoPass.materialAO,
            aoPass.vBlurMaterial,
            aoPass.hBlurMaterial
        ];

        for (const m of maybeMaterials) {
            const u = m?.uniforms;
            if (!u) continue;
            if (u.cameraNear) u.cameraNear.value = this.camera.near;
            if (u.cameraFar) u.cameraFar.value = this.camera.far;
            if (u.tDepth && candidateDepth) u.tDepth.value = candidateDepth;
        }
    }

    onResize() {
        super.onResize();
        if (this.ssaoPass && typeof this.ssaoPass.setSize === 'function') {
            this.ssaoPass.setSize(window.innerWidth, window.innerHeight);
        }
        if (this.saoPass && typeof this.saoPass.setSize === 'function') {
            this.saoPass.setSize(window.innerWidth, window.innerHeight);
        }
        if (this.aoDepthTexture) {
            const ratio = this.renderer.getPixelRatio();
            this.aoDepthTexture.image.width = Math.max(1, Math.floor(window.innerWidth * ratio));
            this.aoDepthTexture.image.height = Math.max(1, Math.floor(window.innerHeight * ratio));
            this.aoDepthTexture.needsUpdate = true;
        }
        this._syncAODepthAndCameraUniforms(this.ssaoPass || this.saoPass);
    }

    dispose() {
        this.initialized = false;
        this.scene.fog = null;

        if (this._hemiLight) {
            this.scene.remove(this._hemiLight);
            this._hemiLight = null;
        }
        if (this._ambientLight) {
            this.scene.remove(this._ambientLight);
            this._ambientLight = null;
        }
        if (this._dirLight) {
            if (this._dirLight.target) this.scene.remove(this._dirLight.target);
            this.scene.remove(this._dirLight);
            this._dirLight = null;
        }
        if (this._pointLight) {
            this.scene.remove(this._pointLight);
            this._pointLight = null;
        }

        if (this._windDebris) {
            if (this._windDebris.mesh && this.scene) this.scene.remove(this._windDebris.mesh);
            this._windDebris.dispose();
            this._windDebris = null;
        }

        if (this.ssaoPass && this.composer) {
            const idx = this.composer.passes.indexOf(this.ssaoPass);
            if (idx !== -1) this.composer.passes.splice(idx, 1);
            this.ssaoPass = null;
        }
        if (this.saoPass && this.composer) {
            const idx = this.composer.passes.indexOf(this.saoPass);
            if (idx !== -1) this.composer.passes.splice(idx, 1);
            this.saoPass = null;
        }
        if (this.aoDepthTexture) {
            this.aoDepthTexture.dispose();
            this.aoDepthTexture = null;
        }
        if (this.outputPass && this.composer) {
            const oi = this.composer.passes.indexOf(this.outputPass);
            if (oi !== -1) this.composer.passes.splice(oi, 1);
            this.outputPass.dispose();
            this.outputPass = null;
        }
        if (this._skyDome) {
            this.scene.remove(this._skyDome);
            const sm = this._skyDome.material;
            if (sm.map) sm.map.dispose();
            if (sm.emissiveMap && sm.emissiveMap !== sm.map) sm.emissiveMap.dispose();
            if (sm.normalMap) sm.normalMap.dispose();
            if (sm.roughnessMap) sm.roughnessMap.dispose();
            sm.dispose();
            this._skyDome.geometry.dispose();
            this._skyDome = null;
        }

        for (const pl of this._fluoroPointLights) {
            this.scene.remove(pl);
        }
        this._fluoroPointLights = [];

        if (this._fluoroGroup) {
            this.scene.remove(this._fluoroGroup);
            this._fluoroGroup = null;
        }
        if (this._fluoroSharedGeo) {
            this._fluoroSharedGeo.dispose();
            this._fluoroSharedGeo = null;
        }
        if (this._fluoroSharedMat) {
            this._fluoroSharedMat.dispose();
            this._fluoroSharedMat = null;
        }

        this.expandSpheres.forEach((e) => {
            if (e.light) this.scene.remove(e.light);
            if (e.mesh) {
                this.scene.remove(e.mesh);
                e.mesh.geometry.dispose();
                e.mesh.material.dispose();
            }
        });
        this.expandSpheres = [];

        if (this.instancedMeshManager) {
            this.instancedMeshManager.dispose();
            this.instancedMeshManager = null;
        }
        this.particles = [];
        this.grid?.clear();

        if (this._roomEnvTexture) {
            this._roomEnvTexture.dispose();
            this._roomEnvTexture = null;
        }
        if (this.pmremGenerator) {
            this.pmremGenerator.dispose();
            this.pmremGenerator = null;
        }
        if (this.scene) this.scene.environment = null;

        this.bloomPass = null;
        super.dispose();
    }
}
