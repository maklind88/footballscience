import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPlayerProfileRuntimeImportService } from "../src/modules/squad/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHarness(options = {}) {
  let playerProfilesState = options.playerProfilesState || {
    selectedPlayerId: "p1",
    players: [{ id: "p1", name: "Existing Player" }],
    removedPlayerIds: ["p2"],
    changeLog: [],
  };
  let medicalState = options.medicalState || { players: [{ id: "p1", name: "Existing Player" }], records: [] };
  let undoHistory = options.undoHistory || [];
  let lastSnapshot = options.lastSnapshot || null;
  let pendingPlan = options.pendingPlan || null;
  const writes = [];
  const renders = [];
  const medicalSyncs = [];
  const changeLog = [];
  const buildPlan = options.buildPlan || (() => ({
    ok: true,
    status: "success",
    canApply: true,
    importedCount: 1,
    createdCount: 1,
    updatedCount: 0,
    skippedCount: 0,
    errors: [],
    warnings: [],
    rows: [{ row: 1, action: "create", playerName: "Imported Player" }],
    sourceRows: 1,
    duplicateRowsCount: 0,
    nextPlayers: [{ id: "p2", name: "Imported Player" }],
    profilesForMedicalSync: [{ id: "p2", name: "Imported Player" }],
  }));
  class TestFileReader {
    readAsText(file) {
      this.result = file?.content || "{}";
      this.onload?.();
    }
  }
  const service = createPlayerProfileRuntimeImportService({
    buildPlayerProfileImportFeedbackMessage: (result, feedbackOptions = {}) => ({
      status: result.status || "success",
      lines: [`feedback:${result.importedCount || 0}:${feedbackOptions.undoState?.canUndo ? "undo" : "no-undo"}`],
      items: [],
    }),
    buildPlayerProfileImportPlan: buildPlan,
    buildPlayerProfileImportPreviewMessage: (plan) => ({
      status: plan.status || "success",
      lines: [`preview:${plan.importedCount || 0}`],
      items: [],
    }),
    canEditPlayerProfiles: () => options.canEdit !== false,
    cloneMedicalState: (state) => clone(state || {}),
    clonePlayerProfilesState: (state) => clone(state || {}),
    comparePlayerProfiles: (first = {}, second = {}) => String(first.name || "").localeCompare(String(second.name || "")),
    ensureMedicalState: () => medicalState,
    ensurePlayerProfilesState: () => playerProfilesState,
    FileReaderCtor: TestFileReader,
    getCurrentSquadActorLabel: () => "Mak Lind",
    getMedicalState: () => medicalState,
    getNow: () => "2026-05-31T11:14:00.000Z",
    getPendingPlayerProfileImportPlan: () => pendingPlan,
    getPlayerProfileImportUndoHistoryState: () => undoHistory,
    getPlayerProfileImportUndoRelativeTimeLabel: () => "just now",
    getPlayerProfileLastImportSnapshot: () => lastSnapshot,
    getPlayerProfilesState: () => playerProfilesState,
    getRecentPlayerProfileChangeLog: () => changeLog.slice(0, 1),
    normalizePlayerProfileRemovedIds: (value = []) => Array.from(new Set((Array.isArray(value) ? value : []).filter(Boolean))),
    playerProfileImportUndoHistoryLimit: 3,
    recordPlayerProfileChange: (type, player, changes) => {
      changeLog.unshift({
        id: `change-${changeLog.length + 1}`,
        type,
        playerName: player?.name || "",
        actor: "Mak Lind",
        changes,
        createdAt: "2026-05-31T11:14:00.000Z",
      });
    },
    renderPendingPlayerProfileImport: (plan, preview, canEdit) => `pending:${plan.importedCount}:${preview.lines[0]}:${canEdit}`,
    renderPlayerProfilesWorkspace: (message) => renders.push(message),
    setMedicalState: (nextState) => {
      medicalState = nextState;
    },
    setPendingPlayerProfileImportPlan: (nextPlan) => {
      pendingPlan = nextPlan;
    },
    setPlayerProfileImportUndoHistoryState: (nextHistory) => {
      undoHistory = nextHistory;
    },
    setPlayerProfileLastImportSnapshot: (nextSnapshot) => {
      lastSnapshot = nextSnapshot;
    },
    setPlayerProfilesState: (nextState) => {
      playerProfilesState = nextState;
    },
    syncMedicalPlayersFromPlayerProfiles: (players) => medicalSyncs.push(players),
    writeMedicalState: () => writes.push("medical"),
    writePlayerProfilesState: () => writes.push("players"),
  });
  return {
    changeLog,
    getLastSnapshot: () => lastSnapshot,
    getMedicalState: () => medicalState,
    getPendingPlan: () => pendingPlan,
    getState: () => playerProfilesState,
    getUndoHistory: () => undoHistory,
    medicalSyncs,
    renders,
    service,
    writes,
  };
}

