import { expect, test } from "@playwright/test";
import publicationApi from "../api/_lib/idp-player-publication.js";
import auth from "../api/_lib/supabase-admin.js";
import security from "../api/_lib/platform-security.js";

const actor = { id: "5121c05d-5fea-4e77-9882-c0d7bdf69cba", role: "coach", status: "active" };
const team = { organizationId: "courage-org", teamId: "courage-team" };

test("IDP publishing only passes permitted fields and the actor's resolved Courage team to the database", async () => {
  const calls = [];
  const dependencies = {
    readScope: async () => ({ ok: true }),
    resolveTeam: async () => team,
    rpc: async (name, params) => {
      calls.push({ name, params });
      return { state: "ready", published: true, revision: 2 };
    },
  };
  const input = { actor, playerId: "courage-player", body: {
    operation: "publish", focus: "  Scan early  ", nextStep: "Check both shoulders", feedback: "",
    revision: 1, organizationId: "other-org", teamId: "other-team", staffNotes: "private",
  } };
  expect((await publicationApi.handleIdpPlayerPublication(input, dependencies)).payload.publication.revision).toBe(2);
  expect(calls).toEqual([{ name: "manage_idp_player_publication", params: {
    p_actor_id: actor.id, p_organization_id: team.organizationId, p_team_id: team.teamId,
    p_player_id: "courage-player", p_action: "publish", p_focus: "Scan early",
    p_next_step: "Check both shoulders", p_feedback: "", p_revision: 1,
  } }]);
  for (const role of ["guest", "analyst", "performance"]) {
    expect((await publicationApi.handleIdpPlayerPublication({ ...input, actor: { ...actor, role } }, dependencies)).status).toBe(403);
  }
  expect((await publicationApi.handleIdpPlayerPublication(input, { ...dependencies, resolveTeam: async () => null })).status).toBe(403);
  expect((await publicationApi.handleIdpPlayerPublication(input, {
    ...dependencies, rpc: async () => ({ state: "conflict" }),
  })).status).toBe(409);
  expect(calls).toHaveLength(1);
});

test("only a fresh empty binding lookup gives a Guest legacy access", async () => {
  const keys = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SECRET_KEY"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    SUPABASE_URL: "https://supabase.example.test", SUPABASE_ANON_KEY: "public-test-key", SUPABASE_SECRET_KEY: "secret-test-key",
  });
  const fetchOriginal = global.fetch;
  let links = [];
  global.fetch = async (url) => {
    const path = new URL(url).pathname;
    if (path === "/auth/v1/user") return Response.json({ id: actor.id, app_metadata: { role: "guest" } });
    expect(path).toBe("/rest/v1/performance_player_accounts");
    return links === null ? Response.json({}, { status: 503 }) : Response.json(links);
  };
  try {
    const token = "Bearer player-profile-contract-fixture";
    expect((await auth.getCurrentActor(token)).playerOnly).toBe(false);
    links = [{ user_id: actor.id }];
    const player = await auth.getCurrentActor(token);
    expect(player.playerOnly).toBe(true);
    const res = { setHeader() {}, end() {} };
    const req = { method: "GET", headers: {} };
    expect(security.guardApiRequest(req, res, { route: "/api/app-state", actor: player, enforcePermission: false }).status).toBe(403);
    expect(security.guardApiRequest(req, res, { route: "/api/performance-rpe", actor: player }).ok).toBe(true);
    links = null;
    expect((await auth.getCurrentActor(token)).playerOnly).toBe(true);
  } finally {
    global.fetch = fetchOriginal;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
