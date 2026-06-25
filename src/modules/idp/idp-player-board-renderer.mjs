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

function boardLineDasharray(lineStyle = "solid") {
  if (lineStyle === "dashed") return "7 4";
  if (lineStyle === "dotted") return "1 4";
  return "";
}

function boardArrowType(value = "arrow") {
  return ["arrow", "pass", "run"].includes(value) ? value : "arrow";
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

function coachLabel(value = "") {
  return String(value ?? "")
    .replace(/\bNeeds Evidence\b/g, "Needs Observation")
    .replace(/\bAdd Evidence\b/g, "Add Observation")
    .replace(/\bEvidence\b/g, "Observations")
    .replace(/\bevidence\b/g, "observations");
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
    pitchMode: profile.position === "Goalkeeper" || profile.role === "GK" ? "box" : "half",
    boardState: boardState({}, focus, profile),
    status: "active",
    rowVersion: 1,
  };
}

function pitchModeLabel(mode = "half") {
  return {
    full: "Full pitch",
    half: "Half pitch",
    "final-third": "Final third",
    box: "Box",
  }[mode] || "Half pitch";
}

function renderPitchLines() {
  return `
    <div class="idp-player-board-line is-half"></div>
    <div class="idp-player-board-circle"></div>
    <div class="idp-player-board-box is-top"></div>
    <div class="idp-player-board-box is-bottom"></div>
    <div class="idp-player-board-goal is-top"></div>
    <div class="idp-player-board-goal is-bottom"></div>
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
  const lineWidth = normalizeBoardLineWidth(arrow.lineWidth, 2.4);
  const dash = boardLineDasharray(lineStyle);
  const style = `stroke:${escapeHtml(color)};stroke-width:${lineWidth};${dash ? `stroke-dasharray:${escapeHtml(dash)};` : ""}`;
  if (type === "run") {
    const controlX = (fromX + toX) / 2;
    const controlY = Math.min(fromY, toY) - Math.max(6, Math.abs(toX - fromX) / 5);
    return `<path d="M ${fromX} ${fromY} Q ${controlX} ${controlY} ${toX} ${toY}" marker-end="url(#${escapeHtml(markerId)})" data-idp-board-arrow-type="${escapeHtml(type)}" style="${style}"></path>`;
  }
  return `<line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}" marker-end="url(#${escapeHtml(markerId)})" data-idp-board-arrow-type="${escapeHtml(type)}" style="${style}"></line>`;
}

