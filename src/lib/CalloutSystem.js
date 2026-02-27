/**
 * CalloutSystem Class
 * 2D HUDレイヤー／3Dシーンに表示されるメカニカルな注釈（コールアウト）を管理するクラス
 * 2Dコードは残したまま、3D化にも対応
 */
import * as THREE from 'three';

export class CalloutSystem {
    constructor() {
        this.callouts = [];
        this.lastCalloutTime = 0;
        this.scene = null;
        this.callout3DGroup = new THREE.Group();
        this.use3DCallouts = false; // true のとき worldPos 付きコールアウトは3Dメッシュで表示
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

            // フェードアウト（寿命の最後の30%を使って滑らかに消える）
            const fadeOutThreshold = callout.maxLife * 0.3;
            if (callout.life < fadeOutThreshold) {
                callout.opacity = Math.max(0, callout.life / fadeOutThreshold);
            } else if (elapsed > 0.05 && isVisible) {
                callout.opacity = 1.0;
            } else if (!isVisible) {
                callout.opacity = 0;
            }

            // 強制的に透明度を0にする（寿命が尽きた場合）
            if (callout.life <= 0) {
                callout.opacity = 0;
                if (callout.mesh3D) {
                    this.disposeCallout3DMesh(callout);
                }
                this.callouts.splice(i, 1);
            } else if (callout.mesh3D) {
                this.updateCallout3DMesh(callout);
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
        let pos = worldPos ? worldPos.clone() : null;
        if (!pos) {
            const width = window.innerWidth;
            const height = window.innerHeight;
            x = margin + Math.random() * (width - margin * 2);
            y = margin + Math.random() * (height - margin * 2);
        } else if (this.use3DCallouts) {
            // 3D化時：Z位置をランダマイズ（球体付近で ±150 程度）
            pos.z += (Math.random() - 0.5) * 300;
        }

        const callout = {
            x: x || 0,
            y: y || 0,
            worldPos: pos,
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
            textCharCount: 0,
            use3D: false,
            mesh3D: null
        };

        // 3Dコールアウト：worldPos あり & use3DCallouts & scene あり
        if (this.use3DCallouts && pos && this.scene) {
            callout.use3D = true;
            const mesh = this.createCallout3DMesh(callout);
            mesh.position.copy(pos);
            this.callout3DGroup.add(mesh);
            callout.mesh3D = mesh;
        }

        this.callouts.push(callout);
    }

    /**
     * 2D用コールアウトデータを取得（3Dコールアウトは除外）
     */
    getCallouts() {
        return this.callouts.filter(c => !c.use3D);
    }

    /**
     * ラベルリストを更新
     */
    setLabels(newLabels) {
        this.labels = newLabels;
    }

    /**
     * 3Dコールアウト用にシーンを設定（3D化する場合に呼ぶ）
     */
    setScene(scene) {
        if (this.scene) {
            this.scene.remove(this.callout3DGroup);
        }
        this.scene = scene;
        if (this.scene) {
            this.scene.add(this.callout3DGroup);
        }
    }

    /**
     * 3Dコールアウトを使用するかどうか
     */
    setUse3DCallouts(use) {
        this.use3DCallouts = !!use;
    }

    /**
     * 3Dコールアウト用メッシュを生成（ワールドZ向き、球体付近のスケール）
     */
    createCallout3DMesh(callout) {
        const group = new THREE.Group();
        const scale3D = 5; // 球体半径1300に対して小さめ
        const r = callout.radius * scale3D;
        const lineLen = callout.lineLen * scale3D;
        const horizLen = callout.horizLen * scale3D;
        const dirX = callout.dirX;
        const dirY = callout.dirY;

        // 1. 丸◯（線のみ）RingGeometry
        const ringGeo = new THREE.RingGeometry(r * 0.85, r, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        group.add(ringMesh);
        group.userData.ring = ringMesh;

        // 2. 赤い塗り用（CircleGeometry）
        const fillGeo = new THREE.CircleGeometry(r, 32);
        const fillMat = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false
        });
        const fillMesh = new THREE.Mesh(fillGeo, fillMat);
        fillMesh.visible = false;
        group.add(fillMesh);
        group.userData.fill = fillMesh;

        // 3. 斜め線（Line）
        const angle = Math.PI / 4;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const diagStart = new THREE.Vector3(dirX * r * cosA, dirY * r * sinA, 0);
        const diagPoints = [
            diagStart.clone(),
            new THREE.Vector3(dirX * (r + lineLen) * cosA, dirY * (r + lineLen) * sinA, 0)
        ];
        const diagGeo = new THREE.BufferGeometry().setFromPoints(diagPoints);
        const diagMat = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            depthWrite: false
        });
        const diagMesh = new THREE.Line(diagGeo, diagMat);
        group.add(diagMesh);
        group.userData.diag = diagMesh;
        group.userData.diagLen = lineLen;
        group.userData.diagStart = diagStart.clone();

        // 4. 水平線（Line）
        const tipX = dirX * (r + lineLen) * cosA;
        const tipY = dirY * (r + lineLen) * sinA;
        const horizTip = new THREE.Vector3(tipX, tipY, 0);
        const horizPoints = [
            horizTip.clone(),
            new THREE.Vector3(tipX + dirX * horizLen, tipY, 0)
        ];
        const horizGeo = new THREE.BufferGeometry().setFromPoints(horizPoints);
        const horizMat = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            depthWrite: false
        });
        const horizMesh = new THREE.Line(horizGeo, horizMat);
        group.add(horizMesh);
        group.userData.horiz = horizMesh;
        group.userData.horizTip = horizTip.clone();
        group.userData.horizEnd = new THREE.Vector3(tipX + dirX * horizLen, tipY, 0);

        // 5. テキスト（CanvasTexture）
        const canvas = document.createElement('canvas');
        canvas.width = 560;
        canvas.height = 140;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 56px Courier New';
        ctx.textAlign = dirX > 0 ? 'left' : 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(callout.labelText, dirX > 0 ? 28 : 532, 70);
        const textTex = new THREE.CanvasTexture(canvas);
        textTex.needsUpdate = true;
        const textPlaneW = horizLen * 0.8;
        const textPlaneH = 100;
        const textGeo = new THREE.PlaneGeometry(textPlaneW, textPlaneH);
        const textMat = new THREE.MeshBasicMaterial({
            map: textTex,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const textMesh = new THREE.Mesh(textGeo, textMat);
        textMesh.position.set(tipX + dirX * horizLen + dirX * 50, tipY, 0);
        textMesh.scale.set(1.2, 1.2, 1.2);
        textMesh.visible = false;
        group.add(textMesh);
        group.userData.text = textMesh;
        group.userData.textCtx = ctx;
        group.userData.textCanvas = canvas;
        group.userData.labelText = callout.labelText;
        group.userData.dirX = dirX;

        // ワールドZ向き（カメラ側を向く）
        group.rotation.y = Math.PI;

        // 他オブジェクトより手前に描画（視認性アップ）
        group.renderOrder = 1000;
        group.traverse((child) => {
            if (child.material) child.material.depthTest = false;
        });

        return group;
    }

    /**
     * 3Dメッシュをアニメーション状態に合わせて更新
     */
    updateCallout3DMesh(callout) {
        const g = callout.mesh3D;
        if (!g || !g.userData) return;

        const opacity = callout.opacity;
        const ring = g.userData.ring;
        const fill = g.userData.fill;
        const diag = g.userData.diag;
        const horiz = g.userData.horiz;
        const text = g.userData.text;

        if (ring && ring.material) {
            ring.material.opacity = opacity;
            ring.scale.setScalar(callout.circleScale);
        }
        if (fill && fill.material) {
            fill.material.opacity = callout.circleFillOpacity * opacity;
            fill.visible = callout.circleFillOpacity > 0;
            fill.scale.setScalar(callout.circleScale);
        }
        // 斜め線：頂点を更新して伸びる表現
        if (diag && g.userData.diagStart && g.userData.diagLen) {
            const start = g.userData.diagStart;
            const len = g.userData.diagLen * callout.lineProgress;
            const angle = Math.PI / 4;
            const dirX = callout.dirX;
            const dirY = callout.dirY;
            const endX = start.x + dirX * len * Math.cos(angle);
            const endY = start.y + dirY * len * Math.sin(angle);
            const pos = diag.geometry.attributes.position;
            if (pos) {
                pos.setXYZ(0, start.x, start.y, 0);
                pos.setXYZ(1, endX, endY, 0);
                pos.needsUpdate = true;
            }
            diag.material.opacity = opacity;
        }
        // 水平線：頂点を更新
        if (horiz && horiz.geometry && g.userData.horizTip && g.userData.horizEnd) {
            const pos = horiz.geometry.attributes.position;
            const tip = g.userData.horizTip;
            const end = g.userData.horizEnd;
            const t = callout.horizProgress;
            const currX = tip.x + (end.x - tip.x) * t;
            if (pos) {
                pos.setXYZ(0, tip.x, tip.y, 0);
                pos.setXYZ(1, currX, tip.y, 0);
                pos.needsUpdate = true;
            }
            horiz.material.opacity = opacity;
        }
        if (text) {
            text.visible = callout.textCharCount > 0;
            text.material.opacity = opacity;
            if (callout.textCharCount > 0 && g.userData.textCtx) {
                const ctx = g.userData.textCtx;
                const displayText = callout.labelText.substring(0, callout.textCharCount);
                ctx.clearRect(0, 0, g.userData.textCanvas.width, g.userData.textCanvas.height);
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 56px Courier New';
                ctx.textAlign = g.userData.dirX > 0 ? 'left' : 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(displayText, g.userData.dirX > 0 ? 28 : 532, 70);
                text.material.map.needsUpdate = true;
            }
        }

        g.visible = opacity > 0.01;
    }

    /**
     * 3Dメッシュを破棄
     */
    disposeCallout3DMesh(callout) {
        if (!callout.mesh3D) return;
        const g = callout.mesh3D;
        this.callout3DGroup.remove(g);
        g.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        });
        callout.mesh3D = null;
    }
}
