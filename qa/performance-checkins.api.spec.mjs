import { Readable } from "node:stream";
import { expect, test } from "@playwright/test";
import playerEndpoint from "../api/performance-rpe.js";
import staffContracts from "../api/_lib/performance-checkins.js";

const user = "5fde923a-69d6-4806-ba5c-c6a47cef514f";
const week = "2026-11-23";
const now = () => new Date("2026-11-25T23:00:00Z");
const session = { id: "pm-training", date: "2026-11-24", title: "Afternoon training", time: "15:00" };
const future = { id: "future", date: "2026-11-25", title: "Evening training", time: "20:00" };
const players = [{ id: "athlete-a", name: "Example A" }, { id: "athlete-b", name: "Example B" }];
const sources = { players, subjectKeys: new Set(players.map(({ id }) => `player:${id}`)),
  activities: [session, future], activityIds: new Set([session.id, future.id]) };
const validWellness = { date: session.date, score: 82, sleepDuration: "7-8", privateNotes: "exclude" };
const scope = { actor: { id: user, role: "performance" }, canEdit: true, organizationId: "org", teamId: "team" };

async function send(handler, method, body, token = "valid") {
  const req = Readable.from(body ? [JSON.stringify(body)] : []);
  req.method = method;
  req.url = `/api/performance-rpe?week=${week}&player=athlete-b`;
  req.headers = token ? { authorization: `Bearer ${token}` } : {};
  const headers = {};
  const res = {
    setHeader(key, value) { headers[key.toLowerCase()] = value; },
    end(payload) { this.body = JSON.parse(payload); },
  };
  await handler(req, res);
  return { status: res.statusCode, body: res.body, headers };
}

function playerFixture({ status = "saved", roster = sources, linked = true } = {}) {
  const calls = [];
  const handler = playerEndpoint.createRpeResponseHandler({
    readActor: async (auth) => auth ? {
      id: user, role: auth === "Bearer staff" ? "performance" : "guest", status: "active",
    } : null,
    readSources: async () => roster,
    now,
    rpc: async (name, fields) => {
      calls.push({ name, fields });
      if (name === "submit_performance_rpe") return status;
      return linked ? { playerId: players[0].id,
        rpe: [{ activityId: session.id, date: session.date, rating: null },
          { activityId: future.id, date: future.date }, { activityId: "removed", date: session.date }],
        wellness: [validWellness, { date: "2026-11-19", score: 70 }],
      } : null;
    },
  });
  return { handler, calls };
}

test("the player portal requires a linked sign-in and projects only its week and valid assigned activities", async () => {
  const { handler, calls } = playerFixture();
  expect((await send(handler, "GET", undefined, "")).status).toBe(401);
  expect((await send(handler, "GET", undefined, "staff")).status).toBe(403);
  expect(calls).toEqual([]);
  const player = await send(handler, "GET");
  expect(player.status).toBe(200);
  expect(player.headers["cache-control"]).toBe("private, no-store");
  expect(player.body).toEqual({ ok: true, week, rpe: [{
    activityId: session.id, date: session.date, title: session.title, rating: null,
  }], wellness: [{ date: session.date, score: 82, sleepDuration: "7-8" }] });
  expect(calls).toEqual([{ name: "read_performance_player_portal", fields: { p_user_id: user, p_week: week } }]);
  expect((await send(playerFixture({ linked: false }).handler, "GET")).status).toBe(403);
  expect((await send(playerFixture({ roster: { ...sources, subjectKeys: new Set() } }).handler, "GET")).status).toBe(403);
});

