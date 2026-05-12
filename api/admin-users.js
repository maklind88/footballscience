const {
  DEFAULT_ROLES,
  readConfig,
  getCurrentActor,
  listAllAuthUsers,
  getAuthUserById,
  createAuthUser,
  updateAuthUser,
  removeAuthUser,
  sendCorsHeaders,
  sendJson,
  parseJsonBody,
} = require("./_lib/supabase-admin.js");
const { appendAuditLog } = require("./_lib/audit-log.js");
const { guardApiRequest } = require("./_lib/platform-security.js");

function getTargetId(query, body) {
  return body?.id || query.get("id") || query.get("userId") || "";
}

const MANAGEMENT_ROLES = new Set(["admin", "club-admin", "team-admin"]);
const CLUB_ADMIN_ASSIGNABLE_ROLES = new Set(["team-admin", "coach", "scout", "analyst", "performance", "medical", "guest"]);
const TEAM_ADMIN_ASSIGNABLE_ROLES = new Set(["coach", "scout", "analyst", "performance", "medical", "guest"]);

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return DEFAULT_ROLES.includes(role) ? role : "coach";
}

function scopeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function userClubKey(user = {}) {
  return scopeKey(user.clubId || user.clubName || user.team || "club-ncc");
}

function userTeamKey(user = {}) {
  return scopeKey(user.teamId || user.teamName || user.team || "team-ncc-first");
}

function sameClub(firstUser, secondUser) {
  return Boolean(userClubKey(firstUser) && userClubKey(firstUser) === userClubKey(secondUser));
}

function sameTeam(firstUser, secondUser) {
  return Boolean(userTeamKey(firstUser) && userTeamKey(firstUser) === userTeamKey(secondUser));
}

function canManageUsers(actor) {
  return MANAGEMENT_ROLES.has(normalizeRole(actor?.role));
}

function canViewUser(actor, target) {
  if (!actor || !target) {
    return false;
  }
  const actorRole = normalizeRole(actor.role);
  if (actorRole === "admin" || actor.id === target.id) {
    return true;
  }
  if (actorRole === "club-admin") {
    return sameClub(actor, target);
  }
  if (actorRole === "team-admin") {
    return sameTeam(actor, target);
  }
  return target.status === "active" && sameTeam(actor, target);
}

function canUpdateTarget(actor, target) {
  if (!actor || !target) {
    return false;
  }
  const actorRole = normalizeRole(actor.role);
  const targetRole = normalizeRole(target.role);
  if (actorRole === "admin" || actor.id === target.id) {
    return true;
  }
  if (actorRole === "club-admin") {
    return sameClub(actor, target) && targetRole !== "admin" && targetRole !== "club-admin";
  }
  if (actorRole === "team-admin") {
    return sameTeam(actor, target) && !MANAGEMENT_ROLES.has(targetRole);
  }
  return false;
}

function canRemoveTarget(actor, target) {
  if (!actor || !target || actor.id === target.id) {
    return false;
  }
  const actorRole = normalizeRole(actor.role);
  const targetRole = normalizeRole(target.role);
  if (actorRole === "admin") {
    return true;
  }
  if (actorRole === "club-admin") {
    return sameClub(actor, target) && targetRole !== "admin" && targetRole !== "club-admin";
  }
  if (actorRole === "team-admin") {
    return sameTeam(actor, target) && !MANAGEMENT_ROLES.has(targetRole);
  }
  return false;
}

