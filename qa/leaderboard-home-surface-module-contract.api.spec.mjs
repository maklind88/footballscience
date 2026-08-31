import { expect, test } from "@playwright/test";
import { mountLeaderboardHome, resetLeaderboardRuntime } from "../src/modules/leaderboard/index.mjs";
import {
  ensureLeaderboardRuntime,
  getActiveLeaderboardRuntime,
  initializeLeaderboardRuntime,
} from "../src/modules/leaderboard/leaderboard-runtime.mjs";
import { renderLeaderboardHomeSummary } from "../src/modules/leaderboard/leaderboard-summary-renderer.mjs";
import { renderLeaderboardAwardSheet } from "../src/modules/leaderboard/leaderboard-award-renderer.mjs";
import { renderLeaderboardWorkspace } from "../src/modules/leaderboard/leaderboard-renderer.mjs";
import { createLeaderboardState } from "../src/modules/leaderboard/leaderboard-state.mjs";

const fixedNow = new Date("2026-08-25T12:00:00Z");
const teamAId = "44444444-4444-4444-8444-444444444444";
const teamBId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function payload(month, name, id) {
  return {
    ok: true,
    schema: "footballscience-leaderboard-v1",
    month,
    competition: { id: `competition-${month}`, status: month === "2026-08" ? "live" : "completed" },
    summary: { eventCount: 1, totalPoints: 3, scoredPlayerCount: 1, leaderGap: null },
    roster: [{ playerId: id, displayName: name, number: "9", position: "Forward" }],
    standings: [{ playerId: id, displayName: name, points: 3, rank: 1, awardCount: 1 }],
    events: [],
  };
}

function response(body) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
}

function context(teamId, name, fetchImpl) {
  return {
    teamId,
    team: { id: teamId, name },
    teamName: name,
    currentUser: { id: `coach-${teamId}` },
    getNow: () => fixedNow,
    getAuthToken: () => "token",
    canEdit: () => true,
    fetchImpl,
  };
}

test.afterEach(() => resetLeaderboardRuntime());

test("Home mount is a public module-owned lifecycle contract", () => {
  expect(mountLeaderboardHome).toEqual(expect.any(Function));
});

test("normal unmount protects a pending reversal while force unmount disposes the scoped runtime", async () => {
  let signalMutationStarted;
  let mutationAborted = false;
  const mutationStarted = new Promise((resolve) => { signalMutationStarted = resolve; });
  const fetchImpl = async (_url, options = {}) => {
    if (options.method !== "POST") return response(payload("2026-08", "Team A Player", "a-player"));
    signalMutationStarted();
    return new Promise((resolve, reject) => {
      const rejectAbort = () => {
        mutationAborted = true;
        const error = new Error("Aborted");
        error.name = "AbortError";
        reject(error);
      };
      if (options.signal?.aborted) rejectAbort();
      else options.signal?.addEventListener("abort", rejectAbort, { once: true });
    });
  };
  const createRoot = () => ({
    innerHTML: "",
    addEventListener() {},
    removeEventListener() {},
    contains: () => false,
    querySelector: () => null,
  });
  const summaryRoot = createRoot();
  const handle = mountLeaderboardHome({
    ...context(teamAId, "Team A", fetchImpl),
    ui: { leaderboardSummary: summaryRoot, leaderboardDialogHost: createRoot() },
  });
  const runtime = getActiveLeaderboardRuntime();
  await runtime.loadPromise;
  const pendingReversal = runtime.actions.reverseEvent({ eventId: "event-1", reason: "Correction", idempotencyKey: "scope-change-reverse" });
  await mutationStarted;

  expect(handle.unmount()).toBe(false);
  expect(getActiveLeaderboardRuntime()).toBe(runtime);
  expect(handle.unmount({ force: true })).toBe(true);
  await pendingReversal;
  expect(mutationAborted).toBe(true);
  expect(getActiveLeaderboardRuntime()).toBeNull();
  expect(summaryRoot.innerHTML).toBe("");
});

