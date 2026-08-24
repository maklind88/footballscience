import { calibrationReadiness } from "../domain/pitchCalibration.model.js";
import { pitchLandmarks } from "../services/pitchCalibrationSolveService.js";
import { pitchOverlayGeometry } from "../services/pitchOverlayGeometryService.js";
import {
  buildDistanceSeries,
  pitchDistance,
  projectTrackToPitch,
  unitMetricsAt,
} from "../services/spatialAnalysisService.js";
import { escapeHtml } from "./renderHelpers.js";

function currentMs(state = {}) {
  return Math.max(0, Math.round(Number(state.timeline?.playheadMs) || 0));
}

function currentPoints(spatial = {}) {
  return spatial.draftPoints || spatial.calibration?.frames?.[0]?.controlPoints || [];
}

function percent(value) {
  return Math.max(0, Math.min(100, Number(value || 0) * 100));
}

function itemRange(item = {}) {
  const clip = item.clip || {};
  const startMs = Math.max(0, Number(item.startMs ?? clip.startMs ?? clip.start_ms) || 0);
  const endMs = Math.max(startMs + 1, Number(item.endMs ?? clip.endMs ?? clip.end_ms) || startMs + 5000);
  return { startMs, endMs };
}

function trackLabel(track = {}) {
  return track.playerLabel || track.shirtNumber || "Unassigned player";
}

function metric(value, suffix = " m") {
  return Number.isFinite(value) ? `${Number(value).toFixed(1)}${suffix}` : "--";
}

function renderSeries(values = []) {
  const available = values.filter((entry) => Number.isFinite(entry.distanceM));
  if (available.length < 2) return `<p class="video-analysis-muted">Track continuity is needed for a distance curve.</p>`;
  const minimum = Math.min(...available.map((entry) => entry.distanceM));
  const maximum = Math.max(...available.map((entry) => entry.distanceM));
  const span = Math.max(1, maximum - minimum);
  const points = available.map((entry, index) => {
    const x = (index / Math.max(1, available.length - 1)) * 300;
    const y = 62 - (((entry.distanceM - minimum) / span) * 50);
    return `${Math.round(x)},${Math.round(y)}`;
  }).join(" ");
  return `
    <div class="video-analysis-spatial-chart">
      <svg viewBox="0 0 300 70" preserveAspectRatio="none" aria-label="Distance over time">
        <line x1="0" y1="62" x2="300" y2="62"></line>
        <polyline points="${escapeHtml(points)}"></polyline>
      </svg>
      <span>${metric(minimum)}</span><span>${metric(maximum)}</span>
    </div>
  `;
}

function selectedTracks(state = {}, tracks = []) {
  const selected = state.presentation?.tracking?.selectedTrackIds || [];
  return selected.map((id) => tracks.find((track) => track.id === id)).filter(Boolean);
}

function spatialMetrics(state = {}, item = {}) {
  const spatial = state.presentation?.spatial || {};
  const calibration = spatial.calibration || {};
  const tracks = item.objectTracks || [];
  const atMs = currentMs(state);
  const pair = selectedTracks(state, tracks);
  const options = { maxInterpolationGapMs: Math.max(1200, itemRange(item).endMs - itemRange(item).startMs) };
  const pairPoints = pair.slice(0, 2).map((track) => projectTrackToPitch(track, calibration, atMs, options));
  const distanceM = pairPoints.length === 2 && pairPoints.every(Boolean) ? pitchDistance(pairPoints[0], pairPoints[1]) : null;
  const unitA = unitMetricsAt(tracks.filter((track) => (spatial.unitAIds || []).includes(track.id)), calibration, atMs, options);
  const unitB = unitMetricsAt(tracks.filter((track) => (spatial.unitBIds || []).includes(track.id)), calibration, atMs, options);
  const unitGapM = unitA.centroid && unitB.centroid ? pitchDistance(unitA.centroid, unitB.centroid) : null;
  const range = itemRange(item);
  const series = pair.length >= 2 ? buildDistanceSeries(pair[0], pair[1], calibration, {
    ...range,
    stepMs: Math.max(100, Math.round((range.endMs - range.startMs) / 40)),
    ...options,
  }) : [];
  return { distanceM, pair, series, tracks, unitA, unitB, unitGapM };
}

