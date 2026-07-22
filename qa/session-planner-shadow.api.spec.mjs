import { createRequire } from "node:module";
import { test, expect } from "@playwright/test";

const require = createRequire(import.meta.url);
const {
  SESSION_PLANNER_SHADOW_SCHEMA,
  runSessionPlannerShadowComparison,
} = require("../api/_lib/session-planner-shadow.js");

const organizationId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const now = () => new Date("2026-07-22T20:00:00.000Z");

function sourceState() {
  return {
    selectedDate: "2026-07-22",
    sessions: {
      "2026-07-22": {
        id: "session-2026-07-22",
        date: "2026-07-22",
        title: "Training",
        theme: "Pressing",
        selectedBlockId: "block-1",
        blocks: [{ id: "block-1", title: "Possession", minutes: 20 }],
      },
    },
  };
}

function shadowEnv(scope = `${organizationId}:${teamId}`) {
  return {
    SESSION_PLANNER_DATABASE_MODE: "shadow",
    SESSION_PLANNER_DATABASE_SCOPES: scope,
  };
}

test("Session Planner shadow comparison is disabled by default and performs no read", async () => {
  let reads = 0;
  const result = await runSessionPlannerShadowComparison(sourceState(), { organizationId, teamId }, {
    env: {},
    now,
    readCandidate: async () => { reads += 1; },
  });

  expect(result).toMatchObject({
    schema: SESSION_PLANNER_SHADOW_SCHEMA,
    status: "skipped",
    mode: "off",
    databaseReadAttempted: false,
    userFacingSource: "app-state",
    comparisonPassed: false,
    promotionBlocked: true,
  });
  expect(reads).toBe(0);
});

test("Session Planner shadow comparison fails closed outside the exact tenant allowlist", async () => {
  let reads = 0;
  const result = await runSessionPlannerShadowComparison(sourceState(), { organizationId, teamId }, {
    env: shadowEnv(`${organizationId}:33333333-3333-4333-8333-333333333333`),
    now,
    readCandidate: async () => { reads += 1; },
  });

  expect(result).toMatchObject({
    ok: true,
    status: "skipped",
    reasonCode: "session_planner_shadow_scope_not_enabled",
    databaseReadAttempted: false,
  });
  expect(reads).toBe(0);
});

test("Session Planner shadow comparison proves a matching candidate without changing the primary source", async () => {
  const source = sourceState();
  const sourceBefore = JSON.stringify(source);
  const candidateState = structuredClone(source);
  candidateState.selectedDate = "2026-07-21";
  const result = await runSessionPlannerShadowComparison(source, { organizationId, teamId }, {
    env: shadowEnv(),
    now,
    readCandidate: async () => ({ ok: true, state: candidateState }),
  });

  expect(result).toMatchObject({
    ok: true,
    status: "match",
    checkedAt: "2026-07-22T20:00:00.000Z",
    databaseReadAttempted: true,
    fallbackRequired: false,
    comparisonPassed: true,
    promotionBlocked: true,
    counts: {
      sourceSessions: 1,
      candidateSessions: 1,
      sourceBlocks: 1,
      candidateBlocks: 1,
    },
    comparison: { equal: true, sessionCount: 1 },
  });
  expect(result).not.toHaveProperty("state");
  expect(JSON.stringify(source)).toBe(sourceBefore);
});

test("Session Planner shadow mismatch keeps app-state primary and blocks promotion", async () => {
  const candidateState = sourceState();
  candidateState.sessions["2026-07-22"].blocks[0].minutes = 25;
  const result = await runSessionPlannerShadowComparison(sourceState(), { organizationId, teamId }, {
    env: shadowEnv(),
    now,
    readCandidate: async () => ({ ok: true, state: candidateState }),
  });

  expect(result).toMatchObject({
    ok: false,
    status: "mismatch",
    userFacingSource: "app-state",
    fallbackRequired: true,
    comparisonPassed: false,
    promotionBlocked: true,
    comparison: { equal: false },
  });
});

test("Session Planner shadow database failures return a sanitized fallback signal", async () => {
  const result = await runSessionPlannerShadowComparison(sourceState(), { organizationId, teamId }, {
    env: shadowEnv(),
    now,
    readCandidate: async () => ({
      ok: false,
      status: 503,
      reason: "sensitive provider detail",
    }),
  });

  expect(result).toMatchObject({
    ok: false,
    status: "unavailable",
    databaseReadAttempted: true,
    fallbackRequired: true,
    reasonCode: "session_planner_database_unavailable",
  });
  expect(JSON.stringify(result)).not.toContain("sensitive provider detail");
});

test("Session Planner shadow contract exposes no write or promotion path", () => {
  const shadow = require("../api/_lib/session-planner-shadow.js");
  expect(shadow.writeSessionPlannerDomainState).toBeUndefined();
  expect(shadow.promoteSessionPlannerDatabase).toBeUndefined();
  expect(shadow.applySessionPlannerBackfill).toBeUndefined();
});
