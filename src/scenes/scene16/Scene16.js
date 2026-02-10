/**
 * Scene16: AKIRAの鉄雄のようなグロテスクな金属融合
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { StudioBox } from '../../lib/StudioBox.js';

export class Scene16 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'TETSUO';
        this.initialized = false;
        this.sceneNumber = 16;
        this.kitNo = 16;
        
        this.sharedResourceManager = sharedResourceManager;
        this.raycaster = new THREE.Raycaster();
        
        // 触手（Tentacles）の設定
        this.tentacleCount = 300; 
        this.tentacles = [];
        this.tentacleGroup = new THREE.Group();

        // エフェクト設定
        this.useDOF = true;
        this.useBloom = true; 
        this.bokehPass = null;
        this.bloomPass = null;

        this.trackEffects = {
            1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false, 9: false
        };

        this.setScreenshotText(this.title);
    }

    /**
     * カメラパーティクルの距離パラメータを設定
     */
    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 400;
        cameraParticle.maxDistance = 5000;
        cameraParticle.minY = -400; // 地面（-500）より上に制限
    }

    async setup() {
        if (this.initialized) return;
        await super.setup();

        this.camera.position.set(0, 500, 2500);
        this.camera.lookAt(0, 1000, 0);

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.setupLights();
        this.createStudioBox();
        this.createTentacles();
        this.initPostProcessing();
        this.initialized = true;
    }

    setupLights() {
        // シーン12-15と共通の明るい設定に統一するで！
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x888888, 0.8);
        this.scene.add(hemiLight);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight.position.set(2000, 3000, 2000);
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.left = -8000;
        directionalLight.shadow.camera.right = 8000;
        directionalLight.shadow.camera.top = 8000;
        directionalLight.shadow.camera.bottom = -8000;
        directionalLight.shadow.camera.near = 100;
        directionalLight.shadow.camera.far = 15000;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.bias = -0.0001;
        this.scene.add(directionalLight);

        const pointLight = new THREE.PointLight(0xffffff, 2.5, 5000); 
        pointLight.position.set(0, 500, 0); 
        pointLight.castShadow = true; 
        pointLight.shadow.camera.near = 10;
        pointLight.shadow.camera.far = 10000;
        pointLight.shadow.bias = -0.001;
        this.scene.add(pointLight);
    }

    createStudioBox() {
        this.studio = new StudioBox(this.scene);
    }

    /**
     * 全体として巨大な球体を形成する機械生物を生成（宙に浮いた状態）
     */
    createTentacles() {
        const textures = this.generateFleshTextures();
        this.scene.add(this.tentacleGroup);

        const tentacleCount = 150; // 触手の総数
        const sphereCenter = new THREE.Vector3(0, 400, 0); 
        const baseRadius = 400; 

        for (let i = 0; i < tentacleCount; i++) {
            const radius = 2 + Math.random() * 10; // 全体的に細く
            const segments = 20;
            const points = [];
            
            // クラスター化（束になって絡ませる）
            const clusterIdx = i % 12;
            const clusterAngle = (clusterIdx / 12) * Math.PI * 2;

            // --- 球体内の触手の生成（複雑に絡み合う・宙に浮く） ---
            const basePhi = Math.random() * Math.PI * 2;
            const baseTheta = Math.random() * Math.PI;
            const spiralTurns = 3.0 + Math.random() * 4.0;

            for (let j = 0; j <= segments; j++) {
                const t = j / segments;
                // 球面上を螺旋状に這い回る
                const p = t * Math.PI * spiralTurns;
                const theta = baseTheta + Math.sin(p + i) * 0.5;
                const phi = basePhi + p + clusterAngle + Math.cos(t * Math.PI * 4.0 + i) * 0.3;
                
                // 半径を複雑に変化させて「肉の盛り上がり」を作る
                const r = baseRadius * (0.8 + Math.sin(t * Math.PI * 6.0 + i * 0.5) * 0.2);
                
                const pos = new THREE.Vector3(
                    r * Math.sin(theta) * Math.cos(phi),
                    r * Math.cos(theta),
                    r * Math.sin(theta) * Math.sin(phi)
                );
                points.push(pos.add(sphereCenter));
            }
            
            const curve = new THREE.CatmullRomCurve3(points);
            const geometry = new THREE.TubeGeometry(curve, 128, radius, 12, false);
            
            const mesh = this.createTentacleMesh(geometry, textures, Math.random() > 0.7);
            this.tentacleGroup.add(mesh);
            this.tentacles.push({ mesh, curve, radius });
        }
        
        this.setParticleCount(this.tentacles.length);
    }

    /**
     * 触手メッシュを作成する共通処理
     */
    createTentacleMesh(geometry, textures, isBranch) {
        const isFleshy = Math.random() > 0.4;
        const color = new THREE.Color();
        if (isFleshy) {
            color.setRGB(0.6 + Math.random() * 0.3, 0.2 + Math.random() * 0.2, 0.3 + Math.random() * 0.2);
        } else {
            const v = 0.2 + Math.random() * 0.3;
            color.setRGB(v, v + 0.05, v + 0.1);
        }

        const material = new THREE.MeshStandardMaterial({
            color: color,
            map: textures.map,
            bumpMap: textures.bumpMap,
            bumpScale: isBranch ? 3.0 : 8.0,
            metalness: isFleshy ? 0.2 : 0.9,
            roughness: isFleshy ? 0.5 : 0.1,
            envMapIntensity: 1.0
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    generateFleshTextures() {
        const size = 512;
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size; colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');
        cCtx.fillStyle = '#ffffff'; cCtx.fillRect(0, 0, size, size);

        // 血管のような模様
        cCtx.strokeStyle = 'rgba(150, 0, 0, 0.2)';
        for (let i = 0; i < 30; i++) {
            cCtx.lineWidth = 1;
            let x = Math.random() * size; let y = Math.random() * size;
            cCtx.beginPath(); cCtx.moveTo(x, y);
            for (let j = 0; j < 5; j++) {
                x += (Math.random() - 0.5) * 100; y += (Math.random() - 0.5) * 100;
                cCtx.lineTo(x, y);
            }
            cCtx.stroke();
        }

        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size; bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');
        bCtx.fillStyle = '#808080'; bCtx.fillRect(0, 0, size, size);
        for (let i = 0; i < 50; i++) {
            const x = Math.random() * size; const y = Math.random() * size;
            const r = 2 + Math.random() * 20;
            const grad = bCtx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.3)'); grad.addColorStop(1, 'rgba(128, 128, 128, 0)');
            bCtx.fillStyle = grad; bCtx.beginPath(); bCtx.arc(x, y, r, 0, Math.PI * 2); bCtx.fill();
        }

        return { map: new THREE.CanvasTexture(colorCanvas), bumpMap: new THREE.CanvasTexture(bumpCanvas) };
    }

    initPostProcessing() {
        if (!this.composer) {
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
        }
        if (this.useBloom) {
            this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 4, window.innerHeight / 4), 0.2, 0.1, 1.2);
            this.composer.addPass(this.bloomPass);
        }
        if (this.useDOF) {
            this.bokehPass = new BokehPass(this.scene, this.camera, { focus: 1500, aperture: 0.00001, maxblur: 0.005, width: window.innerWidth, height: window.innerHeight });
            this.composer.addPass(this.bokehPass);
        }
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;

        // 心音（脈動）に合わせて触手を微細に揺らす
        const heartbeat = Math.pow(Math.sin(this.time * 2.0), 8.0);
        this.tentacleGroup.scale.set(
            1.0 + heartbeat * 0.02,
            1.0,
            1.0 + heartbeat * 0.02
        );

        // カメラのオートフォーカス
        if (this.useDOF && this.bokehPass) {
            this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
            const intersects = this.raycaster.intersectObjects(this.tentacleGroup.children);
            if (intersects.length > 0) {
                const targetDistance = intersects[0].distance;
                const currentFocus = this.bokehPass.uniforms.focus.value;
                this.bokehPass.uniforms.focus.value = currentFocus + (targetDistance - currentFocus) * 0.1;
            }
        }
    }

    dispose() {
        this.initialized = false;
        if (this.studio) this.studio.dispose();
        this.tentacles.forEach(t => {
            if (t.mesh.geometry) t.mesh.geometry.dispose();
            if (t.mesh.material) t.mesh.material.dispose();
        });
        this.tentacles = [];
        this.scene.remove(this.tentacleGroup);
        if (this.bokehPass) {
            if (this.composer) {
                const idx = this.composer.passes.indexOf(this.bokehPass);
                if (idx !== -1) this.composer.passes.splice(idx, 1);
            }
            this.bokehPass.enabled = false;
        }
        if (this.bloomPass) {
            if (this.composer) {
                const idx = this.composer.passes.indexOf(this.bloomPass);
                if (idx !== -1) this.composer.passes.splice(idx, 1);
            }
            this.bloomPass.enabled = false;
        }
        super.dispose();
    }
}
