# Three.js MAVRX4 Live Visual

GPUパーティクルシステムを使ったライブビジュアル。OSCでトラック情報を受信し、リアルタイムでビジュアルを生成します。

## 🚀 クイックスタート

### 1. 依存関係のインストール

```bash
npm install
```

### 2. OSCサーバーを起動（別ターミナル）

```bash
npm run osc-server
```

OSCサーバーが起動します：
- OSC受信ポート: `30337`（Processingと同じ）
- WebSocketポート: `8080`
- HTTPサーバーポート: `3001`（スクリーンショット保存用）

### 3. 開発サーバー起動（別ターミナル）

```bash
npm run dev
```

ブラウザで `http://localhost:3000` が自動的に開きます。

### 4. OSC送信テスト

Processingから以下のようにOSCメッセージを送信：

```processing
// Processing側
oscP5.send(
    new OscMessage("/track/1", 64.0, 127.0, 1000.0), 
    new NetAddress("127.0.0.1", 30337)  // OSCサーバーのポート
);
```

## 📁 プロジェクト構造

```
mavrx4/
├── index.html              # メインHTML
├── package.json            # 依存関係
├── vite.config.js          # Vite設定
├── osc-server.js           # OSCサーバー（Node.js）
├── src/
│   ├── main.js             # エントリーポイント
│   ├── scenes/
│   │   ├── SceneBase.js    # シーンの基底クラス
│   │   ├── scene01/        # Scene01関連ファイル
│   │   │   ├── Scene01.js
│   │   │   ├── Scene01_Explosion.js
│   │   │   ├── Scene01_Missile.js
│   │   │   └── Scene01_Scope.js
│   │   ├── scene02/        # Scene02関連ファイル
│   │   │   ├── Scene02.js
│   │   │   ├── Scene02_Connection.js
│   │   │   ├── Scene02_RedSphere.js
│   │   │   ├── Scene02_Scope.js
│   │   │   └── Scene02_YellowSphere.js
│   │   ├── scene03/        # Scene03関連ファイル
│   │   │   └── Scene03.js
│   │   └── scene07/        # Scene07関連ファイル
│   │       ├── Scene07.js
│   │       ├── Scene07_Building.js
│   │       ├── Scene07_BuildingSystem.js
│   │       └── Scene07_Explosion.js
│   ├── systems/
│   │   ├── OSCManager.js   # OSC通信管理
│   │   └── SceneManager.js # シーン管理
│   └── lib/                # ライブラリ
│       ├── BackgroundGradient.js
│       ├── CameraParticle.js
│       ├── ColorInversion.js
│       ├── GPUParticleSystem.js
│       ├── HUD.js
│       ├── InstancedMeshManager.js
│       ├── LFO.js
│       ├── Particle.js
│       └── RandomLFO.js
└── public/
    └── shaders/            # GLSLシェーダー
        ├── common/         # 共通シェーダー
        │   ├── chromaticAberration.frag
        │   ├── chromaticAberration.vert
        │   ├── colorInversion.frag
        │   ├── colorInversion.vert
        │   ├── glitch.frag
        │   └── glitch.vert
        ├── scene01/        # Scene01専用シェーダー
        ├── scene02/        # Scene02専用シェーダー
        ├── scene03/        # Scene03専用シェーダー
        └── scene07/        # Scene07専用シェーダー
```

## 🎮 使い方

### 開発モード

```bash
npm run dev
```

- ホットリロード対応
- コンソールでエラー確認
- OSCメッセージの受信確認

### 本番ビルド

```bash
npm run build
npm run preview
```

### キーボード操作

#### シーン切り替え
- **Ctrl + 1**: Scene01
- **Ctrl + 2**: Scene02
- **Ctrl + 3**: Scene03
- **Ctrl + 7**: Scene07
- **Ctrl + 0**: Scene10（未実装の場合は無効）

#### トラック処理（数字キー）
- **0**: トラック10
- **1**: カメラをランダムに切り替え（全シーン共通）
- **2**: 色反転エフェクト（キーを押している間のみ有効）
- **3**: 色収差エフェクト（キーを押している間のみ有効）
- **4**: グリッチエフェクト（キーを押している間のみ有効）
- **5**: シーン依存の処理
- **6-9**: OSCメッセージ送信（トラック6-9）

#### その他の操作
- **h/H**: HUDの表示/非表示を切り替え
- **s/S**: 正方形のスクリーンショットを撮影
- **y/Y**: 16:9のスクリーンショットを撮影
- **F11**: フルスクリーン切り替え
- **r/R**: シーンをリセット（キーを離した時）
- **l/L**: 線描画の表示/非表示を切り替え（キーを離した時）
- **p/P**: パーティクル表示の表示/非表示を切り替え（キーを離した時）

## 📡 OSC通信

### アーキテクチャ

ブラウザではUDPソケットが直接使えないため、以下の構成になっています：

1. **OSCサーバー** (`osc-server.js`): Node.jsでOSCメッセージを受信
2. **WebSocket**: OSCサーバーとブラウザを接続
3. **ブラウザ**: WebSocket経由でOSCメッセージを受信

### ポート設定

