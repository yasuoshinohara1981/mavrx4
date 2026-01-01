/**
 * Scene09専用GPU Particle System
 * GPUParticleSystemを継承して、scene09専用のパラメータを追加
 */

import { GPUParticleSystem } from '../../lib/GPUParticleSystem.js';
import * as THREE from 'three';

export class Scene09GPUParticleSystem extends GPUParticleSystem {
    constructor(renderer, particleCount, cols, rows, baseRadius, shaderPath = 'scene09', particleSize = 3.0, placementType = 'sphere') {
        super(renderer, particleCount, cols, rows, baseRadius, shaderPath, particleSize, placementType);
    }
    
    /**
     * 更新用シェーダーを作成（scene09専用のuniformsを追加）
     */
    createUpdateShader() {
        if (!this.shaders) {
            console.error('シェーダーが読み込まれていません');
            return;
        }
        
        // 位置更新用シェーダー（scene09専用のuniformsを追加）
        this.positionUpdateMaterial = new THREE.ShaderMaterial({
            uniforms: {
                positionTexture: { value: null },
                colorTexture: { value: null },
                time: { value: 0.0 },
                deltaTime: { value: 0.0 },
                noiseScale: { value: 0.5 },  // ノイズスケール（scene09専用、小さい = ノイズが大きく、粗い）
                noiseStrength: { value: 100.0 },  // ノイズ強度（scene09専用、パフォーマンスを考慮）
                baseRadius: { value: 400.0 },  // sphere配置用（scene09用に400に変更）
                width: { value: this.width },
                height: { value: this.height },
                curlNoiseTimeScale: { value: 1.0 },  // カールノイズの時間スケール（トラック9で変更）
                convergenceRadius: { value: 50.0 },  // 収束が始まる距離（球面からの距離）
                convergenceStrength: { value: 10.0 }  // 収束の強さ
            },
            vertexShader: this.shaders.positionUpdate.vertex,
            fragmentShader: this.shaders.positionUpdate.fragment
        });
        
        // 色更新用シェーダー
        this.colorUpdateMaterial = new THREE.ShaderMaterial({
            uniforms: {
                positionTexture: { value: null },
                colorTexture: { value: null },
                baseRadius: { value: 400.0 },  // sphere配置用（scene09用に400に変更）
                deltaTime: { value: 0.0 },
                width: { value: this.width },
                height: { value: this.height },
                time: { value: 0.0 },
                noiseScale: { value: 0.5 },  // カールノイズ用（小さい = ノイズが大きく、粗い）
                noiseStrength: { value: 100.0 }  // カールノイズ用（パフォーマンスを考慮）
            },
            vertexShader: this.shaders.colorUpdate.vertex,
            fragmentShader: this.shaders.colorUpdate.fragment
        });
        
        // 更新用メッシュを作成
        const geometry = new THREE.PlaneGeometry(2, 2);
        this.positionUpdateMesh = new THREE.Mesh(geometry, this.positionUpdateMaterial);
        this.colorUpdateMesh = new THREE.Mesh(geometry, this.colorUpdateMaterial);
        this.updateScene = new THREE.Scene();
        this.updateScene.add(this.positionUpdateMesh);
        this.updateScene.add(this.colorUpdateMesh);
        this.updateCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }
    
