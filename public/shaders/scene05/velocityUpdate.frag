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
uniform float springStiffness;
uniform float springDamping;
uniform float restLength;

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
    
    // スプリング拘束（隣接パーティクルとの接続）
    // グリッド構造を利用して、隣接パーティクルの位置と速度を取得
    float pixelWidth = 1.0 / width;
    float pixelHeight = 1.0 / height;
    
    // 右隣（X+1）
    vec2 rightUv = vUv + vec2(pixelWidth, 0.0);
    if (rightUv.x < 1.0) {
        vec4 rightPosData = texture2D(positionTexture, rightUv);
        vec4 rightVelData = texture2D(velocityTexture, rightUv);
        vec3 rightPos = rightPosData.xyz;
        vec3 rightVel = rightVelData.xyz;
        
        // スプリング力を計算
        vec3 diff = rightPos - currentPos;
        float currentLength = length(diff);
        if (currentLength > 0.01) {
            vec3 forceDir = normalize(diff);
            float stretch = currentLength - restLength;
            float springForce = stretch * springStiffness;
            vec3 velDiff = rightVel - currentVel;
            float dampingForce = dot(velDiff, forceDir) * springDamping;
            float totalForce = springForce + dampingForce;
            currentVel += forceDir * totalForce * deltaTime;
        }
    }
    
    // 下隣（Z+1）
    vec2 bottomUv = vUv + vec2(0.0, pixelHeight);
    if (bottomUv.y < 1.0) {
        vec4 bottomPosData = texture2D(positionTexture, bottomUv);
        vec4 bottomVelData = texture2D(velocityTexture, bottomUv);
        vec3 bottomPos = bottomPosData.xyz;
        vec3 bottomVel = bottomVelData.xyz;
        
        // スプリング力を計算
        vec3 diff = bottomPos - currentPos;
        float currentLength = length(diff);
        if (currentLength > 0.01) {
            vec3 forceDir = normalize(diff);
            float stretch = currentLength - restLength;
            float springForce = stretch * springStiffness;
            vec3 velDiff = bottomVel - currentVel;
            float dampingForce = dot(velDiff, forceDir) * springDamping;
            float totalForce = springForce + dampingForce;
            currentVel += forceDir * totalForce * deltaTime;
        }
    }
    
    // 右下対角線（X+1, Z+1）
    vec2 diagonalUv = vUv + vec2(pixelWidth, pixelHeight);
    if (diagonalUv.x < 1.0 && diagonalUv.y < 1.0) {
        vec4 diagonalPosData = texture2D(positionTexture, diagonalUv);
        vec4 diagonalVelData = texture2D(velocityTexture, diagonalUv);
        vec3 diagonalPos = diagonalPosData.xyz;
        vec3 diagonalVel = diagonalVelData.xyz;
        
        // スプリング力を計算（対角線なので自然長は √2 * restLength）
        vec3 diff = diagonalPos - currentPos;
        float currentLength = length(diff);
        float diagonalRestLength = restLength * 1.414213562; // sqrt(2)
        if (currentLength > 0.01) {
            vec3 forceDir = normalize(diff);
            float stretch = currentLength - diagonalRestLength;
            float springForce = stretch * springStiffness;
            vec3 velDiff = diagonalVel - currentVel;
            float dampingForce = dot(velDiff, forceDir) * springDamping;
            float totalForce = springForce + dampingForce;
            currentVel += forceDir * totalForce * deltaTime;
        }
    }
    
    // 左隣（X-1）からの力も受ける
    vec2 leftUv = vUv - vec2(pixelWidth, 0.0);
    if (leftUv.x >= 0.0) {
        vec4 leftPosData = texture2D(positionTexture, leftUv);
        vec4 leftVelData = texture2D(velocityTexture, leftUv);
        vec3 leftPos = leftPosData.xyz;
        vec3 leftVel = leftVelData.xyz;
        
        // スプリング力を計算
        vec3 diff = leftPos - currentPos;
        float currentLength = length(diff);
        if (currentLength > 0.01) {
            vec3 forceDir = normalize(diff);
            float stretch = currentLength - restLength;
            float springForce = stretch * springStiffness;
            vec3 velDiff = leftVel - currentVel;
            float dampingForce = dot(velDiff, forceDir) * springDamping;
            float totalForce = springForce + dampingForce;
            currentVel += forceDir * totalForce * deltaTime;
        }
    }
    
    // 上隣（Z-1）からの力も受ける
    vec2 topUv = vUv - vec2(0.0, pixelHeight);
    if (topUv.y >= 0.0) {
        vec4 topPosData = texture2D(positionTexture, topUv);
        vec4 topVelData = texture2D(velocityTexture, topUv);
        vec3 topPos = topPosData.xyz;
        vec3 topVel = topVelData.xyz;
        
        // スプリング力を計算
        vec3 diff = topPos - currentPos;
        float currentLength = length(diff);
        if (currentLength > 0.01) {
            vec3 forceDir = normalize(diff);
            float stretch = currentLength - restLength;
            float springForce = stretch * springStiffness;
            vec3 velDiff = topVel - currentVel;
            float dampingForce = dot(velDiff, forceDir) * springDamping;
            float totalForce = springForce + dampingForce;
            currentVel += forceDir * totalForce * deltaTime;
        }
    }
    
    // 左上対角線（X-1, Z-1）からの力も受ける
    vec2 topLeftUv = vUv - vec2(pixelWidth, pixelHeight);
    if (topLeftUv.x >= 0.0 && topLeftUv.y >= 0.0) {
        vec4 topLeftPosData = texture2D(positionTexture, topLeftUv);
        vec4 topLeftVelData = texture2D(velocityTexture, topLeftUv);
        vec3 topLeftPos = topLeftPosData.xyz;
        vec3 topLeftVel = topLeftVelData.xyz;
        
        // スプリング力を計算（対角線）
        vec3 diff = topLeftPos - currentPos;
        float currentLength = length(diff);
        float diagonalRestLength = restLength * 1.414213562;
        if (currentLength > 0.01) {
            vec3 forceDir = normalize(diff);
            float stretch = currentLength - diagonalRestLength;
            float springForce = stretch * springStiffness;
            vec3 velDiff = topLeftVel - currentVel;
            float dampingForce = dot(velDiff, forceDir) * springDamping;
            float totalForce = springForce + dampingForce;
            currentVel += forceDir * totalForce * deltaTime;
        }
    }
    
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
    
    // 地面との衝突判定（速度のみ更新）
    if (currentPos.y - sphereRadius <= groundY) {
        if (currentVel.y < 0.0) {
            currentVel.y *= -0.3; // 反発係数
        }
        // 摩擦を適用
        float groundFriction = 0.98;
        currentVel.x *= groundFriction;
        currentVel.z *= groundFriction;
    }
    
    // 速度を出力
    gl_FragColor = vec4(currentVel, 1.0);
}
