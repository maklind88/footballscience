export function renderScoutingListsWorkspace(deps = {}) {
  const state = deps.ensureState();
  const canEdit = deps.canEdit();
  const favoriteRecordIds = deps.normalizeRecordIds(state.favoriteRecordIds);
  const lists = Array.isArray(state.lists) ? state.lists : [];
  const escapeHtml = deps.escapeHtml;
  const renderStoredPlayerButton = deps.renderStoredPlayerButton;
  return `
    <section class="scouting-lists-panel">
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
                : `<p class="scouting-muted">Favorites become your master live watchlist.</p>`
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
                      : `<p class="scouting-muted">Add players from a scouting profile.</p>`
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
