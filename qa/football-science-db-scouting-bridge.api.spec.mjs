import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const fsdb = require("../api/_lib/football-science-db.js");
const scoutingDatabase = require("../api/_lib/scouting-database.js");
const permissionMatrix = require("../src/core/permission-matrix.cjs");
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function loadScoutingWorkerSandbox() {
  const sandbox = {
    self: { addEventListener() {} },
    Map,
    Set,
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(resolve(projectRoot, "scouting-database-worker.js"), "utf8"), sandbox);
  return sandbox;
}

test("Scouting worker honors lightweight query payload flags", () => {
  const sandbox = loadScoutingWorkerSandbox();
  const query = sandbox.normalizeQuery({
    includeMetrics: "0",
    includeOptions: "false",
    limit: 50,
  });

  expect(query.includeMetrics).toBe(false);
  expect(query.includeOptions).toBe(false);
  expect(query.limit).toBe(50);
});

test("Scouting worker avoids duplicating the static player database in IndexedDB", () => {
  const worker = readFileSync(resolve(projectRoot, "scouting-database-worker.js"), "utf8");
  const workspace = readFileSync(resolve(projectRoot, "scouting-workspace.js"), "utf8");

  expect(worker).not.toContain("indexedDB");
  expect(worker).not.toContain("football-science-scouting-worker-cache");
  expect(workspace).toContain("loadScoutingDatabaseWithWorker({ previewFirst: false })");
  expect(workspace).not.toContain("manifestScriptUrl:");
});

test("Scouting worker parses generated data as JSON before using script execution fallback", () => {
  const worker = readFileSync(resolve(projectRoot, "scouting-database-worker.js"), "utf8");
  const sandbox = loadScoutingWorkerSandbox();
  const parsed = sandbox.parseGeneratedDatabaseSource(
    'window.__testDatabase={"records":[["p1"]],"metrics":[]};\nwindow.__activeDatabase=window.__testDatabase;',
    "__testDatabase"
  );

  expect(worker).toContain("parseGeneratedDatabaseSource");
  expect(worker).toContain("JSON.parse(source.slice(payloadStart, payloadEnd))");
  expect(worker).toContain('fetch(scriptUrl, { cache: "force-cache" })');
  expect(worker).toContain("importScripts(normalizedScriptUrl)");
  expect(parsed.records[0][0]).toBe("p1");
});

test("Scouting worker primes expensive indexes only when explicitly requested", () => {
  const worker = readFileSync(resolve(projectRoot, "scouting-database-worker.js"), "utf8");
  const sandbox = loadScoutingWorkerSandbox();
  let recordIdReads = 0;
  const record = [];
  Object.defineProperty(record, 0, {
    get() {
      recordIdReads += 1;
      return "player-1";
    },
  });
  const database = { records: [record], metrics: [] };

  sandbox.primeDatabaseIndexes(database);
  expect(recordIdReads).toBe(0);
  sandbox.primeDatabaseIndexes(database, { recordsById: true });
  expect(recordIdReads).toBeGreaterThan(0);
  expect(worker).toContain("options.recordsById === true");
  expect(worker).toContain("options.options === true");
  expect(worker).toContain("options.search === true");
});

