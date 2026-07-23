import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  runSessionPlannerShadowCheck,
} from "../scripts/session-planner-shadow-check.mjs";

const require = createRequire(import.meta.url);
const {
  extractSessionPlannerDomainRecords,
  hashJsonValue,
} = require("../api/_lib/session-planner-domain-records.js");
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptSource = fs.readFileSync(
  path.join(rootDir, "scripts/session-planner-shadow-check.mjs"),
  "utf8"
);
const organizationId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const projectRef = "staging-project";
const checkedAt = "2026-07-23T03:00:00.000Z";

function sourceState() {
  return {
    selectedDate: "2026-07-23",
    sessions: {
      "2026-07-23": {
        id: "session-2026-07-23",
        date: "2026-07-23",
        title: "Private first-team training",
        theme: "Private tactical theme",
        selectedBlockId: "block-1",
        blocks: [{ id: "block-1", title: "Private exercise", minutes: 20 }],
      },
    },
  };
}

function sourceRecord(state = sourceState()) {
  const value = JSON.stringify(state);
  return {
    organization_id: "global",
    state_key: "football-session-planner-v3",
    module_id: "session-planner",
    revision: 42,
    value,
    value_hash: crypto.createHash("sha256").update(value, "utf8").digest("hex"),
  };
}

function targetRows(state = sourceState()) {
  const records = extractSessionPlannerDomainRecords(state, { organizationId, teamId });
  return {
    ok: true,
    sessions: records.sessions.map((row) => ({ ...row, rowVersion: 1, archivedAt: null })),
    blocks: records.blocks.map((row) => ({ ...row, rowVersion: 1, archivedAt: null })),
  };
}

function options(record = sourceRecord()) {
  return {
    json: true,
    target: "staging",
    expectedProjectRef: projectRef,
    organizationId,
    teamId,
    appStateOrganizationId: "global",
    expectedSourceRevision: record.revision,
    expectedSourceHash: record.value_hash,
  };
}

function dependencies(record = sourceRecord(), rows = targetRows()) {
  const reads = { scope: 0, source: 0, target: 0 };
  return {
    reads,
    values: {
      env: {
        SESSION_PLANNER_DATABASE_MODE: "shadow",
        SESSION_PLANNER_DATABASE_SCOPES: `${organizationId}:${teamId}`,
      },
      config: {
        url: `https://${projectRef}.supabase.co`,
        serviceRoleKey: "isolated-test-key",
      },
      now: () => new Date(checkedAt),
      resolveScope: async () => {
        reads.scope += 1;
        return { organizationId, teamId };
      },
      readSourceRecord: async () => {
        reads.source += 1;
        return record;
      },
      readTargetSnapshot: async () => {
        reads.target += 1;
        return rows;
      },
    },
  };
}

test("Session Planner shadow check requires shadow mode and exact tenant allowlist before reads", async () => {
  const record = sourceRecord();
  const harness = dependencies(record);
  harness.values.env = {};
  await expect(runSessionPlannerShadowCheck(options(record), harness.values))
    .rejects.toThrow("shadow mode is not enabled");
  expect(harness.reads).toEqual({ scope: 0, source: 0, target: 0 });

  harness.values.env = {
    SESSION_PLANNER_DATABASE_MODE: "shadow",
    SESSION_PLANNER_DATABASE_SCOPES: `${organizationId}:33333333-3333-4333-8333-333333333333`,
  };
  await expect(runSessionPlannerShadowCheck(options(record), harness.values))
    .rejects.toThrow("exact tenant scope is not allowlisted");
  expect(harness.reads).toEqual({ scope: 0, source: 0, target: 0 });
});

test("Session Planner shadow check proves convergence without exposing content or enabling writes", async () => {
  const record = sourceRecord();
  const harness = dependencies(record);
  const report = await runSessionPlannerShadowCheck(options(record), harness.values);

  expect(report).toMatchObject({
    ok: true,
    schema: "footballscience-session-planner-shadow-check-v1",
    mode: "shadow-read-only",
    target: "staging",
    projectRef,
    checkedAt,
    source: { revision: 42, hash: record.value_hash },
    counts: {
      sourceSessions: 1,
      sourceBlocks: 1,
      candidateSessions: 1,
      candidateBlocks: 1,
      pendingActions: 0,
      blockers: 0,
    },
    comparison: { equal: true, sessionCount: 1 },
    reasonCode: "session_planner_shadow_match",
    backfillConverged: true,
    shadowComparisonPassed: true,
    userFacingSource: "app-state",
    promotionBlocked: true,
    writeCapability: false,
    applyEnabled: false,
    containsCoachingContent: false,
  });
  expect(harness.reads).toEqual({ scope: 1, source: 1, target: 1 });
  expect(JSON.stringify(report)).not.toContain("Private first-team training");
  expect(JSON.stringify(report)).not.toContain("Private exercise");
  expect(scriptSource).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  expect(scriptSource).not.toContain("--apply");
});

test("Session Planner shadow check fails closed on a valid but divergent target", async () => {
  const record = sourceRecord();
  const rows = targetRows();
  rows.sessions[0].title = "Different title";
  rows.sessions[0].content = { ...rows.sessions[0].content, title: "Different title" };
  rows.sessions[0].contentHash = hashJsonValue(rows.sessions[0].content);
  const harness = dependencies(record, rows);
  const report = await runSessionPlannerShadowCheck(options(record), harness.values);

  expect(report).toMatchObject({
    ok: false,
    reasonCode: "session_planner_shadow_mismatch",
    backfillConverged: false,
    shadowComparisonPassed: false,
    fallbackRequired: true,
    promotionBlocked: true,
    userFacingSource: "app-state",
  });
  expect(report.counts.pendingActions).toBe(1);
});

test("Session Planner shadow check rejects a mismatched project before any data read", async () => {
  const record = sourceRecord();
  const harness = dependencies(record);
  await expect(runSessionPlannerShadowCheck(
    { ...options(record), expectedProjectRef: "different-project" },
    harness.values
  )).rejects.toThrow("project ref does not match");
  expect(harness.reads).toEqual({ scope: 0, source: 0, target: 0 });
});
