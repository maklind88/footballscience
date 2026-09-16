import { createSessionSavePilotClient } from "./session-save-pilot-client.mjs";
import { createSessionSaveQueueStore } from "./session-save-queue-store.mjs";

// Inactive, versioned pilot only. Each edit is durable immediately; only network
// delivery is quiet-period batched, with a one-second maximum typing window.
export function createSessionSaveQueuedPilot({ getContext, request, store = createSessionSaveQueueStore(), makeId, onReview } = {}) {
  if (store.protocol !== "sessions-queue-v2" || !store.withReplay || !store.replayRows) throw new Error("The versioned Sessions queue is required.");
  const client = createSessionSavePilotClient({ getContext, request, store, makeId, onReview });
  const owner = () => { const c = getContext(); return JSON.stringify(c ? [c.actorId, c.organizationId, c.clubId, c.teamId, c.epoch] : null); };
  let batch;
  const changed = () => ({ ok: false, durablePending: true, reason: "Account or team changed. Local changes were retained." });
  function flush() {
    const pending = batch; batch = null;
    if (pending) clearTimeout(pending.timer);
    const work = Promise.resolve().then(() => pending && pending.owner !== owner() ? changed() : client.replay())
      .catch(() => ({ ok: false, durablePending: true, reason: "Local changes remain pending. Retry central sync." }));
    if (pending) work.then((result) => pending.waiters.forEach((resolve) => resolve(structuredClone(result))));
    return work;
  }
  function schedule(expected) {
    if (batch && batch.owner !== expected) { clearTimeout(batch.timer); batch.waiters.forEach((resolve) => resolve(changed())); batch = null; }
    batch ||= { owner: expected, started: performance.now(), waiters: [] };
    clearTimeout(batch.timer);
    batch.timer = setTimeout(flush, Math.max(0, Math.min(250, 1000 - (performance.now() - batch.started))));
    return new Promise((resolve) => batch.waiters.push(resolve));
  }
  return { ...client, replay: flush,
    async save(value, options) {
      const expected = owner();
      const staged = await client.stage(value, options);
      if (!staged.ok) return staged;
      return expected === owner() ? schedule(expected) : changed();
    },
  };
}
