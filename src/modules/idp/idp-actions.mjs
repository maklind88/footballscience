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

function parseBoardFrameIndex(value, total = 1) {
  const count = Math.max(1, Number(total) || 1);
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < count ? index : 0;
}

function normalizeBoardFrameArray(value = [], limit = 12) {
  return Array.isArray(value) ? value.slice(0, limit).map((item = {}) => ({ ...item })) : [];
}

function normalizeStoredBoardFrame(value = {}, index = 0) {
  const arrow = normalizeBoardFrameArray(value.arrows, 8)[0] || {};
  const arrowType = normalizeBoardArrowType(arrow.type, "run");
  const defaultLineStyle = arrowType === "pass" ? "dotted" : arrowType === "run" ? "dashed" : "solid";
  return {
    id: normalizeText(value.id || `frame-${index + 1}`, 80),
    label: normalizeText(value.label || (index === 0 ? "Start" : `Frame ${index + 1}`), 80),
    coachCue: normalizeText(value.coachCue || value.coach_cue, 220),
    playerCue: normalizeText(value.playerCue || value.player_cue, 220),
    clipAnchor: normalizeText(value.clipAnchor || value.clip_anchor, 160),
    player: {
      x: parseBoardNumber(value.player?.x, 50),
      y: parseBoardNumber(value.player?.y, 70),
    },
    referencePlayers: normalizeBoardFrameArray(value.referencePlayers, 6).map((item = {}, refIndex) => ({
      id: normalizeText(item.id || `reference-${refIndex + 1}`, 80),
      label: normalizeText(item.label || "REF", 24),
      x: parseBoardNumber(item.x, 50),
      y: parseBoardNumber(item.y, 44),
    })).filter((item) => item.label),
    cones: normalizeBoardFrameArray(value.cones, 12).map((item = {}, coneIndex) => ({
      id: normalizeText(item.id || `cone-${coneIndex + 1}`, 80),
      x: parseBoardNumber(item.x, coneIndex === 0 ? 40 : coneIndex === 1 ? 60 : 50),
      y: parseBoardNumber(item.y, coneIndex === 2 ? 42 : 58),
    })),
    zones: normalizeBoardFrameArray(value.zones, 6).map((item = {}, zoneIndex) => ({
      id: normalizeText(item.id || `zone-${zoneIndex + 1}`, 80),
      label: normalizeText(item.label || "Development zone", 80),
      x: parseBoardNumber(item.x, 36),
      y: parseBoardNumber(item.y, 32),
      width: parseBoardNumber(item.width, 28),
      height: parseBoardNumber(item.height, 22),
    })).filter((item) => item.label),
    arrows: arrow.label || arrow.type ? [{
      id: normalizeText(arrow.id || "arrow-1", 80),
      type: arrowType,
      label: normalizeText(arrow.label || "Action path", 80),
      color: normalizeBoardColor(arrow.color, arrowType === "pass" ? "#fbbf24" : "#38bdf8"),
      lineStyle: normalizeBoardLineStyle(arrow.lineStyle || arrow.line_style, defaultLineStyle),
      lineWidth: parseBoardLineWidth(arrow.lineWidth || arrow.line_width, 2.5),
      from: {
        x: parseBoardNumber(arrow.from?.x, 50),
        y: parseBoardNumber(arrow.from?.y, 70),
      },
      to: {
        x: parseBoardNumber(arrow.to?.x, 62),
        y: parseBoardNumber(arrow.to?.y, 42),
      },
    }] : [],
    notes: normalizeBoardFrameArray(value.notes, 6).map((item = {}, noteIndex) => ({
      id: normalizeText(item.id || `note-${noteIndex + 1}`, 80),
      text: normalizeText(item.text, 220),
      x: parseBoardNumber(item.x, 12),
      y: parseBoardNumber(item.y, 14),
    })).filter((item) => item.text),
  };
}

function parseStoredBoardFrames(value = "") {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.slice(0, 8).map((frame, index) => normalizeStoredBoardFrame(frame, index)) : [];
  } catch {
    return [];
  }
}

function parseBoardActive(value, fallback = true) {
  if (value === null || value === undefined) return fallback;
  return String(value || "").trim() !== "0";
}

