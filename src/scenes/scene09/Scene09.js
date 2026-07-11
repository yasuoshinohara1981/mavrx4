/**
 * Scene09: data.scan  — 池田亮司 / Alva Noto (Carsten Nicolai) 風のモノクロ・データビジュアル
 *
 * コンセプト（高密度版）:
 *  - 純白 × 純黒のみ。色は使わない（モノクロの極限）
 *  - 圧倒的情報量：微細グリッド + 複数オシロ波形 + データマトリクス（0/1の海）+ スペクトラム
 *  - 十字の走査線（座標表示付き）が画面を切り裂く
 *  - 動きは硬質・離散的（ランダムな揺らぎより「データが切り替わる」感）
 *
 * 描画は GPU 一括（LineSegments / Points / InstancedMesh / BufferGeometry）で、
 * 大量要素でも軽く回るように設計。GLSLシェーダーは使わない。
 *
 * OSC連動:
 *  - track5: 走査線ジャンプ + 全波形にインパルス + データ再構成
 *  - velocity=振幅, duration=サスティン, noteNumber=周波数/位置の量子化
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';

export class Scene09 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'data.scan | ∿ test pattern 09';
        this.sceneNumber = 9;
        this.kitNo = 9;
        this.sharedResourceManager = sharedResourceManager;

        // ---- レイアウト ----
        this.fieldW = 1800.0;
        this.fieldH = 1800.0;

        // ---- 歪む格子（直交テストパターンをやめ、波打つメッシュに）----
        // 縦線・横線を多点の折れ線にして、毎フレーム有機的にうねらせる。
        this.gridCols = 24;          // 縦線の本数
        this.gridRows = 24;          // 横線の本数
        this.gridDetail = 40;        // 1本あたりの分割点（うねりの滑らかさ）
        this.gridMesh = null;        // LineSegments
        this.gridBasePos = null;     // 各点の基準座標（歪み計算の元）
        this.gridWarpAmp = 0.0;      // うねりの強さ（busLevelに反応）

        // クラスタリング/十字スナップ用にグリッド密度の別名を保持（旧名互換）
        this.gridFineCols = this.gridCols * 2;
        this.gridFineRows = this.gridRows * 2;
        this.gridCoarseCols = this.gridCols;
        this.gridCoarseRows = this.gridRows;

        // ---- トラック別オシロ波形：1トラック=1本、最大12本を中央に重ねる ----
        // 各波形は y=0 を中心に振動。トラックごとに色を変えてヒートマップに。
        this.trackCount = 12;        // track1〜12
        this.waveSegments = 200;     // 1本あたりの分解能（Tube生成用に控えめ）
        this.waveLines = [];         // THREE.Mesh[]（Tube。index = track-1）
        this.wavePositions = [];     // Float32Array[]（波形の点列）
        this.waveTubeRadius = 0.6;   // チューブの太さ（極細シリンダー）
        this._waveCurvePts = [];     // 毎フレーム使い回す Vector3 配列（GC削減）
        this.wavePhase = 0.0;
        // 各トラックの発音状態（エンベロープ＋周波数）
        this.trackVoice = [];        // {env, freq, amp, decay, phase}[]
        this.busLevel = 0.0;         // 全トラックの鳴り合計（マトリクス/バーの反応に使う）

        // ---- データマトリクス（0/1 の海：Pointsで大量描画）----
        this.matrixCols = 160;
        this.matrixRows = 90;
        this.matrixPoints = null;
        this.matrixSizes = null;     // 明滅用にサイズ属性を動かす
        this.matrixBaseAlpha = null;
        this.matrixTick = 0;

        // ---- track5: コールアウト（グリッド位置に表示）----
        this.calloutReady = false;   // setupでscene設定後にtrue

        // ---- コールアウトのテキスト高速差し替え（表示中ずっと矢継ぎ早に流れる）----
        this.calloutTextTick = 0;
        this.calloutTextInterval = 0.05;  // この間隔でlabelTextを別の文字列へ

        // ---- track1: 赤い十字マーカー（グリッド上に積み上げ式で表示）----
        this.crossMax = 256;         // 積み上げ式なので多め
        this.crossGroup = null;      // 十字メッシュをまとめるGroup
        this.crossPool = [];         // 十字Groupのプール
        this._crossNext = 0;         // プール枯渇時のリングバッファ用カウンタ

        // ---- イベント間隔クラスタリング ----
        // 前のシーケンスからの時間が短いほど「前回位置の近く」に出す。
        // track別に最終発火時刻と最終位置を保持。
        this.lastEvtTime = {};       // { [track]: time }
        this.lastEvtPos = {};        // { [track]: THREE.Vector3 }
        this.clusterFarTime = 0.6;   // この秒数以上空けば「画面全体ランダム」扱い

        // ---- 十字走査線 ----
        this.scanH = null;           // 横線
        this.scanV = null;           // 縦線
        this.scanY = 0.0;            // -0.5..0.5
        this.scanX = 0.0;
        this.scanTargetY = 0.0;
        this.scanTargetX = 0.0;
        this.scanSpeed = 0.05;

        // ---- レジストレーションマーク（四隅の照準・テストパターンの記号）----
        this.marks = null;

        // ---- 擬似乱数（離散更新用シード）----
        this.seed = 0x9e3779b9 | 0;

        this.time = 0.0;

        this.setScreenshotText(this.title);
    }

    async setup() {
        await super.setup();

        this.scene.background = new THREE.Color(0x000000);

        if (this.camera) {
            this.camera.position.set(0, 0, 1500);
            this.camera.lookAt(0, 0, 0);
            this.camera.up.set(0, 1, 0);
        }

        this._buildGrids();
        this._buildWaves();
        // this._buildMatrix();  // チカチカ光るデータマトリクスは一旦OFF（ユーザー要望）
        this._buildScan();
        this._buildMarks();
        this._buildCrossPool();

        // コールアウトをこのシーンの2Dレイヤーで使う（worldPos指定→自動で画面投影）
        if (this.calloutSystem) {
            this.calloutSystem.setUse3DCallouts(false);  // 2D描画（HUD経由）
            // テストパターンらしいデータラベルを大量に（矢継ぎ早ストリーム用）
            this.calloutSystem.setLabels([
                'SCAN_ID: 0x09', 'FREQ: 440.0Hz', 'AMP: -6.0dB', 'SYNC: LOCKED',
                'CH_01: ACTIVE', 'BIT_RATE: 24/96', 'PHASE: 0.000', 'DATA: STREAM',
                'NODE: 0x18F', 'SIG: STABLE', 'LAT: 0.4ms', 'CRC: OK',
                'BUF: 0xFF3A', 'GAIN: +3.2dB', 'SR: 96000', 'CLK: 24.576M',
                'PTR: 0x00A4', 'SEQ: 1024', 'MOD: PCM', 'DIV: 0x08',
                'TEMP: 31.4C', 'VREF: 1.024V', 'ERR: 0', 'FLAG: 0b1011',
                'ADDR: 0x7FE0', 'CNT: 65535', 'HZ: 13.75', 'DBM: -42',
                'PKT: 0xC1', 'CHKSUM: 0x5E', 'IDX: 0x3F', 'RMS: 0.707',
            ]);
            this.calloutReady = true;
        }
    }

    /** 決定論的PRNG（xorshift） */
    _rand() {
        let x = this.seed | 0;
        x ^= x << 13; x ^= x >> 17; x ^= x << 5;
        this.seed = x;
        return ((x >>> 0) % 1000000) / 1000000;
    }

    _makeLineSegments(positions, opacity) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity });
        return new THREE.LineSegments(geo, mat);
    }

    /**
     * 歪む格子：縦線・横線を多点の折れ線で作る。
     * 各点をonUpdateで有機的にうねらせ、テストパターン感を消す。
     * LineSegments用に「隣り合う点をペア」で並べた頂点配列を作る。
     */
    _buildGrids() {
        const hw = this.fieldW * 0.5;
        const hh = this.fieldH * 0.5;
        const D = this.gridDetail;
        const verts = [];   // 描画用（ペア展開後）
        const base = [];    // 各折れ線の節点（基準座標, x,y,z）

        // 縦線：X固定、Yを D 分割
        for (let i = 0; i <= this.gridCols; i++) {
            const x = -hw + (this.fieldW * i) / this.gridCols;
            const pts = [];
            for (let s = 0; s <= D; s++) {
                const y = -hh + (this.fieldH * s) / D;
                pts.push([x, y, 0]);
            }
            base.push({ pts, dir: 'v', idx: i });
        }
        // 横線：Y固定、Xを D 分割
        for (let j = 0; j <= this.gridRows; j++) {
            const y = -hh + (this.fieldH * j) / this.gridRows;
            const pts = [];
            for (let s = 0; s <= D; s++) {
                const x = -hw + (this.fieldW * s) / D;
                pts.push([x, y, 0]);
            }
            base.push({ pts, dir: 'h', idx: j });
        }

        // 折れ線を LineSegments のペアに展開
        for (const line of base) {
            for (let s = 0; s < line.pts.length - 1; s++) {
                const a = line.pts[s], b = line.pts[s + 1];
                verts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
            }
        }

        const geo = new THREE.BufferGeometry();
        const arr = new Float32Array(verts);
        geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        const mat = new THREE.LineBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.14,
        });
        this.gridMesh = new THREE.LineSegments(geo, mat);
        this.gridMesh.position.z = -4;
        this.scene.add(this.gridMesh);

        // 基準座標を保持（歪み計算の元）。描画配列と同じ並びで保存
        this.gridBasePos = arr.slice();  // コピー（歪み前のオリジナル）
    }

    /** 現在の歪み強度（常時ゆるく + 鳴ってる時に増幅）。格子と十字マーカーで共有 */
    _warpAmp() {
        return 18 + this.busLevel * 40;
    }

    /**
     * 歪む格子の変位を計算（_updateGrid と十字マーカーで共有）。
     * 同じ式を使うことで、赤い印が波打つ地面にピタッと乗ったままになる。
     * @param {number} bx 基準X / @param {number} by 基準Y
     * @param {number} amp うねり強度 / @param {number} t 時刻
     * @param {{x:number,y:number,z:number}} out 結果を書き込むスクラッチ
     */
    _gridWarp(bx, by, amp, t, out) {
        // 2方向の正弦波を重ねた有機的なうねり（流体っぽく）
        out.x = bx + Math.sin(bx * 0.004 + by * 0.003 + t * 0.7) * amp;
        out.y = by + Math.cos(by * 0.004 - bx * 0.003 + t * 0.9) * amp;
        out.z = Math.sin(bx * 0.005 - by * 0.004 + t * 1.1) * amp * 1.5; // Z方向にも波打たせて立体感
        return out;
    }

    /** 歪む格子をonUpdateで更新：各頂点を有機的にうねらせる */
    _updateGrid(dt) {
        if (!this.gridMesh || !this.gridBasePos) return;
        const pos = this.gridMesh.geometry.attributes.position.array;
        const base = this.gridBasePos;
        const t = this.time;
        const amp = this._warpAmp();
        const n = base.length;
        const w = this._warpScratch || (this._warpScratch = { x: 0, y: 0, z: 0 });
        for (let k = 0; k < n; k += 3) {
            this._gridWarp(base[k], base[k + 1], amp, t, w);
            pos[k]     = w.x;
            pos[k + 1] = w.y;
            pos[k + 2] = base[k + 2] + w.z;
        }
        this.gridMesh.geometry.attributes.position.needsUpdate = true;
    }

    /**
     * 赤い十字マーカーを波打つ地面に追従させる（X/Y/Zすべて地面と同じ歪みに乗せる）。
     * 各マーカーは _spawnCross で基準座標(baseX/baseY)を保持しているので、毎フレーム
     * 格子と同じ式で変位を計算して位置を更新する。
     */
    _updateCrossesOnGround() {
        if (!this.crossPool.length) return;
        const t = this.time;
        const amp = this._warpAmp();
        const gz = this.gridMesh ? this.gridMesh.position.z : -4; // 地面メッシュのZオフセット
        const w = this._warpScratch || (this._warpScratch = { x: 0, y: 0, z: 0 });
        for (const cross of this.crossPool) {
            if (!cross.visible || cross.userData.baseX === undefined) continue;
            this._gridWarp(cross.userData.baseX, cross.userData.baseY, amp, t, w);
            // crossGroup.position.z(=0.5) が加わるので、地面のすぐ手前(+0.5)に乗る
            cross.position.set(w.x, w.y, gz + w.z);
        }
    }

    /**
     * ヒートマップ色（t: 0=青 → シアン → 緑 → 黄 → 赤=1）を返す
     * @returns {THREE.Color}
     */
    _heatColor(t) {
        t = Math.max(0, Math.min(1, t));
        // 4区間の線形補間（青→シアン→緑→黄→赤）
        const stops = [
            [0.0, 0.0, 1.0], // 青
            [0.0, 1.0, 1.0], // シアン
            [0.0, 1.0, 0.0], // 緑
            [1.0, 1.0, 0.0], // 黄
            [1.0, 0.0, 0.0], // 赤
        ];
        const seg = t * (stops.length - 1);
        const i = Math.min(stops.length - 2, Math.floor(seg));
        const f = seg - i;
        const a = stops[i], b = stops[i + 1];
        return new THREE.Color(
            a[0] + (b[0] - a[0]) * f,
            a[1] + (b[1] - a[1]) * f,
            a[2] + (b[2] - a[2]) * f
        );
    }

    /**
     * トラック別波形：1トラック=1本、最大12本を画面中央(y=0)に重ねる。
     * 細いチューブ（TubeGeometry）で3D化＝シリンダー/蛇のような波形。
     * 色はヒートマップ（track1=青 … track12=赤）。
     */
    _buildWaves() {
        const hw = this.fieldW * 0.5;
        const n = this.waveSegments;

        // 毎フレーム使い回す曲線点列（GC削減）
        this._waveCurvePts = [];
        for (let i = 0; i < n; i++) this._waveCurvePts.push(new THREE.Vector3());

        for (let w = 0; w < this.trackCount; w++) {
            const pos = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) {
                const x = -hw + (this.fieldW * i) / (n - 1);
                pos[i * 3 + 0] = x;
                pos[i * 3 + 1] = 0;
                pos[i * 3 + 2] = (w - this.trackCount / 2) * 6; // 段ごとにZ方向へずらして立体的に
            }
            const color = this._heatColor(w / (this.trackCount - 1));
            const mat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.9,
                blending: THREE.AdditiveBlending,  // 重なると明るく（ヒートマップ感）
                depthWrite: false,
            });
            // 初期Tube（平らな線）を作る
            const geo = this._buildTubeGeometry(pos);
            const mesh = new THREE.Mesh(geo, mat);
            this.scene.add(mesh);

            this.waveLines.push(mesh);
            this.wavePositions.push(pos);

            // トラックの発音状態を初期化
            this.trackVoice.push({
                env: 0.0,
                freq: 1.5 + w * 0.5,
                amp: 0.5,
                decay: 1.8,
                phase: this._rand(),
            });
        }
    }

    /** 波形点列(Float32Array) から TubeGeometry を作る */
    _buildTubeGeometry(pos) {
        const n = this.waveSegments;
        for (let i = 0; i < n; i++) {
            this._waveCurvePts[i].set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        }
        const curve = new THREE.CatmullRomCurve3(this._waveCurvePts, false, 'catmullrom', 0.5);
        return new THREE.TubeGeometry(curve, n - 1, this.waveTubeRadius, 5, false);
    }

    /** データマトリクス：0/1 の海をPointsで一括描画 */
    _buildMatrix() {
        const cols = this.matrixCols;
        const rows = this.matrixRows;
        const count = cols * rows;
        const hw = this.fieldW * 0.5;
        const hh = this.fieldH * 0.5;

        const positions = new Float32Array(count * 3);
        this.matrixSizes = new Float32Array(count);
        this.matrixBaseAlpha = new Float32Array(count);

        let p = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = -hw + (this.fieldW * (c + 0.5)) / cols;
                const y = -hh + (this.fieldH * (r + 0.5)) / rows;
                positions[p * 3 + 0] = x;
                positions[p * 3 + 1] = y;
                positions[p * 3 + 2] = -2;
                this.matrixSizes[p] = this._rand() > 0.5 ? 3.0 : 0.0; // 0/1のビット
                this.matrixBaseAlpha[p] = 0.4 + this._rand() * 0.6;
                p++;
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(this.matrixSizes, 1));

        // size属性を効かせるため PointsMaterial をカスタム（onBeforeCompile）
        const mat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 3.0,
            sizeAttenuation: false,
            transparent: true,
            opacity: 0.85,
        });
        mat.onBeforeCompile = (shader) => {
            shader.vertexShader = shader.vertexShader
                .replace('uniform float size;', 'attribute float size; uniform float uGlobalSize;')
                .replace('gl_PointSize = size;', 'gl_PointSize = size;');
        };

        this.matrixPoints = new THREE.Points(geo, mat);
        this.scene.add(this.matrixPoints);
    }

    /**
     * マーカー用のメッシュプール（照準十字をやめ、小さな菱形リング◇＋中心ドットに）。
     * 「照準マーク」の記号性を外して独自のデータポイント記号にする。
     * 積み上げ式（消さない）なのでプールは多めに確保。
     */
    _buildCrossPool() {
        this.crossGroup = new THREE.Group();
        this.crossGroup.position.z = 0.5;
        this.scene.add(this.crossGroup);

        const s = 6; // 菱形の半径
        for (let i = 0; i < this.crossMax; i++) {
            const group = new THREE.Group();
            const mat = new THREE.LineBasicMaterial({
                color: 0xff2222, transparent: true, opacity: 0.0,
            });
            // 菱形リング（◇）：上→右→下→左→上で閉じる
            const ringGeo = new THREE.BufferGeometry();
            ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(
                [0, s, 0,  s, 0, 0,  0, -s, 0,  -s, 0, 0,  0, s, 0], 3
            ));
            const ring = new THREE.Line(ringGeo, mat);
            // 中心の小さな点（短い十字ではなく単なるドット＝2点の極小線）
            const dotGeo = new THREE.BufferGeometry();
            dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(
                [-0.8, 0, 0, 0.8, 0, 0], 3
            ));
            const dot = new THREE.LineSegments(dotGeo, mat);
            group.add(ring);
            group.add(dot);
            group.visible = false;
            group.userData.mat = mat;
            this.crossGroup.add(group);
            this.crossPool.push(group);
        }
    }

    /** ランダムな細グリッド交点のワールド座標を返す（パーティクル粒度） */
    _randomGridPoint() {
        const hw = this.fieldW * 0.5;
        const hh = this.fieldH * 0.5;
        const ci = Math.floor(this._rand() * (this.gridFineCols + 1));
        const ri = Math.floor(this._rand() * (this.gridFineRows + 1));
        const x = -hw + (this.fieldW * ci) / this.gridFineCols;
        const y = -hh + (this.fieldH * ri) / this.gridFineRows;
        return new THREE.Vector3(x, y, 0);
    }

    /** 細グリッド交点にスナップ（パーティクル粒度） */
    _snapToGrid(x, y) {
        const hw = this.fieldW * 0.5;
        const hh = this.fieldH * 0.5;
        const cellW = this.fieldW / this.gridFineCols;
        const cellH = this.fieldH / this.gridFineRows;
        let ci = Math.round((x + hw) / cellW);
        let ri = Math.round((y + hh) / cellH);
        ci = Math.max(0, Math.min(this.gridFineCols, ci));
        ri = Math.max(0, Math.min(this.gridFineRows, ri));
        return new THREE.Vector3(-hw + ci * cellW, -hh + ri * cellH, 0);
    }

    /**
     * イベント間隔に応じたグリッド位置を返す。
     * 前回からの間隔が短いほど前回位置の近傍（小さい半径）、長いほど画面全体。
     * @param {number} track トラック番号（track別に前回位置を保持）
     */
    _clusteredGridPoint(track) {
        const now = this.time;
        const last = this.lastEvtTime[track];
        const lastPos = this.lastEvtPos[track];

        let p;
        if (last === undefined || lastPos === undefined || (now - last) >= this.clusterFarTime) {
            // 久しぶり or 初回 → 画面全体からランダム
            p = this._randomGridPoint();
        } else {
            // 間隔が短いほど近く。0秒=最小半径, clusterFarTime=画面全体
            const gap = Math.max(0, now - last);
            const ratio = gap / this.clusterFarTime;     // 0〜1
            // 半径：1セル分〜画面半分。間隔が短いほど小さい
            const minR = this.fieldW / this.gridCoarseCols;        // 1セル
            const maxR = this.fieldW * 0.5;
            const radius = minR + (maxR - minR) * ratio;
            // 前回位置から radius 以内のランダムなオフセット
            const ang = this._rand() * Math.PI * 2;
            const dist = this._rand() * radius;
            const x = lastPos.x + Math.cos(ang) * dist;
            const y = lastPos.y + Math.sin(ang) * dist;
            p = this._snapToGrid(x, y);
        }

        // 状態を更新
        this.lastEvtTime[track] = now;
        this.lastEvtPos[track] = p.clone();
        return p;
    }

    /**
     * 赤い十字マーカーをグリッド上に1つ点灯。
     * 積み上げ式：消さずに残す。プールが尽きたら一番古いものを再利用（FIFO）。
     */
    _spawnCross() {
        let cross = this.crossPool.find(c => !c.visible);
        if (!cross) {
            // 全部使い切ったら一番古いものを使い回す（リングバッファ的に）
            cross = this.crossPool[this._crossNext % this.crossPool.length];
            this._crossNext++;
        }
        const p = this._clusteredGridPoint(1);   // track1: 間隔が短いほど近接配置
        // 基準座標を保持（毎フレーム地面の歪みに追従させるため）
        cross.userData.baseX = p.x;
        cross.userData.baseY = p.y;
        cross.position.set(p.x, p.y, 0);   // 初期位置。次フレームから地面に追従
        cross.visible = true;
        if (cross.userData.mat) cross.userData.mat.opacity = 0.95;
    }

    /** ランダムなデータ文字列を1つ生成（高速切替テキスト用） */
    _randomDataString() {
        const keys = ['FREQ', 'AMP', 'CH', 'BUF', 'PTR', 'SEQ', 'CRC', 'HZ',
            'DBM', 'PKT', 'IDX', 'RMS', 'CLK', 'SR', 'GAIN', 'TMP', 'VREF', 'ERR'];
        const k = keys[Math.floor(this._rand() * keys.length)];
        const r = this._rand();
        let val;
        if (r < 0.4) {
            // 16進
            val = '0x' + Math.floor(this._rand() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
        } else if (r < 0.7) {
            // 浮動小数
            val = (this._rand() * 1000).toFixed(this._rand() < 0.5 ? 1 : 3);
        } else {
            // 2進ビット列
            val = '0b' + Math.floor(this._rand() * 256).toString(2).padStart(8, '0');
        }
        return `${k}:${val}`;
    }

    /** 十字走査線 */
    _buildScan() {
        const hw = this.fieldW * 0.5;
        const hh = this.fieldH * 0.5;
        this.scanH = this._makeLineSegments([-hw, 0, 3, hw, 0, 3], 0.9);
        this.scanV = this._makeLineSegments([0, -hh, 3, 0, hh, 3], 0.9);
        this.scene.add(this.scanH);
        this.scene.add(this.scanV);
    }

    /** 四隅のレジストレーションマーク（照準十字） */
    _buildMarks() {
        const hw = this.fieldW * 0.5;
        const hh = this.fieldH * 0.5;
        const s = 60;       // マークのサイズ
        const inset = 40;   // 端からの距離
        const corners = [
            [-hw + inset, hh - inset], [hw - inset, hh - inset],
            [-hw + inset, -hh + inset], [hw - inset, -hh + inset],
        ];
        const pos = [];
        for (const [cx, cy] of corners) {
            pos.push(cx - s, cy, 2, cx + s, cy, 2); // 横
            pos.push(cx, cy - s, 2, cx, cy + s, 2); // 縦
        }
        this.marks = this._makeLineSegments(pos, 0.7);
        this.scene.add(this.marks);
    }

    onUpdate(deltaTime) {
        const dt = deltaTime || 0.016;
        this.time += dt;
        const hw = this.fieldW * 0.5;
        const hh = this.fieldH * 0.5;

        // ---- 走査線：通常はゆっくり移動、targetへ素早く補間 ----
        this.scanY -= this.scanSpeed * dt;
        if (this.scanY < -0.5) this.scanY += 1.0;
        this.scanX += this.scanSpeed * 0.6 * dt;
        if (this.scanX > 0.5) this.scanX -= 1.0;
        this.scanY += (this.scanTargetY - this.scanY) * Math.min(1, 8 * dt);
        this.scanX += (this.scanTargetX - this.scanX) * Math.min(1, 8 * dt);
        if (this.scanH) this.scanH.position.y = this.scanY * this.fieldH;
        if (this.scanV) this.scanV.position.x = this.scanX * this.fieldW;

        // ---- トラック別波形：1トラック1本を中央(y=0)に重ねる。色はヒートマップ ----
        this.wavePhase += dt;
        const maxSpan = hh * 0.16;   // 波形の最大振れ幅（中央から上下に。細め）
        let bus = 0.0;

        for (let w = 0; w < this.trackCount; w++) {
            const pos = this.wavePositions[w];
            const line = this.waveLines[w];
            const vo = this.trackVoice[w];
            const n = this.waveSegments;

            // エンベロープを指数減衰させる
            vo.env *= Math.exp(-vo.decay * dt);
            vo.phase += vo.freq * dt;
            bus += vo.env;

            // 鳴っていない波形は中央のフラットな線（うっすら）＋微ノイズだけ
            const idle = hh * 0.004;
            const amp = idle + vo.env * maxSpan;
            // 鳴っている波形ほど不透明に（ヒートマップが盛り上がる）
            line.material.opacity = 0.18 + Math.min(0.8, vo.env) * 0.8;

            const baseZ = (w - this.trackCount / 2) * 6;
            for (let i = 0; i < n; i++) {
                const t = i / (n - 1);
                // 基本のサイン波（音程）に、ゆっくり位相がうねる有機的成分を重ねる
                // → 機械的な規則正しさを崩して流体・生物的な動きに
                const organic =
                    Math.sin(t * 3.0 + this.time * 0.6 + w) * 0.35 +
                    Math.sin(t * 1.3 - this.time * 0.4 + w * 0.7) * 0.25;
                const wv =
                    Math.sin((t * vo.freq + vo.phase + organic) * Math.PI * 2) * 0.85 +
                    Math.sin((t * vo.freq * 1.5 + vo.phase * 1.3) * Math.PI * 2) * 0.15;
                pos[i * 3 + 1] = wv * amp;
                // Z方向にも別位相で波打たせる＝蛇のようにくねる立体感
                pos[i * 3 + 2] = baseZ + Math.sin(t * 4.0 + this.time * 0.8 + w) * amp * 0.5;
            }
            // Tubeを作り直す（点列→TubeGeometry）。古いgeometryは破棄
            const newGeo = this._buildTubeGeometry(pos);
            line.geometry.dispose();
            line.geometry = newGeo;
        }
        // 全トラックの鳴り合計を滑らかに追従（グリッドのうねり等の反応に使う）
        this.busLevel += (Math.min(2.0, bus) - this.busLevel) * Math.min(1, 8 * dt);

        // ---- 歪む格子：有機的にうねらせる ----
        this._updateGrid(dt);

        // ---- 赤い十字マーカー：積み上げ式（消さない）。波打つ地面に追従させる ----
        this._updateCrossesOnGround();

        // ---- コールアウト：表示中のテキストを高速で矢継ぎ早に差し替える ----
        if (this.calloutReady && this.calloutSystem) {
            // labelTextを高速で別の文字列へ（HUD上部みたいに情報が次々流れる）
            this.calloutTextTick += dt;
            if (this.calloutTextTick >= this.calloutTextInterval) {
                this.calloutTextTick = 0;
                for (const co of this.calloutSystem.callouts) {
                    // typewriter演出が終わった（テキスト表示フェーズ）コールアウトだけ差し替え
                    if (co.textCharCount > 0) {
                        co.labelText = this._randomDataString();
                        co.textCharCount = co.labelText.length;  // 全文表示（1文字ずつには戻さない）
                    }
                }
            }
            // コールアウト本体のアニメ進行（生成はtrack5、ここでは進めるだけ）
            this.calloutSystem.update(dt, this.time, this.camera, { autoGenerate: false });
        }

        // ---- データマトリクスは一旦OFF（チカチカ光るのでユーザー要望で停止）----
    }

    /**
     * トラックイベントでそのトラックの波形を発音させる（オーディオリアクティブの核）。
     * 1トラック=1波形なので、該当トラックのエンベロープを叩き直す。
     */
    _addVoice(note, velocity, track) {
        const idx = track - 1;
        if (idx < 0 || idx >= this.trackVoice.length) return;
        const v = Math.max(0, Math.min(127, velocity)) / 127;
        const vo = this.trackVoice[idx];
        // noteで波形の周波数を更新（音程が見える）。山は少なめ＝横に引き延ばした波
        vo.freq = 1.0 + (note % 24) * 0.18 + idx * 0.12;   // ざっくり 1〜6 の範囲
        vo.env = 0.5 + v * 0.7;          // velocityで立ち上がりの高さ
        vo.decay = 2.4 - v * 1.4;        // 強い音ほどゆっくり減衰（長く残る）
        vo.phase = this._rand();         // 毎回ランダムな位相で叩き直す
    }

    /** マトリクスのビットを一部反転（fraction の割合） */
    _scrambleMatrix(fraction) {
        if (!this.matrixPoints) return;
        const count = this.matrixSizes.length;
        const flips = Math.floor(count * fraction);
        for (let k = 0; k < flips; k++) {
            const idx = Math.floor(this._rand() * count);
            this.matrixSizes[idx] = this.matrixSizes[idx] > 0 ? 0.0 : (2.0 + this._rand() * 2.5);
        }
        this.matrixPoints.geometry.attributes.size.needsUpdate = true;
    }

    /**
     * OSCを直接横取りする（重要）。
     * SceneBase.handleOSC は track1 を「カメラ切替」として処理し return してしまうため、
     * このシーンでは handleOSC を上書きして track1/track5 を自前で処理する。
     * track2/3/4（色反転・色収差・グリッチ）と /phase /tick 等は親に委譲する。
     */
    handleOSC(message) {
        const trackNumber = message?.trackNumber;
        const args = message?.args || [];
        const note = args.length > 0 ? Number(args[0]) : 60;
        const velocity = args.length > 1 ? Number(args[1]) : 100;
        const durationMs = args.length > 2 ? Number(args[2]) : 0;
        const v = Math.max(0, Math.min(127, velocity)) / 127;

        // --- 全トラックのノートを波形ボイスとして登録（オーディオリアクティブ）---
        if (trackNumber >= 1 && trackNumber <= 12) {
            this._addVoice(note, velocity, trackNumber);
        }

        // --- track1: 赤い十字マーカー（クラスタリング配置）＋カメラランダマイズ ---
        //     十字マーカーは常に出す。カメラ切替はトグル（trackEffects[1]）ON時のみ。
        if (trackNumber === 1) {
            this._spawnCross();
            if (this.trackEffects[1]) this.switchCameraRandom();
            return;
        }

        // --- track5: 走査線ジャンプ＋交差点にコールアウトを1個 ---
        if (trackNumber === 5) {
            // まず走査線のジャンプ先を決める（noteで量子化）
            this.scanTargetY = (((note % 12) - 6) / 12);
            // X位置：note>>2は下位2ビットを捨てるため近いnoteだとほぼ動かない。
            // note*5%12なら12通りに均等分散して縦線が横いっぱいに飛ぶ。
            this.scanTargetX = ((((note * 5) % 12) - 6) / 12);

            // 走査線の交差点（ジャンプ先）にコールアウトを出す
            if (this.calloutReady && this.calloutSystem) {
                const p = new THREE.Vector3(
                    this.scanTargetX * this.fieldW,
                    this.scanTargetY * this.fieldH,
                    0
                );
                const duration = durationMs > 0 ? Math.max(4.0, durationMs / 1000) : (5.0 + this._rand() * 3.0);
                this.calloutSystem.createCallout({ worldPos: p, time: this.time, duration });
                const co = this.calloutSystem.callouts[this.calloutSystem.callouts.length - 1];
                if (co) {
                    co.radius = 8 + this._rand() * 5;   // 小さめ
                    co.lineLen = 40 + this._rand() * 30;
                    co.horizLen = 70 + this._rand() * 50;
                    co.fontScale = 1.0;
                }
            }
            return;
        }

        // それ以外（track2/3/4 のエフェクト、/phase、/tick など）は親に委譲
        super.handleOSC(message);
    }

    dispose() {
        const disposeObj = (obj) => {
            if (!obj) return;
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
            if (this.scene) this.scene.remove(obj);
        };
        disposeObj(this.gridMesh);
        for (const line of this.waveLines) disposeObj(line);
        disposeObj(this.matrixPoints);
        disposeObj(this.scanH);
        disposeObj(this.scanV);
        disposeObj(this.marks);

        // マーカープールを破棄（各マーカーはGroup＝子を辿る）
        for (const marker of this.crossPool) {
            marker.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }
        if (this.crossGroup && this.scene) this.scene.remove(this.crossGroup);

        // コールアウトを片付ける（このシーンで生成したものをクリア）
        if (this.calloutSystem) {
            this.calloutSystem.callouts = [];
            this.calloutSystem.lastCalloutTime = 0;
        }

        this.gridMesh = this.matrixPoints = null;
        this.gridBasePos = null;
        this.scanH = this.scanV = this.marks = this.crossGroup = null;
        this.waveLines = [];
        this.wavePositions = [];
        this.crossPool = [];
        this.trackVoice = [];

        super.dispose();
    }
}
