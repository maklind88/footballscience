import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import {
  createEmptySetPiecesState,
  createSetPiecePhase,
  createSetPiecePlay,
  duplicateSetPiecePhase,
  duplicateSetPieceVariant,
  getActiveSetPiece,
  getActiveSetPiecePhase,
  getActiveSetPieceVariant,
  normalizeSetPiecesState,
} from "../src/modules/set-pieces-room/state.mjs";
import { createSetPieceAssignmentController } from "../src/modules/set-pieces-room/assignment-controller.mjs";
import { createSetPiecesBoardInteractionController } from "../src/modules/set-pieces-room/board-interaction-controller.mjs";
import { getSetPieceAssignment, resolveSetPiecePhaseAssignments } from "../src/modules/set-pieces-room/assignments.mjs";
import {
  createSetPiecePlayerLabelMap,
  getSetPiecePlayerPhotoUrl,
  getSetPieceRosterPlayers,
} from "../src/modules/set-pieces-room/player-labels.mjs";
import { createSetPiecesPersistence } from "../src/modules/set-pieces-room/persistence.mjs";
import { cloneSetPiecePlay } from "../src/modules/set-pieces-room/play-helpers.mjs";
import {
  easeSetPiecePlaybackProgress,
  getSetPieceElementPlaybackProgress,
  interpolateSetPiecePlaybackElement,
} from "../src/modules/set-pieces-room/playback-geometry.mjs";
import { renderSetPieceBoard } from "../src/modules/set-pieces-room/board-renderer.mjs";
import { chooseSetPieceDrawingActor, getSetPieceDrawingActors } from "../src/modules/set-pieces-room/drawing-actors.mjs";
import { createSetPiecesPlaybackController } from "../src/modules/set-pieces-room/playback-controller.mjs";
import { renderSetPiecesPresentationWorkspace } from "../src/modules/set-pieces-room/presentation-workspace-renderer.mjs";
import { renderSetPiecesWorkspace } from "../src/modules/set-pieces-room/workspace-renderer.mjs";
import { getSetPiecesWideEditorProjection } from "../src/modules/set-pieces-room/wide-editor-board.mjs";
import { renderSetPieceLibraryLayer } from "../src/modules/set-pieces-room/library-renderer.mjs";
import {
  clearSetPieceLibraryFilters,
  createSetPieceLibraryFilters,
  matchesSetPieceLibraryFilters,
  updateSetPieceLibraryFilter,
} from "../src/modules/set-pieces-room/library-filters.mjs";
import {
  getNextSetPiecePlayerPlacement,
  getSetPiecePitchTransform,
  getSetPiecePitchViewBox,
  getSetPieceSourcePoint,
  normalizeSetPiecePointForPitchView,
} from "../src/modules/set-pieces-room/geometry.mjs";
import {
  getSetPiecePresentationCatalog,
  resolveSetPiecePresentationVariant,
} from "../src/modules/set-pieces-room/presentation-adapter.mjs";
import { defaultHubState } from "../src/core/workspace-defaults.mjs";
import { platformModules, protectedStorageKeys } from "../src/core/platform-contracts.mjs";

const require = createRequire(import.meta.url);
const { dataSafetyRegistry } = require("../src/core/data-safety-contracts.cjs");
const { platformPermissionMatrixByModule } = require("../src/core/permission-matrix.cjs");

test("Set Pieces Room starts empty and creates a structured phase and variant tree", () => {
  const empty = createEmptySetPiecesState();
  expect(empty.plays).toEqual([]);

  const play = createSetPiecePlay({ title: "Near-post release" });
  expect(play.variants).toHaveLength(1);
  expect(play.subPhases).toEqual(["first-action"]);
  expect(play.variants[0].phases).toHaveLength(1);
  expect(play.variants[0].phases[0]).toMatchObject({ title: "Start", elements: [], drawings: [] });
});

test("set-piece sub-phases normalize legacy, duplicate and invalid values safely", () => {
  const legacy = createSetPiecePlay({ title: "Legacy delivery" });
  delete legacy.subPhases;
  const tagged = createSetPiecePlay({
    title: "Second-ball structure",
    subPhases: ["second-ball", "transition", "unknown", "second-ball"],
  });
  const state = normalizeSetPiecesState({ plays: [legacy, tagged] });

  expect(state.schemaVersion).toBe(4);
  expect(state.plays[0].subPhases).toEqual(["first-action"]);
  expect(state.plays[1].subPhases).toEqual(["second-ball", "transition"]);
});

