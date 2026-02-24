import * as THREE from 'three';

/**
 * StudioBox: 撮影用スタジオ（白い箱と床）を管理するクラス
 */
export class StudioBox {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.size = options.size || 10000; // 2000 -> 10000
        this.color = options.color || 0xffffff;
        this.roughness = options.roughness !== undefined ? options.roughness : 0.8; // 0.4 -> 0.8
        this.metalness = options.metalness !== undefined ? options.metalness : 0.0;
        this.lightColor = options.lightColor || 0xffffff; // 蛍光灯の色
        this.lightIntensity = options.lightIntensity !== undefined ? options.lightIntensity : 10.0; // デフォルト10.0
        this.bumpScale = options.bumpScale !== undefined ? options.bumpScale : 5.0; // 0.5 -> 5.0
        this.useFloorTile = options.useFloorTile !== undefined ? options.useFloorTile : true;
        this.useLights = options.useLights !== undefined ? options.useLights : true;
        
        // 追加パラメータ（既存の挙動を壊さないようにデフォルト値を設定）
        this.envMap = options.envMap || null;
        this.envMapIntensity = options.envMapIntensity !== undefined ? options.envMapIntensity : 1.0;
        
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
            bumpScale: 1.0, // 壁も凹凸を抑えて細い線を活かす
            side: THREE.BackSide,
            roughness: this.roughness * 0.5, 
            metalness: this.metalness + 0.1,
            envMap: this.envMap,
            envMapIntensity: this.envMapIntensity
        });

        const ceilingMat = new THREE.MeshStandardMaterial({
            color: this.lightColor, // 天井自体をライトの色にする
            side: THREE.BackSide,
            roughness: this.roughness,
            metalness: this.metalness,
            emissive: this.lightColor, // 天井を発光させる！
            emissiveIntensity: this.lightIntensity * 0.5, // 少し抑えめに発光
            envMap: this.envMap,
            envMapIntensity: this.envMapIntensity
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

        const floorGeo = new THREE.PlaneGeometry(this.size, this.size);
        this.floorTextures = this.generateTileTexture(false);

        if (this.useFloorTile) {
            const floorMat = new THREE.MeshStandardMaterial({
                color: this.color,
                map: this.floorTextures.map,
                bumpMap: this.floorTextures.bumpMap,
                bumpScale: 1.0, 
                roughness: this.roughness * 0.3, 
                metalness: this.metalness + 0.2,
                envMap: this.envMap,
                envMapIntensity: this.envMapIntensity * 1.3 
            });
            this.studioFloor = new THREE.Mesh(floorGeo, floorMat);
            this.studioFloor.rotation.x = -Math.PI / 2;
            this.studioFloor.position.y = -498; 
            this.studioFloor.receiveShadow = true;
            this.scene.add(this.studioFloor);
        }

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
        const lightRadius = 50; // 10 -> 50 太くする
        const cornerDist = (this.size / 2) - 100; // 壁際
        
        const geometry = new THREE.CylinderGeometry(lightRadius, lightRadius, lightHeight, 8);
        const material = new THREE.MeshStandardMaterial({ 
            color: this.lightColor, 
            emissive: this.lightColor, 
            emissiveIntensity: this.lightIntensity, 
            envMapIntensity: 1.0 
        });

        const positions = [
            [cornerDist, 0, cornerDist], 
            [-cornerDist, 0, cornerDist], 
            [cornerDist, 0, -cornerDist], 
            [-cornerDist, 0, -cornerDist]
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
        ctx.fillStyle = '#c8c8c8'; // #b0b0b0 -> #c8c8c8 (明るくして目立たなくする)
        ctx.fillRect(0, 0, size, size);

        // 2. タイルの本体を描画
        const divisions = 50; 
        const step = size / divisions;
        
        ctx.fillStyle = '#d0d0d0'; 
        ctx.fillRect(0, 0, size, size);

        // --- 経年劣化風のノイズをベースカラーに追加（控えめに！） ---
        for (let i = 0; i < 2000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const s = Math.random() * 1.5 + 0.5;
            const alpha = Math.random() * 0.02; // 0.05 -> 0.02
            ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
            ctx.fillRect(x, y, s, s);
        }

        // 目地の線を細く描画
        ctx.strokeStyle = '#808080'; // #c0c0c0 -> #808080 (もう少し黒く)
        ctx.lineWidth = 0.5; 
        ctx.beginPath();
        for (let i = 0; i <= divisions; i++) {
            ctx.moveTo(i * step, 0);
            ctx.lineTo(i * step, size);
            ctx.moveTo(0, i * step);
            ctx.lineTo(size, i * step);
        }
        ctx.stroke();

        // 3. 赤い十字と目盛りテキスト（床のみ）
        if (!isWall) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const labelMax = 256;
            const centerIdx = divisions / 2;
            
            ctx.font = '500 8px "Inter", "Roboto", sans-serif'; // bold 12px -> 500 8px

            // 目地の数に合わせてループを回す
            // 2目盛りごとに十字とラベルを表示（50 / 2 = 25箇所）
            // これで空間的な間隔（400ユニットごと）を維持する
            for (let i = 0; i <= divisions; i += 2) {
                const tx = i * step;
                const tyCenter = centerIdx * step; // 中心（0座標）
                const labelVal = Math.abs((i - centerIdx) * (labelMax / centerIdx));

                // 赤い十字
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)'; // 0.6 -> 0.9
                ctx.lineWidth = 1.0; // 0.5 -> 1.0
                const cs = 5; // 3 -> 5
                
                // X軸上の十字
                ctx.beginPath();
                ctx.moveTo(tx - cs, tyCenter); ctx.lineTo(tx + cs, tyCenter);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(tx, tyCenter - cs); ctx.lineTo(tx, tyCenter + cs);
                ctx.stroke();

                // X軸上のテキスト
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; // 0.7 -> 0.3 (薄く)
                ctx.fillText(Math.round(labelVal), tx, tyCenter + 12); // +15 -> +12 (少し近づける)

                // Z軸上のラベルと十字
                const tz = i * step;
                const txCenter = centerIdx * step;
                
                if (i !== centerIdx) { // 中心（0,0）は既に描画済みなのでスキップ
                    ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)'; // 0.6 -> 0.9
                    ctx.beginPath();
                    ctx.moveTo(txCenter - cs, tz); ctx.lineTo(txCenter + cs, tz);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(txCenter, tz - cs); ctx.lineTo(txCenter, tz + cs);
                    ctx.stroke();
                    ctx.fillText(Math.round(labelVal), txCenter + 12, tz); // +15 -> +12
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
        
        // タイル表面を高く（白）
        bCtx.fillStyle = '#ffffff'; 
        bCtx.fillRect(0, 0, size, size);

        // --- 経年劣化風の凹凸（ノイズ）をバンプマップに追加（控えめに！） ---
        for (let i = 0; i < 4000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const s = Math.random() * 2 + 0.5;
            const gray = Math.floor(Math.random() * 30 + 210); // 180-230 -> 210-240 (より白に近く＝凹みを浅く)
            bCtx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
            bCtx.fillRect(x, y, s, s);
        }

        // 目地を細い線で描画（黒/グレーで低くする）
        bCtx.strokeStyle = '#404040'; 
        bCtx.lineWidth = 0.5; 
        bCtx.beginPath();
        for (let i = 0; i <= divisions; i++) {
            bCtx.moveTo(i * step, 0);
            bCtx.lineTo(i * step, size);
            bCtx.moveTo(0, i * step);
            bCtx.lineTo(size, i * step);
        }
        bCtx.stroke();

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
