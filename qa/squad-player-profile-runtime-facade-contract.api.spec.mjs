import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPlayerProfileRuntimeFacade } from "../src/modules/squad/index.mjs";
import { createSquadRosterRuntimeController } from "../src/modules/squad/squad-roster-runtime-controller.mjs";

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
        birthDate: "2001-07-24",
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
  let playerProfileNewPlayerModalOpen = false;
  const localStorageWrites = [];
  const medicalUpserts = [];
  const modalDrafts = [];
  const frames = [];
  const rosterRenderCalls = [];
  const timers = [];
  const form = { id: "playerProfileEditForm" };
  const newPlayerForm = {
    id: "playerProfileNewPlayerForm",
    values: {
      name: "",
      number: "",
      birthDate: "",
      position: "",
      primaryRole: "CB",
      rosterType: "squad",
      temporaryGroup: "",
      temporaryFrom: "",
      temporaryTo: "",
    },
  };
  const ui = {
    playerProfilesWorkspace: {
      innerHTML: "",
      querySelector: (selector) => {
        if (selector === "#playerProfileEditForm") {
          return form;
        }
        if (selector === "#playerProfileNewPlayerForm" && playerProfileNewPlayerModalOpen) {
          return newPlayerForm;
        }
        return null;
      },
    },
  };
  const win = {
    FileReader: class {},
    FormData: class {
      constructor(target = {}) {
        this.values = target.values || {};
      }

      get(key) {
        return this.values[key] ?? "";
      }
    },
    clearTimeout: () => {},
    localStorage: {
      getItem: () => null,
      setItem: (key, value) => localStorageWrites.push({ key, value }),
    },
    requestAnimationFrame: (handler) => {
      frames.push(handler);
      return frames.length;
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
    birthDate: String(player.birthDate || "").trim(),
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
    getPlayerProfileNewPlayerModalOpen: () => playerProfileNewPlayerModalOpen,
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
    setPlayerProfileNewPlayerModalOpen: (isOpen) => {
      playerProfileNewPlayerModalOpen = Boolean(isOpen);
    },
    setPlayerProfilesState: (nextState) => {
      playerProfilesState = nextState;
    },
    squadProfileSelectedRenderer: { renderModal: (player) => `modal=${player?.id || ""}` },
    squadProfileSupportRenderer: {
      renderNewPlayerModal: (draft = {}) => {
        modalDrafts.push(draft);
        return `new-player-modal=${draft.name || ""}`;
      },
      renderOptionSet: () => "options",
    },
    squadRosterRenderer: {
      renderRosterSections: (players, summaries) => {
        rosterRenderCalls.push({ players, summaries });
        return `roster=${players.map((player) => player.name).join(",")}`;
      },
      renderStatusChip: (statusKey) => `status=${statusKey}`,
    },
    squadWorkspaceRenderer: {
      renderPendingImport: () => "",
      renderWorkspace: ({ canEdit, messageMarkup, newPlayerModalMarkup, rosterSectionsMarkup, teamName }) =>
        `team=${teamName};edit=${canEdit};${messageMarkup};${newPlayerModalMarkup};${rosterSectionsMarkup}`,
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
    frames,
    getState: () => playerProfilesState,
    localStorageWrites,
    medicalUpserts,
    modalDrafts,
    newPlayerForm,
    rosterRenderCalls,
    timers,
    ui,
  };
}

test("Squad player profile runtime facade is the only app-runtime boundary for profile runtime services", () => {
  const app = readProjectFile("app-runtime.js");
  const workspaceComposer = readProjectFile("src/core/workspace-runtime-composer.mjs");
  const facade = readProjectFile("src/modules/squad/player-profile-runtime-facade.mjs");
  const rosterRuntime = readProjectFile("src/modules/squad/squad-roster-runtime-controller.mjs");
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
  expect(facade).toContain("createSquadRosterRuntimeController({");
  expect(rosterRuntime).toContain("isWorkspaceActive");
  expect(rosterRuntime).toContain("generation !== availabilityHydrationGeneration");
  expect(rosterRuntime).toContain("focusedPlayerId");
  expect(rosterRuntime).toContain("preventScroll: true");
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
  expect(harness.rosterRenderCalls[0]?.summaries).toMatchObject({
    medicalStateReady: true,
    includeTrainingAvailability: false,
  });

  harness.frames.shift()?.();
  harness.frames.shift()?.();
  const hydrationTimer = harness.timers.find((timer) => timer.delayMs === 0);
  hydrationTimer?.handler();
  expect(harness.rosterRenderCalls).toHaveLength(1);

  const result = harness.facade.savePlayerProfileEditForm(harness.form);
  expect(result).toMatchObject({ ok: true, status: "success" });
  expect(harness.getState().players[0]).toMatchObject({ id: "p1", name: "Ada Updated" });
  expect(harness.localStorageWrites.some((write) => write.key === "player-profiles")).toBe(true);
  expect(harness.medicalUpserts[0]).toEqual([expect.objectContaining({ id: "p1", name: "Ada Updated" })]);

  expect(harness.facade.savePlayerProfileEditForm(harness.form)).toMatchObject({ ok: true, skipped: true });
});

test("Squad player profile runtime facade preserves Add Player draft values across workspace rerenders", () => {
  const harness = createHarness();

  harness.facade.openPlayerProfileNewPlayerModal();
  harness.newPlayerForm.values = {
    ...harness.newPlayerForm.values,
    name: "Draft Forward",
    number: "17",
    birthDate: "2001-04-05",
    position: "Forward",
    primaryRole: "ST",
    rosterType: "training",
    temporaryGroup: "Academy",
    temporaryFrom: "2026-06-12",
    temporaryTo: "2026-06-18",
  };

  harness.facade.renderPlayerProfilesWorkspace();

  expect(harness.modalDrafts.at(-1)).toMatchObject({
    name: "Draft Forward",
    number: "17",
    birthDate: "2001-04-05",
    position: "Forward",
    primaryRole: "ST",
    rosterType: "training",
    temporaryGroup: "Academy",
    temporaryFrom: "2026-06-12",
    temporaryTo: "2026-06-18",
  });
  expect(harness.ui.playerProfilesWorkspace.innerHTML).toContain("new-player-modal=Draft Forward");
});

test("Squad roster runtime hydrates historical availability one player per task and preserves focus", () => {
  const players = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
  const frames = [];
  const timers = [];
  const snapshotCalls = [];
  const renderCalls = [];
  const contextCalls = [];
  const focusCalls = [];
  const focusedRow = {
    dataset: { playerProfileSelect: "p2" },
    focus: (options) => focusCalls.push(options),
  };
  const focusedControl = { closest: () => focusedRow };
  const listPanel = {
    innerHTML: "",
    contains: (element) => element === focusedControl,
    querySelectorAll: () => [focusedRow],
  };
  const workspace = {
    closest: () => ({ classList: { contains: (value) => value === "is-active" } }),
    matches: () => false,
    querySelector: (selector) => selector === ".squad-list-panel"
      ? listPanel
      : selector === ".squad-board-shell" ? {} : null,
  };
  const controller = createSquadRosterRuntimeController({
    createMedicalSnapshotContext: ({ includeTrainingAvailability }) => {
      contextCalls.push(includeTrainingAvailability);
      return {};
    },
    ensureMedicalState: () => {},
    ensurePlayerProfilesState: () => {},
    getMedicalSnapshot: (playerId) => {
      snapshotCalls.push(playerId);
      return { playerId };
    },
    getPlayers: () => players,
    getRosterSummary: (items) => ({ totalCount: items.length }),
    getTemporaryPlayerProfiles: () => [],
    getVisiblePlayerProfiles: () => players,
    getWorkspace: () => workspace,
    queueAgeHydration: () => {},
    renderRosterSections: (items, summaries) => {
      renderCalls.push({ items, summaries });
      return "roster";
    },
    win: {
      document: { activeElement: focusedControl },
      requestAnimationFrame: (handler) => frames.push(handler),
      setTimeout: (handler, delayMs) => timers.push({ delayMs, handler }),
    },
  });

  expect(controller.renderListOnly()).toBe(true);
  expect(renderCalls).toHaveLength(1);
  expect(renderCalls[0].summaries).toMatchObject({ includeTrainingAvailability: false });
  expect(snapshotCalls).toEqual([]);

  frames.shift()?.();
  frames.shift()?.();
  expect(timers).toHaveLength(1);

  timers.shift()?.handler();
  expect(snapshotCalls).toEqual(["p1"]);
  expect(renderCalls).toHaveLength(1);
  timers.shift()?.handler();
  expect(snapshotCalls).toEqual(["p1", "p2"]);
  expect(renderCalls).toHaveLength(1);
  timers.shift()?.handler();

  expect(snapshotCalls).toEqual(["p1", "p2", "p3"]);
  expect(renderCalls).toHaveLength(2);
  expect(renderCalls[1].summaries).toMatchObject({ includeTrainingAvailability: true });
  expect(renderCalls[1].summaries.medicalSnapshotsByPlayerId).toEqual(new Map([
    ["p1", { playerId: "p1" }],
    ["p2", { playerId: "p2" }],
    ["p3", { playerId: "p3" }],
  ]));
  expect(contextCalls).toEqual([false, true]);
  expect(focusCalls).toEqual([{ preventScroll: true }, { preventScroll: true }]);
});

test("Squad roster runtime cancels queued availability work after leaving the workspace", () => {
  const frames = [];
  const timers = [];
  const snapshotCalls = [];
  let isActive = true;
  const listPanel = {
    innerHTML: "",
    contains: () => false,
    querySelectorAll: () => [],
  };
  const workspace = {
    closest: () => ({ classList: { contains: () => isActive } }),
    matches: () => false,
    querySelector: (selector) => selector === ".squad-list-panel"
      ? listPanel
      : selector === ".squad-board-shell" ? {} : null,
  };
  const controller = createSquadRosterRuntimeController({
    createMedicalSnapshotContext: () => ({}),
    getMedicalSnapshot: (playerId) => snapshotCalls.push(playerId),
    getPlayers: () => [{ id: "p1" }],
    getRosterSummary: () => ({}),
    getTemporaryPlayerProfiles: () => [],
    getVisiblePlayerProfiles: () => [{ id: "p1" }],
    getWorkspace: () => workspace,
    renderRosterSections: () => "roster",
    win: {
      document: { activeElement: null },
      requestAnimationFrame: (handler) => frames.push(handler),
      setTimeout: (handler, delayMs) => timers.push({ delayMs, handler }),
    },
  });

  expect(controller.renderListOnly()).toBe(true);
  frames.shift()?.();
  frames.shift()?.();
  isActive = false;
  timers.shift()?.handler();

  expect(snapshotCalls).toEqual([]);
});
