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
                    terrainNoiseSeed: null,  // シーン側で生成（init()時にランダム生成）
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
            const initOptions = { ...config.initOptions };  // コピーを作成
            // scene04固有：terrainNoiseSeedがnullの場合はランダム生成（シーン固有の処理だが、初期化時に必要）
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
            
            // シーン固有の初期化処理（初期位置データの計算など）は、シーン側で行う
            // ここではGPUParticleSystemの基本初期化のみを行う
            // シーン側では、setup()内でgetGPUParticleSystem()取得後に初期化処理を実行する
            
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
        // シーン固有の初期化処理は、シーン側で行う（initOptionsは設定のみ）
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
