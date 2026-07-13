import crypto from "node:crypto";
import process from "node:process";

export const TRAFFIC_INCIDENT_SNAPSHOT_SCHEMA = "footballscience-traffic-incident-snapshot-v1";
export const VERCEL_DEPLOYMENTS_URL = "https://api.vercel.com/v7/deployments";

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 350000;
const DEFAULT_TOP_LIMIT = 5;

function clean(value) {
  return String(value || "").trim();
}

function count(map, key, increment = 1) {
  const label = clean(key) || "unknown";
  map.set(label, (map.get(label) || 0) + increment);
}

function topEntries(map, limit = DEFAULT_TOP_LIMIT) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([label, countValue]) => ({ label, count: countValue }));
}

function safeStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status > 0 ? status : null;
}

function safeDurationMs(value) {
  const ms = Number(value);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

function safePath(value) {
  const text = clean(value);
  if (!text || text === "unknown") {
    return "";
  }
  try {
    const url = text.startsWith("http") ? new URL(text) : new URL(text, "https://footballscience.local");
    return url.pathname || "";
  } catch {
    return text.split("?")[0].slice(0, 140);
  }
}

function hashSensitive(value) {
  const text = clean(value);
  if (!text || text === "unknown") {
    return "";
  }
  return `hash:${crypto.createHash("sha256").update(text).digest("hex").slice(0, 12)}`;
}

export function classifyUserAgent(value) {
  const text = clean(value);
  if (!text || text === "unknown") {
    return "";
  }
  if (/headlesschrome|puppeteer|playwright/i.test(text)) {
    return "automated-browser";
  }
  if (/googlebot|bingbot|crawler|spider|bot\b/i.test(text)) {
    return "bot";
  }
  if (/chrome/i.test(text)) {
    return "chrome";
  }
  if (/safari/i.test(text)) {
    return "safari";
  }
  if (/firefox/i.test(text)) {
    return "firefox";
  }
  if (/curl|wget|httpie|python-requests|node-fetch/i.test(text)) {
    return "scripted-client";
  }
  return "other";
}

function parseJsonCandidate(text) {
  const source = clean(text);
  if (!source) {
    return null;
  }
  const start = source.indexOf("{");
  if (start < 0) {
    return null;
  }
  try {
    return JSON.parse(source.slice(start));
  } catch {
    return null;
  }
}

function normalizeRawLogEntry(entry = {}) {
  const structured = parseJsonCandidate(entry.message || entry.text || "") || {};
  const route = safePath(structured.route || structured.path || entry.requestPath || entry.path || "");
  const status = safeStatus(structured.status || structured.statusCode || entry.responseStatusCode);
  const durationMs = safeDurationMs(structured.ms || structured.durationMs || entry.durationMs);
  const ipHash = hashSensitive(structured.ip || entry.ip || entry.clientIp || "");
  const userAgentClass = classifyUserAgent(structured.userAgent || entry.userAgent || entry["user-agent"] || "");
  const eventType = clean(structured.eventType || entry.eventType || "");
  const level = clean(structured.level || entry.level || "");

  return {
    route,
    method: clean(structured.method || entry.requestMethod || entry.method || ""),
    status,
    durationMs,
    ipHash,
    userAgentClass,
    eventType,
    level,
    isRateLimited: status === 429 || eventType === "api.rate_limited",
    isServerError: Number(status) >= 500 || level === "error" || eventType === "api.request.failed",
    isAuthOrPermissionError: status === 401 || status === 403 || eventType === "api.permission_denied",
  };
}

export function parseTrafficLogText(text) {
  const source = clean(text);
  if (!source) {
    return [];
  }

  try {
    const parsed = JSON.parse(source);
    const entries = Array.isArray(parsed) ? parsed : parsed?.logs || parsed?.events || [parsed];
    return entries.filter(Boolean).map(normalizeRawLogEntry);
  } catch {
    // Runtime log streams commonly arrive as NDJSON. Fall through to line parsing.
  }

  return source
    .split(/\r?\n/)
    .map((line) => parseJsonCandidate(line))
    .filter(Boolean)
    .map(normalizeRawLogEntry);
}

function recommendedActionsFromSummary(summary) {
  const actions = [];
  const routeLabels = new Set(summary.topRoutes.map((entry) => entry.route));

  if (summary.rateLimitedCount > 0) {
    actions.push("Rate limiting is active; confirm affected users are not blocked and inspect whether the same anonymized actor dominates requests.");
  }
  if (summary.serverErrorCount > 0) {
    actions.push("Investigate the first failing runtime step before deploying over the incident.");
  }
  if (routeLabels.has("/api/chat") || routeLabels.has("/api/presence") || routeLabels.has("/api/push-subscriptions")) {
    actions.push("Check chat/presence polling, push subscription status refresh, and the Vercel Firewall chat/presence rule.");
  }
  if (routeLabels.has("/api/app-state")) {
    actions.push("Check central save/sync latency and stale-write behavior before assuming user content was lost.");
  }
  if (!actions.length) {
    actions.push("Open the workflow run and inspect the first failing monitor step; this snapshot did not identify a dominant API route.");
  }

  return actions.slice(0, 4);
}

export function summarizeTrafficEvents(events = [], { topLimit = DEFAULT_TOP_LIMIT } = {}) {
  const routeStats = new Map();
  const statuses = new Map();
  const eventTypes = new Map();
  const ipHashes = new Map();
  const userAgents = new Map();
  let rateLimitedCount = 0;
  let serverErrorCount = 0;
  let authOrPermissionErrorCount = 0;

  for (const event of events) {
    if (!event?.route && !event?.status && !event?.eventType) {
      continue;
    }

    if (event.status) {
      count(statuses, String(event.status));
    }
    if (event.eventType) {
      count(eventTypes, event.eventType);
    }
    if (event.ipHash) {
      count(ipHashes, event.ipHash);
    }
    if (event.userAgentClass) {
      count(userAgents, event.userAgentClass);
    }
    if (event.isRateLimited) {
      rateLimitedCount += 1;
    }
    if (event.isServerError) {
      serverErrorCount += 1;
    }
    if (event.isAuthOrPermissionError) {
      authOrPermissionErrorCount += 1;
    }

    const route = event.route || "unknown";
    const routeStat =
      routeStats.get(route) ||
      {
        route,
        count: 0,
        statuses: new Map(),
        rateLimitedCount: 0,
        serverErrorCount: 0,
        authOrPermissionErrorCount: 0,
        totalDurationMs: 0,
        durationSamples: 0,
      };
    routeStat.count += 1;
    if (event.status) {
      count(routeStat.statuses, String(event.status));
    }
    if (event.isRateLimited) {
      routeStat.rateLimitedCount += 1;
    }
    if (event.isServerError) {
      routeStat.serverErrorCount += 1;
    }
    if (event.isAuthOrPermissionError) {
      routeStat.authOrPermissionErrorCount += 1;
    }
    if (event.durationMs !== null && event.durationMs !== undefined) {
      routeStat.totalDurationMs += event.durationMs;
      routeStat.durationSamples += 1;
    }
    routeStats.set(route, routeStat);
  }

  const topRoutes = [...routeStats.values()]
    .sort((left, right) => right.count - left.count || left.route.localeCompare(right.route))
    .slice(0, topLimit)
    .map((entry) => ({
      route: entry.route,
      count: entry.count,
      statuses: Object.fromEntries([...entry.statuses.entries()].sort()),
      rateLimitedCount: entry.rateLimitedCount,
      serverErrorCount: entry.serverErrorCount,
      authOrPermissionErrorCount: entry.authOrPermissionErrorCount,
      averageMs: entry.durationSamples ? Math.round(entry.totalDurationMs / entry.durationSamples) : null,
    }));

  const summary = {
    schema: TRAFFIC_INCIDENT_SNAPSHOT_SCHEMA,
    generatedAt: new Date().toISOString(),
    status: "ok",
    eventsAnalyzed: events.length,
    topRoutes,
    topStatuses: topEntries(statuses, topLimit),
    topEventTypes: topEntries(eventTypes, topLimit),
    topAnonymizedIps: topEntries(ipHashes, topLimit),
    topUserAgentClasses: topEntries(userAgents, topLimit),
    rateLimitedCount,
    serverErrorCount,
    authOrPermissionErrorCount,
  };

  return {
    ...summary,
    recommendedActions: recommendedActionsFromSummary(summary),
  };
}

function markdownTable(headers, rows) {
  if (!rows.length) {
    return "_No matching events in the sampled runtime logs._";
  }
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

export function buildTrafficIncidentSnapshotMarkdown(snapshot = {}) {
  if (snapshot.status === "skipped") {
    return [
      "## Traffic Snapshot",
      "",
      `- Status: skipped (${snapshot.reason || "not configured"})`,
      "- No secrets, raw IPs, raw user agents, or user content were collected.",
    ].join("\n");
  }

  if (snapshot.status === "error") {
    return [
      "## Traffic Snapshot",
      "",
      `- Status: unavailable (${snapshot.reason || "unknown error"})`,
      "- Open Vercel Monitoring manually and inspect the current route/status breakdown.",
    ].join("\n");
  }

  const routeRows = (snapshot.topRoutes || []).map((entry) => [
    entry.route,
    String(entry.count),
    Object.entries(entry.statuses || {})
      .map(([status, countValue]) => `${status}:${countValue}`)
      .join(", ") || "-",
    String(entry.rateLimitedCount || 0),
    String(entry.serverErrorCount || 0),
    entry.averageMs === null || entry.averageMs === undefined ? "-" : String(entry.averageMs),
  ]);
  const statusRows = (snapshot.topStatuses || []).map((entry) => [entry.label, String(entry.count)]);
  const ipRows = (snapshot.topAnonymizedIps || []).map((entry) => [entry.label, String(entry.count)]);
  const uaRows = (snapshot.topUserAgentClasses || []).map((entry) => [entry.label, String(entry.count)]);

  return [
    "## Traffic Snapshot",
    "",
    `- Source: ${snapshot.source || "Vercel runtime logs"}`,
    `- Deployment: ${snapshot.deploymentId || "unknown"}`,
    `- Events analyzed: ${snapshot.eventsAnalyzed || 0}`,
    `- Rate-limited events: ${snapshot.rateLimitedCount || 0}`,
    `- Server-error events: ${snapshot.serverErrorCount || 0}`,
    `- Auth/permission events: ${snapshot.authOrPermissionErrorCount || 0}`,
    "- Privacy: raw IPs and full user agents are intentionally redacted.",
    "",
    "### Top Routes",
    "",
    markdownTable(["Route", "Count", "Statuses", "429", "5xx", "Avg ms"], routeRows),
    "",
    "### Top Statuses",
    "",
    markdownTable(["Status", "Count"], statusRows),
    "",
    "### Top Anonymized Actors",
    "",
    markdownTable(["Actor hash", "Count"], ipRows),
    "",
    "### User Agent Classes",
    "",
    markdownTable(["Class", "Count"], uaRows),
    "",
    "### Recommended Next Actions",
    "",
    ...(snapshot.recommendedActions || []).map((action, index) => `${index + 1}. ${action}`),
  ].join("\n");
}

async function readResponseTextWithBudget(response, { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  if (!response.body?.getReader) {
    return { text: await response.text(), truncated: false };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let truncated = false;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs && text.length < maxBytes) {
    const remainingMs = Math.max(50, timeoutMs - (Date.now() - startedAt));
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), remainingMs));
    const chunk = await Promise.race([reader.read(), timeout]);
    if (chunk?.timeout) {
      truncated = true;
      break;
    }
    if (chunk.done) {
      break;
    }
    text += decoder.decode(chunk.value, { stream: true });
  }

  if (text.length >= maxBytes) {
    truncated = true;
  }
  try {
    await reader.cancel();
  } catch {
    // Best-effort cleanup only.
  }

  return { text, truncated };
}

