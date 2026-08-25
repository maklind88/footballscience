import {
  activeMediaAngle,
  activeMediaReference,
  exportRangeForState,
  mediaAnglesForState,
  mediaReferenceForAngle,
  normalizedReplayRange,
} from "../services/mediaProductionService.js";
import { selectedPresentationItem } from "../services/presentationService.js";
import { formatVideoTime } from "../services/videoPlaybackService.js";
import { escapeHtml, optionList } from "./renderHelpers.js";

const ANGLE_ROLES = ["primary", "tactical", "broadcast", "end-zone", "bench", "custom"];
const EXPORT_PRESETS = [
  { id: "review-720p", label: "Review 720p" },
  { id: "analysis-1080p", label: "Analysis 1080p" },
  { id: "master-2160p", label: "Master 2160p" },
];

function connectedAngles(state = {}) {
  return mediaAnglesForState(state).filter((angle) => mediaReferenceForAngle(state, angle)?.objectUrl);
}

function renderAngleFileInput(angleId = "") {
  return `<input type="file" accept="video/*" hidden data-video-analysis-media-angle-file="${escapeHtml(angleId)}">`;
}

function renderAngleButton(state = {}, angle = {}, activeId = "") {
  const connected = Boolean(mediaReferenceForAngle(state, angle)?.objectUrl);
  return `
    <div class="video-analysis-media-angle${angle.id === activeId ? " is-active" : ""}${connected ? " is-connected" : " is-missing"}">
      <button type="button" data-video-analysis-media-action="select-angle" data-video-analysis-media-angle="${escapeHtml(angle.id)}" aria-pressed="${angle.id === activeId}" ${connected ? "" : "disabled"}>
        <span>${escapeHtml(angle.role === "primary" ? "P" : angle.role.slice(0, 1).toUpperCase())}</span>
        <strong>${escapeHtml(angle.label || "Camera angle")}</strong>
        <small>${escapeHtml(connected ? `${(angle.syncOffsetMs / 1000).toFixed(2)} s` : "Reconnect")}</small>
      </button>
      <button type="button" class="video-analysis-media-angle__reconnect" data-video-analysis-media-action="reconnect" data-video-analysis-media-angle="${escapeHtml(angle.id)}" title="Reconnect camera file" aria-label="Reconnect ${escapeHtml(angle.label || "camera angle")}">+</button>
      ${renderAngleFileInput(angle.id)}
    </div>
  `;
}

function renderAngleEditor(angle = null) {
  if (!angle) return "";
  return `
    <div class="video-analysis-media-angle-editor">
      <label><span>Name</span><input type="text" maxlength="180" value="${escapeHtml(angle.label)}" data-video-analysis-media-angle="${escapeHtml(angle.id)}" data-video-analysis-media-angle-field="label"></label>
      <label><span>Role</span><select data-video-analysis-media-angle="${escapeHtml(angle.id)}" data-video-analysis-media-angle-field="role">${optionList(ANGLE_ROLES, angle.role)}</select></label>
      <label><span>Offset (s)</span><input type="number" step="0.01" min="-21600" max="21600" value="${escapeHtml((angle.syncOffsetMs / 1000).toFixed(2))}" data-video-analysis-media-angle="${escapeHtml(angle.id)}" data-video-analysis-media-angle-field="syncOffsetSeconds"></label>
      <label><span>Drift (ppm)</span><input type="number" step="0.1" min="-10000" max="10000" value="${escapeHtml(angle.driftPpm)}" data-video-analysis-media-angle="${escapeHtml(angle.id)}" data-video-analysis-media-angle-field="driftPpm"></label>
    </div>
  `;
}

