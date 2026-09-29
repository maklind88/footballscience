import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../platform-auth-boot.js", import.meta.url), "utf8");
const hydrateSource = source.slice(source.indexOf("  async function hydrateCentralState("), source.indexOf("  async function syncCentralStateKey("));
const syncStart = source.indexOf("  async function syncCentralStateKey(");
const syncEnd = source.indexOf("\n  function ", syncStart);
const syncAsyncEnd = source.indexOf("\n  async function ", syncStart + 10);
const syncSource = source.slice(syncStart, Math.min(...[syncEnd, syncAsyncEnd].filter((value) => value > syncStart)));
const readScopeSource = source.slice(source.indexOf("  function getCentralReadScope("), source.indexOf("  function getCentralCachedValueInfo("));
const projectionSource = source.slice(source.indexOf("  function medicalRecoveryGeneration("), source.indexOf("  function setCentralCacheFallbackState("));
const normalizeUserSource = source.slice(source.indexOf("  function normalizeAuthUser("), source.indexOf("  function toFormError("));
const apiRequestSource = source.slice(source.indexOf("  async function apiRequest("), source.indexOf("  function isCentralStateKey("));
const profileRefreshSource = source.slice(source.indexOf("  async function refreshUserCache("), source.indexOf("  function queuePostAuthHydration("));

function createProfileRefreshHarness() {
  const requests = [], notifications = [];
  const user = { id: "actor-a", organizationId: "org-a", teamId: "team-a", role: "coach" };
  const authState = { currentUser: user, users: [user], roles: ["coach"], session: { access_token: "token-a", user } };
  const context = {
    authState, Headers, API_ADMIN_USERS: "/api/admin-users",
    currentUserProfileRefresh: null, userCacheRefresh: null,
    getCentralReadScope: () => authState.currentUser ? JSON.stringify(authState.currentUser) : "",
    getActiveAccessToken: async () => authState.session?.access_token,
    isAuthTokenOversized: () => false, normalizeAuthUser: (value) => ({ ...value }),
    window: { setTimeout: () => 1, clearTimeout: () => {} },
    fetch: (path, options) => new Promise((resolve) => requests.push({ path, options, resolve })),
    readJsonResponse: async (response) => response.payload,
    notifyAuthChange: (user) => notifications.push(user),
    setCurrentUserFromSession: (user) => { authState.currentUser = user; notifications.push(user); },
    signOut: async () => { authState.currentUser = null; authState.session = null; notifications.push(null); },
  };
  const api = runInNewContext(`${apiRequestSource}\n${profileRefreshSource}\n({refreshUserCache, refreshCurrentUserProfile})`, context);
  return { authState, requests, notifications, api };
}

for (const kind of ["profile", "users"]) {
for (const transition of ["actor", "team", "token", "signout", "reauth"]) {
for (const status of [200, 401]) {
test(`late ${kind} response ${status} cannot replace auth state after ${transition}`, async () => {
  const h = createProfileRefreshHarness(), old = structuredClone(h.authState.currentUser);
  const pending = kind === "profile" ? h.api.refreshCurrentUserProfile(old.id) : h.api.refreshUserCache();
  await expect.poll(() => h.requests.length).toBe(1);
  const next = { ...old, ...(transition === "actor" ? { id: "actor-b", organizationId: "org-b" } : {}),
    ...(transition === "team" ? { teamId: "team-b" } : {}) };
  h.authState.currentUser = transition === "signout" ? null : next;
  h.authState.users = transition === "signout" ? [] : [next];
  if (transition === "signout") h.authState.session = null;
  if (transition === "actor") h.authState.session = { access_token: "token-b", user: next };
  if (transition === "token") h.authState.session.access_token = "token-b";
  if (transition === "reauth") h.authState.session = { access_token: "token-a", user: next };
  const expected = structuredClone(h.authState);
  h.requests[0].resolve({ ok: status === 200, status, payload: { ok: true, user: old, users: [old], roles: ["old-role"] } });
  await pending;
  expect(h.authState).toEqual(expected);
  expect(h.notifications).toEqual([]);
});
}
}
}

for (const kind of ["profile", "users"]) {
test(`${kind} refresh coalesces only the current session and keeps its promise owner`, async () => {
  const h = createProfileRefreshHarness();
  const refresh = () => kind === "profile" ? h.api.refreshCurrentUserProfile(h.authState.currentUser.id) : h.api.refreshUserCache();
  const first = refresh();
  await expect.poll(() => h.requests.length).toBe(1);
  h.authState.session = { ...h.authState.session, access_token: "token-b" };
  const second = refresh();
  await expect.poll(() => h.requests.length).toBe(2);
  h.requests[0].resolve({ ok: true, status: 200, payload: { user: { ...h.authState.currentUser, role: "stale-role" }, users: [] } });
  await first;
  const third = refresh();
  await Promise.resolve(); await Promise.resolve();
  expect(h.requests).toHaveLength(2);
  const user = { ...h.authState.currentUser, role: "medical" };
  h.requests[1].resolve({ ok: true, status: 200, payload: { user, users: [user], roles: ["medical"] } });
  await Promise.all([second, third]);
  expect(h.authState.currentUser.role).toBe("medical");
  expect(h.notifications).toHaveLength(1);
});
}

