import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  convergeLeaderboardStagingCleanup,
  createLeaderboardQaRunId,
  getStaleLeaderboardQaEvents,
  leaderboardQaNotePrefix,
  leaderboardQaTitlePrefix,
  parseLeaderboardQaRunId,
  sweepStaleLeaderboardQaEvents,
} from "./helpers/leaderboard-staging-cleanup.mjs";
import { requestLeaderboardStagingJson } from "./helpers/leaderboard-staging-http.mjs";
import {
  buildLeaderboardStagingChildEnv,
  isExpectedSupabaseProjectUrl,
} from "../scripts/lib/leaderboard-staging-qa-env.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function runValidation(env = {}) {
  return spawnSync(process.execPath, [path.join(rootDir, "scripts/run-leaderboard-staging-qa.mjs"), "--required", "--validate-only"], {
    cwd: rootDir,
    env: { PATH: process.env.PATH, ...env },
    encoding: "utf8",
  });
}

const safeEnv = {
  STAGING_QA_BASE_URL: "https://footballscience-git-staging-example.vercel.app",
  STAGING_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  SUPABASE_PROJECT_REF: "uvwxyzabcdefghijklmn",
  LEADERBOARD_STAGING_QA_TEAM_ID: "11111111-1111-4111-8111-111111111111",
  LEADERBOARD_STAGING_QA_USERNAME: "leaderboard-coach@example.test",
  LEADERBOARD_STAGING_QA_PASSWORD: "not-a-real-secret",
};

test("Leaderboard staging runner fails closed before any remote smoke", () => {
  const missing = runValidation();
  expect(missing.status).toBe(1);
  expect(missing.stderr).toContain("Leaderboard staging QA environment verification failed");

  const productionHost = runValidation({ ...safeEnv, STAGING_QA_BASE_URL: "https://footballscience.xyz" });
  expect(productionHost.status).toBe(1);
  expect(productionHost.stderr).toContain("must not point at the production host");

  const sharedDatabase = runValidation({ ...safeEnv, STAGING_SUPABASE_PROJECT_REF: safeEnv.SUPABASE_PROJECT_REF });
  expect(sharedDatabase.status).toBe(1);
  expect(sharedDatabase.stderr).toContain("must not equal SUPABASE_PROJECT_REF");

  const invalidTeam = runValidation({ ...safeEnv, LEADERBOARD_STAGING_QA_TEAM_ID: "legacy-team-id" });
  expect(invalidTeam.status).toBe(1);
  expect(invalidTeam.stderr).toContain("stable Platform team UUID");

  const invalidProjectRef = runValidation({ ...safeEnv, STAGING_SUPABASE_PROJECT_REF: "staging-project-ref" });
  expect(invalidProjectRef.status).toBe(1);
  expect(invalidProjectRef.stderr).toContain("valid 20-character project ref");
});

test("Leaderboard staging runner supports a complete dedicated or generic credential pair", () => {
  const dedicated = runValidation(safeEnv);
  expect(dedicated.status).toBe(0);
  expect(dedicated.stdout).toContain("validation only; no remote smoke executed");

  const { LEADERBOARD_STAGING_QA_USERNAME, LEADERBOARD_STAGING_QA_PASSWORD, ...genericEnv } = safeEnv;
  const generic = runValidation({ ...genericEnv, STAGING_QA_USERNAME: "generic@example.test", STAGING_QA_PASSWORD: "not-a-real-secret" });
  expect(generic.status).toBe(0);

  const mixed = runValidation({ ...safeEnv, LEADERBOARD_STAGING_QA_PASSWORD: "", STAGING_QA_USERNAME: "generic@example.test", STAGING_QA_PASSWORD: "not-a-real-secret" });
  expect(mixed.status).toBe(1);
  expect(mixed.stderr).toContain("must be configured as a pair");
});

