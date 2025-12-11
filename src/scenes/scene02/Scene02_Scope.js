/**
 * Scene02_Scope: sphereの周りを正方形で囲み、座標を表示
 * 2Dスクリーン座標で描画（ビルボード）
 */

import * as THREE from 'three';

export class Scene02_Scope {
    constructor(position, renderer, camera) {
        this.position = position.clone();
        this.age = 0.0;
        this.lifetime = 60.0;
        this.renderer = renderer;
        this.camera = camera;
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
        
        // 3D位置を2Dスクリーン座標に変換
        const vector = this.position.clone();
        vector.project(this.camera);
        
        const x = (vector.x * 0.5 + 0.5) * canvas.width;
        const y = (-vector.y * 0.5 + 0.5) * canvas.height;
        
        // 画面外の場合は描画しない
        if (vector.z > 1 || x < 0 || x > canvas.width || y < 0 || y > canvas.height) {
            return;
        }
        
        // スコープのサイズ（距離に応じて調整）
        const scopeSize = 40.0;
        const worldDistance = this.position.distanceTo(this.camera.position);
        const distanceFactor = Math.max(0.5, Math.min(2.0, 1000.0 / worldDistance));
        const size = scopeSize * distanceFactor;
        
        // 透明度を年齢に応じて変化
        const alpha = 1.0 - (this.age / this.lifetime);
        
        ctx.save();
        
        // スコープの色（白色、透明度付き）
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = 3;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        
        const halfSize = size / 2;
        
        // 描画処理を最適化（beginPath/strokeの呼び出しを減らす）
        ctx.beginPath();
        
        // 正方形のスコープ
        ctx.rect(x - halfSize, y - halfSize, size, size);
        
        // 四隅のコーナーマーカー（1つのpathにまとめる）
        const cornerSize = size * 0.3;
        
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
        
        // テキスト描画の軽量化：距離が近い場合のみ、かつ数フレームに1回だけ更新
        // 距離が500未満の場合のみテキストを表示（パフォーマンス向上）
        if (worldDistance < 500.0) {
            // フレームカウントで更新頻度を下げる（3フレームに1回）
            const frameCount = Math.floor(this.age);
            if (frameCount % 3 === 0) {
                // 座標の精度を下げて軽量化（小数点なし）
        const coordText = `(${Math.round(this.position.x)}, ${Math.round(this.position.y)}, ${Math.round(this.position.z)})`;
        ctx.fillText(coordText, x, y + halfSize + 10);
            }
        }
        
        ctx.restore();
    }
    
    dispose(scene) {
        // 共有Canvasを使用するため、個別のクリーンアップは不要
    }
    
    onResize() {
        // 共有CanvasのリサイズはScene02で処理
    }
}

