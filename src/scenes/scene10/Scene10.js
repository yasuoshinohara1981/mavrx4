/**
 * Scene10: emergence — 複雑系エコシステム（多種族 × 非対称相互作用 × 同期振動）
 *
 * 3つの複雑系メカニズムを重ねた創発システム:
 *
 *  1) 非対称相互作用行列（Particle Life方式）
 *     5種族の粒子。種族間の引力/斥力は行列 K[a][b] で決まり、K[a][b] ≠ K[b][a]
 *     （Aを追うBから逃げるA…）。非相互な力はエネルギー極小に落ちないため、
 *     追跡・捕食・細胞のような構造が「永遠に終わらないダンス」として創発する。
 *
 *  2) Kuramoto振動子（同期の相転移）
 *     全個体が内部位相を持ち、近傍と位相結合する。結合が弱いと明滅の波が
 *     群れを走り、強いと全体が一斉発光（ホタルの集団同期）。結合強度は
 *     音のエナジーで上がる＝曲が盛り上がるほど群れ全体が同期して脈動する。
 *
 *  3) エッジ・オブ・カオス（自己組織化的な温度制御）
 *     整列度（秩序パラメータ）を毎フレーム測定し、秩序化しすぎたらノイズ温度を
 *     上げ、無秩序すぎたら下げる負のフィードバック。系は常に「相転移の縁」を
 *     漂い、秩序⇄カオスを行き来し続ける。
 *
 * 描画は 岩型InstancedMesh 数体（形状バリアント別）+ 頂点色付き LineSegments 1体。
 * 物理は typed array + ペアループ（GLSLシェーダーは使わない）。
 *
 * 岩の運動には流れ場を3層重ねる（放射方向の往復に潰れないように）:
 *  - スワール: LFOで漂う回転軸の周りを周回（強さ・回転方向もLFOで反転）
 *  - 対流ロール: 軸からの距離で上昇/下降が入れ替わる対流セル
 *  - ノイズフロー: 場所ごとに流れの向きが違う偏流（空間的な偏り）
 *
 * OSC連動:
 *  - 全track: エナジー注入 + track対応種族の位相キック（発光の雪崩がその種族から始まる）
 *  - /phase: 流れ場の回転軸が45°ずつ回り、偶奇で回転方向の癖が変わる（セクションで運動が変わる）
 *  - track5: 捕食者（赤いワイヤー多面体）が突撃 → 生態系が裂ける
 *  - track6: 相互作用行列を突然変異（velocityで変異量）→ 生態系のルール自体が組み変わる
 *  - track7: 爆散（velocityで強さ）→ 全個体が外向きインパルス
 */

import { SceneBase } from '../SceneBase.js';
import { RandomLFO } from '../../lib/RandomLFO.js';
import { attachDepthOfField } from '../../lib/presentation/DepthOfFieldAndGrain.js';
import * as THREE from 'three';

