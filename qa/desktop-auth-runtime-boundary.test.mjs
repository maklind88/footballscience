import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const script = await readFile(new URL("../platform-auth-boot.js", import.meta.url), "utf8");
const marker = "desktop-native-session-v1";
const startTime = Date.parse("2026-11-26T12:00:00Z");

function nativeResult(overrides = {}) {
  return {
    configured: true,
    session: { access_token: marker, token_type: "native", user: { id: "qa-coach", email: "coach@example.test", user_metadata: {} } },
    snapshot: {
      actorId: "qa-coach",
      organizationId: "qa-organization",
      tenantId: "qa-club",
      teamId: "qa-team",
      authEpoch: 2,
      offlineLeaseExpiresAtUnixMs: startTime + 3600000,
      canReadOffline: true,
      profile: { role: "coach", status: "active" },
      ...overrides,
    },
  };
}

function element() {
  return {
    hidden: true,
    dataset: {},
    value: "",
    textContent: "",
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    querySelector() { return null; },
    setAttribute() {},
    focus() {},
  };
}

async function boot(location, { environment = true, native, web = false, fetchReply } = {}) {
  const records = new Map();
  const requests = [], storageWrites = [], browserSessions = [];
  let now = startTime, timer = 0;
  const document = {
    readyState: "complete",
    body: element(),
    addEventListener() {},
    querySelector: (selector) => selector.startsWith("script[src=") && web ? element() : null,
    getElementById(id) {
      if (!records.has(id)) records.set(id, element());
      return records.get(id);
    },
  };
  const fetch = async (path, options) => {
    requests.push({ path, options });
    if (fetchReply) return fetchReply(path);
    const payload = path === "/api/client-config"
      ? { ok: true, url: "https://test-project.supabase.co", anonKey: "test-public-key" }
      : { ok: true, entries: [] };
    return Response.json(payload);
  };
  const window = {
    location: new URL(location),
    createCentralMedicalStateMerger: () => () => ({}),
    clearTimeout() {},
    setTimeout: () => ++timer,
    dispatchEvent() {},
    localStorage: {
      get length() { return 0; },
      getItem: () => null,
      setItem: (name) => storageWrites.push(name),
      removeItem: (name) => storageWrites.push(name),
    },
    navigator: { onLine: true },
    ...(environment && {
      __FOOTBALL_SCIENCE_DESKTOP__: { schema: "fs-desktop-platform-environment-v1", nativeBridgeAvailable: true },
    }),
    ...(native && {
      __FOOTBALL_SCIENCE_DESKTOP_AUTH__: {
        schema: "fs-desktop-auth-bridge-v1",
        opaqueAccessMarker: marker,
        getSession: native,
        refreshSession: native,
        signIn: native,
        signOut: async () => {},
        resetPassword: async () => ({ ok: true }),
      },
    }),
    ...(web && {
      supabase: {
        createClient: (url, _key, options) => {
          browserSessions.push({ url, options });
          return { auth: {
            getSession: async () => ({ data: { session: null } }),
            onAuthStateChange() {},
          } };
        },
      },
    }),
  };
  class TestDate extends Date {
    static now() { return now; }
  }
  runInNewContext(script, { window, document, console, fetch, Headers, URLSearchParams, AbortController,
    Date: TestDate, Event, CustomEvent, requestAnimationFrame() {} });
  await window.platformAuthReadyPromise;
  return {
    window, requests, storageWrites, browserSessions,
    auth: window.platformAuthStore,
    ui: (id) => document.getElementById(id),
    advance: (ms) => { now += ms; },
  };
}

