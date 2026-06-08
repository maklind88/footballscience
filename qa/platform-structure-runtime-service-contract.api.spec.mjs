import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPlatformStructureRuntimeService } from "../src/modules/platform/platform-structure-runtime-service.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRuntimeSource = fs.readFileSync(path.join(repoRoot, "app-runtime.js"), "utf8");
const platformRuntimeAccessorsSource = fs.readFileSync(
  path.join(repoRoot, "src/core/platform-runtime-accessors.mjs"),
  "utf8"
);
const serviceSource = fs.readFileSync(
  path.join(repoRoot, "src/modules/platform/platform-structure-runtime-service.mjs"),
  "utf8"
);

function createMemoryWindow() {
  const store = new Map();
  return {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => {
        store.set(key, String(value));
      },
      removeItem: (key) => {
        store.delete(key);
      },
    },
  };
}

function createService(options = {}) {
  return createPlatformStructureRuntimeService({
    window: createMemoryWindow(),
    storageKey: "football-platform-structure-test",
    defaultRoles: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"],
    managementRoleSet: new Set(["admin", "club-admin", "team-admin"]),
    defaultClubId: "club-north-carolina-courage",
    defaultTeamId: "team-north-carolina-courage",
    defaultClubName: "North Carolina Courage",
    defaultClubShortName: "NCC",
    defaultTeamName: "North Carolina Courage",
    defaultTeamLevel: "First Team",
    legacyValues: new Set(["football science live", "club-football-science-live", "team-football-science-live", "fsl"]),
    canonicalClubValues: new Set(["north carolina courage", "club-north-carolina-courage", "ncc"]),
    canonicalTeamValues: new Set(["north carolina courage", "team-north-carolina-courage", "first team", "ncc"]),
    getPlatformTeamLogoUrl: (team = {}) => String(team.logoUrl || team.logo_url || "").trim(),
    logEvent: () => {},
    ...options,
  });
}

test("Platform structure runtime owns structure and admin scope bodies outside app-runtime", () => {
  expect(appRuntimeSource).toContain("createPlatformStructureRuntimeService({");
  expect(appRuntimeSource).toContain("platform-runtime-accessors.mjs");
  expect(appRuntimeSource).toContain("platformStructureRuntimeService,");
  expect(platformRuntimeAccessorsSource).toContain("syncPlatformStructureWithUsers");
  expect(platformRuntimeAccessorsSource).toContain('callAccessorSource("platformStructureRuntimeService", "syncPlatformStructureWithUsers"');
  expect(platformRuntimeAccessorsSource).toContain('callAccessorSource("platformStructureRuntimeService", "normalizeAdminUserSubmissionValues"');
  expect(appRuntimeSource).not.toContain("const platformStructureStateHelpers = createPlatformStructureStateHelpers({");
  expect(appRuntimeSource).not.toContain("function syncPlatformStructureWithUsers(users = getPlatformUsers()) {");
  expect(appRuntimeSource).not.toContain("function normalizeAdminUserSubmissionValues(values = {}, actor = getCurrentPlatformUser()");
  expect(appRuntimeSource).not.toContain("function syncPlatformStructureWithUsers(...args)");
  expect(appRuntimeSource).not.toContain("function normalizeAdminUserSubmissionValues(...args)");

  expect(serviceSource).toContain("createPlatformStructureStateHelpers({");
  expect(serviceSource).toContain("function syncPlatformStructureWithUsers(users = getPlatformUsers()) {");
  expect(serviceSource).toContain("function canAdminManageUser(actor, targetUser");
  expect(serviceSource).toContain("function normalizeAdminUserSubmissionValues(values = {}, actor = getCurrentPlatformUser()");
});

