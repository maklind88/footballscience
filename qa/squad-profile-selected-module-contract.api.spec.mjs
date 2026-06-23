import { expect, test } from "@playwright/test";
import { createSquadProfileSelectedRenderer } from "../src/modules/squad/index.mjs";

const optionSet = (options, selectedKey = "") =>
  options.map((option) => `<option value="${option.key}" ${option.key === selectedKey ? "selected" : ""}>${option.label}</option>`).join("");

test("Squad selected profile renderer owns selected workbench and modal markup", () => {
  const player = {
    id: "p1",
    name: "Mak Player",
    number: "8",
    position: "CM",
    status: "available",
    rosterType: "squad",
    primaryRole: "8",
    secondaryRoles: ["10"],
    preferredSide: "center",
    roleGroup: "midfielder",
    squadStatus: "important",
    careerPhase: "prime",
    attributeRatings: { tactical: 4 },
    idp: { status: "active", primaryFocus: "Scanning", strengths: "Vision", focusAreas: "Tempo", nextAction: "Review clips", reviewDate: "2026-06-10" },
    futureData: { performanceNotes: "Strong", scoutingNotes: "Watch", analysisNotes: "Good" },
    coachNotes: "Ready",
  };
  const renderer = createSquadProfileSelectedRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    canEditPlayerProfiles: () => true,
    getActiveTab: () => "roles",
    getPlayerProfileDisplayBirthDateValue: () => "2000-01-01",
    getPlayerProfileEffectiveStatusFromSnapshot: () => "available",
    getPlayerProfileMedicalSnapshot: () => ({ returnLabel: "" }),
    getPlayerProfileOption: (options, key) => options.find((option) => option.key === key) || options[0],
    getPlayerProfileRtpCoachStatus: () => ({ playerId: "p1", emptyState: { code: "rtp-coach-player-empty" } }),
    isCurrentPlatformUserAdmin: () => true,
    isProfileModalOpen: () => true,
    normalizePlayerProfileTab: (tab) => tab,
    playerProfileAttributeGroups: [{ key: "tactical", label: "Tactical" }],
    playerProfileCareerPhaseOptions: [{ key: "prime", label: "Prime" }],
    playerProfileIdpStatusOptions: [{ key: "active", label: "Active" }],
    playerProfilePreferredSideOptions: [{ key: "center", label: "Center" }],
    playerProfileRoleGroupOptions: [{ key: "midfielder", label: "Midfielder" }],
    playerProfileRosterTypeOptions: [{ key: "squad", label: "Squad" }],
    playerProfileSquadStatusOptions: [{ key: "important", label: "Important" }],
    playerProfileStatusOptions: [{ key: "available", label: "Available" }],
    playerProfileTabOptions: [{ key: "roles", label: "Roles" }],
    playerProfileCountsInSquad: () => true,
    renderPlayerProfileAvatarUpload: () => '<span class="avatar-upload"></span>',
    renderPlayerProfileFuturePanel: () => "",
    renderPlayerProfileHistoryPanel: () => "",
    renderPlayerProfileMedicalPanel: () => "",
    renderPlayerProfileOptionSet: optionSet,
    renderPlayerProfileRtpStatusCard: () => '<article data-player-profile-rtp-card>No coach-safe RTP status available</article>',
    renderPlayerProfileRoleOptions: () => '<option value="8" selected>8</option>',
    renderPlayerProfileScoutingSpider: () => "",
    renderPlayerProfileSecondaryRoleOptions: () => '<option value="10" selected>10</option>',
    renderPlayerProfileStatusChip: () => '<span class="squad-status-pill">Available</span>',
    renderPlayerProfileTabs: () => '<nav class="squad-profile-tabs"></nav>',
  });

  const panelMarkup = renderer.renderSelectedPanel(player);
  expect(panelMarkup).toContain("squad-player-workbench");
  expect(panelMarkup).toContain('id="playerProfileEditForm"');
  expect(panelMarkup).toContain('name="playerId"');
  expect(panelMarkup).toContain("Role Suitability");
  expect(panelMarkup).toContain("data-player-profile-rtp-card");
  expect(panelMarkup.indexOf("data-player-profile-rtp-card")).toBeLessThan(panelMarkup.indexOf("squad-profile-tabs"));
  expect(panelMarkup).toContain('data-player-profile-remove="p1"');
  const modalMarkup = renderer.renderModal(player);
  expect(modalMarkup).toContain("data-player-profile-modal-overlay");
  expect(modalMarkup).toContain("Mak Player player profile");
});
