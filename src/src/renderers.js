import { state } from './state.js';
import { $, createElement } from './utils.js';
import { paginate, sortRecords } from './search.js';
import { t } from './ui/i18n.js';
import { categoryLabelFromCode } from './categories.js';

const SORT_KEY_MAP = {
  prefecture: 'prefecture',
  municipality: 'municipality_name',
  item: 'item_name',
  category: 'categories',
};

let lastFocusedElement = null;

function determineDisplayMode() {
  if (state.displayMode !== 'auto') return state.displayMode;
  return window.matchMedia('(max-width: 768px)').matches ? 'cards' : 'table';
}

function renderTable(records) {
  const table = $('#tbl');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  const headerRow = createElement('tr');
  ['prefecture', 'municipality', 'item', 'category'].forEach((key) => {
    const th = createElement('th');
    th.textContent = t(`table.${key}`);
    th.tabIndex = 0;
    const resolvedKey = resolveSortKey(key);
    const ariaSort = state.sortKey === resolvedKey
      ? (state.sortAsc ? 'ascending' : 'descending')
      : 'none';
    th.setAttribute('aria-sort', ariaSort);
    th.addEventListener('click', () => updateSort(key));
    th.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        updateSort(key);
      }
    });
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const pageRecords = paginate(records, state.page, state.pageSize);
  pageRecords.forEach((record) => {
    const tr = createElement('tr');
    tr.append(
      createCell(record.prefecture),
      createCell(record.municipality_name),
      createCell(createHighlightedText(getItemName(record), state.query.keyword)),
      createCell(formatCategories(record))
    );
    tr.addEventListener('click', () => showDetail(record));
    tbody.appendChild(tr);
  });
}

function renderCards(records) {
  const cardView = $('#cardView');
  cardView.innerHTML = '';
  const pageRecords = paginate(records, state.page, state.pageSize);
  pageRecords.forEach((record) => {
    const card = createElement('article', { className: 'card' });
    const title = createElement('h3');
    title.appendChild(createHighlightedText(getItemName(record), state.query.keyword));
    const meta = createElement('div', { className: 'meta' });
    meta.textContent = `${record.prefecture} / ${record.municipality_name}`;
    const category = createElement('div');
    category.textContent = formatCategories(record);
    const actions = createElement('div', { className: 'btn-row' });
    const detailBtn = createElement('button', { className: 'secondary', type: 'button' });
    detailBtn.textContent = t('actions.details');
    detailBtn.addEventListener('click', () => showDetail(record));
    actions.appendChild(detailBtn);
    card.append(title, meta, category, actions);
    if (record.conflicts) {
      const badge = createElement('span', { className: 'badge' });
      badge.textContent = t('labels.conflict');
      card.appendChild(badge);
    }
    cardView.appendChild(card);
  });
}

function createCell(content) {
  const td = createElement('td');
  if (content instanceof Node) {
    td.appendChild(content);
  } else {
    td.textContent = content || '';
  }
  return td;
}

function showDetail(record) {
  const dialog = $('#detailDialog');
  const body = $('#detailBody');
  body.innerHTML = '';

  const rows = [
    { label: t('detail.prefecture'), value: record.prefecture },
    { label: t('detail.city'), value: record.municipality_name },
    { label: t('detail.item'), value: getItemName(record) },
    { label: t('detail.categories'), value: formatCategories(record) || '-' },
    { label: t('detail.instructions'), value: getInstructions(record) },
    { label: t('detail.sources'), value: record.urls || [], type: 'sources' },
  ];

  rows.forEach(({ label, value, type }) => {
    const labelEl = createElement('b');
    labelEl.textContent = label;
    const valueEl = createElement('div');
    if (type === 'sources') {
      valueEl.dataset.testid = 'detail-source-list';
      appendSourceLinks(valueEl, value);
    } else {
      valueEl.textContent = value || '';
    }
    body.append(labelEl, valueEl);
  });

  lastFocusedElement = document.activeElement;
  dialog.showModal();
  const closeButton = dialog.querySelector('.close-btn');
  closeButton?.focus();
}

function appendSourceLinks(container, urls = []) {
  const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
  if (list.length === 0) {
    container.textContent = '-';
    return;
  }
  list.forEach((url, index) => {
    const link = createElement('a', {
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer',
      textContent: url,
    });
    link.dataset.testid = 'detail-source-link';
    container.appendChild(link);
    if (index < list.length - 1) {
      container.appendChild(document.createElement('br'));
    }
  });
}

export function render(records) {
  const sorted = sortRecords(records, state.sortKey, state.sortAsc);
  const mode = determineDisplayMode();
  $('#cardView').style.display = mode === 'cards' ? 'grid' : 'none';
  $('#tableView').style.display = mode === 'table' ? 'block' : 'none';
  if (mode === 'cards') {
    renderCards(sorted);
  } else {
    renderTable(sorted);
  }
  const totalPages = Math.max(1, Math.ceil(sorted.length / state.pageSize));
  $('#pageInfo').textContent = `${state.page} / ${totalPages} ページ (全 ${sorted.length} 件)`;
  const liveRegion = $('#resultsLive');
  if (liveRegion) {
    const prefLabel = state.query.pref && state.query.city
      ? `${state.query.pref} ${state.query.city}`
      : '全自治体';
    liveRegion.textContent = `${prefLabel} の検索結果: ${sorted.length}件、ページ ${state.page}/${totalPages}`;
  }
}

export function closeDetail() {
  const dialog = $('#detailDialog');
  if (dialog.open) dialog.close();
  if (lastFocusedElement?.focus) {
    try {
      lastFocusedElement.focus();
    } catch (err) {
      // ignore focus errors
    }
    lastFocusedElement = null;
  }
}

function getItemName(record) {
  if (state.language === 'en' && record.item_name_en) return record.item_name_en;
  return record.item_name;
}

function formatCategories(record) {
  if (!record.categories?.length) return '';
  return record.categories
    .map((code) => categoryLabelFromCode(code, state.language))
    .join(', ');
}

function getInstructions(record) {
  const values = state.language === 'en' && record.instructions_en?.length
    ? record.instructions_en
    : record.instructions;
  return (values || []).join('\n') || '-';
}

function updateSort(key) {
  const sortKey = resolveSortKey(key);
  if (state.sortKey === sortKey) {
    state.sortAsc = !state.sortAsc;
  } else {
    state.sortKey = sortKey;
    state.sortAsc = true;
  }
  render(state.filtered);
}

function resolveSortKey(key) {
  return SORT_KEY_MAP[key] || key;
}

function createHighlightedText(text, keyword) {
  const fragment = document.createDocumentFragment();
  const baseText = text || '';
  const normalizedKeyword = (keyword || '').trim();
  if (!normalizedKeyword) {
    fragment.append(document.createTextNode(baseText));
    return fragment;
  }
  const pattern = new RegExp(escapeRegExp(normalizedKeyword), 'gi');
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(baseText)) !== null) {
    const before = baseText.slice(lastIndex, match.index);
    if (before) fragment.append(document.createTextNode(before));
    const mark = createElement('mark', { className: 'highlight' });
    mark.textContent = match[0];
    fragment.append(mark);
    lastIndex = pattern.lastIndex;
  }
  const rest = baseText.slice(lastIndex);
  if (rest) fragment.append(document.createTextNode(rest));
  if (!fragment.childNodes.length) {
    fragment.append(document.createTextNode(baseText));
  }
  return fragment;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
