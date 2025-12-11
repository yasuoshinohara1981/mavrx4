/**
 * SceneTemplate: シーンのテンプレート
 * 新しいシーンを作成する際は、このファイルをコピーして使用してください
 */

import { SceneBase } from './SceneBase.js';
import * as THREE from 'three';

export class SceneTemplate extends SceneBase {
    constructor(renderer, camera) {
        super(renderer, camera);
        this.title = 'Scene Template';  // シーンのタイトルを設定
        
        // ============================================
        // ここにシーン固有のプロパティを定義
        // ============================================
        // 例：
        // this.particles = [];
        // this.time = 0.0;
        // this.parameter1 = 100.0;
        
        // スクリーンショット用テキスト
        this.setScreenshotText(this.title);
    }
    
    /**
     * セットアップ処理（シーン切り替え時に呼ばれる）
     * 非同期処理（シェーダーの読み込みなど）を行う場合は async を使用
     */
    async setup() {
        // 親クラスのsetup()を呼ぶ（ColorInversionの初期化を含む）
        await super.setup();
        
        // カメラパーティクルの距離パラメータを再設定（必要に応じて）
        if (this.cameraParticles) {
            for (const cameraParticle of this.cameraParticles) {
                this.setupCameraParticleDistance(cameraParticle);
            }
        }
        
        // ============================================
        // ここにシーン固有の初期化処理を記述
        // ============================================
        // 例：
        // - パーティクルシステムの初期化
        // - ライトの追加
        // - 3Dオブジェクトの作成
        // - シェーダーの読み込み
        // - 背景グラデーションの初期化
    }
    
    /**
     * カメラパーティクルの距離パラメータを設定
     * シーンに応じてカメラの距離範囲を調整する場合はオーバーライド
     */
    setupCameraParticleDistance(cameraParticle) {
        // デフォルト値を使用（必要に応じて上書き）
        // 例：
        // cameraParticle.minDistance = 400.0;
        // cameraParticle.maxDistance = 1500.0;
        // cameraParticle.maxDistanceReset = 1000.0;
    }
    
    /**
     * 更新処理（毎フレーム呼ばれる）
     * @param {number} deltaTime - 前フレームからの経過時間（秒）
     */
    onUpdate(deltaTime) {
        // 時間の更新（必要に応じて）
        // this.time += deltaTime;
        // または
        // this.time += this.timeIncrement;
        // SceneBaseのtimeも更新（HUD表示用）
        // super.time = this.time;
        
        // ============================================
        // ここにシーン固有の更新処理を記述
        // ============================================
        // 例：
        // - パーティクルの更新
        // - アニメーションの更新
        // - パラメータの更新（LFOなど）
        // - エフェクトの更新
    }
    
    /**
     * 描画処理（オーバーライド）
     * 背景色の設定など、シーン固有の描画処理が必要な場合のみオーバーライド
     */
    render() {
        // 背景色を設定（必要に応じて）
        // this.renderer.setClearColor(0x000000);
        
        // SceneBaseのrenderメソッドを使用（色反転、glitch、chromaticAberrationを含む）
        super.render();
        
        // ============================================
        // ここにシーン固有の描画処理を記述（必要に応じて）
        // ============================================
        // 例：
        // - Canvas2Dでの描画
        // - 追加のレンダリング処理
    }
    
    /**
     * OSCメッセージの処理
     * トラック1-4はSceneBaseで処理されるため、トラック5以降を処理
     * @param {number} trackNumber - トラック番号（5-9）
     * @param {Object} message - OSCメッセージ
     */
    handleTrackNumber(trackNumber, message) {
        const args = message.args || [];
        
        // ============================================
        // ここにトラック5-9の処理を記述
        // ============================================
        // 例：
        // if (trackNumber === 5) {
        //     const velocity = args[0] || 127.0;
        //     const noteNumber = args[1] || 64.0;
        //     const durationMs = args[2] || 0.0;
        //     // トラック5の処理
        // }
        // else if (trackNumber === 6) {
        //     // トラック6の処理
        // }
    }
    
    /**
     * キーが押された時の処理（SceneBaseでトラック2,3,4を処理）
     * シーン固有のキー処理が必要な場合のみオーバーライド
     * @param {number} trackNumber - トラック番号
     */
    handleKeyDown(trackNumber) {
        // 親クラスのhandleKeyDownを呼ぶ（トラック2,3,4のエフェクトなど）
        super.handleKeyDown(trackNumber);
        
        // ============================================
        // ここにシーン固有のキー押下処理を記述（必要に応じて）
        // ============================================
    }
    
    /**
     * キーが離された時の処理（SceneBaseでトラック2,3,4を処理）
     * シーン固有のキー処理が必要な場合のみオーバーライド
     * @param {number} trackNumber - トラック番号
     */
    handleKeyUp(trackNumber) {
        // 親クラスのhandleKeyUpを呼ぶ（トラック2,3,4のエフェクトなど）
        super.handleKeyUp(trackNumber);
        
        // ============================================
        // ここにシーン固有のキー離上処理を記述（必要に応じて）
        // ============================================
    }
    
    /**
     * リセット処理
     */
    reset() {
        super.reset(); // TIMEをリセット
        
        // ============================================
        // ここにシーン固有のリセット処理を記述
        // ============================================
        // 例：
        // - パラメータのリセット
        // - パーティクルのクリア
        // - アニメーションのリセット
        // - オブジェクトの再初期化
    }
    
    /**
     * リサイズ処理
     */
    onResize() {
        // 親クラスのonResizeを呼ぶ（スクリーンショット用Canvasのリサイズ）
        super.onResize();
        
        // ============================================
        // ここにシーン固有のリサイズ処理を記述（必要に応じて）
        // ============================================
        // 例：
        // - Canvasのリサイズ
        // - EffectComposerのリサイズ
        // - シェーダーのリサイズ
    }
    
    /**
     * クリーンアップ処理（シーン切り替え時に呼ばれる）
     * Three.jsのオブジェクトを破棄してメモリリークを防ぐ
     */
    dispose() {
        console.log('SceneTemplate.dispose: クリーンアップ開始');
        
        // ============================================
        // ここにシーン固有のクリーンアップ処理を記述
        // ============================================
        // 例：
        // - パーティクルシステムの破棄
        // - 3Dオブジェクトの削除
        // - ライトの削除
        // - Canvasの削除
        // - イベントリスナーの削除
        
        console.log('SceneTemplate.dispose: クリーンアップ完了');
        
        // 親クラスのdisposeを呼ぶ（最後に呼ぶ）
        super.dispose();
    }
}
