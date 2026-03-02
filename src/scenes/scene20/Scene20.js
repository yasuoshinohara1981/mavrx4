/**
 * Scene20: HDRI Sky Dome + 透明ガラスBox群 + ガラスクリーチャー
 * Scene19のHDRIスカイドームとガラスBox + Scene16のクリーチャー（ガラスマテリアル）
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import { Scene14Particle } from '../scene14/Scene14Particle.js';
import { Scene16Particle } from '../scene16/Scene16Particle.js';
import { RandomLFO } from '../../lib/RandomLFO.js';
import { getRandomPureSky } from '../../assets/pureSkiesList.js';

export class Scene20 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'Glass Sky: Creature';
        this.sceneNumber = 20;
        this.kitNo = 20;
        this.initialized = false;

        this.sharedResourceManager = sharedResourceManager;
        this.useSharedResources = !!sharedResourceManager;

        this.raycaster = new THREE.Raycaster();

        // Scene19: ガラスBox群（1000個、クリーチャー周辺に密集・触手に追従）
        this.partTypes = 1;
        this.instancesPerType = 1000;
        this.sphereCount = 1000;
        this.spawnRadius = 600;
        this.instancedMeshManagers = [];
        this.particles = [];

        this.useDOF = true;
        this.useBloom = true;
        this.useWallCollision = true;
        this.useFilmGrain = true;
        this.useLensFlare = true;
        this.useSkyDome = true;
        this.bloomPass = null;

        this.trackEffects[3] = false;
        this.trackEffects[4] = false;

        this.expandSpheres = [];
        this.useGravity = false;
        this.gravityForce = new THREE.Vector3(0, -10.0, 0);

        // Scene19: 幾何学モード
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
            this.MODE_GEOM_SPHERE, this.MODE_GEOM_CUBE_FRAME, this.MODE_GEOM_CYLINDER_V,
            this.MODE_GEOM_DOUBLE_TORUS, this.MODE_GEOM_CONE_UP, this.MODE_GEOM_WAVE_GRID,
            this.MODE_GEOM_HOURGLASS, this.MODE_GEOM_SPIRAL_TOWER, this.MODE_GEOM_DIAMOND,
            this.MODE_GEOM_TORUS_KNOT, this.MODE_GEOM_DNA_HELIX, this.MODE_GEOM_SPHERE_SHELLS,
            this.MODE_GEOM_SPIRAL_FLAT, this.MODE_GEOM_GRID_3D, this.MODE_SINGULARITY,
            this.MODE_PSYCHIC_COLLAPSE, this.MODE_GRAVITY_SHOCK, this.MODE_SC13_SPIRAL,
            this.MODE_SC13_TORUS, this.MODE_SC13_WALL, this.MODE_SC13_WAVE,
            this.MODE_SC13_BLACK_HOLE, this.MODE_SC13_PILLARS, this.MODE_SC13_CHAOS,
            this.MODE_SC13_DEFORM, this.MODE_SC13_GRAVITY, this.MODE_DEFAULT
        ];
        this.sequenceIndex = 0;
        this.currentMode = this.modeSequence[0];
        this.modeTimer = 0;
        this.modeInterval = 10.0;
        this.geometricTargets = new Map();
        this.springKBase = 0.15;
        this.currentVisibleCount = this.sphereCount;

        // Scene16: クリーチャー
        this.tentacleCount = 100;
        this.tentacles = [];
        this.tentacleGroup = new THREE.Group();
        this.coreMesh = null;

        this.STATE_IDLE = 0;
        this.STATE_WILD = 1;
        this.STATE_FOCUS = 2;
        this.STATE_STASIS = 3;
        this.creatureState = this.STATE_IDLE;
        this.stateTimer = 0;
        this.stateDuration = 5.0;
        this.focusTarget = new THREE.Vector3(0, 500, 1000);

        this.currentAnimParams = {
            speed: 0.08, waveFreq: 1.2, waveAmp: 40.0, focusWeight: 0.0,
            moveSpeed: 0.02, distortionSpeed: 0.03, distortionAmp: 0.2
        };
        this.targetAnimParams = { ...this.currentAnimParams };

        this.speedLFO = new RandomLFO(0.01, 0.05, 0.01, 0.08);
        this.ampLFO = new RandomLFO(0.005, 0.02, 10.0, 80.0);
        this.distortionSpeedLFO = new RandomLFO(0.01, 0.04, 0.01, 0.06);
        this.distortionAmpLFO = new RandomLFO(0.005, 0.03, 0.1, 0.5);
        this.colorCycleLFO = new RandomLFO(0.002, 0.01, 0.0, 1.0);

        this.creatureParticle = new Scene16Particle(0, 400, 0);
        this.creatureParticle.maxSpeed = 8.0;
        this.creatureParticle.maxForce = 2.0;
        this.creatureParticle.friction = 0.01;

        this.trackValues = { 5: 0, 6: 0, 7: 0 };
        this.scans = [];

        this.tempColor = new THREE.Color();
        this.tempTargetColor = new THREE.Color();
        this.tempVPos = new THREE.Vector3();
        this.tempV = new THREE.Vector3();
        this.tempNormal = new THREE.Vector3();
        this.scanColor = new THREE.Color();

        this.setScreenshotText(this.title);
    }

    handlePhase(phase) {
        super.handlePhase(phase);
        if (phase === 0) {
            this.currentMode = this.MODE_DEFAULT;
            this.modeTimer = 0;
            this.sequenceIndex = 0;
            const cp = this.creatureParticle?.position ?? { x: 0, y: 400, z: 0 };
            this.particles.forEach(p => {
                p.position.set(cp.x + p.targetOffset.x, cp.y + p.targetOffset.y, cp.z + p.targetOffset.z);
                p.velocity.set(0, 0, 0);
            });
        }
    }

    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 750;
        cameraParticle.maxDistance = 4850;
        cameraParticle.maxDistanceReset = 4500;
        cameraParticle.minY = -200;
        cameraParticle.maxY = 4500;
        cameraParticle.initializePosition?.();
    }

    handleTrackNumber(trackNumber, message) {
        const args = message.args || [];
        const velocity = args[1] || 0;
        const value = velocity / 127.0;
        const durationMs = args[2] || 500;

        if (trackNumber === 5) {
            this.trackValues[5] = value;
            if (velocity > 0) {
                const speed = 1.0 / (Math.max(100, durationMs) / 1000.0) * 0.5;
                this.scans.push({
                    progress: -0.2, speed, intensity: value, hue: Math.random()
                });
            }
        } else if (trackNumber === 6) {
            this.trackValues[6] = value;
            this.triggerExpandEffect(args[1] !== undefined ? args[1] : 127);
        } else if (trackNumber === 7) {
            this.trackValues[7] = value;
        }
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

        if (this.cameraParticle) {
            this.setupCameraParticleDistance(this.cameraParticle);
        }
        this.camera.position.set(0, 1000, 4500);
        this.camera.lookAt(0, 400, 0);

        try {
            const skyConfig = getRandomPureSky();
            console.log('Scene20 HDRI:', skyConfig.filename || '(unknown)');
            this.selectedPureSkyConfig = skyConfig;
            const envMap = await this.addSkyDomeIfEnabled(skyConfig.url, {
                environmentIntensity: 1.5,
                fogColor: skyConfig.fogColor ?? 0xb5d4e8,
                fogDensity: skyConfig.fogDensity ?? 0.00008,
                sunPosition: skyConfig.sunPosition,
                sunColor: skyConfig.sunColor,
                sunIntensity: skyConfig.sunIntensity
            });
            this.createSpheres(envMap);
            this.createTentacles(envMap);
            this.setupShadowLight();
        } catch (e) {
            console.error('Scene20: SkyDome/HDRI load failed:', e);
            this.selectedPureSkyConfig = { useLensFlare: true, lensFlareIntensity: 0.25 };
            this.createSpheres(null);
            this.createTentacles(null);
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
            const y = r * Math.sin(phi) * Math.sin(theta) + 400;
            const z = r * Math.cos(phi);

            // Scene13と同じ大きさ（触手の動きに追従）
            const sizeRand = Math.random();
            let baseSize;
            if (sizeRand < 0.7) baseSize = 5 + Math.random() * 7;
            else if (sizeRand < 0.95) baseSize = 12 + Math.random() * 8;
            else baseSize = 20 + Math.random() * 5;

            const scaleX = baseSize * (0.2 + Math.random() * 2.8);
            const scaleY = baseSize * (0.2 + Math.random() * 2.8);
            const scaleZ = baseSize * (0.2 + Math.random() * 2.8);
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

    createTentacles(envMap) {
        this.tentacleGroup.scale.set(1, 1, 1);
        this.tentacleGroup.position.set(0, 400, 0);
        this.scene.add(this.tentacleGroup);
        const tentacleCount = this.tentacleCount;
        const baseRadius = 450;

        this.time = Math.random() * 100;

        const coreGeo = new THREE.IcosahedronGeometry(baseRadius, 12);
        coreGeo.userData.initialPositions = coreGeo.attributes.position.array.slice();

        const coreColors = new Float32Array(coreGeo.attributes.position.count * 3);
        const skinColor = new THREE.Color('#ffffff');
        for (let i = 0; i < coreColors.length / 3; i++) {
            coreColors[i * 3] = skinColor.r;
            coreColors[i * 3 + 1] = skinColor.g;
            coreColors[i * 3 + 2] = skinColor.b;
        }
        coreGeo.setAttribute('color', new THREE.BufferAttribute(coreColors, 3));

        const coreMat = new THREE.MeshPhysicalMaterial({
            color: 0xe8f0f8,
            metalness: 0,
            roughness: 0.15,
            envMap: envMap,
            envMapIntensity: 0.5,
            clearcoat: 0.35,
            clearcoatRoughness: 0.1,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            vertexColors: true
        });
        this.coreMesh = new THREE.Mesh(coreGeo, coreMat);
        this.coreMesh.castShadow = true;
        this.coreMesh.receiveShadow = true;
        this.tentacleGroup.add(this.coreMesh);

        for (let i = 0; i < tentacleCount; i++) {
            const points = [];
            const clusterSeed = Math.floor(i / 20);
            const clusterPhi = (Math.sin(clusterSeed * 1.8) * 0.5 + 0.5) * Math.PI * 2;
            const clusterTheta = (Math.cos(clusterSeed * 2.5) * 0.5 + 0.5) * Math.PI;
            const clusterWeight = 0.5;
            const randomSpread = 2.8;
            const phi = clusterPhi * clusterWeight + (Math.random() - 0.5) * randomSpread + (i / tentacleCount) * Math.PI * 0.3;
            const theta = clusterTheta * clusterWeight + (Math.random() - 0.5) * randomSpread + (i / tentacleCount) * Math.PI * 0.2;

            const baseThickness = 12 + Math.pow(Math.random(), 2.0) * 60;
            const r = baseRadius + 400;

            const rebellionFactor = Math.random() > 0.8 ? 1.0 : 0.0;
            const coilDirection = Math.random() > 0.5 ? 1.0 : -1.0;

            const startPoint = new THREE.Vector3(
                baseRadius * 0.1 * Math.sin(theta) * Math.cos(phi),
                baseRadius * 0.1 * Math.cos(theta),
                baseRadius * 0.1 * Math.sin(theta) * Math.sin(phi)
            );
            points.push(startPoint);

            const midDist = baseRadius * 0.5;
            const midPoint = new THREE.Vector3(
                midDist * Math.sin(theta + (Math.random() - 0.5) * 0.5) * Math.cos(phi + (Math.random() - 0.5) * 0.5),
                midDist * Math.cos(theta + (Math.random() - 0.5) * 0.5),
                midDist * Math.sin(theta + (Math.random() - 0.5) * 0.5) * Math.sin(phi + (Math.random() - 0.5) * 0.5)
            );
            points.push(midPoint);
            points.push(new THREE.Vector3(
                r * Math.sin(theta) * Math.cos(phi),
                r * Math.cos(theta),
                r * Math.sin(theta) * Math.sin(phi)
            ));

            const curve = new THREE.CatmullRomCurve3(points);
            const geometry = new THREE.TubeGeometry(curve, 64, baseThickness, 12, false);
            geometry.computeBoundingSphere();

            const tentacleColors = new Float32Array(geometry.attributes.position.count * 3);
            for (let j = 0; j < tentacleColors.length / 3; j++) {
                tentacleColors[j * 3] = skinColor.r;
                tentacleColors[j * 3 + 1] = skinColor.g;
                tentacleColors[j * 3 + 2] = skinColor.b;
            }
            geometry.setAttribute('color', new THREE.BufferAttribute(tentacleColors, 3));

            const posAttr = geometry.attributes.position;
            const vertex = new THREE.Vector3();
            for (let s = 0; s <= 64; s++) {
                const t = s / 64;
                const taperScale = Math.max(0.01, 1.0 - Math.pow(t, 2.5));
                const pathPoint = curve.getPointAt(t);
                for (let rIdx = 0; rIdx <= 12; rIdx++) {
                    const idx = s * 13 + rIdx;
                    if (idx < posAttr.count) {
                        vertex.fromBufferAttribute(posAttr, idx);
                        vertex.sub(pathPoint).multiplyScalar(taperScale).add(pathPoint);
                        posAttr.setXYZ(idx, vertex.x, vertex.y, vertex.z);
                    }
                }
            }
            const basePositions = geometry.attributes.position.array.slice();
            const mesh = this.createTentacleMesh(geometry, envMap);
            this.tentacleGroup.add(mesh);
            this.tentacles.push({ mesh, curve, basePositions, phi, theta, baseRadius, baseThickness, rebellionFactor, coilDirection });
        }
        this.tentacleGroup.position.set(0, 400, 0);
        this.setParticleCount(this.tentacles.length);
    }

    createTentacleMesh(geometry, envMap) {
        const material = new THREE.MeshPhysicalMaterial({
            color: 0xe8f0f8,
            metalness: 0,
            roughness: 0.15,
            envMap: envMap,
            envMapIntensity: 0.5,
            clearcoat: 0.35,
            clearcoatRoughness: 0.1,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            vertexColors: true
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    initPostProcessing() {
        if (!this.composer) {
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
        }
        const passesToRemove = this.composer.passes.filter(p => p instanceof UnrealBloomPass);
        passesToRemove.forEach(p => this.composer.removePass(p));

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth / 4, window.innerHeight / 4), 0.2, 0.1, 1.2
        );
        this.composer.addPass(this.bloomPass);

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

    updateCamera() {
        if (this.cameraParticles[this.currentCameraIndex] && this.creatureParticle) {
            const cp = this.cameraParticles[this.currentCameraIndex];
            const cameraPos = cp.getPosition();

            const dist = cameraPos.length();
            if (dist < cp.minDistance) {
                cameraPos.normalize().multiplyScalar(cp.minDistance);
            }

            this.camera.position.copy(cameraPos);
            this.camera.lookAt(this.creatureParticle.position.x, this.creatureParticle.position.y, this.creatureParticle.position.z);
            this.camera.matrixWorldNeedsUpdate = false;
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

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;
        this.stateTimer += deltaTime;

        // クリーチャー位置を先に更新（パーティクルが追従するため）
        this.creatureParticle.update(deltaTime);
        const homePos = new THREE.Vector3(0, 400, 0);
        const distToHome = this.creatureParticle.position.distanceTo(homePos);
        const maxRadius = 1500.0;
        if (distToHome > maxRadius) {
            const pullStrength = (distToHome - maxRadius) * 0.1;
            const steer = homePos.clone().sub(this.creatureParticle.position).normalize().multiplyScalar(pullStrength);
            this.creatureParticle.addForce(steer);
        }
        if (this.creatureParticle.velocity.length() < 0.5) {
            const gentleForce = new THREE.Vector3(
                (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2
            ).normalize().multiplyScalar(0.2);
            this.creatureParticle.addForce(gentleForce);
        }
        this.tentacleGroup.position.set(this.creatureParticle.position.x, this.creatureParticle.position.y, this.creatureParticle.position.z);

        // Scene19: ガラスBox群の更新
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
                const cp = this.creatureParticle.position;
                this.particles.forEach((p, idx) => {
                    const r = Math.random() * this.spawnRadius;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.random() * Math.PI;
                    p.position.set(
                        cp.x + r * Math.sin(phi) * Math.cos(theta),
                        cp.y + p.spiralHeightFactor * 5000 - 500 - 400,
                        cp.z + r * Math.sin(phi) * Math.sin(theta)
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

        // Scene16: クリーチャー更新
        this.speedLFO.update(deltaTime);
        this.ampLFO.update(deltaTime);
        this.distortionSpeedLFO.update(deltaTime);
        this.distortionAmpLFO.update(deltaTime);
        this.colorCycleLFO.update(deltaTime);

        const baseSpeed = this.speedLFO.getValue();
        const baseAmp = this.ampLFO.getValue();
        const baseDistortionSpeed = this.distortionSpeedLFO.getValue();
        const baseDistortionAmp = this.distortionAmpLFO.getValue();

        if (this.stateTimer >= this.stateDuration) {
            this.stateTimer = 0;
            this.creatureState = Math.floor(Math.random() * 4);
            this.stateDuration = 10.0 + Math.random() * 15.0;
            if (this.creatureState === this.STATE_FOCUS) {
                this.focusTarget.copy(this.camera.position).add(new THREE.Vector3((Math.random() - 0.5) * 1500, (Math.random() - 0.5) * 800, (Math.random() - 0.5) * 1500));
            }
            if (!this.stateMultipliers) this.stateMultipliers = { speed: 1.0, amp: 1.0 };
            switch (this.creatureState) {
                case this.STATE_IDLE: this.stateMultipliers.targetSpeed = 0.5; this.stateMultipliers.targetAmp = 0.8; break;
                case this.STATE_WILD: this.stateMultipliers.targetSpeed = 1.2; this.stateMultipliers.targetAmp = 1.5; break;
                case this.STATE_FOCUS: this.stateMultipliers.targetSpeed = 0.8; this.stateMultipliers.targetAmp = 0.6; break;
                case this.STATE_STASIS: this.stateMultipliers.targetSpeed = 0.2; this.stateMultipliers.targetAmp = 0.3; break;
            }
        }

        if (!this.stateMultipliers) this.stateMultipliers = { speed: 1.0, amp: 1.0, targetSpeed: 1.0, targetAmp: 1.0 };
        const multiplierLerp = deltaTime * 0.3;
        this.stateMultipliers.speed += (this.stateMultipliers.targetSpeed - this.stateMultipliers.speed) * multiplierLerp;
        this.stateMultipliers.amp += (this.stateMultipliers.targetAmp - this.stateMultipliers.amp) * multiplierLerp;

        const targetTrack6Force = (this.trackEffects[6]) ? (this.trackValues[6] || 0) : 0;
        if (this.smoothTrack6Force === undefined) this.smoothTrack6Force = 0;
        this.smoothTrack6Force += (targetTrack6Force - this.smoothTrack6Force) * deltaTime * 2.0;
        const track6Force = this.smoothTrack6Force;

        const targetTrack7Color = (this.trackEffects[7]) ? (this.trackValues[7] || 0) : 0;
        if (this.smoothTrack7Color === undefined) this.smoothTrack7Color = 0;
        const colorLerpSpeed = targetTrack7Color > 0 ? 3.0 : 0.3;
        this.smoothTrack7Color += (targetTrack7Color - this.smoothTrack7Color) * deltaTime * colorLerpSpeed;
        const track7Color = this.smoothTrack7Color;

        const timeAcceleration = 1.0 + track6Force * 1.5;
        this.time += deltaTime * (timeAcceleration - 1.0);

        this.targetAnimParams.speed = baseSpeed * this.stateMultipliers.speed;
        this.targetAnimParams.waveAmp = baseAmp * this.stateMultipliers.amp;
        this.targetAnimParams.distortionSpeed = baseDistortionSpeed;
        this.targetAnimParams.distortionAmp = baseDistortionAmp;

        const lerpFactor = deltaTime * 0.5;
        for (let key in this.currentAnimParams) {
            this.currentAnimParams[key] += (this.targetAnimParams[key] - this.currentAnimParams[key]) * lerpFactor;
        }

        const heartbeat = Math.pow(Math.sin(this.time * 1.0), 8.0);
        if (this.smoothSizeLFO === undefined) this.smoothSizeLFO = baseSpeed;
        this.smoothSizeLFO += (baseSpeed - this.smoothSizeLFO) * deltaTime * 0.5;
        const coreBaseScale = 1.0 + Math.sin(this.time * 0.05 + this.smoothSizeLFO) * 0.05;
        const scale = coreBaseScale + heartbeat * 0.03;
        this.tentacleGroup.scale.set(scale, scale, scale);

        if (this.cameraParticles) {
            this.cameraParticles.forEach(cp => {
                const currentCoreRadius = 450 * scale;
                cp.minDistance = Math.min(currentCoreRadius + 750, 2750);
                cp.maxDistance = 4850;
                if (cp.target) cp.target.copy(this.tentacleGroup.position);
            });
        }

        const velocity = this.creatureParticle.velocity.clone();
        const rotationSpeed = this.creatureState === this.STATE_FOCUS ? 0.02 : 0.08;
        this.tentacleGroup.rotation.y += deltaTime * rotationSpeed;
        this.tentacleGroup.rotation.x += deltaTime * (rotationSpeed * 0.3);

        const pointingWeight = Math.max(0, Math.sin(this.time * 0.1) * 2.0 - 1.0);
        const coilWeight = Math.max(0, Math.cos(this.time * 0.08) * 2.0 - 1.0);
        const entwineWeight = Math.max(0, Math.sin(this.time * 0.05) * 1.5 - 0.5);
        const upwardWeight = Math.max(0, Math.cos(this.time * 0.06) * 2.0 - 1.0);

        let smoothPhase;
        if (this.actualTick === 0 && this.phase === 0) {
            smoothPhase = (this.time % 60.0) / 60.0 * 12.0;
        } else {
            const totalTicks = 36864;
            const currentTick = this.actualTick % totalTicks;
            smoothPhase = (currentTick / totalTicks) * 12.0;
        }

        let globalGrowthProgress = 0;
        if (smoothPhase <= 6) globalGrowthProgress = Math.min(1.0, smoothPhase / 6.0);
        else if (smoothPhase <= 8) globalGrowthProgress = 1.0;
        else globalGrowthProgress = Math.max(0, 1.0 - (smoothPhase - 8) / 4.0);

        const growthOverlap = 50.0;
        const totalGrowthSteps = this.tentacleCount + growthOverlap;
        const currentGrowthStep = globalGrowthProgress * totalGrowthSteps;

        const commonTarget = new THREE.Vector3(
            Math.sin(this.time * 0.3) * 1000,
            Math.cos(this.time * 0.2) * 800,
            Math.sin(this.time * 0.4) * 1000
        );

        const skinColor = new THREE.Color(1, 1, 1);
        const baseCycle = this.colorCycleLFO.getValue();
        const grayVal = 0.2 + (baseCycle * 0.7);
        const targetSkinColor = new THREE.Color(grayVal, grayVal, grayVal);
        skinColor.lerp(targetSkinColor, track7Color * 0.5);

        const { speed, waveFreq, waveAmp, focusWeight, distortionSpeed, distortionAmp } = this.currentAnimParams;
        const totalForce = 1.0 + track6Force * 2.0;

        const getElevationHeatColor = (vPos, baseColor, time, region = 0, u = 0) => {
            const noiseScale = 0.003;
            const elevation1 = (
                Math.sin(vPos.x * noiseScale + time * 0.25) *
                Math.cos(vPos.y * noiseScale + time * 0.35) *
                Math.sin(vPos.z * noiseScale + time * 0.2)
            );
            const elevation2 = (
                Math.sin(vPos.x * noiseScale * 1.5 - time * 0.4) *
                Math.cos(vPos.y * noiseScale * 1.5 + time * 0.5)
            ) * 0.4;
            const elevation3 = (Math.sin(vPos.z * noiseScale * 2.0 + time * 0.8)) * 0.2;
            const totalElevation = (elevation1 + elevation2 + elevation3) * 0.5 + 0.5;
            const steps = 64.0;
            const steppedElevation = Math.floor(totalElevation * steps) / steps;
            const colorShiftSpeed = 0.2;
            const baseHueOffset = (this.time * colorShiftSpeed + track7Color * 2.0) % 1.0;

            let hue;
            if (region > 1.5) {
                hue = (baseHueOffset + steppedElevation * 0.1) % 1.0;
            } else {
                hue = 0.55 + ((baseHueOffset + steppedElevation * 0.2) % 1.0) * 0.3;
                if (region > 0.5) hue = (hue + 0.05) % 1.0;
                if (hue > 0.15 && hue < 0.55) hue = 0.65;
            }

            const targetColor = this.tempTargetColor;
            let saturation = region > 0 ? 0.8 : (0.4 + steppedElevation * 0.4);
            let lightness = Math.sin(steppedElevation * Math.PI * 8.0) * 0.2 + 0.4;
            if (steppedElevation > 0.9) { lightness = 0.9; saturation = 0.1; }
            else if (steppedElevation < 0.1) { lightness = 0.1; saturation = 0.1; }
            targetColor.setHSL(hue, saturation, lightness);

            const blendFactor = (0.15 + steppedElevation * 0.8) * track7Color;
            const finalColor = this.tempColor.copy(baseColor).lerp(targetColor, blendFactor);

            this.scans.forEach(scan => {
                const dist = Math.abs(u - scan.progress);
                const width = 0.06;
                if (dist < width) {
                    const glow = Math.pow(1.0 - dist / width, 2.0) * scan.intensity;
                    const scanCol = this.scanColor.setHSL(scan.hue, 0.9, 0.7);
                    const noiseGlow = glow * (0.6 + steppedElevation * 0.4);
                    const coreGlow = Math.pow(Math.max(0, 1.0 - dist / (width * 0.3)), 3.0) * scan.intensity;
                    finalColor.lerp(scanCol, noiseGlow * 1.5);
                    const emissiveBoost = noiseGlow * 1.2;
                    finalColor.r += scanCol.r * emissiveBoost + coreGlow * 1.0;
                    finalColor.g += scanCol.g * emissiveBoost + coreGlow * 1.0;
                    finalColor.b += scanCol.b * emissiveBoost + coreGlow * 1.0;
                }
            });

            finalColor.r = Math.min(3.0, finalColor.r);
            finalColor.g = Math.min(3.0, finalColor.g);
            finalColor.b = Math.min(3.0, finalColor.b);
            return finalColor;
        };

        if (this.coreMesh && this.coreMesh.geometry.attributes.color) {
            this.coreMesh.rotation.y += deltaTime * 0.05;
            const corePosAttr = this.coreMesh.geometry.attributes.position;
            const coreColorAttr = this.coreMesh.geometry.attributes.color;
            const initialPos = this.coreMesh.geometry.userData.initialPositions;
            const v = this.tempVPos;

            for (let i = 0; i < corePosAttr.count; i++) {
                v.set(initialPos[i * 3], initialPos[i * 3 + 1], initialPos[i * 3 + 2]);
                const rx = v.x, ry = v.y, rz = v.z;
                const lowFreqNoise = (Math.sin(rx * 0.002 + this.time * distortionSpeed * 0.3) * Math.cos(ry * 0.002 + this.time * distortionSpeed * 0.4) * Math.sin(rx * 0.002 + this.time * distortionSpeed * 0.2));
                const midFreqNoise = (Math.sin(rx * 0.01 + this.time * distortionSpeed) + Math.cos(ry * 0.01 + this.time * distortionSpeed * 0.8) + Math.sin(rx * 0.01 + this.time * distortionSpeed * 1.1)) * 0.3;
                const noiseVal = lowFreqNoise + midFreqNoise;
                v.multiplyScalar(1.0 + noiseVal * distortionAmp);
                corePosAttr.setXYZ(i, v.x, v.y, v.z);
                const finalColor = getElevationHeatColor(v, skinColor, this.time, 0, 0);
                coreColorAttr.setXYZ(i, finalColor.r, finalColor.g, finalColor.b);
            }
            corePosAttr.needsUpdate = true;
            coreColorAttr.needsUpdate = true;
            this.coreMesh.geometry.computeVertexNormals();
        }

        this.scans.forEach(scan => { scan.progress += deltaTime * scan.speed; });
        this.scans = this.scans.filter(scan => scan.progress <= 1.2);

        this.tentacles.forEach((t, i) => {
            const posAttr = t.mesh.geometry.attributes.position;
            const colorAttr = t.mesh.geometry.attributes.color;
            if (!posAttr || !colorAttr) return;

            const isRebel = t.rebellionFactor > 0.5;
            const gatheringCycle = Math.sin(this.time * 0.1) * 0.5 + 0.5;
            const noiseTime = this.time * 0.05;
            const noiseScale = 1.0 + (1.0 - gatheringCycle) * 2.0;

            let currentPhi = t.phi * noiseScale + Math.sin(noiseTime + i * 0.1) * 0.2;
            let currentTheta = t.theta * noiseScale + Math.cos(noiseTime + i * 0.1) * 0.2;
            if (isRebel) {
                currentPhi = t.phi + Math.sin(this.time * 0.2 + i) * 0.5;
                currentTheta = t.theta + Math.cos(this.time * 0.2 + i) * 0.5;
            }

            const individualSpeed = speed * (0.5 + Math.sin(this.time * 0.05 + i * 0.5) * 1.5);
            const individualAmp = waveAmp * (0.3 + Math.cos(this.time * 0.03 + i * 0.8) * 0.7);
            const individualRotationX = Math.sin(this.time * 0.1 + i) * 0.1;
            const individualRotationY = Math.cos(this.time * 0.15 + i * 1.5) * 0.1;
            t.mesh.rotation.set(currentTheta + individualRotationX - t.theta, currentPhi + individualRotationY - t.phi, 0);

            const focusVec = new THREE.Vector3();
            if (focusWeight > 0) {
                focusVec.copy(this.focusTarget).sub(this.tentacleGroup.position).applyQuaternion(this.tentacleGroup.quaternion.clone().invert()).normalize();
            }

            const lengthNoiseBase = Math.sin(t.phi * 1.5 + this.time * 0.03);
            const targetMaxLFO = baseSpeed;
            if (this.smoothMaxLFO === undefined) this.smoothMaxLFO = targetMaxLFO;
            this.smoothMaxLFO += (targetMaxLFO - this.smoothMaxLFO) * deltaTime * 0.5;
            const currentMaxScale = 1.0 + this.smoothMaxLFO * 12.0;
            const rawNoise = lengthNoiseBase * 0.5 + 0.5;
            const smoothNoise = rawNoise * rawNoise * rawNoise * (rawNoise * (rawNoise * 6 - 15) + 10);
            const dynamicLengthBase = 0.2 + smoothNoise * currentMaxScale;

            let rawGrowth = Math.max(0, Math.min(1.0, (currentGrowthStep - i) / growthOverlap));
            const individualGrowth = rawGrowth * rawGrowth * rawGrowth * (rawGrowth * (rawGrowth * 6 - 15) + 10);
            const dynamicLength = dynamicLengthBase * individualGrowth;

            t.mesh.scale.set(1.0, 1.0, 1.0);
            if (individualGrowth <= 0.001) {
                t.mesh.visible = false;
                return;
            }
            t.mesh.visible = true;

            for (let s = 0; s <= 64; s++) {
                const u = s / 64;
                const time = this.time * individualSpeed * totalForce;
                const wavePhase = u * waveFreq + i * 2.0;
                const propagation = u * 4.0;
                const currentAmp = individualAmp * totalForce;

                const bendFreq = 0.3 * totalForce;
                const wave1 = Math.sin(time * bendFreq + u * 1.5 + i);
                const wave2 = Math.sin(time * bendFreq * 2.1 + u * 3.0 + i * 0.5) * 0.5;
                const wave3 = Math.sin(time * bendFreq * 4.5 + u * 6.0 + i * 1.2) * 0.2;
                let offsetX = (wave1 + wave2 + wave3) * currentAmp * u * 2.0;
                let offsetY = (Math.cos(time * bendFreq * 0.8 + u * 1.8 + i * 1.5) + wave2) * currentAmp * u * 2.0;
                let offsetZ = (Math.sin(time * bendFreq * 1.2 + u * 2.2 + i * 0.5) + wave3) * currentAmp * u * 2.0;

                const coilEffect = (coilWeight + track6Force * 0.5) * (isRebel ? 0.3 : 1.0);
                const coilRadius = u * 300.0 * coilEffect;
                const coilAngle = time * 2.0 * t.coilDirection + u * 15.0;
                offsetX += Math.cos(coilAngle) * coilRadius;
                offsetY += Math.sin(coilAngle) * coilRadius;

                const entwineEffect = (entwineWeight + track6Force * 0.3) * (isRebel ? 0.1 : 1.0);
                const noiseFieldX = Math.sin(this.time * 0.15 + u * 4.0 + Math.sin(this.time * 0.1)) * 400.0;
                const noiseFieldY = Math.cos(this.time * 0.15 + u * 4.0 + Math.cos(this.time * 0.1)) * 400.0;
                offsetX = offsetX * (1.0 - entwineEffect) + noiseFieldX * entwineEffect * u;
                offsetY = offsetY * (1.0 - entwineEffect) + noiseFieldY * entwineEffect * u;

                const pointEffect = pointingWeight * (isRebel ? 0.2 : 1.0);
                const targetDir = commonTarget.clone().normalize();
                offsetX = offsetX * (1.0 - pointEffect) + targetDir.x * u * 800.0 * pointEffect;
                offsetY = offsetY * (1.0 - pointEffect) + targetDir.y * u * 800.0 * pointEffect;
                offsetZ = offsetZ * (1.0 - pointEffect) + targetDir.z * u * 800.0 * pointEffect;

                const upwardEffect = upwardWeight * (isRebel ? 0.3 : 1.0);
                const twistAngle = time * 4.0 + u * 20.0;
                const twistRadius = u * 100.0 * upwardEffect;
                offsetX = offsetX * (1.0 - upwardEffect) + Math.sin(twistAngle) * twistRadius;
                offsetY = offsetY * (1.0 - upwardEffect) + (u * 1200.0) * upwardEffect;
                offsetZ = offsetZ * (1.0 - upwardEffect) + Math.cos(twistAngle) * twistRadius;

                const followMovement = t.rebellionFactor < 0.7;
                if (followMovement) {
                    const dragStrength = u * 0.8;
                    offsetX -= velocity.x * dragStrength;
                    offsetY -= velocity.y * dragStrength;
                    offsetZ -= velocity.z * dragStrength;
                }

                const curlIntensity = Math.pow(u, 2.5) * 150.0 * totalForce;
                const curlAngle = time * 2.0 + u * 10.0;
                offsetX += Math.sin(curlAngle) * curlIntensity;
                offsetY += Math.cos(curlAngle) * curlIntensity;

                if (focusWeight > 0) {
                    const focusStrength = u * 250.0 * focusWeight;
                    offsetX = offsetX * (1.0 - focusWeight * 0.5) + focusVec.x * focusStrength;
                    offsetY = offsetY * (1.0 - focusWeight * 0.5) + focusVec.y * focusStrength;
                    offsetZ = offsetZ * (1.0 - focusWeight * 0.5) + focusVec.z * focusStrength;
                }
                const intensity = Math.pow(u, 1.1);

                const vPos = new THREE.Vector3(offsetX, offsetY, offsetZ);
                let colorRegion = 0;
                if (u > 0.85) colorRegion = 2;
                else if (u > 0.6) colorRegion = 1;
                const color = getElevationHeatColor(vPos, skinColor, this.time, colorRegion, u);

                for (let rIdx = 0; rIdx <= 12; rIdx++) {
                    const idx = s * 13 + rIdx;
                    if (idx < posAttr.count) {
                        const bx = t.basePositions[idx * 3 + 0];
                        const by = t.basePositions[idx * 3 + 1];
                        const bz = t.basePositions[idx * 3 + 2];
                        posAttr.setXYZ(idx,
                            (bx + offsetX * intensity) * dynamicLength,
                            (by + offsetY * intensity) * dynamicLength,
                            (bz + offsetZ * intensity) * dynamicLength
                        );
                        colorAttr.setXYZ(idx, color.r, color.g, color.b);
                    }
                }
            }
            posAttr.needsUpdate = true;
            colorAttr.needsUpdate = true;
            t.mesh.geometry.computeVertexNormals();
        });

        if (this.useDOF && this.bokehPass) {
            const meshes = this.instancedMeshManagers.map(m => m.getMainMesh()).filter(m => !!m);
            const creatureMeshes = this.tentacleGroup.children;
            this.updateAutoFocus([...meshes, ...creatureMeshes]);
        }
    }

    updatePhysics(deltaTime) {
        const visibleCount = Math.min(this.currentVisibleCount || 0, this.particles.length);
        const tempVec = new THREE.Vector3();
        const halfSize = 4950;
        const dt = deltaTime;
        const isScene13Mode = this.currentMode >= this.MODE_SC13_SPIRAL && this.currentMode <= this.MODE_SC13_GRAVITY;

        // クリーチャー位置オフセット（パーティクルが触手に追従）
        const creaturePos = this.creatureParticle.position;
        const creatureOffset = new THREE.Vector3(creaturePos.x, creaturePos.y - 400, creaturePos.z);

        // 触手の動きに応じてパーティクルサイズを小さく（waveAmp が高いほど小さく）
        const waveAmp = this.currentAnimParams?.waveAmp ?? 40;
        const scaleFactor = Math.max(0.75, 1.0 - (waveAmp / 80) * 0.25);

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
                let tx = targetPos.x + (p.isStray ? p.targetOffset.x * 0.5 : 0) + creatureOffset.x;
                let ty = targetPos.y + (p.isStray ? p.targetOffset.y * 0.5 : 0) + creatureOffset.y;
                let tz = targetPos.z + (p.isStray ? p.targetOffset.z * 0.5 : 0) + creatureOffset.z;

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
                const tx = creaturePos.x + p.targetOffset.x;
                const ty = creaturePos.y + p.targetOffset.y;
                const tz = creaturePos.z + p.targetOffset.z;
                const defSpringK = 0.003 * p.strayFactor;
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

            const displayScale = p.scale.clone().multiplyScalar(scaleFactor);
            this.instancedMeshManagers[0].setMatrixAt(idx, p.position, p.rotation, displayScale);
        }
        this.instancedMeshManagers.forEach(m => m.markNeedsUpdate());
    }

    applyScene13Physics(idx, p, tempVec, dt) {
        const count = this.sphereCount;
        const spiralSpeed = (p.spiralSpeedFactor ?? 1.0);
        const cp = this.creatureParticle.position;
        const cox = cp.x;
        const coy = cp.y - 400;
        const coz = cp.z;

        if (this.currentMode === this.MODE_SC13_SPIRAL) {
            const side = (idx % 2 === 0) ? 1 : -1;
            const rotationSpeed = 1.5;
            const radius = 800 * p.radiusOffset * p.strayRadiusOffset;
            const verticalSpeed = 15.0 * spiralSpeed;
            p.position.y += verticalSpeed * dt * 60;
            const angle = (this.time * rotationSpeed) + (p.position.y * 0.006) + (side === 1 ? 0.3 : Math.PI + 0.3) + (p.phaseOffset * 0.05);
            const targetX = Math.cos(angle) * radius + cox;
            const targetZ = Math.sin(angle) * radius + coz;
            p.velocity.y *= 0.9;
            const spiralSpringK = 0.05 * p.strayFactor;
            tempVec.set((targetX - p.position.x) * spiralSpringK, 0, (targetZ - p.position.z) * spiralSpringK);
            p.addForce(tempVec);
        } else if (this.currentMode === this.MODE_SC13_TORUS) {
            const mainRadius = 1200;
            const tubeRadius = 60 * p.radiusOffset * p.strayRadiusOffset;
            const theta = (idx / count) * Math.PI * 2 + (this.time * 0.2);
            const phi = (idx % 20) / 20 * Math.PI * 2 + (theta * 6.0) + (this.time * 1.5) + p.phaseOffset;
            const tx = (mainRadius + tubeRadius * Math.cos(phi)) * Math.cos(theta) + cox;
            const ty = tubeRadius * Math.sin(phi) + 300 + coy;
            const tz = (mainRadius + tubeRadius * Math.cos(phi)) * Math.sin(theta) + coz;
            const torusSpringK = 0.01 * p.strayFactor;
            tempVec.set((tx - p.position.x) * torusSpringK, (ty - p.position.y) * torusSpringK, (tz - p.position.z) * torusSpringK);
            p.addForce(tempVec);
        } else if (this.currentMode === this.MODE_SC13_WALL) {
            const cols = 200;
            const spacing = 40;
            const zOffset = p.isStray ? (p.targetOffset.z * 5.0) : (p.targetOffset.z * 0.2);
            const tx = ((idx % cols) - cols * 0.5) * spacing + p.targetOffset.x * 0.05 + cox;
            const ty = (Math.floor(idx / cols) - (count / cols) * 0.5) * spacing + 500 + p.targetOffset.y * 0.05 + coy;
            const tz = 0 + zOffset + coz;
            const wallSpringK = 0.01 * p.strayFactor;
            tempVec.set((tx - p.position.x) * wallSpringK, (ty - p.position.y) * wallSpringK, (tz - p.position.z) * wallSpringK);
            p.addForce(tempVec);
        } else if (this.currentMode === this.MODE_SC13_WAVE) {
            const cols = Math.floor(Math.sqrt(count));
            const spacing = 5000 / cols;
            const yOffset = p.isStray ? (p.targetOffset.y * 2.0) : (p.targetOffset.y * 0.05);
            const tx = ((idx % cols) - cols * 0.5) * spacing + p.targetOffset.x * 0.05 + cox;
            const tz = (Math.floor(idx / cols) - cols * 0.5) * spacing + p.targetOffset.z * 0.05 + coz;
            const ty = Math.sin(tx * 0.001 + this.time) * Math.cos(tz * 0.001 + this.time) * 600 + 200 + yOffset + coy;
            const waveSpringK = 0.01 * p.strayFactor;
            tempVec.set((tx - p.position.x) * waveSpringK, (ty - p.position.y) * waveSpringK, (tz - p.position.z) * waveSpringK);
            p.addForce(tempVec);
        } else if (this.currentMode === this.MODE_SC13_BLACK_HOLE) {
            if (idx % 10 < 7) {
                const radius = (idx / count) * 1200 + 50 + p.targetOffset.x * 0.5;
                const angle = (idx * 0.05) + (this.time * 3.0) + p.phaseOffset * 0.1;
                const tx = Math.cos(angle) * radius + cox;
                const tz = Math.sin(angle) * radius + coz;
                const ty = (Math.sin(radius * 0.01 - this.time * 2.0) * 50) + 200 + p.targetOffset.y * 0.2 + coy;
                const bhSpringK = 0.02 * p.strayFactor;
                tempVec.set((tx - p.position.x) * bhSpringK, (ty - p.position.y) * bhSpringK, (tz - p.position.z) * bhSpringK);
                p.addForce(tempVec);
            } else {
                const side = (idx % 2 === 0) ? 1 : -1;
                const tx = (Math.random() - 0.5) * 40 + p.targetOffset.x * 0.1 + cox;
                const tz = (Math.random() - 0.5) * 40 + p.targetOffset.z * 0.1 + coz;
                const ty = side * (((idx % 100) / 100) * 4000 + 200) + p.targetOffset.y * 0.5 + coy;
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
            const tx = px + (Math.sin(idx + this.time) * 100) + p.targetOffset.x * 0.5 + cox;
            const tz = pz + (Math.cos(idx + this.time) * 50) + p.targetOffset.z * 0.5 + coz;
            const ty = ((idx / 5) / (count / 5)) * 3000 - 1000 + p.targetOffset.y * 0.2 + coy;
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
            const tx = nx * r + cox;
            const ty = ny * r + 300 + coy;
            const tz = nz * r + coz;
            const defSpringK = 0.01 * p.strayFactor;
            tempVec.set((tx - p.position.x) * defSpringK, (ty - p.position.y) * defSpringK, (tz - p.position.z) * defSpringK);
            p.addForce(tempVec);
        } else if (this.currentMode === this.MODE_SC13_GRAVITY) {
            p.velocity.multiplyScalar(0.98);
            p.addForce(this.gravityForce);
        } else {
            const tx = cp.x + p.targetOffset.x;
            const ty = cp.y + p.targetOffset.y;
            const tz = cp.z + p.targetOffset.z;
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
                for (let i = 0; i < count; i++) targets.push(new THREE.Vector3(0, 400, 0));
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
        this.expandSpheres = [];

        if (this.instancedMeshManagers) {
            this.instancedMeshManagers.forEach(m => m.dispose());
            this.instancedMeshManagers = [];
        }
        this.particles = [];

        this.tentacles.forEach(t => {
            if (t.mesh) {
                this.tentacleGroup.remove(t.mesh);
                if (t.mesh.geometry) t.mesh.geometry.dispose();
                if (t.mesh.material) t.mesh.material.dispose();
            }
        });
        this.tentacles = [];

        if (this.coreMesh) {
            this.tentacleGroup.remove(this.coreMesh);
            if (this.coreMesh.geometry) this.coreMesh.geometry.dispose();
            if (this.coreMesh.material) this.coreMesh.material.dispose();
            this.coreMesh = null;
        }

        this.scene.remove(this.tentacleGroup);

        if (this.bloomPass && this.composer) {
            const idx = this.composer.passes.indexOf(this.bloomPass);
            if (idx !== -1) this.composer.removePass(this.bloomPass);
        }
        super.dispose();
    }
}
