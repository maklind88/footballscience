import { expect, test } from "@playwright/test";
import { normalizeTacticalPlayerIdentity, normalizeTacticalPlayerPhoto, updateTacticalPlayerIdentity,
  getTacticalPlayerDisplay } from "../src/modules/session-planner/session-planner-tactical-player-identity.mjs";
import { createTacticalRosterController, getTacticalRosterChoices } from "../src/modules/session-planner/session-planner-tactical-roster-controller.mjs";
import { createSessionPlannerTacticalHelpers } from "../src/modules/session-planner/session-planner-tactical-helpers.mjs";
import { createExerciseLibraryStateAdapter } from "../src/modules/exercise-library/exercise-library-state.mjs";
import { createSessionPlannerTacticalFramesController } from "../src/modules/session-planner/session-planner-tactical-frames-controller.mjs";
import { createSessionPlannerVisualRenderer } from "../src/modules/session-planner/session-planner-visual-renderer.mjs";
import { createSessionPlannerBlockHelpers } from "../src/modules/session-planner/session-planner-block-helpers.mjs";

const helpers = createSessionPlannerTacticalHelpers();
const identity = { squadPlayerId: "squad-1", name: "Alice Smith", initials: "AS", number: "9", photoUrl: "https://images.example.test/alice.png" };
const element = () => helpers.cloneTacticalElement({ id: "marker-1", type: "blue-player", x: 20, y: 40 });
function block() {
  const first = element();
  return { id: "block-1", tacticalPitchMode: "full", tacticalActiveFrameId: "first", tacticalElements: [first],
    tacticalFrames: [{ id: "first", elements: [structuredClone(first)] },
      { id: "second", elements: [{ ...element(), x: 60, y: 70 }] }, { id: "empty", elements: [] }] };
}

test("roster markers add bounded identity fields without changing legacy objects or copying private data", () => {
  const old = element();
  expect(old).not.toHaveProperty("playerIdentity");
  const source = { ...old, playerIdentity: { ...identity, medicalNotes: "private", token: "secret" }, playerDisplay: "photo" };
  const cloned = helpers.cloneTacticalElement(source);
  expect(cloned.playerIdentity).toEqual(identity);
  expect(cloned.playerDisplay).toBe("photo");
  expect(cloned.id).toBe(old.id);
  cloned.playerIdentity.name = "Changed";
  expect(source.playerIdentity.name).toBe("Alice Smith");
  expect(helpers.cloneTacticalElement({ ...source, type: "ball" })).not.toHaveProperty("playerIdentity");
  expect(normalizeTacticalPlayerIdentity({ name: "No id" })).toBeNull();
  expect(normalizeTacticalPlayerIdentity({ ...identity, name: "x".repeat(500) }).name).toHaveLength(100);
});

test("photos reject unsafe URLs and inline image payloads", () => {
  for (const url of ["javascript:alert(1)", "data:image/png;base64,AAA", "file:///secret", "//evil.test/img", "http://images.test/a.png", "https://user:pass@images.test/a.png", "https://images.test/" + "x".repeat(2048)]) {
    expect(normalizeTacticalPlayerPhoto(url)).toBe("");
  }
  expect(normalizeTacticalPlayerPhoto(identity.photoUrl)).toBe(identity.photoUrl);
});

test("identity follows only the selected marker through frames without moving or recreating anything", () => {
  const source = block();
  source.tacticalFrames[1].elements.push({ ...element(), id: "other" });
  const positions = source.tacticalFrames.map((frame) => frame.elements.map(({ id, x, y }) => ({ id, x, y })));
  expect(updateTacticalPlayerIdentity(source, ["marker-1"], { playerIdentity: identity })).toBe(true);
  for (const marker of [source.tacticalElements[0], source.tacticalFrames[0].elements[0], source.tacticalFrames[1].elements[0]]) {
    expect(marker.playerIdentity).toEqual(identity);
    expect(marker.playerDisplay).toBe("initials");
  }
  expect(source.tacticalFrames.map((frame) => frame.elements.map(({ id, x, y }) => ({ id, x, y })))).toEqual(positions);
  expect(source.tacticalFrames[1].elements[1]).not.toHaveProperty("playerIdentity");
  expect(updateTacticalPlayerIdentity(source, ["marker-1"], { playerIdentity: identity })).toBe(false);
  updateTacticalPlayerIdentity(source, ["marker-1"], { playerDisplay: "photo" });
  expect(getTacticalPlayerDisplay(source.tacticalFrames[1].elements[0]).photoUrl).toBe(identity.photoUrl);
  updateTacticalPlayerIdentity(source, ["marker-1"], { playerIdentity: null });
  expect(source.tacticalFrames[1].elements[0]).not.toHaveProperty("playerIdentity");
  expect(source.tacticalFrames[1].elements[0].playerNumber).toBe("9");
});

