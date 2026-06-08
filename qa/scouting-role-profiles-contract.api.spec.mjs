import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

import {
  scoutingFallbackSpiderProfiles,
  scoutingRoleSpiderProfiles,
} from "../src/modules/scouting/scouting-role-spider-profiles.mjs";
import { scoutingAdditionalRoleSpiderProfiles } from "../src/modules/scouting/scouting-role-additional-profiles.mjs";
import {
  scoutingRoleCategoryById,
  scoutingRoleCategoryProfiles,
  scoutingRoleScoringProfiles,
} from "../src/modules/scouting/scouting-role-scoring-profiles.mjs";

test("Scouting role profile constants live outside scouting-workspace", async () => {
  const workspaceSource = await readFile("scouting-workspace.js", "utf8");
  const spiderSource = await readFile("src/modules/scouting/scouting-role-spider-profiles.mjs", "utf8");
  const additionalSource = await readFile("src/modules/scouting/scouting-role-additional-profiles.mjs", "utf8");
  const scoringSource = await readFile("src/modules/scouting/scouting-role-scoring-profiles.mjs", "utf8");
  const indexSource = await readFile("src/modules/scouting/index.mjs", "utf8");

  expect(workspaceSource).toContain("scouting-role-spider-profiles.mjs");
  expect(workspaceSource).toContain("scouting-role-additional-profiles.mjs");
  expect(workspaceSource).toContain("scouting-role-scoring-profiles.mjs");
  expect(workspaceSource).not.toContain("const scoutingRoleSpiderProfiles = Object.freeze([");
  expect(workspaceSource).not.toContain("const scoutingAdditionalRoleSpiderProfiles = Object.freeze([");
  expect(workspaceSource).not.toContain("const scoutingRoleScoringProfiles = Object.freeze({");

  expect(spiderSource).toContain("export const scoutingRoleSpiderProfiles");
  expect(spiderSource).toContain("export const scoutingFallbackSpiderProfiles");
  expect(additionalSource).toContain("export const scoutingAdditionalRoleSpiderProfiles");
  expect(scoringSource).toContain("export const scoutingRoleCategoryProfiles");
  expect(scoringSource).toContain("export const scoutingRoleCategoryById");
  expect(scoringSource).toContain("export const scoutingRoleScoringProfiles");
  expect(indexSource).toContain('export * from "./scouting-role-spider-profiles.mjs";');
  expect(indexSource).toContain('export * from "./scouting-role-additional-profiles.mjs";');
  expect(indexSource).toContain('export * from "./scouting-role-scoring-profiles.mjs";');

  const joinedSources = [spiderSource, additionalSource, scoringSource].join("\n");
  expect(joinedSources).not.toContain("writeScoutingState");
  expect(joinedSources).not.toContain("sendScoutingApiAction");
  expect(joinedSources).not.toContain("localStorage");
});

test("Scouting role profiles preserve golden-master role metadata", () => {
  expect(Object.isFrozen(scoutingRoleSpiderProfiles)).toBe(true);
  expect(Object.isFrozen(scoutingFallbackSpiderProfiles)).toBe(true);
  expect(Object.isFrozen(scoutingAdditionalRoleSpiderProfiles)).toBe(true);
  expect(Object.isFrozen(scoutingRoleCategoryProfiles)).toBe(true);
  expect(Object.isFrozen(scoutingRoleCategoryById)).toBe(true);
  expect(Object.isFrozen(scoutingRoleScoringProfiles)).toBe(true);

  expect(scoutingRoleSpiderProfiles).toHaveLength(13);
  expect(scoutingAdditionalRoleSpiderProfiles).toHaveLength(23);
  expect(Object.keys(scoutingFallbackSpiderProfiles)).toEqual(["GK", "OTHER"]);
  expect(scoutingFallbackSpiderProfiles.GK.axes.map((axis) => axis.label)).toEqual([
    "Save rate",
    "Prevention",
    "Exits",
    "Accuracy",
    "Pass volume",
  ]);

  const wideWinger = scoutingRoleSpiderProfiles.find((profile) => profile.id === "wide-winger-dribbler");
  expect(wideWinger.groups).toEqual(["WING"]);
  expect(wideWinger.axes.map((axis) => axis.label)).toEqual([
    "Prog runs",
    "Dribble volume",
    "Dribble win",
    "Acceleration",
    "Box threat",
    "xA",
  ]);

  const falseNine = scoutingAdditionalRoleSpiderProfiles.find((profile) => profile.id === "fw-false-nine");
  expect(falseNine.groups).toEqual(["CF", "MID"]);
  expect(falseNine.axes.map((axis) => axis.label)).toEqual([
    "Receives",
    "Pass volume",
    "Key passes",
    "xA",
    "Layoffs",
  ]);

  expect(scoutingRoleCategoryById["role-centre-back"]).toBe("CB");
  expect(scoutingRoleCategoryById["role-forward"]).toBe("CF");
  expect(scoutingRoleCategoryProfiles.map((profile) => profile.group)).toEqual(["GK", "CB", "FB", "MID", "WING", "CF"]);

  expect(scoutingRoleScoringProfiles.CB.minMinutes).toBe(540);
  expect(scoutingRoleScoringProfiles.CB.axes.some((axis) => axis.metricId === "aerial-duels-won")).toBe(true);
  expect(scoutingRoleScoringProfiles.CF.axes.some((axis) => axis.metricId === "touches-in-box-per-90")).toBe(true);
  expect(scoutingRoleScoringProfiles.OTHER.label).toBe("General");
});