for (const mismatch of ["none", "owner", "revision", "absent-only", "newer-edit", "quota"]) {
test(`read acknowledgement of a tombstone requires an owned advanced revision (${mismatch})`, () => {
  const key = "football-schedule-v1", manifestKey = "football-data-safety-v1";
  const entry = { pendingCentralSync: true, principalScope: mismatch === "owner" ? "actor-B" : "actor-A",
    hash: "empty", writes: 7, updatedAt: "deleted", deletedAt: "deleted", pendingBaseRevision: 4, serverRevision: 4 };
  if (mismatch === "newer-edit") { entry.deletedAt = ""; entry.writes += 1; }
  const storage = new Map([[manifestKey, JSON.stringify({ entries: { [key]: entry } })]]);
  if (mismatch === "newer-edit") storage.set(key, "newer edit");
  const before = storage.get(manifestKey), centralState = { metadata: { [key]: { revision: 4 } } };
  const read = (key) => storage.get(key) ?? null;
  const context = { DATA_SAFETY_MANIFEST_KEY: manifestKey, getCentralReadScope: () => "actor-A", centralState,
    isCentralStateKey: (candidate) => candidate === key, readCentralSyncManifestEntries: () => JSON.parse(read(manifestKey)).entries,
    nativeLocalStorageGetItem: read, window: { localStorage: { getItem: read, setItem: (key, value) => {
      if (mismatch === "quota") throw new Error("Quota exceeded");
      storage.set(key, value);
    } } },
  };
  const generation = source.slice(source.indexOf("  function medicalRecoveryGeneration("), source.indexOf("  function hasMedicalRecoverySeparation("));
  const clear = source.slice(source.indexOf("  function clearCentralPendingSyncFlag("), source.indexOf("  function persistCentralHydrationRevisions("));
  const receipt = mismatch === "absent-only" ? {} : { removed: true, revision: mismatch === "revision" ? 4 : 5 };
  runInNewContext(`${generation}\n${clear}\nreconcileCentralTombstones`, context)([key], { [key]: receipt });
  if (mismatch === "none") {
    expect(JSON.parse(read(manifestKey)).entries[key]).toMatchObject({ pendingCentralSync: false, serverRevision: 5 });
    expect(centralState.metadata[key]).toEqual(receipt);
  } else {
    expect(read(manifestKey)).toBe(before);
    expect(centralState.metadata[key].revision).toBe(4);
  }
});
}

for (const mismatch of ["none", "generation", "owner", "base", "raw", "quota"]) {
test(`Medical read acknowledgement rechecks the exact pending generation (${mismatch})`, () => {
  const key = "football-medical-team-v1", manifestKey = "football-data-safety-v1";
  const expected = { pendingCentralSync: true, hash: "draft", writes: 7, updatedAt: "original-time", deletedAt: "",
    principalScope: "actor-a", pendingBaseRevision: 1, serverRevision: 1 };
  const current = { ...expected };
  if (mismatch === "generation") current.writes += 1;
  if (mismatch === "owner") current.principalScope = "actor-b";
  if (mismatch === "base") current.pendingBaseRevision += 1;
  const raw = mismatch === "raw" ? "newer edit" : "draft";
  const storage = new Map([[key, raw], [manifestKey, JSON.stringify({ entries: { [key]: current } })]]);
  const before = storage.get(manifestKey);
  const context = { DATA_SAFETY_MANIFEST_KEY: manifestKey, getCentralReadScope: () => "actor-a",
    nativeLocalStorageGetItem: (key) => storage.get(key),
    window: { localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => {
      if (mismatch === "quota") throw new Error("Storage unavailable");
      storage.set(key, value);
    } } },
  };
  const generation = source.slice(source.indexOf("  function medicalRecoveryGeneration("), source.indexOf("  function hasMedicalRecoverySeparation("));
  const clear = source.slice(source.indexOf("  function clearCentralPendingSyncFlag("), source.indexOf("  function persistCentralHydrationRevisions("));
  runInNewContext(`${generation}\n${clear}\nclearCentralPendingSyncFlag`, context)(key, { revision: 2 }, { entry: expected, value: "draft" });
  if (mismatch === "none") expect(JSON.parse(storage.get(manifestKey)).entries[key]).toMatchObject({ pendingCentralSync: false, serverRevision: 2 });
  else expect(storage.get(manifestKey)).toBe(before);
  expect(storage.get(key)).toBe(raw);
});
}

