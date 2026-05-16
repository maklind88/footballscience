const crypto = require("node:crypto");
const {
  getApiActionForMethod,
  getApiRouteSecurityConfig,
  hasModulePermission,
  normalizeAction,
  normalizeRoute,
} = require("../../src/core/permission-matrix.cjs");

const SECURITY_LOG_SCHEMA = "footballscience-api-security-event-v1";
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMITS = Object.freeze({
  read: 120,
  write: 60,
  delete: 20,
  export: 12,
  restore: 12,
  admin: 20,
  observe: 80,
});
const rateLimitBuckets = new Map();

function normalizeText(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function getHeader(req, key) {
  const headers = req?.headers || {};
  return headers[key] || headers[key.toLowerCase()] || headers[key.toUpperCase()] || "";
}

function getClientIp(req) {
  return normalizeText(
    String(getHeader(req, "x-forwarded-for") || req?.socket?.remoteAddress || "unknown").split(",", 1)[0],
    80
  ) || "unknown";
}

function getRequestId(req) {
  return normalizeText(
    getHeader(req, "x-vercel-id") ||
      getHeader(req, "x-request-id") ||
      (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    120
  );
}

function eventSeverity(status, eventType = "") {
  if (status >= 500 || eventType.includes("failed")) {
    return "error";
  }
  if (status === 429 || status === 403 || eventType.includes("rate_limited") || eventType.includes("denied")) {
    return "warning";
  }
  return "info";
}

function logSecurityEvent(context = {}, event = {}) {
  const status = Number(event.status || 0);
  const record = {
    schema: SECURITY_LOG_SCHEMA,
    level: event.level || eventSeverity(status, event.eventType || ""),
    eventType: normalizeText(event.eventType || "api.request", 80),
    route: normalizeText(context.route || event.route || "", 120),
    method: normalizeText(context.method || event.method || "", 12),
    action: normalizeText(context.action || event.action || "", 40),
    moduleId: normalizeText(context.moduleId || event.moduleId || "", 80),
    requestId: normalizeText(context.requestId || event.requestId || "", 120),
    actorId: normalizeText(context.actorId || event.actorId || "", 120),
    actorRole: normalizeText(context.actorRole || event.actorRole || "", 40),
    ip: normalizeText(context.ip || event.ip || "", 80),
    status: status || undefined,
    ms: Number.isFinite(Number(event.ms)) ? Number(event.ms) : undefined,
    reason: normalizeText(event.reason || "", 180) || undefined,
    timestamp: new Date().toISOString(),
  };

  const line = JSON.stringify(record);
  if (record.level === "error") {
    console.error(line);
  } else if (record.level === "warning") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function createApiRequestContext(req, options = {}) {
  const route = normalizeRoute(options.route || req?.url || "");
  const method = normalizeText(req?.method || "GET", 12).toUpperCase();
  const routeConfig = getApiRouteSecurityConfig(route) || {};
  const resolvedAction = options.action ?? getApiActionForMethod(route, method);
  const action = resolvedAction ? normalizeAction(resolvedAction) : "";
  const moduleId = normalizeText(options.moduleId || routeConfig.moduleId || "unknown", 80);
  const actor = options.actor || null;

  return {
    route,
    method,
    action,
    moduleId,
    requestId: getRequestId(req),
    ip: getClientIp(req),
    userAgent: normalizeText(getHeader(req, "user-agent"), 180),
    actorId: normalizeText(actor?.id || "", 120),
    actorRole: normalizeText(actor?.role || "", 40),
    startedAt: Date.now(),
    loggedStart: false,
    done: false,
  };
}

function attachApiRequestContext(req, res, options = {}) {
  if (!res.__platformSecurityContext) {
    res.__platformSecurityContext = createApiRequestContext(req, options);
  } else {
    res.__platformSecurityContext = {
      ...res.__platformSecurityContext,
      ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined && value !== null && value !== "")),
    };
  }

  const context = res.__platformSecurityContext;
  if (!context.loggedStart) {
    context.loggedStart = true;
    logSecurityEvent(context, { eventType: "api.request.start" });
  }
  return context;
}

function pruneRateLimitBuckets(nowMs) {
  if (rateLimitBuckets.size <= 2000) {
    return;
  }
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (nowMs - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) {
      rateLimitBuckets.delete(key);
    }
  }
}

function rateLimitIdentity(context = {}) {
  return context.actorId ? `actor:${context.actorId}` : `ip:${context.ip || "unknown"}`;
}

function getRouteRateLimit(routeConfig = {}, action) {
  const normalizedAction = normalizeAction(action);
  return Number(routeConfig.rateLimits?.[normalizedAction] || DEFAULT_RATE_LIMITS[normalizedAction] || DEFAULT_RATE_LIMITS.read);
}

