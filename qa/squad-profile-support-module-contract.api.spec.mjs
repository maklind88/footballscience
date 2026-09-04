import { expect, test } from "@playwright/test";
import { createSquadProfileSupportRenderer, getSquadTrainingAvailabilitySummary } from "../src/modules/squad/index.mjs";
import { createSquadTrainingAvailabilityContext } from "../src/modules/squad/squad-training-availability-summary.mjs";

test("Squad profile support renderer owns option lists, support panels, and add-player modal", () => {
  const player = {
    id: "p1",
    name: "Mak Player",
    futureData: {
      matchData: [1],
      load: [1, 2],
      minutes: [],
      performanceNotes: "Strong",
      scoutingNotes: "Watch press",
    },
  };
  const renderer = createSquadProfileSupportRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    formatMedicalDateLabel: (value) =>
      ({
        "2026-06-01": "Mon 1 Jun",
        "2026-06-02": "Tue 2 Jun",
        "2026-06-06": "Sat 6 Jun",
        "2026-06-08": "Mon 8 Jun",
      })[value] || value || "",
    formatPlayerProfileChangeTime: () => "Today",
    getMedicalPlayerInjuryPlans: () => [
      {
        id: "plan-1",
        playerId: "p1",
        injuryType: "Hamstring",
        bodyArea: "Thigh",
        startDate: "2026-06-01",
        endDate: "2026-06-08",
        status: "modified",
        rtpPhase: "modified-team",
        participation: 75,
        reviewDate: "2026-06-06",
        coachNote: "Modified sprint load",
        shareWithCoach: true,
        createdBy: "medical-1",
        createdAt: "2026-06-01T08:00:00Z",
        updatedAt: "2026-06-01T08:00:00Z",
      },
    ],
    getMedicalPlayerRecords: () => [
      {
        id: "record-1",
        playerId: "p1",
        date: "2026-06-02",
        status: "full",
        participation: 100,
        rtpPhase: "full-training",
        coachNote: "Ready for full team training",
        comment: "Private clinical note",
        shareWithCoach: true,
        createdBy: "medical-1",
        createdAt: "2026-06-02T09:00:00Z",
        updatedAt: "2026-06-02T10:00:00Z",
      },
    ],
    getMedicalRecordStatus: (record) => ({ label: record?.status === "full" ? "Full Training" : "Modified Training" }),
    getMedicalRtpPhaseOption: (key) => ({ label: key === "full-training" ? "Full training" : "Modified team" }),
    getActiveTab: () => "medical",
    getPlayerProfileChangeLog: () => [
      { summary: "Profile updated", actor: "Coach", createdAt: "2026-05-31T11:14:00Z", type: "profile-update", changes: [{ field: "role", from: "8", to: "10" }] },
    ],
    getPlayerProfileMedicalSnapshot: () => ({
      tone: "available",
      currentAvailability: "Available",
      rtpStatus: "Full",
      coachNote: "Ready",
      latestLogSummary: "No issues",
      returnDateLabel: "",
      trainingAvailability: {
        hasData: true,
        loggedCount: 2,
        week: { average: 75, count: 2 },
        month: { average: 75, count: 2 },
        season: { average: 75, count: 2 },
        lastTwoWeeks: { average: 75, count: 2 },
        lastFive: { average: 75, count: 2 },
      },
    }),
    getRecentPlayerProfileChangeLog: () => [],
    isNewPlayerModalOpen: () => true,
    canEditPlayerProfiles: () => true,
    playerProfileRoleOptions: ["GK", "CB", "8", "10", "ST"],
    playerProfileRosterTypeOptions: [{ key: "squad", label: "Squad" }],
    playerProfileTabOptions: [
      { key: "overview", label: "Overview" },
      { key: "medical", label: "Medical" },
    ],
    resolvePlayerWorkActorLabel: (actorId, fallback) => (actorId === "medical-1" ? "Medical Lead" : fallback),
  });

  expect(renderer.renderRoleOptions("CB")).toContain('value="CB" selected');
  expect(renderer.renderSecondaryRoleOptions(["8"])).toContain('value="8" selected');
  expect(renderer.renderOptionSet([{ key: "active", label: "Active" }], "active")).toContain("Active");
  const medicalPanel = renderer.renderMedicalPanel(player);
  expect(medicalPanel).toContain("Medical Snapshot");
  expect(medicalPanel).toContain("Training availability");
  expect(medicalPanel).toContain("squad-training-availability-windows");
  expect(medicalPanel).toContain('style="--availability:75%"');
  expect(medicalPanel).toContain("<span>7d</span>");
  expect(medicalPanel).toContain("<strong>75%</strong>");
  expect(renderer.renderFuturePanel(player)).toContain("Match / Load / Analysis");
  const historyPanel = renderer.renderHistoryPanel(player);
  expect(historyPanel).toContain("Player Work History");
  expect(historyPanel).toContain("Mak Player");
  expect(historyPanel).toContain("Squad Room");
  expect(historyPanel).toContain("Medical");
  expect(historyPanel).toContain("Medical Lead");
  expect(historyPanel).toContain("Full Training / 100%");
  expect(historyPanel).toContain("Availability plan");
  expect(historyPanel).toContain("Modified sprint load");
  expect(historyPanel).not.toContain("Private clinical note");
  expect(historyPanel).not.toContain("Recent Squad Room activity");
  expect(historyPanel).not.toContain("player changes");
  expect(renderer.renderTabs()).toContain('data-player-profile-tab="medical"');
  const modalMarkup = renderer.renderNewPlayerModal({
    name: "Grace Hopper",
    number: "7",
    birthDate: "1999-01-02",
    position: "Midfielder",
    primaryRole: "8",
    rosterType: "squad",
  });
  expect(modalMarkup).toContain("data-player-profile-new-modal-overlay");
  expect(modalMarkup).toContain("playerProfileNewPlayerForm");
  expect(modalMarkup).toContain("Add Player");
  expect(modalMarkup).toContain('name="name" value="Grace Hopper"');
  expect(modalMarkup).toContain('name="number" value="7"');
  expect(modalMarkup).toContain('name="birthDate" type="date" value="1999-01-02"');
  expect(modalMarkup).toContain('value="8" selected');
});