function sanitizeUserPayloadForActor(actor, values = {}, target = null) {
  const actorRole = normalizeRole(actor?.role);
  const nextValues = { ...values };
  if (actorRole === "admin") {
    return nextValues;
  }

  const allowedRoles = actorRole === "club-admin" ? CLUB_ADMIN_ASSIGNABLE_ROLES : TEAM_ADMIN_ASSIGNABLE_ROLES;
  const requestedRole = normalizeRole(nextValues.role || target?.role || "coach");
  nextValues.role = allowedRoles.has(requestedRole)
    ? requestedRole
    : allowedRoles.has(target?.role)
      ? target.role
      : "coach";

  if (actor?.id && target?.id && actor.id === target.id) {
    nextValues.role = target.role;
    nextValues.status = target.status;
  }

  nextValues.clubId = actor.clubId || target?.clubId || "club-ncc";
  nextValues.clubName = actor.clubName || target?.clubName || "North Carolina Courage";

  if (actorRole === "team-admin") {
    nextValues.teamId = actor.teamId || target?.teamId || "team-ncc-first";
    nextValues.teamName = actor.teamName || actor.team || target?.teamName || target?.team || "North Carolina Courage";
    nextValues.team = nextValues.teamName;
  } else {
    nextValues.teamId = nextValues.teamId || target?.teamId || actor.teamId || "team-ncc-first";
    nextValues.teamName = nextValues.teamName || nextValues.team || target?.teamName || target?.team || actor.teamName || actor.team || "North Carolina Courage";
    nextValues.team = nextValues.teamName;
  }

  return nextValues;
}

function userAuditSnapshot(user = {}) {
  return {
    id: user.id || "",
    email: user.email || "",
    username: user.username || "",
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    role: user.role || "",
    title: user.title || "",
    department: user.department || "",
    clubId: user.clubId || "",
    clubName: user.clubName || "",
    teamId: user.teamId || "",
    teamName: user.teamName || "",
    team: user.team || "",
    status: user.status || "",
  };
}

function userAuditName(user = {}) {
  return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || user.email || "user";
}

function getChangedUserFields(before = {}, after = {}) {
  const fields = ["firstName", "lastName", "email", "username", "role", "status", "title", "department", "clubId", "clubName", "teamId", "teamName", "team"];
  return fields
    .filter((field) => String(before?.[field] || "") !== String(after?.[field] || ""))
    .map((field) => ({
      field,
      from: before?.[field] || "",
      to: after?.[field] || "",
    }));
}

