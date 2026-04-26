import * as THREE from 'three';

/**
 * ブリッジ風：白系パネル、天井リブ、Z 方向の連続ライトトラフ、奥の全面窓（宇宙ビュー）
 */

function createSpacePanoramaTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#070d18');
    sky.addColorStop(0.35, '#152a42');
    sky.addColorStop(0.7, '#2a5070');
    sky.addColorStop(1, '#4a7090');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1024, 512);
    ctx.fillStyle = '#5a98c8';
    ctx.beginPath();
    ctx.ellipse(520, 540, 720, 480, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8ec4b0';
    ctx.beginPath();
    ctx.ellipse(460, 520, 420, 320, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,220,180,0.35)';
    ctx.beginPath();
    ctx.ellipse(380, 480, 180, 120, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 120; i++) {
        const a = 0.15 + Math.random() * 0.85;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(Math.random() * 1024, Math.random() * 380, 2, 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
}

function whitePanelMat(emissive = 0x000000, emissiveIntensity = 0) {
    return new THREE.MeshStandardMaterial({
        color: 0xf2f6fa,
        emissive,
        emissiveIntensity,
        roughness: 0.38,
        metalness: 0.18,
        envMapIntensity: 0.85,
        fog: true
    });
}

function lightTroughMat() {
    return new THREE.MeshStandardMaterial({
        color: 0xe8f4fc,
        emissive: 0xb8e8ff,
        emissiveIntensity: 1.15,
        roughness: 0.28,
        metalness: 0.12,
        fog: true
    });
}

/**
 * 壁・天井の帯・凹凸・ソフィットなど（ボックスの組み合わせで複雑化）
 */
function addInteriorGreeble(g, hw, hd, floorY, ceilY, wallH, wallCenterY, slab, z0, z1) {
    const trimMat = whitePanelMat(0xd8e0ea, 0.03);

    /** 天井サイド・ソフィット（一段落ちた軒裏） */
    const soffitH = 110;
    const soffitX = 420;
    const soffitLen = hd * 2 - 900;
    for (const sign of [-1, 1]) {
        const sf = new THREE.Mesh(new THREE.BoxGeometry(soffitX, soffitH, soffitLen), trimMat);
        sf.position.set(sign * (hw - soffitX * 0.5 - 40), ceilY - 205, 0);
        sf.castShadow = true;
        g.add(sf);
    }

    /** 既存クロス梁の中間に細い補助梁（密度アップ） */
    const thinCrossMat = whitePanelMat(0xdde6ef, 0.03);
    let zi = 0;
    for (let z = z0 - 4800; z >= z1 + 4800; z -= 4800) {
        zi++;
        if (zi % 2 === 0) continue;
        const thin = new THREE.Mesh(
            new THREE.BoxGeometry(hw * 2 - 120, 38, 85),
            thinCrossMat
        );
        thin.position.set(0, ceilY - 88, z);
        thin.castShadow = true;
        g.add(thin);
    }

    /** 壁先端〜天井を繋ぐコーナーブラケット（ピラスタ列と Z をずらして干渉回避） */
    const brkMat = whitePanelMat(0xd0dae6, 0.02);
    const brkW = 120;
    const brkH = 160;
    const brkD = 70;
    for (let z = z0 - 5800; z >= z1 + 5800; z -= 11000) {
        for (const sign of [-1, 1]) {
            const br = new THREE.Mesh(new THREE.BoxGeometry(brkW, brkH, brkD), brkMat);
            br.position.set(sign * (hw - 130), ceilY - 95, z);
            br.castShadow = true;
            g.add(br);
        }
    }

    /** 天井メンテ用ハッチ風の段差パネル（ごく薄く） */
    const hatchMat = whitePanelMat(0xc5d2e0, 0.05);
    for (let z = z0 - 7200; z >= z1 + 7200; z -= 7600) {
        const hatch = new THREE.Mesh(new THREE.BoxGeometry(640, 24, 480), hatchMat);
        hatch.position.set(0, ceilY - 118, z);
        hatch.castShadow = false;
        g.add(hatch);
    }
}

function conduitMetalMat() {
    return new THREE.MeshStandardMaterial({
        color: 0x9aaab8,
        roughness: 0.35,
        metalness: 0.62,
        envMapIntensity: 0.75,
        fog: true
    });
}

function ventGrilleMat() {
    return new THREE.MeshStandardMaterial({
        color: 0x2a3540,
        emissive: 0x1a2530,
        emissiveIntensity: 0.06,
        roughness: 0.55,
        metalness: 0.4,
        fog: true
    });
}

/**
 * さらに密度を上げる：床ラチス、壁の通風口・縦帯、配管、斜材、天井ポッド等
 */
function addDeepGreeble(g, hw, hd, floorY, ceilY, wallH, wallCenterY, slab, z0, z1) {
    const trimMat = whitePanelMat(0xd5dde6, 0.025);
    const lenZ = hd * 2 - 800;
    const floorDetailY = floorY + slab + 18;

    /** 中央通路のラチス（Z 方向ランナー） */
    const runW = 32;
    const runH = 14;
    const runLen = lenZ - 400;
    const runXs = [-1180, -520, 0, 520, 1180];
    const runMat = conduitMetalMat();
    for (const rx of runXs) {
        const run = new THREE.Mesh(new THREE.BoxGeometry(runW, runH, runLen), runMat);
        run.position.set(rx, floorDetailY, 0);
        run.receiveShadow = true;
        run.castShadow = false;
        g.add(run);
    }

    /** 中央通路の横桟（X 方向） */
    const latW = 2600;
    const latT = 12;
    for (let z = z0 - 3600; z >= z1 + 3600; z -= 6600) {
        const lat = new THREE.Mesh(new THREE.BoxGeometry(latW, latT, 160), runMat);
        lat.position.set(0, floorDetailY + 4, z);
        lat.castShadow = false;
        g.add(lat);
    }

    /** 壁面の細い縦モール（ランダム間隔っぽく固定シード） */
    const mullW = 28;
    const mullMat = whitePanelMat(0xe0e8f0, 0.02);
    for (let zi = 0, z = z0 - 1400; z >= z1 + 1400; z -= 2900, zi++) {
        for (const sign of [-1, 1]) {
            const mx = sign * (hw - 102);
            const mh = wallH - 220 - (zi % 3) * 40;
            const mull = new THREE.Mesh(new THREE.BoxGeometry(mullW, mh, 70), mullMat);
            mull.position.set(mx, wallCenterY - 30 + (zi % 2) * 25, z);
            mull.castShadow = false;
            g.add(mull);
        }
    }

    /** 通風口風の凹枠＋グリル */
    const ventFrameMat = whitePanelMat(0xb8c4d0, 0.03);
    const ventGrilleShared = ventGrilleMat();
    for (let z = z0 - 8800; z >= z1 + 8800; z -= 13000) {
        for (const sign of [-1, 1]) {
            const vx = sign * (hw - 125);
            const frame = new THREE.Mesh(new THREE.BoxGeometry(220, 140, 28), ventFrameMat);
            frame.position.set(vx, floorY + wallH * 0.38, z);
            frame.castShadow = true;
            g.add(frame);
            const vent = new THREE.Mesh(new THREE.BoxGeometry(180, 100, 16), ventGrilleShared);
            vent.position.set(vx, floorY + wallH * 0.38, z + sign * 8);
            vent.castShadow = false;
            g.add(vent);
        }
    }

    /** 天井手前の角パイプ（円筒・ジオメトリはパイプごとに分離） */
    const pipeMat = conduitMetalMat();
    const pipeR = 38;
    const pipeLen = lenZ - 1400;
    for (const sign of [-1, 1]) {
        const cylGeo = new THREE.CylinderGeometry(pipeR, pipeR, pipeLen, 10);
        cylGeo.rotateX(Math.PI / 2);
        const pipe = new THREE.Mesh(cylGeo, pipeMat);
        pipe.position.set(sign * (hw - 240), ceilY - 380, 0);
        pipe.castShadow = true;
        g.add(pipe);
    }

    /** 壁〜中間高さの斜め補剛材（薄いボックスを傾ける） */
    const braceMat = whitePanelMat(0xc8d4de, 0.03);
    const braceLen = 420;
    const braceT = 34;
    for (let z = z0 - 4000; z >= z1 + 4000; z -= 9000) {
        for (const sign of [-1, 1]) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(braceT, braceLen, braceT), braceMat);
            b.position.set(sign * (hw - 200), wallCenterY + 400, z);
            b.rotation.z = sign * -0.38;
            b.castShadow = true;
            g.add(b);
        }
    }

    /** 天井下の機器ブロック（センサー／スピーカ風） */
    const podMat = whitePanelMat(0xb0c0d0, 0.06);
    for (let z = z0 - 5000; z >= z1 + 5000; z -= 9600) {
        for (const x of [-hw * 0.35, hw * 0.35]) {
            const pod = new THREE.Mesh(new THREE.BoxGeometry(200, 55, 140), podMat);
            pod.position.set(x, ceilY - 268, z);
            pod.castShadow = true;
            g.add(pod);
        }
    }

    /** リブ同士を結ぶ短い X 方向ジョイスト（サンプル位置） */
    const joinMat = whitePanelMat(0xd8e2ec, 0.03);
    const joinLen = hw * 1.05;
    const joinT = 42;
    const joinD = 48;
    for (let z = z0 - 6200; z >= z1 + 6200; z -= 8200) {
        const j = new THREE.Mesh(new THREE.BoxGeometry(joinLen, joinT, joinD), joinMat);
        j.position.set(0, ceilY - 128, z);
        j.castShadow = true;
        g.add(j);
    }

    /** 床のエッジラインパネル（中央通路とレーンの境） */
    const edgeMat = whitePanelMat(0xe8eef5, 0.08);
    const edgeH = 22;
    const edgeLen = lenZ - 200;
    const edgeX = hw - 1900;
    for (const sign of [-1, 1]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(48, edgeH, edgeLen), edgeMat);
        edge.position.set(sign * edgeX, floorY + slab + edgeH * 0.5 + 6, 0);
        edge.castShadow = false;
        g.add(edge);
    }
}

