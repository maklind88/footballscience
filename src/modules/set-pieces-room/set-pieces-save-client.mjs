import { createOfflineOperationJournal } from "../../core/offline-operation-journal.mjs";
import {
  createSetPiecePlayChanges,
  replaceSetPiecePlay,
  sameSetPieceValue,
  setPiecePlayValue,
} from "./set-pieces-save-protocol.mjs";

const moduleId = "set-pieces-room";
const storageKey = "football-set-pieces-room-v1";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function failure(reason, extra = {}) {
  return { ok: false, reason, ...extra };
}

export function createSetPiecesSaveClient({
  getScope,
  send,
  journal = createOfflineOperationJournal(),
  makeId,
  onReview = () => {},
} = {}) {
  let baseline = null;
  let revision = 0;
  let scope = "";
  let serial = Promise.resolve();
  let staging = Promise.resolve();
  let sequence = 0;
  const writer = makeId ? makeId() : globalThis.crypto.randomUUID();
  const current = (expected) => expected && expected === getScope() && expected === scope;

  function observe(value, metadata = {}) {
    const nextScope = getScope();
    if (!nextScope) return;
    if (scope !== nextScope) {
      baseline = null;
      revision = 0;
      scope = nextScope;
    }
    const nextRevision = Number(metadata.revision || 0);
    if (nextRevision < revision) return;
    baseline = JSON.parse(value);
    revision = nextRevision;
  }

  async function pendingRows(expected) {
    return (await journal.list(expected)).filter((row) => row.moduleId === moduleId && row.key === storageKey);
  }

  function applyRows(state, rows, expectedWriter = "") {
    return rows.reduce((next, row) => {
      if (row.type !== "play-change" || (expectedWriter && row.payload?.writer !== expectedWriter)) return next;
      const change = row.payload?.change;
      return change ? replaceSetPiecePlay(next, change.playId, change.after) : next;
    }, clone(state));
  }

  function stage(value, options = {}) {
    const expected = getScope();
    const desired = JSON.parse(value);
    const baseAtEdit = typeof options.previousValue === "string"
      ? JSON.parse(options.previousValue)
      : baseline && clone(baseline);
    const work = staging.then(async () => {
      if (!current(expected) || !baseAtEdit) {
        return failure("Central Set Pieces data is still loading. Local changes were retained.");
      }
      const rows = await pendingRows(expected);
      if (!current(expected)) return failure("Account or team changed. Local changes were retained.");
      const logicalBase = applyRows(baseAtEdit, rows, writer);
      const changes = createSetPiecePlayChanges(logicalBase, desired, makeId);
      for (const change of changes) {
        const duplicate = rows.some((row) => (
          row.status !== "applied" && row.payload?.writer === writer &&
          row.payload?.change?.playId === change.playId &&
          sameSetPieceValue(row.payload.change.after, change.after)
        ));
        if (duplicate) continue;
        await journal.put({
          id: change.id,
          scope: expected,
          moduleId,
          key: storageKey,
          type: "play-change",
          status: "pending",
          createdAt: Date.now() * 1000 + sequence++,
          baseRevision: revision,
          payload: { change, writer },
        });
      }
      return { ok: true };
    }).catch((error) => failure(error?.message || "Local Set Pieces save storage failed. Keep this page open."));
    staging = work.then(() => {});
    return work;
  }

  async function drain(expected) {
    const rows = await pendingRows(expected);
    const blockedPlayIds = new Set();
    let metadata = { revision };
    let needsReview = false;
    for (const row of rows) {
      if (!current(expected)) return failure("Account or team changed. Local changes were retained.");
      const change = row.payload?.change;
      if (!change) continue;
      if (row.status === "review" || blockedPlayIds.has(change.playId)) {
        if (row.status !== "review") await journal.updateStatus(row.id, expected, "review");
        blockedPlayIds.add(change.playId);
        needsReview = true;
        continue;
      }
      let result = await send(change, revision, expected);
      if (!current(expected)) return failure("Account or team changed. Local changes were retained.");
      if (!result.ok && result.status === 409 && !result.payload?.conflicts?.length) {
        result = await send(change, result.payload?.currentRevision || revision, expected);
      }
      if (!current(expected)) return failure("Account or team changed. Local changes were retained.");
      if (!result.ok) {
        if (result.status === 409 && result.payload?.conflicts?.length) {
          await journal.updateStatus(row.id, expected, "review");
          blockedPlayIds.add(change.playId);
          needsReview = true;
          continue;
        }
        return failure(result.payload?.reason || "Saved locally; central Set Pieces sync is pending.", {
          status: result.status,
          durablePending: true,
        });
      }
      const receipt = result.payload?.setPieceChange;
      const nextRevision = Number(result.payload?.metadata?.revision || 0);
      if (receipt?.id !== change.id || receipt?.playId !== change.playId || !nextRevision) {
        return failure("Central Set Pieces save was not confirmed. Local changes were retained.", { durablePending: true });
      }
      if (nextRevision >= revision) baseline = replaceSetPiecePlay(baseline, receipt.playId, receipt.value);
      revision = Math.max(revision, nextRevision);
      metadata = { ...result.payload.metadata, revision };
      await journal.updateStatus(row.id, expected, "applied");
    }
    if (needsReview) {
      onReview();
      return failure("A teammate changed the same set piece. Your version is safe and needs review.", {
        reviewRequired: true,
        durablePending: true,
        value: JSON.stringify(baseline),
        metadata,
      });
    }
    return { ok: true, value: JSON.stringify(baseline), metadata, revision };
  }

  function replay() {
    const expected = getScope();
    const work = serial.then(async () => {
      await staging;
      if (!current(expected) || !baseline) {
        return failure("Central Set Pieces data is still loading. Local changes were retained.");
      }
      return drain(expected);
    }).catch((error) => failure(error?.message || "Saved locally; central Set Pieces sync is pending.", { durablePending: true }));
    serial = work.then(() => {});
    return work;
  }

  async function save(value, options = {}) {
    const staged = await stage(value, options);
    return staged.ok ? replay() : staged;
  }

  async function pendingState() {
    const expected = getScope();
    if (!current(expected) || !baseline) return null;
    const rows = await pendingRows(expected);
    return rows.length ? JSON.stringify(applyRows(baseline, rows)) : null;
  }

  async function reviews() {
    const expected = getScope();
    if (!current(expected) || !baseline) return [];
    return (await pendingRows(expected)).filter((row) => row.status === "review").map((row) => ({
      ...row,
      central: setPiecePlayValue(baseline, row.payload?.change?.playId),
    }));
  }

  async function isSettled() {
    const expected = getScope();
    await staging;
    return Boolean(current(expected) && baseline && !(await pendingRows(expected)).length);
  }

  return Object.freeze({ isSettled, observe, pendingState, replay, reviews, save, stage });
}
