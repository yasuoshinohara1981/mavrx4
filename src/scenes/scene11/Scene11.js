/**
 * Scene11: synapse — 大きなガラスケース（ヴィトリーヌ）の中の神経網
 *
 * コンセプト:
 *  「手前だけ抜けた大きな箱（＝目盛り付きの標本ケース）」の内部に組み上がった、
 *  シナプス／ニューロンのネットワーク。ノードガーデン臭さ（距離だけで結ぶ）を避け、
 *  ハブ（大きな中心ニューロン）を核にした構造的な配線にしている。
 *
 *  1) ヴィトリーヌ（箱）＋目盛り
 *     一辺 this.boxSize の立方体。12辺のフレーム（白）は常に描き、内壁は薄いグリッド。
 *     手前（+Z面）の壁グリッドだけ描かない＝中が覗けるオープンフロント。
 *     さらに12辺に沿って「目盛り（刻み・majorは長い）」を内向きに立てる＝計測器の趣。
 *
 *  2) 構造的な神経配線（距離だけで結ばない）
 *     ノードは動き回らず、ホーム位置の周りで微揺れ（構造を保ったまま呼吸）。
 *     - ハブ（先頭 hubCount 個）… 箱の中心付近に置いた大きなニューロン。
 *     - 普通ノード … 最寄りのハブ＋近傍ノードへ「固定エッジ」で配線（scale-free風。
 *       ハブに配線が集中して神経核に見える）。
 *     各エッジは三次ベジェのしなる繊維。さらに一部から樹状突起の「枝分かれ（スパー）」が
 *     伸びる。線は白。
 *
 *  3) 壁のアンカー（赤）
 *     内壁5面（手前=+Zを除く）に貼り付く赤いアンカー。最寄りノードへ配線され、
 *     神経網が壁の端子へ吸い付く。
 *
 *  4) 信号パルス（活動電位）
 *     繊維の上を光点が走る。ニューロンが発火（OSCヒット）すると、そのノードに
 *     つながる繊維へパルスが放たれ、網を伝播する。常時も低頻度で自発発火。
 *
 * 描画: ノード/アンカー = InstancedMesh の球（ライティングで陰影）、繊維 = 白の
 * LineSegments 1体、パルス = 加算Points 1体、箱 = フレーム/壁グリッド/目盛りの LineSegments。
 *
 * OSC連動:
 *  - 全track: エナジー注入＋ランダムなノードが発火（パルスを放つ／点が膨らむ）
 *  - track5: バースト（velocityで強さ）→ ノードが中心から外へ弾け、網が伸びる
 *  - track6: 集約 → ノードが中心へ寄り、網が密に絡む
 *  - track7: 配線の組み替え（新しい神経網レイアウト＋アンカー再配置）
 *  - track8: 信号パルスの色相をアルゴリズム的に進める（スペクトルを歩く）
 *  - track1〜4（カメラ／色反転／色収差／グリッチ）と /phase /tick は親へ委譲
 */

import { SceneBase } from '../SceneBase.js';
import { RandomLFO } from '../../lib/RandomLFO.js';
import { attachDepthOfField } from '../../lib/presentation/DepthOfFieldAndGrain.js';
import * as THREE from 'three';

