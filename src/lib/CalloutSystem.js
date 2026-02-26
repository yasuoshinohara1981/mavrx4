/**
 * CalloutSystem Class
 * 2D HUDレイヤーに表示されるメカニカルな注釈（コールアウト）を管理するクラス
 */
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
    update(deltaTime, time, options = {}) {
        const {
            interval = 1.5,
            maxCount = 8,
            margin = 200
        } = options;

        // 一定間隔でランダムに生成
        if (time - this.lastCalloutTime > interval + Math.random() * interval) {
            if (this.callouts.length < maxCount) {
                this.createCallout(margin, time);
                this.lastCalloutTime = time;
            }
        }

        // コールアウトの寿命管理
        for (let i = this.callouts.length - 1; i >= 0; i--) {
            const callout = this.callouts[i];
            const elapsed = time - callout.startTime;
            callout.life -= deltaTime;
            
            // --- アニメーション状態の更新 ---
            // 1. ◯のピピピ（0.0s - 0.6s）
            if (elapsed < 0.6) {
                callout.animState = 'circle_ping';
                // 0.2sごとに大きくなったり小さくなったり
                const ping = (elapsed % 0.2) / 0.2;
                callout.circleScale = 0.5 + Math.sin(ping * Math.PI) * 0.8;
                callout.opacity = 0.8;
                callout.circleFillOpacity = 0;
            } 
            // 2. 確定と赤い塗り（0.6s - 0.8s）
            else if (elapsed < 0.8) {
                callout.animState = 'circle_fix';
                callout.circleScale = 1.0;
                callout.circleFillOpacity = (elapsed - 0.6) / 0.2 * 0.3; // 透明度のある赤塗りへ
                callout.lineProgress = 0;
            }
            // 3. 斜め線ニュニュニュ（0.8s - 1.2s）
            else if (elapsed < 1.2) {
                callout.animState = 'line_diag';
                callout.lineProgress = (elapsed - 0.8) / 0.4;
                callout.horizProgress = 0;
            }
            // 4. 水平線ニュニュニュ（1.2s - 1.6s）
            else if (elapsed < 1.6) {
                callout.animState = 'line_horiz';
                callout.lineProgress = 1.0;
                callout.horizProgress = (elapsed - 1.2) / 0.4;
                callout.textCharCount = 0;
            }
            // 5. テキスト1文字ずつ（1.6s - 2.5s）
            else if (elapsed < 2.5) {
                callout.animState = 'text_typing';
                callout.horizProgress = 1.0;
                const textElapsed = elapsed - 1.6;
                callout.textCharCount = Math.floor(textElapsed * 15); // 1秒間に15文字
            }
            // 6. 表示維持
            else {
                callout.animState = 'idle';
                callout.textCharCount = callout.labelText.length;
            }

            // フェードアウト（寿命が尽きる直前）
            if (callout.life < 0.5) {
                callout.opacity = callout.life / 0.5;
            } else if (elapsed > 0.1) {
                callout.opacity = 1.0;
            }

            if (callout.life <= 0) {
                this.callouts.splice(i, 1);
            }
        }
    }

    /**
     * コールアウトを生成
     */
    createCallout(margin = 200, time = 0) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        const x = margin + Math.random() * (width - margin * 2);
        const y = margin + Math.random() * (height - margin * 2);

        this.callouts.push({
            x: x,
            y: y,
            radius: 10 + Math.random() * 10,
            lineLen: 40 + Math.random() * 40,
            horizLen: 60 + Math.random() * 60,
            dirX: Math.random() > 0.5 ? 1 : -1,
            dirY: Math.random() > 0.5 ? 1 : -1,
            labelText: this.labels[Math.floor(Math.random() * this.labels.length)],
            startTime: time,
            life: 5.0 + Math.random() * 2.0,
            maxLife: 5.0 + Math.random() * 2.0,
            opacity: 0,
            
            // アニメーション用プロパティ
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
