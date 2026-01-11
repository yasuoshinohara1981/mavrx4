/**
 * SharedResourceManager
 * GPUパーティクル、CPUパーティクル、GPUインスタンシングなどの
 * 重いリソースを最初に初期化して共有するマネージャー
 * 
 * 目的：
 * - シーン切り替え時のラグをなくす
 * - 初期化に時間がかかっても問題ない（最初に一度だけ初期化）
 * - 使わないシーンではdisposeせず、update/レンダリングから処理を外す
 */

import { GPUParticleSystem } from './GPUParticleSystem.js';
import { InstancedMeshManager } from './InstancedMeshManager.js';
import * as THREE from 'three';

export class SharedResourceManager {
    constructor(renderer) {
        this.renderer = renderer;
        
        // GPUパーティクルシステムのプール（シーンごとに最大量を定義）
        this.gpuParticlePools = {
            // シーン1と3で使用：100万粒 = 1000 x 1000（メモリ不足対策で減らす）
            scene01: {
                maxParticles: 1000 * 1000,  // 1,000,000
                cols: 1000,
                rows: 1000,
                baseRadius: 400.0,
                particleSize: 3.0,
                placementType: 'sphere',
                shaderPath: 'scene01',
                pool: []  // 複数のインスタンスを保持（必要に応じて）
            },
            scene03: {
                maxParticles: 1000 * 1000,  // 1,000,000
                cols: 1000,
                rows: 1000,
                baseRadius: 400.0,
                particleSize: 3.0,
                placementType: 'sphere',
                shaderPath: 'scene03',
                pool: []
            },
            // シーン4で使用：100万粒 = 1000 x 1000（地形）
            scene04: {
                maxParticles: 1000 * 1000,  // 1,000,000
                cols: 1000,
                rows: 1000,
                baseRadius: 0.0,  // 使用しない（地形なので）
                particleSize: 10.0,  // 地形用に大きく
                placementType: 'terrain',  // terrain
                shaderPath: 'scene04',
                initOptions: {
                    terrainNoiseScale: 0.0001,
                    terrainNoiseSeed: null,  // 初期化時に生成
                    terrainScale: 5.0,
                    terrainZRange: { min: -100, max: 100 }
                },
                pool: []
            },
            // シーン9で使用：1万粒 = 100 x 100（リキッドグラス風エフェクト、メタボール効果）
            scene09: {
                maxParticles: 100 * 100,  // 10,000粒
                cols: 100,
                rows: 100,
                baseRadius: 200.0,  // 球面上に配置
                particleSize: 20.0,  // パーティクルサイズ（小さめ、メタボール効果で融合）
                placementType: 'sphere',  // sphere
                shaderPath: 'scene09',
                pool: []
            },
            // シーン10で使用：100万粒 = 1000 x 1000（カラビ・ヤウ多様体、メモリ不足対策で減らす）
            scene10: {
                maxParticles: 1000 * 1000,  // 1,000,000
                cols: 1000,
                rows: 1000,
                baseRadius: 0.0,  // 使用しない
                particleSize: 4.0,  // カラビ・ヤウ多様体用
                placementType: 'grid',  // デフォルト（カラビ・ヤウ多様体は後で初期化）
                shaderPath: 'scene10',
                pool: []
            }
        };
        
        // CPUパーティクルのプール（必要に応じて追加）
        this.cpuParticlePools = {};
        
        // GPUインスタンシングのプール（必要に応じて追加）
        this.instancedMeshPools = {};
        
        // 初期化フラグ
        this.isInitialized = false;
        this.initPromise = null;
        
        // 使用中のリソースを追跡（シーン名 -> リソースID）
        this.activeResources = new Map();
    }
    