function getPasswordChangeType(values = {}) {
  if (values?.password) {
    return "manual-password";
  }

  if (values?.generatePassword === true || ["true", "1", "yes", "on"].includes(String(values.generatePassword || "").toLowerCase())) {
    return "temporary-password";
  }

  return "";
}

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  const actor = await getCurrentActor(req.headers?.authorization || req.headers?.Authorization);
  const method = String(req.method || "").toUpperCase();
  const query = new URL(req.url, "http://localhost").searchParams;
  const { url, serviceRoleKey } = readConfig();
  const security = guardApiRequest(req, res, {
    route: "/api/admin-users",
    moduleId: "admin-users",
    actor,
    enforcePermission: false,
  });
  if (!security.ok) {
    return;
  }

  try {
    if (!url || !serviceRoleKey) {
      return sendJson(res, 500, {
        ok: false,
        reason: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.",
      });
    }

    if (method === "GET") {
      if (query.get("me") === "1") {
        if (!actor) {
          return sendJson(res, 401, { ok: false, reason: "You must be signed in." });
        }

        return sendJson(res, 200, { ok: true, user: actor, payload: { user: actor } });
      }

      if (!actor) {
        return sendJson(res, 401, { ok: false, reason: "You must be signed in." });
      }

      const users = await listAllAuthUsers();
      if (actor.role !== "admin") {
        return sendJson(res, 200, {
          ok: true,
          users: users.filter((user) => canViewUser(actor, user)),
          roles: DEFAULT_ROLES,
        });
      }

      return sendJson(res, 200, { ok: true, users, roles: DEFAULT_ROLES });
    }

    if (method !== "POST" && method !== "PUT" && method !== "PATCH" && method !== "DELETE") {
      return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
    }

    if (!actor) {
      return sendJson(res, 401, { ok: false, reason: "You must be signed in." });
    }

    if (method === "POST") {
      if (!canManageUsers(actor)) {
        return sendJson(res, 403, { ok: false, reason: "Admin access required." });
      }

      const body = await parseJsonBody(req);
      const nextPayload = sanitizeUserPayloadForActor(actor, body);
      const result = await createAuthUser(nextPayload);
      if (!result.ok) {
        return sendJson(res, result.status || 400, {
          ok: false,
          reason: result.reason || "User could not be created.",
        });
      }

      await appendAuditLog(actor, {
        action: "user.created",
        target: result.user,
        summary: `Created user ${userAuditName(result.user)}`,
        details: {
          user: userAuditSnapshot(result.user),
          passwordAction: nextPayload?.password ? "manual-password" : "temporary-password",
        },
      });

      return sendJson(res, 201, { ok: true, user: result.user, generatedPassword: result.generatedPassword || null });
    }

    const body = await parseJsonBody(req);
    const targetId = getTargetId(query, body);
    if (!targetId) {
      return sendJson(res, 400, { ok: false, reason: "Missing user id." });
    }

    if (method === "DELETE") {
      if (targetId === actor.id) {
        return sendJson(res, 400, { ok: false, reason: "You cannot remove your own account." });
      }

      const target = await getAuthUserById(targetId);
      if (!canRemoveTarget(actor, target)) {
        return sendJson(res, 403, { ok: false, reason: "This user is outside your admin scope." });
      }
      const result = await removeAuthUser(targetId);
      if (!result.ok) {
        return sendJson(res, 400, { ok: false, reason: result.reason || "User could not be removed." });
      }

      await appendAuditLog(actor, {
        action: "user.removed",
        target,
        summary: `Removed user ${userAuditName(target)}`,
        details: {
          user: userAuditSnapshot(target),
        },
      });

      return sendJson(res, 200, { ok: true });
    }

    const target = await getAuthUserById(targetId);
    if (!target) {
      return sendJson(res, 404, { ok: false, reason: "User not found." });
    }
    if (!canUpdateTarget(actor, target)) {
      return sendJson(res, 403, { ok: false, reason: "This user is outside your admin scope." });
    }

    const nextPayload = sanitizeUserPayloadForActor(actor, body, target);
    const hasRole = Object.prototype.hasOwnProperty.call(nextPayload, "role");
    const hasStatus = Object.prototype.hasOwnProperty.call(nextPayload, "status");
    const nextRole = hasRole ? String(nextPayload.role || "").trim() : "";
    const nextStatus = hasStatus ? String(nextPayload.status || "").trim() : "";

    if (!nextRole) {
      nextPayload.role = target.role;
    }

    if (!nextStatus) {
      nextPayload.status = target.status;
    }

    if (targetId === actor.id) {
      nextPayload.role = target.role;
      nextPayload.status = target.status;
    }

    const result = await updateAuthUser(targetId, nextPayload);
    if (!result.ok) {
      return sendJson(res, 400, { ok: false, reason: result.reason || "User could not be updated." });
    }

    const passwordAction = getPasswordChangeType(nextPayload);
    const changedFields = getChangedUserFields(target, result.user);
    if (changedFields.length || passwordAction) {
      await appendAuditLog(actor, {
        action: targetId === actor.id ? "profile.updated" : "user.updated",
        target: result.user,
        summary: `${targetId === actor.id ? "Updated own profile" : `Updated user ${userAuditName(result.user)}`}`,
        details: {
          changedFields,
          passwordAction,
          before: userAuditSnapshot(target),
          after: userAuditSnapshot(result.user),
        },
      });
    }

    return sendJson(res, 200, {
      ok: true,
      user: result.user,
      generatedPassword: result.generatedPassword || null,
    });
  } catch (error) {
    if (error?.code === "BODY_TOO_LARGE") {
      return sendJson(res, 413, { ok: false, reason: error.message || "Request body is too large." });
    }
    return sendJson(res, 500, { ok: false, reason: error?.message || "Admin API failed." });
  }
};
