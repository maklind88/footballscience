import { expect, test } from "@playwright/test";
import { createMedicalProfileSummaryRenderer } from "../src/modules/medical/index.mjs";

test("Medical profile summary renderer owns summary card markup", () => {
  const renderer = createMedicalProfileSummaryRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    formatMedicalDateLabel: (value) => `date:${value}`,
    clearanceRoleCount: 3,
    loadGateCount: 4,
  });

  const markup = renderer.render({
    currentRecord: { participation: 75 },
    status: { label: "Modified" },
    phaseLabel: "Phase 2",
    activePlan: { injuryType: "Hamstring", bodyArea: "Left" },
    primaryPlan: { reviewDate: "2026-06-10" },
    windowAverage: 82,
    manualLogCount: 5,
    latestManualRecord: { date: "2026-06-06", participation: 75 },
    activeDays: 12,
    signOffCount: 2,
    gatePassCount: 3,
    coachNote: "No high speed work",
    cleared: false,
  });

  expect(markup).toContain("Medical Profile");
  expect(markup).toContain("75%");
  expect(markup).toContain("Hamstring / Left");
  expect(markup).toContain("date:2026-06-10");
  expect(markup).toContain("2/3");
  expect(markup).toContain("3/4");
  expect(markup).toContain("12 days managed");
  expect(markup).toContain("No high speed work");
});
