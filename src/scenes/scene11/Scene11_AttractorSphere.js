/**
 * Scene11_AttractorSphere: 中心に配置される引力を持つSphere
 * Particleクラスを継承して物理演算に対応
 */

import { Particle } from '../../lib/Particle.js';
import * as THREE from 'three';

export class Scene11_AttractorSphere extends Particle {
    constructor(position, radius = 50.0) {
        super(position.x, position.y, position.z);
        this.radius = radius;
        this.attractionStrength = 2.5; // 引力の強さ（重力3.5より弱く）
        
        // 物理パラメータ（運動しやすくする）
        this.maxSpeed = 60.0; // 最大速度を上げる（30.0→60.0）
        this.maxForce = 30.0; // 最大力を上げる（10.0→30.0）
        this.friction = 0.0001; // 摩擦をほぼゼロにして動きやすくする
        this.mass = 10.0;
        
        // Three.js用のオブジェクト
        this.mesh = null;
        this.light = null;
    }
    
    /**
     * Three.jsオブジェクトを作成
     */
    createThreeObjects(scene) {
        // Sphereのジオメトリとマテリアル
        const geometry = new THREE.SphereGeometry(this.radius, 64, 64);
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff, // 白色
            emissive: 0xffffff, // 白色の発光
            emissiveIntensity: 3.0, // ブルーム効果を強くするために強度を上げる
            roughness: 0.2,
            metalness: 0.8
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        scene.add(this.mesh);
        
        // ポイントライトを追加（強めの全方向ライト）
        // シーンのサイズに合わせて距離を設定（地面サイズ2000、Sphere半径400なので、十分な距離を確保）
        this.light = new THREE.PointLight(0xffffff, 50.0, 10000); // 強度50.0、距離10000でシーン全体を照らす
        this.light.position.copy(this.position);
        this.light.castShadow = false; // シャドウは無効（パフォーマンス）
        this.light.decay = 0; // 距離による減衰を無効にする（一定の強度を保つ）
        scene.add(this.light);
    }
    
    /**
     * 更新処理
     */
    update() {
        // Particleの更新処理を呼ぶ
        super.update();
        
        // Three.jsオブジェクトの位置を更新
        if (this.mesh) {
            this.mesh.position.copy(this.position);
        }
        if (this.light) {
            this.light.position.copy(this.position);
        }
    }
    
    /**
     * ランダムな力を加える（トラック5用）
     */
    applyRandomForce() {
        const force = new THREE.Vector3(
            (Math.random() - 0.5) * 80.0, // 力を強くする（20.0→80.0）
            (Math.random() - 0.5) * 80.0,
            (Math.random() - 0.5) * 80.0
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
     * リソースを解放
     */
    dispose(scene) {
        if (this.mesh) {
            scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.mesh = null;
        }
        
        if (this.light) {
            scene.remove(this.light);
            this.light.dispose();
            this.light = null;
        }
    }
}

