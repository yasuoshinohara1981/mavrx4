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
        this.tentacleCount = 250; 
        this.tentacles = [];
        this.tentacleGroup = new THREE.Group();
        this.coreMesh = null; // 真ん中の球体

        // 意志（State Machine）の設定
        this.STATE_IDLE = 0;    // 穏やかなうごめき
        this.STATE_WILD = 1;    // 狂乱ののたうち回り
        this.STATE_FOCUS = 2;   // 一斉に一点を凝視（威嚇・注視）
        this.STATE_STASIS = 3;  // 完全に静止（死んだふり・警戒）
        
        this.creatureState = this.STATE_IDLE;
        this.stateTimer = 0;
        this.stateDuration = 5.0;
        this.focusTarget = new THREE.Vector3(0, 500, 1000); // 注視点
        
        // なだらかな遷移のためのパラメータ
        this.currentAnimParams = {
            speed: 1.0,
            waveFreq: 2.0,
            waveAmp: 30.0,
            focusWeight: 0.0,
            moveSpeed: 0.3,
            distortionSpeed: 1.2,
            distortionAmp: 0.25
        };
        this.targetAnimParams = { ...this.currentAnimParams };

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

    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 400;
        cameraParticle.maxDistance = 5000;
        cameraParticle.minY = -400;
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

    createTentacles() {
        const textures = this.generateFleshTextures();
        this.scene.add(this.tentacleGroup);
        const tentacleCount = 250; 
        const baseRadius = 150; 

        const coreGeo = new THREE.IcosahedronGeometry(baseRadius, 6);
        coreGeo.userData.initialPositions = coreGeo.attributes.position.array.slice();
        const coreMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, map: textures.map, bumpMap: textures.bumpMap,
            bumpScale: 8.0, metalness: 0.0, roughness: 0.1
        });
        this.coreMesh = new THREE.Mesh(coreGeo, coreMat);
        this.coreMesh.castShadow = true;
        this.coreMesh.receiveShadow = true;
        this.tentacleGroup.add(this.coreMesh);

        for (let i = 0; i < tentacleCount; i++) {
            const segments = 30;
            const points = [];
            const phi = Math.random() * Math.PI * 2;
            const theta = Math.random() * Math.PI;
            const baseThickness = 5 + Math.pow(Math.random(), 2.0) * 35;
            const r = baseRadius + 450;

            // 最初から曲がったパスを作る
            points.push(new THREE.Vector3(0,0,0));
            const midDist = baseRadius + 225;
            const midPoint = new THREE.Vector3(
                midDist * Math.sin(theta + (Math.random()-0.5)*0.8) * Math.cos(phi + (Math.random()-0.5)*0.8),
                midDist * Math.cos(theta + (Math.random()-0.5)*0.8),
                midDist * Math.sin(theta + (Math.random()-0.5)*0.8) * Math.sin(phi + (Math.random()-0.5)*0.8)
            );
            points.push(midPoint);
            points.push(new THREE.Vector3(
                r * Math.sin(theta) * Math.cos(phi),
                r * Math.cos(theta),
                r * Math.sin(theta) * Math.sin(phi)
            ));
            
            const curve = new THREE.CatmullRomCurve3(points);
            const geometry = new THREE.TubeGeometry(curve, 64, baseThickness, 12, false);
            
            const posAttr = geometry.attributes.position;
            const vertex = new THREE.Vector3();
            for (let s = 0; s <= 64; s++) {
                const t = s / 64;
                const taperScale = Math.max(0.01, 1.0 - Math.pow(t, 1.5)); 
                const pathPoint = curve.getPointAt(t);
                for (let rIdx = 0; rIdx <= 12; rIdx++) {
                    const idx = s * 13 + rIdx;
                    vertex.fromBufferAttribute(posAttr, idx);
                    vertex.sub(pathPoint).multiplyScalar(taperScale).add(pathPoint);
                    posAttr.setXYZ(idx, vertex.x, vertex.y, vertex.z);
                }
            }
            const basePositions = geometry.attributes.position.array.slice();
            const mesh = this.createTentacleMesh(geometry, textures);
            this.tentacleGroup.add(mesh);
            this.tentacles.push({ mesh, curve, basePositions, phi, theta, baseRadius, baseThickness });
        }
        this.tentacleGroup.position.set(0, 200, 0);
        this.setParticleCount(this.tentacles.length);
    }

    createTentacleMesh(geometry, textures) {
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff, map: textures.map, bumpMap: textures.bumpMap,
            bumpScale: 10.0, metalness: 0.0, roughness: 0.1, envMapIntensity: 1.0
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true; mesh.receiveShadow = true;
        return mesh;
    }

    generateFleshTextures() {
        const size = 512;
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size; colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');
        cCtx.fillStyle = '#ff88aa'; cCtx.fillRect(0, 0, size, size);
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * size; const y = Math.random() * size;
            const r = 50 + Math.random() * 100;
            const grad = cCtx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(255, 100, 150, 0.4)'); grad.addColorStop(1, 'rgba(255, 136, 170, 0)');
            cCtx.fillStyle = grad; cCtx.fillRect(0, 0, size, size);
        }
        cCtx.strokeStyle = 'rgba(150, 0, 50, 0.6)';
        for (let i = 0; i < 80; i++) {
            cCtx.lineWidth = 0.5 + Math.random() * 2.0;
            let x = Math.random() * size; let y = Math.random() * size;
            cCtx.beginPath(); cCtx.moveTo(x, y);
            for (let j = 0; j < 10; j++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; cCtx.lineTo(x, y); }
            cCtx.stroke();
        }
        for (let i = 0; i < 40; i++) {
            const x = Math.random() * size; const y = Math.random() * size; const r = 8 + Math.random() * 15;
            cCtx.fillStyle = '#cc4477'; cCtx.beginPath(); cCtx.arc(x, y, r, 0, Math.PI * 2); cCtx.fill();
            cCtx.fillStyle = '#ffccdd'; cCtx.beginPath(); cCtx.arc(x, y, r * 0.7, 0, Math.PI * 2); cCtx.fill();
        }
        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size; bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');
        bCtx.fillStyle = '#808080'; bCtx.fillRect(0, 0, size, size);
        for (let i = 0; i < 40; i++) {
            const x = Math.random() * size; const y = Math.random() * size; const r = 12 + Math.random() * 12;
            const grad = bCtx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.7, '#bbbbbb'); grad.addColorStop(1, '#808080');
            bCtx.fillStyle = grad; bCtx.beginPath(); bCtx.arc(x, y, r, 0, Math.PI * 2); bCtx.fill();
        }
        return { map: new THREE.CanvasTexture(colorCanvas), bumpMap: new THREE.CanvasTexture(bumpCanvas) };
    }

    initPostProcessing() {
        if (!this.composer) {
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
        }
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 4, window.innerHeight / 4), 0.2, 0.1, 1.2);
        this.composer.addPass(this.bloomPass);
        this.bokehPass = new BokehPass(this.scene, this.camera, { focus: 1500, aperture: 0.00001, maxblur: 0.005, width: window.innerWidth, height: window.innerHeight });
        this.composer.addPass(this.bokehPass);
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;
        this.stateTimer += deltaTime;
        if (this.stateTimer >= this.stateDuration) {
            this.stateTimer = 0;
            this.creatureState = Math.floor(Math.random() * 4);
            this.stateDuration = 6.0 + Math.random() * 8.0;
            if (this.creatureState === this.STATE_FOCUS) {
                this.focusTarget.copy(this.camera.position).add(new THREE.Vector3((Math.random()-0.5)*1000, (Math.random()-0.5)*500, (Math.random()-0.5)*1000));
            }
            switch(this.creatureState) {
                case this.STATE_IDLE: this.targetAnimParams = { speed: 0.8, waveFreq: 1.5, waveAmp: 40.0, focusWeight: 0.0, moveSpeed: 0.2, distortionSpeed: 0.8, distortionAmp: 0.15 }; break;
                case this.STATE_WILD: this.targetAnimParams = { speed: 3.0, waveFreq: 4.0, waveAmp: 100.0, focusWeight: 0.0, moveSpeed: 0.5, distortionSpeed: 2.0, distortionAmp: 0.4 }; break;
                case this.STATE_FOCUS: this.targetAnimParams = { speed: 0.5, waveFreq: 1.0, waveAmp: 20.0, focusWeight: 0.6, moveSpeed: 0.1, distortionSpeed: 0.5, distortionAmp: 0.1 }; break;
                case this.STATE_STASIS: this.targetAnimParams = { speed: 0.05, waveFreq: 0.2, waveAmp: 5.0, focusWeight: 0.0, moveSpeed: 0.02, distortionSpeed: 0.1, distortionAmp: 0.05 }; break;
            }
        }
        const lerpFactor = deltaTime * 1.5;
        for (let key in this.currentAnimParams) { this.currentAnimParams[key] += (this.targetAnimParams[key] - this.currentAnimParams[key]) * lerpFactor; }
        const heartbeat = Math.pow(Math.sin(this.time * 2.0), 8.0);
        const scale = 1.0 + heartbeat * 0.05;
        this.tentacleGroup.scale.set(scale, scale, scale);
        const rotationSpeed = this.creatureState === this.STATE_FOCUS ? 0.05 : 0.2;
        this.tentacleGroup.rotation.y += deltaTime * rotationSpeed;
        this.tentacleGroup.rotation.x += deltaTime * (rotationSpeed * 0.3);
        if (this.coreMesh) {
            this.coreMesh.rotation.y += deltaTime * 0.15;
            const corePosAttr = this.coreMesh.geometry.attributes.position;
            const initialPos = this.coreMesh.geometry.userData.initialPositions;
            const v = new THREE.Vector3();
            const { distortionSpeed, distortionAmp } = this.currentAnimParams;
            for (let i = 0; i < corePosAttr.count; i++) {
                v.set(initialPos[i * 3], initialPos[i * 3 + 1], initialPos[i * 3 + 2]);
                const noise = 1.0 + (Math.sin(v.x * 0.015 + this.time * distortionSpeed) + Math.cos(v.y * 0.015 + this.time * distortionSpeed * 0.8) + Math.sin(v.z * 0.015 + this.time * distortionSpeed * 1.1)) * distortionAmp;
                v.multiplyScalar(noise); corePosAttr.setXYZ(i, v.x, v.y, v.z);
            }
            corePosAttr.needsUpdate = true; this.coreMesh.geometry.computeVertexNormals();
        }
        this.tentacles.forEach((t, i) => {
            const posAttr = t.mesh.geometry.attributes.position;
            const { speed, waveFreq, waveAmp, focusWeight, moveSpeed } = this.currentAnimParams;
            const angleOffsetPhi = Math.sin(this.time * moveSpeed + i) * 0.15;
            const angleOffsetTheta = Math.cos(this.time * moveSpeed * 0.8 + i * 1.5) * 0.15;
            t.mesh.rotation.set(angleOffsetTheta, angleOffsetPhi, 0);
            const focusVec = new THREE.Vector3();
            if (focusWeight > 0) { focusVec.copy(this.focusTarget).sub(this.tentacleGroup.position).applyQuaternion(this.tentacleGroup.quaternion.clone().invert()).normalize(); }
            for (let s = 0; s <= 64; s++) {
                const u = s / 64; const time = this.time * speed; const phase = u * waveFreq + i * 2.0;
                let offsetX = (Math.sin(time + phase) * 1.0 + Math.sin(time * 2.3 + phase * 1.5) * 0.4) * waveAmp * u;
                let offsetY = (Math.cos(time * 0.8 + phase * 1.2 + i) * 1.0 + Math.cos(time * 3.1 + phase * 2.2) * 0.3) * waveAmp * u;
                let offsetZ = (Math.sin(time * 1.2 + phase * 0.8 + i * 1.5) * 1.0 + Math.sin(time * 2.7 + phase * 1.7) * 0.4) * waveAmp * u;
                if (focusWeight > 0) {
                    const focusStrength = u * 250.0 * focusWeight;
                    offsetX = offsetX * (1.0 - focusWeight * 0.5) + focusVec.x * focusStrength;
                    offsetY = offsetY * (1.0 - focusWeight * 0.5) + focusVec.y * focusStrength;
                    offsetZ = offsetZ * (1.0 - focusWeight * 0.5) + focusVec.z * focusStrength;
                }
                const intensity = Math.pow(u, 1.1);
                for (let rIdx = 0; rIdx <= 12; rIdx++) {
                    const idx = s * 13 + rIdx;
                    const bx = t.basePositions[idx * 3 + 0]; const by = t.basePositions[idx * 3 + 1]; const bz = t.basePositions[idx * 3 + 2];
                    posAttr.setXYZ(idx, bx + offsetX * intensity, by + offsetY * intensity, bz + offsetZ * intensity);
                }
            }
            posAttr.needsUpdate = true; t.mesh.geometry.computeVertexNormals();
        });
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
        this.tentacles.forEach(t => { if (t.mesh.geometry) t.mesh.geometry.dispose(); if (t.mesh.material) t.mesh.material.dispose(); });
        this.tentacles = []; this.scene.remove(this.tentacleGroup);
        if (this.bokehPass) { if (this.composer) { const idx = this.composer.passes.indexOf(this.bokehPass); if (idx !== -1) this.composer.passes.splice(idx, 1); } this.bokehPass.enabled = false; }
        if (this.bloomPass) { if (this.composer) { const idx = this.composer.passes.indexOf(this.bloomPass); if (idx !== -1) this.composer.passes.splice(idx, 1); } this.bloomPass.enabled = false; }
        super.dispose();
    }
}
