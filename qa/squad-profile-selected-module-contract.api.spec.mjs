import { expect, test } from "@playwright/test";
import { createSquadProfileSelectedRenderer, playerProfileTabOptions } from "../src/modules/squad/index.mjs";

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
    getActiveTab: () => "overview",
    getPlayerProfileDisplayBirthDateValue: () => "2000-01-01",
    getPlayerProfileEffectiveStatusFromSnapshot: () => "available",
    getPlayerProfileMedicalSnapshot: () => ({ returnLabel: "" }),
    getPlayerProfileOption: (options, key) => options.find((option) => option.key === key) || options[0],
    isCurrentPlatformUserAdmin: () => true,
    isProfileModalOpen: () => true,
    normalizePlayerProfileTab: (tab) => tab,
    playerProfileCareerPhaseOptions: [{ key: "prime", label: "Prime" }],
    playerProfileIdpStatusOptions: [{ key: "active", label: "Active" }],
    playerProfilePreferredSideOptions: [{ key: "center", label: "Center" }],
    playerProfileRoleGroupOptions: [{ key: "midfielder", label: "Midfielder" }],
    playerProfileRosterTypeOptions: [{ key: "squad", label: "Squad" }],
    playerProfileSquadStatusOptions: [{ key: "important", label: "Important" }],
    playerProfileStatusOptions: [{ key: "available", label: "Available" }],
    playerProfileTabOptions: [{ key: "overview", label: "Overview" }],
    playerProfileCountsInSquad: () => true,
    renderPlayerProfileAvatarUpload: () => '<span class="avatar-upload"></span>',
    renderPlayerProfileFuturePanel: () => "",
    renderPlayerProfileHistoryPanel: () => "",
    renderPlayerProfileMedicalPanel: () => "",
    renderPlayerProfileOptionSet: optionSet,
    renderPlayerProfileRoleOptions: () => '<option value="8" selected>8</option>',
    renderPlayerProfileScoutingSpider: () => "<article>Performance Radar</article>",
    renderPlayerProfileSecondaryRoleOptions: () => '<option value="10" selected>10</option>',
    renderPlayerProfileStatusChip: () => '<span class="squad-status-pill">Available</span>',
    renderPlayerProfileTabs: () => '<nav class="squad-profile-tabs"></nav>',
  });

  const panelMarkup = renderer.renderSelectedPanel(player);
  expect(panelMarkup).toContain("squad-player-workbench");
  expect(panelMarkup).toContain('id="playerProfileEditForm"');
  expect(panelMarkup).toContain('name="playerId"');
  expect(panelMarkup).toContain("Planning Profile");
  expect(panelMarkup).not.toContain("Role Suitability");
  expect(panelMarkup).toContain("Player Development System");
  expect(panelMarkup).toContain('name="idpStatus"');
  expect(panelMarkup).toContain("Open Player Development");
  expect(panelMarkup).toContain('<label class="squad-tab-field-overview">\n              <span>Primary role</span>');
  expect(panelMarkup).not.toContain('<label class="squad-tab-field-roles">\n              <span>Primary role</span>');
  expect(panelMarkup).toContain('<label class="squad-tab-field-overview">\n              <span>Secondary roles</span>');
  expect(panelMarkup).not.toContain('<label class="squad-tab-field-roles">\n              <span>Secondary roles</span>');
  expect(panelMarkup).toContain('<label class="squad-tab-field-overview">\n              <span>Role group</span>');
  expect(panelMarkup).not.toContain('<label class="squad-tab-field-roles">\n              <span>Role group</span>');
  expect(panelMarkup).toContain('<label class="squad-tab-field-overview">\n              <span>Preferred side</span>');
  expect(panelMarkup).not.toContain('<label class="squad-tab-field-roles">\n              <span>Preferred side</span>');
  expect(panelMarkup).not.toContain("Individual Development Plan");
  expect(panelMarkup).not.toContain('name="idpPrimaryFocus"');
  expect(panelMarkup).not.toContain('name="idpFocusAreas"');
  expect(panelMarkup).not.toContain('name="idpNextAction"');
  expect(panelMarkup).not.toContain('name="idpReviewDate"');
  expect(panelMarkup).not.toContain("Profile ratings");
  expect(panelMarkup).not.toContain("squad-rating-grid");
  expect(panelMarkup).not.toContain('name="rating.tactical"');
  expect(panelMarkup).toContain('data-player-profile-remove="p1"');
  expect(panelMarkup).not.toContain('name="squadStatus"');
  expect(panelMarkup).not.toContain("Squad status");
  expect(panelMarkup).not.toContain('name="careerPhase"');
  expect(panelMarkup).not.toContain("Career phase");
  expect(panelMarkup).not.toContain("Performance Radar");
  const modalMarkup = renderer.renderModal(player);
  expect(modalMarkup).toContain("data-player-profile-modal-overlay");
  expect(modalMarkup).toContain("Mak Player player profile");
});

test("Squad player profile tabs keep role editing in overview", () => {
  expect(playerProfileTabOptions.map((tab) => tab.key)).toEqual(["overview", "idp", "medical", "performance", "notes", "history"]);
});
