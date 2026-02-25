/**
 * Scene18: AKIRA Fiber Core
 * 中央の白い巨大球体から、ランダムな太さのケーブルが重力で垂れ下がるシーン
 * AKIRAの「アキラ」の核をイメージ
 * トラック5で赤い光が中を駆け抜ける
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { StudioBox } from '../../lib/StudioBox.js';

export class Scene18 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'Fiber Core';
        this.initialized = false;
        this.sceneNumber = 18;
        this.kitNo = 18;
        
        this.sharedResourceManager = sharedResourceManager;
        
        // ケーブル関連
        this.cables = [];
        this.cableCount = 120; // 60 -> 120 (さらに倍増！限界に挑戦や！)
        this.cableGroup = new THREE.Group();

        // 中央の球体
        this.centralSphere = null;
        this.coreRadius = 700; // 500 -> 700 (画面を埋め尽くす巨大さ！)
        this.detailGroup = new THREE.Group(); // 球体やケーブルの部品用

        // 光の弾丸（ファイバーエフェクト）管理
        this.pulses = [];

        // 撮影用スタジオ
        this.studio = null;
        
        // エフェクト設定
        this.useDOF = true; 
        this.useBloom = true; 
        this.bloomPass = null;

        // ストロボエフェクト管理
        this.strobeActive = false;
        this.strobeEndTime = 0;

        this.trackEffects = {
            1: true, 2: true, 3: false, 4: false, 5: true, 6: false, 7: false, 8: false, 9: false
        };

        this.setScreenshotText(this.title);
    }

    setupCameraParticleDistance(cameraParticle) {
        // 球体の半径が700、中心高さが400
        // minDistanceを球体の半径 + ニアクリップ分以上に設定
        cameraParticle.minDistance = 1500; // 4000 -> 1500 (物理的な制限)
        cameraParticle.maxDistance = 15000;
        cameraParticle.minY = 0;
        
        // ニアクリップによる「中身透け」を防ぐため、
        // 物理的な minDistance をさらに大きく取るやで。
        // ここは Scene17 の updateCamera ロジックを参考に、
        // 毎フレームの更新で強制的に距離を保つようにするで。
    }

    /**
     * カメラの位置を更新（SceneBaseのオーバーライド）
     */
    updateCamera() {
        if (this.cameraParticles[this.currentCameraIndex]) {
            const cp = this.cameraParticles[this.currentCameraIndex];
            const cameraPos = cp.getPosition();
            
            // --- 球体の内部に入らないように強制補正 ---
            // 球体の中心 (0, 400, 0) からの距離を計算
            const coreCenter = new THREE.Vector3(0, 400, 0);
            const distToCore = cameraPos.distanceTo(coreCenter);
            
            // 安全距離（半径700 + 余裕分）
            const safeDistance = 1200; 
            
            if (distToCore < safeDistance) {
                const dir = cameraPos.clone().sub(coreCenter).normalize();
                cameraPos.copy(coreCenter.clone().add(dir.multiplyScalar(safeDistance)));
            }
            
            this.camera.position.copy(cameraPos);
            this.camera.lookAt(coreCenter);
            this.camera.matrixWorldNeedsUpdate = false;
        }
    }

    async setup() {
        if (this.initialized) return;
        await super.setup();

        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.3;

        // 初期位置も十分に離す
        this.camera.position.set(0, 3000, 8000); 
        this.camera.lookAt(0, 400, 0);

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // CubeCameraのセットアップ（反射用）
        this.cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, { 
            generateMipmaps: true, 
            minFilter: THREE.LinearMipmapLinearFilter 
        });
        this.cubeCamera = new THREE.CubeCamera(10, 10000, this.cubeRenderTarget);
        this.cubeCamera.position.set(0, 500, 0);
        this.scene.add(this.cubeCamera);

        this.setupLights();
        this.createStudioBox();
        this.createCore();
        this.createSphereDetails(); // 球体の部品追加
        this.createCables();
        this.initPostProcessing();
        this.initialized = true;
    }

    setupLights() {
        const pureWhite = 0xffffff; 
        const hemiLight = new THREE.HemisphereLight(pureWhite, 0xffffff, 1.5);
        this.scene.add(hemiLight);

        const ambientLight = new THREE.AmbientLight(pureWhite, 1.0);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(pureWhite, 5.0);
        directionalLight.position.set(2000, 4000, 2000);
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.left = -5000;
        directionalLight.shadow.camera.right = 5000;
        directionalLight.shadow.camera.top = 5000;
        directionalLight.shadow.camera.bottom = -5000;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);

        const pointLight = new THREE.PointLight(pureWhite, 4.0, 10000);
        pointLight.position.set(0, 2000, 0);
        this.scene.add(pointLight);
    }

    createStudioBox() {
        this.studio = new StudioBox(this.scene, {
            size: 10000,
            color: 0xbbbbbb,
            roughness: 0.1, 
            metalness: 0.9, 
            envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
            envMapIntensity: 2.5
        });
    }

    createCore() {
        const unifiedColor = 0x888888; // 全体で統一するベースカラー
        const textures = this.generateDirtyTextures(1024, unifiedColor, true); 
        const sphereGeo = new THREE.SphereGeometry(this.coreRadius, 64, 64);
        const sphereMat = new THREE.MeshStandardMaterial({
            color: unifiedColor,
            map: textures.map,
            bumpMap: textures.bumpMap,
            bumpScale: 5.0,
            emissive: unifiedColor,
            emissiveIntensity: 0.1, 
            metalness: 0.1,
            roughness: 0.9,
            envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
            envMapIntensity: 0.5
        });
        this.centralSphere = new THREE.Mesh(sphereGeo, sphereMat);
        this.centralSphere.position.y = 400;
        this.centralSphere.castShadow = true;
        this.centralSphere.receiveShadow = true;
        this.scene.add(this.centralSphere);
        this.scene.add(this.detailGroup);
    }

    generateDirtyTextures(size = 512, baseColor = 0xffffff, isMatte = false) {
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size; colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');
        
        // ベースカラー
        const hex = '#' + new THREE.Color(baseColor).getHexString();
        cCtx.fillStyle = hex;
        cCtx.fillRect(0, 0, size, size);
        
        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size; bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');
        bCtx.fillStyle = '#808080'; // 中間グレー
        bCtx.fillRect(0, 0, size, size);
        
        // 汚れ・かすれの描画
        for (let i = 0; i < 2000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = Math.random() * (isMatte ? 5 : 2);
            const alpha = Math.random() * 0.3;
            
            // カラーキャンバスに暗い汚れ
            cCtx.fillStyle = `rgba(50, 50, 50, ${alpha})`;
            cCtx.beginPath();
            cCtx.arc(x, y, r, 0, Math.PI * 2);
            cCtx.fill();
            
            // バンプキャンバスに凹凸
            const val = 128 + (Math.random() - 0.5) * 60;
            bCtx.fillStyle = `rgb(${val}, ${val}, ${val})`;
            bCtx.beginPath();
            bCtx.arc(x, y, r, 0, Math.PI * 2);
            bCtx.fill();
        }

        // ケーブル用のかすれた線（プラスチック感）
        if (!isMatte) {
            for (let i = 0; i < 100; i++) {
                const x = Math.random() * size;
                const y = Math.random() * size;
                const len = 20 + Math.random() * 100;
                const angle = Math.random() * Math.PI * 2;
                
                cCtx.strokeStyle = `rgba(100, 100, 100, 0.1)`;
                cCtx.lineWidth = 1;
                cCtx.beginPath();
                cCtx.moveTo(x, y);
                cCtx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
                cCtx.stroke();
                
                bCtx.strokeStyle = `rgb(100, 100, 100)`;
                bCtx.beginPath();
                bCtx.moveTo(x, y);
                bCtx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
                bCtx.stroke();
            }
        }
        
        const map = new THREE.CanvasTexture(colorCanvas);
        const bumpMap = new THREE.CanvasTexture(bumpCanvas);
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
        
        return { map, bumpMap };
    }

    createSphereDetails() {
        const unifiedColor = 0x888888;
        const detailCount = 200; 
        const textures = this.generateDirtyTextures(512, unifiedColor, false); 
        const metallicMat = new THREE.MeshStandardMaterial({
            color: unifiedColor, 
            map: textures.map,
            bumpMap: textures.bumpMap,
            bumpScale: 2.0,
            metalness: 0.9,
            roughness: 0.2,
            envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
            envMapIntensity: 2.0
        });

        for (let i = 0; i < detailCount; i++) {
            const phi = Math.random() * Math.PI * 2;
            const theta = Math.random() * Math.PI;
            
            const x = this.coreRadius * Math.sin(theta) * Math.cos(phi);
            const y = this.coreRadius * Math.cos(theta) + 400;
            const z = this.coreRadius * Math.sin(theta) * Math.sin(phi);

            const type = Math.floor(Math.random() * 3);
            let geometry;
            let mesh;

            if (type === 0) {
                // シリンダー/パイプ
                geometry = new THREE.CylinderGeometry(10 + Math.random() * 20, 10 + Math.random() * 20, 40 + Math.random() * 60, 12);
            } else if (type === 1) {
                // ボックス/パネル
                geometry = new THREE.BoxGeometry(20 + Math.random() * 40, 20 + Math.random() * 40, 10 + Math.random() * 30);
            } else {
                // 円盤/ハッチ
                geometry = new THREE.CylinderGeometry(30 + Math.random() * 50, 30 + Math.random() * 50, 5 + Math.random() * 10, 24);
            }

            mesh = new THREE.Mesh(geometry, metallicMat);
            mesh.position.set(x, y, z);
            
            // 球体の中心を向くように回転
            const center = new THREE.Vector3(0, 400, 0);
            mesh.lookAt(center);
            if (type !== 1) mesh.rotateX(Math.PI / 2); // Cylinderは軸が違うので調整

            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.detailGroup.add(mesh);
        }
    }

    createCableRings(curve, cableRadius) {
        const unifiedColor = 0x888888;
        const ringCount = 2 + Math.floor(Math.random() * 4); 
        const ringMat = new THREE.MeshStandardMaterial({
            color: unifiedColor,
            metalness: 1.0,
            roughness: 0.1,
            envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
            envMapIntensity: 2.0
        });

        for (let i = 0; i < ringCount; i++) {
            const t = 0.1 + Math.random() * 0.8; // 根本と先端を避ける
            const pos = curve.getPointAt(t);
            const tangent = curve.getTangentAt(t);

            const ringGeo = new THREE.TorusGeometry(cableRadius * 1.2, cableRadius * 0.2, 12, 24);
            const ring = new THREE.Mesh(ringGeo, ringMat);
            
            ring.position.copy(pos);
            ring.lookAt(pos.clone().add(tangent));
            
            ring.castShadow = true;
            ring.receiveShadow = true;
            this.detailGroup.add(ring);
        }
    }

    createCables() {
        const unifiedColor = 0x888888;
        this.scene.add(this.cableGroup);
        const floorY = -498;
        const cableTextures = this.generateDirtyTextures(1024, unifiedColor, false); 

        for (let i = 0; i < this.cableCount; i++) {
            // 球体表面からランダムな方向に生やす
            const phi = Math.acos(2 * Math.random() - 1);
            const theta = Math.random() * Math.PI * 2;
            
            // 法線ベクトル
            const normal = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            );

            const startPos = normal.clone().multiplyScalar(this.coreRadius);
            startPos.y += 400; // 球体の中心高さ

            // 球体の下半分から生える確率を高くする（画像イメージ）
            if (startPos.y > 600 && Math.random() > 0.2) continue;

            const radius = 10 + Math.random() * 80; // 15〜80 -> 10〜90 (さらにバリエーション豊かに)

            // --- 根本のリング（取り付け感） ---
            const ringGeo = new THREE.TorusGeometry(radius * 1.4, radius * 0.4, 12, 24); // より重厚に
            const ringMat = new THREE.MeshStandardMaterial({
                color: unifiedColor,
                metalness: 0.9,
                roughness: 0.2,
                envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
                envMapIntensity: 2.0
            });
            const baseRing = new THREE.Mesh(ringGeo, ringMat);
            baseRing.position.copy(startPos);
            baseRing.lookAt(startPos.clone().add(normal));
            baseRing.castShadow = true;
            baseRing.receiveShadow = true;
            this.detailGroup.add(baseRing);

            const points = [];
            points.push(startPos.clone()); // 根本
            
            // 中間点1：法線方向にしっかり突き出してから垂らす
            const point1 = startPos.clone().add(normal.clone().multiplyScalar(200 + Math.random() * 300));
            points.push(point1);

            // 中間点2：重力で急降下
            const groundDist = 2000 + Math.random() * 4000;
            const groundAngle = Math.atan2(normal.z, normal.x) + (Math.random() - 0.5) * 1.0;
            const groundX = Math.cos(groundAngle) * groundDist;
            const groundZ = Math.sin(groundAngle) * groundDist;
            
            points.push(new THREE.Vector3(
                groundX * 0.4,
                floorY + 500,
                groundZ * 0.4
            ));

            // 終点：地面に向かって垂直に突き刺さるような配置
            const endPos = new THREE.Vector3(groundX, floorY, groundZ);
            points.push(new THREE.Vector3(groundX, floorY + 300, groundZ)); // 垂直に降りるための補助点
            points.push(endPos);

            const curve = new THREE.CatmullRomCurve3(points);
            const geometry = new THREE.TubeGeometry(curve, 128, radius, 12, false);
            
            const material = new THREE.MeshStandardMaterial({
                color: unifiedColor,
                map: cableTextures.map,
                bumpMap: cableTextures.bumpMap,
                bumpScale: 3.0,
                metalness: 0.3, // プラスチック感を出すために低めに
                roughness: 0.6, // かすれた感じを出すために中程度
                envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
                envMapIntensity: 1.0
            });

            material.onBeforeCompile = (shader) => {
                shader.uniforms.uPulses = { value: new Float32Array(10).fill(-1.0) };
                
                shader.vertexShader = `
                    varying vec2 vUv;
                    ${shader.vertexShader}
                `.replace(
                    `#include <begin_vertex>`,
                    `#include <begin_vertex>
                    vUv = uv;`
                );

                shader.fragmentShader = `
                    uniform float uPulses[10];
                    varying vec2 vUv;
                    ${shader.fragmentShader}
                `.replace(
                    `#include <dithering_fragment>`,
                    `
                    #include <dithering_fragment>
                    float pulseEffect = 0.0;
                    for(int i = 0; i < 10; i++) {
                        if(uPulses[i] >= 0.0) {
                            float dist = abs(vUv.x - uPulses[i]);
                            pulseEffect += smoothstep(0.1, 0.0, dist);
                        }
                    }
                    vec3 pulseColor = vec3(1.0, 0.0, 0.0);
                    float constantGlow = smoothstep(0.15, 0.0, vUv.x) * 0.3;
                    gl_FragColor.rgb += pulseColor * (pulseEffect * 12.0 + constantGlow); 
                    `
                );
                material.userData.shader = shader;
            };

            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.cableGroup.add(mesh);
            this.cables.push({ mesh, material });

            // --- 先端のリング（地面への固定感） ---
            const endRingGeo = new THREE.TorusGeometry(radius * 1.4, radius * 0.4, 12, 24);
            const endRingMat = new THREE.MeshStandardMaterial({
                color: unifiedColor,
                metalness: 0.9,
                roughness: 0.2,
                envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
                envMapIntensity: 1.5
            });
            const endRing = new THREE.Mesh(endRingGeo, endRingMat);
            endRing.position.copy(endPos);
            endRing.rotateX(Math.PI / 2); // 床に水平に置く
            endRing.castShadow = true;
            endRing.receiveShadow = true;
            this.detailGroup.add(endRing);

            // ケーブルにリングを追加
            if (Math.random() > 0.3) {
                this.createCableRings(curve, radius);
            }
        }
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;

        // カメラの更新を明示的に呼ぶ
        this.updateCamera();

        for (let i = this.pulses.length - 1; i >= 0; i--) {
            const p = this.pulses[i];
            p.progress += deltaTime * p.speed;
            if (p.progress > 1.2) {
                this.pulses.splice(i, 1);
            }
        }

        this.cables.forEach(cable => {
            if (cable.material.userData.shader) {
                const shader = cable.material.userData.shader;
                const pulseArray = new Float32Array(10).fill(-1.0);
                this.pulses.forEach((p, idx) => {
                    if (idx < 10) pulseArray[idx] = p.progress;
                });
                shader.uniforms.uPulses.value = pulseArray;
            }
        });

        if (this.cubeCamera && Math.floor(this.time * 60) % 4 === 0) {
            this.cubeCamera.update(this.renderer, this.scene);
        }
        
        this.updateAutoFocus();
    }

    triggerPulse(velocity = 127) {
        const speed = 0.3 + (velocity / 127.0) * 1.0;
        this.pulses.push({
            progress: 0.0,
            speed: speed
        });
    }

    initPostProcessing() {
        if (!this.composer) {
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
        }
        if (this.useBloom) {
            this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 4, window.innerHeight / 4), 0.2, 0.05, 0.9);
            this.composer.addPass(this.bloomPass);
        }
        if (this.useDOF) {
            this.initDOF({
                focus: 2500,
                aperture: 0.00001,
                maxblur: 0.005
            });
        }
    }

    handleTrackNumber(trackNumber, message) {
        if (trackNumber === 2) {
            const args = message.args || [];
            const durationMs = (args.length >= 3) ? args[2] : 500;
            this.strobeActive = true; 
            this.strobeEndTime = Date.now() + durationMs;
        }
        if (trackNumber === 5) {
            const args = message.args || [];
            const velocity = args[1] !== undefined ? args[1] : 127;
            this.triggerPulse(velocity);
        }
    }

    updateAutoFocus() {
        if (!this.useDOF || !this.bokehPass) return;
        this.bokehPass.uniforms.focus.value = 3000;
    }

    render() {
        if (this.strobeActive) {
            const isWhite = Math.floor(performance.now() / 32) % 2 === 0;
            this.renderer.setClearColor(isWhite ? 0xffffff : 0x000000);
        } else {
            this.renderer.setClearColor(0x000000);
        }
        super.render();
    }

    dispose() {
        this.initialized = false;
        if (this.studio) this.studio.dispose();
        if (this.cubeRenderTarget) this.cubeRenderTarget.dispose();
        if (this.centralSphere) {
            this.scene.remove(this.centralSphere);
            this.centralSphere.geometry.dispose();
            this.centralSphere.material.dispose();
        }
        if (this.detailGroup) {
            this.detailGroup.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.scene.remove(this.detailGroup);
        }
        this.cables.forEach(c => {
            this.cableGroup.remove(c.mesh);
            c.mesh.geometry.dispose();
            c.mesh.material.dispose();
        });
        this.cables = [];
        this.scene.remove(this.cableGroup);
        super.dispose();
    }
}
