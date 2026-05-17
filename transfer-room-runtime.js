import {
  addTransferRoomTargetSnapshot,
  applyTransferRoomSettingsPatch,
  applyTransferRoomSquadPlanPatch,
  applyTransferRoomTargetPlanPatch,
  cloneTransferRoomState,
  getTransferRoomSquadPlayersFromProfiles,
  getTransferRoomTeamAccessIds,
  isTransferRoomSelectedUser,
  normalizeTransferRoomText,
  removeTransferRoomTargetFromState,
  setTransferRoomAccessUser,
  syncTransferRoomSquadPlans,
  syncTransferRoomTargetsFromScouting,
  transferRoomCurrencyOptions,
  transferRoomWagePeriodOptions,
} from "./transfer-room-state.js";

export function createTransferRoomRuntime(deps = {}) {
  let workspaceModulePromise = null;
  let workspaceModule = null;

  const getRoot = () => deps.getRoot?.() || null;
  const getState = () => deps.getCachedState?.() || null;
  const setState = (state) => deps.setCachedState?.(state);
  const getCurrentTeam = () => {
    if (deps.getCurrentTeam) {
      return deps.getCurrentTeam();
    }
    const fallback = deps.defaultTeam || {};
    const structure = deps.getPlatformStructureState?.();
    const user = getCurrentUser();
    const team =
      deps.getPlatformTeamById?.(deps.getUserTeamId?.(user, structure), structure) ||
      deps.getPlatformTeamById?.(fallback.id, structure) ||
      fallback;
    return {
      id: team.id || fallback.id,
      clubId: team.clubId || fallback.clubId,
      name: team.name || fallback.name,
      shortName: team.shortName || fallback.shortName,
      season: team.season || "2026",
      country: team.country || "United States",
      league: team.league || "NWSL",
      leagueProfileId: team.leagueProfileId || "nwsl-2026",
    };
  };
  const getSquadPlayers = () => deps.getSquadPlayers?.() || getTransferRoomSquadPlayersFromProfiles(deps.getPlayerProfilesState?.() || {});
  const getScoutingState = () => deps.getScoutingState?.() || {};
  const getCurrentUser = () => deps.getCurrentUser?.() || {};
  const getRole = (user) => deps.normalizeRole?.(user?.role, "guest") || "guest";
  const isActiveWorkspace = () => deps.getActiveWorkspaceId?.() === "transfer-room";
  const storageKey = deps.storageKey || "football-transfer-room-v1";

  function cloneState(source = {}) {
    return cloneTransferRoomState(source, {
      currentTeam: getCurrentTeam(),
      squadPlayers: getSquadPlayers(),
      scoutingState: getScoutingState(),
    });
  }

  function setStorageValue(state = getState(), options = {}) {
    const shouldSyncCentral = options.syncCentral !== false;
    if (!shouldSyncCentral) {
      deps.suppressCentralWrites?.(storageKey);
    }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } finally {
      if (!shouldSyncCentral) {
        deps.unsuppressCentralWrites?.(storageKey);
      }
    }
  }

  function readState() {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const state = cloneState(raw ? JSON.parse(raw) : {});
      const normalizedValue = JSON.stringify(state);
      if (raw !== normalizedValue) {
        setStorageValue(state, { syncCentral: false });
      }
      return state;
    } catch {
      const state = cloneState({});
      try {
        setStorageValue(state, { syncCentral: false });
      } catch {}
      return state;
    }
  }

  function ensureState() {
    let state = getState();
    if (!state) {
      state = readState();
      setState(state);
    }
    syncTransferRoomSquadPlans(state, getSquadPlayers());
    syncTransferRoomTargetsFromScouting(state, deps.ensureScoutingState?.() || getScoutingState());
    return state;
  }

  function writeState(options = {}) {
    const state = getState();
    if (!state) {
      return;
    }
    try {
      state.updatedAt = new Date().toISOString();
      setStorageValue(state, options);
    } catch {
      deps.logEvent?.("Transfer Room could not be written to local storage.");
    }
  }

  function getStateForAccess() {
    const state = getState();
    if (state) {
      return state;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? cloneState(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  function canAccess(user = getCurrentUser()) {
    const role = getRole(user);
    if (role === "admin" || role === "team-admin") {
      return true;
    }
    const aliases = getTransferRoomTeamAccessIds(user, getCurrentTeam(), deps.getDefaultTeamAliases?.() || []);
    return isTransferRoomSelectedUser(user, getStateForAccess(), aliases);
  }

  function canManageAccess(user = getCurrentUser()) {
    const role = getRole(user);
    return (role === "admin" || role === "team-admin") && canAccess(user);
  }

  function afterMutation() {
    writeState();
    render();
  }

  function setActiveTab(tabId) {
    const state = ensureState();
    state.activeTab = normalizeTransferRoomText(tabId, 40) || "overview";
    afterMutation();
  }

  function updateSettings(patch = {}) {
    if (!canAccess()) {
      return;
    }
    applyTransferRoomSettingsPatch(ensureState(), patch);
    afterMutation();
  }

  function updateSquadPlan(playerId, patch = {}) {
    if (!canAccess() || !applyTransferRoomSquadPlanPatch(ensureState(), playerId, patch)) {
      return;
    }
    afterMutation();
  }

  function updateTargetPlan(recordId, patch = {}) {
    if (!canAccess() || !applyTransferRoomTargetPlanPatch(ensureState(), recordId, patch)) {
      return;
    }
    afterMutation();
  }

  function openTargetProfile(recordId) {
    if (!canAccess()) {
      return;
    }
    const state = ensureState();
    const id = normalizeTransferRoomText(recordId, 180);
    if (!id || !state.targetPlans?.[id]) {
      return;
    }
    state.activeTargetProfileRecordId = id;
    afterMutation();
  }

  function closeTargetProfile() {
    const state = ensureState();
    if (!state.activeTargetProfileRecordId) {
      return;
    }
    state.activeTargetProfileRecordId = "";
    afterMutation();
  }

  function removeTarget(recordId) {
    const state = ensureState();
    if (!canAccess() || !removeTransferRoomTargetFromState(state, recordId)) {
      return;
    }
    if (state.activeTargetProfileRecordId === normalizeTransferRoomText(recordId, 180)) {
      state.activeTargetProfileRecordId = "";
    }
    afterMutation();
  }

  function toggleAccessUser(userId, isSelected) {
    if (!canManageAccess()) {
      return;
    }
    const state = ensureState();
    if (!setTransferRoomAccessUser(state, state.activeTeamId || getCurrentTeam().id, userId, isSelected)) {
      return;
    }
    afterMutation();
  }

  function addTargetFromScoutingSnapshot(snapshot = {}, options = {}) {
    if (!canAccess()) {
      return false;
    }
    if (!addTransferRoomTargetSnapshot(ensureState(), snapshot, options)) {
      return false;
    }
    writeState();
    if (isActiveWorkspace()) {
      render();
    }
    return true;
  }

  function getContext() {
    const state = ensureState();
    return {
      ui: { transferRoomWorkspace: getRoot() },
      escapeHtml: deps.escapeHtml,
      state,
      team: state.teams.find((team) => team.id === state.activeTeamId) || getCurrentTeam(),
      users: deps.getUsers?.() || [],
      currentUser: getCurrentUser(),
      squadPlayers: getSquadPlayers(),
      currencyOptions: transferRoomCurrencyOptions,
      wagePeriodOptions: transferRoomWagePeriodOptions,
      canEdit: canAccess,
      canManageAccess,
      setActiveTab,
      updateSettings,
      updateSquadPlan,
      updateTargetPlan,
      openTargetProfile,
      closeTargetProfile,
      removeTarget,
      toggleAccessUser,
      openScoutingRecord: (recordId) => {
        deps.setActiveWorkspace?.("scouting");
        deps.loadScoutingWorkspaceModule?.()
          .then((module) => module.openRecord?.(recordId, deps.getScoutingWorkspaceContext?.()))
          .catch(() => {});
      },
      openWorkspace: deps.setActiveWorkspace,
    };
  }

  function loadWorkspaceModule() {
    if (workspaceModule) {
      return Promise.resolve(workspaceModule);
    }
    if (!workspaceModulePromise) {
      workspaceModulePromise = Promise.all([
        deps.platformModuleLoader?.loadStylesheet("transfer-room", "transfer-room.css", {
          id: "transferRoomStylesheet",
          required: true,
        }),
        deps.platformModuleLoader?.loadModule("transfer-room", () =>
          import(`./transfer-room.js?v=${encodeURIComponent(deps.getAssetVersion?.() || Date.now())}`)
        ),
      ])
        .then(([, module]) => {
          workspaceModule = module;
          return module;
        })
        .catch((error) => {
          workspaceModulePromise = null;
          throw error;
        });
    }
    return workspaceModulePromise;
  }

  function render() {
    const root = getRoot();
    if (!root) {
      return;
    }
    if (!canAccess()) {
      root.innerHTML = `<section class="transfer-room-shell"><section class="transfer-room-load-panel"><h2>Transfer Room is locked</h2><p>Only selected people for this team can access transfer planning.</p></section></section>`;
      return;
    }
    if (!workspaceModule) {
      root.innerHTML = `<section class="transfer-room-shell"><section class="transfer-room-load-panel"><h2>Loading Transfer Room</h2><p>Preparing squad plans, target snapshots and league-rule checks.</p></section></section>`;
      loadWorkspaceModule()
        .then((module) => module.render(getContext()))
        .catch(() => {
          root.innerHTML = `<section class="transfer-room-shell"><section class="transfer-room-load-panel"><h2>Transfer Room could not load</h2><p>Refresh and try again.</p></section></section>`;
        });
      return;
    }
    workspaceModule.render(getContext());
  }

  return Object.freeze({
    addTargetFromScoutingSnapshot,
    canAccess,
    canManageAccess,
    getContext,
    getStateForAccess,
    loadWorkspaceModule,
    readState,
    render,
    setActiveTab,
    toggleAccessUser,
    updateSettings,
    updateSquadPlan,
    updateTargetPlan,
    openTargetProfile,
    closeTargetProfile,
    removeTarget,
    ensureState,
    writeState,
    get workspaceModule() {
      return workspaceModule;
    },
  });
}