function renderAnglesPanel(state = {}) {
  const media = state.mediaProduction || {};
  const angles = mediaAnglesForState(state);
  const active = activeMediaAngle(state);
  const available = connectedAngles(state);
  return `
    <div class="video-analysis-media-angles-panel">
      <div class="video-analysis-media-angle-strip">
        ${angles.map((angle) => renderAngleButton(state, angle, active?.id || "")).join("")}
      </div>
      <div class="video-analysis-media-angle-add">
        <label><span>New angle</span><input type="text" maxlength="180" placeholder="Tactical wide" value="${escapeHtml(media.newAngleLabel || "")}" data-video-analysis-media-field="newAngleLabel"></label>
        <label><span>Role</span><select data-video-analysis-media-field="newAngleRole">${optionList(ANGLE_ROLES.filter((role) => role !== "primary"), media.newAngleRole || "tactical")}</select></label>
        <button type="button" data-video-analysis-media-action="add-angle">Add camera</button>
        ${renderAngleFileInput("")}
      </div>
      <div class="video-analysis-media-view-toggle" role="group" aria-label="Camera layout">
        <button type="button" class="${media.viewMode !== "compare" ? "is-active" : ""}" data-video-analysis-media-action="view-single" aria-pressed="${media.viewMode !== "compare"}">Single</button>
        <button type="button" class="${media.viewMode === "compare" ? "is-active" : ""}" data-video-analysis-media-action="view-compare" aria-pressed="${media.viewMode === "compare"}" ${available.length >= 2 ? "" : "disabled"}>Compare</button>
      </div>
      ${renderAngleEditor(active)}
    </div>
  `;
}

function replayTime(value) {
  return value == null ? "--:--:--" : formatVideoTime(value);
}

function renderReplayPanel(state = {}) {
  const replay = normalizedReplayRange(state);
  const ready = replay.inMs != null && replay.outMs != null;
  const buffer = replay.buffer || {};
  const bufferProcessing = buffer.status === "processing";
  const bufferReady = buffer.status === "ready" && buffer.startMatchMs === replay.inMs && buffer.endMatchMs === replay.outMs;
  const bufferStatus = buffer.active
    ? "Playing buffer"
    : bufferProcessing
      ? `${Math.round(Number(buffer.progress || 0) * 100)}% ${buffer.stage || "buffering"}`
      : bufferReady
        ? "Buffer ready"
        : buffer.status === "stale"
          ? "Range changed"
          : buffer.status === "error"
            ? "Buffer failed"
            : "No buffer";
  return `
    <div class="video-analysis-media-replay-panel">
      <div class="video-analysis-media-replay-range">
        <span><small>In</small><strong>${escapeHtml(replayTime(replay.inMs))}</strong></span>
        <i></i>
        <span><small>Out</small><strong>${escapeHtml(replayTime(replay.outMs))}</strong></span>
        <em>${ready ? escapeHtml(formatVideoTime(replay.outMs - replay.inMs)) : "No range"}</em>
      </div>
      <div class="video-analysis-media-replay-actions">
        <button type="button" data-video-analysis-media-action="mark-in">Set in</button>
        <button type="button" data-video-analysis-media-action="mark-out">Set out</button>
        <button type="button" class="${replay.loop ? "is-active" : ""}" data-video-analysis-media-action="toggle-loop" aria-pressed="${replay.loop}">Loop</button>
        <button type="button" data-video-analysis-media-action="clear-replay" ${replay.inMs == null && replay.outMs == null ? "disabled" : ""}>Clear</button>
        <button type="button" data-video-analysis-media-action="play-replay" ${ready ? "" : "disabled"}>Play source</button>
        ${bufferProcessing
          ? `<button type="button" data-video-analysis-proxy-action="cancel-replay">Cancel buffer</button>`
          : `<button type="button" data-video-analysis-proxy-action="prepare-replay" ${ready ? "" : "disabled"}>${bufferReady ? "Rebuild buffer" : "Prepare buffer"}</button>`}
        ${buffer.active
          ? `<button type="button" class="video-analysis-media-primary" data-video-analysis-proxy-action="stop-replay">Stop buffer</button>`
          : `<button type="button" class="video-analysis-media-primary" data-video-analysis-proxy-action="play-replay" ${bufferReady ? "" : "disabled"}>Play buffer</button>`}
      </div>
      <div class="video-analysis-media-replay-buffer${buffer.active ? " is-active" : ""}">
        <span>${escapeHtml(bufferStatus)}</span>
        <small>${escapeHtml(captureSize(buffer.result?.sizeBytes || 0))}</small>
        ${bufferProcessing ? `<i><span style="width:${Math.round(Number(buffer.progress || 0) * 100)}%"></span></i>` : ""}
      </div>
      ${buffer.error ? `<p class="video-analysis-error">${escapeHtml(buffer.error)}</p>` : ""}
    </div>
  `;
}

