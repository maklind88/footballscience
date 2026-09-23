import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { createSessionPlannerTacticalHelpers } from "../src/modules/session-planner/session-planner-tactical-helpers.mjs";
import { createSessionPlannerTacticalFramesController, tacticalFrameCreationBudgetBytes } from "../src/modules/session-planner/session-planner-tactical-frames-controller.mjs";
import { sessionPlannerTacticalMaxFrames } from "../src/modules/session-planner/session-planner-options.mjs";
import { createExerciseLibraryStateAdapter } from "../src/modules/exercise-library/exercise-library-state.mjs";
import { createSessionPlannerBlockHelpers } from "../src/modules/session-planner/session-planner-block-helpers.mjs";
import { getTacticalPlayerDisplay, normalizeTacticalPlayerLabel, updateTacticalPlayerIdentity } from "../src/modules/session-planner/session-planner-tactical-player-identity.mjs";

const { extractSessionPlannerDomainRecords, composeSessionPlannerLegacyState, SESSION_PLANNER_MAX_BLOCK_PAYLOAD_BYTES }
  = createRequire(import.meta.url)("../api/_lib/session-planner-domain-records.js");
const helpers = createSessionPlannerTacticalHelpers({ tacticalMaxFrames: 12 });
const scope = { organizationId: "11111111-1111-4111-8111-111111111111", teamId: "22222222-2222-4222-8222-222222222222" };
function block(count = 2, players = 2) {
  const frames = Array.from({ length: count }, (_, index) => helpers.cloneTacticalFrame({ id: `frame-${index}`,
    elements: Array.from({ length: players }, (_, player) => ({ id: `player-${player}`, type: "blue-player",
      x: 10 + index, y: 30 + player, playerNumber: player ? "RW" : "LCB" })) }));
  return { id: "block", title: "Frame QA", minutes: 15, tacticalPitchMode: "full-wide",
    tacticalFrames: frames, tacticalActiveFrameId: frames.at(-1).id, tacticalElements: structuredClone(frames.at(-1).elements) };
}
function editor(source) {
  const state = { writes: 0, warnings: [], editable: true };
  const controller = createSessionPlannerTacticalFramesController({
    getBlock: () => source, getKey: () => "date:block", canEdit: () => state.editable,
    cloneElement: helpers.cloneTacticalElement, cloneFrame: helpers.cloneTacticalFrame, normalizeFrames: helpers.normalizeTacticalFrames,
    markFields() {}, writeState: () => state.writes++, clearInteraction() {}, render() {},
    showToast: (message) => state.warnings.push(message), maxFrames: sessionPlannerTacticalMaxFrames,
  });
  return { state, controller };
}
function serverRoundTrip(source) {
  const records = extractSessionPlannerDomainRecords({ sessions: { "2026-09-08": {
    id: "session", date: "2026-09-08", blocks: [source] } } }, scope);
  return composeSessionPlannerLegacyState(records, scope).sessions["2026-09-08"].blocks[0];
}

test("24 frames can be created, reloaded and kept independent without writes when browsing", () => {
  const source = block();
  const { controller, state } = editor(source);
  while (source.tacticalFrames.length < 24) expect(controller.next()).toBe(true);
  expect(state.writes).toBe(22);
  const before = structuredClone(source);
  expect(controller.next()).toBe(false);
  controller.reset();
  controller.select(source.tacticalFrames[0].id);
  expect(controller.persist()).toBe(false);
  expect(source).toEqual(before);
  expect(serverRoundTrip(source).tacticalFrames).toEqual(before.tacticalFrames);
  expect(state.writes).toBe(22);
});

test("normalizing and editing existing 60-frame sequences never truncates saved content", () => {
  const source = block(60);
  const { controller, state } = editor(source);
  expect(controller.getFrames()).toHaveLength(60);
  const before = structuredClone(source.tacticalFrames);
  expect(controller.next()).toBe(false);
  controller.select("frame-59");
  controller.getEditorBlock().tacticalElements[0].x = 80;
  expect(controller.persist()).toBe(true);
  expect(source.tacticalFrames.slice(0, 59)).toEqual(before.slice(0, 59));
  expect(serverRoundTrip(source).tacticalFrames).toHaveLength(60);
  const library = createExerciseLibraryStateAdapter({ cloneTacticalElement: helpers.cloneTacticalElement,
    createBlock: createSessionPlannerBlockHelpers({ cloneTacticalElement: helpers.cloneTacticalElement,
      normalizeTacticalFrames: helpers.normalizeTacticalFrames }).createBlock,
    normalizeTacticalFrames: helpers.normalizeTacticalFrames });
  expect(library.cloneExercise(source).tacticalFrames).toEqual(source.tacticalFrames);
  expect(state.writes).toBe(1);
});

