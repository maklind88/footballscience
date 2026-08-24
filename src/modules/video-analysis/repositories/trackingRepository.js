import { buildVideoAnalysisApiUrl } from "../video-analysis.routes.js";

async function requestJson(url, options = {}, getAuthToken = () => "") {
  const headers = { "Content-Type": "application/json" };
  const token = await getAuthToken?.();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.reason || `Tracking request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function createTrackingRepository(context = {}) {
  const getAuthToken = context.getAuthToken || (() => "");
  return {
    getWorkspace(clipId = "") {
      return requestJson(
        buildVideoAnalysisApiUrl("tracking-workspace", { clipId }),
        { method: "GET" },
        getAuthToken,
      );
    },
    saveObjectTrack(objectTrack = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("save-object-track"),
        { method: "POST", body: JSON.stringify({ action: "save-object-track", objectTrack }) },
        getAuthToken,
      );
    },
    saveCorrection(correction = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("save-track-correction"),
        { method: "POST", body: JSON.stringify({ action: "save-track-correction", correction }) },
        getAuthToken,
      );
    },
    saveDynamicGraphic(dynamicGraphic = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("save-dynamic-graphic"),
        { method: "POST", body: JSON.stringify({ action: "save-dynamic-graphic", dynamicGraphic }) },
        getAuthToken,
      );
    },
  };
}
