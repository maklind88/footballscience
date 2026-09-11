import { renderMediaProductionToggle } from "./MediaProductionPanel.js";
import { playerHeaderIcon } from "./playerHeaderIcons.js";

export function renderPlayerHeaderActions(state, options = {}) {
  const { hasVideo, showPermissionReconnect, needsReconnect, loadLabel, needsPrepare, showPrepared } = options;
  return `
    <div class="video-analysis-player__actions">
      <input class="video-analysis-file-input" type="file" accept="video/*" data-video-analysis-file hidden>
      ${renderMediaProductionToggle(state)}
      <button type="button" id="video-analysis-player-settings-trigger" class="video-analysis-player-header-button" data-video-analysis-player-settings popovertarget="video-analysis-player-settings-menu" aria-label="Settings" title="Settings" aria-haspopup="menu" aria-expanded="false" aria-controls="video-analysis-player-settings-menu">
        ${playerHeaderIcon("settings")}
      </button>
      <div id="video-analysis-player-settings-menu" class="video-analysis-player-settings-menu" popover="auto" role="menu" aria-label="Player settings">
        ${showPermissionReconnect ? `<button type="button" role="menuitem" class="video-analysis-icon-button" data-video-analysis-restore-local-file>Reconnect local file</button>` : ""}
        ${showPermissionReconnect && !hasVideo ? "" : `<button type="button" role="menuitem" class="video-analysis-icon-button" data-video-analysis-load title="${needsReconnect ? "Reconnect local video" : "Link local video"}">${loadLabel}</button>`}
        ${needsPrepare || showPrepared ? `<button type="button" role="menuitem" class="video-analysis-icon-button" data-video-analysis-prepare-playback ${needsPrepare ? "" : "disabled"} title="Prepare browser-safe playback copy">${showPrepared ? "Prepared" : "Prepare"}</button>` : ""}
      </div>
    </div>
  `;
}
