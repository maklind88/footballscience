import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as leaderboardModule from "../src/modules/leaderboard/index.mjs";
import { createLeaderboardActions } from "../src/modules/leaderboard/leaderboard-actions.mjs";
import { renderLeaderboardAwardSheet } from "../src/modules/leaderboard/leaderboard-award-renderer.mjs";
import { renderLeaderboardPodium } from "../src/modules/leaderboard/leaderboard-components.mjs";
import { renderLeaderboardWorkspace } from "../src/modules/leaderboard/leaderboard-renderer.mjs";
import {
  getLeaderboardDraftAwards,
  getLeaderboardRankedStandings,
  getLeaderboardSummary,
  getLeaderboardZeroPointPlayers,
} from "../src/modules/leaderboard/leaderboard-selectors.mjs";
import { createLeaderboardState, createLeaderboardStore } from "../src/modules/leaderboard/leaderboard-state.mjs";
import { createLeaderboardApiService } from "../src/modules/leaderboard/services/leaderboard-api-service.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleDir = path.join(rootDir, "src/modules/leaderboard");
const fixedNow = new Date("2026-08-24T12:00:00Z");
const teamAId = "44444444-4444-4444-8444-444444444444";
const teamBId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function makeSquad() {
  return {
    players: [
      { id: "p1", name: "Alex Morgan", number: 13, position: "Forward", photoUrl: "https://example.com/alex.jpg" },
      { id: "p2", name: "Sam Coffey", number: 17, position: "Midfielder" },
      { id: "p3", name: "Emily Fox", number: 2, position: "Defender" },
      { id: "p4", name: "Casey Murphy", number: 1, position: "Goalkeeper" },
      { id: "guest", name: "Guest Player", countsInSquad: false },
      { id: "old", name: "Former Player", archived: true },
    ],
  };
}

function makePayload(overrides = {}) {
  return {
    ok: true,
    schema: "football-science-leaderboard-v1",
    month: "2026-08",
    competition: { id: "competition-aug", status: "live" },
    summary: {},
    roster: makeSquad().players.slice(0, 4).map((player) => ({
      playerId: player.id,
      displayName: player.name,
      number: player.number,
      position: player.position,
    })),
    standings: [
      { playerId: "p1", playerName: "Wrong API Name", points: 9, awardCount: 3, lastScoredOn: "2026-08-24" },
      { playerId: "p2", points: 9, awardCount: 2, lastScoredOn: "2026-08-23" },
      { playerId: "p3", points: 3, awardCount: 1, lastScoredOn: "2026-08-20" },
    ],
    events: [
      { id: "e1", occurredOn: "2026-08-24", title: "5v5 tournament", createdByName: "Coach", createdAt: "2026-08-24T15:00:00Z", awards: [{ playerId: "p1", points: 3, placement: 1 }, { playerId: "p2", points: 3, placement: 1 }] },
    ],
    ...overrides,
  };
}

function makeContext(overrides = {}) {
  return {
    teamName: "North Carolina Courage",
    team: { name: "North Carolina Courage" },
    getPlayerProfilesState: () => makeSquad(),
    getNow: () => fixedNow,
    canEdit: () => true,
    ...overrides,
  };
}

