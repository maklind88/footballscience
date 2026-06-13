import { defaultMiniGamePrincipleId } from "./constants/miniGamePrinciples.js";
import { defaultTeamPrincipleId } from "./constants/principles.js";
import { defaultVideoAnalysisOutcome } from "./constants/outcomes.js";
import { defaultVideoAnalysisPhase } from "./constants/phases.js";
import { defaultVideoAnalysisSubPhase } from "./constants/subPhases.js";

function normalizePlayer(player = {}) {
  const id = String(player.id || player.playerId || player.player_id || "").trim();
  const name = String(player.name || player.playerName || player.player_label || "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    number: String(player.number || ""),
    position: String(player.position || player.primaryRole || player.role || ""),
  };
}

export function normalizeVideoAnalysisPlayers(state = {}) {
  const players = Array.isArray(state.players) ? state.players : [];
  return players.map(normalizePlayer).filter(Boolean);
}

export function createInitialVideoAnalysisState(context = {}) {
  return {
    status: "idle",
    canEdit: Boolean(context.canEdit?.()),
    players: normalizeVideoAnalysisPlayers(context.getPlayerProfilesState?.()),
    videoRef: null,
    match: null,
    video: null,
    source: null,
    clips: [],
    selectedClipId: "",
    filters: {
      search: "",
      phase: "",
      playerId: "",
      principleId: "",
      outcome: "",
    },
    draft: {
      startMs: 0,
      endMs: 5000,
      period: "1",
      phase: defaultVideoAnalysisPhase,
      subPhase: defaultVideoAnalysisSubPhase,
      teamPrincipleId: defaultTeamPrincipleId,
      miniGamePrincipleId: defaultMiniGamePrincipleId,
      outcome: defaultVideoAnalysisOutcome,
      playerId: "",
      playerRole: "primary",
      tags: "",
      note: "",
    },
    reviewList: [],
    message: "",
    error: "",
  };
}
