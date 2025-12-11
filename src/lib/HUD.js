/**
 * HUD Class
 * 軍用風のヘッドアップディスプレイ
 * Three.js用に簡易版を実装
 */

export class HUD {
    constructor() {
        this.hudColor = '#ffffff';
        this.hudColorDim = 'rgba(255, 255, 255, 0.8)';
        this.fontSize = 24;
        
        // TIME表示用の基準時刻
        this.startTime = performance.now();
        
        // HUD用のCanvas要素を作成（既存のCanvasがあれば再利用）
        let existingCanvas = document.getElementById('hud-canvas');
        if (existingCanvas) {
            // 既存のCanvasを再利用
            this.canvas = existingCanvas;
        } else {
            // 新しいCanvasを作成
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'hud-canvas';
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '1000';
        document.body.appendChild(this.canvas);
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.updateSize();
    }
    
    /**
     * TIMEをリセット（基準時刻を現在時刻に更新）
     */
    resetTime() {
        this.startTime = performance.now();
    }
    
    /**
     * サイズを更新
     */
    updateSize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.squareSize = Math.min(window.innerWidth, window.innerHeight);
        this.squareX = (window.innerWidth - this.squareSize) / 2;
        this.squareY = (window.innerHeight - this.squareSize) / 2;
    }
    
    /**
     * Canvasをクリア（HUD非表示時用）
     */
    clear() {
        this.updateSize();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    /**
     * HUDを描画
     */
    display(frameRate, currentCameraIndex, cameraPosition, activeSpheres, time, rotationX, rotationY, distance, noiseLevel, backgroundWhite, oscStatus, particleCount, trackEffects = null) {
        // 色反転エフェクトが有効な場合はHUDの色を反転（白→黒）
        if (backgroundWhite) {
            this.hudColor = '#000000';
            this.hudColorDim = 'rgba(0, 0, 0, 0.3)';  // 1.0 → 0.5に下げる（透明度を上げる = より透明にする）
        } else {
            this.hudColor = '#ffffff';
            this.hudColorDim = 'rgba(255, 255, 255, 0.3)';  // 1.0 → 0.5に下げる（透明度を上げる = より透明にする）
        }
        
        // サイズを更新
        this.updateSize();
        
        // Canvasをクリア
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 中心を通る横線を描画（画面全体）
        this.drawCenterHorizontalLine();
        
        // 正方形領域に座標変換を適用
        this.ctx.save();
        this.ctx.translate(this.squareX, this.squareY);
        
        // HUDの描画（正方形領域内）
        this.drawCornerMarkers();
        this.drawCenterCrosshair();
        this.drawCenterVerticalLine();
        this.drawScaleRuler();
        this.drawInfoPanel(frameRate, currentCameraIndex, cameraPosition, activeSpheres, time, particleCount, trackEffects);
        this.drawVerticalScale();
        this.drawStatusBar(rotationX, rotationY, distance, noiseLevel, oscStatus, particleCount);
        
        this.ctx.restore();
    }
    
    /**
     * コーナーマーカーを描画
     */
    drawCornerMarkers() {
        this.ctx.strokeStyle = this.hudColor;
        this.ctx.lineWidth = 3;
        
        const margin = this.squareSize * 0.15;
        const markerSize = 30;
        
        // 左上
        this.ctx.beginPath();
        this.ctx.moveTo(margin, margin);
        this.ctx.lineTo(margin + markerSize, margin);
        this.ctx.moveTo(margin, margin);
        this.ctx.lineTo(margin, margin + markerSize);
        this.ctx.stroke();
        
        // 右上
        this.ctx.beginPath();
        this.ctx.moveTo(this.squareSize - margin, margin);
        this.ctx.lineTo(this.squareSize - margin - markerSize, margin);
        this.ctx.moveTo(this.squareSize - margin, margin);
        this.ctx.lineTo(this.squareSize - margin, margin + markerSize);
        this.ctx.stroke();
        
        // 左下
        this.ctx.beginPath();
        this.ctx.moveTo(margin, this.squareSize - margin);
        this.ctx.lineTo(margin + markerSize, this.squareSize - margin);
        this.ctx.moveTo(margin, this.squareSize - margin);
        this.ctx.lineTo(margin, this.squareSize - margin - markerSize);
        this.ctx.stroke();
        
        // 右下
        this.ctx.beginPath();
        this.ctx.moveTo(this.squareSize - margin, this.squareSize - margin);
        this.ctx.lineTo(this.squareSize - margin - markerSize, this.squareSize - margin);
        this.ctx.moveTo(this.squareSize - margin, this.squareSize - margin);
        this.ctx.lineTo(this.squareSize - margin, this.squareSize - margin - markerSize);
        this.ctx.stroke();
    }
    
    /**
     * 中央のクロスヘアを描画
     */
    drawCenterCrosshair() {
        this.ctx.strokeStyle = this.hudColorDim;
        this.ctx.lineWidth = 2;
        
        const centerX = this.squareSize / 2;
        const centerY = this.squareSize / 2;
        const size = 20;
        
        // 十字線
        this.ctx.beginPath();
        this.ctx.moveTo(centerX - size, centerY);
        this.ctx.lineTo(centerX + size, centerY);
        this.ctx.moveTo(centerX, centerY - size);
        this.ctx.lineTo(centerX, centerY + size);
        this.ctx.stroke();
        
        // 外側の円
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, size * 4, 0, Math.PI * 2);
        this.ctx.stroke();
    }
    
