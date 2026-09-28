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

function createProjectionHarness(storage = new Map(), canWrite = false) {
  const context = {
    MEDICAL_TEAM_STATE_KEY: "football-medical-team-v1", DATA_SAFETY_MANIFEST_KEY: "football-data-safety-v1",
    MEDICAL_RECOVERY_MARKER_KEY: "football-data-safety-v1:medical-recovery",
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

test("replacement Medical drafts keep their owner after reload and cannot be read or retried by a different scope", () => {
  const key = "football-medical-team-v1";
  const h = createProjectionHarness();
  const owner = h.api.getCentralReadScope();
  const storage = new Map([
    [key, "pending replacement from org-a"],
    ["football-data-safety-v1", JSON.stringify({ entries: { [key]: { pendingCentralSync: true, hash: "replacement", writes: 8 } } })],
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

function createHarness() {
  const centralState = { metadata: {}, hydrated: true, lastSavedAt: "previous-save", lastFetchedAt: "previous-read" };
  const authState = { session: { access_token: "test-only" }, currentUser: { id: "actor-1", teamId: "team-1", role: "coach" }, devMode: false };
  const events = [];
  const timers = [];
  const context = {
    centralState, authState,
    pendingCentralHydration: null,
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
  const api = runInNewContext(`${readScopeSource}\n${hydrateSource}\n${syncSource}\n({ hydrateCentralState, syncCentralStateKey })`, context);
  return { api, centralState, authState, context, events, timers };
}

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
