import { SET_PIECES_MAX_PHASES, SET_PIECES_MAX_VARIANTS } from "./constants.mjs";
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

export function createSetPiecesRoomController(options = {}) {
  const root = options.root;
  const win = options.win || globalThis;
  const documentRef = options.documentRef || win.document;
  const persistence = createSetPiecesPersistence({ storage: options.storage, storageKey: options.storageKey });
  const history = createSetPiecesHistory();
  let state = persistence.read();
  let bound = false;

  const ui = {
    activeTool: "select",
    searchQuery: "",
    libraryFilter: "all",
    selectedRosterId: "",
    selectedElementIds: new Set(),
    selectedDrawingId: "",
    assignmentScope: "play",
    assignmentPickerSlotId: "",
    showAssignments: false,
    layers: new Set(["home", "opponent", "ball", "drawings", "labels"]),
    showGhost: true,
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
    saveMessage: "Saved",
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
    const result = persistence.write(state);
    state = result.state;
    ui.saveState = result.ok ? "saved" : "error";
    ui.saveMessage = result.ok
      ? `Saved ${new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`
      : "Save failed";
    return result.ok;
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
      canUndo: history.canUndo,
      canRedo: history.canRedo,
    };
  }

  function render() {
    if (!root) return;
    const roster = getRoster();
    const team = options.getTeamIdentity?.() || {};
    root.innerHTML = renderSetPiecesWorkspace({ state, roster, team, ui: rendererUi(), canEdit: canEdit() });
    revealActiveSetPiecePhase(root);
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
    const ghostStatus = ui.showGhost && phaseIndex > 0 ? '<span class="spr-ghost-status">Previous phase shown</span>' : "";
    stage.innerHTML = `${ghostStatus}${renderSetPieceBoard({
      phase: resolvedPhase,
      previousPhase: resolvedPreviousPhase,
      pitchView: play.pitchView,
      layers: ui.layers,
      selectedElementIds: ui.selectedElementIds,
      selectedDrawingId: ui.selectedDrawingId,
      previewDrawing: ui.previewDrawing,
      selectionRect: ui.selectionRect,
    })}`;
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
    ui.selectedDrawingId = "";
    ui.assignmentPickerSlotId = "";
    ui.showAssignments = false;
    render();
  }

  function selectVariant(variantId) {
    const { play } = getContext();
    if (!play?.variants.some((variant) => variant.id === variantId)) return;
    playback.stop();
    play.activeVariantId = variantId;
    ui.selectedElementIds.clear();
    ui.selectedDrawingId = "";
    ui.assignmentPickerSlotId = "";
    render();
  }

  function selectPhase(phaseId) {
    const { variant } = getContext();
    if (!variant?.phases.some((phase) => phase.id === phaseId)) return;
    playback.stop();
    variant.activePhaseId = phaseId;
    ui.selectedElementIds.clear();
    ui.selectedDrawingId = "";
    ui.assignmentPickerSlotId = "";
    render();
  }

  function createNewPlay() {
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
    const drawingId = ui.selectedDrawingId;
    if (!elementIds.size && !drawingId) return;
    commit(() => {
      const startIndex = variant.phases.findIndex((item) => item.id === phase.id);
      variant.phases.slice(startIndex).forEach((item) => {
        item.elements = item.elements.filter((element) => !elementIds.has(element.id));
      });
      phase.drawings = phase.drawings.filter((drawing) => drawing.id !== drawingId);
      ui.selectedElementIds.clear();
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
    ui.presentationMode = Boolean(presentationMode);
    ui.activeTool = "select";
    ui.previewDrawing = null;
    ui.selectionRect = null;
    ui.selectedElementIds.clear();
    ui.selectedDrawingId = "";
    ui.assignmentPickerSlotId = "";
    ui.showAssignments = false;
    render();
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
      "add-to-team-meeting": addCurrentVariantToTeamMeeting,
      "toggle-inspector": () => {
        ui.inspectorCollapsed = !ui.inspectorCollapsed;
        render();
      },
      "show-assignments": () => assignmentController.showOverview(true),
      "show-plan": () => assignmentController.showOverview(false),
    };
    actions[action]?.();
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

  function handleClick(event) {
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
    const rosterId = event.target.closest?.("[data-set-piece-roster-add]")?.dataset.setPieceRosterAdd;
    if (rosterId) return boardInteractions.addRosterPlayer(rosterId);
    const tool = event.target.closest?.("[data-set-piece-tool]")?.dataset.setPieceTool;
    if (tool) {
      ui.activeTool = tool;
      ui.selectedDrawingId = "";
      render();
    }
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
      const query = String(target.value || "").trim().toLowerCase();
      root.querySelectorAll?.("[data-set-piece-roster-add]").forEach((button) => {
        button.hidden = Boolean(query) && !String(button.textContent || "").toLowerCase().includes(query);
      });
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
      root.querySelector('[data-set-piece-variant-id].is-active')?.replaceChildren(target.value || "Untitled variant");
      root.querySelector('[data-set-piece-live-text="variant-title"]')?.replaceChildren(target.value || "Untitled variant");
    }
    if (target.dataset?.setPiecePhaseField === "title" && phase) {
      root.querySelector(`[data-set-piece-phase-title="${CSS.escape(phase.id)}"]`)?.replaceChildren(target.value || "Untitled phase");
      root.querySelector('[data-set-piece-live-text="phase-title"]')?.replaceChildren(target.value || "Untitled phase");
    }
  }

  function handleChange(event) {
    const target = event.target;
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

  function handleFilterClick(event) {
    const filter = event.target.closest?.("[data-set-piece-filter]")?.dataset.setPieceFilter;
    if (!filter) return false;
    ui.libraryFilter = filter;
    render();
    return true;
  }

  const assignmentController = createSetPieceAssignmentController({
    ui,
    getContext,
    commit,
    render,
  });

  const boardInteractions = createSetPiecesBoardInteractionController({
    root,
    ui,
    getState: () => state,
    getContext,
    getRoster,
    canEdit,
    commit,
    finalizeDirectMutation,
    render,
    renderBoardOnly,
    playback,
    deleteSelection,
    undo,
    redo,
  });

  function bind() {
    if (bound || !root) return;
    bound = true;
    root.addEventListener("click", (event) => {
      if (!handleFilterClick(event)) handleClick(event);
    });
    root.addEventListener("input", handleInput);
    root.addEventListener("change", handleChange);
    root.addEventListener("pointerdown", boardInteractions.handlePointerDown);
    documentRef.addEventListener("pointermove", boardInteractions.handlePointerMove);
    documentRef.addEventListener("pointerup", boardInteractions.handlePointerUp);
    documentRef.addEventListener("pointercancel", boardInteractions.handlePointerCancel);
    documentRef.addEventListener("keydown", boardInteractions.handleKeyDown);
  }

  function mount() {
    bind();
    render();
  }

  function reloadFromStorage() {
    playback.stop();
    state = persistence.read();
    history.clear();
    render();
  }

  return Object.freeze({ mount, reloadFromStorage, render });
}
