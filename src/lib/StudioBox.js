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
            bumpScale: 0.5,
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
            bumpScale: 0.8,
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
     * スタジオの壁面・床用の微細なテクスチャを生成
     */
    generateWallTexture() {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // ベース
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        // 微細なノイズ（漆喰や塗装の質感を出す）
        for (let i = 0; i < 5000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const alpha = Math.random() * 0.05;
            ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
            ctx.fillRect(x, y, 1, 1);
        }

        // わずかな色ムラ
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 50 + Math.random() * 150;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(200, 200, 200, 0.05)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        const map = new THREE.CanvasTexture(canvas);
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(4, 4);

        // バンプ用（コントラスト強め）
        const bCanvas = document.createElement('canvas');
        bCanvas.width = size;
        bCanvas.height = size;
        const bCtx = bCanvas.getContext('2d');
        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);
        for (let i = 0; i < 10000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const val = Math.random() > 0.5 ? 255 : 0;
            bCtx.fillStyle = `rgba(${val}, ${val}, ${val}, 0.05)`;
            bCtx.fillRect(x, y, 1, 1);
        }
        const bumpMap = new THREE.CanvasTexture(bCanvas);
        bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
        bumpMap.repeat.set(4, 4);

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
