import * as THREE from 'three';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import { Scene2Particle } from './Scene2Particle.js';
import { setRandomEmeraldColor, setHeatmapColorFromUnit } from './scene2.helpers.js';

/**
 * Scene2 パーティクル（立方体インスタンス）関連のロジック
 */

/**
 * 立方体インスタンスの作成
 */
export function createSpheres(scene) {
    const n = scene.sphereCount;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    {
        const nv = geo.attributes.position.count;
        const white = new Float32Array(nv * 3);
        white.fill(1);
        geo.setAttribute('color', new THREE.BufferAttribute(white, 3));
    }
    const textures = scene.useHeatmapParticleColors ? null : generateEmeraldGemTextures();
    /** ヒートマップ時は緑アルbedo／透過を使わない（頂点色 × map で暖色が消えるのを防ぐ） */
    const mat = scene.useHeatmapParticleColors
        ? new THREE.MeshStandardMaterial({
            color: 0x888888, // 0x444444 -> 0x888888
            roughness: 0.38,
            metalness: 0.06,
            envMapIntensity: 1.35,
            fog: true,
            vertexColors: false // ヒートマップを使わないので頂点色は不要
        })
        : new THREE.MeshPhysicalMaterial({
            color: 0x888888, // 0x333333 -> 0x888888
            roughness: 0.16,
            metalness: 0.6, // キラキラ感アップ
            clearcoat: 1.0, // クリアコート最大
            clearcoatRoughness: 0.05,
            envMapIntensity: 2.5, // 環境反射を大幅強化
            specularIntensity: 1.5,
            transmission: 0.0, // 透過を完全にオフにして緑っぽさを排除
            thickness: 0.0,
            ior: 1.6,
            attenuationColor: new THREE.Color(0xffffff), // 無彩色に
            attenuationDistance: 1.0,
            emissive: new THREE.Color(0x000000), // エミッシブもオフ
            emissiveIntensity: 0.0,
            fog: true,
            vertexColors: false // 頂点色は使わずベースカラーのみ
        });
    if (scene.scene?.environment) mat.envMap = scene.scene.environment;

    scene.instancedMeshManager = new InstancedMeshManager(scene.scene, geo, mat, n);
    const mainMesh = scene.instancedMeshManager.getMainMesh();
    mainMesh.castShadow = true;
    mainMesh.receiveShadow = true;

    for (let i = 0; i < n; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = Math.pow(Math.random(), 1.5) * scene.spawnRadius;
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        let worldR;
        const sizeRand = Math.random();
        if (sizeRand < 0.7) worldR = 10 + Math.random() * 10;
        else if (sizeRand < 0.95) worldR = 20 + Math.random() * 12;
        else worldR = 32 + Math.random() * 14;

        const scale = new THREE.Vector3(worldR, worldR, worldR);
        const radius = Math.max(scale.x, scale.y, scale.z) * 0.5;
        const p = new Scene2Particle(x, y, z, radius, scale);
        p.angularVelocity.multiplyScalar(2.0);
        scene.particles.push(p);

        if (scene.useHeatmapParticleColors) {
            setHeatmapColorFromUnit(0, scene._colorTmp);
        } else {
            // 岩石風の濃い無彩色ランダム
            const gray = 0.1 + Math.random() * 0.25;
            scene._colorTmp.setRGB(gray, gray, gray);
        }
        scene.instancedMeshManager.setColorAt(i, scene._colorTmp);
        scene.instancedMeshManager.setMatrixAt(i, p.position, p.rotation, p.scale);
    }
    scene.instancedMeshManager.markColorsNeedsUpdate();
    scene.instancedMeshManager.markNeedsUpdate();
    scene.setParticleCount(n);
}

/**
 * 物理演算の更新
 */
