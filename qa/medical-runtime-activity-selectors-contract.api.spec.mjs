import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMedicalRuntimeActivitySelectors } from "../src/modules/medical/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function createSelectors(overrides = {}) {
  const draftMap = new Map();
  const state = {
    selectedDate: "2026-05-31",
    players: [
      { id: "p1", name: "Alex Morgan", updatedAt: "2026-05-30T08:00:00.000Z" },
      { id: "p2", name: "Sam Kerr", status: "injured", updatedAt: "2026-05-31T08:00:00.000Z" },
      { id: "p3", name: "Temp Player", temporaryFrom: "2026-06-01", temporaryTo: "2026-06-05" },
      { id: "p4", name: "Removed Player" },
      { id: "p5", name: "Archived Player", archivedAt: "2026-05-01T00:00:00.000Z" },
      { id: "undated-guest", name: "Undated Guest", rosterType: "guest", countsInSquad: false },
    ],
    records: [
      {
        id: "r1",
        playerId: "p1",
        date: "2026-05-31",
        status: "modified",
        participation: 75,
        coachNote: "Limit sprinting",
        shareWithCoach: true,
        updatedAt: "2026-05-31T10:00:00.000Z",
        createdAt: "2026-05-31T09:00:00.000Z",
      },
    ],
    injuryPlans: [
      {
        id: "plan-1",
        playerId: "p1",
        startDate: "2026-05-20",
        endDate: "2026-06-10",
        reviewDate: "2026-06-02",
        status: "full",
        participation: 100,
        rtpPhase: "full-training",
        injuryType: "Hamstring",
        bodyArea: "Left",
        clearance: { doctor: true },
        gates: { running: "pass" },
        coachNote: "Build gradually",
        shareWithCoach: true,
        updatedAt: "2026-05-30T09:00:00.000Z",
        createdAt: "2026-05-20T09:00:00.000Z",
      },
    ],
  };
  const selectors = createMedicalRuntimeActivitySelectors({
    addCalendarDays: (date, days) => {
      const next = new Date(date);
      next.setDate(next.getDate() + Number(days || 0));
      return next;
    },
    canEditMedicalTeam: () => false,
    ensureMedicalState: () => {},
    formatDateValue: (date) => new Date(date).toISOString().slice(0, 10),
    getCurrentUser: () => ({ teamName: "North Carolina Courage" }),
    getFormValues: (form) => form.values || {},
    getMedicalEntityUpdatedMs: (entity = {}) => Date.parse(entity.updatedAt || entity.createdAt || "") || 0,
    getMedicalPlayerAvailabilityStatusOption: (player) => ({ label: player?.status === "injured" ? "Injured" : "Unavailable" }),
    getMedicalPlayerSquadAvailabilityBlockReason: (player) => player?.status === "injured" ? "Blocked by Squad Room" : "",
    getMedicalRtpPhaseOption: (phaseKey) => ({ key: phaseKey, status: "full", participation: 100 }),
    getMedicalState: () => state,
    getMedicalStatusOptionForDate: (statusKey) => ({ key: statusKey, label: statusKey === "modified" ? "Modified" : statusKey }),
    getPlatformStructureState: () => ({}),
    getPlatformTeamDisplayName: () => "North Carolina Courage",
    getRemovedSquadPlayerIdSet: () => new Set(["p4"]),
    getScheduleEventsForDate: (dateValue) =>
      dateValue === "2026-05-31" ? [{ type: "match", title: "Matchday" }] : [{ type: "training", title: "Training" }],
    getScheduleMainEvent: (events) => events[0] ?? null,
    isAdmin: () => false,
    isDateValue: (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")),
    isItemArchived: (item) => Boolean(item?.archivedAt),
    isPlayerBlockedBySquadAvailability: (player) => player?.status === "injured",
    isPlayerRemovedFromSquad: (player, removedIds) => removedIds.has(player.id),
    isScheduleSessionEvent: (event) => event?.type === "training",
    isTemporaryPlayerProfile: (player) => player?.countsInSquad === false || Boolean(player?.temporaryFrom || player?.temporaryTo),
    isTemporaryPlayerProfileActiveOnDate: (player, dateValue) => player.temporaryFrom <= dateValue && player.temporaryTo >= dateValue,
    medicalActualParticipationFallback: "not-logged",
    medicalClearanceRoles: [{ key: "doctor" }, { key: "physio" }],
    medicalInjuryPlanDraftsByPlayerId: draftMap,
    medicalInjuryPlanStatusOptions: [{ key: "full" }, { key: "modified" }, { key: "unavailable" }],
    medicalLoadGateOptions: [{ key: "running" }, { key: "contact" }],
    medicalWindowLength: 3,
    normalizeClearance: (clearance = {}) => ({ doctor: Boolean(clearance.doctor), physio: Boolean(clearance.physio) }),
    normalizeLoadGates: (gates = {}) => ({ running: gates.running || "pending", contact: gates.contact || "pending" }),
    normalizeParticipation: (value, fallback = 100) => (Number.isFinite(Number(value)) ? Number(value) : fallback),
    normalizePlatformText: (value, fallback = "") => String(value || fallback || "").trim(),
    normalizeShareValue: (value) => value === true || value === "true" || value === "on" || value === "1",
    parseDateValue: (value) => new Date(`${value}T00:00:00.000Z`),
    scheduleEventTypes: { match: { label: "Match" }, training: { label: "Training" } },
    ...overrides,
  });
  return { draftMap, selectors, state };
}

