import { expect, test } from "@playwright/test";
import {
  APPLY_CONFIRMATION,
  buildTenantBootstrapBody,
  executePlatformIdentityBackfill,
  parseBackfillArgs,
} from "../scripts/platform-identity-backfill.mjs";

const actorId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

const testConfig = {
  url: "https://project.supabase.co",
  serviceRoleKey: "service-role-test-key",
};

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
});

test("platform identity backfill apply uses the shared tenant bootstrap pipeline", async () => {
  const calls = [];
  const result = await executePlatformIdentityBackfill({
    apply: true,
    confirm: APPLY_CONFIRMATION,
    actorId,
    organization: { name: "Football Science", slug: "football-science" },
    userIds: [userId],
    config: testConfig,
    fetchImpl: createBackfillFetch(
      [
        {
          id: userId,
          email: "coach@example.com",
          app_metadata: { role: "coach", status: "active" },
          user_metadata: { role: "admin" },
        },
      ],
      calls
    ),
  });

  expect(result.ok).toBe(true);
  expect(result.dryRun).toBe(false);
  expect(calls.some((call) => call.method === "POST" && call.url.endsWith("/rest/v1/platform_organizations"))).toBe(true);
  expect(calls.some((call) => call.method === "POST" && call.url.endsWith("/rest/v1/platform_user_profiles"))).toBe(true);
  expect(calls.some((call) => call.method === "POST" && call.url.endsWith("/rest/v1/platform_memberships"))).toBe(true);
  expect(calls.find((call) => call.method === "POST" && call.url.endsWith("/rest/v1/platform_memberships"))?.body.role).toBe("coach");
});
