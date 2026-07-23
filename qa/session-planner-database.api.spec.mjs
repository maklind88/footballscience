import { createRequire } from "node:module";
import { test, expect } from "@playwright/test";

const require = createRequire(import.meta.url);
const database = require("../api/_lib/session-planner-database.js");
const { hashJsonValue } = require("../api/_lib/session-planner-domain-records.js");

const organizationId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createReadHarness() {
  const calls = [];
  const sessionContent = {
    id: "session-2026-07-22",
    date: "2026-07-22",
    title: "Training",
    theme: "Pressing",
    selectedBlockId: "block-1",
  };
  const blockPayload = { id: "block-1", title: "Possession", minutes: 20 };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/session_planner_sessions?")) {
      return jsonResponse([
        {
          id: sessionId,
          organization_id: organizationId,
          team_id: teamId,
          session_date: "2026-07-22",
          session_slot: "primary",
          legacy_session_id: "session-2026-07-22",
          title: "Training",
          theme: "Pressing",
          selected_block_legacy_id: "block-1",
          schema_version: 1,
          row_version: 4,
          content: sessionContent,
          content_hash: hashJsonValue(sessionContent),
          updated_at: "2026-07-22T12:00:00.000Z",
        },
      ]);
    }
    if (String(url).includes("/session_planner_blocks?")) {
      return jsonResponse([
        {
          id: "44444444-4444-4444-8444-444444444444",
          organization_id: organizationId,
          team_id: teamId,
          session_id: sessionId,
          legacy_block_id: "block-1",
          sort_order: 0,
          schema_version: 1,
          row_version: 2,
          payload: blockPayload,
          payload_hash: hashJsonValue(blockPayload),
          updated_at: "2026-07-22T12:00:00.000Z",
        },
      ]);
    }
    return jsonResponse({ message: "Unexpected URL" }, 404);
  };
  return {
    calls,
    options: {
      env: {
        SESSION_PLANNER_DATABASE_MODE: "shadow",
        SESSION_PLANNER_DATABASE_SCOPES: `${organizationId}:${teamId}`,
      },
      config: { url: "https://example.supabase.co/rest/v1", serviceRoleKey: "server-only-key" },
      fetchImpl,
    },
  };
}

test("Session Planner database adapter is disabled by default", async () => {
  let called = false;
  const result = await database.readSessionPlannerDomainSnapshot(
    { organizationId, teamId },
    { env: {}, fetchImpl: async () => { called = true; } }
  );

  expect(result).toEqual({
    ok: false,
    enabled: false,
    mode: "off",
    code: "session_planner_database_not_enabled",
  });
  expect(called).toBe(false);
  expect(database.isSessionPlannerDatabaseConfigured({})).toBe(false);
  expect(database.isSessionPlannerDatabaseReadEnabled({ SESSION_PLANNER_DATABASE_MODE: "planned" })).toBe(false);
  expect(database.isSessionPlannerDatabaseReadEnabled({ SESSION_PLANNER_DATABASE_MODE: "shadow" })).toBe(true);
});

test("Session Planner database reads require the exact tenant canary scope", async () => {
  let called = false;
  const result = await database.readSessionPlannerDomainSnapshot(
    { organizationId, teamId },
    {
      env: {
        SESSION_PLANNER_DATABASE_MODE: "shadow",
        SESSION_PLANNER_DATABASE_SCOPES: `${organizationId}:33333333-3333-4333-8333-333333333333`,
      },
      fetchImpl: async () => { called = true; },
    }
  );

  expect(result).toMatchObject({
    ok: false,
    enabled: false,
    mode: "shadow",
    code: "session_planner_scope_not_enabled",
  });
  expect(called).toBe(false);
  expect(database.getSessionPlannerDatabaseScopeAccess(
    { organizationId, teamId },
    {
      SESSION_PLANNER_DATABASE_MODE: "shadow",
      SESSION_PLANNER_DATABASE_SCOPES: `${organizationId}:${teamId}`,
    }
  )).toMatchObject({ enabled: true, allowlisted: true, mode: "shadow" });
});

