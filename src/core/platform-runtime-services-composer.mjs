import { createWorkspaceAccessRuntimeService } from "./workspace-access-runtime-service.mjs";
import { createWorkspaceDataRuntimeService } from "./workspace-data-runtime-service.mjs";
import { createWorkspaceModuleRuntimeController } from "./workspace-module-runtime-controller.mjs";
import { createScheduleWorkspaceController } from "../modules/schedule/schedule-controller.mjs";
import { createScheduleRuntimeSelectors } from "../modules/schedule/schedule-runtime-selectors.mjs";
import { createPlatformStructureRuntimeService } from "../modules/platform/platform-structure-runtime-service.mjs";
import { createTransferRoomRuntime } from "../../transfer-room-runtime.js";

export function createPlatformRuntimeServices(deps = {}) {
  const {
    canCurrentUserEditWorkspace,
    canEditPeriodizationWorkspace,
    canEditScheduleWorkspace,
    canEditScoutingWorkspace,
    canEditSessionPlanner,
    canUserAccessTransferRoom,
    canUserEditTransferRoom,
    clonePeriodizationState,
    cloneScheduleState,
    cloneScoutingState,
    defaultHubState,
    defaultPeriodizationState,
    defaultScheduleState,
    defaultScoutingState,
    defaultWorkspaceAccess,
    defaultWorkspaceEditAccess,
    documentRef,
    ensurePeriodizationState,
    ensureScoutingState,
    escapeHtml,
    formatScheduleBlockSummary,
    formatScheduleBlockSummaryFromModule,
    formatScheduleDateValue,
    getCurrentPlatformUser,
    getHubState,
    getPeriodizationDay,
    getPeriodizationDayFromState,
    getPeriodizationDayScheduleLabel,
    getPeriodizationMatchDayLabel,
    getPlatformApiAccessToken,
    getPlatformAuthStore,
    getPlatformTeamLogoUrl,
    getPlatformUsers,
    getPlayerProfilesStateForGameplan,
    getScheduleDayWarningsFromModule,
    getScheduleMainEventFromModule,
    getScheduleStateForGameplan,
    getScoutingTeamName,
    getSessionPlannerState,
    getTransferRoomState,
    getUniqueScheduleEvents,
    getUserTeamId,
    getWorkspaceViewId,
    getSafeWorkspaceId,
    importedNccScheduleEvents,
    importedNccScheduleVersion,
    isDateValueInYear,
    isEditableKeyboardTarget,
    isPlatformAdminUser,
    isPlatformManagementUser,
    isPlatformStaffUser,
    isScheduleSessionEvent,
    isScheduleSessionEventFromModule,
    logEvent,
    mergeImportedScheduleEvents,
    normalizePeriodizationDay,
    normalizePlatformImageUrl,
    normalizePlatformRole,
    normalizePlatformStructureText,
    parseScheduleDateValue,
    periodizationFieldUpdatedAtKey,
    periodizationStorageKey,
    periodizationTrackedFields,
    periodizationYear,
    platformAssetVersion,
    platformDefaultClubId,
    platformDefaultClubShortName,
    platformDefaultTeamId,
    platformDefaultTeamName,
    platformDefaultRoles,
    platformDefaultTeamLevel,
    platformModuleLoader,
    platformStructureStorageKey,
    platformDefaultClubName,
    preserveScoutingTransientUiState,
    queueGameSimulatorControllersLoad,
    rawDataSafetySetItem,
    readPlayerProfilesState,
    readScheduleState,
    readSessionPlannerExerciseLibrary,
    readSessionPlannerExerciseLibraryFolders,
    readSessionPlannerState,
    renderPeriodizationWorkspace,
    renderSessionPlannerWorkspace,
    renderTransferRoomWorkspace,
    requiredWorkspaceAccess,
    scheduleEventTypes,
    scheduleStorageKey,
    scoutingCoreMetricOptions,
    scoutingPriorityOptions,
    scoutingShadowSlots,
    scoutingStateOptions,
    scoutingStatusOptions,
    scoutingStorageKey,
    scoutingTabs,
    selectPeriodizationDate,
    setActiveWorkspace,
    setPeriodizationState,
    setPlayerProfilesState,
    setScheduleState,
    setScoutingState,
    setSessionPlannerExerciseLibrary,
    setSessionPlannerState,
    setTransferRoomState,
    shouldDeferCentralizedAppStateReload,
    suppressCentralWrites,
    transferRoomStorageKey,
    ui,
    unsuppressCentralWrites,
    win,
    workspaceHubDefaultActiveWorkspaceId,
    workspaceHubStorageKey,
    workspaceLastActiveStorageKey,
    writeScheduleState,
    writeScoutingState,
    writeSessionPlannerState,
  } = deps;

  let transferRoomRuntime = null;

  const platformStructureRuntimeService = createPlatformStructureRuntimeService({
    window: win,
    storageKey: platformStructureStorageKey,
    defaultRoles: platformDefaultRoles,
    managementRoleSet: deps.platformManagementRoleSet,
    defaultClubId: platformDefaultClubId,
    defaultTeamId: platformDefaultTeamId,
    defaultClubName: platformDefaultClubName,
    defaultClubShortName: platformDefaultClubShortName,
    defaultTeamName: platformDefaultTeamName,
    defaultTeamLevel: platformDefaultTeamLevel,
    legacyValues: deps.legacyPlatformStructureValues,
    canonicalClubValues: deps.canonicalPlatformClubValues,
    canonicalTeamValues: deps.canonicalPlatformTeamValues,
    getPlatformTeamLogoUrl,
    getPlatformUsers,
    getCurrentPlatformUser,
    getPlatformAuthStore,
    normalizePlatformRole,
    getAssignableRolesForUser: deps.getAssignableRolesForUser,
    isPlatformAdminUser,
    isPlatformManagementUser,
    normalizePlatformImageUrl,
    logEvent,
  });

  const workspaceAccessRuntimeService = createWorkspaceAccessRuntimeService({
    window: win,
    defaultHubState,
    defaultWorkspaceAccess,
    defaultWorkspaceEditAccess,
    requiredWorkspaceAccess,
    defaultRoles: platformDefaultRoles,
    workspaceHubStorageKey,
    workspaceLastActiveStorageKey,
    defaultActiveWorkspaceId: workspaceHubDefaultActiveWorkspaceId,
    getHubState,
    getCurrentPlatformUser,
    normalizePlatformRole,
    isPlatformManagementUser,
    isPlatformStaffUser,
    canUserAccessTransferRoom,
    canUserEditTransferRoom,
    logEvent,
  });

  const workspaceDataRuntimeService = createWorkspaceDataRuntimeService({
    win,
    ui,
    periodizationFieldUpdatedAtKey,
    periodizationStorageKey,
    periodizationTrackedFields,
    periodizationYear,
    scheduleStorageKey,
    scoutingStorageKey,
    defaultPeriodizationState,
    defaultScheduleState,
    defaultScoutingState,
    importedNccScheduleEvents,
    importedNccScheduleVersion,
    canEditPeriodizationWorkspace,
    clonePeriodizationState,
    cloneScheduleState,
    cloneScoutingState,
    formatScheduleDateValue,
    getActiveWorkspaceId: () => getHubState()?.activeWorkspaceId,
    getCurrentPlatformUser,
    getPeriodizationDayFromState,
    getPeriodizationState: deps.getPeriodizationState,
    getPlayerProfilesState: deps.getPlayerProfilesState,
    getScheduleState: deps.getScheduleState,
    getScoutingState: deps.getScoutingState,
    getTransferRoomRuntime: () => transferRoomRuntime,
    getTransferRoomState,
    isDateValueInYear: (dateValue) => isDateValueInYear(dateValue, periodizationYear),
    logEvent,
    mergeImportedScheduleEvents,
    normalizePeriodizationDay,
    parseScheduleDateValue,
    preserveScoutingTransientUiState,
    rawDataSafetySetItem,
    readPlayerProfilesState,
    renderPeriodizationWorkspace,
    renderTransferRoomWorkspace,
    setPeriodizationState,
    setPlayerProfilesState,
    setScheduleState,
    setScoutingState,
    setTransferRoomState,
    shouldDeferCentralizedAppStateReload,
  });

  transferRoomRuntime = createTransferRoomRuntime({
    storageKey: transferRoomStorageKey,
    getCachedState: getTransferRoomState,
    setCachedState: setTransferRoomState,
    getPlatformStructureState: platformStructureRuntimeService.getPlatformStructureState,
    getPlatformTeamById: platformStructureRuntimeService.getPlatformTeamById,
    getUserTeamId: platformStructureRuntimeService.getUserTeamId,
    defaultTeam: {
      id: platformDefaultTeamId,
      clubId: platformDefaultClubId,
      name: platformDefaultTeamName,
      shortName: platformDefaultClubShortName,
    },
    getPlayerProfilesState: deps.getPlayerProfilesStateForTransferRoom,
    getScoutingState: deps.getScoutingStateForTransferRoom,
    ensureScoutingState,
    getCurrentUser: getCurrentPlatformUser,
    getUsers: getPlatformUsers,
    normalizeRole: normalizePlatformRole,
    getDefaultTeamAliases: () => [platformDefaultTeamId, platformDefaultTeamName, "team-ncc-first"],
    getActiveWorkspaceId: () => getHubState()?.activeWorkspaceId,
    getRoot: () => ui.transferRoomWorkspace,
    platformModuleLoader,
    getAssetVersion: () => platformAssetVersion,
    escapeHtml,
    suppressCentralWrites,
    unsuppressCentralWrites,
    setActiveWorkspace,
    loadScoutingWorkspaceModule: () => workspaceModuleRuntimeController.loadScoutingWorkspaceModule(),
    getScoutingWorkspaceContext: () => workspaceModuleRuntimeController.getScoutingWorkspaceContext(),
    logEvent,
  });

  const workspaceModuleRuntimeController = createWorkspaceModuleRuntimeController({
    ui,
    win,
    platformModuleLoader,
    getAssetVersion: () => platformAssetVersion,
    getUsers: getPlatformUsers,
    getCurrentUser: getCurrentPlatformUser,
    getPlatformTeamDisplayTeam: platformStructureRuntimeService.getPlatformTeamDisplayTeam,
    getPlatformTeamDisplayName: platformStructureRuntimeService.getPlatformTeamDisplayName,
    getPlatformTeamLogoUrl,
    getScheduleStateForGameplan,
    getScheduleStateForVideoAnalysis: () => deps.getScheduleState?.() || readScheduleState(),
    getPlayerProfilesStateForGameplan,
    getPlayerProfilesStateForVideoAnalysis: () => deps.getPlayerProfilesState?.() || readPlayerProfilesState(),
    getPlayerProfilesStateForIdp: () => deps.getPlayerProfilesState?.() || readPlayerProfilesState(),
    canEditGameplan: () => canCurrentUserEditWorkspace("gameplan"),
    canEditVideoAnalysis: () => canCurrentUserEditWorkspace("analysis-room"),
    canEditIdp: () => canCurrentUserEditWorkspace("idp"),
    getAuthToken: getPlatformApiAccessToken,
    suppressCentralWrites,
    unsuppressCentralWrites,
    escapeHtml,
    getScoutingTeamName,
    ensureScoutingState,
    writeScoutingState,
    canEditScouting: canEditScoutingWorkspace,
    canSendToTransferRoom: canUserEditTransferRoom,
    sendToTransferRoom: workspaceDataRuntimeService.addTransferRoomTargetFromScoutingSnapshot,
    scoutingTabs,
    scoutingShadowSlots,
    scoutingCoreMetricOptions,
    scoutingStatusOptions,
    scoutingPriorityOptions,
    transferRoomRuntime,
    getWorkspaceViewId,
    getSafeWorkspaceId,
    getHubState,
    workspaceHubDefaultActiveWorkspaceId,
    shouldDeferCentralizedAppStateReload,
    hydrateState: {
      schedule: () => {
        if (!deps.getScheduleState()) {
          setScheduleState(readScheduleState());
        }
      },
      periodization: () => {
        if (!deps.getPeriodizationState()) {
          setPeriodizationState(workspaceDataRuntimeService.readPeriodizationState());
        }
        if (!deps.getScheduleState()) {
          setScheduleState(readScheduleState());
        }
      },
      sessionPlanner: () => {
        if (!getSessionPlannerState()) {
          setSessionPlannerState(readSessionPlannerState());
        }
        if (!deps.getSessionPlannerExerciseLibrary()) {
          setSessionPlannerExerciseLibrary(readSessionPlannerExerciseLibrary());
        }
        if (!deps.getSessionPlannerExerciseLibraryFolders()) {
          deps.setSessionPlannerExerciseLibraryFolders(readSessionPlannerExerciseLibraryFolders());
        }
        if (!deps.getPeriodizationState()) {
          setPeriodizationState(workspaceDataRuntimeService.readPeriodizationState());
        }
        if (!deps.getMedicalState()) {
          deps.setMedicalState(deps.readMedicalState());
        }
      },
      medical: () => {
        if (!deps.getMedicalState()) {
          deps.setMedicalState(deps.readMedicalState());
        }
        if (!deps.getPlayerProfilesState()) {
          setPlayerProfilesState(readPlayerProfilesState());
        }
      },
      playerProfiles: () => {
        if (!deps.getPlayerProfilesState()) {
          setPlayerProfilesState(readPlayerProfilesState());
        }
        if (!deps.getMedicalState()) {
          deps.setMedicalState(deps.readMedicalState());
        }
      },
      idp: () => {
        if (!deps.getPlayerProfilesState()) {
          setPlayerProfilesState(readPlayerProfilesState());
        }
      },
      transferRoom: () => {
        workspaceDataRuntimeService.syncTransferRoomLinkedState();
      },
      gameSimulator: () => {
        queueGameSimulatorControllersLoad();
      },
    },
  });

  const scheduleRuntimeSelectors = createScheduleRuntimeSelectors({
    ensurePeriodizationState,
    ensureScheduleState: () => {
      if (!deps.getScheduleState()) {
        setScheduleState(readScheduleState());
      }
      return deps.getScheduleState();
    },
    ensureSessionPlannerState: () => {
      if (!getSessionPlannerState()) {
        setSessionPlannerState(readSessionPlannerState());
      }
      return getSessionPlannerState();
    },
    formatBlockSummary: formatScheduleBlockSummaryFromModule,
    getDayWarnings: getScheduleDayWarningsFromModule,
    getMainEvent: getScheduleMainEventFromModule,
    getPeriodizationDay,
    getPeriodizationDayScheduleLabel,
    getPeriodizationMatchDayLabel,
    getScheduleState: deps.getScheduleState,
    getUniqueEvents: getUniqueScheduleEvents,
    isSessionEvent: isScheduleSessionEventFromModule,
    parseDateValue: parseScheduleDateValue,
  });

  const scheduleWorkspaceController = createScheduleWorkspaceController({
    ui,
    window: win,
    document: documentRef,
    rendererOptions: {
      escapeHtml,
      getPeriodizationDay,
      getPeriodizationDayScheduleLabel,
    },
    getState: deps.getScheduleState,
    ensureState: () => {
      if (!deps.getScheduleState()) {
        setScheduleState(readScheduleState());
      }
      return deps.getScheduleState();
    },
    writeState: writeScheduleState,
    canEdit: canEditScheduleWorkspace,
    canCreateSession: canEditSessionPlanner,
    isActive: () => getHubState()?.activeWorkspaceId === "schedule",
    isEditableKeyboardTarget,
    prepareRender: () => {
      platformModuleLoader?.loadStylesheet?.("schedule", "src/modules/schedule/schedule.css", {
        id: "scheduleStylesheet",
        required: true,
      })?.catch?.(() => {
        logEvent?.("Schedule stylesheet could not load.");
      });
      ensurePeriodizationState();
      if (!getSessionPlannerState()) {
        setSessionPlannerState(readSessionPlannerState());
      }
    },
    formatBlockSummary: formatScheduleBlockSummary,
    getEventsForDate: scheduleRuntimeSelectors.getEventsForDate,
    getSelectedDayContext: scheduleRuntimeSelectors.getSelectedDayContext,
    getSessionForDate: (dateValue) => getSessionPlannerState()?.sessions?.[dateValue] || null,
    getVisibleEvents: scheduleRuntimeSelectors.getVisibleEvents,
    getVisibleMonthEvents: scheduleRuntimeSelectors.getVisibleMonthEvents,
    isSessionEvent: isScheduleSessionEvent,
    getFormValues: deps.getPlatformFormValues,
    onOpenSessionDate: (dateValue, options = {}) => {
      if (!getSessionPlannerState()) {
        setSessionPlannerState(readSessionPlannerState());
      }
      const sessionPlannerState = getSessionPlannerState();
      if (!sessionPlannerState.sessions) {
        sessionPlannerState.sessions = {};
      }
      sessionPlannerState.selectedDate = dateValue;
      if (!sessionPlannerState.sessions[dateValue] && options.createSession && canEditSessionPlanner()) {
        sessionPlannerState.sessions[dateValue] = deps.createSessionPlannerEmptySession(dateValue);
      }
      writeSessionPlannerState();
      setActiveWorkspace("session-planner");
      renderSessionPlannerWorkspace({ preserveDateStripScroll: true });
    },
    onOpenPeriodizationDate: (dateValue) => {
      ensurePeriodizationState();
      selectPeriodizationDate(dateValue, true, "view");
      setActiveWorkspace("periodization");
      renderPeriodizationWorkspace();
    },
  });

  return {
    platformStructureRuntimeService,
    scheduleRuntimeSelectors,
    scheduleWorkspaceController,
    transferRoomRuntime,
    workspaceAccessRuntimeService,
    workspaceDataRuntimeService,
    workspaceModuleRuntimeController,
    renderScheduleWorkspace: () => scheduleWorkspaceController.render(),
  };
}
