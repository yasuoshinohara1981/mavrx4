import * as THREE from 'three';
import {
    StudioBox,
    studioBoxOptionsForStudioRoom,
    ceilingSpotRigOptionsForStudioRoom,
    setupStudioRoomPromoWallFillLight
} from '../../lib/presentation/index.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import helvetikerFontUrl from 'three/examples/fonts/helvetiker_regular.typeface.json?url';

/**
 * Scene1 部屋・ライト・レーザー関連のロジック
 */

/**
 * 部屋の構築（床・壁）
 */
export function buildRoom(scene) {
    const floorTpl = StudioBox.createFloorTileTextures();
    const wallTpl = StudioBox.createWallTileTextures();
    const L = scene.sceneLightingScale ?? 1;
    const studioRough = 0.8;
    const floorConcreteMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: floorTpl.map,
        bumpMap: floorTpl.bumpMap,
        bumpScale: 1.0,
        roughness: studioRough * 0.3,
        metalness: 0.2,
        envMapIntensity: 1.0 * 1.3 * (0.55 + 0.45 * L),
        fog: true
    });
    const wallConcreteMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: wallTpl.map,
        bumpMap: wallTpl.bumpMap,
        bumpScale: 1.0,
        roughness: studioRough * 0.5,
        metalness: 0.1,
        envMapIntensity: 1.0 * (0.55 + 0.45 * L),
        fog: true
    });

    scene.roomGroup = new THREE.Group();
    const hw = scene.roomHalfW;
    const hd = scene.roomHalfD;
    const floorTopY = scene.floorTopY;
    const ceilingY = scene.ceilingY;
    const wallH = ceilingY - floorTopY;
    const wallCenterY = floorTopY + wallH * 0.5;
    const slab = 24;

    const floorGeo = new THREE.BoxGeometry(hw * 2, slab, hd * 2, 1, 1, 1);
    const floor = new THREE.Mesh(floorGeo, floorConcreteMat);
    floor.position.set(0, floorTopY - slab * 0.5, 0);
    floor.receiveShadow = true;
    floor.castShadow = false;
    scene.roomGroup.add(floor);

    const mkWall = (w, height, d, px, py, pz) => {
        const geo = new THREE.BoxGeometry(w, height, d, 1, 1, 1);
        const mesh = new THREE.Mesh(geo, wallConcreteMat);
        mesh.position.set(px, py, pz);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        scene.roomGroup.add(mesh);
    };

    mkWall(slab, wallH, hd * 2, -hw - slab * 0.5, wallCenterY, 0);
    mkWall(slab, wallH, hd * 2, hw + slab * 0.5, wallCenterY, 0);
    mkWall(hw * 2, wallH, slab, 0, wallCenterY, -hd - slab * 0.5);
    mkWall(hw * 2, wallH, slab, 0, wallCenterY, hd + slab * 0.5);

    scene.scene.add(scene.roomGroup);
}

/**
 * 壁の 3D タイトルテキストの初期化
 */
export async function initWallMatteBlack3DText(scene) {
    if (scene.wallTitleGroup) return;

    return new Promise((resolve) => {
        const loader = new FontLoader();
        loader.load(
            helvetikerFontUrl,
            (font) => {
                const mat = new THREE.MeshStandardMaterial({
                    color: 0x101318,
                    roughness: 0.22,
                    metalness: 0.22,
                    envMapIntensity: 1.05,
                    clearcoat: 0.88,
                    clearcoatRoughness: 0.14,
                    flatShading: false,
                    fog: true
                });
                scene._wallTitleMaterial = mat;

                const group = new THREE.Group();
                const hd = scene.roomHalfD;
                const wallH = scene.ceilingY - scene.floorTopY;
                const wallCenterY = scene.floorTopY + wallH * 0.5;
                const zText = -hd + 95;

                const addLine = (text, size, extrudeDepth, y) => {
                    const bt = Math.max(3, size * 0.05);
                    const bs = Math.max(2.2, size * 0.038);
                    const geo = new TextGeometry(text, {
                        font,
                        size,
                        height: extrudeDepth,
                        curveSegments: 12,
                        bevelEnabled: true,
                        bevelThickness: bt,
                        bevelSize: bs,
                        bevelOffset: 0,
                        bevelSegments: 4
                    });
                    geo.computeBoundingBox();
                    const mesh = new THREE.Mesh(geo, mat);
                    const bb = geo.boundingBox;
                    mesh.position.set(-0.5 * (bb.max.x + bb.min.x), y, 0);
                    mesh.castShadow = false;
                    mesh.receiveShadow = true;
                    group.add(mesh);
                    return bb.max.y - bb.min.y;
                };

                let y = 180;
                const titleH = addLine('mathym | Xenomist', 280, 118, y);
                y -= titleH * 1.05 + 140;

                const bodyLines = [
                    'Real-time WebGL (Three.js). Live OSC / MIDI maps tracks to GPU effects:',
                    'instanced debris, cylinders, spheres; PBR concrete room, HDR environment.',
                    'Pipeline: SSAO, bloom, DOF, ACES tone map, film grain. Procedural noise fields,',
                    'audio-reactive spawn, instancing, and camera focus driven by scene activity.'
                ];
                for (const line of bodyLines) {
                    const h = addLine(line, 68, 34, y);
                    y -= h * 1.12 + 28;
                }

                group.position.set(0, wallCenterY + wallH * 0.02, zText);
                scene.wallTitleGroup = group;
                scene.scene.add(group);
                resolve();
            },
            undefined,
            () => resolve()
        );
    });
}

