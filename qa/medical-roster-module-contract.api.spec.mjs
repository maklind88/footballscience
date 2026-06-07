import { expect, test } from "@playwright/test";
import { createMedicalRosterRenderer } from "../src/modules/medical/index.mjs";

test("Medical roster renderer owns availability workspace and roster rows", () => {
  const player = { id: "p1", name: "Mak Player", number: "8", position: "CM" };
  const renderer = createMedicalRosterRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    canEditMedicalTeam: () => true,
    canViewPrivateMedicalDetails: () => false,
    formatMedicalDateLabel: () => "31 May",
    formatScheduleDateValue: () => "2026-05-31",
    getActiveMedicalPlayers: () => [player],
    getFilteredMedicalPlayers: () => [player],
    getLatestMedicalRecord: () => ({ participation: 75 }),
    getMedicalDailyStats: () => ({ fullCount: 0, modifiedCount: 1, unavailableCount: 0, unloggedCount: 0 }),
    getMedicalMonthAverageStats: () => ({ averageParticipation: 75 }),
    getMedicalPlayerSquadAvailabilityBlockReason: () => "",
    getMedicalRecommendationActivityContext: () => ({
      isRecommendable: true,
      type: "training",
      quickLabel: "Training",
      activityLabel: "Training",
      availabilityLabel: "Training Availability",
      recommendationLabel: "Training recommendation",
      date: "2026-05-31",
      scheduleLabel: "Training",
    }),
    getMedicalRecordStatus: () => ({ key: "modified", label: "Modified", tone: "modified" }),
    getMedicalRosterPositionGroups: () => [{ position: "CM", players: [player] }],
    getMedicalRosterPositionStats: () => ({ total: 1, full: 0, modified: 1, unavailable: 0, missing: 0 }),
    getMedicalScheduleSummary: () => "Training",
    getMedicalStatusForParticipation: () => "modified",
    getMedicalStatusOptionForDate: () => ({ label: "Modified" }),
    getMedicalValidBulkSelection: () => new Set(["p1"]),
    getMedicalVisibleComment: () => "Monitor load",
    getMedicalWindowAverage: () => 75,
    getMedicalWindowDates: () => ["2026-05-31"],
    getRosterSearchQuery: () => "",
    getSelectedDate: () => "2026-05-31",
    getSelectedPlayerId: () => "p1",
    getStatusFilter: () => "all",
    isPlayerModalOpen: () => true,
    isTemporaryPlayerProfile: () => false,
    medicalParticipationOptions: [0, 75, 100],
    medicalStatusOptions: [{ key: "modified", label: "Modified" }],
    renderMedicalBulkUpdatePanel: () => '<section class="bulk"></section>',
    renderMedicalMetric: (label, value) => `<article>${label}:${value}</article>`,
    renderMedicalOperationsSystem: () => '<section class="ops"></section>',
    renderMedicalPlayerAvatar: () => '<span class="avatar"></span>',
    renderMedicalSquadAvailabilityBadge: () => "",
    renderMedicalTemporaryPlayerBadge: () => "",
  });

  const workspace = renderer.renderAvailabilityWorkspace("Saved.");
  expect(workspace).toContain("medical-availability-workspace");
  expect(workspace).toContain("Saved.");
  expect(workspace).toContain("medical-roster-panel");
  expect(workspace).toContain("Mak Player");
  expect(workspace).toContain("data-medical-quick-recommend");
  expect(workspace).toContain("data-medical-bulk-toggle");
  expect(renderer.renderRosterSetup()).toContain("medicalRosterImportForm");
  expect(renderer.renderNewPlayerCard()).toContain("medicalNewPlayerForm");
});
