import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { createSessionPlannerTacticalHelpers } from "../src/modules/session-planner/session-planner-tactical-helpers.mjs";
import { compactTacticalBlock, compactTacticalElement, getTacticalStorageBytes, sessionStateForStorage }
  from "../src/modules/session-planner/session-tactical-storage.mjs";
import { createSessionPlannerTacticalFramesController, tacticalFrameCreationBudgetBytes }
  from "../src/modules/session-planner/session-planner-tactical-frames-controller.mjs";
import { createSessionDateChanges, applySessionDateChange } from "../src/modules/session-planner/session-save-protocol.mjs";
import { denseTacticalBlock } from "./fixtures/session-tactical-capacity.mjs";
import { createSessionPlannerRuntimeStateService } from "../src/modules/session-planner/session-planner-runtime-state-service.mjs";

const helpers = createSessionPlannerTacticalHelpers();
const bytes = (value) => Buffer.byteLength(JSON.stringify(value));
const date = "2026-09-11";
const stateWith = (block, day = date) => ({ selectedDate: day, sessions: { [day]: { id: `session-${day}`, date: day, blocks: [block] } } });
const hydrateBlock = (block) => ({ ...block, tacticalFrames: helpers.normalizeTacticalFrames(block.tacticalFrames),
  tacticalElements: (block.tacticalElements || []).map(helpers.cloneTacticalElement) });
const hydrate = (state) => ({ ...state, sessions: Object.fromEntries(Object.entries(state.sessions).map(([day, session]) =>
  [day, { ...session, blocks: session.blocks.map(hydrateBlock) }])) });
const { extractSessionPlannerDomainRecords, composeSessionPlannerLegacyState } =
  createRequire(import.meta.url)("../api/_lib/session-planner-domain-records.js");
const scope = { organizationId: "11111111-1111-4111-8111-111111111111", teamId: "22222222-2222-4222-8222-222222222222" };

test("compaction is lossless for every tool, styles, zero coordinates, roster identity and paths", () => {
  const types = ["blue-player", "red-player", "neutral-player", "coach", "ball", "cone", "mini-goal", "big-goal",
    "mannequin", "pole", "gate", "dashed-line", "zone", "dashed-zone", "ellipse", "arrow", "pass", "run", "line", "curve", "freehand", "text"];
  for (const type of types) for (const custom of [false, true]) {
    const original = helpers.cloneTacticalElement({ id: `marker-${type}`, type, x: 0, y: 96.12345678901234,
      ...(custom ? { x2: 0, y2: 0, controlX: 0, controlY: 0, color: "#e8ab12", lineWidth: 2.37,
        lineStyle: "solid", size: 1.3, rotation: 90, playerNumber: "LCB", label: "Custom text",
        playerIdentity: { squadPlayerId: "squad-one", name: "QA Player", initials: "QP", number: "12", photoUrl: "https://example.test/player.jpg" },
        playerDisplay: "photo", points: [{ x: 0, y: 0 }, { x: 50.12345678901234, y: 85 }] } : {}) });
    const before = structuredClone(original);
    const compact = compactTacticalElement(original);
    expect(helpers.cloneTacticalElement(compact)).toEqual(original);
    expect(original).toEqual(before);
    expect(compact.x).toBe(0);
    if (custom) expect(compact.x2).toBe(0);
    expect(bytes(compact)).toBeLessThanOrEqual(bytes(original));
  }
  expect(compactTacticalElement({ type: "ball", futureField: { value: "keep" } }).futureField).toEqual({ value: "keep" });
});

test("a dense 12-frame exercise can reach 24 and round-trip without moving or removing objects", () => {
  const source = denseTacticalBlock();
  let writes = 0;
  const warnings = [];
  const initial = structuredClone(source.tacticalFrames);
  const oldThirteen = denseTacticalBlock(13);
  expect(bytes(source)).toBeLessThan(tacticalFrameCreationBudgetBytes);
  expect(bytes(oldThirteen)).toBeGreaterThan(tacticalFrameCreationBudgetBytes);
  const controller = createSessionPlannerTacticalFramesController({ getBlock: () => source, getKey: () => `${date}:${source.id}`,
    canEdit: () => true, cloneElement: helpers.cloneTacticalElement, cloneFrame: helpers.cloneTacticalFrame,
    normalizeFrames: helpers.normalizeTacticalFrames, markFields() {}, writeState: () => { writes++; },
    clearInteraction() {}, render() {}, showToast: (message) => warnings.push(message), maxFrames: 24 });
  while (source.tacticalFrames.length < 24) expect(controller.next()).toBe(true);
  expect(writes).toBe(12);
  expect(warnings).toEqual([]);
  expect(source.tacticalFrames.slice(0, 12)).toEqual(initial);
  const stored = compactTacticalBlock(source);
  expect(getTacticalStorageBytes(source)).toBeLessThan(tacticalFrameCreationBudgetBytes);
  const records = extractSessionPlannerDomainRecords(stateWith(stored), scope);
  const restored = composeSessionPlannerLegacyState(records, scope).sessions[date].blocks[0];
  expect(hydrateBlock(restored)).toEqual(source);
  expect(controller.next()).toBe(false);
  expect(source.tacticalFrames).toHaveLength(24);
});

