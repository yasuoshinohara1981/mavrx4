/**
 * Scene01_Explosion: ミサイル着弾時の爆発エフェクト
 * 透明度の高いsphereが大きくなって透明度を上げて消滅
 */

import * as THREE from 'three';

export class Scene01_Explosion {
    constructor(position, velocity = 127.0) {
        this.position = position.clone();
        this.velocity = velocity;
        
        // 爆発パラメータ
        this.age = 0.0;
        this.lifetime = 60.0;  // 60フレームで消える
        this.maxSize = THREE.MathUtils.mapLinear(velocity, 0, 127, 20.0, 100.0);  // ベロシティに応じた最大サイズ
        this.initialSize = 5.0;  // 初期サイズ
        
        // Three.js用のオブジェクト
        this.explosionMesh = null;  // 内側のオレンジ色のsphere（塗りつぶし）
        this.explosionEdges = null;  // 外側の線（エッジのみ）
    }
    
    update() {
        this.age += 1.0;
        
        const progress = this.age / this.lifetime;
        const size = THREE.MathUtils.lerp(this.initialSize, this.maxSize, progress);
        const scale = size / this.initialSize;
        
        // 内側のオレンジ色のsphereのサイズと透明度を更新
        if (this.explosionMesh && this.explosionMesh.material) {
            this.explosionMesh.scale.set(scale, scale, scale);
            
            // 透明度を上げる（初期は少し透明、徐々に完全に透明になる）
            // progress: 0.0 → 1.0
            // opacity: 0.3 → 0.0（透明度を上げる = 不透明度を下げる）
            const initialOpacity = 0.3;
            this.explosionMesh.material.opacity = initialOpacity * (1.0 - progress);
        }
        
        // 外側のエッジのサイズと透明度を更新
        if (this.explosionEdges) {
            this.explosionEdges.scale.set(scale, scale, scale);
            
            if (this.explosionEdges.material) {
                // エッジも同様に透明度を上げる
                const initialOpacity = 0.8;  // エッジは少し濃く
                this.explosionEdges.material.opacity = initialOpacity * (1.0 - progress);
            }
        }
    }
    
    createThreeObjects(scene) {
        // 内側のオレンジ色のsphere（塗りつぶし、透明）
        const sphereGeometry = new THREE.SphereGeometry(this.initialSize, 16, 16);
        const innerMaterial = new THREE.MeshBasicMaterial({
            color: 0xffa500,  // オレンジ色
            transparent: true,
            opacity: 0.3,  // 初期は少し透明（透明度が高い）
            side: THREE.DoubleSide
        });
        
        this.explosionMesh = new THREE.Mesh(sphereGeometry, innerMaterial);
        this.explosionMesh.position.copy(this.position);
        scene.add(this.explosionMesh);
        
        // 外側のエッジ（線のみ）
        const edgesGeometry = new THREE.EdgesGeometry(sphereGeometry);
        const edgesMaterial = new THREE.LineBasicMaterial({
            color: 0xffffff,  // 白色
            transparent: true,
            opacity: 0.8,  // 初期は少し透明
            linewidth: 1
        });
        
        this.explosionEdges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
        this.explosionEdges.position.copy(this.position);
        scene.add(this.explosionEdges);
    }
    
    updateThreeObjects() {
        // update()で既に更新されている
    }
    
    isDead() {
        return this.age >= this.lifetime;
    }
    
    dispose(scene) {
        // 内側のsphereを削除
        if (this.explosionMesh) {
            scene.remove(this.explosionMesh);
            if (this.explosionMesh.geometry) {
                this.explosionMesh.geometry.dispose();
            }
            if (this.explosionMesh.material) {
                this.explosionMesh.material.dispose();
            }
            this.explosionMesh = null;
        }
        
        // 外側のエッジを削除
        if (this.explosionEdges) {
            scene.remove(this.explosionEdges);
            if (this.explosionEdges.geometry) {
                this.explosionEdges.geometry.dispose();
            }
            if (this.explosionEdges.material) {
                this.explosionEdges.material.dispose();
            }
            this.explosionEdges = null;
        }
    }
}

