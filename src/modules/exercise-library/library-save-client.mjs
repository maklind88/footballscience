import { applyLibraryChange, createLibraryChange, libraryRecords, librarySaveKeys } from "./library-save-protocol.mjs";
import { createLibrarySaveStore } from "./library-save-store.mjs";

export function createLibrarySaveClient({ getScope, canWrite, send, store = createLibrarySaveStore(),
  makeId = () => crypto.randomUUID(), onState = () => {} }) {
  let scope = "", serial = Promise.resolve(), lastCreatedAt = 0;
  const baselines = new Map(), deniedReads = new Set();
  const current = expected => Boolean(expected) && expected === getScope();
  const failed = (reason, extra = {}) => ({ saved: false, reason, ...extra });
  function activate(expected) {
    if (scope !== expected) { baselines.clear(); deniedReads.clear(); scope = expected; }
  }
  function publish(key, result, expected) { if (current(expected)) onState(key, result); }

  async function project(key, expected = getScope()) {
    if (!current(expected)) return null;
    activate(expected);
    const baseline = baselines.get(key);
    if (!baseline) return null;
    const rows = await store.list(expected).catch(() => null);
    if (!current(expected)) return null;
    if (!rows) return { value: baseline.value, revision: baseline.revision, pending: null, storageUnavailable: true, conflicts: [] };
    let value = baseline.value; const conflicts = [];
    for (const row of rows.filter(row => row.key === key)) {
      if (row.status === "review") { conflicts.push(row.change.id); continue; }
      const applied = applyLibraryChange(value, row.change);
      if (applied.ok) value = applied.value;
      else conflicts.push(row.change.id);
    }
    return { value, revision: baseline.revision, pending: rows.some(row => row.key === key), conflicts };
  }

  async function observe(key, value, revision, expected = getScope()) {
    if (!current(expected) || !librarySaveKeys.includes(key) || !Number.isSafeInteger(revision) || revision < 0) return null;
    libraryRecords(value); activate(expected); deniedReads.delete(key);
    const previous = baselines.get(key);
    if (!previous || revision >= previous.revision) baselines.set(key, { value, revision });
    let cached = false;
    try { cached = (await store.cache(expected, key, value, revision)).cached; } catch {}
    if (!current(expected)) return null;
    const view = await project(key, expected);
    publish(key, { ...view, cached, serverBacked: true }, expected);
    return view;
  }

  async function loadOffline(key, expected = getScope()) {
    if (!current(expected)) return null;
    activate(expected);
    if (deniedReads.has(key)) return null;
    if (store.mayReadOffline && !await store.mayReadOffline(expected, key).catch(() => false)) return null;
    const row = await store.baseline(expected, key).catch(() => null);
    if (!current(expected) || deniedReads.has(key) || !row) return null;
    libraryRecords(row.value);
    // An offline baseline is an explicitly stale view, never a fresh server read.
    if (!baselines.has(key)) baselines.set(key, { value: row.value, revision: row.revision });
    const view = await project(key, expected);
    publish(key, { ...view, cached: true, offline: true }, expected);
    return view;
  }

  async function transmit(row, expected) {
    if (!current(expected) || deniedReads.has(row.key) || !canWrite(row.key)) return failed("Account, team or edit permission changed. Local work was retained.");
    let result = await Promise.resolve().then(() => send(row.key, row.change, baselines.get(row.key)?.revision ?? row.baseRevision, expected)).catch(() => ({ ok: false }));
    if (!current(expected)) return failed("Account or team changed. Local work was retained.", { staleContext: true });
    // A CAS race can retry this same immutable record change, never a replacement document.
    if (!result?.ok && result?.status === 409 && !result.conflicts?.length && Number.isSafeInteger(result.currentRevision)) {
      result = await Promise.resolve().then(() => send(row.key, row.change, result.currentRevision, expected)).catch(() => ({ ok: false }));
      if (!current(expected)) return failed("Account or team changed. Local work was retained.", { staleContext: true });
    }
    if (deniedReads.has(row.key)) return failed("Library read access was denied. Local work was retained.", { denied: true });
    if (!result?.ok) return failed(result?.reason || "Central saving is unavailable.", {
      conflict: result?.status === 409, denied: result?.status === 401 || result?.status === 403,
      blocked: result?.status >= 400 && result.status < 500 && ![408, 409, 429].includes(result.status),
    });
    const revision = result.metadata?.revision;
    if (result.libraryChange?.id !== row.change.id || typeof result.value !== "string" || !Number.isSafeInteger(revision) || revision < 1) {
      return failed("The server did not confirm this library change. Local work was retained.");
    }
    const confirmed = applyLibraryChange(result.value, row.change);
    if (!confirmed.ok || !confirmed.unchanged) return failed("The server returned a different library version. Local work was retained.", { conflict: true });
    const previous = baselines.get(row.key);
    if (!previous || revision >= previous.revision) baselines.set(row.key, { value: result.value, revision });
    let cached = false, cleanupPending = false;
    try { cached = (await store.cache(expected, row.key, result.value, revision, row.id ? row : null)).cached; }
    catch { cleanupPending = Boolean(row.id); }
    if (!current(expected)) return failed("Account or team changed. Local work was retained.", { staleContext: true });
    return { saved: true, centrallySaved: true, cached, cleanupPending, value: result.value };
  }

  function save(key, beforeValue, afterValue) {
    const expected = getScope();
    let change;
    try { change = createLibraryChange(key, beforeValue, afterValue, makeId()); }
    catch (error) { return Promise.resolve(failed(error.message)); }
    const work = serial.then(async () => {
      if (!current(expected) || !canWrite(key)) return failed("Library editing is unavailable for this account.");
      activate(expected);
      if (!baselines.has(key)) return failed("Open the central library before editing. Existing local copies were retained.");
      if (!change.records.length) {
        const view = await project(key, expected);
        return view ? { saved: true, centrallySaved: !view.pending, ...view } : failed("Account or team changed.");
      }
      let row = { scope: expected, key, change, baseRevision: baselines.get(key).revision, createdAt: (lastCreatedAt = Math.max(Date.now(), lastCreatedAt + 1)) };
      let durable = false;
      try { row = await store.putPending(row); durable = true; } catch {}
      if (!current(expected)) return failed("Account or team changed. Local work was retained.", { staleContext: true });
      const result = await transmit(row, expected);
      if (result.staleContext) return result;
      const view = await project(key, expected);
      if (!current(expected)) return failed("Account or team changed.", { staleContext: true });
      if (result.saved) {
        const saved = { ...result, value: view?.value ?? result.value, pending: view?.pending ?? result.cleanupPending, storageUnavailable: Boolean(view?.storageUnavailable) };
        publish(key, saved, expected); return saved;
      }
      const retained = { ...result, ...(!durable ? { reason: "Neither local nor central saving was confirmed. Keep the editor open and retry." } : {}), saved: durable && !result.conflict && !result.denied && !result.blocked,
        locallySaved: durable, centrallySaved: false, pending: durable, value: view?.value ?? beforeValue };
      // Failed local + failed central storage leaves the editor open with its draft.
      publish(key, retained, expected); return retained;
    }).catch(() => failed("Library saving failed. Keep this page open and export your work."));
    serial = work.then(() => {}); return work;
  }

  function replay() {
    const expected = getScope();
    const work = serial.then(async () => {
      if (!current(expected)) return;
      activate(expected);
      const rows = await store.list(expected);
      const blockedRecords = new Set();
      for (const row of rows) {
        if (row.status === "review") { for (const record of row.change.records) blockedRecords.add(row.key + "\0" + record.id); continue; }
        if (row.change.records.some(record => blockedRecords.has(row.key + "\0" + record.id))) continue;
        if (!current(expected) || !baselines.has(row.key)) return;
        const result = await transmit(row, expected);
        const view = current(expected) ? await project(row.key, expected) : null;
        publish(row.key, { ...result, ...view }, expected);
        if (result.conflict) { for (const record of row.change.records) blockedRecords.add(row.key + "\0" + record.id); }
        else if (!result.saved) return;
      }
    }).catch(() => {});
    serial = work; return work;
  }

  async function resolvePending(row, choice, expectedCentralValue) {
    const expected = getScope();
    if (!current(expected) || row.scope !== expected || !canWrite(row.key) || !baselines.has(row.key)) return failed("Account or edit permission changed.");
    if (expectedCentralValue !== undefined && baselines.get(row.key).value !== expectedCentralValue) return failed("The central library changed. Reopen this review before choosing a version.");
    if (!["central", "local"].includes(choice)) return failed("Choose a version to keep.");
    if (choice === "local") {
      const before = baselines.get(row.key).value;
      const records = new Map(libraryRecords(before).map(record => [record.id, record]));
      for (const record of row.change.records) records.set(record.id, record.after);
      const result = await save(row.key, before, JSON.stringify([...records.values()]));
      if (!result.saved || !current(expected)) return result;
    }
    await store.archivePending(row);
    if (!current(expected)) return failed("Account changed. The reviewed version was archived.");
    const view = await project(row.key, expected);
    publish(row.key, { ...view, serverBacked: true }, expected);
    return { saved: true, ...view };
  }

  async function denyRead(key, expected = getScope()) {
    if (!current(expected) || !librarySaveKeys.includes(key)) return;
    activate(expected); deniedReads.add(key); baselines.delete(key);
    // Only an explicit server read denial reaches here. Original work is never
    // deleted or filtered out of its owner's recovery export.
    await store.denyRead(expected, key).catch(() => {});
    const retained = await store.list(expected).catch(() => null);
    publish(key, { value: "[]", readDenied: true, pending: retained ? retained.some(row => row.key === key) : null, storageUnavailable: !retained, reason: "Library access was denied. Retained work remains available in your recovery export." }, expected);
  }

  return { observe, loadOffline, project, save, replay, store, resolvePending, denyRead,
    centralValue: key => current(scope) ? baselines.get(key)?.value : undefined,
    isReady: key => current(scope) && baselines.has(key),
    async exportRecovery() {
      const expected = getScope();
      if (!expected) throw new Error("Sign in to export your library recovery copies.");
      const exported = await store.exportScope(expected);
      if (!current(expected)) throw new Error("Account changed during export.");
      return exported;
    },
  };
}