test("only changed boards are compacted; unrelated dates and text-only edits retain their representation", () => {
  const before = stateWith(denseTacticalBlock());
  before.sessions["2026-09-10"] = stateWith(denseTacticalBlock(), "2026-09-10").sessions["2026-09-10"];
  const textEdit = hydrate(before);
  textEdit.sessions[date].blocks[0].organization = "Colleague's new coaching text";
  const textStored = sessionStateForStorage(textEdit, before);
  expect(textStored.sessions[date].blocks[0].tacticalFrames).toEqual(before.sessions[date].blocks[0].tacticalFrames);
  const boardEdit = hydrate(before);
  boardEdit.sessions[date].blocks[0].tacticalFrames[0].elements[0].x = 42;
  const boardStored = sessionStateForStorage(boardEdit, before);
  expect(boardStored.sessions["2026-09-10"]).toEqual(before.sessions["2026-09-10"]);
  const changes = createSessionDateChanges(before, boardStored, () => "board-change");
  expect(changes).toHaveLength(1);
  const merged = applySessionDateChange(textStored, changes[0]);
  expect(merged.ok).toBe(true);
  expect(merged.state.sessions[date].blocks[0].organization).toBe("Colleague's new coaching text");
  expect(merged.state.sessions[date].blocks[0].tacticalFrames[0].elements[0].x).toBe(42);
  expect(sessionStateForStorage(hydrate(boardStored), boardStored)).toEqual(boardStored);
  expect(createSessionDateChanges(boardStored, sessionStateForStorage(hydrate(boardStored), boardStored))).toEqual([]);
});

test("existing longer sequences, photos, coaching text and explicit style overrides survive storage", () => {
  const source = denseTacticalBlock(30);
  source.visualImage = "data:image/png;base64,EXISTING_IMAGE";
  source.principles = "Retain every word";
  source.tacticalFrames[0].elements[0].color = "#ffffff";
  const before = structuredClone(source);
  const stored = sessionStateForStorage(stateWith(source));
  expect(hydrateBlock(stored.sessions[date].blocks[0])).toEqual(before);
  expect(source).toEqual(before);
});

test("reading compact storage and saving unchanged hydrated state never expands or queues it", () => {
  let stored = JSON.stringify(stateWith(compactTacticalBlock(denseTacticalBlock(24))));
  const before = stored;
  let current;
  let writes = 0;
  let cacheWrites = 0;
  const service = createSessionPlannerRuntimeStateService({
    cloneState: hydrate, getSessionPlannerState: () => current, setSessionPlannerState: (state) => { current = state; },
    rawDataSafetySetItem: (_key, value) => { cacheWrites++; stored = value; },
    win: { localStorage: { getItem: () => stored, setItem: (_key, value) => { writes++; stored = value; } } },
  });
  current = service.readState();
  expect(current.sessions[date].blocks[0]).toEqual(denseTacticalBlock(24));
  expect(service.writeState()).toBe(true);
  expect(stored).toBe(before);
  expect(writes).toBe(0);
  expect(cacheWrites).toBe(0);
});

test("frame size checks use current coaching text, not a stale editor snapshot", () => {
  const source = denseTacticalBlock();
  let writes = 0;
  const warnings = [];
  const controller = createSessionPlannerTacticalFramesController({ getBlock: () => source, getKey: () => "block",
    canEdit: () => true, cloneElement: helpers.cloneTacticalElement, cloneFrame: helpers.cloneTacticalFrame,
    normalizeFrames: helpers.normalizeTacticalFrames, markFields() {}, writeState: () => { writes++; },
    clearInteraction() {}, render() {}, showToast: (message) => warnings.push(message) });
  controller.getEditorBlock();
  source.organization = "x".repeat(tacticalFrameCreationBudgetBytes);
  const before = structuredClone(source);
  expect(controller.next()).toBe(false);
  expect(source).toEqual(before);
  expect(writes).toBe(0);
  expect(warnings[0]).toContain("too large");
});
