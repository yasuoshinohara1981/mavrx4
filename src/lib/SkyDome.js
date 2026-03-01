/**
 * SkyDome: HDRIスカイドームの共通クラス
 * シーンにHDRIを環境マップ・背景として適用する
 * 使用するHDRIは引数でシーン側から渡す
 */

import * as THREE from 'three';
import { loadHdrCached } from './hdrCache.js';

export class SkyDome {
    /**
     * @param {THREE.Scene} scene - 適用先シーン
     */
    constructor(scene) {
        this.scene = scene;
        this.envMap = null;
    }

    /**
     * HDRIを読み込み、スカイドームを適用
     * @param {string} hdriUrl - HDRIファイルのURL（importで取得したものを渡す）
     * @param {Object} [options] - オプション
     * @param {number} [options.environmentIntensity=1.5] - 環境マップの強度
     * @param {number} [options.fogColor=0xb5d4e8] - フォグの色
     * @param {number} [options.fogDensity=0.00008] - フォグの密度
     * @param {boolean} [options.fog=true] - フォグを有効にするか
     * @returns {Promise<THREE.Texture>} envMap（マテリアルのenvMapに渡す用）
     */
    async setup(hdriUrl, options = {}) {
        if (!hdriUrl) throw new Error('SkyDome.setup: hdriUrl is required');

        const envMap = await loadHdrCached(hdriUrl);
        envMap.mapping = THREE.EquirectangularReflectionMapping;

        this.scene.environment = envMap;
        this.scene.environmentIntensity = options.environmentIntensity ?? 1.5;
        this.scene.background = envMap;

        if (options.fog !== false) {
            this.scene.fog = new THREE.FogExp2(
                options.fogColor ?? 0xb5d4e8,
                options.fogDensity ?? 0.00008
            );
        }

        this.envMap = envMap;
        return envMap;
    }

    /**
     * スカイドームを解除
     */
    dispose() {
        if (this.scene) {
            this.scene.environment = null;
            this.scene.background = null;
            this.scene.fog = null;
        }
        this.envMap = null;
    }
}
