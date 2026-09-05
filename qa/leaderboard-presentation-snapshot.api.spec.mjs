import { expect, test } from "@playwright/test";
import { createLeaderboardPresentationSnapshot } from "../src/modules/leaderboard/leaderboard-snapshot.mjs";

const currentMonthPayload = {
  roster: [
    { playerId: "p1", displayName: "Ada Forward", number: "9", position: "Forward", photoUrl: "/ada.jpg" },
    { playerId: "p2", displayName: "Bea Midfielder", number: "8", position: "Midfielder" },
    { playerId: "p3", displayName: "Cara Defender", number: "4", position: "Defender" },
    { playerId: "p4", displayName: "Dana Keeper", number: "1", position: "Goalkeeper" },
  ],
  standings: [
    { playerId: "p2", points: 7, awardCount: 3 },
    { playerId: "p1", points: 12, awardCount: 4 },
    { playerId: "p4", points: 0, awardCount: 0 },
    { playerId: "p3", points: 5, awardCount: 2 },
  ],
};

test("Presentation snapshot uses the current month and only exposes ranked scorers", () => {
  const squadRoomPhoto = `data:image/png;base64,${"A".repeat(2400)}`;
  const snapshot = createLeaderboardPresentationSnapshot({
    month: "2026-08",
    status: "ready",
    data: { standings: [{ playerId: "old", displayName: "Historical Player", points: 99 }] },
    monthCache: {
      "2026-09": { status: "ready", data: currentMonthPayload, error: "" },
    },
  }, {
    getNow: () => new Date("2026-09-01T12:00:00Z"),
    teamName: "North Carolina Courage",
    teamLogoUrl: "/ncc.png",
    getPlayerProfilesState: () => ({
      players: [{ id: "p2", imageUrl: squadRoomPhoto }],
    }),
  });

  expect(snapshot).toMatchObject({
    status: "ready",
    month: "2026-09",
    monthLabel: "September 2026",
    teamName: "North Carolina Courage",
    teamLogoUrl: "/ncc.png",
  });
  expect(snapshot.standings.map((player) => [player.name, player.points, player.rank])).toEqual([
    ["Ada Forward", 12, 1],
    ["Bea Midfielder", 7, 2],
    ["Cara Defender", 5, 3],
  ]);
  expect(snapshot.standings[0].photoUrl).toBe("/ada.jpg");
  expect(snapshot.standings[1].photoUrl).toBe(squadRoomPhoto);
  expect(JSON.stringify(snapshot)).not.toContain("Historical Player");
  expect(snapshot.standings.some((player) => player.points === 0)).toBe(false);
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot.standings)).toBe(true);
});

test("Presentation snapshot keeps loading and error states free of stale standings", () => {
  const loading = createLeaderboardPresentationSnapshot({
    month: "2026-09",
    status: "loading",
    data: currentMonthPayload,
  }, { getNow: () => new Date("2026-09-01T12:00:00Z") });
  const failed = createLeaderboardPresentationSnapshot({
    month: "2026-09",
    status: "error",
    data: currentMonthPayload,
    requestError: "Connection unavailable",
  }, { getNow: () => new Date("2026-09-01T12:00:00Z") });

  expect(loading.standings).toEqual([]);
  expect(failed).toMatchObject({
    status: "error",
    requestError: "Connection unavailable",
    standings: [],
  });
});
