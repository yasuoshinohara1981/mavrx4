/**
 * Scene12: 新規シーン（テンプレートベース）
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import { Scene12Particle } from './Scene12Particle.js';

export class Scene12 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'Scene 12';  // シーンのタイトルを設定
        
        // 共有リソースマネージャー
        this.sharedResourceManager = sharedResourceManager;
        this.useSharedResources = !!sharedResourceManager;
        
        // Sphereの設定
        this.sphereCount = 300; // 100から300に戻す
        this.spawnRadius = 500; // 中心に寄せる
        
        // インスタンス管理
        this.instancedMeshManager = null;
        this.lineManager = null; // タコの足（赤い毛）
        this.particles = [];

        // 空間分割用
        this.gridSize = 150; // マス目を少し大きくして効率化
        this.grid = new Map();

        // 撮影用スタジオ（白い箱）
        this.studioBox = null;
        this.studioFloor = null;
        
        // エフェクト設定
        this.useDOF = true;
        this.useSSAO = false; // 重いのでオフ
        this.useWallCollision = true; // 壁判定オン
        this.useTacoFeet = true;      // 赤い足オン
        this.bokehPass = null;
        this.ssaoPass = null;

        // トラック6用エフェクト管理
        this.expandSpheres = []; 
        
        // 重力設定
        this.useGravity = false;
        this.gravityForce = new THREE.Vector3(0, -0.8, 0);
        this.gravityTimer = 0;
        this.gravityInterval = 10.0; // 10秒周期
        
        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
    }
    
    /**
     * セットアップ処理
     */
    async setup() {
        await super.setup();
        
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
            size: { x: 1000, y: 1000, z: 1000 },
            floorY: -500,
            floorSize: 2000,
            floorDivisions: 40,
            labelMax: 64
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
        // 全体を明るく（強度を0.4から0.8にアップ）
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x888888, 0.8);
        this.scene.add(hemiLight);

        // 環境光も少し底上げ（0.1から0.3にアップ）
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambientLight);

        // メインの平行光源（シャドウ用：強度を1.2から1.5にアップ）
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

        // デバッグ用（必要に応じてコメント解除）
        // const helper = new THREE.DirectionalLightHelper(directionalLight, 100);
        // this.scene.add(helper);
        // const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
        // this.scene.add(shadowHelper);

        // 「光の漏れ」を演出するための中心光源（シャドウあり）
        const pointLight = new THREE.PointLight(0xffffff, 2.5, 2500); // 強度を2.0から2.5にアップ
        pointLight.position.set(0, 200, 0); // Sphereの密集地帯の中に配置
        pointLight.castShadow = true; // これが「漏れる光」を作る
        pointLight.shadow.mapSize.width = 1024;
        pointLight.shadow.mapSize.height = 1024;
        pointLight.shadow.camera.near = 10;
        pointLight.shadow.camera.far = 3000;
        pointLight.shadow.bias = -0.001;
        this.scene.add(pointLight);
    }

    /**
     * 撮影用スタジオ（白い箱）
     */
    createStudioBox() {
        const size = 2000;
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            side: THREE.BackSide,
            roughness: 0.5, // 0.8から下げて少し光沢を出し、白を強調
            metalness: 0.0  // 0.1から0にして、よりマットな白に
        });
        this.studioBox = new THREE.Mesh(geometry, material);
        this.studioBox.position.set(0, 500, 0);
        this.studioBox.receiveShadow = true;
        this.scene.add(this.studioBox);

        // 床を別途作成（シャドウをより確実に受けるため）
        const floorGeo = new THREE.PlaneGeometry(size, size);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.5, // 0.8から下げて白を明るく
            metalness: 0.0
        });
        this.studioFloor = new THREE.Mesh(floorGeo, floorMat);
        this.studioFloor.rotation.x = -Math.PI / 2;
        this.studioFloor.position.y = -499; // 箱の底よりわずかに上に配置
        this.studioFloor.receiveShadow = true;
        this.scene.add(this.studioFloor);
    }

    /**
     * Sphereと赤い足の作成
     */
    createSpheres() {
        const sphereGeo = new THREE.SphereGeometry(1, 32, 32);
        const textures = this.generateFleshTextures();
        const sphereMat = new THREE.MeshStandardMaterial({
            map: textures.map,
            bumpMap: textures.bumpMap,
            bumpScale: 3.0, 
            metalness: 0.4,  // エイリアンっぽく少し金属的な光沢を
            roughness: 0.2,  // ヌルヌル感は維持
            emissive: 0x000000, // 発光はオフにして不気味に
            emissiveIntensity: 0.0
        });

        this.instancedMeshManager = new InstancedMeshManager(this.scene, sphereGeo, sphereMat, this.sphereCount);
        const mainMesh = this.instancedMeshManager.getMainMesh();
        mainMesh.castShadow = true;
        mainMesh.receiveShadow = true;
        mainMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            alphaTest: 0.5
        });

        // 赤い足（Cylinder）
        // 向きを逆にするため、ジオメトリのオフセットを調整
        // さきっちょ（尖っている方）が外側を向くように調整
        const footGeo = new THREE.CylinderGeometry(0.02, 0.1, 1, 8); // 上底を細く(0.02)、下底を太く(0.1)
        footGeo.translate(0, 0.5, 0); // 下底（太い方）が原点(Sphere側)に来るように配置
        const footMat = new THREE.MeshStandardMaterial({ 
            color: 0xff0000, // 赤に戻す
            metalness: 0.4,  
            roughness: 0.4   
        });
        this.lineManager = new THREE.InstancedMesh(footGeo, footMat, this.sphereCount);
        this.lineManager.castShadow = true;
        this.lineManager.receiveShadow = true;
        this.scene.add(this.lineManager);

        for (let i = 0; i < this.sphereCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = Math.pow(Math.random(), 1.5) * this.spawnRadius;
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            // 大きさのランダム幅を拡大 (15〜25 だったのを 10〜60 に拡大)
            const radius = 10 + Math.pow(Math.random(), 2.0) * 50; 
            const p = new Scene12Particle(x, y, z, radius);
            p.angularVelocity.multiplyScalar(2.0);
            this.particles.push(p);

            this.instancedMeshManager.setMatrixAt(i, p.position, p.rotation, radius);
        }
        
        this.instancedMeshManager.markNeedsUpdate();
        this.setParticleCount(this.sphereCount);
    }

    /**
     * エイリアンっぽい質感のテクスチャ（カラーとバンプ）を生成
     */
    generateFleshTextures() {
        const size = 512;
        
        // 1. カラーマップ用のキャンバス
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size;
        colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');
        
        // ベースのライトグレー（さらに明るく調整）
        cCtx.fillStyle = '#888888'; 
        cCtx.fillRect(0, 0, size, size);

        // エイリアンっぽい「斑点」や「色ムラ」をグレースケールで追加
        for (let i = 0; i < 100; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 20 + Math.random() * 60;
            const grad = cCtx.createRadialGradient(x, y, 0, x, y, r);
            // グレーの濃淡（さらに明るめに）
            const grayVal = 120 + Math.random() * 80;
            grad.addColorStop(0, `rgba(${grayVal}, ${grayVal}, ${grayVal}, 0.5)`);
            grad.addColorStop(1, `rgba(136, 136, 136, 0)`);
            cCtx.fillStyle = grad;
            cCtx.beginPath();
            cCtx.arc(x, y, r, 0, Math.PI * 2);
            cCtx.fill();
        }

        // 「血管」のようなうねった曲線をグレースケールで追加
        cCtx.strokeStyle = 'rgba(200, 200, 200, 0.5)'; // かなり明るいグレーの血管
        for (let i = 0; i < 30; i++) {
            cCtx.lineWidth = 0.8 + Math.random() * 2.0; // 少し太くして視認性アップ
            let x = Math.random() * size;
            let y = Math.random() * size;
            
            cCtx.beginPath();
            cCtx.moveTo(x, y);
            
            // ランダムウォーク + 慣性でうねうねさせる
            let angle = Math.random() * Math.PI * 2;
            for (let j = 0; j < 40; j++) {
                angle += (Math.random() - 0.5) * 1.2;
                x += Math.cos(angle) * 8;
                y += Math.sin(angle) * 8;
                cCtx.lineTo(x, y);
            }
            cCtx.stroke();
        }

        // 2. バンプマップ用のキャンバス
        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size;
        bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');
        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);

        // 細かい凹凸
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

        // 大きなボコボコ
        for (let i = 0; i < 50; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 10 + Math.random() * 30;
            const grad = bCtx.createRadialGradient(x, y, 0, x, y, r);
            const val = Math.random() > 0.5 ? 255 : 0;
            grad.addColorStop(0, `rgba(${val}, ${val}, ${val}, 0.4)`);
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
                focus: 500, aperture: 0.00001, maxblur: 0.005,
                width: window.innerWidth, height: window.innerHeight
            });
            this.composer.addPass(this.bokehPass);
        }
    }

    onUpdate(deltaTime) {
        this.time += deltaTime;
        
        // 重力の自動切り替え（10秒周期）
        this.gravityTimer += deltaTime;
        if (this.gravityTimer >= this.gravityInterval) {
            this.useGravity = !this.useGravity;
            this.gravityTimer = 0;
            console.log(`Auto Gravity: ${this.useGravity ? 'ON' : 'OFF'}`);
        }

        this.updatePhysics(deltaTime);
        this.updateExpandSpheres();
        if (this.useDOF && this.bokehPass) {
            this.bokehPass.uniforms.focus.value = this.camera.position.length();
        }
    }

    updatePhysics(deltaTime) {
        const subSteps = 2;
        const dt = deltaTime / subSteps;
        const halfSize = 950;
        const tempVec = new THREE.Vector3();
        const diff = new THREE.Vector3();

        for (let s = 0; s < subSteps; s++) {
            this.grid.clear();
            this.particles.forEach((p, i) => {
                const gx = Math.floor(p.position.x / this.gridSize);
                const gy = Math.floor(p.position.y / this.gridSize);
                const gz = Math.floor(p.position.z / this.gridSize);
                const key = `${gx},${gy},${gz}`;
                if (!this.grid.has(key)) this.grid.set(key, []);
                this.grid.get(key).push(i);
            });

            this.particles.forEach(p => {
                // 中心の引力を計算
                tempVec.copy(p.position).multiplyScalar(-0.002);
                
                // 重力オンの時は、床付近での中心引力をさらに弱める（一箇所に固まるのを防ぐ）
                if (this.useGravity && p.position.y < -400) {
                    tempVec.multiplyScalar(0.1);
                }
                p.addForce(tempVec);

                // 重力の適用
                if (this.useGravity) {
                    p.addForce(this.gravityForce);
                }

                p.update();
                if (this.useWallCollision) {
                    if (p.position.x > halfSize) { p.position.x = halfSize; p.velocity.x *= -0.5; }
                    if (p.position.x < -halfSize) { p.position.x = -halfSize; p.velocity.x *= -0.5; }
                    if (p.position.y > 1500) { p.position.y = 1500; p.velocity.y *= -0.5; }
                    
                    // 床の衝突判定
                    if (p.position.y < -450) { 
                        p.position.y = -450; 
                        p.velocity.y *= -0.2; // 跳ね返りを弱くして接地感を出す
                        
                        // 【コロコロ転がるロジック】
                        // 横方向の速度を回転速度に変換（物理的な転がりをシミュレート）
                        // X方向の移動 -> Z軸周りの回転、Z方向の移動 -> X軸周りの回転
                        const rollFactor = 0.1 / (p.radius / 30); 
                        p.angularVelocity.z = -p.velocity.x * rollFactor;
                        p.angularVelocity.x = p.velocity.z * rollFactor;

                        // 床との摩擦（少しずつ止まるように）
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
                            const neighbors = this.grid.get(`${gx+ox},${gy+oy},${gz+oz}`);
                            if (!neighbors) continue;
                            neighbors.forEach(j => {
                                if (i >= j) return;
                                const b = this.particles[j];
                                diff.subVectors(a.position, b.position);
                                const distSq = diff.lengthSq();
                                const minDist = a.radius + b.radius;
                                if (distSq < minDist * minDist) {
                                    const dist = Math.sqrt(distSq);
                                    const overlap = (minDist - dist) * 0.6; // 重なり解消を少し強める(0.5 -> 0.6)
                                    const normal = diff.divideScalar(dist || 1);
                                    tempVec.copy(normal).multiplyScalar(overlap);
                                    a.position.add(tempVec);
                                    b.position.sub(tempVec);
                                    
                                    const relVel = tempVec.subVectors(a.velocity, b.velocity);
                                    const dot = relVel.dot(normal);
                                    if (dot < 0) {
                                        const impulse = normal.multiplyScalar(-(1 + 0.7) * dot * 0.5); // 反発係数を上げる(0.5 -> 0.7)
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
            const lineMatrix = new THREE.Matrix4();
            const lineQuat = new THREE.Quaternion();
            this.particles.forEach((p, i) => {
                this.instancedMeshManager.setMatrixAt(i, p.position, p.rotation, p.radius);
                if (this.lineManager && this.useTacoFeet) {
                    lineQuat.setFromEuler(p.rotation);
                    lineMatrix.compose(p.position, lineQuat, tempVec.set(p.radius*0.5, p.radius*4.0, p.radius*0.5));
                    this.lineManager.setMatrixAt(i, lineMatrix);
                }
            });
            this.instancedMeshManager.markNeedsUpdate();
            if (this.lineManager) this.lineManager.instanceMatrix.needsUpdate = true;
        }
    }

    handleTrackNumber(trackNumber, message) {
        if (trackNumber === 6) {
            const args = message.args || [];
            const velocity = args[1] !== undefined ? args[1] : 127; // ベロシティを取得（デフォルト127）
            this.triggerExpandEffect(velocity);
        }
    }

    triggerExpandEffect(velocity = 127) {
        const center = new THREE.Vector3((Math.random()-0.5)*this.spawnRadius*0.4, (Math.random()-0.5)*this.spawnRadius*0.4, (Math.random()-0.5)*this.spawnRadius*0.4);
        const explosionRadius = 800;
        
        // ベロシティ（0-127）を力（0.0 - 1.0）に正規化して、最大威力（40.0）にかける
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
        console.log('Scene12.dispose: クリーンアップ開始');
        if (this.studioBox) {
            this.scene.remove(this.studioBox);
            this.studioBox.geometry.dispose();
            this.studioBox.material.dispose();
        }
        if (this.studioFloor) {
            this.scene.remove(this.studioFloor);
            this.studioFloor.geometry.dispose();
            this.studioFloor.material.dispose();
        }
        this.expandSpheres.forEach(e => {
            if (e.light) this.scene.remove(e.light);
            if (e.mesh) { this.scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); }
        });
        if (this.instancedMeshManager) this.instancedMeshManager.dispose();
        if (this.lineManager) {
            this.scene.remove(this.lineManager);
            this.lineManager.geometry.dispose();
            this.lineManager.material.dispose();
        }
        if (this.bokehPass) this.bokehPass.enabled = false;
        if (this.ssaoPass) this.ssaoPass.enabled = false;
        super.dispose();
    }
}
