import { state, hydratePrefs, persistPrefs, resetPagination } from './state.js';
import { $, debounce, formatDate } from './utils.js';
import { loadDataset } from './data-loader.js';
import { aggregateRows, getCategoryList } from './search.js';
import { render, closeDetail } from './renderers.js';
import { applyTranslations, useI18n, initLanguageSelector, t } from './ui/i18n.js';
import { createAreaSelector } from './ui/area-selector.js';
import { renderMunicipalityHeader } from './ui/municipality-header.js';
import { categoryLabelFromCode } from './categories.js';
import { parseSearchParams, buildSearchParams } from './url-state.js';
import { itemsToTSV } from './exporters.js';
import {
  initDataStore,
  getMunicipalityByCode,
  getMunicipalityItems,
  getPrefectureItems,
  getTotals,
  getMunicipalitySummary,
} from './data-store.js';
import { resolveRecordsForQuery } from './search-runner.js';
import { createSearchBridge } from './search-service.js';
import { runRelevanceSearch } from './search-fuse.js';

hydratePrefs();

let areaSelectorController = null;
let areaPanelCollapsed = false;
let searchBridge = null;
let searchSequence = 0;

async function bootstrap() {
  const loading = $('#loading');
  if (loading) loading.style.display = 'block';
  const data = await loadDataset();

  // Load URL fixes
  let fixes = [];
  try {
    const res = await fetch('/api/url-fixes');
    if (res.ok) fixes = await res.json();
  } catch (e) {
    console.warn('Failed to load URL fixes', e);
  }

  // Apply fixes
  const fixMap = new Map(fixes.map(f => [f.original, f.replacement]));

  // Filter and map rows
  const rows = data.rows || [];
  state.all = rows.filter(row => {
    if (!row.source_url) return true;
    if (fixMap.has(row.source_url)) {
      const replacement = fixMap.get(row.source_url);
      // If replacement is empty or special flag, remove item (or hide it)
      // Requirement: "NGのURLに紐づく項目は非表示" -> if no replacement, maybe hide?
      // But we also have "replacement URL entered... restore visibility".
      // So if it's in the fix list but replacement is empty, it implies it's still broken/hidden?
      // Let's assume:
      // 1. If URL is in NG list (not implemented here, this is fix list), it should be hidden?
      //    Wait, the requirement says "NGのURLに紐づく項目は非表示".
      //    So we need to know which URLs are NG.
      //    We should also fetch the NG report?
      //    Or maybe the "fix list" contains everything?
      //    Let's fetch the NG report too.

      if (replacement) {
        row.source_url = replacement;
        return true;
      } else {
        // If in fix list but no replacement, it might be explicitly hidden or just acknowledged as broken.
        // For now, let's assume if we have a fix entry with empty replacement, we hide it.
        return false;
      }
    }
    return true;
  });

  // We also need to hide items that are in the NG report but NOT in the fix list (or have no fix).
  // Let's fetch the NG report as well to hide broken links that haven't been fixed yet.
  try {
    const res = await fetch('/api/url-health');
    if (res.ok) {
      const report = await res.json();
      const brokenUrls = new Set(report.details.map(d => d.url));
      state.all = state.all.filter(row => {
        // If it was fixed above, the URL is already changed.
        // We track if it was fixed by checking if the current URL is different from original (if we had original)
        // OR, simpler: we check if the current URL (which might be a replacement) is in the broken list.
        // BUT, if we explicitly replaced it (even with same URL to whitelist), we should probably keep it.
        // The fixMap logic above replaces row.source_url.
        // So if we had a fix, row.source_url is now the "replacement".

        // However, we don't know if a row was "fixed" just by looking at it here, unless we track it.
        // Let's look at the previous filter loop.
        // It modifies row.source_url.

        // Actually, if we defined a fix, we want to trust it.
        // If the replacement URL happens to be in brokenUrls, that's a problem, but maybe we assume fixes are valid?
        // Or maybe we should check if the *original* URL was fixed?

        // Let's refine the logic:
        // 1. If a URL is in the fix list, it is considered "handled".
        //    The first filter loop handles replacement.
        //    If the replacement is the same as original (whitelisting), it's still "handled".
        // 2. If it is NOT in the fix list, and it IS in the broken list, then hide it.

        // To do this, we need to know if it was in the fix list.
        // The first loop iterates over rows. We can mark them?
        // Or we can just check fixMap again.

        // Wait, the first loop does:
        // if (fixMap.has(row.source_url)) { ... }
        // But it MUTATES row.source_url.
        // So in this second loop, row.source_url might be different.

        // Issue: We lost the original URL if it was replaced.
        // But wait, if we have a fix "A" -> "B", row.source_url becomes "B".
        // If "A" -> "A" (whitelist), row.source_url remains "A".

        // If we check fixMap.has(row.source_url) here:
        // Case 1: "A" -> "B". row.source_url is "B". fixMap has "A". We don't find "B" in fixMap keys (unless "B" is also a key).
        // Case 2: "A" -> "A". row.source_url is "A". fixMap has "A". We find it.

        // So for whitelisting ("A" -> "A"), checking fixMap.has(row.source_url) works!
        // For actual replacement ("A" -> "B"), "B" is likely valid and NOT in brokenUrls.
        // If "B" IS in brokenUrls, we probably want to hide it anyway? Or maybe "B" is a new valid URL that the crawler hasn't seen yet?
        // If "B" is valid, it won't be in brokenUrls.

        // So the problem is specifically for "A" -> "A" where "A" is in brokenUrls.
        // In that case, row.source_url is "A". brokenUrls.has("A") is true.
        // We want to KEEP it because it's in fixMap.

        // So:
        if (fixMap.has(row.source_url)) {
          // It is whitelisted (or we just replaced it with something that happens to be a key, which is unlikely but possible).
          // If it's whitelisted, we keep it.
          return true;
        }

        if (row.source_url && brokenUrls.has(row.source_url)) {
          // It is broken and not fixed/whitelisted. Hide it.
          return false;
        }
        return true;
      });
    }
  } catch (e) {
    console.warn('Failed to load URL health report', e);
  }

  state.meta = data.meta || {};
  state.cityKey = detectCityKey();
  state.categoryKey = detectCategoryKey();
  state.aggregated = aggregateRows(state.all);
  state.filtered = [];
  initDataStore(state.aggregated);
  searchBridge = createSearchBridge();

  const areaControls = await waitForAreaControls();
  areaSelectorController = createAreaSelector({
    prefSelect: areaControls.prefSelect,
    citySelect: areaControls.citySelect,
    onPrefChange: (prefEntry) => handlePrefSelection(prefEntry?.name || ''),
    onCityChange: (municipality) => handleCitySelection(municipality),
  });
  applyInitialQuery();
  initForm();
  initAreaPanelToggle();
  updateMetaBar();
  $('#copyLink').addEventListener('click', copyLink);
  runSearch();
  if (loading) loading.style.display = 'none';
}

