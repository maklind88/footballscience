import { createRecoveryDraftStore } from './snapshot-recovery-draft-store.mjs';
import { prepareRecoveryDraft, verifyRecoveryDraft, recoveryDraftModuleKey } from './snapshot-recovery-draft-format.mjs';

export function createSnapshotRecoveryDrafts({ indexedDB, reader, getAccess, signal, storeOptions = {} }) {
  const store = createRecoveryDraftStore({ ...storeOptions, indexedDB });
  const access = () => {
    try {
      const a = getAccess();
      if (!a?.scope || !a.generation || a.canPrepare !== true || !(a.allowedKeys instanceof Set) ||
          !a.allowedKeys.has(recoveryDraftModuleKey) || signal?.aborted) return null;
      return { ...a, allowedKeys: new Set(a.allowedKeys), token: JSON.stringify([a.scope, a.generation, [...a.allowedKeys].sort()]) };
    } catch { return null; }
  };
  function session() {
    const a = access(); if (!a) throw new Error('Recovery draft access changed');
    const current = () => access()?.token === a.token;
    const check = () => { if (!current()) throw new Error('Recovery draft access changed'); };
    return { a, current, check, signal };
  }
  async function prepare({ source, id, expected }) {
    const s = session(), expectedText = JSON.stringify(expected);
    const result = await reader.read({ source, id }); s.check();
    if (result.status !== 'ok' || JSON.stringify(result.envelope) !== expectedText) throw new Error('The source copy changed or could not be verified');
    const row = await prepareRecoveryDraft(result.envelope, s.a); s.check();
    const saved = await store.retain(row, s); s.check();
    return saved;
  }
  async function list() {
    const s = session(), rows = await store.list(s.a.scope, s); s.check();
    return (rows || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function read(id) {
    const s = session(), row = await store.read(id, s.a.scope, s); s.check();
    if (!row) throw new Error('Recovery draft unavailable');
    const verified = await verifyRecoveryDraft(row, s.a.scope); s.check();
    return verified;
  }
  return { prepare, list, read };
}
