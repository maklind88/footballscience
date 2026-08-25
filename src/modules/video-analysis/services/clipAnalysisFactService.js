import { clipMiniGamePrincipleIds, miniGamePrincipleLabel } from "./miniGamePrincipleService.js";

function text(value = "") {
  return String(value || "").trim();
}

function number(value, fallback = 0) {
  const numeric = Math.round(Number(value));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueBy(values = [], keyOf = (value) => value) {
  const seen = new Set();
  return values.filter((value) => {
    const key = text(keyOf(value));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePlayers(value = {}) {
  return uniqueBy(list(value.players).map((player) => ({
    player_id: text(player.player_id || player.playerId || player.id),
    player_label: text(player.player_label || player.playerLabel || player.name || player.player_id || player.playerId),
    role: text(player.role) || "primary",
  })).filter((player) => player.player_id || player.player_label), (player) => player.player_id || player.player_label);
}

function normalizePrinciples(value = {}) {
  const stored = list(value.mini_game_principles || value.miniGamePrinciples).map((principle) => ({
    id: text(principle.id || principle.value || principle.label_value),
    label: text(principle.label || principle.text || principle.label_text || principle.id),
  }));
  const fromClip = clipMiniGamePrincipleIds(value).map((id) => ({ id, label: miniGamePrincipleLabel(id) || id }));
  return uniqueBy([...stored, ...fromClip], (principle) => principle.id || principle.label);
}

function normalizeUnits(value = {}) {
  const direct = list(value.units).map(text);
  const descriptors = list(value.descriptors)
    .filter((entry) => text(entry.descriptor_type || entry.type) === "unit")
    .map((entry) => text(entry.descriptor_label || entry.descriptor_value || entry.value));
  return uniqueBy([...direct, ...descriptors]);
}

export function normalizeClipAnalysisFact(value = {}) {
  const startMs = number(value.startMs ?? value.start_ms);
  const endMs = Math.max(startMs + 1, number(value.endMs ?? value.end_ms, startMs + 1));
  const players = normalizePlayers(value);
  const principles = normalizePrinciples(value);
  const units = normalizeUnits(value);
  const tags = uniqueBy(list(value.tags).map((entry) => text(entry?.tag || entry)));
  const notes = list(value.notes).map((entry) => ({ note: text(entry?.note || entry) })).filter((entry) => entry.note);
  const labels = principles.map((principle) => ({
    label_type: "mini_game_principle",
    label_value: principle.id || principle.label,
    label_text: principle.label || principle.id,
  }));
  const descriptors = units.map((unit) => ({ descriptor_type: "unit", descriptor_value: unit, descriptor_label: unit }));
  return {
    ...value,
    id: text(value.id),
    matchId: text(value.matchId || value.match_id),
    match_id: text(value.matchId || value.match_id),
    videoId: text(value.videoId || value.video_id),
    video_id: text(value.videoId || value.video_id),
    startMs,
    start_ms: startMs,
    endMs,
    end_ms: endMs,
    durationMs: endMs - startMs,
    period: text(value.period) || "Uncoded",
    phase: text(value.phase) || "Uncoded",
    subPhase: text(value.subPhase || value.sub_phase) || "Uncoded",
    sub_phase: text(value.subPhase || value.sub_phase) || "Uncoded",
    outcome: text(value.outcome) || "Neutral",
    matchTitle: text(value.matchTitle || value.match_title) || "Source not linked",
    match_title: text(value.matchTitle || value.match_title) || "Source not linked",
    matchDate: text(value.matchDate || value.match_date).slice(0, 10),
    match_date: text(value.matchDate || value.match_date).slice(0, 10),
    eventType: text(value.eventType || value.event_type).toLowerCase() === "training" ? "training" : "match",
    event_type: text(value.eventType || value.event_type).toLowerCase() === "training" ? "training" : "match",
    players,
    miniGamePrinciples: principles,
    mini_game_principles: principles,
    units,
    tags,
    notes,
    labels: list(value.labels).length ? value.labels : labels,
    descriptors: list(value.descriptors).length ? value.descriptors : descriptors,
  };
}

export function normalizeClipAnalysisFacts(values = []) {
  return list(values).map(normalizeClipAnalysisFact).filter((clip) => clip.id);
}

export function clipAnalysisSearchText(clip = {}) {
  const fact = normalizeClipAnalysisFact(clip);
  return [
    fact.phase,
    fact.subPhase,
    fact.outcome,
    fact.period,
    fact.matchTitle,
    fact.matchDate,
    fact.eventType,
    ...fact.players.flatMap((player) => [player.player_id, player.player_label]),
    ...fact.miniGamePrinciples.flatMap((principle) => [principle.id, principle.label]),
    ...fact.units,
    ...fact.tags,
    ...fact.notes.map((entry) => entry.note),
  ].join(" ").toLocaleLowerCase("sv-SE");
}

export function clipMatchesActiveVideo(clip = {}, state = {}) {
  if (!text(clip.id || clip.clipId)) return false;
  const clipVideoId = text(clip.videoId || clip.video_id);
  const activeVideoId = text(state.video?.id || state.videoId || state.video_id);
  if (!clipVideoId) return Boolean(state.videoRef?.objectUrl);
  return Boolean(activeVideoId && clipVideoId === activeVideoId && state.videoRef?.objectUrl);
}