function detectCityKey() {
  const sample = state.all[0] || {};
  for (const key of ['municipality_name', 'city', '市区町村']) {
    if (sample[key]) return key;
  }
  return 'municipality_name';
}

function detectCategoryKey() {
  const sample = state.all[0] || {};
  for (const key of ['category_normalized', 'category_name', 'category_raw']) {
    if (sample[key]) return key;
  }
  return 'category_raw';
}

function populateCategorySelect(records = state.aggregated) {
  const select = $('#catSelect');
  const currentValue = select.value || state.query.cat || '';
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'すべて';
  select.appendChild(placeholder);
  getCategoryList(records).forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = categoryLabelFromCode(category, state.language);
    select.appendChild(option);
  });
  if (currentValue && [...select.options].some((option) => option.value === currentValue)) {
    select.value = currentValue;
    state.query.cat = currentValue;
  } else {
    select.value = '';
    state.query.cat = '';
  }
}

function refreshCategoryLabels() {
  const select = $('#catSelect');
  [...select.options].forEach((option) => {
    if (!option.value) return;
    option.textContent = categoryLabelFromCode(option.value, state.language);
  });
}

function initForm() {
  const i18nNodes = document.querySelectorAll('[data-i18n]');
  useI18n(Array.from(i18nNodes));
  applyTranslations();
  initLanguageSelector($('#languageSelect'), () => {
    refreshCategoryLabels();
    updateMetaBar();
    updateMunicipalitySummaryCard();
    renderCurrentPage();
  });

  $('#displayMode').value = state.displayMode;
  $('#pageSize').value = String(state.pageSize);

  $('#displayMode').addEventListener('change', (event) => {
    state.displayMode = event.target.value;
    persistPrefs();
    renderCurrentPage();
  });
  $('#pageSize').addEventListener('change', (event) => {
    state.pageSize = Number(event.target.value);
    persistPrefs();
    resetPagination();
    renderCurrentPage();
  });
  $('#catSelect').addEventListener('change', (event) => {
    state.query.cat = event.target.value;
    resetPagination();
    invalidateQueryCache();
    runSearch();
  });
  const debouncedKeywordSearch = debounce(() => {
    runSearch();
  }, 250);
  $('#q').addEventListener('input', (event) => {
    state.query.keyword = event.target.value;
    resetPagination();
    debouncedKeywordSearch();
  });
  $('#search').addEventListener('click', () => {
    runSearch();
  });
  $('#reset').addEventListener('click', () => {
    state.query.cat = '';
    state.query.keyword = '';
    $('#catSelect').value = '';
    $('#q').value = '';
    resetPagination();
    invalidateQueryCache();
    runSearch();
  });
  $('#prev').addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      renderCurrentPage();
    }
  });
  $('#next').addEventListener('click', () => {
    const totalPages = Math.ceil(state.filtered.length / state.pageSize);
    if (state.page < totalPages) {
      state.page += 1;
      renderCurrentPage();
    }
  });
  $('#copyResultsTsv').addEventListener('click', copyResultsAsTsv);
  $('#detailClose').addEventListener('click', closeDetail);
  const detailDialog = $('#detailDialog');
  detailDialog.addEventListener('close', () => {
    $('#detailBody').innerHTML = '';
  });
  detailDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDetail();
  });
}

