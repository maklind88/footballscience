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
  const aliases = {
    half: "attacking-half",
    "final-third": "attacking-half",
    box: "goalkeeper",
  };
  const normalized = normalizeText(mode, "attacking-half");
  return ["full", "full-wide", "attacking-half", "defending-half", "goalkeeper"].includes(normalized)
    ? normalized
    : aliases[normalized] || "attacking-half";
}

function pitchModeLabel(mode = "half") {
  return {
    full: "Full pitch",
    "full-wide": "Full pitch wide",
    "attacking-half": "Attacking half",
    "defending-half": "Defending half",
    goalkeeper: "Goalkeeper box",
    half: "Attacking half",
    "final-third": "Attacking half",
    box: "Goalkeeper box",
  }[mode] || "Attacking half";
}

function pitchMeasurementLabel(mode = "attacking-half") {
  return {
    full: "65 x 105 m",
    "full-wide": "105 x 65 m",
    "attacking-half": "65 x 52.5 m",
    "defending-half": "65 x 52.5 m",
    goalkeeper: "65 x 33 m",
  }[normalizePitchMode(mode)] || "65 x 52.5 m";
}

function renderSessionPitchDiagram(mode = "attacking-half") {
  const pitchMode = normalizePitchMode(mode);
  const isWide = pitchMode === "full-wide";
  const includeTop = ["full", "attacking-half", "goalkeeper"].includes(pitchMode);
  const includeBottom = ["full", "defending-half"].includes(pitchMode);
  const includeCenter = ["full", "full-wide"].includes(pitchMode);
  const includeHalfLine = !["goalkeeper"].includes(pitchMode);
  if (isWide) {
    return `
      <g class="session-pitch-diagram session-pitch-diagram-mode-${escapeHtml(pitchMode)} idp-tactical-pitch-lines" aria-label="IDP tactical pitch lines">
        <rect class="session-pitch-touchline" x="3" y="3" width="94" height="94" rx="1.1"></rect>
        <line class="session-pitch-halfway-line" x1="50" y1="3" x2="50" y2="97"></line>
        <circle class="session-pitch-centre-circle" cx="50" cy="50" r="8.8"></circle>
        <circle class="session-pitch-centre-spot" cx="50" cy="50" r=".55"></circle>
        <rect class="session-pitch-goal session-pitch-goal-top" x=".8" y="44.4" width="2.2" height="11.2" rx=".35"></rect>
        <rect class="session-pitch-goal session-pitch-goal-bottom" x="97" y="44.4" width="2.2" height="11.2" rx=".35"></rect>
        <rect class="session-pitch-box session-pitch-box-top" x="3" y="20.35" width="15.7" height="59.3"></rect>
        <rect class="session-pitch-box session-pitch-box-bottom" x="81.3" y="20.35" width="15.7" height="59.3"></rect>
        <rect class="session-pitch-goal-area session-pitch-goal-area-top" x="3" y="36.55" width="5.25" height="26.9"></rect>
        <rect class="session-pitch-goal-area session-pitch-goal-area-bottom" x="91.75" y="36.55" width="5.25" height="26.9"></rect>
        <circle class="session-pitch-penalty-spot session-pitch-penalty-spot-top" cx="13.48" cy="50" r=".55"></circle>
        <circle class="session-pitch-penalty-spot session-pitch-penalty-spot-bottom" cx="86.52" cy="50" r=".55"></circle>
      </g>
    `;
  }
  return `
    <g class="session-pitch-diagram session-pitch-diagram-mode-${escapeHtml(pitchMode)} idp-tactical-pitch-lines" aria-label="IDP tactical pitch lines">
      <rect class="session-pitch-touchline" x="3" y="3" width="94" height="94" rx="1.1"></rect>
      ${includeHalfLine ? `<line class="session-pitch-halfway-line" x1="3" y1="${pitchMode === "attacking-half" ? "97" : pitchMode === "defending-half" ? "3" : "50"}" x2="97" y2="${pitchMode === "attacking-half" ? "97" : pitchMode === "defending-half" ? "3" : "50"}"></line>` : ""}
      ${includeCenter ? '<circle class="session-pitch-centre-circle" cx="50" cy="50" r="8.8"></circle><circle class="session-pitch-centre-spot" cx="50" cy="50" r=".55"></circle>' : ""}
      ${pitchMode === "attacking-half" ? '<circle class="session-pitch-centre-circle session-pitch-centre-circle-partial" cx="50" cy="97" r="8.8"></circle>' : ""}
      ${pitchMode === "defending-half" ? '<circle class="session-pitch-centre-circle session-pitch-centre-circle-partial" cx="50" cy="3" r="8.8"></circle>' : ""}
      ${includeTop ? `
        <rect class="session-pitch-goal session-pitch-goal-top" x="44.4" y=".8" width="11.2" height="2.2" rx=".35"></rect>
        <rect class="session-pitch-box session-pitch-box-top" x="20.35" y="3" width="59.3" height="${pitchMode === "goalkeeper" ? "50" : "15.7"}"></rect>
        <rect class="session-pitch-goal-area session-pitch-goal-area-top" x="36.55" y="3" width="26.9" height="${pitchMode === "goalkeeper" ? "16.7" : "5.25"}"></rect>
        <circle class="session-pitch-penalty-spot session-pitch-penalty-spot-top" cx="50" cy="${pitchMode === "goalkeeper" ? "36.3" : "13.48"}" r=".55"></circle>
      ` : ""}
      ${includeBottom ? `
        <rect class="session-pitch-goal session-pitch-goal-bottom" x="44.4" y="97" width="11.2" height="2.2" rx=".35"></rect>
        <rect class="session-pitch-box session-pitch-box-bottom" x="20.35" y="81.3" width="59.3" height="15.7"></rect>
        <rect class="session-pitch-goal-area session-pitch-goal-area-bottom" x="36.55" y="91.75" width="26.9" height="5.25"></rect>
        <circle class="session-pitch-penalty-spot session-pitch-penalty-spot-bottom" cx="50" cy="86.52" r=".55"></circle>
      ` : ""}
    </g>
  `;
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
    const controlX = (fromX + toX) / 2;
    const controlY = Math.min(fromY, toY) - Math.max(6, Math.abs(toX - fromX) / 5);
    return `<path class="session-tactical-${escapeHtml(type)} idp-player-board-movement" d="M ${fromX} ${fromY} Q ${controlX} ${controlY} ${toX} ${toY}" ${type === "curve" ? "" : `marker-end="url(#${escapeHtml(markerId)})"`} data-idp-board-object="movement" data-idp-board-arrow-type="${escapeHtml(type)}" style="${style}"></path>${handles}`;
  }
  const shouldUseArrow = type !== "line";
  return `<line class="session-tactical-${escapeHtml(type)} idp-player-board-movement" x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}" ${shouldUseArrow ? `marker-end="url(#${escapeHtml(markerId)})"` : ""} data-idp-board-object="movement" data-idp-board-arrow-type="${escapeHtml(type)}" style="${style}"></line>${handles}`;
}