test("pending award is non-dismissible and force unmount aborts exactly one write", async () => {
  let signalMutationStarted;
  let mutationAborted = false;
  let mutationCount = 0;
  const mutationStarted = new Promise((resolve) => { signalMutationStarted = resolve; });
  const fetchImpl = async (_url, options = {}) => {
    if (options.method !== "POST") return response(payload("2026-08", "Team A Player", "a-player"));
    mutationCount += 1;
    signalMutationStarted();
    return new Promise((resolve, reject) => {
      const rejectAbort = () => {
        mutationAborted = true;
        const error = new Error("Aborted");
        error.name = "AbortError";
        reject(error);
      };
      if (options.signal?.aborted) rejectAbort();
      else options.signal?.addEventListener("abort", rejectAbort, { once: true });
    });
  };
  const createRoot = () => ({
    innerHTML: "",
    addEventListener() {},
    removeEventListener() {},
    contains: () => false,
    querySelector: () => null,
  });
  const handle = mountLeaderboardHome({
    ...context(teamAId, "Team A", fetchImpl),
    ui: { leaderboardSummary: createRoot(), leaderboardDialogHost: createRoot() },
  });
  const runtime = getActiveLeaderboardRuntime();
  await runtime.loadPromise;
  runtime.store.setState({
    draft: { title: "Finishing game", assignments: { "a-player": { placement: 1 } } },
    ui: { awardOpen: true },
  });
  const pendingAward = runtime.actions.awardPoints();
  await mutationStarted;

  expect(runtime.store.getState().ui.pendingAction).toBe("award");
  expect(handle.unmount()).toBe(false);
  expect(mutationCount).toBe(1);
  expect(handle.unmount({ force: true })).toBe(true);
  await pendingAward;
  expect(mutationAborted).toBe(true);
  expect(mutationCount).toBe(1);
  expect(getActiveLeaderboardRuntime()).toBeNull();
});

test("pending award markup disables dismissal and hides the underlying workspace", () => {
  const state = createLeaderboardState(fixedNow);
  state.status = "ready";
  state.data = payload("2026-08", "Team A Player", "a-player");
  state.ui.awardOpen = true;
  state.ui.pendingAction = "award";
  state.draft.title = "Finishing game";
  state.draft.assignments = { "a-player": { placement: 1 } };
  const awardMarkup = renderLeaderboardAwardSheet({
    state,
    players: [{ id: "a-player", name: "Team A Player" }],
    bounds: { min: "2026-08-01", max: "2026-08-25" },
    canEdit: true,
  });
  const layer = awardMarkup.match(/<div class="leaderboard-layer"[^>]*>/)?.[0] || "";

  expect(layer).not.toContain("data-leaderboard-close-award");
  expect(awardMarkup).toContain('data-leaderboard-award-form novalidate aria-busy="true"');
  expect(awardMarkup).toContain('leaderboard-award-fieldset" disabled');
  expect(awardMarkup).toContain('aria-label="Close award points" disabled');
  expect(awardMarkup).toContain('data-leaderboard-close-award disabled>Cancel');
  const workspaceMarkup = renderLeaderboardWorkspace(state, context(teamAId, "Team A", async () => response(state.data)));
  expect(workspaceMarkup).toContain('class="leaderboard-command-bar" inert aria-hidden="true"');
  expect(workspaceMarkup.match(/aria-modal="true"/g)).toHaveLength(1);
});

test("Home summary always selects the current-month cache while the full view is historical", () => {
  const state = createLeaderboardState(fixedNow);
  const current = payload("2026-08", "Current Captain", "current-player");
  const historical = payload("2026-07", "Historical Captain", "historical-player");
  state.month = "2026-07";
  state.status = "ready";
  state.data = historical;
  state.monthCache = {
    "2026-08": { status: "ready", data: current, error: "" },
    "2026-07": { status: "ready", data: historical, error: "" },
  };
  const markup = renderLeaderboardHomeSummary(state, context(teamAId, "Team A", async () => response(current)));
  expect(markup).toContain("Current Captain");
  expect(markup).toContain("NCC Leaderboard");
  expect(markup).toContain('class="leaderboard-home-visual" aria-hidden="true"');
  expect(markup).not.toContain("Team standings");
  expect(markup).not.toContain("Historical Captain");
});

test("scope replacement aborts and ignores the previous team's stale read", async () => {
  let teamAResolve;
  let teamAAborted = false;
  const teamAFetch = (_url, options = {}) => new Promise((resolve, reject) => {
    teamAResolve = () => resolve(response(payload("2026-08", "Team A Player", "a-player")));
    const rejectAbort = () => {
      teamAAborted = true;
      const error = new Error("Aborted");
      error.name = "AbortError";
      reject(error);
    };
    if (options.signal?.aborted) rejectAbort();
    else options.signal?.addEventListener("abort", rejectAbort, { once: true });
  });
  const first = ensureLeaderboardRuntime(context(teamAId, "Team A", teamAFetch));
  const staleLoad = initializeLeaderboardRuntime(first);

  const second = ensureLeaderboardRuntime(context(teamBId, "Team B", async () => response(payload("2026-08", "Team B Player", "b-player"))));
  await initializeLeaderboardRuntime(second);
  teamAResolve?.();
  await staleLoad;

  expect(teamAAborted).toBe(true);
  expect(first.disposed).toBe(true);
  expect(getActiveLeaderboardRuntime()).toBe(second);
  expect(second.store.getState().data.roster[0].displayName).toBe("Team B Player");
  expect(JSON.stringify(second.store.getState())).not.toContain("Team A Player");
});
