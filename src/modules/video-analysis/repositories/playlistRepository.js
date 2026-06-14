import { buildVideoAnalysisApiUrl } from "../video-analysis.routes.js";

async function requestJson(url, options = {}, getAuthToken = () => "") {
  const headers = { "Content-Type": "application/json" };
  const token = await getAuthToken?.();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.reason || `Review request failed (${response.status}).`);
  }
  return payload;
}

export function createPlaylistRepository(context = {}) {
  const getAuthToken = context.getAuthToken || (() => "");
  return {
    saveReviewList(items = []) {
      return Promise.resolve({ items });
    },
    saveReviewSession(reviewSession = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("save-review-session"),
        { method: "POST", body: JSON.stringify({ action: "save-review-session", reviewSession }) },
        getAuthToken
      );
    },
  };
}
