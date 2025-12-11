/**
 * Scene09_AttractorSphere: アトラクターとして機能する赤いsphere
 * Scene04_PunchSphereを参考に作成
 */

import * as THREE from 'three';

export class Scene09_AttractorSphere {
    constructor(center, strength, radius) {
        this.center = center.clone();
        this.position = center.clone();
        this.strength = strength;
        this.maxStrength = strength;
        this.radius = radius;
        this.age = 0.0;
        
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
     */
    update() {
        this.age += 1.0;
        
        // Circleエフェクトの更新
        this.updateCircle();
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
     * @param {THREE.Scene} scene - メインシーン
     * @param {THREE.Group} group - グループ（sphere用）
     */
    createThreeObjects(scene, group) {
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
        
        // Circleエフェクトを作成（黄色）
        this.createCircleEffect(scene);
    }
    
    /**
     * Circleエフェクトを作成
     */
    createCircleEffect(scene) {
        // 水平方向のCircle
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
        this.circleMesh.rotation.x = Math.PI / 2;  // 地面と平行（X-Z平面、X軸周りに90度回転）
        this.circleMesh.visible = false;
        this.circleMesh.userData.isAttractorSphereCircle = true;  // 識別用フラグ
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
        this.circleEdges.rotation.x = Math.PI / 2;  // 地面と平行（X-Z平面、X軸周りに90度回転）
        this.circleEdges.visible = false;
        this.circleEdges.userData.isAttractorSphereCircle = true;  // 識別用フラグ
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
        
        // Circleエフェクトの更新
        if (this.circleMesh && this.circleEdges) {
            if (this.circleRadius > 0.0 && this.circleAlpha > 30.0) {
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
     */
    drawText(camera) {
        if (!this.scopeCtx || !this.scopeCanvas) {
            return;
        }
        
        // Circleエフェクトが表示されている間だけテキストを表示
        if (this.circleAge >= this.CIRCLE_LIFETIME || this.circleAlpha <= 30.0) {
            return;
        }
        
        // 3D座標を2Dスクリーン座標に変換
        const vector = this.position.clone();
        vector.project(camera);
        
        const x = (vector.x * 0.5 + 0.5) * this.scopeCanvas.width;
        const y = (-vector.y * 0.5 + 0.5) * this.scopeCanvas.height;
        
        // 画面内にある場合のみ表示
        if (x >= 0 && x <= this.scopeCanvas.width && y >= 0 && y <= this.scopeCanvas.height && vector.z > -1.0 && vector.z < 1.0) {
            this.scopeCtx.save();
            this.scopeCtx.fillStyle = 'white';
            this.scopeCtx.font = '8px monospace';  // さらに小さく（8px）
            this.scopeCtx.textAlign = 'center';
            this.scopeCtx.textBaseline = 'top';
            
            // 座標とアトラクターの情報を表示
            const coordText = `(${Math.round(this.center.x)}, ${Math.round(this.center.y)}, ${Math.round(this.center.z)})`;
            const strengthText = `Strength: ${this.strength.toFixed(1)}`;
            const radiusText = `Radius: ${Math.round(this.radius)}`;
            
            this.scopeCtx.fillText(coordText, x, y - 20);  // さらに小さく
            this.scopeCtx.fillText(strengthText, x, y - 10);  // さらに小さく
            this.scopeCtx.fillText(radiusText, x, y);
            
            this.scopeCtx.restore();
        }
    }
    
    /**
     * sphereのサイズを計算
     */
    calculateSphereSize() {
        const strengthRatio = this.strength / this.maxStrength;
        return THREE.MathUtils.lerp(0.5, 1.0, strengthRatio);  // さらに小さく（0.5～1.0）
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
     * 強度を取得
     */
    getStrength() {
        return this.strength;
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