test("RPE accepts zero and uses only the server's player and activity binding", async () => {
  const { handler, calls } = playerFixture();
  const submit = { week, activityId: session.id, rating: 0, userId: "other-user", playerId: "athlete-b", date: "forged" };
  expect((await send(handler, "POST", { ...submit, rating: 0.5 })).status).toBe(400);
  expect((await send(handler, "POST", { ...submit, activityId: future.id })).status).toBe(404);
  expect(calls.every(({ name }) => name === "read_performance_player_portal")).toBe(true);
  expect((await send(handler, "POST", submit)).body).toEqual({ ok: true, rating: 0 });
  expect(calls.at(-1)).toEqual({ name: "submit_performance_rpe", fields: {
    p_user_id: user, p_activity_id: session.id, p_activity_date: session.date, p_rating: 0,
  } });
  expect((await send(playerFixture({ status: "answered" }).handler, "POST", submit)).status).toBe(409);
});

test("staff can review Wellness and open RPE for a completed Schedule pass while account links require an admin", async () => {
  const calls = [];
  const opts = { now, rpc: async (name, fields) => {
    calls.push({ name, fields });
    if (name === "open_performance_rpe") return [players[0].id, "unrequested-player"];
    if (name === "manage_performance_player_account") return "linked";
    return { linkedPlayerIds: players.map(({ id }) => id), rpe: [],
      wellness: players.map(({ id }) => ({ ...validWellness, playerId: id })) };
  } };
  const base = { scope, week, sources };
  const read = await staffContracts.handleStaffCheckins({ ...base, playerId: players[0].id }, opts);
  expect(read.payload.wellness).toEqual([{ playerId: players[0].id, date: session.date, score: 82, sleepDuration: "7-8" }]);
  expect(read.payload.linkedPlayerIds).toEqual([players[0].id]);
  expect(read.payload.canManageAccounts).toBe(false);
  expect(calls.at(-1).fields.p_player_ids).toEqual([players[0].id]);
  const open = { action: "open-rpe", activityId: session.id, playerIds: [players[0].id] };
  const write = (body, staff = scope) => staffContracts.handleStaffCheckins({ ...base, write: true, body, scope: staff }, opts);
  expect((await write({ ...open, activityId: future.id })).status).toBe(400);
  expect((await write({ ...open, playerIds: ["removed-player"] })).status).toBe(400);
  expect((await write(open)).payload.opened).toEqual([players[0].id]);
  expect(calls.at(-1).fields).toMatchObject({ p_activity_id: session.id, p_activity_date: session.date, p_player_ids: [players[0].id] });
  const link = { action: "link-account", playerId: players[0].id, email: " Player@example.test " };
  expect((await write(link)).status).toBe(403);
  expect((await write(link, { ...scope, actor: { id: user, role: "team-admin" } })).payload.linked).toBe(true);
  expect(calls.at(-1).fields.p_email).toBe("player@example.test");
});

test("the expiring practice account can answer its fixture without accessing live Squad data", async () => {
  const writes = [];
  const handler = playerEndpoint.createRpeResponseHandler({
    readActor: async () => ({ id: user, role: "guest", status: "active" }),
    readSources: async () => { throw new Error("Practice account reached live owner sources."); },
    now,
    rpc: async (name, fields) => {
      if (name === "submit_performance_rpe") {
        writes.push(fields);
        return "saved";
      }
      return { demo: true, playerId: `performance-qa-${user}`, wellness: [validWellness], rpe: [
        { activityId: "performance-qa-session", date: session.date, rating: null },
        { activityId: session.id, date: session.date, rating: 8 },
      ] };
    },
  });
  const result = await send(handler, "GET");
  expect(result.body).toEqual({ ok: true, week, demo: true, wellness: [], rpe: [
    { activityId: "performance-qa-session", date: session.date, title: "RPE practice session", rating: null },
  ] });
  expect((await send(handler, "POST", { week, activityId: session.id, rating: 9 })).status).toBe(404);
  expect((await send(handler, "POST", { week, activityId: "performance-qa-session", rating: 9 })).status).toBe(200);
  expect(writes).toEqual([{ p_user_id: user, p_activity_id: "performance-qa-session", p_activity_date: session.date, p_rating: 9 }]);
});
