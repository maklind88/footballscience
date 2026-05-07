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
const crypto = require("crypto");

const STATE_BUCKET = "footballscience-app-state";
const STATE_PREFIX = "global";
const MAX_STATE_VALUE_BYTES = 12 * 1024 * 1024;
const SESSION_PLANNER_KEY = "football-session-planner-v3";
const SESSION_EXERCISE_LIBRARY_KEY = "football-session-exercise-library-v1";
const SESSION_PLANNER_REDUCTION_GUARD_KEY = "blockReductionGuard";
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
];
const SESSION_PLANNER_BLOCK_MERGE_FIELD_SET = new Set(SESSION_PLANNER_BLOCK_MERGE_FIELDS);
const CENTRAL_STATE_KEYS = new Set([
  "football-workspace-hub-v3",
  "football-periodization-v2",
  "football-schedule-v1",
  SESSION_PLANNER_KEY,
  SESSION_EXERCISE_LIBRARY_KEY,
  "football-session-exercise-library-backup-v1",
  "football-dashboard-tasks-v1",
  "football-dashboard-chat-v1",
  "football-dashboard-notification-seen-v1",
  "football-dashboard-tutorial-prefs-v1",
  "football-dashboard-news-seen-v1",
  "football-medical-team-v1",
  "football-player-profiles-v1",
  "football-simulator-sequence-v1",
  "football-simulator-sequence-library-v2",
]);
const WORKSPACE_HUB_KEY = "football-workspace-hub-v3";
const DEFAULT_WORKSPACE_ACCESS = {
  schedule: ["admin", "coach", "analyst", "performance", "medical", "guest"],
  periodization: ["admin", "coach", "analyst", "performance", "medical"],
  "session-planner": ["admin", "coach", "analyst", "performance", "medical"],
  "player-profiles": ["admin", "coach", "performance", "medical"],
  "analysis-room": ["admin", "coach", "analyst"],
  "medical-team": ["admin", "coach", "performance", "medical"],
  staff: ["admin"],
  admin: ["admin"],
  "team-identity": ["admin", "coach"],
  "game-simulator": ["admin", "coach", "analyst", "performance"],
};
const DEFAULT_WORKSPACE_EDIT_ACCESS = {
  schedule: ["admin", "coach"],
  periodization: ["admin", "coach", "performance"],
  "session-planner": ["admin", "coach"],
  "player-profiles": ["admin", "coach"],
  "analysis-room": ["admin", "analyst"],
  "medical-team": ["admin", "medical", "performance"],
  staff: ["admin"],
  admin: ["admin"],
  "team-identity": ["admin", "coach"],
  "game-simulator": ["admin", "coach", "analyst"],
};
const REQUIRED_WORKSPACE_ACCESS = {
  "session-planner": {
    view: ["admin", "coach", "analyst", "performance", "medical"],
    edit: ["admin", "coach"],
  },
};
const STATE_KEY_WORKSPACE_EDIT_MAP = {
  "football-schedule-v1": "schedule",
  "football-periodization-v2": "periodization",
  [SESSION_PLANNER_KEY]: "session-planner",
  [SESSION_EXERCISE_LIBRARY_KEY]: "session-planner",
  "football-session-exercise-library-backup-v1": "session-planner",
  "football-medical-team-v1": "medical-team",
  "football-player-profiles-v1": "player-profiles",
  "football-simulator-sequence-v1": "game-simulator",
  "football-simulator-sequence-library-v2": "game-simulator",
};
const ADMIN_ONLY_STATE_KEYS = new Set(["mak-coaching-platform-users-v1"]);

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

function getStateEntryMetadata(entry = {}) {
  const value = String(entry?.value ?? "");
  return {
    updatedAt: entry?.updatedAt || "",
    updatedBy: entry?.updatedBy || "",
    hash: entry?.hash || hashStateValue(value),
    size: Buffer.byteLength(value, "utf8"),
  };
}

