"use strict";

const TRAFFIC_SAFETY_SCHEMA = "footballscience-traffic-safety-contract-v1";

const trafficSafetyEdgeControls = Object.freeze({
  "chat-presence-rate-limit": Object.freeze({
    id: "chat-presence-rate-limit",
    provider: "vercel-firewall",
    name: "Rate limit chat presence APIs",
    required: true,
    pathRegex: "^/api/(chat|presence|push-subscriptions)$",
    rateLimit: Object.freeze({
      algorithm: "fixed_window",
      windowSeconds: 60,
      limit: 80,
      key: "ip",
      action: "deny",
    }),
  }),
});

function freezeSourceGuard(sourceGuard = {}) {
  return Object.freeze({
    file: String(sourceGuard.file || "").trim(),
    tokens: Object.freeze((sourceGuard.tokens || []).map((token) => String(token || "")).filter(Boolean)),
  });
}

function freezeContract(contract = {}) {
  return Object.freeze({
    schema: TRAFFIC_SAFETY_SCHEMA,
    route: String(contract.route || "").trim(),
    moduleId: String(contract.moduleId || "").trim(),
    endpointClass: String(contract.endpointClass || "api").trim(),
    reason: String(contract.reason || "").trim(),
    backendRateLimits: Object.freeze({ ...(contract.backendRateLimits || {}) }),
    edgeControlIds: Object.freeze((contract.edgeControlIds || []).map((id) => String(id || "").trim()).filter(Boolean)),
    clientGuardSources: Object.freeze((contract.clientGuardSources || []).map(freezeSourceGuard)),
    observability: Object.freeze({
      structuredApiSecurityLog: true,
      rateLimitHeaders: true,
      incidentSignal: "429/5xx route spike",
      ...(contract.observability || {}),
    }),
  });
}

const trafficSafetyContracts = Object.freeze([
  freezeContract({
    route: "/api/chat",
    moduleId: "chat",
    endpointClass: "collaboration-feed",
    reason: "Team chat is user-facing, frequently refreshed, and can create large edge traffic during UI loops.",
    backendRateLimits: { read: 60, write: 60 },
    edgeControlIds: ["chat-presence-rate-limit"],
    clientGuardSources: [
      {
        file: "src/modules/chat/dashboard-chat-api-domain-runtime.mjs",
        tokens: ["withUiTimeout", "logDashboardChatApiFailure", "/api/chat"],
      },
    ],
  }),
  freezeContract({
    route: "/api/presence",
    moduleId: "presence",
    endpointClass: "presence-heartbeat",
    reason: "Presence is timer-driven and must never create foreground/background polling storms.",
    backendRateLimits: { read: 30, write: 20 },
    edgeControlIds: ["chat-presence-rate-limit"],
    clientGuardSources: [
      {
        file: "src/modules/chat/dashboard-chat-presence-runtime.mjs",
        tokens: [
          "dashboardPresenceInFlight",
          "dashboardPresenceBackoffMs",
          "dashboardPresencePollMinMs",
          "documentRef?.visibilityState",
        ],
      },
    ],
  }),
  freezeContract({
    route: "/api/push-subscriptions",
    moduleId: "chat",
    endpointClass: "push-device-registration",
    reason: "Push subscription checks are automatic and must be coalesced, cached, and backed off after 429/errors.",
    backendRateLimits: { read: 30, write: 20, delete: 12 },
    edgeControlIds: ["chat-presence-rate-limit"],
    clientGuardSources: [
      {
        file: "src/modules/chat/chat-push-client.mjs",
        tokens: ["statusInFlight", "cachedStatus", "lastStatusErrorAt", "refreshCooldownMs", "refreshInFlight"],
      },
      {
        file: "app-runtime.js",
        tokens: ["dashboardChatPushDiagnosticsInFlight", "dashboardChatPushDiagnosticsAutoCooldownMs"],
      },
    ],
  }),
  freezeContract({
    route: "/api/app-state",
    moduleId: "app-state",
    endpointClass: "central-save-sync",
    reason: "Central app-state protects saved coaching content; traffic safety must preserve revision/stale-write behavior.",
    backendRateLimits: { read: 90, write: 45, delete: 15 },
    clientGuardSources: [
      {
        file: "src/core/central-app-state-reload-service.mjs",
        tokens: ["refreshInFlight", "activeRefreshMinMs", "reason === \"interval\" && !documentRef.hasFocus()"],
      },
    ],
  }),
  freezeContract({
    route: "/api/client-config",
    moduleId: "auth",
    endpointClass: "public-config",
    reason: "Client config is public and boot-time, so clients must cache reads instead of refetching on every UI action.",
    backendRateLimits: { read: 80, write: 12 },
    clientGuardSources: [
      {
        file: "src/modules/chat/chat-push-client.mjs",
        tokens: ["cachedConfig", "readConfig({ force = false }"],
      },
    ],
  }),
]);

function edgeControlMatchesRoute(edgeControl, route) {
  if (!edgeControl?.pathRegex || !route) {
    return false;
  }
  try {
    return new RegExp(edgeControl.pathRegex).test(route);
  } catch {
    return false;
  }
}

function validateTrafficSafetyContracts({ apiRouteSecurity = {}, readFile = () => "" } = {}) {
  const failures = [];

  for (const contract of trafficSafetyContracts) {
    const routeConfig = apiRouteSecurity[contract.route];
    if (!routeConfig) {
      failures.push(`${contract.route} must be registered in apiRouteSecurity for traffic safety.`);
      continue;
    }

    if (routeConfig.moduleId !== contract.moduleId) {
      failures.push(`${contract.route} traffic contract module ${contract.moduleId} must match apiRouteSecurity ${routeConfig.moduleId}.`);
    }

    for (const [action, maxLimit] of Object.entries(contract.backendRateLimits)) {
      const actualLimit = Number(routeConfig.rateLimits?.[action]);
      if (!Number.isFinite(actualLimit) || actualLimit <= 0) {
        failures.push(`${contract.route} must define a positive backend ${action} rate limit.`);
        continue;
      }
      if (actualLimit > Number(maxLimit)) {
        failures.push(`${contract.route} ${action} backend rate limit ${actualLimit}/min exceeds traffic contract ${maxLimit}/min.`);
      }
    }

    for (const edgeControlId of contract.edgeControlIds) {
      const edgeControl = trafficSafetyEdgeControls[edgeControlId];
      if (!edgeControl) {
        failures.push(`${contract.route} references missing edge control ${edgeControlId}.`);
        continue;
      }
      if (edgeControl.required !== true) {
        failures.push(`${edgeControl.name} must stay required for ${contract.route}.`);
      }
      if (!edgeControlMatchesRoute(edgeControl, contract.route)) {
        failures.push(`${edgeControl.name} regex ${edgeControl.pathRegex} must match ${contract.route}.`);
      }
    }

    for (const sourceGuard of contract.clientGuardSources) {
      const source = readFile(sourceGuard.file);
      if (!source) {
        failures.push(`${contract.route} traffic guard source ${sourceGuard.file} is missing or empty.`);
        continue;
      }
      for (const token of sourceGuard.tokens) {
        if (!source.includes(token)) {
          failures.push(`${sourceGuard.file} must contain ${JSON.stringify(token)} for ${contract.route} traffic safety.`);
        }
      }
    }
  }

  return failures;
}

module.exports = {
  TRAFFIC_SAFETY_SCHEMA,
  edgeControlMatchesRoute,
  trafficSafetyContracts,
  trafficSafetyEdgeControls,
  validateTrafficSafetyContracts,
};
