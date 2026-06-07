import { sessionPlannerLibrarySortOptions } from "./exercise-library-state.mjs";

function defaultEscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function defaultNormalizeTimestamp(value) {
  const timestamp = typeof value === "number" ? value : new Date(value || 0).getTime();
  return Number.isFinite(timestamp) && timestamp ? new Date(timestamp).toISOString() : "";
}

function defaultNormalizeList(value) {
  return Array.isArray(value) ? value : [];
}

export function createExerciseLibraryRenderer(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const normalizeTimestamp =
    typeof options.normalizeTimestamp === "function" ? options.normalizeTimestamp : defaultNormalizeTimestamp;
  const normalizeTags = typeof options.normalizeTags === "function" ? options.normalizeTags : defaultNormalizeList;
  const normalizeFolderExerciseIds =
    typeof options.normalizeFolderExerciseIds === "function" ? options.normalizeFolderExerciseIds : defaultNormalizeList;
  const getReviewNotes = typeof options.getReviewNotes === "function" ? options.getReviewNotes : () => [];
  const getMultiValueSummary =
    typeof options.getMultiValueSummary === "function" ? options.getMultiValueSummary : (value, fallback = "") => value || fallback;
  const canEdit = typeof options.canEdit === "function" ? options.canEdit : () => false;
  const getState = typeof options.getState === "function" ? options.getState : () => ({});
  const sortOptions = Array.isArray(options.sortOptions) ? options.sortOptions : sessionPlannerLibrarySortOptions;

  function readContext() {
    return {
      archiveView: "active",
      editingFolderId: "",
      filterOpen: "",
      searchQuery: "",
      selectedFolderId: "all",
      sortMode: "updated",
      pendingSave: null,
      getFilterValues: () => [],
      getArchiveCounts: () => ({ active: 0, archived: 0 }),
      normalizeSortMode: (value) => String(value || "updated"),
      getFolderName: () => "All Exercises",
      getFolderCount: () => 0,
      getVisibleFolders: () => [],
      getArchivedFolders: () => [],
      getCurrentUserId: () => "",
      isFolderArchived: () => false,
      isExerciseArchived: () => false,
      canRemoveFromSelectedFolder: () => false,
      getSelectedFolder: () => null,
      getFilteredExercises: () => [],
      getEditExercise: () => null,
      getViewExercise: () => null,
      getOptionValues: () => [],
      ...getState(),
    };
  }

  function formatDate(value = "") {
    const timestamp = normalizeTimestamp(value);
    if (!timestamp) {
      return "";
    }
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(timestamp));
  }

  function formatDateTime(value = "") {
    const timestamp = normalizeTimestamp(value);
    if (!timestamp) {
      return "";
    }
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  }

  function formatTags(value) {
    return normalizeTags(value).join(", ");
  }

  function renderFilter(label, filterKey, options = []) {
    const context = readContext();
    const selectedValues = context.getFilterValues(filterKey);
    const selectedSet = new Set(selectedValues);
    const isOpen = context.filterOpen === filterKey;
    const summaryLabel = selectedValues.length ? selectedValues.join(", ") : `All ${label.toLowerCase()}s`;
    return `
    <div class="session-library-filter${isOpen ? " is-open" : ""}">
      <span>${escapeHtml(label)}</span>
      <button
        type="button"
        class="session-library-filter-trigger${selectedValues.length ? " has-value" : ""}"
        data-session-library-filter-toggle="${escapeHtml(filterKey)}"
        aria-expanded="${isOpen ? "true" : "false"}"
      >
        <span>${escapeHtml(summaryLabel)}</span>
        <small>${selectedValues.length || "All"}</small>
      </button>
      ${
        isOpen
          ? `
<div class="session-library-filter-menu">
<button
type="button"
class="session-library-filter-clear"
data-session-library-filter-clear="${escapeHtml(filterKey)}"
>
Clear selection
</button>
${
options.length
? options
.map((option) => {
const selected = selectedSet.has(option);
return `
                          <button
                            type="button"
                            class="session-library-filter-option${selected ? " is-selected" : ""}"
                            data-session-library-filter-option="${escapeHtml(filterKey)}"
                            data-session-library-filter-value="${escapeHtml(option)}"
                            aria-pressed="${selected ? "true" : "false"}"
                          >
                            <i>${selected ? "&#10003;" : ""}</i>
                            <span>${escapeHtml(option)}</span>
                          </button>
                        `;
})
.join("")
: `<p class="session-library-filter-empty">No values yet</p>`
}
</div>
`
          : ""
      }
    </div>
  `;
  }

  function renderArchiveTabs() {
    const context = readContext();
    const counts = context.getArchiveCounts();
    const tabs = [
      ["active", `Active ${counts.active}`],
      ["archived", `Archive ${counts.archived}`],
    ];
    return `
    <div class="session-library-archive-tabs" role="tablist" aria-label="Library status">
      ${tabs
        .map(([value, label]) => `
<button
type="button"
class="${context.archiveView === value ? "is-active" : ""}"
data-session-library-archive-view="${escapeHtml(value)}"
role="tab"
aria-selected="${context.archiveView === value ? "true" : "false"}"
>
${escapeHtml(label)}
</button>
`)
        .join("")}
    </div>
  `;
  }

  function renderSortControl() {
    const context = readContext();
    const sortMode = context.normalizeSortMode(context.sortMode);
    return `
    <label class="session-library-sort">
      <span>Sort</span>
      <select data-session-library-sort aria-label="Sort exercises">
        ${sortOptions
          .map((option) => `
<option value="${escapeHtml(option.value)}"${option.value === sortMode ? " selected" : ""}>
${escapeHtml(option.label)}
</option>
`)
          .join("")}
      </select>
    </label>
  `;
  }

  function getCountLabel(count) {
    const context = readContext();
    const statusLabel = context.archiveView === "archived" ? "archived " : "";
    const folderName = context.getFolderName();
    const folderLabel = context.selectedFolderId === "all" ? "" : ` in ${folderName}`;
    return `${count} ${statusLabel}exercise${count === 1 ? "" : "s"}${folderLabel}`;
  }

  function renderFolderButton(folderId, label, count, options = {}) {
    const context = readContext();
    const isSelected = context.selectedFolderId === folderId;
    return `
    <button
      type="button"
      class="session-library-folder-button${isSelected ? " is-selected" : ""}${options.drop ? " is-droppable" : ""}"
      data-session-library-folder="${escapeHtml(folderId)}"
      ${options.drop ? `data-session-library-folder-drop="${escapeHtml(folderId)}"` : ""}
      aria-pressed="${isSelected ? "true" : "false"}"
    >
      <span>${escapeHtml(label)}</span>
      <small>${count}</small>
    </button>
  `;
  }

  function renderFolderEditForm(folder) {
    return `
    <form
      class="session-library-folder-form session-library-folder-edit-form"
      data-session-library-folder-edit-form="${escapeHtml(folder.id)}"
    >
      <input
        type="text"
        value="${escapeHtml(folder.name)}"
        maxlength="80"
        data-session-library-folder-edit-name
        aria-label="Folder name"
      />
      <select data-session-library-folder-edit-visibility aria-label="Folder visibility">
        <option value="team"${folder.visibility === "team" ? " selected" : ""}>Team</option>
        <option value="personal"${folder.visibility === "personal" ? " selected" : ""}>Personal</option>
      </select>
      <div class="session-library-folder-form-actions">
        <button type="submit">Save</button>
        <button
          type="button"
          class="session-library-folder-cancel"
          data-session-library-cancel-folder-edit
        >
          Cancel
        </button>
      </div>
    </form>
  `;
  }

  function renderFolderCard(folder, options = {}) {
    const context = readContext();
    const isAdmin = canEdit();
    const currentUserId = context.getCurrentUserId();
    const isArchived = options.archived ?? context.isFolderArchived(folder);
    const count = isArchived
      ? normalizeFolderExerciseIds(folder.exerciseIds).length
      : context.getFolderCount(folder.id);
    const ownerLabel = folder.visibility === "personal"
      ? folder.createdBy && folder.createdBy !== currentUserId
        ? "Personal"
        : "Mine"
      : "Team";
    const isSelected = !isArchived && context.selectedFolderId === folder.id;
    if (isAdmin && !isArchived && context.editingFolderId === folder.id) {
      return `
      <div
        class="session-library-folder-card is-editing${isSelected ? " is-selected" : ""}"
        data-session-library-folder-drop="${escapeHtml(folder.id)}"
      >
        ${renderFolderEditForm(folder)}
      </div>
    `;
    }
    return `
    <div
      class="session-library-folder-card${isSelected ? " is-selected" : ""}${isArchived ? " is-archived" : ""}"
      ${isArchived ? "" : `data-session-library-folder-drop="${escapeHtml(folder.id)}"`}
    >
      ${
        isArchived
          ? `
<div class="session-library-folder-card-main" aria-label="${escapeHtml(folder.name)}">
<span>Archived ${escapeHtml(ownerLabel)}</span>
<strong>${escapeHtml(folder.name)}</strong>
<small>${count} saved reference${count === 1 ? "" : "s"}</small>
</div>
`
          : `
<button
type="button"
class="session-library-folder-card-main"
data-session-library-folder="${escapeHtml(folder.id)}"
aria-pressed="${isSelected ? "true" : "false"}"
>
<span>${escapeHtml(ownerLabel)}</span>
<strong>${escapeHtml(folder.name)}</strong>
<small>${count} exercise${count === 1 ? "" : "s"}</small>
</button>
`
      }
      ${
        isAdmin
          ? `
<div class="session-library-folder-card-actions">
${
isArchived
? `
                    <button
                      type="button"
                      class="session-library-folder-restore"
                      data-session-library-restore-folder="${escapeHtml(folder.id)}"
                      aria-label="Restore folder ${escapeHtml(folder.name)}"
                    >
                      Restore
                    </button>
                  `
: `
                    <button
                      type="button"
                      class="session-library-folder-edit"
                      data-session-library-edit-folder="${escapeHtml(folder.id)}"
                      aria-label="Rename folder ${escapeHtml(folder.name)}"
                    >
                      Rename
                    </button>
                    ${
                      folder.source !== "default"
                        ? `
<button
type="button"
class="session-library-folder-archive"
data-session-library-archive-folder="${escapeHtml(folder.id)}"
aria-label="Archive folder ${escapeHtml(folder.name)}"
>
Archive
</button>
`
                        : ""
                    }
                  `
}
</div>
`
          : ""
      }
    </div>
  `;
  }

  function renderArchivedFolders() {
    const context = readContext();
    const archivedFolders = context.getArchivedFolders();
    if (!canEdit() || !archivedFolders.length) {
      return "";
    }
    return `
    <details class="session-library-folder-archive-panel">
      <summary>
        <span>Archived folders</span>
        <small>${archivedFolders.length}</small>
      </summary>
      <div class="session-library-folder-list">
        ${archivedFolders.map((folder) => renderFolderCard(folder, { archived: true })).join("")}
      </div>
    </details>
  `;
  }

  function renderFolders() {
    const context = readContext();
    const isAdmin = canEdit();
    const folders = context.getVisibleFolders();
    return `
    <aside class="session-library-folder-panel">
      <div class="session-library-folder-head">
        <span>Folders</span>
        <strong>${escapeHtml(context.getFolderName())}</strong>
      </div>
      <div class="session-library-folder-quick">
        ${renderFolderButton("all", "All Exercises", context.getFolderCount("all"))}
        ${renderFolderButton("team", "Team", context.getFolderCount("team"))}
        ${renderFolderButton("mine", "Mine", context.getFolderCount("mine"))}
      </div>
      ${
        isAdmin
          ? `
<form class="session-library-folder-form" data-session-library-folder-form>
<input
type="text"
placeholder="New folder..."
maxlength="80"
data-session-library-folder-name
aria-label="New folder name"
/>
<select data-session-library-folder-visibility aria-label="Folder visibility">
<option value="team">Team</option>
<option value="personal">Personal</option>
</select>
<button type="submit">Create</button>
</form>
`
          : ""
      }
      <div class="session-library-folder-list">
        ${
          folders.length
            ? folders.map((folder) => renderFolderCard(folder)).join("")
            : `<p class="session-library-folder-empty">No folders yet.</p>`
        }
      </div>
      ${renderArchivedFolders()}
    </aside>
  `;
  }

  function renderTagChips(tags) {
    const normalizedTags = normalizeTags(tags);
    if (!normalizedTags.length) {
      return "";
    }
    return `
    <div class="session-library-custom-tags" aria-label="Exercise tags">
      ${normalizedTags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}
    </div>
  `;
  }

  function renderFieldText(value, fallback = "Not set") {
    const cleanValue = String(value || "").trim();
    return cleanValue ? escapeHtml(cleanValue).replaceAll("\n", "<br>") : escapeHtml(fallback);
  }

  function renderDetail(label, value) {
    return `
    <div class="session-library-preview-detail">
      <span>${escapeHtml(label)}</span>
      <p>${renderFieldText(value)}</p>
    </div>
  `;
  }

  function renderReviewNotesPreview(exercise = {}) {
    const notes = getReviewNotes(exercise).slice(0, 6);
    if (!notes.length) {
      return renderDetail("Review Notes", "");
    }
    return `
    <div class="session-library-preview-detail session-library-review-notes">
      <span>Review Notes</span>
      ${notes
        .map((note) => {
          const noteDate = note.sessionDate ? formatDate(note.sessionDate) : formatDate(note.updatedAt);
          const title = [noteDate, note.blockTitle].filter(Boolean).join(" · ");
          return `
            <article>
              <strong>${escapeHtml(title || "Review note")}</strong>
              <p>${escapeHtml(note.notes).replaceAll("\n", "<br>")}</p>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
  }

  function renderEditField(exercise, key, label, fieldOptions = {}) {
    const value = key === "tags" ? formatTags(exercise.tags) : exercise[key] ?? "";
    const isLong = fieldOptions.long ?? true;
    const rows = fieldOptions.rows ?? 3;
    const type = fieldOptions.type || "text";
    const minAttribute = fieldOptions.min !== undefined ? `min="${escapeHtml(fieldOptions.min)}"` : "";
    const maxAttribute = fieldOptions.max !== undefined ? `max="${escapeHtml(fieldOptions.max)}"` : "";
    const stepAttribute = fieldOptions.step !== undefined ? `step="${escapeHtml(fieldOptions.step)}"` : "";
    if (isLong) {
      return `
      <label class="session-library-edit-field session-library-edit-field-long">
        <span>${escapeHtml(label)}</span>
        <textarea
          rows="${rows}"
          data-session-library-edit-field="${escapeHtml(key)}"
        >${escapeHtml(value)}</textarea>
      </label>
    `;
    }
    return `
    <label class="session-library-edit-field">
      <span>${escapeHtml(label)}</span>
      <input
        type="${escapeHtml(type)}"
        value="${escapeHtml(value)}"
        data-session-library-edit-field="${escapeHtml(key)}"
        ${minAttribute}
        ${maxAttribute}
        ${stepAttribute}
      />
    </label>
  `;
  }

  function renderEditSection(label, fields = []) {
    return `
    <section class="session-library-edit-section">
      <span>${escapeHtml(label)}</span>
      <div class="session-library-edit-grid">
        ${fields.join("")}
      </div>
    </section>
  `;
  }

  function renderEditPanel(exercise) {
    return `
    <div class="session-library-edit-panel">
      <div class="session-library-edit-head">
        <span>Edit exercise</span>
        <strong>${escapeHtml(exercise.title || "Untitled Exercise")}</strong>
      </div>
      ${renderEditSection("Identity", [
        renderEditField(exercise, "title", "Title", { long: false }),
        renderEditField(exercise, "tags", "Tags", { long: false }),
        renderEditField(exercise, "phase", "Phase", { long: false }),
        renderEditField(exercise, "subPhase", "Sub-phase", { long: false }),
      ])}
      ${renderEditSection("Load", [
        renderEditField(exercise, "minutes", "Minutes", { long: false, type: "number", min: 0 }),
        renderEditField(exercise, "intensity", "Intensity", { long: false, type: "number", min: 1, max: 5 }),
        renderEditField(exercise, "time", "Time", { long: false }),
        renderEditField(exercise, "pitchSize", "Pitch size", { long: false }),
      ])}
      ${renderEditSection("Purpose", [
        renderEditField(exercise, "focus", "Focus", { rows: 2 }),
        renderEditField(exercise, "objective", "Objective", { rows: 3 }),
        renderEditField(exercise, "why", "Why", { rows: 3 }),
      ])}
      ${renderEditSection("Setup", [
        renderEditField(exercise, "organization", "Organization", { rows: 3 }),
        renderEditField(exercise, "material", "Measure & Material", { rows: 2 }),
      ])}
      ${renderEditSection("Coaching", [
        renderEditField(exercise, "principles", "Principles & Coaching Points", { rows: 4 }),
      ])}
      <div class="session-library-preview-actions">
        <button
          type="button"
          class="session-library-use-button"
          data-session-save-library-edit="${escapeHtml(exercise.id)}"
        >
          Save changes
        </button>
        <button
          type="button"
          class="session-library-secondary-button"
          data-session-save-library-edit-copy="${escapeHtml(exercise.id)}"
        >
          Save as copy
        </button>
        <button
          type="button"
          class="session-library-secondary-button"
          data-session-cancel-library-edit
        >
          Cancel
        </button>
      </div>
    </div>
  `;
  }

  function renderEditDialog(exercise) {
    if (!exercise) {
      return "";
    }
    return `
    <div class="session-library-edit-dialog-backdrop" data-session-library-edit-dialog>
      <section class="session-library-edit-dialog" role="dialog" aria-modal="true" aria-label="Edit library exercise">
        <header class="session-library-edit-dialog-head">
          <div>
            <span>Library edit</span>
            <h3>${escapeHtml(exercise.title || "Untitled Exercise")}</h3>
          </div>
          <button type="button" class="session-library-close-button" data-session-cancel-library-edit aria-label="Close edit">Close</button>
        </header>
        ${renderEditPanel(exercise)}
      </section>
    </div>
  `;
  }

  function renderViewDialog(exercise) {
    if (!exercise) return "";
    const isAdmin = canEdit();
    const context = readContext();
    const isArchived = context.isExerciseArchived(exercise);
    const actions = isAdmin && !isArchived
      ? `<button type="button" class="session-library-use-button" data-session-use-exercise="${escapeHtml(exercise.id)}">Use</button><button type="button" class="session-library-secondary-button" data-session-edit-library-exercise="${escapeHtml(exercise.id)}">Edit</button>`
      : isAdmin && isArchived
        ? `<button type="button" class="session-library-restore-button" data-session-restore-library-exercise="${escapeHtml(exercise.id)}">Restore</button>`
        : "";
    const details = `${[
      ["Objective", exercise.objective],
      ["Why", exercise.why],
      ["Organization", exercise.organization],
      ["Measure & Material", exercise.material],
      ["Principles", exercise.principles],
      ["Pitch", exercise.pitchSize],
    ].map(([label, value]) => renderDetail(label, value)).join("")}${renderReviewNotesPreview(exercise)}`;
    return `<div class="session-library-edit-dialog-backdrop" data-session-view-dialog><section class="session-library-edit-dialog session-library-view-dialog" role="dialog" aria-modal="true" aria-label="View exercise"><header class="session-library-edit-dialog-head"><div><span>View</span><h3>${escapeHtml(exercise.title || "Untitled Exercise")}</h3></div><button type="button" class="session-library-close-button" data-session-close-view>Close</button></header><div class="session-library-preview-head"><p>${renderFieldText(exercise.focus || exercise.objective, "No description yet.")}</p></div><div class="session-library-preview-actions">${actions}</div><div class="session-library-preview-details">${details}</div></section></div>`;
  }

  function renderActionButton(exercise, label, dataAttribute, className = "session-library-secondary-button", value = exercise.id) {
    return `<button type="button" class="${className}" ${dataAttribute}="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
  }

  function renderRowActions(exercise, selectedFolder) {
    const context = readContext();
    const isArchived = context.isExerciseArchived(exercise);
    const removeButton = context.canRemoveFromSelectedFolder(exercise)
      ? `<button type="button" class="session-library-secondary-button" data-session-remove-library-exercise-from-folder="${escapeHtml(exercise.id)}" data-session-remove-library-folder="${escapeHtml(selectedFolder?.id || context.selectedFolderId)}">Remove from folder</button>`
      : "";
    return `<div class="session-library-actions">${isArchived
    ? `${renderActionButton(exercise, "View", "data-session-view-exercise")}${renderActionButton(exercise, "Restore", "data-session-restore-library-exercise", "session-library-restore-button")}`
    : `${renderActionButton(exercise, "Use", "data-session-use-exercise", "session-library-use-button")}${renderActionButton(exercise, "View", "data-session-view-exercise")}${renderActionButton(exercise, "Edit", "data-session-edit-library-exercise")}${removeButton}${renderActionButton(exercise, "Archive", "data-session-delete-library-exercise", "session-library-delete-button")}`}</div>`;
  }

  function renderList(exercises = readContext().getFilteredExercises()) {
    const context = readContext();
    const isAdmin = canEdit();
    if (!exercises.length) return `<p class="session-library-empty">No ${context.archiveView === "archived" ? "archived " : ""}exercises found for this filter.</p>`;
    return exercises.map((exercise) => {
      const isArchived = context.isExerciseArchived(exercise);
      const metaDate = formatDate(isArchived ? exercise.archivedAt : exercise.updatedAt || exercise.createdAt);
      const durationLabel = exercise.minutes ? `${exercise.minutes} min` : exercise.time || "No time";
      const selectedFolder = context.getSelectedFolder();
      const reviewNoteCount = getReviewNotes(exercise).length;
      return `<article class="session-library-item${isArchived ? " is-archived" : ""}" data-session-library-drag-exercise="${escapeHtml(exercise.id)}" draggable="${isAdmin && !isArchived ? "true" : "false"}"><div class="session-library-item-main"><strong>${escapeHtml(exercise.title || "Untitled Exercise")}</strong><div class="session-library-tags"><span>${escapeHtml(getMultiValueSummary(exercise.phase, "No phase"))}</span><span>${escapeHtml(getMultiValueSummary(exercise.subPhase, "No sub-phase"))}</span>${reviewNoteCount ? `<span>${reviewNoteCount} review note${reviewNoteCount === 1 ? "" : "s"}</span>` : ""}${isArchived ? `<span class="session-library-archive-chip">Archived</span>` : ""}</div></div><div class="session-library-row-meta"><span>${escapeHtml(durationLabel)}</span><span>${escapeHtml(metaDate)}</span></div>${isAdmin ? renderRowActions(exercise, selectedFolder) : ""}</article>`;
    }).join("");
  }

  function renderOverlay() {
    const context = readContext();
    if (!context.isOpen) {
      return "";
    }
    const filteredExercises = context.getFilteredExercises();
    const editExercise = context.getEditExercise();
    const viewExercise = context.getViewExercise();
    const phaseOptions = context.getOptionValues("phase");
    const subPhaseOptions = context.getOptionValues("subPhase");
    return `
    <div class="session-library-overlay" data-session-library-overlay>
      <section class="session-library-modal" role="dialog" aria-modal="true" aria-label="Exercise Library">
        <header class="session-library-modal-head">
          <div>
            <span>Library</span>
            <h2>Exercise Library</h2>
          </div>
          <button type="button" class="session-library-close-button" data-session-close-library aria-label="Close library">Close</button>
        </header>
        <div class="session-library-controls">
          <label class="session-library-search">
            <span>Search</span>
            <input
              type="search"
              value="${escapeHtml(context.searchQuery)}"
              placeholder="Find exercise..."
              data-session-library-search
            />
          </label>
          <div class="session-library-filter-row">
            ${renderArchiveTabs()}
            ${renderFilter("Phase", "phase", phaseOptions)}
            ${renderFilter("Sub-phase", "subPhase", subPhaseOptions)}
            ${renderSortControl()}
          </div>
          <span class="session-library-count">
            ${getCountLabel(filteredExercises.length)}
          </span>
        </div>
        <div class="session-library-modal-body">
          ${renderFolders()}
          <div class="session-library-modal-grid">
            ${renderList(filteredExercises)}
          </div>
        </div>
        ${renderEditDialog(editExercise)}
        ${renderViewDialog(viewExercise)}
      </section>
    </div>
  `;
  }

  function renderSaveConflictOverlay() {
    const context = readContext();
    if (!context.pendingSave) {
      return "";
    }
    const title = context.pendingSave.existingTitle || "Untitled Exercise";
    return `
    <div class="session-library-overlay session-save-conflict-overlay" data-session-save-conflict-overlay>
      <section class="session-library-modal session-save-conflict-modal" role="dialog" aria-modal="true" aria-label="Exercise already exists">
        <header class="session-library-modal-head">
          <div>
            <span>Library</span>
            <h2>This name already exists</h2>
          </div>
          <button
            type="button"
            class="session-library-close-button"
            data-session-save-conflict-action="cancel"
            aria-label="Cancel"
          >
            Cancel
          </button>
        </header>
        <div class="session-save-conflict-copy">
          <strong>${escapeHtml(title)}</strong>
          <p>Do you want to replace the saved exercise with your latest changes, or save this as a copy?</p>
        </div>
        <div class="session-save-conflict-actions">
          <button type="button" class="session-save-conflict-secondary" data-session-save-conflict-action="duplicate">
            Duplicate
          </button>
          <button type="button" class="session-save-conflict-primary" data-session-save-conflict-action="replace">
            Replace
          </button>
        </div>
      </section>
    </div>
  `;
  }

  function renderResults(workspace) {
    const context = readContext();
    const filteredExercises = context.getFilteredExercises();
    const libraryGrid = workspace?.querySelector(".session-library-modal-grid");
    const folderPanel = workspace?.querySelector(".session-library-folder-panel");
    const libraryModal = workspace?.querySelector(".session-library-modal");
    const editDialog = workspace?.querySelector("[data-session-library-edit-dialog]");
    const libraryCount = workspace?.querySelector(".session-library-count");
    const archiveTabs = workspace?.querySelector(".session-library-archive-tabs");
    const editExercise = context.getEditExercise();
    if (libraryGrid) {
      libraryGrid.innerHTML = renderList(filteredExercises);
    }
    if (folderPanel) {
      folderPanel.outerHTML = renderFolders();
    }
    if (editDialog) {
      if (editExercise) {
        editDialog.outerHTML = renderEditDialog(editExercise);
      } else {
        editDialog.remove();
      }
    } else if (libraryModal && editExercise) {
      libraryModal.insertAdjacentHTML("beforeend", renderEditDialog(editExercise));
    }
    if (libraryCount) {
      libraryCount.textContent = getCountLabel(filteredExercises.length);
    }
    if (archiveTabs) {
      archiveTabs.outerHTML = renderArchiveTabs();
    }
  }

  return Object.freeze({
    formatDate,
    formatDateTime,
    getCountLabel,
    renderArchiveTabs,
    renderEditDialog,
    renderFilter,
    renderFolderButton,
    renderFolderCard,
    renderFolderEditForm,
    renderFolders,
    renderList,
    renderOverlay,
    renderResults,
    renderSaveConflictOverlay,
    renderSortControl,
    renderTagChips,
    renderViewDialog,
  });
}
