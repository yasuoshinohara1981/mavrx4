import * as THREE from 'three';
import { generateRockPBRTextures } from './RockPBRTextures.js';

/**
 * MagmaSphere: ノイズの周波数を大幅に下げ、低周波のうねりと巨大な「岩の塊」を表現。
 * ギザギザした細部を削ぎ落とし、スケール感のあるダイナミックな形状を実現。
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
                // 周波数を下げたFBM（大きなうねり用）
                float fbm_low(vec3 p) {
                    float v = 0.0;
                    float a = 0.5;
                    vec3 shift = vec3(100);
                    for (int i = 0; i < 2; ++i) { // レイヤーを減らして細部を削る
                        v += a * snoise(p);
                        p = p * 1.8 + shift; // 倍率を下げて緩やかに
                        a *= 0.5;
                    }
                    return v;
                }
            `;

            shader.vertexShader = commonNoise + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                // 周波数を大幅に下げて、巨大なスケール感にする
                vec3 p = position * 0.0006; 
                float t = uTime * 0.08;
                
                // ドメインワープも緩やかに（ギザギザを抑える）
                vec3 q = vec3(
                    fbm_low(p + vec3(0.0, 0.0, t)),
                    fbm_low(p + vec3(5.2, 1.3, t)),
                    fbm_low(p + vec3(1.7, 9.2, t))
                );
                
                vWarpedPos = p + 3.0 * q; 
                float noiseVal = fbm_low(vWarpedPos);
                
                float normalizedNoise = noiseVal * 0.5 + 0.5;
                
                // 盛り上がりを「巨大な塊」にする（緩やかなpow）
                float clumpy = pow(normalizedNoise, 4.0); 
                
                // マスクも巨大で緩やかに
                float mask = snoise(p * 0.2 + t * 0.05) * 0.5 + 0.5;
                mask = smoothstep(0.2, 0.8, mask);
                
                vDistortion = clumpy * mask;
                
                // 変形の大きさをさらに巨大に（380.0までアップ）
                vec3 transformed = position + normal * vDistortion * 380.0;
                `
            );

            shader.fragmentShader = commonNoise + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <emissivemap_fragment>',
                `
                #include <emissivemap_fragment>
                
                // 模様の疎密も緩やかに
                float patternBias = snoise(vWarpedPos * 0.2 + uTime * 0.05) * 0.5 + 0.5;
                
                // 巨大な塊の部分を発光させる
                float glow = smoothstep(0.1, 0.5, vDistortion);
                
                float detailMask = pow(patternBias, 2.0);
                
                vec3 magmaColor = vec3(1.0, 0.35, 0.05);
                float pulse = 0.85 + 0.15 * sin(uTime * 1.0);
                
                totalEmissiveRadiance += magmaColor * glow * 12.0 * pulse * detailMask;
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
