import { createIdpActions } from "./idp-actions.mjs";
import { createIdpStore } from "./idp-state.mjs";
import { renderIdpWorkspace as renderMarkup } from "./idp-renderer.mjs";
import { confirmPlatformAction } from "../../core/platform-confirm-dialog.mjs";
import {
  bindIdpPlayerBoardEvents,
  getIdpPlayerBoardRuntimeUi,
  handleIdpPlayerBoardChange,
  handleIdpPlayerBoardClick,
  handleIdpPlayerBoardInput,
  persistIdpPlayerBoardDraft,
  resetIdpPlayerBoardRuntimeDraft,
} from "./idp-player-board-runtime.mjs";
import {
  closeClipPreview,
  ensureClipBankStyles,
  jumpClipPreview,
  moveClipPreview,
  openClipPreview,
  reconnectClipPreviewLocalFile,
  revokePreviewUrl,
  selectedClipIds,
  setClipPreviewSpeed,
  setupIdpClipPreviewPlayback,
  toggleClipPreviewPlayback,
  toggleClipBankSelection,
} from "./idp-clip-preview-controller.mjs";
import { createIdpApiService } from "./services/idp-api-service.mjs";

let runtime = null;
const IDP_SYNC_INTERVAL_MS = 30000;
const IDP_SYNC_FOCUS_COOLDOWN_MS = 5000;
function normalizeContext(context = {}) {
  return {
    ui: context.ui || {},
    win: context.win || globalThis,
    currentUser: context.currentUser || null,
    users: Array.isArray(context.users) ? context.users : [],
    formatUserName: typeof context.formatUserName === "function" ? context.formatUserName : null,
    team: context.team || null,
    teamName: context.teamName || context.team?.name || context.currentUser?.teamName || context.currentUser?.team || "",
    teamLogoUrl: context.teamLogoUrl || context.team?.logoUrl || context.team?.logo_url || context.currentUser?.teamLogoUrl || "",
    getAuthToken: typeof context.getAuthToken === "function" ? context.getAuthToken : () => "",
    getPlayerProfilesState:
      typeof context.getPlayerProfilesState === "function" ? context.getPlayerProfilesState : () => ({}),
    getExerciseLibrary:
      typeof context.getExerciseLibrary === "function" ? context.getExerciseLibrary : () => [],
    renderPlayerProfileScoutingSpider:
      typeof context.renderPlayerProfileScoutingSpider === "function" ? context.renderPlayerProfileScoutingSpider : () => "",
    canEdit: typeof context.canEdit === "function" ? context.canEdit : () => Boolean(context.canEdit),
  };
}

function canEdit(context = {}) {
  try {
    return Boolean(context.canEdit?.());
  } catch {
    return false;
  }
}

function normalizeText(value = "", fallback = "") {
  return String(value || fallback).trim().replace(/\s+/g, " ");
}

