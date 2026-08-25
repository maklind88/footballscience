import { expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function clip(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    match_id: overrides.matchId || "11111111-1111-4111-8111-111111111111",
    video_id: overrides.videoId || "21111111-1111-4111-8111-111111111111",
    start_ms: overrides.startMs ?? 1000,
    end_ms: overrides.endMs ?? 11000,
    period: overrides.period || "1",
    phase: overrides.phase || "Out of Possession",
    sub_phase: overrides.subPhase || "High Press",
    outcome: overrides.outcome || "Positive",
    match_title: overrides.matchTitle || "First team v City",
    match_date: overrides.matchDate || "2026-08-20",
    event_type: overrides.eventType || "match",
    players: overrides.players || [{ player_id: "player-ks", player_label: "KS", role: "primary" }],
    mini_game_principles: overrides.principles || [{ id: "trigger", label: "Trigger" }],
    units: overrides.units || ["Front line"],
    tags: overrides.tags || [],
    notes: overrides.notes || [],
  };
}

const corpus = [
  clip({ id: "clip-1", matchId: "match-1", matchDate: "2026-08-20", outcome: "Positive" }),
  clip({ id: "clip-2", matchId: "match-1", matchDate: "2026-08-20", outcome: "Development", endMs: 7000 }),
  clip({ id: "clip-3", matchId: "match-2", matchDate: "2026-08-10", subPhase: "Build Up", phase: "In Possession", outcome: "Positive" }),
  clip({ id: "clip-4", matchId: "match-2", matchDate: "2026-08-10", subPhase: "Build Up", phase: "In Possession", outcome: "Development" }),
  clip({ id: "clip-5", matchId: "match-3", matchDate: "2026-07-22", outcome: "Positive" }),
  clip({ id: "clip-6", matchId: "match-4", matchDate: "2026-07-01", eventType: "training", outcome: "Neutral" }),
];

test("football query language interprets Swedish entities and bounded phrases", async () => {
  const language = await import(moduleUrl("src/modules/video-analysis/services/clipQueryLanguageService.js"));
  const parsed = language.parseClipQuery(
    "Visa positiv hög press med KS senaste 2 matcher längre än 8 sekunder",
    { players: [{ id: "player-ks", name: "KS" }], clips: corpus },
  );
  expect(parsed.recognized).toBe(true);
  expect(parsed.query.filters).toMatchObject({
    outcomes: ["Positive"],
    subPhases: ["High Press"],
    playerIds: ["player-ks"],
    latestMatches: 2,
    minDurationMs: 8000,
    searchTerms: [],
  });
  expect(parsed.chips.map((chip) => chip.label)).toEqual(expect.arrayContaining(["Positive", "High Press", "KS"]));
});

test("football query language creates two deterministic cohorts", async () => {
  const language = await import(moduleUrl("src/modules/video-analysis/services/clipQueryLanguageService.js"));
  const parsed = language.parseClipQueryRequest("Jämför hög press positiv med build up development", { clips: corpus });
  expect(parsed.mode).toBe("comparison");
  expect(parsed.cohortA.query.filters).toMatchObject({ subPhases: ["High Press"], outcomes: ["Positive"] });
  expect(parsed.cohortB.query.filters).toMatchObject({ subPhases: ["Build Up"], outcomes: ["Development"] });
});

test("advanced matrix supports metrics, drilldown and latest-match filters", async () => {
  const analytics = await import(moduleUrl("src/modules/video-analysis/services/clipAnalyticsService.js"));
  const latest = analytics.filterClipsByAnalysisQuery(corpus, {
    filters: { latestMatches: 2, subPhases: ["High Press"] },
  });
  expect(latest.map((entry) => entry.id).sort()).toEqual(["clip-1", "clip-2"]);

  const matrix = analytics.buildClipMatrix(corpus, { rowAxis: "subPhase", columnAxis: "outcome", metric: "positiveRate" });
  const highPress = matrix.rows.find((row) => row.label === "High Press");
  expect(highPress.counts.get("Positive")).toBe(2);
  expect(highPress.cells.get("Positive")).toMatchObject({ count: 2, positiveCount: 2, value: 1 });
  const drilldown = analytics.buildMatrixDrilldown(corpus, {
    rowAxis: "subPhase",
    columnAxis: "outcome",
    metric: "count",
    selectedRow: "Build Up",
    selectedColumn: "Development",
  });
  expect(drilldown).toMatchObject({ clipCount: 1, positiveRate: 0, matchCount: 1 });
});

