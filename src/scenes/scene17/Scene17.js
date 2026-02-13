/**
 * Scene17: 水銀クローム・スフィア（相互反射モデル）
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import { StudioBox } from '../../lib/StudioBox.js';
import { Scene17Particle } from './Scene17Particle.js';

export class Scene17 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'Mercury Mirror';
        this.initialized = false;
        this.sceneNumber = 17;
        this.kitNo = 13;
        
        this.sharedResourceManager = sharedResourceManager;
        this.raycaster = new THREE.Raycaster();
        
        // 2500個に増量や！
        this.partTypes = 1; 
        this.instancesPerType = 2500; 
        this.sphereCount = this.instancesPerType;
        this.spawnRadius = 1000; 
        
        this.instancedMeshManagers = []; 
        this.particles = [];
        
        // 動的環境マップ用
        this.cubeCamera = null;
        this.cubeRenderTarget = null;

        // エフェクト設定
        this.useDOF = true;
        this.useBloom = true; 
        this.bokehPass = null;
        this.bloomPass = null;

        this.trackEffects = {
            1: false, 2: false, 3: false, 4: false, 5: true, 6: true, 7: false, 8: false, 9: false
        };

        // 物理演算パラメータ
        this.useGravity = false; // true -> false 重力を切るで！
        this.gravityForce = new THREE.Vector3(0, 0, 0); // 0, -30.0, 0 -> 0, 0, 0
        this.centeringForce = 0.0002; // 0.001 -> 0.0002 さらに弱めて自然な広がりを！
        
        // モード管理
        this.MODE_GRAVITY = 0;
        this.MODE_GEOM_SPHERE = 1;
        this.MODE_GEOM_CYLINDER_V = 2;
        this.MODE_GEOM_WAVE_GRID = 3;
        this.MODE_GEOM_SPIRAL = 4;
        this.MODE_GEOM_TORUS = 5;
        this.MODE_GEOM_PYRAMID = 6;
        this.MODE_GEOM_RING_STACK = 7;
        this.MODE_GEOM_DNA = 8;
        this.MODE_GEOM_CUBE = 9;
        this.MODE_GEOM_STAR = 10;

        this.currentMode = this.MODE_GRAVITY;
        this.modeTimer = 0;
        this.modeInterval = 12.0; // 12秒ごとに切り替え
        this.modeSequence = [
            this.MODE_GRAVITY,
            this.MODE_GEOM_SPHERE,
            this.MODE_GEOM_WAVE_GRID,
            this.MODE_GEOM_SPIRAL,
            this.MODE_GEOM_CUBE,
            this.MODE_GEOM_RING_STACK,
            this.MODE_GEOM_DNA,
            this.MODE_GEOM_PYRAMID,
            this.MODE_GEOM_STAR,
            this.MODE_GEOM_TORUS
        ];
        this.sequenceIndex = 0;
        this.geometricTargets = new Map();
        
        this.setScreenshotText(this.title);
    }

    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 400;
        cameraParticle.maxDistance = 4000;
        cameraParticle.minY = -450;
    }

    async setup() {
        if (this.initialized) return;
        await super.setup();

        // トーンマッピングをACESFilmicに戻して白飛びを抑えるで！
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.3; // 1.0 -> 1.3 露出を上げて全体をパッと明るく！

        this.setupLights();
        this.createStudioBox();

        // 1. CubeCameraのセットアップ（高度とnearを再調整して巨大化を完全封印！）
        this.cubeRenderTarget = new THREE.WebGLCubeRenderTarget(512, { 
            generateMipmaps: true, 
            minFilter: THREE.LinearMipmapLinearFilter 
        });
        this.cubeCamera = new THREE.CubeCamera(10, 10000, this.cubeRenderTarget); // nearを10に戻して近くも映す
        this.cubeCamera.position.set(0, 500, 0); // 高さを500に戻す
        this.scene.add(this.cubeCamera);

        // シーン全体の環境マップとして設定
        this.scene.environment = this.cubeRenderTarget.texture;

        this.camera.position.set(0, 500, 2000);
        this.camera.lookAt(0, 200, 0);

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.createSpheres();
        this.initPostProcessing();
        this.initialized = true;
    }

    setupLights() {
        // 部屋の明るさを落ち着かせるで
        const pureWhite = 0xffffff; 
        const hemiLight = new THREE.HemisphereLight(pureWhite, 0xffffff, 0.8); // 0.6 -> 0.8 影をさらに明るく！
        this.scene.add(hemiLight);

        const ambientLight = new THREE.AmbientLight(pureWhite, 0.8); // 0.6 -> 0.8 全体的な底上げ！
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(pureWhite, 4.0); // 2.5 -> 4.0 メインライトをガツンと強化！
        directionalLight.position.set(2000, 4000, 2000);
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.left = -8000;
        directionalLight.shadow.camera.right = 8000;
        directionalLight.shadow.camera.top = 8000;
        directionalLight.shadow.camera.bottom = -8000;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.bias = -0.0001;
        this.scene.add(directionalLight);

        const pointLight = new THREE.PointLight(pureWhite, 3.0, 15000); // 1.5 -> 3.0 ポイントライトも倍増！
        pointLight.decay = 1.0; 
        pointLight.position.set(0, 3000, 0); 
        this.scene.add(pointLight);
    }

    createStudioBox() {
        this.studio = new StudioBox(this.scene, {
            size: 10000,
            color: 0xaaaaaa, // 0x707070 -> 0xaaaaaa かなり明るいグレーにして部屋全体を明るく！
            roughness: 0.1,  
            metalness: 0.8,  
            lightColor: 0xffffff,
            lightIntensity: 2.0 // 1.0 -> 2.0 天井ライトも倍増！
        });
        // 床を強制的に両面描画にして、光を確実に受け止めるで！
        if (this.studio.studioFloor) {
            this.studio.studioFloor.material.side = THREE.DoubleSide;
        }
    }

    createSpheres() {
        // 完璧な鏡面マテリアル（白飛びを抑えつつ、反射をしっかり出す！）
        const mercuryMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, // 0xcccccc -> 0xffffff ベースカラーを真っ白に！
            metalness: 0.9,  
            roughness: 0.05, 
            envMap: this.cubeRenderTarget.texture,
            envMapIntensity: 1.2 // 1.0 -> 1.2 反射強度もさらにアップ！
        });

        const sphereGeom = new THREE.SphereGeometry(0.6, 16, 16); // 2500個なので16x16で負荷軽減
        
        const manager = new InstancedMeshManager(this.scene, sphereGeom, mercuryMat, this.instancesPerType);
        const mainMesh = manager.getMainMesh();
        mainMesh.castShadow = true;
        mainMesh.receiveShadow = true;
        this.instancedMeshManagers.push(manager);

        for (let i = 0; i < this.sphereCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = Math.pow(Math.random(), 1.5) * this.spawnRadius;
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta) + 500;
            const z = r * Math.cos(phi);

            const sizeRand = Math.random();
            let baseSize = sizeRand < 0.7 ? 10 + Math.random() * 10 : 20 + Math.random() * 20; // 最大値を下げたで！
            
            const p = new Scene17Particle(x, y, z, baseSize * 0.5, new THREE.Vector3(baseSize, baseSize, baseSize), 0, i);
            this.particles.push(p);
            manager.setMatrixAt(i, p.position, p.rotation, p.scale);
        }
        
        manager.markNeedsUpdate();
        this.setParticleCount(this.sphereCount);
    }

    initPostProcessing() {
        if (!this.composer) {
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
        }
        if (this.useBloom) {
            this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 4, window.innerHeight / 4), 0.15, 0.1, 1.2); // 0.2 -> 0.15
            this.composer.addPass(this.bloomPass);
        }
        if (this.useDOF) {
            this.bokehPass = new BokehPass(this.scene, this.camera, {
                focus: 1000, aperture: 0.000005, maxblur: 0.003,
                width: window.innerWidth, height: window.innerHeight
            });
            this.composer.addPass(this.bokehPass);
        }
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;

        // モード切り替えタイマー
        this.modeTimer += deltaTime;
        if (this.modeTimer >= this.modeInterval) {
            this.modeTimer = 0;
            this.sequenceIndex = (this.sequenceIndex + 1) % this.modeSequence.length;
            this.currentMode = this.modeSequence[this.sequenceIndex];
            console.log(`Scene17 Mode Switched: ${this.currentMode}`);
        }

        // 物理演算
        this.updatePhysics(deltaTime);

        // 相互反射のために環境マップを更新
        if (this.cubeCamera) {
            this.cubeCamera.update(this.renderer, this.scene);
        }

        if (this.instancedMeshManagers.length > 0) {
            const manager = this.instancedMeshManagers[0];
            this.particles.forEach((p, i) => {
                manager.setMatrixAt(i, p.position, p.rotation, p.scale);
            });
            manager.markNeedsUpdate();
        }
        
        // オートフォーカス
        if (this.useDOF && this.bokehPass) {
            this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
            const meshes = this.instancedMeshManagers.map(m => m.getMainMesh());
            const intersects = this.raycaster.intersectObjects(meshes);
            let targetDistance = 1500;
            if (intersects.length > 0) targetDistance = intersects[0].distance;
            const currentFocus = this.bokehPass.uniforms.focus.value;
            this.bokehPass.uniforms.focus.value = currentFocus + (targetDistance - currentFocus) * 0.1;
        }
    }

    updatePhysics(deltaTime) {
        if (this.currentMode !== this.MODE_GRAVITY && !this.geometricTargets.has(this.currentMode)) {
            this.generateGeometricTargets(this.currentMode);
        }
        const targets = this.geometricTargets.get(this.currentMode);

        this.particles.forEach((p, i) => {
            p.force.set(0, 0, 0);
            
            if (this.currentMode === this.MODE_GRAVITY) {
                if (this.useGravity) p.addForce(this.gravityForce);
                
                // 【中心に寄せる力】
                const centering = new THREE.Vector3(-p.position.x, 0, -p.position.z);
                p.addForce(centering.multiplyScalar(this.centeringForce));

                // 【中心からの反発力】
                // 反射カメラの真下付近に近づきすぎないようにガッツリ押し戻すで！
                const distToCenter = p.position.length();
                if (distToCenter < 1000) { // 500 -> 1000 範囲拡大
                    const pushOut = p.position.clone().normalize().multiplyScalar((1000 - distToCenter) * 0.08);
                    p.addForce(pushOut);
                }
            } else if (targets) {
                const targetPos = targets[i % targets.length];
                const springK = 0.15;
                const force = new THREE.Vector3(
                    (targetPos.x - p.position.x) * springK,
                    (targetPos.y - p.position.y) * springK,
                    (targetPos.z - p.position.z) * springK
                );
                p.addForce(force);
                
                // 浮遊感のための微細なうねり
                p.addForce(new THREE.Vector3(
                    Math.sin(this.time * 0.5 + i) * 2.0,
                    Math.cos(this.time * 0.4 + i) * 2.0,
                    Math.sin(this.time * 0.6 + i) * 2.0
                ));
            }

            p.update();
            p.velocity.multiplyScalar(0.85);

            if (p.position.y < -450) {
                p.position.y = -450;
                p.velocity.y *= -0.1;
            }
            const limit = 4500;
            if (Math.abs(p.position.x) > limit) { p.position.x = Math.sign(p.position.x) * limit; p.velocity.x *= -0.5; }
            if (Math.abs(p.position.z) > limit) { p.position.z = Math.sign(p.position.z) * limit; p.velocity.z *= -0.5; }
        });
    }

    generateGeometricTargets(mode) {
        const targets = [];
        const count = this.sphereCount;
        
        switch(mode) {
            case this.MODE_GEOM_SPHERE:
                for (let i = 0; i < count; i++) {
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(2 * Math.random() - 1);
                    const r = 800;
                    targets.push(new THREE.Vector3(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta) + 400, r * Math.cos(phi)));
                }
                break;
            case this.MODE_GEOM_WAVE_GRID:
                const size = Math.sqrt(count);
                for (let i = 0; i < count; i++) {
                    const ix = i % Math.floor(size);
                    const iz = Math.floor(i / size);
                    const x = (ix / size - 0.5) * 2500;
                    const z = (iz / size - 0.5) * 2500;
                    const y = Math.sin(x * 0.005) * Math.cos(z * 0.005) * 400 + 400;
                    targets.push(new THREE.Vector3(x, y, z));
                }
                break;
            case this.MODE_GEOM_SPIRAL:
                for (let i = 0; i < count; i++) {
                    const t = i / count;
                    const theta = t * Math.PI * 20;
                    const r = t * 1200;
                    targets.push(new THREE.Vector3(Math.cos(theta) * r, t * 1500 - 300, Math.sin(theta) * r));
                }
                break;
            case this.MODE_GEOM_CUBE:
                for (let i = 0; i < count; i++) {
                    targets.push(new THREE.Vector3((Math.random() - 0.5) * 1500, (Math.random() - 0.5) * 1500 + 400, (Math.random() - 0.5) * 1500));
                }
                break;
            case this.MODE_GEOM_RING_STACK:
                for (let i = 0; i < count; i++) {
                    const ringIdx = Math.floor(i / (count / 5));
                    const theta = (i % (count / 5)) / (count / 5) * Math.PI * 2;
                    const r = 600 + ringIdx * 100;
                    targets.push(new THREE.Vector3(Math.cos(theta) * r, ringIdx * 250 - 200, Math.sin(theta) * r));
                }
                break;
            case this.MODE_GEOM_DNA:
                for (let i = 0; i < count; i++) {
                    const t = i / count;
                    const strand = i % 2 === 0 ? 0 : Math.PI;
                    const theta = t * Math.PI * 8 + strand;
                    targets.push(new THREE.Vector3(Math.cos(theta) * 400, t * 2000 - 600, Math.sin(theta) * 400));
                }
                break;
            case this.MODE_GEOM_PYRAMID:
                for (let i = 0; i < count; i++) {
                    const h = Math.random();
                    const side = (1.0 - h) * 1000;
                    targets.push(new THREE.Vector3((Math.random() - 0.5) * side * 2, h * 1500 - 400, (Math.random() - 0.5) * side * 2));
                }
                break;
            case this.MODE_GEOM_STAR:
                for (let i = 0; i < count; i++) {
                    const axis = Math.floor(Math.random() * 6);
                    const r = Math.random() * 1500;
                    if (axis === 0) targets.push(new THREE.Vector3(r, 400, 0));
                    else if (axis === 1) targets.push(new THREE.Vector3(-r, 400, 0));
                    else if (axis === 2) targets.push(new THREE.Vector3(0, r + 400, 0));
                    else if (axis === 3) targets.push(new THREE.Vector3(0, -r + 400, 0));
                    else if (axis === 4) targets.push(new THREE.Vector3(0, 400, r));
                    else targets.push(new THREE.Vector3(0, 400, -r));
                }
                break;
            case this.MODE_GEOM_TORUS:
                for (let i = 0; i < count; i++) {
                    const t = (i / count) * Math.PI * 2;
                    const p = 2, q = 3;
                    const r = 600;
                    targets.push(new THREE.Vector3(
                        r * (2 + Math.cos(q * t)) * Math.cos(p * t),
                        r * (2 + Math.cos(q * t)) * Math.sin(p * t) + 400,
                        r * Math.sin(q * t)
                    ));
                }
                break;
        }
        this.geometricTargets.set(mode, targets);
    }

    handleTrackNumber(trackNumber, message) {
        const args = message.args || [];
        const velocity = args[1] !== undefined ? args[1] : 127;
        if (trackNumber === 5) this.triggerRandomForce(velocity);
        if (trackNumber === 6) this.triggerExpandEffect(velocity);
    }

    triggerRandomForce(velocity = 127) {
        const forceStrength = 200.0 * (velocity / 127.0);
        this.particles.forEach(p => {
            const f = new THREE.Vector3((Math.random()-0.5)*2, Math.random()*1.5, (Math.random()-0.5)*2).normalize().multiplyScalar(forceStrength);
            p.addForce(f);
        });
    }

    triggerExpandEffect(velocity = 127) {
        const center = new THREE.Vector3((Math.random()-0.5)*1000, 0, (Math.random()-0.5)*1000);
        const force = 300.0 * (velocity / 127.0);
        this.particles.forEach(p => {
            const diff = p.position.clone().sub(center);
            if (diff.length() < 2000) p.addForce(diff.normalize().multiplyScalar(force));
        });
    }

    dispose() {
        this.initialized = false;
        if (this.studio) this.studio.dispose();
        if (this.cubeRenderTarget) this.cubeRenderTarget.dispose();
        this.instancedMeshManagers.forEach(m => m.dispose());
        super.dispose();
    }
}
