import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const fsdb = require("../api/_lib/football-science-db.js");
const permissionMatrix = require("../src/core/permission-matrix.cjs");
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

test("Scouting database view can search Football Science DB through the server API", () => {
  const workspace = readFileSync(resolve(projectRoot, "scouting-workspace.js"), "utf8");

  expect(workspace).toContain("/api/football-science-db");
  expect(workspace).toContain("footballSciencePlayerToScoutingRecord");
  expect(workspace).toContain('source: "fsdb"');
  expect(workspace).toContain('data-scouting-load-fsdb');
  expect(workspace).toContain('data-scouting-page-cursor');
  expect(workspace).toContain("renderScoutingFootballScienceDbPanel");
  expect(workspace).toContain("renderFootballScienceDbQualityPanel");
  expect(workspace).toContain('action: "quality"');
  expect(workspace).toContain('action: "profile"');
  expect(workspace).toContain("data-refresh-fsdb-quality");
  expect(workspace).toContain("data-open-fsdb-profile");
  expect(workspace).toContain("data-load-fsdb-profile");
  expect(workspace).toContain("scoutingFootballScienceDbProfileCache");
  expect(workspace).toContain("Football Science DB profile");
  expect(workspace).toContain("Roster history");
  expect(workspace).toContain("Season stats");
  expect(workspace).toContain("Spider stays locked until trusted stats exist");
  expect(workspace).toContain('class="scouting-secondary-button" data-scouting-load-fsdb');
});

test("Scouting database loader resets stale source promises before FSDB loads", () => {
  const workspace = readFileSync(resolve(projectRoot, "scouting-workspace.js"), "utf8");

  expect(workspace).toContain('let scoutingDatabaseLoadSource = "";');
  expect(workspace).toContain("scoutingDatabaseLoadSource !== filters.source");
  expect(workspace).toContain("scoutingDatabaseLoadPromise === loadPromise");
  expect(workspace).toContain('scoutingDatabaseLoadSource = "";');
  expect(workspace).toContain("Football Science DB needs an active session");
  expect(workspace).toContain("data-scouting-sign-in");
  expect(workspace).toContain("Sign in again");
});

test("Football Science DB retries once with a refreshed auth token after server 401", () => {
  const workspace = readFileSync(resolve(projectRoot, "scouting-workspace.js"), "utf8");
  const app = readFileSync(resolve(projectRoot, "index.html"), "utf8");

  expect(app).toContain("refreshAccessToken,");
  expect(app).toContain("getSupabaseClient");
  expect(workspace).toContain("getScoutingApiAccessToken(options = {})");
  expect(workspace).toContain("options.forceRefresh");
  expect(workspace).toContain("getScoutingApiAccessToken({ forceRefresh: attempt > 0 })");
  expect(workspace).toContain("response.status === 401 && attempt === 0");
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

test("Every Scouting reader role can read Football Science DB", () => {
  const scoutingReadRoles = permissionMatrix.platformPermissionMatrixByModule.scouting.permissions.read;
  const fsdbReadRoles = permissionMatrix.platformPermissionMatrixByModule["football-science-db"].permissions.read;

  for (const role of scoutingReadRoles) {
    expect(fsdbReadRoles, role).toContain(role);
    expect(fsdb.canReadFootballScienceDb({ role }), role).toBe(true);
  }
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