    /**
     * 初期化（最大量のリソースを事前に作成）
     */
    async init() {
        if (this.isInitialized) {
            return;
        }
        
        console.log('[SharedResourceManager] 初期化開始...');
        const startTime = performance.now();
        
        // GPUパーティクルシステムのプールを初期化
        for (const [sceneName, config] of Object.entries(this.gpuParticlePools)) {
            console.log(`[SharedResourceManager] ${sceneName}のGPUパーティクルシステムを初期化中... (${config.maxParticles}粒)`);
            
            // 最大量のGPUパーティクルシステムを作成
            const initOptions = config.initOptions || {};
            // scene04の場合はノイズシードを生成
            if (sceneName === 'scene04' && !initOptions.terrainNoiseSeed) {
                initOptions.terrainNoiseSeed = Math.random() * 10000.0;
            }
            const gpuParticleSystem = new GPUParticleSystem(
                this.renderer,
                config.maxParticles,
                config.cols,
                config.rows,
                config.baseRadius,
                config.shaderPath,
                config.particleSize,
                config.placementType,
                initOptions
            );
            
            // 初期化完了を待つ（GPUParticleSystemのinitializeParticleData()も含まれる）
            await gpuParticleSystem.initPromise;
            
            // シーン9、10の場合は、初期位置データを事前に計算してテクスチャに保存
            // scene04はGPUParticleSystemのinitializeParticleData()で既に計算済み
            if (sceneName === 'scene09') {
                console.log(`[SharedResourceManager] ${sceneName}の初期位置データを計算中...`);
                const calcStartTime = performance.now();
                // sphereタイプはGPUParticleSystemのinitializeParticleData()で計算される
                gpuParticleSystem.initializeParticleData();
                const calcEndTime = performance.now();
                console.log(`[SharedResourceManager] ${sceneName}の初期位置データ計算完了 (${(calcEndTime - calcStartTime).toFixed(2)}ms)`);
            } else if (sceneName === 'scene10') {
                console.log(`[SharedResourceManager] ${sceneName}の初期位置データを計算中...`);
                const calcStartTime = performance.now();
                const { positionData, colorData } = this.calculateScene10InitialData(config.cols, config.rows);
                const calcEndTime = performance.now();
                console.log(`[SharedResourceManager] ${sceneName}の初期位置データ計算完了 (${(calcEndTime - calcStartTime).toFixed(2)}ms)`);
                
                // テクスチャを作成してRenderTargetに書き込む
                const positionTexture = new THREE.DataTexture(
                    positionData,
                    config.cols,
                    config.rows,
                    THREE.RGBAFormat,
                    THREE.FloatType
                );
                positionTexture.needsUpdate = true;
                
                const colorTexture = new THREE.DataTexture(
                    colorData,
                    config.cols,
                    config.rows,
                    THREE.RGBAFormat,
                    THREE.FloatType
                );
                colorTexture.needsUpdate = true;
                
                // RenderTargetにコピー
                gpuParticleSystem.copyTextureToRenderTarget(positionTexture, gpuParticleSystem.positionRenderTargets[0]);
                gpuParticleSystem.copyTextureToRenderTarget(colorTexture, gpuParticleSystem.colorRenderTargets[0]);
                
                // テクスチャを破棄（メモリ節約）
                positionTexture.dispose();
                colorTexture.dispose();
                
                console.log(`[SharedResourceManager] ${sceneName}の初期位置データ設定完了`);
            }
            
            // プールに追加
            config.pool.push(gpuParticleSystem);
            
            console.log(`[SharedResourceManager] ${sceneName}のGPUパーティクルシステム初期化完了`);
        }
        
        const endTime = performance.now();
        console.log(`[SharedResourceManager] 初期化完了 (${(endTime - startTime).toFixed(2)}ms)`);
        
        this.isInitialized = true;
    }
    
    /**
     * GPUパーティクルシステムを取得（シーン名で指定）
     * 既に使用中の場合は新しいインスタンスを作成（必要に応じて）
     */
    getGPUParticleSystem(sceneName) {
        if (!this.isInitialized) {
            throw new Error('SharedResourceManagerが初期化されていません。init()を先に呼んでください。');
        }
        
        const config = this.gpuParticlePools[sceneName];
        if (!config) {
            throw new Error(`シーン ${sceneName} のGPUパーティクル設定が見つかりません`);
        }
        
        // プールから未使用のインスタンスを探す
        // 現在は1つだけ保持するが、将来的に複数対応可能
        if (config.pool.length > 0) {
            const system = config.pool[0];
            
            // 使用中としてマーク
            this.activeResources.set(sceneName, system);
            
            return system;
        }
        
        // プールが空の場合は新規作成（通常は発生しない）
        console.warn(`[SharedResourceManager] ${sceneName}のプールが空です。新規作成します。`);
        const initOptions = config.initOptions || {};
        // scene04の場合はノイズシードを生成
        if (sceneName === 'scene04' && !initOptions.terrainNoiseSeed) {
            initOptions.terrainNoiseSeed = Math.random() * 10000.0;
        }
        const newSystem = new GPUParticleSystem(
            this.renderer,
            config.maxParticles,
            config.cols,
            config.rows,
            config.baseRadius,
            config.shaderPath,
            config.particleSize,
            config.placementType,
            initOptions
        );
        config.pool.push(newSystem);
        this.activeResources.set(sceneName, newSystem);
        
        return newSystem;
    }
    
