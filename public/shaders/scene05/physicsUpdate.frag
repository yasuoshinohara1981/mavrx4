uniform sampler2D positionTexture;
uniform sampler2D velocityTexture;
uniform sampler2D initialPositionTexture;
uniform float deltaTime;
uniform vec3 gravity;
uniform float restoreStiffness;
uniform float restoreDamping;
uniform float groundY;
uniform float sphereRadius;
uniform float gridSizeX;
uniform float gridSizeZ;
uniform float gridSpacing;
uniform vec3 forceCenter;
uniform float forceStrength;
uniform float forceRadius;
uniform float width;
uniform float height;

varying vec2 vUv;

void main() {
    // 現在の位置と速度を取得
    vec4 posData = texture2D(positionTexture, vUv);
    vec4 velData = texture2D(velocityTexture, vUv);
    vec4 initialPosData = texture2D(initialPositionTexture, vUv);
    
    vec3 currentPos = posData.xyz;
    vec3 currentVel = velData.xyz;
    vec3 initialPos = initialPosData.xyz;
    
    // 復元力（フックの法則）
    vec3 restoreDir = initialPos - currentPos;
    float restoreDistance = length(restoreDir);
    if (restoreDistance > 0.001) {
        restoreDir = normalize(restoreDir);
        float restoreForce = restoreDistance * restoreStiffness;
        float velDot = dot(currentVel, restoreDir);
        float restoreDampingForce = velDot * restoreDamping;
        float totalRestoreForce = restoreForce + restoreDampingForce;
        currentVel += restoreDir * totalRestoreForce * deltaTime;
    }
    
    // 重力を適用
    currentVel += gravity * deltaTime;
    
    // トラック5の力（山なりに持ち上げる）
    vec3 toParticle = currentPos - forceCenter;
    float distance = length(toParticle);
    if (distance < forceRadius && distance > 0.001) {
        float normalizedDistance = distance / forceRadius;
        float velocityNormalized = length(currentVel) / 100.0; // 速度を正規化
        velocityNormalized = clamp(velocityNormalized, 0.0, 1.0);
        
        // 上向きの力
        float upwardForce = forceStrength * (1.0 - normalizedDistance);
        upwardForce += forceStrength * velocityNormalized * 4.0;
        
        // 山なりにするための外側への力（30%）
        vec3 outwardDir = normalize(toParticle);
        outwardDir.y = 0.0; // 水平方向のみ
        if (length(outwardDir) > 0.001) {
            outwardDir = normalize(outwardDir);
        }
        float outwardForce = upwardForce * 0.3;
        
        // 力を適用
        currentVel.y += upwardForce * deltaTime;
        currentVel += outwardDir * outwardForce * deltaTime;
    }
    
    // 位置を更新
    currentPos += currentVel * deltaTime;
    
    // 地面との衝突判定
    if (currentPos.y - sphereRadius <= groundY) {
        currentPos.y = groundY + sphereRadius;
        if (currentVel.y < 0.0) {
            currentVel.y *= -0.3; // 反発係数
        }
        // 摩擦を適用
        float groundFriction = 0.98;
        currentVel.x *= groundFriction;
        currentVel.z *= groundFriction;
    }
    
    // 位置と速度を出力
    gl_FragColor = vec4(currentPos, 1.0);
}
