export const state = {
  all: [],
  aggregated: [],
  filtered: [],
  meta: {},
  page: 1,
  pageSize: 50,
  displayMode: 'auto',
  sortKey: '',
  sortAsc: true,
  query: {
    pref: '',
    city: '',
    cat: '',
    keyword: '',
  },
  categoryKey: 'category_raw',
  cityKey: 'municipality_name',
  selectedMunicipalityCode: '',
  language: 'ja',
};

export function resetPagination() {
  state.page = 1;
}

export function setLanguage(lang) {
  state.language = lang;
  try {
    localStorage.setItem('language', lang);
  } catch (err) {
    console.warn('Failed to persist language preference', err);
  }
}

export function hydratePrefs() {
  try {
    const storedPageSize = localStorage.getItem('pageSize');
    if (storedPageSize) state.pageSize = Number(storedPageSize);
    const storedDisplay = localStorage.getItem('displayMode');
    if (storedDisplay) state.displayMode = storedDisplay;
    const storedLang = localStorage.getItem('language');
    if (storedLang) state.language = storedLang;
  } catch (err) {
    console.warn('Failed to read preferences', err);
  }
}

export function persistPrefs() {
  try {
    localStorage.setItem('pageSize', String(state.pageSize));
    localStorage.setItem('displayMode', state.displayMode);
  } catch (err) {
    console.warn('Failed to save preferences', err);
  }
}
