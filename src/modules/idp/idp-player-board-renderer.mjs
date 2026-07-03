import {
  filterIdpBoardTemplates,
  idpBoardTemplateById,
  idpBoardTemplateDraft,
  idpBoardTemplateIdFromInterventionId,
} from "./idp-player-board-template-library.mjs";
import {
  normalizeTacticalBoardPitchMode,
  renderTacticalBoardArrowMarkerDef,
  renderTacticalBoardPitchSvgLines,
  tacticalBoardDefaultCurveControlPoint,
  tacticalBoardPitchMeasurementLabel,
  tacticalBoardPitchModeLabel,
} from "../tactical-board/index.mjs";

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeText(value = "", fallback = "") {
  return String(value || fallback).trim();
}

function clampPercent(value, fallback = 50) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number * 10) / 10)) : fallback;
}

function normalizeBoardColor(value = "", fallback = "#38bdf8") {
  const text = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
}

function normalizeBoardLineStyle(value = "", fallback = "solid") {
  return ["solid", "dashed", "dotted"].includes(value) ? value : fallback;
}

function normalizeBoardLineWidth(value, fallback = 2.4) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(6, Math.max(0.75, Math.round(number * 4) / 4)) : fallback;
}

function renderBoardLineWidth(value, fallback = 2.4) {
  const logicalWidth = normalizeBoardLineWidth(value, fallback);
  return Math.min(3.15, Math.max(0.16, Math.round(logicalWidth * 0.52 * 100) / 100));
}

function boardLineDasharray(lineStyle = "solid") {
  if (lineStyle === "dashed") return "7 4";
  if (lineStyle === "dotted") return "1 4";
  return "";
}

function boardArrowType(value = "arrow") {
  return ["arrow", "pass", "run", "line", "curve"].includes(value) ? value : "arrow";
}

function boardToolLabel(tool = "player") {
  return {
    player: "Move Player",
    reference: "Reference",
    cone: "Cone",
    zone: "Zone",
    arrow: "Arrow",
    pass: "Pass",
    run: "Run",
    line: "Line",
    curve: "Curve",
    note: "Note",
  }[tool] || "Tool";
}

function boardToolIcon(tool = "player") {
  return {
    player: "P",
    reference: "R",
    cone: "C",
    zone: "Z",
    arrow: "A",
    pass: "Pa",
    run: "Ru",
    note: "N",
  }[tool] || "T";
}

function renderBoardToolSvgIcon(tool = "player") {
  const icons = {
    player: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"></circle><circle cx="12" cy="12" r="2.4"></circle></svg>',
    reference: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"></circle><path d="M8.5 15.5 15.5 8.5"></path></svg>',
    cone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5h4l2 12H8l2-12Z"></path><path d="M6 19h12"></path><path d="M9 13h6"></path></svg>',
    zone: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="7" width="14" height="10" rx="2"></rect><path d="M8 10h8"></path></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18 18 5"></path><path d="M12 5h6v6"></path></svg>',
    pass: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13"></path><path d="m14 8 4 4-4 4"></path><circle cx="5" cy="12" r="1.5"></circle></svg>',
    run: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18c3-8 8-11 14-12"></path><path d="M14 5h5v5"></path><path d="M8 15l2 2"></path></svg>',
    line: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5"></path></svg>',
    curve: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17c5-12 10 2 14-10"></path></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4l-4 3v-3H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"></path></svg>',
  };
  return icons[tool] || '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"></circle></svg>';
}

