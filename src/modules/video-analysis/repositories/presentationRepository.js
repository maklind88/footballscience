import { buildVideoAnalysisApiUrl } from "../video-analysis.routes.js";

async function requestJson(url, options = {}, getAuthToken = () => "") {
  const headers = { "Content-Type": "application/json" };
  const token = await getAuthToken?.();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.reason || `Presentation request failed (${response.status}).`);
  }
  return payload;
}

export function createPresentationRepository(context = {}) {
  const getAuthToken = context.getAuthToken || (() => "");
  return {
    list(limit = 40) {
      return requestJson(buildVideoAnalysisApiUrl("list-presentations", { limit }), { method: "GET" }, getAuthToken);
    },
    get(id = "") {
      return requestJson(buildVideoAnalysisApiUrl("get-presentation", { id }), { method: "GET" }, getAuthToken);
    },
    listClips(filters = {}) {
      return requestJson(buildVideoAnalysisApiUrl("list-presentation-clips", filters), { method: "GET" }, getAuthToken);
    },
    save(presentation = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("save-presentation"),
        { method: "POST", body: JSON.stringify({ action: "save-presentation", presentation }) },
        getAuthToken
      );
    },
    archive(id = "") {
      return requestJson(
        buildVideoAnalysisApiUrl("archive-presentation"),
        { method: "PATCH", body: JSON.stringify({ action: "archive-presentation", id }) },
        getAuthToken
      );
    },
    saveSmartCollection(smartCollection = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("save-smart-collection"),
        { method: "POST", body: JSON.stringify({ action: "save-smart-collection", smartCollection }) },
        getAuthToken
      );
    },
    saveDrawingLayer(drawingLayer = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("save-drawing-layer"),
        { method: "POST", body: JSON.stringify({ action: "save-drawing-layer", drawingLayer }) },
        getAuthToken
      );
    },
    saveShareTargets(presentationId = "", targets = []) {
      return requestJson(
        buildVideoAnalysisApiUrl("save-share-targets"),
        { method: "POST", body: JSON.stringify({ action: "save-share-targets", presentationId, targets }) },
        getAuthToken
      );
    },
    saveSmartCollectionShareTargets(collectionId = "", targets = []) {
      return requestJson(
        buildVideoAnalysisApiUrl("save-smart-collection-share-targets"),
        { method: "POST", body: JSON.stringify({ action: "save-smart-collection-share-targets", collectionId, targets }) },
        getAuthToken
      );
    },
  };
}
