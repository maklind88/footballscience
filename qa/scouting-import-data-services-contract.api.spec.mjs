import { expect, test } from "@playwright/test";
import {
  createScoutingImportDatabaseBuilder,
  createScoutingImportPreviewService,
} from "../src/modules/scouting/index.mjs";

const recordIndex = {
  player: 1,
  team: 2,
  league: 4,
  season: 5,
  position: 6,
  age: 7,
  minutes: 9,
  birthCountry: 10,
  passportCountry: 11,
  height: 12,
  weight: 13,
  metrics: 14,
  sourceSystem: 15,
  playerIdentityId: 19,
  sourceTrace: 20,
  metricQuality: 21,
  dateOfBirth: 22,
};
const normalizeText = (value = "", limit = 160) => String(value ?? "").trim().slice(0, limit);
const getImportMergeKey = (...parts) => parts.map((part) => normalizeText(part).toLowerCase()).join("|");
const getRecordMetricValueCount = (record) => Object.keys(record?.[recordIndex.metrics] || {}).length;
const getMetricValue = (record, metricId) => {
  if (metricId === "matches") return Number(record?.[8]);
  const entry = record?.[recordIndex.metrics]?.[metricId];
  return Number(entry?.value ?? entry);
};

function createBuilder() {
  return createScoutingImportDatabaseBuilder({
    buildCollectionHash: (parts) => `hash:${parts.join("~")}`,
    buildPlayerSourceId: (row) => normalizeText(row["Player ID"] || row.Player).toLowerCase(),
    buildRecordSourceId: (row, _map, playerId) => `${playerId}:${row.Season}:${row.Team}`,
    getImportColumnId: (label) => normalizeText(label).toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    getImportHeadersForBatch: (sheets) => [...new Set(sheets.flatMap((sheet) => sheet.headers))],
    getImportIdentityCandidates: (row) => row["Player ID"] ? [{ key: "wyscoutId", label: "Wyscout ID", value: row["Player ID"] }] : [],
    getImportMergeKey,
    getImportMetricDirection: () => "higher",
    getImportMetricHeaders: (headers, map) => headers.filter((header) => !Object.values(map).includes(header)),
    getImportMetricQuality: (value) => Number.isFinite(Number(value)) ? "trusted" : "missing",
    getImportSheetsForBatch: (draft) => draft.sheets,
    getImportSourceSystem: () => "wyscout",
    getRecordCanonicalPersonKey: (record) => record[recordIndex.playerIdentityId],
    getRecordLeague: (record) => record[recordIndex.league],
    getRecordMetricValueCount,
    getRecordMinutes: (record) => Number(record[recordIndex.minutes]) || 0,
    getRecordName: (record) => record[recordIndex.player],
    getRecordPlayerIdentityId: (record) => record[recordIndex.playerIdentityId],
    getRecordSeason: (record) => record[recordIndex.season],
    getRecordStrongPersonKey: (record) => record[recordIndex.playerIdentityId],
    getRecordTeam: (record) => record[recordIndex.team],
    isVerifiedImportIdentityKey: (key) => key === "wyscoutId",
    normalizeDateValue: normalizeText,
    normalizeLeague: normalizeText,
    normalizeText,
    now: () => "2026-08-25T12:00:00.000Z",
    parseMetricValue: (value) => value === "" || value === null || value === undefined ? null : Number(value),
    recordIndex,
    yieldWork: async () => {},
  });
}

function createDraft() {
  const sheet = {
    name: "Players",
    rowFormat: "columns",
    headers: ["Player", "Player ID", "Team", "League", "Season", "Position", "Minutes", "Speed"],
    rows: [
      ["Ada", "42", "Courage", "NWSL", "2026", "CF", 100, 7.2],
      ["Ada", "42", "Courage", "NWSL", "2026", "CF", 200, 7.5],
    ],
  };
  return {
    status: "ready",
    fileName: "players.xlsx",
    selectedSheet: "Players",
    sheets: [sheet],
    map: {
      player: "Player",
      playerIdentityId: "Player ID",
      team: "Team",
      league: "League",
      season: "Season",
      position: "Position",
      minutes: "Minutes",
    },
  };
}

test("Scouting import builder creates immutable columnar records and keeps the strongest duplicate", async () => {
  const draft = createDraft();
  const database = await createBuilder().build(draft);

  expect(database).toMatchObject({ source: "ui-import", fileName: "players.xlsx" });
  expect(database.metrics).toEqual([{ id: "import_speed", label: "Speed", direction: "higher", sourceColumn: "Speed" }]);
  expect(database.records).toHaveLength(1);
  expect(database.records[0][recordIndex.minutes]).toBe(200);
  expect(database.records[0][recordIndex.metrics].import_speed).toEqual({ value: 7.5, quality: "trusted" });
  expect(database.dedupeSummary.incomingDuplicates).toBe(1);
  expect(draft.sheets[0]).not.toHaveProperty("headerIndex");
  expect(draft.sheets[0]).not.toHaveProperty("metricColumns");
});

test("Scouting import builder fails fast when an operation is cancelled", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(createBuilder().build(createDraft(), { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
});

test("Scouting import preview reports replacements, identity risk, quality, and preserved manual work", async () => {
  const incoming = await createBuilder().build(createDraft());
  const existing = structuredClone(incoming.records[0]);
  existing[recordIndex.minutes] = 100;
  existing[recordIndex.dateOfBirth] = "1999-01-01";
  incoming.records[0][recordIndex.dateOfBirth] = "2000-01-01";
  const service = createScoutingImportPreviewService({
    getDatabase: () => ({ records: [existing], metrics: incoming.metrics }),
    getImportMergeKey,
    getManualStateSummary: () => ({ favorites: 2, lists: 1, reports: 3 }),
    getMetricQuality: (record, metricId) => record?.[recordIndex.metrics]?.[metricId]?.quality || "missing",
    getMetricValue,
    getRecordAge: (record) => record[recordIndex.age],
    getRecordBirthCountry: (record) => record[recordIndex.birthCountry],
    getRecordCanonicalPersonKey: (record) => record[recordIndex.playerIdentityId],
    getRecordDateOfBirth: (record) => record[recordIndex.dateOfBirth],
    getRecordLeague: (record) => record[recordIndex.league],
    getRecordMinutes: (record) => Number(record[recordIndex.minutes]) || 0,
    getRecordName: (record) => record[recordIndex.player],
    getRecordPassportCountry: (record) => record[recordIndex.passportCountry],
    getRecordPlayerIdentityId: (record) => record[recordIndex.playerIdentityId],
    getRecordPosition: (record) => record[recordIndex.position],
    getRecordSeason: (record) => record[recordIndex.season],
    getRecordSourceTrace: (record) => record[recordIndex.sourceTrace] || {},
    getRecordStrongPersonKey: (record) => record[recordIndex.playerIdentityId],
    getRecordTeam: (record) => record[recordIndex.team],
    normalizeIdentityPart: (value) => normalizeText(value).toLowerCase(),
    normalizeMetricQuality: (value) => ["trusted", "estimated"].includes(value) ? value : "missing",
    normalizeText,
    recordIndex,
    yieldWork: async () => {},
  });

  const preview = await service.build(incoming);

  expect(preview).toMatchObject({ incomingRows: 1, replaceRows: 1, unchangedRows: 0, criticalIdentityRows: 1 });
  expect(preview.metricQualityCounts.trusted).toBe(1);
  expect(preview.manualStatePreserved).toEqual({ favorites: 2, lists: 1, reports: 3 });
  expect(preview.importSafety.tone).toBe("danger");
});
