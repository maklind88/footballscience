import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createSquadAppRuntimeComposition } from "../src/modules/squad/index.mjs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function createComposition() {
  const players = [
    {
      id: "p1",
      name: "Existing Player",
      number: "8",
      position: "CM",
      primaryRole: "8",
      roleGroup: "midfielder",
      rosterType: "squad",
      countsInSquad: true,
      attributeRatings: { technical: 5, tactical: 4, physical: 3, mental: 4 },
      idp: { status: "active", primaryFocus: "Scanning", nextAction: "Video", reviewDate: "2026-06-10" },
    },
  ];
  return createSquadAppRuntimeComposition({
    compareMedicalPlayers: (first = {}, second = {}) => String(first.name || "").localeCompare(String(second.name || "")),
    createDashboardId: (prefix) => `${prefix}-created`,
    ensurePlayerProfilesState: () => {},
    formatMedicalDateLabel: (value) => `date:${value}`,
    formatScheduleDateValue: (value) => String(value || "2026-06-08").slice(0, 10),
    getPlayerProfileAgeCacheEntry: () => null,
    getPlayerProfileCompleteness: (player = {}) => (player.id === "p1" ? 92 : 45),
    getPlayerProfileEffectiveStatusFromSnapshot: () => "available",
    getPlayerProfileMedicalSnapshot: () => ({
      currentAvailability: "available",
      rtpStatus: "clear",
      coachNote: "Full",
      participation: 100,
      medicalStatusKey: "available",
      tone: "available",
      medicalSource: "qa",
    }),
    getPlayerProfilesState: () => ({ players, changeLog: [{ id: "change-1", summary: "Updated" }] }),
    isMedicalDateValue: (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")),
    parseScheduleDateValue: (value) => new Date(`${value}T00:00:00Z`),
    playerProfileAttributeGroups: [{ key: "technical" }, { key: "tactical" }],
    playerProfileChangeLogLimit: 2,
    playerProfileRoleOptions: ["8", "10", "GK"],
    playerProfilesStorageKey: "football-player-profiles-v1",
  });
}

