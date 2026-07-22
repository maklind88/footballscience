const crypto = require("crypto");

const SESSION_PLANNER_DOMAIN_SCHEMA_VERSION = 1;
const SESSION_PLANNER_SOURCE_STORAGE_KEY = "football-session-planner-v3";
const SESSION_PLANNER_SESSION_SLOT = "primary";
const SESSION_PLANNER_MAX_SESSION_CONTENT_BYTES = 128 * 1024;
const SESSION_PLANNER_MAX_BLOCK_PAYLOAD_BYTES = 256 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function cloneJsonValue(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function stableJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stableJsonValue(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (value[key] !== undefined) {
          result[key] = stableJsonValue(value[key]);
        }
        return result;
      }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableJsonValue(cloneJsonValue(value)));
}

function hashJsonValue(value) {
  return crypto.createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

function jsonByteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function requireUuid(value, label) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new TypeError(`${label} must be a UUID.`);
  }
  return normalized;
}

function requireIdentifier(value, label, maxLength = 180) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new TypeError(`${label} must contain 1-${maxLength} characters.`);
  }
  return normalized;
}

function normalizeDate(value, label = "Session date") {
  const normalized = String(value || "").slice(0, 10);
  if (!DATE_PATTERN.test(normalized)) {
    throw new TypeError(`${label} must use YYYY-MM-DD.`);
  }
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new TypeError(`${label} is invalid.`);
  }
  return normalized;
}