test("display supports number, initials, photo and a readable missing-photo fallback", () => {
  const marker = { ...element(), playerIdentity: identity };
  expect(getTacticalPlayerDisplay(marker).label).toBe("AS");
  expect(getTacticalPlayerDisplay({ ...marker, playerDisplay: "number" }).label).toBe("9");
  expect(getTacticalPlayerDisplay({ ...marker, playerDisplay: "number", playerNumber: "W" }).label).toBe("W");
  expect(getTacticalPlayerDisplay({ ...marker, playerDisplay: "photo", playerIdentity: { ...identity, photoUrl: "" } }))
    .toMatchObject({ label: "AS", photoUrl: "" });
  const html = createSessionPlannerVisualRenderer({}).renderExerciseVisual({ tacticalElements: [{ ...marker, playerDisplay: "photo" }] });
  expect(html).toContain('title="Alice Smith"');
  expect(html).toContain('referrerpolicy="no-referrer"');
  expect(html).toContain('onerror="this.hidden=true"');
  expect(html).toContain('session-tactical-player-badge is-wide');
});

test("Squad read projection resolves duplicate initials, temporary dates and excludes private fields", () => {
  const choices = getTacticalRosterChoices([
    { id: "a", name: "Alice Smith", number: 9, photoUrl: identity.photoUrl, coachNotes: "private" },
    { id: "b", name: "Anna Smith", number: 8 },
    { id: "guest", name: "Guest Player", countsInSquad: false, temporaryFrom: "2026-09-08", temporaryTo: "2026-09-08" },
    { id: "expired", name: "Expired Player", countsInSquad: false, temporaryTo: "2026-09-07" },
    { id: "archived", name: "Archived Player", archivedAt: "2026-01-01" },
  ], "2026-09-08");
  expect(choices.map((player) => player.squadPlayerId)).toEqual(["a", "b", "guest"]);
  expect(choices[0].initials).not.toBe(choices[1].initials);
  expect(choices[0]).not.toHaveProperty("coachNotes");
});

test("library copies and normalized frames keep independent player identities", () => {
  const source = block();
  updateTacticalPlayerIdentity(source, ["marker-1"], { playerIdentity: identity });
  const library = createExerciseLibraryStateAdapter({ cloneTacticalElement: helpers.cloneTacticalElement,
    createBlock: createSessionPlannerBlockHelpers({ cloneTacticalElement: helpers.cloneTacticalElement,
      normalizeTacticalFrames: helpers.normalizeTacticalFrames }).createBlock,
    normalizeTacticalFrames: helpers.normalizeTacticalFrames });
  const copy = library.cloneExercise(source);
  expect(copy.tacticalElements[0].playerIdentity).toEqual(identity);
  expect(copy.tacticalFrames[1].elements[0].playerIdentity).toEqual(identity);
  copy.tacticalElements[0].playerIdentity.name = "Copy only";
  expect(source.tacticalElements[0].playerIdentity.name).toBe(identity.name);
});

test("frame persistence saves identity once, preserves field timestamps and rejects a stale draft", () => {
  const source = block();
  let writes = 0;
  const marked = [];
  const controller = createSessionPlannerTacticalFramesController({
    getBlock: () => source, getKey: () => "date:block", canEdit: () => true,
    cloneElement: helpers.cloneTacticalElement, cloneFrame: helpers.cloneTacticalFrame,
    normalizeFrames: helpers.normalizeTacticalFrames,
    markFields: (_, fields) => marked.push(fields), writeState: () => writes++,
    clearInteraction() {}, render() {}, showToast() {},
  });
  const view = controller.getEditorBlock();
  updateTacticalPlayerIdentity(view, ["marker-1"], { playerIdentity: identity });
  expect(controller.persist(view)).toBe(true);
  expect(controller.persist(view)).toBe(false);
  expect(writes).toBe(1);
  expect(marked[0]).toEqual(["tacticalFrames", "tacticalActiveFrameId", "tacticalElements"]);
  expect(source.tacticalFrames[1].elements[0].playerIdentity).toEqual(identity);
  const restored = JSON.parse(JSON.stringify(source));
  expect(helpers.normalizeTacticalFrames(restored.tacticalFrames)[0].elements[0].playerIdentity).toEqual(identity);
  source.tacticalElements[0].x = 99;
  updateTacticalPlayerIdentity(view, ["marker-1"], { playerDisplay: "photo" });
  expect(controller.persist(view)).toBe(false);
  expect(writes).toBe(1);
  expect(source.tacticalElements[0].x).toBe(99);
});