    /**
     * 中心を通る横線を描画（画面全体）
     */
    drawCenterHorizontalLine() {
        this.ctx.strokeStyle = this.hudColorDim;
        this.ctx.lineWidth = 2;
        
        const centerY = window.innerHeight / 2;
        
        this.ctx.beginPath();
        this.ctx.moveTo(0, centerY);
        this.ctx.lineTo(window.innerWidth, centerY);
        this.ctx.stroke();
    }
    
    /**
     * 中心を通る縦線を描画
     */
    drawCenterVerticalLine() {
        this.ctx.strokeStyle = this.hudColorDim;
        this.ctx.lineWidth = 2;
        
        const centerX = this.squareSize / 2;
        
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, 0);
        this.ctx.lineTo(centerX, this.squareSize);
        this.ctx.stroke();
    }
    
    /**
     * スケールルーラーを描画
     */
    drawScaleRuler() {
        this.ctx.strokeStyle = this.hudColor;
        this.ctx.lineWidth = 2;
        this.ctx.fillStyle = this.hudColor;
        this.ctx.font = `${this.fontSize}px monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        
        const margin = this.squareSize * 0.15;
        const y = this.squareSize - margin - 40;
        const startX = margin + 30;
        const endX = this.squareSize - margin - 30;
        const rulerLength = endX - startX;
        
        // メインライン
        this.ctx.beginPath();
        this.ctx.moveTo(startX, y);
        this.ctx.lineTo(endX, y);
        this.ctx.stroke();
        
        // 目盛り
        const divisions = 10;
        for (let i = 0; i <= divisions; i++) {
            const x = startX + (rulerLength / divisions) * i;
            const tickSize = (i % 5 === 0) ? 10 : 5;
            
            this.ctx.beginPath();
            this.ctx.moveTo(x, y - tickSize / 2);
            this.ctx.lineTo(x, y + tickSize / 2);
            this.ctx.stroke();
            
            // 数値を表示（5の倍数のみ）
            if (i % 5 === 0) {
                this.ctx.fillText((i * 10).toString(), x, y + 8);
            }
        }
        
        // ラベル
        this.ctx.textAlign = 'left';
        this.ctx.fillText('SCALE', startX, y - 30);
    }
    
    /**
     * 情報パネルを描画
     */
    drawInfoPanel(frameRate, currentCameraIndex, cameraPosition, activeSpheres, time, particleCount, trackEffects = null) {
        const margin = this.squareSize * 0.15;
        let x = margin + 20;
        let y = margin + 40;
        const lineHeight = 20;
        
        this.ctx.fillStyle = this.hudColor;
        this.ctx.font = `${this.fontSize}px monospace`;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        
        this.ctx.fillText(`FPS: ${frameRate.toFixed(1)}`, x, y);
        y += lineHeight;
        
        this.ctx.fillText(`CAM: #${currentCameraIndex}`, x, y);
        y += lineHeight;
        
        this.ctx.fillText(`POS: (${cameraPosition.x.toFixed(0)}, ${cameraPosition.y.toFixed(0)}, ${cameraPosition.z.toFixed(0)})`, x, y);
        y += lineHeight;
        
        this.ctx.fillText(`OBJECTS: ${particleCount || 0}`, x, y);
        y += lineHeight;
        
        // 実時間を分:秒形式で表示（基準時刻からの経過時間）
        const elapsedTime = (performance.now() - this.startTime) / 1000; // 秒単位
        const minutes = Math.floor(elapsedTime / 60);
        const seconds = Math.floor(elapsedTime % 60);
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        this.ctx.fillText(`TIME: ${timeString}`, x, y);
        y += lineHeight;
        
        // エフェクト状態を表示
        if (trackEffects) {
            y += lineHeight * 0.5;  // 少し間隔を空ける
            this.ctx.fillText('EFFECTS:', x, y);
            y += lineHeight;
            
            const effectNames = {
                1: 'CAM',
                2: 'INV',
                3: 'CHR',
                4: 'GLT',
                5: 'FX5',
                6: 'FX6',
                7: 'FX7',
                8: 'FX8',
                9: 'FX9'
            };
            
            for (let track = 1; track <= 9; track++) {
                const isOn = trackEffects[track] || false;
                const status = isOn ? 'ON' : 'OFF';
                const color = isOn ? this.hudColor : this.hudColorDim;
                this.ctx.fillStyle = color;
                this.ctx.fillText(`  ${effectNames[track]}: ${status}`, x, y);
                y += lineHeight;
            }
            this.ctx.fillStyle = this.hudColor;  // 色を戻す
        }
    }
    
    /**
     * 縦目盛りを描画
     */
    drawVerticalScale() {
        this.ctx.strokeStyle = this.hudColor;
        this.ctx.fillStyle = this.hudColor;
        this.ctx.lineWidth = 2;
        this.ctx.font = `${this.fontSize}px monospace`;
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'top';
        
        const margin = this.squareSize * 0.15;
        const scaleX = this.squareSize - margin - 30;
        const altLabelY = margin + 40;
        const scaleY = altLabelY + 40;
        const scaleHeight = this.squareSize * 0.4;
        
        // ALTラベル
        this.ctx.fillText('ALT', scaleX, altLabelY);
        
        // メインライン
        this.ctx.beginPath();
        this.ctx.moveTo(scaleX, scaleY);
        this.ctx.lineTo(scaleX, scaleY + scaleHeight);
        this.ctx.stroke();
        
        // 目盛り
        const divisions = 10;
        const divisionHeight = scaleHeight / divisions;
        
        for (let i = 0; i <= divisions; i++) {
            const y = scaleY + (divisionHeight * i);
            const tickSize = (i % 5 === 0) ? 15 : 8;
            
            this.ctx.beginPath();
            this.ctx.moveTo(scaleX - tickSize, y);
            this.ctx.lineTo(scaleX, y);
            this.ctx.stroke();
            
            // 数値を表示（5の倍数のみ）
            if (i % 5 === 0) {
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText((i * 10).toString(), scaleX - tickSize - 5, y);
                this.ctx.textBaseline = 'top';
            }
        }
    }
    
    /**
     * ステータスバーを描画（Processingと同じ：4分割）
     */
    drawStatusBar(rotationX, rotationY, distance, noiseLevel, oscStatus, particleCount) {
        this.ctx.strokeStyle = this.hudColor;
        this.ctx.fillStyle = this.hudColor;
        this.ctx.lineWidth = 2;
        this.ctx.font = `${this.fontSize - 4}px monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        const margin = this.squareSize * 0.15;
        const barHeight = 35;
        const barWidth = this.squareSize - margin * 2;
        const barX = margin;
        const rulerY = this.squareSize - margin - 40;
        const rulerTextY = rulerY + 8;
        const barY = rulerTextY + 50;  // Processingと同じ
        
        // ステータスバーの枠
        this.ctx.strokeRect(barX, barY, barWidth, barHeight);
        
        // ステータスバー内の区切り線（4分割、Processingと同じ）
        const divisionX1 = barX + barWidth / 4;
        const divisionX2 = barX + barWidth / 2;
        const divisionX3 = barX + barWidth * 3 / 4;
        
        this.ctx.beginPath();
        this.ctx.moveTo(divisionX1, barY);
        this.ctx.lineTo(divisionX1, barY + barHeight);
        this.ctx.moveTo(divisionX2, barY);
        this.ctx.lineTo(divisionX2, barY + barHeight);
        this.ctx.moveTo(divisionX3, barY);
        this.ctx.lineTo(divisionX3, barY + barHeight);
        this.ctx.stroke();
        
        // ステータス表示（Processingと同じ）
        const rotXDeg = (rotationX * 180) / Math.PI;
        const rotYDeg = (rotationY * 180) / Math.PI;
        
        // 左側：ローテーション角度
        this.ctx.fillText(`ROT: ${rotXDeg.toFixed(1)}°/${rotYDeg.toFixed(1)}°`, barX + barWidth / 8, barY + barHeight / 2);
        
        // 左から2番目：距離情報
        this.ctx.fillText(`DST: ${distance.toFixed(0)}m`, barX + barWidth * 3 / 8, barY + barHeight / 2);
        
        // 中央：検知ステータス（ノイズレベルに基づく）
        const detectStatus = noiseLevel > 30.0 ? 'DETECT' : 'SCAN';
        this.ctx.fillText(`STAT: ${detectStatus}`, barX + barWidth / 2, barY + barHeight / 2);
        
        // 右から2番目：ノイズレベル
        this.ctx.fillText(`NOISE: ${noiseLevel.toFixed(1)}`, barX + barWidth * 5 / 8, barY + barHeight / 2);
        
        // 右側：システムステータス
        this.ctx.fillText('SYS: OK', barX + barWidth * 7 / 8, barY + barHeight / 2);
    }
}

