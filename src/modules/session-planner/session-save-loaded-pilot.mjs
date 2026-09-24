import { createSessionSaveQueuedPilot } from "./session-save-queued-pilot.mjs";
import { sessionSavePilotScope, sessionSavePilotAttempt } from "./session-save-pilot-client.mjs";
import { verifySessionInitialSnapshot } from "./session-save-snapshot.mjs";
import { applySessionDateChange } from "./session-save-protocol.mjs";

const KEY = "football-session-planner-v3";
const unavailable = (reason = "Fresh central training is required. Local changes were retained.", status = 409) =>
  ({ ok: false, status, reason, durablePending: true });

// Unwired editor pilot. Reads never acknowledge, rebase, adopt or deliver rows.
// A module must consume view.value, not render the central snapshot over drafts.
export function createSessionSaveLoadedPilot({ getContext, request, store, makeId, onReview } = {}) {
  if (typeof getContext !== "function" || typeof request !== "function" || store?.protocol !== "sessions-queue-v2") {
    throw new Error("Verified context, bounded transport and versioned queue are required.");
  }
  let session = null, generation = 0;
  const ready = () => Boolean(session?.accepted && session.owner === sessionSavePilotAttempt(getContext()));
  const current = (owner, version) => owner && owner === sessionSavePilotAttempt(getContext()) && version === generation;
  function remember() {
    const snapshot = ready() ? session.client.centralSnapshot() : null;
    if (snapshot && snapshot.metadata.revision >= (session.floor?.metadata.revision || 0)) session.floor = snapshot;
  }

  async function view() {
    if (!ready()) return unavailable();
    const owner = session.owner, version = generation, snapshot = session.client.centralSnapshot();
    const scope = sessionSavePilotScope(getContext());
    const pending = (await store.list(scope)).filter((row) => row.status !== "archived");
    const confirmed = await store.confirmedRevision(scope);
    if (!ready() || !current(owner, version)) return unavailable();
    if (!snapshot || confirmed > snapshot.metadata.revision) return unavailable("Another tab saved newer training. Refresh before continuing.");
    let state = JSON.parse(snapshot.value);
    const conflicts = [];
    for (const row of pending) {
      const merged = applySessionDateChange(state, row.change);
      if (row.status === "review" || !merged.ok) conflicts.push({ id: row.change.id, date: row.change.date });
      else state = merged.state;
    }
    return { ok: true, value: conflicts.length ? null : JSON.stringify(state), metadata: snapshot.metadata,
      pendingOperations: pending, reviewRequired: conflicts.length > 0, conflicts };
  }

  async function refresh() {
    const context = structuredClone(getContext()), owner = sessionSavePilotAttempt(context), version = ++generation;
    remember();
    if (session) session.accepted = false;
    if (!owner) return unavailable("Sign in to load training.", 401);
    if (session?.owner !== owner) {
      const next = { owner, accepted: false, floor: null };
      next.client = createSessionSaveQueuedPilot({ store, makeId, onReview, request,
        getContext: () => next.accepted && next === session && owner === sessionSavePilotAttempt(getContext()) ? getContext() : null });
      session = next;
    }
    const target = session, scope = sessionSavePilotScope(context);
    try {
      return await store.withReplay(scope, async () => {
        if (!current(owner, version)) return unavailable();
        const response = await request({ method: "POST", body: JSON.stringify({ key: KEY, teamId: context.teamId, action: "snapshot" }),
          isCurrent: () => current(owner, version) });
        if (!current(owner, version)) return unavailable();
        if (response?.ok !== true || response.payload?.ok !== true) {
          return unavailable("Fresh training could not be loaded. Local changes were retained.", response?.status || 503);
        }
        const snapshot = await verifySessionInitialSnapshot(response.payload.snapshot, { context, current: () => current(owner, version) });
        const confirmed = await store.confirmedRevision(scope);
        if (!current(owner, version)) return unavailable();
        const floor = target.floor?.metadata;
        if (snapshot.metadata.revision < Math.max(confirmed, floor?.revision || 0)
          || (snapshot.metadata.revision === floor?.revision && snapshot.metadata.hash !== floor.hash)) {
          return unavailable("Central training returned an older or inconsistent revision.");
        }
        target.accepted = true;
        target.client.observe(snapshot.value, snapshot.metadata);
        target.floor = snapshot;
        const result = await view();
        if (!current(owner, version)) return unavailable();
        return result;
      });
    } catch {
      if (current(owner, version)) target.accepted = false;
      return unavailable("Fresh training could not be verified. Local changes were retained.", 503);
    }
  }

  function guarded(method) {
    return async (...args) => {
      if (!ready()) return unavailable();
      const owner = session.owner, version = generation, target = session;
      try {
        const result = await target.client[method](...args);
        if (!ready() || !current(owner, version)) return unavailable();
        remember();
        return result;
      } catch { return unavailable("Local changes need recovery. Keep this page open.", 503); }
    };
  }
  return { refresh, view, stage: guarded("stage"), save: guarded("save"), replay: guarded("replay"),
    reviews: guarded("reviews"), resolve: guarded("resolve"),
    async isSettled() {
      if (!ready()) return false;
      const owner = session.owner, version = generation;
      const result = await session.client.isSettled();
      return Boolean(ready() && current(owner, version) && result);
    },
  };
}
