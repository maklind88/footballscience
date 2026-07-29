import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildIdpDashboardFromSquadState, buildLegacyPlayerDetail } from "../src/modules/idp/idp-adapter.mjs";
import { createIdpActions } from "../src/modules/idp/idp-actions.mjs";
import { selectedClipIds } from "../src/modules/idp/idp-clip-preview-controller.mjs";
import { renderIdpClipPreviewOverlay } from "../src/modules/idp/idp-clip-bank-renderer.mjs";
import { normalizeIdpDevelopmentIntervention, normalizeIdpProfile } from "../src/modules/idp/domain/idp.models.mjs";
import { renderIdpWorkspace } from "../src/modules/idp/idp-renderer.mjs";
import {
  bindIdpPlayerBoardEvents,
  getIdpPlayerBoardRuntimeUi,
  handleIdpPlayerBoardClick,
  handleIdpPlayerBoardInput,
  persistIdpPlayerBoardDraft,
} from "../src/modules/idp/idp-player-board-runtime.mjs";
import { createIdpStore } from "../src/modules/idp/idp-state.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleDir = path.join(rootDir, "src/modules/idp");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("idp module keeps the required isolated file structure", () => {
  for (const relativePath of [
    "src/modules/idp/index.mjs",
    "src/modules/idp/idp-actions.mjs",
    "src/modules/idp/idp-adapter.mjs",
    "src/modules/idp/idp-clip-bank-renderer.mjs",
    "src/modules/idp/idp-clip-preview-controller.mjs",
    "src/modules/idp/idp-renderer.mjs",
    "src/modules/idp/idp-state.mjs",
    "src/modules/idp/idp.css",
    "src/modules/idp/idp-clip-bank.css",
    "src/modules/idp/idp-player-board-helpers.mjs",
    "src/modules/idp/idp-player-board-renderer.mjs",
    "src/modules/idp/idp-player-board-runtime.mjs",
    "src/modules/idp/idp-profile-focus.css",
    "src/modules/idp/constants/idp-options.mjs",
    "src/modules/idp/domain/idp.models.mjs",
    "src/modules/idp/services/idp-api-service.mjs",
  ]) {
    expect(fs.existsSync(path.join(rootDir, relativePath)), relativePath).toBe(true);
  }
});

