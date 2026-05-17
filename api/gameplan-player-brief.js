"use strict";

const { getCurrentActor, parseJsonBody, sendCorsHeaders, sendJson } = require("./_lib/supabase-admin.js");
const { guardApiRequest } = require("./_lib/platform-security.js");
const { appendAuditLog } = require("./_lib/audit-log.js");
const {
  buildPlayerBriefUrl,
  createPlayerBriefToken,
  readGameplanBriefState,
  resolvePlayerBriefPayload,
  upsertPlayerBriefReceipt,
  verifyPlayerBriefToken,
  writeGameplanStateObject,
} = require("./_lib/gameplan-player-brief.js");

const ROUTE = "/api/gameplan-player-brief";

function getQuery(req) {
  return new URL(req.url || ROUTE, "https://footballscience.local").searchParams;
}

function publicSecurity(req, res, action = "read") {
  return guardApiRequest(req, res, {
    route: ROUTE,
    moduleId: "gameplan",
    action,
    enforcePermission: false,
  });
}

async function staffSecurity(req, res, actor) {
  return guardApiRequest(req, res, {
    route: ROUTE,
    moduleId: "gameplan",
    action: "write",
    actor,
    requireAuth: true,
    enforcePermission: true,
  });
}

async function handleRead(req, res, token) {
  const security = publicSecurity(req, res, "read");
  if (!security.ok) {
    return;
  }

  const verified = verifyPlayerBriefToken(token);
  if (!verified.ok) {
    return sendJson(res, verified.status || 401, { ok: false, reason: verified.reason });
  }

  const state = await readGameplanBriefState();
  if (!state.ok) {
    return sendJson(res, state.status || 500, { ok: false, reason: state.reason });
  }

  const payload = resolvePlayerBriefPayload(state.gameplanState, state.playerProfilesState, verified.payload);
  if (!payload.ok) {
    return sendJson(res, payload.status || 403, { ok: false, reason: payload.reason });
  }

  return sendJson(res, 200, {
    ok: true,
    ...payload,
    token: {
      expiresAt: verified.expiresAt,
    },
  });
}

async function handleSign(req, res, body) {
  const actor = await getCurrentActor(req.headers?.authorization || req.headers?.Authorization);
  const security = await staffSecurity(req, res, actor);
  if (!security.ok) {
    return;
  }

  const planId = String(body?.planId || body?.gameplanId || "").trim();
  const playerId = String(body?.playerId || "").trim();
  const state = await readGameplanBriefState();
  if (!state.ok) {
    return sendJson(res, state.status || 500, { ok: false, reason: state.reason });
  }

  const payload = resolvePlayerBriefPayload(state.gameplanState, state.playerProfilesState, { planId, playerId });
  if (!payload.ok) {
    return sendJson(res, payload.status || 403, { ok: false, reason: payload.reason });
  }

  const tokenResult = createPlayerBriefToken({
    planId,
    playerId,
    expiresInHours: body?.expiresInHours,
  });
  if (!tokenResult.ok) {
    return sendJson(res, tokenResult.status || 500, { ok: false, reason: tokenResult.reason });
  }

  const url = buildPlayerBriefUrl(req, tokenResult.token);
  await appendAuditLog(actor, {
    action: "gameplan.player-brief-link-signed",
    summary: "Signed a Gameplan Player Brief link",
    details: {
      planId,
      playerId,
      expiresAt: tokenResult.expiresAt,
    },
  });

  return sendJson(res, 200, {
    ok: true,
    url,
    planId,
    playerId,
    expiresAt: tokenResult.expiresAt,
  });
}

async function handleReceipt(req, res, body) {
  const security = publicSecurity(req, res, "write");
  if (!security.ok) {
    return;
  }

  const verified = verifyPlayerBriefToken(body?.token || getQuery(req).get("token"));
  if (!verified.ok) {
    return sendJson(res, verified.status || 401, { ok: false, reason: verified.reason });
  }

  const state = await readGameplanBriefState();
  if (!state.ok) {
    return sendJson(res, state.status || 500, { ok: false, reason: state.reason });
  }

  const access = resolvePlayerBriefPayload(state.gameplanState, state.playerProfilesState, verified.payload);
  if (!access.ok) {
    return sendJson(res, access.status || 403, { ok: false, reason: access.reason });
  }

  const receiptResult = upsertPlayerBriefReceipt(state.gameplanState, {
    ...verified.payload,
    acknowledge: body?.action === "acknowledge",
    countOpen: body?.action !== "acknowledge",
  });
  if (!receiptResult.ok) {
    return sendJson(res, receiptResult.status || 400, { ok: false, reason: receiptResult.reason });
  }

  const write = await writeGameplanStateObject(receiptResult.state, state.gameplanEntry, {
    id: `player-brief:${verified.payload.playerId}`,
    role: "guest",
  });
  if (!write.ok) {
    return sendJson(res, write.status || 400, { ok: false, reason: write.reason || "Could not update Player Brief receipt." });
  }

  const payload = resolvePlayerBriefPayload(receiptResult.state, state.playerProfilesState, verified.payload);
  return sendJson(res, 200, {
    ok: true,
    ...payload,
    metadata: {
      revision: write.entry?.revision,
      updatedAt: write.entry?.updatedAt,
    },
    token: {
      expiresAt: verified.expiresAt,
    },
  });
}

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
    if (req.method === "GET") {
      const token = getQuery(req).get("token") || "";
      return handleRead(req, res, token);
    }

    if (req.method !== "POST") {
      const security = publicSecurity(req, res, "read");
      if (!security.ok) {
        return;
      }
      return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
    }

    const body = await parseJsonBody(req);
    const action = String(body?.action || "").trim().toLowerCase();
    if (action === "sign") {
      return handleSign(req, res, body);
    }
    if (action === "opened" || action === "acknowledge") {
      return handleReceipt(req, res, body);
    }

    const security = publicSecurity(req, res, "write");
    if (!security.ok) {
      return;
    }
    return sendJson(res, 400, { ok: false, reason: "Unsupported Player Brief action." });
  } catch (error) {
    if (error?.code === "BODY_TOO_LARGE") {
      return sendJson(res, 413, { ok: false, reason: error.message || "Request body is too large." });
    }
    return sendJson(res, 500, { ok: false, reason: error?.message || "Player Brief API failed." });
  }
};
