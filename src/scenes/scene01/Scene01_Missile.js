/**
 * Scene01_Missile: 球面上の2点間を放物線で結ぶミサイル
 */

import * as THREE from 'three';

export class Scene01_Missile {
    constructor(start, target, velocity = 127.0, noteNumber = 64.0, durationMs = 0.0) {
        this.startPos = start.clone();
        this.targetPos = target.clone();
        this.currentPos = start.clone();
        
        this.trail = [start.clone()];
        this.maxTrailLength = 500;  // Processingと同じ
        
        this.progress = 0.0;
        this.isActive = true;
        
        // スコープと同じように年齢管理
        this.age = 0.0;
        this.lifetime = 60.0;  // 60フレームで消える（スコープと同じ）
        
        // ベロシティを保存
        this.velocity = velocity;
        
        // ベロシティから色を計算（0-127 → HSL、青(240度)から赤(0度)へ）
        const hue = THREE.MathUtils.mapLinear(velocity, 0, 127, 240, 0);
        const saturation = 80.0;
        const brightness = 90.0;
        
        this.missileColor = new THREE.Color();
        this.missileColor.setHSL(hue / 360, saturation / 100, brightness / 100);
        
        // ノートナンバーから放物線の高さを計算
        const distance = start.distanceTo(target);
        const heightFactor = THREE.MathUtils.mapLinear(noteNumber, 0, 127, 0.1, 0.5);
        this.arcHeight = distance * heightFactor;
        
        // デュレーションからスピードを計算（Processingと同じ、より遅く）
        if (durationMs > 0) {
            // デュレーション（ミリ秒）をフレーム数に変換（60fps想定）
            const durationFrames = durationMs / 1000.0 * 60.0;
            // スピード = 1.0 / フレーム数（デュレーションが長いほど遅い）
            this.speed = 1.0 / durationFrames;
            // 最小・最大スピードを制限（より遅く）
            this.speed = Math.max(0.0005, Math.min(0.02, this.speed));
        } else {
            this.speed = 0.005;  // デフォルト速度（Processingと同じ、より遅く）
        }
        
        // Three.js用のオブジェクト
        this.trailGeometry = null;
        this.trailMaterial = null;
        this.trailLine = null;
        this.missileMesh = null;
    }
    
    update() {
        // 年齢を更新（スコープと同じ）
        this.age += 1.0;
        
        if (this.isActive) {
            this.progress += this.speed;
            
            if (this.progress >= 1.0) {
                this.progress = 1.0;
                this.currentPos.copy(this.targetPos);
                this.isActive = false;
            } else {
                this.currentPos.copy(this.calculateParabolicPosition(this.progress));
            }
            
            // 軌跡を更新（Processingと同じ：毎フレーム追加）
            this.trail.push(this.currentPos.clone());
            if (this.trail.length > this.maxTrailLength) {
                this.trail.shift();
            }
        }
    }
    
    calculateParabolicPosition(t) {
        // DEBUG: 放物線計算を簡略化（パフォーマンステスト用）
        // 線形補間で基本位置を計算
        const linearPos = new THREE.Vector3().lerpVectors(this.startPos, this.targetPos, t);
        
        // 放物線の高さを計算（t=0.5で最大）
        const height = this.arcHeight * 4.0 * t * (1.0 - t);
        
        // 起点と終点の中点の法線方向を計算
        const midPoint = new THREE.Vector3().lerpVectors(this.startPos, this.targetPos, 0.5);
        const up = midPoint.clone().normalize();
        
        // 放物線の位置 = 線形位置 + 上方向 * 高さ
        return linearPos.add(up.multiplyScalar(height));
        
        // DEBUG: 放物線計算を無効化して線形補間のみにする場合
        // return linearPos;
    }
    
    createThreeObjects(scene) {
        // 軌跡用のLine（初期化時は空の配列なので、updateThreeObjectsで作成）
        // ここでは何もしない（updateThreeObjectsで作成される）
        
        // ミサイル本体用のSphere（ベロシティから計算した色、ライティングあり）
        if (this.isActive) {
            const geometry = new THREE.SphereGeometry(2, 8, 8);  // Processingと同じ（sphere(2)）
            // ベロシティから計算した色のマテリアル（ライティングあり）
            const material = new THREE.MeshStandardMaterial({
                color: this.missileColor  // ベロシティから計算した色
            });
            this.missileMesh = new THREE.Mesh(geometry, material);
            this.missileMesh.position.copy(this.currentPos);
            scene.add(this.missileMesh);
        }
    }
    
