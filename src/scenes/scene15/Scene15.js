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
        this.title = 'Xenoball';
        this.initialized = false;
        this.sceneNumber = 15;
        this.kitNo = 5;
        
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
        
        // 周期（スピード）を大幅に落として、変化をゆったりさせる（第1, 第2引数をさらに小さく）
        this.noiseScaleLFO = new RandomLFO(0.0002, 0.001, 0.02, 0.15); // スケールをさらに小さく（粗く）、周期も極限まで遅く
        this.noiseStrengthLFO = new RandomLFO(0.001, 0.005, 100.0, 250.0); // 強度を大幅アップ、周期も遅く
        
        // 圧力エフェクト管理
        this.pressurePoints = []; // 叩かれた地点
        this.pressureStrengths = []; // 各地点の現在の強度（フェード用）
        this.targetPressureStrengths = []; // 各地点の目標強度
        for(let i=0; i<10; i++) {
            this.pressurePoints.push(new THREE.Vector3(0,0,0));
            this.pressureStrengths.push(0.0);
            this.targetPressureStrengths.push(0.0);
        }
        this.pressureDirections = []; // 圧力の方向（1.0: 凹む, -1.0: 膨らむ）
        for(let i=0; i<10; i++) {
            this.pressureDirections.push(1.0);
        }
        this.currentPressureIdx = 0;
        this.lastPressureTime = 0;
        this.lastPressurePoint = new THREE.Vector3(0, 1, 0);

        // 変形モード管理（時間で自動変化）
        this.deformModeTransition = 0.0; 
        this.patternCount = 15; // 15種類に増やす
        this.patternTransition = new Float32Array(this.patternCount).fill(0); // パターンの影響度

        // クリオネ遊泳アニメーション管理
        this.swimTime = 0;
        this.swimPhase = 0; // 0: 溜め, 1: 蹴り（ぴょん）
        this.swimVelocity = new THREE.Vector3();
        this.basePosition = new THREE.Vector3(0, 400, 0);
        this.targetPosition = new THREE.Vector3(0, 400, 0);
        this.swimRotation = new THREE.Euler();
        this.swimScale = new THREE.Vector3(1, 1, 1);

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
     * カメラパーティクルの距離パラメータを設定
     */
    setupCameraParticleDistance(cameraParticle) {
        cameraParticle.minDistance = 400;
        cameraParticle.maxDistance = 3000;
        cameraParticle.minY = -450; // 地面より下に行かないように制限
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

        this.showGridRuler3D = false; // デフォルトでオフ
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

    createDeformableMesh() {
        const geometry = new THREE.IcosahedronGeometry(400, 44); 
        const noiseShaderChunk = `
            uniform float uTime;
            uniform float uNoiseScale;
            uniform float uNoiseStrength;
            uniform float uDeformModeTransition;
            uniform float uPatternTransition[15];
            uniform vec3 uPressurePoints[10];
            uniform float uPressureStrengths[10];
            uniform float uPressureDirections[10];
            varying float vNoise;
            varying float vPressure;
            varying float vDisplacement; // 変位量をフラグメントシェーダーに渡す

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
            
            // 15種類の非対称・有機的変形パターン
            float p[15];
            p[0] = sin(longitude * 3.0 + nPos.y * 5.0 + uTime * 2.0 + sin(latitude * 2.0)) * 150.0; // Asymmetric Spiral
            p[1] = snoise(vec4(nPos * 2.5, uTime * 0.5)) * 180.0; // Organic Swell
            p[2] = (sin(nPos.x * 4.0 + uTime) * cos(nPos.y * 3.0 - uTime) * sin(nPos.z * 5.0 + uTime * 0.5)) * 150.0; // Pulsing Distortion
            p[3] = snoise(vec4(nPos.x * 5.0, nPos.y * 1.0, nPos.z * 5.0, uTime * 0.8)) * 160.0; // Vertical Stretch
            p[4] = sin(longitude * 10.0 + uTime * 4.0) * 80.0 * smoothstep(0.5, -0.5, nPos.y); // Bottom Ripple
            p[5] = snoise(vec4(nPos * 8.0, uTime * 1.2)) * 100.0; // Micro Turbulence
            p[6] = (sin(nPos.y * 6.0 + uTime * 3.0) + snoise(vec4(nPos * 1.5, uTime * 0.3))) * 120.0; // Jellyfish Motion
            p[7] = sin(nPos.x * 3.0 + nPos.z * 3.0 + uTime * 2.0) * 140.0; // Lateral Sway
            p[8] = (abs(snoise(vec4(nPos * 2.0, uTime * 0.4))) * 200.0) - 100.0; // Bulky Growth
            p[9] = sin(latitude * 8.0 + longitude * 4.0 + uTime * 5.0) * 90.0; // Helical Wave
            
            // 追加の奇妙なパターン
            p[10] = (sin(nPos.x * 15.0) * cos(nPos.z * 15.0) * sin(nPos.y * 2.0 + uTime)) * 100.0; // Spiky Barnacles
            p[11] = snoise(vec4(nPos.xyz * 0.5, uTime * 0.1)) * 300.0 * pow(abs(nPos.y), 2.0); // Top/Bottom Heavy
            p[12] = (sin(longitude * 2.0 - uTime) * exp(nPos.y * 2.0)) * 80.0; // Expanding Crown
            p[13] = (snoise(vec4(nPos * 4.0, uTime)) * snoise(vec4(nPos * 0.5, uTime * 0.2))) * 250.0; // Fractal Chaos
            p[14] = (sin(latitude * 20.0 + uTime * 10.0) * 30.0) + (sin(longitude * 5.0) * 100.0); // Corrugated Ring

            float totalPatternDisplacement = 0.0;
            for(int i = 0; i < 15; i++) {
                totalPatternDisplacement += p[i] * uPatternTransition[i];
            }
            
            float noiseValue = snoise(vec4(latitude * uNoiseScale, sin(longitude) * uNoiseScale, cos(longitude) * uNoiseScale, uTime * uNoiseScale * 0.1));
            vNoise = noiseValue;
            float totalPressure = 0.0;
            for(int i = 0; i < 10; i++) {
                float d = distance(nPos, normalize(uPressurePoints[i]));
                totalPressure += smoothstep(0.8, 0.0, d) * uPressureStrengths[i] * uPressureDirections[i];
            }
            vPressure = totalPressure;
            
            // 通常のノイズ変形と各種パターン変形をミックス
            float baseDisplacement = noiseValue * uNoiseStrength - totalPressure;
            float displacement = baseDisplacement * (1.0 - uDeformModeTransition) + totalPatternDisplacement * uDeformModeTransition;
            vDisplacement = displacement; // フラグメントシェーダー用に保存
            vec3 transformed = position + normal * displacement;
        `;

        this.material = new THREE.MeshStandardMaterial({ 
            color: 0x050505, // 深い黒
            metalness: 1.0,  // 金属感
            roughness: 0.1,  // ツルツル
            envMapIntensity: 0.2, // 1.5から0.2に大幅に下げて、縁の白浮きを抑える
        });
        this.material.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = { value: 0 };
            shader.uniforms.uNoiseScale = { value: this.noiseScale };
            shader.uniforms.uNoiseStrength = { value: this.noiseStrength };
            shader.uniforms.uDeformModeTransition = { value: this.deformModeTransition };
            shader.uniforms.uPatternTransition = { value: this.patternTransition };
            shader.uniforms.uPressurePoints = { value: this.pressurePoints };
            shader.uniforms.uPressureStrengths = { value: this.pressureStrengths };
            shader.uniforms.uPressureDirections = { value: this.pressureDirections };
            shader.vertexShader = noiseShaderChunk + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', vertexDisplacementChunk);
            
            // フラグメントシェーダーにヒートマップロジックを注入
            shader.fragmentShader = `varying float vDisplacement;\n` + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                `
                #include <dithering_fragment>
                // ヒートマップ適用：しきい値を極限まで下げて、わずかな変形でも色が変わるように
                // 2.0（ごくわずかな変形）〜80.0（中程度の変形）でグラデーション
                float heat = smoothstep(2.0, 80.0, vDisplacement);
                
                // 標準的なヒートマップ色（青 -> 緑 -> 黄 -> 赤）
                vec3 heatColor;
                if (heat < 0.25) {
                    heatColor = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), heat * 4.0); // 青 -> シアン
                } else if (heat < 0.5) {
                    heatColor = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), (heat - 0.25) * 4.0); // シアン -> 緑
                } else if (heat < 0.75) {
                    heatColor = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (heat - 0.5) * 4.0); // 緑 -> 黄
                } else {
                    heatColor = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), (heat - 0.75) * 4.0); // 黄 -> 赤
                }
                
                // ベースカラーを染める
                gl_FragColor.rgb = mix(gl_FragColor.rgb, heatColor, heat * 1.0); // 黒を完全に上書き
                
                // さらに発光（Emissive）成分として足して、サーモグラフィっぽく光らせる！
                gl_FragColor.rgb += heatColor * heat * 1.5; // 発光強度をさらにアップ
                `
            );
            this.material.userData.shader = shader;
        };

        const depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
        depthMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = { value: 0 };
            shader.uniforms.uNoiseScale = { value: this.noiseScale };
            shader.uniforms.uNoiseStrength = { value: this.noiseStrength };
            shader.uniforms.uDeformModeTransition = { value: this.deformModeTransition };
            shader.uniforms.uPatternTransition = { value: this.patternTransition };
            shader.uniforms.uPressurePoints = { value: this.pressurePoints };
            shader.uniforms.uPressureStrengths = { value: this.pressureStrengths };
            shader.uniforms.uPressureDirections = { value: this.pressureDirections };
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
            this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 4, window.innerHeight / 4), 0.2, 0.1, 1.2);
            this.composer.addPass(this.bloomPass);
        }
        if (this.useDOF) {
            this.bokehPass = new BokehPass(this.scene, this.camera, { focus: 500, aperture: 0.000005, maxblur: 0.003, width: window.innerWidth, height: window.innerHeight });
            this.composer.addPass(this.bokehPass);
        }
    }

    onUpdate(deltaTime) {
        if (!this.initialized) return;
        for(let i=0; i<10; i++) {
            // 目標値に向けて滑らかに変化（イージング）
            this.pressureStrengths[i] += (this.targetPressureStrengths[i] - this.pressureStrengths[i]) * 0.1;
            // 目標値自体は時間とともに減衰
            this.targetPressureStrengths[i] *= 0.98;
        }

        // 変形モードの自動遷移（時間経過でゆっくりサイン波のように変化）
        // 約30秒周期で通常と特殊変形を行き来する
        this.deformModeTransition = Math.pow(Math.sin(this.time * 0.07), 2.0); 

        // どのパターンを表示するかを時間で切り替える（15パターンを巡回）
        const cycleSpeed = 0.15; // 少し速めて変化を見やすく
        for (let i = 0; i < this.patternCount; i++) {
            const offset = (i / this.patternCount) * Math.PI * 2;
            this.patternTransition[i] = Math.max(0, Math.sin(this.time * cycleSpeed + offset));
        }
        
        // 合計が1になるように正規化（滑らかなブレンドのため）
        let sum = 0;
        for (let i = 0; i < this.patternCount; i++) sum += this.patternTransition[i];
        if (sum > 0) {
            for (let i = 0; i < this.patternCount; i++) this.patternTransition[i] /= sum;
        }

        if (this.mainMesh) this.mainMesh.visible = this.showMainMesh;
        
        // 漂う動きを停止（位置を固定）
        if (this.mainMesh) {
            this.mainMesh.position.set(0, 400, 0);
            this.mainMesh.scale.set(1, 1, 1);
            // 回転もリセットしたい場合は以下を追加
            // this.mainMesh.rotation.set(0, 0, 0);
        }

        // カメラを常に物体に向ける（このシーンだけの特別仕様）
        if (this.mainMesh) {
            this.camera.lookAt(this.mainMesh.position);
        }

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
            s.uniforms.uDeformModeTransition.value = this.deformModeTransition;
            s.uniforms.uPatternTransition.value = this.patternTransition;
            s.uniforms.uPressurePoints.value = this.pressurePoints;
            s.uniforms.uPressureStrengths.value = this.pressureStrengths;
            s.uniforms.uPressureDirections.value = this.pressureDirections;
        }
        const ds = this.mainMesh?.customDepthMaterial?.userData?.shader;
        if (ds) {
            ds.uniforms.uTime.value = this.time;
            ds.uniforms.uNoiseScale.value = this.noiseScale;
            ds.uniforms.uNoiseStrength.value = this.noiseStrength;
            ds.uniforms.uDeformModeTransition.value = this.deformModeTransition;
            ds.uniforms.uPatternTransition.value = this.patternTransition;
            ds.uniforms.uPressurePoints.value = this.pressurePoints;
            ds.uniforms.uPressureStrengths.value = this.pressureStrengths;
            ds.uniforms.uPressureDirections.value = this.pressureDirections;
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
            else { 
                s.mesh.position.y = -500 + progress * 5000; 
                // サインカーブでフェードイン・アウト（最初と最後が滑らかになる）
                s.mesh.material.opacity = Math.pow(Math.sin(progress * Math.PI), 2.0) * 0.8; 
                // スケールも少し変化させて有機的に
                const scale = 1.0 + Math.sin(progress * Math.PI) * 0.1;
                s.mesh.scale.set(scale, 1.0, scale);
            }
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
            this.targetPressureStrengths[this.currentPressureIdx] = (velocity / 127.0) * 200.0;
            // 50%の確率で「内側から外側へ向かう力（膨らむ）」にする
            this.pressureDirections[this.currentPressureIdx] = Math.random() > 0.5 ? -1.0 : 1.0;
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
            targetDistance = Math.max(100, (this.mainMesh.position.clone().sub(this.camera.position)).dot(targetVec));
        }
        const currentFocus = this.bokehPass.uniforms.focus.value;
        this.bokehPass.uniforms.focus.value = currentFocus + (targetDistance - currentFocus) * 0.1;
    }

    updateSwimming(deltaTime) {
        if (!this.mainMesh) return;

        this.swimTime += deltaTime;
        
        // ぴょん、ぴょーんのリズム（約12秒周期にして究極にたゆたわせる）
        const cycle = (this.swimTime * 0.08) % 1.0;
        
        // 0.0 - 0.4: 溜め（極限までゆっくり縮む）
        // 0.4 - 0.6: 蹴り（超マイルドに加速）
        // 0.6 - 1.0: 慣性移動（宇宙を漂うような浮遊感）
        
        let power = 0;
        if (cycle > 0.4 && cycle < 0.6) {
            // 蹴り出しの瞬間
            const t = (cycle - 0.4) / 0.2;
            power = Math.sin(t * Math.PI);
            
            // 新しい目標方向をランダムに決める（蹴り出しの最初だけ）
            if (cycle < 0.45 && this.swimPhase !== 1) {
                const range = 800; // 移動範囲をさらに絞る
                this.targetPosition.set(
                    (Math.random() - 0.5) * range,
                    400 + (Math.random() - 0.5) * 300,
                    (Math.random() - 0.5) * range
                );
                this.swimPhase = 1;
            }
        } else {
            this.swimPhase = 0;
        }

        // 移動処理にノイズを混ぜて直線的な動きを排除
        const noiseX = Math.sin(this.swimTime * 0.5) * 100.0;
        const noiseY = Math.cos(this.swimTime * 0.3) * 100.0;
        const noiseZ = Math.sin(this.swimTime * 0.4) * 100.0;
        const noisyTarget = this.targetPosition.clone().add(new THREE.Vector3(noiseX, noiseY, noiseZ));

        const dir = noisyTarget.sub(this.mainMesh.position).normalize();
        const speed = power * 150 * deltaTime; // スピードを300から150にさらに半減
        this.swimVelocity.add(dir.multiplyScalar(speed));
        this.swimVelocity.multiplyScalar(0.99); // 摩擦をさらに強めて、たゆたう感じを出す
        this.mainMesh.position.add(this.swimVelocity);

        // 境界チェック
        const limit = 3500;
        if (Math.abs(this.mainMesh.position.x) > limit) this.swimVelocity.x *= -0.5;
        if (Math.abs(this.mainMesh.position.z) > limit) this.swimVelocity.z *= -0.5;
        if (this.mainMesh.position.y < 50 || this.mainMesh.position.y > 3500) this.swimVelocity.y *= -0.5;

        // 回転処理（進行方向を向く）
        if (this.swimVelocity.length() > 0.02) {
            const lookTarget = this.mainMesh.position.clone().add(this.swimVelocity);
            const dummy = new THREE.Object3D();
            dummy.position.copy(this.mainMesh.position);
            dummy.lookAt(lookTarget);
            this.mainMesh.quaternion.slerp(dummy.quaternion, 0.01); // 回転も極限までゆっくり
        }

        // スクアッシュ＆ストレッチ（さらに控えめに）
        const stretch = 1.0 + power * 0.1 - (cycle < 0.4 ? Math.sin((cycle/0.4) * Math.PI) * 0.05 : 0);
        const squash = 1.0 / Math.sqrt(stretch);
        this.mainMesh.scale.set(squash, stretch, squash);
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
        this.fluorescentLights = [];
        this.scanners.forEach(s => { this.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); });
        this.scanners = [];
        super.dispose();
    }
}
