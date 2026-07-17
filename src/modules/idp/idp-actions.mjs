import { buildIdpDashboardFromSquadState, buildLegacyPlayerDetail, findSquadPlayer } from "./idp-adapter.mjs";
import {
  normalizeIdpClipBankItem,
  normalizeIdpDevelopmentIntervention,
  normalizeIdpEvidence,
  normalizeIdpFocus,
  normalizeIdpDevelopmentGoal,
  normalizeIdpGoalCheckin,
  normalizeIdpMilestone,
  normalizeIdpNextAction,
  normalizeIdpProfile,
  normalizeIdpReview,
  normalizeText,
} from "./domain/idp.models.mjs";

function hasSource(value) {
  return value && typeof value === "object" && Object.keys(value).length > 0;
}

function numberOrFallback(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number(fallback || 0);
}

function hasOwn(source = {}, keys = []) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(source || {}, key));
}

function normalizeSyncPayload(payload = {}) {
  const source = payload.sync && typeof payload.sync === "object" ? payload.sync : payload;
  const revision = normalizeText(source.revision || source.updatedAt || source.updated_at, 120);
  return {
    revision,
    updatedAt: normalizeText(source.updatedAt || source.updated_at || revision, 120),
    checkedAt: new Date().toISOString(),
    playerId: normalizeText(source.playerId || source.player_id, 160),
  };
}

function isInactiveIdpProfile(profile = {}) {
  return normalizeText(profile.status, 40).toLowerCase() === "none";
}

function mergeProfileWithFallback(profile = {}, fallbackProfile = {}) {
  const fallback = normalizeIdpProfile(fallbackProfile || {});
  if (!hasSource(profile)) return fallback;
  const normalized = normalizeIdpProfile(profile);
  const sourceHasStatus = hasOwn(profile, ["status"]);
  const status = fallback.status === "none"
    ? fallback.status
    : sourceHasStatus
      ? normalized.status || fallback.status
      : fallback.status || normalized.status;
  return {
    ...fallback,
    ...normalized,
    id: normalized.id || fallback.id,
    playerId: normalized.playerId || fallback.playerId,
    playerName: normalized.playerName || fallback.playerName,
    squadNumber: normalized.squadNumber || fallback.squadNumber,
    position: normalized.position || fallback.position,
    role: normalized.role || fallback.role,
    photoUrl: normalized.photoUrl || fallback.photoUrl,
    ownerId: normalized.ownerId || fallback.ownerId,
    status,
    lastReviewOn: normalized.lastReviewOn || fallback.lastReviewOn,
    nextReviewOn: normalized.nextReviewOn || fallback.nextReviewOn,
    strengths: normalized.strengths.length ? normalized.strengths : fallback.strengths,
    leadershipProfile: normalized.leadershipProfile || fallback.leadershipProfile,
  };
}

function mergeFocusWithFallback(focus = null, fallbackFocus = null, playerId = "") {
  const fallback = fallbackFocus ? normalizeIdpFocus(fallbackFocus) : null;
  if (!hasSource(focus)) return fallback;
  const normalized = normalizeIdpFocus(focus);
  return {
    ...(fallback || {}),
    ...normalized,
    id: normalized.id || fallback?.id || "",
    playerId: normalized.playerId || fallback?.playerId || playerId,
    title: normalized.title || fallback?.title || "",
    description: normalized.description || fallback?.description || "",
    ownerId: normalized.ownerId || fallback?.ownerId || "",
    reviewDate: normalized.reviewDate || fallback?.reviewDate || "",
  };
}

function dashboardEntryPlayerId(entry = {}) {
  const profile = normalizeIdpProfile(entry.profile || {});
  if (profile.playerId) return profile.playerId;
  const focus = normalizeIdpFocus(entry.focus || {});
  return focus.playerId;
}

