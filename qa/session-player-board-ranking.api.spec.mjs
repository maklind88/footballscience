import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("Session Planner Player Board includes active temporary Squad profiles", () => {
  const appSource = readProjectFile("app-runtime.js");
  const runtimeRenderersSource = readProjectFile("src/modules/session-planner/session-planner-runtime-renderers.mjs");
  const workspaceControllerSource = readProjectFile("src/modules/session-planner/session-planner-workspace-controller.mjs");
  const runtimeSource = `${appSource}\n${runtimeRenderersSource}\n${workspaceControllerSource}`;
  const availabilitySource = readProjectFile("src/modules/session-planner/session-planner-medical-availability-selectors.mjs");

  expect(runtimeRenderersSource).toContain("createSessionPlannerMedicalAvailabilitySelectors");
  expect(runtimeSource).toContain("sessionPlannerMedicalAvailabilitySelectors.getAvailabilityItems(dateValue)");
  expect(availabilitySource).toContain("function getTemporaryProfileAvailabilityItems");
  expect(availabilitySource).toContain("getTemporaryProfileAvailabilityItems,");
  expect(availabilitySource).toContain(".filter((profile) => isTemporaryPlayerProfile(profile))");
  expect(availabilitySource).toContain(".filter((profile) => isPlayerProfileTemporaryActiveOnDate(profile, dateValue))");
  expect(availabilitySource).toContain(".map((profile) => buildMedicalPlayerFromPlayerProfile(profile))");
  expect(availabilitySource).toContain("planningOnly: true");
});

test("Session Planner Player Board hides Squad-unavailable roster players", () => {
  const appSource = readProjectFile("app-runtime.js");
  const medicalRuntimeHelpersSource = readProjectFile("src/modules/medical/medical-runtime-helpers.mjs");
  const runtimeRenderersSource = readProjectFile("src/modules/session-planner/session-planner-runtime-renderers.mjs");
  const workspaceControllerSource = readProjectFile("src/modules/session-planner/session-planner-workspace-controller.mjs");
  const runtimeSource = `${appSource}\n${runtimeRenderersSource}\n${workspaceControllerSource}`;
  const availabilitySource = readProjectFile("src/modules/session-planner/session-planner-medical-availability-selectors.mjs");

  expect(medicalRuntimeHelpersSource).toContain("const medicalSquadAvailabilityBlockStatusKeys = new Set");
  expect(medicalRuntimeHelpersSource).toContain("...playerProfileStatusOptions.map((option) => option.key)");
  expect(medicalRuntimeHelpersSource).toContain('status !== "available"');
  expect(medicalRuntimeHelpersSource).toContain("function isMedicalPlayerBlockedBySquadAvailability");
  expect(appSource).toContain("isMedicalPlayerBlockedBySquadAvailability,");
  expect(runtimeSource).toContain("status: profile.status || player.status");
  expect(runtimeSource).toContain("availabilityStatus: profile.status || player.availabilityStatus");
  expect(runtimeSource).toContain("sessionPlannerMedicalAvailabilitySelectors.getAvailabilityItems");
  expect(availabilitySource).toContain("record: createMedicalRecordFromSquadAvailabilityBlock(player, dateValue)");
  expect(availabilitySource).toContain("participation: record ? record.participation : 100");
  expect(availabilitySource).toContain(".filter((item) => !isMedicalPlayerBlockedBySquadAvailability(item.player, dateValue))");
  expect(workspaceControllerSource).toContain(
    ".filter((item) => !isMedicalPlayerBlockedBySquadAvailability(item.player, local.sessionPlannerState?.selectedDate))"
  );
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
  const appSource = readProjectFile("app-runtime.js");
  const accessorsSource = readProjectFile("src/modules/session-planner/session-planner-runtime-accessors.mjs");
  const workspaceControllerSource = readProjectFile("src/modules/session-planner/session-planner-workspace-controller.mjs");
  const runtimeSource = `${appSource}\n${accessorsSource}\n${workspaceControllerSource}`;
  const playerBoardRendererSource = readProjectFile("src/modules/session-planner/session-planner-player-board-renderer.mjs");
  const styleSource = readProjectFile("styles.css");

  expect(playerBoardRendererSource).toContain("function renderSessionPlannerPlayerBoardCopyTools");
  expect(runtimeSource).toContain("function copySessionPlannerPlayerBoardTeamsFromBlock");
  expect(playerBoardRendererSource).toContain("data-session-player-board-copy-form");
  expect(playerBoardRendererSource).toContain("data-session-player-board-copy-source");
  expect(playerBoardRendererSource).toContain("session-player-board-boardbar-actions");
  expect(runtimeSource).toContain("targetBlock.playerBoardColors = nextColors");
  expect(runtimeSource).toContain("targetBlock.playerBoardPositions = nextPositions");
  expect(runtimeSource).toContain("targetBlock.playerBoardLayoutMode = \"manual\"");
  expect(styleSource).toContain(".session-player-board-copy-tools");
  expect(styleSource).toContain(".session-player-board-boardbar-actions");
  expect(styleSource).toContain(".session-player-board-tool-button.is-copy");
});