test("Medical runtime activity selectors own read and draft logic outside app-runtime", () => {
  const app = readProjectFile("app-runtime.js");
  const accessors = readProjectFile("src/modules/medical/medical-runtime-accessors.mjs");
  const runtimeService = readProjectFile("src/modules/medical/medical-runtime-service.mjs");
  const activity = readProjectFile("src/modules/medical/medical-runtime-activity-selectors.mjs");
  const index = readProjectFile("src/modules/medical/index.mjs");

  expect(typeof createMedicalRuntimeActivitySelectors).toBe("function");
  expect(app).toContain("configureMedicalRuntimeAccessors(() => medicalRuntimeService);");
  expect(runtimeService).toContain("createMedicalRuntimeFacade({");
  expect(accessors).toContain('export function getActiveMedicalPlayers(...args) { return callFacade("getActiveMedicalPlayers", args); }');
  expect(app).not.toContain("createMedicalRuntimeActivitySelectors({");
  expect(app).not.toContain("function getActiveMedicalPlayers() {");
  expect(app).not.toContain("function getMedicalRecommendationActivityContext(dateValue = medicalState?.selectedDate)");
  expect(app).not.toContain("function normalizeMedicalInjuryPlanDraft(draft = {}, playerId = draft.playerId)");
  expect(activity).toContain("function getActiveMedicalPlayers()");
  expect(activity).toContain("function getMedicalRecommendationActivityContext(");
  expect(index).toContain('export * from "./medical-runtime-activity-selectors.mjs";');
  expect(index).toContain('export * from "./medical-runtime-facade.mjs";');
});

test("Medical runtime activity selectors stay read-only and do not own writes", () => {
  const activity = readProjectFile("src/modules/medical/medical-runtime-activity-selectors.mjs");

  expect(activity).not.toContain("writeMedicalState");
  expect(activity).not.toContain("commitMedicalClinicalState");
  expect(activity).not.toContain("updateMedicalDatabaseSyncStatus");
  expect(activity).not.toContain("localStorage");
  expect(activity).not.toContain("rawDataSafetySetItem");
  expect(activity).not.toContain("recordMedicalDatabaseSyncEvent");
});