test("Squad training availability summary averages against team training opportunities", () => {
  const summary = getSquadTrainingAvailabilitySummary({
    playerId: "p1",
    referenceDateValue: "2026-06-10",
    records: [
      { playerId: "p1", date: "2026-06-10", participation: 100, updatedAt: "2026-06-10T14:00:00Z" },
      { playerId: "p1", date: "2026-06-09", participation: 50, updatedAt: "2026-06-09T10:00:00Z" },
      { playerId: "p1", date: "2026-06-09", participation: 75, updatedAt: "2026-06-09T12:00:00Z" },
      { playerId: "p1", date: "2026-06-08", participation: 100, updatedAt: "2026-06-08T12:00:00Z" },
      { playerId: "p1", date: "2026-06-07", participation: 40, updatedAt: "2026-06-07T12:00:00Z" },
      { playerId: "p1", date: "2026-06-06", participation: 60, updatedAt: "2026-06-06T12:00:00Z" },
      { playerId: "p1", date: "2026-06-05", participation: 80, updatedAt: "2026-06-05T12:00:00Z" },
      { playerId: "p1", date: "2026-05-01", participation: 25, updatedAt: "2026-05-01T12:00:00Z" },
      { playerId: "p1", date: "2027-01-01", participation: 0, updatedAt: "2027-01-01T12:00:00Z" },
      { playerId: "p2", date: "2026-06-10", participation: 0, updatedAt: "2026-06-10T12:00:00Z" },
      { playerId: "p1", date: "2026-06-01", participation: 100, archivedAt: "2026-06-02T12:00:00Z" },
    ],
    getActivityContext: (dateValue) => ({ type: dateValue === "2026-06-08" ? "match" : "training" }),
    getTeamTrainingDateValues: () => [
      "2026-05-01",
      "2026-06-05",
      "2026-06-06",
      "2026-06-07",
      "2026-06-09",
      "2026-06-10",
    ],
  });

  expect(summary.hasData).toBe(true);
  expect(summary.loggedCount).toBe(6);
  expect(summary.week).toEqual({ average: 71, count: 5 });
  expect(summary.month).toEqual({ average: 71, count: 5 });
  expect(summary.season).toEqual({ average: 63, count: 6 });
  expect(summary.lastTwoWeeks).toEqual({ average: 71, count: 5 });
  expect(summary.lastFive).toEqual({ average: 71, count: 5 });
});

