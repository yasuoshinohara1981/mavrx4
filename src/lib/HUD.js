/**
 * HUD Class
 * 軍用風のヘッドアップディスプレイ
 * Three.js用に簡易版を実装
 */

export class HUD {
    constructor() {
        this.hudColor = '#ffffff';
        this.hudColorDim = 'rgba(255, 255, 255, 0.8)';
        this.fontSize = 20;  // 少し小さく
        this.fontWeight = 300;  // 細いフォントウェイト
        this.fontFamily = '"Inter", "Roboto", "Helvetica Neue", "Helvetica", "Arial", sans-serif';  // 細いフォント
        
        // TIME表示用の基準時刻
        this.startTime = performance.now();
        
        // 軍事風情報表示用（高速ランダマイズ）
        this.militaryInfoLines = [];  // 3行の情報
        this.militaryInfoFrameCounter = 0;  // フレームカウンター
        this.militaryInfoChangeInterval = 1;  // 1フレームごとに更新
        
        // HUD用のCanvas要素を作成（既存のCanvasがあれば再利用）
        let existingCanvas = document.getElementById('hud-canvas');
        if (existingCanvas) {
            // 既存のCanvasを再利用
            this.canvas = existingCanvas;
            // z-indexを確実に設定
            this.canvas.style.zIndex = '10000';  // パーティクルより上に表示
        } else {
            // 新しいCanvasを作成
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'hud-canvas';
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '10000';  // パーティクルより上に表示
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
    display(frameRate, currentCameraIndex, cameraPosition, activeSpheres, time, rotationX, rotationY, distance, noiseLevel, backgroundWhite, oscStatus, particleCount, trackEffects = null, phase = 0) {
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
        this.drawInfoPanel(frameRate, currentCameraIndex, cameraPosition, activeSpheres, time, particleCount, trackEffects, rotationX, rotationY, distance, oscStatus, phase);
        this.drawStatusBar(rotationX, rotationY, distance, noiseLevel, oscStatus, particleCount);
        
        // 航空機風HUD要素を追加
        this.drawAltitudeTape(cameraPosition);
        this.drawFlightParameters(frameRate, distance, rotationX, rotationY);
        
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
        this.ctx.font = `${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
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
    drawInfoPanel(frameRate, currentCameraIndex, cameraPosition, activeSpheres, time, particleCount, trackEffects = null, rotationX = 0, rotationY = 0, distance = 0, oscStatus = 'Disconnected', phase = 0) {
        const margin = this.squareSize * 0.15;
        let x = margin + 20;
        let y = margin + 40;
        const lineHeight = 20;
        
        this.ctx.fillStyle = this.hudColor;
        this.ctx.font = `${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        
        // システム名を表示（FPSの上）
        this.ctx.fillStyle = this.hudColor;  // 白文字
        this.ctx.font = `${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
        this.ctx.fillText('SYSTEM: MAVRX4-experiment', x, y);
        y += lineHeight * 1.5;  // 間隔を空ける（SYSTEMとCLASSIFIEDの間にスペース）
        
        // 軍事システム風の説明文を追加（高速ランダマイズ）
        this.updateMilitaryInfo(frameRate, currentCameraIndex, cameraPosition, rotationX, rotationY, distance, oscStatus, particleCount);
        this.ctx.fillStyle = this.hudColor;  // 白文字
        this.ctx.font = `${this.fontWeight} ${this.fontSize - 4}px ${this.fontFamily}`;
        if (this.militaryInfoLines.length > 0) {
            this.militaryInfoLines.forEach((line, index) => {
                this.ctx.fillText(line, x, y + (lineHeight * index));
            });
        }
        y += lineHeight * 3;  // 3行分のスペース
        y += lineHeight * 0.5;  // 間隔を空ける（説明文とFPSの間にスペース）
        
        // フォントサイズを戻す
        this.ctx.font = `${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
        
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
        
        // PHASEを表示
        this.ctx.fillText(`PHASE: ${phase}`, x, y);
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
        this.ctx.font = `${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
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
        this.ctx.font = `${this.fontWeight} ${this.fontSize - 4}px ${this.fontFamily}`;
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
    
    /**
     * 速度テープを描画（左側、四隅マーカーの中、枠なし）
     */
    drawSpeedTape(cameraPosition, distance) {
        const margin = this.squareSize * 0.15;
        const markerSize = 30;
        const tapeWidth = 80;
        const tapeX = margin + markerSize + 10;  // 四隅マーカーの右側
        const tapeY = margin + markerSize + 10;  // 四隅マーカーの下側
        const tapeHeight = this.squareSize - (margin + markerSize) * 2 - 20;  // 上下のマーカー間
        const centerY = this.squareSize / 2;
        
        // 現在の速度を計算（距離ベース、簡易版）
        const speed = Math.max(0, Math.min(999, distance * 0.1 + Math.random() * 50));
        const currentSpeed = Math.round(speed);
        
        this.ctx.strokeStyle = this.hudColor;
        this.ctx.fillStyle = this.hudColor;
        this.ctx.lineWidth = 2;
        this.ctx.font = `${this.fontWeight} ${this.fontSize - 4}px ${this.fontFamily}`;
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'middle';
        
        // 現在の速度をハイライト表示
        const speedBoxY = centerY - 15;
        this.ctx.fillRect(tapeX + 5, speedBoxY, tapeWidth - 10, 30);
        this.ctx.fillStyle = '#000000';
        this.ctx.fillText(currentSpeed.toString(), tapeX + tapeWidth - 10, centerY);
        this.ctx.fillStyle = this.hudColor;
        
        // 速度マーカーを描画
        const speedRange = 200; // ±100ノット
        const pixelsPerKnot = 2;
        const startSpeed = currentSpeed - speedRange / 2;
        
        for (let i = 0; i <= speedRange; i += 10) {
            const speedValue = startSpeed + i;
            if (speedValue < 0 || speedValue > 999) continue;
            
            const y = centerY + (speedValue - currentSpeed) * pixelsPerKnot;
            if (y < tapeY || y > tapeY + tapeHeight) continue;
            
            const tickLength = (i % 50 === 0) ? 20 : 10;
            this.ctx.beginPath();
            this.ctx.moveTo(tapeX + tapeWidth - tickLength, y);
            this.ctx.lineTo(tapeX + tapeWidth, y);
            this.ctx.stroke();
            
            // 50ノットごとに数値を表示
            if (i % 50 === 0) {
                this.ctx.fillText(speedValue.toString(), tapeX + tapeWidth - tickLength - 5, y);
            }
        }
        
        // ラベル（四隅マーカーの高さに合わせる）
        this.ctx.textAlign = 'center';
        this.ctx.fillText('SPD', tapeX + tapeWidth / 2, margin);
    }
    
    /**
     * 高度テープを描画（右側、シンプルな縦目盛り）
     */
    drawAltitudeTape(cameraPosition) {
        this.ctx.strokeStyle = this.hudColor;
        this.ctx.fillStyle = this.hudColor;
        this.ctx.lineWidth = 2;
        this.ctx.font = `${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'top';
        
        const margin = this.squareSize * 0.15;
        const scaleX = this.squareSize - margin - 30;
        const altLabelY = margin + 40;
        const scaleY = altLabelY + 40;
        const scaleHeight = this.squareSize * 0.4;
        
        // ALTラベル
        this.ctx.fillText('ALT', scaleX, altLabelY);
        
        // メインライン（縦線）
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
     * ピッチラダーを描画（水平線の上下に角度マーカー）
     */
    drawPitchLadder(rotationX) {
        const centerX = this.squareSize / 2;
        const centerY = this.squareSize / 2;
        const pitchDeg = (rotationX * 180) / Math.PI;
        
        this.ctx.strokeStyle = this.hudColor;
        this.ctx.fillStyle = this.hudColor;
        this.ctx.lineWidth = 2;
        this.ctx.font = `${this.fontWeight} ${this.fontSize - 6}px ${this.fontFamily}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // ピッチ角度マーカーを描画（±30度まで）
        for (let angle = -30; angle <= 30; angle += 5) {
            const y = centerY - (angle - pitchDeg) * 8; // 8ピクセル/度
            
            if (y < centerY - 200 || y > centerY + 200) continue;
            
            const lineLength = (angle % 10 === 0) ? 60 : 30;
            
            // 水平線
            this.ctx.beginPath();
            this.ctx.moveTo(centerX - lineLength, y);
            this.ctx.lineTo(centerX + lineLength, y);
            this.ctx.stroke();
            
            // 10度ごとに数値を表示
            if (angle % 10 === 0 && angle !== 0) {
                this.ctx.fillText(Math.abs(angle).toString(), centerX - lineLength - 15, y);
            }
        }
    }
    
    /**
     * 飛行経路マーカーを描画（中心の円形マーカー）
     */
    drawFlightPathMarker(rotationX, rotationY) {
        const centerX = this.squareSize / 2;
        const centerY = this.squareSize / 2;
        
        // ピッチとロールに基づいてマーカーの位置を調整
        const pitchOffset = (rotationX * 180) / Math.PI * 5;
        const rollOffset = (rotationY * 180) / Math.PI * 5;
        
        const markerX = centerX + rollOffset;
        const markerY = centerY + pitchOffset;
        
        this.ctx.strokeStyle = this.hudColor;
        this.ctx.fillStyle = this.hudColor;
        this.ctx.lineWidth = 2;
        
        // 円形マーカー
        this.ctx.beginPath();
        this.ctx.arc(markerX, markerY, 8, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // 水平の「翼」
        this.ctx.beginPath();
        this.ctx.moveTo(markerX - 20, markerY);
        this.ctx.lineTo(markerX - 8, markerY);
        this.ctx.moveTo(markerX + 8, markerY);
        this.ctx.lineTo(markerX + 20, markerY);
        this.ctx.stroke();
    }
    
    /**
     * コンパスローズを描画（下部の方位表示）
     */
    drawCompassRose(rotationY) {
        const centerX = this.squareSize / 2;
        const bottomY = this.squareSize - 60;
        const radius = 80;
        
        const heading = ((rotationY * 180) / Math.PI + 360) % 360;
        
        this.ctx.strokeStyle = this.hudColor;
        this.ctx.fillStyle = this.hudColor;
        this.ctx.lineWidth = 2;
        this.ctx.font = `${this.fontWeight} ${this.fontSize - 6}px ${this.fontFamily}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // コンパスの円
        this.ctx.beginPath();
        this.ctx.arc(centerX, bottomY, radius, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // 方位マーカーを描画
        for (let angle = 0; angle < 360; angle += 10) {
            const rad = (angle - heading) * Math.PI / 180;
            const x1 = centerX + Math.cos(rad) * radius;
            const y1 = bottomY + Math.sin(rad) * radius;
            const tickLength = (angle % 30 === 0) ? 15 : 8;
            const x2 = centerX + Math.cos(rad) * (radius - tickLength);
            const y2 = bottomY + Math.sin(rad) * (radius - tickLength);
            
            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
            
            // 30度ごとに数値を表示
            if (angle % 30 === 0) {
                const labelX = centerX + Math.cos(rad) * (radius - 25);
                const labelY = bottomY + Math.sin(rad) * (radius - 25);
                const labelText = (angle / 10).toString();
                this.ctx.fillText(labelText, labelX, labelY);
            }
        }
        
        // 現在のヘディングを表示
        this.ctx.font = `${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
        this.ctx.fillText(`HDG ${Math.round(heading)}`, centerX, bottomY - radius - 20);
    }
    
    /**
     * 飛行パラメータを描画（各種情報、四隅マーカーの高さに合わせる）
     */
    drawFlightParameters(frameRate, distance, rotationX, rotationY) {
        const margin = this.squareSize * 0.15;
        const topY = margin;  // 四隅マーカーの高さに合わせる
        const leftX = this.squareSize / 2 - 150;
        const rightX = this.squareSize / 2 + 150;
        
        this.ctx.fillStyle = this.hudColor;
        this.ctx.font = `${this.fontWeight} ${this.fontSize - 4}px ${this.fontFamily}`;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        
        // 左側：速度関連
        this.ctx.fillText(`GS ${Math.round(distance * 0.1)}`, leftX, topY);
        this.ctx.fillText(`MCP SPD ${Math.round(distance * 0.1 + 50)}`, leftX, topY + 20);
        
        // 右側：高度関連
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`VS ${Math.round((rotationX * 180) / Math.PI * 10)}`, rightX, topY);
        this.ctx.fillText(`ALT HOLD`, rightX, topY + 20);
        
        // 中央上部：モード表示
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`CMD`, this.squareSize / 2, topY);
        this.ctx.fillText(`LNAV`, this.squareSize / 2, topY + 20);
    }
    
    /**
     * 軍事風情報を更新（高速ランダマイズ、HUD用共通情報）
     */
    updateMilitaryInfo(frameRate, currentCameraIndex, cameraPosition, rotationX, rotationY, distance, oscStatus, particleCount) {
        this.militaryInfoFrameCounter++;
        
        // 1フレームごとに情報を再生成
        if (this.militaryInfoFrameCounter >= this.militaryInfoChangeInterval) {
            this.militaryInfoFrameCounter = 0;
            this.generateMilitaryInfo(frameRate, currentCameraIndex, cameraPosition, rotationX, rotationY, distance, oscStatus, particleCount);
        }
        
        // 最初のフレームでも情報を生成
        if (this.militaryInfoLines.length === 0) {
            this.generateMilitaryInfo(frameRate, currentCameraIndex, cameraPosition, rotationX, rotationY, distance, oscStatus, particleCount);
        }
    }
    
    /**
     * 軍事風情報を生成（HUD用共通情報、3行）
     */
    generateMilitaryInfo(frameRate, currentCameraIndex, cameraPosition, rotationX, rotationY, distance, oscStatus, particleCount) {
        const now = Date.now();
        const timestamp = (now / 1000.0).toFixed(7);
        const rotXDeg = (rotationX * 180) / Math.PI;
        const rotYDeg = (rotationY * 180) / Math.PI;
        
        // 軍事風の情報を生成（HUD用共通情報、シーンに依存しない）
        const parts = [
            `timestamp : ${timestamp}`,
            `fps : ${frameRate.toFixed(1)}`,
            `camera_index : ${currentCameraIndex}`,
            `coords : x:${cameraPosition.x.toFixed(6)} y:${cameraPosition.y.toFixed(6)} z:${cameraPosition.z.toFixed(6)}`,
            `rotation_x : ${rotXDeg.toFixed(4)}`,
            `rotation_y : ${rotYDeg.toFixed(4)}`,
            `distance : ${distance.toFixed(4)}`,
            `particles : ${particleCount || 0}`,
            `signal_strength : ${(Math.random() * 100).toFixed(2)}%`,
            `data_rate : ${(Math.random() * 10000).toFixed(0)} bps`,
            `packet_loss : ${(Math.random() * 5).toFixed(2)}%`,
            `latency : ${(Math.random() * 100).toFixed(2)}ms`,
            `bandwidth : ${(Math.random() * 1000).toFixed(0)} Mbps`,
            `memory_usage : ${(Math.random() * 100).toFixed(1)}%`,
            `cpu_load : ${(Math.random() * 100).toFixed(1)}%`,
            `network_status : ${Math.random() > 0.5 ? 'CONNECTED' : 'STANDBY'}`,
            `protocol : UDP/MAVRX4`,
            `sequence : ${Math.floor(Math.random() * 100000)}`,
            `checksum : 0x${Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0')}`,
            `buffer_size : ${Math.floor(Math.random() * 10000)} bytes`,
            `queue_depth : ${Math.floor(Math.random() * 100)}`,
            `error_count : ${Math.floor(Math.random() * 10)}`,
            `retry_count : ${Math.floor(Math.random() * 5)}`,
            `connection_id : ${Math.floor(Math.random() * 1000000)}`,
            `session_key : ${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
            `encryption : ${Math.random() > 0.5 ? 'AES-256' : 'TLS-1.3'}`,
            `auth_status : ${Math.random() > 0.5 ? 'AUTHENTICATED' : 'PENDING'}`,
            `sync_status : ${Math.random() > 0.5 ? 'SYNCED' : 'SYNCING'}`,
            `osc_status : ${oscStatus}`,
            `last_update : ${new Date().toISOString()}`
        ];
        
        // 配列をランダムにシャッフル
        for (let i = parts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [parts[i], parts[j]] = [parts[j], parts[i]];
        }
        
        // 3行を選択
        this.militaryInfoLines = parts.slice(0, 3);
    }
}