for (const phase of ["token", "fetch", "body"]) {
  for (const status of [200, 401]) {
    test(`scoped API response ${status} cannot escape or sign out the new actor after ${phase}`, async () => {
      let current = true, release, enter, sent = 0, signedOut = 0;
      const barrier = new Promise((resolve) => { release = resolve; });
      const entered = new Promise((resolve) => { enter = resolve; });
      const context = {
        Headers, authState: { currentUser: { id: "new-actor" } },
        window: { setTimeout: () => 1, clearTimeout: () => {} },
        getActiveAccessToken: async () => { if (phase === "token") { enter(); await barrier; } return "test-token"; },
        isAuthTokenOversized: () => false,
        fetch: async () => { sent += 1; if (phase === "fetch") { enter(); await barrier; } return { ok: status === 200, status }; },
        readJsonResponse: async () => { if (phase === "body") { enter(); await barrier; } return { value: "old-actor-data" }; },
        signOut: async () => { signedOut += 1; },
      };
      const request = runInNewContext(`${apiRequestSource}\napiRequest`, context)("/api/app-state", { isCurrent: () => current });
      await entered;
      current = false; release();
      const response = await request;
      expect(response.ok).toBe(false);
      expect(response.payload.value).toBeUndefined();
      expect(signedOut).toBe(0);
      expect(sent).toBe(phase === "token" ? 0 : 1);
    });
  }
}

function createProjectionHarness(storage = new Map(), canWrite = false) {
  const context = {
    MEDICAL_TEAM_STATE_KEY: "football-medical-team-v1", DATA_SAFETY_MANIFEST_KEY: "football-data-safety-v1",
    MEDICAL_RECOVERY_MARKER_KEY: "football-data-safety-v1:medical-recovery",
    volatileMedicalRecoveryMarker: "",
    centralStateValues: new Map(), centralStateValueMetadata: new Map(), centralState: { hydrating: false, metadata: {} },
    authState: { currentUser: { id: "actor", role: "coach", organizationId: "org-a" }, session: { access_token: "token" } },
    window: { localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } },
    readCentralSyncManifestEntries: () => JSON.parse(storage.get("football-data-safety-v1") || "{}").entries || {},
    canCurrentUserAutomaticallyWriteCentralStateKey: () => canWrite, isCentralStateKey: () => true,
    DEFAULT_ROLES: ["coach", "medical"], DEFAULT_CLUB_ID: "club", DEFAULT_TEAM_ID: "team",
    normalizeRoleForAuth: (role) => role || "coach", normalizeProfileImageValue: () => "",
  };
  const api = runInNewContext(`${projectionSource}\n${normalizeUserSource}\n({getCentralCachedValue, getCentralCachedValueInfo, setCentralCachedValue, getCentralReadScope, clearMissingCentralReadViews, preserveMedicalRecoverySeparation, normalizeAuthUser})`, context);
  return { context, api };
}

test("local development has its own scope without admitting an unsigned production session", () => {
  const h = createProjectionHarness();
  const productionScope = h.api.getCentralReadScope();
  h.context.authState.session = null;
  expect(h.api.getCentralReadScope()).toBe("");
  h.context.authState.devMode = true;
  expect(h.api.getCentralReadScope()).not.toBe("");
  expect(h.api.getCentralReadScope()).not.toBe(productionScope);
  const localScope = h.api.getCentralReadScope();
  h.context.authState.currentUser.teamId = "new-local-team";
  h.context.authState.currentUser.role = "admin";
  expect(h.api.getCentralReadScope()).toBe(localScope);
  h.context.authState.currentUser.organizationId = "other-organization";
  expect(h.api.getCentralReadScope()).not.toBe(localScope);
  h.context.authState.currentUser = null;
  expect(h.api.getCentralReadScope()).toBe("");
});

for (const key of ["football-schedule-v1", "football-periodization-v2", "football-player-profiles-v1"]) {
test(`returning pending owner releases the foreign ${key} read view only after an authorized read`, () => {
  const h = createProjectionHarness(), owner = h.api.getCentralReadScope();
  const manifest = JSON.stringify({ entries: { [key]: { pendingCentralSync: true, principalScope: owner, writes: 7, serverRevision: 1 } } });
  const storage = new Map([[key, "private A"], ["football-data-safety-v1", manifest]]);
  const b = createProjectionHarness(storage);
  b.context.authState.currentUser.organizationId = "org-b";
  b.api.setCentralCachedValue(key, "central B", { source: "central-readonly-baseline", readScope: b.api.getCentralReadScope() });
  b.context.centralState.metadata[key] = { revision: 10 };
  b.api.clearMissingCentralReadViews({ [key]: "central B" });
  expect(b.api.getCentralCachedValue(key)).toBe("central B");
  b.context.authState.currentUser.organizationId = "org-a";
  expect(b.api.getCentralCachedValue(key)).toBe("{}");
  b.api.clearMissingCentralReadViews({});
  expect(b.api.getCentralCachedValueInfo(key).source).toBe("central-readonly-baseline");
  b.api.clearMissingCentralReadViews({ [key]: "central A" });
  expect(b.api.getCentralCachedValue(key)).toBeUndefined();
  expect(b.api.getCentralCachedValueInfo(key).source).toBe("");
  expect(b.context.centralState.metadata[key]).toBeUndefined();
  expect(storage.get(key)).toBe("private A");
  expect(storage.get("football-data-safety-v1")).toBe(manifest);
});
}

