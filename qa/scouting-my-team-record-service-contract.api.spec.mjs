import { expect, test } from "@playwright/test";
import { createScoutingMyTeamRecordService } from "../src/modules/scouting/index.mjs";

function normalizeText(value = "", limit = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizeName(value = "") {
  return normalizeText(value, 160).toLowerCase();
}

function createHarness(overrides = {}) {
  const calls = {
    ensureLookups: 0,
  };
  let fingerprint = overrides.fingerprint || "lookup-a";
  const knownRecords = overrides.knownRecords instanceof Map ? overrides.knownRecords : new Map((overrides.knownRecords || []).map((record) => [record.id, record]));
  const service = createScoutingMyTeamRecordService({
    areNamesInitialSurnameMatch: (playerName, recordName) => {
      const player = normalizeName(playerName);
      const record = normalizeName(recordName);
      const playerParts = player.split(/\s+/).filter(Boolean);
      const recordParts = record.split(/\s+/).filter(Boolean);
      return player === record || (playerParts.at(-1) === recordParts.at(-1) && playerParts[0]?.[0] === recordParts[0]?.[0]);
    },
    ensureRecordLookupsReady: () => {
      calls.ensureLookups += 1;
    },
    getActiveDatabaseRecords: () => overrides.activeRecords || [],
    getCandidateSourceState: () => overrides.sourceState || null,
    getDatabase: () => ({ records: overrides.databaseRecords || [] }),
    getImportedDatabaseRecords: () => overrides.importedRecords || [],
    getKnownRecordCount: () => knownRecords.size,
    getKnownRecords: () => knownRecords,
    getPlayerId: (player) => normalizeText(player.id || player.name, 160),
    getPlayerSnapshots: () => overrides.playerSnapshots || {},
    getPositionGroup: (value) => {
      const source = typeof value === "string" ? value : value?.position || "";
      if (/forward|wing|striker/i.test(source)) return "ATT";
      if (/mid/i.test(source)) return "MID";
      if (/back|def/i.test(source)) return "DEF";
      return "";
    },
    getRecordAge: (record) => record.age,
    getRecordId: (record) => record?.id || "",
    getRecordLookupFingerprint: () => fingerprint,
    getRecordMinutes: (record) => record.minutes,
    getRecordName: (record) => record.name,
    getRecordSeasonYearValue: (record) => record.season,
    getRecordTeam: (record) => record.team,
    getSnapshotFallbackRecord: (recordId) => overrides.snapshotRecords?.[recordId] || null,
    normalizePersonNameForMatch: normalizeName,
    normalizeText,
  });
  return {
    calls,
    knownRecords,
    service,
    setFingerprint(nextFingerprint) {
      fingerprint = nextFingerprint;
    },
  };
}

test("Scouting My Team record service builds deduped candidate records from every source", () => {
  const harness = createHarness({
    databaseRecords: [
      { id: "db-1", name: "Ada Forward" },
      { id: "dup-1", name: "Ada Duplicate" },
    ],
    knownRecords: [
      { id: "dup-1", name: "Known Duplicate" },
      { id: "known-1", name: "Known Player" },
    ],
    playerSnapshots: {
      saved: { recordId: "snap-1" },
    },
    snapshotRecords: {
      "snap-1": { id: "snap-1", name: "Snapshot Player" },
    },
  });

  const ids = harness.service.getCandidateRecords().map((record) => record.id);

  expect(ids).toEqual(["db-1", "dup-1", "known-1", "snap-1"]);
  expect(harness.calls.ensureLookups).toBe(1);
});

test("Scouting My Team record service detects candidate source availability", () => {
  expect(createHarness({ activeRecords: [{ id: "active-1" }] }).service.hasCandidateRecordSources()).toBe(true);
  expect(createHarness({ importedRecords: [{ id: "imported-1" }] }).service.hasCandidateRecordSources()).toBe(true);
  expect(createHarness({ knownRecords: [{ id: "known-1" }] }).service.hasCandidateRecordSources()).toBe(true);
  expect(createHarness({ sourceState: { playerSnapshots: { saved: {} } } }).service.hasCandidateRecordSources()).toBe(true);
  expect(createHarness().service.hasCandidateRecordSources()).toBe(false);
});

test("Scouting My Team record service scores name, age, role, team, season, and minutes", () => {
  const harness = createHarness();

  const score = harness.service.scoreRecordMatch(
    { age: 24, name: "Ada Forward", position: "Forward", team: "North Carolina" },
    { age: 24, id: "record-1", minutes: 1800, name: "Ada Forward", position: "Forward", season: 2025, team: "North Carolina Courage" }
  );

  expect(score).toBe(127);
  expect(harness.service.scoreRecordMatch({ name: "Other Player" }, { id: "record-2", name: "Ada Forward" })).toBe(-1);
});

test("Scouting My Team record service returns the strongest cached match until lookup state changes", () => {
  const harness = createHarness({
    databaseRecords: [
      { age: 24, id: "old", minutes: 900, name: "Ada Forward", position: "Forward", season: 2021, team: "North Carolina" },
      { age: 24, id: "new", minutes: 1800, name: "Ada Forward", position: "Forward", season: 2025, team: "North Carolina" },
    ],
  });
  const player = { age: 24, id: "player-1", name: "Ada Forward", position: "Forward", team: "North Carolina" };

  expect(harness.service.findRecordForPlayer(player)?.id).toBe("new");
  expect(harness.service.findRecordForPlayer(player)?.id).toBe("new");
  expect(harness.calls.ensureLookups).toBe(1);

  harness.setFingerprint("lookup-b");
  expect(harness.service.findRecordForPlayer(player)?.id).toBe("new");
  expect(harness.calls.ensureLookups).toBe(2);
});

test("Scouting My Team record service exposes explicit cache clearing for worker hydration", () => {
  const harness = createHarness({
    databaseRecords: [{ age: 24, id: "record-1", minutes: 900, name: "Ada Forward", position: "Forward", season: 2024, team: "North Carolina" }],
  });

  harness.service.findRecordForPlayer({ age: 24, id: "player-1", name: "Ada Forward", position: "Forward", team: "North Carolina" });

  expect(harness.service.getMatchCacheSize()).toBe(1);
  harness.service.clearMatchCache();
  expect(harness.service.getMatchCacheSize()).toBe(0);
});