test("Platform structure runtime preserves club, team, and scope normalization", () => {
  const service = createService();
  const state = service.syncPlatformStructureWithUsers([
    { id: "club-admin-1", role: "club-admin", clubName: "Academy", teamName: "U19" },
    { id: "team-admin-1", role: "team-admin", clubName: "Academy", teamName: "U21" },
    { id: "legacy-1", role: "coach", clubName: "Football Science Live", teamName: "Football Science Live" },
  ]);

  expect(state.clubs.map((club) => club.name)).toEqual(expect.arrayContaining(["North Carolina Courage", "Academy"]));
  expect(state.teams.map((team) => team.name)).toEqual(expect.arrayContaining(["North Carolina Courage", "U19", "U21"]));
  expect(service.getUserClubId({ clubName: "Football Science Live" }, state)).toBe("club-north-carolina-courage");
  expect(service.getUserTeamId({ teamName: "Football Science Live" }, state)).toBe("team-north-carolina-courage");
  expect(service.getUserTeamName({ teamName: "U19" }, state)).toBe("U19");
  expect(service.getUserScopeLabel({ clubName: "Academy", teamName: "U19" }, state)).toBe("Academy · U19");
});

test("Platform structure runtime preserves admin view and manage permission rules", () => {
  const service = createService();
  const structure = service.normalizePlatformStructureState({
    clubs: [
      { id: "club-a", name: "Club A", shortName: "A" },
      { id: "club-b", name: "Club B", shortName: "B" },
    ],
    teams: [
      { id: "team-a", clubId: "club-a", name: "Team A", shortName: "A" },
      { id: "team-b", clubId: "club-b", name: "Team B", shortName: "B" },
    ],
  });
  const platformAdmin = { id: "admin-1", role: "admin", teamId: "team-a", clubId: "club-a" };
  const clubAdmin = { id: "club-admin-1", role: "club-admin", teamId: "team-a", clubId: "club-a" };
  const teamAdmin = { id: "team-admin-1", role: "team-admin", teamId: "team-a", clubId: "club-a" };
  const sameTeamCoach = { id: "coach-1", role: "coach", teamId: "team-a", clubId: "club-a", status: "active" };
  const otherTeamCoach = { id: "coach-2", role: "coach", teamId: "team-b", clubId: "club-b", status: "active" };

  expect(service.canAdminViewUser(platformAdmin, otherTeamCoach, structure)).toBe(true);
  expect(service.canAdminManageUser(platformAdmin, otherTeamCoach, structure)).toBe(true);
  expect(service.canAdminManageUser(platformAdmin, platformAdmin, structure, { remove: true })).toBe(false);
  expect(service.canAdminViewUser(clubAdmin, sameTeamCoach, structure)).toBe(true);
  expect(service.canAdminManageUser(clubAdmin, sameTeamCoach, structure)).toBe(true);
  expect(service.canAdminManageUser(clubAdmin, platformAdmin, structure)).toBe(false);
  expect(service.canAdminViewUser(teamAdmin, sameTeamCoach, structure)).toBe(true);
  expect(service.canAdminManageUser(teamAdmin, sameTeamCoach, structure)).toBe(true);
  expect(service.canAdminViewUser(teamAdmin, otherTeamCoach, structure)).toBe(false);
  expect(service.canAdminManageUser(teamAdmin, clubAdmin, structure)).toBe(false);
});

test("Platform structure runtime preserves admin submission clamping", () => {
  const service = createService();
  const structure = service.normalizePlatformStructureState({
    clubs: [{ id: "club-a", name: "Club A", shortName: "A" }],
    teams: [{ id: "team-a", clubId: "club-a", name: "Team A", shortName: "A" }],
  });
  const teamAdmin = { id: "team-admin-1", role: "team-admin", teamId: "team-a", clubId: "club-a" };
  const submitted = service.normalizeAdminUserSubmissionValues(
    { role: "admin", status: "paused", teamId: "team-a" },
    teamAdmin,
    null,
    structure
  );

  expect(submitted.role).toBe("coach");
  expect(submitted.status).toBe("paused");
  expect(submitted.clubId).toBe("club-a");
  expect(submitted.teamId).toBe("team-a");
  expect(submitted.team).toBe("Team A");
});
