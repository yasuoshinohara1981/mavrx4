import * as THREE from 'three';
import { StudioBox } from '../../lib/presentation/index.js';
import { buildModularCorridorWalls } from './scene3.complexWalls.js';
import { buildBridgeInterior } from './scene3.shipInterior.js';
import { addPanelSeamsBoltsAndLabels } from './scene3.panelDetails.js';
import { addIndustrialDetails } from './scene3.industrialDetails.js';

/**
 * Scene2 の正方形スタジオ（半幅 5000 → 一辺 10000）と同じ見かけのタイル周期（ワールド単位）
 */
const FLOOR_TILE_PERIOD_WORLD = 10000;

/**
 * Scene3 部屋：床＋モジュラー左右壁（一枚プレートではない）±Z の壁は無し
 */

export function buildRoom(scene) {
    const floorTpl = StudioBox.createFloorTileTextures();
    const L = scene.sceneLightingScale ?? 1;
    const studioRough = 0.8;

    const floorW = scene.roomHalfW * 2;
    const floorD = scene.roomHalfD * 2;
    const floorMap = floorTpl.map.clone();
    const floorBump = floorTpl.bumpMap.clone();
    floorMap.wrapS = floorMap.wrapT = THREE.RepeatWrapping;
    floorBump.wrapS = floorBump.wrapT = THREE.RepeatWrapping;
    const repU = floorW / FLOOR_TILE_PERIOD_WORLD;
    const repV = floorD / FLOOR_TILE_PERIOD_WORLD;
    floorMap.repeat.set(repU, repV);
    floorBump.repeat.set(repU, repV);
    floorMap.needsUpdate = true;
    floorBump.needsUpdate = true;

    const floorConcreteMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: floorMap,
        bumpMap: floorBump,
        bumpScale: 1.0,
        roughness: studioRough * 0.3,
        metalness: 0.2,
        envMapIntensity: 1.0 * 1.3 * (0.55 + 0.45 * L),
        fog: true
    });
    const slab = 24;
    const floorGeo = new THREE.BoxGeometry(floorW, slab, floorD, 1, 1, 1);
    const floor = new THREE.Mesh(floorGeo, floorConcreteMat);
    floor.position.set(0, scene.floorTopY - slab * 0.5, 0);
    floor.receiveShadow = true;
    floor.castShadow = false;
    scene.roomGroup = new THREE.Group();
    scene.roomGroup.add(floor);

    buildModularCorridorWalls(scene.roomGroup, scene);

    scene.scene.add(scene.roomGroup);

    buildBridgeInterior(scene);

    addPanelSeamsBoltsAndLabels(scene.roomGroup, scene);

    addIndustrialDetails(scene.roomGroup, scene);
}