test("Scouting worker reuses normalized name signatures during full database search", () => {
  const worker = readFileSync(resolve(projectRoot, "scouting-database-worker.js"), "utf8");
  const sandbox = loadScoutingWorkerSandbox();
  let inactiveNumericFilterReads = 0;
  const record = [
    "player-1",
    "K. Sheridan",
    "North Carolina Courage",
    "",
    "NWSL",
    "2026",
    "GK",
    30,
    15,
    1_338,
    "Canada",
    "Canada",
    175,
    70,
    [],
  ];
  Object.defineProperty(record, 7, {
    get() {
      inactiveNumericFilterReads += 1;
      return 30;
    },
  });
  Object.defineProperty(record, 9, {
    get() {
      inactiveNumericFilterReads += 1;
      return 1_338;
    },
  });
  const accentedRecord = [...record];
  accentedRecord[0] = "player-2";
  accentedRecord[1] = "Élodie Dupont";
  inactiveNumericFilterReads = 0;

  expect(sandbox.recordMatchesQuery(record, sandbox.normalizeQuery({ query: "Katelyn Sheridan" }))).toBe(true);
  expect(sandbox.recordMatchesQuery(record, sandbox.normalizeQuery({ query: "Sher" }))).toBe(true);
  expect(sandbox.recordMatchesQuery(accentedRecord, sandbox.normalizeQuery({ query: "Elodie" }))).toBe(true);
  expect(sandbox.recordMatchesQuery(record, sandbox.normalizeQuery({ query: "Jane Doe" }))).toBe(false);
  expect(inactiveNumericFilterReads).toBe(0);
  expect(worker).toContain("queryNameSignature: searchQuery ? getPersonNameSignature(searchQuery) : null");
  expect(worker).toContain("function recordMatchesSearchQuery(record, query)");
  expect(worker).not.toContain("function buildSearchCorpus(record)");
  expect(worker).not.toContain("areNamesInitialSurnameMatch(query.query");
});

test("Scouting worker materializes merged seasons only for the visible page and caches dedupe", () => {
  const worker = readFileSync(resolve(projectRoot, "scouting-database-worker.js"), "utf8");

  expect(worker).toContain("let dedupedRecordCache = new Map()");
  expect(worker).toContain("function getDedupedRecordEntry(records, query)");
  expect(worker).toContain("attachMergedSeasons: false");
  expect(worker.indexOf(".slice(normalizedQuery.offset")).toBeLessThan(worker.indexOf("attachMergedSeasonRecords(record, seasonRecords)"));
});

