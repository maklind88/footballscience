import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../platform-auth-boot.js", import.meta.url), "utf8");
const medical = "football-medical-team-v1";
const sessions = "football-session-planner-v3";
const readerSource = source.slice(source.indexOf("  async function readCentralStateBatches("),
  source.indexOf("  function readCentralSyncManifestEntries("))
  .replace('await import("./src/modules/session-planner/session-state-transport.mjs")', "transport");

function reader(responses, decodeSessionResponse = async () => {}) {
  return runInNewContext(`${readerSource}\nreadCentralStateBatches`, {
    buildCentralStateReadBatches: () => [[medical], [sessions]],
    buildCentralStateReadPath: (keys) => keys[0],
    apiRequest: async (key) => responses[key],
    isCentralStateKey: (key) => [medical, sessions].includes(key),
    transport: { decodeSessionResponse },
  });
}

test("a Sessions timeout does not discard the authorized Medical read", async () => {
  const read = reader({
    [medical]: { ok: true, status: 200, payload: { entries: { [medical]: '{"records":[{"id":"central"}]}' },
      metadata: { [medical]: { revision: 7 } } } },
    [sessions]: { ok: false, status: 0, payload: { reason: "Request timed out. Try again." } },
  });
  const result = await read({ isCurrent: () => true });
  expect(result.ok).toBe(false);
  expect(result.payload.entries?.[medical]).toBe('{"records":[{"id":"central"}]}');
  expect(result.payload.metadata?.[medical]).toEqual({ revision: 7 });
  expect(result.payload.readKeys).toEqual([medical]);
  expect(result.payload.absentKeys).not.toContain(sessions);
});

for (const failure of ["timeout", "forbidden", "malformed", "decode"]) {
  test(`failed Medical batch preserves its scope while Sessions succeeds (${failure})`, async () => {
    const medicalResponse = failure === "timeout" ? { ok: false, status: 0, payload: { reason: "timeout" } }
      : failure === "forbidden" ? { ok: false, status: 403, payload: { reason: "forbidden" } }
      : { ok: true, status: 200, payload: failure === "malformed" ? {} : { entries: {}, broken: true } };
    const read = reader({ [medical]: medicalResponse,
      [sessions]: { ok: true, status: 200, payload: { entries: { [sessions]: "central session", [medical]: "unrequested" },
        metadata: { [sessions]: { revision: 8 }, [medical]: { revision: 999 } }, absentKeys: [medical] } },
    }, async (payload) => { if (payload.broken) throw new Error("bad transport"); });
    const result = await read({ isCurrent: () => true });
    expect(result.ok).toBe(false);
    expect(result.payload.entries).toEqual({ [sessions]: "central session" });
    expect(result.payload.metadata).toEqual({ [sessions]: { revision: 8 } });
    expect(result.payload.readKeys).toEqual([sessions]);
    expect(result.payload.failedKeys).toEqual([medical]);
    expect(result.payload.absentKeys).toEqual([]);
  });
}

test("complete success includes only each batch's own entries and explicit absences", async () => {
  const result = await reader({
    [medical]: { ok: true, status: 200, payload: { entries: { [medical]: "medical" }, metadata: { [medical]: { revision: 9 } } } },
    [sessions]: { ok: true, status: 200, payload: { entries: {}, absentKeys: [sessions] } },
  })({});
  expect(result.ok).toBe(true);
  expect(result.payload.readKeys).toEqual([medical, sessions]);
  expect(result.payload.absentKeys).toEqual([sessions]);
  expect(result.payload.failedKeys).toEqual([]);
});

test("invalid absence metadata cannot declare a key deleted or discard other reads", async () => {
  const result = await reader({
    [medical]: { ok: true, status: 200, payload: { entries: { [medical]: "medical" }, absentKeys: {} } },
    [sessions]: { ok: true, status: 200, payload: { entries: { [sessions]: "training" }, absentKeys: sessions } },
  })({});
  expect(result.payload.entries).toEqual({ [medical]: "medical", [sessions]: "training" });
  expect(result.payload.absentKeys).toEqual([]);
});

