import { miniGamePrinciples } from "../constants/miniGamePrinciples.js";
import { teamPrinciples } from "../constants/principles.js";
import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml } from "./renderHelpers.js";

function principleLabel(items = [], id = "") {
  return items.find((item) => item.id === id)?.label || id || "No principle";
}

function playerLabel(clip = {}) {
  const first = Array.isArray(clip.players) ? clip.players[0] : null;
  return first?.player_label || first?.playerId || first?.player_id || "Unit";
}

function descriptorSummary(clip = {}) {
  return (clip.descriptors || [])
    .filter((entry) => ["unit", "pitch_zone", "pressure", "decision", "execution"].includes(entry.descriptor_type || entry.type))
    .map((entry) => entry.descriptor_label || entry.descriptor_value || entry.value)
    .filter(Boolean)
    .slice(0, 4)
    .join(" · ");
}

function clipVisibility(clip = {}) {
  const value = String(clip.visibility || clip.clipVisibility || clip.clip_visibility || "").toLowerCase();
  if (clip.idpShared || clip.idp_shared || value === "idp" || value === "player-safe") return "idp";
  if (clip.isShared || clip.is_shared || value === "team" || value === "shared") return "team";
  return "private";
}

function visibilityLabel(visibility = "private") {
  if (visibility === "idp") return "IDP shared";
  if (visibility === "team") return "Shared";
  return "Private";
}

function renderSharingAction(clip = {}, visibility = "private", canEdit = false) {
  if (!canEdit) return "";
  if (visibility === "idp") {
    return `<button type="button" disabled title="Player-linked clips stay shared through IDP access.">IDP locked</button>`;
  }
  const nextVisibility = visibility === "private" ? "team" : "private";
  const label = visibility === "private" ? "Share" : "Make private";
  return `<button type="button" data-video-analysis-share-clip="${escapeHtml(clip.id)}:${nextVisibility}">${label}</button>`;
}

function renderClip(clip = {}, canEdit = false) {
  const startMs = clip.startMs ?? clip.start_ms ?? 0;
  const teamPrinciple = clip.teamPrincipleId || clip.team_principle_id;
  const miniGame = clip.miniGamePrincipleId || clip.mini_game_principle_id;
  const latestNote = Array.isArray(clip.notes) ? clip.notes.at(-1)?.note || "" : "";
  const descriptors = descriptorSummary(clip);
  const visibility = clipVisibility(clip);
  return `
    <article class="video-analysis-clip" data-video-analysis-clip="${escapeHtml(clip.id)}">
      <button type="button" class="video-analysis-clip__time" data-video-analysis-seek="${escapeHtml(clip.id)}">
        ${escapeHtml(formatVideoTime(startMs))}
      </button>
      <div class="video-analysis-clip__body">
        <strong>${escapeHtml(clip.phase)} / ${escapeHtml(clip.subPhase || clip.sub_phase)}</strong>
        <span>${escapeHtml(principleLabel(teamPrinciples, teamPrinciple))} · ${escapeHtml(principleLabel(miniGamePrinciples, miniGame))}</span>
        <span>${escapeHtml(playerLabel(clip))} · ${escapeHtml(clip.outcome || "Neutral")}</span>
        <span class="video-analysis-clip__visibility is-${escapeHtml(visibility)}">${escapeHtml(visibilityLabel(visibility))}</span>
        ${descriptors ? `<span>${escapeHtml(descriptors)}</span>` : ""}
        ${latestNote ? `<p>${escapeHtml(latestNote)}</p>` : ""}
      </div>
      <div class="video-analysis-clip__actions">
        <button type="button" data-video-analysis-review="${escapeHtml(clip.id)}">Add to presentation</button>
        ${renderSharingAction(clip, visibility, canEdit)}
        <button type="button" data-video-analysis-archive="${escapeHtml(clip.id)}" ${canEdit ? "" : "disabled"}>Archive</button>
      </div>
    </article>
  `;
}

export function renderClipList(state = {}) {
  const clips = Array.isArray(state.clips) ? state.clips : [];
  return `
    <section class="video-analysis-clip-list">
      <div class="video-analysis-panel-header">
        <p class="video-analysis-kicker">Clips</p>
        <h3>${clips.length} results</h3>
      </div>
      <div class="video-analysis-clip-scroll">
        ${clips.length ? clips.map((clip) => renderClip(clip, state.canEdit)).join("") : `<p class="video-analysis-muted">No clips found.</p>`}
      </div>
    </section>
  `;
}
