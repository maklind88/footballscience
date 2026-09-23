const {
  buildSupabaseKeyHeaders,
  findAuthUserByIdentifier,
  getCurrentActor,
  readConfig,
  sendPasswordReset,
} = require("./supabase-admin.js");
const { resolvePlatformActorScope } = require("./platform-identity.js");

const RESPONSE_SCHEMA = "fs-desktop-auth-response-v1";
const IDENTITY_SCHEMA = "fs-desktop-verified-identity-v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_IDENTIFIER_LENGTH = 180;
const MAX_PASSWORD_LENGTH = 256;
const MAX_REFRESH_TOKEN_LENGTH = 16384;
const AUTH_TIMEOUT_MS = 30000;

function boundedText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function bearer(value) {
  const raw = boundedText(value, 20000);
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : raw;
}

async function parsePayload(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function publicReason(payload, fallback = "Authentication failed.") {
  const raw = boundedText(payload?.reason || payload?.error_description || payload?.msg || payload?.message || payload?.error, 220);
  const lower = raw.toLowerCase();
  if (lower.includes("invalid") || lower.includes("credential")) return "Invalid login credentials.";
  if (lower.includes("rate")) return "Too many login attempts. Please wait and try again.";
  return fallback;
}

async function exchangeToken(grantType, body, dependencies = {}) {
  const config = (dependencies.readConfig || readConfig)();
  if (!config.url || !config.anonKey) return { ok: false, status: 503, reason: "Authentication is not configured." };
  const fetchImpl = dependencies.fetchImpl || fetch;
  try {
    const response = await fetchImpl(`${config.url}/auth/v1/token?grant_type=${encodeURIComponent(grantType)}`, {
      method: "POST",
      headers: { ...buildSupabaseKeyHeaders(config.anonKey), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(AUTH_TIMEOUT_MS) : undefined,
    });
    const payload = await parsePayload(response);
    if (!response.ok) return { ok: false, status: response.status === 429 ? 429 : 401, reason: publicReason(payload) };
    if (!payload.access_token || !payload.refresh_token || !Number(payload.expires_at || payload.expires_in)) {
      return { ok: false, status: 502, reason: "Authentication returned an incomplete session." };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, status: 503, reason: "Authentication is temporarily unavailable." };
  }
}

async function resolveEmail(identifier, dependencies = {}) {
  const normalized = boundedText(identifier, MAX_IDENTIFIER_LENGTH).toLowerCase();
  if (normalized.includes("@")) return normalized;
  const lookup = dependencies.findAuthUserByIdentifier || findAuthUserByIdentifier;
  const user = await lookup(normalized);
  return boundedText(user?.email, MAX_IDENTIFIER_LENGTH).toLowerCase();
}

function buildVerifiedIdentity(scope, now = Date.now()) {
  const actor = scope?.actor || {};
  const primary = scope?.scope?.primary || {};
  const organizationId = boundedText(primary.organizationId, 120);
  const teamId = boundedText(primary.teamId, 120);
  if (
    scope?.schema !== "footballscience-platform-identity-scope-v1"
    || actor.status !== "active"
    || !UUID_PATTERN.test(actor.id || "")
    || !UUID_PATTERN.test(organizationId)
    || !UUID_PATTERN.test(teamId)
  ) {
    return null;
  }
  const profile = actor.profile || {};
  const club = (scope.scope?.clubs || []).find((item) => item.id === primary.clubId) || {};
  const team = (scope.scope?.teams || []).find((item) => item.id === teamId) || {};
  return {
    schema: IDENTITY_SCHEMA,
    actorId: actor.id,
    email: boundedText(actor.email || profile.email, 254).toLowerCase(),
    role: boundedText(primary.role || actor.role || "guest", 40),
    status: "active",
    organizationId,
    clubId: boundedText(primary.clubId, 120),
    teamId,
    displayName: boundedText(profile.displayName, 180),
    firstName: boundedText(profile.firstName, 120),
    lastName: boundedText(profile.lastName, 120),
    clubName: boundedText(club.name, 180),
    teamName: boundedText(team.name, 180),
    verifiedAtUnixMs: Number(now),
  };
}

async function verifyIdentity(accessToken, dependencies = {}) {
  const authenticate = dependencies.getCurrentActor || getCurrentActor;
  const resolveScope = dependencies.resolvePlatformActorScope || resolvePlatformActorScope;
  const actor = await authenticate(`Bearer ${accessToken}`);
  if (!actor?.id) return { ok: false, status: 401, reason: "Authentication could not be verified." };
  const scope = await resolveScope(actor);
  if (!scope?.ok) return { ok: false, status: scope?.status || 403, reason: "Desktop account scope is unavailable." };
  const identity = buildVerifiedIdentity(scope, (dependencies.now || Date.now)());
  return identity
    ? { ok: true, identity }
    : { ok: false, status: 403, reason: "An active organization and team membership is required for offline access." };
}

async function verifiedSession(tokenResult, dependencies = {}) {
  if (!tokenResult.ok) return tokenResult;
  const verified = await verifyIdentity(tokenResult.payload.access_token, dependencies);
  if (!verified.ok) {
    await signOut(`Bearer ${tokenResult.payload.access_token}`, dependencies).catch(() => {});
    return verified;
  }
  const expiresAtUnixMs = Number(tokenResult.payload.expires_at)
    ? Number(tokenResult.payload.expires_at) * 1000
    : Date.now() + Number(tokenResult.payload.expires_in) * 1000;
  return {
    ok: true,
    status: 200,
    payload: {
      ok: true,
      schema: RESPONSE_SCHEMA,
      session: {
        accessToken: tokenResult.payload.access_token,
        refreshToken: tokenResult.payload.refresh_token,
        expiresAtUnixMs,
        identity: verified.identity,
      },
    },
  };
}

async function signIn(body, dependencies = {}) {
  const identifier = boundedText(body.identifier, MAX_IDENTIFIER_LENGTH).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!identifier || !password || password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, status: 400, reason: "Username and password are required." };
  }
  const email = await resolveEmail(identifier, dependencies);
  if (!email) return { ok: false, status: 401, reason: "Invalid login credentials." };
  return verifiedSession(await exchangeToken("password", { email, password }, dependencies), dependencies);
}

