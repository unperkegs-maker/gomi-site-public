import { runRelevanceSearch } from './search-fuse.js';
import {
  createLRUCache,
  createQuerySignature,
} from './search-runner.js';
import {
  createSearchRequestMessage,
  isSearchResultMessage,
  isWorkerErrorMessage,
} from './search-worker-protocol.js';

const DEFAULT_TIMEOUT_MS = 3000;

function defaultWorkerFactory() {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./search.worker.js', import.meta.url), { type: 'module' });
  } catch (err) {
    console.warn('Search worker init failed', err);
    return null;
  }
}

/**
 * Worker ベース検索のブリッジを生成する。
 * @param {{
 *  cacheLimit?: number,
 *  workerTimeoutMs?: number,
 *  fallbackRunner?: (records: any[], query: any) => any[],
 *  workerFactory?: () => Worker | null,
 * }} [options]
 */
export function createSearchBridge(options = {}) {
  const {
    cacheLimit = 5,
    workerTimeoutMs = DEFAULT_TIMEOUT_MS,
    fallbackRunner = runRelevanceSearch,
    workerFactory = defaultWorkerFactory,
  } = options;
  const cache = createLRUCache(cacheLimit);
  let workerRef = null;
  let workerBroken = false;

  function ensureWorker() {
    if (workerBroken) return null;
    if (workerRef) return workerRef;
    const instance = workerFactory();
    if (!instance) {
      workerBroken = true;
      return null;
    }
    instance.addEventListener?.('error', (event) => {
      console.error('Search worker error', event?.error || event?.message);
      workerBroken = true;
    });
    workerRef = instance;
    return workerRef;
  }

  function runFallback(records, query, signature) {
    const result = fallbackRunner(records, query);
    cache.set(signature, result);
    return result;
  }

  function runSearch({ query, cityCode, records }) {
    const signature = createQuerySignature(query, cityCode);
    const cached = cache.get(signature);
    if (cached) return Promise.resolve(cached);

    const worker = ensureWorker();
    if (!worker) {
      return Promise.resolve(runFallback(records, query, signature));
    }

    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const message = createSearchRequestMessage({
      query,
      cityCode,
      records,
      requestId,
    });

    return new Promise((resolve) => {
      let settled = false;
      const handleMessage = (event) => {
        const data = event.data;
        if (isSearchResultMessage(data) && data.requestId === requestId) {
          settled = true;
          cleanup();
          cache.set(signature, data.records);
          resolve(data.records);
        } else if (isWorkerErrorMessage(data) && data.requestId === requestId) {
          settled = true;
          cleanup();
          resolve(runFallback(records, query, signature));
        }
      };
      const handleTimeout = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(runFallback(records, query, signature));
      };
      const cleanup = () => {
        clearTimeout(timeoutId);
        worker.removeEventListener?.('message', handleMessage);
      };

      const timeoutId = setTimeout(handleTimeout, workerTimeoutMs);
      worker.addEventListener?.('message', handleMessage);
      try {
        worker.postMessage(message);
      } catch (err) {
        cleanup();
        resolve(runFallback(records, query, signature));
      }
    });
  }

  function clearCache() {
    cache.clear();
  }

  return { runSearch, clearCache };
}
