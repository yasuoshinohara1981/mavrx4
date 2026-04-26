import * as THREE from 'three';

/**
 * 参考画像準拠の工業ディテール群：
 *   - オレンジ発光の機械窓（壁内の電子回路が透けて見える）
 *   - 天井の配管バンドル（パイプ・ケーブル）
 *   - 白いハンドレール（腰高、Z 通長）
 *   - 六角形タイルの床オーバーレイ
 *   - 奥の巨大リアクター（オレンジ発光）
 *   - 大型構造パーツ（ブルクヘッド、天井スパイン、床ビーム、メガコラム、大型ポッド）
 */

/* ============ オレンジ機械窓のテクスチャ生成 ============ */

const _machineCache = new Map();

function makeMachineWindowTexture(seed = 0) {
    const key = `mw|${seed}`;
    if (_machineCache.has(key)) return _machineCache.get(key);

    const w = 512;
    const h = 256;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    /** 暗い背景 */
    ctx.fillStyle = '#080604';
    ctx.fillRect(0, 0, w, h);

    /** オレンジのベース光 */
    const grd = ctx.createRadialGradient(w / 2, h / 2, 30, w / 2, h / 2, w * 0.7);
    grd.addColorStop(0, '#ffb060');
    grd.addColorStop(0.5, '#e07020');
    grd.addColorStop(1, '#601a05');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    /** 横方向のライン基板（細かい線） */
    const rng = mulberry32(0xa1b2c3 + seed * 7);
    ctx.strokeStyle = '#1a0a04';
    ctx.lineWidth = 2;
    for (let y = 6; y < h; y += 8 + Math.floor(rng() * 4)) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    /** 縦のセグメント仕切り */
    ctx.lineWidth = 3;
    for (let x = 0; x < w; x += 38 + Math.floor(rng() * 18)) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }

    /** ランダムなブロック（基板上のチップ） */
    for (let i = 0; i < 80; i++) {
        const x = Math.floor(rng() * w);
        const y = Math.floor(rng() * h);
        const bw = 8 + Math.floor(rng() * 22);
        const bh = 6 + Math.floor(rng() * 14);
        ctx.fillStyle = rng() < 0.3 ? '#ff8030' : '#180a04';
        ctx.fillRect(x, y, bw, bh);
    }

    /** 小さな光点（LED） */
    for (let i = 0; i < 60; i++) {
        const x = Math.floor(rng() * w);
        const y = Math.floor(rng() * h);
        ctx.fillStyle = rng() < 0.5 ? '#ffe090' : '#ffa050';
        ctx.fillRect(x, y, 3, 3);
    }

    /** 端の暗いマスク（窓枠っぽく） */
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, w, 8);
    ctx.fillRect(0, h - 8, w, 8);
    ctx.fillRect(0, 0, 8, h);
    ctx.fillRect(w - 8, 0, 8, h);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    _machineCache.set(key, tex);
    return tex;
}

function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function machineWindowMat(seed) {
    const map = makeMachineWindowTexture(seed);
    return new THREE.MeshStandardMaterial({
        map,
        emissive: 0xff8030,
        emissiveMap: map,
        emissiveIntensity: 1.6,
        roughness: 0.65,
        metalness: 0.1,
        fog: true
    });
}

/* ============ 六角タイル床のテクスチャ ============ */

