uniform sampler2D positionTexture;
uniform float baseRadius;
uniform float maxLifetime;  // lifetimeの最大値（circle配置用）
uniform float placementType;  // 0: sphere, 1: circle, 2: terrain

varying vec2 vUv;

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
        
        // 色を出力（白、透明度はlifetimeに基づく）
        gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
    } else {
        // 球面配置（既存の処理、通常は使用しない）
        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
    }
}
