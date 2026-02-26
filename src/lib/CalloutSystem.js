/**
 * CalloutSystem Class
 * 2D HUDレイヤーに表示されるメカニカルな注釈（コールアウト）を管理するクラス
 */
import * as THREE from 'three';

export class CalloutSystem {
    constructor() {
        this.callouts = [];
        this.lastCalloutTime = 0;
        this.labels = [
            "CORE_TEMP: NORMAL", "VOLTAGE: 1.2MV", "PRESSURE: 450kPa", 
            "SYNC_RATE: 98.2%", "FLOW_CTRL: ACTIVE", "CELL_STAT: STABLE",
            "NUCLEUS_ID: 0x18", "XENO_LINK: ESTABLISHED",
            "SIGNAL: STABLE", "DATA_STREAM: FLOWING", "LINK_ID: 0xAF42"
        ];
    }

    /**
     * 更新処理
     */
    update(deltaTime, time, camera = null, options = {}) {
        const {
            interval = 1.5,
            maxCount = 8,
            margin = 200,
            autoGenerate = true
        } = options;

        // 自動生成フラグが立っている場合のみ時間経過で生成
        if (autoGenerate && time - this.lastCalloutTime > interval + Math.random() * interval) {
            if (this.callouts.length < maxCount) {
                this.createCallout({ margin, time });
                this.lastCalloutTime = time;
            }
        }

        // コールアウトの寿命管理と3D追従
        for (let i = this.callouts.length - 1; i >= 0; i--) {
            const callout = this.callouts[i];
            const elapsed = time - callout.startTime;
            callout.life -= deltaTime;
            
            // デュレーション（寿命）に合わせてアニメーションの各フェーズの時間を動的に計算
            // アニメーションを爆速化！寿命の最初の15%（以前は40%）で完結させる
            const animTotalTime = Math.min(callout.maxLife * 0.15, 0.8); // 最大でも0.8秒以内に全工程を終わらせる
            const phase1 = animTotalTime * 0.15; // ◯のピピピ（超速）
            const phase2 = animTotalTime * 0.25; // 確定と赤塗り
            const phase3 = animTotalTime * 0.50; // 斜め線ニュニュニュ
            const phase4 = animTotalTime * 0.75; // 水平線ニュニュニュ
            const phase5 = animTotalTime * 1.00; // テキストタイピング

            // 3D位置から2D座標を更新
            let isVisible = true;
            if (callout.worldPos && camera) {
                const vector = callout.worldPos.clone();
                vector.project(camera);
                
                callout.x = (vector.x * 0.5 + 0.5) * window.innerWidth;
                callout.y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
                
                if (vector.z > 1.0) {
                    isVisible = false;
                }
            }

            // --- アニメーション状態の更新 ---
            // 1. ◯のピピピ
            if (elapsed < phase1) {
                callout.animState = 'circle_ping';
                const ping = (elapsed % (phase1 / 2)) / (phase1 / 2); // 2回点滅
                callout.circleScale = 0.3 + Math.sin(ping * Math.PI) * 1.0;
                callout.opacity = 0.9;
                callout.circleFillOpacity = 0;
            } 
            // 2. 確定と赤い塗り
            else if (elapsed < phase2) {
                callout.animState = 'circle_fix';
                callout.circleScale = 1.0;
                callout.circleFillOpacity = (elapsed - phase1) / (phase2 - phase1) * 0.4;
                callout.lineProgress = 0;
            }
            // 3. 斜め線ニュニュニュ
            else if (elapsed < phase3) {
                callout.animState = 'line_diag';
                callout.lineProgress = (elapsed - phase2) / (phase3 - phase2);
                callout.horizProgress = 0;
            }
            // 4. 水平線ニュニュニュ
            else if (elapsed < phase4) {
                callout.animState = 'line_horiz';
                callout.lineProgress = 1.0;
                callout.horizProgress = (elapsed - phase3) / (phase4 - phase3);
                callout.textCharCount = 0;
            }
            // 5. テキスト1文字ずつ
            else if (elapsed < phase5) {
                callout.animState = 'text_typing';
                callout.horizProgress = 1.0;
                const textElapsed = elapsed - phase4;
                const textDuration = phase5 - phase4;
                callout.textCharCount = Math.floor((textElapsed / textDuration) * callout.labelText.length);
            }
            // 6. 表示維持
            else {
                callout.animState = 'idle';
                callout.textCharCount = callout.labelText.length;
            }

            // フェードアウト
            if (callout.life < 0.3) {
                callout.opacity = Math.min(callout.opacity, callout.life / 0.3);
            } else if (elapsed > 0.05 && isVisible) {
                callout.opacity = 1.0;
            } else if (!isVisible) {
                callout.opacity = 0;
            }

            if (callout.life <= 0) {
                this.callouts.splice(i, 1);
            }
        }
    }

    /**
     * コールアウトを生成
     */
    createCallout(params = {}) {
        const {
            margin = 200,
            time = 0,
            worldPos = null,
            duration = 5.0,
            labelText = null
        } = params;

        let x, y;
        if (!worldPos) {
            const width = window.innerWidth;
            const height = window.innerHeight;
            x = margin + Math.random() * (width - margin * 2);
            y = margin + Math.random() * (height - margin * 2);
        }

        this.callouts.push({
            x: x || 0,
            y: y || 0,
            worldPos: worldPos ? worldPos.clone() : null,
            radius: 10 + Math.random() * 10,
            lineLen: 40 + Math.random() * 40,
            horizLen: 60 + Math.random() * 60,
            dirX: Math.random() > 0.5 ? 1 : -1,
            dirY: Math.random() > 0.5 ? 1 : -1,
            labelText: labelText || this.labels[Math.floor(Math.random() * this.labels.length)],
            startTime: time,
            life: duration,
            maxLife: duration,
            opacity: 0,
            
            animState: 'circle_ping',
            circleScale: 0,
            circleFillOpacity: 0,
            lineProgress: 0,
            horizProgress: 0,
            textCharCount: 0
        });
    }

    /**
     * データを取得
     */
    getCallouts() {
        return this.callouts;
    }

    /**
     * ラベルリストを更新
     */
    setLabels(newLabels) {
        this.labels = newLabels;
    }
}