test("leaderboard module stays isolated, modular and free of local persistence", () => {
  const requiredFiles = [
    "src/modules/leaderboard/index.mjs",
    "src/modules/leaderboard/leaderboard-controller.mjs",
    "src/modules/leaderboard/leaderboard-actions.mjs",
    "src/modules/leaderboard/leaderboard-adapter.mjs",
    "src/modules/leaderboard/leaderboard-award-renderer.mjs",
    "src/modules/leaderboard/leaderboard-components.mjs",
    "src/modules/leaderboard/leaderboard-constants.mjs",
    "src/modules/leaderboard/leaderboard-helpers.mjs",
    "src/modules/leaderboard/leaderboard-renderer.mjs",
    "src/modules/leaderboard/leaderboard-selectors.mjs",
    "src/modules/leaderboard/leaderboard-state.mjs",
    "src/modules/leaderboard/leaderboard-ui-helpers.mjs",
    "src/modules/leaderboard/leaderboard.css",
    "src/modules/leaderboard/services/leaderboard-api-service.mjs",
  ];
  requiredFiles.forEach((relativePath) => expect(fs.existsSync(path.join(rootDir, relativePath)), relativePath).toBe(true));

  const sourceFiles = fs.readdirSync(moduleDir, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory()
      ? fs.readdirSync(path.join(moduleDir, entry.name)).map((file) => path.join(moduleDir, entry.name, file))
      : [path.join(moduleDir, entry.name)]);
  sourceFiles.forEach((filePath) => {
    const source = fs.readFileSync(filePath, "utf8");
    expect(source.split("\n").length, path.relative(rootDir, filePath)).toBeLessThan(500);
    expect(source, path.basename(filePath)).not.toMatch(/localStorage|sessionStorage|indexedDB|supabase|service_role/i);
    expect(source, path.basename(filePath)).not.toMatch(/mock leaderboard|fake points|seed standings/i);
    if (!filePath.endsWith("leaderboard-api-service.mjs")) expect(source, path.basename(filePath)).not.toMatch(/\bfetch\s*\(/);
  });
  expect(read("src/modules/leaderboard/index.mjs")).not.toContain("leaderboard-module-styles");
  expect(read("src/modules/leaderboard/index.mjs").split("\n").length).toBeLessThan(250);
  expect(read("src/modules/leaderboard/leaderboard-adapter.mjs")).not.toContain("getPlayerProfilesState");
});

test("Home loads the summary entry first and defers full dialog modules until interaction", () => {
  const surfaceRuntime = read("src/core/leaderboard-surface-runtime.mjs");
  const homeSurface = read("src/modules/leaderboard/leaderboard-home-surface.mjs");

  expect(surfaceRuntime).toContain("../modules/leaderboard/leaderboard-home-surface.mjs");
  expect(surfaceRuntime).not.toContain("../modules/leaderboard/index.mjs");
  expect(homeSurface).toContain('import("./leaderboard-controller.mjs")');
  expect(homeSurface).toContain('import("./leaderboard-dialog-renderer.mjs")');
  expect(homeSurface).not.toContain('from "./leaderboard-controller.mjs"');
  expect(homeSurface).not.toContain('from "./leaderboard-dialog-renderer.mjs"');
});

test("leaderboard lazy module exports the platform event contract", () => {
  for (const exportName of ["render", "handleClick", "handleInput", "handleChange", "handleSubmit"]) {
    expect(leaderboardModule[exportName], exportName).toEqual(expect.any(Function));
  }
});

test("runtime resets before paint when the team or user scope changes", async () => {
  const root = { innerHTML: "", contains: () => false, querySelector: () => null };
  const doc = { activeElement: null, addEventListener() {} };
  const win = { document: doc, requestAnimationFrame(callback) { callback(); } };
  const fetchedUrls = [];
  const fetchFor = (payload) => async (url) => {
    fetchedUrls.push(String(url));
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
  };

  leaderboardModule.resetLeaderboardRuntime();
  const firstRuntime = leaderboardModule.render(makeContext({
    ui: { leaderboardWorkspace: root },
    win,
    team: { id: teamAId, name: "Team A" },
    teamName: "Team A",
    currentUser: { id: "coach-a" },
    fetchImpl: fetchFor(makePayload({ competition: { id: "competition-a", status: "live" } })),
  }));
  await firstRuntime.loadPromise;
  expect(firstRuntime.store.getState().data.competition.id).toBe("competition-a");
  expect(root.innerHTML).toContain("Team A Leaderboard");

  const secondRuntime = leaderboardModule.render(makeContext({
    ui: { leaderboardWorkspace: root },
    win,
    team: { id: teamBId, name: "Team B" },
    teamName: "Team B",
    currentUser: { id: "coach-b" },
    fetchImpl: fetchFor(makePayload({ competition: { id: "competition-b", status: "live" } })),
  }));
  expect(secondRuntime).not.toBe(firstRuntime);
  expect(secondRuntime.store.getState().data).toBeNull();
  expect(root.innerHTML).toContain("Team B Leaderboard");
  expect(root.innerHTML).not.toContain("Team A Leaderboard");
  await secondRuntime.loadPromise;
  expect(secondRuntime.store.getState().data.competition.id).toBe("competition-b");
  expect(fetchedUrls).toContain(`/api/leaderboard?month=2026-08&teamId=${teamAId}`);
  expect(fetchedUrls).toContain(`/api/leaderboard?month=2026-08&teamId=${teamBId}`);
  leaderboardModule.resetLeaderboardRuntime();
});

test("API service uses authenticated GET and exact award/reversal actions", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return { ok: true, status: 200, text: async () => JSON.stringify(makePayload()) };
  };
  const api = createLeaderboardApiService({ teamId: teamBId, getAuthToken: async () => "token-123", fetchImpl });
  await api.loadMonth("2026-08");
  await api.award({ occurredOn: "2026-08-24", title: "Rondo", note: "", idempotencyKey: "award-key", awards: [{ playerId: "p1", points: 3, placement: 1 }] });
  await api.reverseEvent({ eventId: "e1", reason: "Correction", idempotencyKey: "reverse-key" });

  expect(calls[0].url).toBe(`/api/leaderboard?month=2026-08&teamId=${teamBId}`);
  expect(calls[0].options.method).toBe("GET");
  expect(calls.every((call) => call.options.headers.Authorization === "Bearer token-123")).toBe(true);
  expect(JSON.parse(calls[1].options.body)).toEqual({ action: "award", teamId: teamBId, occurredOn: "2026-08-24", title: "Rondo", note: "", idempotencyKey: "award-key", awards: [{ playerId: "p1", points: 3, placement: 1 }] });
  expect(JSON.parse(calls[2].options.body)).toEqual({ action: "reverse-event", teamId: teamBId, eventId: "e1", reason: "Correction", idempotencyKey: "reverse-key" });
});

