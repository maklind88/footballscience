import { expect, test } from "@playwright/test";
import { createSessionPlannerRuntimeStateService } from "../src/modules/session-planner/session-planner-runtime-state-service.mjs";
import { createSessionPlannerStateMergeHelpers } from "../src/modules/session-planner/session-planner-state-merge-helpers.mjs";
import { getSessionPlannerQuotaSnapshotId, getSessionPlannerRecoveryContext } from "../src/modules/session-planner/session-planner-recovery-controller.mjs";
import { sessionPlannerBlockMergeFields } from "../src/core/app-runtime-constants.mjs";

const key = "football-session-planner-v3";
const day = "2026-09-08";
const otherDay = "2026-09-09";
const oldTime = "2026-09-01T10:00:00.000Z";
const newTime = "2026-09-08T10:00:00.000Z";
const clone = (value) => JSON.parse(JSON.stringify(value));
const block = (id, title = "Existing", timestamp = oldTime) => ({
  id, title, createdAt: oldTime, updatedAt: timestamp, fieldUpdatedAt: { title: timestamp },
});
const initial = () => ({
  selectedDate: day,
  sessions: {
    [day]: { date: day, title: "Training", selectedBlockId: "a", blocks: [block("a"), block("b")] },
    [otherDay]: { date: otherDay, title: "Other training", selectedBlockId: "c", blocks: [block("c")] },
  },
});

