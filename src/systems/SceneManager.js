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

export class SceneManager {
    constructor(renderer, camera) {
        this.renderer = renderer;
        this.camera = camera;
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
        this.scenes.push(new Scene01(this.renderer, this.camera));
        this.scenes.push(new Scene02(this.renderer, this.camera));
        this.scenes.push(new Scene03(this.renderer, this.camera));
        this.scenes.push(new Scene04(this.renderer, this.camera));
        this.scenes.push(new Scene05(this.renderer, this.camera));
        this.scenes.push(new Scene06(this.renderer, this.camera));
        this.scenes.push(new Scene07(this.renderer, this.camera));
        this.scenes.push(new Scene08(this.renderer, this.camera));
        this.scenes.push(new Scene09(this.renderer, this.camera));
        this.scenes.push(new Scene10(this.renderer, this.camera));
        
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
        
        // 現在のシーンをクリーンアップ（dispose処理を追加）
        if (this.scenes[this.currentSceneIndex]) {
            const oldScene = this.scenes[this.currentSceneIndex];
            
            // dispose処理があれば実行（メモリリークを防ぐ）
            if (oldScene.dispose) {
                console.log(`古いシーン（${oldScene.title}）をクリーンアップ中...`);
                oldScene.dispose();
            }
            
            // リセット処理は呼ばない（setup()で再初期化されるため、二重初期化を防ぐ）
            // oldScene.reset();
        }
        
        // シーンを切り替え
        this.currentSceneIndex = index;
        const newScene = this.scenes[this.currentSceneIndex];
        
        if (newScene) {
            // HUDの状態をグローバル状態に合わせる（シーン切り替え時）
            newScene.showHUD = this.globalShowHUD;
            
            // 非同期セットアップ
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

