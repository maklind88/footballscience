import { expect, test } from "@playwright/test";
import { createLeaderboardSurfaceRuntime } from "../src/core/leaderboard-surface-runtime.mjs";

function createRoot() {
  return { hidden: false, innerHTML: "" };
}

function createHarness(overrides = {}) {
  let team = { id: "team-a", name: "Team A", shortName: "TA", logoUrl: "/team-a.png" };
  let user = { id: "coach-1", role: "coach", teamId: "team-a" };
  const calls = { awardHandleIds: [], modules: [], stylesheets: [], mounts: [], handles: [] };
  const module = {
    mountLeaderboardHome(context) {
      calls.mounts.push(context);
      const handleId = calls.mounts.length;
      const handle = {
        getSnapshot: () => overrides.snapshot || {
          status: "ready",
          month: "2026-08",
          monthLabel: "August 2026",
          teamName: team.name,
          teamLogoUrl: team.logoUrl || "",
          standings: [{ playerId: "player-1", name: "Player One", points: 3, rank: 1 }],
        },
        openDialog: (opener) => {
          calls.handles.push(["openDialog", opener]);
          return true;
        },
        openAward: async (command, opener) => {
          calls.awardHandleIds.push(handleId);
          calls.handles.push(["openAward", command, opener]);
          return overrides.awardResult ?? true;
        },
        requestClose: () => overrides.closeResult ?? true,
        unmount: (options) => {
          calls.handles.push(["unmount", options]);
          return typeof overrides.unmountResult === "function"
            ? overrides.unmountResult(options)
            : overrides.unmountResult ?? true;
        },
      };
      return handle;
    },
  };
  const dialogHost = createRoot();
  const runtime = createLeaderboardSurfaceRuntime({
    ui: { leaderboardDialogHost: dialogHost },
    win: { document: { createElement: () => createRoot() } },
    platformModuleLoader: {
      loadStylesheet: async (id) => calls.stylesheets.push(id),
      loadModule: async (id) => {
        calls.modules.push(id);
        return module;
      },
    },
    getAssetVersion: () => "test",
    getCurrentUser: () => user,
    getActivePlatformTeam: () => team,
    getPlatformTeamDisplayTeam: () => team,
    getPlatformTeamDisplayName: () => team.name,
    getPlatformTeamLogoUrl: (value) => value?.logoUrl || "",
    getUserTeamId: (value) => value?.teamId || "",
    getAuthToken: () => "token",
    getPlayerProfilesState: () => ({ players: [{ id: "player-1" }] }),
    canView: overrides.canView || (() => true),
    canEdit: overrides.canEdit || (() => true),
  });
  return {
    calls,
    dialogHost,
    runtime,
    setTeam: (nextTeam) => { team = nextTeam; },
    setUser: (nextUser) => { user = nextUser; },
  };
}

test("Leaderboard Home surface is lazy, scoped, and forwards the canonical context", async () => {
  const { calls, dialogHost, runtime } = createHarness();
  const summary = createRoot();

  await runtime.mountHome({ leaderboardSummary: summary, leaderboardDialogHost: dialogHost });

  expect(calls.stylesheets).toEqual(["leaderboard"]);
  expect(calls.modules).toEqual(["leaderboard"]);
  expect(calls.mounts).toHaveLength(1);
  expect(calls.mounts[0]).toMatchObject({
    currentUser: { id: "coach-1" },
    scopeKey: "team-a",
    teamId: "team-a",
    team: { id: "team-a", name: "Team A", shortName: "TA", logoUrl: "/team-a.png" },
  });
  expect(calls.mounts[0].getAuthToken()).toBe("token");
  expect(calls.mounts[0].getPlayerProfilesState().players[0].id).toBe("player-1");
  expect(calls.mounts[0].canView()).toBe(true);
  expect(calls.mounts[0].canEdit()).toBe(true);
  expect(runtime.getSnapshot()).toMatchObject({
    status: "ready",
    teamName: "Team A",
    standings: [{ playerId: "player-1", points: 3, rank: 1 }],
  });
});

test("Leaderboard Home surface fails closed before loading for guests", async () => {
  const { calls, dialogHost, runtime } = createHarness({
    canView: () => false,
    canEdit: () => false,
  });
  const summary = createRoot();

  expect(await runtime.mountHome({ leaderboardSummary: summary, leaderboardDialogHost: dialogHost })).toBeNull();
  expect(await runtime.openDialog()).toBe(false);
  expect(await runtime.openAward({ occurredOn: "2026-08-25", title: "Training" })).toBe(false);
  expect(runtime.getSnapshot()).toMatchObject({ status: "unavailable", standings: [] });
  expect(calls.modules).toEqual([]);
  expect(calls.stylesheets).toEqual([]);
  expect(summary.hidden).toBe(true);
});

