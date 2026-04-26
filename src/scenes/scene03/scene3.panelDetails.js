import * as THREE from 'three';

/**
 * 「金属はデカ一枚で置けない＝パネルが継がれてる」感を、
 *   - 中央壁から *突き出る* 太いシーム帯（黒い金属トリム）
 *   - そのトリム上のビス（カメラ側に飛び出す）
 *   - コンソール正面・チャンファ面・床に貼る *デカ文字* ラベル（emissive）
 * で見える形で実装。手前のフィンやコンソールに隠れないよう内側に張り出す。
 */

/* ============ ラベル生成（CanvasTexture） ============ */

const _labelCache = new Map();

function makeLabelTexture(text, opts = {}) {
    const key = `${text}|${opts.kind || 'plain'}|${opts.color || '#0c1320'}|${opts.bg || 'transparent'}|${opts.size || 0}|${opts.frame ? 1 : 0}`;
    if (_labelCache.has(key)) return _labelCache.get(key);

    const w = 1024;
    const h = 256;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    if (opts.bg && opts.bg !== 'transparent') {
        ctx.fillStyle = opts.bg;
        ctx.fillRect(0, 0, w, h);
    } else {
        ctx.clearRect(0, 0, w, h);
    }

    ctx.fillStyle = opts.color || '#0c1320';
    ctx.font = `900 ${opts.size || 180}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (opts.kind === 'warn') {
        ctx.fillStyle = '#e3a82a';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#181818';
        for (let i = -h; i < w + h; i += 36) {
            ctx.beginPath();
            ctx.moveTo(i, 0); ctx.lineTo(i + h, h);
            ctx.lineTo(i + h - 18, h); ctx.lineTo(i - 18, 0);
            ctx.fill();
        }
        ctx.fillStyle = '#0a0a0a';
        ctx.font = `900 ${opts.size || 150}px Arial, sans-serif`;
    }

    if (opts.kind === 'placard') {
        ctx.fillStyle = '#dde4ec';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#1a2330';
        ctx.lineWidth = 10;
        ctx.strokeRect(12, 12, w - 24, h - 24);
        ctx.fillStyle = '#0c1320';
    }

    ctx.fillText(text, w / 2, h / 2 + 8);

    if (opts.frame) {
        ctx.strokeStyle = opts.color || '#0c1320';
        ctx.lineWidth = 8;
        ctx.strokeRect(10, 10, w - 20, h - 20);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    _labelCache.set(key, tex);
    return tex;
}

function labelMat(text, opts = {}) {
    const map = makeLabelTexture(text, opts);
    return new THREE.MeshStandardMaterial({
        map,
        emissive: 0xffffff,
        emissiveMap: map,
        emissiveIntensity: opts.emissive ?? 0.65,
        transparent: !opts.bg || opts.bg === 'transparent',
        roughness: 0.55,
        metalness: 0.05,
        depthWrite: !!opts.bg && opts.bg !== 'transparent',
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        side: THREE.DoubleSide,
        fog: true
    });
}

/* ============ 共有マテリアル ============ */

const seamDarkMat = () => new THREE.MeshStandardMaterial({
    color: 0x12181f,
    emissive: 0x05080c,
    emissiveIntensity: 0.2,
    roughness: 0.75,
    metalness: 0.55,
    fog: true
});

const seamHighlightMat = () => new THREE.MeshStandardMaterial({
    color: 0xe6ecf2,
    roughness: 0.35,
    metalness: 0.55,
    fog: true
});

const boltMat = () => new THREE.MeshStandardMaterial({
    color: 0xa0acb6,
    emissive: 0x0a0e14,
    emissiveIntensity: 0.08,
    roughness: 0.28,
    metalness: 0.92,
    fog: true
});

/* ============ ジオメトリ（共有） ============ */

const _boltGeo = new THREE.CylinderGeometry(14, 14, 18, 10, 1);
_boltGeo.rotateZ(Math.PI / 2);

/* ============ 文字候補 ============ */

const PLAIN_LABELS = [
    'A-12', 'B-07', 'C-21', 'D-04', 'E-18', 'F-33',
    'SECT 07', 'SECT 12', 'BAY 03', 'BAY 09',
    'L-01', 'L-02', 'NX-7', 'MX-2', 'PX-5',
    '0042', '0117', '0233', '0418', '0501'
];
const WARN_LABELS = [
    'CAUTION', 'HIGH VOLT', 'NO STEP', 'EVA ONLY', 'AIRLOCK', 'KEEP CLEAR'
];
const pick = (arr, seed) => arr[Math.floor(Math.abs(Math.sin(seed * 13.31)) * arr.length) % arr.length];

/* ============ 本体 ============ */

/**
 * @param {THREE.Group} parent
 * @param {{ roomHalfW: number, roomHalfD: number, floorTopY: number, ceilingY: number }} scene
 */
export function addPanelSeamsBoltsAndLabels(parent, scene) {
    const hw = scene.roomHalfW;
    const hd = scene.roomHalfD;
    const fy = scene.floorTopY;
    const cy = scene.ceilingY;
    const wallH = cy - fy;
    const slab = 24;
    const midY = fy + wallH * 0.5;

    const root = new THREE.Group();
    root.name = 'panelSeamsBoltsLabels';

    /** 全ての手前要素（フィン・コンソール）の更に内側にトリムを置く X 位置 */
    const trimXInner = (sign) => sign * (hw - 600);

    /** ============ 1) 中央壁の継ぎ目（手前に飛び出す太い暗トリム＋ハイライト） ============ */
    const longLen = hd * 2 - 400;

    /** 横シーム Y 位置（壁を 5 段に分ける） */
    const horizYs = [
        midY + wallH * 0.32,
        midY + wallH * 0.16,
        midY,
        midY - wallH * 0.16,
        midY - wallH * 0.32
    ];

    for (const sign of [-1, 1]) {
        const tx = trimXInner(sign);

        for (const y of horizYs) {
            /** 太い暗トリム（高さ 26、奥行 38）— カメラ側に張り出して見える */
            const seam = new THREE.Mesh(
                new THREE.BoxGeometry(38, 26, longLen),
                seamDarkMat()
            );
            seam.position.set(tx, y, 0);
            seam.castShadow = true;
            seam.receiveShadow = true;
            root.add(seam);

            /** 暗トリムの上下に細いハイライト（金属の段差ハイライト） */
            const hi1 = new THREE.Mesh(
                new THREE.BoxGeometry(34, 4, longLen),
                seamHighlightMat()
            );
            hi1.position.set(tx, y + 14, 0);
            root.add(hi1);

            const hi2 = new THREE.Mesh(
                new THREE.BoxGeometry(34, 4, longLen),
                seamHighlightMat()
            );
            hi2.position.set(tx, y - 14, 0);
            root.add(hi2);
        }

        /** 縦シーム（Z 方向にパネルを区切る） */
        const segZ = 1600;
        const seamVerticalMat = seamDarkMat();
        for (let z = -hd + 600; z <= hd - 600; z += segZ) {
            const v = new THREE.Mesh(
                new THREE.BoxGeometry(38, wallH * 0.78, 26),
                seamVerticalMat
            );
            v.position.set(tx, midY, z);
            v.castShadow = true;
            root.add(v);

            /** 縦シームのハイライト（左右に細リム） */
            const vh1 = new THREE.Mesh(
                new THREE.BoxGeometry(34, wallH * 0.78, 3),
                seamHighlightMat()
            );
            vh1.position.set(tx, midY, z + 14);
            root.add(vh1);
            const vh2 = new THREE.Mesh(
                new THREE.BoxGeometry(34, wallH * 0.78, 3),
                seamHighlightMat()
            );
            vh2.position.set(tx, midY, z - 14);
            root.add(vh2);
        }
    }

    /** ============ 2) ビス（横シーム上に大きめ・カメラ側に突出） ============ */
    const sharedBoltMat = boltMat();
    for (const sign of [-1, 1]) {
        const tx = trimXInner(sign) - sign * 22;
        const segZ = 1600;
        const boltZStep = 480;

        for (const y of horizYs) {
            for (let z = -hd + 500; z <= hd - 500; z += boltZStep) {
                const b = new THREE.Mesh(_boltGeo, sharedBoltMat);
                b.position.set(tx, y, z);
                b.rotation.y = sign * Math.PI / 2;
                b.castShadow = true;
                root.add(b);
            }
        }
        /** 縦シームの交点はデカビス */
        for (let z = -hd + 600; z <= hd - 600; z += segZ) {
            for (const y of horizYs) {
                const big = new THREE.Mesh(_boltGeo, sharedBoltMat);
                big.position.set(tx, y, z);
                big.rotation.y = sign * Math.PI / 2;
                big.scale.setScalar(1.7);
                big.castShadow = true;
                root.add(big);
            }
        }
    }

    /** ============ 3) 床の継ぎ目（タイル）＋ビス＋床ステンシル ============ */
    /** 床は y=fy（floorTopY）の僅か上に置く */
    const floorY = fy + 0.5;

    /** 床の中央レーン（x: -3000..+3000）にだけタイル線（外側はレーンメッシュで隠れる） */
    const floorZSpacing = 1100;
    for (let z = -hd + 400; z <= hd - 400; z += floorZSpacing) {
        const fl = new THREE.Mesh(
            new THREE.BoxGeometry(5800, 6, 14),
            seamDarkMat()
        );
        fl.position.set(0, floorY, z);
        fl.receiveShadow = true;
        root.add(fl);
    }
    const floorXOffsets = [-2400, -1200, 0, 1200, 2400];
    for (const x of floorXOffsets) {
        const fv = new THREE.Mesh(
            new THREE.BoxGeometry(14, 6, hd * 2 - 600),
            seamDarkMat()
        );
        fv.position.set(x, floorY, 0);
        fv.receiveShadow = true;
        root.add(fv);
    }
    /** 床ビス（タイル交点） */
    const floorBoltGeo = new THREE.CylinderGeometry(11, 11, 6, 8, 1);
    for (let z = -hd + 400; z <= hd - 400; z += floorZSpacing) {
        for (const x of floorXOffsets) {
            const b = new THREE.Mesh(floorBoltGeo, sharedBoltMat);
            b.position.set(x, floorY + 2, z);
            root.add(b);
        }
    }

    /** ============ 4) デカ文字ラベル：トリム手前・コンソール正面・床に貼る ============ */
    /** トリム手前に貼る型番／警告ラベル（縦壁面に対して鏡向き） */
    const labelZStep = 1600;
    let li = 0;
    for (const sign of [-1, 1]) {
        for (let z = -hd + 800; z <= hd - 800; z += labelZStep) {
            li++;

            /** 上段：型番プラカード（白地に黒） */
            const t1 = pick(PLAIN_LABELS, li);
            const m1 = labelMat(t1, { kind: 'placard', size: 200, emissive: 0.6 });
            const p1 = new THREE.Mesh(new THREE.PlaneGeometry(720, 180), m1);
            p1.position.set(trimXInner(sign) - sign * 25, midY + wallH * 0.24, z);
            p1.rotation.y = sign * Math.PI / 2;
            root.add(p1);

            /** 中段：シリアル番号（透明地に白文字、emissive 強め） */
            const t2 = '#' + String(2300 + (li * 17) % 8000);
            const m2 = labelMat(t2, { color: '#dde6ef', size: 220, emissive: 1.6 });
            const p2 = new THREE.Mesh(new THREE.PlaneGeometry(900, 220), m2);
            p2.position.set(trimXInner(sign) - sign * 25, midY, z + 800);
            p2.rotation.y = sign * Math.PI / 2;
            root.add(p2);

            /** 下段：3 個に 1 個は警告ハザード */
            if (li % 3 === 0) {
                const tw = pick(WARN_LABELS, li);
                const mw = labelMat(tw, { kind: 'warn', size: 160, emissive: 0.45 });
                const pw = new THREE.Mesh(new THREE.PlaneGeometry(820, 200), mw);
                pw.position.set(trimXInner(sign) - sign * 25, midY - wallH * 0.26, z);
                pw.rotation.y = sign * Math.PI / 2;
                root.add(pw);
            } else {
                const t3 = pick(PLAIN_LABELS, li + 5);
                const m3 = labelMat(t3, { color: '#cdd6df', size: 180, emissive: 1.2 });
                const p3 = new THREE.Mesh(new THREE.PlaneGeometry(700, 170), m3);
                p3.position.set(trimXInner(sign) - sign * 25, midY - wallH * 0.26, z);
                p3.rotation.y = sign * Math.PI / 2;
                root.add(p3);
            }
        }
    }

    /** ============ 5) コンソール正面のデカ文字（コンソールは壁から大きく張り出してる超見える面） ============ */
    /** コンソール前面 X = sign * (hw - 230) - sign * 85 = sign * (hw - 315) ≒ sign * 4685 */
    const consoleFrontX = (sign) => sign * (hw - 315);
    const consoleFrontY = fy + slab + (wallH * 0.55) * 0.5 + 18;
    let ci = 0;
    for (const sign of [-1, 1]) {
        for (let z = -hd + 600; z <= hd - 600; z += 1900) {
            ci++;
            /** メインのデカコード（emissive 強で光る） */
            const t = pick(PLAIN_LABELS, ci + 11);
            const m = labelMat(t, { color: '#0a3a4a', size: 220, emissive: 1.8 });
            const p = new THREE.Mesh(new THREE.PlaneGeometry(560, 180), m);
            p.position.set(consoleFrontX(sign) - sign * 6, consoleFrontY + 80, z);
            p.rotation.y = sign * Math.PI / 2;
            root.add(p);

            /** 連番ステンシル */
            const t2 = String(1000 + (ci * 37) % 8999);
            const m2 = labelMat(t2, { color: '#7a8a9a', size: 180, emissive: 0.4 });
            const p2 = new THREE.Mesh(new THREE.PlaneGeometry(380, 110), m2);
            p2.position.set(consoleFrontX(sign) - sign * 6, consoleFrontY - 110, z);
            p2.rotation.y = sign * Math.PI / 2;
            root.add(p2);
        }
    }

    /** ============ 6) 床のレーン番号（巨大） ============ */
    for (let z = -hd + 1200; z <= hd - 1200; z += 3500) {
        const m = labelMat('LANE-' + String(Math.abs(Math.floor(z / 800))).padStart(2, '0'), {
            color: '#1a2330', size: 220, emissive: 0.0
        });
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1400, 320), m);
        p.position.set(0, floorY + 1, z);
        p.rotation.x = -Math.PI / 2;
        p.rotation.z = Math.PI;
        root.add(p);
    }

    /** ============ 7) 床のハザード（黄黒）マーク ============ */
    for (let z = -hd + 2200; z <= hd - 2200; z += 6500) {
        const m = labelMat('CAUTION', { kind: 'warn', size: 200, emissive: 0.0 });
        const p = new THREE.Mesh(new THREE.PlaneGeometry(2200, 360), m);
        p.position.set(0, floorY + 1.5, z);
        p.rotation.x = -Math.PI / 2;
        root.add(p);
    }

    /** ============ 8) 天井下に走るロゴバナー ============ */
    for (let z = -hd + 1800; z <= hd - 1800; z += 4400) {
        const m = labelMat('M.A.R.V.R.X · BRG-' + String((Math.abs(z) / 800).toFixed(0)), {
            color: '#dfe7f0', size: 110, emissive: 1.4
        });
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1600, 130), m);
        p.position.set(0, cy - 240, z);
        p.rotation.x = Math.PI / 2;
        root.add(p);
    }

    parent.add(root);
}
