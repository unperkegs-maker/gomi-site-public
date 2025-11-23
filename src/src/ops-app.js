import { loadDataset } from './data-loader.js';
import { aggregateRows } from './search.js';
import {
  initDataStore,
  getPrefectureStats,
  getMunicipalityItems,
  getTotals,
  getMunicipalityDiagnostics,
  getMunicipalitySummary,
} from './data-store.js';
import { $, createElement } from './utils.js';
import { categoryLabelFromCode } from './categories.js';
import { createAreaSelector } from './ui/area-selector.js';
import { itemsToTSV } from './exporters.js';

let aggregated = [];
let diagnosticsCache = null;

async function bootstrap() {
  const loading = $('#opsLoading');
  if (loading) loading.textContent = '読み込み中…';
  const dataset = await loadDataset();
  aggregated = aggregateRows(dataset.rows || []);
  initDataStore(aggregated);
  if (loading) loading.textContent = '';
  renderOverview();
  renderDiagnostics();
  createAreaSelector({
    prefSelect: $('#opsPrefSelect'),
    citySelect: $('#opsCitySelect'),
    onPrefChange: () => updateMunicipalitySummary(''),
    onCityChange: (municipality) => updateMunicipalitySummary(municipality?.code || ''),
  });
  bindEvents();
  updateTotals();
}

function renderOverview() {
  const tbody = document.querySelector('#prefStatsTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  getPrefectureStats().forEach((pref) => {
    const tr = createElement('tr');
    tr.append(
      createCell(pref.name),
      createCell(`${pref.municipalityCount}`),
      createCell(`${pref.itemCount}`),
    );
    tbody.appendChild(tr);
  });
}

function renderDiagnostics() {
  diagnosticsCache = getMunicipalityDiagnostics({ lowThreshold: 5 });
  renderStatsHighlights(diagnosticsCache.stats);
  renderSuspiciousLists(diagnosticsCache);
}

function renderStatsHighlights(stats) {
  const container = $('#opsStatsHighlights');
  if (!container) return;
  container.innerHTML = '';
  const cards = [
    { label: '平均件数', value: `${stats.averageItems}件`, desc: '自治体あたり' },
    { label: '中央値', value: `${stats.medianItems}件`, desc: 'ばらつき把握用' },
    {
      label: '最少件数',
      value: `${stats.minItems.count}件`,
      desc: summarizeMunicipalities(stats.minItems.municipalities),
    },
    {
      label: '最多件数',
      value: `${stats.maxItems.count}件`,
      desc: summarizeMunicipalities(stats.maxItems.municipalities),
    },
  ];
  cards.forEach((card) => {
    const article = createElement('article', { className: 'stat-card' });
    const title = createElement('h3', { textContent: card.label });
    const value = createElement('p', { className: 'stat-value', textContent: card.value });
    const desc = createElement('small', { className: 'muted', textContent: card.desc });
    article.append(title, value, desc);
    container.appendChild(article);
  });
}

// Ops Dashboard Logic

let allData = [];
let currentUrlReport = null;
let currentCityCode = null;

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  await loadData();
  setupEventHandlers();

  // Load initial diagnostics
  updateDiagnostics();

  // Load URL report if available
  loadUrlReport();
});

function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Deactivate all
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      // Activate clicked
      tab.classList.add('active');
      const targetId = tab.dataset.tab;
      document.getElementById(targetId).classList.add('active');
    });
  });
}

function setupEventHandlers() {
  // Tab 1: Data Management
  document.getElementById('uploadExcelBtn').addEventListener('click', uploadExcel);
  document.getElementById('rebuildDataBtn').addEventListener('click', rebuildData);
  document.getElementById('copyLowList').addEventListener('click', copyLowListTsv);

  // Tab 2: Municipality Operations
  const prefSelect = document.getElementById('opsPrefSelect');
  const citySelect = document.getElementById('opsCitySelect');

  prefSelect.addEventListener('change', () => {
    const pref = prefSelect.value;
    updateCitySelect(pref);
  });

  citySelect.addEventListener('change', () => {
    const cityCode = citySelect.value;
    if (cityCode) {
      showMunicipalityDetail(cityCode);
    } else {
      document.getElementById('muniDetailSection').style.display = 'none';
    }
  });

  document.getElementById('checkCityUrls').addEventListener('click', () => {
    if (currentCityCode) triggerUrlCheck(currentCityCode);
  });

  document.getElementById('exportMunicipality').addEventListener('click', () => exportData(false));
  document.getElementById('copyExport').addEventListener('click', copyExport);

  // Tab 3: URL Check
  document.getElementById('checkAllUrls').addEventListener('click', () => triggerUrlCheck(null));
  document.getElementById('refreshUrlReport').addEventListener('click', loadUrlReport);
  document.getElementById('downloadNgCsv').addEventListener('click', downloadNgCsv);
  document.getElementById('uploadFixCsv').addEventListener('click', uploadFixCsv);
}

