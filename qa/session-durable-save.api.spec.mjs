import { test, expect } from "@playwright/test";
import { createSessionDateChanges, applySessionDateChange, sameSessionValue, describeSessionDifferences, sessionDateValue } from "../src/modules/session-planner/session-save-protocol.mjs";
import { createSessionSaveClient } from "../src/modules/session-planner/session-save-client.mjs";
import { preserveSessionSaveLocalUi } from "../src/modules/session-planner/session-save-local-ui.mjs";

const date = "2026-09-10";
const copy = (value) => JSON.parse(JSON.stringify(value));
const initial = () => ({ selectedDate: date, sessions: {
  [date]: { date, title: "Training", selectedBlockId: "a", blocks: [
    { id: "a", title: "Press", objective: "Close space", minutes: 15 },
    { id: "b", title: "Game", objective: "Play", minutes: 20 },
  ] },
  "2026-09-09": { date: "2026-09-09", title: "Yesterday", blocks: [{ id: "y", title: "Keep", minutes: 10 }] },
} });
let count = 0;
const makeId = () => `edit-${++count}`;
const change = (before, after) => createSessionDateChanges(before, after, makeId)[0];

test("a save receipt preserves local day, block and frame but never local stale content", () => {
  const local = initial(), saved = copy(local);
  local.selectedDate = "2026-09-09";
  local.sessions[date].selectedBlockId = "b";
  for (const state of [local, saved]) state.sessions[date].blocks[1].tacticalFrames = [{ id: "f1" }, { id: "f2" }];
  local.sessions[date].blocks[1].tacticalActiveFrameId = "f2";
  saved.sessions[date].blocks[1].objective = "Colleague's central instruction";
  const result = JSON.parse(preserveSessionSaveLocalUi(JSON.stringify(saved), JSON.stringify(local)));
  expect(result.selectedDate).toBe("2026-09-09");
  expect(result.sessions[date].selectedBlockId).toBe("b");
  expect(result.sessions[date].blocks[1]).toMatchObject({ tacticalActiveFrameId: "f2", objective: "Colleague's central instruction" });
  expect(createSessionDateChanges(saved, result)).toEqual([]);
  saved.sessions[date].blocks[1].tacticalFrames.pop();
  expect(JSON.parse(preserveSessionSaveLocalUi(JSON.stringify(saved), JSON.stringify(local))).sessions[date].blocks[1].tacticalActiveFrameId).toBeUndefined();
});

test("one changed date excludes the calendar and ignores navigation", () => {
  const before = initial(), after = copy(before);
  after.selectedDate = "2026-09-09";
  after.sessions[date].selectedBlockId = "b";
  expect(createSessionDateChanges(before, after)).toEqual([]);
  after.sessions[date].blocks[0].objective = "New instruction";
  const changes = createSessionDateChanges(before, after, makeId);
  expect(changes).toHaveLength(1);
  expect(JSON.stringify(changes)).not.toContain("Yesterday");
  expect(changes[0].date).toBe(date);
});

test("concurrent dates and different fields in the same block merge without loss", () => {
  const before = initial(), local = copy(before), central = copy(before);
  local.sessions[date].blocks[0].objective = "Local objective";
  central.sessions[date].blocks[0].minutes = 25;
  central.sessions["2026-09-09"].blocks[0].title = "Colleague's edit";
  const result = applySessionDateChange(central, change(before, local));
  expect(result.ok).toBe(true);
  expect(result.state.sessions[date].blocks[0]).toMatchObject({ objective: "Local objective", minutes: 25 });
  expect(result.state.sessions["2026-09-09"]).toEqual(central.sessions["2026-09-09"]);
});

test("same-field conflicts preserve central and report the date, block and field", () => {
  const before = initial(), local = copy(before), central = copy(before);
  local.sessions[date].blocks[0].objective = "Local";
  central.sessions[date].blocks[0].objective = "Central";
  const result = applySessionDateChange(central, change(before, local));
  expect(result.ok).toBe(false);
  expect(result.conflicts).toContain(`${date}.session.blocks.a.objective`);
  expect(result.state).toEqual(central);
});

