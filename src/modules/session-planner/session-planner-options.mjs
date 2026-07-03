import {
  tacticalBoardPitchDimensions,
  tacticalBoardPitchModeKeys,
  tacticalBoardPitchModeOptions,
} from "../tactical-board/index.mjs";

export const sessionPlannerPlayerBoardColorOptions = [
  { label: "Blue", value: "#1d8bff" },
  { label: "Red", value: "#ff4f4f" },
  { label: "Yellow", value: "#fbbf24" },
  { label: "Green", value: "#22c55e" },
  { label: "Black", value: "#1d1d1f" },
  { label: "White", value: "#ffffff" },
];

export const sessionPlannerPlayerBoardAutoModeOptions = [
  { key: "balanced", label: "Balanced" },
  { key: "best-xi", label: "Best XI" },
  { key: "relations", label: "Keep relations" },
  { key: "rotation", label: "Rotation" },
];

export const sessionPlannerPlayerBoardMaxTeamCount = sessionPlannerPlayerBoardColorOptions.length;

export const sessionPlannerTacticalPitchDimensions = tacticalBoardPitchDimensions;
export const sessionPlannerTacticalPitchModeOptions = tacticalBoardPitchModeOptions;
export const sessionPlannerTacticalPitchModeKeys = tacticalBoardPitchModeKeys;
export const sessionPlannerTacticalSnapStep = 2.5;
export const sessionPlannerTacticalMaxFrames = 12;

export const sessionPlannerPrintPaperOptions = {
  letter: {
    label: "US Letter",
    detail: "11 x 8.5 in · landscape",
    pageSize: "letter landscape",
    width: "11in",
    height: "8.5in",
  },
  a4: {
    label: "A4",
    detail: "297 x 210 mm · landscape",
    pageSize: "A4 landscape",
    width: "297mm",
    height: "210mm",
  },
};

export const sessionPlannerPrintSectionOptions = [
  { key: "overview", label: "Overview" },
  { key: "blocks", label: "Block flow" },
  { key: "details", label: "Objectives & coaching points" },
  { key: "visuals", label: "Tactical visuals" },
  { key: "players", label: "Player boards" },
  { key: "medical", label: "Medical availability" },
];
