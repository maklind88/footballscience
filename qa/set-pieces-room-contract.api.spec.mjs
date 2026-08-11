import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import {
  createEmptySetPiecesState,
  createSetPiecePhase,
  createSetPiecePlay,
  duplicateSetPiecePhase,
  duplicateSetPieceVariant,
  normalizeSetPiecesState,
} from "../src/modules/set-pieces-room/state.mjs";
import {
  createSetPiecePlayerLabelMap,
  getSetPieceRosterPlayers,
} from "../src/modules/set-pieces-room/player-labels.mjs";
import { createSetPiecesPersistence } from "../src/modules/set-pieces-room/persistence.mjs";
import { cloneSetPiecePlay } from "../src/modules/set-pieces-room/play-helpers.mjs";
import { renderSetPieceBoard } from "../src/modules/set-pieces-room/board-renderer.mjs";
import { normalizeSetPiecePointForPitchView } from "../src/modules/set-pieces-room/geometry.mjs";
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

  const duplicate = cloneSetPiecePlay(play, "coach-a");
  const actorIds = duplicate.variants[0].phases.map((item) => item.elements[0].id);
  expect(new Set(actorIds).size).toBe(1);
  expect(actorIds[0]).not.toBe("runner-a");
  expect(duplicate.variants[0].phases[0].drawings[0].actorId).toBe(actorIds[0]);
  expect(duplicate).toMatchObject({ title: "Front zone copy", updatedBy: "coach-a" });
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

test("drag coordinates stay inside the visible pitch view", () => {
  expect(normalizeSetPiecePointForPitchView({ x: 4, y: 80 }, "attacking-half")).toEqual({ x: 52.5, y: 68 });
  expect(normalizeSetPiecePointForPitchView({ x: 90, y: -4 }, "defensive-half")).toEqual({ x: 52.5, y: 0 });
  expect(normalizeSetPiecePointForPitchView({ x: 90, y: 30 }, "full")).toEqual({ x: 90, y: 30 });
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
