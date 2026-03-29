/**
 * Scroll Space Engine — world (X,Z) のみの決定論地形。
 * time / フレームに依存しない。
 */

/**
 * @param {number} ix
 * @param {number} iz
 * @returns {number} [0,1)
 */
function hash01(ix, iz) {
    const n = Math.sin(ix * 12.9898 + iz * 78.233) * 43758.5453;
    return n - Math.floor(n);
}

/**
 * グリッド値ノイズ（値は [0,1)）
 * @param {number} x
 * @param {number} z
 */
function valueNoise2D(x, z) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const fx = x - x0;
    const fz = z - z0;
    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);
    const a = hash01(x0, z0);
    const b = hash01(x0 + 1, z0);
    const c = hash01(x0, z0 + 1);
    const d = hash01(x0 + 1, z0 + 1);
    const x1 = a * (1 - u) + b * u;
    const x2 = c * (1 - u) + d * u;
    return x1 * (1 - v) + x2 * v;
}

/**
 * @param {number} x
 * @param {number} z
 * @param {number} octaves
 */
function fbm(x, z, octaves) {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
        sum += valueNoise2D(x * freq, z * freq) * amp;
        norm += amp;
        freq *= 2.02;
        amp *= 0.5;
    }
    return sum / norm;
}

/** 起伏の全体スケール（world Y） */
export const TERRAIN_HEIGHT_AMPLITUDE = 380;

/** 大域〜中域の入力スケール */
const MACRO_SCALE = 0.00058;
const MID_SCALE = 0.0021;
const DETAIL_SCALE = 0.0095;
/** 帯・盆地（チャンク幅よりはるかに長い波長で「同じパターンのコピー」感を潰す） */
const CONTINENT_SCALE = 0.000072;
const ULTRA_SCALE = 0.000018;

/**
 * @param {number} worldX
 * @param {number} worldZ
 * @returns {number} ワールド Y（オフセット前の相対高さ）
 */
export function getTerrainHeight(worldX, worldZ) {
    const nx = worldX * MACRO_SCALE;
    const nz = worldZ * MACRO_SCALE;
    const warpX = ((fbm(nx * 1.35 + 2.7, nz * 1.05 - 4.2, 3) - 0.5) * 2) * 2.15;
    const warpZ = ((fbm(nx * 1.08 + 11.1, nz * 1.42 + 6.8, 3) - 0.5) * 2) * 2.45;
    const mx = nx + warpX;
    const mz = nz + warpZ;

    const macro = (fbm(mx + 19.2, mz - 11.7, 5) - 0.5) * 2;

    const mid = (fbm(worldX * MID_SCALE + 3.1, worldZ * MID_SCALE - 7.4, 4) - 0.5) * 2;
    const ridgeInput = fbm(worldX * 0.00155 + 101, worldZ * 0.00148 - 55, 4);
    const ridged = 1.0 - Math.abs((ridgeInput - 0.5) * 2.0);
    const ridgePow = ridged * ridged;

    const detail = (fbm(worldX * DETAIL_SCALE, worldZ * DETAIL_SCALE, 3) - 0.5) * 2;

    const continent = (fbm(worldX * CONTINENT_SCALE - 413.2, worldZ * CONTINENT_SCALE + 271.9, 4) - 0.5) * 2;
    const ultra = (fbm(worldX * ULTRA_SCALE + 1903.7, worldZ * ULTRA_SCALE - 884.4, 3) - 0.5) * 2;

    const region = Math.max(0, macro * 0.5 + 0.5);
    const midW = 0.35 + region * 0.65;
    const ridgeW = 0.22 + region * 0.55;

    let h =
        macro * 0.36 +
        mid * midW * 0.36 +
        ridgePow * ridgeW * 0.44 +
        detail * 0.11 +
        continent * 0.2 +
        ultra * 0.12;
    return h * TERRAIN_HEIGHT_AMPLITUDE;
}

/**
 * 砂漠の地色バリエーション（頂点カラー用・world のみ）
 * @param {number} worldX
 * @param {number} worldZ
 * @param {Float32Array|number[]} out3 length>=3
 * @param {number} [o=0]
 * @param {number|null} [relativeHeight] getTerrainHeight の値（渡すと稜線を軽くハイライト）
 */
export function getSandVertexColor(worldX, worldZ, out3, o = 0, relativeHeight = null) {
    const n1 = fbm(worldX * 0.0001 + 2.3, worldZ * 0.00012 - 4.1, 4);
    const n2 = fbm(worldX * 0.00028 + 17.1, worldZ * 0.00025 + 9.4, 2);
    const n3 = fbm(worldX * 0.000055, worldZ * 0.00006 + 22.8, 3);
    const blend = n1 * 0.55 + n2 * 0.28 + n3 * 0.17;

    const lr = 0.86,
        lg = 0.78,
        lb = 0.62;
    const mr = 0.72,
        mg = 0.62,
        mb = 0.46;
    const dr = 0.52,
        dg = 0.44,
        db = 0.34;

    const t = blend;
    let r = lr + (mr - lr) * t;
    let g = lg + (mg - lg) * t;
    let b = lb + (mb - lb) * t;
    const dark = n2 * n2 * 0.42;
    r += (dr - r) * dark;
    g += (dg - g) * dark;
    b += (db - b) * dark;

    const crest = Math.max(0, (relativeHeight ?? 0) / TERRAIN_HEIGHT_AMPLITUDE) * 0.08;
    r += crest;
    g += crest * 0.95;
    b += crest * 0.78;

    out3[o] = Math.min(1, r);
    out3[o + 1] = Math.min(1, g);
    out3[o + 2] = Math.min(1, b);
    return out3;
}