async function vercelJson(url, { fetchImpl, token, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(payload?.error?.message || payload?.message || response.statusText);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export async function collectTrafficIncidentSnapshot({
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = Number(env.INCIDENT_TRAFFIC_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  maxBytes = Number(env.INCIDENT_TRAFFIC_MAX_BYTES || DEFAULT_MAX_BYTES),
} = {}) {
  if (env.INCIDENT_TRAFFIC_SNAPSHOT === "0") {
    return { schema: TRAFFIC_INCIDENT_SNAPSHOT_SCHEMA, status: "skipped", reason: "disabled by INCIDENT_TRAFFIC_SNAPSHOT=0" };
  }
  if (typeof fetchImpl !== "function") {
    return { schema: TRAFFIC_INCIDENT_SNAPSHOT_SCHEMA, status: "skipped", reason: "fetch is unavailable" };
  }

  const token = clean(env.VERCEL_TOKEN);
  const projectId = clean(env.VERCEL_PROJECT_ID);
  const teamId = clean(env.VERCEL_ORG_ID);
  const missing = [
    !token && "VERCEL_TOKEN",
    !projectId && "VERCEL_PROJECT_ID",
  ].filter(Boolean);
  if (missing.length) {
    return {
      schema: TRAFFIC_INCIDENT_SNAPSHOT_SCHEMA,
      status: "skipped",
      reason: `missing ${missing.join(", ")}`,
    };
  }

  try {
    const deploymentsUrl = new URL(VERCEL_DEPLOYMENTS_URL);
    deploymentsUrl.searchParams.set("projectId", projectId);
    deploymentsUrl.searchParams.set("target", "production");
    deploymentsUrl.searchParams.set("state", "READY");
    deploymentsUrl.searchParams.set("limit", "1");
    if (teamId) {
      deploymentsUrl.searchParams.set("teamId", teamId);
    }

    const deployments = await vercelJson(deploymentsUrl, { fetchImpl, token, timeoutMs });
    const deployment = deployments?.deployments?.[0];
    const deploymentId = clean(deployment?.uid || deployment?.id);
    if (!deploymentId) {
      return { schema: TRAFFIC_INCIDENT_SNAPSHOT_SCHEMA, status: "error", reason: "no ready production deployment found" };
    }

    const logsUrl = new URL(`https://api.vercel.com/v1/projects/${encodeURIComponent(projectId)}/deployments/${encodeURIComponent(deploymentId)}/runtime-logs`);
    if (teamId) {
      logsUrl.searchParams.set("teamId", teamId);
    }

    const logsController = new AbortController();
    const logsTimeout = setTimeout(() => logsController.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(logsUrl, {
        headers: {
          Accept: "application/stream+json, application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: logsController.signal,
      });
    } finally {
      clearTimeout(logsTimeout);
    }
    if (!response.ok) {
      const body = await response.text();
      return {
        schema: TRAFFIC_INCIDENT_SNAPSHOT_SCHEMA,
        status: "error",
        reason: `runtime logs returned ${response.status}: ${(body || response.statusText).slice(0, 160)}`,
      };
    }

    const { text, truncated } = await readResponseTextWithBudget(response, { timeoutMs, maxBytes });
    const events = parseTrafficLogText(text);
    return {
      ...summarizeTrafficEvents(events),
      deploymentId,
      deploymentUrl: deployment?.url || "",
      source: truncated ? "Vercel runtime logs (time/size limited sample)" : "Vercel runtime logs",
      truncated,
    };
  } catch (error) {
    return {
      schema: TRAFFIC_INCIDENT_SNAPSHOT_SCHEMA,
      status: "error",
      reason: error?.name === "AbortError" ? `timed out after ${timeoutMs}ms` : clean(error?.message) || "unknown error",
    };
  }
}