test("replaying a committed change is idempotent", () => {
  const before = initial(), local = copy(before);
  local.sessions[date].blocks[0].title = "Renamed";
  const edit = change(before, local);
  const first = applySessionDateChange(before, edit);
  const second = applySessionDateChange(first.state, edit);
  expect(second.ok).toBe(true);
  expect(second.state).toEqual(first.state);
});

test("concurrent additions survive and deleting a block requires its tombstone", () => {
  const before = initial(), local = copy(before), central = copy(before);
  local.sessions[date].blocks.push({ id: "local", title: "Local" });
  central.sessions[date].blocks.push({ id: "remote", title: "Remote" });
  expect(applySessionDateChange(central, change(before, local)).state.sessions[date].blocks.map((block) => block.id)).toEqual(["a", "b", "remote", "local"]);
  local.sessions[date].blocks = local.sessions[date].blocks.filter((block) => block.id !== "a");
  expect(() => applySessionDateChange(central, change(before, local))).toThrow("tombstone");
  local.blockDeletionTombstones = { [date]: { a: "2026-09-10T12:00:00Z" } };
  expect(applySessionDateChange(central, change(before, local)).state.sessions[date].blocks.map((block) => block.id)).not.toContain("a");
});

test("old edits cannot resurrect a deleted exercise", () => {
  const before = initial(), local = copy(before), central = copy(before);
  local.sessions[date].blocks[0].title = "Offline";
  central.sessions[date].blocks.shift();
  central.blockDeletionTombstones = { [date]: { a: "2026-09-10T12:00:00Z" } };
  const result = applySessionDateChange(central, change(before, local));
  expect(result.ok).toBe(false);
  expect(result.state).toEqual(central);
});

test("all frames and marker data survive; IDs and positions are unchanged", () => {
  const before = initial(), local = copy(before);
  local.sessions[date].blocks[0].tacticalFrames = Array.from({ length: 24 }, (_, index) => ({
    id: `frame-${index}`, elements: [{ id: "player", type: "blue-player", x: index + .5, y: 72.6, playerNumber: ["CB", "RW", "12"][index % 3] }],
  }));
  local.sessions[date].blocks[0].playerBoardPositions = { player: { x: 25, y: 45 } };
  const result = applySessionDateChange(before, change(before, local));
  expect(result.ok).toBe(true);
  expect(result.state.sessions[date].blocks[0]).toEqual(local.sessions[date].blocks[0]);
});

test("malformed dates, duplicate blocks and prototype keys are rejected", () => {
  const before = initial(), after = copy(before);
  after.sessions[date].title = "New";
  const edit = change(before, after);
  expect(() => applySessionDateChange(before, { ...edit, date: "2026-02-30" })).toThrow();
  const duplicate = copy(edit); duplicate.after.session.blocks.push(duplicate.after.session.blocks[0]);
  expect(() => applySessionDateChange(before, duplicate)).toThrow("blocks");
  expect(() => applySessionDateChange(before, JSON.parse(JSON.stringify(edit).replace('"after":{', '"after":{"__proto__":{},')))).toThrow("field");
});

