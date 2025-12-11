/**
 * BackgroundGradient: 背景グラデーション管理クラス
 * 将来的に放射状、水平など選択できるように拡張可能
 */

import * as THREE from 'three';

export class BackgroundGradient {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.mesh = null;
        this.intensity = 0.0;
        this.endTime = 0;
        this.gradientType = 'vertical';  // 'vertical', 'radial', 'horizontal' など将来拡張用
        
        // 初期化
        this.init();
    }
    
    /**
     * 初期化
     */
    async init() {
        // シェーダーを読み込む
        const shaderBasePath = `/shaders/scene03/`;
        try {
            const [vertexShader, fragmentShader] = await Promise.all([
                fetch(`${shaderBasePath}backgroundGradient.vert`).then(r => r.text()),
                fetch(`${shaderBasePath}backgroundGradient.frag`).then(r => r.text())
            ]);
            
            // 大きなSphereGeometryで背景を作成（カメラより後ろに配置）
            const geometry = new THREE.SphereGeometry(5000, 32, 16);
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    topColor: { value: new THREE.Vector3(0.03, 0.01, 0.01) },  // 夜明け前の暗い赤（上部）
                    bottomColor: { value: new THREE.Vector3(0.0, 0.0, 0.0) },  // 黒（下部）
                    intensity: { value: 0.0 },  // 初期は無効
                    gradientType: { value: 0.0 }  // 0.0 = vertical, 1.0 = radial, 2.0 = horizontal（将来拡張用）
                },
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                side: THREE.BackSide,  // 内側から見る
                depthWrite: false  // 深度書き込みを無効化（背景なので）
            });
            
            this.mesh = new THREE.Mesh(geometry, material);
            this.mesh.position.set(0, 0, 0);
            this.scene.add(this.mesh);
        } catch (err) {
            console.error('背景グラデーションシェーダーの読み込みに失敗:', err);
        }
    }
    
    /**
     * グラデーションを適用（ノート、ベロシティ、デュレーション付き）
     */
    apply(velocity, noteNumber, durationMs) {
        if (!this.mesh || !this.mesh.material) {
            console.warn('背景グラデーションが初期化されていません');
            return;
        }
        
        // ノート（0〜127）から色相を計算（赤〜暗い赤の範囲）
        // ノートが高いほど少し明るい赤、低いほど暗い赤
        const hue = THREE.MathUtils.mapLinear(noteNumber, 0, 127, 0.0, 0.05);  // 0.0（赤）〜0.05（少しオレンジ寄りの赤）
        const saturation = THREE.MathUtils.mapLinear(velocity, 0, 127, 0.5, 0.8);  // ベロシティで彩度を制御
        const brightness = THREE.MathUtils.mapLinear(velocity, 0, 127, 0.03, 0.08);  // ベロシティで明度を制御（夜明け前の暗さ）
        
        // HSLからRGBに変換（上部の色：抑えたオレンジ）
        const topColor = new THREE.Color();
        topColor.setHSL(hue, saturation, brightness);
        
        // 下部の色は黒（固定）
        const bottomColor = new THREE.Vector3(0.0, 0.0, 0.0);
        
        // ベロシティ（0〜127）をグラデーションの強度（0.0〜1.0）に変換
        const intensity = THREE.MathUtils.mapLinear(velocity, 0, 127, 0.0, 1.0);
        this.intensity = intensity;
        
        // シェーダーのuniformを更新
        if (this.mesh.material.uniforms) {
            this.mesh.material.uniforms.topColor.value.set(
                topColor.r,
                topColor.g,
                topColor.b
            );
            this.mesh.material.uniforms.bottomColor.value = bottomColor;
            this.mesh.material.uniforms.intensity.value = intensity;
        }
        
        // デュレーション（サスティン）を設定
        if (durationMs > 0) {
            this.endTime = Date.now() + durationMs;
        } else {
            // デュレーションが0の場合は無期限（キーが離されるまで）
            this.endTime = 0;
        }
        
        console.log(`Background gradient applied (velocity: ${velocity}, note: ${noteNumber}, intensity: ${intensity.toFixed(2)}, duration: ${durationMs}ms)`);
    }
    
    /**
     * 更新（サスティン終了チェック）
     */
    update() {
        if (this.mesh && this.intensity > 0.0) {
            const currentTime = Date.now();
            if (this.endTime > 0 && currentTime >= this.endTime) {
                // サスティン終了
                this.intensity = 0.0;
                this.endTime = 0;
                
                // シェーダーのuniformを更新
                if (this.mesh.material && this.mesh.material.uniforms) {
                    this.mesh.material.uniforms.intensity.value = 0.0;
                }
            }
        }
    }
    
    /**
     * グラデーションタイプを設定（将来拡張用）
     * @param {string} type - 'vertical', 'radial', 'horizontal' など
     */
    setGradientType(type) {
        this.gradientType = type;
        // 将来的にシェーダーのuniformを更新してタイプを切り替え
        // if (this.mesh && this.mesh.material && this.mesh.material.uniforms) {
        //     const typeValue = type === 'vertical' ? 0.0 : type === 'radial' ? 1.0 : 2.0;
        //     this.mesh.material.uniforms.gradientType.value = typeValue;
        // }
    }
    
    /**
     * 破棄
     */
    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            if (this.mesh.geometry) {
                this.mesh.geometry.dispose();
            }
            if (this.mesh.material) {
                this.mesh.material.dispose();
            }
            this.mesh = null;
        }
    }
}

