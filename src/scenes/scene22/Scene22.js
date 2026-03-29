/**
 * Scene22: 白フォグの空シーン。道床メッシュ・インスタンスオブジェクトは出さず、カメラのみ。
 * ポストは OutputPass + ACES・SSAO・DOF・bloom・Film
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import helvetikerFontUrl from 'three/examples/fonts/helvetiker_regular.typeface.json?url';
import { getTerrainHeight as sseTerrainHeight } from './TerrainSampler.js';
import { createSSETerrainGPUMaterial } from './SSETerrainGPUMaterial.js';

export class Scene22 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'mathym | Xenomist';
        this.initialized = false;
        this.sceneNumber = 22;
        this.kitNo = 22;
        /** トラック5スフィア：カールスポーン位置の変化用 */
        this._track5SphereSpawnIndex = 0;
        this.sharedResourceManager = sharedResourceManager;

        this.roomGroup = null;
        this.ceilingMesh = null;
        /** 北壁の extruded 3D タイトル（Helvetiker / 艶・反射） */
        this.wallTitleGroup = null;
        this._wallTitleMaterial = null;

        this.cubeRenderTarget = null;
        this.cubeCamera = null;

        /** トラック9で生える金属片 — GPU インスタンス（1 InstancedMesh） */
        this.shards = [];
        /** この個数を超えたら古い順に削除（安全上限）。普段は shardLifetimeMs で消える */
        this.maxShards = 2000;
        /** トラック9金属片・トラック5シリンダのサイズ倍率（比率を保ったまま拡大） */
        this.shardCylinderVisualScale = 1.5;
        /** 1=標準。下げると照明・露出・環境反射をまとめて暗くする（フォグ色は setup で固定） */
        this.sceneLightingScale = 0.32;
        /** 各破片がこの時間（ms）経過したら削除 */
        this.shardLifetimeMs = 180000;
        /** 寿命終盤でフェードアウトする時間（ms） */
        this.shardFadeOutMs = 1800;
        this.cylinderFadeOutMs = 1800;
        /** 生成時に 0→目標サイズへ伸びる時間（ms） */
        this.shardGrowInMs = 420;
        this.cylinderGrowInMs = 420;
        this._cylinderOpacityAttr = null;
        this.shardGroup = null;
        this.shardInstMesh = null;
        this._shardOpacityAttr = null;
        /** インスタンススロットの空きスタック（0..maxShards-1） */
        this._shardFreeSlots = [];
        this._metalShardMaterial = null;
        this._shardMatrixTemp = new THREE.Matrix4();
        this._shardQuatTemp = new THREE.Quaternion();
        this._shardScaleTemp = new THREE.Vector3();
        this._shardPosTemp = new THREE.Vector3();
        this._spawnWorldPosTemp = new THREE.Vector3();
        this._lastShardPos = new THREE.Vector3(0, 550, 0);
        this._snakeDir = new THREE.Vector3(0, 0.12, 1).normalize();
        /** 残像ヘッド：金属片/赤シリンダーで別系統のカールノイズを使う */
        this._trailHeadPos = new THREE.Vector3(0, 550, 0);
        this._trailHeadDir = new THREE.Vector3(0, 0.06, 1).normalize();
        this._trailHeadPosShard = new THREE.Vector3(0, 550, 0);
        this._trailHeadDirShard = new THREE.Vector3(0, 0.06, 1).normalize();
        this._trailHeadPosCylinder = new THREE.Vector3(0, 550, 0);
        this._trailHeadDirCylinder = new THREE.Vector3(0.1, 0.04, 1).normalize();
        this._trailCenter = new THREE.Vector3(0, 1200, 0);
        this._cameraUpSmoothed = new THREE.Vector3(0, 1, 0);
        this._cameraTerrainUp = new THREE.Vector3(0, 1, 0);
        this._trailSpeed = 720;
        this._trailSpeedShard = 760;
        this._trailSpeedCylinder = 1040;
        this._trailCurlFreq = 0.00135;
        this._trailCurlFreqShard = 0.00165;
        this._trailCurlFreqCylinder = 0.0068;
        this._trailCurlStrength = 2.6;
        this._trailCurlStrengthShard = 4.2;
        this._trailCurlStrengthCylinder = 11.5;
        /** 金属片：部屋中央付近に留める引力 */
        this._trailCenterPull = 0.7;
        /** 赤シリンダー：センタープルは円環周回の主因なのでオフ（カールのみ） */
        this._trailCenterPullCylinder = 0;
        /** カール入力座標の固定オフセット（原点対称の渦を避ける） */
        this._cylinderCurlFieldOffset = new THREE.Vector3(831.2, -1949.5, 722.4);
        this._curlCylPosScratch = new THREE.Vector3();
        /** シリンダー用カールの数値微分ステップ（freq とセットで空間スケールに合わせる） */
        this._trailCurlEpsCylinder = 5.2;
        this._trailYawAmp = 0.42;
        this._trailPitchAmp = 0.28;
        this._trailRollAmp = 0.36;
        /** 直近スポーンしたオブジェクトのワールド座標（カメラ注視） */
        this._spawnFocusWorld = new THREE.Vector3(0, 550, 0);
        this._cameraFocusSmoothed = new THREE.Vector3(0, 550, 0);
        /** 旧 tick ベース生成の互換用カウンタ（色/形ノイズ種） */
        this._lastSpawnTickTrack5 = null;
        this._snakeIndex = 0;
        this._shardSeed = Math.random() * 1000;
        this._shardHeatColor = new THREE.Color();
        this._cylinderTintTemp = new THREE.Color();
        this._instanceWhite = new THREE.Color(0xffffff);
        this._instanceBlack = new THREE.Color(0x000000);
        /** トラック9スフィアの基準色（濃淡ランダムの中心） */
        this._track9SphereColorAtMax = new THREE.Color(0xd5d9df);
        this._track9SphereEmissiveAtMax = new THREE.Color(0x2a2d32);
        /** ニュートラルグレー（R 偏重を避け赤みを出さない） */
        this._shardMetalDark = new THREE.Color(0x5a5a5a);
        this._shardMetalMid = new THREE.Color(0x9e9e9e);
        this._shardMetalBright = new THREE.Color(0xd0d0d0);

        this.pulses = [];
        this.pulseColor = new THREE.Color(1, 0, 0);
        this.targetPulseColor = new THREE.Color(1, 0, 0);
        this.colorIndex = 0;
        this.colors = [
            new THREE.Color(1, 0, 0),
            new THREE.Color(0, 1, 0),
            new THREE.Color(0, 0, 1),
            new THREE.Color(1, 1, 1),
            new THREE.Color(1, 0, 1),
            new THREE.Color(0, 1, 1)
        ];
        this.lightIntensity = 0;
        this.targetLightIntensity = 0;
        this.pulsePointLight = null;
        this.fillPointLight = null;

        this.pmremGenerator = null;
        this._roomEnvTexture = null;

        this.useDOF = true;
        this.useBloom = true;
        /** false でシーンの FogExp2 をオフ */
        this.useSceneFog = true;
        /** 白フォグ */
        this.sceneFogDensity = 0.000072;
        this.sceneFogColor = 0xffffff;
        /** renderer.setClearColor / scene.background 共通 */
        this.sceneBackgroundColor = 0xffffff;
        /** 道・オブジェクト非表示時は地形高さ・蛇行を 0 にしてカメラを平坦化 */
        this._emptySceneFlatGround = true;
        // フォグと併用。コーナーで過暗化しにくいよう minDistance・kernel を控えめに
        this.useSSAO = true;
        this.useFilmGrain = true;
        this.bloomPass = null;
        this.ssaoPass = null;
        this.saoPass = null;
        this.aoDepthTexture = null;
        this.ssaoNearKernelRadius = 5.5;
        this.ssaoNearMinDistance = 0.024;
        this.ssaoNearMaxDistance = 0.11;
        /** 遠景で SSAO が消えすぎないよう 1 に近いほど効きが残る */
        this.ssaoFarAttenuation = 0.52;
        // Scene22 は固定DOFを優先（オートフォーカスで効きが薄く見えるのを防ぐ）
        this.useAutoFocusDOF = false;
        /** composer では最後に必須：renderer.toneMapping / 出力色空間を画面に適用 */
        this.outputPass = null;

        this.trackEffects = {
            1: true,
            2: false,
            3: false,
            4: false,
            5: true,
            6: true,
            7: true,
            8: true,
            9: true
        };
        this.setScreenshotText(this.title);

        if (this.calloutSystem) {
            this.calloutSystem.setUse3DCallouts(true);
            this.calloutSystem.setLabels(['DESERT', 'ROAD', 'FOG', 'ACES']);
        }

        /** 論理上一本道の全長（Z）。スポーン・ループ境界のみ。メッシュは visibleRoadDepth のチャンク */
        this.roadLength = 120000;
        this.roadHalfWidth = 1800;
        /** 実際に張る道床メッシュの奥行き（フォグ内＋α）。広大メッシュは張らない */
        this.visibleRoadDepth = 34000;
        /** カメラ Z は固定。地形チャンクが world -Z へ動いて奥→手前に流れる見え方 */
        this.roadCameraFixedZ = 0;
        /** 表示レンジを分割するチャンク数（ループ用） */
        this.terrainChunkCount = 10;
        /** 奥→手前に回したときのカメラからの余裕（world） */
        this.terrainChunkRecycleMargin = 2200;
        /** 各チャンクの Z 方向分割数（境界の滑らかさ） */
        this.terrainChunkSegZ = 48;
        this._terrainChunkDepth = 0;
        /** @type {{ mesh: THREE.Mesh, geometry: THREE.BufferGeometry }[]} */
        this._terrainChunks = [];
        /** 1枚地形メッシュ + GPU 変位 */
        this._terrainMesh = null;
        this._terrainMat = null;
        /** GPU uniform への参照（value は THREE.Vector2）。フローティングオリジン用 */
        this._terrainOffsetUniform = null;
        /** フローティングオリジンの閾値（メッシュの behind 範囲の半分程度） */
        this._terrainSnapThreshold = 4000;
        this._terrainFloorMat = null;
        this._floorWorldTexTile = 95;
        /** 道床チャンクの横方向分割 */
        this.terrainMeshSegmentsX = 112;
        /** 道床の起伏の最終スケール（world Y） */
        this.terrainHeightAmplitude = 380;
        /** macro/mid/detail 合成後のゲイン（mul を尖らせた分、全体が潰れすぎないよう微増） */
        this.terrainCompositeGain = 0.128;
        /** マクロ（地域）: 低周波 fbm。値を下げるほど波長が伸びて粗くなる */
        this.terrainMacroScale = 0.00185;
        this.terrainMacroOctaves = 5;
        /** 大きいほど「山帯／谷帯」のメリハリが強い */
        this.terrainMacroPow = 2.55;
        /** 中域・詳細の入力スケール（world） */
        this.terrainMidScale = 0.008;
        this.terrainMidOctaves = 4;
        this.terrainDetailScale = 0.015;
        this.terrainDetailOctaves = 2;
        /** 起伏にそのまま掛ける別系統 FBM（1本目＝粗い帯）。値を下げるほど粗い */
        this.terrainModNoiseScale = 0.00088;
        this.terrainModNoiseScaleB = 0.0042;
        /** 1 超で低値寄り（潰れた帯）／1 未満で高値寄り。掛け算のメリハリ用 */
        this.terrainModPowA = 1.82;
        this.terrainModPowB = 1.58;
        /** continent にも mul を混ぜる量（1 で起伏も盆地も同じマスクに追従） */
        this.terrainContinentMulBlend = 0.78;
        this.terrainMidAmpBase = 5.0;
        this.terrainMidAmpRegion = 22.0;
        this.terrainDetailAmpBase = 2.0;
        this.terrainDetailAmpRegion = 11.0;
        this.terrainUseDomainWarp = true;
        this.terrainDomainWarpScale = 0.00072;
        /** 大きすぎると全体がヌルッとなりメリハリが消える */
        this.terrainDomainWarpAmp = 220;
        this.terrainUseRidgedNoise = true;
        this.terrainRidgeScale = 0.011;
        this.terrainRidgeOctaves = 4;
        this.terrainRidgeAmpBase = 0.42;
        this.terrainRidgeAmpRegion = 2.65;
        /** 超低周波で盆地/高原のベース */
        this.terrainContinentScale = 0.00085;
        this.terrainContinentAmp = 0.55;
        this.roomHalfW = this.roadHalfWidth;
        this.roomHalfD = this.roadLength * 0.5;
        this.floorTopY = 0;
        this.ceilingY = 4200;
        /** カメラが +Z に進む（道の向き）。端でループ */
        this._roadCameraZ = -this.roomHalfD + 14000;
        /** 表示・論理の基準となる前進速（world/s）。`roadWorldForwardSpeed` 未使用時のデフォに使う */
        this.roadCameraSpeed = 1350;
        /** null 時フォールバック用。`roadWorldForwardSpeed` 指定時は無視 */
        this.roadCameraIdleDriftScale = 1;
        this.roadCameraMinForward = 0;
        /**
         * 地形 dz・_roadCameraZ・ピアノロール・scroll 共通の 1 本。未設定なら roadCameraSpeed×drift+min。
         * roadCameraSpeed と同じ値にして Terrain と論理進行を一致させる。
         */
        this.roadWorldForwardSpeed = 1350;
        /** リグ未適用時の基準（互換・初期値） */
        this.roadCameraEyeY = 420;
        this.roadLookAhead = 4800;
        /** 俯瞰ブレンドの主周期・補助うねり（rad/s） */
        this.roadCameraRigOrbitSpeed = 0.058;
        this.roadCameraRigWobbleSpeed = 0.175;
        /** 高いほど遠くを見る（lookAhead の伸縮）。低め＝視錐が狭く GPU 負荷と SSE 帯を抑えやすい */
        this.roadLookAheadMin = 2200;
        this.roadLookAheadMax = 5200;
        /** 横のうねり（roadHalfW に対する比率） */
        this.roadCameraSwayAmp = 0.085;
        /** 低いカメラ＝やや広角／高めに上がったときだけ絞る */
        this.roadCameraFovLow = 50;
        this.roadCameraFovHigh = 38;
        /** 道中心線の横オフセット X = f(worldZ)。複数 sin で左右に蛇行 */
        this.roadCurveAmp1 = 440;
        this.roadCurveFreq1 = 0.00036;
        this.roadCurveAmp2 = 190;
        this.roadCurveFreq2 = 0.00084;
        this.roadCurvePhase2 = 1.85;
        /** 地形の上に乗る目線オフセット（リグ blend で最低〜最高）。俯瞰を抑えて描画範囲を絞る */
        this.roadCameraEyeAboveGroundMin = 72;
        this.roadCameraEyeAboveGroundMax = 520;
        /** 路面法線に追従する up の平滑化（大きいほどヌルッと） */
        this.roadCameraUpLerp = 0.2;
        /** 地形勾配サンプル（world） */
        this.roadCameraGroundSampleEps = 155;
        /** +Z に順番に並ぶ次スポーン位置（トラック8シリンダ／トラック9スフィア共通） */
        this.pianoRollStepZ = 440;
        /** ノートごとに増える刻み番号。Z は常に _roadCameraZ から導出（別変数で流すとズレる） */
        this._pianoRollLaneIndex = 0;
        /**
         * 任意の +Z 先読み（演出用のみ）。デフォルト 0。
         * ワールドの並びは _roadCameraZ（論理進行＝地形と同じ）＋ laneIndex×pianoRollStepZ が本体。
         */
        this.pianoRollAheadOfCameraZ = 0;

        /** OSC トラック強度 */
        this.trackValues = { 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
        this.smoothTrack7Color = 0;
        this.cableHomeY = 550;
        this.cableBlobParticle = null;

        /** Scene13 風：空間を漂うインスタンスボックス（金属片とは別・プール） */
        this.ambientParticleCount = 2000;
        this.ambientInstManager = null;
        this.ambientParticles = [];
        /** 破片・シリンダ・トラック9スポーンに同期して出し、寿命で消す */
        this.ambientParticleLifetimeMs = 11000;
        this.ambientParticleFadeOutMs = 1400;
        this.ambientParticlesPerShard = 10;
        this.ambientParticlesPerCylinder = 12;
        this.ambientParticlesPerTrack9 = 16;
        this.ambientMinLiving = 180;
        this._ambientFreeSlots = [];
        this._ambientLiving = [];
        this._ambientHidePos = new THREE.Vector3(0, -1e6, 0);
        this._ambientIdRot = new THREE.Euler(0, 0, 0);

        /** 赤いシリンダ（InstancedMesh、scene 直下ワールド座標。OSC はトラック5） */
        this.cylinderInstMesh = null;
        this.cylinders = [];
        this.maxCylinders = 640;
        /** 赤シリンダー：長さはベロシティ、半径（細さ）はデュレーション */
        this.cylinderLifetimeMs = 180000;
        this._cylinderFreeSlots = [];
        this._redCylinderMaterial = null;
        this._cylinderMatrixTemp = new THREE.Matrix4();
        this._cylinderQuatTemp = new THREE.Quaternion();
        this._cylinderRollQuat = new THREE.Quaternion();
        /** 進行方向に直交する横軸（side）周りのチルト用 */
        this._cylinderTiltXQuat = new THREE.Quaternion();
        /** DNA 螺旋の「塩基対」みたいに、スポーンごとに進行方向周りの位相が一定ずつ進む */
        this._cylinderHelixPhase = 0;
        this._cylinderHelixTwistPerSpawn = 0.055;
        this._cylinderScaleTemp = new THREE.Vector3();
        this._cylinderPosTemp = new THREE.Vector3();
        this._cylinderDirTemp = new THREE.Vector3();
        this._cylinderSideTemp = new THREE.Vector3();
        this._cylinderFallbackAxis = new THREE.Vector3(1, 0, 0);
        this._cylinderAxisUp = new THREE.Vector3(0, 1, 0);
        this._lastCylinderWorldPos = new THREE.Vector3(0, 550, 0);
        this._cylinderPathDir = new THREE.Vector3(0, 0.1, 1).normalize();
        /** OSC actual_tick ベースのスポーン予約（シリンダ＝トラック5） */
        this._lastSpawnTickTrack6 = null;
        /** シリンダー生成時の石バースト（インスタンシング5000粒） */
        this.redBurstParticleCount = 5000;
        this.redBurstInstMesh = null;
        this.redBurstSharedGeo = null;
        this.redBurstMaterial = null;
        this._redBurstPositions = null;
        this._redBurstVelocities = null;
        this._redBurstColors = null;
        this._redBurstRotQuats = null;
        this._redBurstScales = null;
        this._redBurstActive = false;
        this._redBurstAgeSec = 0;
        this._redBurstLifeSec = 1.35;
        this.redBurstCurlStrength = 95;
        this.redBurstCurlFreq = 0.0022;
        this._redBurstPosTemp = new THREE.Vector3();
        this._redBurstQuatTemp = new THREE.Quaternion();
        this._redBurstScaleTemp = new THREE.Vector3();
        this._redBurstMatrixTemp = new THREE.Matrix4();
        this._redBurstColorTemp = new THREE.Color();
        this._redBurstCurlTemp = new THREE.Vector3();

        this._jitterSide = new THREE.Vector3();
        this._jitterUp = new THREE.Vector3();

        /** 常時漂う黒曜石風のチャコール四角形（カールノイズ） */
        this.obsidianCount = 1000;
        this.obsidianInstMesh = null;
        this.obsidianGeometry = null;
        this.obsidianMaterial = null;
        this.obsidianBumpMap = null;
        this._obsidianPositions = null;
        this._obsidianVelocities = null;
        this._obsidianRotQuats = null;
        this._obsidianScales = null;
        this._obsidianPosTemp = new THREE.Vector3();
        this._obsidianQuatTemp = new THREE.Quaternion();
        this._obsidianScaleTemp = new THREE.Vector3();
        this._obsidianMatrixTemp = new THREE.Matrix4();
        this.obsidianSpawnRadius = 1200;
        this.obsidianCurlStrength = 180;
        this.obsidianCurlFreq = 0.0056;
        this.obsidianMotionScale = 6.0;

        /** トラック9：ワールド中心付近スポーンの物理スフィア（チャコール調） */
        this.track9SphereGroup = null;
        this.track9Spheres = [];
        this.maxTrack9Spheres = 280;
        /** true: args[2] のデュレーション（ms）が終わるまで一定間隔でスポーン。false: ノートオンで1回のみ */
        this.track9SpawnDuringDuration = true;
        /** デュレーション中スポーンの間隔（ms）。下限はフレーム間隔程度 */
        this.track9DurationSpawnIntervalMs = 52;
        this._track9SpawnWindowEndMs = 0;
        this._track9SpawnWindowVelocity = 127;
        this._track9LastDurationSpawnMs = 0;
        this.track9SharedGeo = null;
        this._track9SphereMaterial = null;
        this._track9FleshTextures = null;
        this.track9PhysicsGrid = new Map();
        this.track9GridSize = 240;
        /** 弱め＝床に吸われにくく漂いやすい（ドリフト加速度と併用） */
        this._track9Gravity = new THREE.Vector3(0, -9, 0);
        this._track9SpawnPos = new THREE.Vector3();
        /** トラック9：アンビエントBoxと同じ部屋内の基準高さ（ワールド中心＝XZ=0） */
        this._track9WorldCenter = new THREE.Vector3(0, 0, 0);
        this._track9Diff = new THREE.Vector3();
        /** スフィア漂い用の加速度（毎フレーム計算） */
        this._track9SphereDrift = new THREE.Vector3();
        this._track9SubSteps = 2;
        /** スポーン直後、半径が 0→目標まで伸びる時間（秒） */
        this._track9BirthGrowSec = 0.42;
        /** メッシュ・物理半径の全体倍率（見た目の大きさ） */
        this._track9SphereVisualScale = 0.65;

        /** 蛍光灯オフ：太陽（平行光）＋半球＋環境光 */
        this.sunLight = null;
        /** 朝焼けの暖色キック（カメラ側を向ける） */
        this.sunriseLight = null;
        this.hemisphereLight = null;
        this.ambientLight = null;
        this.promoWallFillLight = null;
        this.promoWallLightTarget = null;
        /** 壁周りレーザースキャン（1 小節＝TICK_LOOP/96 tick で一周） */
        this.laserScanMesh = null;
        this._laserScanMaterial = null;
        /** フォグの偏りを作るための薄いノイズ空気ボリューム */
        this.airNoiseVolume = null;
        this.airNoiseMaterial = null;
        this._wallCenterY = this.floorTopY + (this.ceilingY - this.floorTopY) * 0.5;
        this._laserHalfW = this.roomHalfW - 240;
        this._laserHalfD = this.roomHalfD - 240;
    }

    /** 96小節ループ想定（Scene16 と同系）。actual_tick の差分で歩幅を決める */
    static TICK_LOOP = 36864;
    static METERS_PER_TICK_SHARD = 2.45;
    static METERS_PER_TICK_CYLINDER = 2.45;
    /**
     * InstancedMesh 用：インスタンスごとの不透明度（instanceOpacity 属性）
     * depthWrite を有効にして、回転時の描画順由来の浮き感を抑える。
     */
    static _attachInstanceOpacityAttribute(geometry, count) {
        const a = new Float32Array(count);
        a.fill(0);
        const attr = new THREE.InstancedBufferAttribute(a, 1);
        attr.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute('instanceOpacity', attr);
        return attr;
    }

    static _applyInstanceOpacityShader(material) {
        material.transparent = true;
        material.depthWrite = true;
        material.onBeforeCompile = (shader) => {
            shader.vertexShader = 'attribute float instanceOpacity;\nvarying float vInstanceOpacity;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                'vInstanceOpacity = instanceOpacity;\n#include <begin_vertex>'
            );
            shader.fragmentShader = 'varying float vInstanceOpacity;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                `#include <opaque_fragment>
                gl_FragColor.a *= vInstanceOpacity;`
            );
        };
    }

    /**
     * 赤シリンダ専用：インスタンス不透明度＋ビュー空間でプロシージャルな法線摂動（画像テクスチャなし）
     */
    static _applyRedCylinderShader(material) {
        material.transparent = true;
        material.depthWrite = true;
        material.onBeforeCompile = (shader) => {
            shader.vertexShader =
                'attribute float instanceOpacity;\nvarying float vInstanceOpacity;\nvarying vec3 vCylinderWPos;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                'vInstanceOpacity = instanceOpacity;\n#include <begin_vertex>'
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <worldpos_vertex>',
                `#include <worldpos_vertex>
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
    vCylinderWPos = worldPosition.xyz;
#else
    {
        vec4 wp = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
        wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        vCylinderWPos = wp.xyz;
    }
#endif
`
            );
            shader.fragmentShader =
                'varying float vInstanceOpacity;\nvarying vec3 vCylinderWPos;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
float cylinderSurfH( vec3 v ) {
    float t = 0.0035;
    float h = sin( v.x * t * 1.7 + v.y * t * 2.1 ) * cos( v.z * t * 1.9 );
    h += sin( dot( v * ( t * 2.3 ), vec3( 1.1, 0.7, 2.3 ) ) ) * 0.38;
    h += sin( dot( v * ( t * 14.0 ), vec3( 1.7, 2.1, 0.9 ) ) ) * 0.12;
    h += sin( dot( v * ( t * 41.0 ), vec3( 0.9, 1.3, 1.7 ) ) ) * 0.045;
    return h;
}
`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_maps>',
                `#include <normal_fragment_maps>
{
    vec3 vp = ( viewMatrix * vec4( vCylinderWPos, 1.0 ) ).xyz;
    float e = 1.35;
    float dx = cylinderSurfH( vp + vec3( e, 0.0, 0.0 ) ) - cylinderSurfH( vp - vec3( e, 0.0, 0.0 ) );
    float dy = cylinderSurfH( vp + vec3( 0.0, e, 0.0 ) ) - cylinderSurfH( vp - vec3( 0.0, e, 0.0 ) );
    float dz = cylinderSurfH( vp + vec3( 0.0, 0.0, e ) ) - cylinderSurfH( vp - vec3( 0.0, 0.0, e ) );
    vec3 grad = vec3( dx, dy, dz );
    normal = normalize( normal - grad * 0.1 );
}
`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                `#include <opaque_fragment>
                gl_FragColor.a *= vInstanceOpacity;`
            );
        };
    }

    /** 寿命終盤：フェード区間で不透明度 1→0（線形） */
    _fadeOpacity01(elapsedMs, lifeMs, fadeOutMs) {
        const fade = Math.min(fadeOutMs, lifeMs * 0.35);
        const t0 = Math.max(0, lifeMs - fade);
        if (elapsedMs <= t0) return 1;
        if (elapsedMs >= lifeMs) return 0;
        const t = (elapsedMs - t0) / (lifeMs - t0);
        // 線形よりも緩やかに落とす（ふわっと透明化）
        const eased = t * t * (3 - 2 * t);
        return 1 - eased;
    }

    _growScale01(elapsedMs, growMs) {
        const g = Math.max(1, Number(growMs) || 1);
        const t = THREE.MathUtils.clamp(elapsedMs / g, 0, 1);
        return t * t * (3 - 2 * t);
    }

    _growInMsFromDuration(durationMs, baseGrowMs) {
        const d = Math.max(1, Number(durationMs) || 180);
        // duration が長いほど生まれる速度をゆっくりにする（短音は素早く立ち上がる）
        const k = THREE.MathUtils.clamp(d / 700, 0.35, 2.1);
        return baseGrowMs * k;
    }

    _updateFadeOpacity() {
        const now = performance.now();
        if (this._shardOpacityAttr && this.shards.length) {
            const arr = this._shardOpacityAttr.array;
            let dirty = false;
            let matrixDirty = false;
            for (const s of this.shards) {
                const age = now - s.spawnTime;
                const op = this._fadeOpacity01(age, this.shardLifetimeMs, this.shardFadeOutMs);
                const i = s.slotIndex;
                if (Math.abs(arr[i] - op) > 1e-4) {
                    arr[i] = op;
                    dirty = true;
                }
                const grow = this._growScale01(age, s.growInMs ?? this.shardGrowInMs);
                if (grow < 0.999 && s.baseScaleVec && s.localPos && s.localQuat) {
                    this._shardScaleTemp.copy(s.baseScaleVec).multiplyScalar(grow);
                    this._shardMatrixTemp.compose(s.localPos, s.localQuat, this._shardScaleTemp);
                    this.shardInstMesh.setMatrixAt(i, this._shardMatrixTemp);
                    matrixDirty = true;
                }
            }
            if (dirty) this._shardOpacityAttr.needsUpdate = true;
            if (matrixDirty && this.shardInstMesh) this.shardInstMesh.instanceMatrix.needsUpdate = true;
        }
        if (this._cylinderOpacityAttr && this.cylinders.length) {
            const arr = this._cylinderOpacityAttr.array;
            let dirty = false;
            let matrixDirty = false;
            for (const c of this.cylinders) {
                const age = now - c.spawnTime;
                const op = this._fadeOpacity01(age, this.cylinderLifetimeMs, this.cylinderFadeOutMs);
                const i = c.slotIndex;
                if (Math.abs(arr[i] - op) > 1e-4) {
                    arr[i] = op;
                    dirty = true;
                }
                const grow = this._growScale01(age, c.growInMs ?? this.cylinderGrowInMs);
                if (grow < 0.999 && c.baseRadius != null && c.baseLength != null && c.localPos && c.localQuat) {
                    this._cylinderScaleTemp.set(c.baseRadius * grow, c.baseLength * grow, c.baseRadius * grow);
                    this._cylinderMatrixTemp.compose(c.localPos, c.localQuat, this._cylinderScaleTemp);
                    this.cylinderInstMesh.setMatrixAt(i, this._cylinderMatrixTemp);
                    matrixDirty = true;
                }
            }
            if (dirty) this._cylinderOpacityAttr.needsUpdate = true;
            if (matrixDirty && this.cylinderInstMesh) this.cylinderInstMesh.instanceMatrix.needsUpdate = true;
        }
    }

    /**
     * @param {number} nowTick
     * @param {number|null} prevTick 前回スポーン時の tick
     * @returns {number} 同一 tick 連打は小さめステップだが詰まりすぎないよう離す
     */
    _tickDelta(nowTick, prevTick) {
        const n = Math.floor(Number.isFinite(nowTick) ? nowTick : 0);
        if (prevTick === null || prevTick === undefined) return 1;
        let d = n - Math.floor(prevTick);
        const loop = Scene22.TICK_LOOP;
        if (d < -loop * 0.5) d += loop;
        if (d > loop * 0.5) d -= loop;
        if (d <= 0) return 1.12;
        return d;
    }

    /**
     * 直前スポーンからの tick 差が大きいほどランダム幅が増える
     */
    _applySequenceAwareJitter(pos, deltaTick, forwardDir, seedA, seedB) {
        const gap = Math.max(0, deltaTick - 0.22);
        const t = THREE.MathUtils.clamp(Math.log1p(gap) / Math.log1p(72), 0, 1);
        const amp = THREE.MathUtils.lerp(14, 420, t);
        const worldUp = new THREE.Vector3(0, 1, 0);
        this._jitterSide.crossVectors(worldUp, forwardDir);
        if (this._jitterSide.lengthSq() < 1e-8) {
            this._jitterSide.crossVectors(new THREE.Vector3(1, 0, 0), forwardDir);
        }
        this._jitterSide.normalize();
        this._jitterUp.crossVectors(forwardDir, this._jitterSide);
        this._jitterUp.normalize();
        const a1 = (this._shardNoise(seedA, seedB, 0.11) - 0.5) * 2;
        const a2 = (this._shardNoise(seedB, seedA, 0.22) - 0.5) * 2;
        const a3 = (this._shardNoise(seedA * 0.31, seedB * 0.29, 0.33) - 0.5) * 2;
        pos.addScaledVector(this._jitterSide, a1 * amp * 0.52);
        pos.addScaledVector(this._jitterUp, a2 * amp * 0.44);
        pos.addScaledVector(worldUp, a3 * amp * 0.26);
    }

    /**
     * ベロシティ（0〜127）→ シリンダ長。弱打ち〜強打ちで差を付ける
     */
    _cylinderLengthFromVelocityMidi(vMidi) {
        const v = THREE.MathUtils.clamp(Number(vMidi) || 0, 0, 127);
        const tLin = v / 127;
        const tLog = Math.log1p(v) / Math.log1p(127);
        const t = THREE.MathUtils.lerp(tLog, tLin, 0.72);
        const lenMin = 88;
        const lenMax = 340;
        return THREE.MathUtils.lerp(lenMin, lenMax, t);
    }

    /**
     * デュレーション（ms）→ 半径（細さ）。極短・極長で差が出過ぎないよう log で圧縮
     */
    _cylinderRadiusFromDurationMs(durationMs) {
        const d = Math.max(8, Number(durationMs) || 180);
        const dMin = 20;
        const dMax = 2400;
        const tLin = THREE.MathUtils.clamp((d - dMin) / (dMax - dMin), 0, 1);
        const tLog = THREE.MathUtils.clamp(Math.log(d / dMin) / Math.log(dMax / dMin), 0, 1);
        const t = THREE.MathUtils.lerp(tLog, tLin, 0.85);
        const radMin = 10;
        const radMax = 34;
        return THREE.MathUtils.lerp(radMin, radMax, t);
    }

    /** 床・壁タイルの目地分割（小さいほど1枚が大きく見える）。drawGroutLines と一致させる */
    static TILE_OVERLAY_DIVISIONS = 26;

    /** OSC の trackNumber が数値化できない／未設定のときは address から拾う */
    static parseTrackNumber(trackNumber, message) {
        if (trackNumber !== undefined && trackNumber !== null && trackNumber !== '') {
            const num = typeof trackNumber === 'string' ? parseInt(trackNumber, 10) : Number(trackNumber);
            if (!Number.isNaN(num)) return num;
        }
        const addr = message && message.address;
        if (typeof addr === 'string') {
            const m = addr.match(/\/track\/(\d+)/i);
            if (m) return parseInt(m[1], 10);
        }
        return null;
    }

    /** Scene16 と同じカメラ距離 */
    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 750;
        cameraParticle.maxDistance = 4850;
        cameraParticle.maxDistanceReset = 4500;
        cameraParticle.minY = -200;
        cameraParticle.maxY = 4500;
        cameraParticle.initializePosition?.();
    }

    /** トラック9スフィアの直近スポーン位置を DOF 等のフォーカスに使う */
    _updateCameraFocusFromSpawns() {
        if (this.track9Spheres.length > 0) {
            const sp = this.track9Spheres[this.track9Spheres.length - 1];
            this._spawnFocusWorld.copy(sp.position);
            return;
        }
        const h = this.roadCameraEyeY ?? 420;
        const laF = THREE.MathUtils.lerp(
            this.roadLookAheadMin ?? 2200,
            this.roadLookAheadMax ?? 5200,
            0.45
        );
        const fz = this._roadCameraZ + laF * 0.45;
        const fx = this.roadCenterOffset(fz);
        this._spawnFocusWorld.set(fx, h * 0.35, fz);
    }

    updateCamera() {
        const cz = this.roadCameraFixedZ ?? 0;
        const oZ = this._terrainOffsetUniform?.value?.y ?? 0;
        const t = this.time ?? 0;

        const yAboveMin = this.roadCameraEyeAboveGroundMin ?? 72;
        const yAboveMax = this.roadCameraEyeAboveGroundMax ?? 520;
        const oSp = this.roadCameraRigOrbitSpeed ?? 0.058;
        const wSp = this.roadCameraRigWobbleSpeed ?? 0.175;
        const orbit = 0.5 + 0.5 * Math.sin(t * oSp);
        const wobble = 0.5 + 0.5 * Math.sin(t * wSp + 2.1);
        let blend = THREE.MathUtils.clamp(orbit * 0.68 + wobble * 0.32, 0, 1);
        blend = blend * blend * (3 - 2 * blend);
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.029 + 0.7);
        blend = THREE.MathUtils.clamp(blend * 0.88 + pulse * 0.12, 0, 1);

        const hAbove = THREE.MathUtils.lerp(yAboveMin, yAboveMax, blend);

        const laMin = this.roadLookAheadMin ?? 2200;
        const laMax = this.roadLookAheadMax ?? 5200;
        const la = THREE.MathUtils.lerp(laMin, laMax, blend);

        const cx = this.roadCenterOffset(cz + oZ);
        const zA = cz + la;
        const xA = this.roadCenterOffset(zA + oZ);

        const sway =
            Math.sin(t * 0.097) * this.roomHalfW * (this.roadCameraSwayAmp ?? 0.085) +
            Math.sin(t * 0.153 + 1.2) * this.roomHalfW * (this.roadCameraSwayAmp ?? 0.085) * 0.35;

        const eyeX = cx + sway;
        const eyeZ = cz;
        const groundY = this.floorTopY + this.getTerrainHeight(eyeX, eyeZ + oZ);
        let h = groundY + hAbove;
        h = THREE.MathUtils.clamp(h, this.floorTopY + 72, this.ceilingY * 0.9);
        this.roadCameraEyeY = h;

        const gAhead = this.floorTopY + this.getTerrainHeight(xA, zA + oZ);
        const lookJ = Math.sin(t * 0.41) * 95 * (0.55 + 0.45 * (1 - blend));
        const lookY = THREE.MathUtils.lerp(gAhead + 55, gAhead + 240, blend) + lookJ;

        const eps = this.roadCameraGroundSampleEps ?? 155;
        const dhx =
            (this.getTerrainHeight(eyeX + eps, eyeZ + oZ) - this.getTerrainHeight(eyeX - eps, eyeZ + oZ)) / (2 * eps);
        const dhz =
            (this.getTerrainHeight(eyeX, eyeZ + eps + oZ) - this.getTerrainHeight(eyeX, eyeZ - eps + oZ)) / (2 * eps);
        this._cameraTerrainUp.set(-dhx, 1, -dhz);
        if (this._cameraTerrainUp.lengthSq() > 1e-10) this._cameraTerrainUp.normalize();
        else this._cameraTerrainUp.set(0, 1, 0);

        const upK = this.roadCameraUpLerp ?? 0.2;
        this._cameraUpSmoothed.lerp(this._cameraTerrainUp, upK);
        this._cameraUpSmoothed.normalize();

        this.camera.up.copy(this._cameraUpSmoothed);
        this.camera.position.set(eyeX, h, eyeZ);
        this.camera.lookAt(xA, lookY, zA);
        this.camera.matrixWorldNeedsUpdate = false;

        const fovLo = this.roadCameraFovLow ?? 51;
        const fovHi = this.roadCameraFovHigh ?? 34;
        const fov = THREE.MathUtils.lerp(fovLo, fovHi, blend);
        if (Math.abs((this.camera.fov ?? 42) - fov) > 0.04) {
            this.camera.fov = fov;
            this.camera.updateProjectionMatrix();
        }

        if (this.sunriseLight) {
            const backZ = cz - 38000;
            const sunY = 650 + h * 0.22;
            this.sunriseLight.position.set(cx * 0.15, sunY, backZ);
            this.sunriseLight.target.position.set(xA * 0.35 + cx * 0.65, gAhead + 120, zA);
        }
    }

    switchCameraRandom() {
        super.switchCameraRandom();
        const cp = this.cameraParticles[this.currentCameraIndex];
        if (cp) {
            const d = cp.position.length();
            if (d < cp.minDistance) {
                cp.position.normalize().multiplyScalar(cp.minDistance + 500);
            }
        }
    }

    /** Scene12 と同系：肉質テクスチャ（カラー＋バンプ）。トラック9スフィア用。 */
    generateFleshTextures() {
        const size = 512;
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size;
        colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');
        cCtx.fillStyle = '#888888';
        cCtx.fillRect(0, 0, size, size);
        for (let i = 0; i < 100; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 20 + Math.random() * 60;
            const grad = cCtx.createRadialGradient(x, y, 0, x, y, r);
            const grayVal = 120 + Math.random() * 80;
            grad.addColorStop(0, `rgba(${grayVal}, ${grayVal}, ${grayVal}, 0.5)`);
            grad.addColorStop(1, 'rgba(136, 136, 136, 0)');
            cCtx.fillStyle = grad;
            cCtx.beginPath();
            cCtx.arc(x, y, r, 0, Math.PI * 2);
            cCtx.fill();
        }
        cCtx.strokeStyle = 'rgba(200, 200, 200, 0.5)';
        for (let i = 0; i < 30; i++) {
            cCtx.lineWidth = 0.8 + Math.random() * 2.0;
            let x = Math.random() * size;
            let y = Math.random() * size;
            cCtx.beginPath();
            cCtx.moveTo(x, y);
            let angle = Math.random() * Math.PI * 2;
            for (let j = 0; j < 40; j++) {
                angle += (Math.random() - 0.5) * 1.2;
                x += Math.cos(angle) * 8;
                y += Math.sin(angle) * 8;
                cCtx.lineTo(x, y);
            }
            cCtx.stroke();
        }
        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size;
        bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');
        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);
        for (let i = 0; i < 500; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 1 + Math.random() * 3;
            const isBump = Math.random() > 0.5;
            bCtx.fillStyle = isBump ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
            bCtx.beginPath();
            bCtx.arc(x, y, r, 0, Math.PI * 2);
            bCtx.fill();
        }
        for (let i = 0; i < 50; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 10 + Math.random() * 30;
            const grad = bCtx.createRadialGradient(x, y, 0, x, y, r);
            const val = Math.random() > 0.5 ? 255 : 0;
            grad.addColorStop(0, `rgba(${val}, ${val}, ${val}, 0.4)`);
            grad.addColorStop(1, 'rgba(128, 128, 128, 0)');
            bCtx.fillStyle = grad;
            bCtx.beginPath();
            bCtx.arc(x, y, r, 0, Math.PI * 2);
            bCtx.fill();
        }
        const colorTex = new THREE.CanvasTexture(colorCanvas);
        colorTex.wrapS = colorTex.wrapT = THREE.RepeatWrapping;
        colorTex.colorSpace = THREE.SRGBColorSpace;
        const bumpTex = new THREE.CanvasTexture(bumpCanvas);
        bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
        bumpTex.colorSpace = THREE.LinearSRGBColorSpace;
        return { map: colorTex, bumpMap: bumpTex };
    }

    applyEnvMapToMaterials(envMap, wallMat, floorMat) {
        wallMat.envMap = envMap;
        floorMat.envMap = envMap;
    }

    ensureUv2(geometry) {
        const uv = geometry.attributes.uv;
        if (!geometry.attributes.uv2) {
            geometry.setAttribute('uv2', uv.clone());
        }
    }

    /** 道の +Z 進行速度（world/s）。地形 dz・論理 _roadCameraZ・ピアノロールの流れと必ず同一 */
    _getRoadForwardSpeed() {
        const o = this.roadWorldForwardSpeed;
        if (o != null && Number.isFinite(o)) return o;
        return this.roadCameraSpeed * this.roadCameraIdleDriftScale + (this.roadCameraMinForward ?? 0);
    }

    /**
     * シーケンス Z：論理進行 _roadCameraZ ＋ ノート刻み（laneIndex×step）。先読みは pianoRollAheadOfCameraZ のみ。
     */
    _pianoRollLaneZ() {
        const ahead = this.pianoRollAheadOfCameraZ ?? 0;
        const step = this.pianoRollStepZ ?? 440;
        return this._roadCameraZ + ahead + this._pianoRollLaneIndex * step;
    }

    /**
     * ピアノロールの「次の刻み」Z を返し、刻み番号だけ進める。
     */
    _advancePianoRollLaneZ() {
        const z = this._pianoRollLaneZ();
        this._pianoRollLaneIndex += 1;
        return THREE.MathUtils.clamp(z, -this.roomHalfD * 0.92, this.roomHalfD * 0.92);
    }

    /**
     * トラック9：道に沿い +Z に順番。横位置は軽いノイズでレーン幅内。
     */
    _sampleSpawnPositionPianoRoll(out) {
        const n = this._track5SphereSpawnIndex++;
        const laneHalf = this.roadHalfWidth * 0.74;
        const xRaw = (this._shardNoise(n * 0.29, this.time * 0.09, 1.85) - 0.5) * 2 * laneHalf;
        const z = this._advancePianoRollLaneZ();
        const cx = this.roadCenterOffset(z);
        const x = THREE.MathUtils.clamp(cx + xRaw, -this.roomHalfW * 0.62, this.roomHalfW * 0.62);
        const th = this._terrainHeight(x, z);
        const yBase = this.floorTopY + th + 140;
        const yJ = (this._shardNoise(n * 0.17, 2.2, 0.41) - 0.5) * 220;
        const y = THREE.MathUtils.clamp(
            yBase + yJ,
            this.floorTopY + th + 55,
            this.ceilingY * 0.44
        );
        out.set(x, y, z);
    }

    _terrainRnd(x, y) {
        const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        return s - Math.floor(s);
    }

    _terrainSmooth(x, y) {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const fx = x - x0;
        const fy = y - y0;
        const u = fx * fx * (3 - 2 * fx);
        const v = fy * fy * (3 - 2 * fy);
        const a = this._terrainRnd(x0, y0);
        const b = this._terrainRnd(x0 + 1, y0);
        const c = this._terrainRnd(x0, y0 + 1);
        const d = this._terrainRnd(x0 + 1, y0 + 1);
        return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
    }

    _terrainFbm(x, y, octaves) {
        let amp = 0.5;
        let f = 0;
        let xx = x;
        let yy = y;
        for (let o = 0; o < octaves; o++) {
            f += this._terrainSmooth(xx, yy) * amp;
            xx *= 2.02;
            yy *= 2.0;
            amp *= 0.5;
        }
        return f;
    }

    /**
     * GPU シェーダー（TerrainSampler）と完全一致する地形高さ。
     * シーン座標を受け取り、内部で _roadCameraZ オフセットを加味してワールド座標に変換。
     */
    getTerrainHeight(sceneX, sceneZ) {
        return sseTerrainHeight(sceneX, sceneZ);
    }

    /** 既存呼び出し向け */
    _terrainHeight(x, z) {
        return this.getTerrainHeight(x, z);
    }

    /**
     * 道の中心線のワールド X オフセット（左右に蛇行）。worldZ に連続。
     */
    roadCenterOffset(worldZ) {
        if (this._emptySceneFlatGround) return 0;
        const a1 = this.roadCurveAmp1 ?? 440;
        const k1 = this.roadCurveFreq1 ?? 0.00036;
        const a2 = this.roadCurveAmp2 ?? 190;
        const k2 = this.roadCurveFreq2 ?? 0.00084;
        const ph2 = this.roadCurvePhase2 ?? 1.85;
        return a1 * Math.sin(worldZ * k1) + a2 * Math.sin(worldZ * k2 + ph2);
    }

    /** d(roadCenterOffset)/dz — 接線のヨー用 */
    roadCenterOffsetD(worldZ) {
        if (this._emptySceneFlatGround) return 0;
        const a1 = this.roadCurveAmp1 ?? 440;
        const k1 = this.roadCurveFreq1 ?? 0.00036;
        const a2 = this.roadCurveAmp2 ?? 190;
        const k2 = this.roadCurveFreq2 ?? 0.00084;
        const ph2 = this.roadCurvePhase2 ?? 1.85;
        return a1 * k1 * Math.cos(worldZ * k1) + a2 * k2 * Math.cos(worldZ * k2 + ph2);
    }

    /**
     * --- 無限 Terrain（波打ち防止の要点）---
     * (1) チャンク生成: 本メソッド → BufferGeometry。頂点 Y は _fillTerrainChunkHeightsFromWorld で world サンプルのみ。
     * (2) world 高さ: getTerrainHeight(worldX, worldZ) — noise(x,z+time) は使わない。
     * (3) 毎フレーム: _updateTerrainChunksScroll のみ（mesh.position.z += 速度）。頂点は触らない。
     * (4) リサイクル: 手前に抜けたチャンクを奥へ newNear へ移し、そのときだけ _fillTerrainChunkHeightsFromWorld を再実行。
     * 境界連続: 隣接チャンクは同じ getTerrainHeight で worldZ が繋がるよう contiguous に配置。
     * カメラは roadCameraFixedZ 固定、地形が -Z に流れる見え方。
     */
    _createTerrainChunkGeometry(roadW, chunkDepth, segX, segZ, worldZNear) {
        const vx = segX + 1;
        const vz = segZ + 1;
        const pos = new Float32Array(vx * vz * 3);
        const uv = new Float32Array(vx * vz * 2);
        const indices = [];
        let pi = 0;
        let ui = 0;
        for (let iz = 0; iz <= segZ; iz++) {
            for (let ix = 0; ix <= segX; ix++) {
                const u = ix / segX;
                const v = iz / segZ;
                const lx = (u - 0.5) * roadW;
                const lz = v * chunkDepth;
                pos[pi++] = lx;
                pos[pi++] = 0;
                pos[pi++] = lz;
                uv[ui++] = u;
                uv[ui++] = v;
            }
        }
        for (let iz = 0; iz < segZ; iz++) {
            for (let ix = 0; ix < segX; ix++) {
                const a = iz * vx + ix;
                const b = a + 1;
                const c = a + vx;
                const d = c + 1;
                indices.push(a, c, b, b, c, d);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.setIndex(indices);
        this._fillTerrainChunkHeightsFromWorld(geo, worldZNear);
        return geo;
    }

    /**
     * 頂点の X/Y を world で設定。worldX = グリッド lx + roadCenterOffset(worldZ)、Y は getTerrainHeight。
     * リサイクル時のみ呼ぶ想定（毎フレームは呼ばない）。
     */
    _fillTerrainChunkHeightsFromWorld(geometry, worldZNear) {
        const pos = geometry.attributes.position;
        const uv = geometry.attributes.uv;
        const roadW = this.roadHalfWidth * 2;
        for (let i = 0; i < pos.count; i++) {
            const lz = pos.getZ(i);
            const worldZ = worldZNear + lz;
            const u = uv.getX(i);
            const lxGrid = (u - 0.5) * roadW;
            const cx = this.roadCenterOffset(worldZ);
            const worldX = lxGrid + cx;
            pos.setX(i, worldX);
            pos.setY(i, this.getTerrainHeight(worldX, worldZ));
        }
        pos.needsUpdate = true;
        geometry.computeVertexNormals();
    }

    /**
     * 全チャンクを -Z に進め、手前に抜けたものを奥へ回して高さだけ再生成する。
     */
    _updateTerrainChunksScroll(deltaTime) {
        if (!this._terrainChunks.length) return;
        const v = this._getRoadForwardSpeed();
        const dz = -v * deltaTime;
        for (const ch of this._terrainChunks) {
            ch.mesh.position.z += dz;
        }
        const camZ = this.roadCameraFixedZ ?? 0;
        const margin = this.terrainChunkRecycleMargin ?? 2200;
        const d = this._terrainChunkDepth;
        this._terrainChunks.sort((a, b) => a.mesh.position.z - b.mesh.position.z);
        while (this._terrainChunks.length && this._terrainChunks[0].mesh.position.z + d < camZ - margin) {
            const front = this._terrainChunks.shift();
            const back = this._terrainChunks[this._terrainChunks.length - 1];
            const newNear = back.mesh.position.z + d;
            front.mesh.position.z = newNear;
            this._fillTerrainChunkHeightsFromWorld(front.geometry, newNear);
            this._terrainChunks.push(front);
        }

        this._applyRoadScrollDeltaToWorldObjects(dz);
    }

    /**
     * カメラ Z は固定のまま道床メッシュだけ z を進めるため、同じワールド Z に置いたオブジェクトは
     * 毎フレーム同じ dz を足して地面と同期する（未適用だと床だけ手前に流れる）。
     */
    _applyRoadScrollDeltaToWorldObjects(scrollDz) {
        if (Math.abs(scrollDz) < 1e-12) return;

        if (this.shardGroup) {
            this.shardGroup.position.z += scrollDz;
        }

        this._trailHeadPosShard.z += scrollDz;
        this._trailHeadPosCylinder.z += scrollDz;
        this._trailHeadPos.z += scrollDz;
        this._lastShardPos.z += scrollDz;
        this._lastCylinderWorldPos.z += scrollDz;

        if (this.track9Spheres && this.track9Spheres.length) {
            for (const sp of this.track9Spheres) {
                sp.position.z += scrollDz;
            }
        }

        if (this.cylinders && this.cylinders.length && this.cylinderInstMesh) {
            const now = performance.now();
            for (const c of this.cylinders) {
                c.localPos.z += scrollDz;
                const age = now - c.spawnTime;
                const grow = this._growScale01(age, c.growInMs ?? this.cylinderGrowInMs);
                this._cylinderScaleTemp.set(
                    c.baseRadius * grow,
                    c.baseLength * grow,
                    c.baseRadius * grow
                );
                this._cylinderMatrixTemp.compose(c.localPos, c.localQuat, this._cylinderScaleTemp);
                this.cylinderInstMesh.setMatrixAt(c.slotIndex, this._cylinderMatrixTemp);
            }
            this.cylinderInstMesh.instanceMatrix.needsUpdate = true;
        }

        if (this._redBurstActive && this._redBurstPositions) {
            const n = this.redBurstParticleCount;
            for (let i = 0; i < n; i++) {
                this._redBurstPositions[i * 3 + 2] += scrollDz;
            }
        }
    }

    /** XZ 平面グリッド（Z 方向非対称）。y=0 で VS 変位前提。 */
    _buildTerrainPlane(width, zMin, zMax, segX, segZ) {
        const depth = zMax - zMin;
        const vx = segX + 1;
        const vz = segZ + 1;
        const pos = new Float32Array(vx * vz * 3);
        const nor = new Float32Array(vx * vz * 3);
        const indices = [];
        let pi = 0;
        let ni = 0;
        for (let iz = 0; iz <= segZ; iz++) {
            const v = iz / segZ;
            const z = zMin + v * depth;
            for (let ix = 0; ix <= segX; ix++) {
                const u = ix / segX;
                pos[pi++] = (u - 0.5) * width;
                pos[pi++] = 0;
                pos[pi++] = z;
                nor[ni++] = 0;
                nor[ni++] = 1;
                nor[ni++] = 0;
            }
        }
        for (let iz = 0; iz < segZ; iz++) {
            for (let ix = 0; ix < segX; ix++) {
                const a = iz * vx + ix;
                const b = a + 1;
                const c = a + vx;
                const d = c + 1;
                indices.push(a, c, b, b, c, d);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        geo.setIndex(indices);
        return geo;
    }

    /** 道床メッシュは張らない（空グループのみ。dispose／フォーカス用） */
    buildRoom() {
        this.roomGroup = new THREE.Group();
        this._terrainChunks = [];
        this._terrainChunkDepth = 0;
        this._terrainFloorMat = null;
        this.ceilingMesh = null;
        this.scene.add(this.roomGroup);
    }

    /**
     * 北壁（カメラ側から見て奥）に Helvetiker 風 extruded テキスト。厚み＋ベベル。艶・環境反射強め。
     */
    _initWallMatteBlack3DText() {
        if (this.wallTitleGroup) return Promise.resolve();

        return new Promise((resolve) => {
            const loader = new FontLoader();
            loader.load(
                helvetikerFontUrl,
                (font) => {
                    const mat = new THREE.MeshStandardMaterial({
                        color: 0x101318,
                        roughness: 0.22,
                        metalness: 0.22,
                        envMapIntensity: 1.05,
                        clearcoat: 0.88,
                        clearcoatRoughness: 0.14,
                        flatShading: false,
                        fog: true
                    });
                    this._wallTitleMaterial = mat;

                    const group = new THREE.Group();
                    const hd = this.roomHalfD;
                    const wallH = this.ceilingY - this.floorTopY;
                    const wallCenterY = this.floorTopY + wallH * 0.5;
                    /** 内壁は z = -roomHalfD 付近。手前に少し浮かせて Z-fight 回避 */
                    const zText = -hd + 95;

                    /** height = Z 方向の押し出し量。ベベルで縁が立体的に見える */
                    const addLine = (text, size, extrudeDepth, y) => {
                        const bt = Math.max(3, size * 0.05);
                        const bs = Math.max(2.2, size * 0.038);
                        const geo = new TextGeometry(text, {
                            font,
                            size,
                            height: extrudeDepth,
                            curveSegments: 12,
                            bevelEnabled: true,
                            bevelThickness: bt,
                            bevelSize: bs,
                            bevelOffset: 0,
                            bevelSegments: 4
                        });
                        geo.computeBoundingBox();
                        const mesh = new THREE.Mesh(geo, mat);
                        const bb = geo.boundingBox;
                        mesh.position.set(-0.5 * (bb.max.x + bb.min.x), y, 0);
                        /** 壁に落ちるギザ影・コーナー付近の縞を減らすためテキストは影を落とさない */
                        mesh.castShadow = false;
                        mesh.receiveShadow = true;
                        group.add(mesh);
                        return bb.max.y - bb.min.y;
                    };

                    let y = 180;
                    const titleH = addLine('mathym | Xenomist', 280, 118, y);
                    y -= titleH * 1.05 + 140;

                    const bodyLines = [
                        'Real-time WebGL (Three.js). Live OSC / MIDI maps tracks to GPU effects:',
                        'instanced debris, cylinders, spheres; PBR concrete room, HDR environment.',
                        'Pipeline: SSAO, bloom, DOF, ACES tone map, film grain. Procedural noise fields,',
                        'audio-reactive spawn, instancing, and camera focus driven by scene activity.'
                    ];
                    for (const line of bodyLines) {
                        const h = addLine(line, 68, 34, y);
                        y -= h * 1.12 + 28;
                    }

                    group.position.set(0, wallCenterY + wallH * 0.02, zText);
                    this.wallTitleGroup = group;
                    this.scene.add(group);
                    resolve();
                },
                undefined,
                () => {
                    resolve();
                }
            );
        });
    }

    _shardNoise(x, y, z) {
        const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
        return n - Math.floor(n);
    }

    _sampleCurlNoiseVector(pos, time, freq = 0.001, eps = 7.5) {
        const px = pos.x * freq;
        const py = pos.y * freq;
        const pz = pos.z * freq;
        const t = time * 0.16;
        const e = eps * freq;
        const n = (x, y, z) => this._shardNoise(x + t * 0.71, y - t * 0.53, z + t * 0.37);
        const dx = n(px + e, py, pz) - n(px - e, py, pz);
        const dy = n(px, py + e, pz) - n(px, py - e, pz);
        const dz = n(px, py, pz + e) - n(px, py, pz - e);
        return new THREE.Vector3(dy - dz, dz - dx, dx - dy);
    }

    /** 多オクターブ＋座標オフセットで単純な中心周りの渦を避ける */
    _sampleCurlNoiseVectorCylinderBlend(pos, time, freq, eps) {
        const p = this._curlCylPosScratch.copy(pos).add(this._cylinderCurlFieldOffset);
        const a = this._sampleCurlNoiseVector(p, time, freq, eps);
        const b = this._sampleCurlNoiseVector(p, time + 19.3, freq * 2.15, eps * 0.92);
        const c = this._sampleCurlNoiseVector(p, time + 41.7, freq * 0.48, eps * 1.06);
        if (a.lengthSq() > 1e-12) a.normalize();
        if (b.lengthSq() > 1e-12) b.normalize();
        if (c.lengthSq() > 1e-12) c.normalize();
        a.multiplyScalar(0.48);
        b.multiplyScalar(0.32);
        c.multiplyScalar(0.2);
        a.add(b).add(c);
        if (a.lengthSq() > 1e-12) a.normalize();
        return a;
    }

    _sampleCurlNoiseVectorInto(out, x, y, z, time, freq = 0.001, eps = 7.5, seed = 0) {
        const px = x * freq;
        const py = y * freq;
        const pz = z * freq;
        const t = time * 0.16;
        const e = eps * freq;
        const n = (xx, yy, zz) => this._shardNoise(
            xx + t * (0.71 + seed * 0.13),
            yy - t * (0.53 - seed * 0.09),
            zz + t * (0.37 + seed * 0.11)
        );
        const dx = n(px + e, py, pz) - n(px - e, py, pz);
        const dy = n(px, py + e, pz) - n(px, py - e, pz);
        const dz = n(px, py, pz + e) - n(px, py, pz - e);
        out.set(dy - dz, dz - dx, dx - dy);
        return out;
    }

    _composeTrailNoiseQuat(seed) {
        const t = this.time;
        const nX = this._shardNoise(seed * 0.61, t * 0.11, 2.3) * 2 - 1;
        const nY = this._shardNoise(3.7, seed * 0.47, t * 0.09) * 2 - 1;
        const nZ = this._shardNoise(t * 0.08, 6.1, seed * 0.53) * 2 - 1;
        return new THREE.Quaternion().setFromEuler(
            new THREE.Euler(nX * this._trailPitchAmp, nY * this._trailYawAmp, nZ * this._trailRollAmp, 'YXZ')
        );
    }

    /**
     * @param {object|boolean|null} [yVary] truthy のとき赤シリンダー用軌道（フル3Dカール。Y を yTarget で潰さない）
     */
    _updateTrailHeadSingle(pos, dir, deltaTime, timeOffset, speed, curlFreq, curlStrength, yVary = null) {
        const dt = Math.min(Math.max(deltaTime, 0), 0.05);
        const isCylinderTrail = !!yVary;
        const curl = isCylinderTrail
            ? this._sampleCurlNoiseVectorCylinderBlend(
                  pos,
                  this.time + timeOffset,
                  curlFreq,
                  this._trailCurlEpsCylinder ?? 7.5
              )
            : this._sampleCurlNoiseVector(pos, this.time + timeOffset, curlFreq);
        if (curl.lengthSq() > 1e-9) curl.normalize();

        dir.addScaledVector(curl, curlStrength * dt);
        const pullMag = isCylinderTrail ? (this._trailCenterPullCylinder ?? 0) : this._trailCenterPull;
        if (pullMag > 1e-6) {
            const toCenter = this._trailCenter.clone().sub(pos);
            if (isCylinderTrail) toCenter.y = 0;
            const centerDist = Math.max(1, toCenter.length());
            if (toCenter.lengthSq() > 1e-12) {
                toCenter.normalize();
                const centerPull = pullMag * THREE.MathUtils.clamp(centerDist / 2400, 0.08, 1.0);
                dir.addScaledVector(toCenter, centerPull * dt);
            }
        }
        // シリンダーは Y 成分もカール任せ（減衰・yTarget lerp 禁止＝横円環の主因だった）
        if (!isCylinderTrail) dir.y *= 0.92;
        dir.normalize();

        pos.addScaledVector(dir, speed * dt);

        const xLim = this.roomHalfW * 0.55;
        const zLim = this.roomHalfD * 0.55;
        pos.x = THREE.MathUtils.clamp(pos.x, -xLim, xLim);
        pos.z = THREE.MathUtils.clamp(pos.z, -zLim, zLim);
        const yMin = this.floorTopY + 130;
        const yMax = this.ceilingY * 0.43;

        if (isCylinderTrail) {
            pos.y = THREE.MathUtils.clamp(pos.y, yMin, yMax);
        } else {
            const base =
                (this._shardNoise((this.time + timeOffset) * 0.08, 9.1, 4.2) - 0.5) * 620;
            const yTarget = this._trailCenter.y + base;
            pos.y = THREE.MathUtils.clamp(
                THREE.MathUtils.lerp(pos.y, yTarget, 0.38 * dt * 60),
                yMin,
                yMax
            );
        }
    }

    _updateTrailHeadMotion(deltaTime) {
        this._updateTrailHeadSingle(
            this._trailHeadPosShard,
            this._trailHeadDirShard,
            deltaTime,
            0.0,
            this._trailSpeedShard ?? this._trailSpeed,
            this._trailCurlFreqShard ?? this._trailCurlFreq,
            this._trailCurlStrengthShard ?? this._trailCurlStrength
        );
        this._updateTrailHeadSingle(
            this._trailHeadPosCylinder,
            this._trailHeadDirCylinder,
            deltaTime,
            37.0,
            this._trailSpeedCylinder ?? this._trailSpeed,
            this._trailCurlFreqCylinder ?? this._trailCurlFreq,
            this._trailCurlStrengthCylinder ?? this._trailCurlStrength,
            true
        );

        this._trailHeadPos.copy(this._trailHeadPosShard);
        this._trailHeadDir.copy(this._trailHeadDirShard);
        this._lastShardPos.copy(this._trailHeadPosShard);
        this._lastCylinderWorldPos.copy(this._trailHeadPosCylinder);
    }

    /** 0–127 以外に OSC が 0–1 float を送る場合も正規化 */
    normalizeMidiVelocity(v) {
        if (v === undefined || v === null) return 127;
        const n = Number(v);
        if (!Number.isFinite(n)) return 127;
        if (n >= 0 && n <= 1) return Math.round(n * 127);
        return THREE.MathUtils.clamp(Math.round(n), 0, 127);
    }

    /** 0–127 → ヒートマップ色（青→赤、velocity に準じる） */
    _velocityMidiToHeatmapColor(vMidi, out) {
        const t = THREE.MathUtils.clamp(vMidi / 127, 0, 1);
        out.setHSL(THREE.MathUtils.lerp(0.67, 0.0, t), 0.92, THREE.MathUtils.lerp(0.38, 0.52, t));
    }

    /**
     * カールノイズ場から方向を取り、部屋内のスポーン座標に射影する。
     */
    _sampleSpawnPositionFromCurlNoise(out) {
        const n = this._track5SphereSpawnIndex++;
        const t = this.time;
        const sx = Math.sin(n * 0.73 + t * 0.42) * 420;
        const sy = this.floorTopY + 400 + Math.cos(n * 0.51 + t * 0.31) * 320;
        const sz = Math.cos(n * 0.61 + t * 0.38) * 420;
        const sample = new THREE.Vector3(sx, sy, sz);
        const curl = this._sampleCurlNoiseVector(sample, t, 0.0028, 8.0);
        if (curl.lengthSq() < 1e-10) {
            curl.set(0, 1, 0);
        } else {
            curl.normalize();
        }
        const yMin = this.floorTopY + 220;
        const yMax = this.ceilingY * 0.4;
        const midY = (yMin + yMax) * 0.5;
        this._track9WorldCenter.set(0, midY, 0);
        const ax = this.roomHalfW * 0.58;
        const ay = (yMax - yMin) * 0.48;
        const az = this.roomHalfD * 0.58;
        out.set(
            this._track9WorldCenter.x + curl.x * ax,
            this._track9WorldCenter.y + curl.y * ay,
            this._track9WorldCenter.z + curl.z * az
        );
        const mx = this.roomHalfW * 0.62 - 140;
        const mz = this.roomHalfD * 0.62 - 140;
        out.x = THREE.MathUtils.clamp(out.x, -mx, mx);
        out.z = THREE.MathUtils.clamp(out.z, -mz, mz);
        const th = this._terrainHeight(out.x, out.z);
        out.y = THREE.MathUtils.clamp(
            this.floorTopY + th + 200 + curl.y * 95,
            this.floorTopY + th + 55,
            this.ceilingY * 0.46
        );
    }

    /** トラック9：従来のチャコール調を保ちつつ近い範囲で濃淡ランダム */
    _applyTrack9SphereRandomTint(material) {
        material.color.copy(this._track9SphereColorAtMax);
        material.color.offsetHSL(0, (Math.random() - 0.5) * 0.035, (Math.random() - 0.5) * 0.07);
        material.emissive.copy(this._track9SphereEmissiveAtMax);
        material.emissive.offsetHSL(0, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.09);
        material.emissiveIntensity = THREE.MathUtils.clamp(0.17 + (Math.random() - 0.5) * 0.08, 0.12, 0.24);
    }

    /** シリンダー：蛍光っぽい緑の濃淡（instanceColor、マテは白＋エミッシブ） */
    _randomCylinderTintNearBase(out) {
        out.setHex(0x39ff14);
        out.offsetHSL((Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.1);
    }

    /** ベロシティでスチール〜シルバーの金属トーン（暗→明） */
    velocityToMetalShardColor(velocity, target, seedForVariation = 0) {
        const t = THREE.MathUtils.clamp(velocity / 127, 0, 1);
        if (t < 0.5) target.copy(this._shardMetalDark).lerp(this._shardMetalMid, t / 0.5);
        else target.copy(this._shardMetalMid).lerp(this._shardMetalBright, (t - 0.5) / 0.5);
        const n = (this._shardNoise(seedForVariation * 0.41, 2.1, 0.7) - 0.5) * 0.07;
        target.r = THREE.MathUtils.clamp(target.r + n, 0.08, 1);
        target.g = THREE.MathUtils.clamp(target.g + n, 0.08, 1);
        target.b = THREE.MathUtils.clamp(target.b + n, 0.08, 1);
    }

    /** 部屋内のノイズベース目標座標（金属片の「生える場所」のひとつ） */
    sampleNoisePosition() {
        const s = this._shardSeed + this._snakeIndex * 0.019;
        const u = this._shardNoise(s * 0.002, 2.3, 4.1) * 2 - 1;
        const v = this._shardNoise(1.1, s * 0.002, 2.3) * 2 - 1;
        const w = this._shardNoise(1.1, 2.3, s * 0.002) * 2 - 1;
        const hw = this.roomHalfW * 0.58;
        const hd = this.roomHalfD * 0.58;
        const ymin = this.floorTopY + 140;
        const ymax = this.ceilingY * 0.44;
        return new THREE.Vector3(u * hw, ymin + (w * 0.5 + 0.5) * (ymax - ymin), v * hd);
    }

    _allocShardSlot() {
        if (this.shards.length >= this.maxShards) {
            const old = this.shards.shift();
            this._clearShardSlot(old.slotIndex);
            return old.slotIndex;
        }
        return this._shardFreeSlots.pop();
    }

    /**
     * 常時移動する残像ヘッド位置に金属片を生成（OSC はトラック9）。
     * durationMs: デュレーション（ms）でスケール。velocity: 金属色の明るさ。
     */
    spawnMetalShardFromTrack5(velocity, durationMs = 180) {
        if (!this.shardGroup || !this._metalShardMaterial || !this.shardInstMesh) return;

        const vMidi = this.normalizeMidiVelocity(velocity);

        const si = this._snakeIndex;
        const newPos = this._spawnWorldPosTemp;
        newPos.copy(this._trailHeadPosShard);
        const headRight = new THREE.Vector3().crossVectors(this._trailHeadDirShard, new THREE.Vector3(0, 1, 0));
        if (headRight.lengthSq() > 1e-8) {
            headRight.normalize();
            const lateral = (this._shardNoise(si * 0.63, this.time * 0.11, 1.9) - 0.5) * 130;
            newPos.addScaledVector(headRight, lateral);
        }
        const vertical = (this._shardNoise(2.7, si * 0.29, this.time * 0.09) - 0.5) * 95;
        newPos.y += vertical;
        newPos.x = THREE.MathUtils.clamp(newPos.x, -this.roomHalfW * 0.62, this.roomHalfW * 0.62);
        newPos.z = THREE.MathUtils.clamp(newPos.z, -this.roomHalfD * 0.62, this.roomHalfD * 0.62);
        newPos.y = THREE.MathUtils.clamp(newPos.y, this.floorTopY + 90, this.ceilingY * 0.46);

        const fwd = this._trailHeadDirShard.clone().normalize();
        const qSnake = new THREE.Quaternion();
        const zAxis = new THREE.Vector3(0, 0, 1);
        if (Math.abs(zAxis.dot(fwd)) > 0.998) {
            qSnake.setFromAxisAngle(new THREE.Vector3(1, 0, 0), fwd.z < 0 ? Math.PI : 0);
        } else {
            qSnake.setFromUnitVectors(zAxis, fwd);
        }
        const roll = (this._shardNoise(si, 7.1, this.time * 0.05) - 0.5) * Math.PI * 0.32;
        const qRoll = new THREE.Quaternion().setFromAxisAngle(fwd, roll);
        const qN = this._composeTrailNoiseQuat(si * 0.71 + this.time * 0.13);
        const qFinal = qSnake.clone().multiply(qRoll).multiply(qN);

        this._lastShardPos.copy(newPos);
        this._snakeIndex++;

        const dur = Math.max(1, Number(durationMs) || 180);
        const durN = THREE.MathUtils.clamp(dur / 750, 0.06, 1.65);
        const s = this.shardCylinderVisualScale ?? 1;
        const r =
            (18 + 118 * durN) *
            (0.94 + 0.06 * this._shardNoise(si * 0.7, 0.2, 0.1)) *
            s;

        const slotIndex = this._allocShardSlot();
        if (slotIndex === undefined) return;

        this.velocityToMetalShardColor(vMidi, this._shardHeatColor, si);
        this.shardInstMesh.setColorAt(slotIndex, this._shardHeatColor);
        if (this.shardInstMesh.instanceColor) {
            this.shardInstMesh.instanceColor.needsUpdate = true;
        }

        this._shardPosTemp.copy(newPos);
        this.shardGroup.updateMatrixWorld(true);
        this.shardGroup.worldToLocal(this._shardPosTemp);
        const shapeSeed = this._shardNoise(si * 0.37, 6.9, 2.4);
        const ex = 0.62 + 0.95 * this._shardNoise(shapeSeed, si * 0.19, 1.7);
        const ey = 0.62 + 0.95 * this._shardNoise(si * 0.11, shapeSeed, 2.9);
        const ez = 0.62 + 0.95 * this._shardNoise(3.1, si * 0.23, shapeSeed);
        const invAvg = 3 / (ex + ey + ez);
        const sx = r * ex * invAvg;
        const sy = r * ey * invAvg;
        const sz = r * ez * invAvg;
        this._shardScaleTemp.set(sx * 0.02, sy * 0.02, sz * 0.02);
        this._shardMatrixTemp.compose(this._shardPosTemp, qFinal, this._shardScaleTemp);
        this.shardInstMesh.setMatrixAt(slotIndex, this._shardMatrixTemp);
        this.shardInstMesh.instanceMatrix.needsUpdate = true;
        if (this._shardOpacityAttr) {
            this._shardOpacityAttr.array[slotIndex] = 1;
            this._shardOpacityAttr.needsUpdate = true;
        }

        this.shards.push({
            slotIndex,
            spawnTime: performance.now(),
            localPos: this._shardPosTemp.clone(),
            localQuat: qFinal.clone(),
            baseScaleVec: new THREE.Vector3(sx, sy, sz),
            growInMs: this._growInMsFromDuration(dur, this.shardGrowInMs)
        });
        this._spawnAmbientParticlesBurst(newPos, this.ambientParticlesPerShard);
    }

    /** 非表示：スケール0（ドローコスト抑制） */
    _clearShardSlot(slotIndex) {
        if (!this.shardInstMesh || slotIndex < 0 || slotIndex >= this.maxShards) return;
        this._shardPosTemp.set(0, -1e6, 0);
        this._shardQuatTemp.identity();
        this._shardScaleTemp.set(0, 0, 0);
        this._shardMatrixTemp.compose(this._shardPosTemp, this._shardQuatTemp, this._shardScaleTemp);
        this.shardInstMesh.setMatrixAt(slotIndex, this._shardMatrixTemp);
        if (this._shardOpacityAttr) {
            this._shardOpacityAttr.array[slotIndex] = 0;
            this._shardOpacityAttr.needsUpdate = true;
        }
        this.shardInstMesh.instanceMatrix.needsUpdate = true;
    }

    /** 寿命超えの破片を削除（毎フレーム） */
    pruneExpiredShards() {
        if (!this.shards.length || !this.shardGroup) return;
        const now = performance.now();
        const life = this.shardLifetimeMs;
        let matrixDirty = false;
        for (let i = this.shards.length - 1; i >= 0; i--) {
            const s = this.shards[i];
            if (now - s.spawnTime > life) {
                this._clearShardSlot(s.slotIndex);
                this._shardFreeSlots.push(s.slotIndex);
                this.shards.splice(i, 1);
                matrixDirty = true;
            }
        }
        while (this.shards.length > this.maxShards) {
            const old = this.shards.shift();
            this._clearShardSlot(old.slotIndex);
            this._shardFreeSlots.push(old.slotIndex);
            matrixDirty = true;
        }
        if (matrixDirty && this.shardInstMesh) {
            this.shardInstMesh.instanceMatrix.needsUpdate = true;
        }
    }

    initMetalShardsSystem() {
        this.shardGroup = new THREE.Group();
        this.shardGroup.position.set(0, 0, 0);
        this.scene.add(this.shardGroup);

        const envTex = this.cubeRenderTarget ? this.cubeRenderTarget.texture : this.scene.environment;
        /** 共有1マテ（個体差は instanceColor）。金属色用に metalness 高め */
        this._metalShardMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.88,
            roughness: 0.32,
            envMap: envTex,
            envMapIntensity: 0.92 * (0.55 + 0.45 * (this.sceneLightingScale ?? 1)),
            emissive: 0x000000,
            emissiveIntensity: 0,
            opacity: 1,
            fog: true
        });
        Scene22._applyInstanceOpacityShader(this._metalShardMaterial);

        const shardGeo = new THREE.TetrahedronGeometry(1, 0);
        this._shardOpacityAttr = Scene22._attachInstanceOpacityAttribute(shardGeo, this.maxShards);
        this.shardInstMesh = new THREE.InstancedMesh(shardGeo, this._metalShardMaterial, this.maxShards);
        this.shardInstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.shardInstMesh.frustumCulled = false;
        this.shardInstMesh.castShadow = true;
        this.shardInstMesh.receiveShadow = true;
        this.shardGroup.add(this.shardInstMesh);

        this._shardFreeSlots = [];
        const hideColor = new THREE.Color(0x000000);
        for (let i = this.maxShards - 1; i >= 0; i--) {
            this._shardFreeSlots.push(i);
        }
        for (let i = 0; i < this.maxShards; i++) {
            this._clearShardSlot(i);
            this.shardInstMesh.setColorAt(i, hideColor);
        }
        if (this.shardInstMesh.instanceColor) {
            this.shardInstMesh.instanceColor.needsUpdate = true;
        }
        this.shardInstMesh.instanceMatrix.needsUpdate = true;
    }

    initRedCylinderSystem() {
        /** 個体色は instanceColor（濃淡）。親グループなし＝ワールド座標で行列（cable 追従なし） */
        this._redCylinderMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0x00ff88,
            emissiveIntensity: 0.38,
            metalness: 0,
            roughness: 0.42,
            /** フォグ無効だと壁・床と霞のかかり方が違い、浮いて見えやすい */
            fog: true,
            opacity: 1
        });
        Scene22._applyRedCylinderShader(this._redCylinderMaterial);

        const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 6);
        this._cylinderOpacityAttr = Scene22._attachInstanceOpacityAttribute(cylGeo, this.maxCylinders);
        this.cylinderInstMesh = new THREE.InstancedMesh(cylGeo, this._redCylinderMaterial, this.maxCylinders);
        this.cylinderInstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.cylinderInstMesh.frustumCulled = false;
        this.cylinderInstMesh.castShadow = true;
        this.cylinderInstMesh.receiveShadow = true;
        this.scene.add(this.cylinderInstMesh);

        this._cylinderFreeSlots = [];
        for (let i = this.maxCylinders - 1; i >= 0; i--) {
            this._cylinderFreeSlots.push(i);
        }
        for (let i = 0; i < this.maxCylinders; i++) {
            this._clearCylinderSlot(i);
            this.cylinderInstMesh.setColorAt(i, this._instanceWhite);
        }
        if (this.cylinderInstMesh.instanceColor) {
            this.cylinderInstMesh.instanceColor.needsUpdate = true;
        }
        this.cylinderInstMesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * 赤いシリンダ（OSC トラック5）。常時移動する残像ヘッド位置で生成。
     * ベロシティ→長さ、デュレーション→半径（細さ）。デュレーションは伸び立ち上がりにも使用。
     */
    spawnRedCylinderFromTrack6(velocity, durationMs = 180, noteNumber = 64) {
        if (!this.cylinderInstMesh || !this._redCylinderMaterial) return;

        const vMidi = this.normalizeMidiVelocity(velocity);
        const dur = Math.max(1, Number(durationMs) || 180);
        const s = this.shardCylinderVisualScale ?? 1;
        const length = THREE.MathUtils.clamp(this._cylinderLengthFromVelocityMidi(vMidi), 72, 355) * s;
        const radius = THREE.MathUtils.clamp(this._cylinderRadiusFromDurationMs(dur), 8, 38) * s;

        const slotIndex = this._allocCylinderSlot();

        const ci = this.cylinders.length;
        const wu = new THREE.Vector3(0, 1, 0);
        this._cylinderPosTemp.copy(this._trailHeadPosCylinder);
        const cside = new THREE.Vector3().crossVectors(this._trailHeadDirCylinder, wu);
        if (cside.lengthSq() > 1e-8) {
            cside.normalize();
            const lateral = (this._shardNoise(ci * 0.37, this.time * 0.09, 2.2) - 0.5) * 180;
            this._cylinderPosTemp.addScaledVector(cside, lateral);
        }
        this._cylinderPosTemp.y += (this._shardNoise(3.4, ci * 0.21, this.time * 0.07) - 0.5) * 140;
        const cylXLimit = this.roomHalfW * 0.62;
        const cylZLimit = this.roomHalfD * 0.62;
        this._cylinderPosTemp.x = THREE.MathUtils.clamp(
            this._cylinderPosTemp.x,
            -cylXLimit,
            cylXLimit
        );
        this._cylinderPosTemp.z = THREE.MathUtils.clamp(
            this._cylinderPosTemp.z,
            -cylZLimit,
            cylZLimit
        );
        this._cylinderPosTemp.y = THREE.MathUtils.clamp(
            this._cylinderPosTemp.y,
            this.floorTopY + 120,
            this.ceilingY * 0.46
        );
        this._lastCylinderWorldPos.copy(this._cylinderPosTemp);

        this._cylinderSideTemp.crossVectors(this._trailHeadDirCylinder, this._cylinderAxisUp);
        if (this._cylinderSideTemp.lengthSq() < 1e-8) {
            this._cylinderSideTemp.crossVectors(this._trailHeadDirCylinder, this._cylinderFallbackAxis);
        }
        this._cylinderSideTemp.normalize();
        // 長軸は進行方向に垂直。進行方向周りの回転は螺旋位相のみ（角度ノイズなし）
        this._cylinderDirTemp.crossVectors(this._cylinderSideTemp, this._trailHeadDirCylinder).normalize();
        this._cylinderQuatTemp.setFromUnitVectors(this._cylinderAxisUp, this._cylinderDirTemp);
        // 進行方向に直交する横軸（side ≒ トラベル基準の X）周りのノイズ回転
        const tiltXRad =
            (this._shardNoise(ci * 0.13, this.time * 0.03, 1.07) - 0.5) * 0.55;
        this._cylinderTiltXQuat.setFromAxisAngle(this._cylinderSideTemp, tiltXRad);
        this._cylinderQuatTemp.premultiply(this._cylinderTiltXQuat);
        const rollRad = this._cylinderHelixPhase;
        this._cylinderRollQuat.setFromAxisAngle(this._trailHeadDirCylinder, rollRad);
        this._cylinderHelixPhase += this._cylinderHelixTwistPerSpawn;
        this._cylinderHelixPhase =
            THREE.MathUtils.euclideanModulo(this._cylinderHelixPhase + Math.PI, Math.PI * 2) - Math.PI;
        this._cylinderQuatTemp.premultiply(this._cylinderRollQuat);

        this._cylinderScaleTemp.set(radius * 0.02, length * 0.02, radius * 0.02);
        this._cylinderMatrixTemp.compose(this._cylinderPosTemp, this._cylinderQuatTemp, this._cylinderScaleTemp);
        this.cylinderInstMesh.setMatrixAt(slotIndex, this._cylinderMatrixTemp);
        this.cylinderInstMesh.instanceMatrix.needsUpdate = true;
        if (this._cylinderOpacityAttr) {
            this._cylinderOpacityAttr.array[slotIndex] = 1;
            this._cylinderOpacityAttr.needsUpdate = true;
        }
        this._randomCylinderTintNearBase(this._cylinderTintTemp);
        this.cylinderInstMesh.setColorAt(slotIndex, this._cylinderTintTemp);
        if (this.cylinderInstMesh.instanceColor) {
            this.cylinderInstMesh.instanceColor.needsUpdate = true;
        }

        this.cylinders.push({
            slotIndex,
            spawnTime: performance.now(),
            localPos: this._cylinderPosTemp.clone(),
            localQuat: this._cylinderQuatTemp.clone(),
            baseRadius: radius,
            baseLength: length,
            growInMs: this._growInMsFromDuration(dur, this.cylinderGrowInMs)
        });
    }

    /**
     * トラック8：道床の地形高さに合わせてシリンダを立てる（ほぼ垂直＋軽い傾き）。
     */
    spawnRedCylinderFromRoad(velocity, durationMs = 180, noteNumber = 64) {
        if (!this.cylinderInstMesh || !this._redCylinderMaterial) return;

        const vMidi = this.normalizeMidiVelocity(velocity);
        const dur = Math.max(1, Number(durationMs) || 180);
        const s = this.shardCylinderVisualScale ?? 1;
        const length = THREE.MathUtils.clamp(this._cylinderLengthFromVelocityMidi(vMidi), 72, 355) * s;
        const radius = THREE.MathUtils.clamp(this._cylinderRadiusFromDurationMs(dur), 8, 38) * s;

        const slotIndex = this._allocCylinderSlot();
        const ci = this.cylinders.length;

        const zCl = this._advancePianoRollLaneZ();
        const xCl = this.roadCenterOffset(zCl);
        const th = this._terrainHeight(xCl, zCl);
        const halfLenWorld = (length * 0.02) * 0.5;
        const y = this.floorTopY + th + halfLenWorld;
        this._cylinderPosTemp.set(xCl, y, zCl);
        this._lastCylinderWorldPos.copy(this._cylinderPosTemp);

        const tiltX = (this._shardNoise(noteNumber * 0.31, ci * 0.07, 0.2) - 0.5) * 0.42;
        const tiltZ = (this._shardNoise(ci * 0.29, noteNumber * 0.37, 0.28) - 0.5) * 0.42;
        this._cylinderTiltXQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), tiltX);
        this._cylinderRollQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), tiltZ);
        this._cylinderQuatTemp.copy(this._cylinderRollQuat).multiply(this._cylinderTiltXQuat);

        this._cylinderScaleTemp.set(radius * 0.02, length * 0.02, radius * 0.02);
        this._cylinderMatrixTemp.compose(this._cylinderPosTemp, this._cylinderQuatTemp, this._cylinderScaleTemp);
        this.cylinderInstMesh.setMatrixAt(slotIndex, this._cylinderMatrixTemp);
        this.cylinderInstMesh.instanceMatrix.needsUpdate = true;
        if (this._cylinderOpacityAttr) {
            this._cylinderOpacityAttr.array[slotIndex] = 1;
            this._cylinderOpacityAttr.needsUpdate = true;
        }
        this._randomCylinderTintNearBase(this._cylinderTintTemp);
        this.cylinderInstMesh.setColorAt(slotIndex, this._cylinderTintTemp);
        if (this.cylinderInstMesh.instanceColor) {
            this.cylinderInstMesh.instanceColor.needsUpdate = true;
        }

        this.cylinders.push({
            slotIndex,
            spawnTime: performance.now(),
            localPos: this._cylinderPosTemp.clone(),
            localQuat: this._cylinderQuatTemp.clone(),
            baseRadius: radius,
            baseLength: length,
            growInMs: this._growInMsFromDuration(dur, this.cylinderGrowInMs)
        });
    }

    _allocCylinderSlot() {
        if (this.cylinders.length >= this.maxCylinders) {
            const old = this.cylinders.shift();
            this._clearCylinderSlot(old.slotIndex);
            return old.slotIndex;
        }
        return this._cylinderFreeSlots.pop();
    }

    _clearCylinderSlot(slotIndex) {
        if (!this.cylinderInstMesh || slotIndex < 0 || slotIndex >= this.maxCylinders) return;
        this._cylinderPosTemp.set(0, -1e6, 0);
        this._cylinderQuatTemp.identity();
        this._cylinderScaleTemp.set(0, 0, 0);
        this._cylinderMatrixTemp.compose(this._cylinderPosTemp, this._cylinderQuatTemp, this._cylinderScaleTemp);
        this.cylinderInstMesh.setMatrixAt(slotIndex, this._cylinderMatrixTemp);
        if (this._cylinderOpacityAttr) {
            this._cylinderOpacityAttr.array[slotIndex] = 0;
            this._cylinderOpacityAttr.needsUpdate = true;
        }
        this.cylinderInstMesh.setColorAt(slotIndex, this._instanceWhite);
        if (this.cylinderInstMesh.instanceColor) {
            this.cylinderInstMesh.instanceColor.needsUpdate = true;
        }
    }

    pruneExpiredCylinders() {
        if (!this.cylinders.length || !this.cylinderInstMesh) return;
        const now = performance.now();
        const life = this.cylinderLifetimeMs;
        let matrixDirty = false;
        for (let i = this.cylinders.length - 1; i >= 0; i--) {
            const c = this.cylinders[i];
            if (now - c.spawnTime > life) {
                this._clearCylinderSlot(c.slotIndex);
                this._cylinderFreeSlots.push(c.slotIndex);
                this.cylinders.splice(i, 1);
                matrixDirty = true;
            }
        }
        while (this.cylinders.length > this.maxCylinders) {
            const old = this.cylinders.shift();
            this._clearCylinderSlot(old.slotIndex);
            this._cylinderFreeSlots.push(old.slotIndex);
            matrixDirty = true;
        }
        if (matrixDirty && this.cylinderInstMesh) {
            this.cylinderInstMesh.instanceMatrix.needsUpdate = true;
        }
    }

    initRedCylinderBurstParticles() {
        if (this.redBurstInstMesh) return;
        const n = this.redBurstParticleCount;
        this._redBurstPositions = new Float32Array(n * 3);
        this._redBurstVelocities = new Float32Array(n * 3);
        this._redBurstColors = new Float32Array(n * 3);
        this._redBurstRotQuats = new Float32Array(n * 4);
        this._redBurstScales = new Float32Array(n);
        this.redBurstSharedGeo = new THREE.DodecahedronGeometry(1, 0);
        this.redBurstMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.0,
            roughness: 0.96,
            emissive: 0x080808,
            emissiveIntensity: 0.05,
            vertexColors: true,
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
            blending: THREE.NormalBlending,
            fog: true
        });
        this.redBurstInstMesh = new THREE.InstancedMesh(this.redBurstSharedGeo, this.redBurstMaterial, n);
        this.redBurstInstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.redBurstInstMesh.frustumCulled = false;
        this.redBurstInstMesh.visible = false;
        const hidePos = new THREE.Vector3(0, -1e6, 0);
        const hideQuat = new THREE.Quaternion();
        const hideScale = new THREE.Vector3(0, 0, 0);
        for (let i = 0; i < n; i++) {
            this._redBurstMatrixTemp.compose(hidePos, hideQuat, hideScale);
            this.redBurstInstMesh.setMatrixAt(i, this._redBurstMatrixTemp);
            this.redBurstInstMesh.setColorAt(i, new THREE.Color(0, 0, 0));
        }
        this.redBurstInstMesh.instanceMatrix.needsUpdate = true;
        if (this.redBurstInstMesh.instanceColor) this.redBurstInstMesh.instanceColor.needsUpdate = true;
        this.scene.add(this.redBurstInstMesh);
    }

    triggerRedCylinderBurst(worldPos, velocity = 127, durationMs = 180) {
        if (!this.redBurstInstMesh || !this._redBurstPositions || !this._redBurstVelocities) return;
        const n = this.redBurstParticleCount;
        const vMidi = this.normalizeMidiVelocity(velocity) / 127;
        const durN = THREE.MathUtils.clamp((Number(durationMs) || 180) / 900, 0.35, 2.2);
        const baseSpeed = 130 + vMidi * 520;
        const spread = 12 + vMidi * 56;
        for (let i = 0; i < n; i++) {
            const i3 = i * 3;
            const th = Math.random() * Math.PI * 2;
            const ph = Math.acos(2 * Math.random() - 1);
            const dx = Math.sin(ph) * Math.cos(th);
            const dy = Math.cos(ph);
            const dz = Math.sin(ph) * Math.sin(th);
            const r = Math.random() * spread;
            this._redBurstPositions[i3] = worldPos.x + dx * r;
            this._redBurstPositions[i3 + 1] = worldPos.y + dy * r;
            this._redBurstPositions[i3 + 2] = worldPos.z + dz * r;
            const sp = baseSpeed * (0.45 + Math.random() * 1.2);
            this._redBurstVelocities[i3] = dx * sp;
            this._redBurstVelocities[i3 + 1] = dy * sp + 35;
            this._redBurstVelocities[i3 + 2] = dz * sp;
            const qi = i * 4;
            this._redBurstQuatTemp.setFromEuler(
                new THREE.Euler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, 'XYZ')
            );
            this._redBurstRotQuats[qi] = this._redBurstQuatTemp.x;
            this._redBurstRotQuats[qi + 1] = this._redBurstQuatTemp.y;
            this._redBurstRotQuats[qi + 2] = this._redBurstQuatTemp.z;
            this._redBurstRotQuats[qi + 3] = this._redBurstQuatTemp.w;
            this._redBurstScales[i] = 1.3 + Math.random() * 3.9;
        }
        this._redBurstAgeSec = 0;
        this._redBurstLifeSec = THREE.MathUtils.clamp(0.9 * durN, 0.38, 1.95);
        this._redBurstActive = true;
        this.redBurstInstMesh.visible = true;
        this.redBurstMaterial.opacity = 0.95;
    }

    _setHeatmapColor01(t, i3, out) {
        const x = THREE.MathUtils.clamp(t, 0, 1);
        let r; let g; let b;
        if (x < 0.25) {
            const u = x / 0.25;
            r = 0.1;
            g = u;
            b = 1.0;
        } else if (x < 0.5) {
            const u = (x - 0.25) / 0.25;
            r = 0.1;
            g = 1.0;
            b = 1.0 - u;
        } else if (x < 0.75) {
            const u = (x - 0.5) / 0.25;
            r = u;
            g = 1.0;
            b = 0.0;
        } else {
            const u = (x - 0.75) / 0.25;
            r = 1.0;
            g = 1.0 - u;
            b = 0.0;
        }
        out[i3] = r;
        out[i3 + 1] = g;
        out[i3 + 2] = b;
    }

    _updateRedCylinderBurstParticles(deltaTime) {
        if (!this._redBurstActive || !this.redBurstInstMesh || !this._redBurstPositions || !this._redBurstVelocities || !this._redBurstColors) return;
        const dt = Math.min(deltaTime, 0.05);
        this._redBurstAgeSec += dt;
        const n = this.redBurstParticleCount;
        const drag = Math.exp(-dt * 2.4);
        const gravity = 170;
        const curlFreq = this.redBurstCurlFreq;
        const curlStr = this.redBurstCurlStrength;
        const tt = this.time;
        for (let i = 0; i < n; i++) {
            const i3 = i * 3;
            const px = this._redBurstPositions[i3];
            const py = this._redBurstPositions[i3 + 1];
            const pz = this._redBurstPositions[i3 + 2];
            const seed = this._shardNoise(i * 0.173, 4.37, 9.11);
            const jitterAmp = 220;
            const sx = px + (seed - 0.5) * jitterAmp;
            const sy = py + (this._shardNoise(i * 0.127, 7.91, 2.13) - 0.5) * jitterAmp;
            const sz = pz + (this._shardNoise(i * 0.097, 1.77, 5.59) - 0.5) * jitterAmp;
            this._sampleCurlNoiseVectorInto(
                this._redBurstCurlTemp,
                sx,
                sy,
                sz,
                tt + seed * 6.0,
                curlFreq * 1.7,
                12.0,
                seed
            );
            const turbX = (this._shardNoise(sx * 0.0061, sy * 0.0043, tt * 0.73 + seed * 3.1) - 0.5) * 2.0;
            const turbY = (this._shardNoise(sy * 0.0057, sz * 0.0047, tt * 0.89 + seed * 1.7) - 0.5) * 2.0;
            const turbZ = (this._shardNoise(sz * 0.0063, sx * 0.0041, tt * 0.67 + seed * 2.9) - 0.5) * 2.0;
            const curlX = this._redBurstCurlTemp.x + turbX * 0.62;
            const curlY = this._redBurstCurlTemp.y + turbY * 0.62;
            const curlZ = this._redBurstCurlTemp.z + turbZ * 0.62;
            this._redBurstVelocities[i3] *= drag;
            this._redBurstVelocities[i3 + 1] = this._redBurstVelocities[i3 + 1] * drag - gravity * dt;
            this._redBurstVelocities[i3 + 2] *= drag;
            this._redBurstVelocities[i3] += curlX * curlStr * dt;
            this._redBurstVelocities[i3 + 1] += curlY * curlStr * dt;
            this._redBurstVelocities[i3 + 2] += curlZ * curlStr * dt;
            this._redBurstPositions[i3] += this._redBurstVelocities[i3] * dt;
            this._redBurstPositions[i3 + 1] += this._redBurstVelocities[i3 + 1] * dt;
            this._redBurstPositions[i3 + 2] += this._redBurstVelocities[i3 + 2] * dt;
            const sp = Math.sqrt(
                this._redBurstVelocities[i3] * this._redBurstVelocities[i3] +
                this._redBurstVelocities[i3 + 1] * this._redBurstVelocities[i3 + 1] +
                this._redBurstVelocities[i3 + 2] * this._redBurstVelocities[i3 + 2]
            );
            const ageT = THREE.MathUtils.clamp(this._redBurstAgeSec / this._redBurstLifeSec, 0, 1);
            const heat = THREE.MathUtils.clamp((sp / 520) * (1.0 - ageT * 0.6), 0, 1);
            this._setHeatmapColor01(heat, i3, this._redBurstColors);
            const qi = i * 4;
            this._redBurstQuatTemp.set(
                this._redBurstRotQuats[qi],
                this._redBurstRotQuats[qi + 1],
                this._redBurstRotQuats[qi + 2],
                this._redBurstRotQuats[qi + 3]
            );
            this._redBurstQuatTemp.normalize();
            this._redBurstPosTemp.set(
                this._redBurstPositions[i3],
                this._redBurstPositions[i3 + 1],
                this._redBurstPositions[i3 + 2]
            );
            const s = this._redBurstScales[i];
            this._redBurstScaleTemp.set(s, s, s);
            this._redBurstMatrixTemp.compose(this._redBurstPosTemp, this._redBurstQuatTemp, this._redBurstScaleTemp);
            this.redBurstInstMesh.setMatrixAt(i, this._redBurstMatrixTemp);
            this._redBurstColorTemp.setRGB(
                this._redBurstColors[i3],
                this._redBurstColors[i3 + 1],
                this._redBurstColors[i3 + 2]
            );
            this.redBurstInstMesh.setColorAt(i, this._redBurstColorTemp);
        }
        this.redBurstInstMesh.instanceMatrix.needsUpdate = true;
        if (this.redBurstInstMesh.instanceColor) this.redBurstInstMesh.instanceColor.needsUpdate = true;
        const t = THREE.MathUtils.clamp(this._redBurstAgeSec / this._redBurstLifeSec, 0, 1);
        this.redBurstMaterial.opacity = 1 - t * t * (3 - 2 * t);
        if (t >= 1) {
            this._redBurstActive = false;
            this.redBurstInstMesh.visible = false;
            this.redBurstMaterial.opacity = 0.0;
        }
    }

    _generateObsidianBumpTexture(size = 256) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 1800; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 0.4 + Math.random() * 1.8;
            const v = Math.floor(80 + Math.random() * 130);
            ctx.fillStyle = `rgba(${v},${v},${v},0.32)`;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        for (let i = 0; i < 120; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const rr = 6 + Math.random() * 18;
            const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
            g.addColorStop(0, 'rgba(255,255,255,0.24)');
            g.addColorStop(1, 'rgba(128,128,128,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, rr, 0, Math.PI * 2);
            ctx.fill();
        }
        const t = new THREE.CanvasTexture(canvas);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.colorSpace = THREE.LinearSRGBColorSpace;
        return t;
    }

    initObsidianDrifters() {
        if (this.obsidianInstMesh) return;
        const n = this.obsidianCount;
        this._obsidianPositions = new Float32Array(n * 3);
        this._obsidianVelocities = new Float32Array(n * 3);
        this._obsidianRotQuats = new Float32Array(n * 4);
        this._obsidianScales = new Float32Array(n * 3);
        this.obsidianGeometry = new THREE.BoxGeometry(1, 1, 1);
        this.obsidianBumpMap = this._generateObsidianBumpTexture(256);
        this.obsidianMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2b2f,
            metalness: 0.58,
            roughness: 0.22,
            bumpMap: this.obsidianBumpMap,
            bumpScale: 0.85,
            envMap: this.scene.environment,
            envMapIntensity: 0.36,
            emissive: 0x0b0b0d,
            emissiveIntensity: 0.08,
            fog: true
        });
        this.obsidianInstMesh = new THREE.InstancedMesh(this.obsidianGeometry, this.obsidianMaterial, n);
        this.obsidianInstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.obsidianInstMesh.frustumCulled = false;
        this.obsidianInstMesh.castShadow = false;
        this.obsidianInstMesh.receiveShadow = false;
        this.scene.add(this.obsidianInstMesh);

        const rad = this.obsidianSpawnRadius;
        for (let i = 0; i < n; i++) {
            const i3 = i * 3;
            const qi = i * 4;
            const th = Math.random() * Math.PI * 2;
            const ph = Math.acos(2 * Math.random() - 1);
            const rr = Math.pow(Math.random(), 1.35) * rad;
            this._obsidianPositions[i3] = Math.sin(ph) * Math.cos(th) * rr;
            this._obsidianPositions[i3 + 1] = (Math.random() - 0.5) * rad * 1.15 + 380;
            this._obsidianPositions[i3 + 2] = Math.sin(ph) * Math.sin(th) * rr;
            this._obsidianVelocities[i3] = (Math.random() - 0.5) * 65;
            this._obsidianVelocities[i3 + 1] = (Math.random() - 0.5) * 35;
            this._obsidianVelocities[i3 + 2] = (Math.random() - 0.5) * 65;
            this._obsidianQuatTemp.setFromEuler(
                new THREE.Euler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, 'XYZ')
            );
            this._obsidianRotQuats[qi] = this._obsidianQuatTemp.x;
            this._obsidianRotQuats[qi + 1] = this._obsidianQuatTemp.y;
            this._obsidianRotQuats[qi + 2] = this._obsidianQuatTemp.z;
            this._obsidianRotQuats[qi + 3] = this._obsidianQuatTemp.w;
            const base = 5 + Math.random() * 20;
            this._obsidianScales[i3] = base * (0.2 + Math.random() * 2.8);
            this._obsidianScales[i3 + 1] = base * (0.2 + Math.random() * 2.8);
            this._obsidianScales[i3 + 2] = base * (0.2 + Math.random() * 2.8);
            this._obsidianPosTemp.set(this._obsidianPositions[i3], this._obsidianPositions[i3 + 1], this._obsidianPositions[i3 + 2]);
            this._obsidianScaleTemp.set(this._obsidianScales[i3], this._obsidianScales[i3 + 1], this._obsidianScales[i3 + 2]);
            this._obsidianMatrixTemp.compose(this._obsidianPosTemp, this._obsidianQuatTemp, this._obsidianScaleTemp);
            this.obsidianInstMesh.setMatrixAt(i, this._obsidianMatrixTemp);
        }
        this.obsidianInstMesh.instanceMatrix.needsUpdate = true;
    }

    _updateObsidianDrifters(deltaTime) {
        if (!this.obsidianInstMesh || !this._obsidianPositions || !this._obsidianVelocities) return;
        const n = this.obsidianCount;
        const dt = Math.min(deltaTime, 0.05);
        const simDt = dt * this.obsidianMotionScale;
        const drag = Math.exp(-simDt * 0.35);
        const curlF = this.obsidianCurlFreq;
        const curlS = this.obsidianCurlStrength;
        const t = this.time * 12.0;
        const bound = this.obsidianSpawnRadius * 1.25;
        for (let i = 0; i < n; i++) {
            const i3 = i * 3;
            const qi = i * 4;
            const px = this._obsidianPositions[i3];
            const py = this._obsidianPositions[i3 + 1];
            const pz = this._obsidianPositions[i3 + 2];
            const fx = px * curlF;
            const fy = py * curlF;
            const fz = pz * curlF;
            const cx = -Math.cos(fz * 1.4 - t * 0.95);
            const cy = -Math.cos(fx * 1.2 + t * 1.05);
            const cz = -Math.cos(fy * 1.5 + t * 0.85);
            this._obsidianVelocities[i3] = this._obsidianVelocities[i3] * drag + cx * curlS * simDt;
            this._obsidianVelocities[i3 + 1] = this._obsidianVelocities[i3 + 1] * drag + cy * curlS * simDt;
            this._obsidianVelocities[i3 + 2] = this._obsidianVelocities[i3 + 2] * drag + cz * curlS * simDt;
            this._obsidianPositions[i3] += this._obsidianVelocities[i3] * simDt;
            this._obsidianPositions[i3 + 1] += this._obsidianVelocities[i3 + 1] * simDt;
            this._obsidianPositions[i3 + 2] += this._obsidianVelocities[i3 + 2] * simDt;
            if (this._obsidianPositions[i3] > bound) this._obsidianPositions[i3] = -bound;
            if (this._obsidianPositions[i3] < -bound) this._obsidianPositions[i3] = bound;
            if (this._obsidianPositions[i3 + 1] > this.ceilingY * 0.52) this._obsidianPositions[i3 + 1] = this.floorTopY + 220;
            if (this._obsidianPositions[i3 + 1] < this.floorTopY + 160) this._obsidianPositions[i3 + 1] = this.ceilingY * 0.48;
            if (this._obsidianPositions[i3 + 2] > bound) this._obsidianPositions[i3 + 2] = -bound;
            if (this._obsidianPositions[i3 + 2] < -bound) this._obsidianPositions[i3 + 2] = bound;
            this._obsidianQuatTemp.set(
                this._obsidianRotQuats[qi],
                this._obsidianRotQuats[qi + 1],
                this._obsidianRotQuats[qi + 2],
                this._obsidianRotQuats[qi + 3]
            );
            this._obsidianQuatTemp.normalize();
            this._obsidianPosTemp.set(this._obsidianPositions[i3], this._obsidianPositions[i3 + 1], this._obsidianPositions[i3 + 2]);
            this._obsidianScaleTemp.set(this._obsidianScales[i3], this._obsidianScales[i3 + 1], this._obsidianScales[i3 + 2]);
            this._obsidianMatrixTemp.compose(this._obsidianPosTemp, this._obsidianQuatTemp, this._obsidianScaleTemp);
            this.obsidianInstMesh.setMatrixAt(i, this._obsidianMatrixTemp);
        }
        this.obsidianInstMesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * 金属片とは別レイヤーのインスタンスボックス（プール）。初期は全非表示、スポーン時に割当。
     */
    createAmbientFloatingParticles() {
        const count = this.ambientParticleCount;
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const envTex = this.cubeRenderTarget ? this.cubeRenderTarget.texture : this.scene.environment;
        const L = this.sceneLightingScale ?? 1;
        /** マット寄りに見せるため、通常合成の黄色パーティクルにする */
        const mat = new THREE.MeshBasicMaterial({
            color: 0xe8dc67,
            transparent: true,
            opacity: 0.62,
            depthWrite: false,
            blending: THREE.NormalBlending,
            fog: true
        });

        this.ambientInstManager = new InstancedMeshManager(this.scene, boxGeo, mat, count);
        const mainMesh = this.ambientInstManager.getMainMesh();
        mainMesh.castShadow = false;
        mainMesh.receiveShadow = false;
        mainMesh.renderOrder = -2;

        this.ambientParticles = [];
        this._ambientLiving = [];
        this._ambientFreeSlots = [];
        for (let i = 0; i < count; i++) {
            this.ambientParticles.push({
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                rotation: new THREE.Euler(),
                angVel: new THREE.Vector3(),
                scale: new THREE.Vector3(),
                baseScale: new THREE.Vector3(),
                phase: 0,
                spawnTime: null
            });
            this._ambientFreeSlots.push(i);
        }
        for (let i = 0; i < count; i++) {
            this._clearAmbientParticleSlot(i);
        }
        this.ambientInstManager.markNeedsUpdate();
        const seedY = this.floorTopY + (this.ceilingY - this.floorTopY) * 0.3;
        this._spawnAmbientParticlesBurst(new THREE.Vector3(0, seedY, 0), this.ambientMinLiving);
    }

    _clearAmbientParticleSlot(slotIndex) {
        if (!this.ambientInstManager || slotIndex < 0 || slotIndex >= this.ambientParticleCount) return;
        const ap = this.ambientParticles[slotIndex];
        ap.spawnTime = null;
        ap.scale.set(0, 0, 0);
        this.ambientInstManager.setMatrixAt(slotIndex, this._ambientHidePos, this._ambientIdRot, ap.scale);
    }

    /** ワールド座標付近にバースト（空きスロットが尽きるまで） */
    _spawnAmbientParticlesBurst(worldPos, burstCount) {
        if (!this.ambientInstManager || !burstCount || !this._ambientFreeSlots.length) return;
        const n = Math.min(Math.floor(burstCount), this._ambientFreeSlots.length);
        const bx = this.roomHalfW - 420;
        const bz = this.roomHalfD - 420;
        const yMin = this.floorTopY + 200;
        const yMax = this.ceilingY * 0.41;
        for (let k = 0; k < n; k++) {
            const i = this._ambientFreeSlots.pop();
            const ap = this.ambientParticles[i];
            const jr = 38 + Math.random() * 220;
            const th = Math.random() * Math.PI * 2;
            const ph = Math.acos(2 * Math.random() - 1);
            const jx = jr * Math.sin(ph) * Math.cos(th);
            const jy = jr * Math.cos(ph) * 0.82;
            const jz = jr * Math.sin(ph) * Math.sin(th);
            ap.position.set(worldPos.x + jx, worldPos.y + jy, worldPos.z + jz);
            ap.position.x = THREE.MathUtils.clamp(ap.position.x, -bx, bx);
            ap.position.z = THREE.MathUtils.clamp(ap.position.z, -bz, bz);
            ap.position.y = THREE.MathUtils.clamp(ap.position.y, yMin, yMax);
            ap.velocity.set(
                (Math.random() - 0.5) * 150,
                (Math.random() - 0.5) * 95,
                (Math.random() - 0.5) * 150
            );
            ap.rotation.set(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2
            );
            ap.angVel.set(
                (Math.random() - 0.5) * 1.9,
                (Math.random() - 0.5) * 1.9,
                (Math.random() - 0.5) * 1.9
            );
            const sr = 0.55 + Math.random() * 2.6;
            ap.baseScale.set(
                sr * (0.34 + Math.random() * 1.05) * 0.28,
                sr * (0.34 + Math.random() * 1.05) * 0.28,
                sr * (0.34 + Math.random() * 1.05) * 0.28
            );
            ap.scale.copy(ap.baseScale);
            ap.phase = Math.random() * Math.PI * 2;
            ap.spawnTime = performance.now();
            this._ambientLiving.push(i);
        }
    }

    /** トラック9スフィア：単色＋バンプで質感（アルベドマップは使わない） */
    initTrack9SpawnSpheres() {
        this.track9SphereGroup = new THREE.Group();
        this.scene.add(this.track9SphereGroup);
        this._track9FleshTextures = this.generateFleshTextures();
        const env = this.scene.environment;
        this._track9SphereMaterial = new THREE.MeshStandardMaterial({
            map: null,
            bumpMap: this._track9FleshTextures.bumpMap,
            bumpScale: 4.25,
            color: 0xd5d9df,
            metalness: 0.2,
            roughness: 0.52,
            envMap: env,
            envMapIntensity: 0.68 * (0.55 + 0.45 * (this.sceneLightingScale ?? 1)),
            emissive: 0x2a2d32,
            emissiveIntensity: 0.2,
            fog: true
        });
        this.track9SharedGeo = new THREE.SphereGeometry(1, 28, 28);
    }

    /**
     * track9SpawnDuringDuration がオンのとき、デュレーション窓が生きている間に一定間隔でスポーン（OSC トラック9）。
     * ノートオン時の1発目は handleTrackNumber 側で行う。
     */
    _tickTrack9DurationSpawn() {
        if (!this.track9SpawnDuringDuration) return;
        const now = performance.now();
        if (now >= this._track9SpawnWindowEndMs) return;
        const intv = Math.max(16, Number(this.track9DurationSpawnIntervalMs) || 52);
        if (now - this._track9LastDurationSpawnMs < intv) return;
        this._track9LastDurationSpawnMs = now;
        this.spawnTrack9SphereFromWorldCenter(this._track9SpawnWindowVelocity);
    }

    /**
     * トラック9：カールノイズで位置、ヒートマップで色。velocity で半径と初速。バンプマップで質感。
     */
    spawnTrack9SphereFromWorldCenter(velocity) {
        if (!this.track9SphereGroup || !this.track9SharedGeo || !this._track9SphereMaterial) return;

        const vMidi = this.normalizeMidiVelocity(velocity);
        const radius = THREE.MathUtils.clamp(22 + (vMidi / 127) * 76, 16, 102);

        this._sampleSpawnPositionPianoRoll(this._track9SpawnPos);

        const sphereMat = this._track9SphereMaterial.clone();
        sphereMat.map = null;
        this._velocityMidiToHeatmapColor(vMidi, this._shardHeatColor);
        sphereMat.color.copy(this._shardHeatColor);
        sphereMat.emissive.copy(this._shardHeatColor);
        sphereMat.emissiveIntensity = 0.22 + 0.42 * (vMidi / 127);
        const mesh = new THREE.Mesh(this.track9SharedGeo, sphereMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const position = this._track9SpawnPos.clone();
        this._track9WorldCenter.set(0, position.y * 0.35, position.z - 5200);
        const vel = new THREE.Vector3();
        vel.subVectors(this._track9SpawnPos, this._track9WorldCenter);
        if (vel.lengthSq() < 1e-10) {
            vel.set((Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.35, 0.75 + Math.random() * 0.2);
        }
        vel.normalize();
        const speed = 92 + (vMidi / 127) * 260;
        vel.multiplyScalar(speed);

        const angularVelocity = new THREE.Vector3(
            (Math.random() - 0.5) * 2.8,
            (Math.random() - 0.5) * 2.8,
            (Math.random() - 0.5) * 2.8
        );

        mesh.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );
        mesh.position.copy(position);
        const vs = this._track9SphereVisualScale;
        mesh.scale.setScalar(radius * 0.015 * vs);

        this.track9SphereGroup.add(mesh);
        this.track9Spheres.push({
            mesh,
            position,
            velocity: vel,
            radius,
            radiusNow: radius * 0.015 * vs,
            birthAge: 0,
            angularVelocity,
            driftSeed: Math.random() * 4000 + this.track9Spheres.length * 0.37
        });

        while (this.track9Spheres.length > this.maxTrack9Spheres) {
            const old = this.track9Spheres.shift();
            this.track9SphereGroup.remove(old.mesh);
            if (old.mesh.material) old.mesh.material.dispose();
        }
    }

    _updateTrack9SpherePhysics(deltaTime) {
        if (!this.track9Spheres.length) return;
        const growSec = this._track9BirthGrowSec;
        const vs = this._track9SphereVisualScale;
        for (const sp of this.track9Spheres) {
            sp.birthAge = (sp.birthAge ?? 0) + deltaTime;
            const t = Math.min(1, sp.birthAge / growSec);
            const u = t * t * (3 - 2 * t);
            sp.radiusNow = sp.radius * vs * Math.max(u, 0.015);
        }

        const sub = this._track9SubSteps;
        const dt = deltaTime / sub;
        const grav = this._track9Gravity;
        const drift = this._track9SphereDrift;
        const diff = this._track9Diff;
        const margin = 140;
        const tPhys = this.time;

        for (let s = 0; s < sub; s++) {
            this.track9PhysicsGrid.clear();
            this.track9Spheres.forEach((sp, i) => {
                const gx = Math.floor(sp.position.x / this.track9GridSize);
                const gy = Math.floor(sp.position.y / this.track9GridSize);
                const gz = Math.floor(sp.position.z / this.track9GridSize);
                const key = (gx + 120) + (gy + 120) * 240 + (gz + 120) * 240 * 240;
                if (!this.track9PhysicsGrid.has(key)) this.track9PhysicsGrid.set(key, []);
                this.track9PhysicsGrid.get(key).push(i);
            });

            this.track9Spheres.forEach((sp) => {
                const ds = sp.driftSeed ?? 0;
                const ampXZ = 24;
                const ampY = 13;
                drift.set(
                    (this._shardNoise(ds * 0.11, tPhys * 0.52, 0.07) - 0.5) * 2 * ampXZ,
                    (this._shardNoise(ds * 0.19 + 2.1, tPhys * 0.46, 0.11) - 0.5) * 2 * ampY + 6,
                    (this._shardNoise(ds * 0.13 + 7.1, tPhys * 0.49, 0.09) - 0.5) * 2 * ampXZ
                );
                sp.velocity.addScaledVector(grav, dt);
                sp.velocity.addScaledVector(drift, dt);
                sp.position.addScaledVector(sp.velocity, dt);
                sp.velocity.multiplyScalar(0.9984);

                const r = sp.radiusNow;
                const xHalf = this.roomHalfW - margin;
                const x0 = -xHalf + r;
                const x1 = xHalf - r;
                const z0 = -this.roomHalfD + margin + r;
                const z1 = this.roomHalfD - margin - r;
                const th = this._terrainHeight(sp.position.x, sp.position.z);
                const y0 = this.floorTopY + th + r + 4;
                const y1 = this.ceilingY * 0.46 - r;

                if (sp.position.x < x0) {
                    sp.position.x = x0;
                    sp.velocity.x *= -0.5;
                } else if (sp.position.x > x1) {
                    sp.position.x = x1;
                    sp.velocity.x *= -0.5;
                }
                if (sp.position.z < z0) {
                    sp.position.z = z0;
                    sp.velocity.z *= -0.5;
                } else if (sp.position.z > z1) {
                    sp.position.z = z1;
                    sp.velocity.z *= -0.5;
                }
                if (sp.position.y < y0) {
                    sp.position.y = y0;
                    sp.velocity.y *= -0.52;
                    const roll = 0.08 / Math.max(r * 0.04, 0.5);
                    sp.angularVelocity.z += -sp.velocity.x * roll * dt;
                    sp.angularVelocity.x += sp.velocity.z * roll * dt;
                    sp.velocity.x *= 0.96;
                    sp.velocity.z *= 0.96;
                } else if (sp.position.y > y1) {
                    sp.position.y = y1;
                    sp.velocity.y *= -0.48;
                }
            });

            this.track9Spheres.forEach((a, i) => {
                const gx = Math.floor(a.position.x / this.track9GridSize);
                const gy = Math.floor(a.position.y / this.track9GridSize);
                const gz = Math.floor(a.position.z / this.track9GridSize);
                for (let ox = -1; ox <= 1; ox++) {
                    for (let oy = -1; oy <= 1; oy++) {
                        for (let oz = -1; oz <= 1; oz++) {
                            const key = (gx + ox + 120) + (gy + oy + 120) * 240 + (gz + oz + 120) * 240 * 240;
                            const neighbors = this.track9PhysicsGrid.get(key);
                            if (!neighbors) continue;
                            neighbors.forEach((j) => {
                                if (i >= j) return;
                                const b = this.track9Spheres[j];
                                diff.subVectors(a.position, b.position);
                                const distSq = diff.lengthSq();
                                const minD = a.radiusNow + b.radiusNow;
                                if (distSq >= minD * minD || distSq < 1e-10) return;
                                const dist = Math.sqrt(distSq);
                                const overlap = (minD - dist) * 0.55;
                                const nx = diff.x / dist;
                                const ny = diff.y / dist;
                                const nz = diff.z / dist;
                                a.position.x += nx * overlap * 0.5;
                                a.position.y += ny * overlap * 0.5;
                                a.position.z += nz * overlap * 0.5;
                                b.position.x -= nx * overlap * 0.5;
                                b.position.y -= ny * overlap * 0.5;
                                b.position.z -= nz * overlap * 0.5;
                                const rvx = a.velocity.x - b.velocity.x;
                                const rvy = a.velocity.y - b.velocity.y;
                                const rvz = a.velocity.z - b.velocity.z;
                                const dot = rvx * nx + rvy * ny + rvz * nz;
                                if (dot < 0) {
                                    const imp = -(1 + 0.65) * dot * 0.5;
                                    const ix = nx * imp;
                                    const iy = ny * imp;
                                    const iz = nz * imp;
                                    a.velocity.x += ix;
                                    a.velocity.y += iy;
                                    a.velocity.z += iz;
                                    b.velocity.x -= ix;
                                    b.velocity.y -= iy;
                                    b.velocity.z -= iz;
                                }
                            });
                        }
                    }
                }
            });

            this.track9Spheres.forEach((sp) => {
                sp.angularVelocity.multiplyScalar(0.994);
                sp.mesh.rotation.x += sp.angularVelocity.x * dt;
                sp.mesh.rotation.y += sp.angularVelocity.y * dt;
                sp.mesh.rotation.z += sp.angularVelocity.z * dt;
            });
        }

        this.track9Spheres.forEach((sp) => {
            sp.mesh.position.copy(sp.position);
            sp.mesh.scale.setScalar(sp.radiusNow);
        });
    }

    _updateAmbientParticles(deltaTime) {
        if (!this.ambientInstManager || !this.ambientParticles.length) return;
        const bx = this.roomHalfW - 420;
        const bz = this.roomHalfD - 420;
        const yMin = this.floorTopY + 200;
        const yMax = this.ceilingY * 0.41;
        const t = this.time;
        const dt = deltaTime;
        const now = performance.now();
        const life = this.ambientParticleLifetimeMs;
        const fadeMs = this.ambientParticleFadeOutMs;

        for (let j = this._ambientLiving.length - 1; j >= 0; j--) {
            const i = this._ambientLiving[j];
            const ap = this.ambientParticles[i];
            if (ap.spawnTime == null) {
                this._ambientLiving.splice(j, 1);
                continue;
            }
            const age = now - ap.spawnTime;
            if (age >= life) {
                this._clearAmbientParticleSlot(i);
                this._ambientFreeSlots.push(i);
                this._ambientLiving.splice(j, 1);
                continue;
            }
            const fadeOp = this._fadeOpacity01(age, life, fadeMs);
            ap.scale.copy(ap.baseScale).multiplyScalar(fadeOp);

            const ph = ap.phase;
            ap.velocity.x += (Math.sin(t * 0.62 + ph * 1.1) * 38 + (Math.sin(t * 1.28 + i * 0.07) - 0.5) * 16) * dt;
            ap.velocity.y += (Math.cos(t * 0.48 + ph * 0.9) * 26 + (Math.cos(t * 0.88 + i * 0.05) - 0.5) * 12) * dt;
            ap.velocity.z += (Math.sin(t * 0.55 + ph * 1.3 + 1.4) * 38 + (Math.sin(t * 1.08 + i * 0.09) - 0.5) * 16) * dt;
            ap.velocity.multiplyScalar(0.9989);
            if (ap.velocity.length() > 210) ap.velocity.normalize().multiplyScalar(210);

            ap.position.addScaledVector(ap.velocity, dt);

            if (ap.position.x > bx) {
                ap.position.x = bx;
                ap.velocity.x *= -0.72;
            } else if (ap.position.x < -bx) {
                ap.position.x = -bx;
                ap.velocity.x *= -0.72;
            }
            if (ap.position.z > bz) {
                ap.position.z = bz;
                ap.velocity.z *= -0.72;
            } else if (ap.position.z < -bz) {
                ap.position.z = -bz;
                ap.velocity.z *= -0.72;
            }
            if (ap.position.y > yMax) {
                ap.position.y = yMax;
                ap.velocity.y *= -0.68;
            } else if (ap.position.y < yMin) {
                ap.position.y = yMin;
                ap.velocity.y *= -0.68;
            }

            ap.rotation.x += ap.angVel.x * dt;
            ap.rotation.y += ap.angVel.y * dt;
            ap.rotation.z += ap.angVel.z * dt;

            this.ambientInstManager.setMatrixAt(i, ap.position, ap.rotation, ap.scale);
        }
        this.ambientInstManager.markNeedsUpdate();
    }

    triggerPulse(velocity = 127) {
        const speed = 0.3 + (velocity / 127.0) * 1.0;
        this.pulses.push({ progress: 0.0, speed });
        const flashIntensity = (velocity / 127.0) * 2.8;
        if (this.pulsePointLight) {
            this.pulsePointLight.intensity = flashIntensity;
            this.pulsePointLight.color.copy(this.pulseColor);
        }
        this.targetLightIntensity = flashIntensity * 2.4;
    }

    setupEnvironment() {
        this.pmremGenerator = new PMREMGenerator(this.renderer);
        this.pmremGenerator.compileEquirectangularShader();
        const envScene = new RoomEnvironment();
        this._roomEnvTexture = this.pmremGenerator.fromScene(envScene, 0.04).texture;
        this.scene.environment = this._roomEnvTexture;
    }

    /** 平行光＋半球＋環境光 */
    setupLights() {
        this.fillPointLight = null;
        this.pulsePointLight = null;
        this.promoWallFillLight = null;
        this.promoWallLightTarget = null;

        /** メイン太陽：夜明け前の残り青み（弱め・影用） */
        this.sunLight = new THREE.DirectionalLight(0xb8c8e8, 0.38);
        this.sunLight.position.set(0, 14200, 72000);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.set(4096, 4096);
        this.sunLight.shadow.camera.near = 400;
        this.sunLight.shadow.camera.far = 120000;
        const sc = 62000;
        this.sunLight.shadow.camera.left = -sc;
        this.sunLight.shadow.camera.right = sc;
        this.sunLight.shadow.camera.top = sc;
        this.sunLight.shadow.camera.bottom = -sc;
        this.sunLight.shadow.bias = -0.00015;
        this.sunLight.shadow.normalBias = 2.2;
        this.sunLight.shadow.radius = 2.8;
        this.scene.add(this.sunLight);
        this.scene.add(this.sunLight.target);
        this.sunLight.target.position.set(0, this.floorTopY + 180, 0);

        /** 朝焼け：カメラの後ろ低めから進行方向へ。updateCamera で target を更新 */
        this.sunriseLight = new THREE.DirectionalLight(0xff7a48, 0.52);
        this.sunriseLight.castShadow = false;
        this.sunriseLight.position.set(0, 1100, -42000);
        this.scene.add(this.sunriseLight);
        this.scene.add(this.sunriseLight.target);
        this.sunriseLight.target.position.set(0, this.roadCameraEyeY ?? 420, 0);

        this.hemisphereLight = new THREE.HemisphereLight(0x5a6a88, 0x1c1410, 0.36);
        this.hemisphereLight.position.set(0, 1, 0);
        this.scene.add(this.hemisphereLight);

        this.ambientLight = new THREE.AmbientLight(0x6a7a94, 0.13);
        this.scene.add(this.ambientLight);
    }

    setupAirNoiseVolume() {
        const volumeGeo = new THREE.BoxGeometry(this.roomHalfW * 2.6, this.ceilingY * 1.3, this.roomHalfD * 2.6);
        this.airNoiseMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 },
                uDensity: { value: 0.036 },
                uColor: { value: new THREE.Color(0x8899b0) }
            },
            vertexShader: `
                varying vec3 vWorldPos;
                void main() {
                    vec4 wp = modelMatrix * vec4(position, 1.0);
                    vWorldPos = wp.xyz;
                    gl_Position = projectionMatrix * viewMatrix * wp;
                }
            `,
            fragmentShader: `
                varying vec3 vWorldPos;
                uniform float uTime;
                uniform float uDensity;
                uniform vec3 uColor;

                float hash13(vec3 p) {
                    p = fract(p * 0.1031);
                    p += dot(p, p.yzx + 33.33);
                    return fract((p.x + p.y) * p.z);
                }

                float noise3(vec3 p) {
                    vec3 i = floor(p);
                    vec3 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);

                    float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
                    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
                    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
                    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
                    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
                    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
                    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
                    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));

                    float nx00 = mix(n000, n100, f.x);
                    float nx10 = mix(n010, n110, f.x);
                    float nx01 = mix(n001, n101, f.x);
                    float nx11 = mix(n011, n111, f.x);
                    float nxy0 = mix(nx00, nx10, f.y);
                    float nxy1 = mix(nx01, nx11, f.y);
                    return mix(nxy0, nxy1, f.z);
                }

                float fbm(vec3 p) {
                    float a = 0.5;
                    float s = 0.0;
                    for (int i = 0; i < 4; i++) {
                        s += a * noise3(p);
                        p = p * 2.03 + vec3(17.1, 3.7, 11.9);
                        a *= 0.5;
                    }
                    return s;
                }

                void main() {
                    vec3 p = vWorldPos * 0.0012 + vec3(0.0, uTime * 0.02, uTime * 0.012);
                    float n = fbm(p);
                    float vertical = smoothstep(-500.0, 2500.0, vWorldPos.y);
                    float alpha = uDensity * (0.22 + n * 0.34) * vertical;
                    gl_FragColor = vec4(uColor, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.BackSide,
            blending: THREE.NormalBlending
        });

        this.airNoiseVolume = new THREE.Mesh(volumeGeo, this.airNoiseMaterial);
        this.airNoiseVolume.position.set(0, this.floorTopY + (this.ceilingY - this.floorTopY) * 0.55, 0);
        this.scene.add(this.airNoiseVolume);
    }

    async setup() {
        if (this.initialized) return;
        await super.setup();

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        const Lexp = this.sceneLightingScale ?? 1;
        this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.3, 0.58, Lexp);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        const bgc = this.sceneBackgroundColor ?? 0xffffff;
        this.scene.background = new THREE.Color(bgc);
        if (typeof this.scene.environmentIntensity === 'number') {
            this.scene.environmentIntensity = 0.38;
        }
        this.scene.fog = this.useSceneFog
            ? new THREE.FogExp2(this.sceneFogColor ?? 0xffffff, this.sceneFogDensity ?? 0.000072)
            : null;

        if (this.camera.fov < 35 || this.camera.fov > 50) {
            this.camera.fov = 42;
        }
        this.camera.near = 12;
        this.camera.far = 120000;
        this.camera.updateProjectionMatrix();
        this._trailCenter.set(0, this.floorTopY + (this.ceilingY - this.floorTopY) * 0.33, 0);
        this._trailHeadPos.set(0, this._trailCenter.y, 0);
        this._trailHeadDir.set(0, 0.06, 1).normalize();
        this._trailHeadPosShard.copy(this._trailHeadPos);
        this._trailHeadDirShard.copy(this._trailHeadDir);
        this._trailHeadPosCylinder.copy(this._trailHeadPos).add(new THREE.Vector3(140, 40, -120));
        this._trailHeadDirCylinder
            .set(0.35 + Math.random() * 0.4, 0.25 + Math.random() * 0.35, 0.75 + Math.random() * 0.25)
            .normalize();
        this._lastShardPos.copy(this._trailHeadPosShard);
        this._lastCylinderWorldPos.copy(this._trailHeadPosCylinder);
        this._cylinderHelixPhase = 0;

        this._pianoRollLaneIndex = 0;

        this.setupEnvironment();

        this.cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
            generateMipmaps: true,
            minFilter: THREE.LinearMipmapLinearFilter
        });
        this.cubeCamera = new THREE.CubeCamera(10, 12000, this.cubeRenderTarget);
        this.cubeCamera.position.set(0, 600, 0);
        this.scene.add(this.cubeCamera);

        this.buildRoom();

        {
            const tW = this.roadHalfWidth * 2 + 800;
            const tBehind = 6000;
            const tAhead = 16000;
            const tDepth = tBehind + tAhead;
            const segX = 128;
            const segZ = 160;
            const eps = Math.max(3.5, Math.min(tW / segX, tDepth / segZ) * 0.4);
            this._terrainMat = createSSETerrainGPUMaterial({
                yOffset: this.floorTopY ?? 0,
                terrainEps: eps,
                envMap: this.scene.environment,
                envMapIntensity: THREE.MathUtils.lerp(0.04, 0.1, Lexp),
                roughness: 1,
                metalness: 0
            });
            this._terrainOffsetUniform = this._terrainMat.userData.worldOffsetUniform;
            this._terrainOffsetUniform.value.set(0, this._roadCameraZ);

            const geo = this._buildTerrainPlane(tW, -tBehind, tAhead, segX, segZ);
            this._terrainMesh = new THREE.Mesh(geo, this._terrainMat);
            this._terrainMesh.frustumCulled = false;
            this._terrainMesh.receiveShadow = true;
            this._terrainMesh.castShadow = false;
            this.roomGroup.add(this._terrainMesh);
        }

        this.setupLights();

        this._spawnFocusWorld.set(0, this.floorTopY + 380, this._roadCameraZ + this.roadLookAhead * 0.35);
        this._cameraFocusSmoothed.copy(this._spawnFocusWorld);
        this.updateCamera();

        if (this.calloutSystem) {
            this.calloutSystem.setScene(this.scene);
        }

        this.setupCameraParticleDistances();
        this.initPostProcessing();
        this.setParticleCount(this.maxTrack9Spheres);
        this.initialized = true;
    }

    /**
     * SceneBase.update は onUpdate より前に updateCamera() を呼ぶ。
     * 論理進行 _roadCameraZ と地形チャンクスクロールを先に処理してから super.update する。
     */
    update(deltaTime) {
        if (this.initialized) {
            const zMax = this.roomHalfD - 6000;
            const zMin = -this.roomHalfD + 10000;
            const v = this._getRoadForwardSpeed();
            const dzWorld = v * deltaTime;
            this._roadCameraZ += dzWorld;
            if (this._roadCameraZ > zMax) {
                this._roadCameraZ = zMin;
                this._pianoRollLaneIndex = 0;
            }

            if (this._terrainMesh) {
                this._terrainMesh.position.z -= dzWorld;

                const snap = this._terrainSnapThreshold;
                if (Math.abs(this._terrainMesh.position.z) > snap) {
                    const jumpZ = this._terrainMesh.position.z;
                    this._terrainMesh.position.z = 0;
                    this._terrainOffsetUniform.value.y -= jumpZ;
                }
            }

            this._applyRoadScrollDeltaToWorldObjects(-v * deltaTime);
        }
        super.update(deltaTime);
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;

        this._updateFadeOpacity();
        this.pruneExpiredCylinders();
        this._updateRedCylinderBurstParticles(deltaTime);
        this._tickTrack9DurationSpawn();
        this._updateTrack9SpherePhysics(deltaTime);

        const targetTrack7 = this.trackEffects[7] ? this.trackValues[7] || 0 : 0;
        const colorLerpSpeed = targetTrack7 > 0 ? 3.0 : 0.35;
        this.smoothTrack7Color += (targetTrack7 - this.smoothTrack7Color) * deltaTime * colorLerpSpeed;
        const t7 = this.smoothTrack7Color;

        if (this.trackEffects[7] && t7 > 0.02) {
            const hue = (t7 * 0.82 + this.time * 0.16) % 1;
            this.targetPulseColor.setHSL(hue, 0.9, 0.52);
        } else {
            this.targetPulseColor.copy(this.colors[this.colorIndex]);
        }

        this.pulseColor.lerp(this.targetPulseColor, 0.5);

        this.lightIntensity += (this.targetLightIntensity - this.lightIntensity) * 0.15;
        if (this.pulsePointLight) {
            this.pulsePointLight.intensity = this.lightIntensity;
            this.pulsePointLight.color.copy(this.pulseColor);
            this.pulsePointLight.position.copy(this._cameraFocusSmoothed);
        }
        this.targetLightIntensity += (0.0 - this.targetLightIntensity) * 0.1;

        for (let i = this.pulses.length - 1; i >= 0; i--) {
            const p = this.pulses[i];
            p.progress += deltaTime * p.speed;
            if (p.progress > 1.2) {
                this.pulses.splice(i, 1);
            }
        }

        if (this.cubeCamera && Math.floor(this.time * 60) % 8 === 0) {
            const p = this.camera.position;
            this.cubeCamera.position.set(p.x, p.y + 520, p.z);
            this.cubeCamera.update(this.renderer, this.scene);
        }

        this._updateCameraFocusFromSpawns();
        {
            const smoothK = 5.2;
            const a = 1 - Math.exp(-Math.min(deltaTime, 0.12) * smoothK);
            this._cameraFocusSmoothed.lerp(this._spawnFocusWorld, a);
        }
        this.updateCamera();
        const focusTargets = [this.roomGroup];
        if (this.track9SphereGroup) focusTargets.push(this.track9SphereGroup);
        if (this.useAutoFocusDOF) {
            this.updateAutoFocus(focusTargets);
        } else if (this.bokehPass?.uniforms?.focus) {
            this.bokehPass.uniforms.focus.value = this.dofParams.focus;
        }
        const aoPass = this.ssaoPass || this.saoPass;
        if (aoPass) {
            const focusPos = this._cameraFocusSmoothed ?? this._spawnFocusWorld;
            const camDist = this.camera.position.distanceTo(focusPos);
            const nearD = 900;
            const farD = 6200;
            const t = THREE.MathUtils.clamp((camDist - nearD) / (farD - nearD), 0, 1);
            const aoScale = THREE.MathUtils.lerp(1.0, this.ssaoFarAttenuation, t);
            if ('kernelRadius' in aoPass) aoPass.kernelRadius = this.ssaoNearKernelRadius * aoScale;
            if ('minDistance' in aoPass) aoPass.minDistance = this.ssaoNearMinDistance * aoScale;
            if ('maxDistance' in aoPass) aoPass.maxDistance = this.ssaoNearMaxDistance * aoScale;
            this._syncAODepthAndCameraUniforms(aoPass);
        }

        if (this.calloutSystem) {
            this.calloutSystem.update(deltaTime, this.time, this.camera, {
                autoGenerate: false,
                maxCount: 8,
                margin: 200
            });
        }

        this._updateWallLaserScan();
    }

    _initLaserScan() {
        if (this.laserScanMesh) return;
        this._laserScanMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0a0a,
            emissive: 0xff0033,
            emissiveIntensity: 32,
            metalness: 0,
            roughness: 0.22,
            fog: true,
            side: THREE.DoubleSide
        });
        const geo = new THREE.PlaneGeometry(1, 1);
        this.laserScanMesh = new THREE.Mesh(geo, this._laserScanMaterial);
        this.laserScanMesh.frustumCulled = false;
        this.laserScanMesh.renderOrder = 2;
        this.scene.add(this.laserScanMesh);
    }

    _laserMeasurePhase() {
        const tpm = Scene22.TICK_LOOP / 96;
        if (this.actualTick != null && Number.isFinite(Number(this.actualTick))) {
            const t = Number(this.actualTick);
            const mod = ((Math.floor(t) % tpm) + tpm) % tpm;
            return mod / tpm;
        }
        const beat = this.time * 0.52;
        return beat - Math.floor(beat);
    }

    _updateWallLaserScan() {
        if (!this.laserScanMesh) return;

        const hw = this.roomHalfW;
        const hd = this.roomHalfD;
        const inset = 44;
        const iw = hw - inset;
        const id = hd - inset;
        const edgeX = 2 * iw;
        const edgeZ = 2 * id;
        const P = 2 * edgeX + 2 * edgeZ;
        const phase = this._laserMeasurePhase();
        const s = phase * P;
        const beamW = Math.min(2200, edgeX * 0.48, edgeZ * 0.48);
        const y = this._wallCenterY;

        let x;
        let z;
        let rotY;
        let segLen;

        if (s < edgeX) {
            x = -iw + s;
            z = -id;
            rotY = 0;
            segLen = edgeX;
        } else if (s < edgeX + edgeZ) {
            const u = s - edgeX;
            x = iw;
            z = -id + u;
            rotY = Math.PI / 2;
            segLen = edgeZ;
        } else if (s < edgeX + edgeZ + edgeX) {
            const u = s - edgeX - edgeZ;
            x = iw - u;
            z = id;
            rotY = Math.PI;
            segLen = edgeX;
        } else {
            const u = s - edgeX - edgeZ - edgeX;
            x = -iw;
            z = id - u;
            rotY = -Math.PI / 2;
            segLen = edgeZ;
        }

        const w = Math.min(beamW, segLen * 0.98);
        const h = 56;
        this.laserScanMesh.scale.set(w, h, 1);
        this.laserScanMesh.position.set(x, y, z);
        this.laserScanMesh.rotation.set(0, rotY, 0);
    }

    handleTrackNumber(trackNumber, message) {
        const tn = Scene22.parseTrackNumber(trackNumber, message);
        if (tn === null) return;

        const args = message.args || [];
        const velocity = args[1] !== undefined ? args[1] : 127;
        const value = velocity / 127.0;

        if (tn === 5) {
            this.trackValues[5] = value;
        } else if (tn === 6) {
            this.trackValues[6] = value;
        } else if (tn === 7) {
            this.trackValues[7] = value;
            if (velocity > 0) {
                this.colorIndex = (this.colorIndex + 1) % this.colors.length;
            }
        } else if (tn === 8) {
            this.trackValues[8] = value;
            const durRaw = args[2] !== undefined ? Number(args[2]) : 180;
            const durationMs = Number.isFinite(durRaw) ? Math.max(1, durRaw) : 180;
            const noteRaw = args[0] !== undefined ? Number(args[0]) : 64;
            const noteNumber = Number.isFinite(noteRaw) ? noteRaw : 64;
            if (velocity > 0) {
                this.spawnRedCylinderFromRoad(velocity, durationMs, noteNumber);
            }
        } else if (tn === 9) {
            this.trackValues[9] = value;
            const durRaw = args[2] !== undefined ? Number(args[2]) : 180;
            const durationMs = Number.isFinite(durRaw) ? Math.max(1, durRaw) : 180;
            if (velocity > 0) {
                this._track9SpawnWindowVelocity = velocity;
                if (this.track9SpawnDuringDuration) {
                    this._track9SpawnWindowEndMs = performance.now() + durationMs;
                    this._track9LastDurationSpawnMs = performance.now();
                }
                this.spawnTrack9SphereFromWorldCenter(velocity);
            } else {
                this._track9SpawnWindowEndMs = 0;
            }
        }
    }

    toggleEffect(trackNumber) {
        if (trackNumber === 7) {
            this.colorIndex = (this.colorIndex + 1) % this.colors.length;
            this.targetPulseColor.copy(this.colors[this.colorIndex]);
            this.pulseColor.copy(this.targetPulseColor);
        }
        super.toggleEffect(trackNumber);
    }

    initPostProcessing() {
        if (!this.composer) {
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
        }
        if (this.useSSAO && !this.ssaoPass) {
            this.ssaoPass = new SSAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
            this.ssaoPass.kernelRadius = this.ssaoNearKernelRadius;
            this.ssaoPass.minDistance = this.ssaoNearMinDistance;
            this.ssaoPass.maxDistance = this.ssaoNearMaxDistance;
            this.composer.addPass(this.ssaoPass);
            this._syncAODepthAndCameraUniforms(this.ssaoPass);
        }
        if (this.useBloom) {
            this.bloomPass = new UnrealBloomPass(
                new THREE.Vector2(Math.max(64, window.innerWidth / 6), Math.max(64, window.innerHeight / 6)),
                0.1,
                0.64,
                0.62
            );
            this.composer.addPass(this.bloomPass);
        }
        if (this.useDOF) {
            // ミニチュア感を避けるため、被写界深度を弱めてピント域を広げる。
            this.initDOF({
                focus: 2100,
                aperture: 0.0000044,
                maxblur: 0.0031
            });
        }
        if (!this.outputPass) {
            this.outputPass = new OutputPass();
            this.composer.addPass(this.outputPass);
        }
        this.addFilmGrainIfEnabled(0.05, false);
    }

    _syncAODepthAndCameraUniforms(aoPass) {
        if (!aoPass) return;
        if (!this.aoDepthTexture && this.composer?.renderTarget1) {
            const size = this.renderer.getSize(new THREE.Vector2());
            const ratio = this.renderer.getPixelRatio();
            const w = Math.max(1, Math.floor(size.x * ratio));
            const h = Math.max(1, Math.floor(size.y * ratio));
            this.aoDepthTexture = new THREE.DepthTexture(w, h);
            this.aoDepthTexture.type = THREE.UnsignedIntType;
            this.aoDepthTexture.format = THREE.DepthFormat;
            this.composer.renderTarget1.depthTexture = this.aoDepthTexture;
            this.composer.renderTarget1.depthBuffer = true;
        }

        const candidateDepth =
            aoPass.beautyRenderTarget?.depthTexture ||
            aoPass.normalRenderTarget?.depthTexture ||
            aoPass.depthRenderTarget?.depthTexture ||
            this.aoDepthTexture ||
            null;

        const maybeMaterials = [
            aoPass.ssaoMaterial,
            aoPass.saoMaterial,
            aoPass.materialAO,
            aoPass.vBlurMaterial,
            aoPass.hBlurMaterial
        ];

        for (const m of maybeMaterials) {
            const u = m?.uniforms;
            if (!u) continue;
            if (u.cameraNear) u.cameraNear.value = this.camera.near;
            if (u.cameraFar) u.cameraFar.value = this.camera.far;
            if (u.tDepth && candidateDepth) u.tDepth.value = candidateDepth;
        }
    }

    onResize() {
        super.onResize();
        if (this.ssaoPass && typeof this.ssaoPass.setSize === 'function') {
            this.ssaoPass.setSize(window.innerWidth, window.innerHeight);
        }
        if (this.saoPass && typeof this.saoPass.setSize === 'function') {
            this.saoPass.setSize(window.innerWidth, window.innerHeight);
        }
        if (this.aoDepthTexture) {
            const ratio = this.renderer.getPixelRatio();
            this.aoDepthTexture.image.width = Math.max(1, Math.floor(window.innerWidth * ratio));
            this.aoDepthTexture.image.height = Math.max(1, Math.floor(window.innerHeight * ratio));
            this.aoDepthTexture.needsUpdate = true;
        }
        this._syncAODepthAndCameraUniforms(this.ssaoPass || this.saoPass);
    }

    render() {
        this.renderer.setClearColor(this.sceneBackgroundColor ?? 0xffffff);
        super.render();
    }

    dispose() {
        this.initialized = false;
        if (this._terrainMesh) {
            if (this._terrainMesh.parent) this._terrainMesh.parent.remove(this._terrainMesh);
            this._terrainMesh.geometry.dispose();
            this._terrainMesh = null;
        }
        if (this._terrainMat) {
            if (this._terrainMat.customDepthMaterial) this._terrainMat.customDepthMaterial.dispose();
            this._terrainMat.dispose();
            this._terrainMat = null;
        }
        this._terrainOffsetUniform = null;
        this.scene.fog = null;

        if (this.ssaoPass) {
            if (this.composer) {
                const idx = this.composer.passes.indexOf(this.ssaoPass);
                if (idx !== -1) this.composer.passes.splice(idx, 1);
            }
            this.ssaoPass.enabled = false;
            this.ssaoPass = null;
        }
        if (this.saoPass) {
            if (this.composer) {
                const idx = this.composer.passes.indexOf(this.saoPass);
                if (idx !== -1) this.composer.passes.splice(idx, 1);
            }
            this.saoPass.enabled = false;
            this.saoPass = null;
        }
        if (this.aoDepthTexture) {
            this.aoDepthTexture.dispose();
            this.aoDepthTexture = null;
        }

        if (this.outputPass) {
            if (this.composer) {
                const idx = this.composer.passes.indexOf(this.outputPass);
                if (idx !== -1) this.composer.passes.splice(idx, 1);
            }
            this.outputPass.dispose();
            this.outputPass = null;
        }
        if (this.sunLight) {
            if (this.sunLight.target) this.scene.remove(this.sunLight.target);
            this.scene.remove(this.sunLight);
            this.sunLight.dispose();
            this.sunLight = null;
        }
        if (this.sunriseLight) {
            if (this.sunriseLight.target) this.scene.remove(this.sunriseLight.target);
            this.scene.remove(this.sunriseLight);
            this.sunriseLight.dispose();
            this.sunriseLight = null;
        }
        if (this.hemisphereLight) {
            this.scene.remove(this.hemisphereLight);
            this.hemisphereLight.dispose();
            this.hemisphereLight = null;
        }
        if (this.ambientLight) {
            this.scene.remove(this.ambientLight);
            this.ambientLight.dispose();
            this.ambientLight = null;
        }

        if (this.wallTitleGroup) {
            this.scene.remove(this.wallTitleGroup);
            this.wallTitleGroup.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
            });
            this.wallTitleGroup = null;
        }
        if (this._wallTitleMaterial) {
            this._wallTitleMaterial.dispose();
            this._wallTitleMaterial = null;
        }

        if (this.shardGroup) {
            this.scene.remove(this.shardGroup);
            this.shards = [];
            if (this.shardInstMesh) {
                if (this.shardInstMesh.geometry) this.shardInstMesh.geometry.dispose();
                this.shardInstMesh.dispose();
                this.shardInstMesh = null;
            }
            this._shardOpacityAttr = null;
            this._shardFreeSlots = [];
            this._metalShardMaterial = null;
            this.shardGroup = null;
        }

        if (this.cylinderInstMesh) {
            this.scene.remove(this.cylinderInstMesh);
            this.cylinderInstMesh.dispose();
            this.cylinderInstMesh = null;
            this.cylinders = [];
            this._cylinderFreeSlots = [];
            this._redCylinderMaterial = null;
        }
        if (this.redBurstInstMesh) {
            this.scene.remove(this.redBurstInstMesh);
            this.redBurstInstMesh.dispose();
            this.redBurstInstMesh = null;
        }
        if (this.redBurstSharedGeo) {
            this.redBurstSharedGeo.dispose();
            this.redBurstSharedGeo = null;
        }
        if (this.redBurstMaterial) {
            this.redBurstMaterial.dispose();
            this.redBurstMaterial = null;
        }
        this._redBurstPositions = null;
        this._redBurstVelocities = null;
        this._redBurstColors = null;
        this._redBurstRotQuats = null;
        this._redBurstScales = null;
        this._redBurstActive = false;
        if (this.obsidianInstMesh) {
            this.scene.remove(this.obsidianInstMesh);
            this.obsidianInstMesh.dispose();
            this.obsidianInstMesh = null;
        }
        if (this.obsidianGeometry) {
            this.obsidianGeometry.dispose();
            this.obsidianGeometry = null;
        }
        if (this.obsidianMaterial) {
            this.obsidianMaterial.dispose();
            this.obsidianMaterial = null;
        }
        if (this.obsidianBumpMap) {
            this.obsidianBumpMap.dispose();
            this.obsidianBumpMap = null;
        }
        this._obsidianPositions = null;
        this._obsidianVelocities = null;
        this._obsidianRotQuats = null;
        this._obsidianScales = null;

        if (this.ambientInstManager) {
            this.ambientInstManager.dispose();
            this.ambientInstManager = null;
        }
        this.ambientParticles = [];
        this._ambientLiving = [];
        this._ambientFreeSlots = [];

        if (this.track9SphereGroup) {
            this.scene.remove(this.track9SphereGroup);
            for (const sp of this.track9Spheres) {
                if (sp.mesh && sp.mesh.material) sp.mesh.material.dispose();
            }
            this.track9Spheres = [];
            if (this.track9SharedGeo) {
                this.track9SharedGeo.dispose();
                this.track9SharedGeo = null;
            }
            if (this._track9SphereMaterial) {
                if (this._track9SphereMaterial.map) this._track9SphereMaterial.map.dispose();
                if (this._track9SphereMaterial.bumpMap) this._track9SphereMaterial.bumpMap.dispose();
                this._track9SphereMaterial.dispose();
                this._track9SphereMaterial = null;
            }
            this._track9FleshTextures = null;
            this.track9SphereGroup = null;
        }

        if (this.laserScanMesh) {
            this.scene.remove(this.laserScanMesh);
            if (this.laserScanMesh.geometry) this.laserScanMesh.geometry.dispose();
            if (this._laserScanMaterial) {
                this._laserScanMaterial.dispose();
                this._laserScanMaterial = null;
            }
            this.laserScanMesh = null;
        }

        if (this.airNoiseVolume) {
            this.scene.remove(this.airNoiseVolume);
            if (this.airNoiseVolume.geometry) this.airNoiseVolume.geometry.dispose();
            this.airNoiseVolume = null;
        }
        if (this.airNoiseMaterial) {
            this.airNoiseMaterial.dispose();
            this.airNoiseMaterial = null;
        }

        if (this.cubeCamera) {
            this.scene.remove(this.cubeCamera);
            this.cubeCamera = null;
        }
        if (this.cubeRenderTarget) {
            this.cubeRenderTarget.dispose();
            this.cubeRenderTarget = null;
        }

        if (this.roomGroup) {
            this.scene.remove(this.roomGroup);
            const seenMats = new Set();
            const seenTex = new Set();
            this.roomGroup.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material && !seenMats.has(o.material)) {
                    seenMats.add(o.material);
                    const m = o.material;
                    for (const t of [m.map, m.normalMap, m.roughnessMap, m.aoMap]) {
                        if (t && !seenTex.has(t)) {
                            seenTex.add(t);
                            t.dispose();
                        }
                    }
                    m.dispose();
                }
            });
            this.roomGroup = null;
        }
        this.ceilingMesh = null;

        if (this._roomEnvTexture) {
            this._roomEnvTexture.dispose();
            this._roomEnvTexture = null;
        }
        if (this.pmremGenerator) {
            this.pmremGenerator.dispose();
            this.pmremGenerator = null;
        }
        this.scene.environment = null;

        if (this.calloutSystem) {
            this.calloutSystem.setScene(null);
        }

        super.dispose();
    }
}
