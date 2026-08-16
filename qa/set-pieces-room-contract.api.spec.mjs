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
import { getSetPieceAssignment, resolveSetPiecePhaseAssignments } from "../src/modules/set-pieces-room/assignments.mjs";
import {
  createSetPiecePlayerLabelMap,
  getSetPieceRosterPlayers,
} from "../src/modules/set-pieces-room/player-labels.mjs";
import { createSetPiecesPersistence } from "../src/modules/set-pieces-room/persistence.mjs";
import { cloneSetPiecePlay } from "../src/modules/set-pieces-room/play-helpers.mjs";
import {
  getSetPieceElementPlaybackProgress,
  interpolateSetPiecePlaybackElement,
} from "../src/modules/set-pieces-room/playback-geometry.mjs";
import { renderSetPieceBoard } from "../src/modules/set-pieces-room/board-renderer.mjs";
import { chooseSetPieceDrawingActor, getSetPieceDrawingActors } from "../src/modules/set-pieces-room/drawing-actors.mjs";
import { createSetPiecesPlaybackController } from "../src/modules/set-pieces-room/playback-controller.mjs";
import { renderSetPiecesPresentationWorkspace } from "../src/modules/set-pieces-room/presentation-workspace-renderer.mjs";
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
  expect(play.variants[0].phases).toHaveLength(1);
  expect(play.variants[0].phases[0]).toMatchObject({ title: "Start", elements: [], drawings: [] });
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

  expect(state.schemaVersion).toBe(2);
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

test("resolved phases display assigned player initials without changing geometry", () => {
  const play = createSetPiecePlay();
  const phase = play.variants[0].phases[0];
  phase.elements.push({ id: "slot-a", kind: "home-player", x: 72, y: 18, profileId: "player-a", label: "OLD", role: "Taker" });
  const state = normalizeSetPiecesState({ activePlayId: play.id, plays: [play] });
  const normalizedPlay = state.plays[0];
  const variant = normalizedPlay.variants[0];
  const resolved = resolveSetPiecePhaseAssignments(variant.phases[0], normalizedPlay, variant, [
    { id: "player-a", player: { id: "player-a", name: "Alex Morgan" } },
  ]);

  expect(resolved.elements[0]).toMatchObject({ x: 72, y: 18, profileId: "player-a", label: "AM", role: "Taker" });
  expect(variant.phases[0].elements[0].label).toBe("OLD");
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
  expect(getSetPieceRosterPlayers({ players: [...players, { id: "archived", name: "Old Player", archivedAt: "2026-01-01" }] })).toHaveLength(3);
});

test("board renderer distinguishes own initials, opponent numbers and movement semantics", () => {
  const markup = renderSetPieceBoard({
    phase: {
      elements: [
        { id: "home-a", kind: "home-player", x: 70, y: 18, label: "AE", rotation: 0 },
        { id: "opponent-a", kind: "opponent", x: 76, y: 20, label: "4", rotation: 0 },
      ],
      drawings: [{ id: "run-a", type: "run", startX: 70, startY: 18, endX: 88, endY: 28, curve: 8 }],
    },
    pitchView: "attacking-half",
    layers: new Set(["home", "opponent", "ball", "drawings", "labels"]),
    selectedElementIds: new Set(),
  });

  expect(markup).toContain("is-home-player");
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
});

test("board instances own unique arrow and pitch pattern ids", () => {
  const phase = {
    elements: [],
    drawings: [{ id: "run-a", type: "run", startX: 70, startY: 18, endX: 88, endY: 28 }],
  };
  const first = renderSetPieceBoard({ phase, markerPrefix: "workspace-board", layers: new Set(["drawings"]) });
  const second = renderSetPieceBoard({ phase, markerPrefix: "meeting-board", layers: new Set(["drawings"]) });

  expect(first).toContain('id="workspace-board-arrow-run"');
  expect(first).toContain('marker-end="url(#workspace-board-arrow-run)"');
  expect(first).toContain('fill="url(#workspace-board-pitch-pattern)"');
  expect(second).toContain('id="meeting-board-arrow-run"');
  expect(second).not.toContain("workspace-board-arrow-run");
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

  expect(catalog[0]).toMatchObject({ id: play.id, title: "Near-post screen" });
  expect(catalog[0].variants[0]).toMatchObject({ id: variant.id, title: "Keeper screen", phaseCount: 1 });
  expect(resolved).toMatchObject({ playId: play.id, variantId: variant.id, pitchView: "attacking-half" });
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
  const play = createSetPiecePlay({ title: "Training corner" });
  expect(persistence.write({ activePlayId: play.id, plays: [play] }).ok).toBe(true);
  expect(persistence.read().plays[0].title).toBe("Training corner");

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
