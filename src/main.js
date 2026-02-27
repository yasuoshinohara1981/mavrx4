/**
 * Three.js MAVRX4 Live Visual
 * メインエントリーポイント
 */

import * as THREE from 'three';
import { OSCManager } from './systems/OSCManager.js';
import { SceneManager } from './systems/SceneManager.js';
import { SharedResourceManager } from './lib/SharedResourceManager.js';

// ============================================
// 設定
// ============================================

// 開発モード/ライブモードの設定
// true: 開発モード（デフォルトシーンのみ読み込み）
// false: ライブモード（全てのシーンをプリロード）
const IS_DEVELOPMENT_MODE = false;  // 開発時は true に変更

// デフォルトシーンのインデックス（0 = Scene01, 1 = Scene02, ...）
const DEFAULT_SCENE_INDEX = 17;  // Scene18をデフォルトに設定

// ============================================
// 初期化
// ============================================

let renderer, camera, scene;
let sceneManager;
let oscManager;
let sharedResourceManager;

// アニメーションループ用
let time = 0;
let lastTime = performance.now();
let frameCount = 0;

// キー入力管理
let ctrlPressed = false;

// ============================================
// レンダラーの初期化
// ============================================

function initRenderer() {
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true  // Canvas 2D で drawImage するために必要
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Retina 3x を 2x にキャップして軽量化（パフォーマンス優先）
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000);
    document.body.appendChild(renderer.domElement);
    
    // マウスカーソルを常に非表示にする
    document.body.style.cursor = 'none';
    renderer.domElement.style.cursor = 'none';
}

// ============================================
// カメラの初期化
// ============================================

function initCamera() {
    // Processing版のデフォルトFOVは60度
    // Three.jsのFOVを60度に変更（75度 → 60度）
    camera = new THREE.PerspectiveCamera(
        60,  
        window.innerWidth / window.innerHeight,
        1.0,  // 0.1 -> 1.0
        100000 // 50000 -> 100000 にさらに拡大！
    );
    camera.position.z = 1000;
}

// ============================================
// OSC管理の初期化
// ============================================

function initOSC() {
    oscManager = new OSCManager({
        wsUrl: 'ws://localhost:8080',  // WebSocketサーバーのURL
        onMessage: (message) => {
            // シーンマネージャーにOSCメッセージを転送
            if (sceneManager) {
                sceneManager.handleOSC(message);
            }
        },
        onStatusChange: (status) => {
            document.getElementById('oscStatus').textContent = status;
            // 現在のシーンにOSC状態を設定
            if (sceneManager) {
                const currentScene = sceneManager.getCurrentScene();
                if (currentScene) {
                    currentScene.setOSCStatus(status);
                }
            }
        }
    });
}

// ============================================
// 共有リソースマネージャーの初期化
// ============================================

async function initSharedResourceManager() {
    sharedResourceManager = new SharedResourceManager(renderer);
    
    // 初期化（最大量のリソースを事前に作成）
    console.log('[main] 共有リソースマネージャーを初期化中...');
    await sharedResourceManager.init();
    console.log('[main] 共有リソースマネージャー初期化完了');
}

// ============================================
// シーンマネージャーの初期化
// ============================================

function initSceneManager() {
    sceneManager = new SceneManager(renderer, camera, sharedResourceManager, {
        isDevelopmentMode: IS_DEVELOPMENT_MODE,
        defaultSceneIndex: DEFAULT_SCENE_INDEX
    });
    
    // モード表示
    if (IS_DEVELOPMENT_MODE) {
        console.log(`[main] 開発モード: デフォルトシーン（Scene ${DEFAULT_SCENE_INDEX + 1}）のみ読み込み`);
    } else {
        console.log('[main] ライブモード: 全てのシーンをプリロード');
    }
    
    // シーン切り替え時のコールバック
    sceneManager.onSceneChange = (sceneName) => {
        document.getElementById('sceneName').textContent = sceneName;
    };
}

// ============================================
// アニメーションループ
// ============================================

function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const deltaTime = (now - lastTime) / 1000.0;
    lastTime = now;
    time += deltaTime;

    // FPS計算
    frameCount++;
    if (frameCount % 60 === 0) {
        const fps = Math.round(1.0 / deltaTime);
        document.getElementById('fps').textContent = fps;
    }

    // シーンの更新
    if (sceneManager) {
        sceneManager.update(deltaTime);
        sceneManager.render();
    }
}

