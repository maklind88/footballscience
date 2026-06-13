import { expect, test } from "@playwright/test";
import {
  addScoutingRecordIdToDecisionList,
  addScoutingRecordIdToShadowSlot,
  assignScoutingMyTeamPlayerIdToSlot,
  createScoutingDecisionList,
  deleteScoutingDecisionListById,
  toggleScoutingFavoriteRecordId,
} from "../src/modules/scouting/index.mjs";

test("Scouting decision actions keep favorite ids unique and reversible", () => {
  const state = { favoriteRecordIds: ["record-1", "record-1", "record-2"] };

  const removed = toggleScoutingFavoriteRecordId(state, "record-1");
  expect(removed).toMatchObject({ changed: true, favorite: false, recordId: "record-1" });
  expect(state.favoriteRecordIds).toEqual(["record-2"]);

  const added = toggleScoutingFavoriteRecordId(state, "record-3");
  expect(added).toMatchObject({ changed: true, favorite: true, recordId: "record-3" });
  expect(state.favoriteRecordIds).toEqual(["record-3", "record-2"]);
});

test("Scouting decision actions create, add to, and delete lists safely", () => {
  const state = { lists: [] };

  const created = createScoutingDecisionList(state, " Wide Targets ");
  expect(created.changed).toBe(true);
  expect(state.lists[0]).toMatchObject({ name: "Wide Targets", recordIds: [] });

  const added = addScoutingRecordIdToDecisionList(state, { recordId: "record-1", listId: state.lists[0].id });
  expect(added.changed).toBe(true);
  expect(state.lists[0].recordIds).toEqual(["record-1"]);

  const duplicate = addScoutingRecordIdToDecisionList(state, { recordId: "record-1", listId: state.lists[0].id });
  expect(duplicate).toMatchObject({ changed: false, reason: "already-present" });
  expect(state.lists[0].recordIds).toEqual(["record-1"]);

  const deleted = deleteScoutingDecisionListById(state, state.lists[0].id);
  expect(deleted.changed).toBe(true);
  expect(state.lists).toHaveLength(1);
  expect(state.lists[0].id).toBe("main-shortlist");
});

test("Scouting decision actions add Shadow XI records with slot meta", () => {
  const state = {
    shadowXi: {
      selectedSlotId: "cf",
      slots: { cf: ["record-1", "record-2"] },
      meta: { "cf:record-1": { tag: "first-choice" } },
    },
  };

  const result = addScoutingRecordIdToShadowSlot(state, {
    recordId: "record-2",
    slotId: "cf",
    meta: { tag: "backup", playerName: "Target Two" },
  });

  expect(result).toMatchObject({ changed: true, recordId: "record-2", slotId: "cf", metaKey: "cf:record-2" });
  expect(state.shadowXi.slots.cf).toEqual(["record-2", "record-1"]);
  expect(state.shadowXi.selectedSlotId).toBe("cf");
  expect(state.shadowXi.meta["cf:record-2"]).toMatchObject({ tag: "backup", playerName: "Target Two" });
});

test("Scouting decision actions assign My Team players to one slot at a time", () => {
  const state = {
    myTeam: {
      slots: {
        lw: ["player-1", "player-2"],
        cf: ["player-3"],
      },
    },
  };

  const result = assignScoutingMyTeamPlayerIdToSlot(state, {
    playerId: "player-2",
    slotId: "cf",
    beforePlayerId: "player-3",
  });

  expect(result).toMatchObject({ changed: true, playerId: "player-2", slotId: "cf" });
  expect(state.myTeam.slots).toEqual({
    lw: ["player-1"],
    cf: ["player-2", "player-3"],
  });
});
