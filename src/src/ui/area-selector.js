import { getPrefectureList, getMunicipalitiesByPrefecture } from '../data-store.js';

const defaultTexts = {
  prefPlaceholder: '都道府県を選択してください',
  cityPlaceholder: '市区町村を選択してください',
  cityDisabled: 'まず都道府県を選択してください',
};

/**
 * 都道府県・市区町村セレクトを共通管理する薄いヘルパー。
 * プレーンなセレクト要素を引数に渡すだけで、選択肢の再構築と
 * change イベントの伝播を一本化できる。
 */
export function createAreaSelector({
  prefSelect,
  citySelect,
  texts = {},
  formatPrefOption,
  formatCityOption,
  onPrefChange,
  onCityChange,
} = {}) {
  if (!prefSelect || !citySelect) {
    throw new Error('prefSelect と citySelect は必須です');
  }
  const labels = { ...defaultTexts, ...texts };
  const state = {
    pref: '',
    cityCode: '',
    fallbackCityName: '',
  };

  function buildPrefOptions() {
    prefSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = labels.prefPlaceholder;
    prefSelect.appendChild(placeholder);

    getPrefectureList().forEach((pref) => {
      const option = document.createElement('option');
      option.value = pref.name;
      option.textContent = formatPrefOption
        ? formatPrefOption(pref)
        : `${pref.name} (${pref.municipalityCount})`;
      prefSelect.appendChild(option);
    });
    if (state.pref) {
      prefSelect.value = state.pref;
    }
  }

  function buildCityOptions() {
    citySelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = state.pref ? labels.cityPlaceholder : labels.cityDisabled;
    citySelect.appendChild(placeholder);
    if (!state.pref) {
      citySelect.disabled = true;
      return;
    }
    const municipalities = getMunicipalitiesByPrefecture(state.pref);
    citySelect.disabled = municipalities.length === 0;
    municipalities.forEach((municipality) => {
      const option = document.createElement('option');
      option.value = municipality.code;
      option.textContent = formatCityOption
        ? formatCityOption(municipality)
        : `${municipality.name} (${municipality.itemCount})`;
      citySelect.appendChild(option);
    });
    const hasSelected = municipalities.some((municipality) => municipality.code === state.cityCode);
    if (state.cityCode && hasSelected) {
      citySelect.value = state.cityCode;
    } else if (state.fallbackCityName) {
      const fallback = municipalities.find((municipality) => municipality.name === state.fallbackCityName);
      if (fallback) {
        state.cityCode = fallback.code;
        citySelect.value = fallback.code;
      }
    }
  }

  function emitPrefChange(prefName) {
    if (typeof onPrefChange !== 'function') return;
    const prefEntry = prefName
      ? getPrefectureList().find((pref) => pref.name === prefName)
      : null;
    onPrefChange(prefEntry || null);
  }

  function emitCityChange(cityCode) {
    if (typeof onCityChange !== 'function') return;
    if (!cityCode) {
      onCityChange(null);
      return;
    }
    const list = state.pref ? getMunicipalitiesByPrefecture(state.pref) : [];
    const municipality = list.find((entry) => entry.code === cityCode) || null;
    onCityChange(municipality);
  }

  prefSelect.addEventListener('change', (event) => {
    state.pref = event.target.value;
    state.cityCode = '';
    state.fallbackCityName = '';
    buildCityOptions();
    emitPrefChange(state.pref);
    emitCityChange('');
  });

  citySelect.addEventListener('change', (event) => {
    state.cityCode = event.target.value;
    emitCityChange(state.cityCode);
  });

  buildPrefOptions();
  buildCityOptions();

  return {
    /**
     * URL 復元など、外部からセレクトの表示値を同期したいときに利用。
     */
    sync({ pref, cityCode, fallbackCityName } = {}) {
      if (typeof pref !== 'undefined') state.pref = pref || '';
      if (typeof cityCode !== 'undefined') state.cityCode = cityCode || '';
      if (typeof fallbackCityName !== 'undefined') state.fallbackCityName = fallbackCityName || '';
      buildPrefOptions();
      buildCityOptions();
    },
    getState() {
      return { ...state };
    },
  };
}
