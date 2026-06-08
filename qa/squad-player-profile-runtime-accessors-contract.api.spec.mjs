import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as playerProfileRuntimeAccessors from "../src/modules/squad/player-profile-runtime-accessors.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

const accessorNames = [
  "readPlayerProfileAgeCache",
  "ensurePlayerProfileAgeCache",
  "writePlayerProfileAgeCache",
  "getPlayerProfileAgeCacheEntry",
  "getCurrentSquadActorLabel",
  "recordPlayerProfileChange",
  "getPlayerProfileChangeLog",
  "getRecentPlayerProfileChangeLog",
  "clonePlayerProfilesState",
  "buildPlayerProfileFromMedicalTrainingGuest",
  "syncPlayerProfilesFromMedicalTrainingGuests",
  "readPlayerProfilesState",
  "writePlayerProfilesState",
  "getPlayerProfileAgeHydrationCandidates",
  "buildPlayerProfileAgeHydrationPayload",
  "mergePlayerProfileAgeHydrationResult",
  "hydratePlayerProfileAgesOnce",
  "queuePlayerProfileAgeHydration",
  "ensurePlayerProfilesState",
  "canEditPlayerProfiles",
  "getPlayerProfilesAccessLabel",
  "getSelectedPlayerProfile",
  "openPlayerProfileModal",
  "closePlayerProfileModal",
  "openPlayerProfileNewPlayerModal",
  "closePlayerProfileNewPlayerModal",
  "getLatestManualMedicalLog",
  "getPlayerProfileMedicalStatusOverride",
  "getPlayerProfileEffectiveStatusFromSnapshot",
  "getPlayerProfileEffectiveStatus",
  "getPlayerProfileMedicalSnapshot",
  "getVisiblePlayerProfiles",
  "getAllTemporaryPlayerProfiles",
  "renderPlayerProfileStatusChip",
  "renderSquadRosterSections",
  "renderPlayerProfilesRosterListOnly",
  "buildPlayerProfileImportFeedback",
  "createPlayerProfileImportUndoSnapshot",
  "clearPlayerProfileImportUndoSnapshots",
  "registerPlayerProfileImportUndoSnapshot",
  "getPlayerProfileImportUndoHistory",
  "getPlayerProfileImportUndoState",
  "applyPlayerProfileImportUndo",
  "importSquadDataFoundationPayload",
  "importSquadDataFoundationFile",
  "renderPendingPlayerProfileImport",
  "renderPlayerProfilesWorkspace",
  "getPlayerProfileFormSignature",
  "savePlayerProfileEditForm",
  "queuePlayerProfileAutosave",
  "flushPlayerProfileAutosave",
  "buildMedicalPlayerFromPlayerProfile",
  "syncMedicalPlayersFromPlayerProfiles",
  "getMedicalPlayersMatchingPlayerProfile",
  "getMedicalRemovedSquadPlayerIdSet",
  "isMedicalPlayerRemovedFromSquad",
  "archiveMedicalPlayersRemovedFromSquad",
  "archiveMedicalPlayersForRemovedPlayerProfile",
  "addPlayerProfile",
  "updatePlayerProfile",
  "removePlayerProfile",
  "getPendingPlayerProfileImportPlan",
  "setPendingPlayerProfileImportPlan",
  "setPlayerProfileAutosaveLastSignature",
];

test("Squad player profile runtime accessors preserve app-runtime pass-through names", () => {
  const app = readProjectFile("app-runtime.js");
  const accessors = readProjectFile("src/modules/squad/player-profile-runtime-accessors.mjs");
  const index = readProjectFile("src/modules/squad/index.mjs");

  expect(typeof playerProfileRuntimeAccessors.configurePlayerProfileRuntimeAccessors).toBe("function");
  expect(playerProfileRuntimeAccessors.playerProfileRuntimeAccessorNames).toEqual(accessorNames);
  for (const accessorName of accessorNames) {
    expect(typeof playerProfileRuntimeAccessors[accessorName], accessorName).toBe("function");
    expect(app, `${accessorName} should remain locally addressable through imported accessors`).toContain(accessorName);
  }

  expect(app).toContain('import * as playerProfileRuntimeAccessors from "./src/modules/squad/player-profile-runtime-accessors.mjs";');
  expect(app).toContain("configurePlayerProfileRuntimeAccessors(() => playerProfileRuntimeFacade);");
  expect(app).not.toContain("function readPlayerProfileAgeCache(...args)");
  expect(app).not.toContain("function setPlayerProfileAutosaveLastSignature(...args)");
  expect(accessors).toContain("callPlayerProfileRuntimeFacade(methodName, args)");
  expect(accessors).not.toContain("localStorage");
  expect(accessors).not.toContain("rawDataSafetySetItem");
});

test("Squad player profile runtime accessors forward to the configured facade", () => {
  const calls = [];
  const facade = Object.fromEntries(
    accessorNames.map((name) => [
      name,
      (...args) => {
        calls.push([name, args]);
        return `${name}-result`;
      },
    ])
  );

  playerProfileRuntimeAccessors.configurePlayerProfileRuntimeAccessors(() => facade);

  expect(playerProfileRuntimeAccessors.readPlayerProfilesState("fresh")).toBe("readPlayerProfilesState-result");
  expect(playerProfileRuntimeAccessors.canEditPlayerProfiles()).toBe("canEditPlayerProfiles-result");
  expect(playerProfileRuntimeAccessors.renderPlayerProfilesWorkspace("Saved.")).toBe("renderPlayerProfilesWorkspace-result");
  expect(playerProfileRuntimeAccessors.syncMedicalPlayersFromPlayerProfiles("medical")).toBe("syncMedicalPlayersFromPlayerProfiles-result");
  expect(calls).toEqual([
    ["readPlayerProfilesState", ["fresh"]],
    ["canEditPlayerProfiles", []],
    ["renderPlayerProfilesWorkspace", ["Saved."]],
    ["syncMedicalPlayersFromPlayerProfiles", ["medical"]],
  ]);
});
