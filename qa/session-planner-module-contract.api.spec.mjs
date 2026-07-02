import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  createSessionPlannerAutosaveBoundary,
  createSessionPlannerPlayerBoardRenderer,
  createSessionPlannerPrintRenderer,
  createSessionPlannerRenderer,
  createSessionPlannerVisualRenderer,
  isSessionPlannerAutosaveKey,
  sessionPlannerAutosaveActiveWindowMs,
  sessionPlannerModuleId,
  sessionPlannerStorageKey,
  shouldShowSessionPlannerAutosaveStatus,
} from "../src/modules/session-planner/index.mjs";
import { moduleMigrationStatuses, moduleStandardRegistry } from "../src/core/index.mjs";
import { platformModuleImplementationStages } from "../src/core/platform-readiness-contracts.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("Session Planner extraction owns autosave and renderer module boundaries", () => {
  [
    "src/modules/session-planner/index.mjs",
    "src/modules/session-planner/session-planner-autosave.mjs",
    "src/modules/session-planner/session-planner-renderer.mjs",
    "src/modules/session-planner/session-planner-workspace-controller.mjs",
    "src/modules/session-planner/session-planner-visual-renderer.mjs",
    "src/modules/session-planner/session-planner-player-board-renderer.mjs",
    "src/modules/session-planner/session-planner-print-renderer.mjs",
  ].forEach((path) => {
    expect(existsSync(resolve(root, path)), `${path} should exist`).toBe(true);
  });

  expect(sessionPlannerModuleId).toBe("session-planner");
  expect(sessionPlannerStorageKey).toBe("football-session-planner-v3");
  expect(sessionPlannerAutosaveActiveWindowMs).toBeGreaterThanOrEqual(10000);
});

test("Session Planner print renderer owns coach sheet controls, document, sections, visuals, and mini player board markup", () => {
  const block = {
    id: "block-1",
    label: "B1",
    title: "Pressing Wave",
    minutes: 18,
    phase: ["Pressing"],
    subPhase: ["High press"],
    focus: "Win it high",
    objective: "Force wide",
    why: "Create transition",
    organization: "Three zones",
    material: "Balls and cones",
    principles: "Compact distances",
    playerBoardColors: { p1: "#1d8bff" },
  };
  const session = {
    title: "Morning training",
    blocks: [block],
  };
  const boardPlayers = [
    {
      player: {
        id: "p1",
        name: "Mak Lind",
      },
      record: {},
      participation: 75,
    },
  ];
  const renderer = createSessionPlannerPrintRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    getState: () => ({
      printOverlayOpen: true,
      printPaper: "letter",
      printSections: {
        overview: true,
        blocks: true,
        details: true,
        visuals: true,
        players: true,
        medical: true,
      },
      selectedDate: "2026-05-19",
    }),
    getPaperOptions: () => ({
      letter: {
        label: "US Letter",
        detail: "11 x 8.5 in landscape",
        pageSize: "letter landscape",
        width: "11in",
        height: "8.5in",
      },
    }),
    getSectionOptions: () => [
      { key: "overview", label: "Overview" },
      { key: "blocks", label: "Block flow" },
      { key: "details", label: "Objectives & coaching points" },
      { key: "visuals", label: "Tactical visuals" },
      { key: "players", label: "Player boards" },
      { key: "medical", label: "Medical availability" },
    ],
    normalizeMultiValue: (value) => (Array.isArray(value) ? value : String(value || "").split(",").map((item) => item.trim()).filter(Boolean)),
    getPeriodizationDay: () => ({
      matchPhases: ["Pressing"],
      subPhases: ["High press"],
      teamPrinciples: ["Compact"],
      mainFocus: "Pressing",
      matchDay: -1,
      sessionType: "Training",
    }),
    getMedicalAvailability: () => ({
      all: [{ record: {}, participation: 75 }],
      available: [boardPlayers[0]],
      limited: [],
      unconfirmed: [],
    }),
    getPlayerBoardCustomColor: (_block, playerId) => (playerId === "p1" ? "#1d8bff" : ""),
    getPlayerBoardTone: () => "modified",
    getPlayerBoardSummary: () => ({
      boardPlayers,
      rule: { valueLabel: "75%+" },
    }),
    getInitialLabelMap: () => new Map([["p1", "ML"]]),
    getReadablePlayerBoardPositions: () => new Map([["p1", { x: 42, y: 50 }]]),
    getReadableSpacing: () => ({ minX: 8, minY: 7 }),
    getPlayerBoardPosition: () => ({ x: 42, y: 50 }),
    getPlayerBoardTextColor: () => "#ffffff",
    getPlayerInitials: () => "ML",
    renderExerciseVisual: () => '<div data-session-exercise-visual>Visual</div>',
    getSessionDateLabel: (_dateValue, options = {}) => (options.weekday ? "Tuesday" : "19 May 2026"),
    getMatchDayLabel: () => "Match Day -1",
    getDayScheduleLabel: () => "Training",
    getScheduledSessionTitle: () => "Scheduled session",
    getTotalMinutes: () => 18,
  });

  const overlayMarkup = renderer.renderOverlay(session);
  const documentMarkup = renderer.renderDocument(session);

  expect(overlayMarkup).toContain("data-session-print-overlay");
  expect(overlayMarkup).toContain("data-session-print-paper");
  expect(overlayMarkup).toContain("data-session-print-section");
  expect(overlayMarkup).toContain("data-session-print-now");
  expect(documentMarkup).toContain("data-session-print-document");
  expect(documentMarkup).toContain("session-print-page-front");
  expect(documentMarkup).toContain("session-print-page-back");
  expect(documentMarkup).toContain("session-print-flow");
  expect(documentMarkup).toContain("data-session-exercise-visual");
  expect(documentMarkup).toContain("session-print-player-board-mini");
  expect(documentMarkup).toContain("session-print-player-token");
});