function createCompositionWithDefaultComparator() {
  return createSquadAppRuntimeComposition({
    createDashboardId: (prefix) => `${prefix}-created`,
    ensurePlayerProfilesState: () => {},
    formatMedicalDateLabel: (value) => `date:${value}`,
    formatScheduleDateValue: (value) => String(value || "2026-06-08").slice(0, 10),
    getPlayerProfileAgeCacheEntry: () => null,
    getPlayerProfileCompleteness: () => 75,
    getPlayerProfileEffectiveStatusFromSnapshot: () => "available",
    getPlayerProfileMedicalSnapshot: () => ({
      currentAvailability: "available",
      rtpStatus: "clear",
      coachNote: "Full",
      participation: 100,
      medicalStatusKey: "available",
      tone: "available",
      medicalSource: "qa",
    }),
    getPlayerProfilesState: () => ({ players: [] }),
    isMedicalDateValue: (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")),
    parseScheduleDateValue: (value) => new Date(`${value}T00:00:00Z`),
    playerProfileAttributeGroups: [{ key: "technical" }, { key: "tactical" }],
    playerProfileChangeLogLimit: 2,
    playerProfileRoleOptions: ["GK", "LB", "RB", "CB", "6", "8", "10", "LW", "RW", "ST"],
    playerProfilesStorageKey: "football-player-profiles-v1",
  });
}

test("Squad app runtime composer owns helper wiring outside app-runtime", () => {
  const appSource = readProjectFile("app-runtime.js");
  const composerSource = readProjectFile("src/modules/squad/squad-app-runtime-composer.mjs");
  const indexSource = readProjectFile("src/modules/squad/index.mjs");
  const packageJson = JSON.parse(readProjectFile("package.json"));

  expect(appSource).toContain("createSquadAppRuntimeComposition({");
  expect(appSource).toContain("formatMedicalDateLabel: (...args) => formatMedicalDateLabel(...args)");
  expect(appSource).not.toContain("createPlayerProfileHelpers({");
  expect(appSource).not.toContain("createPlayerProfileIntelligenceHelpers({");
  expect(appSource).not.toContain("createSquadDataFoundationHelpers({");
  expect(appSource).not.toContain("createSquadImportPlanner({");

  expect(composerSource).toContain("createPlayerProfileHelpers({");
  expect(composerSource).toContain("createPlayerProfileIntelligenceHelpers({");
  expect(composerSource).toContain("createSquadDataFoundationHelpers({");
  expect(composerSource).toContain("createSquadImportPlanner({");
  expect(composerSource).not.toMatch(/dashboardChat|DashboardChat|chat-widget/);
  expect(indexSource).toContain('export * from "./squad-app-runtime-composer.mjs";');
  expect(packageJson.scripts.check).toContain("src/modules/squad/squad-app-runtime-composer.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/squad-app-runtime-composer-contract.api.spec.mjs");
});

test("Squad app runtime composer preserves helper, foundation, and import behavior", () => {
  const composition = createComposition();

  const normalized = composition.normalizePlayerProfile({
    name: " New Player ",
    number: "10",
    primaryRole: "10",
    rosterType: "training-guest",
  });
  expect(normalized).toMatchObject({
    name: "New Player",
    primaryRole: "10",
    rosterType: "guest",
    countsInSquad: false,
  });

  const summary = composition.getPlayerProfilesRosterSummary([
    { id: "p1", name: "Existing Player", rosterType: "squad", countsInSquad: true },
    { id: "g1", name: "Guest Player", rosterType: "guest", countsInSquad: false },
  ]);
  expect(summary).toMatchObject({ squadCount: 1, temporaryCount: 1 });

  const payload = composition.buildSquadDataFoundationPayload();
  expect(payload).toMatchObject({
    storageKey: "football-player-profiles-v1",
    sessionPlanner: { players: expect.any(Array) },
  });
  expect(payload.schema.attributeRatings).toEqual(["technical", "tactical"]);
  expect(payload.sessionPlanner.players[0]).toMatchObject({ id: "p1", primaryRole: "8", availability: "available" });

  const plan = composition.buildPlayerProfileImportPlan({
    players: [{ name: "Created Player", number: "11", primaryRole: "8" }],
  });
  expect(plan).toMatchObject({
    ok: true,
    canApply: true,
    createdCount: 1,
    updatedCount: 0,
  });
  expect(plan.nextPlayers[1]).toMatchObject({ id: "player-profile-created", name: "Created Player" });
});

test("Squad app runtime composer sorts roster profiles by squad role order by default", () => {
  const composition = createCompositionWithDefaultComparator();
  const ordered = composition.playerProfileRosterUiSelectors.getVisibleProfiles(
    [
      { id: "rw", name: "Wide Right", primaryRole: "RW", roleGroup: "forward", rosterType: "squad", countsInSquad: true, number: "7", position: "RW" },
      { id: "cm", name: "Central Mid", primaryRole: "8", roleGroup: "midfielder", rosterType: "squad", countsInSquad: true, number: "4", position: "CM" },
      { id: "gk", name: "Keeper", primaryRole: "GK", roleGroup: "goalkeeper", rosterType: "squad", countsInSquad: true, number: "1", position: "GK" },
      { id: "st", name: "Striker", primaryRole: "ST", roleGroup: "forward", rosterType: "squad", countsInSquad: true, number: "9", position: "ST" },
      { id: "rb", name: "Right Back", primaryRole: "RB", roleGroup: "defender", rosterType: "squad", countsInSquad: true, number: "2", position: "RB" },
      { id: "cb", name: "Centre Back", primaryRole: "CB", roleGroup: "defender", rosterType: "squad", countsInSquad: true, number: "5", position: "CB" },
    ],
    {
      roleGroupFilter: "all",
      rosterFilter: "all",
    }
  ).map((player) => player.id);

  expect(ordered).toEqual(["gk", "rb", "cb", "cm", "rw", "st"]);
});

test("Squad app runtime composer keeps unknown-role squad members ordered by name as stable fallback", () => {
  const composition = createCompositionWithDefaultComparator();
  const ordered = composition.playerProfileRosterUiSelectors.getVisibleProfiles(
    [
      { id: "r-two", name: "Zara", primaryRole: "", roleGroup: "forward", rosterType: "squad", countsInSquad: true, number: "99", position: "Striker" },
      { id: "r-one", name: "Adam", primaryRole: "", roleGroup: "forward", rosterType: "squad", countsInSquad: true, number: "11", position: "Striker" },
      { id: "r-three", name: "Mia", primaryRole: "", roleGroup: "forward", rosterType: "squad", countsInSquad: true, number: "2", position: "Striker" },
    ],
    {
      roleGroupFilter: "all",
      rosterFilter: "all",
    }
  ).map((player) => player.id);

  expect(ordered).toEqual(["r-one", "r-three", "r-two"]);
});
