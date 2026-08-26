const DEFAULT_CAPABILITY_TTL_MS = 60_000;

function normalizeCapability(payload = {}) {
  const dataset = payload.dataset && typeof payload.dataset === "object" ? payload.dataset : {};
  return {
    available: payload.enabled === true && dataset.available !== false,
    ready: dataset.ready === true,
    versioningAvailable: dataset.versioningAvailable === true,
    canAdministerData: payload.canAdministerData === true || dataset.canAdministerData === true,
    readMode: String(dataset.readMode || "legacy-file"),
    rowCount: Math.max(0, Math.floor(Number(dataset.rowCount) || 0)),
    metricCount: Math.max(0, Math.floor(Number(dataset.metricCount) || 0)),
    activeDatasetVersion: dataset.activeDatasetVersion || null,
    degraded: payload.degraded === true,
    fallbackReason: String(payload.fallbackReason || payload.reason || "").trim().slice(0, 240),
  };
}

export function createScoutingDatabaseCapabilityService(deps = {}) {
  let cache = null;
  let inFlight = null;
  const ttlMs = Math.max(5_000, Math.floor(Number(deps.ttlMs) || DEFAULT_CAPABILITY_TTL_MS));
  const now = deps.now || (() => Date.now());

  function invalidate() {
    cache = null;
    inFlight = null;
  }

  async function load(options = {}) {
    if (!options.force && cache && now() - cache.loadedAt < ttlMs) return cache.value;
    if (!options.force && inFlight) return inFlight;
    const request = Promise.resolve(deps.fetchStatus?.({ signal: options.signal }))
      .then((response) => {
        if (!response?.ok) {
          return normalizeCapability({
            degraded: true,
            enabled: false,
            fallbackReason: response?.reason || "The server dataset status could not be verified.",
          });
        }
        const value = normalizeCapability(response.result || {});
        cache = { loadedAt: now(), value };
        return value;
      })
      .catch((error) => {
        if (error?.name === "AbortError") throw error;
        return normalizeCapability({
          degraded: true,
          enabled: false,
          fallbackReason: error?.message || "The server dataset status could not be verified.",
        });
      })
      .finally(() => {
        if (inFlight === request) inFlight = null;
      });
    inFlight = request;
    return request;
  }

  return {
    getCached: () => cache?.value || null,
    invalidate,
    load,
    shouldUseServer: async (options = {}) => {
      const capability = await load(options);
      return capability.available && capability.ready;
    },
  };
}

export { normalizeCapability as normalizeScoutingDatabaseCapability };
