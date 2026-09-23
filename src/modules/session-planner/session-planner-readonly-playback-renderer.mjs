import { getTacticalBoardPitchModeOption } from "../tactical-board/index.mjs";
import { renderTacticalPlaybackIcon } from "./session-planner-tactical-playback-renderer.mjs";

export function getReadonlyTacticalView(block) {
  if (!block) return null;
  const frames = (Array.isArray(block.tacticalFrames) ? block.tacticalFrames : [])
    .filter((frame) => frame && Array.isArray(frame.elements))
    // Match the editor's legacy active-frame mirror before selecting frame one.
    .map((frame) => frame.id && frame.id === block.tacticalActiveFrameId && Array.isArray(block.tacticalElements)
      ? { ...frame, elements: block.tacticalElements }
      : frame);
  return {
    id: block.id,
    diagram: block.diagram,
    visualImage: block.visualImage,
    tacticalPitchMode: block.tacticalPitchMode,
    tacticalFrames: frames,
    tacticalActiveFrameId: frames[0]?.id || "",
    tacticalElements: frames[0]?.elements || block.tacticalElements || [],
  };
}

function renderControls(frames) {
  if (frames.length < 2) return "";
  const button = (action, icon, label) => `<button type="button" data-session-tactical-playback="${action}"
    aria-label="${label}" title="${label}">${renderTacticalPlaybackIcon(icon)}</button>`;
  return `<div class="session-tactical-playback session-readonly-controls" role="group" aria-label="Exercise playback controls">
    <div class="session-tactical-playback-transport">
      ${button("restart", "skip-back", "Back to start")}
      ${button("play", "play", "Play")}
      ${button("stop", "stop", "Stop")}
      <button type="button" data-session-tactical-playback="loop" aria-label="Loop playback" title="Loop playback" aria-pressed="false">${renderTacticalPlaybackIcon("repeat")}</button>
    </div>
    <input class="session-tactical-playhead" type="range" min="0" max="1" step="0.001" value="0" aria-label="Animation position" data-session-tactical-playhead>
    <output data-session-tactical-playback-status>Frame 1 / ${frames.length}</output>
    <select aria-label="Playback speed" title="Playback speed" data-session-tactical-playback-speed>
      <option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="1.5">1.5x</option><option value="2">2x</option>
    </select>
  </div>`;
}

export function renderReadonlyTacticalPlayback(block, renderVisual) {
  const view = getReadonlyTacticalView(block);
  if (!view) return "";
  const visual = renderVisual(view, { large: true });
  if (!visual) return "";
  const { dimensions } = getTacticalBoardPitchModeOption(view.tacticalPitchMode, "full");
  return `<div class="session-readonly-playback" data-session-readonly-playback
      style="--readonly-board-width:${dimensions.x * 8}px;--readonly-board-height:${dimensions.y * 8}px;">
    <div class="session-readonly-viewport" data-session-tactical-canvas-wrap>
      <div class="session-readonly-source" inert>${visual}</div>
    </div>
    ${renderControls(view.tacticalFrames)}
  </div>`;
}
