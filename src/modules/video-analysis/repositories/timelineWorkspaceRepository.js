import { buildVideoAnalysisApiUrl } from "../video-analysis.routes.js";

async function requestJson(url, options = {}, getAuthToken = () => "") {
  const headers = { "Content-Type": "application/json" };
  const token = await getAuthToken?.();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.reason || `Timeline request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function idempotencyKey(timeline = {}) {
  const randomId = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `timeline-save:${timeline.id || "new"}:${randomId}`.slice(0, 180);
}

export function createTimelineWorkspaceRepository(context = {}) {
  const getAuthToken = context.getAuthToken || (() => "");
  return {
    list(matchId, limit = 40) {
      return requestJson(
        buildVideoAnalysisApiUrl("timelines", { matchId, limit }),
        { method: "GET" },
        getAuthToken,
      );
    },
    save(timeline = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("save-timeline"),
        {
          method: "POST",
          body: JSON.stringify({
            action: "save-timeline",
            timeline: { ...timeline, idempotencyKey: idempotencyKey(timeline) },
          }),
        },
        getAuthToken,
      );
    },
    listOperations(timelineId, limit = 200) {
      return requestJson(
        buildVideoAnalysisApiUrl("timeline-operations", { timelineId, limit }),
        { method: "GET" },
        getAuthToken,
      );
    },
    startCollaborationSession(collaborationSession = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("start-collaboration-session"),
        {
          method: "POST",
          body: JSON.stringify({ action: "start-collaboration-session", collaborationSession }),
        },
        getAuthToken,
      );
    },
    joinCollaborationSession(collaborationSession = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("join-collaboration-session"),
        {
          method: "POST",
          body: JSON.stringify({ action: "join-collaboration-session", collaborationSession }),
        },
        getAuthToken,
      );
    },
    leaveCollaborationSession(collaborationSession = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("leave-collaboration-session"),
        {
          method: "POST",
          body: JSON.stringify({ action: "leave-collaboration-session", collaborationSession }),
        },
        getAuthToken,
      );
    },
    collaborationState(sessionId, after = "", limit = 200) {
      return requestJson(
        buildVideoAnalysisApiUrl("collaboration-state", { sessionId, after, limit }),
        { method: "GET" },
        getAuthToken,
      );
    },
  };
}