test("Squad training availability summary ignores unrecommended trainings but counts explicit zero recommendations", () => {
  const summary = getSquadTrainingAvailabilitySummary({
    playerId: "p1",
    referenceDateValue: "2026-06-10",
    records: [
      { playerId: "p1", date: "2026-06-10", participation: 100, updatedAt: "2026-06-10T14:00:00Z" },
      { playerId: "p1", date: "2026-06-09", participation: 0, updatedAt: "2026-06-09T14:00:00Z" },
      { playerId: "p1", date: "2026-06-08", participation: 50, updatedAt: "2026-06-08T12:00:00Z" },
    ],
    getTeamTrainingDateValues: () => [
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
      "2026-06-06",
      "2026-06-07",
      "2026-06-08",
      "2026-06-09",
      "2026-06-10",
    ],
  });

  expect(summary.hasData).toBe(true);
  expect(summary.loggedCount).toBe(3);
  expect(summary.week).toEqual({ average: 50, count: 3 });
  expect(summary.month).toEqual({ average: 50, count: 3 });
  expect(summary.season).toEqual({ average: 50, count: 3 });
  expect(summary.lastTwoWeeks).toEqual({ average: 50, count: 3 });
  expect(summary.lastFive).toEqual({ average: 50, count: 3 });
});

test("Squad training availability summary starts counting from first recommendation or medical evidence", () => {
  const summary = getSquadTrainingAvailabilitySummary({
    playerId: "p1",
    referenceDateValue: "2026-06-10",
    records: [{ playerId: "p1", date: "2026-06-10", participation: 75, updatedAt: "2026-06-10T14:00:00Z" }],
    getPlayerAvailabilityStatusForDate: () => "available",
    getTeamTrainingDateValues: () => [
      "2026-05-20",
      "2026-05-22",
      "2026-05-28",
      "2026-06-01",
      "2026-06-03",
      "2026-06-08",
      "2026-06-10",
    ],
  });

  expect(summary.hasData).toBe(true);
  expect(summary.loggedCount).toBe(1);
  expect(summary.season).toEqual({ average: 75, count: 1 });
  expect(summary.week).toEqual({ average: 75, count: 1 });
});

test("Squad training availability summary uses actual participation when logged and recommendation otherwise", () => {
  const summary = getSquadTrainingAvailabilitySummary({
    playerId: "p1",
    referenceDateValue: "2026-06-10",
    medicalActualParticipationFallback: "not-logged",
    records: [
      { playerId: "p1", date: "2026-06-10", participation: 100, actualParticipation: 50, updatedAt: "2026-06-10T14:00:00Z" },
      { playerId: "p1", date: "2026-06-09", participation: 75, actualParticipation: "not-logged", updatedAt: "2026-06-09T14:00:00Z" },
      { playerId: "p1", date: "2026-06-08", participation: 0, actualParticipation: 0, updatedAt: "2026-06-08T12:00:00Z" },
      { playerId: "p1", date: "2026-06-07", participation: 25, updatedAt: "2026-06-07T12:00:00Z" },
    ],
    getTeamTrainingDateValues: () => ["2026-06-07", "2026-06-08", "2026-06-09", "2026-06-10"],
  });

  expect(summary.hasData).toBe(true);
  expect(summary.loggedCount).toBe(4);
  expect(summary.week).toEqual({ average: 38, count: 4 });
  expect(summary.month).toEqual({ average: 38, count: 4 });
  expect(summary.season).toEqual({ average: 38, count: 4 });
  expect(summary.lastTwoWeeks).toEqual({ average: 38, count: 4 });
  expect(summary.lastFive).toEqual({ average: 38, count: 4 });
});

