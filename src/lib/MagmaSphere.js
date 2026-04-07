import * as THREE from 'three';
import { generateRockPBRTextures } from './RockPBRTextures.js';

/**
 * MagmaSphere: ドメインワープと非線形な変形（Exponential/Power）を極限まで強化。
 * 均一な「トゲトゲ」を排除し、滑らかな平原と、突如現れる巨大な「岩の塊」の対比を実現。
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
        const rockTex = generateRockPBRTextures(1024, { seed: 456, maxAnisotropy: 8 });
        
        this.material = new THREE.MeshStandardMaterial({
            color: 0x111111,
            map: rockTex.map,
            normalMap: rockTex.normalMap,
            roughnessMap: rockTex.roughnessMap,
            aoMap: rockTex.aoMap,
            roughness: 0.9,
            metalness: 0.1,
            envMapIntensity: 1.0,
            emissive: 0x000000,
            emissiveIntensity: 0.0,
            transparent: false
        });

        this.material.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = { value: 0 };
            
            const commonNoise = `
                varying float vDistortion;
                varying vec3 vWarpedPos;
                uniform float uTime;
                
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
                float fbm(vec3 p) {
                    float v = 0.0;
                    float a = 0.5;
                    vec3 shift = vec3(100);
                    for (int i = 0; i < 3; ++i) {
                        v += a * snoise(p);
                        p = p * 2.0 + shift;
                        a *= 0.5;
                    }
                    return v;
                }
            `;

            shader.vertexShader = commonNoise + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                vec3 p = position * 0.0012;
                float t = uTime * 0.12;
                
                // 強力なドメインワープ（座標を大きく歪ませて「疎密」を作る）
                vec3 q = vec3(
                    fbm(p + vec3(0.0, 0.0, t)),
                    fbm(p + vec3(5.2, 1.3, t)),
                    fbm(p + vec3(1.7, 9.2, t))
                );
                
                // 歪んだ座標でメインのノイズを計算
                vWarpedPos = p + 6.0 * q; 
                float noiseVal = fbm(vWarpedPos);
                
                // 0〜1に正規化
                float normalizedNoise = noiseVal * 0.5 + 0.5;
                
                // 指数関数的な加工（トゲトゲを「塊」に変える）
                // 低い部分は極限まで平坦に、高い部分だけが急激に盛り上がる
                float clumpy = pow(normalizedNoise, 6.0); 
                
                // 場所によって「平原」と「塊」を切り替えるためのバイアス
                float mask = snoise(p * 0.4 + t * 0.1) * 0.5 + 0.5;
                mask = smoothstep(0.3, 0.7, mask); // マスクをパキッとさせる
                
                vDistortion = clumpy * mask;
                
                // 盛り上がりを大きくして、よりダイナミックな「塊」にする
                vec3 transformed = position + normal * vDistortion * 280.0;
                `
            );

            shader.fragmentShader = commonNoise + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <emissivemap_fragment>',
                `
                #include <emissivemap_fragment>
                
                // 歪んだ座標を使って、テクスチャの模様にも偏りを作る
                float patternBias = snoise(vWarpedPos * 0.4 + uTime * 0.08) * 0.5 + 0.5;
                
                // 盛り上がっている「塊」の部分だけを強烈に発光させる
                float glow = smoothstep(0.1, 0.6, vDistortion);
                
                // 模様の疎密（特定の場所だけ模様が濃くなるように）
                float detailMask = pow(patternBias, 3.0);
                
                vec3 magmaColor = vec3(1.0, 0.35, 0.05);
                float pulse = 0.8 + 0.2 * sin(uTime * 1.2);
                
                // 発光にも強烈な偏りを持たせる
                totalEmissiveRadiance += magmaColor * glow * 10.0 * pulse * detailMask;
                `
            );

            this.material.userData.shader = shader;
        };

        this.mesh = new THREE.Mesh(geo, this.material);
        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);
    }

    update(time) {
        if (this.material.userData.shader) {
            this.material.userData.shader.uniforms.uTime.value = time;
        }
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.material.dispose();
            if (this.material.map) this.material.map.dispose();
            if (this.material.normalMap) this.material.normalMap.dispose();
            if (this.material.roughnessMap) this.material.roughnessMap.dispose();
            if (this.material.aoMap) this.material.aoMap.dispose();
        }
    }
}
