const {
  findAuthUserByIdentifier,
  sendCorsHeaders,
  sendJson,
} = require("./_lib/supabase-admin.js");
const { guardApiRequest } = require("./_lib/platform-security.js");

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

  const security = guardApiRequest(req, res, { route: "/api/user-lookup", moduleId: "admin-users" });
  if (!security.ok) {
    return;
  }

  const { searchParams } = new URL(req.url, "http://localhost");
  const identifier = searchParams.get("identifier");
  if (!identifier) {
    return sendJson(res, 400, { ok: false, reason: "Identifier is required." });
  }

  const user = await findAuthUserByIdentifier(identifier);
  if (!user) {
    return sendJson(res, 404, { ok: false, reason: "No user found." });
  }

  return sendJson(res, 200, {
    ok: true,
    user: {
      email: user.email,
    },
  });
};
