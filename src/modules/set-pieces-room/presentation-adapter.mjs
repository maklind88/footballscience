import { resolveSetPiecePhaseAssignments } from "./assignments.mjs";
import { getSetPieceRosterPlayers } from "./player-labels.mjs";
import { normalizeSetPiecesState } from "./state.mjs";

function normalizeProfilesState(candidate = {}) {
  return candidate && typeof candidate === "object" ? candidate : {};
}

export function getSetPiecePresentationCatalog(state = {}, _playerProfilesState = {}) {
  const normalized = normalizeSetPiecesState(state);
  return normalized.plays.map((play) => ({
    id: play.id,
    title: play.title,
    restart: play.restart,
    moment: play.moment,
    subPhases: [...play.subPhases],
    opponent: play.opponent,
    variants: play.variants.map((variant) => ({
      id: variant.id,
      title: variant.title,
      trigger: variant.trigger,
      phaseCount: variant.phases.length,
    })),
  }));
}

export function resolveSetPiecePresentationVariant(state = {}, playerProfilesState = {}, reference = {}) {
  const normalized = normalizeSetPiecesState(state);
  const roster = getSetPieceRosterPlayers(normalizeProfilesState(playerProfilesState));
  const play = normalized.plays.find((item) => item.id === reference.playId) || null;
  const variant = play?.variants.find((item) => item.id === reference.variantId) || play?.variants[0] || null;
  if (!play || !variant) return null;
  const phases = variant.phases.map((phase) => resolveSetPiecePhaseAssignments(phase, play, variant, roster));
  const requestedPhaseId = String(reference.phaseId || "").trim();
  const activePhaseId = phases.some((phase) => phase.id === requestedPhaseId)
    ? requestedPhaseId
    : phases.some((phase) => phase.id === variant.activePhaseId)
      ? variant.activePhaseId
      : phases[0]?.id || "";
  return {
    id: `set-piece:${play.id}:${variant.id}`,
    playId: play.id,
    playTitle: play.title,
    variantId: variant.id,
    variantTitle: variant.title,
    restart: play.restart,
    moment: play.moment,
    subPhases: [...play.subPhases],
    opponent: play.opponent,
    objective: play.objective,
    pitchView: play.pitchView,
    playerMarkerMode: play.playerMarkerMode,
    trigger: variant.trigger,
    activePhaseId,
    phases,
    play,
    variant: { ...variant, activePhaseId, phases },
  };
}
