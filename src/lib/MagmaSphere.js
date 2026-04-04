import * as THREE from 'three';

/**
 * MagmaSphere: 画面中心でゆらゆら歪むマグマの球体
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
        const geo = new THREE.SphereGeometry(this.radius, 64, 64);
        
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uRadius: { value: this.radius },
                uBaseColor: { value: new THREE.Color(0x881100) }, // 暗い赤
                uInnerColor: { value: new THREE.Color(0xff6600) } // 輝くオレンジ
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vPosition;
                uniform float uTime;
                
                // 簡易ノイズ
                float hash(vec3 p) {
                    p = fract(p * 0.1031);
                    p += dot(p, p.yzx + 33.33);
                    return fract((p.x + p.y) * p.z);
                }
                
                float noise(vec3 p) {
                    vec3 i = floor(p);
                    vec3 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(
                        mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
                }

                void main() {
                    vNormal = normal;
                    vPosition = position;
                    
                    // 頂点をノイズで歪ませる
                    float displacement = noise(position * 0.01 + uTime * 0.5) * 60.0;
                    displacement += noise(position * 0.02 - uTime * 0.8) * 30.0;
                    
                    vec3 newPosition = position + normal * displacement;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vNormal;
                varying vec3 vPosition;
                uniform float uTime;
                uniform vec3 uBaseColor;
                uniform vec3 uInnerColor;

                float hash(vec3 p) {
                    p = fract(p * 0.1031);
                    p += dot(p, p.yzx + 33.33);
                    return fract((p.x + p.y) * p.z);
                }
                
                float noise(vec3 p) {
                    vec3 i = floor(p);
                    vec3 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(
                        mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
                }

                void main() {
                    // マグマの模様をノイズで生成
                    float n = noise(vPosition * 0.015 + uTime * 0.4);
                    n += noise(vPosition * 0.03 - uTime * 0.2) * 0.5;
                    
                    // フレネル効果で縁を暗く、中を光らせる
                    float fresnel = pow(1.0 - dot(normalize(vNormal), vec3(0,0,1)), 3.0);
                    
                    vec3 color = mix(uBaseColor, uInnerColor, n);
                    color += uInnerColor * pow(n, 4.0) * 2.0; // 強い発光部分
                    
                    gl_FragColor = vec4(color, 1.0);
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