function deterministicUuid(...parts) {
  const bytes = crypto.createHash("sha256").update(parts.map(String).join("\u0000"), "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function createSessionContent(session, dateValue, legacySessionId) {
  const content = cloneJsonValue(session);
  delete content.blocks;
  content.id = legacySessionId;
  content.date = dateValue;
  content.title = String(session.title || "");
  content.theme = String(session.theme || "");
  content.selectedBlockId = String(session.selectedBlockId || "");
  const size = jsonByteLength(content);
  if (size > SESSION_PLANNER_MAX_SESSION_CONTENT_BYTES) {
    throw new RangeError(`Session ${legacySessionId} content exceeds ${SESSION_PLANNER_MAX_SESSION_CONTENT_BYTES} bytes.`);
  }
  return content;
}

function createBlockRecord({ block, index, organizationId, teamId, sessionId }) {
  const source = requirePlainObject(block, `Block ${index + 1}`);
  const legacyBlockId = requireIdentifier(source.id, `Block ${index + 1} id`);
  const payload = cloneJsonValue(source);
  payload.id = legacyBlockId;
  const size = jsonByteLength(payload);
  if (size > SESSION_PLANNER_MAX_BLOCK_PAYLOAD_BYTES) {
    throw new RangeError(`Block ${legacyBlockId} exceeds ${SESSION_PLANNER_MAX_BLOCK_PAYLOAD_BYTES} bytes.`);
  }
  return {
    id: deterministicUuid("session-planner-block", teamId, sessionId, legacyBlockId),
    organizationId,
    teamId,
    sessionId,
    legacyBlockId,
    sortOrder: index,
    schemaVersion: SESSION_PLANNER_DOMAIN_SCHEMA_VERSION,
    payload,
    payloadHash: hashJsonValue(payload),
  };
}

function extractSessionPlannerDomainRecords(state, scope = {}) {
  const source = requirePlainObject(state, "Session Planner state");
  const sessionsSource = requirePlainObject(source.sessions || {}, "Session Planner sessions");
  const organizationId = requireUuid(scope.organizationId, "organizationId");
  const teamId = requireUuid(scope.teamId, "teamId");
  const sessions = [];
  const blocks = [];

  Object.keys(sessionsSource).sort().forEach((dateKey) => {
    const session = requirePlainObject(sessionsSource[dateKey], `Session ${dateKey}`);
    const sessionDate = normalizeDate(session.date || dateKey);
    const legacySessionId = requireIdentifier(session.id || `session-${sessionDate}`, `Session ${sessionDate} id`);
    const sessionId = deterministicUuid("session-planner-session", teamId, sessionDate, SESSION_PLANNER_SESSION_SLOT);
    const content = createSessionContent(session, sessionDate, legacySessionId);
    const sessionBlocks = Array.isArray(session.blocks) ? session.blocks : [];
    const blockIds = new Set();

    sessionBlocks.forEach((block, index) => {
      const legacyBlockId = requireIdentifier(block?.id, `Block ${index + 1} id`);
      if (blockIds.has(legacyBlockId)) {
        throw new TypeError(`Session ${sessionDate} contains duplicate block id ${legacyBlockId}.`);
      }
      blockIds.add(legacyBlockId);
      blocks.push(createBlockRecord({ block, index, organizationId, teamId, sessionId }));
    });

    sessions.push({
      id: sessionId,
      organizationId,
      teamId,
      sessionDate,
      sessionSlot: SESSION_PLANNER_SESSION_SLOT,
      legacySessionId,
      title: content.title,
      theme: content.theme,
      selectedBlockLegacyId: content.selectedBlockId,
      schemaVersion: SESSION_PLANNER_DOMAIN_SCHEMA_VERSION,
      content,
      contentHash: hashJsonValue(content),
    });
  });

  return Object.freeze({
    schemaVersion: SESSION_PLANNER_DOMAIN_SCHEMA_VERSION,
    sourceStorageKey: SESSION_PLANNER_SOURCE_STORAGE_KEY,
    organizationId,
    teamId,
    sessions,
    blocks,
    counts: Object.freeze({ sessions: sessions.length, blocks: blocks.length }),
  });
}

function requireScopeMatch(row, organizationId, teamId, label) {
  const rowOrganizationId = requireUuid(row?.organizationId, `${label} organizationId`);
  const rowTeamId = requireUuid(row?.teamId, `${label} teamId`);
  if (rowOrganizationId !== organizationId || rowTeamId !== teamId) {
    throw new TypeError(`${label} belongs to a different tenant scope.`);
  }
}

function composeSessionPlannerLegacyState(snapshot, options = {}) {
  const source = requirePlainObject(snapshot, "Session Planner domain snapshot");
  const sessionRows = Array.isArray(source.sessions) ? source.sessions : [];
  const blockRows = Array.isArray(source.blocks) ? source.blocks : [];
  const organizationId = requireUuid(options.organizationId || source.organizationId, "organizationId");
  const teamId = requireUuid(options.teamId || source.teamId, "teamId");
  const knownSessionIds = new Set();
  sessionRows.forEach((row) => {
    requireScopeMatch(row, organizationId, teamId, "Session");
    knownSessionIds.add(requireUuid(row?.id, "Session id"));
  });
  const blocksBySession = blockRows.reduce((result, row) => {
    requireScopeMatch(row, organizationId, teamId, "Block");
    const sessionId = requireUuid(row?.sessionId, "Block sessionId");
    if (!knownSessionIds.has(sessionId)) {
      throw new TypeError("Block references a session outside the supplied snapshot.");
    }
    if (!result.has(sessionId)) result.set(sessionId, []);
    result.get(sessionId).push(row);
    return result;
  }, new Map());
  const sessions = {};

  sessionRows
    .slice()
    .sort((left, right) => String(left.sessionDate).localeCompare(String(right.sessionDate)))
    .forEach((row) => {
      const sessionId = requireUuid(row?.id, "Session id");
      const dateValue = normalizeDate(row.sessionDate);
      if (sessions[dateValue]) {
        throw new TypeError(`Domain snapshot contains multiple primary sessions for ${dateValue}.`);
      }
      const content = cloneJsonValue(requirePlainObject(row.content || {}, `Session ${dateValue} content`));
      const blocks = (blocksBySession.get(sessionId) || [])
        .slice()
        .sort((left, right) => Number(left.sortOrder) - Number(right.sortOrder))
        .map((blockRow) => cloneJsonValue(requirePlainObject(blockRow.payload, "Block payload")));
      content.id = requireIdentifier(row.legacySessionId || content.id || `session-${dateValue}`, "legacySessionId");
      content.date = dateValue;
      content.title = String(row.title ?? content.title ?? "");
      content.theme = String(row.theme ?? content.theme ?? "");
      content.selectedBlockId = String(row.selectedBlockLegacyId ?? content.selectedBlockId ?? "");
      content.blocks = blocks;
      sessions[dateValue] = content;
    });

  const orderedDates = Object.keys(sessions).sort();
  const requestedSelectedDate = options.selectedDate ? normalizeDate(options.selectedDate, "selectedDate") : "";
  return {
    selectedDate: requestedSelectedDate || orderedDates[0] || normalizeDate(new Date().toISOString()),
    sessions,
  };
}

function createComparableSessionPlannerState(state) {
  const source = requirePlainObject(state, "Session Planner state");
  const sessions = requirePlainObject(source.sessions || {}, "Session Planner sessions");
  return { sessions: cloneJsonValue(sessions) };
}

function compareSessionPlannerStates(left, right) {
  const leftComparable = createComparableSessionPlannerState(left);
  const rightComparable = createComparableSessionPlannerState(right);
  const leftHash = hashJsonValue(leftComparable);
  const rightHash = hashJsonValue(rightComparable);
  return Object.freeze({
    equal: leftHash === rightHash,
    leftHash,
    rightHash,
    sessionCount: Object.keys(leftComparable.sessions).length,
  });
}

module.exports = {
  SESSION_PLANNER_DOMAIN_SCHEMA_VERSION,
  SESSION_PLANNER_MAX_BLOCK_PAYLOAD_BYTES,
  SESSION_PLANNER_MAX_SESSION_CONTENT_BYTES,
  SESSION_PLANNER_SESSION_SLOT,
  SESSION_PLANNER_SOURCE_STORAGE_KEY,
  compareSessionPlannerStates,
  composeSessionPlannerLegacyState,
  createComparableSessionPlannerState,
  deterministicUuid,
  extractSessionPlannerDomainRecords,
  hashJsonValue,
  stableStringify,
};
