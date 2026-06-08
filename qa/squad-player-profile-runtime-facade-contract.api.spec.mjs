import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPlayerProfileRuntimeFacade } from "../src/modules/squad/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createHarness() {
  let playerProfilesState = {
    selectedPlayerId: "p1",
    players: [
      {
        id: "p1",
        name: "Ada Midfielder",
        number: "8",
        position: "Midfielder",
        primaryRole: "8",
        roleGroup: "midfielder",
        rosterType: "squad",
        squadStatus: "important",
        attributeRatings: {},
        idp: {},
        futureData: {},
      },
    ],
    removedPlayerIds: [],
    changeLog: [],
  };
  let medicalState = { players: [], records: [], injuryPlans: [] };
  const localStorageWrites = [];
  const medicalUpserts = [];
  const timers = [];
  const form = { id: "playerProfileEditForm" };
  const ui = {
    playerProfilesWorkspace: {
      innerHTML: "",
      querySelector: (selector) => (selector === "#playerProfileEditForm" ? form : null),
    },
  };
  const win = {
    FileReader: class {},
    clearTimeout: () => {},
    localStorage: {
      getItem: () => null,
      setItem: (key, value) => localStorageWrites.push({ key, value }),
    },
    setTimeout: (handler, delayMs) => {
      const timer = { delayMs, handler };
      timers.push(timer);
      return timer;
    },
  };

  const normalizePlayerProfile = (player = {}) => ({
    id: String(player.id || player.playerId || "").trim(),
    name: String(player.name || "").trim(),
    number: String(player.number || "").trim(),
    position: String(player.position || "").trim(),
    primaryRole: String(player.primaryRole || "").trim(),
    roleGroup: String(player.roleGroup || "midfielder").trim(),
    rosterType: String(player.rosterType || "squad").trim(),
    countsInSquad: player.countsInSquad !== false,
    squadStatus: String(player.squadStatus || "important").trim(),
    attributeRatings: player.attributeRatings || {},
    idp: player.idp || {},
    futureData: player.futureData || {},
    updatedAt: player.updatedAt || "",
  });

  const facade = createPlayerProfileRuntimeFacade({
    buildPlayerProfileImportFeedbackMessage: () => ({ status: "success", lines: [], items: [] }),
    buildPlayerProfileImportPlan: () => ({ ok: true, status: "success", canApply: false, nextPlayers: [] }),
    buildPlayerProfileImportPreviewMessage: () => ({ status: "success", lines: [], items: [] }),
    buildSquadDataFoundationPayload: () => ({}),
    buildSquadDataQualityReport: () => ({}),
    buildSquadSessionPlannerContracts: () => [],
    canCurrentUserEditWorkspace: () => true,
    canViewPrivateMedicalDetails: () => true,
    cloneMedicalState: (state) => JSON.parse(JSON.stringify(state || {})),
    commitMedicalClinicalState: () => {},
    comparePlayerProfiles: (first = {}, second = {}) => String(first.name || "").localeCompare(String(second.name || "")),
    createDashboardId: (prefix) => `${prefix}-1`,
    defaultMedicalPlayers: [],
    ensureMedicalState: () => medicalState,
    fetchRef: () => Promise.resolve({ ok: true, text: () => Promise.resolve("{}") }),
    formatDateValue: (value) => value || "2026-06-07",
    formatMedicalDateLabel: (value) => `Label ${value}`,
    formatPlayerProfileChangeValue: (value) => String(value || ""),
    getActiveMedicalInjuryPlan: () => null,
    getActiveMedicalPlayers: () => medicalState.players,
    getCurrentMedicalActorId: () => "medical-user",
    getCurrentPlatformUser: () => ({ email: "coach@example.com", firstName: "Mak", lastName: "Lind" }),
    getDefaultPlayerProfileRole: () => "8",
    getHubState: () => ({ activeWorkspaceId: "player-profiles" }),
    getLatestMedicalRecord: () => null,
    getMedicalRecordStatus: (record = {}) => ({ label: record.status || "Available" }),
    getMedicalRtpPhaseOption: (phaseKey) => ({ label: phaseKey || "Full" }),
    getMedicalState: () => medicalState,
    getPlatformApiAccessToken: () => "",
    getPlatformStructureState: () => ({}),
    getPlatformTeamDisplayName: () => "North Carolina Courage",
    getPlatformTeamDisplayTeam: () => ({ name: "North Carolina Courage" }),
    getPlayerProfileAgeCacheKey: (player = {}) => player.id || player.name || "",
    getPlayerProfileAgeLookupSignature: (player = {}) => player.id || player.name || "",
    getPlayerProfileBirthDateValue: () => "",
    getPlayerProfileChangeDiffs: (current, next) => current.name === next.name ? [] : [{ field: "Name", from: current.name, to: next.name }],
    getPlayerProfileFormValues: () => ({
      playerId: "p1",
      name: "Ada Updated",
      number: "8",
      position: "Midfielder",
      primaryRole: "8",
      roleGroup: "midfielder",
      rosterType: "squad",
      squadStatus: "important",
      attributeRatings: {},
      idp: {},
      futureData: {},
    }),
    getPlayerProfileImportUndoRelativeTimeLabel: () => "just now",
    getPlayerProfileModalOpen: () => false,
    getPlayerProfileNewPlayerModalOpen: () => false,
    getPlayerProfileRoleGroupForRole: () => "midfielder",
    getPlayerProfilesRosterSummary: (players = []) => ({ totalCount: players.length, squadCount: players.length }),
    getPlayerProfileRosterTypeOption: () => ({ shortLabel: "Squad" }),
    getPlayerProfileSyncIdentityKeys: (player = {}) => [player.id, player.name].filter(Boolean),
    getPlayerProfilesRoleGroupFilter: () => "all",
    getPlayerProfilesRosterFilter: () => "all",
    getPlayerProfilesSearchQuery: () => "",
    getPlayerProfilesState: () => playerProfilesState,
    getSessionPlannerPlayerProfileContract: () => null,
    getSessionPlannerPlayerProfileContracts: () => [],
    getSquadChangeSummary: (type, player = {}) => `${type}:${player.name || ""}`,
    getTemporaryRosterTypeFromPlayerSource: () => "training",
    isCurrentPlatformUserAdmin: () => true,
    isMedicalItemArchived: (item = {}) => Boolean(item.archivedAt),
    isTemporaryPlayerProfile: () => false,
    logEvent: () => {},
    normalizeMedicalInjuryPlan: (plan = {}) => ({ ...plan }),
    normalizeMedicalPlayer: (player = {}) => (player.id && player.name ? { ...player } : null),
    normalizeMedicalRecord: (record = {}) => ({ ...record }),
    normalizePlayerProfile,
    normalizePlayerProfileAgeCacheEntry: (entry = {}) => ({ ...entry }),
    normalizePlayerProfileAgeValue: (value) => value,
    normalizePlayerProfileBirthDate: (value) => value,
    normalizePlayerProfileChangeLog: (entries = []) => entries.filter(Boolean),
    normalizePlayerProfileChangeLogEntry: (entry = {}) => ({ ...entry }),
    normalizePlayerProfileName: (value = "") => String(value).trim().toLowerCase(),
    normalizePlayerProfileRemovedIds: (value = []) => Array.from(new Set((Array.isArray(value) ? value : []).filter(Boolean))),
    normalizePlayerProfileRole: (value, fallback) => String(value || fallback || "").trim(),
    normalizePlayerProfileRosterType: (value, fallback = "squad") => String(value || fallback).trim(),
    playerProfileAgeCacheStorageKey: "age-cache",
    playerProfileCountsInSquad: (player = {}) => player.countsInSquad !== false,
    playerProfileImportUndoHistoryLimit: 3,
    playerProfileRoleGroupOptions: [],
    playerProfileRosterUiSelectors: {
      getTemporaryProfiles: (players = []) => players.filter((player) => player.countsInSquad === false),
      getVisibleProfiles: (players = []) => players,
    },
    playerProfileRosterFilterOptions: [],
    playerProfileRosterTypeCountsInSquad: (type) => type !== "training",
    playerProfileRosterTypeOptions: [],
    playerProfileSquadStatusOptions: [],
    playerProfilesDefaultRosterVersion: "v1",
    playerProfilesSchemaVersion: "schema-v1",
    playerProfilesStorageKey: "player-profiles",
    rawDataSafetySetItem: (key, value) => localStorageWrites.push({ key, value }),
    renderPlatformTeamLogoMark: () => "<logo></logo>",
    renderPlayerProfilesWorkspaceMessage: (message) => `message=${message.lines?.[0] || message.status || message}`,
    setMedicalState: (nextState) => {
      medicalState = nextState;
    },
    setPlayerProfileModalOpen: () => {},
    setPlayerProfileNewPlayerModalOpen: () => {},
    setPlayerProfilesState: (nextState) => {
      playerProfilesState = nextState;
    },
    squadProfileSelectedRenderer: { renderModal: (player) => `modal=${player?.id || ""}` },
    squadProfileSupportRenderer: {
      renderNewPlayerModal: () => "new-player-modal",
      renderOptionSet: () => "options",
    },
    squadRosterRenderer: {
      renderRosterSections: (players) => `roster=${players.map((player) => player.name).join(",")}`,
      renderStatusChip: (statusKey) => `status=${statusKey}`,
    },
    squadWorkspaceRenderer: {
      renderPendingImport: () => "",
      renderWorkspace: ({ canEdit, messageMarkup, rosterSectionsMarkup, teamName }) =>
        `team=${teamName};edit=${canEdit};${messageMarkup};${rosterSectionsMarkup}`,
    },
    ui,
    upsertMedicalPlayers: (players) => medicalUpserts.push(players),
    validatePlayerProfileFormValues: (values = {}) => ({
      ok: true,
      status: "success",
      errors: [],
      warnings: [],
      duplicates: [],
      player: normalizePlayerProfile({ ...values, id: values.id || values.playerId }),
    }),
    win,
    writeMedicalState: () => {},
  });

  return {
    facade,
    form,
    getState: () => playerProfilesState,
    localStorageWrites,
    medicalUpserts,
    timers,
    ui,
  };
}

