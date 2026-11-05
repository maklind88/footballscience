import { createDataSafetyRuntimeService } from '../../src/core/data-safety-runtime-service.mjs';
import { createCentralSyncRuntimeService } from '../../src/core/central-sync-runtime-service.mjs';

// Synthetic storage and server; both production services run unchanged.
export function createAcknowledgedCacheHarness(key, options = {}) {
  const disk = new Map(), cache = new Map(), calls = [], views = [], statuses = [], timers = new Map();
  let scope = 'qa-owner', failure = '', sync, timer = 0;
  class Storage {
    get length() { return disk.size; }
    key(i) { return [...disk.keys()][i] ?? null; }
    getItem(k) { return disk.get(String(k)) ?? null; }
    setItem(k, v) {
      if (failure && k === key) { const e = new Error('Synthetic storage failure'); e.name = failure; throw e; }
      disk.set(String(k), String(v));
    }
    removeItem(k) { disk.delete(String(k)); }
    clear() { disk.clear(); }
  }
  const bridge = {
    getReadScope: () => scope, isHydrated: () => true, isCentralKey: () => true, canAutoSyncKey: () => true,
    getStatus: () => ({ metadata: { [key]: { revision: 7 } } }),
    getCachedValue: k => cache.get(k)?.value,
    getCachedValueInfo: k => cache.get(k) || {},
    setCachedValue(k, value, info = {}) {
      if (options.refuseCache) return false;
      cache.set(k, { value, source: 'local-write', durable: true, ...info }); return true;
    },
    removeCachedValue: k => cache.delete(k),
    async syncKey(k, value, opts) { calls.push({ key: k, value, options: opts }); return options.send?.() ?? { ok: true, revision: 8, value: 'server merged content' }; },
  };
  const win = { localStorage: options.storage || new Storage(), footballScienceCentralState: bridge,
    location: { href: 'http://127.0.0.1/' }, addEventListener() {}, console: { warn() {} },
    setTimeout(fn) { timers.set(++timer, fn); return timer; }, clearTimeout(id) { timers.delete(id); } };
  const safety = createDataSafetyRuntimeService({ win, storageConstructor: options.storageConstructor || Storage, navigatorRef: {}, documentRef: {},
    protectedStorageKeys: [key], journaledStorageKeys: [], getCentralStateBridge: () => bridge,
    queueCentralStateWrite: (...args) => sync.queueCentralStateWrite(...args) });
  sync = createCentralSyncRuntimeService({ win, getCurrentUser: () => ({ id: scope }),
    ...Object.fromEntries(['rawGetItem', 'rawSetItem', 'cacheAcknowledgedValue', 'readManifest', 'mutateManifest',
      'hashString', 'getStorageLabel', 'isProtectedStorageKey', 'queueSnapshot', 'queueStatusRefresh'].map(k => [k, safety[k]])),
    sessionPlannerStorageKey: 'football-session-planner-v3', scheduleStorageKey: 'football-schedule-v1',
    periodizationStorageKey: 'football-periodization-v2', dashboardPresentationStorageKey: 'football-dashboard-presentation-mode-v1',
    handleSyncedStateValue: (k, value) => { views.push({ key: k, value }); options.onView?.(); },
    handleSyncStatus: (k, state, message) => statuses.push({ key: k, state, message }),
  });
  safety.install();
  return { win, bridge, safety, sync, disk, cache, calls, views, statuses,
    fail: (name = 'QuotaExceededError') => { failure = name; },
    setScope: value => { scope = value; },
  };
}
