varying vec3 vColor;
varying vec3 vPosition;
varying vec3 vNormal;

void main() {
    // 円形のパーティクルを描画
    vec2 coord = gl_PointCoord - vec2(0.5);
    float distFromCenter = length(coord);
    
    if (distFromCenter > 0.5) discard;
    
    // ビルボードの円をsphereに見せるために法線を計算
    // z = sqrt(1.0 - x^2 - y^2) で球体の表面のz座標を計算
    float z = sqrt(max(0.0, 1.0 - distFromCenter * distFromCenter * 4.0));
    vec3 sphereNormal = normalize(vec3(coord * 2.0, z));
    
    // ビルボードの法線を計算（ビュー空間での法線）
    // vNormalはカメラ方向（ビュー空間、正規化済み）
    // ビルボード平面上での球体の法線を、ビュー空間の法線に変換
    // ビルボードは常にカメラを向くので、ビルボード平面はカメラ方向に垂直
    vec3 viewDir = normalize(vNormal);  // カメラ方向（ビュー空間、正規化済み）
    
    // ビルボード平面上の任意の2つの直交ベクトルを生成
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(up, viewDir));
    vec3 upCorrected = cross(viewDir, right);
    
    // ビルボード平面上の球体の法線を、ビュー空間の法線に変換
    vec3 normal = normalize(viewDir * sphereNormal.z + right * sphereNormal.x + upCorrected * sphereNormal.y);
    
    // 疑似ライティング計算（マットな質感：より強調）
    
    // メインライト（左から）
    vec3 lightDir = normalize(vec3(-1.0, 0.0, 0.0));
    float NdotL = max(dot(normal, lightDir), 0.0);
    
    // 環境光（マットな質感用に明るめ）
    vec3 ambient = vec3(0.5, 0.5, 0.5);  // グレー系の環境光（明るめ）
    
    // 拡散反射（マットな質感：拡散を強調、スペキュラは無視）
    vec3 diffuse = vec3(1.0, 1.0, 1.0) * NdotL * 1.5;  // 拡散をより強く
    
    // オレンジ色のライト（非常に弱く、マットな質感ではほとんど使わない）
    vec3 orangeLightDir = normalize(vec3(0.3, -0.8, -0.5));
    float NdotL2 = max(dot(normal, orangeLightDir), 0.0);
    vec3 orangeDiffuse = vec3(1.0, 0.647, 0.0) * NdotL2 * 0.1;  // 非常に弱く
    
    // スペキュラハイライト（マットな質感：完全に無視）
    // vec3 viewDir = normalize(-vPosition);
    // vec3 reflectDir = reflect(-lightDir, normal);
    // float specular = pow(max(dot(viewDir, reflectDir), 0.0), 8.0);
    vec3 specularColor = vec3(0.0, 0.0, 0.0);  // スペキュラなし
    
    // リムライティング（マットな質感：なし）
    vec3 rimColor = vec3(0.0, 0.0, 0.0);  // リムライティングなし
    
    // 最終的な色を計算（scene01と同じシンプルな計算）
    vec3 lighting = ambient + diffuse + orangeDiffuse;
    vec3 finalColor = vColor * lighting * 1.5;  // scene01と同じように明るさを調整
    
    // 完全に不透明にする（scene01と同じ、オーバードローを減らしてパフォーマンス向上）
    gl_FragColor = vec4(finalColor, 1.0);
}

