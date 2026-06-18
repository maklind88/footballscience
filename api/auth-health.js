const {
  buildSupabaseKeyHeaders,
  readConfig,
  sendCorsHeaders,
  sendJson,
} = require("./_lib/supabase-admin.js");
const { guardApiRequest } = require("./_lib/platform-security.js");

const DEFAULT_AUTH_HEALTH_TIMEOUT_MS = 25000;
const AUTH_HEALTH_TIMEOUT_MS = Number(process.env.AUTH_HEALTH_TIMEOUT_MS || DEFAULT_AUTH_HEALTH_TIMEOUT_MS);

function timeoutSignal(timeoutMs) {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

async function readHealthPayload(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
  }

  const security = guardApiRequest(req, res, {
    route: "/api/auth-health",
    moduleId: "auth",
    action: "observe",
  });
  if (!security.ok) {
    return;
  }

  const { url, anonKey } = readConfig();
  if (!url || !anonKey) {
    return sendJson(res, 500, {
      ok: false,
      service: "supabase-auth",
      reason: "Supabase browser authentication is not configured.",
    });
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      method: "GET",
      headers: buildSupabaseKeyHeaders(anonKey, { accept: "application/json" }),
      signal: timeoutSignal(AUTH_HEALTH_TIMEOUT_MS),
      cache: "no-store",
    });
    const payload = await readHealthPayload(response);
    const reachable = response.ok && String(payload.name || "").toLowerCase() === "gotrue";

    return sendJson(res, reachable ? 200 : 503, {
      ok: reachable,
      service: "supabase-auth",
      status: response.status,
      ms: Date.now() - startedAt,
      name: payload.name || "",
      version: payload.version || "",
      reason: reachable ? "" : payload.message || payload.error || "Supabase Auth health check failed.",
    });
  } catch (error) {
    return sendJson(res, 503, {
      ok: false,
      service: "supabase-auth",
      status: 0,
      ms: Date.now() - startedAt,
      reason:
        error?.name === "TimeoutError" || error?.name === "AbortError"
          ? "Supabase Auth health check timed out."
          : "Supabase Auth health check could not be reached.",
    });
  }
};
