import { sourceFixture } from "./analysis-performance-fixture.mjs";

export function performanceSnapshot(filters = {}, count = 120) {
  const source = sourceFixture(count).dashboardData;
  const events = source.events.filter((row) => (!filters.match || row.matchNumber === Number(filters.match))
    && (!filters.period || row.period === filters.period) && (!filters.category || row.eventCategory === filters.category)
    && (!filters.venue || row.homeAway === filters.venue) && (!filters.outcome || row.outcome === filters.outcome)
    && (!filters.player || row.ballCarriers.includes(filters.player) || row.receivingPlayers.includes(filters.player)));
  const completed = events.filter((row) => row.outcome === "Completed").length;
  const byMatch = source.matches.map((match) => {
    const rows = events.filter((row) => row.matchNumber === match.matchNumber);
    return { matchNumber: match.matchNumber, events: rows.length, completed: rows.filter((row) => row.outcome === "Completed").length };
  }).filter((row) => row.events);
  const zones = [...new Set(events.map((row) => row.eventCategory))].map((category) => {
    const rows = events.filter((row) => row.eventCategory === category);
    return { category, corridor: "Left", events: rows.length, completed: rows.filter((row) => row.outcome === "Completed").length };
  });
  return { ok: true, currentRevision: 2, importAvailable: true, version: { id: "55555555-5555-4555-8555-555555555555", revision: filters.versionId ? 1 : 2,
    importedAt: "2026-09-10T15:30:00Z", sourceGeneratedAt: "2026-09-10T12:00:00Z", eventCount: count, matchCount: 2 },
    history: [{ id: "55555555-5555-4555-8555-555555555555", revision: 1, importedAt: "2026-09-09T12:00:00Z" }],
    matches: source.matches, summary: { events: events.length, completed, matches: byMatch.length }, byMatch, zones,
    players: [{ name: "Example Player A", role: "carrier", events: events.length, completed }, { name: "Example Player B", role: "receiver", events: events.length, completed }],
    playerOptions: ["Example Player A", "Example Player B"], events: events.slice(Number(filters.offset || 0), Number(filters.offset || 0) + 50),
    hasMore: Number(filters.offset || 0) + 50 < events.length, offset: Number(filters.offset || 0) };
}