/**
 * ライトの設定
 */
export function setupLights(scene) {
    scene.fillPointLight = null;
    scene.pulsePointLight = null;

    const { promoWallLightTarget, promoWallFillLight } = setupStudioRoomPromoWallFillLight(scene.scene, {
        ceilingY: scene.ceilingY
    });
    scene.promoWallLightTarget = promoWallLightTarget;
    scene.promoWallFillLight = promoWallFillLight;
}

/**
 * レーザースキャンの初期化
 */
export function initLaserScan(scene) {
    if (scene.laserScanMesh) return;
    scene._laserScanMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0a0a,
        emissive: 0xff0033,
        emissiveIntensity: 32,
        metalness: 0,
        roughness: 0.22,
        fog: true,
        side: THREE.DoubleSide
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    scene.laserScanMesh = new THREE.Mesh(geo, scene._laserScanMaterial);
    scene.laserScanMesh.frustumCulled = false;
    scene.laserScanMesh.renderOrder = 2;
    scene.scene.add(scene.laserScanMesh);
}

/**
 * レーザーの位相計算
 */
export function getLaserMeasurePhase(scene, TICK_LOOP) {
    const tpm = TICK_LOOP / 96;
    if (scene.actualTick != null && Number.isFinite(Number(scene.actualTick))) {
        const t = Number(scene.actualTick);
        const mod = ((Math.floor(t) % tpm) + tpm) % tpm;
        return mod / tpm;
    }
    const beat = scene.time * 0.52;
    return beat - Math.floor(beat);
}

/**
 * 壁レーザースキャンの更新
 */
export function updateWallLaserScan(scene, TICK_LOOP) {
    if (!scene.laserScanMesh) return;

    const hw = scene.roomHalfW;
    const hd = scene.roomHalfD;
    const inset = 44;
    const iw = hw - inset;
    const id = hd - inset;
    const edgeX = 2 * iw;
    const edgeZ = 2 * id;
    const P = 2 * edgeX + 2 * edgeZ;
    const phase = getLaserMeasurePhase(scene, TICK_LOOP);
    const s = phase * P;
    const beamW = Math.min(2200, edgeX * 0.48, edgeZ * 0.48);
    const y = scene._wallCenterY;

    let x, z, rotY, segLen;

    if (s < edgeX) {
        x = -iw + s; z = -id; rotY = 0; segLen = edgeX;
    } else if (s < edgeX + edgeZ) {
        const u = s - edgeX;
        x = iw; z = -id + u; rotY = Math.PI / 2; segLen = edgeZ;
    } else if (s < edgeX + edgeZ + edgeX) {
        const u = s - edgeX - edgeZ;
        x = iw - u; z = id; rotY = Math.PI; segLen = edgeX;
    } else {
        const u = s - edgeX - edgeZ - edgeX;
        x = -iw; z = id - u; rotY = -Math.PI / 2; segLen = edgeZ;
    }

    const w = Math.min(beamW, segLen * 0.98);
    const h = 56;
    scene.laserScanMesh.scale.set(w, h, 1);
    scene.laserScanMesh.position.set(x, y, z);
    scene.laserScanMesh.rotation.set(0, rotY, 0);
}
