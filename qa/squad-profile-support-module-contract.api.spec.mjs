import { expect, test } from "@playwright/test";
import { createSquadProfileSupportRenderer, getSquadTrainingAvailabilitySummary } from "../src/modules/squad/index.mjs";

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
  expect(summary.lastFive).toEqual({ average: 71, count: 5 });
});

test("Squad training availability summary counts missed scheduled trainings as zero", () => {
  const summary = getSquadTrainingAvailabilitySummary({
    playerId: "p1",
    referenceDateValue: "2026-06-10",
    records: [
      { playerId: "p1", date: "2026-06-10", participation: 100, updatedAt: "2026-06-10T14:00:00Z" },
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
  expect(summary.loggedCount).toBe(2);
  expect(summary.week).toEqual({ average: 21, count: 7 });
  expect(summary.month).toEqual({ average: 15, count: 10 });
  expect(summary.season).toEqual({ average: 15, count: 10 });
  expect(summary.lastFive).toEqual({ average: 30, count: 5 });
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
  expect(summary.loggedCount).toBe(3);
  expect(summary.week).toEqual({ average: 75, count: 2 });
  expect(summary.month).toEqual({ average: 75, count: 2 });
  expect(summary.season).toEqual({ average: 75, count: 2 });
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
  expect(summary.loggedCount).toBe(1);
  expect(summary.week).toEqual({ average: null, count: 0 });
  expect(summary.month).toEqual({ average: null, count: 0 });
  expect(summary.season).toEqual({ average: null, count: 0 });
  expect(summary.lastFive).toEqual({ average: null, count: 0 });
});