test("Session Planner visual renderer owns tactical board pitch, objects, preview, and toolbox markup", () => {
  const visualRenderer = createSessionPlannerVisualRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    clamp: (value, min, max) => Math.min(max, Math.max(min, Number(value))),
    getState: () => ({
      visualPreviewOpen: true,
      tacticalboardOpen: true,
      tool: "blue-player",
      color: "#111827",
      lineWidth: 1.1,
      lineStyle: "solid",
      pendingPoint: { x: 33, y: 44 },
      selectedElementId: "el-1",
      draftLineState: null,
      freehandState: null,
    }),
    getPitchModeOptions: () => [{ key: "full", label: "Full pitch", dimensions: { x: 65, y: 105 }, landscape: false }],
    normalizeTacticalPitchMode: (value) => String(value || "full").trim() || "full",
    getTacticalPitchModeOption: () => ({ key: "full", label: "Full pitch", dimensions: { x: 65, y: 105 }, landscape: false }),
    isTacticalElementSelected: (id) => id === "el-1",
    normalizeTacticalColor: (value, fallback = "#111827") => value || fallback,
    getDefaultTacticalColor: () => "#111827",
    getTacticalRenderStrokeWidth: () => 0.6,
    getTacticalStrokeDasharray: () => "",
    getDefaultTacticalLineStyle: () => "solid",
    getTacticalCurveControlPoint: () => ({ x: 40, y: 40 }),
    getTacticalDefaultCurveControlPoint: () => ({ x: 40, y: 40 }),
    isTacticalGoalType: () => false,
    isTacticalPlayerType: (type) => ["blue-player", "red-player", "neutral-player"].includes(type),
    normalizeTacticalRotation: (value) => Number(value) || 0,
    normalizeTacticalPlayerBadge: (value) => String(value || "").slice(0, 2),
    isTacticalEndpointElement: (element) => ["arrow", "line", "zone", "ellipse", "curve", "run", "dashed-line", "dashed-zone"].includes(element?.type),
    getTacticalPitchDimensionsForBlock: () => ({ x: 65, y: 105 }),
    cloneTacticalElement: (element) => ({ ...element }),
    createLineElement: (type, from, to) => ({ type, x: from.x, y: from.y, x2: to.x, y2: to.y }),
    renderSelectionBox: () => '<rect class="session-tactical-selection-box"></rect>',
    ensureTacticalFrames: (block) => block.tacticalFrames || [{ id: "frame-1", label: "Frame 1", elements: block.tacticalElements || [] }],
    getTacticalActiveFrameId: () => "frame-1",
    getTacticalSelectedElementIds: () => ["el-1"],
    getTacticalNumberPickerElementId: () => "el-2",
  });
  const block = {
    id: "block-1",
    title: "Tactical",
    diagram: "build-up",
    tacticalPitchMode: "full",
    tacticalElements: [
      { id: "el-1", type: "arrow", x: 10, y: 20, x2: 40, y2: 50, color: "#111827" },
      { id: "el-2", type: "blue-player", x: 35, y: 42, playerNumber: "9" },
    ],
    tacticalFrames: [{ id: "frame-1", label: "Frame 1", elements: [] }],
  };

  const pitchMarkup = visualRenderer.renderPitchDiagram("build-up");
  const boardMarkup = visualRenderer.renderExerciseVisual(block, { large: true, editor: true });
  const previewMarkup = visualRenderer.renderVisualPreviewOverlay(block);
  const tacticalboardMarkup = visualRenderer.renderTacticalboardOverlay(block);

  expect(pitchMarkup).toContain("session-pitch-diagram-build-up");
  expect(boardMarkup).toContain("data-session-tactical-canvas");
  expect(boardMarkup).toContain('data-session-tactical-element-id="el-1"');
  expect(boardMarkup).toContain("session-tactical-selection-box");
  expect(boardMarkup).toContain("session-tactical-player-badge");
  expect(boardMarkup).toContain("session-tactical-number-picker");
  expect(previewMarkup).toContain("data-session-visual-preview-overlay");
  expect(tacticalboardMarkup).toContain("data-session-tacticalboard-overlay");
  expect(tacticalboardMarkup).toContain('data-session-tactical-tool="blue-player"');
  expect(tacticalboardMarkup).toContain('data-session-tactical-frame="frame-1"');
  expect(tacticalboardMarkup).toContain("data-session-tactical-color");
  expect(tacticalboardMarkup).toContain("session-tacticalboard-status-strip");
  expect(tacticalboardMarkup).toContain("data-session-tactical-selected-label");
  expect(tacticalboardMarkup).toContain("data-session-tactical-hint-state");
  expect(tacticalboardMarkup).toContain("data-session-tactical-color-choice");
});