test("selectors keep Squad identity authoritative, calculate ties and separate zero-point players", () => {
  const payload = makePayload();
  const context = makeContext();
  const standings = getLeaderboardRankedStandings(payload, context);
  expect(standings.map((row) => [row.name, row.rank, row.points])).toEqual([
    ["Alex Morgan", 1, 9],
    ["Sam Coffey", 1, 9],
    ["Emily Fox", 3, 3],
  ]);
  expect(standings[0].photoUrl).toBe("");
  expect(getLeaderboardZeroPointPlayers(payload, context).map((row) => row.name)).toEqual(["Casey Murphy"]);
  expect(getLeaderboardSummary(payload, context)).toEqual({ eventCount: 1, totalPoints: 21, scoredPlayerCount: 3, leaderGap: 0 });
});

test("active Team B uses only its server roster for zero rows and award selection", () => {
  const payload = makePayload({
    roster: [{ playerId: "b-player", displayName: "Team B Player", number: "19", position: "Forward" }],
    standings: [],
    events: [],
  });
  const clientTeamAContext = makeContext({
    teamId: teamBId,
    team: { id: teamBId, name: "Team B" },
    teamName: "Team B",
    getPlayerProfilesState: () => ({ players: [{ id: "a-player", name: "Team A Player" }] }),
  });
  expect(getLeaderboardZeroPointPlayers(payload, clientTeamAContext).map((row) => row.name)).toEqual(["Team B Player"]);

  const state = { ...createLeaderboardState(fixedNow), status: "ready", data: payload };
  state.ui = { ...state.ui, awardOpen: true };
  const markup = renderLeaderboardWorkspace(state, clientTeamAContext);
  expect(markup).toContain("Team B Player");
  expect(markup).not.toContain("Team A Player");

  const store = createLeaderboardStore(state);
  const actions = createLeaderboardActions({ store, api: {}, context: clientTeamAContext });
  store.setState({ draft: { occurredOn: "2026-08-24", title: "Team B drill", assignments: { "a-player": { placement: 1 } } } });
  expect(actions.validateAward().error).toBe("One or more selected players are no longer in the active squad.");
  store.setState({ draft: { assignments: { "b-player": { placement: 1 } } } });
  expect(actions.validateAward()).toMatchObject({ awards: [{ playerId: "b-player", points: 3, placement: 1 }] });
});

test("selectors tolerate current database snapshot aliases without inventing points", () => {
  const payload = makePayload({
    standings: [{ playerId: "former-player", displayName: "Former Captain", points: 4, rank: 1, awardCount: 1, lastAwardOn: "2026-08-22" }],
    events: [{ id: "backend-event", occurredOn: "2026-08-22", title: "Pressing game", points: 4, createdAt: "2026-08-22T15:00:00Z", awards: [] }],
  });
  const context = makeContext({ getPlayerProfilesState: () => ({ players: [] }) });
  const [standing] = getLeaderboardRankedStandings(payload, context);
  expect(standing).toMatchObject({ name: "Former Captain", points: 4, lastScoredOn: "2026-08-22" });

  const state = { ...createLeaderboardState(fixedNow), status: "ready", data: payload };
  state.ui = { ...state.ui, tab: "activity" };
  const markup = renderLeaderboardWorkspace(state, context);
  expect(markup).toContain("Team award");
  expect(markup).toContain("+4 pts");
  expect(markup).not.toContain("+0 pts");
});

