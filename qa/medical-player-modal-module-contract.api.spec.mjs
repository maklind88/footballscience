import { expect, test } from "@playwright/test";
import { createMedicalPlayerModalRenderer } from "../src/modules/medical/index.mjs";

test("Medical player modal renderer keeps edit and coach-safe modal contracts", () => {
  const player = { id: "p1", name: "Mak Player", number: "8", position: "CM" };
  const record = {
    participation: 75,
    status: "modified",
    actualParticipation: "not-logged",
    rtpPhase: "phase-2",
    coachNote: "Limit sprinting",
    shareWithCoach: true,
  };
  const baseOptions = {
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    formatMedicalDateLabel: (value) => value,
    getLatestMedicalRecord: () => record,
    getMedicalCoachComment: () => "Limit sprinting",
    getMedicalPlayerSquadAvailabilityBlockReason: () => "",
    getMedicalRecommendationActivityContext: () => ({
      isRecommendable: true,
      type: "training",
      recommendationLabel: "Training recommendation",
      blockReason: "",
    }),
    getMedicalRecordStatus: () => ({ label: "Modified", tone: "modified" }),
    getMedicalRtpPhaseForRecommendation: () => "phase-2",
    getMedicalRtpPhaseOption: () => ({ label: "Phase 2" }),
    getMedicalStatusForParticipation: () => "modified",
    getMedicalStatusOption: () => ({ defaultParticipation: 75 }),
    getMedicalStatusOptionForDate: () => ({ label: "Modified" }),
    getMedicalWindowDates: () => ["2026-05-31"],
    getMedicalPlayerRestrictedLogRecords: () => [record],
    getPlayerModalOpen: () => true,
    getPlayerModalTab: () => "availability",
    getSelectedDate: () => "2026-05-31",
    getSelectedMedicalPlayer: () => player,
    medicalActualParticipationFallback: "not-logged",
    medicalPlayerModalTabOptions: [
      { key: "availability", label: "Availability" },
      { key: "plan", label: "Plan" },
      { key: "profile", label: "Profile" },
    ],
    normalizeMedicalPlayerModalTab: (tab) => tab,
    renderMedicalActualPresets: () => '<div data-actual-presets></div>',
    renderMedicalClearanceChecklist: () => '<section data-clearance></section>',
    renderMedicalInjuryPlanForm: () => '<form id="medicalInjuryPlanForm"></form>',
    renderMedicalLog: () => '<article data-medical-log></article>',
    renderMedicalLogCard: () => '<article data-log-card></article>',
    renderMedicalNewPlayerCard: () => '<article data-new-player></article>',
    renderMedicalPlanListCard: () => '<article data-plan-list></article>',
    renderMedicalActualParticipationOptions: () => '<option value="not-logged">Not logged</option>',
    renderMedicalParticipationOptions: () => '<option value="75">75%</option>',
    renderMedicalPlayerAvatar: () => '<span data-avatar></span>',
    renderMedicalPlayerProfileSummary: () => '<section data-profile-summary></section>',
    renderMedicalRecommendationPresets: () => '<div data-recommendation-presets></div>',
    renderMedicalRtpPhaseOptions: () => '<option value="phase-2">Phase 2</option>',
    renderMedicalStatusOptions: () => '<option value="modified">Modified</option>',
  };

  const editRenderer = createMedicalPlayerModalRenderer({
    ...baseOptions,
    canEditMedicalTeam: () => true,
  });
  const editModal = editRenderer.renderPlayerModal();
  expect(editModal).toContain("medical-modal-card");
  expect(editModal).toContain("data-medical-modal-tab");
  expect(editModal).toContain('id="medicalRecommendationForm"');
  expect(editModal).toContain("data-medical-recommendation-preview");
  expect(editModal).toContain("data-medical-close-modal");

  const coachRenderer = createMedicalPlayerModalRenderer({
    ...baseOptions,
    canEditMedicalTeam: () => false,
  });
  const coachModal = coachRenderer.renderPlayerModal();
  expect(coachModal).toContain("medical-coach-modal");
  expect(coachModal).toContain("Approved Share");
  expect(coachModal).toContain("Limit sprinting");

  const selectedPanel = editRenderer.renderSelectedPanel();
  expect(selectedPanel).toContain('id="medicalSidebarRecommendationForm"');
  expect(selectedPanel).toContain('id="medicalPlayerProfileForm"');
  expect(selectedPanel).toContain('data-medical-remove-player="p1"');
  expect(selectedPanel).toContain("data-medical-log");
});
