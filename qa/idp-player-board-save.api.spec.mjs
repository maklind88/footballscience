import { expect, test } from "@playwright/test";
import { createIdpActions } from "../src/modules/idp/idp-actions.mjs";
import { createIdpStore } from "../src/modules/idp/idp-state.mjs";
import { renderIdpPlayerBoardPage } from "../src/modules/idp/idp-player-board-renderer.mjs";

function setup() {
  const profile = { playerId: "player-1", playerName: "Test Player" };
  const focus = { id: "focus-1", playerId: profile.playerId, title: "Crossing", status: "Active" };
  const saved = [];
  const calls = [];
  const store = createIdpStore({
    ui: { selectedPlayerId: profile.playerId, profileView: "player-board", idpPlayerBoardOpen: true },
    playerDetail: { profile, focuses: [focus], interventions: [] },
  });
  const api = {
    createIntervention: async (payload) => {
      calls.push({ type: "create", payload });
      const record = { ...payload, id: "exercise-1", rowVersion: 1 };
      saved.push(record);
      return { intervention: record };
    },
    updateIntervention: async (payload) => {
      calls.push({ type: "update", payload });
      const index = saved.findIndex((item) => item.id === payload.id);
      expect(index).toBeGreaterThanOrEqual(0);
      saved[index] = { ...payload, rowVersion: payload.rowVersion + 1 };
      return { intervention: saved[index] };
    },
    loadDashboard: async () => ({ players: [{ profile, focus }] }),
    loadPlayer: async (playerId) => {
      expect(playerId).toBe(profile.playerId);
      return { profile, focuses: [focus], interventions: saved };
    },
  };
  const actions = createIdpActions({ store, api, context: {} });
  const payload = {
    focusId: focus.id,
    title: "Crossing exercise",
    objective: "Find the far post",
    status: "active",
    boardState: { tacticalElements: [{ id: "cone-1", type: "cone", x: 30, y: 40 }] },
  };
  return { store, api, actions, payload, calls };
}

test("IDP Save exercise refreshes the player's exercise bank and updates without duplicating", async () => {
  const { store, actions, payload, calls } = setup();
  await actions.savePlayerBoard(payload);
  const created = store.getState();
  expect(calls).toEqual([{ type: "create", payload: { ...payload, playerId: "player-1" } }]);
  expect(created.ui).toMatchObject({ profileView: "player-board", idpPlayerBoardOpen: false });
  expect(created.playerDetail.interventions).toHaveLength(1);
  const html = renderIdpPlayerBoardPage(created.playerDetail, true, created.ui);
  expect(html).toContain('data-idp-board-select="exercise-1"');
  expect(html).toContain("Crossing exercise");
  expect(html).toContain("session-tactical-cone");

  store.setState({ ui: { idpPlayerBoardOpen: true, idpPlayerBoardSelectedInterventionId: "exercise-1" } });
  await actions.savePlayerBoard({ ...payload, id: "exercise-1", rowVersion: 1, objective: "Find the near post" });
  expect(calls.map((call) => call.type)).toEqual(["create", "update"]);
  expect(calls[1].payload).toMatchObject({ playerId: "player-1", focusId: "focus-1", rowVersion: 1 });
  expect(store.getState().playerDetail.interventions).toHaveLength(1);
  expect(store.getState().playerDetail.interventions[0]).toMatchObject({ id: "exercise-1", objective: "Find the near post", rowVersion: 2 });
});

test("IDP failed save keeps the editor and local drawing available without reporting success", async () => {
  const { store, api, actions, payload } = setup();
  store.setState({ playerDetail: { ...store.getState().playerDetail, interventions: [{ ...payload, id: "draft-idp-player-board" }] } });
  const before = store.getState().playerDetail;
  api.createIntervention = async () => { throw new Error("Save unavailable"); };
  await expect(actions.savePlayerBoard(payload)).rejects.toThrow("Save unavailable");
  expect(store.getState().ui.idpPlayerBoardOpen).toBe(true);
  expect(store.getState().ui.message).not.toBe("Player Board saved.");
  expect(store.getState().playerDetail).toEqual(before);
});

test("successful create followed by refresh failure retains the server ID for subsequent edits", async () => {
  const { store, api, actions, payload, calls } = setup();
  api.loadPlayer = async () => { throw new Error("Read unavailable"); };
  await actions.savePlayerBoard({ ...payload, focusId: "" });
  expect(store.getState().playerDetail.interventions[0]).toMatchObject({ id: "exercise-1", focusId: "", rowVersion: 1 });
  expect(store.getState().ui.error).toContain("Exercise saved");
  expect(store.getState().ui.idpPlayerBoardSelectedInterventionId).toBe("exercise-1");
  await actions.savePlayerBoard({ ...payload, id: "exercise-1", rowVersion: 1 });
  expect(calls.map((call) => call.type)).toEqual(["create", "update"]);
});
