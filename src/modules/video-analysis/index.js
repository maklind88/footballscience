import { renderClipFilters } from "./components/ClipFilters.js";
import { renderClipIntelligence } from "./components/ClipIntelligence.js";
import { renderClipList } from "./components/ClipList.js";
import { renderCodingPanel } from "./components/CodingPanel.js";
import { renderCodingTemplateBuilder } from "./components/CodingTemplateBuilder.js";
import { renderPlayerClipDrawer } from "./components/PlayerClipDrawer.js";
import { renderPlaylistBuilder } from "./components/PlaylistBuilder.js";
import { renderTimeline } from "./components/Timeline.js";
import { renderVideoPlayer } from "./components/VideoPlayer.js";
import { escapeHtml } from "./components/renderHelpers.js";
import { normalizeClipInstance } from "./domain/clipInstance.model.js";
import { createClipRepository } from "./repositories/clipRepository.js";
import { createPlaylistRepository } from "./repositories/playlistRepository.js";
import { createVideoRepository } from "./repositories/videoRepository.js";
import { buildClipPayload, toApiClipPayload } from "./services/clipInstanceService.js";
import { filterClipsForMatrix, savedSearchTitle } from "./services/clipIntelligenceService.js";
import { applyCodingButtonToDraft, buildInstantClipRange, findTemplateButton } from "./services/codingTemplateService.js";
import { handleVideoAnalysisShortcut } from "./services/keyboardShortcutService.js";
import { createLocalVideoReference, revokeLocalVideoReference } from "./services/localVideoBridgeService.js";
import { addClipToReviewSection, buildReviewSessionPayload, removeClipFromReviewSection, updateReviewSectionNote } from "./services/reviewSessionService.js";
import { trimClipDraft } from "./services/timelineService.js";
import { describeVideoPlaybackError, getVideoCurrentMs, seekVideoToMs, toggleVideoPlayback } from "./services/videoPlaybackService.js";
import { createVideoAnalysisStore } from "./video-analysis.store.js";

let runtime = null;

function getRoot(context = {}) {
  return context.ui?.analysisRoomWorkspace || null;
}

function createRuntime(context = {}) {
  const store = createVideoAnalysisStore(context);
  return {
    context,
    store,
    clips: createClipRepository(context),
    playlists: createPlaylistRepository(context),
    videos: createVideoRepository(context),
    unsubscribe: null,
    keydownBound: false,
  };
}

function ensureRuntime(context = {}) {
  if (!runtime) runtime = createRuntime(context);
  runtime.context = context;
  return runtime;
}

function videoElement(context = {}) {
  return getRoot(context)?.querySelector("[data-video-analysis-video]");
}

function updateVideoDuration(durationMs = 0) {
  const safeDurationMs = Math.round(Number(durationMs || 0));
  if (!Number.isFinite(safeDurationMs) || safeDurationMs <= 0) return;
  const state = runtime?.store.getState();
  const currentDurationMs = Math.round(Number(state?.videoRef?.durationMs || 0));
  if (!state?.videoRef || currentDurationMs === safeDurationMs) return;
  runtime?.store.update((current) => {
    return {
      ...current,
      videoRef: { ...current.videoRef, durationMs: safeDurationMs },
    };
  });
}

function setVideoPlaybackError(video) {
  const message = describeVideoPlaybackError(video);
  if (!message) return;
  const state = runtime?.store.getState();
  if (state?.status === "error" && state.error === message) return;
  runtime?.store.setState({ status: "error", error: message });
}

function togglePlayback(context = {}) {
  const video = videoElement(context);
  toggleVideoPlayback(video).then((playing) => {
    if (!playing && video?.error) setVideoPlaybackError(video);
  });
}