function checkApiRateLimit(context, routeConfig = {}, nowMs = Date.now()) {
  const max = getRouteRateLimit(routeConfig, context.action);
  const key = `${context.route}:${context.method}:${context.action}:${rateLimitIdentity(context)}`;
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || nowMs - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(key, { startedAt: nowMs, count: 1 });
    pruneRateLimitBuckets(nowMs);
    return { ok: true, limit: max, remaining: Math.max(0, max - 1), resetMs: RATE_LIMIT_WINDOW_MS };
  }

  bucket.count += 1;
  const elapsed = nowMs - bucket.startedAt;
  const resetMs = Math.max(0, RATE_LIMIT_WINDOW_MS - elapsed);
  return {
    ok: bucket.count <= max,
    limit: max,
    remaining: Math.max(0, max - bucket.count),
    resetMs,
  };
}

function setSecurityCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendSecurityJson(res, status, payload) {
  setSecurityCorsHeaders(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  finishApiRequest(res, status, payload);
  res.end(JSON.stringify(payload));
}

function guardApiRequest(req, res, options = {}) {
  const route = normalizeRoute(options.route || req?.url || "");
  const routeConfig = getApiRouteSecurityConfig(route) || {};
  const resolvedAction = options.action ?? getApiActionForMethod(route, req?.method);
  const context = attachApiRequestContext(req, res, {
    ...options,
    route,
    moduleId: options.moduleId || routeConfig.moduleId,
    action: resolvedAction,
  });

  if (routeConfig.moduleId && !resolvedAction) {
    logSecurityEvent(context, {
      eventType: "api.method_not_allowed",
      status: 405,
      reason: "Method not allowed.",
      ms: Date.now() - context.startedAt,
    });
    sendSecurityJson(res, 405, { ok: false, reason: "Method not allowed." });
    return { ok: false, status: 405, reason: "method_not_allowed" };
  }

  const rateLimit = checkApiRateLimit(context, routeConfig);
  res.setHeader("X-RateLimit-Limit", String(rateLimit.limit));
  res.setHeader("X-RateLimit-Remaining", String(rateLimit.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(rateLimit.resetMs / 1000)));
  if (!rateLimit.ok) {
    res.setHeader("Retry-After", String(Math.ceil(rateLimit.resetMs / 1000)));
    logSecurityEvent(context, {
      eventType: "api.rate_limited",
      status: 429,
      reason: "API rate limit exceeded.",
      ms: Date.now() - context.startedAt,
    });
    sendSecurityJson(res, 429, { ok: false, reason: "Too many requests. Please wait a moment and try again." });
    return { ok: false, status: 429, reason: "rate_limited" };
  }

  if (options.requireAuth && !options.actor) {
    logSecurityEvent(context, {
      eventType: "api.auth_required",
      status: 401,
      reason: "Missing authenticated actor.",
      ms: Date.now() - context.startedAt,
    });
    sendSecurityJson(res, 401, { ok: false, reason: "You must be signed in." });
    return { ok: false, status: 401, reason: "auth_required" };
  }

  const shouldEnforcePermission = options.enforcePermission ?? routeConfig.enforcePermission === true;
  if (shouldEnforcePermission && options.actor && !hasModulePermission(options.actor, context.moduleId, context.action)) {
    const permissionDeniedReason = normalizeText(
      options.permissionDeniedReason || "You do not have permission for this action.",
      240
    );
    logSecurityEvent(context, {
      eventType: "api.permission_denied",
      status: 403,
      reason: `${context.action} denied for ${context.moduleId}.`,
      ms: Date.now() - context.startedAt,
    });
    sendSecurityJson(res, 403, { ok: false, reason: permissionDeniedReason });
    return { ok: false, status: 403, reason: "permission_denied" };
  }

  return { ok: true, context, rateLimit };
}

function finishApiRequest(res, status, payload = {}) {
  const context = res.__platformSecurityContext;
  if (!context || context.done) {
    return;
  }
  context.done = true;
  const responseStatus = Number(status || res.statusCode || 0);
  logSecurityEvent(context, {
    eventType: responseStatus >= 400 ? "api.request.failed" : "api.request.done",
    status: responseStatus,
    reason: payload?.reason || "",
    ms: Date.now() - context.startedAt,
  });
}

module.exports = {
  SECURITY_LOG_SCHEMA,
  attachApiRequestContext,
  checkApiRateLimit,
  createApiRequestContext,
  finishApiRequest,
  guardApiRequest,
  logSecurityEvent,
  rateLimitBuckets,
};
