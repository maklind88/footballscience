const {
  getCurrentActor,
  sendCorsHeaders,
  sendJson,
  parseJsonBody,
} = require("./_lib/supabase-admin.js");
const { appendAuditLog } = require("./_lib/audit-log.js");
const { guardApiRequest } = require("./_lib/platform-security.js");
const {
  appendSessionPlannerHistory,
  getSessionHistoryEntries,
  readSessionPlannerStateEntry,
  writeSessionPlannerStateValue,
  parseSessionPlannerState,
} = require("./_lib/session-history.js");

const SESSION_HISTORY_VIEW_ROLES = new Set(["admin"]);
const SESSION_HISTORY_EDIT_ROLES = new Set(["admin"]);
const SESSION_PLANNER_BLOCK_DELETION_TOMBSTONE_KEY = "blockDeletionTombstones";

function canViewSessionHistory(actor) {
  return SESSION_HISTORY_VIEW_ROLES.has(actor?.role);
}

function canRestoreSessionHistory(actor) {
  return SESSION_HISTORY_EDIT_ROLES.has(actor?.role);
}

function getEntrySession(entry, mode = "before") {
  return mode === "after" ? entry?.afterSession : entry?.beforeSession;
}

function getRestoreBlockIds(session = {}) {
  return new Set(
    (Array.isArray(session?.blocks) ? session.blocks : [])
      .map((block) => String(block?.id || "").trim())
      .filter(Boolean)
  );
}

function pruneRestoreTombstoneState(state) {
  const tombstones = state?.[SESSION_PLANNER_BLOCK_DELETION_TOMBSTONE_KEY];
  if (!tombstones || typeof tombstones !== "object" || Array.isArray(tombstones)) {
    delete state[SESSION_PLANNER_BLOCK_DELETION_TOMBSTONE_KEY];
    return;
  }

  Object.keys(tombstones).forEach((dateValue) => {
    const blockMap = tombstones[dateValue];
    if (!blockMap || typeof blockMap !== "object" || Array.isArray(blockMap) || !Object.keys(blockMap).length) {
      delete tombstones[dateValue];
    }
  });

  if (!Object.keys(tombstones).length) {
    delete state[SESSION_PLANNER_BLOCK_DELETION_TOMBSTONE_KEY];
  }
}

function clearRestoredSessionBlockTombstones(state, dateValue, restoreSession) {
  const blockIds = getRestoreBlockIds(restoreSession);
  const blockMap = state?.[SESSION_PLANNER_BLOCK_DELETION_TOMBSTONE_KEY]?.[dateValue];
  if (!blockIds.size || !blockMap || typeof blockMap !== "object" || Array.isArray(blockMap)) {
    return;
  }

  blockIds.forEach((blockId) => {
    delete blockMap[blockId];
  });
  pruneRestoreTombstoneState(state);
}

