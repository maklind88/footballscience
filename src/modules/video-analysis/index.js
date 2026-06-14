import { renderClipFilters } from "./components/ClipFilters.js";
import { renderClipList } from "./components/ClipList.js";
import { renderCodingPanel } from "./components/CodingPanel.js";
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
import { createLocalVideoReference, revokeLocalVideoReference } from "./services/localVideoBridgeService.js";
import { addClipToReviewList, removeClipFromReviewList } from "./services/playlistService.js";
import { getVideoCurrentMs, seekVideoToMs, toggleVideoPlayback } from "./services/videoPlaybackService.js";
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

function paint(root, state) {
  const focusedDraft = root.querySelector("[data-video-analysis-draft]:focus")?.dataset.videoAnalysisDraft || "";
  const focusedFilter = root.querySelector("[data-video-analysis-filter]:focus")?.dataset.videoAnalysisFilter || "";
  const selectionStart = root.ownerDocument?.activeElement?.selectionStart;
  root.innerHTML = `
    <section class="video-analysis-shell">
      ${renderVideoPlayer(state)}
      ${renderTimeline(state)}
      <section class="video-analysis-workbench">
        ${renderCodingPanel(state)}
        <section class="video-analysis-results">
          ${renderClipFilters(state)}
          ${renderClipList(state)}
          ${renderPlaylistBuilder(state)}
        </section>
      </section>
      ${renderPlayerClipDrawer(state)}
      ${state.message ? `<p class="video-analysis-toast">${escapeHtml(state.message)}</p>` : ""}
      ${state.error ? `<p class="video-analysis-error">${escapeHtml(state.error)}</p>` : ""}
    </section>
  `;
  const video = root.querySelector("[data-video-analysis-video]");
  const nextFocus = focusedDraft
    ? root.querySelector(`[data-video-analysis-draft="${focusedDraft}"]`)
    : focusedFilter
      ? root.querySelector(`[data-video-analysis-filter="${focusedFilter}"]`)
      : null;
  if (nextFocus) {
    nextFocus.focus();
    if (Number.isFinite(selectionStart) && typeof nextFocus.setSelectionRange === "function") {
      nextFocus.setSelectionRange(selectionStart, selectionStart);
    }
  }
  if (video) {
    video.addEventListener("loadedmetadata", () => {
      const durationMs = Math.round(Number(video.duration || 0) * 1000);
      runtime?.store.update((current) => ({
        ...current,
        videoRef: current.videoRef ? { ...current.videoRef, durationMs } : current.videoRef,
      }));
    }, { once: true });
  }
}

async function loadClips(nextFilters = null) {
  const run = runtime;
  if (!run) return;
  const state = run.store.getState();
  const filters = nextFilters || state.filters;
  run.store.setState({ status: "loading-clips", error: "" });
  try {
    const payload = await run.clips.list({
      search: filters.search,
      phase: filters.phase,
      outcome: filters.outcome,
      teamPrincipleId: filters.principleId,
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

async function initialize(context = {}) {
  const run = ensureRuntime(context);
  run.store.setState({ status: "loading", error: "" });
  try {
    const state = run.store.getState();
    if (!state.match?.id && !state.video?.id) {
      run.store.setState({ status: "ready", error: "" });
      return;
    }
    await loadClips();
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

export function handleClick(event, context = {}) {
  const run = ensureRuntime(context);
  const root = getRoot(context);
  const target = event.target;
  if (target.closest("[data-video-analysis-load]")) {
    root?.querySelector("[data-video-analysis-file]")?.click();
    return true;
  }
  if (target.closest("[data-video-analysis-play]")) {
    toggleVideoPlayback(videoElement(context));
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
    }));
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
    const reviewList = addClipToReviewList(run.store.getState().reviewList, reviewButton.dataset.videoAnalysisReview);
    run.playlists.saveReviewList(reviewList);
    run.store.setState({ reviewList, message: "Clip added to review." });
    return true;
  }
  const removeButton = target.closest("[data-video-analysis-review-remove]");
  if (removeButton) {
    const reviewList = removeClipFromReviewList(run.store.getState().reviewList, removeButton.dataset.videoAnalysisReviewRemove);
    run.store.setState({ reviewList });
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
    loadClips({ search: "", phase: "", playerId: "", principleId: "", outcome: "" });
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

export function handleSubmit(event, context = {}) {
  if (!event.target.closest("[data-video-analysis-form]")) return false;
  event.preventDefault();
  const run = ensureRuntime(context);
  try {
    const clip = buildClipPayload(run.store.getState());
    run.store.setState({ status: "saving-clip", error: "" });
    run.clips.save(toApiClipPayload(clip)).then(() => {
      run.store.update((state) => ({
        ...state,
        draft: { ...state.draft, startMs: clip.endMs, endMs: clip.endMs + 5000, tags: "", note: "" },
        message: "Clip saved.",
      }));
      loadClips();
    }).catch((error) => run.store.setState({ status: "error", error: error.message || "Could not save clip." }));
  } catch (error) {
    run.store.setState({ error: error.message || "Could not save clip." });
  }
  return true;
}
