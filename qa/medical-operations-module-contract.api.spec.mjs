import { expect, test } from "@playwright/test";
import { createMedicalOperationsRenderer, getMedicalRtpActionQueueSummary, medicalOperationsTabOptions } from "../src/modules/medical/index.mjs";

test("Medical operations renderer owns operations tabs, private system, and coach-safe summary", () => {
  expect(medicalOperationsTabOptions.map((tab) => tab.key)).toEqual([
    "availability",
    "signals",
    "cases",
    "programs",
    "history",
    "rtp-library",
    "season",
  ]);

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
    activeCases: [
      {
        player: signal.player,
        plan: {
          id: "plan-1",
          injuryType: "Hamstring Strain",
          bodyArea: "Posterior thigh",
          startDate: "2026-05-20",
          endDate: "2026-06-10",
          participation: 50,
          rtpPhase: "modified-team",
          rtpLibraryProfileId: "hamstring-strain",
          rtpLibraryProfileName: "Hamstring Strain",
          rtpLibraryEvidenceLevel: "Moderate to high",
          rtpProgramGateCriteria: ["pain-free maximal isometric contraction"],
          rtpProgramExercises: ["Nordic hamstring progression | phase: full | demand: max velocity"],
          rtpProgramNextSteps: ["linear sprint exposure"],
          rtpProgramHoldRules: ["pain with walking after 48 hours"],
          rtpProgramTracker: {
            gateCriteria: ["passed"],
            nextSteps: ["in-progress"],
            holdRules: ["hold"],
          },
        },
        severity: { tone: "medium", label: "Moderate" },
        daysRemaining: 10,
        elapsedDays: 4,
        review: { label: "Review due" },
        clearance: { signOffCount: 1, gatePassCount: 0 },
      },
      {
        player: { id: "p2", name: "Case Player", position: "CB" },
        plan: {
          id: "plan-2",
          injuryType: "ACL reconstruction",
          bodyArea: "Knee",
          startDate: "2026-05-18",
          endDate: "2026-08-10",
          participation: 0,
          rtpPhase: "medical-restriction",
        },
        severity: { tone: "high", label: "Major" },
        daysRemaining: 60,
        elapsedDays: 14,
        review: { label: "RTP starter needed" },
        clearance: { signOffCount: 0, gatePassCount: 0 },
      },
    ],
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
  const casesMarkup = renderer.renderPrivateSystem(summary, "cases", "2026-05-31");
  expect(casesMarkup).toContain("Active player RTP programs");
  expect(casesMarkup).toContain("Saved Medical Plans using RTP Library starters");
  expect(casesMarkup).toContain("RTP Action Queue");
  expect(casesMarkup).toContain("What Medical should handle next");
  expect(casesMarkup).toContain("Blocked by hold rule");
  expect(casesMarkup).toContain("Hold progression");
  expect(casesMarkup).toContain('data-medical-rtp-focus="hold"');
  expect(casesMarkup).toContain('data-medical-rtp-focus-group="holdRules"');
  expect(casesMarkup).toContain('data-medical-rtp-focus-index="0"');
  expect(casesMarkup).toContain("Hamstring Strain");
  expect(casesMarkup).toContain("Gate criteria");
  expect(casesMarkup).toContain("Exercise starters");
  expect(casesMarkup).toContain("Nordic hamstring progression");
  expect(casesMarkup).toContain("Tracker");
  expect(casesMarkup).toContain("1/3 passed");
  expect(casesMarkup).toContain("Hold: pain with walking after 48 hours");
  expect(casesMarkup).toContain("Open Medical Plan");
  expect(casesMarkup).toContain("RTP Starter Queue");
  expect(casesMarkup).toContain("active case needs a Library guide");
  expect(casesMarkup).toContain("Medical Plan remains source");
  expect(casesMarkup).toContain("Medical approves program");
  expect(casesMarkup).toContain("data-medical-rtp-case-linker-form");
  expect(casesMarkup).toContain("data-medical-plan-id=\"plan-2\"");
  expect(casesMarkup).toContain("Best match: ACL Reconstruction RTP");
  expect(casesMarkup).toContain("Guide to load");
  expect(casesMarkup).toContain("Open Medical Plan draft");
  expect(casesMarkup).toContain("Nothing becomes active until Medical saves the plan.");
  expect(casesMarkup).toContain("Load focus");
  expect(casesMarkup).toContain("Risk watch");
  expect(casesMarkup).toContain("Warning point");
  expect(casesMarkup.indexOf("medical-ops-cases-table")).toBeLessThan(casesMarkup.indexOf("RTP Starter Queue"));
  expect(casesMarkup.indexOf("medical-ops-cases-table")).toBeLessThan(casesMarkup.indexOf("Active player RTP programs"));
  const programsMarkup = renderer.renderPrivateSystem(summary, "programs", "2026-05-31");
  expect(programsMarkup).toContain("medical-rtp-programs-workspace");
  expect(programsMarkup).not.toContain("medical-rtp-programs-stats");
  expect(programsMarkup).not.toContain("Program starters");
  expect(programsMarkup).not.toContain("medical-rtp-program-activation");
  expect(programsMarkup).not.toContain("Program workflow");
  expect(programsMarkup).not.toContain("Convert an active Medical case into a player RTP program");
  expect(programsMarkup).not.toContain("medical-rtp-programs-header");
  expect(programsMarkup).not.toContain("Medical-owned RTP command center");
  expect(programsMarkup).not.toContain("One flow: player case, Library guide, Medical Plan, Player Profile");
  expect(programsMarkup).not.toContain("medical-rtp-case-workspace");
  expect(programsMarkup).not.toContain("Active player RTP programs");
  expect(programsMarkup).not.toContain("Saved Medical Plans using RTP Library starters");
  expect(programsMarkup).not.toContain("medical-rtp-exercise-drawer");
  expect(programsMarkup).not.toContain("medical-rtp-exercise-launcher");
  expect(programsMarkup).not.toContain("data-medical-rtp-exercise-open");
  expect(programsMarkup).not.toContain("data-medical-rtp-exercise-overlay");
  expect(programsMarkup).not.toContain("Clinical exercise catalogue for RTP programs");
  expect(programsMarkup).not.toContain("Open Exercise Bank");
  expect(programsMarkup).not.toContain("RTP Starter Queue");
  expect(programsMarkup).not.toContain("medical-rtp-case-linker");
  expect(programsMarkup).not.toContain("RTP Action Queue");
  const rtpMarkup = renderer.renderPrivateSystem(summary, "rtp-library", "2026-05-31");
  expect(rtpMarkup).not.toContain("medical-rtp-library-hero");
  expect(rtpMarkup).not.toContain("<h2>RTP Library</h2>");
  expect(rtpMarkup).not.toContain("Medical-safe injury knowledge");
  expect(rtpMarkup).toContain("Clinical search");
  expect(rtpMarkup).toContain("Movement plane");
  expect(rtpMarkup).toContain("RTP injury guides");
  expect(rtpMarkup).not.toContain("RTP Exercise Bank");
  expect(rtpMarkup).not.toContain("Professional exercise catalogue");
  expect(rtpMarkup).not.toContain('data-medical-rtp-exercise-catalog');
  expect(rtpMarkup).not.toContain('data-medical-rtp-exercise-search');
  expect(rtpMarkup).not.toContain('data-medical-rtp-exercise-filter="tissue"');
  expect(rtpMarkup).not.toContain('data-medical-rtp-exercise-filter="phase"');
  expect(rtpMarkup).not.toContain('data-medical-rtp-exercise-filter="risk"');
  expect(rtpMarkup).toContain("Add injury guide");
  expect(rtpMarkup).toContain("Medical authoring");
  expect(rtpMarkup).toContain("Copy guide template");
  expect(rtpMarkup).toContain("guides visible");
  expect(rtpMarkup).toContain("Open guide");
  expect(rtpMarkup).toContain('data-medical-rtp-library-filter="movement"');
  expect(rtpMarkup).toContain("data-clinical-symptoms");
  expect(rtpMarkup).toContain("data-clinical-mechanism");
  expect(rtpMarkup).toContain("data-clinical-red-flags");
  expect(rtpMarkup).toContain("data-clinical-position-demand");
  expect(rtpMarkup).not.toContain('data-medical-rtp-library-filter="position"');
  expect(rtpMarkup).not.toContain('data-medical-rtp-library-filter="season"');
  expect(rtpMarkup).not.toContain('data-medical-rtp-library-filter="sex"');
  expect(rtpMarkup).not.toContain('data-medical-rtp-library-filter="level"');
  expect(rtpMarkup).not.toContain("Search injury, system, body area, symptom, position or risk");
  expect(rtpMarkup).not.toContain("Open profile");
  expect(rtpMarkup).not.toContain("Evidence and expert consensus are separated in every profile.");
  expect(rtpMarkup).toContain('data-medical-open-rtp-profile="hamstring-strain"');
  expect(rtpMarkup).toContain('data-medical-open-rtp-profile="distal-hamstring-injury"');
  expect(rtpMarkup).toContain('data-medical-rtp-profile-modal');
  expect(rtpMarkup).not.toContain('data-medical-rtp-profile-modal="hamstring-strain"');
  expect(rtpMarkup).toContain('role="dialog"');
  expect(rtpMarkup).toContain('aria-haspopup="dialog"');
  expect(rtpMarkup).not.toContain("<details");
  expect(rtpMarkup).not.toContain("<summary");
  expect(rtpMarkup).toContain("200</strong> guides visible");
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

test("Medical RTP action queue prioritizes hold, ready review, and exposure decisions", () => {
  const summary = getMedicalRtpActionQueueSummary([
    {
      player: { id: "p1", name: "Hold Player", position: "FW" },
      plan: {
        id: "plan-hold",
        injuryType: "Hamstring Strain",
        bodyArea: "Posterior thigh",
        rtpLibraryProfileId: "hamstring-strain",
        rtpProgramGateCriteria: ["pain-free maximal isometric contraction"],
        rtpProgramNextSteps: ["linear sprint exposure"],
        rtpProgramHoldRules: ["pain with walking after 48 hours"],
        rtpProgramTracker: {
          gateCriteria: ["passed"],
          nextSteps: ["in-progress"],
          holdRules: ["hold"],
        },
      },
      review: { label: "Review 31 May", severity: 2 },
    },
    {
      player: { id: "p2", name: "Ready Player", position: "CM" },
      plan: {
        id: "plan-ready",
        injuryType: "Adductor Strain",
        rtpLibraryProfileName: "Adductor Strain",
        rtpProgramGateCriteria: ["pain-free squeeze"],
        rtpProgramTracker: { gateCriteria: ["passed"] },
      },
      review: { label: "Review next week", severity: 0 },
    },
    {
      player: { id: "p3", name: "Exposure Player", position: "FB" },
      plan: {
        id: "plan-exposure",
        injuryType: "Soleus Strain",
        rtpLibraryProfileName: "Soleus Strain",
        rtpProgramNextSteps: ["controlled accelerations"],
        rtpProgramTracker: { nextSteps: ["in-progress"] },
      },
      review: { label: "No review date", severity: 0 },
    },
  ]);

  expect(summary.total).toBe(3);
  expect(summary.hold).toBe(1);
  expect(summary.ready).toBe(1);
  expect(summary.exposure).toBe(1);
  expect(summary.items.map((item) => item.label)).toEqual([
    "Blocked by hold rule",
    "Ready for Medical review",
    "Needs next exposure decision",
  ]);
  expect(summary.items[0]).toMatchObject({
    planId: "plan-hold",
    action: "Hold progression",
    tone: "high",
  });
});

test("Medical history renders restricted items in batches of 25", () => {
  const events = Array.from({ length: 30 }, (_, index) => ({
    player: { id: `p-${index}`, name: `Player ${index + 1}`, position: "Defender" },
    date: `2026-06-${String(26 - (index % 3)).padStart(2, "0")}`,
    type: "Recommendation",
    title: `${index + 1}% / Rehab`,
    detail: "Medical restriction",
    coachShared: index % 2 === 0,
  }));
  const renderer = createMedicalOperationsRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    formatMedicalDateLabel: (value) => value,
    getMedicalHistoryEvents: () => events,
  });

  const markup = renderer.renderHistory();

  expect((markup.match(/data-medical-history-row(\s|>)/g) || []).length).toBe(30);
  expect((markup.match(/data-medical-history-row-visible="true"/g) || []).length).toBe(25);
  expect((markup.match(/data-medical-history-row-visible="false"/g) || []).length).toBe(5);
  expect(markup).toContain('data-medical-history-show-more');
  expect(markup).toContain("Showing 25 of 30");
  expect(markup).not.toContain("restricted items");
});
