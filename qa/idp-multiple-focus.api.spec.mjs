import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { createIdpActions } from "../src/modules/idp/idp-actions.mjs";
import { createIdpStore } from "../src/modules/idp/idp-state.mjs";
import { selectIdpFocus, availableFocusLevels } from "../src/modules/idp/domain/idp-focus-selection.mjs";
import { buildIdpPlayerBoardBlock, blockToInterventionPatch } from "../src/modules/idp/idp-player-board-helpers.mjs";
import { renderFocusSelect } from "../src/modules/idp/idp-focus-controls.mjs";

const require = createRequire(import.meta.url);
const api = require("../api/_lib/idp-database.js");
const actor = { id: "coach-1", clubId: "club-ncc", teamId: "team-ncc-first" };
const mainId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const foreignId = "33333333-3333-4333-8333-333333333333";

function installDatabaseMock() {
  const scope = { organization_id: actor.clubId, team_id: actor.teamId, player_id: "p1", deleted_at: null, row_version: 1 };
  const tables = {
    idp_profiles: [{ ...scope, id: randomUUID() }],
    idp_focuses: [
      { ...scope, id: mainId, title: "Crossing", focus_level: "main", status: "Active" },
      { ...scope, id: secondId, title: "Scanning", focus_level: "secondary", status: "Active" },
      { ...scope, player_id: "other-player", id: foreignId, title: "Other", focus_level: "main", status: "Active" },
    ],
    idp_development_interventions: [], idp_development_goals: [], idp_audit_events: [],
  };
  const writes = [];
  const originalFetch = globalThis.fetch;
  const oldEnv = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY };
  process.env.SUPABASE_URL = "https://idp-test.invalid";
  process.env.SUPABASE_SECRET_KEY = "test-only-key";
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    expect(url.hostname).toBe("idp-test.invalid");
    const table = url.pathname.split("/").at(-1);
    const rows = tables[table] ||= [];
    const matching = rows.filter((row) => [...url.searchParams].every(([key, value]) => {
      if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
      if (value === "is.null") return row[key] == null;
      return true;
    }));
    if (!options.method || options.method === "GET") return Response.json(matching);
    const body = JSON.parse(options.body);
    writes.push({ table, body, params: url.searchParams, method: options.method });
    if (options.method === "POST") {
      const row = { id: randomUUID(), row_version: 1, deleted_at: null, ...body };
      rows.push(row);
      return Response.json([row]);
    }
    expect(options.method).toBe("PATCH");
    matching.forEach((row) => Object.assign(row, body, { row_version: row.row_version + 1 }));
    return Response.json(matching);
  };
  return { tables, writes, restore() {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  } };
}

test("focus selection is stable by priority, explicit selection wins, multiple categories need not be unique", () => {
  const main = { id: mainId, focusLevel: "main", status: "Active", category: "Technical" };
  const secondary = { id: secondId, focusLevel: "secondary", status: "Active", category: "Technical" };
  const detail = { focuses: [secondary, main] };
  expect(selectIdpFocus(detail)).toBe(main);
  expect(selectIdpFocus(detail, secondId)).toBe(secondary);
  expect(availableFocusLevels(detail)).toEqual(["personal"]);
  expect(availableFocusLevels(detail, mainId)).toEqual(["main", "personal"]);
});

test("draft and unlinked existing exercises never acquire the current focus implicitly", () => {
  const detail = { profile: { playerId: "p1" }, focuses: [{ id: mainId, title: "Crossing", status: "Active" }], interventions: [] };
  const draft = buildIdpPlayerBoardBlock(detail);
  expect(draft.focusId).toBe("");
  expect(draft.title).toBe("Individual exercise 1");
  const linked = { id: randomUUID(), focusId: secondId, title: "Saved", boardState: {}, rowVersion: 3 };
  expect(blockToInterventionPatch(buildIdpPlayerBoardBlock(detail, { intervention: linked }))).toMatchObject({ focusId: secondId, rowVersion: 3 });
  expect(buildIdpPlayerBoardBlock(detail, { intervention: { ...linked, focusId: "" } }).focusId).toBe("");
  expect(renderFocusSelect(detail, secondId)).toContain(`value="${secondId}" selected>Archived focus (linked)`);
});

