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
        this.MODE_DEFAULT = 0;   // 浮遊・中心引力
        this.MODE_GRAVITY = 1;   // 重力落下
        this.MODE_SPIRAL  = 2;   // DNA二重螺旋
        this.MODE_TORUS   = 3;   // 捻れトーラス
        this.MODE_WALL    = 4;   // 垂直グリッド壁
        this.MODE_WAVE    = 5;   // 巨大な波（サーフェス）
        this.MODE_BLACK_HOLE = 6; // ブラックホール・ジェット
        this.MODE_PILLARS = 7;   // 5本の垂直柱
        this.MODE_CHAOS   = 8;   // 混沌・脈動
        this.MODE_DEFORM  = 9;   // 変形モード（球体同相）

        this.currentMode = this.MODE_DEFAULT;
        this.modeTimer = 0;
        this.modeInterval = 10.0; // 10秒ごとに切り替え
        this.modeSequence = [
            this.MODE_DEFAULT,
            this.MODE_SPIRAL,
            this.MODE_WAVE,
            this.MODE_TORUS,
            this.MODE_WALL,
            this.MODE_BLACK_HOLE,
            this.MODE_PILLARS,
            this.MODE_DEFORM,
            this.MODE_CHAOS,
            this.MODE_GRAVITY
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

        // 1. CubeCameraのセットアップ（createStudioBoxで使うから先にやるで！）
        this.cubeRenderTarget = new THREE.WebGLCubeRenderTarget(512, { 
            generateMipmaps: true, 
            minFilter: THREE.LinearMipmapLinearFilter 
        });
        this.cubeCamera = new THREE.CubeCamera(10, 10000, this.cubeRenderTarget); // nearを10に戻して近くも映す
        this.cubeCamera.position.set(0, 500, 0); // 高さを500に戻す
        this.scene.add(this.cubeCamera);

        // 2. 壁・床用の静的な環境マップ（スフィアなし）をセットアップ
        this.staticCubeRenderTarget = new THREE.WebGLCubeRenderTarget(512, {
            generateMipmaps: true,
            minFilter: THREE.LinearMipmapLinearFilter
        });
        this.staticCubeCamera = new THREE.CubeCamera(10, 10000, this.staticCubeRenderTarget);
        this.staticCubeCamera.position.set(0, 500, 0);
        this.scene.add(this.staticCubeCamera);

        this.createStudioBox();

        // シーン全体の環境マップとして設定（デフォルトは動的マップ）
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
        
        // 壁と床には「スフィアが映り込む環境マップ」を個別に設定する
        // これにより、scene.environment（スフィア用）とは別のマップを持たせることができる
        if (this.studio.studioBox && Array.isArray(this.studio.studioBox.material)) {
            this.studio.studioBox.material.forEach(mat => {
                mat.envMap = this.cubeRenderTarget.texture;
                mat.envMapIntensity = 0.8; // 壁への映り込みは少し控えめに
            });
        }
        if (this.studio.studioFloor) {
            this.studio.studioFloor.material.side = THREE.DoubleSide;
            this.studio.studioFloor.material.envMap = this.cubeRenderTarget.texture;
            this.studio.studioFloor.material.envMapIntensity = 1.0;
        }
    }

    createSpheres() {
        // 完璧な鏡面マテリアル（白飛びを抑えつつ、反射をしっかり出す！）
        const mercuryMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, // 0xcccccc -> 0xffffff ベースカラーを真っ白に！
            metalness: 0.9,  
            roughness: 0.05, 
            envMap: this.staticCubeRenderTarget.texture, // スフィアには「背景のみ」のマップを適用！
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

            // モード切り替え時の特殊処理
            if (this.currentMode === this.MODE_SPIRAL) {
                this.particles.forEach(p => {
                    const r = Math.random() * this.spawnRadius;
                    const theta = Math.random() * Math.PI * 2;
                    p.position.set(
                        Math.cos(theta) * r,
                        p.spiralHeightFactor * 2000 - 500,
                        Math.sin(theta) * r
                    );
                    p.velocity.set(0, 0, 0);
                });
            }
        }

        // 物理演算
        this.updatePhysics(deltaTime);

        // 1. スフィア用の環境マップ（背景のみ）を更新
        if (this.staticCubeCamera) {
            let mainMesh = null;
            let wasVisible = true;
            if (this.instancedMeshManagers.length > 0) {
                mainMesh = this.instancedMeshManagers[0].getMainMesh();
                if (mainMesh) {
                    wasVisible = mainMesh.visible;
                    mainMesh.visible = false; // スフィアを隠して背景だけ撮る！
                }
            }
            this.staticCubeCamera.update(this.renderer, this.scene);
            if (mainMesh) mainMesh.visible = wasVisible;
        }

        // 2. 壁・床用の環境マップ（スフィアあり）を更新
        if (this.cubeCamera) {
            // ここではスフィアを表示したまま撮影するので、壁や床にスフィアが映り込む！
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
        const tempVec = new THREE.Vector3();
        const halfSize = 4950; // スタジオサイズ10000に合わせて拡張

        this.particles.forEach((p, idx) => {
            p.force.set(0, 0, 0);
            
            // モード別の力計算（Scene13を参考）
            if (this.currentMode === this.MODE_SPIRAL) {
                const side = (idx % 2 === 0) ? 1 : -1;
                const rotationSpeed = 1.5;
                const radius = 350 * p.radiusOffset * p.strayRadiusOffset; 
                const angle = (this.time * rotationSpeed) + (p.position.y * 0.003) + (side === 1 ? 0 : Math.PI) + (p.phaseOffset * 0.05);
                const targetX = Math.cos(angle) * radius;
                const targetZ = Math.sin(angle) * radius;
                
                p.velocity.y *= 0.99; 
                const spiralSpringK = 0.02 * p.strayFactor;
                tempVec.set((targetX - p.position.x) * spiralSpringK, 0.1 * p.strayFactor, (targetZ - p.position.z) * spiralSpringK);
                p.addForce(tempVec);

            } else if (this.currentMode === this.MODE_TORUS) {
                const mainRadius = 1200;
                const tubeRadius = 60 * p.radiusOffset * p.strayRadiusOffset; 
                const theta = (idx / this.sphereCount) * Math.PI * 2 + (this.time * 0.2);
                const phi = (idx % 20) / 20 * Math.PI * 2 + (theta * 6.0) + (this.time * 1.5) + p.phaseOffset;
                const tx = (mainRadius + tubeRadius * Math.cos(phi)) * Math.cos(theta);
                const ty = tubeRadius * Math.sin(phi) + 300;
                const tz = (mainRadius + tubeRadius * Math.cos(phi)) * Math.sin(theta);
                
                const torusSpringK = 0.01 * p.strayFactor;
                tempVec.set((tx - p.position.x) * torusSpringK, (ty - p.position.y) * torusSpringK, (tz - p.position.z) * torusSpringK);
                p.addForce(tempVec);

            } else if (this.currentMode === this.MODE_WALL) {
                const cols = 50; 
                const spacing = 100; 
                const zOffset = p.isStray ? (p.targetOffset.z * 5.0) : (p.targetOffset.z * 0.2);
                const tx = ((idx % cols) - cols * 0.5) * spacing + p.targetOffset.x * 0.05; 
                const ty = (Math.floor(idx / cols) - (this.sphereCount / cols) * 0.5) * spacing + 500 + p.targetOffset.y * 0.05;
                const tz = 0 + zOffset;
                
                const wallSpringK = 0.01 * p.strayFactor;
                tempVec.set((tx - p.position.x) * wallSpringK, (ty - p.position.y) * wallSpringK, (tz - p.position.z) * wallSpringK);
                p.addForce(tempVec);

            } else if (this.currentMode === this.MODE_WAVE) {
                const cols = Math.floor(Math.sqrt(this.sphereCount));
                const spacing = 5000 / cols;
                const yOffset = p.isStray ? (p.targetOffset.y * 2.0) : (p.targetOffset.y * 0.05);
                const tx = ((idx % cols) - cols * 0.5) * spacing + p.targetOffset.x * 0.05;
                const tz = (Math.floor(idx / cols) - cols * 0.5) * spacing + p.targetOffset.z * 0.05;
                const ty = Math.sin(tx * 0.001 + this.time) * Math.cos(tz * 0.001 + this.time) * 600 + 200 + yOffset;
                
                const waveSpringK = 0.01 * p.strayFactor;
                tempVec.set((tx - p.position.x) * waveSpringK, (ty - p.position.y) * waveSpringK, (tz - p.position.z) * waveSpringK);
                p.addForce(tempVec);

            } else if (this.currentMode === this.MODE_BLACK_HOLE) {
                if (idx % 10 < 7) {
                    const radius = (idx / this.sphereCount) * 1200 + 50 + p.targetOffset.x * 0.5;
                    const angle = (idx * 0.05) + (this.time * 3.0) + p.phaseOffset * 0.1;
                    const tx = Math.cos(angle) * radius;
                    const tz = Math.sin(angle) * radius;
                    const ty = (Math.sin(radius * 0.01 - this.time * 2.0) * 50) + 200 + p.targetOffset.y * 0.2;
                    
                    const bhSpringK = 0.02 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * bhSpringK, (ty - p.position.y) * bhSpringK, (tz - p.position.z) * bhSpringK);
                    p.addForce(tempVec);
                } else {
                    const side = (idx % 2 === 0) ? 1 : -1;
                    const tx = (Math.random() - 0.5) * 40 + p.targetOffset.x * 0.1;
                    const tz = (Math.random() - 0.5) * 40 + p.targetOffset.z * 0.1;
                    const ty = side * (((idx % 100) / 100) * 4000 + 200) + p.targetOffset.y * 0.5;
                    
                    const jetSpringK = 0.02 * p.strayFactor;
                    tempVec.set((tx - p.position.x) * jetSpringK, (ty - p.position.y) * jetSpringK, (tz - p.position.z) * jetSpringK);
                    p.addForce(tempVec);
                }

            } else if (this.currentMode === this.MODE_PILLARS) {
                const pillarIdx = idx % 5;
                const angle = (pillarIdx / 5) * Math.PI * 2;
                const pillarRadius = 1500;
                const px = Math.cos(angle) * pillarRadius;
                const pz = Math.sin(angle) * pillarRadius;
                const tx = px + (Math.sin(idx + this.time) * 100) + p.targetOffset.x * 0.5;
                const tz = pz + (Math.cos(idx + this.time) * 50) + p.targetOffset.z * 0.5;
                const ty = ((idx / 5) / (this.sphereCount / 5)) * 3000 - 1000 + p.targetOffset.y * 0.2;
                
                const pillarSpringK = 0.01 * p.strayFactor;
                tempVec.set((tx - p.position.x) * pillarSpringK, (ty - p.position.y) * pillarSpringK, (tz - p.position.z) * pillarSpringK);
                p.addForce(tempVec);

            } else if (this.currentMode === this.MODE_CHAOS) {
                const force = Math.sin(this.time * 2.0 + p.phaseOffset) * 0.5 * p.strayFactor;
                tempVec.copy(p.position).normalize().multiplyScalar(force);
                p.addForce(tempVec);

            } else if (this.currentMode === this.MODE_DEFORM) {
                const baseRadius = 600;
                const noiseSpeed = 0.5;
                const theta = (idx / this.sphereCount) * Math.PI * 2;
                const phi = Math.acos(2 * (idx / this.sphereCount) - 1);
                const nx = Math.cos(theta) * Math.sin(phi);
                const ny = Math.sin(theta) * Math.sin(phi);
                const nz = Math.cos(phi);
                const distortion = Math.sin(nx * 5.0 + this.time * noiseSpeed) * 
                                 Math.cos(ny * 5.0 + this.time * noiseSpeed) * 
                                 Math.sin(nz * 5.0 + this.time * noiseSpeed) * 100;
                const r = (baseRadius + distortion) * p.radiusOffset;
                const tx = nx * r;
                const ty = ny * r + 300;
                const tz = nz * r;
                const springK = 0.01 * p.strayFactor;
                tempVec.set((tx - p.position.x) * springK, (ty - p.position.y) * springK, (tz - p.position.z) * springK);
                p.addForce(tempVec);

            } else if (this.currentMode === this.MODE_GRAVITY) {
                p.addForce(new THREE.Vector3(0, -10.0, 0)); // 重力復活！
                p.velocity.multiplyScalar(0.98);
            } else {
                // DEFAULT: 中心の引力
                const tx = p.targetOffset.x;
                const ty = p.targetOffset.y + 200;
                const tz = p.targetOffset.z;
                const defSpringK = 0.0005 * p.strayFactor;
                tempVec.set((tx - p.position.x) * defSpringK, (ty - p.position.y) * defSpringK, (tz - p.position.z) * defSpringK);
                p.addForce(tempVec);
            }

            p.update();
            p.velocity.multiplyScalar(0.95);

            // 壁・床の衝突判定
            if (p.position.x > halfSize) { p.position.x = halfSize; p.velocity.x *= -0.3; }
            if (p.position.x < -halfSize) { p.position.x = -halfSize; p.velocity.x *= -0.3; }
            if (p.position.z > halfSize) { p.position.z = halfSize; p.velocity.z *= -0.3; }
            if (p.position.z < -halfSize) { p.position.z = -halfSize; p.velocity.z *= -0.3; }
            
            if (p.position.y > 4500) { 
                if (this.currentMode === this.MODE_SPIRAL) {
                    p.position.y = -500;
                } else {
                    p.position.y = 4500;
                    p.velocity.y *= -0.3;
                }
            }
            if (p.position.y < -450) {
                p.position.y = -450;
                p.velocity.y *= -0.1;
            }
        });
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
        if (this.staticCubeRenderTarget) this.staticCubeRenderTarget.dispose();
        this.instancedMeshManagers.forEach(m => m.dispose());
        super.dispose();
    }
}