function harness(options = {}) {
  const rows = options.rows || new Map();
  const state = { central: copy(options.central || initial()), revision: 10, scope: "coach:org:team", offline: false, sent: [], failStore: false, loseResponse: false, archived: [] };
  const store = {
    archiveLocal: async (value, context) => { if (state.failArchive) throw new Error("Archive storage full"); state.archived.push({ value, context }); },
    list: async (scope) => Array.from(rows.values()).filter((row) => row.scope === scope).map(copy),
    put: async (row) => { if (state.failStore) throw new Error("Local storage full"); rows.set(row.change.id, copy(row)); },
    remove: async (id) => { rows.delete(id); },
  };
  function client() {
    const result = createSessionSaveClient({ getScope: () => state.scope, store, makeId, send: async (edit) => {
      state.sent.push(copy(edit));
      if (state.offline) return { ok: false, status: 503 };
      const merged = applySessionDateChange(state.central, edit);
      if (!merged.ok) return { ok: false, status: 409, payload: { conflicts: merged.conflicts, currentRevision: state.revision } };
      state.central = merged.state; state.revision++;
      if (state.loseResponse) { state.loseResponse = false; return { ok: false, status: 504 }; }
      const receipt = { ok: true, payload: { sessionChange: { id: edit.id, date: edit.date, value: sessionDateValue(state.central, edit.date) }, metadata: { revision: state.revision } } };
      await state.beforeReceipt?.();
      return receipt;
    } });
    result.observe(JSON.stringify(state.central), { revision: state.revision });
    return result;
  }
  return { state, rows, client, store };
}

test("staging before hydration retains the first edit's baseline for later retries", async () => {
  const h = harness(), before = copy(h.state.central), first = copy(before), second = copy(before);
  const client = createSessionSaveClient({ getScope: () => h.state.scope, store: h.store, send: async () => { throw new Error("Not needed"); }, makeId });
  first.sessions[date].blocks[0].objective = "First edit";
  second.sessions[date].blocks[0].objective = "First edit";
  second.sessions[date].blocks[0].title = "Second edit";
  expect((await client.stage(JSON.stringify(first), { previousValue: JSON.stringify(before) })).ok).toBe(false);
  client.observe(JSON.stringify(before), { revision: 10 });
  expect((await client.stage(JSON.stringify(second), { previousValue: JSON.stringify(first) })).ok).toBe(true);
  const row = [...h.rows.values()][0];
  expect(row.change.before.session.blocks[0].objective).toBe("Close space");
  expect(row.change.after.session.blocks[0]).toMatchObject({ objective: "First edit", title: "Second edit" });
});

test("legacy pending cache must be archived before sending a new date edit", async () => {
  const h = harness(), client = h.client(), before = copy(h.state.central), after = copy(before);
  before.sessions["2026-09-09"].title = "Unresolved legacy draft";
  after.sessions["2026-09-09"].title = "Unresolved legacy draft";
  after.sessions[date].title = "Today's edit";
  const options = { previousValue: JSON.stringify(before), previousPending: true, recoveryContext: { scope: "legacy-scope", revision: 10 } };
  h.state.failArchive = true;
  expect((await client.save(JSON.stringify(after), options)).ok).toBe(false);
  expect(h.state.sent).toEqual([]);
  expect(h.rows.size).toBe(0);
  h.state.failArchive = false;
  expect((await client.save(JSON.stringify(after), options)).ok).toBe(true);
  expect(h.state.archived).toEqual([{ value: JSON.stringify(before), context: options.recoveryContext }]);
  expect(h.state.central.sessions["2026-09-09"].title).toBe("Yesterday");
  expect(h.state.central.sessions[date].title).toBe("Today's edit");
});

test("an offline save survives a new runtime and only clears after the matching server receipt", async () => {
  const h = harness(), client = h.client(), local = copy(h.state.central);
  local.sessions[date].blocks[0].title = "Offline training";
  h.state.offline = true;
  expect((await client.save(JSON.stringify(local))).ok).toBe(false);
  expect(h.rows.size).toBe(1);
  h.state.offline = false;
  const reloaded = h.client();
  expect(await reloaded.pendingState()).toBeTruthy();
  expect((await reloaded.save(JSON.stringify(h.state.central))).ok).toBe(true);
  expect(h.rows.size).toBe(0);
  expect(h.state.central.sessions[date].blocks[0].title).toBe("Offline training");
});

test("an uncertain response safely retries the same edit without duplicating players or frames", async () => {
  const h = harness(), client = h.client(), local = copy(h.state.central);
  local.sessions[date].blocks.push({ id: "added", title: "Added once" });
  h.state.loseResponse = true;
  expect((await client.save(JSON.stringify(local))).ok).toBe(false);
  expect((await client.save(JSON.stringify(local))).ok).toBe(true);
  expect(h.state.central.sessions[date].blocks.filter((block) => block.id === "added")).toHaveLength(1);
  expect(h.rows.size).toBe(0);
});

