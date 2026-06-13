import { escapeHtml } from "./renderHelpers.js";

export function renderPlayerClipDrawer(state = {}) {
  const clip = (state.clips || []).find((item) => item.id === state.selectedClipId);
  if (!clip) return "";
  const players = Array.isArray(clip.players) ? clip.players : [];
  return `
    <aside class="video-analysis-drawer">
      <strong>${escapeHtml(clip.phase)} / ${escapeHtml(clip.subPhase || clip.sub_phase)}</strong>
      <span>${escapeHtml(clip.outcome || "Neutral")}</span>
      <ul>
        ${players.map((player) => `<li>${escapeHtml(player.player_label || player.player_id)} · ${escapeHtml(player.role || "primary")}</li>`).join("")}
      </ul>
    </aside>
  `;
}