// ============================================
// リサイズ処理
// ============================================

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    if (sceneManager) {
        sceneManager.onResize();
    }
}

// ============================================
// フルスクリーン処理
// ============================================

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log('フルスクリーンエラー:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

// ============================================
// キーボード入力処理
// ============================================

/**
 * キーが押された時の処理（キーダウン）
 */
function handleKeyDown(e) {
    // Ctrlキーの状態を確認（e.ctrlKey/e.metaKeyを直接確認してより確実に）
    if (e.key === 'Control' || e.key === 'Meta') {
        ctrlPressed = true;
        return;
    }
    
    // e.ctrlKey/e.metaKeyを直接確認（より確実な検出）
    const isCtrlPressed = e.ctrlKey || e.metaKey;
    
    if (!sceneManager) return;
    
    const currentScene = sceneManager.getCurrentScene();
    if (!currentScene) return;
    
    // Ctrl + 数字キーでシーン切り替え（ctrlPressedまたはisCtrlPressedのどちらかがtrueの場合）
    if (ctrlPressed || isCtrlPressed) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9) {
            e.preventDefault();
            // Ctrl+数字キーで対応するシーンに切り替え（11始まりにする）
            // Ctrl+1=Scene11(index 10), Ctrl+2=Scene12(index 11), Ctrl+3=Scene13(index 12)...
            sceneManager.switchScene(num + 9);
            return;
            // Ctrl+8でScene18に切り替え（index 17）
            sceneManager.switchScene(17);
            return;
        } else if (e.key === '8' && isCtrlPressed) {
            e.preventDefault();
            // Ctrl+8でScene18に切り替え（index 17）
            sceneManager.switchScene(17);
            return;
        } else if (e.key === '0' && isCtrlPressed) {
            e.preventDefault();
            // Ctrl+0でScene20に切り替え（index 19）
            sceneManager.switchScene(19);
            return;
        } else if (e.key === '5') {
            e.preventDefault();
            // Ctrl+5でScene15に切り替え（index 14）
            sceneManager.switchScene(14);
            return;
        } else if (e.key === '7') {
            e.preventDefault();
            // Ctrl+7でScene17に切り替え（index 16）
            sceneManager.switchScene(16);
            return;
        }
        // Ctrl押下中は他の処理をスキップ（数字キーがエフェクトとして処理されないように）
        return;
    }
    
    // h/HキーでHUDのオンオフ（グローバル状態を更新）
    if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        // グローバル状態を更新
        if (sceneManager) {
            sceneManager.globalShowHUD = !sceneManager.globalShowHUD;
            // 現在のシーンにも適用
            currentScene.showHUD = sceneManager.globalShowHUD;
            console.log('HUD:', sceneManager.globalShowHUD ? 'ON' : 'OFF');
        } else {
            // フォールバック（sceneManagerがない場合）
            currentScene.showHUD = !currentScene.showHUD;
            console.log('HUD:', currentScene.showHUD ? 'ON' : 'OFF');
        }
        return;
    }
    
    // s/Sキーでスクリーンショット（正方形）
    if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (currentScene.takeScreenshot) {
            currentScene.takeScreenshot(false);  // false = 正方形
        }
        return;
    }
    
    // y/Yキーでスクリーンショット（16:9）
    if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        if (currentScene.takeScreenshot) {
            currentScene.takeScreenshot(true);  // true = 16:9
        }
        return;
    }
    
    // 数字キー1〜9でエフェクトのオン/オフをトグル（Ctrlが押されていない時のみ）
    const num = parseInt(e.key);
    if (!isNaN(num) && num >= 1 && num <= 9) {
        e.preventDefault();
        // エフェクトのオン/オフを切り替え
        if (currentScene.toggleEffect) {
            currentScene.toggleEffect(num);
        }
        return;
    }
    
    // 数字キー0はそのままOSCメッセージとして処理（10として扱う）
    if (e.key === '0') {
        e.preventDefault();
        const message = {
            trackNumber: 10,
            args: [],
            address: `/track/10`
        };
        currentScene.handleTrackNumber(10, message);
        return;
    }
    
    // r/Rキーでリセット
    if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (currentScene.reset) {
            currentScene.reset();
            console.log('Scene reset');
        }
        return;
    }
    
    // F11: フルスクリーン
    if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
    }
}

/**
 * キーが離された時の処理（キーアップ）
 */
