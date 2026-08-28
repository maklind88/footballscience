import { expect, test } from "@playwright/test";
import { createMedicalRecommendationRenderer } from "../src/modules/medical/index.mjs";

test("Medical recommendation renderer keeps log, preset, and plan contracts", () => {
  const player = { id: "p1", name: "Mak Player" };
  const record = {
    id: "r1",
    date: "2026-05-31",
    participation: 75,
    actualParticipation: "not-logged",
    comment: "Monitor load",
  };
  const plan = {
    id: "plan1",
    injuryType: "Hamstring",
    status: "modified",
    startDate: "2026-05-30",
    endDate: "2026-06-10",
    participation: 50,
    rtpPhase: "phase-2",
    bodyArea: "Posterior chain",
    reviewDate: "2026-06-03",
    comment: "Controlled return",
    archivedAt: null,
    rtpLibraryProfileName: "Hamstring Strain",
    rtpLibraryEvidenceLevel: "Moderate to high",
    rtpProgramLoadText: ["Rebuild sprint exposure before match return"],
    rtpProgramGateCriteria: ["Pain-free maximal isometric contraction"],
    rtpProgramExercises: ["Nordic hamstring progression | phase: full | demand: max velocity"],
    rtpProgramNextSteps: ["Controlled sprint exposure"],
    rtpProgramHoldRules: ["Pain with acceleration"],
    rtpProgramTracker: {
      gateCriteria: ["passed"],
      nextSteps: ["in-progress"],
      holdRules: ["not-started"],
    },
  };
  const renderer = createMedicalRecommendationRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    canEditMedicalTeam: () => true,
    formatMedicalDateLabel: (value) => value,
    getMedicalPlayerInjuryPlans: (_playerId, options = {}) => (options.includeArchived ? [plan, { ...plan, id: "old", archivedAt: "2026-06-01" }] : [plan]),
    getMedicalPlayerRestrictedLogRecords: (_playerId, options = {}) => (options.includeArchived ? [record, { ...record, id: "old", archivedAt: "2026-06-01" }] : [record]),
    getMedicalRecordStatus: () => ({ label: "Modified", tone: "modified" }),
    getMedicalRtpPhaseOption: () => ({ label: "Phase 2" }),
    getMedicalStatusForParticipation: () => "modified",
    getMedicalStatusOption: () => ({ label: "Modified", tone: "modified" }),
    getSelectedDate: () => "2026-05-31",
    isMedicalInjuryPlanActive: () => true,
    isMedicalItemArchived: (item) => Boolean(item.archivedAt),
    isMedicalPlanCleared: () => false,
    medicalActualParticipationFallback: "not-logged",
    medicalInjuryPlanStatusOptions: [
      { key: "unavailable", label: "Unavailable" },
      { key: "modified", label: "Modified" },
    ],
    medicalParticipationOptions: [0, 10, 50, 75, 100],
    normalizeMedicalActualParticipation: (value) => value ?? "not-logged",
  });

  const log = renderer.renderLog(player);
  expect(log).toContain("data-medical-delete-record");
  expect(log).toContain("Monitor load");

  const recommendationPresets = renderer.renderRecommendationPresets(75, true);
  expect(recommendationPresets).toContain("data-medical-recommendation-preset");
  expect(recommendationPresets).toContain("Warm Up");
  expect(recommendationPresets).toContain('data-medical-participation="75"');

  const actualPresets = renderer.renderActualPresets("not-logged", true);
  expect(actualPresets).toContain("data-medical-actual-value");
  expect(actualPresets).toContain("Not logged");

  const statusOptions = renderer.renderInjuryPlanStatusOptions("modified");
  expect(statusOptions).toContain('<option value="modified" selected>Modified</option>');

  const planList = renderer.renderInjuryPlanList(player);
  expect(planList).toContain("data-medical-edit-injury-plan");
  expect(planList).toContain("data-medical-delete-injury-plan");
  expect(planList).toContain("Hamstring");
  expect(planList).toContain("RTP Library source");
  expect(planList).toContain("Tracker");
  expect(planList).toContain("1/3 passed");
  expect(planList).toContain("Gate criteria");
  expect(planList).toContain("Exercise starters");
  expect(planList).toContain("Nordic hamstring progression");
  expect(planList).toContain("Controlled sprint exposure");

  const rtpProgramCard = renderer.renderRtpProgramSummaryCard(player);
  expect(rtpProgramCard).toContain("Medical RTP Program");
  expect(rtpProgramCard).toContain("Medical-only plan");
  expect(rtpProgramCard).toContain("Hamstring Strain");
  expect(rtpProgramCard).toContain("Progress: Controlled sprint exposure");
  expect(rtpProgramCard).toContain("Pain-free maximal isometric contraction");
  expect(rtpProgramCard).toContain("Exercise starters");
  expect(rtpProgramCard).toContain("Nordic hamstring progression");
  expect(rtpProgramCard).toContain("Rebuild sprint exposure before match return");
  expect(rtpProgramCard).toContain("Private Medical program");
  expect(rtpProgramCard).toContain('data-medical-edit-injury-plan="plan1"');

  expect(renderer.renderPlanListCard(player)).toContain("1 / 1 archived");
  expect(renderer.renderPlanListCard(player)).toContain("Medical Plans");
  expect(renderer.renderLogCard(player)).toContain("Medical Log");
});