function initialsFromName(value = "Player", fallback = "P") {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words.at(-1)[0]}` : words[0]?.slice(0, 2) || fallback).toUpperCase();
}

function boardState(intervention = {}, focus = {}, profile = {}) {
  const source = intervention?.boardState || {};
  if (source.schema) return source;
  const isGoalkeeper = profile.position === "Goalkeeper" || profile.role === "GK";
  return {
    schema: "idp-player-board-v1",
    player: { x: 50, y: isGoalkeeper ? 82 : 68 },
    referencePlayers: [{ id: "reference-1", label: "REF", x: 50, y: isGoalkeeper ? 48 : 45 }],
    cones: [{ id: "cone-1", x: 40, y: 58 }, { id: "cone-2", x: 60, y: 58 }, { id: "cone-3", x: 50, y: 38 }],
    zones: [{ id: "zone-1", label: focus.category || "Development zone", x: 34, y: 28, width: 32, height: 28 }],
    arrows: [{
      id: "arrow-1",
      type: "run",
      label: "Action path",
      color: "#38bdf8",
      lineStyle: "dashed",
      lineWidth: 2.5,
      from: { x: 50, y: isGoalkeeper ? 82 : 70 },
      to: { x: 62, y: 42 },
    }],
    notes: [],
    frames: [{ id: "frame-1", label: "Start" }],
    linkedClipIds: [],
  };
}

function normalizeFrameIndex(value, total = 1) {
  const count = Math.max(1, Number(total) || 1);
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < count ? index : 0;
}

function boardFrameArray(sourceItems = [], fallbackItems = [], limit = 8) {
  const source = Array.isArray(sourceItems) && sourceItems.length ? sourceItems : fallbackItems;
  return Array.isArray(source) ? source.slice(0, limit).map((item) => ({ ...item })) : [];
}

function boardFrameFromState(state = {}, frame = {}, index = 0) {
  return {
    id: normalizeText(frame.id, `frame-${index + 1}`) || `frame-${index + 1}`,
    label: normalizeText(frame.label, index === 0 ? "Start" : `Frame ${index + 1}`) || `Frame ${index + 1}`,
    coachCue: normalizeText(frame.coachCue || frame.coach_cue, state.coachCue || state.coach_cue || ""),
    playerCue: normalizeText(frame.playerCue || frame.player_cue, state.playerCue || state.player_cue || ""),
    clipAnchor: normalizeText(frame.clipAnchor || frame.clip_anchor, state.clipAnchor || state.clip_anchor || ""),
    player: {
      x: clampPercent(frame.player?.x, clampPercent(state.player?.x, 50)),
      y: clampPercent(frame.player?.y, clampPercent(state.player?.y, 70)),
    },
    referencePlayers: boardFrameArray(frame.referencePlayers, state.referencePlayers, 6),
    cones: boardFrameArray(frame.cones, state.cones, 12),
    zones: boardFrameArray(frame.zones, state.zones, 6),
    arrows: boardFrameArray(frame.arrows, state.arrows, 8),
    notes: boardFrameArray(frame.notes, state.notes, 6),
  };
}

function boardFramesFromState(state = {}) {
  const sourceFrames = Array.isArray(state.frames) && state.frames.length ? state.frames.slice(0, 8) : [{ id: "frame-1", label: "Start" }];
  return sourceFrames.map((frame, index) => boardFrameFromState(state, frame, index));
}

function boardStateForFrame(state = {}, frameIndex = 0) {
  const frames = boardFramesFromState(state);
  const safeIndex = normalizeFrameIndex(frameIndex ?? state.activeFrameIndex, frames.length);
  const frame = frames[safeIndex] || frames[0] || boardFrameFromState(state);
  return {
    ...state,
    activeFrameIndex: safeIndex,
    frames,
    player: frame.player,
    referencePlayers: frame.referencePlayers,
    cones: frame.cones,
    zones: frame.zones,
    arrows: frame.arrows,
    notes: frame.notes,
    coachCue: frame.coachCue,
    playerCue: frame.playerCue,
    clipAnchor: frame.clipAnchor,
  };
}

function activeIntervention(detail = {}, ui = {}) {
  const interventions = Array.isArray(detail.interventions) ? detail.interventions.filter((item) => item.status !== "archived") : [];
  const selected = interventions.find((item) => item.id && item.id === ui.playerBoardInterventionId);
  return selected || interventions[0] || null;
}

function draftIntervention(profile = {}, focus = {}) {
  return {
    id: "",
    title: focus?.title ? `${focus.title} intervention` : "New individual exercise",
    objective: focus?.description || "",
    pitchMode: profile.position === "Goalkeeper" || profile.role === "GK" ? "goalkeeper" : "attacking-half",
    boardState: boardState({}, focus, profile),
    status: "active",
    rowVersion: 1,
  };
}

function normalizePitchMode(mode = "attacking-half") {
  return normalizeTacticalBoardPitchMode(mode, "attacking-half");
}

function pitchModeLabel(mode = "half") {
  return tacticalBoardPitchModeLabel(mode, "attacking-half");
}

function pitchMeasurementLabel(mode = "attacking-half") {
  return tacticalBoardPitchMeasurementLabel(mode);
}

function renderSessionPitchDiagram(mode = "attacking-half") {
  return renderTacticalBoardPitchSvgLines(mode, {
    ariaLabel: "IDP tactical pitch lines",
    className: "idp-tactical-pitch-lines",
    escapeHtml,
  });
}

function renderSvgText(value = "", maxLength = 28) {
  const text = normalizeText(value, "").slice(0, maxLength);
  return escapeHtml(text);
}

function renderBoardZone(zone = {}, index = 0) {
  const x = clampPercent(zone.x, 34);
  const y = clampPercent(zone.y, 28);
  const width = clampPercent(zone.width, 32);
  const height = clampPercent(zone.height, 28);
  const labelX = Math.min(96, Math.max(4, x + width / 2));
  const labelY = Math.min(96, Math.max(4, y + height / 2));
  return `
    <rect
      class="idp-player-board-zone"
      data-idp-board-object="zone"
      data-idp-board-zone="${index + 1}"
      x="${x}"
      y="${y}"
      width="${width}"
      height="${height}"
      rx="1.8"
    ></rect>
    <text class="idp-player-board-zone-label" data-idp-board-zone-label="${index + 1}" x="${labelX}" y="${labelY}">${renderSvgText(zone.label || "Zone", 24)}</text>
  `;
}

function renderBoardCone(cone = {}, index = 0) {
  const x = clampPercent(cone.x, 50);
  const y = clampPercent(cone.y, 50);
  return `
    <g class="idp-player-board-cone" data-idp-board-object="cone" data-idp-board-cone="${index + 1}" transform="translate(${x} ${y})">
      <path d="M 0 -2.9 L 2.75 2.55 L -2.75 2.55 Z"></path>
      <line x1="-3.15" y1="2.9" x2="3.15" y2="2.9"></line>
    </g>
  `;
}

function renderBoardPlayerMarker(item = {}, options = {}) {
  const x = clampPercent(item.x, 50);
  const y = clampPercent(item.y, 50);
  const label = normalizeText(item.label, options.fallbackLabel || "P").slice(0, 3).toUpperCase();
  const name = normalizeText(item.name, "");
  const classes = [
    "idp-tactical-player-marker",
    options.neutral ? "is-neutral" : "is-player",
    options.className || "",
  ].filter(Boolean).join(" ");
  return `
    <g class="${escapeHtml(classes)}" data-idp-board-object="${escapeHtml(options.objectType || "player")}" transform="translate(${x} ${y})">
      <circle class="idp-tactical-player-halo" r="${options.neutral ? "4.4" : "5.2"}"></circle>
      <circle class="idp-tactical-player-disc" r="${options.neutral ? "3.2" : "3.75"}"></circle>
      <text class="session-tactical-player-badge idp-tactical-player-badge" y=".45">${escapeHtml(label)}</text>
      ${name ? `<text class="idp-player-board-player-name" y="${options.neutral ? "7.6" : "-6.2"}">${renderSvgText(name, 26)}</text>` : ""}
    </g>
  `;
}

function renderBoardNote(note = {}, index = 0) {
  const x = clampPercent(note.x, 12);
  const y = clampPercent(note.y, 14);
  const text = normalizeText(note.text, "Coach note");
  return `
    <g class="idp-player-board-note-pin" data-idp-board-object="note" data-idp-board-note="${index + 1}" transform="translate(${x} ${y})">
      <rect x="-8" y="-4.2" width="16" height="8.4" rx="1.8"></rect>
      <text y=".45">${renderSvgText(text, 18)}</text>
    </g>
  `;
}

function renderArrowElement(arrow = {}, markerId = "idp-player-board-arrow") {
  const type = boardArrowType(arrow.type || "arrow");
  const fromX = clampPercent(arrow.from?.x, 50);
  const fromY = clampPercent(arrow.from?.y, 70);
  const toX = clampPercent(arrow.to?.x, 62);
  const toY = clampPercent(arrow.to?.y, 42);
  const color = normalizeBoardColor(arrow.color, type === "pass" ? "#fbbf24" : "#38bdf8");
  const lineStyle = normalizeBoardLineStyle(arrow.lineStyle, type === "pass" ? "dotted" : type === "run" ? "dashed" : "solid");
  const lineWidth = renderBoardLineWidth(arrow.lineWidth, 2.4);
  const dash = boardLineDasharray(lineStyle);
  const style = `fill:none;stroke:${escapeHtml(color)};stroke-width:${lineWidth};stroke-linecap:round;stroke-linejoin:round;${dash ? `stroke-dasharray:${escapeHtml(dash)};` : ""}`;
  const handles = `
    <circle class="idp-player-board-movement-handle is-from" data-idp-board-object="movement-from" data-idp-board-movement-handle="from" cx="${fromX}" cy="${fromY}" r="1.55"></circle>
    <circle class="idp-player-board-movement-handle is-to" data-idp-board-object="movement-to" data-idp-board-movement-handle="to" cx="${toX}" cy="${toY}" r="1.75"></circle>
  `;
  if (type === "run" || type === "curve") {
    const control = tacticalBoardDefaultCurveControlPoint(
      { x: fromX, y: fromY },
      { x: toX, y: toY },
      { bend: type === "run" ? 10 : 13 }
    );
    const controlX = Math.round(control.x * 10) / 10;
    const controlY = Math.round(control.y * 10) / 10;
    return `<path class="session-tactical-${escapeHtml(type)} idp-player-board-movement" d="M ${fromX} ${fromY} Q ${controlX} ${controlY} ${toX} ${toY}" ${type === "curve" ? "" : `marker-end="url(#${escapeHtml(markerId)})"`} data-idp-board-object="movement" data-idp-board-arrow-type="${escapeHtml(type)}" style="${style}"></path>${handles}`;
  }
  const shouldUseArrow = type !== "line";
  return `<line class="session-tactical-${escapeHtml(type)} idp-player-board-movement" x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}" ${shouldUseArrow ? `marker-end="url(#${escapeHtml(markerId)})"` : ""} data-idp-board-object="movement" data-idp-board-arrow-type="${escapeHtml(type)}" style="${style}"></line>${handles}`;
}