async function refresh(body, dependencies = {}) {
  const refreshToken = boundedText(body.refreshToken, MAX_REFRESH_TOKEN_LENGTH);
  if (refreshToken.length < 16) return { ok: false, status: 401, reason: "Desktop session refresh is unavailable." };
  return verifiedSession(await exchangeToken("refresh_token", { refresh_token: refreshToken }, dependencies), dependencies);
}

async function resetPassword(body, dependencies = {}) {
  const identifier = boundedText(body.identifier, MAX_IDENTIFIER_LENGTH).toLowerCase();
  if (!identifier) return { ok: false, status: 400, reason: "Username or email is required." };
  try {
    const email = await resolveEmail(identifier, dependencies);
    if (email) {
      const send = dependencies.sendPasswordReset || sendPasswordReset;
      await send(email, "https://footballscience.xyz/");
    }
  } catch {
    // Do not disclose whether an account exists or whether its mail provider accepted the request.
  }
  return { ok: true, status: 200, payload: { ok: true, schema: RESPONSE_SCHEMA } };
}

async function signOut(authorization, dependencies = {}) {
  const accessToken = bearer(authorization);
  if (!accessToken) return { ok: true, status: 200, payload: { ok: true, schema: RESPONSE_SCHEMA } };
  const config = (dependencies.readConfig || readConfig)();
  if (!config.url || !config.anonKey) return { ok: false, status: 503, reason: "Authentication is not configured." };
  try {
    const response = await (dependencies.fetchImpl || fetch)(`${config.url}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { ...buildSupabaseKeyHeaders(config.anonKey), Authorization: `Bearer ${accessToken}` },
      signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(AUTH_TIMEOUT_MS) : undefined,
    });
    if (!response.ok && response.status !== 401) return { ok: false, status: 503, reason: "Remote sign-out could not be confirmed." };
    return { ok: true, status: 200, payload: { ok: true, schema: RESPONSE_SCHEMA } };
  } catch {
    return { ok: false, status: 503, reason: "Remote sign-out could not be confirmed." };
  }
}

async function executeDesktopAuth(body = {}, authorization = "", dependencies = {}) {
  const action = boundedText(body.action, 40);
  if (action === "sign-in") return signIn(body, dependencies);
  if (action === "refresh") return refresh(body, dependencies);
  if (action === "reset-password") return resetPassword(body, dependencies);
  if (action === "sign-out") return signOut(authorization, dependencies);
  return { ok: false, status: 400, reason: "Unsupported desktop authentication action." };
}

module.exports = {
  IDENTITY_SCHEMA,
  RESPONSE_SCHEMA,
  buildVerifiedIdentity,
  executeDesktopAuth,
};