function captureSize(bytes = 0) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1024 ** 3) return `${(value / (1024 ** 3)).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / (1024 ** 2)).toFixed(1)} MB`;
  return value ? `${Math.round(value / 1024)} KB` : "0 KB";
}

function renderCapturePanel(state = {}) {
  const capture = state.mediaProduction?.capture || {};
  const recording = capture.status === "recording";
  const armed = capture.status === "armed";
  const busy = ["requesting-file", "requesting", "stopping", "finalizing"].includes(capture.status);
  const unsupported = capture.capabilities && !capture.capabilities.supported;
  const status = recording
    ? "Recording"
    : capture.status === "requesting-file"
      ? "Choose local file"
      : capture.status === "armed"
        ? "Ready to start"
        : capture.status === "requesting"
      ? "Waiting for permission"
      : capture.status === "stopping" || capture.status === "finalizing"
        ? "Finalizing local file"
        : capture.status === "ready"
          ? "Angle ready"
          : capture.status === "error"
            ? "Capture failed"
            : "Ready";
  return `
    <div class="video-analysis-media-capture-panel">
      <div class="video-analysis-media-capture-status${recording ? " is-recording" : ""}">
        <span aria-hidden="true"></span>
        <strong>${escapeHtml(status)}</strong>
        <small>${escapeHtml(formatVideoTime(capture.elapsedMs || 0))}</small>
        <small>${escapeHtml(captureSize(capture.bytesWritten))}</small>
      </div>
      <div class="video-analysis-media-capture-actions">
        ${recording
          ? `<button type="button" class="video-analysis-media-capture-stop" data-video-analysis-capture-action="stop">Stop recording</button>`
          : armed
            ? `<button type="button" class="video-analysis-media-primary" data-video-analysis-capture-action="start">Start ${capture.mode === "camera" ? "camera" : "screen"} capture</button>`
          : `
            <button type="button" class="video-analysis-media-primary" data-video-analysis-capture-action="prepare-screen" ${busy || unsupported ? "disabled" : ""}>Capture screen</button>
            <button type="button" data-video-analysis-capture-action="prepare-camera" ${busy || unsupported ? "disabled" : ""}>Capture camera</button>
          `}
        ${busy || armed ? `<button type="button" data-video-analysis-capture-action="cancel">Cancel</button>` : ""}
      </div>
      ${capture.fileName ? `<code>${escapeHtml(capture.fileName)}</code>` : ""}
      ${capture.error ? `<p class="video-analysis-error">${escapeHtml(capture.error)}</p>` : ""}
    </div>
  `;
}