function normalizePositiveRowVersion(value = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function resolvePlayerBoardInterventionRowVersion(activeRuntime = runtime, interventionId = "") {
  const detail = activeRuntime?.store?.getState?.()?.playerDetail || {};
  const interventions = Array.isArray(detail.interventions) ? detail.interventions : [];
  const safeInterventionId = normalizeText(interventionId);
  const intervention = interventions.find((item) => String(item.id || "") === safeInterventionId) || {};
  const fromStore = normalizePositiveRowVersion(intervention.rowVersion);
  if (fromStore) return fromStore;
  const activeBlock = activeRuntime?.idpPlayerBoardActiveBlock || {};
  if (String(activeBlock.interventionId || "") === safeInterventionId) {
    return normalizePositiveRowVersion(activeBlock.rowVersion);
  }
  return 0;
}

function getRoot(context = {}) {
  return context.ui?.idpWorkspace || null;
}

function getDocument(activeRuntime) {
  return activeRuntime?.context?.win?.document || globalThis.document || null;
}

function ensureIdpProfileStyles(activeRuntime = runtime) {
  const doc = getDocument(activeRuntime);
  if (!doc?.head || doc.getElementById("idp-profile-focus-styles")) return;
  const link = doc.createElement("link");
  link.id = "idp-profile-focus-styles";
  link.rel = "stylesheet";
  link.href = "src/modules/idp/idp-profile-focus.css";
  doc.head.appendChild(link);
}

function scrollWorkspaceTop(activeRuntime = runtime) {
  const root = getRoot(activeRuntime?.context);
  if (!root) return;
  const win = activeRuntime?.context?.win || globalThis;
  const doc = getDocument(activeRuntime);
  const target = root.querySelector?.(".idp-player-profile, .idp-overview-board") || root;
  const scroll = () => {
    target.scrollIntoView?.({ block: "start", inline: "nearest" });
    doc?.scrollingElement?.scrollTo?.({ top: 0, left: 0 });
  };
  if (typeof win.requestAnimationFrame === "function") {
    win.requestAnimationFrame(scroll);
    return;
  }
  scroll();
}

function shouldRunSyncCheck(activeRuntime) {
  const root = getRoot(activeRuntime?.context);
  if (!root || root.isConnected === false) return false;
  const doc = getDocument(activeRuntime);
  return !doc?.hidden;
}

function queueSyncCheck(activeRuntime = runtime, options = {}) {
  if (!activeRuntime || !activeRuntime.initialized || !shouldRunSyncCheck(activeRuntime)) return;
  const now = Date.now();
  if (!options.force && activeRuntime.lastSyncCheckAt && now - activeRuntime.lastSyncCheckAt < IDP_SYNC_FOCUS_COOLDOWN_MS) {
    return;
  }
  if (activeRuntime.syncInFlight) return;
  activeRuntime.lastSyncCheckAt = now;
  activeRuntime.syncInFlight = true;
  Promise.resolve()
    .then(() => activeRuntime.actions.checkForExternalUpdates())
    .catch(() => {})
    .finally(() => {
      activeRuntime.syncInFlight = false;
    });
}

function startAutoSync(activeRuntime) {
  const win = activeRuntime?.context?.win || globalThis;
  if (!activeRuntime.syncIntervalId && typeof win.setInterval === "function") {
    activeRuntime.syncIntervalId = win.setInterval(() => queueSyncCheck(activeRuntime), IDP_SYNC_INTERVAL_MS);
  }
  if (activeRuntime.syncListening || typeof win.addEventListener !== "function") return;
  const onFocus = () => queueSyncCheck(activeRuntime, { force: true });
  const onVisibilityChange = () => queueSyncCheck(activeRuntime, { force: true });
  win.addEventListener("focus", onFocus);
  getDocument(activeRuntime)?.addEventListener?.("visibilitychange", onVisibilityChange);
  activeRuntime.syncListening = true;
  activeRuntime.syncListeners = { onFocus, onVisibilityChange };
}

function captureSearchFocus(activeRuntime = runtime) {
  const activeElement = getDocument(activeRuntime)?.activeElement;
  const isOverviewSearch = Boolean(activeElement?.matches?.("[data-idp-search]"));
  const isClipSearch = Boolean(activeElement?.matches?.("[data-idp-clip-search]"));
  const isPlayerBoardExerciseSearch = Boolean(activeElement?.matches?.("[data-idp-board-exercise-search]"));
  const isScoutingMetricSearch = Boolean(activeElement?.matches?.("[data-player-profile-scouting-metric-search]"));
  if (!isOverviewSearch && !isClipSearch && !isPlayerBoardExerciseSearch && !isScoutingMetricSearch) return null;
  const value = activeElement.value || "";
  return {
    preserveValue: isClipSearch || isPlayerBoardExerciseSearch || isScoutingMetricSearch,
    selector: isClipSearch
      ? "[data-idp-clip-search]"
      : isPlayerBoardExerciseSearch
        ? "[data-idp-board-exercise-search]"
        : isScoutingMetricSearch
          ? "[data-player-profile-scouting-metric-search]"
          : "[data-idp-search]",
    end: Number.isInteger(activeElement.selectionEnd) ? activeElement.selectionEnd : value.length,
    start: Number.isInteger(activeElement.selectionStart) ? activeElement.selectionStart : value.length,
    value,
  };
}

function restoreSearchFocus(activeRuntime = runtime, focusState = null) {
  if (!focusState) return;
  const input = getRoot(activeRuntime?.context)?.querySelector?.(focusState.selector || "[data-idp-search]");
  if (!input) return;
  if (focusState.preserveValue) input.value = focusState.value || "";
  const valueLength = input.value?.length || 0;
  const start = Math.min(focusState.start ?? valueLength, valueLength);
  const end = Math.min(focusState.end ?? start, valueLength);
  try {
    input.focus?.({ preventScroll: true });
  } catch {
    input.focus?.();
  }
  try {
    input.setSelectionRange?.(start, end);
  } catch {
    // Some browser/input combinations do not expose selection for this field.
  }
}

function paint(activeRuntime = runtime) {
  const root = getRoot(activeRuntime?.context);
  if (!root) return;
  ensureClipBankStyles(activeRuntime);
  ensureIdpProfileStyles(activeRuntime);
  const searchFocus = captureSearchFocus(activeRuntime);
  const state = activeRuntime.store.getState();
  const draftDetail = activeRuntime.idpPlayerBoardDraftDetail;
  const playerDetail = draftDetail?.profile?.playerId
    && draftDetail.profile.playerId === state.playerDetail?.profile?.playerId
    ? draftDetail
    : state.playerDetail;
  const renderState = {
    ...state,
    playerDetail,
    ui: getIdpPlayerBoardRuntimeUi(activeRuntime),
  };
  root.innerHTML = renderMarkup(renderState, {
    canEdit: canEdit(activeRuntime.context),
    currentUser: activeRuntime.context.currentUser,
    users: activeRuntime.context.users,
    formatUserName: activeRuntime.context.formatUserName,
    team: activeRuntime.context.team,
    teamLogoUrl: activeRuntime.context.teamLogoUrl,
    teamName: activeRuntime.context.teamName,
    exerciseLibraryTemplates: activeRuntime.context.getExerciseLibrary?.() || [],
    renderPlayerProfileScoutingSpider: activeRuntime.context.renderPlayerProfileScoutingSpider,
  });
  restoreSearchFocus(activeRuntime, searchFocus);
  setupIdpClipPreviewPlayback(activeRuntime);
  bindIdpPlayerBoardEvents(activeRuntime);
}

function ensureRuntime(context = {}) {
  const nextContext = normalizeContext(context);
  if (runtime) {
    Object.assign(runtime.context, nextContext);
    return runtime;
  }
  const store = createIdpStore();
  const api = createIdpApiService(nextContext);
  const actions = createIdpActions({ store, api, context: nextContext });
  runtime = {
    actions,
    api,
    context: nextContext,
    initialized: false,
    lastSyncCheckAt: 0,
    store,
    syncInFlight: false,
    syncIntervalId: 0,
    syncListening: false,
    syncListeners: null,
  };
  runtime.paint = paint;
  runtime.runAction = runAction;
  store.subscribe(() => paint(runtime));
  return runtime;
}

async function boot(activeRuntime) {
  if (activeRuntime.initialized) return;
  activeRuntime.initialized = true;
  await activeRuntime.actions.loadDashboard();
  const state = activeRuntime.store.getState();
  const playerId = state.ui.selectedPlayerId || "";
  if (playerId) {
    await activeRuntime.actions.selectPlayer(playerId, { preserveProfileView: true });
  }
}

function setError(error) {
  runtime?.store.setState({
    ui: {
      error: error?.message || "IDP action could not be completed.",
      loading: false,
      message: "",
    },
  });
}

function runAction(action) {
  Promise.resolve()
    .then(action)
    .catch(setError);
}

function confirmIdpAction(config = {}) {
  return confirmPlatformAction({
    eyebrow: "Player Development",
    tone: "danger",
    win: runtime?.context?.win || globalThis,
    ...config,
  });
}

function isTextEntryTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}