test("Squad training availability summary does not count today's recommendation before participation is logged", () => {
  const sharedOptions = {
    playerId: "new-player",
    referenceDateValue: "2026-09-04",
    currentDateValue: "2026-09-04",
    medicalActualParticipationFallback: "not-logged",
    getTeamTrainingDateValues: () => ["2026-09-04"],
  };

  const pendingSummary = getSquadTrainingAvailabilitySummary({
    ...sharedOptions,
    records: [{
      playerId: "new-player",
      date: "2026-09-04",
      participation: 100,
      actualParticipation: "not-logged",
    }],
  });
  expect(pendingSummary).toMatchObject({
    hasData: false,
    loggedCount: 0,
    season: { average: null, count: 0 },
    lastTwoWeeks: { average: null, count: 0 },
  });

  const completedSummary = getSquadTrainingAvailabilitySummary({
    ...sharedOptions,
    records: [{
      playerId: "new-player",
      date: "2026-09-04",
      participation: 100,
      actualParticipation: 75,
    }],
  });
  expect(completedSummary).toMatchObject({
    hasData: true,
    loggedCount: 1,
    season: { average: 75, count: 1 },
    lastTwoWeeks: { average: 75, count: 1 },
  });
});

test("Squad training availability summary preserves roster-removal history without restoring manual archives", () => {
  const summary = getSquadTrainingAvailabilitySummary({
    playerId: "p1",
    referenceDateValue: "2026-06-10",
    records: [
      {
        id: "active-current",
        playerId: "p1",
        date: "2026-06-10",
        participation: 75,
        actualParticipation: null,
        createdAt: "2026-06-10T08:00:00Z",
        updatedAt: "2026-06-10T08:00:00Z",
      },
      {
        id: "archived-duplicate",
        playerId: "p1",
        date: "2026-06-10",
        participation: 25,
        actualParticipation: 25,
        createdAt: "2026-06-10T07:00:00Z",
        updatedAt: "2026-06-12T12:00:00Z",
        archivedAt: "2026-06-12T12:00:00Z",
        archiveReason: "Player removed from Squad Room",
      },
      {
        id: "archived-latest",
        playerId: "p1",
        date: "2026-06-09",
        participation: 0,
        actualParticipation: "not-logged",
        createdAt: "2026-06-09T12:00:00Z",
        updatedAt: "2026-06-12T12:00:00Z",
        archivedAt: "2026-06-12T12:00:00Z",
        archiveReason: "Player removed from Squad Room",
      },
      {
        id: "archived-older",
        playerId: "p1",
        date: "2026-06-09",
        participation: 100,
        actualParticipation: 100,
        createdAt: "2026-06-09T08:00:00Z",
        updatedAt: "2026-06-12T12:00:00Z",
        archivedAt: "2026-06-12T12:00:00Z",
        archiveReason: "Player removed from Squad Room",
      },
      {
        id: "manual-archive",
        playerId: "p1",
        date: "2026-06-08",
        participation: 100,
        actualParticipation: 100,
        createdAt: "2026-06-08T08:00:00Z",
        updatedAt: "2026-06-08T09:00:00Z",
        archivedAt: "2026-06-08T09:00:00Z",
        archiveReason: "Manual archive from Medical Room",
      },
      {
        id: "roster-history",
        playerId: "p1",
        date: "2026-06-07",
        participation: 50,
        actualParticipation: "not-logged",
        createdAt: "2026-06-07T08:00:00Z",
        updatedAt: "2026-06-12T12:00:00Z",
        archivedAt: "2026-06-12T12:00:00Z",
        archiveReason: "Player removed from Squad Room",
      },
    ],
    getTeamTrainingDateValues: () => ["2026-06-07", "2026-06-08", "2026-06-09", "2026-06-10"],
  });

  expect(summary.loggedCount).toBe(3);
  expect(summary.season).toEqual({ average: 42, count: 3 });
  expect(summary.lastTwoWeeks).toEqual({ average: 42, count: 3 });
});