for (const incomplete of [false, true]) {
test(`returning Medical owner releases only a durably completed pending replacement (incomplete: ${incomplete})`, () => {
  const key = "football-medical-team-v1", manifestKey = "football-data-safety-v1";
  const storage = new Map(), h = createProjectionHarness(storage, true), owner = h.api.getCentralReadScope();
  const entry = { pendingCentralSync: true, principalScope: owner, hash: "draft", writes: 7, updatedAt: "now", serverRevision: 1 };
  storage.set(key, "private A");
  storage.set(manifestKey, JSON.stringify({ entries: { [key]: entry } }));
  storage.set(`${manifestKey}:medical-recovery`, JSON.stringify({ readScope: owner,
    generation: JSON.stringify(["draft", 7, "now", ""]), ...(incomplete ? { incompleteReplacement: true } : {}) }));
  h.context.authState.currentUser.organizationId = "org-b";
  h.api.setCentralCachedValue(key, "central B", { source: "central-readonly-baseline", readScope: h.api.getCentralReadScope() });
  h.context.authState.currentUser.organizationId = "org-a";
  h.api.clearMissingCentralReadViews({ [key]: "central A" });
  expect(h.api.getCentralCachedValueInfo(key).source).toBe(incomplete ? "central-readonly-baseline" : "");
  expect(storage.get(key)).toBe("private A");
  expect(JSON.parse(storage.get(manifestKey)).entries[key]).toEqual(entry);
});
}

for (const scoped of [false, true]) {
test(`returning Medical owner with an older generation marker requires proven ownership (scoped: ${scoped})`, () => {
  const key = "football-medical-team-v1", manifestKey = "football-data-safety-v1";
  const storage = new Map(), h = createProjectionHarness(storage, true);
  const entry = { pendingCentralSync: true, hash: "draft", writes: 7, updatedAt: "now", serverRevision: 1,
    ...(scoped ? { principalScope: h.api.getCentralReadScope() } : {}) };
  const manifest = JSON.stringify({ entries: { [key]: entry } });
  storage.set(key, "owned draft");
  storage.set(manifestKey, manifest);
  storage.set(`${manifestKey}:medical-recovery`, JSON.stringify(["draft", 7, "now", ""]));
  h.context.authState.currentUser.organizationId = "org-b";
  h.api.setCentralCachedValue(key, "central B", { source: "central-readonly-baseline", readScope: h.api.getCentralReadScope() });
  h.context.authState.currentUser.organizationId = "org-a";
  h.api.clearMissingCentralReadViews({ [key]: "central A" });
  expect(h.api.getCentralCachedValueInfo(key).source).toBe(scoped ? "" : "central-readonly-baseline");
  expect(storage.get(key)).toBe("owned draft");
  expect(storage.get(manifestKey)).toBe(manifest);
});
}

test("an explicitly authorized absent key releases its returning owner but an omitted key does not", () => {
  const key = "football-schedule-v1", storage = new Map(), h = createProjectionHarness(storage);
  const owner = h.api.getCentralReadScope();
  storage.set(key, "first creation");
  storage.set("football-data-safety-v1", JSON.stringify({ entries: { [key]: { principalScope: owner, pendingCentralSync: true, serverRevision: 0 } } }));
  h.context.authState.currentUser.organizationId = "org-b";
  h.api.setCentralCachedValue(key, "B view", { source: "central-readonly-baseline", readScope: h.api.getCentralReadScope() });
  h.context.authState.currentUser.organizationId = "org-a";
  h.api.clearMissingCentralReadViews({});
  expect(h.api.getCentralCachedValueInfo(key).source).toBe("central-readonly-baseline");
  h.api.clearMissingCentralReadViews({}, [key]);
  expect(h.api.getCentralCachedValueInfo(key).source).toBe("");
  expect(storage.get(key)).toBe("first creation");
});

