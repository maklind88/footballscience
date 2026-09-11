export const actorId = "11111111-1111-4111-8111-111111111111";
export const organizationId = "22222222-2222-4222-8222-222222222222";
export const teamId = "33333333-3333-4333-8333-333333333333";
export const otherTeamId = "44444444-4444-4444-8444-444444444444";

// Synthetic football events, never a copy of the team's production dataset.
export function sourceFixture(count = 6) {
  const matches = [1, 2].map((matchNumber) => ({ matchNumber, opponent: `Example opponent ${matchNumber}`, homeAway: matchNumber === 1 ? "Home" : "Away",
    sourceRows: Math.ceil((count - (matchNumber - 1)) / 2), cleanEvents: Math.ceil((count - (matchNumber - 1)) / 2), excludedRows: 0 }));
  const events = Array.from({ length: count }, (_, index) => {
    const match = matches[index % 2];
    return { id: `E-${String(index).padStart(6, "0")}`, matchNumber: match.matchNumber, opponent: match.opponent, homeAway: match.homeAway,
      eventCategory: index % 2 ? "Shooting Zone" : "Zone 2", outcome: index % 3 ? "Completed" : "Attempted",
      ballCarrierEntryMethod: "Pass", ballCarriers: ["Example Player A"], receivingPlayers: ["Example Player B"], hasNoClearTarget: false,
      gameMinute: index % 90, period: index % 2 ? "2nd Half" : "1st Half", periodThird: "0 - 15", passFromZoneTags: ["Zone 1"],
      progressFromCorridor: "Central", progressIntoCorridor: "Left", timeBasis: "Exact Game Time", playerAttributionStatus: "Valid", playerAttributionNote: null };
  });
  return { dashboardData: { generatedAt: "2026-09-10T12:00:00Z", matches, events,
    gameStates: matches.map((match) => ({ matchNumber: match.matchNumber, opponent: match.opponent, homeAway: match.homeAway, startMinute: 0, ncScore: 0, opponentScore: 0, note: "Kickoff" })) },
    playerMinutes: { rule: "Synthetic test playing time", matches: matches.map((match) => ({ matchNumber: match.matchNumber,
      statsbombMatchId: 4047502 + match.matchNumber, sourceFile: `Example ${match.matchNumber}.csv`, sourceSha256: "a".repeat(64),
      intervals: [{ playerId: "1", name: "Example Player A", period: "1st Half", start: 0, end: 45 }] })) } };
}
export function platformFixture(role = "coach") {
  return { ok: true, actor: { id: actorId, status: "active" }, scope: {
    teams: [{ id: teamId, organizationId, name: "Example Team", status: "active" }],
    memberships: [{ organizationId, teamId, scope: "team", status: "active", role }],
  } };
}