test("award draft supports tied placements and same-points teams", () => {
  const placements = getLeaderboardDraftAwards({
    mode: "placements",
    assignments: { p1: { placement: 1 }, p2: { placement: 1 }, p3: { placement: 3 } },
  });
  expect(placements).toEqual([
    { playerId: "p1", points: 3, placement: 1 },
    { playerId: "p2", points: 3, placement: 1 },
    { playerId: "p3", points: 1, placement: 3 },
  ]);
  expect(getLeaderboardDraftAwards({
    mode: "same",
    samePoints: 3,
    customPoints: "5",
    assignments: { p1: { selected: true }, p2: { selected: true }, p3: { selected: false } },
  })).toEqual([
    { playerId: "p1", points: 5, placement: null },
    { playerId: "p2", points: 5, placement: null },
  ]);
});

test("award validation rejects out-of-range points and players outside the active squad", () => {
  const store = createLeaderboardStore(createLeaderboardState(fixedNow));
  const actions = createLeaderboardActions({ store, api: {}, context: makeContext() });
  store.setState({ data: makePayload(), draft: {
    occurredOn: "2026-08-24",
    title: "Too many points",
    mode: "same",
    customPoints: "100",
    assignments: { p1: { selected: true } },
  } });
  expect(actions.validateAward().error).toBe("Points must be between 1 and 99.");

  store.setState({ draft: { customPoints: "5", assignments: { guest: { selected: true } } } });
  expect(actions.validateAward().error).toBe("One or more selected players are no longer in the active squad.");
});

test("workspace renderer covers premium standings, activity, empty and read-only states", () => {
  const readyState = { ...createLeaderboardState(fixedNow), status: "ready", data: makePayload() };
  const standingsMarkup = renderLeaderboardWorkspace(readyState, makeContext());
  expect(standingsMarkup).toContain("North Carolina Courage Leaderboard");
  expect(standingsMarkup).toContain("leaderboard-podium");
  expect(standingsMarkup).not.toContain("leaderboard-metrics");
  expect(standingsMarkup).not.toContain("Monthly competition summary");
  expect(standingsMarkup).toContain("Point distribution");
  expect(standingsMarkup).toContain("=1");
  expect(standingsMarkup).toContain('aria-label="Joint rank 1"');
  expect(standingsMarkup).toContain("leaderboard-rank-tie");
  expect(standingsMarkup).toContain("No points yet");
  expect(standingsMarkup).toContain("Award Points");
  expect(standingsMarkup).toContain("https://example.com/alex.jpg");
  const tableMarkup = standingsMarkup.match(/<table class="leaderboard-table">[\s\S]*?<\/table>/)?.[0] || "";
  expect(tableMarkup).toContain("https://example.com/alex.jpg");

  const activityMarkup = renderLeaderboardWorkspace({ ...readyState, ui: { ...readyState.ui, tab: "activity" } }, makeContext());
  expect(activityMarkup).toContain("5v5 tournament");
  expect(activityMarkup).toContain("Reverse award");

  const readOnlyMarkup = renderLeaderboardWorkspace(readyState, makeContext({ canEdit: () => false }));
  expect(readOnlyMarkup).toContain("Read-only");
  expect(readOnlyMarkup).not.toContain("leaderboard-award-trigger");
  expect(readOnlyMarkup).not.toContain("Reverse award");

  const noSquadMarkup = renderLeaderboardWorkspace({ ...readyState, data: makePayload({ roster: [], standings: [], events: [] }) }, makeContext());
  expect(noSquadMarkup).toContain("Leaderboard needs your squad");
  expect(noSquadMarkup).toContain('data-open-workspace="player-profiles"');
});

test("Home podium uses rank-aware trophies and omits shirt numbers", () => {
  const ranked = [
    { playerId: "p1", name: "Alex Morgan", number: 13, points: 9, rank: 1 },
    { playerId: "p2", name: "Sam Coffey", number: 17, points: 6, rank: 2 },
    { playerId: "p3", name: "Emily Fox", number: 2, points: 3, rank: 3 },
  ];
  const podium = renderLeaderboardPodium(ranked, makeContext(), { variant: "home" });
  expect(podium).toContain("leaderboard-podium-trophy is-rank-1");
  expect(podium).toContain("leaderboard-podium-trophy is-rank-2");
  expect(podium).toContain("leaderboard-podium-trophy is-rank-3");
  expect(podium).not.toContain("#13");
  expect(podium).not.toContain("#17");
  expect(podium).not.toContain("#2");

  const tied = renderLeaderboardPodium(ranked.map((row) => ({ ...row, rank: 1 })), makeContext(), { variant: "home" });
  expect(tied.match(/leaderboard-podium-trophy is-rank-1/g)).toHaveLength(3);
  expect(tied.match(/<strong>1<\/strong>/g)).toHaveLength(3);
});

