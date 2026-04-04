import * as THREE from 'three';
import {
    StudioBox,
    applyStudioRoomFloorWallEnvMaps,
    setupStudioRoomPromoWallFillLight
} from '../../lib/presentation/index.js';
import { generateRockPBRTextures } from '../../lib/RockPBRTextures.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import helvetikerFontUrl from 'three/examples/fonts/helvetiker_regular.typeface.json?url';

/**
 * Scene2 部屋・ライト・レーザー関連のロジック
 */

/**
 * 部屋の構築（床・壁）
 */
export function buildRoom(scene) {
    const L = scene.sceneLightingScale ?? 1;
    const rockTex = generateRockPBRTextures(1024, { seed: 456, maxAnisotropy: 8 });

    // 床メッシュの作成（岩石質感）
    const floorConcreteMat = new THREE.MeshStandardMaterial({
        color: 0x888888, // 0xffffff から 0x888888 (テクスチャが乗るので中間色)
        map: rockTex.map,
        normalMap: rockTex.normalMap,
        roughnessMap: rockTex.roughnessMap,
        aoMap: rockTex.aoMap,
        roughness: 0.8,
        metalness: 0.2,
        envMapIntensity: 2.5 * 1.3 * (0.55 + 0.45 * L), // 反射を大幅強化
        fog: true
    });
    const slab = 24;
    const floorGeo = new THREE.BoxGeometry(scene.roomHalfW * 2, slab, scene.roomHalfD * 2, 1, 1, 1);
    const floor = new THREE.Mesh(floorGeo, floorConcreteMat);
    floor.position.set(0, scene.floorTopY - slab * 0.5, 0);
    floor.receiveShadow = true;
    floor.castShadow = false;
    scene.roomGroup = new THREE.Group();
    scene.roomGroup.add(floor);

    // 壁メッシュの作成（岩石質感）
    const wallConcreteMat = new THREE.MeshStandardMaterial({
        color: 0x888888,
        map: rockTex.map,
        normalMap: rockTex.normalMap,
        roughnessMap: rockTex.roughnessMap,
        aoMap: rockTex.aoMap,
        roughness: 0.8,
        metalness: 0.2,
        envMapIntensity: 2.5 * (0.55 + 0.45 * L), // 反射を大幅強化
        fog: true
    });
    const wallH = scene.ceilingY - scene.floorTopY;
    const wallCenterY = scene.floorTopY + wallH * 0.5;
    const mkWall = (w, height, d, px, py, pz) => {
        const geo = new THREE.BoxGeometry(w, height, d, 1, 1, 1);
        const mesh = new THREE.Mesh(geo, wallConcreteMat);
        mesh.position.set(px, py, pz);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        scene.roomGroup.add(mesh);
    };
    mkWall(slab, wallH, scene.roomHalfD * 2, -scene.roomHalfW - slab * 0.5, wallCenterY, 0);
    mkWall(slab, wallH, scene.roomHalfD * 2, scene.roomHalfW + slab * 0.5, wallCenterY, 0);
    mkWall(scene.roomHalfW * 2, wallH, slab, 0, wallCenterY, -scene.roomHalfD - slab * 0.5);
    mkWall(scene.roomHalfW * 2, wallH, slab, 0, wallCenterY, scene.roomHalfD + slab * 0.5);

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
                const titleH = addLine('mathym | Xenofog', 280, 118, y);
                y -= titleH * 1.05 + 140;

                const bodyLines = [
                    'Scene 2: Emerald Swarm. Instanced cubes with procedural motion fields.',
                    '11 motion modes: drift, upthrust, helix, lemniscate, and more.',
                    'Audio-reactive expansion effects and real-time PBR environment.',
                    'Unified StudioBox pipeline with SSAO, bloom, and depth of field.'
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

    if (scene.voidBlackSoloMode) {
        setupVoidBlackFillLights(scene);
        scene.promoWallLightTarget = null;
        scene.promoWallFillLight = null;
        return;
    }

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
    const y = scene.floorTopY + (scene.ceilingY - scene.floorTopY) * 0.5;

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

/**
 * 空気ノイズボリュームの設定
 */
export function setupAirNoiseVolume(scene) {
    const volumeGeo = new THREE.BoxGeometry(scene.roomHalfW * 2.6, scene.ceilingY * 1.3, scene.roomHalfD * 2.6);
    scene.airNoiseMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uDensity: { value: 0.036 },
            uColor: { value: new THREE.Color(0xffffff) }
        },
        vertexShader: `
            varying vec3 vWorldPos;
            void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorldPos = wp.xyz;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
        fragmentShader: `
            varying vec3 vWorldPos;
            uniform float uTime;
            uniform float uDensity;
            uniform vec3 uColor;

            float hash13(vec3 p) {
                p = fract(p * 0.1031);
                p += dot(p, p.yzx + 33.33);
                return fract((p.x + p.y) * p.z);
            }

            float noise3(vec3 p) {
                vec3 i = floor(p);
                vec3 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);

                float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
                float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
                float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
                float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
                float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
                float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
                float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
                float n111 = hash13(i + vec3(1.0, 1.0, 1.0));

                float nx00 = mix(n000, n100, f.x);
                float nx10 = mix(n010, n110, f.x);
                float nx01 = mix(n001, n101, f.x);
                float nx11 = mix(n011, n111, f.x);
                float nxy0 = mix(nx00, nx10, f.y);
                float nxy1 = mix(nx01, nx11, f.y);
                return mix(nxy0, nxy1, f.z);
            }

            float fbm(vec3 p) {
                float a = 0.5;
                float s = 0.0;
                for (int i = 0; i < 4; i++) {
                    s += a * noise3(p);
                    p = p * 2.03 + vec3(17.1, 3.7, 11.9);
                    a *= 0.5;
                }
                return s;
            }

            void main() {
                vec3 p = vWorldPos * 0.0012 + vec3(0.0, uTime * 0.02, uTime * 0.012);
                float n = fbm(p);
                float vertical = smoothstep(-500.0, 2500.0, vWorldPos.y);
                float alpha = uDensity * (0.22 + n * 0.34) * vertical;
                gl_FragColor = vec4(uColor, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.NormalBlending
    });

    scene.airNoiseVolume = new THREE.Mesh(volumeGeo, scene.airNoiseMaterial);
    scene.airNoiseVolume.position.set(0, scene.floorTopY + (scene.ceilingY - scene.floorTopY) * 0.55, 0);
    scene.scene.add(scene.airNoiseVolume);

    if (scene.voidBlackSoloMode && scene.airNoiseMaterial) {
        scene.airNoiseMaterial.uniforms.uDensity.value = 0.05;
        scene.airNoiseMaterial.uniforms.uColor.value.setHex(0x8a9aaa);
    }
}

/**
 * 黒虚空モード用の最小ライト（エメラルドの反射・チリの視認用）
 */
export function setupVoidBlackFillLights(scene) {
    scene._voidBlackSoloLights = [];
    const amb = new THREE.AmbientLight(0x335544, 0.38);
    scene.scene.add(amb);
    scene._voidBlackSoloLights.push(amb);
    const hem = new THREE.HemisphereLight(0x8fd4b8, 0x0a0a0a, 0.58);
    hem.position.set(0, 1, 0);
    scene.scene.add(hem);
    scene._voidBlackSoloLights.push(hem);
    const pt = new THREE.PointLight(0xd5fff0, 2.8, 14000, 0.45);
    pt.position.set(0, 2400, 0);
    scene.scene.add(pt);
    scene._voidBlackSoloLights.push(pt);
}
