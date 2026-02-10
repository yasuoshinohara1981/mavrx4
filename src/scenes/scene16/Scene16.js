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
        this.STATE_IDLE = 0;    
        this.STATE_WILD = 1;    
        this.STATE_FOCUS = 2;   
        this.STATE_STASIS = 3;  
        
        this.creatureState = this.STATE_IDLE;
        this.stateTimer = 0;
        this.stateDuration = 5.0;
        this.focusTarget = new THREE.Vector3(0, 500, 1000); 
        
        // なだらかな遷移のためのパラメータ
        this.currentAnimParams = {
            speed: 1.0,
            waveFreq: 2.0,
            waveAmp: 30.0,
            focusWeight: 0.0,
            moveSpeed: 0.3,
            distortionSpeed: 1.2,
            distortionAmp: 0.8 
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

    /**
     * カメラ距離の徹底修正
     */
    setupCameraParticleDistance(cameraParticle) {
        // 距離をガッツリ離す（2500 -> 4000）
        cameraParticle.minDistance = 4000; 
        cameraParticle.maxDistance = 15000;
        cameraParticle.maxDistanceReset = 10000;
        cameraParticle.minY = -400;
        
        // 即座に位置を更新
        if (cameraParticle.initializePosition) {
            cameraParticle.initializePosition();
        }
    }

    async setup() {
        if (this.initialized) return;
        await super.setup();
        
        // 基底クラスのカメラ設定を上書き
        this.setupCameraParticleDistances();

        // 初期カメラ位置をさらに遠く（z=8000）
        this.camera.position.set(0, 2000, 8000); 
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
        // 環境光を1.0にして、影の範囲外が黒くなるのを物理的に防ぐ
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        directionalLight.position.set(2000, 5000, 2000);
        directionalLight.castShadow = true;
        
        // 影の範囲をクリーチャーの周辺に限定しつつ、十分な広さを確保
        const sSize = 8000; 
        directionalLight.shadow.camera.left = -sSize;
        directionalLight.shadow.camera.right = sSize;
        directionalLight.shadow.camera.top = sSize;
        directionalLight.shadow.camera.bottom = -sSize;
        directionalLight.shadow.camera.near = 100;
        directionalLight.shadow.camera.far = 20000;
        
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.radius = 5; 
        directionalLight.shadow.bias = -0.0005;
        
        this.scene.add(directionalLight);

        const pointLight = new THREE.PointLight(0xffffff, 1.5, 5000); 
        pointLight.position.set(0, 800, 0); 
        pointLight.castShadow = false; 
        this.scene.add(pointLight);
    }

    createStudioBox() {
        this.studio = new StudioBox(this.scene);
    }

    createTentacles() {
        const textures = this.generateFleshTextures();
        this.scene.add(this.tentacleGroup);
        const tentacleCount = 250; 
        const baseRadius = 600; // コアを巨大化

        this.time = Math.random() * 100;

        const coreGeo = new THREE.IcosahedronGeometry(baseRadius, 6);
        coreGeo.userData.initialPositions = coreGeo.attributes.position.array.slice();
        
        // 頂点カラー属性を初期化（確実に肌色にする）
        const coreColors = new Float32Array(coreGeo.attributes.position.count * 3);
        const skinColor = new THREE.Color('#ffccbb'); // 明るい肌色
        for(let i=0; i<coreColors.length/3; i++){
            coreColors[i*3] = skinColor.r;
            coreColors[i*3+1] = skinColor.g;
            coreColors[i*3+2] = skinColor.b;
        }
        coreGeo.setAttribute('color', new THREE.BufferAttribute(coreColors, 3));

        const coreMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, 
            map: textures.map, 
            bumpMap: textures.bumpMap,
            bumpScale: 15.0, 
            metalness: 0.0, 
            roughness: 0.2, 
            vertexColors: true,
            emissive: 0x000000,
            transparent: false
        });
        this.coreMesh = new THREE.Mesh(coreGeo, coreMat);
        this.coreMesh.castShadow = true;
        this.coreMesh.receiveShadow = true;
        this.tentacleGroup.add(this.coreMesh);

        for (let i = 0; i < tentacleCount; i++) {
            const segments = 30;
            const points = [];
            
            // 生える場所を極端に偏らせる
            const clusterSeed = Math.floor(i / 20); 
            const clusterPhi = (Math.sin(clusterSeed * 1.8) * 0.5 + 0.5) * Math.PI * 2;
            const clusterTheta = (Math.cos(clusterSeed * 2.5) * 0.5 + 0.5) * Math.PI;
            
            const phi = clusterPhi + (Math.random() - 0.5) * 1.2;
            const theta = clusterTheta + (Math.random() - 0.5) * 1.2;

            const baseThickness = 15 + Math.pow(Math.random(), 2.0) * 100; // さらに太く！
            const r = baseRadius + 800;

            points.push(new THREE.Vector3(0,0,0));
            const midDist = baseRadius + 400;
            const midPoint = new THREE.Vector3(
                midDist * Math.sin(theta + (Math.random()-0.5)*1.5) * Math.cos(phi + (Math.random()-0.5)*1.5),
                midDist * Math.cos(theta + (Math.random()-0.5)*1.5),
                midDist * Math.sin(theta + (Math.random()-0.5)*1.5) * Math.sin(phi + (Math.random()-0.5)*1.5)
            );
            points.push(midPoint);
            points.push(new THREE.Vector3(
                r * Math.sin(theta) * Math.cos(phi),
                r * Math.cos(theta),
                r * Math.sin(theta) * Math.sin(phi)
            ));
            
            const curve = new THREE.CatmullRomCurve3(points);
            const geometry = new THREE.TubeGeometry(curve, 64, baseThickness, 12, false);
            
            const tentacleColors = new Float32Array(geometry.attributes.position.count * 3);
            for(let j=0; j<tentacleColors.length/3; j++){
                tentacleColors[j*3] = skinColor.r;
                tentacleColors[j*3+1] = skinColor.g;
                tentacleColors[j*3+2] = skinColor.b;
            }
            geometry.setAttribute('color', new THREE.BufferAttribute(tentacleColors, 3));

            const posAttr = geometry.attributes.position;
            const vertex = new THREE.Vector3();
            for (let s = 0; s <= 64; s++) {
                const t = s / 64;
                const taperScale = Math.max(0.01, 1.0 - Math.pow(t, 1.5)); 
                const pathPoint = curve.getPointAt(t);
                for (let rIdx = 0; rIdx <= 12; rIdx++) {
                    const idx = s * 13 + rIdx;
                    if (idx < posAttr.count) {
                        vertex.fromBufferAttribute(posAttr, idx);
                        vertex.sub(pathPoint).multiplyScalar(taperScale).add(pathPoint);
                        posAttr.setXYZ(idx, vertex.x, vertex.y, vertex.z);
                    }
                }
            }
            const basePositions = geometry.attributes.position.array.slice();
            const mesh = this.createTentacleMesh(geometry, textures);
            this.tentacleGroup.add(mesh);
            this.tentacles.push({ mesh, curve, basePositions, phi, theta, baseRadius, baseThickness });
        }
        this.tentacleGroup.position.set(0, 800, 0);
        this.setParticleCount(this.tentacles.length);
    }

    createTentacleMesh(geometry, textures) {
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff, map: textures.map, bumpMap: textures.bumpMap,
            bumpScale: 25.0, metalness: 0.0, roughness: 0.2, vertexColors: true,
            emissive: 0x000000, transparent: false
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
        cCtx.fillStyle = '#eeeeee'; cCtx.fillRect(0, 0, size, size);
        cCtx.strokeStyle = 'rgba(180, 0, 50, 0.4)';
        for (let i = 0; i < 100; i++) {
            cCtx.lineWidth = 0.5 + Math.random() * 1.5;
            let x = Math.random() * size; let y = Math.random() * size;
            cCtx.beginPath(); cCtx.moveTo(x, y);
            for (let j = 0; j < 10; j++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; cCtx.lineTo(x, y); }
            cCtx.stroke();
        }
        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size; bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');
        bCtx.fillStyle = '#808080'; bCtx.fillRect(0, 0, size, size);
        bCtx.strokeStyle = 'rgba(0, 0, 0, 0.2)'; bCtx.lineWidth = 0.5;
        for (let i = 0; i < 2000; i++) {
            const x = Math.random() * size; const y = Math.random() * size;
            bCtx.beginPath(); bCtx.moveTo(x, y); bCtx.lineTo(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10); bCtx.stroke();
        }
        for (let i = 0; i < 10000; i++) {
            const x = Math.random() * size; const y = Math.random() * size;
            const r = 0.3 + Math.random() * 0.5; const val = Math.random() * 30;
            bCtx.fillStyle = `rgb(${val}, ${val}, ${val})`; bCtx.beginPath(); bCtx.arc(x, y, r, 0, Math.PI * 2); bCtx.fill();
        }
        const map = new THREE.CanvasTexture(colorCanvas);
        const bumpMap = new THREE.CanvasTexture(bumpCanvas);
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
        return { map, bumpMap };
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
                this.focusTarget.copy(this.camera.position).add(new THREE.Vector3((Math.random()-0.5)*1500, (Math.random()-0.5)*800, (Math.random()-0.5)*1500));
            }
            switch(this.creatureState) {
                case this.STATE_IDLE: this.targetAnimParams = { speed: 0.8, waveFreq: 1.5, waveAmp: 40.0, focusWeight: 0.0, moveSpeed: 0.2, distortionSpeed: 0.8, distortionAmp: 0.3 }; break;
                case this.STATE_WILD: this.targetAnimParams = { speed: 3.0, waveFreq: 4.0, waveAmp: 100.0, focusWeight: 0.0, moveSpeed: 0.5, distortionSpeed: 2.0, distortionAmp: 0.8 }; break;
                case this.STATE_FOCUS: this.targetAnimParams = { speed: 0.5, waveFreq: 1.0, waveAmp: 20.0, focusWeight: 0.6, moveSpeed: 0.1, distortionSpeed: 0.5, distortionAmp: 0.2 }; break;
                case this.STATE_STASIS: this.targetAnimParams = { speed: 0.4, waveFreq: 1.2, waveAmp: 15.0, focusWeight: 0.0, moveSpeed: 0.1, distortionSpeed: 0.3, distortionAmp: 0.2 }; break;
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
        
        const skinColor = new THREE.Color('#ffccbb'); 
        
        if (this.coreMesh && this.coreMesh.geometry.attributes.color) {
            this.coreMesh.rotation.y += deltaTime * 0.15;
            const corePosAttr = this.coreMesh.geometry.attributes.position;
            const coreColorAttr = this.coreMesh.geometry.attributes.color;
            const initialPos = this.coreMesh.geometry.userData.initialPositions;
            const v = new THREE.Vector3();
            const { distortionSpeed, distortionAmp } = this.currentAnimParams;
            for (let i = 0; i < corePosAttr.count; i++) {
                v.set(initialPos[i * 3], initialPos[i * 3 + 1], initialPos[i * 3 + 2]);
                const noiseVal = (Math.sin(v.x * 0.01 + this.time * distortionSpeed) + Math.cos(v.y * 0.01 + this.time * distortionSpeed * 0.8) + Math.sin(v.z * 0.01 + this.time * distortionSpeed * 1.1));
                v.multiplyScalar(1.0 + noiseVal * distortionAmp); 
                corePosAttr.setXYZ(i, v.x, v.y, v.z);
                coreColorAttr.setXYZ(i, skinColor.r, skinColor.g, skinColor.b);
            }
            corePosAttr.needsUpdate = true; coreColorAttr.needsUpdate = true; this.coreMesh.geometry.computeVertexNormals();
        }
        
        this.tentacles.forEach((t, i) => {
            const posAttr = t.mesh.geometry.attributes.position;
            const colorAttr = t.mesh.geometry.attributes.color;
            if (!posAttr || !colorAttr) return;

            const { speed, waveFreq, waveAmp, focusWeight, moveSpeed } = this.currentAnimParams;
            const angleOffsetPhi = Math.sin(this.time * moveSpeed + i) * 0.15;
            const angleOffsetTheta = Math.cos(this.time * moveSpeed * 0.8 + i * 1.5) * 0.15;
            t.mesh.rotation.set(angleOffsetTheta, angleOffsetPhi, 0);
            
            const focusVec = new THREE.Vector3();
            if (focusWeight > 0) { 
                focusVec.copy(this.focusTarget).sub(this.tentacleGroup.position).applyQuaternion(this.tentacleGroup.quaternion.clone().invert()).normalize(); 
            }
            
            const color = new THREE.Color();
            for (let s = 0; s <= 64; s++) {
                const u = s / 64; const time = this.time * speed; const phase = u * waveFreq + i * 2.0;
                let offsetX = (Math.sin(time + phase) * 1.0 + Math.sin(time * 2.8 + phase * 3.0) * 1.5 + Math.sin(time * 5.5 + phase * 6.0) * 1.0) * waveAmp * u;
                let offsetY = (Math.cos(time * 0.8 + phase * 1.2 + i) * 1.0 + Math.cos(time * 3.5 + phase * 3.8) * 1.2 + Math.sin(time * 6.2 + phase * 7.0) * 1.0) * waveAmp * u;
                let offsetZ = (Math.sin(time * 1.2 + phase * 0.8 + i * 1.5) * 1.0 + Math.sin(time * 3.2 + phase * 3.3) * 1.5 + Math.cos(time * 5.8 + phase * 6.5) * 1.0) * waveAmp * u;
                
                if (focusWeight > 0) {
                    const focusStrength = u * 250.0 * focusWeight;
                    offsetX = offsetX * (1.0 - focusWeight * 0.5) + focusVec.x * focusStrength;
                    offsetY = offsetY * (1.0 - focusWeight * 0.5) + focusVec.y * focusStrength;
                    offsetZ = offsetZ * (1.0 - focusWeight * 0.5) + focusVec.z * focusStrength;
                }
                const intensity = Math.pow(u, 1.1);
                
                color.copy(skinColor);
                if (u > 0.6) { // 根本付近(60%)からヒートマップ開始
                    const heatBlend = (u - 0.6) / 0.4;
                    const motionVal = (Math.abs(offsetX) + Math.abs(offsetY) + Math.abs(offsetZ)) / (waveAmp * 1.5);
                    let heatFactor = heatBlend * 0.7 + motionVal * 0.3; 
                    heatFactor = Math.min(1.0, heatFactor);
                    const heatColor = new THREE.Color(); heatColor.setHSL((1.0 - heatFactor) * 0.7, 1.0, 0.5);
                    color.lerp(heatColor, heatBlend);
                }
                
                for (let rIdx = 0; rIdx <= 12; rIdx++) {
                    const idx = s * 13 + rIdx;
                    if (idx < posAttr.count) {
                        const bx = t.basePositions[idx * 3 + 0]; const by = t.basePositions[idx * 3 + 1]; const bz = t.basePositions[idx * 3 + 2];
                        posAttr.setXYZ(idx, bx + offsetX * intensity, by + offsetY * intensity, bz + offsetZ * intensity);
                        colorAttr.setXYZ(idx, color.r, color.g, color.b);
                    }
                }
            }
            posAttr.needsUpdate = true; colorAttr.needsUpdate = true; t.mesh.geometry.computeVertexNormals();
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