- **OSC受信ポート**: `30337`（Processingと同じ）
- **WebSocketポート**: `8080`
- **HTTPサーバーポート**: `3001`（スクリーンショット保存用、Viteが3000を使用するため）

変更する場合は `osc-server.js` を編集：

```javascript
const OSC_PORT = 30337;  // OSC受信ポート
const WS_PORT = 8080;    // WebSocketポート
const HTTP_PORT = 3001;  // HTTPサーバーポート（スクリーンショット保存用）
```

ブラウザ側のWebSocket URLを変更する場合は `src/main.js` を編集：

```javascript
oscManager = new OSCManager({
    wsUrl: 'ws://localhost:8080',  // ここを変更
    // ...
});
```

### OSCメッセージ形式

```
/track/{trackNumber} [noteNumber, velocity, duration]
```

例：
- `/track/1` `[64.0, 127.0, 1000.0]`
- `/track/2` `[60.0, 100.0, 500.0]`

## 🎨 シーン実装

### 実装済みシーン

- **Scene01**: 爆発とミサイルのパーティクルシステム
  - GPUパーティクルシステムを使用
  - 爆発エフェクトとミサイル軌道の可視化
  - スコープ表示機能

- **Scene02**: 接続線と球体のパーティクルシステム
  - パーティクル間の接続線描画
  - 赤と黄色の球体パーティクル
  - リアルタイムエフェクト対応

- **Scene03**: レーザースキャンとグラデーション背景
  - レーザースキャンエフェクト
  - グラデーション背景システム
  - GPUパーティクルシステム

- **Scene07**: ビルディングシステムと爆発エフェクト
  - インスタンス化されたメッシュによるビルディング生成
  - 爆発エフェクトシステム
  - 動的なビルディング生成・破壊

### 新しいシーンを追加する場合

1. `src/scenes/sceneXX/SceneXX.js` を作成
2. `SceneBase` を継承
3. `SceneManager.js` に追加

```javascript
// src/scenes/sceneXX/SceneXX.js
import { SceneBase } from '../SceneBase.js';
import * as THREE from 'three';

export class SceneXX extends SceneBase {
    constructor(renderer, camera) {
        super(renderer, camera);
        this.name = 'Scene XX';
    }
    
    async setup() {
        // セットアップ処理（非同期対応）
    }
    
    update(deltaTime) {
        // 更新処理
    }
    
    handleOSC(message) {
        // OSCメッセージ処理
    }
    
    reset() {
        // リセット処理
    }
}
```

シェーダーファイルは `public/shaders/sceneXX/` フォルダに配置すること。

## 🔧 開発の流れ

1. **環境構築**: `npm install`
2. **OSCサーバー起動**: `npm run osc-server`（別ターミナル）
3. **開発サーバー起動**: `npm run dev`
4. **OSC送信**: ProcessingからOSCメッセージを送信
5. **シーン実装**: `SceneBase` を継承してシーンを作成
6. **GPUパーティクル**: `GPUParticleSystem` を使用
7. **本番ビルド**: `npm run build`

## 📸 スクリーンショット機能

- **s/Sキー**: 正方形のスクリーンショットを撮影
- **y/Yキー**: 16:9のスクリーンショットを撮影
- スクリーンショットは自動的に `screenshots/` フォルダに保存されます
- `osc-server.js` が起動している必要があります（HTTPサーバーポート: `3001`）
- スクリーンショットはBase64エンコードされてHTTP POSTで送信されます

## 📝 注意点

- **OSCポート**: Processingと同じポート番号（30337）を使用
- **HTTPポート**: Viteが3000を使用するため、スクリーンショット用HTTPサーバーは3001を使用
- **CORS**: ローカル開発では問題なし
- **パフォーマンス**: 大量パーティクルはGPUで処理（GPUParticleSystem使用）
- **フルスクリーン**: ブラウザのセキュリティ制約により、ユーザー操作が必要な場合があります
- **自動フルスクリーン**: 起動時に自動的にフルスクリーン化を試みますが、失敗する場合があります（F11キーで手動切り替え可能）
- **シェーダーファイル**: 各シーンのシェーダーは `public/shaders/` フォルダに配置し、共通シェーダーは `common/` フォルダに配置すること

## 🎬 ライブ運用

1. **OSCサーバーを起動**: `npm run osc-server`（バックグラウンドで実行）
2. **開発サーバーを起動**: `npm run dev`（または本番ビルド: `npm run build`）
3. **ブラウザをフルスクリーン化**: F11キー（または自動フルスクリーン）
4. **ProcessingからOSCメッセージを送信**: ポート `30337` に送信

### 注意点

- OSCサーバーは常に起動しておく必要があります
- 複数のブラウザウィンドウを開いても、すべて同じOSCメッセージを受信します
- OSCサーバーが起動していない場合、ブラウザ側で「Disconnected」と表示されます
- スクリーンショット機能を使用する場合は、OSCサーバーが起動している必要があります

## 📚 参考

- [Three.js Documentation](https://threejs.org/docs/)
- [osc-js Documentation](https://github.com/adzialocha/osc-js)
- [Vite Documentation](https://vitejs.dev/)

