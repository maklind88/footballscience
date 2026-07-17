import { expect, test } from "@playwright/test";
import { createScoutingComparisonActions, normalizeScoutingComparisonLab } from "../src/modules/scouting/index.mjs";

function normalizeText(value = "", limit = 160) {
  return String(value || "").trim().slice(0, limit);
}

function createHarness(options = {}) {
  const calls = [];
  let lab = normalizeScoutingComparisonLab(options.lab || { playerIds: ["", "", "", ""], metricIds: ["xg"] });
  let playerSearchQuery = "";
  let candidatesOpen = false;
  let searchNameReads = 0;
  const localRecords = options.localRecords || [
    { id: "record-1", name: "Alex Morgan", team: "San Diego", league: "NWSL", position: "CF", nationality: "USA" },
    { id: "record-2", name: "Alicia Wing", team: "Seattle", league: "NWSL", position: "LW", nationality: "USA" },
  ];
  const remoteRecords = options.remoteRecords || [
    { id: "record-2", name: "Alicia Wing", team: "Seattle", league: "NWSL", position: "LW", nationality: "USA" },
    { id: "record-3", name: "Alice Runner", team: "Portland", league: "NWSL", position: "RW", nationality: "USA" },
  ];
  const actions = createScoutingComparisonActions({
    canEdit: () => options.canEdit !== false,
    clearTimeout: (timerId) => calls.push(["clear-timeout", timerId]),
    focusPlayerSearch: () => calls.push(["focus"]),
    getAssetVersion: () => "asset-v1",
    getComparisonLab: () => lab,
    getDatabase: () => ({ records: localRecords }),
    getPlayerSearchQuery: () => playerSearchQuery,
    getRecordById: (recordId) => localRecords.find((record) => record.id === recordId) || null,
    getRecordId: (record) => record?.id || "",
    getRecordLeague: (record) => record?.league || "",
    getRecordName: (record) => {
      searchNameReads += 1;
      return record?.name || "";
    },
    getRecordNationality: (record) => record?.nationality || "",
    getRecordPosition: (record) => record?.position || "",
    getRecordTeam: (record) => record?.team || "",
    getWorkerQueryFromState: () => ({ source: "worker", minMinutes: 450 }),
    normalizeText,
    rememberRecordSnapshot: (record) => calls.push(["snapshot", record.id]),
    renderComparisonWorkspace: (renderOptions) => calls.push(["render-comparison", renderOptions]),
    renderWorkspace: (renderOptions) => calls.push(["render-workspace", renderOptions]),
    requestAnimationFrame: (callback) => {
      calls.push(["raf"]);
      callback();
    },
    requestDatabaseWorkerQuery: (payload) => {
      calls.push(["worker-query", payload]);
      return Promise.resolve({ records: remoteRecords });
    },
    setCandidatesOpen: (open) => {
      candidatesOpen = Boolean(open);
      calls.push(["candidates", candidatesOpen]);
    },
    setComparisonLab: (patch) => {
      lab = normalizeScoutingComparisonLab(patch);
      calls.push(["lab", lab]);
    },
    setPlayerSearchQuery: (query) => {
      playerSearchQuery = normalizeText(query, 120);
      calls.push(["query", playerSearchQuery]);
    },
    setTimeout: (callback, delayMs) => {
      calls.push(["set-timeout", delayMs]);
      callback();
      return 17;
    },
  });
  return {
    actions,
    calls,
    get candidatesOpen() { return candidatesOpen; },
    get lab() { return lab; },
    get playerSearchQuery() { return playerSearchQuery; },
    get searchNameReads() { return searchNameReads; },
  };
}

test("Scouting comparison actions normalize lab player and metric bounds", () => {
  const lab = normalizeScoutingComparisonLab({
    slotId: " cf ",
    playerIds: ["p1", "p2", "p3", "p4", "p5"],
    metricIds: ["xg", "xa", "xg", "prog", "press", "duel", "carry", "touch", "shot", "pass", "dribble", "cross", "extra"],
  });

  expect(lab.slotId).toBe("cf");
  expect(lab.playerIds).toEqual(["p1", "p2", "p3", "p4"]);
  expect(lab.metricIds).toHaveLength(12);
  expect(lab.metricIds.slice(0, 3)).toEqual(["xg", "xa", "prog"]);
  expect(lab.metricId).toBe("xg");
});

