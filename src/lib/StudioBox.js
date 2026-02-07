import * as THREE from 'three';

/**
 * StudioBox: 撮影用スタジオ（白い箱と床）を管理するクラス
 */
export class StudioBox {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.size = options.size || 2000;
        this.color = options.color || 0xffffff;
        this.roughness = options.roughness !== undefined ? options.roughness : 0.4;
        this.metalness = options.metalness !== undefined ? options.metalness : 0.0;
        this.bumpScale = options.bumpScale !== undefined ? options.bumpScale : 0.5; // バンプの強さを追加
        
        this.studioBox = null;
        this.studioFloor = null;
        this.textures = null;

        this.setup();
    }

    setup() {
        // テクスチャ生成
        this.textures = this.generateWallTexture();

        // スタジオ（箱）
        const geometry = new THREE.BoxGeometry(this.size, this.size, this.size);
        const material = new THREE.MeshStandardMaterial({
            color: this.color,
            map: this.textures.map,
            bumpMap: this.textures.bumpMap,
            bumpScale: this.bumpScale, // 指定された強度を適用
            side: THREE.BackSide,
            roughness: this.roughness,
            metalness: this.metalness
        });
        this.studioBox = new THREE.Mesh(geometry, material);
        this.studioBox.position.set(0, 500, 0);
        this.studioBox.receiveShadow = true;
        this.scene.add(this.studioBox);

        // 床
        const floorGeo = new THREE.PlaneGeometry(this.size, this.size);
        const floorMat = new THREE.MeshStandardMaterial({
            color: this.color,
            map: this.textures.map,
            bumpMap: this.textures.bumpMap,
            bumpScale: this.bumpScale * 1.5, // 床はさらに強調
            roughness: this.roughness * 0.75, // 床は少しツヤを出す
            metalness: this.metalness
        });
        this.studioFloor = new THREE.Mesh(floorGeo, floorMat);
        this.studioFloor.rotation.x = -Math.PI / 2;
        this.studioFloor.position.y = -499;
        this.studioFloor.receiveShadow = true;
        this.scene.add(this.studioFloor);
    }

    /**
     * スタジオの壁面・床用のテクスチャを生成（清潔感のある超微細な質感）
     */
    generateWallTexture() {
        const size = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // 1. ベースカラー（清潔感のある明るいグレー）
        ctx.fillStyle = '#d0d0d0';
        ctx.fillRect(0, 0, size, size);

        // 2. 超微細な粒子感（「汚さ」ではなく「素材感」を出す）
        for (let i = 0; i < 10000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const alpha = Math.random() * 0.02; // 極限まで薄く
            ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
            ctx.fillRect(x, y, 1, 1);
        }

        // 3. 非常に広範囲で薄いグラデーション
        for (let i = 0; i < 5; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 200 + Math.random() * 300;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // 4. 隠し味程度の「シミ」と「ひび割れ」（さらに極限まで薄く！）
        // シミ
        for (let i = 0; i < 3; i++) { // 5個から3個に減らす
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 20 + Math.random() * 50; // さらに小さく
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            const alpha = 0.02 + Math.random() * 0.03; // ほぼ見えないレベル（0.05以下）
            grad.addColorStop(0, `rgba(0, 0, 0, ${alpha})`); 
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        // ひび割れ
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)'; // さらに薄く（0.15から0.05に）
        ctx.lineWidth = 0.4; // さらに細く（0.7から0.4に）
        for (let i = 0; i < 2; i++) { // 3本から2本に減らす
            let x = Math.random() * size;
            let y = Math.random() * size;
            ctx.beginPath();
            ctx.moveTo(x, y);
            for (let j = 0; j < 3; j++) { // よりシンプルに
                x += (Math.random() - 0.5) * 30;
                y += (Math.random() - 0.5) * 30;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        const map = new THREE.CanvasTexture(canvas);
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(2, 2); // 繰り返しを減らして、大らかな質感に

        // --- バンプマップ用（手触りを感じる程度の超微細な凹凸） ---
        const bCanvas = document.createElement('canvas');
        bCanvas.width = size;
        bCanvas.height = size;
        const bCtx = bCanvas.getContext('2d');
        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);

        // 砂壁のような微細なノイズ
        for (let i = 0; i < 20000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const val = Math.random() > 0.5 ? 255 : 0;
            bCtx.fillStyle = `rgba(${val}, ${val}, ${val}, 0.015)`; // 極限まで薄く
            bCtx.fillRect(x, y, 1, 1);
        }

        // シミや割れの場所も凹ませる（超控えめに）
        bCtx.strokeStyle = 'rgba(0, 0, 0, 0.03)';
        bCtx.lineWidth = 0.5;
        for (let i = 0; i < 2; i++) {
            let x = Math.random() * size;
            let y = Math.random() * size;
            bCtx.beginPath();
            bCtx.moveTo(x, y);
            for (let j = 0; j < 3; j++) {
                x += (Math.random() - 0.5) * 30;
                y += (Math.random() - 0.5) * 30;
                bCtx.lineTo(x, y);
            }
            ctx.stroke();
        }

        const bumpMap = new THREE.CanvasTexture(bCanvas);
        bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
        bumpMap.repeat.set(2, 2);

        return { map, bumpMap };
    }

    dispose() {
        if (this.studioBox) {
            this.scene.remove(this.studioBox);
            this.studioBox.geometry.dispose();
            this.studioBox.material.dispose();
        }
        if (this.studioFloor) {
            this.scene.remove(this.studioFloor);
            this.studioFloor.geometry.dispose();
            this.studioFloor.material.dispose();
        }
        if (this.textures) {
            this.textures.map.dispose();
            this.textures.bumpMap.dispose();
        }
    }
}
