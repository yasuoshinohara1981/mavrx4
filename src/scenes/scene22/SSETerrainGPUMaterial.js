/**
 * SSE 地形用 GPU マテリアル（メッシュ物理スライド + uniform offset 方式）
 *
 * ノイズ入力 = position.xz + uWorldOffset
 * メッシュは物理的にスライドするが、各頂点の高さはローカル座標に固定する。
 * これにより「一度生成された地形が毎フレーム微妙に変わる」現象を防ぐ。
 * uWorldOffset は初期シード位置とフローティングオリジンのスナップ補正にのみ使う。
 */

import * as THREE from 'three';
import { TERRAIN_HEIGHT_AMPLITUDE } from './TerrainSampler.js';

const AMP = TERRAIN_HEIGHT_AMPLITUDE.toFixed(1);

const TERRAIN_GLSL_CORE = `
uniform float uSSEYOffset;
uniform float uSSETerrainEps;
uniform vec2  uWorldOffset;

float sseHash01(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float sseValueNoise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = sseHash01(i);
  float b = sseHash01(i + vec2(1.0, 0.0));
  float c = sseHash01(i + vec2(0.0, 1.0));
  float d = sseHash01(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float sseFbm(vec2 p, int octaves) {
  float amp = 0.5;
  float freq = 1.0;
  float sum = 0.0;
  float norm = 0.0;
  for (int o = 0; o < 8; o++) {
    if (o >= octaves) break;
    sum += sseValueNoise2D(p * freq) * amp;
    norm += amp;
    freq *= 2.02;
    amp *= 0.5;
  }
  return sum / max(norm, 1e-5);
}

float sseTerrainH(float worldX, float worldZ) {
  const float MACRO_SCALE = 0.00058;
  const float MID_SCALE   = 0.0021;
  const float DETAIL_SCALE = 0.0095;
  const float CONTINENT_SCALE = 0.000072;
  const float ULTRA_SCALE = 0.000018;
  const float AMPF = ${AMP};

  float nx = worldX * MACRO_SCALE;
  float nz = worldZ * MACRO_SCALE;
  float warpX = ((sseFbm(vec2(nx * 1.35 + 2.7, nz * 1.05 - 4.2), 3) - 0.5) * 2.0) * 2.15;
  float warpZ = ((sseFbm(vec2(nx * 1.08 + 11.1, nz * 1.42 + 6.8), 3) - 0.5) * 2.0) * 2.45;
  float mx = nx + warpX;
  float mz = nz + warpZ;

  float macro = (sseFbm(vec2(mx + 19.2, mz - 11.7), 5) - 0.5) * 2.0;
  float mid = (sseFbm(vec2(worldX * MID_SCALE + 3.1, worldZ * MID_SCALE - 7.4), 4) - 0.5) * 2.0;
  float ridgeInput = sseFbm(vec2(worldX * 0.00155 + 101.0, worldZ * 0.00148 - 55.0), 4);
  float ridged = 1.0 - abs((ridgeInput - 0.5) * 2.0);
  float ridgePow = ridged * ridged;
  float detail = (sseFbm(vec2(worldX * DETAIL_SCALE, worldZ * DETAIL_SCALE), 3) - 0.5) * 2.0;
  float continent = (sseFbm(vec2(worldX * CONTINENT_SCALE - 413.2, worldZ * CONTINENT_SCALE + 271.9), 4) - 0.5) * 2.0;
  float ultra = (sseFbm(vec2(worldX * ULTRA_SCALE + 1903.7, worldZ * ULTRA_SCALE - 884.4), 3) - 0.5) * 2.0;

  float region = max(macro * 0.5 + 0.5, 0.0);
  float midW  = 0.35 + region * 0.65;
  float ridgeW = 0.22 + region * 0.55;

  float h = macro * 0.36 + mid * midW * 0.36 + ridgePow * ridgeW * 0.44
          + detail * 0.11 + continent * 0.2 + ultra * 0.12;
  return h * AMPF;
}
`;

const TERRAIN_VERT_PREFIX = TERRAIN_GLSL_CORE + `
varying float vSSEH;
varying vec3  vSandTint;
`;

/**
 * @param {object} o
 * @param {number} o.yOffset
 * @param {number} o.terrainEps
 * @param {THREE.Texture|null} [o.envMap]
 * @param {number} [o.envMapIntensity]
 * @param {number} [o.roughness]
 * @param {number} [o.metalness]
 * @returns {THREE.MeshStandardMaterial}
 */