test("Scouting comparison actions add players, snapshot them, and restore search focus", () => {
  const harness = createHarness({ lab: { playerIds: ["record-1", "", "", ""], metricIds: ["xg"] } });

  const result = harness.actions.addPlayer("record-2");

  expect(result).toMatchObject({ changed: true, recordId: "record-2", status: "updated" });
  expect(harness.lab.playerIds).toEqual(["record-1", "record-2", "", ""]);
  expect(harness.playerSearchQuery).toBe("");
  expect(harness.candidatesOpen).toBe(false);
  expect(harness.calls).toEqual([
    ["snapshot", "record-2"],
    ["lab", { slotId: "", playerIds: ["record-1", "record-2", "", ""], metricId: "xg", metricIds: ["xg"] }],
    ["query", ""],
    ["candidates", false],
    ["render-comparison", { preserveFocus: true }],
    ["raf"],
    ["focus"],
  ]);
});

test("Scouting comparison actions close the drawer without rewriting lab for duplicate players", () => {
  const harness = createHarness({ lab: { playerIds: ["record-1", "", "", ""], metricIds: ["xg"] } });

  const result = harness.actions.addPlayer("record-1");

  expect(result).toMatchObject({ changed: false, recordId: "record-1", status: "already-selected" });
  expect(harness.calls.some((call) => call[0] === "lab")).toBe(false);
  expect(harness.calls.slice(-4)).toEqual([
    ["candidates", false],
    ["render-comparison", { preserveFocus: true }],
    ["raf"],
    ["focus"],
  ]);
});

test("Scouting comparison actions search local and worker records behind one cache", async () => {
  const harness = createHarness();

  const cache = harness.actions.queuePlayerSearch("ali");
  expect(cache).toMatchObject({ key: "asset-v1::ali", status: "loading" });
  expect(cache.records.map((record) => record.id)).toEqual(["record-2"]);

  await cache.promise;

  const readyCache = harness.actions.getSearchCache();
  expect(readyCache).toMatchObject({ key: "asset-v1::ali", status: "ready", error: "" });
  expect(readyCache.records.map((record) => record.id)).toEqual(["record-2", "record-3"]);
  expect(harness.calls).toContainEqual([
    "worker-query",
    {
      query: {
        source: "worker",
        minMinutes: 450,
        query: "ali",
        league: "",
        team: "",
        season: "",
        position: "",
        offset: 0,
        limit: 32,
        includeTotal: "0",
        includeOptions: "0",
        includeMetrics: "0",
      },
      timeoutMs: 18000,
    },
  ]);
  expect(harness.calls.filter((call) => call[0] === "snapshot").map((call) => call[1])).toEqual(["record-2", "record-3"]);
});

test("Scouting comparison actions remove players through a lightweight workspace render", () => {
  const harness = createHarness({ lab: { playerIds: ["record-1", "record-2", "", ""], metricIds: ["xg"] } });

  const result = harness.actions.removePlayer("record-1");

  expect(result).toMatchObject({ changed: true, recordId: "record-1", status: "updated" });
  expect(harness.lab.playerIds).toEqual(["record-2", "", "", ""]);
  expect(harness.candidatesOpen).toBe(true);
  expect(harness.calls.slice(-2)).toEqual([
    ["candidates", true],
    ["render-workspace", { preserveFocus: true }],
  ]);
});

test("Scouting comparison local search stops scanning after its result limit", () => {
  const localRecords = Array.from({ length: 1000 }, (_, index) => ({
    id: `record-${index}`,
    name: `Alice Player ${index}`,
    team: "Test FC",
    league: "Test League",
    position: "CM",
    nationality: "SE",
  }));
  const harness = createHarness({ localRecords, remoteRecords: [] });

  const cache = harness.actions.queuePlayerSearch("alice");

  expect(cache.records).toHaveLength(24);
  expect(harness.searchNameReads).toBe(24);
});