function handleKeyUp(e) {
    // Ctrlキーの状態をリセット
    if (e.key === 'Control' || e.key === 'Meta') {
        ctrlPressed = false;
        return;
    }
    
    // e.ctrlKey/e.metaKeyがfalseになったら、ctrlPressedもリセット
    if (!e.ctrlKey && !e.metaKey) {
        ctrlPressed = false;
    }
    
    if (!sceneManager) return;
    
    const currentScene = sceneManager.getCurrentScene();
    if (!currentScene) return;
    
    // 数字キー0〜9の処理
    const num = parseInt(e.key);
    if (!isNaN(num) && num >= 0 && num <= 9) {
        let trackNumber = num;
        if (trackNumber === 0) {
            trackNumber = 10;  // '0' → 10
        }
        
        // トラック2、3、4、5はキーが離された時にエフェクトを無効化
        if (trackNumber === 2 || trackNumber === 3 || trackNumber === 4 || trackNumber === 5) {
            e.preventDefault();
            if (currentScene && currentScene.handleKeyUp) {
                currentScene.handleKeyUp(trackNumber);
            } else {
                console.warn('Scene does not have handleKeyUp method');
            }
            return;
        }
    }
    
    // その他のキーアップ処理
    if (e.key === 'l' || e.key === 'L') {
        // Lキーで線描画の切り替え
        currentScene.SHOW_LINES = !currentScene.SHOW_LINES;
        console.log('SHOW_LINES:', currentScene.SHOW_LINES);
    }
    
    if (e.key === 'p' || e.key === 'P') {
        // Pキーでパーティクル表示の切り替え
        currentScene.SHOW_PARTICLES = !currentScene.SHOW_PARTICLES;
        console.log('SHOW_PARTICLES:', currentScene.SHOW_PARTICLES);
    }
    
    // g/Gキーで3Dグリッドとルーラーの表示/非表示を切り替え
    if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        if (currentScene.gridRuler3D) {
            // 既に初期化されている場合は表示/非表示を切り替え
            currentScene.showGridRuler3D = !currentScene.showGridRuler3D;
            currentScene.gridRuler3D.setVisible(currentScene.showGridRuler3D);
            console.log('GridRuler3D:', currentScene.showGridRuler3D ? 'ON' : 'OFF');
        } else {
            // 初期化されていない場合はデフォルトパラメータで初期化
            currentScene.showGridRuler3D = true;
            currentScene.initGridRuler3D({
                center: { x: 0, y: 0, z: 0 },
                size: { x: 1000, y: 1000, z: 1000 },
                floorY: -500,
                floorSize: 2000,
                floorDivisions: 40,
                labelMax: 64
            });
            console.log('GridRuler3D: 初期化して表示しました');
        }
    }
    
    // c/Cキーでカメラデバッグ表示の切り替え（Scene04専用）
    if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        if (currentScene.handleKeyPress) {
            currentScene.handleKeyPress(e.key);
        }
    }
}

/**
 * キー状態をリセット（ウィンドウがフォーカスを失った時などに呼ぶ）
 */
function resetKeyStates() {
    ctrlPressed = false;
}

/**
 * ウィンドウがフォーカスを失った時の処理
 */
function handleWindowBlur() {
    resetKeyStates();
    console.log('Window blur: キー状態をリセット');
}

/**
 * ページの可視性が変わった時の処理
 */
function handleVisibilityChange() {
    if (document.hidden) {
        resetKeyStates();
        console.log('Page hidden: キー状態をリセット');
    }
}

// キーイベントリスナーを登録
document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);

// ウィンドウのフォーカス状態を監視
window.addEventListener('blur', handleWindowBlur);
document.addEventListener('visibilitychange', handleVisibilityChange);

// ============================================
// 初期化と起動
// ============================================

async function init() {
    initRenderer();
    initCamera();
    initOSC();
    
    // 共有リソースマネージャーを先に初期化（重い初期化を最初に実行）
    await initSharedResourceManager();
    
    // その後、シーンマネージャーを初期化
    initSceneManager();
    
    window.addEventListener('resize', onWindowResize);
    
    // デフォルトでフルスクリーンにする
    // ユーザー操作が必要なため、少し遅延させる
    setTimeout(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log('フルスクリーンエラー（自動起動失敗）:', err);
                console.log('F11キーで手動フルスクリーンにできます');
            });
        }
    }, 500);
    
    // アニメーション開始
    animate();
    
    console.log('Three.js MAVRX4 Live Visual 起動完了');
}

// DOM読み込み後に初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

