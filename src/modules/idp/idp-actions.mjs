import { buildIdpDashboardFromSquadState, buildLegacyPlayerDetail, findSquadPlayer } from "./idp-adapter.mjs";
import {
  normalizeIdpClipBankItem,
  normalizeIdpDevelopmentIntervention,
  normalizeIdpEvidence,
  normalizeIdpFocus,
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
  return {
    profile,
    focus,
    evidenceCount: numberOrFallback(entry.evidenceCount, fallbackEntry.evidenceCount),
    newClipCount: numberOrFallback(entry.newClipCount, fallbackEntry.newClipCount),
    nextAction: inactive ? "IDP inactive" : normalizeText(entry.nextAction, 180) || normalizeText(fallbackEntry.nextAction, 180),
    overallStatus: inactive ? "No Active IDP" : normalizeText(entry.overallStatus, 80) || normalizeText(fallbackEntry.overallStatus || "On Track", 80),
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

function primaryFocus(detail = {}) {
  return Array.isArray(detail?.focuses) ? detail.focuses[0] || null : null;
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

function parseBoardNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number * 10) / 10)) : fallback;
}

function splitTokenList(value = "") {
  return String(value || "")
    .split(/[\n,]+/)
    .map((item) => normalizeText(item, 160))
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeBoardLineStyle(value = "", fallback = "dashed") {
  const normalized = normalizeText(value, 20).toLowerCase();
  return ["solid", "dashed", "dotted"].includes(normalized) ? normalized : fallback;
}

function normalizeBoardColor(value = "", fallback = "#38bdf8") {
  const normalized = normalizeText(value, 20);
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback;
}

function parseBoardLineWidth(value, fallback = 2.5) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(6, Math.max(.75, Math.round(number * 4) / 4)) : fallback;
}

function normalizeBoardArrowType(value = "", fallback = "run") {
  const normalized = normalizeText(value, 20).toLowerCase();
  return ["arrow", "pass", "run", "line", "curve"].includes(normalized) ? normalized : fallback;
}

