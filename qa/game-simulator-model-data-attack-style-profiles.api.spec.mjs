import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  attackStylePresets,
  getAttackStyleRhythmProfile,
  possessionRhythmByAttackStyle,
  possessionRhythmDefaults,
} from "../src/modules/game-simulator/model-data-attack-style-profiles.mjs";
import * as modelData from "../src/modules/game-simulator/model-data.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("game simulator model data attack style profiles expose moved contracts", () => {
  expect(attackStylePresets.balanced.label).toBe("Balanced");
  expect(attackStylePresets["route-one"].routeOneBias).toBeGreaterThan(0.9);
  expect(attackStylePresets["control-possession"].shortSupport).toBeGreaterThan(0.9);
  expect(possessionRhythmDefaults.targetSeconds).toBeGreaterThan(8);
  expect(possessionRhythmByAttackStyle["direct-transition"].targetSeconds).toBeLessThan(possessionRhythmByAttackStyle.balanced.targetSeconds);
  expect(getAttackStyleRhythmProfile("route-one").progressionUrgency).toBeGreaterThan(0.9);
  expect(getAttackStyleRhythmProfile("missing-style").targetSeconds).toBe(possessionRhythmByAttackStyle.balanced.targetSeconds);
});

test("game simulator model data facade keeps attack style profile imports stable", () => {
  const modelDataSource = readProjectFile("src/modules/game-simulator/model-data.mjs");
  const attackProfilesSource = readProjectFile("src/modules/game-simulator/model-data-attack-style-profiles.mjs");

  expect(modelDataSource).toContain('from "./model-data-attack-style-profiles.mjs"');
  expect(attackProfilesSource).toContain("export const attackStylePresets");
  expect(attackProfilesSource).toContain("export function getAttackStyleRhythmProfile");
  expect(modelData.attackStylePresets).toBe(attackStylePresets);
  expect(modelData.possessionRhythmDefaults).toBe(possessionRhythmDefaults);
  expect(modelData.possessionRhythmByAttackStyle).toBe(possessionRhythmByAttackStyle);
  expect(modelData.getAttackStyleRhythmProfile).toBe(getAttackStyleRhythmProfile);
});