test("Squad training availability summary counts medical plans and injured status as absences without manual recommendations", () => {
  const summary = getSquadTrainingAvailabilitySummary({
    playerId: "p1",
    referenceDateValue: "2026-06-15",
    records: [{ playerId: "p1", date: "2026-06-15", participation: 100, updatedAt: "2026-06-15T14:00:00Z" }],
    getActiveMedicalInjuryPlan: (playerId, dateValue) =>
      playerId === "p1" && dateValue === "2026-06-11"
        ? { playerId, startDate: "2026-06-11", endDate: "2026-06-20", status: "unavailable", participation: 0 }
        : null,
    getPlayerAvailabilityStatusForDate: (playerId, dateValue) =>
      playerId === "p1" && dateValue === "2026-06-12" ? "injured" : "available",
    getTeamTrainingDateValues: () => ["2026-06-10", "2026-06-11", "2026-06-12", "2026-06-15"],
  });

  expect(summary.hasData).toBe(true);
  expect(summary.week).toEqual({ average: 33, count: 3 });
  expect(summary.month).toEqual({ average: 33, count: 3 });
  expect(summary.season).toEqual({ average: 33, count: 3 });
  expect(summary.lastTwoWeeks).toEqual({ average: 33, count: 3 });
  expect(summary.lastFive).toEqual({ average: 33, count: 3 });
});

test("Squad training availability summary counts unavailable medical status as absence when no recommendations exist", () => {
  const summary = getSquadTrainingAvailabilitySummary({
    playerId: "p1",
    referenceDateValue: "2026-06-15",
    records: [],
    getPlayerAvailabilityStatusForDate: (playerId, dateValue) =>
      playerId === "p1" && dateValue >= "2026-06-10" ? "unavailable" : "available",
    getTeamTrainingDateValues: () => ["2026-06-10", "2026-06-12", "2026-06-15"],
  });

  expect(summary).toEqual({
    hasData: true,
    latestDate: "2026-06-15",
    loggedCount: 3,
    week: { average: 0, count: 3 },
    month: { average: 0, count: 3 },
    season: { average: 0, count: 3 },
    lastTwoWeeks: { average: 0, count: 3 },
    lastFive: { average: 0, count: 3 },
  });
});

test("Squad training availability summary counts club absences but excuses international duty", () => {
  const statusByDate = {
    "2026-06-10": "vacation",
    "2026-06-11": "personal",
    "2026-06-12": "suspended",
    "2026-06-13": "loan",
    "2026-06-14": "national-team",
    "2026-06-15": "available",
  };
  const summary = getSquadTrainingAvailabilitySummary({
    playerId: "p1",
    referenceDateValue: "2026-06-15",
    records: [],
    getPlayerAvailabilityStatusForDate: (_playerId, dateValue) => statusByDate[dateValue],
    getTeamTrainingDateValues: () => Object.keys(statusByDate),
  });

  expect(summary.loggedCount).toBe(4);
  expect(summary.season).toEqual({ average: 0, count: 4 });
  expect(summary.lastTwoWeeks).toEqual({ average: 0, count: 4 });
});

test("Squad training availability summary uses the last fourteen calendar days for recent availability", () => {
  const summary = getSquadTrainingAvailabilitySummary({
    playerId: "p1",
    referenceDateValue: "2026-06-15",
    records: [
      { playerId: "p1", date: "2026-06-15", participation: 100, updatedAt: "2026-06-15T14:00:00Z" },
      { playerId: "p1", date: "2026-06-08", participation: 50, updatedAt: "2026-06-08T14:00:00Z" },
      { playerId: "p1", date: "2026-06-02", participation: 25, updatedAt: "2026-06-02T14:00:00Z" },
      { playerId: "p1", date: "2026-06-01", participation: 0, updatedAt: "2026-06-01T14:00:00Z" },
    ],
    getTeamTrainingDateValues: () => ["2026-06-01", "2026-06-02", "2026-06-08", "2026-06-15"],
  });

  expect(summary.season).toEqual({ average: 44, count: 4 });
  expect(summary.lastTwoWeeks).toEqual({ average: 58, count: 3 });
  expect(summary.lastFive).toEqual({ average: 58, count: 3 });
});