test("Medical recovery separation survives a new runtime without changing the original pending generation", () => {
  const key = "football-medical-team-v1", manifestKey = "football-data-safety-v1";
  const entry = { pendingCentralSync: true, hash: "draft", writes: 7, updatedAt: "original-time", serverRevision: 1 };
  const manifest = JSON.stringify({ entries: { [key]: entry } });
  const storage = new Map([[key, "old private draft"], [manifestKey, manifest]]);
  createProjectionHarness(storage).api.preserveMedicalRecoverySeparation(entry);
  const next = createProjectionHarness(storage, true);
  next.context.authState.currentUser = { id: "new-actor", role: "medical", organizationId: "org-b" };
  expect(next.api.getCentralCachedValue(key)).toBe("{}");
  expect(next.api.getCentralCachedValueInfo(key)).toMatchObject({ source: "central-readonly-baseline", canEdit: false });
  next.context.centralState.metadata[key] = { revision: 4 };
  next.api.clearMissingCentralReadViews({});
  expect(next.api.getCentralCachedValueInfo(key)).toMatchObject({ value: "{}", canEdit: true });
  expect(next.context.centralState.metadata[key]).toEqual({ revision: 0 });
  expect(storage.get(key)).toBe("old private draft");
  expect(storage.get(manifestKey)).toBe(manifest);
  storage.set(manifestKey, JSON.stringify({ entries: { [key]: { ...entry, writes: 8, hash: "new-authorized-edit" } } }));
  expect(createProjectionHarness(storage, true).api.getCentralCachedValueInfo(key).source).toBe("");
});

test("recovery marker storage failure is explicit and does not mutate the pending draft", () => {
  const entry = { pendingCentralSync: true, hash: "draft", writes: 7 };
  const storage = new Map([["football-medical-team-v1", "draft"], ["football-data-safety-v1", JSON.stringify({ entries: { "football-medical-team-v1": entry } })]]);
  const h = createProjectionHarness(storage);
  h.context.window.localStorage.setItem = () => { throw new Error("quota"); };
  expect(() => h.api.preserveMedicalRecoverySeparation(entry)).toThrow("quota");
  expect(storage.get("football-medical-team-v1")).toBe("draft");
  expect(storage.size).toBe(2);
});

test("canonical organization is retained and a refreshed organization immediately hides the previous view", () => {
  const h = createProjectionHarness();
  const normalized = h.api.normalizeAuthUser({ id: "actor", app_metadata: { organization_id: "org-a" }, user_metadata: { organizationId: "spoofed" } });
  expect(normalized.organizationId).toBe("org-a");
  expect(h.api.normalizeAuthUser({ id: "actor", organization_id: "server-org" }).organizationId).toBe("server-org");
  expect(h.api.normalizeAuthUser({ id: "actor", user_metadata: { organizationId: "spoofed" } }).organizationId).toBe("");
  h.context.authState.currentUser = normalized;
  h.api.setCentralCachedValue("football-medical-team-v1", "org-a record", { source: "central-readonly-baseline", readScope: h.api.getCentralReadScope() });
  h.context.authState.session.user = { app_metadata: { organization_id: "org-b" } };
  expect(h.api.getCentralCachedValue("football-medical-team-v1")).toBe("{}");
  expect(h.api.getCentralCachedValueInfo("football-medical-team-v1").canEdit).toBe(false);
});

for (const pending of [false, true]) {
test(`replacement Medical drafts keep their owner after reload and cannot be read or retried by a different scope (pending: ${pending})`, () => {
  const key = "football-medical-team-v1";
  const h = createProjectionHarness();
  const owner = h.api.getCentralReadScope();
  const storage = new Map([
    [key, "pending replacement from org-a"],
    ["football-data-safety-v1", JSON.stringify({ entries: { [key]: { pendingCentralSync: pending, hash: "replacement", writes: 8 } } })],
    ["football-data-safety-v1:medical-recovery", JSON.stringify({ readScope: owner, generation: '["old",7,"",""]' })],
  ]);
  expect(createProjectionHarness(storage, true).api.getCentralCachedValueInfo(key).source).toBe("");
  const next = createProjectionHarness(storage, true);
  next.api.setCentralCachedValue(key, "pending replacement from org-a");
  next.context.authState.currentUser.organizationId = "org-b";
  expect(next.api.getCentralCachedValue(key)).toBe("{}");
  expect(next.api.getCentralCachedValueInfo(key)).toMatchObject({ source: "central-readonly-baseline", canEdit: false });
  const reloaded = createProjectionHarness(storage, true);
  reloaded.context.authState.currentUser.organizationId = "org-b";
  expect(reloaded.api.getCentralCachedValueInfo(key)).toMatchObject({ source: "central-readonly-baseline", canEdit: false });
  reloaded.api.preserveMedicalRecoverySeparation(JSON.parse(storage.get("football-data-safety-v1")).entries[key]);
  expect(JSON.parse(storage.get("football-data-safety-v1:medical-recovery")).readScope).toBe(owner);
  expect(storage.get(key)).toBe("pending replacement from org-a");
});
}

