/**
 * pure_skies HDRI ファイル一覧（public/assets/hdri/pure_skies/ 配下）
 * ランダム選択用
 */
export const PURE_SKIES_FILES = [
  'aristea_wreck_puresky_4k.exr',
  'autumn_field_puresky_4k.exr',
  'belfast_sunset_puresky_4k.exr',
  'citrus_orchard_puresky_4k.exr',
  'citrus_orchard_road_puresky_4k.exr',
  'drackenstein_quarry_puresky_4k.exr',
  'drakensberg_solitary_mountain_puresky_4k.exr',
  'evening_road_01_puresky_4k.exr',
  'farm_field_puresky_4k.exr',
  'hilly_terrain_01_puresky_4k.exr',
  'industrial_sunset_02_puresky_4k.exr',
  'industrial_sunset_puresky_4k.exr',
  'kloofendal_28d_misty_puresky_4k.exr',
  'kloofendal_38d_partly_cloudy_puresky_4k.exr',
  'kloofendal_43d_clear_puresky_4k.exr',
  'kloofendal_48d_partly_cloudy_puresky_4k.exr',
  'kloofendal_misty_morning_puresky_4k.exr',
  'kloofendal_overcast_puresky_4k.exr',
  'kloppenheim_01_puresky_4k.exr',
  'kloppenheim_02_puresky_4k.exr',
  'kloppenheim_03_puresky_4k.exr',
  'kloppenheim_05_puresky_4k.exr',
  'kloppenheim_06_puresky_4k.exr',
  'kloppenheim_06_puresky_4k (1).exr',
  'kloppenheim_07_puresky_4k.exr',
  'lonely_road_afternoon_puresky_4k.exr',
  'mpumalanga_veld_puresky_4k.exr',
  'mud_road_puresky_4k.exr',
  'overcast_soil_puresky_4k.exr',
  'pizzo_pernice_puresky_4k.exr',
  'quarry_01_puresky_4k.exr',
  'quarry_04_puresky_4k.exr',
  'qwantani_afternoon_puresky_4k.exr',
  'qwantani_dawn_puresky_4k.exr',
  'qwantani_dusk_1_puresky_4k.exr',
  'qwantani_dusk_2_puresky_4k.exr',
  'qwantani_late_afternoon_puresky_4k.exr',
  'qwantani_mid_morning_puresky_4k.exr',
  'qwantani_moon_noon_puresky_4k.exr',
  'qwantani_moonrise_puresky_4k.exr',
  'qwantani_morning_puresky_4k.exr',
  'qwantani_night_puresky_4k.exr',
  'qwantani_noon_puresky_4k.exr',
  'qwantani_puresky_4k.exr',
  'qwantani_sunrise_puresky_4k.exr',
  'qwantani_sunset_puresky_4k.exr',
  'rosendal_park_sunset_puresky_4k.exr',
  'rustig_koppie_puresky_4k.exr',
  'scythian_tombs_puresky_4k.exr',
  'snow_field_2_puresky_4k.exr',
  'sunflowers_puresky_4k.exr',
  'syferfontein_0d_clear_puresky_4k.exr',
  'syferfontein_18d_clear_puresky_4k.exr',
  'syferfontein_1d_clear_puresky_4k.exr',
  'syferfontein_6d_clear_puresky_4k.exr',
  'table_mountain_1_puresky_4k.exr',
  'table_mountain_2_puresky_4k.exr',
  'wasteland_clouds_puresky_4k.exr',
];

const BASE_URL = '/assets/hdri/pure_skies/';

/** ファイル名から光源・フレア設定を推定 */
function getLightConfigFromFilename(filename) {
  const name = filename.toLowerCase();
  // 夜・月系：暗い、フレアなし
  if (name.includes('night') || name.includes('moon')) {
    return {
      sunPosition: { x: 1500, y: 3500, z: 7000 },
      sunColor: 0x8899bb,
      sunIntensity: 0.25,
      useLensFlare: false,
      fogColor: 0x1a2030,
      fogDensity: 0.00012
    };
  }
  // 夕焼け・朝焼け・夕暮れ・夜明け：太陽低い、暖色、フレア強め
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
  // 曇り・霧・オーバーキャスト：拡散光、フレアなし
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
  // 部分的に曇り：やや拡散
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
  // 正午・午後・朝：太陽高い、明るい
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
  // クリア：明るい太陽
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
  // デフォルト：日中想定
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
 */
export function getRandomPureSky() {
  const file = PURE_SKIES_FILES[Math.floor(Math.random() * PURE_SKIES_FILES.length)];
  const config = getLightConfigFromFilename(file);
  return {
    url: BASE_URL + file,
    ...config
  };
}
