import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  createPlayerProfileIntelligenceHelpers,
  createPlayerProfileHelpers,
  playerProfileAttributeGroups,
  playerProfileChangeFieldDefinitions,
  playerProfileRoleOptions,
  playerProfileRosterFilterOptions,
  playerProfileRosterTypeAliases,
  playerProfileRosterTypeOptions,
  playerProfileStatusOptions,
  playerProfileTabOptions,
  playerRoleDnaDefinitions,
  squadFormationOptions,
} from "../src/modules/squad/index.mjs";
import { moduleStandardRegistry } from "../src/core/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("Squad player profile options expose stable defaults", () => {
  expect(playerProfileRoleOptions).toContain("GK");
  expect(playerProfileRoleOptions).toContain("8");
  expect(squadFormationOptions.find((formation) => formation.key === "4-3-3")?.slots).toHaveLength(11);
  expect(playerRoleDnaDefinitions["8"].weights).toHaveProperty("tactical");
  expect(playerProfileRosterTypeAliases["trial-player"]).toBe("trialist");
  expect(playerProfileRosterTypeOptions.find((option) => option.key === "squad")?.countsInSquad).toBe(true);
  expect(playerProfileRosterFilterOptions[0].key).toBe("all");
  expect(playerProfileStatusOptions.find((option) => option.key === "available")?.tone).toBe("available");
  expect(playerProfileAttributeGroups.map((group) => group.key)).toEqual(["technical", "tactical", "physical", "mental"]);
  expect(playerProfileTabOptions.map((tab) => tab.key)).toContain("history");
  expect(playerProfileChangeFieldDefinitions.find((field) => field.key === "idp.status")?.options).toBeTruthy();
});

