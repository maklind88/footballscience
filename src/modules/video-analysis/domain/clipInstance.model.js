import { defaultVideoAnalysisOutcome, videoAnalysisOutcomes } from "../constants/outcomes.js";
import { defaultVideoAnalysisPhase } from "../constants/phases.js";
import { defaultVideoAnalysisSubPhase } from "../constants/subPhases.js";

export function normalizeMs(value, fallback = 0) {
  const ms = Math.round(Number(value));
  return Number.isFinite(ms) && ms >= 0 ? ms : fallback;
}

export function normalizeOutcome(value) {
  return videoAnalysisOutcomes.includes(value) ? value : defaultVideoAnalysisOutcome;
}

export function normalizeClipInstance(value = {}) {
  const startMs = normalizeMs(value.startMs ?? value.start_ms);
  const endMs = normalizeMs(value.endMs ?? value.end_ms, startMs + 5000);
  return {
    id: String(value.id || ""),
    matchId: String(value.matchId || value.match_id || ""),
    videoId: String(value.videoId || value.video_id || ""),
    startMs,
    endMs: Math.max(startMs + 1, endMs),
    period: String(value.period || ""),
    phase: String(value.phase || defaultVideoAnalysisPhase),
    subPhase: String(value.subPhase || value.sub_phase || defaultVideoAnalysisSubPhase),
    teamPrincipleId: String(value.teamPrincipleId || value.team_principle_id || ""),
    miniGamePrincipleId: String(value.miniGamePrincipleId || value.mini_game_principle_id || ""),
    outcome: normalizeOutcome(value.outcome),
    codingMode: String(value.codingMode || value.coding_mode || "manual"),
    codingTemplateId: String(value.codingTemplateId || value.coding_template_id || ""),
    codingButtonId: String(value.codingButtonId || value.coding_button_id || ""),
    preRollMs: normalizeMs(value.preRollMs ?? value.pre_roll_ms),
    postRollMs: normalizeMs(value.postRollMs ?? value.post_roll_ms),
    players: Array.isArray(value.players) ? value.players : [],
    tags: Array.isArray(value.tags) ? value.tags : [],
    notes: Array.isArray(value.notes) ? value.notes : [],
    labels: Array.isArray(value.labels) ? value.labels : [],
    descriptors: Array.isArray(value.descriptors) ? value.descriptors : [],
    createdAt: String(value.createdAt || value.created_at || ""),
    updatedAt: String(value.updatedAt || value.updated_at || ""),
  };
}
