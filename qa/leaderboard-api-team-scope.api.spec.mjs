import { expect, test } from "@playwright/test";
import {
  createLeaderboardApiService,
  resolveLeaderboardTeamIdFromIdentity,
} from "../src/modules/leaderboard/services/leaderboard-api-service.mjs";

const primaryTeamId = "11111111-1111-4111-8111-111111111111";
const secondaryTeamId = "22222222-2222-4222-8222-222222222222";

function identityPayload(overrides = {}) {
  return {
    ok: true,
    actor: { profile: { primaryTeamId } },
    scope: {
      primary: { teamId: secondaryTeamId },
      memberships: [
        { scope: "team", teamId: primaryTeamId, status: "active" },
        { scope: "team", teamId: secondaryTeamId, status: "active" },
      ],
      teams: [
        { id: secondaryTeamId, status: "active", clubId: "club-b", organizationId: "org-a" },
        { id: primaryTeamId, status: "active", clubId: "club-a", organizationId: "org-a" },
      ],
    },
    ...overrides,
  };
}

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

test("platform identity selects the covered profile primary team", () => {
  expect(resolveLeaderboardTeamIdFromIdentity(identityPayload())).toBe(primaryTeamId);
});

test("platform identity falls back deterministically across covered teams", () => {
  const identity = identityPayload({
    actor: { profile: { primaryTeamId: "" } },
    scope: {
      primary: null,
      memberships: [{ scope: "organization", organizationId: "org-a", status: "active" }],
      teams: [
        { id: secondaryTeamId, status: "active", clubId: "club-b", organizationId: "org-a" },
        { id: primaryTeamId, status: "active", clubId: "club-a", organizationId: "org-a" },
      ],
    },
  });
  expect(resolveLeaderboardTeamIdFromIdentity(identity)).toBe(primaryTeamId);
});

test("API service resolves a server team UUID before loading Leaderboard", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (url === "/api/platform-identity") return response(identityPayload());
    return response({ ok: true, schema: "footballscience-leaderboard-v1", month: "2026-08" });
  };
  const api = createLeaderboardApiService({
    teamId: "team-ncc-first",
    currentUser: { teamId: "team-ncc-first" },
    getAuthToken: async () => "scope-token",
    fetchImpl,
  });

  await api.loadMonth("2026-08");

  expect(calls.map((call) => call.url)).toEqual([
    "/api/platform-identity",
    `/api/leaderboard?month=2026-08&teamId=${primaryTeamId}`,
  ]);
  expect(calls.every((call) => call.options.headers.Authorization === "Bearer scope-token")).toBe(true);
});