export function renderAnalysisPanelTabs(state = {}) {
  const panel = state.presentation?.spatial?.panel || "tracking";
  return `
    <div class="video-analysis-analysis-tabs" role="tablist" aria-label="Tracking analysis view">
      <button type="button" role="tab" aria-selected="${panel === "tracking"}" class="${panel === "tracking" ? "is-active" : ""}" data-video-analysis-spatial-panel="tracking">Tracking</button>
      <button type="button" role="tab" aria-selected="${panel === "spatial"}" class="${panel === "spatial" ? "is-active" : ""}" data-video-analysis-spatial-panel="spatial">Spatial</button>
    </div>
  `;
}

export function renderSpatialStage(state = {}) {
  const spatial = state.presentation?.spatial || {};
  if (spatial.panel !== "spatial") return "";
  const points = currentPoints(spatial);
  const geometry = pitchOverlayGeometry(spatial.calibration || {}, currentMs(state));
  const lines = geometry.lines.map((line) => line.map((point) => `${Math.round(point.x * 1000)},${Math.round(point.y * 1000)}`).join(" "));
  return `
    <div class="video-analysis-spatial-stage${calibrationReadiness(spatial.calibration).ready ? " is-ready" : " is-draft"}${spatial.captureLandmarkId ? " is-capturing" : ""}">
      ${lines.length ? `<svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">${lines.map((line) => `<polyline points="${escapeHtml(line)}"></polyline>`).join("")}</svg>` : ""}
      ${points.map((point, index) => `<span class="video-analysis-calibration-point" style="left:${percent(point.imageX)}%;top:${percent(point.imageY)}%" title="${escapeHtml(point.label)}">${index + 1}</span>`).join("")}
      ${spatial.captureLandmarkId ? `<span class="video-analysis-calibration-capture">Click the selected landmark on the pitch</span>` : ""}
    </div>
  `;
}

function renderTrackAssignments(metrics = {}, spatial = {}, selectedIds = []) {
  return metrics.tracks.length ? metrics.tracks.map((track) => `
    <li>
      <button type="button" class="video-analysis-spatial-track${selectedIds.includes(track.id) ? " is-selected" : ""}" data-video-analysis-track-select="${escapeHtml(track.id)}">${escapeHtml(trackLabel(track))}</button>
      <button type="button" class="${(spatial.unitAIds || []).includes(track.id) ? "is-active" : ""}" title="Toggle Unit A" data-video-analysis-spatial-action="assign-unit" data-video-analysis-spatial-track="${escapeHtml(track.id)}" data-video-analysis-spatial-group="a">A</button>
      <button type="button" class="${(spatial.unitBIds || []).includes(track.id) ? "is-active" : ""}" title="Toggle Unit B" data-video-analysis-spatial-action="assign-unit" data-video-analysis-spatial-track="${escapeHtml(track.id)}" data-video-analysis-spatial-group="b">B</button>
    </li>
  `).join("") : `<li class="video-analysis-muted">Create player tracks before spatial analysis.</li>`;
}

export function renderSpatialSidebar(state = {}, item = {}) {
  const spatial = state.presentation?.spatial || {};
  const points = currentPoints(spatial);
  const readiness = calibrationReadiness(spatial.calibration);
  const frame = spatial.calibration?.frames?.[0] || {};
  const metrics = spatialMetrics(state, item || {});
  const selectedIds = state.presentation?.tracking?.selectedTrackIds || [];
  return `
    <div class="video-analysis-spatial-side">
      <div class="video-analysis-spatial-heading">
        <div><p class="video-analysis-kicker">Pitch calibration</p><h3>${readiness.ready ? "Metres ready" : "Set pitch plane"}</h3></div>
        <span class="is-${escapeHtml(spatial.calibration?.status || "draft")}">${escapeHtml(spatial.calibration?.status || "draft")}</span>
      </div>
      <div class="video-analysis-spatial-dimensions">
        <label>Length <input type="number" min="90" max="120" step="0.1" value="${escapeHtml(spatial.pitchLengthM || spatial.calibration?.pitchLengthM || 105)}" data-video-analysis-spatial-field="pitchLengthM"></label>
        <label>Width <input type="number" min="45" max="90" step="0.1" value="${escapeHtml(spatial.pitchWidthM || spatial.calibration?.pitchWidthM || 68)}" data-video-analysis-spatial-field="pitchWidthM"></label>
      </div>
      <label>Pitch landmark
        <select data-video-analysis-spatial-field="landmark">
          ${pitchLandmarks.map((landmark) => `<option value="${escapeHtml(landmark.id)}" ${spatial.selectedLandmarkId === landmark.id ? "selected" : ""}>${escapeHtml(landmark.label)}</option>`).join("")}
        </select>
      </label>
      <button type="button" class="video-analysis-spatial-primary" data-video-analysis-spatial-action="place">Place landmark</button>
      <div class="video-analysis-spatial-quality">
        <strong>${points.length} control points</strong>
        <span>${Math.round(Number(spatial.calibration?.confidence || 0) * 100)}% confidence</span>
        <span>${Number.isFinite(Number(frame.rmsErrorM)) ? `${Number(frame.rmsErrorM).toFixed(2)} m RMS` : "No error estimate"}</span>
      </div>
      <ol class="video-analysis-calibration-points">
        ${points.length ? points.map((point, index) => `<li><span><b>${index + 1}</b>${escapeHtml(point.label)}</span><button type="button" title="Remove landmark" aria-label="Remove ${escapeHtml(point.label)}" data-video-analysis-spatial-action="remove-point" data-video-analysis-spatial-point="${escapeHtml(point.id)}">&times;</button></li>`).join("") : `<li class="video-analysis-muted">Use at least four well-spread visible landmarks.</li>`}
      </ol>
      ${spatial.error ? `<p class="video-analysis-error">${escapeHtml(spatial.error)}</p>` : ""}
      <div class="video-analysis-spatial-actions">
        <button type="button" data-video-analysis-spatial-action="reset">Reset</button>
        <button type="button" data-video-analysis-spatial-action="save" ${frame.imageToPitchMatrix && !spatial.saving ? "" : "disabled"}>Save</button>
        <button type="button" data-video-analysis-spatial-action="verify" ${readiness.ready && !spatial.saving ? "" : "disabled"}>Verify metres</button>
      </div>
      <div class="video-analysis-spatial-measures">
        <div><p class="video-analysis-kicker">Spatial measures</p><h3>${readiness.ready ? metric(metrics.distanceM) : "Calibration required"}</h3></div>
        <p>Select up to two players for pair distance. Assign players to Unit A or B for team-part metrics.</p>
        <ol class="video-analysis-spatial-tracks">${renderTrackAssignments(metrics, spatial, selectedIds)}</ol>
        <div class="video-analysis-spatial-metric-grid">
          <span><small>Pair</small><strong>${readiness.ready ? metric(metrics.distanceM) : "--"}</strong></span>
          <span><small>Unit A L × W</small><strong>${readiness.ready && metrics.unitA.available ? `${metric(metrics.unitA.lengthM, "")} × ${metric(metrics.unitA.widthM)}` : "--"}</strong></span>
          <span><small>Unit B L × W</small><strong>${readiness.ready && metrics.unitB.available ? `${metric(metrics.unitB.lengthM, "")} × ${metric(metrics.unitB.widthM)}` : "--"}</strong></span>
          <span><small>Unit gap</small><strong>${readiness.ready ? metric(metrics.unitGapM) : "--"}</strong></span>
        </div>
        ${readiness.ready ? renderSeries(metrics.series) : ""}
        <div class="video-analysis-spatial-layer-actions">
          <button type="button" data-video-analysis-spatial-action="add-distance" ${readiness.ready && metrics.pair.length >= 2 ? "" : "disabled"}>Add distance</button>
          <button type="button" data-video-analysis-spatial-action="add-path" ${metrics.pair.length ? "" : "disabled"}>Add movement path</button>
          <button type="button" data-video-analysis-spatial-action="add-unit" data-video-analysis-spatial-group="a" ${readiness.ready && (spatial.unitAIds || []).length >= 3 ? "" : "disabled"}>Add Unit A shape</button>
          <button type="button" data-video-analysis-spatial-action="add-unit" data-video-analysis-spatial-group="b" ${readiness.ready && (spatial.unitBIds || []).length >= 3 ? "" : "disabled"}>Add Unit B shape</button>
        </div>
      </div>
    </div>
  `;
}