function renderBoardPitch(intervention = {}, profile = {}, focus = {}, options = {}) {
  const state = boardStateForFrame(boardState(intervention, focus, profile), options.frameIndex);
  const player = state.player || {};
  const initials = initialsFromName(profile.playerName || profile.name || "Player", "P");
  const playerName = normalizeText(profile.playerName || profile.name || "Player", "Player");
  const markerId = options.markerId || "idp-player-board-arrow";
  const editorAttr = options.editor ? " data-idp-board-editor-pitch" : "";
  const pitchMode = normalizePitchMode(intervention.pitchMode || "attacking-half");
  return `
    <div class="session-visual-board session-visual-board-large session-visual-board-mode-${escapeHtml(pitchMode)} idp-player-board-pitch is-${escapeHtml(pitchMode)}" aria-label="IDP Playerboard tactical visual">
      <div class="session-visual-board-surface idp-player-board-surface"${editorAttr}>
        <span class="idp-player-board-mode-chip">${escapeHtml(pitchModeLabel(pitchMode))}</span>
        <svg class="session-tactical-svg-layer idp-tactical-board-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(`${playerName} tactical board`)}">
          <defs>
            ${renderTacticalBoardArrowMarkerDef(markerId, { escapeHtml })}
          </defs>
          ${renderSessionPitchDiagram(pitchMode)}
          <g class="idp-tactical-board-zone-layer" aria-label="Development zones">
            ${Array.isArray(state.zones) ? state.zones.map((zone, index) => renderBoardZone(zone, index)).join("") : ""}
          </g>
          <g class="idp-player-board-arrow-layer idp-tactical-board-movement-layer" aria-label="Movement paths">
            ${Array.isArray(state.arrows) ? state.arrows.map((arrow) => renderArrowElement(arrow, markerId)).join("") : ""}
          </g>
          <g class="idp-tactical-board-equipment-layer" aria-label="Equipment">
            ${Array.isArray(state.cones) ? state.cones.map((cone, index) => renderBoardCone(cone, index)).join("") : ""}
          </g>
          <g class="idp-tactical-board-player-layer" aria-label="Players">
            ${Array.isArray(state.referencePlayers) ? state.referencePlayers.map((item) => renderBoardPlayerMarker({
              ...item,
              name: item.name || item.label || "Reference",
            }, {
              className: "idp-player-board-reference",
              fallbackLabel: "REF",
              neutral: true,
              objectType: "reference",
            })).join("") : ""}
            ${renderBoardPlayerMarker({
              ...player,
              label: initials,
              name: playerName,
            }, {
              className: "idp-player-board-player",
              fallbackLabel: initials,
              neutral: false,
              objectType: "player",
            })}
          </g>
          <g class="idp-tactical-board-notes" aria-label="Coach notes">
            ${Array.isArray(state.notes) ? state.notes.slice(0, 3).map((note, index) => renderBoardNote(note, index)).join("") : ""}
          </g>
        </svg>
      </div>
    </div>
  `;
}

function interventionCounts(intervention = {}) {
  const state = boardState(intervention);
  return {
    frames: Array.isArray(state.frames) ? state.frames.length : 0,
    clips: Array.isArray(state.linkedClipIds) ? state.linkedClipIds.length : 0,
    notes: Array.isArray(state.notes) ? state.notes.length : 0,
  };
}

function interventionStatusLabel(status = "active") {
  const normalized = normalizeText(status, "active").toLowerCase();
  return {
    active: "Active",
    draft: "Draft",
    review: "Review",
    completed: "Complete",
  }[normalized] || normalizeText(status, "Active");
}

function interventionObjective(intervention = {}, focus = {}) {
  return normalizeText(
    intervention.objective,
    focus?.description || "Individual intervention for the current IDP focus."
  );
}

function clipBankItemId(clip = {}) {
  const item = clip || {};
  return normalizeText(item.id || item.clipInstanceId, "");
}

function clipBankItemLabel(clip = {}) {
  const item = clip || {};
  return normalizeText(
    item.subPhase || item.phase || item.matchTitle || item.videoTitle || clipBankItemId(item),
    "Open clip"
  );
}

