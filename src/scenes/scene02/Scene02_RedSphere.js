/**
 * Scene02_RedSphere: ベロシティに応じた色のsphere
 */

import * as THREE from 'three';

export class Scene02_RedSphere {
    constructor(position, hue, saturation, lightness, scene, group, useShaderRendering, shaderMaterial, camera = null) {
        this.position = position.clone();
        this.hue = hue;
        this.saturation = saturation;
        this.lightness = lightness;
        this.size = 10.0;
        this.myScale = 1.0;
        this.isConnected = false;
        
        this.scene = scene;
        this.group = group;
        this.useShaderRendering = useShaderRendering;
        this.shaderMaterial = shaderMaterial;
        this.camera = camera;  // DOFエフェクト用にカメラを保存
        
        // Three.js用のオブジェクト
        this.sphereMesh = null;
    }
    
    /**
     * HSLをRGBに変換
     */
    hslToRgb(h, s, l) {
        // Processingと同じ実装
        h = h % 360;
        if (h < 0) h += 360;  // 負の値の場合は360度を加算
        s = Math.max(0, Math.min(100, s)) / 100.0;
        l = Math.max(0, Math.min(100, l)) / 100.0;
        
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = l - c / 2;
        
        let r = 0, g = 0, b = 0;
        
        if (h < 60) {
            r = c; g = x; b = 0;
        } else if (h < 120) {
            r = x; g = c; b = 0;
        } else if (h < 180) {
            r = 0; g = c; b = x;
        } else if (h < 240) {
            r = 0; g = x; b = c;
        } else if (h < 300) {
            r = x; g = 0; b = c;
        } else {
            r = c; g = 0; b = x;
        }
        
        // Processingと同じ：0-1の範囲で返す（Three.jsのColorは0-1の範囲）
        return new THREE.Color((r + m), (g + m), (b + m));
    }
    
    /**
     * カメラからの距離とサイズに応じたdetail（分割数）を計算
     */
    getDetailFromDistance() {
        if (!this.camera) {
            return 32;  // カメラがない場合はデフォルト値
        }
        
        const distance = this.position.distanceTo(this.camera.position);
        const sphereSize = this.size * this.myScale;
        
        // カメラに近い、または大きいsphereは32（荒が目立つから細かく）
        // それ以外は段階的に16, 8
        const isNear = distance < 500;
        const isLarge = sphereSize > 20;
        
        if (isNear || isLarge) {
            return 32;  // 近いか大きい場合は32
        } else if (distance < 1500) {
            return 16;  // 中距離は16
        } else {
            return 8;   // 遠い場合は8
        }
    }
    
    /**
     * Three.jsオブジェクトを作成
     */
    createThreeObjects() {
        const sphereSize = this.size * this.myScale;
        const detail = this.getDetailFromDistance();
        
        const geometry = new THREE.SphereGeometry(sphereSize, detail, detail);
        
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
            // Processing版と同じHSL→RGB変換を使用（hslToRgb関数を使用）
            const color = this.hslToRgb(this.hue, this.saturation, this.lightness);
            material.uniforms.sphereColor = { value: color };
        } else {
            // Processing版と同じHSL→RGB変換を使用（hslToRgb関数を使用）
            const rgbColor = this.hslToRgb(this.hue, this.saturation, this.lightness);
            
            // デバッグ用ログ（色が正しく設定されているか確認）
            console.log(`Sphere color - Hue: ${this.hue}, Sat: ${this.saturation}, Light: ${this.lightness}, RGB: (${rgbColor.r.toFixed(3)}, ${rgbColor.g.toFixed(3)}, ${rgbColor.b.toFixed(3)})`);
            
            // 赤の場合、直接RGBで鮮やかな赤を指定（hue=0の時）
            let finalColor = rgbColor;
            if (Math.abs(this.hue) < 1 || Math.abs(this.hue - 360) < 1) {
                // 赤の場合、直接鮮やかな赤を指定
                finalColor = new THREE.Color(1.0, 0.0, 0.0);  // 純粋な赤
                console.log(`  -> Using pure red (1.0, 0.0, 0.0) for hue=${this.hue}`);
            }
            
            // マットな質感にするため、emissiveは控えめに
            const emissiveColor = new THREE.Color();
            emissiveColor.r = finalColor.r * 0.1;  // 発光色を控えめに（ライトの影響を受けやすく）
            emissiveColor.g = finalColor.g * 0.1;
            emissiveColor.b = finalColor.b * 0.1;
            
            material = new THREE.MeshStandardMaterial({
                color: finalColor,
                emissive: emissiveColor,  // 発光色を控えめに設定
                emissiveIntensity: 0.2,  // 発光強度を下げてライトの影響を受けやすく
                roughness: 0.85,  // 粗さを上げてマットな質感に
                metalness: 0.0,  // メタリック感を無効化して色を明確に
                transparent: false,  // 不透明度100%なのでtransparentは不要
                opacity: 1.0  // 常に100%不透明
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
            this.sphereMesh.position.copy(this.position);
            const sphereSize = this.size * this.myScale;
            const detail = this.getDetailFromDistance();
            
            // サイズまたはdetailが変わった場合は再作成
            const currentRadius = this.sphereMesh.geometry.parameters.radius;
            const currentWidthSegments = this.sphereMesh.geometry.parameters.widthSegments;
            const currentHeightSegments = this.sphereMesh.geometry.parameters.heightSegments;
            
            if (currentRadius !== sphereSize || currentWidthSegments !== detail || currentHeightSegments !== detail) {
                const oldGeometry = this.sphereMesh.geometry;
                this.sphereMesh.geometry = new THREE.SphereGeometry(sphereSize, detail, detail);
                oldGeometry.dispose();
            }
            
            // 不透明度を100%に固定（DOFエフェクトを無効化）
            if (!this.useShaderRendering && this.sphereMesh.material) {
                this.sphereMesh.material.opacity = 1.0;  // 常に100%不透明
            }
        }
    }
    
    /**
     * 接続状態を設定
     */
    setConnected(connected) {
        this.isConnected = connected;
    }
    
    /**
     * スケールを設定
     */
    setScale(scale) {
        this.myScale = scale;
    }
    
    /**
     * 位置を取得
     */
    getPosition() {
        return this.position.clone();
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

