import { activeNative, nativeBridgeAvailable, negativeProbeNative } from "./tauri-invoke.mjs";

const allowedCandidates = new Set(["bundled", "hosted"]);
const allowedBootModes = new Set(["online", "offline", "compatibility-blocked", "degraded", "auth-required", "unknown"]);
const allowedLocalOperationStates = new Set(["pending", "already-pending"]);
const allowedSyncStates = new Set(["synced", "pending", "blocked", "revoked"]);

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value;
}

function requiredText(value, label, maxLength = 120) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maxLength) throw new TypeError(`${label} must contain 1-${maxLength} characters.`);
  return normalized;
}

function boundedInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new TypeError(`${label} is outside its supported range.`);
  return number;
}

function stringArray(value, label, maxItems = 32) {
  if (!Array.isArray(value) || value.length > maxItems) throw new TypeError(`${label} must be a bounded array.`);
  return Object.freeze(value.map((entry) => requiredText(entry, label, 120)));
}

export function validateRuntimeInfo(value) {
  value = object(value, "Desktop runtime information");
  return Object.freeze({
    nativeAppVersion: requiredText(value.nativeAppVersion, "nativeAppVersion", 40),
    runtime: requiredText(value.runtime, "runtime", 40),
    localSchemaVersion: boundedInteger(value.localSchemaVersion, "localSchemaVersion", { max: 10_000 }),
    syncProtocolVersion: boundedInteger(value.syncProtocolVersion, "syncProtocolVersion", { max: 10_000 }),
    capabilities: Object.freeze([...stringArray(value.capabilities, "capability")].sort()),
  });
}

export function validateSessionAuthority(value) {
  value = object(value, "Session authority snapshot");
  const snapshot = Object.freeze({
    state: requiredText(value.state, "authority state", 60), syntheticIdentity: value.syntheticIdentity === true,
    actorId: requiredText(value.actorId, "actorId", 80), organizationId: requiredText(value.organizationId, "organizationId", 80),
    tenantId: requiredText(value.tenantId, "tenantId", 80), teamId: requiredText(value.teamId, "teamId", 80),
    partitionKey: requiredText(value.partitionKey, "partitionKey", 120),
    authEpoch: boundedInteger(value.authEpoch, "authEpoch", { min: 1 }),
    offlineLeaseExpiresAtUnixMs: boundedInteger(value.offlineLeaseExpiresAtUnixMs, "offline lease", { min: 1 }),
    canReadOffline: value.canReadOffline === true, canSync: value.canSync === true,
  });
  const encoded = JSON.stringify(value).toLowerCase();
  if (encoded.includes("accesstoken") || encoded.includes("refreshtoken")) throw new TypeError("Credential material crossed the session authority boundary.");
  return snapshot;
}

export function validateSessionContext(value) {
  value = object(value, "Session context proof");
  return Object.freeze({
    actorId: requiredText(value.actorId, "actorId", 80), organizationId: requiredText(value.organizationId, "organizationId", 80),
    partitionKey: requiredText(value.partitionKey, "partitionKey", 120), authEpoch: boundedInteger(value.authEpoch, "authEpoch", { min: 1 }),
    frontendBuildId: requiredText(value.frontendBuildId, "frontendBuildId", 80),
  });
}

export function validateSessionSlice(value) {
  value = object(value, "Offline session projection");
  const session = object(value.session, "session");
  if (!Array.isArray(value.blocks) || !Array.isArray(value.players) || !Array.isArray(value.exercises)) throw new TypeError("Offline projection collections are invalid.");
  return Object.freeze({
    ...value, projectionSchema: requiredText(value.projectionSchema, "projectionSchema", 80), partitionKey: requiredText(value.partitionKey, "partitionKey", 120),
    session: Object.freeze({ ...session, id: requiredText(session.id, "session ID", 80), revision: boundedInteger(session.revision, "session revision") }),
    blocks: Object.freeze(value.blocks.map((block) => Object.freeze({ ...object(block, "session block") }))),
    players: Object.freeze(value.players.map((player) => Object.freeze({ ...object(player, "player reference") }))),
    exercises: Object.freeze(value.exercises.map((exercise) => Object.freeze({ ...object(exercise, "exercise reference") }))),
    excludedFields: stringArray(value.excludedFields, "excluded field", 12),
  });
}

