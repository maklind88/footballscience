const {
  DEFAULT_ROLES,
  getCurrentActor,
  readConfig,
  sendCorsHeaders,
  sendJson,
  parseJsonBody,
} = require("./_lib/supabase-admin.js");
const { appendAuditLog } = require("./_lib/audit-log.js");
const { appendSessionPlannerHistory } = require("./_lib/session-history.js");
const { guardApiRequest } = require("./_lib/platform-security.js");
const { dataSafetyRegistry } = require("../src/core/data-safety-contracts.cjs");
const {
  PLATFORM_APPEARANCE_STORAGE_KEY,
  normalizePlatformAppearanceValue,
  summarizePlatformAppearanceChange,
} = require("../src/core/appearance-governance.cjs");
const crypto = require("crypto");

const STATE_BUCKET = "footballscience-app-state";
const STATE_PREFIX = "global";
const MAX_STATE_VALUE_BYTES = 12 * 1024 * 1024;
const PERIODIZATION_KEY = "football-periodization-v2";
const SESSION_PLANNER_KEY = "football-session-planner-v3";
const SESSION_EXERCISE_LIBRARY_KEY = "football-session-exercise-library-v1";
const SESSION_EXERCISE_LIBRARY_FOLDERS_KEY = "football-session-exercise-library-folders-v1";
const MEDICAL_TEAM_KEY = "football-medical-team-v1";
const PLAYER_PROFILES_KEY = "football-player-profiles-v1";
const SCOUTING_KEY = "football-scouting-v1";
const SESSION_PLANNER_REDUCTION_GUARD_KEY = "blockReductionGuard";
const SESSION_PLANNER_BLOCK_DELETION_TOMBSTONE_KEY = "blockDeletionTombstones";
const SESSION_PLANNER_REDUCTION_WINDOW_MS = 30 * 60 * 1000;
const SESSION_PLANNER_BLOCK_FIELD_META_KEY = "fieldUpdatedAt";
const SESSION_PLANNER_BLOCK_MERGE_FIELDS = [
  "label",
  "title",
  "focus",
  "phase",
  "subPhase",
  "minutes",
  "time",
  "intensity",
  "pitchSize",
  "material",
  "objective",
  "why",
  "organization",
  "principles",
  "diagram",
  "tacticalPitchMode",
  "playerBoardLayoutMode",
  "visualImage",
  "playerBoardPositions",
  "playerBoardColors",
  "tacticalElements",
  "tacticalFrames",
  "tacticalActiveFrameId",
];
const SESSION_PLANNER_BLOCK_MERGE_FIELD_SET = new Set(SESSION_PLANNER_BLOCK_MERGE_FIELDS);
const PERIODIZATION_FIELD_META_KEY = "fieldUpdatedAt";
const PERIODIZATION_SCALAR_FIELDS = [
  "seasonPhase",
  "daySchedule",
  "matchDay",
  "sessionType",
  "physicalLoad",
  "pitchSize",
  "preTrainingVideo",
  "preTrainingNotes",
  "psychologicalFocus",
  "psychologicalNotes",
  "mainFocus",
  "gkFocus",
  "warmUp",
  "block1",
  "block2",
  "block3",
  "block4",
  "sessionNotes",
  "sessionPlanLink",
  "sessionVideoLink",
  "sessionGpsReportLink",
];
const PERIODIZATION_MULTI_FIELDS = ["matchPhases", "subPhases", "teamPrinciples", "miniGamePrinciples"];
const PERIODIZATION_FIELD_SET = new Set([...PERIODIZATION_SCALAR_FIELDS, ...PERIODIZATION_MULTI_FIELDS]);
const CENTRAL_STATE_KEYS = new Set(dataSafetyRegistry.keys());
const WORKSPACE_HUB_KEY = "football-workspace-hub-v3";
const PLATFORM_STRUCTURE_KEY = "football-platform-structure-v1";
const PLATFORM_APPEARANCE_KEY = PLATFORM_APPEARANCE_STORAGE_KEY;
const DEFAULT_WORKSPACE_ACCESS = {
  chat: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
  schedule: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"],
  periodization: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
  "session-planner": ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
  "player-profiles": ["admin", "club-admin", "team-admin", "coach", "scout", "performance", "medical"],
  scouting: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
  "analysis-room": ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
  "medical-team": ["admin", "club-admin", "team-admin", "coach", "performance", "medical"],
  staff: ["admin", "club-admin", "team-admin"],
  admin: ["admin", "club-admin", "team-admin"],
  "team-identity": ["admin", "club-admin", "team-admin", "coach"],
  "game-simulator": ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance"],
};
const DEFAULT_WORKSPACE_EDIT_ACCESS = {
  chat: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
  schedule: ["admin", "club-admin", "team-admin", "coach"],
  periodization: ["admin", "club-admin", "team-admin", "coach", "performance"],
  "session-planner": ["admin", "club-admin", "team-admin", "coach"],
  "player-profiles": ["admin", "club-admin", "team-admin", "coach", "scout"],
  scouting: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
  "analysis-room": ["admin", "club-admin", "team-admin", "scout", "analyst"],
  "medical-team": ["admin", "club-admin", "team-admin", "medical", "performance"],
  staff: ["admin", "club-admin", "team-admin"],
  admin: ["admin", "club-admin", "team-admin"],
  "team-identity": ["admin", "club-admin", "team-admin", "coach"],
  "game-simulator": ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
};
const REQUIRED_WORKSPACE_ACCESS = {
  "session-planner": {
    view: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical"],
    edit: ["admin", "club-admin", "team-admin", "coach"],
  },
  "player-profiles": {
    view: ["admin", "club-admin", "team-admin", "coach", "scout", "performance", "medical"],
    edit: ["admin", "club-admin", "team-admin", "coach", "scout"],
  },
  "medical-team": {
    view: ["admin", "club-admin", "team-admin", "coach", "performance", "medical"],
    edit: ["admin", "club-admin", "team-admin", "medical", "performance"],
  },
  scouting: {
    view: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
    edit: ["admin", "club-admin", "team-admin", "coach", "scout", "analyst"],
  },
  "team-identity": {
    view: ["admin", "club-admin", "team-admin", "coach"],
    edit: ["admin", "club-admin", "team-admin", "coach"],
  },
};
const STATE_KEY_WORKSPACE_EDIT_MAP = {
  [PLATFORM_STRUCTURE_KEY]: "admin",
  "football-dashboard-chat-v1": "chat",
  "football-schedule-v1": "schedule",
  [PERIODIZATION_KEY]: "periodization",
  [SESSION_PLANNER_KEY]: "session-planner",
  [SESSION_EXERCISE_LIBRARY_KEY]: "session-planner",
  "football-session-exercise-library-backup-v1": "session-planner",
  [SESSION_EXERCISE_LIBRARY_FOLDERS_KEY]: "session-planner",
  "football-session-exercise-library-folders-backup-v1": "session-planner",
  [MEDICAL_TEAM_KEY]: "medical-team",
  [PLAYER_PROFILES_KEY]: "player-profiles",
  [SCOUTING_KEY]: "scouting",
  "football-simulator-sequence-v1": "game-simulator",
  "football-simulator-sequence-library-v2": "game-simulator",
};
const ADMIN_ONLY_STATE_KEYS = new Set(["mak-coaching-platform-users-v1", PLATFORM_APPEARANCE_KEY]);
const MEDICAL_PRIVATE_ROLES = new Set(["admin", "club-admin", "team-admin", "medical", "performance"]);
const MEDICAL_PARTICIPATION_OPTIONS = new Set([0, 10, 25, 50, 75, 100]);
const MEDICAL_STATUS_KEYS = new Set(["full", "modified", "controlled", "rehab", "unavailable", "monitor"]);
const MEDICAL_RTP_PHASE_KEYS = new Set([
  "medical-restriction",
  "rehab",
  "modified-team",
  "full-training",
  "match-available",
]);
const BLOCKED_CONTENT_PATTERNS = [
  { pattern: /<\s*script\b/i, label: "script tags" },
  { pattern: /<\s*iframe\b/i, label: "iframe tags" },
  { pattern: /<\s*object\b/i, label: "object tags" },
  { pattern: /<\s*embed\b/i, label: "embed tags" },
  { pattern: /\bon[a-z]+\s*=/i, label: "inline event handlers" },
  { pattern: /javascript\s*:/i, label: "javascript URLs" },
];
const BLOCKED_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_CONTENT_DEPTH = 80;

function storageHeaders(contentType = "application/json") {
  const { serviceRoleKey } = readConfig();
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return headers;
}

async function parseResponseJson(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function getStorageBaseUrl() {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase server configuration.");
  }

  return `${url}/storage/v1`;
}

async function storageRequest(path, options = {}) {
  const baseUrl = getStorageBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...storageHeaders(options.contentType),
      ...(options.headers || {}),
    },
  });

  if (response.status === 404) {
    return { ok: false, status: 404, payload: {} };
  }

  const payload = options.raw ? await response.text() : await parseResponseJson(response);
  if (!response.ok) {
    const reason = payload?.error || payload?.message || payload?.msg || `Storage request failed (${response.status}).`;
    return { ok: false, status: response.status, payload, reason };
  }

  return { ok: true, status: response.status, payload };
}

async function ensureStateBucket() {
  const existing = await storageRequest(`/bucket/${encodeURIComponent(STATE_BUCKET)}`, { method: "GET" });
  if (existing.ok) {
    return { ok: true };
  }

  const created = await storageRequest("/bucket", {
    method: "POST",
    body: JSON.stringify({
      id: STATE_BUCKET,
      name: STATE_BUCKET,
      public: false,
    }),
  });

  if (created.ok || created.status === 409 || String(created.reason || "").toLowerCase().includes("already")) {
    return { ok: true };
  }

  return created;
}

function sanitizeStateKey(key) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey || normalizedKey.length > 180) {
    return "";
  }

  if (!CENTRAL_STATE_KEYS.has(normalizedKey)) {
    return "";
  }

  return normalizedKey;
}

function safeParseJson(value, fallback = null) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

function cloneMergeValue(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? [...value] : { ...value };
  }
}

