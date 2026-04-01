import * as THREE from 'three';

/**
 * Scene2 共有ユーティリティ・シェーダー補助
 */

/**
 * MIDI ベロシティの正規化
 */
export function normalizeMidiVelocity(v) {
    if (v === undefined || v === null) return 127;
    const n = Number(v);
    if (!Number.isFinite(n)) return 127;
    if (n >= 0 && n <= 1) return Math.round(n * 127);
    return THREE.MathUtils.clamp(Math.round(n), 0, 127);
}

/**
 * チャコールグレー〜黒寄りのランダム（岩・鉱物っぽい微妙な色相ブレ）
 */
export function setRandomRockCharcoalColor(out) {
    const l = 0.07 + Math.random() * 0.26;
    const s = 0.015 + Math.random() * 0.09;
    const h = 0.52 + (Math.random() - 0.5) * 0.1;
    out.setHSL(h, s, l);
    out.offsetHSL((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.05);
    out.r += (Math.random() - 0.5) * 0.035;
    out.g += (Math.random() - 0.5) * 0.035;
    out.b += (Math.random() - 0.5) * 0.04;
    out.r = THREE.MathUtils.clamp(out.r, 0.02, 0.42);
    out.g = THREE.MathUtils.clamp(out.g, 0.02, 0.42);
    out.b = THREE.MathUtils.clamp(out.b, 0.02, 0.45);
}

/**
 * OSC の trackNumber が数値化できない／未設定のときは address から拾う
 */
export function parseTrackNumber(trackNumber, message) {
    if (trackNumber !== undefined && trackNumber !== null && trackNumber !== '') {
        const num = typeof trackNumber === 'string' ? parseInt(trackNumber, 10) : Number(trackNumber);
        if (!Number.isNaN(num)) return num;
    }
    const addr = message && message.address;
    if (typeof addr === 'string') {
        let m = addr.match(/\/track\/(\d+)/i);
        if (!m) m = addr.match(/\/track(\d+)(?:\/|$)/i);
        if (m) return parseInt(m[1], 10);
    }
    return null;
}