function runSearch() {
  const hasMunicipality = Boolean(state.query.pref && state.query.city);
  toggleSearchGuard(!hasMunicipality);
  if (!hasMunicipality) {
    state.filtered = [];
    invalidateQueryCache();
    renderCurrentPage();
    return;
  }
  const querySnapshot = { ...state.query };
  const cityCode = state.selectedMunicipalityCode;
  const scopedRecords = resolveRecordsForQuery({
    query: querySnapshot,
    cityCode,
    aggregated: state.aggregated,
    getMunicipalityItems,
    getPrefectureItems,
  });
  const currentSequence = ++searchSequence;
  const runPromise = searchBridge
    ? searchBridge.runSearch({ query: querySnapshot, cityCode, records: scopedRecords })
    : Promise.resolve(runRelevanceSearch(scopedRecords, querySnapshot));
  runPromise
    .then((records) => {
      if (currentSequence !== searchSequence) return;
      state.filtered = records;
      renderCurrentPage();
    })
    .catch((err) => {
      console.error('Search failed', err);
      if (currentSequence !== searchSequence) return;
      state.filtered = runRelevanceSearch(scopedRecords, querySnapshot);
      renderCurrentPage();
    });
}

function handlePrefSelection(prefName) {
  state.query.pref = prefName || '';
  state.query.city = '';
  state.selectedMunicipalityCode = '';
  populateCategorySelect(state.aggregated);
  updateSelectedAreaLabel();
  updateResultSummary();
  updateMunicipalitySummaryCard();
  resetPagination();
  invalidateQueryCache();
  runSearch();
}

function handleCitySelection(municipality) {
  if (!municipality) {
    state.selectedMunicipalityCode = '';
    state.query.city = '';
    populateCategorySelect(state.aggregated);
    updateSelectedAreaLabel();
    updateResultSummary();
    updateMunicipalitySummaryCard();
    resetPagination();
    runSearch();
    return;
  }
  state.selectedMunicipalityCode = municipality.code;
  state.query.pref = municipality.prefecture;
  state.query.city = municipality.name;
  populateCategorySelect(getMunicipalityItems(municipality.code));
  updateSelectedAreaLabel();
  updateResultSummary();
  updateMunicipalitySummaryCard();
  resetPagination();
  maybeCollapseAreaPanelForMobile();
  invalidateQueryCache();
  runSearch();
}

function toggleSearchGuard(show) {
  const guard = $('#searchGuard');
  if (!guard) return;
  guard.hidden = !show;
}

function updateSelectedAreaLabel() {
  const label = $('#selectedAreaLabel');
  if (!label) return;
  if (state.query.pref && state.query.city) {
    label.textContent = `現在選択中: ${state.query.pref} ${state.query.city}`;
  } else if (state.query.pref) {
    label.textContent = `現在選択中: ${state.query.pref} / 市区町村未選択`;
  } else {
    label.textContent = '現在選択中: 未選択';
  }
}

function updateResultSummary() {
  const summary = $('#resultSummary');
  if (!summary) return;
  if (!state.query.pref || !state.query.city) {
    summary.textContent = '自治体を選択すると検索結果が表示されます。';
    return;
  }
  summary.textContent = `${state.query.pref} ${state.query.city} の検索結果 ${state.filtered.length}件`;
}

function updateMunicipalitySummaryCard() {
  const container = $('#municipalitySummary');
  if (!container) return;
  const summary = state.selectedMunicipalityCode
    ? getMunicipalitySummary(state.selectedMunicipalityCode)
    : null;
  renderMunicipalityHeader({
    container,
    summary,
    generatedAt: state.meta.generated_at,
    language: state.language,
  });
}

