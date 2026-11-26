export const sessionsOfflineGrantSchema = "sessions-offline-access-v1";
export const maxSessionsOfflineLifetimeMs = 60 * 60 * 1000;

const encode = (value) => new TextEncoder().encode(value);
const decodeBase64 = (value) => Uint8Array.from(atob(value), (byte) => byte.charCodeAt(0));
const digest = async (token) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encode(token))),
  (byte) => byte.toString(16).padStart(2, "0")).join("");

export function parseSessionsOfflineOwner(value) {
  if (typeof value !== "string" || value.length > 2500) throw new Error("Invalid offline Sessions account or team.");
  const owner = JSON.parse(value);
  if (!Array.isArray(owner) || owner.length !== 5 ||
      owner.some((part) => typeof part !== "string" || !part || part.length > 240) ||
      JSON.stringify(owner) !== value) throw new Error("Invalid offline Sessions account or team.");
  return owner;
}

export function isSessionsOfflineDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const midday = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(midday.valueOf()) && midday.toISOString().slice(0, 10) === date;
}

export async function verifySessionsOfflineGrant(grant, keys, { origin, now = Date.now() }) {
  if (typeof grant?.kid !== "string" || !Object.hasOwn(keys, grant.kid) ||
      typeof grant.content !== "string" || grant.content.length > 8192 ||
      typeof grant.signature !== "string" || grant.signature.length !== 88) {
    throw new Error("Offline Sessions permission is untrusted.");
  }
  const key = await crypto.subtle.importKey("spki", decodeBase64(keys[grant.kid]),
    { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  if (!await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, decodeBase64(grant.signature), encode(grant.content))) {
    throw new Error("Offline Sessions permission is invalid.");
  }
  const permission = JSON.parse(grant.content);
  const [account, , club, team] = parseSessionsOfflineOwner(permission.owner);
  if (permission.schema !== sessionsOfflineGrantSchema || permission.action !== "read-local-session-date" ||
      permission.origin !== origin || permission.scope !== JSON.stringify(["sessions-actor-team-v1", account, club, team]) ||
      !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(permission.id || "") || !isSessionsOfflineDate(permission.date) ||
      !Number.isSafeInteger(now) || !Number.isSafeInteger(permission.issuedAt) || !Number.isSafeInteger(permission.expiresAt) ||
      permission.expiresAt <= permission.issuedAt || permission.expiresAt - permission.issuedAt > maxSessionsOfflineLifetimeMs ||
      now + 5000 < permission.issuedAt || now >= permission.expiresAt || !/^[\da-f]{64}$/.test(permission.tokenHash || "")) {
    throw new Error("Offline Sessions permission expired or its scope is invalid. Connect to prepare it again.");
  }
  return permission;
}

export async function matchesSessionsOfflineLogin(permission, storage) {
  const account = parseSessionsOfflineOwner(permission.owner)[0];
  const authKeys = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (/^sb-.+-auth-token$/.test(key || "")) authKeys.push(key);
  }
  if (authKeys.length !== 1) return false;
  try {
    const serialized = storage.getItem(authKeys[0]);
    const record = JSON.parse(serialized);
    const session = record?.currentSession || record;
    return session?.user?.id === account && typeof session.access_token === "string" &&
      await digest(session.access_token) === permission.tokenHash && storage.getItem(authKeys[0]) === serialized;
  } catch {
    return false;
  }
}
