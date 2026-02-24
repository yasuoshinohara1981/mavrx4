/**
 * Scene18: Glowing Tiles
 * 床のタイルがトラック6で光り、せり出すシーン
 * 色はベロシティに応じたヒートマップ
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
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
        
        // 1. ベースとなる床
        const floorGeo = new THREE.PlaneGeometry(size, size);
        floorGeo.rotateX(-Math.PI / 2);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this.studio.floorTextures.map,
            bumpMap: this.studio.floorTextures.bumpMap,
            roughness: 0.05,
            metalness: 0.9,
            envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
            envMapIntensity: 1.5
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.y = -499;
        floor.receiveShadow = true;
        this.scene.add(floor);

        // 2. せり出すタイル（RoundedBoxGeometryで角丸に！）
        const boxGeo = new RoundedBoxGeometry(step, 2000, step, 2, 5); 
        const boxMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, 
            map: this.studio.floorTextures.map,
            bumpMap: this.studio.floorTextures.bumpMap,
            roughness: 0.05,
            metalness: 0.9,
            envMap: this.cubeRenderTarget ? this.cubeRenderTarget.texture : null,
            envMapIntensity: 1.5,
            transparent: false,
            opacity: 1.0
        });

        // シェーダーでUVを調整して、床のテクスチャと位置を合わせる
        boxMat.onBeforeCompile = (shader) => {
            shader.vertexShader = `
                varying vec3 vInstanceWorldPos;
                varying vec2 vMyUv;
                ${shader.vertexShader}
            `.replace(
                `#include <worldpos_vertex>`,
                `#include <worldpos_vertex>
                vInstanceWorldPos = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
                vMyUv = uv;`
            );
            shader.fragmentShader = `
                varying vec3 vInstanceWorldPos;
                varying vec2 vMyUv;
                ${shader.fragmentShader}
            `.replace(
                `#include <map_fragment>`,
                `
                #ifdef USE_MAP
                    vec2 floorUv = (vInstanceWorldPos.xz + 5000.0) / 10000.0;
                    vec2 localOffset = (vMyUv - 0.5) / 50.0; 
                    vec4 sampledColor = texture2D( map, floorUv + localOffset );
                    diffuseColor *= sampledColor;
                #endif
                `
            );
        };

        this.tileInstances = new THREE.InstancedMesh(boxGeo, boxMat, 50); 
        this.tileInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.tileInstances.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(50 * 3), 3);
        this.tileInstances.castShadow = true;
        this.tileInstances.receiveShadow = true;
        this.tileInstances.frustumCulled = false;
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
                    
                    if (age >= 0 && age < 4.0) {
                        // デュレーション（duration）を高さに反映させるやで！
                        // durationが長いほど、ゆっくり高くせり出す感じや
                        const liftHeight = data.duration / 1000.0 * 500.0; // 1秒あたり500ユニット
                        const lift = data.intensity * liftHeight * Math.exp(-age * (2000.0 / data.duration));
                        dummy.position.set(data.x, -1000 + lift, data.z); 
                        dummy.updateMatrix();
                        this.tileInstances.setMatrixAt(i, dummy.matrix);
                        
                        const col = this.getHeatmapColor(data.intensity);
                        this.tileInstances.instanceColor.setXYZ(i, col.r * 5.0, col.g * 5.0, col.b * 5.0);
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