function normalizeRoleList(roles = [], fallback = []) {
  const knownRoles = new Set(DEFAULT_ROLES);
  const sourceRoles = Array.isArray(roles) ? roles : fallback;
  return Array.from(new Set(["admin", ...sourceRoles.filter((role) => knownRoles.has(role))]));
}

function normalizeWorkspaceAccessEntry(workspaceId, entry) {
  const defaultView = DEFAULT_WORKSPACE_ACCESS[workspaceId] || DEFAULT_ROLES;
  const defaultEdit = DEFAULT_WORKSPACE_EDIT_ACCESS[workspaceId] || ["admin"];
  const requiredView = REQUIRED_WORKSPACE_ACCESS[workspaceId]?.view || [];
  const requiredEdit = REQUIRED_WORKSPACE_ACCESS[workspaceId]?.edit || [];
  const withRequiredAccess = (permission) => {
    const view = normalizeRoleList([...(permission.view || []), ...requiredView], defaultView);
    const edit = normalizeRoleList([...(permission.edit || []), ...requiredEdit], defaultEdit).filter((role) =>
      view.includes(role)
    );
    return {
      view,
      edit: normalizeRoleList(edit, ["admin"]),
    };
  };

  if (Array.isArray(entry)) {
    return withRequiredAccess({
      view: normalizeRoleList(entry, defaultView),
      edit: normalizeRoleList(defaultEdit, ["admin"]),
    });
  }

  if (entry && typeof entry === "object") {
    const view = normalizeRoleList(entry.view, defaultView);
    const edit = normalizeRoleList(entry.edit, defaultEdit).filter((role) => view.includes(role));
    return withRequiredAccess({
      view,
      edit: normalizeRoleList(edit, ["admin"]),
    });
  }

  return withRequiredAccess({
    view: normalizeRoleList(defaultView, DEFAULT_ROLES),
    edit: normalizeRoleList(defaultEdit, ["admin"]),
  });
}

function normalizeWorkspaceAccessConfig(config = {}) {
  const workspaceIds = new Set([
    ...Object.keys(DEFAULT_WORKSPACE_ACCESS),
    ...Object.keys(DEFAULT_WORKSPACE_EDIT_ACCESS),
    ...Object.keys(config || {}),
  ]);

  return Array.from(workspaceIds).reduce((normalized, workspaceId) => {
    normalized[workspaceId] = normalizeWorkspaceAccessEntry(workspaceId, config?.[workspaceId]);
    return normalized;
  }, {});
}

function objectPathForKey(key) {
  return `${STATE_PREFIX}/${encodeURIComponent(key)}.json`;
}

function hashStateValue(value = "") {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function getStateEntryRevision(entry = {}) {
  const revision = Number(entry?.revision);
  return Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

function getActorOrganizationId(actor = {}, contract = {}) {
  const candidates = [
    actor.organizationId,
    actor.organization_id,
    actor.app_metadata?.organizationId,
    actor.app_metadata?.organization_id,
    contract.defaultOrganizationId,
    "global",
  ];
  return String(candidates.find((value) => String(value || "").trim()) || "global").trim();
}

function getStateEntryMetadata(entry = {}) {
  const value = String(entry?.value ?? "");
  return {
    updatedAt: entry?.updatedAt || "",
    updatedBy: entry?.updatedBy || "",
    revision: getStateEntryRevision(entry),
    organizationId: String(entry?.organizationId || "global"),
    moduleId: String(entry?.moduleId || dataSafetyRegistry.getByKey(entry?.key)?.moduleId || ""),
    mergePolicy: String(entry?.mergePolicy || dataSafetyRegistry.getByKey(entry?.key)?.mergePolicy || ""),
    hash: entry?.hash || hashStateValue(value),
    size: Buffer.byteLength(value, "utf8"),
  };
}

function validateStateContentValue(value, pathLabel = "value", depth = 0) {
  if (depth > MAX_CONTENT_DEPTH) {
    return `${pathLabel} is too deeply nested.`;
  }

  if (typeof value === "string") {
    const blockedPattern = BLOCKED_CONTENT_PATTERNS.find((entry) => entry.pattern.test(value));
    return blockedPattern ? `${pathLabel} contains blocked executable content (${blockedPattern.label}).` : "";
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const issue = validateStateContentValue(value[index], `${pathLabel}[${index}]`, depth + 1);
      if (issue) {
        return issue;
      }
    }
    return "";
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (BLOCKED_JSON_KEYS.has(key)) {
      return `${pathLabel}.${key} is not allowed in central state.`;
    }
    const issue = validateStateContentValue(nestedValue, `${pathLabel}.${key}`, depth + 1);
    if (issue) {
      return issue;
    }
  }

  return "";
}

function validateCentralStateContent(key, value, contract = {}) {
  if (contract?.contentSafety?.inputPolicy !== "server-validated-json") {
    return { ok: true };
  }

  const parsed = safeParseJson(value, undefined);
  if (parsed === undefined || parsed === null || typeof parsed !== "object") {
    return {
      ok: false,
      status: 400,
      reason: `${contract?.moduleId || key} data must be valid JSON object or array content before central sync.`,
    };
  }

  const issue = validateStateContentValue(parsed);
  if (issue) {
    return {
      ok: false,
      status: 400,
      reason: `${contract?.moduleId || key} data was not saved because ${issue}`,
    };
  }

  return { ok: true };
}

function normalizeStateEntry(key, value, actor, removed = false, previousEntry = null) {
  const normalizedKey = sanitizeStateKey(key);
  if (!normalizedKey) {
    return null;
  }

  const contract = dataSafetyRegistry.requireByKey(normalizedKey);
  const normalizedValue = String(value ?? "");
  if (!removed && Buffer.byteLength(normalizedValue, "utf8") > MAX_STATE_VALUE_BYTES) {
    throw new Error(`${normalizedKey} is too large to sync centrally.`);
  }

  return {
    schema: "footballscience-app-state-v1",
    key: normalizedKey,
    moduleId: contract.moduleId,
    organizationId: previousEntry?.organizationId || getActorOrganizationId(actor, contract),
    savePipeline: contract.savePipeline,
    sourceOfTruth: contract.sourceOfTruth,
    localPersistence: contract.localPersistence,
    mergePolicy: contract.mergePolicy,
    revision: getStateEntryRevision(previousEntry) + 1,
    value: normalizedValue,
    removed: Boolean(removed),
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.id || "",
    hash: hashStateValue(normalizedValue),
  };
}

function parseClientRevision(value) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 0 ? revision : null;
}

function getClientBaseRevision(metadata = {}, key = "") {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const direct = parseClientRevision(metadata.baseRevision ?? metadata.revision);
  if (direct !== null) {
    return direct;
  }

  const entryMetadata = metadata[key];
  if (entryMetadata && typeof entryMetadata === "object") {
    return parseClientRevision(entryMetadata.baseRevision ?? entryMetadata.revision);
  }

  return null;
}

function getStaleWriteRejection(contract, previousEntry, authorization, clientBaseRevision) {
  const currentRevision = getStateEntryRevision(previousEntry);
  if (!currentRevision) {
    return null;
  }

  if (clientBaseRevision === null) {
    return {
      ok: false,
      status: 409,
      reason: `Versioned ${contract?.moduleId || "module"} data was not saved because the client did not include the current central revision.`,
      currentRevision,
      missingBaseRevision: true,
    };
  }

  if (currentRevision <= clientBaseRevision) {
    return null;
  }

  if (contract?.staleWriteStrategy === "merge" && authorization?.merged) {
    return null;
  }

  return {
    ok: false,
    status: 409,
    reason: `Stale ${contract?.moduleId || "module"} data was not saved because the central state is already newer.`,
    currentRevision,
  };
}