test("Squad training availability summary excludes international-duty club absences", () => {
  const summary = getSquadTrainingAvailabilitySummary({
    playerId: "p1",
    referenceDateValue: "2026-06-10",
    records: [
      { playerId: "p1", date: "2026-06-10", participation: 100, updatedAt: "2026-06-10T14:00:00Z" },
      { playerId: "p1", date: "2026-06-09", participation: 0, updatedAt: "2026-06-09T12:00:00Z" },
      { playerId: "p1", date: "2026-06-08", participation: 50, updatedAt: "2026-06-08T12:00:00Z" },
    ],
    getPlayerAvailabilityStatusForDate: (playerId, dateValue) =>
      playerId === "p1" && dateValue === "2026-06-09" ? "national-team" : "available",
    getTeamTrainingDateValues: () => ["2026-06-08", "2026-06-09", "2026-06-10"],
  });

  expect(summary.hasData).toBe(true);
  expect(summary.loggedCount).toBe(2);
  expect(summary.week).toEqual({ average: 75, count: 2 });
  expect(summary.month).toEqual({ average: 75, count: 2 });
  expect(summary.season).toEqual({ average: 75, count: 2 });
  expect(summary.lastTwoWeeks).toEqual({ average: 75, count: 2 });
  expect(summary.lastFive).toEqual({ average: 75, count: 2 });
});

test("Squad training availability summary does not infer team trainings from off-day medical records", () => {
  const summary = getSquadTrainingAvailabilitySummary({
    playerId: "p1",
    referenceDateValue: "2026-06-10",
    records: [
      { playerId: "p1", date: "2026-06-08", participation: 50, updatedAt: "2026-06-08T12:00:00Z" },
    ],
    getActivityContext: () => ({ type: "off" }),
    getTeamTrainingDateValues: () => [],
  });

  expect(summary.hasData).toBe(false);
  expect(summary.loggedCount).toBe(0);
  expect(summary.week).toEqual({ average: null, count: 0 });
  expect(summary.month).toEqual({ average: null, count: 0 });
  expect(summary.season).toEqual({ average: null, count: 0 });
  expect(summary.lastTwoWeeks).toEqual({ average: null, count: 0 });
  expect(summary.lastFive).toEqual({ average: null, count: 0 });
});

test("Squad training availability render context preserves legacy results and avoids empty-player full scans", () => {
  const records = [
    { playerId: "p1", date: "2026-06-10", participation: 100, actualParticipation: 100, updatedAt: "2026-06-10T14:00:00Z" },
    { playerId: "p1", date: "2026-06-09", participation: 25, actualParticipation: "not-logged", updatedAt: "2026-06-09T10:00:00Z" },
    { playerId: "p1", date: "2026-06-09", participation: 75, actualParticipation: 50, updatedAt: "2026-06-09T12:00:00Z" },
    { playerId: "p1", date: "2026-06-08", participation: 0, actualParticipation: 0, archivedAt: "2026-06-09T12:00:00Z" },
    { playerId: "p1", date: "2026-07-01", participation: 0, actualParticipation: 0, updatedAt: "2026-07-01T12:00:00Z" },
    { playerId: "p2", date: "2026-06-10", participation: 25, actualParticipation: 25, updatedAt: "2026-06-10T12:00:00Z" },
  ];
  const getActivityContext = () => ({ type: "training" });
  const getTeamTrainingDateValues = () => ["2026-06-08", "2026-06-09", "2026-06-10"];
  const sharedOptions = {
    referenceDateValue: "2026-06-10",
    medicalActualParticipationFallback: "not-logged",
    records,
    getActivityContext,
    getTeamTrainingDateValues,
  };
  const summaryContext = createSquadTrainingAvailabilityContext({
    records,
    getActivityContext,
    getTeamTrainingDateValues,
  });

  expect(getSquadTrainingAvailabilitySummary({ ...sharedOptions, playerId: "p1", summaryContext }))
    .toEqual(getSquadTrainingAvailabilitySummary({ ...sharedOptions, playerId: "p1" }));
  expect(getSquadTrainingAvailabilitySummary({ ...sharedOptions, playerId: "p-empty", summaryContext }))
    .toEqual(getSquadTrainingAvailabilitySummary({ ...sharedOptions, playerId: "p-empty" }));

  const recordsThatRejectFullScan = new Proxy(records, {
    get(target, property, receiver) {
      if (property === "filter") {
        throw new Error("Context miss must not scan the complete record list");
      }
      return Reflect.get(target, property, receiver);
    },
  });
  expect(() => getSquadTrainingAvailabilitySummary({
    ...sharedOptions,
    playerId: "p-empty",
    records: recordsThatRejectFullScan,
    summaryContext,
  })).not.toThrow();
});
