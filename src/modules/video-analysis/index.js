import { renderClipFilters } from "./components/ClipFilters.js";
import { renderClipIntelligence } from "./components/ClipIntelligence.js";
import { renderClipList } from "./components/ClipList.js";
import { renderCodingPanel } from "./components/CodingPanel.js";
import { renderCodingTemplateBuilder } from "./components/CodingTemplateBuilder.js";
import { renderPlayerClipDrawer } from "./components/PlayerClipDrawer.js";
import { renderPlaylistBuilder } from "./components/PlaylistBuilder.js";
import { renderTimeline } from "./components/Timeline.js";
import { renderVideoLibrary } from "./components/VideoLibrary.js";
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
import { createPlayableLocalCopy } from "./services/localPlaybackTranscodeService.js";
import {
  browserFileAccessCapabilities,
  buildLocalVideoHandleIdentity,
  isPreparedPlaybackUrl,
  localVideoStatusPatch,
  persistLocalVideoHandle,
  pickLocalVideoFile,
  restoreLocalVideoHandleForState,
} from "./services/localVideoSessionService.js";
import { addClipToReviewSection, buildReviewSessionPayload, removeClipFromReviewSection, updateReviewSectionNote } from "./services/reviewSessionService.js";
import { trimClipDraft } from "./services/timelineService.js";
import { describeVideoPlaybackError, getVideoCurrentMs, seekVideoToMs, toggleVideoPlayback } from "./services/videoPlaybackService.js";
import { findScheduleCandidate } from "./services/videoLibraryService.js";
import { bindPaintedVideoControls, bindRootEventFallback, eventElement } from "./video-analysis.dom-events.js";
import { createVideoLibraryController } from "./video-analysis.library-controller.js";
import { createVideoAnalysisStore } from "./video-analysis.store.js";

let runtime = null;
let videoLibraryController = null;

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

function libraryController() {
  if (!videoLibraryController) {
    videoLibraryController = createVideoLibraryController({
      ensureRuntime,
      getRuntime: () => runtime,
      loadClips,
      restoreLocalVideoHandle,
      revokeLocalVideoReference,
      shouldLoadMetadata,
      localVideoStatusPatch,
    });
  }
  return videoLibraryController;
}

function videoElement(context = {}) {
  return getRoot(context)?.querySelector("[data-video-analysis-video]");
}

const analysisRoomTabs = Object.freeze([
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "fs-player", label: "FS Player", icon: "play" },
  { id: "match-report", label: "Match Report", icon: "report" },
  { id: "briefs", label: "Briefs", icon: "briefs" },
]);

const analysisRoomTabIcons = Object.freeze({
  overview: `
    <svg class="analysis-room-tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="5" width="7" height="6" rx="1.5"></rect>
      <rect x="13" y="5" width="7" height="6" rx="1.5"></rect>
      <rect x="4" y="13" width="7" height="6" rx="1.5"></rect>
      <rect x="13" y="13" width="7" height="6" rx="1.5"></rect>
    </svg>
  `,
  play: `
    <svg class="analysis-room-tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8"></circle>
      <path d="m10 8.5 6 3.5-6 3.5Z"></path>
    </svg>
  `,
  report: `
    <svg class="analysis-room-tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 4h7l3 3v13H7z"></path>
      <path d="M14 4v4h4"></path>
      <path d="M9.5 12h5"></path>
      <path d="M9.5 15.5h4"></path>
    </svg>
  `,
  briefs: `
    <svg class="analysis-room-tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="5" y="6" width="14" height="12" rx="2"></rect>
      <path d="M8.5 10h7"></path>
      <path d="M8.5 14h4.5"></path>
    </svg>
  `,
});

function renderAnalysisRoomTabIcon(icon) {
  return analysisRoomTabIcons[icon] || analysisRoomTabIcons.overview;
}

function renderAnalysisRoomTabs(activeId = "fs-player") {
  return `
    <nav class="analysis-room-tabs" aria-label="Analysis Room sections">
      ${analysisRoomTabs.map((tab) => {
        const active = tab.id === activeId;
        return `
          <button
            type="button"
            class="analysis-room-tab${active ? " is-active" : ""}"
            ${active ? `aria-current="page"` : `disabled aria-disabled="true"`}
          >
            ${renderAnalysisRoomTabIcon(tab.icon)}
            <span>${escapeHtml(tab.label)}</span>
          </button>
        `;
      }).join("")}
    </nav>
  `;
}

