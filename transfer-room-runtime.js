import {
  addTransferRoomTargetSnapshot,
  activateTransferRoomScenario,
  appendTransferRoomAuditEvent,
  applyTransferRoomScenarioDraftPatch,
  applyTransferRoomSettingsPatch,
  applyTransferRoomSquadPlanPatch,
  applyTransferRoomTargetPlanPatch,
  clearTransferRoomNotice,
  cloneTransferRoomState,
  getTransferRoomSquadPlayersFromProfiles,
  getTransferRoomTeamAccessIds,
  getTransferRoomTargetStageGateIssues,
  isTransferRoomSelectedUser,
  normalizeTransferRoomText,
  removeTransferRoomScenario,
  removeTransferRoomTargetFromState,
  saveTransferRoomCurrentScenario,
  setTransferRoomNotice,
  setTransferRoomAccessUser,
  syncTransferRoomSquadPlans,
  syncTransferRoomTargetsFromScouting,
  transferRoomApprovalRoles,
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

  function getActorMeta() {
    const user = getCurrentUser();
    return {
      actorId: normalizeTransferRoomText(user.id || user.email, 180),
      actorName: normalizeTransferRoomText([user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || user.email || "Transfer Room user", 180),
      actorRole: normalizeTransferRoomText(getRole(user), 80),
    };
  }

  function getAuditTeamId(state = getState()) {
    return normalizeTransferRoomText(state?.activeTeamId || getCurrentTeam().id, 180);
  }

  function getAuditFieldLabel(field = "") {
    const labels = {
      activeTeamId: "Team",
      agent: "Agent",
      capBuffer: "Internal buffer",
      contractEnd: "Contract end",
      contractStatus: "Contract",
      currency: "Currency",
      dealType: "Deal",
      decisionOwner: "Owner",
      estimatedValue: "Value",
      fee: "Fee",
      nextAction: "Next action",
      nextActionDate: "Action date",
      notes: "Notes",
      plannedWindow: "Window",
      replacementFor: "Replacement",
      riskLevel: "Risk",
      salary: "Salary",
      salaryCap: "Salary cap",
      scenarioName: "Scenario name",
      scenarioNotes: "Scenario notes",
      stage: "Stage",
      status: "Decision",
      valuationConfidence: "Confidence",
      wage: "Wage",
      wagePeriod: "Wage period",
      whyThisPlayer: "Why this player",
    };
    return labels[field] || field;
  }

  function formatAuditValue(value) {
    if (value === "" || value === null || value === undefined) {
      return "empty";
    }
    return normalizeTransferRoomText(value, 180);
  }

  function getAuditChanges(previous = {}, next = {}, patch = {}) {
    return Object.keys(patch)
      .filter((field) => formatAuditValue(previous[field]) !== formatAuditValue(next[field]))
      .map((field) => ({
        field,
        label: getAuditFieldLabel(field),
        before: formatAuditValue(previous[field]),
        after: formatAuditValue(next[field]),
      }));
  }

  function writeAuditEvent(state, event = {}) {
    appendTransferRoomAuditEvent(state, {
      ...getActorMeta(),
      teamId: getAuditTeamId(state),
      ...event,
    });
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
    const state = ensureState();
    const previous = { ...(state.settings || {}) };
    applyTransferRoomSettingsPatch(state, patch);
    const changes = getAuditChanges(previous, state.settings, patch);
    if (changes.length) {
      clearTransferRoomNotice(state);
      writeAuditEvent(state, {
        type: "settings-updated",
        subjectLabel: "Transfer Room settings",
        message: "Updated Transfer Room settings.",
        changes,
      });
    }
    afterMutation();
  }

  function updateSquadPlan(playerId, patch = {}) {
    const state = ensureState();
    const id = normalizeTransferRoomText(playerId, 180);
    if (!canAccess() || !id) {
      return;
    }
    const previous = { ...(state.squadPlans?.[id] || {}) };
    if (!applyTransferRoomSquadPlanPatch(state, id, patch)) {
      return;
    }
    const next = state.squadPlans?.[id] || {};
    const changes = getAuditChanges(previous, next, patch);
    if (changes.length) {
      clearTransferRoomNotice(state);
      writeAuditEvent(state, {
        type: "squad-plan-updated",
        playerId: id,
        subjectLabel: next.name || previous.name || "Squad player",
        message: `Updated squad plan for ${next.name || previous.name || "squad player"}.`,
        changes,
      });
    }
    afterMutation();
  }

  function updateTargetPlan(recordId, patch = {}) {
    const state = ensureState();
    const id = normalizeTransferRoomText(recordId, 180);
    if (!canAccess() || !id) {
      return;
    }
    const previous = { ...(state.targetPlans?.[id] || {}) };
    if (!previous.recordId) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "stage") && patch.stage !== previous.stage) {
      const preview = { ...previous, ...patch, recordId: id };
      const issues = getTransferRoomTargetStageGateIssues(preview, state);
      if (issues.length) {
        const issueLabels = issues.map((issue) => issue.label).join(", ");
        setTransferRoomNotice(state, {
          type: "error",
          recordId: id,
          message: `Stage gate blocked: ${previous.name || "target"} cannot move to ${String(patch.stage || "").replace(/-/g, " ")}.`,
          detail: `Missing or blocked: ${issueLabels}.`,
        });
        writeAuditEvent(state, {
          type: "stage-blocked",
          targetRecordId: id,
          subjectLabel: previous.name || "Transfer target",
          message: `Blocked stage move for ${previous.name || "transfer target"}.`,
          detail: `Requested ${patch.stage}. Missing or blocked: ${issueLabels}.`,
          changes: [{ field: "stage", label: "Stage", before: previous.stage, after: patch.stage }],
        });
        afterMutation();
        return;
      }
    }
    if (!applyTransferRoomTargetPlanPatch(state, id, patch)) {
      return;
    }
    const next = state.targetPlans?.[id] || {};
    const changes = getAuditChanges(previous, next, patch);
    if (changes.length) {
      if (Object.prototype.hasOwnProperty.call(patch, "stage")) {
        setTransferRoomNotice(state, {
          type: "success",
          recordId: id,
          message: `${next.name || "Target"} moved to ${String(next.stage || "").replace(/-/g, " ")}.`,
        });
      } else {
        clearTransferRoomNotice(state);
      }
      writeAuditEvent(state, {
        type: "target-plan-updated",
        targetRecordId: id,
        subjectLabel: next.name || previous.name || "Transfer target",
        message: `Updated transfer plan for ${next.name || previous.name || "transfer target"}.`,
        changes,
      });
    }
    afterMutation();
  }

  function setTargetApproval(recordId, roleId, status = "approved") {
    const state = ensureState();
    const id = normalizeTransferRoomText(recordId, 180);
    const role = transferRoomApprovalRoles.find((item) => item.id === roleId);
    if (!canAccess() || !id || !role || !state.targetPlans?.[id]) {
      return;
    }
    const previous = { ...(state.targetPlans[id] || {}) };
    const actor = getActorMeta();
    const nextStatus = status === "rejected" ? "rejected" : status === "pending" ? "pending" : "approved";
    const approvals = {
      ...(previous.approvals || {}),
      [role.id]: {
        roleId: role.id,
        label: role.label,
        status: nextStatus,
        actorId: nextStatus === "pending" ? "" : actor.actorId,
        actorName: nextStatus === "pending" ? "" : actor.actorName,
        actorRole: nextStatus === "pending" ? "" : actor.actorRole,
        decidedAt: nextStatus === "pending" ? "" : new Date().toISOString(),
      },
    };
    if (!applyTransferRoomTargetPlanPatch(state, id, { approvals })) {
      return;
    }
    const next = state.targetPlans[id] || {};
    setTransferRoomNotice(state, {
      type: nextStatus === "rejected" ? "warning" : nextStatus === "pending" ? "info" : "success",
      recordId: id,
      message: `${role.label} ${nextStatus === "pending" ? "reset" : nextStatus} for ${next.name || previous.name || "target"}.`,
    });
    writeAuditEvent(state, {
      type: "target-approval-updated",
      targetRecordId: id,
      subjectLabel: next.name || previous.name || "Transfer target",
      message: `${role.label} approval ${nextStatus} for ${next.name || previous.name || "transfer target"}.`,
      changes: [{
        field: `approval:${role.id}`,
        label: role.label,
        before: previous.approvals?.[role.id]?.status || "pending",
        after: nextStatus,
      }],
    });
    afterMutation();
  }

  function updateScenarioDraft(patch = {}) {
    const state = ensureState();
    if (!canAccess()) {
      return;
    }
    applyTransferRoomScenarioDraftPatch(state, patch);
    afterMutation();
  }

  function saveScenario(options = {}) {
    const state = ensureState();
    if (!canAccess()) {
      return;
    }
    if (options.name || options.notes) {
      applyTransferRoomScenarioDraftPatch(state, options);
    }
    const scenario = saveTransferRoomCurrentScenario(state);
    if (!scenario) {
      return;
    }
    setTransferRoomNotice(state, {
      type: "success",
      message: `${scenario.name} saved.`,
    });
    writeAuditEvent(state, {
      type: "scenario-saved",
      subjectLabel: scenario.name,
      message: `Saved scenario ${scenario.name}.`,
    });
    afterMutation();
  }

  function activateScenario(scenarioId) {
    const state = ensureState();
    if (!canAccess()) {
      return;
    }
    const scenario = activateTransferRoomScenario(state, scenarioId);
    if (!scenario) {
      return;
    }
    clearTransferRoomNotice(state);
    writeAuditEvent(state, {
      type: "scenario-activated",
      subjectLabel: scenario.name,
      message: `Activated scenario ${scenario.name}.`,
    });
    afterMutation();
  }

  function removeScenario(scenarioId) {
    const state = ensureState();
    if (!canAccess()) {
      return;
    }
    const scenario = removeTransferRoomScenario(state, scenarioId);
    if (!scenario) {
      return;
    }
    clearTransferRoomNotice(state);
    writeAuditEvent(state, {
      type: "scenario-removed",
      subjectLabel: scenario.name,
      message: `Removed scenario ${scenario.name}.`,
    });
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
    const id = normalizeTransferRoomText(recordId, 180);
    const previous = id ? state.targetPlans?.[id] : null;
    if (!canAccess() || !removeTransferRoomTargetFromState(state, id)) {
      return;
    }
    if (state.activeTargetProfileRecordId === id) {
      state.activeTargetProfileRecordId = "";
    }
    clearTransferRoomNotice(state);
    writeAuditEvent(state, {
      type: "target-removed",
      targetRecordId: id,
      subjectLabel: previous?.name || "Transfer target",
      message: `Removed ${previous?.name || "transfer target"} from Target board.`,
    });
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
    clearTransferRoomNotice(state);
    writeAuditEvent(state, {
      type: "access-updated",
      subjectLabel: "Transfer Room access",
      message: `${isSelected ? "Granted" : "Removed"} selected-person access.`,
      changes: [{ field: "access", label: "Access", before: isSelected ? "not selected" : "selected", after: isSelected ? "selected" : "not selected" }],
    });
    afterMutation();
  }

  function addTargetFromScoutingSnapshot(snapshot = {}, options = {}) {
    if (!canAccess()) {
      return false;
    }
    const state = ensureState();
    if (!addTransferRoomTargetSnapshot(state, snapshot, options)) {
      return false;
    }
    const recordId = normalizeTransferRoomText(snapshot.recordId || snapshot.id || options.recordId, 180);
    const plan = state.targetPlans?.[recordId] || {};
    clearTransferRoomNotice(state);
    writeAuditEvent(state, {
      type: "target-added",
      targetRecordId: recordId,
      subjectLabel: plan.name || snapshot.name || "Transfer target",
      message: `Added ${plan.name || snapshot.name || "transfer target"} to Target board.`,
    });
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
      setTargetApproval,
      updateScenarioDraft,
      saveScenario,
      activateScenario,
      removeScenario,
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
    setTargetApproval,
    updateScenarioDraft,
    saveScenario,
    activateScenario,
    removeScenario,
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
