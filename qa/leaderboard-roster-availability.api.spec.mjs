import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readLeaderboardSquadPlayers } from "../src/modules/leaderboard/leaderboard-adapter.mjs";
import { renderLeaderboardAwardSheet } from "../src/modules/leaderboard/leaderboard-award-renderer.mjs";
import { getLeaderboardPlayerAvailability } from "../src/modules/leaderboard/leaderboard-selectors.mjs";

const require = createRequire(import.meta.url);
const availability = require("../api/_lib/leaderboard-availability.js");
const projection = require("../api/_lib/squad-roster-projection.js");
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = fs.readdirSync(path.join(rootDir, "supabase", "migrations"))
  .find((name) => name.endsWith("_squad_roster_projection_for_leaderboard.sql"));
const migration = fs.readFileSync(path.join(rootDir, "supabase", "migrations", migrationName), "utf8");

const actorId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const teamId = "33333333-3333-4333-8333-333333333333";

function sourceState(overrides = {}) {
  return {
    players: [
      { id: "p1", name: "Available Player", number: "9", position: "Forward", rosterType: "squad", countsInSquad: true, status: "available" },
      { id: "p2", name: "Injured Player", number: "4", position: "Defender", rosterType: "squad", countsInSquad: true, status: "injured" },
      { id: "guest", name: "Training Guest", rosterType: "guest", countsInSquad: false, status: "available" },
    ],
    changeLog: [],
    ...overrides,
  };
}

test("Squad projection accepts only the selected team's ordinary roster and strips unrelated profile fields", () => {
  const result = projection.normalizeSquadRosterProjection(JSON.stringify(sourceState({
    players: [
      { ...sourceState().players[0], birthDate: "1998-04-02", sourceUrl: "https://private.example/player", coachNotes: "private", medicalSummary: { coachNote: "private" }, attributeRatings: { speed: 5 } },
      sourceState().players[1],
      sourceState().players[2],
      { id: "academy", name: "Academy Guest", rosterType: "academy", countsInSquad: false },
    ],
  })));

  expect(result.ok).toBe(true);
  expect(result.players.map((player) => player.playerId)).toEqual(["p1", "p2"]);
  expect(result.players[0]).toMatchObject({ displayName: "Available Player", shirtNumber: "9", availabilityStatus: "available" });
  expect(JSON.stringify(result.players)).not.toContain("coachNotes");
  expect(JSON.stringify(result.players)).not.toContain("medicalSummary");
  expect(JSON.stringify(result.players)).not.toContain("attributeRatings");
  expect(JSON.stringify(result.players)).not.toContain("1998-04-02");
  expect(JSON.stringify(result.players)).not.toContain("private.example");
});

test("Squad projection is source-revisioned and invokes one guarded database command", async () => {
  const calls = [];
  const result = await projection.ensureSquadRosterProjection({
    actor: { id: actorId },
    tenant: { organizationId, teamId },
  }, {
    readAppStateRecord: async () => ({
      ok: true,
      entry: {
        revision: 42,
        hash: "a".repeat(64),
        updatedAt: "2026-08-30T12:00:00.000Z",
        value: JSON.stringify(sourceState()),
      },
    }),
    callRpc: async (name, body) => {
      calls.push({ name, body });
      return { ok: true, data: { applied: true, targetMatched: true, projectedPlayers: 2 } };
    },
  });

  expect(result).toMatchObject({ ok: true, projected: true, targetMatched: true });
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    name: "sync_squad_roster_projection",
    body: {
      p_actor_id: actorId,
      p_platform_organization_id: organizationId,
      p_platform_team_id: teamId,
      p_source_revision: 42,
      p_source_hash: "a".repeat(64),
    },
  });
  expect(calls[0].body.p_players.map((player) => player.playerId)).toEqual(["p1", "p2"]);
});

