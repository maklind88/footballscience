import { buildVideoAnalysisApiUrl } from "../video-analysis.routes.js";

async function requestJson(url, options = {}, getAuthToken = () => "") {
  const headers = { "Content-Type": "application/json" };
  const token = await getAuthToken?.();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.reason || `Coding template request failed (${response.status}).`);
  }
  return payload;
}

export function createCodingTemplateRepository(context = {}) {
  const getAuthToken = context.getAuthToken || (() => "");
  return {
    list(limit = 20) {
      return requestJson(buildVideoAnalysisApiUrl("coding-templates", { limit }), { method: "GET" }, getAuthToken);
    },
    save(template = {}) {
      return requestJson(
        buildVideoAnalysisApiUrl("save-coding-template"),
        { method: "POST", body: JSON.stringify({ action: "save-coding-template", template }) },
        getAuthToken
      );
    },
  };
}
