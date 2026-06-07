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
  expect(markup).toContain("1/1 squad + 1 temporary");
  expect(markup).toContain('data-player-profile-select="p1"');
  expect(markup).toContain("is-selected");
  expect(markup).toContain("Mak Player");
  expect(markup).toContain("Training guests");
  expect(markup).toContain("Guest Player");
  expect(renderer.renderStatusChip("injured", { returnLabel: "10 Jun" })).toContain("10 Jun");
});
