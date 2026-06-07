import { expect, test } from "@playwright/test";
import {
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