test("library filters combine groups with AND and choices inside a group with OR", () => {
  const attackingCorner = createSetPiecePlay({
    title: "Attacking corner",
    moment: "attack",
    restart: "corner",
    subPhases: ["first-action", "second-ball"],
  });
  const defendingThrowIn = createSetPiecePlay({
    title: "Defending throw-in",
    moment: "defend",
    restart: "throw-in",
    subPhases: ["setup"],
  });
  const attackingPenalty = createSetPiecePlay({
    title: "Attacking penalty",
    moment: "attack",
    restart: "penalty",
    subPhases: ["first-action"],
  });
  let filters = createSetPieceLibraryFilters();
  filters = updateSetPieceLibraryFilter(filters, "moment", "attack", true);
  filters = updateSetPieceLibraryFilter(filters, "restart", "corner", true);
  filters = updateSetPieceLibraryFilter(filters, "restart", "penalty", true);

  expect(matchesSetPieceLibraryFilters(attackingCorner, filters)).toBe(true);
  expect(matchesSetPieceLibraryFilters(attackingPenalty, filters)).toBe(true);
  expect(matchesSetPieceLibraryFilters(defendingThrowIn, filters)).toBe(false);

  filters = updateSetPieceLibraryFilter(filters, "subPhase", "second-ball", true);
  expect(matchesSetPieceLibraryFilters(attackingCorner, filters)).toBe(true);
  expect(matchesSetPieceLibraryFilters(attackingPenalty, filters)).toBe(false);
  expect(matchesSetPieceLibraryFilters(attackingCorner, clearSetPieceLibraryFilters())).toBe(true);
});

test("library renders a compact multi-choice filter and compound set-piece labels", () => {
  const corner = createSetPiecePlay({
    id: "corner-plan",
    title: "Near-post delivery",
    moment: "attack",
    restart: "corner",
    subPhases: ["second-ball"],
  });
  const throwIn = createSetPiecePlay({
    id: "throw-plan",
    title: "Touchline pressure",
    moment: "defend",
    restart: "throw-in",
    subPhases: ["setup"],
  });
  const state = normalizeSetPiecesState({ activePlayId: corner.id, plays: [corner, throwIn] });
  let filters = createSetPieceLibraryFilters();
  filters = updateSetPieceLibraryFilter(filters, "moment", "attack", true);
  filters = updateSetPieceLibraryFilter(filters, "restart", "corner", true);
  const markup = renderSetPieceLibraryLayer(state, {
    libraryOpen: true,
    libraryFiltersOpen: true,
    libraryFilters: filters,
  });

  expect(markup).toContain('data-set-piece-action="toggle-library-filters"');
  expect(markup).toContain('data-set-piece-library-filter-group="subPhase"');
  expect(markup).toContain("Attacking · Corner");
  expect(markup).toContain('data-set-piece-play-id="corner-plan"');
  expect(markup).not.toContain('data-set-piece-play-id="throw-plan"');
});

test("saved status stays accessible without occupying the Set Pieces header", () => {
  const state = createEmptySetPiecesState();
  const savedMarkup = renderSetPiecesWorkspace({ state, ui: { saveState: "saved", saveMessage: "Saved" } });
  const errorMarkup = renderSetPiecesWorkspace({ state, ui: { saveState: "error", saveMessage: "Save failed" } });

  expect(savedMarkup).toContain('class="spr-save-state is-saved sr-only"');
  expect(savedMarkup).toContain('role="status" aria-live="polite"');
  expect(errorMarkup).toContain('class="spr-save-state is-error"');
  expect(errorMarkup).not.toContain('class="spr-save-state is-error sr-only"');
});

test("library is launched from the edit header without reducing board width", () => {
  const state = createEmptySetPiecesState();
  const closedMarkup = renderSetPiecesWorkspace({ state, ui: { libraryOpen: false } });
  const openMarkup = renderSetPiecesWorkspace({ state, ui: { libraryOpen: true } });

  expect(closedMarkup).toContain('data-set-piece-action="toggle-library"');
  expect(closedMarkup).toContain('aria-expanded="false"');
  expect(closedMarkup).toContain('id="setPieceLibraryPanel" class="spr-library-layer" hidden');
  expect(openMarkup).toContain('aria-expanded="true"');
  expect(openMarkup).toContain('class="spr-library-layer"');
  expect(openMarkup).toContain('data-set-piece-action="close-library"');
  expect(openMarkup.indexOf("spr-library-layer")).toBeLessThan(openMarkup.indexOf("spr-layout"));
});

test("editor keeps tactical guidance in a first-run dialog instead of over the pitch", () => {
  const play = createSetPiecePlay({ title: "Near-post release" });
  const state = normalizeSetPiecesState({ activePlayId: play.id, plays: [play] });
  const markup = renderSetPiecesWorkspace({
    state,
    roster: [{ id: "player-a", name: "Alex Example", position: "Forward", player: { id: "player-a", name: "Alex Example" } }],
    ui: {
      activeTool: "run",
      selectedElementIds: new Set(),
      layers: new Set(["home", "opponent", "ball", "drawings", "labels"]),
      inspectorCollapsed: true,
      playbackSpeed: 1,
      onboardingOpen: true,
    },
  });

  expect(markup).toContain('class="spr-editor-command-bar"');
  expect(markup).toContain('class="spr-onboarding-dialog"');
  expect(markup).not.toContain('class="spr-active-tool-hint"');
  expect(markup).not.toContain("Previous phase shown");
  expect(markup).toContain("Drag from a player to draw the run");
  expect(markup).toContain('data-set-piece-tool="run"');
  expect(markup).toContain('aria-pressed="true"');
  expect(markup).toContain('data-set-piece-action="toggle-play"');
  expect(markup).toContain('<svg viewBox="0 0 24 24"');
  expect(markup).toContain('data-set-piece-action="close-inspector"');

  const assignmentsMarkup = renderSetPiecesWorkspace({
    state,
    roster: [],
    ui: {
      activeTool: "select",
      selectedElementIds: new Set(),
      layers: new Set(["home", "opponent", "ball", "drawings", "labels"]),
      inspectorCollapsed: false,
      showAssignments: true,
      playbackSpeed: 1,
    },
  });
  expect(assignmentsMarkup).toContain('data-set-piece-action="show-plan"');
  expect(assignmentsMarkup).toContain('aria-label="Close details"');
});

