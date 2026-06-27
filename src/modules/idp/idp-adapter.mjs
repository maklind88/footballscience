import {
  normalizeIdpFocus,
  normalizeIdpDevelopmentGoal,
  normalizeIdpDevelopmentIntervention,
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
    goals: idpInactive ? [] : [
      normalizeIdpDevelopmentGoal({
        id: `legacy-goal-${playerId}-supporting`,
        playerId,
        focusId: focus?.id || "",
        goalRole: "supporting",
        category: focus?.category || "Tactical",
        title: focus?.title ? `Make ${focus.title.toLowerCase()} visible` : "Create measurable IDP goal",
        description: idp.focusAreas || "",
        metricLabel: "Coach observations",
        metricType: "observation",
        targetValue: 3,
        currentValue: 0,
        cadence: "weekly",
        status: "active",
      }),
      normalizeIdpDevelopmentGoal({
        id: `legacy-goal-${playerId}-leadership`,
        playerId,
        focusId: focus?.id || "",
        goalRole: "leadership",
        category: "Leadership",
        title: "Own the next on-pitch action",
        description: "Player shows responsibility through communication, scanning and response after the coaching cue.",
        metricLabel: "Leadership moments",
        metricType: "observation",
        targetValue: 2,
        currentValue: 0,
        cadence: "weekly",
        status: "active",
      }),
    ],
    goalCheckins: [],
    milestones: [normalizeIdpMilestone({ playerId, title: "IDP Started", occurredOn: player.createdAt })],
    ownership: [],
    interventions: idpInactive ? [] : [normalizeIdpDevelopmentIntervention({
      playerId,
      focusId: focus?.id || "",
      title: `${focus?.title || "IDP"} intervention`,
      objective: idp.focusAreas || "",
      pitchMode: player.position === "Goalkeeper" || player.primaryRole === "GK" ? "box" : "half",
      status: "active",
      boardState: {
        player: { x: player.position === "Goalkeeper" || player.primaryRole === "GK" ? 50 : 52, y: player.position === "Goalkeeper" || player.primaryRole === "GK" ? 82 : 68 },
        referencePlayers: [{ label: "REF", x: 50, y: 46 }],
        cones: [{ x: 40, y: 58 }, { x: 60, y: 58 }, { x: 50, y: 38 }],
        zones: [{ label: focus?.category || "Development zone", x: 34, y: 28, width: 32, height: 28 }],
        arrows: [{ label: "Action path", from: { x: 50, y: 70 }, to: { x: 62, y: 42 } }],
        frames: [{ label: "Start" }],
      },
    })],
  };
}

export function findSquadPlayer(playerProfilesState = {}, playerId = "") {
  return asPlayerList(playerProfilesState).find((player) => String(player.id || player.playerId || "") === String(playerId)) || null;
}