export function createSSETerrainGPUMaterial(o) {
    const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: o.roughness ?? 1,
        metalness: o.metalness ?? 0,
        envMap: o.envMap ?? null,
        envMapIntensity: o.envMapIntensity ?? 0.12,
        fog: true,
        vertexColors: false
    });

    mat.userData.sseGpuTerrain = true;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = 1;
    mat.polygonOffsetUnits = 1;

    const worldOffsetUniform = { value: new THREE.Vector2(0, 0) };
    mat.userData.worldOffsetUniform = worldOffsetUniform;

    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uSSEYOffset = { value: o.yOffset ?? 0 };
        shader.uniforms.uSSETerrainEps = { value: o.terrainEps ?? 12 };
        shader.uniforms.uWorldOffset = worldOffsetUniform;
        shader.vertexShader = TERRAIN_VERT_PREFIX + shader.vertexShader;

        // ノイズ入力は local position に固定する。mesh.position を混ぜると
        // 同じ頂点の高さが毎フレーム変わって「地形が再生成される」見え方になる。
        shader.vertexShader = shader.vertexShader.replace(
            '#include <beginnormal_vertex>',
            `
vec3 objectNormal;
{
  float wxn = position.x + uWorldOffset.x;
  float wzn = position.z + uWorldOffset.y;
  float te = max(3.5, uSSETerrainEps);
  float h0 = sseTerrainH(wxn, wzn);
  float hx = sseTerrainH(wxn + te, wzn);
  float hz = sseTerrainH(wxn, wzn + te);
  vSSEH = h0;
  objectNormal = normalize(cross(vec3(0.0, hz - h0, te), vec3(te, hx - h0, 0.0)));
}
            `
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
#include <begin_vertex>
{
  float wx = position.x + uWorldOffset.x;
  float wz = position.z + uWorldOffset.y;
  transformed.y = vSSEH + uSSEYOffset;

  float sm = sseFbm(vec2(wx * 0.00011 + 2.3, wz * 0.00013 - 4.1), 2);
  sm = clamp(sm, 0.0, 1.0);
  float dune = sseValueNoise2D(vec2(wx * 0.00016 - 31.0, wz * 0.00019 + 14.0));
  float crest = clamp(vSSEH / (${AMP} * 0.9) * 0.5 + 0.5, 0.0, 1.0);
  vec3 sandL = vec3(0.96, 0.84, 0.58);
  vec3 sandM = vec3(0.84, 0.67, 0.38);
  vec3 sandD = vec3(0.58, 0.44, 0.25);
  vec3 c = mix(sandL, sandM, sm);
  c = mix(c, vec3(0.99, 0.90, 0.67), dune * 0.18);
  float spot = sseValueNoise2D(vec2(wx * 0.00035 + 17.0, wz * 0.00032 + 9.0));
  c = mix(c, sandD, spot * spot * 0.42);
  c = mix(c, vec3(0.98, 0.88, 0.62), crest * 0.12);
  vSandTint = c;
}
            `
        );

        shader.fragmentShader = 'varying vec3 vSandTint;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `
#include <color_fragment>
diffuseColor.rgb *= vSandTint;
            `
        );
    };
    mat.customProgramCacheKey = () => 'sseGpuTerrain_v9';

    const depthMat = new THREE.MeshDepthMaterial({
        depthPacking: THREE.BasicDepthPacking
    });
    depthMat.polygonOffset = true;
    depthMat.polygonOffsetFactor = 1;
    depthMat.polygonOffsetUnits = 1;
    depthMat.onBeforeCompile = (shader) => {
        shader.uniforms.uSSEYOffset = { value: o.yOffset ?? 0 };
        shader.uniforms.uSSETerrainEps = { value: o.terrainEps ?? 12 };
        shader.uniforms.uWorldOffset = worldOffsetUniform;
        shader.vertexShader = TERRAIN_GLSL_CORE + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
#include <begin_vertex>
{
  float wx = position.x + uWorldOffset.x;
  float wz = position.z + uWorldOffset.y;
  transformed.y = sseTerrainH(wx, wz) + uSSEYOffset;
}
            `
        );
    };
    depthMat.customProgramCacheKey = () => 'sseGpuDepth_v9';
    mat.customDepthMaterial = depthMat;

    return mat;
}
