import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import { defaultGameModelItems, gameModelActionForFocus } from "../src/modules/game-model/catalog.mjs";

const require = createRequire(import.meta.url);
const { createGameModelHandler } = require("../api/game-model.js");
const { readGameModelCatalog, saveGameModelItem } = require("../api/_lib/game-model-catalog.js");
const { resolveGameModelScope } = require("../api/_lib/game-model-scope.js");

const actorId = "f428b29e-eae8-4088-81a7-87fc9baf06b0";
const teamId = "40234f5f-b7d2-4a62-bf1a-a31a57908d04";
const otherTeamId = "aa369313-1ea4-4b7a-be66-6980c6dcd843";
const organizationId = "b01c9fac-cf18-4e27-8f38-fbfab89a1b9d";
const actionId = "build-up-6-find-the-free-third-player";

async function invoke(handler, { method = "GET", url = "/api/game-model", body, authenticated = true } = {}) {
  const req = Object.assign(Readable.from(body === undefined ? [] : [JSON.stringify(body)]), {
    method, url, headers: authenticated ? { authorization: "Bearer game-model-test" } : {},
  });
  const headers = new Map();
  const res = {
    statusCode: 0,
    body: null,
    setHeader: (name, value) => headers.set(name.toLowerCase(), value),
    end(value) {
      this.body = value ? JSON.parse(String(value)) : null;
    },
  };
  await handler(req, res);
  return { status: res.statusCode, body: res.body, headers };
}

test("the Game Model route uses fresh team membership to authorize reads and writes", async () => {
  const calls = { read: 0, save: 0 };
  const teams = [teamId, otherTeamId].map((id) => ({ id, organizationId, status: "active" }));
  const memberships = [{ teamId, organizationId, role: "analyst", scope: "team", status: "active" }];
  const handler = createGameModelHandler({
    getCurrentActor: async (authorization) => authorization ? { id: actorId, role: "admin" } : null,
    resolveGameModelScope: (actor, requestedTeam) => resolveGameModelScope(actor, requestedTeam, {
      resolvePlatformActorScope: async () => ({
        ok: true,
        actor: { id: actorId, status: "active", profile: { primaryTeamId: teamId, status: "active" } },
        scope: { teams, memberships },
      }),
    }),
    readGameModelCatalog: async (scope) => {
      calls.read += 1;
      expect(scope).toMatchObject({ teamId, organizationId, actor: { id: actorId, role: "analyst" } });
      return { ok: true, items: [] };
    },
    saveGameModelItem: async () => {
      calls.save += 1;
      return { ok: true, item: {} };
    },
  });

  expect((await invoke(handler, { authenticated: false })).status).toBe(401);
  const response = await invoke(handler);
  expect(response).toMatchObject({ status: 200, body: { ok: true, teamId, canEdit: false, items: [] } });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect((await invoke(handler, { url: `/api/game-model?teamId=${otherTeamId}` })).status).toBe(403);
  expect((await invoke(handler, { method: "POST", body: { teamId, item: { title: "Cannot write" } } })).status).toBe(403);
  expect(calls).toEqual({ read: 1, save: 0 });
});