test("Session Planner player board renderer owns player board, Squad Bridge, Assistant, and team tool markup", () => {
  const block = {
    id: "block-1",
    label: "Block 1",
    title: "Pressing Wave",
    playerBoardColors: { p1: "#1d8bff" },
    playerBoardPositions: { p1: { x: 30, y: 40 } },
    playerBoardCustomPeople: [{ id: "person-1", name: "Coach Pat", role: "Coach", kind: "staff" }],
  };
  const boardPlayers = [
    {
      player: {
        id: "p1",
        name: "Mak Lind",
        number: "9",
        position: "ST",
        profileId: "profile-1",
        primaryRole: "ST",
        secondaryRoles: ["8"],
        roleFit: { ST: 88, 8: 62 },
      },
      record: { actualParticipation: 75, rtpPhase: "return-to-training", comment: "Ready with limits" },
      status: { label: "Available" },
      participation: 75,
    },
    {
      player: {
        id: "person-1",
        name: "Coach Pat",
        position: "Coach",
        playerBoardCustom: true,
        playerBoardRoleLabel: "Coach",
      },
      record: null,
      planningOnly: true,
      status: { label: "Staff added" },
      participation: 100,
    },
  ];
  const warnings = {
    rule: { label: "Training gate", valueLabel: "75%+" },
    available: boardPlayers,
    belowLimit: [],
    unavailable: [],
    unconfirmed: [],
    hasWarnings: false,
  };
  const renderer = createSessionPlannerPlayerBoardRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    getState: () => ({
      playerBoardOpen: true,
      selectedPlayerIds: ["p1"],
      formationInput: "3-3-1",
      teamCount: 2,
      autoMode: "balanced",
      assistantOpen: true,
      customPersonEditor: { personId: "person-1" },
      selectedDate: "2026-05-19",
    }),
    playerProfileRoleOptions: () => ["GK", "CB", "8", "10", "ST"],
    positionGroups: () => [
      { x: 18, shortLabel: "GK", label: "Goalkeeper" },
      { x: 42, shortLabel: "MID", label: "Midfield" },
      { x: 76, shortLabel: "ATT", label: "Attack" },
    ],
    colorOptions: () => [
      { label: "Blue", value: "#1d8bff" },
      { label: "Red", value: "#ff4f4f" },
    ],
    autoModeOptions: () => [{ key: "balanced", label: "Balanced" }],
    maxTeamCount: () => 2,
    getBridgeSummary: () => ({
      linkedCount: 1,
      totalCount: 2,
      temporaryCount: 0,
      roleDnaCount: 1,
      roleSummary: "ST 1",
      linkedItems: [boardPlayers[0]],
    }),
    getBridgeBestMatches: () => [{ role: "ST", score: 88 }],
    getBridgeContract: () => ({
      primaryRole: "ST",
      secondaryRoles: ["8"],
      preferredSide: "center",
      roleFit: { ST: 88, 8: 62 },
      idp: { primaryFocus: "Press to finish" },
    }),
    getBridgeRoleLabel: () => "ST",
    buildSelectionAssistant: () => ({
      profile: { label: "Balanced exercise", detail: "Builds a balanced group.", roles: ["ST", "8"] },
      suggestions: [{ item: boardPlayers[0], score: 91, reason: "Role DNA ST 88%" }],
      selectedRoleCoverage: [
        { role: "ST", covered: true, score: 88 },
        { role: "8", covered: false, score: 0 },
      ],
      missingRoles: [{ role: "8" }],
    }),
    getPlayerBoardWarnings: () => warnings,
    formatPlayerWarningNames: () => "No players",
    getSelectedColorIds: () => ["p1"],
    getSelectedBlock: () => block,
    getPlayerBoardPlayers: () => boardPlayers,
    normalizeTeamCount: (value) => Number(value) || 2,
    normalizeAutoMode: (value) => value || "balanced",
    getPlayerBoardTextColor: () => "#ffffff",
    getPlayerBoardSummary: () => ({
      boardPlayers,
      rule: warnings.rule,
      temporaryBoardCount: 0,
      belowLimitCount: 0,
      hiddenZeroCount: 0,
      unconfirmedCount: 0,
    }),
    getInitialLabelMap: () => new Map([["p1", "ML"], ["person-1", "CP"]]),
    getReadablePlayerBoardPositions: () => new Map([["p1", { x: 30, y: 40 }], ["person-1", { x: 60, y: 50 }]]),
    getReadableSpacing: () => ({ minX: 8.8, minY: 7.4 }),
    getPlayerBoardPosition: (_block, _item, index) => (index ? { x: 60, y: 50 } : { x: 30, y: 40 }),
    getPlayerBoardTone: () => "full",
    getPlayerBoardCustomColor: (_block, playerId) => (playerId === "p1" ? "#1d8bff" : ""),
    getPlayerBoardColorStyle: (color) => (color ? `--session-player-board-color: ${color};` : ""),
    isTemporaryPlayer: () => false,
    getRosterLabel: () => "Squad player",
    getPlayerInitials: (player) => player.name.split(" ").map((part) => part[0]).join("").slice(0, 2),
    getPlayerBoardCustomPerson: () => ({ id: "person-1", name: "Coach Pat", role: "Coach", kind: "staff" }),
    getSourceBlocks: () => [{ block: { id: "source-1", title: "Warmup", playerBoardColors: { p1: "#1d8bff" }, playerBoardPositions: { p1: { x: 20, y: 20 } } }, index: 0 }],
    getSourceLabel: () => "Block 1: Warmup",
    getDataObject: (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {},
    syncSelection: () => boardPlayers[0],
    normalizeActualParticipation: (value) => value,
    medicalActualParticipationFallback: "not-logged",
    getRtpPhaseOption: () => ({ label: "Return to training" }),
    getCoachComment: () => "Ready with limits",
    formatDateLabel: () => "19 May 2026",
    renderPlayerAvatar: () => '<span class="session-player-board-profile-avatar">ML</span>',
  });

  const previewMarkup = renderer.renderPlayerBoard(block);
  const overlayMarkup = renderer.renderPlayerBoardOverlay(block);
  const toolMarkup = renderer.renderPlayerBoardTools();
  const bridgeMarkup = renderer.renderSquadBridgePanel(boardPlayers);

  expect(previewMarkup).toContain("data-session-open-player-board");
  expect(previewMarkup).toContain("session-player-board-preview-token");
  expect(overlayMarkup).toContain("data-session-player-board-overlay");
  expect(overlayMarkup).toContain('data-session-player-board-token="p1"');
  expect(overlayMarkup).toContain("data-session-player-board-tools");
  expect(overlayMarkup).toContain("data-session-player-board-copy-form");
  expect(overlayMarkup).toContain("data-session-player-board-tidy-selected");
  expect(overlayMarkup).toContain("Smart Align");
  expect(overlayMarkup).toContain("data-session-selection-assistant-overlay");
  expect(overlayMarkup).toContain("data-session-player-board-profile-overlay");
  expect(overlayMarkup).toContain("data-session-player-board-person-form");
  expect(toolMarkup).toContain("data-session-player-board-auto-form");
  expect(toolMarkup).toContain("data-session-player-board-color");
  expect(bridgeMarkup).toContain('data-session-squad-bridge-player="p1"');
});

