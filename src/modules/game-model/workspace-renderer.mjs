import { escapeHtml } from "../../core/runtime-ui-helpers.mjs";
import { gameModelPositions, gameModelSubPhases } from "./catalog.mjs";

export const sections = [
  { id: "team-principle", label: "Team Principles" },
  { id: "mini-game-principle", label: "Mini-Game Principles" },
  { id: "individual-action", label: "Individual Actions" },
];

const positionLabel = (id) => gameModelPositions.find((position) => position.id === id)?.label || id;
const esc = (value) => escapeHtml(value ?? "");

function selected(value, expected) {
  return value === expected ? " selected" : "";
}

function renderSubPhases(selectedId, disabled) {
  const phases = new Map();
  for (const subPhase of gameModelSubPhases) {
    if (!phases.has(subPhase.phase)) phases.set(subPhase.phase, []);
    phases.get(subPhase.phase).push(subPhase);
  }
  return `<nav class="gm-subphases" aria-label="Game Model sub-phases">
    ${Array.from(phases, ([phase, subPhases]) => `<div class="gm-phase">
      <h2>${esc(phase)}</h2>
      ${subPhases.map(({ id, label }) => `<button type="button" data-gm-subphase="${esc(id)}"
        ${id === selectedId ? 'aria-current="page"' : ""}${disabled}>${esc(label)}</button>`).join("")}
    </div>`).join("")}
  </nav>
  <label class="gm-mobile-subphases">Sub-Phase
    <select data-gm-subphase-select${disabled}>
      ${Array.from(phases, ([phase, subPhases]) => `<optgroup label="${esc(phase)}">
        ${subPhases.map(({ id, label }) => `<option value="${esc(id)}"${selected(id, selectedId)}>${esc(label)}</option>`).join("")}
      </optgroup>`).join("")}
    </select>
  </label>`;
}

function renderSectionTabs(kind, disabled) {
  return `<nav aria-label="Game Model sections" class="gm-sections">
    ${sections.map(({ id, label }) => `<button type="button" data-gm-section="${id}" aria-pressed="${id === kind}"${disabled}>${label}</button>`).join("")}
  </nav>`;
}

function renderPositionFilter(value, disabled) {
  return `<label class="gm-position-filter">Position
    <select data-gm-position-filter${disabled}>
      <option value="">All positions</option>
      ${gameModelPositions.map(({ id, label }) => `<option value="${esc(id)}"${selected(id, value)}>${esc(label)}</option>`).join("")}
    </select>
  </label>`;
}

function renderItemContext(item) {
  const individual = item.kind === "individual-action";
  return `${individual && item.positionIds?.length ? `<ul class="gm-position-labels" aria-label="Positions">
    ${item.positionIds.map((id) => `<li>${esc(positionLabel(id))}</li>`).join("")}
  </ul>` : ""}
  ${individual && item.when ? `<dl class="gm-cue"><dt>When</dt><dd>${esc(item.when)}</dd></dl>` : ""}
  ${item.detail ? `<p class="gm-item-detail">${esc(item.detail)}</p>` : ""}`;
}

function renderItem(item, editable, disabled) {
  const action = item.archived ? "Restore" : "Archive";
  return `<li class="gm-item" data-gm-item-id="${esc(item.id)}">
    <div class="gm-item-content">
      <h3>${esc(item.title)}</h3>
      ${renderItemContext(item)}
    </div>
    ${editable ? `<div class="gm-item-controls">
      ${item.archived ? "" : `<button type="button" class="gm-quiet" data-gm-edit aria-label="Edit ${esc(item.title)}"${disabled}>Edit</button>`}
      <button type="button" class="gm-quiet" data-gm-archive aria-label="${action} ${esc(item.title)}"${disabled}>${action}</button>
    </div>` : ""}
  </li>`;
}

function renderPositions(positionIds) {
  return `<fieldset class="gm-position-fields">
    <legend>Positions</legend>
    <div>
      ${gameModelPositions.map(({ id, label }) => `<label>
        <input type="checkbox" name="positionIds" value="${esc(id)}"${positionIds.includes(id) ? " checked" : ""}>
        <span>${esc(label)}</span>
      </label>`).join("")}
    </div>
  </fieldset>`;
}

function renderDraftError({ conflict, draftError, loading, editable }) {
  if (!draftError && !conflict) return "";
  const latest = conflict?.latest;
  return `<div class="gm-draft-error" data-gm-draft-feedback tabindex="-1">
    ${draftError ? `<p role="alert">${esc(draftError)}</p>` : ""}
    ${conflict?.mode === "reload" ? `<button type="button" data-gm-reload${loading ? " disabled" : ""}>${loading ? "Loading…" : "Reload latest"}</button>` : ""}
    ${latest ? `<section class="gm-latest">
      <h4>Latest saved version</h4>
      <strong>${esc(latest.title)}</strong>
      ${renderItemContext(latest)}
      ${editable ? '<button type="button" data-gm-accept-latest>Keep my edits</button>' : ""}
    </section>` : ""}
  </div>`;
}