test("team overrides retain stable IDs and scoped revisions across save, archive and read", async () => {
  const scope = { ok: true, teamId, organizationId, actor: { id: actorId, role: "coach" } };
  const seed = defaultGameModelItems.find(({ id }) => id === actionId);
  const requestLog = [];
  let row;
  const options = {
    config: { url: "https://game-model-test.invalid", serviceRoleKey: "test-only" },
    fetchImpl: async (input, options) => {
      const url = new URL(input);
      const body = options.body ? JSON.parse(options.body) : undefined;
      requestLog.push({ method: options.method, query: url.searchParams, path: url.pathname, body });
      if (options.method === "GET") return Response.json(row ? [row] : []);
      if (options.method === "POST") {
        if (row) return Response.json({ code: "23505" }, { status: 409 });
        row = body;
        return Response.json([row]);
      }
      if (!row || url.searchParams.get("revision") !== `eq.${row.revision}`) return Response.json([]);
      row = { ...row, ...body };
      return Response.json([row]);
    },
  };

  const absentPosition = await saveGameModelItem(scope, { ...seed, positionIds: [] }, options);
  expect(absentPosition).toMatchObject({ ok: false, status: 400 });
  expect(requestLog).toHaveLength(0);

  const edited = { ...seed, title: "Connect the next forward option" };
  const saved = await saveGameModelItem(scope, edited, options);
  expect(saved).toMatchObject({ ok: true, item: { id: actionId, title: edited.title, revision: 1, archived: false } });
  expect(requestLog[0]).toMatchObject({
    method: "POST", path: "/rest/v1/game_model_items",
    body: { organization_id: organizationId, team_id: teamId, id: actionId, updated_by: actorId },
  });
  expect(await saveGameModelItem(scope, edited, options)).toMatchObject({ ok: false, status: 409 });

  const merged = await readGameModelCatalog(scope, options);
  expect(merged.ok).toBe(true);
  expect(merged.items.filter(({ id }) => id === actionId)).toEqual([saved.item]);
  expect(merged.items).toHaveLength(defaultGameModelItems.length);
  expect(gameModelActionForFocus(merged.items, actionId, "CMF-6").title).toBe(edited.title);

  const archived = await saveGameModelItem(scope, { ...saved.item, archived: true }, options);
  expect(archived).toMatchObject({ ok: true, item: { id: actionId, archived: true, revision: 2 } });
  const patch = requestLog.find(({ method }) => method === "PATCH");
  expect(patch.query.get("id")).toBe(`eq.${actionId}`);
  expect(patch.query.get("revision")).toBe("eq.1");
  expect(await saveGameModelItem(scope, { ...saved.item, title: "Stale override" }, options))
    .toMatchObject({ ok: false, status: 409 });
  expect(row).toMatchObject({ title: edited.title, archived: true, revision: 2 });

  const afterArchive = await readGameModelCatalog(scope, options);
  expect(gameModelActionForFocus(afterArchive.items, actionId, "CMF-6")).toBeNull();
  for (const call of requestLog.filter(({ method }) => method !== "POST")) {
    expect(call.query.get("organization_id")).toBe(`eq.${organizationId}`);
    expect(call.query.get("team_id")).toBe(`eq.${teamId}`);
  }
});

