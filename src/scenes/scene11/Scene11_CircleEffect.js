/**
 * Scene11_CircleEffect: トラック6用のCircleエフェクト
 */

import * as THREE from 'three';

export class Scene11_CircleEffect {
    constructor(center, velocity, durationMs) {
        this.center = center.clone();
        this.velocity = velocity;
        this.durationMs = durationMs;
        this.startTime = Date.now();
        this.endTime = this.startTime + durationMs;
        
        // ベロシティに応じて最大半径を決定
        this.maxRadius = THREE.MathUtils.mapLinear(velocity, 0, 127, 50, 800);
        
        this.age = 0;
        this.progress = 0;
        this.isFinished = false;
        
        // Three.jsオブジェクト
        this.innerCircle = null; // 塗りつぶしCircle
        this.outerCircle = null; // 外周のみCircle
    }
    
    createThreeObjects(scene) {
        // 共通のジオメトリ（1x1の円、スケールで大きさを変える）
        const geometry = new THREE.RingGeometry(0, 1, 64);
        
        // 中心の赤塗りCircle（透明度50%）
        const innerMat = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthWrite: true, // 深度書き込みを有効にして建物に隠れるようにする
            depthTest: true
        });
        this.innerCircle = new THREE.Mesh(geometry, innerMat);
        this.innerCircle.rotation.x = -Math.PI / 2; // 地面と平行
        this.innerCircle.position.copy(this.center);
        this.innerCircle.position.y += 0.1; // 地面（Y=0）よりわずかに上に配置
        this.innerCircle.renderOrder = 5; // 地形(0)より大きく、建物(デフォルト0だが不透明)との兼ね合い
        scene.add(this.innerCircle);
        
        // 外周の赤い線Circle（塗りなし、一回り大きい）
        const outerMat = new THREE.LineBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 1.0,
            depthWrite: true, // 深度書き込みを有効
            depthTest: true
        });
        
        // 外周用のジオメトリ（EdgesGeometryで輪郭だけ抽出）
        const edgesGeometry = new THREE.EdgesGeometry(geometry);
        this.outerCircle = new THREE.LineSegments(edgesGeometry, outerMat);
        this.outerCircle.rotation.x = -Math.PI / 2;
        this.outerCircle.position.copy(this.center);
        this.outerCircle.position.y += 0.15; // 内側よりわずかに上に
        this.outerCircle.renderOrder = 6; // 内側より手前
        scene.add(this.outerCircle);
    }
    
    update() {
        const now = Date.now();
        if (now >= this.endTime) {
            this.isFinished = true;
            this.progress = 1.0;
            return;
        }
        
        this.progress = (now - this.startTime) / this.durationMs;
        
        // 0から最大半径まで拡大
        const currentRadius = this.maxRadius * this.progress;
        
        if (this.innerCircle) {
            this.innerCircle.scale.set(currentRadius, currentRadius, 1);
            // 透明度が上がって（＝不透明度が下がって）消えていく
            this.innerCircle.material.opacity = 0.5 * (1.0 - this.progress);
        }
        
        if (this.outerCircle) {
            // 一回り大きく（1.2倍）
            const outerRadius = currentRadius * 1.2;
            this.outerCircle.scale.set(outerRadius, outerRadius, 1);
            this.outerCircle.material.opacity = 1.0 * (1.0 - this.progress);
        }
    }
    
    dispose(scene) {
        if (this.innerCircle) {
            scene.remove(this.innerCircle);
            this.innerCircle.geometry.dispose();
            this.innerCircle.material.dispose();
            this.innerCircle = null;
        }
        if (this.outerCircle) {
            scene.remove(this.outerCircle);
            this.outerCircle.geometry.dispose();
            this.outerCircle.material.dispose();
            this.outerCircle = null;
        }
    }
}
