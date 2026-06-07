import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
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
});

test("Squad player profile helpers are extracted from app.js and tracked by module contracts", () => {
  [
    "src/modules/squad/player-profile-age-helpers.mjs",
    "src/modules/squad/player-profile-helpers.mjs",
  ].forEach((path) => {
    expect(existsSync(resolve(root, path)), `${path} should exist`).toBe(true);
  });

  const appSource = readProjectFile("app.js");
  const packageJson = readProjectFile("package.json");
  const squadContract = moduleStandardRegistry.get("player-profiles");
  expect(appSource).toContain("createPlayerProfileHelpers");
  expect(appSource).not.toContain("function normalizePlayerProfile(");
  expect(appSource).not.toContain("function validatePlayerProfileFormValues(");
  expect(packageJson).toContain("src/modules/squad/player-profile-age-helpers.mjs");
  expect(packageJson).toContain("src/modules/squad/player-profile-helpers.mjs");
  expect(squadContract.currentFiles).toContain("src/modules/squad/player-profile-age-helpers.mjs");
  expect(squadContract.currentFiles).toContain("src/modules/squad/player-profile-helpers.mjs");
});