test("Medical runtime activity selectors preserve player, record, activity, and draft behavior", () => {
  const { draftMap, selectors } = createSelectors();

  expect(selectors.getMedicalHeroTeamName()).toBe("North Carolina Courage");
  expect(selectors.getMedicalAccessLabel()).toBe("Coach view");
  expect(selectors.getActiveMedicalPlayers().map((player) => player.id)).toEqual(["p1", "p2", "p3", "undated-guest"]);
  expect(selectors.getActiveMedicalPlayersForDate("2026-05-31").map((player) => player.id)).toEqual(["p1", "p2"]);
  expect(selectors.getActiveMedicalPlayersForDate("2026-06-02").map((player) => player.id)).toEqual(["p1", "p2", "p3"]);
  expect(selectors.getSelectedMedicalPlayer()).toMatchObject({ id: "p1" });

  expect(selectors.getLatestMedicalRecord("p2", "2026-05-31")).toMatchObject({
    id: "squad-availability:p2:2026-05-31",
    status: "unavailable",
    participation: 0,
  });
  expect(selectors.getLatestMedicalRecord("p1", "2026-05-31")).toMatchObject({
    id: "r1",
    status: "modified",
  });
  expect(selectors.getMedicalPlayerRestrictedLogRecords("p1")).toHaveLength(1);
  expect(selectors.getMedicalRecordStatus(selectors.getLatestMedicalRecord("p1")).label).toBe("Modified");
  expect(selectors.getMedicalCoachComment(selectors.getLatestMedicalRecord("p1"))).toBe("Limit sprinting");
  expect(selectors.getMedicalRtpLibraryProfiles().length).toBeGreaterThanOrEqual(15);
  expect(selectors.getMedicalRtpLibraryProfile("hamstring-strain")).toMatchObject({
    name: "Hamstring Strain",
    bodyArea: "Posterior thigh",
  });
  const starterDraft = selectors.getMedicalRtpLibraryStarterDraft("hamstring-strain", "p1");
  expect(starterDraft).toMatchObject({
    playerId: "p1",
    injuryType: "Hamstring Strain",
    rtpLibraryProfileId: "hamstring-strain",
    shareWithCoach: false,
  });
  expect(starterDraft.rtpProgramPhases.length).toBeGreaterThan(0);
  expect(starterDraft.rtpProgramGateCriteria).toContain("pain-free maximal isometric contraction");
  expect(starterDraft.rtpProgramExercises.join(" ")).toContain("Nordic hamstring progression");

  const caseStarterDraft = selectors.getMedicalRtpLibraryStarterDraftForPlan("hamstring-strain", "plan-1");
  expect(caseStarterDraft).toMatchObject({
    planId: "plan-1",
    playerId: "p1",
    injuryType: "Hamstring",
    bodyArea: "Left",
    rtpLibraryProfileId: "hamstring-strain",
    rtpLibraryProfileName: "Hamstring Strain",
    shareWithCoach: true,
  });
  expect(caseStarterDraft.startDate).toBe("2026-05-20");
  expect(caseStarterDraft.rtpProgramGateCriteria).toContain("pain-free maximal isometric contraction");
  expect(caseStarterDraft.rtpProgramExercises.join(" ")).toContain("Nordic hamstring progression");

  expect(selectors.getMedicalRecommendationActivityContext("2026-05-31")).toMatchObject({
    type: "match",
    scheduleLabel: "Matchday",
    isRecommendable: true,
  });
  expect(selectors.getMedicalWindowDates()).toEqual(["2026-05-31", "2026-06-01", "2026-06-02"]);
  expect(selectors.getMedicalPastWindowDates()).toEqual(["2026-05-29", "2026-05-30", "2026-05-31"]);
  expect(selectors.getMedicalReviewAlerts("2026-05-31")).toHaveLength(1);

  const monthlySelectors = createSelectors({
    medicalWindowLength: 7,
    getScheduleEventsForDate: (dateValue) => {
      if (dateValue === "2026-05-02") {
        return [{ type: "off", title: "No team event" }];
      }
      if (dateValue === "2026-05-04") {
        return [{ type: "match", title: "Matchday" }];
      }
      return [{ type: "training", title: "Training" }];
    },
  }).selectors;
  expect(monthlySelectors.getMedicalMonthToDateDates(new Date("2026-05-04T12:00:00.000Z"))).toEqual([
    "2026-05-01",
    "2026-05-03",
    "2026-05-04",
  ]);
  expect(monthlySelectors.getMedicalPastWindowDates("2026-05-04")).toEqual([
    "2026-04-29",
    "2026-04-30",
    "2026-05-01",
    "2026-05-03",
    "2026-05-04",
  ]);

  const form = {
    values: {
      playerId: "p1",
      duration: "2",
      shareWithCoach: "on",
      rtpProgramPhases: "Rehab: restore capacity\nModified: controlled football",
      rtpProgramGateCriteria: "Pain-free acceleration\nRepeated sprint block completed",
      rtpProgramExercises: "Nordic hamstring progression\nTempo run exposure",
      rtpProgramNextSteps: "Controlled acceleration session; Team rondo integration",
      rtpProgramHoldRules: "Pain increase\nNext-day symptom spike",
      rtpProgramTrackerGate0: "passed",
      rtpProgramTrackerGate1: "in-progress",
      rtpProgramTrackerNext0: "in-progress",
      rtpProgramTrackerNext1: "not-started",
      rtpProgramTrackerHold0: "hold",
    },
    querySelector: (selector) => selector === "[name='shareWithCoach']" ? { checked: true } : { value: "p1" },
  };
  expect(selectors.persistMedicalInjuryPlanDraftFromForm(form)).toMatchObject({
    playerId: "p1",
    duration: 2,
    shareWithCoach: true,
    rtpProgramPhases: ["Rehab: restore capacity", "Modified: controlled football"],
    rtpProgramGateCriteria: ["Pain-free acceleration", "Repeated sprint block completed"],
    rtpProgramExercises: ["Nordic hamstring progression", "Tempo run exposure"],
    rtpProgramNextSteps: ["Controlled acceleration session", "Team rondo integration"],
    rtpProgramHoldRules: ["Pain increase", "Next-day symptom spike"],
    rtpProgramTracker: {
      gateCriteria: ["passed", "in-progress"],
      nextSteps: ["in-progress", "not-started"],
      holdRules: ["hold", "not-started"],
    },
  });
  expect(draftMap.has("p1")).toBe(true);
  selectors.clearMedicalInjuryPlanDraft("p1");
  expect(draftMap.has("p1")).toBe(false);
});

