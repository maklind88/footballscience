import {
  normalizeIdpFocus,
  normalizeIdpMilestone,
  normalizeIdpNextAction,
  normalizeIdpProfile,
  normalizeText,
} from "./domain/idp.models.mjs";

function asPlayerList(playerProfilesState = {}) {
  if (Array.isArray(playerProfilesState.players)) return playerProfilesState.players;
  if (Array.isArray(playerProfilesState.roster)) return playerProfilesState.roster;
  return [];
}

function legacyStatus(idp = {}) {
  if (idp.status === "none") return "No Active IDP";
  if (idp.status === "review") return "Review Due";
  if (!normalizeText(idp.primaryFocus)) return "No Active Focus";
  return idp.nextAction ? "On Track" : "Needs Evidence";
}

export function buildIdpDashboardFromSquadState(playerProfilesState = {}) {
  return asPlayerList(playerProfilesState)
    .filter((player) => player && player.countsInSquad !== false)
    .map((player) => {
      const playerId = normalizeText(player.id || player.playerId || player.profileId, 160);
      const idp = player.idp || {};
      const idpInactive = idp.status === "none";
      const profile = normalizeIdpProfile({
        id: `legacy-profile-${playerId}`,
        playerId,
        playerName: player.name,
        squadNumber: player.number || player.shirtNumber || player.shirt_number,
        position: player.position,
        role: player.primaryRole,
        status: idp.status || "active",
        reviewDate: idp.reviewDate,
        strengths: idp.strengths ? String(idp.strengths).split(",") : [],
      });
      const focusTitle = idpInactive ? "" : normalizeText(idp.primaryFocus || "Create current focus", 180);
      const focus = normalizeIdpFocus({
        id: `legacy-focus-${playerId}`,
        playerId,
        title: focusTitle,
        description: idp.focusAreas,
        status: idp.status === "review" ? "Ready For Review" : "Active",
        reviewDate: idp.reviewDate,
        evidenceStatus: idp.status === "review" ? "Ready For Review" : "Needs Evidence",
      });
      return {
        profile,
        focus: focusTitle ? focus : null,
        evidenceCount: 0,
        newClipCount: 0,
        nextAction: normalizeText(idpInactive ? "IDP inactive" : idp.nextAction || (focusTitle ? "Add evidence" : "Create next focus"), 180),
        overallStatus: legacyStatus(idp),
      };
    });
}

export function buildLegacyPlayerDetail(player = {}) {
  const playerId = normalizeText(player.id || player.playerId || player.profileId, 160);
  const idp = player.idp || {};
  const idpInactive = idp.status === "none";
  const profile = normalizeIdpProfile({
    id: `legacy-profile-${playerId}`,
    playerId,
    playerName: player.name,
    squadNumber: player.number || player.shirtNumber || player.shirt_number,
    position: player.position,
    role: player.primaryRole,
    status: idp.status || "active",
    reviewDate: idp.reviewDate,
    strengths: idp.strengths ? String(idp.strengths).split(",") : [],
  });
  const focus = idpInactive ? null : normalizeIdpFocus({
    id: `legacy-focus-${playerId}`,
    playerId,
    title: idp.primaryFocus || "Create current focus",
    description: idp.focusAreas,
    status: idp.status === "review" ? "Ready For Review" : "Active",
    reviewDate: idp.reviewDate,
  });
  return {
    profile,
    focuses: focus ? [focus] : [],
    clipBank: [],
    evidence: [],
    reviews: [],
    nextActions: idpInactive ? [] : [normalizeIdpNextAction({ playerId, title: idp.nextAction || "Add evidence" })],
    milestones: [normalizeIdpMilestone({ playerId, title: "IDP Started", occurredOn: player.createdAt })],
    ownership: [],
  };
}

export function findSquadPlayer(playerProfilesState = {}, playerId = "") {
  return asPlayerList(playerProfilesState).find((player) => String(player.id || player.playerId || "") === String(playerId)) || null;
}