function normalizeDashboardEntry(entry = {}, fallbackEntry = {}) {
  const profile = mergeProfileWithFallback(entry.profile || {}, fallbackEntry.profile || {});
  const inactive = isInactiveIdpProfile(profile);
  const focus = inactive ? null : mergeFocusWithFallback(entry.focus || null, fallbackEntry.focus || null, profile.playerId);
  const nextAction = normalizeText(entry.nextAction, 180) || normalizeText(fallbackEntry.nextAction, 180);
  const overallStatus = normalizeText(entry.overallStatus, 80) || normalizeText(fallbackEntry.overallStatus || "On Track", 80);
  return {
    profile,
    focus,
    evidenceCount: numberOrFallback(entry.evidenceCount, fallbackEntry.evidenceCount),
    newClipCount: numberOrFallback(entry.newClipCount, fallbackEntry.newClipCount),
    nextAction: inactive ? "IDP inactive" : focus ? nextAction : "Create current focus",
    overallStatus: inactive ? "No Active IDP" : focus ? overallStatus : "No Active Focus",
  };
}

function normalizeDashboardPayload(payload = {}, fallbackPlayers = []) {
  const fallbackOrder = [];
  const playerMap = new Map();
  for (const entry of fallbackPlayers) {
    const normalized = normalizeDashboardEntry({}, entry);
    const playerId = normalized.profile.playerId || normalized.focus?.playerId || "";
    if (!playerId) continue;
    fallbackOrder.push(playerId);
    playerMap.set(playerId, normalized);
  }

  const extraOrder = [];
  const players = Array.isArray(payload.players) ? payload.players : [];
  for (const entry of players) {
    const playerId = dashboardEntryPlayerId(entry);
    const merged = normalizeDashboardEntry(entry, playerId ? playerMap.get(playerId) || {} : {});
    const mergedPlayerId = merged.profile.playerId || merged.focus?.playerId || playerId;
    if (!mergedPlayerId) continue;
    if (!playerMap.has(mergedPlayerId)) extraOrder.push(mergedPlayerId);
    playerMap.set(mergedPlayerId, merged);
  }

  return [...fallbackOrder, ...extraOrder].map((playerId) => playerMap.get(playerId)).filter(Boolean);
}

function mergePlayerPayloadWithFallback(detail = {}, fallbackDetail = null) {
  if (!fallbackDetail) return detail;
  const profile = mergeProfileWithFallback(detail.profile || {}, fallbackDetail.profile || {});
  const inactive = isInactiveIdpProfile(profile);
  const fallbackFocus = fallbackDetail.focuses?.[0] || null;
  const focuses = inactive
    ? []
    : detail.focuses.length
    ? detail.focuses.map((focus) => mergeFocusWithFallback(focus, fallbackFocus, profile.playerId)).filter(Boolean)
    : fallbackDetail.focuses || [];
  return {
    profile,
    focuses,
    clipBank: detail.clipBank.length ? detail.clipBank : fallbackDetail.clipBank || [],
    evidence: detail.evidence.length ? detail.evidence : fallbackDetail.evidence || [],
    reviews: detail.reviews.length ? detail.reviews : fallbackDetail.reviews || [],
    nextActions: inactive ? [] : detail.nextActions.length ? detail.nextActions : fallbackDetail.nextActions || [],
    goals: inactive ? [] : detail.goals.length ? detail.goals : fallbackDetail.goals || [],
    goalCheckins: inactive ? [] : detail.goalCheckins.length ? detail.goalCheckins : fallbackDetail.goalCheckins || [],
    milestones: detail.milestones.length ? detail.milestones : fallbackDetail.milestones || [],
    ownership: Array.isArray(detail.ownership) ? detail.ownership : fallbackDetail.ownership || [],
    interventions: detail.interventions.length ? detail.interventions : fallbackDetail.interventions || [],
  };
}

