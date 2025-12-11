/**
 * Scene10_ManifoldSphere: カラビ・ヤウ多様体上のマーカースフィア
 * 特定の位置を示す赤いsphereとコールアウトを管理
 */

import * as THREE from 'three';

export class Scene10_ManifoldSphere {
    constructor(position, label = '') {
        this.position = position.clone();
        this.label = label;
        this.age = 0.0;
        this.lifetime = 300.0;  // 5秒（60fps想定）
        this.calloutLifetime = 30.0;  // コールアウトは0.5秒で消える（もっと早く消す）
        this.active = true;
        // calloutRightは描画時に画面位置に応じて自動決定するため、ここでは不要
        // u, vパラメータ（時間とともに位置を更新するために使用）
        this.u = undefined;
        this.v = undefined;
        
        // Three.js用のオブジェクト
        this.sphereMesh = null;
    }
    
    /**
     * 更新
     */
    update() {
        if (this.active) {
            this.age += 1.0;
        }
        
        if (this.age >= this.lifetime) {
            this.active = false;
        }
    }
    
    /**
     * Three.jsオブジェクトを作成
     */
    createThreeObjects(scene) {
        // 赤いsphereを作成（さらに小さく）
        const geometry = new THREE.SphereGeometry(2, 32, 32);  // サイズをさらに小さく
        const material = new THREE.MeshStandardMaterial({
            color: 0xff0000,  // 赤
            emissive: 0xff0000,  // 赤のエミッシブ（光るように）
            emissiveIntensity: 0.5,  // エミッシブ強度を上げる
            roughness: 0.3,
            metalness: 0.1,
            transparent: true,
            opacity: 1.0
        });
        
        this.sphereMesh = new THREE.Mesh(geometry, material);
        this.sphereMesh.position.copy(this.position);
        this.sphereMesh.visible = true;  // 明示的に表示
        scene.add(this.sphereMesh);
    }
    
    /**
     * Three.jsオブジェクトを更新
     */
    updateThreeObjects() {
        if (this.sphereMesh) {
            this.sphereMesh.position.copy(this.position);
            
            // 透明度を計算（最初は透明、中間で不透明、最後は透明に）
            const progress = this.age / this.lifetime;
            let opacity;
            if (progress < 0.1) {
                opacity = progress / 0.1;
            } else if (progress < 0.9) {
                opacity = 1.0;
            } else {
                const fadeProgress = (progress - 0.9) / 0.1;
                opacity = 1.0 - fadeProgress;
            }
            
            this.sphereMesh.material.opacity = opacity;
            this.sphereMesh.visible = opacity > 0.0;
            
            // エミッシブ強度も調整（より目立つように）
            this.sphereMesh.material.emissiveIntensity = 0.5 + opacity * 0.5;
        }
    }
    
    /**
     * アクティブかどうか
     */
    isActive() {
        return this.active && this.age < this.lifetime;
    }
    
    /**
     * コールアウトが表示されるかどうか
     */
    shouldShowCallout() {
        return this.age < this.calloutLifetime;
    }
    
    /**
     * 位置を取得
     */
    getPosition() {
        return this.position.clone();
    }
    
    /**
     * ラベルを取得
     */
    getLabel() {
        return this.label;
    }
    
    
    /**
     * リソースを解放
     */
    dispose(scene) {
        if (this.sphereMesh) {
            scene.remove(this.sphereMesh);
            this.sphereMesh.geometry.dispose();
            this.sphereMesh.material.dispose();
            this.sphereMesh = null;
        }
    }
}
