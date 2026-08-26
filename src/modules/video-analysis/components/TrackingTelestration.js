import { normalizeDynamicGraphic } from "../domain/dynamicGraphic.model.js";
import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { resolveDynamicGraphics } from "../services/dynamicGraphicRenderService.js";
import { trackingGraphicBindingSelection } from "../services/trackingGraphicBindingService.js";
import {
  trackingExtensionAvailability,
  trackingTargetRange,
} from "../services/trackingExtensionService.js";
import { trackingPointAt } from "../services/trackingGeometryService.js";
import { formatTrackingDuration } from "../services/trackingProgressService.js";
import { trackingReviewSummary } from "../services/trackingReviewService.js";
import { escapeHtml } from "./renderHelpers.js";
import { renderTrackingGroundTruthPanel } from "./TrackingGroundTruthPanel.js";
import { renderTrackingBenchmarkSuitePanel } from "./TrackingBenchmarkSuitePanel.js";
import { renderTrackingReviewPanel } from "./TrackingReviewPanel.js";
import {
  renderAnalysisPanelTabs,
  renderSpatialSidebar,
  renderSpatialStage,
} from "./SpatialAnalysisPanel.js";

const trackingTools = Object.freeze([
  { id: "highlight", label: "Highlight" },
  { id: "spotlight", label: "Spotlight" },
  { id: "trail", label: "Trail" },
  { id: "distance", label: "Distance" },
]);

function percent(value) {
  return Math.max(0, Math.min(100, Number(value || 0) * 100));
}

function playheadMs(state = {}) {
  return Math.max(0, Math.round(Number(state.timeline?.playheadMs ?? state.draft?.startMs) || 0));
}

function currentItemTracking(item = {}) {
  return {
    tracks: (item.objectTracks || []).map(normalizeObjectTrack),
    graphics: (item.dynamicGraphics || []).map(normalizeDynamicGraphic),
  };
}

function itemRange(item = {}) {
  const clip = item.clip || {};
  const startMs = Math.max(0, Math.round(Number(item.startMs ?? clip.startMs ?? clip.start_ms) || 0));
  const endMs = Math.max(startMs + 1, Math.round(Number(item.endMs ?? clip.endMs ?? clip.end_ms) || startMs + 5000));
  return { startMs, endMs };
}

function trackedObjectLabel(track = {}) {
  if (track.playerLabel) return track.playerLabel;
  if (track.entityType === "ball") return "Ball";
  if (track.entityType === "referee") return "Referee";
  if (track.entityType === "area") return "Tracked area";
  return track.entityType === "player" ? "Unassigned player" : "Tracked object";
}

function renderTrackBox(track = {}, atMs = 0, selectedTrackIds = []) {
  const point = trackingPointAt(track, atMs, { maxInterpolationGapMs: 1200 });
  if (!point) return "";
  const selected = selectedTrackIds.includes(track.id);
  const left = percent(point.x - (point.width / 2));
  const top = percent(point.y - (point.height / 2));
  return `
    <button type="button"
      class="video-analysis-track-box${selected ? " is-selected" : ""}${point.confidence < 0.55 ? " is-low-confidence" : ""}"
      style="left:${left}%;top:${top}%;width:${percent(point.width)}%;height:${percent(point.height)}%"
      data-video-analysis-track-select="${escapeHtml(track.id)}"
      title="${escapeHtml(`${trackedObjectLabel(track)} - ${Math.round(point.confidence * 100)}% confidence`)}">
      <span>${escapeHtml(track.shirtNumber || trackedObjectLabel(track))}</span>
    </button>
  `;
}

function pathPoints(points = []) {
  return points.map((point) => `${Math.round(percent(point.x) * 10)},${Math.round(percent(point.y) * 10)}`).join(" ");
}

