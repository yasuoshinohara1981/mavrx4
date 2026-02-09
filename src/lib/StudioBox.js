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
        this.useFloorTile = options.useFloorTile !== undefined ? options.useFloorTile : true; // デフォルトでタイル床を有効化
        this.useLights = options.useLights !== undefined ? options.useLights : true; // デフォルトで蛍光灯を有効化
        
        this.studioBox = null;
        this.studioFloor = null;
        this.textures = null;
        this.floorTextures = null; // 床専用テクスチャ
        this.fluorescentLights = []; // 蛍光灯メッシュ
        this.pointLights = []; // 蛍光灯用ポイントライト

        this.setup();
    }

    setup() {
        // テクスチャ生成（壁用：タイル、赤い十字なし）
        this.textures = this.generateTileTexture(true);

        // スタジオ（箱）
        // 天井だけタイルにならないように、マテリアルを配列で定義する
        // BoxGeometryの面順: 0:右, 1:左, 2:上(天井), 3:下(床), 4:前, 5:後
        const wallMat = new THREE.MeshStandardMaterial({
            color: this.color,
            map: this.textures.map,
            bumpMap: this.textures.bumpMap,
            bumpScale: this.bumpScale * 2.0, // 壁の目地を強調
            side: THREE.BackSide,
            roughness: this.roughness * 0.5, // 壁も少し反射させる
            metalness: this.metalness + 0.1  // わずかに金属感
        });

        const ceilingMat = new THREE.MeshStandardMaterial({
            color: this.color,
            side: THREE.BackSide,
            roughness: this.roughness,
            metalness: this.metalness
        });

        const materials = [
            wallMat, // 0: 右
            wallMat, // 1: 左
            ceilingMat, // 2: 上 (天井)
            wallMat, // 3: 下 (床)
            wallMat, // 4: 前
            wallMat  // 5: 後
        ];
        
        const geometry = new THREE.BoxGeometry(this.size, this.size, this.size);
        this.studioBox = new THREE.Mesh(geometry, materials);
        this.studioBox.position.set(0, 500, 0);
        this.studioBox.receiveShadow = true;
        this.scene.add(this.studioBox);

        // 床（床用：タイル、赤い十字あり）
        const floorGeo = new THREE.PlaneGeometry(this.size, this.size);
        
        this.floorTextures = this.generateTileTexture(false);

        const floorMat = new THREE.MeshStandardMaterial({
            color: this.color,
            map: this.floorTextures.map,
            bumpMap: this.floorTextures.bumpMap,
            bumpScale: this.bumpScale * 3.0, // 床はさらに強調
            roughness: this.roughness * 0.3, // 床はツヤツヤにする
            metalness: this.metalness + 0.2  // 反射を強める
        });
        this.studioFloor = new THREE.Mesh(floorGeo, floorMat);
        this.studioFloor.rotation.x = -Math.PI / 2;
        this.studioFloor.position.y = -499;
        this.studioFloor.receiveShadow = true;
        this.scene.add(this.studioFloor);

        // 蛍光灯の作成
        if (this.useLights) {
            this.createFluorescentLights();
        }
    }

    /**
     * 巨大な蛍光灯を作成（デフォルト：四隅に4本）
     */
    createFluorescentLights() {
        const lightHeight = this.size; 
        const lightRadius = 20; 
        const cornerDist = (this.size / 2) - 100; 
        
        const geometry = new THREE.CylinderGeometry(lightRadius, lightRadius, lightHeight, 8);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0xffffff, 
            emissive: 0xffffff, 
            emissiveIntensity: 10.0, 
            envMapIntensity: 1.0 
        });

        const positions = [
            [cornerDist, 500, cornerDist], 
            [-cornerDist, 500, cornerDist], 
            [cornerDist, 500, -cornerDist], 
            [-cornerDist, 500, -cornerDist]
        ];

        positions.forEach(pos => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(pos[0], pos[1], pos[2]);
            this.scene.add(mesh);
            this.fluorescentLights.push(mesh);
        });
    }

    /**
     * タイル用のテクスチャを生成
     */
    generateTileTexture(isWall = false) {
        const size = 2048; 
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // 1. ベースカラー（目地の色）
        ctx.fillStyle = '#b0b0b0';
        ctx.fillRect(0, 0, size, size);

        // 2. タイルの本体を描画（目地を残して全面に出す）
        const divisions = 100;
        const step = size / divisions;
        const gutter = 1; // 目地の幅（ピクセル）をさらに細く（2 -> 1）
        
        ctx.fillStyle = '#d0d0d0'; // タイル表面の色
        
        for (let i = 0; i < divisions; i++) {
            for (let j = 0; j < divisions; j++) {
                ctx.fillRect(
                    i * step + gutter, 
                    j * step + gutter, 
                    step - gutter * 2, 
                    step - gutter * 2
                );
            }
        }

        // 3. 赤い十字と目盛りテキスト（床のみ）
        if (!isWall) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const labelMax = 256;
            const divisions = 100;
            const step = size / divisions;
            
            ctx.font = '500 8px "Inter", "Roboto", sans-serif';

            // 目地の数（100）に合わせてループを回す
            // 4目盛りごとに十字とラベルを表示（100 / 4 = 25箇所）
            for (let i = 0; i <= divisions; i += 4) {
                const tx = i * step;
                const tyCenter = 50 * step; // 中心（0座標）
                const labelVal = Math.abs((i - 50) * (labelMax / 50));

                // 赤い十字
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
                ctx.lineWidth = 0.5;
                const cs = 3;
                
                // X軸上の十字
                ctx.beginPath();
                ctx.moveTo(tx - cs, tyCenter); ctx.lineTo(tx + cs, tyCenter);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(tx, tyCenter - cs); ctx.lineTo(tx, tyCenter + cs);
                ctx.stroke();

                // X軸上のテキスト
                ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
                ctx.fillText(Math.round(labelVal), tx, tyCenter + 10);

                // Z軸上のラベルと十字
                const tz = i * step;
                const txCenter = 50 * step;
                
                if (i !== 50) { // 中心（0,0）は既に描画済みなのでスキップ
                    ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
                    ctx.beginPath();
                    ctx.moveTo(txCenter - cs, tz); ctx.lineTo(txCenter + cs, tz);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(txCenter, tz - cs); ctx.lineTo(txCenter, tz + cs);
                    ctx.stroke();
                    ctx.fillText(Math.round(labelVal), txCenter + 12, tz);
                }
            }
        }

        const map = new THREE.CanvasTexture(canvas);
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(1, 1);

        // バンプマップ（タイルを浮かび上がらせる）
        const bCanvas = document.createElement('canvas');
        bCanvas.width = size;
        bCanvas.height = size;
        const bCtx = bCanvas.getContext('2d');
        
        // 目地を深く（黒）、タイルを高く（白）
        bCtx.fillStyle = '#404040'; // 目地の高さ
        bCtx.fillRect(0, 0, size, size);

        bCtx.fillStyle = '#ffffff'; // タイル表面の高さ
        for (let i = 0; i < divisions; i++) {
            for (let j = 0; j < divisions; j++) {
                bCtx.fillRect(
                    i * step + gutter, 
                    j * step + gutter, 
                    step - gutter * 2, 
                    step - gutter * 2
                );
            }
        }

        const bumpMap = new THREE.CanvasTexture(bCanvas);
        bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
        bumpMap.repeat.set(1, 1);

        return { map, bumpMap };
    }

    dispose() {
        if (this.studioBox) {
            this.scene.remove(this.studioBox);
            this.studioBox.geometry.dispose();
            if (Array.isArray(this.studioBox.material)) {
                this.studioBox.material.forEach(m => m.dispose());
            } else {
                this.studioBox.material.dispose();
            }
        }
        if (this.studioFloor) {
            this.scene.remove(this.studioFloor);
            this.studioFloor.geometry.dispose();
            this.studioFloor.material.dispose();
        }
        if (this.textures) {
            if (this.textures.map) this.textures.map.dispose();
            if (this.textures.bumpMap) this.textures.bumpMap.dispose();
        }
        if (this.floorTextures) {
            if (this.floorTextures.map) this.floorTextures.map.dispose();
            if (this.floorTextures.bumpMap) this.floorTextures.bumpMap.dispose();
        }
        // 蛍光灯のクリーンアップ
        this.fluorescentLights.forEach(light => {
            this.scene.remove(light);
            if (light.geometry) light.geometry.dispose();
            if (light.material) light.material.dispose();
        });
        this.pointLights.forEach(light => {
            this.scene.remove(light);
        });
        this.fluorescentLights = [];
        this.pointLights = [];
    }
}