test("Session Planner Player Board can add manual people directly on a block", () => {
  const appSource = readProjectFile("app-runtime.js");
  const accessorsSource = readProjectFile("src/modules/session-planner/session-planner-runtime-accessors.mjs");
  const runtimeBindingsSource = readProjectFile("src/modules/session-planner/session-planner-runtime-bindings.mjs");
  const formControllerSource = readProjectFile("src/modules/session-planner/session-planner-workspace-form-controller.mjs");
  const workspaceControllerSource = readProjectFile("src/modules/session-planner/session-planner-workspace-controller.mjs");
  const runtimeSource = `${appSource}\n${accessorsSource}\n${runtimeBindingsSource}\n${formControllerSource}\n${workspaceControllerSource}`;
  const playerBoardHelperSource = readProjectFile("src/modules/session-planner/session-planner-player-board-helpers.mjs");
  const playerBoardRendererSource = readProjectFile("src/modules/session-planner/session-planner-player-board-renderer.mjs");

  expect(runtimeSource).toContain("\"playerBoardCustomPeople\"");
  expect(playerBoardHelperSource).toContain("function normalizePlayerBoardCustomPeople");
  expect(runtimeSource).toContain("function openSessionPlannerPlayerBoardCustomPersonEditor");
  expect(runtimeSource).toContain("function removeSessionPlannerPlayerBoardCustomPerson");
  expect(playerBoardRendererSource).toContain("function renderSessionPlannerPlayerBoardCustomPersonEditor");
  expect(runtimeSource).toContain("function saveSessionPlannerPlayerBoardCustomPersonFromForm");
  expect(playerBoardRendererSource).toContain("data-session-player-board-token-kind=\"${item.player.playerBoardCustom ? \"custom\" : \"roster\"}\"");
  expect(playerBoardRendererSource).toContain("data-session-player-board-person-form");
  expect(runtimeSource).toContain('addEventListener?.("contextmenu"');
  expect(runtimeSource).toContain("playerBoardCustom: true");
  expect(playerBoardRendererSource).toContain("Manual board person");
});

test("Session Planner Player Board spaces compact print and preview tokens for readability", () => {
  const appSource = readProjectFile("app-runtime.js");
  const accessorsSource = readProjectFile("src/modules/session-planner/session-planner-runtime-accessors.mjs");
  const workspaceControllerSource = readProjectFile("src/modules/session-planner/session-planner-workspace-controller.mjs");
  const runtimeSource = `${appSource}\n${accessorsSource}\n${workspaceControllerSource}`;
  const playerBoardRendererSource = readProjectFile("src/modules/session-planner/session-planner-player-board-renderer.mjs");
  const printRendererSource = readProjectFile("src/modules/session-planner/session-planner-print-renderer.mjs");

  expect(runtimeSource).toContain("function getSessionPlannerPlayerBoardReadableSpacing");
  expect(runtimeSource).toContain("function getSessionPlannerReadablePlayerBoardPositions");
  expect(playerBoardRendererSource).toContain('getReadableSpacing(boardPlayers.length, "preview")');
  expect(printRendererSource).toContain('getReadableSpacing(boardPlayers.length, "print")');
  expect(playerBoardRendererSource).toContain("previewPositions.get(item.player.id)");
  expect(printRendererSource).toContain("printPositions.get(item.player.id)");
  expect(runtimeSource).toContain("overlapX <= 0 || overlapY <= 0");
});

