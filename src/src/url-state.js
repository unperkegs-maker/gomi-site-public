const PAGE_SIZES = [25, 50, 100, 200];
const DISPLAY_MODES = ['auto', 'cards', 'table'];
const LANGUAGES = ['ja', 'en'];
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_DISPLAY_MODE = 'auto';
const DEFAULT_LANGUAGE = 'ja';

/**
 * @typedef {Object} ParsedUrlState
 * @property {{pref: string, city: string, cat: string, keyword: string}} query
 * @property {number} page
 * @property {number} pageSize
 * @property {string} displayMode
 * @property {string} language
 * @property {string} selectedMunicipalityCode
 */

function sanitizePositiveInt(value, fallback) {
  if (value == null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function sanitizeFromList(value, allowed, fallback) {
  if (!value) return fallback;
  return allowed.includes(value) ? value : fallback;
}

function sanitizeNumberFromList(value, allowed, fallback) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return allowed.includes(parsed) ? parsed : fallback;
}

/**
 * URLSearchParams から検索条件を復元する。
 * @param {URLSearchParams} searchParams
 * @param {{page?: number, pageSize?: number, displayMode?: string, language?: string}} defaults
 * @returns {ParsedUrlState}
 */
export function parseSearchParams(searchParams, defaults = {}) {
  const query = {
    pref: searchParams.get('pref') || '',
    city: searchParams.get('city') || '',
    cat: searchParams.get('cat') || '',
    keyword: searchParams.get('q') || '',
  };
  const page = sanitizePositiveInt(searchParams.get('page'), defaults.page ?? 1);
  const pageSize = searchParams.has('size')
    ? sanitizeNumberFromList(searchParams.get('size'), PAGE_SIZES, defaults.pageSize ?? DEFAULT_PAGE_SIZE)
    : (defaults.pageSize ?? DEFAULT_PAGE_SIZE);
  const displayMode = searchParams.has('mode')
    ? sanitizeFromList(searchParams.get('mode'), DISPLAY_MODES, defaults.displayMode ?? DEFAULT_DISPLAY_MODE)
    : (defaults.displayMode ?? DEFAULT_DISPLAY_MODE);
  const language = searchParams.has('lang')
    ? sanitizeFromList(searchParams.get('lang'), LANGUAGES, defaults.language ?? DEFAULT_LANGUAGE)
    : (defaults.language ?? DEFAULT_LANGUAGE);
  const selectedMunicipalityCode = searchParams.get('cityCode') || '';
  return {
    query,
    page,
    pageSize,
    displayMode,
    language,
    selectedMunicipalityCode,
  };
}

/**
 * 現在の state から URLSearchParams を生成する。
 * @param {{query: Record<string, string>, page: number, pageSize: number, displayMode: string, language: string, selectedMunicipalityCode?: string}} currentState
 * @returns {URLSearchParams}
 */
export function buildSearchParams(currentState) {
  const params = new URLSearchParams();
  const query = currentState.query || {};
  if (query.pref) params.set('pref', query.pref);
  if (query.city) params.set('city', query.city);
  if (currentState.selectedMunicipalityCode) {
    params.set('cityCode', currentState.selectedMunicipalityCode);
  }
  if (query.cat) params.set('cat', query.cat);
  if (query.keyword) params.set('q', query.keyword);
  const pageSize = currentState.pageSize ?? DEFAULT_PAGE_SIZE;
  if (pageSize !== DEFAULT_PAGE_SIZE) params.set('size', String(pageSize));
  const displayMode = currentState.displayMode ?? DEFAULT_DISPLAY_MODE;
  if (displayMode !== DEFAULT_DISPLAY_MODE) params.set('mode', displayMode);
  const language = currentState.language ?? DEFAULT_LANGUAGE;
  if (language !== DEFAULT_LANGUAGE) params.set('lang', language);
  const page = currentState.page ?? 1;
  params.set('page', String(page));
  return params;
}

export const urlStateConstants = {
  PAGE_SIZES,
  DISPLAY_MODES,
  LANGUAGES,
  DEFAULT_PAGE_SIZE,
  DEFAULT_DISPLAY_MODE,
  DEFAULT_LANGUAGE,
};