test("phase duplication preserves actor identity without sharing mutable arrays", () => {
  const phase = createSetPiecePhase({
    elements: [{ id: "home-a", kind: "home-player", x: 80, y: 15, profileId: "player-a", label: "AE" }],
  });
  const duplicate = duplicateSetPiecePhase(phase, 1);

  expect(duplicate.id).not.toBe(phase.id);
  expect(duplicate.elements[0].id).toBe("home-a");
  duplicate.elements[0].x = 92;
  expect(phase.elements[0].x).toBe(80);
});

test("variant duplication records its branch and remaps phase ids", () => {
  const play = createSetPiecePlay();
  const source = play.variants[0];
  source.trigger = "Opponent 4 follows the screen";
  const duplicate = duplicateSetPieceVariant(source, "Release outside");

  expect(duplicate.baseVariantId).toBe(source.id);
  expect(duplicate.branchFromPhaseId).toBe(source.activePhaseId);
  expect(duplicate.phases[0].id).not.toBe(source.phases[0].id);
  expect(duplicate.title).toBe("Release outside");
});

test("plan duplication remaps actor identity consistently across every phase", () => {
  const play = createSetPiecePlay({ title: "Front zone" });
  const phase = play.variants[0].phases[0];
  phase.elements.push({ id: "runner-a", kind: "home-player", x: 72, y: 18, profileId: "player-a", label: "AE" });
  phase.drawings.push({ id: "run-a", type: "run", actorId: "runner-a", startX: 72, startY: 18, endX: 88, endY: 12 });
  play.variants[0].phases.push(duplicateSetPiecePhase(phase, 1));

  const normalizedSource = normalizeSetPiecesState({ activePlayId: play.id, plays: [play] }).plays[0];
  const duplicate = cloneSetPiecePlay(normalizedSource, "coach-a");
  const actorIds = duplicate.variants[0].phases.map((item) => item.elements[0].id);
  expect(new Set(actorIds).size).toBe(1);
  expect(actorIds[0]).not.toBe("runner-a");
  expect(duplicate.variants[0].phases[0].drawings[0].actorId).toBe(actorIds[0]);
  expect(duplicate.assignments[0].slotId).toBe(actorIds[0]);
  expect(duplicate).toMatchObject({ title: "Front zone copy", updatedBy: "coach-a" });
});

test("legacy player markers migrate into stable role assignments across variants", () => {
  const play = createSetPiecePlay({ title: "Legacy corner" });
  delete play.assignments;
  const phase = play.variants[0].phases[0];
  phase.elements.push({ id: "runner-a", kind: "home-player", x: 72, y: 18, profileId: "player-a", label: "AA" });
  play.variants[0].phases.push(duplicateSetPiecePhase(phase, 1));
  play.variants[0].phases.push(createSetPiecePhase({
    title: "Late phase",
    elements: [{ id: "legacy-runner-copy", kind: "home-player", x: 88, y: 24, profileId: "player-a", label: "AA" }],
  }));
  play.variants.push(duplicateSetPieceVariant(play.variants[0], "Variant 2"));

  const state = normalizeSetPiecesState({ schemaVersion: 1, activePlayId: play.id, plays: [play] });
  const normalized = state.plays[0];
  const linkedElements = normalized.variants.flatMap((variant) => variant.phases.flatMap((item) => item.elements));

  expect(state.schemaVersion).toBe(4);
  expect(normalized.assignments).toEqual([{ slotId: "runner-a", role: "Role 1", profileId: "player-a" }]);
  expect(linkedElements.every((element) => element.id === "runner-a" && element.profileId === "player-a")).toBe(true);
});

