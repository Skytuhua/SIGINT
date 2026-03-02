import type { CountryInfrastructure } from "../lib/news/types";

export const INFRASTRUCTURE_DATA: Record<string, CountryInfrastructure> = {
  US: {
    pipelines: [
      { name: "Colonial Pipeline", type: "pipeline", subtype: "oil", lat: 33.75, lon: -84.39, country: "US", lengthKm: 8851 },
      { name: "Keystone Pipeline", type: "pipeline", subtype: "oil", lat: 48.0, lon: -106.0, country: "US", lengthKm: 3456 },
      { name: "Spearhead Pipeline", type: "pipeline", subtype: "oil", lat: 41.5, lon: -87.6, country: "US", lengthKm: 132 },
      { name: "Flanagan South Pipeline", type: "pipeline", subtype: "oil", lat: 40.0, lon: -90.0, country: "US", lengthKm: 176 },
      { name: "Explorer Pipeline", type: "pipeline", subtype: "oil", lat: 33.0, lon: -97.0, country: "US", lengthKm: 325 },
      { name: "Permian Highway Pipeline", type: "pipeline", subtype: "gas", lat: 31.5, lon: -102.5, country: "US", lengthKm: 671 },
    ],
    dataCenters: [
      { name: "Project Rainier", type: "data_center", lat: 47.6, lon: -122.3, country: "US", distanceKm: 215 },
      { name: "Oracle OCI Supercluster B200s", type: "data_center", lat: 36.8, lon: -119.7, country: "US", distanceKm: 221 },
      { name: "Meta 100k", type: "data_center", lat: 37.4, lon: -122.1, country: "US", distanceKm: 238 },
      { name: "AWS US-East-1", type: "data_center", lat: 39.04, lon: -77.49, country: "US" },
      { name: "Google Council Bluffs", type: "data_center", lat: 41.26, lon: -95.86, country: "US" },
      { name: "Microsoft Quincy", type: "data_center", lat: 47.23, lon: -119.85, country: "US" },
    ],
    nuclearFacilities: [
      { name: "Comanche Peak", type: "nuclear", lat: 32.3, lon: -97.8, country: "US", capacity: "2430 MW", distanceKm: 523 },
      { name: "Pantex", type: "nuclear", lat: 35.31, lon: -101.57, country: "US", distanceKm: 528 },
      { name: "Palo Verde", type: "nuclear", lat: 33.39, lon: -112.86, country: "US", capacity: "3937 MW" },
      { name: "South Texas Project", type: "nuclear", lat: 28.8, lon: -96.05, country: "US", capacity: "2710 MW" },
      { name: "Vogtle", type: "nuclear", lat: 33.14, lon: -81.76, country: "US", capacity: "4600 MW" },
    ],
  },
  GB: {
    pipelines: [
      { name: "Forties Pipeline System", type: "pipeline", subtype: "oil", lat: 57.0, lon: -2.0, country: "GB", lengthKm: 338 },
      { name: "Bacton-Zeebrugge Interconnector", type: "pipeline", subtype: "gas", lat: 52.86, lon: 1.63, country: "GB", lengthKm: 235 },
    ],
    dataCenters: [
      { name: "Equinix LD7 Slough", type: "data_center", lat: 51.51, lon: -0.59, country: "GB" },
      { name: "AWS London", type: "data_center", lat: 51.5, lon: -0.12, country: "GB" },
    ],
    nuclearFacilities: [
      { name: "Hinkley Point C", type: "nuclear", lat: 51.21, lon: -3.13, country: "GB", capacity: "3260 MW" },
      { name: "Sizewell B", type: "nuclear", lat: 52.21, lon: 1.62, country: "GB", capacity: "1198 MW" },
      { name: "Sellafield", type: "nuclear", lat: 54.42, lon: -3.5, country: "GB" },
    ],
  },
  FR: {
    pipelines: [
      { name: "Donges-Melun-Metz Pipeline", type: "pipeline", subtype: "oil", lat: 47.26, lon: -1.6, country: "FR", lengthKm: 630 },
    ],
    dataCenters: [
      { name: "Equinix PA3 Paris", type: "data_center", lat: 48.86, lon: 2.35, country: "FR" },
      { name: "OVHcloud Roubaix", type: "data_center", lat: 50.69, lon: 3.17, country: "FR" },
    ],
    nuclearFacilities: [
      { name: "Gravelines", type: "nuclear", lat: 51.0, lon: 2.1, country: "FR", capacity: "5460 MW" },
      { name: "Cattenom", type: "nuclear", lat: 49.41, lon: 6.22, country: "FR", capacity: "5448 MW" },
      { name: "Flamanville", type: "nuclear", lat: 49.54, lon: -1.88, country: "FR", capacity: "2660 MW" },
    ],
  },
  DE: {
    pipelines: [
      { name: "Nord Stream (inactive)", type: "pipeline", subtype: "gas", lat: 54.1, lon: 13.4, country: "DE", lengthKm: 1224 },
      { name: "MIDAL Pipeline", type: "pipeline", subtype: "gas", lat: 52.0, lon: 9.5, country: "DE", lengthKm: 686 },
    ],
    dataCenters: [
      { name: "Equinix FR5 Frankfurt", type: "data_center", lat: 50.1, lon: 8.68, country: "DE" },
      { name: "AWS Frankfurt", type: "data_center", lat: 50.11, lon: 8.68, country: "DE" },
      { name: "DE-CIX Frankfurt", type: "data_center", lat: 50.1, lon: 8.68, country: "DE" },
    ],
    nuclearFacilities: [],
  },
  CN: {
    pipelines: [
      { name: "West-East Gas Pipeline", type: "pipeline", subtype: "gas", lat: 38.0, lon: 106.0, country: "CN", lengthKm: 8704 },
      { name: "Power of Siberia", type: "pipeline", subtype: "gas", lat: 50.0, lon: 130.0, country: "CN", lengthKm: 3000 },
    ],
    dataCenters: [
      { name: "Alibaba Zhangbei", type: "data_center", lat: 41.15, lon: 114.7, country: "CN" },
      { name: "Tencent Guiyang", type: "data_center", lat: 26.65, lon: 106.63, country: "CN" },
    ],
    nuclearFacilities: [
      { name: "Taishan", type: "nuclear", lat: 21.91, lon: 112.98, country: "CN", capacity: "3480 MW" },
      { name: "Yangjiang", type: "nuclear", lat: 21.71, lon: 112.26, country: "CN", capacity: "6000 MW" },
      { name: "Daya Bay", type: "nuclear", lat: 22.6, lon: 114.55, country: "CN", capacity: "1968 MW" },
    ],
  },
  JP: {
    pipelines: [
      { name: "Niigata-Sendai Pipeline", type: "pipeline", subtype: "gas", lat: 37.9, lon: 139.0, country: "JP", lengthKm: 350 },
    ],
    dataCenters: [
      { name: "Equinix TY11 Tokyo", type: "data_center", lat: 35.68, lon: 139.77, country: "JP" },
      { name: "AWS Tokyo", type: "data_center", lat: 35.68, lon: 139.77, country: "JP" },
    ],
    nuclearFacilities: [
      { name: "Kashiwazaki-Kariwa", type: "nuclear", lat: 37.43, lon: 138.6, country: "JP", capacity: "7965 MW" },
      { name: "Ohi", type: "nuclear", lat: 35.54, lon: 135.66, country: "JP", capacity: "4710 MW" },
    ],
  },
  IN: {
    pipelines: [
      { name: "HBJ Pipeline", type: "pipeline", subtype: "gas", lat: 23.0, lon: 72.5, country: "IN", lengthKm: 1750 },
      { name: "East-West Pipeline", type: "pipeline", subtype: "gas", lat: 17.0, lon: 81.0, country: "IN", lengthKm: 1480 },
    ],
    dataCenters: [
      { name: "AWS Mumbai", type: "data_center", lat: 19.08, lon: 72.88, country: "IN" },
      { name: "NTT Mumbai", type: "data_center", lat: 19.08, lon: 72.88, country: "IN" },
    ],
    nuclearFacilities: [
      { name: "Kudankulam", type: "nuclear", lat: 8.17, lon: 77.71, country: "IN", capacity: "4000 MW" },
      { name: "Tarapur", type: "nuclear", lat: 19.83, lon: 72.63, country: "IN", capacity: "1400 MW" },
    ],
  },
  RU: {
    pipelines: [
      { name: "Druzhba Pipeline", type: "pipeline", subtype: "oil", lat: 52.0, lon: 48.0, country: "RU", lengthKm: 5500 },
      { name: "TurkStream", type: "pipeline", subtype: "gas", lat: 44.6, lon: 37.9, country: "RU", lengthKm: 930 },
      { name: "Yamal-Europe Pipeline", type: "pipeline", subtype: "gas", lat: 67.0, lon: 70.0, country: "RU", lengthKm: 4107 },
    ],
    dataCenters: [
      { name: "Yandex Sasovo", type: "data_center", lat: 54.35, lon: 41.92, country: "RU" },
      { name: "DataLine Moscow", type: "data_center", lat: 55.75, lon: 37.62, country: "RU" },
    ],
    nuclearFacilities: [
      { name: "Leningrad Nuclear", type: "nuclear", lat: 59.84, lon: 29.05, country: "RU", capacity: "4600 MW" },
      { name: "Novovoronezh", type: "nuclear", lat: 51.28, lon: 39.22, country: "RU", capacity: "3720 MW" },
      { name: "Kursk Nuclear", type: "nuclear", lat: 51.67, lon: 35.61, country: "RU", capacity: "4800 MW" },
    ],
  },
  UA: {
    pipelines: [
      { name: "Brotherhood Pipeline System", type: "pipeline", subtype: "gas", lat: 50.0, lon: 30.0, country: "UA", lengthKm: 4600 },
    ],
    dataCenters: [
      { name: "De Novo Kyiv", type: "data_center", lat: 50.45, lon: 30.52, country: "UA" },
    ],
    nuclearFacilities: [
      { name: "Zaporizhzhia", type: "nuclear", lat: 47.51, lon: 34.59, country: "UA", capacity: "5700 MW" },
      { name: "Rivne", type: "nuclear", lat: 51.33, lon: 25.9, country: "UA", capacity: "2880 MW" },
      { name: "South Ukraine", type: "nuclear", lat: 47.81, lon: 31.22, country: "UA", capacity: "3000 MW" },
    ],
  },
  SA: {
    pipelines: [
      { name: "East-West Pipeline", type: "pipeline", subtype: "oil", lat: 24.0, lon: 45.0, country: "SA", lengthKm: 1200 },
      { name: "Master Gas System", type: "pipeline", subtype: "gas", lat: 26.0, lon: 50.0, country: "SA", lengthKm: 2400 },
    ],
    dataCenters: [
      { name: "STC Cloud Riyadh", type: "data_center", lat: 24.71, lon: 46.68, country: "SA" },
    ],
    nuclearFacilities: [],
  },
  BR: {
    pipelines: [
      { name: "GASBOL Pipeline", type: "pipeline", subtype: "gas", lat: -21.0, lon: -57.0, country: "BR", lengthKm: 3150 },
    ],
    dataCenters: [
      { name: "Equinix SP4 São Paulo", type: "data_center", lat: -23.55, lon: -46.63, country: "BR" },
    ],
    nuclearFacilities: [
      { name: "Angra Nuclear", type: "nuclear", lat: -23.0, lon: -44.46, country: "BR", capacity: "1990 MW" },
    ],
  },
  IL: {
    pipelines: [
      { name: "Eilat-Ashkelon Pipeline", type: "pipeline", subtype: "oil", lat: 31.0, lon: 34.5, country: "IL", lengthKm: 254 },
    ],
    dataCenters: [
      { name: "Bezeq Data Center", type: "data_center", lat: 32.07, lon: 34.78, country: "IL" },
    ],
    nuclearFacilities: [
      { name: "Dimona (research)", type: "nuclear", lat: 31.0, lon: 35.14, country: "IL" },
    ],
  },
  KR: {
    pipelines: [],
    dataCenters: [
      { name: "KT IDC Mokdong", type: "data_center", lat: 37.53, lon: 126.87, country: "KR" },
      { name: "AWS Seoul", type: "data_center", lat: 37.57, lon: 126.98, country: "KR" },
    ],
    nuclearFacilities: [
      { name: "Kori/Shin Kori", type: "nuclear", lat: 35.32, lon: 129.28, country: "KR", capacity: "7489 MW" },
      { name: "Hanbit", type: "nuclear", lat: 35.41, lon: 126.42, country: "KR", capacity: "5875 MW" },
    ],
  },
  CA: {
    pipelines: [
      { name: "Trans Mountain Pipeline", type: "pipeline", subtype: "oil", lat: 53.5, lon: -122.0, country: "CA", lengthKm: 1150 },
      { name: "Enbridge Line 5", type: "pipeline", subtype: "oil", lat: 46.0, lon: -84.0, country: "CA", lengthKm: 1038 },
    ],
    dataCenters: [
      { name: "AWS Montreal", type: "data_center", lat: 45.5, lon: -73.57, country: "CA" },
    ],
    nuclearFacilities: [
      { name: "Bruce Nuclear", type: "nuclear", lat: 44.33, lon: -81.6, country: "CA", capacity: "6232 MW" },
      { name: "Darlington", type: "nuclear", lat: 43.87, lon: -78.72, country: "CA", capacity: "3512 MW" },
    ],
  },
  AU: {
    pipelines: [
      { name: "Dampier-Bunbury Pipeline", type: "pipeline", subtype: "gas", lat: -29.0, lon: 115.0, country: "AU", lengthKm: 1530 },
    ],
    dataCenters: [
      { name: "Equinix SY4 Sydney", type: "data_center", lat: -33.87, lon: 151.21, country: "AU" },
      { name: "AWS Sydney", type: "data_center", lat: -33.87, lon: 151.21, country: "AU" },
    ],
    nuclearFacilities: [
      { name: "Lucas Heights (research)", type: "nuclear", lat: -34.05, lon: 150.98, country: "AU" },
    ],
  },
  TW: {
    pipelines: [],
    dataCenters: [
      { name: "Chief Telecom Taipei", type: "data_center", lat: 25.03, lon: 121.56, country: "TW" },
    ],
    nuclearFacilities: [
      { name: "Maanshan", type: "nuclear", lat: 21.96, lon: 120.75, country: "TW", capacity: "1930 MW" },
    ],
  },
};
