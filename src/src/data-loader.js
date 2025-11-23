const DEFAULT_DATASET_PATH = 'data/merged.json';
const EMBEDDED_DATA_ELEMENT_ID = 'embedded-data';
const FALLBACK_MODULE_PATH = '../data/merged.js';

const PREF_SLUGS = {
  '01': 'hokkaido',
  '02': 'aomori',
  '03': 'iwate',
  '04': 'miyagi',
  '05': 'akita',
  '06': 'yamagata',
  '07': 'fukushima',
  '08': 'ibaraki',
  '09': 'tochigi',
  '10': 'gunma',
  '11': 'saitama',
  '12': 'chiba',
  '13': 'tokyo',
  '14': 'kanagawa',
  '15': 'niigata',
  '16': 'toyama',
  '17': 'ishikawa',
  '18': 'fukui',
  '19': 'yamanashi',
  '20': 'nagano',
  '21': 'gifu',
  '22': 'shizuoka',
  '23': 'aichi',
  '24': 'mie',
  '25': 'shiga',
  '26': 'kyoto',
  '27': 'osaka',
  '28': 'hyogo',
  '29': 'nara',
  '30': 'wakayama',
  '31': 'tottori',
  '32': 'shimane',
  '33': 'okayama',
  '34': 'hiroshima',
  '35': 'yamaguchi',
  '36': 'tokushima',
  '37': 'kagawa',
  '38': 'ehime',
  '39': 'kochi',
  '40': 'fukuoka',
  '41': 'saga',
  '42': 'nagasaki',
  '43': 'kumamoto',
  '44': 'oita',
  '45': 'miyazaki',
  '46': 'kagoshima',
  '47': 'okinawa',
};

/**
 * @typedef {Object} DatasetLoadOptions
 * @property {string} [prefCode] - 将来の都道府県別読み込み用パラメータ。
 * @property {string} [datasetPath] - 静的 JSON へのパスを明示したい場合に指定する。
 * @property {string} [embeddedElementId] - 埋め込み JSON を読む DOM 要素の ID。
 * @property {string} [modulePath] - 最終フォールバックとして import するモジュールパス。
 */

/**
 * @typedef {Object} DatasetPayload
 * @property {Array} rows
 * @property {Object} [meta]
 */

/**
 * HTTP 経由で JSON を取得する。
 * @param {string} url
 * @returns {Promise<DatasetPayload>}
 */
async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function canUseHttpFetch() {
  const proto = (typeof location !== 'undefined' && location.protocol) || '';
  return proto.startsWith('http');
}

function formatPrefectureFilename(prefCode) {
  if (!prefCode && prefCode !== 0) return null;
  const raw = String(prefCode).trim();
  if (!raw) return null;
  const normalized = raw.replace('_', '-');
  const [codePart, slugPart] = normalized.split('-', 2);
  const paddedCode = codePart.padStart(2, '0');
  const slug = (slugPart || PREF_SLUGS[paddedCode] || 'pref').toLowerCase();
  return `${paddedCode}-${slug}.json`;
}

function flattenMunicipalityRows(payload) {
  if (!payload?.municipalities) return null;
  const rows = [];
  const fallbackPref = payload.meta?.prefecture?.name || '';
  payload.municipalities.forEach((municipality) => {
    if (!municipality) return;
    const muniRows = Array.isArray(municipality.rows) ? municipality.rows : [];
    muniRows.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      rows.push({
        ...row,
        prefecture: row.prefecture || municipality.prefecture || fallbackPref || '',
        municipality_name: row.municipality_name || municipality.name || '',
        municipality_code: row.municipality_code || municipality.code || '',
      });
    });
  });
  return rows;
}

function normalizeDatasetPayload(payload) {
  if (!payload) return payload;
  if (Array.isArray(payload.rows)) {
    return payload;
  }
  if (Array.isArray(payload.municipalities)) {
    const rows = flattenMunicipalityRows(payload) || [];
    return { ...payload, rows };
  }
  return payload;
}

function readEmbeddedJson(elementId = EMBEDDED_DATA_ELEMENT_ID) {
  if (typeof document === 'undefined') return null;
  const embedded = document.getElementById(elementId);
  if (!embedded?.textContent) return null;
  try {
    return JSON.parse(embedded.textContent);
  } catch (err) {
    console.error('Failed to parse embedded data', err);
    return null;
  }
}

async function importFallback(modulePath = FALLBACK_MODULE_PATH) {
  const mod = await import(modulePath);
  return mod.default || mod;
}

function buildHttpPath({ prefCode, datasetPath } = {}) {
  if (datasetPath) return datasetPath;
  if (prefCode) {
    const filename = formatPrefectureFilename(prefCode);
    if (filename) return `data/prefectures/${filename}`;
  }
  return DEFAULT_DATASET_PATH;
}

/**
 * データセットを段階的に読み込む。HTTP → 埋め込み → import の順。
 * @param {DatasetLoadOptions} [options]
 * @returns {Promise<DatasetPayload>}
 */
export async function loadDataset(options = {}) {
  const attempts = [];
  if (canUseHttpFetch()) {
    const path = buildHttpPath(options);
    attempts.push(async () => fetchJson(path));
  }
  attempts.push(async () => {
    const embedded = readEmbeddedJson(options.embeddedElementId);
    if (embedded) return embedded;
    throw new Error('Embedded dataset not found');
  });
  attempts.push(async () => importFallback(options.modulePath));

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const payload = normalizeDatasetPayload(await attempt());
      if (payload?.rows) return payload;
      if (payload) return payload; // 旧フォーマット互換
    } catch (err) {
      lastError = err;
      console.warn('Dataset load attempt failed', err);
    }
  }
  const error = lastError || new Error('Failed to load dataset');
  console.error('All dataset loading strategies failed', error);
  throw error;
}
