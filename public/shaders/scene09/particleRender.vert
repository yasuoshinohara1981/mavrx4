uniform sampler2D positionTexture;
uniform sampler2D colorTexture;
uniform float width;
uniform float height;

attribute float size;
attribute vec2 particleUv;

varying vec3 vColor;
varying vec3 vPosition;
varying vec3 vNormal;

void main() {
    // 位置と色をテクスチャから取得
    float u = (floor(particleUv.x * width) + 0.5) / width;
    float v = (floor(particleUv.y * height) + 0.5) / height;
    vec2 pixelUv = vec2(u, v);
    
    vec4 posData = texture2D(positionTexture, pixelUv);
    vec4 colorData = texture2D(colorTexture, pixelUv);
    
    vec3 position = posData.xyz;
    
    // 速度を取得（RGBに保存されている）
    vec3 velocity = vec3(
        (colorData.r - 0.5) * 200.0,
        (colorData.g - 0.5) * 200.0,
        (colorData.b - 0.5) * 200.0
    );
    
    // 速度の大きさからヒートマップ色を計算（青 → 緑 → 黄 → 赤）
    float speed = length(velocity);
    float speedNormalized = clamp(speed / 80.0, 0.0, 1.0);  // 0～80の範囲を0～1に正規化
    
    // ヒートマップ：青(0.0) → シアン(0.33) → 緑(0.5) → 黄(0.75) → 赤(1.0)
    vec3 color;
    if (speedNormalized < 0.33) {
        // 青 → シアン
        float t = speedNormalized / 0.33;
        color = mix(vec3(0.0, 0.2, 1.0), vec3(0.0, 1.0, 1.0), t);
    } else if (speedNormalized < 0.5) {
        // シアン → 緑
        float t = (speedNormalized - 0.33) / 0.17;
        color = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.5), t);
    } else if (speedNormalized < 0.75) {
        // 緑 → 黄
        float t = (speedNormalized - 0.5) / 0.25;
        color = mix(vec3(0.0, 1.0, 0.5), vec3(1.0, 1.0, 0.0), t);
    } else {
        // 黄 → 赤
        float t = (speedNormalized - 0.75) / 0.25;
        color = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), t);
    }
    
    vColor = color;
    
    vPosition = position;
    
    // ビルボードの法線を計算（カメラ方向、ビュー空間での法線）
    // ビルボードは常にカメラを向くので、法線はビュー方向（カメラからパーティクルへの方向）
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(-mvPos.xyz);  // カメラからパーティクルへの方向（ビュー空間）
    
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    
    float pointSize = size * (300.0 / -mvPosition.z);  // パーティクルサイズを大きく（150 → 300）
    gl_PointSize = max(1.0, pointSize);
    gl_Position = projectionMatrix * mvPosition;
}

