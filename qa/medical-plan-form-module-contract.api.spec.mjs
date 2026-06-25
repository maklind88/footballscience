import { expect, test } from "@playwright/test";
import { createMedicalPlanFormRenderer } from "../src/modules/medical/index.mjs";

test("Medical plan form renderer keeps injury plan and clearance form contracts", () => {
  const player = { id: "p1", name: "Mak Player" };
  const plan = {
    id: "plan1",
    rtpPhase: "phase-2",
    clearance: { medical: true },
    gates: { pain: "pass" },
  };
  const renderer = createMedicalPlanFormRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    getActiveMedicalInjuryPlan: () => plan,
    getMedicalInjuryPlanDraft: () => ({
      planId: "plan1",
      injuryType: "Hamstring",
      bodyArea: "Posterior chain",
      startDate: "2026-05-31",
      duration: 14,
      durationUnit: "days",
      status: "modified",
      rtpPhase: "phase-2",
      participation: 50,
      reviewDate: "2026-06-10",
      phase: "Week 1-2 controlled rehab",
      comment: "Internal",
      coachNote: "Coach-safe",
      shareWithCoach: true,
      rtpLibraryProfileId: "hamstring-strain",
      rtpLibraryProfileName: "Hamstring Strain",
      rtpLibraryEvidenceLevel: "Moderate to high",
      rtpLibrarySummary: "Sprint exposure must be rebuilt before match return.",
      rtpProgramPhases: ["Rehab: restore pain-free strength", "Modified football: controlled acceleration"],
      rtpProgramLoadText: ["Rebuild high-speed running before repeated sprint exposure"],
      rtpProgramRiskFactors: ["Previous hamstring injury", "Sprint exposure gap"],
      rtpProgramWarningPoints: ["Pain during acceleration"],
      rtpProgramGateCriteria: ["Pain-free maximal isometric contraction", "Tolerates repeated high-speed running"],
      rtpProgramNextSteps: ["Controlled acceleration session", "Position-specific sprint exposure"],
      rtpProgramHoldRules: ["Pain above acceptable threshold"],
    }),
    getMedicalPlayerInjuryPlans: () => [plan],
    getSelectedDate: () => "2026-05-31",
    isMedicalPlanCleared: () => false,
    medicalClearanceRoles: [{ key: "medical", label: "Medical" }],
    medicalInjuryDurationPresets: [{ duration: 14, unit: "days", label: "2 weeks" }],
    medicalLoadGateOptions: [{ key: "pain", label: "Pain" }],
    normalizeMedicalClearance: (value) => value,
    normalizeMedicalLoadGates: (value) => value,
    renderMedicalDurationUnitOptions: () => '<option value="days" selected>Days</option>',
    renderMedicalGateOptions: () => '<option value="pass" selected>Pass</option>',
    renderMedicalInjuryPlanStatusOptions: () => '<option value="modified" selected>Modified</option>',
    renderMedicalParticipationOptions: () => '<option value="50" selected>50%</option>',
    renderMedicalRtpPhaseOptions: () => '<option value="phase-2" selected>Phase 2</option>',
  });

  const form = renderer.renderInjuryPlanForm(player, true);
  expect(form).toContain('id="medicalInjuryPlanForm"');
  expect(form).toContain('name="planId" value="plan1"');
  expect(form).toContain("RTP Library starter");
  expect(form).toContain("Hamstring Strain");
  expect(form).toContain('name="rtpLibraryProfileId" value="hamstring-strain"');
  expect(form).toContain("Player RTP program starter");
  expect(form).toContain("RTP phases");
  expect(form).toContain("Gate criteria");
  expect(form).toContain("Pain-free maximal isometric contraction");
  expect(form).toContain('name="rtpProgramPhases"');
  expect(form).toContain("data-medical-duration-preset");
  expect(form).toContain("data-medical-cancel-injury-plan-edit");
  expect(form).toContain('datalist id="medicalInjuryTypes"');

  const checklist = renderer.renderClearanceChecklist(player, true);
  expect(checklist).toContain('id="medicalClearanceForm"');
  expect(checklist).toContain('name="clearance.medical" checked');
  expect(checklist).toContain('name="gates.pain"');
  expect(checklist).toContain("Save clearance");

  const emptyRenderer = createMedicalPlanFormRenderer({
    escapeHtml: (value) => String(value ?? ""),
    getActiveMedicalInjuryPlan: () => null,
    getMedicalPlayerInjuryPlans: () => [],
    getSelectedDate: () => "2026-05-31",
  });
  expect(emptyRenderer.renderClearanceChecklist(player, true)).toContain("No plan");
});
