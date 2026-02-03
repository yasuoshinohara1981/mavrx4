/**
 * Scene12: 新規シーン（テンプレートベース）
 */

import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import { Scene12Particle } from './Scene12Particle.js';

export class Scene12 extends SceneBase {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera);
        this.title = 'Scene 12';  // シーンのタイトルを設定
        
        // 共有リソースマネージャー
        this.sharedResourceManager = sharedResourceManager;
        this.useSharedResources = !!sharedResourceManager;
        
        // Sphereの設定
        this.sphereCount = 500;
        this.spawnRadius = 600; // 少し狭めて中心に寄せる
        
        // インスタンス管理
        this.instancedMeshManager = null;
        this.particles = [];
        
        // DOF設定
        this.useDOF = true;
        this.bokehPass = null;
        
        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
    }
    
    /**
     * セットアップ処理（シーン切り替え時に呼ばれる）
     */
    async setup() {
        // 親クラスのsetup()を呼ぶ
        await super.setup();
        
        // カメラの描画距離を調整（DOFの精度にも影響）
        if (this.camera) {
            this.camera.far = 20000;
            this.camera.updateProjectionMatrix();
        }

        // 3Dグリッドとルーラーの初期化（デフォルトで表示）
        this.showGridRuler3D = true;
        this.initGridRuler3D({
            center: { x: 0, y: 0, z: 0 },
            size: { x: 1000, y: 1000, z: 1000 },
            floorY: -500,
            floorSize: 2000,
            floorDivisions: 40,
            labelMax: 64
        });

        // ライトの追加
        this.setupLights();

        // Sphereの作成
        this.createSpheres();

        // DOFの初期化
        if (this.useDOF) {
            this.initDOF();
        }
    }

    /**
     * ライトの設定
     */
    setupLights() {
        // 全体を柔らかく照らす
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x222222, 0.6);
        this.scene.add(hemiLight);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(1000, 1500, 1000);
        this.scene.add(directionalLight);

        // 中心付近を照らす
        const pointLight = new THREE.PointLight(0xffffff, 1.5, 1500);
        pointLight.position.set(0, 800, 0); 
        this.scene.add(pointLight);
    }

    /**
     * 3Dグリッドとルーラーを初期化
     */
    initGridRuler3D(params) {
        // グリッドの視認性を調整（暗すぎず、ギラつかず）
        const adjustedParams = {
            ...params,
            color: 0x888888, // 0x444444から明るく変更
            opacity: 0.5     // 0.3から視認性アップ
        };
        super.initGridRuler3D(adjustedParams);
    }

    /**
     * Sphereをランダムに配置（GPUインスタンシング版）
     */
    createSpheres() {
        const geometry = new THREE.SphereGeometry(1, 32, 32);
        
        // ノイズテクスチャの生成（表面の凹凸用）
        const noiseTexture = this.generateNoiseTexture();

        // マテリアル（インスタンス間で共有）
        const material = new THREE.MeshStandardMaterial({
            color: 0xcccccc, // 0x888888から明るく変更
            metalness: 0.5,  // 金属感を少し抑えて色味を出す
            roughness: 0.3,
            bumpMap: noiseTexture,
            bumpScale: 0.5,
            emissive: 0x333333, // 少し明るく
            emissiveIntensity: 0.1
        });

        this.instancedMeshManager = new InstancedMeshManager(this.scene, geometry, material, this.sphereCount);

        for (let i = 0; i < this.sphereCount; i++) {
            // 中心に寄せる配置
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = Math.pow(Math.random(), 1.5) * this.spawnRadius; 
            
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            // サイズをランダム化 (5〜25)
            const radius = 5 + Math.random() * 20;

            // パーティクル作成
            const particle = new Scene12Particle(x, y, z, radius);
            
            // 初速を少し与える
            particle.velocity.set(
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5
            );
            
            // 回転速度を少し上げる
            particle.angularVelocity.multiplyScalar(2.0);

            this.particles.push(particle);

            // インスタンスの初期マトリックスを設定
            this.instancedMeshManager.setMatrixAt(i, particle.position, particle.rotation, radius);
        }
        
        this.instancedMeshManager.markNeedsUpdate();
        this.setParticleCount(this.sphereCount);
    }

    /**
     * バンプマップ用のノイズテクスチャを生成
     */
    generateNoiseTexture() {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        const imageData = ctx.createImageData(size, size);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            const val = Math.floor(Math.random() * 255);
            data[i] = val;
            data[i + 1] = val;
            data[i + 2] = val;
            data[i + 3] = 255;
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    /**
     * DOF（被写界深度）エフェクトを初期化
     */
    initDOF() {
        if (this.bokehPass) return;

        if (!this.composer) {
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
        }

        const params = {
            focus: 500.0,
            aperture: 0.00001, // 0.00005からさらに絞って（値を小さくして）ピントが合う範囲を広げる
            maxblur: 0.005,    // 0.01から半分にして、ボケをより自然で控えめにする
            width: window.innerWidth,
            height: window.innerHeight
        };

        this.bokehPass = new BokehPass(this.scene, this.camera, params);
        this.bokehPass.enabled = true;
        this.composer.addPass(this.bokehPass);
        
        console.log("Scene12: DOF (BokehPass) initialized.");
    }
    
    /**
     * 更新処理（毎フレーム呼ばれる）
     * @param {number} deltaTime - 前フレームからの経過時間（秒）
     */
    onUpdate(deltaTime) {
        this.time += deltaTime;

        // 物理演算と衝突判定
        this.updatePhysics(deltaTime);

        // DOFのフォーカスをカメラから原点付近の距離に合わせる
        if (this.useDOF && this.bokehPass) {
            // カメラから原点までの距離を計算
            const dist = this.camera.position.length();
            this.bokehPass.uniforms.focus.value = dist;
        }
    }

    /**
     * 物理演算と衝突判定の更新
     */
    updatePhysics(deltaTime) {
        const subSteps = 2; // 精度向上のためのサブステップ
        const dt = deltaTime / subSteps;

        for (let s = 0; s < subSteps; s++) {
            // 1. 位置の更新と中心への引力
            for (let i = 0; i < this.particles.length; i++) {
                const p = this.particles[i];
                
                // 中心への微弱な引力
                const gravity = p.position.clone().multiplyScalar(-0.01);
                p.addForce(gravity);
                
                // Particleクラスのupdate()を呼び出す
                p.update();

                // 回転の更新
                p.updateRotation(dt);
            }

            // 2. 衝突判定（球体同士の押し出し）
            for (let i = 0; i < this.particles.length; i++) {
                for (let j = i + 1; j < this.particles.length; j++) {
                    const a = this.particles[i];
                    const b = this.particles[j];
                    
                    const diff = a.position.clone().sub(b.position);
                    const distSq = diff.lengthSq();
                    const minDist = a.radius + b.radius;
                    
                    if (distSq < minDist * minDist) {
                        const dist = Math.sqrt(distSq);
                        const overlap = minDist - dist;
                        const normal = diff.divideScalar(dist || 1);
                        
                        // 押し戻し
                        const push = normal.clone().multiplyScalar(overlap * 0.5);
                        a.position.add(push);
                        b.position.sub(push);
                        
                        // 速度の反射
                        const relativeVelocity = a.velocity.clone().sub(b.velocity);
                        const velocityAlongNormal = relativeVelocity.dot(normal);
                        
                        if (velocityAlongNormal < 0) {
                            const restitution = 0.5;
                            const impulse = normal.multiplyScalar(-(1 + restitution) * velocityAlongNormal * 0.5);
                            a.velocity.add(impulse);
                            b.velocity.sub(impulse);
                        }
                    }
                }
            }
        }

        // 3. 全インスタンスのマトリックスを一括更新
        if (this.instancedMeshManager) {
            for (let i = 0; i < this.particles.length; i++) {
                const p = this.particles[i];
                this.instancedMeshManager.setMatrixAt(i, p.position, p.rotation, p.radius);
            }
            this.instancedMeshManager.markNeedsUpdate();
        }
    }
    
    /**
     * OSCメッセージの処理
     * @param {number} trackNumber - トラック番号（5-9）
     * @param {Object} message - OSCメッセージ
     */
    handleTrackNumber(trackNumber, message) {
        // ここにトラック5-9の処理を記述
    }
    
    /**
     * リセット処理
     */
    reset() {
        super.reset();
    }
    
    /**
     * クリーンアップ処理
     */
    dispose() {
        console.log('Scene12.dispose: クリーンアップ開始');
        
        // インスタンス管理の破棄
        if (this.instancedMeshManager) {
            this.instancedMeshManager.dispose();
            this.instancedMeshManager = null;
        }
        this.particles = [];

        // DOFの破棄
        if (this.bokehPass) {
            this.bokehPass.enabled = false;
            this.bokehPass = null;
        }

        super.dispose();
    }
}