function getCheckedScoutingMetricIds(activeRuntime = runtime, selectionKey = "") {
  const root = getRoot(activeRuntime?.context);
  if (!root || !selectionKey) return [];
  const escapedSelectionKey = globalThis.CSS?.escape
    ? globalThis.CSS.escape(selectionKey)
    : String(selectionKey).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return [...root.querySelectorAll(`[data-player-profile-scouting-metric-key="${escapedSelectionKey}"]`)]
    .filter((input) => input.checked)
    .map((input) => input.dataset.playerProfileScoutingMetricToggle || "")
    .filter(Boolean);
}

function handleClipPreviewKeyboardDown(event, activeRuntime = runtime) {
  if (!activeRuntime?.store?.getState?.()?.ui?.clipPreviewOpen || isTextEntryTarget(event?.target)) return;
  const key = String(event?.key || "");
  if (key === "Escape") {
    event.preventDefault?.();
    closeClipPreview(activeRuntime);
    return;
  }
  if (key === "ArrowLeft") {
    event.preventDefault?.();
    moveClipPreview(activeRuntime, -1);
    return;
  }
  if (key === "ArrowRight") {
    event.preventDefault?.();
    moveClipPreview(activeRuntime, 1);
  }
}

function bindClipPreviewKeyboardEvents(activeRuntime = runtime) {
  const root = getRoot(activeRuntime?.context);
  if (!root || root.__idpClipPreviewKeyboardEventsBound) return;
  getDocument(activeRuntime)?.addEventListener?.("keydown", (event) => handleClipPreviewKeyboardDown(event, runtime));
  root.__idpClipPreviewKeyboardEventsBound = true;
}