function buildInterventionBoardState(formData) {
  const zoneLabel = normalizeText(formData.get("zoneLabel"), 80);
  const arrowLabel = normalizeText(formData.get("arrowLabel"), 80);
  const arrowType = normalizeBoardArrowType(formData.get("arrowType"), "run");
  const defaultLineStyle = arrowType === "pass" ? "dotted" : arrowType === "run" ? "dashed" : "solid";
  const noteText = normalizeText(formData.get("noteText"), 220);
  const frameLabel = normalizeText(formData.get("frameLabel"), 80);
  const referenceLabel = normalizeText(formData.get("referenceLabel"), 24);
  return {
    schema: "idp-player-board-v1",
    player: {
      x: parseBoardNumber(formData.get("playerX"), 50),
      y: parseBoardNumber(formData.get("playerY"), 70),
    },
    referencePlayers: referenceLabel ? [{
      id: "reference-1",
      label: referenceLabel,
      x: parseBoardNumber(formData.get("referenceX"), 50),
      y: parseBoardNumber(formData.get("referenceY"), 44),
    }] : [],
    cones: [
      { id: "cone-1", x: parseBoardNumber(formData.get("cone1X"), 40), y: parseBoardNumber(formData.get("cone1Y"), 58) },
      { id: "cone-2", x: parseBoardNumber(formData.get("cone2X"), 60), y: parseBoardNumber(formData.get("cone2Y"), 58) },
      { id: "cone-3", x: parseBoardNumber(formData.get("cone3X"), 50), y: parseBoardNumber(formData.get("cone3Y"), 42) },
    ],
    zones: zoneLabel ? [{
      id: "zone-1",
      label: zoneLabel,
      x: parseBoardNumber(formData.get("zoneX"), 36),
      y: parseBoardNumber(formData.get("zoneY"), 32),
      width: parseBoardNumber(formData.get("zoneWidth"), 28),
      height: parseBoardNumber(formData.get("zoneHeight"), 22),
    }] : [],
    arrows: arrowLabel ? [{
      id: "arrow-1",
      type: arrowType,
      label: arrowLabel,
      color: normalizeBoardColor(formData.get("arrowColor"), arrowType === "pass" ? "#fbbf24" : "#38bdf8"),
      lineStyle: normalizeBoardLineStyle(formData.get("arrowLineStyle"), defaultLineStyle),
      lineWidth: parseBoardLineWidth(formData.get("arrowLineWidth"), 2.5),
      from: {
        x: parseBoardNumber(formData.get("arrowFromX"), parseBoardNumber(formData.get("playerX"), 50)),
        y: parseBoardNumber(formData.get("arrowFromY"), parseBoardNumber(formData.get("playerY"), 70)),
      },
      to: {
        x: parseBoardNumber(formData.get("arrowToX"), 62),
        y: parseBoardNumber(formData.get("arrowToY"), 42),
      },
    }] : [],
    notes: noteText ? [{
      id: "note-1",
      text: noteText,
      x: parseBoardNumber(formData.get("noteX"), 12),
      y: parseBoardNumber(formData.get("noteY"), 14),
    }] : [],
    frames: frameLabel ? [{ id: "frame-1", label: frameLabel }] : [{ id: "frame-1", label: "Start" }],
    linkedClipIds: splitTokenList(formData.get("linkedClipIds")),
  };
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
        error: "",
        selectedClipBankIds: [],
        clipPreviewOpen: false,
        clipPreviewQueueIds: [],
        clipPreviewActiveIndex: 0,
        clipPreviewStatus: "",
        clipPreviewMessage: "",
        clipPreviewObjectUrl: "",
        playerBoardOpen: false,
        playerBoardInterventionId: "",
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
    if (store.getState().ui.loading) return false;
    const payload = await api.loadSync();
    const nextSync = normalizeSyncPayload(payload);
    const currentRevision = normalizeText(store.getState().sync?.revision, 120);
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

  async function ensureObservationFocus(playerId, detail = {}, formData) {
    const formFocusId = persistedFocusId({ id: formData.get("focusId") || "" });
    if (formFocusId) return formFocusId;
    const existingFocusId = persistedFocusId(primaryFocus(detail));
    if (existingFocusId) return existingFocusId;
    const created = await api.createFocus(observationFocusPayload(detail, playerId));
    const createdFocusId = normalizeText(created?.focus?.id, 160);
    if (!createdFocusId) throw new Error("Could not start an IDP focus for this observation.");
    return createdFocusId;
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

  async function ensureInterventionFocus(playerId, detail = {}, formData) {
    const formFocusId = persistedFocusId({ id: formData.get("focusId") || "" });
    if (formFocusId) return formFocusId;
    return ensureObservationFocus(playerId, detail, formData);
  }

  async function saveIntervention(formData) {
    const playerId = selectedPlayerIdFromState(store.getState());
    const detail = store.getState().playerDetail;
    const focusId = await ensureInterventionFocus(playerId, detail, formData);
    const interventionId = normalizeText(formData.get("interventionId"), 160);
    const payload = {
      id: interventionId,
      playerId,
      focusId,
      title: formData.get("title") || "Individual exercise",
      objective: formData.get("objective") || "",
      pitchMode: formData.get("pitchMode") || "half",
      status: formData.get("status") || "active",
      boardState: buildInterventionBoardState(formData),
    };
    let nextInterventionId = interventionId;
    if (interventionId) {
      await api.updateIntervention({
        ...payload,
        rowVersion: formData.get("rowVersion"),
      });
    } else {
      const result = await api.createIntervention(payload);
      nextInterventionId = normalizeText(result?.intervention?.id, 160);
    }
    await refreshSelectedPlayer();
    store.setState({ ui: { playerBoardOpen: true, playerBoardInterventionId: nextInterventionId || "", actionMode: "", message: "Individual exercise saved." } });
  }

  async function archiveIntervention(interventionId = "") {
    const playerId = selectedPlayerIdFromState(store.getState());
    const safeInterventionId = normalizeText(interventionId, 160);
    const intervention = (store.getState().playerDetail?.interventions || []).find((item) => item.id === safeInterventionId);
    if (!playerId || !intervention?.id) throw new Error("Individual exercise could not be archived.");
    await api.archiveIntervention({ id: intervention.id, playerId, rowVersion: intervention.rowVersion });
    await refreshSelectedPlayer();
    store.setState({ ui: { playerBoardInterventionId: "", playerBoardOpen: true, message: "Individual exercise archived." } });
  }

  return {
    addEvidence,
    archiveIntervention,
    assignOwner,
    checkForExternalUpdates,
    completeReview,
    createFocus,
    deleteEvidence,
    loadDashboard,
    refreshSelectedPlayer,
    saveIntervention,
    selectPlayer,
    updateEvidence,
  };
}
