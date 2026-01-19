/**
 * シーンマネージャー
 * 複数のシーンを管理し、切り替えを制御
 */

import { SceneBase } from '../scenes/SceneBase.js';
import { Scene01 } from '../scenes/scene01/Scene01.js';
import { Scene02 } from '../scenes/scene02/Scene02.js';
import { Scene03 } from '../scenes/scene03/Scene03.js';
import { Scene04 } from '../scenes/scene04/Scene04.js';
import { Scene05 } from '../scenes/scene05/Scene05.js';
import { Scene06 } from '../scenes/scene06/Scene06.js';
import { Scene07 } from '../scenes/scene07/Scene07.js';
import { Scene08 } from '../scenes/scene08/Scene08.js';
import { Scene09 } from '../scenes/scene09/Scene09.js';
import { Scene10 } from '../scenes/scene10/Scene10.js';
import { Scene11 } from '../scenes/scene11/Scene11.js';

export class SceneManager {
    constructor(renderer, camera, sharedResourceManager = null, options = {}) {
        this.renderer = renderer;
        this.camera = camera;
        this.sharedResourceManager = sharedResourceManager;
        this.scenes = [];
        this.currentSceneIndex = 0;
        this.onSceneChange = null;
        
        // 開発モード/ライブモードの設定
        this.isDevelopmentMode = options.isDevelopmentMode || false;
        
        // デフォルトシーンのインデックス（ハードコーディング、Scene01 = 0）
        this.defaultSceneIndex = options.defaultSceneIndex !== undefined ? options.defaultSceneIndex : 0;
        
        // HUDの状態をグローバルに保持（シーン切り替えに関係なく保持）
        this.globalShowHUD = true;
        
        // 選択されたキット番号（OSCの/kit/メッセージで受け取る値）
        this.selectedKitNo = 0;
        
        // シーンを初期化
        this.initScenes();
    }
    
    /**
     * シーンを作成する（遅延ロード用）
     */
    createScene(index) {
        if (this.scenes[index]) {
            // 既に作成されている場合は何もしない
            return this.scenes[index];
        }
        
        let scene = null;
        switch (index) {
            case 0:
                scene = new Scene01(this.renderer, this.camera, this.sharedResourceManager);
                break;
            case 1:
                scene = new Scene02(this.renderer, this.camera);
                break;
            case 2:
                scene = new Scene03(this.renderer, this.camera, this.sharedResourceManager);
                break;
            case 3:
                scene = new Scene04(this.renderer, this.camera, this.sharedResourceManager);
                break;
            case 4:
                scene = new Scene05(this.renderer, this.camera);
                break;
            case 5:
                scene = new Scene06(this.renderer, this.camera);
                break;
            case 6:
                scene = new Scene07(this.renderer, this.camera);
                break;
            case 7:
                scene = new Scene08(this.renderer, this.camera);
                break;
            case 8:
                scene = new Scene09(this.renderer, this.camera, this.sharedResourceManager);
                break;
            case 9:
                scene = new Scene10(this.renderer, this.camera, this.sharedResourceManager);
                break;
            case 10:
                scene = new Scene11(this.renderer, this.camera, this.sharedResourceManager);
                break;
            default:
                console.warn(`無効なシーンインデックス: ${index}`);
                return null;
        }
        
        if (scene) {
            this.scenes[index] = scene;
            console.log(`[SceneManager] シーン ${index + 1} を遅延ロードしました`);
        }
        
        return scene;
    }
    