export function render(context = {}) {
  const activeRuntime = ensureRuntime(context);
  paint(activeRuntime);
  startAutoSync(activeRuntime);
  bindClipPreviewKeyboardEvents(activeRuntime);
  runAction(() => boot(activeRuntime));
}

export function handleInput(event) {
  if (handleIdpPlayerBoardInput(event, runtime)) return;
  const target = event?.target;
  if (target?.matches?.("[data-idp-clip-search]")) {
    runtime?.store.setState({ ui: { clipBankSearchQuery: target.value || "" } });
    return;
  }
  if (target?.matches?.("[data-player-profile-scouting-metric-search]")) {
    const selectionKey = target.dataset.playerProfileScoutingMetricSearch || "";
    const currentQueries = runtime?.store.getState?.()?.ui?.scoutingMetricPickerSearchQueries || {};
    runtime?.store.setState({
      ui: {
        openScoutingMetricPickerKey: selectionKey,
        scoutingMetricPickerSearchQueries: {
          ...currentQueries,
          [selectionKey]: target.value || "",
        },
      },
    });
    return;
  }
  if (target?.matches?.("[data-idp-search]")) {
    runtime?.store.setState({ ui: { searchQuery: target.value || "" } });
  }
}

export function handleChange(event) {
  if (handleIdpPlayerBoardChange(event, runtime)) return;
  const target = event?.target;
  const scoutingMetricToggle = target?.closest?.("[data-player-profile-scouting-metric-toggle]");
  if (scoutingMetricToggle) {
    const selectionKey = scoutingMetricToggle.dataset.playerProfileScoutingMetricKey || "";
    const nextIds = getCheckedScoutingMetricIds(runtime, selectionKey).slice(0, 6);
    const currentSelections = runtime?.store.getState?.()?.ui?.scoutingMetricSelections || {};
    runtime?.store.setState({
      ui: {
        openScoutingMetricPickerKey: selectionKey,
        scoutingMetricSelections: {
          ...currentSelections,
          [selectionKey]: nextIds,
        },
      },
    });
    return;
  }
  const scoutingSeasonSelect = target?.closest?.("[data-player-profile-scouting-season-select]");
  if (scoutingSeasonSelect) {
    const selectionKey = scoutingSeasonSelect.dataset.playerProfileScoutingSeasonSelect || "";
    const currentSelections = runtime?.store.getState?.()?.ui?.scoutingSeasonSelections || {};
    runtime?.store.setState({
      ui: {
        scoutingSeasonSelections: {
          ...currentSelections,
          [selectionKey]: scoutingSeasonSelect.value || "",
        },
      },
    });
    return;
  }
  const clipSelect = target?.closest?.("[data-idp-clip-select]");
  if (clipSelect) {
    const id = clipSelect.dataset.idpClipSelect || "";
    toggleClipBankSelection(runtime, id, Boolean(clipSelect.checked));
    return;
  }
  const filter = target?.dataset?.idpFilter || "";
  if (!filter) return;
  if (filter === "status") runtime?.store.setState({ ui: { statusFilter: target.value || "All" } });
  if (filter === "category") runtime?.store.setState({ ui: { categoryFilter: target.value || "All" } });
  if (filter === "owner") runtime?.store.setState({ ui: { ownerFilter: target.value || "All" } });
}