function normalizePlayerPayload(payload = {}, fallbackDetail = null) {
  const detail = {
    profile: normalizeIdpProfile(payload.profile || {}),
    focuses: (payload.focuses || []).map(normalizeIdpFocus),
    clipBank: (payload.clipBank || []).map(normalizeIdpClipBankItem),
    evidence: (payload.evidence || []).map(normalizeIdpEvidence),
    reviews: (payload.reviews || []).map(normalizeIdpReview),
    nextActions: (payload.nextActions || []).map(normalizeIdpNextAction),
    goals: (payload.goals || []).map(normalizeIdpDevelopmentGoal),
    goalCheckins: (payload.goalCheckins || []).map(normalizeIdpGoalCheckin),
    milestones: (payload.milestones || []).map(normalizeIdpMilestone),
    ownership: Array.isArray(payload.ownership) ? payload.ownership : [],
    interventions: (payload.interventions || []).map(normalizeIdpDevelopmentIntervention),
  };
  return mergePlayerPayloadWithFallback(detail, fallbackDetail);
}

function selectedPlayerIdFromState(state = {}) {
  return state.ui?.selectedPlayerId || "";
}

function persistedFocusId(focus = {}) {
  const id = normalizeText(focus?.id, 160);
  return id && !String(id).startsWith("legacy-focus-") ? id : "";
}

function persistedGoalId(goal = {}) {
  const id = normalizeText(goal?.id, 160);
  return id && !String(id).startsWith("legacy-goal-") ? id : "";
}

function primaryFocus(detail = {}) {
  return Array.isArray(detail?.focuses) ? detail.focuses[0] || null : null;
}

function hasActiveEditingSurface(ui = {}) {
  return Boolean(
    ui.actionMode ||
    ui.clipPreviewOpen ||
    ui.idpPlayerBoardOpen ||
    ui.idpPlayerBoardPreviewOpen
  );
}

function observationFocusTitle(detail = {}) {
  const focus = primaryFocus(detail);
  const title = normalizeText(focus?.title, 180);
  return title && title !== "Create current focus" ? title : "General development notes";
}

function observationFocusPayload(detail = {}, playerId = "") {
  const focus = primaryFocus(detail) || {};
  const profile = detail?.profile || {};
  return {
    playerId,
    title: observationFocusTitle(detail),
    category: focus.category || "Tactical",
    status: focus.status || "Active",
    reviewDate: focus.reviewDate || profile.nextReviewOn || "",
    ownerId: focus.ownerId || profile.ownerId || "",
  };
}

function numericFieldValue(value) {
  const text = normalizeText(value, 40);
  return text === "" ? "" : text;
}

function splitTokenList(value = "") {
  return String(value || "")
    .split(/[\n,]+/)
    .map((item) => normalizeText(item, 160))
    .filter(Boolean)
    .slice(0, 12);
}