function renderResolvedGraphic(graphic = {}) {
  const color = escapeHtml(graphic.style?.color || "#f7d154");
  if (!graphic.available) {
    return `<span class="video-analysis-dynamic-gap" title="Tracking confidence break"></span>`;
  }
  if (["circle", "spotlight", "label"].includes(graphic.type)) {
    return `
      <span class="video-analysis-dynamic-anchor is-${escapeHtml(graphic.type)}"
        style="left:${percent(graphic.anchor.x)}%;top:${percent(graphic.anchor.y)}%;--tracking-color:${color}">
        ${graphic.type === "label" ? escapeHtml(graphic.text || "Player") : ""}
      </span>
    `;
  }
  if (["trail", "movement-curve"].includes(graphic.type)) {
    return `<svg class="video-analysis-dynamic-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><polyline points="${escapeHtml(pathPoints(graphic.points))}" style="stroke:${color}"></polyline></svg>`;
  }
  if (graphic.type === "unit-hull") {
    return `<svg class="video-analysis-dynamic-svg is-unit-hull" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><polygon points="${escapeHtml(pathPoints(graphic.anchors))}" style="stroke:${color};fill:${color}"></polygon></svg>`;
  }
  if (["distance", "unit-line"].includes(graphic.type)) {
    const [first, second] = graphic.anchors;
    const label = Number.isFinite(graphic.distanceM) ? `${graphic.distanceM.toFixed(1)} m` : "Calibrate pitch";
    return `
      <svg class="video-analysis-dynamic-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        <line x1="${Math.round(percent(first.x) * 10)}" y1="${Math.round(percent(first.y) * 10)}" x2="${Math.round(percent(second.x) * 10)}" y2="${Math.round(percent(second.y) * 10)}" style="stroke:${color}"></line>
      </svg>
      <span class="video-analysis-dynamic-distance" style="left:${percent((first.x + second.x) / 2)}%;top:${percent((first.y + second.y) / 2)}%">${escapeHtml(label)}</span>
    `;
  }
  return "";
}

function renderPrompt(prompt = null, label = "Target", queued = false) {
  if (!prompt?.box) return "";
  return `<span class="video-analysis-track-prompt${queued ? " is-queued" : ""}" style="left:${percent(prompt.box.left)}%;top:${percent(prompt.box.top)}%;width:${percent(prompt.box.width)}%;height:${percent(prompt.box.height)}%"><span>${escapeHtml(label)}</span></span>`;
}

export function renderTrackingStage(state = {}, item = null) {
  if (state.presentation?.tracking?.mode === "static" || !item) return "";
  const { tracks, graphics } = currentItemTracking(item);
  const atMs = playheadMs(state);
  const selectedTrackIds = state.presentation?.tracking?.selectedTrackIds || [];
  const pendingPrompts = state.presentation?.tracking?.pendingPrompts || [];
  const spatialCapture = Boolean(state.presentation?.spatial?.captureLandmarkId);
  const resolved = resolveDynamicGraphics(graphics, tracks, atMs, {
    calibration: state.presentation?.spatial?.calibration || null,
  });
  return `
    <div class="video-analysis-tracking-stage${spatialCapture ? " is-spatial-capturing" : ""}" data-video-analysis-tracking-stage>
      ${tracks.map((track) => renderTrackBox(track, atMs, selectedTrackIds)).join("")}
      ${resolved.map(renderResolvedGraphic).join("")}
      ${pendingPrompts.map((prompt, index) => renderPrompt(prompt, `Target ${index + 1}`, true)).join("")}
      ${renderPrompt(state.presentation?.tracking?.prompt, `Target ${pendingPrompts.length + 1}`)}
      ${renderSpatialStage(state)}
    </div>
  `;
}

export function renderTrackingToolbar(state = {}) {
  const tracking = state.presentation?.tracking || {};
  if (tracking.mode === "static") return "";
  return `
    <div class="video-analysis-tracking-toolbar" aria-label="Tracking graphics">
      ${trackingTools.map((tool) => `
        <button type="button" class="${tracking.tool === tool.id ? "is-active" : ""}" aria-pressed="${tracking.tool === tool.id}" data-video-analysis-tracking-tool="${escapeHtml(tool.id)}">${escapeHtml(tool.label)}</button>
      `).join("")}
    </div>
  `;
}

function renderTrackRow(track = {}, selectedTrackIds = []) {
  const review = trackingReviewSummary(track);
  const selected = selectedTrackIds.includes(track.id);
  const localStatus = track.metadata?.localWorkspaceStatus;
  const storageLabel = localStatus === "pending-central"
    ? "device only"
    : localStatus === "unprotected" ? "not protected" : localStatus === "samples-missing" ? "samples missing" : "";
  return `
    <li class="${selected ? "is-selected" : ""}">
      <button type="button" data-video-analysis-track-select="${escapeHtml(track.id)}">
        <strong>${escapeHtml(trackedObjectLabel(track))}</strong>
        <span>${escapeHtml(`${track.entityType} | ${Math.round(track.confidence * 100)}% / ${Math.round(review.coverage.ratio * 100)}% coverage${storageLabel ? ` | ${storageLabel}` : ""}`)}</span>
      </button>
      <em class="is-${escapeHtml(track.status)}">${escapeHtml(track.status)}</em>
    </li>
  `;
}