test("Leaderboard snapshot starts the lazy surface and becomes ready", async () => {
  const { calls, runtime } = createHarness();

  expect(runtime.getSnapshot()).toMatchObject({ status: "loading", standings: [] });
  await expect.poll(() => calls.mounts.length).toBe(1);
  expect(runtime.getSnapshot()).toMatchObject({
    status: "ready",
    standings: [{ playerId: "player-1", points: 3, rank: 1 }],
  });
});

test("Leaderboard runtime command returns the module result and only forwards date/title", async () => {
  const { calls, dialogHost, runtime } = createHarness({ awardResult: false });
  await runtime.mountHome({ leaderboardSummary: createRoot(), leaderboardDialogHost: dialogHost });
  const opener = { id: "session-award-button" };

  expect(await runtime.openAward({
    occurredOn: "2026-08-25",
    title: " Finishing game ",
    teamId: "must-not-cross-boundary",
    sourceSessionId: "session-1",
  }, opener)).toBe(false);
  expect(calls.handles).toContainEqual([
    "openAward",
    { occurredOn: "2026-08-25", title: "Finishing game" },
    opener,
  ]);
});

test("Leaderboard Home navigation keeps the active surface when normal unmount is rejected", async () => {
  const { calls, dialogHost, runtime } = createHarness({ unmountResult: false });
  const summary = createRoot();
  await runtime.mountHome({ leaderboardSummary: summary, leaderboardDialogHost: dialogHost });

  expect(runtime.unmountHome()).toBe(false);
  expect(calls.handles).toContainEqual(["unmount", undefined]);
  expect(summary.hidden).toBe(false);
});

test("Leaderboard Home rerender force-disposes a pending surface after scope changes", async () => {
  const { calls, dialogHost, runtime, setTeam } = createHarness({
    unmountResult: (options) => Boolean(options?.force),
  });
  await runtime.mountHome({ leaderboardSummary: createRoot(), leaderboardDialogHost: dialogHost });
  setTeam({ id: "team-b", name: "Team B" });

  expect(runtime.unmountHome()).toBe(true);
  expect(calls.handles).toContainEqual(["unmount", { force: true }]);
});

test("Leaderboard commands dispose stale scope before a new user is denied", async () => {
  let mayEdit = true;
  const { calls, dialogHost, runtime, setTeam } = createHarness({
    canEdit: () => mayEdit,
    unmountResult: (options) => Boolean(options?.force),
  });
  await runtime.mountHome({ leaderboardSummary: createRoot(), leaderboardDialogHost: dialogHost });
  setTeam({ id: "team-b", name: "Team B" });
  mayEdit = false;

  expect(await runtime.openAward({ occurredOn: "2026-08-25", title: "Denied" })).toBe(false);
  expect(calls.handles).toContainEqual(["unmount", { force: true }]);
  expect(calls.awardHandleIds).toEqual([]);
});

test("Leaderboard Home surface force-disposes and remounts when team or user scope changes", async () => {
  const { calls, dialogHost, runtime, setTeam, setUser } = createHarness({
    unmountResult: (options) => Boolean(options?.force),
  });
  const teamASummary = createRoot();
  await runtime.mountHome({ leaderboardSummary: teamASummary, leaderboardDialogHost: dialogHost });

  setTeam({ id: "team-b", name: "Team B", shortName: "TB", logoUrl: "/team-b.png" });
  const teamBSummary = createRoot();
  await runtime.mountHome({ leaderboardSummary: teamBSummary, leaderboardDialogHost: dialogHost });

  setUser({ id: "coach-2", role: "coach", teamId: "team-b" });
  await runtime.mountHome({ leaderboardSummary: createRoot(), leaderboardDialogHost: dialogHost });
  await runtime.openAward({ occurredOn: "2026-08-25", title: "Fresh scope" });

  expect(calls.handles.filter(([name]) => name === "unmount")).toEqual([
    ["unmount", { force: true }],
    ["unmount", { force: true }],
  ]);
  expect(calls.awardHandleIds).toEqual([3]);
  expect(calls.mounts.map((context) => `${context.scopeKey}:${context.currentUser.id}`)).toEqual([
    "team-a:coach-1",
    "team-b:coach-1",
    "team-b:coach-2",
  ]);
  expect(teamASummary.hidden).toBe(true);
  expect(teamBSummary.hidden).toBe(true);
  expect(calls.modules).toEqual(["leaderboard"]);
});