test("Squad player profile helpers own normalization, validation, and display contracts", () => {
  const cachedEntries = new Map([
    ["p1", { signature: "p1|mak player|9|midfielder", birthDate: "2000-05-10", age: "", checkedAt: "2026-05-01T10:00:00.000Z" }],
  ]);
  let idCounter = 0;
  const helpers = createPlayerProfileHelpers({
    changeLogLimit: 2,
    comparePlayers: (first, second) => String(first.name || "").localeCompare(String(second.name || "")),
    createId: (prefix) => `${prefix}-${++idCounter}`,
    getAgeCacheEntry: (player) => cachedEntries.get(player.id) || null,
    getNow: () => "2026-05-01T10:00:00.000Z",
    isDateValue: (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")),
  });

  expect(helpers.normalizePlayerProfileRosterType("trial-player")).toBe("trialist");
  expect(helpers.getPlayerProfileRosterLabel({ rosterType: "guest", temporaryGroup: "Academy" })).toBe("Guest / Academy");
  expect(helpers.isPlayerProfileTemporaryActiveOnDate({ rosterType: "academy", temporaryFrom: "2026-05-01", temporaryTo: "2026-05-07" }, "2026-05-08")).toBe(false);
  expect(helpers.getPlayerProfileDisplayAgeValue({ id: "p1", name: "Mak Player", number: "9", position: "Midfielder" }, new Date("2026-06-01T00:00:00Z"))).toBe("26");

  const normalized = helpers.normalizePlayerProfile({
    name: "  Mak Player ",
    position: "Midfielder",
    primaryRole: "8",
    secondaryRoles: "8,10,RW",
    rosterType: "training-guest",
    temporaryFrom: "2026-05-01",
    temporaryTo: "2026-05-07",
    idp: { reviewDate: "2026-06-01" },
  });
  expect(normalized).toMatchObject({
    id: "player-profile-1",
    name: "Mak Player",
    primaryRole: "8",
    roleGroup: "midfielder",
    rosterType: "guest",
    countsInSquad: false,
    secondaryRoles: ["10", "RW"],
  });
  expect(
    helpers.normalizePlayerProfile({
      id: "erin",
      name: "Erin",
      rosterType: "guest",
      countsInSquad: true,
    })
  ).toMatchObject({
    rosterType: "guest",
    countsInSquad: false,
  });
  expect(
    helpers.normalizePlayerProfile({
      id: "legacy-guest",
      name: "Legacy Guest",
      countsInSquad: false,
    })
  ).toMatchObject({
    rosterType: "guest",
    countsInSquad: false,
  });

  expect(
    helpers.validatePlayerProfileFormValues(
      { ...normalized, id: "p2", playerId: "p2", temporaryFrom: "bad-date" },
      { existingPlayers: [normalized], ignorePlayerId: "p2" }
    )
  ).toMatchObject({
    ok: false,
    status: "error",
  });

  expect(helpers.getPlayerProfileChangeDiffs({ primaryRole: "CB" }, { primaryRole: "8" })).toEqual([
    { field: "Primary role", from: "CB", to: "8" },
  ]);
  expect(helpers.normalizePlayerProfileChangeLog([{ id: "1" }, { id: "2" }, { id: "3" }])).toHaveLength(2);
  expect([normalized, { ...normalized, id: "gk", name: "Goalkeeper", primaryRole: "GK", roleGroup: "goalkeeper" }].sort(helpers.comparePlayerProfiles)[0].id).toBe("gk");
  expect(
    [
      { id: "st", name: "Forward", primaryRole: "ST", roleGroup: "forward" },
      { id: "cb", name: "Centre Back", primaryRole: "CB", roleGroup: "defender" },
      { id: "rb", name: "Right Back", primaryRole: "RB", roleGroup: "defender" },
      { id: "cm", name: "Central Midfielder", primaryRole: "8", roleGroup: "midfielder" },
      { id: "rw", name: "Wide Midfielder", primaryRole: "RW", roleGroup: "forward" },
      { id: "gk", name: "Goalkeeper", primaryRole: "GK", roleGroup: "goalkeeper" },
    ]
      .sort(helpers.comparePlayerProfiles)
      .map((player) => player.id)
  ).toEqual(["gk", "rb", "cb", "cm", "rw", "st"]);
});

test("Squad player profile helpers are extracted from app.js and tracked by module contracts", () => {
  [
    "src/modules/squad/player-profile-age-helpers.mjs",
    "src/modules/squad/player-profile-helpers.mjs",
    "src/modules/squad/player-profile-intelligence-helpers.mjs",
    "src/modules/squad/squad-scouting-profile-helpers.mjs",
  ].forEach((path) => {
    expect(existsSync(resolve(root, path)), `${path} should exist`).toBe(true);
  });

  const appSource = readProjectFile("app-runtime.js");
  const composerSource = readProjectFile("src/modules/squad/squad-app-runtime-composer.mjs");
  const packageJson = readProjectFile("package.json");
  const squadContract = moduleStandardRegistry.get("player-profiles");
  expect(appSource).toContain("createSquadAppRuntimeComposition({");
  expect(appSource).not.toContain("createPlayerProfileHelpers({");
  expect(composerSource).toContain("createPlayerProfileHelpers({");
  expect(appSource).not.toContain("function normalizePlayerProfile(");
  expect(appSource).not.toContain("function validatePlayerProfileFormValues(");
  expect(appSource).not.toContain("function getPlayerRoleDnaScore(");
  expect(appSource).not.toContain("function getSquadPlayerDataQualityFlags(");
  expect(appSource).not.toContain("function normalizePlayerProfileScoutingText(");
  expect(appSource).not.toContain("function getPlayerProfileScoutingPercentile(");
  expect(packageJson).toContain("src/modules/squad/player-profile-age-helpers.mjs");
  expect(packageJson).toContain("src/modules/squad/player-profile-helpers.mjs");
  expect(packageJson).toContain("src/modules/squad/player-profile-intelligence-helpers.mjs");
  expect(packageJson).toContain("src/modules/squad/squad-scouting-profile-helpers.mjs");
  expect(squadContract.currentFiles).toContain("src/modules/squad/player-profile-age-helpers.mjs");
  expect(squadContract.currentFiles).toContain("src/modules/squad/player-profile-helpers.mjs");
  expect(squadContract.currentFiles).toContain("src/modules/squad/player-profile-intelligence-helpers.mjs");
  expect(squadContract.currentFiles).toContain("src/modules/squad/squad-scouting-profile-helpers.mjs");
});

test("Squad player profile intelligence helpers own role DNA and data quality scoring", () => {
  const helpers = createPlayerProfileIntelligenceHelpers({
    formatDateValue: (date) => new Date(date).toISOString().slice(0, 10),
    formatMedicalDateLabel: (value) => `date:${value}`,
    getCompleteness: (player) => player.completeness ?? 50,
    getMedicalSnapshot: (playerId) => (playerId === "p1" ? { latestLogSummary: "Managed load" } : null),
    isDateValue: (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")),
    normalizeNumber: (value, fallback = 3) => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.max(1, Math.min(5, Math.round(number))) : fallback;
    },
    normalizeRole: (value, fallback = "8") => playerProfileRoleOptions.includes(String(value || "").toUpperCase()) ? String(value).toUpperCase() : fallback,
    parseDateValue: (value) => new Date(`${value}T00:00:00`),
  });

  const player = {
    id: "p1",
    primaryRole: "8",
    secondaryRoles: ["10"],
    preferredSide: "center",
    status: "available",
    completeness: 82,
    attributeRatings: { technical: 5, tactical: 4, physical: 3, mental: 4 },
    idp: { status: "active", primaryFocus: "Counter press", nextAction: "Review clips", reviewDate: "2026-06-10" },
  };

  expect(helpers.getSquadMatrixCompatibleRoles("8")).toContain("10");
  expect(helpers.getPlayerRoleDnaDefinition("8").label).toContain("8");
  expect(helpers.getPlayerRoleDnaScore(player, "8")).toBeGreaterThan(80);
  expect(helpers.getPlayerRoleDnaBestMatches(player, 2).map((match) => match.role)).toContain("8");
  expect(helpers.getPlayerRoleDnaReasons(player, "8").strengths.length).toBeGreaterThan(0);
  expect(helpers.getPlayerProfileIdpFollowUpLabel(player, { key: "active" })).toContain("Review clips");
  expect(helpers.getSquadPlayerDataQualityFlags(player).map((flag) => flag.key)).not.toContain("profile-complete");
  expect(helpers.getSquadPlayerDataQualityFlags({ id: "p2", attributeRatings: {}, idp: { status: "active" }, completeness: 45 }).map((flag) => flag.key)).toContain("profile-complete");
});