test("completed months are visibly read-only even for coaches with edit permission", async () => {
  const historicalPayload = makePayload({ month: "2026-07" });
  const historicalState = { ...createLeaderboardState(fixedNow), month: "2026-07", status: "ready", data: historicalPayload };
  historicalState.ui = { ...historicalState.ui, tab: "activity" };
  const markup = renderLeaderboardWorkspace(historicalState, makeContext());
  expect(markup).toContain("Completed");
  expect(markup).toContain("Completed months are historical records");
  expect(markup).not.toContain("leaderboard-award-trigger");
  expect(markup).not.toContain("Reverse award");

  const calls = [];
  const store = createLeaderboardStore(historicalState);
  const actions = createLeaderboardActions({
    store,
    api: {
      award: async (payload) => calls.push(["award", payload]),
      reverseEvent: async (payload) => calls.push(["reverse", payload]),
    },
    context: makeContext(),
  });
  store.setState({ draft: { occurredOn: "2026-07-24", title: "Historical", assignments: { p1: { placement: 1 } } } });
  expect(actions.validateAward()).toEqual({ error: "Completed Leaderboard months are read-only." });
  await actions.reverseEvent({ eventId: "e1", reason: "Correction", idempotencyKey: "historical-reverse-key" });
  expect(store.getState().ui.draftError).toBe("Completed Leaderboard months are read-only.");
  expect(calls).toEqual([]);
});

test("pending reversal dialog cannot be dismissed and keeps retry state", () => {
  const state = { ...createLeaderboardState(fixedNow), status: "ready", data: makePayload() };
  state.ui = {
    ...state.ui,
    reverseEventId: "e1",
    reverseReason: "Incorrect placement",
    reverseIdempotencyKey: "reverse-stable-key",
    pendingAction: "reverse",
  };
  const markup = renderLeaderboardWorkspace(state, makeContext());
  expect(markup).toContain("Reversing…");
  expect(markup).toContain('data-leaderboard-close-reverse aria-label="Close correction" disabled');
  expect(markup).not.toContain('<div class="leaderboard-layer" data-leaderboard-close-reverse>');
  const controller = read("src/modules/leaderboard/leaderboard-controller.mjs");
  expect(controller).toContain('state.ui.pendingAction === "reverse"');
  expect(state.ui).toMatchObject({ reverseEventId: "e1", reverseReason: "Incorrect placement", reverseIdempotencyKey: "reverse-stable-key" });
});

test("award sheet renders accessible placement and same-points mobile flows", () => {
  const state = createLeaderboardState(fixedNow);
  state.status = "ready";
  state.ui.awardOpen = true;
  state.draft.title = "Finishing tournament";
  state.draft.assignments = { p1: { placement: 1 }, p2: { placement: 1 } };
  const players = makeSquad().players.slice(0, 4).map((player) => ({ ...player, photoUrl: player.photoUrl || "" }));
  const placementMarkup = renderLeaderboardAwardSheet({ state, players, bounds: { min: "2026-08-01", max: "2026-08-24" }, canEdit: true });
  expect(placementMarkup).toContain('role="dialog"');
  expect(placementMarkup).toContain("Multiple players can share a placement");
  expect(placementMarkup).toContain("6</strong> <span>points total");
  expect(placementMarkup.match(/data-leaderboard-assign-placement="1"/g)).toHaveLength(4);

  state.draft.mode = "same";
  state.draft.customPoints = "5";
  state.draft.assignments = { p1: { selected: true }, p2: { selected: true } };
  const sameMarkup = renderLeaderboardAwardSheet({ state, players, bounds: { min: "2026-08-01", max: "2026-08-24" }, canEdit: true });
  expect(sameMarkup).toContain("Winning players");
  expect(sameMarkup).toContain("10</strong> <span>points total");
  expect(sameMarkup).toContain('aria-label="Custom points per player"');
});

