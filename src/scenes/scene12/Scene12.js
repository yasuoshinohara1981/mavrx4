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
        this.sphereCount = 100; // 少数精鋭
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
        // 全体を柔らかく
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
        this.scene.add(hemiLight);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
        this.scene.add(ambientLight);

        // メインの平行光源（シャドウ用）
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
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
        const pointLight = new THREE.PointLight(0xffffff, 2.0, 2500);
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
            roughness: 0.8,
            metalness: 0.1
        });
        this.studioBox = new THREE.Mesh(geometry, material);
        this.studioBox.position.set(0, 500, 0);
        this.studioBox.receiveShadow = true;
        this.scene.add(this.studioBox);

        // 床を別途作成（シャドウをより確実に受けるため）
        const floorGeo = new THREE.PlaneGeometry(size, size);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.8,
            metalness: 0.1
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
        const noiseTexture = this.generateNoiseTexture();
        const sphereMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.4,
            roughness: 0.4,
            bumpMap: noiseTexture,
            bumpScale: 0.3,
            emissive: 0x444444,
            emissiveIntensity: 0.1
        });

        this.instancedMeshManager = new InstancedMeshManager(this.scene, sphereGeo, sphereMat, this.sphereCount);
        const mainMesh = this.instancedMeshManager.getMainMesh();
        mainMesh.castShadow = true;
        mainMesh.receiveShadow = true;
        mainMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            alphaTest: 0.5
        });
        mainMesh.customDepthMaterial.onBeforeCompile = (shader) => {
            // インスタンス行列を考慮した深度計算が必要な場合があるが、
            // InstancedMeshは標準で対応しているはず。
        };

        // 赤い足（Cylinder）
        const footGeo = new THREE.CylinderGeometry(0.1, 0.02, 1, 8);
        footGeo.translate(0, 0.5, 0);
        const footMat = new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.4, roughness: 0.4 });
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

            const radius = 15 + Math.random() * 25;
            const p = new Scene12Particle(x, y, z, radius);
            p.angularVelocity.multiplyScalar(2.0);
            this.particles.push(p);

            this.instancedMeshManager.setMatrixAt(i, p.position, p.rotation, radius);
        }
        
        this.instancedMeshManager.markNeedsUpdate();
        this.setParticleCount(this.sphereCount);
    }

    generateNoiseTexture() {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(size, size);
        for (let i = 0; i < imageData.data.length; i += 4) {
            const val = Math.floor(Math.random() * 255);
            imageData.data[i] = imageData.data[i+1] = imageData.data[i+2] = val;
            imageData.data[i+3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
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
                tempVec.copy(p.position).multiplyScalar(-0.01);
                p.addForce(tempVec);
                p.update();
                if (this.useWallCollision) {
                    if (p.position.x > halfSize) { p.position.x = halfSize; p.velocity.x *= -0.5; }
                    if (p.position.x < -halfSize) { p.position.x = -halfSize; p.velocity.x *= -0.5; }
                    if (p.position.y > 1500) { p.position.y = 1500; p.velocity.y *= -0.5; }
                    if (p.position.y < -450) { p.position.y = -450; p.velocity.y *= -0.5; }
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
                                    const overlap = (minDist - dist) * 0.5;
                                    const normal = diff.divideScalar(dist || 1);
                                    tempVec.copy(normal).multiplyScalar(overlap);
                                    a.position.add(tempVec);
                                    b.position.sub(tempVec);
                                    const relVel = tempVec.subVectors(a.velocity, b.velocity);
                                    const dot = relVel.dot(normal);
                                    if (dot < 0) {
                                        const impulse = normal.multiplyScalar(-(1 + 0.5) * dot * 0.5);
                                        a.velocity.add(impulse);
                                        b.velocity.sub(impulse);
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
        if (trackNumber === 6) this.triggerExpandEffect();
    }

    triggerExpandEffect() {
        const center = new THREE.Vector3((Math.random()-0.5)*this.spawnRadius*0.4, (Math.random()-0.5)*this.spawnRadius*0.4, (Math.random()-0.5)*this.spawnRadius*0.4);
        const explosionRadius = 1000;
        const explosionForce = 150.0;
        this.particles.forEach(p => {
            const diff = p.position.clone().sub(center);
            const dist = diff.length();
            if (dist < explosionRadius) {
                const strength = Math.pow(1.0 - dist/explosionRadius, 1.5) * explosionForce;
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
