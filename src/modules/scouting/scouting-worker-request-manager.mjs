function getTimerApi(deps = {}) {
  const windowRef = deps.windowRef || (typeof globalThis !== "undefined" ? globalThis.window : null);
  return {
    clearTimeout: deps.clearTimeout || windowRef?.clearTimeout?.bind(windowRef) || globalThis.clearTimeout,
    setTimeout: deps.setTimeout || windowRef?.setTimeout?.bind(windowRef) || globalThis.setTimeout,
  };
}

function getRequestError(message = "") {
  return new Error(message || "Scouting player database worker failed.");
}

export function createScoutingWorkerRequestManager(deps = {}) {
  const timers = getTimerApi(deps);
  const pending = new Map();
  let nextRequestId = 0;

  function settleRequest(requestId, settle) {
    const request = pending.get(requestId);
    if (!request) {
      return false;
    }
    pending.delete(requestId);
    timers.clearTimeout?.(request.timeoutId);
    settle(request);
    return true;
  }

  function handleMessage(message = {}) {
    const requestId = Number(message.requestId) || 0;
    return settleRequest(requestId, (request) => {
      if (message.type === "database") {
        request.resolve(message.database || null);
      } else if (message.type === "records") {
        request.resolve(Array.isArray(message.records) ? message.records : []);
      } else if (message.type === "preloaded") {
        request.resolve(true);
      } else {
        request.reject(getRequestError(message.message || "Scouting player database could not be loaded."));
      }
    });
  }

  function rejectAll(error) {
    const requestError = error instanceof Error ? error : getRequestError(error?.message);
    for (const requestId of Array.from(pending.keys())) {
      settleRequest(requestId, (request) => request.reject(requestError));
    }
  }

  function request(worker, payload = {}, options = {}) {
    if (!worker || typeof worker.postMessage !== "function") {
      return Promise.reject(getRequestError("Scouting player database worker is unavailable."));
    }
    const requestId = (nextRequestId += 1);
    const timeoutMs = Math.max(1000, Math.floor(Number(options.timeoutMs) || 45000));
    const type = String(options.type || payload.type || "query").slice(0, 40);

    return new Promise((resolve, reject) => {
      const timeoutId = timers.setTimeout?.(() => {
        const didTimeout = settleRequest(requestId, (request) => {
          request.reject(getRequestError("Scouting player database timed out while loading."));
        });
        if (didTimeout) {
          deps.onTimeout?.({
            pendingCount: pending.size,
            requestId,
            timeoutMs,
            type,
          });
        }
      }, timeoutMs);

      pending.set(requestId, { reject, resolve, timeoutId });
      try {
        worker.postMessage({ ...payload, requestId });
      } catch (error) {
        settleRequest(requestId, (request) => request.reject(error));
      }
    });
  }

  return {
    getPendingCount: () => pending.size,
    handleMessage,
    rejectAll,
    request,
  };
}
