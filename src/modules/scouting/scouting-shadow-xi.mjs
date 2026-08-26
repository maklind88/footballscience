export function renderScoutingShadowXiWorkspace(deps = {}) {
  const state = deps.ensureState();
  const canEdit = deps.canEdit();
  const favoriteSearchQuery = deps.normalizeText(deps.shadowFavoriteSearchQuery, 80).toLowerCase();
  const favoriteRecordIds = deps.normalizeRecordIds(state.favoriteRecordIds);
  const allFavoriteRecords = favoriteRecordIds
    .map((recordId) => deps.getStoredPlayerRecord(recordId, state))
    .filter(Boolean);
  const favoriteRecords = allFavoriteRecords
    .filter((record) => {
      if (!favoriteSearchQuery) {
        return true;
      }
      return [deps.getRecordName(record), deps.getRecordTeam(record), deps.getRecordPosition(record), deps.getRecordLeague(record)]
        .join(" ")
        .toLowerCase()
        .includes(favoriteSearchQuery);
    })
    .slice(0, 30);
  const selectedSlotId = deps.getSelectedShadowSlotId(state);
  const shadowBoards = deps.getShadowBoards(state);
  const activeShadowBoardId = deps.normalizeText(state.shadowXi?.activeBoardId, 100) || shadowBoards[0]?.id || "default-shadow-xi";
  const shadowSlotDepths = deps.shadowSlots.map((slot) => deps.getShadowSlotRecordIds(slot.id, state).length);
  const totalShadowTargets = shadowSlotDepths.reduce((sum, count) => sum + count, 0);
  const shadowPitchHeightRem = deps.getUnifiedPitchHeightRem(shadowSlotDepths, totalShadowTargets);
  return `
    <section class="scouting-shadow-layout">
      <div class="scouting-shadow-pitch scouting-my-team-pitch ${deps.escapeHtml(deps.getPitchFormationClass(state.shadowXi.formation))}" style="--scouting-shadow-pitch-height:${shadowPitchHeightRem}rem;--my-team-pitch-height:${shadowPitchHeightRem}rem;" aria-label="Shadow eleven ${deps.escapeHtml(state.shadowXi.formation)}">
        ${deps.renderPitchFormationToolbar(state.shadowXi.formation, "data-scouting-formation", canEdit)}
        <span class="scouting-pitch-line is-half"></span>
        <span class="scouting-pitch-line is-box-top"></span>
        <span class="scouting-pitch-line is-box-bottom"></span>
        ${deps.shadowSlots
          .map((slot) => {
            const pitchPosition = deps.getShadowSlotPitchPosition(slot, state.shadowXi.formation);
            const records = deps.getShadowSlotRecords(slot.id, state);
            return `
              <article class="scouting-shadow-slot scouting-my-team-slot${records.length ? " is-filled" : ""}${selectedSlotId === slot.id ? " is-selected" : ""}" style="--x:${pitchPosition.x}%;--y:${pitchPosition.y}%;" data-shadow-slot-role="${deps.escapeHtml(slot.id)}" data-scouting-shadow-drop-slot="${deps.escapeHtml(slot.id)}">
                <span class="scouting-shadow-slot-pin" draggable="${canEdit ? "true" : "false"}" data-scouting-drag-shadow-slot="${deps.escapeHtml(slot.id)}" aria-label="Move ${deps.escapeHtml(slot.label)} position"></span>
                <div class="scouting-my-team-slot-card">
                  <button type="button" class="scouting-my-team-slot-head scouting-shadow-slot-head" data-select-scouting-shadow-slot="${deps.escapeHtml(slot.id)}">
                    <span class="scouting-my-team-slot-role">${deps.escapeHtml(slot.label)}</span>
                    <small>${records.length ? `${records.length} ${records.length === 1 ? "target" : "targets"}` : "Wishlist"}</small>
                  </button>
                  <div class="scouting-my-team-slot-stack scouting-shadow-stack">
                    ${
                      records.length
                        ? records
                            .map((record) => {
                              const recordId = deps.getRecordId(record);
                              return `
                                <div class="scouting-my-team-slot-entry scouting-shadow-player-row" data-scouting-shadow-drop-slot="${deps.escapeHtml(slot.id)}" data-scouting-shadow-drop-before="${deps.escapeHtml(recordId)}">
                                  ${deps.renderPitchRecordCard(record, { slot })}
                                </div>
                              `;
                            })
                            .join("")
                        : `<p class="scouting-shadow-empty"><strong>Empty slot</strong><span>Drag a favorite or add from player profile.</span></p>`
                    }
                  </div>
                  <button type="button" class="scouting-my-team-add-to-slot scouting-shadow-add" data-select-scouting-shadow-slot="${deps.escapeHtml(slot.id)}" ${canEdit ? "" : "disabled"}>Add player</button>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
      <aside class="scouting-shadow-side">
        <div class="scouting-shadow-card scouting-shadow-board-card">
          <div class="scouting-shadow-card-head">
            <p class="placeholder-tag">Shadow XI boards</p>
            <span>${shadowBoards.length}</span>
          </div>
          <form class="scouting-shadow-board-form" data-create-scouting-shadow-board-form>
            <input name="name" placeholder="Name new Shadow XI..." ${canEdit ? "" : "disabled"} />
            <button type="submit" ${canEdit ? "" : "disabled"}>Create</button>
          </form>
          <div class="scouting-shadow-board-list">
            ${shadowBoards
              .map(
                (board) => `
                  <article class="scouting-shadow-board-item${board.id === activeShadowBoardId ? " is-active" : ""}">
                    <button type="button" data-select-scouting-shadow-board="${deps.escapeHtml(board.id)}">
                      <strong>${deps.escapeHtml(board.name)}</strong>
                      <span>${deps.escapeHtml(board.ownerName)} &middot; ${deps.escapeHtml(deps.getShadowBoardVisibilityLabel(board.visibility))}</span>
                    </button>
                    <select data-scouting-shadow-board-visibility="${deps.escapeHtml(board.id)}" ${canEdit ? "" : "disabled"}>
                      ${deps.getShadowBoardVisibilityOptions()
                        .map((option) => `<option value="${deps.escapeHtml(option.value)}" ${deps.normalizeShadowBoardVisibility(board.visibility) === option.value ? "selected" : ""}>${deps.escapeHtml(option.label)}</option>`)
                        .join("")}
                    </select>
                  </article>
                `
              )
              .join("")}
          </div>
        </div>
        <div class="scouting-shadow-card">
          <div class="scouting-shadow-card-head">
            <p class="placeholder-tag">Favorites ready for XI</p>
            <span>${favoriteRecordIds.length}</span>
          </div>
          <input
            class="scouting-shadow-favorite-search"
            type="search"
            value="${deps.escapeHtml(deps.shadowFavoriteSearchQuery)}"
            placeholder="Search favorites..."
            data-scouting-shadow-favorite-search
          />
          <div class="scouting-mini-list scouting-shadow-favorites-list">
            ${
              favoriteRecords.length
                ? favoriteRecords
                    .map(
                      (record) => {
                        const recordId = deps.getRecordId(record);
                        return `
                        <article class="scouting-favorite-drag-card" draggable="${canEdit ? "true" : "false"}" data-scouting-drag-favorite-record="${deps.escapeHtml(recordId)}">
                          ${deps.renderRecordAvatar(record)}
                          <button type="button" data-open-scouting-record="${deps.escapeHtml(recordId)}">
                            <strong>${deps.escapeHtml(deps.getRecordName(record))}</strong>
                            <span>${deps.escapeHtml(deps.getRecordPosition(record))} / ${deps.escapeHtml(deps.getRecordTeam(record))}</span>
                          </button>
                        </article>
                      `;
                      }
                    )
                    .join("")
                : `<p class="scouting-muted">${favoriteRecordIds.length ? "No favorites match this search." : "Favorite players from the database, then drag them into Shadow XI."}</p>`
            }
          </div>
        </div>
      </aside>
    </section>
  `;
}

export function handleScoutingShadowXiClick(event, deps = {}) {
  const target = event.target;
  const selectSlotTrigger = target.closest("[data-select-scouting-shadow-slot]");
  if (selectSlotTrigger) {
    deps.selectShadowSlot(selectSlotTrigger.dataset.selectScoutingShadowSlot);
    return true;
  }
  const clearSlotTrigger = target.closest("[data-clear-scouting-shadow-slot-selection]");
  if (clearSlotTrigger) {
    deps.clearShadowSlotSelection();
    return true;
  }
  const selectBoardTrigger = target.closest("[data-select-scouting-shadow-board]");
  if (selectBoardTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.setActiveShadowBoard(selectBoardTrigger.dataset.selectScoutingShadowBoard);
    return true;
  }
  const removeRecordTrigger = target.closest("[data-remove-scouting-shadow-record]");
  if (removeRecordTrigger) {
    event.stopPropagation();
    deps.removeRecordFromShadow(
      removeRecordTrigger.dataset.removeScoutingShadowRecord,
      removeRecordTrigger.dataset.removeScoutingShadowSlot
    );
    return true;
  }
  const moveRecordTrigger = target.closest("[data-move-scouting-shadow-record]");
  if (moveRecordTrigger) {
    event.stopPropagation();
    deps.moveShadowRecord(
      moveRecordTrigger.dataset.scoutingShadowSlot,
      moveRecordTrigger.dataset.moveScoutingShadowRecord,
      moveRecordTrigger.dataset.scoutingShadowDirection
    );
    return true;
  }
  const addToShadowTrigger = target.closest("[data-add-scouting-record-to-shadow]");
  if (addToShadowTrigger) {
    event.stopPropagation();
    const slotSelect = deps.getWorkspaceRoot()?.querySelector("[data-scouting-profile-slot]");
    deps.addRecordToShadow(
      addToShadowTrigger.dataset.addScoutingRecordToShadow,
      addToShadowTrigger.dataset.scoutingShadowSlotId || slotSelect?.value
    );
    return true;
  }
  return false;
}

export function handleScoutingShadowXiInput(event, deps = {}) {
  const favoriteSearchInput = event.target.closest("[data-scouting-shadow-favorite-search]");
  if (!favoriteSearchInput) {
    return false;
  }
  deps.setShadowFavoriteSearchQuery(deps.normalizeText(favoriteSearchInput.value, 80));
  deps.renderActiveTabSurfaceOrWorkspace({ preserveFocus: true });
  return true;
}

export function handleScoutingShadowXiChange(event, deps = {}) {
  const target = event.target;
  const boardVisibilityTrigger = target.closest("[data-scouting-shadow-board-visibility]");
  if (boardVisibilityTrigger) {
    deps.setShadowBoardVisibility(boardVisibilityTrigger.dataset.scoutingShadowBoardVisibility, boardVisibilityTrigger.value);
    return true;
  }
  const shadowTagTrigger = target.closest("[data-scouting-shadow-tag]");
  if (shadowTagTrigger) {
    deps.setShadowRecordMeta(shadowTagTrigger.dataset.scoutingShadowSlot, shadowTagTrigger.dataset.scoutingShadowTag, {
      tag: shadowTagTrigger.value,
    });
    return true;
  }
  const formationTrigger = target.closest("[data-scouting-formation]");
  if (formationTrigger) {
    deps.setShadowFormation(formationTrigger.value);
    return true;
  }
  return false;
}

export function handleScoutingShadowXiSubmit(event, deps = {}) {
  const form = event.target.closest("[data-create-scouting-shadow-board-form]");
  if (!form) {
    return false;
  }
  event.preventDefault();
  deps.createShadowBoard(new FormData(form).get("name"));
  form.reset();
  return true;
}
