import { activeFocusStatuses, availableFocusLevels, focusLevel, focusLevels, orderedFocuses } from "./domain/idp-focus-selection.mjs";

function escape(value = "") {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function linkedItems(detail, focusId, key) {
  return (detail[key] || []).filter((item) => (item.focusId || item.focus_id) === focusId && !item.deletedAt && !item.deleted_at && item.status !== "archived");
}

function renderLinkedGroup(label, items, getTitle) {
  return `<div class="idp-focus-links-group"><h4>${label} <span>${items.length}</span></h4>
    ${items.length ? `<ul>${items.map((item) => `<li>${escape(getTitle(item))}</li>`).join("")}</ul>` : '<p class="idp-focus-no-links">None linked</p>'}
  </div>`;
}

function renderCard(focus, detail, selectedId, expandedId, canEdit, summary) {
  const id = escape(focus.id);
  const expanded = focus.id === expandedId;
  const level = focusLevel(focus);
  const description = summary(focus);
  const goals = linkedItems(detail, focus.id, "goals");
  const observations = linkedItems(detail, focus.id, "evidence");
  const exercises = linkedItems(detail, focus.id, "interventions");
  const historical = !activeFocusStatuses.includes(focus.status);
  return `<article class="idp-focus-card ${level === "main" ? "is-main" : ""} ${expanded ? "is-expanded" : ""}">
    <div class="idp-focus-card-head">
      <span class="idp-focus-priority">${escape(focusLevels[level] || "Focus")}</span>
      ${canEdit ? `<button type="button" class="idp-focus-edit" data-idp-edit-focus="${id}" aria-label="Edit focus: ${escape(focus.title)}" title="Edit focus">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20Z"></path><path d="M13.5 6 18 10.5"></path></svg>
      </button>` : ""}
    </div>
    <button type="button" class="idp-focus-card-select" data-idp-select-focus="${id}" aria-pressed="${focus.id === selectedId}" aria-expanded="${expanded}" aria-controls="idp-focus-detail-${id}">
      <h3>${escape(focus.title || "Untitled focus")}</h3>
      <span class="idp-focus-card-description">${escape(description)}</span>
      <span class="idp-focus-card-footer"><span>${escape(focus.category || "")}${historical ? ` &middot; ${escape(focus.status)}` : ""}</span><span class="idp-focus-disclosure">${expanded ? "Less" : "Details"} <span aria-hidden="true">${expanded ? "&#8722;" : "+"}</span></span></span>
    </button>
    <div class="idp-focus-card-detail" id="idp-focus-detail-${id}" ${expanded ? "" : "hidden"}>
      ${renderLinkedGroup("Goals", goals, (item) => item.title || "Untitled goal")}
      ${renderLinkedGroup("Observations", observations, (item) => item.note || item.evidenceType || "Observation")}
      ${renderLinkedGroup("Exercises", exercises, (item) => item.title || "Individual exercise")}
    </div>
  </article>`;
}

export function renderFocusOverview(detail, { selectedId = "", expandedId = "", canEdit = false, inactive = false, summary = (focus) => focus.description || "", strengths = [] } = {}) {
  const focuses = orderedFocuses(detail);
  const isPrevious = (focus) => ["Completed", "Archived"].includes(focus.status);
  const active = focuses.filter((focus) => !isPrevious(focus));
  const history = focuses.filter(isPrevious);
  const card = (focus) => renderCard(focus, detail, selectedId, expandedId, canEdit && !inactive, summary);
  return `<section class="idp-focus-overview idp-current-focus-card" aria-label="Development focuses">
    <header class="idp-focus-overview-head"><h2>Development focuses <span>${active.length}</span></h2>
      ${canEdit && !inactive && availableFocusLevels(detail).length ? '<button type="button" data-idp-action="new-focus"><span aria-hidden="true">+</span> Add focus</button>' : ""}
    </header>
    ${active.length ? `<div class="idp-focus-card-grid">${active.map(card).join("")}</div>` : `<p class="idp-focus-empty">${inactive ? "No active IDP" : "No active focus yet"}</p>`}
    ${history.length ? `<details class="idp-focus-history" ${history.some((focus) => focus.id === expandedId) ? "open" : ""}><summary>Previous focuses (${history.length})</summary><div class="idp-focus-card-grid">${history.map(card).join("")}</div></details>` : ""}
    ${strengths.length ? `<div class="idp-focus-strengths"><span>Player strengths</span><div class="idp-strength-row">${strengths.map((item) => `<span>${escape(item)}</span>`).join("")}</div></div>` : ""}
  </section>`;
}