test("player assignment swaps stay separate from tactical roles and variant overrides", () => {
  const play = createSetPiecePlay({ title: "Role assignments" });
  const phase = play.variants[0].phases[0];
  phase.elements.push(
    { id: "slot-a", kind: "home-player", x: 72, y: 18, profileId: "player-a", label: "AA", role: "Near post" },
    { id: "slot-b", kind: "home-player", x: 78, y: 24, profileId: "player-b", label: "BB", role: "Screen" }
  );
  play.variants.push(duplicateSetPieceVariant(play.variants[0], "Variant 2"));
  let state = normalizeSetPiecesState({ activePlayId: play.id, plays: [play] });
  const ui = {
    assignmentScope: "play",
    assignmentPickerSlotId: "",
    showAssignments: false,
    inspectorCollapsed: false,
    selectedElementIds: new Set(),
    selectedDrawingId: "",
  };
  const getContext = () => {
    const activePlay = getActiveSetPiece(state);
    const variant = getActiveSetPieceVariant(activePlay);
    return { play: activePlay, variant, phase: getActiveSetPiecePhase(variant) };
  };
  const controller = createSetPieceAssignmentController({
    ui,
    getContext,
    render: () => {},
    commit: (mutator) => {
      mutator(state);
      state = normalizeSetPiecesState(state);
    },
  });

  controller.assignPlayer("slot-a", "player-b");
  expect(state.plays[0].assignments).toEqual([
    { slotId: "slot-a", role: "Near post", profileId: "player-b" },
    { slotId: "slot-b", role: "Screen", profileId: "player-a" },
  ]);

  controller.setScope("variant");
  controller.assignPlayer("slot-a", "player-c");
  const activePlay = state.plays[0];
  expect(getSetPieceAssignment(activePlay, activePlay.variants[0], "slot-a")).toMatchObject({ profileId: "player-c", isVariantOverride: true });
  expect(getSetPieceAssignment(activePlay, activePlay.variants[1], "slot-a")).toMatchObject({ profileId: "player-b", isVariantOverride: false });

  controller.updateRole("slot-a", "First contact");
  expect(state.plays[0].assignments[0].role).toBe("First contact");
  expect(state.plays[0].variants.flatMap((variant) => variant.phases).every((item) => (
    item.elements.find((element) => element.id === "slot-a")?.role === "First contact"
  ))).toBe(true);
});

test("squad picker removes a player from every phase of only the active variant", () => {
  const play = createSetPiecePlay({ title: "Variant player toggle" });
  const sourceVariant = play.variants[0];
  sourceVariant.phases[0].elements.push({
    id: "slot-a",
    kind: "home-player",
    x: 72,
    y: 18,
    profileId: "player-a",
    label: "AA",
    role: "Near post",
  });
  sourceVariant.phases.push(duplicateSetPiecePhase(sourceVariant.phases[0], 1));
  play.variants.push(duplicateSetPieceVariant(sourceVariant, "Variant 2"));
  let state = normalizeSetPiecesState({ activePlayId: play.id, plays: [play] });
  state.plays[0].variants[0].assignmentOverrides = [{ slotId: "slot-a", profileId: "player-a" }];
  const ui = {
    assignmentPickerSlotId: "slot-a",
    inspectorCollapsed: true,
    layers: new Set(["home", "opponent", "ball", "drawings", "labels"]),
    playbackSpeed: 1,
    selectedElementIds: new Set(["slot-a"]),
    showAssignments: false,
  };
  const pickerMarkup = renderSetPiecesWorkspace({
    state,
    roster: [{ id: "player-a", name: "Alex Example", position: "Forward", player: { id: "player-a", name: "Alex Example" } }],
    ui,
  });
  expect(pickerMarkup).toContain('data-set-piece-roster-toggle="player-a"');
  expect(pickerMarkup).toContain('role="menuitemcheckbox" aria-checked="true" aria-label="Remove Alex Example"');
  expect(pickerMarkup).toContain("On board");
  const getContext = () => {
    const activePlay = getActiveSetPiece(state);
    const variant = getActiveSetPieceVariant(activePlay);
    return { play: activePlay, variant, phase: getActiveSetPiecePhase(variant) };
  };
  const controller = createSetPiecesBoardInteractionController({
    ui,
    getContext,
    canDelete: () => true,
    canEdit: () => true,
    commit: (mutator) => {
      mutator(state);
      state = normalizeSetPiecesState(state);
    },
  });

  controller.toggleRosterPlayer("player-a");

  const [activeVariant, untouchedVariant] = state.plays[0].variants;
  expect(activeVariant.phases.every((phase) => phase.elements.every((element) => element.id !== "slot-a"))).toBe(true);
  expect(activeVariant.assignmentOverrides).toEqual([]);
  expect(untouchedVariant.phases.every((phase) => phase.elements.some((element) => element.id === "slot-a"))).toBe(true);
  expect(state.plays[0].assignments).toContainEqual(expect.objectContaining({ slotId: "slot-a", profileId: "player-a" }));
  expect(ui.selectedElementIds.size).toBe(0);
  expect(ui.assignmentPickerSlotId).toBe("");
});

test("resolved phases display current player identity without changing saved geometry", () => {
  const play = createSetPiecePlay();
  const phase = play.variants[0].phases[0];
  phase.elements.push({ id: "slot-a", kind: "home-player", x: 72, y: 18, profileId: "player-a", label: "OLD", role: "Taker" });
  const state = normalizeSetPiecesState({ activePlayId: play.id, plays: [play] });
  const normalizedPlay = state.plays[0];
  const variant = normalizedPlay.variants[0];
  const resolved = resolveSetPiecePhaseAssignments(variant.phases[0], normalizedPlay, variant, [
    { id: "player-a", player: { id: "player-a", name: "Alex Morgan", photoUrl: "https://images.example/alex.png" } },
  ]);

  expect(resolved.elements[0]).toMatchObject({
    x: 72,
    y: 18,
    profileId: "player-a",
    playerName: "Alex Morgan",
    photoUrl: "https://images.example/alex.png",
    label: "AM",
    role: "Taker",
  });
  expect(variant.phases[0].elements[0].label).toBe("OLD");
  expect(variant.phases[0].elements[0].photoUrl).toBeUndefined();
});