export function updatePhysics(scene, deltaTime) {
    const subSteps = 2;
    const dt = deltaTime / subSteps;
    const halfSize = 4950;
    const tempVec = new THREE.Vector3();
    const visibleCount = Math.min(scene.currentVisibleCount || 0, scene.particles.length);
    const heatSmooth = scene.heatmapColorSmoothing ?? 0.45;
    const heatGamma = scene.heatmapResponseGamma ?? 0.4;
    const heatVelBlend = scene.heatmapVelocityBlend ?? 0;

    if (scene.useHeatmapParticleColors) {
        for (let i = 0; i < visibleCount; i++) {
            scene.particles[i].frameForceMax = 0;
        }
    }

    for (let s = 0; s < subSteps; s++) {
        scene.grid.clear();
        for (let i = 0; i < visibleCount; i++) {
            const p = scene.particles[i];
            const gx = Math.floor(p.position.x / scene.gridSize);
            const gy = Math.floor(p.position.y / scene.gridSize);
            const gz = Math.floor(p.position.z / scene.gridSize);
            const key = (gx + 100) + (gy + 100) * 200 + (gz + 100) * 40000;
            if (!scene.grid.has(key)) scene.grid.set(key, []);
            scene.grid.get(key).push(i);
        }

        for (let idx = 0; idx < visibleCount; idx++) {
            const p = scene.particles[idx];

            if (scene.currentMode === scene.MODE_DRIFT_FIELD) {
                const x = p.position.x;
                const y = p.position.y;
                const z = p.position.z;
                const tt = scene.time;
                const fx = Math.sin(y * 0.0011 + tt * 0.37) * Math.cos(z * 0.00085 + tt * 0.21);
                const fy = Math.sin(z * 0.001 + tt * 0.29) * Math.cos(x * 0.00092 + tt * 0.18);
                const fz = Math.sin(x * 0.00115 + tt * 0.33) * Math.cos(y * 0.00088 + tt * 0.24);
                tempVec.set(fx, fy, fz).multiplyScalar(38 * p.strayFactor);
                p.addForce(tempVec);
            } else if (scene.currentMode === scene.MODE_UPTHRUST) {
                p.velocity.multiplyScalar(0.97);
                tempVec.set(0, 14 * p.strayFactor, 0);
                p.addForce(tempVec);
            } else if (scene.currentMode === scene.MODE_HELIX_RAIL) {
                const R = 820 * p.strayRadiusOffset;
                const pitch = 0.42;
                const theta = idx * 0.12 + p.phaseOffset * 0.4 + scene.time * 0.38;
                const ty = (theta * pitch * 180) % 4200 - 400;
                const tx = Math.cos(theta) * R;
                const tz = Math.sin(theta) * R;
                p.velocity.y *= 0.9;
                const spiralSpringK = 0.048 * p.strayFactor;
                tempVec.set((tx - p.position.x) * spiralSpringK, 0, (tz - p.position.z) * spiralSpringK);
                p.addForce(tempVec);
                const hSpring = 0.035 * p.strayFactor;
                tempVec.set(0, (ty - p.position.y) * hSpring, 0);
                p.addForce(tempVec);
            } else if (scene.currentMode === scene.MODE_LEMNISCATE) {
                const t = scene.time * 0.52 + idx * 0.0012 + p.phaseOffset;
                const a = 900 * p.strayRadiusOffset;
                const tx = (a * Math.sin(t)) / (1 + Math.sin(t) * Math.sin(t));
                const ty = 700 + a * 0.5 * Math.sin(t) * Math.cos(t);
                const tz = a * 0.55 * Math.sin(2 * t + 0.3);
                const springK = 0.012 * p.strayFactor;
                tempVec.set((tx - p.position.x) * springK, (ty - p.position.y) * springK, (tz - p.position.z) * springK);
                p.addForce(tempVec);
            } else if (scene.currentMode === scene.MODE_HONEYCOMB) {
                const q = idx % 56;
                const r = Math.floor(idx / 56) % 44;
                const size = 95;
                const tx = size * (1.5 * q) + p.targetOffset.x * 0.04;
                const tz = size * (0.5 * Math.sqrt(3) * q + Math.sqrt(3) * r) + p.targetOffset.z * 0.04;
                const ty = (q * 0.12 + r * 0.09) * 55 + 520 + p.targetOffset.y * 0.05;
                const wallSpringK = 0.011 * p.strayFactor;
                tempVec.set((tx - p.position.x) * wallSpringK, (ty - p.position.y) * wallSpringK, (tz - p.position.z) * wallSpringK);
                p.addForce(tempVec);
            } else if (scene.currentMode === scene.MODE_BEAT_INTERFERENCE) {
                const w1 = 1.07;
                const w2 = 1.19;
                const cols = Math.floor(Math.sqrt(scene.sphereCount));
                const spacing = 4200 / cols;
                const tx = ((idx % cols) - cols * 0.5) * spacing + p.targetOffset.x * 0.06;
                const tz = (Math.floor(idx / cols) - cols * 0.5) * spacing + p.targetOffset.z * 0.06;
                const ty = 820 + Math.sin(w1 * scene.time + idx * 0.07) * 520 * p.strayRadiusOffset + Math.sin(w2 * scene.time + idx * 0.11) * 380 * p.strayRadiusOffset;
                const waveSpringK = 0.01 * p.strayFactor;
                tempVec.set((tx - p.position.x) * waveSpringK, (ty - p.position.y) * waveSpringK, (tz - p.position.z) * waveSpringK);
                p.addForce(tempVec);
            } else if (scene.currentMode === scene.MODE_BINARY_ROTATE) {
                const t = scene.time * 0.24;
                const cx = Math.cos(t) * 780;
                const cz = Math.sin(t) * 780;
                const c1x = cx; const c1z = cz;
                const c2x = -cx; const c2z = -cz;
                const soft = 120;
                const d1 = Math.hypot(p.position.x - c1x, p.position.z - c1z) + soft;
                const d2 = Math.hypot(p.position.x - c2x, p.position.z - c2z) + soft;
                const pull = 52000 * p.strayFactor;
                tempVec.set(
                    ((c1x - p.position.x) * pull) / (d1 * d1) + ((c2x - p.position.x) * pull) / (d2 * d2),
                    ((900 - p.position.y) * 0.022 * p.strayFactor),
                    ((c1z - p.position.z) * pull) / (d1 * d1) + ((c2z - p.position.z) * pull) / (d2 * d2)
                );
                p.addForce(tempVec);
            } else if (scene.currentMode === scene.MODE_DNA_HELIX) {
                const strand = idx % 2;
                const along = Math.floor(idx / 2);
                const theta = along * 0.065 + scene.time * 0.48 + p.phaseOffset;
                const R = 340 * p.strayRadiusOffset;
                const rise = along * 2.4 - 900;
                const tx = Math.cos(theta + strand * Math.PI) * R;
                const tz = Math.sin(theta + strand * Math.PI) * R;
                const ty = rise + strand * 55 + 1100;
                const pillarSpringK = 0.0115 * p.strayFactor;
                tempVec.set((tx - p.position.x) * pillarSpringK, (ty - p.position.y) * pillarSpringK, (tz - p.position.z) * pillarSpringK);
                p.addForce(tempVec);
            } else if (scene.currentMode === scene.MODE_TOROIDAL_VORTEX) {
                const xz = Math.sqrt(p.position.x * p.position.x + p.position.z * p.position.z) + 1e-4;
                const s = 0.016 * p.strayFactor;
                const fx = -p.position.z * s;
                const fz = p.position.x * s;
                const fy = Math.sin((xz - 820) * 0.0031 + scene.time * 0.5) * 0.45 * p.strayFactor;
                tempVec.set(fx, fy, fz);
                p.addForce(tempVec);
            } else if (scene.currentMode === scene.MODE_TRIPLE_WELL) {
                const wells = [[0, 900, 0], [-520, 750, 420], [480, 820, -380]];
                let fx = 0; let fy = 0; let fz = 0;
                for (let w = 0; w < 3; w++) {
                    const dx = wells[w][0] - p.position.x;
                    const dy = wells[w][1] - p.position.y;
                    const dz = wells[w][2] - p.position.z;
                    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 90;
                    const pull = (420 * p.strayFactor) / d;
                    fx += (dx / d) * pull; fy += (dy / d) * pull; fz += (dz / d) * pull;
                }
                tempVec.set(fx, fy, fz);
                p.addForce(tempVec);
            } else if (scene.currentMode === scene.MODE_PRECESS_ORBIT) {
                const t = scene.time * 0.44 + idx * 0.0011;
                const pre = scene.time * 0.1 + p.phaseOffset * 0.2;
                const a = 640 * p.strayRadiusOffset;
                const b = 400 * p.strayRadiusOffset;
                const x0 = Math.cos(pre) * (a * Math.cos(t)) - Math.sin(pre) * (b * Math.sin(t));
                const z0 = Math.sin(pre) * (a * Math.cos(t)) + Math.cos(pre) * (b * Math.sin(t));
                const y0 = 920 + Math.sin(t * 2.1 + p.phaseOffset) * 220;
                const springK = 0.012 * p.strayFactor;
                tempVec.set((x0 - p.position.x) * springK, (y0 - p.position.y) * springK, (z0 - p.position.z) * springK);
                p.addForce(tempVec);
            } else {
                const tx = p.targetOffset.x;
                const ty = p.targetOffset.y + 200;
                const tz = p.targetOffset.z;
                const defSpringK = 0.0005 * p.strayFactor;
                tempVec.set((tx - p.position.x) * defSpringK, (ty - p.position.y) * defSpringK, (tz - p.position.z) * defSpringK);
                p.addForce(tempVec);
            }

            if (scene.useHeatmapParticleColors) {
                const fl = p.force.length();
                const capped = Math.min(fl, p.maxForce);
                if (capped > p.frameForceMax) p.frameForceMax = capped;
            }

            p.update();
            p.velocity.multiplyScalar(0.95);

            if (scene.useWallCollision) {
                if (p.position.x > halfSize) { p.position.x = halfSize; p.velocity.x *= -0.3; }
                if (p.position.x < -halfSize) { p.position.x = -halfSize; p.velocity.x *= -0.3; }
                if (p.position.y > 4500) {
                    if (scene.currentMode === scene.MODE_HELIX_RAIL) {
                        p.position.y = -450; p.velocity.y *= 0.1;
                    } else {
                        p.position.y = 4500; p.velocity.y *= -0.3;
                    }
                }
                if (p.position.y < -450) {
                    p.position.y = -450; p.velocity.y *= -0.1;
                    const rollFactor = 0.05 / (p.radius / 30);
                    p.angularVelocity.z = -p.velocity.x * rollFactor;
                    p.angularVelocity.x = p.velocity.z * rollFactor;
                    p.velocity.x *= 0.98; p.velocity.z *= 0.98;
                }
                if (p.position.z > halfSize) { p.position.z = halfSize; p.velocity.z *= -0.3; }
                if (p.position.z < -halfSize) { p.position.z = -halfSize; p.velocity.z *= -0.3; }
            }
            p.updateRotation(dt);
        }
    }

    if (scene.instancedMeshManager) {
        if (scene.useHeatmapParticleColors) {
            let globalForceMax = 0;
            for (let i = 0; i < visibleCount; i++) {
                const f = scene.particles[i].frameForceMax;
                if (f > globalForceMax) globalForceMax = f;
            }
            const denom = Math.max(globalForceMax, 1e-5);

            for (let i = 0; i < visibleCount; i++) {
                const p = scene.particles[i];
                const rel = Math.min(1, p.frameForceMax / denom);
                const vRel = Math.min(1, p.velocity.length() / Math.max(p.maxSpeed, 1e-6));
                let target = rel * (1 - heatVelBlend) + vRel * heatVelBlend;
                target = Math.pow(THREE.MathUtils.clamp(target, 0, 1), heatGamma);
                p.heatVisual += (target - p.heatVisual) * heatSmooth;
                setHeatmapColorFromUnit(p.heatVisual, scene._colorTmp);
                scene.instancedMeshManager.setColorAt(i, scene._colorTmp);
            }
            scene.instancedMeshManager.markColorsNeedsUpdate();
        }
        for (let i = 0; i < visibleCount; i++) {
            const p = scene.particles[i];
            scene.instancedMeshManager.setMatrixAt(i, p.position, p.rotation, p.scale);
        }
        scene.instancedMeshManager.markNeedsUpdate();
    }
}

