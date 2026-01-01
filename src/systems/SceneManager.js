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
    constructor(renderer, camera, sharedResourceManager = null) {
        this.renderer = renderer;
        this.camera = camera;
        this.sharedResourceManager = sharedResourceManager;
        this.scenes = [];
        this.currentSceneIndex = 0;
        this.onSceneChange = null;
        
        // HUDの状態をグローバルに保持（シーン切り替えに関係なく保持）
        this.globalShowHUD = true;
        
        // シーンを初期化
        this.initScenes();
    }
    
    initScenes() {
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
        
        // デフォルトシーンを設定（非同期）
        if (this.scenes.length > 0) {
            this.scenes[0].setup().catch(err => {
                console.error('シーンのセットアップエラー:', err);
            });
        }
    }
    
    switchScene(index) {
        if (index < 0 || index >= this.scenes.length) {
            console.warn(`シーンインデックス ${index} は無効です`);
            return;
        }
        
        // 同じシーンへの切り替えは無視
        if (index === this.currentSceneIndex) {
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
                            if (index === 3 && newScene.updateInitialColors) {
                                newScene.updateInitialColors();
                            }
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
        const scene = this.scenes[this.currentSceneIndex];
        if (scene) {
            scene.handleOSC(message);
        }
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

