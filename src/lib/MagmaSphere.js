import * as THREE from 'three';
import { generateRockPBRTextures } from './RockPBRTextures.js';

/**
 * MagmaSphere: メインパーティクルと同じ RockPBRTextures を使用し、
 * 内部から溶岩が滲み出ているような質感を MeshStandardMaterial で表現。
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
        const geo = new THREE.SphereGeometry(this.radius, 128, 128);
        
        // メインパーティクルと同じ手法でテクスチャを生成
        const rockTex = generateRockPBRTextures(1024, { seed: 456, maxAnisotropy: 8 });
        
        // メインパーティクルと統一感のある MeshStandardMaterial をベースにする
        this.material = new THREE.MeshStandardMaterial({
            color: 0x111111, // 基本は黒い岩
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

        // シェーダーを拡張して、溶岩の「滲み出し」と「歪み」を追加
        this.material.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = { value: 0 };
            
            // 頂点シェーダーの拡張：形状を歪ませる
            shader.vertexShader = `
                varying float vDistortion;
                uniform float uTime;
                
                // 簡易的なノイズ関数
                float hash(vec3 p) {
                    p = fract(p * 0.1031);
                    p += dot(p, p.yzx + 33.33);
                    return fract((p.x + p.y) * p.z);
                }
                float noise(vec3 p) {
                    vec3 i = floor(p);
                    vec3 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                               mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                           mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                               mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
                }
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                float d = noise(position * 0.005 + uTime * 0.5);
                vDistortion = d;
                vec3 transformed = position + normal * d * 60.0;
                `
            );

            // フラグメントシェーダーの拡張：溶岩の発光
            shader.fragmentShader = `
                uniform float uTime;
                varying float vDistortion;
            ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <emissivemap_fragment>',
                `
                #include <emissivemap_fragment>
                
                // 歪みに基づいて溶岩の色を決定
                float glow = smoothstep(0.4, 0.8, vDistortion);
                vec3 magmaColor = vec3(1.0, 0.2, 0.05); // 鮮やかな溶岩色
                magmaColor *= 5.0; // 発光強度
                
                totalEmissiveRadiance += magmaColor * glow;
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
            // テクスチャの破棄
            if (this.material.map) this.material.map.dispose();
            if (this.material.normalMap) this.material.normalMap.dispose();
            if (this.material.roughnessMap) this.material.roughnessMap.dispose();
            if (this.material.aoMap) this.material.aoMap.dispose();
        }
    }
}
