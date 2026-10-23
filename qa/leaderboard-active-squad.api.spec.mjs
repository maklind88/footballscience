import { expect, test } from "@playwright/test";
import {
  getLeaderboardEvents,
  getLeaderboardPlayer,
  getLeaderboardPlayerEvents,
  getLeaderboardRankedStandings,
  getLeaderboardZeroPointPlayers,
} from "../src/modules/leaderboard/leaderboard-selectors.mjs";
import { createLeaderboardState } from "../src/modules/leaderboard/leaderboard-state.mjs";
import { renderLeaderboardWorkspace } from "../src/modules/leaderboard/leaderboard-renderer.mjs";
import { renderLeaderboardHomeSummary } from "../src/modules/leaderboard/leaderboard-summary-renderer.mjs";
import { createLeaderboardPresentationSnapshot } from "../src/modules/leaderboard/leaderboard-snapshot.mjs";

const now = new Date("2026-10-23T12:00:00Z");
const context = { getNow: () => now, teamName: "Test Team", canEdit: () => true };

function payload() {
  return {
    month: "2026-10",
    roster: [
      { playerId: "a", displayName: "Ada", availabilityStatus: "injured" },
      { playerId: "b", displayName: "Bea" },
      { playerId: "c", displayName: "Cara" },
      { playerId: "zero", displayName: "Dana" },
      { playerId: "archived", displayName: "Archived Player", archived: true },
      { playerId: "guest", displayName: "Guest Player", countsInSquad: false },
    ],
    standings: [
      { playerId: "removed", displayName: "Departed Player", points: 20, rank: 1 },
      { playerId: "archived", displayName: "Archived Player", points: 15, rank: 2 },
      { playerId: "guest", displayName: "Guest Player", points: 12, rank: 3 },
      { playerId: "b", points: 8, rank: 4 },
      { playerId: "a", points: 8, rank: 4 },
      { playerId: "c", points: 3, rank: 6 },
      { playerId: "removed-zero", displayName: "Departed Zero", points: 0 },
    ],
    events: [{
      id: "award-1", occurredOn: "2026-10-06", title: "Training competition", points: 20,
      awards: [{ playerId: "removed", playerName: "Departed Player", points: 20, placement: 1 }],
    }],
  };
}

test("standings follow current squad membership and rerank ties without changing point history", () => {
  const data = payload();
  const before = structuredClone(data);
  const rows = getLeaderboardRankedStandings(data, context);
  expect(rows.map(({ playerId, points, rank }) => [playerId, points, rank])).toEqual([
    ["a", 8, 1], ["b", 8, 1], ["c", 3, 3],
  ]);
  expect(rows.every((row) => !row.archived)).toBe(true);
  expect(getLeaderboardRankedStandings(data, context, "Cara")).toMatchObject([{ playerId: "c", rank: 3 }]);
  expect(getLeaderboardRankedStandings(data, context, "Departed")).toEqual([]);
  expect(getLeaderboardZeroPointPlayers(data, context).map((row) => row.playerId)).toEqual(["zero"]);
  expect(getLeaderboardPlayer(data, context, "removed")).toBeNull();
  expect(getLeaderboardPlayerEvents(data, "removed")).toHaveLength(1);
  expect(getLeaderboardEvents(data)[0].awards[0]).toMatchObject({ playerId: "removed", points: 20 });
  expect(data).toEqual(before);
});

test("a fresh roster removal hides a former leader and rejoining restores their existing points", () => {
  const data = payload();
  const member = { playerId: "removed", displayName: "Departed Player" };
  data.roster.push(member);
  expect(getLeaderboardRankedStandings(data, context)[0]).toMatchObject({ playerId: "removed", points: 20, rank: 1 });
  data.roster = data.roster.filter((player) => player.playerId !== "removed");
  expect(getLeaderboardRankedStandings(data, context).map((row) => row.rank)).toEqual([1, 1, 3]);
  data.roster.push(member);
  expect(getLeaderboardRankedStandings(data, context)[0]).toMatchObject({ playerId: "removed", points: 20, rank: 1 });
});

for (const inactive of [
  { archived: true }, { isArchived: true }, { archivedAt: "2026-10-23" },
  { archived_at: "2026-10-23" }, { rosterStatus: "archived" },
  { roster_status: "archived" }, { countsInSquad: false }, { counts_in_squad: false },
]) {
  test(`standings respect the existing roster flag ${JSON.stringify(inactive)}`, () => {
    const data = { roster: [{ id: "p1", name: "Player", ...inactive }], standings: [{ player_id: "p1", points: 10 }] };
    expect(getLeaderboardRankedStandings(data, context)).toEqual([]);
    expect(getLeaderboardZeroPointPlayers(data, context)).toEqual([]);
  });
}

test("an empty or missing roster cannot resurrect departed players from ledger or browser cache", () => {
  for (const roster of [[], undefined]) {
    const data = { ...payload(), roster };
    const staleContext = { ...context, getPlayerProfilesState: () => ({ players: [{ id: "removed", name: "Departed Player" }] }) };
    expect(getLeaderboardRankedStandings(data, staleContext)).toEqual([]);
    expect(getLeaderboardZeroPointPlayers(data, staleContext)).toEqual([]);
    expect(renderLeaderboardHomeSummary({ ...createLeaderboardState(now), status: "ready", data }, staleContext))
      .not.toContain("Departed Player");
  }
});

test("Home, full standings, awards and presentation all exclude former players while Activity preserves history", () => {
  const data = payload();
  const state = { ...createLeaderboardState(now), status: "ready", data };
  const home = renderLeaderboardHomeSummary(state, context);
  const full = renderLeaderboardWorkspace(state, context);
  const awards = renderLeaderboardWorkspace({ ...state, ui: { ...state.ui, awardOpen: true } }, context);
  const snapshot = createLeaderboardPresentationSnapshot(state, context);
  for (const markup of [home, full, awards, JSON.stringify(snapshot)]) {
    for (const name of ["Departed Player", "Archived Player", "Guest Player", "Departed Zero"]) {
      expect(markup).not.toContain(name);
    }
    expect(markup).toContain("Ada");
    expect(markup).toContain("Bea");
    expect(markup).toContain("Cara");
  }
  expect(home.match(/leaderboard-podium-trophy/g)).toHaveLength(3);
  expect(full).not.toContain("Former squad");
  expect(snapshot.standings.map((row) => row.rank)).toEqual([1, 1, 3]);
  const activity = renderLeaderboardWorkspace({ ...state, ui: { ...state.ui, tab: "activity" } }, context);
  expect(activity).toContain("Departed Player");
  expect(activity).toContain("Training competition");
});

test("older-month standings also use current membership without altering their stored award history", () => {
  const data = { ...payload(), month: "2026-09" };
  expect(getLeaderboardRankedStandings(data, context).map((row) => row.playerId)).toEqual(["a", "b", "c"]);
  expect(data.standings).toHaveLength(7);
  expect(getLeaderboardPlayerEvents(data, "removed")).toHaveLength(1);
});
