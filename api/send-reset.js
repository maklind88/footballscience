const {
  getCurrentActor,
  getAuthUserById,
  sendPasswordReset,
  sendCorsHeaders,
  sendJson,
} = require("./_lib/supabase-admin.js");
const { appendAuditLog } = require("./_lib/audit-log.js");
const { guardApiRequest } = require("./_lib/platform-security.js");

function sanitizeRedirectTo(value) {
  const fallback = "https://footballscience.xyz/";
  if (!value || typeof value !== "string") {
    return fallback;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname || "";

    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) {
      return `${parsed.origin}/`;
    }

    if (parsed.protocol === "https:" && parsed.hostname.endsWith("footballscience.xyz")) {
      return "https://footballscience.xyz/";
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return ["admin", "club-admin", "team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"].includes(role)
    ? role
    : "coach";
}

function scopeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function sameClub(firstUser = {}, secondUser = {}) {
  const firstKey = scopeKey(firstUser.clubId || firstUser.clubName || firstUser.team || "club-ncc");
  const secondKey = scopeKey(secondUser.clubId || secondUser.clubName || secondUser.team || "club-ncc");
  return Boolean(firstKey && firstKey === secondKey);
}

function sameTeam(firstUser = {}, secondUser = {}) {
  const firstKey = scopeKey(firstUser.teamId || firstUser.teamName || firstUser.team || "team-ncc-first");
  const secondKey = scopeKey(secondUser.teamId || secondUser.teamName || secondUser.team || "team-ncc-first");
  return Boolean(firstKey && firstKey === secondKey);
}

function canSendPasswordReset(actor, target) {
  const actorRole = normalizeRole(actor?.role);
  const targetRole = normalizeRole(target?.role);
  if (actorRole === "admin") {
    return true;
  }
  if (actorRole === "club-admin") {
    return sameClub(actor, target) && targetRole !== "admin" && targetRole !== "club-admin";
  }
  if (actorRole === "team-admin") {
    return sameTeam(actor, target) && !["admin", "club-admin", "team-admin"].includes(targetRole);
  }
  return false;
}

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

  const security = guardApiRequest(req, res, {
    route: "/api/send-reset",
    moduleId: "admin-users",
    actor,
    action: "admin",
  });
  if (!security.ok) {
    return;
  }

  let body = {};
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    if (chunks.length) {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
  } catch {
    body = {};
  }

  const targetId = body?.userId || new URL(req.url, "http://localhost").searchParams.get("userId");
  if (!targetId) {
    return sendJson(res, 400, { ok: false, reason: "Missing user id." });
  }

  const target = await getAuthUserById(targetId);
  if (!target?.email) {
    return sendJson(res, 400, { ok: false, reason: "No user email on file." });
  }
  if (!canSendPasswordReset(actor, target)) {
    return sendJson(res, 403, { ok: false, reason: "This user is outside your admin scope." });
  }

  const redirectTo = sanitizeRedirectTo(body?.redirectTo || `${new URL(req.url, "http://localhost").origin}/`);
  const result = await sendPasswordReset(target.email, redirectTo);
  if (!result.ok) {
    return sendJson(res, 500, { ok: false, reason: result.reason || "Could not send reset email." });
  }

  await appendAuditLog(actor, {
    action: "user.reset_email_sent",
    target,
    summary: `Sent password reset to ${target.email}`,
    details: {
      redirectTo,
      targetUserId: target.id,
    },
  });

  return sendJson(res, 200, { ok: true, message: `Password reset sent to ${target.email}.` });
};
