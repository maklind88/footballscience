import {
  SET_PIECES_MAX_PHASES,
  SET_PIECES_MAX_VARIANTS,
  SET_PIECES_ONBOARDING_KEY,
  setPieceSubPhaseOptions,
} from "./constants.mjs";
import { createSetPieceAssignmentController } from "./assignment-controller.mjs";
import { resolveSetPiecePhaseAssignments } from "./assignments.mjs";
import { createSetPiecesBoardInteractionController } from "./board-interaction-controller.mjs";
import { createSetPiecesHistory } from "./history.mjs";
import { createSetPiecesPersistence } from "./persistence.mjs";
import { cloneSetPiecePlay } from "./play-helpers.mjs";
import { createSetPiecePlayerLabelMap, getSetPieceRosterPlayers } from "./player-labels.mjs";
import { createSetPiecesPlaybackController } from "./playback-controller.mjs";
import {
  renderSetPiecePlaybackFrame,
  revealActiveSetPiecePhase,
  updateSetPiecePlaybackView,
} from "./playback-view.mjs";
import {
  createSetPiecePlay,
  duplicateSetPiecePhase,
  duplicateSetPieceVariant,
  getActiveSetPiece,
  getActiveSetPiecePhase,
  getActiveSetPieceVariant,
  normalizeSetPiecesState,
} from "./state.mjs";
import { renderSetPieceBoard } from "./board-renderer.mjs";
import { renderSetPiecesWorkspace } from "./workspace-renderer.mjs";
import { syncSetPiecesWideEditorBoard } from "./wide-editor-board.mjs";
import { createSetPiecePlayerMarkerMenuController } from "./player-marker-menu.mjs";
import {
  clearSetPieceLibraryFilters,
  createSetPieceLibraryFilters,
  updateSetPieceLibraryFilter,
} from "./library-filters.mjs";

