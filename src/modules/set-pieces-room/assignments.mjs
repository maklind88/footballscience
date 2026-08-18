import {
  createSetPiecePlayerLabelMap,
  getSetPiecePlayerName,
  getSetPiecePlayerPhotoUrl,
} from "./player-labels.mjs";

export function getSetPieceAssignment(play = {}, variant = {}, slotId = "") {
  const base = (play.assignments || []).find((assignment) => assignment.slotId === slotId) || {
    slotId,
    role: "Role",
    profileId: "",
  };
  const override = (variant.assignmentOverrides || []).find((assignment) => assignment.slotId === slotId);
  return {
    ...base,
    profileId: override ? override.profileId : base.profileId,
    isVariantOverride: Boolean(override),
  };
}

export function getSetPieceRoleCode(role = "Role") {
  const words = String(role || "Role").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "R";
  const code = words.length === 1
    ? words[0].slice(0, 2)
    : `${words[0][0] || ""}${words.at(-1)?.[0] || ""}`;
  return code.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 3) || "R";
}

export function resolveSetPiecePhaseAssignments(phase = {}, play = {}, variant = {}, roster = []) {
  const playerLabels = createSetPiecePlayerLabelMap(roster.map((entry) => entry.player));
  const playersById = new Map(roster.map((entry) => [String(entry.id || entry.player?.id || ""), entry.player || {}]));
  return {
    ...phase,
    elements: (phase.elements || []).map((element) => {
      if (element.kind !== "home-player") return element;
      const assignment = getSetPieceAssignment(play, variant, element.id);
      const player = playersById.get(String(assignment.profileId || "")) || {};
      return {
        ...element,
        profileId: assignment.profileId,
        role: assignment.role,
        playerName: getSetPiecePlayerName(player),
        photoUrl: getSetPiecePlayerPhotoUrl(player),
        label: playerLabels.get(assignment.profileId) || getSetPieceRoleCode(assignment.role),
      };
    }),
  };
}

export function getSetPieceAssignedSlot(play = {}, variant = {}, profileId = "", excludedSlotId = "") {
  if (!profileId) return null;
  return (play.assignments || []).find((assignment) => (
    assignment.slotId !== excludedSlotId &&
    getSetPieceAssignment(play, variant, assignment.slotId).profileId === profileId
  )) || null;
}
