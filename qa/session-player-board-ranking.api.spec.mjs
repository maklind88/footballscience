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

test("Session Planner Player Board hides Squad-unavailable roster players", () => {
  const appSource = readProjectFile("app.js");

  expect(appSource).toContain("const medicalSquadAvailabilityBlockStatusKeys = new Set");
  expect(appSource).toContain("function isMedicalPlayerBlockedBySquadAvailability");
  expect(appSource).toContain("status: profile.status || player.status");
  expect(appSource).toContain("availabilityStatus: profile.status || player.availabilityStatus");
  expect(appSource).toContain(".filter((item) => !isMedicalPlayerBlockedBySquadAvailability(item.player))");
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
  expect(appSource).toContain("session-player-board-boardbar-actions");
  expect(appSource).toContain("targetBlock.playerBoardColors = nextColors");
  expect(appSource).toContain("targetBlock.playerBoardPositions = nextPositions");
  expect(appSource).toContain("targetBlock.playerBoardLayoutMode = \"manual\"");
  expect(styleSource).toContain(".session-player-board-copy-tools");
  expect(styleSource).toContain(".session-player-board-boardbar-actions");
  expect(styleSource).toContain(".session-player-board-tool-button.is-copy");
});

test("Session Planner Player Board can add manual people directly on a block", () => {
  const appSource = readProjectFile("app.js");

  expect(appSource).toContain("\"playerBoardCustomPeople\"");
  expect(appSource).toContain("function normalizeSessionPlannerPlayerBoardCustomPeople");
  expect(appSource).toContain("function openSessionPlannerPlayerBoardCustomPersonEditor");
  expect(appSource).toContain("function removeSessionPlannerPlayerBoardCustomPerson");
  expect(appSource).toContain("function renderSessionPlannerPlayerBoardCustomPersonEditor");
  expect(appSource).toContain("function saveSessionPlannerPlayerBoardCustomPersonFromForm");
  expect(appSource).toContain("data-session-player-board-token-kind=\"${item.player.playerBoardCustom ? \"custom\" : \"roster\"}\"");
  expect(appSource).toContain("data-session-player-board-person-form");
  expect(appSource).toContain("addEventListener(\"contextmenu\"");
  expect(appSource).toContain("playerBoardCustom: true");
  expect(appSource).toContain("Manual board person");
});

test("Session Planner Player Board spaces compact print and preview tokens for readability", () => {
  const appSource = readProjectFile("app.js");

  expect(appSource).toContain("function getSessionPlannerPlayerBoardReadableSpacing");
  expect(appSource).toContain("function getSessionPlannerReadablePlayerBoardPositions");
  expect(appSource).toContain('getSessionPlannerPlayerBoardReadableSpacing(boardPlayers.length, "preview")');
  expect(appSource).toContain('getSessionPlannerPlayerBoardReadableSpacing(boardPlayers.length, "print")');
  expect(appSource).toContain("previewPositions.get(item.player.id)");
  expect(appSource).toContain("printPositions.get(item.player.id)");
  expect(appSource).toContain("overlapX <= 0 || overlapY <= 0");
});
