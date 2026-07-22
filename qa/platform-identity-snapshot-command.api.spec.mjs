import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  SNAPSHOT_CONFIRMATION,
  executePlatformIdentitySnapshot,
  parseSnapshotArgs,
} from "../scripts/platform-identity-snapshot.mjs";

const actorId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const teamId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const fixedNow = () => new Date("2026-07-22T23:00:00.000Z");
const config = { url: "https://staging-project.supabase.co", serviceRoleKey: "secret-test-key" };
const readOnlyWorkflow = readFileSync(
  new URL("../.github/workflows/platform-identity-snapshot-read-only.yml", import.meta.url),
  "utf8"
);
const captureWorkflow = readFileSync(
  new URL("../.github/workflows/platform-identity-snapshot-capture-staging.yml", import.meta.url),
  "utf8"
);

const authUser = {
  id: userId,
  email: "private@example.com",
  app_metadata: { role: "coach", status: "active" },
  user_metadata: { display_name: "Private User" },
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function createCommandFetch() {
  const calls = [];
  let storedSnapshot = null;
  const fetchImpl = async (url, request = {}) => {
    const requestUrl = new URL(String(url));
    const method = request.method || "GET";
    calls.push({ url: String(url), method });

    if (requestUrl.pathname === "/auth/v1/admin/users") return jsonResponse({ users: [authUser] });
    if (requestUrl.pathname === `/auth/v1/admin/users/${userId}`) return jsonResponse(authUser);
    if (requestUrl.pathname.startsWith("/rest/v1/platform_organizations")) {
      return jsonResponse([{ id: organizationId, slug: "football-science", name: "Football Science", status: "active", row_version: 1, metadata: {} }]);
    }
    if (requestUrl.pathname.startsWith("/rest/v1/platform_teams")) {
      return jsonResponse([{ id: teamId, organization_id: organizationId, club_id: null, slug: "first-team", name: "First Team", status: "active", row_version: 1, metadata: {} }]);
    }
    if (requestUrl.pathname.startsWith("/rest/v1/platform_user_profiles")) return jsonResponse([]);
    if (requestUrl.pathname.startsWith("/rest/v1/platform_memberships")) return jsonResponse([]);
    if (requestUrl.pathname.startsWith("/rest/v1/platform_tenant_links")) return jsonResponse([]);
    if (requestUrl.pathname.endsWith("/storage/v1/bucket/footballscience-app-state")) {
      return jsonResponse({ id: "footballscience-app-state", public: false });
    }
    if (requestUrl.pathname.includes("/storage/v1/object/footballscience-app-state/") && method === "POST") {
      storedSnapshot = JSON.parse(request.body);
      return jsonResponse({ Key: requestUrl.pathname });
    }
    if (requestUrl.pathname.includes("/storage/v1/object/footballscience-app-state/") && method === "GET") {
      return jsonResponse(storedSnapshot);
    }
    return jsonResponse({ message: "not found" }, 404);
  };
  return { calls, fetchImpl };
}

function commandOptions(harness, overrides = {}) {
  return {
    capture: false,
    confirm: "",
    target: "staging",
    projectRef: "staging-project",
    canonicalProductionProjectRef: "production-project",
    expectedPlanSha256: "",
    expectedUserCount: null,
    config,
    fetchImpl: harness.fetchImpl,
    now: fixedNow,
    backfill: {
      actorId,
      organization: { id: organizationId, name: "Football Science", slug: "football-science" },
      team: { id: teamId, name: "First Team", slug: "first-team", gender: "women" },
      links: [],
      limit: 200,
      maxPages: 20,
    },
    ...overrides,
  };
}

test("Platform Identity snapshot command parses capture separately from backfill options", () => {
  const options = parseSnapshotArgs(
    ["--capture", `--confirm=${SNAPSHOT_CONFIRMATION}`, `--actor-id=${actorId}`, `--organization-id=${organizationId}`],
    {
      PLATFORM_BACKFILL_TARGET: "staging",
      SUPABASE_PROJECT_REF: "staging-project",
      CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF: "production-project",
    }
  );
  expect(options).toMatchObject({
    capture: true,
    confirm: SNAPSHOT_CONFIRMATION,
    target: "staging",
    projectRef: "staging-project",
    canonicalProductionProjectRef: "production-project",
  });
  expect(options.backfill).toMatchObject({ apply: false, actorId, organization: { id: organizationId } });
});

test("Platform Identity snapshot inspection workflow is staging-only and cannot capture", () => {
  expect(readOnlyWorkflow).toContain("workflow_dispatch:");
  expect(readOnlyWorkflow).toContain("environment: platform-staging");
  expect(readOnlyWorkflow).toContain("PLATFORM_BACKFILL_TARGET: staging");
  expect(readOnlyWorkflow).toContain("Build PII-free read-only snapshot summary");
  expect(readOnlyWorkflow).toContain("summary.dryRun !== true");
  expect(readOnlyWorkflow).toContain("summary.stored !== false");
  expect(readOnlyWorkflow).not.toContain("platform-production");
  expect(readOnlyWorkflow).not.toContain("--capture");
  expect(readOnlyWorkflow).not.toContain("--apply");
  expect(readOnlyWorkflow).not.toContain("CAPTURE_PLATFORM_IDENTITY_SNAPSHOT");
  expect(readOnlyWorkflow).not.toContain("actions/upload-artifact");
});

test("Platform Identity snapshot capture workflow is staging-only and pins the reviewed plan", () => {
  expect(captureWorkflow).toContain("workflow_dispatch:");
  expect(captureWorkflow).toContain("environment: platform-staging");
  expect(captureWorkflow).toContain("group: platform-identity-write-staging");
  expect(captureWorkflow).toContain("CAPTURE_PLATFORM_IDENTITY_SNAPSHOT");
  expect(captureWorkflow).toContain("--expected-plan-sha256");
  expect(captureWorkflow).toContain("--expected-user-count");
  expect(captureWorkflow).toContain("--capture");
  expect(captureWorkflow).toContain("storage.readAfterWriteVerified !== true");
  expect(captureWorkflow).toContain("storage.contentSha256 !== summary.contentSha256");
  expect(captureWorkflow).not.toContain("platform-production");
  expect(captureWorkflow).not.toContain("--apply");
  expect(captureWorkflow).not.toContain("actions/upload-artifact");
});

test("Platform Identity snapshot command blocks environment drift before network access", async () => {
  const harness = createCommandFetch();
  const result = await executePlatformIdentitySnapshot(
    commandOptions(harness, { projectRef: "production-project" })
  );
  expect(result.ok).toBe(false);
  expect(result.failures).toEqual(
    expect.arrayContaining([
      "Supabase URL and project ref do not match.",
      "Staging snapshot cannot target production Supabase.",
    ])
  );
  expect(harness.calls).toHaveLength(0);
});

test("Platform Identity snapshot command defaults to a PII-free read-only dry-run", async () => {
  const harness = createCommandFetch();
  const result = await executePlatformIdentitySnapshot(commandOptions(harness));

  expect(result).toMatchObject({ ok: true, dryRun: true, stored: false, userCount: 1, piiExposed: false });
  expect(harness.calls.every((call) => call.method === "GET")).toBe(true);
  expect(JSON.stringify(result)).not.toContain(userId);
  expect(JSON.stringify(result)).not.toContain("private@example.com");
});

test("Platform Identity snapshot capture requires the reviewed plan guards before storage writes", async () => {
  const dryHarness = createCommandFetch();
  const dryRun = await executePlatformIdentitySnapshot(commandOptions(dryHarness));
  const blockedHarness = createCommandFetch();
  const blocked = await executePlatformIdentitySnapshot(commandOptions(blockedHarness, { capture: true }));
  expect(blocked.ok).toBe(false);
  expect(blocked.failures).toContain(`Snapshot capture requires --confirm=${SNAPSHOT_CONFIRMATION}.`);
  expect(blockedHarness.calls.some((call) => call.method === "POST")).toBe(false);

  const captureHarness = createCommandFetch();
  const captured = await executePlatformIdentitySnapshot(
    commandOptions(captureHarness, {
      capture: true,
      confirm: SNAPSHOT_CONFIRMATION,
      expectedPlanSha256: dryRun.planSha256,
      expectedUserCount: dryRun.userCount,
    })
  );
  expect(captured).toMatchObject({ ok: true, dryRun: false, stored: true, piiExposed: false });
  expect(captured.storage).toMatchObject({ readAfterWriteVerified: true, contentSha256: captured.contentSha256 });
  expect(captureHarness.calls.filter((call) => call.method === "POST")).toHaveLength(1);
});
