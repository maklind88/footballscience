import { expect, test } from "@playwright/test";
import { canCompactSessionText } from "../src/modules/session-planner/session-save-text-compaction.mjs";
import { createSessionSaveQueuedPilot } from "../src/modules/session-planner/session-save-queued-pilot.mjs";

const value = (title) => ({ session: { date: "2026-09-16", title, blocks: [{ id: "a", title: "Press", objective: "Win", minutes: 15 }] }, tombstones: {} });
function pair() {
  const row = (id, before, after, time) => ({ status: "pending", attempted: false, scope: "actor:org:team", writer: "tab-a", createdAt: time,
    change: { id, date: "2026-09-16", before: value(before), after: value(after) } });
  return [row("a", "Original", "O", 1), row("b", "O", "Our training", 1001)];
}
test("only consecutive never-attempted edits of one existing text field can compact", () => {
  const [a, b] = pair(); expect(canCompactSessionText(a, b)).toBe(true);
  for (const field of ["title", "objective"]) {
    const [a, b] = pair();
    a.change.before = value("Original"); a.change.after = value("Original"); b.change.after = value("Original");
    a.change.after.session.blocks[0][field] = "A";
    b.change.before = structuredClone(a.change.after); b.change.after.session.blocks[0][field] = "AB";
    expect(canCompactSessionText(a, b)).toBe(true);
  }
});
const negatives = {
  attempted: (a) => { a.attempted = true; },
  review: (a) => { a.status = "review"; },
  writer: (_a, b) => { b.writer = "other-tab"; },
  scope: (_a, b) => { b.scope = "other-team"; },
  date: (_a, b) => { b.change.date = "2026-09-17"; },
  oldClock: (_a, b) => { b.createdAt = 0; },
  expired: (_a, b) => { b.createdAt = 2000002; },
  discontinuous: (_a, b) => { b.change.before = value("Someone else"); },
  creation: (a) => { a.change.before.session = null; },
  numeric: (_a, b) => { b.change.after.session.blocks[0].minutes++; },
  newBlock: (_a, b) => { b.change.after.session.blocks.push({ id: "b" }); },
  deletion: (_a, b) => { b.change.after.session.blocks = []; b.change.after.tombstones.a = "2026-09-16T12:00:00Z"; },
  differentField: (_a, b) => { b.change.after = structuredClone(b.change.before); b.change.after.session.blocks[0].title = "Changed"; },
  structural: (_a, b) => { b.change.after.session.blocks[0].id = "different-id"; },
};
for (const [name, alter] of Object.entries(negatives)) test(`compaction preserves separate ${name} generations`, () => {
  const [a, b] = pair(); alter(a, b); expect(canCompactSessionText(a, b)).toBe(false);
});
test("queue pilot cannot use a legacy store without durable claim protocol", () => {
  expect(() => createSessionSaveQueuedPilot({ store: { putMany() {} } })).toThrow("versioned Sessions queue");
});
