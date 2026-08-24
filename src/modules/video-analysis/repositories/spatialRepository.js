import { buildVideoAnalysisApiUrl } from "../video-analysis.routes.js";

async function requestJson(url, options = {}, getAuthToken = () => "") {
  const headers = { "Content-Type": "application/json" };
  const token = await getAuthToken?.();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.reason || `Spatial analysis request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function createSpatialRepository(context = {}) {
  const getAuthToken = context.getAuthToken || (() => "");
  return {
    getCalibration(videoId = "", sourceId = "") {
      return requestJson(
        buildVideoAnalysisApiUrl("pitch-calibration", { videoId, sourceId }),
        { method: "GET" },
        getAuthToken,
      );
    },
    saveCalibration(calibration = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("save-pitch-calibration"),
        { method: "POST", body: JSON.stringify({ action: "save-pitch-calibration", calibration }) },
        getAuthToken,
      );
    },
  };
}