test("Leaderboard staging child environment allowlists QA inputs and drops privileged or unknown values", () => {
  const sentinels = {
    SUPABASE_SERVICE_ROLE_KEY: "SENTINEL_SERVICE_ROLE",
    SUPABASE_DB_PASSWORD: "SENTINEL_DB_PASSWORD",
    DATABASE_URL: "SENTINEL_DATABASE_URL",
    SUPABASE_ACCESS_TOKEN: "SENTINEL_ACCESS_TOKEN",
    CRON_SECRET: "SENTINEL_CRON",
    VERCEL_TOKEN: "SENTINEL_VERCEL",
    UNKNOWN_PRIVILEGED_VALUE: "SENTINEL_UNKNOWN",
  };
  const resolved = {
    baseUrl: safeEnv.STAGING_QA_BASE_URL,
    productionBaseUrl: "https://footballscience.xyz",
    stagingRef: safeEnv.STAGING_SUPABASE_PROJECT_REF,
    productionRef: safeEnv.SUPABASE_PROJECT_REF,
    teamId: safeEnv.LEADERBOARD_STAGING_QA_TEAM_ID,
    username: safeEnv.LEADERBOARD_STAGING_QA_USERNAME,
    password: safeEnv.LEADERBOARD_STAGING_QA_PASSWORD,
  };
  const child = buildLeaderboardStagingChildEnv({ PATH: process.env.PATH, ...sentinels }, resolved);
  expect(child.PATH).toBe(process.env.PATH);
  expect(child.PLAYWRIGHT_BASE_URL).toBe(safeEnv.STAGING_QA_BASE_URL);
  expect(Object.keys(child)).not.toContain("UNKNOWN_PRIVILEGED_VALUE");
  for (const [key, value] of Object.entries(sentinels)) {
    expect(child[key]).toBeUndefined();
    expect(JSON.stringify(child)).not.toContain(value);
  }

  const validation = runValidation({ ...safeEnv, ...sentinels });
  expect(validation.status).toBe(0);
  for (const value of Object.values(sentinels)) {
    expect(`${validation.stdout}${validation.stderr}`).not.toContain(value);
  }
});

test("Leaderboard staging project URL validation rejects deceptive origins", () => {
  const ref = safeEnv.STAGING_SUPABASE_PROJECT_REF;
  expect(isExpectedSupabaseProjectUrl(`https://${ref}.supabase.co`, ref)).toBe(true);
  for (const candidate of [
    `http://${ref}.supabase.co`,
    `https://${ref}.supabase.co.evil.test`,
    `https://${ref}.supabase.co/rest/v1`,
    `https://${ref}.supabase.co?target=evil`,
    `https://user:password@${ref}.supabase.co`,
  ]) expect(isExpectedSupabaseProjectUrl(candidate, ref)).toBe(false);
});