test("player photos only accept image-safe URL schemes", () => {
  expect(getSetPiecePlayerPhotoUrl({ photoUrl: "https://images.example/player.webp" })).toBe("https://images.example/player.webp");
  expect(getSetPiecePlayerPhotoUrl({ photoUrl: "/uploads/player.png" })).toBe("/uploads/player.png");
  expect(getSetPiecePlayerPhotoUrl({ photoUrl: "data:image/png;base64,AAAA" })).toBe("data:image/png;base64,AAAA");
  expect(getSetPiecePlayerPhotoUrl({ photoUrl: "javascript:alert(1)" })).toBe("");
  expect(getSetPiecePlayerPhotoUrl({ photoUrl: "data:image/svg+xml,<svg onload=alert(1)>" })).toBe("");
});

test("normalization clamps unsafe geometry and timing values", () => {
  const play = createSetPiecePlay();
  const phase = play.variants[0].phases[0];
  phase.durationMs = 99999;
  phase.elements.push({
    id: "opponent-a",
    kind: "opponent",
    x: 999,
    y: -20,
    label: "4",
    durationMs: -5,
  });
  const state = normalizeSetPiecesState({ activePlayId: play.id, plays: [play] });
  const normalizedPhase = state.plays[0].variants[0].phases[0];

  expect(normalizedPhase.durationMs).toBe(10000);
  expect(normalizedPhase.elements[0]).toMatchObject({ x: 105, y: 0, durationMs: 100 });
});

test("legacy playback timing migrates to a continuous rhythm without overriding current choices", () => {
  const legacyPlay = createSetPiecePlay();
  legacyPlay.variants[0].phases[0].holdMs = 450;
  legacyPlay.variants[0].phases[0].durationMs = 1800;
  legacyPlay.variants[0].phases[0].elements.push({
    id: "legacy-runner",
    kind: "home-player",
    x: 10,
    y: 10,
    durationMs: 900,
  });
  const currentPlay = structuredClone(legacyPlay);

  const migrated = normalizeSetPiecesState({ schemaVersion: 2, plays: [legacyPlay] });
  const current = normalizeSetPiecesState({ schemaVersion: 4, plays: [currentPlay] });

  expect(migrated.plays[0].variants[0].phases[0].holdMs).toBe(0);
  expect(migrated.plays[0].variants[0].phases[0].elements[0].durationMs).toBe(1800);
  expect(current.plays[0].variants[0].phases[0].holdMs).toBe(450);
  expect(current.plays[0].variants[0].phases[0].elements[0].durationMs).toBe(900);
});

test("playback easing keeps exact endpoints while softening runs and passes", () => {
  const runner = { id: "runner", kind: "home-player", x: 10, y: 10, rotation: 350 };
  const target = { ...runner, x: 30, y: 10, rotation: 10 };
  const ball = { id: "ball", kind: "ball", x: 10, y: 10, rotation: 0 };
  const passPhase = {
    drawings: [{ id: "pass", type: "pass", startX: 10, startY: 10, endX: 30, endY: 10 }],
  };
  const runQuarter = interpolateSetPiecePlaybackElement(runner, target, 0.25, { drawings: [] });
  const passQuarter = interpolateSetPiecePlaybackElement(ball, { ...ball, x: 30 }, 0.25, passPhase);
  const rotationMidpoint = interpolateSetPiecePlaybackElement(runner, target, 0.5, { drawings: [] });

  expect(easeSetPiecePlaybackProgress(0)).toBe(0);
  expect(easeSetPiecePlaybackProgress(1)).toBe(1);
  expect(easeSetPiecePlaybackProgress(0.25)).toBeCloseTo(0.19429577, 5);
  expect(easeSetPiecePlaybackProgress(0.75)).toBeCloseTo(0.80570423, 5);
  expect(runQuarter.x).toBeCloseTo(13.8859154, 5);
  expect(passQuarter.x).toBeGreaterThan(15);
  expect(passQuarter.x).toBeLessThan(30);
  expect(rotationMidpoint.rotation).toBeCloseTo(360, 5);
});

test("playback follows linked tactical routes while preserving phase endpoints", () => {
  const fromElement = { id: "runner-a", kind: "home-player", x: 10, y: 10, rotation: 0 };
  const toElement = { ...fromElement, x: 30, y: 10, rotation: 20 };
  const fromPhase = {
    drawings: [{
      id: "route-a",
      type: "run",
      actorId: "runner-a",
      startX: 8,
      startY: 10,
      endX: 32,
      endY: 10,
      curve: 10,
    }],
  };

  expect(interpolateSetPiecePlaybackElement(fromElement, toElement, 0, fromPhase)).toMatchObject({ x: 10, y: 10, routeId: "route-a" });
  expect(interpolateSetPiecePlaybackElement(fromElement, toElement, 0.5, fromPhase)).toMatchObject({ x: 20, y: 15, rotation: 10, routeId: "route-a" });
  expect(interpolateSetPiecePlaybackElement(fromElement, toElement, 1, fromPhase)).toMatchObject({ x: 30, y: 10, routeId: "route-a" });
});

