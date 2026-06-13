import { expect, test } from "@playwright/test";
import {
  defaultScoutingState,
  scoutingCoreMetricOptions,
  scoutingPriorityOptions,
  scoutingShadowSlots,
  scoutingStatusOptions,
  scoutingTabs,
} from "../src/modules/scouting/scouting-defaults.mjs";

test("Scouting defaults expose stable tabs, slots, and state defaults", () => {
  expect(scoutingTabs.map((tab) => tab.id)).toEqual(["my-team", "shadow-xi", "database", "lists", "comparison", "reports"]);
  expect(scoutingShadowSlots).toHaveLength(11);
  expect(scoutingShadowSlots[0]).toMatchObject({ id: "gk", position: "GK" });
  expect(scoutingCoreMetricOptions.map((metric) => metric.id)).toEqual(["minutes", "matches", "age"]);
  expect(scoutingStatusOptions.map((status) => status.value)).toContain("shortlist");
  expect(scoutingPriorityOptions.map((priority) => priority.value)).toContain("urgent");
  expect(defaultScoutingState.activeTab).toBe("shadow-xi");
  expect(defaultScoutingState.databaseFilters.sortMetricId).toBe("minutes");
  expect(defaultScoutingState.lists[0].id).toBe("main-shortlist");
  expect(defaultScoutingState.comparisonLab.playerIds).toEqual(["", ""]);
  expect(defaultScoutingState.comparisonLab.metricIds).toEqual(["minutes"]);
});
