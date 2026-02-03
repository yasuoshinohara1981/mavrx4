/**
 * Scene12Particle: Scene12専用のパーティクルクラス
 */

import { Particle } from '../../lib/Particle.js';
import * as THREE from 'three';

export class Scene12Particle extends Particle {
    constructor(initialX = 0, initialY = 0, initialZ = 0, radius = 10) {
        super(initialX, initialY, initialZ);
        this.radius = radius;
        
        // 回転パラメータ
        this.rotation = new THREE.Euler(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );
        this.angularVelocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.01, // 0.1から大幅に遅く
            (Math.random() - 0.5) * 0.01,
            (Math.random() - 0.5) * 0.01
        );

        // 物理パラメータの微調整（爆発的な動きに対応できるよう大幅に強化）
        this.maxSpeed = 200.0;
        this.maxForce = 500.0;
        this.friction = 0.02;
    }

    /**
     * 回転の更新
     */
    updateRotation(dt) {
        this.rotation.x += this.angularVelocity.x * dt * 60;
        this.rotation.y += this.angularVelocity.y * dt * 60;
        this.rotation.z += this.angularVelocity.z * dt * 60;
    }
}
