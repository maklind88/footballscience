const phases = new Set(["navigation", "auth-ready", "app-ready", "login-ui", "central-initial", "server-session", "central-retry", "dismiss"]);
const routes = new Set(["/api/app-state", "/api/client-config"]);
const milliseconds = (value) => Math.max(0, Math.round(value));

// Only fixed labels, booleans, counts and durations leave this probe.
export function createLiveReadinessProbe(page, { origin, attempt, testStartedAt, budgetMs, now = () => performance.now(), emit = console.log }) {
  const startedAt = now();
  const active = new Map();
  const requests = Object.fromEntries([...routes].map((route) => [route, {
    started: 0, finished: 0, failed: 0, httpErrors: 0, throttled: 0, maxMs: 0,
  }]));
  const stages = [];
  let lastReadiness = null;
  let droppedRequests = 0;
  let stopped = false;

  function onRequest(request) {
    try {
      const url = new URL(request.url());
      if (url.origin !== origin || !routes.has(url.pathname)) return;
      requests[url.pathname].started += 1;
      if (active.size >= 64) { droppedRequests += 1; return; }
      active.set(request, { route: url.pathname, start: now() });
    } catch {}
  }
  function onResponse(response) {
    const item = active.get(response.request());
    if (!item) return;
    const status = response.status();
    if (status >= 400) requests[item.route].httpErrors += 1;
    if (status === 429) requests[item.route].throttled += 1;
  }
  function complete(request, failed) {
    const item = active.get(request);
    if (!item) return;
    const stats = requests[item.route];
    stats[failed ? "failed" : "finished"] += 1;
    stats.maxMs = Math.max(stats.maxMs, milliseconds(now() - item.start));
    active.delete(request);
  }
  const onFinished = (request) => complete(request, false);
  const onFailed = (request) => complete(request, true);
  const listeners = { request: onRequest, response: onResponse, requestfinished: onFinished, requestfailed: onFailed };
  for (const [event, listener] of Object.entries(listeners)) page.on(event, listener);

  return {
    readiness(value) {
      if (value === "ready" || value === "missing") { lastReadiness = { state: value }; return; }
      const match = /^hydrated=(true|false) hydrating=(true|false) error=(.*)$/s.exec(String(value));
      lastReadiness = match ? {
        state: "waiting", hydrated: match[1] === "true", hydrating: match[2] === "true", hasError: match[3] !== "none",
      } : { state: "unknown" };
    },
    async step(name, action) {
      if (!phases.has(name)) throw new Error("Unknown readiness phase");
      const start = now();
      let outcome = "failed";
      try {
        const result = await action();
        outcome = "passed";
        return result;
      } finally {
        stages.push({ phase: name, outcome, elapsedMs: milliseconds(now() - start) });
      }
    },
    finish(passed) {
      if (stopped) return;
      stopped = true;
      for (const [event, listener] of Object.entries(listeners)) page.off(event, listener);
      const end = now();
      const pending = Object.fromEntries([...routes].map((route) => [route, { count: 0, oldestMs: 0 }]));
      for (const item of active.values()) {
        pending[item.route].count += 1;
        pending[item.route].oldestMs = Math.max(pending[item.route].oldestMs, milliseconds(end - item.start));
      }
      active.clear();
      const report = {
        schema: "footballscience-live-readiness-v1",
        attempt, outcome: passed ? "passed" : "failed",
        elapsedMs: milliseconds(end - startedAt),
        elapsedSinceBeforeEachMs: milliseconds(end - testStartedAt),
        estimatedRemainingMs: Math.max(0, budgetMs - milliseconds(end - testStartedAt)),
        stages, lastReadiness, requests, pending, droppedRequests,
      };
      emit("[live-readiness] " + JSON.stringify(report));
      return report;
    },
  };
}