function renderTrackingProgress(job = {}) {
  const progress = Math.max(0, Math.min(1, Number(job.progress) || 0));
  const percentage = Math.round(progress * 100);
  const details = [`${percentage}%`, `${formatTrackingDuration(job.elapsedMs)} elapsed`];
  if (Number.isFinite(job.estimatedRemainingMs) && job.estimatedRemainingMs > 0) {
    details.push(`~${formatTrackingDuration(job.estimatedRemainingMs)} left`);
  }
  if (Number.isFinite(job.processedFrames) && Number.isFinite(job.totalFrames) && job.totalFrames > 0) {
    details.push(`${job.processedFrames}/${job.totalFrames} frames`);
  }
  return `
    <div class="video-analysis-tracking-progress" role="progressbar" aria-label="${escapeHtml(job.stage || "Tracking object")}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}">
      <span class="video-analysis-tracking-progress__meter" style="width:${percentage}%"></span>
      <div class="video-analysis-tracking-progress__copy">
        <strong>${escapeHtml(job.stage || "Tracking object")}</strong>
        <small>${escapeHtml(details.join(" | "))}</small>
      </div>
      <button type="button" data-video-analysis-tracking-action="cancel">Cancel</button>
    </div>
  `;
}

function renderTrackingContinuation(track = null, item = null, options = {}) {
  if (!track || !item) return "";
  const availability = trackingExtensionAvailability(
    track,
    trackingTargetRange(track, itemRange(item)),
  );
  const disabled = Boolean(options.jobActive) || !options.providerReady;
  const status = availability.earlier || availability.later ? "Partial" : "Complete";
  return `
    <div class="video-analysis-tracking-continuation">
      <div>
        <strong>Track span</strong>
        <span>${escapeHtml(`${formatTrackingDuration(availability.trackedDurationMs)} of ${formatTrackingDuration(availability.targetDurationMs)} | ${status}`)}</span>
      </div>
      <div class="video-analysis-tracking-continuation__actions">
        <button type="button" data-video-analysis-tracking-action="extend-earlier" ${availability.earlier && !disabled ? "" : "disabled"}>Extend earlier</button>
        <button type="button" data-video-analysis-tracking-action="extend-later" ${availability.later && !disabled ? "" : "disabled"}>Extend later</button>
        <button type="button" data-video-analysis-tracking-action="complete-range" ${(availability.earlier || availability.later) && !disabled ? "" : "disabled"}>${availability.earlier || availability.later ? "Complete range" : "Range complete"}</button>
      </div>
    </div>
  `;
}

function renderTrackingProvider(provider = {}) {
  const requestedStatus = String(provider.status || "unchecked");
  const status = ["unchecked", "checking", "ready", "not-installed", "offline"].includes(requestedStatus)
    ? requestedStatus
    : "unchecked";
  const providerName = String(provider.name || "Local tracker").replace(/^Football Science\s+/i, "");
  const label = status === "ready"
    ? `${providerName}${provider.version ? ` ${provider.version}` : ""}`
    : status === "not-installed"
      ? "Provider not installed"
      : status === "offline"
        ? "Companion offline"
        : "Checking local engine";
  return `
    <div class="video-analysis-tracking-provider is-${escapeHtml(status)}" title="${escapeHtml(provider.error || label)}">
      <span>Local engine</span>
      <strong>${escapeHtml(label)}</strong>
      <button type="button" data-video-analysis-tracking-action="refresh-provider" ${status === "checking" ? "disabled" : ""}>Refresh</button>
    </div>
  `;
}