function renderEditor(model) {
  const { draft, saving, conflict, editable } = model;
  const isAction = draft.kind === "individual-action";
  const noun = isAction ? "action" : "principle";
  const editVerb = draft.isNew ? "Add" : "Edit";
  const disableSave = saving || conflict || !editable ? " disabled" : "";
  return `<form class="gm-editor" data-gm-editor aria-label="${editVerb} ${noun}" aria-busy="${saving}">
    <h3>${editVerb} ${noun}</h3>
    <fieldset${saving || !editable ? " disabled" : ""}>
      ${isAction ? renderPositions(draft.positionIds) : ""}
      ${isAction ? `<label class="gm-field">When
        <textarea name="when" maxlength="400" rows="2" required>${esc(draft.when)}</textarea>
      </label>` : ""}
      <label class="gm-field">${isAction ? "Action" : "Principle"}
        <input name="title" value="${esc(draft.title)}" maxlength="180" required>
      </label>
      <label class="gm-field">Detail
        <textarea name="detail" maxlength="1200" rows="3"${isAction ? " required" : ""}>${esc(draft.detail)}</textarea>
      </label>
    </fieldset>
    ${renderDraftError(model)}
    <div class="gm-editor-actions">
      <button type="button" data-gm-cancel${saving ? " disabled" : ""}>Cancel</button>
      <button type="submit" class="gm-primary"${disableSave}>${saving ? "Saving…" : draft.isNew ? `Save ${noun}` : "Save changes"}</button>
    </div>
  </form>`;
}

function renderFeedback(model) {
  const { catalogError, error, status, loading } = model;
  if (catalogError) {
    return `<div class="gm-feedback">
      <p role="alert">${esc(catalogError)}</p>
      <button type="button" data-gm-reload${loading ? " disabled" : ""}>Retry</button>
    </div>`;
  }
  if (error || status) {
    return `<div class="gm-feedback">
      ${error ? `<p role="alert">${esc(error)}</p>` : `<p role="status">${esc(status)}</p>`}
      ${model.reloadAfterError ? `<button type="button" data-gm-reload${loading ? " disabled" : ""}>Reload latest</button>` : ""}
    </div>`;
  }
  return "";
}

function renderList(model) {
  const { items, subPhaseId, kind, positionId, editable, showArchived, draft, saving } = model;
  const isAction = kind === "individual-action";
  const noun = isAction ? "action" : "principle";
  const disabled = draft || saving ? " disabled" : "";
  const section = sections.find((entry) => entry.id === kind);
  const matches = items.filter((item) => item.subPhaseId === subPhaseId && item.kind === kind
    && (!isAction || !positionId || item.positionIds?.includes(positionId)));
  const currentItems = matches.filter((item) => !item.archived);
  const archived = editable && matches.filter((item) => item.archived);
  return `<section class="gm-panel" aria-label="${section.label}">
    <div class="gm-panel-header">
      <div class="gm-panel-tools">
        ${isAction ? renderPositionFilter(positionId, disabled) : ""}
        ${editable && !draft ? `<button type="button" class="gm-primary" data-gm-add${disabled}>Add ${noun}</button>` : ""}
      </div>
    </div>
    ${draft ? renderEditor(model) : ""}
    ${currentItems.length
      ? `<ul class="gm-items">${currentItems.map((item) => renderItem(item, editable, disabled)).join("")}</ul>`
      : `<p class="gm-empty">No ${isAction ? "actions" : "principles"} ${positionId && isAction ? "for this position" : "in this sub-phase"}.</p>`}
    ${archived?.length ? `<div class="gm-archived">
      <button type="button" class="gm-quiet" data-gm-toggle-archived aria-expanded="${showArchived}" aria-controls="gm-archived-items"${disabled}>${showArchived ? "Hide archived" : `Show archived (${archived.length})`}</button>
      <ul class="gm-items" id="gm-archived-items"${showArchived ? "" : " hidden"}>
        ${showArchived ? archived.map((item) => renderItem(item, editable, disabled)).join("") : ""}
      </ul>
    </div>` : ""}
  </section>`;
}

export function renderGameModelWorkspace(model) {
  const { catalog, draft, loading, subPhaseId, kind, saving } = model;
  const disabled = draft || saving ? " disabled" : "";
  const subPhase = gameModelSubPhases.find((phase) => phase.id === subPhaseId);
  return `<div class="gm-workspace">
    <header class="gm-header"><h1>Game Model</h1></header>
    ${!catalog ? `${renderFeedback(model)}
      ${loading ? '<p class="gm-empty" role="status">Loading Game Model…</p>' : ""}` : `
      <div class="gm-layout">
        ${renderSubPhases(subPhaseId, disabled)}
        <div class="gm-main">
          <header class="gm-subphase-header">
            <p>${esc(subPhase?.phase)}</p>
            <h2 data-gm-heading tabindex="-1">${esc(subPhase?.label)}</h2>
          </header>
          ${renderSectionTabs(kind, disabled)}
          ${renderFeedback(model)}
          ${renderList(model)}
        </div>
      </div>`}
  </div>`;
}
