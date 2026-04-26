/**
 * Scene3: Scene2 系スタジオをベースに、±Z の壁を無くして奥行きが途切れない部屋。
 * Box インスタンス・Magma・壁テキスト・レーザーは無し。チリ（StudioAtmosphere）のみ。
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
    StudioBox
} from '../../lib/presentation/index.js';
import * as Motion from '../scene02/scene2.motion.js';
import * as Room3 from './scene3.room.js';
import { setupLights } from '../scene02/scene2.room.js';
import { StudioAtmosphere } from '../../lib/StudioAtmosphere.js';

export class Scene3 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'mathym | bridge interior';
        this.initialized = false;
        this.sceneNumber = 3;
        this.kitNo = 3;
        this.sharedResourceManager = sharedResourceManager;

        this.studio = null;
        this.roomGroup = null;
        this.ceilingMesh = null;
        this.pmremGenerator = null;
        this._roomEnvTexture = null;

        /** ブリッジ風：明るい白系 */
        this.sceneLightingScale = 0.4;
        this._roomEnvPresentation = null;

        this.useDOF = true;
        this.useBloom = true;
        this.useSceneFog = true;
        /** ほんのり距離感だけ（白さを潰さない） */
        this.sceneFogDensity = 0.000028;
        this.sceneFogColor = 0xe8ecf2;
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
        /** 薄め（真っ暗に見えやすいのを防ぐ） */
        this.ssaoFarAttenuation = 0.9;
        this.outputPass = null;

        this.fillPointLight = null;
        this.pulsePointLight = null;
        this.promoWallFillLight = null;
        this.promoWallLightTarget = null;

        this.atmosphere = null;

        /** Z 方向に並べた蛍光灯風（グループごと dispose） */
        this._shipFluorescentGroup = null;

        this._hemiBridge = null;
        this._dirWindowFill = null;

        this.trackEffects = {
            1: true, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false, 9: false
        };
        this.setScreenshotText(this.title);

        this.roomHalfW = 5000;
        /** ±Z の半長。大きくして床・左右壁の Z 範囲を伸ばす（壁は ±Z に無いので先はフォグで消える） */
        this.roomHalfD = 28000;

        this.floorTopY = -498;
        this.ceilingY = 5500;

        this.ambientParticleCount = 720;
        this.ambientParticleLifetimeMs = 11000;
        this.ambientParticleFadeOutMs = 1400;
        this.ambientMinLiving = 180;

        /** カメラ注視の目安（通路奥〜中間）。旧 roomHalfD 用の -42000 は狭い奥行きでは画面外になりやすい */
        this._centerSmoothed = new THREE.Vector3(0, 1200, -14000);
    }

    buildRoom() {
        Room3.buildRoom(this);
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
            minLivingBurst: this.ambientMinLiving,
            airNoiseDensity: 0.018,
            airNoiseColor: new THREE.Color(0xc8d0dc)
        });
    }

    updateCamera() {
        Motion.updateCamera(this);
    }

    /**
     * 天井に沿って Z 方向へ蛍光灯ストリップ＋冷色 PointLight を配置（見た目は船内の連続照明）
     */
    _addShipCorridorFluorescents() {
        if (this._shipFluorescentGroup) return;

        const group = new THREE.Group();
        group.name = 'shipFluorescentRun';

        const yStrip = this.ceilingY - 88;
        const yLight = this.ceilingY - 108;
        const cool = 0xd0ecff;

        const stripMat = new THREE.MeshStandardMaterial({
            color: 0xf5f9fc,
            emissive: 0xb8e8ff,
            emissiveIntensity: 1.15,
            roughness: 0.32,
            metalness: 0.12,
            fog: true
        });

        /** Z 方向に長い連続蛍光灯ストリップを左右複数本（X オフセット）置く */
        const stripD = 110;
        const stripLen = this.roomHalfD * 2 - 1200;
        const xOffsets = [-this.roomHalfW * 0.62, -this.roomHalfW * 0.32, 0, this.roomHalfW * 0.32, this.roomHalfW * 0.62];

        for (const x of xOffsets) {
            const pg = new THREE.PlaneGeometry(stripD, stripLen);
            pg.rotateX(-Math.PI / 2);
            const strip = new THREE.Mesh(pg, stripMat);
            strip.position.set(x, yStrip, 0);
            group.add(strip);
        }

        /** 各ストリップに沿ってまばらに PointLight（コストを抑えつつ照度ムラを出す） */
        const zStart = this.roomHalfD - 3000;
        const zEnd = -this.roomHalfD + 3000;
        const step = 9000;
        let zi = 0;
        for (let z = zStart; z >= zEnd; z -= step) {
            const lx = (zi % 2 === 0) ? -this.roomHalfW * 0.32 : this.roomHalfW * 0.32;
            const main = new THREE.PointLight(cool, 320, 22000, 0.95);
            main.position.set(lx, yLight, z);
            group.add(main);
            zi++;
        }
        const center = new THREE.PointLight(cool, 260, 30000, 0.9);
        center.position.set(0, yLight, 0);
        group.add(center);

        this.scene.add(group);
        this._shipFluorescentGroup = group;
    }

    switchCameraRandom() {
        let newIndex = this.currentCameraIndex;
        while (newIndex === this.currentCameraIndex) {
            newIndex = Math.floor(Math.random() * this.cameraParticles.length);
        }
        this.currentCameraIndex = newIndex;
        const cp = this.cameraParticles[this.currentCameraIndex];
        const w = this.roomHalfW * 0.85;
        const d = this.roomHalfD * 0.85;
        this.cameraParticles.forEach((p) => {
            p.minDistance = 2200;
            p.maxDistance = 7800;
            p.maxDistanceReset = 7200;
            p.boxMin = null;
            p.boxMax = null;
            p.maxSpeed = 8.0;
        });
        const x = (Math.random() - 0.5) * 2 * w;
        const y = this.floorTopY + 400 + Math.random() * (this.ceilingY - this.floorTopY - 800);
        const z = (Math.random() - 0.5) * 2 * d;
        cp.position.set(x, y, z);
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
        this.renderer.toneMappingExposure *= 1.02;

        if (this.camera.fov < 35 || this.camera.fov > 52) this.camera.fov = 46;
        this.camera.near = 12;
        this.camera.far = 220000;
        this.camera.updateProjectionMatrix();
        /** 初期位置を手前（+Z）に寄せて壁・天井に張り付きにくくする */
        this.camera.position.set(0, 1250, 7800);
        this.camera.lookAt(this._centerSmoothed.x, this._centerSmoothed.y, this._centerSmoothed.z);

        this._roomEnvPresentation = setupStudioRoomEnvironmentMap(this.renderer, this.scene);
        this.pmremGenerator = this._roomEnvPresentation.pmremGenerator;
        this._roomEnvTexture = this._roomEnvPresentation.envMapTexture;

        this.studio = new StudioBox(this.scene, {
            ...studioBoxOptionsForStudioRoom(this.sceneLightingScale, this._roomEnvTexture),
            useLights: false,
            lightColor: 0xe8f8ff,
            lightIntensity: 6.2,
            fluorescentPointIntensity: 38,
            fluorescentPointDistance: 32000,
            fluorescentPointDecay: 1.45,
            ambientIntensity: 0.14
        });
        if (this.studio.studioBox) this.studio.studioBox.visible = false;

        this.buildRoom();
        if (this.roomGroup) this.roomGroup.visible = true;

        const spotBase = ceilingSpotRigOptionsForStudioRoom(this.sceneLightingScale);
        this.studio.attachCeilingSpotRig(this.roomGroup, {
            ...spotBase,
            roomHalfW: this.roomHalfW,
            roomHalfD: this.roomHalfD,
            includeCeilingPlane: false,
            shadowDebugSpot: spotBase.shadowDebugSpot
                ? {
                      ...spotBase.shadowDebugSpot,
                      intensity: Math.round((spotBase.shadowDebugSpot.intensity ?? 5_800_000) * 0.55),
                      penumbra: 0.26,
                      color: 0xfff8f0
                  }
                : undefined
        });
        this.ceilingMesh = this.studio.ceilingSpotRig.ceilingMesh;

        this._hemiBridge = new THREE.HemisphereLight(0xf5f8ff, 0x708090, 0.58);
        this.scene.add(this._hemiBridge);

        this._dirWindowFill = new THREE.DirectionalLight(0xe8f4ff, 1.15);
        this._dirWindowFill.position.set(0, 2200, -this.roomHalfD + 1800);
        this._dirWindowFill.target.position.set(0, 900, 0);
        this.scene.add(this._dirWindowFill);
        this.scene.add(this._dirWindowFill.target);

        if (this.roomGroup?.children[0]?.material) {
            const floorMat = this.roomGroup.children[0].material;
            floorMat.envMap = null;
            floorMat.envMapIntensity = 0;
        }

        setupLights(this);

        this._addShipCorridorFluorescents();

        this.createAmbientFloatingParticles();

        if (this.calloutSystem) this.calloutSystem.setScene(this.scene);
        this.setupCameraParticleDistances();
        this.initPostProcessing();

        this.initialized = true;
    }

    setupCameraParticleDistance(cameraParticle) {
        /** 原点周りの球半径：下限を上げて「顔面ドン」を避ける */
        cameraParticle.minDistance = 2200;
        cameraParticle.maxDistance = 7800;
        cameraParticle.maxDistanceReset = 7200;
        cameraParticle.minY = -200;
        cameraParticle.maxY = 4500;
        cameraParticle.initializePosition?.();
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;

        if (this.atmosphere) {
            this.atmosphere.update(deltaTime, this.time, this._centerSmoothed);
        }
        this.setParticleCount(0);

        this.updateCamera();

        if (this.bokehPass?.uniforms?.focus) {
            this.bokehPass.uniforms.focus.value = this.dofParams.focus;
        }
        updateSsaoDistanceAttenuation(this, this._centerSmoothed);

        if (this.calloutSystem) {
            this.calloutSystem.update(deltaTime, this.time, this.camera, { autoGenerate: false, maxCount: 8, margin: 200 });
        }
    }

    handleTrackNumber() {
        /* Box パーティクル・Magma・展開エフェクト無し */
    }

    initPostProcessing() {
        setupPostEffectsPipeline(this, {
            ssaoKernelSize: 48,
            bloomStrength: 0.2,
            bloomRadius: 0.55,
            bloomThreshold: 0.72,
            filmGrainIntensity: 0.1,
            filmGrainGrayscale: false
        });
    }

    onResize() {
        super.onResize();
        resizePostEffectsPasses(this);
    }

    dispose() {
        this.initialized = false;
        this.scene.fog = null;

        if (this.promoWallFillLight) {
            this.scene.remove(this.promoWallFillLight);
            this.promoWallFillLight.dispose();
            this.promoWallFillLight = null;
        }
        if (this.promoWallLightTarget) {
            this.scene.remove(this.promoWallLightTarget);
            this.promoWallLightTarget = null;
        }

        if (this.atmosphere) {
            this.atmosphere.dispose();
            this.atmosphere = null;
        }

        if (this._shipFluorescentGroup) {
            const g = this._shipFluorescentGroup;
            this.scene.remove(g);
            const geos = new Set();
            const mats = new Set();
            g.traverse((o) => {
                if (o.geometry) geos.add(o.geometry);
                if (o.material && !Array.isArray(o.material)) mats.add(o.material);
            });
            geos.forEach((geo) => geo.dispose());
            mats.forEach((m) => m.dispose());
            this._shipFluorescentGroup = null;
        }

        if (this._hemiBridge) {
            this.scene.remove(this._hemiBridge);
            this._hemiBridge.dispose();
            this._hemiBridge = null;
        }
        if (this._dirWindowFill) {
            this.scene.remove(this._dirWindowFill.target);
            this.scene.remove(this._dirWindowFill);
            this._dirWindowFill.dispose();
            this._dirWindowFill = null;
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