test("readonly roster controls cannot update any frame or persist", () => {
  const source = block();
  const before = structuredClone(source);
  let writes = 0;
  const events = new Map();
  const root = { querySelector: () => null, addEventListener: (type, handler) => events.set(type, handler) };
  const controller = createTacticalRosterController({
    getWorkspace: () => root, getBlock: () => source, getSelectedIds: () => ["marker-1"],
    getPlayers: () => [{ id: "squad-1", name: "Alice Smith" }], getDate: () => "2026-09-08",
    canEdit: () => false, persist: () => writes++, refreshCanvas() {},
  });
  controller.mount();
  events.get("change")({ target: { value: "squad-1", closest: () => ({}), matches: () => true }, stopPropagation() {} });
  expect(source).toEqual(before);
  expect(writes).toBe(0);
});

test("a 26-player twelve-frame board round-trips through the existing server projection", async () => {
  const { createRequire } = await import("node:module");
  const { extractSessionPlannerDomainRecords, composeSessionPlannerLegacyState, SESSION_PLANNER_MAX_BLOCK_PAYLOAD_BYTES }
    = createRequire(import.meta.url)("../api/_lib/session-planner-domain-records.js");
  const source = block();
  source.tacticalElements = Array.from({ length: 26 }, (_, index) => helpers.cloneTacticalElement({ ...element(),
    id: `marker-${index}`, playerIdentity: { ...identity, squadPlayerId: `player-${index}` }, playerDisplay: "photo" }));
  source.tacticalFrames = Array.from({ length: 12 }, (_, index) => helpers.cloneTacticalFrame({
    id: `frame-${index}`, elements: source.tacticalElements }));
  source.tacticalActiveFrameId = "frame-0";
  expect(Buffer.byteLength(JSON.stringify(source))).toBeLessThan(SESSION_PLANNER_MAX_BLOCK_PAYLOAD_BYTES);
  const scope = { organizationId: "11111111-1111-4111-8111-111111111111", teamId: "22222222-2222-4222-8222-222222222222" };
  const records = extractSessionPlannerDomainRecords({ sessions: { "2026-09-08": {
    id: "session-1", date: "2026-09-08", blocks: [source] } } }, scope);
  const restored = composeSessionPlannerLegacyState(records, scope).sessions["2026-09-08"].blocks[0];
  expect(restored.tacticalFrames).toEqual(source.tacticalFrames);
  expect(restored.tacticalElements).toEqual(source.tacticalElements);
});

test("search keeps a saved-only player visible and clears after deselection without saving", () => {
  const source = block();
  updateTacticalPlayerIdentity(source, ["marker-1"], { playerIdentity: identity });
  let selected = ["marker-1"];
  const events = new Map();
  const select = { innerHTML: "" };
  const panel = { dataset: {}, innerHTML: "", querySelector: () => select };
  const root = { querySelector: () => panel, addEventListener: (type, handler) => events.set(type, handler) };
  let writes = 0;
  const controller = createTacticalRosterController({
    getWorkspace: () => root, getBlock: () => source, getSelectedIds: () => selected,
    getPlayers: () => [], getDate: () => "2026-09-08", canEdit: () => true,
    persist: () => writes++, refreshCanvas() {},
  });
  controller.mount();
  events.get("input")({ target: { value: "Unknown", matches: () => true, closest: () => panel } });
  expect(select.innerHTML).toContain('value="squad-1" selected>Alice Smith (saved)');
  selected = [];
  controller.sync();
  expect(panel.hidden).toBe(true);
  panel.innerHTML = "stale search";
  selected = ["marker-1"];
  controller.sync();
  expect(panel.hidden).toBe(false);
  expect(panel.innerHTML).toContain('value="" data-tactical-roster-search');
  expect(writes).toBe(0);
});
