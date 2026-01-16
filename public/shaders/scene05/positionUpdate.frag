uniform sampler2D positionTexture;
uniform float time;
uniform float noiseScale;
uniform float noiseStrength;
uniform float baseRadius;
uniform float width;
uniform float height;
uniform float deltaTime;  // 時間経過（circle配置用）
uniform float maxLifetime;  // lifetimeの最大値（circle配置用）
uniform float circleRadius;  // 円の半径（circle配置用）
uniform float circleThickness;  // 円の太さ（circle配置用）
uniform float placementType;  // 0: sphere, 1: circle, 2: terrain
uniform float pressure;  // 圧力（0.0 = なし、正の値 = 外側に押し出す、負の値 = 内側に押し込む）

varying vec2 vUv;

// ハッシュ関数（簡易版）
float hash(float n) {
    return fract(sin(n) * 43758.5453);
}

// Processingのnoise()関数を模倣（パーリンノイズ風）
float smoothNoise(vec3 p) {
    // Processingのnoise()関数に近い実装（パーリンノイズ風）
    // より細かく、より自然なノイズを生成
    
    // 3Dノイズ（簡易パーリンノイズ風）
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);  // smoothstep
    
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    
    float a = hash(n);
    float b = hash(n + 1.0);
    float c = hash(n + 57.0);
    float d = hash(n + 58.0);
    float e = hash(n + 113.0);
    float f1 = hash(n + 114.0);
    float g = hash(n + 170.0);
    float h = hash(n + 171.0);
    
    // 3D補間
    float x1 = mix(a, b, f.x);
    float x2 = mix(c, d, f.x);
    float y1 = mix(x1, x2, f.y);
    
    float x3 = mix(e, f1, f.x);
    float x4 = mix(g, h, f.x);
    float y2 = mix(x3, x4, f.y);
    
    return mix(y1, y2, f.z);
}

// シンプルなカールノイズ関数（各軸に異なる時間オフセットを適用）
vec3 curlNoise(vec3 p, float t, float noiseScale, float noiseStrength) {
    // epsをノイズスケールに応じて調整（より正確な勾配計算のため）
    float eps = 0.01 / noiseScale;
    
    // 各軸に異なる時間オフセットを適用することで、各軸が独立して動くようにする
    // 係数を大きくして、より明確な違いを作る
    float tx = t * 0.5;   // X軸の時間オフセット
    float ty = t * 1.0;   // Y軸の時間オフセット
    float tz = t * 0.5;   // Z軸の時間オフセット
    
    // 位置にノイズスケールを適用し、各軸に異なる時間オフセットを加える
    vec3 scaledPos = p * noiseScale;
    
    // 勾配を計算（各軸に異なる時間オフセットを適用）
    float n1 = smoothNoise(vec3(scaledPos.x + eps + tx, scaledPos.y + ty, scaledPos.z + tz));
    float n2 = smoothNoise(vec3(scaledPos.x - eps + tx, scaledPos.y + ty, scaledPos.z + tz));
    float n3 = smoothNoise(vec3(scaledPos.x + tx, scaledPos.y + eps + ty, scaledPos.z + tz));
    float n4 = smoothNoise(vec3(scaledPos.x + tx, scaledPos.y - eps + ty, scaledPos.z + tz));
    float n5 = smoothNoise(vec3(scaledPos.x + tx, scaledPos.y + ty, scaledPos.z + eps + tz));
    float n6 = smoothNoise(vec3(scaledPos.x + tx, scaledPos.y + ty, scaledPos.z - eps + tz));
    
    // 勾配を計算（epsで正規化）
    float dx = (n1 - n2) / (2.0 * eps);
    float dy = (n3 - n4) / (2.0 * eps);
    float dz = (n5 - n6) / (2.0 * eps);
    
    // curl = (dz - dy, dx - dz, dy - dx)
    float curlX = dz - dy;
    float curlY = dx - dz;
    float curlZ = dy - dx;
    
    return vec3(curlX, curlY, curlZ) * noiseStrength;
}

void main() {
    // 現在の位置を取得
    vec4 posData = texture2D(positionTexture, vUv);
    vec3 currentPos = posData.xyz;
    float currentLifetime = posData.w;  // lifetimeまたはbaseRadius
    
    // circle配置の場合
    if (placementType > 0.5 && placementType < 1.5) {
        // グリッド座標を計算
        float x = (vUv.x * width) - 0.5;
        float angle = (x / (width - 1.0)) * 3.14159265359 * 2.0;
        
        // lifetimeを更新
        float newLifetime = currentLifetime - deltaTime;
        
        // lifetimeが0以下になったらリスポーン
        if (newLifetime <= 0.0) {
            // 初期位置を計算（円周上の太さ（circleThickness）の範囲内でランダムに配置）
            // 円周上の半径に、circleThicknessの範囲内でランダムにオフセット
            float radiusOffset = (fract(sin(dot(vUv, vec2(12.9898, 78.233)) * 43758.5453)) - 0.5) * circleThickness;
            float radius = circleRadius + radiusOffset;
            // 角度は円周上の角度を使用（ランダム化しない）
            vec3 initialPos = vec3(radius * cos(angle), 0.0, radius * sin(angle));
            
            // 新しいランダムなlifetimeを設定
            float randomLifetime = maxLifetime * (0.33 + fract(sin(dot(vUv, vec2(12.9898, 78.233)) * 43758.5453 + time) * 43758.5453) * 0.67);
            newLifetime = randomLifetime;
            
            // 位置を初期位置にリセット
            currentPos = initialPos;
        } else {
            // カールノイズで動かす
            vec3 curl = curlNoise(currentPos, time, noiseScale, noiseStrength);
            currentPos += curl * deltaTime;
            
            // 圧力を適用（中心からの方向に圧力を掛ける）
            if (abs(pressure) > 0.001) {
                float distanceFromCenter = length(currentPos);
                if (distanceFromCenter > 0.001) {
                    vec3 centerToParticle = normalize(currentPos);
                    // 圧力が正の場合は外側に、負の場合は内側に押す
                    currentPos += centerToParticle * pressure * deltaTime;
                }
            }
        }
        
        // 位置を出力（lifetimeをwに保存）
        gl_FragColor = vec4(currentPos, newLifetime);
    } else {
        // 球面配置（既存の処理、通常は使用しない）
        gl_FragColor = vec4(currentPos, baseRadius);
    }
}