function createHarness(options = {}) {
  const control = {
    context: { scope: "coach-a:org-a:team-a", revision: 5, ready: true },
    defer: false, quota: false, failWrite: false, writes: [], renders: [], toasts: [], statuses: [], records: [], reads: [],
  };
  const helpers = createSessionPlannerStateMergeHelpers({ blockMergeFields: sessionPlannerBlockMergeFields });
  control.state = helpers.cloneSessionPlannerState(initial());
  control.raw = JSON.stringify(control.state);
  const snapshots = options.snapshots || new Map();
  let finishRead;
  let finishWrite;
  const database = {
    transaction: () => {
      const transaction = {};
      transaction.objectStore = () => ({
        get: (id) => {
          control.reads.push(id);
          const request = {};
          finishRead = () => { request.result = snapshots.get(id); request.onsuccess(); };
          return request;
        },
        getAll: () => { throw new Error("Background recovery must not scan historical backups"); },
        put: (snapshot) => {
          snapshots.set(snapshot.id, clone(snapshot));
          if (snapshot.reason === "session-planner-recovery-review") {
            queueMicrotask(() => transaction.oncomplete());
            return {};
          }
          finishWrite = () => transaction.oncomplete();
          return {};
        },
      });
      return transaction;
    },
  };
  const service = createSessionPlannerRuntimeStateService({
    cloneState: helpers.cloneSessionPlannerState,
    createDefaultState: helpers.createSessionPlannerDefaultState,
    getSessionPlannerState: () => control.state,
    setSessionPlannerState: (next) => { control.state = next; },
    getRecoveryContext: () => control.context,
    shouldDeferRecovery: () => control.defer,
    canWriteCentralBackedCache: () => Boolean(control.context),
    mergeStateForWrite: helpers.mergeSessionPlannerStateForWrite,
    openDataSafetyDatabase: async () => database,
    rawDataSafetyGetItem: () => control.raw,
    recordDataSafetyWrite: (_key, value) => control.records.push(value),
    getActiveWorkspaceId: () => "session-planner",
    renderWorkspace: (options) => control.renders.push(options),
    showToast: (message) => control.toasts.push(message),
    sessionPlannerAutosaveBoundary: {
      markSessionPlannerWrite: () => control.statuses.push("write"),
      setStatusForKey: (_key, state, message) => control.statuses.push([state, message]),
    },
    win: {
      footballScienceCentralState: { setCachedValue: () => true },
      localStorage: {
        getItem: () => control.raw,
        setItem: (_key, value) => {
          if (control.failWrite) throw new Error("Storage unavailable");
          if (control.quota) { const error = new Error("quota"); error.name = "QuotaExceededError"; throw error; }
          control.raw = value;
          control.writes.push(value);
        },
      },
    },
  });
  function addPending(value = initial(), context = control.context) {
    value = clone(value);
    value.sessions[day].blocks[0] = { ...value.sessions[day].blocks[0], ...block("a", "Pending edit", newTime) };
    const snapshot = {
      id: getSessionPlannerQuotaSnapshotId(key, context), reason: "session-planner-quota-fallback",
      recovery: { scope: context.scope, baseRevision: context.revision }, storage: { [key]: JSON.stringify(value) },
    };
    snapshots.set(snapshot.id, snapshot);
    return snapshot;
  }
  async function recover(mutator = () => {}) {
    const pending = service.queueSnapshotRecovery();
    await Promise.resolve();
    mutator();
    finishRead?.();
    await pending;
    finishRead = null;
  }
  async function finishFallbackWrite() {
    await Promise.resolve();
    finishWrite();
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { control, service, helpers, snapshots, addPending, recover, finishFallbackWrite };
}

test("normal hydration never restores historical or unscoped backups", async () => {
  const h = createHarness();
  const historical = initial();
  historical.sessions[day].blocks.push(block("historical-extra"));
  for (const id of ["historical", `${key}-quota-fallback`]) {
    h.snapshots.set(id, { id, reason: "session-planner-quota-fallback", storage: { [key]: JSON.stringify(historical) } });
  }
  await h.recover();
  await h.recover();
  expect(h.control.reads).toHaveLength(1);
  expect(h.control.writes).toEqual([]);
  expect(h.control.renders).toEqual([]);
  expect(h.control.toasts).toEqual([]);
  expect(h.snapshots.size).toBe(2);
});

test("pending scoped edits recover once and retain the current day and block", async () => {
  const h = createHarness();
  h.addPending();
  h.control.state.selectedDate = otherDay;
  h.control.state.sessions[day].selectedBlockId = "b";
  await h.recover();
  await h.recover();
  expect(h.control.state.selectedDate).toBe(otherDay);
  expect(h.control.state.sessions[day].selectedBlockId).toBe("b");
  expect(h.control.state.sessions[day].blocks[0].title).toBe("Pending edit");
  expect(h.control.writes).toHaveLength(1);
  expect(h.control.renders).toHaveLength(1);
  expect(h.control.reads).toHaveLength(1);
});

const interruptions = {
  "navigation after save": (h) => {
    h.control.state.sessions[day].blocks[0].title = "Saved before navigation";
    h.control.state.sessions[day].blocks[0].fieldUpdatedAt.title = "2026-09-08T11:00:00.000Z";
    h.service.writeState();
    h.control.state.selectedDate = otherDay;
  },
  "same-object date change": (h) => { h.control.state.selectedDate = otherDay; },
  "block selection": (h) => { h.control.state.sessions[day].selectedBlockId = "b"; },
  "same-object unsaved edit": (h) => { h.control.state.sessions[day].blocks[0].title = "Typing"; },
  "new state reference": (h) => { h.control.state = { ...h.control.state, selectedDate: otherDay }; },
  "new server cache": (h) => { h.control.raw = JSON.stringify({ ...initial(), selectedDate: otherDay }); },
  "server revision change": (h) => { h.control.context.revision += 1; },
  "team change": (h) => { h.control.context.scope = "coach-a:org-a:team-b"; },
  "logout": (h) => { h.control.context = null; },
  "hydration starts": (h) => { h.control.context.ready = false; },
  "hydration remains in flight": (h) => { h.control.context.hydrating = true; },
  "editor or overlay opens": (h) => { h.control.defer = true; },
};
for (const [name, interrupt] of Object.entries(interruptions)) {
  test(`late recovery cannot overwrite ${name}`, async () => {
    const h = createHarness();
    h.addPending();
    let expected;
    let writes;
    await h.recover(() => { interrupt(h); expected = clone(h.control.state); writes = h.control.writes.length; });
    expect(h.control.state).toEqual(expected);
    expect(h.control.writes).toHaveLength(writes);
    expect(h.control.renders).toEqual([]);
    expect(h.control.toasts).toEqual([]);
    expect(h.snapshots.size).toBe(1);
  });
}

test("an interrupted recovery can retry safely after the user stops editing", async () => {
  const h = createHarness();
  h.addPending();
  await h.recover(() => { h.control.defer = true; });
  expect(h.control.writes).toEqual([]);
  h.control.defer = false;
  await h.recover();
  expect(h.control.writes).toHaveLength(1);
});

test("a failed recovery write preserves the view and snapshot and can retry", async () => {
  const h = createHarness();
  h.addPending();
  const previous = clone(h.control.state);
  h.control.failWrite = true;
  await h.recover();
  expect(h.control.state).toEqual(previous);
  expect(h.control.renders).toEqual([]);
  expect(h.control.statuses).toContainEqual(["issue", "Save failed"]);
  expect(h.snapshots.size).toBe(1);
  h.control.failWrite = false;
  await h.recover();
  expect(h.control.state.sessions[day].blocks[0].title).toBe("Pending edit");
  expect(h.control.writes).toHaveLength(1);
});

test("a ready event emitted during hydration can recover after hydration finishes", async () => {
  const h = createHarness();
  h.addPending();
  h.control.context.hydrating = true;
  await h.recover(() => { h.control.context.hydrating = false; });
  expect(h.control.state.sessions[day].blocks[0].title).toBe("Pending edit");
});

test("missing auth or hydration never starts a local recovery read", async () => {
  const h = createHarness();
  h.addPending();
  h.control.context.ready = false;
  await h.recover();
  h.control.context = null;
  await h.recover();
  expect(h.control.reads).toEqual([]);
  expect(h.control.writes).toEqual([]);
});

test("newer central content is never replaced by an older quota snapshot", async () => {
  const h = createHarness();
  const pending = h.addPending();
  h.control.context.revision = 6;
  const original = clone(h.control.state);
  await h.recover();
  await h.recover();
  expect(h.control.state).toEqual(original);
  expect(h.control.writes).toEqual([]);
  expect(h.control.statuses).toEqual([["issue", "Local changes need review"]]);
  expect(h.snapshots.size).toBe(2);
  const archiveId = `${pending.id}:review:5`;
  expect(h.snapshots.get(archiveId)).toEqual({ ...pending, id: archiveId, reason: "session-planner-recovery-review" });
  h.control.quota = true;
  h.control.state.sessions[day].blocks[0].title = "Later edit";
  h.service.writeState();
  await h.finishFallbackWrite();
  expect(h.snapshots.get(archiveId).storage).toEqual(pending.storage);
});

test("already-synced quota content is a no-op without Saved notices or re-rendering", async () => {
  const h = createHarness();
  const pending = h.addPending();
  h.control.state = h.helpers.cloneSessionPlannerState(JSON.parse(pending.storage[key]));
  h.control.raw = JSON.stringify(h.control.state);
  h.control.context.revision = 6;
  await h.recover();
  expect(h.control.statuses).toEqual([]);
  expect(h.control.writes).toEqual([]);
  expect(h.control.renders).toEqual([]);
});

test("current equal-timestamp values and deletion tombstones win over fallback", async () => {
  const h = createHarness();
  h.addPending();
  h.control.state.sessions[day].blocks[0] = block("a", "Current wins ties", newTime);
  h.control.state.sessions[day].blocks.splice(1, 1);
  h.control.state.blockDeletionTombstones = { [day]: { b: newTime } };
  await h.recover();
  expect(h.control.state.sessions[day].blocks.map(({ id }) => id)).toEqual(["a"]);
  expect(h.control.state.sessions[day].blocks[0].title).toBe("Current wins ties");
  expect(h.control.writes).toEqual([]);
});

test("recovery preserves all 24 frames, custom labels and player board placement through save and reload", async () => {
  const h = createHarness();
  const pending = initial();
  const exercise = pending.sessions[day].blocks[0];
  exercise.tacticalFrames = Array.from({ length: 24 }, (_, index) => ({
    id: `frame-${index}`, elements: [{ id: "player-a", type: "blue-player", x: index + 10, y: 40, playerNumber: ["CB", "RW", "CF", "12"][index % 4] }],
  }));
  exercise.tacticalElements = clone(exercise.tacticalFrames[0].elements);
  exercise.playerBoardPositions = { player1: { x: 23, y: 47 } };
  exercise.playerBoardColors = { player1: "blue" };
  exercise.fieldUpdatedAt = Object.fromEntries(["title", "tacticalFrames", "tacticalElements", "playerBoardPositions", "playerBoardColors"].map((field) => [field, newTime]));
  h.addPending(pending);
  await h.recover();
  const reloaded = h.service.readState();
  expect(reloaded.sessions[day].blocks[0].tacticalFrames).toEqual(exercise.tacticalFrames);
  expect(reloaded.sessions[day].blocks[0].playerBoardPositions).toEqual(exercise.playerBoardPositions);
  expect(reloaded.sessions[day].blocks[0].playerBoardColors).toEqual(exercise.playerBoardColors);
});

test("quota fallback remains durable but is not sent under a different user or team", async () => {
  const h = createHarness();
  h.control.quota = true;
  h.control.state.sessions[day].blocks[0].title = "Offline edit";
  const originalContext = clone(h.control.context);
  h.service.writeState();
  h.control.context = { ...h.control.context, scope: "coach-b:org-b:team-b" };
  await h.finishFallbackWrite();
  expect(await h.service.flushQuotaFallback()).toBe(false);
  expect(h.control.records).toEqual([]);
  const snapshot = h.snapshots.get(getSessionPlannerQuotaSnapshotId(key, originalContext));
  expect(JSON.parse(snapshot.storage[key]).sessions[day].blocks[0].title).toBe("Offline edit");
  expect(snapshot.recovery.scope).toBe(originalContext.scope);
});

test("a durable quota write survives a fresh runtime and recovers without moving the selected day", async () => {
  const beforeReload = createHarness();
  beforeReload.control.quota = true;
  beforeReload.control.state.sessions[day].blocks[0] = block("a", "Saved while storage was full", newTime);
  expect(beforeReload.service.writeState()).toBe(true);
  expect(beforeReload.control.records).toEqual([]);
  await beforeReload.finishFallbackWrite();
  expect(await beforeReload.service.flushQuotaFallback()).toBe(true);
  expect(beforeReload.control.records).toHaveLength(1);

  const afterReload = createHarness({ snapshots: beforeReload.snapshots });
  afterReload.control.state.selectedDate = otherDay;
  afterReload.control.state.sessions[day].selectedBlockId = "b";
  await afterReload.recover();
  const reloadedState = afterReload.service.readState();
  expect(reloadedState.sessions[day].blocks[0].title).toBe("Saved while storage was full");
  expect(reloadedState.selectedDate).toBe(otherDay);
  expect(reloadedState.sessions[day].selectedBlockId).toBe("b");
  expect(afterReload.control.writes).toHaveLength(1);
  expect(afterReload.snapshots.size).toBe(1);
});

test("context requires a signed-in editor and waits for central hydration", () => {
  const user = { id: "coach", clubId: "club", teamId: "team" };
  const bridge = { isHydrated: () => true, getStatus: () => ({ metadata: { [key]: { revision: 4, organizationId: "org" } } }) };
  const context = getSessionPlannerRecoveryContext({ user, bridge, storageKey: key, canEdit: true });
  expect(context).toEqual({ scope: JSON.stringify(["coach", "org", "club", "team"]), revision: 4, ready: true, hydrating: false });
  expect(getSessionPlannerRecoveryContext({ user, bridge, storageKey: key, canEdit: false })).toBeNull();
  expect(getSessionPlannerRecoveryContext({ bridge, storageKey: key, canEdit: true })).toBeNull();
  bridge.canAutoSyncKey = () => false;
  expect(getSessionPlannerRecoveryContext({ user, bridge, storageKey: key, canEdit: true })).toBeNull();
  delete bridge.canAutoSyncKey;
  bridge.isHydrated = () => false;
  expect(getSessionPlannerRecoveryContext({ user, bridge, storageKey: key, canEdit: true }).ready).toBe(false);
});