function renderBoardPitch(intervention = {}, profile = {}, focus = {}, options = {}) {
  const state = boardState(intervention, focus, profile);
  const player = state.player || {};
  const initials = initialsFromName(profile.playerName || profile.name || "Player", "P");
  const playerName = normalizeText(profile.playerName || profile.name || "Player", "Player");
  const markerId = options.markerId || "idp-player-board-arrow";
  const editorAttr = options.editor ? " data-idp-board-editor-pitch" : "";
  const playerY = clampPercent(player.y, 70);
  const playerLabelTop = clampPercent(playerY > 66 ? playerY - 11 : playerY + 9, 79);
  return `
    <div class="idp-player-board-pitch is-${escapeHtml(intervention.pitchMode || "half")}"${editorAttr}>
      <span class="idp-player-board-mode-chip">${escapeHtml(pitchModeLabel(intervention.pitchMode || "half"))}</span>
      ${renderPitchLines()}
      ${Array.isArray(state.zones) ? state.zones.map((zone) => `
        <span class="idp-player-board-zone" style="left:${clampPercent(zone.x, 34)}%;top:${clampPercent(zone.y, 28)}%;width:${clampPercent(zone.width, 32)}%;height:${clampPercent(zone.height, 28)}%;">
          ${escapeHtml(zone.label || "Zone")}
        </span>
      `).join("") : ""}
      <svg class="idp-player-board-arrow-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker id="${escapeHtml(markerId)}" markerWidth="6" markerHeight="6" refX="5.4" refY="3" orient="auto" markerUnits="strokeWidth" viewBox="0 0 6 6">
            <path d="M0.7,0.6 L5.4,3 L0.7,5.4 Z" fill="context-stroke" stroke="context-stroke" stroke-width="0.22" stroke-linejoin="round"></path>
          </marker>
        </defs>
        ${Array.isArray(state.arrows) ? state.arrows.map((arrow) => renderArrowElement(arrow, markerId)).join("") : ""}
      </svg>
      ${Array.isArray(state.cones) ? state.cones.map((cone, index) => `
        <span class="idp-player-board-cone" data-idp-board-cone="${index + 1}" style="left:${clampPercent(cone.x, 50)}%;top:${clampPercent(cone.y, 50)}%;"></span>
      `).join("") : ""}
      ${Array.isArray(state.referencePlayers) ? state.referencePlayers.map((item) => `
        <span class="idp-player-board-reference" style="left:${clampPercent(item.x, 50)}%;top:${clampPercent(item.y, 45)}%;">${escapeHtml(item.label || "REF")}</span>
      `).join("") : ""}
      ${Array.isArray(state.notes) ? state.notes.slice(0, 2).map((note) => `
        <span class="idp-player-board-note-pin" style="left:${clampPercent(note.x, 12)}%;top:${clampPercent(note.y, 14)}%;">${escapeHtml(note.text)}</span>
      `).join("") : ""}
      <span class="idp-player-board-player" style="left:${clampPercent(player.x, 50)}%;top:${playerY}%;">
        ${escapeHtml(initials)}
      </span>
      <span class="idp-player-board-player-name" style="left:${clampPercent(player.x, 50)}%;top:${playerLabelTop}%;">
        ${escapeHtml(playerName)}
      </span>
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

function renderExerciseBank(detail = {}, current = {}, focus = {}) {
  const interventions = Array.isArray(detail.interventions)
    ? detail.interventions.filter((item) => item.status !== "archived")
    : [];
  const items = interventions.length ? interventions : [current];
  const visibleItems = items.slice(0, 3);
  const remainingCount = Math.max(0, items.length - visibleItems.length);
  return `
    <div class="idp-player-board-exercise-bank" aria-label="IDP individual exercise bank">
      <div class="idp-player-board-bank-head">
        <span>Exercise Bank</span>
        <strong>${escapeHtml(items.length === 1 ? "1 individual exercise" : `${items.length} individual exercises`)}</strong>
      </div>
      <div class="idp-player-board-bank-list">
        ${visibleItems.map((item, index) => {
          const itemCounts = interventionCounts(item);
          const isCurrent = item === current || (item.id && item.id === current.id);
          const actionAttr = item.id
            ? `data-idp-player-board-select="${escapeHtml(item.id)}"`
            : "data-idp-player-board-new";
          return `
            <button type="button" class="idp-player-board-bank-item${isCurrent ? " is-current" : ""}" ${actionAttr}>
              <span class="idp-player-board-bank-number">${String(index + 1).padStart(2, "0")}</span>
              <span class="idp-player-board-bank-copy">
                <strong>${escapeHtml(item.title || "Individual exercise")}</strong>
                <small>${escapeHtml(interventionObjective(item, focus))}</small>
              </span>
              <span class="idp-player-board-bank-meta">
                <strong>${escapeHtml(interventionStatusLabel(item.status))}</strong>
                <small>${escapeHtml(`${itemCounts.frames || 1} frame${itemCounts.frames === 1 ? "" : "s"} / ${itemCounts.clips} clips`)}</small>
              </span>
            </button>
          `;
        }).join("")}
        ${remainingCount ? `<span class="idp-player-board-bank-more">+${escapeHtml(String(remainingCount))} more in editor</span>` : ""}
      </div>
    </div>
  `;
}

function renderPreviewToolRail() {
  return `
    <span class="idp-player-board-tool-rail" aria-hidden="true">
      ${["player", "reference", "cone", "zone", "run"].map((tool) => `
        <span title="${escapeHtml(boardToolLabel(tool))}">${escapeHtml(boardToolIcon(tool))}</span>
      `).join("")}
    </span>
  `;
}

export function renderIdpPlayerBoardPanel(detail = {}, focus = {}, profile = {}, pulse = {}, nextAction = {}, canEdit = false, ui = {}) {
  const intervention = activeIntervention(detail, ui) || draftIntervention(profile, focus);
  const counts = interventionCounts(intervention);
  const nextTitle = coachLabel(nextAction.title || "Add observation");
  const nextDue = nextAction.dueOn || focus?.reviewDate || "No date set";
  const modeLabel = pitchModeLabel(intervention.pitchMode);
  return `
    <aside class="idp-player-board-panel">
      <div class="idp-player-board-head">
        <div>
          <span>IDP Player Board</span>
          <strong>${escapeHtml(intervention.title || "Individual exercise")}</strong>
          <small>${escapeHtml(profile.playerName || "Individual player")}</small>
        </div>
        <div class="idp-player-board-meta">
          <span><strong>${escapeHtml(String(counts.frames))}</strong> frames</span>
          <span><strong>${escapeHtml(String(counts.clips))}</strong> clips</span>
          <span><strong>${escapeHtml(String(counts.notes))}</strong> notes</span>
        </div>
      </div>
      <button type="button" class="idp-player-board-preview" data-idp-player-board-open aria-label="Open IDP Player Board">
        <span class="idp-player-board-surface">
          <span class="idp-player-board-boardbar" aria-hidden="true">
            <span><strong>01</strong><small>Individual</small></span>
            <span><strong>${escapeHtml(modeLabel)}</strong><small>Pitch view</small></span>
            <span><strong>${escapeHtml(String(Math.max(1, counts.frames)))}</strong><small>Frames</small></span>
          </span>
          <span class="idp-player-board-canvas">
            ${renderPreviewToolRail()}
            ${renderBoardPitch(intervention, profile, focus, { markerId: "idp-player-board-preview-arrow" })}
          </span>
          <span class="idp-player-board-insight-row">
            <span>
              <strong>${escapeHtml(pulse.label || "On track")}</strong>
              <small>${escapeHtml(pulse.detail || "Progress")}</small>
            </span>
            <span>
              <strong>${escapeHtml(nextTitle)}</strong>
              <small>${escapeHtml(nextDue)}</small>
            </span>
          </span>
        </span>
      </button>
      ${renderExerciseBank(detail, intervention, focus)}
      ${canEdit ? `
        <div class="idp-player-board-actions">
          <button type="button" class="is-primary" data-idp-player-board-new>New Exercise</button>
          <button type="button" data-idp-player-board-open>Edit Board</button>
          <button type="button" data-idp-player-board-link-clip>Link Clip</button>
          <button type="button" data-idp-action="evidence">Add Observation</button>
        </div>
      ` : ""}
    </aside>
  `;
}

function fieldValue(value, fallback = "") {
  return escapeHtml(normalizeText(value, fallback));
}

function renderPitchModeOptions(selected = "half") {
  return ["full", "half", "final-third", "box"].map((mode) => `
    <option value="${escapeHtml(mode)}"${mode === selected ? " selected" : ""}>${escapeHtml(pitchModeLabel(mode))}</option>
  `).join("");
}

function selectedEditorIntervention(detail = {}, focus = {}, profile = {}, ui = {}) {
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
      class="idp-player-board-color-swatch${normalized === color ? " is-active" : ""}"
      data-idp-board-color-choice="${escapeHtml(color)}"
      style="--idp-board-swatch:${escapeHtml(color)};"
      title="${escapeHtml(label)}"
      aria-label="${escapeHtml(label)}"
    ></button>
  `).join("");
}

