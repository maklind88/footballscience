import { renderSetPieceToolIcon } from "../set-pieces-room/tool-icons.mjs";

export function renderTacticalPlaybackControls(frames, activeId, escapeHtml) {
  const disabled = frames.length < 2 ? "disabled" : "";
  const iconButton = (action, icon, label) => `<button type="button" data-session-tactical-playback="${action}"
    aria-label="${label}" title="${label}" ${disabled}>${renderSetPieceToolIcon(icon)}</button>`;
  return `<div class="session-tactical-playback" role="group" aria-label="Exercise animation">
    <div class="session-tactical-playback-transport">
      ${iconButton("restart", "skip-back", "Back to start")}
      ${iconButton("play", "play", "Play")}
      ${iconButton("stop", "stop", "Back to editing")}
      <button type="button" data-session-tactical-playback="loop" aria-label="Loop playback" title="Loop playback" aria-pressed="false" ${disabled}>${renderSetPieceToolIcon("repeat")}</button>
    </div>
    <input class="session-tactical-playhead" type="range" min="0" max="1" step="0.001" value="0" aria-label="Animation position" data-session-tactical-playhead ${disabled}>
    <output data-session-tactical-playback-status>Frame ${Math.max(0, frames.findIndex((frame) => frame.id === activeId)) + 1} / ${frames.length}</output>
    <select aria-label="Playback speed" title="Playback speed" data-session-tactical-playback-speed>
      <option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="1.5">1.5x</option><option value="2">2x</option>
    </select>
    <div class="session-tactical-frame-navigation">
    <select aria-label="Go to frame" title="Go to frame" data-session-tactical-frame-select>
      ${frames.map((frame, index) => `<option value="${escapeHtml(frame.id)}" ${frame.id === activeId ? "selected" : ""}>${index + 1} / ${frames.length}</option>`).join("")}
    </select>
    <div class="session-tactical-playback-frames" role="group" aria-label="Frames">
      ${frames.map((frame, index) => `<button type="button" class="session-tacticalboard-frame${frame.id === activeId ? " is-active" : ""}" data-session-tactical-frame="${escapeHtml(frame.id)}" aria-label="${escapeHtml(frame.label)}" title="${escapeHtml(frame.label)}" aria-pressed="${frame.id === activeId}">${index + 1}</button>`).join("")}
    </div>
    </div>
    <button type="button" class="session-tactical-next-frame" data-session-add-tactical-frame title="Copy this frame as the next step">${renderSetPieceToolIcon("plus")}<span>Next frame</span></button>
    <button type="button" data-session-delete-tactical-frame aria-label="Delete frame" title="Delete frame" ${disabled}>${renderSetPieceToolIcon("trash")}</button>
  </div>`;
}

export { renderSetPieceToolIcon as renderTacticalPlaybackIcon };