test("Session Planner Player Board can tidy selected player tokens without changing formation", () => {
  const accessorsSource = readProjectFile("src/modules/session-planner/session-planner-runtime-accessors.mjs");
  const runtimeBindingsSource = readProjectFile("src/modules/session-planner/session-planner-runtime-bindings.mjs");
  const delegatesSource = readProjectFile("src/modules/session-planner/session-planner-runtime-delegates.mjs");
  const workspaceControllerSource = readProjectFile("src/modules/session-planner/session-planner-workspace-controller.mjs");
  const tidyHelpersSource = readProjectFile("src/modules/session-planner/session-planner-player-board-tidy-helpers.mjs");
  const clickControllerSource = readProjectFile("src/modules/session-planner/session-planner-workspace-click-controller.mjs");
  const playerBoardRendererSource = readProjectFile("src/modules/session-planner/session-planner-player-board-renderer.mjs");
  const overrideSource = readProjectFile("session-planner-overrides.css");
  const runtimeSource = `${accessorsSource}\n${runtimeBindingsSource}\n${delegatesSource}\n${workspaceControllerSource}\n${tidyHelpersSource}\n${clickControllerSource}`;

  expect(playerBoardRendererSource).toContain("data-session-player-board-tidy-selected");
  expect(runtimeSource).toContain("function tidySelectedSessionPlannerPlayerBoardPlayers");
  expect(runtimeSource).toContain("tidyPlayerBoardSelectedPlayers");
  expect(runtimeSource).toContain("getTidiedPlayerBoardPositions");
  expect(runtimeSource).toContain("relaxTidyEntries");
  expect(runtimeSource).toContain("\"tidySelectedSessionPlannerPlayerBoardPlayers\"");
  expect(overrideSource).toContain(".session-player-board-tool-button.is-tidy");
});

test("Session Planner Player Board Smart Align preserves rough shape with symmetric spacing", async () => {
  const helperPath = pathToFileURL(
    path.join(rootDir, "src/modules/session-planner/session-planner-player-board-tidy-helpers.mjs")
  ).href;
  const { createSessionPlannerPlayerBoardTidyHelpers } = await import(`${helperPath}?test=${Date.now()}`);
  const { getTidiedPlayerBoardPositions } = createSessionPlannerPlayerBoardTidyHelpers();
  const settings = { minX: 8, minY: 6, minBoundsX: 4, maxBoundsX: 96, minBoundsY: 7, maxBoundsY: 93 };

  const row = getTidiedPlayerBoardPositions(
    [
      { id: "a", order: 0, x: 39, y: 42 },
      { id: "b", order: 1, x: 44, y: 42.3 },
      { id: "c", order: 2, x: 49, y: 42.2 },
    ],
    [],
    settings
  ).sort((first, second) => first.x - second.x);
  expect(Math.max(...row.map((entry) => entry.y)) - Math.min(...row.map((entry) => entry.y))).toBeLessThan(0.8);
  expect(Math.abs((row[1].x - row[0].x) - (row[2].x - row[1].x))).toBeLessThan(0.8);

  const column = getTidiedPlayerBoardPositions(
    [
      { id: "a", order: 0, x: 58.4, y: 34 },
      { id: "b", order: 1, x: 58, y: 42 },
      { id: "c", order: 2, x: 57.6, y: 50 },
    ],
    [],
    settings
  ).sort((first, second) => first.y - second.y);
  expect(Math.max(...column.map((entry) => entry.x)) - Math.min(...column.map((entry) => entry.x))).toBeLessThan(0.8);
  expect(Math.abs((column[1].y - column[0].y) - (column[2].y - column[1].y))).toBeLessThan(0.8);

  const grid = getTidiedPlayerBoardPositions(
    [
      { id: "a", order: 0, x: 40, y: 36 },
      { id: "b", order: 1, x: 48, y: 35.5 },
      { id: "c", order: 2, x: 39.4, y: 44 },
      { id: "d", order: 3, x: 48.3, y: 44.4 },
    ],
    [],
    settings
  );
  const roundedX = new Set(grid.map((entry) => Math.round(entry.x)));
  const roundedY = new Set(grid.map((entry) => Math.round(entry.y)));
  expect(roundedX.size).toBe(2);
  expect(roundedY.size).toBe(2);
});
