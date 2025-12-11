/**
 * Scene07_Building: 爆発で吹き飛ぶビルパーティクル
 * 物理演算を行う個別のビル
 */

import * as THREE from 'three';

export class Scene07_Building {
    constructor(initialPos, buildingWidthX, buildingWidthZ, buildingHeight, landmark = false) {
        this.position = initialPos.clone();
        this.widthX = buildingWidthX;
        this.widthZ = buildingWidthZ;
        this.height = buildingHeight;
        this.isLandmark = landmark;
        
        // 物理パラメータ
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.acceleration = new THREE.Vector3(0, 0, 0);
        
        // 体積に応じて質量を設定（Processing版と同じ）
        const volume = buildingWidthX * buildingWidthZ * buildingHeight;
        const maxVolume = 65.0 * 65.0 * 480.0;  // LANDMARK_MAX
        const minVolume = 2.5 * 2.5 * 15.0;  // BUILDING_MIN
        this.mass = THREE.MathUtils.mapLinear(volume, minVolume, maxVolume, 10.0, 80.0);  // Processing版と同じ
        
        // 個別の重力（Processing版と同じ、Three.jsではY軸が上向きが正なので負の値で下向き）
        const baseGravity = THREE.MathUtils.mapLinear(this.mass, 10.0, 80.0, 0.5, 1.2);
        const randomFactor = Math.random() * 0.4 + 0.8;  // 0.8-1.2
        this.gravity = new THREE.Vector3(0, -baseGravity * randomFactor, 0);  // 負の値で下向き
        
        // 物理パラメータ（Processing版と同じ）
        this.maxSpeed = 15.0;  // Processing版と同じ
        this.maxForce = 2.0;  // Processing版と同じ
        this.friction = 0.05;  // Processing版と同じ
        
        // 回転
        this.rotation = new THREE.Euler(0, 0, 0);
        this.angularVelocity = new THREE.Vector3(0, 0, 0);
        
        // フラグ
        this.hasExploded = false;
        this.hasLanded = false;
        
        // 色（グレースケール、ライトグレー〜濃いグレー）
        const grayValue = Math.random() * 180 + 75;  // 75-255（ライトグレー〜濃いグレー）
        this.color = new THREE.Color(grayValue / 255, grayValue / 255, grayValue / 255);
    }
    
    /**
     * 力を追加（爆発の力で押し出されるように）
     */
    addForce(force) {
        // 質量で割る（重いビルほど動きにくい）
        const forcePerMass = force.clone().divideScalar(this.mass);  // 0.5 → 1.0に戻す（質量の影響を強く）
        this.acceleration.add(forcePerMass);
    }
    
    /**
     * 角速度を追加
     */
    addAngularVelocity(velX, velY, velZ) {
        this.angularVelocity.x += velX;
        this.angularVelocity.y += velY;
        this.angularVelocity.z += velZ;
    }
    
    /**
     * 角速度をリセット
     */
    resetAngularVelocity() {
        this.angularVelocity.set(0, 0, 0);
    }
    
    /**
     * 角速度に摩擦を適用
     */
    applyAngularFriction(friction) {
        this.angularVelocity.multiplyScalar(friction);
        if (Math.abs(this.angularVelocity.x) < 0.001) this.angularVelocity.x = 0;
        if (Math.abs(this.angularVelocity.y) < 0.001) this.angularVelocity.y = 0;
        if (Math.abs(this.angularVelocity.z) < 0.001) this.angularVelocity.z = 0;
    }
    
    /**
     * 重力を適用
     */
    applyGravity(gravity) {
        this.addForce(gravity);
    }
    
    /**
     * 更新（Processing版と完全に同じ）
     */
    update(deltaTime = 1.0) {
        // 速度に加速度を加える
        this.velocity.add(this.acceleration);
        
        // 最大速度を制限
        if (this.velocity.length() > this.maxSpeed) {
            this.velocity.normalize().multiplyScalar(this.maxSpeed);
        }
        
        // 位置を更新
        this.position.add(this.velocity);
        
        // 摩擦を適用（Processing版と同じ）
        this.velocity.multiplyScalar(1.0 - this.friction);
        
        // 加速度をリセット（Processing版と同じ）
        this.acceleration.set(0, 0, 0);
    }
    
    /**
     * 位置を取得
     */
    getPosition() {
        return this.position.clone();
    }
    
    /**
     * 位置を設定
     */
    setPosition(pos) {
        this.position.copy(pos);
    }
    
    /**
     * 速度を取得
     */
    getVelocity() {
        return this.velocity.clone();
    }
    
    /**
     * 速度を設定
     */
    setVelocity(vel) {
        this.velocity.copy(vel);
    }
    
    /**
     * 重力を取得
     */
    getGravity() {
        return this.gravity.clone();
    }
    
    /**
     * 高さを取得
     */
    getHeight() {
        return this.height;
    }
    
    /**
     * 色をランダマイズ
     */
    randomizeColor() {
        const grayValue = Math.random() * 150 + 50;  // 50-200
        this.color.setRGB(grayValue / 255, grayValue / 255, grayValue / 255);
    }
}

