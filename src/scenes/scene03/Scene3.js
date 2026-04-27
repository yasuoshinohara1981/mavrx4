/**
 * Scene3: Studio 部屋＋StudioBox（箱は非表示）＋天井スポットまでを Scene1/2 と同系で構築。
 * メインオブジェクト・OSC トラック処理は後から追加する。
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import {
    setupPostEffectsPipeline,
    attachStrobeFlashPass,
    updateSsaoDistanceAttenuation,
    resizePostEffectsPasses,
    disposePresentationOutputPass,
    applyStudioRoomToneAndBackdrop,
    setupStudioRoomEnvironmentMap,
    disposeStudioRoomEnvironmentMap,
    studioBoxOptionsForStudioRoom,
    ceilingSpotRigOptionsForStudioRoom,
    applyStudioRoomFloorWallEnvMaps,
    StudioBox,
    STUDIO_ROOM_SCENE_FOG_COLOR
} from '../../lib/presentation/index.js';
import * as Room from '../scene02/scene2.room.js';
import * as Motion from '../scene02/scene2.motion.js';
import {
    initCurlSnakeSystems,
    updateCurlSnakeSystems,
    disposeCurlSnakeSystems,
    scene3OnTrack6Spawn
} from './scene3.snakeMain.js';
import { parseTrackNumber } from '../scene02/scene2.helpers.js';
import { StudioAtmosphere } from '../../lib/StudioAtmosphere.js';

export class Scene3 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'mathym | Scene3';
        this.initialized = false;
        this.sceneNumber = 3;
        this.kitNo = 3;
        this.sharedResourceManager = sharedResourceManager;

        this.studio = null;
        this.roomGroup = null;
        this.ceilingMesh = null;
        this.pmremGenerator = null;
        this._roomEnvTexture = null;
        this._roomEnvPresentation = null;

        this.sceneLightingScale = 0.32;

        this.useTrack2Strobe = true;

        this.useDOF = true;
        this.useBloom = true;
        this.useSceneFog = true;
        /** ストロボ時はキー光をカメラスポットに寄せるため、ベースはやや暗め */
        this.sceneFogDensity = 0.00015;
        this.sceneFogColor = STUDIO_ROOM_SCENE_FOG_COLOR;
        this.useSSAO = true;
        this.useFilmGrain = true;
        this.useAutoFocusDOF = false;
        this.bloomPass = null;
        this.ssaoPass = null;
        this.saoPass = null;
        this.aoDepthTexture = null;
        this.ssaoNearKernelRadius = 14;
        this.ssaoNearMinDistance = 0.012;
        this.ssaoNearMaxDistance = 0.24;
        this.ssaoFarAttenuation = 0.82;
        this.outputPass = null;

        this.fillPointLight = null;
        this.pulsePointLight = null;
        this.promoWallFillLight = null;
        this.promoWallLightTarget = null;

        /** トラック2ストロボ用：カメラ視線方向のスポット（ポストフラッシュに同期） */
        this.strobeCameraSpot = null;
        this._strobeCameraSpotTarget = null;
        this._strobeCameraSpotPeak = 3.6e6;

        this.atmosphere = null;
        this.ambientParticleCount = 2000;
        this.ambientParticleLifetimeMs = 11000;
        this.ambientParticleFadeOutMs = 1400;
        this.ambientMinLiving = 180;

        this.trackEffects = {
            1: true, 2: false, 3: false, 4: false, 5: false, 6: true, 7: false, 8: false, 9: false
        };
        this.setScreenshotText(this.title);

        this.roomHalfW = 5000;
        this.roomHalfD = 5000;
        this.floorTopY = -498;
        this.ceilingY = 5500;

        this._centerSmoothed = new THREE.Vector3(0, 900, 0);
    }

    buildRoom() {
        Room.buildRoom(this);
    }

    setupLights() {
        Room.setupLights(this);
    }

    createAmbientFloatingParticles() {
        this.atmosphere = new StudioAtmosphere(this.scene, {
            roomHalfW: this.roomHalfW,
            roomHalfD: this.roomHalfD,
            floorTopY: this.floorTopY,
            ceilingY: this.ceilingY,
            particleCount: this.ambientParticleCount,
            particleLifetimeMs: this.ambientParticleLifetimeMs,
            particleFadeOutMs: this.ambientParticleFadeOutMs,
            minLivingBurst: this.ambientMinLiving
        });
    }

    updateCamera() {
        Motion.updateCamera(this);
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
        cp.position.set(Math.cos(angle1) * Math.sin(angle2) * dist, Math.sin(angle1) * Math.sin(angle2) * dist + 500, Math.cos(angle2) * dist);
        cp.applyRandomForce();
    }

    async setup() {
        if (this.initialized) return;
        await super.setup();

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        applyStudioRoomToneAndBackdrop(this.renderer, this.scene, this.sceneLightingScale, {
            useSceneFog: this.useSceneFog,
            sceneFogDensity: this.sceneFogDensity ?? 0.00009,
            sceneFogColor: this.sceneFogColor
        });

        if (this.camera.fov < 35 || this.camera.fov > 50) this.camera.fov = 42;
        this.camera.near = 12;
        this.camera.far = 12000;
        this.camera.updateProjectionMatrix();
        this.camera.position.set(0, 1000, 4500);
        this.camera.lookAt(0, 400, 0);

        this._roomEnvPresentation = setupStudioRoomEnvironmentMap(this.renderer, this.scene);
        this.pmremGenerator = this._roomEnvPresentation.pmremGenerator;
        this._roomEnvTexture = this._roomEnvPresentation.envMapTexture;

        const L = this.sceneLightingScale;
        const studioOpts = {
            ...studioBoxOptionsForStudioRoom(L, this._roomEnvTexture),
            ambientIntensity: 0.011,
            lightIntensity: Math.max(3.6, 4.2 * L),
            fluorescentPointIntensity: 11
        };
        this.studio = new StudioBox(this.scene, studioOpts);
        if (this.studio.studioBox) this.studio.studioBox.visible = false;

        this.buildRoom();

        const ceilBase = ceilingSpotRigOptionsForStudioRoom(L);
        const ceilingOpts = {
            ...ceilBase,
            emissiveIntensity: 3.4 * L,
            shadowDebugSpot: {
                ...ceilBase.shadowDebugSpot,
                intensity: Math.round(ceilBase.shadowDebugSpot.intensity * 0.3)
            }
        };
        this.studio.attachCeilingSpotRig(this.roomGroup, ceilingOpts);
        this.ceilingMesh = this.studio.ceilingSpotRig.ceilingMesh;
        if (this.ceilingMesh) this.ceilingMesh.visible = true;

        if (this.roomGroup) {
            const floorMat = this.roomGroup.children[0].material;
            const wallMat = this.roomGroup.children[1].material;
            applyStudioRoomFloorWallEnvMaps(wallMat, floorMat);
        }

        this.setupLights();

        this.createAmbientFloatingParticles();

        if (this.calloutSystem) {
            for (let i = this.calloutSystem.callouts.length - 1; i >= 0; i--) {
                const c = this.calloutSystem.callouts[i];
                if (c.mesh3D) this.calloutSystem.disposeCallout3DMesh(c);
            }
            this.calloutSystem.callouts.length = 0;
            this.calloutSystem.setScene(this.scene);
        }
        this.setupCameraParticleDistances();
        this.initPostProcessing();

        this.setupStrobeCameraSpot();

        initCurlSnakeSystems(this);

        this.initialized = true;
    }

    /**
     * ストロボ時に部屋へ実際に光を当てるカメラスポット（シャドウは天井キーに任せてオフ）
     */
    setupStrobeCameraSpot() {
        if (this.strobeCameraSpot) return;
        const spot = new THREE.SpotLight(0xf2f5ff, 0, 17000, Math.PI / 4.1, 0.36, 0.5);
        spot.decay = 2;
        spot.castShadow = false;
        spot.position.set(0, 140, 420);
        this.camera.add(spot);
        const tgt = new THREE.Object3D();
        tgt.position.set(0, -280, -3200);
        this.camera.add(tgt);
        spot.target = tgt;
        this.strobeCameraSpot = spot;
        this._strobeCameraSpotTarget = tgt;
    }

    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 750;
        cameraParticle.maxDistance = 4850;
        cameraParticle.maxDistanceReset = 4500;
        cameraParticle.minY = -200;
        cameraParticle.maxY = 4500;
        cameraParticle.initializePosition?.();
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;
        if (this.atmosphere) {
            const p = this._snakeHeadPos ?? this._centerSmoothed;
            this.atmosphere.update(deltaTime, this.time, p);
        }
        updateCurlSnakeSystems(this, deltaTime);

        this.updateCamera();

        const focusTargets = [
            this.roomGroup,
            this._snakeSphereInst,
            this._nodeLinkInst
        ].filter(Boolean);
        if (this.useAutoFocusDOF) this.updateAutoFocus(focusTargets);
        else if (this.bokehPass?.uniforms?.focus) this.bokehPass.uniforms.focus.value = this.dofParams.focus;
        updateSsaoDistanceAttenuation(this, this._snakeHeadPos ?? this._centerSmoothed);

        if (this.strobeCameraSpot) {
            const f = THREE.MathUtils.clamp(this.strobeFlashIntensity ?? 0, 0, 1);
            const k = f * f;
            this.strobeCameraSpot.intensity = k * this._strobeCameraSpotPeak;
        }
    }

    handleTrackNumber(trackNumber, message) {
        const tn = parseTrackNumber(trackNumber, message);
        if (tn !== 6) return;
        const args = message.args || [];
        const v1 = args[1] != null ? Number(args[1]) : NaN;
        const v0 = args[0] != null ? Number(args[0]) : NaN;
        const velocity = Number.isFinite(v1) ? v1 : Number.isFinite(v0) ? v0 : 100;
        if (!Number.isFinite(velocity) || velocity <= 0) return;
        if (this.trackEffects[6]) scene3OnTrack6Spawn(this, velocity);
    }

    initPostProcessing() {
        setupPostEffectsPipeline(this, {
            ssaoKernelSize: 48,
            filmGrainIntensity: 0.46,
            filmGrainGrayscale: false
        });
        attachStrobeFlashPass(this);
        this.applyTrackEffectsToPostPasses();
    }

    onResize() {
        super.onResize();
        resizePostEffectsPasses(this);
    }

    dispose() {
        this.initialized = false;
        this.scene.fog = null;

        disposeCurlSnakeSystems(this);

        if (this.atmosphere) {
            this.atmosphere.dispose();
            this.atmosphere = null;
        }

        if (this.promoWallFillLight) {
            this.scene.remove(this.promoWallFillLight);
            this.promoWallFillLight.dispose();
            this.promoWallFillLight = null;
        }
        if (this.promoWallLightTarget) {
            this.scene.remove(this.promoWallLightTarget);
            this.promoWallLightTarget = null;
        }

        if (this.roomGroup) {
            this.scene.remove(this.roomGroup);
            const seenMats = new Set();
            const seenTex = new Set();
            this.roomGroup.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material && !seenMats.has(o.material)) {
                    seenMats.add(o.material);
                    const m = o.material;
                    for (const t of [m.map, m.bumpMap, m.normalMap, m.roughnessMap, m.aoMap]) {
                        if (t && !seenTex.has(t)) {
                            seenTex.add(t);
                            t.dispose();
                        }
                    }
                    m.dispose();
                }
            });
            this.roomGroup = null;
        }
        this.ceilingMesh = null;

        if (this.strobeCameraSpot) {
            this.camera.remove(this.strobeCameraSpot);
            this.strobeCameraSpot.dispose();
            this.strobeCameraSpot = null;
        }
        if (this._strobeCameraSpotTarget) {
            this.camera.remove(this._strobeCameraSpotTarget);
            this._strobeCameraSpotTarget = null;
        }

        if (this.studio) {
            this.studio.dispose();
            this.studio = null;
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
        disposePresentationOutputPass(this);

        disposeStudioRoomEnvironmentMap({ pmremGenerator: this.pmremGenerator, envMapTexture: this._roomEnvTexture }, this.scene);
        this.pmremGenerator = null;
        this._roomEnvTexture = null;
        this._roomEnvPresentation = null;
        this.bloomPass = null;

        super.dispose();
    }
}
