const DEFAULT_TIMEOUT_MS = 45_000;

function safeLabel(value) {
  return String(value || "Leaderboard staging request").replace(/[^a-z0-9 _./?&=-]/gi, "").slice(0, 120);
}

function requestError(label, reason) {
  return new Error(`${safeLabel(label)} failed: ${reason}`);
}

export async function requestLeaderboardStagingJson(options = {}) {
  const {
    baseUrl,
    path,
    token = "",
    method = "GET",
    data,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
    label = "Leaderboard staging request",
    requireAuth = true,
  } = options;
  let base;
  let url;
  try {
    base = new URL(String(baseUrl || ""));
    url = new URL(String(path || ""), base);
  } catch {
    throw requestError(label, "invalid request URL");
  }
  if (base.protocol !== "https:" || url.origin !== base.origin) {
    throw requestError(label, "cross-origin or non-HTTPS request blocked");
  }
  if (requireAuth && !String(token || "")) {
    throw requestError(label, "authenticated staging token unavailable");
  }
  if (typeof fetchImpl !== "function") throw requestError(label, "native fetch unavailable");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
  let response;
  let raw;
  try {
    response = await fetchImpl(url.href, {
      method,
      redirect: "error",
      headers: {
        Accept: "application/json",
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: controller.signal,
    });
    raw = await response.text();
  } catch {
    throw requestError(label, "network or timeout");
  } finally {
    clearTimeout(timer);
  }

  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw requestError(label, `invalid JSON response (${Number(response?.status) || 0})`);
  }
  if (!response?.ok || payload?.ok === false) {
    throw requestError(label, `HTTP ${Number(response?.status) || 0}`);
  }
  return payload && typeof payload === "object" ? payload : {};
}
