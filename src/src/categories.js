export const CATEGORY_DICTIONARY = {
  burnable: { ja: '可燃ごみ', en: 'Burnable' },
  nonburnable: { ja: '不燃ごみ', en: 'Non-burnable' },
  resource: { ja: '資源ごみ', en: 'Recyclables' },
  bulky: { ja: '粗大ごみ', en: 'Bulky waste' },
  hazardous: { ja: '危険・有害', en: 'Hazardous' },
  other: { ja: 'その他', en: 'Other' },
};

export function normalizeCategoryCode(name) {
  const text = String(name || '').trim();
  if (/可燃/.test(text) || /燃やす/.test(text) || /burnable/i.test(text)) return 'burnable';
  if (/不燃/.test(text) || /燃やさない/.test(text) || /non.?burnable/i.test(text)) return 'nonburnable';
  if (/資源/.test(text) || /recycl/i.test(text)) return 'resource';
  if (/粗大/.test(text) || /大型/.test(text) || /bulky/i.test(text)) return 'bulky';
  if (/危険/.test(text) || /有害/.test(text) || /hazard/i.test(text)) return 'hazardous';
  if (!text) return '';
  return 'other';
}

export function categoryLabelFromCode(code, lang = 'ja') {
  return CATEGORY_DICTIONARY[code]?.[lang] || CATEGORY_DICTIONARY.other[lang];
}
