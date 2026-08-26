import { renderCodingTemplateBuilder } from "./CodingTemplateBuilder.js";
import { renderMediaProductionPanel } from "./MediaProductionPanel.js";
import { renderTagFilterOverlay } from "./TagFilterOverlay.js";
import { renderTimeline } from "./Timeline.js";
import { renderVideoPlayer } from "./VideoPlayer.js";
import { escapeHtml } from "./renderHelpers.js";
import { CODE_PIP_BOUND_MARGIN, codePipConfig } from "../services/codePipLayoutService.js";

function renderCodePipStyle(pip = null, target = "video") {
  if (!pip || !Number.isFinite(Number(pip.x)) || !Number.isFinite(Number(pip.y))) return "";
  const config = codePipConfig(target);
  const x = Math.max(CODE_PIP_BOUND_MARGIN, Math.round(Number(pip.x)));
  const y = Math.max(CODE_PIP_BOUND_MARGIN, Math.round(Number(pip.y)));
  const width = Math.max(config.minWidth, Math.round(Number(pip.width || config.minWidth)));
  const height = Math.max(config.minHeight, Math.round(Number(pip.height || config.minHeight)));
  return ` style="${config.cssPrefix}-x: ${x}px; ${config.cssPrefix}-y: ${y}px; ${config.cssPrefix}-width: ${width}px; ${config.cssPrefix}-height: ${height}px;"`;
}

function renderCodePipResizeHandles(label = "panel") {
  return ["n", "e", "s", "w", "ne", "nw", "se", "sw"].map((direction) => (
    `<div class="video-analysis-code-pip-resize video-analysis-code-pip-resize--${direction}" data-video-analysis-code-pip-resize="${direction}" aria-hidden="true" title="Resize ${escapeHtml(label)} ${direction}"></div>`
  )).join("");
}

export function renderFsPlayerWorkspace(displayState = {}) {
  const codeModeActive = displayState.fsPlayer?.mode === "code";
  const fullscreenActive = displayState.fsPlayer?.fullscreen === true;
  const pipStyle = codeModeActive ? renderCodePipStyle(displayState.fsPlayer?.pip) : "";
  const timelinePipStyle = codeModeActive ? renderCodePipStyle(displayState.fsPlayer?.timelinePip, "timeline") : "";
  const codeWindowPipStyle = codeModeActive ? renderCodePipStyle(displayState.fsPlayer?.codeWindowPip, "code-window") : "";
  return `
    <section class="video-analysis-fs-player-workstation${codeModeActive ? " is-code-mode" : ""}${fullscreenActive ? " is-fullscreen" : ""}" data-video-analysis-fs-player-workstation>
      <section class="video-analysis-fs-player-main">
        <section class="video-analysis-fs-player-deck"${codeModeActive ? ` data-video-analysis-code-pip="video"` : ""}${pipStyle}>
          ${renderVideoPlayer(displayState)}
          ${renderMediaProductionPanel(displayState)}
          ${codeModeActive ? renderCodePipResizeHandles("video panel") : ""}
        </section>
        <section class="video-analysis-fs-player-timeline"${codeModeActive ? ` data-video-analysis-code-pip="timeline"` : ""}${timelinePipStyle}>
          ${renderTimeline(displayState)}
          ${codeModeActive ? renderCodePipResizeHandles("timeline panel") : ""}
        </section>
      </section>
      <section class="video-analysis-code-window-dock"${codeModeActive ? ` data-video-analysis-code-pip="code-window"` : ""}${codeWindowPipStyle}>
        ${renderCodingTemplateBuilder(displayState)}
        ${codeModeActive ? renderCodePipResizeHandles("code window") : ""}
      </section>
    </section>
    ${renderTagFilterOverlay(displayState)}
  `;
}
