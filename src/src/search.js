import { state } from './state.js';
import { normalizeText, unique } from './utils.js';
import { normalizeCategoryCode } from './categories.js';

/**
 * @typedef {Object} AggregatedItem
 * @property {string} prefecture
 * @property {string} municipality_name
 * @property {string} [municipality_code]
 * @property {string} item_name
 * @property {string[]} [categories]
 * @property {string[]} [instructions]
 */

const ITEM_KEYS = ['item_name', 'item_name_raw', 'item'];
const HOW_TO_KEYS = ['how_to', 'notes', 'note_raw'];
const CATEGORY_KEYS = ['category_normalized', 'category_name', 'category_raw'];

function pickFirst(row, keys) {
  for (const key of keys) {
    if (row[key]) return row[key];
  }
  return '';
}

/**
 * 生データを市区町村 + 品目単位に集約する。
 * @param {Array<Record<string, any>>} rows
 * @returns {AggregatedItem[]}
 */
export function aggregateRows(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const pref = row.prefecture || '';
    const city = row[state.cityKey] || row.municipality_name || '';
    const code = row.municipality_code || `${pref}:${city}`;
    const itemName = pickFirst(row, ITEM_KEYS);
    const key = `${pref}|||${city}|||${normalizeText(itemName)}`;
    if (!map.has(key)) {
      map.set(key, {
        pref,
        city,
        code,
        item: itemName,
        item_en: row.item_name_en || '',
        rows: [],
        categories: new Set(),
        howToSet: new Set(),
        urls: new Set(),
      });
    }
    const entry = map.get(key);
    if (!entry.code && code) entry.code = code;
    entry.rows.push(row);
    const categoryRaw = pickFirst(row, CATEGORY_KEYS);
    const categoryCode = row.category_code || normalizeCategoryCode(categoryRaw);
    if (categoryCode) entry.categories.add(categoryCode);
    HOW_TO_KEYS.forEach((field) => {
      if (row[field]) entry.howToSet.add(row[field]);
    });
    if (row.how_to_en) {
      if (!entry.howToEn) entry.howToEn = new Set();
      entry.howToEn.add(row.how_to_en);
    }
    ['source_url', 'primary_url', 'item_url', 'url', 'link', 'リンク'].forEach((keyCandidate) => {
      if (row[keyCandidate]) entry.urls.add(row[keyCandidate]);
    });
  });

  const aggregated = Array.from(map.values()).map((entry) => ({
    prefecture: entry.pref,
    municipality_name: entry.city,
    municipality_code: entry.code,
    item_name: entry.item,
    item_name_en: entry.item_en,
    categories: Array.from(entry.categories),
    instructions: Array.from(entry.howToSet),
    instructions_en: entry.howToEn ? Array.from(entry.howToEn) : [],
    urls: Array.from(entry.urls),
    conflicts: entry.categories.size > 1 || entry.howToSet.size > 1,
    sources: entry.rows,
  }));
  return aggregated;
}

function matchKeyword(record, keyword) {
  if (!keyword) return true;
  const needle = normalizeText(keyword);
  const haystack = normalizeText(
    [
      record.item_name,
      ...(record.instructions || []),
      ...record.categories,
    ]
      .filter(Boolean)
      .join(' ')
  );
  return haystack.includes(needle);
}

function matchPref(record, pref) {
  if (!pref) return true;
  return record.prefecture === pref;
}

function matchCity(record, city) {
  if (!city) return true;
  return record.municipality_name === city;
}

function matchCategory(record, cat) {
  if (!cat) return true;
  return record.categories?.some(
    (category) => category === cat || normalizeText(category) === normalizeText(cat)
  );
}

/**
 * Pref / City / Category / Keyword 条件でレコードをフィルタする。
 * @param {AggregatedItem[]} records
 * @param {{pref?: string, city?: string, cat?: string, keyword?: string}} query
 * @returns {AggregatedItem[]}
 */
export function filterRecords(records, { pref, city, cat, keyword }) {
  return records.filter((record) =>
    matchPref(record, pref) &&
    matchCity(record, city) &&
    matchCategory(record, cat) &&
    matchKeyword(record, keyword)
  );
}

/**
 * 指定キーで locale 非依存ソートする。
 * @param {AggregatedItem[]} records
 * @param {string} sortKey
 * @param {boolean} sortAsc
 * @returns {AggregatedItem[]}
 */
export function sortRecords(records, sortKey, sortAsc) {
  if (!sortKey) return records;
  const sorted = [...records].sort((a, b) => {
    const left = normalizeText(a[sortKey] || '');
    const right = normalizeText(b[sortKey] || '');
    if (left === right) return 0;
    return left > right ? 1 : -1;
  });
  return sortAsc ? sorted : sorted.reverse();
}

/**
 * ページネーション結果を返す。
 * @param {AggregatedItem[]} records
 * @param {number} page
 * @param {number} pageSize
 * @returns {AggregatedItem[]}
 */
export function paginate(records, page, pageSize) {
  const start = (page - 1) * pageSize;
  return records.slice(start, start + pageSize);
}

/**
 * レコード集合からカテゴリ一覧を生成する。
 * @param {AggregatedItem[]} records
 * @returns {string[]}
 */
export function getCategoryList(records) {
  return unique(records.flatMap((record) => record.categories || []).filter(Boolean)).sort();
}