test("playback timing and ball routes respect delay, duration and action semantics", () => {
  const pass = { id: "pass-a", type: "pass", actorId: "player-a", startX: 10, startY: 10, endX: 30, endY: 20, curve: 0 };
  const phase = { drawings: [pass] };
  const ball = { id: "ball-a", kind: "ball", x: 10, y: 10, rotation: 0 };
  const player = { id: "player-a", kind: "home-player", x: 10, y: 10, rotation: 0 };

  expect(getSetPieceElementPlaybackProgress({ delayMs: 400, durationMs: 800 }, 0.2, 1600)).toBe(0);
  expect(getSetPieceElementPlaybackProgress({ delayMs: 400, durationMs: 800 }, 0.5, 1600)).toBe(0.5);
  expect(getSetPieceElementPlaybackProgress({ delayMs: 9999, durationMs: 9999 }, 1, 1400)).toBe(1);
  expect(interpolateSetPiecePlaybackElement(ball, { ...ball, x: 30, y: 20 }, 0.5, phase).routeId).toBe("pass-a");
  expect(interpolateSetPiecePlaybackElement(player, { ...player, x: 30, y: 20 }, 0.5, phase).routeId).toBe("");
});

test("changing playback speed preserves the current visual position", () => {
  const frames = [];
  const callbacks = [];
  const phases = [
    { id: "phase-1", elements: [{ id: "runner", kind: "home-player", x: 10, y: 10 }] },
    { id: "phase-2", durationMs: 1000, elements: [{ id: "runner", kind: "home-player", x: 30, y: 10 }] },
  ];
  const controller = createSetPiecesPlaybackController({
    win: {
      requestAnimationFrame: (callback) => { callbacks.push(callback); return callbacks.length; },
      cancelAnimationFrame: () => {},
      setTimeout: () => 0,
      clearTimeout: () => {},
    },
    getContext: () => ({ variant: { phases }, phase: phases[0] }),
    onFrame: (_positions, progress) => frames.push(progress),
  });

  controller.play();
  callbacks.shift()(100);
  callbacks.shift()(500);
  controller.setSpeed(2);
  callbacks.shift()(600);

  expect(frames[1]).toBeCloseTo(0.4, 5);
  expect(frames[2]).toBeCloseTo(0.6, 5);
});

test("drawing routes prefer the selected compatible actor and remain editable", () => {
  const phase = {
    elements: [
      { id: "runner-near", kind: "home-player", x: 10, y: 10, label: "AN" },
      { id: "runner-selected", kind: "home-player", x: 40, y: 40, label: "BS" },
      { id: "ball", kind: "ball", x: 12, y: 10 },
    ],
  };
  expect(chooseSetPieceDrawingActor(phase, "run", { x: 10, y: 10 }, new Set(["runner-selected"])).id).toBe("runner-selected");
  expect(getSetPieceDrawingActors(phase, "pass").map((actor) => actor.id)).toEqual(["ball"]);
});

test("drag coordinates stay inside the visible pitch view", () => {
  expect(normalizeSetPiecePointForPitchView({ x: 4, y: 80 }, "attacking-half")).toEqual({ x: 52.5, y: 68 });
  expect(normalizeSetPiecePointForPitchView({ x: 90, y: -4 }, "defensive-half")).toEqual({ x: 52.5, y: 0 });
  expect(normalizeSetPiecePointForPitchView({ x: 90, y: 30 }, "full")).toEqual({ x: 90, y: 30 });
});

test("half-pitch views use landscape coordinates and map pointer input back to source geometry", () => {
  expect(getSetPiecePitchViewBox("attacking-half")).toBe("0 0 68 52.5");
  expect(getSetPiecePitchTransform("attacking-half")).toBe("matrix(0 -1 1 0 0 105)");
  expect(getSetPiecePitchTransform("defensive-half")).toBe("matrix(0 -1 1 0 0 52.5)");
  expect(getSetPieceSourcePoint({ x: 18, y: 25 }, "attacking-half")).toEqual({ x: 80, y: 18 });
  expect(getSetPieceSourcePoint({ x: 18, y: 25 }, "defensive-half")).toEqual({ x: 27.5, y: 18 });
});

test("wide editor projection fills broad canvases while preserving narrow pitch geometry", () => {
  const broad = getSetPiecesWideEditorProjection(
    { width: 1036, height: 562 },
    { width: 68, height: 52.5 }
  );
  expect(broad.active).toBe(true);
  expect(broad.counterScale).toBeCloseTo(.702, 2);

  const narrow = getSetPiecesWideEditorProjection(
    { width: 620, height: 562 },
    { width: 68, height: 52.5 }
  );
  expect(narrow).toEqual({ active: false, counterScale: 1 });
});

test("quick player placement finds a visible open position without stacking markers", () => {
  expect(getNextSetPiecePlayerPlacement([], "attacking-half")).toEqual({ x: 62, y: 10 });
  expect(getNextSetPiecePlayerPlacement([{ x: 62, y: 10 }], "attacking-half")).toEqual({ x: 62, y: 18 });
  expect(getNextSetPiecePlayerPlacement([], "defensive-half")).toEqual({ x: 43, y: 10 });
});

