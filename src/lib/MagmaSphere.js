import * as THREE from 'three';

/**
 * MagmaSphere: テクスチャを一切使わず、シェーダー内で高度なプロシージャル計算を行い、
 * リアルな法線、粗さ、高さを動的に生成するマグマの塊。
 * 動きを極限までスローにし、微細なノイズを加えることで「CGっぽさ」を排除した。
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
                uBaseColor: { value: new THREE.Color(0x010000) }, // 漆黒の岩肌
                uMagmaColor: { value: new THREE.Color(0xcc1100) }, // 粘り気のある深い赤
                uInnerColor: { value: new THREE.Color(0xff8800) }  // 鈍く光るオレンジ
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
                    
                    // 動きを大幅にスローダウン (uTime * 0.05)
                    float n = snoise(position * 0.0012 + uTime * 0.05) * 1.0;
                    n += snoise(position * 0.003 - uTime * 0.08) * 0.5;
                    n += snoise(position * 0.008 + uTime * 0.12) * 0.2;
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
                    // プロシージャルな微細ディテール
                    float detail = snoise(vPosition * 0.1 + uTime * 0.02);
                    float microDetail = snoise(vPosition * 0.5);
                    
                    // 法線摂動（より複雑な計算でCGっぽさを消す）
                    float epsilon = 0.05;
                    float n = vNoise;
                    float nx = snoise(vPosition + vec3(epsilon, 0, 0) * 0.02 + uTime * 0.05);
                    float ny = snoise(vPosition + vec3(0, epsilon, 0) * 0.02 + uTime * 0.05);
                    float nz = snoise(vPosition + vec3(0, 0, epsilon) * 0.02 + uTime * 0.05);
                    vec3 bumpNormal = normalize(vNormal + (vec3(nx, ny, nz) - n) * 1.5);
                    
                    // 熱分布（動きをスローに）
                    float heat = smoothstep(0.7, -0.4, n + detail * 0.15);
                    
                    // ライティング
                    vec3 viewDir = normalize(vViewPosition);
                    float spec = pow(max(dot(reflect(-vec3(0.2, 1.0, 0.1), bumpNormal), viewDir), 0.0), 16.0);
                    
                    // カラー合成（より暗く、鈍い階調に）
                    vec3 rockColor = uBaseColor * (0.7 + microDetail * 0.3);
                    vec3 magmaColor = mix(uMagmaColor, uInnerColor, pow(heat, 2.5));
                    
                    // 溶岩の「揺らぎ」を追加
                    float flicker = snoise(vec3(uTime * 0.8)) * 0.05 + 0.95;
                    vec3 finalColor = mix(rockColor, magmaColor * flicker, heat);
                    
                    // 中心部の鈍い発光
                    finalColor += uInnerColor * pow(heat, 5.0) * 4.0 * flicker;
                    
                    // 鏡面反射（CGっぽさを抑えるため控えめに、かつ不規則に）
                    finalColor += vec3(0.2) * spec * (1.0 - heat) * (0.8 + microDetail * 0.2);
                    
                    // フレネル（縁を深く沈める）
                    float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 1.5);
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