test("date availability is coach-safe, date-specific, and Squad unavailability wins", () => {
  const players = [
    { playerId: "p1", availabilityStatus: "available" },
    { playerId: "p2", availabilityStatus: "injured" },
  ];
  const medicalState = {
    records: [
      { playerId: "p1", date: "2026-08-30", status: "controlled", participation: 50, updatedAt: "2026-08-29T10:00:00Z", comment: "must not leak" },
      { playerId: "p2", date: "2026-08-30", status: "full", participation: 100, updatedAt: "2026-08-29T10:00:00Z" },
    ],
    injuryPlans: [],
  };
  const byPlayer = availability.buildAvailabilityByPlayer({
    month: "2026-08",
    roster: players,
    playerProfilesState: sourceState(),
    medicalState,
  });

  expect(byPlayer.p1["2026-08-30"]).toEqual({ status: "controlled", participation: 50, eligibility: "limited", source: "medical-recommendation" });
  expect(byPlayer.p2["2026-08-30"]).toEqual({ status: "unavailable", participation: 0, eligibility: "unavailable", source: "squad" });
  expect(JSON.stringify(byPlayer)).not.toContain("must not leak");
  expect(availability.findUnavailableAwardPlayerIds([
    { playerId: "p1", points: 3 },
    { playerId: "p2", points: 1 },
  ], "2026-08-30", byPlayer)).toEqual(["p2"]);
});

test("availability source reads fail closed without exposing source errors", async () => {
  await expect(availability.readLeaderboardAvailabilitySources({
    playerProfilesState: sourceState(),
    readAppStateRecord: async () => ({ ok: false, reason: "secret backend detail" }),
  })).resolves.toEqual({ ok: false, status: 503, reason: "Player availability could not be verified." });
});

test("frontend adapter preserves daily availability and defaults safely", () => {
  const players = readLeaderboardSquadPlayers({
    roster: [{
      playerId: "p1",
      displayName: "Available Player",
      availabilityStatus: "available",
      availabilityByDate: {
        "2026-08-30": { status: "modified", participation: 75, eligibility: "limited", source: "medical-recommendation" },
      },
    }],
  });
  expect(getLeaderboardPlayerAvailability(players[0], "2026-08-30")).toMatchObject({ eligibility: "limited", participation: 75 });
  expect(getLeaderboardPlayerAvailability(players[0], "2026-08-29")).toMatchObject({ eligibility: "available", participation: 100 });
});

test("Award Points orders the selected-team roster by date availability and disables unavailable players", () => {
  const players = readLeaderboardSquadPlayers({ roster: [
    { playerId: "out", displayName: "Out Player", availabilityByDate: { "2026-08-30": { status: "unavailable", participation: 0, eligibility: "unavailable", source: "squad" } } },
    { playerId: "limited", displayName: "Limited Player", availabilityByDate: { "2026-08-30": { status: "modified", participation: 75, eligibility: "limited", source: "medical-recommendation" } } },
    { playerId: "ready", displayName: "Ready Player", availabilityByDate: { "2026-08-30": { status: "full", participation: 100, eligibility: "available", source: "medical-recommendation" } } },
  ] });
  const html = renderLeaderboardAwardSheet({
    canEdit: true,
    bounds: { min: "2026-08-01", max: "2026-08-30" },
    players,
    state: {
      ui: { awardOpen: true, pendingAction: "", draftError: "" },
      draft: { mode: "placement", occurredOn: "2026-08-30", title: "Training", note: "", searchQuery: "", assignments: {} },
    },
  });

  expect(html.indexOf("Ready Player")).toBeLessThan(html.indexOf("Limited Player"));
  expect(html.indexOf("Limited Player")).toBeLessThan(html.indexOf("Out Player"));
  expect(html).toContain("1 available");
  expect(html).toContain("1 limited");
  expect(html).toContain("1 unavailable");
  expect(html).toMatch(/Out Player[\s\S]*data-leaderboard-player-id="out"[\s\S]*disabled/);
});

test("projection migration is exact-tenant, idempotent, audited, locked, and service-only", () => {
  expect(migrationName).toMatch(/^\d{14}_squad_roster_projection_for_leaderboard\.sql$/);
  expect(migration).toContain("security invoker");
  expect(migration).not.toContain("security definer");
  expect(migration).toContain("team.metadata ->> 'legacyTeamId' = 'team-north-carolina-courage'");
  expect(migration).toContain("organization.metadata ->> 'legacyOrganization' = 'football-science-live'");
  expect(migration).toContain("pg_advisory_xact_lock");
  expect(migration).toContain("source-already-projected");
  expect(migration).toContain("projectionSource");
  expect(migration).toContain("squad.roster-projection.applied");
  expect(migration).toContain("from public, anon, authenticated, service_role");
  expect(migration).toContain("to service_role");
  expect(migration).not.toMatch(/grant execute[^;]*to authenticated/i);
  expect(migration).not.toContain("coachNote");
  expect(migration).not.toContain("injuryType");
  expect(migration).not.toContain("date_of_birth");
  expect(migration).not.toContain("sourceUrl");
});
