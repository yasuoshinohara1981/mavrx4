import * as THREE from 'three';
import {
    StudioBox,
    ceilingSpotRigOptionsForStudioRoom,
    setupStudioRoomPromoWallFillLight
} from '../../lib/presentation/index.js';

/**
 * Scene2 部屋・ライト関連のロジック
 */

/**
 * 部屋の構築（床・壁・天井）
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

    const ceilingGeo = new THREE.PlaneGeometry(hw * 2, hd * 2);
    ceilingGeo.rotateX(Math.PI / 2);
    const ceilingMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        roughness: 0.8,
        metalness: 0,
        emissive: 0xffffff,
        emissiveIntensity: 8.5 * (scene.sceneLightingScale ?? 1),
        envMapIntensity: 1.0,
        fog: true
    });
    scene.ceilingMesh = new THREE.Mesh(ceilingGeo, ceilingMat);
    scene.ceilingMesh.position.set(0, ceilingY, 0);
    scene.ceilingMesh.receiveShadow = false;
    scene.ceilingMesh.castShadow = false;
    scene.roomGroup.add(scene.ceilingMesh);

    scene.scene.add(scene.roomGroup);
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
}
