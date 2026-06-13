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

test("Scouting database keeps source enrichment behind one visual player database", () => {
  const workspace = readFileSync(resolve(projectRoot, "scouting-workspace.js"), "utf8");
  const client = readFileSync(resolve(projectRoot, "src/modules/scouting/scouting-football-science-db-client.mjs"), "utf8");
  const profileService = readFileSync(resolve(projectRoot, "src/modules/scouting/scouting-football-science-db-profile-service.mjs"), "utf8");
  const qualityService = readFileSync(resolve(projectRoot, "src/modules/scouting/scouting-football-science-db-quality-service.mjs"), "utf8");

  expect(workspace).toContain("createFootballScienceDbApiClient");
  expect(workspace).toContain("createScoutingApiProfileService");
  expect(workspace).toContain("createFootballScienceDbProfileService");
  expect(workspace).toContain("createFootballScienceDbQualityService");
  expect(client).toContain("/api/football-science-db");
  expect(workspace).toContain("footballSciencePlayerToScoutingRecord");
  expect(workspace).toContain("createFootballScienceDbScoutingAdapter");
  expect(workspace).toContain("createFootballScienceDbScoutingModels");
  expect(workspace).toContain("SCOUTING_STANDALONE_FSDB_DATABASE_ENABLED = false");
  expect(workspace).toContain("createScoutingDatabaseSourcePolicy");
  expect(workspace).toContain("scoutingDatabaseSourcePolicy.normalizeFilterSource(filters.source)");
  expect(workspace).toContain("renderScoutingProfileOverviewPanelShell");
  expect(workspace).toContain("return renderScoutingFootballScienceDbPanel(record);");
  expect(workspace).toContain("data-scouting-profile-fsdb-panel");
  expect(workspace).not.toContain('data-scouting-load-fsdb');
  expect(workspace).not.toContain("data-fsdb-gender-segment");
  expect(workspace).toContain("fsdbGenderSegment");
  expect(workspace).toContain("genderSegment: filters.fsdbGenderSegment");
  expect(workspace).not.toContain("Choose Football Science DB segment");
  expect(workspace).toContain('data-scouting-page-cursor');
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