function renderProxyPanel(state = {}) {
  const angle = activeMediaAngle(state);
  const proxyState = state.mediaProduction?.proxy || {};
  const proxy = proxyState.byAngleId?.[angle?.id] || {};
  const processing = proxy.status === "processing";
  const result = proxy.result || {};
  const status = processing
    ? `${Math.round(Number(proxy.progress || 0) * 100)}% ${proxy.stage || "processing"}`
    : proxy.enabled
      ? "Proxy active"
      : proxy.status === "ready"
        ? "Proxy ready"
        : proxy.status === "expired"
          ? "Access expired"
          : proxy.status === "error"
            ? "Proxy failed"
            : "Ready";
  return `
    <div class="video-analysis-media-proxy-panel">
      <div class="video-analysis-media-proxy-fields">
        <label><span>Profile</span><select data-video-analysis-proxy-field="preset" ${processing ? "disabled" : ""}>
          <option value="scrub-540p" ${proxyState.preset !== "review-720p" ? "selected" : ""}>Scrub 540p</option>
          <option value="review-720p" ${proxyState.preset === "review-720p" ? "selected" : ""}>Review 720p</option>
        </select></label>
        <span><small>Angle</small><strong>${escapeHtml(angle?.label || "Primary")}</strong></span>
        <span><small>Status</small><strong>${escapeHtml(status)}</strong></span>
        <span><small>Cache</small><strong>${result.artifactId ? result.cacheHit ? "Reused" : "Device local" : "--"}</strong></span>
      </div>
      <div class="video-analysis-media-proxy-metrics">
        <span><small>Frame</small><strong>${result.height ? `${result.height}p / ${result.fps || 25} fps` : "--"}</strong></span>
        <span><small>Keyframes</small><strong>${result.keyframeSeconds ? `${result.keyframeSeconds} s` : "--"}</strong></span>
        <span><small>Size</small><strong>${escapeHtml(captureSize(result.sizeBytes || 0))}</strong></span>
        <span><small>Checksum</small><strong>${escapeHtml(result.sha256 ? result.sha256.slice(0, 12) : "--")}</strong></span>
      </div>
      ${processing ? `<div class="video-analysis-media-proxy-progress"><span style="width:${Math.round(Number(proxy.progress || 0) * 100)}%"></span></div>` : ""}
      <div class="video-analysis-media-proxy-actions">
        ${processing
          ? `<button type="button" data-video-analysis-proxy-action="cancel-proxy">Cancel</button>`
          : `<button type="button" class="video-analysis-media-primary" data-video-analysis-proxy-action="generate">${result.artifactId ? "Refresh proxy" : "Create proxy"}</button>`}
        <button type="button" data-video-analysis-proxy-action="toggle" ${result.artifactId && !processing ? "" : "disabled"}>${proxy.enabled ? "Use original" : "Use proxy"}</button>
      </div>
      ${proxy.error ? `<p class="video-analysis-error">${escapeHtml(proxy.error)}</p>` : ""}
    </div>
  `;
}

function exportStatus(mediaExport = {}) {
  if (mediaExport.status === "rendering") return `${Math.round(Number(mediaExport.progress || 0) * 100)}% ${mediaExport.stage || "rendering"}`;
  if (mediaExport.status === "ready") return "MP4 ready";
  if (mediaExport.status === "cancelled") return "Cancelled";
  if (mediaExport.status === "error") return "Export failed";
  return "Ready to render";
}

function portableVisibility(asset = {}) {
  if (asset.visibility === "team") return "Team";
  if (asset.visibility === "targets") return `${asset.targetCount || 0} recipients`;
  return "Private";
}

function portablePublishedAt(value = "") {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Pending";
  return new Date(timestamp).toISOString().slice(0, 16).replace("T", " ");
}

function renderPortableAsset(asset = {}, playback = null) {
  const active = playback?.asset?.id === asset.id;
  const range = asset.manifest?.range || {};
  const rangeLabel = `${formatVideoTime(range.startMs || 0)} - ${formatVideoTime(range.endMs || 0)}`;
  return `
    <li class="video-analysis-portable-asset${active ? " is-active" : ""}">
      <div>
        <strong>${escapeHtml(asset.title || "Football Science review")}</strong>
        <small>${escapeHtml(`${rangeLabel} / ${captureSize(asset.sizeBytes)} / ${portableVisibility(asset)}`)}</small>
      </div>
      <time datetime="${escapeHtml(asset.publishedAt || "")}">${escapeHtml(portablePublishedAt(asset.publishedAt))}</time>
      <div class="video-analysis-portable-asset__actions">
        <button type="button" class="${active ? "is-active" : ""}" data-video-analysis-portable-action="${active ? "close" : "open"}" data-video-analysis-portable-asset="${escapeHtml(asset.id)}">${active ? "Close" : "Play"}</button>
        <button type="button" data-video-analysis-portable-action="download" data-video-analysis-portable-asset="${escapeHtml(asset.id)}" ${asset.canDownload ? "" : "disabled"}>Download</button>
        ${asset.owner ? `<button type="button" class="video-analysis-portable-revoke" data-video-analysis-portable-action="revoke" data-video-analysis-portable-asset="${escapeHtml(asset.id)}">Revoke</button>` : ""}
      </div>
    </li>
  `;
}