function applyInitialQuery() {
  const params = new URLSearchParams(location.search);
  const parsed = parseSearchParams(params, {
    page: state.page,
    pageSize: state.pageSize,
    displayMode: state.displayMode,
    language: state.language,
  });
  Object.assign(state.query, parsed.query);
  state.page = parsed.page;
  state.pageSize = parsed.pageSize;
  state.displayMode = parsed.displayMode;
  state.language = parsed.language;
  state.selectedMunicipalityCode = parsed.selectedMunicipalityCode;
  if (state.selectedMunicipalityCode) {
    const municipality = getMunicipalityByCode(state.selectedMunicipalityCode);
    if (municipality) {
      state.query.pref = municipality.prefecture;
      state.query.city = municipality.name;
    }
  }
  areaSelectorController?.sync({
    pref: state.query.pref,
    cityCode: state.selectedMunicipalityCode,
    fallbackCityName: state.query.city,
  });
  const selectorState = areaSelectorController?.getState();
  if (!state.selectedMunicipalityCode && selectorState?.cityCode) {
    state.selectedMunicipalityCode = selectorState.cityCode;
  }
  const recordsForCategories = state.selectedMunicipalityCode
    ? getMunicipalityItems(state.selectedMunicipalityCode)
    : state.aggregated;
  populateCategorySelect(recordsForCategories);
  $('#catSelect').value = state.query.cat;
  $('#q').value = state.query.keyword;
  updateSelectedAreaLabel();
  updateResultSummary();
  updateMunicipalitySummaryCard();
}

function updateMetaBar() {
  const counts = state.meta.counts || {};
  const rows = counts.rows || state.aggregated.length;
  const totals = getTotals();
  const municipalities = counts.municipalities || totals.municipalities;
  const generated = state.meta.generated_at ? formatDate(state.meta.generated_at) : '';
  const metaEl = $('#metaInfo');
  const labels = state.language === 'en'
    ? { rows: 'rows', municipalities: 'municipalities', updated: 'updated' }
    : { rows: '件', municipalities: '自治体', updated: '更新' };
  const parts = [
    state.language === 'en' ? `${rows} ${labels.rows}` : `${rows}${labels.rows}`,
    state.language === 'en'
      ? `${municipalities} ${labels.municipalities}`
      : `${municipalities}${labels.municipalities}`,
  ];
  if (generated) {
    parts.push(state.language === 'en' ? `${generated} ${labels.updated}` : `${generated}${labels.updated}`);
  }
  metaEl.textContent = parts.join(' · ');
}

function writeQuery() {
  const params = buildSearchParams(state);
  const url = `${location.pathname}?${params.toString()}`;
  history.replaceState({}, '', url);
}

async function copyLink() {
  writeQuery();
  try {
    await navigator.clipboard.writeText(location.href);
    alert(t('actions.copyLink'));
  } catch (err) {
    console.error('Clipboard copy failed', err);
  }
}

function initAreaPanelToggle() {
  const toggle = $('#areaPanelToggle');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    setAreaPanelCollapsed(!areaPanelCollapsed);
  });
  setAreaPanelCollapsed(false);
}

function setAreaPanelCollapsed(collapsed) {
  const body = $('#areaPanelBody');
  const toggle = $('#areaPanelToggle');
  if (!body || !toggle) return;
  areaPanelCollapsed = collapsed;
  body.hidden = collapsed;
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.textContent = collapsed ? 'エリア選択を開く' : 'エリア選択を閉じる';
}

function maybeCollapseAreaPanelForMobile() {
  if (window.matchMedia('(max-width: 720px)').matches) {
    setAreaPanelCollapsed(true);
  }
}

function renderCurrentPage() {
  render(state.filtered);
  updateResultSummary();
  writeQuery();
  updateExportButtonState();
  const status = $('#copyResultsStatus');
  if (status) status.textContent = '';
}

function invalidateQueryCache() {
  searchBridge?.clearCache();
}

async function copyResultsAsTsv() {
  const status = $('#copyResultsStatus');
  if (!state.filtered.length) {
    if (status) status.textContent = '検索結果がないため、コピーできません。';
    return;
  }
  try {
    await navigator.clipboard.writeText(itemsToTSV(state.filtered));
    if (status) status.textContent = '検索結果をTSV形式でコピーしました。';
  } catch (err) {
    console.error('Failed to copy TSV results', err);
    if (status) status.textContent = 'コピーに失敗しました。ブラウザの設定を確認してください。';
  }
}

function updateExportButtonState() {
  const button = $('#copyResultsTsv');
  if (!button) return;
  button.disabled = state.filtered.length === 0;
}

window.addEventListener('DOMContentLoaded', bootstrap);

function waitForAreaControls(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = () => {
      const pref = $('#prefSelect');
      const city = $('#citySelect');
      if (pref && city) {
        resolve({ prefSelect: pref, citySelect: city });
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Area controls not found'));
        return;
      }
      setTimeout(poll, 50);
    };
    poll();
  });
}