function getAnalysisRoomTeamName(context = {}) {
  return String(context.teamName || context.team?.name || context.currentUser?.teamName || context.currentUser?.team || "Team").trim() || "Team";
}

function getAnalysisRoomTeamInitials(team = {}, teamName = "Team") {
  const shortName = String(team.shortName || team.short_name || "").trim();
  if (shortName && shortName.length <= 4) return shortName.toUpperCase();
  return (
    String(teamName || "Team")
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 3)
      .toUpperCase() || "TM"
  );
}

function renderAnalysisRoomTeamMark(context = {}) {
  const team = context.team || {};
  const teamName = getAnalysisRoomTeamName(context);
  const logoUrl = String(context.teamLogoUrl || team.logoUrl || team.logo_url || team.logo || team.badgeUrl || team.crestUrl || "").trim();
  return `
    <span class="analysis-room-team-mark${logoUrl ? " has-logo" : " is-empty"}" aria-label="${escapeHtml(`${teamName} logo`)}">
      ${logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(`${teamName} logo`)}" />`
        : `<strong>${escapeHtml(getAnalysisRoomTeamInitials(team, teamName))}</strong>`}
    </span>
  `;
}

function renderAnalysisRoomHeader(context = {}, activeTabId = "fs-player") {
  const teamName = getAnalysisRoomTeamName(context);
  return `
    <header class="analysis-room-header">
      <div class="analysis-room-team-head">
        ${renderAnalysisRoomTeamMark(context)}
        <div class="analysis-room-team-copy">
          <p class="analysis-room-kicker">Analysis Room</p>
          <h2>${escapeHtml(teamName)}</h2>
        </div>
      </div>
      ${renderAnalysisRoomTabs(activeTabId)}
    </header>
  `;
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

function isAbortError(error) {
  return error?.name === "AbortError";
}

function isBridgeNotRunningError(error) {
  return /^Local video bridge is not/i.test(String(error?.message || error || ""));
}

function isCurrentVideoElement(video) {
  return Boolean(video && video === videoElement(runtime?.context || {}));
}

function updateVideoDurationFromElement(video) {
  updateVideoDuration(Math.round(Number(video?.duration || 0) * 1000));
}

function markNativePlaybackReady(video) {
  const state = runtime?.store.getState();
  if (!state?.videoRef || video?.error) return;
  if (!isCurrentVideoElement(video)) return;
  if (state.playbackPreparation?.active || state.status === "preparing-playback") return;
  const preparedPlayback = isPreparedPlaybackUrl(state.videoRef.objectUrl);
  const nextStatus = preparedPlayback ? "prepared" : "native-ready";
  if (state.nativePlaybackReady && state.localFileStatus === nextStatus && !state.error) return;
  updateVideoDurationFromElement(video);
  runtime?.store.update((current) => ({
    ...current,
    status: "ready",
    message: current.message,
    error: "",
    nativePlaybackReady: true,
    bridgeFallbackRecommended: false,
    ...localVideoStatusPatch(
      nextStatus,
      preparedPlayback ? "Prepared copy ready" : "Native playback ready"
    ),
  }));
}

function setVideoPlaybackError(video) {
  const state = runtime?.store.getState();
  if (!isCurrentVideoElement(video)) return;
  if (shouldPreservePlaybackPreparation(state)) return;
  const message = state?.videoRef?.playbackCompatibility?.warning || describeVideoPlaybackError(video, state?.videoRef);
  if (!message) return;
  if (state?.status === "error" && state.error === message) return;
  runtime?.store.setState({
    status: "error",
    message: "",
    error: message,
    nativePlaybackReady: false,
    bridgeFallbackRecommended: true,
    ...localVideoStatusPatch("browser-unplayable", "Browser cannot play this file"),
  });
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

function shouldPreservePlaybackPreparation(state = {}) {
  return Boolean(
    state.playbackPreparation?.active
    || state.status === "preparing-playback"
    || state.bridgeFallbackRecommended
    || state.localFileStatus === "browser-unplayable"
    || state.localFileStatus === "bridge-not-running"
    || String(state.error || "").startsWith("Local video bridge")
  );
}

function canPreparePlayableCopy(state = {}) {
  const compatibility = state.videoRef?.playbackCompatibility || {};
  return Boolean(
    state.videoRef?.objectUrl
    && !isPreparedPlaybackUrl(state.videoRef.objectUrl)
    && (
      state.bridgeFallbackRecommended
      || state.error
      || compatibility.warning
      || compatibility.status === "unsupported"
      || compatibility.status === "uncertain"
    )
  );
}

function isFilePickerUserGestureError(error = {}) {
  const message = String(error?.message || "");
  return error?.name === "NotAllowedError" || message.includes("Must be handling a user gesture");
}

function openFileInputFallback(context = {}) {
  const fileInput = getRoot(context)?.querySelector("[data-video-analysis-file]");
  if (!fileInput) return false;
  fileInput.value = "";
  fileInput.click();
  return true;
}

async function openLocalVideoPicker(context = {}) {
  const run = ensureRuntime(context);
  const win = context.win || window;
  run.store.setState(browserFileAccessCapabilities(win));
  if (browserFileAccessCapabilities(win).fileSystemAccessSupported) {
    try {
      const selection = await pickLocalVideoFile(win);
      if (selection?.file) {
        await handleFileSelection(selection.file, context, { handle: selection.handle });
        return true;
      }
      return true;
    } catch (error) {
      if (isAbortError(error)) return true;
      if (isFilePickerUserGestureError(error) && openFileInputFallback(context)) {
        run.store.setState({
          status: "ready",
          message: "Choose a local video file.",
          error: "",
        });
        return true;
      }
      run.store.setState({ status: "error", message: "", error: error.message || "Could not open local video file." });
      return false;
    }
  }
  return openFileInputFallback(context);
}

async function restoreLocalVideoHandle(context = {}, options = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  run.store.update((current) => ({
    ...current,
    status: "restoring-local-video",
    message: options.silent ? current.message : "Restoring local file connection.",
    error: "",
    ...browserFileAccessCapabilities(context.win || window),
  }));
  try {
    const result = await restoreLocalVideoHandleForState({
      state,
      context,
      requestReadPermission: Boolean(options.requestPermission),
    });
    if (result.ok && result.reference) {
      revokeLocalVideoReference(state.videoRef, context.win || window);
      run.store.update((current) => ({
        ...current,
        videoRef: result.reference,
        ...result.patch,
        status: "ready",
        message: options.silent ? current.message : "Local file connected on this device.",
        error: "",
      }));
      return true;
    }
    run.store.update((current) => ({
      ...current,
      ...result.patch,
      status: current.status === "restoring-local-video" ? "ready" : current.status,
      message: options.silent ? "" : result.patch?.localFileMessage || current.message,
      error: "",
    }));
    return false;
  } catch (error) {
    run.store.setState({
      status: "error",
      message: "",
      error: error.message || "Could not restore the local file connection.",
      nativePlaybackReady: false,
    });
    return false;
  }
}

function paint(root, state) {
  const previousVideo = root.querySelector("[data-video-analysis-video]");
  const previousSrc = previousVideo?.currentSrc || previousVideo?.src || "";
  const previousTime = Number(previousVideo?.currentTime || 0);
  const wasPlaying = Boolean(previousVideo && !previousVideo.paused && !previousVideo.ended);
  const focusedDraft = root.querySelector("[data-video-analysis-draft]:focus")?.dataset.videoAnalysisDraft || "";
  const focusedFilter = root.querySelector("[data-video-analysis-filter]:focus")?.dataset.videoAnalysisFilter || "";
  const focusedLibraryFilter = root.querySelector("[data-video-analysis-library-filter]:focus")?.dataset.videoAnalysisLibraryFilter || "";
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
    <section class="analysis-room-shell">
      ${renderAnalysisRoomHeader(runtime?.context || {}, state.view === "library" ? "overview" : "fs-player")}
      <section class="analysis-room-tab-panel" aria-label="FS Player">
        <section class="video-analysis-shell">
          ${state.message || state.error ? `
            <div class="video-analysis-notifications" aria-live="polite">
              ${state.message ? `<p class="video-analysis-toast">${escapeHtml(state.message)}</p>` : ""}
              ${state.error ? `
                <div class="video-analysis-error" role="alert">
                  <span>${escapeHtml(state.error)}</span>
                  ${canPreparePlayableCopy(state) ? `<button type="button" data-video-analysis-prepare-playback>Prepare playable copy</button>` : ""}
                </div>
              ` : ""}
            </div>
          ` : ""}
          ${state.view === "library" ? renderVideoLibrary(displayState) : `
            <div class="video-analysis-workspace-nav">
              <button type="button" data-video-analysis-open-library>Back to library</button>
              <span>${escapeHtml(state.match?.title || state.pendingScheduleLink?.title || "Untitled session")}</span>
            </div>
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
          `}
        </section>
      </section>
    </section>
  `;
  bindPaintedVideoControls(root, {
    handleFileSelection,
    openLocalVideoPicker,
    preparePlayableCopy,
    restoreLocalVideoHandle,
    togglePlayback,
  });
  const video = root.querySelector("[data-video-analysis-video]");
  const nextFocus = focusedDraft
    ? root.querySelector(`[data-video-analysis-draft="${focusedDraft}"]`)
    : focusedFilter
      ? root.querySelector(`[data-video-analysis-filter="${focusedFilter}"]`)
      : focusedLibraryFilter
        ? root.querySelector(`[data-video-analysis-library-filter="${focusedLibraryFilter}"]`)
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
    video.addEventListener("loadedmetadata", () => markNativePlaybackReady(video), { once: true });
    video.addEventListener("canplay", () => markNativePlaybackReady(video), { once: true });
    video.addEventListener("playing", () => markNativePlaybackReady(video));
    video.addEventListener("error", () => setVideoPlaybackError(video), { once: true });
    if (video.readyState >= 1) markNativePlaybackReady(video);
  }
}

