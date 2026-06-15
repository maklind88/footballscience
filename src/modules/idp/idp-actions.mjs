import { buildIdpDashboardFromSquadState, buildLegacyPlayerDetail, findSquadPlayer } from "./idp-adapter.mjs";
import {
  normalizeIdpClipBankItem,
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

function mergeProfileWithFallback(profile = {}, fallbackProfile = {}) {
  const fallback = normalizeIdpProfile(fallbackProfile || {});
  if (!hasSource(profile)) return fallback;
  const normalized = normalizeIdpProfile(profile);
  return {
    ...fallback,
    ...normalized,
    id: normalized.id || fallback.id,
    playerId: normalized.playerId || fallback.playerId,
    playerName: normalized.playerName || fallback.playerName,
    position: normalized.position || fallback.position,
    role: normalized.role || fallback.role,
    ownerId: normalized.ownerId || fallback.ownerId,
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
  const focus = mergeFocusWithFallback(entry.focus || null, fallbackEntry.focus || null, profile.playerId);
  return {
    profile,
    focus,
    evidenceCount: numberOrFallback(entry.evidenceCount, fallbackEntry.evidenceCount),
    newClipCount: numberOrFallback(entry.newClipCount, fallbackEntry.newClipCount),
    nextAction: normalizeText(entry.nextAction, 180) || normalizeText(fallbackEntry.nextAction, 180),
    overallStatus: normalizeText(entry.overallStatus, 80) || normalizeText(fallbackEntry.overallStatus || "On Track", 80),
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
  const fallbackFocus = fallbackDetail.focuses?.[0] || null;
  const focuses = detail.focuses.length
    ? detail.focuses.map((focus) => mergeFocusWithFallback(focus, fallbackFocus, profile.playerId)).filter(Boolean)
    : fallbackDetail.focuses || [];
  return {
    profile,
    focuses,
    clipBank: detail.clipBank.length ? detail.clipBank : fallbackDetail.clipBank || [],
    evidence: detail.evidence.length ? detail.evidence : fallbackDetail.evidence || [],
    reviews: detail.reviews.length ? detail.reviews : fallbackDetail.reviews || [],
    nextActions: detail.nextActions.length ? detail.nextActions : fallbackDetail.nextActions || [],
    milestones: detail.milestones.length ? detail.milestones : fallbackDetail.milestones || [],
    ownership: Array.isArray(detail.ownership) ? detail.ownership : fallbackDetail.ownership || [],
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
  };
  return mergePlayerPayloadWithFallback(detail, fallbackDetail);
}

function selectedPlayerIdFromState(state = {}) {
  return state.ui?.selectedPlayerId || "";
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
        ui: { loading: false, error: "", selectedPlayerId: store.getState().ui.selectedPlayerId || "" },
      });
    } catch (error) {
      store.setState({
        dashboardPlayers: fallback,
        ui: { loading: false, error: error.message || "IDP database is not available yet." },
      });
    }
  }

  async function selectPlayer(playerId) {
    const safePlayerId = normalizeText(playerId, 160);
    store.setState({ ui: { selectedPlayerId: safePlayerId, error: "" } });
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
        store.setState({ playerDetail: fallbackDetail, ui: { error: "" } });
        return;
      }
      store.setState({ playerDetail: normalized, ui: { error: "" } });
    } catch (error) {
      if (!fallbackPlayer) store.setState({ ui: { error: error.message || "Could not load player IDP." } });
    }
  }

  async function refreshSelectedPlayer() {
    const playerId = selectedPlayerIdFromState(store.getState());
    await loadDashboard();
    if (playerId) await selectPlayer(playerId);
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

  async function addEvidence(formData) {
    const playerId = selectedPlayerIdFromState(store.getState());
    const detail = store.getState().playerDetail;
    const focusId = formData.get("focusId") || detail?.focuses?.[0]?.id || "";
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

  return {
    addEvidence,
    assignOwner,
    completeReview,
    createFocus,
    loadDashboard,
    refreshSelectedPlayer,
    selectPlayer,
  };
}