test("Medical runtime activity selectors only apply Squad availability blocks on eligible dates", () => {
  const { selectors, state } = createSelectors({
    getMedicalPlayerAvailabilityStatusOption: (player, dateValue) => ({
      label: player?.status === "injured" && dateValue >= "2026-06-01" ? "Injured" : "Available",
    }),
    getMedicalPlayerSquadAvailabilityBlockReason: (player, dateValue) =>
      player?.status === "injured" && dateValue >= "2026-06-01" ? "Blocked by Squad Room" : "",
    isPlayerBlockedBySquadAvailability: (player, dateValue) => player?.status === "injured" && dateValue >= "2026-06-01",
  });
  state.players.push({
    id: "p6",
    name: "Future Injury",
    status: "injured",
    updatedAt: "2026-06-01T08:00:00.000Z",
  });

  expect(selectors.getLatestMedicalRecord("p6", "2026-05-31")).toBeNull();
  expect(selectors.getMedicalRecommendationBlockReason("p6", 100, "2026-05-31")).toBe("");
  expect(selectors.getLatestMedicalRecord("p6", "2026-06-01")).toMatchObject({
    id: "squad-availability:p6:2026-06-01",
    status: "unavailable",
    participation: 0,
    coachNote: "Injured - not available for team activity",
  });
  expect(selectors.getMedicalRecommendationBlockReason("p6", 100, "2026-06-01")).toBe("Blocked by Squad Room");
});