test("Scouting worker reuses immutable core metadata across identity passes", () => {
  const workerSource = readFileSync(resolve(projectRoot, "scouting-database-worker.js"), "utf8");
  const worker = loadScoutingWorkerSandbox();
  let coreReads = 0;
  const record = [
    "player-1",
    "K. Sheridan",
    "North Carolina Courage",
    "",
    "NWSL",
    "2026",
    "GK",
    30,
    15,
    1_338,
    "Canada",
    "Canada",
    175,
    70,
    [],
  ];
  for (const index of [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const value = record[index];
    Object.defineProperty(record, index, {
      configurable: true,
      get() {
        coreReads += 1;
        return value;
      },
    });
  }

  const first = worker.getRecordMetadata(record);
  const readsAfterFirstPass = coreReads;
  expect(first).toMatchObject({
    identityKey: "k sheridan::canada|canada::h175",
    minutes: 1_338,
    positionGroup: "GK",
    seasonYear: 2026,
  });

  expect(worker.getRecordMetadata(record)).toBe(first);
  expect(worker.getRecordIdentityBaseKey(record)).toBe(first.identityKey);
  expect(worker.getRecordSeasonYear(record)).toBe(2026);
  expect(coreReads).toBe(readsAfterFirstPass);
  expect(workerSource).toContain("let recordMetadataCache = new WeakMap()");
  expect(workerSource).toContain("recordMetadataCache = new WeakMap()");
  expect(workerSource).toContain("const metadata = getRecordMetadata(record)");
});

test("Scouting worker preserves core and imported metric sort order through decorated sorting", () => {
  const worker = loadScoutingWorkerSandbox();
  const createRecord = ({ id, name, age, matches, minutes, metric }) => [
    id,
    name,
    "North Carolina Courage",
    "",
    "NWSL",
    "2026",
    "CF",
    age,
    matches,
    minutes,
    "United States",
    "United States",
    170,
    62,
    [metric],
  ];
  const records = [
    createRecord({ id: "ada", name: "Ada", age: 30, matches: 12, minutes: 900, metric: 72 }),
    createRecord({ id: "bea", name: "Bea", age: 24, matches: 8, minutes: 1_200, metric: 61 }),
    createRecord({ id: "cy", name: "Cy", age: 27, matches: 6, minutes: 600, metric: 89 }),
  ];
  worker.activateDatabase({ records, metrics: [{ id: "progressive-actions", direction: "higher" }] }, "sort-contract");

  const idsFor = (metricId) => worker.sortRecordsByMetric(records, metricId).map((record) => record[0]);
  expect(idsFor("minutes")).toEqual(["bea", "ada", "cy"]);
  expect(idsFor("matches")).toEqual(["ada", "bea", "cy"]);
  expect(idsFor("age")).toEqual(["bea", "cy", "ada"]);
  expect(idsFor("progressive-actions")).toEqual(["cy", "ada", "bea"]);
});

test("Scouting database keeps source enrichment behind one visual player database", () => {
  const workspace = readFileSync(resolve(projectRoot, "scouting-workspace.js"), "utf8");
  const client = readFileSync(resolve(projectRoot, "src/modules/scouting/scouting-football-science-db-client.mjs"), "utf8");
  const pagingRenderer = readFileSync(resolve(projectRoot, "src/modules/scouting/scouting-database-paging-renderer.mjs"), "utf8");
  const resultsService = readFileSync(resolve(projectRoot, "src/modules/scouting/scouting-database-results-service.mjs"), "utf8");
  const overviewController = readFileSync(resolve(projectRoot, "src/modules/scouting/scouting-profile-overview-controller.mjs"), "utf8");
  const profileService = readFileSync(resolve(projectRoot, "src/modules/scouting/scouting-football-science-db-profile-service.mjs"), "utf8");
  const qualityService = readFileSync(resolve(projectRoot, "src/modules/scouting/scouting-football-science-db-quality-service.mjs"), "utf8");

  expect(workspace).toContain("createFootballScienceDbApiClient");
  expect(workspace).toContain("createScoutingApiProfileService");
  expect(workspace).toContain("createScoutingDatabasePagingRenderer");
  expect(workspace).toContain("createScoutingDatabaseResultsService");
  expect(workspace).toContain("createFootballScienceDbProfileService");
  expect(workspace).toContain("createFootballScienceDbQualityService");
  expect(client).toContain("/api/football-science-db");
  expect(workspace).toContain("footballSciencePlayerToScoutingRecord");
  expect(workspace).toContain("createFootballScienceDbScoutingAdapter");
  expect(workspace).toContain("createFootballScienceDbScoutingModels");
  expect(workspace).toContain("SCOUTING_STANDALONE_FSDB_DATABASE_ENABLED = false");
  expect(workspace).toContain("SCOUTING_SERVER_FIRST_DATABASE_ENABLED = false");
  expect(workspace).toContain("createScoutingDatabaseSourcePolicy");
  expect(workspace).toContain("scoutingDatabaseSourcePolicy.normalizeFilterSource(filters.source)");
  expect(workspace).toContain("renderScoutingProfileOverviewPanelShell");
  expect(workspace).toContain("renderShell: renderScoutingFootballScienceDbPanel");
  expect(workspace).toContain("return scoutingProfileOverviewController.renderShell(record);");
  expect(overviewController).toContain("function renderShell(record)");
  expect(workspace).toContain("data-scouting-profile-fsdb-panel");
  expect(workspace).not.toContain('data-scouting-load-fsdb');
  expect(workspace).not.toContain("data-fsdb-gender-segment");
  expect(workspace).toContain("fsdbGenderSegment");
  expect(workspace).toContain("genderSegment: filters.fsdbGenderSegment");
  expect(workspace).not.toContain("Choose Football Science DB segment");
  expect(pagingRenderer).toContain('data-scouting-page-cursor');
  expect(workspace).toContain("scoutingDatabasePagingRenderer.render(paging)");
  expect(workspace).toContain("scoutingDatabaseResultsService.getResultsMarkup()");
  expect(resultsService).toContain("No players match these filters yet.");
  expect(workspace).toContain("renderScoutingFootballScienceDbPanel");
  expect(workspace).toContain("renderFootballScienceDbQualityPanel");
  expect(qualityService).toContain('action: "quality"');
  expect(profileService).toContain('action: "profile"');
  expect(workspace).toContain("data-refresh-fsdb-quality");
  expect(workspace).toContain("data-open-fsdb-profile");
  expect(workspace).toContain("data-load-fsdb-profile");
  expect(workspace).toContain("footballScienceDbProfileService.getCacheEntry(record)");
  expect(workspace).toContain("scoutingApiProfileService.hydrateDetails(recordId)");
  expect(workspace).not.toContain("scoutingProfileApiCache");
  expect(workspace).toContain("Source enrichment profile");
  expect(workspace).toContain("Source enrichment linked");
  expect(workspace).toContain("Roster history");
  expect(workspace).toContain("Season stats");
  expect(workspace).toContain("Spider stays locked until trusted stats exist");
});

test("Scouting database loader resets stale source promises before FSDB loads", () => {
  const workspace = readFileSync(resolve(projectRoot, "scouting-workspace.js"), "utf8");
  const loader = readFileSync(resolve(projectRoot, "src/modules/scouting/scouting-database-loader.mjs"), "utf8");
  const client = readFileSync(resolve(projectRoot, "src/modules/scouting/scouting-football-science-db-client.mjs"), "utf8");

  expect(workspace).toContain("createScoutingDatabaseLoader");
  expect(loader).toContain('let activeLoadSource = "";');
  expect(loader).toContain("activeLoadSource !== filters.source");
  expect(loader).toContain("activeLoadPromise === loadPromise");
  expect(loader).toContain('activeLoadSource = "";');
  expect(client).toContain("Football Science DB requires an authenticated session.");
  expect(workspace).toContain("requestScoutingSignIn");
  expect(workspace).toContain('signOut({ scope: "local" })');
  expect(workspace).toContain("window.location.reload()");
});

test("Football Science DB retries once with a refreshed auth token after server 401", () => {
  const workspace = readFileSync(resolve(projectRoot, "scouting-workspace.js"), "utf8");
  const client = readFileSync(resolve(projectRoot, "src/modules/scouting/scouting-football-science-db-client.mjs"), "utf8");
  const app = readFileSync(resolve(projectRoot, "index.html"), "utf8");

  expect(app).toContain("refreshAccessToken,");
  expect(app).toContain("getSupabaseClient");
  expect(workspace).toContain("createFootballScienceDbApiClient");
  expect(workspace).toContain("getAccessToken: getScoutingApiAccessToken");
  expect(workspace).toContain("getScoutingApiAccessToken(options = {})");
  expect(workspace).toContain("options.forceRefresh");
  expect(client).toContain("getAccessToken({ forceRefresh: attempt > 0 })");
  expect(client).toContain("response.status === 401 && attempt === 0");
  expect(workspace).toContain("requestScoutingSignIn");
  expect(workspace).toContain('signOut({ scope: "local" })');
  expect(workspace).toContain("window.location.reload()");
});

test("Scouting API auth preserves long Supabase access tokens", () => {
  const workspace = readFileSync(resolve(projectRoot, "scouting-workspace.js"), "utf8");

  expect(workspace).toContain("SCOUTING_API_ACCESS_TOKEN_MAX_LENGTH = 6000");
  expect(workspace).toContain("normalizeScoutingApiAccessToken");
  expect(workspace).toContain("normalizeScoutingApiAccessToken(await authStore.getAccessToken())");
  expect(workspace).toContain("normalizeScoutingApiAccessToken(await authStore.refreshAccessToken())");
  expect(workspace).not.toContain("normalizeScoutingText(await authStore.getAccessToken(), 2400)");
  expect(workspace).not.toContain("normalizeScoutingText(await authStore.refreshAccessToken(), 2400)");
});

test("Every Scouting reader role can read source enrichment", () => {
  const scoutingReadRoles = permissionMatrix.platformPermissionMatrixByModule.scouting.permissions.read;
  const fsdbReadRoles = permissionMatrix.platformPermissionMatrixByModule["football-science-db"].permissions.read;

  for (const role of scoutingReadRoles) {
    expect(fsdbReadRoles, role).toContain(role);
    expect(fsdb.canReadFootballScienceDb({ role }), role).toBe(true);
  }
});

test("Scouting imports promote source rows onto existing master players", () => {
  const record = [];
  record[1] = "A. Example";
  record[10] = "Norway";
  record[15] = "external-source";
  record[16] = "external-ada";
  record[19] = "external-ada";
  record[20] = { identityCandidates: [{ key: "sourcePlayerId", value: "external-ada" }] };
  record[22] = "2001-04-12";

  const resolved = scoutingDatabase._private.applyScoutingMasterIdentity(record, {
    player_identity_key: "master-ada-example",
    source_player_id: "master-ada-example",
    canonical_name: "Ada Lovelace Example",
    date_of_birth: "2001-04-12",
    passport_country: "Norway",
    metadata: {},
  });

  expect(resolved[1]).toBe("Ada Lovelace Example");
  expect(resolved[16]).toBe("master-ada-example");
  expect(resolved[19]).toBe("master-ada-example");
  expect(resolved[20].originalPlayerIdentityId).toBe("external-ada");
  expect(resolved[20].identityResolution).toBe("existing-scouting-player");
  expect(scoutingDatabase._private.preferScoutingCanonicalName("A. Example", "Ada Lovelace Example")).toBe("Ada Lovelace Example");
});

test("Scouting imports merge exact same player names across season sources", () => {
  const record = [];
  record[1] = "J. Rybrink";
  record[2] = "Tottenham Hotspur";
  record[4] = "England WSL";
  record[5] = "2026";
  record[10] = "Sweden";
  record[11] = "Sweden";
  record[15] = "season-file";
  record[16] = "tottenham-rybrink-2026";
  record[19] = "tottenham-rybrink-2026";

  const masterPlayer = {
    id: "11111111-1111-4111-8111-111111111111",
    player_identity_key: "master-j-rybrink",
    source_player_id: "master-j-rybrink",
    canonical_name: "J. Rybrink",
    sort_name: "j rybrink",
    birth_country: "Sweden",
    passport_country: "Sweden",
    metadata: {},
  };

  expect(scoutingDatabase._private.isExactNameScoutingPlayerMatch(record, masterPlayer)).toBe(true);

  const resolved = scoutingDatabase._private.applyScoutingMasterIdentity(record, masterPlayer);
  expect(resolved[1]).toBe("J. Rybrink");
  expect(resolved[16]).toBe("master-j-rybrink");
  expect(resolved[19]).toBe("master-j-rybrink");
  expect(resolved[20]).toMatchObject({
    originalPlayerIdentityId: "tottenham-rybrink-2026",
    resolvedPlayerIdentityId: "master-j-rybrink",
    identityResolution: "existing-scouting-player",
  });
});

test("Scouting exact-name dedupe refuses known identity conflicts", () => {
  const record = [];
  record[1] = "J. Rybrink";
  record[10] = "Sweden";
  record[11] = "Sweden";
  record[22] = "1998-01-01";

  expect(
    scoutingDatabase._private.isExactNameScoutingPlayerMatch(record, {
      canonical_name: "J. Rybrink",
      sort_name: "j rybrink",
      passport_country: "Norway",
      date_of_birth: "1998-01-01",
    })
  ).toBe(false);

  expect(
    scoutingDatabase._private.isExactNameScoutingPlayerMatch(record, {
      canonical_name: "J. Rybrink",
      sort_name: "j rybrink",
      passport_country: "Sweden",
      date_of_birth: "1999-01-01",
    })
  ).toBe(false);
});

test("Scouting worker dedupe shows the latest season card unless a season is selected", () => {
  const worker = loadScoutingWorkerSandbox();

  const youngerOlderSeason = [
    "younger-older-season",
    "Ada Example",
    "North Carolina Courage",
    "North Carolina Courage",
    "NWSL",
    "2024",
    "CF",
    24,
    18,
    1600,
    "United States",
    "United States",
    170,
    62,
    [],
  ];
  const olderNewerSeason = [
    "older-newer-season",
    "Ada Example",
    "North Carolina Courage",
    "North Carolina Courage",
    "NWSL",
    "2025",
    "CF",
    25,
    20,
    1900,
    "United States",
    "United States",
    170,
    62,
    [],
  ];

  const dedupedByAge = worker.dedupeScoutingPlayerRecords([youngerOlderSeason, olderNewerSeason], {
    season: "all",
    sortMetricId: "age",
  });
  expect(dedupedByAge).toHaveLength(1);
  expect(dedupedByAge[0][0]).toBe("older-newer-season");
  expect(dedupedByAge[0][20].mergedSeasonRecords.map((row) => row[0])).toEqual([
    "older-newer-season",
    "younger-older-season",
  ]);

  const dedupedBySeason = worker.dedupeScoutingPlayerRecords([youngerOlderSeason, olderNewerSeason], {
    season: "2024",
    sortMetricId: "age",
  });
  expect(dedupedBySeason).toHaveLength(1);
  expect(dedupedBySeason[0][0]).toBe("younger-older-season");
  expect(dedupedBySeason[0][20].mergedSeasonRecords.map((row) => row[0])).toEqual([
    "older-newer-season",
    "younger-older-season",
  ]);
});

test("Scouting duplicate repair plans move seasons to one master player", () => {
  const primaryId = "11111111-1111-4111-8111-111111111111";
  const duplicateId = "22222222-2222-4222-8222-222222222222";
  const group = [
    {
      id: primaryId,
      canonical_name: "J. Rybrink",
      sort_name: "j rybrink",
      player_identity_key: "master-j-rybrink",
      source_player_id: "master-j-rybrink",
      passport_country: "Sweden",
      source_aliases: ["hacken-rybrink"],
      external_refs: {},
      metadata: {},
      status: "active",
      updated_at: "2026-05-17T12:00:00.000Z",
    },
    {
      id: duplicateId,
      canonical_name: "J. Rybrink",
      sort_name: "j rybrink",
      player_identity_key: "tottenham-rybrink",
      source_player_id: "tottenham-rybrink",
      passport_country: "Sweden",
      source_aliases: ["tottenham-rybrink"],
      external_refs: {},
      metadata: {},
      status: "active",
      updated_at: "2026-05-18T12:00:00.000Z",
    },
  ];
  const grouped = scoutingDatabase._private.groupExactNameDuplicatePlayers(group);
  expect(grouped).toHaveLength(1);

  const plan = scoutingDatabase._private.buildScoutingPlayerMergePlan(group, [
    { id: "season-1", player_id: primaryId },
    { id: "season-2", player_id: duplicateId },
    { id: "season-3", player_id: duplicateId },
  ], { now: "2026-05-18T00:00:00.000Z" });

  expect(plan.primary.id).toBe(duplicateId);
  expect(plan.seasonPatch).toMatchObject({
    player_id: duplicateId,
    player_identity_key: "tottenham-rybrink",
    source_player_id: "tottenham-rybrink",
    player_name: "J. Rybrink",
  });
  expect(plan.seasonMoves).toEqual(["season-1"]);
  expect(plan.primaryPatch.source_aliases).toEqual(expect.arrayContaining(["hacken-rybrink", "tottenham-rybrink"]));
  expect(plan.duplicatePatches[0]).toMatchObject({
    id: primaryId,
    patch: {
      status: "archived",
      metadata: {
        duplicateOfPlayerId: duplicateId,
        duplicateMergeReason: "exact-name",
      },
    },
  });
});

test("Scouting bridge exposes safe FSDB identity helpers for server linking", () => {
  expect(typeof fsdb.fetchFootballScienceProfileForScoutingRecord).toBe("function");
  expect(fsdb.normalizePersonNameForMatch("Álex Morgan")).toBe("alex morgan");
  expect(fsdb.buildStrongPlayerDedupeKey({
    name: "Alex Morgan",
    dateOfBirth: "1989-07-02",
    nationality: "United States",
    genderSegment: "women",
  })).toContain("name:alex morgan");
});
