const { getCurrentActor, sendCorsHeaders, sendJson } = require("./_lib/supabase-admin.js");
const { guardApiRequest } = require("./_lib/platform-security.js");
const { readPlatformHealthHistory } = require("./_lib/platform-health-history-store.js");
const { collectPlatformLiveSignals } = require("./_lib/platform-readiness-live-signals.js");
const packageJson = require("../package.json");

async function collectPlatformHealthHistory() {
  try {
    const result = await readPlatformHealthHistory({ limit: 80, releaseLimit: 40 });
    if (!result.ok) {
      return [];
    }
    const { createPlatformHealthHistoryFromRows } = await import("../src/core/platform-health-history-contracts.mjs");
    return createPlatformHealthHistoryFromRows(result.signals);
  } catch {
    return [];
  }
}

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
    const [liveSignals, healthHistory] = await Promise.all([
      collectPlatformLiveSignals(req),
      collectPlatformHealthHistory(),
    ]);
    const report = createPlatformReadinessReport({
      env: process.env,
      scripts: packageJson.scripts || {},
      liveSignals,
      healthHistory,
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
