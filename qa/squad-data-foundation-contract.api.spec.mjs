import { expect, test } from "@playwright/test";
import { createSquadDataFoundationHelpers } from "../src/modules/squad/index.mjs";

const players = [
  {
    id: "p1",
    name: "Mak Player",
    number: "8",
    position: "CM",
    primaryRole: "8",
    secondaryRoles: ["10"],
    preferredSide: "right",
    roleGroup: "midfield",
    status: "available",
    squadStatus: "important",
    careerPhase: "prime",
    rosterType: "squad",
    countsInSquad: true,
    temporaryGroup: "",
    temporaryFrom: "",
    temporaryTo: "",
    attributeRatings: { passing: 8 },
    idp: { status: "active", primaryFocus: "Scanning", nextAction: "Video", reviewDate: "2026-06-10" },
    futureData: { minutes: "90" },
    coachNotes: "Trusted starter",
    rosterOrder: 1,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-02T10:00:00.000Z",
  },
  {
    id: "p2",
    name: "Review Player",
    number: "22",
    position: "FW",
    primaryRole: "",
    secondaryRoles: [],
    preferredSide: "",
    roleGroup: "",
    status: "available",
    squadStatus: "development",
    rosterType: "guest",
    countsInSquad: false,
  },
];

function createHelpers(downloads = []) {
  return createSquadDataFoundationHelpers({
    ensureState: () => {},
    getPlayers: () => players,
    getStorageKey: () => "football-player-profiles-v1",
    getNow: () => "2026-06-07T12:00:00.000Z",
    getFileDate: () => "2026-06-07",
    getDataQualityFlags: (player) => player.id === "p2" ? [{ key: "role", severity: "critical" }] : [],
    getPlayerCompleteness: (player) => player.id === "p1" ? 90 : 35,
    getRoleOptions: () => ["8", "10"],
    getRoleDnaScore: (_player, role) => role === "8" ? 92 : 71,
    getRoleFitScore: (_player, role) => role === "8" ? 88 : 64,
    getRoleDnaBestMatches: () => [
      { role: "8", score: 92, definition: { label: "Box midfielder" } },
      { role: "10", score: 71, definition: { label: "Creator" } },
    ],
    getMedicalSnapshot: () => ({
      currentAvailability: "available",
      rtpStatus: "clear",
      coachNote: "Full",
      latestLogSummary: "No issue",
      participation: 100,
      medicalStatusKey: "available",
      tone: "available",
      medicalSource: "qa",
      hasActivePlan: false,
      returnDate: "",
      returnDateLabel: "",
      returnLabel: "",
      activeInjuryLabel: "",
    }),
    getEffectiveStatus: () => "available",
    getRosterSummary: (sourcePlayers) => ({
      squadCount: sourcePlayers.filter((player) => player.countsInSquad).length,
      temporaryCount: sourcePlayers.filter((player) => !player.countsInSquad).length,
    }),
    getAttributeGroups: () => [{ key: "technical" }, { key: "physical" }],
    normalizeChangeLog: (entries) => entries,
    getChangeLog: () => [{ id: "change-1", summary: "Updated" }],
    formatDateValue: () => "2026-06-07",
    isMedicalDateValue: (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")),
    downloadTextFile: (filename, contents, type) => {
      downloads.push({ filename, contents, type });
    },
  });
}

test("Squad data foundation builds quality report, payload, and Session Planner contracts", () => {
  const helpers = createHelpers();

  const report = helpers.buildSquadDataQualityReport();
  expect(report.totalFlags).toBe(1);
  expect(report.criticalFlags).toBe(1);
  expect(report.sessionPlannerReady).toBe(1);
  expect(report.reviewPlayers[0].player.id).toBe("p2");

  const payload = helpers.buildSquadDataFoundationPayload();
  expect(payload).toMatchObject({
    schemaVersion: 3,
    module: "player-profiles",
    storageKey: "football-player-profiles-v1",
    dataQuality: {
      totalPlayers: 2,
      squadPlayers: 1,
      temporaryPlayers: 1,
    },
    supabaseReady: {
      primaryKey: "players.id",
      sessionPlannerContract: "sessionPlanner.players.v2",
    },
  });
  expect(payload.schema.attributeRatings).toEqual(["technical", "physical"]);
  expect(payload.players[0].roleDna.scores).toEqual({ 8: 92, 10: 71 });
  expect(payload.sessionPlanner.players[0].bestRoleMatches[0]).toEqual({
    role: "8",
    score: 92,
    label: "Box midfielder",
  });

  const playerContract = helpers.createSessionPlannerPlayerProfileContract(players[0], "2026-06-07");
  expect(playerContract.roleFit).toEqual({ 8: 88, 10: 64 });
  expect(playerContract.medical).toMatchObject({
    availability: "available",
    participation: 100,
    medicalSource: "qa",
  });
});

test("Squad data foundation exports JSON and CSV through the download boundary", () => {
  const downloads = [];
  const helpers = createHelpers(downloads);

  helpers.exportSquadDataFoundationJson();
  helpers.exportSquadSessionPlannerCsv();

  expect(downloads).toHaveLength(2);
  expect(downloads[0]).toMatchObject({
    filename: "football-science-squad-data-2026-06-07.json",
    type: "application/json",
  });
  expect(downloads[0].contents).toContain('"sessionPlannerContract": "sessionPlanner.players.v2"');
  expect(downloads[1]).toMatchObject({
    filename: "football-science-session-planner-contract-2026-06-07.csv",
    type: "text/csv",
  });
  expect(downloads[1].contents).toContain('"id","name","number","primaryRole"');
  expect(downloads[1].contents).toContain('"p1","Mak Player","8","8"');
});
