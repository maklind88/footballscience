import { normalizeDynamicGraphic } from "../domain/dynamicGraphic.model.js";
import { normalizeObjectTrack } from "../domain/tracking.model.js";
import { resolveDynamicGraphics } from "../services/dynamicGraphicRenderService.js";
import { trackingPointAt } from "../services/trackingGeometryService.js";
import { trackingReviewSummary } from "../services/trackingReviewService.js";
import { escapeHtml } from "./renderHelpers.js";
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
      title="${escapeHtml(`${track.playerLabel || "Unassigned player"} - ${Math.round(point.confidence * 100)}% confidence`)}">
      <span>${escapeHtml(track.shirtNumber || track.playerLabel || "Track")}</span>
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

function renderPrompt(prompt = null) {
  if (!prompt?.box) return "";
  return `<span class="video-analysis-track-prompt" style="left:${percent(prompt.box.left)}%;top:${percent(prompt.box.top)}%;width:${percent(prompt.box.width)}%;height:${percent(prompt.box.height)}%"><span>Target</span></span>`;
}

export function renderTrackingStage(state = {}, item = null) {
  if (state.presentation?.tracking?.mode === "static" || !item) return "";
  const { tracks, graphics } = currentItemTracking(item);
  const atMs = playheadMs(state);
  const selectedTrackIds = state.presentation?.tracking?.selectedTrackIds || [];
  const spatialCapture = Boolean(state.presentation?.spatial?.captureLandmarkId);
  const resolved = resolveDynamicGraphics(graphics, tracks, atMs, {
    calibration: state.presentation?.spatial?.calibration || null,
  });
  return `
    <div class="video-analysis-tracking-stage${spatialCapture ? " is-spatial-capturing" : ""}" data-video-analysis-tracking-stage>
      ${tracks.map((track) => renderTrackBox(track, atMs, selectedTrackIds)).join("")}
      ${resolved.map(renderResolvedGraphic).join("")}
      ${renderPrompt(state.presentation?.tracking?.prompt)}
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
  return `
    <li class="${selected ? "is-selected" : ""}">
      <button type="button" data-video-analysis-track-select="${escapeHtml(track.id)}">
        <strong>${escapeHtml(track.playerLabel || "Unassigned player")}</strong>
        <span>${escapeHtml(`${Math.round(track.confidence * 100)}% / ${Math.round(review.coverage.ratio * 100)}% coverage`)}</span>
      </button>
      <em class="is-${escapeHtml(track.status)}">${escapeHtml(track.status)}</em>
    </li>
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
  const primaryTrack = tracks.find((track) => track.id === selectedTrackIds[0]) || null;
  const review = primaryTrack ? trackingReviewSummary(primaryTrack) : null;
  const clip = item?.clip || {};
  const startSeconds = ((tracking.prompt?.startMs ?? item?.startMs ?? clip.startMs ?? clip.start_ms ?? 0) / 1000).toFixed(1);
  const endSeconds = ((tracking.prompt?.endMs ?? item?.endMs ?? clip.endMs ?? clip.end_ms ?? 0) / 1000).toFixed(1);
  return `${renderAnalysisPanelTabs(state)}
    <div class="video-analysis-tracking-side">
      <div>
        <p class="video-analysis-kicker">Object tracking</p>
        <h3>${escapeHtml(primaryTrack ? primaryTrack.playerLabel || "Review track" : "Select a player")}</h3>
      </div>
      <label>Player
        <select data-video-analysis-tracking-field="playerId">
          <option value="">Unassigned</option>
          ${(state.players || []).map((player) => `<option value="${escapeHtml(player.id)}" ${tracking.prompt?.playerId === player.id ? "selected" : ""}>${escapeHtml(`${player.number ? `${player.number} ` : ""}${player.name}`)}</option>`).join("")}
        </select>
      </label>
      <div class="video-analysis-tracking-range">
        <label>From <input type="number" min="0" step="0.1" value="${escapeHtml(startSeconds)}" data-video-analysis-tracking-field="startSeconds"></label>
        <label>To <input type="number" min="0" step="0.1" value="${escapeHtml(endSeconds)}" data-video-analysis-tracking-field="endSeconds"></label>
      </div>
      <div class="video-analysis-tracking-commands">
        <button type="button" data-video-analysis-tracking-action="select-target">Select target</button>
        <button type="button" data-video-analysis-tracking-action="run" ${tracking.prompt?.box ? "" : "disabled"}>Track locally</button>
        <button type="button" data-video-analysis-tracking-action="manual" ${tracking.prompt?.box ? "" : "disabled"}>Manual keyframe</button>
        <button type="button" data-video-analysis-tracking-action="correct" ${primaryTrack ? "" : "disabled"}>Correct here</button>
      </div>
      ${tracking.job ? `<div class="video-analysis-tracking-progress"><span style="width:${Math.round((tracking.job.progress || 0) * 100)}%"></span><small>${escapeHtml(tracking.job.stage || "Tracking")}</small></div>` : ""}
      ${tracking.error ? `<p class="video-analysis-error">${escapeHtml(tracking.error)}</p>` : ""}
      <ol class="video-analysis-tracking-list">
        ${tracks.length ? tracks.map((track) => renderTrackRow(track, selectedTrackIds)).join("") : `<li class="video-analysis-muted">No tracked objects in this clip.</li>`}
      </ol>
      ${review ? `
        <div class="video-analysis-tracking-review">
          <strong>${review.canVerify ? "Ready to verify" : "Review required"}</strong>
          <span>${escapeHtml(review.issues.join(" / ") || "Continuity and identity checks passed.")}</span>
          <button type="button" data-video-analysis-tracking-action="verify" ${review.canVerify ? "" : "disabled"}>Verify track</button>
        </div>
      ` : ""}
      <div class="video-analysis-tracking-graphics">
        <strong>${escapeHtml(`${graphics.length} dynamic graphics`)}</strong>
        <button type="button" data-video-analysis-tracking-action="add-graphic" ${selectedTrackIds.length ? "" : "disabled"}>Add ${escapeHtml(tracking.tool || "highlight")}</button>
      </div>
    </div>
  `;
}