test("Session Planner renderer owns block form fields, multiselects, notes, and block list markup", () => {
  const renderer = createSessionPlannerRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    canEdit: () => true,
    normalizeMultiValue: (value) => (Array.isArray(value) ? value : String(value || "").split(",").map((item) => item.trim()).filter(Boolean)),
    getMultiSelectOpenField: () => "phase",
    multiSelectFields: new Set(["phase", "subPhase"]),
    getReviewNotesForBlock: () => [
      {
        sessionDate: "2026-05-19",
        blockTitle: "QA Exercise",
        notes: "Good transfer",
      },
    ],
    formatLibraryDate: (value) => `Date ${value}`,
    getScheduleSessionEventForDate: () => ({ title: "Team training" }),
  });
  const block = {
    id: "block-1",
    label: "Block 1",
    title: "Pressing Game",
    phase: "Pressing",
    postSessionNotes: "",
    minutes: 18,
  };
  const fieldMarkup = renderer.renderEditableField(block, "phase", "Phase", {
    long: false,
    listOptions: ["Pressing", "Build Up"],
  });
  const headerMarkup = renderer.renderHeaderField(block, "title", "New Exercise", {
    tag: "textarea",
    className: "session-builder-title-input",
  });
  const notesMarkup = renderer.renderPostSessionNotesCard(block);
  const blockListMarkup = renderer.renderBlockList({
    date: "2026-05-19",
    selectedBlockId: "block-1",
    blocks: [block],
  });
  const emptyBlockMarkup = renderer.renderBlockList({
    date: "2026-05-20",
    selectedBlockId: "",
    blocks: [],
  });

  expect(fieldMarkup).toContain('data-session-multiselect="phase"');
  expect(fieldMarkup).toContain('data-session-multiselect-option="phase"');
  expect(fieldMarkup).toContain('aria-expanded="true"');
  expect(headerMarkup).toContain('data-session-field="title"');
  expect(notesMarkup).toContain("Post Session Notes");
  expect(notesMarkup).toContain('data-session-post-notes-reflection');
  expect(notesMarkup).toContain('data-session-post-notes-save');
  expect(notesMarkup).toContain("Previous Review Notes");
  expect(notesMarkup).toContain("Good transfer");
  expect(blockListMarkup).toContain('data-session-block-id="block-1"');
  expect(blockListMarkup).toContain('data-session-move-block="block-1"');
  expect(blockListMarkup).toContain('data-session-delete-block="block-1"');
  expect(emptyBlockMarkup).toContain("Training is scheduled");
  expect(emptyBlockMarkup).toContain("Team training is in Schedule");
});