async function readStateObject(key) {
  const path = objectPathForKey(key);
  const result = await storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${path}`, {
    method: "GET",
    raw: true,
    contentType: "",
  });

  if (!result.ok) {
    return null;
  }

  try {
    const parsed = JSON.parse(result.payload);
    return parsed?.key ? parsed : null;
  } catch {
    return null;
  }
}

function parsePeriodizationStateValue(rawValue) {
  const parsed = safeParseJson(rawValue, null);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
}

function getPeriodizationDays(state) {
  return state?.days && typeof state.days === "object" && !Array.isArray(state.days)
    ? state.days
    : {};
}

function normalizePeriodizationMultiValue(value) {
  const rawValues = Array.isArray(value) ? value : String(value ?? "").split("|");
  return Array.from(new Set(rawValues.map((item) => String(item).trim()).filter(Boolean)));
}

function parseMergeTimestamp(value) {
  const timestamp = typeof value === "number" ? value : new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizePeriodizationDay(day = {}) {
  const normalized = {};
  PERIODIZATION_SCALAR_FIELDS.forEach((field) => {
    const value = String(day?.[field] ?? "").trim();
    normalized[field] = field === "matchDay" && value.toUpperCase() === "N/A" ? "" : value;
  });
  PERIODIZATION_MULTI_FIELDS.forEach((field) => {
    normalized[field] = normalizePeriodizationMultiValue(day?.[field]);
  });

  const fieldUpdatedAt = {};
  if (day?.[PERIODIZATION_FIELD_META_KEY] && typeof day[PERIODIZATION_FIELD_META_KEY] === "object") {
    Object.entries(day[PERIODIZATION_FIELD_META_KEY]).forEach(([field, timestampValue]) => {
      if (!PERIODIZATION_FIELD_SET.has(field)) {
        return;
      }
      const timestamp = parseMergeTimestamp(timestampValue);
      if (timestamp) {
        fieldUpdatedAt[field] = new Date(timestamp).toISOString();
      }
    });
  }
  if (Object.keys(fieldUpdatedAt).length) {
    normalized[PERIODIZATION_FIELD_META_KEY] = fieldUpdatedAt;
  }
  return normalized;
}

function isEmptyPeriodizationValue(value) {
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return String(value ?? "").trim() === "";
}

function getPeriodizationFieldUpdatedAtMs(day = {}, field = "") {
  return parseMergeTimestamp(day?.[PERIODIZATION_FIELD_META_KEY]?.[field]);
}

function mergePeriodizationDays(existingDay = {}, incomingDay = {}) {
  const existing = normalizePeriodizationDay(existingDay);
  const incoming = normalizePeriodizationDay(incomingDay);
  const merged = { ...existing };
  const mergedMeta = {
    ...(existing[PERIODIZATION_FIELD_META_KEY] || {}),
    ...(incoming[PERIODIZATION_FIELD_META_KEY] || {}),
  };

  PERIODIZATION_FIELD_SET.forEach((field) => {
    const existingTimestamp = getPeriodizationFieldUpdatedAtMs(existing, field);
    const incomingTimestamp = getPeriodizationFieldUpdatedAtMs(incoming, field);
    const existingValue = existing[field];
    const incomingValue = incoming[field];

    if (incomingTimestamp && (!existingTimestamp || incomingTimestamp >= existingTimestamp)) {
      merged[field] = cloneMergeValue(incomingValue);
      mergedMeta[field] = new Date(incomingTimestamp).toISOString();
      return;
    }

    if (existingTimestamp && (!incomingTimestamp || existingTimestamp > incomingTimestamp)) {
      merged[field] = cloneMergeValue(existingValue);
      mergedMeta[field] = new Date(existingTimestamp).toISOString();
      return;
    }

    if (isEmptyPeriodizationValue(existingValue) && !isEmptyPeriodizationValue(incomingValue)) {
      merged[field] = cloneMergeValue(incomingValue);
      return;
    }

    merged[field] = cloneMergeValue(existingValue);
  });

  if (Object.keys(mergedMeta).length) {
    merged[PERIODIZATION_FIELD_META_KEY] = mergedMeta;
  } else {
    delete merged[PERIODIZATION_FIELD_META_KEY];
  }

  return normalizePeriodizationDay(merged);
}

async function protectPeriodizationStateValue(rawValue) {
  const incomingState = parsePeriodizationStateValue(rawValue);
  if (!incomingState) {
    return { ok: false, reason: "Periodization data is invalid and was not saved." };
  }

  const incomingDays = getPeriodizationDays(incomingState);
  const existingEntry = await readStateObject(PERIODIZATION_KEY);
  const existingState = parsePeriodizationStateValue(existingEntry?.value);
  if (!existingState) {
    const normalizedState = {
      ...incomingState,
      days: Object.fromEntries(
        Object.entries(incomingDays).map(([dateValue, day]) => [dateValue, normalizePeriodizationDay(day)])
      ),
    };
    return { ok: true, value: JSON.stringify(normalizedState), merged: false };
  }

  const existingDays = getPeriodizationDays(existingState);
  const mergedState = {
    ...existingState,
    ...incomingState,
    days: {},
  };
  const dateValues = new Set([
    ...Object.keys(existingDays),
    ...Object.keys(incomingDays),
  ]);

  dateValues.forEach((dateValue) => {
    const existingDay = existingDays[dateValue];
    const incomingDay = incomingDays[dateValue];
    if (existingDay && incomingDay) {
      mergedState.days[dateValue] = mergePeriodizationDays(existingDay, incomingDay);
      return;
    }
    if (incomingDay) {
      mergedState.days[dateValue] = normalizePeriodizationDay(incomingDay);
      return;
    }
    if (existingDay) {
      mergedState.days[dateValue] = normalizePeriodizationDay(existingDay);
    }
  });

  const mergedValue = JSON.stringify(mergedState);
  return { ok: true, value: mergedValue, merged: mergedValue !== rawValue };
}

function parseSessionPlannerStateValue(rawValue) {
  const parsed = safeParseJson(rawValue, null);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
}

function getSessionPlannerSessions(state) {
  return state?.sessions && typeof state.sessions === "object" && !Array.isArray(state.sessions)
    ? state.sessions
    : {};
}

function getSessionPlannerBlockCount(session) {
  return Array.isArray(session?.blocks) ? session.blocks.length : 0;
}

function parseSessionPlannerGuardTimestamp(value) {
  const timestamp = typeof value === "number" ? value : new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getFreshSessionPlannerReductionGuards(state) {
  const guard = state?.[SESSION_PLANNER_REDUCTION_GUARD_KEY];
  if (!guard || typeof guard !== "object" || Array.isArray(guard)) {
    return {};
  }

  const now = Date.now();
  return Object.entries(guard).reduce((freshGuards, [dateValue, timestampValue]) => {
    const timestamp = parseSessionPlannerGuardTimestamp(timestampValue);
    if (timestamp && now - timestamp <= SESSION_PLANNER_REDUCTION_WINDOW_MS) {
      freshGuards[dateValue] = timestamp;
    }
    return freshGuards;
  }, {});
}

function canReduceSessionPlannerBlocks(state, dateValue) {
  return Boolean(getFreshSessionPlannerReductionGuards(state)[dateValue]);
}

function normalizeSessionPlannerBlockDeletionTombstones(state) {
  const tombstones = state?.[SESSION_PLANNER_BLOCK_DELETION_TOMBSTONE_KEY];
  if (!tombstones || typeof tombstones !== "object" || Array.isArray(tombstones)) {
    return {};
  }

  return Object.entries(tombstones).reduce((normalized, [dateValue, blockMap]) => {
    if (!blockMap || typeof blockMap !== "object" || Array.isArray(blockMap)) {
      return normalized;
    }

    const normalizedBlocks = Object.entries(blockMap).reduce((blocks, [blockId, timestampValue]) => {
      const cleanBlockId = String(blockId || "").trim();
      const timestamp = parseSessionPlannerGuardTimestamp(timestampValue);
      if (cleanBlockId && timestamp) {
        blocks[cleanBlockId] = new Date(timestamp).toISOString();
      }
      return blocks;
    }, {});

    const cleanDate = String(dateValue || "").trim();
    if (cleanDate && Object.keys(normalizedBlocks).length) {
      normalized[cleanDate] = normalizedBlocks;
    }
    return normalized;
  }, {});
}

function mergeSessionPlannerBlockDeletionTombstones(...states) {
  return states.reduce((merged, state) => {
    const tombstones = normalizeSessionPlannerBlockDeletionTombstones(state);
    Object.entries(tombstones).forEach(([dateValue, blockMap]) => {
      merged[dateValue] = {
        ...(merged[dateValue] || {}),
        ...blockMap,
      };
    });
    return merged;
  }, {});
}

function getSessionPlannerDeletedBlockIds(tombstones, dateValue) {
  return new Set(Object.keys(tombstones?.[dateValue] || {}));
}

function normalizeSessionPlannerBlockFieldMeta(source = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {};
  }

  return Object.entries(source).reduce((normalizedMeta, [field, timestampValue]) => {
    if (!SESSION_PLANNER_BLOCK_MERGE_FIELD_SET.has(field)) {
      return normalizedMeta;
    }

    const timestamp = parseSessionPlannerGuardTimestamp(timestampValue);
    if (timestamp) {
      normalizedMeta[field] = new Date(timestamp).toISOString();
    }
    return normalizedMeta;
  }, {});
}

function getSessionPlannerBlockFieldUpdatedAtMs(block = {}, field) {
  return parseSessionPlannerGuardTimestamp(block?.[SESSION_PLANNER_BLOCK_FIELD_META_KEY]?.[field]);
}

function cloneSessionPlannerMergeValue(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? [...value] : { ...value };
  }
}

function isSessionPlannerEmptyMergeValue(value) {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim() === "";
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }
  return false;
}

function getSessionPlannerBlockId(block = {}) {
  return typeof block?.id === "string" && block.id.trim() ? block.id.trim() : "";
}

function mergeSessionPlannerBlocks(existingBlock = {}, incomingBlock = {}) {
  const merged = {
    ...existingBlock,
    ...incomingBlock,
    id: getSessionPlannerBlockId(incomingBlock) || getSessionPlannerBlockId(existingBlock),
  };
  const mergedMeta = {
    ...normalizeSessionPlannerBlockFieldMeta(existingBlock[SESSION_PLANNER_BLOCK_FIELD_META_KEY]),
    ...normalizeSessionPlannerBlockFieldMeta(incomingBlock[SESSION_PLANNER_BLOCK_FIELD_META_KEY]),
  };

  SESSION_PLANNER_BLOCK_MERGE_FIELDS.forEach((field) => {
    const existingTimestamp = getSessionPlannerBlockFieldUpdatedAtMs(existingBlock, field);
    const incomingTimestamp = getSessionPlannerBlockFieldUpdatedAtMs(incomingBlock, field);
    const existingValue = existingBlock[field];
    const incomingValue = incomingBlock[field];

    if (existingTimestamp && (!incomingTimestamp || existingTimestamp > incomingTimestamp)) {
      merged[field] = cloneSessionPlannerMergeValue(existingValue);
      mergedMeta[field] = new Date(existingTimestamp).toISOString();
      return;
    }

    if (!existingTimestamp && !incomingTimestamp && isSessionPlannerEmptyMergeValue(incomingValue) && !isSessionPlannerEmptyMergeValue(existingValue)) {
      merged[field] = cloneSessionPlannerMergeValue(existingValue);
      return;
    }

    merged[field] = cloneSessionPlannerMergeValue(incomingValue);
    if (incomingTimestamp) {
      mergedMeta[field] = new Date(incomingTimestamp).toISOString();
    }
  });

  const newestFieldTimestamp = Object.values(mergedMeta).reduce(
    (latest, timestampValue) => Math.max(latest, parseSessionPlannerGuardTimestamp(timestampValue)),
    0
  );
  const newestBlockTimestamp = Math.max(
    parseSessionPlannerGuardTimestamp(existingBlock.updatedAt),
    parseSessionPlannerGuardTimestamp(incomingBlock.updatedAt),
    newestFieldTimestamp
  );
  merged[SESSION_PLANNER_BLOCK_FIELD_META_KEY] = mergedMeta;
  if (newestBlockTimestamp) {
    merged.updatedAt = new Date(newestBlockTimestamp).toISOString();
  }
  return merged;
}

function mergeSessionPlannerSessions(existingSession = {}, incomingSession = {}, dateValue, canReduceBlocks = false, deletedBlockIds = new Set()) {
  const existingBlocks = Array.isArray(existingSession.blocks) ? existingSession.blocks : [];
  const incomingBlocks = Array.isArray(incomingSession.blocks) ? incomingSession.blocks : [];
  const existingById = new Map(existingBlocks.map((block) => [getSessionPlannerBlockId(block), block]).filter(([id]) => id));
  const incomingIds = new Set();
  const blocks = incomingBlocks.flatMap((incomingBlock) => {
    const blockId = getSessionPlannerBlockId(incomingBlock);
    if (blockId) {
      incomingIds.add(blockId);
    }
    if (blockId && deletedBlockIds.has(blockId)) {
      return [];
    }
    const existingBlock = existingById.get(blockId);
    return [existingBlock ? mergeSessionPlannerBlocks(existingBlock, incomingBlock) : cloneSessionPlannerMergeValue(incomingBlock)];
  });

  if (!canReduceBlocks) {
    existingBlocks.forEach((existingBlock) => {
      const blockId = getSessionPlannerBlockId(existingBlock);
      if ((!blockId || !incomingIds.has(blockId)) && !deletedBlockIds.has(blockId)) {
        blocks.push(cloneSessionPlannerMergeValue(existingBlock));
      }
    });
  }

  const hasIncomingSelection = blocks.some((block) => getSessionPlannerBlockId(block) === incomingSession.selectedBlockId);
  const hasExistingSelection = blocks.some((block) => getSessionPlannerBlockId(block) === existingSession.selectedBlockId);
  return {
    ...existingSession,
    ...incomingSession,
    date: incomingSession.date || existingSession.date || dateValue,
    title: isSessionPlannerEmptyMergeValue(incomingSession.title) && !isSessionPlannerEmptyMergeValue(existingSession.title)
      ? existingSession.title
      : incomingSession.title,
    theme: isSessionPlannerEmptyMergeValue(incomingSession.theme) && !isSessionPlannerEmptyMergeValue(existingSession.theme)
      ? existingSession.theme
      : incomingSession.theme,
    selectedBlockId: hasIncomingSelection
      ? incomingSession.selectedBlockId
      : hasExistingSelection
        ? existingSession.selectedBlockId
        : getSessionPlannerBlockId(blocks[0]) || "",
    blocks,
  };
}

function filterSessionPlannerDeletedBlocks(session = {}, dateValue, deletedBlockIds = new Set()) {
  const filteredSession = cloneSessionPlannerMergeValue(session) || {};
  filteredSession.date = filteredSession.date || dateValue;
  if (!deletedBlockIds.size) {
    return filteredSession;
  }

  const blocks = Array.isArray(filteredSession.blocks) ? filteredSession.blocks : [];
  filteredSession.blocks = blocks.filter((block) => !deletedBlockIds.has(getSessionPlannerBlockId(block)));
  if (!filteredSession.blocks.some((block) => getSessionPlannerBlockId(block) === filteredSession.selectedBlockId)) {
    filteredSession.selectedBlockId = getSessionPlannerBlockId(filteredSession.blocks[0]) || "";
  }
  return filteredSession;
}

function normalizeSessionPlannerReductionGuards(state) {
  const freshGuards = getFreshSessionPlannerReductionGuards(state);
  if (Object.keys(freshGuards).length) {
    state[SESSION_PLANNER_REDUCTION_GUARD_KEY] = freshGuards;
    return;
  }

  delete state[SESSION_PLANNER_REDUCTION_GUARD_KEY];
}

function normalizeSessionPlannerBlockDeletionTombstonesInState(state) {
  const tombstones = normalizeSessionPlannerBlockDeletionTombstones(state);
  if (Object.keys(tombstones).length) {
    state[SESSION_PLANNER_BLOCK_DELETION_TOMBSTONE_KEY] = tombstones;
    return;
  }

  delete state[SESSION_PLANNER_BLOCK_DELETION_TOMBSTONE_KEY];
}

async function protectSessionPlannerStateValue(rawValue) {
  const incomingState = parseSessionPlannerStateValue(rawValue);
  if (!incomingState) {
    return { ok: false, reason: "Session planner data is invalid and was not saved." };
  }

  const existingEntry = await readStateObject(SESSION_PLANNER_KEY);
  const existingState = parseSessionPlannerStateValue(existingEntry?.value);
  if (!existingState) {
    normalizeSessionPlannerReductionGuards(incomingState);
    normalizeSessionPlannerBlockDeletionTombstonesInState(incomingState);
    return { ok: true, value: JSON.stringify(incomingState), merged: false };
  }

  const incomingSessions = getSessionPlannerSessions(incomingState);
  const existingSessions = getSessionPlannerSessions(existingState);
  const blockDeletionTombstones = mergeSessionPlannerBlockDeletionTombstones(existingState, incomingState);
  const mergedState = {
    ...incomingState,
    sessions: {},
    [SESSION_PLANNER_BLOCK_DELETION_TOMBSTONE_KEY]: blockDeletionTombstones,
  };

  const sessionDates = new Set([
    ...Object.keys(existingSessions),
    ...Object.keys(incomingSessions),
  ]);

  sessionDates.forEach((dateValue) => {
    const existingSession = existingSessions[dateValue];
    const incomingSession = incomingSessions[dateValue];
    if (existingSession && incomingSession) {
      mergedState.sessions[dateValue] = mergeSessionPlannerSessions(
        existingSession,
        incomingSession,
        dateValue,
        canReduceSessionPlannerBlocks(incomingState, dateValue),
        getSessionPlannerDeletedBlockIds(blockDeletionTombstones, dateValue)
      );
      return;
    }

    const deletedBlockIds = getSessionPlannerDeletedBlockIds(blockDeletionTombstones, dateValue);
    if (existingSession) {
      mergedState.sessions[dateValue] = filterSessionPlannerDeletedBlocks(existingSession, dateValue, deletedBlockIds);
      return;
    }

    if (incomingSession) {
      mergedState.sessions[dateValue] = filterSessionPlannerDeletedBlocks(incomingSession, dateValue, deletedBlockIds);
    }
  });

  normalizeSessionPlannerReductionGuards(mergedState);
  normalizeSessionPlannerBlockDeletionTombstonesInState(mergedState);
  const mergedValue = JSON.stringify(mergedState);
  return { ok: true, value: mergedValue, merged: mergedValue !== rawValue };
}

function parseSessionPlannerExerciseLibraryValue(rawValue) {
  const parsed = safeParseJson(rawValue, null);
  if (Array.isArray(parsed)) {
    return parsed.filter((item) => item && typeof item === "object" && !Array.isArray(item));
  }

  if (
    parsed?.schema === "football-session-exercise-library-backup-v1" &&
    Array.isArray(parsed.exercises)
  ) {
    return parsed.exercises.filter((item) => item && typeof item === "object" && !Array.isArray(item));
  }

  return null;
}

function normalizeSessionPlannerExerciseTitle(title = "") {
  return String(title || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getSessionPlannerExerciseMergeKey(exercise = {}) {
  const id = String(exercise?.id || "").trim();
  if (id) {
    return `id:${id}`;
  }

  const title = normalizeSessionPlannerExerciseTitle(exercise?.title);
  return title ? `title:${title}` : "";
}

function getSessionPlannerExerciseTimestamp(exercise = {}) {
  return Math.max(
    parseSessionPlannerGuardTimestamp(exercise.updatedAt),
    parseSessionPlannerGuardTimestamp(exercise.archivedAt),
    parseSessionPlannerGuardTimestamp(exercise.createdAt)
  );
}

function chooseNewestSessionPlannerExercise(existingExercise, incomingExercise) {
  const existingTimestamp = getSessionPlannerExerciseTimestamp(existingExercise);
  const incomingTimestamp = getSessionPlannerExerciseTimestamp(incomingExercise);
  return existingTimestamp > incomingTimestamp ? existingExercise : incomingExercise;
}

async function protectSessionPlannerExerciseLibraryValue(rawValue) {
  const incomingLibrary = parseSessionPlannerExerciseLibraryValue(rawValue);
  if (!incomingLibrary) {
    return { ok: false, reason: "Exercise library data is invalid and was not saved." };
  }

  const existingEntry = await readStateObject(SESSION_EXERCISE_LIBRARY_KEY);
  const existingLibrary = parseSessionPlannerExerciseLibraryValue(existingEntry?.value);
  if (!existingLibrary) {
    return { ok: true, value: JSON.stringify(incomingLibrary), merged: false };
  }

  const existingByKey = new Map();
  existingLibrary.forEach((exercise) => {
    const key = getSessionPlannerExerciseMergeKey(exercise);
    if (key) {
      existingByKey.set(key, exercise);
    }
  });

  const usedKeys = new Set();
  const mergedLibrary = incomingLibrary.map((incomingExercise) => {
    const key = getSessionPlannerExerciseMergeKey(incomingExercise);
    if (!key) {
      return incomingExercise;
    }

    usedKeys.add(key);
    const existingExercise = existingByKey.get(key);
    return existingExercise
      ? chooseNewestSessionPlannerExercise(existingExercise, incomingExercise)
      : incomingExercise;
  });

  existingLibrary.forEach((existingExercise) => {
    const key = getSessionPlannerExerciseMergeKey(existingExercise);
    if (!key || usedKeys.has(key)) {
      return;
    }

    mergedLibrary.push(existingExercise);
  });

  const mergedValue = JSON.stringify(mergedLibrary);
  return { ok: true, value: mergedValue, merged: mergedValue !== rawValue };
}

function parsePlayerProfilesStateValue(rawValue) {
  const parsed = safeParseJson(rawValue, null);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
}

function getPlayerProfilesStateTimestamp(state = {}) {
  return parseSessionPlannerGuardTimestamp(state?.updatedAt);
}

function getPlayerProfileTimestamp(player = {}) {
  return Math.max(
    parseSessionPlannerGuardTimestamp(player?.updatedAt),
    parseSessionPlannerGuardTimestamp(player?.createdAt)
  );
}

function getPlayerProfileMergeKey(player = {}) {
  const id = String(player?.id || "").trim();
  if (id) {
    return `id:${id}`;
  }

  const name = String(player?.name || "").trim().toLowerCase();
  return name ? `name:${name}` : "";
}

function chooseNewestPlayerProfile(existingPlayer = {}, incomingPlayer = {}) {
  const existingTimestamp = getPlayerProfileTimestamp(existingPlayer);
  const incomingTimestamp = getPlayerProfileTimestamp(incomingPlayer);
  const selectedPlayer = existingTimestamp > incomingTimestamp ? existingPlayer : incomingPlayer;
  const fallbackPlayer = selectedPlayer === existingPlayer ? incomingPlayer : existingPlayer;
  return preservePlayerProfileMediaFields(selectedPlayer, fallbackPlayer);
}

const PLAYER_PROFILE_MEDIA_FIELDS = Object.freeze([
  "photoUrl",
  "sourceUrl",
  "profileImageUrl",
  "avatarUrl",
  "imageUrl",
  "portraitUrl",
]);
const PLAYER_PROFILE_CHANGE_FIELD_PATHS = {
  Name: "name",
  Number: "number",
  Position: "position",
  "Availability status": "status",
  "Squad status": "squadStatus",
  "Career phase": "careerPhase",
  "Roster type": "rosterType",
  "Temporary group": "temporaryGroup",
  "Temporary from": "temporaryFrom",
  "Temporary to": "temporaryTo",
  "Primary role": "primaryRole",
  "Secondary roles": "secondaryRoles",
  "Preferred side": "preferredSide",
  "Role group": "roleGroup",
  "IDP status": "idp.status",
  "IDP focus": "idp.primaryFocus",
  "IDP next action": "idp.nextAction",
  "IDP review date": "idp.reviewDate",
  "Coach notes": "coachNotes",
  "Performance notes": "futureData.performanceNotes",
  "Scouting notes": "futureData.scoutingNotes",
  "Analysis notes": "futureData.analysisNotes",
  "Technical rating": "attributeRatings.technical",
  "Tactical rating": "attributeRatings.tactical",
  "Physical rating": "attributeRatings.physical",
  "Mental rating": "attributeRatings.mental",
};
const PLAYER_PROFILE_NON_DESTRUCTIVE_FIELDS = new Set([
  "name",
  "number",
  "position",
  "photoUrl",
  "sourceUrl",
  "profileImageUrl",
  "avatarUrl",
  "imageUrl",
  "portraitUrl",
  "primaryRole",
  "roleGroup",
  "rosterType",
  "countsInSquad",
  "temporaryGroup",
  "temporaryFrom",
  "temporaryTo",
]);

function getNestedPlayerProfileValue(source = {}, path = "") {
  return path.split(".").reduce((value, key) => (value && typeof value === "object" ? value[key] : undefined), source);
}

function setNestedPlayerProfileValue(source = {}, path = "", value) {
  const keys = path.split(".").filter(Boolean);
  if (!keys.length) {
    return source;
  }

  let target = source;
  keys.slice(0, -1).forEach((key) => {
    if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) {
      target[key] = {};
    }
    target = target[key];
  });
  target[keys[keys.length - 1]] = value;
  return source;
}

function hasPlayerProfileValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return String(value ?? "").trim() !== "";
}

function preserveNonDestructivePlayerProfileFields(existingPlayer = {}, incomingPlayer = {}) {
  const mergedPlayer = { ...incomingPlayer };
  PLAYER_PROFILE_NON_DESTRUCTIVE_FIELDS.forEach((path) => {
    const existingValue = getNestedPlayerProfileValue(existingPlayer, path);
    const incomingValue = getNestedPlayerProfileValue(incomingPlayer, path);
    if (hasPlayerProfileValue(existingValue) && !hasPlayerProfileValue(incomingValue)) {
      setNestedPlayerProfileValue(mergedPlayer, path, existingValue);
    }
  });
  return mergedPlayer;
}

function preservePlayerProfileMediaFields(player = {}, fallbackPlayer = {}) {
  if (!player || typeof player !== "object" || Array.isArray(player)) {
    return player;
  }

  return PLAYER_PROFILE_MEDIA_FIELDS.reduce((mergedPlayer, field) => {
    const currentValue = String(mergedPlayer?.[field] || "").trim();
    const fallbackValue = String(fallbackPlayer?.[field] || "").trim();
    if (!currentValue && fallbackValue) {
      return { ...mergedPlayer, [field]: fallbackValue };
    }
    return mergedPlayer;
  }, player);
}

function getPlayerProfileChangeLogTimestamp(entry = {}) {
  return parseSessionPlannerGuardTimestamp(entry?.createdAt);
}

function getPlayerProfileChangeLogKey(entry = {}) {
  const id = String(entry?.id || "").trim();
  if (id) {
    return `id:${id}`;
  }

  const createdAt = String(entry?.createdAt || "").trim();
  const playerId = String(entry?.playerId || "").trim();
  const summary = String(entry?.summary || "").trim();
  return createdAt || playerId || summary ? `fallback:${createdAt}:${playerId}:${summary}` : "";
}

function normalizePlayerProfileChangeLog(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
    .sort((first, second) => getPlayerProfileChangeLogTimestamp(second) - getPlayerProfileChangeLogTimestamp(first))
    .slice(0, 250);
}

function mergePlayerProfileChangeLog(existingEntries = [], incomingEntries = []) {
  const entriesByKey = new Map();
  [...normalizePlayerProfileChangeLog(existingEntries), ...normalizePlayerProfileChangeLog(incomingEntries)].forEach((entry) => {
    const key = getPlayerProfileChangeLogKey(entry);
    if (!key) {
      return;
    }

    const existingEntry = entriesByKey.get(key);
    if (!existingEntry || getPlayerProfileChangeLogTimestamp(entry) >= getPlayerProfileChangeLogTimestamp(existingEntry)) {
      entriesByKey.set(key, entry);
    }
  });

  return normalizePlayerProfileChangeLog(Array.from(entriesByKey.values()));
}

function getPlayerProfileChangeFieldPath(change = {}) {
  return PLAYER_PROFILE_CHANGE_FIELD_PATHS[String(change?.field || "").trim()] || "";
}

function createPlayerProfileFieldChangeIndex(changeLog = []) {
  const index = new Map();
  normalizePlayerProfileChangeLog(changeLog).forEach((entry) => {
    const playerKey = entry.playerId
      ? `id:${entry.playerId}`
      : entry.playerName
        ? `name:${String(entry.playerName).trim().toLowerCase()}`
        : "";
    if (!playerKey) {
      return;
    }

    const entryTimestamp = getPlayerProfileChangeLogTimestamp(entry);
    (Array.isArray(entry.changes) ? entry.changes : []).forEach((change) => {
      const path = getPlayerProfileChangeFieldPath(change);
      if (!path) {
        return;
      }

      const fieldKey = `${playerKey}:${path}`;
      if ((index.get(fieldKey) || 0) < entryTimestamp) {
        index.set(fieldKey, entryTimestamp);
      }
    });
  });
  return index;
}

function getPlayerProfileFieldChangeTime(index, player = {}, path = "") {
  const mergeKey = getPlayerProfileMergeKey(player);
  return mergeKey ? index.get(`${mergeKey}:${path}`) || 0 : 0;
}

function getIncomingPlayerProfileChangedPaths(existingState = {}, incomingState = {}, incomingPlayer = {}) {
  const existingKeys = new Set(
    normalizePlayerProfileChangeLog(existingState.changeLog).map(getPlayerProfileChangeLogKey).filter(Boolean)
  );
  const mergeKey = getPlayerProfileMergeKey(incomingPlayer);
  const changedPaths = new Set();

  normalizePlayerProfileChangeLog(incomingState.changeLog).forEach((entry) => {
    const entryKey = getPlayerProfileChangeLogKey(entry);
    if (entryKey && existingKeys.has(entryKey)) {
      return;
    }

    const entryMergeKey = entry.playerId
      ? `id:${entry.playerId}`
      : entry.playerName
        ? `name:${String(entry.playerName).trim().toLowerCase()}`
        : "";
    if (!mergeKey || entryMergeKey !== mergeKey) {
      return;
    }

    (Array.isArray(entry.changes) ? entry.changes : []).forEach((change) => {
      const path = getPlayerProfileChangeFieldPath(change);
      if (path) {
        changedPaths.add(path);
      }
    });
  });

  return changedPaths;
}

function mergeStalePlayerProfile(existingState = {}, incomingState = {}, existingPlayer = {}, incomingPlayer = {}) {
  const changedPaths = getIncomingPlayerProfileChangedPaths(existingState, incomingState, incomingPlayer);
  if (!changedPaths.size) {
    return preservePlayerProfileMediaFields(existingPlayer, incomingPlayer);
  }

  const existingFieldChangeIndex = createPlayerProfileFieldChangeIndex(existingState.changeLog);
  const incomingFieldChangeIndex = createPlayerProfileFieldChangeIndex(incomingState.changeLog);
  const mergedPlayer = { ...existingPlayer };

  changedPaths.forEach((path) => {
    const incomingChangeTime = getPlayerProfileFieldChangeTime(incomingFieldChangeIndex, incomingPlayer, path);
    const existingChangeTime = getPlayerProfileFieldChangeTime(existingFieldChangeIndex, existingPlayer, path);
    if (existingChangeTime && incomingChangeTime && existingChangeTime > incomingChangeTime) {
      return;
    }

    const incomingValue = getNestedPlayerProfileValue(incomingPlayer, path);
    const existingValue = getNestedPlayerProfileValue(existingPlayer, path);
    if (hasPlayerProfileValue(existingValue) && !hasPlayerProfileValue(incomingValue)) {
      return;
    }

    setNestedPlayerProfileValue(mergedPlayer, path, incomingValue);
  });
  if (changedPaths.has("rosterType") && Object.prototype.hasOwnProperty.call(incomingPlayer, "countsInSquad")) {
    mergedPlayer.countsInSquad = incomingPlayer.countsInSquad;
  }

  mergedPlayer.updatedAt = new Date(
    Math.max(getPlayerProfileTimestamp(existingPlayer), getPlayerProfileTimestamp(incomingPlayer), Date.now())
  ).toISOString();
  return preservePlayerProfileMediaFields(mergedPlayer, existingPlayer);
}

async function protectPlayerProfilesStateValue(rawValue, context = {}) {
  const incomingState = parsePlayerProfilesStateValue(rawValue);
  if (!incomingState || !Array.isArray(incomingState.players)) {
    return { ok: false, reason: "Squad player data is invalid and was not saved." };
  }

  const existingEntry = context.previousEntry || await readStateObject(PLAYER_PROFILES_KEY);
  const existingState = parsePlayerProfilesStateValue(existingEntry?.value);
  if (!existingState || !Array.isArray(existingState.players)) {
    return { ok: true, value: JSON.stringify(incomingState), merged: false };
  }

  const previousRevision = getStateEntryRevision(existingEntry);
  const incomingBaseRevision = parseClientRevision(context.clientBaseRevision);
  const incomingIsStale =
    incomingBaseRevision !== null &&
    previousRevision > 0 &&
    incomingBaseRevision < previousRevision;
  const incomingStateTimestamp = getPlayerProfilesStateTimestamp(incomingState);
  const existingByKey = new Map();
  existingState.players.forEach((player) => {
    const key = getPlayerProfileMergeKey(player);
    if (key) {
      existingByKey.set(key, player);
    }
  });

  const usedKeys = new Set();
  const mergedPlayers = incomingState.players
    .filter((player) => player && typeof player === "object" && !Array.isArray(player))
    .map((incomingPlayer) => {
      const key = getPlayerProfileMergeKey(incomingPlayer);
      if (!key) {
        return incomingPlayer;
      }

      usedKeys.add(key);
      const existingPlayer = existingByKey.get(key);
      if (!existingPlayer) {
        return incomingPlayer;
      }
      return incomingIsStale
        ? mergeStalePlayerProfile(existingState, incomingState, existingPlayer, incomingPlayer)
        : preserveNonDestructivePlayerProfileFields(existingPlayer, chooseNewestPlayerProfile(existingPlayer, incomingPlayer));
    });

  existingState.players.forEach((existingPlayer) => {
    const key = getPlayerProfileMergeKey(existingPlayer);
    if (!key || usedKeys.has(key)) {
      return;
    }

    if (getPlayerProfileTimestamp(existingPlayer) > incomingStateTimestamp) {
      mergedPlayers.push(existingPlayer);
    }
  });

  mergedPlayers.sort((first, second) => {
    const firstOrder = Number(first?.rosterOrder);
    const secondOrder = Number(second?.rosterOrder);
    const normalizedFirstOrder = Number.isFinite(firstOrder) ? firstOrder : Number.MAX_SAFE_INTEGER;
    const normalizedSecondOrder = Number.isFinite(secondOrder) ? secondOrder : Number.MAX_SAFE_INTEGER;
    if (normalizedFirstOrder !== normalizedSecondOrder) {
      return normalizedFirstOrder - normalizedSecondOrder;
    }

    return String(first?.name || "").localeCompare(String(second?.name || ""));
  });

  const selectedPlayerId = mergedPlayers.some((player) => player?.id === incomingState.selectedPlayerId)
    ? incomingState.selectedPlayerId
    : mergedPlayers.some((player) => player?.id === existingState.selectedPlayerId)
      ? existingState.selectedPlayerId
      : mergedPlayers[0]?.id || "";
  const mergedState = {
    ...existingState,
    ...incomingState,
    selectedPlayerId,
    players: mergedPlayers,
    changeLog: mergePlayerProfileChangeLog(existingState.changeLog, incomingState.changeLog),
    updatedAt: new Date(
      Math.max(
        getPlayerProfilesStateTimestamp(existingState),
        getPlayerProfilesStateTimestamp(incomingState),
        Date.now()
      )
    ).toISOString(),
  };
  const mergedValue = JSON.stringify(mergedState);
  return { ok: true, value: mergedValue, merged: mergedValue !== rawValue };
}

async function readWorkspaceHubStateValue() {
  const entry = await readStateObject(WORKSPACE_HUB_KEY);
  return entry?.value || "";
}

async function readWorkspaceAccessConfig() {
  const hubState = safeParseJson(await readWorkspaceHubStateValue(), {});
  return normalizeWorkspaceAccessConfig(hubState?.workspaceAccess || {});
}

function getWorkspaceAccessConfigFromHubValue(rawValue) {
  const hubState = safeParseJson(rawValue, {});
  return normalizeWorkspaceAccessConfig(hubState?.workspaceAccess || {});
}

function summarizeWorkspaceAccessChanges(previousRawValue, nextRawValue) {
  const previousAccess = getWorkspaceAccessConfigFromHubValue(previousRawValue);
  const nextAccess = getWorkspaceAccessConfigFromHubValue(nextRawValue);
  const workspaceIds = new Set([...Object.keys(previousAccess), ...Object.keys(nextAccess)]);

  return Array.from(workspaceIds).reduce((changes, workspaceId) => {
    const previousPermission = normalizeWorkspaceAccessEntry(workspaceId, previousAccess[workspaceId]);
    const nextPermission = normalizeWorkspaceAccessEntry(workspaceId, nextAccess[workspaceId]);
    const previousView = previousPermission.view.join(",");
    const previousEdit = previousPermission.edit.join(",");
    const nextView = nextPermission.view.join(",");
    const nextEdit = nextPermission.edit.join(",");

    if (previousView !== nextView || previousEdit !== nextEdit) {
      changes.push({
        workspaceId,
        from: previousPermission,
        to: nextPermission,
      });
    }

    return changes;
  }, []);
}

function canActorViewWorkspace(actor, workspaceId, accessConfig = {}) {
  if (actor?.role === "admin") {
    return true;
  }

  const role = actor?.role || "guest";
  const permission = normalizeWorkspaceAccessEntry(workspaceId, accessConfig[workspaceId]);
  return permission.view.includes(role);
}

function canActorEditWorkspace(actor, workspaceId, accessConfig = {}) {
  if (actor?.role === "admin") {
    return true;
  }

  const role = actor?.role || "guest";
  const permission = normalizeWorkspaceAccessEntry(workspaceId, accessConfig[workspaceId]);
  return permission.view.includes(role) && permission.edit.includes(role);
}

function sanitizeWorkspaceHubRead(rawValue, accessConfig = {}) {
  const hubState = safeParseJson(rawValue, {});
  if (!hubState || typeof hubState !== "object") {
    return rawValue;
  }
  const { activeWorkspaceId, ...sharedState } = hubState;

  return JSON.stringify({
    ...sharedState,
    workspaceAccess: normalizeWorkspaceAccessConfig(accessConfig),
  });
}

async function sanitizeWorkspaceHubWriteForActor(actor, rawValue) {
  const nextState = safeParseJson(rawValue, {});
  if (!nextState || typeof nextState !== "object") {
    return rawValue;
  }
  const { activeWorkspaceId, ...sharedNextState } = nextState;

  if (actor?.role === "admin") {
    return JSON.stringify({
      ...sharedNextState,
      workspaceAccess: normalizeWorkspaceAccessConfig(sharedNextState.workspaceAccess || {}),
    });
  }

  const currentState = safeParseJson(await readWorkspaceHubStateValue(), {});
  return JSON.stringify({
    ...sharedNextState,
    workspaces: currentState?.workspaces || sharedNextState.workspaces,
    workspaceAccess: normalizeWorkspaceAccessConfig(currentState?.workspaceAccess || {}),
  });
}

function canActorViewPrivateMedical(actor) {
  return MEDICAL_PRIVATE_ROLES.has(String(actor?.role || "").trim().toLowerCase());
}

function normalizeMedicalText(value, maxLength = 240) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeMedicalDateValue(value) {
  const cleanValue = normalizeMedicalText(value, 24);
  return /^\d{4}-\d{2}-\d{2}$/.test(cleanValue) ? cleanValue : "";
}

function normalizeMedicalParticipationValue(value, fallback = 100) {
  const numericValue = Number(value);
  return MEDICAL_PARTICIPATION_OPTIONS.has(numericValue) ? numericValue : fallback;
}

function normalizeMedicalStatusValue(value, participation = 100) {
  const cleanValue = normalizeMedicalText(value, 40);
  if (MEDICAL_STATUS_KEYS.has(cleanValue)) {
    return cleanValue;
  }
  if (participation === 0) {
    return "unavailable";
  }
  if (participation <= 25) {
    return "rehab";
  }
  if (participation <= 50) {
    return "controlled";
  }
  if (participation < 100) {
    return "modified";
  }
  return "full";
}

function normalizeMedicalRtpPhaseValue(value, status = "full", participation = 100) {
  const cleanValue = normalizeMedicalText(value, 60);
  if (MEDICAL_RTP_PHASE_KEYS.has(cleanValue)) {
    return cleanValue;
  }
  if (status === "unavailable" || participation === 0) {
    return "medical-restriction";
  }
  if (status === "rehab" || participation <= 25) {
    return "rehab";
  }
  if (status === "modified" || status === "controlled" || participation < 100) {
    return "modified-team";
  }
  if (status === "monitor") {
    return "match-available";
  }
  return "full-training";
}

function getCoachApprovedMedicalNote(item = {}) {
  return item?.shareWithCoach ? normalizeMedicalText(item.coachNote, 480) : "";
}

function sanitizeMedicalPlayerForCoach(player = {}) {
  return {
    id: normalizeMedicalText(player.id, 180),
    name: normalizeMedicalText(player.name, 180),
    number: normalizeMedicalText(player.number, 24),
    position: normalizeMedicalText(player.position, 80),
    photoUrl: normalizeMedicalText(player.photoUrl, 1800),
    sourceUrl: normalizeMedicalText(player.sourceUrl, 1800),
    rosterOrder: Number.isFinite(Number(player.rosterOrder)) ? Number(player.rosterOrder) : null,
    createdAt: normalizeMedicalText(player.createdAt, 40),
    updatedAt: normalizeMedicalText(player.updatedAt, 40),
  };
}

function sanitizeMedicalRecordForCoach(record = {}) {
  const participation = normalizeMedicalParticipationValue(record.participation, 100);
  const status = normalizeMedicalStatusValue(record.status, participation);
  return {
    id: normalizeMedicalText(record.id, 180),
    playerId: normalizeMedicalText(record.playerId, 180),
    date: normalizeMedicalDateValue(record.date),
    status,
    participation,
    actualParticipation: "not-logged",
    comment: "",
    coachNote: getCoachApprovedMedicalNote(record),
    shareWithCoach: Boolean(record.shareWithCoach),
    rtpPhase: normalizeMedicalRtpPhaseValue(record.rtpPhase, status, participation),
    clearance: {},
    gates: {},
    source: normalizeMedicalText(record.source, 80),
    injuryPlanId: normalizeMedicalText(record.injuryPlanId, 180),
    createdAt: normalizeMedicalText(record.createdAt, 40),
    createdBy: "",
  };
}

function sanitizeMedicalInjuryPlanForCoach(plan = {}) {
  const participation = normalizeMedicalParticipationValue(plan.participation, 0);
  const status = normalizeMedicalStatusValue(plan.status, participation);
  return {
    id: normalizeMedicalText(plan.id, 180),
    playerId: normalizeMedicalText(plan.playerId, 180),
    injuryType: "Availability plan",
    bodyArea: "",
    startDate: normalizeMedicalDateValue(plan.startDate),
    endDate: normalizeMedicalDateValue(plan.endDate),
    duration: Math.max(1, Number(plan.duration) || 1),
    durationUnit: ["days", "weeks", "months"].includes(plan.durationUnit) ? plan.durationUnit : "weeks",
    status,
    participation,
    reviewDate: "",
    rtpPhase: normalizeMedicalRtpPhaseValue(plan.rtpPhase, status, participation),
    phase: "Coach-safe availability plan",
    clearance: {},
    gates: {},
    coachNote: getCoachApprovedMedicalNote(plan),
    shareWithCoach: Boolean(plan.shareWithCoach),
    comment: "",
    createdAt: normalizeMedicalText(plan.createdAt, 40),
    updatedAt: normalizeMedicalText(plan.updatedAt, 40),
    createdBy: "",
  };
}

function sanitizeMedicalTeamStateForCoach(rawValue) {
  const state = safeParseJson(rawValue, {});
  if (!state || typeof state !== "object") {
    return JSON.stringify({
      selectedDate: "",
      selectedPlayerId: "",
      players: [],
      records: [],
      injuryPlans: [],
      rosterVersion: "",
      securityView: "coach-safe",
    });
  }

  return JSON.stringify({
    selectedDate: normalizeMedicalDateValue(state.selectedDate),
    selectedPlayerId: normalizeMedicalText(state.selectedPlayerId, 180),
    players: Array.isArray(state.players) ? state.players.map(sanitizeMedicalPlayerForCoach) : [],
    records: Array.isArray(state.records) ? state.records.map(sanitizeMedicalRecordForCoach) : [],
    injuryPlans: Array.isArray(state.injuryPlans) ? state.injuryPlans.map(sanitizeMedicalInjuryPlanForCoach) : [],
    rosterVersion: normalizeMedicalText(state.rosterVersion, 120),
    securityView: "coach-safe",
  });
}

function summarizeMedicalStateForAudit(rawValue) {
  const state = safeParseJson(rawValue, {});
  const records = Array.isArray(state?.records) ? state.records : [];
  const injuryPlans = Array.isArray(state?.injuryPlans) ? state.injuryPlans : [];
  const policy = state?.policy && typeof state.policy === "object" ? state.policy : {};
  return {
    playerCount: Array.isArray(state?.players) ? state.players.length : 0,
    recordCount: records.length,
    planCount: injuryPlans.length,
    coachSharedRecordCount: records.filter((record) => record?.shareWithCoach).length,
    coachSharedPlanCount: injuryPlans.filter((plan) => plan?.shareWithCoach).length,
    selectedDate: normalizeMedicalDateValue(state?.selectedDate),
    retentionMonths: Math.max(0, Math.min(120, Number(policy.retentionMonths) || 0)),
    consentRequired: policy.consentRequired === true || policy.consentRequired === "true",
    policyReviewDate: normalizeMedicalDateValue(policy.lastReviewed),
  };
}

function protectMedicalStateValue(rawValue, context = {}) {
  const incomingState = safeParseJson(rawValue, null);
  if (!incomingState || typeof incomingState !== "object" || Array.isArray(incomingState)) {
    return { ok: false, status: 400, reason: "Medical Team data is invalid and was not saved." };
  }

  const previousSummary = summarizeMedicalStateForAudit(context.previousEntry?.value || "");
  const incomingSummary = summarizeMedicalStateForAudit(rawValue);
  const previousClinicalCount = previousSummary.recordCount + previousSummary.planCount;
  const incomingClinicalCount = incomingSummary.recordCount + incomingSummary.planCount;

  if (previousClinicalCount > 0 && incomingClinicalCount === 0) {
    return {
      ok: false,
      status: 409,
      clinicalReductionBlocked: true,
      reason:
        "Medical Team data was not saved because it would remove all clinical records and injury plans. Use an explicit Medical reset or restore flow.",
    };
  }

  return { ok: true, value: rawValue };
}

async function appendMedicalStateAudit(actor, rawValue) {
  await appendAuditLog(actor, {
    action: "medical.updated",
    summary: "Updated Medical Team state",
    details: summarizeMedicalStateForAudit(rawValue),
  });
}

function protectPlatformAppearanceStateValue(rawValue, context = {}) {
  try {
    const normalizedValue = normalizePlatformAppearanceValue(rawValue, {
      updatedAt: new Date().toISOString(),
      updatedBy: context.actor?.id || "",
    });
    return { ok: true, value: normalizedValue };
  } catch (error) {
    return {
      ok: false,
      status: 400,
      reason: error?.message || "Platform Appearance settings are invalid and were not saved.",
    };
  }
}

async function appendPlatformAppearanceAudit(actor, previousEntry, nextValue) {
  await appendAuditLog(actor, {
    action: "appearance.updated",
    summary: "Published Platform Appearance settings",
    details: summarizePlatformAppearanceChange(previousEntry?.value || "", nextValue),
  });
}

async function appendDataSafetyWriteAudit(actor, previousEntry, nextEntry, merged = false) {
  if (!nextEntry?.key) {
    return;
  }

  await appendAuditLog(actor, {
    action: "data-safety.saved",
    summary: `Saved ${nextEntry.moduleId || nextEntry.key} through the central data pipeline`,
    details: {
      key: nextEntry.key,
      moduleId: nextEntry.moduleId,
      organizationId: nextEntry.organizationId,
      mergePolicy: nextEntry.mergePolicy,
      merged: Boolean(merged),
      before: previousEntry ? getStateEntryMetadata(previousEntry) : null,
      after: getStateEntryMetadata(nextEntry),
    },
  });
}

async function authorizeStateWrite(actor, key, rawValue, removed = false, context = {}) {
  if (key === PLATFORM_APPEARANCE_KEY && removed) {
    return { ok: false, status: 403, reason: "Platform Appearance settings cannot be removed. Publish defaults instead." };
  }

  if (actor?.role === "admin") {
    if (key === PLATFORM_APPEARANCE_KEY && !removed) {
      return protectPlatformAppearanceStateValue(rawValue, { ...context, actor });
    }

    if (key === SESSION_PLANNER_KEY && !removed) {
      return protectSessionPlannerStateValue(rawValue);
    }

    if (key === SESSION_EXERCISE_LIBRARY_KEY && !removed) {
      return protectSessionPlannerExerciseLibraryValue(rawValue);
    }

    if (key === PERIODIZATION_KEY && !removed) {
      return protectPeriodizationStateValue(rawValue);
    }

    if (key === PLAYER_PROFILES_KEY && !removed) {
      return protectPlayerProfilesStateValue(rawValue, context);
    }

    if (key === MEDICAL_TEAM_KEY && !removed) {
      return protectMedicalStateValue(rawValue, context);
    }

    if (key === WORKSPACE_HUB_KEY && !removed) {
      return { ok: true, value: await sanitizeWorkspaceHubWriteForActor(actor, rawValue) };
    }

    return { ok: true, value: rawValue };
  }

  if (ADMIN_ONLY_STATE_KEYS.has(key)) {
    return { ok: false, reason: "Only admins can sync this data centrally." };
  }

  if (key === WORKSPACE_HUB_KEY) {
    if (removed) {
      return { ok: false, reason: "Only admins can remove workspace settings." };
    }

    return { ok: true, value: removed ? rawValue : await sanitizeWorkspaceHubWriteForActor(actor, rawValue) };
  }

  if (key === PLATFORM_STRUCTURE_KEY) {
    if (removed) {
      return { ok: false, reason: "Club/team structure cannot be removed through central sync." };
    }
    if (!["admin", "club-admin"].includes(String(actor?.role || "").trim().toLowerCase())) {
      return { ok: false, reason: "Only platform or club admins can sync club/team structure." };
    }
    return { ok: true, value: rawValue };
  }

  const workspaceId = STATE_KEY_WORKSPACE_EDIT_MAP[key];
  if (!workspaceId) {
    return { ok: true, value: rawValue };
  }

  const accessConfig = await readWorkspaceAccessConfig();
  if (!canActorEditWorkspace(actor, workspaceId, accessConfig)) {
    return { ok: false, reason: `You do not have edit access for ${workspaceId}.` };
  }

  if (key === SESSION_PLANNER_KEY && !removed) {
    return protectSessionPlannerStateValue(rawValue);
  }

  if (key === SESSION_EXERCISE_LIBRARY_KEY && !removed) {
    return protectSessionPlannerExerciseLibraryValue(rawValue);
  }

  if (key === PERIODIZATION_KEY && !removed) {
    return protectPeriodizationStateValue(rawValue);
  }

  if (key === PLAYER_PROFILES_KEY && !removed) {
    return protectPlayerProfilesStateValue(rawValue, context);
  }

  if (key === MEDICAL_TEAM_KEY && !removed) {
    return protectMedicalStateValue(rawValue, context);
  }

  return { ok: true, value: rawValue };
}

function filterStateEntriesForActor(actor, entries = {}) {
  const accessConfig = getWorkspaceAccessConfigFromHubValue(entries[WORKSPACE_HUB_KEY]);
  return Object.entries(entries).reduce((filtered, [key, value]) => {
    if (key === WORKSPACE_HUB_KEY) {
      filtered[key] = sanitizeWorkspaceHubRead(value, accessConfig);
      return filtered;
    }

    if (actor?.role === "admin") {
      filtered[key] = value;
      return filtered;
    }

    if (ADMIN_ONLY_STATE_KEYS.has(key)) {
      return filtered;
    }

    if (key === PLATFORM_STRUCTURE_KEY && ["club-admin", "team-admin"].includes(String(actor?.role || "").trim().toLowerCase())) {
      filtered[key] = value;
      return filtered;
    }

    const workspaceId = STATE_KEY_WORKSPACE_EDIT_MAP[key];
    if (workspaceId && !canActorViewWorkspace(actor, workspaceId, accessConfig)) {
      return filtered;
    }

    if (key === MEDICAL_TEAM_KEY && !canActorViewPrivateMedical(actor)) {
      filtered[key] = sanitizeMedicalTeamStateForCoach(value);
      return filtered;
    }

    filtered[key] = value;
    return filtered;
  }, {});
}

function filterStateMetadataForEntries(metadata = {}, entries = {}) {
  return Object.keys(entries || {}).reduce((filtered, key) => {
    const value = String(entries[key] ?? "");
    const baseMetadata = metadata[key] || {};
    filtered[key] = {
      updatedAt: baseMetadata.updatedAt || "",
      updatedBy: baseMetadata.updatedBy || "",
      revision: getStateEntryRevision(baseMetadata),
      organizationId: baseMetadata.organizationId || "global",
      moduleId: baseMetadata.moduleId || dataSafetyRegistry.getByKey(key)?.moduleId || "",
      mergePolicy: baseMetadata.mergePolicy || dataSafetyRegistry.getByKey(key)?.mergePolicy || "",
      hash: hashStateValue(value),
      size: Buffer.byteLength(value, "utf8"),
    };
    return filtered;
  }, {});
}

async function writeStateObject(entry) {
  const path = objectPathForKey(entry.key);
  const result = await storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${path}`, {
    method: "PUT",
    headers: {
      "x-upsert": "true",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(entry),
  });

  if (!result.ok && result.status === 404) {
    return storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${path}`, {
      method: "POST",
      headers: {
        "x-upsert": "true",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify(entry),
    });
  }

  return result;
}

async function removeStateObject(key) {
  const path = objectPathForKey(key);
  return storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}`, {
    method: "DELETE",
    body: JSON.stringify({ prefixes: [path] }),
  });
}

