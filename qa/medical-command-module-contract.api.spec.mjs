import { expect, test } from "@playwright/test";
import { createMedicalCommandRenderer } from "../src/modules/medical/index.mjs";

test("Medical command renderer keeps command, huddle, and handover contracts", () => {
  const player = { id: "p1", name: "Mak Player", position: "CM" };
  const record = { participation: 75 };
  const status = { label: "Modified", tone: "modified" };
  const renderer = createMedicalCommandRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    formatMedicalDateLabel: (value) => value,
    getActiveMedicalPlayers: () => [player],
    getMedicalAttentionPlayers: () => [{ player, record, status }],
    getMedicalCoachComment: () => "Limit sprinting",
    getMedicalCoachHandoverItems: () => [{ player, record, status, participation: 75 }],
    getMedicalDailyHuddle: () => ({
      changes: [{ player, record, status, participation: 75, previousParticipation: 100 }],
      restricted: [{ player, record, status, participation: 75 }],
      needsRecommendation: [],
      coachHandover: [{ player, record, status, participation: 75 }],
      reviewAlerts: [],
    }),
    getMedicalDailyStats: () => ({ fullCount: 0, modifiedCount: 1, unavailableCount: 0 }),
    getMedicalPositionSummaries: () => [{ position: "CM", average: 75, logged: 1, players: 1 }],
    getMedicalReviewAlerts: () => [
      { player, plan: { reviewDate: "2026-06-01", rtpPhase: "phase-2" }, isOverdue: false },
    ],
    getMedicalRtpPhaseOption: () => ({ label: "Phase 2" }),
    getSelectedDate: () => "2026-05-31",
  });

  const command = renderer.renderCommandBoard();
  expect(command).toContain("medical-command-board");
  expect(command).toContain("Recommendation Queue");
  expect(command).toContain('data-medical-select-player="p1"');
  expect(command).toContain("Position Load");

  const huddle = renderer.renderDailyHuddle();
  expect(huddle).toContain("Daily Medical Huddle");
  expect(huddle).toContain("Changed since yesterday");
  expect(huddle).toContain("Limit sprinting");

  const handover = renderer.renderCoachHandoverPanel();
  expect(handover).toContain("data-medical-copy-handover");
  expect(handover).toContain("Coach-Safe Handover");
  expect(handover).toContain("Limit sprinting");

  expect(renderer.renderHuddleList([], () => "", "Empty")).toContain("Empty");
});
