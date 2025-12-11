uniform sampler2D positionTexture;
uniform sampler2D colorTexture;
uniform float time;
uniform float deltaTime;
uniform float width;
uniform float height;
uniform float boxSize;
uniform float noiseScale;
uniform float noiseStrength;
uniform vec3 forcePoint;
uniform float forceStrength;
uniform float forceRadius;

varying vec2 vUv;

// シンプルなノイズ関数
float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// 3Dノイズ
float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    float n = i.x + i.y * 57.0 + 113.0 * i.z;
    return mix(
        mix(mix(hash(vec3(n + 0.0)), hash(vec3(n + 1.0)), f.x),
            mix(hash(vec3(n + 57.0)), hash(vec3(n + 58.0)), f.x), f.y),
        mix(mix(hash(vec3(n + 113.0)), hash(vec3(n + 114.0)), f.x),
            mix(hash(vec3(n + 170.0)), hash(vec3(n + 171.0)), f.x), f.y), f.z);
}

// フラクタルノイズ
float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 3; i++) {
        value += amplitude * noise(p);
        p *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

// ノイズの勾配を計算（数値微分）
vec3 noiseGradient(vec3 p) {
    float eps = 0.01;
    float n0 = fbm(p);
    float nx = fbm(p + vec3(eps, 0.0, 0.0));
    float ny = fbm(p + vec3(0.0, eps, 0.0));
    float nz = fbm(p + vec3(0.0, 0.0, eps));
    return vec3((nx - n0) / eps, (ny - n0) / eps, (nz - n0) / eps);
}

// カールノイズ（ノイズの勾配から回転を計算）
vec3 curlNoise(vec3 p) {
    float eps = 0.01;
    
    // 3つの独立したノイズフィールド（オフセットを変えて）
    vec3 p1 = p + vec3(0.0, 0.0, 0.0);
    vec3 p2 = p + vec3(100.0, 0.0, 0.0);
    vec3 p3 = p + vec3(0.0, 100.0, 0.0);
    
    // 各ノイズフィールドの勾配を計算
    vec3 n1 = noiseGradient(p1);
    vec3 n2 = noiseGradient(p2);
    vec3 n3 = noiseGradient(p3);
    
    // カールを計算：curl = ∇ × F
    // curl_x = ∂Fz/∂y - ∂Fy/∂z
    // curl_y = ∂Fx/∂z - ∂Fz/∂x
    // curl_z = ∂Fy/∂x - ∂Fx/∂y
    vec3 curl;
    curl.x = (n3.y - n2.z);
    curl.y = (n1.z - n3.x);
    curl.z = (n2.x - n1.y);
    
    return curl;
}

void main() {
    // 現在のパーティクルの位置を取得
    vec4 posData = texture2D(positionTexture, vUv);
    vec3 position = posData.xyz;
    
    // 色テクスチャから速度を取得
    vec4 colorData = texture2D(colorTexture, vUv);
    vec3 velocity = vec3(
        (colorData.r - 0.5) * 200.0,
        (colorData.g - 0.5) * 200.0,
        (colorData.b - 0.5) * 200.0
    );
    
    // カールノイズベースの動きを計算（自然に漂う）
    vec3 noisePos = position * noiseScale + time * 0.3;
    vec3 curlForce = curlNoise(noisePos);
    
    // カールノイズによる力を適用（重力は無効化、自然に漂う）
    velocity += curlForce * noiseStrength * deltaTime;
    
    // トラック5でランダムな方向に力を加える（速度とシミュレーションに対応）
    if (forceStrength > 0.01) {
        vec3 toParticle = position - forcePoint;
        float distance = length(toParticle);
        
        if (distance < forceRadius && distance > 0.001) {
            // 現在の速度の大きさを計算
            float currentSpeed = length(velocity);
            
            // パーティクルごとに異なるランダムな方向を生成（UV座標から）
            vec3 randomSeed = vec3(vUv * 100.0, time);
            float angle1 = hash(randomSeed) * 3.14159265359 * 2.0;
            float angle2 = hash(randomSeed + vec3(100.0)) * 3.14159265359;
            vec3 randomDir = vec3(
                sin(angle2) * cos(angle1),
                cos(angle2),
                sin(angle2) * sin(angle1)
            );
            
            // 距離に応じた力の強さ
            float forceFactor = 1.0 - (distance / forceRadius);
            forceFactor = forceFactor * forceFactor;
            float impulseStrength = forceStrength * forceFactor * deltaTime;
            
            // ランダムな方向に力を加える（既存の速度に追加）
            velocity += randomDir * impulseStrength;
        }
    }
    
    // 位置を更新
    vec3 newPos = position + velocity * deltaTime;
    
    // ボックスの境界判定と跳ね返り
    float halfBox = boxSize * 0.5;
    
    // X方向の境界
    if (newPos.x < -halfBox) {
        newPos.x = -halfBox;
        if (velocity.x < 0.0) {
            velocity.x = -velocity.x * 0.5;
        }
    } else if (newPos.x > halfBox) {
        newPos.x = halfBox;
        if (velocity.x > 0.0) {
            velocity.x = -velocity.x * 0.5;
        }
    }
    
    // Y方向の境界（地面と天井）
    if (newPos.y < -halfBox) {
        newPos.y = -halfBox;
        if (velocity.y < 0.0) {
            velocity.y = -velocity.y * 0.5;
        }
    } else if (newPos.y > halfBox) {
        newPos.y = halfBox;
        if (velocity.y > 0.0) {
            velocity.y = -velocity.y * 0.5;
        }
    }
    
    // Z方向の境界
    if (newPos.z < -halfBox) {
        newPos.z = -halfBox;
        if (velocity.z < 0.0) {
            velocity.z = -velocity.z * 0.5;
        }
    } else if (newPos.z > halfBox) {
        newPos.z = halfBox;
        if (velocity.z > 0.0) {
            velocity.z = -velocity.z * 0.5;
        }
    }
    
    // 速度を制限
    velocity = clamp(velocity, vec3(-100.0), vec3(100.0));
    
    // 新しい位置と速度Yを出力
    gl_FragColor = vec4(newPos, velocity.y);
}
