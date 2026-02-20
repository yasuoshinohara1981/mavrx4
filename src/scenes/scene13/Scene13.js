/**
 * Scene13: 新規シーン（テンプレートベース）
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import { StudioBox } from '../../lib/StudioBox.js';
import { Scene13Particle } from './Scene13Particle.js';

export class Scene13 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'Xenolith';  // シーンのタイトルを Xenolith に設定
        this.initialized = false;
        this.sceneNumber = 13;
        this.kitNo = 4;

        // 共有リソースマネージャー
        this.sharedResourceManager = sharedResourceManager;
        this.useSharedResources = !!sharedResourceManager;
        
        // レイキャスター（オートフォーカス用）
        this.raycaster = new THREE.Raycaster();
        
        // Boxの設定
        this.sphereCount = 20000; // ついに2万個！人類未踏の領域や！
        this.spawnRadius = 1200;  // さらに広げてスケール感を出す（1000 -> 1200）
        
        // インスタンス管理
        this.instancedMeshManager = null;
        this.particles = [];
        this.fluorescentLights = [];

        // 空間分割用
        this.gridSize = 120; 
        this.grid = new Map();

        // 撮影用スタジオ
        this.studio = null;
        
        // エフェクト設定
        this.useDOF = true; // SceneBaseのフラグを使用
        this.useBloom = true; 
        this.useSSAO = false; // 重いのでオフ
        this.useWallCollision = true; // 壁判定オン
        this.bloomPass = null;
        this.ssaoPass = null;

        // 全てのエフェクトをデフォルトでオフに設定（Phaseで解放）
        // トラック1（カメラランダマイズ）だけはデフォルトでオンにするやで！😎
        for (let i = 1; i <= 9; i++) {
            this.trackEffects[i] = (i === 1);
        }

        // トラック6用エフェクト管理
        this.expandSpheres = []; 
        
        // 重力設定
        this.gravityForce = new THREE.Vector3(0, -10.0, 0); // -2.5 -> -10.0 超絶重力！ブラックホール級や！

        // モード設定（自動ランダマイズ）
        this.currentMode = this.MODE_DEFAULT; // 最初は引力モードから開始
        this.modeTimer = 0;
        this.modeInterval = 10.0; // 10秒ごとにランダムに切り替え
        
        // モード選択履歴（全モードを一回以上選択させるため）
        this.modeHistory = new Set([this.MODE_DEFAULT]);
        this.totalModeCount = 10; // MODE_DEFAULT(0) から MODE_DEFORM(9) まで
        
        // 色管理用
        this.boxColors = new Float32Array(this.sphereCount * 3);
        this.tempColor = new THREE.Color();
        
        // モード定数
        this.MODE_DEFAULT = 0;   // 浮遊・中心引力
        this.MODE_GRAVITY = 1;   // 重力落下
        this.MODE_SPIRAL  = 2;   // DNA二重螺旋
        this.MODE_TORUS   = 3;   // 捻れトーラス
        this.MODE_WALL    = 4;   // 垂直グリッド壁
        this.MODE_WAVE    = 5;   // 巨大な波（サーフェス）
        this.MODE_BLACK_HOLE = 6; // ブラックホール・ジェット
        this.MODE_PILLARS = 7;   // 5本の垂直柱
        this.MODE_CHAOS   = 8;   // 混沌・脈動
        this.MODE_DEFORM  = 9;   // 【新】変形モード（球体同相）

        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
    }
    
    /**
     * カメラパーティクルの距離パラメータを設定
     */
    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 400;
        cameraParticle.maxDistance = 3000;
        cameraParticle.minY = -450; // 地面より下に行かないように制限
    }

    /**
     * セットアップ処理
     */
    async setup() {
        if (this.initialized) return; // 二重初期化防止
        await super.setup();
        
        // トラック4（グリッチ）を確実にオフにする
        if (this.glitchPass) {
            this.glitchPass.enabled = false;
        }
        
        if (this.camera) {
            this.camera.far = 20000;
            this.camera.updateProjectionMatrix();
        }

        // シャドウマップ設定
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.showGridRuler3D = false; // デフォルトでオフ
        this.initGridRuler3D({
            center: { x: 0, y: 0, z: 0 },
            size: { x: 5000, y: 5000, z: 5000 },
            floorY: -498, // 床(-499)より1ユニット上に配置してZファイティングを物理的に回避
            floorSize: 10000,
            floorDivisions: 100,
            labelMax: 256
        });

        this.setupLights();
        this.createStudioBox();
        this.createSpheres();
        this.initPostProcessing();
        this.initialized = true;
    }

    /**
     * ライトの設定
     */
    setupLights() {
        // 全体を明るく（強度を0.8に設定）
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x888888, 0.8);
        this.scene.add(hemiLight);

        // 環境光も底上げ
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambientLight);

        // メインの平行光源（白）
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight.position.set(1000, 1500, 1000);
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.left = -1500;
        directionalLight.shadow.camera.right = 1500;
        directionalLight.shadow.camera.top = 1500;
        directionalLight.shadow.camera.bottom = -1500;
        directionalLight.shadow.camera.near = 100;
        directionalLight.shadow.camera.far = 5000;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);

        // 中心光源（強烈な白）
        const pointLight = new THREE.PointLight(0xffffff, 2.5, 2500); 
        pointLight.position.set(0, 200, 0); 
        pointLight.castShadow = true; 
        pointLight.shadow.mapSize.width = 1024;
        pointLight.shadow.mapSize.height = 1024;
        pointLight.shadow.camera.near = 10;
        pointLight.shadow.camera.far = 3000;
        pointLight.shadow.bias = -0.001;
        this.scene.add(pointLight);
    }

    /**
     * 撮影用スタジオ
     */
    createStudioBox() {
        this.studio = new StudioBox(this.scene);
    }

    /**
     * Boxと物理演算の作成
     */
    createSpheres() {
        // 安定したBoxに戻す
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const textures = this.generateFleshTextures();
        const boxMat = new THREE.MeshStandardMaterial({
            color: 0xcccccc, 
            map: textures.map,
            bumpMap: textures.bumpMap,
            bumpScale: 4.0, 
            metalness: 0.5, 
            roughness: 0.3, 
            emissive: 0x220000, // ほのかに赤く光らせる（暗い赤）
            emissiveIntensity: 0.5, // 強度を調整
            emissiveMap: textures.bumpMap // バンプの凹凸に合わせて光らせる
        });

        this.instancedMeshManager = new InstancedMeshManager(this.scene, boxGeo, boxMat, this.sphereCount);
        const mainMesh = this.instancedMeshManager.getMainMesh();
        mainMesh.castShadow = true;
        mainMesh.receiveShadow = true;
        
        // 個別色設定のための準備
        for (let i = 0; i < this.sphereCount; i++) {
            this.boxColors[i * 3 + 0] = 1.0; 
            this.boxColors[i * 3 + 1] = 1.0; 
            this.boxColors[i * 3 + 2] = 1.0; 
        }
        mainMesh.instanceColor = new THREE.InstancedBufferAttribute(this.boxColors, 3);

        mainMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            alphaTest: 0.5
        });

        for (let i = 0; i < this.sphereCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = Math.pow(Math.random(), 1.5) * this.spawnRadius;
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            // 大きさのランダムバリエーション
            // 最大値をさらに抑える調整
            const sizeRand = Math.random();
            let baseSize;
            if (sizeRand < 0.7) {
                // 70%は小さめ (5〜12)
                baseSize = 5 + Math.random() * 7;
            } else if (sizeRand < 0.95) {
                // 25%は中くらい (12〜20)
                baseSize = 12 + Math.random() * 8;
            } else {
                // 5%だけ大きい (20〜25) - 最大サイズをさらに縮小 (35->25)
                baseSize = 20 + Math.random() * 5;
            }

            // 縦横比をさらに極端に（細長いものを増やす）
            const scaleX = baseSize * (0.2 + Math.random() * 2.8);
            const scaleY = baseSize * (0.2 + Math.random() * 2.8);
            const scaleZ = baseSize * (0.2 + Math.random() * 2.8);
            const scale = new THREE.Vector3(scaleX, scaleY, scaleZ);
            
            const radius = Math.max(scaleX, scaleY, scaleZ) * 0.5;
            
            const p = new Scene13Particle(x, y, z, radius, scale);
            p.angularVelocity.multiplyScalar(2.0);
            this.particles.push(p);

            this.instancedMeshManager.setMatrixAt(i, p.position, p.rotation, p.scale);
        }
        
        this.instancedMeshManager.markNeedsUpdate();
        this.setParticleCount(this.sphereCount);
    }

    /**
     * コンクリート質感のテクスチャを生成
     */
    generateFleshTextures() {
        const size = 512;
        
        // 1. カラーマップ用のキャンバス
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size;
        colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');
        
        // ベース：純白に変更（テクスチャがグレーだとBoxもグレーになるため）
        cCtx.fillStyle = '#ffffff'; 
        cCtx.fillRect(0, 0, size, size);

        // コンクリートの汚れや色ムラを追加（白ベースなので薄めに）
        for (let i = 0; i < 60; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 5 + Math.random() * 30;
            const grad = cCtx.createRadialGradient(x, y, 0, x, y, r);
            
            const grayVal = 200 + Math.random() * 40; // かなり明るいグレー
            grad.addColorStop(0, `rgba(${grayVal}, ${grayVal}, ${grayVal}, 0.2)`);
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            cCtx.fillStyle = grad;
            cCtx.beginPath();
            cCtx.arc(x, y, r, 0, Math.PI * 2);
            cCtx.fill();
        }

        // 砂利や気泡のような細かい点々
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 0.5 + Math.random() * 1.5;
            cCtx.fillStyle = Math.random() > 0.5 ? 'rgba(60, 60, 60, 0.4)' : 'rgba(200, 200, 200, 0.4)';
            cCtx.beginPath();
            cCtx.arc(x, y, r, 0, Math.PI * 2);
            cCtx.fill();
        }

        // 2. バンプマップ用のキャンバス
        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size;
        bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');
        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);

        // 鋭いひび割れ（クラック）
        bCtx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        for (let i = 0; i < 30; i++) {
            bCtx.lineWidth = 1 + Math.random() * 2;
            let x = Math.random() * size;
            let y = Math.random() * size;
            bCtx.beginPath();
            bCtx.moveTo(x, y);
            for (let j = 0; j < 8; j++) {
                x += (Math.random() - 0.5) * 60;
                y += (Math.random() - 0.5) * 60;
                bCtx.lineTo(x, y);
            }
            bCtx.stroke();
        }

        // 隆起したボコボコ
        for (let i = 0; i < 100; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 5 + Math.random() * 20;
            const grad = bCtx.createRadialGradient(x, y, 0, x, y, r);
            const isUp = Math.random() > 0.3; 
            const val = isUp ? 255 : 0;
            grad.addColorStop(0, `rgba(${val}, ${val}, ${val}, 0.5)`);
            grad.addColorStop(1, `rgba(128, 128, 128, 0)`);
            bCtx.fillStyle = grad;
            bCtx.beginPath();
            bCtx.arc(x, y, r, 0, Math.PI * 2);
            bCtx.fill();
        }

        const colorTex = new THREE.CanvasTexture(colorCanvas);
        colorTex.wrapS = colorTex.wrapT = THREE.RepeatWrapping;
        
        const bumpTex = new THREE.CanvasTexture(bumpCanvas);
        bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;

        return { map: colorTex, bumpMap: bumpTex };
    }

    initPostProcessing() {
        if (!this.composer) {
            this.composer = new EffectComposer(this.renderer);
            const renderPass = new RenderPass(this.scene, this.camera);
            this.composer.addPass(renderPass);
        }
        if (this.useSSAO) {
            this.ssaoPass = new SSAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
            this.ssaoPass.kernelRadius = 8;
            this.composer.addPass(this.ssaoPass);
        }
        if (this.useBloom) {
            this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 4, window.innerHeight / 4), 0.2, 0.1, 1.2);
            this.composer.addPass(this.bloomPass);
        }
        if (this.useDOF) {
            this.initDOF({
                focus: 500,
                aperture: 0.000005,
                maxblur: 0.003
            });
        }
    }

    handlePhase(phase) {
        super.handlePhase(phase);
        
        const phaseValue = Math.min(9, Math.max(0, phase || 0));

        // Phaseの進行に合わせてエフェクトを順番に解放（累積的にONにしていく）
        for (let i = 1; i <= 6; i++) {
            this.trackEffects[i] = (phaseValue >= i);
        }

        // 特別な演出：Phase 0 の時は全てオフ、かつ原点回帰
        if (phaseValue === 0) {
            for (let i = 1; i <= 9; i++) this.trackEffects[i] = false;
            
            this.currentMode = this.MODE_DEFAULT;
            this.modeTimer = 0; 
            console.log("Phase 0 detected: Resetting positions and effects");
            
            this.particles.forEach(p => {
                p.position.set(0, 200, 0);
                p.velocity.set(0, 0, 0);
            });

            this.useGravity = false;
            this.spiralMode = false;
            this.torusMode = false;

            // カメラもデフォルトに戻す
            this.applyCameraModeForMovement();
        }
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;
        
        if (this.sphereMaterialShader) {
            this.sphereMaterialShader.uniforms.uTime.value = this.time;
        }
        if (this.sphereDepthShader) {
            this.sphereDepthShader.uniforms.uTime.value = this.time;
        }

        // actual_tick (0〜36864) に基づいた表示数の動的制御
        const totalTicks = 36864;
        const tick = this.actualTick || 0;
        
        const halfTicks = totalTicks / 2; // ループの半分 (18432)
        const phase8StartTick = Math.floor((totalTicks / 9) * 8); // Phase 8 の開始目安 (約32768)
        const phase9StartTick = Math.floor((totalTicks / 9) * 9) - 100; // Phase 9 の開始目安（ほぼ最後）
        
        let currentVisibleCount;
        if (tick === 0) {
            // 曲が止まっている（または開始前）は1000個固定
            currentVisibleCount = 1000;
        } else if (tick < halfTicks) {
            // 序盤から半分まで：1000個から20000個へ一気に増殖
            const progress = tick / halfTicks;
            currentVisibleCount = Math.floor(1000 + (this.sphereCount - 1000) * progress);
        } else if (tick < phase8StartTick) {
            // 半分からPhase 8まで：最大数（20000個）をキープ！
            currentVisibleCount = this.sphereCount;
        } else if (tick < phase9StartTick) {
            // Phase 8からPhase 9まで：20000個から0個へ一気に収束
            const progress = Math.min(1.0, (tick - phase8StartTick) / (phase9StartTick - phase8StartTick));
            currentVisibleCount = Math.floor(this.sphereCount * (1.0 - progress));
        } else {
            // Phase 9からラスト：0個！完全消滅！
            currentVisibleCount = 0;
        }

        // HUDに表示するパーティクル数を更新
        this.setParticleCount(currentVisibleCount);
        this.currentVisibleCount = currentVisibleCount; // 物理演算用に保存

        // インスタンスメッシュの描画数を更新
        if (this.instancedMeshManager) {
            const mainMesh = this.instancedMeshManager.getMainMesh();
            if (mainMesh) {
                // THREE.InstancedMesh.count を直接制御
                mainMesh.count = Math.max(1, currentVisibleCount);
                // 行列の更新フラグを立てる
                mainMesh.instanceMatrix.needsUpdate = true;
            }
        }

        // 時間によるモードの自動ランダマイズ
        this.modeTimer += deltaTime;
        if (this.modeTimer >= this.modeInterval) {
            this.modeTimer = 0;
            
            const weights = [
                1.0, // DEFAULT
                1.2, // GRAVITY
                1.5, // SPIRAL 
                1.5, // TORUS 
                1.0, // WALL
                1.0, // WAVE
                1.2, // BLACK_HOLE
                1.0, // PILLARS
                0.8, // CHAOS 
                1.5  // DEFORM 
            ];
            
            // 未選択のモードがあるかチェック
            const unvisitedModes = [];
            for (let i = 0; i < this.totalModeCount; i++) {
                if (!this.modeHistory.has(i)) {
                    unvisitedModes.push(i);
                }
            }

            let nextMode = -1;

            if (unvisitedModes.length > 0) {
                // 未選択のモードがある場合は、その中から重み付きで選ぶ
                let subTotalWeight = 0;
                unvisitedModes.forEach(m => subTotalWeight += weights[m]);
                
                let random = Math.random() * subTotalWeight;
                for (const m of unvisitedModes) {
                    if (random < weights[m]) {
                        nextMode = m;
                        break;
                    }
                    random -= weights[m];
                }
                // 万が一漏れたら最初の未選択モード
                if (nextMode === -1) nextMode = unvisitedModes[0];
            } else {
                // 全モード一周した後は通常通り（ただし今のモード以外）
                const totalWeight = weights.reduce((a, b) => a + b, 0);
                let random = Math.random() * totalWeight;
                
                for (let i = 0; i < weights.length; i++) {
                    if (random < weights[i]) {
                        nextMode = i;
                        break;
                    }
                    random -= weights[i];
                }
                
                // 現在のモードと同じなら再抽選
                if (nextMode === this.currentMode) {
                    nextMode = (nextMode + 1) % this.totalModeCount;
                }
            }
            
            this.currentMode = nextMode;
            this.modeHistory.add(nextMode);

            // 全モード一周したら履歴をリセットして、また全モード選ばれるようにする
            if (this.modeHistory.size >= this.totalModeCount) {
                console.log("All modes visited at least once! Resetting history.");
                this.modeHistory.clear();
                this.modeHistory.add(this.currentMode); // 現在のモードは既読にする
            }

            console.log(`Auto Randomizing Mode: ${this.currentMode} (Weighted, History: ${this.modeHistory.size}/${this.totalModeCount})`);

            // モードフラグの更新（updatePhysicsで使用）
            this.useGravity = (this.currentMode === this.MODE_GRAVITY);
            this.spiralMode = (this.currentMode === this.MODE_SPIRAL);
            this.torusMode = (this.currentMode === this.MODE_TORUS);

            // 【追加】モードが変わった瞬間にカメラプリセットを適用
            this.applyCameraModeForMovement();

            // モード切り替え時の特殊処理
            if (this.currentMode === this.MODE_GRAVITY) {
                // 重力モード：即座に落下開始
                this.particles.forEach(p => {
                    if (p.velocity.y > 0) p.velocity.y = 0;
                });
            } else if (this.currentMode === this.MODE_SPIRAL) {
                // 螺旋モード：位置を完全にランダムに散らして、渋滞を回避する
                this.particles.forEach((p, idx) => {
                    const r = Math.random() * this.spawnRadius;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.random() * Math.PI;
                    p.position.set(
                        r * Math.sin(phi) * Math.cos(theta),
                        p.spiralHeightFactor * 5000 - 500, // 2000 -> 5000 担当高度を大幅に拡大
                        r * Math.sin(phi) * Math.sin(theta)
                    );
                    p.velocity.set(0, 0, 0); 
                });
            }
        }

        this.updatePhysics(deltaTime);
        this.updateExpandSpheres();
        
        if (this.useDOF && this.bokehPass && this.instancedMeshManager) {
            const mainMesh = this.instancedMeshManager.getMainMesh();
            if (mainMesh) {
                this.updateAutoFocus([mainMesh]);
            }
        }
    }

    updatePhysics(deltaTime) {
        const subSteps = 2;
        const dt = deltaTime / subSteps;
        const halfSize = 4950; // スタジオサイズ10000に合わせて拡張（950 -> 4950）
        const tempVec = new THREE.Vector3();
        const diff = new THREE.Vector3();
        const visibleCount = Math.min(this.currentVisibleCount || 0, this.particles.length);

        for (let s = 0; s < subSteps; s++) {
            this.grid.clear();
            for (let i = 0; i < visibleCount; i++) {
                const p = this.particles[i];
                const gx = Math.floor(p.position.x / this.gridSize);
                const gy = Math.floor(p.position.y / this.gridSize);
                const gz = Math.floor(p.position.z / this.gridSize);
                const key = (gx + 100) + (gy + 100) * 200 + (gz + 100) * 40000;
                if (!this.grid.has(key)) this.grid.set(key, []);
                this.grid.get(key).push(i);
            }

            for (let idx = 0; idx < visibleCount; idx++) {
                const p = this.particles[idx];
                const springK = 0.02;
                const damping = 0.96;

                // モード別の力計算
                if (this.currentMode === this.MODE_SPIRAL) {
                    const side = (idx % 2 === 0) ? 1 : -1;
                    const rotationSpeed = 1.5;
                    // 螺旋の半径（太さ）をさらにガッツリ広げる（400 -> 800）
                    const radius = 800 * p.radiusOffset * p.strayRadiusOffset; 
                    
                    // 下から上へ移動（ループ処理は境界判定で行う）
                    const verticalSpeed = 15.0 * p.spiralSpeedFactor; // 基本速度15 + 個体差
                    p.position.y += verticalSpeed * dt * 60;
                    
                    // Y座標に応じた回転角度
                    // カーブを 0.015 から 0.006 に戻して少しキツめを維持
                    // 位相のズレを 1.5 から 0.3 に戻して、交差ポイントを適度に離す
                    const angle = (this.time * rotationSpeed) + (p.position.y * 0.006) + (side === 1 ? 0.3 : Math.PI + 0.3) + (p.phaseOffset * 0.05);
                    const targetX = Math.cos(angle) * radius;
                    const targetZ = Math.sin(angle) * radius;
                    
                    p.velocity.y *= 0.9; // Y方向の速度は直接加算するので摩擦を強める
                    
                    // XZ平面での引力
                    const spiralSpringK = 0.05 * p.strayFactor;
                    tempVec.set((targetX - p.position.x) * spiralSpringK, 0, (targetZ - p.position.z) * spiralSpringK);
                    p.addForce(tempVec);

                } else if (this.currentMode === this.MODE_TORUS) {
                    const mainRadius = 1200;
                    // はみ出し粒子はドーナツの「外側」や「内側」に大きくズレる
                    const tubeRadius = 60 * p.radiusOffset * p.strayRadiusOffset; 
                    const theta = (idx / this.sphereCount) * Math.PI * 2 + (this.time * 0.2);
                    const phi = (idx % 20) / 20 * Math.PI * 2 + (theta * 6.0) + (this.time * 1.5) + p.phaseOffset;
                    const tx = (mainRadius + tubeRadius * Math.cos(phi)) * Math.cos(theta);
                    const ty = tubeRadius * Math.sin(phi) + 300;
                    const tz = (mainRadius + tubeRadius * Math.cos(phi)) * Math.sin(theta);
                    
                    // はみ出し粒子は引力を弱める
                    const torusSpringK = 0.01 * p.strayFactor; // 0.04 -> 0.01
                    tempVec.set((tx - p.position.x) * torusSpringK, (ty - p.position.y) * torusSpringK, (tz - p.position.z) * torusSpringK);
                    p.addForce(tempVec);

                } else if (this.currentMode === this.MODE_WALL) {
                    // 垂直グリッド壁：さらに密度を極限まで高めて、一面の壁にする
                    const cols = 200; 
                    const spacing = 40; 
                    // はみ出し粒子は壁の「前後」に大きく漂う
                    const zOffset = p.isStray ? (p.targetOffset.z * 5.0) : (p.targetOffset.z * 0.2);
                    const tx = ((idx % cols) - cols * 0.5) * spacing + p.targetOffset.x * 0.05; 
                    const ty = (Math.floor(idx / cols) - (this.sphereCount / cols) * 0.5) * spacing + 500 + p.targetOffset.y * 0.05;
                    const tz = 0 + zOffset; // ど真ん中（z=0）に配置
                    
                    // はみ出し粒子は引力を弱める
                    const wallSpringK = 0.01 * p.strayFactor; // 0.05 -> 0.01
                    tempVec.set((tx - p.position.x) * wallSpringK, (ty - p.position.y) * wallSpringK, (tz - p.position.z) * wallSpringK);
                    p.addForce(tempVec);

                } else if (this.currentMode === this.MODE_WAVE) {
                    // 巨大な波：数に応じて動的に密度を計算し、サイズを大幅に拡大
                    const cols = Math.floor(Math.sqrt(this.sphereCount));
                    const spacing = 5000 / cols; // 2500 -> 5000 に波の広がりを倍増！
                    // はみ出し粒子は波の「上下」に激しく飛び出す
                    const yOffset = p.isStray ? (p.targetOffset.y * 2.0) : (p.targetOffset.y * 0.05);
                    const tx = ((idx % cols) - cols * 0.5) * spacing + p.targetOffset.x * 0.05;
                    const tz = (Math.floor(idx / cols) - cols * 0.5) * spacing + p.targetOffset.z * 0.05;
                    const ty = Math.sin(tx * 0.001 + this.time) * Math.cos(tz * 0.001 + this.time) * 600 + 200 + yOffset;
                    
                    // はみ出し粒子は引力を弱める
                    const waveSpringK = 0.01 * p.strayFactor; // 0.05 -> 0.01
                    tempVec.set((tx - p.position.x) * waveSpringK, (ty - p.position.y) * waveSpringK, (tz - p.position.z) * waveSpringK);
                    p.addForce(tempVec);

                } else if (this.currentMode === this.MODE_BLACK_HOLE) {
                    if (idx % 10 < 7) {
                        const radius = (idx / this.sphereCount) * 1200 + 50 + p.targetOffset.x * 0.5;
                        const angle = (idx * 0.05) + (this.time * 3.0) + p.phaseOffset * 0.1;
                        const tx = Math.cos(angle) * radius;
                        const tz = Math.sin(angle) * radius;
                        const ty = (Math.sin(radius * 0.01 - this.time * 2.0) * 50) + 200 + p.targetOffset.y * 0.2;
                        
                        const bhSpringK = 0.02 * p.strayFactor; // 0.06 -> 0.02
                        tempVec.set((tx - p.position.x) * bhSpringK, (ty - p.position.y) * bhSpringK, (tz - p.position.z) * bhSpringK);
                        p.addForce(tempVec);
                    } else {
                        const side = (idx % 2 === 0) ? 1 : -1;
                        const tx = (Math.random() - 0.5) * 40 + p.targetOffset.x * 0.1;
                        const tz = (Math.random() - 0.5) * 40 + p.targetOffset.z * 0.1;
                        const ty = side * (((idx % 100) / 100) * 4000 + 200) + p.targetOffset.y * 0.5;
                        
                        const jetSpringK = 0.02 * p.strayFactor; // 0.1 -> 0.02
                        tempVec.set((tx - p.position.x) * jetSpringK, (ty - p.position.y) * jetSpringK, (tz - p.position.z) * jetSpringK);
                        p.addForce(tempVec);
                    }
                    p.addForce(tempVec);

                } else if (this.currentMode === this.MODE_PILLARS) {
                    const pillarIdx = idx % 5;
                    const angle = (pillarIdx / 5) * Math.PI * 2;
                    const pillarRadius = 1500; // 800 -> 1500 に柱の間隔を拡大！
                    const px = Math.cos(angle) * pillarRadius;
                    const pz = Math.sin(angle) * pillarRadius;
                    const tx = px + (Math.sin(idx + this.time) * 100) + p.targetOffset.x * 0.5;
                    const tz = pz + (Math.cos(idx + this.time) * 50) + p.targetOffset.z * 0.5;
                    const ty = ((idx / 5) / (this.sphereCount / 5)) * 3000 - 1000 + p.targetOffset.y * 0.2;
                    
                    const pillarSpringK = 0.01 * p.strayFactor; // 0.05 -> 0.01
                    tempVec.set((tx - p.position.x) * pillarSpringK, (ty - p.position.y) * pillarSpringK, (tz - p.position.z) * pillarSpringK);
                    p.addForce(tempVec);

                } else if (this.currentMode === this.MODE_CHAOS) {
                    const force = Math.sin(this.time * 2.0 + p.phaseOffset) * 0.5 * p.strayFactor; // 2.0 -> 0.5
                    tempVec.copy(p.position).normalize().multiplyScalar(force);
                    p.addForce(tempVec);

                } else if (this.currentMode === this.MODE_DEFORM) {
                    // 【新】変形モード：球体同相の物体を軸として、歪ませる
                    // 2万個の粒子で巨大な「アメーバ状の球体」を作る
                    const baseRadius = 600;
                    const noiseSpeed = 0.5; // 1.0 -> 0.5
                    
                    // 球面上の基本位置
                    // idx % 1000 ではなく、全インデックスを使って均等に散らす
                    const theta = (idx / this.sphereCount) * Math.PI * 2;
                    const phi = Math.acos(2 * (idx / this.sphereCount) - 1);
                    
                    // ノイズによる半径の歪み
                    const nx = Math.cos(theta) * Math.sin(phi);
                    const ny = Math.sin(theta) * Math.sin(phi);
                    const nz = Math.cos(phi);
                    
                    // 時間と位置によるグニャグニャ感
                    const distortion = Math.sin(nx * 5.0 + this.time * noiseSpeed) * 
                                     Math.cos(ny * 5.0 + this.time * noiseSpeed) * 
                                     Math.sin(nz * 5.0 + this.time * noiseSpeed) * 100; // 200 -> 100
                    
                    const r = (baseRadius + distortion) * p.radiusOffset;
                    const tx = nx * r;
                    const ty = ny * r + 300;
                    const tz = nz * r;
                    
                    const springK = 0.01 * p.strayFactor; // 0.04 -> 0.01
                    tempVec.set((tx - p.position.x) * springK, (ty - p.position.y) * springK, (tz - p.position.z) * springK);
                    p.addForce(tempVec);

                } else if (this.currentMode === this.MODE_GRAVITY) {
                    p.velocity.multiplyScalar(0.98);
                } else {
                    // DEFAULT: 中心の引力 + 個体ごとの目標オフセット（球状分布）
                    const tx = p.targetOffset.x;
                    const ty = p.targetOffset.y + 200;
                    const tz = p.targetOffset.z;
                    const defSpringK = 0.0005 * p.strayFactor; // 0.001 -> 0.0005
                    tempVec.set((tx - p.position.x) * defSpringK, (ty - p.position.y) * defSpringK, (tz - p.position.z) * defSpringK);
                    p.addForce(tempVec);
                }

                // 重力の適用（MODE_GRAVITYの時のみ）
                if (this.currentMode === this.MODE_GRAVITY) {
                    p.addForce(this.gravityForce);
                }

                p.update();
                
                // 全体的な摩擦（空気抵抗）を大幅に強化（0.98 -> 0.92）
                // これにより痙攣（微振動）を吸収し、しっとりとした動きにする
                p.velocity.multiplyScalar(0.95); // 0.92 -> 0.95 少し戻してスムーズに
                
                if (this.useWallCollision) {
                    if (p.position.x > halfSize) { p.position.x = halfSize; p.velocity.x *= -0.3; } // 0.5 -> 0.3
                    if (p.position.x < -halfSize) { p.position.x = -halfSize; p.velocity.x *= -0.3; }
                    
                    // 天井の判定をスタジオサイズに合わせて拡張（1500 -> 4500）
                    // 螺旋モード以外でも高く昇れるようにする
                    if (p.position.y > 4500) { 
                        if (this.currentMode === this.MODE_SPIRAL) {
                            p.position.y = -450; // 下端から再出現
                            p.velocity.y *= 0.1; // 勢いをリセット
                        } else {
                            p.position.y = 4500; // 他は跳ね返り
                            p.velocity.y *= -0.3; // 0.5 -> 0.3
                        }
                    }
                    
                    if (p.position.y < -450) { 
                        p.position.y = -450; 
                        p.velocity.y *= -0.1; // 0.2 -> 0.1
                        const rollFactor = 0.05 / (p.radius / 30); // 0.1 -> 0.05
                        p.angularVelocity.z = -p.velocity.x * rollFactor;
                        p.angularVelocity.x = p.velocity.z * rollFactor;
                        p.velocity.x *= 0.98; // 0.97 -> 0.98
                        p.velocity.z *= 0.98;
                    }
                    if (p.position.z > halfSize) { p.position.z = halfSize; p.velocity.z *= -0.3; } // 0.5 -> 0.3
                    if (p.position.z < -halfSize) { p.position.z = -halfSize; p.velocity.z *= -0.3; }
                }
                p.updateRotation(dt);
            }
        }

        if (this.instancedMeshManager) {
            for (let i = 0; i < visibleCount; i++) {
                const p = this.particles[i];
                this.instancedMeshManager.setMatrixAt(i, p.position, p.rotation, p.scale);
            }
            this.instancedMeshManager.markNeedsUpdate();
        }
    }

    handleTrackNumber(trackNumber, message) {
        if (trackNumber === 6) {
            const args = message.args || [];
            const velocity = args[1] !== undefined ? args[1] : 127; 
            this.triggerExpandEffect(velocity);
        }
    }

    triggerExpandEffect(velocity = 127) {
        const center = new THREE.Vector3((Math.random()-0.5)*this.spawnRadius*0.4, (Math.random()-0.5)*this.spawnRadius*0.4, (Math.random()-0.5)*this.spawnRadius*0.4);
        const explosionRadius = 2000; // 1000 -> 2000 スタジオの半分を飲み込む爆風！
        const vFactor = velocity / 127.0;
        const explosionForce = 250.0 * vFactor; // 80.0 -> 250.0 跡形もなく吹き飛ばすで！

        this.particles.forEach(p => {
            const diff = p.position.clone().sub(center);
            const dist = diff.length();
            if (dist < explosionRadius) {
                const strength = Math.pow(1.0 - dist/explosionRadius, 2.0) * explosionForce;
                p.addForce(diff.normalize().multiplyScalar(strength));
            }
        });
    }

    updateExpandSpheres() {
        const now = Date.now();
        for (let i = this.expandSpheres.length - 1; i >= 0; i--) {
            const effect = this.expandSpheres[i];
            const progress = (now - effect.startTime) / effect.duration;
            if (progress >= 1.0) {
                if (effect.light) this.scene.remove(effect.light);
                if (effect.mesh) {
                    this.scene.remove(effect.mesh);
                    effect.mesh.geometry.dispose();
                    effect.mesh.material.dispose();
                }
                this.expandSpheres.splice(i, 1);
            } else {
                if (effect.light) effect.light.intensity = effect.maxIntensity * (1.0 - Math.pow(progress, 0.5));
                if (effect.mesh) effect.mesh.scale.setScalar(1.0 - progress);
            }
        }
    }

    /**
     * カメラをランダムに切り替える（Scene12と同じ広範囲なランダマイズ）
     */
    switchCameraRandom() {
        // 次のカメラを選択
        let newIndex = this.currentCameraIndex;
        while (newIndex === this.currentCameraIndex) {
            newIndex = Math.floor(Math.random() * this.cameraParticles.length);
        }
        this.currentCameraIndex = newIndex;
        const cp = this.cameraParticles[this.currentCameraIndex];

        // 全てのカメラパーティクルのパラメータを一度リセット
        this.cameraParticles.forEach(p => {
            p.minDistance = 400;
            p.maxDistance = 2000;
            p.boxMin = null;
            p.boxMax = null;
            p.maxSpeed = 8.0;
        });

        // Scene12と同等の広範囲なランダム配置
        const angle1 = Math.random() * Math.PI * 2;
        const angle2 = Math.random() * Math.PI;
        const dist = 1000 + Math.random() * 2000; // 広めに設定
        cp.position.set(
            Math.cos(angle1) * Math.sin(angle2) * dist,
            Math.sin(angle1) * Math.sin(angle2) * dist + 500,
            Math.cos(angle2) * dist
        );
        cp.applyRandomForce();

        console.log(`Camera switched to #${this.currentCameraIndex + 1} (Wide Random)`);
    }

    /**
     * 現在の運動モードに最適なカメラプリセットを適用する（トラック1がオフでも実行）
     */
    applyCameraModeForMovement() {
        const cp = this.cameraParticles[this.currentCameraIndex];
        const mode = this.currentMode;

        switch (mode) {
            case this.MODE_GRAVITY:
                cp.applyPreset('LOOK_UP');
                break;
            case this.MODE_SPIRAL:
                cp.applyPreset('SKY_HIGH');
                break;
            case this.MODE_TORUS:
                cp.applyPreset('WIDE_VIEW', { distance: 3000 });
                break;
            case this.MODE_WALL:
                cp.applyPreset('FRONT_SIDE', { z: 1500, x: 3000 });
                break;
            case this.MODE_WAVE:
                cp.applyPreset('DRONE_SURFACE', { y: -300 });
                break;
            case this.MODE_BLACK_HOLE:
                cp.applyPreset('CORE_JET', { height: 4000 });
                break;
            case this.MODE_PILLARS:
                cp.applyPreset('PILLAR_WALK');
                break;
            case this.MODE_CHAOS:
                cp.applyPreset('CHAOTIC');
                break;
            case this.MODE_DEFORM:
                cp.applyPreset('WIDE_VIEW', { distance: 2000 });
                break;
            default:
                cp.applyPreset('DEFAULT');
                break;
        }
        console.log(`Camera Preset Applied for Mode: ${mode}`);
    }

    reset() { super.reset(); }

    dispose() {
        this.initialized = false;
        console.log('Scene13.dispose: クリーンアップ開始');
        if (this.studio) this.studio.dispose();
        this.expandSpheres.forEach(e => {
            if (e.light) this.scene.remove(e.light);
            if (e.mesh) { this.scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); }
        });
        if (this.instancedMeshManager) this.instancedMeshManager.dispose();
        if (this.ssaoPass) {
            if (this.composer) {
                const idx = this.composer.passes.indexOf(this.ssaoPass);
                if (idx !== -1) this.composer.passes.splice(idx, 1);
            }
            this.ssaoPass.enabled = false;
        }
        super.dispose();
    }
}
