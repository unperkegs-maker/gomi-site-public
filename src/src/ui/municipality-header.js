import { categoryLabelFromCode } from '../categories.js';
import { formatDate, createElement } from '../utils.js';

/**
 * 自治体の概要情報をカード風に描画する。
 * summary が null の場合は「未選択」のメッセージを表示する。
 */
export function renderMunicipalityHeader({ container, summary, generatedAt, language = 'ja' }) {
  if (!container) return;
  if (!summary) {
    container.replaceChildren();
    const message = createElement('p', { className: 'muted' });
    message.textContent = '自治体を選択すると概要が表示されます。';
    container.appendChild(message);
    container.dataset.empty = 'true';
    return;
  }
  container.dataset.empty = 'false';
  const categoryLabels = (summary.sampleCategories || [])
    .map((code) => categoryLabelFromCode(code, language))
    .filter(Boolean);
  const updatedText = generatedAt ? formatDate(generatedAt) : '';
  const sampleText = categoryLabels.length ? categoryLabels.join(' / ') : '―';
  container.replaceChildren();
  const headline = createElement('div', { className: 'municipality-headline' });
  const headlineLeft = createElement('div');
  const prefLabel = createElement('p', { className: 'pref-label' });
  prefLabel.textContent = summary.prefecture || '';
  const nameHeading = createElement('h3');
  nameHeading.textContent = summary.name || '';
  headlineLeft.append(prefLabel, nameHeading);
  const countChip = createElement('span', { className: 'count-chip' });
  countChip.textContent = `${summary.itemCount || 0}件`;
  headline.append(headlineLeft, countChip);

  const statsList = createElement('dl', { className: 'municipality-stats' });
  const stats = [
    ['カテゴリ種類', `${summary.categoryCount || 0}種類`],
    ['サンプルカテゴリ', sampleText],
    ['データ更新', updatedText || '日付情報なし'],
  ];
  stats.forEach(([label, value]) => {
    const wrapper = createElement('div');
    const dt = createElement('dt');
    dt.textContent = label;
    const dd = createElement('dd');
    dd.textContent = value;
    wrapper.append(dt, dd);
    statsList.appendChild(wrapper);
  });

  container.append(headline, statsList);
}
