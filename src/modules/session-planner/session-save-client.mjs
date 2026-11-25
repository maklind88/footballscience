import { applySessionDateChange, createSessionDateChanges, replaceSessionDate, sameSessionValue, sessionDateValue } from "./session-save-protocol.mjs";
import { createSessionSaveStore } from "./session-save-store.mjs";
import { sessionChangesOverlap } from "./session-save-dependencies.mjs";

export function createSessionSaveClient({ getScope, getWorkingScope = getScope, getLatest, send, store = createSessionSaveStore(), makeId, onReview = () => {} }) {
  let baseline = null;
  let revision = 0;
  let scope = "";
  let serial = Promise.resolve();
  let staging = Promise.resolve();
  let replayFlight = null;
  let observation = 0;
  let viewVersion = 0;
  const drafts = [];
  const draftTokens = new Map();
  // One exact latest working copy per owner, not a full calendar per keystroke.
  const workingCopies = new Map();
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
    observation++;
    viewVersion++;
  }

  function rememberDraft(value, previousValue) {
    const expected = getScope();
    if (!current(expected) || !baseline || typeof previousValue !== "string") return null;
    const token = `${writer}-draft-${sequence++}`;
    const changes = createSessionDateChanges(JSON.parse(previousValue), JSON.parse(value), () => `${token}-${sequence++}`);
    drafts.push({ scope: expected, token, changes });
    draftTokens.set(expected, token);
    const owner = getWorkingScope();
    if (owner) workingCopies.set(owner, { scope: expected, owner, token, value, previousValue, baseRevision: revision });
    viewVersion++;
    return token;
  }

  function finishStagingDraft(expected, token) {
    const last = drafts.findIndex((draft) => draft.scope === expected && draft.token === token);
    if (last >= 0) {
      for (let index = last; index >= 0; index--) if (drafts[index].scope === expected) drafts.splice(index, 1);
    }
    for (const [owner, record] of workingCopies) {
      if (record.scope === expected && record.token === token) workingCopies.delete(owner);
    }
    viewVersion++;
  }

  function workingCopy() {
    const expected = getScope();
    const record = current(expected) && getWorkingScope() && workingCopies.get(getWorkingScope());
    if (record && record.scope !== expected) return null;
    return record ? { ...record } : null;
  }

  async function project() {
    const expected = getScope();
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!current(expected) || !baseline) return null;
      const version = viewVersion;
      const rows = await store.list(expected);
      if (!current(expected)) return null;
      if (version !== viewVersion) continue;
      const pending = rows.filter((row) => row.status !== "archived");
      const localDrafts = drafts.filter((draft) => draft.scope === expected);
      // Another tab's row may have arrived after the active drain took its
      // snapshot. Its receipt must be included before that drain can finish.
      if (pending.length && replayFlight?.expected === expected) replayFlight.recheck = true;
      let visible = copy(baseline);
      // Reviewed conflicts remain recoverable, but must not mask accepted data.
      // Dependent successors stay separate until their predecessor is resolved.
      const blocked = [];
      for (const row of pending) {
        if (row.status === "review" || blocked.some((change) => sessionChangesOverlap(change, row.change))) {
          blocked.push(row.change);
          continue;
        }
        const merged = applySessionDateChange(visible, row.change);
        if (!merged.ok) { blocked.push(row.change); continue; }
        visible = merged.state;
      }
      for (const change of localDrafts.flatMap((draft) => draft.changes)) {
        visible = applySessionDateChange(visible, change, { preferLocalOnConflict: true }).state;
      }
      const solePendingOperationId = pending.length === 1 && pending[0].status === "pending" && !localDrafts.length
        ? pending[0].change.id : null;
      return { value: JSON.stringify(visible), revision, pending: Boolean(pending.length || localDrafts.length), solePendingOperationId,
        draftToken: draftTokens.get(expected) || `${writer}:initial`, scope: expected, version };
    }
    return null;
  }

  async function drain(expected) {
    const owner = getWorkingScope();
    const ownerIsCurrent = () => Boolean(current(expected) && owner && owner === getWorkingScope());
    const rows = (await store.list(expected)).filter((row) => row.status !== "archived");
    if (!ownerIsCurrent()) return failure("Account or team changed. Local changes were retained.");
    const blocked = [];
    let metadata = { revision };
    let issue = "";
    for (const [index, row] of rows.entries()) {
      if (!ownerIsCurrent()) return failure("Account or team changed. Local changes were retained.");
      if (row.status === "review" || blocked.some((change) => sessionChangesOverlap(change, row.change))) {
        if (row.status !== "review") await store.put({ ...row, status: "review", conflicts: ["An earlier local version needs review."] });
        blocked.push(row.change); issue = "Local changes need review"; continue;
      }
      let result = await send(row.change, revision, expected);
      if (!ownerIsCurrent()) return failure("Account or team changed. Local changes were retained.");
      // Retry a database CAS race once with the same immutable change, never a rebased edit.
      if (!result.ok && result.status === 409 && !result.payload?.conflicts?.length) result = await send(row.change, result.payload?.currentRevision || revision, expected);
      if (!ownerIsCurrent()) return failure("Account or team changed. Local changes were retained.");
      if (!result.ok) {
        if (result.status === 409 && result.payload?.conflicts?.length) {
          // A fresh read updates the view; it never authorizes overwriting a colleague.
          const latest = typeof getLatest === "function" ? await getLatest(expected).catch(() => null) : null;
          if (!ownerIsCurrent()) return failure("Account or team changed. Local changes were retained.");
          const freshRevision = Number(latest?.metadata?.revision);
          if (typeof latest?.value === "string" && Number.isInteger(freshRevision) && freshRevision >= 1 &&
              freshRevision >= Number(result.payload.currentRevision) && freshRevision >= revision) {
            observe(latest.value, latest.metadata);
            metadata = { ...latest.metadata, revision };
          }
          await store.put({ ...row, status: "review", conflicts: result.payload.conflicts });
          blocked.push(row.change); issue = "Local changes need review"; continue;
        }
        if (!result.ok) return failure(result.payload?.reason || "Saved locally; central sync pending", { status: result.status, durablePending: true });
      }
      const receipt = result.payload?.sessionChange;
      const receiptRevision = Number(result.payload?.metadata?.revision);
      if (receipt?.id !== row.change.id || receipt?.date !== row.change.date || !receipt?.value?.session ||
          !Number.isSafeInteger(receiptRevision) || receiptRevision < 1) {
        return failure("Central save was not confirmed. Local changes were retained.", { durablePending: true });
      }
      if (receiptRevision >= revision) baseline = replaceSessionDate(baseline, receipt.date, receipt.value);
      metadata = { ...result.payload.metadata, revision: Math.max(revision, receiptRevision) };
      revision = Math.max(revision, Number(metadata.revision));
      viewVersion++;
      // Central acceptance and durable local recovery are separate outcomes.
      // Never discard the journal unless the exact accepted date is committed.
      try {
        await store.acknowledge(row, receipt, result.payload.metadata, { owner, isCurrent: ownerIsCurrent });
      } catch {
        if (!ownerIsCurrent()) return failure("Account or team changed. Local changes were retained.");
        // A peer tab can stage more work while the receipt or IDB commit is held.
        // A failed read cannot establish that the receipt covers all pending work.
        const retained = !issue && index === rows.length - 1 ? await store.list(expected).catch(() => null) : null;
        if (!ownerIsCurrent()) return failure("Account or team changed. Local changes were retained.");
        const unresolved = retained?.filter((item) => item.status !== "archived");
        const allPendingAcknowledged = unresolved?.length === 1 && unresolved[0].status === "pending" && unresolved[0].change.id === row.change.id;
        let reason = "Offline recovery copy could not be updated.";
        if (issue) reason = "Local changes need review. A separate edit was saved centrally, but its offline copy could not be updated.";
        else if (!allPendingAcknowledged) reason = "A change was saved centrally. The offline copy could not be updated. Check other changes for pending sync.";
        return failure(reason,
          { centralAcknowledged: true, allPendingAcknowledged, localCheckpointPending: true, durablePending: true,
            acknowledgedOperationId: row.change.id, value: JSON.stringify(baseline), metadata });
      }
      if (!ownerIsCurrent()) return failure("Account or team changed. Local changes were retained.");
    }
    if (issue) {
      onReview();
      return failure(issue, { reviewRequired: true, durablePending: true, value: JSON.stringify(baseline), metadata });
    }
    return { ok: true, value: JSON.stringify(baseline), metadata, revision, ...(rows.length ? { centralAcknowledged: true } : {}) };
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
      let edited = desired;
      const draftIndex = drafts.findIndex((draft) => draft.scope === expected && draft.token === options.draftToken);
      if (draftIndex >= 0) {
        edited = copy(baseAtEdit);
        for (const draft of drafts.slice(0, draftIndex + 1).filter((item) => item.scope === expected)) {
          for (const change of draft.changes) edited = applySessionDateChange(edited, change, { preferLocalOnConflict: true }).state;
        }
      }
      const changes = createSessionDateChanges(baseAtEdit, edited, makeId);
      for (const change of changes) {
        // Repeated retry of the same edit must not add another journal row.
        if (sameSessionValue(sessionDateValue(logicalBase, change.date), change.after)) continue;
        const previous = pending.filter((row) => row.writer === writer && row.status !== "archived" && row.change.date === change.date).at(-1);
        if (previous && typeof options.previousValue !== "string") change.before = previous.change.after;
        await store.put({ change, writer, scope: expected, status: "pending", createdAt: Date.now() * 1000 + sequence++ });
      }
      unstaged.delete(expected);
      finishStagingDraft(expected, options.draftToken);
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
    const work = serial.then(async () => {
      await staged;
      if (!current(expected) || !baseline) return failure("Central training is still loading. Local changes were retained.");
      let result;
      do {
        flight.recheck = false;
        const next = await drain(expected);
        if (result?.metadata && result.metadata.revision === next.metadata?.revision) {
          next.metadata = { ...result.metadata, ...next.metadata };
          if (next.ok && result.centralAcknowledged) next.centralAcknowledged = true;
        }
        result = next;
        // A joined trigger may represent another tab's newly durable row.
        // Reread after success/review, never multiply a failed network attempt.
      } while (flight.recheck && (result.ok || result.reviewRequired));
      return result;
    }).catch((error) => failure(error?.message || "Saved locally; central sync pending", { durablePending: true }))
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
    return Boolean(current(expected) && baseline && !unstaged.has(expected) && !drafts.some((draft) => draft.scope === expected) && rows.every((row) => row.status === "archived"));
  }

  function resolve(id, keepLocal, expectedCentral) {
    const expected = getScope();
    const work = serial.then(async () => {
      if (!current(expected) || !baseline) return failure("Account or team changed.");
      const row = (await store.list(expected)).find((item) => item.change.id === id && item.status === "review");
      if (!current(expected)) return failure("Account or team changed.");
      if (!row) return failure("This review has changed. Open it again.");
      const central = sessionDateValue(baseline, row.change.date);
      if (!sameSessionValue(central, expectedCentral)) return failure("Training changed since review. Review the latest version.");
      if (!keepLocal) {
        await store.archiveReviewed(row);
        if (!current(expected)) return failure("Account or team changed.");
        viewVersion++;
        // Keeping the server version is local-only, not permission to drain other edits.
        return { ok: true };
      }
      if (keepLocal) {
        // Resolve only this edit, never replace unrelated changes accepted since it.
        const merged = applySessionDateChange(baseline, row.change, { preferLocalOnConflict: true });
        const change = { ...row.change, id: makeId ? makeId() : globalThis.crypto.randomUUID(), before: central,
          after: sessionDateValue(merged.state, row.change.date) };
        await store.put({ change, scope: expected, status: "pending", createdAt: Date.now() * 1000 + sequence++ });
      }
      await store.put({ ...row, status: "archived", resolvedAt: new Date().toISOString() });
      viewVersion++;
      return drain(expected);
    }).catch((error) => failure(error.message));
    serial = work.then(() => {});
    return work;
  }
  async function readAcceptedBase() {
    const expected = getScope(), owner = getWorkingScope();
    if (!expected || !owner) return null;
    const value = await store.readAcceptedBase(expected, owner);
    return expected === getScope() && owner === getWorkingScope() ? value : null;
  }
  return { observe, stage, replay, save, pendingState, reviews, resolve, isSettled, rememberDraft, workingCopy, project, readAcceptedBase,
    isProjectionCurrent: (view) => Boolean(view && current(view.scope) && view.version === viewVersion),
    isReady: () => Boolean(current(getScope()) && baseline),
    centralValue: () => current(getScope()) && baseline ? JSON.stringify(baseline) : null,
  };
}
