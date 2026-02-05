/**
 * Scene13Particle: Scene13専用のパーティクルクラス
 */

import { Particle } from '../../lib/Particle.js';
import * as THREE from 'three';

export class Scene13Particle extends Particle {
    constructor(initialX = 0, initialY = 0, initialZ = 0, radius = 10, scale = null) {
        super(initialX, initialY, initialZ);
        this.radius = radius;
        this.scale = scale || new THREE.Vector3(radius, radius, radius);
        
        // 【追加】個体差（パーソナリティ）パラメータ
        // 同じ目標位置に向かっても「固まらない」ようにするためのオフセット
        // 球状の分布（Spherical Distribution）に変更して、引力モードでの四角い固まりを解消
        const tOffsetTheta = Math.random() * Math.PI * 2;
        const tOffsetPhi = Math.acos(2 * Math.random() - 1);
        const tOffsetR = Math.pow(Math.random(), 0.5) * 250; // 分布半径
        this.targetOffset = new THREE.Vector3(
            tOffsetR * Math.sin(tOffsetPhi) * Math.cos(tOffsetTheta),
            tOffsetR * Math.sin(tOffsetPhi) * Math.sin(tOffsetTheta),
            tOffsetR * Math.cos(tOffsetPhi)
        );
        
        this.radiusOffset = 0.8 + Math.random() * 0.4; 
        this.phaseOffset = Math.random() * Math.PI * 2; 
        
        // 螺旋モードでの担当高度を固定（0.0 〜 1.0）
        this.spiralHeightFactor = Math.random();
        
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