test("a genuine conflict is durable and does not block another date", async () => {
  const h = harness(), client = h.client(), local = copy(h.state.central);
  local.sessions[date].blocks[0].objective = "Local";
  local.sessions["2026-09-09"].blocks[0].title = "Other date";
  h.state.central.sessions[date].blocks[0].objective = "Colleague";
  const result = await client.save(JSON.stringify(local));
  expect(result.reviewRequired).toBe(true);
  expect(h.state.central.sessions["2026-09-09"].blocks[0].title).toBe("Other date");
  expect(h.rows.size).toBe(1);
  expect((await client.reviews())[0].change.after.session.blocks[0].objective).toBe("Local");
});

test("a mismatched server receipt never clears the local journal", async () => {
  const h = harness(), local = copy(h.state.central);
  const client = createSessionSaveClient({ getScope: () => h.state.scope, store: h.store, makeId,
    send: async () => ({ ok: true, payload: { metadata: { revision: 11 }, sessionChange: { id: "unrelated-edit", date, value: sessionDateValue(local, date) } } }) });
  client.observe(JSON.stringify(h.state.central), { revision: 10 });
  local.sessions[date].title = "Must remain local";
  expect(await client.save(JSON.stringify(local))).toMatchObject({ ok: false, durablePending: true });
  expect(h.rows.size).toBe(1);
  expect([...h.rows.values()][0].change.after.session.title).toBe("Must remain local");
});

test("storage failure never sends or reports the edit as saved", async () => {
  const h = harness(), client = h.client(), local = copy(h.state.central);
  local.sessions[date].title = "Unsaved";
  h.state.failStore = true;
  expect((await client.save(JSON.stringify(local))).ok).toBe(false);
  expect(h.state.sent).toEqual([]);
});

test("a different account never replays another account's queued data", async () => {
  const h = harness(), client = h.client(), local = copy(h.state.central);
  local.sessions[date].title = "Private draft";
  h.state.offline = true;
  await client.save(JSON.stringify(local));
  h.state.scope = "other:org:team"; h.state.offline = false;
  const other = h.client();
  expect(await other.pendingState()).toBeNull();
  await other.save(JSON.stringify(h.state.central));
  expect(h.rows.size).toBe(1);
  expect(h.state.sent).toHaveLength(1);
});

