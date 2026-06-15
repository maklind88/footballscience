import { expect, test } from "@playwright/test";
import { createMedicalRosterHelpers } from "../src/modules/medical/index.mjs";

function createHelpers(overrides = {}) {
  return createMedicalRosterHelpers({
    canEditMedicalTeam: () => true,
    escapeHtml: (value) =>
      String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;"),
    getBulkRecommendationEligiblePlayers: (players = []) => players.filter((player) => !player.blocked),
    getBulkSelectedPlayers: () => [{ id: "p1" }],
    getMedicalRecommendationActivityContext: () => ({
      isRecommendable: true,
      type: "training",
      activityLabel: "Training",
      scheduleLabel: "Field",
      blockReason: "",
    }),
    getMedicalRtpPhaseForRecommendation: () => "return-to-train",
    getMedicalRtpPhaseOption: () => ({ key: "return-to-train", label: "Return to train" }),
    getMedicalStatusForParticipation: () => "modified",
    getSelectedDate: () => "2026-05-31",
    isBulkRecommendationOpen: () => true,
    normalizeMedicalPlayer: (player = {}) => ({
      id: `${player.number || "n"}-${String(player.name || "player").toLowerCase().replace(/\s+/g, "-")}`,
      number: String(player.number || "").trim(),
      name: String(player.name || "").trim(),
      position: String(player.position || "").trim(),
      photoUrl: String(player.photoUrl || "").trim(),
    }),
    renderMedicalParticipationOptions: (selected) => `<option selected>${selected}</option>`,
    ...overrides,
  });
}

test("Medical roster helpers parse CSV, pipe, tab, semicolon, and plain roster rows", () => {
  const helpers = createHelpers();
  const parsed = helpers.parseRosterText(
    [
      "10 | Alex Morgan | Forward | https://example.com/a.png",
      "#7 Tobin Heath",
      '"Smith, Sophia",9,Forward',
      "8\tRose Lavelle\tMidfielder",
      "Naomi Girma; Defender",
    ].join("\n")
  );

  expect(helpers.parseRosterCsvLine('"Smith, Sophia",9,Forward')).toEqual(["Smith, Sophia", "9", "Forward"]);
  expect(helpers.parseRosterLineParts("8\tRose Lavelle\tMidfielder")).toEqual(["8", "Rose Lavelle", "Midfielder"]);
  expect(parsed.skippedLines).toEqual([]);
  expect(parsed.players.map((player) => [player.number, player.name, player.position, player.photoUrl])).toEqual([
    ["10", "Alex Morgan", "Forward", "https://example.com/a.png"],
    ["7", "Tobin Heath", "", ""],
    ["9", "Smith, Sophia", "Forward", ""],
    ["8", "Rose Lavelle", "Midfielder", ""],
    ["", "Naomi Girma", "Defender", ""],
  ]);
});

test("Medical roster helpers suppress bulk panel markup", () => {
  const helpers = createHelpers();
  const openMarkup = helpers.renderBulkUpdatePanel([{ id: "p1" }, { id: "p2", blocked: true }]);

  expect(openMarkup).toBe("");

  const collapsedMarkup = createHelpers({ isBulkRecommendationOpen: () => false }).renderBulkUpdatePanel([{ id: "p1" }]);
  expect(collapsedMarkup).toBe("");
});

test("Medical roster helpers keep bulk panel suppressed when activity is not recommendable", () => {
  const helpers = createHelpers({
    getMedicalRecommendationActivityContext: () => ({
      isRecommendable: false,
      type: "off",
      activityLabel: "Off",
      scheduleLabel: "No session",
      blockReason: "No training or match",
    }),
  });

  const markup = helpers.renderBulkUpdatePanel([{ id: "p1" }]);

  expect(markup).toBe("");
});