function renderTrackingWorkspaceStatus(value = {}) {
  const status = String(value.status || "waiting-item");
  const needsAttention = status === "attention"
    || status === "pending-sync"
    || Number(value.localOnlyCount) > 0
    || Number(value.missingSampleCount) > 0;
  const label = status === "loading"
    ? "Restoring tracking workspace"
    : status === "syncing"
      ? "Synchronizing tracking metadata"
      : status === "attention"
        ? "Tracking workspace needs attention"
        : status === "pending-sync" && !Number(value.localOnlyCount)
          ? "Tracking metadata sync pending"
      : Number(value.localOnlyCount) > 0
        ? `${value.localOnlyCount} device-only track${Number(value.localOnlyCount) === 1 ? "" : "s"}`
        : Number(value.missingSampleCount) > 0
          ? `${value.missingSampleCount} track${Number(value.missingSampleCount) === 1 ? "" : "s"} need local samples`
          : status === "restored"
            ? "Tracking workspace restored"
            : status === "saved" ? "Tracking workspace protected" : "Tracking workspace ready";
  return `
    <div class="video-analysis-tracking-workspace${needsAttention ? " is-attention" : ""}" title="${escapeHtml(value.error || label)}" aria-live="polite">
      <span>Workspace</span>
      <strong>${escapeHtml(label)}</strong>
      ${needsAttention ? `<button type="button" data-video-analysis-tracking-action="retry-tracking-workspace" ${status === "syncing" ? "disabled" : ""}>Retry</button>` : ""}
    </div>
  `;
}

function pendingTargetLabel(prompt = {}, index = 0) {
  if (prompt.playerLabel) return prompt.playerLabel;
  if (prompt.shirtNumber) return `Shirt ${prompt.shirtNumber}`;
  if (prompt.entityType === "ball") return "Ball";
  if (prompt.entityType === "referee") return "Referee";
  return `Target ${index + 1}`;
}

function renderPendingTargets(prompts = [], currentPrompt = null, maximum = 8) {
  const targets = [
    ...prompts.map((prompt) => ({ prompt, queued: true })),
    ...(currentPrompt?.box ? [{ prompt: currentPrompt, queued: false }] : []),
  ];
  if (!prompts.length) return "";
  return `
    <div class="video-analysis-tracking-batch">
      <header><strong>Targets ready</strong><span>${targets.length}/${maximum}</span></header>
      <ol>
        ${targets.map(({ prompt, queued }, index) => `
          <li>
            <span><strong>${escapeHtml(pendingTargetLabel(prompt, index))}</strong><small>${escapeHtml(`${prompt.entityType || "player"}${queued ? "" : " | current"}`)}</small></span>
            <button type="button" data-video-analysis-tracking-action="${queued ? "remove-target" : "clear-target"}" ${queued ? `data-video-analysis-tracking-prompt-id="${escapeHtml(prompt.id)}"` : ""}>Remove</button>
          </li>
        `).join("")}
      </ol>
    </div>
  `;
}

