import { expect, test } from "@playwright/test";
import { createMedicalRosterRenderer } from "../src/modules/medical/index.mjs";

test("Medical roster renderer owns availability workspace and roster rows", () => {
  const player = { id: "p1", name: "Mak Player", number: "8", position: "CM" };
  const availableGuest = { id: "guest-1", name: "Available Guest", number: "91", position: "Forward", rosterType: "guest", countsInSquad: false, status: "available" };
  const blockedGuest = { id: "guest-2", name: "Unavailable Guest", number: "92", position: "Forward", rosterType: "guest", countsInSquad: false, status: "unavailable" };
  const renderer = createMedicalRosterRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    canEditMedicalTeam: () => true,
    canViewPrivateMedicalDetails: () => false,
    formatMedicalDateLabel: () => "31 May",
    formatScheduleDateValue: () => "2026-05-31",
    getActiveMedicalPlayers: () => [player, availableGuest, blockedGuest],
    getFilteredMedicalPlayers: () => [player, availableGuest, blockedGuest],
    getLatestMedicalRecord: () => ({ participation: 75 }),
    getMedicalPlayerSquadAvailabilityBlockReason: (candidate) => candidate.status === "available" || !candidate.status ? "" : "Blocked in Squad Room",
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
    getMedicalVisibleComment: () => "Monitor load",
    getMedicalWindowDates: () => ["2026-05-31"],
    getRosterSearchQuery: () => "",
    getSelectedDate: () => "2026-05-31",
    getSelectedPlayerId: () => "p1",
    getStatusFilter: () => "all",
    isPlayerModalOpen: () => true,
    isTemporaryPlayerProfile: (candidate) => candidate.countsInSquad === false,
    medicalParticipationOptions: [0, 75, 100],
    medicalStatusOptions: [{ key: "modified", label: "Modified" }],
    renderMedicalOperationsSystem: () => '<section class="ops"></section>',
    renderMedicalPlayerAvatar: () => '<span class="avatar"></span>',
    renderMedicalSquadAvailabilityBadge: () => "",
    renderMedicalTemporaryPlayerBadge: () => "",
  });

  const workspace = renderer.renderAvailabilityWorkspace("Saved.");
  expect(workspace).toContain("medical-availability-workspace");
  expect(workspace).toContain("Saved.");
  expect(workspace).toContain("medical-roster-panel");
  expect(workspace).not.toContain("medical-metrics-grid");
  expect(workspace).toContain("Mak Player");
  expect(workspace).toContain("Available Guest");
  expect(workspace).not.toContain("Unavailable Guest");
  expect(workspace).toContain("1 available for this date");
  expect(workspace).toContain("data-medical-quick-recommend");
  expect(workspace).toContain("data-medical-quick-clear");
  expect(workspace).toContain("medical-quick-rec-row has-clear");
  expect(workspace).not.toContain("medical-bulk-panel");
  expect(workspace).not.toContain("data-medical-bulk-toggle");
  expect(renderer.renderRosterSetup()).toContain("medicalRosterImportForm");
  expect(renderer.renderNewPlayerCard()).toContain("medicalNewPlayerForm");
});
