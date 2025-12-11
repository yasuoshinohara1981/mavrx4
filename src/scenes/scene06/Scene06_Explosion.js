/**
 * Scene06_Explosion: 爆発エフェクト
 * 半球体の爆発とCircleエフェクトを管理
 */

import * as THREE from 'three';

export class Scene06_Explosion {
    constructor(center, radiusMax, lifetime) {
        this.center = center.clone();
        this.radiusMax = radiusMax;
        this.lifetime = lifetime;
        this.radius = 0.0;
        this.age = 0.0;
        this.active = true;
        this.intensity = 1.0;
        this.circleAge = 0.0;
        this.calloutRight = Math.random() > 0.5;
        
        this.CIRCLE_LIFETIME = 120.0;
        this.CIRCLE_MAX_RADIUS = 2000.0;
        
        // Three.js用のオブジェクト
        this.explosionMesh = null;
        this.circleHorizontalMesh = null; // 水平方向のCircle（X-Z平面、地面と平行）
        this.circleHorizontalEdges = null; // Circleの外周の線（赤）
    }
    
    /**
     * 更新
     */
    update() {
        if (this.active) {
            this.age += 1.0;
        } else {
            if (this.age < this.lifetime) {
                this.age += 1.0;
            }
        }
        
        // 爆発の進行度（0.0〜1.0以上、lifetimeを超えても更新）
        const progress = this.age / this.lifetime;
        
        // 爆発の半径を更新（時間経過で拡大、最初は0から）
        // 最初の50%で急激に拡大、残り50%でゆっくり拡大
        let radiusProgress;
        if (progress < 0.5) {
            // 最初の50%で急激に拡大
            radiusProgress = progress / 0.5;
        } else {
            // 残り50%でゆっくり拡大（最終的に1.0に）
            const slowProgress = (progress - 0.5) / 0.5;
            radiusProgress = 1.0 + slowProgress * 0.2; // 少し大きくなる
        }
        this.radius = this.radiusMax * radiusProgress;
        
        if (this.radius >= this.radiusMax && this.active) {
            this.radius = this.radiusMax;
            this.active = false;
        }
        
        this.intensity = 1.0 - (this.radius / this.radiusMax);
        this.intensity = Math.max(0.0, Math.min(1.0, this.intensity));
        
        // Circleエフェクトの更新
        if (this.circleAge < this.CIRCLE_LIFETIME) {
            this.circleAge += 1.0;
        }
    }
    
