import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  APPLY_CONFIRMATION,
  buildTenantBootstrapBody,
  executePlatformIdentityBackfill,
  parseBackfillArgs,
} from "../scripts/platform-identity-backfill.mjs";
import { verifyPlatformIdentityBackfillEnvironment } from "../scripts/verify-platform-identity-backfill-env.mjs";

const actorId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

const testConfig = {
  url: "https://project.supabase.co",
  serviceRoleKey: "service-role-test-key",
};

const backfillWorkflow = readFileSync(
  new URL("../.github/workflows/platform-identity-backfill-dry-run.yml", import.meta.url),
  "utf8"
);

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

function createBackfillFetch(users, calls = []) {
  return async (url, request = {}) => {
    const requestUrl = new URL(String(url));
    const method = request.method || "GET";
    calls.push({ url: String(url), method, body: request.body ? JSON.parse(request.body) : null });

    if (requestUrl.pathname === "/auth/v1/admin/users") {
      return jsonResponse({ users });
    }

    if (requestUrl.pathname.startsWith("/auth/v1/admin/users/")) {
      const requestedUserId = decodeURIComponent(requestUrl.pathname.split("/").pop() || "");
      const user = users.find((entry) => entry.id === requestedUserId);
      return user ? jsonResponse(user) : jsonResponse({ message: "not found" }, 404);
    }

    if (method === "POST") {
      const tableName = requestUrl.pathname.split("/").pop();
      const idsByTable = {
        platform_organizations: "33333333-3333-4333-8333-333333333333",
        platform_clubs: "44444444-4444-4444-8444-444444444444",
        platform_teams: "55555555-5555-4555-8555-555555555555",
        platform_memberships: "66666666-6666-4666-8666-666666666666",
        platform_tenant_links: "77777777-7777-4777-8777-777777777777",
      };
      return jsonResponse([{ id: idsByTable[tableName], ...(request.body ? JSON.parse(request.body) : {}) }], 201);
    }

    return jsonResponse([]);
  };
}

test("platform identity backfill defaults to dry-run and needs explicit apply confirmation", async () => {
  const dryRunOptions = parseBackfillArgs(["--actor-id", actorId, "--organization-name", "Football Science"]);
  expect(dryRunOptions.apply).toBe(false);

  const rejectedApply = await executePlatformIdentityBackfill({
    ...dryRunOptions,
    apply: true,
    config: testConfig,
    fetchImpl: createBackfillFetch([]),
  });
  expect(rejectedApply.ok).toBe(false);
  expect(rejectedApply.reason).toContain(`--confirm=${APPLY_CONFIRMATION}`);
});

test("platform identity backfill parses reviewed plan guards", () => {
  const options = parseBackfillArgs([
    "--apply",
    `--confirm=${APPLY_CONFIRMATION}`,
    `--expected-plan-sha256=${"a".repeat(64)}`,
    "--expected-user-count=17",
    `--actor-id=${actorId}`,
  ]);

  expect(options.expectedPlanSha256).toBe("a".repeat(64));
  expect(options.expectedUserCount).toBe(17);
});

