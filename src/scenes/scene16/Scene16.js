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
        // 距離を離しつつ、StudioBox（size=10000, 半径5000）を突き抜けないように制限
        // z-fighting 防止のため、最大距離を 4850 程度に抑える
        cameraParticle.minDistance = 3500; 
        cameraParticle.maxDistance = 4850; 
        cameraParticle.maxDistanceReset = 4500;
        cameraParticle.minY = -200; 
        cameraParticle.maxY = 4500; 
        
        // 即座に位置を更新
        if (cameraParticle.initializePosition) {
            cameraParticle.initializePosition();
        }
    }

    async setup() {
        if (this.initialized) return;
        await super.setup();
        
        // 基底クラスのカメラ設定を上書き
        if (this.cameraParticle) {
            this.setupCameraParticleDistance(this.cameraParticle);
        }

        // 初期カメラ位置も箱の内側に収める
        this.camera.position.set(0, 1000, 4500); 
        this.camera.lookAt(0, 400, 0);
        
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

        const pointLight = new THREE.PointLight(0xffffff, 0.8, 5000); 
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

        const coreGeo = new THREE.IcosahedronGeometry(baseRadius, 12); // 分割数を 6 -> 12 に倍増
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
            bumpScale: 15.0, 
            metalness: 0.1, 
            roughness: 0.4, 
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
            bumpScale: 30.0, metalness: 0.1, roughness: 0.4, vertexColors: true,
            emissive: 0x000000, transparent: false
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true; mesh.receiveShadow = true;
        return mesh;
    }

    generateFleshTextures() {
        const size = 1024; // 解像度を上げてより細かく
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size; colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');
        
        // ベースは明るい肉色
        cCtx.fillStyle = '#f0f0f0'; 
        cCtx.fillRect(0, 0, size, size);
        
        // 毛細血管の描画
        const drawVessel = (x, y, angle, length, width, depth) => {
            if (depth <= 0) return;
            
            cCtx.beginPath();
            cCtx.moveTo(x, y);
            
            // 血管らしい「うねり」を加える
            const nx = x + Math.cos(angle) * length;
            const ny = y + Math.sin(angle) * length;
            
            // ベジェ曲線で滑らかに
            const cp1x = x + Math.cos(angle + (Math.random() - 0.5)) * length * 0.5;
            const cp1y = y + Math.sin(angle + (Math.random() - 0.5)) * length * 0.5;
            
            cCtx.quadraticCurveTo(cp1x, cp1y, nx, ny);
            
            cCtx.lineWidth = width;
            cCtx.strokeStyle = `rgba(${150 + Math.random() * 50}, 0, ${20 + Math.random() * 30}, ${0.2 + (depth / 10) * 0.5})`;
            cCtx.stroke();
            
            // 枝分かれ
            if (Math.random() > 0.4) {
                const newAngle = angle + (Math.random() - 0.5) * 1.5;
                drawVessel(nx, ny, newAngle, length * 0.8, width * 0.7, depth - 1);
            }
            if (Math.random() > 0.6) {
                const newAngle = angle - (Math.random() - 0.5) * 1.5;
                drawVessel(nx, ny, newAngle, length * 0.7, width * 0.6, depth - 1);
            }
        };

        for (let i = 0; i < 40; i++) {
            drawVessel(Math.random() * size, Math.random() * size, Math.random() * Math.PI * 2, 30 + Math.random() * 40, 2.5, 8);
        }

        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size; bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');
        bCtx.fillStyle = '#808080'; bCtx.fillRect(0, 0, size, size);
        
        // 血管部分をバンプマップにも反映させて浮き上がらせる
        bCtx.globalAlpha = 0.3;
        bCtx.drawImage(colorCanvas, 0, 0);
        bCtx.globalAlpha = 1.0;

        for (let i = 0; i < 5000; i++) {
            const x = Math.random() * size; const y = Math.random() * size;
            const r = 0.5 + Math.random() * 1.0; const val = Math.random() * 40;
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
        
        // 既存のパスをクリアして、二重に追加されるのを防ぐ（ホットリロード対策）
        const passesToRemove = this.composer.passes.filter(p => p instanceof UnrealBloomPass || p instanceof BokehPass);
        passesToRemove.forEach(p => this.composer.removePass(p));

        // ブルームを完全に無効化（強度0）
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 4, window.innerHeight / 4), 0.0, 0.1, 1.0);
        this.composer.addPass(this.bloomPass);
        
        this.bokehPass = new BokehPass(this.scene, this.camera, { 
            focus: 1500, 
            aperture: 0.00001, 
            maxblur: 0.005, 
            width: window.innerWidth, 
            height: window.innerHeight 
        });
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
        
        // 【コアの基準サイズ変動】周期的に巨大化したり縮小したりする
        const coreBaseScaleLFO = this.speedLFO.getValue(); // 既存のLFOを流用して周期を揺らす
        const coreBaseScale = 1.0 + Math.sin(this.time * 0.05 + coreBaseScaleLFO) * 0.4; // 0.2 -> 0.05
        
        const scale = coreBaseScale + heartbeat * 0.03;
        this.tentacleGroup.scale.set(scale, scale, scale);
        
        const rotationSpeed = this.creatureState === this.STATE_FOCUS ? 0.02 : 0.08;
        this.tentacleGroup.rotation.y += deltaTime * rotationSpeed;
        this.tentacleGroup.rotation.x += deltaTime * (rotationSpeed * 0.3);
        
        // 【ベースカラーの刷新】白と濃いグレーをランダムに行ったり来たり
        const baseCycle = this.colorCycleLFO.getValue(); 
        const skinColor = new THREE.Color();
        
        // baseCycle (0.0〜1.0) を使って、白(0.9)と濃いグレー(0.2)の間を補完
        // LFOが揺れているので、周期的に色が入れ替わる
        const grayVal = 0.2 + (baseCycle * 0.7); 
        skinColor.setRGB(grayVal, grayVal, grayVal);

        const { speed, waveFreq, waveAmp, focusWeight, moveSpeed, distortionSpeed, distortionAmp } = this.currentAnimParams;
        
        // トラック6のMIDI信号（力）を取得
        const track6Force = (this.sharedResourceManager && typeof this.sharedResourceManager.getTrackLevel === 'function') 
            ? this.sharedResourceManager.getTrackLevel(6) 
            : 0;
        const totalForce = 1.0 + track6Force * 2.0; // トラック6で動きを増幅

        // 【標高ベースのヒートマップロジック】地球儀のようにノイズの高さで多段階に色を変える
        const getElevationHeatColor = (vPos, baseColor, time, isTip = false) => {
            // 3次元ノイズで「標高（Elevation）」を計算
            const noiseScale = 0.003; 
            const elevation1 = (
                Math.sin(vPos.x * noiseScale + time * 0.25) * 
                Math.cos(vPos.y * noiseScale + time * 0.35) * 
                Math.sin(vPos.z * noiseScale + time * 0.2)
            );
            const elevation2 = (
                Math.sin(vPos.x * noiseScale * 1.5 - time * 0.4) * 
                Math.cos(vPos.y * noiseScale * 1.5 + time * 0.5)
            ) * 0.4;
            const elevation3 = (
                Math.sin(vPos.z * noiseScale * 2.0 + time * 0.8)
            ) * 0.2;

            const totalElevation = (elevation1 + elevation2 + elevation3) * 0.5 + 0.5; 
            
            const steps = 64.0;
            const steppedElevation = Math.floor(totalElevation * steps) / steps;
            
            const colorShiftSpeed = 0.2; 
            const baseHueOffset = (this.time * colorShiftSpeed) % 1.0;
            
            // 標高に応じた色相の変化
            let hue = 0.5 + ((baseHueOffset + steppedElevation * 0.4) % 1.0) * 0.4;
            
            // 【触手の先端カラー】先端（isTip=true）の場合は、色相をさらに反転・シフトさせる
            if (isTip) {
                hue = (hue + 0.5) % 1.0; // 補色に近い色へシフト
                // 先端も赤・緑系を避ける
                if (hue < 0.25) hue += 0.3;
                if (hue > 0.25 && hue < 0.45) hue += 0.2;
            }
            
            const targetColor = new THREE.Color();
            const lightnessPattern = Math.sin(steppedElevation * Math.PI * 8.0) * 0.15 + 0.4;
            // 先端はより鮮やかに
            const saturation = isTip ? 1.0 : (0.6 + steppedElevation * 0.4); 
            targetColor.setHSL(hue, saturation, lightnessPattern);
            
            const blendFactor = 0.15 + steppedElevation * 0.8;
            const finalColor = baseColor.clone().lerp(targetColor, blendFactor);

            finalColor.r = Math.min(0.95, finalColor.r);
            finalColor.g = Math.min(0.95, finalColor.g);
            finalColor.b = Math.min(0.95, finalColor.b);
            
            return finalColor;
        };

        if (this.coreMesh && this.coreMesh.geometry.attributes.color) {
            this.coreMesh.rotation.y += deltaTime * 0.05;
            const corePosAttr = this.coreMesh.geometry.attributes.position;
            const coreColorAttr = this.coreMesh.geometry.attributes.color;
            const initialPos = this.coreMesh.geometry.userData.initialPositions;
            const v = new THREE.Vector3();
            
            for (let i = 0; i < corePosAttr.count; i++) {
                v.set(initialPos[i * 3], initialPos[i * 3 + 1], initialPos[i * 3 + 2]);
                
                // 歪みノイズ
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

                // 多段階標高ヒートマップ（コア）
                const finalColor = getElevationHeatColor(v, skinColor, this.time);
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
                // 初期位置を計算
                const sinT = Math.sin(data.theta);
                const cosT = Math.cos(data.theta);
                const sinP = Math.sin(data.phi);
                const cosP = Math.cos(data.phi);
                
                const rx = baseRadius * sinT * cosP;
                const ry = baseRadius * cosT;
                const rz = baseRadius * sinT * sinP;

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

            // 【触手の集合・拡散ロジック】周期的に一箇所に集まったり広がったりする
            // 生える場所（phi, theta）を時間経過でオフセットさせて、特定の方向に寄せる
            const gatheringCycle = Math.sin(this.time * 0.1) * 0.5 + 0.5; // 0.0(通常) 〜 1.0(集合)
            
            // 集合地点（ターゲット方向）をゆっくり回転させる
            const targetPhi = this.time * 0.05; // 0.2 -> 0.05
            const targetTheta = Math.PI * 0.5 + Math.sin(this.time * 0.04) * 0.5; // 0.15 -> 0.04
            
            // 元の角度とターゲット角度を補間
            const currentPhi = t.phi * (1.0 - gatheringCycle * 0.8) + targetPhi * (gatheringCycle * 0.8);
            const currentTheta = t.theta * (1.0 - gatheringCycle * 0.8) + targetTheta * (gatheringCycle * 0.8);

            // 触手ごとの個別のバイアス（動きには残すが、色には使わない）
            const tentacleNoise = Math.sin(this.time * 0.05 + i * 0.5) * 0.5 + 0.5; // 0.2 -> 0.05
            const individualSpeed = speed * (0.5 + tentacleNoise * 1.5);
            const individualAmp = waveAmp * (0.3 + Math.cos(this.time * 0.03 + i * 0.8) * 0.7); // 0.1 -> 0.03

            const angleOffsetPhi = Math.sin(this.time * moveSpeed * 0.5 + i) * 0.1; // moveSpeed * 0.5
            const angleOffsetTheta = Math.cos(this.time * moveSpeed * 0.4 + i * 1.5) * 0.1; // moveSpeed * 0.4
            
            // 集合ロジックを反映した回転
            t.mesh.rotation.set(currentTheta + angleOffsetTheta - t.theta, currentPhi + angleOffsetPhi - t.phi, 0);
            
            const focusVec = new THREE.Vector3();
            if (focusWeight > 0) { 
                focusVec.copy(this.focusTarget).sub(this.tentacleGroup.position).applyQuaternion(this.tentacleGroup.quaternion.clone().invert()).normalize(); 
            }
            
            // 触手ごとの長さの揺らぎを計算（ノイズで偏りを持たせる）
            // 空間的な偏りを出すために、触手の生えている方向（phi, theta）をベースにノイズを計算
            const lengthScale = 0.5;
            const lengthNoiseBase = (
                Math.sin(t.phi * 2.0 + this.time * 0.05) * // 0.15 -> 0.05
                Math.cos(t.theta * 2.0 - this.time * 0.03) // 0.1 -> 0.03
            );
            // 【修正】最短を 0.1倍（ほぼ消える）、最長を 1.5倍にして、伸縮の幅を極端にする
            const dynamicLength = 0.1 + (lengthNoiseBase * 0.5 + 0.5) * 1.4;
            
            const lengthNoise = ((Math.sin(this.time * 0.1 + i * 1.2) * 0.5 + 0.5) * 0.5 + 0.75) * dynamicLength; // 0.3 -> 0.1

            for (let s = 0; s <= 64; s++) {
                const u = s / 64; 
                const time = this.time * individualSpeed * totalForce; 
                
                // 【重要】根元から先端へ伝わるウェーブ
                const wavePhase = u * waveFreq + i * 2.0;
                const propagation = u * 4.0; 
                
                const currentAmp = individualAmp * totalForce;

                let offsetX = (
                    Math.sin(time - propagation + wavePhase) * 1.2 + 
                    Math.sin(time * 2.5 - propagation * 1.5 + wavePhase * 2.0) * 0.8
                ) * currentAmp * u;
                
                let offsetY = (
                    Math.cos(time * 0.8 - propagation * 1.2 + wavePhase + i) * 1.2 + 
                    Math.cos(time * 3.2 - propagation * 2.0 + wavePhase * 2.5) * 0.7
                ) * currentAmp * u;
                
                let offsetZ = (
                    Math.sin(time * 1.1 - propagation * 0.8 + wavePhase + i * 1.5) * 1.2 + 
                    Math.sin(time * 2.8 - propagation * 1.8 + wavePhase * 3.0) * 0.8
                ) * currentAmp * u;
                
                // 【先端の巻き強化】
                const curlIntensity = Math.pow(u, 2.5) * 150.0 * totalForce; 
                const curlAngle = time * 2.0 + u * 10.0;
                offsetX += Math.sin(curlAngle) * curlIntensity;
                offsetY += Math.cos(curlAngle) * curlIntensity;

                if (focusWeight > 0) {
                    const focusStrength = u * 250.0 * focusWeight;
                    offsetX = offsetX * (1.0 - focusWeight * 0.5) + focusVec.x * focusStrength;
                    offsetY = offsetY * (1.0 - focusWeight * 0.5) + focusVec.y * focusStrength;
                    offsetZ = offsetZ * (1.0 - focusWeight * 0.5) + focusVec.z * focusStrength;
                }
                const intensity = Math.pow(u, 1.1);
                
                // 触手の色計算：多段階標高ヒートマップ
                // 触手の各頂点の空間座標（vPos）を使って標高色を計算
                const vPos = new THREE.Vector3(offsetX, offsetY, offsetZ);
                // u（先端への距離）を使って、先端ほど「別の色」になるようにフラグを渡す
                const isTipArea = u > 0.7; // 先端30%を別色エリアとする
                const color = getElevationHeatColor(vPos, skinColor, this.time, isTipArea);
                
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
