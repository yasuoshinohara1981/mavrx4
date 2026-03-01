/**
 * Scene19: HDRI Sky Dome + 反射球体群
 * kloofendal_48d_partly_cloudy_puresky 8K HDRI + 外の世界を反射する球体
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { loadHdrCached } from '../../lib/hdrCache.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import { Scene12Particle } from '../scene12/Scene12Particle.js';
import hdriUrl from '../../assets/kloofendal_48d_partly_cloudy_puresky_8k.hdr';

export class Scene19 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'Sky Dome: Kloofendal';
        this.sceneNumber = 19;
        this.kitNo = 19;
        this.initialized = false;

        this.sharedResourceManager = sharedResourceManager;
        this.useSharedResources = !!sharedResourceManager;

        this.raycaster = new THREE.Raycaster();

        this.sphereCount = 300;
        this.spawnRadius = 500;
        this.instancedMeshManager = null;
        this.particles = [];

        this.useDOF = true;
        this.useBloom = true;
        this.useWallCollision = true;
        this.useFilmGrain = true;     // フィルムグレインON
        this.bloomPass = null;

        this.trackEffects[3] = false;
        this.trackEffects[4] = false;

        this.expandSpheres = [];
        this.useGravity = false;
        this.gravityForce = new THREE.Vector3(0, -0.8, 0);
        this.gravityTimer = 0;
        this.gravityInterval = 10.0;

        this.currentMode = 0;
        this.modeTimer = 0;
        this.modeInterval = 10.0;
        this.MODE_DEFAULT = 0;
        this.MODE_GRAVITY = 1;
        this.MODE_SWARM = 2;
        this.MODE_SNAKE = 3;
        this.MODE_VORTEX = 4;
        this.MODE_ATOM = 5;
        this.MODE_PULSE = 6;
        this.MODE_GRID_3D = 7;
        this.MODE_FIGHT = 8;
        this.MODE_RAIN = 9;

        this.setScreenshotText(this.title);
    }

    handlePhase(phase) {
        super.handlePhase(phase);
        if (phase === 0) {
            this.currentMode = this.MODE_DEFAULT;
            this.modeTimer = 0;
            this.particles.forEach(p => {
                p.position.set(0, 200, 0);
                p.velocity.set(0, 0, 0);
            });
            this.useGravity = false;
        }
    }

    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 400;
        cameraParticle.maxDistance = 3000;
        cameraParticle.minY = -450;
    }

    async setup() {
        await super.setup();

        if (this.camera) {
            this.camera.far = 20000;
            this.camera.updateProjectionMatrix();
        }

        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.showGridRuler3D = false;
        this.initGridRuler3D({
            center: { x: 0, y: 0, z: 0 },
            size: { x: 5000, y: 5000, z: 5000 },
            floorY: -498,
            floorSize: 10000,
            floorDivisions: 100,
            labelMax: 256
        });

        // HDRI読み込み
        try {
            const envMap = await loadHdrCached(hdriUrl);
            envMap.mapping = THREE.EquirectangularReflectionMapping;
            this.scene.environment = envMap;
            this.scene.environmentIntensity = 1.5;
            this.scene.background = envMap;
            this.scene.fog = new THREE.FogExp2(0xb5d4e8, 0.00008);

            this.createSpheres(envMap);
            this.setupShadowLight();
        } catch (e) {
            console.error('Scene19: HDRI load failed:', e);
            this.createSpheres(null);
        }
        this.initPostProcessing();
        this.initialized = true;
    }

    /**
     * シャドウ用のディレクショナルライト（HDRIの太陽に合わせた位置・HDRIがメイン照明）
     */
    setupShadowLight() {
        const sunLight = new THREE.DirectionalLight(0xfff5e6, 0.4);
        sunLight.position.set(3000, 8000, 5000);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 100;
        sunLight.shadow.camera.far = 15000;
        sunLight.shadow.camera.left = -4000;
        sunLight.shadow.camera.right = 4000;
        sunLight.shadow.camera.top = 4000;
        sunLight.shadow.camera.bottom = -4000;
        sunLight.shadow.bias = -0.0001;
        this.scene.add(sunLight);
    }

    createSpheres(envMap) {
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const bumpMap = this.generateBumpMap();
        const sphereMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0.05,
            roughness: 0.12,
            envMap: envMap,
            envMapIntensity: 0.6,
            clearcoat: 0.5,
            clearcoatRoughness: 0.08,
            bumpMap: bumpMap,
            bumpScale: 0.8
        });

        this.instancedMeshManager = new InstancedMeshManager(this.scene, boxGeo, sphereMat, this.sphereCount);
        const mainMesh = this.instancedMeshManager.getMainMesh();
        mainMesh.castShadow = true;
        mainMesh.receiveShadow = true;

        mainMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            alphaTest: 0.5
        });

        for (let i = 0; i < this.sphereCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = Math.pow(Math.random(), 1.5) * this.spawnRadius;
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);
            const radius = 10 + Math.pow(Math.random(), 2.0) * 50;
            const p = new Scene12Particle(x, y, z, radius);
            p.angularVelocity.multiplyScalar(2.0);
            this.particles.push(p);
            this.instancedMeshManager.setMatrixAt(i, p.position, p.rotation, radius);
        }

        this.instancedMeshManager.markNeedsUpdate();
        this.setParticleCount(this.sphereCount);
    }

    generateBumpMap() {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, size, size);

        for (let i = 0; i < 400; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 1 + Math.random() * 2;
            const isBump = Math.random() > 0.5;
            ctx.fillStyle = isBump ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        for (let i = 0; i < 40; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 8 + Math.random() * 20;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            const val = Math.random() > 0.5 ? 255 : 0;
            grad.addColorStop(0, `rgba(${val}, ${val}, ${val}, 0.25)`);
            grad.addColorStop(1, 'rgba(128, 128, 128, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    initPostProcessing() {
        if (!this.composer) {
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
        }
        if (this.useBloom) {
            this.bloomPass = new UnrealBloomPass(
                new THREE.Vector2(window.innerWidth / 4, window.innerHeight / 4), 0.2, 0.1, 1.2
            );
            this.composer.addPass(this.bloomPass);
        }
        if (this.useDOF) {
            this.initDOF({
                focus: 500,
                aperture: 0.000005,
                maxblur: 0.003
            });
        }
        this.addFilmGrainIfEnabled(0.35, false);
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;

        this.modeTimer += deltaTime;
        if (this.modeTimer >= this.modeInterval) {
            this.modeTimer = 0;
            let nextMode;
            do {
                nextMode = Math.floor(Math.random() * 10);
            } while (nextMode === this.currentMode);
            this.currentMode = nextMode;
            this.useGravity = (this.currentMode === this.MODE_GRAVITY || this.currentMode === this.MODE_RAIN);
            if (this.currentMode === this.MODE_RAIN) {
                this.particles.forEach(p => {
                    p.position.y = 1500 + Math.random() * 1000;
                    p.velocity.set(0, -10 - Math.random() * 20, 0);
                });
            } else if (this.currentMode === this.MODE_FIGHT) {
                this.particles.forEach((p, idx) => {
                    const side = (idx % 2 === 0) ? 1 : -1;
                    p.position.set(side * 800, (Math.random() - 0.5) * 500 + 200, (Math.random() - 0.5) * 1000);
                    p.velocity.set(-side * 20, 0, 0);
                });
            }
        }

        this.updatePhysics(deltaTime);
        this.updateExpandSpheres();

        if (this.useDOF && this.bokehPass && this.instancedMeshManager) {
            const mainMesh = this.instancedMeshManager.getMainMesh();
            if (mainMesh) this.updateAutoFocus([mainMesh]);
        }
    }

    updatePhysics(deltaTime) {
        const subSteps = 2;
        const dt = deltaTime / subSteps;
        const halfSize = 950;
        const tempVec = new THREE.Vector3();

        for (let s = 0; s < subSteps; s++) {
            this.particles.forEach((p, idx) => {
                if (this.currentMode === this.MODE_SWARM) {
                    const center = new THREE.Vector3(
                        Math.sin(this.time * 0.5) * 300,
                        Math.cos(this.time * 0.7) * 200 + 300,
                        Math.sin(this.time * 0.3) * 300
                    );
                    const tx = center.x + p.targetOffset.x * 0.4;
                    const ty = center.y + p.targetOffset.y * 0.4;
                    const tz = center.z + p.targetOffset.z * 0.4;
                    const springK = 0.05 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * springK, (ty - p.position.y) * springK, (tz - p.position.z) * springK);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_SNAKE) {
                    const t = this.time * 2.0 - idx * 0.1;
                    const tx = Math.sin(t) * 500;
                    const ty = Math.cos(t * 0.5) * 300 + 300;
                    const tz = Math.sin(t * 0.7) * 500;
                    const springK = 0.1 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * springK, (ty - p.position.y) * springK, (tz - p.position.z) * springK);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_VORTEX) {
                    const angle = this.time * 3.0 + p.position.y * 0.01;
                    const radius = (p.position.y + 500) * 0.3 + 100;
                    const tx = Math.cos(angle) * radius;
                    const tz = Math.sin(angle) * radius;
                    const springK = 0.08 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * springK, 0.5, (tz - p.position.z) * springK);
                    p.addForce(tempVec);
                    if (p.position.y > 1500) p.position.y = -450;
                } else if (this.currentMode === this.MODE_ATOM) {
                    const speed = 2.0;
                    const radius = 500 * p.radiusOffset;
                    const axis = idx % 3;
                    let tx = 0, ty = 200, tz = 0;
                    if (axis === 0) {
                        tx = Math.cos(this.time * speed + p.phaseOffset) * radius;
                        ty = Math.sin(this.time * speed + p.phaseOffset) * radius + 200;
                    } else if (axis === 1) {
                        ty = Math.cos(this.time * speed + p.phaseOffset) * radius + 200;
                        tz = Math.sin(this.time * speed + p.phaseOffset) * radius;
                    } else {
                        tx = Math.cos(this.time * speed + p.phaseOffset) * radius;
                        tz = Math.sin(this.time * speed + p.phaseOffset) * radius;
                    }
                    const springK = 0.06 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * springK, (ty - p.position.y) * springK, (tz - p.position.z) * springK);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_PULSE) {
                    const pulse = Math.pow(Math.sin(this.time * 2.0), 4.0);
                    const radius = (300 + pulse * 400) * p.radiusOffset;
                    const target = p.targetOffset.clone().normalize().multiplyScalar(radius);
                    const springK = 0.1 * p.strayFactor;
                    tempVec.set((target.x - p.position.x) * springK, (target.y + 300 - p.position.y) * springK, (target.z - p.position.z) * springK);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_GRID_3D) {
                    const gridCount = 7;
                    const spacing = 150;
                    const gx = idx % gridCount;
                    const gy = Math.floor(idx / gridCount) % gridCount;
                    const gz = Math.floor(idx / (gridCount * gridCount));
                    const tx = (gx - (gridCount - 1) * 0.5) * spacing;
                    const ty = (gy - (gridCount - 1) * 0.5) * spacing + 400;
                    const tz = (gz - (gridCount - 1) * 0.5) * spacing;
                    const springK = 0.15 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * springK, (ty - p.position.y) * springK, (tz - p.position.z) * springK);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_FIGHT) {
                    const side = (idx % 2 === 0) ? 1 : -1;
                    const tx = side * (Math.sin(this.time * 5.0) * 200 + 400);
                    const ty = p.targetOffset.y * 0.5 + 300;
                    const tz = p.targetOffset.z * 0.5;
                    const springK = 0.1 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * springK, (ty - p.position.y) * springK, (tz - p.position.z) * springK);
                    p.addForce(tempVec);
                } else if (this.currentMode === this.MODE_RAIN) {
                    p.addForce(this.gravityForce.clone().multiplyScalar(2.0));
                    if (p.position.y < -450) {
                        p.position.y = 1500;
                        p.velocity.y = -10 - Math.random() * 20;
                    }
                } else if (this.currentMode === this.MODE_GRAVITY) {
                    p.addForce(this.gravityForce);
                } else {
                    tempVec.copy(p.position).multiplyScalar(-0.002);
                    p.addForce(tempVec);
                }

                p.update();
                p.velocity.multiplyScalar(0.95);

                if (this.useWallCollision) {
                    if (p.position.x > halfSize) { p.position.x = halfSize; p.velocity.x *= -0.5; }
                    if (p.position.x < -halfSize) { p.position.x = -halfSize; p.velocity.x *= -0.5; }
                    if (p.position.y > 1500) { p.position.y = 1500; p.velocity.y *= -0.5; }
                    if (p.position.y < -450) {
                        p.position.y = -450;
                        p.velocity.y *= -0.2;
                        const rollFactor = 0.1 / (p.radius / 30);
                        p.angularVelocity.z = -p.velocity.x * rollFactor;
                        p.angularVelocity.x = p.velocity.z * rollFactor;
                        p.velocity.x *= 0.97;
                        p.velocity.z *= 0.97;
                    }
                    if (p.position.z > halfSize) { p.position.z = halfSize; p.velocity.z *= -0.5; }
                    if (p.position.z < -halfSize) { p.position.z = -halfSize; p.velocity.z *= -0.5; }
                }
                p.updateRotation(dt);
            });
        }

        if (this.instancedMeshManager) {
            const mainMesh = this.instancedMeshManager.getMainMesh();
            if (mainMesh) {
                this.particles.forEach((p, i) => {
                    this.instancedMeshManager.setMatrixAt(i, p.position, p.rotation, p.radius);
                });
                this.instancedMeshManager.markNeedsUpdate();
            }
        }
    }

    handleTrackNumber(trackNumber, message) {
        if (trackNumber === 6) {
            const args = message.args || [];
            const velocity = args[1] !== undefined ? args[1] : 127;
            this.triggerExpandEffect(velocity);
        }
    }

    triggerExpandEffect(velocity = 127) {
        const center = new THREE.Vector3(
            (Math.random() - 0.5) * this.spawnRadius * 0.4,
            (Math.random() - 0.5) * this.spawnRadius * 0.4,
            (Math.random() - 0.5) * this.spawnRadius * 0.4
        );
        const explosionRadius = 800;
        const vFactor = velocity / 127.0;
        const explosionForce = 40.0 * vFactor;

        this.particles.forEach(p => {
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

    reset() {
        super.reset();
    }

    dispose() {
        this.initialized = false;
        this.expandSpheres.forEach(e => {
            if (e.light) this.scene.remove(e.light);
            if (e.mesh) {
                this.scene.remove(e.mesh);
                e.mesh.geometry.dispose();
                e.mesh.material.dispose();
            }
        });
        if (this.instancedMeshManager) this.instancedMeshManager.dispose();
        this.scene.fog = null;
        this.scene.background = null;
        this.scene.environment = null;
        super.dispose();
    }
}
