import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  edgeControlMatchesRoute,
  trafficSafetyContracts,
  trafficSafetyEdgeControls,
} = require("../src/core/traffic-safety-contracts.cjs");

export const VERCEL_FIREWALL_CONFIG_URL = "https://api.vercel.com/v1/security/firewall/config/active";

function toBoolean(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function collectStringValues(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectStringValues(entry, output));
    return output;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((entry) => collectStringValues(entry, output));
  }
  return output;
}

function stringPatternMatchesRoute(pattern, route) {
  const text = String(pattern || "").trim();
  if (!text) {
    return false;
  }
  if (text === route || text.includes(route)) {
    return true;
  }
  if (!text.includes("/api")) {
    return false;
  }
  try {
    return new RegExp(text).test(route);
  } catch {
    return false;
  }
}

function ruleMatchesRoute(rule, route) {
  return collectStringValues(rule?.conditionGroup).some((value) => stringPatternMatchesRoute(value, route));
}

function getRateLimit(rule) {
  return (
    rule?.action?.mitigate?.rateLimit ||
    rule?.action?.rateLimit ||
    rule?.mitigate?.rateLimit ||
    rule?.rateLimit ||
    null
  );
}

function findRuleForEdgeControl(rules, edgeControl) {
  const expectedName = normalize(edgeControl.name);
  return rules.find((rule) => normalize(rule?.name) === expectedName) || null;
}

function validateEdgeControlRule({ edgeControl, rule, routes }) {
  const failures = [];
  const label = edgeControl.name;

  if (!rule) {
    failures.push(`${label} must exist in the active Vercel Firewall configuration.`);
    return failures;
  }
  if (!toBoolean(rule.active)) {
    failures.push(`${label} must be active.`);
  }
  if (rule.valid !== undefined && !toBoolean(rule.valid)) {
    failures.push(`${label} must be valid in Vercel Firewall.`);
  }

  for (const route of routes) {
    if (!edgeControlMatchesRoute(edgeControl, route)) {
      failures.push(`${label} traffic contract regex must cover ${route}.`);
    }
    if (!ruleMatchesRoute(rule, route)) {
      failures.push(`${label} active Vercel Firewall rule must match ${route}.`);
    }
  }

  const expectedRateLimit = edgeControl.rateLimit || {};
  const actualRateLimit = getRateLimit(rule);
  if (!actualRateLimit) {
    failures.push(`${label} must use a Vercel Firewall rateLimit action.`);
    return failures;
  }

  const actualWindow = toNumber(actualRateLimit.window ?? actualRateLimit.windowSeconds);
  const actualLimit = toNumber(actualRateLimit.limit);
  const actualKeys = Array.isArray(actualRateLimit.keys) ? actualRateLimit.keys.map(normalize) : [];
  const expectedKey = normalize(expectedRateLimit.key);

  if (normalize(actualRateLimit.algo ?? actualRateLimit.algorithm) !== normalize(expectedRateLimit.algorithm)) {
    failures.push(`${label} must use ${expectedRateLimit.algorithm} rate limiting.`);
  }
  if (!Number.isFinite(actualWindow) || actualWindow > Number(expectedRateLimit.windowSeconds)) {
    failures.push(`${label} window must be <= ${expectedRateLimit.windowSeconds} seconds.`);
  }
  if (!Number.isFinite(actualLimit) || actualLimit > Number(expectedRateLimit.limit)) {
    failures.push(`${label} limit must be <= ${expectedRateLimit.limit} requests per window.`);
  }
  if (expectedKey && !actualKeys.includes(expectedKey)) {
    failures.push(`${label} rate limit key must include ${expectedRateLimit.key}.`);
  }
  if (normalize(actualRateLimit.action) !== normalize(expectedRateLimit.action)) {
    failures.push(`${label} rate limit action must be ${expectedRateLimit.action}.`);
  }

  return failures;
}

export function validateVercelFirewallConfig(
  config,
  {
    contracts = trafficSafetyContracts,
    edgeControls = trafficSafetyEdgeControls,
  } = {}
) {
  const failures = [];

  if (!config || typeof config !== "object") {
    return ["Vercel Firewall config response must be an object."];
  }
  if (!toBoolean(config.firewallEnabled)) {
    failures.push("Vercel Firewall must be enabled for the production project.");
  }
  if (!Array.isArray(config.rules)) {
    failures.push("Vercel Firewall config must include a rules array.");
    return failures;
  }

  for (const [edgeControlId, edgeControl] of Object.entries(edgeControls)) {
    if (edgeControl.required !== true) {
      continue;
    }
    const protectedRoutes = contracts
      .filter((contract) => contract.edgeControlIds.includes(edgeControlId))
      .map((contract) => contract.route);
    const rule = findRuleForEdgeControl(config.rules, edgeControl);
    failures.push(...validateEdgeControlRule({ edgeControl, rule, routes: protectedRoutes }));
  }

  return failures;
}

export async function readFirewallConfig({
  fetchImpl = globalThis.fetch,
  token = process.env.VERCEL_TOKEN,
  teamId = process.env.VERCEL_ORG_ID,
  projectId = process.env.VERCEL_PROJECT_ID,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Global fetch is unavailable; use Node 18+ or pass fetchImpl.");
  }
  if (!token) {
    throw new Error("VERCEL_TOKEN is required to verify Vercel Firewall drift.");
  }
  if (!projectId) {
    throw new Error("VERCEL_PROJECT_ID is required to verify Vercel Firewall drift.");
  }

  const url = new URL(VERCEL_FIREWALL_CONFIG_URL);
  url.searchParams.set("projectId", projectId);
  if (teamId) {
    url.searchParams.set("teamId", teamId);
  }

  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const body = await response.text();
  let data = null;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail = data?.error?.message || data?.message || body || response.statusText;
    throw new Error(`Vercel Firewall config request failed (${response.status}): ${detail}`);
  }

  return data;
}

export async function main() {
  const config = await readFirewallConfig();
  const failures = validateVercelFirewallConfig(config);

  if (failures.length) {
    console.error("Vercel Firewall drift verification failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }

  console.log("Vercel Firewall drift verification: ok");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Vercel Firewall drift verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
