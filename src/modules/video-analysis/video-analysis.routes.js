export const videoAnalysisRoutes = Object.freeze({
  api: "/api/video-analysis",
  workspaceId: "analysis-room",
  moduleId: "video-analysis",
});

export function buildVideoAnalysisApiUrl(action, params = {}) {
  const url = new URL(videoAnalysisRoutes.api, window.location.origin);
  if (action) url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}
