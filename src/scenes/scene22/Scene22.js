/**
 * Scene22: 床・壁は Scene12（StudioBox）と同一タイル＋GridRuler3D＋フォグ（密度は Scene21 と共通）。球 2500。運動モード11種（MODE_LISSAJOUS=非可換リサージュ）。OSC トラック6。WindDebrisPoints。
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { StudioBox } from '../../lib/StudioBox.js';
import { WindDebrisPoints } from '../../lib/WindDebrisPoints.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import { Scene13Particle } from '../scene13/Scene13Particle.js';

export class Scene22 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'mathym | Xenomist';
        this.initialized = false;
        this.sceneNumber = 22;
        this.kitNo = 22;
        this.sharedResourceManager = sharedResourceManager;

        this.studio = null;
        this.roomGroup = null;
        this.ceilingMesh = null;
        this.pmremGenerator = null;
        this._roomEnvTexture = null;

        /** 21 と共通。下げると露出・天井・ライトがまとめて暗くなる */
        this.sceneLightingScale = 0.22;

        this.useDOF = true;
        this.useBloom = true;
        this.useSceneFog = true;
        /** Scene21 と共通。大きいほどフォグ濃い */
        this.sceneFogDensity = 0.00015;
        /** Scene21 同系の暖かい霞 */
        this.sceneFogColor = 0xdfcfc2;
        /** Scene21 と同じく SSAO オン */
        this.useSSAO = true;
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
        this.gravityForce = new THREE.Vector3(0, -10.0, 0);
        this.modeTimer = 0;
        this.modeInterval = 10.0;
        this.totalModeCount = 11;
        this.useGravity = false;
        this.spiralMode = false;
        this.torusMode = false;
        this.useWallCollision = true;
        this.currentVisibleCount = this.sphereCount;

        this.MODE_DEFAULT = 0;
        this.MODE_GRAVITY = 1;
        this.MODE_SPIRAL = 2;
        this.MODE_TORUS = 3;
        this.MODE_WALL = 4;
        this.MODE_WAVE = 5;
        this.MODE_BLACK_HOLE = 6;
        this.MODE_PILLARS = 7;
        this.MODE_CHAOS = 8;
        this.MODE_DEFORM = 9;
        /** 非可換な周波数比のリサージュ＋二重項（螺旋・波・格子・球歪みと軌道が被らない） */
        this.MODE_LISSAJOUS = 10;

        this.currentMode = this.MODE_DEFAULT;
        this.modeHistory = new Set([this.MODE_DEFAULT]);

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

    applyEnvMapToMaterials(envMap, wallMat, floorMat) {
        wallMat.envMap = envMap;
        floorMat.envMap = envMap;
    }

    /**
     * 床・壁：Scene12 の StudioBox と同一（床は generateTileTexture(false)、壁は壁用 true）。
     */
    buildRoom() {
        const floorTextures = StudioBox.createFloorTileTextures();
        const wallTextures = StudioBox.createWallTileTextures();

        /** StudioBox 既定: roughness 0.8, metalness 0 → 床は roughness*0.3, metalness+0.2, envMapIntensity*1.3 */
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: floorTextures.map,
            bumpMap: floorTextures.bumpMap,
            bumpScale: 1.0,
            roughness: 0.8 * 0.3,
            metalness: 0.2,
            envMapIntensity: 1.0 * 1.3,
            fog: true
        });
        /** StudioBox 壁: roughness*0.5, metalness+0.1 */
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: wallTextures.map,
            bumpMap: wallTextures.bumpMap,
            bumpScale: 1.0,
            roughness: 0.8 * 0.5,
            metalness: 0.1,
            envMapIntensity: 1.0,
            fog: true
        });

        this.roomGroup = new THREE.Group();
        const hw = this.roomHalfW;
        const hd = this.roomHalfD;
        const floorTopY = this.floorTopY;
        const ceilingY = this.ceilingY;
        const wallH = ceilingY - floorTopY;
        const wallCenterY = floorTopY + wallH * 0.5;
        const slab = 24;

        const floorSize = hw * 2;
        const floorGeo = new THREE.PlaneGeometry(floorSize, floorSize);
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, floorTopY, 0);
        floor.receiveShadow = true;
        floor.castShadow = true;
        this.roomGroup.add(floor);

        const mkWall = (w, height, d, px, py, pz) => {
            const geo = new THREE.BoxGeometry(w, height, d, 1, 1, 1);
            const mesh = new THREE.Mesh(geo, wallMat);
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
            emissiveIntensity: 5.2 * (this.sceneLightingScale ?? 1),
            envMapIntensity: 1.0,
            fog: true
        });
        this.ceilingMesh = new THREE.Mesh(ceilingGeo, ceilingMat);
        this.ceilingMesh.position.set(0, ceilingY, 0);
        this.ceilingMesh.receiveShadow = false;
        this.ceilingMesh.castShadow = false;
        this.roomGroup.add(this.ceilingMesh);

        this.scene.add(this.roomGroup);
    }

    setupEnvironment() {
        this.pmremGenerator = new PMREMGenerator(this.renderer);
        this.pmremGenerator.compileEquirectangularShader();
        const envScene = new RoomEnvironment();
        this._roomEnvTexture = this.pmremGenerator.fromScene(envScene, 0.04).texture;
        this.scene.environment = this._roomEnvTexture;
    }

    /**
     * Hemi + Ambient + Directional + Point（Scene21 と同趣旨で影を濃く：補助弱め・主光強め）。
     * ポイントは影を落とさず、床の影が二重に薄まるのを防ぐ。
     */
    setupLights() {
        const L = this.sceneLightingScale ?? 1;

        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x4a4a52, 0.38 * L);
        this.scene.add(hemiLight);
        this._hemiLight = hemiLight;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.07 * L);
        this.scene.add(ambientLight);
        this._ambientLight = ambientLight;

        const directionalLight = new THREE.DirectionalLight(0xffffff, 3.4 * L);
        directionalLight.position.set(4000, 5000, 4000);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.set(4096, 4096);
        directionalLight.shadow.radius = 2.5;
        directionalLight.shadow.bias = -0.00014;
        directionalLight.shadow.normalBias = 0.028;
        const dsh = directionalLight.shadow.camera;
        dsh.left = -6200;
        dsh.right = 6200;
        dsh.top = 6200;
        dsh.bottom = -6200;
        dsh.near = 100;
        dsh.far = 15000;
        dsh.updateProjectionMatrix();
        this.scene.add(directionalLight);
        this._dirLight = directionalLight;

        const pointLight = new THREE.PointLight(0xffffff, 0.7 * L, 12000);
        pointLight.position.set(0, 200, 0);
        pointLight.castShadow = false;
        this.scene.add(pointLight);
        this._pointLight = pointLight;
    }

    /**
     * ピンク・ミント・ネオン系の色相（ベース＋微ジッター後、彩度を抑える）
     * @param {THREE.Color} out
     */
    _setRandomVividSphereColor(out) {
        const palette = [
            0xff1493,
            0xff10f0,
            0xff007f,
            0xff00aa,
            0xfe00fe,
            0xbf00ff,
            0x7fff00,
            0x39ff14,
            0x00ff9f,
            0x00ffb3,
            0x00ffcc,
            0x00ffff,
            0x00e5ff,
            0xffff00,
            0xffee00,
            0xff6600,
            0xff3366,
            0xff0099
        ];
        out.setHex(palette[Math.floor(Math.random() * palette.length)]);
        out.offsetHSL(
            (Math.random() - 0.5) * 0.07,
            (Math.random() - 0.5) * 0.12,
            (Math.random() - 0.5) * 0.1
        );
        const hsl = { h: 0, s: 0, l: 0 };
        out.getHSL(hsl);
        const sat = THREE.MathUtils.clamp(hsl.s * 0.58, 0.22, 0.72);
        out.setHSL(hsl.h, sat, hsl.l);
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
        const geo = new THREE.SphereGeometry(1, 32, 22);
        {
            const nv = geo.attributes.position.count;
            const white = new Float32Array(nv * 3);
            white.fill(1);
            geo.setAttribute('color', new THREE.BufferAttribute(white, 3));
        }
        const textures = this.generateFleshTextures();
        const mat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            map: textures.map,
            bumpMap: textures.bumpMap,
            bumpScale: 4.0,
            roughness: 0.42,
            metalness: 0.04,
            clearcoat: 0.38,
            clearcoatRoughness: 0.32,
            envMapIntensity: 0.42,
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

                if (this.currentMode === this.MODE_SPIRAL) {
                    const side = (idx % 2 === 0) ? 1 : -1;
                    const rotationSpeed = 1.5;
                    const radius = 800 * p.radiusOffset * p.strayRadiusOffset;
                    const verticalSpeed = 15.0 * p.spiralSpeedFactor;
                    p.position.y += verticalSpeed * dt * 60;
                    const angle = (this.time * rotationSpeed) + (p.position.y * 0.006) + (side === 1 ? 0.3 : Math.PI + 0.3) + (p.phaseOffset * 0.05);
                    const targetX = Math.cos(angle) * radius;
                    const targetZ = Math.sin(angle) * radius;
                    p.velocity.y *= 0.9;
                    const spiralSpringK = 0.05 * p.strayFactor;
                    tempVec.set((targetX - p.position.x) * spiralSpringK, 0, (targetZ - p.position.z) * spiralSpringK);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_TORUS) {
                    const mainRadius = 1200;
                    const tubeRadius = 60 * p.radiusOffset * p.strayRadiusOffset;
                    const theta = (idx / this.sphereCount) * Math.PI * 2 + (this.time * 0.2);
                    const phi = (idx % 20) / 20 * Math.PI * 2 + (theta * 6.0) + (this.time * 1.5) + p.phaseOffset;
                    const tx = (mainRadius + tubeRadius * Math.cos(phi)) * Math.cos(theta);
                    const ty = tubeRadius * Math.sin(phi) + 300;
                    const tz = (mainRadius + tubeRadius * Math.cos(phi)) * Math.sin(theta);
                    const torusSpringK = 0.01 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * torusSpringK, (ty - p.position.y) * torusSpringK, (tz - p.position.z) * torusSpringK);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_WALL) {
                    const cols = 200;
                    const spacing = 40;
                    const zOffset = p.isStray ? (p.targetOffset.z * 5.0) : (p.targetOffset.z * 0.2);
                    const tx = ((idx % cols) - cols * 0.5) * spacing + p.targetOffset.x * 0.05;
                    const ty = (Math.floor(idx / cols) - (this.sphereCount / cols) * 0.5) * spacing + 500 + p.targetOffset.y * 0.05;
                    const tz = 0 + zOffset;
                    const wallSpringK = 0.01 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * wallSpringK, (ty - p.position.y) * wallSpringK, (tz - p.position.z) * wallSpringK);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_WAVE) {
                    const cols = Math.floor(Math.sqrt(this.sphereCount));
                    const spacing = 5000 / cols;
                    const yOffset = p.isStray ? (p.targetOffset.y * 2.0) : (p.targetOffset.y * 0.05);
                    const tx = ((idx % cols) - cols * 0.5) * spacing + p.targetOffset.x * 0.05;
                    const tz = (Math.floor(idx / cols) - cols * 0.5) * spacing + p.targetOffset.z * 0.05;
                    const ty = Math.sin(tx * 0.001 + this.time) * Math.cos(tz * 0.001 + this.time) * 600 + 200 + yOffset;
                    const waveSpringK = 0.01 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * waveSpringK, (ty - p.position.y) * waveSpringK, (tz - p.position.z) * waveSpringK);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_BLACK_HOLE) {
                    if (idx % 10 < 7) {
                        const radius = (idx / this.sphereCount) * 1200 + 50 + p.targetOffset.x * 0.5;
                        const angle = (idx * 0.05) + (this.time * 3.0) + p.phaseOffset * 0.1;
                        const tx = Math.cos(angle) * radius;
                        const tz = Math.sin(angle) * radius;
                        const ty = (Math.sin(radius * 0.01 - this.time * 2.0) * 50) + 200 + p.targetOffset.y * 0.2;
                        const bhSpringK = 0.02 * p.strayFactor;
                        tempVec.set((tx - p.position.x) * bhSpringK, (ty - p.position.y) * bhSpringK, (tz - p.position.z) * bhSpringK);
                        p.addForce(tempVec);
                    } else {
                        const side = (idx % 2 === 0) ? 1 : -1;
                        const tx = (Math.random() - 0.5) * 40 + p.targetOffset.x * 0.1;
                        const tz = (Math.random() - 0.5) * 40 + p.targetOffset.z * 0.1;
                        const ty = side * (((idx % 100) / 100) * 4000 + 200) + p.targetOffset.y * 0.5;
                        const jetSpringK = 0.02 * p.strayFactor;
                        tempVec.set((tx - p.position.x) * jetSpringK, (ty - p.position.y) * jetSpringK, (tz - p.position.z) * jetSpringK);
                        p.addForce(tempVec);
                    }
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_PILLARS) {
                    const pillarIdx = idx % 5;
                    const angle = (pillarIdx / 5) * Math.PI * 2;
                    const pillarRadius = 1500;
                    const px = Math.cos(angle) * pillarRadius;
                    const pz = Math.sin(angle) * pillarRadius;
                    const tx = px + (Math.sin(idx + this.time) * 100) + p.targetOffset.x * 0.5;
                    const tz = pz + (Math.cos(idx + this.time) * 50) + p.targetOffset.z * 0.5;
                    const ty = ((idx / 5) / (this.sphereCount / 5)) * 3000 - 1000 + p.targetOffset.y * 0.2;
                    const pillarSpringK = 0.01 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * pillarSpringK, (ty - p.position.y) * pillarSpringK, (tz - p.position.z) * pillarSpringK);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_CHAOS) {
                    const force = Math.sin(this.time * 2.0 + p.phaseOffset) * 0.5 * p.strayFactor;
                    tempVec.copy(p.position).normalize().multiplyScalar(force);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_DEFORM) {
                    const baseRadius = 600;
                    const noiseSpeed = 0.5;
                    const theta = (idx / this.sphereCount) * Math.PI * 2;
                    const phi = Math.acos(2 * (idx / this.sphereCount) - 1);
                    const nx = Math.cos(theta) * Math.sin(phi);
                    const ny = Math.sin(theta) * Math.sin(phi);
                    const nz = Math.cos(phi);
                    const distortion = Math.sin(nx * 5.0 + this.time * noiseSpeed) *
                        Math.cos(ny * 5.0 + this.time * noiseSpeed) *
                        Math.sin(nz * 5.0 + this.time * noiseSpeed) * 100;
                    const rr = (baseRadius + distortion) * p.radiusOffset;
                    const tx = nx * rr;
                    const ty = ny * rr + 300;
                    const tz = nz * rr;
                    const springK = 0.01 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * springK, (ty - p.position.y) * springK, (tz - p.position.z) * springK);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_LISSAJOUS) {
                    const t = this.time;
                    const invPhi = 0.6180339887498949;
                    const ax = 0.29 + (idx % 137) * 0.00055;
                    const ay = 0.26 + (idx % 101) * 0.00062;
                    const az = 0.31 + (idx % 149) * 0.00048;
                    const px = p.phaseOffset * 0.92 + idx * 0.00137;
                    const py = p.phaseOffset * 0.71 + idx * 0.00103;
                    const pz = p.phaseOffset * 0.64 + idx * 0.00119;
                    const amp = 720 * p.strayRadiusOffset + 60;
                    const tx =
                        Math.sin(ax * t + px) * amp +
                        Math.sin(ax * invPhi * t + px * 1.83) * amp * 0.38;
                    const ty =
                        Math.sin(ay * t + py) * amp * 0.85 +
                        Math.cos(ay * (1.0 + invPhi) * t + py * 0.41) * amp * 0.45 +
                        720;
                    const tz =
                        Math.sin(az * t + pz) * amp +
                        Math.cos(az * invPhi * 1.7 * t + pz * 0.27) * amp * 0.4;
                    const ljSpringK = 0.0115 * p.strayFactor;
                    tempVec.set(
                        (tx - p.position.x) * ljSpringK,
                        (ty - p.position.y) * ljSpringK,
                        (tz - p.position.z) * ljSpringK
                    );
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_GRAVITY) {
                    p.velocity.multiplyScalar(0.98);
                } else {
                    const tx = p.targetOffset.x;
                    const ty = p.targetOffset.y + 200;
                    const tz = p.targetOffset.z;
                    const defSpringK = 0.0005 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * defSpringK, (ty - p.position.y) * defSpringK, (tz - p.position.z) * defSpringK);
                    p.addForce(tempVec);
                }

                if (this.currentMode === this.MODE_GRAVITY) {
                    p.addForce(this.gravityForce);
                }

                p.update();
                p.velocity.multiplyScalar(0.95);

                if (this.useWallCollision) {
                    if (p.position.x > halfSize) { p.position.x = halfSize; p.velocity.x *= -0.3; }
                    if (p.position.x < -halfSize) { p.position.x = -halfSize; p.velocity.x *= -0.3; }
                    if (p.position.y > 4500) {
                        if (this.currentMode === this.MODE_SPIRAL) {
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
            case this.MODE_GRAVITY:
                cp.applyPreset('LOOK_UP');
                break;
            case this.MODE_SPIRAL:
                cp.applyPreset('SKY_HIGH');
                break;
            case this.MODE_TORUS:
                cp.applyPreset('WIDE_VIEW', { distance: 3000 });
                break;
            case this.MODE_WALL:
                cp.applyPreset('FRONT_SIDE', { z: 1500, x: 3000 });
                break;
            case this.MODE_WAVE:
                cp.applyPreset('DRONE_SURFACE', { y: -300 });
                break;
            case this.MODE_BLACK_HOLE:
                cp.applyPreset('CORE_JET', { height: 4000 });
                break;
            case this.MODE_PILLARS:
                cp.applyPreset('PILLAR_WALK');
                break;
            case this.MODE_CHAOS:
                cp.applyPreset('CHAOTIC');
                break;
            case this.MODE_DEFORM:
                cp.applyPreset('WIDE_VIEW', { distance: 2000 });
                break;
            case this.MODE_LISSAJOUS:
                cp.applyPreset('WIDE_VIEW', { distance: 2650 });
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
        this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.42, 0.92, Lexp);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.scene.background = new THREE.Color(0x151820);
        this.scene.fog = this.useSceneFog
            ? new THREE.FogExp2(this.sceneFogColor ?? 0xdfcfc2, this.sceneFogDensity ?? 0.00015)
            : null;

        this.camera.near = 12;
        this.camera.far = 12000;
        if (this.camera.fov < 35 || this.camera.fov > 50) this.camera.fov = 42;
        this.camera.updateProjectionMatrix();
        this.camera.position.set(0, 1400, 5200);
        this.camera.lookAt(0, 600, 0);

        this.setupEnvironment();

        this.studio = new StudioBox(this.scene, {
            envMap: this._roomEnvTexture,
            envMapIntensity: 1.0,
            useFloorTile: false,
            lightIntensity: 22.0 * (this.sceneLightingScale ?? 1)
        });
        if (this.studio.studioBox) this.studio.studioBox.visible = false;

        this.buildRoom();

        const floorMat = this.roomGroup.children[0].material;
        const wallMat = this.roomGroup.children[1].material;
        this.applyEnvMapToMaterials(this.scene.environment, wallMat, floorMat);

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

        this.setupLights();
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
            this.useGravity = (this.currentMode === this.MODE_GRAVITY);
            this.spiralMode = (this.currentMode === this.MODE_SPIRAL);
            this.torusMode = (this.currentMode === this.MODE_TORUS);
            this.applyCameraModeForMovement();
            if (this.currentMode === this.MODE_GRAVITY) {
                this.particles.forEach((p) => {
                    if (p.velocity.y > 0) p.velocity.y = 0;
                });
            } else if (this.currentMode === this.MODE_SPIRAL) {
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
        const focusTargets = [this.roomGroup, mainInst, this._windDebris?.mesh].filter(Boolean);
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
                0.09,
                0.42,
                0.92
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

    render() {
        this.renderer.setClearColor(0x151820);
        super.render();
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
        if (this.studio) {
            this.studio.dispose();
            this.studio = null;
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

        if (this.roomGroup) {
            this.scene.remove(this.roomGroup);
            this.roomGroup.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) {
                    if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
                    else o.material.dispose();
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
        if (this.scene) this.scene.environment = null;

        this.bloomPass = null;
        super.dispose();
    }
}