export function createSetPiecesRoomController(options = {}) {
  const root = options.root;
  const win = options.win || globalThis;
  const documentRef = options.documentRef || win.document;
  const persistence = createSetPiecesPersistence({ storage: options.storage, storageKey: options.storageKey });
  const preferenceStorage = options.storage || win.localStorage;
  const history = createSetPiecesHistory();
  let state = persistence.read();
  let bound = false;

  function hasDismissedOnboarding() {
    try {
      return preferenceStorage?.getItem?.(SET_PIECES_ONBOARDING_KEY) === "dismissed";
    } catch {
      return false;
    }
  }

  const ui = {
    activeTool: "select",
    searchQuery: "",
    libraryFilters: createSetPieceLibraryFilters(),
    libraryFiltersOpen: false,
    libraryOpen: false,
    selectedRosterId: "",
    selectedElementIds: new Set(),
    selectedDrawingIds: new Set(),
    selectedDrawingId: "",
    assignmentScope: "play",
    assignmentPickerSlotId: "",
    showAssignments: false,
    layers: new Set(["home", "opponent", "ball", "drawings", "labels"]),
    showGhost: true,
    editShowGhost: true,
    previewDrawing: null,
    selectionRect: null,
    playbackSpeed: 1,
    playbackProgress: 0,
    isPlaying: false,
    isPaused: false,
    loopPlayback: false,
    presentationMode: false,
    inspectorCollapsed: true,
    saveState: "saved",
    saveMessage: "Saved to team",
    notice: null,
    onboardingOpen: !hasDismissedOnboarding(),
    playerMarkerMenu: null,
  };

  function getRoster() {
    const roster = getSetPieceRosterPlayers(options.getPlayerProfilesState?.() || {});
    if (!roster.some((player) => player.id === ui.selectedRosterId)) ui.selectedRosterId = roster[0]?.id || "";
    return roster;
  }

  function getContext() {
    const play = getActiveSetPiece(state);
    const variant = getActiveSetPieceVariant(play || {});
    const phase = getActiveSetPiecePhase(variant || {});
    return { play, variant, phase };
  }

  function canEdit() {
    return options.canEdit?.() !== false;
  }

  function canDelete() {
    return options.canDelete?.() !== false;
  }

  function setNotice(message = "", tone = "warning") {
    ui.notice = message ? { message, tone } : null;
    render();
  }

  function getActorId() {
    const user = options.getCurrentUser?.() || {};
    return String(user.id || user.userId || user.email || "").trim();
  }

  function touch(play = getActiveSetPiece(state)) {
    const now = new Date().toISOString();
    state.updatedAt = now;
    if (play) {
      play.updatedAt = now;
      play.updatedBy = getActorId();
    }
  }

  function save() {
    ui.saveState = "saving";
    ui.saveMessage = "Saving to team";
    const result = persistence.write(state);
    state = result.state;
    if (!result.ok) {
      ui.saveState = "error";
      ui.saveMessage = "Save failed";
    }
    return result.ok;
  }

  function setSyncStatus(status = "", message = "") {
    const normalized = status === "issue" || status === "conflict" ? "error" : status;
    ui.saveState = ["saving", "saved", "error"].includes(normalized) ? normalized : "error";
    if (normalized === "saved") {
      const time = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date());
      ui.saveMessage = `Saved to team ${time}`;
    } else if (normalized === "saving") {
      ui.saveMessage = "Saving to team";
    } else {
      ui.saveMessage = message || "Sync needs attention";
    }
    const statusNode = root?.querySelector?.(".spr-save-state");
    if (statusNode) {
      statusNode.className = `spr-save-state is-${ui.saveState}${ui.saveState !== "error" ? " sr-only" : ""}`;
      statusNode.textContent = ui.saveMessage;
    }
  }

  function commit(mutator, { recordHistory = true } = {}) {
    if (!canEdit()) return false;
    playback.stop();
    if (recordHistory) history.record(state);
    mutator(state);
    touch();
    state = normalizeSetPiecesState(state);
    save();
    render();
    return true;
  }

  function rendererUi() {
    return {
      ...ui,
      canAddToTeamMeeting: typeof options.onAddToTeamMeeting === "function",
      canDelete: canDelete(),
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      fullscreenAvailable: documentRef?.fullscreenEnabled === true && typeof root?.requestFullscreen === "function" && typeof documentRef?.exitFullscreen === "function",
      nativeFullscreen: documentRef?.fullscreenElement === root,
    };
  }

  function render() {
    if (!root) return;
    const roster = getRoster();
    const team = options.getTeamIdentity?.() || {};
    root.innerHTML = renderSetPiecesWorkspace({ state, roster, team, ui: rendererUi(), canEdit: canEdit(), canDelete: canDelete() });
    revealActiveSetPiecePhase(root);
    syncSetPiecesWideEditorBoard(root, win);
  }

  function renderBoardOnly() {
    const stage = root?.querySelector?.("[data-set-piece-board-stage]");
    const { play, variant, phase } = getContext();
    if (!stage || !play || !variant || !phase) return;
    const phaseIndex = variant.phases.findIndex((item) => item.id === phase.id);
    const roster = getRoster();
    const resolvedPhase = resolveSetPiecePhaseAssignments(phase, play, variant, roster);
    const resolvedPreviousPhase = ui.showGhost && phaseIndex > 0
      ? resolveSetPiecePhaseAssignments(variant.phases[phaseIndex - 1], play, variant, roster)
      : null;
    stage.innerHTML = renderSetPieceBoard({
      phase: resolvedPhase,
      previousPhase: resolvedPreviousPhase,
      pitchView: play.pitchView,
      playerMarkerMode: play.playerMarkerMode,
      layers: ui.layers,
      selectedElementIds: ui.selectedElementIds,
      selectedDrawingIds: ui.selectedDrawingIds,
      selectedDrawingId: ui.selectedDrawingId,
      previewDrawing: ui.previewDrawing,
      selectionRect: ui.selectionRect,
      interactive: canEdit() && !ui.presentationMode,
      wideEditor: !ui.presentationMode,
    });
    syncSetPiecesWideEditorBoard(root, win);
  }

  let activePlaybackRouteIds = new Set();

  const playback = createSetPiecesPlaybackController({
    win,
    getContext,
    onFrame(positions, progress) {
      ui.playbackProgress = Number(progress || 0);
      activePlaybackRouteIds = renderSetPiecePlaybackFrame(root, activePlaybackRouteIds, positions);
      updateSetPiecePlaybackView(root, ui, getContext());
    },
    onPhaseChange(phaseId) {
      const { variant } = getContext();
      if (!variant) return;
      variant.activePhaseId = phaseId;
      ui.playbackProgress = 0;
      ui.selectedDrawingIds.clear();
      ui.selectedDrawingId = "";
      activePlaybackRouteIds.clear();
      render();
    },
    onResetFrame() {
      activePlaybackRouteIds.clear();
      renderBoardOnly();
    },
    onStatus(status) {
      ui.isPlaying = status.isPlaying;
      ui.isPaused = status.isPaused;
      ui.playbackSpeed = status.speed;
      ui.loopPlayback = status.loop;
      if (!status.isPlaying && !status.isPaused) ui.playbackProgress = 0;
      updateSetPiecePlaybackView(root, ui, getContext());
    },
  });

  function selectPlay(playId) {
    if (!state.plays.some((play) => play.id === playId)) return;
    playback.stop();
    state.activePlayId = playId;
    ui.selectedElementIds.clear();
    ui.selectedDrawingIds.clear();
    ui.selectedDrawingId = "";
    ui.assignmentPickerSlotId = "";
    ui.showAssignments = false;
    ui.libraryFiltersOpen = false;
    ui.libraryOpen = false;
    render();
  }

  function selectVariant(variantId) {
    const { play } = getContext();
    if (!play?.variants.some((variant) => variant.id === variantId)) return;
    playback.stop();
    play.activeVariantId = variantId;
    ui.selectedElementIds.clear();
    ui.selectedDrawingIds.clear();
    ui.selectedDrawingId = "";
    ui.assignmentPickerSlotId = "";
    render();
  }

  function selectAdjacentVariant(direction) {
    const { play, variant } = getContext();
    if (!play || !variant) return;
    const index = play.variants.findIndex((item) => item.id === variant.id);
    const next = play.variants[index + direction];
    if (next) selectVariant(next.id);
  }

  function selectPhase(phaseId) {
    const { variant } = getContext();
    if (!variant?.phases.some((phase) => phase.id === phaseId)) return;
    playback.stop();
    variant.activePhaseId = phaseId;
    ui.selectedElementIds.clear();
    ui.selectedDrawingIds.clear();
    ui.selectedDrawingId = "";
    ui.assignmentPickerSlotId = "";
    render();
  }

  function createNewPlay() {
    ui.libraryFiltersOpen = false;
    ui.libraryOpen = false;
    commit((nextState) => {
      const play = createSetPiecePlay({ updatedBy: getActorId() });
      nextState.plays.unshift(play);
      nextState.activePlayId = play.id;
    });
  }

  function duplicateCurrentPlay() {
    const { play } = getContext();
    if (!play) return;
    commit((nextState) => {
      const copy = cloneSetPiecePlay(play, getActorId());
      nextState.plays.unshift(copy);
      nextState.activePlayId = copy.id;
    });
  }

  function deleteCurrentPlay() {
    const { play } = getContext();
    if (!canDelete()) return setNotice("Only coaches and admins can delete set pieces.");
    const usage = options.getTeamMeetingReferenceUsage?.({ playId: play?.id }) || {};
    if (usage.count) return setNotice(`Used in ${usage.count} Team Meeting slide${usage.count === 1 ? "" : "s"}. Remove the slide${usage.count === 1 ? "" : "s"} there before deleting this set piece.`);
    if (!play || !win.confirm?.(`Delete “${play.title}”?`)) return;
    commit((nextState) => {
      nextState.plays = nextState.plays.filter((item) => item.id !== play.id);
      nextState.activePlayId = nextState.plays[0]?.id || "";
    });
  }

  function addVariant() {
    const { play, variant } = getContext();
    if (!play || !variant || play.variants.length >= SET_PIECES_MAX_VARIANTS) return;
    commit(() => {
      const copy = duplicateSetPieceVariant(variant, `Variant ${play.variants.length + 1}`);
      play.variants.push(copy);
      play.activeVariantId = copy.id;
    });
  }

  function deleteVariant() {
    const { play, variant } = getContext();
    if (!canDelete()) return setNotice("Only coaches and admins can delete variants.");
    const usage = options.getTeamMeetingReferenceUsage?.({ playId: play?.id, variantId: variant?.id }) || {};
    if (usage.count) return setNotice(`This variant is used in ${usage.count} Team Meeting slide${usage.count === 1 ? "" : "s"}. Remove the slide${usage.count === 1 ? "" : "s"} there before deleting the variant.`);
    if (!play || !variant || play.variants.length <= 1 || !win.confirm?.(`Delete “${variant.title}”?`)) return;
    commit(() => {
      play.variants = play.variants.filter((item) => item.id !== variant.id);
      play.activeVariantId = play.variants[0].id;
    });
  }

  function addPhase() {
    const { variant, phase } = getContext();
    if (!variant || !phase || variant.phases.length >= SET_PIECES_MAX_PHASES) return;
    commit(() => {
      const index = variant.phases.findIndex((item) => item.id === phase.id);
      const copy = duplicateSetPiecePhase(phase, index + 1);
      variant.phases.splice(index + 1, 0, copy);
      variant.activePhaseId = copy.id;
    });
  }

  function deletePhase() {
    const { variant, phase } = getContext();
    if (!canDelete()) return setNotice("Only coaches and admins can delete phases.");
    if (!variant || !phase || variant.phases.length <= 1 || !win.confirm?.(`Delete “${phase.title}”?`)) return;
    commit(() => {
      const index = variant.phases.findIndex((item) => item.id === phase.id);
      variant.phases.splice(index, 1);
      variant.activePhaseId = variant.phases[Math.max(0, index - 1)].id;
    });
  }

  function movePhase(direction) {
    const { variant, phase } = getContext();
    if (!variant || !phase) return;
    const index = variant.phases.findIndex((item) => item.id === phase.id);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= variant.phases.length) return;
    commit(() => {
      const [moved] = variant.phases.splice(index, 1);
      variant.phases.splice(targetIndex, 0, moved);
    });
  }

  function selectAdjacentPhase(direction) {
    const { variant, phase } = getContext();
    if (!variant || !phase) return;
    const index = variant.phases.findIndex((item) => item.id === phase.id);
    const next = variant.phases[Math.min(variant.phases.length - 1, Math.max(0, index + direction))];
    if (next) selectPhase(next.id);
  }

  function restartPlayback() {
    const { variant } = getContext();
    const firstPhase = variant?.phases?.[0];
    if (firstPhase) selectPhase(firstPhase.id);
  }

  function deleteSelection() {
    const { variant, phase } = getContext();
    if (!variant || !phase) return;
    const elementIds = new Set(ui.selectedElementIds);
    const homeElementIds = new Set(phase.elements
      .filter((element) => element.kind === "home-player" && elementIds.has(element.id))
      .map((element) => element.id));
    const drawingIds = new Set(ui.selectedDrawingIds);
    if (ui.selectedDrawingId) drawingIds.add(ui.selectedDrawingId);
    if (!elementIds.size && !drawingIds.size) return;
    if (!canDelete()) return setNotice("Only coaches and admins can delete board content.");
    commit(() => {
      const startIndex = variant.phases.findIndex((item) => item.id === phase.id);
      variant.phases.forEach((item, index) => {
        item.elements = item.elements.filter((element) => (
          !homeElementIds.has(element.id) && (index < startIndex || !elementIds.has(element.id))
        ));
      });
      phase.drawings = phase.drawings.filter((drawing) => !drawingIds.has(drawing.id));
      ui.selectedElementIds.clear();
      ui.selectedDrawingIds.clear();
      ui.selectedDrawingId = "";
    });
  }

  function undo() {
    const previous = history.undo(state);
    if (!previous) return;
    playback.stop();
    state = normalizeSetPiecesState(previous);
    save();
    render();
  }

  function redo() {
    const next = history.redo(state);
    if (!next) return;
    playback.stop();
    state = normalizeSetPiecesState(next);
    save();
    render();
  }

  function finalizeDirectMutation(beforeState) {
    history.record(beforeState);
    touch();
    save();
    render();
  }

  function setWorkspaceMode(presentationMode) {
    playback.stop();
    const nextPresentationMode = Boolean(presentationMode);
    if (nextPresentationMode && !ui.presentationMode) {
      ui.editShowGhost = ui.showGhost;
      ui.showGhost = false;
    } else if (!nextPresentationMode && ui.presentationMode) {
      ui.showGhost = ui.editShowGhost;
    }
    ui.presentationMode = nextPresentationMode;
    ui.activeTool = "select";
    ui.previewDrawing = null;
    ui.selectionRect = null;
    ui.selectedElementIds.clear();
    ui.selectedDrawingIds.clear();
    ui.selectedDrawingId = "";
    ui.assignmentPickerSlotId = "";
    ui.showAssignments = false;
    ui.libraryFiltersOpen = false;
    ui.libraryOpen = false;
    if (!nextPresentationMode && documentRef?.fullscreenElement === root) {
      documentRef.exitFullscreen?.().catch?.(() => {});
    }
    render();
  }

  function toggleFullscreen() {
    if (!ui.presentationMode) return;
    const request = root?.requestFullscreen;
    if (documentRef?.fullscreenElement === root) {
      documentRef.exitFullscreen?.().catch?.(() => {});
      return;
    }
    request?.call(root)?.catch?.(() => setNotice("Fullscreen is not available in this browser.", "warning"));
  }

  function addCurrentVariantToTeamMeeting() {
    const { play, variant } = getContext();
    if (!play || !variant || typeof options.onAddToTeamMeeting !== "function") return;
    options.onAddToTeamMeeting({
      playId: play.id,
      playTitle: play.title,
      variantId: variant.id,
      variantTitle: variant.title,
      scheduledFor: play.scheduledFor,
    });
  }

  function setInspectorOpen(open) {
    ui.inspectorCollapsed = !open;
    render();
    if (!open) {
      win.requestAnimationFrame?.(() => root?.querySelector?.('[data-set-piece-action="toggle-inspector"]')?.focus?.());
    }
  }

  function dismissOnboarding() {
    ui.onboardingOpen = false;
    try {
      preferenceStorage?.setItem?.(SET_PIECES_ONBOARDING_KEY, "dismissed");
    } catch {
      // The introduction still closes when browser storage is unavailable.
    }
    render();
    win.requestAnimationFrame?.(() => root?.querySelector?.('[data-set-piece-tool="select"]')?.focus?.());
  }

  function handleAction(action) {
    const actions = {
      "new-play": createNewPlay,
      "duplicate-play": duplicateCurrentPlay,
      "delete-play": deleteCurrentPlay,
      "add-variant": addVariant,
      "delete-variant": deleteVariant,
      "add-phase": addPhase,
      "delete-phase": deletePhase,
      "move-phase-left": () => movePhase(-1),
      "move-phase-right": () => movePhase(1),
      "previous-phase": () => selectAdjacentPhase(-1),
      "next-phase": () => selectAdjacentPhase(1),
      "previous-variant": () => selectAdjacentVariant(-1),
      "next-variant": () => selectAdjacentVariant(1),
      "restart-playback": restartPlayback,
      "toggle-play": () => playback.toggle(),
      stop: () => playback.stop(),
      "toggle-loop": () => playback.setLoop(!ui.loopPlayback),
      undo,
      redo,
      "delete-selection": deleteSelection,
      presentation: () => setWorkspaceMode(!ui.presentationMode),
      "edit-mode": () => setWorkspaceMode(false),
      "present-mode": () => setWorkspaceMode(true),
      "toggle-fullscreen": toggleFullscreen,
      "add-to-team-meeting": addCurrentVariantToTeamMeeting,
      "dismiss-notice": () => setNotice(""),
      "dismiss-onboarding": dismissOnboarding,
      "toggle-library": () => setLibraryOpen(!ui.libraryOpen),
      "close-library": () => setLibraryOpen(false),
      "toggle-library-filters": () => setLibraryFiltersOpen(!ui.libraryFiltersOpen),
      "clear-library-filters": clearLibraryFilters,
      "toggle-inspector": () => setInspectorOpen(ui.inspectorCollapsed),
      "close-inspector": () => setInspectorOpen(false),
      "show-assignments": () => assignmentController.showOverview(true),
      "show-plan": () => assignmentController.showOverview(false),
    };
    actions[action]?.();
  }

  function setLibraryOpen(open) {
    ui.libraryOpen = Boolean(open) && !ui.presentationMode;
    if (!ui.libraryOpen) ui.libraryFiltersOpen = false;
    render();
    const focusTarget = ui.libraryOpen ? "[data-set-piece-search]" : '[data-set-piece-action="toggle-library"]';
    win.requestAnimationFrame?.(() => root?.querySelector?.(focusTarget)?.focus?.());
  }

  function setLibraryFiltersOpen(open) {
    ui.libraryFiltersOpen = Boolean(open) && ui.libraryOpen;
    render();
    const focusTarget = ui.libraryFiltersOpen
      ? "[data-set-piece-library-filter-group]"
      : '[data-set-piece-action="toggle-library-filters"]';
    win.requestAnimationFrame?.(() => root?.querySelector?.(focusTarget)?.focus?.());
  }

  function clearLibraryFilters() {
    ui.libraryFilters = clearSetPieceLibraryFilters();
    ui.libraryFiltersOpen = true;
    render();
    win.requestAnimationFrame?.(() => root?.querySelector?.("[data-set-piece-library-filter-group]")?.focus?.());
  }

  function updateField(scope, field, rawValue) {
    const { play, variant, phase } = getContext();
    if (!play || !variant || !phase) return;
    if (scope === "element" && field === "role") {
      const element = phase.elements.find((item) => ui.selectedElementIds.has(item.id));
      if (element?.kind === "home-player") return assignmentController.updateRole(element.id, rawValue);
    }
    commit(() => {
      const numericFields = new Set(["durationMs", "holdMs", "delayMs", "rotation", "curve"]);
      let value = numericFields.has(field) ? Number(rawValue) : rawValue;
      if (scope === "play") play[field] = value;
      if (scope === "variant") variant[field] = value;
      if (scope === "phase") phase[field] = value;
      if (scope === "element") {
        const element = phase.elements.find((item) => ui.selectedElementIds.has(item.id));
        if (!element) return;
        if (element.kind === "opponent" && field === "label") {
          value = String(Math.min(99, Math.max(1, Math.round(Number(rawValue) || 1))));
        }
        if (field === "showNumber") value = Boolean(rawValue);
        element[field] = value;
        if (field === "profileId") {
          const roster = getRoster();
          const label = createSetPiecePlayerLabelMap(roster.map((entry) => entry.player)).get(String(value)) || "P";
          const phaseIndex = variant.phases.findIndex((item) => item.id === phase.id);
          variant.phases.slice(phaseIndex).forEach((item) => {
            const linked = item.elements.find((candidate) => candidate.id === element.id);
            if (linked) Object.assign(linked, { profileId: value, label });
          });
        }
        if (element.kind === "opponent" && ["label", "showNumber"].includes(field)) {
          variant.phases.forEach((item) => {
            const linked = item.elements.find((candidate) => candidate.id === element.id);
            if (linked) linked[field] = value;
          });
        }
      }
      if (scope === "drawing") {
        const drawing = phase.drawings.find((item) => item.id === ui.selectedDrawingId);
        if (drawing) drawing[field] = value;
      }
    });
  }

  function filterPlayerPickerOptions(value = "") {
    const query = String(value).trim().toLowerCase();
    root.querySelectorAll?.("[data-set-piece-roster-toggle]").forEach((button) => {
      button.hidden = Boolean(query) && !String(button.textContent || "").toLowerCase().includes(query);
    });
  }

  function handleClick(event) {
    if (playerMarkerMenu.handleClick(event)) return;
    if (!event.target.closest?.("[data-set-piece-pitch]")) boardInteractions.resetSelectionActivation();
    const openPresentationVariantMenu = root.querySelector?.(".spr-present-variant-menu[open]");
    if (openPresentationVariantMenu && !event.target.closest?.(".spr-present-variant-menu")) {
      openPresentationVariantMenu.removeAttribute("open");
    }
    const action = event.target.closest?.("[data-set-piece-action]")?.dataset.setPieceAction;
    if (action) return handleAction(action);
    const playId = event.target.closest?.("[data-set-piece-play-id]")?.dataset.setPiecePlayId;
    if (playId) return selectPlay(playId);
    const variantId = event.target.closest?.("[data-set-piece-variant-id]")?.dataset.setPieceVariantId;
    if (variantId) return selectVariant(variantId);
    const phaseId = event.target.closest?.("[data-set-piece-phase-id]")?.dataset.setPiecePhaseId;
    if (phaseId) return selectPhase(phaseId);
    const assignmentScope = event.target.closest?.("[data-set-piece-assignment-scope]")?.dataset.setPieceAssignmentScope;
    if (assignmentScope) return assignmentController.setScope(assignmentScope);
    const assignmentTarget = event.target.closest?.("[data-set-piece-assign-player]");
    if (assignmentTarget) return assignmentController.assignPlayer(
      assignmentTarget.dataset.setPieceSlotId,
      assignmentTarget.dataset.setPieceAssignPlayer || ""
    );
    const assignmentSlotId = event.target.closest?.("[data-set-piece-select-slot]")?.dataset.setPieceSelectSlot;
    if (assignmentSlotId) return assignmentController.selectSlot(assignmentSlotId);
    const rosterTarget = event.target.closest?.("[data-set-piece-roster-toggle]");
    const rosterId = rosterTarget?.dataset.setPieceRosterToggle;
    if (rosterId) {
      const searchQuery = root.querySelector?.("[data-set-piece-player-search]")?.value || "";
      const scrollTop = rosterTarget.closest?.(".spr-player-menu-list")?.scrollTop || 0;
      const result = boardInteractions.toggleRosterPlayer(rosterId);
      const picker = root.querySelector?.("[data-set-piece-player-picker]");
      if (picker) {
        picker.open = true;
        const search = picker.querySelector?.("[data-set-piece-player-search]");
        if (search) search.value = searchQuery;
        filterPlayerPickerOptions(searchQuery);
        const list = picker.querySelector?.(".spr-player-menu-list");
        if (list) list.scrollTop = scrollTop;
        picker.querySelector?.(`[data-set-piece-roster-toggle="${CSS.escape(rosterId)}"]`)?.focus?.();
      }
      return result;
    }
    const tool = event.target.closest?.("[data-set-piece-tool]")?.dataset.setPieceTool;
    if (tool) {
      if (tool === "home-player") {
        ui.activeTool = "select";
        ui.selectedDrawingIds.clear();
        ui.selectedDrawingId = "";
        render();
        const picker = root.querySelector?.("[data-set-piece-player-picker]");
        if (picker) {
          picker.open = true;
          picker.querySelector?.("summary")?.focus?.();
        }
        return;
      }
      ui.activeTool = tool;
      ui.selectedDrawingIds.clear();
      ui.selectedDrawingId = "";
      render();
    }
  }

  function handleInspectorPointerDown(event) {
    if (event.button !== 0 || event.isPrimary === false) return;
    const action = event.target.closest?.("[data-set-piece-action]")?.dataset.setPieceAction;
    if (!["close-inspector", "toggle-inspector"].includes(action)) return;
    const shouldOpen = action === "toggle-inspector" ? ui.inspectorCollapsed : false;
    const activeField = documentRef?.activeElement;
    if (root?.contains?.(activeField) && activeField?.matches?.("input, textarea, select")) activeField.blur?.();
    setInspectorOpen(shouldOpen);
    event.preventDefault();
  }

  function handleInput(event) {
    const target = event.target;
    if (target.matches?.("[data-set-piece-search]")) {
      ui.searchQuery = target.value;
      render();
      const search = root.querySelector("[data-set-piece-search]");
      search?.focus();
      search?.setSelectionRange?.(ui.searchQuery.length, ui.searchQuery.length);
      return;
    }
    if (target.matches?.("[data-set-piece-player-search]")) {
      filterPlayerPickerOptions(target.value);
      return;
    }
    if (target.matches?.("[data-set-piece-scrubber]")) {
      playback.seek(target.value);
      return;
    }
    const { play, variant, phase } = getContext();
    if (target.dataset?.setPiecePlayField === "title" && play) {
      root.querySelector(`[data-set-piece-play-title="${CSS.escape(play.id)}"]`)?.replaceChildren(target.value || "Untitled set piece");
      root.querySelector('[data-set-piece-live-text="play-title"]')?.replaceChildren(target.value || "Untitled set piece");
    }
    if (target.dataset?.setPieceVariantField === "title" && variant) {
      root.querySelector(`[data-set-piece-variant-select] option[value="${CSS.escape(variant.id)}"]`)?.replaceChildren(target.value || "Untitled variant");
      root.querySelector('[data-set-piece-live-text="variant-title"]')?.replaceChildren(target.value || "Untitled variant");
    }
    if (target.dataset?.setPiecePhaseField === "title" && phase) {
      root.querySelector(`[data-set-piece-phase-title="${CSS.escape(phase.id)}"]`)?.replaceChildren(target.value || "Untitled phase");
      root.querySelector('[data-set-piece-live-text="phase-title"]')?.replaceChildren(target.value || "Untitled phase");
    }
  }

  function handleChange(event) {
    const target = event.target;
    if (target.matches?.("[data-set-piece-library-filter-group]")) {
      ui.libraryFilters = updateSetPieceLibraryFilter(
        ui.libraryFilters,
        target.dataset.setPieceLibraryFilterGroup,
        target.dataset.setPieceLibraryFilterValue,
        target.checked
      );
      render();
      const selector = `[data-set-piece-library-filter-group="${CSS.escape(target.dataset.setPieceLibraryFilterGroup)}"][data-set-piece-library-filter-value="${CSS.escape(target.dataset.setPieceLibraryFilterValue)}"]`;
      win.requestAnimationFrame?.(() => root?.querySelector?.(selector)?.focus?.());
      return;
    }
    if (target.matches?.("[data-set-piece-sub-phase]")) {
      const { play } = getContext();
      if (!play) return;
      const value = target.dataset.setPieceSubPhase;
      const selected = new Set(play.subPhases || []);
      if (!target.checked && selected.size === 1 && selected.has(value)) {
        render();
        return;
      }
      commit(() => {
        if (target.checked) selected.add(value);
        else selected.delete(value);
        play.subPhases = setPieceSubPhaseOptions
          .map((option) => option.value)
          .filter((optionValue) => selected.has(optionValue));
      });
      return;
    }
    if (target.matches?.("[data-set-piece-present-variant], [data-set-piece-variant-select]")) return selectVariant(target.value);
    if (target.matches?.("[data-set-piece-playback-speed]")) playback.setSpeed(target.value);
    if (target.matches?.("[data-set-piece-ghost]")) {
      ui.showGhost = target.checked;
      renderBoardOnly();
    }
    if (target.matches?.("[data-set-piece-layer]")) {
      if (target.checked) ui.layers.add(target.dataset.setPieceLayer);
      else ui.layers.delete(target.dataset.setPieceLayer);
      renderBoardOnly();
    }
    for (const scope of ["play", "variant", "phase", "element", "drawing"]) {
      const field = target.dataset?.[`setPiece${scope[0].toUpperCase()}${scope.slice(1)}Field`];
      if (field) return updateField(scope, field, target.type === "checkbox" ? target.checked : target.value);
    }
  }

  const assignmentController = createSetPieceAssignmentController({
    ui,
    getContext,
    commit,
    render,
  });

  const playerMarkerMenu = createSetPiecePlayerMarkerMenuController({
    root,
    ui,
    win,
    getContext,
    canEdit,
    render,
    setMarkerMode(mode) {
      if (!new Set(["photo", "initials"]).has(mode)) return;
      updateField("play", "playerMarkerMode", mode);
    },
    openPlayerDetails(elementId) {
      const { phase } = getContext();
      const element = phase?.elements?.find((candidate) => candidate.id === elementId && candidate.kind === "home-player");
      if (!element) return;
      ui.selectedElementIds = new Set([elementId]);
      ui.selectedDrawingIds.clear();
      ui.selectedDrawingId = "";
      ui.assignmentPickerSlotId = elementId;
      ui.showAssignments = false;
      ui.inspectorCollapsed = false;
      render();
    },
  });

  function focusDrawingLabel() {
    const focus = () => {
      const field = root?.querySelector?.('[data-set-piece-drawing-field="label"]');
      field?.focus?.();
      field?.select?.();
    };
    if (typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(focus);
    else focus();
  }

  const boardInteractions = createSetPiecesBoardInteractionController({
    root,
    ui,
    getState: () => state,
    getContext,
    getRoster,
    canEdit,
    canDelete,
    commit,
    finalizeDirectMutation,
    focusDrawingLabel,
    render,
    renderBoardOnly,
    playback,
    isFullscreen: () => documentRef?.fullscreenElement === root,
    restartPlayback,
    selectAdjacentPhase,
    selectAdjacentVariant,
    setNotice,
    setPresentationMode: setWorkspaceMode,
    toggleFullscreen,
    deleteSelection,
    undo,
    redo,
  });

  function bind() {
    if (bound || !root) return;
    bound = true;
    root.addEventListener("click", handleClick);
    root.addEventListener("input", handleInput);
    root.addEventListener("change", handleChange);
    root.addEventListener("dblclick", boardInteractions.handleDoubleClick);
    root.addEventListener("contextmenu", playerMarkerMenu.handleContextMenu);
    root.addEventListener("pointerdown", handleInspectorPointerDown);
    root.addEventListener("pointerdown", boardInteractions.handlePointerDown);
    documentRef.addEventListener("pointerdown", playerMarkerMenu.handlePointerDown);
    documentRef.addEventListener("pointermove", boardInteractions.handlePointerMove);
    documentRef.addEventListener("pointerup", boardInteractions.handlePointerUp);
    documentRef.addEventListener("pointercancel", boardInteractions.handlePointerCancel);
    documentRef.addEventListener("keydown", (event) => {
      if (playerMarkerMenu.handleKeyDown(event)) return;
      const onboarding = root?.querySelector?.("[data-set-piece-onboarding]");
      if (ui.onboardingOpen && onboarding?.getClientRects?.().length) {
        const buttons = [...(root?.querySelectorAll?.("[data-set-piece-onboarding] button:not([disabled])") || [])];
        if (event.key === "Escape") {
          event.preventDefault();
          dismissOnboarding();
          return;
        }
        if (event.key === "Tab" && buttons.length) {
          event.preventDefault();
          const activeIndex = buttons.indexOf(documentRef.activeElement);
          const nextIndex = event.shiftKey
            ? (activeIndex <= 0 ? buttons.length - 1 : activeIndex - 1)
            : (activeIndex + 1) % buttons.length;
          buttons[nextIndex].focus();
          return;
        }
      }
      if (ui.libraryOpen && event.key === "Escape") {
        event.preventDefault();
        if (ui.libraryFiltersOpen) setLibraryFiltersOpen(false);
        else setLibraryOpen(false);
        return;
      }
      const presentationVariantMenu = root.querySelector?.(".spr-present-variant-menu[open]");
      if (ui.presentationMode && presentationVariantMenu?.contains?.(event.target)) {
        if (event.key === "Escape") {
          event.preventDefault();
          presentationVariantMenu.removeAttribute("open");
          presentationVariantMenu.querySelector?.("summary")?.focus?.();
          return;
        }
        if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const choices = [...presentationVariantMenu.querySelectorAll?.(".spr-present-variant-option")];
          const activeIndex = Math.max(0, choices.findIndex((choice) => choice.classList.contains("is-active")));
          const focusedIndex = choices.indexOf(documentRef.activeElement);
          let nextIndex = focusedIndex < 0 ? activeIndex : focusedIndex;
          if (event.key === "ArrowUp") nextIndex = (nextIndex - 1 + choices.length) % choices.length;
          if (event.key === "ArrowDown") nextIndex = (nextIndex + 1) % choices.length;
          if (event.key === "Home") nextIndex = 0;
          if (event.key === "End") nextIndex = choices.length - 1;
          choices[nextIndex]?.focus?.();
          return;
        }
        return;
      }
      boardInteractions.handleKeyDown(event);
    });
    documentRef.addEventListener("fullscreenchange", () => {
      if (ui.presentationMode) render();
    });
  }

  function mount() {
    bind();
    render();
    if (ui.onboardingOpen) {
      win.requestAnimationFrame?.(() => root?.querySelector?.(".spr-onboarding-primary")?.focus?.());
    }
  }

  function reloadFromStorage() {
    playback.stop();
    state = persistence.read();
    history.clear();
    render();
  }

  return Object.freeze({ mount, reloadFromStorage, render, setSyncStatus });
}
