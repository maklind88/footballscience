const { performance } = require("node:perf_hooks");

const phases = new Set(["auth", "bucket", "read", "authorize", "receipt", "database", "compatibility", "state", "audit", "history", "activity"]);

function createAppStateWriteTiming(res, { now = () => performance.now() } = {}) {
  const elapsed = new Map();
  async function measure(phase, action) {
    if (!phases.has(phase)) return action();
    const startedAt = now();
    try {
      return await action();
    } finally {
      const duration = Math.max(0, now() - startedAt);
      elapsed.set(phase, (elapsed.get(phase) || 0) + duration);
      // Diagnostics must never change the result of an acknowledged write.
      try {
        res.setHeader("Server-Timing", Array.from(elapsed, ([name, ms]) => `${name};dur=${ms.toFixed(1)}`).join(", "));
      } catch {}
    }
  }
  return { measure };
}

module.exports = { createAppStateWriteTiming };