test("Session Planner autosave status never becomes a global platform autosave", () => {
  expect(isSessionPlannerAutosaveKey("football-session-planner-v3")).toBe(true);
  expect(isSessionPlannerAutosaveKey("football-schedule-v1")).toBe(false);
  expect(isSessionPlannerAutosaveKey("football-medical-team-v1")).toBe(false);
  expect(shouldShowSessionPlannerAutosaveStatus("session-planner")).toBe(true);
  expect(shouldShowSessionPlannerAutosaveStatus("schedule")).toBe(false);
  expect(shouldShowSessionPlannerAutosaveStatus("medical-team")).toBe(false);
});

test("Session Planner autosave boundary only surfaces active session writes and sync issues", () => {
  let clock = 1000;
  const statuses = [];
  let workspaceId = "session-planner";
  let visible = null;
  const boundary = createSessionPlannerAutosaveBoundary({
    now: () => clock,
    getActiveWorkspaceId: () => workspaceId,
    setStatus: (...args) => statuses.push(args),
    setVisible: (nextVisible) => {
      visible = nextVisible;
    },
    activeWindowMs: 5000,
  });

  expect(boundary.syncVisibility()).toBe(true);
  expect(visible).toBe(true);
  expect(boundary.setStatusForKey(sessionPlannerStorageKey, "saving", "Saving")).toBe(false);
  expect(statuses).toEqual([]);

  boundary.markSessionPlannerWrite();
  expect(boundary.setStatusForKey(sessionPlannerStorageKey, "saving", "Saving")).toBe(true);
  expect(statuses).toEqual([["saving", "Saving"]]);

  clock += 6000;
  expect(boundary.setStatusForKey(sessionPlannerStorageKey, "saved", "Saved")).toBe(false);
  expect(boundary.setStatusForKey(sessionPlannerStorageKey, "issue", "Sync needs attention")).toBe(true);
  expect(statuses.at(-1)).toEqual(["issue", "Sync needs attention"]);

  workspaceId = "schedule";
  expect(boundary.syncVisibility()).toBe(false);
  expect(visible).toBe(false);
  boundary.markSessionPlannerWrite();
  expect(boundary.setStatusForKey(sessionPlannerStorageKey, "saving", "Saving")).toBe(false);
  expect(boundary.setStatusForKey("football-schedule-v1", "issue", "Schedule issue")).toBe(false);
});

