/**
 * 検索クエリ文字列を安定化する。
 * @param {{pref?: string, city?: string, cat?: string, keyword?: string}} query
 * @param {string} [cityCode]
 * @returns {string}
 */
export function createQuerySignature(query, cityCode = '') {
  const normalized = {
    pref: query?.pref || '',
    city: query?.city || '',
    cat: query?.cat || '',
    keyword: query?.keyword || '',
    cityCode: cityCode || '',
  };
  return JSON.stringify(normalized);
}

/**
 * 検索対象配列を自治体・都道府県単位でスコープする。
 * @param {{
 *  query: { pref?: string },
 *  cityCode?: string,
 *  aggregated: any[],
 *  getMunicipalityItems: (code: string) => any[],
 *  getPrefectureItems: (pref: string) => any[],
 * }} params
 * @returns {any[]}
 */
export function resolveRecordsForQuery({
  query,
  cityCode,
  aggregated,
  getMunicipalityItems,
  getPrefectureItems,
}) {
  if (cityCode) {
    const municipalRecords = getMunicipalityItems(cityCode);
    if (municipalRecords.length) return municipalRecords;
  }
  if (query?.pref) {
    const prefectureRecords = getPrefectureItems(query.pref);
    if (prefectureRecords.length) return prefectureRecords;
  }
  return aggregated;
}

/**
 * 単純な LRU キャッシュ。検索結果の短期保存に使用する。
 * @param {number} limit
 */
export function createLRUCache(limit = 5) {
  const store = new Map();
  return {
    get(key) {
      if (!store.has(key)) return undefined;
      const value = store.get(key);
      store.delete(key);
      store.set(key, value);
      return value;
    },
    set(key, value) {
      if (store.has(key)) store.delete(key);
      store.set(key, value);
      if (store.size > limit) {
        const oldestKey = store.keys().next().value;
        if (oldestKey) store.delete(oldestKey);
      }
    },
    clear() {
      store.clear();
    },
    size() {
      return store.size;
    },
  };
}
