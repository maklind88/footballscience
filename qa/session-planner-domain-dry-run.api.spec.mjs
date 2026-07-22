import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import {
  buildSessionPlannerDryRunReport,
  parseDryRunArgs,
  runSessionPlannerDryRun,
} from "../scripts/session-planner-domain-dry-run.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptSource = fs.readFileSync(path.join(rootDir, "scripts/session-planner-domain-dry-run.mjs"), "utf8");
const organizationId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";

function sourceState() {
  return {
    selectedDate: "2026-07-22",
    blockDeletionTombstones: {
      "2026-07-21": { removed: "2026-07-22T08:00:00.000Z" },
    },
    blockReductionGuard: { "2026-07-21": 1784707200000 },
    sessions: {
      "2026-07-22": {
        id: "session-2026-07-22",
        date: "2026-07-22",
        title: "Training",
        theme: "Build-up",
        selectedBlockId: "block-1",
        blocks: [
          { id: "block-1", title: "Activation", duration: 15, fieldUpdatedAt: { title: 1784707200000 } },
        ],
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
    removed: false,
    updated_at: "2026-07-22T12:00:00.000Z",
    value_hash: "",
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

test("Session Planner dry-run has no apply or write request path", () => {
  expect(scriptSource).toContain('method: "GET"');
  expect(scriptSource).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  expect(scriptSource).not.toContain("writeAppStateRecord");
  expect(scriptSource).not.toContain("--apply");
  expect(scriptSource).toContain("writeCapability: false");
});

test("Session Planner dry-run arguments default to read-only global compatibility state", () => {
  expect(parseDryRunArgs([], {})).toEqual({
    json: false,
    help: false,
    organizationId: "",
    teamId: "",
    appStateOrganizationId: "global",
  });
  expect(parseDryRunArgs(["--json", `--organization-id=${organizationId}`, "--team-id", teamId], {})).toMatchObject({
    json: true,
    organizationId,
    teamId,
  });
});

test("Session Planner dry-run report proves hashes, bounds and golden-master equality", () => {
  const state = sourceState();
  const record = sourceRecord(state);
  const report = buildSessionPlannerDryRunReport({
    sourceRecord: record,
    sourceState: state,
    scope: { organizationId, teamId, teamName: "First Team", teamSlug: "first-team" },
    generatedAt: "2026-07-22T13:00:00.000Z",
  });
  expect(report.writeCapability).toBe(false);
  expect(report.readyForBackfillReview).toBe(true);
  expect(report.counts).toEqual({ sessions: 1, blocks: 1 });
  expect(report.compatibility).toEqual({ tombstoneDates: 1, tombstones: 1, reductionGuardDates: 1 });
  expect(report.comparison.equal).toBe(true);
  expect(report.failures).toEqual([]);
  expect(report).not.toHaveProperty("sessions");
});

test("Session Planner dry-run blocks a source hash mismatch", () => {
  const state = sourceState();
  const record = { ...sourceRecord(state), value_hash: "f".repeat(64) };
  const report = buildSessionPlannerDryRunReport({
    sourceRecord: record,
    sourceState: state,
    scope: { organizationId, teamId },
  });
  expect(report.readyForBackfillReview).toBe(false);
  expect(report.failures).toContain("sourceHashMatches");
});

test("Session Planner dry-run resolves one active team and performs GET requests only", async () => {
  const state = sourceState();
  const record = sourceRecord(state);
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method });
    if (String(url).includes("/platform_teams?")) {
      return jsonResponse([{ id: teamId, organization_id: organizationId, name: "First Team", slug: "first-team", status: "active" }]);
    }
    if (String(url).includes("/platform_app_state_records?")) return jsonResponse([record]);
    return jsonResponse({ message: "Unexpected request" }, 404);
  };
  const report = await runSessionPlannerDryRun(
    { appStateOrganizationId: "global" },
    { fetchImpl, config: { url: "https://example.supabase.co", serviceRoleKey: "test-secret" } }
  );
  expect(report.readyForBackfillReview).toBe(true);
  expect(requests).toHaveLength(2);
  expect(requests.every((request) => request.method === "GET")).toBe(true);
  expect(requests[0].url).toContain("status=eq.active");
  expect(requests[1].url).toContain("state_key=eq.football-session-planner-v3");
});

test("Session Planner dry-run refuses to guess between multiple active teams", async () => {
  const fetchImpl = async () => jsonResponse([
    { id: teamId, organization_id: organizationId, status: "active" },
    { id: "33333333-3333-4333-8333-333333333333", organization_id: organizationId, status: "active" },
  ]);
  await expect(runSessionPlannerDryRun(
    { appStateOrganizationId: "global" },
    { fetchImpl, config: { url: "https://example.supabase.co", serviceRoleKey: "test-secret" } }
  )).rejects.toThrow("requires an explicit team");
});