export class Scene11 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'synapse | vitrine 11';
        this.sceneNumber = 11;
        this.kitNo = 11;
        this.sharedResourceManager = sharedResourceManager;

        // ---- ヴィトリーヌ（箱）----
        this.boxSize = 2100;                // さらに拡大
        this.half = this.boxSize / 2;
        this.homeBound = this.half * 0.9;   // ノードのホーム配置範囲
        this.posClamp = this.half * 0.97;   // 位置の安全クランプ

        // ---- ノード（ニューロン）----
        this.nodeCount = 500;               // 総数（先頭 hubCount 個がハブ）
        this.hubCount = 32;                 // 中心の大きなノード（神経核）
        this.hubRadius = this.half * 0.5;   // ハブを置く中心領域の半径

        // ---- アンカー（壁の赤い端子、手前+Zを除く5面）----
        this.anchorCount = 90;

        // ---- 繊維（三次ベジェ＋枝分かれ）----
        this.segMain = 9;                   // 幹の分割数
        this.segBranch = 6;                 // 枝の分割数
        this.maxLineSegments = 48000;       // 線分バッファ上限（接続密度UPぶん拡大）
        this.bendBase = 0.24;               // 曲がりの基準量

        // ---- 信号パルス（活動電位）----
        this.pulsePool = 1000;              // パルスの最大同時数

        // ---- 配色 ----
        this.fiberColor = new THREE.Color(0xffffff);   // 繊維＝白
        // パルス色はアルゴリズム的に変化（track8で色相を進める＋常時ゆっくりドリフト）
        this.pulseColor = new THREE.Color(0xbfeaff);   // 毎フレームHSLから再計算
        this.pulseHue = 0.55;               // 現在の色相（0..1）
        this.pulseSat = 0.75;               // 彩度
        this.pulseLight = 0.7;              // 明度
        this.pulseHueDrift = 0.015;         // 常時の色相ドリフト（/秒）

        // ---- エナジー ----
        this.energy = 0.0;

        // ---- 成長（actual_tickに合わせてノードが増殖）----
        this.tickLoopLen = 96 * 384;   // 1ループのtick数（96小節×384）= 36864
        this.minActive = 0;            // 最小表示数（setupで hubCount+seed に確定）
        this.activeCount = 0;          // 現在の表示ノード数（ハブ含む）
        this.activeCountF = 0;         // 上の連続値（lerp用）
        this.targetActive = 0;         // 目標表示数（tickから算出）

        // ---- 生きた揺らぎ ----
        this.bendLFO     = new RandomLFO(0.012, 0.05, 0.10, 0.30);   // 曲線の膨らみ量
        this.bendWaveLFO = new RandomLFO(0.010, 0.04, 0.6, 1.6);     // 膨らみの脈打つ速さ

        // ---- 状態（typed array）----
        this.homeX = null; this.homeY = null; this.homeZ = null;   // ホーム位置
        this.wAmp = null; this.wSpd = null;                        // 微揺れ振幅・速さ
        this.wPhX = null; this.wPhY = null; this.wPhZ = null;      // 微揺れ位相
        this.dispX = null; this.dispY = null; this.dispZ = null;   // 変位（burst/gatherで加わり減衰）
        this.npx = null; this.npy = null; this.npz = null;         // 現在位置（毎フレーム計算）
        this.scaleBase = null;                                     // 個体スケール（ハブは大）
        this.isHub = null;                                         // Uint8: ハブか
        this.nodeFlash = null;                                     // 発火量（0..1, 減衰）
        this.rotX0 = null; this.rotY0 = null; this.rotZ0 = null;   // 初期姿勢（歪み球の向きをばらす）
        this.spinX = null; this.spinY = null; this.spinZ = null;   // ゆっくり自転
        this.apx = null; this.apy = null; this.apz = null;         // アンカー位置
        this.anx = null; this.any = null; this.anz = null;         // アンカーの壁内向き法線（ドームの向き）
        this.anchorScaleArr = null;                                // アンカー個体スケール（デカい）

        // ---- エッジ（構造的配線）----
        this.edges = [];             // {a, b, bAnchor, sign, phase, branches:[...]}
        this.edgeMain = null;        // Float32: 各エッジの現在の幹制御点(P0,C1,C2,P1)=12値
        this.adj = null;             // 各ノードに接続するエッジindexの配列（発火伝播用）

        // ---- パルス（typed array）----
        this.plEdge = null;          // Int32: パルスが乗るエッジ
        this.plT = null;             // Float32: 進行度 0..1
        this.plSpeed = null;         // Float32: 速さ(1/s)
        this.plDir = null;           // Uint8: 0 = a→b, 1 = b→a
        this.plActive = null;        // Uint8: 有効
        this.plNext = 0;             // リングインデックス
        this.pulseAccum = 0;         // 自発発火の蓄積

        // ---- 描画物 ----
        this.boxGroup = null;
        this.nodeMesh = null;   // 普通ノード用 InstancedMesh
        this.hubMesh = null;    // ハブ用 InstancedMesh（別ジオメトリ＝よりゴツい歪み球）
        this.anchorMesh = null;
        this.fiberLines = null;
        this.fiberPositions = null;
        this.fiberColors = null;
        this.pulsePoints = null;
        this.pulsePosAttr = null;
        this.glowTexture = null;
        this.bumpTexture = null;     // 全Sphere共通のバンプ（マット化）
        this._segCount = 0;          // フレーム内の線分書き込みカーソル

        // ---- 被写界深度（DOF）----
        this.useDOF = true;
        this.dofParams = { focus: 2300, aperture: 0.0000062, maxblur: 0.0028 };

        // ---- スクラッチ（GC削減）----
        this._dummy = new THREE.Object3D();
        this._color = new THREE.Color();
        this._up = new THREE.Vector3(0, 1, 0);   // ドームの基準軸
        this._nrm = new THREE.Vector3();

        // 擬似乱数（xorshift）
        this.seed = 0x1a2b3c4d | 0;

        this.time = 0.0;
        this.setScreenshotText(this.title);
    }

    /** 決定論的PRNG（xorshift） */
    _rand() {
        let x = this.seed | 0;
        x ^= x << 13; x ^= x >> 17; x ^= x << 5;
        this.seed = x;
        return ((x >>> 0) % 1000000) / 1000000;
    }

    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 1350.0;
        cameraParticle.maxDistance = 3300.0;
        cameraParticle.maxDistanceReset = 2300.0;
    }

    async setup() {
        await super.setup();

        this.scene.background = new THREE.Color(0x05070c);

        // ライティング（普通に当てる）
        const ambient = new THREE.AmbientLight(0xffffff, 0.55);
        this.scene.add(ambient);
        const key = new THREE.DirectionalLight(0xffffff, 1.1);
        key.position.set(600, 900, 500);
        this.scene.add(key);
        const fill = new THREE.DirectionalLight(0x8aa2c0, 0.4);
        fill.position.set(-700, -300, -400);
        this.scene.add(fill);

        this.glowTexture = this._makeGlowTexture();
        this.bumpTexture = this._makeBumpTexture();   // 全Sphereをマットにするバンプ
        this._initNodes();
        this._initAnchors();
        this._buildTopology();
        this._initPulses();
        this._buildBox();
        this._buildNodeMesh();
        this._buildAnchorMesh();
        this._buildFiberLines();
        this._buildPulsePoints();

        attachDepthOfField(this, this.dofParams);

        // 成長：tick=0（序盤）は少なめ＝ハブ＋わずかな種ニューロンから始める
        this.minActive = this.hubCount + 6;
        this.activeCount = this.minActive;
        this.activeCountF = this.minActive;
        this.targetActive = this.minActive;

        this.setParticleCount(this.nodeCount);
    }

    // ============================================================
    //  初期化
    // ============================================================

    /** ノード（ホーム位置・微揺れ・スケール・ハブ）の初期化 */
    _initNodes() {
        const n = this.nodeCount;
        this.homeX = new Float32Array(n); this.homeY = new Float32Array(n); this.homeZ = new Float32Array(n);
        this.wAmp = new Float32Array(n); this.wSpd = new Float32Array(n);
        this.wPhX = new Float32Array(n); this.wPhY = new Float32Array(n); this.wPhZ = new Float32Array(n);
        this.dispX = new Float32Array(n); this.dispY = new Float32Array(n); this.dispZ = new Float32Array(n);
        this.npx = new Float32Array(n); this.npy = new Float32Array(n); this.npz = new Float32Array(n);
        this.scaleBase = new Float32Array(n);
        this.isHub = new Uint8Array(n);
        this.nodeFlash = new Float32Array(n);
        this.rotX0 = new Float32Array(n); this.rotY0 = new Float32Array(n); this.rotZ0 = new Float32Array(n);
        this.spinX = new Float32Array(n); this.spinY = new Float32Array(n); this.spinZ = new Float32Array(n);

        for (let i = 0; i < n; i++) {
            const hub = i < this.hubCount;
            this.isHub[i] = hub ? 1 : 0;
            const R = hub ? this.hubRadius : this.homeBound;
            // ハブは中心寄り（球内均等）、普通ノードは箱全体に散らす
            const th = this._rand() * Math.PI * 2;
            const ph = Math.acos(2 * this._rand() - 1);
            const r = hub ? (R * (0.2 + 0.8 * this._rand())) : (R * Math.cbrt(this._rand()));
            this.homeX[i] = Math.sin(ph) * Math.cos(th) * r;
            this.homeY[i] = Math.sin(ph) * Math.sin(th) * r;
            this.homeZ[i] = Math.cos(ph) * r;
            // 微揺れ（構造を壊さない小さめ）
            this.wAmp[i] = hub ? (6 + this._rand() * 8) : (10 + this._rand() * 14);
            this.wSpd[i] = 0.2 + this._rand() * 0.5;
            this.wPhX[i] = this._rand() * Math.PI * 2;
            this.wPhY[i] = this._rand() * Math.PI * 2;
            this.wPhZ[i] = this._rand() * Math.PI * 2;
            // スケール（ハブは大きい神経核。箱拡大に合わせ少し大きめ）
            this.scaleBase[i] = hub ? (22 + this._rand() * 14) : (6 + this._rand() * 5);
            // 歪み球の向きをばらす初期姿勢＋ゆっくり自転（生命感）
            this.rotX0[i] = this._rand() * Math.PI * 2;
            this.rotY0[i] = this._rand() * Math.PI * 2;
            this.rotZ0[i] = this._rand() * Math.PI * 2;
            this.spinX[i] = (this._rand() - 0.5) * 0.3;
            this.spinY[i] = (this._rand() - 0.5) * 0.3;
            this.spinZ[i] = (this._rand() - 0.5) * 0.3;
            this.npx[i] = this.homeX[i]; this.npy[i] = this.homeY[i]; this.npz[i] = this.homeZ[i];
        }
    }

    /** アンカー（壁の赤い潰れ半球）初期化 */
    _initAnchors() {
        const m = this.anchorCount;
        this.apx = new Float32Array(m); this.apy = new Float32Array(m); this.apz = new Float32Array(m);
        this.anx = new Float32Array(m); this.any = new Float32Array(m); this.anz = new Float32Array(m);
        this.anchorScaleArr = new Float32Array(m);
        this._seedAnchorPositions();
    }

    /**
     * アンカー座標を（再）抽選：5面（手前+Zを除く）へ均等割り。
     * 位置・壁内向き法線（ドームがめり出す向き）・個体スケール（デカい）を決める。
     */
    _seedAnchorPositions() {
        const m = this.anchorCount;
        const H = this.half;
        const s = H * 0.88;
        for (let i = 0; i < m; i++) {
            const wall = i % 5;   // 0:+X 1:-X 2:+Y 3:-Y 4:-Z（+Z手前は開口）
            const u = (this._rand() * 2 - 1) * s;
            const v = (this._rand() * 2 - 1) * s;
            switch (wall) {
                case 0: this.apx[i] = H;  this.apy[i] = u;  this.apz[i] = v;  this.anx[i] = -1; this.any[i] = 0; this.anz[i] = 0; break;
                case 1: this.apx[i] = -H; this.apy[i] = u;  this.apz[i] = v;  this.anx[i] = 1;  this.any[i] = 0; this.anz[i] = 0; break;
                case 2: this.apx[i] = u;  this.apy[i] = H;  this.apz[i] = v;  this.anx[i] = 0;  this.any[i] = -1; this.anz[i] = 0; break;
                case 3: this.apx[i] = u;  this.apy[i] = -H; this.apz[i] = v;  this.anx[i] = 0;  this.any[i] = 1; this.anz[i] = 0; break;
                default: this.apx[i] = u; this.apy[i] = v;  this.apz[i] = -H; this.anx[i] = 0;  this.any[i] = 0; this.anz[i] = 1; break;
            }
            // アンカーのスケール（個体差あり・小さめ）
            this.anchorScaleArr[i] = 10 + this._rand() * 10;   // 10〜20
        }
    }

    /**
     * 構造的な神経配線を構築（距離だけで結ばない）。
     *  - 普通ノード → 最寄りハブ（1〜2本）＋ 最寄り普通ノード（0〜1本）
     *  - ハブ → 最寄りハブ（2本）
     *  - アンカー → 最寄りノード（1本）
     * ハブに配線が集中して神経核になる（scale-free風）。
     */
    _buildTopology() {
        this.edges = [];
        const seen = new Set();
        const n = this.nodeCount, hc = this.hubCount;
        const hx = this.homeX, hy = this.homeY, hz = this.homeZ;

        const key = (a, b, anchor) => anchor ? ('A' + a + '_' + b)
            : (a < b ? (a + '_' + b) : (b + '_' + a));
        const addEdge = (a, b, bAnchor) => {
            if (!bAnchor && a === b) return;
            const k = key(a, b, bAnchor);
            if (seen.has(k)) return;
            seen.add(k);
            this.edges.push({
                a, b, bAnchor,
                sign: this._rand() < 0.5 ? 1 : -1,
                phase: this._rand() * Math.PI * 2,
                branches: this._makeBranches(),
            });
        };

        // 距離ヘルパ（ホーム位置）
        const dist2Node = (i, j) => {
            const dx = hx[i] - hx[j], dy = hy[i] - hy[j], dz = hz[i] - hz[j];
            return dx * dx + dy * dy + dz * dz;
        };

        // 普通ノード → 最寄りハブ3本 ＋ 最寄り普通ノード2本（密に収束＝神経核らしさ）
        for (let i = hc; i < n; i++) {
            // 最寄りハブを3つ探す
            let b1 = -1, b2 = -1, b3 = -1, d1 = Infinity, d2 = Infinity, d3 = Infinity;
            for (let h = 0; h < hc; h++) {
                const d = dist2Node(i, h);
                if (d < d1) { d3 = d2; b3 = b2; d2 = d1; b2 = b1; d1 = d; b1 = h; }
                else if (d < d2) { d3 = d2; b3 = b2; d2 = d; b2 = h; }
                else if (d < d3) { d3 = d; b3 = h; }
            }
            if (b1 >= 0) addEdge(i, b1, false);
            if (b2 >= 0 && this._rand() < 0.75) addEdge(i, b2, false);
            if (b3 >= 0 && this._rand() < 0.4) addEdge(i, b3, false);

            // 最寄りの普通ノードを2つ（局所メッシュ）
            let n1 = -1, n2 = -1, e1 = Infinity, e2 = Infinity;
            for (let j = hc; j < n; j++) {
                if (j === i) continue;
                const d = dist2Node(i, j);
                if (d < e1) { e2 = e1; n2 = n1; e1 = d; n1 = j; }
                else if (d < e2) { e2 = d; n2 = j; }
            }
            if (n1 >= 0 && this._rand() < 0.75) addEdge(i, n1, false);
            if (n2 >= 0 && this._rand() < 0.4) addEdge(i, n2, false);
        }

        // ハブ → 最寄りハブ2本（神経核どうしを結ぶ幹線）
        for (let h = 0; h < hc; h++) {
            let b1 = -1, b2 = -1, d1 = Infinity, d2 = Infinity;
            for (let g = 0; g < hc; g++) {
                if (g === h) continue;
                const d = dist2Node(h, g);
                if (d < d1) { d2 = d1; b2 = b1; d1 = d; b1 = g; }
                else if (d < d2) { d2 = d; b2 = g; }
            }
            if (b1 >= 0) addEdge(h, b1, false);
            if (b2 >= 0) addEdge(h, b2, false);
        }

        // アンカー → 最寄りノード1本（壁の端子へ配線）
        for (let k = 0; k < this.anchorCount; k++) {
            let nn = -1, dn = Infinity;
            for (let i = 0; i < n; i++) {
                const dx = hx[i] - this.apx[k], dy = hy[i] - this.apy[k], dz = hz[i] - this.apz[k];
                const d = dx * dx + dy * dy + dz * dz;
                if (d < dn) { dn = d; nn = i; }
            }
            if (nn >= 0) addEdge(nn, k, true);
        }

        this.edgeMain = new Float32Array(this.edges.length * 12);

        // 発火伝播用の隣接（ノード→エッジindex）。アンカー端は非ノードなので a 側のみ登録
        this.adj = [];
        for (let i = 0; i < n; i++) this.adj.push([]);
        for (let e = 0; e < this.edges.length; e++) {
            const ed = this.edges[e];
            this.adj[ed.a].push(e);
            if (!ed.bAnchor) this.adj[ed.b].push(e);
        }
    }

    /** 枝分かれ（樹状突起スパー）の記述子を0〜3本ぶん生成 */
    _makeBranches() {
        const r = this._rand();
        let count = 0;
        if (r > 0.35) count = 1;
        if (r > 0.68) count = 2;
        if (r > 0.88) count = 3;
        const out = [];
        for (let i = 0; i < count; i++) {
            out.push({
                tSplit: 0.35 + this._rand() * 0.4,        // 幹のどこから分岐するか
                len: 0.28 + this._rand() * 0.4,           // 枝の長さ（幹長に対する比）
                curlA: this._rand() * 2 - 1,              // 枝の広がり（法線1）
                curlB: this._rand() * 2 - 1,              // 枝の広がり（法線2）
                bow: (this._rand() * 2 - 1) * 0.4,        // 枝自体のたわみ
            });
        }
        return out;
    }

    /** パルス配列の確保 */
    _initPulses() {
        const P = this.pulsePool;
        this.plEdge = new Int32Array(P);
        this.plT = new Float32Array(P);
        this.plSpeed = new Float32Array(P);
        this.plDir = new Uint8Array(P);
        this.plActive = new Uint8Array(P);
        this.plNext = 0;
        this.pulseAccum = 0;
    }

    // ============================================================
    //  描画物の生成
    // ============================================================

    /** ソフトなグロー円（パルス用） */
    _makeGlowTexture() {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        g.addColorStop(0.0, 'rgba(255,255,255,1.0)');
        g.addColorStop(0.3, 'rgba(255,255,255,0.7)');
        g.addColorStop(0.7, 'rgba(255,255,255,0.12)');
        g.addColorStop(1.0, 'rgba(255,255,255,0.0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }

    /**
     * 微細ノイズのバンプテクスチャ。全Sphereに貼って表面をザラつかせ、
     * 光を散らして「マット」に見せる。決定論LCGで生成（this.seedは触らない）。
     */
    _makeBumpTexture() {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(size, size);
        let s = 987654321 >>> 0;
        const rnd = () => { s = (1103515245 * s + 12345) >>> 0; return s / 4294967296; };
        for (let i = 0; i < size * size; i++) {
            const v = 140 + Math.floor(rnd() * 115);   // 140..255 のグレー（凹凸）
            img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(3, 3);
        tex.needsUpdate = true;
        return tex;
    }

    /** 箱：フレーム（12辺）＋壁グリッド（5面）＋目盛り */
    _buildBox() {
        this.boxGroup = new THREE.Group();

        // フレーム（12辺）
        const boxGeo = new THREE.BoxGeometry(this.boxSize, this.boxSize, this.boxSize);
        const edges = new THREE.EdgesGeometry(boxGeo);
        const frame = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.4,
        }));
        boxGeo.dispose();
        this.boxGroup.add(frame);

        // 壁グリッド（5面、手前+Zは開口）
        const gridPos = this._buildWallGridPositions(8);
        const gridGeo = new THREE.BufferGeometry();
        gridGeo.setAttribute('position', new THREE.BufferAttribute(gridPos, 3));
        const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({
            color: 0x25415a, transparent: true, opacity: 0.3,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        this.boxGroup.add(grid);

        // 目盛り（12辺に内向きの刻み）
        const tickPos = this._buildTickPositions(12);
        const tickGeo = new THREE.BufferGeometry();
        tickGeo.setAttribute('position', new THREE.BufferAttribute(tickPos, 3));
        const ticks = new THREE.LineSegments(tickGeo, new THREE.LineBasicMaterial({
            color: 0xbfd4e6, transparent: true, opacity: 0.5,
        }));
        this.boxGroup.add(ticks);

        this.scene.add(this.boxGroup);
    }

    /** 5面ぶんの内壁グリッド線分（手前=+Z面は含めない） */
    _buildWallGridPositions(div) {
        const H = this.half;
        const lines = [];
        const addWall = (fixedAxis, fixedVal) => {
            for (let k = 0; k <= div; k++) {
                const t = -H + (2 * H) * (k / div);
                for (let pass = 0; pass < 2; pass++) {
                    const p1 = [0, 0, 0], p2 = [0, 0, 0];
                    p1[fixedAxis] = fixedVal; p2[fixedAxis] = fixedVal;
                    const va = (fixedAxis + 1) % 3;
                    const vb = (fixedAxis + 2) % 3;
                    if (pass === 0) { p1[va] = t; p1[vb] = -H; p2[va] = t; p2[vb] = H; }
                    else { p1[va] = -H; p1[vb] = t; p2[va] = H; p2[vb] = t; }
                    lines.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
                }
            }
        };
        addWall(0, H); addWall(0, -H);
        addWall(1, H); addWall(1, -H);
        addWall(2, -H);
        return new Float32Array(lines);
    }

    /**
     * 目盛り：12辺それぞれに沿って内向きの刻みを立てる。
     * majorは3本ごとに長く。計測器っぽい趣を出す。
     */
    _buildTickPositions(div) {
        const H = this.half;
        const minorLen = 16, majorLen = 34;
        const lines = [];
        // 12辺 = varyAxis(3) × 固定2軸の符号(±,±)
        for (let varyAxis = 0; varyAxis < 3; varyAxis++) {
            const fa = (varyAxis + 1) % 3;  // 固定軸A
            const fb = (varyAxis + 2) % 3;  // 固定軸B
            for (let sa = -1; sa <= 1; sa += 2) {
                for (let sb = -1; sb <= 1; sb += 2) {
                    for (let k = 1; k < div; k++) {
                        const t = -H + (2 * H) * (k / div);
                        const p = [0, 0, 0];
                        p[varyAxis] = t; p[fa] = sa * H; p[fb] = sb * H;
                        // 内向き（固定2軸を中心へ）＝ -sa, -sb を正規化
                        const inv = 1 / Math.SQRT2;
                        const len = (k % 3 === 0) ? majorLen : minorLen;
                        const q = [p[0], p[1], p[2]];
                        q[fa] += -sa * inv * len;
                        q[fb] += -sb * inv * len;
                        lines.push(p[0], p[1], p[2], q[0], q[1], q[2]);
                    }
                }
            }
        }
        return new Float32Array(lines);
    }

    /**
     * 歪んだニューロン体（soma）ジオメトリを生成。
     * 単位イコサ球の各頂点を、向きベースの低周波ノイズで凸凹させ、
     * 一部にスパイク（樹状突起の根っこ）を生やす。座標ベースの決定論なので
     * 共有頂点は同じ変位＝メッシュが裂けない。
     * @param {number} detail イコサ球の分割数
     * @param {number} amp 変形の強さ
     * @param {number} spikeAmt スパイク（突起）の強さ
     * @param {number} seed 形のバリエーション
     */
    _makeNeuronGeometry(detail, amp, spikeAmt, seed) {
        const geo = new THREE.IcosahedronGeometry(1, detail);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            // 低周波の有機的うねり（3ローブ）
            let d = Math.sin(x * 3.1 + seed) * Math.cos(y * 2.7 - seed) * 0.5
                  + Math.sin(y * 4.3 + seed * 1.7) * Math.cos(z * 3.9 + seed) * 0.3
                  + Math.sin(z * 5.1 - seed) * Math.cos(x * 4.5 + seed * 2.1) * 0.2;
            // ハッシュで「たまーーーに」だけ、ごく弱く尖る（上位5%の頂点のみ）
            const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 13.1) * 43758.5453;
            const f = h - Math.floor(h);
            const spike = f > 0.95 ? (f - 0.95) * 6.0 * spikeAmt : 0;
            const r = 1 + amp * d + spike;
            pos.setXYZ(i, x * r, y * r, z * r);
        }
        geo.computeVertexNormals();
        return geo;
    }

    /** ノード球（ハブ／普通で別ジオメトリの InstancedMesh・ライティングで陰影） */
    _buildNodeMesh() {
        const mat = new THREE.MeshStandardMaterial({
            color: 0xffffff, roughness: 0.9, metalness: 0.0,
            emissive: 0x223040, emissiveIntensity: 0.25,
            bumpMap: this.bumpTexture, bumpScale: 0.5,   // 微細凸凹でマット
        });
        // 普通ノード：丸みを保った軽い歪み（尖りはたまーーーに）
        const nodeGeo = this._makeNeuronGeometry(2, 0.18, 0.35, 1.3);
        this.nodeMesh = new THREE.InstancedMesh(nodeGeo, mat, this.nodeCount - this.hubCount);
        this.nodeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.nodeMesh.frustumCulled = false;
        this.scene.add(this.nodeMesh);
        // ハブ：丸みは保ちつつ少しゴツい神経核（尖りは控えめ・高ディテール）
        const hubGeo = this._makeNeuronGeometry(3, 0.24, 0.5, 7.7);
        this.hubMesh = new THREE.InstancedMesh(hubGeo, mat, this.hubCount);
        this.hubMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.hubMesh.frustumCulled = false;
        this.scene.add(this.hubMesh);

        this._writeNodeInstances();
    }

    /**
     * 潰れた歪み半球（ドーム）ジオメトリ。上半球を作り、高さ方向を潰し、
     * XZを低周波ノイズで歪ませる。基準軸は +Y（ドームの頂点方向）、底面は y=0 平面
     * （壁に密着する側）。
     */
    _makeAnchorGeometry() {
        // 上半球（thetaLength=π/2）。底リングは y=0
        const geo = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            // XZ方向を有機的に歪ませる（潰れた楕円ドーム）
            const bump = 0.18 * (Math.sin(x * 3.3) * Math.cos(z * 2.9)
                + 0.5 * Math.sin(z * 4.7 + 1.3) * Math.cos(x * 3.8));
            const r = 1 + bump;
            // 高さ(y)を潰す。底面(y=0)は動かさず密着を保つ
            const ny = y * (0.4 + bump * 0.15);
            pos.setXYZ(i, x * r, ny, z * r);
        }
        geo.computeVertexNormals();
        return geo;
    }

    /** アンカー（赤い潰れ半球・壁向き・デカい InstancedMesh） */
    _buildAnchorMesh() {
        const geo = this._makeAnchorGeometry();
        const mat = new THREE.MeshStandardMaterial({
            color: 0xff2b2b, roughness: 0.9, metalness: 0.0,
            emissive: 0x400505, emissiveIntensity: 0.45,
            bumpMap: this.bumpTexture, bumpScale: 0.5,   // マット化
        });
        this.anchorMesh = new THREE.InstancedMesh(geo, mat, this.anchorCount);
        this.anchorMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.anchorMesh.frustumCulled = false;
        this._writeAnchorInstances();
        this.scene.add(this.anchorMesh);
    }

    /** 繊維（白の LineSegments） */
    _buildFiberLines() {
        const verts = this.maxLineSegments * 2;
        this.fiberPositions = new Float32Array(verts * 3);
        this.fiberColors = new Float32Array(verts * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(this.fiberPositions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(this.fiberColors, 3));
        geo.setDrawRange(0, 0);
        const mat = new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.6,
            blending: THREE.NormalBlending, depthWrite: false,   // ブルーム無し（加算にしない）
        });
        this.fiberLines = new THREE.LineSegments(geo, mat);
        this.fiberLines.frustumCulled = false;
        this.scene.add(this.fiberLines);
    }

    /** 信号パルス（加算Points・走る光点） */
    _buildPulsePoints() {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(this.pulsePool * 3);
        this.pulsePosAttr = new THREE.BufferAttribute(positions, 3);
        geo.setAttribute('position', this.pulsePosAttr);
        geo.setDrawRange(0, 0);
        this.pulseColor.setHSL(this.pulseHue, this.pulseSat, this.pulseLight);
        const mat = new THREE.PointsMaterial({
            size: 13, map: this.glowTexture, color: this.pulseColor,
            transparent: true, opacity: 0.95, depthWrite: false,
            blending: THREE.AdditiveBlending, sizeAttenuation: true,
        });
        this.pulsePoints = new THREE.Points(geo, mat);
        this.pulsePoints.frustumCulled = false;
        this.scene.add(this.pulsePoints);
    }

    // ============================================================
    //  更新ループ
    // ============================================================

    onUpdate(deltaTime) {
        if (!this.homeX || !this.fiberLines) return;   // setup完了前ガード
        const dt = Math.min(deltaTime || 0.016, 0.05);
        this.time += dt;

        this.energy *= Math.exp(-1.7 * dt);
        const eBoost = Math.min(1, this.energy);

        // フラッシュ減衰
        for (let i = 0; i < this.nodeCount; i++) this.nodeFlash[i] *= Math.exp(-4.0 * dt);

        // 成長：actual_tick進行に合わせて表示ノード数を増やす（ループ頭で戻る）
        this._updateGrowth(dt);

        this._updateNodePositions(dt);
        this._writeNodeInstances();

        // 繊維を張り直し（幹＋枝）→ edgeMain も更新（パルスが乗る）
        this.bendLFO.update(dt);
        this.bendWaveLFO.update(dt);
        this._rebuildFibers(eBoost);

        // パルス（自発発火＋伝播）
        this._updatePulses(dt, eBoost);

        // パルス色相を進める（常時ゆっくりドリフト。track8のヒットでも進む）
        this.pulseHue = (this.pulseHue + this.pulseHueDrift * dt) % 1;
        if (this.pulsePoints) {
            this.pulseColor.setHSL(this.pulseHue, this.pulseSat, this.pulseLight);
            this.pulsePoints.material.color.copy(this.pulseColor);
        }

        // エナジーで発光/サイズを持ち上げ（パルスは小さめ）
        if (this.nodeMesh) this.nodeMesh.material.emissiveIntensity = 0.22 + eBoost * 0.5;
        if (this.fiberLines) this.fiberLines.material.opacity = 0.5 + eBoost * 0.4;
        if (this.pulsePoints) this.pulsePoints.material.size = 11 + eBoost * 6;

        // DOF：カメラは常に原点を見ている → フォーカス距離＝カメラ〜原点。
        // カメラランダムで視点がワープするので、追従は速めに（前後関係を即合わせる）。
        if (this.useDOF && this.bokehPass && this.camera) {
            const d = this.camera.position.length();
            const u = this.bokehPass.uniforms;
            u.focus.value += (d - u.focus.value) * Math.min(1, 12.0 * dt);
        }
    }

    /**
     * 成長：/actual_tick の進行度（0..1）に比例して表示ノード数を増やす。
     * tick=0（序盤）は最小、ループ末で最大。ループ頭でtickが戻ると縮小し、再び育つ。
     * tick未受信でも actualTick=0 扱い＝最小のまま（序盤は少なめ、の要望どおり）。
     */
    _updateGrowth(dt) {
        const tick = this.actualTick || 0;
        const prog = (tick % this.tickLoopLen) / this.tickLoopLen;  // 0..1
        this.targetActive = this.minActive + prog * (this.nodeCount - this.minActive);
        // 連続値をなめらかに追従（増えるのは緩やか、ループ頭の縮小も同レートで）
        this.activeCountF += (this.targetActive - this.activeCountF) * Math.min(1, 3.0 * dt);
        let c = Math.round(this.activeCountF);
        if (c < this.minActive) c = this.minActive;
        if (c > this.nodeCount) c = this.nodeCount;
        this.activeCount = c;
    }

    /** そのエッジが現在アクティブか（両端ノードが表示中か。アンカー端は常に有効） */
    _edgeActive(ed) {
        if (ed.a >= this.activeCount) return false;
        if (!ed.bAnchor && ed.b >= this.activeCount) return false;
        return true;
    }

    /** ノード位置：ホーム + 微揺れ + 変位（burst/gatherの変位は減衰） */
    _updateNodePositions(dt) {
        const n = this.nodeCount;
        const t = this.time;
        const decay = Math.exp(-2.2 * dt);
        const C = this.posClamp;
        for (let i = 0; i < n; i++) {
            this.dispX[i] *= decay; this.dispY[i] *= decay; this.dispZ[i] *= decay;
            const a = this.wAmp[i], s = this.wSpd[i];
            let x = this.homeX[i] + Math.sin(t * s + this.wPhX[i]) * a + this.dispX[i];
            let y = this.homeY[i] + Math.sin(t * s * 1.13 + this.wPhY[i]) * a + this.dispY[i];
            let z = this.homeZ[i] + Math.sin(t * s * 0.87 + this.wPhZ[i]) * a + this.dispZ[i];
            if (x > C) x = C; else if (x < -C) x = -C;
            if (y > C) y = C; else if (y < -C) y = -C;
            if (z > C) z = C; else if (z < -C) z = -C;
            this.npx[i] = x; this.npy[i] = y; this.npz[i] = z;
        }
    }

    /**
     * ノードInstancedMeshへ位置・姿勢（初期姿勢＋ゆっくり自転）・スケール
     * （発火で少し膨らむ）を書く。ハブは hubMesh、普通ノードは nodeMesh へ振り分け。
     */
    _writeNodeInstances() {
        const n = this.nodeCount, hc = this.hubCount;
        const d = this._dummy;
        const t = this.time;
        for (let i = 0; i < n; i++) {
            d.position.set(this.npx[i], this.npy[i], this.npz[i]);
            d.rotation.set(
                this.rotX0[i] + this.spinX[i] * t,
                this.rotY0[i] + this.spinY[i] * t,
                this.rotZ0[i] + this.spinZ[i] * t
            );
            const sc = this.scaleBase[i] * (1.0 + this.nodeFlash[i] * 0.6);
            d.scale.set(sc, sc, sc);
            d.updateMatrix();
            if (i < hc) this.hubMesh.setMatrixAt(i, d.matrix);
            else this.nodeMesh.setMatrixAt(i - hc, d.matrix);
        }
        // 表示数（成長）を反映：ハブは常に全表示、普通ノードは activeCount まで
        this.hubMesh.count = hc;
        this.nodeMesh.count = Math.max(0, this.activeCount - hc);
        this.nodeMesh.instanceMatrix.needsUpdate = true;
        this.hubMesh.instanceMatrix.needsUpdate = true;
    }

    /** アンカーInstancedMeshへ位置・向き（+Yを壁内向き法線へ）・スケールを書く */
    _writeAnchorInstances() {
        const m = this.anchorCount;
        const d = this._dummy;
        for (let i = 0; i < m; i++) {
            d.position.set(this.apx[i], this.apy[i], this.apz[i]);
            // ドームの +Y をこのアンカーの壁内向き法線へ回す
            this._nrm.set(this.anx[i], this.any[i], this.anz[i]);
            d.quaternion.setFromUnitVectors(this._up, this._nrm);
            const sc = this.anchorScaleArr[i];
            d.scale.set(sc, sc, sc);
            d.updateMatrix();
            this.anchorMesh.setMatrixAt(i, d.matrix);
        }
        this.anchorMesh.instanceMatrix.needsUpdate = true;
    }

    /** 繊維（幹＋枝）を全エッジぶん張り直す。幹制御点は edgeMain に保存 */
    _rebuildFibers(eBoost) {
        this._segCount = 0;
        const edges = this.edges;
        const em = this.edgeMain;
        const bendAmt = this.bendLFO.getValue();
        const bendWave = this.bendWaveLFO.getValue();
        const bright = 0.8 + eBoost * 0.2;   // 加算やめたぶん白を明るめに

        for (let e = 0; e < edges.length; e++) {
            const ed = edges[e];
            if (!this._edgeActive(ed)) continue;   // 未成長のノードに繋がる繊維は描かない
            const ax = this.npx[ed.a], ay = this.npy[ed.a], az = this.npz[ed.a];
            let bx, by, bz;
            if (ed.bAnchor) { bx = this.apx[ed.b]; by = this.apy[ed.b]; bz = this.apz[ed.b]; }
            else { bx = this.npx[ed.b]; by = this.npy[ed.b]; bz = this.npz[ed.b]; }

            // 幹の制御点を計算し、edgeMain に保存（パルスが後で参照）
            this._computeMainControls(ax, ay, az, bx, by, bz, ed, bendAmt, bendWave, e);
            const o = e * 12;
            // 幹を線分化
            this._writeBezier(
                em[o], em[o + 1], em[o + 2],
                em[o + 3], em[o + 4], em[o + 5],
                em[o + 6], em[o + 7], em[o + 8],
                em[o + 9], em[o + 10], em[o + 11],
                this.segMain, bright
            );

            // 枝分かれ（幹上のtSplitから伸びるスパー）
            for (let bi = 0; bi < ed.branches.length; bi++) {
                this._writeBranch(e, ed.branches[bi], bright * 0.85);
            }
        }

        this.fiberLines.geometry.setDrawRange(0, this._segCount * 2);
        this.fiberLines.geometry.attributes.position.needsUpdate = true;
        this.fiberLines.geometry.attributes.color.needsUpdate = true;
    }

    /**
     * 幹の三次ベジェ制御点を計算し edgeMain[e*12..] へ格納。
     * P0=始点, C1=1/3地点+法線オフセット(S字), C2=2/3地点-法線, P1=終点。
     */
    _computeMainControls(x1, y1, z1, x2, y2, z2, ed, bendAmt, bendWave, e) {
        const ddx = x2 - x1, ddy = y2 - y1, ddz = z2 - z1;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 0.0001;
        const inv = 1 / dist;
        const dx = ddx * inv, dy = ddy * inv, dz = ddz * inv;
        // 法線基底
        let rx = 0, ry = 1, rz = 0;
        if (Math.abs(dy) > 0.9) { rx = 1; ry = 0; rz = 0; }
        let p1x = dy * rz - dz * ry, p1y = dz * rx - dx * rz, p1z = dx * ry - dy * rx;
        const p1l = Math.sqrt(p1x * p1x + p1y * p1y + p1z * p1z) || 1;
        p1x /= p1l; p1y /= p1l; p1z /= p1l;
        const p2x = dy * p1z - dz * p1y, p2y = dz * p1x - dx * p1z, p2z = dx * p1y - dy * p1x;

        const wave = 0.55 + 0.45 * Math.sin(this.time * bendWave + ed.phase);
        const bend = dist * (this.bendBase + bendAmt) * 0.5 * wave * ed.sign;
        const b3d = bend * 0.4;
        const t13 = dist / 3, t23 = (2 * dist) / 3;

        const c1x = x1 + dx * t13 + p1x * bend + p2x * b3d;
        const c1y = y1 + dy * t13 + p1y * bend + p2y * b3d;
        const c1z = z1 + dz * t13 + p1z * bend + p2z * b3d;
        const c2x = x1 + dx * t23 - p1x * (bend * 0.72) + p2x * b3d;
        const c2y = y1 + dy * t23 - p1y * (bend * 0.72) + p2y * b3d;
        const c2z = z1 + dz * t23 - p1z * (bend * 0.72) + p2z * b3d;

        const o = e * 12;
        const em = this.edgeMain;
        em[o] = x1; em[o + 1] = y1; em[o + 2] = z1;
        em[o + 3] = c1x; em[o + 4] = c1y; em[o + 5] = c1z;
        em[o + 6] = c2x; em[o + 7] = c2y; em[o + 8] = c2z;
        em[o + 9] = x2; em[o + 10] = y2; em[o + 11] = z2;
    }

    /** 幹上の分岐点から伸びる枝（スパー）を線分化 */
    _writeBranch(e, br, bright) {
        const o = e * 12;
        const em = this.edgeMain;
        // 幹の始点・終点から距離と法線基底を再構成
        const x1 = em[o], y1 = em[o + 1], z1 = em[o + 2];
        const x2 = em[o + 9], y2 = em[o + 10], z2 = em[o + 11];
        const ddx = x2 - x1, ddy = y2 - y1, ddz = z2 - z1;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 0.0001;
        const inv = 1 / dist;
        const dx = ddx * inv, dy = ddy * inv, dz = ddz * inv;
        let rx = 0, ry = 1, rz = 0;
        if (Math.abs(dy) > 0.9) { rx = 1; ry = 0; rz = 0; }
        let p1x = dy * rz - dz * ry, p1y = dz * rx - dx * rz, p1z = dx * ry - dy * rx;
        const p1l = Math.sqrt(p1x * p1x + p1y * p1y + p1z * p1z) || 1;
        p1x /= p1l; p1y /= p1l; p1z /= p1l;
        const p2x = dy * p1z - dz * p1y, p2y = dz * p1x - dx * p1z, p2z = dx * p1y - dy * p1x;

        // 分岐開始点 = 幹をtSplitでサンプル
        const s = this._sampleMain(e, br.tSplit);
        const sx = s[0], sy = s[1], sz = s[2];
        // 枝の終点 = 分岐点から前方＋法線方向へ広がる
        const L = dist * br.len;
        const ex = sx + dx * L * 0.5 + p1x * L * br.curlA + p2x * L * br.curlB;
        const ey = sy + dy * L * 0.5 + p1y * L * br.curlA + p2y * L * br.curlB;
        const ez = sz + dz * L * 0.5 + p1z * L * br.curlA + p2z * L * br.curlB;
        // 枝自体のたわみ（制御点）
        const mx = (sx + ex) * 0.5 + p1x * L * br.bow;
        const my = (sy + ey) * 0.5 + p1y * L * br.bow;
        const mz = (sz + ez) * 0.5 + p1z * L * br.bow;
        // 二次ベジェを三次表現（C1=C2=中点系）で線分化
        this._writeBezier(sx, sy, sz, mx, my, mz, mx, my, mz, ex, ey, ez, this.segBranch, bright);
    }

    /** 幹の三次ベジェを t でサンプル（枝分岐点／パルス位置用）。out=[x,y,z] */
    _sampleMain(e, t) {
        const o = e * 12;
        const em = this.edgeMain;
        return this._sampleBezier(
            em[o], em[o + 1], em[o + 2], em[o + 3], em[o + 4], em[o + 5],
            em[o + 6], em[o + 7], em[o + 8], em[o + 9], em[o + 10], em[o + 11], t
        );
    }

    _sampleBezier(x0, y0, z0, c1x, c1y, c1z, c2x, c2y, c2z, x1, y1, z1, t) {
        const it = 1 - t;
        const w0 = it * it * it, w1 = 3 * it * it * t, w2 = 3 * it * t * t, w3 = t * t * t;
        return [
            w0 * x0 + w1 * c1x + w2 * c2x + w3 * x1,
            w0 * y0 + w1 * c1y + w2 * c2y + w3 * y1,
            w0 * z0 + w1 * c1z + w2 * c2z + w3 * z1,
        ];
    }

    /** 三次ベジェを seg 本の線分としてバッファへ書き込む（白） */
    _writeBezier(x0, y0, z0, c1x, c1y, c1z, c2x, c2y, c2z, x1, y1, z1, seg, bright) {
        const pos = this.fiberPositions, col = this.fiberColors;
        const cr = this.fiberColor.r * bright, cg = this.fiberColor.g * bright, cb = this.fiberColor.b * bright;
        let prevX = x0, prevY = y0, prevZ = z0;
        for (let s = 1; s <= seg; s++) {
            if (this._segCount >= this.maxLineSegments) return;
            const t = s / seg, it = 1 - t;
            const w0 = it * it * it, w1 = 3 * it * it * t, w2 = 3 * it * t * t, w3 = t * t * t;
            const cx = w0 * x0 + w1 * c1x + w2 * c2x + w3 * x1;
            const cy = w0 * y0 + w1 * c1y + w2 * c2y + w3 * y1;
            const cz = w0 * z0 + w1 * c1z + w2 * c2z + w3 * z1;
            const idx = this._segCount * 6;
            pos[idx] = prevX; pos[idx + 1] = prevY; pos[idx + 2] = prevZ;
            pos[idx + 3] = cx; pos[idx + 4] = cy; pos[idx + 5] = cz;
            col[idx] = cr; col[idx + 1] = cg; col[idx + 2] = cb;
            col[idx + 3] = cr; col[idx + 4] = cg; col[idx + 5] = cb;
            this._segCount++;
            prevX = cx; prevY = cy; prevZ = cz;
        }
    }

    // ============================================================
    //  信号パルス（活動電位）
    // ============================================================

    /** パルスを1つ発生（リングで古いものを上書き） */
    _spawnPulse(edgeIndex, dir, speed) {
        if (edgeIndex < 0 || edgeIndex >= this.edges.length) return;
        const p = this.plNext;
        this.plEdge[p] = edgeIndex;
        this.plT[p] = 0;
        this.plSpeed[p] = speed;
        this.plDir[p] = dir;
        this.plActive[p] = 1;
        this.plNext = (this.plNext + 1) % this.pulsePool;
    }

    /** ノード発火 → つながる全エッジへパルスを放つ（そのノード側から出発） */
    _firePulsesFromNode(i, v) {
        const list = this.adj[i];
        if (!list) return;
        for (let e = 0; e < list.length; e++) {
            const ei = list[e];
            const ed = this.edges[ei];
            if (!this._edgeActive(ed)) continue;   // 未成長のエッジには流さない
            const dir = (ed.a === i) ? 0 : 1;   // 自分側から相手側へ
            this._spawnPulse(ei, dir, 0.7 + v * 0.9 + this._rand() * 0.4);
        }
    }

    /** パルスの前進・自発発火・描画反映 */
    _updatePulses(dt, eBoost) {
        // 自発発火（低頻度、エナジーで増える）
        this.pulseAccum += dt * (2.5 + eBoost * 22);
        while (this.pulseAccum >= 1) {
            this.pulseAccum -= 1;
            const e = Math.floor(this._rand() * this.edges.length) % this.edges.length;
            if (!this._edgeActive(this.edges[e])) continue;   // 未成長のエッジには湧かせない
            this._spawnPulse(e, this._rand() < 0.5 ? 0 : 1, 0.6 + this._rand() * 0.7);
        }

        // 前進＆位置サンプル
        const pos = this.pulsePosAttr.array;
        let draw = 0;
        for (let p = 0; p < this.pulsePool; p++) {
            if (!this.plActive[p]) continue;
            this.plT[p] += this.plSpeed[p] * dt;
            if (this.plT[p] >= 1) { this.plActive[p] = 0; continue; }
            const e = this.plEdge[p];
            if (!this._edgeActive(this.edges[e])) { this.plActive[p] = 0; continue; }   // 縮小で消えたエッジのパルスは消す
            const t = this.plDir[p] ? (1 - this.plT[p]) : this.plT[p];
            const s = this._sampleMain(e, t);
            pos[draw * 3] = s[0]; pos[draw * 3 + 1] = s[1]; pos[draw * 3 + 2] = s[2];
            draw++;
        }
        this.pulsePosAttr.needsUpdate = true;
        this.pulsePoints.geometry.setDrawRange(0, draw);
    }

    // ============================================================
    //  OSC
    // ============================================================

    handleOSC(message) {
        const trackNumber = message?.trackNumber;
        const args = message?.args || [];
        const velocity = args.length > 1 ? Number(args[1]) : 100;
        const v = Math.max(0, Math.min(127, velocity)) / 127;

        if (trackNumber >= 1 && trackNumber <= 12) {
            this.energy = Math.min(2.0, this.energy + 0.25 + v * 0.5);
            this._fireRandomNodes(3 + Math.floor(v * 5), v);
        }

        if (trackNumber === 5) { this._burst(v); return; }
        if (trackNumber === 6) { this._gather(v); return; }
        if (trackNumber === 7) { this._rewire(); return; }
        // track8: パルス色相をアルゴリズム的に進める（叩くたびスペクトルを歩く）
        if (trackNumber === 8) { this.pulseHue = (this.pulseHue + 0.12 + v * 0.25) % 1; return; }

        super.handleOSC(message);
    }

    /** ランダムな数ノードを発火（膨らみ＋つながる繊維へパルス放出。表示中ノードのみ） */
    _fireRandomNodes(count, v) {
        if (!this.nodeFlash) return;
        const n = Math.max(1, this.activeCount);
        for (let c = 0; c < count; c++) {
            const i = Math.floor(this._rand() * n) % n;
            this.nodeFlash[i] = 1.0;
            this._firePulsesFromNode(i, v);
        }
    }

    /** バースト：ホームから外向きに変位を与える（減衰して戻る） */
    _burst(v) {
        if (!this.homeX) return;
        const n = this.nodeCount;
        const impulse = 55 + v * 120;   // 箱に対して力を弱める
        for (let i = 0; i < n; i++) {
            const d = Math.sqrt(this.homeX[i] ** 2 + this.homeY[i] ** 2 + this.homeZ[i] ** 2) || 1;
            this.dispX[i] += (this.homeX[i] / d) * impulse + (this._rand() - 0.5) * impulse * 0.5;
            this.dispY[i] += (this.homeY[i] / d) * impulse + (this._rand() - 0.5) * impulse * 0.5;
            this.dispZ[i] += (this.homeZ[i] / d) * impulse + (this._rand() - 0.5) * impulse * 0.5;
        }
        this.energy = Math.min(2.0, this.energy + 0.5);
    }

    /** 集約：中心へ向けて変位（網が密に絡む） */
    _gather(v) {
        if (!this.homeX) return;
        const n = this.nodeCount;
        const pull = 50 + v * 100;   // 箱に対して力を弱める
        for (let i = 0; i < n; i++) {
            const d = Math.sqrt(this.homeX[i] ** 2 + this.homeY[i] ** 2 + this.homeZ[i] ** 2) || 1;
            this.dispX[i] -= (this.homeX[i] / d) * pull;
            this.dispY[i] -= (this.homeY[i] / d) * pull;
            this.dispZ[i] -= (this.homeZ[i] / d) * pull;
        }
        this.energy = Math.min(2.0, this.energy + 0.4);
    }

    /** 配線の組み替え：アンカー再配置＋トポロジー再構築 */
    _rewire() {
        if (!this.homeX) return;
        this._seedAnchorPositions();
        this._writeAnchorInstances();
        this._buildTopology();
        // edgeMain のサイズが変わるので、パルスは一旦クリア（無効な参照を避ける）
        this.plActive.fill(0);
        this.energy = Math.min(2.0, this.energy + 0.3);
    }

    dispose() {
        const disposeObj = (obj) => {
            if (!obj) return;
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
            if (this.scene) this.scene.remove(obj);
        };
        if (this.boxGroup) {
            this.boxGroup.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) o.material.dispose();
            });
            if (this.scene) this.scene.remove(this.boxGroup);
        }
        disposeObj(this.nodeMesh);
        disposeObj(this.hubMesh);
        disposeObj(this.anchorMesh);
        disposeObj(this.fiberLines);
        disposeObj(this.pulsePoints);
        if (this.glowTexture) this.glowTexture.dispose();
        if (this.bumpTexture) this.bumpTexture.dispose();

        this.boxGroup = null;
        this.nodeMesh = this.hubMesh = this.anchorMesh = this.fiberLines = this.pulsePoints = null;
        this.glowTexture = null;
        this.bumpTexture = null;
        this.fiberPositions = this.fiberColors = null;
        this.pulsePosAttr = null;
        this.edgeMain = null; this.edges = []; this.adj = null;
        this.homeX = this.homeY = this.homeZ = null;
        this.wAmp = this.wSpd = this.wPhX = this.wPhY = this.wPhZ = null;
        this.dispX = this.dispY = this.dispZ = null;
        this.npx = this.npy = this.npz = null;
        this.scaleBase = this.isHub = this.nodeFlash = null;
        this.rotX0 = this.rotY0 = this.rotZ0 = null;
        this.spinX = this.spinY = this.spinZ = null;
        this.apx = this.apy = this.apz = null;
        this.anx = this.any = this.anz = null;
        this.anchorScaleArr = null;
        this.plEdge = this.plT = this.plSpeed = this.plDir = this.plActive = null;
        // bendLFO 群はコンストラクタ生成の純JSオブジェクトなので破棄しない

        super.dispose();
    }
}
