/**
 * Scene05_CollisionCircle: 衝突時のCircleエフェクト
 * Processing版のScene05_CollisionCircleを参考
 * 完全2D実装（Canvas 2Dで描画）
 */

import * as THREE from 'three';

export class Scene05_CollisionCircle {
    constructor(x, y, noteNumber, velocity, durationMs, isTopBoundary) {
        this.x = x;
        this.y = y;
        this.noteNumber = noteNumber;
        this.velocity = velocity;
        this.durationMs = durationMs;
        this.isTopBoundary = isTopBoundary;
        
        this.circleRadius = 0.0;
        this.circleAlpha = 255.0;
        this.circleAge = 0.0;
        
        // ベロシティに応じて最大半径を設定（もっと大きく）
        this.circleMaxRadius = THREE.MathUtils.mapLinear(velocity, 0, 127, 150.0, 600.0);  // 50-300 → 150-600
        
        // サスティン時間に応じて寿命を設定（もっと長く、ゆっくり消える）
        if (durationMs > 0) {
            this.circleLifetime = (durationMs / 1000.0) * 60.0 * 2.0;  // 2倍に
            this.circleLifetime = THREE.MathUtils.clamp(this.circleLifetime, 120.0, 600.0);  // 30-300 → 120-600
        } else {
            this.circleLifetime = 180.0;  // 60 → 180（3倍）
        }
        
        // テキスト表示用の初期値を設定
        this.targetId = `TGT-${Math.floor(Math.random() * 900 + 100).toString().padStart(3, '0')}`;
        this.distance = Math.random() * 4500 + 500;
        this.speed = Math.random() * 700 + 100;
        this.bearing = Math.random() * 360;
        this.altitude = Math.random() * 2500 - 500;
        this.updateCounter = 0;
        
        // パフォーマンス最適化用
        this.fontSet = false;
        this.cachedTextLines = null;
    }
    
    /**
     * 更新処理
     */
    update() {
        if (this.circleAge < this.circleLifetime) {
            this.circleAge += 1.0;
            const progress = this.circleAge / this.circleLifetime;
            // イージング関数でゆっくり消える（ease-out）
            const easedProgress = 1.0 - Math.pow(1.0 - progress, 3.0);  // cubic ease-out
            this.circleRadius = this.circleMaxRadius * easedProgress;
            // 透明度もゆっくり減らす（ease-out）
            this.circleAlpha = 255.0 * (1.0 - easedProgress);
            
            // テキスト情報を更新（連続で変わる数字、更新頻度を下げて軽量化）
            this.updateCounter++;
            if (this.updateCounter % 5 === 0) {
                // 距離を少しずつ変える
                this.distance += Math.random() * 100 - 50;
                this.distance = THREE.MathUtils.clamp(this.distance, 100, 10000);
                
                // 速度を少しずつ変える
                this.speed += Math.random() * 40 - 20;
                this.speed = THREE.MathUtils.clamp(this.speed, 0, 1000);
                
                // 方位角を少しずつ変える
                this.bearing += Math.random() * 10 - 5;
                if (this.bearing < 0) this.bearing += 360;
                if (this.bearing >= 360) this.bearing -= 360;
                
                // 高度を少しずつ変える
                this.altitude += Math.random() * 60 - 30;
                this.altitude = THREE.MathUtils.clamp(this.altitude, -1000, 5000);
            }
        }
    }
    
    /**
     * 描画処理（Canvas 2D）
     */
    draw(ctx, backgroundWhite) {
        if (!ctx || this.circleRadius <= 0.0 || this.circleAlpha <= 10.0) {
            return;
        }
        
        // Scene04と同じ黄色（0xffff00）
        const color = new THREE.Color(0xffff00);  // 黄色
        
        ctx.save();
        
        // Circleを描画（Scene04と同じ透明度：fill=0.3, stroke=0.8）
        const fillOpacity = (this.circleAlpha / 255.0) * 0.3;  // Scene04と同じfill opacity
        const strokeOpacity = (this.circleAlpha / 255.0) * 0.8;  // Scene04と同じstroke opacity
        ctx.strokeStyle = `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${strokeOpacity})`;
        ctx.fillStyle = `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${fillOpacity})`;
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.circleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // テキストを描画（透明度が高い場合のみ、軽量化、フラグで制御）
        if (this.showText && this.circleAlpha > 50.0) {
            this.drawText(ctx, backgroundWhite);
        }
        
        ctx.restore();
    }
    
    /**
     * テキストを描画（軍事レーダーのような情報表示、軽量化版）
     */
    drawText(ctx, backgroundWhite) {
        // 透明度が低い場合は描画しない（パフォーマンス最適化）
        if (this.circleAlpha < 30.0) {
            return;
        }
        
        // テキストの位置を決定（Circleの中心より上か下、位置は固定）
        const fixedTextOffset = 80.0;
        const textOffsetY = this.isTopBoundary ? -fixedTextOffset : fixedTextOffset;
        const textX = this.x;
        const textY = this.y + textOffsetY;
        
        // テキストの色（白/黒、反転時は黒）
        const textAlpha = (this.circleAlpha / 255.0) * 0.9;
        if (backgroundWhite) {
            ctx.fillStyle = `rgba(0, 0, 0, ${textAlpha})`;
        } else {
            ctx.fillStyle = `rgba(255, 255, 255, ${textAlpha})`;
        }
        
        // フォント設定は一度だけ（毎フレーム設定しない、パフォーマンス最適化）
        if (!this.fontSet) {
            ctx.font = '18px monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'center';
            this.fontSet = true;
        }
        
        // 軍事レーダーのような情報を表示（行数を減らして軽量化）
        // テキストを事前に計算してキャッシュ（毎フレーム計算しない）
        if (!this.cachedTextLines) {
            this.cachedTextLines = [
                'TARGET LOCKED',
                this.targetId,
                '',  // RNGは動的に更新
                '',  // SPDは動的に更新
                ''   // BRGは動的に更新
            ];
        }
        
        // 数値部分のみ更新（文字列連結を最小化）
        this.cachedTextLines[2] = `RNG: ${Math.round(this.distance)}m`;
        this.cachedTextLines[3] = `SPD: ${Math.round(this.speed)}m/s`;
        this.cachedTextLines[4] = `BRG: ${Math.round(this.bearing)}°`;
        
        // 各行を描画（Processing版と同じ）
        const lineHeight = 20;
        const startY = textY - (this.cachedTextLines.length * lineHeight) / 2.0;
        
        // forループで描画（forEachより高速）
        for (let i = 0; i < this.cachedTextLines.length; i++) {
            ctx.fillText(this.cachedTextLines[i], textX, startY + i * lineHeight);
        }
    }
    
    /**
     * アクティブかどうかを返す
     */
    isActive() {
        return this.circleAge < this.circleLifetime;
    }
    
    /**
     * リソースを解放
     */
    dispose(scene) {
        // Canvas 2Dなので、特にリソース解放は不要
    }
}
