import { buildVideoAnalysisApiUrl } from "../video-analysis.routes.js";

async function requestJson(url, options = {}, getAuthToken = () => "") {
  const headers = { "Content-Type": "application/json" };
  const token = await getAuthToken?.();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.reason || `Media production request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function createMediaProductionRepository(context = {}) {
  const getAuthToken = context.getAuthToken || (() => "");
  return {
    workspace(matchId = "") {
      return requestJson(
        buildVideoAnalysisApiUrl("media-workspace", { matchId }),
        { method: "GET" },
        getAuthToken,
      );
    },
    saveAngle(angle = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("save-media-angle"),
        { method: "POST", body: JSON.stringify({ action: "save-media-angle", angle }) },
        getAuthToken,
      );
    },
    saveExportManifest(exportManifest = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("save-export-manifest"),
        { method: "POST", body: JSON.stringify({ action: "save-export-manifest", exportManifest }) },
        getAuthToken,
      );
    },
  };
}
