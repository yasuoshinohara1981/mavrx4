/**
 * Scene08: 布のシミュレーション
 * スプリング構造を活かして布を表現
 */

import { SceneBase } from '../SceneBase.js';
import { Particle } from '../../lib/Particle.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export class Scene08 extends SceneBase {
    constructor(renderer, camera) {
        super(renderer, camera);
        this.title = 'mathym | t7:Romls (version 2.)';
        
        // CPU版を使用（GPU版は削除）
        this.useGPU = false;
        
        // グリッド設定
        this.gridSizeX = 200; // CPU版は200x200 = 40000パーティクル
        this.gridSizeZ = 200;
        this.gridSpacing = 10.0; // グリッド間隔
        this.sphereRadius = 1.0; // Sphereの半径
        
        // スプリング拘束設定（力が伝わりやすくするため、剛性を上げて減衰を下げる）
        this.springStiffness = 0.2; // スプリングの剛性（力を伝えやすくするため上げる：0.15 → 0.2）
        this.springDamping = 0.01; // スプリングの減衰（力を減衰させないため下げる：0.02 → 0.01）
        this.restLength = this.gridSpacing; // スプリングの自然長
        
        // 復元力設定（元の位置に戻る力、適度に保つ）
        this.restoreStiffness = 0.001; // 復元力の剛性（元に戻る力を上げる：0.00005 → 0.001）
        this.restoreDamping = 0.0005; // 復元力の減衰（適度に保つ：0.0001 → 0.0005）
        
        // パーティクル設定
        this.numParticles = this.gridSizeX * this.gridSizeZ;
        this.particles = [];
        this.particleMasses = [];
        this.initialPositions = [];
        
        
        // ヒートマップ用の色設定（すぐに真っ赤にならないように範囲を広げる）
        this.heatMapMinValue = 0.0;
        this.heatMapMaxValue = 30.0; // 8.0 → 30.0に変更（より高い速度まで対応）
        
        // 線で接続するための情報
        this.connections = [];
        this.lineGeometry = null;
        this.lineMesh = null;
        
        // 時間変数
        this.time = 0.0;
        
        // アクティブな力のリスト（デュレーション対応）
        this.activeForces = [];
        
        // アクティブな下からの力のリスト（突き上げ、デュレーション対応）
        this.activeUpwardForces = [];
        
        // 前回の力の中心位置（ロール時の連続性のため）
        this.lastForceCenter = null;
        
        // Boxの範囲（見えないBoxの境界）
        const gridWidth = (this.gridSizeX - 1) * this.gridSpacing;
        const gridDepth = (this.gridSizeZ - 1) * this.gridSpacing;
        this.boxMin = new THREE.Vector3(-gridWidth * 0.6, -500, -gridDepth * 0.6);
        this.boxMax = new THREE.Vector3(gridWidth * 0.6, 500, gridDepth * 0.6);
        
        // 地面設定（Scene07と同じ）
        this.groundY = 0.0;
        
        // 重力設定（Scene07と同じ）
        this.gravity = new THREE.Vector3(0, -3.5, 0);
        
        // 色収差エフェクト（トラック3用）
        this.composer = null;
        this.chromaticAberrationPass = null;
        this.chromaticAberrationAmount = 0.0;
        this.chromaticAberrationEndTime = 0;
        this.chromaticAberrationKeyPressed = false;
        
        // グリッチエフェクト（トラック4用）
        this.glitchPass = null;
        this.glitchAmount = 0.0;
        this.glitchEndTime = 0;
        this.glitchKeyPressed = false;
        
        // ブルームエフェクト
        this.bloomPass = null;
        this.bloomEnabled = true;
        
        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
    }
    
    async setup() {
        await super.setup();
        
        // ライトを設定
        this.setupLights();
        
        // CPU版を初期化
        await this.createParticles();
        this.createConnections();
        
        // カメラパーティクルの距離パラメータを再設定
        if (this.cameraParticles) {
            for (const cameraParticle of this.cameraParticles) {
                this.setupCameraParticleDistance(cameraParticle);
            }
        }
        
        // 色収差エフェクトを初期化
        this.initChromaticAberration();
    }
    
    /**
     * ライトを設定
     */
    setupLights() {
        // 環境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        // ディレクショナルライト
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
        directionalLight.position.set(0, 500, 500);
        this.scene.add(directionalLight);
        
        // ポイントライト（布の動きを強調）
        const pointLight = new THREE.PointLight(0xffffff, 0.5, 2000);
        pointLight.position.set(0, 300, 0);
        this.scene.add(pointLight);
    }
    
    /**
     * パーティクルを作成（平面状に配置、布の初期状態）
     */
    async createParticles() {
        // Points用のジオメトリとマテリアル
        const positions = new Float32Array(this.numParticles * 3);
        const colors = new Float32Array(this.numParticles * 3);
        const sizes = new Float32Array(this.numParticles);
        
        const pointsGeometry = new THREE.BufferGeometry();
        pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        pointsGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        // PointsMaterial
        const pointsMaterial = new THREE.PointsMaterial({
            size: this.sphereRadius * 2.0,
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
            alphaTest: 0.1
        });
        
        // Pointsメッシュを作成
        this.pointsMesh = new THREE.Points(pointsGeometry, pointsMaterial);
        // CPU版の場合のみシーンに追加（GPU版では追加しない）
        if (!this.useGPU) {
            this.scene.add(this.pointsMesh);
        }
        
        // 後で更新するために保存
        this.pointsPositions = positions;
        this.pointsColors = colors;
        this.pointsSizes = sizes;
        
        // グリッドの範囲を計算
        const gridWidth = (this.gridSizeX - 1) * this.gridSpacing;
        const gridDepth = (this.gridSizeZ - 1) * this.gridSpacing;
        
        // 格子状にパーティクルを配置（Scene07と同じ初期配置）
        let particleIndex = 0;
        for (let z = 0; z < this.gridSizeZ; z++) {
            for (let x = 0; x < this.gridSizeX; x++) {
                // グリッド位置を計算（中心を原点に）
                const gridX = -gridWidth / 2 + x * this.gridSpacing;
                const gridZ = -gridDepth / 2 + z * this.gridSpacing;
                const y = this.groundY + this.sphereRadius; // 地面の上（Scene07と同じ）
                
                // パーティクルを作成（力を伝えやすくするため、質量を下げて摩擦を下げる）
                const particle = new Particle(gridX, y, gridZ);
                particle.maxSpeed = 30.0; // 最大速度を上げる（20.0 → 30.0）
                particle.maxForce = 15.0; // 最大力を上げる（10.0 → 15.0）
                particle.friction = 0.005; // 摩擦を下げる（力を伝えやすくする：0.02 → 0.005）
                particle.mass = 0.5; // 質量を下げる（動きやすくする：1.0 → 0.5）
                this.particles.push(particle);
                this.particleMasses.push(1.0);
                
                // 初期位置を保存（復元力用）
                this.initialPositions.push(new THREE.Vector3(gridX, y, gridZ));
                
                // Pointsの位置とサイズを設定
                const idx = particleIndex * 3;
                this.pointsPositions[idx] = gridX;
                this.pointsPositions[idx + 1] = y;
                this.pointsPositions[idx + 2] = gridZ;
                this.pointsSizes[particleIndex] = this.sphereRadius * 2.0;
                
                // 初期色（Scene07と同じ、青）
                this.pointsColors[idx] = 0.0;     // R
                this.pointsColors[idx + 1] = 0.0; // G
                this.pointsColors[idx + 2] = 1.0; // B
                
                particleIndex++;
            }
        }
        
        // Pointsの属性を更新
        pointsGeometry.attributes.position.needsUpdate = true;
        pointsGeometry.attributes.color.needsUpdate = true;
        pointsGeometry.attributes.size.needsUpdate = true;
        
        this.setParticleCount(particleIndex);
        console.log(`✅ ${particleIndex}個のパーティクルを格子状に配置しました（Scene07と同じ初期配置）`);
    }
    
    /**
     * 線で接続（隣接するパーティクル同士を線で繋ぐ）
     */
    createConnections() {
        this.connections = [];
        
        // 各パーティクルに対して、隣接するパーティクルを接続
        for (let z = 0; z < this.gridSizeZ; z++) {
            for (let x = 0; x < this.gridSizeX; x++) {
                const index = z * this.gridSizeX + x;
                
                // 右隣（X+1）
                if (x < this.gridSizeX - 1) {
                    const rightIndex = z * this.gridSizeX + (x + 1);
                    this.connections.push({ from: index, to: rightIndex });
                }
                
                // 下隣（Z+1）
                if (z < this.gridSizeZ - 1) {
                    const bottomIndex = (z + 1) * this.gridSizeX + x;
                    this.connections.push({ from: index, to: bottomIndex });
                }
                
                // 右下対角線（X+1, Z+1）
                if (x < this.gridSizeX - 1 && z < this.gridSizeZ - 1) {
                    const diagonalIndex = (z + 1) * this.gridSizeX + (x + 1);
                    this.connections.push({ from: index, to: diagonalIndex });
                }
                
                // 左下対角線（X-1, Z+1）
                if (x > 0 && z < this.gridSizeZ - 1) {
                    const diagonalIndex = (z + 1) * this.gridSizeX + (x - 1);
                    this.connections.push({ from: index, to: diagonalIndex });
                }
            }
        }
        
        this.createLineGeometry();
    }
    
    /**
     * 線のジオメトリを作成（CPU版とGPU版の両方で使用）
     */
    createLineGeometry() {
        if (!this.connections || this.connections.length === 0) return;
        
        // 線のジオメトリを作成
        const positions = new Float32Array(this.connections.length * 6);
        const lineColors = new Float32Array(this.connections.length * 6);
        this.lineGeometry = new THREE.BufferGeometry();
        this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
        this.lineGeometry.setDrawRange(0, this.connections.length * 2);
        
        // 線のマテリアル（布らしく少し太めに）
        const lineMaterial = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.7,
            linewidth: 2.0
        });
        
        // 線のメッシュを作成
        this.lineMesh = new THREE.LineSegments(this.lineGeometry, lineMaterial);
        this.lineMesh.renderOrder = 0;
        this.scene.add(this.lineMesh);
        
        console.log(`✅ ${this.connections.length}本の接続線を作成しました`);
    }
    
    /**
     * カメラパーティクルの距離パラメータを設定
     */
    setupCameraParticleDistance(cameraParticle) {
        // グリッド範囲を計算
        const gridWidth = (this.gridSizeX - 1) * this.gridSpacing;
        const gridDepth = (this.gridSizeZ - 1) * this.gridSpacing;
        const gridSize = Math.max(gridWidth, gridDepth);
        
        // 布を見下ろす感じで適度な距離に設定
        const cameraDistance = gridSize * 0.6;
        cameraParticle.minDistance = cameraDistance * 0.8;
        cameraParticle.maxDistance = cameraDistance * 1.4;
        cameraParticle.maxDistanceReset = cameraDistance * 1.3;
        
        // XZ平面の範囲
        const cameraBoxSizeXZ = gridSize * 0.4;
        
        // Y座標（布を見下ろす高さ）
        const cameraMinY = gridSize * 0.4;
        const cameraMaxY = gridSize * 0.8;
        
        cameraParticle.boxMin = new THREE.Vector3(-cameraBoxSizeXZ, cameraMinY, -cameraBoxSizeXZ);
        cameraParticle.boxMax = new THREE.Vector3(cameraBoxSizeXZ, cameraMaxY, cameraBoxSizeXZ);
    }
    
    /**
     * カメラの位置を更新
     */
    updateCamera() {
        if (this.cameraParticles[this.currentCameraIndex]) {
            const cameraPos = this.cameraParticles[this.currentCameraIndex].getPosition();
            this.camera.position.copy(cameraPos);
            this.camera.lookAt(0, 0, 0);
            this.camera.up.set(0, 1, 0);
        }
    }
    
    /**
     * 更新処理
     */
    onUpdate(deltaTime) {
        this.time += deltaTime;
        
        // パーティクルの更新
        if (!this.pointsMesh || this.particles.length === 0) {
            return;
        }
        
        // カメラパーティクルのバウンド処理（SceneBase.update()で既に更新済み）
        if (this.cameraParticles && this.cameraParticles[this.currentCameraIndex]) {
            const cameraParticle = this.cameraParticles[this.currentCameraIndex];
            
            // boxの端でバウンド処理
            const pos = cameraParticle.getPosition();
            const vel = cameraParticle.getVelocity();
            const boxMin = cameraParticle.boxMin;
            const boxMax = cameraParticle.boxMax;
            
            const minVelocityForBounce = 0.1;
            if (vel.length() > minVelocityForBounce && boxMin && boxMax) {
                if (pos.x <= boxMin.x) {
                    pos.x = boxMin.x;
                    vel.x *= -1.0;
                    cameraParticle.position.copy(pos);
                    cameraParticle.velocity.copy(vel);
                } else if (pos.x >= boxMax.x) {
                    pos.x = boxMax.x;
                    vel.x *= -1.0;
                    cameraParticle.position.copy(pos);
                    cameraParticle.velocity.copy(vel);
                }
                
                if (pos.y <= boxMin.y) {
                    pos.y = boxMin.y;
                    vel.y *= -1.0;
                    cameraParticle.position.copy(pos);
                    cameraParticle.velocity.copy(vel);
                } else if (pos.y >= boxMax.y) {
                    pos.y = boxMax.y;
                    vel.y *= -1.0;
                    cameraParticle.position.copy(pos);
                    cameraParticle.velocity.copy(vel);
                }
                
                if (pos.z <= boxMin.z) {
                    pos.z = boxMin.z;
                    vel.z *= -1.0;
                    cameraParticle.position.copy(pos);
                    cameraParticle.velocity.copy(vel);
                } else if (pos.z >= boxMax.z) {
                    pos.z = boxMax.z;
                    vel.z *= -1.0;
                    cameraParticle.position.copy(pos);
                    cameraParticle.velocity.copy(vel);
                }
            }
        }
        
        // カメラを更新
        this.updateCamera();
        
        // 色収差エフェクトの更新
        this.updateChromaticAberration();
        
        // グリッチエフェクトの更新
        this.updateGlitch();
        
        // アクティブな力を更新（デュレーション対応）
        const currentTime = Date.now();
        this.activeForces = this.activeForces.filter(forceData => {
            if (currentTime >= forceData.endTime) {
                return false; // 期限切れの力は削除
            }
            
            // 継続的に力を加える
            const progress = (currentTime - forceData.startTime) / (forceData.endTime - forceData.startTime);
            const timeStrength = 1.0 - progress; // 時間が経つほど弱くなる
            
            for (let i = 0; i < this.particles.length; i++) {
                const particle = this.particles[i];
                const particlePos = particle.getPosition();
                const toParticle = new THREE.Vector3().subVectors(particlePos, forceData.center);
                const distance = toParticle.length();
                
                if (distance < forceData.radius && distance > 0.1) {
                    const normalizedDist = distance / forceData.radius;
                    const localForceStrength = forceData.strength * (1.0 - normalizedDist) * (1.0 - normalizedDist) * timeStrength;
                    
                    // 外側への力
                    const forceDir = toParticle.normalize();
                    const force = forceDir.multiplyScalar(localForceStrength);
                    
                    particle.addForce(force);
                }
            }
            
            return true; // まだ有効な力
        });
        
        // アクティブな下からの力（突き上げ）を更新（デュレーション対応）
        this.activeUpwardForces = this.activeUpwardForces.filter(forceData => {
            if (currentTime >= forceData.endTime) {
                return false; // 期限切れの力は削除
            }
            
            // 継続的に下から力を加える
            const progress = (currentTime - forceData.startTime) / (forceData.endTime - forceData.startTime);
            const timeStrength = 1.0 - progress; // 時間が経つほど弱くなる
            
            for (let i = 0; i < this.particles.length; i++) {
                const particle = this.particles[i];
                const particlePos = particle.getPosition();
                const toParticle = new THREE.Vector3().subVectors(particlePos, forceData.center);
                const distance = toParticle.length();
                
                if (distance < forceData.radius && distance > 0.1) {
                    const normalizedDist = distance / forceData.radius;
                    const localForceStrength = forceData.strength * (1.0 - normalizedDist) * (1.0 - normalizedDist) * timeStrength;
                    
                    // 上方向への力（突き上げ）
                    const upwardForce = new THREE.Vector3(0, localForceStrength, 0);
                    particle.addForce(upwardForce);
                }
            }
            
            return true; // まだ有効な力
        });
        
        // スプリング拘束を適用（布の構造を維持）
        for (const connection of this.connections) {
            const particleA = this.particles[connection.from];
            const particleB = this.particles[connection.to];
            const posA = particleA.getPosition();
            const posB = particleB.getPosition();
            
            // 現在の距離
            const diff = new THREE.Vector3().subVectors(posB, posA);
            const currentLength = diff.length();
            
            if (currentLength > 0.01) {
                // 方向ベクトルを正規化
                const forceDir = diff.clone().normalize();
                
                // 理想的な距離からのずれ
                const stretch = currentLength - this.restLength;
                
                // スプリング力（フックの法則）
                const springForce = stretch * this.springStiffness;
                
                // 速度差による減衰
                const velA = particleA.getVelocity();
                const velB = particleB.getVelocity();
                const velDiff = new THREE.Vector3().subVectors(velB, velA);
                const dampingForce = velDiff.dot(forceDir) * this.springDamping;
                
                // 力を適用
                const totalForce = springForce + dampingForce;
                
                // 粒子Aに力を加える（B方向）
                particleA.addForce(forceDir.clone().multiplyScalar(totalForce));
                // 粒子Bに力を加える（A方向、反対向き）
                particleB.addForce(forceDir.multiplyScalar(-totalForce));
            }
        }
        
        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i];
            const particlePos = particle.getPosition();
            const initialPos = this.initialPositions[i];
            
            // 復元力（元の位置に戻ろうとする力、布は弱め）
            const restoreDiff = new THREE.Vector3().subVectors(initialPos, particlePos);
            const restoreDistance = restoreDiff.length();
            
            if (restoreDistance > 0.01) {
                const restoreDir = restoreDiff.clone().normalize();
                const restoreForce = restoreDistance * this.restoreStiffness;
                const vel = particle.getVelocity();
                const velDot = vel.dot(restoreDir);
                const restoreDamping = velDot * this.restoreDamping;
                const totalRestoreForce = restoreForce + restoreDamping;
                particle.addForce(restoreDir.multiplyScalar(totalRestoreForce));
            }
            
            // 重力を適用
            const gravity = this.gravity.clone();
            particle.addForce(gravity);
            
            // パーティクルを更新
            particle.update();
            
            // Boxの範囲制限（見えないBoxの境界）
            const vel = particle.getVelocity();
            if (particlePos.x < this.boxMin.x) {
                particlePos.x = this.boxMin.x;
                vel.x *= -0.5; // 反発
                particle.position.copy(particlePos);
                particle.velocity.copy(vel);
            } else if (particlePos.x > this.boxMax.x) {
                particlePos.x = this.boxMax.x;
                vel.x *= -0.5;
                particle.position.copy(particlePos);
                particle.velocity.copy(vel);
            }
            
            if (particlePos.y < this.boxMin.y) {
                particlePos.y = this.boxMin.y;
                vel.y *= -0.5; // 下から突き上げられる
                particle.position.copy(particlePos);
                particle.velocity.copy(vel);
            } else if (particlePos.y > this.boxMax.y) {
                particlePos.y = this.boxMax.y;
                vel.y *= -0.5; // 上から押し下げられる
                particle.position.copy(particlePos);
                particle.velocity.copy(vel);
            }
            
            if (particlePos.z < this.boxMin.z) {
                particlePos.z = this.boxMin.z;
                vel.z *= -0.5;
                particle.position.copy(particlePos);
                particle.velocity.copy(vel);
            } else if (particlePos.z > this.boxMax.z) {
                particlePos.z = this.boxMax.z;
                vel.z *= -0.5;
                particle.position.copy(particlePos);
                particle.velocity.copy(vel);
            }
            
            // 地面との衝突判定（Boxの範囲内で）
            if (particlePos.y <= this.groundY + this.sphereRadius) {
                particlePos.y = this.groundY + this.sphereRadius;
                particle.position.copy(particlePos);
                
                if (vel.y < 0) {
                    vel.y *= -0.2; // 弱い反発
                }
                vel.x *= 0.95; // 摩擦
                vel.z *= 0.95;
                particle.velocity.copy(vel);
            }
            
            // Pointsの位置を更新
            const idx = i * 3;
            this.pointsPositions[idx] = particlePos.x;
            this.pointsPositions[idx + 1] = particlePos.y;
            this.pointsPositions[idx + 2] = particlePos.z;
            
            // ポイントのサイズ
            this.pointsSizes[i] = this.sphereRadius * 2.0;
            
            // ヒートマップの色を計算（速度の大きさに基づく）
            // velは既に564行目で宣言されているので、そのまま使用
            const speed = vel.length();
            const normalizedSpeed = Math.min(Math.max((speed - this.heatMapMinValue) / (this.heatMapMaxValue - this.heatMapMinValue), 0), 1);
            const color = this.getHeatMapColor(normalizedSpeed);
            
            // Pointsの色を設定（ヒートマップ）
            this.pointsColors[idx] = color.r;
            this.pointsColors[idx + 1] = color.g;
            this.pointsColors[idx + 2] = color.b;
        }
        
        // Pointsの属性を更新
        if (this.pointsMesh && this.pointsMesh.geometry) {
            this.pointsMesh.geometry.attributes.position.needsUpdate = true;
            this.pointsMesh.geometry.attributes.color.needsUpdate = true;
            this.pointsMesh.geometry.attributes.size.needsUpdate = true;
        }
        
        // 線の位置と色を更新
        this.updateConnections();
    }
    
    /**
     * ヒートマップの色を計算
     */
    getHeatMapColor(value) {
        const color = new THREE.Color();
        
        // 青 → シアン → 緑 → 黄 → 赤 のグラデーション
        if (value < 0.15) {
            const t = value / 0.15;
            color.r = 0.0;
            color.g = t * 0.5;
            color.b = 1.0;
        } else if (value < 0.35) {
            const t = (value - 0.15) / 0.2;
            color.r = 0.0;
            color.g = 0.5 + t * 0.5;
            color.b = 1.0 - t;
        } else if (value < 0.6) {
            const t = (value - 0.35) / 0.25;
            color.r = t;
            color.g = 1.0;
            color.b = 0.0;
        } else {
            const t = (value - 0.6) / 0.4;
            color.r = 1.0;
            color.g = 1.0 - t;
            color.b = 0.0;
        }
        
        // 赤い時は発光を強くする
        if (value > 0.6) {
            const intensity = (value - 0.6) / 0.4;
            color.r = Math.min(1.0, color.r + intensity * 0.5);
            color.g = Math.max(0.0, color.g - intensity * 0.3);
            color.b = 0.0;
        }
        
        return color;
    }
    
    /**
     * 線の位置と色を更新
     */
    updateConnections() {
        if (!this.lineGeometry || !this.lineMesh) return;
        
        const positions = this.lineGeometry.attributes.position.array;
        const colors = this.lineGeometry.attributes.color.array;
        let offset = 0;
        let colorOffset = 0;
        
        for (const connection of this.connections) {
            const fromParticle = this.particles[connection.from];
            const toParticle = this.particles[connection.to];
            const fromPos = fromParticle.getPosition();
            const toPos = toParticle.getPosition();
            
            // 速度の平均を計算（線の色に使用）
            const fromVel = fromParticle.getVelocity();
            const toVel = toParticle.getVelocity();
            const avgSpeed = (fromVel.length() + toVel.length()) / 2.0;
            const normalizedSpeed = Math.min(Math.max((avgSpeed - this.heatMapMinValue) / (this.heatMapMaxValue - this.heatMapMinValue), 0), 1);
            const color = this.getHeatMapColor(normalizedSpeed);
            
            // from位置
            positions[offset++] = fromPos.x;
            positions[offset++] = fromPos.y;
            positions[offset++] = fromPos.z;
            
            // from色
            colors[colorOffset++] = color.r;
            colors[colorOffset++] = color.g;
            colors[colorOffset++] = color.b;
            
            // to位置
            positions[offset++] = toPos.x;
            positions[offset++] = toPos.y;
            positions[offset++] = toPos.z;
            
            // to色
            colors[colorOffset++] = color.r;
            colors[colorOffset++] = color.g;
            colors[colorOffset++] = color.b;
        }
        
        this.lineGeometry.attributes.position.needsUpdate = true;
        this.lineGeometry.attributes.color.needsUpdate = true;
    }
    
    /**
     * 力を加える（トラック5用、布を揺らす）
     * @param {number} noteNumber - ノート番号（36が0、地上からの高さ）
     * @param {number} velocity - ベロシティ（0-127、力の強さ）
     * @param {number} durationMs - デュレーション（ms、力の長さ）
     */
    applyForce(noteNumber = null, velocity = null, durationMs = null) {
        // 力の中心位置を設定
        // デュレーションが短いほど前回の位置に近い位置を選ぶ（ロール時の連続性）
        const gridWidth = (this.gridSizeX - 1) * this.gridSpacing;
        const gridDepth = (this.gridSizeZ - 1) * this.gridSpacing;
        
        let centerX, centerZ;
        
        // デュレーションが短い（ロール）場合は前回の位置に近づける
        if (durationMs !== null && durationMs > 0 && durationMs < 500 && this.lastForceCenter) {
            // デュレーションが短いほど前回の位置に近い（距離を少し広げる）
            const proximityFactor = Math.max(0, 1.0 - durationMs / 500.0); // 0-1.0（短いほど1.0に近い）
            const minDistance = 80.0 + proximityFactor * 70.0; // 80-150（50-100から広げる）
            const maxDistance = 200.0 + proximityFactor * 200.0; // 200-400（150-300から広げる）
            
            // 前回の位置からランダムな方向に、距離をランダムに設定
            const angle = Math.random() * Math.PI * 2;
            const distance = minDistance + Math.random() * (maxDistance - minDistance);
            centerX = this.lastForceCenter.x + Math.cos(angle) * distance;
            centerZ = this.lastForceCenter.z + Math.sin(angle) * distance;
            
            // 範囲を超えた場合は反対側に回り込む
            if (centerX < -gridWidth / 2) centerX += gridWidth;
            if (centerX > gridWidth / 2) centerX -= gridWidth;
            if (centerZ < -gridDepth / 2) centerZ += gridDepth;
            if (centerZ > gridDepth / 2) centerZ -= gridDepth;
        } else {
            // デュレーションが長い、または前回の位置がない場合は完全ランダム
            centerX = (Math.random() - 0.5) * gridWidth;
            centerZ = (Math.random() - 0.5) * gridDepth;
        }
        
        // ノート番号から高さを計算
        let heightY = this.groundY + this.sphereRadius;
        if (noteNumber !== null) {
            heightY = this.groundY + (noteNumber - 36) * 10.0;
        } else if (this.lastForceCenter) {
            // ノート番号が指定されていない場合は前回の高さを使用
            heightY = this.lastForceCenter.y;
        }
        
        const forceCenter = new THREE.Vector3(centerX, heightY, centerZ);
        
        // 前回の位置を更新
        this.lastForceCenter = forceCenter.clone();
        
        // ベロシティから力の強さを計算（0-127 → 力の強さ）
        // ベロシティが小さい時により敏感に反応する非線形マッピング
        let forceStrength = 150.0; // デフォルト
        if (velocity !== null) {
            const velocityNormalized = velocity / 127.0; // 0.0-1.0
            // ベロシティが小さい時により敏感に反応（非線形マッピング）
            // 小さいベロシティでも力が小さくなるように、2乗カーブを使用
            const squared = velocityNormalized * velocityNormalized;
            // 最小値を小さくして、ベロシティが小さい時により敏感に
            forceStrength = 20.0 + squared * 230.0; // 20-250（ベロシティ0で20、127で250）
        }
        
        // 力の影響範囲（力を伝えやすくするため広げる）
        const forceRadius = 300.0; // 影響範囲を広げる（200.0 → 300.0）
        
        // 高さに応じて上からか下からかを判定
        const isUpward = heightY < (this.boxMin.y + this.boxMax.y) / 2; // Boxの下半分なら下から
        
        // デュレーションが指定されている場合は、継続的に力を加える
        if (durationMs !== null && durationMs > 0) {
            if (isUpward) {
                // 下からの力（突き上げ）
                const forceData = {
                    center: forceCenter,
                    strength: forceStrength,
                    radius: forceRadius,
                    startTime: Date.now(),
                    endTime: Date.now() + durationMs,
                    velocity: velocity || 127.0
                };
                this.activeUpwardForces.push(forceData);
                console.log(`💪 布に下からの継続的な力（突き上げ）を適用！位置: (${forceCenter.x.toFixed(1)}, ${forceCenter.y.toFixed(1)}, ${forceCenter.z.toFixed(1)})`);
                console.log(`   強さ: ${forceStrength.toFixed(1)}, 影響範囲: ${forceRadius.toFixed(1)}, デュレーション: ${durationMs}ms`);
            } else {
                // 上からの力（通常）
                const forceData = {
                    center: forceCenter,
                    strength: forceStrength,
                    radius: forceRadius,
                    startTime: Date.now(),
                    endTime: Date.now() + durationMs,
                    velocity: velocity || 127.0
                };
                this.activeForces.push(forceData);
                console.log(`💪 布に継続的な力を適用！位置: (${forceCenter.x.toFixed(1)}, ${forceCenter.y.toFixed(1)}, ${forceCenter.z.toFixed(1)})`);
                console.log(`   強さ: ${forceStrength.toFixed(1)}, 影響範囲: ${forceRadius.toFixed(1)}, デュレーション: ${durationMs}ms`);
            }
        } else {
            // デュレーションが指定されていない場合は、一度だけ力を加える
            let affectedCount = 0;
            for (let i = 0; i < this.particles.length; i++) {
                const particle = this.particles[i];
                const particlePos = particle.getPosition();
                const toParticle = new THREE.Vector3().subVectors(particlePos, forceCenter);
                const distance = toParticle.length();
                
                if (distance < forceRadius && distance > 0.1) {
                    const normalizedDist = distance / forceRadius;
                    const localForceStrength = forceStrength * (1.0 - normalizedDist) * (1.0 - normalizedDist);
                    
                    if (isUpward) {
                        // 下からの力（突き上げ）
                        const upwardForce = new THREE.Vector3(0, localForceStrength, 0);
                        particle.addForce(upwardForce);
                    } else {
                        // 上からの力（外側への力）
                        const forceDir = toParticle.normalize();
                        const force = forceDir.multiplyScalar(localForceStrength);
                        particle.addForce(force);
                    }
                    affectedCount++;
                }
            }
            
            const forceType = isUpward ? '下からの力（突き上げ）' : '力';
            console.log(`💪 布に${forceType}を適用！位置: (${forceCenter.x.toFixed(1)}, ${forceCenter.y.toFixed(1)}, ${forceCenter.z.toFixed(1)})`);
            console.log(`   強さ: ${forceStrength.toFixed(1)}, 影響範囲: ${forceRadius.toFixed(1)}, 影響を受けたパーティクル: ${affectedCount}個`);
        }
    }
    
    /**
     * 描画処理
     */
    render() {
        // 背景色を設定
        if (this.backgroundWhite) {
            this.renderer.setClearColor(0xffffff);
        } else {
            this.renderer.setClearColor(0x000000);
        }
        
        // 色反転エフェクトが有効な場合はColorInversionのcomposerを使用
        if (this.colorInversion && this.colorInversion.isEnabled()) {
            const rendered = this.colorInversion.render();
            if (!rendered) {
                if (this.scene) {
                    this.renderer.render(this.scene, this.camera);
                }
            }
        } else {
            // ポストプロセッシングエフェクトが有効な場合はEffectComposerを使用
            if (this.composer && 
                ((this.chromaticAberrationPass && this.chromaticAberrationPass.enabled) ||
                 (this.glitchPass && this.glitchPass.enabled) ||
                 (this.bloomPass && this.bloomPass.enabled))) {
                this.composer.render();
            } else {
                // 通常のレンダリング
                if (this.scene) {
                    this.renderer.render(this.scene, this.camera);
                }
            }
        }
        
        // HUDを描画
        if (this.hud) {
            if (this.showHUD) {
                const cameraPos = this.cameraParticles[this.currentCameraIndex]?.getPosition() || new THREE.Vector3();
                const now = performance.now();
                const frameRate = this.lastFrameTime ? 1.0 / ((now - this.lastFrameTime) / 1000.0) : 60.0;
                this.lastFrameTime = now;
                
                const isInverted = this.colorInversion && this.colorInversion.isEnabled();
                
                this.hud.display(
                    frameRate,
                    this.currentCameraIndex,
                    cameraPos,
                    this.numParticles,
                    this.time,
                    0,
                    0,
                    cameraPos.length(),
                    0,
                    isInverted,
                    this.oscStatus,
                    this.particleCount || this.numParticles, // particleCountが0の場合はnumParticlesを使用
                    this.trackEffects,  // エフェクト状態を渡す
                    this.phase  // phase値を渡す
                );
            } else {
                this.hud.clear();
            }
        }
        
        // スクリーンショットテキストを描画
        this.drawScreenshotText();
        
        // カメラデバッグを描画
        this.drawCameraDebug();
    }
    
    /**
     * エフェクトのオン/オフを切り替え（数字キー1-9用）
     * トラック5で力を加える
     */
    toggleEffect(trackNumber) {
        // 親クラスのtoggleEffectを呼ぶ（トラック1-4の処理）
        super.toggleEffect(trackNumber);
        
        // トラック5: 布に力を加える
        if (trackNumber === 5) {
            const isOn = this.trackEffects[trackNumber];
            if (isOn) {
                // キーボード操作の場合はデフォルト値で力を加える
                this.applyForce(null, null, null);
            }
        }
    }
    
    /**
     * OSCメッセージの処理
     */
    handleTrackNumber(trackNumber, message) {
        const args = message.args || [];
        
        if (trackNumber === 1) {
            this.switchCameraRandom();
        } else if (trackNumber === 3) {
            const velocity = args[0] || 127.0;
            const noteNumber = args[1] || 64.0;
            const durationMs = args[2] || 0.0;
            this.applyChromaticAberration(velocity, noteNumber, durationMs);
        } else if (trackNumber === 4) {
            const velocity = args[0] || 127.0;
            const noteNumber = args[1] || 64.0;
            const durationMs = args[2] || 0.0;
            this.applyGlitch(velocity, noteNumber, durationMs);
        } else if (trackNumber === 5) {
            const noteNumber = args[0] !== undefined ? args[0] : null;
            const velocity = args[1] !== undefined ? args[1] : null;
            const durationMs = args[2] !== undefined ? args[2] : null;
            this.applyForce(noteNumber, velocity, durationMs);
        }
    }
    
    /**
     * リセット処理
     */
    reset() {
        super.reset();
        
        if (!this.pointsMesh || this.particles.length === 0) {
            return;
        }
        
        // グリッドの範囲を計算
        const gridWidth = (this.gridSizeX - 1) * this.gridSpacing;
        const gridDepth = (this.gridSizeZ - 1) * this.gridSpacing;
        
        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i];
            particle.reset();
            
            // グリッド位置を計算
            const z = Math.floor(i / this.gridSizeX);
            const x = i % this.gridSizeX;
            const gridX = -gridWidth / 2 + x * this.gridSpacing;
            const gridZ = -gridDepth / 2 + z * this.gridSpacing;
            const y = this.groundY + this.sphereRadius; // 地面の上（Scene07と同じ）
            
            particle.position.set(gridX, y, gridZ);
            
            // Pointsの位置を更新
            const idx = i * 3;
            this.pointsPositions[idx] = gridX;
            this.pointsPositions[idx + 1] = y;
            this.pointsPositions[idx + 2] = gridZ;
            
            // 初期色（Scene07と同じ、青）
            this.pointsColors[idx] = 0.0;
            this.pointsColors[idx + 1] = 0.0;
            this.pointsColors[idx + 2] = 1.0;
        }
        
        // Pointsの属性を更新
        if (this.pointsMesh && this.pointsMesh.geometry) {
            this.pointsMesh.geometry.attributes.position.needsUpdate = true;
            this.pointsMesh.geometry.attributes.color.needsUpdate = true;
        }
        
        // 線の位置を更新
        this.updateConnections();
    
        console.log('🔄 シーンをリセットしました');
    }
    
    /**
     * 色収差エフェクトを初期化
     */
    async initChromaticAberration() {
        const shaderBasePath = `/shaders/common/`;
        try {
            const [vertexShader, fragmentShader] = await Promise.all([
            fetch(`${shaderBasePath}chromaticAberration.vert`).then(r => r.text()),
            fetch(`${shaderBasePath}chromaticAberration.frag`).then(r => r.text())
            ]);
            this.composer = new EffectComposer(this.renderer);
            
            const renderPass = new RenderPass(this.scene, this.camera);
            this.composer.addPass(renderPass);
            
            const chromaticAberrationShader = {
                uniforms: {
                    tDiffuse: { value: null },
                    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                    amount: { value: 0.0 }
                },
                vertexShader: vertexShader,
                fragmentShader: fragmentShader
            };
            
            this.chromaticAberrationPass = new ShaderPass(chromaticAberrationShader);
            this.chromaticAberrationPass.enabled = false;
            this.composer.addPass(this.chromaticAberrationPass);
            
            this.bloomPass = new UnrealBloomPass(
                new THREE.Vector2(window.innerWidth, window.innerHeight),
                1.5,
                0.4,
                0.85
            );
            this.bloomPass.enabled = this.bloomEnabled;
            this.composer.addPass(this.bloomPass);
            
            await this.initGlitchShader();
        } catch (err) {
            console.error('色収差シェーダーの読み込みに失敗:', err);
        }
    }
    
    /**
     * グリッチエフェクトを初期化
     */
    initGlitch() {
        // composerが作成されるまで待つ
    }
    
    /**
     * グリッチシェーダーを初期化
     */
    async initGlitchShader() {
        if (!this.composer) return;
        
        const shaderBasePath = `/shaders/common/`;
        try {
            const [vertexShader, fragmentShader] = await Promise.all([
            fetch(`${shaderBasePath}glitch.vert`).then(r => r.text()),
            fetch(`${shaderBasePath}glitch.frag`).then(r => r.text())
            ]);
            const glitchShader = {
                uniforms: {
                    tDiffuse: { value: null },
                    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                    amount: { value: 0.0 },
                    time: { value: 0.0 }
                },
                vertexShader: vertexShader,
                fragmentShader: fragmentShader
            };
            
            this.glitchPass = new ShaderPass(glitchShader);
            this.glitchPass.enabled = false;
            this.composer.addPass(this.glitchPass);
        } catch (err) {
            console.error('グリッチシェーダーの読み込みに失敗:', err);
        }
    }
    
    /**
     * 色収差エフェクトを適用
     */
    applyChromaticAberration(velocity, noteNumber, durationMs) {
        if (!this.chromaticAberrationPass) {
            console.warn('色収差エフェクトが初期化されていません');
            return;
        }
        
        const amount = THREE.MathUtils.mapLinear(velocity, 0, 127, 0.0, 1.0);
        this.chromaticAberrationAmount = amount;
        
        if (this.chromaticAberrationPass.material && this.chromaticAberrationPass.material.uniforms) {
            this.chromaticAberrationPass.material.uniforms.amount.value = amount;
        }
        
        this.chromaticAberrationPass.enabled = true;
        
        if (durationMs > 0) {
            this.chromaticAberrationEndTime = Date.now() + durationMs;
        } else {
            this.chromaticAberrationEndTime = 0;
        }
        
        console.log(`Track 3: Chromatic aberration applied (velocity: ${velocity}, note: ${noteNumber}, amount: ${amount.toFixed(2)}, duration: ${durationMs}ms)`);
    }
    
    /**
     * グリッチエフェクトを適用
     */
    applyGlitch(velocity, noteNumber, durationMs) {
        if (!this.glitchPass) {
            console.warn('グリッチエフェクトが初期化されていません');
            return;
        }
        
        const amount = THREE.MathUtils.mapLinear(velocity, 0, 127, 0.0, 1.0);
        this.glitchAmount = amount;
        
        if (this.glitchPass.material && this.glitchPass.material.uniforms) {
            this.glitchPass.material.uniforms.amount.value = amount;
        }
        
        this.glitchPass.enabled = true;
        
        if (durationMs > 0) {
            this.glitchEndTime = Date.now() + durationMs;
        } else {
            this.glitchEndTime = 0;
        }
        
        console.log(`Track 4: Glitch effect applied (velocity: ${velocity}, note: ${noteNumber}, amount: ${amount.toFixed(2)}, duration: ${durationMs}ms)`);
    }
    
    /**
     * キーが押された時の処理
     */
    handleKeyDown(trackNumber) {
        super.handleKeyDown(trackNumber);
        
        if (trackNumber === 3) {
            this.chromaticAberrationKeyPressed = true;
            this.applyChromaticAberration(127.0, 64.0, 0.0);
        } else if (trackNumber === 4) {
            this.glitchKeyPressed = true;
            this.applyGlitch(127.0, 64.0, 0.0);
        }
    }
    
    /**
     * キーが離された時の処理
     */
    handleKeyUp(trackNumber) {
        super.handleKeyUp(trackNumber);
        
        if (trackNumber === 3) {
            this.chromaticAberrationKeyPressed = false;
            if (this.chromaticAberrationPass) {
                this.chromaticAberrationPass.enabled = false;
                this.chromaticAberrationAmount = 0.0;
                this.chromaticAberrationEndTime = 0;
            }
        } else if (trackNumber === 4) {
            this.glitchKeyPressed = false;
            if (this.glitchPass) {
                this.glitchPass.enabled = false;
                this.glitchAmount = 0.0;
                this.glitchEndTime = 0;
            }
        }
    }
    
    /**
     * 色収差エフェクトの更新
     */
    updateChromaticAberration() {
        if (this.chromaticAberrationPass && this.chromaticAberrationPass.enabled) {
            if (this.chromaticAberrationKeyPressed) {
                return;
            }
            
            const currentTime = Date.now();
            if (this.chromaticAberrationEndTime > 0 && currentTime >= this.chromaticAberrationEndTime) {
                this.chromaticAberrationPass.enabled = false;
                this.chromaticAberrationAmount = 0.0;
                this.chromaticAberrationEndTime = 0;
            }
        }
    }
    
    /**
     * グリッチエフェクトの更新
     */
    updateGlitch() {
        if (this.glitchPass && this.glitchPass.enabled) {
            if (this.glitchPass.material && this.glitchPass.material.uniforms) {
                this.glitchPass.material.uniforms.time.value = this.time;
            }
            
            if (this.glitchKeyPressed) {
                return;
            }
            
            const currentTime = Date.now();
            if (this.glitchEndTime > 0 && currentTime >= this.glitchEndTime) {
                this.glitchPass.enabled = false;
                this.glitchAmount = 0.0;
                this.glitchEndTime = 0;
            }
        }
    }
    
    /**
     * クリーンアップ処理
     */
    dispose() {
        console.log('Scene08.dispose: クリーンアップ開始');
        
        // Pointsメッシュを破棄
        if (this.pointsMesh) {
            this.scene.remove(this.pointsMesh);
            if (this.pointsMesh.geometry) {
                this.pointsMesh.geometry.dispose();
            }
            if (this.pointsMesh.material) {
                this.pointsMesh.material.dispose();
            }
            this.pointsMesh = null;
        }
        
        this.pointsPositions = null;
        this.pointsColors = null;
        this.pointsSizes = null;
        
        // パーティクルをクリア
        this.particles = [];
        this.particleMasses = [];
        
        // 線を破棄
        if (this.lineMesh) {
            this.scene.remove(this.lineMesh);
            if (this.lineGeometry) {
                this.lineGeometry.dispose();
            }
            if (this.lineMesh.material) {
                this.lineMesh.material.dispose();
            }
            this.lineMesh = null;
            this.lineGeometry = null;
        }
        
        this.connections = [];
        
        // GPU布システムを破棄
        
        // エフェクトパスを破棄
        if (this.chromaticAberrationPass) {
            this.chromaticAberrationPass = null;
        }
        if (this.glitchPass) {
            this.glitchPass = null;
        }
        if (this.composer) {
            this.composer.dispose();
            this.composer = null;
        }
        
        // すべてのライトを削除
        const lightsToRemove = [];
        this.scene.traverse((object) => {
            if (object instanceof THREE.Light) {
                lightsToRemove.push(object);
            }
        });
        lightsToRemove.forEach(light => {
            this.scene.remove(light);
            if (light.dispose) {
                light.dispose();
            }
        });
        
        console.log('Scene08.dispose: クリーンアップ完了');
        
        // 親クラスのdisposeを呼ぶ
        super.dispose();
    }
}