test("desktop origins without an active native bridge remain locked and never bootstrap dev or web auth", async () => {
  for (const location of [
    "fs-active://localhost/active/index.html",
    "http://fs-active.localhost/active/index.html",
    "fs-candidate://localhost/candidate/index.html",
    "http://fs-recovery.localhost/recovery/index.html",
  ]) {
    const result = await boot(location, { environment: false, web: true });
    assert.equal(result.auth.isDevMode(), false);
    assert.equal(result.auth.getCurrentUser(), null);
    assert.equal(result.ui("loginScreen").hidden, false);
    assert.match(result.ui("loginError").textContent, /desktop authentication/i);
    assert.deepEqual(result.requests, []);
    assert.deepEqual(result.browserSessions, []);
    assert.deepEqual(result.storageWrites, []);
  }
});

test("active desktop identity is isolated from the browser provider and protected generation expires", async () => {
  for (const location of [
    "fs-active://localhost/active/index.html",
    "http://fs-active.localhost/active/index.html",
  ]) {
    const result = await boot(location, { native: async () => nativeResult(), web: true });
    assert.equal(result.auth.getCurrentUser().id, "qa-coach");
    assert.equal(result.auth.getCurrentUser().teamId, "qa-team");
    assert.equal(result.auth.getCurrentUser().organizationId, "qa-organization");
    assert.equal(await result.auth.getAccessToken(), marker + ":2");
    assert.equal(result.auth.getSupabaseClient(), null);
    assert.equal(result.auth.getSessionsOfflineOwner(), "");
    assert.equal(result.window.footballScienceCentralState.getReadScope(), "");
    assert.equal(result.window.footballScienceCentralState.canAutoSyncKey("football-session-planner-v3"), false);
    assert.equal(await result.window.footballScienceCentralState.hydrate(), false);
    assert.equal(result.auth.getCurrentUser().id, "qa-coach");
    await result.auth.getSessionHistory();
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0].options.headers.has("Authorization"), false);
    assert.deepEqual(result.browserSessions, []);
    assert.deepEqual(result.storageWrites, []);
    result.advance(3600001);
    assert.equal(await result.auth.getAccessToken(), null);
    assert.equal(result.auth.getCurrentUser(), null);
    assert.equal(result.ui("hubShell").hidden, true);
  }
});

test("expired, unpartitioned and mismatched desktop snapshots never unlock", async () => {
  for (const override of [
    { offlineLeaseExpiresAtUnixMs: startTime - 1 },
    { canReadOffline: false },
    { actorId: "different-actor" },
    { teamId: "" },
  ]) {
    const result = await boot("fs-active://localhost/active/index.html", { native: async () => nativeResult(override) });
    assert.equal(result.auth.getCurrentUser(), null);
    assert.equal(result.ui("hubShell").hidden, true);
    assert.deepEqual(result.requests, []);
  }
});

test("ordinary browser boot still reads the existing public config and starts Supabase Auth", async () => {
  let nativeAttempts = 0;
  const result = await boot("https://footballscience.xyz/", {
    environment: false,
    native: async () => { nativeAttempts += 1; return nativeResult(); },
    web: true,
  });
  assert.equal(nativeAttempts, 0);
  assert.deepEqual(result.requests.map(({ path }) => path), ["/api/client-config"]);
  assert.equal(result.browserSessions[0].options.auth.persistSession, true);
  assert.equal(result.auth.getCurrentUser(), null);
});


test("desktop preview rejects web mutations and drops a read response after logout", async () => {
  let begin, respond;
  const started = new Promise(resolve => { begin = resolve; });
  const delayed = new Promise(resolve => { respond = resolve; });
  const result = await boot("fs-active://localhost/active/index.html", {
    native: async () => nativeResult(),
    fetchReply: () => { begin(); return delayed; },
  });
  assert.equal((await result.auth.restoreSessionHistory("synthetic-entry")).ok, false);
  assert.deepEqual(result.requests, []);
  const history = result.auth.getSessionHistory();
  await started;
  result.auth.clearCurrentUser();
  respond(Response.json({ entries: [{ id: "old-account-history" }] }));
  assert.equal((await history).ok, false);
  assert.equal(await result.auth.getAccessToken(), null);
  assert.equal(result.auth.getCurrentUser(), null);
  assert.deepEqual(result.storageWrites, []);
});
