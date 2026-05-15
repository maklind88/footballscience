import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("Session Planner Player Board includes active temporary Squad profiles", () => {
  const appSource = readProjectFile("app.js");

  expect(appSource).toContain("function getSessionPlannerTemporaryProfileAvailabilityItems");
  expect(appSource).toContain(".filter((profile) => isTemporaryPlayerProfile(profile))");
  expect(appSource).toContain(".filter((profile) => isPlayerProfileTemporaryActiveOnDate(profile, dateValue))");
  expect(appSource).toContain(".map((profile) => buildMedicalPlayerFromPlayerProfile(profile))");
  expect(appSource).toContain("planningOnly: true");
});

test("Session Planner Player Board ranks by role, squad status, and career phase", () => {
  const appSource = readProjectFile("app.js");

  expect(appSource).toContain("function getSessionPlannerPlayerBoardRoleGroupForRole");
  expect(appSource).toContain("function getSessionPlannerPlayerBoardDirectRoleFitScore");
  expect(appSource).toContain("function normalizeSessionPlannerPlayerBoardSquadStatusKey");
  expect(appSource).toContain("function getSessionPlannerPlayerBoardCareerPhasePriority");
  expect(appSource).toContain("roleMismatchPenalty");
  expect(appSource).toContain("careerScore");
});

test("Session Planner Player Board can copy team setup from another block", () => {
  const appSource = readProjectFile("app.js");
  const styleSource = readProjectFile("styles.css");

  expect(appSource).toContain("function renderSessionPlannerPlayerBoardCopyTools");
  expect(appSource).toContain("function copySessionPlannerPlayerBoardTeamsFromBlock");
  expect(appSource).toContain("data-session-player-board-copy-form");
  expect(appSource).toContain("data-session-player-board-copy-source");
  expect(appSource).toContain("targetBlock.playerBoardColors = nextColors");
  expect(appSource).toContain("targetBlock.playerBoardPositions = nextPositions");
  expect(appSource).toContain("targetBlock.playerBoardLayoutMode = \"manual\"");
  expect(styleSource).toContain(".session-player-board-copy-tools");
  expect(styleSource).toContain(".session-player-board-tool-button.is-copy");
});