test("platform identity backfill GitHub Environment validation blocks staging-to-production drift", () => {
  const environment = {
    PLATFORM_BACKFILL_TARGET: "staging",
    SUPABASE_PROJECT_REF: "pokrksgempkuraueglpu",
    CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF: "bustidorxevacosqhkcz",
    SUPABASE_URL: "https://pokrksgempkuraueglpu.supabase.co",
    SUPABASE_SECRET_KEY: "secret-test-key",
    PLATFORM_BACKFILL_ACTOR_ID: actorId,
    PLATFORM_BACKFILL_ORGANIZATION_ID: "33333333-3333-4333-8333-333333333333",
    PLATFORM_BACKFILL_ORGANIZATION_NAME: "Football Science Staging",
    PLATFORM_BACKFILL_ORGANIZATION_SLUG: "football-science-staging",
    PLATFORM_BACKFILL_TEAM_ID: "55555555-5555-4555-8555-555555555555",
    PLATFORM_BACKFILL_TEAM_NAME: "Football Science",
    PLATFORM_BACKFILL_TEAM_SLUG: "football-science",
  };

  expect(verifyPlatformIdentityBackfillEnvironment(environment).ok).toBe(true);
  expect(
    verifyPlatformIdentityBackfillEnvironment({
      ...environment,
      SUPABASE_PROJECT_REF: environment.CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF,
      SUPABASE_URL: `https://${environment.CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
    }).failures
  ).toContain("Staging must not use the production Supabase project.");
  expect(verifyPlatformIdentityBackfillEnvironment({ ...environment, SUPABASE_SECRET_KEY: "" }).ok).toBe(false);
});

test("platform identity backfill workflow remains manual, isolated, and read-only", () => {
  expect(backfillWorkflow).toContain("workflow_dispatch:");
  expect(backfillWorkflow).toContain("environment: platform-${{ inputs.target }}");
  expect(backfillWorkflow).toContain("group: platform-identity-backfill-dry-run-${{ inputs.target }}");
  expect(backfillWorkflow).toContain("SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}");
  expect(backfillWorkflow).toContain("Generate PII-free read-only plan");
  expect(backfillWorkflow).not.toContain("--apply");
  expect(backfillWorkflow).not.toContain("BACKFILL_PLATFORM_IDENTITY");
});

test("platform identity backfill derives authorization role only from app_metadata", () => {
  const body = buildTenantBootstrapBody(
    {
      id: userId,
      email: "coach@example.com",
      app_metadata: { role: "scout", status: "active" },
      user_metadata: { role: "admin", firstName: "Alex", lastName: "Scout" },
    },
    {
      organization: { name: "Football Science", slug: "football-science" },
      team: { name: "First Team", slug: "first-team", gender: "women" },
    }
  );

  expect(body.user.firstName).toBe("Alex");
  expect(body.membership.role).toBe("scout");
  expect(body.membership.metadata.roleSource).toBe("app_metadata");
});

test("platform identity backfill gives platform admins organization scope and staff team scope", () => {
  const tenant = {
    organization: { name: "North Carolina Courage", slug: "north-carolina-courage" },
    club: { name: "North Carolina Courage", slug: "north-carolina-courage" },
    team: { name: "North Carolina Courage", slug: "north-carolina-courage", gender: "women" },
  };
  const adminBody = buildTenantBootstrapBody(
    { id: actorId, app_metadata: { role: "admin", status: "active" } },
    tenant
  );
  const coachBody = buildTenantBootstrapBody(
    { id: userId, app_metadata: { role: "coach", status: "active" } },
    tenant
  );

  expect(adminBody.membership).toMatchObject({ role: "admin", scope: "organization" });
  expect(coachBody.membership).toMatchObject({ role: "coach", scope: "team" });
  expect(adminBody.user.id).toBe(actorId);
  expect(coachBody.user.id).toBe(userId);
});

test("platform identity backfill dry-run plans tenants without writes", async () => {
  const calls = [];
  const result = await executePlatformIdentityBackfill({
    actorId,
    actorEmail: "admin@example.com",
    organization: { name: "Football Science", slug: "football-science" },
    team: { name: "First Team", slug: "first-team", gender: "women" },
    config: testConfig,
    fetchImpl: createBackfillFetch(
      [
        {
          id: userId,
          email: "coach@example.com",
          app_metadata: { role: "team-admin", status: "active" },
          user_metadata: { role: "admin", first_name: "Casey", last_name: "Coach" },
        },
      ],
      calls
    ),
  });

  expect(result.ok).toBe(true);
  expect(result.dryRun).toBe(true);
  expect(result.usersProcessed).toBe(1);
  expect(calls.every((call) => call.method === "GET")).toBe(true);
  expect(result.results[0].role).toBe("team-admin");
  expect(result.results[0].operations.map((entry) => entry.action)).toEqual(["planned", "planned", "planned", "planned"]);
  expect(result.plan.planSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(result.plan.usersPlanned).toBe(1);
  expect(JSON.stringify(result)).not.toContain("coach@example.com");
  expect(JSON.stringify(result)).not.toContain(userId);
});

test("platform identity backfill plan is deterministic across user order and changes with authorization scope", async () => {
  const users = [
    { id: userId, email: "coach@example.com", app_metadata: { role: "coach" } },
    { id: actorId, email: "admin@example.com", app_metadata: { role: "admin" } },
  ];
  const options = {
    actorId,
    organization: { name: "Football Science", slug: "football-science" },
    team: { name: "First Team", slug: "first-team" },
    config: testConfig,
  };
  const first = await executePlatformIdentityBackfill({ ...options, fetchImpl: createBackfillFetch(users) });
  const reversed = await executePlatformIdentityBackfill({ ...options, fetchImpl: createBackfillFetch([...users].reverse()) });
  const changedRole = await executePlatformIdentityBackfill({
    ...options,
    fetchImpl: createBackfillFetch([{ ...users[0], app_metadata: { role: "admin" } }, users[1]]),
  });

  expect(first.plan.planSha256).toBe(reversed.plan.planSha256);
  expect(changedRole.plan.planSha256).not.toBe(first.plan.planSha256);
  expect(first.plan.scopeCounts).toEqual({ organization: 1, team: 1 });
});

test("platform identity backfill rejects a stale plan before any write", async () => {
  const calls = [];
  const result = await executePlatformIdentityBackfill({
    apply: true,
    confirm: APPLY_CONFIRMATION,
    expectedPlanSha256: "f".repeat(64),
    expectedUserCount: 1,
    actorId,
    organization: { name: "Football Science", slug: "football-science" },
    userIds: [userId],
    config: testConfig,
    fetchImpl: createBackfillFetch(
      [{ id: userId, email: "coach@example.com", app_metadata: { role: "coach" } }],
      calls
    ),
  });

  expect(result.ok).toBe(false);
  expect(result.status).toBe(409);
  expect(result.reason).toContain("Apply guard mismatch");
  expect(calls.every((call) => call.method === "GET")).toBe(true);
});

test("platform identity backfill rejects a changed user count before any write", async () => {
  const users = [{ id: userId, email: "coach@example.com", app_metadata: { role: "coach" } }];
  const baseOptions = {
    actorId,
    organization: { name: "Football Science", slug: "football-science" },
    userIds: [userId],
    config: testConfig,
  };
  const dryRun = await executePlatformIdentityBackfill({ ...baseOptions, fetchImpl: createBackfillFetch(users) });
  const calls = [];
  const result = await executePlatformIdentityBackfill({
    ...baseOptions,
    apply: true,
    confirm: APPLY_CONFIRMATION,
    expectedPlanSha256: dryRun.plan.planSha256,
    expectedUserCount: dryRun.plan.usersPlanned + 1,
    fetchImpl: createBackfillFetch(users, calls),
  });

  expect(result.status).toBe(409);
  expect(calls.every((call) => call.method === "GET")).toBe(true);
});

test("platform identity backfill apply uses the reviewed plan and shared tenant bootstrap pipeline", async () => {
  const users = [
    {
      id: userId,
      email: "coach@example.com",
      app_metadata: { role: "coach", status: "active" },
      user_metadata: { role: "admin" },
    },
  ];
  const baseOptions = {
    actorId,
    organization: { name: "Football Science", slug: "football-science" },
    userIds: [userId],
    config: testConfig,
  };
  const dryRun = await executePlatformIdentityBackfill({
    ...baseOptions,
    fetchImpl: createBackfillFetch(users),
  });
  const calls = [];
  const result = await executePlatformIdentityBackfill({
    ...baseOptions,
    apply: true,
    confirm: APPLY_CONFIRMATION,
    expectedPlanSha256: dryRun.plan.planSha256,
    expectedUserCount: dryRun.plan.usersPlanned,
    fetchImpl: createBackfillFetch(users, calls),
  });

  expect(result.ok).toBe(true);
  expect(result.dryRun).toBe(false);
  expect(calls.some((call) => call.method === "POST" && call.url.endsWith("/rest/v1/platform_organizations"))).toBe(true);
  expect(calls.some((call) => call.method === "POST" && call.url.endsWith("/rest/v1/platform_user_profiles"))).toBe(true);
  expect(calls.some((call) => call.method === "POST" && call.url.endsWith("/rest/v1/platform_memberships"))).toBe(true);
  expect(calls.find((call) => call.method === "POST" && call.url.endsWith("/rest/v1/platform_memberships"))?.body.role).toBe("coach");
  expect(result.plan.planSha256).toBe(dryRun.plan.planSha256);
});