export function handleClick(event) {
  if (handleIdpPlayerBoardClick(event, runtime)) return;
  const deletePlayerBoardTrigger = event?.target?.closest?.("[data-idp-board-delete]");
  if (deletePlayerBoardTrigger) {
    event?.preventDefault?.();
    runAction(async () => {
      const confirmed = await confirmIdpAction({
        title: "Delete individual exercise?",
        message: "Delete this exercise from the player's IDP exercise bank? The action is recorded in the development history.",
        confirmLabel: "Delete exercise",
      });
      if (!confirmed) return;
      const interventionId = deletePlayerBoardTrigger.dataset.idpBoardDelete || "";
      const fallbackRowVersion = resolvePlayerBoardInterventionRowVersion(runtime, interventionId);
      const rowVersion = Math.max(
        0,
        normalizePositiveRowVersion(deletePlayerBoardTrigger.dataset.idpBoardRowVersion)
          || fallbackRowVersion,
      );
      if (!rowVersion) {
        throw new Error("Individual exercise could not be deleted because row version is missing.");
      }
      await runtime?.actions.deletePlayerBoard({
        id: interventionId,
        rowVersion,
      });
      resetIdpPlayerBoardRuntimeDraft(runtime);
    });
    return;
  }
  const filterToggle = event?.target?.closest?.("[data-idp-filter-toggle]");
  if (filterToggle) {
    event?.preventDefault?.();
    const filter = filterToggle.dataset.idpFilterToggle || "";
    const currentOpen = runtime?.store.getState?.()?.ui?.openFilterMenu || "";
    runtime?.store.setState({ ui: { openFilterMenu: currentOpen === filter ? "" : filter } });
    return;
  }
  const filterOption = event?.target?.closest?.("[data-idp-filter-option]");
  if (filterOption) {
    event?.preventDefault?.();
    const filter = filterOption.dataset.idpFilterOption || "";
    const value = filterOption.dataset.idpFilterValue || "All";
    const uiPatch = { openFilterMenu: "" };
    if (filter === "category") uiPatch.categoryFilter = value || "All";
    if (filter === "owner") uiPatch.ownerFilter = value || "All";
    runtime?.store.setState({ ui: uiPatch });
    return;
  }
  if (!event?.target?.closest?.(".idp-stage-actions, .idp-coach-assist")) {
    getRoot(runtime?.context)?.querySelectorAll?.(".idp-stage-actions[open], .idp-coach-assist[open]")?.forEach((node) => {
      node.removeAttribute("open");
    });
  }
  const backTrigger = event?.target?.closest?.("[data-idp-back-overview]");
  if (backTrigger) {
    event?.preventDefault?.();
    revokePreviewUrl(runtime);
    runtime?.store.setState({ ui: { openFilterMenu: "", selectedPlayerId: "", profileView: "development", actionMode: "", editEvidenceId: "", editGoalId: "", error: "", message: "" } });
    scrollWorkspaceTop(runtime);
    return;
  }
  const profileViewTrigger = event?.target?.closest?.("[data-idp-profile-view]");
  if (profileViewTrigger) {
    event?.preventDefault?.();
    revokePreviewUrl(runtime);
    const requestedProfileView = profileViewTrigger.dataset.idpProfileView || "";
    const profileView = ["clip-bank", "player-board", "goals", "history"].includes(requestedProfileView) ? requestedProfileView : "development";
    runtime?.store.setState({
      ui: {
        profileView,
        actionMode: "",
        editEvidenceId: "",
        editGoalId: "",
        clipPreviewOpen: false,
        clipPreviewQueueIds: [],
        clipPreviewActiveIndex: 0,
        clipPreviewStatus: "",
        clipPreviewMessage: "",
        clipPreviewObjectUrl: "",
        idpPlayerBoardOpen: false,
        idpPlayerBoardPreviewOpen: false,
        error: "",
        message: "",
      },
    });
    scrollWorkspaceTop(runtime);
    return;
  }
  const openFilterMenu = runtime?.store.getState?.()?.ui?.openFilterMenu || "";
  if (openFilterMenu && !event?.target?.closest?.("[data-idp-filter-shell]")) {
    runtime?.store.setState({ ui: { openFilterMenu: "" } });
    return;
  }
  const clipPreviewClose = event?.target?.closest?.("[data-idp-clip-preview-close]");
  if (clipPreviewClose || event?.target?.matches?.("[data-idp-clip-preview-layer]")) {
    event?.preventDefault?.();
    closeClipPreview(runtime);
    return;
  }
  const clipPreviewPrev = event?.target?.closest?.("[data-idp-clip-preview-prev]");
  if (clipPreviewPrev) {
    event?.preventDefault?.();
    moveClipPreview(runtime, -1);
    return;
  }
  const clipPreviewNext = event?.target?.closest?.("[data-idp-clip-preview-next]");
  if (clipPreviewNext) {
    event?.preventDefault?.();
    moveClipPreview(runtime, 1);
    return;
  }
  const clipPreviewReconnect = event?.target?.closest?.("[data-idp-clip-preview-reconnect]");
  if (clipPreviewReconnect) {
    event?.preventDefault?.();
    reconnectClipPreviewLocalFile(runtime);
    return;
  }
  const clipPreviewJump = event?.target?.closest?.("[data-idp-clip-preview-jump]");
  if (clipPreviewJump) {
    event?.preventDefault?.();
    jumpClipPreview(runtime, Number(clipPreviewJump.dataset.idpClipPreviewJump || 0));
    return;
  }
  const clipPreviewToggle = event?.target?.closest?.("[data-idp-clip-preview-toggle]");
  if (clipPreviewToggle) {
    event?.preventDefault?.();
    toggleClipPreviewPlayback(runtime);
    return;
  }
  const clipPreviewSpeed = event?.target?.closest?.("[data-idp-clip-preview-speed]");
  if (clipPreviewSpeed) {
    event?.preventDefault?.();
    setClipPreviewSpeed(runtime, Number(clipPreviewSpeed.dataset.idpClipPreviewSpeed || 1));
    return;
  }
  const clipPlaySelected = event?.target?.closest?.("[data-idp-clip-play-selected]");
  if (clipPlaySelected) {
    event?.preventDefault?.();
    openClipPreview(runtime, selectedClipIds(runtime));
    return;
  }
  const clipPlay = event?.target?.closest?.("[data-idp-clip-play]");
  if (clipPlay) {
    event?.preventDefault?.();
    const id = clipPlay.dataset.idpClipPlay || "";
    const selectedIds = selectedClipIds(runtime);
    openClipPreview(runtime, selectedIds.length ? selectedIds : [id]);
    return;
  }
  const clipRemove = event?.target?.closest?.("[data-idp-clip-remove]");
  if (clipRemove) {
    event?.preventDefault?.();
    runAction(async () => {
      const confirmed = await confirmIdpAction({
        title: "Remove clip?",
        message: "Remove this clip from the player's IDP Clip Bank? The original video remains in Video Analysis.",
        confirmLabel: "Remove",
      });
      if (!confirmed) return;
      return runtime?.actions.removeClipBankItem(clipRemove.dataset.idpClipRemove || "");
    });
    return;
  }
  const searchTrigger = event?.target?.closest?.("[data-idp-search-submit]");
  if (searchTrigger) {
    event?.preventDefault?.();
    const root = getRoot(runtime?.context);
    const input = root?.querySelector?.("[data-idp-search]");
    runtime?.store.setState({ ui: { searchQuery: input?.value || "" } });
    const focusSearch = () => getRoot(runtime?.context)?.querySelector?.("[data-idp-search]")?.focus?.();
    const win = runtime?.context?.win || globalThis;
    if (typeof win.requestAnimationFrame === "function") {
      win.requestAnimationFrame(focusSearch);
    } else {
      focusSearch();
    }
    return;
  }
  const closeActionTrigger = event?.target?.closest?.("[data-idp-close-action]");
  if (closeActionTrigger || event?.target?.matches?.("[data-idp-action-layer]")) {
    runtime?.store.setState({ ui: { actionMode: "", editEvidenceId: "", editGoalId: "" } });
    return;
  }
  const archiveFocusTrigger = event?.target?.closest?.("[data-idp-archive-focus]");
  if (archiveFocusTrigger) {
    event?.preventDefault?.();
    runAction(async () => {
      const confirmed = await confirmIdpAction({
        title: "Archive focus?",
        message: "Archive this focus? It will leave the active IDP view and you can create a new current focus afterwards.",
        confirmLabel: "Archive",
      });
      if (!confirmed) return;
      return runtime?.actions.archiveFocus(archiveFocusTrigger.dataset.idpArchiveFocus || "");
    });
    return;
  }
  const deleteFocusTrigger = event?.target?.closest?.("[data-idp-delete-focus]");
  if (deleteFocusTrigger) {
    event?.preventDefault?.();
    runAction(async () => {
      const confirmed = await confirmIdpAction({
        title: "Delete focus?",
        message: "Delete this focus from the active IDP view? This cannot be undone from the player profile.",
        confirmLabel: "Delete",
      });
      if (!confirmed) return;
      return runtime?.actions.deleteFocus(deleteFocusTrigger.dataset.idpDeleteFocus || "");
    });
    return;
  }
  const editEvidenceTrigger = event?.target?.closest?.("[data-idp-edit-evidence]");
  if (editEvidenceTrigger) {
    event?.preventDefault?.();
    runtime?.store.setState({
      ui: {
        actionMode: "edit-evidence",
        editEvidenceId: editEvidenceTrigger.dataset.idpEditEvidence || "",
        error: "",
        message: "",
      },
    });
    return;
  }
  const deleteEvidenceTrigger = event?.target?.closest?.("[data-idp-delete-evidence]");
  if (deleteEvidenceTrigger) {
    event?.preventDefault?.();
    runAction(async () => {
      const confirmed = await confirmIdpAction({
        title: "Delete observation?",
        message: "Delete this observation?",
        confirmLabel: "Delete",
      });
      if (!confirmed) return;
      return runtime?.actions.deleteEvidence(deleteEvidenceTrigger.dataset.idpDeleteEvidence || "");
    });
    return;
  }
  const editGoalTrigger = event?.target?.closest?.("[data-idp-edit-goal]");
  if (editGoalTrigger) {
    event?.preventDefault?.();
    runtime?.store.setState({ ui: { actionMode: "edit-goal", editGoalId: editGoalTrigger.dataset.idpEditGoal || "", error: "", message: "" } });
    return;
  }
  const goalCheckinTrigger = event?.target?.closest?.("[data-idp-goal-checkin]");
  if (goalCheckinTrigger) {
    event?.preventDefault?.();
    runtime?.store.setState({ ui: { actionMode: "goal-checkin", editGoalId: goalCheckinTrigger.dataset.idpGoalCheckin || "", error: "", message: "" } });
    return;
  }
  const archiveGoalTrigger = event?.target?.closest?.("[data-idp-archive-goal]");
  if (archiveGoalTrigger) {
    event?.preventDefault?.();
    runAction(async () => {
      const confirmed = await confirmIdpAction({
        title: "Archive goal?",
        message: "Archive this development goal?",
        confirmLabel: "Archive",
      });
      if (!confirmed) return;
      return runtime?.actions.archiveGoal(archiveGoalTrigger.dataset.idpArchiveGoal || "");
    });
    return;
  }
  const actionTrigger = event?.target?.closest?.("[data-idp-action]");
  if (actionTrigger) {
    runtime?.store.setState({
      ui: {
        actionMode: actionTrigger.dataset.idpAction || "",
        editEvidenceId: "",
        editGoalId: "",
        error: "",
        message: "",
      },
    });
    return;
  }
  const statusFilterTrigger = event?.target?.closest?.("[data-idp-status-filter]");
  if (statusFilterTrigger) {
    runtime?.store.setState({ ui: { statusFilter: statusFilterTrigger.dataset.idpStatusFilter || "All" } });
    return;
  }
  const playerTrigger = event?.target?.closest?.("[data-idp-player]");
  if (playerTrigger) {
    revokePreviewUrl(runtime);
    runAction(async () => {
      await runtime?.actions.selectPlayer(playerTrigger.dataset.idpPlayer || "");
      scrollWorkspaceTop(runtime);
    });
    return;
  }
  const refreshTrigger = event?.target?.closest?.("[data-idp-refresh]");
  if (refreshTrigger) {
    runAction(() => runtime?.actions.refreshSelectedPlayer());
  }
}

