import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defenseStylePresets,
  defensiveAggressionPresets,
  defensivePhaseProfiles,
} from "../src/modules/game-simulator/model-data-defense-style-profiles.mjs";
import * as modelData from "../src/modules/game-simulator/model-data.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("game simulator model data defense style profiles expose moved contracts", () => {
  expect(defenseStylePresets["balanced-block"].preferredPhase).toBe("balanced");
  expect(defenseStylePresets["high-press"].pressingIntensity).toBeGreaterThan(0.8);
  expect(defenseStylePresets["park-the-bus"].lineHeightOffset).toBeLessThan(-10);
  expect(defensivePhaseProfiles.lowBlock.targetBlockHeight).toBe(26);
  expect(defensivePhaseProfiles.boxDefending.gkDepthMax).toBeLessThan(defensivePhaseProfiles.midBlock.gkDepthMax);
  expect(defensiveAggressionPresets.aggressive.reachMultiplier).toBeGreaterThan(defensiveAggressionPresets.conservative.reachMultiplier);
});

test("game simulator model data facade keeps defense style profile imports stable", () => {
  const modelDataSource = readProjectFile("src/modules/game-simulator/model-data.mjs");
  const defenseProfilesSource = readProjectFile("src/modules/game-simulator/model-data-defense-style-profiles.mjs");

  expect(modelDataSource).toContain('from "./model-data-defense-style-profiles.mjs"');
  expect(defenseProfilesSource).toContain("export const defenseStylePresets");
  expect(defenseProfilesSource).toContain("export const defensivePhaseProfiles");
  expect(defenseProfilesSource).toContain("export const defensiveAggressionPresets");
  expect(modelData.defenseStylePresets).toBe(defenseStylePresets);
  expect(modelData.defensivePhaseProfiles).toBe(defensivePhaseProfiles);
  expect(modelData.defensiveAggressionPresets).toBe(defensiveAggressionPresets);
});
