import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../platform-auth-boot.js", import.meta.url), "utf8");
const hydrateSource = source.slice(source.indexOf("  async function hydrateCentralState("), source.indexOf("  async function syncCentralStateKey("));
const syncStart = source.indexOf("  async function syncCentralStateKey(");
const syncEnd = source.indexOf("\n  function ", syncStart);
const syncAsyncEnd = source.indexOf("\n  async function ", syncStart + 10);
const syncSource = source.slice(syncStart, Math.min(...[syncEnd, syncAsyncEnd].filter((value) => value > syncStart)));

function createHarness() {
  const centralState = { metadata: {}, hydrated: true, lastSavedAt: "previous-save", lastFetchedAt: "previous-read" };
  const authState = { session: { access_token: "test-only" }, devMode: false };
  const events = [];
  const context = {
    centralState, authState,
    readCentralStateBatches: async () => ({ ok: true, payload: { entries: { profile: "{}" } } }),
    applyCentralStateEntries: async () => {},
    window: { dispatchEvent: (event) => events.push(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    isCentralStateKey: () => true,
    SESSION_PLANNER_STATE_KEY: "football-session-planner-v3",
    API_APP_STATE: "/api/app-state",
    getCentralStateBaseRevision: () => 1,
    apiRequest: async () => ({ ok: true, payload: { metadata: { revision: 2 } } }),
    getCentralCachedValue: () => "{}",
    removeCentralCachedValue: () => {},
    collectCentralLocalStateEntries: () => ({}),
  };
  const api = runInNewContext(`${hydrateSource}\n${syncSource}\n({ hydrateCentralState, syncCentralStateKey })`, context);
  return { api, centralState, authState, context, events };
}

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