    /**
     * GPUパーティクルシステムを返却（使用終了時）
     * 実際にはdisposeせず、プールに戻すだけ
     */
    releaseGPUParticleSystem(sceneName) {
        // 使用中フラグを解除（実際にはdisposeしない）
        this.activeResources.delete(sceneName);
        console.log(`[SharedResourceManager] ${sceneName}のGPUパーティクルシステムを返却（メモリ上には保持）`);
    }
    
    /**
     * リソースの有効/無効を切り替え（update/レンダリングのスキップ制御）
     */
    setResourceActive(sceneName, active) {
        const resource = this.activeResources.get(sceneName);
        if (resource) {
            // リソースにactiveフラグを設定（各リソースクラスで実装が必要）
            if (resource.setActive) {
                resource.setActive(active);
            }
        }
    }
    
    /**
     * 共有リソースのテクスチャを初期状態に戻す
     * シーン切り替え時に呼び出して、テクスチャの状態をリセット
     */
    resetResourceToInitialState(sceneName) {
        const resource = this.activeResources.get(sceneName);
        if (!resource) {
            // アクティブでない場合は、プールから取得
            const config = this.gpuParticlePools[sceneName];
            if (config && config.pool && config.pool.length > 0) {
                const pooledResource = config.pool[0];
                if (pooledResource && pooledResource.resetToInitialState) {
                    pooledResource.resetToInitialState();
                    console.log(`[SharedResourceManager] ${sceneName}のテクスチャを初期状態にリセット`);
                }
            }
        } else {
            // アクティブなリソースの場合は直接リセット
            if (resource.resetToInitialState) {
                resource.resetToInitialState();
                console.log(`[SharedResourceManager] ${sceneName}のテクスチャを初期状態にリセット`);
            }
        }
    }
    