test("frame creation refuses oversized payloads before changing saved or displayed frames", () => {
  const source = block(2, 22);
  source.organization = "x".repeat(tacticalFrameCreationBudgetBytes - 1000);
  const { controller, state } = editor(source);
  const before = structuredClone(source);
  expect(tacticalFrameCreationBudgetBytes).toBeLessThan(SESSION_PLANNER_MAX_BLOCK_PAYLOAD_BYTES);
  expect(controller.next()).toBe(false);
  expect(source).toEqual(before);
  expect(controller.getFrames()).toHaveLength(2);
  expect(state.writes).toBe(0);
  expect(state.warnings[0]).toContain("too large");
});

test("24 frames with 22 squad markers fit the existing server contract and round-trip", () => {
  const source = block(24, 22);
  for (let index = 0; index < 22; index++) updateTacticalPlayerIdentity(source, [`player-${index}`], {
    playerIdentity: { squadPlayerId: `squad-${index}`, name: `QA Player ${index}`, initials: "QP", number: String(index),
      photoUrl: "https://images.example.test/player.png" },
  });
  expect(Buffer.byteLength(JSON.stringify(source))).toBeLessThan(tacticalFrameCreationBudgetBytes);
  expect(serverRoundTrip(source).tacticalFrames).toEqual(source.tacticalFrames);
});

test("large roster assignments are refused without losing saved frames or blocking reductions", () => {
  const source = block(24, 22);
  const before = structuredClone(source);
  const { controller, state } = editor(source);
  updateTacticalPlayerIdentity(controller.getEditorBlock(), source.tacticalElements.map((element) => element.id), {
    playerIdentity: { squadPlayerId: "qa", name: "QA Player", initials: "QP", photoUrl: `https://example.test/${"x".repeat(1900)}` },
  });
  expect(controller.persist()).toBe(false);
  expect(source).toEqual(before);
  expect(state.writes).toBe(0);
  expect(controller.getEditorBlock().tacticalElements[0].playerIdentity).toBeUndefined();
  expect(state.warnings[0]).toContain("too large");
  source.organization = "x".repeat(tacticalFrameCreationBudgetBytes);
  controller.getEditorBlock().tacticalElements.pop();
  expect(controller.persist()).toBe(true);
  expect(source.tacticalFrames).toHaveLength(24);
  expect(source.tacticalElements).toHaveLength(21);
});

test("custom numbers and positions retain four characters and never change geometry", () => {
  const source = block(24);
  const geometry = source.tacticalFrames.map((frame) => frame.elements.map(({ id, x, y }) => ({ id, x, y })));
  for (const [value, expected] of [["1", "1"], ["12", "12"], [" cb ", "CB"], ["rw", "RW"], ["CF", "CF"], ["LCB", "LCB"], ["1234", "1234"], ["ABCDEF", "ABCD"]]) {
    expect(normalizeTacticalPlayerLabel(value)).toBe(expected);
    updateTacticalPlayerIdentity(source, ["player-0"], { playerNumber: value, playerDisplay: "number" });
    const restored = serverRoundTrip(source);
    expect(restored.tacticalFrames.every((frame) => getTacticalPlayerDisplay(frame.elements[0]).label === expected)).toBe(true);
    expect(restored.tacticalFrames.map((frame) => frame.elements.map(({ id, x, y }) => ({ id, x, y })))).toEqual(geometry);
    expect(restored.tacticalFrames.every((frame) => frame.elements[1].playerNumber === "RW")).toBe(true);
  }
  updateTacticalPlayerIdentity(source, ["player-0"], { playerNumber: "" });
  expect(source.tacticalFrames.every((frame) => frame.elements[0].playerNumber === null)).toBe(true);
  expect(normalizeTacticalPlayerLabel("<\"&>\u0000")).toBe("");
});
