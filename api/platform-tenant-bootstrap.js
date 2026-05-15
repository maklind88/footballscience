const { getCurrentActor, parseJsonBody, sendCorsHeaders, sendJson } = require("./_lib/supabase-admin.js");
const { guardApiRequest } = require("./_lib/platform-security.js");
const { executeTenantBootstrap, resolveTenantBootstrapActor } = require("./_lib/platform-tenant-bootstrap.js");

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
  }

  const actor = await getCurrentActor(req.headers?.authorization || req.headers?.Authorization);
  if (!actor) {
    return sendJson(res, 401, { ok: false, reason: "You must be signed in." });
  }

  const bootstrapActor = await resolveTenantBootstrapActor(actor);
  if (!bootstrapActor.ok) {
    return sendJson(res, bootstrapActor.status || 403, bootstrapActor);
  }

  const security = guardApiRequest(req, res, {
    route: "/api/platform-tenant-bootstrap",
    moduleId: "platform-identity",
    action: "admin",
    actor: bootstrapActor.actor,
  });
  if (!security.ok) {
    return;
  }

  const body = await parseJsonBody(req);
  const result = await executeTenantBootstrap(body, bootstrapActor.actor);
  return sendJson(res, result.ok ? (body?.dryRun === true ? 200 : 201) : result.status || 500, result);
};