function renderBoardPitch(intervention = {}, profile = {}, focus = {}, options = {}) {
  const state = boardState(intervention, focus, profile);
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
            <marker id="${escapeHtml(markerId)}" markerWidth="6" markerHeight="6" refX="5.45" refY="3" orient="auto" markerUnits="strokeWidth" viewBox="0 0 6 6">
              <path d="M0.75,0.6 L5.45,3 L0.75,5.4 Z" fill="context-stroke" stroke="context-stroke" stroke-width="0.22" stroke-linejoin="round"></path>
            </marker>
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

export function renderIdpPlayerBoardPanel(detail = {}, focus = {}, profile = {}, pulse = {}, nextAction = {}, canEdit = false, ui = {}) {
  const intervention = activeIntervention(detail, ui) || draftIntervention(profile, focus);
  return `
    <aside class="idp-player-board-panel idp-player-board-tactical-shell">
      <div class="idp-player-board-preview idp-player-board-tactical-preview" aria-label="IDP Player Board preview">
        <span class="idp-player-board-surface">
          <span class="idp-player-board-canvas">
            ${renderBoardPitch(intervention, profile, focus, { markerId: "idp-player-board-preview-arrow" })}
          </span>
        </span>
      </div>
    </aside>
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

function renderBoardFrameStrip(frames = []) {
  const safeFrames = Array.isArray(frames) && frames.length ? frames.slice(0, 6) : [{ id: "frame-1", label: "Start" }];
  const frameStatusLabel = `1 / ${safeFrames.length || 1}`;
  return `
    <div class="session-tacticalboard-frames idp-player-board-editor-framebar" aria-label="IDP board frames">
      <div class="session-tacticalboard-panel-head idp-player-board-editor-panel-head">
        <span>Frames</span>
        <small>${escapeHtml(frameStatusLabel)}</small>
      </div>
      <div class="session-tacticalboard-frame-list idp-player-board-frame-list">
        ${safeFrames.map((frame, index) => `
          <button type="button" class="session-tacticalboard-frame idp-player-board-frame${index === 0 ? " is-active" : ""}" title="${escapeHtml(frame.label || `Frame ${index + 1}`)}">${index + 1}</button>
        `).join("")}
      </div>
      <div class="idp-player-board-history-controls" aria-label="Tactical board history">
        <button type="button" data-idp-board-undo disabled title="Undo">Undo</button>
        <button type="button" data-idp-board-redo disabled title="Redo">Redo</button>
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
            ${renderBoardFrameStrip(state.frames)}
            <div class="idp-player-board-editor-stage">
              ${renderBoardPitch(intervention, profile, focus, { markerId: "idp-player-board-editor-arrow", editor: true })}
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
            ${renderBoardGeometryInputs({ player, reference, cones, zone, arrow, note })}
            <section class="idp-tactical-inspector-card is-selected" data-idp-board-inspector>
              <span>Selected Tool</span>
              <strong data-idp-board-active-tool-label>Move Player</strong>
              <small data-idp-board-selected-object>Player marker</small>
              <p data-idp-board-hint-state>Click the pitch to place or update the selected element.</p>
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
                <label><span>Frame</span><input name="frameLabel" value="${fieldValue(frame.label || "Start")}" autocomplete="off"></label>
              </div>
            </section>
            <section class="idp-player-board-editor-group">
              <strong>Coach Notes</strong>
              <label><span>Coaching cue</span><textarea name="coachingCue" rows="2">${fieldValue(intervention.coachingCue || "")}</textarea></label>
              <label><span>Success criteria</span><textarea name="successCriteria" rows="2" placeholder="One criterion per line">${fieldValue(Array.isArray(intervention.successCriteria) ? intervention.successCriteria.join("\n") : "")}</textarea></label>
              <label><span>Board note</span><textarea name="noteText" rows="2">${fieldValue(note.text)}</textarea></label>
              <label><span>Linked clip ids</span><input name="linkedClipIds" value="${fieldValue(linkedClipIds)}" autocomplete="off" placeholder="clip-id, clip-id"></label>
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
