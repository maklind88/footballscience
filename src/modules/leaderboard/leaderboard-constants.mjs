export const leaderboardApiPath = "/api/leaderboard";

export const leaderboardTabs = Object.freeze([
  Object.freeze({ id: "standings", label: "Standings" }),
  Object.freeze({ id: "activity", label: "Activity" }),
]);

export const leaderboardAwardModes = Object.freeze([
  Object.freeze({ id: "placements", label: "Placements", description: "Award 3, 2 and 1 points by finish." }),
  Object.freeze({ id: "same", label: "Same points", description: "Give every selected winner the same points." }),
]);

export const leaderboardPlacementPoints = Object.freeze({
  1: 3,
  2: 2,
  3: 1,
});

export const leaderboardSamePointPresets = Object.freeze([1, 2, 3, 5]);
export const leaderboardMaxPointsPerPlayer = 99;
