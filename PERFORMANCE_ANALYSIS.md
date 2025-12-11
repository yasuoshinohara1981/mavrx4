# パフォーマンス分析と改善策

## 現在の実装状況

### ✅ 既に実装済み（良い点）

1. **GPU側でのパーティクル更新**
   - RenderTarget + ping-pongバッファを使用
   - 位置・色の更新は100% GPU側で完結
   - JS側から毎フレームデータ転送なし

2. **Geometryの固定化**
   - `createRenderShader()`で一度だけ作成
   - 毎フレーム`new`していない
   - attributesは固定（UV、size）

3. **ShaderMaterialの使用**
   - カスタムシェーダーを使用
   - ただし`RawShaderMaterial`ではない

### ⚠️ 改善が必要な点

1. **WebGLRenderer → WebGPURenderer**
   - 現在: `WebGLRenderer`を使用
   - 改善: `WebGPURenderer`に変更（Metal backendで高速化）
   - **注意**: ブラウザ互換性の問題あり（Chrome 113+, Safari 16.4+）

2. **ShaderMaterial → RawShaderMaterial**
   - 現在: `THREE.ShaderMaterial`を使用
   - 改善: `THREE.RawShaderMaterial`に変更
   - **効果**: Three.jsのデフォルト処理をスキップして軽量化

3. **THREE.Pointsの使用**
   - 現在: `THREE.Points`を使用
   - 改善: より低レベルな描画方法を検討
   - **注意**: `THREE.Points`は内部的に処理が多い可能性

4. **カメラの更新**
   - 現在: 毎フレームカメラを更新
   - 改善: 必要時のみ更新、`matrixWorldNeedsUpdate`を回避

5. **シェーダーの軽量化**
   - 現在: ノイズ計算が複雑
   - 改善: 分岐を減らす、varyingを最小化

## 改善策の優先順位

### 🔴 高優先度（即座に実装可能）

1. **RawShaderMaterialへの変更**
   - 実装難易度: ⭐⭐（中）
   - 効果: ⭐⭐⭐（高）
   - 互換性: ✅ 全ブラウザ対応

2. **カメラ更新の最適化**
   - 実装難易度: ⭐（低）
   - 効果: ⭐⭐（中）
   - 互換性: ✅ 全ブラウザ対応

3. **シェーダーの軽量化**
   - 実装難易度: ⭐⭐（中）
   - 効果: ⭐⭐（中）
   - 互換性: ✅ 全ブラウザ対応

### 🟡 中優先度（条件付きで実装）

4. **WebGPURendererへの変更**
   - 実装難易度: ⭐⭐⭐（高）
   - 効果: ⭐⭐⭐⭐（非常に高）
   - 互換性: ⚠️ Chrome 113+, Safari 16.4+のみ
   - **推奨**: フォールバック付きで実装

### 🟢 低優先度（調査が必要）

5. **THREE.Pointsの代替**
   - 実装難易度: ⭐⭐⭐⭐（非常に高）
   - 効果: ⭐⭐⭐（高）
   - 互換性: ⚠️ 実装方法によって異なる
   - **推奨**: 他の改善策を試してから検討

## 実装計画

### Phase 1: 即座に実装可能な改善（1-2時間）

1. `ShaderMaterial` → `RawShaderMaterial`に変更
2. カメラ更新の最適化
3. シェーダーの軽量化（分岐削減、varying最小化）

### Phase 2: WebGPU対応（半日〜1日）

1. WebGPURendererの検出とフォールバック
2. WebGPU対応のRenderTarget作成
3. シェーダーのWebGPU対応

### Phase 3: 高度な最適化（1-2日）

1. THREE.Pointsの代替実装
2. より低レベルな描画パイプライン

## 期待される効果

### Phase 1完了後
- 現在: 150万粒子で限界
- 目標: 200-250万粒子まで可能

### Phase 2完了後
- 目標: 300-500万粒子まで可能
- Metal backendでCPU負荷激減

### Phase 3完了後
- 目標: 500万粒子以上
- openFrameworksに近い性能