test("own-player labels stay unique while opponent identity remains numeric", () => {
  const players = [
    { id: "one", name: "Alex Morgan" },
    { id: "two", name: "Ada Miller" },
    { id: "three", name: "Sam Kerr" },
  ];
  const labels = createSetPiecePlayerLabelMap(players);
  const values = [...labels.values()];

  expect(new Set(values).size).toBe(3);
  expect(values.filter((label) => label === "AM")).toHaveLength(0);
  expect(labels.get("three")).toBe("SK");
  const roster = getSetPieceRosterPlayers({
    players: [
      ...players,
      { id: "archived", name: "Old Player", archivedAt: "2026-01-01" },
      { id: "guest", name: "Training Guest", rosterType: "guest", countsInSquad: false },
      { id: "academy", name: "Academy Call-up", rosterType: "academy" },
      { id: "trial", name: "Trial Player", counts_in_squad: false },
      { id: "temporary", name: "Temporary Player", temporaryGroup: "Training" },
    ],
  });
  expect(roster.map((player) => player.id)).toEqual(["two", "one", "three"]);
});

test("board renderer distinguishes own initials, opponent numbers and movement semantics", () => {
  const markup = renderSetPieceBoard({
    phase: {
      elements: [
        { id: "home-a", kind: "home-player", x: 70, y: 18, label: "AE", playerName: "Alex Example", photoUrl: "https://images.example/alex.png", rotation: 0 },
        { id: "opponent-a", kind: "opponent", x: 76, y: 20, label: "4", rotation: 0 },
      ],
      drawings: [{ id: "run-a", type: "run", startX: 70, startY: 18, endX: 88, endY: 28, curve: 8 }],
    },
    pitchView: "attacking-half",
    layers: new Set(["home", "opponent", "ball", "drawings", "labels"]),
    selectedElementIds: new Set(),
  });

  expect(markup).toContain("is-home-player");
  expect(markup).toContain('class="spr-home-avatar-photo"');
  expect(markup).toContain('href="https://images.example/alex.png"');
  expect(markup).toContain('class="spr-home-initials"');
  expect(markup).toContain(">AE</text>");
  expect(markup).toContain("is-opponent");
  expect(markup).toContain(">4</text>");
  expect(markup).toContain("is-run");
  expect(markup).toContain("Q ");
  expect(markup).toContain('viewBox="0 0 68 52.5"');
  expect(markup).toContain('transform="matrix(0 -1 1 0 0 105)"');
  expect(markup).not.toContain("spr-body-direction");
});

test("editable board markers expose keyboard interaction without affecting presentation boards", () => {
  const phase = { elements: [{ id: "home-a", kind: "home-player", x: 70, y: 18, label: "AE" }], drawings: [] };
  const editable = renderSetPieceBoard({ phase, interactive: true, layers: new Set(["home"]) });
  const presenting = renderSetPieceBoard({ phase, interactive: false, layers: new Set(["home"]) });
  expect(editable).toContain('tabindex="0"');
  expect(editable).toContain('aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Delete"');
  expect(presenting).not.toContain('tabindex="0"');
});

test("presentation workspace exposes an immersive tactical stage with coaching context", () => {
  const play = createSetPiecePlay({
    title: "Near-post release",
    restart: "corner",
    moment: "attack",
    objective: "Free the back-post runner",
  });
  const variant = play.variants[0];
  const phase = variant.phases[0];
  phase.title = "Screen and release";
  phase.cue = "Wait for the blocker to engage";
  phase.elements.push({ id: "runner", kind: "home-player", x: 80, y: 16, instruction: "Attack the back post" });

  const markup = renderSetPiecesPresentationWorkspace({
    play,
    variant,
    phase,
    ui: {
      canAddToTeamMeeting: true,
      fullscreenAvailable: true,
      layers: new Set(["home", "opponent", "ball", "drawings", "labels"]),
      playbackSpeed: 1,
      playbackProgress: 0,
    },
    teamIdentityMarkup: '<div class="spr-header-identity">North Carolina Courage</div>',
  });

  expect(markup).toContain('class="spr-present-workspace"');
  expect(markup).toContain("Phase 01 / 01");
  expect(markup).toContain("Wait for the blocker to engage");
  expect(markup).toContain("Attack the back post");
  expect(markup).toContain('data-set-piece-action="toggle-fullscreen"');
  expect(markup).toContain('aria-label="Add to Team Meeting"');
  expect(markup).toContain('data-set-piece-present-variant');
  expect(markup).toContain("is-present-playback");
  expect(markup).toContain("spr-present-phase-card is-active");
  expect(markup).toContain('<details class="spr-present-cues" role="complementary" aria-label="Phase coaching notes" open>');
  expect(markup).toContain('class="spr-present-cues-summary"');

  const fullscreenMarkup = renderSetPiecesPresentationWorkspace({
    play,
    variant,
    phase,
    ui: {
      fullscreenAvailable: true,
      nativeFullscreen: true,
      layers: new Set(["home", "opponent", "ball", "drawings", "labels"]),
      playbackSpeed: 1,
      playbackProgress: 0,
    },
  });
  expect(fullscreenMarkup).toContain('<details class="spr-present-cues" role="complementary" aria-label="Phase coaching notes" >');
  expect(fullscreenMarkup).not.toContain('aria-label="Phase coaching notes" open>');
});

