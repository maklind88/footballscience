import { isPlayerOnlyClip } from "../services/clipInstanceService.js";
import { escapeHtml } from "./renderHelpers.js";

function firstPlayerLabel(players = []) {
  const player = players[0] || {};
  return player.player_label || player.playerLabel || player.player_id || player.playerId || "Player";
}

export function renderPlayerClipDrawer(state = {}) {
  const clip = (state.clips || []).find((item) => item.id === state.selectedClipId);
  if (!clip) return "";
  const players = Array.isArray(clip.players) ? clip.players : [];
  const title = isPlayerOnlyClip(clip) ? firstPlayerLabel(players) : `${clip.phase} / ${clip.subPhase || clip.sub_phase}`;
  return `
    <aside class="video-analysis-drawer">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(clip.outcome || "Neutral")}</span>
      <ul>
        ${players.map((player) => `<li>${escapeHtml(player.player_label || player.player_id)} · ${escapeHtml(player.role || "primary")}</li>`).join("")}
      </ul>
    </aside>
  `;
}