function renderSharePanel(state = {}) {
  const portable = state.mediaProduction?.portable || {};
  const publishing = portable.status === "publishing";
  const loading = portable.status === "loading";
  const assets = Array.isArray(portable.assets) ? portable.assets : [];
  return `
    <div class="video-analysis-portable-panel">
      <div class="video-analysis-portable-toolbar">
        <span><small>Portable reviews</small><strong>${assets.length}</strong></span>
        <span><small>Status</small><strong>${escapeHtml(publishing ? portable.stage || "Publishing" : loading ? "Loading" : "Ready")}</strong></span>
        <button type="button" data-video-analysis-portable-action="refresh" ${loading || publishing ? "disabled" : ""}>Refresh</button>
      </div>
      ${publishing ? `
        <div class="video-analysis-portable-progress" aria-label="Publishing portable review">
          <span style="width:${Math.round(Number(portable.progress || 0) * 100)}%"></span>
        </div>
        <button type="button" data-video-analysis-portable-action="cancel">Cancel publishing</button>
      ` : ""}
      ${portable.playback?.active ? `<div class="video-analysis-portable-now"><span>Playing</span><strong>${escapeHtml(portable.playback.asset?.title || "Portable review")}</strong><button type="button" data-video-analysis-portable-action="close">Close</button></div>` : ""}
      ${assets.length
        ? `<ol class="video-analysis-portable-list">${assets.map((asset) => renderPortableAsset(asset, portable.playback)).join("")}</ol>`
        : loading ? "" : `<p class="video-analysis-portable-empty">No portable reviews published for this match.</p>`}
      ${portable.error ? `<p class="video-analysis-error">${escapeHtml(portable.error)}</p>` : ""}
    </div>
  `;
}

function renderExportPanel(state = {}) {
  const mediaExport = state.mediaProduction?.export || {};
  const range = exportRangeForState(state);
  const active = activeMediaAngle(state);
  const rendering = mediaExport.status === "rendering";
  const result = mediaExport.result || null;
  const portable = state.mediaProduction?.portable || {};
  const publishing = portable.status === "publishing";
  const selectedItem = selectedPresentationItem(
    state.presentation?.current,
    state.presentation?.selectedItemId,
    state.presentation?.selectedClipId,
  );
  const designLayerCount = (selectedItem?.drawings?.length || 0) + (selectedItem?.dynamicGraphics?.length || 0);
  const renderedPrimitiveCount = Number(result?.manifest?.analysis?.compositePrimitiveCount) || 0;
  const graphicsLabel = result
    ? renderedPrimitiveCount ? `${renderedPrimitiveCount} primitives` : "Source only"
    : designLayerCount ? `${designLayerCount} layers` : "Source only";
  return `
    <div class="video-analysis-media-export-panel">
      <div class="video-analysis-media-export-fields">
        <label><span>Title</span><input type="text" maxlength="180" value="${escapeHtml(mediaExport.title || "Football Science review")}" data-video-analysis-media-field="export.title"></label>
        <label><span>Output</span><select data-video-analysis-media-field="export.preset">${EXPORT_PRESETS.map((preset) => `<option value="${preset.id}" ${preset.id === mediaExport.preset ? "selected" : ""}>${preset.label}</option>`).join("")}</select></label>
      </div>
      <div class="video-analysis-media-export-summary">
        <span><small>Angle</small><strong>${escapeHtml(active?.label || "Primary")}</strong></span>
        <span><small>Range</small><strong>${escapeHtml(`${formatVideoTime(range.startMs)} - ${formatVideoTime(range.endMs)}`)}</strong></span>
        <span><small>Status</small><strong>${escapeHtml(exportStatus(mediaExport))}</strong></span>
        <span><small>Graphics</small><strong>${escapeHtml(graphicsLabel)}</strong></span>
      </div>
      ${rendering ? `<div class="video-analysis-media-export-progress"><span style="width:${Math.round(Number(mediaExport.progress || 0) * 100)}%"></span></div>` : ""}
      ${mediaExport.error ? `<p class="video-analysis-error">${escapeHtml(mediaExport.error)}</p>` : ""}
      <div class="video-analysis-media-export-actions">
        ${rendering
          ? `<button type="button" data-video-analysis-media-action="cancel-export">Cancel</button>`
          : `<button type="button" class="video-analysis-media-primary" data-video-analysis-media-action="render">Render MP4</button>`}
        <button type="button" data-video-analysis-media-action="download" ${result?.downloadUrl ? "" : "disabled"}>Download</button>
        <button type="button" data-video-analysis-media-action="download-manifest" ${result?.manifestUrl ? "" : "disabled"}>Manifest</button>
        ${publishing
          ? `<button type="button" data-video-analysis-portable-action="cancel">Cancel publishing</button>`
          : `<button type="button" data-video-analysis-portable-action="publish" ${result?.artifactId && result?.sha256 ? "" : "disabled"}>Publish review</button>`}
        ${result?.sha256 ? `<code title="SHA-256">${escapeHtml(result.sha256.slice(0, 12))}</code>` : ""}
      </div>
    </div>
  `;
}