export class Scene10 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'emergence | complex.sys 10';
        this.sceneNumber = 10;
        this.kitNo = 10;
        this.sharedResourceManager = sharedResourceManager;

        // ---- 個体・種族 ----
        this.boidCount = 700;
        this.speciesCount = 5;
        this.speciesColors = [
            new THREE.Color(0x2f6bff),  // 種0: ブルー
            new THREE.Color(0x00e5ff),  // 種1: シアン
            new THREE.Color(0xff2fd6),  // 種2: マゼンタ
            new THREE.Color(0xffb300),  // 種3: アンバー
            new THREE.Color(0x39ff6a),  // 種4: グリーン
        ];

        // ---- 空間相互作用 ----
        this.interactDist = 90.0;    // 相互作用の知覚半径
        this.sepDist = 26.0;         // 万有斥力（衝突回避）の半径
        this.linkDist = 46.0;        // 線で結ぶ距離
        this.maxLinks = 2500;        // 線の最大本数
        this.minSpeed = 25.0;
        this.maxSpeed = 240.0;       // エナジーで最大1.8倍
        this.forceScale = 620.0;     // 行列力のスケール
        this.alignWeight = 1.1;      // 同種族の整列（Vicsek項）
        this.friction = 0.9;         // 速度減衰率/秒（構造が形成される粘性）
        this.boundRadius = 470.0;
        this.containWeight = 1.6;
        this.fleeWeight = 3.2;
        this.fleeDist = 170.0;

        // ---- 非対称相互作用行列 K[a*S+b] = 種aが種bから受ける引力(+)/斥力(-) ----
        this.K = new Float32Array(this.speciesCount * this.speciesCount);

        // ---- Kuramoto振動子 ----
        this.ksyncBase = 1.1;        // 基礎結合強度（エナジーで+3まで上がる）
        this.omegaBase = 1.6;        // 基礎角速度（rad/s）

        // ---- エッジ・オブ・カオス（適応ノイズ温度）----
        this.temperature = 150.0;    // ノイズ加速度の振幅
        this.tempMax = 750.0;
        this.tempRate = 900.0;       // 温度調整の速さ
        this.orderPolar = 0.0;       // 秩序パラメータ: 整列度 |Σv̂|/n
        this.orderSync = 0.0;        // 秩序パラメータ: 位相同期度 |Σe^iθ|/n

        // ---- 状態（typed array）----
        this.species = null;         // Uint8Array: 各個体の種族
        this.px = null; this.py = null; this.pz = null;
        this.vx = null; this.vy = null; this.vz = null;
        this.theta = null;           // 振動子の位相
        this.omega = null;           // 振動子の固有角速度
        this.fX = null; this.fY = null; this.fZ = null;   // 行列力＋斥力アキュムレータ
        this.aX = null; this.aY = null; this.aZ = null;   // 同種族の速度和（整列用）
        this.kSin = null;            // Kuramoto結合 Σsin(θj-θi)
        this.nCnt = null;            // 近傍数
        this.nSame = null;           // 同種族の近傍数

        // ---- 岩ジオメトリ（InstancedMeshは形状バリアントごとに1体）----
        this.rockVariantCount = 8;   // 岩の形状バリエーション数
        this.rockMeshes = [];        // InstancedMesh[]（index = バリアント）
        this.variantOf = null;       // Uint8Array: 各個体のバリアント
        this.localIdx = null;        // Uint16Array: バリアント内のインスタンス番号
        this.rotX0 = null; this.rotY0 = null; this.rotZ0 = null;   // 初期姿勢
        this.spinX = null; this.spinY = null; this.spinZ = null;   // タンブリング角速度
        this.scaleBase = null;       // 個体ごとの基本スケール
        this.grayBase = null;        // 個体ごとのグレー濃淡（岩の地色）

        // ---- 描画物 ----
        this.linkLines = null;
        this.boundSphereShader = null;   // 境界球のノイズ変位uniform更新用

        /**
         * 境界球ヒートマップのモード（フラグで切替。戻すときはここを0に）
         * 0 = 黒→青→シアン→緑→黄→赤（標高マップ）
         * 1 = 白→赤（シンプル2色）
         */
        this.sphereHeatmapMode = 1;

        // ---- 境界球ノイズのLFO群（RandomLFO = LFOでLFOを揺らす → 予測不能な漂い）----
        // 4オクターブそれぞれの「時間の速さ・振幅・空間周波数」を独立に漂わせる。
        // RandomLFO(minRate, maxRate, minValue, maxValue)
        this.sphereOctaves = [
            {   // オクターブ1: 大きなうねり（惑星の呼吸）
                time: 0,
                speed: new RandomLFO(0.01, 0.06, 0.025, 0.15),
                amp:   new RandomLFO(0.01, 0.05, 18.0, 55.0),
                frq:   new RandomLFO(0.01, 0.04, 0.003, 0.009),
            },
            {   // オクターブ2: 中スケールの起伏
                time: 0,
                speed: new RandomLFO(0.015, 0.07, 0.045, 0.26),
                amp:   new RandomLFO(0.01, 0.06, 10.0, 32.0),
                frq:   new RandomLFO(0.01, 0.05, 0.008, 0.022),
            },
            {   // オクターブ3: 細かい波
                time: 0,
                speed: new RandomLFO(0.02, 0.08, 0.06, 0.40),
                amp:   new RandomLFO(0.015, 0.07, 5.0, 18.0),
                frq:   new RandomLFO(0.015, 0.06, 0.020, 0.055),
            },
            {   // オクターブ4: 微細なさざ波
                time: 0,
                speed: new RandomLFO(0.02, 0.10, 0.09, 0.60),
                amp:   new RandomLFO(0.02, 0.08, 2.0, 9.0),
                frq:   new RandomLFO(0.02, 0.07, 0.050, 0.130),
            },
        ];
        // 歪みの「偏り」：偏る方向（球面座標）と偏りの強さもゆっくり漂う
        this.biasThetaLFO = new RandomLFO(0.005, 0.03, 0.0, Math.PI * 2);
        this.biasPhiLFO   = new RandomLFO(0.005, 0.03, 0.4, 2.7);
        this.biasAmtLFO   = new RandomLFO(0.01, 0.05, 0.15, 0.85);

        // ---- ノイズのノイズ（山の場所・高さの偏りマスク）----
        // 超低周波マスク2枚を掛け、powで平坦を広げ、重なった所だけ突出させる。
        this.maskT1 = 0.0;
        this.maskT2 = 0.0;
        this.maskSpeed1LFO = new RandomLFO(0.008, 0.04, 0.008, 0.08);  // マスク1の流れる速さ
        this.maskSpeed2LFO = new RandomLFO(0.008, 0.04, 0.012, 0.10);  // マスク2の流れる速さ
        this.maskFrq1LFO   = new RandomLFO(0.004, 0.02, 0.0012, 0.0042);  // 島の数（少=デカい大陸）
        this.maskFrq2LFO   = new RandomLFO(0.004, 0.02, 0.0020, 0.0060);
        this.maskPowLFO    = new RandomLFO(0.006, 0.03, 1.2, 3.2);     // 静かな場所と活発な場所の差
        this.peakGainLFO   = new RandomLFO(0.005, 0.03, 1.5, 6.0);     // レアなピークの突出度

        // ---- 岩の流れ場（周回スワール・対流ロール・ノイズフロー。全部LFOで漂う）----
        // 「中心から広がって戻る」だけの放射運動を壊し、角度・周回・偏流を作る。
        this.swirlStrength = 520.0;      // スワール（軸周り周回力）の基準スケール
        this.flowNoiseStrength = 380.0;  // ノイズフロー（空間偏流）の基準スケール
        this.flowTime = 0.0;             // 流れ場専用の時間（流れる速さ自体もLFOで伸縮）
        this.flowAxisThetaLFO = new RandomLFO(0.004, 0.025, 0.0, Math.PI * 2);  // 回転軸の向き
        this.flowAxisPhiLFO   = new RandomLFO(0.004, 0.025, 0.3, 2.8);
        this.swirlLFO         = new RandomLFO(0.006, 0.040, -1.0, 1.0);   // 負=逆回転もする
        this.rollLFO          = new RandomLFO(0.005, 0.030, -0.7, 0.7);   // 軸方向の対流
        this.flowNoiseAmpLFO  = new RandomLFO(0.008, 0.050, 0.1, 1.0);
        this.flowNoiseFrqLFO  = new RandomLFO(0.006, 0.030, 0.0025, 0.0085);
        this.flowTimeSpeedLFO = new RandomLFO(0.008, 0.040, 0.05, 0.6);
        this.linkPositions = null;
        this.linkColors = null;
        this.boundSphere = null;

        // ---- 捕食者（track5）----
        this.predator = null;
        this.predatorPos = new THREE.Vector3(0, 0, 9999);
        this.predatorVel = new THREE.Vector3();
        this.predatorLife = 0.0;
        this.predatorSpeed = 500.0;

        // ---- エナジー（全trackのノートで上がり、指数減衰）----
        this.energy = 0.0;

        // ---- 被写界深度（DOF）----
        // フォーカスは岩の群れの重心へ自動追従（onUpdateでlerp）
        this.useDOF = true;
        this.dofParams = {
            focus: 900,          // 初期フォーカス距離（カメラ〜群れ重心くらい）
            aperture: 0.000018,  // ボケの強さ（このシーンの距離感に合わせ強め）
            maxblur: 0.0055,     // 最大ボケ半径
        };
        this._centroid = new THREE.Vector3();   // 群れの重心（毎フレーム更新）

        // ---- スクラッチ（GC削減）----
        this._dummy = new THREE.Object3D();
        this._zAxis = new THREE.Vector3(0, 0, 1);
        this._dir = new THREE.Vector3();
        this._color = new THREE.Color();
        this._white = new THREE.Color(0xffffff);

        // 擬似乱数（xorshift。再現性のある散らばり）
        this.seed = 0x2545f491 | 0;

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
        cameraParticle.minDistance = 500.0;
        cameraParticle.maxDistance = 1400.0;
        cameraParticle.maxDistanceReset = 1000.0;
    }

    async setup() {
        await super.setup();

        this.scene.background = new THREE.Color(0x000000);

        // 岩の陰影用ライト（flatShadingのファセットを出す）
        const ambient = new THREE.AmbientLight(0xffffff, 0.45);
        this.scene.add(ambient);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
        dirLight.position.set(600, 900, 400);
        this.scene.add(dirLight);

        this._initMatrix(1.0);
        this._initAgents();
        this._buildRockMeshes();
        this._buildLinkLines();
        this._buildBoundSphere();
        this._buildPredator();

        // 被写界深度（composerが無ければ内部で作られ、後からCA/グリッチが同じcomposerに載る）
        attachDepthOfField(this, this.dofParams);

        this.setParticleCount(this.boidCount);
    }

    /**
     * 相互作用行列を初期化/突然変異。
     * 対角（同種族）は正＝群れる。非対角は[-1,1]で非対称＝追う/逃げるの生態が生まれる。
     * @param {number} blend 1.0=完全新規、0<b<1=既存行列とブレンド（部分変異）
     */
    _initMatrix(blend) {
        const S = this.speciesCount;
        for (let a = 0; a < S; a++) {
            for (let b = 0; b < S; b++) {
                const idx = a * S + b;
                const fresh = (a === b)
                    ? 0.55 + this._rand() * 0.45          // 同種族: 常に凝集
                    : this._rand() * 2.0 - 1.0;           // 他種族: 引力〜斥力（非対称）
                this.K[idx] = this.K[idx] * (1 - blend) + fresh * blend;
            }
        }
    }

    /** 個体の初期化（種族はインターリーブ、位置は球殻、位相はランダム） */
    _initAgents() {
        const n = this.boidCount;
        this.species = new Uint8Array(n);
        this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
        this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
        this.theta = new Float32Array(n);
        this.omega = new Float32Array(n);
        this.fX = new Float32Array(n); this.fY = new Float32Array(n); this.fZ = new Float32Array(n);
        this.aX = new Float32Array(n); this.aY = new Float32Array(n); this.aZ = new Float32Array(n);
        this.kSin = new Float32Array(n);
        this.nCnt = new Uint16Array(n);
        this.nSame = new Uint16Array(n);

        for (let i = 0; i < n; i++) {
            this.species[i] = i % this.speciesCount;
            const r = 120 + this._rand() * 280;
            const th = this._rand() * Math.PI * 2;
            const ph = Math.acos(2 * this._rand() - 1);
            this.px[i] = Math.sin(ph) * Math.cos(th) * r;
            this.py[i] = Math.sin(ph) * Math.sin(th) * r;
            this.pz[i] = Math.cos(ph) * r;
            this.vx[i] = (this._rand() - 0.5) * 160;
            this.vy[i] = (this._rand() - 0.5) * 160;
            this.vz[i] = (this._rand() - 0.5) * 160;
            this.theta[i] = this._rand() * Math.PI * 2;
            // 固有周波数に種族差＋個体差（完全同一だと自明に同期してしまう）
            this.omega[i] = this.omegaBase * (0.8 + 0.1 * this.species[i] + this._rand() * 0.3);
        }

        // 岩の見た目パラメータ（バリアント割当・姿勢・タンブリング・スケール）
        this.variantOf = new Uint8Array(n);
        this.localIdx = new Uint16Array(n);
        this.rotX0 = new Float32Array(n); this.rotY0 = new Float32Array(n); this.rotZ0 = new Float32Array(n);
        this.spinX = new Float32Array(n); this.spinY = new Float32Array(n); this.spinZ = new Float32Array(n);
        this.scaleBase = new Float32Array(n);
        const perVariant = new Uint16Array(this.rockVariantCount);
        for (let i = 0; i < n; i++) {
            const v = i % this.rockVariantCount;
            this.variantOf[i] = v;
            this.localIdx[i] = perVariant[v]++;
            this.rotX0[i] = this._rand() * Math.PI * 2;
            this.rotY0[i] = this._rand() * Math.PI * 2;
            this.rotZ0[i] = this._rand() * Math.PI * 2;
            // ゆっくり不規則に転がる（個体ごとに軸も速さも違う）
            this.spinX[i] = (this._rand() - 0.5) * 3.0;
            this.spinY[i] = (this._rand() - 0.5) * 3.0;
            this.spinZ[i] = (this._rand() - 0.5) * 3.0;
            this.scaleBase[i] = 0.7 + this._rand() * 0.9;
        }

        // 岩の地色：個体ごとにランダムなグレー濃淡
        this.grayBase = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            this.grayBase[i] = 0.3 + this._rand() * 0.55;   // 0.3〜0.85のグレー
        }
    }

    /**
     * 岩ジオメトリを1つ生成：Icosahedronの頂点を座標ハッシュでランダム変位。
     * 同一座標の重複頂点は同じ変位になるため、メッシュが裂けない。
     * @param {number} seedOffset バリアントごとに違う形にするためのシード
     */
    _makeRockGeometry(seedOffset) {
        const geo = new THREE.IcosahedronGeometry(7.0, 1);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            // 座標ベースの決定論ハッシュ（0..1）。seedOffsetでバリアント差を出す
            const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seedOffset * 91.7) * 43758.5453;
            const f = h - Math.floor(h);
            const s = 0.62 + f * 0.85;   // 半径を0.62〜1.47倍に凸凹させる
            pos.setXYZ(i, x * s, y * s, z * s);
        }
        geo.computeVertexNormals();
        return geo;
    }

    /** 個体メッシュ：形状バリアント別のInstancedMeshで岩を一括描画 */
    _buildRockMeshes() {
        const n = this.boidCount;
        // インスタンス色（種族色×発光）をそのまま出したいので、ライトで陰影だけ付ける
        const mat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            flatShading: true,   // 岩のファセット感
            roughness: 0.85,
            metalness: 0.15,
        });
        // バリアントごとの個体数を数える
        const counts = new Uint16Array(this.rockVariantCount);
        for (let i = 0; i < n; i++) counts[this.variantOf[i]]++;

        for (let v = 0; v < this.rockVariantCount; v++) {
            const geo = this._makeRockGeometry(v + 1);
            const mesh = new THREE.InstancedMesh(geo, mat, counts[v]);
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.scene.add(mesh);
            this.rockMeshes.push(mesh);
        }
        // 初期色（グレー濃淡）を流し込んで instanceColor を確保
        for (let i = 0; i < n; i++) {
            this._color.setScalar(this.grayBase[i]);
            this.rockMeshes[this.variantOf[i]].setColorAt(this.localIdx[i], this._color);
        }
    }

    /** 近傍接続線：種族色をブレンドした頂点色で「生態系の神経網」を描く */
    _buildLinkLines() {
        this.linkPositions = new Float32Array(this.maxLinks * 6);
        this.linkColors = new Float32Array(this.maxLinks * 6);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(this.linkPositions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(this.linkColors, 3));
        geo.setDrawRange(0, 0);
        const mat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.14,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        this.linkLines = new THREE.LineSegments(geo, mat);
        this.linkLines.frustumCulled = false;
        this.scene.add(this.linkLines);
    }

    /**
     * 境界球：約10万頂点の高ディテールワイヤーフレーム（ハッキリした白線）。
     * 頂点シェーダーにノイズ変位を注入し、GPU側で時間とともに歪ませる
     * （10万頂点をCPUで毎フレーム動かすと重いため）。
     */
    _buildBoundSphere() {
        // (384+1)*(256+1) ≈ 98,945頂点 ≈ 10万
        const geo = new THREE.SphereGeometry(this.boundRadius + 60, 384, 256);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            wireframe: true,
        });
        mat.onBeforeCompile = (shader) => {
            // 4オクターブそれぞれの時間・空間周波数・振幅（JS側のLFOが毎フレーム書き換える）
            shader.uniforms.uT = { value: new THREE.Vector4() };
            shader.uniforms.uFrq = { value: new THREE.Vector4(0.006, 0.015, 0.035, 0.08) };
            shader.uniforms.uAmp = { value: new THREE.Vector4(20, 12, 6, 3) };
            // 歪みの偏り：uBiasDir側の半球ほど強く歪む
            shader.uniforms.uBiasDir = { value: new THREE.Vector3(0, 1, 0) };
            shader.uniforms.uBiasAmt = { value: 0.4 };
            // ヒートマップの赤に到達する変位量（LFOで振幅が変わるためJS側で毎フレーム更新）
            shader.uniforms.uHeatMax = { value: 60.0 };
            // ノイズのノイズ（山の場所・高さを偏らせる超低周波マスク）
            shader.uniforms.uMaskT = { value: new THREE.Vector2() };
            shader.uniforms.uMaskFrq = { value: new THREE.Vector2(0.0025, 0.004) };
            shader.uniforms.uMaskPow = { value: 3.0 };
            shader.uniforms.uPeakGain = { value: 3.0 };
            shader.vertexShader = `
uniform vec4 uT;
uniform vec4 uFrq;
uniform vec4 uAmp;
uniform vec3 uBiasDir;
uniform float uBiasAmt;
uniform float uHeatMax;
uniform vec2 uMaskT;
uniform vec2 uMaskFrq;
uniform float uMaskPow;
uniform float uPeakGain;
varying float vHeat;
float bsHash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
// 3D値ノイズ（-1..1）
float bsNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(bsHash(i),                    bsHash(i + vec3(1., 0., 0.)), f.x),
            mix(bsHash(i + vec3(0., 1., 0.)), bsHash(i + vec3(1., 1., 0.)), f.x), f.y),
        mix(mix(bsHash(i + vec3(0., 0., 1.)), bsHash(i + vec3(1., 0., 1.)), f.x),
            mix(bsHash(i + vec3(0., 1., 1.)), bsHash(i + vec3(1., 1., 1.)), f.x), f.y),
        f.z) * 2.0 - 1.0;
}
` + shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                {
                    vec3 nrm = normalize(position);
                    // 4重ノイズ：各オクターブが独立した速度・向きでノイズ空間を流れる
                    float w = bsNoise(position * uFrq.x + vec3(uT.x, uT.x * 0.73, -uT.x * 0.51)) * uAmp.x
                            + bsNoise(position * uFrq.y - vec3(uT.y * 0.62, uT.y, uT.y * 0.44)) * uAmp.y
                            + bsNoise(position * uFrq.z + vec3(-uT.z * 0.35, uT.z * 0.81, uT.z)) * uAmp.z
                            + bsNoise(position * uFrq.w + vec3(uT.w, -uT.w * 0.57, uT.w * 0.93)) * uAmp.w;
                    // ノイズのノイズ：超低周波マスクで「山が生える場所」自体を偏らせる
                    float m1 = bsNoise(position * uMaskFrq.x + vec3(uMaskT.x, uMaskT.x * 0.61, -uMaskT.x * 0.47)) * 0.5 + 0.5;
                    float m2 = bsNoise(position * uMaskFrq.y + vec3(-uMaskT.y * 0.53, uMaskT.y, uMaskT.y * 0.71)) * 0.5 + 0.5;
                    // フロア0.35＝どこも最低限うねる（死んだ平面を作らない）。
                    // その上にマスクの起伏を重ね、powで「静かな場所」と「活発な場所」の差を出す
                    float mask = 0.35 + pow(m1, uMaskPow) * (0.5 + 0.5 * m2) * 1.15;
                    // 2つのマスクが重なったレアな場所だけ、ピークゲインでやたら高くなる
                    mask *= 1.0 + uPeakGain * smoothstep(0.55, 0.95, m1 * m2);
                    w *= mask * 2.2;
                    // 偏り：uBiasDir側の半球が深く歪み、反対側は穏やか
                    float side = dot(nrm, uBiasDir) * 0.5 + 0.5;
                    w *= mix(1.0 - uBiasAmt, 1.0 + uBiasAmt, side);
                    transformed += nrm * w;
                    // 変位量→ヒートマップ用（0=素の球面, 1=最大高さ）
                    // 外向き（プラス）の高さだけ色にする。元の面以下（凹み）は黒のまま。
                    // 突出ピークは1.0でクランプ＝赤で飽和。pow(x,0.7)のガンマで中間色を持ち上げる
                    vHeat = pow(clamp(max(w, 0.0) / uHeatMax, 0.0, 1.0), 0.7);
                }`
            );
            // ヒートマップのモード切替（0=黒→青→…→赤, 1=白→赤）
            shader.uniforms.uHeatMode = { value: this.sphereHeatmapMode };
            // フラグメント側：変位量をヒートマップに変換（uHeatModeで2種を切替）
            shader.fragmentShader = `
varying float vHeat;
uniform float uHeatMode;
// モード0: 黒→青→シアン→緑→黄→赤（標高マップ）
vec3 heatColor(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c;
    if (t < 0.2)      c = mix(vec3(0.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), t / 0.2);
    else if (t < 0.4) c = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), (t - 0.2) / 0.2);
    else if (t < 0.6) c = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), (t - 0.4) / 0.2);
    else if (t < 0.8) c = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (t - 0.6) / 0.2);
    else              c = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), (t - 0.8) / 0.2);
    return c;
}
// モード1: 白→赤（シンプル2色）
vec3 heatColorWhiteRed(float t) {
    return mix(vec3(1.0), vec3(1.0, 0.0, 0.0), clamp(t, 0.0, 1.0));
}
` + shader.fragmentShader.replace(
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                'vec4 diffuseColor = vec4( uHeatMode < 0.5 ? heatColor(vHeat) : heatColorWhiteRed(vHeat), opacity );'
            );
            this.boundSphereShader = shader;
        };
        this.boundSphere = new THREE.Mesh(geo, mat);
        this.scene.add(this.boundSphere);
    }

    /** 捕食者：赤いワイヤー多面体（track5で突撃） */
    _buildPredator() {
        const geo = new THREE.IcosahedronGeometry(22, 0);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xff2222,
            wireframe: true,
            transparent: true,
            opacity: 0.0,
        });
        this.predator = new THREE.Mesh(geo, mat);
        this.predator.position.copy(this.predatorPos);
        this.scene.add(this.predator);
    }

    onUpdate(deltaTime) {
        const dt = Math.min(deltaTime || 0.016, 0.05);  // スパイク保護
        this.time += dt;

        // ---- エナジー減衰 ----
        this.energy *= Math.exp(-1.6 * dt);

        // ---- 捕食者 ----
        this._updatePredator(dt);

        // ---- 複雑系本体 ----
        this._updateAgents(dt);

        // ---- 秩序パラメータを視覚にフィードバック ----
        if (this.boundSphere) {
            this.boundSphere.rotation.y += dt * 0.03;
            this.boundSphere.rotation.x += dt * 0.017;
        }
        // 球のノイズを進める：全パラメータをRandomLFOでゆっくり漂わせる
        if (this.boundSphereShader) {
            const u = this.boundSphereShader.uniforms;
            const eBoost = 1.0 + Math.min(1, this.energy) * 0.9;   // 音でうねりが深くなる
            for (let k = 0; k < this.sphereOctaves.length; k++) {
                const oc = this.sphereOctaves[k];
                oc.speed.update(dt);
                oc.amp.update(dt);
                oc.frq.update(dt);
                // 「時間の流れる速さ」自体がLFOで変わる（速く流れたり淀んだり）
                oc.time += dt * oc.speed.getValue();
                u.uT.value.setComponent(k, oc.time);
                u.uAmp.value.setComponent(k, oc.amp.getValue() * eBoost);
                u.uFrq.value.setComponent(k, oc.frq.getValue());
            }
            // 偏りの方向（球面上を漂う）と強さ
            this.biasThetaLFO.update(dt);
            this.biasPhiLFO.update(dt);
            this.biasAmtLFO.update(dt);
            const th = this.biasThetaLFO.getValue();
            const ph = this.biasPhiLFO.getValue();
            u.uBiasDir.value.set(
                Math.sin(ph) * Math.cos(th),
                Math.cos(ph),
                Math.sin(ph) * Math.sin(th)
            );
            u.uBiasAmt.value = this.biasAmtLFO.getValue();

            // ノイズのノイズ：マスクの時間・周波数・平坦度・ピーク突出度を漂わせる
            this.maskSpeed1LFO.update(dt);
            this.maskSpeed2LFO.update(dt);
            this.maskFrq1LFO.update(dt);
            this.maskFrq2LFO.update(dt);
            this.maskPowLFO.update(dt);
            this.peakGainLFO.update(dt);
            this.maskT1 += dt * this.maskSpeed1LFO.getValue();
            this.maskT2 += dt * this.maskSpeed2LFO.getValue();
            u.uMaskT.value.set(this.maskT1, this.maskT2);
            u.uMaskFrq.value.set(this.maskFrq1LFO.getValue(), this.maskFrq2LFO.getValue());
            u.uMaskPow.value = this.maskPowLFO.getValue();
            u.uPeakGain.value = this.peakGainLFO.getValue();

            // ヒートマップの赤基準：「普通の山」が黄〜赤に届く高さに設定
            // （ピークゲインは含めない＝突出ピークは赤で飽和して確実に燃える）
            const a = u.uAmp.value;
            u.uHeatMax.value = (a.x + a.y + a.z + a.w) * 0.5;
            // ヒートマップモードをフラグから同期（実行中に切り替え可能）
            u.uHeatMode.value = this.sphereHeatmapMode;
        }
        if (this.linkLines) {
            this.linkLines.material.opacity =
                0.08 + Math.min(1, this.energy) * 0.2 + this.orderSync * 0.12;
        }

        // ---- DOF：フォーカスは境界球の表面へ（視線中心にある面までの距離）----
        if (this.useDOF && this.bokehPass && this.camera) {
            const sphereR = this.boundRadius + 60;
            const camD = this.camera.position.length();   // カメラは常に原点を見ている
            // 球の外＝手前の面、球の中＝向こう側の面にピント
            const d = camD > sphereR ? (camD - sphereR) : (camD + sphereR);
            const u = this.bokehPass.uniforms;
            u.focus.value += (d - u.focus.value) * Math.min(1, 5.0 * dt);
        }
    }

    /** 捕食者：群れの重心へ突っ込み、寿命が切れたらフェードアウト */
    _updatePredator(dt) {
        if (!this.predator) return;

        if (this.predatorLife > 0) {
            this.predatorLife -= dt;
            let cx = 0, cy = 0, cz = 0;
            const n = this.boidCount;
            for (let i = 0; i < n; i += 8) { cx += this.px[i]; cy += this.py[i]; cz += this.pz[i]; }
            const m = Math.ceil(n / 8);
            this._dir.set(cx / m - this.predatorPos.x, cy / m - this.predatorPos.y, cz / m - this.predatorPos.z);
            if (this._dir.lengthSq() > 1) {
                this._dir.normalize().multiplyScalar(this.predatorSpeed);
                this.predatorVel.lerp(this._dir, Math.min(1, 1.5 * dt));
            }
            this.predatorPos.addScaledVector(this.predatorVel, dt);
            this.predator.position.copy(this.predatorPos);
            this.predator.rotation.x += dt * 4;
            this.predator.rotation.y += dt * 5;
            this.predator.material.opacity = Math.min(0.9, this.predator.material.opacity + dt * 4);
        } else if (this.predator.material.opacity > 0) {
            this.predatorPos.addScaledVector(this.predatorVel, dt);
            this.predator.position.copy(this.predatorPos);
            this.predator.material.opacity = Math.max(0, this.predator.material.opacity - dt * 1.5);
            if (this.predator.material.opacity === 0) {
                this.predatorPos.set(0, 0, 9999);
            }
        }
    }

    /** 複雑系の心臓部：ペアループ（行列力・整列・Kuramoto）→ 積分 → 秩序測定 → 温度制御 */
    _updateAgents(dt) {
        const n = this.boidCount;
        const S = this.speciesCount;
        const K = this.K;
        const sp = this.species;
        const px = this.px, py = this.py, pz = this.pz;
        const vx = this.vx, vy = this.vy, vz = this.vz;
        const fX = this.fX, fY = this.fY, fZ = this.fZ;
        const aX = this.aX, aY = this.aY, aZ = this.aZ;
        const kSin = this.kSin, cnt = this.nCnt, same = this.nSame;
        const theta = this.theta;

        fX.fill(0); fY.fill(0); fZ.fill(0);
        aX.fill(0); aY.fill(0); aZ.fill(0);
        kSin.fill(0); cnt.fill(0); same.fill(0);

        const R = this.interactDist;
        const R2 = R * R;
        const S2 = this.sepDist * this.sepDist;
        const L2 = this.linkDist * this.linkDist;
        const lk = this.linkPositions;
        const lc = this.linkColors;
        const F0 = this.forceScale;
        let linkCount = 0;

        // ---- ペアループ：行列力（非対称）・同種整列・Kuramoto結合を両側に加算 ----
        for (let i = 0; i < n; i++) {
            const pix = px[i], piy = py[i], piz = pz[i];
            const si = sp[i];
            const rowI = si * S;
            for (let j = i + 1; j < n; j++) {
                const dx = px[j] - pix;
                const dy = py[j] - piy;
                const dz = pz[j] - piz;
                const d2 = dx * dx + dy * dy + dz * dz;
                if (d2 >= R2) continue;

                const d = Math.sqrt(d2) || 0.0001;
                const ux = dx / d, uy = dy / d, uz = dz / d;
                const sj = sp[j];

                if (d2 < S2) {
                    // 万有斥力（衝突回避）：種族を問わず近すぎたら離れる
                    const rep = F0 * 1.6 * (1.0 - d / this.sepDist);
                    fX[i] -= ux * rep; fY[i] -= uy * rep; fZ[i] -= uz * rep;
                    fX[j] += ux * rep; fY[j] += uy * rep; fZ[j] += uz * rep;
                } else {
                    // 非対称行列力：中間距離でピークの三角カーネル
                    // i が j から受ける力は K[si][sj]、j が i から受ける力は K[sj][si]（≠）
                    const q = d / R;
                    const w = 1.0 - Math.abs(2.0 * q - 1.0);
                    const fi = K[rowI + sj] * w * F0;
                    const fj = K[sj * S + si] * w * F0;
                    fX[i] += ux * fi; fY[i] += uy * fi; fZ[i] += uz * fi;
                    fX[j] -= ux * fj; fY[j] -= uy * fj; fZ[j] -= uz * fj;
                }

                // 同種族のみ整列（Vicsek項）：速度の向きが揃う＝群飛
                if (si === sj) {
                    aX[i] += vx[j]; aY[i] += vy[j]; aZ[i] += vz[j];
                    aX[j] += vx[i]; aY[j] += vy[i]; aZ[j] += vz[i];
                    same[i]++; same[j]++;
                }

                // Kuramoto結合（対称）：近傍と位相を引き込み合う
                const s = Math.sin(theta[j] - theta[i]);
                kSin[i] += s; kSin[j] -= s;
                cnt[i]++; cnt[j]++;

                // 接続線：2種族の色をブレンド（バッファ上限まで）
                if (d2 < L2 && linkCount < this.maxLinks) {
                    const o = linkCount * 6;
                    lk[o] = pix;   lk[o + 1] = piy;   lk[o + 2] = piz;
                    lk[o + 3] = px[j]; lk[o + 4] = py[j]; lk[o + 5] = pz[j];
                    const ci = this.speciesColors[si], cj = this.speciesColors[sj];
                    lc[o]     = ci.r * 0.7; lc[o + 1] = ci.g * 0.7; lc[o + 2] = ci.b * 0.7;
                    lc[o + 3] = cj.r * 0.7; lc[o + 4] = cj.g * 0.7; lc[o + 5] = cj.b * 0.7;
                    linkCount++;
                }
            }
        }

        // ---- 積分＋秩序パラメータ測定 ----
        const eBoost = Math.min(1, this.energy);
        const maxSpd = this.maxSpeed * (1.0 + eBoost * 0.8);
        const damp = Math.exp(-this.friction * dt);
        const ksync = this.ksyncBase + eBoost * 3.0;   // 音が強いほど同期が締まる
        const temp = this.temperature;
        const pred = this.predatorPos;
        const predActive = this.predatorLife > 0;
        const flee2 = this.fleeDist * this.fleeDist;
        const bound = this.boundRadius;

        // ---- 流れ場パラメータを更新（全部LFOで漂い、/phaseで偏りが付く）----
        this.flowAxisThetaLFO.update(dt);
        this.flowAxisPhiLFO.update(dt);
        this.swirlLFO.update(dt);
        this.rollLFO.update(dt);
        this.flowNoiseAmpLFO.update(dt);
        this.flowNoiseFrqLFO.update(dt);
        this.flowTimeSpeedLFO.update(dt);
        this.flowTime += dt * this.flowTimeSpeedLFO.getValue();
        // /phase（曲のセクション）で回転軸の向きが45°ずつ変わり、偶奇で回転方向の癖が付く
        const phaseAngle = (this.phase % 8) * (Math.PI / 4);
        const fth = this.flowAxisThetaLFO.getValue() + phaseAngle;
        const fph = this.flowAxisPhiLFO.getValue();
        const axX = Math.sin(fph) * Math.cos(fth);
        const axY = Math.cos(fph);
        const axZ = Math.sin(fph) * Math.sin(fth);
        const phaseSpin = (this.phase % 2 === 0) ? 0.3 : -0.3;
        const swirl = (this.swirlLFO.getValue() + phaseSpin)
            * this.swirlStrength * (1.0 + eBoost * 0.6) / bound;
        const roll = this.rollLFO.getValue() * this.swirlStrength * 0.6;
        const nAmp = this.flowNoiseAmpLFO.getValue() * this.flowNoiseStrength;
        const nFrq = this.flowNoiseFrqLFO.getValue();
        const ft = this.flowTime;

        let sumVx = 0, sumVy = 0, sumVz = 0;      // 整列度用
        let sumCos = 0, sumSin = 0;               // 同期度用
        let sumPx = 0, sumPy = 0, sumPz = 0;      // 重心（DOFフォーカス用）

        for (let i = 0; i < n; i++) {
            let fx = fX[i], fy = fY[i], fz = fZ[i];

            // 同種族の整列
            const m = same[i];
            if (m > 0) {
                const invM = 1.0 / m;
                fx += (aX[i] * invM - vx[i]) * this.alignWeight;
                fy += (aY[i] * invM - vy[i]) * this.alignWeight;
                fz += (aZ[i] * invM - vz[i]) * this.alignWeight;
            }

            // 捕食者から逃走
            if (predActive) {
                const ex = px[i] - pred.x, ey = py[i] - pred.y, ez = pz[i] - pred.z;
                const ed2 = ex * ex + ey * ey + ez * ez;
                if (ed2 < flee2 && ed2 > 0.0001) {
                    const s = (flee2 / ed2) * this.fleeWeight * 0.6;
                    fx += ex * s; fy += ey * s; fz += ez * s;
                }
            }

            // ---- 流れ場：スワール（軸周りの周回）＋対流ロール＋ノイズフロー ----
            // スワール：axis × p が接線方向 → 軸周りを回る力（LFOで強さも向きも変わる）
            const swx = axY * pz[i] - axZ * py[i];
            const swy = axZ * px[i] - axX * pz[i];
            const swz = axX * py[i] - axY * px[i];
            fx += swx * swirl; fy += swy * swirl; fz += swz * swirl;
            // 対流ロール：軸からの距離で軸方向の上昇/下降が入れ替わる（対流セル）
            const rPerp = Math.sqrt(Math.max(0.0001, swx * swx + swy * swy + swz * swz));
            const rollS = roll * Math.sin(rPerp * 0.008 - ft * 1.3);
            fx += axX * rollS; fy += axY * rollS; fz += axZ * rollS;
            // ノイズフロー：場所によって流れの向きが違う偏流（空間的な偏り）
            const nx = px[i] * nFrq, ny = py[i] * nFrq, nzz = pz[i] * nFrq;
            fx += (Math.sin(nx * 1.7 + ft) * Math.cos(ny * 1.3 - ft * 0.7) + Math.sin(nzz * 2.1 + ft * 0.5)) * nAmp;
            fy += (Math.sin(ny * 1.9 - ft * 0.8) * Math.cos(nzz * 1.1 + ft * 0.6) + Math.sin(nx * 1.5 - ft * 0.4)) * nAmp;
            fz += (Math.sin(nzz * 1.6 + ft * 0.9) * Math.cos(nx * 1.2 + ft * 0.3) + Math.sin(ny * 2.3 + ft * 0.7)) * nAmp;

            // 境界：外に出たら中心へ＋接線方向へ滑らせる（真っ直ぐ跳ね返る単調さを消す）
            const r2 = px[i] * px[i] + py[i] * py[i] + pz[i] * pz[i];
            if (r2 > bound * bound) {
                const r = Math.sqrt(r2);
                const s = ((r - bound) / bound) * this.containWeight * 800 / r;
                fx -= px[i] * s * 0.7; fy -= py[i] * s * 0.7; fz -= pz[i] * s * 0.7;
                fx += swx * s * 0.5; fy += swy * s * 0.5; fz += swz * s * 0.5;
            }

            // ノイズ温度（エッジ・オブ・カオス制御の出力）
            fx += (this._rand() - 0.5) * 2 * temp;
            fy += (this._rand() - 0.5) * 2 * temp;
            fz += (this._rand() - 0.5) * 2 * temp;

            // 粘性減衰 → 力を積分（減衰があるから行列力で「構造」が固まる）
            vx[i] = vx[i] * damp + fx * dt;
            vy[i] = vy[i] * damp + fy * dt;
            vz[i] = vz[i] * damp + fz * dt;

            // 速度クランプ
            const sp2 = vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i];
            const spd = Math.sqrt(sp2) || 0.0001;
            if (spd > maxSpd) {
                const s = maxSpd / spd;
                vx[i] *= s; vy[i] *= s; vz[i] *= s;
            } else if (spd < this.minSpeed) {
                const s = this.minSpeed / spd;
                vx[i] *= s; vy[i] *= s; vz[i] *= s;
            }

            px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;

            // Kuramoto位相の積分：固有周波数＋近傍結合
            const c = cnt[i];
            let dTheta = this.omega[i] * (1.0 + eBoost * 0.5);
            if (c > 0) dTheta += (ksync / c) * kSin[i];
            theta[i] += dTheta * dt;
            if (theta[i] > Math.PI * 2) theta[i] -= Math.PI * 2;

            // 秩序パラメータの累積
            const invSpd = 1.0 / spd;
            sumVx += vx[i] * invSpd; sumVy += vy[i] * invSpd; sumVz += vz[i] * invSpd;
            sumCos += Math.cos(theta[i]); sumSin += Math.sin(theta[i]);
            sumPx += px[i]; sumPy += py[i]; sumPz += pz[i];
        }

        // 群れの重心（DOFフォーカスの追従先）
        this._centroid.set(sumPx / n, sumPy / n, sumPz / n);

        // ---- 秩序パラメータ ----
        this.orderPolar = Math.sqrt(sumVx ** 2 + sumVy ** 2 + sumVz ** 2) / n;   // 整列度 0..1
        this.orderSync = Math.sqrt(sumCos ** 2 + sumSin ** 2) / n;               // 同期度 0..1

        // ---- エッジ・オブ・カオス：目標整列度自体もゆっくり漂わせ、系を相転移の縁に留める ----
        const polarTarget = 0.5 + 0.25 * Math.sin(this.time * 0.07);
        this.temperature += (this.orderPolar - polarTarget) * this.tempRate * dt;
        this.temperature = Math.max(0, Math.min(this.tempMax, this.temperature));

        // ---- 描画バッファ反映 ----
        this._writeInstances();
        if (this.linkLines) {
            this.linkLines.geometry.setDrawRange(0, linkCount * 2);
            this.linkLines.geometry.attributes.position.needsUpdate = true;
            this.linkLines.geometry.attributes.color.needsUpdate = true;
        }
    }

    /** 位置・タンブリング回転・色（種族色 × 位相発光）を岩InstancedMeshへ */
    _writeInstances() {
        const n = this.boidCount;
        const dummy = this._dummy;
        const col = this._color;
        const t = this.time;

        for (let i = 0; i < n; i++) {
            dummy.position.set(this.px[i], this.py[i], this.pz[i]);
            // 岩は進行方向を向かず、個体ごとの軸でゆっくり転がる
            dummy.rotation.set(
                this.rotX0[i] + this.spinX[i] * t,
                this.rotY0[i] + this.spinY[i] * t,
                this.rotZ0[i] + this.spinZ[i] * t
            );

            // 位相発光：sinθのピーク付近だけ鋭く光る（ホタルのフラッシュ）
            const sw = Math.sin(this.theta[i]);
            const pulse = sw > 0 ? sw * sw * sw * sw * sw * sw : 0;   // sin^6で尖らせる

            // フラッシュ中はわずかに膨らむ（基本スケールは個体差あり）
            const scale = this.scaleBase[i] * (1.0 + pulse * 0.5);
            dummy.scale.set(scale, scale, scale);
            dummy.updateMatrix();

            const mesh = this.rockMeshes[this.variantOf[i]];
            const idx = this.localIdx[i];
            mesh.setMatrixAt(idx, dummy.matrix);

            // グレーの地色をベースに、フラッシュで白熱へ
            col.setScalar(this.grayBase[i] * (0.75 + pulse * 0.9));
            col.lerp(this._white, pulse * 0.6);
            mesh.setColorAt(idx, col);
        }
        for (const mesh of this.rockMeshes) {
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
    }

    /**
     * OSC処理。track5/6/7 はこのシーン固有、その他（track1〜4のカメラ・エフェクト、
     * /phase /tick 等）は親に委譲。ノートはエナジー＋種族への位相キックとして系に注入。
     */
    handleOSC(message) {
        const trackNumber = message?.trackNumber;
        const args = message?.args || [];
        const velocity = args.length > 1 ? Number(args[1]) : 100;
        const durationMs = args.length > 2 ? Number(args[2]) : 0;
        const v = Math.max(0, Math.min(127, velocity)) / 127;

        // 全トラック共通：エナジー注入 + track対応種族の位相を蹴る
        // → その種族から発光の雪崩（同期の波）が始まる
        if (trackNumber >= 1 && trackNumber <= 12) {
            this.energy = Math.min(2.0, this.energy + 0.25 + v * 0.5);
            this._kickSpecies((trackNumber - 1) % this.speciesCount, v);
        }

        // --- track5: 捕食者が突撃 ---
        if (trackNumber === 5) {
            this._launchPredator(v, durationMs);
            return;
        }

        // --- track6: 相互作用行列を突然変異（生態系のルール自体が組み変わる）---
        if (trackNumber === 6) {
            // velocityで変異量：弱く叩けば微変化、強く叩けば別の生態系へ
            this._initMatrix(0.25 + v * 0.75);
            return;
        }

        // --- track7: 爆散 ---
        if (trackNumber === 7) {
            this._scatter(v);
            return;
        }

        // それ以外（track1のカメラ、track2/3/4のエフェクト等）は親に委譲
        super.handleOSC(message);
    }

    /** 指定種族の位相を発光方向へキック（同期雪崩の起点になる） */
    _kickSpecies(s, v) {
        if (!this.theta) return;
        const kick = 1.2 + v * 1.8;
        const n = this.boidCount;
        for (let i = 0; i < n; i++) {
            if (this.species[i] !== s) continue;
            this.theta[i] += kick * (0.6 + 0.4 * this._rand());
            if (this.theta[i] > Math.PI * 2) this.theta[i] -= Math.PI * 2;
        }
    }

    /** 捕食者を外周から発射 */
    _launchPredator(v, durationMs) {
        const th = this._rand() * Math.PI * 2;
        const ph = Math.acos(2 * this._rand() - 1);
        const r = this.boundRadius + 250;
        this.predatorPos.set(
            Math.sin(ph) * Math.cos(th) * r,
            Math.sin(ph) * Math.sin(th) * r,
            Math.cos(ph) * r
        );
        this.predatorSpeed = 400 + v * 500;
        this.predatorVel.copy(this.predatorPos).multiplyScalar(-1).normalize().multiplyScalar(this.predatorSpeed);
        this.predatorLife = durationMs > 0 ? Math.max(1.0, durationMs / 1000) : 2.0;
        if (this.predator) this.predator.position.copy(this.predatorPos);
    }

    /** 爆散：全個体を重心から外向きに弾く */
    _scatter(v) {
        const n = this.boidCount;
        let cx = 0, cy = 0, cz = 0;
        for (let i = 0; i < n; i++) { cx += this.px[i]; cy += this.py[i]; cz += this.pz[i]; }
        cx /= n; cy /= n; cz /= n;
        const impulse = 250 + v * 450;
        for (let i = 0; i < n; i++) {
            let dx = this.px[i] - cx, dy = this.py[i] - cy, dz = this.pz[i] - cz;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
            this.vx[i] += (dx / d) * impulse + (this._rand() - 0.5) * impulse * 0.6;
            this.vy[i] += (dy / d) * impulse + (this._rand() - 0.5) * impulse * 0.6;
            this.vz[i] += (dz / d) * impulse + (this._rand() - 0.5) * impulse * 0.6;
        }
        this.energy = Math.min(2.0, this.energy + 0.8);
    }

    dispose() {
        const disposeObj = (obj) => {
            if (!obj) return;
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
            if (this.scene) this.scene.remove(obj);
        };
        for (const mesh of this.rockMeshes) disposeObj(mesh);
        disposeObj(this.linkLines);
        disposeObj(this.boundSphere);
        disposeObj(this.predator);

        this.rockMeshes = [];
        this.linkLines = this.boundSphere = this.predator = null;
        this.linkPositions = this.linkColors = null;
        this.variantOf = this.localIdx = null;
        this.rotX0 = this.rotY0 = this.rotZ0 = null;
        this.spinX = this.spinY = this.spinZ = null;
        this.scaleBase = this.grayBase = null;
        this.boundSphereShader = null;
        // sphereOctaves / biasLFO群はコンストラクタ生成の純JSオブジェクトなので
        // 破棄しない（シーン再入場時のsetup()では再生成されないため）
        this.species = null;
        this.px = this.py = this.pz = null;
        this.vx = this.vy = this.vz = null;
        this.theta = this.omega = null;
        this.fX = this.fY = this.fZ = null;
        this.aX = this.aY = this.aZ = null;
        this.kSin = this.nCnt = this.nSame = null;

        super.dispose();
    }
}