test("idp UI modules avoid direct database access and use only the API service for network calls", () => {
  for (const file of fs.readdirSync(moduleDir).filter((entry) => entry.endsWith(".mjs"))) {
    const source = read(`src/modules/idp/${file}`);
    expect(source, file).not.toMatch(/supabase|service_role|SUPABASE|from\(["'`]/i);
    if (file !== "idp-actions.mjs") {
      expect(source, file).not.toMatch(/fetch\(/);
    }
  }

  expect(read("src/modules/idp/services/idp-api-service.mjs")).toContain("/api/idp");
  expect(read("api/idp.js")).toContain('route: "/api/idp"');
  expect(read("api/idp.js")).toContain('moduleId: "idp"');
});

test("idp board normalization preserves explicitly empty object layers", () => {
  const intervention = normalizeIdpDevelopmentIntervention({
    id: "board-1",
    board_state: {
      schema: "idp-player-board-v2",
      player: { x: 50, y: 70 },
      cones: [{ id: "top-cone", x: 40, y: 58 }],
      zones: [{ id: "top-zone", label: "Top zone", x: 30, y: 30 }],
      arrows: [{ id: "top-arrow", type: "run", label: "Top run", from: { x: 50, y: 70 }, to: { x: 60, y: 40 } }],
      notes: [{ id: "top-note", text: "Top note", x: 12, y: 14 }],
      activeFrameIndex: 1,
      frames: [
        { id: "frame-1", label: "Inherited object frame" },
        { id: "frame-2", label: "Empty object frame", cones: [], zones: [], arrows: [], notes: [] },
      ],
    },
  });

  expect(intervention.boardState.frames[0].cones).toHaveLength(1);
  expect(intervention.boardState.frames[1].cones).toEqual([]);
  expect(intervention.boardState.frames[1].zones).toEqual([]);
  expect(intervention.boardState.frames[1].arrows).toEqual([]);
  expect(intervention.boardState.frames[1].notes).toEqual([]);
  expect(intervention.boardState.cones).toEqual([]);
});

test("idp evidence edits and deletes stay behind the server-owned database boundary", () => {
  const apiService = read("src/modules/idp/services/idp-api-service.mjs");
  const databaseSource = read("api/_lib/idp-database.js");

  expect(apiService).toContain('action: "update-evidence"');
  expect(apiService).toContain('action: "delete-evidence"');
  expect(databaseSource).toContain("async function updateEvidence");
  expect(databaseSource).toContain("async function deleteEvidence");
  expect(databaseSource).toContain('patchRows("idp_evidence"');
  expect(databaseSource).toContain("deleted_at: new Date().toISOString()");
  expect(databaseSource).toContain("deleted_by: scope.actorId");
  expect(databaseSource).not.toContain('deleteRows("idp_evidence"');
});

test("idp clip bank removal is server-owned and soft-deleted", () => {
  const apiService = read("src/modules/idp/services/idp-api-service.mjs");
  const databaseSource = read("api/_lib/idp-database.js");
  const idpRuntime = read("src/modules/idp/index.mjs");
  const clipBankRenderer = read("src/modules/idp/idp-clip-bank-renderer.mjs");

  expect(apiService).toContain('action: "remove-clip-bank-item"');
  expect(databaseSource).toContain("async function removeClipBankItem");
  expect(databaseSource).toContain('patchRows("idp_clip_bank_items"');
  expect(databaseSource).toContain('action: "clip_bank.removed"');
  expect(databaseSource).toContain('entityType: "idp_clip_bank_item"');
  expect(databaseSource).toContain('status: "Hidden"');
  expect(databaseSource).toContain("deleted_at: new Date().toISOString()");
  expect(databaseSource).toContain("deleted_by: scope.actorId");
  expect(databaseSource).not.toContain('deleteRows("idp_clip_bank_items"');
  expect(idpRuntime).toContain("data-idp-clip-remove");
  expect(clipBankRenderer).toContain("idp-clip-bank-row__actions");
  expect(clipBankRenderer).toContain('aria-label="Play clip"');
  expect(clipBankRenderer).toContain('d="M8 5v14l11-7L8 5Z"');
  expect(clipBankRenderer).toContain("Remove from Clip Bank");
  expect(clipBankRenderer).toContain('aria-label="Remove clip from Clip Bank"');
  expect(clipBankRenderer).toContain("<svg viewBox=\"0 0 24 24\"");
});

test("idp focus archive and delete stay behind the server-owned database boundary", () => {
  const apiService = read("src/modules/idp/services/idp-api-service.mjs");
  const databaseSource = read("api/_lib/idp-database.js");
  const idpRuntime = read("src/modules/idp/index.mjs");

  expect(apiService).toContain('action: "archive-focus"');
  expect(apiService).toContain('action: "delete-focus"');
  expect(databaseSource).toContain("async function archiveFocus");
  expect(databaseSource).toContain("async function deleteFocus");
  expect(databaseSource).toContain('patchRows("idp_focuses"');
  expect(databaseSource).toContain('"focus.archived"');
  expect(databaseSource).toContain('"focus.deleted"');
  expect(databaseSource).toContain("deleted_at: new Date().toISOString()");
  expect(databaseSource).toContain("deleted_by: scope.actorId");
  expect(databaseSource).not.toContain('deleteRows("idp_focuses"');
  expect(idpRuntime).toContain("data-idp-archive-focus");
  expect(idpRuntime).toContain("data-idp-delete-focus");
});

test("idp player board interventions remain server-owned and isolated from Session Planner", () => {
  const apiService = read("src/modules/idp/services/idp-api-service.mjs");
  const databaseSource = read("api/_lib/idp-database.js");
  const migration = read("supabase/migrations/20260621230015_add_idp_development_interventions.sql");
  const domainModels = read("src/modules/idp/domain/idp.models.mjs");
  const idpRenderer = read("src/modules/idp/idp-renderer.mjs");
  const idpRuntime = read("src/modules/idp/index.mjs");
  const boardHelpers = read("src/modules/idp/idp-player-board-helpers.mjs");
  const boardRenderer = read("src/modules/idp/idp-player-board-renderer.mjs");
  const boardRuntime = read("src/modules/idp/idp-player-board-runtime.mjs");
  const idpCss = read("src/modules/idp/idp.css");
  const idpState = read("src/modules/idp/idp-state.mjs");

  expect(apiService).toContain('action: "create-intervention"');
  expect(apiService).toContain('action: "update-intervention"');
  expect(apiService).toContain('action: "archive-intervention"');
  expect(apiService).toContain('action: "create-goal"');
  expect(databaseSource).toContain("idp_development_interventions");
  expect(databaseSource).toContain("async function createDevelopmentIntervention");
  expect(databaseSource).toContain("async function updateDevelopmentIntervention");
  expect(databaseSource).toContain("async function archiveDevelopmentIntervention");
  expect(databaseSource).toContain("row_version");
  expect(databaseSource).toContain("insertAuditEvent");
  expect(databaseSource).toContain("requireOwnedFocus");
  expect(databaseSource).toContain("requireOwnedGoal");
  expect(databaseSource).toContain("Development goal belongs to a different focus.");
  expect(databaseSource).toContain("OPTIONAL_MIGRATION_TABLES");
  expect(databaseSource).toContain("isMissingOptionalTable");
  expect(databaseSource).toContain("normalizeBoardLineStyle");
  expect(databaseSource).toContain("lineWidth");
  expect(databaseSource).toContain("normalizeTacticalFrames");
  expect(databaseSource).toContain("tacticalFrames");
  expect(databaseSource).toContain("tacticalElements");
  expect(databaseSource).toContain("goal_id");
  expect(databaseSource).toContain("success_criteria");
  expect(domainModels).toContain("function normalizeBoardState");
  expect(domainModels).toContain("normalizeBoardLineStyle");
  expect(domainModels).toContain("lineWidth");
  expect(domainModels).toContain("normalizeTacticalFrames");
  expect(domainModels).toContain("tacticalFrames");
  expect(domainModels).toContain("tacticalElements");
  expect(migration).toContain("create table if not exists public.idp_development_interventions");
  expect(migration).toContain("board_state jsonb");
  expect(migration).toContain("alter table public.idp_development_interventions enable row level security");
  expect(migration).toContain("revoke all on public.idp_development_interventions from anon, authenticated");
  expect(migration).toContain("grant select, insert, update, delete on public.idp_development_interventions to service_role");
  expect(migration).toContain("idp_development_interventions_prevent_hard_delete");
  expect(idpRenderer).toContain("renderIdpPlayerBoardPage");
  expect(idpRenderer).toContain("data-idp-profile-view=\"player-board\"");
  expect(idpRuntime).toContain("handleIdpPlayerBoardClick");
  expect(idpRuntime).toContain("saveCurrentPlayerBoardDraft");
  expect(boardHelpers).toContain("idp-player-board-tactical-v1");
  expect(boardRenderer).toContain("createSessionPlannerVisualRenderer");
  expect(boardRenderer).toContain("data-idp-board-open");
  expect(boardRenderer).toContain("data-idp-board-save");
  expect(boardRenderer).toContain("data-idp-board-new");
  expect(boardRenderer).toContain("data-idp-board-delete");
  expect(boardRenderer).toContain("data-idp-board-title");
  expect(boardRenderer).toContain("data-idp-board-objective");
  expect(boardRenderer).toContain("idp-player-board-exercise-bank");
  expect(boardRuntime).toContain("createSessionPlannerTacticalController");
  expect(boardRuntime).toContain("data-idp-board-select");
  expect(boardRuntime).toContain("persistIdpPlayerBoardDraft");
  expect(boardRuntime).toContain("savePlayerBoard");
  expect(idpRuntime).toContain("deletePlayerBoard");
  expect(idpRuntime).toContain("data-idp-board-delete");
  expect(idpCss).toContain("idp-profile-player-board-page");
  expect(idpState).toContain("idpPlayerBoardUiDefaults");
  expect(boardHelpers).toContain("idpPlayerBoardOpen");
  expect(idpState).toContain("idpPlayerBoardClipboard");
  expect(read("src/modules/session-planner/session-planner-renderer.mjs")).not.toContain("idpPlayerBoard");
  expect(read("src/modules/session-planner/session-planner-workspace-controller.mjs")).not.toContain("idpPlayerBoard");
});

test("idp player board tactical modal places objects only after Session Planner-style double-click without page repainting transient state", () => {
  const rootListeners = {};
  const windowListeners = {};
  const canvasRect = { left: 100, top: 200, width: 400, height: 600 };
  const canvas = {
    getBoundingClientRect: () => canvasRect,
    closest: (selector) => selector === "[data-session-tactical-canvas]" ? canvas : null,
  };
  const canvasWrap = { innerHTML: "" };
  const root = {
    addEventListener: (type, listener) => {
      rootListeners[type] = listener;
    },
    removeEventListener: () => {},
    querySelector: (selector) => selector === "[data-session-tactical-canvas-wrap]" ? canvasWrap : null,
    querySelectorAll: () => [],
  };
  const store = createIdpStore({
    ui: {
      idpPlayerBoardOpen: true,
      idpPlayerBoardTool: "red-player",
      idpPlayerBoardSnapEnabled: false,
    },
    playerDetail: {
      profile: { playerId: "player-1", playerName: "Test Player" },
      focuses: [{ id: "focus-1", title: "Current focus", status: "active" }],
      interventions: [],
    },
  });
  const originalSetState = store.setState;
  let setStateCalls = 0;
  store.setState = (patch) => {
    setStateCalls += 1;
    originalSetState(patch);
  };
  const runtime = {
    context: {
      canEdit: () => true,
      ui: { idpWorkspace: root },
      win: {
        addEventListener: (type, listener) => {
          windowListeners[type] = listener;
        },
        removeEventListener: () => {},
        document: {},
        FileReader: class {},
        Image: class {},
        prompt: () => "",
      },
    },
    paint: () => {},
    store,
  };

  bindIdpPlayerBoardEvents(runtime);
  const clickCanvas = () => {
    rootListeners.pointerdown({
      target: canvas,
      clientX: 220,
      clientY: 380,
      preventDefault() {},
      stopPropagation() {},
    });
    windowListeners.pointerup({});
  };
  clickCanvas();

  const runtimeUi = getIdpPlayerBoardRuntimeUi(runtime);
  expect(runtimeUi.idpPlayerBoardSelectionState).toBeNull();
  expect(store.getState().ui.idpPlayerBoardSelectionState).toBeNull();
  expect(setStateCalls).toBe(0);
  expect(canvasWrap.innerHTML).not.toContain("session-tactical-red-player");

  clickCanvas();

  expect(canvasWrap.innerHTML).toContain("session-tactical-red-player");
  expect(store.getState().playerDetail.interventions).toHaveLength(0);
  expect(setStateCalls).toBe(0);

  const draftPayload = persistIdpPlayerBoardDraft(runtime);
  const placedElement = draftPayload?.boardState?.tacticalElements?.[0];
  expect(draftPayload?.id).toBe("");
  expect(draftPayload?.rowVersion).toBe(0);
  expect(placedElement?.type).toBe("red-player");
  expect(placedElement?.x).toBe(30);
  expect(placedElement?.y).toBe(30);
  expect(store.getState().playerDetail.interventions[0]?.boardState?.tacticalElements?.[0]?.type).toBe("red-player");
  expect(setStateCalls).toBe(1);
});

test("idp player board keeps plain canvas click as selection-only and places equipment on double-click", () => {
  const rootListeners = {};
  const canvasRect = { left: 100, top: 200, width: 400, height: 600 };
  const canvas = {
    getBoundingClientRect: () => canvasRect,
    closest: (selector) => selector === "[data-session-tactical-canvas]" ? canvas : null,
  };
  const canvasWrap = { innerHTML: "" };
  const root = {
    addEventListener: (type, listener) => {
      rootListeners[type] = listener;
    },
    removeEventListener: () => {},
    querySelector: (selector) => selector === "[data-session-tactical-canvas-wrap]" ? canvasWrap : null,
    querySelectorAll: () => [],
  };
  const store = createIdpStore({
    ui: {
      idpPlayerBoardOpen: true,
      idpPlayerBoardTool: "ball",
      idpPlayerBoardSnapEnabled: false,
    },
    playerDetail: {
      profile: { playerId: "player-1", playerName: "Test Player" },
      focuses: [{ id: "focus-1", title: "Current focus", status: "active" }],
      interventions: [],
    },
  });
  const originalSetState = store.setState;
  let setStateCalls = 0;
  store.setState = (patch) => {
    setStateCalls += 1;
    originalSetState(patch);
  };
  const runtime = {
    context: {
      canEdit: () => true,
      ui: { idpWorkspace: root },
      win: {
        document: {},
        FileReader: class {},
        Image: class {},
        prompt: () => "",
      },
    },
    paint: () => {},
    store,
  };

  bindIdpPlayerBoardEvents(runtime);
  expect(handleIdpPlayerBoardClick({
    target: canvas,
    detail: 1,
    clientX: 220,
    clientY: 380,
    preventDefault() {},
  }, runtime)).toBe(true);

  expect(canvasWrap.innerHTML).not.toContain("session-tactical-ball");
  expect(store.getState().playerDetail.interventions).toHaveLength(0);
  expect(setStateCalls).toBe(0);

  rootListeners.dblclick({
    target: canvas,
    detail: 2,
    clientX: 220,
    clientY: 380,
    preventDefault() {},
    stopPropagation() {},
  });

  expect(canvasWrap.innerHTML).toContain("session-tactical-ball");
  expect(store.getState().playerDetail.interventions).toHaveLength(0);
  expect(setStateCalls).toBe(0);

  const draftPayload = persistIdpPlayerBoardDraft(runtime);
  const placedElement = draftPayload?.boardState?.tacticalElements?.[0];
  expect(placedElement).toMatchObject({ type: "ball", x: 30, y: 30 });
  expect(setStateCalls).toBe(1);
});

test("idp player board pointer tools stay active when modal DOM is open and store open state lags", () => {
  const rootListeners = {};
  const windowListeners = {};
  const canvasRect = { left: 100, top: 200, width: 400, height: 600 };
  const modal = {};
  const canvas = {
    getBoundingClientRect: () => canvasRect,
    closest: (selector) => {
      if (selector === "[data-session-tactical-canvas]") return canvas;
      if (selector === ".session-tacticalboard-modal") return modal;
      return null;
    },
  };
  const canvasWrap = { innerHTML: "" };
  const root = {
    addEventListener: (type, listener) => {
      rootListeners[type] = listener;
    },
    removeEventListener: () => {},
    querySelector: (selector) => selector === "[data-session-tactical-canvas-wrap]" ? canvasWrap : null,
    querySelectorAll: () => [],
  };
  const store = createIdpStore({
    ui: {
      idpPlayerBoardOpen: false,
      idpPlayerBoardTool: "cone",
      idpPlayerBoardSnapEnabled: false,
    },
    playerDetail: {
      profile: { playerId: "player-1", playerName: "Test Player" },
      focuses: [{ id: "focus-1", title: "Current focus", status: "active" }],
      interventions: [],
    },
  });
  const runtime = {
    context: {
      canEdit: () => true,
      ui: { idpWorkspace: root },
      win: {
        addEventListener: (type, listener) => {
          windowListeners[type] = listener;
        },
        removeEventListener: () => {},
        document: {},
        FileReader: class {},
        Image: class {},
        prompt: () => "",
      },
    },
    paint: () => {},
    store,
  };

  bindIdpPlayerBoardEvents(runtime);
  const clickCanvas = () => {
    rootListeners.pointerdown({
      target: canvas,
      clientX: 220,
      clientY: 380,
      preventDefault() {},
      stopPropagation() {},
    });
    windowListeners.pointerup({
      target: canvas,
      clientX: 220,
      clientY: 380,
    });
  };
  clickCanvas();
  expect(getIdpPlayerBoardRuntimeUi(runtime).idpPlayerBoardOpen).toBe(true);
  expect(canvasWrap.innerHTML).not.toContain("session-tactical-cone");
  clickCanvas();

  expect(canvasWrap.innerHTML).toContain("session-tactical-cone");
  expect(store.getState().ui.idpPlayerBoardOpen).toBe(false);

  const closeTarget = {
    matches: () => false,
    closest: (selector) => selector === "[data-session-close-tacticalboard]" ? closeTarget : null,
  };
  expect(handleIdpPlayerBoardClick({ target: closeTarget, preventDefault() {} }, runtime)).toBe(true);
  expect(getIdpPlayerBoardRuntimeUi(runtime).idpPlayerBoardOpen).toBe(false);
});

test("idp player board drags existing objects smoothly by default without inspector-triggered store repaint", () => {
  const rootListeners = {};
  const windowListeners = {};
  const canvasRect = { left: 100, top: 200, width: 400, height: 600 };
  const canvas = {
    getBoundingClientRect: () => canvasRect,
    closest: (selector) => selector === "[data-session-tactical-canvas]" ? canvas : null,
  };
  const element = {
    dataset: { sessionTacticalElementId: "ball-1" },
    closest: (selector) => {
      if (selector === "[data-session-tactical-canvas]") return canvas;
      if (selector === "[data-session-tactical-element-id]") return element;
      return null;
    },
  };
  const canvasWrap = { innerHTML: "" };
  const colorInput = { value: "" };
  const widthInput = { value: "" };
  const styleInput = { value: "" };
  const root = {
    addEventListener: (type, listener) => {
      rootListeners[type] = listener;
    },
    removeEventListener: () => {},
    querySelector: (selector) => {
      if (selector === "[data-session-tactical-canvas-wrap]") return canvasWrap;
      if (selector === "[data-session-tactical-color]") return colorInput;
      if (selector === "[data-session-tactical-width]") return widthInput;
      if (selector === "[data-session-tactical-style]") return styleInput;
      return null;
    },
    querySelectorAll: () => [],
  };
  const store = createIdpStore({
    ui: {
      idpPlayerBoardOpen: true,
      idpPlayerBoardTool: "ball",
      idpPlayerBoardSelectedInterventionId: "intervention-1",
    },
    playerDetail: {
      profile: { playerId: "player-1", playerName: "Test Player" },
      focuses: [{ id: "focus-1", title: "Current focus", status: "active" }],
      interventions: [{
        id: "intervention-1",
        rowVersion: 1,
        focusId: "focus-1",
        title: "Board",
        boardState: {
          tacticalPitchMode: "full",
          tacticalElements: [{ id: "ball-1", type: "ball", x: 40, y: 50, color: "#1d1d1f" }],
          tacticalFrames: [{
            id: "frame-1",
            label: "Frame 1",
            elements: [{ id: "ball-1", type: "ball", x: 40, y: 50, color: "#1d1d1f" }],
          }],
          tacticalActiveFrameId: "frame-1",
        },
      }],
    },
  });
  const originalSetState = store.setState;
  let setStateCalls = 0;
  store.setState = (patch) => {
    setStateCalls += 1;
    originalSetState(patch);
  };
  const runtime = {
    context: {
      canEdit: () => true,
      ui: { idpWorkspace: root },
      win: {
        addEventListener: (type, listener) => {
          windowListeners[type] = listener;
        },
        removeEventListener: () => {},
        document: {},
        FileReader: class {},
        Image: class {},
        prompt: () => "",
      },
    },
    paint: () => {},
    store,
  };

  bindIdpPlayerBoardEvents(runtime);
  rootListeners.pointerdown({
    target: element,
    clientX: 260,
    clientY: 500,
    preventDefault() {},
    stopPropagation() {},
  });
  const dragState = getIdpPlayerBoardRuntimeUi(runtime).idpPlayerBoardDragState;
  expect(dragState?.canvasRect?.width).toBe(400);
  expect(setStateCalls).toBe(0);

  windowListeners.pointermove({
    target: element,
    clientX: 308,
    clientY: 548,
  });
  windowListeners.pointerup({
    target: element,
    clientX: 308,
    clientY: 548,
  });

  const movedElement = runtime.idpPlayerBoardActiveBlock.tacticalElements[0];
  expect(movedElement?.type).toBe("ball");
  expect(movedElement?.x).toBeCloseTo(52, 4);
  expect(movedElement?.y).toBeCloseTo(58, 4);
  expect(canvasWrap.innerHTML).toContain("session-tactical-ball");
  expect(setStateCalls).toBe(0);
});

test("idp player board controller follows the current workspace root after a repaint", () => {
  const rootListeners = {};
  const windowListeners = {};
  const canvasRect = { left: 100, top: 200, width: 400, height: 600 };
  const canvas = {
    getBoundingClientRect: () => canvasRect,
    closest: (selector) => selector === "[data-session-tactical-canvas]" ? canvas : null,
  };
  const currentCanvasWrap = { innerHTML: "" };
  const staleRoot = {
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const currentRoot = {
    addEventListener: (type, listener) => {
      rootListeners[type] = listener;
    },
    removeEventListener: () => {},
    querySelector: (selector) => selector === "[data-session-tactical-canvas-wrap]" ? currentCanvasWrap : null,
    querySelectorAll: () => [],
  };
  let workspaceRoot = staleRoot;
  const store = createIdpStore({
    ui: {
      idpPlayerBoardOpen: true,
      idpPlayerBoardTool: "cone",
      idpPlayerBoardSnapEnabled: false,
    },
    playerDetail: {
      profile: { playerId: "player-1", playerName: "Test Player" },
      focuses: [{ id: "focus-1", title: "Current focus", status: "active" }],
      interventions: [],
    },
  });
  const runtime = {
    context: {
      canEdit: () => true,
      ui: {
        get idpWorkspace() {
          return workspaceRoot;
        },
      },
      win: {
        addEventListener: (type, listener) => {
          windowListeners[type] = listener;
        },
        removeEventListener: () => {},
        document: {},
        FileReader: class {},
        Image: class {},
        prompt: () => "",
      },
    },
    paint: () => {},
    store,
  };
  const colorField = {
    value: "#f97316",
    closest: (selector) => selector === "[data-session-tactical-color]" ? colorField : null,
  };

  expect(handleIdpPlayerBoardInput({ target: colorField }, runtime)).toBe(true);
  workspaceRoot = currentRoot;
  bindIdpPlayerBoardEvents(runtime);
  const clickCanvas = () => {
    rootListeners.pointerdown({
      target: canvas,
      clientX: 220,
      clientY: 380,
      preventDefault() {},
      stopPropagation() {},
    });
    windowListeners.pointerup({});
  };
  clickCanvas();
  expect(currentCanvasWrap.innerHTML).not.toContain("session-tactical-cone");
  clickCanvas();

  expect(currentCanvasWrap.innerHTML).toContain("session-tactical-cone");
});

test("idp player board tactical modal draws line tools from canvas coordinates without page repainting transient state", () => {
  const rootListeners = {};
  const windowListeners = {};
  const canvasRect = { left: 100, top: 200, width: 400, height: 600 };
  const canvas = {
    getBoundingClientRect: () => canvasRect,
    closest: (selector) => selector === "[data-session-tactical-canvas]" ? canvas : null,
  };
  const canvasWrap = { innerHTML: "" };
  const root = {
    addEventListener: (type, listener) => {
      rootListeners[type] = listener;
    },
    removeEventListener: () => {},
    querySelector: (selector) => selector === "[data-session-tactical-canvas-wrap]" ? canvasWrap : null,
    querySelectorAll: () => [],
  };
  const store = createIdpStore({
    ui: {
      idpPlayerBoardOpen: true,
      idpPlayerBoardTool: "pass",
      idpPlayerBoardSnapEnabled: false,
    },
    playerDetail: {
      profile: { playerId: "player-1", playerName: "Test Player" },
      focuses: [{ id: "focus-1", title: "Current focus", status: "active" }],
      interventions: [],
    },
  });
  const originalSetState = store.setState;
  let setStateCalls = 0;
  store.setState = (patch) => {
    setStateCalls += 1;
    originalSetState(patch);
  };
  const runtime = {
    context: {
      canEdit: () => true,
      ui: { idpWorkspace: root },
      win: {
        addEventListener: (type, listener) => {
          windowListeners[type] = listener;
        },
        removeEventListener: () => {},
        document: {},
        FileReader: class {},
        Image: class {},
        prompt: () => "",
      },
    },
    paint: () => {},
    store,
  };
  const clickCanvas = (clientX, clientY) => {
    rootListeners.pointerdown({
      target: canvas,
      clientX,
      clientY,
      preventDefault() {},
      stopPropagation() {},
    });
    windowListeners.pointerup({});
  };

  bindIdpPlayerBoardEvents(runtime);
  clickCanvas(220, 380);

  const runtimeUi = getIdpPlayerBoardRuntimeUi(runtime);
  expect(runtimeUi.idpPlayerBoardPendingPoint).toMatchObject({ type: "pass", x: 30, y: 30 });
  expect(store.getState().playerDetail.interventions).toHaveLength(0);
  expect(setStateCalls).toBe(0);

  clickCanvas(300, 500);

  expect(canvasWrap.innerHTML).toContain("session-tactical-pass");
  expect(store.getState().playerDetail.interventions).toHaveLength(0);
  expect(setStateCalls).toBe(0);

  const draftPayload = persistIdpPlayerBoardDraft(runtime);
  const drawnElement = draftPayload?.boardState?.tacticalElements?.[0];
  expect(draftPayload?.id).toBe("");
  expect(draftPayload?.rowVersion).toBe(0);
  expect(drawnElement).toMatchObject({ type: "pass", x: 30, y: 30, x2: 50, y2: 50 });
  expect(store.getState().playerDetail.interventions[0]?.boardState?.tacticalElements?.[0]?.type).toBe("pass");
  expect(setStateCalls).toBe(1);
});

test("idp player board keeps a new draft visible after closing the editor", () => {
  const rootListeners = {};
  const windowListeners = {};
  const canvasRect = { left: 100, top: 200, width: 400, height: 600 };
  const canvas = {
    getBoundingClientRect: () => canvasRect,
    closest: (selector) => selector === "[data-session-tactical-canvas]" ? canvas : null,
  };
  const canvasWrap = { innerHTML: "" };
  const root = {
    addEventListener: (type, listener) => {
      rootListeners[type] = listener;
    },
    removeEventListener: () => {},
    querySelector: (selector) => selector === "[data-session-tactical-canvas-wrap]" ? canvasWrap : null,
    querySelectorAll: () => [],
  };
  const store = createIdpStore({
    ui: {
      selectedPlayerId: "player-1",
      profileView: "player-board",
      idpPlayerBoardOpen: true,
      idpPlayerBoardTool: "ball",
      idpPlayerBoardSelectedInterventionId: "new-idp-player-board-exercise",
      idpPlayerBoardSnapEnabled: false,
    },
    playerDetail: {
      profile: { playerId: "player-1", playerName: "Test Player", status: "active" },
      focuses: [{ id: "focus-1", title: "Current focus", status: "Active" }],
      interventions: [],
      clipBank: [],
      evidence: [],
      reviews: [],
      nextActions: [],
      milestones: [],
      ownership: [],
      goals: [],
      goalCheckins: [],
    },
  });
  const runtime = {
    context: {
      canEdit: () => true,
      ui: { idpWorkspace: root },
      win: {
        addEventListener: (type, listener) => {
          windowListeners[type] = listener;
        },
        removeEventListener: () => {},
        document: {},
        FileReader: class {},
        Image: class {},
        prompt: () => "",
      },
    },
    paint: () => {},
    store,
  };

  bindIdpPlayerBoardEvents(runtime);
  const clickCanvas = () => {
    rootListeners.pointerdown({
      target: canvas,
      clientX: 220,
      clientY: 380,
      preventDefault() {},
      stopPropagation() {},
    });
    windowListeners.pointerup({});
  };
  clickCanvas();
  expect(canvasWrap.innerHTML).not.toContain("session-tactical-ball");
  clickCanvas();

  expect(canvasWrap.innerHTML).toContain("session-tactical-ball");
  expect(store.getState().playerDetail.interventions).toHaveLength(0);

  const closeTarget = {
    closest: (selector) => selector === "[data-session-close-tacticalboard]" ? closeTarget : null,
    matches: () => false,
  };
  expect(handleIdpPlayerBoardClick({ target: closeTarget, preventDefault() {} }, runtime)).toBe(true);

  const state = store.getState();
  expect(state.ui.idpPlayerBoardOpen).toBe(false);
  expect(state.ui.idpPlayerBoardSelectedInterventionId).toBe("draft-idp-player-board");
  expect(state.playerDetail.interventions).toHaveLength(1);
  expect(state.playerDetail.interventions[0]?.boardState?.tacticalElements?.[0]?.type).toBe("ball");

  const playerBoardHtml = renderIdpWorkspace(state, { canEdit: true, users: [] });
  expect(playerBoardHtml).toContain("session-tactical-ball");
  expect(playerBoardHtml).not.toContain("Create a current focus first");
});

test("idp player board captures the current drawing before async save work can repaint the editor", async () => {
  const rootListeners = {};
  const windowListeners = {};
  const canvasRect = { left: 100, top: 200, width: 400, height: 600 };
  const canvas = {
    getBoundingClientRect: () => canvasRect,
    closest: (selector) => selector === "[data-session-tactical-canvas]" ? canvas : null,
  };
  const canvasWrap = { innerHTML: "" };
  const root = {
    addEventListener: (type, listener) => {
      rootListeners[type] = listener;
    },
    removeEventListener: () => {},
    querySelector: (selector) => selector === "[data-session-tactical-canvas-wrap]" ? canvasWrap : null,
    querySelectorAll: () => [],
  };
  const store = createIdpStore({
    ui: {
      idpPlayerBoardOpen: true,
      idpPlayerBoardTool: "cone",
      idpPlayerBoardSelectedInterventionId: "new-idp-player-board-exercise",
      idpPlayerBoardSnapEnabled: false,
    },
    playerDetail: {
      profile: { playerId: "player-1", playerName: "Test Player" },
      focuses: [{ id: "focus-1", title: "Current focus", status: "Active" }],
      interventions: [],
    },
  });
  let savePayload = null;
  let pendingSave = Promise.resolve();
  const runtime = {
    actions: {
      savePlayerBoard: async (payload) => {
        savePayload = payload;
      },
    },
    context: {
      canEdit: () => true,
      ui: { idpWorkspace: root },
      win: {
        addEventListener: (type, listener) => {
          windowListeners[type] = listener;
        },
        removeEventListener: () => {},
        document: {},
        FileReader: class {},
        Image: class {},
        prompt: () => "",
      },
    },
    paint: () => {},
    store,
  };
  runtime.runAction = (action) => {
    runtime.idpPlayerBoardActiveBlock.tacticalElements = [];
    pendingSave = Promise.resolve().then(action);
  };

  bindIdpPlayerBoardEvents(runtime);
  const clickCanvas = () => {
    rootListeners.pointerdown({
      target: canvas,
      clientX: 220,
      clientY: 380,
      preventDefault() {},
      stopPropagation() {},
    });
    windowListeners.pointerup({});
  };
  clickCanvas();
  expect(canvasWrap.innerHTML).not.toContain("session-tactical-cone");
  clickCanvas();

  const saveTarget = {
    closest: (selector) => selector === "[data-idp-board-save]" ? saveTarget : null,
    matches: () => false,
  };
  expect(handleIdpPlayerBoardClick({ target: saveTarget, preventDefault() {} }, runtime)).toBe(true);
  await pendingSave;

  expect(savePayload?.boardState?.tacticalElements).toHaveLength(1);
  expect(savePayload?.boardState?.tacticalElements?.[0]).toMatchObject({
    type: "cone",
    x: 30,
    y: 30,
  });
  expect(savePayload?.id).toBe("");
  expect(savePayload?.rowVersion).toBe(0);
});

test("idp player board exercise details remain editable and flow into the save payload", () => {
  const heading = { textContent: "" };
  const store = createIdpStore({
    ui: {
      idpPlayerBoardOpen: true,
      idpPlayerBoardSelectedInterventionId: "intervention-1",
    },
    playerDetail: {
      profile: { playerId: "player-1", playerName: "Test Player" },
      focuses: [{ id: "focus-1", title: "Current focus", status: "Active" }],
      interventions: [{
        id: "intervention-1",
        rowVersion: 2,
        playerId: "player-1",
        focusId: "focus-1",
        title: "Old exercise name",
        objective: "Old objective",
        boardState: {},
        status: "active",
      }],
    },
  });
  const runtime = {
    context: {
      ui: {
        idpWorkspace: {
          querySelector: (selector) => selector === ".session-library-modal-head h2" ? heading : null,
        },
      },
    },
    store,
  };
  const titleField = {
    value: "New exercise name",
    closest: (selector) => selector === "[data-idp-board-title]" ? titleField : null,
  };
  const objectiveField = {
    value: "Create a clean first action after the save.",
    closest: (selector) => selector === "[data-idp-board-objective]" ? objectiveField : null,
  };

  expect(handleIdpPlayerBoardInput({ target: titleField }, runtime)).toBe(true);
  expect(handleIdpPlayerBoardInput({ target: objectiveField }, runtime)).toBe(true);
  const payload = persistIdpPlayerBoardDraft(runtime);

  expect(payload).toMatchObject({
    id: "intervention-1",
    rowVersion: 2,
    title: "New exercise name",
    objective: "Create a clean first action after the save.",
  });
  expect(heading.textContent).toBe("New exercise name");
});

test("idp player board renders every supported placement material after persistence", () => {
  const materialTypes = [
    "blue-player",
    "red-player",
    "neutral-player",
    "ball",
    "coach",
    "cone",
    "mini-goal",
    "big-goal",
    "mannequin",
    "pole",
    "gate",
  ];
  const tacticalElements = materialTypes.map((type, index) => ({
    id: `material-${index + 1}`,
    type,
    x: 10 + index * 7,
    y: 20 + index * 5,
  }));
  const playerBoardHtml = renderIdpWorkspace({
    dashboardPlayers: [],
    ui: {
      selectedPlayerId: "player-1",
      profileView: "player-board",
      idpPlayerBoardOpen: true,
      idpPlayerBoardSelectedInterventionId: "intervention-1",
    },
    playerDetail: {
      profile: { playerId: "player-1", playerName: "Test Player", status: "active" },
      focuses: [{ id: "focus-1", title: "Current focus", status: "Active" }],
      interventions: [{
        id: "intervention-1",
        rowVersion: 1,
        playerId: "player-1",
        focusId: "focus-1",
        title: "Material check",
        objective: "Verify all equipment.",
        boardState: {
          tacticalPitchMode: "full",
          tacticalActiveFrameId: "frame-1",
          tacticalFrames: [{ id: "frame-1", label: "Frame 1", elements: tacticalElements }],
          tacticalElements,
        },
        status: "active",
      }],
      clipBank: [],
      evidence: [],
      reviews: [],
      nextActions: [],
      milestones: [],
      ownership: [],
      goals: [],
      goalCheckins: [],
    },
  }, { canEdit: true, users: [] });

  [
    "session-tactical-blue-player",
    "session-tactical-red-player",
    "session-tactical-neutral-player",
    "session-tactical-ball",
    "session-tactical-coach",
    "session-tactical-cone",
    "session-tactical-mini-goal",
    "session-tactical-big-goal",
    "session-tactical-mannequin",
    "session-tactical-pole",
    "session-tactical-gate",
  ].forEach((className) => expect(playerBoardHtml).toContain(className));
  expect(playerBoardHtml).toContain("data-idp-board-title");
  expect(playerBoardHtml).toContain("data-idp-board-objective");
  expect(playerBoardHtml).toContain('data-idp-board-delete="intervention-1"');
  expect(playerBoardHtml).toContain('data-idp-board-row-version="1"');
  expect(playerBoardHtml.indexOf("data-idp-board-preview")).toBeGreaterThan(playerBoardHtml.indexOf("idp-player-board-stage-head"));
  expect(playerBoardHtml.indexOf("data-idp-board-open")).toBeLessThan(playerBoardHtml.indexOf("idp-player-board-pitch-preview"));
});

test("idp player board exercise bank supports search and progressive loading", () => {
  const interventions = Array.from({ length: 5 }, (_, index) => ({
    id: `intervention-${index + 1}`,
    rowVersion: 1,
    playerId: "player-1",
    focusId: "focus-1",
    title: `Exercise ${index + 1}`,
    objective: index === 4 ? "Pressing recovery detail" : `Objective ${index + 1}`,
    boardState: {
      tacticalFrames: [{ id: "frame-1", label: "Frame 1", elements: [] }],
      tacticalElements: [],
    },
    status: "active",
  }));
  const baseState = {
    dashboardPlayers: [],
    ui: {
      selectedPlayerId: "player-1",
      profileView: "player-board",
      idpPlayerBoardSelectedInterventionId: "intervention-1",
    },
    playerDetail: {
      profile: { playerId: "player-1", playerName: "Test Player", status: "active" },
      focuses: [{ id: "focus-1", title: "Current focus", status: "Active" }],
      interventions,
      clipBank: [],
      evidence: [],
      reviews: [],
      nextActions: [],
      milestones: [],
      ownership: [],
      goals: [],
      goalCheckins: [],
    },
  };
  const playerBoardHtml = renderIdpWorkspace(baseState, { canEdit: true, users: [] });

  expect(playerBoardHtml).toContain("data-idp-board-exercise-search");
  expect(playerBoardHtml).toContain("Search exercises");
  expect(playerBoardHtml).toContain("Exercise 1");
  expect(playerBoardHtml).toContain("Exercise 2");
  expect(playerBoardHtml).toContain("Exercise 3");
  expect(playerBoardHtml).not.toContain("Exercise 4");
  expect(playerBoardHtml).not.toContain("Exercise 5");
  expect(playerBoardHtml).toContain("data-idp-board-load-more");
  expect(playerBoardHtml).toContain("2 more available");

  const searchedHtml = renderIdpWorkspace({
    ...baseState,
    ui: {
      ...baseState.ui,
      idpPlayerBoardExerciseSearchQuery: "pressing",
      idpPlayerBoardSelectedInterventionId: "intervention-5",
    },
  }, { canEdit: true, users: [] });

  expect(searchedHtml).toContain('value="pressing"');
  expect(searchedHtml).toContain("Exercise 5");
  expect(searchedHtml).not.toContain("Exercise 1");
  expect(searchedHtml).not.toContain("data-idp-board-load-more");
});

test("idp player board deletion archives the selected exercise with row-version protection", async () => {
  const player = {
    id: "player-1",
    name: "Test Player",
    position: "Midfielder",
    primaryRole: "8",
    idp: { primaryFocus: "Current focus" },
  };
  const store = createIdpStore({
    ui: {
      selectedPlayerId: "player-1",
      profileView: "player-board",
      idpPlayerBoardOpen: true,
      idpPlayerBoardSelectedInterventionId: "intervention-1",
    },
    playerDetail: {
      profile: { playerId: "player-1", playerName: "Test Player" },
      focuses: [{ id: "focus-1", playerId: "player-1", title: "Current focus", status: "Active" }],
      interventions: [{
        id: "intervention-1",
        playerId: "player-1",
        focusId: "focus-1",
        title: "Exercise to delete",
        rowVersion: 4,
        boardState: {},
        status: "active",
      }],
    },
  });
  const archivedPayloads = [];
  const actions = createIdpActions({
    store,
    api: {
      archiveIntervention: async (payload) => {
        archivedPayloads.push(payload);
        return { schema: "footballscience-idp-v1", intervention: { id: payload.id, status: "archived" } };
      },
      loadDashboard: async () => ({ schema: "footballscience-idp-v1", players: [] }),
      loadPlayer: async () => ({
        schema: "footballscience-idp-v1",
        profile: { id: "profile-1", player_id: "player-1" },
        focuses: [{ id: "focus-1", player_id: "player-1", title: "Current focus", status: "Active" }],
        clipBank: [],
        evidence: [],
        reviews: [],
        nextActions: [],
        milestones: [],
        ownership: [],
        interventions: [],
        goals: [],
        goalCheckins: [],
      }),
    },
    context: { getPlayerProfilesState: () => ({ players: [player] }) },
  });

  await actions.deletePlayerBoard({ id: "intervention-1", rowVersion: 4 });

  expect(archivedPayloads).toEqual([{
    id: "intervention-1",
    playerId: "player-1",
    rowVersion: 4,
  }]);
  expect(store.getState().ui).toMatchObject({
    idpPlayerBoardOpen: false,
    idpPlayerBoardSelectedInterventionId: "",
    message: "Individual exercise deleted.",
  });
});

test("idp development goals are IDP-owned, measurable and server-versioned", () => {
  const apiService = read("src/modules/idp/services/idp-api-service.mjs");
  const databaseSource = read("api/_lib/idp-database.js");
  const migration = read("supabase/migrations/20260627030412_idp_development_goals.sql");
  const renderer = read("src/modules/idp/idp-renderer.mjs");
  const idpRuntime = read("src/modules/idp/index.mjs");

  expect(migration).toContain("create table if not exists public.idp_development_goals");
  expect(migration).toContain("create table if not exists public.idp_goal_checkins");
  expect(migration).toContain("goal_role text not null default 'supporting'");
  expect(migration).toContain("metric_type text not null default 'observation'");
  expect(migration).toContain("row_version integer not null default 1");
  expect(migration).toContain("deleted_at timestamptz");
  expect(migration).toContain("alter table public.idp_development_goals enable row level security");
  expect(migration).toContain("alter table public.idp_goal_checkins enable row level security");
  expect(migration).toContain("revoke all on public.idp_development_goals from anon, authenticated");
  expect(migration).toContain("grant select, insert, update, delete on public.idp_development_goals to service_role");
  expect(migration).toContain("idp_development_goals_prevent_hard_delete");
  expect(migration).toContain("idp_goal_checkins_prevent_hard_delete");
  expect(migration).toContain("idp_development_goals_player_status_idx");
  expect(migration).toContain("idp_goal_checkins_goal_recent_idx");
  expect(migration).toContain("add column if not exists goal_id");

  expect(apiService).toContain('action: "create-goal"');
  expect(apiService).toContain('action: "update-goal"');
  expect(apiService).toContain('action: "archive-goal"');
  expect(apiService).toContain('action: "add-goal-checkin"');
  expect(databaseSource).toContain("async function createDevelopmentGoal");
  expect(databaseSource).toContain("async function updateDevelopmentGoal");
  expect(databaseSource).toContain("async function archiveDevelopmentGoal");
  expect(databaseSource).toContain("async function addGoalCheckin");
  expect(databaseSource).toContain("requireOwnedFocus(scope, playerId");
  expect(databaseSource).toContain("requireOwnedGoal(scope, playerId");
  expect(databaseSource).toContain("idp_development_goals");
  expect(databaseSource).toContain("idp_goal_checkins");
  expect(databaseSource).toContain("OPTIONAL_MIGRATION_TABLES");
  expect(databaseSource).toContain("development_goal.checkin_added");
  expect(renderer).toContain('data-idp-profile-view="goals"');
  expect(renderer).toContain("idp-goals-empty-actions");
  expect(renderer).toContain("data-idp-save-goal");
  expect(renderer).toContain("data-idp-add-goal-checkin");
  expect(idpRuntime).toContain("data-idp-edit-goal");
  expect(idpRuntime).toContain("data-idp-goal-checkin");
});

test("idp renderer separates the overview from the player development profile", () => {
  const state = {
    ui: { statusFilter: "All", categoryFilter: "All", searchQuery: "" },
    dashboardPlayers: [
      {
        profile: { playerId: "p1", playerName: "Player One", squadNumber: "19", position: "FW", role: "9" },
        focus: { title: "Receive under pressure", category: "Tactical", status: "Active" },
        evidenceCount: 1,
        newClipCount: 2,
        overallStatus: "New Clips To Review",
        nextAction: "Review clip bank",
      },
    ],
    playerDetail: buildLegacyPlayerDetail({
      id: "p1",
      name: "Player One",
      photoUrl: "data:image/png;base64,abc123",
      position: "FW",
      primaryRole: "9",
      idp: { primaryFocus: "Receive under pressure", nextAction: "Add evidence" },
    }),
  };
  const staffOptions = {
    canEdit: true,
    teamName: "North Carolina Courage",
    users: [
      { id: "coach-1", name: "Mak Lind", role: "coach" },
      { id: "analyst-1", name: "Video Analyst", role: "analyst" },
    ],
    renderPlayerProfileScoutingSpider: (player, renderOptions = {}) => `
      <article class="${renderOptions.cardClassName || ""}" data-test-scouting-radar="${player.name}">
        <h2>${renderOptions.titleLabel || "Performance Radar"}</h2>
      </article>
    `,
  };
  state.dashboardPlayers[0].profile.ownerId = "coach-1";
  state.dashboardPlayers[0].profile.photoUrl = "data:image/png;base64,overview123";
  state.playerDetail.profile.ownerId = "coach-1";
  state.playerDetail.ownership = [{ owner_id: "coach-1", ownership_type: "player-owner", status: "active" }];
  state.playerDetail.goals = state.playerDetail.goals.map((goal, index) => ({
    ...goal,
    createdAt: index === 0 ? "2026-06-16T09:00:00.000Z" : "2026-06-27T09:00:00.000Z",
    updatedAt: index === 0 ? "2026-06-16T09:00:00.000Z" : "2026-06-27T09:00:00.000Z",
  }));
  state.playerDetail.evidence = Array.from({ length: 8 }, (_, index) => ({
    id: `evidence-${index + 1}`,
    playerId: "p1",
    focusId: "legacy-focus-p1",
    evidenceType: index === 0 ? "Player Reflection" : index === 1 ? "Video Clip" : "Coach Note",
    note: index === 7 ? "Observation eight is visible." : `Observation ${index + 1}`,
    createdAt: "2026-06-16T10:00:00.000Z",
  }));
  state.playerDetail.milestones = Array.from({ length: 7 }, (_, index) => ({
    id: `milestone-${index + 1}`,
    playerId: "p1",
    focusId: "legacy-focus-p1",
    milestoneType: "First Evidence Added",
    title: "Evidence added",
    occurredOn: `2026-06-${String(16 - index).padStart(2, "0")}`,
    sourceModule: "idp",
    sourceId: `evidence-${index + 1}`,
    createdBy: "coach-1",
  }));
  const overviewHtml = renderIdpWorkspace(state, staffOptions);

  expect(overviewHtml).toContain("data-idp-player=\"p1\"");
  expect(overviewHtml).toContain("Squad number 19");
  expect(overviewHtml).toContain("data-idp-filter=\"status\"");
  expect(overviewHtml).toContain("data-idp-filter=\"owner\"");
  expect(overviewHtml).toContain("All IDP Coaches");
  expect(overviewHtml).toContain("Mak Lind");
  expect(overviewHtml).not.toContain("Video Analyst");
  expect(overviewHtml).toContain("Player Development");
  expect(overviewHtml).toContain("North Carolina Courage");
  expect(overviewHtml).toContain('class="idp-player-avatar has-photo"');
  expect(overviewHtml).toContain("data:image/png;base64,overview123");
  expect(overviewHtml).toContain("Current Focus");
  expect(overviewHtml).toContain("Next Action");
  expect(overviewHtml).toContain("Observations");
  expect(overviewHtml).not.toContain("data-idp-action=\"focus\"");
  expect(overviewHtml).not.toContain("Development Timeline");

  const profileState = { ...state, ui: { ...state.ui, selectedPlayerId: "p1" } };
  const profileHtml = renderIdpWorkspace(profileState, staffOptions);

  expect(profileHtml).toContain("data-idp-back-overview");
  expect(profileHtml).toContain('data-idp-profile-view="development"');
  expect(profileHtml).toContain('data-idp-profile-view="goals"');
  expect(profileHtml).toContain('data-idp-profile-view="clip-bank"');
  expect(profileHtml).toContain('data-idp-profile-view="player-board"');
  expect(profileHtml).toContain('data-idp-profile-view="history"');
  expect(profileHtml).toContain("idp-profile-menu");
  expect(profileHtml).toContain("idp-header is-player-context");
  expect(profileHtml).toContain("<h1>Player One</h1>");
  expect(profileHtml).not.toContain("<h1>Player Development</h1>");
  expect(profileHtml).toContain("No Active Focus · FW / 9 · Mak Lind");
  expect(profileHtml).toContain("idp-player-profile-mark has-photo");
  expect(profileHtml).toContain("data:image/png;base64,abc123");
  expect(profileHtml).not.toContain("idp-profile-stage");
  expect(profileHtml).toContain("idp-stage-actions");
  expect(profileHtml).toContain("idp-stage-toolbar");
  expect((profileHtml.match(/class="idp-coach-assist"/g) || []).length).toBe(1);
  expect(profileHtml.indexOf("idp-coach-assist")).toBeGreaterThan(profileHtml.indexOf("idp-header is-player-context"));
  expect(profileHtml.indexOf("idp-coach-assist")).toBeLessThan(profileHtml.indexOf("idp-stage-actions"));
  expect(profileHtml.indexOf("idp-stage-actions")).toBeLessThan(profileHtml.indexOf("data-idp-back-overview"));
  const profileMenuIndex = profileHtml.indexOf("idp-profile-menu");
  const menuDevelopmentIndex = profileHtml.indexOf('data-idp-profile-view="development"', profileMenuIndex);
  const menuGoalsIndex = profileHtml.indexOf('data-idp-profile-view="goals"', profileMenuIndex);
  const menuClipBankIndex = profileHtml.indexOf('data-idp-profile-view="clip-bank"', profileMenuIndex);
  const menuPlayerBoardIndex = profileHtml.indexOf('data-idp-profile-view="player-board"', profileMenuIndex);
  const menuHistoryIndex = profileHtml.indexOf('data-idp-profile-view="history"', profileMenuIndex);
  expect(profileHtml.indexOf("data-idp-back-overview")).toBeLessThan(menuDevelopmentIndex);
  expect(menuDevelopmentIndex).toBeLessThan(menuGoalsIndex);
  expect(menuGoalsIndex).toBeLessThan(menuClipBankIndex);
  expect(menuClipBankIndex).toBeLessThan(menuPlayerBoardIndex);
  expect(menuPlayerBoardIndex).toBeLessThan(menuHistoryIndex);
  expect(menuGoalsIndex).toBeLessThan(menuHistoryIndex);
  expect(profileHtml).toContain('class="idp-profile-scouting-radar player-profile-scouting-spider-card"');
  expect(profileHtml).toContain('data-test-scouting-radar="Player One"');
  expect(profileHtml.indexOf("idp-profile-scouting-radar")).toBeGreaterThan(profileHtml.indexOf("idp-profile-menu"));
  expect(profileHtml.indexOf("idp-profile-scouting-radar")).toBeLessThan(profileHtml.indexOf("Current Focus"));
  expect(profileHtml.indexOf("idp-profile-menu")).toBeLessThan(profileHtml.indexOf("Current Focus"));
  expect(profileHtml).toContain("data-idp-action=\"ownership\"");
  expect(profileHtml).toContain("data-idp-action=\"focus\"");
  expect(profileHtml).toContain("data-idp-action=\"evidence\"");
  expect(profileHtml).toContain("Quick actions");
  expect(profileHtml).toContain("Assign Coach");
  expect(profileHtml).toContain("Create Focus");
  expect(profileHtml).toContain("New Goal");
  expect(profileHtml).toContain("Leadership Goal");
  expect(profileHtml).toContain("Add Observation");
  expect(profileHtml).toContain("Complete Review");
  expect(profileHtml).not.toContain("idp-profile-actions-deck");
  expect(profileHtml).not.toContain("idp-summary-strip");
  expect(profileHtml).not.toContain("Player development overview");
  expect(profileHtml).not.toContain("Player Development Profile");
  expect(profileHtml).not.toContain("Player Snapshot");
  expect(profileHtml).toContain("idp-focus-clarity-card");
  expect(profileHtml).toContain("idp-current-focus-card");
  expect(profileHtml).toContain("No active focus yet");
  expect(profileHtml).toContain("Create one clear development focus before adding observations");
  expect(profileHtml).not.toContain("Coach cue");
  expect(profileHtml).not.toContain("Receive under pressure so the player");
  expect(profileHtml).toContain("Player Board");
  expect(profileHtml).not.toContain("idp-player-board-panel");
  expect(profileHtml).not.toContain("idp-stage-scoreboard");
  expect(profileHtml).not.toContain("Player development pulse");
  expect(profileHtml).not.toContain("Success Criteria");
  expect(profileHtml).not.toContain("idp-criteria-track");
  expect(profileHtml).not.toContain("idp-goals-snapshot");
  expect(profileHtml).toContain("idp-latest-goal-panel");
  expect(profileHtml).toContain("Latest Goal");
  expect(profileHtml).toContain("No active goal");
  expect(profileHtml).toContain("No development goals yet");
  const latestGoalPanelStart = profileHtml.indexOf("idp-latest-goal-panel");
  const latestGoalPanelHtml = profileHtml.slice(
    latestGoalPanelStart,
    profileHtml.indexOf("</article>", latestGoalPanelStart) + "</article>".length,
  );
  expect(latestGoalPanelHtml).toContain(">Create Goal<");
  expect((latestGoalPanelHtml.match(/data-idp-action=/g) || []).length).toBe(1);
  expect(latestGoalPanelHtml).not.toContain(">Leadership goal<");
  expect(profileHtml).not.toContain("Most recently added");
  expect(profileHtml).not.toContain("Own the next on-pitch action");
  expect(profileHtml).not.toContain("Make receive under pressure visible");
  expect(profileHtml).not.toContain("data-idp-edit-goal");
  expect(profileHtml).not.toContain("data-idp-goal-checkin");
  expect(profileHtml).not.toContain("idp-intelligence-board");
  expect(profileHtml).not.toContain("Development Lens");
  expect(profileHtml).not.toContain("idp-lens-compass");
  expect(profileHtml).not.toContain("Signal Map");
  expect(profileHtml).not.toContain("Player Voice");
  expect(profileHtml).not.toContain("Last Review");
  expect(profileHtml).not.toContain("idp-player-voice-card");
  expect(profileHtml).not.toContain("idp-review-card");
  expect(profileHtml).not.toContain("idp-focus-coach-cue");
  expect(profileHtml).toContain("idp-coach-assist");
  expect(profileHtml).toContain("Coach Assist");
  expect(profileHtml).toContain("Recommended next step");
  expect(profileHtml).not.toContain("Collect match and training evidence");
  expect(profileHtml).not.toContain("data-idp-board-open");
  expect(profileHtml).not.toContain("idp-player-board-boardbar");
  expect(profileHtml).not.toContain("idp-player-board-exercise-bank");
  expect(profileHtml).not.toContain("data-session-");
  expect(profileHtml).not.toContain("New Exercise");
  expect(profileHtml).not.toContain("Edit Board");
  expect(profileHtml).not.toContain("Link Clip");
  expect(profileHtml).not.toContain("Progress Pulse");
  expect(profileHtml).toContain("Observations");
  expect(profileHtml).toContain("8 captured signals");
  expect(profileHtml).toContain("Observation eight is visible.");
  expect(profileHtml).toContain('data-idp-edit-evidence="evidence-1"');
  expect(profileHtml).toContain('data-idp-delete-evidence="evidence-1"');
  expect(profileHtml).not.toContain('data-idp-action="evidence" title="Add observation" disabled');
  expect(profileHtml).toContain("Clip Bank");
  expect(profileHtml).not.toContain("idp-clip-bank-organizer");
  expect(profileHtml).not.toContain("Development Timeline");
  expect(profileHtml).not.toContain("idp-river-panel");
  expect(profileHtml).not.toContain("data-idp-timeline-more");
  expect(profileHtml).not.toContain("<strong>Observation added</strong>");
  expect(profileHtml).not.toContain("idp-ownership-studio");
  expect(profileHtml).not.toContain("Primary IDP Coach");
  expect(profileHtml).not.toContain("Current Focus Owner");

  const historyDetail = {
    ...profileState.playerDetail,
    focuses: [{
      id: "focus-created-1",
      playerId: "p1",
      title: "Back shoulder timing",
      description: "Attack the blindside run after the first pressing cue.",
      category: "Tactical",
      status: "Active",
    }],
    milestones: profileState.playerDetail.milestones.map((milestone, index) => (index === 3 ? {
      ...milestone,
      focusId: "focus-created-1",
      milestoneType: "Current Focus Created",
      title: "Current focus created",
      sourceId: "focus-created-1",
    } : milestone)),
  };
  const historyHtml = renderIdpWorkspace({
    ...profileState,
    playerDetail: historyDetail,
    ui: { ...profileState.ui, profileView: "history" },
  }, staffOptions);
  expect(historyHtml).toContain("idp-profile-history-page");
  expect(historyHtml).toContain('data-idp-profile-view="history"');
  expect(historyHtml).toContain('aria-pressed="true"');
  expect(historyHtml).toContain("idp-river-panel");
  expect(historyHtml).toContain("History");
  expect(historyHtml).toContain("5 latest updates");
  expect(historyHtml).toContain("data-idp-timeline-more");
  expect(historyHtml).toContain("idp-workflow-more");
  expect(historyHtml).toContain("Show more");
  expect(historyHtml).toContain("<strong>2</strong>");
  expect(historyHtml).toContain("By Mak Lind");
  expect(historyHtml).toContain("Player Reflection added");
  expect(historyHtml).toContain("Clip Observation added");
  expect(historyHtml).toContain("Coach Note added");
  expect(historyHtml).toContain("idp-river-detail-list");
  expect(historyHtml).toContain("Observation 3");
  expect(historyHtml).toContain("Current focus created");
  expect(historyHtml).toContain("Back shoulder timing");
  expect(historyHtml).toContain("Attack the blindside run after the first pressing cue.");
  expect(historyHtml).not.toContain("<strong>Observation added</strong>");

  const richWorkflowHtml = renderIdpWorkspace({
    ...profileState,
    playerDetail: {
      ...profileState.playerDetail,
      evidence: [
        ...profileState.playerDetail.evidence,
        ...Array.from({ length: 6 }, (_, index) => ({
          id: `reflection-${index + 1}`,
          playerId: "p1",
          focusId: "legacy-focus-p1",
          evidenceType: "Player Reflection",
          note: `Player reflection ${index + 1}`,
          createdAt: `2026-06-${String(25 - index).padStart(2, "0")}T10:00:00.000Z`,
        })),
      ],
      reviews: Array.from({ length: 6 }, (_, index) => ({
        id: `review-${index + 1}`,
        playerId: "p1",
        focusId: "legacy-focus-p1",
        progressSummary: `Review summary ${index + 1}`,
        createdAt: `2026-06-${String(25 - index).padStart(2, "0")}T10:00:00.000Z`,
      })),
    },
  }, staffOptions);
  expect(richWorkflowHtml).not.toContain("5 latest reflections");
  expect(richWorkflowHtml).not.toContain("5 latest reviews");
  expect(richWorkflowHtml).not.toContain("idp-player-voice-card");
  expect(richWorkflowHtml).not.toContain("idp-review-card");
  expect(richWorkflowHtml).not.toContain("idp-river-panel");
  expect((richWorkflowHtml.match(/<span>Show more<\/span>/g) || []).length).toBe(1);

  const playerBoardHtml = renderIdpWorkspace({
    ...profileState,
    ui: {
      ...profileState.ui,
      profileView: "player-board",
    },
  }, staffOptions);
  expect(playerBoardHtml).toContain('data-idp-profile-view="player-board"');
  expect(playerBoardHtml).toContain("idp-profile-player-board-page");
  expect(playerBoardHtml).toContain("idp-player-board-panel");
  expect(playerBoardHtml).toContain("idp-player-board-focus-card");
  expect(playerBoardHtml).toContain("idp-player-board-exercise-bank");
  expect(playerBoardHtml).toContain("data-idp-board-new");
  expect(playerBoardHtml).toContain("data-idp-board-open");
  expect(playerBoardHtml).not.toContain("No saved Player Board yet");
  expect(playerBoardHtml).not.toContain("Save board");
  expect(playerBoardHtml).not.toContain("data-idp-board-save");
  expect(playerBoardHtml).not.toContain("data-idp-player-board-handout-layer");

  const clipBankHtml = renderIdpWorkspace({
    ...profileState,
    ui: { ...profileState.ui, profileView: "clip-bank" },
  }, staffOptions);
  expect(clipBankHtml).toContain("idp-profile-clip-bank-page");
  expect(clipBankHtml).not.toContain("Player Clip Bank");
  expect(clipBankHtml).toContain("idp-clip-bank-organizer");
  expect(clipBankHtml).toContain("Search clips");
  expect(clipBankHtml).toContain('data-idp-profile-view="development"');
  expect((clipBankHtml.match(/data-idp-profile-view="development"/g) || []).length).toBe(1);
  expect(clipBankHtml).not.toContain("idp-focus-clarity-card");
  expect(clipBankHtml).not.toContain("idp-workflow-board");
  expect(clipBankHtml).not.toContain("idp-profile-scouting-radar");

  const goalsHtml = renderIdpWorkspace({
    ...profileState,
    ui: { ...profileState.ui, profileView: "goals" },
  }, staffOptions);
  expect(goalsHtml).toContain("idp-profile-goals-page");
  expect(goalsHtml).not.toContain("idp-profile-subpage-head");
  expect(goalsHtml).not.toContain("idp-goals-page-summary");
  expect(goalsHtml).not.toContain("Goals & Leadership");
  expect(goalsHtml).not.toContain("development room");
  expect(goalsHtml).toContain("No development goals yet");
  expect(goalsHtml).not.toContain("Own the next on-pitch action");
  expect(goalsHtml).not.toContain("Make receive under pressure visible");
  expect(goalsHtml).not.toContain("Development Goals");
  expect(goalsHtml).not.toContain("Leadership & Responsibility");
  const goalsEmptyStart = goalsHtml.indexOf("idp-goals-empty");
  const goalsEmptyHtml = goalsHtml.slice(
    goalsEmptyStart,
    goalsHtml.indexOf("</div>", goalsHtml.indexOf("idp-goals-empty-actions")) + "</div>".length,
  );
  expect(goalsEmptyHtml).toContain(">Create Goal<");
  expect(goalsEmptyHtml).toContain("data-idp-action=\"goal\"");
  expect((goalsEmptyHtml.match(/data-idp-action=/g) || []).length).toBe(1);
  expect(goalsEmptyHtml).not.toContain("data-idp-action=\"leadership-goal\"");
  expect((goalsHtml.match(/data-idp-profile-view="development"/g) || []).length).toBe(1);
  expect(goalsHtml).not.toContain("idp-workflow-board");
  expect(goalsHtml).not.toContain("idp-profile-scouting-radar");

  const assignmentHtml = renderIdpWorkspace({ ...profileState, ui: { ...profileState.ui, actionMode: "ownership" } }, staffOptions);
  expect(assignmentHtml).toContain("data-idp-assign-owner");
  expect(assignmentHtml).toContain("Assign IDP Coach");
  expect(assignmentHtml).toContain("Primary IDP Coach");
  expect(assignmentHtml).toContain("Save assignment");
  expect(assignmentHtml).not.toContain("Video Analyst");
  const focusFormHtml = renderIdpWorkspace({ ...profileState, ui: { ...profileState.ui, actionMode: "focus" } }, staffOptions);
  expect(focusFormHtml).toContain("data-idp-create-focus");
  expect(focusFormHtml).toContain('name="description"');
  expect(focusFormHtml).toContain("Focus areas");
  expect(focusFormHtml).not.toContain("data-idp-archive-focus");
  expect(focusFormHtml).not.toContain("data-idp-delete-focus");
  const savedFocusState = {
    ...profileState,
    playerDetail: {
      ...profileState.playerDetail,
      focuses: [{
        id: "11111111-1111-4111-8111-111111111111",
        playerId: "p1",
        title: "Distribution and defensive organisation",
        description: "Control the next action after distribution.",
        category: "Tactical",
        status: "Active",
        reviewDate: "2026-07-10",
      }],
    },
  };
  const savedFocusFormHtml = renderIdpWorkspace({ ...savedFocusState, ui: { ...savedFocusState.ui, actionMode: "focus" } }, staffOptions);
  expect(savedFocusFormHtml).toContain("Focus lifecycle");
  expect(savedFocusFormHtml).toContain('data-idp-archive-focus="11111111-1111-4111-8111-111111111111"');
  expect(savedFocusFormHtml).toContain('data-idp-delete-focus="11111111-1111-4111-8111-111111111111"');
  expect(savedFocusFormHtml).toContain("Archive focus");
  expect(savedFocusFormHtml).toContain("Delete focus");
  const observationHtml = renderIdpWorkspace({ ...profileState, ui: { ...profileState.ui, actionMode: "evidence" } }, staffOptions);
  expect(observationHtml).toContain("data-idp-add-evidence");
  expect(observationHtml).toContain("Observation type");
  expect(observationHtml).toContain("Add observation");
  expect(observationHtml).toContain("Create a current focus before adding observations.");
  expect(observationHtml).toContain("<button type=\"submit\" disabled>Add observation</button>");
  const editObservationHtml = renderIdpWorkspace(
    { ...profileState, ui: { ...profileState.ui, actionMode: "edit-evidence", editEvidenceId: "evidence-2" } },
    staffOptions
  );
  expect(editObservationHtml).toContain("data-idp-update-evidence");
  expect(editObservationHtml).toContain('name="evidenceId" value="evidence-2"');
  expect(editObservationHtml).toContain("Observation 2");
  expect(editObservationHtml).toContain("Save observation");
  const goalFormHtml = renderIdpWorkspace({ ...profileState, ui: { ...profileState.ui, actionMode: "goal" } }, staffOptions);
  expect(goalFormHtml).toContain("data-idp-save-goal");
  expect(goalFormHtml).toContain("Measurable player goal");
  expect(goalFormHtml).toContain("Metric type");
  const leadershipGoalHtml = renderIdpWorkspace({ ...profileState, ui: { ...profileState.ui, actionMode: "leadership-goal" } }, staffOptions);
  expect(leadershipGoalHtml).toContain("Create leadership goal");
  expect(leadershipGoalHtml).toContain("Leadership moments");
  const checkinState = {
    ...profileState,
    playerDetail: {
      ...profileState.playerDetail,
      goals: [
        {
          id: "saved-goal-1",
          playerId: "p1",
          title: "First saved coach goal",
          metricLabel: "Coach observations",
          metricType: "observation",
          currentValue: 0,
          targetValue: 3,
          cadence: "weekly",
          status: "active",
        },
      ],
    },
  };
  const goalCheckinHtml = renderIdpWorkspace(
    { ...checkinState, ui: { ...checkinState.ui, actionMode: "goal-checkin", editGoalId: "saved-goal-1" } },
    staffOptions
  );
  expect(goalCheckinHtml).toContain("data-idp-add-goal-checkin");
  expect(goalCheckinHtml).toContain("Current value");
  const readOnlyHtml = renderIdpWorkspace(profileState, { ...staffOptions, canEdit: false });
  expect(readOnlyHtml).not.toContain("data-idp-edit-evidence");
  expect(readOnlyHtml).not.toContain("data-idp-delete-evidence");
  const removedBoardHtml = renderIdpWorkspace(
    { ...profileState, ui: { ...profileState.ui, playerBoardOpen: true, playerBoardInterventionId: "__new" } },
    staffOptions
  );
  expect(removedBoardHtml).not.toContain("data-idp-player-board-layer");
  expect(removedBoardHtml).not.toContain("data-idp-save-intervention");
  expect(removedBoardHtml).not.toContain("data-idp-board-editor-pitch");
  expect(removedBoardHtml).not.toContain("idp-player-board-toolbox");
  expect(renderIdpWorkspace({ ...profileState, ui: { ...profileState.ui, actionMode: "review" } }, staffOptions)).toContain("data-idp-complete-review");
});

test("idp profile preserves Squad Room data-url player images", () => {
  const longDataUrl = `data:image/webp;base64,${"A".repeat(3200)}`;
  const profile = normalizeIdpProfile({
    playerId: "p-photo",
    playerName: "Photo Player",
    photoUrl: longDataUrl,
  });

  expect(profile.photoUrl).toBe(longDataUrl);
  expect(profile.photoUrl.length).toBeGreaterThan(1000);

  const html = renderIdpWorkspace(
    {
      ui: { selectedPlayerId: "p-photo", profileView: "development" },
      playerDetail: {
        profile,
        focuses: [],
        clipBank: [],
        evidence: [],
        reviews: [],
        nextActions: [],
        goals: [],
        goalCheckins: [],
        milestones: [],
        ownership: [],
        interventions: [],
      },
    },
    { canEdit: true, users: [] }
  );

  expect(html).toContain("idp-player-profile-mark has-photo");
  expect(html).toContain(longDataUrl);
  expect(html).not.toContain("idp-player-profile-mark is-initials");
});

test("idp current focus card shows the focus title and focus area separately", () => {
  const detail = buildLegacyPlayerDetail({
    id: "p1",
    name: "Kailen Sheridan",
    position: "Goalkeeper",
    primaryRole: "GK",
    idp: { status: "active" },
  });
  detail.focuses = [{
    id: "focus-1",
    playerId: "p1",
    title: "Distribution, claiming space and defensive organisation",
    focus_areas: "Control depth, claim crosses and restart the attack with clear decisions.",
    category: "Tactical",
    status: "Active",
  }];

  const html = renderIdpWorkspace({
    ui: { selectedPlayerId: "p1", profileView: "development" },
    dashboardPlayers: [],
    playerDetail: detail,
  }, { canEdit: true, teamName: "North Carolina Courage", users: [] });

  expect(html).toContain("<h3>Distribution, claiming space and defensive organisation</h3>");
  expect(html).toContain("<p>Control depth, claim crosses and restart the attack with clear decisions.</p>");
  expect(html).not.toContain("Collect match and training observations for this focus");
});

test("idp observation requires a saved current focus instead of using Squad fallback focus", async () => {
  const player = {
    id: "p1",
    name: "Kailen Sheridan",
    position: "Goalkeeper",
    primaryRole: "GK",
    idp: { primaryFocus: "Distribution under pressure", nextAction: "Add observation" },
  };
  const store = createIdpStore({
    ui: { selectedPlayerId: "p1" },
    playerDetail: buildLegacyPlayerDetail(player),
  });
  const createdFocuses = [];
  const evidencePayloads = [];
  const api = {
    createFocus: async (payload) => {
      createdFocuses.push(payload);
      return {
        schema: "footballscience-idp-v1",
        focus: {
          id: "server-focus",
          player_id: payload.playerId,
          title: payload.title,
          category: payload.category,
          status: payload.status,
        },
      };
    },
    addEvidence: async (payload) => {
      evidencePayloads.push(payload);
      return {
        schema: "footballscience-idp-v1",
        evidence: {
          id: "evidence-1",
          player_id: payload.playerId,
          focus_id: payload.focusId,
          evidence_type: payload.evidenceType,
          note: payload.note,
        },
      };
    },
    loadDashboard: async () => ({
      schema: "footballscience-idp-v1",
      players: [
        {
          profile: { id: "profile-p1", player_id: "p1" },
          focus: { id: "server-focus", player_id: "p1", title: "Distribution under pressure", status: "Active" },
          evidenceCount: 1,
          newClipCount: 0,
          nextAction: "Review focus",
          overallStatus: "On Track",
        },
      ],
    }),
    loadPlayer: async () => ({
      schema: "footballscience-idp-v1",
      profile: { id: "profile-p1", player_id: "p1" },
      focuses: [{ id: "server-focus", player_id: "p1", title: "Distribution under pressure", status: "Active" }],
      clipBank: [],
      evidence: [{ id: "evidence-1", player_id: "p1", focus_id: "server-focus", evidence_type: "Coach Note", note: "Stayed composed." }],
      reviews: [],
      nextActions: [],
      milestones: [],
      ownership: [],
    }),
  };
  const actions = createIdpActions({
    store,
    api,
    context: { getPlayerProfilesState: () => ({ players: [player] }) },
  });

  await expect(actions.addEvidence({
    get: (key) => {
      if (key === "evidenceType") return "Coach Note";
      if (key === "note") return "Stayed composed.";
      return "";
    },
  })).rejects.toThrow("Create a current focus before adding observations.");

  expect(createdFocuses).toHaveLength(0);
  expect(evidencePayloads).toHaveLength(0);
});

test("idp observation edit and delete stay server-owned and refresh the selected player", async () => {
  const player = {
    id: "p1",
    name: "Kailen Sheridan",
    position: "Goalkeeper",
    primaryRole: "GK",
    idp: { primaryFocus: "Distribution under pressure", nextAction: "Add observation" },
  };
  const detail = buildLegacyPlayerDetail(player);
  detail.focuses = [{ id: "server-focus", playerId: "p1", title: "Distribution under pressure", status: "Active" }];
  detail.evidence = [{ id: "evidence-1", playerId: "p1", focusId: "server-focus", evidenceType: "Coach Note", note: "Original note" }];
  const store = createIdpStore({
    ui: { selectedPlayerId: "p1" },
    playerDetail: detail,
  });
  const updatePayloads = [];
  const deletePayloads = [];
  let loadPlayerCalls = 0;
  const api = {
    updateEvidence: async (payload) => {
      updatePayloads.push(payload);
      return { schema: "footballscience-idp-v1", evidence: { ...payload, evidence_type: payload.evidenceType } };
    },
    deleteEvidence: async (payload) => {
      deletePayloads.push(payload);
      return { schema: "footballscience-idp-v1", evidence: { id: payload.id, player_id: payload.playerId, deleted_at: "2026-06-16T11:00:00.000Z" } };
    },
    loadDashboard: async () => ({ schema: "footballscience-idp-v1", players: [] }),
    loadPlayer: async () => {
      loadPlayerCalls += 1;
      return {
        schema: "footballscience-idp-v1",
        profile: { id: "profile-p1", player_id: "p1" },
        focuses: [{ id: "server-focus", player_id: "p1", title: "Distribution under pressure", status: "Active" }],
        clipBank: [],
        evidence: [],
        reviews: [],
        nextActions: [],
        milestones: [],
        ownership: [],
      };
    },
  };
  const actions = createIdpActions({
    store,
    api,
    context: { getPlayerProfilesState: () => ({ players: [player] }) },
  });

  await actions.updateEvidence({
    get: (key) => {
      if (key === "evidenceId") return "evidence-1";
      if (key === "evidenceType") return "Coach Note";
      if (key === "note") return "Edited note";
      return "";
    },
  });
  await actions.deleteEvidence("evidence-1");

  expect(updatePayloads[0]).toMatchObject({ id: "evidence-1", playerId: "p1", evidenceType: "Coach Note", note: "Edited note" });
  expect(deletePayloads[0]).toMatchObject({ id: "evidence-1", playerId: "p1" });
  expect(loadPlayerCalls).toBe(2);
  expect(store.getState().ui.message).toBe("Observation deleted.");
});

test("idp clip bank remove action stays server-owned and refreshes the selected player", async () => {
  const player = {
    id: "p1",
    name: "Kailen Sheridan",
    position: "Goalkeeper",
    primaryRole: "GK",
  };
  const detail = buildLegacyPlayerDetail(player);
  detail.clipBank = [
    {
      id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
      playerId: "p1",
      clipInstanceId: "62eca2cc-7e93-44d5-9a0c-61b416c7bb22",
      matchTitle: "Training video",
      matchDate: "2026-06-22",
      status: "New",
    },
  ];
  const store = createIdpStore({
    ui: { selectedPlayerId: "p1", profileView: "clip-bank", selectedClipBankIds: ["2a4e615e-f3e7-4fc7-bb70-a02db63c9152"] },
    playerDetail: detail,
  });
  const removedPayloads = [];
  let loadPlayerCalls = 0;
  const api = {
    removeClipBankItem: async (payload) => {
      removedPayloads.push(payload);
      return {
        schema: "footballscience-idp-v1",
        clipBankItem: {
          id: payload.id,
          player_id: payload.playerId,
          status: "Hidden",
          deleted_at: "2026-07-04T18:00:00.000Z",
        },
      };
    },
    loadDashboard: async () => ({ schema: "footballscience-idp-v1", players: [] }),
    loadPlayer: async () => {
      loadPlayerCalls += 1;
      return {
        schema: "footballscience-idp-v1",
        profile: { id: "profile-p1", player_id: "p1" },
        focuses: [],
        clipBank: [],
        evidence: [],
        reviews: [],
        nextActions: [],
        milestones: [],
        ownership: [],
      };
    },
  };
  const actions = createIdpActions({
    store,
    api,
    context: { getPlayerProfilesState: () => ({ players: [player] }) },
  });

  await actions.removeClipBankItem("2a4e615e-f3e7-4fc7-bb70-a02db63c9152");

  expect(removedPayloads[0]).toMatchObject({
    id: "2a4e615e-f3e7-4fc7-bb70-a02db63c9152",
    playerId: "p1",
  });
  expect(loadPlayerCalls).toBe(1);
  expect(store.getState().ui.selectedClipBankIds).toEqual([]);
  expect(store.getState().ui.message).toBe("Clip removed from this player's Clip Bank.");
});

test("idp focus archive and delete stay server-owned and refresh the selected player", async () => {
  const player = {
    id: "p1",
    name: "Kailen Sheridan",
    position: "Goalkeeper",
    primaryRole: "GK",
    idp: { primaryFocus: "Distribution under pressure", nextAction: "Add observation" },
  };
  const focusId = "11111111-1111-4111-8111-111111111111";
  const detail = buildLegacyPlayerDetail(player);
  detail.focuses = [{ id: focusId, playerId: "p1", title: "Distribution under pressure", status: "Active" }];
  const store = createIdpStore({
    ui: { selectedPlayerId: "p1" },
    playerDetail: detail,
  });
  const archivedFocuses = [];
  const deletedFocuses = [];
  let loadPlayerCalls = 0;
  const api = {
    archiveFocus: async (payload) => {
      archivedFocuses.push(payload);
      return { schema: "footballscience-idp-v1", focus: { id: payload.id, player_id: payload.playerId, status: "Archived" } };
    },
    deleteFocus: async (payload) => {
      deletedFocuses.push(payload);
      return { schema: "footballscience-idp-v1", focus: { id: payload.id, player_id: payload.playerId, status: "Archived", deleted_at: "2026-06-16T11:00:00.000Z" } };
    },
    loadDashboard: async () => ({ schema: "footballscience-idp-v1", players: [] }),
    loadPlayer: async () => {
      loadPlayerCalls += 1;
      return {
        schema: "footballscience-idp-v1",
        profile: { id: "profile-p1", player_id: "p1" },
        focuses: [],
        clipBank: [],
        evidence: [],
        reviews: [],
        nextActions: [],
        milestones: [],
        ownership: [],
      };
    },
  };
  const actions = createIdpActions({
    store,
    api,
    context: { getPlayerProfilesState: () => ({ players: [player] }) },
  });

  await actions.archiveFocus(focusId);
  expect(archivedFocuses[0]).toMatchObject({ id: focusId, playerId: "p1" });
  expect(store.getState().ui.message).toContain("Focus archived");

  store.setState({ ui: { selectedPlayerId: "p1" }, playerDetail: detail });
  await actions.deleteFocus(focusId);

  expect(deletedFocuses[0]).toMatchObject({ id: focusId, playerId: "p1" });
  expect(loadPlayerCalls).toBe(2);
  expect(store.getState().ui.message).toBe("Focus deleted from the active IDP view.");
  expect(store.getState().playerDetail.focuses).toEqual([]);
});

test("idp intervention records normalize safely without frontend mutation actions", () => {
  const apiService = read("src/modules/idp/services/idp-api-service.mjs");
  const databaseSource = read("api/_lib/idp-database.js");
  const intervention = normalizeIdpDevelopmentIntervention({
    id: "intervention-1",
    player_id: "p1",
    focus_id: "server-focus",
    goal_id: "goal-1",
    title: "Distribution board",
    objective: "Rehearse claiming space.",
    coaching_cue: "Scan, claim, release.",
    success_criteria: ["Early body shape", "Clear first pass"],
    pitch_mode: "box",
    status: "active",
    row_version: 3,
    board_state: {
      schema: "idp-player-board-v2",
      activeFrameIndex: 1,
      player: { x: 50, y: 82 },
      cones: [
        { id: "cone-1", x: 44, y: 60 },
        { id: "cone-2", x: 56, y: 60 },
      ],
      arrows: [{ type: "run", color: "#38bdf8", lineStyle: "dashed", lineWidth: 3.25 }],
      linkedClipIds: ["clip-1", "clip-2"],
      frames: [{ id: "frame-1", label: "Start", player: { x: 42, y: 76 } }],
    },
  });

  expect(intervention).toMatchObject({
    id: "intervention-1",
    playerId: "p1",
    focusId: "server-focus",
    goalId: "goal-1",
    title: "Distribution board",
    objective: "Rehearse claiming space.",
    coachingCue: "Scan, claim, release.",
    successCriteria: ["Early body shape", "Clear first pass"],
    pitchMode: "goalkeeper",
    rowVersion: 3,
  });
  expect(intervention.boardState).toMatchObject({
    schema: "idp-player-board-v2",
    activeFrameIndex: 0,
    player: { x: 42, y: 76 },
    arrows: [{ type: "run", color: "#38bdf8", lineStyle: "dashed", lineWidth: 3.25 }],
    linkedClipIds: ["clip-1", "clip-2"],
  });
  expect(intervention.boardState.frames[0]).toMatchObject({ id: "frame-1", label: "Start", player: { x: 42, y: 76 } });
  expect(intervention.boardState).toHaveProperty("tacticalFrames");
  expect(intervention.boardState).toHaveProperty("tacticalElements");
  expect(apiService).toContain("createIntervention");
  expect(apiService).toContain("updateIntervention");
  expect(apiService).toContain("archiveIntervention");
  expect(databaseSource).toContain("async function createDevelopmentIntervention");
  expect(databaseSource).toContain("async function updateDevelopmentIntervention");
  expect(databaseSource).toContain("async function archiveDevelopmentIntervention");
});

test("idp development goal save, check-in and archive stay behind the server boundary", async () => {
  const player = {
    id: "p1",
    name: "Kailen Sheridan",
    position: "Goalkeeper",
    primaryRole: "GK",
    idp: { primaryFocus: "Distribution under pressure", nextAction: "Add observation" },
  };
  const detail = buildLegacyPlayerDetail(player);
  detail.focuses = [{ id: "server-focus", playerId: "p1", title: "Distribution under pressure", status: "Active" }];
  detail.goals = [{
    id: "goal-1",
    playerId: "p1",
    focusId: "server-focus",
    title: "Improve first pass",
    goalRole: "supporting",
    category: "Tactical",
    metricLabel: "Successful actions",
    metricType: "count",
    targetValue: 8,
    currentValue: 3,
    status: "active",
    rowVersion: 2,
  }];
  const store = createIdpStore({
    ui: { selectedPlayerId: "p1" },
    playerDetail: detail,
  });
  const createdGoals = [];
  const checkins = [];
  const archivedGoals = [];
  const api = {
    createGoal: async (payload) => {
      createdGoals.push(payload);
      return { schema: "footballscience-idp-v1", goal: { id: "goal-2", row_version: 1, ...payload } };
    },
    addGoalCheckin: async (payload) => {
      checkins.push(payload);
      return { schema: "footballscience-idp-v1", checkin: { id: "checkin-1", ...payload } };
    },
    archiveGoal: async (payload) => {
      archivedGoals.push(payload);
      return { schema: "footballscience-idp-v1", goal: { id: payload.id, status: "archived" } };
    },
    loadDashboard: async () => ({ schema: "footballscience-idp-v1", players: [] }),
    loadPlayer: async () => ({
      schema: "footballscience-idp-v1",
      profile: { id: "profile-p1", player_id: "p1" },
      focuses: [{ id: "server-focus", player_id: "p1", title: "Distribution under pressure", status: "Active" }],
      clipBank: [],
      evidence: [],
      reviews: [],
      nextActions: [],
      goals: [],
      goalCheckins: [],
      milestones: [],
      ownership: [],
      interventions: [],
    }),
  };
  const actions = createIdpActions({
    store,
    api,
    context: { getPlayerProfilesState: () => ({ players: [player] }) },
  });

  await actions.saveGoal(new Map([
    ["focusId", "server-focus"],
    ["goalRole", "supporting"],
    ["category", "Tactical"],
    ["title", "Win first action"],
    ["description", "Cleaner first action under pressure."],
    ["metricLabel", "Successful actions"],
    ["metricType", "count"],
    ["baselineValue", "3"],
    ["currentValue", "4"],
    ["targetValue", "8"],
    ["unit", ""],
    ["cadence", "weekly"],
    ["dueOn", "2026-07-10"],
    ["status", "active"],
  ]));
  store.setState({ playerDetail: detail });
  await actions.addGoalCheckin(new Map([
    ["goalId", "goal-1"],
    ["value", "5"],
    ["confidence", "4"],
    ["note", "Better first pass after scan."],
    ["statusSnapshot", "active"],
    ["checkinOn", "2026-06-27"],
  ]));
  store.setState({ playerDetail: detail });
  await actions.archiveGoal("goal-1");

  expect(createdGoals[0]).toMatchObject({
    playerId: "p1",
    focusId: "server-focus",
    title: "Win first action",
    metricLabel: "Successful actions",
    targetValue: "8",
  });
  expect(checkins[0]).toMatchObject({
    playerId: "p1",
    goalId: "goal-1",
    value: "5",
    confidence: "4",
    note: "Better first pass after scan.",
  });
  expect(archivedGoals[0]).toMatchObject({ id: "goal-1", playerId: "p1", rowVersion: 2 });
});

test("idp clip bank is a date-sorted organizer with play queue metadata", () => {
  const profileState = {
    dashboardPlayers: [],
    playerDetail: {
      profile: { playerId: "p1", playerName: "Player One", position: "CM", role: "8" },
      focuses: [],
      clipBank: [
        {
          id: "bank-old",
          clipInstanceId: "b8f41622-57b5-4ed6-908f-b6d6d1e5fe30",
          matchTitle: "Training + Lift",
          matchDate: "2026-06-15",
          eventType: "training",
          startMs: 930000,
          endMs: 945000,
          phase: "In Possession",
          subPhase: "Build With GK",
          miniGamePrinciples: [{ label: "Third Player", value: "third-player" }],
          status: "New",
        },
        {
          id: "bank-new",
          clipInstanceId: "d6b00c58-9f33-4a0e-814c-30288b24fc21",
          matchTitle: "NCC - Louisville",
          matchDate: "2026-06-27",
          eventType: "match",
          startMs: 1178000,
          endMs: 1193000,
          phase: "In Possession",
          subPhase: "Build Up",
          miniGamePrinciples: [{ label: "Counterpress 5s", value: "counterpress-5s" }],
          outcome: "Positive",
          status: "New",
        },
      ],
      evidence: [],
      reviews: [],
      nextActions: [],
      milestones: [],
      ownership: [],
    },
    sync: {},
    ui: {
      selectedPlayerId: "p1",
      profileView: "clip-bank",
      selectedClipBankIds: ["bank-new"],
      clipBankSearchQuery: "Louisville",
      clipPreviewOpen: true,
      clipPreviewQueueIds: ["bank-new", "bank-old"],
      clipPreviewActiveIndex: 0,
      clipPreviewStatus: "ready",
      clipPreviewObjectUrl: "blob:local-video-preview",
    },
  };

  const html = renderIdpWorkspace(profileState, { canEdit: true, teamName: "North Carolina Courage" });
  expect(html).toContain("data-idp-clip-search");
  expect(html).toContain("1 of 2 clips");
  expect(html).toContain("Find clip, player, date or principle");
  expect(html).not.toContain("Search by match, training, sub-phase, outcome or principle.");
  expect(html).toContain("data-idp-clip-play-selected");
  expect(html).toContain("Open selected (1)");
  expect(html).toContain("data-idp-clip-play=\"bank-new\"");
  expect(html).toContain("idp-clip-bank-row__actions");
  expect(html).toContain("Play clip");
  expect(html).toContain("M8 5v14l11-7L8 5Z");
  expect(html).toContain("data-idp-clip-remove=\"bank-new\"");
  expect(html).toContain("Remove from Clip Bank");
  expect(html).toContain("Remove clip from Clip Bank");
  expect(html).toContain("<svg viewBox=\"0 0 24 24\"");
  expect(html).toContain("NCC - Louisville");
  expect(html).toContain("Training + Lift");
  expect(html).toContain("2026-06-27");
  expect(html).toContain("Build Up / In Possession");
  expect(html).toContain("Counterpress 5s");
  expect(html).toContain("data-idp-clip-preview-video");
  expect(html).toContain("idp-clip-preview-sidebar");
  expect(html).toContain("My Clips");
  expect(html).toContain("2 clips · 30s");
  expect(html).toContain("data-idp-clip-preview-jump=\"1\"");
  expect(html).toContain("idp-clip-preview-item is-active");
  expect(html).toContain("data-idp-clip-preview-toggle");
  expect(html).toContain("data-idp-clip-preview-speed=\"2\"");
  expect(html).toContain("1 of 2");
  expect(html).not.toContain("b8f41622-57b5-4ed6-908f-b6d6d1e5fe30");
});

test("idp clip play starts the selected queue in marking order", () => {
  const indexSource = read("src/modules/idp/index.mjs");
  const clipPreviewSource = read("src/modules/idp/idp-clip-preview-controller.mjs");
  const store = createIdpStore({
    playerDetail: {
      clipBank: [
        { id: "bank-new", matchDate: "2026-06-27" },
        { id: "bank-old", matchDate: "2026-06-15" },
        { id: "bank-middle", matchDate: "2026-06-20" },
      ],
    },
    ui: {
      selectedClipBankIds: ["bank-old", "bank-new", "missing", "bank-old", "bank-middle"],
    },
  });

  expect(selectedClipIds({ store })).toEqual(["bank-old", "bank-new", "bank-middle"]);
  expect(indexSource).toContain("data-idp-clip-play-selected");
  expect(indexSource).toContain("const selectedIds = selectedClipIds(runtime);");
  expect(indexSource).toContain("openClipPreview(runtime, selectedIds.length ? selectedIds : [id]);");
  expect(clipPreviewSource).toContain("const queueIds = ids.map");
  expect(clipPreviewSource).not.toContain("const sorted = currentClipBank");
  expect(clipPreviewSource).toContain("if (hasNext) moveClipPreview(activeRuntime, 1);");
  expect(clipPreviewSource).toContain("setClipPreviewSpeed");
  expect(clipPreviewSource).toContain("reconnectClipPreviewLocalFile");
  expect(clipPreviewSource).toContain("pickLocalVideoFile(win)");
  expect(clipPreviewSource).toContain("persistLocalVideoHandle");
  expect(indexSource).toContain("data-idp-clip-preview-reconnect");
  expect(indexSource).toContain("reconnectClipPreviewLocalFile(runtime)");
});

test("idp clip preview keeps the review queue visible when the local file is missing", () => {
  const html = renderIdpClipPreviewOverlay({
    clipBank: [
      {
        id: "clip-one",
        matchTitle: "NCC - Louisville",
        matchDate: "2026-06-27",
        eventType: "match",
        startMs: 10000,
        endMs: 30000,
        subPhase: "Build Up",
        phase: "In Possession",
      },
    ],
  }, {
    clipPreviewActiveIndex: 0,
    clipPreviewMessage: "Local video is not linked on this device yet.",
    clipPreviewOpen: true,
    clipPreviewQueueIds: ["clip-one"],
    clipPreviewStatus: "missing-handle",
  });

  expect(html).toContain("Local video is not linked on this device yet.");
  expect(html).toContain("The clip metadata is central, but playback needs the local file on this device.");
  expect(html).toContain("data-idp-clip-preview-reconnect");
  expect(html).toContain("Reconnect local file");
  expect(html).toContain("idp-clip-preview-sidebar");
  expect(html).toContain("My Clips");
  expect(html).toContain("Build Up / In Possession");
  expect(html).toContain("Match · NCC - Louisville · 2026-06-27");
});

test("idp clip bank search preserves typed spaces through workspace rerenders", () => {
  const indexSource = read("src/modules/idp/index.mjs");
  const clipBankSource = read("src/modules/idp/idp-clip-bank-renderer.mjs");

  expect(indexSource).toContain("preserveValue: isClipSearch");
  expect(clipBankSource).toContain('<input type="text" data-idp-clip-search');
  expect(clipBankSource).toContain('autocomplete="off"');
  expect(clipBankSource).toContain('spellcheck="false"');
});

test("idp adapter derives read-only fallback from Squad state", () => {
  const dashboard = buildIdpDashboardFromSquadState({
    players: [
      {
        id: "p1",
        name: "Player One",
        number: "18",
        position: "CM",
        primaryRole: "8",
        idp: { primaryFocus: "Scan before receive", nextAction: "Add evidence" },
      },
      { id: "p2", name: "Hidden Player", countsInSquad: false },
      {
        id: "p3",
        name: "Injured Player",
        position: "FW",
        primaryRole: "ST",
        idp: { status: "none" },
      },
      { id: "ghost-player", name: "", position: "Squad", ownerId: "coach-1" },
      { id: "placeholder-player", name: "Player", position: "Squad", ownerId: "coach-1" },
    ],
  });

  expect(dashboard).toHaveLength(2);
  expect(dashboard[0].profile).toMatchObject({ playerId: "p1", playerName: "Player One", squadNumber: "18" });
  expect(dashboard[0]).toMatchObject({
    focus: null,
    nextAction: "Create current focus",
    overallStatus: "No Active Focus",
  });
  expect(buildLegacyPlayerDetail({ id: "p1", name: "Player One", idp: { primaryFocus: "Scan before receive" } })).toMatchObject({
    profile: { playerId: "p1" },
    focuses: [],
    goals: [],
    interventions: [],
  });
  expect(dashboard[1]).toMatchObject({
    profile: { playerId: "p3", playerName: "Injured Player", status: "none" },
    focus: null,
    nextAction: "IDP inactive",
    overallStatus: "No Active IDP",
  });
  expect(buildLegacyPlayerDetail({ id: "p3", name: "Injured Player", idp: { status: "none" } })).toMatchObject({
    profile: { playerId: "p3", status: "none" },
    focuses: [],
    nextActions: [],
  });
});

test("idp assignment refresh preserves the full squad roster and player identity", async () => {
  const squadPlayers = [
    {
      id: "p1",
      name: "Kailen Sheridan",
      number: "1",
      position: "Goalkeeper",
      primaryRole: "GK",
      idp: { primaryFocus: "Distribution under pressure", nextAction: "Add evidence" },
    },
    {
      id: "p2",
      name: "Madison White",
      number: "21",
      position: "Goalkeeper",
      primaryRole: "GK",
      idp: { primaryFocus: "Create current focus" },
    },
  ];
  const store = createIdpStore({
    ui: { selectedPlayerId: "p1" },
    playerDetail: buildLegacyPlayerDetail(squadPlayers[0]),
  });
  const assignedPayloads = [];
  const api = {
    assignOwner: async (payload) => {
      assignedPayloads.push(payload);
      return { schema: "footballscience-idp-v1", ownerId: payload.ownerId };
    },
    loadDashboard: async () => ({
      schema: "footballscience-idp-v1",
      players: [
        {
          profile: { id: "idp-profile-p1", player_id: "p1", primary_owner_id: "coach-1" },
          focus: null,
          evidenceCount: 2,
          newClipCount: 1,
          nextAction: "Create current focus",
          overallStatus: "No Active Focus",
        },
        {
          profile: { id: "idp-profile-ghost", player_id: "ghost-player", player_name: "Player", position: "Squad" },
          focus: null,
          evidenceCount: 0,
          newClipCount: 0,
          nextAction: "Create current focus",
          overallStatus: "No Active Focus",
        },
      ],
    }),
    loadPlayer: async () => ({
      schema: "footballscience-idp-v1",
      profile: { id: "idp-profile-p1", player_id: "p1", primary_owner_id: "coach-1" },
      focuses: [],
      clipBank: [],
      evidence: [],
      reviews: [],
      nextActions: [],
      milestones: [],
      ownership: [{ owner_id: "coach-1", ownership_type: "player-owner", status: "active" }],
    }),
  };
  const actions = createIdpActions({
    store,
    api,
    context: { getPlayerProfilesState: () => ({ players: squadPlayers }) },
  });

  await actions.assignOwner({ get: (key) => (key === "ownerId" ? "coach-1" : "") });

  const state = store.getState();
  expect(assignedPayloads[0]).toMatchObject({ playerId: "p1", ownerId: "coach-1" });
  expect(state.dashboardPlayers.map((entry) => entry.profile.playerName)).toEqual(["Kailen Sheridan", "Madison White"]);
  expect(state.dashboardPlayers).toHaveLength(2);
  expect(state.dashboardPlayers[0].profile).toMatchObject({
    playerId: "p1",
    playerName: "Kailen Sheridan",
    ownerId: "coach-1",
    position: "Goalkeeper",
    squadNumber: "1",
  });
  expect(state.dashboardPlayers[0]).toMatchObject({
    focus: null,
    nextAction: "Create current focus",
    overallStatus: "No Active Focus",
  });
  expect(state.playerDetail.profile).toMatchObject({
    playerId: "p1",
    playerName: "Kailen Sheridan",
    ownerId: "coach-1",
    position: "Goalkeeper",
    squadNumber: "1",
  });
  expect(state.playerDetail.focuses).toEqual([]);
});

test("idp sync refreshes overview and selected player after an external central update", async () => {
  const squadPlayers = [
    {
      id: "p1",
      name: "Kailen Sheridan",
      position: "Goalkeeper",
      primaryRole: "GK",
      idp: { primaryFocus: "Distribution under pressure", nextAction: "Add observation" },
    },
  ];
  const store = createIdpStore({
    ui: { selectedPlayerId: "p1" },
    playerDetail: buildLegacyPlayerDetail(squadPlayers[0]),
    sync: { revision: "2026-06-15T10:00:00.000Z" },
  });
  let dashboardLoads = 0;
  let playerLoads = 0;
  const api = {
    loadSync: async () => ({
      schema: "footballscience-idp-v1",
      sync: { revision: "2026-06-15T10:05:00.000Z", updatedAt: "2026-06-15T10:05:00.000Z" },
    }),
    loadDashboard: async () => {
      dashboardLoads += 1;
      return {
        schema: "footballscience-idp-v1",
        sync: { revision: "2026-06-15T10:05:00.000Z", updatedAt: "2026-06-15T10:05:00.000Z" },
        players: [
          {
            profile: { id: "idp-profile-p1", player_id: "p1", primary_owner_id: "coach-1" },
            focus: {
              id: "server-focus",
              player_id: "p1",
              title: "Distribution after teammate review",
              category: "Tactical",
              status: "Reviewed",
            },
            evidenceCount: 3,
            newClipCount: 0,
            nextAction: "Create next focus",
            overallStatus: "On Track",
          },
        ],
      };
    },
    loadPlayer: async () => {
      playerLoads += 1;
      return {
        schema: "footballscience-idp-v1",
        sync: { revision: "2026-06-15T10:05:00.000Z", updatedAt: "2026-06-15T10:05:00.000Z" },
        profile: { id: "idp-profile-p1", player_id: "p1", primary_owner_id: "coach-1" },
        focuses: [
          {
            id: "server-focus",
            player_id: "p1",
            title: "Distribution after teammate review",
            category: "Tactical",
            status: "Reviewed",
          },
        ],
        clipBank: [],
        evidence: [],
        reviews: [
          {
            id: "review-1",
            player_id: "p1",
            focus_id: "server-focus",
            progress_summary: "Updated by another coach",
          },
        ],
        nextActions: [],
        milestones: [],
        ownership: [{ owner_id: "coach-1", ownership_type: "player-owner", status: "active" }],
      };
    },
  };
  const actions = createIdpActions({
    store,
    api,
    context: { getPlayerProfilesState: () => ({ players: squadPlayers }) },
  });

  await expect(actions.checkForExternalUpdates()).resolves.toBe(true);

  const state = store.getState();
  expect(dashboardLoads).toBe(1);
  expect(playerLoads).toBe(1);
  expect(state.sync.revision).toBe("2026-06-15T10:05:00.000Z");
  expect(state.dashboardPlayers[0].focus.title).toBe("Distribution after teammate review");
  expect(state.playerDetail.reviews[0].progressSummary).toBe("Updated by another coach");
});

test("idp sync guard only treats active supported editors as editing surfaces", () => {
  const actionsSource = read("src/modules/idp/idp-actions.mjs");

  expect(actionsSource).toContain("function hasActiveEditingSurface");
  expect(actionsSource).toContain("ui.actionMode");
  expect(actionsSource).toContain("ui.clipPreviewOpen");
  expect(actionsSource).not.toContain("ui.playerBoardOpen");
  expect(actionsSource).not.toContain("ui.playerBoardHandoutOpen");
});

test("idp sync does not close the focus editor while a coach is editing", async () => {
  const squadPlayers = [
    {
      id: "p1",
      name: "Kailen Sheridan",
      position: "Goalkeeper",
      primaryRole: "GK",
      idp: { primaryFocus: "Distribution under pressure" },
    },
  ];
  const detail = buildLegacyPlayerDetail(squadPlayers[0]);
  detail.focuses = [{
    id: "server-focus",
    playerId: "p1",
    title: "Distribution under pressure",
    description: "Keep the edit draft stable.",
    status: "Active",
  }];
  const store = createIdpStore({
    ui: {
      selectedPlayerId: "p1",
      profileView: "development",
      actionMode: "focus",
    },
    playerDetail: detail,
    sync: { revision: "2026-06-15T10:00:00.000Z" },
  });
  let syncLoads = 0;
  let dashboardLoads = 0;
  let playerLoads = 0;
  const actions = createIdpActions({
    store,
    api: {
      loadSync: async () => {
        syncLoads += 1;
        return {
          schema: "footballscience-idp-v1",
          sync: { revision: "2026-06-15T10:05:00.000Z", updatedAt: "2026-06-15T10:05:00.000Z" },
        };
      },
      loadDashboard: async () => {
        dashboardLoads += 1;
        return { schema: "footballscience-idp-v1", players: [] };
      },
      loadPlayer: async () => {
        playerLoads += 1;
        return { schema: "footballscience-idp-v1" };
      },
    },
    context: { getPlayerProfilesState: () => ({ players: squadPlayers }) },
  });

  await expect(actions.checkForExternalUpdates()).resolves.toBe(false);

  expect(syncLoads).toBe(0);
  expect(dashboardLoads).toBe(0);
  expect(playerLoads).toBe(0);
  expect(store.getState().ui).toMatchObject({
    selectedPlayerId: "p1",
    profileView: "development",
    actionMode: "focus",
  });
  expect(store.getState().playerDetail.focuses[0]).toMatchObject({
    title: "Distribution under pressure",
    description: "Keep the edit draft stable.",
  });
});

test("idp profile shows Squad-owned inactive IDP status", async () => {
  const injuredPlayer = {
    id: "p-injured",
    name: "Long Term Injury",
    position: "Forward",
    primaryRole: "ST",
    status: "injured",
    idp: { status: "none" },
  };
  const store = createIdpStore();
  const actions = createIdpActions({
    store,
    api: {
      loadDashboard: async () => ({
        schema: "footballscience-idp-v1",
        players: [
          {
            profile: { id: "idp-profile-injured", player_id: "p-injured", status: "active" },
            focus: { id: "server-focus", player_id: "p-injured", title: "Old active focus", status: "Active" },
            nextAction: "Add evidence",
            overallStatus: "On Track",
          },
        ],
      }),
      loadPlayer: async () => ({
        schema: "footballscience-idp-v1",
        profile: { id: "idp-profile-injured", player_id: "p-injured", status: "active" },
        focuses: [{ id: "server-focus", player_id: "p-injured", title: "Old active focus", status: "Active" }],
        clipBank: [],
        evidence: [],
        reviews: [],
        nextActions: [{ player_id: "p-injured", title: "Add evidence", status: "open" }],
        milestones: [],
        ownership: [],
      }),
    },
    context: { getPlayerProfilesState: () => ({ players: [injuredPlayer] }) },
  });

  await actions.loadDashboard();
  await actions.selectPlayer("p-injured");

  const state = store.getState();
  expect(state.dashboardPlayers[0]).toMatchObject({
    profile: { playerId: "p-injured", playerName: "Long Term Injury", status: "none" },
    focus: null,
    nextAction: "IDP inactive",
    overallStatus: "No Active IDP",
  });
  expect(state.playerDetail).toMatchObject({
    profile: { playerId: "p-injured", playerName: "Long Term Injury", status: "none" },
    focuses: [],
    nextActions: [],
  });

  const html = renderIdpWorkspace(
    { ...state, ui: { ...state.ui, selectedPlayerId: "p-injured" } },
    { canEdit: true, users: [] }
  );
  expect(html).toContain("No Active IDP");
  expect(html).toContain("idp-header is-player-context");
  expect(html).toContain("<h1>Long Term Injury</h1>");
  expect(html).toContain("No Active IDP · Forward / ST · Unassigned");
  expect(html).not.toContain("idp-profile-stage");
  expect(html).toContain("IDP is inactive from Squad Room");
  expect(html).toContain("No active IDP");
  expect(html).not.toContain("Old active focus");
  expect(html).not.toContain("data-idp-action=\"focus\"");

  const inactivePlayerBoardHtml = renderIdpWorkspace(
    { ...state, ui: { ...state.ui, selectedPlayerId: "p-injured", profileView: "player-board" } },
    { canEdit: true, users: [] }
  );
  expect(inactivePlayerBoardHtml).toContain("idp-profile-player-board-page");
  expect(inactivePlayerBoardHtml).toContain("No Active IDP");
  expect(inactivePlayerBoardHtml).toContain("IDP is inactive from Squad Room");
  expect(inactivePlayerBoardHtml).toContain("Create a current focus first");
  expect(inactivePlayerBoardHtml).not.toContain("idp-player-board-insight-row");
  expect(inactivePlayerBoardHtml).not.toContain("Old active focus");
});

test("fs player syncs saved player clips to idp clip bank through the server boundary", () => {
  const videoApi = read("api/_lib/video-analysis-database.js");
  expect(videoApi).toContain('require("./idp-database.js")');
  expect(videoApi).toContain("syncClipPlayersToIdp");
  expect(videoApi).toContain("upsertClipBankItem");
  expect(videoApi).toContain("idpClipBank");
});

test("idp module exports the workspace runtime handlers", async () => {
  const module = await import(pathToFileURL(path.join(moduleDir, "index.mjs")).href);
  for (const exportName of ["render", "handleClick", "handleInput", "handleChange", "handleSubmit"]) {
    expect(typeof module[exportName], exportName).toBe("function");
  }
});

test("idp profile overview navigation is not blocked by stale filter state", async () => {
  const indexSource = read("src/modules/idp/index.mjs");
  expect(indexSource.indexOf("const backTrigger = event?.target?.closest?.(\"[data-idp-back-overview]\")"))
    .toBeLessThan(indexSource.indexOf("const openFilterMenu = runtime?.store.getState?.()?.ui?.openFilterMenu"));
  expect(indexSource).toContain(".idp-stage-actions[open]");
  expect(indexSource).toContain('openFilterMenu: "", selectedPlayerId: "", profileView: "development", actionMode: "", editEvidenceId: "", editGoalId: "", error: "", message: ""');

  const store = createIdpStore({ ui: { openFilterMenu: "owner" } });
  const actions = createIdpActions({
    store,
    api: {
      loadPlayer: async () => ({
        profile: { playerId: "p1", playerName: "Player One", position: "FW", role: "9" },
        focuses: [],
        clipBank: [],
        evidence: [],
        reviews: [],
        nextActions: [],
        milestones: [],
        ownership: [],
      }),
    },
    context: {
      getPlayerProfilesState: () => ({ players: [{ id: "p1", name: "Player One", position: "FW", primaryRole: "9" }] }),
    },
  });

  await actions.selectPlayer("p1");

  expect(store.getState().ui.selectedPlayerId).toBe("p1");
  expect(store.getState().ui.openFilterMenu).toBe("");
});

test("idp search keeps focus and cursor position while filtering rerenders the overview", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    ok: true,
    schema: "footballscience-idp-v1",
    dashboardPlayers: [],
  });
  const imported = await import(`${pathToFileURL(path.join(moduleDir, "index.mjs")).href}?search-focus=${Date.now()}`);
  const documentRef = {
    activeElement: null,
    addEventListener() {},
    hidden: false,
  };
  const root = {
    isConnected: true,
    rendered: "",
    searchInput: null,
    querySelector(selector) {
      if (selector === "[data-idp-search]") return this.searchInput;
      if (selector === ".idp-player-profile, .idp-overview-board") return null;
      return null;
    },
    set innerHTML(value) {
      this.rendered = String(value || "");
      const [, searchValue = ""] = this.rendered.match(/data-idp-search value="([^"]*)"/) || [];
      const nextInput = {
        selectionEnd: 0,
        selectionStart: 0,
        value: searchValue,
        focus() {
          documentRef.activeElement = nextInput;
        },
        matches(selector) {
          return selector === "[data-idp-search]";
        },
        setSelectionRange(start, end) {
          this.selectionStart = start;
          this.selectionEnd = end;
        },
      };
      this.searchInput = nextInput;
    },
    get innerHTML() {
      return this.rendered;
    },
  };
  const context = {
    ui: { idpWorkspace: root },
    win: {
      addEventListener() {},
      document: documentRef,
      requestAnimationFrame(callback) {
        callback();
      },
      setInterval() {
        return 0;
      },
    },
    canEdit: () => true,
    getAuthToken: () => "test-token",
  };

  try {
    imported.render(context);
    const activeSearch = {
      selectionEnd: 3,
      selectionStart: 3,
      value: "Mad",
      matches(selector) {
        return selector === "[data-idp-search]";
      },
    };
    documentRef.activeElement = activeSearch;

    imported.handleInput({ target: activeSearch });

    expect(root.searchInput.value).toBe("Mad");
    expect(documentRef.activeElement).toBe(root.searchInput);
    expect(root.searchInput.selectionStart).toBe(3);
    expect(root.searchInput.selectionEnd).toBe(3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("idp runtime checks central sync while mounted and when the browser becomes active", () => {
  const indexSource = read("src/modules/idp/index.mjs");
  const apiSource = read("src/modules/idp/services/idp-api-service.mjs");
  expect(indexSource).toContain("IDP_SYNC_INTERVAL_MS");
  expect(indexSource).toContain("checkForExternalUpdates");
  expect(indexSource).toContain("visibilitychange");
  expect(indexSource).toContain("focus");
  expect(apiSource).toContain("action=sync");
  expect(apiSource).toContain("loadSync");
});
