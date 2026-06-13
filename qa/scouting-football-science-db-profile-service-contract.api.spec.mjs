import { expect, test } from "@playwright/test";
import { createFootballScienceDbProfileService } from "../src/modules/scouting/index.mjs";

const normalizeText = (value = "", limit = 160) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
const recordId = (record = {}) => normalizeText(record.id, 160);
const fsdbMeta = (record = {}) => record.fsdb || null;
const playerSourceId = (record = {}) => normalizeText(record.playerSourceId, 160);

function createHarness(options = {}) {
  const records = new Map((options.records || []).map((record) => [record.id, record]));
  const calls = {
    fetches: [],
    opened: [],
    qualityErrors: [],
    registered: [],
    renders: [],
    workspaceRenders: [],
  };
  const responses = Array.isArray(options.responses) ? options.responses.slice() : [];
  const service = createFootballScienceDbProfileService({
    fetchApi: async (query) => {
      calls.fetches.push(query);
      return responses.shift() || { ok: true, result: { player: { id: "fsdb-1", fsdbId: "fsdb-1", name: "Hydrated Player" } } };
    },
    getFootballScienceDbMeta: fsdbMeta,
    getRecordById: (id) => records.get(id) || null,
    getRecordId: recordId,
    getRecordPlayerSourceId: playerSourceId,
    normalizeProfile: (result = {}) => ({
      player: {
        id: normalizeText(result.player?.id, 160),
        fsdbId: normalizeText(result.player?.fsdbId || result.player?.id, 160),
        name: normalizeText(result.player?.name, 180) || "Hydrated Player",
      },
      sourceLinks: [],
      rosters: [],
      stats: [],
    }),
    normalizeText,
    openRecordProfile: (id) => calls.opened.push(id),
    playerToRecord: (player = {}) => ({
      id: player.fsdbId ? `fsdb:${player.fsdbId}` : "fsdb:generated",
      fsdb: { id: player.id, fsdbId: player.fsdbId },
      playerSourceId: player.fsdbId,
    }),
    registerRecord: (record = {}) => {
      const id = recordId(record);
      if (id) {
        records.set(id, record);
        calls.registered.push(id);
      }
      return id;
    },
    renderProfilePanel: (id) => calls.renders.push(id),
    renderWorkspace: (options) => calls.workspaceRenders.push(options),
    requestAnimationFrame: (callback) => {
      calls.renders.push("raf");
      callback();
    },
    setQualityError: (message) => calls.qualityErrors.push(message),
  });
  return { calls, records, service };
}

test("Football Science DB profile service resolves cache keys and profile queries", () => {
  const record = {
    id: "record-1",
    fsdb: { id: "11111111-1111-4111-8111-111111111111", fsdbId: "fsdb-1" },
    playerSourceId: "source-1",
  };
  const harness = createHarness();

  expect(harness.service.getCacheKeys(record)).toEqual([
    "record-1",
    "11111111-1111-4111-8111-111111111111",
    "fsdb-1",
    "source-1",
  ]);
  expect(harness.service.getQueryFromRecord(record)).toEqual({
    id: "11111111-1111-4111-8111-111111111111",
    fsdbId: "fsdb-1",
  });
  expect(harness.service.getQueryFromRecord({ id: "record-2", fsdb: { id: "not-uuid" }, playerSourceId: "source-2" })).toEqual({
    id: "",
    fsdbId: "source-2",
  });
});

test("Football Science DB profile service hydrates records and links both cache entries", async () => {
  const sourceRecord = { id: "record-1", fsdb: { id: "not-uuid", fsdbId: "fsdb-1" }, playerSourceId: "source-1" };
  const harness = createHarness({
    records: [sourceRecord],
    responses: [{ ok: true, result: { player: { id: "player-1", fsdbId: "fsdb-1", name: "Player One" } } }],
  });

  await harness.service.hydrateDetails("record-1");

  expect(harness.calls.fetches).toEqual([{ action: "profile", id: "", fsdbId: "fsdb-1" }]);
  expect(harness.calls.registered).toEqual(["fsdb:fsdb-1"]);
  expect(harness.calls.renders).toEqual(["record-1", "fsdb:fsdb-1"]);
  expect(harness.service.getCacheEntry(sourceRecord)).toMatchObject({ status: "ready", profile: { player: { fsdbId: "fsdb-1" } } });
  expect(harness.service.getCacheEntry(harness.records.get("fsdb:fsdb-1"))).toMatchObject({ status: "ready" });
});

test("Football Science DB profile service preserves existing profile on hydrate failure", async () => {
  const sourceRecord = { id: "record-1", fsdb: { fsdbId: "fsdb-1" }, playerSourceId: "source-1" };
  const previousProfile = { player: { fsdbId: "fsdb-1", name: "Previous" } };
  const harness = createHarness({
    records: [sourceRecord],
    responses: [{ ok: false, reason: "No profile" }],
  });
  harness.service.setCacheEntry(sourceRecord, { status: "ready", profile: previousProfile, error: "", promise: null });

  await harness.service.hydrateDetails("record-1", { force: true });

  expect(harness.service.getCacheEntry(sourceRecord)).toMatchObject({
    status: "error",
    profile: previousProfile,
    error: "No profile",
  });
  expect(harness.calls.renders).toEqual(["record-1", "record-1"]);
});

test("Football Science DB profile service reuses ready and loading cache entries unless forced", async () => {
  const sourceRecord = { id: "record-1", fsdb: { fsdbId: "fsdb-1" }, playerSourceId: "source-1" };
  const harness = createHarness({ records: [sourceRecord] });

  harness.service.setCacheEntry(sourceRecord, { status: "ready", profile: { player: { fsdbId: "fsdb-1" } }, error: "", promise: null });
  await harness.service.hydrateDetails("record-1");

  expect(harness.calls.fetches).toEqual([]);
  expect(harness.calls.renders).toEqual(["record-1"]);
});

test("Football Science DB profile service queues hydration through animation frame", () => {
  const sourceRecord = { id: "record-1", fsdb: { fsdbId: "fsdb-1" }, playerSourceId: "source-1" };
  const harness = createHarness({ records: [sourceRecord] });

  harness.service.queueHydration("record-1");

  expect(harness.calls.renders[0]).toBe("raf");
  expect(harness.calls.fetches).toEqual([{ action: "profile", id: "", fsdbId: "fsdb-1" }]);
});

test("Football Science DB profile service opens queued quality profiles or surfaces errors", async () => {
  const success = createHarness({
    responses: [{ ok: true, result: { player: { id: "player-1", fsdbId: "fsdb-1", name: "Player One" } } }],
  });

  await success.service.openFromQueue({ fsdbId: "fsdb-1" });

  expect(success.calls.fetches).toEqual([{ action: "profile", id: "", fsdbId: "fsdb-1" }]);
  expect(success.calls.registered).toEqual(["fsdb:fsdb-1"]);
  expect(success.calls.opened).toEqual(["fsdb:fsdb-1"]);

  const failure = createHarness({ responses: [{ ok: false, reason: "Not allowed" }] });
  await failure.service.openFromQueue({ id: "player-2" });

  expect(failure.calls.qualityErrors).toEqual(["Not allowed"]);
  expect(failure.calls.workspaceRenders).toEqual([{ preserveFocus: true }]);
});
