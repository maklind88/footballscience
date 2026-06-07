import { expect, test } from "@playwright/test";
import {
  cloneScoutingState,
  defaultScoutingState,
  normalizeScoutingDatabaseFilters,
  normalizeScoutingFormationValue,
  normalizeScoutingMyTeamPositions,
  normalizeScoutingRecordIds,
  normalizeScoutingShadowBoard,
  normalizeScoutingText,
  preserveScoutingTransientUiState,
  scoutingShadowSlots,
} from "../src/modules/scouting/index.mjs";

test("Scouting state helpers normalize text, filters, ids, and formations", () => {
  expect(normalizeScoutingText("  A   long   value  ", 12)).toBe("A long value");
  expect(normalizeScoutingRecordIds(["p1", "p1", "", "p2"])).toEqual(["p1", "p2"]);
  expect(normalizeScoutingFormationValue("3-5-2")).toBe("3-5-2");
  expect(normalizeScoutingFormationValue("bad")).toBe("4-3-3");

  const filters = normalizeScoutingDatabaseFilters({
    query: "  winger  ",
    minMinutes: "451",
    maxMinutes: "1000",
    metricId: "all",
    metricIds: ["goals", "goals", "assists"],
    offset: "-10",
  });

  expect(filters).toMatchObject({
    query: "winger",
    minMinutes: 451,
    maxMinutes: 1000,
    metricId: "goals",
    metricIds: ["goals", "assists"],
    offset: 0,
  });
});

test("Scouting state helpers normalize Shadow XI boards and positions", () => {
  const slotIds = new Set(scoutingShadowSlots.map((slot) => slot.id));
  const board = normalizeScoutingShadowBoard(
    {
      id: "board-1",
      name: "",
      visibility: "team",
      formation: "4-2-3-1",
      slots: {
        gk: ["record-1", "record-1"],
        bad: ["record-2"],
      },
      positions: {
        "4-2-3-1": {
          gk: { x: 2, y: 99 },
          rb: { x: 84.555, y: 68.444 },
          bad: { x: 50, y: 50 },
        },
      },
      meta: {
        "gk:record-1": { tag: "", note: "Watch", playerName: "Keeper" },
        "bad:record-2": { tag: "drop" },
      },
    },
    slotIds
  );

  expect(board).toMatchObject({
    id: "board-1",
    name: "Shadow XI",
    visibility: "team",
    formation: "4-2-3-1",
  });
  expect(board.slots).toEqual({ gk: ["record-1"] });
  expect(board.positions["4-2-3-1"].gk).toEqual({ x: 4, y: 96 });
  expect(board.positions["4-2-3-1"].rb).toEqual({ x: 84.56, y: 68.44 });
  expect(board.meta["gk:record-1"]).toMatchObject({ tag: "monitor", note: "Watch", playerName: "Keeper" });

  const positions = normalizeScoutingMyTeamPositions({ "4-3-3": { bad: { x: 50, y: 50 } } }, slotIds);
  expect(positions).toEqual({});
});

test("Scouting state clone keeps stable defaults and preserves transient UI state", () => {
  const cloned = cloneScoutingState({
    activeTab: "database",
    searchQuery: "striker",
    databaseFilters: { minMinutes: 450 },
    lists: [],
    targets: [{ name: "Target", status: "unknown", priority: "urgent" }],
    shadowXi: {
      activeBoardId: "board-1",
      boardName: "First board",
      visibility: "all",
      selectedSlotId: "gk",
      slots: { gk: "record-1" },
    },
    comparisonLab: { playerIds: ["p1", "p2", "p3", "p4", "p5"] },
  });

  expect(defaultScoutingState.activeTab).toBe("shadow-xi");
  expect(cloned.activeTab).toBe("database");
  expect(cloned.databaseFilters.query).toBe("striker");
  expect(cloned.databaseFilters.minMinutes).toBe(0);
  expect(cloned.targets[0]).toMatchObject({ name: "Target", status: "new", priority: "urgent" });
  expect(cloned.lists[0].id).toBe("main-shortlist");
  expect(cloned.shadowXi.boards[0]).toMatchObject({ id: "board-1", name: "First board", visibility: "all" });
  expect(cloned.comparisonLab.playerIds).toEqual(["p1", "p2", "p3", "p4"]);

  const preserved = preserveScoutingTransientUiState(cloned, {
    activeTab: "reports",
    selectedRecordId: "record-99",
    profileTab: "summary",
    profileRoleProfileId: "role-1",
    shadowXi: { selectedSlotId: "rb" },
  });

  expect(preserved.activeTab).toBe("reports");
  expect(preserved.selectedRecordId).toBe("record-99");
  expect(preserved.profileTab).toBe("summary");
  expect(preserved.profileRoleProfileId).toBe("role-1");
  expect(preserved.shadowXi.selectedSlotId).toBe("rb");
});
