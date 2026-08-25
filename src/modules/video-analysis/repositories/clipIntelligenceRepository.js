import { buildVideoAnalysisApiUrl } from "../video-analysis.routes.js";

async function requestJson(url, getAuthToken = () => "") {
  const headers = { "Content-Type": "application/json" };
  const token = await getAuthToken?.();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { method: "GET", headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.reason || `Clip intelligence request failed (${response.status}).`);
  }
  return payload;
}

export function createClipIntelligenceRepository(context = {}) {
  const getAuthToken = context.getAuthToken || (() => "");
  return {
    listFacts(filters = {}) {
      return requestJson(buildVideoAnalysisApiUrl("analysis-facts", filters), getAuthToken);
    },
  };
}
