import { expect, test } from "@playwright/test";
import { createDashboardChatThreadRuntime } from "../src/modules/chat/dashboard-chat-thread-runtime.mjs";

const seenKey = "football-dashboard-notification-seen-v1";
const first = "2026-10-20T10:00:00.000Z";
const second = "2026-10-20T11:00:00.000Z";
function fixture() {
  let user = { id: "coach" }, tasks = [], seen = { colleague: first };
  const writes = [];
  const runtime = createDashboardChatThreadRuntime({
    getCurrentPlatformUser: () => user,
    readDashboardTasks: () => tasks,
    readDashboardJson: () => structuredClone(seen),
    writeDashboardJson: (key, value) => { writes.push({ key, value }); seen = structuredClone(value); },
  });
  return { runtime, writes, setUser: value => { user = value; }, setTasks: value => { tasks = value; },
    setSeen: value => { seen = value; }, getSeen: () => seen };
}
const task = (createdAt = first, overrides = {}) => ({
  id: createdAt, status: "open", scope: "team", assignedTo: "coach", createdBy: "colleague", createdAt, ...overrides,
});

test("Home renders without new notifications never create save intent", () => {
  const f = fixture();
  for (let index = 0; index < 10; index++) f.runtime.markDashboardHomeSeenForCurrentUser();
  expect(f.writes).toEqual([]);
  expect(f.getSeen()).toEqual({ colleague: first });
});

test("Home acknowledges only observed notifications and remains idempotent across reload", () => {
  const f = fixture(); f.setTasks([task()]);
  expect(f.runtime.hasDashboardHomeNotifications()).toBe(true);
  f.runtime.markDashboardHomeSeenForCurrentUser();
  expect(f.writes).toEqual([{ key: seenKey, value: { colleague: first, coach: first } }]);
  expect(f.runtime.hasDashboardHomeNotifications()).toBe(false);
  for (let index = 0; index < 10; index++) f.runtime.markDashboardHomeSeenForCurrentUser();
  const reloaded = fixture(); reloaded.setSeen(f.getSeen()); reloaded.setTasks([task()]);
  reloaded.runtime.markDashboardHomeSeenForCurrentUser();
  expect(reloaded.writes).toEqual([]); expect(f.writes).toHaveLength(1);
  // A later-arriving task older than the browser clock must remain unread.
  f.setTasks([task(), task(second)]);
  expect(f.runtime.hasDashboardHomeNotifications()).toBe(true);
  f.runtime.markDashboardHomeSeenForCurrentUser();
  expect(f.getSeen()).toEqual({ colleague: first, coach: second });
  expect(f.writes).toHaveLength(2);
});

test("Home excludes tasks outside its notification contract and signed-out users", () => {
  const f = fixture(); f.setTasks([
    task(first, { status: "done" }), task(first, { scope: "personal" }),
    task(first, { assignedTo: "other" }), task(first, { createdBy: "coach" }), task("invalid"),
  ]);
  expect(f.runtime.hasDashboardHomeNotifications()).toBe(false);
  f.runtime.markDashboardHomeSeenForCurrentUser(); expect(f.writes).toEqual([]);
  f.setTasks([task()]); f.setUser(null);
  f.runtime.markDashboardHomeSeenForCurrentUser(); expect(f.writes).toEqual([]);
});

test("Home does not regress another device's newer seen cursor", () => {
  const f = fixture(); f.setSeen({ coach: second, colleague: first }); f.setTasks([task()]);
  f.runtime.markDashboardHomeSeenForCurrentUser(); expect(f.writes).toEqual([]);
  expect(f.getSeen()).toEqual({ coach: second, colleague: first });
});

test("Home can retry a failed local acknowledgement without an in-memory suppression latch", () => {
  let seen = {}, fail = true; const writes = [];
  const runtime = createDashboardChatThreadRuntime({
    getCurrentPlatformUser: () => ({ id: "coach" }), readDashboardTasks: () => [task()],
    readDashboardJson: () => seen,
    writeDashboardJson: (key, value) => { if (!fail) { seen = value; writes.push(value); } },
  });
  runtime.markDashboardHomeSeenForCurrentUser();
  expect(runtime.hasDashboardHomeNotifications()).toBe(true);
  fail = false; runtime.markDashboardHomeSeenForCurrentUser();
  expect(writes).toEqual([{ coach: first }]);
  expect(runtime.hasDashboardHomeNotifications()).toBe(false);
});
