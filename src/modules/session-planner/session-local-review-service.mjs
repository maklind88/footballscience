import { describeSessionDifferences, replaceSessionDate, sessionDateValue, sameSessionValue } from "./session-save-protocol.mjs";
import { getSessionPlannerQuotaSnapshotId } from "./session-planner-recovery-controller.mjs";

export function createSessionLocalReviewService({ openDatabase, getContext, getCentralValue, save, storageKey = "football-session-planner-v3" }) {
  const valid = (context) => context?.scope && context.scope === getContext()?.scope && getContext()?.ready;
  async function list() {
    const context = getContext();
    if (!valid(context)) return [];
    const db = await openDatabase();
    const snapshots = await new Promise((resolve, reject) => {
      const request = db.transaction("snapshots", "readonly").objectStore("snapshots").getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    if (!valid(context)) return [];
    const central = JSON.parse(await getCentralValue());
    if (!valid(context)) return [];
    const prefix = getSessionPlannerQuotaSnapshotId(storageKey, context);
    const rows = [];
    for (const snapshot of snapshots) {
      if (!snapshot.id?.startsWith(prefix) || snapshot.recovery?.scope !== context.scope ||
          !["session-planner-quota-fallback", "session-planner-recovery-review"].includes(snapshot.reason)) continue;
      const raw = snapshot.storage?.[storageKey];
      if (typeof raw !== "string") continue;
      const state = JSON.parse(raw);
      for (const date of Object.keys(state.sessions || {})) {
        if (snapshot.reviewedDates?.[date]) continue;
        const before = sessionDateValue(central, date);
        const after = sessionDateValue(state, date);
        const differences = describeSessionDifferences(before, after, date);
        if (!differences.length) continue;
        if (rows.some((row) => row.date === date && sameSessionValue(row.local, after))) continue;
        rows.push({ id: snapshot.id, date, central: before, local: after, differences, scope: context.scope, raw });
      }
    }
    return rows;
  }

  async function resolve(row, keepLocal) {
    const context = getContext();
    if (!valid(context) || context.scope !== row.scope) return { ok: false, reason: "Account or team changed." };
    const central = JSON.parse(await getCentralValue());
    if (!valid(context) || !sameSessionValue(sessionDateValue(central, row.date), row.central)) return { ok: false, reason: "Training changed. Open the review again." };
    if (keepLocal) {
      const local = JSON.parse(JSON.stringify(row.local));
      // Explicit review still cannot silently resurrect centrally deleted exercises.
      local.tombstones = { ...local.tombstones, ...row.central.tombstones };
      local.session.blocks = local.session.blocks.filter((block) => !local.tombstones[block.id]);
      const ids = new Set(local.session.blocks.map((block) => block.id));
      for (const block of row.central.session?.blocks || []) {
        if (!ids.has(block.id)) local.tombstones[block.id] = new Date().toISOString();
      }
      const result = await save(JSON.stringify(replaceSessionDate(central, row.date, local)));
      if (!result.ok) return result;
    }
    if (!valid(context)) return { ok: false, reason: "Account or team changed." };
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("snapshots", "readwrite");
      const store = tx.objectStore("snapshots");
      const request = store.getAll();
      request.onsuccess = () => {
        if (!valid(context)) { tx.abort(); return; }
        for (const snapshot of request.result || []) {
          if (snapshot.recovery?.scope === row.scope && snapshot.storage?.[storageKey] === row.raw) {
            store.put({ ...snapshot, reviewedDates: { ...snapshot.reviewedDates, [row.date]: new Date().toISOString() } });
          }
        }
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Review was cancelled."));
    });
    return { ok: true };
  }
  return { list, resolve };
}
