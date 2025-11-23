import { runRelevanceSearch } from './search-fuse.js';
import { createQuerySignature } from './search-runner.js';
import { WORKER_MESSAGE_TYPES } from './search-worker-protocol.js';

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== WORKER_MESSAGE_TYPES.RUN_SEARCH) return;

  try {
    const query = data.query || {};
    const scopedRecords = Array.isArray(data.records) ? data.records : [];
    const filtered = runRelevanceSearch(scopedRecords, query);
    self.postMessage({
      type: WORKER_MESSAGE_TYPES.SEARCH_RESULT,
      requestId: data.requestId,
      signature: createQuerySignature(query, data.cityCode),
      records: filtered,
      total: filtered.length,
    });
  } catch (err) {
    self.postMessage({
      type: WORKER_MESSAGE_TYPES.ERROR,
      requestId: data.requestId,
      message: err?.message || 'Search worker failed',
    });
  }
});