function renderPanelBody(state = {}) {
  const panel = state.mediaProduction?.panel || "angles";
  if (panel === "replay") return renderReplayPanel(state);
  if (panel === "capture") return renderCapturePanel(state);
  if (panel === "proxy") return renderProxyPanel(state);
  if (panel === "export") return renderExportPanel(state);
  if (panel === "share") return renderSharePanel(state);
  return renderAnglesPanel(state);
}

export function renderMediaSecondaryFeeds(state = {}) {
  if (state.mediaProduction?.viewMode !== "compare" || state.mediaProduction?.portable?.playback?.active) return "";
  const active = activeMediaAngle(state);
  return connectedAngles(state).filter((angle) => angle.id !== active?.id).slice(0, 3).map((angle) => {
    const reference = mediaReferenceForAngle(state, angle);
    return `
      <div class="video-analysis-media-secondary-feed">
        <video src="${escapeHtml(reference.objectUrl)}" muted playsinline preload="metadata" tabindex="-1" data-video-analysis-media-secondary="${escapeHtml(angle.id)}"></video>
        <span>${escapeHtml(angle.label)}</span>
      </div>
    `;
  }).join("");
}

export function renderMediaProductionPanel(state = {}) {
  const media = state.mediaProduction || {};
  const angles = mediaAnglesForState(state);
  const connected = connectedAngles(state).length;
  const active = activeMediaAngle(state);
  const reference = activeMediaReference(state);
  return `
    <section class="video-analysis-media-production${media.panelOpen ? " is-open" : ""}" data-video-analysis-media-production>
      <header>
        <button type="button" class="video-analysis-media-production__toggle" data-video-analysis-media-action="toggle" aria-expanded="${Boolean(media.panelOpen)}">
          <span aria-hidden="true">CAM</span>
          <strong>Media</strong>
          <small>${escapeHtml(`${connected}/${angles.length} cameras / ${reference?.objectUrl ? active?.label || "Primary" : "reconnect"}`)}</small>
        </button>
        <nav aria-label="Media production" ${media.panelOpen ? "" : "hidden"}>
          ${["angles", "capture", "proxy", "replay", "export", "share"].map((panel) => `<button type="button" class="${media.panel === panel ? "is-active" : ""}" data-video-analysis-media-panel="${panel}" aria-pressed="${media.panel === panel}">${panel[0].toUpperCase()}${panel.slice(1)}</button>`).join("")}
        </nav>
      </header>
      ${media.panelOpen ? `<div class="video-analysis-media-production__body">${renderPanelBody(state)}${media.error ? `<p class="video-analysis-media-warning">${escapeHtml(media.error)}</p>` : ""}</div>` : ""}
    </section>
  `;
}
