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
        this.title = 'Concrete Room';
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
        this.sceneLightingScale = 0.4;
        /** 各破片がこの時間（ms）経過したら削除 */
        this.shardLifetimeMs = 180000;
        /** 寿命終盤でフェードアウトする時間（ms） */
        this.shardFadeOutMs = 1800;
        this.cylinderFadeOutMs = 1800;
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
        this.useSSAO = true;
        this.useFilmGrain = true;
        this.bloomPass = null;
        this.ssaoPass = null;
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

        /** Scene13 風：空間を漂うインスタンスボックス（金属片とは別） */
        this.ambientParticleCount = 1000;
        this.ambientInstManager = null;
        this.ambientParticles = [];

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

        this._jitterSide = new THREE.Vector3();
        this._jitterUp = new THREE.Vector3();

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
        this._wallCenterY = this.floorTopY + (this.ceilingY - this.floorTopY) * 0.5;
        this._laserHalfW = this.roomHalfW - 240;
        this._laserHalfD = this.roomHalfD - 240;
    }

    /** 96小節ループ想定（Scene16 と同系）。actual_tick の差分で歩幅を決める */
    static TICK_LOOP = 36864;
    static METERS_PER_TICK_SHARD = 2.45;
    static METERS_PER_TICK_CYLINDER = 2.45;
    /**
     * InstancedMesh 用：インスタンスごとの不透明度（instanceOpacity 属性 + opaque_fragment 後に乗算）
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
        material.depthWrite = false;
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
                gl_FragColor.rgb *= vInstanceOpacity;
                gl_FragColor.a *= vInstanceOpacity;`
            );
        };
    }

    /**
     * 赤シリンダ専用：インスタンス不透明度＋ビュー空間でプロシージャルな法線摂動（画像テクスチャなし）
     */
    static _applyRedCylinderShader(material) {
        material.transparent = true;
        material.depthWrite = false;
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
                gl_FragColor.rgb *= vInstanceOpacity;
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
        return 1 - (elapsedMs - t0) / (lifeMs - t0);
    }

    _updateFadeOpacity() {
        const now = performance.now();
        if (this._shardOpacityAttr && this.shards.length) {
            const arr = this._shardOpacityAttr.array;
            let dirty = false;
            for (const s of this.shards) {
                const op = this._fadeOpacity01(now - s.spawnTime, this.shardLifetimeMs, this.shardFadeOutMs);
                const i = s.slotIndex;
                if (Math.abs(arr[i] - op) > 1e-4) {
                    arr[i] = op;
                    dirty = true;
                }
            }
            if (dirty) this._shardOpacityAttr.needsUpdate = true;
        }
        if (this._cylinderOpacityAttr && this.cylinders.length) {
            const arr = this._cylinderOpacityAttr.array;
            let dirty = false;
            for (const c of this.cylinders) {
                const op = this._fadeOpacity01(now - c.spawnTime, this.cylinderLifetimeMs, this.cylinderFadeOutMs);
                const i = c.slotIndex;
                if (Math.abs(arr[i] - op) > 1e-4) {
                    arr[i] = op;
                    dirty = true;
                }
            }
            if (dirty) this._cylinderOpacityAttr.needsUpdate = true;
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

    generateConcretePBRTextures(size = 1024) {
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
        StudioBox.drawGroutLines(aCtx, size, { strokeStyle: '#8e8e8e', divisions: tileDiv });
        aCtx.restore();
        StudioBox.drawRedCrossesAndLabels(aCtx, size, tileDiv);

        hCtx.putImageData(nImg, 0, 0);
        rCtx.putImageData(rImg, 0, 0);
        aoCtx.putImageData(aoImg, 0, 0);

        const wrap = (canvasTex) => {
            canvasTex.wrapS = canvasTex.wrapT = THREE.RepeatWrapping;
            canvasTex.colorSpace = THREE.SRGBColorSpace;
            canvasTex.anisotropy = 8;
            canvasTex.needsUpdate = true;
        };

        const map = new THREE.CanvasTexture(albedoCanvas);
        wrap(map);

        const normalMap = new THREE.CanvasTexture(hCanvas);
        normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
        normalMap.colorSpace = THREE.LinearSRGBColorSpace;
        normalMap.anisotropy = 8;
        normalMap.needsUpdate = true;

        const roughnessMap = new THREE.CanvasTexture(roughCanvas);
        roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
        roughnessMap.colorSpace = THREE.LinearSRGBColorSpace;
        roughnessMap.anisotropy = 8;
        roughnessMap.needsUpdate = true;

        const aoMap = new THREE.CanvasTexture(aoCanvas);
        aoMap.wrapS = aoMap.wrapT = THREE.RepeatWrapping;
        aoMap.colorSpace = THREE.LinearSRGBColorSpace;
        aoMap.anisotropy = 8;
        aoMap.needsUpdate = true;

        return { map, normalMap, roughnessMap, aoMap };
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
        ['map', 'normalMap', 'roughnessMap', 'aoMap'].forEach((k) => {
            const t = textures[k];
            if (t) {
                t.repeat.set(repeat, repeat);
            }
        });

        /** 壁・床で同一（見た目の明るさを揃える） */
        const concreteMat = new THREE.MeshStandardMaterial({
            color: 0xe8eaee,
            map: textures.map,
            normalMap: textures.normalMap,
            normalScale: new THREE.Vector2(0.44, 0.44),
            roughnessMap: textures.roughnessMap,
            roughness: 0.9,
            metalness: 0,
            aoMap: textures.aoMap,
            aoMapIntensity: 0.5,
            envMapIntensity: 0.95 * (0.55 + 0.45 * (this.sceneLightingScale ?? 1))
        });

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
        const floor = new THREE.Mesh(floorGeo, concreteMat);
        floor.position.set(0, floorTopY - slab * 0.5, 0);
        floor.receiveShadow = true;
        floor.castShadow = false;
        this.roomGroup.add(floor);

        const mkWall = (w, height, d, px, py, pz) => {
            const geo = new THREE.BoxGeometry(w, height, d, 1, 1, 1);
            this.ensureUv2(geo);
            const mesh = new THREE.Mesh(geo, concreteMat);
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
            envMapIntensity: 1.0
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
        this._shardScaleTemp.set(r, r, r);
        this._shardMatrixTemp.compose(this._shardPosTemp, qFinal, this._shardScaleTemp);
        this.shardInstMesh.setMatrixAt(slotIndex, this._shardMatrixTemp);
        this.shardInstMesh.instanceMatrix.needsUpdate = true;
        if (this._shardOpacityAttr) {
            this._shardOpacityAttr.array[slotIndex] = 1;
            this._shardOpacityAttr.needsUpdate = true;
        }

        this.shards.push({ slotIndex, spawnTime: performance.now() });
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
            opacity: 1
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

        /** レーザーより弱い赤。朱寄りを避けワインレッド系の暗色＋弱エミッシブ */
        this._redCylinderMaterial = new THREE.MeshStandardMaterial({
            color: 0x481c26,
            emissive: 0x0f0608,
            emissiveIntensity: 0.26,
            metalness: 0,
            roughness: 0.58,
            fog: false,
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
        this._cylinderPosTemp.x = THREE.MathUtils.clamp(
            this._cylinderPosTemp.x,
            -this.roomHalfW + 200,
            this.roomHalfW - 200
        );
        this._cylinderPosTemp.z = THREE.MathUtils.clamp(
            this._cylinderPosTemp.z,
            -this.roomHalfD + 200,
            this.roomHalfD - 200
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

        this._cylinderScaleTemp.set(radius, length, radius);
        this._cylinderMatrixTemp.compose(this._cylinderPosTemp, this._cylinderQuatTemp, this._cylinderScaleTemp);
        this.cylinderInstMesh.setMatrixAt(slotIndex, this._cylinderMatrixTemp);
        this.cylinderInstMesh.instanceMatrix.needsUpdate = true;
        if (this._cylinderOpacityAttr) {
            this._cylinderOpacityAttr.array[slotIndex] = 1;
            this._cylinderOpacityAttr.needsUpdate = true;
        }

        this.cylinders.push({ slotIndex, spawnTime: performance.now() });
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

    /**
     * Scene13 風：金属片とは別レイヤーで漂うインスタンスボックス（約1000個）
     */
    createAmbientFloatingParticles() {
        const count = this.ambientParticleCount;
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const envTex = this.cubeRenderTarget ? this.cubeRenderTarget.texture : this.scene.environment;
        const mat = new THREE.MeshStandardMaterial({
            color: 0xb4c0d0,
            metalness: 0.2,
            roughness: 0.48,
            envMap: envTex,
            envMapIntensity: 0.62 * (0.55 + 0.45 * (this.sceneLightingScale ?? 1))
        });

        this.ambientInstManager = new InstancedMeshManager(this.scene, boxGeo, mat, count);
        const mainMesh = this.ambientInstManager.getMainMesh();
        mainMesh.castShadow = false;
        mainMesh.receiveShadow = false;
        mainMesh.renderOrder = -2;

        const bx = this.roomHalfW - 480;
        const bz = this.roomHalfD - 480;
        const yMin = this.floorTopY + 220;
        const yMax = this.ceilingY * 0.4;

        this.ambientParticles = [];
        for (let i = 0; i < count; i++) {
            const x = (Math.random() * 2 - 1) * bx;
            const z = (Math.random() * 2 - 1) * bz;
            const y = yMin + Math.random() * (yMax - yMin);
            const position = new THREE.Vector3(x, y, z);
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 92,
                (Math.random() - 0.5) * 58,
                (Math.random() - 0.5) * 92
            );
            const rotation = new THREE.Euler(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2
            );
            const angVel = new THREE.Vector3(
                (Math.random() - 0.5) * 1.9,
                (Math.random() - 0.5) * 1.9,
                (Math.random() - 0.5) * 1.9
            );
            const sr = 0.55 + Math.random() * 2.6;
            const scale = new THREE.Vector3(
                sr * (0.32 + Math.random() * 1.55),
                sr * (0.32 + Math.random() * 1.55),
                sr * (0.32 + Math.random() * 1.55)
            );
            const phase = Math.random() * Math.PI * 2;
            this.ambientParticles.push({
                position,
                velocity,
                rotation,
                angVel,
                scale,
                phase
            });
            this.ambientInstManager.setMatrixAt(i, position, rotation, scale);
        }
        this.ambientInstManager.markNeedsUpdate();
    }

    /** トラック9：generateFleshTextures の map/bump ＋ color でチャコール寄せ */
    initTrack9SpawnSpheres() {
        this.track9SphereGroup = new THREE.Group();
        this.scene.add(this.track9SphereGroup);
        this._track9FleshTextures = this.generateFleshTextures();
        const env = this.scene.environment;
        this._track9SphereMaterial = new THREE.MeshStandardMaterial({
            map: this._track9FleshTextures.map,
            bumpMap: this._track9FleshTextures.bumpMap,
            bumpScale: 3.0,
            color: 0x4a4e55,
            metalness: 0.22,
            roughness: 0.52,
            envMap: env,
            envMapIntensity: 0.52 * (0.55 + 0.45 * (this.sceneLightingScale ?? 1)),
            emissive: 0x0a0b0c,
            emissiveIntensity: 0.22
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

        for (let i = 0; i < this.ambientParticles.length; i++) {
            const ap = this.ambientParticles[i];
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
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0xf4f6f8, 0.72 * L);
        this.scene.add(hemiLight);

        const ambientLight = new THREE.AmbientLight(0xf5f6f8, 0.58 * L);
        this.scene.add(ambientLight);

        const keyLight = new THREE.DirectionalLight(0xffffff, 2.05 * L);
        keyLight.position.set(2000, 5000, 2000);
        keyLight.castShadow = true;

        const sSize = 8000;
        keyLight.shadow.camera.left = -sSize;
        keyLight.shadow.camera.right = sSize;
        keyLight.shadow.camera.top = sSize;
        keyLight.shadow.camera.bottom = -sSize;
        keyLight.shadow.camera.near = 100;
        keyLight.shadow.camera.far = 10000;

        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.radius = 6;
        keyLight.shadow.bias = -0.00035;

        this.scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xe8eef5, 0.72 * L);
        fillLight.position.set(-3500, 2800, -2200);
        fillLight.castShadow = false;
        this.scene.add(fillLight);

        this.fillPointLight = new THREE.PointLight(0xf0f2f5, 0.82 * L, 12000);
        this.fillPointLight.position.set(0, 2200, 0);
        this.fillPointLight.castShadow = false;
        this.scene.add(this.fillPointLight);

        this.pulsePointLight = new THREE.PointLight(0xffffff, 0, 14000, 1.2);
        this.pulsePointLight.position.set(0, 550, 0);
        this.pulsePointLight.castShadow = false;
        this.scene.add(this.pulsePointLight);

        const wallTextZ = -this.roomHalfD + 72;
        this.promoWallLightTarget = new THREE.Object3D();
        this.promoWallLightTarget.position.set(0, this._wallCenterY, wallTextZ);
        this.scene.add(this.promoWallLightTarget);
        this.promoWallFillLight = new THREE.SpotLight(0xf2f6fb, 0.78 * L, 22000, Math.PI / 2.6, 0.42, 1.15);
        this.promoWallFillLight.position.set(0, this._wallCenterY + 1100, 0);
        this.promoWallFillLight.castShadow = false;
        this.promoWallFillLight.target = this.promoWallLightTarget;
        this.scene.add(this.promoWallFillLight);
    }

    async setup() {
        if (this.initialized) return;
        await super.setup();

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        const Lexp = this.sceneLightingScale ?? 1;
        this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.78, 1.32, Lexp);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        /** 密度で霞の量、色で遠方の明るさ。白い色＋濃いと飽和するので、濃い霞は色を暗めにする */
        this.scene.background = new THREE.Color(0x141414);
        this.scene.fog = new THREE.FogExp2(0x5e5e5e, 0.00029);

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

        const textures = this.generateConcretePBRTextures(1024);
        this.buildRoom(textures);

        const sharedConcrete = this.roomGroup.children[0].material;
        this.applyEnvMapToMaterials(this.scene.environment, sharedConcrete, sharedConcrete);

        this.setupLights();

        this.cableBlobParticle = new Scene16Particle(0, this.cableHomeY, 0);
        this.cableBlobParticle.maxSpeed = 7.0;
        this.cableBlobParticle.maxForce = 1.5;
        this.cableBlobParticle.friction = 0.015;

        this.initMetalShardsSystem();
        this.initRedCylinderSystem();
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
        this._updateAmbientParticles(deltaTime);
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
        this.updateAutoFocus(focusTargets);

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
            emissiveIntensity: 0.16
        });

        this.promoTextGroup = new THREE.Group();
        const lines = ['Mathym', 'New E.P.', 'Out NOW'];
        const size = 248;
        const extrudeHeight = 56;
        let yCursor = 0;
        const lineGap = 72;

        for (let i = 0; i < lines.length; i++) {
            const geo = new TextGeometry(lines[i], {
                font,
                size,
                height: extrudeHeight,
                curveSegments: 10,
                bevelEnabled: true,
                bevelThickness: 6,
                bevelSize: 2.4,
                bevelOffset: 0,
                bevelSegments: 2
            });
            geo.computeBoundingBox();
            const bx = geo.boundingBox;
            const cx = -(bx.max.x + bx.min.x) * 0.5;
            const cy = -(bx.max.y + bx.min.y) * 0.5;
            const cz = -(bx.max.z + bx.min.z) * 0.5;
            geo.translate(cx, cy, cz);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.y = yCursor;
            yCursor -= size + lineGap;
            this.promoTextGroup.add(mesh);
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
            fog: false,
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
            this.ssaoPass.kernelRadius = 8;
            this.ssaoPass.minDistance = 0.005;
            this.ssaoPass.maxDistance = 0.12;
            this.composer.addPass(this.ssaoPass);
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
            // aperture を上げすぎるとピント面付近までボケが乗りやすい。奥・手前のボケは残しつつシャープ域を広げる。
            this.initDOF({
                focus: 2000,
                aperture: 0.0000045,
                maxblur: 0.0028
            });
        }
        if (!this.outputPass) {
            this.outputPass = new OutputPass();
            this.composer.addPass(this.outputPass);
        }
        this.addFilmGrainIfEnabled(0.22, false);
    }

    onResize() {
        super.onResize();
        if (this.ssaoPass && typeof this.ssaoPass.setSize === 'function') {
            this.ssaoPass.setSize(window.innerWidth, window.innerHeight);
        }
    }

    render() {
        this.renderer.setClearColor(0x141414);
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

        if (this.ambientInstManager) {
            this.ambientInstManager.dispose();
            this.ambientInstManager = null;
        }
        this.ambientParticles = [];

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
            this.roomGroup.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material && !seenMats.has(o.material)) {
                    seenMats.add(o.material);
                    const m = o.material;
                    if (m.map) m.map.dispose();
                    if (m.normalMap) m.normalMap.dispose();
                    if (m.roughnessMap) m.roughnessMap.dispose();
                    if (m.aoMap) m.aoMap.dispose();
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