test("board instances own unique marker, pattern, and avatar clip ids", () => {
  const phase = {
    elements: [],
    drawings: [{ id: "run-a", type: "run", startX: 70, startY: 18, endX: 88, endY: 28 }],
  };
  const first = renderSetPieceBoard({ phase, markerPrefix: "workspace-board", layers: new Set(["drawings"]) });
  const second = renderSetPieceBoard({ phase, markerPrefix: "meeting-board", layers: new Set(["drawings"]) });

  expect(first).toContain('id="workspace-board-arrow-run"');
  expect(first).toContain('marker-end="url(#workspace-board-arrow-run)"');
  expect(first).toContain('fill="url(#workspace-board-pitch-pattern)"');
  expect(first).toContain('id="workspace-board-home-avatar-clip"');
  expect(second).toContain('id="meeting-board-arrow-run"');
  expect(second).toContain('id="meeting-board-home-avatar-clip"');
  expect(second).not.toContain("workspace-board-arrow-run");
  expect(second).not.toContain("workspace-board-home-avatar-clip");
});

test("presentation adapter links a variant while resolving current squad assignments", () => {
  const play = createSetPiecePlay({ title: "Near-post screen", restart: "corner", pitchView: "attacking-half" });
  const variant = play.variants[0];
  variant.title = "Keeper screen";
  variant.phases[0].elements.push({
    id: "slot-a",
    kind: "home-player",
    x: 82,
    y: 16,
    profileId: "player-a",
    label: "OLD",
    role: "Near post",
  });
  const state = normalizeSetPiecesState({ activePlayId: play.id, plays: [play] });
  const catalog = getSetPiecePresentationCatalog(state);
  const resolved = resolveSetPiecePresentationVariant(state, {
    players: [{ id: "player-a", name: "Alex Morgan", position: "Forward" }],
  }, {
    playId: play.id,
    variantId: variant.id,
  });

  expect(catalog[0]).toMatchObject({ id: play.id, title: "Near-post screen", subPhases: ["first-action"] });
  expect(catalog[0].variants[0]).toMatchObject({ id: variant.id, title: "Keeper screen", phaseCount: 1 });
  expect(resolved).toMatchObject({ playId: play.id, variantId: variant.id, pitchView: "attacking-half", subPhases: ["first-action"] });
  expect(resolved.phases[0].elements[0]).toMatchObject({ x: 82, y: 16, label: "AM", role: "Near post" });
  expect(state.plays[0].variants[0].phases[0].elements[0].label).toBe("OLD");
});

test("opponent numbers are normalized, persisted and optional on the board", () => {
  const play = createSetPiecePlay();
  play.variants[0].phases[0].elements.push({
    id: "opponent-hidden",
    kind: "opponent",
    x: 76,
    y: 20,
    label: "114",
    showNumber: false,
  });
  const state = normalizeSetPiecesState({ activePlayId: play.id, plays: [play] });
  const opponent = state.plays[0].variants[0].phases[0].elements[0];
  const markup = renderSetPieceBoard({
    phase: state.plays[0].variants[0].phases[0],
    layers: new Set(["home", "opponent", "ball", "drawings", "labels"]),
  });

  expect(opponent).toMatchObject({ label: "99", showNumber: false });
  expect(markup).toContain("is-opponent");
  expect(markup).not.toContain(">99</text>");
});

test("persistence round-trips normalized state and reports write failures", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  const persistence = createSetPiecesPersistence({ storage });
  const play = createSetPiecePlay({ title: "Training corner", subPhases: ["first-contact", "second-ball"] });
  expect(persistence.write({ activePlayId: play.id, plays: [play] }).ok).toBe(true);
  expect(persistence.read().plays[0].title).toBe("Training corner");
  expect(persistence.read().plays[0].subPhases).toEqual(["first-contact", "second-ball"]);

  const failing = createSetPiecesPersistence({ storage: { getItem: () => null, setItem: () => { throw new Error("quota"); } } });
  expect(failing.write({ plays: [] })).toMatchObject({ ok: false, error: "quota" });
});

test("platform, permission and data-safety contracts own Set Pieces Room", () => {
  const workspace = defaultHubState.workspaces.find((item) => item.id === "set-pieces-room");
  const module = platformModules.find((item) => item.id === "set-pieces-room");
  const permission = platformPermissionMatrixByModule["set-pieces-room"];
  const contract = dataSafetyRegistry.getByKey("football-set-pieces-room-v1");

  expect(workspace).toMatchObject({ kind: "set-pieces-room", title: "Set Pieces Room", status: "Active" });
  expect(module?.storageKeys).toContain("football-set-pieces-room-v1");
  expect(permission?.permissions.write).toContain("coach");
  expect(contract).toMatchObject({ moduleId: "set-pieces-room", scope: { teamScoped: true } });
  expect(protectedStorageKeys).toContain("football-set-pieces-room-v1");
});

test("module implementation remains isolated from Session Planner tactical state", () => {
  const source = readFileSync(new URL("../src/modules/set-pieces-room/controller.mjs", import.meta.url), "utf8");
  expect(source).not.toContain("sessionPlanner");
  expect(source).not.toContain("football-session-planner-v3");
});
