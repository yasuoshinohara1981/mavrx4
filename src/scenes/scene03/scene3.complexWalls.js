import * as THREE from 'three';

/**
 * 参考画像の通り「水平/垂直だけじゃなく斜めの面」を多用したモジュラー左右壁。
 * 通路断面は天井寄り・床寄りで内側に折れる六角形ライク：
 *   - 天井チャンファ（上から内側へナナメに降りるパネル）
 *   - 床チャンファ（床から内側へナナメに立ち上がるパネル）
 *   - 中央の縦壁（ここに段差・スリット・アーチ）
 * Z セグメントごとに「ドア風アーチ」「斜めリブ」を仕込んで、平面プレートに見えなくする。
 */

function panelMat(colorHex, emissive = 0x000000, emissiveIntensity = 0) {
    return new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive,
        emissiveIntensity,
        roughness: 0.34,
        metalness: 0.22,
        envMapIntensity: 0.88,
        fog: true
    });
}

/**
 * @param {THREE.Group} parent
 * @param {{ roomHalfW: number, roomHalfD: number, floorTopY: number, ceilingY: number }} scene
 */
export function buildModularCorridorWalls(parent, scene) {
    const hw = scene.roomHalfW;
    const hd = scene.roomHalfD;
    const fy = scene.floorTopY;
    const cy = scene.ceilingY;
    const wallH = cy - fy;
    const slab = 24;

    const root = new THREE.Group();
    root.name = 'modularCorridorWalls';

    const matBack = panelMat(0x9aaab8, 0x080810, 0.03);
    const matFace = panelMat(0xecf2f8, 0x000000, 0);
    const matChamfer = panelMat(0xe2e9f0, 0x000000, 0);
    const matRecess = panelMat(0xb8c8d8, 0x050810, 0.04);
    const matConsole = panelMat(0xd8e8f2, 0x000000, 0);
    const matArch = panelMat(0xdde6ef, 0x000000, 0);
    const matSlit = new THREE.MeshStandardMaterial({
        color: 0x121820,
        roughness: 0.88,
        metalness: 0.12,
        fog: true
    });
    const matReveal = new THREE.MeshStandardMaterial({
        color: 0x0a0e14,
        roughness: 0.95,
        metalness: 0.05,
        fog: true
    });

    /** ============ 通長部分（Z 全長を一本でつくる斜めパネル） ============ */
    const longLen = hd * 2 - 200;

    /** 斜め角の角度（ラジアン）。約 38 度＝六角通路ライク */
    const chamferAngle = Math.PI / 180 * 38;
    const chamferThick = 90;
    /** 斜めパネルの高さ（壁面に投影した縦寸） */
    const chamferRise = wallH * 0.30;
    /** 斜めパネルの実際の長さ（縦寸 / sin） */
    const chamferLen = chamferRise / Math.sin(chamferAngle);

    /** 中央の垂直立面の高さ（チャンファ間） */
    const midH = wallH - chamferRise * 2;

    for (const sign of [-1, 1]) {
        /** 外殻（船体側の構造背板：鉛直） */
        const backW = 70;
        const back = new THREE.Mesh(
            new THREE.BoxGeometry(backW, wallH - 40, longLen),
            matBack
        );
        back.position.set(sign * (hw + backW * 0.5 + 10), fy + wallH * 0.5 + 10, 0);
        back.castShadow = true;
        back.receiveShadow = true;
        root.add(back);

        /** 中央の鉛直立面（メイン壁。ここから上下が斜めに折れる） */
        const midD = 90;
        const midX = sign * (hw - midD * 0.5);
        const midY = fy + wallH * 0.5;
        const mid = new THREE.Mesh(
            new THREE.BoxGeometry(midD, midH, longLen),
            matFace
        );
        mid.position.set(midX, midY, 0);
        mid.castShadow = true;
        mid.receiveShadow = true;
        root.add(mid);

        /** 天井チャンファ（壁→天井をナナメに繋ぐ斜め面） */
        const topCham = new THREE.Mesh(
            new THREE.BoxGeometry(chamferLen, chamferThick, longLen),
            matChamfer
        );
        /** 中央立面の上端から斜め上・内側へ伸ばす */
        const topInnerY = midY + midH * 0.5;
        const topOuterY = topInnerY + chamferRise;
        const topCx = sign * (hw - midD - Math.cos(chamferAngle) * chamferLen * 0.5);
        const topCy = (topInnerY + topOuterY) * 0.5;
        topCham.position.set(topCx, topCy, 0);
        /** sign が -1 なら傾きを反転（左壁は逆向き） */
        topCham.rotation.z = sign * -chamferAngle;
        topCham.castShadow = true;
        topCham.receiveShadow = true;
        root.add(topCham);

        /** 床チャンファ（壁→床をナナメに繋ぐ斜め面） */
        const botCham = new THREE.Mesh(
            new THREE.BoxGeometry(chamferLen, chamferThick, longLen),
            matChamfer
        );
        const botInnerY = midY - midH * 0.5;
        const botOuterY = botInnerY - chamferRise;
        const botCx = topCx;
        const botCy = (botInnerY + botOuterY) * 0.5;
        botCham.position.set(botCx, botCy, 0);
        botCham.rotation.z = sign * chamferAngle;
        botCham.castShadow = true;
        botCham.receiveShadow = true;
        root.add(botCham);

        /** チャンファのエッジを締める細リム（上） */
        const rimTop = new THREE.Mesh(
            new THREE.BoxGeometry(34, 30, longLen),
            matFace
        );
        rimTop.position.set(midX - sign * (midD * 0.5 - 17), topInnerY - 18, 0);
        rimTop.castShadow = true;
        root.add(rimTop);

        /** チャンファのエッジを締める細リム（下） */
        const rimBot = new THREE.Mesh(
            new THREE.BoxGeometry(34, 30, longLen),
            matFace
        );
        rimBot.position.set(midX - sign * (midD * 0.5 - 17), botInnerY + 18, 0);
        rimBot.castShadow = true;
        root.add(rimBot);

        /** 床チャンファの先（床に接する側）の斜めリム */
        const rimBotEdge = new THREE.Mesh(
            new THREE.BoxGeometry(28, 28, longLen),
            matFace
        );
        const re_x = sign * (hw - midD - Math.cos(chamferAngle) * chamferLen + 14);
        rimBotEdge.position.set(re_x, botOuterY + 8, 0);
        root.add(rimBotEdge);

        /** 通長の上下水平段（ハイライトレール） */
        const railUp = new THREE.Mesh(new THREE.BoxGeometry(40, 22, longLen), matFace);
        railUp.position.set(midX - sign * (midD * 0.5 - 8), midY + midH * 0.5 - 60, 0);
        root.add(railUp);
        const railDn = new THREE.Mesh(new THREE.BoxGeometry(40, 22, longLen), matFace);
        railDn.position.set(midX - sign * (midD * 0.5 - 8), midY - midH * 0.5 + 60, 0);
        root.add(railDn);

        /** ============ Z セグメントごとのドア枠＋斜めリブ ============ */
        const segmentZ = 2800;
        const zMax = hd - 480;
        const zMin = -hd + 480;
        let seg = 0;

        for (let zc = zMax - segmentZ * 0.5; zc >= zMin + segmentZ * 0.5; zc -= segmentZ) {
            const phase = seg % 3;
            seg++;

            /** 中段レセス（中央立面に張る凹みパネル） */
            const recH = midH * 0.78;
            const rec = new THREE.Mesh(
                new THREE.BoxGeometry(60, recH, segmentZ - 280),
                matRecess
            );
            rec.position.set(midX - sign * (midD * 0.5 + 20), midY, zc);
            rec.castShadow = true;
            root.add(rec);

            /** 下段コンソール（手前に張り出す斜め面付きの台） */
            const conH = midH * 0.55;
            const conD = 170;
            const con = new THREE.Mesh(
                new THREE.BoxGeometry(conD, conH, segmentZ - 240),
                matConsole
            );
            con.position.set(
                sign * (hw - conD * 0.5 - 60),
                fy + slab + conH * 0.5 + 18,
                zc
            );
            con.castShadow = true;
            root.add(con);
            /** コンソール上面の斜めスロープ（手前に向かって下る） */
            const conTop = new THREE.Mesh(
                new THREE.BoxGeometry(120, 26, segmentZ - 260),
                matChamfer
            );
            conTop.position.set(
                sign * (hw - conD - 5),
                fy + slab + conH + 6,
                zc
            );
            conTop.rotation.z = sign * 0.32;
            conTop.castShadow = true;
            root.add(conTop);

            /** 通気スリット（中央立面） */
            const slit = new THREE.Mesh(
                new THREE.BoxGeometry(28, midH * 0.18, segmentZ - 200),
                matSlit
            );
            slit.position.set(midX - sign * (midD * 0.5 + 38), midY, zc);
            slit.castShadow = false;
            root.add(slit);

            /** ドア枠風アーチ（左右の垂直柱＋上の梁＋ナナメの隅切り） */
            const archInner = sign * (hw - midD - 40);
            const archThick = 38;
            const archH = midH * 0.94;
            const archZHalf = 600;
            /** 左の縦柱 */
            const archZpos = zc + segmentZ * 0.5 - archThick * 0.5 - 6;
            const archZneg = zc - segmentZ * 0.5 + archThick * 0.5 + 6;
            for (const azc of [archZpos, archZneg]) {
                const post = new THREE.Mesh(
                    new THREE.BoxGeometry(110, archH, archThick),
                    matArch
                );
                post.position.set(archInner - sign * 35, midY, azc);
                post.castShadow = true;
                root.add(post);
            }

            /** ドア枠の斜め隅切り（4 隅をナナメで落とす） */
            const cornerLen = 240;
            const cornerThick = 36;
            const cornerOffsetY = archH * 0.5 - 20;
            const cornerOffsetZ = segmentZ * 0.5 - 90;
            const cornerCfg = [
                { dy: +1, dz: +1, rot: +1 },
                { dy: +1, dz: -1, rot: -1 },
                { dy: -1, dz: +1, rot: -1 },
                { dy: -1, dz: -1, rot: +1 }
            ];
            for (const c of cornerCfg) {
                const cm = new THREE.Mesh(
                    new THREE.BoxGeometry(cornerLen, cornerThick, 100),
                    matChamfer
                );
                cm.position.set(
                    archInner - sign * 12,
                    midY + c.dy * cornerOffsetY,
                    zc + c.dz * cornerOffsetZ
                );
                cm.rotation.x = c.rot * 0.78;
                cm.castShadow = true;
                root.add(cm);
            }

            /** ドア枠ヘッダ（上部の斜めキャップ） */
            const header = new THREE.Mesh(
                new THREE.BoxGeometry(140, 60, segmentZ - 320),
                matChamfer
            );
            header.position.set(archInner - sign * 30, midY + archH * 0.5 + 6, zc);
            header.rotation.z = sign * 0.18;
            header.castShadow = true;
            root.add(header);

            /** ドア中の暗い「窓／パネル」 */
            const door = new THREE.Mesh(
                new THREE.BoxGeometry(40, archH * 0.78, segmentZ - 360),
                matSlit
            );
            door.position.set(archInner - sign * 8, midY, zc);
            door.castShadow = false;
            root.add(door);

            /** セグメント境界の縦シーム（くっきり溝） */
            const seam = new THREE.Mesh(
                new THREE.BoxGeometry(12, midH - 40, 22),
                matReveal
            );
            seam.position.set(midX - sign * (midD * 0.5 + 4), midY, zc + segmentZ * 0.5 - 11);
            seam.castShadow = false;
            root.add(seam);

            /** 中央立面の斜めリブ（X 字 or ハの字。phase で向きを変える） */
            const ribLen = midH * 0.62;
            const ribTilt = (phase === 1 ? 0.55 : phase === 0 ? -0.55 : 0.55);
            const ribXpos = midX - sign * (midD * 0.5 + 6);
            const ribZ1 = zc - segmentZ * 0.22;
            const ribZ2 = zc + segmentZ * 0.22;
            const rib1 = new THREE.Mesh(
                new THREE.BoxGeometry(38, ribLen, 26),
                matFace
            );
            rib1.position.set(ribXpos, midY, ribZ1);
            rib1.rotation.x = ribTilt;
            rib1.castShadow = true;
            root.add(rib1);
            const rib2 = new THREE.Mesh(
                new THREE.BoxGeometry(38, ribLen, 26),
                matFace
            );
            rib2.position.set(ribXpos, midY, ribZ2);
            rib2.rotation.x = -ribTilt;
            rib2.castShadow = true;
            root.add(rib2);

            /** 床取り合いの斜めスカート（コンソール下を埋める斜面） */
            const skirt = new THREE.Mesh(
                new THREE.BoxGeometry(180, 28, segmentZ - 260),
                matChamfer
            );
            skirt.position.set(sign * (hw - 175), fy + slab + 22, zc);
            skirt.rotation.z = sign * -0.42;
            skirt.castShadow = true;
            root.add(skirt);
        }
    }

    addBoldAngledLayers(root, scene, {
        midH,
        midD: 90,
        midY: fy + wallH * 0.5,
        chamferAngle,
        chamferRise,
        slab,
        matFace,
        matChamfer,
        matBack,
        matRecess,
        matReveal
    });

    parent.add(root);
}

