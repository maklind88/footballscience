import { expect, test } from "@playwright/test";
import {
  tacticalBoardPitchDimensions,
  tacticalBoardPitchModeKeys,
  tacticalBoardPitchModeOptions,
} from "../src/modules/tactical-board/index.mjs";
import {
  sessionPlannerPlayerBoardAutoModeOptions,
  sessionPlannerPlayerBoardColorOptions,
  sessionPlannerPlayerBoardMaxTeamCount,
  sessionPlannerPrintPaperOptions,
  sessionPlannerPrintSectionOptions,
  sessionPlannerTacticalMaxFrames,
  sessionPlannerTacticalPitchDimensions,
  sessionPlannerTacticalPitchModeKeys,
  sessionPlannerTacticalPitchModeOptions,
  sessionPlannerTacticalSnapStep,
} from "../src/modules/session-planner/index.mjs";

test("Session Planner options expose stable board, tactical, and print defaults", () => {
  expect(sessionPlannerPlayerBoardColorOptions).toHaveLength(6);
  expect(sessionPlannerPlayerBoardColorOptions[0]).toMatchObject({ label: "Blue", value: "#1d8bff" });
  expect(sessionPlannerPlayerBoardAutoModeOptions.map((option) => option.key)).toEqual(["balanced", "best-xi", "relations", "rotation"]);
  expect(sessionPlannerPlayerBoardMaxTeamCount).toBe(sessionPlannerPlayerBoardColorOptions.length);
  expect(sessionPlannerTacticalPitchDimensions).toEqual({ length: 105, width: 65 });
  expect(sessionPlannerTacticalPitchModeOptions.map((option) => option.key)).toContain("full-wide");
  expect(sessionPlannerTacticalPitchModeKeys.has("goalkeeper")).toBe(true);
  expect(sessionPlannerTacticalSnapStep).toBe(2.5);
  expect(sessionPlannerTacticalMaxFrames).toBe(12);
  expect(sessionPlannerPrintPaperOptions.letter.pageSize).toBe("letter landscape");
  expect(sessionPlannerPrintPaperOptions.a4.width).toBe("297mm");
  expect(sessionPlannerPrintSectionOptions.map((option) => option.key)).toContain("medical");
});

test("Session Planner tactical pitch options come from the shared Tactical Board core", () => {
  expect(sessionPlannerTacticalPitchDimensions).toBe(tacticalBoardPitchDimensions);
  expect(sessionPlannerTacticalPitchModeOptions).toBe(tacticalBoardPitchModeOptions);
  expect(sessionPlannerTacticalPitchModeKeys).toBe(tacticalBoardPitchModeKeys);
});
