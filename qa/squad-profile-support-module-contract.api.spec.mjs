import { expect, test } from "@playwright/test";
import { createSquadProfileSupportRenderer } from "../src/modules/squad/index.mjs";

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
  expect(renderer.renderMedicalPanel(player)).toContain("Medical Snapshot");
  expect(renderer.renderFuturePanel(player)).toContain("Match / Load / Analysis");
  expect(renderer.renderHistoryPanel(player)).toContain("Profile Audit Trail");
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
