import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { expect, test } from "@playwright/test";
import { matchesSessionsOfflineLogin, maxSessionsOfflineLifetimeMs, verifySessionsOfflineGrant } from "../src/core/sessions-offline-access/grant.mjs";
import { prepareSessionsOfflineAccess, sessionsOfflinePreparationKey } from "../src/core/sessions-offline-access/access.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const keys = { synthetic: publicKey.export({ type: "spki", format: "der" }).toString("base64") };
const origin = "http://127.0.0.1:4173";
const date = "2026-11-25", now = Date.parse(`${date}T12:00:00Z`);
const owner = JSON.stringify(["coach", "organization", "club", "team", "coach"]);
const token = "synthetic-login-access";
const permission = {
  schema: "sessions-offline-access-v1", action: "read-local-session-date", id: randomUUID(), origin, date, owner,
  scope: JSON.stringify(["sessions-actor-team-v1", "coach", "club", "team"]),
  issuedAt: now - 1000, expiresAt: now + 600_000, tokenHash: createHash("sha256").update(token).digest("hex"),
};

function issue(overrides = {}) {
  const content = JSON.stringify({ ...permission, ...overrides });
  const signature = sign("sha256", Buffer.from(content), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64");
  return { kid: "synthetic", content, signature };
}

function storage(entries) {
  const values = new Map(Object.entries(entries));
  return {
    get length() { return values.size; },
    key: (index) => Array.from(values.keys())[index],
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("prepared Sessions grants bind trusted signer, exact origin, account, team and date", async () => {
  const grant = issue();
  await expect(verifySessionsOfflineGrant(grant, keys, { origin, now })).resolves.toEqual(permission);
  await expect(verifySessionsOfflineGrant(grant, {}, { origin, now })).rejects.toThrow("untrusted");
  await expect(verifySessionsOfflineGrant({ ...grant, content: grant.content.replace(date, "2026-11-26") }, keys, { origin, now }))
    .rejects.toThrow("invalid");
  for (const mutation of [
    { origin: "http://localhost:4173" },
    { scope: JSON.stringify(["sessions-actor-team-v1", "coach", "club", "other-team"]) },
    { date: "2026-02-30" }, { expiresAt: now }, { expiresAt: now + maxSessionsOfflineLifetimeMs },
    { issuedAt: now + 6000 }, { action: "edit-sessions" },
  ]) {
    await expect(verifySessionsOfflineGrant(issue(mutation), keys, { origin, now })).rejects.toThrow("scope");
  }
});

test("offline Sessions accepts one exact persisted login and rejects logout, rotation or ambiguous cache", async () => {
  const login = (user, access_token) => JSON.stringify({ user: { id: user }, access_token });
  const data = storage({ "sb-synthetic-auth-token": login("coach", token) });
  await expect(matchesSessionsOfflineLogin(permission, data)).resolves.toBe(true);
  data.setItem("sb-obsolete-auth-token", "malformed cached login");
  await expect(matchesSessionsOfflineLogin(permission, data)).resolves.toBe(false);
  data.removeItem("sb-obsolete-auth-token");
  data.setItem("sb-synthetic-auth-token", login("coach", "rotated-token"));
  await expect(matchesSessionsOfflineLogin(permission, data)).resolves.toBe(false);
  data.setItem("sb-synthetic-auth-token", login("other", token));
  await expect(matchesSessionsOfflineLogin(permission, data)).resolves.toBe(false);
  data.removeItem("sb-synthetic-auth-token");
  await expect(matchesSessionsOfflineLogin(permission, data)).resolves.toBe(false);
});

test("denied durable preparation prevents any request and disarms access without touching work", async () => {
  const saved = "synthetic work retained";
  const data = storage({ [sessionsOfflinePreparationKey]: JSON.stringify({ owner, ready: true }),
    "football-session-planner-v3": saved });
  let requests = 0;
  await expect(prepareSessionsOfflineAccess({
    owner, date, origin, keys, storage: data, isCurrent: () => true,
    indexedDB: { open: () => { throw new DOMException("Metadata storage denied", "QuotaExceededError"); } },
    requestGrant: () => { requests++; },
  })).rejects.toThrow("Metadata storage denied");
  expect(requests).toBe(0);
  expect(data.getItem(sessionsOfflinePreparationKey)).toBeNull();
  expect(data.getItem("football-session-planner-v3")).toBe(saved);
});