async function loadClips(nextFilters = null) {
  const run = runtime;
  if (!run) return;
  const state = run.store.getState();
  const filters = nextFilters || state.filters;
  if (!shouldLoadMetadata(run.context, state)) {
    const preservePlaybackPreparation = shouldPreservePlaybackPreparation(state);
    run.store.setState({
      status: preservePlaybackPreparation ? state.status : "ready",
      filters,
      error: preservePlaybackPreparation ? state.error : "",
    });
    return;
  }
  const preservePlaybackPreparation = shouldPreservePlaybackPreparation(state);
  run.store.setState({
    status: "loading-clips",
    error: preservePlaybackPreparation ? state.error : "",
  });
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
    run.store.update((current) => {
      const preservePlaybackPreparation = shouldPreservePlaybackPreparation(current);
      return {
        ...current,
        status: preservePlaybackPreparation ? current.status : "ready",
        clips,
        filters,
        error: preservePlaybackPreparation ? current.error : "",
      };
    });
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
  run.store.setState({ status: "loading", error: "", ...browserFileAccessCapabilities(context.win || window) });
  try {
    await libraryController().loadLibrary();
    if (run.store.getState().view !== "library") await loadClips();
    await loadSavedSearches();
    if (run.store.getState().match?.id || run.store.getState().video?.id) {
      await restoreLocalVideoHandle(context, { silent: true });
    }
    run.store.update((current) => ({ ...current, status: current.status === "loading" ? "ready" : current.status }));
  } catch (error) {
    run.store.setState({ status: "ready", error: error.message || "" });
  }
}

