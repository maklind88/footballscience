import { expect, test } from "@playwright/test";
import { createIdpActions } from "../src/modules/idp/idp-actions.mjs";
import { createIdpStore } from "../src/modules/idp/idp-state.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture() {
  const oldDetail = { profile: { playerId: "p1", playerName: "Test Player" }, evidence: [{ id: "old" }] };
  const store = createIdpStore({
    ui: { selectedPlayerId: "p1", profileView: "development" },
    playerDetail: oldDetail,
    dashboardPlayers: [{ profile: oldDetail.profile }],
    sync: { revision: "r1" },
  });
  const dashboard = deferred();
  const player = deferred();
  const dashboardPayload = { players: [{ profile: oldDetail.profile }], sync: { revision: "r2" } };
  const playerPayload = { profile: oldDetail.profile, evidence: [{ id: "new", note: "New observation" }] };
  const actions = createIdpActions({
    store,
    api: {
      loadSync: async () => ({ sync: { revision: "r2" } }),
      loadDashboard: () => dashboard.promise,
      loadPlayer: () => player.promise,
    },
  });
  return { store, actions, dashboard, player, dashboardPayload, playerPayload, oldDetail };
}

test("external refresh keeps a complete snapshot visible and publishes once without resetting UI", async () => {
  const f = fixture();
  const seen = [];
  f.store.subscribe((state) => seen.push(state));
  const pending = f.actions.checkForExternalUpdates();
  await Promise.resolve();
  expect(f.store.getState().playerDetail).toBe(f.oldDetail);
  expect(seen).toHaveLength(0);
  f.dashboard.resolve(f.dashboardPayload);
  await Promise.resolve();
  expect(seen).toHaveLength(0);
  f.player.resolve(f.playerPayload);
  expect(await pending).toBe(true);
  expect(seen).toHaveLength(1);
  expect(seen[0].ui).toMatchObject({ loading: false, selectedPlayerId: "p1", profileView: "development" });
  expect(seen[0].playerDetail.evidence[0].id).toBe("new");
  expect(seen[0].sync.revision).toBe("r2");
});

for (const surface of ["actionMode", "idpPlayerBoardOpen", "clipPreviewOpen"]) {
  test(`external response is deferred if ${surface} opens during the read`, async () => {
    const f = fixture();
    const pending = f.actions.checkForExternalUpdates();
    await Promise.resolve();
    f.store.setState({ ui: { [surface]: surface === "actionMode" ? "focus" : true } });
    f.dashboard.resolve(f.dashboardPayload);
    f.player.resolve(f.playerPayload);
    expect(await pending).toBe(false);
    expect(f.store.getState().playerDetail).toBe(f.oldDetail);
    expect(f.store.getState().sync.revision).toBe("r1");
    f.store.setState({ ui: { [surface]: surface === "actionMode" ? "" : false } });
    expect(await f.actions.checkForExternalUpdates()).toBe(true);
    expect(f.store.getState().playerDetail.evidence[0].id).toBe("new");
  });
}

test("background response cannot navigate back after leaving a player", async () => {
  const f = fixture();
  const pending = f.actions.checkForExternalUpdates();
  await Promise.resolve();
  f.store.setState({ ui: { selectedPlayerId: "" } });
  f.dashboard.resolve(f.dashboardPayload);
  f.player.resolve(f.playerPayload);
  expect(await pending).toBe(false);
  expect(f.store.getState().ui.selectedPlayerId).toBe("");
  expect(f.store.getState().sync.revision).toBe("r1");
});

test("a failed refresh keeps content and revision available for retry", async () => {
  const f = fixture();
  const seen = [];
  f.store.subscribe((state) => seen.push(state));
  const pending = f.actions.checkForExternalUpdates();
  f.dashboard.resolve(f.dashboardPayload);
  f.player.reject(new Error("Temporary network failure"));
  await expect(pending).rejects.toThrow("Temporary network failure");
  expect(seen).toHaveLength(0);
  expect(f.store.getState().playerDetail).toBe(f.oldDetail);
  expect(f.store.getState().sync.revision).toBe("r1");
});

test("an older refresh cannot overwrite a completed newer refresh", async () => {
  const store = createIdpStore({ ui: { selectedPlayerId: "p1" } });
  const oldPlayer = deferred();
  let playerLoads = 0;
  const actions = createIdpActions({ store, api: {
    loadDashboard: async () => ({ players: [], sync: { revision: "r2" } }),
    loadPlayer: () => ++playerLoads === 1 ? oldPlayer.promise : Promise.resolve({
      profile: { playerId: "p1", playerName: "Latest" },
    }),
  } });
  const older = actions.refreshSelectedPlayer();
  await actions.refreshSelectedPlayer();
  oldPlayer.resolve({ profile: { playerId: "p1", playerName: "Stale" } });
  expect(await older).toBe(false);
  expect(store.getState().playerDetail.profile.playerName).toBe("Latest");
});

test("a late player selection cannot replace the currently selected player", async () => {
  const store = createIdpStore();
  const oldPlayer = deferred();
  const actions = createIdpActions({ store, api: {
    loadPlayer: (id) => id === "p1" ? oldPlayer.promise : Promise.resolve({
      profile: { playerId: "p2", playerName: "Second Player" },
    }),
  } });
  const older = actions.selectPlayer("p1");
  await actions.selectPlayer("p2");
  oldPlayer.resolve({ profile: { playerId: "p1", playerName: "First Player" } });
  await older;
  expect(store.getState().ui.selectedPlayerId).toBe("p2");
  expect(store.getState().playerDetail.profile.playerId).toBe("p2");
});
