const crypto = require("node:crypto");
const { resolvePlatformActorScope } = require("./platform-identity.js");
const { readConfig, buildSupabaseKeyHeaders } = require("./supabase-admin.js");

const maxLifetime = 60 * 60 * 1000;
const verifiedRoles = new Set(["admin", "club-admin", "team-admin", "coach"]);
const denied = (status, reason) => ({ ok: false, status, reason });

function configuredKeys() {
  try {
    return JSON.parse(process.env.FS_SESSIONS_OFFLINE_PUBLIC_KEYS || "{}") || {};
  } catch {
    return {};
  }
}

async function readSessionsOfflineActor(authorization) {
  if (!/^Bearer\s+\S+$/i.test(String(authorization || ""))) return null;
  const { url, anonKey } = readConfig();
  if (!url || !anonKey) return null;
  const response = await fetch(url + "/auth/v1/user", {
    headers: { ...buildSupabaseKeyHeaders(anonKey), Authorization: authorization },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error("Session verification unavailable.");
  const payload = await response.json();
  const user = payload?.user || payload;
  return typeof user?.id === "string" && user.id ? { id: user.id } : null;
}

async function issueSessionsOfflineGrant({ authorization, owner, date }, {
  keys = configuredKeys(), privateKey = process.env.FS_SESSIONS_OFFLINE_PRIVATE_KEY,
  origin = process.env.FS_SESSIONS_OFFLINE_ORIGIN || "https://footballscience.xyz", now = Date.now(),
  resolveIdentity = resolvePlatformActorScope, readActor = readSessionsOfflineActor, canRead = () => false,
} = {}) {
  if (!privateKey || !Object.keys(keys).length) return denied(503, "Offline preparation is unavailable.");
  const actor = await readActor(authorization);
  if (!actor?.id) return denied(401, "Sign in online to prepare Sessions.");
  const ownerParts = typeof owner === "string" && owner.length <= 1300 ? parseOwner(owner) : null;
  if (!ownerParts || ownerParts[0] !== actor.id) return denied(403, "This account or team cannot prepare the session.");
  if (!validDate(date)) return denied(400, "Choose a valid session date.");
  const [actorId, organizationId, clubId, teamId, role] = ownerParts;
  const identity = await resolveIdentity(actor);
  if (!identity.ok) return denied(identity.status >= 500 ? 503 : 403, "Current team access could not be verified.");
  if (identity.actor?.id !== actorId || identity.actor?.status !== "active" ||
      identity.actor?.profile?.status !== "active") return denied(403, "An active account is required.");
  const member = identity.scope?.memberships?.find(m => m.status === "active" && m.acceptedAt &&
    m.organizationId === organizationId && m.clubId === clubId && m.teamId === teamId && m.role === role &&
    [m.organization, m.club, m.team].every(entity => entity?.status === "active"));
  if (!verifiedRoles.has(role) || !member ||
      !await canRead({ ...actor, role, clubId, teamId, organizationId, status: "active" })) {
    return denied(403, "Current Sessions access is required for this team.");
  }

  const token = /^Bearer\s+(\S+)$/i.exec(authorization || "")?.[1] || "";
  const expiresAt = Math.min(readTokenExpiry(token), now + maxLifetime);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now + 60000) {
    return denied(401, "Renew your online session before preparing Sessions.");
  }
  const key = crypto.createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    return denied(503, "Offline preparation is unavailable.");
  }
  const spki = crypto.createPublicKey(key).export({ type: "spki", format: "der" }).toString("base64");
  const kid = Object.keys(keys).find(id => keys[id] === spki);
  if (!kid || new URL(origin).origin !== origin) return denied(503, "Offline preparation is unavailable.");
  const content = JSON.stringify({
    schema: "sessions-offline-access-v1", id: crypto.randomUUID(), origin, owner,
    scope: JSON.stringify(["sessions-actor-team-v1", actorId, clubId, teamId]),
    action: "read-local-session-date", date, issuedAt: now, expiresAt,
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
  });
  const signature = crypto.sign("sha256", Buffer.from(content), { key, dsaEncoding: "ieee-p1363" }).toString("base64");
  return { ok: true, grant: { kid, content, signature } };
}

function parseOwner(value) {
  try {
    const parts = JSON.parse(value);
    return Array.isArray(parts) && parts.length === 5 &&
      parts.every(part => typeof part === "string" && part.trim() === part && part && part.length <= 240) &&
      JSON.stringify(parts) === value ? parts : null;
  } catch {
    return null;
  }
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function readTokenExpiry(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url")).exp * 1000;
  } catch {
    return NaN;
  }
}

module.exports = { issueSessionsOfflineGrant, readSessionsOfflineActor };
