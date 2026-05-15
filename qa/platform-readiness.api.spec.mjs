import { expect, test } from "@playwright/test";
import {
  assertPlatformReadinessContract,
  createPlatformModuleReadinessMap,
  createPlatformReadinessReport,
  platformObservabilitySignals,
  platformReadinessAreas,
  platformReadinessEnvironmentRequirements,
  platformReadinessStatuses,
} from "../src/core/platform-readiness-contracts.mjs";
import { platformModules, protectedStorageKeys } from "../src/core/platform-contracts.mjs";

const completeEnv = Object.fromEntries(
  platformReadinessEnvironmentRequirements.flatMap((requirement) => [
    ...requirement.required.map((name) => [name, `${name.toLowerCase()}-value`]),
    ...requirement.recommended.map((name) => [name, `${name.toLowerCase()}-value`]),
  ])
);

test("platform readiness contract covers every requested operating area", () => {
  const scripts = {
    deploy: "npm run release:ship:fast -- --push --deploy",
    "deploy:safe": "npm run release:ship:safe -- --push --deploy",
    check: "node --check app.js",
    qa: "npm run check",
    "release:postdeploy": "node scripts/verify-production-deploy.mjs",
    "release:monitor": "npm run release:monitor-postdeploy",
    "platform:readiness": "node scripts/verify-platform-readiness.mjs",
  };
  const report = createPlatformReadinessReport({
    env: completeEnv,
    scripts,
  });

  expect(assertPlatformReadinessContract({ env: completeEnv, scripts })).toBe(true);
  for (const area of platformReadinessAreas) {
    expect(report.sections.map((section) => section.id)).toContain(area.id);
  }
});

test("platform module map exposes data ownership, api routes, permissions, and implementation stage", () => {
  const modules = createPlatformModuleReadinessMap();
  const moduleIds = modules.map((module) => module.id);

  for (const module of platformModules) {
    expect(moduleIds).toContain(module.id);
  }

  for (const key of protectedStorageKeys) {
    expect(modules.some((module) => module.storageKeys.includes(key))).toBe(true);
  }

  expect(modules.find((module) => module.id === "chat")).toMatchObject({
    implementation: "database-backed-module",
    apiRoutes: ["/api/chat"],
    scope: "team",
    status: platformReadinessStatuses.pass,
  });
  expect(modules.find((module) => module.id === "session-planner")?.implementation).toBe("legacy-monolith");
  expect(modules.find((module) => module.id === "platform-readiness")).toMatchObject({
    implementation: "core-contract",
    apiRoutes: ["/api/platform-readiness"],
    scope: "organization",
  });
  expect(modules.find((module) => module.id === "platform-identity")).toMatchObject({
    implementation: "database-foundation",
    scope: "organization",
    status: platformReadinessStatuses.pass,
  });
});

test("staging and secret requirements are explicit without exposing secret values", () => {
  const report = createPlatformReadinessReport({ env: {}, scripts: {} });
  const staging = report.environment.filter((entry) => entry.area === "staging-mirror");
  const accounts = report.environment.filter((entry) => entry.area === "accounts-secrets");

  expect(staging.length).toBeGreaterThanOrEqual(3);
  expect(accounts.length).toBeGreaterThanOrEqual(3);
  expect(staging.some((entry) => entry.required.includes("STAGING_SUPABASE_PROJECT_REF"))).toBe(true);
  expect(accounts.some((entry) => entry.required.includes("VERCEL_TOKEN"))).toBe(true);
  expect(accounts.some((entry) => entry.required.includes("LIVE_QA_USERNAME"))).toBe(true);
  expect(report.environment.every((entry) => !JSON.stringify(entry).includes("secret-value"))).toBe(true);
});

test("observability covers deploy, api, saves, backup, auth, and performance signals", () => {
  const signalIds = platformObservabilitySignals.map((signal) => signal.id);

  expect(signalIds).toEqual(
    expect.arrayContaining([
      "deploy-failure",
      "api-errors",
      "failed-saves",
      "backup-restore",
      "auth-permission-spikes",
      "frontend-performance",
    ])
  );
  for (const signal of platformObservabilitySignals) {
    expect(signal.evidence.length).toBeGreaterThan(0);
  }
});
