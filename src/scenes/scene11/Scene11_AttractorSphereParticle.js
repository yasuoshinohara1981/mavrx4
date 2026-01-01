/**
 * Scene11_AttractorSphereParticle: 中心に配置される引力を持つGPUパーティクルSphere
 * InstancedMeshで1つのインスタンスを作成し、シェーダーで変形
 */

import { Particle } from '../../lib/Particle.js';
import { InstancedMeshManager } from '../../lib/InstancedMeshManager.js';
import * as THREE from 'three';

export class Scene11_AttractorSphereParticle extends Particle {
    constructor(position, radius = 400.0, scene) {
        super(position.x, position.y, position.z);
        this.radius = radius;
        this.attractionStrength = 2.5; // 引力の強さ（重力3.5より弱く）
        
        // 物理パラメータ（運動しやすくする）
        this.maxSpeed = 30.0; // 最大速度を上げる
        this.maxForce = 10.0; // 最大力を上げる
        this.friction = 0.0001; // 摩擦をほぼゼロにして動きやすくする
        this.mass = 10.0;
        
        // Three.js用のオブジェクト
        this.scene = scene;
        this.instancedManager = null;
        this.light = null;
        
        // ノイズパラメータ（シーン1参考）
        this.noiseScale = 1.0;
        this.noiseStrength = 50.0;
        this.time = 0.0;
        
        // lifetime管理
        this.lifetime = 5.0; // 5秒で消失
        this.age = 0.0;
        this.isActive = true;
        
        // シェーダーマテリアル用のuniforms
        this.uniforms = {
            time: { value: 0.0 },
            noiseScale: { value: this.noiseScale },
            noiseStrength: { value: this.noiseStrength },
            baseRadius: { value: this.radius },
            centerPosition: { value: new THREE.Vector3() },
            lightIntensity: { value: 50.0 },
            lightColor: { value: new THREE.Color(0xffffff) },
            sphereColor: { value: new THREE.Color(0xffffff) },
            emissiveIntensity: { value: 3.0 },
            lifetime: { value: this.lifetime },
            age: { value: 0.0 }
        };
        
        // GPUパーティクル（InstancedMesh）を作成
        this.createInstancedMesh();
        
        // PointLightを作成
        this.createLight();
    }
    
