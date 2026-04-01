/**
 * Scene2: 部屋・ライト・フォグ・ポストは Scene1 と同型（Studio タイル部屋＋平行光シャドウ＋SSAO 等）。
 * メインの飛行オブジェクトのみ独自：岩色チャコール立方体 InstancedMesh・運動モード11種・OSC トラック6。
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import {
    setupPostEffectsPipeline,
    updateSsaoDistanceAttenuation,
    resizePostEffectsPasses,
    disposePresentationOutputPass,
    applyStudioRoomToneAndBackdrop,
    setupStudioRoomEnvironmentMap,
    disposeStudioRoomEnvironmentMap,
    studioBoxOptionsForStudioRoom,
    ceilingSpotRigOptionsForStudioRoom,
    applyStudioRoomFloorWallEnvMaps,
    StudioBox
} from '../../lib/presentation/index.js';

// 分割したモジュールのインポート
import * as Helpers from './scene2.helpers.js';
import * as Motion from './scene2.motion.js';
import * as Room from './scene2.room.js';
import * as Shards from './scene2.shards.js';

export class Scene2 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'mathym | Xenofog';
        this.initialized = false;
        this.sceneNumber = 2;
        this.kitNo = 2;
        this.sharedResourceManager = sharedResourceManager;

        this.studio = null;
        this.roomGroup = null;
        this.ceilingMesh = null;
        this.pmremGenerator = null;
        this._roomEnvTexture = null;

        this.sceneLightingScale = 0.32;
        this._roomEnvPresentation = null;

        this.useDOF = true;
        this.useBloom = true;
        this.useSceneFog = true;
        this.sceneFogDensity = 0.00009;
        this.sceneFogColor = 0x151820;
        this.useSSAO = true;
        this.useFilmGrain = true;
        this.useAutoFocusDOF = false;
        this.bloomPass = null;
        this.ssaoPass = null;
        this.saoPass = null;
        this.aoDepthTexture = null;
        this.ssaoNearKernelRadius = 9.2;
        this.ssaoNearMinDistance = 0.018;
        this.ssaoNearMaxDistance = 0.165;
        this.ssaoFarAttenuation = 0.62;
        this.outputPass = null;

        this.fillPointLight = null;
        this.pulsePointLight = null;
        this.promoWallFillLight = null;
        this.promoWallLightTarget = null;

        this.airNoiseVolume = null;
        this.airNoiseMaterial = null;

        this.trackEffects = {
            1: true, 2: false, 3: false, 4: false, 5: false, 6: true, 7: false, 8: false, 9: false
        };
        this.setScreenshotText(this.title);

        this.roomHalfW = 5000;
        this.roomHalfD = 5000;
        this.floorTopY = -498;
        this.ceilingY = 5500;

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

        this._tmpV = new THREE.Vector3();
        this._mat = new THREE.Matrix4();
        this._quat = new THREE.Quaternion();
        this._scale = new THREE.Vector3();
        this._centerSmoothed = new THREE.Vector3(0, 900, 0);
        this._colorTmp = new THREE.Color();
    }

    // ヘルパー・ユーティリティの委譲
    normalizeMidiVelocity(v) { return Helpers.normalizeMidiVelocity(v); }
    _setRandomRockCharcoalColor(out) { Helpers.setRandomRockCharcoalColor(out); }
    static parseTrackNumber(trackNumber, message) { return Helpers.parseTrackNumber(trackNumber, message); }

    // モーション・カメラの委譲
    _smoothCenterFromParticles(dt) { Motion.smoothCenterFromParticles(this, dt); }
    updateCamera() { Motion.updateCamera(this); }
    applyCameraModeForMovement() { Motion.applyCameraModeForMovement(this); }

    // 部屋・ライトの委譲
    buildRoom() { Room.buildRoom(this); }
    setupLights() { Room.setupLights(this); }
    setupAirNoiseVolume() { Room.setupAirNoiseVolume(this); }

    // パーティクル・インスタンスの委譲
    createSpheres() { Shards.createSpheres(this); }
    updatePhysics(deltaTime) { Shards.updatePhysics(this, deltaTime); }
    triggerExpandEffect(velocity = 127) { Shards.triggerExpandEffect(this, velocity); }

    _applyEnvMapToSphereMaterial() {
        const m = this.instancedMeshManager?.getMainMesh()?.material;
        const env = this.scene?.environment;
        if (m && env) { m.envMap = env; m.needsUpdate = true; }
    }

    updateExpandSpheres() {
        const now = Date.now();
        for (let i = this.expandSpheres.length - 1; i >= 0; i--) {
            const effect = this.expandSpheres[i];
            const progress = (now - effect.startTime) / effect.duration;
            if (progress >= 1.0) {
                if (effect.light) this.scene.remove(effect.light);
                if (effect.mesh) { this.scene.remove(effect.mesh); effect.mesh.geometry.dispose(); effect.mesh.material.dispose(); }
                this.expandSpheres.splice(i, 1);
            } else {
                if (effect.light) effect.light.intensity = effect.maxIntensity * (1.0 - Math.pow(progress, 0.5));
                if (effect.mesh) effect.mesh.scale.setScalar(1.0 - progress);
            }
        }
    }

    switchCameraRandom() {
        let newIndex = this.currentCameraIndex;
        while (newIndex === this.currentCameraIndex) { newIndex = Math.floor(Math.random() * this.cameraParticles.length); }
        this.currentCameraIndex = newIndex;
        const cp = this.cameraParticles[this.currentCameraIndex];
        this.cameraParticles.forEach((p) => { p.minDistance = 400; p.maxDistance = 2000; p.boxMin = null; p.boxMax = null; p.maxSpeed = 8.0; });
        const angle1 = Math.random() * Math.PI * 2; const angle2 = Math.random() * Math.PI; const dist = 1000 + Math.random() * 2000;
        cp.position.set(Math.cos(angle1) * Math.sin(angle2) * dist, Math.sin(angle1) * Math.sin(angle2) * dist + 500, Math.cos(angle2) * dist);
        cp.applyRandomForce();
    }

    async setup() {
        if (this.initialized) return;
        await super.setup();
        this.useSSAO = false;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        applyStudioRoomToneAndBackdrop(this.renderer, this.scene, this.sceneLightingScale, {
            useSceneFog: this.useSceneFog,
            sceneFogDensity: this.sceneFogDensity ?? 0.00009,
            sceneFogColor: this.sceneFogColor
        });

        if (this.camera.fov < 35 || this.camera.fov > 50) this.camera.fov = 42;
        this.camera.near = 12; this.camera.far = 12000; this.camera.updateProjectionMatrix();
        this.camera.position.set(0, 1000, 4500); this.camera.lookAt(0, 400, 0);

        this._roomEnvPresentation = setupStudioRoomEnvironmentMap(this.renderer, this.scene);
        this.pmremGenerator = this._roomEnvPresentation.pmremGenerator;
        this._roomEnvTexture = this._roomEnvPresentation.envMapTexture;

        this.studio = new StudioBox(this.scene, studioBoxOptionsForStudioRoom(this.sceneLightingScale, this._roomEnvTexture));
        if (this.studio.studioBox) this.studio.studioBox.visible = false;

        this.buildRoom();
        this.studio.attachCeilingSpotRig(this.roomGroup, { includeCeilingPlane: false, ...ceilingSpotRigOptionsForStudioRoom(this.sceneLightingScale) });
        const floorMat = this.roomGroup.children[0].material;
        const wallMat = this.roomGroup.children[1].material;
        applyStudioRoomFloorWallEnvMaps(wallMat, floorMat);

        this.setupLights();
        this.setupAirNoiseVolume();
        this.createSpheres();
        this._applyEnvMapToSphereMaterial();

        if (this.calloutSystem) this.calloutSystem.setScene(this.scene);
        this.setupCameraParticleDistances();
        this.initPostProcessing();
        this.initialized = true;
    }

    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 750; cameraParticle.maxDistance = 4850; cameraParticle.maxDistanceReset = 4500;
        cameraParticle.minY = -200; cameraParticle.maxY = 4500; cameraParticle.initializePosition?.();
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;
        this.currentVisibleCount = this.sphereCount;
        this.setParticleCount(this.sphereCount);
        if (this.instancedMeshManager) {
            const mainMesh = this.instancedMeshManager.getMainMesh();
            if (mainMesh) { mainMesh.count = this.sphereCount; mainMesh.instanceMatrix.needsUpdate = true; }
        }

        this.modeTimer += deltaTime;
        if (this.modeTimer >= this.modeInterval) {
            this.modeTimer = 0;
            const weights = [1.0, 1.2, 1.5, 1.5, 1.0, 1.0, 1.2, 1.0, 0.8, 1.5, 1.05];
            const unvisitedModes = [];
            for (let i = 0; i < this.totalModeCount; i++) { if (!this.modeHistory.has(i)) unvisitedModes.push(i); }
            let nextMode = -1;
            if (unvisitedModes.length > 0) {
                let subTotalWeight = 0; unvisitedModes.forEach((m) => { subTotalWeight += weights[m]; });
                let random = Math.random() * subTotalWeight;
                for (const m of unvisitedModes) { if (random < weights[m]) { nextMode = m; break; } random -= weights[m]; }
                if (nextMode === -1) nextMode = unvisitedModes[0];
            } else {
                const totalWeight = weights.reduce((a, b) => a + b, 0);
                let random = Math.random() * totalWeight;
                for (let i = 0; i < weights.length; i++) { if (random < weights[i]) { nextMode = i; break; } random -= weights[i]; }
                if (nextMode === this.currentMode) nextMode = (nextMode + 1) % this.totalModeCount;
            }
            this.currentMode = nextMode;
            this.modeHistory.add(nextMode);
            if (this.modeHistory.size >= this.totalModeCount) { this.modeHistory.clear(); this.modeHistory.add(this.currentMode); }
            this.useGravity = false; this.spiralMode = this.currentMode === this.MODE_HELIX_RAIL; this.torusMode = false;
            this.applyCameraModeForMovement();
            if (this.currentMode === this.MODE_UPTHRUST) {
                this.particles.forEach((part) => { if (part.velocity.y < 0) part.velocity.y *= 0.65; });
            } else if (this.currentMode === this.MODE_HELIX_RAIL) {
                this.particles.forEach((p) => {
                    const rr = Math.random() * this.spawnRadius; const theta = Math.random() * Math.PI * 2; const phi = Math.random() * Math.PI;
                    p.position.set(rr * Math.sin(phi) * Math.cos(theta), p.spiralHeightFactor * 5000 - 500, rr * Math.sin(phi) * Math.sin(theta));
                    p.velocity.set(0, 0, 0);
                });
            }
        }

        this.updatePhysics(deltaTime);
        this.updateExpandSpheres();
        this._smoothCenterFromParticles(deltaTime);
        this.updateCamera();

        if (this.airNoiseMaterial?.uniforms?.uTime) this.airNoiseMaterial.uniforms.uTime.value = this.time;
        const mainInst = this.instancedMeshManager?.getMainMesh();
        const focusTargets = [this.roomGroup, mainInst].filter(Boolean);
        if (this.useAutoFocusDOF) this.updateAutoFocus(focusTargets);
        else if (this.bokehPass?.uniforms?.focus) this.bokehPass.uniforms.focus.value = this.dofParams.focus;
        updateSsaoDistanceAttenuation(this, this._centerSmoothed);

        if (this.calloutSystem) this.calloutSystem.update(deltaTime, this.time, this.camera, { autoGenerate: false, maxCount: 8, margin: 200 });
    }

    handleTrackNumber(trackNumber, message) {
        const tn = Helpers.parseTrackNumber(trackNumber, message);
        if (tn !== 6) return;
        const args = message.args || [];
        const v1 = args[1] != null ? Number(args[1]) : NaN;
        const v0 = args[0] != null ? Number(args[0]) : NaN;
        let velocity = Number.isFinite(v1) ? v1 : Number.isFinite(v0) ? v0 : 127;
        if (!Number.isFinite(velocity) || velocity <= 0) return;
        if (this.trackEffects[6]) this.triggerExpandEffect(velocity);
    }

    initPostProcessing() { setupPostEffectsPipeline(this, {}); }
    onResize() { super.onResize(); resizePostEffectsPasses(this); }

    dispose() {
        this.initialized = false; this.scene.fog = null;
        if (this.airNoiseVolume) { this.scene.remove(this.airNoiseVolume); if (this.airNoiseVolume.geometry) this.airNoiseVolume.geometry.dispose(); this.airNoiseVolume = null; }
        if (this.airNoiseMaterial) { this.airNoiseMaterial.dispose(); this.airNoiseMaterial = null; }
        if (this.promoWallFillLight) { this.scene.remove(this.promoWallFillLight); this.promoWallFillLight.dispose(); this.promoWallFillLight = null; }
        if (this.promoWallLightTarget) { this.scene.remove(this.promoWallLightTarget); this.promoWallLightTarget = null; }
        if (this.roomGroup) {
            this.scene.remove(this.roomGroup); const seenMats = new Set(); const seenTex = new Set();
            this.roomGroup.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material && !seenMats.has(o.material)) {
                    seenMats.add(o.material); const m = o.material;
                    for (const t of [m.map, m.bumpMap, m.normalMap, m.roughnessMap, m.aoMap]) { if (t && !seenTex.has(t)) { seenTex.add(t); t.dispose(); } }
                    m.dispose();
                }
            });
            this.roomGroup = null;
        }
        this.ceilingMesh = null;
        if (this.studio) { this.studio.dispose(); this.studio = null; }
        if (this.ssaoPass && this.composer) { const idx = this.composer.passes.indexOf(this.ssaoPass); if (idx !== -1) this.composer.passes.splice(idx, 1); this.ssaoPass = null; }
        if (this.saoPass && this.composer) { const idx = this.composer.passes.indexOf(this.saoPass); if (idx !== -1) this.composer.passes.splice(idx, 1); this.saoPass = null; }
        if (this.aoDepthTexture) { this.aoDepthTexture.dispose(); this.aoDepthTexture = null; }
        disposePresentationOutputPass(this);
        this.expandSpheres.forEach((e) => {
            if (e.light) this.scene.remove(e.light);
            if (e.mesh) { this.scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); }
        });
        this.expandSpheres = [];
        if (this.instancedMeshManager) { this.instancedMeshManager.dispose(); this.instancedMeshManager = null; }
        this.particles = []; this.grid?.clear();
        disposeStudioRoomEnvironmentMap({ pmremGenerator: this.pmremGenerator, envMapTexture: this._roomEnvTexture }, this.scene);
        this.pmremGenerator = null; this._roomEnvTexture = null; this._roomEnvPresentation = null;
        this.bloomPass = null;
        super.dispose();
    }
}
