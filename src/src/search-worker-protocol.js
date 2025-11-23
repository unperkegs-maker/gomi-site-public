export const WORKER_MESSAGE_TYPES = {
  RUN_SEARCH: 'RUN_SEARCH',
  SEARCH_RESULT: 'SEARCH_RESULT',
  ERROR: 'ERROR',
};

/**
 * Worker に送る検索リクエストを正規化する。
 * @param {{
 *  query: { pref?: string, city?: string, cat?: string, keyword?: string },
 *  cityCode?: string,
 *  page?: number,
 *  pageSize?: number,
 *  sortKey?: string,
 *  sortAsc?: boolean,
 * }} params
 */
export function createSearchRequestMessage(params) {
  const payload = {
    type: WORKER_MESSAGE_TYPES.RUN_SEARCH,
    query: {
      pref: params.query?.pref || '',
      city: params.query?.city || '',
      cat: params.query?.cat || '',
      keyword: params.query?.keyword || '',
    },
    cityCode: params.cityCode || '',
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 50,
    sortKey: params.sortKey || '',
    sortAsc: params.sortAsc ?? true,
  };
  if (params.requestId) {
    payload.requestId = params.requestId;
  }
  if (Array.isArray(params.records)) {
    payload.records = params.records;
  }
  return payload;
}

/**
 * Worker からの検索結果メッセージかを判定する。
 * @param {any} data
 */
export function isSearchResultMessage(data) {
  return Boolean(
    data &&
    data.type === WORKER_MESSAGE_TYPES.SEARCH_RESULT &&
    Array.isArray(data.records) &&
    typeof data.total === 'number'
  );
}

/**
 * Worker からのエラーメッセージかを判定する。
 * @param {any} data
 */
export function isWorkerErrorMessage(data) {
  return Boolean(
    data &&
    data.type === WORKER_MESSAGE_TYPES.ERROR &&
    typeof data.message === 'string'
  );
}
