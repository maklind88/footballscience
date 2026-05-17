import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const fsdb = require("../api/_lib/football-science-db.js");
const reepImporterPromise = import("../scripts/import-football-science-db-reep.mjs");
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

test("Football Science DB API caps pages and uses cursor pagination", () => {
  expect(fsdb.asLimit(5000)).toBe(50);
  expect(fsdb.asLimit(0)).toBe(25);

  const cursor = fsdb.encodePlayerCursor({ id: "11111111-1111-4111-8111-111111111111" });
  expect(fsdb.decodePlayerCursor(cursor)).toEqual({ id: "11111111-1111-4111-8111-111111111111" });

  const { params, limit } = fsdb.buildPlayerSearchParams({
    query: "Morgan",
    gender: "women",
    positionGroup: "FW",
    currentTeam: "San Diego",
    limit: 500,
    cursor,
  });

  expect(limit).toBe(50);
  expect(params.get("limit")).toBe("51");
  expect(params.get("search_text")).toBe("ilike.*Morgan*");
  expect(params.get("gender_segment")).toBe("eq.women");
  expect(params.get("position_group")).toBe("eq.FW");
  expect(params.get("current_team_name")).toBe("ilike.*San Diego*");
  expect(params.get("id")).toBe("gt.11111111-1111-4111-8111-111111111111");
  expect(params.has("offset")).toBe(false);
});

test("Football Science DB player search uses planned counts for first-page totals", () => {
  const source = readFileSync(resolve(projectRoot, "api/_lib/football-science-db.js"), "utf8");

  expect(source).toContain('dbRequest(`/fsdb_players?${params.toString()}`, { includeCount: includeTotal, countStrategy: "planned" })');
});

test("Football Science DB database requests time out instead of leaving the UI loading", () => {
  const source = readFileSync(resolve(projectRoot, "api/_lib/football-science-db.js"), "utf8");

  expect(source).toContain("const timeoutMs = Math.max(1000");
  expect(source).toContain("controller.abort()");
  expect(source).toContain("Football Science DB request timed out");
  expect(source).toContain("status: timedOut ? 504 : 502");
});

test("Football Science DB normalizes source records without leaking raw provider shape", () => {
  const record = fsdb.normalizePlayerRecord({
    reepId: "reep_pabc12345",
    name: "Ada Example",
    fullName: "Ada Lovelace Example",
    dateOfBirth: "2001-04-12",
    genderSegment: "women",
    nationality: "Norway",
    position: "forward",
    positionGroup: "FW",
    heightCm: "171",
    sourceSystem: "Reep",
    sourceConfidence: 90,
    metadata: { source: "qa" },
  });

  expect(record).toMatchObject({
    canonical_name: "Ada Lovelace Example",
    full_name: "Ada Lovelace Example",
    name_quality: "full",
    date_of_birth: "2001-04-12",
    birth_year: 2001,
    gender_segment: "women",
    nationality: "Norway",
    primary_position: "forward",
    position_group: "FW",
    height_cm: 171,
    source_priority: "reep",
    source_confidence: 90,
    identity_status: "unverified",
  });
  expect(record.fsdb_id).toMatch(/^fsdb_p[a-f0-9]{16}$/);
  expect(record.dedupe_key).toContain("name:ada lovelace example");
});

test("Football Science DB keeps real historic players and drops implausible dates", () => {
  const historic = fsdb.normalizePlayerRecord({
    name: "A. G. Guillemard",
    dateOfBirth: "1845-12-18",
    nationality: "United Kingdom",
    sourceSystem: "reep",
  });
  expect(historic).toMatchObject({
    date_of_birth: "1845-12-18",
    birth_year: 1845,
  });

  const implausible = fsdb.normalizePlayerRecord({
    name: "Archive Error",
    dateOfBirth: "0099-01-01",
    nationality: "Unknown",
    sourceSystem: "reep",
  });
  expect(implausible).toMatchObject({
    date_of_birth: null,
    birth_year: null,
  });
});

test("Football Science DB dedupe does not trust initial-only scouting names", () => {
  expect(fsdb.isInitialOnlyName("A. Morgan")).toBe(true);
  expect(fsdb.isInitialOnlyName("A Morgan")).toBe(true);
  expect(fsdb.isInitialOnlyName("Alex Morgan")).toBe(false);

  expect(
    fsdb.buildStrongPlayerDedupeKey({
      name: "A. Morgan",
      dateOfBirth: "1989-07-02",
      nationality: "United States",
      genderSegment: "women",
    })
  ).toBe(null);

  const resolved = fsdb.normalizePlayerRecord({
    name: "A. Morgan",
    fullName: "Alex Morgan",
    dateOfBirth: "1989-07-02",
    nationality: "United States",
    genderSegment: "women",
    positionGroup: "FW",
  });
  const duplicate = fsdb.normalizePlayerRecord({
    name: "Alex Morgan",
    dateOfBirth: "1989-07-02",
    nationality: "United States",
    genderSegment: "women",
    positionGroup: "FW",
  });

  expect(resolved).toMatchObject({
    canonical_name: "Alex Morgan",
    full_name: "Alex Morgan",
    name_quality: "full",
  });
  expect(resolved.dedupe_key).toBe(duplicate.dedupe_key);
  expect(resolved.fsdb_id).toBe(duplicate.fsdb_id);
});

