function defaultEscapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function defaultNormalizeMultiValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  return String(value ?? "")
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function defaultNoopArray() {
  return [];
}

export function createSessionPlannerRenderer(options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const canEdit = typeof options.canEdit === "function" ? options.canEdit : () => false;
  const normalizeMultiValue =
    typeof options.normalizeMultiValue === "function" ? options.normalizeMultiValue : defaultNormalizeMultiValue;
  const getMultiSelectOpenField =
    typeof options.getMultiSelectOpenField === "function" ? options.getMultiSelectOpenField : () => "";
  const multiSelectFields = options.multiSelectFields instanceof Set ? options.multiSelectFields : new Set();
  const getReviewNotesForBlock =
    typeof options.getReviewNotesForBlock === "function" ? options.getReviewNotesForBlock : defaultNoopArray;
  const formatLibraryDate = typeof options.formatLibraryDate === "function" ? options.formatLibraryDate : (value) => value || "";
  const getScheduleSessionEventForDate =
    typeof options.getScheduleSessionEventForDate === "function" ? options.getScheduleSessionEventForDate : () => null;

  function renderMultiSelectField(block = {}, key, label, renderOptions = {}) {
    const value = block[key] ?? "";
    const selectedValues = normalizeMultiValue(value);
    const selectedSet = new Set(selectedValues);
    const listOptions = Array.isArray(renderOptions.listOptions) ? renderOptions.listOptions.map(String) : [];
    const isOpen = getMultiSelectOpenField() === key;
    const isAdmin = canEdit();

    if (!isAdmin) {
      if (!selectedValues.length) {
        return "";
      }
      return `
      <section class="session-field-readonly">
        <span>${escapeHtml(label)}</span>
        <p>${escapeHtml(selectedValues.join(", "))}</p>
      </section>
    `;
    }

    return `
    <div class="session-builder-field session-builder-multiselect-field" data-session-multiselect="${escapeHtml(key)}">
      <span>${escapeHtml(label)}</span>
      <button
        type="button"
        class="session-multiselect-trigger${selectedValues.length ? " has-value" : ""}"
        data-session-multiselect-toggle="${escapeHtml(key)}"
        aria-expanded="${isOpen ? "true" : "false"}"
      >
        <span class="session-multiselect-value-list">
          ${
            selectedValues.length
              ? selectedValues.map((item) => `<i>${escapeHtml(item)}</i>`).join("")
              : `<em>Select ${escapeHtml(label)}</em>`
          }
        </span>
        <span class="session-multiselect-caret">⌄</span>
      </button>
      ${
        isOpen
          ? `
<div class="session-multiselect-menu">
<button
type="button"
class="session-multiselect-clear"
data-session-multiselect-clear="${escapeHtml(key)}"
>
Clear selection
</button>
${listOptions
  .map((option) => {
    const selected = selectedSet.has(option);
    return `
                    <button
                      type="button"
                      class="session-multiselect-option${selected ? " is-selected" : ""}"
                      data-session-multiselect-option="${escapeHtml(key)}"
                      data-session-multiselect-value="${escapeHtml(option)}"
                    >
                      <span class="session-multiselect-check">${selected ? "✓" : ""}</span>
                      <span>${escapeHtml(option)}</span>
                    </button>
                  `;
  })
  .join("")}
</div>
`
          : ""
      }
    </div>
  `;
  }

  function renderEditableField(block = {}, key, label, renderOptions = {}) {
    const value = block[key] ?? "";
    const isAdmin = canEdit();
    const isLong = renderOptions.long ?? true;
    const rows = renderOptions.rows ?? 3;
    const inputType = renderOptions.type ?? "text";
    const listOptions = Array.isArray(renderOptions.listOptions) ? renderOptions.listOptions : [];
    const isMultiSelect = !isLong && multiSelectFields.has(key) && listOptions.length;

    if (isMultiSelect) {
      return renderMultiSelectField(block, key, label, renderOptions);
    }

    const listId = listOptions.length ? `session-${key}-options` : "";

    if (!isAdmin) {
      if (!String(value).trim()) {
        return "";
      }
      return `
      <section class="session-field-readonly${isLong ? " session-field-long" : ""}">
        <span>${escapeHtml(label)}</span>
        <p>${escapeHtml(value).replaceAll("\n", "<br>")}</p>
      </section>
    `;
    }

    if (isLong) {
      return `
      <label class="session-builder-field session-builder-field-long">
        <span>${escapeHtml(label)}</span>
        <textarea data-session-field="${escapeHtml(key)}" rows="${rows}">${escapeHtml(value)}</textarea>
      </label>
    `;
    }

    return `
    <label class="session-builder-field">
      <span>${escapeHtml(label)}</span>
      <input
        data-session-field="${escapeHtml(key)}"
        type="${escapeHtml(inputType)}"
        value="${escapeHtml(value)}"
        ${listId ? `list="${escapeHtml(listId)}"` : ""}
      />
      ${
        listId
          ? `<datalist id="${escapeHtml(listId)}">${listOptions
              .map((option) => `<option value="${escapeHtml(String(option))}"></option>`)
              .join("")}</datalist>`
          : ""
      }
    </label>
  `;
  }

  function renderHeaderField(block = {}, key, fallback, renderOptions = {}) {
    const value = block[key] ?? "";
    const isAdmin = canEdit();
    const tag = renderOptions.tag ?? "input";
    const className = renderOptions.className ?? "";

    if (!isAdmin) {
      if (key === "title") {
        return `<h2>${escapeHtml(value || fallback)}</h2>`;
      }
      return value ? `<p>${escapeHtml(value).replaceAll("\n", "<br>")}</p>` : "";
    }

    if (tag === "textarea") {
      return `
      <textarea
        class="session-builder-header-field ${escapeHtml(className)}"
        data-session-field="${escapeHtml(key)}"
        rows="1"
        aria-label="${escapeHtml(fallback)}"
        placeholder="${escapeHtml(fallback)}"
      >${escapeHtml(value)}</textarea>
    `;
    }

    return `
    <input
      class="session-builder-header-field ${escapeHtml(className)}"
      data-session-field="${escapeHtml(key)}"
      type="text"
      value="${escapeHtml(value)}"
      aria-label="${escapeHtml(fallback)}"
      placeholder="${escapeHtml(fallback)}"
    />
  `;
  }

  function renderReviewNoteHistory(block = {}) {
    const notes = getReviewNotesForBlock(block).slice(0, 4);
    if (!notes.length) {
      return "";
    }

    return `
    <details class="session-post-notes-history">
      <summary>
        <span>Previous Review Notes</span>
        <small>${notes.length}</small>
      </summary>
      ${notes
        .map((note) => {
          const noteDate = note.sessionDate ? formatLibraryDate(note.sessionDate) : formatLibraryDate(note.updatedAt);
          const title = [noteDate, note.blockTitle].filter(Boolean).join(" · ");
          return `
            <article class="session-post-notes-history-item">
              <strong>${escapeHtml(title || "Review note")}</strong>
              <p>${escapeHtml(note.notes).replaceAll("\n", "<br>")}</p>
            </article>
          `;
        })
        .join("")}
    </details>
  `;
  }

  function renderPostSessionNotesCard(block = {}) {
    const hasCurrentNote = Boolean(String(block.postSessionNotes || "").trim());
    const previousNoteCount = getReviewNotesForBlock(block).length;

    return `
    <details class="session-detail-card session-detail-card-full session-post-notes-card">
      <summary data-session-post-notes-toggle>
        <span>Post Session Notes</span>
        <small>${hasCurrentNote ? "Reflection added" : previousNoteCount ? `${previousNoteCount} previous` : "Optional review"}</small>
      </summary>
      <div class="session-builder-fields">
        ${renderEditableField(block, "postSessionNotes", "Post Session Notes", { rows: 4 })}
      </div>
      ${renderReviewNoteHistory(block)}
    </details>
  `;
  }

  function renderBlockList(session = { blocks: [] }) {
    if (!session.blocks.length) {
      const scheduledEvent = getScheduleSessionEventForDate(session.date);
      return `
      <div class="session-block-empty">
        <strong>${scheduledEvent ? "Training is scheduled" : "No exercise blocks yet"}</strong>
        <span>${
          scheduledEvent
            ? `${escapeHtml(scheduledEvent.title)} is in Schedule. Add blocks when you are ready to build the plan.`
            : "Add a block when this date should contain a training session."
        }</span>
      </div>
    `;
    }

    const isAdmin = canEdit();
    return session.blocks
      .map((block, index) => {
        const isSelected = block.id === session.selectedBlockId;
        const blockTitle = block.title || block.label || "Empty block";
        const meta = [block.minutes ? `${block.minutes} min` : ""].filter(Boolean).join(" · ");

        return `
        <article
          class="session-block-row${isSelected ? " is-active" : ""}"
          data-session-block-drop-id="${escapeHtml(block.id)}"
          draggable="${isAdmin ? "true" : "false"}"
        >
          <button
            type="button"
            class="session-block-button${isSelected ? " is-active" : ""}"
            data-session-block-id="${escapeHtml(block.id)}"
            title="${escapeHtml(blockTitle)}"
          >
            <span>${escapeHtml(block.label)}</span>
            <strong>${escapeHtml(block.title || "Empty block")}</strong>
            <small>${escapeHtml(meta || "Ready to build")}</small>
          </button>
          ${
            isAdmin
              ? `
<div class="session-block-order-controls" aria-label="Move ${escapeHtml(blockTitle)}">
<button
type="button"
data-session-move-block="${escapeHtml(block.id)}"
data-session-move-direction="-1"
aria-label="Move ${escapeHtml(blockTitle)} up"
${index === 0 ? "disabled" : ""}
>
↑
</button>
<button
type="button"
data-session-move-block="${escapeHtml(block.id)}"
data-session-move-direction="1"
aria-label="Move ${escapeHtml(blockTitle)} down"
${index === session.blocks.length - 1 ? "disabled" : ""}
>
↓
</button>
</div>
<button
type="button"
class="session-block-delete-button"
data-session-delete-block="${escapeHtml(block.id)}"
aria-label="Delete ${escapeHtml(blockTitle)}"
>
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M9 4h6l1 2h4v2H4V6h4l1-2Z"></path>
<path d="M6.5 10h11l-.8 10H7.3l-.8-10Z"></path>
<path d="M10 12.5v5M14 12.5v5"></path>
</svg>
</button>
`
              : ""
          }
        </article>
      `;
      })
      .join("");
  }

  return {
    renderBlockList,
    renderEditableField,
    renderHeaderField,
    renderMultiSelectField,
    renderPostSessionNotesCard,
    renderReviewNoteHistory,
  };
}
