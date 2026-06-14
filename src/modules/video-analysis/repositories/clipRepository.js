import { buildVideoAnalysisApiUrl } from "../video-analysis.routes.js";

async function requestJson(url, options = {}, getAuthToken = () => "") {
  const headers = { "Content-Type": "application/json" };
  const token = await getAuthToken?.();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.reason || `Clip request failed (${response.status}).`);
  }
  return payload;
}

export function createClipRepository(context = {}) {
  const getAuthToken = context.getAuthToken || (() => "");
  return {
    list(filters = {}) {
      return requestJson(buildVideoAnalysisApiUrl("clips", filters), { method: "GET" }, getAuthToken);
    },
    save(clip = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("save-clip"),
        { method: "POST", body: JSON.stringify({ action: "save-clip", clip }) },
        getAuthToken
      );
    },
    archive(id) {
      return requestJson(
        buildVideoAnalysisApiUrl("archive-clip"),
        { method: "PATCH", body: JSON.stringify({ action: "archive-clip", id }) },
        getAuthToken
      );
    },
  };
}
