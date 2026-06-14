import { buildVideoAnalysisApiUrl } from "../video-analysis.routes.js";

async function requestJson(url, options = {}, getAuthToken = () => "") {
  const headers = { "Content-Type": "application/json" };
  const token = await getAuthToken?.();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.reason || `Video Analysis request failed (${response.status}).`);
  }
  return payload;
}

export function createVideoRepository(context = {}) {
  const getAuthToken = context.getAuthToken || (() => "");
  return {
    status() {
      return requestJson(buildVideoAnalysisApiUrl("status"), { method: "GET" }, getAuthToken);
    },
    createLocalVideoSource(reference = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("create-local-video-source"),
        {
          method: "POST",
          body: JSON.stringify({ action: "create-local-video-source", ...reference }),
        },
        getAuthToken
      );
    },
    listMatches(limit = 40) {
      return requestJson(buildVideoAnalysisApiUrl("matches", { limit }), { method: "GET" }, getAuthToken);
    },
  };
}