test("Football Science DB readiness only unlocks spider data with metric depth", () => {
  const identityOnly = fsdb.getPlayerDataReadiness({
    fsdb_id: "fsdb_pidentity",
    canonical_name: "Identity Player",
  });
  expect(identityOnly).toMatchObject({
    tier: "identity_only",
    spiderReady: false,
  });

  const spiderReady = fsdb.getPlayerDataReadiness({
    fsdb_id: "fsdb_pspider",
    canonical_name: "Spider Player",
    date_of_birth: "2001-04-12",
    nationality: "Norway",
    position_group: "FW",
    current_team_name: "Example FC",
    season_stat_count: 1,
    metric_count: 4,
  });
  expect(spiderReady).toMatchObject({
    tier: "spider_ready",
    profileReady: true,
    rosterReady: true,
    statsReady: true,
    spiderReady: true,
  });
});

test("Football Science DB quality summary stays aggregate and review-first", () => {
  const summary = fsdb.buildFootballScienceDbQualitySummary(
    {
      total: 1000,
      women: 430,
      men: 520,
      fullNames: 840,
      dedupeReady: 760,
      sourceLinked: 900,
      birthDateKnown: 700,
      nationalityKnown: 880,
      positionKnown: 920,
      rosterLinked: 640,
      statsLinked: 280,
      spiderMetricDepth: 120,
    },
    {
      weakIdentity: [{ fsdbId: "fsdb_pweak", name: "A. Example" }],
      initialNames: [{ fsdbId: "fsdb_pinitial", name: "B. Player" }],
    }
  );

  expect(summary).toMatchObject({
    ok: true,
    countStrategy: "planned",
    totals: {
      players: 1000,
      women: 430,
      men: 520,
      unknownGender: 50,
    },
    coverage: {
      fullNamePct: 84,
      dedupePct: 76,
      sourceLinkPct: 90,
      spiderMetricPct: 12,
    },
    counts: {
      missingFullName: 160,
      missingDedupe: 240,
      missingSpiderMetrics: 880,
    },
  });
  expect(summary.reviewQueues.weakIdentity).toHaveLength(1);
  expect(summary.reviewQueues.initialNames).toHaveLength(1);
});

test("Football Science DB route permissions separate readers from import writers", () => {
  expect(fsdb.footballScienceDbStatus({ role: "coach" })).toMatchObject({
    canRead: true,
    canWrite: false,
    maxPageSize: 50,
  });
  expect(fsdb.footballScienceDbStatus({ role: "scout" })).toMatchObject({
    canRead: true,
    canWrite: true,
  });
  expect(fsdb.footballScienceDbStatus({ role: "guest" })).toMatchObject({
    canRead: false,
    canWrite: false,
  });
});

test("Reep importer dry run reports dedupe and name quality before writes", async () => {
  const importer = await reepImporterPromise;
  const players = [
    importer.playerFromReepRow({
      type: "player",
      reep_id: "reep_1",
      name: "A. Example",
      date_of_birth: "2001-04-12",
      nationality: "Norway",
      position: "Forward",
      key_wikidata: "Q1",
    }),
    importer.playerFromReepRow({
      type: "player",
      reep_id: "reep_2",
      name: "Ada Example",
      full_name: "Ada Example",
      date_of_birth: "2001-04-12",
      nationality: "Norway",
      position: "Forward",
      key_wikidata: "Q2",
    }),
    importer.playerFromReepRow({
      type: "player",
      reep_id: "reep_3",
      name: "Ada Example",
      full_name: "Ada Example",
      date_of_birth: "2001-04-12",
      nationality: "Norway",
      position: "Forward",
      key_wikidata: "Q3",
    }),
  ].filter(Boolean);

  const report = importer.buildDryRunReport(players);
  expect(report).toMatchObject({
    players: 3,
    fullNames: 2,
    initialNames: 1,
    dedupeReady: 2,
    duplicateFsdbIds: 0,
    duplicateStrongDedupeKeys: 1,
    sourceLinks: 3,
  });
  expect(report.review.initialNames[0].name).toBe("A. Example");
  expect(report.review.duplicateCandidates[0].count).toBe(2);
  expect(importer.formatDryRunReport(report).join("\n")).toContain("duplicateStrongKeys=1");

  const importPlan = importer.preparePlayersForImport(players);
  expect(importPlan).toMatchObject({
    sourcePlayers: 3,
    collapsedDuplicatePlayers: 1,
    duplicateGroupsMerged: 1,
  });
  expect(importPlan.players).toHaveLength(2);

  const adaImportRow = importer.playerRowForImport(importPlan.players.find((player) => player.canonical_name === "Ada Example"));
  expect(adaImportRow).toMatchObject({
    name_quality: "full",
    source_link_count: 2,
  });
  expect(adaImportRow.dedupe_key).toContain("name:ada example");
});
