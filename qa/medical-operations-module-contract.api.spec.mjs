import { expect, test } from "@playwright/test";
import { createMedicalOperationsRenderer } from "../src/modules/medical/index.mjs";

test("Medical operations renderer owns operations tabs, private system, and coach-safe summary", () => {
  const signal = {
    player: { id: "p1", name: "Mak Player", position: "CM" },
    record: { participation: 75 },
    status: { label: "Modified" },
    trailing: { average: 80, records: [1, 2] },
    actionTone: "medium",
    tone: "medium",
    actionLabel: "Review soon",
    primaryActionDriver: "RTP review",
    actionSeverity: 2,
    label: "Monitor",
    drivers: [{ label: "75% recommendation", severity: 2 }],
    activePlan: null,
  };
  const summary = {
    actionSignals: [signal],
    signals: [signal],
    activeCases: [],
    clearanceBlockers: [],
    actionRequired: 1,
    actualMissing: 0,
    season: {
      plans: [],
      activeCount: 0,
      returnedCount: 0,
      managedDays: 0,
      unavailableDays: 0,
      major: 0,
      moderate: 0,
      minor: 0,
      light: 0,
      topPlayerDays: [],
    },
  };
  const renderer = createMedicalOperationsRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    formatMedicalDateLabel: () => "31 May",
    getMedicalCoachHandoverItems: () => [{ id: "note-1" }],
    getMedicalDailyStats: () => ({ fullCount: 8, modifiedCount: 2, unavailableCount: 1 }),
    getMedicalHistoryDateFilter: () => "all",
    getMedicalHistoryEvents: () => [
      { player: signal.player, date: "2026-05-31", type: "Recommendation", title: "75% / Modified", detail: "RTP", coachShared: true },
      { player: { id: "p2", name: "Ava Player", position: "CB" }, date: "2026-05-30", type: "Case opened", title: "ACL", detail: "Medical restriction / 0%", coachShared: false },
    ],
    getMedicalHistoryPlayerFilter: () => "all",
    getMedicalHistorySearchQuery: () => "",
    getMedicalRtpPhaseOption: () => ({ label: "Return to train" }),
    medicalClearanceRoles: [{ key: "doctor" }],
    medicalLoadGateOptions: [{ key: "load" }],
    renderMedicalCoachHandoverPanel: () => '<section class="handover"></section>',
    renderMedicalDailyHuddle: () => '<section class="huddle"></section>',
  });

  expect(renderer.renderTopMenu("availability", [{ key: "availability", label: "Availability" }])).toContain("medical-ops-top-menu");
  expect(renderer.renderSignalDrivers(signal)).toContain("75% recommendation");
  const overviewMarkup = renderer.renderOverview(summary, "2026-05-31");
  expect(overviewMarkup).toContain("Medical Briefing");
  const privateMarkup = renderer.renderPrivateSystem(summary, "signals", "2026-05-31");
  expect(privateMarkup).toContain("medical-operations-system");
  expect(privateMarkup).toContain("medical-ops-signals-table");
  expect(privateMarkup).toContain("Mak Player");
  const rtpMarkup = renderer.renderPrivateSystem(summary, "rtp-library", "2026-05-31");
  expect(rtpMarkup).toContain("RTP Library");
  expect(rtpMarkup).toContain("Coach-Safe RTP Status");
  expect(rtpMarkup).toContain("Top RTP Signals");
  const historyMarkup = renderer.renderHistory();
  expect(historyMarkup).toContain("data-medical-history-filter-form");
  expect(historyMarkup).toContain("data-medical-history-search");
  expect(historyMarkup).toContain("data-medical-history-date-filter");
  expect(historyMarkup).toContain("data-medical-history-player-filter");
  expect(historyMarkup).toContain("Recommendation");
  const coachMarkup = renderer.renderCoachSafeSummary("2026-05-31");
  expect(coachMarkup).toContain("Coach-Safe Summary");
  expect(coachMarkup).toContain("Coach notes");
});
