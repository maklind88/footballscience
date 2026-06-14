import { defaultMiniGamePrincipleId } from "./constants/miniGamePrinciples.js";
import { defaultTeamPrincipleId } from "./constants/principles.js";
import { defaultVideoAnalysisOutcome } from "./constants/outcomes.js";
import { defaultVideoAnalysisPhase } from "./constants/phases.js";
import { defaultVideoAnalysisSubPhase } from "./constants/subPhases.js";
import { createDefaultCodingTemplate } from "./services/codingTemplateService.js";
import { createReviewSections } from "./services/reviewSessionService.js";

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
  const template = createDefaultCodingTemplate();
  return {
    status: "idle",
    canEdit: Boolean(context.canEdit?.()),
    players: normalizeVideoAnalysisPlayers(context.getPlayerProfilesState?.()),
    videoRef: null,
    playbackPreparation: {
      active: false,
      token: "",
    },
    match: null,
    video: null,
    source: null,
    clips: [],
    savedSearches: [],
    selectedClipId: "",
    template,
    codingSession: {
      mode: template.defaultMode,
      preRollMs: template.preRollMs,
      postRollMs: template.postRollMs,
      activeButtonId: "",
      manualInMs: null,
    },
    timeline: {
      zoom: 1,
      laneMode: "phase",
      playheadMs: 0,
    },
    matrix: {
      mode: "phase-outcome",
      selectedRow: "",
      selectedColumn: "",
    },
    filters: {
      search: "",
      phase: "",
      playerId: "",
      principleId: "",
      miniGamePrincipleId: "",
      outcome: "",
      unit: "",
      descriptorValue: "",
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
      unit: "",
      pitchZone: "",
      pressure: "",
      decision: "",
      execution: "",
      tags: "",
      note: "",
    },
    reviewList: [],
    reviewTitle: "Football Science Review",
    activeReviewSectionId: "team-meeting",
    reviewSections: createReviewSections(),
    message: "",
    error: "",
  };
}