function emissiveSafetyStripMat() {
    return new THREE.MeshStandardMaterial({
        color: 0xffe8cc,
        emissive: 0xff9944,
        emissiveIntensity: 0.28,
        roughness: 0.45,
        metalness: 0.15,
        fog: true
    });
}

function darkFloorPanelMat() {
    return new THREE.MeshStandardMaterial({
        color: 0x8899aa,
        emissive: 0x111820,
        emissiveIntensity: 0.03,
        roughness: 0.55,
        metalness: 0.35,
        fog: true
    });
}

/**
 * 第3レイヤー：ボルト風突起、誘導灯、スプリンクラ、ケーブル、手すり柱、天井アンテナ等
 */
function addExtraPartsGreeble(g, hw, hd, floorY, ceilY, wallH, wallCenterY, slab, z0, z1) {
    const boltMat = conduitMetalMat();
    const boltGeo = new THREE.CylinderGeometry(12, 12, 18, 6);
    for (let z = z0 - 5000; z >= z1 + 5000; z -= 4800) {
        for (const yr of [0.2, 0.45, 0.62, 0.82]) {
            for (const sign of [-1, 1]) {
                const bolt = new THREE.Mesh(boltGeo, boltMat);
                bolt.position.set(sign * (hw - 76), floorY + wallH * yr, z);
                bolt.rotation.z = sign * (Math.PI / 2);
                bolt.castShadow = false;
                g.add(bolt);
            }
        }
    }

    const safetyMat = emissiveSafetyStripMat();
    const stripH = 14;
    const stripLen = hd * 2 - 400;
    for (const sign of [-1, 1]) {
        const lowStrip = new THREE.Mesh(new THREE.BoxGeometry(36, stripH, stripLen), safetyMat);
        lowStrip.position.set(sign * (hw - 70), floorY + slab + 95, 0);
        lowStrip.castShadow = false;
        g.add(lowStrip);
        const hiStrip = new THREE.Mesh(new THREE.BoxGeometry(32, stripH * 0.85, stripLen), safetyMat);
        hiStrip.position.set(sign * (hw - 74), floorY + wallH * 0.92, 0);
        hiStrip.castShadow = false;
        g.add(hiStrip);
    }

    const floorPanelMat = darkFloorPanelMat();
    for (let z = z0 - 4100; z >= z1 + 4100; z -= 7200) {
        const fp = new THREE.Mesh(new THREE.BoxGeometry(480, 12, 360), floorPanelMat);
        fp.position.set(0, floorY + slab + 18, z);
        fp.castShadow = false;
        g.add(fp);
    }

    const railMat = whitePanelMat(0xdde8f0, 0.04);
    const railPostH = 820;
    const railPostT = 40;
    for (let z = z0 - 3300; z >= z1 + 3300; z -= 5200) {
        for (const x of [-720, 720]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(railPostT, railPostH, railPostT), railMat);
            post.position.set(x, floorY + slab + railPostH * 0.5 + 20, z);
            post.castShadow = true;
            g.add(post);
        }
        const railTop = new THREE.Mesh(new THREE.BoxGeometry(1500, 22, railPostT), railMat);
        railTop.position.set(0, floorY + slab + railPostH + 32, z);
        railTop.castShadow = false;
        g.add(railTop);
    }

    const sprinkMat = conduitMetalMat();
    for (let z = z0 - 6100; z >= z1 + 6100; z -= 8800) {
        for (const x of [-1400, 0, 1400]) {
            const sg = new THREE.CylinderGeometry(16, 22, 48, 8);
            const sp = new THREE.Mesh(sg, sprinkMat);
            sp.position.set(x, ceilY - 198, z);
            sp.castShadow = false;
            g.add(sp);
        }
    }

    const cableMat = new THREE.MeshStandardMaterial({
        color: 0x606878,
        roughness: 0.5,
        metalness: 0.5,
        fog: true
    });
    const cableR = 9;
    for (let c = 0; c < 5; c++) {
        const cx = -400 + c * 200;
        for (let i = 0; i < 12; i++) {
            const seg = new THREE.Mesh(new THREE.CylinderGeometry(cableR, cableR, 95, 6), cableMat);
            const zBase = z0 - 9000 - c * 2200;
            seg.position.set(cx, ceilY - 320 - i * 100, zBase);
            seg.castShadow = false;
            g.add(seg);
        }
    }

    const antMat = whitePanelMat(0xb8c8d8, 0.05);
    for (let z = z0 - 9100; z >= z1 + 9100; z -= 15000) {
        const a1 = new THREE.Mesh(new THREE.BoxGeometry(28, 120, 28), antMat);
        a1.position.set(-hw * 0.25, ceilY - 60, z);
        a1.castShadow = false;
        g.add(a1);
        const a2 = new THREE.Mesh(new THREE.BoxGeometry(22, 90, 22), antMat);
        a2.position.set(-hw * 0.25, ceilY - 150, z);
        a2.castShadow = false;
        g.add(a2);
        const a3 = new THREE.Mesh(new THREE.BoxGeometry(hw * 0.5, 12, 12), antMat);
        a3.position.set(0, ceilY - 52, z);
        a3.castShadow = false;
        g.add(a3);
    }

    const labelMat = whitePanelMat(0xa8b8c8, 0.04);
    for (let z = z0 - 7500; z >= z1 + 7500; z -= 17000) {
        for (const sign of [-1, 1]) {
            const plate = new THREE.Mesh(new THREE.BoxGeometry(280, 95, 12), labelMat);
            plate.position.set(sign * (hw - 118), wallCenterY + 200, z);
            plate.castShadow = false;
            g.add(plate);
        }
    }

    const cornerMat = whitePanelMat(0xc5d0da, 0.03);
    for (let z = z0 - 2000; z >= z1 + 2000; z -= 11000) {
        for (const sign of [-1, 1]) {
            const lx = sign * (hw - 40);
            const c1 = new THREE.Mesh(new THREE.BoxGeometry(90, 55, 90), cornerMat);
            c1.position.set(lx, floorY + slab + 40, z);
            c1.castShadow = true;
            g.add(c1);
        }
    }

    const ductMat = whitePanelMat(0xb0bec8, 0.04);
    for (let z = z0 - 11000; z >= z1 + 11000; z -= 12000) {
        const duct = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 - 240, 55, 200), ductMat);
        duct.position.set(0, ceilY - 455, z);
        duct.castShadow = true;
        g.add(duct);
    }
}