    /**
     * InstancedMeshを作成（1つのインスタンスのみ）
     */
    createInstancedMesh() {
        // 基準となるジオメトリ（Sphere、詳細度を高く）
        const geometry = new THREE.SphereGeometry(1, 64, 64);
        
        // シェーダーマテリアルを作成（球体マッピングデカールノイズ）
        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: `
                uniform float time;
                uniform float noiseScale;
                uniform float noiseStrength;
                uniform float baseRadius;
                uniform vec3 centerPosition;
                uniform float lifetime;
                uniform float age;
                
                attribute vec3 normal;
                
                varying vec3 vNormal;
                varying vec3 vPosition;
                varying vec3 vWorldPosition;
                varying float vAlpha;
                
                // ハッシュ関数
                float hash(float n) {
                    return fract(sin(n) * 43758.5453);
                }
                
                // 4Dノイズ（シーン1参考）
                float smoothNoise4D(vec4 p) {
                    vec4 i = floor(p);
                    vec4 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);  // smoothstep
                    
                    float n = i.x + i.y * 57.0 + i.z * 113.0 + i.w * 199.0;
                    
                    float a = hash(n);
                    float b = hash(n + 1.0);
                    float c = hash(n + 57.0);
                    float d = hash(n + 58.0);
                    float e = hash(n + 113.0);
                    float f1 = hash(n + 114.0);
                    float g = hash(n + 170.0);
                    float h = hash(n + 171.0);
                    float i1 = hash(n + 199.0);
                    float j = hash(n + 200.0);
                    float k = hash(n + 256.0);
                    float l = hash(n + 257.0);
                    float m = hash(n + 312.0);
                    float n1 = hash(n + 313.0);
                    float o = hash(n + 369.0);
                    float p1 = hash(n + 370.0);
                    
                    float x1 = mix(a, b, f.x);
                    float x2 = mix(c, d, f.x);
                    float x3 = mix(e, f1, f.x);
                    float x4 = mix(g, h, f.x);
                    float x5 = mix(i1, j, f.x);
                    float x6 = mix(k, l, f.x);
                    float x7 = mix(m, n1, f.x);
                    float x8 = mix(o, p1, f.x);
                    
                    float y1 = mix(x1, x2, f.y);
                    float y2 = mix(x3, x4, f.y);
                    float y3 = mix(x5, x6, f.y);
                    float y4 = mix(x7, x8, f.y);
                    
                    float z1 = mix(y1, y2, f.z);
                    float z2 = mix(y3, y4, f.z);
                    
                    return mix(z1, z2, f.w);
                }
                
                void main() {
                    // instanceMatrixで既に変換された位置を使用
                    vec3 worldPos = position;
                    
                    // 中心位置からの相対位置を計算
                    vec3 relativePos = worldPos - centerPosition;
                    float distance = length(relativePos);
                    
                    if (distance > 0.001) {
                        // 球体マッピング：相対位置から緯度・経度を計算
                        vec3 direction = normalize(relativePos);
                        float latitude = asin(direction.y);
                        float longitude = atan(direction.z, direction.x);
                        
                        // 経度の周期性を考慮したノイズ計算
                        float longitudeSin = sin(longitude);
                        float longitudeCos = cos(longitude);
                        
                        // ノイズ計算（シーン1参考）
                        float noiseValue = smoothNoise4D(vec4(
                            latitude * noiseScale,
                            longitudeSin * noiseScale,
                            longitudeCos * noiseScale,
                            time * noiseScale
                        ));
                        
                        // ノイズオフセットを計算（球体から見た高さ）
                        float noiseOffset = (noiseValue - 0.5) * 2.0 * noiseStrength;
                        
                        // 新しい位置を計算（ノイズオフセット）
                        float currentRadius = baseRadius + noiseOffset;
                        worldPos = centerPosition + direction * currentRadius;
                    }
                    
                    // lifetimeで消失（フェードアウト）
                    vAlpha = 1.0 - (age / lifetime);
                    vAlpha = clamp(vAlpha, 0.0, 1.0);
                    
                    vNormal = normalize(normal);
                    vPosition = position;
                    vWorldPosition = worldPos;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 sphereColor;
                uniform vec3 lightColor;
                uniform float lightIntensity;
                uniform float emissiveIntensity;
                uniform vec3 centerPosition;
                
                varying vec3 vNormal;
                varying vec3 vPosition;
                varying vec3 vWorldPosition;
                varying float vAlpha;
                
                void main() {
                    // ワールド座標を再計算（instanceMatrixで変換後）
                    vec3 worldPos = vWorldPosition; // シェーダーで計算した位置
                    
                    // 擬似Sphereライティング（周囲のSphereと同じように中心から当たってる風に）
                    vec3 toCenter = normalize(centerPosition - worldPos);
                    float dotProduct = dot(normalize(vNormal), toCenter);
                    float lightFactor = max(0.0, dotProduct); // 内側が明るく
                    
                    // ライトの強度を適用
                    vec3 litColor = sphereColor * (0.2 + lightFactor * lightIntensity * 0.01);
                    
                    // 発光を追加
                    vec3 emissive = sphereColor * emissiveIntensity;
                    
                    // 最終色
                    vec3 finalColor = litColor + emissive;
                    
                    gl_FragColor = vec4(finalColor, vAlpha);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        // InstancedMeshManagerを作成（50万個のインスタンス）
        const numInstances = 500000; // 50万個
        this.instancedManager = new InstancedMeshManager(
            this.scene,
            geometry,
            material,
            numInstances
        );
        
        // 初期位置を設定（球体の表面に50万個のパーティクルを配置）
        this.initializeParticles();
    }
    
    /**
     * パーティクルを初期化（球体の表面に配置）
     */
    initializeParticles() {
        if (!this.instancedManager) return;
        
        const numInstances = 500000; // 50万個
        
        for (let i = 0; i < numInstances; i++) {
            // 球体の表面にランダムに配置
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1); // 均等分布
            
            const x = Math.sin(phi) * Math.cos(theta);
            const y = Math.cos(phi);
            const z = Math.sin(phi) * Math.sin(theta);
            
            // 中心位置からの相対位置
            const particlePos = new THREE.Vector3(x, y, z).multiplyScalar(this.radius);
            const worldPos = this.position.clone().add(particlePos);
            
            // 小さなスケール（パーティクルサイズ）
            const particleSize = 2.0; // パーティクルサイズ
            const scale = new THREE.Vector3(particleSize, particleSize, particleSize);
            const rotation = new THREE.Euler(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                'XYZ'
            );
            
            this.instancedManager.setMatrixAt(i, worldPos, rotation, scale);
        }
        
        this.instancedManager.markNeedsUpdate();
    }
    
    /**
     * インスタンスのマトリックスを更新（中心位置が動いた時に全パーティクルを更新）
     */
    updateInstanceMatrix() {
        if (!this.instancedManager) return;
        
        // 50万個のパーティクルを更新するのは重いので、中心位置の変更時のみ更新
        // 通常はシェーダーで変形するため、ここでは更新しない
        // 必要に応じて、中心位置が大きく動いた時だけ更新する
    }
    
    /**
     * PointLightを作成
     */
    createLight() {
        this.light = new THREE.PointLight(0xffffff, 50.0, 10000);
        this.light.position.copy(this.position);
        this.light.castShadow = false;
        this.light.decay = 0;
        this.scene.add(this.light);
    }
    
    /**
     * 更新処理
     */
    update(deltaTime) {
        // Particleの更新処理を呼ぶ
        super.update();
        
        // 時間を更新
        this.time += deltaTime;
        this.age += deltaTime;
        
        // lifetimeチェック
        if (this.age >= this.lifetime) {
            this.isActive = false;
            // リスポーン（球体からランダムな位置に）
            this.respawn();
        }
        
        // uniformsを更新
        if (this.uniforms) {
            this.uniforms.time.value = this.time;
            this.uniforms.centerPosition.value.copy(this.position);
            this.uniforms.age.value = this.age;
        }
        
        // 50万個のインスタンスを毎フレーム更新するのは重いので、シェーダーで中心位置を処理
        // updateInstanceMatrix()は呼ばない（初期化時のみ呼ばれる）
        
        // PointLightの位置を更新
        if (this.light) {
            this.light.position.copy(this.position);
        }
    }
    
    /**
     * リスポーン（球体からランダムな位置に）
     */
    respawn() {
        // 球体の表面からランダムな位置にリスポーン（中心位置からの相対位置）
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        
        const x = this.radius * Math.sin(phi) * Math.cos(theta);
        const y = this.radius * Math.cos(phi);
        const z = this.radius * Math.sin(phi) * Math.sin(theta);
        
        // 現在の中心位置からの相対位置として設定
        this.position.set(x, y, z);
        this.velocity.set(0, 0, 0);
        this.age = 0.0;
        this.isActive = true;
    }
    
    /**
     * ランダムな力を加える（トラック11用）
     */
    applyRandomForce() {
        const force = new THREE.Vector3(
            (Math.random() - 0.5) * 20.0,
            (Math.random() - 0.5) * 20.0,
            (Math.random() - 0.5) * 20.0
        );
        this.addForce(force);
    }
    
    /**
     * 引力を計算してパーティクルに適用
     * @param {Particle} particle - 引き寄せるパーティクル
     * @param {THREE.Vector3} particleSize - パーティクルのサイズ（衝突判定用）
     */
    applyAttraction(particle, particleSize = null) {
        const particlePos = particle.getPosition();
        const toParticle = new THREE.Vector3().subVectors(particlePos, this.position);
        const distance = toParticle.length();
        
        // パーティクルのサイズを考慮した最小距離（表面で止まる）
        const particleRadius = particleSize ? Math.max(particleSize.x, particleSize.z, particleSize.y) / 2.0 : 1.0;
        const minDistance = this.radius + particleRadius;
        
        // 既に表面に到達している場合は引力を適用しない（突き抜けない）
        if (distance <= minDistance) {
            // 表面の位置に固定
            if (distance > 0.01) {
                const direction = toParticle.clone().normalize();
                const surfacePos = direction.multiplyScalar(minDistance);
                particle.position.copy(this.position.clone().add(surfacePos));
                
                // 速度を減らす（反発を完全に無くして、くっつくように）
                const vel = particle.getVelocity();
                
                // Sphereに向かう方向の速度成分を完全に0にする（常に）
                const velToSphere = direction.clone().multiplyScalar(vel.dot(direction));
                vel.sub(velToSphere);
                
                // 表面での摩擦を非常に強くして、くっつくように（反発を完全に防ぐ）
                vel.multiplyScalar(0.05); // 摩擦を非常に強く（速度を5%に減らす）
                
                // 念のため、再度Sphereに向かう方向の速度成分をチェックして0にする
                const finalVelToSphere = direction.clone().multiplyScalar(vel.dot(direction));
                if (Math.abs(finalVelToSphere.dot(direction)) > 0.001) {
                    vel.sub(finalVelToSphere);
                }
                
                // 速度が非常に小さい場合は完全に0にする
                if (vel.length() < 0.1) {
                    vel.set(0, 0, 0);
                }
                
                particle.velocity.copy(vel);
            }
            return;
        }
        
        // 距離に応じた引力を計算（距離が近いほど強い）
        const normalizedDist = distance / (this.radius * 10.0); // 影響範囲は半径の10倍
        const forceStrength = this.attractionStrength * (1.0 - normalizedDist) * (1.0 - normalizedDist);
        
        if (forceStrength > 0.01) {
            const forceDir = toParticle.clone().normalize().multiplyScalar(-forceStrength);
            particle.addForce(forceDir);
        }
    }
    
    /**
     * 光の強度と色を設定（トラック8用）
     */
    setLightIntensity(intensity, color, emissiveIntensity) {
        if (this.light) {
            this.light.intensity = intensity;
            this.light.color.setHex(color);
        }
        
        if (this.uniforms) {
            this.uniforms.lightIntensity.value = intensity;
            this.uniforms.lightColor.value.setHex(color);
            this.uniforms.sphereColor.value.setHex(color);
            this.uniforms.emissiveIntensity.value = emissiveIntensity;
        }
    }
    
    /**
     * リソースを解放
     */
    dispose(scene) {
        if (this.instancedManager) {
            this.instancedManager.dispose();
            this.instancedManager = null;
        }
        
        if (this.light) {
            scene.remove(this.light);
            this.light.dispose();
            this.light = null;
        }
    }
}