    /**
     * Three.jsオブジェクトを作成
     */
    createThreeObjects(scene) {
        // 爆発の球体（完全な球体）
        // 地面より下を描画しないのは、マテリアルのdepthWriteやclippingPlaneで対応
        // または、爆発の中心位置を地面より上に配置することで対応
        const segments = 64;
        const geometry = new THREE.SphereGeometry(1, segments, segments);
        
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,  // 白
            transparent: true,
            opacity: 0.8,  // 初期透明度を上げる
            side: THREE.DoubleSide,
            emissive: 0xffffff,  // 白のエミッシブ
            emissiveIntensity: 0.5,
            roughness: 0.0,
            metalness: 0.0,
            clippingPlanes: [
                // 地面（Y=0）より下をクリップ
                new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
            ],
            clipShadows: false
        });
        
        this.explosionMesh = new THREE.Mesh(geometry, material);
        // 爆発の中心位置を設定
        // Processing版ではY=0が地面、Three.jsでもY=0が地面
        // 初期位置はupdateThreeObjects()で設定される
        scene.add(this.explosionMesh);
        
        // Circleエフェクトを作成（地面と平行なCircleのみ）
        // 水平方向のCircle（X-Z平面、地面と平行）
        const circleHorizontalGeometry = new THREE.RingGeometry(0.1, 1, 64);
        const circleHorizontalMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00, // 黄色
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });
        this.circleHorizontalMesh = new THREE.Mesh(circleHorizontalGeometry, circleHorizontalMaterial);
        this.circleHorizontalMesh.rotation.x = -Math.PI / 2; // X-Z平面に配置（地面と平行）
        scene.add(this.circleHorizontalMesh);
        
        // Circleの外周の線（赤）
        const circleHorizontalEdgesGeometry = new THREE.EdgesGeometry(circleHorizontalGeometry);
        const circleHorizontalEdgesMaterial = new THREE.LineBasicMaterial({
            color: 0xff0000, // 赤
            transparent: true,
            opacity: 0.8
        });
        this.circleHorizontalEdges = new THREE.LineSegments(circleHorizontalEdgesGeometry, circleHorizontalEdgesMaterial);
        this.circleHorizontalEdges.rotation.x = -Math.PI / 2; // X-Z平面に配置（地面と平行）
        scene.add(this.circleHorizontalEdges);
    }
    
    /**
     * Three.jsオブジェクトを更新
     */
    updateThreeObjects() {
        if (this.explosionMesh) {
            // Processing版ではY軸が下方向が正、Three.jsではY軸が上方向が正
            // Processing版では、explosionCenterがそのまま使われている
            // Processing版のexplosionCenter.yは地面からの高さ（Y軸下方向が正なので、地面より上は負の値）
            // Three.jsでは、Y軸上方向が正なので、地面より上は正の値
            // したがって、Processing版のexplosionCenter.yをそのまま使えばいい
            // ただし、半球の底が地面に接するように、中心位置のY座標を半径分上に配置する必要がある
            // Processing版では、半球の底は中心から半径分下（Y軸正方向）にある
            // Three.jsでは、半球の底は中心から半径分下（Y軸負方向）にある
            // したがって、Three.jsでは、meshY = this.center.y + this.radius が正しい
            // （半球の底が地面に接するように、中心位置を半径分上に配置）
            
            // 爆発の中心位置をそのまま使用（ClippingPlaneで地面より下をクリップ）
            this.explosionMesh.position.set(this.center.x, this.center.y, this.center.z);
            
            this.explosionMesh.scale.set(this.radius, this.radius, this.radius);
            
            // 透明度を計算（最初は透明、中間で不透明、最後はふわっと透明に、余韻を長く）
            const progress = this.age / this.lifetime;
            let opacity;
            if (progress < 0.2) {
                // 最初の20%で透明から不透明に（0.0 → 0.8）
                opacity = (progress / 0.2) * 0.8;
            } else if (progress < 0.4) {
                // 中間は不透明を維持（0.8）
                opacity = 0.8;
            } else {
                // 最後の60%でふわっと透明に（0.8 → 0.0、ease-outカーブ、余韻を長く）
                const fadeProgress = (progress - 0.4) / 0.6;
                const easedFade = 1.0 - Math.pow(1.0 - fadeProgress, 2.0); // 2乗カーブでより緩やかに
                opacity = 0.8 * (1.0 - easedFade);
            }
            this.explosionMesh.material.opacity = opacity;
            this.explosionMesh.visible = opacity > 0.0; // 完全に透明になるまで表示
        }
        
        // Circleエフェクトの更新（地面と平行なCircleのみ）
        // 爆発sphereの進捗に基づいて計算（Circleエフェクトを先に完全に透明にする）
        if (this.circleHorizontalMesh && this.circleHorizontalEdges) {
            const progress = this.age / this.lifetime; // 爆発sphereと同じ進捗を使用
            
            // Circleの半径と透明度を計算（爆発sphereよりかなり早めに完全に透明にする）
            // 進捗を0.7倍にして、爆発sphereより30%早く完全に透明になるようにする
            const circleProgress = Math.min(progress / 0.7, 1.0);
            const circleRadius = this.CIRCLE_MAX_RADIUS * circleProgress; // 時間とともに大きくなる
            
            // 透明度を緩やかにフェードアウト（爆発sphereより先に完全に透明になる）
            let circleAlpha;
            if (circleProgress < 0.2) {
                // 最初の20%は不透明を維持
                circleAlpha = 1.0;
            } else if (circleProgress < 1.0) {
                // 残りの80%で緩やかにフェードアウト
                const fadeProgress = (circleProgress - 0.2) / 0.8;
                const easedFade = 1.0 - Math.pow(1.0 - fadeProgress, 2.0); // 2乗カーブでより緩やかに
                circleAlpha = 1.0 - easedFade;
            } else {
                // 完全に透明
                circleAlpha = 0.0;
            }
            
            // 完全に透明になるまで表示
            if (circleAlpha > 0.0) {
                // 爆発の中心位置から、地面より100上に配置
                const circleY = this.center.y + 100.0;
                
                // 水平方向のCircle（X-Z平面、地面と平行）
                this.circleHorizontalMesh.position.set(this.center.x, circleY, this.center.z);
                this.circleHorizontalMesh.scale.set(circleRadius, circleRadius, 1);
                this.circleHorizontalMesh.material.opacity = circleAlpha * 0.2; // 20%の透明度
                this.circleHorizontalMesh.visible = true;
                
                // Circleの外周の線（赤）
                this.circleHorizontalEdges.position.set(this.center.x, circleY, this.center.z);
                this.circleHorizontalEdges.scale.set(circleRadius, circleRadius, 1);
                this.circleHorizontalEdges.material.opacity = circleAlpha * 0.8; // 80%の透明度
                this.circleHorizontalEdges.visible = true;
            } else {
                // 完全に透明になったら非表示
                this.circleHorizontalMesh.visible = false;
                this.circleHorizontalEdges.visible = false;
            }
        }
    }
    
    /**
     * アクティブかどうか
     */
    isActive() {
        return this.active;
    }
    
    /**
     * 終了したかどうか
     */
    isFinished() {
        return this.age >= this.lifetime;
    }
    
    /**
     * 中心位置を取得
     */
    getCenter() {
        return this.center.clone();
    }
    
    /**
     * 半径を取得
     */
    getRadius() {
        return this.radius;
    }
    
    /**
     * 最大半径を取得
     */
    getRadiusMax() {
        return this.radiusMax;
    }
    
    /**
     * 強度を取得
     */
    getIntensity() {
        return this.intensity;
    }
    
    /**
     * 年齢を取得
     */
    getAge() {
        return this.age;
    }
    
    /**
     * 寿命を取得
     */
    getLifetime() {
        return this.lifetime;
    }
    
    /**
     * コールアウトの方向を取得
     */
    getCalloutRight() {
        return this.calloutRight;
    }
    
    /**
     * リソースを解放
     */
    dispose(scene) {
        if (this.explosionMesh) {
            scene.remove(this.explosionMesh);
            this.explosionMesh.geometry.dispose();
            this.explosionMesh.material.dispose();
            this.explosionMesh = null;
        }
        
        if (this.circleHorizontalMesh) {
            scene.remove(this.circleHorizontalMesh);
            this.circleHorizontalMesh.geometry.dispose();
            this.circleHorizontalMesh.material.dispose();
            this.circleHorizontalMesh = null;
        }
        
        if (this.circleHorizontalEdges) {
            scene.remove(this.circleHorizontalEdges);
            this.circleHorizontalEdges.geometry.dispose();
            this.circleHorizontalEdges.material.dispose();
            this.circleHorizontalEdges = null;
        }
    }
}