/**
 * @param {{ roomGroup: THREE.Group, roomHalfW: number, roomHalfD: number, floorTopY: number, ceilingY: number }} scene
 */
export function buildBridgeInterior(scene) {
    const g = new THREE.Group();
    g.name = 'bridgeInterior';

    const hw = scene.roomHalfW;
    const hd = scene.roomHalfD;
    const floorY = scene.floorTopY;
    const ceilY = scene.ceilingY;
    const wallH = ceilY - floorY;
    const wallCenterY = floorY + wallH * 0.5;

    const slab = 24;

    /** 奥の全面窓（-Z 端）。法線 +Z で通路側を向く */
    const winW = hw * 2 - 120;
    const winH = wallH - 220;
    const winZ = -hd + 280;
    const winTex = createSpacePanoramaTexture();
    const winMat = new THREE.MeshStandardMaterial({
        map: winTex,
        emissive: 0xa8d8ff,
        emissiveIntensity: 0.42,
        roughness: 0.75,
        metalness: 0,
        fog: false,
        side: THREE.DoubleSide
    });
    const winGeo = new THREE.PlaneGeometry(winW, winH);
    const windowMesh = new THREE.Mesh(winGeo, winMat);
    windowMesh.position.set(0, wallCenterY, winZ);
    windowMesh.renderOrder = -1;
    g.add(windowMesh);

    /** 窓枠（薄いリム） */
    const frameT = 44;
    const frameMat = whitePanelMat(0x8899aa, 0.04);
    const topFrame = new THREE.Mesh(new THREE.BoxGeometry(winW + frameT * 2, frameT, 80), frameMat);
    topFrame.position.set(0, wallCenterY + winH * 0.5 + frameT * 0.5, winZ);
    g.add(topFrame);
    const botFrame = new THREE.Mesh(new THREE.BoxGeometry(winW + frameT * 2, frameT, 80), frameMat);
    botFrame.position.set(0, wallCenterY - winH * 0.5 - frameT * 0.5, winZ);
    g.add(botFrame);
    const sideFw = new THREE.Mesh(new THREE.BoxGeometry(frameT, winH, 80), frameMat);
    sideFw.position.set(-winW * 0.5 - frameT * 0.5, wallCenterY, winZ);
    g.add(sideFw);
    const sideFe = new THREE.Mesh(new THREE.BoxGeometry(frameT, winH, 80), frameMat);
    sideFe.position.set(winW * 0.5 + frameT * 0.5, wallCenterY, winZ);
    g.add(sideFe);

    /** 天井メイン：少し段を付けた二層 */
    const ceilPanelMat = whitePanelMat(0xd8e8f8, 0.06);
    const deckH = 140;
    const deckDrop = 220;
    const mainCeil = new THREE.Mesh(
        new THREE.BoxGeometry(hw * 2 - 60, deckH, hd * 2 - 400),
        ceilPanelMat
    );
    mainCeil.position.set(0, ceilY - deckH * 0.5 - 40, 0);
    mainCeil.receiveShadow = true;
    mainCeil.castShadow = true;
    g.add(mainCeil);

    const lowerCeil = new THREE.Mesh(
        new THREE.BoxGeometry(hw * 2 - 200, 90, hd * 2 - 600),
        whitePanelMat(0xe8eef5, 0.03)
    );
    lowerCeil.position.set(0, ceilY - deckDrop, 0);
    lowerCeil.receiveShadow = true;
    lowerCeil.castShadow = false;
    g.add(lowerCeil);

    /** Z 方向に走る天井リブ */
    const ribX = 55;
    const ribH = 95;
    const ribLen = hd * 2 - 1200;
    const ribMat = whitePanelMat(0xdde4ec, 0.02);
    const ribXs = [-hw * 0.58, 0, hw * 0.58];
    for (const rx of ribXs) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(ribX, ribH, ribLen), ribMat);
        rib.position.set(rx, ceilY - 95, 0);
        rib.castShadow = true;
        rib.receiveShadow = false;
        g.add(rib);
    }

    /** Z 方向の連続ライトトラフ */
    const troughW = 200;
    const troughH = 52;
    const troughLen = hd * 2 - 1600;
    const troughY = ceilY - 155;
    const troughMat = lightTroughMat();
    const tx = [-hw * 0.42, hw * 0.42];
    for (const x of tx) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(troughW, troughH, troughLen), troughMat);
        t.position.set(x, troughY, 0);
        t.castShadow = true;
        g.add(t);
    }
    const centerTrough = new THREE.Mesh(
        new THREE.BoxGeometry(troughW * 0.85, troughH * 0.9, troughLen * 0.98),
        troughMat
    );
    centerTrough.position.set(0, troughY - 25, 0);
    centerTrough.castShadow = true;
    g.add(centerTrough);

    /** 短手方向クロスリブ（間隔を空けてメッシュ数削減） */
    const crossTh = 70;
    const crossZ = 110;
    const z0 = hd - 800;
    const z1 = -hd + 800;
    const crossMat = whitePanelMat(0xe2eaf2, 0.04);
    for (let z = z0; z >= z1; z -= 9600) {
        const cross = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 - 80, crossTh, crossZ), crossMat);
        cross.position.set(0, ceilY - 70, z);
        cross.castShadow = true;
        g.add(cross);
    }

    addInteriorGreeble(g, hw, hd, floorY, ceilY, wallH, wallCenterY, slab, z0, z1);
    addDeepGreeble(g, hw, hd, floorY, ceilY, wallH, wallCenterY, slab, z0, z1);
    addExtraPartsGreeble(g, hw, hd, floorY, ceilY, wallH, wallCenterY, slab, z0, z1);

    /** 床のサイドレーン（やや光沢） */
    const laneW = hw * 0.38;
    const laneMat = new THREE.MeshStandardMaterial({
        color: 0xf8fbff,
        roughness: 0.22,
        metalness: 0.35,
        envMapIntensity: 1.1,
        fog: true
    });
    const laneGeo = new THREE.BoxGeometry(laneW, slab * 0.5, hd * 2 - 400);
    const laneL = new THREE.Mesh(laneGeo, laneMat);
    laneL.position.set(-hw + laneW * 0.5 + 80, floorY + slab * 0.35, 0);
    laneL.receiveShadow = true;
    laneL.castShadow = true;
    g.add(laneL);
    const laneR = new THREE.Mesh(new THREE.BoxGeometry(laneW, slab * 0.5, hd * 2 - 400), laneMat);
    laneR.position.set(hw - laneW * 0.5 - 80, floorY + slab * 0.35, 0);
    laneR.receiveShadow = true;
    laneR.castShadow = true;
    g.add(laneR);

    scene.roomGroup.add(g);
}
