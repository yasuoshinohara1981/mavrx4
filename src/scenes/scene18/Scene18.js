/**
 * Scene18: Glowing Tiles
 * 床のタイルがトラック6で光り、波紋のように広がるシーン
 * 色はベロシティに応じたヒートマップ
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
        this.title = 'Glowing Tiles';
        this.initialized = false;
        this.sceneNumber = 18;
        this.kitNo = 18;
        
        this.sharedResourceManager = sharedResourceManager;
        this.raycaster = new THREE.Raycaster();
        
        // タイル関連
        this.tileInstances = null;
        this.impactData = new Array(50).fill(null);
        this.impactIndex = 0;
        this.lastImpactTime = 0;
        this.lastImpactPos = new THREE.Vector2(0, 0);

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
            1: true, 2: true, 3: false, 4: false, 5: true, 6: true, 7: false, 8: false, 9: false
        };

        this.setScreenshotText(this.title);
    }

    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 400;
        cameraParticle.maxDistance = 5000;
        cameraParticle.minY = -450; 
    }

    async setup() {
        if (this.initialized) return;
        await super.setup();

        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.3;

        this.camera.position.set(0, 500, 2000);
        this.camera.lookAt(0, 200, 0);

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // CubeCameraのセットアップ
        this.cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, { 
            generateMipmaps: true, 
            minFilter: THREE.LinearMipmapLinearFilter 
        });
        this.cubeCamera = new THREE.CubeCamera(10, 10000, this.cubeRenderTarget);
        this.cubeCamera.position.set(0, 500, 0);
        this.scene.add(this.cubeCamera);

        this.showGridRuler3D = false; 

        this.setupLights();
        this.createStudioBox();
        this.createTiles();
        this.initPostProcessing();
        this.initialized = true;
    }

    setupLights() {
        const pureWhite = 0xffffff; 
        const hemiLight = new THREE.HemisphereLight(pureWhite, 0xffffff, 0.8);
        this.scene.add(hemiLight);

        const ambientLight = new THREE.AmbientLight(pureWhite, 0.8);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(pureWhite, 4.0);
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

        const pointLight = new THREE.PointLight(pureWhite, 3.0, 15000);
        pointLight.decay = 1.0; 
        pointLight.position.set(0, 3000, 0); 
        this.scene.add(pointLight);
    }

    createStudioBox() {
        this.studio = new StudioBox(this.scene, {
            size: 10000,
            color: 0xbbbbbb,
            roughness: 0.2, 
            metalness: 0.8, 
            lightColor: 0xffffff,
            lightIntensity: 2.8,
            envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
            envMapIntensity: 1.3,
            useFloorTile: false 
        });
    }

    createTiles() {
        const size = 10000;
        const segments = 50; 
        const step = size / segments;
        
        // 1. ベースとなる床（StudioBoxの床を完全に再現）
        const floorGeo = new THREE.PlaneGeometry(size, size);
        floorGeo.rotateX(-Math.PI / 2);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0xbbbbbb, // StudioBoxのデフォルト色
            map: this.studio.floorTextures.map,
            bumpMap: this.studio.floorTextures.bumpMap,
            bumpScale: 1.0, 
            roughness: 0.2 * 0.3, // StudioBoxの床の計算式: this.roughness * 0.3 (0.8 * 0.3 = 0.24)
            metalness: 0.8 + 0.2, // StudioBoxの床の計算式: this.metalness + 0.2 (0.8 + 0.2 = 1.0)
            envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
            envMapIntensity: 1.3 * 1.3 // StudioBoxの床の計算式: this.envMapIntensity * 1.3
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.y = -498; // StudioBoxの床と同じ高さ
        floor.receiveShadow = true;
        this.scene.add(floor);

        // 2. 丸く光るエフェクト（InstancedMeshのPlaneで軽量化！）
        const glowGeo = new THREE.PlaneGeometry(step * 4.0, step * 4.0); 
        glowGeo.rotateX(-Math.PI / 2);
        
        // 円形グラデーションのテクスチャを生成
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
        grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        const glowTex = new THREE.CanvasTexture(canvas);

        const glowMat = new THREE.MeshBasicMaterial({
            map: glowTex,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.tileInstances = new THREE.InstancedMesh(glowGeo, glowMat, 50);
        this.tileInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.tileInstances.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(50 * 3), 3);
        this.tileInstances.renderOrder = 10; 
        this.scene.add(this.tileInstances);

        const dummy = new THREE.Object3D();
        for (let i = 0; i < 50; i++) {
            dummy.position.set(0, -5000, 0);
            dummy.updateMatrix();
            this.tileInstances.setMatrixAt(i, dummy.matrix);
        }
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;

        if (this.tileInstances) {
            const dummy = new THREE.Object3D();
            for (let i = 0; i < 50; i++) {
                if (this.impactData[i]) {
                    const data = this.impactData[i];
                    const age = this.time - data.time;
                    const life = data.duration / 1000.0 * 2.0; 
                    
                    if (age >= 0 && age < life) {
                        const progress = age / life;
                        const scale = 1.0 + progress * 4.0;
                        const opacity = Math.pow(1.0 - progress, 2.0);
                        
                        dummy.position.set(data.x, -497, data.z); 
                        dummy.scale.set(scale, 1.0, scale);
                        dummy.updateMatrix();
                        this.tileInstances.setMatrixAt(i, dummy.matrix);
                        
                        const col = this.getHeatmapColor(data.intensity);
                        this.tileInstances.instanceColor.setXYZ(i, 
                            col.r * opacity * 5.0, 
                            col.g * opacity * 5.0, 
                            col.b * opacity * 5.0
                        );
                    } else {
                        dummy.position.set(0, -5000, 0);
                        dummy.updateMatrix();
                        this.tileInstances.setMatrixAt(i, dummy.matrix);
                    }
                }
            }
            this.tileInstances.instanceMatrix.needsUpdate = true;
            this.tileInstances.instanceColor.needsUpdate = true;
        }

        if (this.strobeActive) {
            if (Date.now() > this.strobeEndTime) { 
                this.strobeActive = false; 
            }
        }

        if (this.cubeCamera && Math.floor(this.time * 60) % 2 === 0) {
            this.cubeCamera.update(this.renderer, this.scene);
        }
        this.updateAutoFocus();
    }

    getHeatmapColor(v) {
        const blue = new THREE.Color(0.0, 0.1, 0.5);
        const cyan = new THREE.Color(0.0, 1.0, 1.0);
        const green = new THREE.Color(0.0, 1.0, 0.0);
        const yellow = new THREE.Color(1.0, 1.0, 0.0);
        const red = new THREE.Color(1.0, 0.0, 0.0);
        if (v < 0.25) return blue.clone().lerp(cyan, v * 4.0);
        if (v < 0.5) return cyan.clone().lerp(green, (v - 0.25) * 4.0);
        if (v < 0.75) return green.clone().lerp(yellow, (v - 0.5) * 4.0);
        return yellow.clone().lerp(red, (v - 0.75) * 4.0);
    }

    triggerImpact(velocity = 127, durationMs = 500) {
        const intensity = velocity / 127.0;
        const now = this.time;
        const timeDiff = now - this.lastImpactTime;
        
        let x, z;
        const size = 10000;
        const segments = 50; 
        const step = size / segments;

        if (timeDiff < 1.0) {
            const range = 1500; 
            x = this.lastImpactPos.x + (Math.random() - 0.5) * range;
            z = this.lastImpactPos.y + (Math.random() - 0.5) * range;
        } else {
            x = (Math.random() - 0.5) * 8000;
            z = (Math.random() - 0.5) * 8000;
        }
        
        x = Math.floor((x + size/2) / step) * step - size/2 + step/2;
        z = Math.floor((z + size/2) / step) * step - size/2 + step/2;
        
        this.impactData[this.impactIndex % 50] = { x, z, intensity, time: now, duration: durationMs };
        
        this.lastImpactPos.set(x, z);
        this.lastImpactTime = now;
        this.impactIndex++;
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
            this.initDOF({
                focus: 500,
                aperture: 0.000005,
                maxblur: 0.003
            });
        }
    }

    handleOSC(message) {
        super.handleOSC(message);
    }

    handleTrackNumber(trackNumber, message) {
        if (trackNumber === 2) {
            const args = message.args || [];
            const durationMs = (args.length >= 3) ? args[2] : 500;
            this.strobeActive = true; 
            this.strobeEndTime = Date.now() + durationMs;
        }
        if (trackNumber === 6) {
            const args = message.args || [];
            const velocity = args[1] !== undefined ? args[1] : 127;
            const durationMs = args[2] !== undefined ? args[2] : 500;
            this.triggerImpact(velocity, durationMs);
        }
    }

    updateAutoFocus() {
        if (!this.useDOF || !this.bokehPass) return;
        this.bokehPass.uniforms.focus.value = 2000;
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
        if (this.tileInstances) {
            this.scene.remove(this.tileInstances);
            this.tileInstances.geometry.dispose();
            this.tileInstances.material.dispose();
        }
        super.dispose();
    }
}