function clipTimeValue(value = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function formatBoardClipTime(ms = 0) {
  const totalSeconds = Math.max(0, Math.floor(clipTimeValue(ms) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function clipSourceTitle(clip = {}) {
  return normalizeText(
    clip.matchTitle || clip.videoTitle || (normalizeText(clip.eventType).toLowerCase() === "match" ? "Match video" : "Training video"),
    "Training video"
  );
}

function clipTacticalTitle(clip = {}) {
  return [clip.subPhase, clip.phase].map((item) => normalizeText(item)).filter(Boolean).join(" / ")
    || clipBankItemLabel(clip);
}

function clipDateLabel(clip = {}) {
  const date = normalizeText(clip.matchDate || clip.createdAt).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "No date";
}

function clipPickerSearchBlob(clip = {}) {
  return [
    clipTacticalTitle(clip),
    clipSourceTitle(clip),
    clipDateLabel(clip),
    formatBoardClipTime(clip.startMs),
    clip.outcome,
    clip.status,
  ].map((item) => normalizeText(item).toLowerCase()).join(" ");
}

function clipPickerAnchor(clip = {}) {
  const id = clipBankItemId(clip);
  if (!id) return "";
  const time = clipTimeValue(clip.startMs) > 0 ? ` @ ${formatBoardClipTime(clip.startMs)}` : "";
  return `${id}${time}`;
}

function sortedBoardClipBank(detail = {}) {
  const clips = Array.isArray(detail.clipBank) ? detail.clipBank.filter((clip) => clipBankItemId(clip)) : [];
  return [...clips].sort((first, second) => {
    const firstStamp = normalizeText(first.matchDate || first.createdAt);
    const secondStamp = normalizeText(second.matchDate || second.createdAt);
    if (firstStamp !== secondStamp) return secondStamp.localeCompare(firstStamp);
    return clipTimeValue(first.startMs) - clipTimeValue(second.startMs);
  });
}

function clipAnchorIds(anchor = "") {
  const text = normalizeText(anchor, "");
  const beforeTime = text.split("@")[0]?.trim() || "";
  return new Set([
    beforeTime,
    ...text.split(/[\s,;|]+/),
  ].map((item) => item.trim()).filter(Boolean));
}

function frameClipTarget(frame = {}, state = {}, detail = {}) {
  const clips = Array.isArray(detail.clipBank) ? detail.clipBank : [];
  if (!clips.length) return null;
  const anchorIds = clipAnchorIds(frame.clipAnchor || state.clipAnchor || "");
  const linkedIds = Array.isArray(state.linkedClipIds) ? state.linkedClipIds.map((id) => normalizeText(id, "")).filter(Boolean) : [];
  const candidateIds = new Set([...anchorIds, ...linkedIds]);
  const exactMatch = clips.find((clip) => candidateIds.has(clipBankItemId(clip)));
  if (exactMatch) return exactMatch;
  if (anchorIds.size) {
    return clips.find((clip) => [...anchorIds].some((id) => id && clipBankItemId(clip).includes(id))) || null;
  }
  return linkedIds.length ? clips.find((clip) => linkedIds.includes(clipBankItemId(clip))) || null : null;
}

function exerciseBankSearchText(item = {}, focus = {}) {
  return [
    item.title,
    item.objective,
    item.pitchMode,
    item.status,
    focus?.title,
    focus?.category,
  ].map((value) => normalizeText(value, "").toLowerCase()).join(" ");
}

function renderBoardClipPicker(detail = {}, state = {}, frame = {}) {
  const clips = sortedBoardClipBank(detail).slice(0, 10);
  const selectedClipId = clipBankItemId(frameClipTarget(frame, state, detail));
  const currentAnchor = normalizeText(frame.clipAnchor || state.clipAnchor, "");
  if (!clips.length) {
    return `
      <section class="idp-player-board-clip-picker is-empty" data-idp-board-clip-picker>
        <div class="idp-player-board-clip-picker-head">
          <span>Clip Picker</span>
          <small>No clips yet</small>
        </div>
        <p class="idp-player-board-clip-picker-empty">Clip Bank is empty for this player.</p>
      </section>
    `;
  }
  return `
    <section class="idp-player-board-clip-picker" data-idp-board-clip-picker>
      <div class="idp-player-board-clip-picker-head">
        <span>Clip Picker</span>
        <small data-idp-board-clip-picker-count>${escapeHtml(`${clips.length} clips`)}</small>
      </div>
      <label class="idp-player-board-clip-picker-search">
        <span>Search Clip Bank</span>
        <input type="search" data-idp-board-clip-picker-search placeholder="Search moment, source or time" autocomplete="off">
      </label>
      <div class="idp-player-board-clip-picker-list" data-idp-board-clip-picker-results>
        ${clips.map((clip) => {
          const id = clipBankItemId(clip);
          const anchor = clipPickerAnchor(clip);
          const title = clipTacticalTitle(clip);
          const source = clipSourceTitle(clip);
          const time = formatBoardClipTime(clip.startMs);
          return `
            <button
              type="button"
              class="idp-player-board-clip-option${id === selectedClipId ? " is-selected" : ""}"
              data-idp-board-clip-pick="${escapeHtml(id)}"
              data-idp-board-clip-anchor="${escapeHtml(anchor)}"
              data-idp-board-clip-search="${escapeHtml(clipPickerSearchBlob(clip))}"
              title="${escapeHtml(`${title} / ${source}`)}"
            >
              <strong>${escapeHtml(title)}</strong>
              <span>${escapeHtml(source)}</span>
              <small>${escapeHtml(`${clipDateLabel(clip)} · ${time}`)}</small>
            </button>
          `;
        }).join("")}
      </div>
      <p class="idp-player-board-clip-picker-empty" data-idp-board-clip-picker-empty hidden>No matching clips.</p>
      <div class="idp-player-board-clip-picker-status">
        <span data-idp-board-clip-picker-status>${escapeHtml(currentAnchor ? `Linked: ${currentAnchor}` : "No frame clip selected")}</span>
        <button type="button" data-idp-board-clip-clear ${currentAnchor ? "" : "hidden"}>Clear</button>
      </div>
    </section>
  `;
}

function templateMetaLabel(template = {}) {
  return [template.phase, template.subPhase].map((item) => normalizeText(item)).filter(Boolean).join(" / ")
    || "Exercise template";
}

function renderTemplateBankCard(template = {}, index = 0, selectedId = "") {
  const templateId = normalizeText(template.id, "");
  const isSelected = templateId && templateId === selectedId;
  return `
    <article class="idp-player-board-template-card${isSelected ? " is-active" : ""}">
      <button
        type="button"
        data-idp-player-board-template-preview="${escapeHtml(templateId)}"
        aria-pressed="${isSelected ? "true" : "false"}"
      >
        <span>${escapeHtml(String(index + 1).padStart(2, "0"))}</span>
        <strong>${escapeHtml(template.title || "Exercise template")}</strong>
        <small>${escapeHtml(templateMetaLabel(template))}</small>
      </button>
      <button type="button" class="is-use" data-idp-player-board-template-use="${escapeHtml(templateId)}">
        Use for player
      </button>
    </article>
  `;
}

export function renderIdpPlayerBoardTemplateBank(detail = {}, focus = {}, profile = {}, ui = {}, canEdit = false, options = {}) {
  if (!canEdit) return "";
  const sourceLibrary = Array.isArray(options.exerciseLibraryTemplates) ? options.exerciseLibraryTemplates : [];
  const query = normalizeText(ui.playerBoardTemplateSearchQuery, "");
  const templates = filterIdpBoardTemplates(query, sourceLibrary).slice(0, 5);
  const requestedTemplate = idpBoardTemplateById(ui.playerBoardTemplateId || "", sourceLibrary);
  const selectedTemplate = requestedTemplate && (!query || templates.some((template) => template.id === requestedTemplate.id))
    ? requestedTemplate
    : templates[0] || null;
  const selectedId = normalizeText(selectedTemplate?.id, "");
  const selectedDraft = selectedTemplate ? idpBoardTemplateDraft(selectedId, profile, focus, sourceLibrary) : null;
  const sourceLabel = selectedTemplate?.sourceType === "saved-exercise-library" ? "Saved team library" : "Default templates";
  return `
    <section class="idp-player-board-template-bank" aria-label="Player Board template bank">
      <div class="idp-player-board-template-head">
        <div>
          <span>Template Bank</span>
          <strong>Team exercise templates</strong>
          <small>${escapeHtml(sourceLabel)}. Search, preview and use a template as a player-specific IDP draft.</small>
        </div>
        <label>
          <span>Search templates</span>
          <input type="search" data-idp-player-board-template-search value="${escapeHtml(query)}" placeholder="Search exercise, phase or coaching point" autocomplete="off">
        </label>
      </div>
      <div class="idp-player-board-template-layout">
        <div class="idp-player-board-template-results" aria-label="Template search results">
          ${templates.length
            ? templates.map((template, index) => renderTemplateBankCard(template, index, selectedId)).join("")
            : `
              <div class="idp-player-board-template-empty">
                <strong>No template found</strong>
                <small>Try another exercise, phase or coaching point.</small>
              </div>
            `}
        </div>
        <article class="idp-player-board-template-preview" aria-label="Template preview">
          ${selectedTemplate && selectedDraft ? `
            <div class="idp-player-board-template-preview-copy">
              <span>Visual Preview</span>
              <strong>${escapeHtml(selectedTemplate.title || "Exercise template")}</strong>
              <small>${escapeHtml(templateMetaLabel(selectedTemplate))}</small>
              <p>${escapeHtml(selectedTemplate.objective || selectedTemplate.focus || "Use this template as a starting point for the player's IDP board.")}</p>
            </div>
            <div class="idp-player-board-template-preview-pitch">
              ${renderBoardPitch(selectedDraft, profile, focus, { markerId: "idp-player-board-template-arrow", frameIndex: 0 })}
            </div>
            <button type="button" data-idp-player-board-template-use="${escapeHtml(selectedId)}">
              Use for player
            </button>
          ` : `
            <div class="idp-player-board-template-empty">
              <strong>No visual preview</strong>
              <small>Select a template to preview it here.</small>
            </div>
          `}
        </article>
      </div>
    </section>
  `;
}

export function renderIdpPlayerBoardPanel(detail = {}, focus = {}, profile = {}, pulse = {}, nextAction = {}, canEdit = false, ui = {}) {
  const intervention = activeIntervention(detail, ui) || draftIntervention(profile, focus);
  const rawState = boardState(intervention, focus, profile);
  const frames = boardFramesFromState(rawState);
  const frameIndex = normalizeFrameIndex(ui.playerBoardPreviewFrameIndex ?? rawState.activeFrameIndex, frames.length);
  const state = boardStateForFrame(rawState, frameIndex);
  const frame = state.frames?.[frameIndex] || state.frames?.[0] || {};
  const counts = interventionCounts(intervention);
  const frameCount = Math.max(1, frames.length || 1);
  const isPlaying = Boolean(ui.playerBoardPreviewPlaying) && frameCount > 1;
  const playerName = normalizeText(profile.playerName || profile.name, "Player");
  const objective = interventionObjective(intervention, focus);
  const clipAnchor = normalizeText(frame.clipAnchor || state.clipAnchor, "");
  const clipTarget = frameClipTarget(frame, state, detail);
  const clipTargetId = clipBankItemId(clipTarget);
  const coachCue = normalizeText(frame.coachCue || state.coachCue, "Coach cue has not been added yet.");
  const playerCue = normalizeText(frame.playerCue || state.playerCue, objective);
  return `
    <aside class="idp-player-board-panel idp-player-board-tactical-shell idp-player-board-playback-shell" data-idp-player-board-preview data-idp-player-board-frame-count="${escapeHtml(String(frameCount))}">
      <header class="idp-player-board-playback-head">
        <div>
          <span>Coach Playback</span>
          <strong>${escapeHtml(intervention.title || `${playerName} individual exercise`)}</strong>
          <small>${escapeHtml(objective)}</small>
        </div>
        <div class="idp-player-board-playback-controls" aria-label="Exercise playback controls">
          <span>${escapeHtml(`${frameIndex + 1} / ${frameCount}`)}</span>
          <button type="button" data-idp-player-board-preview-play${frameCount <= 1 || isPlaying ? " hidden" : ""}>Play</button>
          <button type="button" data-idp-player-board-preview-stop${isPlaying ? "" : " hidden"}>Stop</button>
          ${canEdit ? `<button type="button" class="is-primary" data-idp-player-board-open>Redigera</button>` : ""}
        </div>
      </header>
      <div class="idp-player-board-playback-stage">
        <div class="idp-player-board-preview idp-player-board-tactical-preview" aria-label="IDP Player Board preview">
          <span class="idp-player-board-surface">
            <span class="idp-player-board-canvas">
              ${renderBoardPitch(intervention, profile, focus, { markerId: "idp-player-board-preview-arrow", frameIndex })}
            </span>
          </span>
        </div>
        <section class="idp-player-board-playback-card" aria-label="Frame coaching cue">
          <div class="idp-player-board-playback-card-head">
            <span>${escapeHtml(String(frameIndex + 1).padStart(2, "0"))}</span>
            <div>
              <strong>${escapeHtml(frame.label || `Frame ${frameIndex + 1}`)}</strong>
              <small>${escapeHtml(`${pitchModeLabel(intervention.pitchMode)} / ${interventionStatusLabel(intervention.status)}`)}</small>
            </div>
          </div>
          <div class="idp-player-board-playback-cues">
            <article>
              <span>Coach Cue</span>
              <p>${escapeHtml(coachCue)}</p>
            </article>
            <article>
              <span>Player Cue</span>
              <p>${escapeHtml(playerCue)}</p>
            </article>
            <article class="${clipTargetId ? "has-linked-clip" : ""}">
              <span>Clip Anchor</span>
              <p>${escapeHtml(clipAnchor || `${counts.clips || 0} clips linked`)}</p>
              ${clipTargetId ? `
                <button type="button" data-idp-player-board-preview-clip="${escapeHtml(clipTargetId)}">
                  Open ${escapeHtml(clipBankItemLabel(clipTarget))}
                </button>
              ` : ""}
            </article>
          </div>
        </section>
      </div>
      <div class="idp-player-board-playback-frames" aria-label="Exercise frames">
        ${frames.map((item, index) => {
          const label = item.label || `Frame ${index + 1}`;
          const cue = item.playerCue || item.coachCue || "";
          const hasCue = Boolean(item.playerCue || item.coachCue || item.clipAnchor);
          return `
            <button
              type="button"
              class="${index === frameIndex ? "is-active" : ""}${hasCue ? " has-cue" : ""}"
              data-idp-player-board-preview-frame="${index}"
              aria-pressed="${index === frameIndex ? "true" : "false"}"
              title="${escapeHtml(cue || label)}"
            >
              <strong>${escapeHtml(String(index + 1).padStart(2, "0"))}</strong>
              <span>${escapeHtml(label)}</span>
            </button>
          `;
        }).join("")}
      </div>
    </aside>
  `;
}

function handoutClipTargets(detail = {}, state = {}, frames = []) {
  const clipsById = new Map();
  const clips = Array.isArray(detail.clipBank) ? detail.clipBank : [];
  frames.forEach((frame, index) => {
    const frameState = boardStateForFrame(state, index);
    const clip = frameClipTarget(frame, frameState, detail);
    const id = clipBankItemId(clip);
    if (id) clipsById.set(id, clip);
  });
  const linkedIds = Array.isArray(state.linkedClipIds)
    ? state.linkedClipIds.map((id) => normalizeText(id, "")).filter(Boolean)
    : [];
  linkedIds.forEach((id) => {
    const clip = clips.find((item) => clipBankItemId(item) === id);
    if (clip) clipsById.set(id, clip);
  });
  return [...clipsById.values()];
}

function renderHandoutFrame(frame = {}, index = 0, state = {}, detail = {}) {
  const frameState = boardStateForFrame(state, index);
  const coachCue = normalizeText(frame.coachCue || frameState.coachCue, "Coach cue not set yet.");
  const playerCue = normalizeText(frame.playerCue || frameState.playerCue, "Player cue not set yet.");
  const clip = frameClipTarget(frame, frameState, detail);
  const clipId = clipBankItemId(clip);
  return `
    <article class="idp-player-board-handout-frame">
      <div class="idp-player-board-handout-frame-index">${escapeHtml(String(index + 1).padStart(2, "0"))}</div>
      <div class="idp-player-board-handout-frame-body">
        <strong>${escapeHtml(frame.label || `Frame ${index + 1}`)}</strong>
        <dl>
          <div>
            <dt>Coach</dt>
            <dd>${escapeHtml(coachCue)}</dd>
          </div>
          <div>
            <dt>Player</dt>
            <dd>${escapeHtml(playerCue)}</dd>
          </div>
          <div>
            <dt>Clip</dt>
            <dd>
              ${clipId ? `
                <button type="button" data-idp-player-board-preview-clip="${escapeHtml(clipId)}">
                  ${escapeHtml(clipTacticalTitle(clip))} / ${escapeHtml(formatBoardClipTime(clip.startMs))}
                </button>
              ` : escapeHtml(normalizeText(frame.clipAnchor || frameState.clipAnchor, "No clip linked"))}
            </dd>
          </div>
        </dl>
      </div>
    </article>
  `;
}

export function renderIdpPlayerBoardHandout(detail = {}, focus = {}, profile = {}, ui = {}, canEdit = false) {
  if (!ui.playerBoardHandoutOpen) return "";
  const intervention = activeIntervention(detail, ui) || draftIntervention(profile, focus);
  const state = boardState(intervention, focus, profile);
  const frames = boardFramesFromState(state);
  const frameIndex = normalizeFrameIndex(ui.playerBoardPreviewFrameIndex ?? state.activeFrameIndex, frames.length);
  const playerName = normalizeText(profile.playerName || profile.name, "Player");
  const objective = interventionObjective(intervention, focus);
  const clipTargets = handoutClipTargets(detail, state, frames);
  const frameLabel = frames.length === 1 ? "1 frame" : `${frames.length} frames`;
  const momentLabel = frames.length === 1 ? "1 coaching moment" : `${frames.length} coaching moments`;
  return `
    <section class="idp-player-board-handout-layer" data-idp-player-board-handout-layer>
      <article class="idp-player-board-handout" role="dialog" aria-modal="true" aria-label="Coach Handout">
        <header class="idp-player-board-handout-head">
          <div>
            <span>Coach Handout</span>
            <strong>${escapeHtml(intervention.title || `${playerName} individual exercise`)}</strong>
            <small>${escapeHtml(`${playerName} / ${pitchModeLabel(intervention.pitchMode)} / ${frameLabel}`)}</small>
          </div>
          <div class="idp-player-board-handout-actions">
            ${canEdit ? `<button type="button" data-idp-player-board-open>Edit</button>` : ""}
            <button type="button" data-idp-player-board-print>Print</button>
            <button type="button" aria-label="Close Coach Handout" data-idp-player-board-handout-close>Close</button>
          </div>
        </header>
        <div class="idp-player-board-handout-grid">
          <section class="idp-player-board-handout-stage" aria-label="Session pitch">
            <div class="idp-player-board-handout-pitch">
              ${renderBoardPitch(intervention, profile, focus, { markerId: "idp-player-board-handout-arrow", frameIndex })}
            </div>
            <div class="idp-player-board-handout-brief">
              <span>Session Purpose</span>
              <p>${escapeHtml(objective || focus?.title || "Use the frame sequence to guide the individual development action.")}</p>
            </div>
          </section>
          <aside class="idp-player-board-handout-sequence" aria-label="Session sequence">
            <div class="idp-player-board-handout-sequence-head">
              <span>Frame Sequence</span>
              <strong>${escapeHtml(momentLabel)}</strong>
            </div>
            <div class="idp-player-board-handout-frames">
              ${frames.map((frame, index) => renderHandoutFrame(frame, index, state, detail)).join("")}
            </div>
          </aside>
        </div>
        <section class="idp-player-board-handout-clips" aria-label="Linked clips">
          <div>
            <span>Linked Clips</span>
            <strong>${escapeHtml(clipTargets.length ? `${clipTargets.length} review moments` : "No clips linked")}</strong>
          </div>
          <div class="idp-player-board-handout-clip-list">
            ${clipTargets.length
              ? clipTargets.map((clip) => {
                const id = clipBankItemId(clip);
                return `
                  <button type="button" data-idp-player-board-preview-clip="${escapeHtml(id)}">
                    <strong>${escapeHtml(clipTacticalTitle(clip))}</strong>
                    <small>${escapeHtml(`${clipSourceTitle(clip)} / ${clipDateLabel(clip)} / ${formatBoardClipTime(clip.startMs)}`)}</small>
                  </button>
                `;
              }).join("")
              : `<p>No Clip Bank moments are attached to this exercise yet.</p>`}
          </div>
        </section>
      </article>
    </section>
  `;
}

function fieldValue(value, fallback = "") {
  return escapeHtml(normalizeText(value, fallback));
}

function renderPitchModeOptions(selected = "half") {
  const normalizedSelected = normalizePitchMode(selected);
  return ["full", "full-wide", "attacking-half", "defending-half", "goalkeeper"].map((mode) => `
    <option value="${escapeHtml(mode)}"${mode === normalizedSelected ? " selected" : ""}>${escapeHtml(pitchModeLabel(mode))}</option>
  `).join("");
}

function renderGoalOptions(detail = {}, selected = "") {
  const goals = Array.isArray(detail.goals) ? detail.goals.filter((goal) => goal.status !== "archived") : [];
  return [
    `<option value="">No linked goal</option>`,
    ...goals.map((goal) => `
      <option value="${escapeHtml(goal.id)}"${goal.id === selected ? " selected" : ""}>${escapeHtml(`${goal.goalRole === "leadership" ? "Leadership" : "Goal"} / ${goal.title || "Development goal"}`)}</option>
    `),
  ].join("");
}

function selectedEditorIntervention(detail = {}, focus = {}, profile = {}, ui = {}, options = {}) {
  const templateId = idpBoardTemplateIdFromInterventionId(ui.playerBoardInterventionId);
  const sourceLibrary = Array.isArray(options.exerciseLibraryTemplates) ? options.exerciseLibraryTemplates : [];
  if (templateId) return idpBoardTemplateDraft(templateId, profile, focus, sourceLibrary) || draftIntervention(profile, focus);
  const selected = activeIntervention(detail, ui);
  return ui.playerBoardInterventionId === "__new" || !selected ? draftIntervention(profile, focus) : selected;
}

function renderLineStyleOptions(selected = "solid") {
  return ["solid", "dashed", "dotted"].map((style) => `
    <option value="${escapeHtml(style)}"${normalizeBoardLineStyle(selected) === style ? " selected" : ""}>${escapeHtml(style.charAt(0).toUpperCase() + style.slice(1))}</option>
  `).join("");
}

function renderBoardColorSwatches(selected = "#38bdf8") {
  const normalized = normalizeBoardColor(selected).toLowerCase();
  const colors = [
    ["#38bdf8", "Blue"],
    ["#fbbf24", "Yellow"],
    ["#10b981", "Green"],
    ["#f97316", "Orange"],
    ["#ef4444", "Red"],
    ["#111827", "Black"],
    ["#ffffff", "White"],
  ];
  return colors.map(([color, label]) => `
    <button
      type="button"
      class="session-tactical-colour-swatch idp-player-board-color-swatch${normalized === color ? " is-active" : ""}"
      data-idp-board-color-choice="${escapeHtml(color)}"
      style="--idp-board-swatch:${escapeHtml(color)};--session-tactical-swatch:${escapeHtml(color)};"
      title="${escapeHtml(label)}"
      aria-label="${escapeHtml(label)}"
    ></button>
  `).join("");
}

function hiddenInput(name, value = "") {
  return `<input type="hidden" name="${escapeHtml(name)}" value="${fieldValue(value)}">`;
}

function renderBoardGeometryInputs({ player = {}, reference = {}, cones = [], zone = {}, arrow = {}, note = {} } = {}) {
  return `
    <div class="idp-player-board-hidden-state" aria-hidden="true">
      ${hiddenInput("playerX", player.x ?? 50)}
      ${hiddenInput("playerY", player.y ?? 70)}
      ${hiddenInput("referenceLabel", reference.label || "REF")}
      ${hiddenInput("referenceX", reference.x ?? 50)}
      ${hiddenInput("referenceY", reference.y ?? 44)}
      ${hiddenInput("cone1X", cones[0]?.x ?? 40)}
      ${hiddenInput("cone1Y", cones[0]?.y ?? 58)}
      ${hiddenInput("cone2X", cones[1]?.x ?? 60)}
      ${hiddenInput("cone2Y", cones[1]?.y ?? 58)}
      ${hiddenInput("cone3X", cones[2]?.x ?? 50)}
      ${hiddenInput("cone3Y", cones[2]?.y ?? 42)}
      ${hiddenInput("zoneLabel", zone.label || "Development zone")}
      ${hiddenInput("zoneX", zone.x ?? 34)}
      ${hiddenInput("zoneY", zone.y ?? 28)}
      ${hiddenInput("zoneWidth", zone.width ?? 32)}
      ${hiddenInput("zoneHeight", zone.height ?? 28)}
      ${hiddenInput("arrowLabel", arrow.label || "Action path")}
      ${hiddenInput("arrowFromX", arrow.from?.x ?? player.x ?? 50)}
      ${hiddenInput("arrowFromY", arrow.from?.y ?? player.y ?? 70)}
      ${hiddenInput("arrowToX", arrow.to?.x ?? 62)}
      ${hiddenInput("arrowToY", arrow.to?.y ?? 42)}
      ${hiddenInput("noteX", note.x ?? 12)}
      ${hiddenInput("noteY", note.y ?? 14)}
    </div>
  `;
}

const boardToolGroups = [
  { label: "Players", tools: [["player", "Player"], ["reference", "Reference"]] },
  { label: "Equipment", tools: [["cone", "Cone"], ["zone", "Zone"]] },
  { label: "Draw", tools: [["arrow", "Arrow"], ["pass", "Pass"], ["run", "Run"], ["line", "Line"], ["curve", "Curve"], ["note", "Text"]] },
];

const boardToolDataAttributes = {
  run: 'data-idp-board-tool="run"',
  cone: 'data-idp-board-tool="cone"',
};

function renderBoardToolButton(tool, label, activeTool = "player") {
  const dataAttribute = boardToolDataAttributes[tool] || `data-idp-board-tool="${escapeHtml(tool)}"`;
  return `
    <button
      type="button"
      class="session-tactical-tool-button idp-player-board-tool-button${activeTool === tool ? " is-active" : ""}"
      ${dataAttribute}
      title="${escapeHtml(label)}"
      aria-label="${escapeHtml(label)}"
    >
      <span class="session-tactical-tool-icon idp-player-board-tool-icon" aria-hidden="true">${renderBoardToolSvgIcon(tool)}</span>
      <span class="session-tactical-tool-label idp-player-board-tool-label">${escapeHtml(label)}</span>
    </button>
  `;
}

function renderBoardToolGroups(activeTool = "player") {
  return boardToolGroups.map((group) => `
    <div class="session-tacticalboard-tool-group idp-player-board-tool-group">
      <span>${escapeHtml(group.label)}</span>
      <div class="session-tacticalboard-tool-row idp-player-board-tool-row">
        ${group.tools.map(([tool, label]) => renderBoardToolButton(tool, label, activeTool)).join("")}
      </div>
    </div>
  `).join("");
}

function renderBoardFrameStrip(frames = [], activeFrameIndex = 0) {
  const safeFrames = Array.isArray(frames) && frames.length ? frames.slice(0, 8) : [{ id: "frame-1", label: "Start" }];
  const safeIndex = normalizeFrameIndex(activeFrameIndex, safeFrames.length);
  const frameStatusLabel = `${safeIndex + 1} / ${safeFrames.length || 1}`;
  return `
    <div class="session-tacticalboard-frames idp-player-board-editor-framebar" aria-label="IDP board frames">
      <div class="session-tacticalboard-panel-head idp-player-board-editor-panel-head">
        <span>Frames</span>
        <small data-idp-board-frame-status>${escapeHtml(frameStatusLabel)}</small>
      </div>
      <div class="session-tacticalboard-frame-list idp-player-board-frame-list">
        ${safeFrames.map((frame, index) => {
          const label = frame.label || `Frame ${index + 1}`;
          const cue = frame.playerCue || frame.coachCue || "";
          const hasCue = Boolean(frame.coachCue || frame.playerCue || frame.clipAnchor);
          return `
          <button
            type="button"
            class="session-tacticalboard-frame idp-player-board-frame${index === safeIndex ? " is-active" : ""}${hasCue ? " has-cue" : ""}"
            data-idp-board-frame-index="${index}"
            aria-pressed="${index === safeIndex ? "true" : "false"}"
            title="${escapeHtml(cue || label)}"
          >
            <strong>${index + 1}</strong>
            <span data-idp-board-frame-button-label>${escapeHtml(label)}</span>
          </button>
        `;
        }).join("")}
      </div>
      <div class="idp-player-board-history-controls" aria-label="Tactical board history">
        <button type="button" data-idp-board-undo disabled title="Undo">Undo</button>
        <button type="button" data-idp-board-redo disabled title="Redo">Redo</button>
      </div>
      <div class="idp-player-board-frame-actions" aria-label="Frame controls">
        <button type="button" data-idp-board-frame-add title="Add frame">New</button>
        <button type="button" data-idp-board-frame-duplicate title="Duplicate active frame">Duplicate</button>
        <button type="button" data-idp-board-play title="Play frames">Play</button>
        <button type="button" data-idp-board-stop hidden title="Stop playback">Stop</button>
      </div>
    </div>
  `;
}

export function renderIdpPlayerBoardOverlay(detail = {}, focus = {}, profile = {}, ui = {}, canEdit = false, options = {}) {
  if (!ui.playerBoardOpen) return "";
  const interventions = Array.isArray(detail.interventions) ? detail.interventions.filter((item) => item.status !== "archived") : [];
  const intervention = selectedEditorIntervention(detail, focus, profile, ui, options);
  const rawState = boardState(intervention, focus, profile);
  const frames = boardFramesFromState(rawState);
  const activeFrameIndex = normalizeFrameIndex(rawState.activeFrameIndex, frames.length);
  const state = boardStateForFrame(rawState, activeFrameIndex);
  const player = state.player || {};
  const reference = state.referencePlayers?.[0] || {};
  const cones = Array.isArray(state.cones) ? state.cones : [];
  const zone = state.zones?.[0] || {};
  const arrow = state.arrows?.[0] || {};
  const arrowType = boardArrowType(arrow.type || "run");
  const arrowColor = normalizeBoardColor(arrow.color, arrowType === "pass" ? "#fbbf24" : "#38bdf8");
  const arrowLineStyle = normalizeBoardLineStyle(arrow.lineStyle, arrowType === "pass" ? "dotted" : arrowType === "run" ? "dashed" : "solid");
  const arrowLineWidth = normalizeBoardLineWidth(arrow.lineWidth, 2.5);
  const note = state.notes?.[0] || {};
  const frame = state.frames?.[activeFrameIndex] || state.frames?.[0] || {};
  const frameStatusLabel = `${activeFrameIndex + 1} / ${state.frames?.length || 1}`;
  const counts = interventionCounts(intervention);
  const linkedClipIds = Array.isArray(state.linkedClipIds) ? state.linkedClipIds.join(", ") : "";
  return `
    <div class="session-library-overlay session-tacticalboard-overlay idp-player-board-layer" data-idp-player-board-layer>
      <section class="session-library-modal session-tacticalboard-modal idp-player-board-modal idp-player-board-modal-tool-player" role="dialog" aria-modal="true" aria-label="IDP Player Board editor" data-idp-board-active-tool="player">
        <header class="session-library-modal-head idp-player-board-modal-head">
          <div>
            <span>IDP Tacticalboard</span>
            <h2>IDP Playerboard</h2>
            <small>${escapeHtml(profile.playerName || "Player")} / ${escapeHtml(focus?.title || "Individual development")}</small>
            <div class="session-tacticalboard-status-strip idp-player-board-status-strip" aria-label="Board state">
              <span data-idp-board-active-tool-label>Move Player</span>
              <span>${escapeHtml(interventionStatusLabel(intervention.status))}</span>
              <span>${escapeHtml(`${Math.max(1, counts.frames)} frames`)}</span>
              <span>${escapeHtml(`${counts.clips} clips`)}</span>
              <span>${escapeHtml(pitchMeasurementLabel(intervention.pitchMode))}</span>
              <span>IDP only</span>
            </div>
          </div>
          <button type="button" class="session-library-close-button" data-idp-player-board-close aria-label="Close IDP Playerboard">Close</button>
        </header>
        <div class="session-tacticalboard-layout idp-player-board-modal-layout is-tactical-style is-idp-tacticalboard">
          <aside class="session-tacticalboard-side session-tacticalboard-toolbox idp-player-board-toolbox">
            <div class="session-tacticalboard-tools idp-player-board-editor-bank idp-player-board-tool-bank">
              <div class="session-tacticalboard-panel-head idp-player-board-editor-panel-head">
                <span>Tools</span>
                <small>IDP board</small>
              </div>
              <div class="session-tacticalboard-tools idp-player-board-tools" aria-label="IDP board tools">
                ${renderBoardToolGroups("player")}
              </div>
            </div>
            <div class="session-tacticalboard-frames idp-player-board-editor-bank idp-player-board-mini-bank">
              <div class="session-tacticalboard-panel-head idp-player-board-editor-panel-head">
                <span>Exercise Bank</span>
                <small>${escapeHtml(interventions.length || 1)} saved</small>
              </div>
              <button type="button" class="idp-player-board-bank-item${intervention.id ? "" : " is-current"}" data-idp-player-board-new>
                <span class="idp-player-board-bank-number">+</span>
                <span class="idp-player-board-bank-copy">
                  <strong>New Individual Exercise</strong>
                  <small>Single player intervention for this focus</small>
                </span>
              </button>
              ${interventions.map((item, index) => `
                <button type="button" class="idp-player-board-bank-item${item.id === intervention.id ? " is-current" : ""}" data-idp-player-board-select="${escapeHtml(item.id)}">
                  <span class="idp-player-board-bank-number">${String(index + 1).padStart(2, "0")}</span>
                  <span class="idp-player-board-bank-copy">
                    <strong>${escapeHtml(item.title || "Individual exercise")}</strong>
                    <small>${escapeHtml(interventionObjective(item, focus))}</small>
                  </span>
                </button>
              `).join("")}
            </div>
          </aside>
          <div class="session-tacticalboard-canvas-wrap idp-player-board-canvas-wrap" data-idp-player-board-canvas-wrap>
            ${renderBoardFrameStrip(state.frames, activeFrameIndex)}
            <div class="idp-player-board-editor-stage">
              ${renderBoardPitch(intervention, profile, focus, { markerId: "idp-player-board-editor-arrow", editor: true, frameIndex: activeFrameIndex })}
            </div>
            <div class="session-tacticalboard-hint idp-player-board-editor-hint">
              <strong data-idp-board-hint-tool>Move Player</strong>
              <span data-idp-board-hint-state>Click the pitch to place the selected IDP element. Save keeps it on this player's IDP only.</span>
            </div>
          </div>
          <form class="session-tacticalboard-side session-tacticalboard-inspector idp-player-board-form idp-player-board-inspector" data-idp-save-intervention>
            <input type="hidden" name="interventionId" value="${fieldValue(intervention.id)}">
            <input type="hidden" name="focusId" value="${fieldValue(focus?.id)}">
            <input type="hidden" name="rowVersion" value="${fieldValue(intervention.rowVersion || 1)}">
            <input type="hidden" name="arrowType" value="${fieldValue(arrowType)}" data-idp-board-arrow-type>
            <input type="hidden" name="activeFrameIndex" value="${fieldValue(String(activeFrameIndex))}" data-idp-board-active-frame-index>
            <input type="hidden" name="boardFramesJson" value="${fieldValue(JSON.stringify(state.frames || []))}" data-idp-board-frames>
            <input type="hidden" name="linkedClipIds" value="${fieldValue(linkedClipIds)}" data-idp-board-linked-clip-ids>
            ${renderBoardGeometryInputs({ player, reference, cones, zone, arrow, note })}
            <section class="idp-tactical-inspector-card is-selected" data-idp-board-inspector>
              <span>Selected Tool</span>
              <strong data-idp-board-active-tool-label>Move Player</strong>
              <small data-idp-board-selected-object>Player marker</small>
              <p data-idp-board-hint-state>Click the pitch to place or update the selected element.</p>
            </section>
            <section class="idp-player-board-frame-inspector" data-idp-board-frame-inspector>
              <div class="idp-player-board-frame-inspector-head">
                <span>Frame Inspector</span>
                <small data-idp-board-frame-inspector-status>${escapeHtml(frameStatusLabel)}</small>
              </div>
              <label>
                <span>Frame title</span>
                <input name="frameLabel" value="${fieldValue(frame.label || "Start")}" autocomplete="off" data-idp-board-frame-meta>
              </label>
              <label>
                <span>Coach cue</span>
                <textarea name="frameCoachCue" rows="2" data-idp-board-frame-meta placeholder="What should the coach reinforce here?">${fieldValue(frame.coachCue || "")}</textarea>
              </label>
              <label>
                <span>Player cue</span>
                <textarea name="framePlayerCue" rows="2" data-idp-board-frame-meta placeholder="Short player-facing instruction">${fieldValue(frame.playerCue || "")}</textarea>
              </label>
              <input type="hidden" name="frameClipAnchor" value="${fieldValue(frame.clipAnchor || "")}" data-idp-board-frame-meta data-idp-board-frame-clip-anchor>
              ${renderBoardClipPicker(detail, state, frame)}
              <div class="idp-player-board-frame-preview" aria-live="polite">
                <strong data-idp-board-frame-preview-title>${escapeHtml(frame.label || "Start")}</strong>
                <small data-idp-board-frame-preview-cue>${escapeHtml(frame.playerCue || frame.coachCue || "No cue on this frame yet")}</small>
                <span data-idp-board-frame-preview-anchor>${escapeHtml(frame.clipAnchor || "No clip anchor")}</span>
              </div>
            </section>
            <section class="session-tacticalboard-settings idp-player-board-settings" aria-label="Board settings">
              <label>
                <span>Pitch view</span>
                <select name="pitchMode">${renderPitchModeOptions(intervention.pitchMode || "half")}</select>
              </label>
              <label>
                <span>Linked goal</span>
                <select name="goalId">${renderGoalOptions(detail, intervention.goalId || "")}</select>
              </label>
              <label class="idp-player-board-color-control">
                <span>Movement colour</span>
                <div class="session-tacticalboard-colour-row idp-player-board-color-row">
                  <input name="arrowColor" type="color" value="${fieldValue(arrowColor)}" data-idp-board-color-input>
                  <div class="session-tacticalboard-colour-swatches idp-player-board-color-swatches">${renderBoardColorSwatches(arrowColor)}</div>
                </div>
              </label>
              <div class="idp-player-board-form-grid">
                <label>
                  <span>Width</span>
                  <input name="arrowLineWidth" type="range" min="0.75" max="6" step="0.25" value="${fieldValue(arrowLineWidth)}" data-idp-board-line-width>
                </label>
                <label>
                  <span>Style</span>
                  <select name="arrowLineStyle" data-idp-board-line-style>${renderLineStyleOptions(arrowLineStyle)}</select>
                </label>
              </div>
            </section>
            <section class="idp-player-board-editor-group is-featured">
              <strong>Active Individual Exercise</strong>
              <label><span>Title</span><input name="title" value="${fieldValue(intervention.title, "Individual exercise")}" autocomplete="off"></label>
              <label><span>Objective</span><textarea name="objective" rows="3">${fieldValue(intervention.objective || focus?.description || "")}</textarea></label>
              <div class="idp-player-board-form-grid">
                <label><span>Status</span><select name="status">
                  ${["draft", "active", "review", "completed"].map((status) => `<option value="${status}"${status === intervention.status ? " selected" : ""}>${escapeHtml(status)}</option>`).join("")}
                </select></label>
              </div>
            </section>
            <section class="idp-player-board-editor-group">
              <strong>Coach Notes</strong>
              <label><span>Coaching cue</span><textarea name="coachingCue" rows="2">${fieldValue(intervention.coachingCue || "")}</textarea></label>
              <label><span>Success criteria</span><textarea name="successCriteria" rows="2" placeholder="One criterion per line">${fieldValue(Array.isArray(intervention.successCriteria) ? intervention.successCriteria.join("\n") : "")}</textarea></label>
              <label><span>Board note</span><textarea name="noteText" rows="2">${fieldValue(note.text)}</textarea></label>
            </section>
            <footer>
              ${intervention.id ? `<button type="button" class="is-danger" data-idp-archive-intervention="${escapeHtml(intervention.id)}">Archive</button>` : ""}
              <button type="button" data-idp-player-board-close>Cancel</button>
              <button type="submit" ${canEdit ? "" : "disabled"}>Save IDP Board</button>
            </footer>
          </form>
        </div>
      </section>
    </div>
  `;
}
