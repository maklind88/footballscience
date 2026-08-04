export function createCentralSyncStateHandler({
  getHubState = () => ({ activeWorkspaceId: "" }),
  sessionPlannerStorageKey = "",
  sessionPlannerExerciseLibraryStorageKey = "",
  sessionPlannerExerciseLibraryFoldersStorageKey = "",
  dashboardChatStorageKey = "",
  dashboardChatDeletedMessageIdsStorageKey = "",
  dashboardPresentationStorageKey = "",
  platformAppearanceStorageKey = "",
  playerProfilesStorageKey = "",
  medicalTeamStorageKey = "",
  scoutingStorageKey = "",
  transferRoomStorageKey = "",
  readSessionPlannerStatePreservingUiSelection = () => ({}),
  setSessionPlannerState = () => {},
  syncSessionPlannerBoardHistoryBaselines = () => {},
  getSessionPlannerSelectedBlock = () => null,
  renderSessionPlannerWorkspace = () => {},
  shouldDeferCentralizedAppStateReload = () => false,
  purgeDashboardDeletedMessagesFromStorage = () => {},
  renderDashboardChatWidget = () => {},
  renderTopIconMenu = () => {},
  renderDashboardCards = () => {},
  renderAdminWorkspace = () => {},
  clearPlayerProfileImportUndoSnapshots = () => {},
  readPlayerProfilesState = () => ({}),
  setPlayerProfilesState = () => {},
  syncTransferRoomLinkedState = () => {},
  renderPlayerProfilesWorkspace = () => {},
  readMedicalState = () => ({}),
  setMedicalState = () => {},
  renderMedicalTeamWorkspace = () => {},
  readScoutingState = () => ({}),
  setScoutingState = () => {},
  setCentralizedAppStateReloadPending = () => {},
  renderScoutingWorkspace = () => {},
  readTransferRoomState = () => ({}),
  setTransferRoomState = () => {},
  renderTransferRoomWorkspace = () => {},
  readSessionPlannerExerciseLibrary = () => [],
  setSessionPlannerExerciseLibrary = () => {},
  readSessionPlannerExerciseLibraryFolders = () => [],
  setSessionPlannerExerciseLibraryFolders = () => {},
} = {}) {
  const activeWorkspaceId = () => getHubState()?.activeWorkspaceId || "";

  return {
    handleCentralSyncedStateValue(key) {
      if (key === sessionPlannerStorageKey) {
        const nextState = readSessionPlannerStatePreservingUiSelection();
        setSessionPlannerState(nextState);
        syncSessionPlannerBoardHistoryBaselines(getSessionPlannerSelectedBlock());
        if (activeWorkspaceId() === "session-planner" && !shouldDeferCentralizedAppStateReload()) {
          renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
        }
        return;
      }
      if (key === sessionPlannerExerciseLibraryStorageKey) {
        const nextLibrary = readSessionPlannerExerciseLibrary();
        setSessionPlannerExerciseLibrary(nextLibrary);
        if (activeWorkspaceId() === "session-planner" && !shouldDeferCentralizedAppStateReload()) {
          renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
        }
        return;
      }
      if (key === sessionPlannerExerciseLibraryFoldersStorageKey) {
        const nextFolders = readSessionPlannerExerciseLibraryFolders();
        setSessionPlannerExerciseLibraryFolders(nextFolders);
        if (activeWorkspaceId() === "session-planner" && !shouldDeferCentralizedAppStateReload()) {
          renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
        }
        return;
      }
      if (key === dashboardChatStorageKey) {
        purgeDashboardDeletedMessagesFromStorage();
        renderDashboardChatWidget();
        renderTopIconMenu();
        return;
      }
      if (key === dashboardChatDeletedMessageIdsStorageKey) {
        purgeDashboardDeletedMessagesFromStorage();
        renderDashboardChatWidget();
        renderTopIconMenu();
        return;
      }
      if (key === dashboardPresentationStorageKey) {
        if (activeWorkspaceId() === "home") {
          renderDashboardCards();
        }
        return;
      }
      if (key === platformAppearanceStorageKey) {
        if (activeWorkspaceId() === "home") {
          renderDashboardCards();
        }
        if (activeWorkspaceId() === "admin") {
          renderAdminWorkspace();
        }
        return;
      }
      if (key === playerProfilesStorageKey) {
        clearPlayerProfileImportUndoSnapshots();
        const nextState = readPlayerProfilesState();
        setPlayerProfilesState(nextState);
        if (activeWorkspaceId() === "transfer-room" && !shouldDeferCentralizedAppStateReload()) {
          syncTransferRoomLinkedState({ render: true });
        }
        if (activeWorkspaceId() === "player-profiles" && !shouldDeferCentralizedAppStateReload()) {
          renderPlayerProfilesWorkspace();
        }
        return;
      }
      if (key === medicalTeamStorageKey) {
        clearPlayerProfileImportUndoSnapshots();
        const nextState = readMedicalState();
        setMedicalState(nextState);
        if (activeWorkspaceId() === "player-profiles" && !shouldDeferCentralizedAppStateReload()) {
          renderPlayerProfilesWorkspace();
        }
        if (activeWorkspaceId() === "medical-team" && !shouldDeferCentralizedAppStateReload()) {
          renderMedicalTeamWorkspace();
        }
        return;
      }
      if (key === scoutingStorageKey) {
        const nextState = readScoutingState();
        setScoutingState(nextState);
        if (activeWorkspaceId() === "transfer-room" && !shouldDeferCentralizedAppStateReload()) {
          syncTransferRoomLinkedState({ render: true });
        }
        if (activeWorkspaceId() === "scouting" && shouldDeferCentralizedAppStateReload()) {
          setCentralizedAppStateReloadPending(true);
          return;
        }
        if (activeWorkspaceId() === "scouting") {
          renderScoutingWorkspace();
        }
        return;
      }
      if (key === transferRoomStorageKey) {
        const nextState = readTransferRoomState();
        setTransferRoomState(nextState);
        if (activeWorkspaceId() === "transfer-room" && !shouldDeferCentralizedAppStateReload()) {
          renderTransferRoomWorkspace();
        }
      }
    },
  };
}
