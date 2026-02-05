/**
 * Scene13: 新規シーン（テンプレートベース）
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import { StudioBox } from '../../lib/StudioBox.js';
import { Scene13Particle } from './Scene13Particle.js';

export class Scene13 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'Scene 13';  // シーンのタイトルを設定
        
        // 共有リソースマネージャー
        this.sharedResourceManager = sharedResourceManager;
        this.useSharedResources = !!sharedResourceManager;
        
        // レイキャスター（オートフォーカス用）
        this.raycaster = new THREE.Raycaster();
        
        // Boxの設定
        this.sphereCount = 2000; 
        this.spawnRadius = 600; 
        
        // インスタンス管理
        this.instancedMeshManager = null;
        this.particles = [];

        // 空間分割用
        this.gridSize = 120; 
        this.grid = new Map();

        // 撮影用スタジオ
        this.studio = null;
        
        // エフェクト設定
        this.useDOF = true;
        this.useSSAO = false; // 重いのでオフ
        this.useWallCollision = true; // 壁判定オン
        this.bokehPass = null;
        this.ssaoPass = null;

        // トラック3,4(色収差、グリッチ)をデフォルトオフに設定
        this.trackEffects[3] = false;
        this.trackEffects[4] = false;

        // トラック6用エフェクト管理
        this.expandSpheres = []; 
        
        // モード設定（自動ランダマイズ）
        this.currentMode = 0;
        this.modeTimer = 0;
        this.modeInterval = 10.0; // 10秒ごとにランダムに切り替え
        
        // モード定数
        this.MODE_DEFAULT = 0;   // 浮遊・中心引力
        this.MODE_GRAVITY = 1;   // 重力落下
        this.MODE_SPIRAL  = 2;   // DNA二重螺旋
        this.MODE_TORUS   = 3;   // 捻れトーラス
        this.MODE_WALL    = 4;   // 垂直グリッド壁
        this.MODE_WAVE    = 5;   // 巨大な波（サーフェス）
        this.MODE_VORTEX  = 6;   // 銀河状の渦
        this.MODE_PILLARS = 7;   // 5本の垂直柱
        this.MODE_CHAOS   = 8;   // 混沌・脈動

        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
    }
    
    /**
     * セットアップ処理
     */
    async setup() {
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

        this.showGridRuler3D = true;
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
        this.studio = new StudioBox(this.scene, {
            size: 10000, // 2000 -> 10000 にバカデカく！
            color: 0xffffff, // 白に戻す
            roughness: 0.4,
            metalness: 0.0
        });
    }

    /**
     * Boxと物理演算の作成
     */
    createSpheres() {
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const textures = this.generateFleshTextures();
        const boxMat = new THREE.MeshStandardMaterial({
            map: textures.map,
            bumpMap: textures.bumpMap,
            bumpScale: 4.0, 
            metalness: 0.6, 
            roughness: 0.3, 
            emissive: 0x000000, 
            emissiveIntensity: 0.0
        });

        this.instancedMeshManager = new InstancedMeshManager(this.scene, boxGeo, boxMat, this.sphereCount);
        const mainMesh = this.instancedMeshManager.getMainMesh();
        mainMesh.castShadow = true;
        mainMesh.receiveShadow = true;
        
        // 個別色設定のための準備
        const colorArray = new Float32Array(this.sphereCount * 3);
        for (let i = 0; i < this.sphereCount; i++) {
            colorArray[i * 3 + 0] = 1.0;
            colorArray[i * 3 + 1] = 1.0;
            colorArray[i * 3 + 2] = 1.0;
        }
        mainMesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);

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

            // 大きさのランダムバリエーションを強化
            // 小さいBoxを増やし、大きいBoxを減らす調整
            const sizeRand = Math.random();
            let baseSize;
            if (sizeRand < 0.7) {
                // 70%は小さめ (5〜15)
                baseSize = 5 + Math.random() * 10;
            } else if (sizeRand < 0.95) {
                // 25%は中くらい (15〜25)
                baseSize = 15 + Math.random() * 10;
            } else {
                // 5%だけ大きい (25〜35) - 最大サイズをさらに小さく (50->35)
                baseSize = 25 + Math.random() * 10;
            }

            // 縦横比をさらに極端に（細長いものを増やす）
            // 0.2〜3.0倍のバラツキを持たせる
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
        
        // ベース：コンクリートのようなグレー
        cCtx.fillStyle = '#9e9e9e'; 
        cCtx.fillRect(0, 0, size, size);

        // コンクリートの汚れや色ムラを追加
        for (let i = 0; i < 60; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 5 + Math.random() * 30;
            const grad = cCtx.createRadialGradient(x, y, 0, x, y, r);
            
            const grayVal = 80 + Math.random() * 40;
            grad.addColorStop(0, `rgba(${grayVal}, ${grayVal}, ${grayVal}, 0.3)`);
            grad.addColorStop(1, 'rgba(158, 158, 158, 0)');
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
        if (this.useDOF) {
            this.bokehPass = new BokehPass(this.scene, this.camera, {
                focus: 500, 
                aperture: 0.000005, // 0.00002からさらに絞ってピントの合う範囲を広げる
                maxblur: 0.003,     // 0.005から下げてボケをマイルドに
                width: window.innerWidth, 
                height: window.innerHeight
            });
            this.composer.addPass(this.bokehPass);
        }
    }

    handlePhase(phase) {
        super.handlePhase(phase);
    }

    onUpdate(deltaTime) {
        this.time += deltaTime;
        
        if (this.sphereMaterialShader) {
            this.sphereMaterialShader.uniforms.uTime.value = this.time;
        }
        if (this.sphereDepthShader) {
            this.sphereDepthShader.uniforms.uTime.value = this.time;
        }

        // 時間によるモードの自動ランダマイズ
        this.modeTimer += deltaTime;
        if (this.modeTimer >= this.modeInterval) {
            this.modeTimer = 0;
            // 0〜8の範囲でランダムに新しいモードを選択（現在のモード以外）
            let nextMode;
            do {
                nextMode = Math.floor(Math.random() * 9);
            } while (nextMode === this.currentMode);
            
            this.currentMode = nextMode;
            console.log(`Auto Randomizing Mode: ${this.currentMode}`);
            
            // モード切り替え時のフラグ調整
            this.useGravity = (this.currentMode === this.MODE_GRAVITY);
            this.spiralMode = (this.currentMode === this.MODE_SPIRAL);
            this.torusMode = (this.currentMode === this.MODE_TORUS);
        }

        this.updatePhysics(deltaTime);
        this.updateExpandSpheres();
        
        if (this.useDOF && this.bokehPass && this.instancedMeshManager) {
            this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
            const mainMesh = this.instancedMeshManager.getMainMesh();
            const intersects = this.raycaster.intersectObject(mainMesh);
            
            let targetDistance;
            if (intersects.length > 0) {
                targetDistance = intersects[0].distance;
            } else {
                const targetVec = new THREE.Vector3(0, 0, -1);
                targetVec.applyQuaternion(this.camera.quaternion);
                const toOrigin = new THREE.Vector3(0, 0, 0).sub(this.camera.position);
                targetDistance = Math.max(10, toOrigin.dot(targetVec));
            }
            
            const currentFocus = this.bokehPass.uniforms.focus.value;
            const lerpFactor = 0.1; 
            this.bokehPass.uniforms.focus.value = currentFocus + (targetDistance - currentFocus) * lerpFactor;
        }
    }

    updatePhysics(deltaTime) {
        const subSteps = 2;
        const dt = deltaTime / subSteps;
        const halfSize = 4950; // スタジオサイズ10000に合わせて拡張（950 -> 4950）
        const tempVec = new THREE.Vector3();
        const diff = new THREE.Vector3();

        for (let s = 0; s < subSteps; s++) {
            this.grid.clear();
            this.particles.forEach((p, i) => {
                const gx = Math.floor(p.position.x / this.gridSize);
                const gy = Math.floor(p.position.y / this.gridSize);
                const gz = Math.floor(p.position.z / this.gridSize);
                const key = (gx + 100) + (gy + 100) * 200 + (gz + 100) * 40000;
                if (!this.grid.has(key)) this.grid.set(key, []);
                this.grid.get(key).push(i);
            });

            this.particles.forEach((p, idx) => {
                const springK = 0.02;
                const damping = 0.96;

                // モード別の力計算
                if (this.currentMode === this.MODE_SPIRAL) {
                    // 2本の螺旋を作るために、インデックスで分ける
                    const side = (idx % 2 === 0) ? 1 : -1;
                    const rotationSpeed = 1.5;
                    const radius = 250;        
                    const angle = (this.time * rotationSpeed) + (p.position.y * 0.01) + (side === 1 ? 0 : Math.PI);
                    const targetX = Math.cos(angle) * radius;
                    const targetZ = Math.sin(angle) * radius;
                    
                    p.velocity.x *= damping;
                    p.velocity.z *= damping;
                    p.velocity.y *= 0.99; 
                    
                    tempVec.set((targetX - p.position.x) * springK, 0.2, (targetZ - p.position.z) * springK);
                    p.addForce(tempVec);

                } else if (this.currentMode === this.MODE_TORUS) {
                    const mainRadius = 1200;
                    const tubeRadius = 60;
                    const theta = (idx / this.sphereCount) * Math.PI * 2 + (this.time * 0.2);
                    const phi = (idx % 20) / 20 * Math.PI * 2 + (theta * 6.0) + (this.time * 1.5);
                    const tx = (mainRadius + tubeRadius * Math.cos(phi)) * Math.cos(theta);
                    const ty = tubeRadius * Math.sin(phi) + 300;
                    const tz = (mainRadius + tubeRadius * Math.cos(phi)) * Math.sin(theta);
                    
                    p.velocity.multiplyScalar(0.94);
                    tempVec.set((tx - p.position.x) * 0.04, (ty - p.position.y) * 0.04, (tz - p.position.z) * 0.04);
                    p.addForce(tempVec);

                } else if (this.currentMode === this.MODE_WALL) {
                    // 垂直グリッド壁
                    const spacing = 60;
                    const cols = 50;
                    const tx = ((idx % cols) - cols * 0.5) * spacing;
                    const ty = (Math.floor(idx / cols) - 20) * spacing + 500;
                    const tz = -800; // 少し奥に配置
                    
                    p.velocity.multiplyScalar(0.9);
                    tempVec.set((tx - p.position.x) * 0.05, (ty - p.position.y) * 0.05, (tz - p.position.z) * 0.05);
                    p.addForce(tempVec);

                } else if (this.currentMode === this.MODE_WAVE) {
                    // 巨大な波（サーフェス）
                    const spacing = 80;
                    const side = Math.sqrt(this.sphereCount);
                    const cols = Math.floor(side);
                    const tx = ((idx % cols) - cols * 0.5) * spacing;
                    const tz = (Math.floor(idx / cols) - cols * 0.5) * spacing;
                    const ty = Math.sin(tx * 0.002 + this.time) * Math.cos(tz * 0.002 + this.time) * 400 + 200;
                    
                    p.velocity.multiplyScalar(0.9);
                    tempVec.set((tx - p.position.x) * 0.05, (ty - p.position.y) * 0.05, (tz - p.position.z) * 0.05);
                    p.addForce(tempVec);

                } else if (this.currentMode === this.MODE_VORTEX) {
                    // 銀河状の渦
                    const radius = (idx / this.sphereCount) * 1500 + 100;
                    const angle = (idx * 0.1) + (this.time * 2.0);
                    const tx = Math.cos(angle) * radius;
                    const tz = Math.sin(angle) * radius;
                    const ty = (Math.sin(idx * 0.5) * 100) + 200;
                    
                    p.velocity.multiplyScalar(0.92);
                    tempVec.set((tx - p.position.x) * 0.04, (ty - p.position.y) * 0.04, (tz - p.position.z) * 0.04);
                    p.addForce(tempVec);

                } else if (this.currentMode === this.MODE_PILLARS) {
                    // 5本の垂直柱
                    const pillarIdx = idx % 5;
                    const angle = (pillarIdx / 5) * Math.PI * 2;
                    const px = Math.cos(angle) * 800;
                    const pz = Math.sin(angle) * 800;
                    const tx = px + (Math.sin(idx + this.time) * 50);
                    const tz = pz + (Math.cos(idx + this.time) * 50);
                    const ty = ((idx / 5) / (this.sphereCount / 5)) * 2000 - 500;
                    
                    p.velocity.multiplyScalar(0.9);
                    tempVec.set((tx - p.position.x) * 0.05, (ty - p.position.y) * 0.05, (tz - p.position.z) * 0.05);
                    p.addForce(tempVec);

                } else if (this.currentMode === this.MODE_CHAOS) {
                    // 混沌・脈動
                    const dist = p.position.length();
                    const force = Math.sin(this.time * 2.0) * 2.0;
                    tempVec.copy(p.position).normalize().multiplyScalar(force);
                    p.addForce(tempVec);
                    p.velocity.multiplyScalar(0.99);

                } else if (this.currentMode === this.MODE_GRAVITY) {
                    // 重力落下は既存のロジックを使用（下でaddForceされる）
                    p.velocity.multiplyScalar(0.98);
                } else {
                    // DEFAULT: 中心の引力
                    tempVec.copy(p.position).multiplyScalar(-0.001);
                    p.addForce(tempVec);
                    p.velocity.multiplyScalar(0.98);
                }

                // 重力の適用（MODE_GRAVITYの時のみ）
                if (this.currentMode === this.MODE_GRAVITY) {
                    p.addForce(this.gravityForce);
                }

                p.update();
                
                if (this.useWallCollision) {
                    if (p.position.x > halfSize) { p.position.x = halfSize; p.velocity.x *= -0.5; }
                    if (p.position.x < -halfSize) { p.position.x = -halfSize; p.velocity.x *= -0.5; }
                    if (p.position.y > 1500) { 
                        if (this.currentMode === this.MODE_SPIRAL) {
                            p.position.y = -450;
                            p.velocity.y *= 0.1;
                        } else {
                            p.position.y = 1500; 
                            p.velocity.y *= -0.5; 
                        }
                    }
                    
                    if (p.position.y < -450) { 
                        p.position.y = -450; 
                        p.velocity.y *= -0.2; 
                        const rollFactor = 0.1 / (p.radius / 30); 
                        p.angularVelocity.z = -p.velocity.x * rollFactor;
                        p.angularVelocity.x = p.velocity.z * rollFactor;
                        p.velocity.x *= 0.97;
                        p.velocity.z *= 0.97;
                    }
                    if (p.position.z > halfSize) { p.position.z = halfSize; p.velocity.z *= -0.5; }
                    if (p.position.z < -halfSize) { p.position.z = -halfSize; p.velocity.z *= -0.5; }
                }
                p.updateRotation(dt);
            });

            this.particles.forEach((a, i) => {
                const gx = Math.floor(a.position.x / this.gridSize);
                const gy = Math.floor(a.position.y / this.gridSize);
                const gz = Math.floor(a.position.z / this.gridSize);
                for (let ox = -1; ox <= 1; ox++) {
                    for (let oy = -1; oy <= 1; oy++) {
                        for (let oz = -1; oz <= 1; oz++) {
                            const key = (gx + ox + 100) + (gy + oy + 100) * 200 + (gz + oz + 100) * 40000;
                            const neighbors = this.grid.get(key);
                            if (!neighbors) continue;
                            neighbors.forEach(j => {
                                if (i >= j) return;
                                const b = this.particles[j];
                                diff.subVectors(a.position, b.position);
                                const distSq = diff.lengthSq();
                                const minDist = a.radius + b.radius;
                                if (distSq < minDist * minDist) {
                                    const dist = Math.sqrt(distSq);
                                    // 螺旋モードの時は衝突の反発をさらに弱めて、形を維持しやすくする
                                    const overlapFactor = this.spiralMode ? 0.1 : 0.4; // 0.2/0.6 -> 0.1/0.4 に弱める
                                    const overlap = (minDist - dist) * overlapFactor; 
                                    const normal = diff.divideScalar(dist || 1);
                                    tempVec.copy(normal).multiplyScalar(overlap);
                                    a.position.add(tempVec);
                                    b.position.sub(tempVec);
                                    
                                    const relVel = tempVec.subVectors(a.velocity, b.velocity);
                                    const dot = relVel.dot(normal);
                                    if (dot < 0) {
                                        // 全体的に反発をマイルドに
                                        const bounceFactor = this.spiralMode ? 0.05 : 0.3; // 0.1/0.7 -> 0.05/0.3 に弱める
                                        const impulse = normal.multiplyScalar(-(1 + bounceFactor) * dot * 0.5); 
                                        a.velocity.add(impulse);
                                        b.velocity.sub(impulse);
                                        
                                        // 衝突時に少し回転を加える（転がるきっかけ）
                                        const torque = (Math.random() - 0.5) * 0.01;
                                        a.angularVelocity.x += torque;
                                        b.angularVelocity.z += torque;
                                    }
                                }
                            });
                        }
                    }
                }
            });
        }

        if (this.instancedMeshManager) {
            this.particles.forEach((p, i) => {
                this.instancedMeshManager.setMatrixAt(i, p.position, p.rotation, p.scale);
            });
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
        const explosionRadius = 800;
        const vFactor = velocity / 127.0;
        const explosionForce = 40.0 * vFactor; 

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

    reset() { super.reset(); }

    dispose() {
        console.log('Scene13.dispose: クリーンアップ開始');
        if (this.studio) this.studio.dispose();
        this.expandSpheres.forEach(e => {
            if (e.light) this.scene.remove(e.light);
            if (e.mesh) { this.scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); }
        });
        if (this.instancedMeshManager) this.instancedMeshManager.dispose();
        if (this.bokehPass) this.bokehPass.enabled = false;
        if (this.ssaoPass) this.ssaoPass.enabled = false;
        super.dispose();
    }
}
