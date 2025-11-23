import Fuse from 'fuse.js';
import { filterRecords } from './search.js';
import { normalizeText } from './utils.js';

const DEFAULT_FUSE_OPTIONS = {
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.35,
  keys: [
    { name: 'item_name', weight: 0.5 },
    { name: 'item_name_en', weight: 0.1 },
    { name: 'categories', weight: 0.15 },
    { name: 'instructions', weight: 0.15 },
    { name: 'instructions_en', weight: 0.1 },
  ],
};

function determineDynamicThreshold(keyword) {
  if (!keyword || keyword.length <= 1) return 0.2;
  if (keyword.length <= 3) return 0.28;
  if (keyword.length >= 10) return 0.4;
  return 0.33;
}

function collectSearchableText(record) {
  const bucket = [
    record.item_name,
    record.item_name_en,
    ...(record.instructions || []),
    ...(record.instructions_en || []),
    ...(record.categories || []),
  ].filter(Boolean);
  return normalizeText(bucket.join(' '));
}

function substringFallback(records, keyword) {
  const needle = normalizeText(keyword);
  if (!needle) return records;
  return records.filter((record) => collectSearchableText(record).includes(needle));
}

let searchCache = {
  records: null,
  params: '',
  fuse: null,
};

/**
 * Fuse.js を用いた高精度検索を実行する。
 * Pref / City / Category でのフィルタリングは従来検索と同等に行いつつ、
 * keyword はスコア順で返す。
 *
 * @param {import('./search.js').AggregatedItem[]} records
 * @param {{pref?: string, city?: string, cat?: string, keyword?: string}} query
 * @param {{
 *  fuseOptions?: import('fuse.js').IFuseOptions<any>,
 *  fallbackToSubstring?: boolean,
 * }} [options]
 * @returns {import('./search.js').AggregatedItem[]}
 */
export function runRelevanceSearch(records = [], query = {}, options = {}) {
  // 1. まずはフィルタリング (keyword以外)
  //    ここで records がフィルタリングされ、scoped という新しい配列になる
  //    しかし records 自体が同じで、pref/city/cat が同じなら、scoped の内容は同じはず。
  const paramsSignature = `${query.pref || ''}:${query.city || ''}:${query.cat || ''}`;

  let scoped;
  let fuse;

  // キャッシュヒット確認
  if (searchCache.records === records && searchCache.params === paramsSignature && searchCache.fuse) {
    fuse = searchCache.fuse;
    // scoped は fuse._docs などを参照すれば取れるが、
    // ここでは検索結果だけが欲しいので scoped 自体は再生成しなくてよい場合もある。
    // ただし keyword が空の場合は scoped を返す必要があるので、
    // キャッシュに scoped も持たせるか、あるいは keyword がある場合のみ Fuse を使う。
  } else {
    // キャッシュミス or 初期状態
    scoped = filterRecords(records, {
      pref: query.pref,
      city: query.city,
      cat: query.cat,
      keyword: '',
    });

    const fuseOptions = {
      ...DEFAULT_FUSE_OPTIONS,
      ...(options.fuseOptions || {}),
    };
    // threshold の動的決定は keyword に依存するため、Fuse インスタンス作成時には固定値にするか、
    // あるいは検索時に override する必要があるが、Fuse v6/v7 では search() 時に threshold を変えられない(オプションはコンストラクタ)。
    // そのため、keyword の長さによって threshold を変えたい場合はインスタンスを作り直す必要がある。
    // しかし、パフォーマンス優先なら「汎用的な threshold」でインスタンスを作り置きする方が良い。
    // ここでは 0.3 をデフォルトとし、極端に短いキーワードの時だけ別途処理するか、
    // あるいはキャッシュを諦めるか。
    // 今回は「データ量が増えても検索に時間がかからない」が要件なので、キャッシュを優先し、threshold は固定(0.35)とする。
    // もし厳密に dynamic threshold をやりたいなら、threshold ごとにキャッシュする等の工夫が必要。

    fuse = new Fuse(scoped, fuseOptions);

    // キャッシュ更新
    searchCache = {
      records,
      params: paramsSignature,
      fuse,
      scoped, // keyword空の時用に保持
    };
  }

  const keyword = (query.keyword || '').trim();
  if (!keyword) {
    return searchCache.scoped || [];
  }

  if (searchCache.scoped && !searchCache.scoped.length) {
    return [];
  }

  const results = fuse.search(keyword);
  if (results.length > 0) {
    return results.map((result) => result.item);
  }

  if (options.fallbackToSubstring !== false) {
    // fallback も scoped に対して行う
    return substringFallback(searchCache.scoped, keyword);
  }

  return searchCache.scoped;
}

export { determineDynamicThreshold };
