/**
 * Scene01_Scope: ミサイル発射地点の周りを正方形で囲み、座標を表示
 * 2Dスクリーン座標で描画（ビルボード）
 */

import * as THREE from 'three';

export class Scene01_Scope {
    constructor(position, velocity, renderer, camera) {
        this.position = position.clone();
        this.velocity = velocity;
        this.age = 0.0;
        this.lifetime = 60.0; // 60フレームで消える
        this.renderer = renderer;
        this.camera = camera;
        
        // Canvas2D用の要素
        this.canvas = null;
        this.ctx = null;
        this.container = null;
    }
    
    update() {
        this.age += 1.0;
    }
    
    isDead() {
        return this.age >= this.lifetime;
    }
    
    createThreeObjects(scene) {
        // 共有Canvasを使用するため、個別のCanvasは作成しない
    }
    
    updateThreeObjects(ctx, canvas) {
        if (!ctx || !canvas) return;
        
        // 3D位置を2Dスクリーン座標に変換（Processingと同じ）
        const vector = this.position.clone();
        vector.project(this.camera);
        
        const x = (vector.x * 0.5 + 0.5) * canvas.width;
        const y = (-vector.y * 0.5 + 0.5) * canvas.height;
        
        // 画面外の場合は描画しない
        if (vector.z > 1 || x < 0 || x > canvas.width || y < 0 || y > canvas.height) {
            return;
        }
        
        // 透明度を年齢に応じて変化
        const alpha = 1.0 - (this.age / this.lifetime);
        
        // ベロシティに応じたサイズ（0-127 → 20-50、Processingより大きく）
        const baseScopeSize = THREE.MathUtils.mapLinear(this.velocity, 0, 127, 20.0, 50.0);
        
        // ProcessingのscreenZは実際のカメラからの距離（深度値）を返す
        // Three.jsでは実際の距離を計算して使用
        const worldDistance = this.position.distanceTo(this.camera.position);
        // Processingと同じ：screenZを使った距離計算（constrain(1000.0 / screenZ, 0.5, 2.0)）
        // screenZは実際の距離なので、worldDistanceを使用
        const distanceFactor = Math.max(0.5, Math.min(2.0, 1000.0 / worldDistance));
        const size = baseScopeSize * distanceFactor;
        
        ctx.save();
        
        // スコープの色（白色、透明度付き）
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = 2;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        
        const halfSize = size / 2;
        
        // 描画処理を最適化（beginPath/strokeの呼び出しを減らす）
        ctx.beginPath();
        
        // 正方形のスコープ
        ctx.rect(x - halfSize, y - halfSize, size, size);
        
        // 中心線の長さ（正方形より長く）
        const lineLength = size * 1.5;
        const halfLineLength = lineLength / 2;
        
        // 中心を通る縦線と横線
        ctx.moveTo(x - halfLineLength, y);
        ctx.lineTo(x + halfLineLength, y);
        ctx.moveTo(x, y - halfLineLength);
        ctx.lineTo(x, y + halfLineLength);
        
        // 目盛線
        const tickLength = size * 0.2;
        const divisions = 8;
        
        // 横線の目盛り
        for (let i = 0; i <= divisions; i++) {
            const tx = x - halfLineLength + (lineLength / divisions) * i;
            const tickSize = (i % 2 === 0) ? tickLength : tickLength * 0.6;
            ctx.moveTo(tx, y - tickSize / 2);
            ctx.lineTo(tx, y + tickSize / 2);
        }
        
        // 縦線の目盛り
        for (let i = 0; i <= divisions; i++) {
            const ty = y - halfLineLength + (lineLength / divisions) * i;
            const tickSize = (i % 2 === 0) ? tickLength : tickLength * 0.6;
            ctx.moveTo(x - tickSize / 2, ty);
            ctx.lineTo(x + tickSize / 2, ty);
        }
        
        // 四隅のコーナーマーカー
        const cornerSize = size * 0.2;
        
        // 左上
        ctx.moveTo(x - halfSize, y - halfSize);
        ctx.lineTo(x - halfSize + cornerSize, y - halfSize);
        ctx.moveTo(x - halfSize, y - halfSize);
        ctx.lineTo(x - halfSize, y - halfSize + cornerSize);
        
        // 右上
        ctx.moveTo(x + halfSize, y - halfSize);
        ctx.lineTo(x + halfSize - cornerSize, y - halfSize);
        ctx.moveTo(x + halfSize, y - halfSize);
        ctx.lineTo(x + halfSize, y - halfSize + cornerSize);
        
        // 左下
        ctx.moveTo(x - halfSize, y + halfSize);
        ctx.lineTo(x - halfSize + cornerSize, y + halfSize);
        ctx.moveTo(x - halfSize, y + halfSize);
        ctx.lineTo(x - halfSize, y + halfSize - cornerSize);
        
        // 右下
        ctx.moveTo(x + halfSize, y + halfSize);
        ctx.lineTo(x + halfSize - cornerSize, y + halfSize);
        ctx.moveTo(x + halfSize, y + halfSize);
        ctx.lineTo(x + halfSize, y + halfSize - cornerSize);
        
        ctx.stroke();
        
        // 座標テキストを表示（サイズを大きく）
        // フォント設定は共有Canvas作成時に一度だけ行う（パフォーマンス最適化）
        const coordText = `(${Math.round(this.position.x)}, ${Math.round(this.position.y)}, ${Math.round(this.position.z)})`;
        ctx.fillText(coordText, x, y + halfSize + 10);
        
        ctx.restore();
    }
    
    dispose(scene) {
        // 共有Canvasを使用するため、個別のクリーンアップは不要
    }
    
    onResize() {
        // 共有CanvasのリサイズはScene01で処理
    }
}

