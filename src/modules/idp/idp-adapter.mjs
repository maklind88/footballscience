import {
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
  return "No Active Focus";
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
        photoUrl: player.photoUrl || player.photo_url,
        status: idp.status || "active",
        reviewDate: idp.reviewDate,
        strengths: idp.strengths ? String(idp.strengths).split(",") : [],
      });
      return {
        profile,
        focus: null,
        evidenceCount: 0,
        newClipCount: 0,
        nextAction: normalizeText(idpInactive ? "IDP inactive" : "Create current focus", 180),
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
    photoUrl: player.photoUrl || player.photo_url,
    status: idp.status || "active",
    reviewDate: idp.reviewDate,
    strengths: idp.strengths ? String(idp.strengths).split(",") : [],
  });
  return {
    profile,
    focuses: [],
    clipBank: [],
    evidence: [],
    reviews: [],
    nextActions: idpInactive ? [] : [normalizeIdpNextAction({ playerId, title: "Create current focus" })],
    goals: [],
    goalCheckins: [],
    milestones: [normalizeIdpMilestone({ playerId, title: "IDP Started", occurredOn: player.createdAt })],
    ownership: [],
    interventions: [],
  };
}

export function findSquadPlayer(playerProfilesState = {}, playerId = "") {
  return asPlayerList(playerProfilesState).find((player) => String(player.id || player.playerId || "") === String(playerId)) || null;
}