async function listStateObjects() {
  const entries = {};
  const metadata = {};
  await Promise.all(Array.from(CENTRAL_STATE_KEYS).map(async (key) => {
    const entry = await readStateObject(key);
    if (entry?.key && !entry.removed) {
      entries[entry.key] = entry.value ?? "";
      metadata[entry.key] = getStateEntryMetadata(entry);
    }
  }));

  return { entries, metadata };
}

async function applyStateEntries(actor, entries = {}, metadata = {}) {
  const results = [];
  for (const [key, rawValue] of Object.entries(entries)) {
    const normalizedKey = sanitizeStateKey(key);
    if (!normalizedKey) {
      continue;
    }

    const contract = dataSafetyRegistry.requireByKey(normalizedKey);
    const previousEntry = await readStateObject(normalizedKey);
    const clientBaseRevision = getClientBaseRevision(metadata, normalizedKey);
    const authorization = await authorizeStateWrite(actor, normalizedKey, rawValue, false, {
      previousEntry,
      clientBaseRevision,
    });
    if (!authorization.ok) {
      return {
        ok: false,
        ...authorization,
        reason: authorization.reason || `Could not sync ${normalizedKey}.`,
      };
    }

    const contentSafety = validateCentralStateContent(normalizedKey, authorization.value, contract);
    if (!contentSafety.ok) {
      return contentSafety;
    }

    const staleWrite = getStaleWriteRejection(
      contract,
      previousEntry,
      authorization,
      clientBaseRevision
    );
    if (staleWrite) {
      return staleWrite;
    }

    const entry = normalizeStateEntry(normalizedKey, authorization.value, actor, false, previousEntry);
    if (!entry) {
      continue;
    }

    const result = await writeStateObject(entry);
    if (!result.ok) {
      return { ok: false, reason: result.reason || `Could not sync ${entry.key}.` };
    }
    await appendDataSafetyWriteAudit(actor, previousEntry, entry, authorization.merged);
    if (normalizedKey === PLATFORM_APPEARANCE_KEY) {
      await appendPlatformAppearanceAudit(actor, previousEntry, authorization.value);
    }
    if (normalizedKey === SESSION_PLANNER_KEY) {
      await appendSessionPlannerHistory(actor, previousEntry?.value || "", authorization.value);
    }
    if (normalizedKey === WORKSPACE_HUB_KEY) {
      const changedAccess = summarizeWorkspaceAccessChanges(previousEntry?.value || "", authorization.value);
      if (changedAccess.length) {
        await appendAuditLog(actor, {
          action: "access.updated",
          summary: "Updated role access permissions",
          details: { changedAccess },
        });
      }
    }
    if (normalizedKey === MEDICAL_TEAM_KEY) {
      await appendMedicalStateAudit(actor, authorization.value);
    }
    results.push({
      key: entry.key,
      metadata: getStateEntryMetadata(entry),
      merged: Boolean(authorization.merged),
      revision: entry.revision,
    });
  }

  return {
    ok: true,
    keys: results.map((result) => result.key),
    results,
  };
}

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  const actor = await getCurrentActor(req.headers?.authorization || req.headers?.Authorization);
  if (!actor) {
    return sendJson(res, 401, { ok: false, reason: "You must be signed in." });
  }

  const security = guardApiRequest(req, res, {
    route: "/api/app-state",
    moduleId: "app-state",
    actor,
    enforcePermission: false,
  });
  if (!security.ok) {
    return;
  }

  const bucket = await ensureStateBucket();
  if (!bucket.ok) {
    return sendJson(res, 500, { ok: false, reason: bucket.reason || "Central state bucket is not available." });
  }

  try {
    if (req.method === "GET") {
      const stateObjects = await listStateObjects();
      const entries = filterStateEntriesForActor(actor, stateObjects.entries);
      return sendJson(res, 200, {
        ok: true,
        entries,
        metadata: filterStateMetadataForEntries(stateObjects.metadata, entries),
        updatedAt: new Date().toISOString(),
      });
    }

    if (req.method !== "POST" && req.method !== "PUT" && req.method !== "PATCH" && req.method !== "DELETE") {
      return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
    }

    const body = await parseJsonBody(req);
    if (body?.entries && typeof body.entries === "object" && req.method !== "DELETE") {
      const result = await applyStateEntries(actor, body.entries, body.metadata || body.revisions || {});
      return sendJson(res, result.ok ? 200 : result.status || 400, result);
    }

    const key = sanitizeStateKey(body?.key || new URL(req.url, "http://localhost").searchParams.get("key"));
    if (!key) {
      return sendJson(res, 400, { ok: false, reason: "Missing or invalid state key." });
    }

    const removed = req.method === "DELETE" || body?.removed === true;
    if (removed) {
      const contract = dataSafetyRegistry.requireByKey(key);
      const previousEntry = await readStateObject(key);
      const clientBaseRevision = getClientBaseRevision(body?.metadata || body, key);
      const authorization = await authorizeStateWrite(actor, key, "", true, {
        previousEntry,
        clientBaseRevision,
      });
      if (!authorization.ok) {
        return sendJson(res, authorization.status || 403, { ok: false, ...authorization });
      }

      const staleWrite = getStaleWriteRejection(
        contract,
        previousEntry,
        authorization,
        clientBaseRevision
      );
      if (staleWrite) {
        return sendJson(res, staleWrite.status, staleWrite);
      }

      const result = await removeStateObject(key);
      if (!result.ok && result.status !== 404) {
        return sendJson(res, 400, { ok: false, reason: result.reason || "Could not remove central state." });
      }

      return sendJson(res, 200, { ok: true, key, removed: true });
    }

    const contract = dataSafetyRegistry.requireByKey(key);
    const previousEntry = await readStateObject(key);
    const clientBaseRevision = getClientBaseRevision(body?.metadata || body, key);
    const authorization = await authorizeStateWrite(actor, key, body?.value, false, {
      previousEntry,
      clientBaseRevision,
    });
    if (!authorization.ok) {
      return sendJson(res, authorization.status || 403, { ok: false, ...authorization });
    }

    const contentSafety = validateCentralStateContent(key, authorization.value, contract);
    if (!contentSafety.ok) {
      return sendJson(res, contentSafety.status || 400, contentSafety);
    }

    const staleWrite = getStaleWriteRejection(
      contract,
      previousEntry,
      authorization,
      clientBaseRevision
    );
    if (staleWrite) {
      return sendJson(res, staleWrite.status, staleWrite);
    }

    const entry = normalizeStateEntry(key, authorization.value, actor, false, previousEntry);
    const result = await writeStateObject(entry);
    if (!result.ok) {
      return sendJson(res, 400, { ok: false, reason: result.reason || "Could not sync central state." });
    }

    await appendDataSafetyWriteAudit(actor, previousEntry, entry, authorization.merged);

    if (key === PLATFORM_APPEARANCE_KEY) {
      await appendPlatformAppearanceAudit(actor, previousEntry, authorization.value);
    }

    if (key === SESSION_PLANNER_KEY) {
      const historyEntries = await appendSessionPlannerHistory(actor, previousEntry?.value || "", authorization.value);
      if (historyEntries.length) {
        await appendAuditLog(actor, {
          action: "session.updated",
          summary: "Updated Session Planner",
          details: {
            sessions: historyEntries.map((historyEntry) => ({
              date: historyEntry.date,
              action: historyEntry.action,
              beforeBlockCount: historyEntry.beforeBlockCount,
              afterBlockCount: historyEntry.afterBlockCount,
            })),
          },
        });
      }
    }

    if (key === WORKSPACE_HUB_KEY) {
      const changedAccess = summarizeWorkspaceAccessChanges(previousEntry?.value || "", authorization.value);
      if (changedAccess.length) {
        await appendAuditLog(actor, {
          action: "access.updated",
          summary: "Updated role access permissions",
          details: {
            changedAccess,
          },
        });
      }
    }

    if (key === MEDICAL_TEAM_KEY) {
      await appendMedicalStateAudit(actor, authorization.value);
    }

    return sendJson(res, 200, {
      ok: true,
      key: entry.key,
      updatedAt: entry.updatedAt,
      updatedBy: entry.updatedBy,
      revision: entry.revision,
      organizationId: entry.organizationId,
      moduleId: entry.moduleId,
      value: entry.value,
      metadata: getStateEntryMetadata(entry),
      merged: Boolean(authorization.merged),
    });
  } catch (error) {
    if (error?.code === "BODY_TOO_LARGE") {
      return sendJson(res, 413, { ok: false, reason: error.message || "Request body is too large." });
    }
    return sendJson(res, 500, { ok: false, reason: error?.message || "Central state API failed." });
  }
};
