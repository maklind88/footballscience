export function renderScoutingMyTeamWorkspace(deps = {}) {
  const state = deps.ensureState();
  const canEdit = deps.canEdit();
  const players = deps.getMyTeamPlayers();
  const myTeam = deps.getMyTeamState(state);
  const assignedIds = deps.getMyTeamAssignedIds(state);
  const roleModelCount = deps.getRoleModels(state).length;
  const benchPlayers = players.filter((player) => !assignedIds.has(deps.getMyTeamPlayerId(player)));
  const pitchHeightRem = deps.getUnifiedPitchHeightRem(
    deps.shadowSlots.map((slot) => deps.normalizeMyTeamSlotPlayerIds(myTeam.slots[slot.id]).length),
    assignedIds.size
  );
  return `
    <section class="scouting-shadow-layout scouting-my-team-layout">
      <div class="scouting-shadow-pitch scouting-my-team-pitch ${deps.escapeHtml(deps.getPitchFormationClass(myTeam.formation))}" style="--my-team-pitch-height:${pitchHeightRem}rem;" aria-label="My Team ${deps.escapeHtml(myTeam.formation)}">
        ${deps.renderPitchFormationToolbar(myTeam.formation, "data-scouting-my-team-formation", canEdit, { right: true })}
        <span class="scouting-pitch-line is-half"></span>
        <span class="scouting-pitch-line is-box-top"></span>
        <span class="scouting-pitch-line is-box-bottom"></span>
        ${deps.shadowSlots
          .map((slot) => {
            const pitchPosition = deps.getMyTeamSlotPitchPosition(slot, myTeam.formation);
            const slotPlayerIds = deps.normalizeMyTeamSlotPlayerIds(myTeam.slots[slot.id]);
            const slotPlayers = slotPlayerIds.map((playerId) => deps.getMyTeamPlayerById(playerId, players)).filter(Boolean);
            return `
              <article class="scouting-shadow-slot scouting-my-team-slot${slotPlayers.length ? " is-filled" : ""}${deps.selectedMyTeamPlayerId ? " is-ready-to-drop" : ""}" style="--x:${pitchPosition.x}%;--y:${pitchPosition.y}%;" data-my-team-slot-role="${deps.escapeHtml(slot.id)}" data-scouting-my-team-drop-slot="${deps.escapeHtml(slot.id)}" data-assign-scouting-my-team-slot="${deps.escapeHtml(slot.id)}">
                <span class="scouting-my-team-slot-pin" draggable="false" data-scouting-drag-my-team-slot="${deps.escapeHtml(slot.id)}" aria-label="Move ${deps.escapeHtml(slot.label)} position"></span>
                ${
                  slotPlayers.length
                    ? `
                      <div class="scouting-my-team-slot-card">
                        <div class="scouting-my-team-slot-head">
                          <span class="scouting-my-team-slot-role">${deps.escapeHtml(slot.label)}</span>
                          <small>${slotPlayers.length} ${slotPlayers.length === 1 ? "player" : "players"}</small>
                        </div>
                        <div class="scouting-my-team-slot-stack">
                          ${slotPlayers
                            .map((player) => {
                              const playerId = deps.getMyTeamPlayerId(player);
                              return `
                                <div class="scouting-my-team-slot-entry" data-scouting-my-team-drop-slot="${deps.escapeHtml(slot.id)}" data-scouting-my-team-drop-before="${deps.escapeHtml(playerId)}">
                                  ${deps.renderMyTeamPlayerCard(player, { compact: true, slot })}
                                </div>
                              `;
                            })
                            .join("")}
                        </div>
                        ${canEdit ? `<button type="button" class="scouting-my-team-add-to-slot" data-assign-scouting-my-team-slot="${deps.escapeHtml(slot.id)}">+ Add player</button>` : ""}
                      </div>
                    `
                    : `
                      <button type="button" class="scouting-my-team-drop-card" data-assign-scouting-my-team-slot="${deps.escapeHtml(slot.id)}" aria-label="Drop squad player on ${deps.escapeHtml(slot.label)}">
                        <span>${deps.escapeHtml(slot.label)}</span>
                        <strong>Drop player</strong>
                      </button>
                    `
                }
              </article>
            `;
          })
          .join("")}
      </div>
      <aside class="scouting-shadow-side scouting-my-team-side">
        <div class="scouting-shadow-card scouting-my-team-tools">
          <div class="scouting-shadow-card-head">
            <p class="placeholder-tag">Team baseline</p>
            <span>${roleModelCount}</span>
          </div>
          <button type="button" class="scouting-primary-button" data-open-scouting-role-models>${roleModelCount ? "Manage role models" : "Create role model"}</button>
        </div>
        <div class="scouting-shadow-card">
          <div class="scouting-shadow-card-head">
            <p class="placeholder-tag">Squad players</p>
            <span>${players.length}</span>
          </div>
          <div class="scouting-my-team-player-list" data-scouting-my-team-bench-drop>
            ${
              benchPlayers.length
                ? benchPlayers.map((player) => deps.renderMyTeamPlayerCard(player)).join("")
                : players.length
                  ? `<p class="scouting-muted">All available players are placed on the pitch.</p>`
                  : `<p class="scouting-muted">No current squad players found in Player Profiles yet.</p>`
            }
          </div>
        </div>
      </aside>
    </section>
  `;
}