test("Squad player profile runtime facade is the only app-runtime boundary for profile runtime services", () => {
  const app = readProjectFile("app-runtime.js");
  const workspaceComposer = readProjectFile("src/core/workspace-runtime-composer.mjs");
  const facade = readProjectFile("src/modules/squad/player-profile-runtime-facade.mjs");
  const index = readProjectFile("src/modules/squad/index.mjs");

  expect(typeof createPlayerProfileRuntimeFacade).toBe("function");
  expect(app).toContain("createWorkspaceRuntimeComposition({");
  expect(app).not.toContain("createPlayerProfileRuntimeFacade({");
  expect(workspaceComposer).toContain("createPlayerProfileRuntimeFacade({");
  expect(app).toContain('import * as playerProfileRuntimeAccessors from "./src/modules/squad/player-profile-runtime-accessors.mjs";');
  expect(app).toContain("renderPlayerProfilesWorkspace,");
  expect(app).toContain("queuePlayerProfileAutosave,");
  expect(workspaceComposer).toContain("deps.configurePlayerProfileRuntimeAccessors(() => playerProfileRuntimeFacade);");
  expect(app).not.toContain("createPlayerProfileRuntimeStateService({");
  expect(app).not.toContain("createPlayerProfileRuntimeWriteService({");
  expect(app).not.toContain("createPlayerProfileRuntimeImportService({");
  expect(app).not.toContain("createPlayerProfileRuntimeMedicalSyncService({");
  expect(app).not.toContain("createSquadMedicalStatusService({");
  expect(facade).toContain("createPlayerProfileRuntimeStateService({");
  expect(facade).toContain("createPlayerProfileRuntimeWriteService({");
  expect(facade).toContain("createPlayerProfileRuntimeImportService({");
  expect(facade).toContain("createPlayerProfileRuntimeMedicalSyncService({");
  expect(facade).toContain("createSquadMedicalStatusService({");
  expect(facade).not.toContain("createDashboardChat");
  expect(facade).not.toContain("renderDashboardChatWidget");
  expect(index).toContain('export * from "./player-profile-runtime-facade.mjs";');
});

test("Squad player profile runtime facade preserves workspace render and edit-save behavior", () => {
  const harness = createHarness();

  harness.facade.renderPlayerProfilesWorkspace({ status: "success", lines: ["Saved"] });
  expect(harness.ui.playerProfilesWorkspace.innerHTML).toContain("team=North Carolina Courage");
  expect(harness.ui.playerProfilesWorkspace.innerHTML).toContain("message=Saved");
  expect(harness.ui.playerProfilesWorkspace.innerHTML).toContain("roster=Ada Midfielder");
  expect(harness.timers).toHaveLength(1);

  const result = harness.facade.savePlayerProfileEditForm(harness.form);
  expect(result).toMatchObject({ ok: true, status: "success" });
  expect(harness.getState().players[0]).toMatchObject({ id: "p1", name: "Ada Updated" });
  expect(harness.localStorageWrites.some((write) => write.key === "player-profiles")).toBe(true);
  expect(harness.medicalUpserts[0]).toEqual([expect.objectContaining({ id: "p1", name: "Ada Updated" })]);

  expect(harness.facade.savePlayerProfileEditForm(harness.form)).toMatchObject({ ok: true, skipped: true });
});
