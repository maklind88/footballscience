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
  expect(appSource).toContain("...playerProfileStatusOptions.map((option) => option.key)");
  expect(appSource).toContain('status !== "available"');
  expect(appSource).toContain("function isMedicalPlayerBlockedBySquadAvailability");
  expect(appSource).toContain("status: profile.status || player.status");
  expect(appSource).toContain("availabilityStatus: profile.status || player.availabilityStatus");
  expect(appSource).toContain("record: createMedicalRecordFromSquadAvailabilityBlock(player, dateValue)");
  expect(appSource).toContain("participation: record ? record.participation : 100");
  expect(appSource).toContain(".filter((item) => !isMedicalPlayerBlockedBySquadAvailability(item.player))");
});

test("Session Planner Player Board ranks by role, squad status, and career phase", () => {
  const helperSource = readProjectFile("src/modules/session-planner/session-planner-player-board-helpers.mjs");
  const formationHelperSource = readProjectFile("src/modules/session-planner/session-planner-player-board-formation-helpers.mjs");
  const profileHelperSource = readProjectFile("src/modules/session-planner/session-planner-player-board-profile-helpers.mjs");

  expect(profileHelperSource).toContain("function getRoleGroupForRole");
  expect(helperSource).toContain("function getDirectRoleFitScore");
  expect(helperSource).toContain("function normalizeSquadStatusKey");
  expect(helperSource).toContain("function getCareerPhasePriority");
  expect(formationHelperSource).toContain("roleMismatchPenalty");
  expect(formationHelperSource).toContain("careerScore");
});

test("Session Planner Player Board can copy team setup from another block", () => {
  const appSource = readProjectFile("app.js");
  const playerBoardRendererSource = readProjectFile("src/modules/session-planner/session-planner-player-board-renderer.mjs");
  const styleSource = readProjectFile("styles.css");

  expect(playerBoardRendererSource).toContain("function renderSessionPlannerPlayerBoardCopyTools");
  expect(appSource).toContain("function copySessionPlannerPlayerBoardTeamsFromBlock");
  expect(playerBoardRendererSource).toContain("data-session-player-board-copy-form");
  expect(playerBoardRendererSource).toContain("data-session-player-board-copy-source");
  expect(playerBoardRendererSource).toContain("session-player-board-boardbar-actions");
  expect(appSource).toContain("targetBlock.playerBoardColors = nextColors");
  expect(appSource).toContain("targetBlock.playerBoardPositions = nextPositions");
  expect(appSource).toContain("targetBlock.playerBoardLayoutMode = \"manual\"");
  expect(styleSource).toContain(".session-player-board-copy-tools");
  expect(styleSource).toContain(".session-player-board-boardbar-actions");
  expect(styleSource).toContain(".session-player-board-tool-button.is-copy");
});

test("Session Planner Player Board can add manual people directly on a block", () => {
  const appSource = readProjectFile("app.js");
  const playerBoardHelperSource = readProjectFile("src/modules/session-planner/session-planner-player-board-helpers.mjs");
  const playerBoardRendererSource = readProjectFile("src/modules/session-planner/session-planner-player-board-renderer.mjs");

  expect(appSource).toContain("\"playerBoardCustomPeople\"");
  expect(playerBoardHelperSource).toContain("function normalizePlayerBoardCustomPeople");
  expect(appSource).toContain("function openSessionPlannerPlayerBoardCustomPersonEditor");
  expect(appSource).toContain("function removeSessionPlannerPlayerBoardCustomPerson");
  expect(playerBoardRendererSource).toContain("function renderSessionPlannerPlayerBoardCustomPersonEditor");
  expect(appSource).toContain("function saveSessionPlannerPlayerBoardCustomPersonFromForm");
  expect(playerBoardRendererSource).toContain("data-session-player-board-token-kind=\"${item.player.playerBoardCustom ? \"custom\" : \"roster\"}\"");
  expect(playerBoardRendererSource).toContain("data-session-player-board-person-form");
  expect(appSource).toContain("addEventListener(\"contextmenu\"");
  expect(appSource).toContain("playerBoardCustom: true");
  expect(playerBoardRendererSource).toContain("Manual board person");
});

test("Session Planner Player Board spaces compact print and preview tokens for readability", () => {
  const appSource = readProjectFile("app.js");
  const playerBoardRendererSource = readProjectFile("src/modules/session-planner/session-planner-player-board-renderer.mjs");
  const printRendererSource = readProjectFile("src/modules/session-planner/session-planner-print-renderer.mjs");

  expect(appSource).toContain("function getSessionPlannerPlayerBoardReadableSpacing");
  expect(appSource).toContain("function getSessionPlannerReadablePlayerBoardPositions");
  expect(playerBoardRendererSource).toContain('getReadableSpacing(boardPlayers.length, "preview")');
  expect(printRendererSource).toContain('getReadableSpacing(boardPlayers.length, "print")');
  expect(playerBoardRendererSource).toContain("previewPositions.get(item.player.id)");
  expect(printRendererSource).toContain("printPositions.get(item.player.id)");
  expect(appSource).toContain("overlapX <= 0 || overlapY <= 0");
});