const boardToolGroups = [
  { label: "Individual", tools: [["player", "Move Player"], ["reference", "Reference"]] },
  { label: "Equipment", tools: [["cone", "Cone"], ["zone", "Zone"]] },
  { label: "Draw", tools: [["arrow", "Arrow"], ["pass", "Pass"], ["run", "Run"], ["note", "Note"]] },
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
      class="idp-player-board-tool-button${activeTool === tool ? " is-active" : ""}"
      ${dataAttribute}
      title="${escapeHtml(label)}"
      aria-label="${escapeHtml(label)}"
    >
      <span class="idp-player-board-tool-icon" aria-hidden="true">${escapeHtml(boardToolIcon(tool))}</span>
      <span class="idp-player-board-tool-label">${escapeHtml(label)}</span>
    </button>
  `;
}

function renderBoardToolGroups(activeTool = "player") {
  return boardToolGroups.map((group) => `
    <div class="idp-player-board-tool-group">
      <span>${escapeHtml(group.label)}</span>
      <div class="idp-player-board-tool-row">
        ${group.tools.map(([tool, label]) => renderBoardToolButton(tool, label, activeTool)).join("")}
      </div>
    </div>
  `).join("");
}

function renderBoardFrameStrip(frames = []) {
  const safeFrames = Array.isArray(frames) && frames.length ? frames.slice(0, 6) : [{ id: "frame-1", label: "Start" }];
  return `
    <div class="idp-player-board-editor-framebar" aria-label="IDP board frames">
      <span>Frames</span>
      <div>
        ${safeFrames.map((frame, index) => `
          <button type="button" class="${index === 0 ? "is-active" : ""}" title="${escapeHtml(frame.label || `Frame ${index + 1}`)}">${index + 1}</button>
        `).join("")}
      </div>
    </div>
  `;
}

export function renderIdpPlayerBoardOverlay(detail = {}, focus = {}, profile = {}, ui = {}, canEdit = false) {
  if (!ui.playerBoardOpen) return "";
  const interventions = Array.isArray(detail.interventions) ? detail.interventions.filter((item) => item.status !== "archived") : [];
  const intervention = selectedEditorIntervention(detail, focus, profile, ui);
  const state = boardState(intervention, focus, profile);
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
  const frame = state.frames?.[0] || {};
  const counts = interventionCounts(intervention);
  const linkedClipIds = Array.isArray(state.linkedClipIds) ? state.linkedClipIds.join(", ") : "";
  return `
    <div class="idp-player-board-layer" data-idp-player-board-layer>
      <section class="idp-player-board-modal idp-player-board-modal-tool-player" role="dialog" aria-modal="true" aria-label="IDP Player Board editor" data-idp-board-active-tool="player">
        <header class="idp-player-board-modal-head">
          <div>
            <span>IDP Player Board</span>
            <h2>${escapeHtml(profile.playerName || "Player")}</h2>
            <small>${escapeHtml(focus?.title || "Individual development")}</small>
            <div class="idp-player-board-status-strip" aria-label="Board state">
              <span data-idp-board-active-tool-label>Move Player</span>
              <span>${escapeHtml(interventionStatusLabel(intervention.status))}</span>
              <span>${escapeHtml(`${Math.max(1, counts.frames)} frames`)}</span>
              <span>${escapeHtml(`${counts.clips} clips`)}</span>
            </div>
          </div>
          <button type="button" data-idp-player-board-close>Close</button>
        </header>
        <div class="idp-player-board-modal-layout is-tactical-style">
          <aside class="idp-player-board-toolbox">
            <div class="idp-player-board-editor-bank">
              <div class="idp-player-board-editor-panel-head">
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
            <div class="idp-player-board-tools" aria-label="IDP board tools">
              ${renderBoardToolGroups("player")}
            </div>
          </aside>
          <div class="idp-player-board-canvas-wrap">
            ${renderBoardFrameStrip(state.frames)}
            <div class="idp-player-board-editor-stage">
              ${renderBoardPitch(intervention, profile, focus, { markerId: "idp-player-board-editor-arrow", editor: true })}
            </div>
            <div class="idp-player-board-editor-hint">
              <strong data-idp-board-hint-tool>Move Player</strong>
              <span data-idp-board-hint-state>Click the pitch to place the selected IDP element.</span>
            </div>
          </div>
          <form class="idp-player-board-form idp-player-board-inspector" data-idp-save-intervention>
            <input type="hidden" name="interventionId" value="${fieldValue(intervention.id)}">
            <input type="hidden" name="focusId" value="${fieldValue(focus?.id)}">
            <input type="hidden" name="rowVersion" value="${fieldValue(intervention.rowVersion || 1)}">
            <input type="hidden" name="arrowType" value="${fieldValue(arrowType)}" data-idp-board-arrow-type>
            <div class="idp-player-board-settings" aria-label="Board settings">
              <label>
                <span>Pitch view</span>
                <select name="pitchMode">${renderPitchModeOptions(intervention.pitchMode || "half")}</select>
              </label>
              <label>
                <span>Movement colour</span>
                <div class="idp-player-board-color-row">
                  <input name="arrowColor" type="color" value="${fieldValue(arrowColor)}" data-idp-board-color-input>
                  <div class="idp-player-board-color-swatches">${renderBoardColorSwatches(arrowColor)}</div>
                </div>
              </label>
              <label>
                <span>Width</span>
                <input name="arrowLineWidth" type="range" min="0.75" max="6" step="0.25" value="${fieldValue(arrowLineWidth)}" data-idp-board-line-width>
              </label>
              <label>
                <span>Style</span>
                <select name="arrowLineStyle" data-idp-board-line-style>${renderLineStyleOptions(arrowLineStyle)}</select>
              </label>
            </div>
            <div class="idp-player-board-editor-group">
              <strong>Active Individual Exercise</strong>
              <label><span>Title</span><input name="title" value="${fieldValue(intervention.title, "Individual exercise")}" autocomplete="off"></label>
              <label><span>Objective</span><textarea name="objective" rows="3">${fieldValue(intervention.objective || focus?.description || "")}</textarea></label>
              <div class="idp-player-board-form-grid">
                <label><span>Status</span><select name="status">
                  ${["draft", "active", "review", "completed"].map((status) => `<option value="${status}"${status === intervention.status ? " selected" : ""}>${escapeHtml(status)}</option>`).join("")}
                </select></label>
                <label><span>Frame</span><input name="frameLabel" value="${fieldValue(frame.label || "Start")}" autocomplete="off"></label>
              </div>
            </div>
            <div class="idp-player-board-editor-group">
              <strong>Move Player</strong>
              <div class="idp-player-board-form-grid">
                <label><span>X</span><input name="playerX" type="number" min="0" max="100" step="1" value="${fieldValue(player.x, "50")}"></label>
                <label><span>Y</span><input name="playerY" type="number" min="0" max="100" step="1" value="${fieldValue(player.y, "70")}"></label>
              </div>
            </div>
            <div class="idp-player-board-editor-group">
              <strong>Reference & Equipment</strong>
              <div class="idp-player-board-form-grid">
                <label><span>Ref label</span><input name="referenceLabel" value="${fieldValue(reference.label || "REF")}" autocomplete="off"></label>
                <label><span>Ref X</span><input name="referenceX" type="number" min="0" max="100" step="1" value="${fieldValue(reference.x, "50")}"></label>
                <label><span>Ref Y</span><input name="referenceY" type="number" min="0" max="100" step="1" value="${fieldValue(reference.y, "44")}"></label>
                <label><span>Cone 1 X</span><input name="cone1X" type="number" min="0" max="100" step="1" value="${fieldValue(cones[0]?.x, "40")}"></label>
                <label><span>Cone 1 Y</span><input name="cone1Y" type="number" min="0" max="100" step="1" value="${fieldValue(cones[0]?.y, "58")}"></label>
                <label><span>Cone 2 X</span><input name="cone2X" type="number" min="0" max="100" step="1" value="${fieldValue(cones[1]?.x, "60")}"></label>
                <label><span>Cone 2 Y</span><input name="cone2Y" type="number" min="0" max="100" step="1" value="${fieldValue(cones[1]?.y, "58")}"></label>
                <label><span>Cone 3 X</span><input name="cone3X" type="number" min="0" max="100" step="1" value="${fieldValue(cones[2]?.x, "50")}"></label>
                <label><span>Cone 3 Y</span><input name="cone3Y" type="number" min="0" max="100" step="1" value="${fieldValue(cones[2]?.y, "42")}"></label>
              </div>
            </div>
            <div class="idp-player-board-editor-group">
              <strong>Zone</strong>
              <label><span>Zone label</span><input name="zoneLabel" value="${fieldValue(zone.label || focus?.category || "Development zone")}" autocomplete="off"></label>
              <div class="idp-player-board-form-grid">
                <label><span>X</span><input name="zoneX" type="number" min="0" max="100" step="1" value="${fieldValue(zone.x, "34")}"></label>
                <label><span>Y</span><input name="zoneY" type="number" min="0" max="100" step="1" value="${fieldValue(zone.y, "28")}"></label>
                <label><span>W</span><input name="zoneWidth" type="number" min="8" max="80" step="1" value="${fieldValue(zone.width, "32")}"></label>
                <label><span>H</span><input name="zoneHeight" type="number" min="8" max="80" step="1" value="${fieldValue(zone.height, "28")}"></label>
              </div>
            </div>
            <div class="idp-player-board-editor-group">
              <strong>Arrow / Run</strong>
              <label><span>Label</span><input name="arrowLabel" value="${fieldValue(arrow.label || "Action path")}" autocomplete="off"></label>
              <div class="idp-player-board-form-grid">
                <label><span>From X</span><input name="arrowFromX" type="number" min="0" max="100" step="1" value="${fieldValue(arrow.from?.x, player.x || "50")}"></label>
                <label><span>From Y</span><input name="arrowFromY" type="number" min="0" max="100" step="1" value="${fieldValue(arrow.from?.y, player.y || "70")}"></label>
                <label><span>To X</span><input name="arrowToX" type="number" min="0" max="100" step="1" value="${fieldValue(arrow.to?.x, "62")}"></label>
                <label><span>To Y</span><input name="arrowToY" type="number" min="0" max="100" step="1" value="${fieldValue(arrow.to?.y, "42")}"></label>
              </div>
            </div>
            <div class="idp-player-board-editor-group">
              <strong>Notes / Clips</strong>
              <label><span>Coach note</span><textarea name="noteText" rows="2">${fieldValue(note.text)}</textarea></label>
              <div class="idp-player-board-form-grid">
                <label><span>Note X</span><input name="noteX" type="number" min="0" max="100" step="1" value="${fieldValue(note.x, "12")}"></label>
                <label><span>Note Y</span><input name="noteY" type="number" min="0" max="100" step="1" value="${fieldValue(note.y, "14")}"></label>
              </div>
              <label><span>Linked clip ids</span><input name="linkedClipIds" value="${fieldValue(linkedClipIds)}" autocomplete="off" placeholder="clip-id, clip-id"></label>
            </div>
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