function makeHexFloorTexture() {
    const w = 1024, h = 1024;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#a8b2bc';
    ctx.fillRect(0, 0, w, h);

    const r = 90;
    const dx = r * Math.sqrt(3);
    const dy = r * 1.5;
    ctx.strokeStyle = '#1a2128';
    ctx.lineWidth = 4;

    for (let row = -1; row * dy < h + r; row++) {
        for (let col = -1; col * dx < w + r; col++) {
            const cx = col * dx + (row % 2 === 0 ? 0 : dx / 2);
            const cy = row * dy;
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
                const ang = Math.PI / 3 * k - Math.PI / 6;
                const px = cx + r * Math.cos(ang);
                const py = cy + r * Math.sin(ang);
                if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            const shade = 168 + Math.floor(((cx * 31 + cy * 17) % 40));
            ctx.fillStyle = `rgb(${shade},${shade + 6},${shade + 10})`;
            ctx.fill();
            ctx.stroke();
        }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
}

/* ============ メイン ============ */

const matWhitePanel = (em = 0) => new THREE.MeshStandardMaterial({
    color: 0xeef3f8,
    roughness: 0.36,
    metalness: 0.22,
    emissive: 0x000000,
    emissiveIntensity: em,
    fog: true
});

const matPipe = () => new THREE.MeshStandardMaterial({
    color: 0xc0c8d0,
    roughness: 0.42,
    metalness: 0.78,
    fog: true
});

const matCable = () => new THREE.MeshStandardMaterial({
    color: 0x2a2e34,
    roughness: 0.85,
    metalness: 0.15,
    fog: true
});

const matRail = () => new THREE.MeshStandardMaterial({
    color: 0xf5f9fc,
    roughness: 0.22,
    metalness: 0.55,
    emissive: 0x0a0e14,
    emissiveIntensity: 0.05,
    fog: true
});

const matReactor = () => new THREE.MeshStandardMaterial({
    color: 0xff9040,
    emissive: 0xff7020,
    emissiveIntensity: 1.8,
    roughness: 0.4,
    metalness: 0.3,
    fog: true
});

const matStructDark = () => new THREE.MeshStandardMaterial({
    color: 0x8898a8,
    roughness: 0.42,
    metalness: 0.72,
    fog: true
});

const matStructLight = () => new THREE.MeshStandardMaterial({
    color: 0xd8e4f0,
    roughness: 0.28,
    metalness: 0.55,
    fog: true
});

const matMegaPod = () => new THREE.MeshStandardMaterial({
    color: 0xe8eef5,
    roughness: 0.35,
    metalness: 0.4,
    emissive: 0x102030,
    emissiveIntensity: 0.08,
    fog: true
});

/**
 * @param {THREE.Group} parent
 * @param {{ roomHalfW: number, roomHalfD: number, floorTopY: number, ceilingY: number }} scene
 */
export function addIndustrialDetails(parent, scene) {
    const hw = scene.roomHalfW;
    const hd = scene.roomHalfD;
    const fy = scene.floorTopY;
    const cy = scene.ceilingY;
    const wallH = cy - fy;
    const midY = fy + wallH * 0.5;

    const root = new THREE.Group();
    root.name = 'industrialDetails';

    /** ============ 1) 壁のオレンジ機械窓（量産） ============ */
    const winH = wallH * 0.18;
    const winYs = [
        midY + wallH * 0.24,
        midY + wallH * 0.08,
        midY - wallH * 0.08,
        midY - wallH * 0.24
    ];
    /** 縦壁の最も内側（手前）に貼る X */
    const winX = (sign) => sign * (hw - 580);
    let wi = 0;
    const winZStep = 1100;

    for (const sign of [-1, 1]) {
        for (let z = -hd + 700; z <= hd - 700; z += winZStep) {
            for (let yi = 0; yi < winYs.length; yi++) {
                wi++;
                const y = winYs[yi];

                /** 窓の暗い縁取り（フレーム） */
                const frameW = 280;
                const frameH = winH + 28;
                const frame = new THREE.Mesh(
                    new THREE.BoxGeometry(40, frameH, frameW),
                    matWhitePanel(0)
                );
                frame.position.set(winX(sign) + sign * 6, y, z);
                root.add(frame);

                /** 機械窓本体（emissive オレンジ） */
                const m = machineWindowMat(wi);
                const win = new THREE.Mesh(new THREE.PlaneGeometry(220, winH), m);
                win.position.set(winX(sign) - sign * 18, y, z);
                win.rotation.y = sign * Math.PI / 2;
                root.add(win);

                /** 内側のグレースクリーン（追加の見栄え） */
                if (wi % 4 === 0) {
                    const sub = new THREE.Mesh(
                        new THREE.PlaneGeometry(60, winH * 0.5),
                        machineWindowMat(wi * 31 + 7)
                    );
                    sub.position.set(winX(sign) - sign * 19, y + winH * 0.18, z + 80);
                    sub.rotation.y = sign * Math.PI / 2;
                    root.add(sub);
                }
            }
        }
    }

    /** ============ 2) 天井の配管バンドル（パイプとケーブル） ============ */
    const longLen = hd * 2 - 400;
    const pipeY = cy - 320;

    /** 太いパイプ（金属） */
    const bigPipeR = 38;
    const bigPipeGeo = new THREE.CylinderGeometry(bigPipeR, bigPipeR, longLen, 12, 1);
    bigPipeGeo.rotateX(Math.PI / 2);
    const pipeXs = [-hw * 0.78, -hw * 0.62, hw * 0.62, hw * 0.78];
    for (const x of pipeXs) {
        const p = new THREE.Mesh(bigPipeGeo, matPipe());
        p.position.set(x, pipeY, 0);
        p.castShadow = true;
        root.add(p);
    }

    /** 中サイズパイプ */
    const midPipeR = 22;
    const midPipeGeo = new THREE.CylinderGeometry(midPipeR, midPipeR, longLen, 10, 1);
    midPipeGeo.rotateX(Math.PI / 2);
    const midPipeXs = [-hw * 0.70, -hw * 0.55, -hw * 0.40, hw * 0.40, hw * 0.55, hw * 0.70];
    for (const x of midPipeXs) {
        const p = new THREE.Mesh(midPipeGeo, matPipe());
        p.position.set(x, pipeY - 70, 0);
        p.castShadow = true;
        root.add(p);
    }

    /** 黒いケーブル束（細い） */
    const cableR = 12;
    const cableGeo = new THREE.CylinderGeometry(cableR, cableR, longLen, 8, 1);
    cableGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < 16; i++) {
        const x = ((i / 15) - 0.5) * (hw * 1.6);
        const yOff = (i % 3) * 14;
        const c = new THREE.Mesh(cableGeo, matCable());
        c.position.set(x, pipeY - 130 - yOff, 0);
        root.add(c);
    }

    /** パイプ吊りクランプ（Z 方向に間隔をあけて） */
    const clampMat = matWhitePanel(0);
    for (let z = -hd + 600; z <= hd - 600; z += 2200) {
        for (const x of pipeXs) {
            const cl = new THREE.Mesh(
                new THREE.BoxGeometry(95, 95, 50),
                clampMat
            );
            cl.position.set(x, pipeY, z);
            cl.castShadow = true;
            root.add(cl);
        }
    }

    /** ============ 3) 白いハンドレール（腰の高さ、Z 通長、両側） ============ */
    const railY = fy + wallH * 0.32;
    const railR = 14;
    const railGeo = new THREE.CylinderGeometry(railR, railR, longLen, 12, 1);
    railGeo.rotateX(Math.PI / 2);
    const railMatShared = matRail();
    for (const sign of [-1, 1]) {
        const rx = sign * (hw - 720);

        /** 上下 2 本の手すり */
        const railTop = new THREE.Mesh(railGeo, railMatShared);
        railTop.position.set(rx, railY + 90, 0);
        railTop.castShadow = true;
        root.add(railTop);

        const railBot = new THREE.Mesh(railGeo, railMatShared);
        railBot.position.set(rx, railY, 0);
        railBot.castShadow = true;
        root.add(railBot);

        /** 縦の支柱 */
        const postH = 130;
        const postGeo = new THREE.BoxGeometry(20, postH, 20);
        for (let z = -hd + 500; z <= hd - 500; z += 1400) {
            const post = new THREE.Mesh(postGeo, railMatShared);
            post.position.set(rx, railY + 25, z);
            post.castShadow = true;
            root.add(post);
        }

        /** 手すり下の塞ぎ板（白） */
        const skirt = new THREE.Mesh(
            new THREE.BoxGeometry(60, 90, longLen),
            matWhitePanel(0)
        );
        skirt.position.set(rx + sign * -20, railY - 80, 0);
        skirt.castShadow = true;
        root.add(skirt);
    }

    /** ============ 4) 床の六角タイルオーバーレイ ============ */
    const hexTex = makeHexFloorTexture();
    const floorRep = 8;
    hexTex.repeat.set(floorRep, floorRep * (hd / hw));
    const hexMat = new THREE.MeshStandardMaterial({
        map: hexTex,
        roughness: 0.6,
        metalness: 0.25,
        transparent: true,
        opacity: 0.85,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        fog: true
    });
    const hexFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(hw * 1.2, hd * 2 - 200),
        hexMat
    );
    hexFloor.position.set(0, fy + 1.5, 0);
    hexFloor.rotation.x = -Math.PI / 2;
    hexFloor.receiveShadow = true;
    root.add(hexFloor);

    /** ============ 5) 奥のオレンジリアクター（巨大装置） ============ */
    const reactorZ = -hd + 900;
    const reactorY = fy + wallH * 0.45;
    const reactorMat = matReactor();

    /** 中央の球体コア */
    const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(420, 1),
        reactorMat
    );
    core.position.set(0, reactorY, reactorZ);
    root.add(core);

    /** リング（複数） */
    for (let i = 0; i < 4; i++) {
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(500 + i * 80, 18, 8, 32),
            new THREE.MeshStandardMaterial({
                color: 0xc8d0d8,
                roughness: 0.3,
                metalness: 0.85,
                fog: true
            })
        );
        ring.position.set(0, reactorY, reactorZ);
        ring.rotation.x = Math.PI * 0.5 + i * 0.18;
        ring.rotation.y = i * 0.25;
        root.add(ring);
    }

    /** リアクター周りの細かいオレンジパイプ突起 */
    const protrusionGeo = new THREE.BoxGeometry(60, 60, 60);
    for (let i = 0; i < 18; i++) {
        const ang = (i / 18) * Math.PI * 2;
        const r = 480;
        const px = Math.cos(ang) * r;
        const py = reactorY + Math.sin(ang) * r * 0.6;
        const pp = new THREE.Mesh(protrusionGeo, reactorMat);
        pp.position.set(px, py, reactorZ - 50);
        pp.scale.setScalar(0.7 + (i % 3) * 0.15);
        root.add(pp);
    }

    /** リアクター用の強い PointLight（オレンジ） */
    const reactorLight = new THREE.PointLight(0xff8030, 800, 12000, 1.4);
    reactorLight.position.set(0, reactorY, reactorZ);
    root.add(reactorLight);

    /** ============ 6) 壁面に追加される細かいパネル（ハの字並びの白小箱） ============ */
    const smallPanelMat = matWhitePanel(0);
    for (const sign of [-1, 1]) {
        for (let z = -hd + 900; z <= hd - 900; z += 800) {
            const sp = new THREE.Mesh(
                new THREE.BoxGeometry(25, 110, 220),
                smallPanelMat
            );
            sp.position.set(sign * (hw - 760), midY + wallH * 0.36, z);
            sp.rotation.x = (z % 1600 === 0) ? 0.18 : -0.18;
            sp.castShadow = true;
            root.add(sp);
        }
    }

    /** ============ 7) 床に金属プレート（中央レーン） ============ */
    const plateMat = new THREE.MeshStandardMaterial({
        color: 0xb8c2cc,
        roughness: 0.45,
        metalness: 0.6,
        fog: true
    });
    for (let z = -hd + 1300; z <= hd - 1300; z += 2200) {
        const plate = new THREE.Mesh(
            new THREE.BoxGeometry(1900, 6, 320),
            plateMat
        );
        plate.position.set(0, fy + 4, z);
        plate.castShadow = false;
        plate.receiveShadow = true;
        root.add(plate);
    }

    addLargeStructuralParts(root, scene);

    parent.add(root);
}

