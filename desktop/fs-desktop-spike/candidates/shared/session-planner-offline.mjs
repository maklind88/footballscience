const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UI_STATES = new Set(["synced", "pending", "saving", "conflict", "blocked", "revoked", "error"]);

function requiredObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value;
}

function requiredUuid(value, label) {
  const normalized = String(value || "").trim();
  if (!UUID_PATTERN.test(normalized)) throw new TypeError(`${label} must be a UUID.`);
  return normalized;
}

function validSlice(value) {
  const slice = requiredObject(value, "Selected session");
  requiredObject(slice.session, "Selected session record");
  if (!Array.isArray(slice.blocks) || !Number.isSafeInteger(slice.session.revision)) {
    throw new TypeError("Selected session projection is incomplete.");
  }
  return slice;
}

function validSyncStatus(value) {
  const status = requiredObject(value, "Session synchronization status");
  if (!UI_STATES.has(status.state) || status.state === "saving" || status.state === "conflict" || status.state === "error") {
    throw new TypeError("Native synchronization status is invalid.");
  }
  return status;
}

function cleanTitle(value) {
  const title = String(value || "").trim();
  if (!title || title.length > 120) throw new TypeError("Session title must contain 1-120 characters.");
  return title;
}

function cleanDuration(value) {
  const duration = Number(value);
  if (!Number.isSafeInteger(duration) || duration < 1 || duration > 240) {
    throw new TypeError("Block duration must be a whole number from 1 to 240 minutes.");
  }
  return duration;
}

export function classifySessionMutationFailure(error) {
  const message = String(error?.message || error || "Session operation failed.");
  if (/stale base revision|revision conflict|conflict/i.test(message)) {
    return Object.freeze({ state: "conflict", message: "Conflict detected. Reload the authoritative session before editing again." });
  }
  if (/revok|tenant-denied|account-switched|authorization|offline lease|partition is locked/i.test(message)) {
    return Object.freeze({ state: "revoked", message: "Access is revoked or expired. Local pending work remains preserved." });
  }
  return Object.freeze({ state: "error", message: "The edit could not be saved locally. No partial change was accepted." });
}

export function sessionSyncPresentation(state, pendingOperationCount = 0) {
  const pending = Number.isSafeInteger(pendingOperationCount) ? pendingOperationCount : 0;
  switch (state) {
    case "synced": return Object.freeze({ state, label: "Synced", detail: "No local operations are waiting." });
    case "pending": return Object.freeze({ state, label: "Saved locally · pending sync", detail: `${pending} operation${pending === 1 ? "" : "s"} waiting safely on this device.` });
    case "saving": return Object.freeze({ state, label: "Saving locally…", detail: "The projection and outbox are being committed atomically." });
    case "conflict": return Object.freeze({ state, label: "Conflict", detail: "The server revision must be reviewed before this edit can continue." });
    case "blocked": return Object.freeze({ state, label: "Sync blocked", detail: "Local pending work is preserved and will not be uploaded." });
    case "revoked": return Object.freeze({ state, label: "Access revoked", detail: "Local pending work is preserved and hidden from synchronization." });
    default: return Object.freeze({ state: "error", label: "Local save failed", detail: "The prior durable session state is unchanged." });
  }
}

export class SessionPlannerOfflineController {
  #bridge;
  #context;
  #clientInstanceId;
  #uuidFactory;
  #slice;
  #syncStatus;
  #uiState;
  #feedback = "";
  #busy = false;

  constructor({ bridge, context, clientInstanceId, initialSlice, initialSyncStatus, uuidFactory } = {}) {
    if (!bridge || typeof bridge.applySessionOperation !== "function"
      || typeof bridge.readSelectedSession !== "function"
      || typeof bridge.getSessionSyncStatus !== "function") {
      throw new TypeError("A typed desktop session bridge is required.");
    }
    this.#bridge = bridge;
    this.#context = Object.freeze({ ...requiredObject(context, "Session context") });
    this.#clientInstanceId = requiredUuid(clientInstanceId, "Client instance ID");
    this.#uuidFactory = typeof uuidFactory === "function" ? uuidFactory : () => globalThis.crypto.randomUUID();
    this.#slice = validSlice(initialSlice);
    this.#syncStatus = validSyncStatus(initialSyncStatus);
    this.#uiState = this.#syncStatus.state;
  }

  snapshot() {
    return Object.freeze({
      slice: this.#slice,
      syncStatus: this.#syncStatus,
      presentation: sessionSyncPresentation(this.#uiState, this.#syncStatus.pendingOperationCount),
      feedback: this.#feedback,
      busy: this.#busy,
    });
  }

  async refresh() {
    const [slice, syncStatus] = await Promise.all([
      this.#bridge.readSelectedSession(this.#context),
      this.#bridge.getSessionSyncStatus(this.#context),
    ]);
    this.#slice = validSlice(slice);
    this.#syncStatus = validSyncStatus(syncStatus);
    this.#uiState = this.#syncStatus.state;
    return this.snapshot();
  }

  async renameSession(title) {
    try {
      return await this.#apply({ operationType: "session.rename", title: cleanTitle(title) });
    } catch (error) {
      return this.#recordFailure(error);
    }
  }

  async setBlockDuration(blockId, durationMinutes) {
    try {
      const normalizedBlockId = requiredUuid(blockId, "Block ID");
      if (!this.#slice.blocks.some((block) => block.id === normalizedBlockId)) {
        throw new TypeError("Block is outside the selected session.");
      }
      return await this.#apply({
        operationType: "block.duration.set",
        blockId: normalizedBlockId,
        durationMinutes: cleanDuration(durationMinutes),
      });
    } catch (error) {
      return this.#recordFailure(error);
    }
  }

  async #apply(operation) {
    if (this.#busy) return this.snapshot();
    this.#busy = true;
    this.#uiState = "saving";
    this.#feedback = "";
    try {
      const operationId = requiredUuid(this.#uuidFactory(), "Operation ID");
      const receipt = await this.#bridge.applySessionOperation({
        operationId,
        operationVersion: 1,
        clientInstanceId: this.#clientInstanceId,
        sessionId: this.#slice.session.id,
        baseRevision: this.#slice.session.revision,
        context: this.#context,
        operation,
      });
      await this.refresh();
      this.#feedback = `Revision ${receipt.resultingRevision} is durable on this device.`;
    } catch (error) {
      this.#recordFailure(error);
    } finally {
      this.#busy = false;
    }
    return this.snapshot();
  }

  #recordFailure(error) {
    const failure = classifySessionMutationFailure(error);
    this.#uiState = failure.state;
    this.#feedback = failure.message;
    return this.snapshot();
  }
}
