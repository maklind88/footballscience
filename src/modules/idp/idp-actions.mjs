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

function normalizeDashboardPayload(payload = {}, fallbackPlayers = []) {
  const players = Array.isArray(payload.players) ? payload.players : fallbackPlayers;
  return players.map((entry = {}) => ({
    profile: normalizeIdpProfile(entry.profile || {}),
    focus: entry.focus ? normalizeIdpFocus(entry.focus) : null,
    evidenceCount: Number(entry.evidenceCount || 0),
    newClipCount: Number(entry.newClipCount || 0),
    nextAction: normalizeText(entry.nextAction, 180),
    overallStatus: normalizeText(entry.overallStatus || "On Track", 80),
  }));
}

function normalizePlayerPayload(payload = {}) {
  return {
    profile: normalizeIdpProfile(payload.profile || {}),
    focuses: (payload.focuses || []).map(normalizeIdpFocus),
    clipBank: (payload.clipBank || []).map(normalizeIdpClipBankItem),
    evidence: (payload.evidence || []).map(normalizeIdpEvidence),
    reviews: (payload.reviews || []).map(normalizeIdpReview),
    nextActions: (payload.nextActions || []).map(normalizeIdpNextAction),
    milestones: (payload.milestones || []).map(normalizeIdpMilestone),
    ownership: Array.isArray(payload.ownership) ? payload.ownership : [],
  };
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
    if (fallbackPlayer) {
      store.setState({ playerDetail: buildLegacyPlayerDetail(fallbackPlayer) });
    }
    if (!safePlayerId) return;
    try {
      const payload = await api.loadPlayer(safePlayerId);
      const normalized = normalizePlayerPayload(payload);
      if (!normalized.profile.playerId && fallbackPlayer) {
        store.setState({ playerDetail: buildLegacyPlayerDetail(fallbackPlayer), ui: { error: "" } });
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
    completeReview,
    createFocus,
    loadDashboard,
    refreshSelectedPlayer,
    selectPlayer,
  };
}
