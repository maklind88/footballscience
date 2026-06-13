import { expect, test } from "@playwright/test";
import {
  createFootballScienceDbScoutingModels,
  normalizeFootballScienceDbProfile,
  normalizeFootballScienceDbQualityNumber,
  normalizeFootballScienceDbQualityPlayer,
  normalizeFootballScienceDbQualitySummary,
  normalizeFootballScienceDbReview,
} from "../src/modules/scouting/index.mjs";

const normalizeText = (value = "", limit = 160) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);

test("Football Science DB models normalize quality numbers and review players", () => {
  expect(normalizeFootballScienceDbQualityNumber("12.9")).toBe(12);
  expect(normalizeFootballScienceDbQualityNumber("-2")).toBe(0);
  expect(
    normalizeFootballScienceDbQualityPlayer(
      {
        id: " player-1 ",
        name: "",
        sourceConfidence: "88.8",
        metricCount: "7",
        reviewReasons: [
          { code: " weak ", label: " Weak identity ", priority: "" },
          { code: "skip", label: "" },
        ],
      },
      { normalizeText }
    )
  ).toMatchObject({
    id: "player-1",
    fsdbId: "player-1",
    name: "Unknown player",
    genderSegment: "unknown",
    nameQuality: "unknown",
    sourceConfidence: 88,
    metricCount: 7,
    reviewReasons: [{ code: "weak", label: "Weak identity", priority: "medium" }],
  });
});

test("Football Science DB models normalize quality summaries defensively", () => {
  const summary = normalizeFootballScienceDbQualitySummary(
    {
      generatedAt: " 2026-06-13 ",
      countStrategy: "",
      totals: { players: "100.4", women: "70", men: "30", mixed: "-1", unknownGender: null },
      coverage: { fullNamePct: "92", statsPct: "45.8" },
      counts: { linked: "12", broken: "-4" },
      reviewQueues: {
        weakIdentity: [{ id: "weak-1", name: "Weak One" }],
        initialNames: [{ id: "initial-1", name: "I. Name" }],
      },
    },
    { normalizeText }
  );

  expect(summary.generatedAt).toBe("2026-06-13");
  expect(summary.countStrategy).toBe("planned");
  expect(summary.totals).toMatchObject({ players: 100, women: 70, men: 30, mixed: 0, unknownGender: 0 });
  expect(summary.coverage).toMatchObject({ fullNamePct: 92, statsPct: 45 });
  expect(summary.counts).toEqual({ linked: 12, broken: 0 });
  expect(summary.reviewQueues.weakIdentity[0].name).toBe("Weak One");
  expect(summary.reviewQueues.initialNames[0].fsdbId).toBe("initial-1");
});

test("Football Science DB models normalize review and profile payloads", () => {
  const profile = normalizeFootballScienceDbProfile(
    {
      player: {
        id: "player-1",
        fsdbId: "fsdb-1",
        fullName: "Ada Example",
        birthYear: "2000",
        sourceConfidence: "91",
        metricCount: "20",
        dataReadiness: { label: "Trusted stats", statsReady: true },
      },
      review: {
        reasons: [
          { code: "initial", label: "Initial-only name", priority: "high" },
          { code: "empty", label: "" },
        ],
      },
      aliases: [{ alias: "A. Example", confidence: "75" }],
      sourceLinks: [{ sourceSystem: "wyscout", sourceUrl: "https://example.test/player", confidence: "90" }],
      rosters: [{ season: "2026", team: "North Carolina", positionGroup: "FW" }],
      stats: [{ season: "2026", minutes: "1234.8", matches: "14", starts: "12", metrics: { xg: { value: 8.4 } }, metricCount: "1" }],
    },
    { normalizeText }
  );

  expect(profile.player).toMatchObject({
    id: "player-1",
    fsdbId: "fsdb-1",
    name: "Ada Example",
    birthYear: 2000,
    sourceConfidence: 91,
    metricCount: 20,
  });
  expect(profile.player.dataReadiness).toMatchObject({ label: "Trusted stats", statsReady: true });
  expect(profile.review).toMatchObject({ status: "needs_review", label: "Needs review" });
  expect(profile.review.reasons).toEqual([{ code: "initial", label: "Initial-only name", priority: "high" }]);
  expect(profile.aliases[0]).toMatchObject({ alias: "A. Example", confidence: 75 });
  expect(profile.sourceLinks[0]).toMatchObject({ sourceSystem: "wyscout", confidence: 90 });
  expect(profile.rosters[0]).toMatchObject({ season: "2026", team: "North Carolina", position: "FW" });
  expect(profile.stats[0]).toMatchObject({ season: "2026", minutes: 1234.8, matches: 14, starts: 12, metricCount: 1 });
});

test("Football Science DB model factory owns workspace normalization", () => {
  const models = createFootballScienceDbScoutingModels({ normalizeText });

  expect(models.normalizeQualityNumber("5.9")).toBe(5);
  expect(models.normalizeQualitySummary({ totals: { players: "2" } }).totals.players).toBe(2);
  expect(models.normalizeReview({}).status).toBe("ready");
  expect(models.normalizeProfile({ player: { displayName: "Fallback" } }).player.name).toBe("Fallback");
});
