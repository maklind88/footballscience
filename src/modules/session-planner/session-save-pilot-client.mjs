import { createSessionSaveClient } from "./session-save-client.mjs";
import { validateSessionDateChange } from "./session-save-protocol.mjs";
import { encodeSessionTransport, decodeSessionTransport } from "./session-state-transport.mjs";

const KEY = "football-session-planner-v3";
const uuid = (value) => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
function identity(context) {
  if (!context || ![context.actorId, context.organizationId, context.teamId].every(uuid)
    || !(context.clubId === null || uuid(context.clubId))) return "";
  return JSON.stringify(["sessions-receipts-v1", context.actorId, context.organizationId, context.clubId, context.teamId]);
}
function attempt(context) {
  const scope = identity(context);
  return scope && typeof context.epoch === "string" && context.epoch.length > 0
    ? JSON.stringify([scope, context.epoch]) : "";
}
const failure = (reason, status = 502) => ({ ok: false, status, payload: { ok: false, reason } });

// Unwired pilot. request must be the authenticated, bounded API transport, and
// getContext must expose its verified principal plus an auth-generation epoch.
// Existing unscoped/legacy journal rows are never adopted into this namespace.
export function createSessionSavePilotClient({ getContext, request, store, makeId, onReview } = {}) {
  if (typeof getContext !== "function" || typeof request !== "function") throw new Error("Verified Sessions context and transport are required.");
  const getScope = () => { const context = getContext(); return attempt(context) ? identity(context) : ""; };
  return createSessionSaveClient({ getScope, store, makeId, onReview, retryRevisionConflict: false,
    send: async (input, baseRevision, expected) => {
      const context = structuredClone(getContext()), owner = attempt(context);
      const current = () => Boolean(owner && expected === identity(context) && owner === attempt(getContext()));
      try {
        const change = structuredClone(input);
        validateSessionDateChange(change);
        if (!current()) return failure("Account or team changed. Local changes were retained.", 409);
        const body = JSON.stringify({ key: KEY, teamId: context.teamId,
          sessionChange: await encodeSessionTransport(KEY, JSON.stringify(change)) });
        if (!current()) return failure("Account or team changed. Local changes were retained.", 409);
        if (new TextEncoder().encode(body).byteLength > 4 * 1024 * 1024) return failure("Session operation exceeds the transfer limit.", 413);
        const response = await request({ method: "POST", body, isCurrent: current });
        if (!current()) return failure("Account or team changed. Local changes were retained.", 409);
        if (response?.ok !== true) return response?.ok === false ? response : failure("Sessions response is unavailable.", 503);
        if (response.payload?.ok !== true || typeof response.payload.replayed !== "boolean") throw new Error("Invalid receipt envelope.");
        const raw = await decodeSessionTransport(KEY, response.payload.receipt);
        if (!current()) return failure("Account or team changed. Local changes were retained.", 409);
        if (typeof raw !== "string" || new TextEncoder().encode(raw).byteLength > 12 * 1024 * 1024) throw new Error("Invalid receipt size.");
        const receipt = JSON.parse(raw);
        if (receipt.schema !== "session-save-receipt-v1" || receipt.key !== KEY || receipt.id !== change.id || receipt.date !== change.date
          || receipt.actorId !== context.actorId || receipt.organizationId !== context.organizationId || receipt.teamId !== context.teamId
          || !Number.isSafeInteger(receipt.revision) || receipt.revision <= 0
          || (!response.payload.replayed && receipt.revision <= baseRevision)
          || typeof receipt.hash !== "string" || !/^[a-f0-9]{64}$/.test(receipt.hash)
          || typeof receipt.updatedAt !== "string" || !Number.isFinite(Date.parse(receipt.updatedAt))) throw new Error("Receipt identity mismatch.");
        validateSessionDateChange({ schema: change.schema, id: change.id, date: change.date,
          before: { session: null, tombstones: {} }, after: receipt.value });
        // A date receipt cannot fill gaps in a whole-calendar snapshot. Keep
        // the immutable row until authenticated hydration observes its commit.
        if (receipt.revision > baseRevision + 1 || (response.payload.replayed && receipt.revision > baseRevision)) {
          return { ...failure("Training saved centrally. Refresh central training before acknowledging this operation.", 409),
            payload: { ok: false, reason: "Training saved centrally. Fresh central training is required.", reconcileRequired: true } };
        }
        return { ok: true, payload: { sessionChange: { id: receipt.id, date: receipt.date, value: receipt.value },
          metadata: { key: KEY, organizationId: receipt.organizationId, teamId: receipt.teamId,
            revision: receipt.revision, hash: receipt.hash, updatedAt: receipt.updatedAt } } };
      } catch { return failure("Central save was not confirmed. Local changes were retained."); }
    },
  });
}