test("Squad player profile import service owns import feedback and undo bodies outside app-runtime", () => {
  const app = readProjectFile("app-runtime.js");
  const service = readProjectFile("src/modules/squad/player-profile-runtime-import-service.mjs");
  const index = readProjectFile("src/modules/squad/index.mjs");

  expect(typeof createPlayerProfileRuntimeImportService).toBe("function");
  expect(app).toContain("createPlayerProfileRuntimeImportService({");
  expect(app).toContain("function buildPlayerProfileImportFeedback(...args)");
  expect(app).not.toContain("function importSquadDataFoundationPayload(payload = {}, options = {}) {\nif (!canEditPlayerProfiles())");
  expect(app).not.toContain("function applyPlayerProfileImportUndo() {\nif (!canEditPlayerProfiles())");
  expect(service).toContain("function importSquadDataFoundationPayload(payload = {}, importOptions = {})");
  expect(service).toContain("function applyPlayerProfileImportUndo()");
  expect(service).not.toContain("createDashboardChat");
  expect(index).toContain('export * from "./player-profile-runtime-import-service.mjs";');
});

test("Squad player profile import service applies imports and registers undo snapshots", () => {
  const harness = createHarness();
  const result = harness.service.importSquadDataFoundationPayload({}, { apply: true });

  expect(result).toMatchObject({
    ok: true,
    status: "success",
    importedCount: 1,
    createdCount: 1,
    canApply: false,
  });
  expect(harness.getState().players.map((player) => player.id)).toEqual(["p2"]);
  expect(harness.getState().removedPlayerIds).toEqual([]);
  expect(harness.medicalSyncs).toEqual([[{ id: "p2", name: "Imported Player" }]]);
  expect(harness.writes).toEqual(["players", "medical"]);
  expect(harness.getUndoHistory()).toHaveLength(1);
  expect(harness.service.getPlayerProfileImportUndoState()).toMatchObject({
    canUndo: true,
    label: "Undo import (1)",
  });
  expect(harness.service.buildPlayerProfileImportFeedback(result).lines[0]).toBe("feedback:1:undo");
});

test("Squad player profile import service blocks stale previews and restores snapshots", () => {
  const harness = createHarness();
  const staleResult = harness.service.importSquadDataFoundationPayload({}, {
    apply: true,
    playerProfilesImportLogHeadId: "older-change",
  });

  expect(staleResult).toMatchObject({
    ok: false,
    status: "warning",
    canApply: false,
  });

  harness.service.importSquadDataFoundationPayload({}, { apply: true });
  expect(harness.getState().players.map((player) => player.id)).toEqual(["p2"]);

  const undoResult = harness.service.applyPlayerProfileImportUndo();
  expect(undoResult).toMatchObject({ status: "success" });
  expect(harness.getState().players.map((player) => player.id)).toEqual(["p1"]);
  expect(harness.getMedicalState().players.map((player) => player.id)).toEqual(["p1"]);
  expect(harness.getUndoHistory()).toEqual([]);
});

test("Squad player profile import service preserves file preview and pending import rendering", () => {
  const harness = createHarness();
  harness.service.importSquadDataFoundationFile({
    content: JSON.stringify({ players: [{ id: "p2", name: "Imported Player" }] }),
  });

  expect(harness.getPendingPlan()).toMatchObject({
    importedCount: 1,
    playerProfilesImportLogHeadId: "",
  });
  expect(harness.renders[0]).toMatchObject({
    status: "success",
    lines: ["preview:1", "Review changes then choose Apply or Cancel."],
    items: [],
  });
  expect(harness.service.renderPendingPlayerProfileImport()).toBe("pending:1:preview:1:true");
});

test("Squad player profile import service keeps read-only users out of imports and undo", () => {
  const harness = createHarness({ canEdit: false });

  expect(harness.service.getPlayerProfileImportUndoState()).toMatchObject({
    canUndo: false,
    reason: "Undo is disabled because your role is read-only.",
  });
  expect(harness.service.importSquadDataFoundationPayload({}, { apply: true })).toMatchObject({
    ok: false,
    status: "warning",
    errors: [{ row: 0, message: "Your role cannot apply player profile imports." }],
  });

  harness.service.importSquadDataFoundationFile({ content: "{}" });
  expect(harness.renders[0]).toMatchObject({
    status: "warning",
    lines: ["Your role cannot import player profile changes."],
  });
});
