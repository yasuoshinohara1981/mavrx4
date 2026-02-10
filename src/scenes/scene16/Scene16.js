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
import { RandomLFO } from '../../lib/RandomLFO.js';

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
        this.tentacleCount = 220; 
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
            speed: 0.08,
            waveFreq: 1.2,
            waveAmp: 40.0,
            focusWeight: 0.0,
            moveSpeed: 0.02,
            distortionSpeed: 0.03,
            distortionAmp: 0.2 
        };
        this.targetAnimParams = { ...this.currentAnimParams };

        // 究極のランダムさのための RandomLFO 群
        // (minRate, maxRate, minValue, maxValue)
        this.speedLFO = new RandomLFO(0.01, 0.05, 0.02, 0.15); // 動きの速さ
        this.ampLFO = new RandomLFO(0.005, 0.02, 10.0, 80.0);   // 動きの大きさ
        this.distortionSpeedLFO = new RandomLFO(0.01, 0.04, 0.01, 0.1); // コアの歪み速さ
        this.distortionAmpLFO = new RandomLFO(0.005, 0.03, 0.1, 0.5);   // コアの歪み強さ
        this.colorCycleLFO = new RandomLFO(0.002, 0.01, 0.0, 1.0);      // 色の移り変わり

        // エフェクト設定
        this.useDOF = true;
        this.useBloom = true; 
        this.bokehPass = null;
        this.bloomPass = null;

        this.trackEffects = {
            1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false, 9: false
        };

        // 産毛（Hair）の設定
        this.hairCount = 5000;
        this.hairSystem = null;

        this.setScreenshotText(this.title);
    }

    /**
     * カメラ距離の徹底修正
     */
    setupCameraParticleDistance(cameraParticle) {
        // 距離を調整（2500 -> 3000）
        cameraParticle.minDistance = 3000; 
        cameraParticle.maxDistance = 4500; // 箱を突き抜けないように最大距離を制限（StudioBox size=10000 なので半径5000以内）
        cameraParticle.maxDistanceReset = 4000;
        cameraParticle.minY = -400; // 標準の床の高さに合わせる
        cameraParticle.maxY = 4500; // 天井を突き抜けないように制限
        
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

        // 初期カメラ位置を調整
        this.camera.position.set(0, 500, 4000); 
        this.camera.lookAt(0, 0, 0);
        
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        this.setupLights();
        this.createStudioBox();
        this.createTentacles();
        this.createHair();
        this.initPostProcessing();
        this.initialized = true;
    }

    createHair() {
        const geometry = new THREE.BufferGeometry();
        // LineSegments 用に、1つの毛に対して2つの頂点（開始点と終点）が必要
        const positions = new Float32Array(this.hairCount * 2 * 3);
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.LineBasicMaterial({
            color: 0x000000, // 短い【黒い線】
            transparent: true,
            opacity: 0.6,
            linewidth: 1
        });
        
        this.hairSystem = new THREE.LineSegments(geometry, material);
        this.tentacleGroup.add(this.hairSystem);
        
        // 頂点ごとの phi, theta を保存しておく
        this.hairData = [];
        for (let i = 0; i < this.hairCount; i++) {
            const phi = Math.random() * Math.PI * 2;
            const theta = Math.random() * Math.PI;
            this.hairData.push({ phi, theta });
        }
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
        
        // 影の範囲をクリーチャーの周辺に限定
        const sSize = 4000; 
        directionalLight.shadow.camera.left = -sSize;
        directionalLight.shadow.camera.right = sSize;
        directionalLight.shadow.camera.top = sSize;
        directionalLight.shadow.camera.bottom = -sSize;
        directionalLight.shadow.camera.near = 100;
        directionalLight.shadow.camera.far = 10000;
        
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.radius = 5; 
        directionalLight.shadow.bias = -0.0005;
        
        this.scene.add(directionalLight);

        const pointLight = new THREE.PointLight(0xffffff, 1.5, 5000); 
        pointLight.position.set(0, 1000, 0); 
        pointLight.castShadow = false; 
        this.scene.add(pointLight);
    }

    createStudioBox() {
        this.studio = new StudioBox(this.scene);
    }

    createTentacles() {
        const textures = this.generateFleshTextures();
        this.scene.add(this.tentacleGroup);
        const tentacleCount = this.tentacleCount; 
        const baseRadius = 450; // コアをさらに巨大化（300 -> 450）

        this.time = Math.random() * 100;

        const coreGeo = new THREE.IcosahedronGeometry(baseRadius, 6);
        coreGeo.userData.initialPositions = coreGeo.attributes.position.array.slice();
        
        // 頂点カラー属性を初期化
        const coreColors = new Float32Array(coreGeo.attributes.position.count * 3);
        const skinColor = new THREE.Color('#000011');
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
            bumpScale: 10.0, 
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
            const points = [];
            
            // 生える場所を極端に偏らせる
            const clusterSeed = Math.floor(i / 20); 
            const clusterPhi = (Math.sin(clusterSeed * 1.8) * 0.5 + 0.5) * Math.PI * 2;
            const clusterTheta = (Math.cos(clusterSeed * 2.5) * 0.5 + 0.5) * Math.PI;
            
            const phi = clusterPhi + (Math.random() - 0.5) * 1.2;
            const theta = clusterTheta + (Math.random() - 0.5) * 1.2;

            const baseThickness = 8 + Math.pow(Math.random(), 2.0) * 50;
            const r = baseRadius + 400;

            points.push(new THREE.Vector3(0,0,0));
            const midDist = baseRadius + 200;
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
        this.tentacleGroup.position.set(0, 400, 0);
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
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 4, window.innerHeight / 4), 0.05, 0.1, 1.5);
        this.composer.addPass(this.bloomPass);
        this.bokehPass = new BokehPass(this.scene, this.camera, { focus: 1500, aperture: 0.00001, maxblur: 0.005, width: window.innerWidth, height: window.innerHeight });
        this.composer.addPass(this.bokehPass);
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        this.time += deltaTime;
        this.stateTimer += deltaTime;

        // RandomLFO 群の更新
        this.speedLFO.update(deltaTime);
        this.ampLFO.update(deltaTime);
        this.distortionSpeedLFO.update(deltaTime);
        this.distortionAmpLFO.update(deltaTime);
        this.colorCycleLFO.update(deltaTime);

        // LFOから動的にパラメータを取得（ステートマシンによる急激な変化を抑制しつつ、常に揺らす）
        this.targetAnimParams.speed = this.speedLFO.getValue();
        this.targetAnimParams.waveAmp = this.ampLFO.getValue();
        this.targetAnimParams.distortionSpeed = this.distortionSpeedLFO.getValue();
        this.targetAnimParams.distortionAmp = this.distortionAmpLFO.getValue();

        if (this.stateTimer >= this.stateDuration) {
            this.stateTimer = 0;
            this.creatureState = Math.floor(Math.random() * 4);
            this.stateDuration = 10.0 + Math.random() * 15.0; // 周期をさらに長く
            if (this.creatureState === this.STATE_FOCUS) {
                this.focusTarget.copy(this.camera.position).add(new THREE.Vector3((Math.random()-0.5)*1500, (Math.random()-0.5)*800, (Math.random()-0.5)*1500));
            }
            // ステートはあくまで「味付け」として残し、LFOの範囲を微調整する
            switch(this.creatureState) {
                case this.STATE_IDLE: 
                    this.speedLFO.setValueRange(0.04, 0.1);
                    this.ampLFO.setValueRange(20.0, 50.0);
                    break;
                case this.STATE_WILD: 
                    this.speedLFO.setValueRange(0.1, 0.2);
                    this.ampLFO.setValueRange(60.0, 100.0);
                    break;
                case this.STATE_FOCUS: 
                    this.speedLFO.setValueRange(0.02, 0.08);
                    this.ampLFO.setValueRange(10.0, 30.0);
                    break;
                case this.STATE_STASIS: 
                    this.speedLFO.setValueRange(0.01, 0.04);
                    this.ampLFO.setValueRange(5.0, 15.0);
                    break;
            }
        }
        const lerpFactor = deltaTime * 0.5; // 遷移をさらにゆっくりに
        for (let key in this.currentAnimParams) { this.currentAnimParams[key] += (this.targetAnimParams[key] - this.currentAnimParams[key]) * lerpFactor; }
        
        const heartbeat = Math.pow(Math.sin(this.time * 1.0), 8.0); // 心拍もゆっくりに
        const scale = 1.0 + heartbeat * 0.03;
        this.tentacleGroup.scale.set(scale, scale, scale);
        
        const rotationSpeed = this.creatureState === this.STATE_FOCUS ? 0.02 : 0.08;
        this.tentacleGroup.rotation.y += deltaTime * rotationSpeed;
        this.tentacleGroup.rotation.x += deltaTime * (rotationSpeed * 0.3);
        
        // 【赤系禁止】ベースカラーを極彩色（カメレオン）化！
        // 時間とともに「漆黒 → 紺 → 青 → 水色 → 緑 → 黄緑 → 紫 → 漆黒」と変化
        // colorCycleLFO を使って周期自体をランダムに揺らす
        const baseCycle = this.colorCycleLFO.getValue(); 
        const skinColor = new THREE.Color();
        if (baseCycle < 0.1) {
            skinColor.setRGB(0, 0, 0); // 【漆黒】
        } else if (baseCycle < 0.25) {
            const t = (baseCycle - 0.1) * 6.6;
            skinColor.setRGB(0, 0, t * 0.5); // 漆黒〜紺
        } else if (baseCycle < 0.4) {
            const t = (baseCycle - 0.25) * 6.6;
            skinColor.setRGB(0, t * 0.5, 0.5 + t * 0.5); // 紺〜青〜水色
        } else if (baseCycle < 0.55) {
            const t = (baseCycle - 0.4) * 6.6;
            skinColor.setRGB(0, 1.0, 1.0 - t); // 水色〜緑
        } else if (baseCycle < 0.7) {
            const t = (baseCycle - 0.55) * 6.6;
            skinColor.setRGB(t * 0.5, 1.0, 0); // 緑〜黄緑
        } else if (baseCycle < 0.85) {
            const t = (baseCycle - 0.7) * 6.6;
            skinColor.setRGB(0.5 + t * 0.5, 0, 1.0 - t * 0.5); // 黄緑〜紫
        } else {
            const t = (baseCycle - 0.85) * 6.6;
            skinColor.setRGB(1.0 - t, 0, 1.0 - t); // 紫〜漆黒
        }

        // 全触手で同期したヒートマップ用のグローバルな「熱量」
        const { speed, waveFreq, waveAmp, focusWeight, moveSpeed, distortionSpeed, distortionAmp } = this.currentAnimParams;
        const globalHeatCycle = (this.time * speed * 0.5) % 1.0;
        const globalCoreHeat = Math.min(1.0, (Math.sin(this.time * distortionSpeed) * 0.5 + 0.5));

        if (this.coreMesh && this.coreMesh.geometry.attributes.color) {
            this.coreMesh.rotation.y += deltaTime * 0.05;
            const corePosAttr = this.coreMesh.geometry.attributes.position;
            const coreColorAttr = this.coreMesh.geometry.attributes.color;
            const initialPos = this.coreMesh.geometry.userData.initialPositions;
            const v = new THREE.Vector3();
            
            for (let i = 0; i < corePosAttr.count; i++) {
                v.set(initialPos[i * 3], initialPos[i * 3 + 1], initialPos[i * 3 + 2]);
                
                // 複数のノイズを掛け合わせて複雑な歪みを作る
                const lowFreqNoise = (
                    Math.sin(v.x * 0.002 + this.time * distortionSpeed * 0.3) * 
                    Math.cos(v.y * 0.002 + this.time * distortionSpeed * 0.4) * 
                    Math.sin(v.z * 0.002 + this.time * distortionSpeed * 0.2)
                );
                
                const midFreqNoise = (
                    Math.sin(v.x * 0.01 + this.time * distortionSpeed) + 
                    Math.cos(v.y * 0.01 + this.time * distortionSpeed * 0.8) + 
                    Math.sin(v.z * 0.01 + this.time * distortionSpeed * 1.1)
                ) * 0.3;

                const noiseVal = lowFreqNoise + midFreqNoise;
                v.multiplyScalar(1.0 + noiseVal * distortionAmp); 
                corePosAttr.setXYZ(i, v.x, v.y, v.z);

                // コアのヒートマップ
                const localHeat = Math.min(1.0, Math.abs(noiseVal) * 2.5);
                const coreHeatColor = new THREE.Color();
                if (localHeat < 0.33) {
                    coreHeatColor.setRGB(0, 0, localHeat * 1.5); 
                } else if (localHeat < 0.66) {
                    const t = (localHeat - 0.33) * 3.0;
                    coreHeatColor.setRGB(0, t * 0.8, 0.5 + t * 0.5); 
                } else {
                    const t = (localHeat - 0.66) * 3.0;
                    coreHeatColor.setRGB(t, 0.8 + t * 0.2, 1.0); 
                }
                
                const finalColor = skinColor.clone().lerp(coreHeatColor, localHeat);
                coreColorAttr.setXYZ(i, finalColor.r, finalColor.g, finalColor.b);
            }
            corePosAttr.needsUpdate = true; coreColorAttr.needsUpdate = true; this.coreMesh.geometry.computeVertexNormals();
        }

        // 産毛（短い黒い線）の更新
        if (this.hairSystem) {
            const hairPosAttr = this.hairSystem.geometry.attributes.position;
            const { distortionSpeed, distortionAmp } = this.currentAnimParams;
            const baseRadius = 450;

            for (let i = 0; i < this.hairCount; i++) {
                const data = this.hairData[i];
                const rx = baseRadius * Math.sin(data.theta) * Math.cos(data.phi);
                const ry = baseRadius * Math.cos(data.theta);
                const rz = baseRadius * Math.sin(data.theta) * Math.sin(data.phi);

                // コアと同じノイズロジックで表面の変位を計算
                const lowFreqNoise = (
                    Math.sin(rx * 0.002 + this.time * distortionSpeed * 0.3) * 
                    Math.cos(ry * 0.002 + this.time * distortionSpeed * 0.4) * 
                    Math.sin(rz * 0.002 + this.time * distortionSpeed * 0.2)
                );
                const midFreqNoise = (
                    Math.sin(rx * 0.01 + this.time * distortionSpeed) + 
                    Math.cos(ry * 0.01 + this.time * distortionSpeed * 0.8) + 
                    Math.sin(rz * 0.01 + this.time * distortionSpeed * 1.1)
                ) * 0.3;
                const noiseVal = lowFreqNoise + midFreqNoise;
                
                // 表面の位置（開始点）
                const displacement = 1.0 + noiseVal * distortionAmp;
                const startRadius = baseRadius * displacement;
                
                // 毛の長さと方向（終点）
                const hairLength = 15 + Math.sin(this.time * 2.0 + i) * 5;
                const endRadius = startRadius + hairLength;

                const sinT = Math.sin(data.theta);
                const cosT = Math.cos(data.theta);
                const sinP = Math.sin(data.phi);
                const cosP = Math.cos(data.phi);

                // 開始点
                hairPosAttr.setXYZ(i * 2, startRadius * sinT * cosP, startRadius * cosT, startRadius * sinT * sinP);
                // 終点
                hairPosAttr.setXYZ(i * 2 + 1, endRadius * sinT * cosP, endRadius * cosT, endRadius * sinT * sinP);
            }
            hairPosAttr.needsUpdate = true;
        }
        
        this.tentacles.forEach((t, i) => {
            const posAttr = t.mesh.geometry.attributes.position;
            const colorAttr = t.mesh.geometry.attributes.color;
            if (!posAttr || !colorAttr) return;

            // 触手ごとの個別のバイアス（ノイズ）
            // これにより、一本一本が独立して動いたり動かなかったりする
            const tentacleNoise = Math.sin(this.time * 0.2 + i * 0.5) * 0.5 + 0.5; // 0.0 - 1.0
            const individualSpeed = speed * (0.5 + tentacleNoise * 1.5);
            const individualAmp = waveAmp * (0.3 + Math.cos(this.time * 0.1 + i * 0.8) * 0.7);

            const angleOffsetPhi = Math.sin(this.time * moveSpeed + i) * 0.1;
            const angleOffsetTheta = Math.cos(this.time * moveSpeed * 0.8 + i * 1.5) * 0.1;
            t.mesh.rotation.set(angleOffsetTheta, angleOffsetPhi, 0);
            
            const focusVec = new THREE.Vector3();
            if (focusWeight > 0) { 
                focusVec.copy(this.focusTarget).sub(this.tentacleGroup.position).applyQuaternion(this.tentacleGroup.quaternion.clone().invert()).normalize(); 
            }
            
            const lengthNoise = (Math.sin(this.time * 0.3 + i * 1.2) * 0.5 + 0.5) * 0.5 + 0.75;

            // 触手の根元の色を同期
            const rx = t.baseRadius * Math.sin(t.theta) * Math.cos(t.phi);
            const ry = t.baseRadius * Math.cos(t.theta);
            const rz = t.baseRadius * Math.sin(t.theta) * Math.sin(t.phi);

            const lowFreqNoise = (
                Math.sin(rx * 0.003 + this.time * distortionSpeed * 0.5) * 
                Math.cos(ry * 0.003 + this.time * distortionSpeed * 0.6) * 
                Math.sin(rz * 0.003 + this.time * distortionSpeed * 0.4)
            );
            const midFreqNoise = (
                Math.sin(rx * 0.01 + this.time * distortionSpeed) + 
                Math.cos(ry * 0.01 + this.time * distortionSpeed * 0.8) + 
                Math.sin(rz * 0.01 + this.time * distortionSpeed * 1.1)
            ) * 0.3;
            const noiseVal = lowFreqNoise + midFreqNoise;
            const localHeat = Math.min(1.0, Math.abs(noiseVal) * 2.5);
            
            const coreHeatColor = new THREE.Color();
            if (localHeat < 0.5) {
                coreHeatColor.setRGB(0, localHeat * 0.5, localHeat * 2.0);
            } else {
                const tVal = (localHeat - 0.5) * 2.0;
                coreHeatColor.setRGB(tVal, 0.5 + tVal * 0.5, 1.0);
            }
            const rootColor = skinColor.clone().lerp(coreHeatColor, localHeat);

            const color = new THREE.Color();
            for (let s = 0; s <= 64; s++) {
                const u = s / 64; const time = this.time * individualSpeed; const phase = u * waveFreq + i * 2.0;
                let offsetX = (Math.sin(time + phase) * 1.0 + Math.sin(time * 2.8 + phase * 3.0) * 1.5 + Math.sin(time * 5.5 + phase * 6.0) * 1.0) * individualAmp * u;
                let offsetY = (Math.cos(time * 0.8 + phase * 1.2 + i) * 1.0 + Math.cos(time * 3.5 + phase * 3.8) * 1.2 + Math.sin(time * 6.2 + phase * 7.0) * 1.0) * individualAmp * u;
                let offsetZ = (Math.sin(time * 1.2 + phase * 0.8 + i * 1.5) * 1.0 + Math.sin(time * 3.2 + phase * 3.3) * 1.5 + Math.cos(time * 5.8 + phase * 6.5) * 1.0) * individualAmp * u;
                
                if (focusWeight > 0) {
                    const focusStrength = u * 250.0 * focusWeight;
                    offsetX = offsetX * (1.0 - focusWeight * 0.5) + focusVec.x * focusStrength;
                    offsetY = offsetY * (1.0 - focusWeight * 0.5) + focusVec.y * focusStrength;
                    offsetZ = offsetZ * (1.0 - focusWeight * 0.5) + focusVec.z * focusStrength;
                }
                const intensity = Math.pow(u, 1.1);
                
                // 触手のヒートマップ計算
                const motionVal = (Math.abs(offsetX) + Math.abs(offsetY) + Math.abs(offsetZ)) / (individualAmp * 1.5);
                const motionIntensity = Math.min(1.0, motionVal * 3.0); 
                
                // 色の周期も全触手で同期しつつ、位置によるズレを持たせる
                let heatFactor = (globalHeatCycle + u * 0.3) % 1.0;
                
                const cyberHeatColor = new THREE.Color();
                if (heatFactor < 0.1) {
                    cyberHeatColor.setRGB(0, 0, 0); 
                } else if (heatFactor < 0.25) {
                    const tVal = (heatFactor - 0.1) * 6.6;
                    cyberHeatColor.setRGB(0, 0, 0.2 + tVal * 0.8); 
                } else if (heatFactor < 0.4) {
                    const tVal = (heatFactor - 0.25) * 6.6;
                    cyberHeatColor.setRGB(0, tVal, 1.0); 
                } else if (heatFactor < 0.55) {
                    const tVal = (heatFactor - 0.4) * 6.6;
                    cyberHeatColor.setRGB(0, 1.0, 1.0 - tVal); 
                } else if (heatFactor < 0.7) {
                    const tVal = (heatFactor - 0.55) * 6.6;
                    cyberHeatColor.setRGB(tVal, 1.0, 0); 
                } else if (heatFactor < 0.85) {
                    const tVal = (heatFactor - 0.7) * 6.6;
                    cyberHeatColor.setRGB(1.0 - tVal * 0.5, tVal * 0.2, 1.0); 
                } else {
                    const tVal = (heatFactor - 0.85) * 6.6;
                    cyberHeatColor.setRGB(1.0, tVal, 1.0); 
                }
                
                if (u < 0.35) {
                    color.copy(rootColor);
                } else {
                    const finalCyberColor = cyberHeatColor.clone().lerp(rootColor, 1.0 - motionIntensity);
                    const blendT = (u - 0.35) / 0.65; 
                    color.copy(rootColor).lerp(finalCyberColor, blendT);
                }
                
                for (let rIdx = 0; rIdx <= 12; rIdx++) {
                    const idx = s * 13 + rIdx;
                    if (idx < posAttr.count) {
                        const bx = t.basePositions[idx * 3 + 0]; const by = t.basePositions[idx * 3 + 1]; const bz = t.basePositions[idx * 3 + 2];
                        posAttr.setXYZ(idx, (bx + offsetX * intensity) * lengthNoise, (by + offsetY * intensity) * lengthNoise, (bz + offsetZ * intensity) * lengthNoise);
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