function isLocalStaticHost(context = {}) {
  const host = String((context.win || window).location?.hostname || "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
}

function shouldLoadMetadata(context = {}, state = {}) {
  if (context.allowVideoAnalysisMetadataLoad) return true;
  if (state.match?.id || state.video?.id) return true;
  return !isLocalStaticHost(context);
}

function paint(root, state) {
  const previousVideo = root.querySelector("[data-video-analysis-video]");
  const previousSrc = previousVideo?.currentSrc || previousVideo?.src || "";
  const previousTime = Number(previousVideo?.currentTime || 0);
  const wasPlaying = Boolean(previousVideo && !previousVideo.paused && !previousVideo.ended);
  const focusedDraft = root.querySelector("[data-video-analysis-draft]:focus")?.dataset.videoAnalysisDraft || "";
  const focusedFilter = root.querySelector("[data-video-analysis-filter]:focus")?.dataset.videoAnalysisFilter || "";
  const focusedReviewNote = root.querySelector("[data-video-analysis-review-note]:focus")?.dataset.videoAnalysisReviewNote || "";
  const selectionStart = root.ownerDocument?.activeElement?.selectionStart;
  const visibleClips = filterClipsForMatrix(
    state.clips || [],
    state.matrix?.mode,
    state.matrix?.selectedRow,
    state.matrix?.selectedColumn
  );
  const displayState = { ...state, clips: visibleClips, allClips: state.clips };
  root.innerHTML = `
    <section class="video-analysis-shell">
      ${renderVideoPlayer(displayState)}
      ${renderTimeline(displayState)}
      <section class="video-analysis-workstation">
        <section class="video-analysis-left-stack">
          ${renderCodingTemplateBuilder(displayState)}
          ${renderCodingPanel(displayState)}
        </section>
        <section class="video-analysis-results">
          ${renderClipFilters(displayState)}
          ${renderClipIntelligence(displayState)}
          ${renderClipList(displayState)}
        </section>
      </section>
      ${renderPlaylistBuilder(state)}
      ${renderPlayerClipDrawer(displayState)}
      ${state.message ? `<p class="video-analysis-toast">${escapeHtml(state.message)}</p>` : ""}
      ${state.error ? `<p class="video-analysis-error">${escapeHtml(state.error)}</p>` : ""}
    </section>
  `;
  const video = root.querySelector("[data-video-analysis-video]");
  const nextFocus = focusedDraft
    ? root.querySelector(`[data-video-analysis-draft="${focusedDraft}"]`)
    : focusedFilter
      ? root.querySelector(`[data-video-analysis-filter="${focusedFilter}"]`)
      : focusedReviewNote
        ? root.querySelector(`[data-video-analysis-review-note="${focusedReviewNote}"]`)
      : null;
  if (nextFocus) {
    nextFocus.focus();
    if (Number.isFinite(selectionStart) && typeof nextFocus.setSelectionRange === "function") {
      nextFocus.setSelectionRange(selectionStart, selectionStart);
    }
  }
  if (video) {
    if (previousSrc && (video.currentSrc || video.src) === previousSrc && Number.isFinite(previousTime)) {
      try {
        video.currentTime = previousTime;
        if (wasPlaying) video.play?.().catch(() => {});
      } catch {
        // Metadata can still be loading for a newly recreated local video element.
      }
    }
    video.ontimeupdate = () => {
      const durationMs = Math.max(1, Number(runtime?.store.getState().videoRef?.durationMs || 1));
      const zoom = Math.max(1, Number(runtime?.store.getState().timeline?.zoom || 1));
      const safeDuration = durationMs / zoom;
      const playhead = root.querySelector(".video-analysis-playhead");
      if (playhead) playhead.style.left = `${Math.min(99.5, Math.max(0, (getVideoCurrentMs(video) / safeDuration) * 100))}%`;
    };
    video.addEventListener("loadedmetadata", () => {
      updateVideoDuration(Math.round(Number(video.duration || 0) * 1000));
    }, { once: true });
    video.addEventListener("error", () => setVideoPlaybackError(video), { once: true });
  }
}

async function loadClips(nextFilters = null) {
  const run = runtime;
  if (!run) return;
  const state = run.store.getState();
  const filters = nextFilters || state.filters;
  if (!shouldLoadMetadata(run.context, state)) {
    run.store.setState({ status: "ready", filters, error: "" });
    return;
  }
  run.store.setState({ status: "loading-clips", error: "" });
  try {
    const payload = await run.clips.list({
      search: filters.search,
      phase: filters.phase,
      outcome: filters.outcome,
      teamPrincipleId: filters.principleId,
      miniGamePrincipleId: filters.miniGamePrincipleId,
      unit: filters.unit,
      descriptorValue: filters.descriptorValue,
      matchId: state.match?.id || "",
      videoId: state.video?.id || "",
      limit: 120,
    });
    let clips = (payload.clips || []).map(normalizeClipInstance);
    if (filters.playerId) {
      clips = clips.filter((clip) => (clip.players || []).some((player) => (player.player_id || player.playerId) === filters.playerId));
    }
    run.store.setState({ status: "ready", clips, filters, error: "" });
  } catch (error) {
    run.store.setState({ status: "error", error: error.message || "Could not load clips." });
  }
}

async function loadSavedSearches() {
  const run = runtime;
  if (!run) return;
  if (!shouldLoadMetadata(run.context, run.store.getState())) return;
  try {
    const payload = await run.clips.listSavedSearches(40);
    run.store.setState({ savedSearches: payload.savedSearches || [] });
  } catch {
    run.store.setState({ savedSearches: [] });
  }
}

async function initialize(context = {}) {
  const run = ensureRuntime(context);
  run.store.setState({ status: "loading", error: "" });
  try {
    await loadClips();
    await loadSavedSearches();
  } catch (error) {
    run.store.setState({ status: "ready", error: error.message || "" });
  }
}

export function render(context = {}) {
  const run = ensureRuntime(context);
  const root = getRoot(context);
  if (!root) return;
  if (!run.unsubscribe) {
    run.unsubscribe = run.store.subscribe((state) => paint(root, state));
  }
  if (!run.keydownBound) {
    const win = context.win || window;
    win.addEventListener?.("keydown", (event) => handleKeydown(event, context));
    run.keydownBound = true;
  }
  paint(root, run.store.getState());
  if (run.store.getState().status === "idle") initialize(context);
}

async function handleFileSelection(file, context = {}) {
  const run = ensureRuntime(context);
  const previous = run.store.getState().videoRef;
  try {
    const reference = await createLocalVideoReference(file, context.win || window);
    revokeLocalVideoReference(previous, context.win || window);
    run.store.setState({ videoRef: reference, status: "saving-source", message: "Local video linked.", error: "" });
    const payload = await run.videos.createLocalVideoSource({
      displayName: reference.displayName,
      localVideoIdentifier: reference.localVideoIdentifier,
      fileSizeBytes: reference.fileSizeBytes,
      durationMs: reference.durationMs,
    });
    run.store.update((state) => ({
      ...state,
      match: payload.match || state.match || { id: payload.video?.match_id, title: reference.displayName },
      video: payload.video,
      source: payload.source,
      status: "ready",
      message: "Video metadata saved.",
    }));
    await loadClips();
  } catch (error) {
    run.store.setState({ status: "error", error: error.message || "Could not load video." });
  }
}

async function saveDraftClip(context = {}, stateOverride = null) {
  const run = ensureRuntime(context);
  const state = stateOverride || run.store.getState();
  try {
    const clip = buildClipPayload(state);
    run.store.setState({ status: "saving-clip", error: "" });
    await run.clips.save(toApiClipPayload(clip));
    run.store.update((current) => ({
      ...current,
      draft: { ...current.draft, startMs: clip.endMs, endMs: clip.endMs + 5000, tags: "", note: "" },
      codingSession: { ...(current.codingSession || {}), manualInMs: null },
      message: "Clip saved.",
    }));
    await loadClips();
    return true;
  } catch (error) {
    run.store.setState({ status: "error", error: error.message || "Could not save clip." });
    return false;
  }
}

async function applyCodeButton(buttonId = "", context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  const button = findTemplateButton(state.template, buttonId);
  if (!button) return false;
  const currentMs = getVideoCurrentMs(videoElement(context));
  const nextDraft = applyCodingButtonToDraft(state.draft, state.template, button);
  const nextSession = { ...(state.codingSession || {}), activeButtonId: button.id };
  const nextState = { ...state, draft: nextDraft, codingSession: nextSession, message: `${button.label} selected.` };
  if (nextSession.mode === "instant" && state.match?.id && state.video?.id) {
    const range = buildInstantClipRange(currentMs, nextSession);
    const instantState = {
      ...nextState,
      draft: { ...nextDraft, ...range },
      codingSession: { ...nextSession, preRollMs: range.preRollMs, postRollMs: range.postRollMs },
    };
    run.store.update(() => instantState);
    await saveDraftClip(context, instantState);
    return true;
  }
  run.store.update(() => nextState);
  return true;
}

export function handleClick(event, context = {}) {
  const run = ensureRuntime(context);
  const root = getRoot(context);
  const target = event.target;
  if (target.closest("[data-video-analysis-load]")) {
    root?.querySelector("[data-video-analysis-file]")?.click();
    return true;
  }
  if (target.closest("[data-video-analysis-play]")) {
    togglePlayback(context);
    return true;
  }
  const modeButton = target.closest("[data-video-analysis-mode]");
  if (modeButton) {
    run.store.update((state) => ({
      ...state,
      codingSession: { ...(state.codingSession || {}), mode: modeButton.dataset.videoAnalysisMode },
    }));
    return true;
  }
  const codeButton = target.closest("[data-video-analysis-code-button]");
  if (codeButton) {
    applyCodeButton(codeButton.dataset.videoAnalysisCodeButton, context);
    return true;
  }
  const markButton = target.closest("[data-video-analysis-mark]");
  if (markButton) {
    const currentMs = getVideoCurrentMs(videoElement(context));
    run.store.update((state) => ({
      ...state,
      draft: {
        ...state.draft,
        [markButton.dataset.videoAnalysisMark === "start" ? "startMs" : "endMs"]: currentMs,
      },
      codingSession: {
        ...(state.codingSession || {}),
        manualInMs: markButton.dataset.videoAnalysisMark === "start" ? currentMs : state.codingSession?.manualInMs,
      },
    }));
    return true;
  }
  const trimButton = target.closest("[data-video-analysis-trim]");
  if (trimButton) {
    const [edge, delta] = String(trimButton.dataset.videoAnalysisTrim || "").split(":");
    run.store.update((state) => ({ ...state, draft: trimClipDraft(state.draft, edge, Number(delta || 0)) }));
    return true;
  }
  const seekButton = target.closest("[data-video-analysis-seek]");
  if (seekButton) {
    const clip = run.store.getState().clips.find((item) => item.id === seekButton.dataset.videoAnalysisSeek);
    if (clip) seekVideoToMs(videoElement(context), clip.startMs);
    run.store.setState({ selectedClipId: clip?.id || "" });
    return true;
  }
  const reviewButton = target.closest("[data-video-analysis-review]");
  if (reviewButton) {
    run.store.update((state) => ({
      ...state,
      reviewSections: addClipToReviewSection(state.reviewSections, state.activeReviewSectionId, reviewButton.dataset.videoAnalysisReview),
      message: "Clip added to review.",
    }));
    return true;
  }
  const sectionButton = target.closest("[data-video-analysis-review-section]");
  if (sectionButton) {
    run.store.setState({ activeReviewSectionId: sectionButton.dataset.videoAnalysisReviewSection });
    return true;
  }
  const removeButton = target.closest("[data-video-analysis-review-remove]");
  if (removeButton) {
    const [sectionId, clipId] = String(removeButton.dataset.videoAnalysisReviewRemove || "").split(":");
    run.store.update((state) => ({
      ...state,
      reviewSections: removeClipFromReviewSection(state.reviewSections, sectionId, clipId),
    }));
    return true;
  }
  const archiveButton = target.closest("[data-video-analysis-archive]");
  if (archiveButton) {
    run.clips.archive(archiveButton.dataset.videoAnalysisArchive).then(() => loadClips()).catch((error) => {
      run.store.setState({ error: error.message || "Could not archive clip." });
    });
    return true;
  }
  if (target.closest("[data-video-analysis-clear-filters]")) {
    loadClips({ search: "", phase: "", playerId: "", principleId: "", miniGamePrincipleId: "", outcome: "", unit: "", descriptorValue: "" });
    run.store.update((state) => ({ ...state, matrix: { ...(state.matrix || {}), selectedRow: "", selectedColumn: "" } }));
    return true;
  }
  const zoomButton = target.closest("[data-video-analysis-zoom]");
  if (zoomButton) {
    run.store.update((state) => ({
      ...state,
      timeline: {
        ...(state.timeline || {}),
        zoom: Math.min(6, Math.max(1, Number(state.timeline?.zoom || 1) + Number(zoomButton.dataset.videoAnalysisZoom || 0))),
      },
    }));
    return true;
  }
  const matrixButton = target.closest("[data-video-analysis-matrix]");
  if (matrixButton) {
    run.store.update((state) => ({
      ...state,
      matrix: { mode: matrixButton.dataset.videoAnalysisMatrix, selectedRow: "", selectedColumn: "" },
    }));
    return true;
  }
  const matrixCell = target.closest("[data-video-analysis-matrix-cell]");
  if (matrixCell) {
    const [row, column] = String(matrixCell.dataset.videoAnalysisMatrixCell || "").split("|");
    run.store.update((state) => ({ ...state, matrix: { ...(state.matrix || {}), selectedRow: row, selectedColumn: column } }));
    return true;
  }
  if (target.closest("[data-video-analysis-save-search]")) {
    const state = run.store.getState();
    const search = { title: savedSearchTitle(state.filters), search: { ...state.filters, matrix: state.matrix } };
    run.clips.saveSearch(search).then((payload) => {
      run.store.update((current) => ({
        ...current,
        savedSearches: [payload.savedSearch || search, ...(current.savedSearches || [])],
        message: "Search saved.",
      }));
    }).catch((error) => run.store.setState({ error: error.message || "Could not save search." }));
    return true;
  }
  const applySearchButton = target.closest("[data-video-analysis-apply-search]");
  if (applySearchButton) {
    const search = (run.store.getState().savedSearches || []).find((item) => (
      item.id === applySearchButton.dataset.videoAnalysisApplySearch || item.title === applySearchButton.dataset.videoAnalysisApplySearch
    ));
    const searchJson = search?.search_json || search?.searchJson || search?.search || {};
    if (searchJson.matrix) run.store.update((state) => ({ ...state, matrix: searchJson.matrix }));
    loadClips({ ...run.store.getState().filters, ...searchJson });
    return true;
  }
  if (target.closest("[data-video-analysis-save-review]")) {
    const payload = buildReviewSessionPayload(run.store.getState());
    run.playlists.saveReviewSession(payload).then(() => {
      run.store.setState({ message: "Review saved." });
    }).catch((error) => run.store.setState({ error: error.message || "Could not save review." }));
    return true;
  }
  return false;
}

export function handleInput(event, context = {}) {
  const run = ensureRuntime(context);
  const draftField = event.target.closest("[data-video-analysis-draft]");
  if (draftField) {
    const key = draftField.dataset.videoAnalysisDraft;
    run.store.update((state) => ({ ...state, draft: { ...state.draft, [key]: draftField.value } }));
    return true;
  }
  const filterField = event.target.closest("[data-video-analysis-filter]");
  if (filterField) {
    const key = filterField.dataset.videoAnalysisFilter;
    const filters = { ...run.store.getState().filters, [key]: filterField.value };
    loadClips(filters);
    return true;
  }
  const timelineField = event.target.closest("[data-video-analysis-timeline]");
  if (timelineField) {
    const key = timelineField.dataset.videoAnalysisTimeline;
    run.store.update((state) => ({ ...state, timeline: { ...(state.timeline || {}), [key]: timelineField.value } }));
    return true;
  }
  const reviewNote = event.target.closest("[data-video-analysis-review-note]");
  if (reviewNote) {
    run.store.update((state) => ({
      ...state,
      reviewSections: updateReviewSectionNote(state.reviewSections, reviewNote.dataset.videoAnalysisReviewNote, reviewNote.value),
    }));
    return true;
  }
  return false;
}

export function handleChange(event, context = {}) {
  const fileInput = event.target.closest("[data-video-analysis-file]");
  if (fileInput?.files?.[0]) {
    handleFileSelection(fileInput.files[0], context);
    return true;
  }
  return handleInput(event, context);
}

export function handleKeydown(event, context = {}) {
  const run = ensureRuntime(context);
  const root = getRoot(context);
  return handleVideoAnalysisShortcut(event, {
    applyCodeButton: (buttonId) => applyCodeButton(buttonId, context),
    getCurrentMs: () => getVideoCurrentMs(videoElement(context)),
    getState: run.store.getState,
    root,
    saveDraftClip: () => saveDraftClip(context),
    togglePlayback: () => togglePlayback(context),
    update: run.store.update,
  });
}

export function handleSubmit(event, context = {}) {
  if (!event.target.closest("[data-video-analysis-form]")) return false;
  event.preventDefault();
  saveDraftClip(context);
  return true;
}
