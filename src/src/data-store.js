import { sortByLocale } from './utils.js';

/**
 * @typedef {Object} AggregatedRecord
 * @property {string} prefecture
 * @property {string} municipality_name
 * @property {string} [municipality_code]
 * @property {Array} [categories]
 */

const defaultResolvers = {
  resolvePrefecture(record) {
    return record.prefecture || '未分類';
  },
  resolveMunicipalityCode(record, pref) {
    if (record.municipality_code) return record.municipality_code;
    const city = record.municipality_name || '名称未設定';
    return `${pref}:${city}`;
  },
  resolveMunicipalityName(record) {
    return record.municipality_name || '名称未設定';
  },
};

const store = createEmptyStore();

function derivePrefectureCode(record) {
  if (!record) return null;
  if (record.prefecture_code) return record.prefecture_code;
  const muniCode = record.municipality_code || '';
  if (typeof muniCode === 'string' && muniCode.length >= 2) {
    return muniCode.slice(0, 2);
  }
  return null;
}

function createEmptyStore() {
  return {
    prefMap: new Map(),
    municipalityIndex: new Map(),
    totals: { items: 0, municipalities: 0, prefectures: 0 },
    options: { ...defaultResolvers },
  };
}

/**
 * aggregated records から都道府県 / 自治体索引を構築する。
 * @param {AggregatedRecord[]} records
 * @param {Object} [options]
 * @param {(record: AggregatedRecord) => string} [options.resolvePrefecture]
 * @param {(record: AggregatedRecord, pref: string) => string} [options.resolveMunicipalityCode]
 * @param {(record: AggregatedRecord) => string} [options.resolveMunicipalityName]
 */
export function initDataStore(records = [], options = {}) {
  const resolvers = {
    ...defaultResolvers,
    ...options,
  };
  store.prefMap = new Map();
  store.municipalityIndex = new Map();
  store.options = resolvers;

  records.forEach((record) => {
    const pref = resolvers.resolvePrefecture(record);
    const prefCode = derivePrefectureCode(record);
    if (!store.prefMap.has(pref)) {
      store.prefMap.set(pref, {
        name: pref,
        code: prefCode,
        municipalities: new Map(),
        itemCount: 0,
      });
    }
    const prefEntry = store.prefMap.get(pref);
    if (!prefEntry.code && prefCode) {
      prefEntry.code = prefCode;
    }
    prefEntry.itemCount += 1;

    const muniCode = resolvers.resolveMunicipalityCode(record, pref);
    const muniName = resolvers.resolveMunicipalityName(record);
    if (!prefEntry.municipalities.has(muniCode)) {
      const muniEntry = {
        code: muniCode,
        name: muniName,
        prefecture: pref,
        prefectureCode: prefEntry.code || prefCode || null,
        itemCount: 0,
        items: [],
        categorySet: new Set(),
      };
      prefEntry.municipalities.set(muniCode, muniEntry);
      store.municipalityIndex.set(muniCode, muniEntry);
    }
    const muniEntry = prefEntry.municipalities.get(muniCode);
    muniEntry.itemCount += 1;
    muniEntry.items.push(record);
    (record.categories || []).forEach((category) => {
      if (category) muniEntry.categorySet.add(category);
    });
  });

  store.totals = {
    items: records.length,
    municipalities: store.municipalityIndex.size,
    prefectures: store.prefMap.size,
  };
}

export function getPrefectureList() {
  return sortByLocale(
    Array.from(store.prefMap.values()).map((pref) => ({
      name: pref.name,
      code: pref.code || pref.name,
      municipalityCount: pref.municipalities.size,
      itemCount: pref.itemCount,
    })),
    (entry) => entry.name,
  );
}

export function getMunicipalitiesByPrefecture(prefName) {
  const pref = store.prefMap.get(prefName);
  if (!pref) return [];
  return sortByLocale(Array.from(pref.municipalities.values()), (entry) => entry.name);
}

export function getMunicipalityByCode(code) {
  return store.municipalityIndex.get(code) || null;
}

export function getMunicipalityItems(code) {
  const municipality = getMunicipalityByCode(code);
  return municipality ? municipality.items : [];
}

export function getPrefectureItems(prefName) {
  const pref = store.prefMap.get(prefName);
  if (!pref) return [];
  const aggregated = [];
  pref.municipalities.forEach((municipality) => {
    aggregated.push(...municipality.items);
  });
  return aggregated;
}

export function getMunicipalitySummary(code) {
  const municipality = getMunicipalityByCode(code);
  if (!municipality) return null;
  const categories = municipality.categorySet ? Array.from(municipality.categorySet) : [];
  return {
    code: municipality.code,
    name: municipality.name,
    prefecture: municipality.prefecture,
    itemCount: municipality.itemCount,
    categoryCount: categories.length,
    sampleCategories: categories.slice(0, 5),
  };
}

export function getMunicipalityDiagnostics({ lowThreshold = 5 } = {}) {
  const entries = Array.from(store.municipalityIndex.values());
  if (entries.length === 0) {
    return {
      stats: { averageItems: 0, medianItems: 0, minItems: { count: 0, municipalities: [] }, maxItems: { count: 0, municipalities: [] } },
      zeroMunicipalities: [],
      lowMunicipalities: [],
    };
  }
  const counts = entries.map((entry) => entry.itemCount).sort((a, b) => a - b);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const average = total / counts.length;
  const median = counts.length % 2 === 1
    ? counts[(counts.length - 1) / 2]
    : (counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2;

  const minCount = counts[0];
  const maxCount = counts[counts.length - 1];
  const formatEntry = (entry) => ({
    code: entry.code,
    name: entry.name,
    prefecture: entry.prefecture,
    itemCount: entry.itemCount,
  });

  const zeroMunicipalities = entries.filter((entry) => entry.itemCount === 0).map(formatEntry);
  const lowMunicipalities = entries
    .filter((entry) => entry.itemCount > 0 && entry.itemCount <= lowThreshold)
    .sort((a, b) => a.itemCount - b.itemCount)
    .map(formatEntry);

  return {
    stats: {
      averageItems: Number(average.toFixed(1)),
      medianItems: Number(median.toFixed(1)),
      minItems: {
        count: minCount,
        municipalities: entries.filter((entry) => entry.itemCount === minCount).map(formatEntry),
      },
      maxItems: {
        count: maxCount,
        municipalities: entries.filter((entry) => entry.itemCount === maxCount).map(formatEntry),
      },
    },
    zeroMunicipalities,
    lowMunicipalities,
  };
}

export function getTotals() {
  return store.totals;
}

export function getPrefectureStats() {
  return getPrefectureList();
}

export function getMunicipalityStats(prefName) {
  const pref = store.prefMap.get(prefName);
  if (!pref) return [];
  return sortByLocale(
    Array.from(pref.municipalities.values()).map((muni) => ({
      code: muni.code,
      name: muni.name,
      itemCount: muni.itemCount,
    })),
    (entry) => entry.name,
  );
}

export function getDataStoreSnapshot() {
  return {
    totals: { ...store.totals },
    prefectures: store.prefMap.size,
    municipalities: store.municipalityIndex.size,
    options: { ...store.options },
  };
}