test("cohort comparison and analysis report preserve compact evidence", async () => {
  const analytics = await import(moduleUrl("src/modules/video-analysis/services/clipAnalyticsService.js"));
  const reports = await import(moduleUrl("src/modules/video-analysis/services/analysisReportService.js"));
  const cohortA = { label: "High Press", query: { filters: { subPhases: ["High Press"] } } };
  const cohortB = { label: "Build Up", query: { filters: { subPhases: ["Build Up"] } } };
  const comparison = analytics.buildCohortComparison(corpus, cohortA, cohortB);
  expect(comparison).toMatchObject({
    a: { clipCount: 4, label: "High Press" },
    b: { clipCount: 2, label: "Build Up" },
    deltas: { clipCount: -2 },
  });
  const output = reports.createAnalysisReportPresentation({
    intelligence: {
      active: true,
      queryText: "Jamfor hog press med build up",
      querySpec: { filters: {} },
      corpus,
      corpusCount: corpus.length,
      sourceScope: "team-corpus",
      cohortA,
      cohortB,
    },
    matrix: { rowAxis: "subPhase", columnAxis: "outcome", metric: "count" },
    clipLibrary: { selectedClipIds: [] },
  }, corpus);
  expect(output.current).toMatchObject({
    purpose: "analysis",
    metadata: { analysisReport: { schema: "football-science-analysis-report-v1" } },
  });
  expect(output.snapshot.comparison).toMatchObject({ a: { clipCount: 4 }, b: { clipCount: 2 } });
  expect(JSON.stringify(output.snapshot)).not.toMatch(/local[_ ]?(?:path|file)|video[_ ]?(?:blob|bytes)/i);
  expect(JSON.stringify(output.snapshot).length).toBeLessThan(20000);
});

test("analysis facts endpoint is tenant-scoped and paginated fail-closed", async () => {
  const database = require(path.join(rootDir, "api/_lib/video-analysis-intelligence-database.js"));
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://analysis-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  const requests = [];
  try {
    global.fetch = async (url) => {
      requests.push(String(url));
      return Response.json([clip({ id: "fact-1" }), clip({ id: "fact-2" }), clip({ id: "fact-3" })]);
    };
    const result = await database.listAnalysisFacts({ limit: 2 }, {
      id: "analyst-1",
      clubId: "club-1",
      teamId: "team-1",
      role: "analyst",
    });
    expect(result.payload).toMatchObject({ pageSize: 2, hasMore: true, nextOffset: 2 });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("/video_clip_analysis_facts?");
    expect(requests[0]).toContain("organization_id=eq.club-1");
    expect(requests[0]).toContain("team_id=eq.team-1");
    expect(requests[0]).toContain("limit=3");
  } finally {
    global.fetch = originalFetch;
    if (originalUrl == null) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test("analysis read model excludes media secrets and remains service-role only", async () => {
  const migration = await fs.readFile(
    path.join(rootDir, "supabase/migrations/20260825014500_video_analysis_intelligence_facts.sql"),
    "utf8",
  );
  expect(migration).toContain("with (security_invoker = true)");
  expect(migration).toContain("revoke all on public.video_clip_analysis_facts from anon, authenticated");
  expect(migration).toContain("grant select on public.video_clip_analysis_facts to service_role");
  expect(migration).toContain("clip.organization_id");
  expect(migration).toContain("clip.team_id");
  const schema = migration.replace(/^--.*$/gm, "");
  expect(schema).not.toMatch(/signed[_ ]?url|local[_ ]?(?:path|file)|video[_ ]?(?:blob|bytes|data)/i);

  const router = await fs.readFile(path.join(rootDir, "api/_lib/video-analysis-database.js"), "utf8");
  expect(router).toContain('action === "analysis-facts"');
  expect(router).toContain("natural-language-search");
  expect(router).toContain("cohort-comparison");
  expect(router).toContain("analysis-reports");
});
