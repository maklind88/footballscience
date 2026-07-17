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
    listSavedSearches(limit = 40) {
      return requestJson(buildVideoAnalysisApiUrl("saved-searches", { limit }), { method: "GET" }, getAuthToken);
    },
    saveSearch(search = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("save-search"),
        { method: "POST", body: JSON.stringify({ action: "save-search", search }) },
        getAuthToken
      );
    },
    save(clip = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("save-clip"),
        { method: "POST", body: JSON.stringify({ action: "save-clip", clip }) },
        getAuthToken
      );
    },
    trim(clip = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("trim-clip"),
        { method: "PATCH", body: JSON.stringify({ action: "trim-clip", clip }) },
        getAuthToken
      );
    },
    share(id, visibility = "team") {
      return requestJson(
        buildVideoAnalysisApiUrl("share-clip"),
        { method: "PATCH", body: JSON.stringify({ action: "share-clip", clip: { id, visibility } }) },
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
    archiveMany(ids = []) {
      return requestJson(
        buildVideoAnalysisApiUrl("archive-clips"),
        { method: "PATCH", body: JSON.stringify({ action: "archive-clips", ids }) },
        getAuthToken
      );
    },
    restoreMany(ids = []) {
      return requestJson(
        buildVideoAnalysisApiUrl("restore-clips"),
        { method: "PATCH", body: JSON.stringify({ action: "restore-clips", ids }) },
        getAuthToken
      );
    },
  };
}
