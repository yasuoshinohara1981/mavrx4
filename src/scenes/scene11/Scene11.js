/**
 * Scene11: シーンのテンプレート
 */

import { SceneTemplate } from '../SceneTemplate.js';

export class Scene11 extends SceneTemplate {
    constructor(renderer, camera, sharedResourceManager = null) {
        super(renderer, camera, sharedResourceManager);
        this.title = 'mathym | Scene11';
        this.sceneNumber = 11;
        this.kitNo = 11;  // キット番号を設定
        
        // ============================================
        // ここにシーン固有のプロパティを定義
        // ============================================
    }
    
    /**
     * セットアップ処理（シーン切り替え時に呼ばれる）
     */
    async setup() {
        await super.setup();
        
        // ============================================
        // ここにシーン固有の初期化処理を記述
        // ============================================
    }
    
    /**
     * 更新処理（毎フレーム呼ばれる）
     */
    onUpdate(deltaTime) {
        super.onUpdate(deltaTime);
        
        // ============================================
        // ここにシーン固有の更新処理を記述
        // ============================================
    }
    
    /**
     * OSCメッセージの処理
     */
    handleTrackNumber(trackNumber, message) {
        super.handleTrackNumber(trackNumber, message);
        
        // ============================================
        // ここにトラック5-9の処理を記述
        // ============================================
    }
    
    /**
     * リセット処理
     */
    reset() {
        super.reset();
        
        // ============================================
        // ここにシーン固有のリセット処理を記述
        // ============================================
    }
    
    /**
     * クリーンアップ処理
     */
    dispose() {
        // ============================================
        // ここにシーン固有のクリーンアップ処理を記述
        // ============================================
        
        super.dispose();
    }
}
