import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  canonicalPlatformClubValues,
  canonicalPlatformTeamValues,
  dataSafetyDatabaseName,
  dataSafetyExportSchema,
  defaultWorkspaceAccess,
  defaultWorkspaceEditAccess,
  legacyPlatformStructureValues,
  platformDefaultClubId,
  platformDefaultClubName,
  platformDefaultClubShortName,
  platformDefaultTeamId,
  platformDefaultTeamLevel,
  platformDefaultTeamName,
  playerProfileAgeCacheStorageKey,
  playerProfileChangeLogLimit,
  playerProfilesDefaultRosterVersion,
  playerProfilesSchemaVersion,
  playerProfilesStorageKey,
  requiredWorkspaceAccess,
  sessionPlannerBlockMergeFields,
  sessionPlannerBlockMergeFieldSet,
} from "../src/core/app-runtime-constants.mjs";

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("app runtime constants own stable storage and access defaults outside app-runtime", () => {
  const appRuntime = readProjectFile("app-runtime.js");
  const constantsSource = readProjectFile("src/core/app-runtime-constants.mjs");
  const packageJson = JSON.parse(readProjectFile("package.json"));

  expect(appRuntime).toContain("app-runtime-constants.mjs");
  expect(appRuntime).not.toContain('const playerProfilesStorageKey = "football-player-profiles-v1";');
  expect(appRuntime).not.toContain("const defaultWorkspaceAccess = {");
  expect(appRuntime).not.toContain('const platformDefaultClubId = "club-north-carolina-courage";');
  expect(constantsSource).toContain('export const playerProfilesStorageKey = "football-player-profiles-v1";');
  expect(constantsSource).toContain("export const defaultWorkspaceAccess = {");
  expect(constantsSource).toContain('export const platformDefaultClubId = "club-north-carolina-courage";');
  expect(packageJson.scripts.check).toContain("src/core/app-runtime-constants.mjs");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/app-runtime-constants-contract.api.spec.mjs");
});

test("app runtime constants preserve safety-critical values", () => {
  expect(sessionPlannerBlockMergeFields).toEqual([
    "label",
    "title",
    "focus",
    "phase",
    "subPhase",
    "minutes",
    "time",
    "intensity",
    "pitchSize",
    "material",
    "objective",
    "why",
    "organization",
    "principles",
    "diagram",
    "tacticalPitchMode",
    "tacticalFrames",
    "tacticalActiveFrameId",
    "playerBoardLayoutMode",
    "visualImage",
    "playerBoardPositions",
    "playerBoardColors",
    "playerBoardCustomPeople",
    "tacticalElements",
    "libraryExerciseId",
    "postSessionNotes",
  ]);
  expect(sessionPlannerBlockMergeFieldSet.has("postSessionNotes")).toBe(true);
  expect(playerProfilesStorageKey).toBe("football-player-profiles-v1");
  expect(playerProfileAgeCacheStorageKey).toBe("football-player-profile-age-cache-v1");
  expect(dataSafetyExportSchema).toBe("football-science-backup-v1");
  expect(dataSafetyDatabaseName).toBe("football-science-data-safety-v1");
  expect(playerProfilesDefaultRosterVersion).toBe("player-profiles-ncc-2026-v1");
  expect(playerProfilesSchemaVersion).toBe(3);
  expect(playerProfileChangeLogLimit).toBe(250);
});

test("app runtime constants preserve default workspace access contracts", () => {
  expect(defaultWorkspaceAccess["session-planner"]).toEqual([
    "admin",
    "club-admin",
    "team-admin",
    "coach",
    "scout",
    "analyst",
    "performance",
    "medical",
  ]);
  expect(defaultWorkspaceAccess.schedule).toContain("guest");
  expect(defaultWorkspaceAccess["transfer-room"]).toEqual(["admin", "team-admin"]);
  expect(defaultWorkspaceAccess.leaderboard).toEqual([
    "admin",
    "club-admin",
    "team-admin",
    "coach",
    "scout",
    "analyst",
    "performance",
    "medical",
  ]);
  expect(defaultWorkspaceEditAccess.leaderboard).toEqual(["admin", "club-admin", "team-admin", "coach"]);
  expect(defaultWorkspaceEditAccess["medical-team"]).toEqual(["admin", "club-admin", "team-admin", "medical", "performance"]);
  expect(defaultWorkspaceEditAccess["game-simulator"]).toEqual(["admin", "club-admin", "team-admin", "coach", "scout", "analyst"]);
  expect(requiredWorkspaceAccess["player-profiles"].view).toContain("medical");
  expect(requiredWorkspaceAccess["player-profiles"].edit).not.toContain("medical");
  expect(requiredWorkspaceAccess["set-pieces-room"].edit).toEqual(["admin", "club-admin", "team-admin", "coach", "analyst"]);
  expect(requiredWorkspaceAccess.leaderboard.edit).toEqual(["admin", "club-admin", "team-admin", "coach"]);
});

test("app runtime constants preserve canonical platform identity defaults", () => {
  expect(platformDefaultClubId).toBe("club-north-carolina-courage");
  expect(platformDefaultTeamId).toBe("team-north-carolina-courage");
  expect(platformDefaultClubName).toBe("North Carolina Courage");
  expect(platformDefaultClubShortName).toBe("NCC");
  expect(platformDefaultTeamName).toBe("North Carolina Courage");
  expect(platformDefaultTeamLevel).toBe("First Team");
  expect(legacyPlatformStructureValues.has("football science live")).toBe(true);
  expect(canonicalPlatformClubValues.has("north carolina courage")).toBe(true);
  expect(canonicalPlatformTeamValues.has("first team")).toBe(true);
});
