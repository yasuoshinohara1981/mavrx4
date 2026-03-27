/**
 * Scene21: コンクリート空間（床＋壁＋StudioBox 相当の天井発光）
 * メインオブジェクト：トラック5で金属片（args[2]=デュレーションmsでサイズ、velocityで金属トーンの明るさ）
 * トラック5/6 のワールド位置は OSC /actual_tick の差分×定数＋シーケンスに応じたジッター
 * トラック9：部屋中心付近からスフィア（flesh テクスチャ＋チャコール寄せ color）を物理演算でスポーン
 * 部屋・ライト・カメラは Scene16 と同型（StudioBox の蛍光灯＋半球/環境/平行光/ポイント）
 * 床・壁は PBR コンクリート、ポストは OutputPass + ACES・SSAO・DOF・bloom・Film、白系フォグ
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
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { StudioBox } from '../../lib/StudioBox.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import { Scene16Particle } from '../scene16/Scene16Particle.js';

export class Scene21 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'mathym | Xenomist';
        /** 南壁 3D テキスト（helvetiker はラテン only - 日本語は文字化けする） */
        this.promoReleaseInfoLines = [
            '2025 SPRING - Live / installation visual suite',
            'OSC / actual_tick sync; tracks 5-9. Metal shards, cylinders, spheres, red burst -',
            'spawned in real time. DOF, SSAO, bloom, fog tied to concrete room lighting.',
            'Mastering, credits, full notes: release notes and official site.',
            'Adjust volume and brightness for your venue. mathym / Xenomist'
        ];
        this.initialized = false;
        this.sceneNumber = 21;
        this.kitNo = 21;
        this.sharedResourceManager = sharedResourceManager;

        this.studio = null;
        this.roomGroup = null;
        this.ceilingMesh = null;

        this.cubeRenderTarget = null;
        this.cubeCamera = null;

        /** トラック5で生える金属片（tick ベースパス）— GPU インスタンス（1 InstancedMesh） */
        this.shards = [];
        /** この個数を超えたら古い順に削除（安全上限）。普段は shardLifetimeMs で消える */
        this.maxShards = 2000;
        /** トラック5金属片・トラック6シリンダのサイズ倍率（比率を保ったまま拡大） */
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
        this._shardOpacityAttr = null;
        this._cylinderOpacityAttr = null;
        this.shardGroup = null;
        this.shardInstMesh = null;
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
        /** 直近スポーンしたオブジェクトのワールド座標（カメラ注視） */
        this._spawnFocusWorld = new THREE.Vector3(0, 550, 0);
        this._cameraFocusSmoothed = new THREE.Vector3(0, 550, 0);
        /** OSC actual_tick ベースのスポーン（トラック5） */
        this._lastSpawnTickTrack5 = null;
        this._snakeIndex = 0;
        this._shardSeed = Math.random() * 1000;
        this._shardHeatColor = new THREE.Color();
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
        /** FogExp2 の密度（小さいほど薄い）— 以前 0.00017 より控えめ */
        this.sceneFogDensity = 0.00009;
        /** 暖色系に寄せた霞（クール灰 0xd5d9df より R 寄り・B 弱め） */
        this.sceneFogColor = 0xdfcfc2;
        // フォグと併用するため、黒縁が出にくい弱め設定で SSAO を使う
        this.useSSAO = true;
        this.useFilmGrain = true;
        this.bloomPass = null;
        this.ssaoPass = null;
        this.saoPass = null;
        this.aoDepthTexture = null;
        this.ssaoNearKernelRadius = 8.0;
        this.ssaoNearMinDistance = 0.007;
        this.ssaoNearMaxDistance = 0.16;
        this.ssaoFarAttenuation = 0.28;
        // Scene21 は固定DOFを優先（オートフォーカスで効きが薄く見えるのを防ぐ）
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
            this.calloutSystem.setLabels(['CONCRETE', 'PBR', 'AO', 'ACES']);
        }

        /** StudioBox と同スケール（内寸の目安） */
        this.roomHalfW = 5000;
        this.roomHalfD = 5000;
        this.floorTopY = -498;
        this.ceilingY = 5500;

        /** Scene16 と同様：OSC のトラック強度（6=力, 7=色相系） */
        this.trackValues = { 6: 0, 7: 0 };
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

        /** トラック6：赤い細シリンダ（InstancedMesh） */
        this.cylinderGroup = null;
        this.cylinderInstMesh = null;
        this.cylinders = [];
        this.maxCylinders = 400;
        this.cylinderLifetimeMs = 180000;
        this._cylinderFreeSlots = [];
        this._redCylinderMaterial = null;
        this._cylinderMatrixTemp = new THREE.Matrix4();
        this._cylinderQuatTemp = new THREE.Quaternion();
        this._cylinderScaleTemp = new THREE.Vector3();
        this._cylinderPosTemp = new THREE.Vector3();
        this._cylinderDirTemp = new THREE.Vector3();
        this._cylinderAxisUp = new THREE.Vector3(0, 1, 0);
        this._lastCylinderWorldPos = new THREE.Vector3(0, 550, 0);
        this._cylinderPathDir = new THREE.Vector3(0, 0.1, 1).normalize();
        /** OSC actual_tick ベースのスポーン（トラック6） */
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
        this.maxTrack9Spheres = 80;
        this.track9SharedGeo = null;
        this._track9SphereMaterial = null;
        this._track9FleshTextures = null;
        this.track9PhysicsGrid = new Map();
        this.track9GridSize = 240;
        this._track9Gravity = new THREE.Vector3(0, -38, 0);
        this._track9SpawnPos = new THREE.Vector3();
        /** トラック9：アンビエントBoxと同じ部屋内の基準高さ（ワールド中心＝XZ=0） */
        this._track9WorldCenter = new THREE.Vector3(0, 0, 0);
        this._track9Diff = new THREE.Vector3();
        this._track9SubSteps = 2;
        /** スポーン直後、半径が 0→目標まで伸びる時間（秒） */
        this._track9BirthGrowSec = 0.42;

        /** 3D プロモテキスト（部屋内・壁面固定） */
        this.promoTextGroup = null;
        /** 南壁テキストを白く浮かせる補助スポット */
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
        const loop = Scene21.TICK_LOOP;
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
     * デュレーション → シリンダ長。極短と極長で長さ比が ~3.5 倍程度に収まるよう log で圧縮
     */
    _cylinderLengthFromDurationMs(durationMs) {
        const d = Math.max(8, Number(durationMs) || 180);
        const dMin = 20;
        const dMax = 2400;
        const tLin = THREE.MathUtils.clamp((d - dMin) / (dMax - dMin), 0, 1);
        const tLog = THREE.MathUtils.clamp(Math.log(d / dMin) / Math.log(dMax / dMin), 0, 1);
        /** log より線形寄り（0.85 でかなり線形に近い） */
        const t = THREE.MathUtils.lerp(tLog, tLin, 0.85);
        const lenMin = 140;
        const lenMax = 540;
        return THREE.MathUtils.lerp(lenMin, lenMax, t);
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

    /**
     * トラック5/6 の「最後に生えた」インスタンスのワールド位置を注視にする。
     * 両方そろっているときはスポーン時刻の新しさで重み付けブレンドし、どちらか一方だけを追う切替で迷わないようにする。
     */
    _updateCameraFocusFromSpawns() {
        const hasS = this.shards.length > 0 && this.shardInstMesh && this.shardGroup;
        const hasC = this.cylinders.length > 0 && this.cylinderInstMesh && this.cylinderGroup;

        if (!hasS && !hasC) {
            if (this.cableBlobParticle) {
                this._spawnFocusWorld.copy(this.cableBlobParticle.position);
            }
            return;
        }

        const now = performance.now();

        if (hasS) {
            const s = this.shards[this.shards.length - 1];
            this.shardInstMesh.getMatrixAt(s.slotIndex, this._shardMatrixTemp);
            this._shardPosTemp.setFromMatrixPosition(this._shardMatrixTemp);
            this.shardGroup.updateMatrixWorld(true);
            this.shardGroup.localToWorld(this._shardPosTemp);
        }
        if (hasC) {
            const c = this.cylinders[this.cylinders.length - 1];
            this.cylinderInstMesh.getMatrixAt(c.slotIndex, this._cylinderMatrixTemp);
            this._cylinderPosTemp.setFromMatrixPosition(this._cylinderMatrixTemp);
            this.cylinderGroup.updateMatrixWorld(true);
            this.cylinderGroup.localToWorld(this._cylinderPosTemp);
        }

        if (hasS && hasC) {
            const eps = 80;
            const ageS = Math.max(0, now - this.shards[this.shards.length - 1].spawnTime);
            const ageC = Math.max(0, now - this.cylinders[this.cylinders.length - 1].spawnTime);
            const wS = 1 / (eps + ageS);
            const wC = 1 / (eps + ageC);
            const inv = 1 / (wS + wC);
            this._spawnFocusWorld.copy(this._shardPosTemp).multiplyScalar(wS * inv);
            this._spawnFocusWorld.addScaledVector(this._cylinderPosTemp, wC * inv);
        } else if (hasS) {
            this._spawnFocusWorld.copy(this._shardPosTemp);
        } else {
            this._spawnFocusWorld.copy(this._cylinderPosTemp);
        }
    }

    updateCamera() {
        if (this.cameraParticles[this.currentCameraIndex]) {
            const cp = this.cameraParticles[this.currentCameraIndex];
            const cameraPos = cp.getPosition();
            const dist = cameraPos.length();
            if (dist < cp.minDistance) {
                cameraPos.normalize().multiplyScalar(cp.minDistance);
            }
            this.camera.position.copy(cameraPos);
            this.camera.lookAt(
                this._cameraFocusSmoothed.x,
                this._cameraFocusSmoothed.y,
                this._cameraFocusSmoothed.z
            );
            this.camera.matrixWorldNeedsUpdate = false;
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

    /**
     * @param {number} size キャンバス解像度
     * @param {number} [maxAnisotropy=8] 斜め視点で目地がミップで消えにくいよう大きめ推奨
     */
    generateConcretePBRTextures(size = 1024, maxAnisotropy = 8) {
        const albedoCanvas = document.createElement('canvas');
        albedoCanvas.width = size;
        albedoCanvas.height = size;
        const aCtx = albedoCanvas.getContext('2d');
        const hCanvas = document.createElement('canvas');
        hCanvas.width = size;
        hCanvas.height = size;
        const hCtx = hCanvas.getContext('2d');
        const roughCanvas = document.createElement('canvas');
        roughCanvas.width = size;
        roughCanvas.height = size;
        const rCtx = roughCanvas.getContext('2d');
        const aoCanvas = document.createElement('canvas');
        aoCanvas.width = size;
        aoCanvas.height = size;
        const aoCtx = aoCanvas.getContext('2d');

        const rnd = (x, y) => {
            const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
            return s - Math.floor(s);
        };
        const smooth = (x, y) => {
            const x0 = Math.floor(x);
            const y0 = Math.floor(y);
            const fx = x - x0;
            const fy = y - y0;
            const u = fx * fx * (3 - 2 * fx);
            const v = fy * fy * (3 - 2 * fy);
            const a = rnd(x0, y0);
            const b = rnd(x0 + 1, y0);
            const c = rnd(x0, y0 + 1);
            const d = rnd(x0 + 1, y0 + 1);
            return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
        };
        const fbm = (x, y, oct) => {
            let amp = 0.5;
            let f = 0;
            let xx = x;
            let yy = y;
            for (let o = 0; o < oct; o++) {
                f += smooth(xx, yy) * amp;
                xx *= 2.05;
                yy *= 2.03;
                amp *= 0.5;
            }
            return f;
        };

        const heightData = new Float32Array(size * size);
        const roughData = new Float32Array(size * size);
        const aoData = new Float32Array(size * size);

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const u = x / size;
                const v = y / size;
                const nx = x * 0.018;
                const ny = y * 0.018;

                // ドメインウェアプ三段：ノイズで座標を歪ませ、さらにその歪みを歪める
                const w1x = fbm(ny * 0.88 + 12.3, nx * 0.62 + 4.1, 3) * 0.44;
                const w1y = fbm(nx * 0.88 + 2.7, ny * 0.62 + 8.9, 3) * 0.44;
                const qx = nx + w1x;
                const qy = ny + w1y;
                const w2x = fbm(qy * 0.58 + 1.1, qx * 0.51 + 6.0, 4) * 0.52;
                const w2y = fbm(qx * 0.58 + 7.1, qy * 0.51 + 2.3, 4) * 0.52;
                const wx = qx + w2x;
                const wy = qy + w2y;
                const w3x = fbm(wy * 0.72 + 3.0, wx * 0.66 + 0.4, 3) * 0.26;
                const w3y = fbm(wx * 0.72 + 5.0, wy * 0.66 + 8.0, 3) * 0.26;
                const warpX = wx + w3x;
                const warpY = wy + w3y;

                const nMod = 0.55 + 0.9 * fbm(nx * 0.36 + 9.5, ny * 0.34 - 2.0, 4);
                const coarse = fbm(warpX, warpY, 5) * 0.52 * nMod;
                const mid =
                    fbm(warpX * 2.2 + 10, warpY * 2.1 - 4, 4) *
                    0.28 *
                    (0.75 + 0.5 * fbm(nx * 0.2, ny * 0.19, 2));
                const ripple =
                    Math.sin(u * 40 + v * 12) * 0.04 * (0.65 + 0.7 * fbm(nx * 0.45, ny * 0.42, 2));
                const patch = fbm(nx * 0.52 + 1.9, ny * 0.5 - 0.7, 4) * 0.22;
                const patchMod = patch * (0.45 + 0.55 * fbm(warpX * 3.8, warpY * 3.8, 2));
                const grain = fbm(nx * 8.5 + 30, ny * 8.1 - 11, 3) * 0.058;
                const micro = fbm(wx * 18, wy * 17, 2) * 0.032;
                const h = coarse + mid + ripple + patchMod + grain + micro;
                heightData[y * size + x] = h;

                const rEnvelop = fbm(nx * 0.38 + 2.1, ny * 0.36 + 1.0, 3);
                const macroRough = fbm(
                    nx * (0.46 + 0.15 * rEnvelop) + 19.2,
                    ny * (0.44 + 0.12 * rEnvelop) + 6.8,
                    4
                );
                const rVar =
                    fbm(nx * 1.7 + 50 + macroRough * 0.85, ny * 1.6 - 20, 5) * 0.55 +
                    fbm(nx * 5.1, ny * 4.8, 3) * 0.35 * (0.45 + 0.55 * fbm(nx * 0.9, ny * 0.85, 2)) +
                    fbm(nx * 12 + 3, ny * 11.5 - 5, 2) * 0.14;
                const rMicro = fbm(nx * 38 + 4, ny * 37, 2) * 0.14;
                roughData[y * size + x] = THREE.MathUtils.clamp(
                    0.1 + rVar * 0.58 + macroRough * 0.42 + rMicro * 0.65,
                    0,
                    1
                );

                const cx = u - 0.5;
                const cy = v - 0.5;
                const edge = 1 - Math.min(1, Math.sqrt(cx * cx + cy * cy) * 1.85);
                const contact = Math.pow(Math.max(0, edge), 1.35);
                const stain = fbm(nx * 0.8 + 100, ny * 0.7, 3);
                const aoGrain = (fbm(nx * 2.4, ny * 2.2, 3) - 0.5) * 0.11;
                const aoNested =
                    (fbm(nx * 6.5, ny * 6.2, 3) - 0.5) * 0.09 * (0.4 + 0.6 * fbm(nx * 0.9, ny * 0.85, 2));
                aoData[y * size + x] = THREE.MathUtils.clamp(
                    0.52 + contact * 0.28 + stain * 0.08 + aoGrain + aoNested,
                    0,
                    1
                );
            }
        }

        const aImg = aCtx.createImageData(size, size);
        const nImg = aCtx.createImageData(size, size);
        const rImg = rCtx.createImageData(size, size);
        const aoImg = aoCtx.createImageData(size, size);

        const baseCol = new THREE.Color(0x8e949e);
        const cold = new THREE.Color(0x7a808a);
        const stainCol = new THREE.Color(0x5c6068);
        const pixCol = new THREE.Color();

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const i = (y * size + x) * 4;
                const h = heightData[y * size + x];
                const hx = x < size - 1 ? heightData[y * size + x + 1] : h;
                const hxm = x > 0 ? heightData[y * size + x - 1] : h;
                const hy = y < size - 1 ? heightData[(y + 1) * size + x] : h;
                const hym = y > 0 ? heightData[(y - 1) * size + x] : h;
                let dx = (hxm - hx) * 4.2;
                let dy = (hym - hy) * 4.2;
                const nxP = x * 0.018;
                const nyP = y * 0.018;
                const px = nxP + (fbm(nyP * 2.35, nxP * 2.15 + 1.7, 2) - 0.5) * 0.52;
                const py = nyP + (fbm(nxP * 2.35, nyP * 2.15 + 4.2, 2) - 0.5) * 0.52;
                const det = (fbm(px * 14 + 40, py * 13.5, 3) - 0.5) * 0.5;
                const det2 = (fbm(px * 28 + 7, py * 27, 2) - 0.5) * 0.2;
                const det3 = (fbm(px * 52 + 3, py * 50, 2) - 0.5) * 0.12;
                dx += det + det2 + det3;
                dy += (fbm(px * 14.2 + 2, py * 13.7 + 55, 3) - 0.5) * 0.5;
                dy += (fbm(px * 28.1 + 90, py * 27.2, 2) - 0.5) * 0.2;
                dy += (fbm(px * 52 + 20, py * 50 + 10, 2) - 0.5) * 0.12;
                const dLen = Math.sqrt(dx * dx + dy * dy);
                if (dLen > 0.92) {
                    const s = 0.92 / dLen;
                    dx *= s;
                    dy *= s;
                }
                const nz = Math.sqrt(Math.max(0.0001, 1 - dx * dx - dy * dy));
                const nx = dx * 0.5 + 0.5;
                const ny = dy * 0.5 + 0.5;
                const nzp = nz * 0.5 + 0.5;
                nImg.data[i] = Math.floor(nx * 255);
                nImg.data[i + 1] = Math.floor(ny * 255);
                nImg.data[i + 2] = Math.floor(nzp * 255);
                nImg.data[i + 3] = 255;

                const u = x / size;
                const v = y / size;
                const blot = fbm(x * 0.04, y * 0.04, 4);
                const drip = Math.sin(u * 90 + v * 22) * 0.5 + 0.5;
                const wear = fbm(x * 0.09 + 20, y * 0.11, 3);
                pixCol.copy(baseCol).lerp(cold, blot * 0.35);
                pixCol.lerp(stainCol, drip * 0.12 * wear);
                const toneNest =
                    0.9 +
                    0.2 *
                        fbm(x * 0.022 + 5.1, y * 0.021 - 2.4, 3) *
                        (0.45 + 0.55 * fbm(x * 0.075 + 1.2, y * 0.071 + 8.0, 2));
                pixCol.multiplyScalar((0.96 + h * 0.14) * toneNest);
                const speck = rnd(x * 0.37, y * 0.41);
                if (speck < 0.0009) {
                    pixCol.multiplyScalar(0.86 + speck * 14);
                }

                aImg.data[i] = Math.floor(pixCol.r * 255);
                aImg.data[i + 1] = Math.floor(pixCol.g * 255);
                aImg.data[i + 2] = Math.floor(pixCol.b * 255);
                aImg.data[i + 3] = 255;

                const rg = roughData[y * size + x];
                const gCh = Math.floor(rg * 255);
                rImg.data[i] = 0;
                rImg.data[i + 1] = gCh;
                rImg.data[i + 2] = 0;
                rImg.data[i + 3] = 255;

                const ao = aoData[y * size + x];
                const ar = Math.floor(ao * 255);
                aoImg.data[i] = ar;
                aoImg.data[i + 1] = ar;
                aoImg.data[i + 2] = ar;
                aoImg.data[i + 3] = 255;
            }
        }

        aCtx.putImageData(aImg, 0, 0);
        // StudioBox 床と同じ目地・赤十字・目盛りのみをコンクリート albedo に合成（質感は維持）
        const tileDiv = Scene21.TILE_OVERLAY_DIVISIONS;
        aCtx.save();
        aCtx.globalCompositeOperation = 'multiply';
        /** 既定 0.5px だと斜めから見たときミップで潰れやすいので太めに */
        StudioBox.drawGroutLines(aCtx, size, {
            strokeStyle: '#6f757c',
            divisions: tileDiv,
            lineWidth: 1.65
        });
        aCtx.restore();
        StudioBox.drawRedCrossesAndLabels(aCtx, size, tileDiv);

        /** 壁は床より掠り角になりやすく目地が薄く見えるので、同じ目地を一段だけ濃く乗せた albedo */
        const wallAlbedoCanvas = document.createElement('canvas');
        wallAlbedoCanvas.width = size;
        wallAlbedoCanvas.height = size;
        const wallACtx = wallAlbedoCanvas.getContext('2d');
        wallACtx.drawImage(albedoCanvas, 0, 0);
        wallACtx.save();
        wallACtx.globalCompositeOperation = 'multiply';
        StudioBox.drawGroutLines(wallACtx, size, {
            strokeStyle: '#5a6169',
            divisions: tileDiv,
            lineWidth: 1.2
        });
        wallACtx.restore();

        hCtx.putImageData(nImg, 0, 0);
        rCtx.putImageData(rImg, 0, 0);
        aoCtx.putImageData(aoImg, 0, 0);

        const wrap = (canvasTex, linearColor = false) => {
            canvasTex.wrapS = canvasTex.wrapT = THREE.RepeatWrapping;
            canvasTex.colorSpace = linearColor ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
            canvasTex.anisotropy = maxAnisotropy;
            canvasTex.needsUpdate = true;
        };

        const map = new THREE.CanvasTexture(albedoCanvas);
        wrap(map, false);

        const wallMap = new THREE.CanvasTexture(wallAlbedoCanvas);
        wrap(wallMap, false);

        const normalMap = new THREE.CanvasTexture(hCanvas);
        wrap(normalMap, true);

        const roughnessMap = new THREE.CanvasTexture(roughCanvas);
        wrap(roughnessMap, true);

        const aoMap = new THREE.CanvasTexture(aoCanvas);
        wrap(aoMap, true);

        return { map, wallMap, normalMap, roughnessMap, aoMap };
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

    buildRoom(textures) {
        /** 小さいほどテクスチャ1周がワールドで広がり、タイル1枚が大きく見える */
        const repeat = 1.55;
        ['map', 'wallMap', 'normalMap', 'roughnessMap', 'aoMap'].forEach((k) => {
            const t = textures[k];
            if (t) {
                t.repeat.set(repeat, repeat);
            }
        });

        /** 床用。壁は正面から見えて法線が弱く見えるので別マテで凹凸を強める。壁は目地を一段濃くした wallMap */
        const floorConcreteMat = new THREE.MeshStandardMaterial({
            color: 0xe8eaee,
            map: textures.map,
            normalMap: textures.normalMap,
            normalScale: new THREE.Vector2(0.44, 0.44),
            roughnessMap: textures.roughnessMap,
            roughness: 0.9,
            metalness: 0,
            aoMap: textures.aoMap,
            aoMapIntensity: 0.5,
            envMapIntensity: 0.95 * (0.55 + 0.45 * (this.sceneLightingScale ?? 1)),
            fog: true
        });
        const wallConcreteMat = floorConcreteMat.clone();
        wallConcreteMat.map = textures.wallMap || textures.map;
        wallConcreteMat.normalScale = new THREE.Vector2(0.64, 0.64);
        wallConcreteMat.roughness = 0.86;

        this.roomGroup = new THREE.Group();
        const hw = this.roomHalfW;
        const hd = this.roomHalfD;
        const floorTopY = this.floorTopY;
        const ceilingY = this.ceilingY;
        const wallH = ceilingY - floorTopY;
        const wallCenterY = floorTopY + wallH * 0.5;
        const slab = 24;

        const floorGeo = new THREE.BoxGeometry(hw * 2, slab, hd * 2, 1, 1, 1);
        this.ensureUv2(floorGeo);
        const floor = new THREE.Mesh(floorGeo, floorConcreteMat);
        floor.position.set(0, floorTopY - slab * 0.5, 0);
        floor.receiveShadow = true;
        floor.castShadow = false;
        this.roomGroup.add(floor);

        const mkWall = (w, height, d, px, py, pz) => {
            const geo = new THREE.BoxGeometry(w, height, d, 1, 1, 1);
            this.ensureUv2(geo);
            const mesh = new THREE.Mesh(geo, wallConcreteMat);
            mesh.position.set(px, py, pz);
            mesh.receiveShadow = true;
            mesh.castShadow = true;
            this.roomGroup.add(mesh);
        };

        mkWall(slab, wallH, hd * 2, -hw - slab * 0.5, wallCenterY, 0);
        mkWall(slab, wallH, hd * 2, hw + slab * 0.5, wallCenterY, 0);
        mkWall(hw * 2, wallH, slab, 0, wallCenterY, -hd - slab * 0.5);
        mkWall(hw * 2, wallH, slab, 0, wallCenterY, hd + slab * 0.5);

        const ceilingGeo = new THREE.PlaneGeometry(hw * 2, hd * 2);
        ceilingGeo.rotateX(Math.PI / 2);
        const ceilingMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            roughness: 0.8,
            metalness: 0,
            emissive: 0xffffff,
            emissiveIntensity: 8.5 * (this.sceneLightingScale ?? 1),
            envMapIntensity: 1.0,
            fog: true
        });
        this.ceilingMesh = new THREE.Mesh(ceilingGeo, ceilingMat);
        this.ceilingMesh.position.set(0, ceilingY, 0);
        this.ceilingMesh.receiveShadow = false;
        this.ceilingMesh.castShadow = false;
        this.roomGroup.add(this.ceilingMesh);

        this.scene.add(this.roomGroup);
    }

    _shardNoise(x, y, z) {
        const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
        return n - Math.floor(n);
    }

    /** 0–127 以外に OSC が 0–1 float を送る場合も正規化 */
    normalizeMidiVelocity(v) {
        if (v === undefined || v === null) return 127;
        const n = Number(v);
        if (!Number.isFinite(n)) return 127;
        if (n >= 0 && n <= 1) return Math.round(n * 127);
        return THREE.MathUtils.clamp(Math.round(n), 0, 127);
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

    /**
     * トラック5：位置は actual_tick 差分×定数。進行方向はノイズでねじる。
     * durationMs: デュレーション（ms）でスケール。velocity: 金属色の明るさ。
     */
    spawnMetalShardFromTrack5(velocity, durationMs = 180) {
        if (!this.shardGroup || !this._metalShardMaterial || !this.shardInstMesh) return;

        const vMidi = this.normalizeMidiVelocity(velocity);

        const tick = Math.floor(this.actualTick ?? 0);
        const deltaTick = this._tickDelta(tick, this._lastSpawnTickTrack5);
        this._lastSpawnTickTrack5 = tick;

        const si = this._snakeIndex;
        const worldUp = new THREE.Vector3(0, 1, 0);
        let side = new THREE.Vector3().crossVectors(worldUp, this._snakeDir);
        if (side.lengthSq() < 1e-8) {
            side.crossVectors(new THREE.Vector3(1, 0, 0), this._snakeDir);
        }
        side.normalize();
        this._snakeDir.applyAxisAngle(worldUp, (this._shardNoise(si * 0.31, 1.2, 3.4) - 0.5) * 0.44);
        this._snakeDir.applyAxisAngle(side, (this._shardNoise(2.1, si * 0.29, 4.4) - 0.5) * 0.38);
        this._snakeDir.normalize();

        const stepLen = deltaTick * Scene21.METERS_PER_TICK_SHARD;
        const newPos = this._spawnWorldPosTemp;
        newPos.copy(this._lastShardPos).addScaledVector(this._snakeDir, stepLen);
        this._applySequenceAwareJitter(newPos, deltaTick, this._snakeDir, si + tick * 0.0007, si * 1.7);

        newPos.x = THREE.MathUtils.clamp(newPos.x, -this.roomHalfW + 140, this.roomHalfW - 140);
        newPos.z = THREE.MathUtils.clamp(newPos.z, -this.roomHalfD + 140, this.roomHalfD - 140);
        newPos.y = THREE.MathUtils.clamp(newPos.y, this.floorTopY + 90, this.ceilingY * 0.46);

        const fwd = this._snakeDir.clone().normalize();
        const qSnake = new THREE.Quaternion();
        const zAxis = new THREE.Vector3(0, 0, 1);
        if (Math.abs(zAxis.dot(fwd)) > 0.998) {
            qSnake.setFromAxisAngle(new THREE.Vector3(1, 0, 0), fwd.z < 0 ? Math.PI : 0);
        } else {
            qSnake.setFromUnitVectors(zAxis, fwd);
        }
        const rapid = 0.72;
        const roll = (this._shardNoise(si, 7.1, 0.3) - 0.5) * Math.PI * (0.88 + rapid * 0.45);
        const qRoll = new THREE.Quaternion().setFromAxisAngle(fwd, roll);
        const nx = (this._shardNoise(si, 4.2, 1.1) - 0.5) * (1.15 + rapid * 0.35);
        const ny = (this._shardNoise(si, 5.3, 2.2) - 0.5) * (1.15 + rapid * 0.35);
        const nz = (this._shardNoise(si, 6.4, 3.3) - 0.5) * (0.95 + rapid * 0.45);
        const qN = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(nx * Math.PI * 0.55, ny * Math.PI * 0.55, nz * Math.PI * 0.55, 'YXZ')
        );
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

    /** 空きスロットを取得（上限時は最古を再利用） */
    _allocShardSlot() {
        if (this.shards.length >= this.maxShards) {
            const old = this.shards.shift();
            this._clearShardSlot(old.slotIndex);
            return old.slotIndex;
        }
        return this._shardFreeSlots.pop();
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
        Scene21._applyInstanceOpacityShader(this._metalShardMaterial);

        const shardGeo = new THREE.TetrahedronGeometry(1, 0);
        this._shardOpacityAttr = Scene21._attachInstanceOpacityAttribute(shardGeo, this.maxShards);
        this.shardInstMesh = new THREE.InstancedMesh(shardGeo, this._metalShardMaterial, this.maxShards);
        this.shardInstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.shardInstMesh.frustumCulled = false;
        this.shardInstMesh.castShadow = true;
        this.shardInstMesh.receiveShadow = true;
        this.shardGroup.add(this.shardInstMesh);

        this._shardFreeSlots = [];
        for (let i = this.maxShards - 1; i >= 0; i--) {
            this._shardFreeSlots.push(i);
        }
        for (let i = 0; i < this.maxShards; i++) {
            this._clearShardSlot(i);
        }
        this.shardInstMesh.instanceMatrix.needsUpdate = true;

        const hideColor = new THREE.Color(0x000000);
        for (let i = 0; i < this.maxShards; i++) {
            this.shardInstMesh.setColorAt(i, hideColor);
        }
        if (this.shardInstMesh.instanceColor) {
            this.shardInstMesh.instanceColor.needsUpdate = true;
        }
    }

    initRedCylinderSystem() {
        this.cylinderGroup = new THREE.Group();
        this.cylinderGroup.position.set(0, 0, 0);
        this.scene.add(this.cylinderGroup);

        /** レーザーより弱い赤橙。暖色寄り＋弱エミッシブ（ブルームは控えめ） */
        this._redCylinderMaterial = new THREE.MeshStandardMaterial({
            color: 0xcc4624,
            emissive: 0x3a1208,
            emissiveIntensity: 0.3,
            metalness: 0,
            roughness: 0.52,
            /** フォグ無効だと壁・床と霞のかかり方が違い、浮いて見えやすい */
            fog: true,
            opacity: 1
        });
        Scene21._applyRedCylinderShader(this._redCylinderMaterial);

        const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 6);
        this._cylinderOpacityAttr = Scene21._attachInstanceOpacityAttribute(cylGeo, this.maxCylinders);
        this.cylinderInstMesh = new THREE.InstancedMesh(cylGeo, this._redCylinderMaterial, this.maxCylinders);
        this.cylinderInstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.cylinderInstMesh.frustumCulled = false;
        this.cylinderInstMesh.castShadow = true;
        this.cylinderInstMesh.receiveShadow = true;
        this.cylinderGroup.add(this.cylinderInstMesh);

        this._cylinderFreeSlots = [];
        for (let i = this.maxCylinders - 1; i >= 0; i--) {
            this._cylinderFreeSlots.push(i);
        }
        for (let i = 0; i < this.maxCylinders; i++) {
            this._clearCylinderSlot(i);
        }
        this.cylinderInstMesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * トラック6：赤いシリンダ。位置はトラック5と同系の tick パス＋ジッター。
     * デュレーション→長さ（緩いマッピング）、ベロシティ→半径。noteNumber は向きのばらつき用（args[0]）
     */
    spawnRedCylinderFromTrack6(velocity, durationMs = 180, noteNumber = 64) {
        if (!this.cylinderGroup || !this.cylinderInstMesh || !this._redCylinderMaterial) return;

        const vMidi = this.normalizeMidiVelocity(velocity);
        const dur = Math.max(1, Number(durationMs) || 180);
        const s = this.shardCylinderVisualScale ?? 1;
        const length = THREE.MathUtils.clamp(this._cylinderLengthFromDurationMs(dur), 110, 720) * s;
        const radius = THREE.MathUtils.clamp(0.48 + (vMidi / 127) * 15.2, 0.28, 18) * s;

        const slotIndex = this._allocCylinderSlot();

        const tick = Math.floor(this.actualTick ?? 0);
        const deltaTick = this._tickDelta(tick, this._lastSpawnTickTrack6);
        this._lastSpawnTickTrack6 = tick;

        const ci = this.cylinders.length;
        const wu = new THREE.Vector3(0, 1, 0);
        let cside = new THREE.Vector3().crossVectors(wu, this._cylinderPathDir);
        if (cside.lengthSq() < 1e-8) {
            cside.crossVectors(new THREE.Vector3(1, 0, 0), this._cylinderPathDir);
        }
        cside.normalize();
        this._cylinderPathDir.applyAxisAngle(wu, (this._shardNoise(ci * 0.27, 1.1, 3.2) - 0.5) * 0.46);
        this._cylinderPathDir.applyAxisAngle(cside, (this._shardNoise(2.2, ci * 0.23, 4.0) - 0.5) * 0.4);
        this._cylinderPathDir.normalize();

        if (this.cylinders.length === 0) {
            this._lastCylinderWorldPos.copy(this._lastShardPos);
        }
        const stepLen = deltaTick * Scene21.METERS_PER_TICK_CYLINDER;
        this._cylinderPosTemp.copy(this._lastCylinderWorldPos).addScaledVector(this._cylinderPathDir, stepLen);
        this._applySequenceAwareJitter(this._cylinderPosTemp, deltaTick, this._cylinderPathDir, ci * 2.1 + tick * 0.0005, ci * 1.3 + 9.2);
        // 端に張り付き続けないよう、緩く中心へ戻す
        this._cylinderPosTemp.x *= 0.92;
        this._cylinderPosTemp.z *= 0.92;
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

        const u = Math.random() * Math.PI * 2;
        const v = Math.acos(2 * Math.random() - 1);
        this._cylinderDirTemp.set(
            Math.sin(v) * Math.cos(u),
            Math.cos(v),
            Math.sin(v) * Math.sin(u)
        );
        if (Math.abs(this._cylinderDirTemp.dot(this._cylinderAxisUp)) > 0.998) {
            this._cylinderDirTemp.x += 0.002;
            this._cylinderDirTemp.normalize();
        }
        const n = Number(noteNumber);
        const nJ = Number.isFinite(n) ? n : 64;
        this._cylinderDirTemp.applyAxisAngle(wu, (this._shardNoise(nJ * 0.07, ci * 0.13, 0.9) - 0.5) * 0.55);
        this._cylinderDirTemp.normalize();
        this._cylinderQuatTemp.setFromUnitVectors(this._cylinderAxisUp, this._cylinderDirTemp);
        this.cylinderGroup.updateMatrixWorld(true);
        this.cylinderGroup.worldToLocal(this._cylinderPosTemp);

        this._cylinderScaleTemp.set(radius * 0.02, length * 0.02, radius * 0.02);
        this._cylinderMatrixTemp.compose(this._cylinderPosTemp, this._cylinderQuatTemp, this._cylinderScaleTemp);
        this.cylinderInstMesh.setMatrixAt(slotIndex, this._cylinderMatrixTemp);
        this.cylinderInstMesh.instanceMatrix.needsUpdate = true;
        if (this._cylinderOpacityAttr) {
            this._cylinderOpacityAttr.array[slotIndex] = 1;
            this._cylinderOpacityAttr.needsUpdate = true;
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
        this.triggerRedCylinderBurst(this._lastCylinderWorldPos, velocity, durationMs);
        this._spawnAmbientParticlesBurst(this._lastCylinderWorldPos, this.ambientParticlesPerCylinder);
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
    }

    pruneExpiredCylinders() {
        if (!this.cylinders.length || !this.cylinderGroup) return;
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
            const fx = px * curlFreq;
            const fy = py * curlFreq;
            const fz = pz * curlFreq;
            // 拡散運動にカールノイズ風ベクトル場を加えて、渦感を出す
            const curlX = -Math.cos(fz * 1.9 - tt * 1.1);
            const curlY = -Math.cos(fx * 1.6 + tt * 1.7);
            const curlZ = -Math.cos(fy * 1.7 + tt * 1.3);
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

    /** トラック9：generateFleshTextures の map/bump ＋ color で明るめグレー寄せ */
    initTrack9SpawnSpheres() {
        this.track9SphereGroup = new THREE.Group();
        this.scene.add(this.track9SphereGroup);
        this._track9FleshTextures = this.generateFleshTextures();
        const env = this.scene.environment;
        this._track9SphereMaterial = new THREE.MeshStandardMaterial({
            map: this._track9FleshTextures.map,
            bumpMap: this._track9FleshTextures.bumpMap,
            bumpScale: 3.0,
            color: 0xd5d9df,
            metalness: 0.22,
            roughness: 0.44,
            envMap: env,
            envMapIntensity: 0.68 * (0.55 + 0.45 * (this.sceneLightingScale ?? 1)),
            emissive: 0x2a2d32,
            emissiveIntensity: 0.2,
            fog: true
        });
        this.track9SharedGeo = new THREE.SphereGeometry(1, 28, 28);
    }

    /**
     * ワールド中心（XZ=0）＋部屋内の代表高さ付近にスフィアを出す（アンビエントBoxと同ゾーン）。velocity で半径と初速。
     */
    spawnTrack9SphereFromWorldCenter(velocity) {
        if (!this.track9SphereGroup || !this.track9SharedGeo || !this._track9SphereMaterial) return;

        const vMidi = this.normalizeMidiVelocity(velocity);
        const radius = THREE.MathUtils.clamp(22 + (vMidi / 127) * 76, 16, 102);

        const yMin = this.floorTopY + 220;
        const yMax = this.ceilingY * 0.4;
        const midY = (yMin + yMax) * 0.5;
        this._track9WorldCenter.set(0, midY, 0);
        this._track9SpawnPos.copy(this._track9WorldCenter);
        this._track9SpawnPos.x += (Math.random() - 0.5) * 160;
        this._track9SpawnPos.y += (Math.random() - 0.5) * 260;
        this._track9SpawnPos.z += (Math.random() - 0.5) * 160;

        const mesh = new THREE.Mesh(this.track9SharedGeo, this._track9SphereMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const position = this._track9SpawnPos.clone();
        const vel = new THREE.Vector3();
        vel.subVectors(this._track9SpawnPos, this._track9WorldCenter);
        if (vel.lengthSq() < 1e-10) {
            vel.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
        }
        vel.normalize();
        const speed = 125 + (vMidi / 127) * 340;
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
        mesh.scale.setScalar(radius * 0.015);

        this.track9SphereGroup.add(mesh);
        this.track9Spheres.push({
            mesh,
            position,
            velocity: vel,
            radius,
            radiusNow: radius * 0.015,
            birthAge: 0,
            angularVelocity
        });
        this._spawnAmbientParticlesBurst(position, this.ambientParticlesPerTrack9);

        while (this.track9Spheres.length > this.maxTrack9Spheres) {
            const old = this.track9Spheres.shift();
            this.track9SphereGroup.remove(old.mesh);
        }
    }

    _updateTrack9SpherePhysics(deltaTime) {
        if (!this.track9Spheres.length) return;
        const growSec = this._track9BirthGrowSec;
        for (const sp of this.track9Spheres) {
            sp.birthAge = (sp.birthAge ?? 0) + deltaTime;
            const t = Math.min(1, sp.birthAge / growSec);
            const u = t * t * (3 - 2 * t);
            sp.radiusNow = sp.radius * Math.max(u, 0.015);
        }

        const sub = this._track9SubSteps;
        const dt = deltaTime / sub;
        const grav = this._track9Gravity;
        const diff = this._track9Diff;
        const margin = 140;

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
                sp.velocity.addScaledVector(grav, dt);
                sp.position.addScaledVector(sp.velocity, dt);
                sp.velocity.multiplyScalar(0.997);

                const r = sp.radiusNow;
                const x0 = -this.roomHalfW + margin + r;
                const x1 = this.roomHalfW - margin - r;
                const z0 = -this.roomHalfD + margin + r;
                const z1 = this.roomHalfD - margin - r;
                const y0 = this.floorTopY + 90 + r;
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

    /** Scene16 と同型。sceneLightingScale で一括に暗くできる */
    setupLights() {
        const L = this.sceneLightingScale ?? 1;
        this.fillPointLight = null;
        this.pulsePointLight = null;

        this.promoWallLightTarget = new THREE.Object3D();
        this.promoWallLightTarget.position.set(0, 0, 0);
        this.scene.add(this.promoWallLightTarget);

        this.promoWallFillLight = new THREE.SpotLight(0xffffff, 2.0 * L, 26000, Math.PI / 5, 0.32, 1.0);
        this.promoWallFillLight.position.set(0, this.ceilingY - 120, 0);
        this.promoWallFillLight.castShadow = true;
        this.promoWallFillLight.target = this.promoWallLightTarget;

        this.promoWallFillLight.shadow.mapSize.width = 2048;
        this.promoWallFillLight.shadow.mapSize.height = 2048;
        this.promoWallFillLight.shadow.radius = 4;
        this.promoWallFillLight.shadow.bias = -0.00025;
        this.promoWallFillLight.shadow.camera.near = 100;
        this.promoWallFillLight.shadow.camera.far = 12000;

        this.scene.add(this.promoWallFillLight);
    }

    setupAirNoiseVolume() {
        const volumeGeo = new THREE.BoxGeometry(this.roomHalfW * 2.6, this.ceilingY * 1.3, this.roomHalfD * 2.6);
        this.airNoiseMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 },
                uDensity: { value: 0.036 },
                uColor: { value: new THREE.Color(0xffffff) }
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
        this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.42, 0.92, Lexp);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        /** フォグ色は sceneFogColor・薄さは sceneFogDensity */
        this.scene.background = new THREE.Color(0x151820);
        this.scene.fog = this.useSceneFog
            ? new THREE.FogExp2(this.sceneFogColor ?? 0xdfcfc2, this.sceneFogDensity ?? 0.00009)
            : null;

        if (this.camera.fov < 35 || this.camera.fov > 50) {
            this.camera.fov = 42;
        }
        this.camera.near = 12;
        this.camera.far = 12000;
        this.camera.updateProjectionMatrix();
        this.camera.position.set(0, 1000, 4500);
        this.camera.lookAt(0, 400, 0);

        this.setupEnvironment();

        this.cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
            generateMipmaps: true,
            minFilter: THREE.LinearMipmapLinearFilter
        });
        this.cubeCamera = new THREE.CubeCamera(10, 12000, this.cubeRenderTarget);
        this.cubeCamera.position.set(0, 600, 0);
        this.scene.add(this.cubeCamera);

        this.studio = new StudioBox(this.scene, {
            envMap: this._roomEnvTexture,
            envMapIntensity: 1.0,
            useFloorTile: false,
            lightIntensity: 22.0 * (this.sceneLightingScale ?? 1)
        });
        if (this.studio.studioBox) {
            this.studio.studioBox.visible = false;
        }

        const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
        const textures = this.generateConcretePBRTextures(1024, maxAniso);
        this.buildRoom(textures);

        const floorMat = this.roomGroup.children[0].material;
        const wallMat = this.roomGroup.children[1].material;
        this.applyEnvMapToMaterials(this.scene.environment, wallMat, floorMat);

        this.setupLights();

        this.cableBlobParticle = new Scene16Particle(0, this.cableHomeY, 0);
        this.cableBlobParticle.maxSpeed = 7.0;
        this.cableBlobParticle.maxForce = 1.5;
        this.cableBlobParticle.friction = 0.015;

        this.initMetalShardsSystem();
        this.initRedCylinderSystem();
        this.initRedCylinderBurstParticles();
        this.createAmbientFloatingParticles();
        this.initTrack9SpawnSpheres();
        if (this.cableBlobParticle && this.shardGroup) {
            this.shardGroup.position.copy(this.cableBlobParticle.position);
        }
        if (this.cableBlobParticle && this.cylinderGroup) {
            this.cylinderGroup.position.copy(this.cableBlobParticle.position);
        }
        if (this.cableBlobParticle) {
            this._spawnFocusWorld.copy(this.cableBlobParticle.position);
            this._cameraFocusSmoothed.copy(this._spawnFocusWorld);
        }

        if (this.calloutSystem) {
            this.calloutSystem.setScene(this.scene);
        }

        this.setupCameraParticleDistances();
        this.initPostProcessing();
        this.setParticleCount(this.maxShards + 8 + this.ambientParticleCount + this.maxCylinders + this.maxTrack9Spheres);
        await this._initPromoText3D();
        this._initLaserScan();
        this.initialized = true;
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;

        this._updateFadeOpacity();
        this.pruneExpiredShards();
        this.pruneExpiredCylinders();
        this._updateRedCylinderBurstParticles(deltaTime);
        this._updateAmbientParticles(deltaTime);
        if (this._ambientLiving.length < this.ambientMinLiving) {
            const p = this.shardGroup?.position ?? this._cameraFocusSmoothed ?? new THREE.Vector3(0, this.floorTopY + 600, 0);
            this._spawnAmbientParticlesBurst(p, this.ambientMinLiving - this._ambientLiving.length);
        }
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
            if (this.shardGroup) {
                this.pulsePointLight.position.copy(this.shardGroup.position);
            }
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
            this.cubeCamera.update(this.renderer, this.scene);
        }

        if (this.cableBlobParticle && this.shardGroup) {
            const home = new THREE.Vector3(0, this.cableHomeY, 0);
            const distToHome = this.cableBlobParticle.position.distanceTo(home);
            const maxRadius = 950;
            if (distToHome > maxRadius) {
                const pullStrength = (distToHome - maxRadius) * 0.11;
                const steer = home.clone().sub(this.cableBlobParticle.position).normalize().multiplyScalar(pullStrength);
                this.cableBlobParticle.addForce(steer);
            }
            if (this.cableBlobParticle.velocity.length() < 0.55) {
                const gentleForce = new THREE.Vector3(
                    Math.random() - 0.5,
                    Math.random() - 0.5,
                    Math.random() - 0.5
                )
                    .normalize()
                    .multiplyScalar(0.32);
                this.cableBlobParticle.addForce(gentleForce);
            }
            this.cableBlobParticle.update(deltaTime);
            this.shardGroup.position.copy(this.cableBlobParticle.position);
            if (this.cylinderGroup) {
                this.cylinderGroup.position.copy(this.cableBlobParticle.position);
            }

            const heartbeat = Math.pow(Math.sin(this.time * 1.0), 8.0);
            const baseScale = 1.0 + Math.sin(this.time * 0.055) * 0.045;
            const scale = baseScale + heartbeat * 0.035;
            this.shardGroup.scale.setScalar(scale);

            this.shardGroup.rotation.y += deltaTime * 0.1;
            this.shardGroup.rotation.x += deltaTime * 0.055;
            this.shardGroup.rotation.z = Math.sin(this.time * 0.38) * 0.14;
        }

        if (this.cubeCamera && this.shardGroup) {
            const p = this.shardGroup.position;
            this.cubeCamera.position.set(p.x, 600 + p.y * 0.25, p.z);
        }

        this._updateCameraFocusFromSpawns();
        {
            const both =
                this.shards.length > 0 &&
                this.cylinders.length > 0 &&
                this.shardInstMesh &&
                this.cylinderInstMesh;
            const smoothK = both ? 3.25 : 5.2;
            const a = 1 - Math.exp(-Math.min(deltaTime, 0.12) * smoothK);
            this._cameraFocusSmoothed.lerp(this._spawnFocusWorld, a);
        }
        this.updateCamera();
        const focusTargets = [this.roomGroup, this.shardGroup];
        if (this.cylinderGroup) focusTargets.push(this.cylinderGroup);
        if (this.track9SphereGroup) focusTargets.push(this.track9SphereGroup);
        if (this.ambientInstManager) focusTargets.push(this.ambientInstManager.getMainMesh());
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

        this._updatePromoTextAndLaser();
    }

    /**
     * 金属調 3D テキスト（南壁・部屋内固定）＋壁レーザー（1 小節で一周）
     */
    async _initPromoText3D() {
        if (this.promoTextGroup) return;
        const fontHref = new URL('../../../node_modules/three/examples/fonts/helvetiker_regular.typeface.json', import.meta.url).href;
        const loader = new FontLoader();
        let font;
        try {
            font = await new Promise((resolve, reject) => loader.load(fontHref, resolve, undefined, reject));
        } catch (e) {
            console.warn('Scene21: promo font load failed', e);
            return;
        }

        const env = this.scene.environment;
        const mat = new THREE.MeshStandardMaterial({
            color: 0xd4dae4,
            metalness: 0.94,
            roughness: 0.2,
            envMap: env,
            envMapIntensity: 1.15,
            emissive: 0x2a3038,
            emissiveIntensity: 0.16,
            fog: true
        });

        this.promoTextGroup = new THREE.Group();
        const headline = this.title || 'mathym | Xenomist';
        const releaseLines = this.promoReleaseInfoLines ?? [];
        const mainSize = 400;
        const mainExtrude = 92;
        const subSize = 148;
        const subExtrude = 34;
        const gapAfterHeadline = 96;
        const lineGapSub = 40;
        let yCursor = 0;

        const addLine = (text, size, height, bevelT, bevelS, gapAfter) => {
            const geo = new TextGeometry(text, {
                font,
                size,
                height,
                curveSegments: size > 200 ? 10 : 8,
                bevelEnabled: true,
                bevelThickness: bevelT,
                bevelSize: bevelS,
                bevelOffset: 0,
                bevelSegments: 2
            });
            geo.computeBoundingBox();
            const bx = geo.boundingBox;
            const cy = -(bx.max.y + bx.min.y) * 0.5;
            const cz = -(bx.max.z + bx.min.z) * 0.5;
            geo.translate(-bx.min.x, cy, cz);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.y = yCursor;
            yCursor -= size + gapAfter;
            this.promoTextGroup.add(mesh);
        };

        addLine(headline, mainSize, mainExtrude, 9, 3.8, gapAfterHeadline);
        for (let j = 0; j < releaseLines.length; j++) {
            addLine(releaseLines[j], subSize, subExtrude, 3.2, 1.35, lineGapSub);
        }

        this.promoTextGroup.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(this.promoTextGroup);
        const center = new THREE.Vector3();
        box.getCenter(center);
        const hd = this.roomHalfD;
        const zFromWall = 72;
        const zPos = -hd + zFromWall;
        this.promoTextGroup.position.set(-center.x, this._wallCenterY - center.y, zPos - center.z);
        this.promoTextGroup.rotation.y = 0;
        this.scene.add(this.promoTextGroup);
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
        const tpm = Scene21.TICK_LOOP / 96;
        if (this.actualTick != null && Number.isFinite(Number(this.actualTick))) {
            const t = Number(this.actualTick);
            const mod = ((Math.floor(t) % tpm) + tpm) % tpm;
            return mod / tpm;
        }
        const beat = this.time * 0.52;
        return beat - Math.floor(beat);
    }

    _updatePromoTextAndLaser() {
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
        const tn = Scene21.parseTrackNumber(trackNumber, message);
        if (tn === null) return;

        const args = message.args || [];
        const velocity = args[1] !== undefined ? args[1] : 127;
        const value = velocity / 127.0;

        if (tn === 5) {
            /** args[2]: デュレーション（ms）。未指定は 180 */
            if (velocity > 0) {
                const durRaw = args[2] !== undefined ? Number(args[2]) : 180;
                const durationMs = Number.isFinite(durRaw) ? durRaw : 180;
                this.spawnMetalShardFromTrack5(velocity, durationMs);
            }
        } else if (tn === 6) {
            this.trackValues[6] = value;
            if (velocity > 0) {
                const durRaw = args[2] !== undefined ? Number(args[2]) : 180;
                const durationMs = Number.isFinite(durRaw) ? durRaw : 180;
                const noteRaw = args[0] !== undefined ? Number(args[0]) : 64;
                const noteNumber = Number.isFinite(noteRaw) ? noteRaw : 64;
                this.spawnRedCylinderFromTrack6(velocity, durationMs, noteNumber);
            }
        } else if (tn === 7) {
            this.trackValues[7] = value;
            if (velocity > 0) {
                this.colorIndex = (this.colorIndex + 1) % this.colors.length;
            }
        } else if (tn === 9) {
            if (velocity > 0) {
                this.spawnTrack9SphereFromWorldCenter(velocity);
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
                0.14,
                0.68,
                0.64
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
        this.addFilmGrainIfEnabled(0.22, false);
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
        this.renderer.setClearColor(0x151820);
        super.render();
    }

    dispose() {
        this.initialized = false;
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
        if (this.studio) {
            this.studio.dispose();
            this.studio = null;
        }

        if (this.shardGroup) {
            this.scene.remove(this.shardGroup);
            this.shards = [];
            this._shardFreeSlots = [];
            if (this.shardInstMesh) {
                this.shardInstMesh.dispose();
                this.shardInstMesh = null;
            }
            this._metalShardMaterial = null;
            this.shardGroup = null;
        }

        if (this.cylinderGroup) {
            this.scene.remove(this.cylinderGroup);
            this.cylinders = [];
            this._cylinderFreeSlots = [];
            if (this.cylinderInstMesh) {
                this.cylinderInstMesh.dispose();
                this.cylinderInstMesh = null;
            }
            this._redCylinderMaterial = null;
            this.cylinderGroup = null;
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

        if (this.promoWallFillLight) {
            this.scene.remove(this.promoWallFillLight);
            this.promoWallFillLight.dispose();
            this.promoWallFillLight = null;
        }
        if (this.promoWallLightTarget) {
            this.scene.remove(this.promoWallLightTarget);
            this.promoWallLightTarget = null;
        }

        if (this.promoTextGroup) {
            this.scene.remove(this.promoTextGroup);
            this.promoTextGroup.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
            });
            if (this.promoTextGroup.children[0]?.material) {
                this.promoTextGroup.children[0].material.dispose();
            }
            this.promoTextGroup = null;
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