test("actions preserve failed drafts, prevent duplicate submit and expose reversal undo", async () => {
  const store = createLeaderboardStore(createLeaderboardState(fixedNow));
  const calls = [];
  let resolveAward;
  const api = {
    loadMonth: async () => makePayload(),
    award: (payload) => {
      calls.push(payload);
      return new Promise((resolve) => { resolveAward = resolve; });
    },
    reverseEvent: async (payload) => makePayload({ events: [{ ...makePayload().events[0], reversedAt: "2026-08-24T16:00:00Z", reverseReason: payload.reason }] }),
  };
  const actions = createLeaderboardActions({ store, api, context: makeContext() });
  await actions.loadMonth("2026-08");
  store.setState({ draft: { occurredOn: "2026-08-24", title: "Rondo winners", note: "Strong detail", assignments: { p1: { placement: 1 }, p2: { placement: 2 } }, idempotencyKey: "stable-award-key" } });
  const firstSubmit = actions.awardPoints();
  const duplicateSubmit = actions.awardPoints();
  expect(calls).toHaveLength(1);
  expect(await duplicateSubmit).toBeNull();
  expect(calls[0]).toEqual({ occurredOn: "2026-08-24", title: "Rondo winners", note: "Strong detail", idempotencyKey: "stable-award-key", awards: [{ playerId: "p1", points: 3, placement: 1 }, { playerId: "p2", points: 2, placement: 2 }] });
  resolveAward(makePayload({ events: [...makePayload().events, { id: "e2", occurredOn: "2026-08-24", title: "Rondo winners", awards: calls[0].awards }] }));
  await firstSubmit;
  expect(store.getState().ui.pendingAction).toBe("");
  expect(store.getState().ui.notice).toMatchObject({ tone: "success", undoEventId: "e2" });

  await actions.reverseEvent({ eventId: "e2", reason: "Undo point award", idempotencyKey: "undo-key" });
  expect(store.getState().ui.notice.message).toBe("Point award reversed.");
});

test("failed award keeps the exact coach draft and idempotency key for retry", async () => {
  const store = createLeaderboardStore(createLeaderboardState(fixedNow));
  const api = { loadMonth: async () => makePayload(), award: async () => { throw new Error("Network unavailable"); }, reverseEvent: async () => ({}) };
  const actions = createLeaderboardActions({ store, api, context: makeContext() });
  await actions.loadMonth("2026-08");
  store.setState({ draft: { occurredOn: "2026-08-24", title: "Keep this draft", assignments: { p1: { placement: 1 } }, idempotencyKey: "retry-the-same-key" } });
  await actions.awardPoints();
  expect(store.getState().draft.title).toBe("Keep this draft");
  expect(store.getState().draft.assignments).toEqual({ p1: { placement: 1 } });
  expect(store.getState().draft.idempotencyKey).toBe("retry-the-same-key");
  expect(store.getState().ui.draftError).toBe("Network unavailable");
});

test("failed undo preserves its reversal idempotency key for a safe retry", async () => {
  const store = createLeaderboardStore(createLeaderboardState(fixedNow));
  const calls = [];
  const api = {
    reverseEvent: async (payload) => {
      calls.push(payload);
      if (calls.length === 1) throw new Error("Response lost");
      return makePayload({ events: [{ ...makePayload().events[0], reversedAt: "2026-08-24T16:00:00Z" }] });
    },
  };
  const actions = createLeaderboardActions({ store, api, context: makeContext() });
  await actions.reverseEvent({ eventId: "e1", reason: "Undo point award", idempotencyKey: "stable-undo-key" });
  const retryNotice = store.getState().ui.notice;
  expect(retryNotice).toMatchObject({ undoEventId: "e1", idempotencyKey: "stable-undo-key" });
  await actions.reverseEvent({ eventId: retryNotice.undoEventId, reason: "Undo point award", idempotencyKey: retryNotice.idempotencyKey });
  expect(calls.map((call) => call.idempotencyKey)).toEqual(["stable-undo-key", "stable-undo-key"]);
});

test("CSS contains mobile card, bottom-sheet, safe-area, dark and reduced-motion contracts", () => {
  const css = read("src/modules/leaderboard/leaderboard.css");
  expect(css).toContain("@media (max-width: 760px)");
  expect(css).toContain("border-radius: 24px 24px 0 0");
  expect(css).toContain("env(safe-area-inset-bottom)");
  expect(css).toContain("body.is-dark-mode .leaderboard-shell");
  expect(css).toContain("body.is-dark-mode .leaderboard-table tbody tr");
  expect(css).toContain("body.is-dark-mode .leaderboard-empty-state");
  expect(css).toContain("body.is-dark-mode .leaderboard-readonly");
  expect(css).toContain("body.is-dark-mode .leaderboard-zero-list button");
  expect(css).toContain("prefers-reduced-motion");
});
