import { expect, test } from "@playwright/test";
import {
  createSquadCounts,
  createSquadLegacyReadAdapter,
  createSquadRosterDraft,
  filterSquadPlayers,
  normalizeSquadState,
  selectSquadPlayerPage,
  squadStorageKey,
} from "../src/modules/manifest.mjs";

const now = "2026-05-07T12:00:00.000Z";
const idFactory = (_player, index = 0) => `player-${index + 1}`;

test("Squad adapter normalizes legacy player profile state for the new module boundary", () => {
  const state = normalizeSquadState(
    JSON.stringify({
      selectedPlayerId: "midfielder",
      rosterVersion: "ncc-2026",
      schemaVersion: 2,
      players: [
        {
          id: "midfielder",
          name: "  Bea Midfielder ",
          position: "Midfielder",
          primaryRole: "8",
          status: "managed",
          squadStatus: "rotation",
          idp: { status: "active", primaryFocus: "Counter-press timing" },
          rosterOrder: 2,
          updatedAt: "2026-05-06T12:00:00.000Z",
        },
        {
          name: "Ada Keeper",
          position: "Goalkeeper",
          status: "not-real",
          rosterOrder: 1,
          updatedAt: "2026-05-07T12:00:00.000Z",
        },
      ],
    }),
    { now, idFactory }
  );

  expect(state).toMatchObject({
    selectedPlayerId: "midfielder",
    rosterVersion: "ncc-2026",
    schemaVersion: 2,
  });
  expect(state.players.map((player) => player.name)).toEqual(["Ada Keeper", "Bea Midfielder"]);
  expect(state.players[0]).toMatchObject({
    id: "player-2",
    primaryRole: "GK",
    roleGroup: "goalkeeper",
    status: "available",
  });
  expect(state.players[1]).toMatchObject({
    primaryRole: "8",
    roleGroup: "midfielder",
    status: "managed",
    squadStatus: "rotation",
  });
});

test("Squad selectors support filtering, counts, and cursor-friendly pages", () => {
  const state = normalizeSquadState(
    {
      players: [
        { id: "gk", name: "Goalkeeper One", position: "Goalkeeper", rosterOrder: 1 },
        { id: "cb", name: "Defender One", position: "Defender", primaryRole: "CB", rosterOrder: 2 },
        {
          id: "mid",
          name: "Midfielder One",
          position: "Midfielder",
          primaryRole: "8",
          rosterOrder: 3,
          idp: { status: "active", primaryFocus: "Switch play" },
        },
      ],
    },
    { now, idFactory }
  );

  expect(filterSquadPlayers(state.players, { query: "switch", roleGroup: "midfielder" }).map((player) => player.id)).toEqual([
    "mid",
  ]);
  expect(createSquadCounts(state.players)).toMatchObject({
    players: 3,
    available: 3,
    activeIdps: 1,
    roleBalance: {
      goalkeeper: 1,
      defender: 1,
      midfielder: 1,
      forward: 0,
    },
  });

  const firstPage = selectSquadPlayerPage(state.players, { limit: 2 });
  expect(firstPage.items.map((player) => player.id)).toEqual(["gk", "cb"]);
  expect(firstPage.nextCursor).toBe("cb");
  expect(selectSquadPlayerPage(state.players, { limit: 2, cursor: firstPage.nextCursor }).items.map((player) => player.id)).toEqual([
    "mid",
  ]);
});

test("Squad legacy read adapter uses the protected storage key and blocks writes", async () => {
  const reads = [];
  const adapter = createSquadLegacyReadAdapter(
    {
      read: async (key) => {
        reads.push(key);
        return JSON.stringify({
          players: [{ id: "gk", name: "Goalkeeper One", position: "Goalkeeper" }],
        });
      },
    },
    { now, idFactory }
  );

  await expect(adapter.readState()).resolves.toMatchObject({ selectedPlayerId: "gk" });
  await expect(adapter.readPlayerById("gk")).resolves.toMatchObject({ primaryRole: "GK" });
  await expect(adapter.readPlayerPage({ limit: 1 })).resolves.toMatchObject({ totalCount: 1 });
  await expect(adapter.readCounts()).resolves.toMatchObject({ players: 1 });
  await expect(adapter.writePlayer({ name: "Nope" })).rejects.toThrow("read-only");
  await expect(adapter.importPlayers([])).rejects.toThrow("read-only");
  await expect(adapter.removePlayer("gk")).rejects.toThrow("read-only");
  expect(reads).toEqual([squadStorageKey, squadStorageKey, squadStorageKey, squadStorageKey]);
});

test("Squad roster draft maps legacy UI fields toward the Supabase schema", () => {
  expect(
    createSquadRosterDraft(
      {
        id: "legacy-1",
        name: "Player One",
        number: "10",
        position: "Forward",
        primaryRole: "ST",
        secondaryRoles: ["RW"],
        squadStatus: "important",
        status: "managed",
      },
      {
        organizationId: "org-1",
        clubId: "club-1",
        teamId: "team-1",
        seasonId: "season-1",
      }
    )
  ).toMatchObject({
    player: {
      organization_id: "org-1",
      display_name: "Player One",
      sort_name: "player one",
      status: "active",
    },
    roster_membership: {
      team_id: "team-1",
      season_id: "season-1",
      shirt_number: "10",
      primary_role: "ST",
      secondary_roles: ["RW"],
      role_group: "forward",
      squad_status: "important",
      availability_status: "managed",
    },
  });
});