export function render(context = {}) {
  const run = ensureRuntime(context);
  const root = getRoot(context);
  if (!root) return;
  bindRootEventFallback(root, context, {
    change: handleChange,
    click: handleClick,
    input: handleInput,
    submit: handleSubmit,
  });
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

export function resetVideoAnalysisRuntimeForTests() {
  runtime?.unsubscribe?.();
  runtime = null;
  videoLibraryController = null;
}

async function handleFileSelection(file, context = {}, options = {}) {
  const run = ensureRuntime(context);
  const previous = run.store.getState().videoRef;
  try {
    const reference = await createLocalVideoReference(file, context.win || window);
    revokeLocalVideoReference(previous, context.win || window);
    const playbackWarning = reference.playbackCompatibility?.warning || "";
    const initialStatusPatch = playbackWarning
      ? localVideoStatusPatch("browser-unplayable", "Browser cannot play this file")
      : localVideoStatusPatch("restored", options.handle ? "Local file connected on this device" : "Local file linked for this session");
    run.store.setState({
      view: "workspace",
      videoRef: reference,
      playbackPreparation: { active: false, token: "" },
      status: playbackWarning ? "error" : "saving-source",
      message: playbackWarning ? "" : "Local video linked.",
      error: playbackWarning,
      nativePlaybackReady: false,
      bridgeFallbackRecommended: Boolean(playbackWarning),
      ...browserFileAccessCapabilities(context.win || window),
      ...initialStatusPatch,
    });
    const linkState = run.store.getState();
    const pendingSchedule = linkState.pendingScheduleLink || {};
    const activeMatch = linkState.match || {};
    const payload = await run.videos.createLocalVideoSource({
      displayName: reference.displayName,
      localVideoIdentifier: reference.localVideoIdentifier,
      fileSizeBytes: reference.fileSizeBytes,
      durationMs: reference.durationMs,
      matchId: activeMatch.id || "",
      matchTitle: activeMatch.title || pendingSchedule.title || reference.displayName,
      matchDate: activeMatch.match_date || activeMatch.matchDate || pendingSchedule.matchDate || "",
      eventType: activeMatch.event_type || activeMatch.eventType || pendingSchedule.eventType || "",
      scheduleEventId: activeMatch.schedule_event_id || activeMatch.scheduleEventId || pendingSchedule.scheduleEventId || "",
      scheduleDayKey: activeMatch.schedule_day_key || activeMatch.scheduleDayKey || pendingSchedule.scheduleDayKey || pendingSchedule.matchDate || "",
      opponent: activeMatch.opponent || pendingSchedule.opponent || "",
    });
    const identity = buildLocalVideoHandleIdentity(run.store.getState(), context, {
      match: payload.match,
      video: payload.video,
      source: payload.source,
      reference,
    });
    run.store.update((state) => {
      const preservePlaybackPreparation = shouldPreservePlaybackPreparation(state);
      return {
        ...state,
        match: payload.match || state.match || { id: payload.video?.match_id, title: reference.displayName },
        video: payload.video,
        source: payload.source,
        pendingScheduleLink: null,
        localFileHandleIdentity: identity,
        status: preservePlaybackPreparation ? state.status : playbackWarning ? "error" : "ready",
        message: preservePlaybackPreparation ? state.message : playbackWarning ? "" : "Video metadata saved.",
        error: preservePlaybackPreparation ? state.error : playbackWarning,
        bridgeFallbackRecommended: Boolean(playbackWarning),
      };
    });
    if (options.handle) {
      try {
        await persistLocalVideoHandle({
          state: run.store.getState(),
          context,
          handle: options.handle,
          reference,
          payload,
        });
        run.store.update((state) => ({
          ...state,
          localFileHandleIdentity: identity,
          localFileMessage: playbackWarning ? state.localFileMessage : "Local file connected on this device",
        }));
      } catch {
        run.store.update((state) => ({
          ...state,
          localFileMessage: "Local file linked for this session. Browser could not remember the file handle.",
        }));
      }
    }
    await libraryController().loadLibrary({ silent: true });
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

async function preparePlayableCopy(context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  if (!state.videoRef) {
    run.store.setState({
      status: "error",
      message: "",
      error: "Reload the original local file before preparing a playable copy.",
      playbackPreparation: { active: false, token: "" },
      nativePlaybackReady: false,
      bridgeFallbackRecommended: true,
      ...localVideoStatusPatch("browser-unplayable", "Browser cannot play this file"),
    });
    return false;
  }
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  run.store.update((current) => ({
    ...current,
    status: "preparing-playback",
    message: "Preparing local playback copy.",
    error: "",
    nativePlaybackReady: false,
    bridgeFallbackRecommended: true,
    ...localVideoStatusPatch("preparing", "Preparing browser-safe copy"),
    playbackPreparation: { active: true, token },
  }));
  try {
    const playableReference = await createPlayableLocalCopy(state.videoRef, context.win || window);
    run.store.update((current) => ({
      ...current,
      videoRef: playableReference,
      status: "ready",
      message: "Playable local copy ready.",
      error: "",
      nativePlaybackReady: true,
      bridgeFallbackRecommended: false,
      ...localVideoStatusPatch("prepared", "Prepared copy ready"),
      playbackPreparation: { active: false, token: "" },
    }));
    return true;
  } catch (error) {
    run.store.update((current) => ({
      ...current,
      status: "error",
      message: "",
      error: error.message || "Could not prepare playable copy.",
      nativePlaybackReady: false,
      bridgeFallbackRecommended: true,
      ...localVideoStatusPatch(
        isBridgeNotRunningError(error) ? "bridge-not-running" : "browser-unplayable",
        isBridgeNotRunningError(error) ? "Bridge not running" : "Browser cannot play this file"
      ),
      playbackPreparation: { active: false, token: "" },
    }));
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
  const target = eventElement(event);
  if (!target?.closest) return false;
  if (target.closest("[data-video-analysis-open-library]")) {
    libraryController().openLibraryView(context);
    return true;
  }
  if (target.closest("[data-video-analysis-library-refresh]")) {
    libraryController().loadLibrary();
    return true;
  }
  const libraryItem = target.closest("[data-video-analysis-open-library-item]");
  if (libraryItem) {
    libraryController().openLibraryItem(libraryItem.dataset.videoAnalysisOpenLibraryItem, context);
    return true;
  }
  if (target.closest("[data-video-analysis-load]")) {
    openLocalVideoPicker(context);
    return true;
  }
  if (target.closest("[data-video-analysis-restore-local-file]")) {
    restoreLocalVideoHandle(context, { requestPermission: true });
    return true;
  }
  if (target.closest("[data-video-analysis-play]")) {
    togglePlayback(context);
    return true;
  }
  if (target.closest("[data-video-analysis-prepare-playback]")) {
    preparePlayableCopy(context);
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
  const target = eventElement(event);
  if (!target?.closest) return false;
  const libraryFilter = target.closest("[data-video-analysis-library-filter]");
  if (libraryFilter) {
    const key = libraryFilter.dataset.videoAnalysisLibraryFilter;
    run.store.update((state) => ({
      ...state,
      library: {
        ...(state.library || {}),
        filters: { ...(state.library?.filters || {}), [key]: libraryFilter.value },
      },
    }));
    return true;
  }
  const draftField = target.closest("[data-video-analysis-draft]");
  if (draftField) {
    const key = draftField.dataset.videoAnalysisDraft;
    run.store.update((state) => ({ ...state, draft: { ...state.draft, [key]: draftField.value } }));
    return true;
  }
  const filterField = target.closest("[data-video-analysis-filter]");
  if (filterField) {
    const key = filterField.dataset.videoAnalysisFilter;
    const filters = { ...run.store.getState().filters, [key]: filterField.value };
    loadClips(filters);
    return true;
  }
  const timelineField = target.closest("[data-video-analysis-timeline]");
  if (timelineField) {
    const key = timelineField.dataset.videoAnalysisTimeline;
    run.store.update((state) => ({ ...state, timeline: { ...(state.timeline || {}), [key]: timelineField.value } }));
    return true;
  }
  const reviewNote = target.closest("[data-video-analysis-review-note]");
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
  const run = ensureRuntime(context);
  const target = eventElement(event);
  if (!target?.closest) return false;
  const fileInput = target.closest("[data-video-analysis-file]");
  if (fileInput?.files?.[0]) {
    handleFileSelection(fileInput.files[0], context);
    fileInput.value = "";
    return true;
  }
  const scheduleLink = target.closest("[data-video-analysis-link-schedule]");
  if (scheduleLink) {
    const matchId = scheduleLink.dataset.videoAnalysisLinkSchedule;
    const candidate = findScheduleCandidate(run.store.getState(), scheduleLink.value);
    libraryController().saveMatchLink(matchId, candidate ? {
      scheduleEventId: candidate.scheduleEventId,
      scheduleDayKey: candidate.scheduleDayKey,
      matchDate: candidate.matchDate,
      eventType: candidate.eventType,
      opponent: candidate.opponent,
    } : { scheduleEventId: "", scheduleDayKey: "", matchDate: "", eventType: "training" }, context);
    return true;
  }
  const dateLink = target.closest("[data-video-analysis-link-date]");
  if (dateLink) {
    libraryController().saveMatchLink(dateLink.dataset.videoAnalysisLinkDate, {
      matchDate: dateLink.value,
      scheduleDayKey: dateLink.value,
      scheduleEventId: "",
    }, context);
    return true;
  }
  const typeLink = target.closest("[data-video-analysis-link-type]");
  if (typeLink) {
    libraryController().saveMatchLink(typeLink.dataset.videoAnalysisLinkType, { eventType: typeLink.value }, context);
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
  const target = eventElement(event);
  if (!target?.closest("[data-video-analysis-form]")) return false;
  event.preventDefault();
  saveDraftClip(context);
  return true;
}