export function createIdpActions({ store, api, context = {} }) {
  const getSquadState = () => context.getPlayerProfilesState?.() || {};

  async function loadDashboard() {
    const fallback = buildIdpDashboardFromSquadState(getSquadState());
    store.setState({ ui: { loading: true, error: "" }, dashboardPlayers: fallback });
    try {
      const payload = await api.loadDashboard();
      const dashboardPlayers = normalizeDashboardPayload(payload, fallback);
      store.setState({
        dashboardPlayers: dashboardPlayers.length ? dashboardPlayers : fallback,
        sync: normalizeSyncPayload(payload),
        ui: { loading: false, error: "", selectedPlayerId: store.getState().ui.selectedPlayerId || "" },
      });
    } catch (error) {
      store.setState({
        dashboardPlayers: fallback,
        ui: { loading: false, error: error.message || "IDP database is not available yet." },
      });
    }
  }

  async function selectPlayer(playerId, options = {}) {
    const safePlayerId = normalizeText(playerId, 160);
    const currentUi = store.getState().ui || {};
    store.setState({
      ui: {
        openFilterMenu: "",
        selectedPlayerId: safePlayerId,
        profileView: options.preserveProfileView ? currentUi.profileView || "development" : "development",
        actionMode: "",
        editEvidenceId: "",
        editGoalId: "",
        error: "",
        selectedClipBankIds: [],
        clipPreviewOpen: false,
        clipPreviewQueueIds: [],
        clipPreviewActiveIndex: 0,
        clipPreviewStatus: "",
        clipPreviewMessage: "",
        clipPreviewObjectUrl: "",
      },
    });
    const fallbackPlayer = findSquadPlayer(getSquadState(), safePlayerId);
    const fallbackDetail = fallbackPlayer ? buildLegacyPlayerDetail(fallbackPlayer) : null;
    if (fallbackPlayer) {
      store.setState({ playerDetail: fallbackDetail });
    }
    if (!safePlayerId) return;
    try {
      const payload = await api.loadPlayer(safePlayerId);
      const normalized = normalizePlayerPayload(payload, fallbackDetail);
      if (!normalized.profile.playerId && fallbackPlayer) {
        store.setState({ playerDetail: fallbackDetail, sync: normalizeSyncPayload(payload), ui: { error: "" } });
        return;
      }
      store.setState({ playerDetail: normalized, sync: normalizeSyncPayload(payload), ui: { error: "" } });
    } catch (error) {
      if (!fallbackPlayer) store.setState({ ui: { error: error.message || "Could not load player IDP." } });
    }
  }

  async function refreshSelectedPlayer() {
    const playerId = selectedPlayerIdFromState(store.getState());
    await loadDashboard();
    if (playerId) await selectPlayer(playerId, { preserveProfileView: true });
  }

  async function checkForExternalUpdates() {
    const currentState = store.getState();
    if (currentState.ui.loading || hasActiveEditingSurface(currentState.ui)) return false;
    const payload = await api.loadSync();
    const latestState = store.getState();
    if (latestState.ui.loading || hasActiveEditingSurface(latestState.ui)) return false;
    const nextSync = normalizeSyncPayload(payload);
    const currentRevision = normalizeText(latestState.sync?.revision, 120);
    if (!nextSync.revision || !currentRevision) {
      store.setState({ sync: nextSync });
      return false;
    }
    if (nextSync.revision === currentRevision) {
      store.setState({ sync: nextSync });
      return false;
    }
    await refreshSelectedPlayer();
    return true;
  }

  async function createFocus(formData) {
    const playerId = selectedPlayerIdFromState(store.getState());
    const payload = Object.fromEntries(formData.entries());
    const focusId = payload.focusId || payload.id || "";
    if (focusId && !String(focusId).startsWith("legacy-focus-")) {
      await api.updateFocus({ ...payload, id: focusId, playerId });
    } else {
      await api.createFocus({ ...payload, playerId });
    }
    store.setState({ ui: { actionMode: "", message: "Focus saved." } });
    await refreshSelectedPlayer();
  }

  async function archiveFocus(focusId = "") {
    const playerId = selectedPlayerIdFromState(store.getState());
    const safeFocusId = persistedFocusId({ id: focusId });
    if (!playerId || !safeFocusId) throw new Error("Current focus could not be archived.");
    await api.archiveFocus({ id: safeFocusId, playerId });
    store.setState({ ui: { actionMode: "", message: "Focus archived. Create a new current focus when you are ready." } });
    await refreshSelectedPlayer();
  }

  async function deleteFocus(focusId = "") {
    const playerId = selectedPlayerIdFromState(store.getState());
    const safeFocusId = persistedFocusId({ id: focusId });
    if (!playerId || !safeFocusId) throw new Error("Current focus could not be deleted.");
    await api.deleteFocus({ id: safeFocusId, playerId });
    store.setState({ ui: { actionMode: "", message: "Focus deleted from the active IDP view." } });
    await refreshSelectedPlayer();
  }

  async function ensureObservationFocus(playerId, detail = {}, formData) {
    const formFocusId = persistedFocusId({ id: formData.get("focusId") || "" });
    if (formFocusId) return formFocusId;
    const existingFocusId = persistedFocusId(primaryFocus(detail));
    if (existingFocusId) return existingFocusId;
    throw new Error("Create a current focus before adding observations.");
  }

  async function addEvidence(formData) {
    const playerId = selectedPlayerIdFromState(store.getState());
    const detail = store.getState().playerDetail;
    const focusId = await ensureObservationFocus(playerId, detail, formData);
    await api.addEvidence({
      playerId,
      focusId,
      evidenceType: formData.get("evidenceType"),
      note: formData.get("note"),
      sourceModule: "idp",
    });
    store.setState({ ui: { actionMode: "", message: "Observation added." } });
    await refreshSelectedPlayer();
  }

  async function updateEvidence(formData) {
    const playerId = selectedPlayerIdFromState(store.getState());
    const evidenceId = normalizeText(formData.get("evidenceId"), 160);
    if (!playerId || !evidenceId) throw new Error("Observation could not be updated.");
    await api.updateEvidence({
      id: evidenceId,
      playerId,
      evidenceType: formData.get("evidenceType"),
      note: formData.get("note"),
    });
    store.setState({ ui: { actionMode: "", editEvidenceId: "", message: "Observation updated." } });
    await refreshSelectedPlayer();
  }

  async function deleteEvidence(evidenceId = "") {
    const playerId = selectedPlayerIdFromState(store.getState());
    const safeEvidenceId = normalizeText(evidenceId, 160);
    if (!playerId || !safeEvidenceId) throw new Error("Observation could not be deleted.");
    await api.deleteEvidence({ id: safeEvidenceId, playerId });
    store.setState({ ui: { actionMode: "", editEvidenceId: "", message: "Observation deleted." } });
    await refreshSelectedPlayer();
  }

  async function removeClipBankItem(clipBankItemId = "") {
    const playerId = selectedPlayerIdFromState(store.getState());
    const safeClipBankItemId = normalizeText(clipBankItemId, 160);
    if (!playerId || !safeClipBankItemId) throw new Error("Clip could not be removed from the player Clip Bank.");
    await api.removeClipBankItem({ id: safeClipBankItemId, playerId });
    store.setState({ ui: { clipPreviewOpen: false, clipPreviewQueueIds: [], selectedClipBankIds: [], message: "Clip removed from this player's Clip Bank." } });
    await refreshSelectedPlayer();
  }

  async function savePlayerBoard(payload = {}) {
    const playerId = selectedPlayerIdFromState(store.getState());
    const safePayload = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
    const focusId = persistedFocusId({ id: safePayload.focusId || "" });
    if (!playerId || !focusId) {
      throw new Error("Create a current focus before saving Player Board.");
    }
    const interventionId = normalizeText(safePayload.id || safePayload.interventionId, 160);
    const rowVersion = numberOrFallback(safePayload.rowVersion, 0);
    if (interventionId && rowVersion > 0) {
      await api.updateIntervention({
        ...safePayload,
        id: interventionId,
        playerId,
        focusId,
        rowVersion,
      });
    } else {
      await api.createIntervention({
        ...safePayload,
        playerId,
        focusId,
      });
    }
    store.setState({
      ui: {
        idpPlayerBoardOpen: false,
        idpPlayerBoardPreviewOpen: false,
        idpPlayerBoardSelectedElementId: "",
        idpPlayerBoardSelectedElementIds: [],
        idpPlayerBoardSelectedInterventionId: "",
        message: "Player Board saved.",
      },
    });
    await refreshSelectedPlayer();
  }

  async function deletePlayerBoard(payload = {}) {
    const playerId = selectedPlayerIdFromState(store.getState());
    const interventionId = normalizeText(payload.id || payload.interventionId, 160);
    const rowVersion = numberOrFallback(payload.rowVersion, 0);
    if (!playerId || !interventionId || rowVersion <= 0) {
      throw new Error("Individual exercise could not be deleted.");
    }
    await api.archiveIntervention({
      id: interventionId,
      playerId,
      rowVersion,
    });
    store.setState({
      ui: {
        idpPlayerBoardOpen: false,
        idpPlayerBoardPreviewOpen: false,
        idpPlayerBoardSelectedElementId: "",
        idpPlayerBoardSelectedElementIds: [],
        idpPlayerBoardSelectedInterventionId: "",
        message: "Individual exercise deleted.",
      },
    });
    await refreshSelectedPlayer();
  }

  async function assignOwner(formData) {
    const playerId = selectedPlayerIdFromState(store.getState());
    const detail = store.getState().playerDetail;
    const focusId = formData.get("focusId") || detail?.focuses?.[0]?.id || "";
    const ownerId = formData.get("ownerId") || "";
    await api.assignOwner({ playerId, focusId, ownerId });
    store.setState({ ui: { actionMode: "", message: ownerId ? "IDP Coach assigned." : "IDP Coach cleared." } });
    await refreshSelectedPlayer();
  }

  async function completeReview(formData) {
    const playerId = selectedPlayerIdFromState(store.getState());
    const detail = store.getState().playerDetail;
    const focusId = formData.get("focusId") || detail?.focuses?.[0]?.id || "";
    await api.completeReview({
      playerId,
      focusId,
      progressSummary: formData.get("progressSummary"),
      evidenceSummary: formData.get("evidenceSummary"),
      coachNote: formData.get("coachNote"),
      nextAction: formData.get("nextAction"),
    });
    store.setState({ ui: { actionMode: "", message: "Review completed." } });
    await refreshSelectedPlayer();
  }

  async function saveGoal(formData) {
    const playerId = selectedPlayerIdFromState(store.getState());
    const detail = store.getState().playerDetail;
    const focusId = persistedFocusId({ id: formData.get("focusId") || "" }) || persistedFocusId(primaryFocus(detail));
    const goalId = persistedGoalId({ id: formData.get("goalId") || "" });
    const payload = {
      id: goalId,
      playerId,
      focusId,
      goalRole: formData.get("goalRole") || "supporting",
      category: formData.get("category") || "Tactical",
      title: formData.get("title") || "",
      description: formData.get("description") || "",
      metricLabel: formData.get("metricLabel") || "Coach observation",
      metricType: formData.get("metricType") || "observation",
      baselineValue: numericFieldValue(formData.get("baselineValue")),
      currentValue: numericFieldValue(formData.get("currentValue")),
      targetValue: numericFieldValue(formData.get("targetValue")),
      unit: formData.get("unit") || "",
      cadence: formData.get("cadence") || "weekly",
      dueOn: formData.get("dueOn") || "",
      status: formData.get("status") || "active",
    };
    if (goalId) {
      await api.updateGoal({ ...payload, rowVersion: formData.get("rowVersion") });
    } else {
      await api.createGoal(payload);
    }
    store.setState({ ui: { actionMode: "", message: "Development goal saved." } });
    await refreshSelectedPlayer();
  }

  async function addGoalCheckin(formData) {
    const playerId = selectedPlayerIdFromState(store.getState());
    const goalId = persistedGoalId({ id: formData.get("goalId") || "" });
    if (!playerId || !goalId) throw new Error("Development goal check-in could not be saved.");
    await api.addGoalCheckin({
      playerId,
      goalId,
      value: numericFieldValue(formData.get("value")),
      confidence: numericFieldValue(formData.get("confidence")),
      note: formData.get("note") || "",
      statusSnapshot: formData.get("statusSnapshot") || "",
      checkinOn: formData.get("checkinOn") || "",
    });
    store.setState({ ui: { actionMode: "", message: "Goal check-in added." } });
    await refreshSelectedPlayer();
  }

  async function archiveGoal(goalId = "") {
    const playerId = selectedPlayerIdFromState(store.getState());
    const safeGoalId = normalizeText(goalId, 160);
    const goal = (store.getState().playerDetail?.goals || []).find((item) => item.id === safeGoalId);
    if (!playerId || !goal?.id) throw new Error("Development goal could not be archived.");
    await api.archiveGoal({ id: goal.id, playerId, rowVersion: goal.rowVersion });
    store.setState({ ui: { actionMode: "", message: "Development goal archived." } });
    await refreshSelectedPlayer();
  }

  return {
    addEvidence,
    addGoalCheckin,
    archiveGoal,
    assignOwner,
    checkForExternalUpdates,
    completeReview,
    createFocus,
    archiveFocus,
    deleteFocus,
    deleteEvidence,
    loadDashboard,
    refreshSelectedPlayer,
    removeClipBankItem,
    savePlayerBoard,
    deletePlayerBoard,
    saveGoal,
    selectPlayer,
    updateEvidence,
  };
}