/**
 * 拡散エフェクトのトリガー
 */
export function triggerExpandEffect(scene, velocity = 127) {
    const center = new THREE.Vector3(
        (Math.random() - 0.5) * scene.spawnRadius * 0.4,
        (Math.random() - 0.5) * scene.spawnRadius * 0.4,
        (Math.random() - 0.5) * scene.spawnRadius * 0.4
    );
    const explosionRadius = 2000;
    const vFactor = velocity / 127.0;
    const explosionForce = 250.0 * vFactor;

    scene.particles.forEach((p) => {
        const diff = p.position.clone().sub(center);
        const dist = diff.length();
        if (dist < explosionRadius) {
            const strength = Math.pow(1.0 - dist / explosionRadius, 2.0) * explosionForce;
            p.addForce(diff.normalize().multiplyScalar(strength));
        }
    });
}

/**
 * 内部ユーティリティ：エメラルド内部のシラー・クラック風テクスチャ
 */
function generateEmeraldGemTextures() {
    const size = 512;
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = size; colorCanvas.height = size;
    const cCtx = colorCanvas.getContext('2d');
    const baseGrad = cCtx.createLinearGradient(0, 0, size, size);
    baseGrad.addColorStop(0, '#145a42');
    baseGrad.addColorStop(0.45, '#228f68');
    baseGrad.addColorStop(1, '#186648');
    cCtx.fillStyle = baseGrad;
    cCtx.fillRect(0, 0, size, size);
    for (let i = 0; i < 55; i++) {
        const x = Math.random() * size; const y = Math.random() * size; const r = 6 + Math.random() * 36;
        const grad = cCtx.createRadialGradient(x, y, 0, x, y, r);
        const g = 165 + Math.random() * 75;
        const rCh = 45 + Math.random() * 55;
        grad.addColorStop(0, `rgba(${rCh}, ${g}, ${95 + Math.random() * 55}, 0.48)`);
        grad.addColorStop(1, 'rgba(24, 90, 65, 0)');
        cCtx.fillStyle = grad; cCtx.beginPath(); cCtx.arc(x, y, r, 0, Math.PI * 2); cCtx.fill();
    }
    for (let i = 0; i < 220; i++) {
        const x = Math.random() * size; const y = Math.random() * size; const r = 0.4 + Math.random() * 1.8;
        const deep = Math.random() > 0.5;
        cCtx.fillStyle = deep
            ? 'rgba(18, 72, 52, 0.42)'
            : `rgba(${70 + Math.random() * 50}, ${175 + Math.random() * 60}, ${110 + Math.random() * 50}, 0.4)`;
        cCtx.beginPath(); cCtx.arc(x, y, r, 0, Math.PI * 2); cCtx.fill();
    }
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = size; bumpCanvas.height = size;
    const bCtx = bumpCanvas.getContext('2d');
    bCtx.fillStyle = '#9ec4b0'; bCtx.fillRect(0, 0, size, size);
    bCtx.strokeStyle = 'rgba(28, 72, 52, 0.45)';
    for (let i = 0; i < 28; i++) {
        bCtx.lineWidth = 0.8 + Math.random() * 2.2;
        let x = Math.random() * size; let y = Math.random() * size;
        bCtx.beginPath(); bCtx.moveTo(x, y);
        for (let j = 0; j < 8; j++) { x += (Math.random() - 0.5) * 58; y += (Math.random() - 0.5) * 58; bCtx.lineTo(x, y); }
        bCtx.stroke();
    }
    for (let i = 0; i < 95; i++) {
        const x = Math.random() * size; const y = Math.random() * size; const r = 4 + Math.random() * 22;
        const grad = bCtx.createRadialGradient(x, y, 0, x, y, r);
        const val = Math.random() > 0.35 ? 240 : 45;
        grad.addColorStop(0, `rgba(${val}, ${val}, ${val}, 0.45)`);
        grad.addColorStop(1, 'rgba(128, 138, 132, 0)');
        bCtx.fillStyle = grad; bCtx.beginPath(); bCtx.arc(x, y, r, 0, Math.PI * 2); bCtx.fill();
    }
    const colorTex = new THREE.CanvasTexture(colorCanvas);
    colorTex.wrapS = colorTex.wrapT = THREE.RepeatWrapping;
    colorTex.colorSpace = THREE.SRGBColorSpace;
    const bumpTex = new THREE.CanvasTexture(bumpCanvas);
    bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
    return { map: colorTex, bumpMap: bumpTex };
}
