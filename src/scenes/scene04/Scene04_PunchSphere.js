/**
 * Scene04_PunchSphere: 圧力の発生位置を表すsphere
 * Processing版のScene04_PunchSphereを参考
 */

import * as THREE from 'three';

export class Scene04_PunchSphere {
    constructor(center, strength, radius, returnProbability) {
        this.center = center.clone();
        this.position = center.clone();
        this.strength = strength;
        this.maxStrength = strength;
        this.radius = radius;
        this.returnProbability = returnProbability;
        this.age = 0.0;
        this.decay = 0.92;
        
        // Circleエフェクト用
        this.circleRadius = 0.0;
        this.circleAlpha = 255.0;
        this.circleAge = 0.0;
        this.CIRCLE_LIFETIME = 60.0;
        this.circleMaxRadius = radius * 1.5;
        
        // Three.js用のオブジェクト
        this.sphereMesh = null;
        this.circleMesh = null;
        this.circleEdges = null;
        
        // テキスト表示用
        this.scopeCanvas = null;
        this.scopeCtx = null;
    }
    
    /**
     * 更新処理
     * Processing版と同じ：グリッド座標から地形パーティクルのZ位置を取得
     */
    update(noiseFunc, mapFunc, noiseScale, cols, rows, scl, terrainOffsetX = 0, terrainOffsetY = 0) {
        // 力の減衰
        if (this.strength > 0.01) {
            this.strength *= this.decay;
        } else {
            this.strength = 0.0;
        }
        
        this.age += 1.0;
        
        // Circleエフェクトの更新
        this.updateCircle();
        
        // 位置を更新（地形のZ位置に追従）
        // Processing版と同じ：グリッド座標から地形パーティクルのZ位置を取得
        // 地形の中心を画面の中心（0, 0, 0）に合わせたので、オフセットを考慮
        const gridX = Math.floor((this.center.x - terrainOffsetX) / scl);
        const gridY = Math.floor((this.center.y - terrainOffsetY) / scl);
        const clampedGridX = Math.max(0, Math.min(cols - 1, gridX));
        const clampedGridY = Math.max(0, Math.min(rows - 1, gridY));
        
        // その位置にあるパーティクルのZ位置を計算（初期化時と同じノイズ関数を使用）
        // 初期化時と同じ計算方法でZ位置を取得
        if (noiseFunc && mapFunc) {
            const noiseX = clampedGridX * noiseScale * 200.0;
            const noiseY = clampedGridY * noiseScale * 200.0;
            const terrainZ = mapFunc(noiseFunc(noiseX, noiseY), 0, 1, -100, 100);
            
            // sphereの位置を地形の表面に配置（X, Yは中心位置、Zは地形のZ位置）
            this.position.set(this.center.x, this.center.y, terrainZ);
        } else {
            // ノイズ関数がない場合は中心位置のZを使用
            this.position.set(this.center.x, this.center.y, this.center.z);
        }
    }
    
    /**
     * Circleエフェクトの更新
     */
    updateCircle() {
        if (this.circleAge < this.CIRCLE_LIFETIME) {
            this.circleAge += 1.0;
            const progress = this.circleAge / this.CIRCLE_LIFETIME;
            this.circleRadius = this.circleMaxRadius * progress;
            this.circleAlpha = 255.0 * (1.0 - progress);
        } else {
            this.circleRadius = 0.0;
            this.circleAlpha = 0.0;
        }
    }
    
