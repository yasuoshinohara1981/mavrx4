import * as THREE from 'three';

/**
 * MagmaSphere: ドメインワープと黒体輻射近似を用いた、極めてリアルなプロシージャル溶岩。
 * CGっぽさの原因である「ノイズの規則性」を徹底的に破壊し、実在感のある質感を追求。
 */
export class MagmaSphere {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.radius = options.radius ?? 400;
        this.position = options.position ?? new THREE.Vector3(0, 900, 0);
        
        this.mesh = null;
        this.material = null;
        
        this.setup();
    }

    setup() {
        const geo = new THREE.SphereGeometry(this.radius, 256, 256);
        
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uRadius: { value: this.radius }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vPosition;
                varying vec3 vViewPosition;
                varying float vWarpNoise;
                uniform float uTime;
                
                // Simplex 3D Noise
                vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
                vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

                float snoise(vec3 v) {
                    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
                    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
                    vec3 i  = floor(v + dot(v, C.yyy) );
                    vec3 x0 = v - i + dot(i, C.xxx) ;
                    vec3 g = step(x0.yzx, x0.xyz);
                    vec3 l = 1.0 - g;
                    vec3 i1 = min( g.xyz, l.zxy );
                    vec3 i2 = max( g.xyz, l.zxy );
                    vec3 x1 = x0 - i1 + C.xxx;
                    vec3 x2 = x0 - i2 + C.yyy;
                    vec3 x3 = x0 - D.yyy;
                    i = mod289(i);
                    vec4 p = permute( permute( permute(
                                i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                            + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                            + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
                    float n_ = 0.142857142857;
                    vec3  ns = n_ * D.wyz - D.xzx;
                    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                    vec4 x_ = floor(j * ns.z);
                    vec4 y_ = floor(j - 7.0 * x_ );
                    vec4 x = x_ *ns.x + ns.yyyy;
                    vec4 y = y_ *ns.x + ns.yyyy;
                    vec4 h = 1.0 - abs(x) - abs(y);
                    vec4 b0 = vec4( x.xy, y.xy );
                    vec4 b1 = vec4( x.zw, y.zw );
                    vec4 s0 = floor(b0)*2.0 + 1.0;
                    vec4 s1 = floor(b1)*2.0 + 1.0;
                    vec4 sh = -step(h, vec4(0.0));
                    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
                    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
                    vec3 p0 = vec3(a0.xy,h.x);
                    vec3 p1 = vec3(a0.zw,h.y);
                    vec3 p2 = vec3(a1.xy,h.z);
                    vec3 p3 = vec3(a1.zw,h.w);
                    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
                    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                    m = m * m;
                    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
                }

            // ドメインワープを用いた高度な形状変形
                void main() {
                    vNormal = normal;
                    vPosition = position;
                    
                    vec3 p = position * 0.002;
                    float t = uTime * 0.05;
                    
                    // ドメインワープ: ノイズの入力座標をさらにノイズで歪ませる
                    vec3 q = vec3(
                        snoise(p + vec3(0.0, 0.0, t)),
                        snoise(p + vec3(5.2, 1.3, t)),
                        snoise(p + vec3(1.7, 9.2, t))
                    );
                    
                    vec3 r = vec3(
                        snoise(p + 4.0 * q + vec3(1.7, 9.2, t * 0.5)),
                        snoise(p + 4.0 * q + vec3(8.3, 2.8, t * 0.5)),
                        snoise(p + 4.0 * q + vec3(4.1, 0.5, t * 0.5))
                    );
                    
                    float warpNoise = snoise(p + 4.0 * r);
                    vWarpNoise = warpNoise;
                    
                    float displacement = warpNoise * 180.0;
                    // 球体形状を崩すための低周波うねり
                    displacement += snoise(position * 0.0005 + t) * 100.0;
                    
                    vec3 newPosition = position + normal * displacement;
                    vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
                    vViewPosition = -mvPosition.xyz;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vNormal;
                varying vec3 vPosition;
                varying vec3 vViewPosition;
                varying float vWarpNoise;
                uniform float uTime;

                // Simplex 3D Noise (Fragment)
                vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
                vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

                float snoise(vec3 v) {
                    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
                    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
                    vec3 i  = floor(v + dot(v, C.yyy) );
                    vec3 x0 = v - i + dot(i, C.xxx) ;
                    vec3 g = step(x0.yzx, x0.xyz);
                    vec3 l = 1.0 - g;
                    vec3 i1 = min( g.xyz, l.zxy );
                    vec3 i2 = max( g.xyz, l.zxy );
                    vec3 x1 = x0 - i1 + C.xxx;
                    vec3 x2 = x0 - i2 + C.yyy;
                    vec3 x3 = x0 - D.yyy;
                    i = mod289(i);
                    vec4 p = permute( permute( permute(
                                i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                            + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                            + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
                    float n_ = 0.142857142857;
                    vec3  ns = n_ * D.wyz - D.xzx;
                    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                    vec4 x_ = floor(j * ns.z);
                    vec4 y_ = floor(j - 7.0 * x_ );
                    vec4 x = x_ *ns.x + ns.yyyy;
                    vec4 y = y_ *ns.x + ns.yyyy;
                    vec4 h = 1.0 - abs(x) - abs(y);
                    vec4 b0 = vec4( x.xy, y.xy );
                    vec4 b1 = vec4( x.zw, y.zw );
                    vec4 s0 = floor(b0)*2.0 + 1.0;
                    vec4 s1 = floor(b1)*2.0 + 1.0;
                    vec4 sh = -step(h, vec4(0.0));
                    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
                    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
                    vec3 p0 = vec3(a0.xy,h.x);
                    vec3 p1 = vec3(a0.zw,h.y);
                    vec3 p2 = vec3(a1.xy,h.z);
                    vec3 p3 = vec3(a1.zw,h.w);
                    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
                    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                    m = m * m;
                    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
                }

                // 黒体輻射の近似色（温度 T に基づく色）
                vec3 blackbody(float T) {
                    vec3 color = vec3(255.0, 180.0, 50.0); // 基準色
                    color.x = 56100000.0 * pow(T, -1.5) + 148.0;
                    color.y = 100.04 * log(T) - 623.6;
                    if (T > 6500.0) color.y = 352.0 * pow(T - 6000.0, -0.1);
                    color.z = 194.18 * log(T) - 1448.6;
                    color /= 255.0;
                    return clamp(color, 0.0, 1.0);
                }

                void main() {
                    vec3 pos = vPosition;
                    float t = uTime * 0.05;
                    
                    // 1. 高度な法線摂動（Domain Warped Normal）
                    float eps = 0.01;
                    float n = vWarpNoise;
                    // 法線計算用の座標もワープさせる
                    float nx = snoise(pos * 0.002 + vec3(eps, 0, 0) + t);
                    float ny = snoise(pos * 0.002 + vec3(0, eps, 0) + t);
                    float nz = snoise(pos * 0.002 + vec3(0, 0, eps) + t);
                    vec3 perturbedNormal = normalize(vNormal + (vec3(nx, ny, nz) - n) * 3.0);
                    
                    // 2. 熱分布（ドメインワープによる不規則なパターン）
                    // 中心ほど熱く、かつワープノイズで複雑に
                    float heat = smoothstep(0.8, -0.6, n);
                    
                    // 3. 黒体輻射ベースのカラー
                    // 温度 1000K (暗い赤) 〜 3000K (明るいオレンジ)
                    float temperature = mix(800.0, 2800.0, pow(heat, 2.0));
                    vec3 magmaColor = blackbody(temperature);
                    
                    // 4. 岩肌の質感（冷えた部分）
                    float rockDetail = snoise(pos * 0.15);
                    float crack = pow(abs(snoise(pos * 0.05)), 0.1); // ひび割れ
                    vec3 rockColor = vec3(0.01) * (0.5 + rockDetail * 0.5) * crack;
                    
                    // 5. ライティング
                    vec3 viewDir = normalize(vViewPosition);
                    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
                    float diff = max(dot(perturbedNormal, lightDir), 0.0);
                    
                    // 6. 最終カラー合成
                    vec3 finalColor = mix(rockColor * diff, magmaColor, heat);
                    
                    // 熱い部分の発光（物理的に妥当な輝き）
                    finalColor += magmaColor * pow(heat, 4.0) * 4.0;
                    
                    // 7. フレネル（縁を沈める）
                    float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 2.0);
                    finalColor *= (1.0 - fresnel * 0.9);
                    
                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `
        });
        
        this.mesh = new THREE.Mesh(geo, this.material);
        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);
    }

    update(time) {
        if (this.material) {
            this.material.uniforms.uTime.value = time;
        }
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.material.dispose();
        }
    }
}