    initScenes() {
        if (this.isDevelopmentMode) {
            // 開発モード: デフォルトシーンのみ読み込み
            console.log(`[SceneManager] 開発モード: デフォルトシーン（Scene ${this.defaultSceneIndex + 1}）のみ読み込み`);
            this.createScene(this.defaultSceneIndex);
            this.currentSceneIndex = this.defaultSceneIndex;
        } else {
            // ライブモード: 全てのシーンをプリロード
            console.log('[SceneManager] ライブモード: 全てのシーンをプリロード');
            // シーンを追加（Processingと同じ順序）
            // シーン1と3は共有リソースマネージャーを使用
            this.scenes.push(new Scene01(this.renderer, this.camera, this.sharedResourceManager));
            this.scenes.push(new Scene02(this.renderer, this.camera));
            this.scenes.push(new Scene03(this.renderer, this.camera, this.sharedResourceManager));
            this.scenes.push(new Scene04(this.renderer, this.camera, this.sharedResourceManager));
            this.scenes.push(new Scene05(this.renderer, this.camera));
            this.scenes.push(new Scene06(this.renderer, this.camera));
            this.scenes.push(new Scene07(this.renderer, this.camera));
            this.scenes.push(new Scene08(this.renderer, this.camera));
            this.scenes.push(new Scene09(this.renderer, this.camera, this.sharedResourceManager));
            this.scenes.push(new Scene10(this.renderer, this.camera, this.sharedResourceManager));
            this.scenes.push(new Scene11(this.renderer, this.camera, this.sharedResourceManager));
            
            // デフォルトシーンに設定
            this.currentSceneIndex = this.defaultSceneIndex;
        }
        
        // デフォルトシーンを設定（非同期）
        if (this.scenes[this.currentSceneIndex]) {
            // デフォルトシーンにインデックスを設定
            this.scenes[this.currentSceneIndex].sceneIndex = this.currentSceneIndex;
            this.scenes[this.currentSceneIndex].setup().catch(err => {
                console.error('シーンのセットアップエラー:', err);
            });
        }
    }
    