    /**
     * Three.jsオブジェクトを作成
     * @param {THREE.Scene} scene - メインシーン（sphere用）
     * @param {THREE.Group} group - グループ（sphere用）
     * @param {THREE.Scene} debugScene - デバッグシーン（未使用、互換性のため残す）
     * @param {number} terrainRotationX - 地形の回転角度
     */
    createThreeObjects(scene, group, debugScene, terrainRotationX = Math.PI / 12) {
        // 赤いsphereを作成
        const sphereSize = this.calculateSphereSize();
        const geometry = new THREE.SphereGeometry(sphereSize, 16, 16);
        const material = new THREE.MeshStandardMaterial({
            color: 0xff0000,  // 赤
            emissive: 0x330000,
            emissiveIntensity: 0.2,
            roughness: 0.8,
            metalness: 0.0
        });
        
        this.sphereMesh = new THREE.Mesh(geometry, material);
        this.sphereMesh.position.copy(this.position);
        group.add(this.sphereMesh);
        
        // Circleエフェクトを作成（黄色、地形の回転に合わせる、元のsceneに追加）
        this.createCircleEffect(scene, terrainRotationX);
    }
    
    /**
     * Circleエフェクトを作成
     * 地形の回転に合わせて地面と平行に配置
     */
    createCircleEffect(scene, terrainRotationX = 0) {
        // 水平方向のCircle（地形の回転に合わせて地面と平行）
        const circleSegments = 32;
        const circleGeometry = new THREE.RingGeometry(0, 1, circleSegments);
        
        // 黄色のCircle（半透明）
        const circleMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,  // 黄色
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        
        this.circleMesh = new THREE.Mesh(circleGeometry, circleMaterial);
        // 地形の回転に合わせて地面と平行に配置
        // RingGeometryはデフォルトでX-Y平面（Z=0）にあるので、そのまま水平
        // 地形の回転が0なので、回転なしで水平になる
        this.circleMesh.rotation.x = 0;  // 水平（X-Y平面）
        this.circleMesh.visible = false;
        this.circleMesh.userData.isPunchSphereCircle = true;  // 識別用フラグ
        scene.add(this.circleMesh);
        
        // Circleの外周の線（黄色、より濃い）
        const edgesGeometry = new THREE.RingGeometry(0.99, 1.0, circleSegments);
        const edgesMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,  // 黄色
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        
        this.circleEdges = new THREE.Mesh(edgesGeometry, edgesMaterial);
        // 地形の回転に合わせて地面と平行に配置
        // RingGeometryはデフォルトでX-Y平面（Z=0）にあるので、そのまま水平
        this.circleEdges.rotation.x = 0;  // 水平（X-Y平面）
        this.circleEdges.visible = false;
        this.circleEdges.userData.isPunchSphereCircle = true;  // 識別用フラグ
        scene.add(this.circleEdges);
    }
    
    /**
     * Three.jsオブジェクトを更新
     */
    updateThreeObjects() {
        if (this.sphereMesh) {
            this.sphereMesh.position.copy(this.position);
            
            // 力の強さに応じてサイズを更新
            const sphereSize = this.calculateSphereSize();
            if (this.sphereMesh.geometry.parameters.radius !== sphereSize) {
                const oldGeometry = this.sphereMesh.geometry;
                this.sphereMesh.geometry = new THREE.SphereGeometry(sphereSize, 16, 16);
                oldGeometry.dispose();
            }
        }
        
        // Circleエフェクトの更新（Processing版と同じ：時間とともに大きく、透明になる）
        if (this.circleMesh && this.circleEdges) {
            if (this.circleRadius > 0.0 && this.circleAlpha > 30.0) {
                // 地形の表面に配置（Z位置は地形のZ位置）
                this.circleMesh.position.copy(this.position);
                this.circleMesh.scale.set(this.circleRadius, this.circleRadius, 1);
                this.circleMesh.material.opacity = (this.circleAlpha / 255.0) * 0.3;
                this.circleMesh.visible = true;
                
                this.circleEdges.position.copy(this.position);
                this.circleEdges.scale.set(this.circleRadius, this.circleRadius, 1);
                this.circleEdges.material.opacity = (this.circleAlpha / 255.0) * 0.8;
                this.circleEdges.visible = true;
            } else {
                this.circleMesh.visible = false;
                this.circleEdges.visible = false;
            }
        }
        }
        
    /**
     * テキスト表示用のCanvasを初期化
     */
    initScopeCanvas(canvas, ctx) {
        this.scopeCanvas = canvas;
        this.scopeCtx = ctx;
    }
    
