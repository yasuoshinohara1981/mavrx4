uniform sampler2D positionTexture;
uniform float baseRadius;
uniform float maxLifetime;  // lifetimeの最大値（circle配置用）
uniform float placementType;  // 0: sphere, 1: circle, 2: terrain
uniform float circleRadius;  // 円の半径（circle配置用）

varying vec2 vUv;

// HSVからRGBへの変換（ProcessingのHSBと同じ）
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    // 現在の位置を取得
    vec4 posData = texture2D(positionTexture, vUv);
    vec3 currentPos = posData.xyz;
    float lifetimeOrBaseRadius = posData.w;
    
    // circle配置の場合
    if (placementType > 0.5 && placementType < 1.5) {
        // lifetimeに基づく透明度計算
        float lifetime = lifetimeOrBaseRadius;
        float lifetimeRatio = lifetime / maxLifetime;
        
        // イージング関数（ease-out）
        float easedRatio = 1.0 - pow(1.0 - lifetimeRatio, 3.0);
        
        // 透明度を計算（lifetimeが少ないほど透明に）
        float alpha = easedRatio;
        
        // パーティクルは黒
        vec3 rgbColor = vec3(0.0, 0.0, 0.0);  // 黒
        
        // 色を出力（黒、透明度はlifetimeに基づく）
        gl_FragColor = vec4(rgbColor, alpha);
    } else {
        // 球面配置（既存の処理、通常は使用しない）
        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
    }
}
