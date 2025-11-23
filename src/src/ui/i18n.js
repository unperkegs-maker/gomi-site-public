import { state, setLanguage } from '../state.js';
import ja from '../locales/ja.js';
import en from '../locales/en.js';

const messages = { ja, en };

let observers = [];

export function t(path) {
  const segments = path.split('.');
  let current = messages[state.language] || messages.ja;
  for (const segment of segments) {
    if (current && typeof current === 'object') {
      current = current[segment];
    }
  }
  return current ?? path;
}

export function useI18n(elements) {
  observers = elements;
  applyTranslations();
}

export function applyTranslations() {
  document.documentElement.lang = state.language;
  observers.forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const text = t(key);
    if (el.placeholder !== undefined) {
      el.placeholder = text;
    } else {
      el.textContent = text;
    }
  });
}

export function initLanguageSelector(selectEl, onChange) {
  selectEl.value = state.language;
  selectEl.addEventListener('change', (event) => {
    setLanguage(event.target.value);
    applyTranslations();
    if (typeof onChange === 'function') onChange();
  });
}