    /**
     * テキストを描画（Canvas 2D）
     * Processing版と同じ形式で圧力の情報を表示
     */
    drawText(camera) {
        // テキストはCircleエフェクトと一緒に表示（Circleが表示されている間だけ）
        if (!this.scopeCtx || !this.scopeCanvas) {
            return;
        }
        
        // Circleエフェクトが表示されている間だけテキストを表示
        if (this.circleAge >= this.CIRCLE_LIFETIME || this.circleAlpha <= 30.0) {
            return;  // Circleが消えたらテキストも消える
        }
        
        // 3D座標を2Dスクリーン座標に変換
        const vector = this.position.clone();
        vector.project(camera);
        
        const x = (vector.x * 0.5 + 0.5) * this.scopeCanvas.width;
        const y = (-vector.y * 0.5 + 0.5) * this.scopeCanvas.height;
        
        // 画面内にある場合のみ表示（zの条件を緩和、カメラの前にある場合）
        if (x >= 0 && x <= this.scopeCanvas.width && y >= 0 && y <= this.scopeCanvas.height && vector.z > -1.0 && vector.z < 1.0) {
            this.scopeCtx.save();
            this.scopeCtx.fillStyle = 'white';
            this.scopeCtx.font = '24px monospace';  // 14px → 24px（大きく）
            this.scopeCtx.textAlign = 'center';
            this.scopeCtx.textBaseline = 'top';
            
            // Processing版と同じ形式：座標と圧力の情報を表示
            const coordText = `(${Math.round(this.center.x)}, ${Math.round(this.center.y)}, ${Math.round(this.center.z)})`;
            const strengthText = `Strength: ${this.strength.toFixed(1)}`;
            const radiusText = `Radius: ${Math.round(this.radius)}`;
            
            // 座標を表示（sphereの位置より少し上に、テキストサイズに合わせて間隔を調整）
            this.scopeCtx.fillText(coordText, x, y - 60);  // -40 → -60
            // 圧力の情報を表示
            this.scopeCtx.fillText(strengthText, x, y - 30);  // -20 → -30
            this.scopeCtx.fillText(radiusText, x, y);
            
            this.scopeCtx.restore();
        }
    }
    
    /**
     * sphereのサイズを計算
     */
    calculateSphereSize() {
        const strengthRatio = this.strength / this.maxStrength;
        // Sphereをもっと大きく（15.0～30.0）
        return THREE.MathUtils.lerp(15.0, 30.0, strengthRatio);
    }
    
    /**
     * 力の強さを取得
     */
    getStrength() {
        return this.strength;
    }
    
    /**
     * 中心位置を取得
     */
    getCenter() {
        return this.center.clone();
    }
    
    /**
     * 位置を取得
     */
    getPosition() {
        return this.position.clone();
    }
    
    /**
     * 半径を取得
     */
    getRadius() {
        return this.radius;
    }
    
    /**
     * 復帰確率を取得
     */
    getReturnProbability() {
        return this.returnProbability;
    }
    
    /**
     * Circleエフェクトがアクティブかどうか
     */
    isCircleActive() {
        return this.circleAge > 0.0 && this.circleAge < this.CIRCLE_LIFETIME;
    }
    
    /**
     * リソースを解放
     */
    dispose(scene, group) {
        if (this.sphereMesh) {
            group.remove(this.sphereMesh);
            this.sphereMesh.geometry.dispose();
            this.sphereMesh.material.dispose();
            this.sphereMesh = null;
        }
        
        if (this.circleMesh) {
            scene.remove(this.circleMesh);
            this.circleMesh.geometry.dispose();
            this.circleMesh.material.dispose();
            this.circleMesh = null;
        }
        
        if (this.circleEdges) {
            scene.remove(this.circleEdges);
            this.circleEdges.geometry.dispose();
            this.circleEdges.material.dispose();
            this.circleEdges = null;
        }
    }
}

