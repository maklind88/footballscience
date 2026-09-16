import { createSessionDateChanges, replaceSessionDate, sameSessionValue, sessionDateValue } from "./session-save-protocol.mjs";
import { createSessionSaveStore } from "./session-save-store.mjs";

export function createSessionSaveClient({ getScope, send, store = createSessionSaveStore(), makeId, onReview = () => {}, retryRevisionConflict = true }) {
  let baseline = null;
  let revision = 0;
  let baselineMetadata = {};
  let scope = "";
  let serial = Promise.resolve();
  let staging = Promise.resolve();
  let replayFlight = null;
  let observation = 0;
  const unstaged = new Map();
  let sequence = 0;
  const writer = makeId ? makeId() : globalThis.crypto.randomUUID();
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const current = (expected) => expected && expected === getScope() && expected === scope;
  const failure = (reason, extra = {}) => ({ ok: false, reason, ...extra });
  const coordinate = (expected, work) => store.withReplay ? store.withReplay(expected, work) : work();

  function observe(value, metadata = {}) {
    const nextScope = getScope();
    if (!nextScope) return;
    if (scope !== nextScope) { baseline = null; revision = 0; baselineMetadata = {}; scope = nextScope; }
    if (Number(metadata.revision || 0) < revision) return;
    baseline = JSON.parse(value);
    revision = Number(metadata.revision || 0);
    baselineMetadata = { ...metadata, revision };
    observation++;
  }

  async function drain(expected) {
    const rows = store.replayRows ? store.replayRows(expected) : await store.list(expected);
    if (!current(expected)) return failure("Account or team changed. Local changes were retained.");
    const blocked = new Set();
    let metadata = { ...baselineMetadata };
    let issue = "";
    for await (const row of rows) {
      if (!current(expected)) return failure("Account or team changed. Local changes were retained.");
      if (row.status === "archived") continue;
      if (row.status === "review" || blocked.has(row.change.date)) {
        if (row.status !== "review" && !await store.update(row, { ...row, status: "review", conflicts: ["An earlier local version needs review."] })) {
          return failure("Local save changed in another tab. Retry to read its current version.", { durablePending: true });
        }
        blocked.add(row.change.date); issue = "Local changes need review"; continue;
      }
      let result = await send(row.change, revision, expected);
      if (!current(expected)) return failure("Account or team changed. Local changes were retained.");
      // Retry a database CAS race once with the same immutable change, never a rebased edit.
      if (retryRevisionConflict && !result.ok && result.status === 409 && !result.payload?.conflicts?.length) result = await send(row.change, result.payload?.currentRevision || revision, expected);
      if (!current(expected)) return failure("Account or team changed. Local changes were retained.");
      if (!result.ok) {
        if (result.status === 409 && result.payload?.conflicts?.length) {
          if (!await store.update(row, { ...row, status: "review", conflicts: result.payload.conflicts })) {
            return failure("Local save changed in another tab. Retry to read its current version.", { durablePending: true });
          }
          blocked.add(row.change.date); issue = "Local changes need review"; continue;
        }
        return failure(result.payload?.reason || "Saved locally; central sync pending", { status: result.status, durablePending: true,
          ...(result.payload?.reconcileRequired ? { reconcileRequired: true } : {}) });
      }
      const receipt = result.payload?.sessionChange;
      if (receipt?.id !== row.change.id || receipt?.date !== row.change.date || !receipt?.value?.session || !result.payload?.metadata?.revision) {
        return failure("Central save was not confirmed. Local changes were retained.", { durablePending: true });
      }
      // The exact scoped row must still exist when its receipt is committed locally.
      if (!await store.remove(row, result.payload.metadata)) return failure("Local save changed in another tab. Its current version was retained.", { durablePending: true });
      if (!current(expected)) return failure("Account or team changed. Central training must be loaded again.");
      if (Number(result.payload.metadata.revision) >= revision) {
        baseline = replaceSessionDate(baseline, receipt.date, receipt.value);
        revision = Number(result.payload.metadata.revision);
        baselineMetadata = { ...result.payload.metadata, revision };
      }
      // A late receipt may acknowledge its row, never relabel an old hash as
      // the newer observed revision or discard that revision's metadata.
      metadata = { ...baselineMetadata };
    }
    if (!current(expected)) return failure("Account or team changed. Local changes were retained.");
    if (store.confirmedRevision) {
      const confirmed = await store.confirmedRevision(expected);
      if (!current(expected)) return failure("Account or team changed. Local changes were retained.");
      if (confirmed > revision) return failure("Training changed in another tab. Fresh central training is required.", { reconcileRequired: true });
    }
    if (issue) {
      onReview();
      return failure(issue, { reviewRequired: true, durablePending: true, value: JSON.stringify(baseline), metadata });
    }
    return { ok: true, value: JSON.stringify(baseline), metadata, revision };
  }

  function stage(value, options = {}) {
    const expected = getScope();
    const desired = JSON.parse(value);
    // Capture the edit's real baseline before awaiting an older network request.
    let baseAtEdit = typeof options.previousValue === "string" ? JSON.parse(options.previousValue) : baseline && copy(baseline);
    const work = staging.then(async () => {
      baseAtEdit = unstaged.get(expected) || baseAtEdit;
      if (!current(expected) || !baseAtEdit) throw new Error("Central training is still loading. Local changes were retained.");
      const pending = await store.list(expected);
      if (!current(expected)) return failure("Account or team changed. Local changes were retained.");
      if (options.previousPending && !pending.some((row) => row.status !== "archived")) {
        await store.archiveLocal?.(options.previousValue, options.recoveryContext);
        if (!current(expected)) return failure("Account or team changed. Local changes were retained.");
      }
      let logicalBase = copy(baseAtEdit);
      for (const row of pending) {
        if (row.status !== "archived" && row.writer === writer) logicalBase = replaceSessionDate(logicalBase, row.change.date, row.change.after);
      }
      const changes = createSessionDateChanges(baseAtEdit, desired, makeId);
      const records = [];
      for (const change of changes) {
        // Repeated retry of the same edit must not add another journal row.
        if (sameSessionValue(sessionDateValue(logicalBase, change.date), change.after)) continue;
        const previous = pending.filter((row) => row.writer === writer && row.status !== "archived" && row.change.date === change.date).at(-1);
        if (previous && typeof options.previousValue !== "string") change.before = previous.change.after;
        records.push({ change, writer, scope: expected, status: "pending", createdAt: Date.now() * 1000 + sequence++ });
      }
      await store.putMany(records);
      if (!current(expected)) return failure("Account or team changed. Local changes were retained.", { durablePending: true });
      unstaged.delete(expected);
      return { ok: true };
    }).catch((error) => {
      if (expected && baseAtEdit && !unstaged.has(expected)) unstaged.set(expected, baseAtEdit);
      return failure(error?.message || "Local save storage failed. Keep this page open.");
    });
    staging = work.then(() => {});
    return work;
  }

  function replay() {
    const expected = getScope();
    const staged = staging;
    // Share only an identical request. New edits, observations and review actions
    // keep their own place in the serial queue; journal rows remain immutable.
    if (replayFlight?.expected === expected && replayFlight.staged === staged &&
        replayFlight.observation === observation && replayFlight.tail === serial) {
      replayFlight.recheck = true;
      return replayFlight.work.then(copy);
    }
    const flight = { expected, staged, observation, recheck: false };
    const work = serial.then(() => coordinate(expected, async () => {
      await staged;
      if (!current(expected) || !baseline) return failure("Central training is still loading. Local changes were retained.");
      let result;
      do {
        flight.recheck = false;
        const next = await drain(expected);
        if (result?.metadata && result.metadata.revision === next.metadata?.revision) {
          next.metadata = { ...result.metadata, ...next.metadata };
        }
        result = next;
        // A joined trigger may represent another tab's newly durable row.
        // Reread after success/review, never multiply a failed network attempt.
      } while (flight.recheck && (result.ok || result.reviewRequired));
      return result;
    })).catch((error) => failure(error?.message || "Saved locally; central sync pending", { durablePending: true }))
      .finally(() => { if (replayFlight?.work === work) replayFlight = null; });
    serial = work.then(() => {});
    replayFlight = Object.assign(flight, { work, tail: serial });
    return work.then(copy);
  }

  async function save(value, options) {
    const result = await stage(value, options);
    return result.ok ? replay() : result;
  }

  async function pendingState() {
    const expected = getScope();
    if (!current(expected) || !baseline) return null;
    const rows = await store.list(expected);
    if (!current(expected)) return null;
    return rows.some((row) => row.status === "pending") ? JSON.stringify(baseline) : null;
  }

  async function reviews() {
    const expected = getScope();
    if (!current(expected) || !baseline) return [];
    const rows = await store.list(expected);
    if (!current(expected)) return [];
    return rows.filter((row) => row.status === "review").map((row) => ({ ...row, central: sessionDateValue(baseline, row.change.date) }));
  }

  async function isSettled() {
    const expected = getScope();
    await staging;
    const rows = await store.list(expected);
    const confirmed = store.confirmedRevision ? await store.confirmedRevision(expected) : 0;
    return Boolean(current(expected) && baseline && revision >= confirmed && !unstaged.has(expected) && rows.every((row) => row.status === "archived"));
  }

  function resolve(id, keepLocal, expectedCentral) {
    const expected = getScope();
    const work = serial.then(() => coordinate(expected, async () => {
      if (!current(expected) || !baseline) return failure("Account or team changed.");
      const row = (await store.list(expected)).find((item) => item.change.id === id && item.status === "review");
      if (!current(expected)) return failure("Account or team changed. Local changes were retained.");
      if (!row) return failure("This review has changed. Open it again.");
      const central = sessionDateValue(baseline, row.change.date);
      if (!sameSessionValue(central, expectedCentral)) return failure("Training changed since review. Review the latest version.");
      let replacement = null;
      if (keepLocal) {
        const change = { ...row.change, id: makeId ? makeId() : globalThis.crypto.randomUUID(), before: central };
        replacement = { change, scope: expected, status: "pending", createdAt: Date.now() * 1000 + sequence++ };
      }
      if (!await store.resolveReview(row, replacement)) return failure("This review has changed. Open it again.");
      if (!current(expected)) return failure("Account or team changed. Local changes were retained.");
      return drain(expected);
    })).catch((error) => failure(error.message));
    serial = work.then(() => {});
    return work;
  }
  return { observe, stage, replay, save, pendingState, reviews, resolve, isSettled,
    centralValue: () => current(getScope()) && baseline ? JSON.stringify(baseline) : null,
  };
}