    /**
     * シーン10の初期位置データを計算（カラビ・ヤウ多様体）
     * シーン10のcalabiYauPosition()と同じ計算を実行（t=0.0で初期位置を計算）
     */
    calculateScene10InitialData(cols, rows) {
        const width = cols;
        const height = rows;
        const dataSize = width * height * 4;
        const positionData = new Float32Array(dataSize);
        const colorData = new Float32Array(dataSize);
        
        // カラビ・ヤウ多様体のパラメータ（シーン10と同じ）
        const manifoldScale = 250.0;
        const manifoldComplexity = 2.5;  // シーン10のデフォルト値
        
        // カラビ・ヤウ多様体のパラメトリック方程式（シーン10のcalabiYauPosition()を完全にコピー）
        const calabiYauPosition = (u, v, t) => {
            const r = Math.sqrt(u * u + v * v);
            const theta = Math.atan2(v, u);
            
            // RandomLFOの実装（シェーダーと同じロジック）
            const hash = (n) => {
                const s = Math.sin(n) * 43758.5453;
                return ((s % 1) + 1) % 1;
            };
            
            const randomLFO = (t, seed) => {
                const freq = 0.1 + hash(seed) * 0.4;
                const phase = hash(seed * 1.5) * Math.PI * 2;
                const waveType = hash(seed * 2.3);
                
                let value;
                if (waveType < 0.33) {
                    value = Math.sin(t * freq * Math.PI * 2 + phase);
                } else if (waveType < 0.66) {
                    value = Math.cos(t * freq * Math.PI * 2 + phase);
                } else {
                    value = Math.sin(t * freq * Math.PI * 2 + phase) * Math.cos(t * freq * 0.5 * Math.PI * 2 + phase * 0.7);
                }
                
                const ampMod = 0.5 + 0.5 * hash(seed * 3.7);
                return value * ampMod;
            };
            
            const getComplexityModulation = (t) => {
                const lfo1 = randomLFO(t, 1.0);
                const lfo2 = randomLFO(t * 0.7, 2.0);
                const lfo3 = randomLFO(t * 0.5, 3.0);
                const combined = lfo1 * 0.5 + lfo2 * 0.3 + lfo3 * 0.2;
                return (combined + 1.0) * 0.5;
            };
            
            const complexityMod = getComplexityModulation(t);
            const minComplexity = 0.7;
            const maxComplexity = 1.8;
            const timeComplexity = minComplexity + (maxComplexity - minComplexity) * complexityMod;
            const dynamicComplexity = manifoldComplexity * timeComplexity;
            
            // 複数の周波数を組み合わせ
            const freq1 = dynamicComplexity * 1.0;
            const freq2 = dynamicComplexity * 2.5;
            const freq3 = dynamicComplexity * 4.0;
            const highFreqMod1 = getComplexityModulation(t * 0.3);
            const highFreqMod2 = getComplexityModulation(t * 0.25);
            const freq4 = dynamicComplexity * 6.0 * highFreqMod1;
            const freq5 = dynamicComplexity * 8.0 * highFreqMod2;
            
            // 時間アニメーション
            const t1 = t * (0.3 + 0.1 * Math.sin(t * 0.1));
            const t2 = t * (0.5 + 0.1 * Math.cos(t * 0.12));
            const t3 = t * (0.7 + 0.1 * Math.sin(t * 0.14));
            const t4 = t * (0.4 + 0.2 * Math.sin(t * 0.08));
            const t5 = t * (0.6 + 0.2 * Math.cos(t * 0.09));
            
            // ノイズの実装
            const smoothNoise = (p) => {
                const i = {
                    x: Math.floor(p.x),
                    y: Math.floor(p.y),
                    z: Math.floor(p.z)
                };
                const f = {
                    x: p.x - i.x,
                    y: p.y - i.y,
                    z: p.z - i.z
                };
                f.x = f.x * f.x * (3.0 - 2.0 * f.x);
                f.y = f.y * f.y * (3.0 - 2.0 * f.y);
                f.z = f.z * f.z * (3.0 - 2.0 * f.z);
                
                const n = i.x + i.y * 57.0 + i.z * 113.0;
                const a = hash(n);
                const b = hash(n + 1.0);
                const c = hash(n + 57.0);
                const d = hash(n + 58.0);
                const e = hash(n + 113.0);
                const f1 = hash(n + 114.0);
                const g = hash(n + 170.0);
                const h = hash(n + 171.0);
                
                const x1 = a + (b - a) * f.x;
                const x2 = c + (d - c) * f.x;
                const y1 = x1 + (x2 - x1) * f.y;
                
                const x3 = e + (f1 - e) * f.x;
                const x4 = g + (h - g) * f.x;
                const y2 = x3 + (x4 - x3) * f.y;
                
                return y1 + (y2 - y1) * f.z;
            };
            
            const noiseScaleMod = getComplexityModulation(t * 0.4);
            const noiseScale = 0.3 + noiseScaleMod * 0.4;
            const noiseStrengthMod = getComplexityModulation(t * 0.35);
            const noiseStrength = 0.08 + noiseStrengthMod * 0.12;
            const noisePos = { x: u * 2.0 + t1, y: v * 2.0 + t2, z: t3 };
            const noiseValue = smoothNoise({ x: noisePos.x * noiseScale, y: noisePos.y * noiseScale, z: noisePos.z * noiseScale }) * noiseStrength;
            const highNoiseMod = getComplexityModulation(t * 0.45);
            const noisePos2 = { x: u * 3.0 + t4, y: v * 3.0 + t5, z: t * 0.5 };
            const noiseValue2 = smoothNoise({ x: noisePos2.x * noiseScale * 1.5, y: noisePos2.y * noiseScale * 1.5, z: noisePos2.z * noiseScale * 1.5 }) * (noiseStrength * 0.5) * highNoiseMod;
            
            // 複数のsin波を組み合わせ
            const R1 = 1.0 + 0.15 * Math.sin(freq1 * theta + t1);
            const R2 = 0.12 * Math.sin(freq2 * theta + t2);
            const R3 = 0.08 * Math.sin(freq3 * theta + t3);
            const R4Mod = getComplexityModulation(t * 0.3);
            const R5Mod = getComplexityModulation(t * 0.25);
            const R4 = 0.06 * Math.sin(freq4 * theta + t4) * R4Mod;
            const R5 = 0.04 * Math.sin(freq5 * theta + t5) * R5Mod;
            const R = R1 + R2 + R3 + R4 + R5 + noiseValue + noiseValue2;
            
            // phiを複雑に
            const phi = r * Math.PI;
            const phiMod1 = 0.12 * Math.sin(2.0 * theta + t1);
            const phiMod2 = 0.08 * Math.sin(3.0 * r + t2);
            const phiMod3Mod = getComplexityModulation(t * 0.35);
            const phiMod4Mod = getComplexityModulation(t * 0.3);
            const phiMod3 = 0.06 * Math.sin(4.0 * theta + 2.0 * r + t3) * phiMod3Mod;
            const phiMod4 = 0.04 * Math.sin(5.0 * theta + 3.0 * r + t4) * phiMod4Mod;
            const phiMod = phi + phiMod1 + phiMod2 + phiMod3 + phiMod4;
            
            // 3D座標を計算
            const x = R * Math.cos(theta) * Math.sin(phiMod);
            const y = R * Math.sin(theta) * Math.sin(phiMod);
            
            const z1 = Math.cos(phiMod);
            const z2 = 0.12 * Math.sin(2.0 * theta + t1);
            const z3 = 0.08 * Math.cos(3.0 * r + t2);
            const z4 = 0.06 * Math.sin(5.0 * theta + t3);
            const z5Mod = getComplexityModulation(t * 0.4);
            const z6Mod = getComplexityModulation(t * 0.35);
            const z5 = 0.04 * Math.cos(6.0 * theta + 2.0 * r + t4) * z5Mod;
            const z6 = 0.03 * Math.sin(7.0 * theta + 3.0 * r + t5) * z6Mod;
            const z = z1 + z2 + z3 + z4 + z5 + z6;
            
            // 追加の変形
            const twistMod = getComplexityModulation(t * 0.5);
            const twistStrength = 0.04 + twistMod * 0.08;
            const twist = twistStrength * Math.sin(4.0 * theta + 2.0 * t);
            const twist2Mod = getComplexityModulation(t * 0.45);
            const twist2 = twistStrength * 0.5 * Math.cos(5.0 * theta + 3.0 * t) * twist2Mod;
            let finalX = x + twist * Math.cos(theta) + twist2 * Math.sin(theta);
            let finalY = y + twist * Math.sin(theta) + twist2 * Math.cos(theta);
            const zMod1 = getComplexityModulation(t * 0.4);
            let finalZ = z + 0.04 * Math.cos(6.0 * theta + 1.5 * t) + 0.02 * Math.sin(8.0 * theta + 2.5 * t) * zMod1;
            
            // さらに高次の変形
            const highFreqModX = getComplexityModulation(t * 0.5);
            const highFreqModY = getComplexityModulation(t * 0.48);
            const highFreqModZ = getComplexityModulation(t * 0.46);
            finalX += 0.02 * Math.sin(9.0 * theta + 4.0 * r + t * 1.2) * highFreqModX;
            finalY += 0.02 * Math.cos(10.0 * theta + 5.0 * r + t * 1.3) * highFreqModY;
            finalZ += 0.02 * Math.sin(11.0 * theta + 6.0 * r + t * 1.4) * highFreqModZ;
            
            return { x: finalX, y: finalY, z: finalZ };
        };
        
        // 初期位置データを計算（t=0.0で計算）
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4;
                
                // パラメータ空間での座標（-1 ～ 1）
                const u = (x / width) * 2.0 - 1.0;
                const v = (y / height) * 2.0 - 1.0;
                
                // カラビ・ヤウ多様体のパラメトリック方程式（t=0.0で初期位置を計算）
                const pos = calabiYauPosition(u, v, 0.0);
                
                // 位置データ
                positionData[index] = pos.x * manifoldScale;
                positionData[index + 1] = pos.y * manifoldScale;
                positionData[index + 2] = pos.z * manifoldScale;
                positionData[index + 3] = pos.z * manifoldScale;
                
                // 色データ（初期色、明るく）
                colorData[index] = 0.9;
                colorData[index + 1] = 0.9;
                colorData[index + 2] = 0.9;
                colorData[index + 3] = 1.0;
            }
        }
        
        return { positionData, colorData };
    }
    
    /**
     * 全リソースをクリーンアップ（アプリ終了時のみ）
     */
    dispose() {
        console.log('[SharedResourceManager] 全リソースをクリーンアップ中...');
        
        // 全GPUパーティクルシステムを破棄
        for (const [sceneName, config] of Object.entries(this.gpuParticlePools)) {
            for (const system of config.pool) {
                if (system.dispose) {
                    system.dispose();
                }
            }
            config.pool = [];
        }
        
        this.activeResources.clear();
        this.isInitialized = false;
        
        console.log('[SharedResourceManager] クリーンアップ完了');
    }
}
