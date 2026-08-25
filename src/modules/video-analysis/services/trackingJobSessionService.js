export function createTrackingJobSession(trackObject, options = {}) {
  let controller = null;

  async function run(request = {}) {
    if (typeof trackObject !== "function") throw new Error("No local tracking provider is configured.");
    if (controller) throw new Error("A local tracking job is already running.");
    const active = options.createAbortController?.() || new AbortController();
    controller = active;
    try {
      return await trackObject({ ...request, signal: active.signal });
    } finally {
      if (controller === active) controller = null;
    }
  }

  function cancel() {
    if (!controller) return false;
    controller.abort();
    return true;
  }

  return { cancel, isActive: () => Boolean(controller), run };
}