test("review explains changed text without interpreting HTML", () => {
  const before = initial(), after = copy(before);
  after.sessions[date].blocks[0].objective = '<img src=x onerror="alert(1)">';
  const differences = describeSessionDifferences(sessionDateValue(before, date), sessionDateValue(after, date), date);
  expect(differences).toEqual([expect.objectContaining({ field: "objective", before: "Close space", after: '<img src=x onerror="alert(1)">' })]);
  expect(sameSessionValue({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
});

test("two tabs never silently chain one coach's edit onto another tab's pending edit", async () => {
  const h = harness(), first = h.client(), second = h.client();
  const a = copy(h.state.central), b = copy(h.state.central);
  a.sessions[date].blocks[0].objective = "First tab";
  b.sessions[date].blocks[0].objective = "Second tab";
  h.state.offline = true;
  await first.save(JSON.stringify(a));
  h.state.offline = false;
  const result = await second.save(JSON.stringify(b));
  expect(result.reviewRequired).toBe(true);
  expect(h.state.central.sessions[date].blocks[0].objective).toBe("First tab");
  expect(Array.from(h.rows.values()).some((row) => row.change.after.session.blocks[0].objective === "Second tab")).toBe(true);
});

test("a supplied pre-edit cache limits the save to the actual edited date", async () => {
  const h = harness(), client = h.client(), displayed = copy(h.state.central);
  displayed.sessions["2026-09-09"].title = "Old unresolved local version";
  const after = copy(displayed);
  after.sessions[date].blocks[0].objective = "Today's actual edit";
  expect((await client.save(JSON.stringify(after), { previousValue: JSON.stringify(displayed) })).ok).toBe(true);
  expect(h.state.sent.map((edit) => edit.date)).toEqual([date]);
  expect(h.state.central.sessions["2026-09-09"].title).toBe("Yesterday");
});

test("a delayed receipt cannot replace a newer observed central revision", async () => {
  const h = harness(), client = h.client(), local = copy(h.state.central);
  local.sessions[date].title = "My edit";
  h.state.beforeReceipt = async () => {
    h.state.central.sessions[date].title = "Later colleague edit";
    h.state.revision++;
    client.observe(JSON.stringify(h.state.central), { revision: h.state.revision });
  };
  const result = await client.save(JSON.stringify(local));
  expect(result.ok).toBe(true);
  expect(JSON.parse(client.centralValue()).sessions[date].title).toBe("Later colleague edit");
  expect(result.metadata.revision).toBe(h.state.revision);
});

test("keeping central during review cannot silently replay dependent later edits", async () => {
  const h = harness(), client = h.client(), local = copy(h.state.central);
  local.sessions[date].title = "First draft";
  h.state.central.sessions[date].title = "Colleague";
  await client.save(JSON.stringify(local));
  local.sessions[date].title = "Second draft";
  await client.save(JSON.stringify(local));
  client.observe(JSON.stringify(h.state.central), { revision: h.state.revision });
  const [first] = await client.reviews();
  const sentBefore = h.state.sent.length;
  await client.resolve(first.change.id, false, first.central);
  expect(h.state.sent).toHaveLength(sentBefore);
  expect((await client.reviews())).toHaveLength(1);
  expect(h.state.central.sessions[date].title).toBe("Colleague");
});

test("review includes exercise ordering and date-level fields", () => {
  const before = initial(), after = copy(before);
  after.sessions[date].blocks.reverse();
  after.sessions[date].sessionNotes = "Coach note";
  expect(describeSessionDifferences(sessionDateValue(before, date), sessionDateValue(after, date), date).map((entry) => entry.field)).toEqual(expect.arrayContaining(["blockOrder", "sessionNotes"]));
});

test("a newer edit is durable while an older network request is still pending", async () => {
  const h = harness(), client = h.client(), before = copy(h.state.central), first = copy(before);
  first.sessions[date].title = "First edit";
  let release, entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  h.state.beforeReceipt = async () => { entered(); await gate; };
  const saving = client.save(JSON.stringify(first), { previousValue: JSON.stringify(before) });
  await started;
  const second = copy(first); second.sessions[date].blocks[0].objective = "Newer edit";
  try {
    expect((await client.stage(JSON.stringify(second), { previousValue: JSON.stringify(first) })).ok).toBe(true);
    expect(h.rows.size).toBe(2);
  } finally { release(); await saving; }
  h.state.beforeReceipt = null;
  const reloaded = h.client();
  expect((await reloaded.replay()).ok).toBe(true);
  expect(h.state.central.sessions[date]).toMatchObject({ title: "First edit", blocks: [expect.objectContaining({ objective: "Newer edit" }), expect.anything()] });
  expect(h.rows.size).toBe(0);
});

test("a failed journal stage cannot silently lose an earlier change on the next edit", async () => {
  const h = harness(), client = h.client(), before = copy(h.state.central), first = copy(before);
  first.sessions[date].title = "Must survive";
  h.state.failStore = true;
  expect((await client.stage(JSON.stringify(first), { previousValue: JSON.stringify(before) })).ok).toBe(false);
  h.state.failStore = false;
  const second = copy(first); second.sessions[date].blocks[0].objective = "Later edit";
  expect((await client.save(JSON.stringify(second), { previousValue: JSON.stringify(first) })).ok).toBe(true);
  expect(h.state.central.sessions[date].title).toBe("Must survive");
  expect(h.state.central.sessions[date].blocks[0].objective).toBe("Later edit");
});
