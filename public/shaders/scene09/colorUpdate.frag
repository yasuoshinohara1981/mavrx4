uniform float deltaTime;
uniform float width;
uniform float height;
uniform sampler2D positionTexture;
uniform sampler2D colorTexture;
uniform float time;

varying vec2 vUv;

void main() {
    // 現在の色を取得（前フレームの速度と位置）
    vec4 currentColor = texture2D(colorTexture, vUv);
    
    // 位置テクスチャから現在の位置と速度Yを取得
    vec4 posData = texture2D(positionTexture, vUv);
    vec3 currentPos = posData.xyz;
    float velocityY = posData.w;  // positionUpdate.fragで更新された速度Y
    
    // 前フレームの速度を取得
    vec3 previousVelocity = vec3(
        (currentColor.r - 0.5) * 200.0,
        (currentColor.g - 0.5) * 200.0,
        (currentColor.b - 0.5) * 200.0
    );
    
    // 前フレームの位置を取得（Aに位置Xが保存されているが、YとZは取得できない）
    // 代わりに、位置の差分から速度を計算する
    float previousPosX = (currentColor.a - 0.5) * 200.0;
    
    // 速度を計算
    // positionUpdate.fragで更新された速度Yを使用し、XとZは位置の差分から計算
    vec3 velocity = vec3(0.0);
    
    if (deltaTime > 0.001) {
        // X方向の速度を位置の差分から計算
        float velX = (currentPos.x - previousPosX) / deltaTime;
        
        // Y方向の速度はpositionUpdate.fragで更新された値を使用
        // Z方向の速度は、位置の差分から計算できないので、前フレームの速度を維持
        // ただし、境界で跳ね返った場合は速度が更新されているはず
        
        // 速度を更新（X方向は位置の差分から、Y方向はpositionUpdate.fragから、Z方向は前フレームから）
        velocity.x = velX;  // 位置の差分から直接計算
        velocity.y = velocityY;  // positionUpdate.fragで更新された速度Yを使用
        velocity.z = previousVelocity.z;  // Zは前フレームの速度を使用（境界で跳ね返った場合は更新される）
    } else {
        velocity = previousVelocity;
    }
    
    // 速度を制限
    velocity = clamp(velocity, vec3(-100.0), vec3(100.0));
    
    // 速度を正規化して保存（-100～100 → 0.0～1.0）
    vec3 normalizedVelocity = clamp(velocity / 200.0 + 0.5, 0.0, 1.0);
    
    // 位置Xを正規化して保存（Aに保存、次フレームで前フレームの位置として使用）
    float normalizedPosX = clamp(currentPos.x / 200.0 + 0.5, 0.0, 1.0);
    
    // 色を更新（R: 速度X, G: 速度Y, B: 速度Z, A: 位置X）
    gl_FragColor = vec4(
        normalizedVelocity.x,
        normalizedVelocity.y,
        normalizedVelocity.z,
        normalizedPosX
    );
}