function createHarness() {
  const centralState = { metadata: {}, hydrated: true, lastSavedAt: "previous-save", lastFetchedAt: "previous-read" };
  const authState = { session: { access_token: "test-only" }, currentUser: { id: "actor-1", teamId: "team-1", role: "coach" }, devMode: false };
  const events = [];
  const timers = [];
  const context = {
    centralState, authState,
    pendingCentralHydration: null,
    readCentralSyncManifestEntries: () => ({}),
    readCentralStateBatches: async () => ({ ok: true, payload: { entries: { profile: "{}" } } }),
    applyCentralStateEntries: async () => {},
    window: { dispatchEvent: (event) => events.push(event), setTimeout: (callback) => { timers.push(callback); return timers.length; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    isCentralStateKey: () => true,
    SESSION_PLANNER_STATE_KEY: "football-session-planner-v3",
    API_APP_STATE: "/api/app-state",
    getCentralStateBaseRevision: () => 1,
    apiRequest: async () => ({ ok: true, payload: { metadata: { revision: 2 } } }),
    getCentralCachedValue: () => "{}",
    getCentralCachedValueInfo: () => ({}),
    removeCentralCachedValue: () => {},
    collectCentralLocalStateEntries: () => ({}),
  };
  const tombstoneSource = source.slice(source.indexOf("  function reconcileCentralTombstones("), source.indexOf("  function persistCentralHydrationRevisions("));
  const api = runInNewContext(`${readScopeSource}\n${tombstoneSource}\n${hydrateSource}\n${syncSource}\n({ hydrateCentralState, syncCentralStateKey })`, context);
  return { api, centralState, authState, context, events, timers };
}

for (const change of ["organizationId", "token", "sign-out"]) {
  for (const responseKind of ["ack", "conflict", "error"]) {
    test(`a late Medical ${responseKind} after ${change} cannot change the new local-write scope`, async () => {
      const h = createHarness(), key = "football-medical-team-v1";
      let release;
      const barrier = new Promise((resolve) => { release = resolve; });
      h.context.apiRequest = async () => {
        await barrier;
        if (responseKind === "error") throw new Error("old account network error");
        return { ok: responseKind === "ack", status: responseKind === "ack" ? 200 : 409,
          payload: { key, value: "old-org-A", metadata: { revision: 100 }, currentRevision: 100 } };
      };
      h.context.getCentralCachedValueInfo = () => ({ source: "local-write" });
      const write = h.api.syncCentralStateKey(key, "old-org-A");
      if (change === "sign-out") { h.authState.session = null; h.authState.currentUser = null; }
      else if (change === "token") h.authState.session.access_token = "new-token";
      else h.authState.currentUser.organizationId = "org-b";
      h.centralState.metadata[key] = { revision: 2 };
      h.centralState.lastWriteError = "new account status";
      release();
      expect(await write).toMatchObject({ ok: false, staleContext: true });
      expect(h.centralState.metadata[key]).toEqual({ revision: 2 });
      expect(h.centralState.lastWriteError).toBe("new account status");
      expect(h.centralState.lastSavedAt).toBe("previous-save");
    });
  }
}

test("an acknowledged manifest cannot adopt an incomplete replacement after reload", () => {
  const key = "football-medical-team-v1", manifestKey = "football-data-safety-v1";
  const h = createProjectionHarness(), owner = h.api.getCentralReadScope();
  const entry = { pendingCentralSync: false, hash: "acknowledged-A", writes: 7 };
  const storage = new Map([[key, "untracked replacement B"], [manifestKey, JSON.stringify({ entries: { [key]: entry } })],
    [`${manifestKey}:medical-recovery`, JSON.stringify({ readScope: owner, generation: '["acknowledged-A",7,"",""]', incompleteReplacement: true })]]);
  const reloaded = createProjectionHarness(storage, true);
  expect(reloaded.api.getCentralCachedValueInfo(key)).toMatchObject({ source: "central-readonly-baseline", canEdit: false });
  reloaded.api.preserveMedicalRecoverySeparation(entry);
  reloaded.api.setCentralCachedValue(key, "fresh server", { source: "central-readonly-baseline", readScope: owner });
  expect(reloaded.api.getCentralCachedValue(key)).toBe("fresh server");
  expect(storage.get(key)).toBe("untracked replacement B");
  expect(JSON.parse(storage.get(manifestKey)).entries[key]).toEqual(entry);
});

test("returning to an acknowledged Medical owner does not classify a complete replacement as incomplete", () => {
  const key = "football-medical-team-v1", manifestKey = "football-data-safety-v1";
  const h = createProjectionHarness(), owner = h.api.getCentralReadScope();
  const entry = { pendingCentralSync: false, hash: "acknowledged-A", writes: 8 };
  const storage = new Map([[key, "acknowledged A"], [manifestKey, JSON.stringify({ entries: { [key]: entry } })],
    [`${manifestKey}:medical-recovery`, JSON.stringify({ readScope: owner, generation: '["previous",7,"",""]', incompleteReplacement: true })]]);
  const b = createProjectionHarness(storage, true);
  b.context.authState.currentUser.organizationId = "org-b";
  b.api.preserveMedicalRecoverySeparation(entry);
  expect(b.api.getCentralCachedValueInfo(key).source).toBe("central-readonly-baseline");
  const a = createProjectionHarness(storage, true);
  expect(a.api.getCentralCachedValueInfo(key).source).toBe("");
  expect(JSON.parse(storage.get(`${manifestKey}:medical-recovery`)).incompleteReplacement).not.toBe(true);
  expect(storage.get(key)).toBe("acknowledged A");
});

for (const signOut of [false, true]) {
  test(`token rotation drains one fresh hydration after the active read (sign-out: ${signOut})`, async () => {
    const h = createHarness();
    let release, reads = 0, applied = 0;
    const barrier = new Promise((resolve) => { release = resolve; });
    h.context.readCentralStateBatches = async () => {
      if (++reads === 1) await barrier;
      return { ok: true, payload: { entries: { profile: "{}" } } };
    };
    h.context.applyCentralStateEntries = async () => { applied += 1; };
    const first = h.api.hydrateCentralState();
    h.authState.session.access_token = "rotated";
    const queued = h.api.hydrateCentralState({ fresh: true });
    const coalesced = h.api.hydrateCentralState({ fresh: true });
    release();
    expect(await first).toBe(false);
    expect(applied).toBe(0);
    expect(h.timers).toHaveLength(1);
    if (signOut) { h.authState.session = null; h.authState.currentUser = null; }
    await h.timers.shift()();
    expect(await queued).toBe(!signOut);
    expect(await coalesced).toBe(!signOut);
    expect(reads).toBe(signOut ? 1 : 2);
    expect(applied).toBe(signOut ? 0 : 1);
    expect(h.events).toHaveLength(signOut ? 0 : 1);
    expect(h.timers).toHaveLength(0);
    expect(h.centralState.hydrating).toBe(false);
  });
}

for (const changedScope of [false, true]) {
  test(`coalesced hydration retains forceApply only within its scope (changed: ${changedScope})`, async () => {
    const h = createHarness();
    let release, calls = 0;
    const options = [];
    const barrier = new Promise((resolve) => { release = resolve; });
    h.context.readCentralStateBatches = async (input) => {
      options.push(input);
      if (++calls === 1) await barrier;
      return { ok: true, payload: { entries: { profile: "{}" } } };
    };
    const active = h.api.hydrateCentralState();
    const forced = h.api.hydrateCentralState({ forceApply: true });
    if (changedScope) h.authState.currentUser.organizationId = "new-org";
    const fresh = h.api.hydrateCentralState({ fresh: true });
    release(); await active;
    await h.timers.shift()();
    expect(await forced).toBe(!changedScope);
    expect(await fresh).toBe(true);
    expect(options[1].forceApply).toBe(!changedScope);
    expect(h.timers).toHaveLength(0);
});
}

test("an already-hydrated conflict caller waits for the actual coalesced read and receives its failure", async () => {
  const h = createHarness();
  let releaseFirst, releaseSecond, reads = 0, returned = false;
  const firstBarrier = new Promise((resolve) => { releaseFirst = resolve; });
  const secondBarrier = new Promise((resolve) => { releaseSecond = resolve; });
  h.context.readCentralStateBatches = async () => {
    if (++reads === 1) { await firstBarrier; return { ok: true, payload: { entries: { profile: "{}" } } }; }
    await secondBarrier;
    return { ok: false, payload: { reason: "Conflict read failed" } };
  };
  const active = h.api.hydrateCentralState();
  const conflict = h.api.hydrateCentralState({ forceApply: true }).then((value) => { returned = true; return value; });
  await Promise.resolve();
  expect(returned).toBe(false);
  releaseFirst(); await active;
  expect(returned).toBe(false);
  const drain = h.timers.shift()();
  await Promise.resolve();
  expect(reads).toBe(2);
  expect(returned).toBe(false);
  releaseSecond(); await drain;
  expect(await conflict).toBe(false);
  expect(h.centralState.hydrating).toBe(false);
});

test("successful fetch preserves saved timestamp; successful write preserves fetched timestamp", async () => {
  const h = createHarness();
  expect(await h.api.hydrateCentralState()).toBe(true);
  expect(h.centralState.lastSavedAt).toBe("previous-save");
  expect(h.centralState.lastFetchedAt).toBe(h.centralState.lastSyncedAt);
  expect(h.events.map((event) => event.type)).toEqual(["footballscience:central-state-ready"]);
  const fetched = h.centralState.lastFetchedAt;
  expect((await h.api.syncCentralStateKey("football-player-profiles-v1", "{}")).ok).toBe(true);
  expect(h.centralState.lastSavedAt).not.toBe("previous-save");
  expect(h.centralState.lastFetchedAt).toBe(fetched);
  const saved = h.centralState.lastSavedAt;
  await h.api.hydrateCentralState();
  expect(h.centralState.lastSavedAt).toBe(saved);
});

test("failed fetch and rejected writes never advance successful operation timestamps", async () => {
  const h = createHarness();
  h.context.readCentralStateBatches = async () => ({ ok: false, payload: { reason: "Offline" } });
  expect(await h.api.hydrateCentralState()).toBe(false);
  expect(h.centralState.lastFetchedAt).toBe("previous-read");
  for (const status of [403, 409, 500]) {
    h.context.apiRequest = async () => ({ ok: false, status, payload: { reason: "Rejected" } });
    expect((await h.api.syncCentralStateKey("football-player-profiles-v1", "{}")).ok).toBe(false);
    expect(h.centralState.lastSavedAt).toBe("previous-save");
  }
});

test("local development hydration is not mistaken for a write", async () => {
  const h = createHarness();
  h.authState.devMode = true;
  await h.api.hydrateCentralState();
  expect(h.centralState.lastSavedAt).toBe("previous-save");
  expect(h.centralState.lastFetchedAt).not.toBe("previous-read");
});

for (const changedField of ["id", "organizationId", "clubId", "teamId", "role"]) {
  test(`a read response after changing ${changedField} cannot apply or publish ready`, async () => {
    const h = createHarness();
    let applied = false;
    h.context.applyCentralStateEntries = async () => { applied = true; };
    h.context.readCentralStateBatches = async () => {
      h.authState.currentUser[changedField] = "changed";
      return { ok: true, payload: { entries: { profile: "{}" } } };
    };
    expect(await h.api.hydrateCentralState()).toBe(false);
    expect(applied).toBe(false);
    expect(h.events).toEqual([]);
    expect(h.centralState.lastFetchedAt).toBe("previous-read");
    expect(h.centralState.hydrating).toBe(false);
  });
}

for (const alreadyReadOnly of [true, false]) {
  test(`a Medical readonly view blocks response metadata/cache mutation (present before request: ${alreadyReadOnly})`, async () => {
    const h = createHarness();
    const info = { source: alreadyReadOnly ? "central-readonly-baseline" : "local-write" };
    h.context.getCentralCachedValueInfo = () => info;
    let requests = 0;
    h.context.apiRequest = async () => {
      requests += 1;
      info.source = "central-readonly-baseline";
      return { ok: true, payload: { metadata: { revision: 9 } } };
    };
    expect((await h.api.syncCentralStateKey("football-medical-team-v1", "draft")).ok).toBe(false);
    expect(requests).toBe(alreadyReadOnly ? 0 : 1);
    expect(h.centralState.metadata).toEqual({});
    expect(h.centralState.lastSavedAt).toBe("previous-save");
  });
}

for (const phase of ["apply", "empty-client", "seed-response"]) {
  test(`sign-out during ${phase} cannot publish ready, seed under another actor or advance metadata`, async () => {
    const h = createHarness();
    const signOut = () => { h.authState.currentUser = null; h.authState.session = null; };
    let seeds = 0, observations = 0;
    if (phase === "apply") {
      h.context.applyCentralStateEntries = async () => { signOut(); };
    } else {
      h.context.readCentralStateBatches = async () => ({ ok: true, payload: { entries: {} } });
      h.context.clearMissingCentralReadViews = () => {};
      h.context.collectCentralLocalStateEntries = () => ({ profile: "{}" });
      h.context.getSessionSaveClient = async () => {
        if (phase === "empty-client") signOut();
        return { observe: () => { observations += 1; } };
      };
      h.context.apiRequest = async () => {
        seeds += 1;
        signOut();
        return { ok: true, payload: { results: [{ key: "profile", metadata: { revision: 9 } }] } };
      };
    }
    expect(await h.api.hydrateCentralState()).toBe(false);
    expect(seeds).toBe(phase === "seed-response" ? 1 : 0);
    expect(observations).toBe(phase === "seed-response" ? 1 : 0);
    expect(h.events).toEqual([]);
    expect(h.centralState.metadata).toEqual({});
    expect(h.centralState.lastFetchedAt).toBe("previous-read");
    expect(h.centralState.hydrating).toBe(false);
  });
}
