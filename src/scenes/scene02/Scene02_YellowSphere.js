/**
 * Scene02_YellowSphere: 黄色いsphere（大きくなりながら透明になって消える）
 */

import * as THREE from 'three';

export class Scene02_YellowSphere {
    constructor(position, scene, group, useShaderRendering, shaderMaterial) {
        this.position = position.clone();
        this.size = 5.0;
        this.maxSize = 80.0;
        this.age = 0.0;
        this.lifetime = 60.0;
        this.alpha = 255.0;
        
        this.scene = scene;
        this.group = group;
        this.useShaderRendering = useShaderRendering;
        this.shaderMaterial = shaderMaterial;
        
        // Three.js用のオブジェクト
        this.sphereMesh = null;
    }
    
    /**
     * 更新処理
     */
    update() {
        this.age += 1.0;
        
        const progress = this.age / this.lifetime;
        this.size = THREE.MathUtils.lerp(5.0, this.maxSize, progress);
        this.alpha = 255.0 * (1.0 - progress);
    }
    
    /**
     * 死んでいるかチェック
     */
    isDead() {
        return this.age >= this.lifetime;
    }
    
    /**
     * Three.jsオブジェクトを作成
     */
    createThreeObjects() {
        if (this.alpha < 10) return;
        
        const geometry = new THREE.SphereGeometry(this.size, 32, 32);
        
        let material;
        if (this.useShaderRendering && this.shaderMaterial) {
            material = this.shaderMaterial.clone();
            // uniformを個別にコピー（参照を避けるため）
            material.uniforms = {};
            Object.keys(this.shaderMaterial.uniforms).forEach(key => {
                material.uniforms[key] = { value: this.shaderMaterial.uniforms[key].value.clone ? 
                    this.shaderMaterial.uniforms[key].value.clone() : 
                    this.shaderMaterial.uniforms[key].value };
            });
            material.uniforms.sphereColor = { value: new THREE.Color(1, 1, 0) };
            material.uniforms.sphereLife = { value: this.alpha / 255.0 };  // 透明度を寿命として設定
        } else {
            // MeshStandardMaterialに変更してライトの影響を受けやすく
            material = new THREE.MeshStandardMaterial({
                color: 0xffff00,
                emissive: 0x332200,  // 控えめな発光色
                emissiveIntensity: 0.15,  // 発光強度を控えめに
                roughness: 0.8,  // マットな質感
                metalness: 0.0,
                transparent: true,
                opacity: this.alpha / 255.0
            });
        }
        
        this.sphereMesh = new THREE.Mesh(geometry, material);
        this.sphereMesh.position.copy(this.position);
        this.group.add(this.sphereMesh);
    }
    
    /**
     * Three.jsオブジェクトを更新
     */
    updateThreeObjects() {
        if (this.sphereMesh) {
            // サイズが変わった場合は再作成
            if (this.sphereMesh.geometry.parameters.radius !== this.size) {
                const oldGeometry = this.sphereMesh.geometry;
                this.sphereMesh.geometry = new THREE.SphereGeometry(this.size, 32, 32);
                oldGeometry.dispose();
            }
            
            // 透明度を更新
            if (this.sphereMesh.material) {
                if (this.useShaderRendering && this.shaderMaterial) {
                    if (this.sphereMesh.material.uniforms && this.sphereMesh.material.uniforms.sphereLife) {
                        this.sphereMesh.material.uniforms.sphereLife.value = this.alpha / 255.0;
                    }
                } else {
                    this.sphereMesh.material.opacity = this.alpha / 255.0;
                }
            }
        }
    }
    
    /**
     * リソースを解放
     */
    dispose(scene) {
        if (this.sphereMesh) {
            this.group.remove(this.sphereMesh);
            this.sphereMesh.geometry.dispose();
            this.sphereMesh.material.dispose();
            this.sphereMesh = null;
        }
    }
}

