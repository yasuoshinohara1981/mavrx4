/**
 * Scene15: GPU Vertex Displacement Mesh
 * 1つの巨大な球体をGPUで変形させつつ、Scene14の金属質感を継承
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { LFO } from '../../lib/LFO.js';
import { RandomLFO } from '../../lib/RandomLFO.js';
import { StudioBox } from '../../lib/StudioBox.js';
import { Scene15Particle } from './Scene15Particle.js';

export class Scene15 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'Scene15: Metal Blob';
        this.initialized = false;
        
        // 共有リソースマネージャー
        this.sharedResourceManager = sharedResourceManager;
        
        // レイキャスター（オートフォーカス用）
        this.raycaster = new THREE.Raycaster();
        
        // メインメッシュ
        this.mainMesh = null;
        this.material = null;
        this.fluorescentLights = [];
        
        // ノイズパラメータとランダムLFO
        this.noiseScale = 1.0;
        this.noiseStrength = 50.0;
        this.noiseSpeed = 0.5;
        
        this.noiseScaleLFO = new RandomLFO(0.005, 0.02, 0.2, 1.5);
        this.noiseStrengthLFO = new RandomLFO(0.02, 0.1, 30.0, 100.0);
        
        // 圧力エフェクト管理
        this.pressurePoints = []; // 叩かれた地点
        this.pressureStrengths = []; // 各地点の強度
        for(let i=0; i<10; i++) {
            this.pressurePoints.push(new THREE.Vector3(0,0,0));
            this.pressureStrengths.push(0.0);
        }
        this.currentPressureIdx = 0;
        this.lastPressureTime = 0;
        this.lastPressurePoint = new THREE.Vector3(0, 1, 0);

        // 撮影用スタジオ
        this.studio = null;
        
        // エフェクト設定
        this.useDOF = true;
        this.useBloom = true; 
        this.showMainMesh = true; 
        this.bokehPass = null;
        this.bloomPass = null;

        // ストロボエフェクト管理
        this.strobeActive = false;
        this.strobeEndTime = 0;

        // レーザースキャンエフェクト管理
        this.scanners = [];

        // 全てのエフェクトをデフォルトでオフに設定
        this.trackEffects = {
            1: false, // カメラランダマイズ
            2: false, // 色反転
            3: false, // 色収差
            4: false, // グリッチ
            5: false,
            6: false,
            7: false,
            8: false,
            9: false
        };

        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
    }

    /**
     * 初期セットアップ
     */
    async setup() {
        if (this.initialized) return;
        await super.setup();

        this.camera.position.set(0, 500, 1500);
        this.camera.lookAt(0, 200, 0);

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.showGridRuler3D = true;
        this.initGridRuler3D({
            center: { x: 0, y: 0, z: 0 },
            size: { x: 5000, y: 5000, z: 5000 },
            floorY: -498, 
            floorSize: 10000,
            floorDivisions: 100,
            labelMax: 256,
            color: 0xffffff,
            opacity: 0.8 
        });

        this.setupLights();
        this.createStudioBox();
        this.createDeformableMesh();
        this.createFluorescentLights();
        this.initPostProcessing();
        this.initialized = true;
    }

    setupLights() {
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x888888, 0.8);
        this.scene.add(hemiLight);
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambientLight);

        const genEnvMap = () => {
            const size = 512;
            const canvas = document.createElement('canvas');
            canvas.width = size; canvas.height = size;
            const ctx = canvas.getContext('2d');
            const grad = ctx.createLinearGradient(0, 0, 0, size);
            grad.addColorStop(0, '#ffffff'); 
            grad.addColorStop(0.5, '#888888'); 
            grad.addColorStop(1, '#444444'); 
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, size, size);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(size * 0.1, size * 0.1, size * 0.2, size * 0.6); 
            ctx.fillRect(size * 0.6, size * 0.3, size * 0.3, size * 0.2);
            const tex = new THREE.CanvasTexture(canvas);
            tex.mapping = THREE.EquirectangularReflectionMapping;
            return tex;
        };
        const envMap = genEnvMap();
        this.scene.environment = envMap; 

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
        this.studio = new StudioBox(this.scene, {
            size: 10000,
            color: 0xbbbbbb,
            roughness: 0.8,
            metalness: 0.0,
            bumpScale: 2.5
        });
    }

    createDeformableMesh() {
        const geometry = new THREE.IcosahedronGeometry(400, 128); 
        const noiseShaderChunk = `
            uniform float uTime;
            uniform float uNoiseScale;
            uniform float uNoiseStrength;
            uniform vec3 uPressurePoints[10];
            uniform float uPressureStrengths[10];
            varying float vNoise;
            varying float vPressure;

            vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
            float permute(float x){return mod(((x*34.0)+1.0)*x, 289.0);}
            vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
            float taylorInvSqrt(float r){return 1.79284291400159 - 0.85373472095314 * r;}

            vec4 grad4(float j, vec4 ip){
              const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
              vec4 p, s;
              p.xyz = floor( fract (vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
              p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
              s = vec4(lessThan(p, vec4(0.0)));
              p.xyz = p.xyz + (s.xyz*2.0 - 1.0) * s.www; 
              return p;
            }

            float snoise(vec4 v){
              const vec2  C = vec2( 0.138196601125010504, 0.309016994374947451);
              vec4 i  = floor(v + dot(v, C.yyyy) );
              vec4 x0 = v -   i + dot(i, C.xxxx) ;
              vec4 i0;
              vec3 isX = step( x0.yzw, x0.xxx );
              vec3 isY = step( x0.zwx, x0.yyy );
              vec3 isZ = step( x0.wxy, x0.zzz );
              i0.x = isX.x + isX.y + isX.z;
              i0.yzw = 1.0 - isX;
              i0.y += isY.x + isY.y;
              i0.zw += 1.0 - isY.xy;
              i0.z += isZ.x;
              i0.w += 1.0 - isZ.x;
              vec4 i3 = clamp( i0, 0.0, 1.0 );
              vec4 i2 = clamp( i0-1.0, 0.0, 1.0 );
              vec4 i1 = clamp( i0-2.0, 0.0, 1.0 );
              vec4 x1 = x0 - i1 + 1.0 * C.xxxx;
              vec4 x2 = x0 - i2 + 2.0 * C.xxxx;
              vec4 x3 = x0 - i3 + 3.0 * C.xxxx;
              vec4 x4 = x0 - 1.0 + 4.0 * C.xxxx;
              i = mod(i, 289.0); 
              float j0 = permute( permute( permute( permute(i.w) + i.z) + i.y) + i.x);
              vec4 j1 = permute( permute( permute( permute (i.w + vec4(i1.w, i2.w, i3.w, 1.0)) + i.z + vec4(i1.z, i2.z, i3.z, 1.0)) + i.y + vec4(i1.y, i2.y, i3.y, 1.0)) + i.x + vec4(i1.x, i2.x, i3.x, 1.0));
              vec4 ip = vec4(1.0/294.0, 1.0/49.0, 1.0/7.0, 0.0) ;
              vec4 p0 = grad4(j0,   ip);
              vec4 p1 = grad4(j1.x, ip);
              vec4 p2 = grad4(j1.y, ip);
              vec4 p3 = grad4(j1.z, ip);
              vec4 p4 = grad4(j1.w, ip);
              vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
              p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
              p4 *= taylorInvSqrt(dot(p4,p4));
              vec3 m0 = max(0.6 - vec3(dot(x0,x0), dot(x1,x1), dot(x2,x2)), 0.0);
              vec2 m1 = max(0.6 - vec2(dot(x3,x3), dot(x4,x4)), 0.0);
              m0 = m0 * m0; m1 = m1 * m1;
              return 49.0 * ( dot(m0*m0, vec3(dot(p0,x0), dot(p1,x1), dot(p2,x2))) + dot(m1*m1, vec2(dot(p3,x3), dot(p4,x4))) ) ;
            }
        `;

        const vertexDisplacementChunk = `
            vec3 nPos = normalize(position);
            float latitude = asin(nPos.y);
            float longitude = atan(nPos.z, nPos.x);
            float noiseValue = snoise(vec4(latitude * uNoiseScale, sin(longitude) * uNoiseScale, cos(longitude) * uNoiseScale, uTime * uNoiseScale * 0.1));
            vNoise = noiseValue;
            float totalPressure = 0.0;
            for(int i = 0; i < 10; i++) {
                float d = distance(nPos, normalize(uPressurePoints[i]));
                totalPressure += smoothstep(0.8, 0.0, d) * uPressureStrengths[i];
            }
            vPressure = totalPressure;
            vec3 transformed = position + normal * (noiseValue * uNoiseStrength - totalPressure);
        `;

        this.material = new THREE.MeshPhysicalMaterial({ color: 0x555555, metalness: 0.9, roughness: 0.1, envMapIntensity: 1.0 });
        this.material.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = { value: 0 };
            shader.uniforms.uNoiseScale = { value: this.noiseScale };
            shader.uniforms.uNoiseStrength = { value: this.noiseStrength };
            shader.uniforms.uPressurePoints = { value: this.pressurePoints };
            shader.uniforms.uPressureStrengths = { value: this.pressureStrengths };
            shader.vertexShader = noiseShaderChunk + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', vertexDisplacementChunk);
            this.material.userData.shader = shader;
        };

        const depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
        depthMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = { value: 0 };
            shader.uniforms.uNoiseScale = { value: this.noiseScale };
            shader.uniforms.uNoiseStrength = { value: this.noiseStrength };
            shader.uniforms.uPressurePoints = { value: this.pressurePoints };
            shader.uniforms.uPressureStrengths = { value: this.pressureStrengths };
            shader.vertexShader = noiseShaderChunk + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', vertexDisplacementChunk);
            depthMaterial.userData.shader = shader;
        };

        this.mainMesh = new THREE.Mesh(geometry, this.material);
        this.mainMesh.customDepthMaterial = depthMaterial;
        this.mainMesh.position.y = 400;
        this.mainMesh.castShadow = true;
        this.mainMesh.receiveShadow = true;
        this.scene.add(this.mainMesh);
    }

    createFluorescentLights() {
        const lightHeight = 5000; const lightRadius = 5; const cornerDist = 4500; 
        const geometry = new THREE.CylinderGeometry(lightRadius, lightRadius, lightHeight, 16);
        const material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 40.0, envMapIntensity: 1.0 });
        const positions = [[cornerDist, 500, cornerDist], [-cornerDist, 500, cornerDist], [cornerDist, 500, -cornerDist], [-cornerDist, 500, -cornerDist]];
        positions.forEach(pos => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(pos[0], pos[1], pos[2]);
            this.scene.add(mesh);
            this.fluorescentLights.push(mesh);
            const pointLight = new THREE.PointLight(0xffffff, 1.5, 5000);
            pointLight.position.set(pos[0], pos[1], pos[2]);
            this.scene.add(pointLight);
        });
    }

    generateFleshTextures() {
        const size = 512;
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size; colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');
        cCtx.fillStyle = '#aaaaaa'; cCtx.fillRect(0, 0, size, size);
        const map = new THREE.CanvasTexture(colorCanvas);
        const bumpMap = new THREE.CanvasTexture(colorCanvas);
        return { map, bumpMap };
    }

    initPostProcessing() {
        if (!this.composer) {
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
        }
        if (this.useBloom) {
            this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.2, 0.1, 1.2);
            this.composer.addPass(this.bloomPass);
        }
        if (this.useDOF) {
            this.bokehPass = new BokehPass(this.scene, this.camera, { focus: 500, aperture: 0.000005, maxblur: 0.003, width: window.innerWidth, height: window.innerHeight });
            this.composer.addPass(this.bokehPass);
        }
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        for(let i=0; i<10; i++) this.pressureStrengths[i] *= 0.98; // じわじわ戻る
        if (this.mainMesh) this.mainMesh.visible = this.showMainMesh;
        if (this.strobeActive) {
            if (Date.now() > this.strobeEndTime) { this.strobeActive = false; this.backgroundWhite = false; }
            else this.backgroundWhite = Math.floor(performance.now() / 32) % 2 === 0;
        }
        if (this.noiseScaleLFO) this.noiseScaleLFO.update(deltaTime);
        if (this.noiseStrengthLFO) this.noiseStrengthLFO.update(deltaTime);
        this.noiseScale = this.noiseScaleLFO ? this.noiseScaleLFO.getValue() : 1.0;
        this.noiseStrength = this.noiseStrengthLFO ? this.noiseStrengthLFO.getValue() : 50.0;
        this.time += deltaTime * this.noiseSpeed;
        const s = this.material?.userData?.shader;
        if (s) {
            s.uniforms.uTime.value = this.time;
            s.uniforms.uNoiseScale.value = this.noiseScale;
            s.uniforms.uNoiseStrength.value = this.noiseStrength;
            s.uniforms.uPressurePoints.value = this.pressurePoints;
            s.uniforms.uPressureStrengths.value = this.pressureStrengths;
        }
        const ds = this.mainMesh?.customDepthMaterial?.userData?.shader;
        if (ds) {
            ds.uniforms.uTime.value = this.time;
            ds.uniforms.uNoiseScale.value = this.noiseScale;
            ds.uniforms.uNoiseStrength.value = this.noiseStrength;
            ds.uniforms.uPressurePoints.value = this.pressurePoints;
            ds.uniforms.uPressureStrengths.value = this.pressureStrengths;
        }
        this.updateScanners(deltaTime);
        if (this.mainMesh?.geometry) this.setParticleCount(this.mainMesh.geometry.attributes.position.count);
        this.updateAutoFocus();
    }

    updateScanners(deltaTime) {
        const now = Date.now();
        for (let i = this.scanners.length - 1; i >= 0; i--) {
            const s = this.scanners[i];
            const progress = (now - s.startTime) / s.duration;
            if (progress >= 1.0) { this.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); this.scanners.splice(i, 1); }
            else { s.mesh.position.y = -500 + progress * 5000; s.mesh.material.opacity = Math.sin(progress * Math.PI) * 0.8; }
        }
    }

    triggerScanner(durationMs = 2000, velocity = 127) {
        const ringRadius = 500 + (velocity / 127.0) * 1000;
        const geometry = new THREE.TorusGeometry(ringRadius, 20, 16, 100); geometry.rotateX(Math.PI / 2);
        const material = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 10.0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
        const mesh = new THREE.Mesh(geometry, material); mesh.position.set(0, -500, 0); mesh.renderOrder = 100;
        this.scene.add(mesh);
        this.scanners.push({ mesh, startTime: Date.now(), duration: durationMs });
    }

    handleOSC(message) {
        if (message.trackNumber === 2) { this.handleTrackNumber(2, message); return; }
        super.handleOSC(message);
    }

    handleTrackNumber(trackNumber, message) {
        if (trackNumber === 2) {
            const args = message.args || [];
            const durationMs = (args.length >= 3) ? args[2] : 500;
            this.strobeActive = true; this.strobeEndTime = Date.now() + durationMs;
        }
        if (trackNumber === 5) {
            const args = message.args || [];
            const velocity = args[1] !== undefined ? args[1] : 127;
            const durationMs = (args.length >= 3) ? args[2] : 2000;
            this.triggerScanner(durationMs, velocity);
        }
        if (trackNumber === 6) {
            const args = message.args || [];
            const velocity = args[1] !== undefined ? args[1] : 127;
            const now = Date.now();
            const timeDiff = now - this.lastPressureTime;
            this.lastPressureTime = now;
            const spreadFactor = Math.max(0.0, 1.0 - (timeDiff / 2000.0));
            const newPoint = new THREE.Vector3();
            if (spreadFactor > 0.8) {
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI;
                newPoint.set(Math.sin(phi)*Math.cos(theta), Math.cos(phi), Math.sin(phi)*Math.sin(theta));
            } else {
                const randomOffset = new THREE.Vector3((Math.random()-0.5)*spreadFactor*2.0, (Math.random()-0.5)*spreadFactor*2.0, (Math.random()-0.5)*spreadFactor*2.0);
                newPoint.copy(this.lastPressurePoint).add(randomOffset).normalize();
            }
            this.lastPressurePoint.copy(newPoint);
            this.pressurePoints[this.currentPressureIdx].copy(newPoint);
            this.pressureStrengths[this.currentPressureIdx] = (velocity / 127.0) * 200.0;
            this.currentPressureIdx = (this.currentPressureIdx + 1) % 10;
        }
    }

    updateAutoFocus() {
        if (!this.useDOF || !this.bokehPass || !this.mainMesh) return;
        this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
        const intersects = this.raycaster.intersectObject(this.mainMesh);
        let targetDistance;
        if (intersects.length > 0) targetDistance = intersects[0].distance;
        else {
            const targetVec = new THREE.Vector3(0, 0, -1);
            targetVec.applyQuaternion(this.camera.quaternion);
            targetDistance = Math.max(100, (new THREE.Vector3(0, 400, 0).sub(this.camera.position)).dot(targetVec));
        }
        const currentFocus = this.bokehPass.uniforms.focus.value;
        this.bokehPass.uniforms.focus.value = currentFocus + (targetDistance - currentFocus) * 0.1;
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
        if (this.mainMesh) {
            this.mainMesh.geometry.dispose();
            this.mainMesh.material.dispose();
            if (this.mainMesh.customDepthMaterial) this.mainMesh.customDepthMaterial.dispose();
        }
        this.fluorescentLights.forEach(light => { light.geometry.dispose(); light.material.dispose(); this.scene.remove(light); });
        this.fluorescentLights = [];
        this.scanners.forEach(s => { this.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); });
        this.scanners = [];
        super.dispose();
    }
}