async function loadData() {
  const loading = document.getElementById('opsLoading');
  loading.textContent = 'データを読み込み中...';

  try {
    // Try to load from server first (merged.json)
    // But for ops tool, we might want to load the embedded one or fetch merged.json directly?
    // The build script outputs to data/merged.json. 
    // Let's try to fetch it.
    const res = await fetch('data/merged.json');
    if (res.ok) {
      const json = await res.json();
      allData = json.rows || [];
    } else {
      // Fallback to embedded
      const embedded = document.getElementById('embedded-data');
      if (embedded) {
        const json = JSON.parse(embedded.textContent);
        allData = json.rows || [];
      }
    }
  } catch (e) {
    console.error(e);
    alert('データの読み込みに失敗しました。');
  }

  loading.style.display = 'none';

  // Populate Pref Select
  const prefs = new Set(allData.map(r => r.prefecture).filter(Boolean));
  const prefSelect = document.getElementById('opsPrefSelect');
  Array.from(prefs).sort().forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    prefSelect.appendChild(opt);
  });

  updateStatsHighlights();
}

function updateStatsHighlights() {
  const totalRows = allData.length;
  const totalMuni = new Set(allData.map(r => r.municipality_code)).size;

  const statsHtml = `
    <div class="stat-card">
      <div class="stat-val">${totalMuni.toLocaleString()}</div>
      <div class="stat-label">登録自治体数</div>
    </div>
    <div class="stat-card">
      <div class="stat-val">${totalRows.toLocaleString()}</div>
      <div class="stat-label">総データ件数</div>
    </div>
  `;
  document.getElementById('opsStatsHighlights').innerHTML = statsHtml;
}

function updateDiagnostics() {
  // Group by municipality
  const counts = {};
  allData.forEach(r => {
    const key = `${r.prefecture} ${r.municipality_name}`;
    counts[key] = (counts[key] || 0) + 1;
  });

  const zeroList = []; // We can't really know zero list unless we know all municipalities in Japan...
  // But we can list low counts.
  const lowList = [];

  Object.entries(counts).forEach(([name, count]) => {
    if (count <= 5) {
      lowList.push({ name, count });
    }
  });

  // Render
  const lowUl = document.getElementById('opsLowList');
  lowUl.innerHTML = '';
  if (lowList.length === 0) {
    lowUl.innerHTML = '<li>該当なし</li>';
  } else {
    lowList.sort((a, b) => a.count - b.count).forEach(item => {
      const li = document.createElement('li');
      li.textContent = `${item.name} (${item.count}件)`;
      lowUl.appendChild(li);
    });
  }

  document.getElementById('opsZeroList').innerHTML = '<li>(未実装: 全自治体リストとの突合が必要)</li>';
}

function updateCitySelect(pref) {
  const citySelect = document.getElementById('opsCitySelect');
  citySelect.innerHTML = '<option value="">市区町村を選択</option>';
  citySelect.disabled = !pref;

  if (!pref) return;

  const cities = new Map(); // code -> name
  allData.filter(r => r.prefecture === pref).forEach(r => {
    if (r.municipality_code && r.municipality_name) {
      cities.set(r.municipality_code, r.municipality_name);
    }
  });

  Array.from(cities.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([code, name]) => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = name;
    citySelect.appendChild(opt);
  });
}

