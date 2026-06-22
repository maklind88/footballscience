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
  return {
    schema: "idp-player-board-v1",
    player: { x: profile.position === "Goalkeeper" || profile.role === "GK" ? 50 : 52, y: profile.position === "Goalkeeper" || profile.role === "GK" ? 82 : 68 },
    referencePlayers: [{ id: "reference-1", label: "REF", x: 50, y: 45 }],
    cones: [{ id: "cone-1", x: 40, y: 58 }, { id: "cone-2", x: 60, y: 58 }, { id: "cone-3", x: 50, y: 38 }],
    zones: [{ id: "zone-1", label: focus.category || "Development zone", x: 34, y: 28, width: 32, height: 28 }],
    arrows: [{ id: "arrow-1", label: "Action path", from: { x: 50, y: 70 }, to: { x: 62, y: 42 } }],
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
      ${renderPitchLines()}
      ${Array.isArray(state.zones) ? state.zones.map((zone) => `
        <span class="idp-player-board-zone" style="left:${clampPercent(zone.x, 34)}%;top:${clampPercent(zone.y, 28)}%;width:${clampPercent(zone.width, 32)}%;height:${clampPercent(zone.height, 28)}%;">
          ${escapeHtml(zone.label || "Zone")}
        </span>
      `).join("") : ""}
      <svg class="idp-player-board-arrow-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker id="${escapeHtml(markerId)}" markerWidth="6" markerHeight="6" refX="5.4" refY="3" orient="auto" markerUnits="strokeWidth" viewBox="0 0 6 6">
            <path d="M0.7,0.6 L5.4,3 L0.7,5.4 Z"></path>
          </marker>
        </defs>
        ${Array.isArray(state.arrows) ? state.arrows.map((arrow) => `
          <line x1="${clampPercent(arrow.from?.x, 50)}" y1="${clampPercent(arrow.from?.y, 70)}" x2="${clampPercent(arrow.to?.x, 62)}" y2="${clampPercent(arrow.to?.y, 42)}" marker-end="url(#${escapeHtml(markerId)})"></line>
        `).join("") : ""}
      </svg>
      ${Array.isArray(state.cones) ? state.cones.map((cone) => `
        <span class="idp-player-board-cone" style="left:${clampPercent(cone.x, 50)}%;top:${clampPercent(cone.y, 50)}%;"></span>
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
          <span class="idp-player-board-status-strip">
            <span>Individual</span>
            <span>${escapeHtml(modeLabel)}</span>
            <span>Frame ${escapeHtml(String(Math.max(1, counts.frames)))}</span>
          </span>
          <span class="idp-player-board-canvas">
            <span class="idp-player-board-tool-rail" aria-hidden="true">
              <span>1P</span>
              <span>ZN</span>
              <span>CL</span>
            </span>
            ${renderBoardPitch(intervention, profile, focus, { markerId: "idp-player-board-preview-arrow" })}
            <span class="idp-player-board-mode-chip">${escapeHtml(modeLabel)}</span>
            <span class="idp-player-board-context-chip is-progress">
              <strong>${escapeHtml(pulse.label || "On track")}</strong>
              <small>${escapeHtml(pulse.detail || "Progress")}</small>
            </span>
            <span class="idp-player-board-context-chip is-next">
              <strong>${escapeHtml(nextTitle)}</strong>
              <small>${escapeHtml(nextDue)}</small>
            </span>
          </span>
          <span class="idp-player-board-frame-strip" aria-hidden="true">
            <span class="is-active">01</span>
            <span>${escapeHtml(focus?.category || "Focus")}</span>
            <span>${escapeHtml(String(counts.clips))} clips</span>
          </span>
        </span>
      </button>
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

export function renderIdpPlayerBoardOverlay(detail = {}, focus = {}, profile = {}, ui = {}, canEdit = false) {
  if (!ui.playerBoardOpen) return "";
  const interventions = Array.isArray(detail.interventions) ? detail.interventions.filter((item) => item.status !== "archived") : [];
  const intervention = selectedEditorIntervention(detail, focus, profile, ui);
  const state = boardState(intervention, focus, profile);
  const player = state.player || {};
  const reference = state.referencePlayers?.[0] || {};
  const zone = state.zones?.[0] || {};
  const arrow = state.arrows?.[0] || {};
  const note = state.notes?.[0] || {};
  const frame = state.frames?.[0] || {};
  const linkedClipIds = Array.isArray(state.linkedClipIds) ? state.linkedClipIds.join(", ") : "";
  return `
    <div class="idp-player-board-layer" data-idp-player-board-layer>
      <section class="idp-player-board-modal" role="dialog" aria-modal="true" aria-label="IDP Player Board editor" data-idp-board-active-tool="player">
        <header class="idp-player-board-modal-head">
          <div>
            <span>IDP Player Board</span>
            <h2>${escapeHtml(profile.playerName || "Player")}</h2>
            <small>${escapeHtml(focus?.title || "Individual development")}</small>
          </div>
          <button type="button" data-idp-player-board-close>Close</button>
        </header>
        <div class="idp-player-board-modal-layout">
          <aside class="idp-player-board-library">
            <button type="button" class="${intervention.id ? "" : "is-active"}" data-idp-player-board-new>New Individual Exercise</button>
            ${interventions.map((item) => `
              <button type="button" class="${item.id === intervention.id ? "is-active" : ""}" data-idp-player-board-select="${escapeHtml(item.id)}">
                <strong>${escapeHtml(item.title || "Individual exercise")}</strong>
                <span>${escapeHtml(pitchModeLabel(item.pitchMode))}</span>
              </button>
            `).join("")}
          </aside>
          <div class="idp-player-board-editor-stage">
            <div class="idp-player-board-tools" aria-label="Board tools">
              ${[
                ["player", "Move Player"],
                ["reference", "Reference"],
                ["zone", "Zone"],
                ["arrow", "Run"],
                ["note", "Note"],
              ].map(([tool, label], index) => `
                <button type="button" class="${index === 0 ? "is-active" : ""}" data-idp-board-tool="${escapeHtml(tool)}">${escapeHtml(label)}</button>
              `).join("")}
            </div>
            ${renderBoardPitch(intervention, profile, focus, { markerId: "idp-player-board-editor-arrow", editor: true })}
          </div>
          <form class="idp-player-board-form" data-idp-save-intervention>
            <input type="hidden" name="interventionId" value="${fieldValue(intervention.id)}">
            <input type="hidden" name="focusId" value="${fieldValue(focus?.id)}">
            <input type="hidden" name="rowVersion" value="${fieldValue(intervention.rowVersion || 1)}">
            <label>
              <span>Title</span>
              <input name="title" value="${fieldValue(intervention.title, "Individual exercise")}" autocomplete="off">
            </label>
            <label>
              <span>Objective</span>
              <textarea name="objective" rows="3">${fieldValue(intervention.objective || focus?.description || "")}</textarea>
            </label>
            <div class="idp-player-board-form-grid">
              <label><span>Pitch</span><select name="pitchMode">${renderPitchModeOptions(intervention.pitchMode || "half")}</select></label>
              <label><span>Status</span><select name="status">
                ${["draft", "active", "review", "completed"].map((status) => `<option value="${status}"${status === intervention.status ? " selected" : ""}>${escapeHtml(status)}</option>`).join("")}
              </select></label>
            </div>
            <div class="idp-player-board-editor-group">
              <strong>Move Player</strong>
              <div class="idp-player-board-form-grid">
                <label><span>X</span><input name="playerX" type="number" min="0" max="100" step="1" value="${fieldValue(player.x, "50")}"></label>
                <label><span>Y</span><input name="playerY" type="number" min="0" max="100" step="1" value="${fieldValue(player.y, "70")}"></label>
              </div>
            </div>
            <div class="idp-player-board-editor-group">
              <strong>Reference</strong>
              <div class="idp-player-board-form-grid">
                <label><span>Label</span><input name="referenceLabel" value="${fieldValue(reference.label || "REF")}" autocomplete="off"></label>
                <label><span>X</span><input name="referenceX" type="number" min="0" max="100" step="1" value="${fieldValue(reference.x, "50")}"></label>
                <label><span>Y</span><input name="referenceY" type="number" min="0" max="100" step="1" value="${fieldValue(reference.y, "44")}"></label>
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
              <strong>Notes / Frames / Clips</strong>
              <label><span>Coach note</span><textarea name="noteText" rows="2">${fieldValue(note.text)}</textarea></label>
              <div class="idp-player-board-form-grid">
                <label><span>Note X</span><input name="noteX" type="number" min="0" max="100" step="1" value="${fieldValue(note.x, "12")}"></label>
                <label><span>Note Y</span><input name="noteY" type="number" min="0" max="100" step="1" value="${fieldValue(note.y, "14")}"></label>
              </div>
              <label><span>Frame</span><input name="frameLabel" value="${fieldValue(frame.label || "Start")}" autocomplete="off"></label>
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