function markRemovedSessionBlocksTombstoned(state, dateValue, previousSession) {
  const blockIds = getRestoreBlockIds(previousSession);
  if (!blockIds.size || !dateValue) {
    return;
  }

  const tombstones = state[SESSION_PLANNER_BLOCK_DELETION_TOMBSTONE_KEY] &&
    typeof state[SESSION_PLANNER_BLOCK_DELETION_TOMBSTONE_KEY] === "object" &&
    !Array.isArray(state[SESSION_PLANNER_BLOCK_DELETION_TOMBSTONE_KEY])
    ? state[SESSION_PLANNER_BLOCK_DELETION_TOMBSTONE_KEY]
    : {};
  const blockMap = tombstones[dateValue] &&
    typeof tombstones[dateValue] === "object" &&
    !Array.isArray(tombstones[dateValue])
    ? tombstones[dateValue]
    : {};
  const timestamp = new Date().toISOString();
  blockIds.forEach((blockId) => {
    blockMap[blockId] = timestamp;
  });
  tombstones[dateValue] = blockMap;
  state[SESSION_PLANNER_BLOCK_DELETION_TOMBSTONE_KEY] = tombstones;
  pruneRestoreTombstoneState(state);
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
    route: "/api/session-history",
    moduleId: "session-planner",
    actor,
    action: "restore",
    permissionDeniedReason: "You do not have access to Session Planner history.",
  });
  if (!security.ok) {
    return;
  }

  if (!canViewSessionHistory(actor)) {
    return sendJson(res, 403, { ok: false, reason: "You do not have access to Session Planner history." });
  }

  try {
    if (req.method === "GET") {
      const query = new URL(req.url, "http://localhost").searchParams;
      const entries = await getSessionHistoryEntries({
        date: query.get("date") || "",
        limit: query.get("limit") || 60,
      });
      return sendJson(res, 200, {
        ok: true,
        entries,
        updatedAt: new Date().toISOString(),
      });
    }

    if (req.method !== "POST") {
      return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
    }

    if (!canRestoreSessionHistory(actor)) {
      return sendJson(res, 403, { ok: false, reason: "You do not have edit access for Session Planner." });
    }

    const body = await parseJsonBody(req);
    if (body?.action !== "restore") {
      return sendJson(res, 400, { ok: false, reason: "Missing restore action." });
    }

    const entryId = String(body.entryId || "").trim();
    if (!entryId) {
      return sendJson(res, 400, { ok: false, reason: "Missing history entry id." });
    }

    const entries = await getSessionHistoryEntries({ limit: 160 });
    const historyEntry = entries.find((entry) => entry.id === entryId);
    if (!historyEntry) {
      return sendJson(res, 404, { ok: false, reason: "History entry not found." });
    }

    const restoreMode = body.mode === "after" ? "after" : "before";
    const restoreSession = getEntrySession(historyEntry, restoreMode);
    const dateValue = restoreSession?.date || historyEntry.date;
    if (!dateValue) {
      return sendJson(res, 400, { ok: false, reason: "This history entry cannot be restored." });
    }

    const stateEntry = await readSessionPlannerStateEntry();
    const previousValue = stateEntry?.value || "";
    const sessionPlannerState = parseSessionPlannerState(previousValue);
    sessionPlannerState.sessions = sessionPlannerState.sessions || {};
    const previousSession = sessionPlannerState.sessions?.[dateValue];
    if (restoreSession) {
      sessionPlannerState.sessions[dateValue] = {
        ...restoreSession,
        date: dateValue,
      };
      clearRestoredSessionBlockTombstones(sessionPlannerState, dateValue, restoreSession);
    } else {
      markRemovedSessionBlocksTombstoned(sessionPlannerState, dateValue, previousSession);
      delete sessionPlannerState.sessions[dateValue];
    }
    sessionPlannerState.selectedDate = dateValue;

    const nextValue = JSON.stringify(sessionPlannerState);
    const writeResult = await writeSessionPlannerStateValue(nextValue, actor);
    if (!writeResult.ok) {
      return sendJson(res, 400, { ok: false, reason: writeResult.reason || "Session could not be restored." });
    }

    await appendSessionPlannerHistory(actor, previousValue, nextValue, {
      reason: "restore",
      restoreOf: entryId,
    });
    await appendAuditLog(actor, {
      action: "session.restored",
      summary: `Restored Session Planner for ${dateValue}`,
      details: {
        date: dateValue,
        restoreMode,
        historyEntryId: entryId,
        beforeBlockCount: historyEntry.beforeBlockCount,
        afterBlockCount: historyEntry.afterBlockCount,
      },
    });

    return sendJson(res, 200, {
      ok: true,
      date: dateValue,
      value: nextValue,
      restoredFrom: entryId,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error?.code === "BODY_TOO_LARGE") {
      return sendJson(res, 413, { ok: false, reason: error.message || "Request body is too large." });
    }
    return sendJson(res, 500, { ok: false, reason: error?.message || "Session history API failed." });
  }
};