function buildInterventionBoardFrame(formData, existingFrame = {}, index = 0) {
  const zoneLabel = normalizeText(formData.get("zoneLabel"), 80);
  const arrowLabel = normalizeText(formData.get("arrowLabel"), 80);
  const arrowType = normalizeBoardArrowType(formData.get("arrowType"), "run");
  const defaultLineStyle = arrowType === "pass" ? "dotted" : arrowType === "run" ? "dashed" : "solid";
  const noteText = normalizeText(formData.get("noteText"), 220);
  const frameLabel = normalizeText(formData.get("frameLabel"), 80);
  const frameCoachCue = normalizeText(formData.get("frameCoachCue"), 220);
  const framePlayerCue = normalizeText(formData.get("framePlayerCue"), 220);
  const frameClipAnchor = normalizeText(formData.get("frameClipAnchor"), 160);
  const referenceLabel = normalizeText(formData.get("referenceLabel"), 24);
  return {
    id: normalizeText(existingFrame.id || `frame-${index + 1}`, 80),
    label: frameLabel || existingFrame.label || (index === 0 ? "Start" : `Frame ${index + 1}`),
    coachCue: formData.has("frameCoachCue") ? frameCoachCue : existingFrame.coachCue || "",
    playerCue: formData.has("framePlayerCue") ? framePlayerCue : existingFrame.playerCue || "",
    clipAnchor: formData.has("frameClipAnchor") ? frameClipAnchor : existingFrame.clipAnchor || "",
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
    cones: [1, 2, 3]
      .filter((coneIndex) => parseBoardActive(formData.get(`cone${coneIndex}Active`), true))
      .map((coneIndex, activeIndex) => ({
        id: existingFrame.cones?.[activeIndex]?.id || `cone-${activeIndex + 1}`,
        x: parseBoardNumber(formData.get(`cone${coneIndex}X`), coneIndex === 1 ? 40 : coneIndex === 2 ? 60 : 50),
        y: parseBoardNumber(formData.get(`cone${coneIndex}Y`), coneIndex === 3 ? 42 : 58),
      })),
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
  };
}

function buildInterventionBoardState(formData) {
  const storedFrames = parseStoredBoardFrames(formData.get("boardFramesJson"));
  const activeFrameIndex = parseBoardFrameIndex(formData.get("activeFrameIndex"), storedFrames.length || 1);
  const activeFrame = buildInterventionBoardFrame(formData, storedFrames[activeFrameIndex], activeFrameIndex);
  const frames = storedFrames.length ? storedFrames : [activeFrame];
  frames[activeFrameIndex] = activeFrame;
  const primary = frames[activeFrameIndex] || frames[0] || activeFrame;
  return {
    schema: "idp-player-board-v2",
    activeFrameIndex,
    player: primary.player,
    referencePlayers: primary.referencePlayers,
    cones: primary.cones,
    zones: primary.zones,
    arrows: primary.arrows,
    notes: primary.notes,
    frames: frames.slice(0, 8),
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
        editGoalId: "",
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
        playerBoardTemplateId: "",
        playerBoardTemplateSearchQuery: "",
        playerBoardPreviewFrameIndex: 0,
        playerBoardPreviewPlaying: false,
        playerBoardHandoutOpen: false,
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
    if (currentState.ui.loading || currentState.ui.playerBoardOpen) return false;
    const payload = await api.loadSync();
    const nextSync = normalizeSyncPayload(payload);
    const currentRevision = normalizeText(currentState.sync?.revision, 120);
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
      goalId: formData.get("goalId") || "",
      title: formData.get("title") || "Individual exercise",
      objective: formData.get("objective") || "",
      coachingCue: formData.get("coachingCue") || "",
      successCriteria: splitTokenList(formData.get("successCriteria")),
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
    store.setState({ ui: { playerBoardOpen: true, playerBoardInterventionId: nextInterventionId || "", playerBoardTemplateId: "", actionMode: "", message: "Individual exercise saved." } });
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
    addGoalCheckin,
    archiveIntervention,
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
    saveIntervention,
    saveGoal,
    selectPlayer,
    updateEvidence,
  };
}
