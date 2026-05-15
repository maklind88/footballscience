const { getCurrentActor, sendCorsHeaders, sendJson } = require("./_lib/supabase-admin.js");
const { guardApiRequest } = require("./_lib/platform-security.js");
const packageJson = require("../package.json");

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
  }

  const actor = await getCurrentActor(req.headers?.authorization || req.headers?.Authorization);
  if (!actor) {
    return sendJson(res, 401, { ok: false, reason: "You must be signed in." });
  }

  const security = guardApiRequest(req, res, {
    route: "/api/platform-readiness",
    moduleId: "platform-readiness",
    action: "observe",
    actor,
  });
  if (!security.ok) {
    return;
  }

  if (actor.role !== "admin") {
    return sendJson(res, 403, { ok: false, reason: "Platform admin access required." });
  }

  try {
    const { createPlatformReadinessReport } = await import("../src/core/platform-readiness-contracts.mjs");
    const report = createPlatformReadinessReport({
      env: process.env,
      scripts: packageJson.scripts || {},
    });

    return sendJson(res, 200, {
      ok: true,
      report,
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      reason: error?.message || "Platform readiness could not be loaded.",
    });
  }
};
