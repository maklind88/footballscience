const {
  getCurrentActor,
  parseJsonBody,
  sendCorsHeaders,
  sendJson,
} = require("./_lib/supabase-admin.js");
const { guardApiRequest } = require("./_lib/platform-security.js");
const {
  readChatPushSubscriptionStatus,
  revokeChatPushSubscription,
  sendChatPushTest,
  upsertChatPushSubscription,
} = require("./_lib/chat-push-notifications.js");

function actionFromBody(body = {}) {
  return String(body.action || body.intent || "").trim().toLowerCase();
}

module.exports = async (req, res) => {
  sendCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  const actor = await getCurrentActor(req.headers?.authorization || req.headers?.Authorization);
  if (!actor) {
    return sendJson(res, 401, { ok: false, reason: "You must be signed in." });
  }

  const security = guardApiRequest(req, res, {
    route: "/api/push-subscriptions",
    moduleId: "chat",
    actor,
  });
  if (!security.ok) {
    return;
  }

  try {
    if (req.method === "GET") {
      const result = await readChatPushSubscriptionStatus(actor);
      return sendJson(res, result.ok ? 200 : result.status || 400, {
        ...result,
        schema: "footballscience-chat-push-subscriptions-v1",
      });
    }

    if (req.method === "DELETE") {
      const body = await parseJsonBody(req).catch(() => ({}));
      const result = await revokeChatPushSubscription(actor, body);
      return sendJson(res, result.ok ? 200 : result.status || 400, {
        ...result,
        schema: "footballscience-chat-push-subscriptions-v1",
      });
    }

    if (req.method !== "POST") {
      return sendJson(res, 405, { ok: false, reason: "Method not allowed." });
    }

    const body = await parseJsonBody(req);
    const action = actionFromBody(body);
    const result = action === "test"
      ? await sendChatPushTest(actor, body)
      : action === "unsubscribe" || action === "revoke"
        ? await revokeChatPushSubscription(actor, body)
        : await upsertChatPushSubscription(actor, body, req);

    return sendJson(res, result.ok ? 200 : result.status || 400, {
      ...result,
      schema: "footballscience-chat-push-subscriptions-v1",
    });
  } catch (error) {
    if (error?.code === "BODY_TOO_LARGE") {
      return sendJson(res, 413, { ok: false, reason: error.message || "Request body is too large." });
    }
    return sendJson(res, 500, { ok: false, reason: error?.message || "Push subscription API failed." });
  }
};
