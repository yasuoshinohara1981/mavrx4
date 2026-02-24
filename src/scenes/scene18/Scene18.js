/**
 * Scene18: Sky & Terrain Test
 * 地面(Terrain)と空(Skydome)のテストシーン
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { LFO } from '../../lib/LFO.js';
import { RandomLFO } from '../../lib/RandomLFO.js';
import { Scene18Particle } from './Scene18Particle.js';

export class Scene18 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'Infinite Dune';
        this.initialized = false;
        this.sceneNumber = 18;
        this.kitNo = 18; 
        
        this.sharedResourceManager = sharedResourceManager;
        this.terrain = null;
        this.skydome = null;
        this.terrainMaterial = null;

        this.useDOF = true; 
        this.useBloom = true; 
        this.bloomPass = null;

        this.trackEffects = {
            1: false, 2: true, 3: false, 4: false, 5: true, 6: true, 7: false, 8: false, 9: false
        };

        this.moveSpeed = 400.0;
        this.setScreenshotText(this.title);
    }

    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 0;
        cameraParticle.maxDistance = Infinity; 
        cameraParticle.minY = -Infinity; 
    }

    async setup() {
        if (this.initialized) return;
        await super.setup();

        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.3;

        this.camera.position.set(0, 300, 1000);
        this.camera.lookAt(0, 300, -1000);

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.setupLights();
        this.createSkydome();
        this.createTerrain();
        this.initPostProcessing();
        this.initialized = true;
    }

    setupLights() {
        const hemiLight = new THREE.HemisphereLight(0xffaa88, 0x442200, 1.2);
        this.scene.add(hemiLight);

        const ambientLight = new THREE.AmbientLight(0xffccaa, 0.4);
        this.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffddaa, 3.5); 
        sunLight.position.set(2000, 1000, -2000); 
        sunLight.castShadow = true;
        
        const shadowSize = 15000; 
        sunLight.shadow.camera.left = -shadowSize;
        sunLight.shadow.camera.right = shadowSize;
        sunLight.shadow.camera.top = shadowSize;
        sunLight.shadow.camera.bottom = -shadowSize;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 30000;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.bias = -0.0005;
        this.scene.add(sunLight);
    }

    createSkydome() {
        const geometry = new THREE.SphereGeometry(80000, 64, 64); 
        const loader = new THREE.TextureLoader();
        const skyTexture = loader.load('./assets/sky_sunset.png', (texture) => {
            console.log('✅ Sky texture loaded successfully');
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;
        });

        const material = new THREE.MeshBasicMaterial({
            map: skyTexture,
            side: THREE.BackSide,
            depthWrite: false,
            depthTest: true
        });

        this.skydome = new THREE.Mesh(geometry, material);
        this.skydome.renderOrder = -1000;
        this.skydome.rotation.y = Math.PI;
        this.scene.add(this.skydome);
    }

    getTerrainHeight(worldX, worldZ) {
        // あの伝説のダブル・ドメインワーピング・ノイズ🏜️✨
        const warp1X = worldX + Math.sin(worldZ * 0.0004 + worldX * 0.0001) * 1200.0;
        const warp1Z = worldZ + Math.cos(worldX * 0.0004 + worldZ * 0.0001) * 1200.0;
        const warp2X = warp1X + Math.sin(warp1Z * 0.002) * 300.0;
        const warp2Z = warp1Z + Math.cos(warp1X * 0.002) * 300.0;
        
        let h = 0;
        let n1 = Math.sin(warp2X * 0.00035 + Math.cos(warp2Z * 0.0002) * 2.0);
        let ridge1 = Math.pow(1.0 - Math.abs(n1), 4.0);
        const mask = Math.abs(Math.sin(worldX * 0.0001) * Math.cos(worldZ * 0.00015));
        h += ridge1 * 1800.0 * (0.3 + mask * 1.2);
        
        let n2 = Math.sin(warp2Z * 0.0008 - warp2X * 0.0004);
        let ridge2 = 1.0 - Math.abs(n2);
        h += ridge2 * 600.0 * (0.2 + Math.abs(Math.sin(worldX * 0.0002)) * 0.8);
        
        const rippleAngle = Math.sin(worldX * 0.0001 + worldZ * 0.0001) * Math.PI;
        const rx = worldX * Math.cos(rippleAngle) - worldZ * Math.sin(rippleAngle);
        h += Math.sin(rx * 0.025) * 12.0 * ridge1;
        
        h += (Math.sin(worldX * 0.005) * Math.cos(worldZ * 0.005)) * 40.0;
        return h - 500.0;
    }

    createTerrain() {
        const size = 30000; 
        const segments = 512; 
        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
        geometry.rotateX(-Math.PI / 2);

        const material = new THREE.MeshStandardMaterial({
            color: 0xc2a278, 
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.DoubleSide
        });

        material.onBeforeCompile = (shader) => {
            shader.vertexShader = `
                varying float vHeight;
                
                float getRidge(vec2 p) {
                    vec2 w1 = p + vec2(sin(p.y * 0.0004 + p.x * 0.0001), cos(p.x * 0.0004 + p.y * 0.0001)) * 1200.0;
                    vec2 w2 = w1 + vec2(sin(w1.y * 0.002), cos(w1.x * 0.002)) * 300.0;
                    float n1 = sin(w2.x * 0.00035 + cos(w2.y * 0.0002) * 2.0);
                    float r1 = pow(1.0 - abs(n1), 4.0);
                    float mask = abs(sin(p.x * 0.0001) * cos(p.y * 0.00015));
                    float h = r1 * 1800.0 * (0.3 + mask * 1.2);
                    float n2 = sin(w2.y * 0.0008 - w2.x * 0.0004);
                    float r2 = 1.0 - abs(n2);
                    h += r2 * 600.0 * (0.2 + abs(sin(p.x * 0.0002)) * 0.8);
                    float rippleAngle = sin(p.x * 0.0001 + p.y * 0.0001) * 3.14159;
                    float rx = p.x * cos(rippleAngle) - p.y * sin(rippleAngle);
                    h += sin(rx * 0.025) * 12.0 * r1;
                    h += (sin(p.x * 0.005) * cos(p.y * 0.005)) * 40.0;
                    return h - 500.0;
                }
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <beginnormal_vertex>',
                `
                #include <beginnormal_vertex>
                float delta = 1.0;
                vec4 wPos = modelMatrix * vec4(position, 1.0);
                float h0 = getRidge(wPos.xz);
                float h1 = getRidge(wPos.xz + vec2(delta, 0.0));
                float h2 = getRidge(wPos.xz + vec2(0.0, delta));
                vec3 v1 = vec3(delta, h1 - h0, 0.0);
                vec3 v2 = vec3(0.0, h2 - h0, delta);
                objectNormal = normalize(cross(v2, v1));
                `
            );

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                transformed.y = getRidge(wPos.xz);
                vHeight = transformed.y;
                `
            );
            this.terrainMaterial = shader;
        };

        this.terrain = new THREE.Mesh(geometry, material);
        this.terrain.receiveShadow = true;
        this.terrain.castShadow = true;
        this.scene.add(this.terrain);
        this.scene.fog = new THREE.FogExp2(0xffaa88, 0.00006);
    }

    updateCamera() {
        if (this.cameraParticles[this.currentCameraIndex]) {
            const cp = this.cameraParticles[this.currentCameraIndex];
            const basePos = cp.getPosition();
            const terrainH = this.getTerrainHeight(basePos.x, basePos.z);
            const walkingHeight = 250; 
            const targetY = terrainH + walkingHeight;
            this.camera.position.x = basePos.x;
            this.camera.position.y += (targetY - this.camera.position.y) * 0.1;
            this.camera.position.z = basePos.z;
            const lookAtTarget = new THREE.Vector3(basePos.x, targetY * 0.8, basePos.z - 1000);
            this.camera.lookAt(lookAtTarget);
            this.camera.updateMatrixWorld();
        }
    }

    initPostProcessing() {
        if (!this.composer) {
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
        }
        this.initChromaticAberration();
        if (this.useBloom) {
            this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 4, window.innerHeight / 4), 0.2, 0.1, 1.0);
            this.composer.addPass(this.bloomPass);
        }
        if (this.useDOF) {
            this.initDOF({ focus: 1000, aperture: 0.000005, maxblur: 0.005 });
        }
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;
        if (this.cameraParticles[this.currentCameraIndex]) {
            const cp = this.cameraParticles[this.currentCameraIndex];
            cp.position.z -= this.moveSpeed * deltaTime;
        }
        if (this.terrain) {
            const gridSize = 30000 / 512;
            const snapX = Math.floor(this.camera.position.x / gridSize) * gridSize;
            const snapZ = Math.floor(this.camera.position.z / gridSize) * gridSize;
            this.terrain.position.set(snapX, 0, snapZ);
        }
        this.updateCamera();
        this.updateAutoFocus();
        if (this.skydome) this.skydome.position.copy(this.camera.position);
    }

    updateAutoFocus() {
        if (!this.useDOF || !this.bokehPass || !this.terrain) return;
        super.updateAutoFocus([this.terrain]);
    }

    dispose() {
        this.initialized = false;
        if (this.skydome) {
            this.scene.remove(this.skydome);
            this.skydome.geometry.dispose();
            this.skydome.material.dispose();
            this.skydome = null;
        }
        if (this.terrain) {
            this.scene.remove(this.terrain);
            this.terrain.geometry.dispose();
            this.terrain.material.dispose();
            this.terrain = null;
        }
        this.scene.fog = null;
        super.dispose();
    }
}
