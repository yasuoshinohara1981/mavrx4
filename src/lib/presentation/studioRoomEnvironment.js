import { PMREMGenerator, Object3D, SpotLight } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { applyStandardPresentationRenderer } from './PostEffectsPipeline.js';
import { StudioBox } from '../StudioBox.js';

/** Studio 部屋（buildRoom / StudioBox）と同一スケール */
export const STUDIO_ROOM_HALF_W = 5000;
export const STUDIO_ROOM_HALF_D = 5000;
export const STUDIO_FLOOR_TOP_Y = -498;
export const STUDIO_CEILING_Y = 5500;

/** RoomEnvironment PMREM の fromScene 第2引数（Three 例と同系） */
export const ROOM_ENV_PMREM_INTENSITY = 0.04;

/** 距離フォグ・背景（壁系のニュートラルグレー・やや暗め） */
export const STUDIO_ROOM_SCENE_FOG_COLOR = 0x898991;

/**
 * トーンマップ・露出ブースト・背景・フォグ（IBL は {@link setupStudioRoomEnvironmentMap}）
 */
export function applyStudioRoomToneAndBackdrop(
    renderer,
    scene,
    sceneLightingScale,
    {
        useSceneFog = true,
        sceneFogDensity = 0.00005,
        sceneFogColor = STUDIO_ROOM_SCENE_FOG_COLOR
    } = {}
) {
    applyStandardPresentationRenderer(renderer, sceneLightingScale);
    renderer.toneMappingExposure *= 1.96;
    StudioBox.applySceneBackdrop(scene, {
        backgroundHex: sceneFogColor,
        fogDensity: sceneFogDensity,
        fogColor: sceneFogColor,
        useFog: useSceneFog
    });
}

/**
 * RoomEnvironment の PMREM を生成し `scene.environment` に設定。
 * @returns {{ pmremGenerator: PMREMGenerator, envMapTexture: import('three').Texture }}
 */
export function setupStudioRoomEnvironmentMap(renderer, scene) {
    const pmremGenerator = new PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envScene = new RoomEnvironment();
    const envMapTexture = pmremGenerator.fromScene(envScene, ROOM_ENV_PMREM_INTENSITY).texture;
    scene.environment = envMapTexture;
    return { pmremGenerator, envMapTexture };
}

/**
 * @param {{ pmremGenerator?: PMREMGenerator | null, envMapTexture?: import('three').Texture | null } | null | undefined} presentation
 * @param {import('three').Scene} [scene]
 */
export function disposeStudioRoomEnvironmentMap(presentation, scene) {
    if (!presentation) return;
    if (scene && presentation.envMapTexture && scene.environment === presentation.envMapTexture) {
        scene.environment = null;
    }
    if (presentation.pmremGenerator) {
        presentation.pmremGenerator.dispose();
        presentation.pmremGenerator = null;
    }
    if (presentation.envMapTexture) {
        presentation.envMapTexture.dispose();
        presentation.envMapTexture = null;
    }
}

/**
 * buildRoom 直後の床・壁マテリアル：env を外し `envMapIntensity` を 0（シャドウ優先の既定）
 */
export function applyStudioRoomFloorWallEnvMaps(wallMat, floorMat) {
    wallMat.envMap = null;
    floorMat.envMap = null;
    wallMat.envMapIntensity = 0;
    floorMat.envMapIntensity = 0;
}

/**
 * StudioBox コンスト用（ceilingSpotRig はコンストでは付けず attach 側）
 */
export function studioBoxOptionsForStudioRoom(sceneLightingScale, roomEnvTexture) {
    const L = sceneLightingScale ?? 1;
    return {
        envMap: roomEnvTexture,
        envMapIntensity: 0,
        useFloorTile: false,
        useLights: true,
        lightIntensity: 10.5 * L,
        // 影を濃く見せる：均しの Ambient と四隅 Point のフィルを抑える（キーは ceilingSpotRig の Spot）
        ambientIntensity: 0.08,
        fluorescentPointIntensity: 95
    };
}

/**
 * StudioBox.attachCeilingSpotRig に渡す共通フィールド（includeCeilingPlane は呼び側で上書き）
 */
export function ceilingSpotRigOptionsForStudioRoom(sceneLightingScale) {
    const L = sceneLightingScale ?? 1;
    return {
        roomHalfW: STUDIO_ROOM_HALF_W,
        roomHalfD: STUDIO_ROOM_HALF_D,
        ceilingY: STUDIO_CEILING_Y,
        floorTopY: STUDIO_FLOOR_TOP_Y,
        sceneLightingScale: L,
        envMapIntensity: 0,
        shadowDebugSpot: {
            enabled: true,
            // Sharper and more stable contact shadows for large room scale.
            shadowMapSize: 4096,
            shadowBias: -0.0002,
            shadowNormalBias: 0.028,
            cameraNear: 800,
            cameraFar: 9000,
            // キー光を少し上げて明暗差を取る（フィルは studioBox 側で抑制）
            intensity: 3_650_000
        }
    };
}

/**
 * 壁プロモ用フィル Spot（intensity 0）
 */
export function setupStudioRoomPromoWallFillLight(scene, { ceilingY = STUDIO_CEILING_Y } = {}) {
    const spotI = 0;

    const promoWallLightTarget = new Object3D();
    promoWallLightTarget.position.set(0, 0, 0);
    scene.add(promoWallLightTarget);

    const promoWallFillLight = new SpotLight(0xffffff, spotI, 26000, Math.PI / 5, 0.32, 1.0);
    promoWallFillLight.position.set(0, ceilingY - 120, 0);
    promoWallFillLight.castShadow = false;
    promoWallFillLight.target = promoWallLightTarget;
    scene.add(promoWallFillLight);

    return { promoWallLightTarget, promoWallFillLight };
}
