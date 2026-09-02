import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const permissionMatrix = require("../src/core/permission-matrix.cjs");
const platformSecurity = require("../api/_lib/platform-security.js");
const contract = require("../api/_lib/leaderboard-contract.js");
const database = require("../api/_lib/leaderboard-database.js");
const scope = require("../api/_lib/leaderboard-scope.js");
const service = require("../api/_lib/leaderboard-service.js");
const { createLeaderboardHandler } = require("../api/leaderboard.js");

const actorId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const clubId = "33333333-3333-4333-8333-333333333333";
const teamId = "44444444-4444-4444-8444-444444444444";
const teamBId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const forbiddenTeamId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const squadOrganizationId = "55555555-5555-4555-8555-555555555555";
const squadTeamId = "66666666-6666-4666-8666-666666666666";
const playerId = "77777777-7777-4777-8777-777777777777";
const rosterId = "88888888-8888-4888-8888-888888888888";

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function actorScope(overrides = {}) {
  return {
    ok: true,
    actor: {
      id: actorId,
      role: "admin",
      bootstrapRole: null,
      status: "active",
      profile: { primaryTeamId: teamId },
      ...overrides.actor,
    },
    scope: {
      primary: null,
      teams: [{ id: teamId, organizationId, clubId, status: "active", name: "First Team" }],
      memberships: [{
        id: "99999999-9999-4999-8999-999999999999",
        organizationId,
        clubId,
        teamId,
        scope: "team",
        role: "coach",
        status: "active",
      }],
      ...overrides.scope,
    },
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

function createApiResponse() {
  return {
    headers: {},
    statusCode: 0,
    body: "",
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    end(value = "") {
      this.body = String(value || "");
    },
  };
}

function sendApiJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

test("Leaderboard is registered as a guarded team route", () => {
  expect(permissionMatrix.apiRouteSecurity["/api/leaderboard"]).toMatchObject({
    moduleId: "leaderboard",
    enforcePermission: true,
    actions: { GET: "read", POST: "write" },
  });
  expect(permissionMatrix.hasModulePermission({ role: "guest" }, "leaderboard", "read")).toBe(false);
  expect(permissionMatrix.hasModulePermission({ role: "medical" }, "leaderboard", "read")).toBe(true);
  expect(permissionMatrix.hasModulePermission({ role: "coach" }, "leaderboard", "write")).toBe(true);
  expect(permissionMatrix.hasModulePermission({ role: "analyst" }, "leaderboard", "write")).toBe(false);

  const route = readProjectFile("api/leaderboard.js");
  expect(route).toContain("resolvePlatformActorScope");
  expect(route).toContain("resolveLeaderboardActorContext");
  expect(route).toContain("guardApiRequest");
  expect(route).not.toContain("actor.teamId");
});

test("Leaderboard rate limiting stops body parsing and Platform scope reads", async () => {
  platformSecurity.rateLimitBuckets.clear();
  platformSecurity.rateLimitBuckets.set(
    `/api/leaderboard:GET:read:actor:${actorId}`,
    { startedAt: Date.now(), count: 90 }
  );
  const calls = { parse: 0, scope: 0, context: 0, handle: 0 };
  const handler = createLeaderboardHandler({
    getCurrentActor: async () => ({ id: actorId, role: "admin" }),
    sendCorsHeaders: () => {},
    sendJson: sendApiJson,
    prepareLeaderboardRequest: async () => {
      calls.parse += 1;
      return { ok: true, request: { method: "GET", month: "2026-08", teamId } };
    },
    resolvePlatformActorScope: async () => {
      calls.scope += 1;
      return actorScope();
    },
    resolveLeaderboardActorContext: () => {
      calls.context += 1;
      return { ok: true, actor: { id: actorId, role: "admin" }, tenant: { teamId } };
    },
    handleLeaderboardRequest: async () => {
      calls.handle += 1;
    },
  });
  const response = createApiResponse();

  await handler({
    method: "GET",
    url: `/api/leaderboard?month=2026-08&teamId=${teamId}`,
    headers: { authorization: "Bearer rate-limited" },
  }, response);

  expect(response.statusCode).toBe(429);
  expect(calls).toEqual({ parse: 0, scope: 0, context: 0, handle: 0 });
  expect(response.headers["retry-after"]).toBeTruthy();
});

test("Leaderboard fresh-scope permission is enforced without double rate counting", async () => {
  platformSecurity.rateLimitBuckets.clear();
  const calls = { parse: 0, scope: 0, context: 0, handle: 0 };
  const handler = createLeaderboardHandler({
    getCurrentActor: async () => ({ id: actorId, role: "admin" }),
    sendCorsHeaders: () => {},
    sendJson: sendApiJson,
    prepareLeaderboardRequest: async () => {
      calls.parse += 1;
      return { ok: true, request: { method: "POST", teamId } };
    },
    resolvePlatformActorScope: async () => {
      calls.scope += 1;
      return actorScope();
    },
    resolveLeaderboardActorContext: () => {
      calls.context += 1;
      return { ok: true, actor: { id: actorId, role: "analyst" }, tenant: { teamId } };
    },
    handleLeaderboardRequest: async () => {
      calls.handle += 1;
    },
  });
  const response = createApiResponse();

  await handler({
    method: "POST",
    url: "/api/leaderboard",
    headers: { authorization: "Bearer fresh-scope" },
  }, response);

  expect(response.statusCode).toBe(403);
  expect(JSON.parse(response.body).reason).toContain("permission");
  expect(calls).toEqual({ parse: 1, scope: 1, context: 1, handle: 0 });
  expect(platformSecurity.rateLimitBuckets.get(
    `/api/leaderboard:POST:write:actor:${actorId}`
  )?.count).toBe(1);
});

test("Leaderboard permission phase rejects a module retarget without route work or a second count", async () => {
  platformSecurity.rateLimitBuckets.clear();
  const calls = { handle: 0 };
  const handler = createLeaderboardHandler({
    getCurrentActor: async () => ({ id: actorId, role: "admin" }),
    sendCorsHeaders: () => {},
    sendJson: sendApiJson,
    prepareLeaderboardRequest: async () => ({ ok: true, request: { method: "GET", month: "2026-08", teamId } }),
    resolvePlatformActorScope: async () => actorScope(),
    resolveLeaderboardActorContext: () => ({
      ok: true,
      actor: { id: actorId, role: "admin" },
      tenant: { teamId },
    }),
    enforceApiPermission: (request, response, options) => platformSecurity.enforceApiPermission(
      request,
      response,
      { ...options, moduleId: "medical-team" }
    ),
    handleLeaderboardRequest: async () => {
      calls.handle += 1;
    },
  });
  const response = createApiResponse();

  await handler({
    method: "GET",
    url: "/api/leaderboard?month=2026-08",
    headers: { authorization: "Bearer retarget-attempt" },
  }, response);

  expect(response.statusCode).toBe(500);
  expect(JSON.parse(response.body).reason).toBe("API security preflight failed.");
  expect(calls.handle).toBe(0);
  expect(platformSecurity.rateLimitBuckets.get(
    `/api/leaderboard:GET:read:actor:${actorId}`
  )?.count).toBe(1);
});

test("award and reverse commands reject unsafe or ambiguous input", () => {
  const valid = contract.normalizeLeaderboardCommand({
    action: "award",
    occurredOn: "2026-08-24",
    title: "Finishing winners",
    note: "Small-sided game",
    idempotencyKey: "training:2026-08-24:1",
    awards: [{ playerId: "legacy-player-1", points: 3, placement: 1 }],
  });
  expect(valid.ok).toBe(true);
  expect(valid.command.month).toBe("2026-08");
  expect(valid.command.teamId).toBe("");

  const teamScoped = contract.normalizeLeaderboardCommand({ ...valid.command, teamId: teamBId });
  expect(teamScoped).toMatchObject({ ok: true, command: { teamId: teamBId } });
  expect(contract.normalizeLeaderboardCommand({ ...valid.command, teamId: "Team B" })).toMatchObject({ ok: false, status: 400 });

  expect(contract.normalizeLeaderboardCommand({
    ...valid.command,
    action: "award",
    idempotencyKey: "training:2026-08-24:2",
    awards: [
      { playerId: "legacy-player-1", points: 3 },
      { playerId: "legacy-player-1", points: 2 },
    ],
  }).ok).toBe(false);
  expect(contract.normalizeLeaderboardCommand({
    action: "award",
    occurredOn: "2026-02-30",
    title: "Invalid date",
    idempotencyKey: "training:invalid:1",
    awards: [{ playerId: "p1", points: 1 }],
  }).ok).toBe(false);
  expect(contract.normalizeLeaderboardCommand({
    action: "award",
    occurredOn: "2026-08-24-extra",
    title: "Must not truncate exact dates",
    idempotencyKey: "training:invalid:2",
    awards: [{ playerId: "p1", points: 1 }],
  }).ok).toBe(false);
  expect(contract.normalizeLeaderboardCommand({
    action: "award",
    occurredOn: "2026-08-24",
    title: "Must not truncate keys",
    idempotencyKey: `a${"b".repeat(160)}`,
    awards: [{ playerId: "p1", points: 1 }],
  }).ok).toBe(false);
  expect(contract.normalizeLeaderboardCommand({
    action: "reverse-event",
    eventId: "not-a-uuid",
    reason: "Correction",
    idempotencyKey: "reverse:invalid:1",
  }).ok).toBe(false);
});

test("idempotency hash is stable across award order and changes with points", () => {
  const command = { occurredOn: "2026-08-24", title: "Winners", note: "" };
  const first = [
    { squad_player_id: playerId, squad_roster_membership_id: rosterId, player_source_key: "b", points: 2 },
    { squad_player_id: teamId, squad_roster_membership_id: clubId, player_source_key: "a", points: 3 },
  ];
  expect(contract.canonicalAwardHash(command, first)).toBe(contract.canonicalAwardHash(command, [...first].reverse()));
  expect(contract.canonicalAwardHash(command, first)).not.toBe(
    contract.canonicalAwardHash(command, [{ ...first[0], points: 4 }, first[1]])
  );
});

test("reversal idempotency binds the key replay to the normalized event and reason", () => {
  const first = contract.normalizeLeaderboardCommand({
    action: "reverse-event",
    eventId: playerId,
    reason: "  Incorrect   placement  ",
    idempotencyKey: "reverse:stable:1",
  });
  const same = contract.normalizeLeaderboardCommand({
    action: "reverse-event",
    eventId: playerId,
    reason: "Incorrect placement",
    idempotencyKey: "reverse:stable:1",
  });
  const changed = contract.normalizeLeaderboardCommand({
    action: "reverse-event",
    eventId: playerId,
    reason: "Wrong training date",
    idempotencyKey: "reverse:stable:1",
  });
  expect(contract.canonicalReverseHash(first.command)).toBe(contract.canonicalReverseHash(same.command));
  expect(contract.canonicalReverseHash(first.command)).not.toBe(contract.canonicalReverseHash(changed.command));
});

test("request parsing accepts only an explicit stable Platform team id", async () => {
  expect(await service.prepareLeaderboardRequest({
    method: "GET",
    url: `/api/leaderboard?month=2026-08&teamId=${teamBId}`,
  })).toMatchObject({ ok: true, request: { method: "GET", month: "2026-08", teamId: teamBId } });
  expect(await service.prepareLeaderboardRequest({
    method: "GET",
    url: "/api/leaderboard?month=2026-08&teamId=Team%20B",
  })).toMatchObject({ ok: false, status: 400 });
});

test("fresh membership role and team scope override any apparent actor role", () => {
  const resolved = scope.resolveLeaderboardActorContext(actorScope({ actor: { bootstrapRole: "admin" } }));
  expect(resolved).toMatchObject({
    ok: true,
    actor: { id: actorId, role: "coach" },
    tenant: { organizationId, clubId, teamId, timezone: "UTC" },
  });
  expect(contract.LEADERBOARD_TIMEZONE).toBe("UTC");

  const noMembership = scope.resolveLeaderboardActorContext(actorScope({ scope: { memberships: [] } }));
  expect(noMembership.ok).toBe(false);
  expect(noMembership.status).toBe(409);

  const ambiguous = actorScope({
    actor: { profile: null },
    scope: {
      teams: [
        { id: teamId, organizationId, clubId, status: "active" },
        { id: squadTeamId, organizationId, clubId, status: "active" },
      ],
      memberships: [
        { organizationId, clubId, teamId, scope: "team", role: "coach", status: "active" },
        { organizationId, clubId, teamId: squadTeamId, scope: "team", role: "coach", status: "active" },
      ],
    },
  });
  expect(scope.resolveLeaderboardActorContext(ambiguous)).toMatchObject({ ok: false, status: 409 });

  const resolverSource = readProjectFile("api/_lib/leaderboard-scope.js");
  expect(resolverSource).not.toContain("user_metadata");
  expect(resolved.actor.role).toBe("coach");
});

test("explicit active Team B overrides primary Team A and forbidden teams fail closed", () => {
  const multiTeam = actorScope({
    scope: {
      teams: [
        { id: teamId, organizationId, clubId, status: "active", name: "Team A" },
        { id: teamBId, organizationId, clubId, status: "active", name: "Team B" },
        { id: forbiddenTeamId, organizationId, clubId, status: "active", name: "Team C" },
      ],
      memberships: [
        { organizationId, clubId, teamId, scope: "team", role: "coach", status: "active" },
        { organizationId, clubId, teamId: teamBId, scope: "team", role: "coach", status: "active" },
      ],
    },
  });
  expect(scope.resolveLeaderboardActorContext(multiTeam, teamBId)).toMatchObject({
    ok: true,
    actor: { role: "coach" },
    tenant: { teamId: teamBId },
  });
  expect(scope.resolveLeaderboardActorContext(multiTeam, forbiddenTeamId)).toMatchObject({ ok: false, status: 403 });
  expect(scope.resolveLeaderboardActorContext(multiTeam)).toMatchObject({ ok: false, status: 409 });
});

test("legacy player ids map only through one active server-side roster player", async () => {
  const seenUrls = [];
  const fetchImpl = async (url) => {
    seenUrls.push(String(url));
    const table = new URL(url).pathname.split("/").pop();
    if (table === "squad_roster_memberships") {
      return jsonResponse([{ id: rosterId, organization_id: squadOrganizationId, team_id: squadTeamId, player_id: playerId, status: "active" }]);
    }
    if (table === "squad_players") {
      return jsonResponse([{ id: playerId, organization_id: squadOrganizationId, display_name: "Ada Forward", status: "active", metadata: { legacyId: "legacy-player-1" } }]);
    }
    return jsonResponse([]);
  };
  const options = { config: { url: "https://project.supabase.co", serviceRoleKey: "service-key" }, fetchImpl };
  const result = await database.resolveAwardPlayers(
    { id: squadTeamId, organizationId: squadOrganizationId },
    [{ playerId: "legacy-player-1", points: 5, placement: 1 }],
    options
  );
  expect(result).toMatchObject({
    ok: true,
    awards: [{
      squad_player_id: playerId,
      squad_roster_membership_id: rosterId,
      player_source_key: "legacy-player-1",
      display_name_snapshot: "Ada Forward",
      points: 5,
    }],
  });
  const rosterUrl = new URL(seenUrls.find((url) => url.includes("/squad_roster_memberships?")));
  expect(rosterUrl.searchParams.get("organization_id")).toBe(`eq.${squadOrganizationId}`);
  expect(rosterUrl.searchParams.get("team_id")).toBe(`eq.${squadTeamId}`);
  expect(rosterUrl.searchParams.get("status")).toBe("eq.active");
  expect(rosterUrl.searchParams.get("deleted_at")).toBe("is.null");

  const missing = await database.resolveAwardPlayers(
    { id: squadTeamId, organizationId: squadOrganizationId },
    [{ playerId: "unmapped-player", points: 1 }],
    options
  );
  expect(missing).toMatchObject({ ok: false, status: 409 });
});

test("Platform-to-Squad team mapping is server-scoped and ambiguous links fail closed", async () => {
  const seenUrls = [];
  const linkedSquadTeamId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const fetchImpl = async (url) => {
    seenUrls.push(String(url));
    const table = new URL(url).pathname.split("/").pop();
    if (table === "platform_tenant_links") {
      return jsonResponse([{ module_id: "squad", module_table: "squad_teams", module_record_id: linkedSquadTeamId, organization_id: organizationId, team_id: teamId, status: "active" }]);
    }
    if (table === "squad_teams") {
      return jsonResponse([{ id: linkedSquadTeamId, organization_id: squadOrganizationId, name: "First Team", status: "active" }]);
    }
    return jsonResponse([]);
  };
  const options = { config: { url: "https://project.supabase.co", serviceRoleKey: "service-key" }, fetchImpl };
  const resolved = await database.resolveSquadTeam({ organizationId, teamId }, options);
  expect(resolved).toMatchObject({ ok: true, squadTeam: { id: linkedSquadTeamId, organizationId: squadOrganizationId } });
  const linkUrl = new URL(seenUrls.find((url) => url.includes("/platform_tenant_links?")));
  expect(linkUrl.searchParams.get("organization_id")).toBe(`eq.${organizationId}`);
  expect(linkUrl.searchParams.get("team_id")).toBe(`eq.${teamId}`);

  const ambiguous = await database.resolveSquadTeam({ organizationId, teamId }, {
    ...options,
    fetchImpl: async (url) => new URL(url).pathname.endsWith("platform_tenant_links")
      ? jsonResponse([
          { module_id: "squad", module_record_id: linkedSquadTeamId },
          { module_id: "player-profiles", module_record_id: squadTeamId },
        ])
      : jsonResponse([]),
  });
  expect(ambiguous).toMatchObject({ ok: false, status: 409 });

  const invalidLink = await database.resolveSquadTeam({ organizationId, teamId }, {
    ...options,
    fetchImpl: async (url) => new URL(url).pathname.endsWith("platform_tenant_links")
      ? jsonResponse([{ module_id: "unknown", module_record_id: linkedSquadTeamId }])
      : jsonResponse([]),
  });
  expect(invalidLink).toMatchObject({ ok: false, status: 409 });
});

test("different client ids cannot award the same mapped player twice", async () => {
  const options = {
    config: { url: "https://project.supabase.co", serviceRoleKey: "service-key" },
    fetchImpl: async (url) => {
      const table = new URL(url).pathname.split("/").pop();
      if (table === "squad_roster_memberships") {
        return jsonResponse([{ id: rosterId, player_id: playerId }]);
      }
      if (table === "squad_players") {
        return jsonResponse([{ id: playerId, display_name: "Ada Forward", metadata: { legacyId: "legacy-player-1" } }]);
      }
      return jsonResponse([]);
    },
  };
  const result = await database.resolveAwardPlayers(
    { id: squadTeamId, organizationId: squadOrganizationId },
    [{ playerId, points: 3 }, { playerId: "legacy-player-1", points: 2 }],
    options
  );
  expect(result).toMatchObject({ ok: false, status: 409 });
});

test("award RPC ignores ambient tenant timezone and sends the shared UTC contract", async () => {
  let rpcBody = null;
  const command = contract.normalizeLeaderboardCommand({
    action: "award",
    occurredOn: "2026-08-31",
    title: "Month boundary winners",
    idempotencyKey: "award:utc-boundary:1",
    awards: [{ playerId: "legacy-player-1", points: 3, placement: 1 }],
  }).command;
  const result = await database.awardPoints({
    actor: { id: actorId, role: "coach" },
    tenant: { organizationId, clubId, teamId, timezone: "Europe/Stockholm" },
  }, command, {
    config: { url: "https://project.supabase.co", serviceRoleKey: "service-key" },
    fetchImpl: async (url, options = {}) => {
      const table = new URL(url).pathname.split("/").pop();
      if (table === "platform_tenant_links") {
        return jsonResponse([{ module_id: "squad", module_table: "squad_teams", module_record_id: squadTeamId, organization_id: organizationId, team_id: teamId, status: "active" }]);
      }
      if (table === "squad_teams") return jsonResponse([{ id: squadTeamId, organization_id: squadOrganizationId, club_id: clubId, name: "First Team", status: "active" }]);
      if (table === "squad_roster_memberships") {
        return jsonResponse([{ id: rosterId, organization_id: squadOrganizationId, team_id: squadTeamId, player_id: playerId, status: "active" }]);
      }
      if (table === "squad_players") {
        return jsonResponse([{ id: playerId, organization_id: squadOrganizationId, display_name: "Ada Forward", status: "active", metadata: { legacyId: "legacy-player-1" } }]);
      }
      expect(table).toBe("leaderboard_award_batch");
      rpcBody = JSON.parse(options.body);
      return jsonResponse({ eventId: playerId, month: "2026-08", replayed: false });
    },
  });

  expect(result.ok).toBe(true);
  expect(rpcBody.p_timezone).toBe("UTC");
  expect(rpcBody.p_month_start).toBe("2026-08-01");
  expect(rpcBody.p_occurred_on).toBe("2026-08-31");
});

test("monthly response contract keeps the required stable shape", () => {
  const response = {
    headers: {},
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    end(value) { this.body = String(value); },
  };
  service.sendSnapshot(response, "2026-08", {
    competition: null,
    summary: { participantCount: 0, totalPoints: 0, eventCount: 0 },
    roster: [],
    standings: [],
    events: [],
  });
  expect(JSON.parse(response.body)).toEqual({
    ok: true,
    schema: "footballscience-leaderboard-v1",
    month: "2026-08",
    competition: null,
    summary: { participantCount: 0, totalPoints: 0, eventCount: 0 },
    roster: [],
    standings: [],
    events: [],
  });
});

test("monthly read keeps event award history and rechecks actor tenant scope in SQL", async () => {
  let rpcBody = null;
  const seenPaths = [];
  const seenUrls = [];
  const event = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    occurredOn: "2026-08-24",
    title: "Finishing winners",
    createdByName: "Coach Ada",
    awards: [{ playerId: "legacy-player-1", playerName: "Ada Forward", points: 5, placement: 1 }],
  };
  const result = await database.readMonthSnapshot({
    actor: { id: actorId, role: "coach" },
    tenant: { organizationId, clubId, teamId: teamBId },
  }, "2026-08", {
    config: { url: "https://project.supabase.co", serviceRoleKey: "service-key" },
    fetchImpl: async (url, options) => {
      const requestUrl = new URL(url);
      seenPaths.push(requestUrl.pathname);
      seenUrls.push(String(url));
      const table = requestUrl.pathname.split("/").pop();
      if (table === "platform_tenant_links") {
        return jsonResponse([{ module_id: "squad", module_table: "squad_teams", module_record_id: squadTeamId, organization_id: organizationId, team_id: teamBId, status: "active" }]);
      }
      if (table === "squad_teams") return jsonResponse([{ id: squadTeamId, organization_id: squadOrganizationId, name: "Team B", status: "active" }]);
      if (table === "squad_roster_memberships") {
        return jsonResponse([{ id: rosterId, organization_id: squadOrganizationId, team_id: squadTeamId, player_id: playerId, shirt_number: "9", position_label: "Forward", status: "active" }]);
      }
      if (table === "squad_players") {
        return jsonResponse([
          { id: playerId, organization_id: squadOrganizationId, display_name: "Team B Player", status: "active", metadata: { legacyId: "legacy-player-1" } },
          { id: teamId, organization_id: squadOrganizationId, display_name: "Team A Player", status: "active", metadata: { legacyId: "team-a-player" } },
        ]);
      }
      expect(requestUrl.pathname).toBe("/rest/v1/rpc/leaderboard_month_snapshot");
      rpcBody = JSON.parse(options.body);
      return jsonResponse({ competition: null, summary: {}, standings: [], events: [event] });
    },
  });

  expect(rpcBody).toEqual({
    p_actor_id: actorId,
    p_organization_id: organizationId,
    p_team_id: teamBId,
    p_month_start: "2026-08-01",
  });
  expect(result.snapshot.events).toEqual([event]);
  expect(result.snapshot.roster).toEqual([{
    playerId: "legacy-player-1",
    displayName: "Team B Player",
    number: "9",
    position: "Forward",
    photoUrl: "",
    availabilityStatus: "unknown",
    rosterType: "squad",
    countsInSquad: true,
    updatedAt: "",
    availabilityByDate: {},
  }]);
  expect(seenPaths).toContain("/rest/v1/rpc/leaderboard_month_snapshot");
  const linkUrl = new URL(seenUrls.find((url) => url.includes("/platform_tenant_links?")));
  const rosterUrl = new URL(seenUrls.find((url) => url.includes("/squad_roster_memberships?")));
  expect(linkUrl.searchParams.get("team_id")).toBe(`eq.${teamBId}`);
  expect(rosterUrl.searchParams.get("team_id")).toBe(`eq.${squadTeamId}`);
});

test("Team B reversal write carries the freshly resolved tenant and request hash to SQL", async () => {
  let rpcBody = null;
  const command = {
    action: "reverse-event",
    eventId: playerId,
    reason: "Incorrect placement",
    idempotencyKey: "reverse:team-b:1",
  };
  const result = await database.reverseEvent({
    actor: { id: actorId, role: "coach" },
    tenant: { organizationId, clubId, teamId: teamBId },
  }, command, {
    config: { url: "https://project.supabase.co", serviceRoleKey: "service-key" },
    fetchImpl: async (url, options) => {
      expect(new URL(url).pathname).toBe("/rest/v1/rpc/leaderboard_reverse_event");
      rpcBody = JSON.parse(options.body);
      return jsonResponse({ eventId: playerId, month: "2026-08", replayed: false });
    },
  });
  expect(result.ok).toBe(true);
  expect(rpcBody).toEqual({
    p_organization_id: organizationId,
    p_team_id: teamBId,
    p_event_id: playerId,
    p_reason: "Incorrect placement",
    p_idempotency_key: "reverse:team-b:1",
    p_request_hash: contract.canonicalReverseHash(command),
    p_actor_id: actorId,
  });
});

test("server workspace access defaults do not expose Leaderboard as a configurable workspace", () => {
  const appState = readProjectFile("api/app-state.js");
  expect(appState).not.toContain("leaderboard:");
});