test("API saves free exercises then links, switches and unlinks focus without changing drawing or identity", async () => {
  const mock = installDatabaseMock();
  try {
    const created = await api.createDevelopmentIntervention({ playerId: "p1", title: "Free exercise", boardState: { tacticalElements: [{ id: "cone", type: "cone", x: 20, y: 30 }] } }, actor);
    expect(created.ok).toBe(true);
    let row = created.payload.intervention;
    expect(row.focus_id).toBeNull();
    const originalBoard = structuredClone(row.board_state);
    for (const focusId of [mainId, secondId, ""]) {
      const result = await api.updateDevelopmentIntervention({ id: row.id, playerId: "p1", rowVersion: row.row_version, focusId }, actor);
      expect(result.ok, result.reason).toBe(true);
      expect(result.payload.intervention.focus_id).toBe(focusId || null);
      expect(result.payload.intervention.board_state).toEqual(originalBoard);
      row = result.payload.intervention;
    }
    expect(mock.tables.idp_development_interventions).toHaveLength(1);
    expect(mock.tables.idp_audit_events).toHaveLength(4);
    expect(mock.writes.filter((write) => write.method === "PATCH").every((write) => write.params.has("row_version"))).toBe(true);
  } finally { mock.restore(); }
});

test("API rejects wrong-player focus, invalid IDs and stale exercise versions without writes", async () => {
  const mock = installDatabaseMock();
  try {
    const created = await api.createDevelopmentIntervention({ playerId: "p1", title: "Free" }, actor);
    const row = created.payload.intervention;
    const count = mock.writes.length;
    for (const [focusId, status] of [[foreignId, 404], ["invalid", 400]]) {
      const result = await api.updateDevelopmentIntervention({ id: row.id, playerId: "p1", rowVersion: 1, focusId }, actor);
      expect(result).toMatchObject({ ok: false, status });
    }
    expect(await api.updateDevelopmentIntervention({ id: row.id, playerId: "p1", rowVersion: 7, focusId: mainId }, actor)).toMatchObject({ ok: false, status: 409 });
    expect(await api.addEvidence({ playerId: "p1", focusId: foreignId, note: "Wrong" }, actor)).toMatchObject({ ok: false, status: 404 });
    expect(await api.completeReview({ playerId: "p1", focusId: foreignId }, actor)).toMatchObject({ ok: false, status: 404 });
    expect(mock.writes).toHaveLength(count);
  } finally { mock.restore(); }
});

test("goals persist the chosen focus, allow explicit unlink and preserve unchanged archived links", async () => {
  const mock = installDatabaseMock();
  try {
    const created = await api.createDevelopmentGoal({ playerId: "p1", title: "Scan twice", focusId: secondId }, actor);
    expect(created.ok).toBe(true);
    const goal = created.payload.goal;
    expect(goal.focus_id).toBe(secondId);
    mock.tables.idp_focuses.find((focus) => focus.id === secondId).deleted_at = "2026-09-23";
    expect((await api.updateDevelopmentGoal({ id: goal.id, playerId: "p1", rowVersion: 1, focusId: secondId, title: "Scan three times" }, actor)).ok).toBe(true);
    expect((await api.updateDevelopmentGoal({ id: goal.id, playerId: "p1", rowVersion: 2, focusId: "" }, actor)).ok).toBe(true);
    expect(mock.tables.idp_development_goals[0].focus_id).toBeNull();
    expect(mock.tables.idp_development_goals).toHaveLength(1);
  } finally { mock.restore(); }
});

test("editing a secondary focus leaves the main focus untouched and rejects stale writes", async () => {
  const mock = installDatabaseMock();
  try {
    expect((await api.updateFocus({ id: secondId, playerId: "p1", rowVersion: 1, title: "Better scanning", focusLevel: "secondary" }, actor)).ok).toBe(true);
    expect(mock.tables.idp_focuses[0].title).toBe("Crossing");
    expect(await api.updateFocus({ id: secondId, playerId: "p1", rowVersion: 1, title: "Overwrite" }, actor)).toMatchObject({ ok: false, status: 409 });
    expect(await api.updateFocus({ id: foreignId, playerId: "p1", rowVersion: 1, title: "Wrong" }, actor)).toMatchObject({ ok: false, status: 404 });
  } finally { mock.restore(); }
});

test("goal actions do not substitute the main focus when No focus was explicitly selected", async () => {
  const store = createIdpStore({ ui: { selectedPlayerId: "p1" }, playerDetail: { profile: { playerId: "p1" }, focuses: [{ id: mainId, title: "Crossing" }] } });
  const sent = [];
  const actions = createIdpActions({ store, api: {
    createGoal: async (payload) => sent.push(payload), loadDashboard: async () => ({ players: [] }), loadPlayer: async () => ({ profile: { playerId: "p1" }, focuses: [] }),
  } });
  for (const focusId of [secondId, ""]) {
    const form = new FormData(); form.set("title", "Goal"); form.set("focusId", focusId);
    await actions.saveGoal(form);
  }
  expect(sent.map((payload) => payload.focusId)).toEqual([secondId, ""]);
});