test("Session Planner app integration delegates autosave policy and block rendering to the module", () => {
  const app = readProjectFile("app-runtime.js");
  const appRuntimeComposer = readProjectFile("src/modules/session-planner/session-planner-app-runtime-composer.mjs");
  const workspaceRuntimeComposer = readProjectFile("src/core/workspace-runtime-composer.mjs");
  const workspaceController = readProjectFile("src/modules/session-planner/session-planner-workspace-controller.mjs");
  const runtimeRenderers = readProjectFile("src/modules/session-planner/session-planner-runtime-renderers.mjs");
  const runtimeService = readProjectFile("src/modules/session-planner/session-planner-runtime-service.mjs");
  const runtimeServiceComposer = readProjectFile("src/modules/session-planner/session-planner-runtime-service-composer.mjs");
  const runtimeStateService = readProjectFile("src/modules/session-planner/session-planner-runtime-state-service.mjs");
  const printRenderer = readProjectFile("src/modules/session-planner/session-planner-print-renderer.mjs");
  const runtimeSource = `${app}\n${workspaceRuntimeComposer}\n${workspaceController}\n${runtimeRenderers}\n${runtimeService}\n${runtimeStateService}`;

  expect(app).toContain("./src/modules/session-planner/index.mjs");
  expect(app).toContain("createSessionPlannerAutosaveBoundary");
  expect(app).not.toContain("createSessionPlannerWorkspaceController");
  expect(runtimeService).toContain("createSessionPlannerWorkspaceController({");
  expect(app).toContain("createSessionPlannerAppRuntimeComposition({");
  expect(appRuntimeComposer).toContain("createSessionPlannerRuntimeRenderers");
  expect(runtimeRenderers).toContain("createSessionPlannerPlayerBoardRenderer");
  expect(runtimeRenderers).toContain("createSessionPlannerPrintRenderer");
  expect(runtimeRenderers).toContain("createSessionPlannerRenderer");
  expect(runtimeRenderers).toContain("createSessionPlannerVisualRenderer");
  expect(app).toContain("createWorkspaceRuntimeComposition({");
  expect(app).not.toContain("createSessionPlannerRuntimeServiceComposition({");
  expect(workspaceRuntimeComposer).toContain("createSessionPlannerRuntimeServiceComposition({");
  expect(app).not.toContain("createSessionPlannerRuntimeService({");
  expect(runtimeServiceComposer).toContain("createSessionPlannerRuntimeService({");
  expect(app).not.toContain("createSessionPlannerRuntimeStateService({");
  expect(runtimeStateService).toContain("sessionPlannerAutosaveBoundary.markSessionPlannerWrite();");
  expect(runtimeSource).toContain("sessionPlannerRenderer.renderBlockList(session)");
  expect(runtimeSource).toContain("sessionPlannerRenderer.renderEditableField(block, key, label, options)");
  expect(runtimeSource).toContain("sessionPlannerVisualRenderer.renderExerciseVisual(block, options)");
  expect(runtimeSource).toContain("sessionPlannerVisualRenderer.renderTacticalboardOverlay(block)");
  expect(runtimeSource).toContain("sessionPlannerPlayerBoardRenderer.renderPlayerBoard(block)");
  expect(runtimeSource).toContain("sessionPlannerPlayerBoardRenderer.renderPlayerBoardOverlay(block)");
  expect(runtimeSource).toContain("sessionPlannerPrintRenderer.renderOverlay(session)");
  expect(printRenderer).toContain("function renderSessionPlannerPrintDocument(session)");
  expect(printRenderer).toContain("renderDocument: renderSessionPlannerPrintDocument");
  expect(app).not.toContain('const sessionPlannerStorageKey = "football-session-planner-v3";');
  expect(app).not.toContain('return workspaceId === "session-planner";');
});

test("Session Planner is tracked as partial extraction while deeper UI remains in app.js", () => {
  const contract = moduleStandardRegistry.require("session-planner");

  expect(contract.migrationStatus).toBe(moduleMigrationStatuses.partialExtraction);
  expect(contract.currentFiles).toContain("src/modules/session-planner/index.mjs");
  expect(contract.currentFiles).toContain("src/modules/session-planner/session-planner-autosave.mjs");
  expect(contract.currentFiles).toContain("src/modules/session-planner/session-planner-renderer.mjs");
  expect(contract.currentFiles).toContain("src/modules/session-planner/session-planner-workspace-controller.mjs");
  expect(contract.currentFiles).toContain("src/modules/session-planner/session-planner-visual-renderer.mjs");
  expect(contract.currentFiles).toContain("src/modules/session-planner/session-planner-player-board-renderer.mjs");
  expect(contract.currentFiles).toContain("src/modules/session-planner/session-planner-print-renderer.mjs");
  expect(contract.testFiles).toContain("qa/session-planner-module-contract.api.spec.mjs");
  expect(platformModuleImplementationStages["session-planner"]).toBe("partial-extraction");
});
