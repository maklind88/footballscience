import { expect, test } from "@playwright/test";
import { createSquadRosterRenderer } from "../src/modules/squad/index.mjs";

const getOption = (options, key, fallback = options[0]) => options.find((option) => option.key === key) || fallback || options[0];

test("Squad roster renderer owns roster table, temporary section, and status markup", () => {
  const squadPlayer = {
    id: "p1",
    name: "Mak Player",
    number: "8",
    position: "CM",
    primaryRole: "8",
    secondaryRoles: ["10"],
    squadStatus: "important",
    rosterType: "squad",
    status: "available",
    idp: { status: "active", primaryFocus: "Scanning" },
  };
  const temporaryPlayer = {
    id: "p2",
    name: "Guest Player",
    number: "22",
    position: "FW",
    primaryRole: "ST",
    secondaryRoles: [],
    squadStatus: "development",
    rosterType: "guest",
    status: "injured",
    idp: { status: "none" },
  };
  const renderer = createSquadRosterRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    getAllPlayerProfiles: () => [squadPlayer, temporaryPlayer],
    getAllTemporaryPlayerProfiles: () => [temporaryPlayer],
    getPlayerProfileCompleteness: () => 75,
    getPlayerProfileDisplayAgeValue: () => "24",
    getPlayerProfileEffectiveStatusFromSnapshot: (player) => player.status,
    getPlayerProfileIdpFollowUpLabel: () => "Review in 7d",
    getPlayerProfileMedicalSnapshot: (playerId) => ({ returnLabel: playerId === "p2" ? "10 Jun" : "" }),
    getPlayerProfileOption: getOption,
    getPlayerProfileRosterLabel: (player) => (player.rosterType === "guest" ? "Training guest" : "Squad"),
    getPlayerProfileRosterSummary: (players) => ({
      squadCount: players.filter((player) => player.rosterType === "squad").length,
      temporaryCount: players.filter((player) => player.rosterType !== "squad").length,
    }),
    getPlayerProfileRosterTypeOption: (value) => ({ key: value || "squad", shortLabel: value === "guest" ? "Guest" : "Squad" }),
    getPlayerProfileTemporaryWindowLabel: () => "1 Jun - 7 Jun",
    getSelectedPlayerId: () => "p1",
    getTemporarySectionCollapsed: () => false,
    isTemporaryPlayerProfile: (player) => player.rosterType !== "squad",
    playerProfileCountsInSquad: (player) => player.rosterType === "squad",
    playerProfileIdpStatusOptions: [
      { key: "none", label: "None" },
      { key: "active", label: "Active" },
    ],
    playerProfileStatusOptions: [
      { key: "available", label: "Available", tone: "available" },
      { key: "injured", label: "Injured", tone: "injured" },
    ],
    playerProfileSquadStatusOptions: [{ key: "important", label: "Important" }],
    renderPlayerProfileAvatar: (player, className) => `<span class="${className}">${player.name[0]}</span>`,
  });

  const markup = renderer.renderRosterSections([squadPlayer], {
    rosterSummary: { squadCount: 1, temporaryCount: 1 },
    visibleSummary: { squadCount: 1, temporaryCount: 0 },
  });

  expect(markup).toContain("squad-roster-section");
  expect(markup).toContain("Squad List");
  expect(markup).toContain("1/1 squad");
  expect(markup).not.toContain("1/1 squad + 1 temporary");
  expect(markup).toContain('data-player-profile-select="p1"');
  expect(markup).toContain("is-selected");
  expect(markup).toContain("Mak Player");
  expect(markup).not.toContain("<th>Squad</th>");
  expect(markup).not.toContain("<th>Planning</th>");
  expect(markup).toContain("<th>Status</th>");
  expect(markup).toContain("<th>IDP</th>");
  expect(markup).toContain("<th>Profile</th>");
  expect(markup).not.toContain("squad-planning-cell");
  expect(markup).not.toContain(">Important<");
  expect(markup).toContain("Training guests");
  expect(markup).toContain("Guest Player");
  expect(markup).toContain("Training guest");
  expect(markup).toContain("1 Jun - 7 Jun");
  expect(markup).not.toContain("Squad player");
  expect(renderer.renderStatusChip("injured", { returnLabel: "10 Jun" })).toContain("10 Jun");
});

test("Squad roster renderer defaults training guests to hidden", () => {
  const squadPlayer = {
    id: "p1",
    name: "Mak Player",
    position: "CM",
    primaryRole: "8",
    secondaryRoles: [],
    rosterType: "squad",
    status: "available",
    idp: { status: "active" },
  };
  const temporaryPlayer = {
    id: "p2",
    name: "Guest Player",
    position: "FW",
    primaryRole: "ST",
    secondaryRoles: [],
    rosterType: "guest",
    status: "available",
    idp: { status: "none" },
  };
  const renderer = createSquadRosterRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    getAllPlayerProfiles: () => [squadPlayer, temporaryPlayer],
    getAllTemporaryPlayerProfiles: () => [temporaryPlayer],
    getPlayerProfileCompleteness: () => 75,
    getPlayerProfileDisplayAgeValue: () => "24",
    getPlayerProfileEffectiveStatusFromSnapshot: (player) => player.status,
    getPlayerProfileIdpFollowUpLabel: () => "Review in 7d",
    getPlayerProfileMedicalSnapshot: () => ({ returnLabel: "" }),
    getPlayerProfileOption: getOption,
    getPlayerProfileRosterLabel: (player) => (player.rosterType === "guest" ? "Training guest" : "Squad"),
    getPlayerProfileRosterSummary: (players) => ({
      squadCount: players.filter((player) => player.rosterType === "squad").length,
      temporaryCount: players.filter((player) => player.rosterType !== "squad").length,
    }),
    getPlayerProfileRosterTypeOption: (value) => ({ key: value || "squad", shortLabel: value === "guest" ? "Guest" : "Squad" }),
    getPlayerProfileTemporaryWindowLabel: () => "1 Jun - 7 Jun",
    getSelectedPlayerId: () => "p1",
    isTemporaryPlayerProfile: (player) => player.rosterType !== "squad",
    playerProfileCountsInSquad: (player) => player.rosterType === "squad",
    playerProfileIdpStatusOptions: [
      { key: "none", label: "None" },
      { key: "active", label: "Active" },
    ],
    playerProfileStatusOptions: [{ key: "available", label: "Available", tone: "available" }],
    renderPlayerProfileAvatar: (player, className) => `<span class="${className}">${player.name[0]}</span>`,
  });

  const markup = renderer.renderRosterSections([squadPlayer], {
    rosterSummary: { squadCount: 1, temporaryCount: 1 },
    visibleSummary: { squadCount: 1, temporaryCount: 0 },
  });

  expect(markup).toContain("Training guests");
  expect(markup).toContain('data-squad-roster-section="temporary"');
  expect(markup).toContain('aria-expanded="false"');
  expect(markup).toContain("Show 1");
  expect(markup).not.toContain("Guest Player");
});
