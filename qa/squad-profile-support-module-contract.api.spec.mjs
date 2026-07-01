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
    formatPlayerProfileChangeTime: () => "Today",
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
  });

  expect(renderer.renderRoleOptions("CB")).toContain('value="CB" selected');
  expect(renderer.renderSecondaryRoleOptions(["8"])).toContain('value="8" selected');
  expect(renderer.renderOptionSet([{ key: "active", label: "Active" }], "active")).toContain("Active");
  const medicalPanel = renderer.renderMedicalPanel(player);
  expect(medicalPanel).toContain("Medical Snapshot");
  expect(medicalPanel).toContain("Training availability");
  expect(medicalPanel).toContain("7d 75%");
  expect(renderer.renderFuturePanel(player)).toContain("Match / Load / Analysis");
  const historyPanel = renderer.renderHistoryPanel(player);
  expect(historyPanel).toContain("Profile Audit Trail");
  expect(historyPanel).toContain("Mak Player");
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

test("Squad training availability summary averages logged training decisions", () => {
  const summary = getSquadTrainingAvailabilitySummary({
    playerId: "p1",
    referenceDateValue: "2026-06-10",
    records: [
      { playerId: "p1", date: "2026-06-10", participation: 100, updatedAt: "2026-06-10T14:00:00Z" },
      { playerId: "p1", date: "2026-06-09", participation: 50, updatedAt: "2026-06-09T10:00:00Z" },
      { playerId: "p1", date: "2026-06-09", participation: 75, updatedAt: "2026-06-09T12:00:00Z" },
      { playerId: "p1", date: "2026-06-08", participation: 100, updatedAt: "2026-06-08T12:00:00Z" },
      { playerId: "p1", date: "2026-05-01", participation: 25, updatedAt: "2026-05-01T12:00:00Z" },
      { playerId: "p1", date: "2027-01-01", participation: 0, updatedAt: "2027-01-01T12:00:00Z" },
      { playerId: "p2", date: "2026-06-10", participation: 0, updatedAt: "2026-06-10T12:00:00Z" },
      { playerId: "p1", date: "2026-06-01", participation: 100, archivedAt: "2026-06-02T12:00:00Z" },
    ],
    getActivityContext: (dateValue) => ({ type: dateValue === "2026-06-08" ? "match" : "training" }),
  });

  expect(summary.hasData).toBe(true);
  expect(summary.loggedCount).toBe(3);
  expect(summary.week).toEqual({ average: 88, count: 2 });
  expect(summary.month).toEqual({ average: 88, count: 2 });
  expect(summary.season).toEqual({ average: 67, count: 3 });
});