function showMunicipalityDetail(cityCode) {
  currentCityCode = cityCode;
  const section = document.getElementById('muniDetailSection');
  section.style.display = 'block';

  const rows = allData.filter(r => r.municipality_code === cityCode);
  const name = rows[0] ? `${rows[0].prefecture} ${rows[0].municipality_name}` : cityCode;

  document.getElementById('opsMunicipalitySummary').textContent = `${name}: ${rows.length}件のデータがあります。`;

  // Category Stats
  const cats = {};
  rows.forEach(r => {
    const c = r.category_normalized || 'その他';
    cats[c] = (cats[c] || 0) + 1;
  });

  document.getElementById('opsCategoryStats').innerHTML = Object.entries(cats)
    .map(([k, v]) => `<div>${k}: ${v}</div>`).join('');

  // Sample
  const sample = rows.slice(0, 10);
  const sampleHtml = sample.map(r => `
    <div class="sample-row">
      <strong>${r.item_name}</strong> (${r.category_normalized})
      <br><span class="text-sm muted">${r.how_to || ''}</span>
    </div>
  `).join('');
  document.getElementById('opsSample').innerHTML = sampleHtml;

  // Clear export area
  document.getElementById('exportOutput').value = '';
}

// --- Excel Upload & Rebuild ---