    switchScene(index) {
        // 開発モードの場合、まだ作成されていないシーンは遅延ロード
        if (!this.scenes[index]) {
            if (this.isDevelopmentMode) {
                console.log(`[SceneManager] 開発モード: シーン ${index + 1} を遅延ロードします`);
                this.createScene(index);
            } else {
                // ライブモードでシーンが存在しない場合はエラー
                console.warn(`シーンインデックス ${index} は無効です`);
                return;
            }
        }
        
        // インデックスの範囲チェック（遅延ロード後）
        if (index < 0 || !this.scenes[index]) {
            console.warn(`シーンインデックス ${index} は無効です`);
            return;
        }
        
        // 同じシーンへの切り替えは無視
        if (index === this.currentSceneIndex && this.scenes[index]) {
            console.log(`既にシーン ${index + 1} がアクティブです`);
            return;
        }
        
        try {
            // 現在のシーンを非アクティブ化（全てのシーンで同じ処理）
        if (this.scenes[this.currentSceneIndex]) {
            const oldScene = this.scenes[this.currentSceneIndex];
            
                // シーン固有の要素をクリーンアップ（ミサイル、テキスト、Canvasなど）
                if (oldScene.cleanupSceneSpecificElements) {
                    oldScene.cleanupSceneSpecificElements();
                } else if (oldScene.dispose) {
                    // cleanupSceneSpecificElementsがなければ、dispose()を呼ぶ（GPUパーティクル以外をクリーンアップ）
                oldScene.dispose();
            }
            
                // 共有リソースを使っている場合は非アクティブ化のみ（メモリ上には保持）
                if (oldScene.setResourceActive) {
                    oldScene.setResourceActive(false);
                }
                
                console.log(`古いシーン（${oldScene.title}）を非アクティブ化`);
            }
        } catch (err) {
            console.error('シーン切り替え時のクリーンアップエラー:', err);
            // エラーが発生してもシーン切り替えは続行
        }
        
        // シーンを切り替え
        this.currentSceneIndex = index;
        const newScene = this.scenes[this.currentSceneIndex];
        
        if (newScene) {
            // シーンにインデックスを設定（HUD表示用）
            newScene.sceneIndex = index;
            
            // HUDの状態をグローバル状態に合わせる（シーン切り替え時）
            newScene.showHUD = this.globalShowHUD;
            
            // 共有リソースを使っている場合は即座にアクティブ化（表示を開始）
            // setup()は非同期で実行されるため、ブロッキングしない
            if (newScene.setResourceActive) {
                newScene.setResourceActive(true);
            }
            
            // 全てのシーンで同じ処理フロー（setupは軽量に保つ、非同期で実行）
            // setup()を非同期で実行し、完了後に後処理を実行
            requestAnimationFrame(() => {
                newScene.setup().catch(err => {
                    console.error('シーンのセットアップエラー:', err);
                }).then(() => {
                    // HUDの状態を再度設定（setup()後に確実に適用）
                    newScene.showHUD = this.globalShowHUD;
                    
                    // コールバックを呼び出し
                    if (this.onSceneChange) {
                        this.onSceneChange(newScene.title || `Scene ${index + 1}`);
                    }
                    
                    console.log(`シーン切り替え: ${newScene.title || `Scene ${index + 1}`}`);
                    
                    // テクスチャのリセット処理は呼ばない（前のシーンの状態を保持）
                    // シーン固有の後処理を実行（非同期で実行）
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            // シーン4の場合は、初期色を再計算
                            // if (index === 3 && newScene.updateInitialColors) {
                            //     newScene.updateInitialColors();
                            // }
                            // シーン10の場合は、初期色を再計算
                            if (index === 9 && newScene.updateInitialColors) {
                                newScene.updateInitialColors();
                            }
                        });
                    });
                }).catch(err => {
                    console.error('シーン切り替えエラー:', err);
                });
            });
        }
    }
    
    update(deltaTime) {
        const scene = this.scenes[this.currentSceneIndex];
        if (scene) {
            scene.update(deltaTime);
        }
    }
    
    render() {
        const scene = this.scenes[this.currentSceneIndex];
        if (scene) {
            scene.render();
        }
    }
    
    handleOSC(message) {
        // /kit/メッセージを処理（シーン切り替えを伴うため、SceneManagerで処理）
        if (message.address === '/kit/' || message.address === '/kit') {
            const args = message.args || [];
            if (args.length > 0) {
                const kitValue = typeof args[0] === 'number' ? args[0] : parseFloat(args[0]);
                if (!isNaN(kitValue)) {
                    const kitNo = Math.floor(kitValue);
                    this.selectedKitNo = kitNo;
                    console.log(`[SceneManager] Kit number received: ${kitNo}, switching scene...`);
                    
                    // 該当するkitNoを持つシーンを探して切り替え
                    this.switchSceneByKitNo(kitNo);
                }
            }
            return;  // 処理済み（シーン切り替えが発生するため、現在のシーンのhandleOSCは呼ばない）
        }
        
        // その他のOSCメッセージは現在のシーンに転送
        const scene = this.scenes[this.currentSceneIndex];
        if (scene) {
            scene.handleOSC(message);
        }
    }
    
    /**
     * キット番号でシーンを切り替え
     * @param {number} kitNo - キット番号
     */
    switchSceneByKitNo(kitNo) {
        // 全シーンを確認して、該当するkitNoを持つシーンを探す
        for (let i = 0; i < this.scenes.length; i++) {
            const scene = this.scenes[i];
            if (scene && scene.kitNo === kitNo) {
                console.log(`[SceneManager] Found scene with kitNo ${kitNo} at index ${i}, switching...`);
                this.switchScene(i);
                return;
            }
        }
        
        // 該当するシーンが見つからない場合
        console.warn(`[SceneManager] Scene with kitNo ${kitNo} not found`);
    }
    
    onResize() {
        const scene = this.scenes[this.currentSceneIndex];
        if (scene && scene.onResize) {
            scene.onResize();
        }
    }
    
    /**
     * 現在のシーンを取得
     */
    getCurrentScene() {
        return this.scenes[this.currentSceneIndex] || null;
    }
}

