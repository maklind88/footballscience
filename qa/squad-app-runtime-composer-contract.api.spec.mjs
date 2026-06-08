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