export function renderTrackingSidebar(state = {}, item = null) {
  const tracking = state.presentation?.tracking || {};
  if (tracking.mode === "static") return "";
  if (state.presentation?.spatial?.panel === "spatial") {
    return `${renderAnalysisPanelTabs(state)}${renderSpatialSidebar(state, item)}`;
  }
  const { tracks, graphics } = currentItemTracking(item || {});
  const selectedTrackIds = tracking.selectedTrackIds || [];
  const provider = tracking.provider || {};
  const providerReady = provider.status === "ready";
  const pendingPrompts = tracking.pendingPrompts || [];
  const targetCount = pendingPrompts.length + (tracking.prompt?.box ? 1 : 0);
  const maximumBatchSize = Math.max(1, Math.min(8, Number(provider.maxObjectsPerJob) || 8));
  const batchReady = targetCount < 2 || provider.batchAvailable === true;
  const primaryTrack = tracks.find((track) => track.id === selectedTrackIds[0]) || null;
  const graphicSelection = trackingGraphicBindingSelection(tracks, selectedTrackIds, tracking.tool);
  const entityType = tracking.prompt?.entityType || "player";
  const clip = item?.clip || {};
  const startSeconds = ((tracking.prompt?.startMs ?? item?.startMs ?? clip.startMs ?? clip.start_ms ?? 0) / 1000).toFixed(1);
  const endSeconds = ((tracking.prompt?.endMs ?? item?.endMs ?? clip.endMs ?? clip.end_ms ?? 0) / 1000).toFixed(1);
  return `${renderAnalysisPanelTabs(state)}
    <div class="video-analysis-tracking-side">
      <div>
        <p class="video-analysis-kicker">Object tracking</p>
        <h3>${escapeHtml(primaryTrack ? trackedObjectLabel(primaryTrack) : "Select an object")}</h3>
      </div>
      ${renderTrackingProvider(provider)}
      ${renderTrackingWorkspaceStatus(tracking.workspace)}
      <label>Object
        <select data-video-analysis-tracking-field="entityType">
          <option value="player" ${entityType === "player" ? "selected" : ""}>Player</option>
          <option value="ball" ${entityType === "ball" ? "selected" : ""}>Ball</option>
          <option value="referee" ${entityType === "referee" ? "selected" : ""}>Referee</option>
        </select>
      </label>
      ${entityType === "player" ? `
        <label>Player
          <select data-video-analysis-tracking-field="playerId">
            <option value="">Unassigned</option>
            ${(state.players || []).map((player) => `<option value="${escapeHtml(player.id)}" ${tracking.prompt?.playerId === player.id ? "selected" : ""}>${escapeHtml(`${player.number ? `${player.number} ` : ""}${player.name}`)}</option>`).join("")}
          </select>
        </label>
        <label>Team side
          <select data-video-analysis-tracking-field="teamSide">
            <option value="">Unassigned</option>
            <option value="home" ${tracking.prompt?.teamSide === "home" ? "selected" : ""}>Home</option>
            <option value="away" ${tracking.prompt?.teamSide === "away" ? "selected" : ""}>Away</option>
          </select>
        </label>
        <div class="video-analysis-tracking-identity-fields">
          <label>Identity label
            <input type="text" maxlength="180" value="${escapeHtml(tracking.prompt?.playerLabel || "")}" placeholder="Opponent 9" data-video-analysis-tracking-field="playerLabel">
          </label>
          <label>Shirt
            <input type="text" maxlength="24" value="${escapeHtml(tracking.prompt?.shirtNumber || "")}" placeholder="9" data-video-analysis-tracking-field="shirtNumber">
          </label>
        </div>
      ` : ""}
      <div class="video-analysis-tracking-range">
        <label>From <input type="number" min="0" step="0.1" value="${escapeHtml(startSeconds)}" data-video-analysis-tracking-field="startSeconds"></label>
        <label>To <input type="number" min="0" step="0.1" value="${escapeHtml(endSeconds)}" data-video-analysis-tracking-field="endSeconds"></label>
      </div>
      <div class="video-analysis-tracking-commands">
        <button type="button" data-video-analysis-tracking-action="select-target">Select target</button>
        <button type="button" data-video-analysis-tracking-action="queue-target" ${tracking.prompt?.box && targetCount < maximumBatchSize ? "" : "disabled"}>Add another</button>
        <button type="button" data-video-analysis-tracking-action="run" ${targetCount && providerReady && batchReady ? "" : "disabled"}>${escapeHtml(targetCount > 1 ? `Track ${targetCount} targets` : "Track locally")}</button>
        <button type="button" data-video-analysis-tracking-action="manual" ${tracking.prompt?.box ? "" : "disabled"}>Manual keyframe</button>
        <button type="button" data-video-analysis-tracking-action="correct" ${primaryTrack ? "" : "disabled"}>Correct here</button>
      </div>
      ${renderPendingTargets(pendingPrompts, tracking.prompt, maximumBatchSize)}
      ${tracking.job ? renderTrackingProgress(tracking.job) : ""}
      ${tracking.error ? `<p class="video-analysis-error">${escapeHtml(tracking.error)}</p>` : ""}
      <ol class="video-analysis-tracking-list">
        ${tracks.length ? tracks.map((track) => renderTrackRow(track, selectedTrackIds)).join("") : `<li class="video-analysis-muted">No tracked objects in this clip.</li>`}
      </ol>
      ${renderTrackingContinuation(primaryTrack, item, { providerReady, jobActive: Boolean(tracking.job) })}
      ${renderTrackingReviewPanel(state, primaryTrack)}
      ${renderTrackingGroundTruthPanel(state, item)}
      ${renderTrackingBenchmarkSuitePanel(state)}
      <div class="video-analysis-tracking-graphics">
        <strong>${escapeHtml(`${graphics.length} dynamic graphics`)}</strong>
        <button type="button" data-video-analysis-tracking-action="add-graphic" title="${escapeHtml(graphicSelection.reason || `Add ${tracking.tool || "highlight"}`)}" ${graphicSelection.ready ? "" : "disabled"}>Add ${escapeHtml(tracking.tool || "highlight")}</button>
      </div>
    </div>
  `;
}
