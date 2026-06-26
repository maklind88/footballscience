function callOptional(fn, ...args) {
  return typeof fn === "function" ? fn(...args) : undefined;
}

function getWorkspace(deps = {}) {
  return deps.workspaceElement ?? null;
}

function getStateValue(state = {}, key, fallback = undefined) {
  const getter = state[`get${key}`];
  return typeof getter === "function" ? getter() : fallback;
}

function setStateValue(state = {}, key, value) {
  const setter = state[`set${key}`];
  if (typeof setter === "function") {
    setter(value);
  }
}

export function bindPlayerProfileRuntimeBindings(deps = {}) {
  const workspaceElement = getWorkspace(deps);
  if (!workspaceElement?.addEventListener) {
    return {};
  }

  const {
    actions = {},
    helpers = {},
    state = {},
    win = globalThis,
  } = deps;

  const renderWorkspace = actions.renderPlayerProfilesWorkspace ?? (() => {});
  const renderRosterListOnly = actions.renderPlayerProfilesRosterListOnly ?? (() => {});
  const canEdit = actions.canEditPlayerProfiles ?? (() => false);

  const onClick = (event) => {
    if (event.target.matches("[data-player-profile-modal-overlay]") || event.target.closest("[data-player-profile-modal-close]")) {
      callOptional(actions.closePlayerProfileModal);
      return;
    }
    if (
      event.target.matches("[data-player-profile-new-modal-overlay]") ||
      event.target.closest("[data-player-profile-new-modal-close]")
    ) {
      callOptional(actions.closePlayerProfileNewPlayerModal);
      return;
    }
    if (event.target.closest("[data-player-profile-new-open]")) {
      callOptional(actions.openPlayerProfileNewPlayerModal);
      return;
    }
    const tabButton = event.target.closest("[data-player-profile-tab]");
    if (tabButton) {
      callOptional(actions.flushPlayerProfileAutosave);
      setStateValue(state, "PlayerProfileActiveTab", helpers.normalizePlayerProfileTab?.(tabButton.dataset.playerProfileTab));
      renderWorkspace();
      setStateValue(state, "PlayerProfileAutosaveLastSignature", helpers.getPlayerProfileFormSignature?.(workspaceElement.querySelector("#playerProfileEditForm")));
      return;
    }
    if (event.target.closest("[data-squad-data-export]")) {
      callOptional(actions.exportSquadDataFoundationJson);
      return;
    }
    if (event.target.closest("[data-squad-session-export]")) {
      callOptional(actions.exportSquadSessionPlannerCsv);
      return;
    }
    if (event.target.closest("[data-squad-data-import-open]")) {
      if (!canEdit()) {
        renderWorkspace({
          status: "warning",
          lines: ["Your role cannot import player profile changes."],
        });
        return;
      }
      workspaceElement.querySelector("[data-squad-data-import-file]")?.click();
      return;
    }
    const applyImportButton = event.target.closest("[data-player-profile-import-apply]");
    if (applyImportButton) {
      if (!canEdit()) {
        renderWorkspace({
          status: "warning",
          lines: ["Your role cannot apply player profile imports."],
        });
        return;
      }
      const pendingImport = getStateValue(state, "PendingPlayerProfileImportPlan", null);
      setStateValue(state, "PendingPlayerProfileImportPlan", null);
      if (!pendingImport || !pendingImport.canApply) {
        renderWorkspace({
          status: "warning",
          lines: ["No pending import was available to apply."],
        });
        return;
      }
      const result = actions.importSquadDataFoundationPayload?.({}, { apply: true, plan: pendingImport });
      renderWorkspace(actions.buildPlayerProfileImportFeedback?.(result));
      return;
    }
    const undoImportButton = event.target.closest("[data-player-profile-import-undo]");
    if (undoImportButton) {
      renderWorkspace(actions.applyPlayerProfileImportUndo?.());
      return;
    }
    const undoHistoryButton = event.target.closest("[data-player-profile-import-undo-history]");
    if (undoHistoryButton) {
      const requestedIndex = Number(undoHistoryButton.dataset?.playerProfileImportUndoHistory);
      if (!Number.isFinite(requestedIndex) || requestedIndex !== 0) {
        renderWorkspace({
          status: "warning",
          lines: ["Only the latest import snapshot can be undone from this view."],
        });
        return;
      }
      renderWorkspace(actions.applyPlayerProfileImportUndo?.());
      return;
    }
    const cancelImportButton = event.target.closest("[data-player-profile-import-cancel]");
    if (cancelImportButton) {
      const pendingImport = getStateValue(state, "PendingPlayerProfileImportPlan", null);
      setStateValue(state, "PendingPlayerProfileImportPlan", null);
      renderWorkspace({
        status: "warning",
        lines: ["Import preview cancelled before applying changes."],
        items: pendingImport?.rows
          ? pendingImport.rows.slice(0, 8).map(
            (entry) => `Row ${entry.row}: ${String(entry.action || "skip").toUpperCase()} ${entry.playerName || "Unknown"} (${entry.message || "skipped"})`
          )
          : [],
      });
      return;
    }
    const temporaryToggle = event.target.closest("[data-squad-temporary-toggle]");
    if (temporaryToggle) {
      event.preventDefault();
      event.stopPropagation();
      setStateValue(state, "PlayerProfilesTemporarySectionCollapsed", !getStateValue(state, "PlayerProfilesTemporarySectionCollapsed", false));
      renderRosterListOnly();
      return;
    }
    const selectButton = event.target.closest("[data-player-profile-select]");
    if (selectButton) {
      callOptional(actions.openPlayerProfileModal, selectButton.dataset.playerProfileSelect);
      return;
    }
    const removeButton = event.target.closest("[data-player-profile-remove]");
    if (!removeButton) return;
    if (!actions.isCurrentPlatformUserAdmin?.()) {
      renderWorkspace({ status: "warning", lines: ["Only team admins can remove players from Squad Room."] });
      return;
    }
    callOptional(actions.ensurePlayerProfilesState);
    const player = getStateValue(state, "PlayerProfilesState", { players: [] }).players.find((candidate) => candidate.id === removeButton.dataset.playerProfileRemove);
    if (player && win.confirm?.(`Remove ${player.name} from Player Profiles?`)) {
      const removed = actions.removePlayerProfile?.(player.id);
      setStateValue(state, "PlayerProfileModalOpen", false);
      setStateValue(state, "PlayerProfileNewPlayerModalOpen", false);
      renderWorkspace(removed ? "Player removed." : { status: "warning", lines: ["Only team admins can remove players from Squad Room."] });
    }
  };

  const onInput = (event) => {
    const searchInput = event.target.closest("[data-player-profile-search]");
    if (searchInput) {
      setStateValue(state, "PlayerProfilesSearchQuery", searchInput.value);
      renderRosterListOnly();
      return;
    }
    const editForm = event.target.closest("#playerProfileEditForm");
    if (editForm) {
      const label = event.target.type === "range" ? event.target.closest("label")?.querySelector("strong") : null;
      if (label) label.textContent = `${event.target.value}/5`;
      if (event.target.matches('textarea[name="coachNotes"], input[name="temporaryGroup"], input[name="temporaryFrom"], input[name="temporaryTo"]')) {
        actions.savePlayerProfileEditForm?.(editForm);
      } else {
        actions.queuePlayerProfileAutosave?.(editForm);
      }
    }
  };

  const onChange = (event) => {
    const teamLogoInput = event.target.closest("[data-squad-team-logo-upload]");
    if (teamLogoInput) {
      const file = teamLogoInput.files?.[0] ?? null;
      teamLogoInput.value = "";
      void actions.uploadSquadTeamLogo?.(file);
      return;
    }
    const playerPhotoInput = event.target.closest("[data-player-profile-photo-upload]");
    if (playerPhotoInput) {
      const playerId = playerPhotoInput.dataset.playerProfilePhotoUpload || "";
      const file = playerPhotoInput.files?.[0] ?? null;
      playerPhotoInput.value = "";
      actions.flushPlayerProfileAutosave?.();
      if (typeof actions.uploadPlayerProfilePhoto === "function") {
        void actions.uploadPlayerProfilePhoto(playerId, file);
      } else {
        callOptional(actions.handlePhotoInput, playerPhotoInput);
      }
      return;
    }
    const editForm = event.target.closest("#playerProfileEditForm");
    if (editForm) {
      if (
        event.target.matches('select[name="rosterType"]')
        || event.target.matches('select[name="status"]')
        || event.target.matches('select[name="squadStatus"]')
      ) {
        const result = actions.savePlayerProfileEditForm?.(editForm);
        if (result?.ok) {
          renderWorkspace();
        } else if (result) {
          renderWorkspace(actions.buildPlayerProfileOperationFeedback?.(result, "Player profile could not be saved."));
        }
        return;
      }
      actions.queuePlayerProfileAutosave?.(editForm, 0);
      return;
    }
    const importInput = event.target.closest("[data-squad-data-import-file]");
    if (importInput) {
      const file = importInput.files?.[0] ?? null;
      importInput.value = "";
      actions.importSquadDataFoundationFile?.(file);
      return;
    }
    const roleGroupFilter = event.target.closest("[data-player-profile-role-group-filter]");
    if (roleGroupFilter) {
      setStateValue(state, "PlayerProfilesRoleGroupFilter", roleGroupFilter.value);
      renderWorkspace();
      return;
    }
    const rosterFilter = event.target.closest("[data-player-profile-roster-filter]");
    if (rosterFilter) {
      setStateValue(state, "PlayerProfilesRosterFilter", rosterFilter.value);
      renderWorkspace();
    }
  };

  const onKeydown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const selectRow = event.target.closest("[data-player-profile-select]");
    if (!selectRow) {
      return;
    }
    event.preventDefault();
    selectRow.click();
  };

  const onSubmit = (event) => {
    const newPlayerForm = event.target.closest("#playerProfileNewPlayerForm");
    if (newPlayerForm) {
      event.preventDefault();
      if (!canEdit()) {
        return;
      }
      const result = actions.addPlayerProfile?.(actions.getPlatformFormValues?.(newPlayerForm));
      const player = result?.player ?? null;
      if (result?.ok) {
        setStateValue(state, "PlayerProfileNewPlayerModalOpen", false);
      }
      renderWorkspace(
        actions.buildPlayerProfileOperationFeedback?.(
          result,
          player
            ? `${helpers.isTemporaryPlayerProfile?.(player) ? "Temporary player added. Planner placement is ready without Medical clearance." : "Player added. Medical roster slot and planner placement are ready for clearance."}`
            : "Could not add player profile."
        )
      );
      if (result?.ok) {
        newPlayerForm.reset();
      }
      return;
    }
    const editForm = event.target.closest("#playerProfileEditForm");
    if (!editForm) {
      return;
    }
    event.preventDefault();
    if (!canEdit()) {
      return;
    }
    const result = actions.savePlayerProfileEditForm?.(editForm);
    if (result && !result.ok) renderWorkspace(actions.buildPlayerProfileOperationFeedback?.(result, "Player profile could not be saved."));
  };

  workspaceElement.addEventListener("click", onClick);
  workspaceElement.addEventListener("input", onInput);
  workspaceElement.addEventListener("change", onChange);
  workspaceElement.addEventListener("keydown", onKeydown);
  workspaceElement.addEventListener("submit", onSubmit);

  return { click: onClick, input: onInput, change: onChange, keydown: onKeydown, submit: onSubmit };
}