test("IDP saves the current team catalogue revision on the existing focus", async () => {
  const { updateFocus } = require("../api/_lib/idp-database.js");
  const playerId = "qa-idp-player";
  const focusId = "e09ca6ba-78ab-4208-9392-a2d52ed25381";
  const actor = { id: actorId, role: "coach", organizationId, teamId };
  let focus = {
    id: focusId,
    player_id: playerId,
    organization_id: organizationId,
    team_id: teamId,
    row_version: 5,
    title: "Coach focus",
    description: "Keep the existing coaching text.",
    metadata: { retained: "keep" },
  };
  const gameModelRow = {
    id: actionId,
    kind: "individual-action",
    sub_phase_id: "build-up",
    title: "Team-edited third-player action",
    when_text: "The pivot is pressed from the front.",
    detail: "Use the angle past the pressure.",
    position_ids: ["CMF-6"],
    revision: 3,
    archived: false,
  };
  const gameModelReads = [];
  const patches = [];
  const savedFetch = globalThis.fetch;
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://game-model-idp-test.invalid";
  process.env.SUPABASE_SECRET_KEY = "test-only";
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    expect(url.hostname).toBe("game-model-idp-test.invalid");
    if (url.pathname === `/auth/v1/admin/users/${actorId}`) {
      return Response.json({ id: actorId, app_metadata: { role: "coach", status: "active" } });
    }
    const table = url.pathname.split("/").at(-1);
    if (table === "platform_memberships") {
      return Response.json([teamId, otherTeamId].map((id) => ({
        organization_id: organizationId, team_id: id, role: "coach", scope: "team", status: "active",
      })));
    }
    if (table === "platform_user_profiles") {
      return Response.json([{ user_id: actorId, primary_organization_id: organizationId, primary_team_id: teamId, status: "active" }]);
    }
    if (table === "platform_organizations") {
      return Response.json([{ id: organizationId, status: "active", metadata: { legacyOrganization: "football-science-live" } }]);
    }
    if (table === "platform_teams") {
      if (url.searchParams.get("select") === "metadata") {
        return Response.json(url.searchParams.get("id") === `eq.${teamId}`
          ? [{ metadata: { legacyTeamId: "team-north-carolina-courage" } }]
          : [{ metadata: { legacyTeamId: "other-team" } }]);
      }
      return Response.json([teamId, otherTeamId].map((id) => ({
        id, organization_id: organizationId, status: "active", metadata: {},
      })));
    }
    if (table === "game_model_items") {
      gameModelReads.push(url.searchParams);
      return Response.json([gameModelRow]);
    }
    if (table === "idp_focuses" && options.method === "PATCH") {
      patches.push(url.searchParams);
      focus = { ...focus, ...JSON.parse(options.body), row_version: focus.row_version + 1 };
    }
    if (table === "idp_focuses") return Response.json([focus]);
    return Response.json([]);
  };
  try {
    const payload = {
      id: focusId,
      playerId,
      rowVersion: 5,
      gameModelTeamId: teamId,
      gameModelActionId: actionId,
      gameModelPositionId: "CMF-6",
      gameModelItemRevision: "3",
    };
    const stored = await updateFocus(payload, actor);
    expect(stored).toMatchObject({
      ok: true,
      payload: {
        focus: {
          id: focusId,
          row_version: 6,
          title: "Coach focus",
          description: "Keep the existing coaching text.",
          metadata: {
            retained: "keep",
            game_model_action: {
              actionId,
              title: gameModelRow.title,
              when: gameModelRow.when_text,
              detail: gameModelRow.detail,
              positionId: "CMF-6",
            },
          },
        },
      },
    });
    expect(patches[0].get("row_version")).toBe("eq.5");
    expect(patches[0].get("id")).toBe(`eq.${focusId}`);

    const currentFocus = { ...payload, rowVersion: 6 };
    expect(await updateFocus({ ...currentFocus, gameModelItemRevision: "2" }, actor)).toMatchObject({ ok: false, status: 409 });
    expect(await updateFocus({ ...currentFocus, gameModelTeamId: otherTeamId }, actor)).toMatchObject({ ok: false, status: 403 });
    gameModelRow.archived = true;
    expect(await updateFocus(currentFocus, actor)).toMatchObject({ ok: false, status: 409 });
    expect(patches).toHaveLength(1);
    expect(gameModelReads).toHaveLength(3);
    expect(gameModelReads.map((query) => query.get("team_id"))).toEqual(Array(3).fill(`eq.${teamId}`));
    expect(focus.metadata.game_model_action.title).toBe(gameModelRow.title);

    const { gameModelActionMetadata } = require("../api/_lib/idp-game-model-action.js");
    gameModelRow.archived = false;
    const legacyActor = { ...actor, organizationId: "club-ncc", teamId: "team-ncc-first" };
    const legacyLink = await gameModelActionMetadata(payload, {}, legacyActor);
    expect(legacyLink).toMatchObject({ ok: true, metadata: { game_model_action: { title: gameModelRow.title } } });
    expect(await gameModelActionMetadata(payload, {}, { ...legacyActor, organizationId: "foreign-legacy-org" }))
      .toMatchObject({ ok: false, status: 403 });
  } finally {
    globalThis.fetch = savedFetch;
    if (savedUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = savedKey;
  }
});
