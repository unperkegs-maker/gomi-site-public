export function $(selector) {
  if (!selector) return null;
  if (typeof selector !== 'string') {
    return null;
  }
  if (selector.startsWith('#')) {
    return document.querySelector(selector);
  }
  return document.getElementById(selector) || document.querySelector(selector);
}

export function createElement(tag, options = {}) {
  const el = document.createElement(tag);
  Object.assign(el, options);
  return el;
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[m]));
}

export function normalizeText(str) {
  if (str == null) return '';
  try {
    return String(str).normalize('NFKC').toLowerCase();
  } catch (err) {
    return String(str).toLowerCase();
  }
}

export function unique(arr) {
  return [...new Set(arr)];
}

export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleDateString();
}

export function sortByLocale(list, selector = (value) => value) {
  return [...list].sort((a, b) => {
    const left = selector(a) ?? '';
    const right = selector(b) ?? '';
    return String(left).localeCompare(String(right), 'ja');
  });
}