    /**
     * 初期パーティクルデータを設定（scene09専用）
     * 親クラスの'sphere'ケースのコードを完全にコピー
     */
    initializeParticleData() {
        const dataSize = this.width * this.height * 4;
        this.positionData = new Float32Array(dataSize);
        this.colorData = new Float32Array(dataSize);
        const positionData = this.positionData;
        const colorData = this.colorData;
        
        // 球面上に初期配置（親クラスのコードを完全にコピー）
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const index = (y * this.width + x) * 4;
                
                // 緯度・経度を計算（シンプルな線形計算）
                const u = x / (this.width - 1);  // 0.0～1.0
                const v = y / (this.height - 1);  // 0.0～1.0
                const longitude = u * Math.PI * 2.0;  // 0～2π
                const latitude = (v - 0.5) * Math.PI;  // -π/2～π/2
                
                // 球面上の位置
                const posX = this.baseRadius * Math.cos(latitude) * Math.cos(longitude);
                const posY = this.baseRadius * Math.sin(latitude);
                const posZ = this.baseRadius * Math.cos(latitude) * Math.sin(longitude);
                
                
                // 位置データ（x, y, z, lifetime）
                positionData[index] = posX;
                positionData[index + 1] = posY;
                positionData[index + 2] = posZ;
                // lifetimeをランダム化（初期値もランダムにして、一斉に消えるのを防ぐ）
                const initialLifetime = Math.random() * 10.0;  // 0.0～10.0秒のランダムな初期値
                positionData[index + 3] = initialLifetime;
                
                // 色データ（初期はグレー、AにmaxLifetimeを保存）
                colorData[index] = 0.5;     // r (初期色)
                colorData[index + 1] = 0.5; // g (初期色)
                colorData[index + 2] = 0.5; // b (初期色)
                // AにmaxLifetimeを保存（10.0～20.0秒を0.0～1.0に正規化、さらに長く）
                const maxLifetime = 10.0 + Math.random() * 10.0;  // 10.0～20.0秒（さらに長く）
                colorData[index + 3] = (maxLifetime - 10.0) / 10.0;  // 0.0～1.0に正規化
            }
        }
        
        // テクスチャを作成
        const positionTexture = new THREE.DataTexture(
            positionData,
            this.width,
            this.height,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        positionTexture.needsUpdate = true;
        
        const colorTexture = new THREE.DataTexture(
            colorData,
            this.width,
            this.height,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        colorTexture.needsUpdate = true;
        
        // RenderTargetにコピー
        this.copyTextureToRenderTarget(positionTexture, this.positionRenderTargets[0]);
        this.copyTextureToRenderTarget(colorTexture, this.colorRenderTargets[0]);
    }
    
    /**
     * 描画用シェーダーを作成（scene09専用のサイズ設定を追加）
     */
    createRenderShader() {
        // パーティクル用のジオメトリを作成（UV座標を使用）
        const positions = new Float32Array(this.particleCount * 3);
        const uvs = new Float32Array(this.particleCount * 2);
        const sizes = new Float32Array(this.particleCount);
        
        // 各パーティクルにUV座標を設定
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const index = y * this.width + x;
                const u = (x + 0.5) / this.width;
                const v = (y + 0.5) / this.height;
                
                uvs[index * 2] = u;
                uvs[index * 2 + 1] = v;
                
                // パーティクルサイズを固定に変更（ランダムサイズがブロック模様の原因だった）
                sizes[index] = this.particleSize;
            }
        }
        
        this.particleGeometry = new THREE.BufferGeometry();
        this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.particleGeometry.setAttribute('particleUv', new THREE.BufferAttribute(uvs, 2));
        this.particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        // 描画用シェーダーマテリアル
        if (!this.shaders) {
            console.error('シェーダーが読み込まれていません');
            return;
        }
        
        // ShaderMaterialを使用（RawShaderMaterialは問題があったため元に戻す）
        // ライティングを有効化
        // 初期テクスチャを作成（nullの代わりにダミーテクスチャを使用）
        const dummyTexture = new THREE.DataTexture(
            new Float32Array(4),
            1,
            1,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        dummyTexture.needsUpdate = true;
        
        this.particleMaterial = new THREE.ShaderMaterial({
            uniforms: {
                positionTexture: { value: dummyTexture },
                colorTexture: { value: dummyTexture },
                width: { value: this.width },
                height: { value: this.height }
            },
            vertexShader: this.shaders.particleRender.vertex,
            fragmentShader: this.shaders.particleRender.fragment,
            transparent: false,  // 完全に不透明にする
            vertexColors: true,
            lights: false,  // ライティングを無効化（シェーダーで使用していないため）
            depthTest: true,  // 深度テストを有効化（裏側を隠す）
            depthWrite: true  // 深度バッファに書き込み（裏側を隠す）
        });
        
        this.particleSystem = new THREE.Points(this.particleGeometry, this.particleMaterial);
    }
}