    updateThreeObjects(scene) {
        // スコープと同じように年齢に応じて透明度を計算
        const fadeAlpha = Math.max(0.0, 1.0 - (this.age / this.lifetime));
        
        // 軌跡を更新または作成（スコープと同じように透明度でフェードアウト）
        if (this.trail.length > 1 && fadeAlpha > 0) {
            if (!this.trailLine || !this.trailGeometry) {
                // 軌跡がまだ作成されていない場合は作成
                const positions = new Float32Array(this.trail.length * 3);
                const colors = new Float32Array(this.trail.length * 3);
                
                for (let i = 0; i < this.trail.length; i++) {
                    const pos = this.trail[i];
                    positions[i * 3] = pos.x;
                    positions[i * 3 + 1] = pos.y;
                    positions[i * 3 + 2] = pos.z;
                    
                    // 白く目立つように：古い点ほど透明度を低く（150〜255）、さらに年齢でフェードアウト
                    const segmentAlpha = THREE.MathUtils.mapLinear(i, 0, this.trail.length - 1, 150, 255) / 255.0;
                    const alpha = segmentAlpha * fadeAlpha;
                    // 白くするため、RGB値を明るく（0.9〜1.0）
                    const brightness = 0.9 + (alpha * 0.1);  // より明るく
                    colors[i * 3] = brightness;      // R
                    colors[i * 3 + 1] = brightness;   // G
                    colors[i * 3 + 2] = brightness;   // B
                }
                
                this.trailGeometry = new THREE.BufferGeometry();
                this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                this.trailGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                
                this.trailMaterial = new THREE.LineBasicMaterial({
                    vertexColors: true,  // 頂点カラーを使用
                    transparent: true,
                    opacity: 1.0,  // 透明度を明るく
                    linewidth: 3  // 線を太くして目立たせる
                });
                
                this.trailLine = new THREE.Line(this.trailGeometry, this.trailMaterial);
                scene.add(this.trailLine);
            } else {
                // 既存の軌跡を更新
                // バッファサイズが変わった場合は再作成
                if (this.trailGeometry.attributes.position && 
                    this.trailGeometry.attributes.position.count !== this.trail.length) {
                    // 既存の軌跡を削除
                    if (this.trailLine) {
                        scene.remove(this.trailLine);
                    }
                    if (this.trailGeometry) {
                        this.trailGeometry.dispose();
                    }
                    if (this.trailMaterial) {
                        this.trailMaterial.dispose();
                    }
                    this.trailLine = null;
                    this.trailGeometry = null;
                    this.trailMaterial = null;
                    // 再作成（次のフレームで）
                    return;
                }
                
                if (this.trailGeometry.attributes.position && this.trailGeometry.attributes.color) {
                    const positions = this.trailGeometry.attributes.position.array;
                    const colors = this.trailGeometry.attributes.color.array;
                    
                    // マテリアルの透明度も更新（年齢に応じて）
                    if (this.trailMaterial) {
                        this.trailMaterial.opacity = fadeAlpha;
                    }
                    
                    // 軌跡の全点を更新（スコープと同じように年齢でフェードアウト）
                    for (let i = 0; i < this.trail.length; i++) {
                        const pos = this.trail[i];
                        const arrayIndex = i * 3;
                        positions[arrayIndex] = pos.x;
                        positions[arrayIndex + 1] = pos.y;
                        positions[arrayIndex + 2] = pos.z;
                        
                        // 白く目立つように：古い点ほど透明度を低く（150〜255）、さらに年齢でフェードアウト
                        const segmentAlpha = THREE.MathUtils.mapLinear(i, 0, this.trail.length - 1, 150, 255) / 255.0;
                        const alpha = segmentAlpha * fadeAlpha;
                        // 白くするため、RGB値を明るく（0.9〜1.0）
                        const brightness = 0.9 + (alpha * 0.1);  // より明るく
                        colors[arrayIndex] = brightness;      // R
                        colors[arrayIndex + 1] = brightness;   // G
                        colors[arrayIndex + 2] = brightness;   // B
                    }
                    
                    this.trailGeometry.attributes.position.needsUpdate = true;
                    this.trailGeometry.attributes.color.needsUpdate = true;
                }
            }
        } else if (this.trailLine && fadeAlpha <= 0) {
            // 完全に透明になったら削除
            scene.remove(this.trailLine);
            if (this.trailGeometry) {
                this.trailGeometry.dispose();
            }
            if (this.trailMaterial) {
                this.trailMaterial.dispose();
            }
            this.trailLine = null;
            this.trailGeometry = null;
            this.trailMaterial = null;
        }
        
        // ミサイル本体を更新
        if (this.missileMesh) {
            this.missileMesh.position.copy(this.currentPos);
        }
    }
    
    dispose(scene) {
        if (this.trailLine) {
            scene.remove(this.trailLine);
            this.trailGeometry.dispose();
            this.trailMaterial.dispose();
        }
        if (this.missileMesh) {
            scene.remove(this.missileMesh);
            this.missileMesh.geometry.dispose();
            this.missileMesh.material.dispose();
        }
    }
    
    getIsActive() {
        return this.isActive;
    }
    
    getPosition() {
        return this.currentPos.clone();
    }
    
    getVelocity() {
        return this.velocity;
    }
}