const applySource = source.slice(source.indexOf("  async function applyCentralStateEntries("),
  source.indexOf("  async function hydrateCentralState("))
  .replace('await import("./src/modules/session-planner/session-save-local-ui.mjs")', "localUi");

for (const present of [true, false]) {
  test(`partial Medical hydration preserves failed Sessions cache, metadata and journal (${present})`, async () => {
    const storage = new Map([[medical, "old medical"], [sessions, "unsent training"], ["other", "other data"]]);
    const centralState = { metadata: { [sessions]: { revision: 12 }, [medical]: { revision: 6 } } };
    const localStorage = { get length() { return storage.size; }, key: (i) => [...storage.keys()][i],
      getItem: (key) => storage.get(key) ?? null, removeItem: (key) => storage.delete(key) };
    let journalCalls = 0;
    const context = {
      centralState, window: { localStorage }, SESSION_PLANNER_STATE_KEY: sessions, MEDICAL_TEAM_STATE_KEY: medical,
      SET_PIECES_ROOM_STATE_KEY: "football-set-pieces-room-v1",
      WORKSPACE_HUB_STATE_KEY: "hub", PERIODIZATION_STATE_KEY: "period", SCHEDULE_STATE_KEY: "schedule",
      PLAYER_PROFILES_STATE_KEY: "profiles", MEDICAL_LOCAL_UI_FIELDS: [],
      getSessionSaveClient: async () => { journalCalls += 1; throw new Error("must not open failed Sessions journal"); },
      getSessionSaveScope: () => "scope", localUi: {},
      getLibrarySaveBridge: async () => ({ prepare: async () => {}, apply: () => false, isLibraryKey: () => false }),
      isCentralStateKey: () => true, shouldRemoveLocalCentralStateKey: () => true,
      readCentralSyncManifestEntries: () => ({ [sessions]: { pendingCentralSync: true, hash: "draft" } }),
      getCentralCachedValueInfo: () => ({}), removeCentralCachedValue: () => {}, clearMissingCentralReadViews: () => {},
      canCurrentUserAutomaticallyWriteCentralStateKey: () => false, hasForeignPendingGeneration: () => false,
      resolveCentralHydrationMetadata: (_key, entry) => entry, shouldApplyCentralStateEntry: () => true,
      stripCentralStateLocalUiFields: (value) => value,
      mergeCentralStateMediaValues: (_local, central) => ({ value: central, changed: false }),
      mergeCentralStateLocalUiFields: (_local, central) => ({ value: central }),
      cacheCentralStateValue: (key, value) => storage.set(key, value),
      persistCentralHydrationRevisions: () => {}, clearResolvedCentralHydrationError: () => {},
    };
    const apply = runInNewContext(`${applySource}\napplyCentralStateEntries`, context);
    await apply(present ? { [medical]: "verified central medical" } : {}, present ? { [medical]: { revision: 7 } } : {},
      { readKeys: [medical], absentKeys: present ? [] : [medical], isCurrent: () => true });
    expect(storage.get(medical)).toBe(present ? "verified central medical" : undefined);
    expect(storage.get(sessions)).toBe("unsent training");
    expect(storage.get("other")).toBe("other data");
    expect(centralState.metadata[sessions]).toEqual({ revision: 12 });
    expect(centralState.metadata[medical]).toEqual(present ? { revision: 7 } : undefined);
    expect(journalCalls).toBe(0);
    expect(context.window.__footballScienceCentralHydrating).toBe(false);
  });
}


test("a scoped Sessions read excludes unrelated failures and unsolicited Medical data", async () => {
  const read = reader({
    [medical]: { ok: false, status: 503, payload: { reason: "Medical unavailable" } },
    [sessions]: { ok: true, payload: { entries: { [sessions]: "training", [medical]: "unsolicited" },
      metadata: { [sessions]: { revision: 5 }, [medical]: { revision: 999 } } } },
  });
  const result = await read({ keys: [sessions] });
  expect(result.ok).toBe(true);
  expect(result.payload.readKeys).toEqual([sessions]);
  expect(result.payload.entries).toEqual({ [sessions]: "training" });
  expect(result.payload.metadata).toEqual({ [sessions]: { revision: 5 } });
});