export function handleScoutingMyTeamClick(event, deps = {}) {
  const target = event.target;
  const openRoleModelsTrigger = target.closest("[data-open-scouting-role-models]");
  if (openRoleModelsTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.openRoleModels();
    return true;
  }
  const closeRoleModelsTrigger = target.closest("[data-close-scouting-role-models]");
  if (closeRoleModelsTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.closeRoleModels();
    return true;
  }
  const newRoleModelTrigger = target.closest("[data-new-scouting-role-model]");
  if (newRoleModelTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.openRoleModels("");
    return true;
  }
  const editRoleModelTrigger = target.closest("[data-edit-scouting-role-model]");
  if (editRoleModelTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.openRoleModels(editRoleModelTrigger.dataset.editScoutingRoleModel);
    return true;
  }
  const addMetricTrigger = target.closest("[data-add-scouting-role-model-metric]");
  if (addMetricTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.addRoleModelMetricFromPicker(addMetricTrigger.closest("[data-scouting-role-model-form]"));
    return true;
  }
  const removeMetricTrigger = target.closest("[data-remove-role-model-metric]");
  if (removeMetricTrigger) {
    event.preventDefault();
    event.stopPropagation();
    deps.setRoleModelMetricRowSelected(removeMetricTrigger.closest("[data-role-model-metric-row]"), false);
    return true;
  }
  const roleModelOverlay = target.closest("[data-scouting-role-model-overlay]");
  if (roleModelOverlay && target === roleModelOverlay) {
    deps.closeRoleModels();
    return true;
  }
  const removeRoleModelTrigger = target.closest("[data-remove-scouting-role-model]");
  if (removeRoleModelTrigger) {
    if (!deps.canEdit()) {
      return true;
    }
    deps.removeRoleModel(removeRoleModelTrigger.dataset.removeScoutingRoleModel);
    return true;
  }
  const removeSlotTrigger = target.closest("[data-remove-scouting-my-team-slot]");
  if (removeSlotTrigger) {
    event.stopPropagation();
    deps.removeMyTeamPlayerFromSlot(removeSlotTrigger.dataset.removeScoutingMyTeamSlot, removeSlotTrigger.dataset.removeScoutingMyTeamPlayer || "");
    return true;
  }
  const selectPlayerTrigger = target.closest("[data-select-scouting-my-team-player]");
  if (selectPlayerTrigger && !target.closest("button, details, summary, a, input, select, textarea")) {
    if (!deps.canEdit()) {
      return true;
    }
    const playerId = selectPlayerTrigger.dataset.selectScoutingMyTeamPlayer || "";
    deps.setMyTeamSelectedPlayerId(playerId);
    const root = deps.getWorkspaceRoot();
    root?.querySelectorAll("[data-select-scouting-my-team-player].is-selected").forEach((playerNode) => {
      playerNode.classList.remove("is-selected");
    });
    selectPlayerTrigger.classList.add("is-selected");
    root?.querySelectorAll(".scouting-my-team-slot").forEach((slotNode) => {
      slotNode.classList.toggle("is-ready-to-drop", Boolean(playerId));
    });
    return true;
  }
  const assignSlotTrigger = target.closest("[data-assign-scouting-my-team-slot]");
  if (assignSlotTrigger) {
    if (target.closest("details, summary, [data-open-scouting-role-models], [data-remove-scouting-my-team-slot], .scouting-my-team-info-trigger, [data-scouting-drag-my-team-slot]")) {
      return true;
    }
    event.preventDefault();
    event.stopPropagation();
    if (deps.getMyTeamSelectedPlayerId()) {
      deps.assignMyTeamPlayerToSlot(deps.getMyTeamSelectedPlayerId(), assignSlotTrigger.dataset.assignScoutingMyTeamSlot);
    }
    return true;
  }
  return false;
}

export function handleScoutingMyTeamChange(event, deps = {}) {
  const target = event.target;
  const roleMetricCheckbox = target.closest("[data-role-model-metric-checkbox]");
  if (roleMetricCheckbox) {
    deps.setRoleModelMetricRowSelected(roleMetricCheckbox.closest("[data-role-model-metric-row]"), roleMetricCheckbox.checked);
    return true;
  }
  const formationTrigger = target.closest("[data-scouting-my-team-formation]");
  if (formationTrigger) {
    deps.setMyTeamFormation(formationTrigger.value);
    return true;
  }
  return false;
}

export function handleScoutingMyTeamSubmit(event, deps = {}) {
  const form = event.target.closest("[data-scouting-role-model-form]");
  if (!form) {
    return false;
  }
  if (!deps.canEdit()) {
    return true;
  }
  event.preventDefault();
  const formData = new FormData(form);
  const selectedMetricIds = formData.getAll("metricIds").map((metricId) => deps.normalizeText(metricId, 120)).filter(Boolean);
  const roleMetrics = selectedMetricIds.map((metricId) => ({
    metricId,
    direction: formData.get(`metricDirection:${metricId}`),
    minPercentile: formData.get(`metricThreshold:${metricId}`) || formData.get("minPercentile"),
    weight: formData.get(`metricWeight:${metricId}`),
  }));
  deps.createRoleModel({
    id: formData.get("id"),
    name: formData.get("name"),
    slotId: formData.get("slotId"),
    metricId: selectedMetricIds[0],
    minPercentile: formData.get("minPercentile"),
    metrics: roleMetrics,
    searchIntent: formData.get("searchIntent"),
    notes: formData.get("notes"),
  });
  return true;
}
