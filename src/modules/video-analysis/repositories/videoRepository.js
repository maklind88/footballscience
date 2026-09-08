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
    listMatches(options = {}) {
      const params = typeof options === "number" ? { limit: options } : options;
      return requestJson(buildVideoAnalysisApiUrl("matches", params), { method: "GET" }, getAuthToken);
    },
    searchArchive(query = {}, { signal } = {}) {
      return requestJson(buildVideoAnalysisApiUrl("library-search", query), { method: "GET", signal, cache: "no-store" }, getAuthToken);
    },
    archiveCalendar(query = {}, { signal } = {}) {
      return requestJson(buildVideoAnalysisApiUrl("library-calendar", query), { method: "GET", signal, cache: "no-store" }, getAuthToken);
    },
    updateMatchLink(payload = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("update-match-link"),
        {
          method: "POST",
          body: JSON.stringify({ action: "update-match-link", ...payload }),
        },
        getAuthToken
      );
    },
  };
}
