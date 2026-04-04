import * as THREE from 'three';

/**
 * MagmaSphere: テクスチャを一切使わず、シェーダー内で高度なプロシージャル計算を行い、
 * リアルな法線、粗さ、高さを動的に生成するマグマの塊。
 * バンプとラフネスによる深い陰影を追求し、実在感を高めた。
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
                uRadius: { value: this.radius },
                uBaseColor: { value: new THREE.Color(0x000000) }, // 漆黒
                uMagmaColor: { value: new THREE.Color(0x440400) }, // 極暗の赤
                uInnerColor: { value: new THREE.Color(0x883300) }  // 鈍く光る橙
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vPosition;
                varying vec3 vViewPosition;
                varying float vNoise;
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

                void main() {
                    vNormal = normal;
                    vPosition = position;
                    
                    // 多層ノイズによる形状変形（スロー）
                    float n = snoise(position * 0.0012 + uTime * 0.04) * 1.0;
                    n += snoise(position * 0.003 - uTime * 0.07) * 0.5;
                    n += snoise(position * 0.008 + uTime * 0.1) * 0.2;
                    vNoise = n;
                    
                    float displacement = n * 160.0;
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
                varying float vNoise;
                uniform float uTime;
                uniform vec3 uBaseColor;
                uniform vec3 uMagmaColor;
                uniform vec3 uInnerColor;

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

                void main() {
                    vec3 pos = vPosition;
                    
                    // 1. 高度マップ（Bump）の多層計算
                    float h0 = snoise(pos * 0.015);
                    float h1 = snoise(pos * 0.04) * 0.5;
                    float h2 = snoise(pos * 0.1) * 0.25;
                    float bumpHeight = h0 + h1 + h2;
                    
                    // 2. 精密な法線摂動（Normal Map効果）
                    // 周囲のサンプルから勾配を求めて法線を歪ませる
                    float eps = 0.02;
                    float nx = snoise((pos + vec3(eps, 0, 0)) * 0.04);
                    float ny = snoise((pos + vec3(0, eps, 0)) * 0.04);
                    float nz = snoise((pos + vec3(0, 0, eps)) * 0.04);
                    vec3 grad = (vec3(nx, ny, nz) - h1) / eps;
                    vec3 perturbedNormal = normalize(vNormal - grad * 0.5);
                    
                    // 3. ラフネスマップの計算
                    // 岩肌はガサガサ(1.0)、溶岩はツルツル(0.1)
                    float rockRoughness = clamp(0.7 + snoise(pos * 0.2) * 0.3, 0.5, 1.0);
                    float magmaRoughness = 0.15;
                    
                    // 4. 熱分布（中心ほど熱い）
                    float heat = smoothstep(0.7, -0.4, vNoise + h0 * 0.2);
                    float currentRoughness = mix(rockRoughness, magmaRoughness, pow(heat, 2.0));
                    
                    // 5. ライティング計算
                    vec3 viewDir = normalize(vViewPosition);
                    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
                    vec3 halfDir = normalize(lightDir + viewDir);
                    
                    // 拡散反射（法線摂動による深い影）
                    float diff = max(dot(perturbedNormal, lightDir), 0.0);
                    // アンビエントオクルージョン（凹んでいる部分を暗く）
                    float ao = clamp(1.0 + bumpHeight * 0.5, 0.2, 1.0);
                    
                    // 鏡面反射（ラフネス依存）
                    float spec = pow(max(dot(perturbedNormal, halfDir), 0.0), mix(2.0, 128.0, 1.0 - currentRoughness));
                    
                    // 6. カラー合成
                    vec3 rockColor = uBaseColor * (0.2 + h2 * 0.2);
                    vec3 magmaColor = mix(uMagmaColor, uInnerColor, pow(heat, 3.0));
                    
                    // 溶岩の揺らぎ
                    float flicker = snoise(vec3(uTime * 0.5)) * 0.05 + 0.95;
                    vec3 finalColor = mix(rockColor * diff * ao, magmaColor * flicker, heat);
                    
                    // 中心部の鈍い発光（さらに強度を抑える）
                    finalColor += uInnerColor * pow(heat, 5.0) * 2.0 * flicker;
                    
                    // 鏡面反射を追加（控えめに）
                    finalColor += vec3(0.2) * spec * (1.0 - heat) * ao;
                    
                    // 7. フレネル（縁をさらに深く暗く）
                    float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 2.5);
                    finalColor *= (1.0 - fresnel * 0.95);
                    
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
