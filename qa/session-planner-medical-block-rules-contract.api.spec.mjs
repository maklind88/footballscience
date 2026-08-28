import { expect, test } from "@playwright/test";
import {
  getSessionPlannerMedicalBlockRule,
  isSessionPlannerWarmUpBlock,
} from "../src/modules/session-planner/index.mjs";

test("Session Planner maps warm-up and training blocks to shared medical participation thresholds", () => {
  expect(getSessionPlannerMedicalBlockRule({ id: "warm-up", label: "Warm Up" })).toEqual({
    blockNumber: 0,
    label: "Warm Up",
    valueLabel: "10%+",
    min: 10,
  });
  expect([1, 2, 3, 4, 5].map((blockNumber) => getSessionPlannerMedicalBlockRule(blockNumber))).toEqual([
    { blockNumber: 1, label: "Block 1", valueLabel: "25%+", min: 25 },
    { blockNumber: 2, label: "Block 2", valueLabel: "50%+", min: 50 },
    { blockNumber: 3, label: "Block 3", valueLabel: "75%+", min: 75 },
    { blockNumber: 4, label: "Block 4", valueLabel: "100%", min: 100 },
    { blockNumber: 5, label: "Block 5", valueLabel: "100%", min: 100 },
  ]);
  expect(isSessionPlannerWarmUpBlock({ id: "warm_up" })).toBe(true);
  expect(isSessionPlannerWarmUpBlock({ label: "Block 1" })).toBe(false);
});

test("Session Planner medical block rule safely defaults invalid block numbers to Block 1", () => {
  expect(getSessionPlannerMedicalBlockRule("invalid")).toEqual({
    blockNumber: 1,
    label: "Block 1",
    valueLabel: "25%+",
    min: 25,
  });
});
