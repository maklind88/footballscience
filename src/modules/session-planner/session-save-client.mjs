import { createSessionDateChanges, replaceSessionDate, sameSessionValue, sessionDateValue } from "./session-save-protocol.mjs";
import { createSessionSaveStore } from "./session-save-store.mjs";

export function createSessionSaveClient({ getScope, send, store = createSessionSaveStore(), makeId, onReview = () => {} }) {
  let baseline = null;
  let revision = 0;
  let scope = "";
  let serial = Promise.resolve();
  let staging = Promise.resolve();
  const unstaged = new Map();
  let sequence = 0;
  const writer = makeId ? makeId() : globalThis.crypto.randomUUID();
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const current = (expected) => expected && expected === getScope() && expected === scope;
  const failure = (reason, extra = {}) => ({ ok: false, reason, ...extra });

  function observe(value, metadata = {}) {
    const nextScope = getScope();
    if (!nextScope) return;
    if (scope !== nextScope) { baseline = null; revision = 0; scope = nextScope; }
    if (Number(metadata.revision || 0) < revision) return;
    baseline = JSON.parse(value);
    revision = Number(metadata.revision || 0);
  }

  async function drain(expected) {
    const rows = await store.list(expected);
    const blocked = new Set();
    let metadata = { revision };
    let issue = "";
    for (const row of rows) {
      if (!current(expected)) return failure("Account or team changed. Local changes were retained.");
      if (row.status === "archived") continue;
      if (row.status === "review" || blocked.has(row.change.date)) {
        if (row.status !== "review") await store.put({ ...row, status: "review", conflicts: ["An earlier local version needs review."] });
        blocked.add(row.change.date); issue = "Local changes need review"; continue;
      }
      let result = await send(row.change, revision, expected);
      if (!current(expected)) return failure("Account or team changed. Local changes were retained.");
      // Retry a database CAS race once with the same immutable change, never a rebased edit.
      if (!result.ok && result.status === 409 && !result.payload?.conflicts?.length) result = await send(row.change, result.payload?.currentRevision || revision, expected);
      if (!current(expected)) return failure("Account or team changed. Local changes were retained.");
      if (!result.ok) {
        if (result.status === 409 && result.payload?.conflicts?.length) {
          await store.put({ ...row, status: "review", conflicts: result.payload.conflicts });
          blocked.add(row.change.date); issue = "Local changes need review"; continue;
        }
        return failure(result.payload?.reason || "Saved locally; central sync pending", { status: result.status, durablePending: true });
      }
      const receipt = result.payload?.sessionChange;
      if (receipt?.id !== row.change.id || receipt?.date !== row.change.date || !receipt?.value?.session || !result.payload?.metadata?.revision) {
        return failure("Central save was not confirmed. Local changes were retained.", { durablePending: true });
      }
      if (Number(result.payload.metadata.revision) >= revision) baseline = replaceSessionDate(baseline, receipt.date, receipt.value);
      metadata = { ...result.payload.metadata, revision: Math.max(revision, Number(result.payload.metadata.revision)) };
      revision = Math.max(revision, Number(metadata.revision));
      // Remove only this acknowledged generation; a later edit has its own immutable row.
      await store.remove(row.change.id);
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
      for (const change of changes) {
        // Repeated retry of the same edit must not add another journal row.
        if (sameSessionValue(sessionDateValue(logicalBase, change.date), change.after)) continue;
        const previous = pending.filter((row) => row.writer === writer && row.status !== "archived" && row.change.date === change.date).at(-1);
        if (previous && typeof options.previousValue !== "string") change.before = previous.change.after;
        await store.put({ change, writer, scope: expected, status: "pending", createdAt: Date.now() * 1000 + sequence++ });
      }
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
    const work = serial.then(async () => {
      if (!current(expected) || !baseline) return failure("Central training is still loading. Local changes were retained.");
      return drain(expected);
    }).catch((error) => failure(error?.message || "Saved locally; central sync pending", { durablePending: true }));
    serial = work.then(() => {});
    return work;
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
    return Boolean(current(expected) && baseline && !unstaged.has(expected) && rows.every((row) => row.status === "archived"));
  }

  function resolve(id, keepLocal, expectedCentral) {
    const expected = getScope();
    const work = serial.then(async () => {
      if (!current(expected) || !baseline) return failure("Account or team changed.");
      const row = (await store.list(expected)).find((item) => item.change.id === id && item.status === "review");
      if (!row) return failure("This review has changed. Open it again.");
      const central = sessionDateValue(baseline, row.change.date);
      if (!sameSessionValue(central, expectedCentral)) return failure("Training changed since review. Review the latest version.");
      if (keepLocal) {
        const change = { ...row.change, id: makeId ? makeId() : globalThis.crypto.randomUUID(), before: central };
        await store.put({ change, scope: expected, status: "pending", createdAt: Date.now() * 1000 + sequence++ });
      }
      await store.put({ ...row, status: "archived", resolvedAt: new Date().toISOString() });
      return drain(expected);
    }).catch((error) => failure(error.message));
    serial = work.then(() => {});
    return work;
  }
  return { observe, stage, replay, save, pendingState, reviews, resolve, isSettled,
    centralValue: () => current(getScope()) && baseline ? JSON.stringify(baseline) : null,
  };
}
