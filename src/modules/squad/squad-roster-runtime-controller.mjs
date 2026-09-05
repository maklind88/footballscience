export function createSquadRosterRuntimeController(options = {}) {
  const win = options.win ?? globalThis;
  let availabilityHydrationGeneration = 0;

  function getWorkspace() {
    return options.getWorkspace?.() || null;
  }

  function beginWorkspaceRender() {
    const workspace = getWorkspace();
    return {
      generation: ++availabilityHydrationGeneration,
      isColdWorkspaceRender: !workspace?.querySelector(".squad-board-shell"),
    };
  }

  function isWorkspaceActive() {
    const workspace = getWorkspace();
    if (!workspace?.querySelector(".squad-board-shell")) {
      return false;
    }
    const workspaceView = workspace.matches?.("[data-workspace-view]")
      ? workspace
      : workspace.closest?.("[data-workspace-view]");
    return !workspaceView || workspaceView.classList?.contains("is-active");
  }

  function restoreFocusedPlayer(listPanel, focusedPlayerId) {
    if (!focusedPlayerId) {
      return;
    }
    Array.from(listPanel.querySelectorAll("[data-player-profile-select]"))
      .find((row) => row.dataset?.playerProfileSelect === focusedPlayerId)
      ?.focus?.({ preventScroll: true });
  }

  function renderListOnly(renderOptions = {}) {
    let hydrationGeneration = Number(renderOptions.hydrationGeneration) || 0;
    if (hydrationGeneration && hydrationGeneration !== availabilityHydrationGeneration) {
      return false;
    }
    if (!hydrationGeneration) {
      hydrationGeneration = ++availabilityHydrationGeneration;
    }
    options.ensurePlayerProfilesState?.();
    if (renderOptions.medicalStateReady !== true) {
      options.ensureMedicalState?.();
    }
    const listPanel = getWorkspace()?.querySelector(".squad-list-panel");
    if (!listPanel) {
      options.renderWorkspace?.();
      return false;
    }

    const visiblePlayers = options.getVisiblePlayerProfiles?.() || [];
    const activeElement = win.document?.activeElement;
    const focusedPlayerId = activeElement && listPanel.contains(activeElement)
      ? activeElement.closest?.("[data-player-profile-select]")?.dataset?.playerProfileSelect || ""
      : "";
    const medicalSnapshotsByPlayerId = renderOptions.medicalSnapshotsByPlayerId;
    const includeTrainingAvailability = Boolean(
      medicalSnapshotsByPlayerId || renderOptions.includeTrainingAvailability === true
    );
    const medicalSnapshotContext = medicalSnapshotsByPlayerId
      ? null
      : options.createMedicalSnapshotContext?.({
          medicalStateReady: true,
          includeTrainingAvailability,
        });

    listPanel.innerHTML = options.renderRosterSections?.(visiblePlayers, {
      rosterSummary: options.getRosterSummary?.(options.getPlayers?.() || []),
      visibleSummary: options.getRosterSummary?.(visiblePlayers),
      medicalStateReady: true,
      includeTrainingAvailability,
      medicalSnapshotContext,
      medicalSnapshotsByPlayerId,
    }) || "";
    restoreFocusedPlayer(listPanel, focusedPlayerId);
    options.queueAgeHydration?.();
    if (!medicalSnapshotsByPlayerId && renderOptions.includeTrainingAvailability !== true) {
      queueAvailabilityHydration(hydrationGeneration);
    }
    return true;
  }

  function hydrateAvailability(generation) {
    if (generation !== availabilityHydrationGeneration || !isWorkspaceActive()) {
      return;
    }
    const profilesById = new Map(
      [...(options.getVisiblePlayerProfiles?.() || []), ...(options.getTemporaryPlayerProfiles?.() || [])]
        .filter((player) => player?.id)
        .map((player) => [player.id, player])
    );
    const players = Array.from(profilesById.values());
    const medicalSnapshotContext = options.createMedicalSnapshotContext?.({
      medicalStateReady: true,
      includeTrainingAvailability: true,
    });
    const medicalSnapshotsByPlayerId = new Map();
    let playerIndex = 0;

    const hydrateNextChunk = () => {
      if (generation !== availabilityHydrationGeneration || !isWorkspaceActive()) {
        return;
      }
      players.slice(playerIndex, playerIndex + 1).forEach((player) => {
        const availabilityStartDateValue = String(player.temporaryFrom || "").slice(0, 10);
        medicalSnapshotsByPlayerId.set(
          player.id,
          options.getMedicalSnapshot?.(player.id, undefined, {
            medicalStateReady: true,
            includeTrainingAvailability: true,
            ...(availabilityStartDateValue ? { availabilityStartDateValue } : {}),
            snapshotContext: medicalSnapshotContext,
          })
        );
      });
      playerIndex += 1;
      if (playerIndex < players.length) {
        win.setTimeout(hydrateNextChunk, 0);
        return;
      }
      renderListOnly({
        hydrationGeneration: generation,
        medicalStateReady: true,
        includeTrainingAvailability: true,
        medicalSnapshotsByPlayerId,
      });
    };

    hydrateNextChunk();
  }

  function queueAvailabilityHydration(generation) {
    const requestFrame = typeof win.requestAnimationFrame === "function"
      ? win.requestAnimationFrame.bind(win)
      : (callback) => win.setTimeout(callback, 0);
    requestFrame(() => requestFrame(() => {
      win.setTimeout(() => hydrateAvailability(generation), 0);
    }));
  }

  return {
    beginWorkspaceRender,
    queueAvailabilityHydration,
    renderListOnly,
  };
}
