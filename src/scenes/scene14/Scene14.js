/**
 * Scene14: 新規シーン（テンプレートベース）
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import { StudioBox } from '../../lib/StudioBox.js';
import { Scene14Particle } from './Scene14Particle.js';

export class Scene14 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'Xenolite';  // 一旦タイトルはScene14にしておくで！
        this.initialized = false;
        
        // 共有リソースマネージャー
        this.sharedResourceManager = sharedResourceManager;
        this.useSharedResources = !!sharedResourceManager;
        
        // レイキャスター（オートフォーカス用）
        this.raycaster = new THREE.Raycaster();
        
        // Boxの設定
        this.partTypes = 20; // 20種類
        this.instancesPerType = 500; // 500個 (20 * 500 = 10000)
        this.sphereCount = this.partTypes * this.instancesPerType; // 10000個
        this.spawnRadius = 1200;  // さらに広げてスケール感を出す（1000 -> 1200）
        
        // メインメッシュ
        this.instancedMeshManagers = []; // 複数のマネージャーを管理
        this.particles = [];
        this.fluorescentLights = [];

        // 空間分割用
        this.gridSize = 120; 
        this.grid = new Map();

        // 撮影用スタジオ
        this.studio = null;
        
        // エフェクト設定
        this.useDOF = true;
        this.useBloom = true; 
        this.useSSAO = false; // 重いのでオフ
        this.useWallCollision = true; // 壁判定オン
        this.bokehPass = null;
        this.bloomPass = null;
        this.ssaoPass = null;

        // 全てのエフェクトをデフォルトでオフに設定（Phaseで解放）
        this.trackEffects = {
            1: false, // カメラランダマイズ
            2: false, // 色反転
            3: false, // 色収差
            4: false, // グリッチ
            5: false, // 未割り当て
            6: false, // 未割り当て
            7: false, // 未割り当て
            8: false, // 未割り当て
            9: false  // 未割り当て
        };

        // モード管理（20パターンの幾何学モード！）
        this.MODE_DEFAULT = 0;
        this.MODE_RINGS   = 1;
        this.MODE_CUBE    = 2;
        this.MODE_PYRAMID = 3;
        this.MODE_CYLINDER = 4;
        this.MODE_DOUBLE_HELIX = 5;
        this.MODE_GRID_WALL = 6;
        this.MODE_SINE_WAVE = 7;
        this.MODE_CROSS = 8;
        this.MODE_STAR = 9;
        this.MODE_HOURGLASS = 10;
        this.MODE_DIAMOND = 11;
        this.MODE_HEXAGON = 12;
        this.MODE_DNA = 13;
        this.MODE_SATURN = 14;
        this.MODE_CUBE_FRAME = 15;
        this.MODE_GALAXY = 16;
        this.MODE_CONE = 17;
        this.MODE_MOBIUS = 18;
        this.MODE_FRACTAL_CUBES = 19;

        this.currentMode = this.MODE_DEFAULT;
        this.modeTimer = 0;
        this.modeInterval = 10.0; // 10秒ごとにモードチェンジ

        // 物理演算パラメータ
        this.useGravity = false;
        this.spiralMode = false;
        this.torusMode = false;
        this.currentVisibleCount = this.sphereCount; // 初期値をセット
        
        // ターゲット位置のキャッシュ
        this.geometricTargets = new Map(); // モードごとのターゲットをキャッシュ
        
        // 色管理用
        this.boxColors = new Float32Array(this.sphereCount * 3);
        this.tempColor = new THREE.Color();
        
        // シェーダー管理用
        this.sphereMaterialShader = null;
        this.sphereDepthShader = null;

        // トラック6用エフェクト管理
        this.expandSpheres = []; 
        
        // 重力設定
        this.gravityForce = new THREE.Vector3(0, -10.0, 0);

        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
    }

    /**
     * 初期セットアップ
     */
    async setup() {
        if (this.initialized) return;

        // 親クラスのsetup()を呼ぶ
        await super.setup();

        // カメラの初期位置
        this.camera.position.set(0, 500, 1500);
        this.camera.lookAt(0, 200, 0);
        if (this.camera.fov !== 60) {
            this.camera.fov = 60;
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
        // シーン13と同じ明るい設定に戻すで！
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x888888, 0.8);
        this.scene.add(hemiLight);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambientLight);

        // 環境マッピング（質感のために残す）
        const genEnvMap = () => {
            const size = 512;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            
            // 天井を真っ白にしたグラデーション（金属の映り込み用）
            const grad = ctx.createLinearGradient(0, 0, 0, size);
            grad.addColorStop(0, '#ffffff'); // 天井側（真っ白！）
            grad.addColorStop(0.3, '#ffffff'); // 少し広めに白を確保
            grad.addColorStop(0.7, '#111111'); // 壁面（暗い）
            grad.addColorStop(1, '#000000'); // 床側（真っ黒）
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, size, size);
            
            // スタジオ照明の映り込みをシミュレート（強烈な白）
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(size * 0.1, size * 0.1, size * 0.2, size * 0.6); 
            ctx.fillRect(size * 0.6, size * 0.3, size * 0.3, size * 0.2);
            
            const tex = new THREE.CanvasTexture(canvas);
            tex.mapping = THREE.EquirectangularReflectionMapping;
            return tex;
        };

        const envMap = genEnvMap();
        this.scene.environment = envMap; 

        // 3. DirectionalLight (影の範囲を極限まで広げて、黒い三角を消滅させるで！)
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight.position.set(2000, 3000, 2000); // 位置も少し遠ざけて全体をカバー
        directionalLight.castShadow = true;
        
        // 影の範囲をスタジオサイズに合わせて超拡大！
        directionalLight.shadow.camera.left = -8000;
        directionalLight.shadow.camera.right = 8000;
        directionalLight.shadow.camera.top = 8000;
        directionalLight.shadow.camera.bottom = -8000;
        directionalLight.shadow.camera.near = 100;
        directionalLight.shadow.camera.far = 15000; // 5000 -> 15000 これが短いと端っこが欠けるんや！
        
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.bias = -0.0001; // バイアスも微調整
        this.scene.add(directionalLight);

        // 4. PointLight (中心からの影も範囲拡大)
        const pointLight = new THREE.PointLight(0xffffff, 2.5, 5000); 
        pointLight.position.set(0, 500, 0); 
        pointLight.castShadow = true; 
        pointLight.shadow.camera.near = 10;
        pointLight.shadow.camera.far = 10000; // 4000 -> 10000
        pointLight.shadow.bias = -0.001;
        this.scene.add(pointLight);
    }

    /**
     * 撮影用スタジオ
     */
    createStudioBox() {
        this.studio = new StudioBox(this.scene, {
            size: 10000,
            color: 0xbbbbbb, // 0x888888 -> 0xbbbbbb 少し明るくしてグレーすぎ問題を解消！
            roughness: 0.8,
            metalness: 0.0,
            useFloorTile: true // タイル床を有効化
        });
    }

    /**
     * 金属パーツと物理演算の作成
     */
    createSpheres() {
        const textures = this.generateFleshTextures();
        const metalMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, // テクスチャの色をそのまま出すために白に設定
            map: textures.map, 
            bumpMap: textures.bumpMap,
            bumpScale: 5.0,  // 凹凸を強めてボロさを出す
            metalness: 0.6,  // 金属感を少し戻してハイライトを出す
            roughness: 0.6,  // 少し滑らかにして光を拾いやすくする
            envMapIntensity: 1.0 // 環境マップの映り込みを標準に戻す
        });

        // 20種類のジオメトリを定義（AKIRAっぽいメカニカルパーツ）
        const geometries = [
            new THREE.BoxGeometry(1, 1, 1), // 0: Box
            new THREE.CylinderGeometry(0.5, 0.5, 2, 8), // 1: Rod
            new THREE.CylinderGeometry(0.8, 0.8, 0.4, 6), // 2: Hex Nut
            new THREE.TorusGeometry(0.6, 0.2, 8, 16), // 3: Ring
            new THREE.CylinderGeometry(0.2, 0.2, 4, 8), // 4: Pipe
            new THREE.SphereGeometry(0.6, 12, 12), // 5: Joint
            new THREE.BoxGeometry(2, 0.2, 2), // 6: Plate
            new THREE.CylinderGeometry(0.5, 0, 1.5, 4), // 7: Pointy
            new THREE.TorusGeometry(0.8, 0.1, 4, 4), // 8: Square Ring
            new THREE.CylinderGeometry(1, 1, 0.3, 12), // 9: Disk
            new THREE.IcosahedronGeometry(0.7, 0), // 10: Faceted Joint
            new THREE.OctahedronGeometry(0.8, 0), // 11: Diamond Part
            new THREE.TetrahedronGeometry(0.9, 0), // 12: Fragment
            new THREE.CylinderGeometry(0.4, 0.4, 1.5, 16), // 13: Small Cylinder
            new THREE.ConeGeometry(0.6, 1.2, 8), // 14: Cone Part
            new THREE.TorusKnotGeometry(0.4, 0.1, 32, 8), // 15: Complex Wiring
            new THREE.DodecahedronGeometry(0.7, 0), // 16: Poly Part
            new THREE.CylinderGeometry(0.1, 0.1, 5, 6), // 17: Needle
            new THREE.BoxGeometry(1.5, 0.5, 0.5), // 18: Rect Part
            new THREE.BoxGeometry(0.5, 0.5, 0.5)  // 19: Small Cube
        ];

        // 各種類ごとにInstancedMeshManagerを作成
        for (let i = 0; i < this.partTypes; i++) {
            const manager = new InstancedMeshManager(this.scene, geometries[i], metalMat, this.instancesPerType);
            const mainMesh = manager.getMainMesh();
            mainMesh.castShadow = true;
            mainMesh.receiveShadow = true;
            
            // 個別色設定（ノイズ分布：綺麗な金属メイン、サビをレアに）
            const colors = new Float32Array(this.instancesPerType * 3);
            for (let j = 0; j < this.instancesPerType; j++) {
                // インデックスベースの簡易ノイズ
                const n = (Math.sin(j * 0.05) + Math.sin(j * 0.13) + Math.sin(j * 0.27)) / 3.0;
                const noiseVal = (n + 1.0) / 2.0; // 0.0 〜 1.0

                if (noiseVal < 0.55) {
                    // 1. グレー・ブルー（多め）- 55%
                    // 紫味を消すためにRとGを近づけ、Bを少しだけ強くする
                    const base = 0.3 + Math.random() * 0.1;
                    colors[j * 3 + 0] = base;       // R
                    colors[j * 3 + 1] = base + 0.05; // G (Rより少し高くして緑寄りに振ることで紫を回避)
                    colors[j * 3 + 2] = base + 0.15; // B (青みを強調)
                } else if (noiseVal < 0.80) {
                    // 2. 黒ずんだ金属（たまに）- 25%
                    const v = 0.05 + Math.random() * 0.1;
                    colors[j * 3 + 0] = v; 
                    colors[j * 3 + 1] = v; 
                    colors[j * 3 + 2] = v; 
                } else if (noiseVal < 0.95) {
                    // 3. 白っぽい金属（たまに）- 15%
                    const v = 0.7 + Math.random() * 0.2;
                    colors[j * 3 + 0] = v; 
                    colors[j * 3 + 1] = v; 
                    colors[j * 3 + 2] = v; 
                } else {
                    // 4. 錆びまくった茶色系（レア枠）- 5%
                    colors[j * 3 + 0] = 0.5 + Math.random() * 0.2; // R強め
                    colors[j * 3 + 1] = 0.2 + Math.random() * 0.1; // G弱め
                    colors[j * 3 + 2] = 0.05 + Math.random() * 0.05; // Bほぼなし
                }
            }
            mainMesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
            mainMesh.instanceColor.needsUpdate = true;

            mainMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
                depthPacking: THREE.RGBADepthPacking,
                alphaTest: 0.5
            });

            this.instancedMeshManagers.push(manager);
        }

        // パーティクルの生成（グループ化を防ぐために作成順序をシャッフル）
        const creationList = [];
        for (let typeIdx = 0; typeIdx < this.partTypes; typeIdx++) {
            for (let i = 0; i < this.instancesPerType; i++) {
                creationList.push({ typeIdx, indexInType: i });
            }
        }
        
        // シャッフル（Fisher-Yates）
        for (let i = creationList.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = creationList[i];
            creationList[i] = creationList[j];
            creationList[j] = temp;
        }

        creationList.forEach((info, idx) => {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = Math.pow(Math.random(), 1.5) * this.spawnRadius;
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            // サイズの調整（Scene13のような極端なランダムバリエーション）
            const sizeRand = Math.random();
            let baseSize;
            if (sizeRand < 0.7) {
                // 70%は小さめ (5〜12)
                baseSize = 5 + Math.random() * 7;
            } else if (sizeRand < 0.95) {
                // 25%は中くらい (12〜25)
                baseSize = 12 + Math.random() * 13;
            } else {
                // 5%だけ大きい (25〜45) - 巨大なパーツを混ぜる！
                baseSize = 25 + Math.random() * 20;
            }

            // 縦横比もランダムにして、細長いパーツや平べったいパーツを増やす
            const scaleX = baseSize * (0.5 + Math.random() * 1.5);
            const scaleY = baseSize * (0.5 + Math.random() * 1.5);
            const scaleZ = baseSize * (0.5 + Math.random() * 1.5);
            const scale = new THREE.Vector3(scaleX, scaleY, scaleZ);
            const radius = Math.max(scaleX, scaleY, scaleZ) * 0.5;
            
            const p = new Scene14Particle(x, y, z, radius, scale, info.typeIdx, info.indexInType);
            p.angularVelocity.multiplyScalar(2.0);
            this.particles.push(p);

            this.instancedMeshManagers[info.typeIdx].setMatrixAt(info.indexInType, p.position, p.rotation, p.scale);
        });
        
        this.instancedMeshManagers.forEach(m => m.markNeedsUpdate());
        this.setParticleCount(this.sphereCount);
    }

    /**
     * メカニカルな基板・パネル風テクスチャを生成（サビと傷を追加）
     */
    generateFleshTextures() {
        const size = 512;
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size;
        colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');
        
        // 1. ベースカラー（ニュートラルなグレーにして、instanceColorで色を付ける）
        cCtx.fillStyle = '#ffffff'; 
        cCtx.fillRect(0, 0, size, size);

        // 2. 腐食・汚れのパターン（サビの「形」を作る）
        for (let i = 0; i < 100; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 2 + Math.random() * 30;
            const grad = cCtx.createRadialGradient(x, y, 0, x, y, r);
            
            const darkVal = Math.random() * 100;
            grad.addColorStop(0, `rgba(${darkVal}, ${darkVal}, ${darkVal}, 0.6)`); 
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            cCtx.fillStyle = grad;
            cCtx.beginPath();
            cCtx.arc(x, y, r, 0, Math.PI * 2);
            cCtx.fill();
        }

        // 3. 細かい傷
        cCtx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const len = 2 + Math.random() * 10;
            cCtx.lineWidth = 0.5;
            cCtx.beginPath();
            cCtx.moveTo(x, y);
            cCtx.lineTo(x + (Math.random() - 0.5) * len, y + (Math.random() - 0.5) * len);
            cCtx.stroke();
        }

        // --- バンプマップ用（ボロさを出す） ---
        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size;
        bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');
        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);

        for (let i = 0; i < 120; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 1 + Math.random() * 20;
            const grad = bCtx.createRadialGradient(x, y, 0, x, y, r);
            const isCorrosion = Math.random() > 0.4;
            const val = isCorrosion ? 0 : 255;
            grad.addColorStop(0, `rgba(${val}, ${val}, ${val}, 0.4)`);
            grad.addColorStop(1, 'rgba(128, 128, 128, 0)');
            bCtx.fillStyle = grad;
            bCtx.beginPath();
            bCtx.arc(x, y, r, 0, Math.PI * 2);
            bCtx.fill();
        }

        const colorTex = new THREE.CanvasTexture(colorCanvas);
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
            this.bokehPass = new BokehPass(this.scene, this.camera, {
                focus: 500, 
                aperture: 0.000005, // シーン13と同じ
                maxblur: 0.003,     // シーン13と同じ
                width: window.innerWidth, 
                height: window.innerHeight
            });
            this.composer.addPass(this.bokehPass);
        }
    }

    handlePhase(phase) {
        super.handlePhase(phase);
        const phaseValue = Math.min(9, Math.max(0, phase || 0));
        for (let i = 1; i <= 6; i++) this.trackEffects[i] = (phaseValue >= i);
        if (phaseValue === 0) {
            for (let i = 1; i <= 9; i++) this.trackEffects[i] = false;
            this.currentMode = this.MODE_DEFAULT;
            this.modeTimer = 0; 
            this.particles.forEach(p => {
                p.position.set(0, 200, 0);
                p.velocity.set(0, 0, 0);
            });
            this.applyCameraModeForMovement();
        }
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;
        
        const currentVisibleCount = this.sphereCount;
        this.setParticleCount(currentVisibleCount);
        this.currentVisibleCount = currentVisibleCount;

        if (this.instancedMeshManagers.length > 0) {
            this.instancedMeshManagers.forEach(manager => {
                const mainMesh = manager.getMainMesh();
                if (mainMesh) {
                    mainMesh.count = this.instancesPerType;
                    mainMesh.instanceMatrix.needsUpdate = true;
                }
            });
        }

        this.modeTimer += deltaTime;
        if (this.modeTimer >= this.modeInterval) {
            this.modeTimer = 0;
            this.currentMode = (this.currentMode + 1) % 20;
            console.log(`Mode Switched: ${this.currentMode}`);
            this.applyCameraModeForMovement();
        }

        this.updatePhysics(deltaTime);
        this.updateExpandSpheres();
        
        if (this.useDOF && this.bokehPass && this.instancedMeshManagers.length > 0) {
            this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
            const meshes = this.instancedMeshManagers.map(m => m.getMainMesh()).filter(m => !!m);
            const intersects = this.raycaster.intersectObjects(meshes);
            let targetDistance;
            if (intersects.length > 0) {
                targetDistance = intersects[0].distance;
            } else {
                const targetVec = new THREE.Vector3(0, 0, -1);
                targetVec.applyQuaternion(this.camera.quaternion);
                const toOrigin = new THREE.Vector3(0, 0, 0).sub(this.camera.position);
                targetDistance = Math.max(100, toOrigin.dot(targetVec));
            }
            const currentFocus = this.bokehPass.uniforms.focus.value;
            const lerpFactor = 0.1; 
            this.bokehPass.uniforms.focus.value = currentFocus + (targetDistance - currentFocus) * lerpFactor;
        }
    }

    applyCameraModeForMovement() {
        const cp = this.cameraParticles[this.currentCameraIndex];
        if (!cp) return;
        cp.applyPreset('DEFAULT');
    }

    updatePhysics(deltaTime) {
        const visibleCount = Math.min(this.currentVisibleCount || 0, this.particles.length);
        const tempVec = new THREE.Vector3();
        const halfSize = 4950;

        if (this.currentMode !== this.MODE_DEFAULT && !this.geometricTargets.has(this.currentMode)) {
            this.generateGeometricTargets(this.currentMode);
        }

        const targets = this.geometricTargets.get(this.currentMode);

        for (let idx = 0; idx < visibleCount; idx++) {
            const p = this.particles[idx];
            p.force.set(0, 0, 0);

            if (this.currentMode !== this.MODE_DEFAULT && targets) {
                const targetPos = targets[idx % targets.length];
                
                // はみ出し粒子（isStray）の散らしを「ハエ」にならない程度に抑制（2.0 -> 0.5）
                let tx = targetPos.x + (p.isStray ? p.targetOffset.x * 0.5 : 0);
                let ty = targetPos.y + (p.isStray ? p.targetOffset.y * 0.5 : 0);
                let tz = targetPos.z + (p.isStray ? p.targetOffset.z * 0.5 : 0);

                const springK = 0.08 * p.strayFactor;
                tempVec.set((tx - p.position.x) * springK, (ty - p.position.y) * springK, (tz - p.position.z) * springK);
                p.addForce(tempVec);

                // 【循環フォース】図形の中でパーツをぐるぐる回すで！🌀
                const centerX = 0; const centerZ = 0;
                const dx = p.position.x - centerX;
                const dz = p.position.z - centerZ;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > 10) {
                    const vortexStrength = p.isStray ? 0.5 : 2.0; // はみ出し粒子はゆったり
                    p.addForce(new THREE.Vector3(-dz / dist * vortexStrength, 0, dx / dist * vortexStrength));
                }

                // 【うごめき】時間による微細な振動を追加（はみ出し粒子はさらにスローに）
                const wiggleSpeed = p.isStray ? 0.5 : 2.0;
                const wiggleStrength = p.isStray ? 3.0 : 5.0;
                p.addForce(new THREE.Vector3(
                    Math.sin(this.time * wiggleSpeed + idx) * wiggleStrength,
                    Math.cos(this.time * (wiggleSpeed * 0.8) + idx) * wiggleStrength,
                    Math.sin(this.time * (wiggleSpeed * 0.9) + idx) * wiggleStrength
                ));
            } else {
                const tx = p.targetOffset.x;
                const ty = p.targetOffset.y + 200;
                const tz = p.targetOffset.z;
                const defSpringK = 0.001 * p.strayFactor;
                tempVec.set((tx - p.position.x) * defSpringK, (ty - p.position.y) * defSpringK, (tz - p.position.z) * defSpringK);
                p.addForce(tempVec);
            }

            p.update();
            p.velocity.multiplyScalar(0.92); 
            
            if (this.useWallCollision) {
                if (p.position.x > halfSize) { p.position.x = halfSize; p.velocity.x *= -0.5; }
                if (p.position.x < -halfSize) { p.position.x = -halfSize; p.velocity.x *= -0.5; }
                if (p.position.y > 4500) { p.position.y = 4500; p.velocity.y *= -0.5; }
                if (p.position.y < -450) { 
                    p.position.y = -450; 
                    p.velocity.y *= -0.2; 
                    const rollFactor = 0.1 / (p.radius / 30); 
                    p.angularVelocity.z = -p.velocity.x * rollFactor;
                    p.angularVelocity.x = p.velocity.z * rollFactor;
                }
                if (p.position.z > halfSize) { p.position.z = halfSize; p.velocity.z *= -0.5; }
                if (p.position.z < -halfSize) { p.position.z = -halfSize; p.velocity.z *= -0.5; }
            }
            p.updateRotation(deltaTime);

            if (p.typeIndex !== undefined && this.instancedMeshManagers[p.typeIndex]) {
                this.instancedMeshManagers[p.typeIndex].setMatrixAt(p.indexInType, p.position, p.rotation, p.scale);
            }
        }
        this.instancedMeshManagers.forEach(m => m.markNeedsUpdate());
    }

    generateGeometricTargets(mode) {
        const targets = [];
        const count = 4000; 
        const center = new THREE.Vector3(0, 400, 0);

        switch(mode) {
            case this.MODE_RINGS: 
                const ringRadius = 800;
                const zSpacing = 800;
                for (let r = 0; r < 4; r++) {
                    const zPos = (r - 1.5) * zSpacing;
                    const tilt = (r < 2 ? 1 : -1) * (30 * Math.PI / 180);
                    for (let i = 0; i < 1000; i++) {
                        const theta = (i / 1000) * Math.PI * 2;
                        const p = new THREE.Vector3(Math.cos(theta) * ringRadius, Math.sin(theta) * ringRadius, 0);
                        const tx = p.x * Math.cos(tilt) + p.z * Math.sin(tilt);
                        const tz = -p.x * Math.sin(tilt) + p.z * Math.cos(tilt);
                        targets.push(new THREE.Vector3(tx, p.y + 400, tz + zPos));
                    }
                }
                break;

            case this.MODE_CUBE: 
                const size = 1200;
                for (let i = 0; i < count; i++) {
                    const side = Math.floor(Math.random() * 6);
                    const u = Math.random() - 0.5;
                    const v = Math.random() - 0.5;
                    const p = new THREE.Vector3();
                    if (side === 0) p.set(0.5, u, v);
                    else if (side === 1) p.set(-0.5, u, v);
                    else if (side === 2) p.set(u, 0.5, v);
                    else if (side === 3) p.set(u, -0.5, v);
                    else if (side === 4) p.set(u, v, 0.5);
                    else p.set(u, v, -0.5);
                    targets.push(p.multiplyScalar(size).add(center));
                }
                break;

            case this.MODE_PYRAMID: 
                const pSize = 1500;
                for (let i = 0; i < count; i++) {
                    const r1 = Math.random();
                    const p = new THREE.Vector3();
                    if (r1 < 0.25) { 
                        p.set(Math.random() - 0.5, 0, Math.random() - 0.5);
                    } else { 
                        const h = Math.random();
                        const s = 1.0 - h;
                        const theta = Math.floor(Math.random() * 4) * Math.PI / 2;
                        p.set(Math.cos(theta) * s * 0.5, h, Math.sin(theta) * s * 0.5);
                    }
                    targets.push(p.multiplyScalar(pSize).add(center));
                }
                break;

            case this.MODE_CYLINDER: 
                const cRadius = 700;
                const cHeight = 1500;
                for (let i = 0; i < count; i++) {
                    const theta = Math.random() * Math.PI * 2;
                    const h = Math.random() - 0.5;
                    targets.push(new THREE.Vector3(Math.cos(theta) * cRadius, h * cHeight + 400, Math.sin(theta) * cRadius));
                }
                break;

            case this.MODE_DOUBLE_HELIX: 
                for (let i = 0; i < count; i++) {
                    const h = (i / count) * 3000 - 1500;
                    const theta = (i / count) * Math.PI * 10;
                    const side = (i % 2 === 0) ? 0 : Math.PI;
                    targets.push(new THREE.Vector3(Math.cos(theta + side) * 500, h + 400, Math.sin(theta + side) * 500));
                }
                break;

            case this.MODE_GRID_WALL: 
                const gSize = 2500;
                for (let i = 0; i < count; i++) {
                    const x = (Math.random() - 0.5) * gSize;
                    const y = (Math.random() - 0.5) * gSize + 400;
                    targets.push(new THREE.Vector3(x, y, 0));
                }
                break;

            case this.MODE_SINE_WAVE: 
                const wSize = 3000;
                for (let i = 0; i < count; i++) {
                    const x = (Math.random() - 0.5) * wSize;
                    const z = (Math.random() - 0.5) * wSize;
                    const y = Math.sin(x * 0.005) * Math.cos(z * 0.005) * 500 + 400;
                    targets.push(new THREE.Vector3(x, y, z));
                }
                break;

            case this.MODE_CROSS: 
                for (let i = 0; i < count; i++) {
                    const p = new THREE.Vector3();
                    if (Math.random() < 0.5) p.set((Math.random() - 0.5) * 2000, 400, 0);
                    else p.set(0, (Math.random() - 0.5) * 2000 + 400, 0);
                    targets.push(p);
                }
                break;

            case this.MODE_STAR: 
                for (let i = 0; i < count; i++) {
                    const axis = Math.floor(Math.random() * 3);
                    const p = new THREE.Vector3();
                    const len = (Math.random() - 0.5) * 2500;
                    if (axis === 0) p.set(len, 400, 0);
                    else if (axis === 1) p.set(0, len + 400, 0);
                    else p.set(0, 400, len);
                    targets.push(p);
                }
                break;

            case this.MODE_HOURGLASS: 
                for (let i = 0; i < count; i++) {
                    const h = (Math.random() - 0.5) * 2;
                    const r = Math.abs(h) * 600;
                    const theta = Math.random() * Math.PI * 2;
                    targets.push(new THREE.Vector3(Math.cos(theta) * r, h * 800 + 400, Math.sin(theta) * r));
                }
                break;

            case this.MODE_DIAMOND: 
                const dSize = 1000;
                for (let i = 0; i < count; i++) {
                    const p = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5);
                    p.normalize().multiplyScalar(dSize);
                    const total = Math.abs(p.x) + Math.abs(p.y) + Math.abs(p.z);
                    p.divideScalar(total).multiplyScalar(dSize);
                    targets.push(p.add(center));
                }
                break;

            case this.MODE_HEXAGON: 
                for (let i = 0; i < count; i++) {
                    const theta = Math.floor(Math.random() * 6) * Math.PI / 3;
                    const h = Math.random() - 0.5;
                    const r = 800;
                    targets.push(new THREE.Vector3(Math.cos(theta) * r, h * 1500 + 400, Math.sin(theta) * r));
                }
                break;

            case this.MODE_DNA: 
                for (let i = 0; i < count; i++) {
                    const h = (i / count) * 3000 - 1500;
                    const theta = (i / count) * Math.PI * 8;
                    const side = (i % 2 === 0) ? 0 : Math.PI;
                    const p = new THREE.Vector3(Math.cos(theta + side) * 400, h + 400, Math.sin(theta + side) * 400);
                    if (i % 20 < 5) { 
                        const t = Math.random();
                        p.set(Math.cos(theta) * 400 * (1-2*t), h + 400, Math.sin(theta) * 400 * (1-2*t));
                    }
                    targets.push(p);
                }
                break;

            case this.MODE_SATURN: 
                for (let i = 0; i < count; i++) {
                    if (Math.random() < 0.4) { 
                        const theta = Math.random() * Math.PI * 2;
                        const phi = Math.random() * Math.PI;
                        const r = 500;
                        targets.push(new THREE.Vector3(Math.sin(phi) * Math.cos(theta) * r, Math.cos(phi) * r + 400, Math.sin(phi) * Math.sin(theta) * r));
                    } else { 
                        const theta = Math.random() * Math.PI * 2;
                        const r = 700 + Math.random() * 400;
                        targets.push(new THREE.Vector3(Math.cos(theta) * r, 400 + (Math.random()-0.5) * 20, Math.sin(theta) * r));
                    }
                }
                break;

            case this.MODE_CUBE_FRAME: 
                const fSize = 1200;
                for (let i = 0; i < count; i++) {
                    const edge = Math.floor(Math.random() * 12);
                    const t = Math.random() - 0.5;
                    const p = new THREE.Vector3();
                    if (edge === 0) p.set(t, 0.5, 0.5);
                    else if (edge === 1) p.set(t, -0.5, 0.5);
                    else if (edge === 2) p.set(t, 0.5, -0.5);
                    else if (edge === 3) p.set(t, -0.5, -0.5);
                    else if (edge === 4) p.set(0.5, t, 0.5);
                    else if (edge === 5) p.set(-0.5, t, 0.5);
                    else if (edge === 6) p.set(0.5, t, -0.5);
                    else if (edge === 7) p.set(-0.5, t, -0.5);
                    else if (edge === 8) p.set(0.5, 0.5, t);
                    else if (edge === 9) p.set(-0.5, 0.5, t);
                    else if (edge === 10) p.set(0.5, -0.5, t);
                    else p.set(-0.5, -0.5, t);
                    targets.push(p.multiplyScalar(fSize).add(center));
                }
                break;

            case this.MODE_GALAXY: 
                for (let i = 0; i < count; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const r = Math.pow(Math.random(), 0.5) * 1500;
                    const spiral = r * 0.01;
                    targets.push(new THREE.Vector3(Math.cos(angle + spiral) * r, 400 + (Math.random()-0.5) * 100 * (1 - r/1500), Math.sin(angle + spiral) * r));
                }
                break;

            case this.MODE_CONE: 
                for (let i = 0; i < count; i++) {
                    const h = Math.random();
                    const r = h * 800;
                    const theta = Math.random() * Math.PI * 2;
                    targets.push(new THREE.Vector3(Math.cos(theta) * r, (1-h) * 1500 - 350, Math.sin(theta) * r));
                }
                break;

            case this.MODE_MOBIUS: 
                for (let i = 0; i < count; i++) {
                    const u = (i / count) * Math.PI * 2;
                    const v = (Math.random() - 0.5) * 400;
                    const x = (1000 + v * Math.cos(u/2)) * Math.cos(u);
                    const y = (1000 + v * Math.cos(u/2)) * Math.sin(u);
                    const z = v * Math.sin(u/2);
                    targets.push(new THREE.Vector3(x, z + 400, y));
                }
                break;

            case this.MODE_FRACTAL_CUBES: 
                for (let i = 0; i < count; i++) {
                    const cx = (Math.floor(Math.random() * 3) - 1) * 1000;
                    const cy = (Math.floor(Math.random() * 3) - 1) * 1000 + 400;
                    const cz = (Math.floor(Math.random() * 3) - 1) * 1000;
                    targets.push(new THREE.Vector3(cx + (Math.random()-0.5) * 400, cy + (Math.random()-0.5) * 400, cz + (Math.random()-0.5) * 400));
                }
                break;
        }
        this.geometricTargets.set(mode, targets);
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
        const explosionRadius = 2000; 
        const vFactor = velocity / 127.0;
        const explosionForce = 250.0 * vFactor; 
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

    switchCameraRandom() {
        let newIndex = this.currentCameraIndex;
        while (newIndex === this.currentCameraIndex) {
            newIndex = Math.floor(Math.random() * this.cameraParticles.length);
        }
        this.currentCameraIndex = newIndex;
        const cp = this.cameraParticles[this.currentCameraIndex];
        this.cameraParticles.forEach(p => {
            p.minDistance = 400;
            p.maxDistance = 2000;
            p.boxMin = null;
            p.boxMax = null;
            p.maxSpeed = 8.0;
        });
        const angle1 = Math.random() * Math.PI * 2;
        const angle2 = Math.random() * Math.PI;
        const dist = 1000 + Math.random() * 2000; 
        cp.position.set(Math.cos(angle1) * Math.sin(angle2) * dist, Math.sin(angle1) * Math.sin(angle2) * dist + 500, Math.cos(angle2) * dist);
        cp.applyRandomForce();
        console.log(`Camera switched to #${this.currentCameraIndex + 1} (Wide Random)`);
    }

    dispose() {
        this.initialized = false;
        console.log('Scene14.dispose: クリーンアップ開始');
        if (this.studio) this.studio.dispose();
        this.expandSpheres.forEach(e => {
            if (e.light) this.scene.remove(e.light);
            if (e.mesh) { this.scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); }
        });
        if (this.instancedMeshManagers) {
            this.instancedMeshManagers.forEach(m => m.dispose());
            this.instancedMeshManagers = [];
        }
        if (this.bokehPass) {
            if (this.composer) {
                const idx = this.composer.passes.indexOf(this.bokehPass);
                if (idx !== -1) this.composer.passes.splice(idx, 1);
            }
            this.bokehPass.enabled = false;
        }
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
