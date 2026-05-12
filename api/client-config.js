const {
  findAuthUserByIdentifier,
  parseJsonBody,
  readConfig,
  sendCorsHeaders,
  sendJson,
} = require("./_lib/supabase-admin.js");
const { guardApiRequest } = require("./_lib/platform-security.js");

const MAX_IDENTIFIER_LENGTH = 180;
const MAX_PASSWORD_LENGTH = 256;
const LOGIN_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 12;
const loginRateBuckets = new Map();

function normalizeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function clientIp(req) {
  return normalizeText(
    String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0],
    80
  ) || "unknown";
}

function checkLoginRateLimit(req, nowMs = Date.now()) {
  const key = clientIp(req);
  const bucket = loginRateBuckets.get(key);
  if (!bucket || nowMs - bucket.startedAt >= LOGIN_RATE_LIMIT_WINDOW_MS) {
    loginRateBuckets.set(key, { startedAt: nowMs, count: 1 });
    return true;
  }

  bucket.count += 1;
  if (loginRateBuckets.size > 500) {
    for (const [bucketKey, value] of loginRateBuckets.entries()) {
      if (nowMs - value.startedAt >= LOGIN_RATE_LIMIT_WINDOW_MS) {
        loginRateBuckets.delete(bucketKey);
      }
    }
  }

  return bucket.count <= LOGIN_RATE_LIMIT_MAX;
}

async function readSupabasePayload(response) {
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

function publicAuthError(payload = {}, fallback = "Invalid login credentials.") {
  const raw = String(payload.error_description || payload.msg || payload.message || payload.error || fallback);
  const lower = raw.toLowerCase();
  if (lower.includes("invalid")) {
    return "Invalid login credentials.";
  }
  if (lower.includes("rate")) {
    return "Too many login attempts. Please wait a moment and try again.";
  }
  return raw.slice(0, 180) || fallback;
}

async function resolveLoginEmail(identifier) {
  const cleanIdentifier = normalizeText(identifier, MAX_IDENTIFIER_LENGTH).toLowerCase();
  if (!cleanIdentifier || cleanIdentifier.includes("@")) {
    return cleanIdentifier;
  }

  const user = await findAuthUserByIdentifier(cleanIdentifier);
  return normalizeText(user?.email, MAX_IDENTIFIER_LENGTH).toLowerCase();
}

function readBuildId() {
  return (
    String(
      process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.VERCEL_DEPLOYMENT_ID ||
        process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
        process.env.VERCEL_GIT_COMMIT_REF ||
        ""
    ).trim() || "local"
  );
}

async function handleLogin(req, res) {
  if (!checkLoginRateLimit(req)) {
    return sendJson(res, 429, { ok: false, reason: "Too many login attempts. Please wait a moment and try again." });
  }

  const { url, anonKey } = readConfig();
  if (!url || !anonKey) {
    return sendJson(res, 500, { ok: false, reason: "Authentication is not configured." });
  }

  let body = {};
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    return sendJson(res, error.code === "BODY_TOO_LARGE" ? 413 : 400, { ok: false, reason: "Login request is invalid." });
  }

  const identifier = normalizeText(body.email || body.identifier, MAX_IDENTIFIER_LENGTH).toLowerCase();
  const password = normalizeText(body.password, MAX_PASSWORD_LENGTH);
  if (!identifier || !password) {
    return sendJson(res, 400, { ok: false, reason: "Username and password are required." });
  }

  let email = "";
  try {
    email = await resolveLoginEmail(identifier);
  } catch {
    return sendJson(res, 503, { ok: false, reason: "Authentication could not be reached. Please try again." });
  }

  if (!email) {
    return sendJson(res, 401, { ok: false, reason: "Invalid login credentials." });
  }

  try {
    const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(12000),
    });
    const payload = await readSupabasePayload(response);
    if (!response.ok) {
      return sendJson(res, response.status === 429 ? 429 : 401, {
        ok: false,
        reason: publicAuthError(payload),
      });
    }

    if (!payload?.access_token || !payload?.refresh_token || !payload?.user?.id) {
      return sendJson(res, 502, { ok: false, reason: "Could not start a session." });
    }

    return sendJson(res, 200, {
      ok: true,
      session: {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        expires_in: payload.expires_in,
        expires_at: payload.expires_at,
        token_type: payload.token_type,
        user: payload.user,
      },
    });
  } catch (error) {
    return sendJson(res, 504, {
      ok: false,
      reason:
        error?.name === "TimeoutError" || error?.name === "AbortError"
          ? "Authentication took too long. Please try again."
          : "Authentication could not be reached. Please try again.",
    });
  }
}

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  const security = guardApiRequest(req, res, { route: "/api/client-config", moduleId: "auth" });
  if (!security.ok) {
    return;
  }

  if (req.method === "POST") {
    return handleLogin(req, res);
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
  }

  const { url, anonKey, serviceRoleKey } = readConfig();
  if (!url || !anonKey) {
    return sendJson(res, 500, { ok: false, reason: "Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment." });
  }

  return sendJson(res, 200, {
    ok: true,
    buildId: readBuildId(),
    url,
    anonKey,
    hasServiceRoleKey: Boolean(serviceRoleKey),
  });
};
