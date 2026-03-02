/**
 * pure_skies HDRI（src/assets/hdri/pure_skies/ 配下）
 * import.meta.glob でビルド時に取り込み、ランダム選択
 */

// ビルド時に src/assets/hdri/pure_skies/*.exr をすべて取り込む
const hdriModules = import.meta.glob('./hdri/pure_skies/*.exr', { eager: true, as: 'url' });
const hdriEntries = Object.entries(hdriModules);

/** ファイル名から光源・フレア設定を推定 */
function getLightConfigFromFilename(filename) {
  const name = filename.toLowerCase();
  if (name.includes('night') || name.includes('moon')) {
    return {
      sunPosition: { x: 1500, y: 3500, z: 7000 },
      sunColor: 0x8899bb,
      sunIntensity: 0.25,
      useLensFlare: false,
      lensFlareIntensity: 0,
      fogColor: 0x1a2030,
      fogDensity: 0.00012
    };
  }
  if (name.includes('sunset') || name.includes('dusk') || name.includes('dawn') || name.includes('sunrise') || name.includes('evening')) {
    return {
      sunPosition: { x: 2500, y: 2000, z: 8500 },
      sunColor: 0xffcc88,
      sunIntensity: 1.0,
      useLensFlare: true,
      lensFlareIntensity: 0.4,
      fogColor: 0xd4a574,
      fogDensity: 0.0001
    };
  }
  if (name.includes('overcast') || name.includes('misty') || name.includes('clouds')) {
    return {
      sunPosition: { x: 3000, y: 6500, z: 5000 },
      sunColor: 0xe8e8e8,
      sunIntensity: 0.6,
      useLensFlare: false,
      lensFlareIntensity: 0,
      fogColor: 0xb8c4d0,
      fogDensity: 0.0001
    };
  }
  if (name.includes('partly_cloudy')) {
    return {
      sunPosition: { x: 3000, y: 7500, z: 5000 },
      sunColor: 0xfff0e0,
      sunIntensity: 0.95,
      useLensFlare: true,
      lensFlareIntensity: 0.22,
      fogColor: 0xb5d4e8,
      fogDensity: 0.00008
    };
  }
  if (name.includes('noon') || name.includes('afternoon') || name.includes('mid_morning') || name.includes('morning')) {
    return {
      sunPosition: { x: 3000, y: 8500, z: 5000 },
      sunColor: 0xfff5e6,
      sunIntensity: 1.25,
      useLensFlare: true,
      lensFlareIntensity: 0.2,
      fogColor: 0xb5d4e8,
      fogDensity: 0.00008
    };
  }
  if (name.includes('clear')) {
    return {
      sunPosition: { x: 3000, y: 8000, z: 5000 },
      sunColor: 0xffffff,
      sunIntensity: 1.3,
      useLensFlare: true,
      lensFlareIntensity: 0.28,
      fogColor: 0xb5d4e8,
      fogDensity: 0.00006
    };
  }
  return {
    sunPosition: { x: 3000, y: 8000, z: 5000 },
    sunColor: 0xfff5e6,
    sunIntensity: 1.2,
    useLensFlare: true,
    lensFlareIntensity: 0.25,
    fogColor: 0xb5d4e8,
    fogDensity: 0.00008
  };
}

/**
 * ランダムに1つ選んで URL と光源・フレア設定を返す
 * src/assets/hdri/pure_skies/ 内の全ファイルから選択
 */
export function getRandomPureSky() {
  if (hdriEntries.length === 0) {
    console.warn('pureSkiesList: No HDRI files found in src/assets/hdri/pure_skies/');
    return {
      url: '',
      filename: '(none)',
      sunPosition: { x: 3000, y: 8000, z: 5000 },
      sunColor: 0xfff5e6,
      sunIntensity: 1.2,
      useLensFlare: true,
      lensFlareIntensity: 0.25,
      fogColor: 0xb5d4e8,
      fogDensity: 0.00008
    };
  }
  const [path, url] = hdriEntries[Math.floor(Math.random() * hdriEntries.length)];
  const filename = path.split('/').pop() || path;
  const config = getLightConfigFromFilename(filename);
  return {
    url,
    filename,
    ...config
  };
}
