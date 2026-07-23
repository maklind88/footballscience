import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  parseBackfillReviewArgs,
  prepareSessionPlannerBackfillReview,
  runSessionPlannerBackfillReview,
} from "../scripts/session-planner-backfill-plan.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptSource = fs.readFileSync(path.join(rootDir, "scripts/session-planner-backfill-plan.mjs"), "utf8");
const organizationId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const projectRef = "example";
const generatedAt = "2026-07-22T23:58:00.000Z";

function sourceState() {
  return {
    selectedDate: "2026-07-22",
    sessions: {
      "2026-07-22": {
        id: "session-2026-07-22",
        date: "2026-07-22",
        title: "Private training title",
        theme: "Private tactical theme",
        selectedBlockId: "block-1",
        blocks: [{ id: "block-1", title: "Private exercise", minutes: 20 }],
      },
    },
  };
}

function sourceRecord(state = sourceState(), revision = 42) {
  const value = JSON.stringify(state);
  return {
    organization_id: "global",
    state_key: "football-session-planner-v3",
    module_id: "session-planner",
    revision,
    value,
    value_hash: crypto.createHash("sha256").update(value, "utf8").digest("hex"),
  };
}

function reviewOptions(record = sourceRecord()) {
  return {
    target: "staging",
    expectedProjectRef: projectRef,
    organizationId,
    teamId,
    appStateOrganizationId: "global",
    expectedSourceRevision: record.revision,
    expectedSourceHash: record.value_hash,
  };
}

function dependencies(record = sourceRecord(), targetRows = { ok: true, sessions: [], blocks: [] }) {
  const targetReads = [];
  return {
    targetReads,
    values: {
      resolveScope: async () => ({ organizationId, teamId, teamName: "First Team", teamSlug: "first-team" }),
      readSourceRecord: async () => record,
      readTargetSnapshot: async (scope, options) => {
        targetReads.push({ scope, options });
        return targetRows;
      },
      config: { url: "https://example.supabase.co", serviceRoleKey: "server-test-key" },
      now: () => new Date(generatedAt),
    },
  };
}

test("Session Planner backfill review requires explicit tenant and exact source checkpoint", async () => {
  expect(parseBackfillReviewArgs([], {})).toEqual({
    json: false,
    help: false,
    target: "",
    expectedProjectRef: "",
    organizationId: "",
    teamId: "",
    appStateOrganizationId: "global",
    expectedSourceRevision: 0,
    expectedSourceHash: "",
  });
  await expect(runSessionPlannerBackfillReview({}, {})).rejects.toThrow("explicit organization id");

  const record = sourceRecord();
  const harness = dependencies(record);
  await expect(runSessionPlannerBackfillReview(
    { ...reviewOptions(record), expectedSourceRevision: record.revision - 1 },
    harness.values
  )).rejects.toThrow("source revision changed");
  await expect(runSessionPlannerBackfillReview(
    { ...reviewOptions(record), expectedSourceHash: "f".repeat(64) },
    harness.values
  )).rejects.toThrow("source hash changed");
});

test("Session Planner backfill review is GET-only, content-free and includes archived target rows", async () => {
  const record = sourceRecord();
  const harness = dependencies(record);
  const prepared = await prepareSessionPlannerBackfillReview(reviewOptions(record), harness.values);
  const report = await runSessionPlannerBackfillReview(reviewOptions(record), harness.values);

  expect(prepared.backfillPlan).toMatchObject({ ok: true, counts: { actions: 2, blockers: 0 } });
  expect(prepared.privateSnapshot.rows).toEqual({ sessions: [], blocks: [] });
  expect(report).toMatchObject({
    mode: "read-only",
    target: "staging",
    projectRef,
    writeCapability: false,
    applyEnabled: false,
    readyForApplyReview: true,
    containsCoachingContent: false,
    source: { revision: 42, hash: record.value_hash },
    scope: { organizationId, teamId },
    snapshot: { counts: { sessions: 0, blocks: 0 }, containsCoachingContent: false },
    backfill: { counts: { actions: 2, blockers: 0 }, containsCoachingContent: false },
  });
  expect(JSON.stringify(report)).not.toContain("Private training title");
  expect(JSON.stringify(report)).not.toContain("Private exercise");
  expect(harness.targetReads).toHaveLength(2);
  expect(harness.targetReads.every((read) => read.options.includeArchived === true)).toBe(true);
  expect(harness.targetReads.every((read) => read.options.allowDisabled === true)).toBe(true);
  expect(scriptSource).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  expect(scriptSource).not.toContain("--apply");
});

test("Session Planner backfill review blocks a mismatched Supabase project before tenant or data reads", async () => {
  const record = sourceRecord();
  const harness = dependencies(record);
  let scopeReads = 0;
  let sourceReads = 0;
  harness.values.resolveScope = async () => {
    scopeReads += 1;
    return { organizationId, teamId };
  };
  harness.values.readSourceRecord = async () => {
    sourceReads += 1;
    return record;
  };

  await expect(runSessionPlannerBackfillReview(
    { ...reviewOptions(record), expectedProjectRef: "different-project" },
    harness.values
  )).rejects.toThrow("project ref does not match");
  expect(scopeReads).toBe(0);
  expect(sourceReads).toBe(0);
  expect(harness.targetReads).toHaveLength(0);
});

test("Session Planner backfill review rejects a resolved tenant mismatch", async () => {
  const record = sourceRecord();
  const harness = dependencies(record);
  harness.values.resolveScope = async () => ({
    organizationId,
    teamId: "33333333-3333-4333-8333-333333333333",
  });

  await expect(runSessionPlannerBackfillReview(reviewOptions(record), harness.values))
    .rejects.toThrow("does not match the explicit review scope");
  expect(harness.targetReads).toHaveLength(0);
});

test("Session Planner backfill review blocks a missing or invalid target snapshot", async () => {
  const record = sourceRecord();
  const harness = dependencies(record, {
    ok: false,
    code: "session_planner_database_missing",
  });
  await expect(runSessionPlannerBackfillReview(reviewOptions(record), harness.values))
    .rejects.toThrow("session_planner_database_missing");
});
