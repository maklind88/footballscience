import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formationMagnetLabels,
  gameRoleProfiles,
  intelligenceLabelBoosts,
  intelligenceRoleArchetypes,
  playerTendencyTemplates,
  sprintRoleArchetypes,
} from "../src/modules/game-simulator/model-data-player-profiles.mjs";
import * as modelData from "../src/modules/game-simulator/model-data.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("game simulator model data player profiles expose moved contracts", () => {
  const holdingMidfielder = intelligenceRoleArchetypes.find((archetype) => archetype.key === "holding-midfielder");
  const wingerSprint = sprintRoleArchetypes.find((archetype) => archetype.key === "winger");

  expect(holdingMidfielder?.test("Holding Midfielder", "6")).toBe(true);
  expect(holdingMidfielder?.baseIntelligence).toBeGreaterThan(80);
  expect(wingerSprint?.test("Left Winger", "LW")).toBe(true);
  expect(wingerSprint?.maxSpeedFactor).toBeGreaterThan(1);
  expect(playerTendencyTemplates["pass-and-move"].passAndMove).toBeGreaterThan(0.8);
  expect(gameRoleProfiles.striker.strengths.finisher).toBeGreaterThan(0.1);
  expect(intelligenceLabelBoosts["10"]).toBe(2);
  expect(formationMagnetLabels["4-3-3"]).toEqual(["GK", "LB", "CB", "CB", "RB", "6", "8", "10", "W", "9", "W"]);
});

test("game simulator model data facade keeps player profile imports stable", () => {
  const modelDataSource = readProjectFile("src/modules/game-simulator/model-data.mjs");
  const playerProfilesSource = readProjectFile("src/modules/game-simulator/model-data-player-profiles.mjs");

  expect(modelDataSource).toContain('from "./model-data-player-profiles.mjs"');
  expect(playerProfilesSource).toContain("export const intelligenceRoleArchetypes");
  expect(playerProfilesSource).toContain("export const formationMagnetLabels");
  expect(modelData.intelligenceRoleArchetypes).toBe(intelligenceRoleArchetypes);
  expect(modelData.sprintRoleArchetypes).toBe(sprintRoleArchetypes);
  expect(modelData.playerTendencyTemplates).toBe(playerTendencyTemplates);
  expect(modelData.gameRoleProfiles).toBe(gameRoleProfiles);
  expect(modelData.intelligenceLabelBoosts).toBe(intelligenceLabelBoosts);
  expect(modelData.formationMagnetLabels).toBe(formationMagnetLabels);
});