/**
 * 通路を読ませる大型パーツ：横ブルクヘッド、天井メインスパイン、床レール、壁メガコラム、大型機械ポッド
 */
function addLargeStructuralParts(root, scene) {
    const hw = scene.roomHalfW;
    const hd = scene.roomHalfD;
    const fy = scene.floorTopY;
    const cy = scene.ceilingY;
    const wallH = cy - fy;
    const midY = fy + wallH * 0.5;
    const longLen = hd * 2 - 200;

    const matDark = matStructDark();
    const matLight = matStructLight();
    const matPod = matMegaPod();

    /** ============ 1) 天井センタースパイン（通路幅いっぱいはやめて中央の細梁のみ） ============ */
    const spineH = 120;
    const spineW = hw * 0.36;
    const spineY = cy - spineH * 0.5 - 28;
    const spine = new THREE.Mesh(
        new THREE.BoxGeometry(spineW, spineH, longLen),
        matDark
    );
    spine.position.set(0, spineY, 0);
    spine.castShadow = true;
    spine.receiveShadow = true;
    root.add(spine);

    /** スパイン下面リブ（本数少なめ・細め） */
    for (let z = -hd + 800; z <= hd - 800; z += 5200) {
        const rib = new THREE.Mesh(
            new THREE.BoxGeometry(spineW - 40, 28, 110),
            matLight
        );
        rib.position.set(0, spineY - spineH * 0.5 + 18, z);
        rib.castShadow = true;
        root.add(rib);
    }

    /** ============ 2) 横ブルクヘッド（薄く・間隔広く・リブは 1 本だけ） ============ */
    const bulkThick = 95;
    const bulkW = hw * 2 - 120;
    const bulkH = wallH - 140;
    for (let z = -hd + 3200; z <= hd - 3200; z += 9600) {
        const bulk = new THREE.Mesh(
            new THREE.BoxGeometry(bulkW, bulkH, bulkThick),
            matDark
        );
        bulk.position.set(0, midY, z);
        bulk.castShadow = true;
        bulk.receiveShadow = true;
        root.add(bulk);

        const ribB = new THREE.Mesh(
            new THREE.BoxGeometry(bulkW - 100, 38, bulkThick + 16),
            matLight
        );
        ribB.position.set(0, midY + bulkH * 0.12, z);
        ribB.castShadow = true;
        root.add(ribB);
    }

    /** ============ 3) 床スパイン（細めの中央レーン） ============ */
    const floorBeamW = 1500;
    const floorBeamH = 38;
    const floorBeam = new THREE.Mesh(
        new THREE.BoxGeometry(floorBeamW, floorBeamH, longLen),
        matDark
    );
    floorBeam.position.set(0, fy + floorBeamH * 0.5 + 8, 0);
    floorBeam.castShadow = true;
    floorBeam.receiveShadow = true;
    root.add(floorBeam);

    /** 床スパイン両端の縁（低く） */
    const edgeH = 18;
    const edgeW = 55;
    for (const sign of [-1, 1]) {
        const edge = new THREE.Mesh(
            new THREE.BoxGeometry(edgeW, edgeH, longLen),
            matLight
        );
        edge.position.set(sign * (floorBeamW * 0.5 - edgeW * 0.5), fy + floorBeamH + edgeH * 0.5 + 10, 0);
        edge.castShadow = true;
        root.add(edge);
    }

    /** ============ 4) 壁際コラム（細め・間隔広め） ============ */
    const colW = 130;
    const colD = 240;
    const colH = wallH - 180;
    for (const sign of [-1, 1]) {
        for (let z = -hd + 2400; z <= hd - 2400; z += 11000) {
            const col = new THREE.Mesh(
                new THREE.BoxGeometry(colW, colH, colD),
                matLight
            );
            col.position.set(sign * (hw - colW * 0.5 - 55), midY, z);
            col.castShadow = true;
            col.receiveShadow = true;
            root.add(col);

            const brace = new THREE.Mesh(
                new THREE.BoxGeometry(95, colH * 0.42, 55),
                matDark
            );
            brace.position.set(sign * (hw - colW - 70), midY, z + colD * 0.28);
            brace.rotation.z = sign * -0.28;
            brace.castShadow = true;
            root.add(brace);
        }
    }

    /** ============ 5) 機械ポッド（一回り小さく・間隔広く） ============ */
    const podW = 260;
    const podH = wallH * 0.42;
    const podD = 420;
    const podMatOrange = new THREE.MeshStandardMaterial({
        color: 0xffa040,
        emissive: 0xff7020,
        emissiveIntensity: 0.9,
        roughness: 0.5,
        metalness: 0.35,
        fog: true
    });
    let pi = 0;
    for (const sign of [-1, 1]) {
        for (let z = -hd + 2800; z <= hd - 2800; z += 7200) {
            pi++;
            const pod = new THREE.Mesh(
                new THREE.BoxGeometry(podD, podH, podW),
                matPod
            );
            pod.position.set(sign * (hw - podD * 0.5 - 140), midY - wallH * 0.04, z);
            pod.castShadow = true;
            root.add(pod);

            const band = new THREE.Mesh(
                new THREE.BoxGeometry(18, podH * 0.32, podW - 28),
                podMatOrange
            );
            band.position.set(sign * (hw - podD - 22), midY - wallH * 0.015, z);
            band.castShadow = false;
            root.add(band);

            if (pi % 3 === 0) {
                const dish = new THREE.Mesh(
                    new THREE.CylinderGeometry(110, 95, 28, 14, 1),
                    matLight
                );
                dish.rotation.z = Math.PI / 2;
                dish.position.set(sign * (hw - podD - 55), midY + podH * 0.38, z);
                dish.castShadow = true;
                root.add(dish);
            }
        }
    }

    /** ============ 6) 天井サイドの細ダクト（壁際だけ・低く） ============ */
    const ductH = 95;
    const ductW = 220;
    for (const sign of [-1, 1]) {
        const duct = new THREE.Mesh(
            new THREE.BoxGeometry(ductW, ductH, longLen),
            matDark
        );
        duct.position.set(sign * (hw - ductW * 0.5 - 120), cy - ductH * 0.5 - 22, 0);
        duct.castShadow = true;
        root.add(duct);
    }

    /** ============ 7) 奥リアクター周りの枠（一回り小さく） ============ */
    const reactorZ = -hd + 900;
    const reactorY = fy + wallH * 0.45;
    const frameR = 540;
    const frameT = 42;
    for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const seg = new THREE.Mesh(
            new THREE.BoxGeometry(300, frameT * 2, frameT),
            matLight
        );
        seg.position.set(Math.cos(ang) * frameR, reactorY + Math.sin(ang) * frameR * 0.32, reactorZ + 100);
        seg.rotation.y = -ang + Math.PI / 2;
        seg.rotation.x = 0.1;
        seg.castShadow = true;
        root.add(seg);
    }
}