test("native staging HTTP failures redact bearer values from errors and console output", async () => {
  const token = "SENTINEL_BEARER_TOKEN_MUST_NOT_LEAK";
  const output = [];
  const originalError = console.error;
  const originalLog = console.log;
  console.error = (...args) => output.push(args.join(" "));
  console.log = (...args) => output.push(args.join(" "));
  try {
    const networkFailure = requestLeaderboardStagingJson({
      baseUrl: "https://staging.example.test",
      path: "/api/leaderboard",
      token,
      fetchImpl: async () => { throw new Error(`Authorization: Bearer ${token}`); },
    });
    await expect(networkFailure).rejects.toThrow("network or timeout");
    await expect(networkFailure).rejects.not.toThrow(token);

    const responseFailure = requestLeaderboardStagingJson({
      baseUrl: "https://staging.example.test",
      path: "/api/leaderboard",
      token,
      fetchImpl: async () => new Response(JSON.stringify({ ok: false, reason: token }), { status: 500 }),
    });
    await expect(responseFailure).rejects.toThrow("HTTP 500");
    await expect(responseFailure).rejects.not.toThrow(token);
  } finally {
    console.error = originalError;
    console.log = originalLog;
  }
  expect(output.join("\n")).not.toContain(token);

  const helperUrl = pathToFileURL(path.join(rootDir, "qa/helpers/leaderboard-staging-http.mjs")).href;
  const subprocess = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import { requestLeaderboardStagingJson } from ${JSON.stringify(helperUrl)};
    const token = process.env.QA_SENTINEL_TOKEN;
    try {
      await requestLeaderboardStagingJson({
        baseUrl: "https://staging.example.test",
        path: "/api/leaderboard",
        token,
        fetchImpl: async () => { throw new Error("Authorization: Bearer " + token); },
      });
    } catch (error) {
      console.error(error.message);
    }
  `], {
    cwd: rootDir,
    env: { PATH: process.env.PATH, QA_SENTINEL_TOKEN: token },
    encoding: "utf8",
  });
  expect(subprocess.status).toBe(0);
  expect(`${subprocess.stdout}${subprocess.stderr}`).toContain("network or timeout");
  expect(`${subprocess.stdout}${subprocess.stderr}`).not.toContain(token);
});

test("Leaderboard staging run ids share one anchored UTC and random-entropy contract", () => {
  const runId = createLeaderboardQaRunId({
    now: new Date("2026-08-24T11:20:00.123Z"),
    randomHex: "0123456789abcdefabcd",
  });
  expect(runId).toBe("20260824T112000123Z-0123456789abcdefabcd");
  expect(parseLeaderboardQaRunId(runId)).toEqual({
    runId,
    timestampMs: Date.parse("2026-08-24T11:20:00.123Z"),
  });
  for (const invalid of ["old", `${runId}-tail`, runId.toUpperCase(), "20260231T112000123Z-0123456789abcdefabcd"]) {
    expect(parseLeaderboardQaRunId(invalid)).toBeNull();
  }
});

test("cleanup converges after ambiguous award and reversal timeouts", async () => {
  const run = { runId: "20260824T112000000Z-11111111111111111111" };
  const baseline = { playerId: "player-b", playerPoints: 4, totalPoints: 9, eventCount: 2 };
  const event = {
    id: "event-late",
    title: `${leaderboardQaTitlePrefix}${run.runId}`,
    note: `${leaderboardQaNotePrefix}${run.runId}`,
    status: "active",
    netPoints: 1,
  };
  let clock = 0;
  let committed = false;
  let reversed = false;
  let awardAttempts = 0;
  let reversalAttempts = 0;
  const snapshot = () => ({
    summary: { totalPoints: reversed ? 9 : 10, eventCount: reversed ? 2 : 3 },
    standings: [{ playerId: "player-b", points: reversed ? 4 : 5 }],
    events: committed ? [{ ...event, status: reversed ? "reversed" : "active", netPoints: reversed ? 0 : 1 }] : [],
  });
  const result = await convergeLeaderboardStagingCleanup({
    run,
    baseline,
    awardBody: { teamId: safeEnv.LEADERBOARD_STAGING_QA_TEAM_ID, idempotencyKey: "award-late" },
    retryAward: async () => {
      awardAttempts += 1;
      committed = true;
      if (awardAttempts === 1) throw new Error("ambiguous award timeout");
      return snapshot();
    },
    readSnapshot: async () => snapshot(),
    reverseEvent: async () => {
      reversalAttempts += 1;
      reversed = true;
      if (reversalAttempts === 1) throw new Error("ambiguous reversal timeout");
      return snapshot();
    },
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    budgetMs: 100,
    requestTimeoutMs: 20,
    retryDelayMs: 1,
  });
  expect(result.ok).toBe(true);
  expect(result.eventIds).toEqual(["event-late"]);
  expect(awardAttempts).toBeGreaterThan(0);
  expect(reversalAttempts).toBeGreaterThan(0);
});

test("cleanup rejects the zero-event vacuous case with the non-secret run id", async () => {
  const run = { runId: "20260824T112000000Z-22222222222222222222" };
  let clock = 0;
  const empty = { summary: { totalPoints: 0, eventCount: 0 }, standings: [], events: [] };
  const cleanup = convergeLeaderboardStagingCleanup({
    run,
    baseline: { playerId: "player-b", playerPoints: 0, totalPoints: 0, eventCount: 0 },
    awardBody: { teamId: safeEnv.LEADERBOARD_STAGING_QA_TEAM_ID, idempotencyKey: "award-empty" },
    retryAward: async () => empty,
    readSnapshot: async () => empty,
    reverseEvent: async () => empty,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    budgetMs: 4,
    requestTimeoutMs: 1,
    retryDelayMs: 1,
  });
  await expect(cleanup).rejects.toThrow(run.runId);
  await expect(cleanup).rejects.toThrow("no run-owned event");
});

test("stale sweep requires one canonical active award identity and preserves every lookalike", async () => {
  const teamId = safeEnv.LEADERBOARD_STAGING_QA_TEAM_ID;
  const wrongTeamId = "22222222-2222-4222-8222-222222222222";
  const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
  const staleRunId = "20260824T112000000Z-aaaaaaaaaaaaaaaaaaaa";
  const otherRunId = "20260824T112100000Z-bbbbbbbbbbbbbbbbbbbb";
  const freshRunId = "20260824T114000000Z-cccccccccccccccccccc";
  const canonical = (id, runId, overrides = {}) => ({
    id,
    title: `${leaderboardQaTitlePrefix}${runId}`,
    note: `${leaderboardQaNotePrefix}${runId}`,
    teamId,
    createdAt: new Date(parseLeaderboardQaRunId(runId).timestampMs + 1_000).toISOString(),
    status: "active",
    points: 1,
    netPoints: 1,
    awards: [{ playerId: "player-b", points: 1 }],
    ...overrides,
  });
  const events = [
    canonical("canonical-stale", staleRunId),
    canonical("arbitrary-suffix", staleRunId, {
      title: `${leaderboardQaTitlePrefix}old`,
      note: `${leaderboardQaNotePrefix}old`,
    }),
    canonical("mismatched-suffix", staleRunId, { note: `${leaderboardQaNotePrefix}${otherRunId}` }),
    canonical("invalid-grammar", staleRunId, {
      title: `${leaderboardQaTitlePrefix}20260824-invalid`,
      note: `${leaderboardQaNotePrefix}20260824-invalid`,
    }),
    canonical("missing-marker", staleRunId, { note: staleRunId }),
    canonical("recent-parallel", freshRunId),
    canonical("wrong-team", staleRunId, { teamId: wrongTeamId }),
    canonical("already-reversed", staleRunId, { status: "reversed", netPoints: 0 }),
    canonical("foreign-event", staleRunId, { title: "Coach activity", note: "not QA-owned" }),
    canonical("not-an-award", staleRunId, { points: 0, netPoints: 0, awards: [] }),
  ];
  const snapshot = () => ({ qaTeamId: teamId, events: events.map((event) => ({ ...event })) });
  const reversedIds = [];
  expect(getStaleLeaderboardQaEvents(snapshot(), nowMs, teamId).map((event) => event.id)).toEqual(["canonical-stale"]);
  expect(getStaleLeaderboardQaEvents({ ...snapshot(), qaTeamId: wrongTeamId }, nowMs, teamId)).toEqual([]);
  const result = await sweepStaleLeaderboardQaEvents({
    initialSnapshot: snapshot(),
    teamId,
    now: () => nowMs,
    reverseEvent: async (body) => {
      reversedIds.push(body.eventId);
      Object.assign(events.find((event) => event.id === body.eventId), { status: "reversed", netPoints: 0 });
      return snapshot();
    },
    readSnapshot: async () => snapshot(),
    sleep: async () => {},
    budgetMs: 10,
  });
  expect(result.eventIds).toEqual(["canonical-stale"]);
  expect(reversedIds).toEqual(["canonical-stale"]);
  for (const event of events.filter((candidate) => candidate.id !== "canonical-stale" && candidate.id !== "already-reversed")) {
    expect(event.status, `${event.id} must remain active`).toBe("active");
  }
});

test("Leaderboard staging smoke wiring is isolated, authenticated, reversible, and append-only", () => {
  const packageJson = JSON.parse(read("package.json"));
  const runner = read("scripts/run-leaderboard-staging-qa.mjs");
  const config = read("qa/leaderboard-staging.playwright.config.mjs");
  const smoke = read("qa/leaderboard.staging.spec.mjs");
  const cleanup = read("qa/helpers/leaderboard-staging-cleanup.mjs");
  const http = read("qa/helpers/leaderboard-staging-http.mjs");
  const runbook = read("docs/STAGING_RUNBOOK.md");

  expect(packageJson.scripts["qa:staging:leaderboard:required"]).toBe("node scripts/run-leaderboard-staging-qa.mjs --required");
  expect(config).toContain("leaderboard\\.staging\\.spec\\.mjs");
  expect(config).not.toContain("footballscience.xyz");
  expect(config).toContain('timezoneId: "Europe/Stockholm"');
  expect(config).toContain('trace: "off"');
  expect(config).toContain('video: "off"');
  expect(config).toContain('screenshot: "off"');
  expect(config).not.toContain("recordHar");
  expect(smoke.split("\n").length).toBeLessThan(500);
  expect(cleanup.split("\n").length).toBeLessThan(500);
  expect(http.split("\n").length).toBeLessThan(500);
  expect(smoke).toContain("/api/platform-identity");
  expect(smoke).toContain("/api/client-config");
  expect(smoke).toContain("fresh manager membership covering the exact target team");
  expect(smoke).toContain("server-authoritative roster");
  expect(smoke).toContain("only the server-authoritative target-team roster");
  expect(smoke).toContain("LEADERBOARD_STAGING_QA_TEAM_ID");
  expect(smoke).toContain("Do not start the mutable smoke within 15 minutes of a UTC month boundary");
  expect(smoke).toContain("Idempotent award retry");
  expect(smoke).toContain("Idempotent reversal retry");
  expect(cleanup).toContain("QA staging smoke reversal");
  expect(smoke).toContain("leaderboardWorkerCleanup");
  expect(smoke).toContain("sweepStaleLeaderboardQaEvents");
  expect(smoke).toContain("cleanupState.mutationMayBeInFlight = true");
  expect(smoke).toContain("installUiCommandCapture");
  expect(smoke).toContain("route.continue()");
  expect(smoke).toContain('[data-leaderboard-award-form] button[type="submit"]');
  expect(smoke).toContain('[data-leaderboard-reverse-form] button[type="submit"]');
  expect(smoke).toContain("captured.award");
  expect(smoke).toContain("captured.reverse");
  const cleanupArmIndex = smoke.indexOf("cleanupState.awardBody = body");
  expect(cleanupArmIndex).toBeGreaterThan(0);
  expect(smoke.indexOf("return route.continue();", cleanupArmIndex)).toBeGreaterThan(cleanupArmIndex);
  expect(smoke).not.toContain("request.headers");
  expect(smoke).not.toContain("route.continue({");
  expect(smoke).toContain("dateInput.fill(occurredOn)");
  expect(smoke).toContain("toHaveValue(occurredOn)");
  expect(smoke).toContain("finally");
  expect(smoke).not.toContain("service_role");
  expect(smoke).not.toContain(".delete(");
  expect(smoke).not.toContain("page.request");
  expect(http).toContain("globalThis.fetch");
  expect(runner).toContain("STAGING_SUPABASE_PROJECT_REF must not equal SUPABASE_PROJECT_REF");
  expect(runner).not.toContain("...process.env");
  expect(runbook).toContain("one mutable Leaderboard staging smoke at a time");
  expect(runbook).toContain("30 minutes");

  for (const name of [
    "STAGING_QA_BASE_URL",
    "STAGING_SUPABASE_PROJECT_REF",
    "SUPABASE_PROJECT_REF",
    "LEADERBOARD_STAGING_QA_TEAM_ID",
    "LEADERBOARD_STAGING_QA_USERNAME",
    "LEADERBOARD_STAGING_QA_PASSWORD",
  ]) expect(runbook).toContain(name);
});
