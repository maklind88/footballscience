const { getCurrentActor, parseJsonBody, sendCorsHeaders, sendJson } = require("./_lib/supabase-admin.js");
const { guardApiRequest, enforceApiPermission } = require("./_lib/platform-security.js");
const { resolvePlatformActorScope } = require("./_lib/platform-identity.js");
const { UUID, resolvePerformanceContext, performanceRpc } = require("./_lib/analysis-performance-database.js");
const { CATEGORIES, fetchDataset, fail } = require("./_lib/analysis-performance-contract.js");

function readFilters(params) {
  const filters = {};
  for (const key of params.keys()) {
    if (!["teamId", "match", "category", "period", "outcome", "venue", "player", "offset", "versionId"].includes(key)) fail("Unsupported statistics filter.", 400);
    if (params.getAll(key).length !== 1) fail("Duplicate statistics filter.", 400);
    const value = params.get(key);
    if (value.length > 160) fail("Statistics filter is too long.", 400);
    if (key !== "teamId" && value) filters[key] = value;
  }
  for (const [key, values] of Object.entries({ category: CATEGORIES, period: ["1st Half", "2nd Half"], outcome: ["Completed", "Attempted"], venue: ["Home", "Away"] })) {
    if (filters[key] && !values.includes(filters[key])) fail("Invalid statistics filter.", 400);
  }
  for (const key of ["match", "offset"]) {
    if (filters[key] && (!/^\d+$/.test(filters[key]) || Number(filters[key]) > 50000)) fail("Invalid statistics page or match.", 400);
  }
  if (filters.versionId && !UUID.test(filters.versionId)) fail("Invalid statistics version.", 400);
  return filters;
}

function createAnalysisRoomHandler(deps = {}) {
  const actorFor = deps.getCurrentActor || getCurrentActor;
  const platformFor = deps.resolvePlatformActorScope || resolvePlatformActorScope;
  const rpc = deps.rpc || performanceRpc;
  const loadSource = deps.fetchDataset || fetchDataset;
  const env = deps.env || process.env;
  return async (req, res) => {
    sendCorsHeaders(res);
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method === "OPTIONS") { res.statusCode = 200; res.end(); return; }
    if (!["GET", "POST"].includes(req.method)) return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
    try {
      const actor = await actorFor(req.headers?.authorization || req.headers?.Authorization);
      if (!actor) return sendJson(res, 401, { ok: false, reason: "You must be signed in." });
      if (!(deps.guardApiRequest || guardApiRequest)(req, res, { route: "/api/analysis-room", moduleId: "analysis-room", actor, enforcePermission: false, requireAuth: true }).ok) return;
      const params = new URL(req.url || "/api/analysis-room", "https://footballscience.local").searchParams;
      const teamId = params.get("teamId") || env.ANALYSIS_PERFORMANCE_TEAM_ID || "";
      if (teamId && !UUID.test(teamId)) fail("A canonical Platform team UUID is required.", 400);
      const context = resolvePerformanceContext(await platformFor(actor, { requestedTeamId: teamId }), teamId);
      if (!(deps.enforceApiPermission || enforceApiPermission)(req, res, { route: "/api/analysis-room", moduleId: "analysis-room", actor: context.actor }).ok) return;
      const importAvailable = env.ANALYSIS_PERFORMANCE_IMPORT_APPROVED === "true" && context.teamId === env.ANALYSIS_PERFORMANCE_TEAM_ID;
      if (req.method === "GET") {
        const snapshot = await rpc("read", context, { p_filters: readFilters(params) });
        return sendJson(res, 200, { ok: true, teamId: context.teamId, importAvailable, ...snapshot });
      }
      if (!importAvailable) fail("Statistics import is awaiting source approval and team configuration.", 403);
      const body = await (deps.parseJsonBody || parseJsonBody)(req, { maxBytes: 4096 });
      if (!body || !["preview-import", "confirm-import"].includes(body.action)) fail("Unsupported import action.", 400);
      if (Object.keys(body).some((key) => !["action", "expectedHash", "expectedRevision"].includes(key))) fail("Unsupported import field.", 400);
      const current = await rpc("read", context, { p_filters: { mode: "status" } });
      if (body.action === "confirm-import" && (!/^[a-f0-9]{64}$/.test(body.expectedHash || "") || !Number.isInteger(body.expectedRevision) || body.expectedRevision !== current.currentRevision)) fail("Preview the latest source before importing.", 409);
      const dataset = await loadSource();
      if (body.action === "preview-import") {
        return sendJson(res, 200, { ok: true, preview: { ...dataset.summary, hash: dataset.hash, expectedRevision: current.currentRevision,
          previousEventCount: current.version?.eventCount || 0, previousMatchCount: current.version?.matchCount || 0,
          unchanged: dataset.hash === current.version?.hash } });
      }
      if (body.expectedHash !== dataset.hash) fail("The source changed after preview. Preview again before importing.", 409);
      const receipt = await rpc("import", context, { p_expected_revision: body.expectedRevision, p_content_hash: dataset.hash,
        p_source_generated_at: dataset.generatedAt, p_manifest: dataset.manifest, p_events: dataset.events });
      return sendJson(res, 200, { ok: true, receipt });
    } catch (error) {
      return sendJson(res, error.code === "BODY_TOO_LARGE" ? 413 : error.status || 500,
        { ok: false, reason: error.status ? error.message : "Team Performance request failed. Saved data has not changed." });
    }
  };
}
module.exports = createAnalysisRoomHandler();
module.exports.createAnalysisRoomHandler = createAnalysisRoomHandler;
module.exports.readFilters = readFilters;
