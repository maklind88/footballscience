import { Readable } from "node:stream";
import { expect, test } from "@playwright/test";
import endpoint from "../api/performance-load-plan.js";
import sourceContracts from "../api/_lib/performance-load-sources.js";

const { createPerformanceLoadPlanHandler } = endpoint;
const { resolvePerformanceTeam, readPerformanceSources } = sourceContracts;
const actorId = "5fde923a-69d6-4806-ba5c-c6a47cef514f";
const teamId = "c42c5d9e-d78b-4267-9ad8-1663360a84fe";
const organizationId = "8065153f-58c1-4955-a0ee-361a4255431b";
const week = "2026-11-23";
const subjectKey = "player:squad-athlete";
const activityId = "central-training";
const saved = { kind: "plan", subjectKey, activityId, revision: 0, targets: { distance: 5200, sprint: 0 } };

function platformFixture(roles = ["performance"]) {
  return {
    ok: true,
    actor: { id: actorId, status: "active" },
    scope: {
      teams: [{ id: teamId, organizationId, status: "active" }],
      memberships: roles.map((role) => ({ status: "active", scope: "team", organizationId, teamId, role })),
    },
  };
}

async function send(handler, method, body, signedIn = true, requestedWeek = week) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = `/api/performance-load-plan?week=${requestedWeek}`;
  req.headers = signedIn ? { authorization: "Bearer example" } : {};
  const headers = {};
  const res = {
    setHeader(key, value) { headers[key.toLowerCase()] = value; },
    end(payload) { this.body = JSON.parse(payload); },
  };
  await handler(req, res);
  return { status: res.statusCode, body: res.body, headers };
}

function fixture({ roles, tenantMatch = true, conflict = false } = {}) {
  const calls = [];
  const handler = createPerformanceLoadPlanHandler({
    readActor: async (auth) => auth ? { id: actorId, role: "admin" } : null,
    readScope: async () => platformFixture(roles),
    resolveTeam: (platform, action) => resolvePerformanceTeam(platform, action, async (table, query) => {
      expect(table).toBe("platform_teams");
      expect(query.id).toBe(`in.(${teamId})`);
      expect(query["metadata->>legacyTeamId"]).toBe("eq.team-north-carolina-courage");
      expect(query["platform_organizations.metadata->>legacyOrganization"]).toBe("eq.football-science-live");
      return { ok: true, rows: tenantMatch ? [{ id: teamId, organization_id: organizationId }] : [] };
    }),
    readSources: async (start, end) => {
      calls.push({ sourceWeek: [start, end] });
      return { subjectKeys: new Set([subjectKey, "role:Midfielder", "team"]), activityIds: new Set([activityId]) };
    },
    rpc: async (operation, scope, fields) => {
      calls.push({ operation, scope, fields });
      if (conflict) return { ok: false, data: { code: "40001" } };
      return { ok: true, data: operation === "read" ? [{ ...saved, revision: 1 }] : null };
    },
  });
  return { handler, calls };
}

test("saved load plans use exact team membership and preserve zero values and revisions", async () => {
  const { handler, calls } = fixture({ roles: ["coach", "performance"] });
  const write = await send(handler, "POST", { week, records: [saved] });
  expect(write.status).toBe(200);
  expect(write.headers["cache-control"]).toBe("private, no-store");
  expect(write.body).toMatchObject({ canEdit: true, records: [{ ...saved, revision: 1 }] });
  expect(calls).toEqual([
    { sourceWeek: [week, "2026-11-30"] },
    { operation: "save", scope: { actor: { id: actorId, role: "performance" }, teamId, organizationId, canEdit: true },
      fields: { p_records: [{ kind: "plan", subject_key: subjectKey, activity_id: activityId, base_revision: 0,
        distance_m: 5200, hsr_m: undefined, sprint_m: 0 }] } },
  ]);
  const read = await send(handler, "GET");
  expect(read.body.records).toEqual(write.body.records);
  expect(calls.at(-1).fields).toEqual({ p_subject_keys: [subjectKey, "role:Midfielder", "team"], p_activity_ids: [activityId] });
});

test("unmapped teams and unauthorized roles cannot touch the legacy owner state", async () => {
  const foreign = fixture({ tenantMatch: false });
  expect((await send(foreign.handler, "GET")).status).toBe(403);
  expect(foreign.calls).toEqual([]);
  const coach = fixture({ roles: ["coach"] });
  expect((await send(coach.handler, "POST", { week, records: [saved] })).status).toBe(403);
  expect((await send(coach.handler, "GET", undefined, false)).status).toBe(401);
  expect(coach.calls).toEqual([]);
  const read = await send(coach.handler, "GET");
  expect(read.status).toBe(200);
  expect(read.body.canEdit).toBe(false);
});

test("invalid references and dates are rejected, and stale revisions return a recoverable conflict", async () => {
  const { handler, calls } = fixture({ conflict: true });
  expect((await send(handler, "GET", undefined, true, "2026-02-30")).status).toBe(400);
  expect((await send(handler, "POST", { week, records: [{ ...saved, subjectKey: "player:unknown" }] })).status).toBe(400);
  expect((await send(handler, "POST", { week, records: [{ ...saved, activityId: "not-scheduled" }] })).status).toBe(400);
  expect((await send(handler, "POST", { week, records: [{ ...saved, targets: { hsr: 50.5 } }] })).status).toBe(400);
  expect((await send(handler, "POST", { week, records: [saved, saved] })).status).toBe(400);
  expect(calls.every((call) => !call.operation)).toBe(true);
  expect((await send(handler, "POST", { week, records: [saved] })).status).toBe(409);
});

test("the owner projection uses saved identities and activities within the requested week", async () => {
  const players = [
    { id: "squad-athlete", roleGroup: "Midfielder" },
    { id: "removed" },
    { id: "archived", archivedAt: "2026-09-01" },
    { id: "ambiguous" }, { id: "ambiguous" },
  ];
  const events = [
    { id: activityId, date: week, type: "training" },
    { id: "fixture", date: "2026-11-29", type: "match" },
    { id: "meeting", date: week, type: "meeting" },
    { id: "outside", date: "2026-11-30", type: "training" },
  ];
  const snapshots = {
    "football-player-profiles-v1": { players, removedPlayerIds: ["removed"] },
    "football-schedule-v1": { events },
  };
  const sources = await readPerformanceSources(week, "2026-11-30", async (key) => {
    expect(Object.hasOwn(snapshots, key)).toBe(true);
    return { key, value: JSON.stringify(snapshots[key]) };
  });
  expect([...sources.subjectKeys]).toEqual(["team", subjectKey, "role:Midfielder"]);
  expect([...sources.activityIds]).toEqual([activityId, "fixture"]);
});
