/**
 * Scene19: HDRI Sky Dome + 透明ガラスBox群
 * pure_skies からランダムに1つ選んで適用 + Scene14風の幾何学モード
 * transmission で光透過を表現したガラス風のBox
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import { Scene14Particle } from '../scene14/Scene14Particle.js';
import { getRandomPureSky } from '../../assets/pureSkiesList.js';

export class Scene19 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'Sky Dome: Pure Skies';
        this.sceneNumber = 19;
        this.kitNo = 19;
        this.initialized = false;

        this.sharedResourceManager = sharedResourceManager;
        this.useSharedResources = !!sharedResourceManager;

        this.raycaster = new THREE.Raycaster();

        this.partTypes = 1;
        this.instancesPerType = 7000;
        this.sphereCount = 7000;
        this.spawnRadius = 1200;
        this.instancedMeshManagers = [];
        this.particles = [];

        this.useDOF = true;
        this.useBloom = true;
        this.useWallCollision = true;
        this.useFilmGrain = true;
        this.useLensFlare = true;
        this.useSkyDome = true;     // HDRIスカイドームON（有効なのは19のみ）
        this.bloomPass = null;

        this.trackEffects[3] = false;
        this.trackEffects[4] = false;

        this.expandSpheres = [];
        this.useGravity = false;
        this.gravityForce = new THREE.Vector3(0, -10.0, 0);

        // Scene14風のモード管理
        this.MODE_DEFAULT = 0;
        this.MODE_GEOM_SPHERE = 1;
        this.MODE_GEOM_CUBE_FRAME = 2;
        this.MODE_GEOM_CYLINDER_V = 3;
        this.MODE_GEOM_DOUBLE_TORUS = 4;
        this.MODE_GEOM_CONE_UP = 5;
        this.MODE_GEOM_WAVE_GRID = 6;
        this.MODE_GEOM_HOURGLASS = 7;
        this.MODE_GEOM_SPIRAL_TOWER = 8;
        this.MODE_GEOM_DIAMOND = 9;
        this.MODE_GEOM_TORUS_KNOT = 10;
        this.MODE_GEOM_DNA_HELIX = 11;
        this.MODE_GEOM_SPHERE_SHELLS = 12;
        this.MODE_GEOM_SPIRAL_FLAT = 13;
        this.MODE_GEOM_GRID_3D = 14;
        this.MODE_SINGULARITY = 15;
        this.MODE_PSYCHIC_COLLAPSE = 16;
        this.MODE_GRAVITY_SHOCK = 17;
        // Scene13風の運動パターン
        this.MODE_SC13_SPIRAL = 18;
        this.MODE_SC13_TORUS = 19;
        this.MODE_SC13_WALL = 20;
        this.MODE_SC13_WAVE = 21;
        this.MODE_SC13_BLACK_HOLE = 22;
        this.MODE_SC13_PILLARS = 23;
        this.MODE_SC13_CHAOS = 24;
        this.MODE_SC13_DEFORM = 25;
        this.MODE_SC13_GRAVITY = 26;

        this.modeSequence = [
            this.MODE_GEOM_SPHERE,
            this.MODE_GEOM_CUBE_FRAME,
            this.MODE_GEOM_CYLINDER_V,
            this.MODE_GEOM_DOUBLE_TORUS,
            this.MODE_GEOM_CONE_UP,
            this.MODE_GEOM_WAVE_GRID,
            this.MODE_GEOM_HOURGLASS,
            this.MODE_GEOM_SPIRAL_TOWER,
            this.MODE_GEOM_DIAMOND,
            this.MODE_GEOM_TORUS_KNOT,
            this.MODE_GEOM_DNA_HELIX,
            this.MODE_GEOM_SPHERE_SHELLS,
            this.MODE_GEOM_SPIRAL_FLAT,
            this.MODE_GEOM_GRID_3D,
            this.MODE_SINGULARITY,
            this.MODE_PSYCHIC_COLLAPSE,
            this.MODE_GRAVITY_SHOCK,
            this.MODE_SC13_SPIRAL,
            this.MODE_SC13_TORUS,
            this.MODE_SC13_WALL,
            this.MODE_SC13_WAVE,
            this.MODE_SC13_BLACK_HOLE,
            this.MODE_SC13_PILLARS,
            this.MODE_SC13_CHAOS,
            this.MODE_SC13_DEFORM,
            this.MODE_SC13_GRAVITY,
            this.MODE_DEFAULT
        ];
        this.sequenceIndex = 0;
        this.currentMode = this.modeSequence[0];
        this.modeTimer = 0;
        this.modeInterval = 10.0;
        this.geometricTargets = new Map();
        this.springKBase = 0.15;
        this.currentVisibleCount = this.sphereCount;

        this.setScreenshotText(this.title);
    }

    handlePhase(phase) {
        super.handlePhase(phase);
        if (phase === 0) {
            this.currentMode = this.MODE_DEFAULT;
            this.modeTimer = 0;
            this.sequenceIndex = 0;
            this.particles.forEach(p => {
                p.position.set(0, 200, 0);
                p.velocity.set(0, 0, 0);
            });
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

        try {
            const skyConfig = getRandomPureSky();
            console.log('Scene19 HDRI:', skyConfig.filename || '(unknown)');
            this.selectedPureSkyConfig = skyConfig; // フレアのON/OFF用に保持
            const envMap = await this.addSkyDomeIfEnabled(skyConfig.url, {
                environmentIntensity: 1.5,
                fogColor: skyConfig.fogColor ?? 0xb5d4e8,
                fogDensity: skyConfig.fogDensity ?? 0.00008,
                sunPosition: skyConfig.sunPosition,
                sunColor: skyConfig.sunColor,
                sunIntensity: skyConfig.sunIntensity
            });
            this.createSpheres(envMap);
            this.setupShadowLight();
        } catch (e) {
            console.error('Scene19: SkyDome/HDRI load failed:', e);
            this.selectedPureSkyConfig = { useLensFlare: true, lensFlareIntensity: 0.25 };
            this.skyDomeLightConfig = { position: new THREE.Vector3(0, 5000, 8000), color: 0xaaccff, intensity: 0.5 };
            this.setupShadowLight();
            this.createSpheres(null);
        }
        this.useLensFlare = this.selectedPureSkyConfig?.useLensFlare ?? true;
        this.initPostProcessing();
        this.initialized = true;
    }

    setupShadowLight() {
        const cfg = this.skyDomeLightConfig;
        const sunLight = new THREE.DirectionalLight(
            cfg?.color ?? 0xaaccff,
            cfg?.intensity ?? 0.5
        );
        if (cfg?.position) {
            sunLight.position.copy(cfg.position);
        } else {
            sunLight.position.set(0, 5000, 8000);
        }
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
        // 軽量な透明ガラス風マテリアル（白飛びしないよう反射・clearcoat を控えめに）
        const sphereMat = new THREE.MeshPhysicalMaterial({
            color: 0xe8f0f8,
            metalness: 0,
            roughness: 0.15,
            envMap: envMap,
            envMapIntensity: 0.5,
            clearcoat: 0.35,
            clearcoatRoughness: 0.1,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });

        const manager = new InstancedMeshManager(this.scene, boxGeo, sphereMat, this.sphereCount);
        const mainMesh = manager.getMainMesh();
        mainMesh.castShadow = true;
        mainMesh.receiveShadow = true;
        mainMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            alphaTest: 0.5
        });
        this.instancedMeshManagers.push(manager);

        for (let idx = 0; idx < this.sphereCount; idx++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = Math.pow(Math.random(), 1.5) * this.spawnRadius;
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            const sizeRand = Math.random();
            let baseSize;
            if (sizeRand < 0.7) baseSize = 5 + Math.random() * 7;
            else if (sizeRand < 0.95) baseSize = 12 + Math.random() * 13;
            else baseSize = 25 + Math.random() * 20;

            const scaleX = baseSize * (0.5 + Math.random() * 1.5);
            const scaleY = baseSize * (0.5 + Math.random() * 1.5);
            const scaleZ = baseSize * (0.5 + Math.random() * 1.5);
            const scale = new THREE.Vector3(scaleX, scaleY, scaleZ);
            const radius = Math.max(scaleX, scaleY, scaleZ) * 0.5;

            const p = new Scene14Particle(x, y, z, radius, scale, 0, idx);
            p.angularVelocity.multiplyScalar(2.0);
            this.particles.push(p);

            this.instancedMeshManagers[0].setMatrixAt(idx, p.position, p.rotation, p.scale);
        }

        this.instancedMeshManagers.forEach(m => m.markNeedsUpdate());
        this.setParticleCount(this.sphereCount);
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
        const flarePos = this.skyDomeLightConfig?.position ?? new THREE.Vector3(0, 5000, 8000);
        const flareIntensity = this.selectedPureSkyConfig?.lensFlareIntensity ?? 0.25;
        this.addLensFlareIfEnabled({ position: flarePos, intensity: flareIntensity });
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;

        this.setParticleCount(this.sphereCount);
        this.currentVisibleCount = this.sphereCount;

        if (this.instancedMeshManagers.length > 0) {
            this.instancedMeshManagers.forEach(manager => {
                const mainMesh = manager.getMainMesh();
                if (mainMesh) {
                    mainMesh.count = this.instancesPerType;
                    mainMesh.instanceMatrix.needsUpdate = true;
                }
            });
        }

        this.modeTimer += deltaTime;
        if (this.modeTimer >= this.modeInterval) {
            this.modeTimer = 0;
            const oldMode = this.currentMode;
            this.sequenceIndex = (this.sequenceIndex + 1) % this.modeSequence.length;
            this.currentMode = this.modeSequence[this.sequenceIndex];

            if (this.currentMode === this.MODE_SINGULARITY || oldMode === this.MODE_GRAVITY_SHOCK) {
                this.triggerExpandEffect(100);
            } else if (this.currentMode === this.MODE_SC13_SPIRAL) {
                this.particles.forEach((p, idx) => {
                    const r = Math.random() * this.spawnRadius;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.random() * Math.PI;
                    p.position.set(
                        r * Math.sin(phi) * Math.cos(theta),
                        p.spiralHeightFactor * 5000 - 500,
                        r * Math.sin(phi) * Math.sin(theta)
                    );
                    p.velocity.set(0, 0, 0);
                });
            } else if (this.currentMode === this.MODE_SC13_GRAVITY) {
                this.particles.forEach(p => {
                    if (p.velocity.y > 0) p.velocity.y = 0;
                });
            } else {
                this.particles.forEach(p => {
                    p.velocity.add(new THREE.Vector3((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50));
                });
            }
        }

        this.updatePhysics(deltaTime);
        this.updateExpandSpheres();

        if (this.useDOF && this.bokehPass && this.instancedMeshManagers.length > 0) {
            const meshes = this.instancedMeshManagers.map(m => m.getMainMesh()).filter(m => !!m);
            this.updateAutoFocus(meshes);
        }
    }

    updatePhysics(deltaTime) {
        const visibleCount = Math.min(this.currentVisibleCount || 0, this.particles.length);
        const tempVec = new THREE.Vector3();
        const halfSize = 4950;
        const dt = deltaTime;
        const isScene13Mode = this.currentMode >= this.MODE_SC13_SPIRAL && this.currentMode <= this.MODE_SC13_GRAVITY;

        if (!isScene13Mode && this.currentMode !== this.MODE_DEFAULT && !this.geometricTargets.has(this.currentMode)) {
            this.generateGeometricTargets(this.currentMode);
        }

        const targets = isScene13Mode ? null : this.geometricTargets.get(this.currentMode);

        for (let idx = 0; idx < visibleCount; idx++) {
            const p = this.particles[idx];
            p.force.set(0, 0, 0);

            if (isScene13Mode) {
                this.applyScene13Physics(idx, p, tempVec, dt);
            } else if (this.currentMode !== this.MODE_DEFAULT && targets) {
                const targetPos = targets[idx % targets.length];
                let tx = targetPos.x + (p.isStray ? p.targetOffset.x * 0.5 : 0);
                let ty = targetPos.y + (p.isStray ? p.targetOffset.y * 0.5 : 0);
                let tz = targetPos.z + (p.isStray ? p.targetOffset.z * 0.5 : 0);

                const breatheScale = 1.0 + Math.sin(this.time * 2.0 + (idx % 10)) * 0.05;
                tx *= breatheScale;
                ty *= breatheScale;
                tz *= breatheScale;

                let springK = this.springKBase * p.strayFactor;

                if (this.currentMode === this.MODE_PSYCHIC_COLLAPSE) {
                    const pauseDuration = 3.0;
                    if (this.modeTimer < pauseDuration) {
                        springK = 0;
                        p.velocity.multiplyScalar(0.85);
                    } else {
                        const pullProgress = (this.modeTimer - pauseDuration) / (this.modeInterval - pauseDuration);
                        springK = 0.01 + pullProgress * 0.2;
                    }
                } else if (this.currentMode === this.MODE_GRAVITY_SHOCK) {
                    const explosionDuration = 1.0;
                    if (this.modeTimer < explosionDuration) {
                        springK = 0;
                        if (this.modeTimer < 0.1) {
                            const dir = p.position.clone().normalize();
                            p.velocity.add(dir.multiplyScalar(200));
                        }
                    } else {
                        springK = 0.05;
                        p.addForce(new THREE.Vector3(0, -20, 0));
                    }
                }

                tempVec.set((tx - p.position.x) * springK, (ty - p.position.y) * springK, (tz - p.position.z) * springK);
                p.addForce(tempVec);

                const centerX = 0, centerZ = 0;
                const dx = p.position.x - centerX;
                const dz = p.position.z - centerZ;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > 10) {
                    let vortexStrength = p.isStray ? 0.5 : 2.0;
                    if (this.currentMode === this.MODE_SINGULARITY) vortexStrength *= 5.0;
                    if (this.currentMode === this.MODE_PSYCHIC_COLLAPSE || this.currentMode === this.MODE_GRAVITY_SHOCK) vortexStrength *= 0.1;
                    p.addForce(new THREE.Vector3(-dz / dist * vortexStrength, 0, dx / dist * vortexStrength));
                }

                let wiggleSpeed = p.isStray ? 0.5 : 2.0;
                let wiggleStrength = p.isStray ? 3.0 : 5.0;
                if (this.currentMode === this.MODE_PSYCHIC_COLLAPSE && this.modeTimer < 3.0) wiggleStrength = 0;
                p.addForce(new THREE.Vector3(
                    Math.sin(this.time * wiggleSpeed + idx) * wiggleStrength,
                    Math.cos(this.time * (wiggleSpeed * 0.8) + idx) * wiggleStrength,
                    Math.sin(this.time * (wiggleSpeed * 0.9) + idx) * wiggleStrength
                ));
            } else {
                const tx = p.targetOffset.x;
                const ty = p.targetOffset.y + 200;
                const tz = p.targetOffset.z;
                const defSpringK = 0.001 * p.strayFactor;
                tempVec.set((tx - p.position.x) * defSpringK, (ty - p.position.y) * defSpringK, (tz - p.position.z) * defSpringK);
                p.addForce(tempVec);
            }

            p.update();
            p.velocity.multiplyScalar(isScene13Mode ? 0.95 : 0.92);

            if (this.useWallCollision) {
                if (p.position.x > halfSize) { p.position.x = halfSize; p.velocity.x *= -0.5; }
                if (p.position.x < -halfSize) { p.position.x = -halfSize; p.velocity.x *= -0.5; }
                if (p.position.y > 4500) {
                    if (this.currentMode === this.MODE_SC13_SPIRAL) {
                        p.position.y = -450;
                        p.velocity.y *= 0.1;
                    } else {
                        p.position.y = 4500;
                        p.velocity.y *= -0.5;
                    }
                }
                if (p.position.y < -450) {
                    p.position.y = -450;
                    p.velocity.y *= -0.2;
                    const rollFactor = 0.1 / (p.radius / 30);
                    p.angularVelocity.z = -p.velocity.x * rollFactor;
                    p.angularVelocity.x = p.velocity.z * rollFactor;
                }
                if (p.position.z > halfSize) { p.position.z = halfSize; p.velocity.z *= -0.5; }
                if (p.position.z < -halfSize) { p.position.z = -halfSize; p.velocity.z *= -0.5; }
            }
            p.updateRotation(deltaTime);

            this.instancedMeshManagers[0].setMatrixAt(idx, p.position, p.rotation, p.scale);
        }
        this.instancedMeshManagers.forEach(m => m.markNeedsUpdate());
    }

    /** Scene13風の運動パターン（直接力計算） */
    applyScene13Physics(idx, p, tempVec, dt) {
        const count = this.sphereCount;
        const spiralSpeed = (p.spiralSpeedFactor ?? 1.0);

        if (this.currentMode === this.MODE_SC13_SPIRAL) {
            const side = (idx % 2 === 0) ? 1 : -1;
            const rotationSpeed = 1.5;
            const radius = 800 * p.radiusOffset * p.strayRadiusOffset;
            const verticalSpeed = 15.0 * spiralSpeed;
            p.position.y += verticalSpeed * dt * 60;
            const angle = (this.time * rotationSpeed) + (p.position.y * 0.006) + (side === 1 ? 0.3 : Math.PI + 0.3) + (p.phaseOffset * 0.05);
            const targetX = Math.cos(angle) * radius;
            const targetZ = Math.sin(angle) * radius;
            p.velocity.y *= 0.9;
            const spiralSpringK = 0.05 * p.strayFactor;
            tempVec.set((targetX - p.position.x) * spiralSpringK, 0, (targetZ - p.position.z) * spiralSpringK);
            p.addForce(tempVec);
        } else if (this.currentMode === this.MODE_SC13_TORUS) {
            const mainRadius = 1200;
            const tubeRadius = 60 * p.radiusOffset * p.strayRadiusOffset;
            const theta = (idx / count) * Math.PI * 2 + (this.time * 0.2);
            const phi = (idx % 20) / 20 * Math.PI * 2 + (theta * 6.0) + (this.time * 1.5) + p.phaseOffset;
            const tx = (mainRadius + tubeRadius * Math.cos(phi)) * Math.cos(theta);
            const ty = tubeRadius * Math.sin(phi) + 300;
            const tz = (mainRadius + tubeRadius * Math.cos(phi)) * Math.sin(theta);
            const torusSpringK = 0.01 * p.strayFactor;
            tempVec.set((tx - p.position.x) * torusSpringK, (ty - p.position.y) * torusSpringK, (tz - p.position.z) * torusSpringK);
            p.addForce(tempVec);
        } else if (this.currentMode === this.MODE_SC13_WALL) {
            const cols = 200;
            const spacing = 40;
            const zOffset = p.isStray ? (p.targetOffset.z * 5.0) : (p.targetOffset.z * 0.2);
            const tx = ((idx % cols) - cols * 0.5) * spacing + p.targetOffset.x * 0.05;
            const ty = (Math.floor(idx / cols) - (count / cols) * 0.5) * spacing + 500 + p.targetOffset.y * 0.05;
            const tz = 0 + zOffset;
            const wallSpringK = 0.01 * p.strayFactor;
            tempVec.set((tx - p.position.x) * wallSpringK, (ty - p.position.y) * wallSpringK, (tz - p.position.z) * wallSpringK);
            p.addForce(tempVec);
        } else if (this.currentMode === this.MODE_SC13_WAVE) {
            const cols = Math.floor(Math.sqrt(count));
            const spacing = 5000 / cols;
            const yOffset = p.isStray ? (p.targetOffset.y * 2.0) : (p.targetOffset.y * 0.05);
            const tx = ((idx % cols) - cols * 0.5) * spacing + p.targetOffset.x * 0.05;
            const tz = (Math.floor(idx / cols) - cols * 0.5) * spacing + p.targetOffset.z * 0.05;
            const ty = Math.sin(tx * 0.001 + this.time) * Math.cos(tz * 0.001 + this.time) * 600 + 200 + yOffset;
            const waveSpringK = 0.01 * p.strayFactor;
            tempVec.set((tx - p.position.x) * waveSpringK, (ty - p.position.y) * waveSpringK, (tz - p.position.z) * waveSpringK);
            p.addForce(tempVec);
        } else if (this.currentMode === this.MODE_SC13_BLACK_HOLE) {
            if (idx % 10 < 7) {
                const radius = (idx / count) * 1200 + 50 + p.targetOffset.x * 0.5;
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
        } else if (this.currentMode === this.MODE_SC13_PILLARS) {
            const pillarIdx = idx % 5;
            const angle = (pillarIdx / 5) * Math.PI * 2;
            const pillarRadius = 1500;
            const px = Math.cos(angle) * pillarRadius;
            const pz = Math.sin(angle) * pillarRadius;
            const tx = px + (Math.sin(idx + this.time) * 100) + p.targetOffset.x * 0.5;
            const tz = pz + (Math.cos(idx + this.time) * 50) + p.targetOffset.z * 0.5;
            const ty = ((idx / 5) / (count / 5)) * 3000 - 1000 + p.targetOffset.y * 0.2;
            const pillarSpringK = 0.01 * p.strayFactor;
            tempVec.set((tx - p.position.x) * pillarSpringK, (ty - p.position.y) * pillarSpringK, (tz - p.position.z) * pillarSpringK);
            p.addForce(tempVec);
        } else if (this.currentMode === this.MODE_SC13_CHAOS) {
            const force = Math.sin(this.time * 2.0 + p.phaseOffset) * 0.5 * p.strayFactor;
            tempVec.copy(p.position).normalize().multiplyScalar(force);
            p.addForce(tempVec);
        } else if (this.currentMode === this.MODE_SC13_DEFORM) {
            const baseRadius = 600;
            const noiseSpeed = 0.5;
            const theta = (idx / count) * Math.PI * 2;
            const phi = Math.acos(2 * (idx / count) - 1);
            const nx = Math.cos(theta) * Math.sin(phi);
            const ny = Math.sin(theta) * Math.sin(phi);
            const nz = Math.cos(phi);
            const distortion = Math.sin(nx * 5.0 + this.time * noiseSpeed) * Math.cos(ny * 5.0 + this.time * noiseSpeed) * Math.sin(nz * 5.0 + this.time * noiseSpeed) * 100;
            const r = (baseRadius + distortion) * p.radiusOffset;
            const tx = nx * r;
            const ty = ny * r + 300;
            const tz = nz * r;
            const defSpringK = 0.01 * p.strayFactor;
            tempVec.set((tx - p.position.x) * defSpringK, (ty - p.position.y) * defSpringK, (tz - p.position.z) * defSpringK);
            p.addForce(tempVec);
        } else if (this.currentMode === this.MODE_SC13_GRAVITY) {
            p.velocity.multiplyScalar(0.98);
            p.addForce(this.gravityForce);
        } else {
            const tx = p.targetOffset.x;
            const ty = p.targetOffset.y + 200;
            const tz = p.targetOffset.z;
            const defSpringK = 0.0005 * p.strayFactor;
            tempVec.set((tx - p.position.x) * defSpringK, (ty - p.position.y) * defSpringK, (tz - p.position.z) * defSpringK);
            p.addForce(tempVec);
        }
    }

    generateGeometricTargets(mode) {
        const targets = [];
        const count = this.sphereCount;
        const center = new THREE.Vector3(0, 400, 0);

        switch (mode) {
            case this.MODE_GEOM_SPHERE:
                for (let i = 0; i < count; i++) {
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(2 * Math.random() - 1);
                    const r = 1000;
                    targets.push(new THREE.Vector3(
                        r * Math.sin(phi) * Math.cos(theta),
                        r * Math.sin(phi) * Math.sin(theta) + 400,
                        r * Math.cos(phi)
                    ));
                }
                break;

            case this.MODE_GEOM_CUBE_FRAME:
                for (let i = 0; i < count; i++) {
                    const edge = Math.floor(Math.random() * 12);
                    const t = Math.random();
                    const s = 1000;
                    let p = new THREE.Vector3();
                    if (edge === 0) p.set(s, s, (t - 0.5) * 2 * s);
                    else if (edge === 1) p.set(s, -s, (t - 0.5) * 2 * s);
                    else if (edge === 2) p.set(-s, s, (t - 0.5) * 2 * s);
                    else if (edge === 3) p.set(-s, -s, (t - 0.5) * 2 * s);
                    else if (edge === 4) p.set(s, (t - 0.5) * 2 * s, s);
                    else if (edge === 5) p.set(s, (t - 0.5) * 2 * s, -s);
                    else if (edge === 6) p.set(-s, (t - 0.5) * 2 * s, s);
                    else if (edge === 7) p.set(-s, (t - 0.5) * 2 * s, -s);
                    else if (edge === 8) p.set((t - 0.5) * 2 * s, s, s);
                    else if (edge === 9) p.set((t - 0.5) * 2 * s, s, -s);
                    else if (edge === 10) p.set((t - 0.5) * 2 * s, -s, s);
                    else if (edge === 11) p.set((t - 0.5) * 2 * s, -s, -s);
                    targets.push(p.add(new THREE.Vector3(0, 400, 0)));
                }
                break;

            case this.MODE_GEOM_CYLINDER_V:
                for (let i = 0; i < count; i++) {
                    const theta = Math.random() * Math.PI * 2;
                    const r = 600;
                    const h = (Math.random() - 0.5) * 2000;
                    targets.push(new THREE.Vector3(Math.cos(theta) * r, h + 400, Math.sin(theta) * r));
                }
                break;

            case this.MODE_GEOM_DOUBLE_TORUS:
                for (let i = 0; i < count; i++) {
                    const t = (i / (count / 2)) * Math.PI * 2;
                    const r = 300;
                    const R = 800;
                    const isSecond = i > count / 2;
                    const x = (R + r * Math.cos(t)) * Math.cos(t * 2);
                    const y = (R + r * Math.cos(t)) * Math.sin(t * 2) + 400;
                    const z = r * Math.sin(t);
                    if (isSecond) targets.push(new THREE.Vector3(x, z + 400, y - 400));
                    else targets.push(new THREE.Vector3(x, y, z));
                }
                break;

            case this.MODE_GEOM_CONE_UP:
                for (let i = 0; i < count; i++) {
                    const h = Math.random();
                    const r = (1.0 - h) * 1000;
                    const theta = Math.random() * Math.PI * 2;
                    targets.push(new THREE.Vector3(Math.cos(theta) * r, h * 1800 - 400, Math.sin(theta) * r));
                }
                break;

            case this.MODE_GEOM_WAVE_GRID: {
                const gridSize = Math.ceil(Math.sqrt(count));
                for (let i = 0; i < count; i++) {
                    const ix = i % gridSize;
                    const iz = Math.floor(i / gridSize);
                    const x = (ix / gridSize - 0.5) * 3000;
                    const z = (iz / gridSize - 0.5) * 3000;
                    const d = Math.sqrt(x * x + z * z);
                    const y = Math.sin(d * 0.005) * 300;
                    targets.push(new THREE.Vector3(x, y + 400, z));
                }
                break;
            }

            case this.MODE_GEOM_HOURGLASS:
                for (let i = 0; i < count; i++) {
                    const h = (Math.random() - 0.5) * 2;
                    const r = Math.abs(h) * 1000;
                    const theta = Math.random() * Math.PI * 2;
                    targets.push(new THREE.Vector3(Math.cos(theta) * r, h * 1000 + 400, Math.sin(theta) * r));
                }
                break;

            case this.MODE_GEOM_SPIRAL_TOWER:
                for (let i = 0; i < count; i++) {
                    const t = i / count;
                    const theta = t * Math.PI * 16;
                    const r = 800 * (1.0 - t * 0.5);
                    const h = t * 2000 - 600;
                    targets.push(new THREE.Vector3(Math.cos(theta) * r, h + 400, Math.sin(theta) * r));
                }
                break;

            case this.MODE_GEOM_DIAMOND:
                for (let i = 0; i < count; i++) {
                    const h = (Math.random() - 0.5) * 2;
                    const side = (1.0 - Math.abs(h)) * 1200;
                    const x = (Math.random() - 0.5) * side * 2;
                    const z = (Math.random() - 0.5) * side * 2;
                    targets.push(new THREE.Vector3(x, h * 1200 + 400, z));
                }
                break;

            case this.MODE_GEOM_TORUS_KNOT:
                for (let i = 0; i < count; i++) {
                    const t = (i / count) * Math.PI * 2;
                    const p = 2, q = 3, r = 400, R = 800;
                    const x = (R + r * Math.cos(q * t)) * Math.cos(p * t);
                    const y = (R + r * Math.cos(q * t)) * Math.sin(p * t) + 400;
                    const z = r * Math.sin(q * t);
                    const offset = new THREE.Vector3((Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100);
                    targets.push(new THREE.Vector3(x, y, z).add(offset));
                }
                break;

            case this.MODE_GEOM_DNA_HELIX:
                for (let i = 0; i < count; i++) {
                    const t = i / count;
                    const strand = i % 2 === 0 ? 0 : Math.PI;
                    const theta = t * Math.PI * 10 + strand;
                    const r = 400;
                    const h = t * 2500 - 1250;
                    let pos = new THREE.Vector3(Math.cos(theta) * r, h + 400, Math.sin(theta) * r);
                    if (Math.random() < 0.3) {
                        const lerpT = Math.random();
                        const otherPos = new THREE.Vector3(Math.cos(theta + Math.PI) * r, h + 400, Math.sin(theta + Math.PI) * r);
                        pos.lerp(otherPos, lerpT);
                    }
                    targets.push(pos);
                }
                break;

            case this.MODE_GEOM_SPHERE_SHELLS:
                for (let i = 0; i < count; i++) {
                    const layer = i % 3;
                    const r = 500 + layer * 400;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(2 * Math.random() - 1);
                    targets.push(new THREE.Vector3(
                        r * Math.sin(phi) * Math.cos(theta),
                        r * Math.sin(phi) * Math.sin(theta) + 400,
                        r * Math.cos(phi)
                    ));
                }
                break;

            case this.MODE_GEOM_SPIRAL_FLAT:
                for (let i = 0; i < count; i++) {
                    const t = i / count;
                    const theta = t * Math.PI * 20;
                    const r = t * 1500;
                    targets.push(new THREE.Vector3(Math.cos(theta) * r, 400 + (Math.random() - 0.5) * 50, Math.sin(theta) * r));
                }
                break;

            case this.MODE_GEOM_GRID_3D: {
                const sideCount = Math.ceil(Math.pow(count, 1 / 3));
                for (let i = 0; i < count; i++) {
                    const ix = i % sideCount;
                    const iy = Math.floor(i / sideCount) % sideCount;
                    const iz = Math.floor(i / (sideCount * sideCount));
                    targets.push(new THREE.Vector3(
                        (ix / sideCount - 0.5) * 2000,
                        (iy / sideCount - 0.5) * 2000 + 400,
                        (iz / sideCount - 0.5) * 2000
                    ));
                }
                break;
            }

            case this.MODE_SINGULARITY:
                for (let i = 0; i < count; i++) {
                    const r = Math.pow(Math.random(), 5.0) * 500;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.random() * Math.PI;
                    targets.push(new THREE.Vector3(
                        Math.sin(phi) * Math.cos(theta) * r,
                        Math.cos(phi) * r + 400,
                        Math.sin(phi) * Math.sin(theta) * r
                    ));
                }
                break;

            case this.MODE_PSYCHIC_COLLAPSE:
                for (let i = 0; i < count; i++) {
                    targets.push(new THREE.Vector3(0, 400, 0));
                }
                break;

            case this.MODE_GRAVITY_SHOCK:
                for (let i = 0; i < count; i++) {
                    targets.push(new THREE.Vector3(
                        (Math.random() - 0.5) * 8000,
                        -450,
                        (Math.random() - 0.5) * 8000
                    ));
                }
                break;

            default:
                for (let i = 0; i < count; i++) {
                    const r = Math.random() * 1500;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.random() * Math.PI;
                    targets.push(new THREE.Vector3(
                        Math.sin(phi) * Math.cos(theta) * r,
                        Math.cos(phi) * r + 400,
                        Math.sin(phi) * Math.sin(theta) * r
                    ));
                }
                break;
        }
        this.geometricTargets.set(mode, targets);
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
        const explosionRadius = 2000;
        const vFactor = velocity / 127.0;
        const explosionForce = 250.0 * vFactor;

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
        if (this.instancedMeshManagers) {
            this.instancedMeshManagers.forEach(m => m.dispose());
            this.instancedMeshManagers = [];
        }
        super.dispose();
    }
}
