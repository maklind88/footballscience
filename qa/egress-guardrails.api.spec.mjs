import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readNumericConstant(source, constantName) {
  const match = source.match(new RegExp(`(?:const|,|\\{)\\s+${constantName}\\s*=\\s*([^,;}]+)`));
  expect(match, `${constantName} must be declared`).toBeTruthy();
  const expression = match[1].trim();
  expect(expression, `${constantName} must stay a simple numeric expression`).toMatch(/^[\d\s*+/-]+$/);
  return Function(`"use strict"; return (${expression});`)();
}

test("client egress guardrails keep central state and presence sync sparse", () => {
  const appSource = readProjectFile("app-runtime.js");
  const centralReloadSource = readProjectFile("src/core/central-app-state-reload-service.mjs");
  const globalBindingsSource = readProjectFile("src/core/platform-global-runtime-bindings.mjs");
  const chatPresenceSource = readProjectFile("src/modules/chat/dashboard-chat-presence-runtime.mjs");

  expect(readNumericConstant(centralReloadSource, "refreshIntervalMs")).toBeGreaterThanOrEqual(60000);
  expect(readNumericConstant(centralReloadSource, "activeRefreshMinMs")).toBeGreaterThanOrEqual(30000);
  expect(readNumericConstant(appSource, "dashboardPresenceHeartbeatMs")).toBeGreaterThanOrEqual(60000);
  expect(readNumericConstant(appSource, "dashboardPresencePollMs")).toBeGreaterThanOrEqual(30000);
  expect(readNumericConstant(appSource, "dashboardPresenceSteadyPushMinMs")).toBeGreaterThanOrEqual(30000);
  expect(readNumericConstant(appSource, "dashboardPresencePollMinMs")).toBeGreaterThanOrEqual(30000);
  expect(centralReloadSource).toContain("refreshInFlight");
  expect(centralReloadSource).toContain("reason === \"interval\" && !documentRef.hasFocus()");
  expect(appSource).toContain("bindPlatformGlobalRuntimeEvents({");
  expect(globalBindingsSource).toContain("pauseDashboardPresenceRuntime?.();");
  expect(readNumericConstant(chatPresenceSource, "dashboardPresenceBackoffMs")).toBeGreaterThanOrEqual(60000);
  expect(chatPresenceSource).toContain("isDashboardPresenceBackoffActive");
  expect(chatPresenceSource).toContain("markDashboardPresenceBackoff");
});

test("server app-state API caches burst reads without caching writes", () => {
  const appStateSource = readProjectFile("api/app-state.js");

  expect(readNumericConstant(appStateSource, "STATE_BUCKET_CHECK_TTL_MS")).toBeGreaterThanOrEqual(5 * 60 * 1000);
  expect(readNumericConstant(appStateSource, "STATE_LIST_CACHE_TTL_MS")).toBeLessThanOrEqual(10000);
  expect(appStateSource).toContain("stateListObjectsCache");
  expect(appStateSource).toContain("cloneStateListResult");
  expect(appStateSource).toContain("clearStateListObjectsCache();");
});

test("presence and audit helpers avoid repeated Supabase bucket checks", () => {
  const presenceSource = readProjectFile("api/_lib/presence.js");
  const auditSource = readProjectFile("api/_lib/audit-log.js");
  const sessionHistorySource = readProjectFile("api/_lib/session-history.js");

  expect(readNumericConstant(presenceSource, "PRESENCE_BUCKET_CHECK_TTL_MS")).toBeGreaterThanOrEqual(5 * 60 * 1000);
  expect(readNumericConstant(presenceSource, "PRESENCE_READ_CACHE_TTL_MS")).toBeLessThanOrEqual(10000);
  expect(readNumericConstant(presenceSource, "PRESENCE_WRITE_MIN_INTERVAL_MS")).toBeGreaterThanOrEqual(30000);
  expect(readNumericConstant(presenceSource, "PRESENCE_STORAGE_REQUEST_TIMEOUT_MS")).toBeLessThanOrEqual(10000);
  expect(presenceSource).toContain("AbortSignal.timeout");
  expect(presenceSource).toContain("Presence storage is temporarily busy.");
  expect(presenceSource).toContain("throttled: true");
  expect(presenceSource).toContain("presenceObjectCache");
  expect(readNumericConstant(auditSource, "AUDIT_BUCKET_CHECK_TTL_MS")).toBeGreaterThanOrEqual(5 * 60 * 1000);
  expect(readNumericConstant(sessionHistorySource, "STATE_BUCKET_CHECK_TTL_MS")).toBeGreaterThanOrEqual(5 * 60 * 1000);
});
