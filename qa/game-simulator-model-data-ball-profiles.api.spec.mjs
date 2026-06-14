import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  autoBallProfiles,
  autoDribbleProfiles,
} from "../src/modules/game-simulator/model-data-ball-profiles.mjs";
import * as modelData from "../src/modules/game-simulator/model-data.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("game simulator model data ball profiles expose moved contracts", () => {
  expect(autoBallProfiles["firm-feet"].flightStyle).toBe("ground");
  expect(autoBallProfiles.switch.flightStyle).toBe("lofted");
  expect(autoBallProfiles["box-shot"].averageSpeedRange[0]).toBeGreaterThan(14);
  expect(autoBallProfiles.cross.peakHeightRange[1]).toBeGreaterThan(3);
  expect(autoDribbleProfiles["eight-carry"].openSpeed).toBeGreaterThan(autoDribbleProfiles["gk-carry"].openSpeed);
  expect(autoDribbleProfiles["winger-carry"].maxSpeed).toBeGreaterThan(5.5);
  expect(autoDribbleProfiles["striker-carry"].pressurePenalty).toBeGreaterThan(0.2);
});

test("game simulator model data facade keeps ball profile imports stable", () => {
  const modelDataSource = readProjectFile("src/modules/game-simulator/model-data.mjs");
  const ballProfilesSource = readProjectFile("src/modules/game-simulator/model-data-ball-profiles.mjs");

  expect(modelDataSource).toContain('from "./model-data-ball-profiles.mjs"');
  expect(ballProfilesSource).toContain("export const autoBallProfiles");
  expect(ballProfilesSource).toContain("export const autoDribbleProfiles");
  expect(modelData.autoBallProfiles).toBe(autoBallProfiles);
  expect(modelData.autoDribbleProfiles).toBe(autoDribbleProfiles);
});