async function uploadExcel() {
  const input = document.getElementById('excelUploadInput');
  const status = document.getElementById('excelUploadStatus');

  if (!input.files.length) {
    alert('ファイルを選択してください。');
    return;
  }

  const file = input.files[0];
  status.textContent = 'アップロード中...';

  try {
    const res = await fetch(`/api/upload-excel?filename=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      body: file
    });

    if (res.ok) {
      status.textContent = 'アップロード完了。データ再構築を行ってください。';
      input.value = '';
    } else {
      throw new Error('Upload failed');
    }
  } catch (e) {
    status.textContent = 'エラー: ' + e.message;
  }
}

async function rebuildData() {
  const btn = document.getElementById('rebuildDataBtn');
  const log = document.getElementById('rebuildLog');

  if (!confirm('データを再構築しますか？これには数秒かかる場合があります。')) return;

  btn.disabled = true;
  btn.textContent = '再構築中...';
  log.style.display = 'block';
  log.textContent = '開始中...';

  try {
    const res = await fetch('/api/rebuild-data', { method: 'POST' });
    const json = await res.json();

    log.textContent = json.output || '(出力なし)';

    if (json.status === 'ok') {
      alert('再構築が完了しました。画面をリロードして最新データを確認してください。');
      location.reload();
    } else {
      alert('再構築に失敗しました。ログを確認してください。');
    }
  } catch (e) {
    log.textContent = '通信エラー: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'データを再構築する';
  }
}

// --- Export & Copy ---

function exportData(isAll) {
  const format = document.getElementById('exportFormat').value;
  const rows = isAll ? allData : allData.filter(r => r.municipality_code === currentCityCode);

  let output = '';
  if (format === 'json') {
    output = JSON.stringify(rows, null, 2);
  } else {
    // TSV
    const headers = ['自治体コード', '都道府県', '市区町村', '品目名', '分別', '出し方', '出典URL'];
    const body = rows.map(r => [
      r.municipality_code, r.prefecture, r.municipality_name,
      r.item_name, r.category_normalized, r.how_to, r.source_url
    ].join('\t')).join('\n');
    output = headers.join('\t') + '\n' + body;
  }

  document.getElementById('exportOutput').value = output;
}

function copyExport() {
  const textarea = document.getElementById('exportOutput');
  textarea.select();
  document.execCommand('copy');
  alert('コピーしました');
}

function copyLowListTsv() {
  const list = document.querySelectorAll('#opsLowList li');
  const text = Array.from(list).map(li => li.textContent).join('\n');
  navigator.clipboard.writeText(text).then(() => alert('コピーしました'));
}

// --- URL Check (Existing Logic Adapted) ---

async function triggerUrlCheck(cityCode) {
  const status = cityCode ? document.getElementById('cityUrlCheckStatus') : document.getElementById('urlCheckStatus');
  status.style.display = 'block';
  status.textContent = 'チェックを開始しました。バックグラウンドで実行中です...';

  try {
    const res = await fetch('/api/check-urls', {
      method: 'POST',
      body: JSON.stringify({ cityCode })
    });

    if (res.ok) {
      pollUrlCheckStatus(status);
    } else {
      status.textContent = '開始に失敗しました。';
    }
  } catch (e) {
    status.textContent = 'エラー: ' + e.message;
  }
}

async function pollUrlCheckStatus(statusElement) {
  const interval = setInterval(async () => {
    try {
      const res = await fetch('/api/check-urls/status');
      if (!res.ok) return;
      const job = await res.json();

      if (job.status === 'running') {
        statusElement.textContent = `実行中... (開始: ${new Date(job.lastRun).toLocaleTimeString()})`;
      } else if (job.status === 'done') {
        clearInterval(interval);
        statusElement.textContent = job.message;
        statusElement.style.backgroundColor = '#dcfce7'; // Green-ish
        loadUrlReport();
      } else if (job.status === 'error') {
        clearInterval(interval);
        statusElement.textContent = job.message;
        statusElement.style.backgroundColor = '#fee2e2'; // Red-ish
      }
    } catch (e) {
      console.error('Polling error', e);
    }
  }, 2000);
}

async function loadUrlReport() {
  try {
    const res = await fetch('/api/url-health');
    if (res.ok) {
      currentUrlReport = await res.json();
      renderUrlReport(currentUrlReport);
    }
  } catch (e) {
    console.warn('No report found');
  }
}

function renderUrlReport(report) {
  const list = document.getElementById('ngUrlList');
  list.innerHTML = '';

  const broken = report.details.filter(d => !d.ok);
  if (broken.length === 0) {
    list.innerHTML = '<li>NG URLはありません。</li>';
    return;
  }

  // Show top 20
  broken.slice(0, 20).forEach(d => {
    const li = document.createElement('li');
    const usage = (d.usages && d.usages[0]) ? `${d.usages[0].city} / ${d.usages[0].name}` : '';
    li.innerHTML = `
      <div style="font-weight:bold; color:#ef4444;">${d.status || 'Error'}</div>
      <div class="text-sm" style="word-break:break-all;">${d.url}</div>
      ${usage ? `<div class="text-xs muted">${usage}</div>` : ''}
    `;
    list.appendChild(li);
  });

  if (broken.length > 20) {
    const more = document.createElement('li');
    more.textContent = `他 ${broken.length - 20} 件... (CSVで確認してください)`;
    list.appendChild(more);
  }
}

function downloadNgCsv() {
  if (!currentUrlReport || !currentUrlReport.details) {
    alert('レポートがありません。');
    return;
  }

  const headers = ['都道府県', '市町村', '項目', '項目(Raw)', 'データベース上のURL', 'NG理由', '置き換え後URL'];
  const rows = [];

  currentUrlReport.details.forEach(d => {
    const usages = d.usages || [{ pref: '-', city: '-', name: '-', raw_name: '-' }];
    usages.forEach(u => {
      rows.push([
        u.pref || '',
        u.city || '',
        u.name || '',
        u.raw_name || '',
        d.url,
        d.status ? `Status: ${d.status}` : (d.error || 'Unknown Error'),
        '' // Placeholder for replacement
      ]);
    });
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ng_urls.csv';
  a.click();
  URL.revokeObjectURL(url);
}

async function uploadFixCsv() {
  const input = document.getElementById('fixCsvInput');
  const status = document.getElementById('uploadStatus');
  if (!input.files.length) return;

  const file = input.files[0];
  const text = await file.text();

  const lines = text.split(/\r?\n/);
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());

  const urlIndex = headers.indexOf('データベース上のURL');
  const replaceIndex = headers.indexOf('置き換え後URL');

  if (urlIndex === -1 || replaceIndex === -1) {
    if (status) status.textContent = 'エラー: CSVヘッダが正しくありません。';
    return;
  }

  const fixes = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = parseCsvLine(lines[i]);
    if (row[urlIndex] && row[replaceIndex]) {
      fixes.push({
        original: row[urlIndex],
        replacement: row[replaceIndex]
      });
    }
  }

  if (fixes.length === 0) {
    if (status) status.textContent = '修正対象が見つかりませんでした。';
    return;
  }

  try {
    let existingFixes = [];
    try {
      const res = await fetch('/api/url-fixes');
      if (res.ok) existingFixes = await res.json();
    } catch (e) { }

    const fixMap = new Map(existingFixes.map(f => [f.original, f]));
    fixes.forEach(f => fixMap.set(f.original, f));
    const merged = Array.from(fixMap.values());

    await fetch('/api/save-fixes', {
      method: 'POST',
      body: JSON.stringify(merged)
    });

    if (status) status.textContent = `修正を保存しました (${fixes.length}件)。`;
    input.value = '';
  } catch (err) {
    console.error(err);
    if (status) status.textContent = '保存に失敗しました。';
  }
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuote = !inQuote;
    } else if (char === ',' && !inQuote) {
      result.push(current.replace(/^"|"$/g, '').replace(/""/g, '"'));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.replace(/^"|"$/g, '').replace(/""/g, '"'));
  return result;
}

window.addEventListener('DOMContentLoaded', bootstrap);
