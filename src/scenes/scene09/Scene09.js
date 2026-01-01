/**
 * Scene09: Liquid Glass Effect (Marching Cubes)
 * リキッドグラス風のエフェクト（Marching Cubesでメタボール効果）
 * 参考: https://misora.main.jp/blog/archives/896
 */

import { SceneBase } from '../SceneBase.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import * as THREE from 'three';

export class Scene09 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'mathym | Scene09 - Liquid Glass';
        console.log('Scene09: コンストラクタ実行', this.title);
        
        // 共有リソースマネージャー
        this.sharedResourceManager = sharedResourceManager;
        this.useSharedResources = !!sharedResourceManager;
        
        // 表示設定
        this.showHUD = true;
        
        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
        
        // エフェクト設定（全部ON）
        this.trackEffects[1] = false;  // カメラランダマイズ（デフォルトオフ）
        this.trackEffects[2] = true;  // 色反転
        this.trackEffects[3] = true;  // 色収差
        this.trackEffects[4] = true;  // グリッチ
        this.trackEffects[8] = true;  // トラック8エフェクト（ball増加）
        this.trackEffects[9] = true;  // トラック9エフェクト（カールノイズ時間）
        
        // Marching Cubes用パラメータ（参考URL通り）
        this.resolution = 80;  // Marching Cubesの解像度（元の値に戻す）
        this.numBlobs = 100;  // メタボールの個数（固定100個）
        this.numBlobsTarget = 100;  // 目標ball数（固定100個）
        this.numBlobsMin = 0;  // 最小ball数
        this.numBlobsMax = 100;  // 最大ball数
        this.speed = 1.0;  // アニメーション速度（3.0 → 1.0、遅く）
        this.isolation = 100;  // 分離度（10～100）
        this.metaballScale = 500.0;  // メタボールのスケール（300 → 500、さらに大きく）
        
        // HUD用（OBJECTSに表示）
        this.particleCount = this.numBlobs;
        
        // 時間変数
        this.time = 0.0;
        this.timeScale = 1.0;
        this.timeScaleTarget = 1.0;
        this.timeScaleTransitionSpeed = 5.0;
        
        // カールノイズの時間スケール（トラック9で変更）
        this.curlNoiseTimeScale = 1.0;
        this.curlNoiseTimeScaleTarget = 1.0;
        this.curlNoiseTimeScaleTransitionSpeed = 5.0;
        
        // ballの動きの制御（トラック9で変更）
        this.ballMovementSpeed = 1.0;  // ballの動きの速度（トラック9で変更）
        this.ballMovementSpeedTarget = 1.0;
        this.ballMovementSpeedTransitionSpeed = 5.0;
        this.ballNoiseStrength = 1.0;  // ballのノイズの強度（トラック9で変更）
        this.ballNoiseStrengthTarget = 1.0;
        this.ballNoiseStrengthTransitionSpeed = 5.0;
        
        // Marching Cubes
        this.marchingCubes = null;
        this.marchingCubesUpdateCounter = 0;
        this.marchingCubesUpdateInterval = 2;  // 2フレームに1回更新（パフォーマンス向上）
        
        // 前フレームの位置を保存（補間用）
        this.prevBallPositions = [];
        
        // ヒートマップ用：各ballの速度を保存
        this.ballVelocities = [];
        
        // 各ballのランダムな初期オフセットと方向（ランダム性を高める）
        this.ballRandomOffsets = [];
        this.ballRandomDirections = [];
        this.ballRandomSpeeds = [];  // 各ballのランダムな速度
        this.ballRandomNoiseScales = [];  // 各ballのランダムなノイズスケール
        
        // 背景グラデーション（削除予定）
        this.backgroundGradientMesh = null;
        
        // 地面グリッド
        this.groundGrid = null;
    }
    
    async setup() {
        await super.setup();
        
        // カメラパーティクルの距離パラメータを設定
        if (this.cameraParticles) {
            for (const cameraParticle of this.cameraParticles) {
                this.setupCameraParticleDistance(cameraParticle);
            }
        }
        
        // ライトを設定（HDR風、より明るく）
        this.setupLights();
        
        // 地面グリッドを作成
        this.createGroundGrid();
        
        // Marching Cubes用のマテリアルを作成（ヒートマップ風の色）
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 },
                viewVector: { value: new THREE.Vector3(0, 0, 20) }
            },
            vertexShader: `
                uniform vec3 viewVector;
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                varying vec2 vUv;
                varying vec3 vPosition;  // ワールド座標位置
                varying float opacity;
                
                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    vViewPosition = -mvPosition.xyz;
                    
                    // ローカル座標位置を計算（ヒートマップ用）
                    vPosition = position;
                    
                    gl_Position = projectionMatrix * mvPosition;
                    
                    // リムライティング効果（エッジを明るく）
                    vec3 nNormal = normalize(normalMatrix * normal);
                    vec3 nViewVec = normalize(viewVector);
                    opacity = dot(nNormal, nViewVec);
                    opacity = 1.0 - abs(opacity * 1.3);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                
                varying vec2 vUv;
                varying vec3 vPosition;  // ローカル座標位置
                varying float opacity;
                
                void main() {
                    // 位置から速度を推定（時間と位置の組み合わせで動きを表現）
                    vec3 pos = vPosition;
                    float distFromCenter = length(pos - vec3(0.5, 0.5, 0.5));
                    
                    // 時間と位置から速度を近似（動いている部分は速度が高い）
                    // 複数のsin波を組み合わせてより複雑な動きを表現
                    float timeBasedVelocity1 = sin(uTime * 2.0 + distFromCenter * 10.0) * 0.5 + 0.5;
                    float timeBasedVelocity2 = sin(uTime * 1.5 + pos.x * 8.0 + pos.y * 6.0) * 0.5 + 0.5;
                    float timeBasedVelocity3 = sin(uTime * 1.8 + pos.z * 7.0) * 0.5 + 0.5;
                    
                    // 複数の速度を平均して滑らかに（最大値ではなく平均）
                    float timeBasedVelocity = (timeBasedVelocity1 + timeBasedVelocity2 + timeBasedVelocity3) / 3.0;
                    timeBasedVelocity = smoothstep(0.0, 1.0, timeBasedVelocity);  // より滑らかなグラデーション
                    
                    // ヒートマップの色を計算（青→シアン→緑→黄→赤の滑らかなグラデーション）
                    vec3 heatMapColor;
                    if (timeBasedVelocity < 0.25) {
                        // 青 → シアン（0.0～0.25）
                        float t = timeBasedVelocity / 0.25;
                        heatMapColor = mix(vec3(0.0, 0.2, 1.0), vec3(0.0, 0.8, 1.0), t);
                    } else if (timeBasedVelocity < 0.5) {
                        // シアン → 緑（0.25～0.5）
                        float t = (timeBasedVelocity - 0.25) / 0.25;
                        heatMapColor = mix(vec3(0.0, 0.8, 1.0), vec3(0.0, 1.0, 0.5), t);
                    } else if (timeBasedVelocity < 0.75) {
                        // 緑 → 黄（0.5～0.75）
                        float t = (timeBasedVelocity - 0.5) / 0.25;
                        heatMapColor = mix(vec3(0.0, 1.0, 0.5), vec3(1.0, 1.0, 0.0), t);
                    } else {
                        // 黄 → 赤（0.75～1.0）
                        float t = (timeBasedVelocity - 0.75) / 0.25;
                        heatMapColor = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), t);
                    }
                    
                    // リムライティング効果を適用
                    float rimIntensity = 0.6;
                    vec3 finalColor = heatMapColor * (0.4 + opacity * rimIntensity);
                    
                    // エッジ部分をより明るく（速度が高いほど明るく）
                    float edgeGlow = pow(1.0 - opacity, 0.5) * timeBasedVelocity * 0.3;
                    finalColor += heatMapColor * edgeGlow;
                    
                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `,
            side: THREE.DoubleSide,
            wireframe: true,
            transparent: false
        });
        
        // Marching Cubesを作成（参考URL通り）
        this.marchingCubes = new MarchingCubes(
            this.resolution,
            material,
            true,  // enableUvs
            true,  // enableColors
            100000  // maxPolygons
        );
        // Marching Cubesの位置を調整（地面との関係を考慮、カメラに合わせて下げる）
        // scene10と同じように、オブジェクトを地面の上に配置
        this.marchingCubes.position.set(0, 0, 0);  // Y位置を0に（地面-500の上500の位置、カメラに合わせて下げる）
        this.marchingCubes.scale.set(this.metaballScale, this.metaballScale, this.metaballScale);  // スケールを大きく
        this.marchingCubes.enableUvs = false;
        this.marchingCubes.enableColors = false;
        this.marchingCubes.isolation = this.isolation;
        
        this.scene.add(this.marchingCubes);
        
        // 各ballのランダムな初期データを生成
        this.initializeBallRandomData();
    }
    
    /**
     * 各ballのランダムな初期データを生成
     */
    initializeBallRandomData() {
        this.ballRandomOffsets = [];
        this.ballRandomDirections = [];
        this.ballRandomSpeeds = [];
        this.ballRandomNoiseScales = [];
        this.ballRandomSizes = [];  // 各ballのランダムなサイズ
        
        for (let i = 0; i < this.numBlobsMax; i++) {
            // 球面上にランダムに配置（外側に分散）
            const theta = Math.random() * Math.PI * 2;  // 方位角
            const phi = Math.acos(2 * Math.random() - 1);  // 極角（一様分布）
            const radius = 0.25 + Math.random() * 0.15;  // 半径（0.25～0.4、外側に配置）
            
            // 球面上の位置を計算
            const x = Math.sin(phi) * Math.cos(theta) * radius;
            const y = Math.sin(phi) * Math.sin(theta) * radius;
            const z = Math.cos(phi) * radius;
            
            // ランダムな初期オフセット（球面上の位置）
            this.ballRandomOffsets[i] = {
                x: x * 200.0,
                y: y * 200.0,
                z: z * 200.0
            };
            
            // 外側に向かう方向ベクトル（中心から外側へ）
            const centerX = 0.5;
            const centerY = 0.5;
            const centerZ = 0.5;
            const dirToCenterX = centerX - (0.5 + x);
            const dirToCenterY = centerY - (0.5 + y);
            const dirToCenterZ = centerZ - (0.5 + z);
            const distToCenter = Math.sqrt(dirToCenterX * dirToCenterX + dirToCenterY * dirToCenterY + dirToCenterZ * dirToCenterZ);
            
            // 外側に向かう方向（中心から離れる方向）+ ランダムな方向
            const outwardX = -dirToCenterX / distToCenter;
            const outwardY = -dirToCenterY / distToCenter;
            const outwardZ = -dirToCenterZ / distToCenter;
            
            // ランダムな方向を追加（よりランダムに）
            const randomAngle1 = Math.random() * Math.PI * 2;
            const randomAngle2 = Math.random() * Math.PI * 2;
            const randomX = Math.cos(randomAngle1) * Math.sin(randomAngle2);
            const randomY = Math.sin(randomAngle1) * Math.sin(randomAngle2);
            const randomZ = Math.cos(randomAngle2);
            
            // 外側方向とランダム方向を混合（外側70%、ランダム30%）
            const mixFactor = 0.7;
            this.ballRandomDirections[i] = {
                x: outwardX * mixFactor + randomX * (1 - mixFactor),
                y: outwardY * mixFactor + randomY * (1 - mixFactor),
                z: outwardZ * mixFactor + randomZ * (1 - mixFactor)
            };
            
            // 正規化
            const dirLen = Math.sqrt(
                this.ballRandomDirections[i].x * this.ballRandomDirections[i].x +
                this.ballRandomDirections[i].y * this.ballRandomDirections[i].y +
                this.ballRandomDirections[i].z * this.ballRandomDirections[i].z
            );
            this.ballRandomDirections[i].x /= dirLen;
            this.ballRandomDirections[i].y /= dirLen;
            this.ballRandomDirections[i].z /= dirLen;
            
            // 各ballのランダムな速度（0.8～2.0倍、より速く）
            this.ballRandomSpeeds[i] = 0.8 + Math.random() * 1.2;
            
            // 各ballのランダムなノイズスケール（0.3～1.0、より多様に）
            this.ballRandomNoiseScales[i] = 0.3 + Math.random() * 0.7;
            
            // 各ballのランダムなサイズ（0.7～1.5倍）
            this.ballRandomSizes[i] = 0.7 + Math.random() * 0.8;
        }
    }
    
    /**
     * カメラパーティクルの距離パラメータを設定
     */
    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 800.0;  // カメラを近づける（大きく見えるように）
        cameraParticle.maxDistance = 2000.0;
        cameraParticle.maxDistanceReset = 1200.0;
    }
    
    /**
     * ライトを設定（パフォーマンス最適化：ライト数を減らす）
     */
    setupLights() {
        // 環境光（明るく設定して、DirectionalLightを減らす）
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);  // より明るくしてライト数を減らす
        this.scene.add(ambientLight);
        
        // メインライト（1つだけ、強めに）
        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
        directionalLight.position.set(50, 100, 50);
        this.scene.add(directionalLight);
        this.directionalLight = directionalLight;
        
        // リムライト（エッジを強調、1つだけ）
        const rimLight = new THREE.DirectionalLight(0x88ccff, 2.0);
        rimLight.position.set(-50, -50, -50);
        this.scene.add(rimLight);
        this.rimLight = rimLight;
        
        // ライト数を4つ→2つに減らしてパフォーマンス改善
    }
    
    /**
     * 地面グリッドを作成（scene10風）
     */
    createGroundGrid() {
        // グリッドのサイズと分割数（scene10と同じ）
        const size = 2000;  // グリッドのサイズ
        const divisions = 20;  // 分割数
        
        // グリッドヘルパーを作成
        const gridHelper = new THREE.GridHelper(size, divisions, 0x888888, 0x444444);
        gridHelper.position.y = -500;  // 地面の位置（scene10と同じ）
        this.scene.add(gridHelper);
        
        this.groundGrid = gridHelper;
    }
    
    /**
     * Marching Cubesを更新（参考URL通り）
     */
    updateMarchingCubes() {
        if (!this.marchingCubes) return;
        
        // Marching Cubesをリセット
        this.marchingCubes.reset();
        
        // 実際のball数
        const actualNumBlobs = Math.max(0, Math.round(this.numBlobs));  // 実際のball数（0も許可）
        
        // メタボールの強度を計算（参考URL通り、ball数に応じて）
        const subtract = 12;
        const baseStrength = 1.2 / ((Math.sqrt(actualNumBlobs) - 1) / 4 + 1);
        
        // ballの大きさを大きくする（1.5倍）
        const ballSizeMultiplier = 1.5;  // 固定で1.5倍に
        const strength = baseStrength * ballSizeMultiplier;
        
        // 滑らかなノイズ関数（線形補間付き）
        const smoothNoise = (x, y, z) => {
            // 整数部分と小数部分
            const ix = Math.floor(x);
            const iy = Math.floor(y);
            const iz = Math.floor(z);
            const fx = x - ix;
            const fy = y - iy;
            const fz = z - iz;
            
            // 8つの角のノイズ値を取得
            const n000 = this.hash(ix, iy, iz);
            const n100 = this.hash(ix + 1, iy, iz);
            const n010 = this.hash(ix, iy + 1, iz);
            const n110 = this.hash(ix + 1, iy + 1, iz);
            const n001 = this.hash(ix, iy, iz + 1);
            const n101 = this.hash(ix + 1, iy, iz + 1);
            const n011 = this.hash(ix, iy + 1, iz + 1);
            const n111 = this.hash(ix + 1, iy + 1, iz + 1);
            
            // 3次元線形補間
            const x00 = this.lerp(n000, n100, fx);
            const x10 = this.lerp(n010, n110, fx);
            const x01 = this.lerp(n001, n101, fx);
            const x11 = this.lerp(n011, n111, fx);
            const y0 = this.lerp(x00, x10, fy);
            const y1 = this.lerp(x01, x11, fy);
            return this.lerp(y0, y1, fz);
        };
        
        // 現在の位置を計算
        const currentPositions = [];
        
        // 各メタボールを追加（完全にランダムな動き、遅く）
        for (let i = 0; i < actualNumBlobs; i++) {
            // 各ballのランダムな初期オフセットと方向を取得
            const randomOffset = this.ballRandomOffsets[i] || { x: i * 0.1, y: i * 0.15, z: i * 0.2 };
            const randomDir = this.ballRandomDirections[i] || { x: 1, y: 0, z: 0 };
            const randomSpeed = this.ballRandomSpeeds[i] || 0.5;
            const randomNoiseScale = this.ballRandomNoiseScales[i] || 0.3;
            const randomSize = this.ballRandomSizes[i] || 1.0;  // ランダムなサイズ
            
            // ランダムなオフセットを使用（各ballが異なる位置からスタート）
            const offsetX = randomOffset.x;
            const offsetY = randomOffset.y;
            const offsetZ = randomOffset.z;
            
            // 各ballに完全に独立した速度とノイズスケールを設定（より活発に）
            const baseSpeed = 0.08 * randomSpeed;  // 各ballが異なる速度（より速く）
            const speed = baseSpeed * this.ballMovementSpeed;
            const noiseScale = randomNoiseScale * this.ballMovementSpeed;  // 各ballが異なるノイズスケール
            const noiseStrength = 0.6 * this.ballNoiseStrength;  // ノイズの強度をさらに上げる（より分散、ちぎれたりくっついたり）
            
            // ランダムな方向ベクトルを適用
            const dirX = randomDir.x;
            const dirY = randomDir.y;
            const dirZ = randomDir.z;
            
            // 各ballが完全に独立したノイズ空間で動く（周期的な動きを排除）
            const timeOffset = i * 0.15;  // 各ballが異なる時間オフセット（より多様に）
            
            // 初期位置を球面上に配置（外側に分散）
            const initialRadius = 0.25 + (i % 10) * 0.02;  // 0.25～0.43の範囲で分散
            const baseX = 0.5 + (randomOffset.x / 200.0) * initialRadius;
            const baseY = 0.5 + (randomOffset.y / 200.0) * initialRadius;
            const baseZ = 0.5 + (randomOffset.z / 200.0) * initialRadius;
            
            // ノイズベースの動き（より強く、よりランダムに）
            const noiseX = smoothNoise(
                offsetX * 0.15 + this.time * speed * 0.6 + timeOffset, 
                offsetY * 0.15 + this.time * speed * 0.4 + timeOffset * 1.3, 
                offsetZ * 0.15 + this.time * speed * 0.5 + timeOffset * 0.7
            ) * noiseStrength * dirX;
            const noiseY = smoothNoise(
                offsetY * 0.15 + this.time * speed * 0.4 + timeOffset * 1.1, 
                offsetZ * 0.15 + this.time * speed * 0.6 + timeOffset * 0.9, 
                offsetX * 0.15 + this.time * speed * 0.5 + timeOffset * 1.2
            ) * noiseStrength * dirY;
            const noiseZ = smoothNoise(
                offsetZ * 0.15 + this.time * speed * 0.5 + timeOffset * 0.8, 
                offsetX * 0.15 + this.time * speed * 0.4 + timeOffset * 1.4, 
                offsetY * 0.15 + this.time * speed * 0.6 + timeOffset * 1.0
            ) * noiseStrength * dirZ;
            
            // 外側に向かう力（centrifugal force）と内側に戻る力（attraction）を追加
            // ちぎれたりくっついたりする動きを作る
            const centerX = 0.5;
            const centerY = 0.5;
            const centerZ = 0.5;
            const currentX = baseX + noiseX;
            const currentY = baseY + noiseY;
            const currentZ = baseZ + noiseZ;
            const distX = currentX - centerX;
            const distY = currentY - centerY;
            const distZ = currentZ - centerZ;
            const distToCenter = Math.sqrt(distX * distX + distY * distY + distZ * distZ);
            
            // 距離に応じて力の方向を変える（近いと離れる、遠いと近づく）
            const threshold = 0.15;  // 閾値
            let forceMultiplier = 0.0;
            if (distToCenter < threshold) {
                // 中心に近い → 外側に向かう力（ちぎれる）
                forceMultiplier = 0.12 * (1.0 - distToCenter / threshold);
            } else if (distToCenter > threshold * 1.5) {
                // 中心から遠い → 内側に戻る力（くっつく）
                forceMultiplier = -0.06 * ((distToCenter - threshold * 1.5) / threshold);
            }
            
            const outwardX = (distX / (distToCenter + 0.001)) * forceMultiplier;
            const outwardY = (distY / (distToCenter + 0.001)) * forceMultiplier;
            const outwardZ = (distZ / (distToCenter + 0.001)) * forceMultiplier;
            
            // ベースの位置（球面上に分散） + ランダムな動き + 外側に向かう力
            let ballx = baseX + noiseX + outwardX;
            let bally = baseY + noiseY + outwardY;
            let ballz = baseZ + noiseZ + outwardZ;
            
            // 前フレームの位置と補間（滑らかに）
            if (this.prevBallPositions[i]) {
                const prev = this.prevBallPositions[i];
                const lerpFactor = 0.5;  // 補間係数（0.3 → 0.5、より滑らかに）
                ballx = this.lerp(prev.x, ballx, lerpFactor);
                bally = this.lerp(prev.y, bally, lerpFactor);
                ballz = this.lerp(prev.z, ballz, lerpFactor);
            }
            
            // 速度を計算（ヒートマップ用）
            let velocity = 0.0;
            if (this.prevBallPositions[i]) {
                const prev = this.prevBallPositions[i];
                const dx = ballx - prev.x;
                const dy = bally - prev.y;
                const dz = ballz - prev.z;
                velocity = Math.sqrt(dx * dx + dy * dy + dz * dz);
            } else {
                // 初回はノイズと外側への力から速度を推定
                const velLen = Math.sqrt(noiseX * noiseX + noiseY * noiseY + noiseZ * noiseZ + outwardX * outwardX + outwardY * outwardY + outwardZ * outwardZ);
                velocity = velLen;
            }
            
            // 速度を保存（ヒートマップ用、0.0～1.0に正規化）
            this.ballVelocities[i] = Math.min(1.0, velocity * 10.0);  // 速度を0.0～1.0に正規化
            
            // 現在の位置を保存
            currentPositions[i] = { x: ballx, y: bally, z: ballz };
            
            // ballの大きさをランダムなサイズで変更
            const adjustedStrength = strength * ballSizeMultiplier * randomSize;  // ランダムなサイズを適用
            this.marchingCubes.addBall(ballx, bally, ballz, adjustedStrength, subtract);
        }
        
        // 前フレームの位置を更新
        this.prevBallPositions = currentPositions;
        
        // Marching Cubesを更新
        this.marchingCubes.update();
    }
    
    // ハッシュ関数（ノイズ用）
    hash(x, y, z) {
        const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
        return (n - Math.floor(n)) * 2.0 - 1.0;  // -1.0 ～ 1.0
    }
    
    // 線形補間
    lerp(a, b, t) {
        return a + (b - a) * t;
    }
    
    /**
     * マテリアルのuniformsを更新
     */
    updateMaterialUniforms() {
        if (this.marchingCubes && this.marchingCubes.material && this.marchingCubes.material.uniforms) {
            // カメラからオブジェクトへの方向ベクトル（ワールド空間）
            const worldPosition = new THREE.Vector3();
            this.marchingCubes.getWorldPosition(worldPosition);
            const viewVector = new THREE.Vector3();
            viewVector.subVectors(this.camera.position, worldPosition);
            viewVector.normalize();
            
            // オブジェクトのローカル空間に変換
            const localViewVector = new THREE.Vector3();
            localViewVector.copy(viewVector);
            this.marchingCubes.worldToLocal(localViewVector);
            
            if (this.marchingCubes.material.uniforms.viewVector) {
                this.marchingCubes.material.uniforms.viewVector.value.copy(localViewVector);
            }
            if (this.marchingCubes.material.uniforms.uTime) {
                this.marchingCubes.material.uniforms.uTime.value = this.time;
            }
        }
    }
    
    /**
     * 描画処理（背景を黒に設定）
     */
    render() {
        // 背景を黒に設定
        this.renderer.setClearColor(0x000000);
        
        super.render();
    }
    
    /**
     * 更新処理
     */
    onUpdate(deltaTime) {
        // timeScaleを滑らかに遷移
        this.timeScale += (this.timeScaleTarget - this.timeScale) * this.timeScaleTransitionSpeed * deltaTime;
        
        // curlNoiseTimeScaleを滑らかに遷移
        this.curlNoiseTimeScale += (this.curlNoiseTimeScaleTarget - this.curlNoiseTimeScale) * this.curlNoiseTimeScaleTransitionSpeed * deltaTime;
        
        // ballの動きの速度とノイズ強度を滑らかに遷移
        this.ballMovementSpeed += (this.ballMovementSpeedTarget - this.ballMovementSpeed) * this.ballMovementSpeedTransitionSpeed * deltaTime;
        this.ballNoiseStrength += (this.ballNoiseStrengthTarget - this.ballNoiseStrength) * this.ballNoiseStrengthTransitionSpeed * deltaTime;
        
        // ball数は固定100個
        this.particleCount = 100;
        
        // 時間を更新（滑らかに、deltaTimeを直接使用）
        this.time += deltaTime * this.timeScale * this.speed * 0.2;  // deltaTimeで滑らかに更新
        
        // マテリアルのuniformsを更新
        this.updateMaterialUniforms();
        
        // Marching Cubesを更新（間引き更新で滑らかに）
        this.marchingCubesUpdateCounter++;
        if (this.marchingCubesUpdateCounter >= this.marchingCubesUpdateInterval) {
            this.marchingCubesUpdateCounter = 0;
            this.updateMarchingCubes();
        }
    }
    
    /**
     * リセット処理
     */
    reset() {
        super.reset();
        this.time = 0;
        this.timeScale = 1.0;
        this.timeScaleTarget = 1.0;
    }
    
    /**
     * トラック番号に応じたエフェクト処理
     */
    handleTrackNumber(trackNumber, message) {
        if (trackNumber === 1) {
            const args = message.args || [];
            const velocity = args[0] || 127.0;
            // 速度に応じてballの数を増やす（0～200）
            this.numBlobsTarget = Math.floor((velocity / 127.0) * this.numBlobsMax);  // 0～200
            console.log(`Track 1: Ball count set to ${this.numBlobsTarget}`);
        } else if (trackNumber === 5) {
            this.timeScaleTarget = 10.0;
            console.log('Track 5: Time acceleration activated (10x speed)');
        } else if (trackNumber === 9) {
            const args = message.args || [];
            const velocity = args[0] || 127.0;
            this.curlNoiseTimeScaleTarget = 1.0 + (velocity / 127.0) * 4.0;  // 1.0～5.0
            // ballの動きの速度とノイズ強度を制御（velocityに応じて、より広い範囲に）
            this.ballMovementSpeedTarget = 0.1 + (velocity / 127.0) * 5.0;  // 0.1～5.1倍（より速く）
            this.ballNoiseStrengthTarget = 0.5 + (velocity / 127.0) * 1.5;  // 0.5～2.0倍
            // ワイヤーフレームは常に無効
            if (this.marchingCubes && this.marchingCubes.material) {
                this.marchingCubes.material.wireframe = false;
            }
            console.log(`Track 9: Ball movement speed: ${this.ballMovementSpeedTarget.toFixed(2)}, noise strength: ${this.ballNoiseStrengthTarget.toFixed(2)}`);
        }
    }
    
    /**
     * キーが押された時の処理
     */
    handleKeyDown(trackNumber) {
        super.handleKeyDown(trackNumber);
        
        if (trackNumber === 1) {
            this.numBlobsTarget = this.numBlobsMax;  // 最大ball数
        } else if (trackNumber === 5) {
            this.timeScaleTarget = 10.0;
        } else if (trackNumber === 9) {
            this.ballMovementSpeedTarget = 5.1;  // 最大速度（より速く）
            this.ballNoiseStrengthTarget = 2.0;  // 最大ノイズ強度
        }
    }
    
    /**
     * キーが離された時の処理
     */
    handleKeyUp(trackNumber) {
        super.handleKeyUp(trackNumber);
        
        if (trackNumber === 1) {
            this.numBlobsTarget = 0;  // ball数を0に戻す
        } else if (trackNumber === 5) {
            this.timeScaleTarget = 1.0;
        } else if (trackNumber === 9) {
            this.ballMovementSpeedTarget = 1.0;  // デフォルト速度
            this.ballNoiseStrengthTarget = 1.0;  // デフォルトノイズ強度
        }
    }
    
    /**
     * リソースの有効/無効を切り替え
     */
    setResourceActive(active) {
        // Marching Cubesは常にアクティブ
    }
    
    /**
     * シーン固有の要素をクリーンアップ
     */
    cleanupSceneSpecificElements() {
        console.log('Scene09.cleanupSceneSpecificElements: シーン固有要素をクリーンアップ');
        
        if (this.marchingCubes) {
            this.scene.remove(this.marchingCubes);
            this.marchingCubes = null;
        }
        
        if (this.directionalLight) {
            this.scene.remove(this.directionalLight);
                this.directionalLight.dispose();
            this.directionalLight = null;
        }
        
        if (this.rimLight) {
            this.scene.remove(this.rimLight);
            this.rimLight.dispose();
            this.rimLight = null;
        }

        if (this.groundGrid) {
            this.scene.remove(this.groundGrid);
            this.groundGrid = null;
        }
        
        this.time = 0.0;
        this.timeScale = 1.0;
        this.timeScaleTarget = 1.0;
    }
    
    /**
     * クリーンアップ処理
     */
    dispose() {
        console.log('Scene09.dispose: クリーンアップ開始');
        
        if (this.marchingCubes) {
            this.scene.remove(this.marchingCubes);
            this.marchingCubes = null;
        }
        
        if (this.directionalLight) {
            this.scene.remove(this.directionalLight);
                this.directionalLight.dispose();
            this.directionalLight = null;
        }
        
        if (this.rimLight) {
            this.scene.remove(this.rimLight);
            this.rimLight.dispose();
            this.rimLight = null;
        }

        if (this.backgroundGradientMesh) {
            this.scene.remove(this.backgroundGradientMesh);
            if (this.backgroundGradientMesh.geometry) {
                this.backgroundGradientMesh.geometry.dispose();
            }
            if (this.backgroundGradientMesh.material) {
                this.backgroundGradientMesh.material.dispose();
            }
            this.backgroundGradientMesh = null;
        }
        
        console.log('Scene09.dispose: クリーンアップ完了');
        super.dispose();
    }
}