test("Session Planner shadow adapter reads only scoped sessions and their blocks", async () => {
  const harness = createReadHarness();
  const result = await database.readSessionPlannerDomainSnapshot(
    { organizationId, teamId, dateFrom: "2026-07-22", dateTo: "2026-07-22" },
    harness.options
  );

  expect(result.ok).toBe(true);
  expect(result.sessions).toHaveLength(1);
  expect(result.blocks).toHaveLength(1);
  expect(result.sessions[0]).toMatchObject({ organizationId, teamId, sessionDate: "2026-07-22", rowVersion: 4 });
  expect(result.blocks[0]).toMatchObject({ organizationId, teamId, sessionId, legacyBlockId: "block-1" });
  expect(harness.calls).toHaveLength(2);
  expect(harness.calls[0].options.method).toBe("GET");
  expect(harness.calls[0].url).toContain(`organization_id=eq.${organizationId}`);
  expect(harness.calls[0].url).toContain(`team_id=eq.${teamId}`);
  expect(harness.calls[0].url).toContain("session_date=gte.2026-07-22");
  expect(harness.calls[0].url).toContain("session_date=lte.2026-07-22");
  expect(harness.calls[1].url).toContain(`session_id=in.%28${sessionId}%29`);
  expect(harness.calls[0].url).toContain("archived_at=is.null");
});

test("Session Planner migration snapshot reads active and archived rows with audit metadata", async () => {
  const harness = createReadHarness();
  const result = await database.readSessionPlannerDomainSnapshot(
    { organizationId, teamId },
    { ...harness.options, allowDisabled: true, includeArchived: true }
  );

  expect(result).toMatchObject({ ok: true, includeArchived: true });
  expect(result.sessions[0]).toMatchObject({ archivedAt: null, archivedBy: null });
  expect(result.blocks[0]).toMatchObject({ archivedAt: null, archivedBy: null });
  expect(harness.calls).toHaveLength(2);
  expect(harness.calls.every((call) => call.options.method === "GET")).toBe(true);
  expect(harness.calls[0].url).not.toContain("archived_at=is.null");
  expect(harness.calls[1].url).not.toContain("archived_at=is.null");
  expect(harness.calls[0].url).toContain("created_by%2Cupdated_by%2Ccreated_at%2Cupdated_at%2Carchived_at");
});

test("Session Planner shadow adapter rebuilds the unchanged legacy state shape", async () => {
  const harness = createReadHarness();
  const result = await database.readSessionPlannerLegacyState(
    { organizationId, teamId },
    { ...harness.options, selectedDate: "2026-07-22" }
  );

  expect(result.ok).toBe(true);
  expect(result.state).toEqual({
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
  });
});

test("Session Planner database adapter rejects rows outside the requested tenant", async () => {
  const harness = createReadHarness();
  const originalFetch = harness.options.fetchImpl;
  harness.options.fetchImpl = async (url, options) => {
    const response = await originalFetch(url, options);
    if (!String(url).includes("/session_planner_sessions?")) return response;
    const rows = await response.json();
    rows[0].team_id = "33333333-3333-4333-8333-333333333333";
    return jsonResponse(rows);
  };

  const result = await database.readSessionPlannerDomainSnapshot(
    { organizationId, teamId },
    harness.options
  );

  expect(result).toMatchObject({
    ok: false,
    status: 409,
    code: "session_planner_scope_mismatch",
  });
  expect(harness.calls).toHaveLength(1);
});

test("Session Planner database adapter rejects non-positive record revisions", async () => {
  const harness = createReadHarness();
  const originalFetch = harness.options.fetchImpl;
  harness.options.fetchImpl = async (url, options) => {
    const response = await originalFetch(url, options);
    if (!String(url).includes("/session_planner_sessions?")) return response;
    const rows = await response.json();
    rows[0].row_version = 0;
    return jsonResponse(rows);
  };

  const result = await database.readSessionPlannerDomainSnapshot(
    { organizationId, teamId },
    harness.options
  );

  expect(result).toMatchObject({
    ok: false,
    status: 409,
    code: "session_planner_session_version_invalid",
  });
});

test("Session Planner database adapter rejects corrupted record hashes", async () => {
  const harness = createReadHarness();
  const originalFetch = harness.options.fetchImpl;
  harness.options.fetchImpl = async (url, options) => {
    const response = await originalFetch(url, options);
    if (!String(url).includes("/session_planner_blocks?")) return response;
    const rows = await response.json();
    rows[0].payload_hash = "f".repeat(64);
    return jsonResponse(rows);
  };

  const result = await database.readSessionPlannerDomainSnapshot(
    { organizationId, teamId },
    harness.options
  );

  expect(result).toMatchObject({
    ok: false,
    status: 409,
    code: "session_planner_block_hash_mismatch",
  });
});

test("Session Planner database foundation exposes no write path", () => {
  expect(database.writeSessionPlannerDomainSnapshot).toBeUndefined();
  expect(database.upsertSessionPlannerSession).toBeUndefined();
  expect(database.deleteSessionPlannerSession).toBeUndefined();
});