function normalizeStateEntry(key, value, actor, removed = false) {
  const normalizedKey = sanitizeStateKey(key);
  if (!normalizedKey) {
    return null;
  }

  const normalizedValue = String(value ?? "");
  if (!removed && Buffer.byteLength(normalizedValue, "utf8") > MAX_STATE_VALUE_BYTES) {
    throw new Error(`${normalizedKey} is too large to sync centrally.`);
  }

  return {
    schema: "footballscience-app-state-v1",
    key: normalizedKey,
    value: normalizedValue,
    removed: Boolean(removed),
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.id || "",
    hash: hashStateValue(normalizedValue),
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

function mergeSessionPlannerSessions(existingSession = {}, incomingSession = {}, dateValue, canReduceBlocks = false) {
  const existingBlocks = Array.isArray(existingSession.blocks) ? existingSession.blocks : [];
  const incomingBlocks = Array.isArray(incomingSession.blocks) ? incomingSession.blocks : [];
  const existingById = new Map(existingBlocks.map((block) => [getSessionPlannerBlockId(block), block]).filter(([id]) => id));
  const incomingIds = new Set();
  const blocks = incomingBlocks.map((incomingBlock) => {
    const blockId = getSessionPlannerBlockId(incomingBlock);
    if (blockId) {
      incomingIds.add(blockId);
    }
    const existingBlock = existingById.get(blockId);
    return existingBlock ? mergeSessionPlannerBlocks(existingBlock, incomingBlock) : cloneSessionPlannerMergeValue(incomingBlock);
  });

  if (!canReduceBlocks) {
    existingBlocks.forEach((existingBlock) => {
      const blockId = getSessionPlannerBlockId(existingBlock);
      if (!blockId || !incomingIds.has(blockId)) {
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

function normalizeSessionPlannerReductionGuards(state) {
  const freshGuards = getFreshSessionPlannerReductionGuards(state);
  if (Object.keys(freshGuards).length) {
    state[SESSION_PLANNER_REDUCTION_GUARD_KEY] = freshGuards;
    return;
  }

  delete state[SESSION_PLANNER_REDUCTION_GUARD_KEY];
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
    return { ok: true, value: JSON.stringify(incomingState), merged: false };
  }

  const incomingSessions = getSessionPlannerSessions(incomingState);
  const existingSessions = getSessionPlannerSessions(existingState);
  const mergedState = {
    ...incomingState,
    sessions: {},
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
        canReduceSessionPlannerBlocks(incomingState, dateValue)
      );
      return;
    }

    if (existingSession) {
      mergedState.sessions[dateValue] = existingSession;
      return;
    }

    if (incomingSession) {
      mergedState.sessions[dateValue] = incomingSession;
    }
  });

  normalizeSessionPlannerReductionGuards(mergedState);
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

  return JSON.stringify({
    ...hubState,
    workspaceAccess: normalizeWorkspaceAccessConfig(accessConfig),
  });
}

async function sanitizeWorkspaceHubWriteForActor(actor, rawValue) {
  const nextState = safeParseJson(rawValue, {});
  if (!nextState || typeof nextState !== "object") {
    return rawValue;
  }

  if (actor?.role === "admin") {
    return JSON.stringify({
      ...nextState,
      workspaceAccess: normalizeWorkspaceAccessConfig(nextState.workspaceAccess || {}),
    });
  }

  const currentState = safeParseJson(await readWorkspaceHubStateValue(), {});
  return JSON.stringify({
    ...nextState,
    workspaces: currentState?.workspaces || nextState.workspaces,
    workspaceAccess: normalizeWorkspaceAccessConfig(currentState?.workspaceAccess || {}),
  });
}

async function authorizeStateWrite(actor, key, rawValue, removed = false) {
  if (actor?.role === "admin") {
    if (key === SESSION_PLANNER_KEY && !removed) {
      return protectSessionPlannerStateValue(rawValue);
    }

    if (key === SESSION_EXERCISE_LIBRARY_KEY && !removed) {
      return protectSessionPlannerExerciseLibraryValue(rawValue);
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

  return { ok: true, value: rawValue };
}

function filterStateEntriesForActor(actor, entries = {}) {
  if (actor?.role === "admin") {
    return entries;
  }

  const accessConfig = getWorkspaceAccessConfigFromHubValue(entries[WORKSPACE_HUB_KEY]);
  return Object.entries(entries).reduce((filtered, [key, value]) => {
    if (ADMIN_ONLY_STATE_KEYS.has(key)) {
      return filtered;
    }

    if (key === WORKSPACE_HUB_KEY) {
      filtered[key] = sanitizeWorkspaceHubRead(value, accessConfig);
      return filtered;
    }

    const workspaceId = STATE_KEY_WORKSPACE_EDIT_MAP[key];
    if (workspaceId && !canActorViewWorkspace(actor, workspaceId, accessConfig)) {
      return filtered;
    }

    filtered[key] = value;
    return filtered;
  }, {});
}

function filterStateMetadataForEntries(metadata = {}, entries = {}) {
  return Object.keys(entries || {}).reduce((filtered, key) => {
    if (metadata[key]) {
      filtered[key] = metadata[key];
    }
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

async function applyStateEntries(actor, entries = {}) {
  const results = [];
  for (const [key, rawValue] of Object.entries(entries)) {
    const normalizedKey = sanitizeStateKey(key);
    if (!normalizedKey) {
      continue;
    }

    const previousEntry =
      normalizedKey === WORKSPACE_HUB_KEY || normalizedKey === SESSION_PLANNER_KEY
        ? await readStateObject(normalizedKey)
        : null;
    const authorization = await authorizeStateWrite(actor, normalizedKey, rawValue, false);
    if (!authorization.ok) {
      return { ok: false, reason: authorization.reason || `Could not sync ${normalizedKey}.` };
    }

    const entry = normalizeStateEntry(normalizedKey, authorization.value, actor, false);
    if (!entry) {
      continue;
    }

    const result = await writeStateObject(entry);
    if (!result.ok) {
      return { ok: false, reason: result.reason || `Could not sync ${entry.key}.` };
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
    results.push({
      key: entry.key,
      metadata: getStateEntryMetadata(entry),
      merged: Boolean(authorization.merged),
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
      const result = await applyStateEntries(actor, body.entries);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    const key = sanitizeStateKey(body?.key || new URL(req.url, "http://localhost").searchParams.get("key"));
    if (!key) {
      return sendJson(res, 400, { ok: false, reason: "Missing or invalid state key." });
    }

    const removed = req.method === "DELETE" || body?.removed === true;
    if (removed) {
      const authorization = await authorizeStateWrite(actor, key, "", true);
      if (!authorization.ok) {
        return sendJson(res, 403, { ok: false, reason: authorization.reason || "You do not have edit access." });
      }

      const result = await removeStateObject(key);
      if (!result.ok && result.status !== 404) {
        return sendJson(res, 400, { ok: false, reason: result.reason || "Could not remove central state." });
      }

      return sendJson(res, 200, { ok: true, key, removed: true });
    }

    const previousEntry =
      key === WORKSPACE_HUB_KEY || key === SESSION_PLANNER_KEY
        ? await readStateObject(key)
        : null;
    const authorization = await authorizeStateWrite(actor, key, body?.value, false);
    if (!authorization.ok) {
      return sendJson(res, 403, { ok: false, reason: authorization.reason || "You do not have edit access." });
    }

    const entry = normalizeStateEntry(key, authorization.value, actor, false);
    const result = await writeStateObject(entry);
    if (!result.ok) {
      return sendJson(res, 400, { ok: false, reason: result.reason || "Could not sync central state." });
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

    return sendJson(res, 200, {
      ok: true,
      key: entry.key,
      updatedAt: entry.updatedAt,
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