export function handleSubmit(event) {
  const form = event?.target;
  if (!form?.matches?.("[data-idp-create-focus], [data-idp-add-evidence], [data-idp-update-evidence], [data-idp-complete-review], [data-idp-assign-owner], [data-idp-save-goal], [data-idp-add-goal-checkin]")) {
    return;
  }
  event.preventDefault();
  const formData = new FormData(form);
  if (form.matches("[data-idp-create-focus]")) {
    runAction(() => runtime?.actions.createFocus(formData));
  }
  if (form.matches("[data-idp-add-evidence]")) {
    runAction(() => runtime?.actions.addEvidence(formData));
  }
  if (form.matches("[data-idp-update-evidence]")) {
    runAction(() => runtime?.actions.updateEvidence(formData));
  }
  if (form.matches("[data-idp-complete-review]")) {
    runAction(() => runtime?.actions.completeReview(formData));
  }
  if (form.matches("[data-idp-assign-owner]")) {
    runAction(() => runtime?.actions.assignOwner(formData));
  }
  if (form.matches("[data-idp-save-goal]")) {
    runAction(() => runtime?.actions.saveGoal(formData));
  }
  if (form.matches("[data-idp-add-goal-checkin]")) {
    runAction(() => runtime?.actions.addGoalCheckin(formData));
  }
}

export function saveCurrentPlayerBoardDraft() {
  return persistIdpPlayerBoardDraft(runtime);
}