export function validateOperationReceipt(value) {
  value = object(value, "Session operation receipt");
  const state = requiredText(value.state, "operation state", 40);
  if (!allowedLocalOperationStates.has(state)) throw new TypeError("Unsupported local operation state.");
  if (value.durableLocally !== true) throw new TypeError("Session operation was not confirmed durable locally.");
  return Object.freeze({
    operationId: requiredText(value.operationId, "operationId", 80),
    state,
    resultingRevision: boundedInteger(value.resultingRevision, "resultingRevision"),
    durableLocally: true,
  });
}

export function validateSessionSyncStatus(value) {
  value = object(value, "Session synchronization status");
  const state = requiredText(value.state, "synchronization state", 40);
  if (!allowedSyncStates.has(state)) throw new TypeError("Unsupported synchronization state.");
  const blockedReason = value.blockedReason == null
    ? null
    : requiredText(value.blockedReason, "blockedReason", 80);
  return Object.freeze({
    schema: requiredText(value.schema, "synchronization schema", 80),
    partitionKey: requiredText(value.partitionKey, "partitionKey", 120),
    state,
    pendingOperationCount: boundedInteger(value.pendingOperationCount, "pendingOperationCount", { max: 10_000 }),
    quarantinedOperationCount: boundedInteger(value.quarantinedOperationCount, "quarantinedOperationCount", { max: 10_000 }),
    blockedReason,
  });
}

export function validateSpikeProbe(value) {
  value = object(value, "Spike probe");
  const candidate = requiredText(value.candidate, "candidate", 20);
  const bootMode = requiredText(value.bootMode, "bootMode", 32);
  if (!allowedCandidates.has(candidate)) throw new TypeError("Unknown spike candidate.");
  if (!allowedBootModes.has(bootMode)) throw new TypeError("Unknown boot mode.");
  return Object.freeze({
    candidate, bootMode, shellVersion: requiredText(value.shellVersion, "shellVersion", 40),
    cacheVersion: requiredText(value.cacheVersion, "cacheVersion", 80), payloadBuildId: requiredText(value.payloadBuildId, "payloadBuildId", 80),
    cachedPayload: Boolean(value.cachedPayload), serviceWorkerControlled: Boolean(value.serviceWorkerControlled),
    unauthorizedCommandRejected: value.unauthorizedCommandRejected === true,
  });
}

export async function verifyDeniedNativeCommand({ native = negativeProbeNative, isDesktop = nativeBridgeAvailable } = {}) {
  if (!isDesktop) return true;
  try { await native.invokeKnownButUngranted(); return false; } catch { return true; }
}

export function createDesktopBridge({ native = activeNative, isDesktop = nativeBridgeAvailable } = {}) {
  const browserRuntime = Object.freeze({ nativeAppVersion: "web", runtime: "browser", localSchemaVersion: 0, syncProtocolVersion: 0, capabilities: Object.freeze([]) });
  return Object.freeze({
    isDesktop,
    async getRuntimeInfo() { return isDesktop ? validateRuntimeInfo(await native.runtimeInfo()) : browserRuntime; },
    async getBootstrapStatus() { return isDesktop ? Object.freeze(object(await native.bootstrapStatus(), "bootstrap status")) : null; },
    async prepareShellUpdate() { return isDesktop ? Object.freeze(object(await native.prepareShellUpdate(), "prepare result")) : null; },
    async openRecovery() { return isDesktop ? native.openRecovery() : false; },
    async getSessionAuthority() { return isDesktop ? validateSessionAuthority(await native.sessionAuthority()) : null; },
    async readSelectedSession(context) {
      if (!isDesktop) return null;
      const validatedContext = validateSessionContext(context);
      const slice = validateSessionSlice(await native.readSelectedSession(validatedContext));
      if (slice.partitionKey !== validatedContext.partitionKey) throw new TypeError("Offline projection crossed its authorized partition.");
      return slice;
    },
    async getSessionSyncStatus(context) {
      if (!isDesktop) return null;
      const validatedContext = validateSessionContext(context);
      const status = validateSessionSyncStatus(await native.sessionSyncStatus(validatedContext));
      if (status.partitionKey !== validatedContext.partitionKey) throw new TypeError("Synchronization status crossed its authorized partition.");
      return status;
    },
    async applySessionOperation(request) {
      if (!isDesktop) return null;
      return validateOperationReceipt(await native.applySessionOperation(object(request, "session operation")));
    },
    async recordProbe(probe) {
      if (!isDesktop) return false;
      await native.recordProbe(validateSpikeProbe(probe));
      return true;
    },
  });
}