/**
 * 既存形状に重ねる「大胆な斜め」追加レイヤー：
 *   - 二段目の更に急角度なチャンファ（八角形断面化）
 *   - 大きな斜めバットレス（三角フィン）
 *   - 床から立ち上がる斜めウェッジ
 *   - 天井隅のスラント・ヘッダ
 *   - セグメント境界に走る X 字大型ブレース
 */
function addBoldAngledLayers(root, scene, ctx) {
    const hw = scene.roomHalfW;
    const hd = scene.roomHalfD;
    const fy = scene.floorTopY;
    const cy = scene.ceilingY;
    const wallH = cy - fy;
    const longLen = hd * 2 - 200;

    const { midH, midD, midY, chamferAngle, chamferRise, slab, matFace, matChamfer, matBack, matRecess, matReveal } = ctx;

    /** 二段目の急角度チャンファ角（約 65°）。一段目と合わせて八角形断面化 */
    const steepAngle = Math.PI / 180 * 65;
    const steepThick = 70;
    const steepRise = wallH * 0.18;
    const steepLen = steepRise / Math.sin(steepAngle);

    /** ============ 通長：八角形化する更にナナメな帯 ============ */
    for (const sign of [-1, 1]) {
        const midX = sign * (hw - midD * 0.5);
        const topInnerY = midY + midH * 0.5;
        const botInnerY = midY - midH * 0.5;

        /** 上：チャンファのさらに上に「もう一段急なナナメ」 */
        const topSteep = new THREE.Mesh(
            new THREE.BoxGeometry(steepLen, steepThick, longLen),
            matChamfer
        );
        const topInsetX = sign * (hw - midD - Math.cos(chamferAngle) * (chamferRise / Math.sin(chamferAngle)));
        const topSteepY = topInnerY + chamferRise + steepRise * 0.5;
        const topSteepX = topInsetX + sign * -Math.cos(steepAngle) * steepLen * 0.5;
        topSteep.position.set(topSteepX, topSteepY, 0);
        topSteep.rotation.z = sign * -steepAngle;
        topSteep.castShadow = true;
        topSteep.receiveShadow = true;
        root.add(topSteep);

        /** 下：床側にも急なナナメを足す */
        const botSteep = new THREE.Mesh(
            new THREE.BoxGeometry(steepLen, steepThick, longLen),
            matChamfer
        );
        const botSteepY = botInnerY - chamferRise - steepRise * 0.5;
        const botSteepX = topInsetX + sign * -Math.cos(steepAngle) * steepLen * 0.5;
        botSteep.position.set(botSteepX, botSteepY, 0);
        botSteep.rotation.z = sign * steepAngle;
        botSteep.castShadow = true;
        botSteep.receiveShadow = true;
        root.add(botSteep);

        /** 通長の太い斜めシャドウライン（八角の境目に走る暗い帯） */
        const seamLineTop = new THREE.Mesh(
            new THREE.BoxGeometry(20, 14, longLen),
            matReveal
        );
        seamLineTop.position.set(topInsetX + sign * -10, topInnerY + chamferRise * 0.5, 0);
        seamLineTop.rotation.z = sign * -chamferAngle;
        root.add(seamLineTop);

        const seamLineBot = new THREE.Mesh(
            new THREE.BoxGeometry(20, 14, longLen),
            matReveal
        );
        seamLineBot.position.set(topInsetX + sign * -10, botInnerY - chamferRise * 0.5, 0);
        seamLineBot.rotation.z = sign * chamferAngle;
        root.add(seamLineBot);
    }

    /** ============ Z セグメントごとの「大胆フィン」 ============ */
    const finSegZ = 1900;
    const zMax = hd - 700;
    const zMin = -hd + 700;
    let fi = 0;

    for (let zc = zMax; zc >= zMin; zc -= finSegZ) {
        const variant = fi % 4;
        fi++;

        for (const sign of [-1, 1]) {
            /** A) 大型ナナメフィン（壁から内側へ突き出す三角羽） */
            const finLen = 520 + (variant === 0 ? 180 : 0);
            const finH = midH * 0.78;
            const fin = new THREE.Mesh(
                new THREE.BoxGeometry(finLen, finH, 26),
                matFace
            );
            fin.position.set(
                sign * (hw - midD - finLen * 0.5 + 50),
                midY + (variant === 2 ? 80 : -40),
                zc
            );
            fin.rotation.z = sign * (Math.PI / 180 * (variant === 1 ? 32 : variant === 3 ? -28 : 18));
            fin.rotation.y = sign * (Math.PI / 180 * 9);
            fin.castShadow = true;
            root.add(fin);

            /** B) 床から立ち上がる斜めウェッジ（バットレス） */
            const wedgeH = wallH * 0.55;
            const wedge = new THREE.Mesh(
                new THREE.BoxGeometry(360, wedgeH, 90),
                matChamfer
            );
            wedge.position.set(sign * (hw - 230), fy + slab + wedgeH * 0.5, zc);
            wedge.rotation.z = sign * -0.55;
            wedge.castShadow = true;
            root.add(wedge);

            /** C) 天井隅から壁へ落ちるスラント・ブラケット */
            const brk = new THREE.Mesh(
                new THREE.BoxGeometry(420, 60, 110),
                matFace
            );
            brk.position.set(sign * (hw - 280), cy - 240, zc);
            brk.rotation.z = sign * -0.78;
            brk.castShadow = true;
            root.add(brk);

            /** D) 中央立面の X 字大型ブレース（変則的に向きを変える） */
            const brace1 = new THREE.Mesh(
                new THREE.BoxGeometry(28, midH * 0.9, 36),
                matFace
            );
            brace1.position.set(sign * (hw - midD - 20), midY, zc);
            brace1.rotation.x = (variant % 2 === 0 ? 0.62 : -0.62);
            brace1.castShadow = true;
            root.add(brace1);

            const brace2 = new THREE.Mesh(
                new THREE.BoxGeometry(28, midH * 0.9, 36),
                matFace
            );
            brace2.position.set(sign * (hw - midD - 20), midY, zc);
            brace2.rotation.x = (variant % 2 === 0 ? -0.62 : 0.62);
            brace2.castShadow = true;
            root.add(brace2);

            /** E) 八角の頂点付近に走る大型のナナメリブ（ハの字） */
            const ribTop = new THREE.Mesh(
                new THREE.BoxGeometry(220, 38, 60),
                matChamfer
            );
            ribTop.position.set(sign * (hw - 360), midY + midH * 0.45, zc + 240);
            ribTop.rotation.z = sign * -0.95;
            ribTop.rotation.y = sign * 0.18;
            root.add(ribTop);

            const ribBot = new THREE.Mesh(
                new THREE.BoxGeometry(220, 38, 60),
                matChamfer
            );
            ribBot.position.set(sign * (hw - 360), midY - midH * 0.45, zc + 240);
            ribBot.rotation.z = sign * 0.95;
            ribBot.rotation.y = sign * -0.18;
            root.add(ribBot);

            /** F) ドア風アーチ脇の大胆な「斜めキャップ」（4 隅を更に強調） */
            if (variant === 1 || variant === 3) {
                const cap = new THREE.Mesh(
                    new THREE.BoxGeometry(280, 46, 80),
                    matFace
                );
                cap.position.set(sign * (hw - 200), midY + midH * 0.42, zc - 380);
                cap.rotation.z = sign * (variant === 1 ? -1.05 : 1.05);
                cap.castShadow = true;
                root.add(cap);
            }
        }
    }

    /** ============ 床面の「斜めパネル境界」風の薄板（床と壁の境を斜めに繋ぐ） ============ */
    const skirtMat = matChamfer;
    for (const sign of [-1, 1]) {
        const longSkirt = new THREE.Mesh(
            new THREE.BoxGeometry(140, 22, longLen),
            skirtMat
        );
        longSkirt.position.set(sign * (hw - 380), fy + slab + 8, 0);
        longSkirt.rotation.z = sign * -0.28;
        root.add(longSkirt);
    }
}
