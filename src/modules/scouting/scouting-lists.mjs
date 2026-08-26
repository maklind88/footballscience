export function renderScoutingListsWorkspace(deps = {}) {
  const state = deps.ensureState();
  const canEdit = deps.canEdit();
  const favoriteRecordIds = deps.normalizeRecordIds(state.favoriteRecordIds);
  const lists = Array.isArray(state.lists) ? state.lists : [];
  const escapeHtml = deps.escapeHtml;
  const renderStoredPlayerButton = deps.renderStoredPlayerButton;
  return `
    <section class="scouting-lists-panel">
      <header class="scouting-section-head">
        <div>
          <p class="placeholder-tag">Saved scouting</p>
          <h2>Lists</h2>
        </div>
        <span>${lists.length + 1} ${lists.length ? "collections" : "collection"}</span>
      </header>
      ${
        canEdit
          ? `
            <form class="scouting-list-form" data-scouting-list-form>
              <input name="name" placeholder="Name a new scouting list" required />
              <button type="submit" class="scouting-primary-button">Create list</button>
            </form>
          `
          : ""
      }
      <div class="scouting-list-grid">
        <article class="scouting-list-card is-featured">
          <div>
            <p class="placeholder-tag">Favorites</p>
            <h2>${favoriteRecordIds.length} players</h2>
          </div>
          <div class="scouting-list-players">
            ${
              favoriteRecordIds.length
                ? favoriteRecordIds
                    .slice(0, 16)
                    .map((recordId) => renderStoredPlayerButton(recordId, state, "position"))
                    .join("")
                : `<div class="scouting-list-empty"><strong>No favorite players</strong><button type="button" class="scouting-secondary-button" data-scouting-open-database>Open database</button></div>`
            }
          </div>
        </article>
        ${lists
          .map((list) => {
            const recordIds = deps.normalizeRecordIds(list.recordIds);
            return `
              <article class="scouting-list-card">
                <div class="scouting-list-card-head">
                  <div>
                    <p class="placeholder-tag">${recordIds.length} players</p>
                    <h2>${escapeHtml(list.name)}</h2>
                  </div>
                  ${
                    canEdit
                      ? `
                        <details class="scouting-list-menu">
                          <summary aria-label="List actions for ${escapeHtml(list.name)}">...</summary>
                          <div>
                            <button type="button" data-delete-scouting-list="${escapeHtml(list.id)}">Delete list</button>
                          </div>
                        </details>
                      `
                      : ""
                  }
                </div>
                <div class="scouting-list-players">
                  ${
                    recordIds.length
                      ? recordIds
                          .slice(0, 16)
                          .map((recordId) => renderStoredPlayerButton(recordId, state, "team"))
                          .join("")
                      : `<div class="scouting-list-empty"><strong>No players saved</strong><button type="button" class="scouting-secondary-button" data-scouting-open-database>Open database</button></div>`
                  }
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
  </section>
  `;
}

export function handleScoutingListsClick(event, deps = {}) {
  const target = event.target;
  const openDatabaseTrigger = target.closest("[data-scouting-open-database]");
  if (openDatabaseTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.setActiveTab?.("database");
    return true;
  }
  const deleteListTrigger = target.closest("[data-delete-scouting-list]");
  if (deleteListTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.deleteList(deleteListTrigger.dataset.deleteScoutingList);
    return true;
  }
  const addToListTrigger = target.closest("[data-add-scouting-record-to-list]");
  if (addToListTrigger) {
    event.stopPropagation();
    const listSelect = deps.getWorkspaceRoot()?.querySelector("[data-scouting-profile-list]");
    deps.addRecordToList(addToListTrigger.dataset.addScoutingRecordToList, listSelect?.value);
    return true;
  }
  return false;
}

export function handleScoutingListsSubmit(event, deps = {}) {
  const listForm = event.target.closest("[data-scouting-list-form]");
  if (!listForm) {
    return false;
  }
  event.preventDefault();
  deps.createList(new FormData(listForm).get("name"));
  return true;
}
