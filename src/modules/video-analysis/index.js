import { renderClipFilters } from "./components/ClipFilters.js";
import { renderClipIntelligence } from "./components/ClipIntelligence.js";
import { renderClipList } from "./components/ClipList.js";
import { renderCodingTemplateBuilder } from "./components/CodingTemplateBuilder.js";
import { renderPlayerClipDrawer } from "./components/PlayerClipDrawer.js";
import { renderPresentationModule } from "./components/PresentationModule.js";
import { renderTimeline } from "./components/Timeline.js";
import { renderVideoLibrary } from "./components/VideoLibrary.js";
import { renderVideoPlayer } from "./components/VideoPlayer.js";
import { escapeHtml } from "./components/renderHelpers.js";
import { normalizeClipInstance } from "./domain/clipInstance.model.js";
import { createCodingTemplateRepository } from "./repositories/codingTemplateRepository.js";
import { createClipRepository } from "./repositories/clipRepository.js";
import { createPlaylistRepository } from "./repositories/playlistRepository.js";
import { createPresentationRepository } from "./repositories/presentationRepository.js";
import { createVideoRepository } from "./repositories/videoRepository.js";
import { applyCodingButtonToClip, buildClipPayload, toApiClipPayload } from "./services/clipInstanceService.js";
import { filterClipsForMatrix, savedSearchTitle } from "./services/clipIntelligenceService.js";
import {
  addCodingButtonGroupToTemplate,
  addCodingButtonToTemplate,
  buildCodingButtonAction,
  duplicateCodingButtonInTemplate,
  findTemplateButton,
  removeCodingButtonFromTemplate,
  shouldIgnoreShortcutTarget,
  updateCodingButtonField,
  updateCodingButtonMsField,
} from "./services/codingTemplateService.js";
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
import {
  addClipToPresentation,
  addDrawingLayerToItem,
  addPresentationSection,
  buildPresentationPayload,
  createDefaultPresentation,
  movePresentationItem,
  movePresentationItemToSection,
  normalizeDrawingLayer,
  normalizePresentation,
  presentationQueue,
  removeDrawingLayerFromItem,
  removePresentationItem,
  selectedPresentationItem,
  smartCollectionTitle,
  updateDrawingLayerInItem,
  updatePresentationItem,
  updatePresentationSection,
} from "./services/presentationService.js";
import {
  generateClipThumbnail,
  getCachedThumbnail,
  saveCachedThumbnail,
  thumbnailCacheKey,
  clipThumbnailTimeMs,
} from "./services/localThumbnailCacheService.js";
import {
  defaultDrawingGeometry,
  geometryFromDrag,
  moveGeometry,
  pointerPercent,
  resizeGeometry,
} from "./services/presentationLayerGeometryService.js";
import { buildTimelineLanes, normalizeTimelineLaneMode, trimClipDraft } from "./services/timelineService.js";
import { describeVideoPlaybackError, getVideoCurrentMs, seekVideoToMs, toggleVideoPlayback } from "./services/videoPlaybackService.js";
import { createTimelineScrubController } from "./timeline/timeline.interaction.js";
import { findScheduleCandidate } from "./services/videoLibraryService.js";
import { bindPaintedVideoControls, bindRootEventFallback, eventElement } from "./video-analysis.dom-events.js";
import { createVideoLibraryController } from "./video-analysis.library-controller.js";
import { createVideoAnalysisStore } from "./video-analysis.store.js";

let runtime = null;
let videoLibraryController = null;
let timelineScrubController = null;
const thumbnailRequests = new Set();
const CLIP_PAGE_LIMIT = 200;
const CLIP_WORKSPACE_LIMIT = 1000;

function getRoot(context = {}) {
  return context.ui?.analysisRoomWorkspace || null;
}

function createRuntime(context = {}) {
  const store = createVideoAnalysisStore(context);
  return {
    context,
    store,
    templates: createCodingTemplateRepository(context),
    clips: createClipRepository(context),
    playlists: createPlaylistRepository(context),
    presentations: createPresentationRepository(context),
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

function timelineController(context = {}) {
  if (!timelineScrubController) {
    timelineScrubController = createTimelineScrubController({
      getRoot: () => getRoot(runtime?.context || context),
      getState: () => runtime?.store.getState() || {},
      getVideoElement: () => videoElement(runtime?.context || context),
      getWindow: () => runtime?.context?.win || context.win || window,
      onClipTrimCommit: (payload) => commitClipTrim(payload, runtime?.context || context),
      updateState: (updater) => runtime?.store.update(updater),
    });
  }
  return timelineScrubController;
}

const analysisRoomTabs = Object.freeze([
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "fs-player", label: "FS Player", icon: "play" },
  { id: "presentation", label: "Presentation", icon: "presentation" },
  { id: "match-report", label: "Match Report", icon: "report" },
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
  presentation: `
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

function analysisRoomTabEnabled(tab = {}) {
  if (tab.id === "match-report") return false;
  return ["overview", "fs-player", "presentation"].includes(tab.id);
}

function renderAnalysisRoomTabs(activeId = "fs-player") {
  return `
    <nav class="analysis-room-tabs" aria-label="Analysis Room sections">
      ${analysisRoomTabs.map((tab) => {
        const active = tab.id === activeId;
        const enabled = active || analysisRoomTabEnabled(tab);
        return `
          <button
            type="button"
            class="analysis-room-tab${active ? " is-active" : ""}"
            ${active ? `aria-current="page"` : ""}
            ${enabled ? `data-video-analysis-room-tab="${escapeHtml(tab.id)}"` : `disabled aria-disabled="true"`}
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

function activeAnalysisRoomTab(state = {}) {
  if (state.view === "library") return "overview";
  return state.activeAnalysisRoomTab === "presentation" ? "presentation" : "fs-player";
}

function renderWorkspaceNav(state = {}) {
  return `
    <div class="video-analysis-workspace-nav">
      <button type="button" data-video-analysis-open-library>Back to library</button>
      <span>${escapeHtml(state.match?.title || state.pendingScheduleLink?.title || "Untitled session")}</span>
    </div>
  `;
}

function renderFsPlayerWorkspace(displayState = {}) {
  return `
    ${renderWorkspaceNav(displayState)}
    ${renderVideoPlayer(displayState)}
    ${renderTimeline(displayState)}
    <section class="video-analysis-workstation video-analysis-workstation--coding-only">
      <section class="video-analysis-left-stack">
        ${renderCodingTemplateBuilder(displayState)}
      </section>
    </section>
    ${renderPlayerClipDrawer(displayState)}
  `;
}

function renderPresentationWorkspace(state = {}) {
  return `
    <section class="video-analysis-presentation-workspace">
      ${renderPresentationModule(state)}
    </section>
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
  const capabilities = browserFileAccessCapabilities(win);
  if (capabilities.fileSystemAccessSupported) {
    try {
      const selection = await pickLocalVideoFile(win);
      run.store.setState(capabilities);
      if (selection?.file) {
        await handleFileSelection(selection.file, context, { handle: selection.handle });
        return true;
      }
      return true;
    } catch (error) {
      if (isAbortError(error)) return true;
      if (isFilePickerUserGestureError(error) && openFileInputFallback(context)) {
        run.store.setState({
          ...capabilities,
          status: "ready",
          message: "Choose a local video file.",
          error: "",
        });
        return true;
      }
      run.store.setState({ ...capabilities, status: "error", message: "", error: error.message || "Could not open local video file." });
      return false;
    }
  }
  run.store.setState(capabilities);
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
      const metadataPatch = await ensureMetadataForRestoredReference(run, context, result.reference, result.record);
      revokeLocalVideoReference(state.videoRef, context.win || window);
      run.store.update((current) => ({
        ...current,
        ...metadataPatch,
        videoRef: result.reference,
        ...result.patch,
        localFileHandleIdentity: metadataPatch.localFileHandleIdentity || result.patch?.localFileHandleIdentity,
        status: "ready",
        message: options.silent ? current.message : metadataPatch.video ? "Local file and video metadata restored." : "Local file connected on this device.",
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

function hasVideoAnalysisMetadata(state = {}) {
  return Boolean(state.match?.id && state.video?.id);
}

function localVideoSourcePayloadFromReference(reference = {}, state = {}) {
  const pendingSchedule = state.pendingScheduleLink || {};
  const activeMatch = state.match || {};
  return {
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
  };
}

async function ensureMetadataForRestoredReference(run, context = {}, reference = {}, record = {}) {
  const state = run.store.getState();
  if (hasVideoAnalysisMetadata(state) || !reference?.localVideoIdentifier) return {};
  let payload = null;
  try {
    payload = await run.videos.createLocalVideoSource(localVideoSourcePayloadFromReference(reference, state));
  } catch {
    return {};
  }
  const fallbackMatch = payload.video?.match_id
    ? { ...(state.match || {}), id: payload.video.match_id, title: state.match?.title || reference.displayName }
    : state.match;
  const identity = buildLocalVideoHandleIdentity(state, context, {
    match: payload.match || fallbackMatch,
    video: payload.video,
    source: payload.source,
    reference,
  });
  if (record?.handle) {
    try {
      await persistLocalVideoHandle({
        state,
        context,
        handle: record.handle,
        reference,
        payload: { match: payload.match || fallbackMatch, video: payload.video, source: payload.source },
      });
    } catch {
      // Playback restore should not fail just because IndexedDB cannot backfill the richer identity.
    }
  }
  return {
    match: payload.match || fallbackMatch,
    video: payload.video || state.video,
    source: payload.source || state.source,
    pendingScheduleLink: null,
    localFileHandleIdentity: identity,
  };
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
  const focusedButtonField = root.querySelector("[data-video-analysis-button-field]:focus")?.dataset.videoAnalysisButtonField || "";
  const focusedButtonMsField = root.querySelector("[data-video-analysis-button-ms-field]:focus")?.dataset.videoAnalysisButtonMsField || "";
  const focusedTemplateField = root.querySelector("[data-video-analysis-template-field]:focus")?.dataset.videoAnalysisTemplateField || "";
  const focusedTemplateBuilderField = root.querySelector("[data-video-analysis-template-builder-field]:focus")?.dataset.videoAnalysisTemplateBuilderField || "";
  const focusedPresentationTitle = Boolean(root.querySelector("[data-video-analysis-presentation-title]:focus"));
  const focusedPresentationNotes = Boolean(root.querySelector("[data-video-analysis-presentation-notes]:focus"));
  const focusedPresentationFilter = root.querySelector("[data-video-analysis-presentation-filter]:focus")?.dataset.videoAnalysisPresentationFilter || "";
  const focusedPresentationSectionTitle = root.querySelector("[data-video-analysis-presentation-section-title]:focus")?.dataset.videoAnalysisPresentationSectionTitle || "";
  const focusedPresentationSectionNote = root.querySelector("[data-video-analysis-presentation-section-note]:focus")?.dataset.videoAnalysisPresentationSectionNote || "";
  const focusedPresentationItemTitle = root.querySelector("[data-video-analysis-presentation-item-title]:focus")?.dataset.videoAnalysisPresentationItemTitle || "";
  const focusedPresentationItemNote = root.querySelector("[data-video-analysis-presentation-item-note]:focus")?.dataset.videoAnalysisPresentationItemNote || "";
  const focusedDrawingField = root.querySelector("[data-video-analysis-drawing-field]:focus")?.dataset.videoAnalysisDrawingField || "";
  const selectionStart = root.ownerDocument?.activeElement?.selectionStart;
  const visibleClips = filterClipsForMatrix(
    state.clips || [],
    state.matrix?.mode,
    state.matrix?.selectedRow,
    state.matrix?.selectedColumn
  );
  const displayState = { ...state, clips: visibleClips, allClips: state.clips };
  const activeTabId = activeAnalysisRoomTab(state);
  root.innerHTML = `
    <section class="analysis-room-shell">
      ${renderAnalysisRoomHeader(runtime?.context || {}, activeTabId)}
      <section class="analysis-room-tab-panel" aria-label="${escapeHtml(activeTabId === "presentation" ? "Presentation" : activeTabId === "overview" ? "Overview" : "FS Player")}">
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
            ${activeTabId === "presentation" ? renderPresentationWorkspace(state) : renderFsPlayerWorkspace(displayState)}
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
        : focusedButtonField
          ? root.querySelector(`[data-video-analysis-button-field="${focusedButtonField}"]`)
          : focusedButtonMsField
            ? root.querySelector(`[data-video-analysis-button-ms-field="${focusedButtonMsField}"]`)
            : focusedTemplateField
              ? root.querySelector(`[data-video-analysis-template-field="${focusedTemplateField}"]`)
                : focusedTemplateBuilderField
                  ? root.querySelector(`[data-video-analysis-template-builder-field="${focusedTemplateBuilderField}"]`)
                  : focusedPresentationTitle
                    ? root.querySelector("[data-video-analysis-presentation-title]")
                    : focusedPresentationNotes
                      ? root.querySelector("[data-video-analysis-presentation-notes]")
                      : focusedPresentationFilter
                        ? root.querySelector(`[data-video-analysis-presentation-filter="${focusedPresentationFilter}"]`)
                        : focusedPresentationSectionTitle
                          ? root.querySelector(`[data-video-analysis-presentation-section-title="${focusedPresentationSectionTitle}"]`)
                          : focusedPresentationSectionNote
                            ? root.querySelector(`[data-video-analysis-presentation-section-note="${focusedPresentationSectionNote}"]`)
                            : focusedPresentationItemTitle
                              ? root.querySelector(`[data-video-analysis-presentation-item-title="${focusedPresentationItemTitle}"]`)
                              : focusedPresentationItemNote
                                ? root.querySelector(`[data-video-analysis-presentation-item-note="${focusedPresentationItemNote}"]`)
                                : focusedDrawingField
                                  ? root.querySelector(`[data-video-analysis-drawing-field="${focusedDrawingField}"]`)
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
      timelineController(runtime?.context || context).handleVideoTimeUpdate(video);
    };
    video.addEventListener("loadedmetadata", () => markNativePlaybackReady(video), { once: true });
    video.addEventListener("canplay", () => markNativePlaybackReady(video), { once: true });
    video.addEventListener("playing", () => markNativePlaybackReady(video));
    video.addEventListener("error", () => setVideoPlaybackError(video), { once: true });
    if (video.readyState >= 1) markNativePlaybackReady(video);
  }
  if (activeTabId === "presentation") ensurePresentationThumbnails(runtime?.context || {});
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
    let clips = [];
    for (let offset = 0; offset < CLIP_WORKSPACE_LIMIT; offset += CLIP_PAGE_LIMIT) {
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
        limit: CLIP_PAGE_LIMIT,
        offset,
      });
      const pageClips = (payload.clips || []).map(normalizeClipInstance);
      const pageSize = Math.max(0, Number(payload.pageSize ?? pageClips.length) || 0);
      clips = clips.concat(pageClips);
      if (pageSize < CLIP_PAGE_LIMIT) break;
    }
    clips = clips.slice(0, CLIP_WORKSPACE_LIMIT);
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

async function loadPresentations(options = {}) {
  const run = runtime;
  if (!run) return;
  if (!shouldLoadMetadata(run.context, run.store.getState())) return;
  try {
    const payload = await run.presentations.list(40);
    run.store.update((current) => ({
      ...current,
      presentation: {
        ...(current.presentation || {}),
        status: "ready",
        presentations: payload.presentations || [],
        smartCollections: payload.smartCollections || [],
        error: "",
      },
    }));
    if (!options.skipSources) await loadPresentationSources(null, { silent: true });
  } catch (error) {
    run.store.update((current) => ({
      ...current,
      presentation: {
        ...(current.presentation || {}),
        status: "error",
        error: error.message || "Could not load presentations.",
      },
    }));
  }
}

async function loadPresentation(id = "") {
  const run = runtime;
  if (!run || !id) return false;
  try {
    run.store.update((current) => ({
      ...current,
      presentation: { ...(current.presentation || {}), status: "loading", error: "" },
    }));
    const payload = await run.presentations.get(id);
    const presentation = normalizePresentation(payload.presentation || {});
    run.store.update((current) => ({
      ...current,
      presentation: {
        ...(current.presentation || {}),
        status: "ready",
        activePresentationId: presentation.id,
        activeSectionId: presentation.sections[0]?.id || "",
        selectedItemId: presentationQueue(presentation)[0]?.id || "",
        selectedClipId: presentationQueue(presentation)[0]?.clipId || "",
        current: presentation,
        smartCollections: payload.presentation?.smartCollections || current.presentation?.smartCollections || [],
        error: "",
      },
    }));
    return true;
  } catch (error) {
    run.store.update((current) => ({
      ...current,
      presentation: { ...(current.presentation || {}), status: "error", error: error.message || "Could not load presentation." },
    }));
    return false;
  }
}

async function loadPresentationSources(nextFilters = null, options = {}) {
  const run = runtime;
  if (!run) return;
  const state = run.store.getState();
  if (!shouldLoadMetadata(run.context, state)) return;
  const filters = nextFilters || state.presentation?.sourceFilters || {};
  const searchParts = [filters.search, filters.tag].map((value) => String(value || "").trim()).filter(Boolean);
  run.store.update((current) => ({
    ...current,
    presentation: {
      ...(current.presentation || {}),
      status: options.silent ? current.presentation?.status || "ready" : "loading-sources",
      sourceFilters: filters,
      error: "",
    },
  }));
  try {
    const payload = await run.presentations.listClips({
      search: searchParts.join(" "),
      phase: filters.phase,
      outcome: filters.outcome,
      playerId: filters.playerId,
      date: filters.date,
      type: filters.type,
      limit: filters.limit || 80,
    });
    const clips = (payload.clips || []).map(normalizeClipInstance);
    run.store.update((current) => ({
      ...current,
      presentation: {
        ...(current.presentation || {}),
        status: "ready",
        sourceClips: clips,
        sourceTotal: clips.length,
        sourceFilters: filters,
        error: "",
      },
    }));
  } catch (error) {
    run.store.update((current) => ({
      ...current,
      presentation: { ...(current.presentation || {}), status: "error", error: error.message || "Could not load presentation clips." },
    }));
  }
}

async function saveCurrentPresentation(context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  const currentPresentation = state.presentation?.current || createDefaultPresentation();
  try {
    run.store.update((current) => ({
      ...current,
      presentation: { ...(current.presentation || {}), status: "saving", error: "" },
    }));
    const payload = await run.presentations.save(buildPresentationPayload(currentPresentation));
    const presentation = normalizePresentation(payload.presentation || currentPresentation);
    run.store.update((current) => ({
      ...current,
      message: "Presentation saved.",
      presentation: {
        ...(current.presentation || {}),
        status: "ready",
        activePresentationId: presentation.id,
        current: presentation,
        presentations: [
          presentation,
          ...(current.presentation?.presentations || []).filter((item) => item.id !== presentation.id),
        ],
        error: "",
      },
    }));
    return true;
  } catch (error) {
    run.store.update((current) => ({
      ...current,
      presentation: { ...(current.presentation || {}), status: "error", error: error.message || "Could not save presentation." },
    }));
    return false;
  }
}

async function saveCurrentSmartCollection(context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  const filters = state.presentation?.sourceFilters || {};
  try {
    const payload = await run.presentations.saveSmartCollection({
      presentationId: state.presentation?.current?.id || "",
      title: smartCollectionTitle(filters),
      description: "Live playlist generated from Data Explorer filters.",
      visibility: "coach-analyst",
      sortMode: "newest",
      search: filters,
      metadata: {
        kind: "live-playlist",
        source: "presentation-data-explorer",
      },
      shareTargets: [
        { targetType: "role", targetId: "coach", accessLevel: "edit" },
        { targetType: "role", targetId: "analyst", accessLevel: "edit" },
      ],
    });
    run.store.update((current) => ({
      ...current,
      message: "Smart collection saved.",
      presentation: {
        ...(current.presentation || {}),
        smartCollections: [
          payload.smartCollection,
          ...(current.presentation?.smartCollections || []).filter((item) => item.id !== payload.smartCollection?.id),
        ].filter(Boolean),
        error: "",
      },
    }));
    return true;
  } catch (error) {
    run.store.update((current) => ({
      ...current,
      presentation: { ...(current.presentation || {}), status: "error", error: error.message || "Could not save smart collection." },
    }));
    return false;
  }
}

async function saveSelectedDrawingLayers(context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  const presentation = state.presentation?.current || {};
  const item = selectedPresentationItem(presentation, state.presentation?.selectedItemId, state.presentation?.selectedClipId);
  if (!presentation.id || !item?.id) {
    run.store.update((current) => ({
      ...current,
      presentation: { ...(current.presentation || {}), error: "Save the presentation before saving drawing layers." },
    }));
    return false;
  }
  try {
    const saved = [];
    for (const layer of item.drawings || []) {
      const payload = await run.presentations.saveDrawingLayer({
        ...layer,
        presentationId: presentation.id,
        presentationItemId: item.id,
        clipId: item.clipId,
      });
      if (payload.drawingLayer) saved.push(payload.drawingLayer);
    }
    run.store.update((current) => ({
      ...current,
      message: "Drawing layers saved.",
      presentation: {
        ...(current.presentation || {}),
        current: updatePresentationItem(current.presentation?.current, item.id, { drawings: saved }),
        error: "",
      },
    }));
    return true;
  } catch (error) {
    run.store.update((current) => ({
      ...current,
      presentation: { ...(current.presentation || {}), status: "error", error: error.message || "Could not save drawing layers." },
    }));
    return false;
  }
}

function thumbnailCandidateClips(state = {}) {
  const sourceClips = Array.isArray(state.presentation?.sourceClips) ? state.presentation.sourceClips : [];
  const queueClips = presentationQueue(state.presentation?.current || {})
    .map((item) => item.clip)
    .filter(Boolean);
  const seen = new Set();
  return [...queueClips, ...sourceClips].filter((clip) => {
    const id = clip?.id || clip?.clipId || clip?.clip_instance_id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, 60);
}

function ensurePresentationThumbnails(context = {}) {
  const run = runtime;
  if (!run) return;
  const state = run.store.getState();
  const videoRef = state.videoRef || {};
  if (!videoRef.objectUrl || !videoRef.localVideoIdentifier) return;
  for (const clip of thumbnailCandidateClips(state)) {
    const key = thumbnailCacheKey(videoRef, clip);
    if (!key || state.presentation?.thumbnails?.[key] || thumbnailRequests.has(key)) continue;
    thumbnailRequests.add(key);
    const win = context.win || window;
    getCachedThumbnail(key, win)
      .then((cached) => cached || generateClipThumbnail(videoRef, clip, win))
      .then(async (dataUrl) => {
        if (!dataUrl) return;
        if (!dataUrl.startsWith("data:image/")) return;
        if (!state.presentation?.thumbnails?.[key]) {
          await saveCachedThumbnail(key, {
            dataUrl,
            localVideoIdentifier: videoRef.localVideoIdentifier,
            clipId: clip.id || clip.clipId || clip.clip_instance_id,
            timestampMs: clipThumbnailTimeMs(clip),
          }, win).catch(() => null);
        }
        run.store.update((current) => ({
          ...current,
          presentation: {
            ...(current.presentation || {}),
            thumbnails: {
              ...(current.presentation?.thumbnails || {}),
              [key]: dataUrl,
            },
          },
        }));
      })
      .catch(() => null)
      .finally(() => thumbnailRequests.delete(key));
  }
}

function addDrawingLayerAtPoint(context = {}, geometry = null) {
  const run = ensureRuntime(context);
  run.store.update((state) => {
    const presentation = state.presentation?.current;
    const item = selectedPresentationItem(presentation, state.presentation?.selectedItemId, state.presentation?.selectedClipId);
    if (!item) return state;
    const draft = state.presentation?.drawingDraft || {};
    const tool = state.presentation?.drawingTool || "arrow";
    const layer = createDrawingLayer(state, item, context, geometry || defaultDrawingGeometry(tool));
    return {
      ...state,
      presentation: {
        ...(state.presentation || {}),
        current: addDrawingLayerToItem(presentation, item.id, layer),
        selectedDrawingLayerId: layer.id,
        drawingDraft: { ...draft, timestampSeconds: "", durationSeconds: "", text: "" },
        drawingUndoStack: [...(state.presentation?.drawingUndoStack || []), presentation].slice(-20),
        drawingRedoStack: [],
      },
    };
  });
  return true;
}

function createDrawingLayer(state = {}, item = {}, context = {}, geometry = {}) {
  const draft = state.presentation?.drawingDraft || {};
  const tool = state.presentation?.drawingTool || "arrow";
  const presentation = state.presentation?.current || {};
  return normalizeDrawingLayer({
      presentationId: presentation.id,
      presentationItemId: item.id,
      clipId: item.clipId,
      timestampMs: currentPlayheadMs(context, state),
      durationMs: draft.durationSeconds ? Math.round(Number(draft.durationSeconds || 0) * 1000) : null,
      tool,
      text: draft.text || (tool === "text" ? "Coach point" : ""),
      geometry,
      style: { color: tool === "spotlight" ? "#ffffff" : "#f4d06f" },
    });
}

function drawingLayerById(item = {}, layerId = "") {
  return (item.drawings || []).find((layer) => layer.id === layerId) || null;
}

function startDrawingInteraction(event, context = {}, surface = null) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  const presentation = state.presentation?.current;
  const item = selectedPresentationItem(presentation, state.presentation?.selectedItemId, state.presentation?.selectedClipId);
  if (!item) return false;
  const point = pointerPercent(event, surface);
  const resizeTarget = eventElement(event)?.closest?.("[data-video-analysis-drawing-resize]");
  const layerTarget = eventElement(event)?.closest?.("[data-video-analysis-drawing-layer]");
  const [resizeLayerId, resizeHandle] = String(resizeTarget?.dataset?.videoAnalysisDrawingResize || "").split(":");
  const layerId = resizeLayerId || layerTarget?.dataset?.videoAnalysisDrawingLayer || "";
  const layer = drawingLayerById(item, layerId);
  event.preventDefault?.();
  surface?.setPointerCapture?.(event.pointerId);
  if (layer) {
    run.store.update((current) => ({
      ...current,
      presentation: {
        ...(current.presentation || {}),
        selectedDrawingLayerId: layer.id,
        drawingInteraction: {
          type: resizeTarget ? "resize" : "move",
          itemId: item.id,
          layerId: layer.id,
          handle: resizeHandle || "end",
          start: point,
          last: point,
          originalGeometry: layer.geometry || {},
          beforePresentation: presentation,
        },
      },
    }));
    return true;
  }
  const tool = state.presentation?.drawingTool || "arrow";
  const geometry = defaultDrawingGeometry(tool, point);
  const previewLayer = createDrawingLayer(state, item, context, geometry);
  run.store.update((current) => ({
    ...current,
    presentation: {
      ...(current.presentation || {}),
      selectedDrawingLayerId: "",
      drawingInteraction: {
        type: "create",
        itemId: item.id,
        start: point,
        last: point,
        tool,
        previewLayer,
        beforePresentation: presentation,
      },
    },
  }));
  return true;
}

function updateDrawingInteraction(event, context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  const interaction = state.presentation?.drawingInteraction;
  if (!interaction) return false;
  const surface = getRoot(context)?.querySelector("[data-video-analysis-drawing-surface]");
  const point = pointerPercent(event, surface);
  event.preventDefault?.();
  run.store.update((current) => {
    const liveInteraction = current.presentation?.drawingInteraction || interaction;
    const presentation = current.presentation?.current;
    const item = selectedPresentationItem(presentation, liveInteraction.itemId, "");
    if (!item) return current;
    if (liveInteraction.type === "create") {
      const geometry = geometryFromDrag(liveInteraction.tool, liveInteraction.start, point);
      return {
        ...current,
        presentation: {
          ...(current.presentation || {}),
          drawingInteraction: {
            ...liveInteraction,
            last: point,
            previewLayer: {
              ...(liveInteraction.previewLayer || {}),
              geometry,
            },
          },
        },
      };
    }
    const layer = drawingLayerById(item, liveInteraction.layerId);
    if (!layer) return current;
    const dx = point.x - liveInteraction.start.x;
    const dy = point.y - liveInteraction.start.y;
    const geometry = liveInteraction.type === "resize"
      ? resizeGeometry(layer.tool, liveInteraction.originalGeometry, liveInteraction.handle, point)
      : moveGeometry(liveInteraction.originalGeometry, dx, dy);
    return {
      ...current,
      presentation: {
        ...(current.presentation || {}),
        current: updateDrawingLayerInItem(presentation, item.id, layer.id, { geometry }),
        drawingInteraction: { ...liveInteraction, last: point },
      },
    };
  });
  return true;
}

function finishDrawingInteraction(event, context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  const interaction = state.presentation?.drawingInteraction;
  if (!interaction) return false;
  const surface = getRoot(context)?.querySelector("[data-video-analysis-drawing-surface]");
  const point = pointerPercent(event, surface);
  event.preventDefault?.();
  run.store.update((current) => {
    const liveInteraction = current.presentation?.drawingInteraction || interaction;
    const presentation = current.presentation?.current;
    const item = selectedPresentationItem(presentation, liveInteraction.itemId, "");
    if (!item) {
      return {
        ...current,
        presentation: { ...(current.presentation || {}), drawingInteraction: null },
      };
    }
    if (liveInteraction.type === "create") {
      const geometry = geometryFromDrag(liveInteraction.tool, liveInteraction.start, point);
      const layer = createDrawingLayer(current, item, context, geometry);
      return {
        ...current,
        presentation: {
          ...(current.presentation || {}),
          current: addDrawingLayerToItem(presentation, item.id, layer),
          selectedDrawingLayerId: layer.id,
          drawingInteraction: null,
          drawingDraft: { timestampSeconds: "", durationSeconds: "", text: "" },
          drawingUndoStack: [...(current.presentation?.drawingUndoStack || []), liveInteraction.beforePresentation].filter(Boolean).slice(-20),
          drawingRedoStack: [],
        },
      };
    }
    return {
      ...current,
      presentation: {
        ...(current.presentation || {}),
        drawingInteraction: null,
        drawingUndoStack: [...(current.presentation?.drawingUndoStack || []), liveInteraction.beforePresentation].filter(Boolean).slice(-20),
        drawingRedoStack: [],
      },
    };
  });
  return true;
}

function selectedClipFromPresentationSources(state = {}, clipId = "") {
  return (state.presentation?.sourceClips || []).find((clip) => clip.id === clipId)
    || (state.clips || []).find((clip) => clip.id === clipId)
    || { id: clipId };
}

function currentPlayheadMs(context = {}, state = {}) {
  const video = videoElement(context);
  const timelineMs = Math.max(0, Math.round(Number(state.timeline?.playheadMs ?? state.draft?.startMs ?? 0)));
  if (!video) return timelineMs;
  const videoMs = getVideoCurrentMs(video);
  const videoReady = Number(video.readyState || 0) > 0 || videoMs > 0;
  return videoReady ? videoMs : timelineMs;
}

function findTimelineCategoryClips(state = {}, laneMode = "", label = "") {
  const normalizedLaneMode = normalizeTimelineLaneMode(laneMode);
  const lanes = buildTimelineLanes(Array.isArray(state.clips) ? state.clips : [], normalizedLaneMode);
  return lanes.find((lane) => lane.label === label)?.clips || [];
}

function categoryPayloadFromButton(button = {}) {
  const value = String(
    button.dataset.videoAnalysisTimelineCategoryOpen
      || button.dataset.videoAnalysisTimelineCategoryPlay
      || button.dataset.videoAnalysisTimelineCategoryAddPresentation
      || ""
  );
  const [valueMode, ...labelParts] = value.split(":");
  return {
    laneMode: button.dataset.videoAnalysisTimelineCategoryMode || valueMode || "",
    label: button.dataset.videoAnalysisTimelineCategoryLabel || labelParts.join(":") || "",
  };
}

function addClipsToPresentation(presentation = {}, sectionId = "", clips = []) {
  return clips.reduce((current, clip) => addClipToPresentation(current, sectionId, clip), presentation || createDefaultPresentation());
}

function patchClipTimesInState(current = {}, clipId = "", startMs = 0, endMs = 100) {
  const patchList = (clips = []) => clips.map((clip) => (
    clip.id === clipId ? { ...clip, startMs, endMs, start_ms: startMs, end_ms: endMs } : clip
  ));
  return {
    ...current,
    clips: patchList(current.clips || []),
    allClips: Array.isArray(current.allClips) ? patchList(current.allClips) : current.allClips,
  };
}

function replaceClipInState(current = {}, nextClip = {}) {
  if (!nextClip?.id) return current;
  const patchList = (clips = []) => clips.map((clip) => (clip.id === nextClip.id ? nextClip : clip));
  return {
    ...current,
    clips: patchList(current.clips || []),
    allClips: Array.isArray(current.allClips) ? patchList(current.allClips) : current.allClips,
  };
}

async function commitClipTrim(payload = {}, context = {}) {
  const run = ensureRuntime(context);
  const clipId = payload.clipId || "";
  if (!clipId) return false;
  try {
    const result = await run.clips.trim({ id: clipId, startMs: payload.startMs, endMs: payload.endMs });
    const savedClip = normalizeClipInstance(result.clip || {});
    const startMs = savedClip.startMs ?? payload.startMs;
    const endMs = savedClip.endMs ?? payload.endMs;
    run.store.update((current) => ({
      ...patchClipTimesInState(current, clipId, startMs, endMs),
      selectedClipId: clipId,
      message: "Clip timing updated.",
      error: "",
    }));
    return true;
  } catch (error) {
    run.store.update((current) => ({
      ...patchClipTimesInState(current, clipId, payload.originalStartMs, payload.originalEndMs),
      error: error.message || "Could not update clip timing.",
    }));
    return false;
  }
}

function selectTimelineCategoryClip(context = {}, laneMode = "", label = "", direction = 0) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  const clips = findTimelineCategoryClips(state, laneMode, label);
  if (!clips.length) return false;
  const selectedIndex = Math.max(0, clips.findIndex((clip) => clip.id === state.selectedClipId || clip.id === state.timeline?.selectedCategory?.activeClipId));
  const nextIndex = Math.max(0, Math.min(clips.length - 1, selectedIndex + Number(direction || 0)));
  const clip = clips[nextIndex] || clips[0];
  const startMs = clip.startMs ?? clip.start_ms ?? 0;
  seekVideoToMs(videoElement(context), startMs);
  run.store.update((current) => ({
    ...current,
    selectedClipId: clip.id,
    timeline: {
      ...(current.timeline || {}),
      playheadMs: Math.max(0, Math.round(Number(startMs || 0))),
      selectedCategory: {
        laneMode: normalizeTimelineLaneMode(laneMode),
        label,
        viewOpen: true,
        activeClipId: clip.id,
      },
    },
  }));
  return true;
}

function presentationDropTarget(target) {
  const itemTarget = target?.closest?.("[data-video-analysis-presentation-drop-item]");
  if (itemTarget) {
    const [sectionId, beforeItemId] = String(itemTarget.dataset.videoAnalysisPresentationDropItem || "").split(":");
    return { sectionId, beforeItemId };
  }
  const emptyTarget = target?.closest?.("[data-video-analysis-presentation-drop-empty]");
  if (emptyTarget) return { sectionId: emptyTarget.dataset.videoAnalysisPresentationDropEmpty || "", beforeItemId: "" };
  const sectionTarget = target?.closest?.("[data-video-analysis-presentation-drop-section]");
  if (sectionTarget) return { sectionId: sectionTarget.dataset.videoAnalysisPresentationDropSection || "", beforeItemId: "" };
  return null;
}

export function handleDragStart(event, context = {}) {
  ensureRuntime(context);
  const target = eventElement(event);
  const item = target?.closest?.("[data-video-analysis-presentation-drag-item]");
  if (!item) return false;
  const itemId = item.dataset.videoAnalysisPresentationDragItem || "";
  if (!itemId) return false;
  event.dataTransfer?.setData("text/plain", itemId);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  return true;
}

export function handleDragOver(event, context = {}) {
  ensureRuntime(context);
  const target = eventElement(event);
  if (!presentationDropTarget(target)) return false;
  event.preventDefault?.();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  return true;
}

export function handleDrop(event, context = {}) {
  const run = ensureRuntime(context);
  const target = eventElement(event);
  const dropTarget = presentationDropTarget(target);
  if (!dropTarget?.sectionId) return false;
  const itemId = event.dataTransfer?.getData("text/plain") || "";
  if (!itemId || itemId === dropTarget.beforeItemId) return false;
  event.preventDefault?.();
  run.store.update((state) => {
    const targetSection = (state.presentation?.current?.sections || []).find((section) => section.id === dropTarget.sectionId);
    const beforeIndex = dropTarget.beforeItemId
      ? Math.max(0, (targetSection?.items || []).findIndex((item) => item.id === dropTarget.beforeItemId))
      : (targetSection?.items || []).length;
    return {
      ...state,
      presentation: {
        ...(state.presentation || {}),
        activeSectionId: dropTarget.sectionId,
        selectedItemId: itemId,
        current: movePresentationItemToSection(state.presentation?.current, itemId, dropTarget.sectionId, beforeIndex),
      },
    };
  });
  return true;
}

function codingSessionForTemplate(template = {}, currentSession = {}) {
  return {
    ...currentSession,
    mode: template.defaultMode || currentSession.mode || "instant",
    defaultClipDurationMs: Number(template.defaultClipDurationMs || currentSession.defaultClipDurationMs || 15000),
    preRollMs: Number(template.preRollMs || 0),
    postRollMs: Number(template.postRollMs || template.defaultClipDurationMs || currentSession.postRollMs || 15000),
  };
}

async function loadCodingTemplates(options = {}) {
  const run = runtime;
  if (!run) return;
  if (!shouldLoadMetadata(run.context, run.store.getState())) return;
  try {
    const payload = await run.templates.list(20);
    const template = Array.isArray(payload.templates) ? payload.templates[0] : null;
    if (!template?.buttons?.length) return;
    run.store.update((current) => ({
      ...current,
      template,
      codingSession: codingSessionForTemplate(template, current.codingSession || {}),
      message: options.silent ? current.message : "Tag panel loaded.",
      error: options.silent ? current.error : "",
    }));
  } catch {
    if (!options.silent) run.store.setState({ error: "Could not load tag panel." });
  }
}

async function saveCodingTemplate(context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  try {
    run.store.setState({ status: "saving-template", message: "Saving tag panel.", error: "" });
    const payload = await run.templates.save(state.template);
    const template = payload.template || state.template;
    run.store.update((current) => ({
      ...current,
      status: "ready",
      template,
      codingSession: {
        ...codingSessionForTemplate(template, current.codingSession || {}),
        panelMode: current.codingSession?.panelMode || "edit",
      },
      message: "Tag panel saved.",
      error: "",
    }));
    return true;
  } catch (error) {
    run.store.setState({ status: "error", message: "", error: error.message || "Could not save tag panel." });
    return false;
  }
}

async function initialize(context = {}) {
  const run = ensureRuntime(context);
  run.store.setState({ status: "loading", error: "", ...browserFileAccessCapabilities(context.win || window) });
  try {
    await libraryController().loadLibrary();
    await loadCodingTemplates({ silent: true });
    if (run.store.getState().view !== "library") await loadClips();
    await loadSavedSearches();
    await loadPresentations({ skipSources: true });
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
    dragover: handleDragOver,
    dragstart: handleDragStart,
    drop: handleDrop,
    input: handleInput,
    pointerdown: handlePointerDown,
    pointermove: handlePointerMove,
    pointerup: handlePointerUp,
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
  timelineScrubController = null;
}

async function handleFileSelection(file, context = {}, options = {}) {
  const run = ensureRuntime(context);
  const previous = run.store.getState().videoRef;
  try {
    const capabilities = browserFileAccessCapabilities(context.win || window);
    const reference = await createLocalVideoReference(file, context.win || window);
    revokeLocalVideoReference(previous, context.win || window);
    const playbackWarning = reference.playbackCompatibility?.warning || "";
    const sessionOnlyMessage = capabilities.fileSystemAccessSupported
      ? "Local file linked for this session. Browser permission was not saved."
      : "Local file linked for this session. Use Chrome or Edge to remember it on this device.";
    const initialStatusPatch = playbackWarning
      ? localVideoStatusPatch("browser-unplayable", "Browser cannot play this file")
      : localVideoStatusPatch(options.handle ? "restored" : "session-only", options.handle ? "Local file connected on this device" : sessionOnlyMessage);
    run.store.setState({
      view: "workspace",
      activeAnalysisRoomTab: "fs-player",
      videoRef: reference,
      playbackPreparation: { active: false, token: "" },
      status: playbackWarning ? "error" : "saving-source",
      message: playbackWarning ? "" : "Local video linked.",
      error: playbackWarning,
      nativePlaybackReady: false,
      bridgeFallbackRecommended: Boolean(playbackWarning),
      ...capabilities,
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
    const payload = await run.clips.save(toApiClipPayload(clip));
    const savedClip = normalizeClipInstance(payload?.clip || clip);
    const nextDurationMs = Math.max(1000, Number(state.template?.defaultClipDurationMs || state.codingSession?.defaultClipDurationMs || 15000));
    run.store.update((current) => ({
      ...current,
      draft: { ...current.draft, startMs: clip.endMs, endMs: clip.endMs + nextDurationMs, tags: "", note: "" },
      codingSession: {
        ...(current.codingSession || {}),
        manualInMs: null,
        openTag: null,
        lastClipId: savedClip.id || current.codingSession?.lastClipId || "",
        lastTaggedAtMs: clip.startMs,
        lastTaggedRangeMs: { startMs: clip.startMs, endMs: clip.endMs },
      },
      selectedClipId: savedClip.id || current.selectedClipId,
      timeline: {
        ...(current.timeline || {}),
        playheadMs: clip.startMs,
      },
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

function findClipForLabelAction(state = {}, playheadMs = 0) {
  const clips = Array.isArray(state.clips) ? state.clips : [];
  const selectedId = state.selectedClipId || state.codingSession?.lastClipId || state.timeline?.selectedCategory?.activeClipId || "";
  const selectedClip = clips.find((clip) => clip.id && clip.id === selectedId);
  if (selectedClip) return selectedClip;
  const currentMs = Math.max(0, Math.round(Number(playheadMs || 0)));
  return clips.find((clip) => {
    const startMs = Math.max(0, Math.round(Number(clip.startMs ?? clip.start_ms ?? 0)));
    const endMs = Math.max(startMs + 1, Math.round(Number(clip.endMs ?? clip.end_ms ?? startMs + 1)));
    return currentMs >= startMs && currentMs <= endMs;
  }) || null;
}

async function saveButtonLabelOnClip(button = {}, action = {}, context = {}, state = {}, playheadMs = 0) {
  const run = ensureRuntime(context);
  const targetClip = findClipForLabelAction(state, playheadMs);
  if (!targetClip?.id) return false;
  const nextClip = normalizeClipInstance(applyCodingButtonToClip(targetClip, button, state.players || []));
  run.store.update(() => ({
    ...state,
    draft: action.nextDraft,
    codingSession: {
      ...(action.nextSession || state.codingSession || {}),
      lastClipId: nextClip.id,
    },
    selectedClipId: nextClip.id,
    status: "saving-clip",
    message: `Applying ${button.label || "label"} to selected clip.`,
    error: "",
  }));
  try {
    const payload = await run.clips.save(toApiClipPayload(nextClip));
    const savedClip = normalizeClipInstance(payload?.clip || nextClip);
    run.store.update((current) => ({
      ...replaceClipInState(current, savedClip),
      status: "ready",
      selectedClipId: savedClip.id,
      codingSession: {
        ...(current.codingSession || {}),
        lastClipId: savedClip.id,
      },
      message: `${button.label || "Label"} applied to selected clip.`,
      error: "",
    }));
    await loadClips();
    return true;
  } catch (error) {
    run.store.update((current) => ({
      ...replaceClipInState(current, targetClip),
      status: "error",
      error: error.message || "Could not apply label to selected clip.",
    }));
    return false;
  }
}

async function applyCodeButton(buttonId = "", context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  const button = findTemplateButton(state.template, buttonId);
  if (!button) return false;
  const currentMs = currentPlayheadMs(context, state);
  const action = buildCodingButtonAction(state, button, currentMs);
  if (!action.shouldCreateClip && button.appliesLabel) {
    const savedOnClip = await saveButtonLabelOnClip(button, action, context, state, currentMs);
    if (savedOnClip) return true;
  }
  const nextState = {
    ...state,
    draft: action.nextDraft,
    codingSession: action.nextSession,
    timeline: {
      ...(state.timeline || {}),
      playheadMs: currentMs,
    },
    message: action.message,
    error: "",
  };
  if (action.shouldCreateClip && state.match?.id && state.video?.id) {
    run.store.update(() => nextState);
    await saveDraftClip(context, nextState);
    return true;
  }
  if (action.shouldCreateClip && (!state.match?.id || !state.video?.id)) {
    run.store.update(() => ({
      ...nextState,
      message: "",
      error: "Link a local match or training video before creating timeline tags.",
    }));
    return false;
  }
  run.store.update(() => nextState);
  return true;
}

export function handlePointerDown(event, context = {}) {
  const target = eventElement(event);
  const drawingSurface = target?.closest?.("[data-video-analysis-drawing-surface]");
  if (drawingSurface) {
    const run = ensureRuntime(context);
    const state = run.store.getState();
    if (state.presentation?.mode !== "draw") return false;
    const presentation = state.presentation?.current;
    const item = selectedPresentationItem(presentation, state.presentation?.selectedItemId, state.presentation?.selectedClipId);
    if (!item) return false;
    return startDrawingInteraction(event, context, drawingSurface);
  }
  return timelineController(context).handlePointerDown(event);
}

export function handlePointerMove(event, context = {}) {
  return updateDrawingInteraction(event, context);
}

export function handlePointerUp(event, context = {}) {
  return finishDrawingInteraction(event, context);
}

export function handleClick(event, context = {}) {
  const run = ensureRuntime(context);
  const root = getRoot(context);
  const target = eventElement(event);
  if (!target?.closest) return false;
  const roomTab = target.closest("[data-video-analysis-room-tab]");
  if (roomTab) {
    const tabId = roomTab.dataset.videoAnalysisRoomTab;
    if (tabId === "overview") {
      libraryController().openLibraryView(context);
      return true;
    }
    if (tabId === "fs-player" || tabId === "presentation") {
      run.store.update((state) => ({
        ...state,
        view: "workspace",
        activeAnalysisRoomTab: tabId,
        message: "",
        error: "",
      }));
      if (tabId === "presentation") loadPresentationSources(null, { silent: true });
      return true;
    }
    return true;
  }
  if (target.closest("[data-video-analysis-open-library]")) {
    libraryController().openLibraryView(context);
    return true;
  }
  const presentationSession = target.closest("[data-video-analysis-presentation-session]");
  if (presentationSession) {
    libraryController().openLibraryItem(presentationSession.dataset.videoAnalysisPresentationSession, context, {
      activeTab: "presentation",
    });
    return true;
  }
  const presentationModeButton = target.closest("[data-video-analysis-presentation-mode]");
  if (presentationModeButton) {
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        mode: presentationModeButton.dataset.videoAnalysisPresentationMode || "builder",
      },
    }));
    return true;
  }
  const drawToolButton = target.closest("[data-video-analysis-draw-tool]");
  if (drawToolButton) {
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        drawingTool: drawToolButton.dataset.videoAnalysisDrawTool || "arrow",
      },
    }));
    return true;
  }
  if (target.closest("[data-video-analysis-presentation-new]")) {
    const current = createDefaultPresentation();
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        activePresentationId: "",
        activeSectionId: current.sections[0]?.id || "",
        selectedItemId: "",
        selectedClipId: "",
        current,
        mode: "builder",
        error: "",
      },
    }));
    return true;
  }
  if (target.closest("[data-video-analysis-presentation-save]")) {
    saveCurrentPresentation(context);
    return true;
  }
  if (target.closest("[data-video-analysis-presentation-refresh-sources]")) {
    loadPresentationSources();
    return true;
  }
  if (target.closest("[data-video-analysis-smart-save]")) {
    saveCurrentSmartCollection(context);
    return true;
  }
  const smartApply = target.closest("[data-video-analysis-smart-apply]");
  if (smartApply) {
    const state = run.store.getState();
    const collection = (state.presentation?.smartCollections || []).find((item) => (
      item.id === smartApply.dataset.videoAnalysisSmartApply || item.title === smartApply.dataset.videoAnalysisSmartApply
    ));
    const filters = collection?.searchJson || collection?.search_json || {};
    loadPresentationSources({ ...(state.presentation?.sourceFilters || {}), ...filters });
    return true;
  }
  if (target.closest("[data-video-analysis-library-refresh]")) {
    libraryController().loadLibrary();
    return true;
  }
  const calendarMonthButton = target.closest("[data-video-analysis-calendar-month]");
  if (calendarMonthButton) {
    run.store.update((state) => ({
      ...state,
      library: {
        ...(state.library || {}),
        filters: {
          ...(state.library?.filters || {}),
          calendarMonth: calendarMonthButton.dataset.videoAnalysisCalendarMonth || "",
        },
      },
    }));
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
  const panelModeButton = target.closest("[data-video-analysis-panel-mode]");
  if (panelModeButton) {
    run.store.update((state) => ({
      ...state,
      codingSession: { ...(state.codingSession || {}), panelMode: panelModeButton.dataset.videoAnalysisPanelMode || "use" },
    }));
    return true;
  }
  if (target.closest("[data-video-analysis-save-template]")) {
    saveCodingTemplate(context);
    return true;
  }
  if (target.closest("[data-video-analysis-add-button-group]")) {
    run.store.update((state) => {
      const groupName = state.codingSession?.templateBuilder?.newGroupName || "Custom";
      return {
        ...state,
        template: addCodingButtonGroupToTemplate(state.template || {}, groupName),
        codingSession: {
          ...(state.codingSession || {}),
          templateBuilder: {
            ...(state.codingSession?.templateBuilder || {}),
            newGroupName: "",
            newButtonGroup: groupName,
          },
        },
        message: "Tag group added.",
        error: "",
      };
    });
    return true;
  }
  const groupAddButton = target.closest("[data-video-analysis-add-code-button-group]");
  if (groupAddButton) {
    const groupName = groupAddButton.dataset.videoAnalysisAddCodeButtonGroup || "Custom";
    run.store.update((state) => ({
      ...state,
      template: addCodingButtonToTemplate(state.template || {}, { group: groupName }),
      codingSession: {
        ...(state.codingSession || {}),
        templateBuilder: {
          ...(state.codingSession?.templateBuilder || {}),
          newButtonGroup: groupName,
        },
      },
      message: "Tag button added.",
      error: "",
    }));
    return true;
  }
  if (target.closest("[data-video-analysis-add-code-button]")) {
    run.store.update((state) => {
      const groups = (state.template?.buttons || []).map((button) => button.group || "Custom");
      const groupName = state.codingSession?.templateBuilder?.newButtonGroup || groups[0] || "Custom";
      return {
        ...state,
        template: addCodingButtonToTemplate(state.template || {}, { group: groupName }),
        codingSession: {
          ...(state.codingSession || {}),
          templateBuilder: {
            ...(state.codingSession?.templateBuilder || {}),
            newButtonGroup: groupName,
          },
        },
        message: "Tag button added.",
        error: "",
      };
    });
    return true;
  }
  const duplicateCodeButton = target.closest("[data-video-analysis-duplicate-code-button]");
  if (duplicateCodeButton) {
    run.store.update((state) => ({
      ...state,
      template: duplicateCodingButtonInTemplate(state.template || {}, duplicateCodeButton.dataset.videoAnalysisDuplicateCodeButton),
      message: "Tag button duplicated.",
      error: "",
    }));
    return true;
  }
  const removeCodeButton = target.closest("[data-video-analysis-remove-code-button]");
  if (removeCodeButton) {
    run.store.update((state) => ({
      ...state,
      template: removeCodingButtonFromTemplate(state.template || {}, removeCodeButton.dataset.videoAnalysisRemoveCodeButton),
      message: "Tag button archived from this panel.",
      error: "",
    }));
    return true;
  }
  const codeButton = target.closest("[data-video-analysis-code-button]");
  if (codeButton) {
    applyCodeButton(codeButton.dataset.videoAnalysisCodeButton, context);
    return true;
  }
  const descriptorButton = target.closest("[data-video-analysis-descriptor-button]");
  if (descriptorButton) {
    const [key, ...valueParts] = String(descriptorButton.dataset.videoAnalysisDescriptorButton || "").split(":");
    run.store.update((state) => ({
      ...state,
      draft: { ...state.draft, [key]: valueParts.join(":") },
      message: valueParts.join(":") ? "Descriptor applied." : "Descriptor cleared.",
      error: "",
    }));
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
    const state = run.store.getState();
    const clip = selectedClipFromPresentationSources(state, seekButton.dataset.videoAnalysisSeek);
    const startMs = clip?.startMs ?? clip?.start_ms ?? 0;
    if (clip?.id) seekVideoToMs(videoElement(context), startMs);
    run.store.update((current) => ({
      ...current,
      selectedClipId: clip?.id || "",
      timeline: {
        ...(current.timeline || {}),
        playheadMs: Math.max(0, Math.round(Number(startMs || 0))),
      },
      presentation: {
        ...(current.presentation || {}),
        selectedClipId: clip?.id || current.presentation?.selectedClipId || "",
      },
    }));
    return true;
  }
  const categorySelectButton = target.closest("[data-video-analysis-timeline-category]");
  if (categorySelectButton) {
    const { laneMode, label } = categoryPayloadFromButton(categorySelectButton);
    const clips = findTimelineCategoryClips(run.store.getState(), laneMode, label);
    run.store.update((current) => ({
      ...current,
      selectedClipId: clips[0]?.id || current.selectedClipId || "",
      timeline: {
        ...(current.timeline || {}),
        selectedCategory: {
          laneMode: normalizeTimelineLaneMode(laneMode),
          label,
          viewOpen: false,
          activeClipId: clips[0]?.id || "",
        },
      },
    }));
    return true;
  }
  const categoryStepButton = target.closest("[data-video-analysis-timeline-category-step]");
  if (categoryStepButton) {
    const { laneMode, label } = categoryPayloadFromButton(categoryStepButton);
    return selectTimelineCategoryClip(context, laneMode, label, Number(categoryStepButton.dataset.videoAnalysisTimelineCategoryStep || 0));
  }
  const categoryPlayButton = target.closest("[data-video-analysis-timeline-category-play]");
  if (categoryPlayButton) {
    const { laneMode, label } = categoryPayloadFromButton(categoryPlayButton);
    return selectTimelineCategoryClip(context, laneMode, label, 0);
  }
  const categoryOpenButton = target.closest("[data-video-analysis-timeline-category-open]");
  if (categoryOpenButton) {
    const { laneMode, label } = categoryPayloadFromButton(categoryOpenButton);
    run.store.update((state) => {
      const currentCategory = state.timeline?.selectedCategory || {};
      const normalizedLaneMode = normalizeTimelineLaneMode(laneMode);
      const isSame = currentCategory.laneMode === normalizedLaneMode && currentCategory.label === label;
      return {
        ...state,
        timeline: {
          ...(state.timeline || {}),
          selectedCategory: {
            laneMode: normalizedLaneMode,
            label,
            viewOpen: isSame ? !currentCategory.viewOpen : true,
            activeClipId: currentCategory.activeClipId || state.selectedClipId || "",
          },
        },
      };
    });
    return true;
  }
  const categoryAddSelectedButton = target.closest("[data-video-analysis-timeline-category-add-selected]");
  if (categoryAddSelectedButton) {
    const { laneMode, label } = categoryPayloadFromButton(categoryAddSelectedButton);
    run.store.update((state) => {
      const clips = findTimelineCategoryClips(state, laneMode, label);
      const activeClipId = state.timeline?.selectedCategory?.activeClipId || state.selectedClipId || clips[0]?.id || "";
      const clip = clips.find((item) => item.id === activeClipId) || clips[0];
      const sectionId = state.presentation?.activeSectionId || state.presentation?.current?.sections?.[0]?.id || "";
      const current = clip ? addClipToPresentation(state.presentation?.current || createDefaultPresentation(), sectionId, clip) : state.presentation?.current;
      const item = presentationQueue(current).find((entry) => entry.clipId === clip?.id);
      return {
        ...state,
        message: clip ? "Selected clip added to Presentation." : "No selected clip in this category.",
        presentation: {
          ...(state.presentation || {}),
          current,
          activeSectionId: sectionId,
          selectedItemId: item?.id || state.presentation?.selectedItemId || "",
          selectedClipId: clip?.id || state.presentation?.selectedClipId || "",
        },
      };
    });
    return true;
  }
  const categoryAddButton = target.closest("[data-video-analysis-timeline-category-add-presentation]");
  if (categoryAddButton) {
    const { laneMode, label } = categoryPayloadFromButton(categoryAddButton);
    run.store.update((state) => {
      const clips = findTimelineCategoryClips(state, laneMode, label);
      const sectionId = state.presentation?.activeSectionId || state.presentation?.current?.sections?.[0]?.id || "";
      const current = addClipsToPresentation(state.presentation?.current || createDefaultPresentation(), sectionId, clips);
      const firstItem = presentationQueue(current).find((item) => item.clipId === clips[0]?.id);
      return {
        ...state,
        message: clips.length ? `${clips.length} clips added to Presentation.` : "No clips in this category.",
        presentation: {
          ...(state.presentation || {}),
          current,
          activeSectionId: sectionId,
          selectedItemId: firstItem?.id || state.presentation?.selectedItemId || "",
          selectedClipId: clips[0]?.id || state.presentation?.selectedClipId || "",
        },
      };
    });
    return true;
  }
  const presentationAddButton = target.closest("[data-video-analysis-presentation-add]");
  if (presentationAddButton) {
    const [sectionId, clipId] = String(presentationAddButton.dataset.videoAnalysisPresentationAdd || "").split(":");
    run.store.update((state) => {
      const clip = selectedClipFromPresentationSources(state, clipId);
      const current = addClipToPresentation(state.presentation?.current, sectionId || state.presentation?.activeSectionId, clip);
      const item = presentationQueue(current).find((entry) => entry.clipId === clipId);
      return {
        ...state,
        message: "Clip added to presentation.",
        presentation: {
          ...(state.presentation || {}),
          current,
          activeSectionId: sectionId || state.presentation?.activeSectionId,
          selectedItemId: item?.id || state.presentation?.selectedItemId || "",
          selectedClipId: clipId,
        },
      };
    });
    return true;
  }
  const presentationSectionButton = target.closest("[data-video-analysis-presentation-section]");
  if (presentationSectionButton) {
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        activeSectionId: presentationSectionButton.dataset.videoAnalysisPresentationSection || "",
      },
    }));
    return true;
  }
  if (target.closest("[data-video-analysis-presentation-add-section]")) {
    run.store.update((state) => {
      const current = addPresentationSection(state.presentation?.current);
      const lastSection = current.sections.at(-1);
      return {
        ...state,
        presentation: {
          ...(state.presentation || {}),
          current,
          activeSectionId: lastSection?.id || state.presentation?.activeSectionId || "",
        },
      };
    });
    return true;
  }
  const selectPresentationItemButton = target.closest("[data-video-analysis-presentation-select-item]");
  if (selectPresentationItemButton) {
    const itemId = selectPresentationItemButton.dataset.videoAnalysisPresentationSelectItem;
    const item = presentationQueue(run.store.getState().presentation?.current).find((entry) => entry.id === itemId);
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        selectedItemId: itemId,
        selectedClipId: item?.clipId || state.presentation?.selectedClipId || "",
        activeSectionId: item?.sectionId || state.presentation?.activeSectionId || "",
      },
    }));
    return true;
  }
  const movePresentationItemButton = target.closest("[data-video-analysis-presentation-move-item]");
  if (movePresentationItemButton) {
    const [itemId, direction] = String(movePresentationItemButton.dataset.videoAnalysisPresentationMoveItem || "").split(":");
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        current: movePresentationItem(state.presentation?.current, itemId, Number(direction || 0)),
      },
    }));
    return true;
  }
  const removePresentationItemButton = target.closest("[data-video-analysis-presentation-remove-item]");
  if (removePresentationItemButton) {
    const itemId = removePresentationItemButton.dataset.videoAnalysisPresentationRemoveItem;
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        current: removePresentationItem(state.presentation?.current, itemId),
        selectedItemId: state.presentation?.selectedItemId === itemId ? "" : state.presentation?.selectedItemId,
      },
    }));
    return true;
  }
  const reviewButton = target.closest("[data-video-analysis-review]");
  if (reviewButton) {
    const clipId = reviewButton.dataset.videoAnalysisReview;
    run.store.update((state) => {
      if (state.activeAnalysisRoomTab === "presentation") {
        const clip = selectedClipFromPresentationSources(state, clipId);
        const sectionId = state.presentation?.activeSectionId || state.presentation?.current?.sections?.[0]?.id || "";
        const current = addClipToPresentation(state.presentation?.current, sectionId, clip);
        const item = presentationQueue(current).find((entry) => entry.clipId === clipId);
        return {
          ...state,
          selectedClipId: clipId,
          message: "Clip added to presentation.",
          presentation: {
            ...(state.presentation || {}),
            current,
            selectedItemId: item?.id || state.presentation?.selectedItemId || "",
            selectedClipId: clipId,
          },
        };
      }
      return {
        ...state,
        selectedClipId: clipId,
        reviewSections: addClipToReviewSection(state.reviewSections, state.activeReviewSectionId, clipId),
        message: "Clip added to presentation.",
      };
    });
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
  if (target.closest("[data-video-analysis-drawing-add]")) {
    return addDrawingLayerAtPoint(context);
  }
  const selectDrawingButton = target.closest("[data-video-analysis-drawing-select]");
  if (selectDrawingButton) {
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        selectedDrawingLayerId: selectDrawingButton.dataset.videoAnalysisDrawingSelect || "",
      },
    }));
    return true;
  }
  const removeDrawingButton = target.closest("[data-video-analysis-drawing-remove]");
  if (removeDrawingButton) {
    run.store.update((state) => {
      const presentation = state.presentation?.current;
      const item = selectedPresentationItem(presentation, state.presentation?.selectedItemId, state.presentation?.selectedClipId);
      if (!item) return state;
      return {
        ...state,
        presentation: {
          ...(state.presentation || {}),
          current: removeDrawingLayerFromItem(presentation, item.id, removeDrawingButton.dataset.videoAnalysisDrawingRemove),
          selectedDrawingLayerId: state.presentation?.selectedDrawingLayerId === removeDrawingButton.dataset.videoAnalysisDrawingRemove ? "" : state.presentation?.selectedDrawingLayerId,
          drawingUndoStack: [...(state.presentation?.drawingUndoStack || []), presentation].slice(-20),
          drawingRedoStack: [],
        },
      };
    });
    return true;
  }
  if (target.closest("[data-video-analysis-drawing-save]")) {
    saveSelectedDrawingLayers(context);
    return true;
  }
  if (target.closest("[data-video-analysis-drawing-undo]")) {
    run.store.update((state) => {
      const stack = [...(state.presentation?.drawingUndoStack || [])];
      const previous = stack.pop();
      if (!previous) return state;
      return {
        ...state,
        presentation: {
          ...(state.presentation || {}),
          current: previous,
          drawingUndoStack: stack,
          drawingRedoStack: [state.presentation?.current, ...(state.presentation?.drawingRedoStack || [])].filter(Boolean).slice(0, 20),
        },
      };
    });
    return true;
  }
  if (target.closest("[data-video-analysis-drawing-redo]")) {
    run.store.update((state) => {
      const stack = [...(state.presentation?.drawingRedoStack || [])];
      const next = stack.shift();
      if (!next) return state;
      return {
        ...state,
        presentation: {
          ...(state.presentation || {}),
          current: next,
          drawingUndoStack: [...(state.presentation?.drawingUndoStack || []), state.presentation?.current].filter(Boolean).slice(-20),
          drawingRedoStack: stack,
        },
      };
    });
    return true;
  }
  if (target.closest("[data-video-analysis-presenter-next]") || target.closest("[data-video-analysis-presenter-prev]")) {
    const direction = target.closest("[data-video-analysis-presenter-next]") ? 1 : -1;
    run.store.update((state) => {
      const queue = presentationQueue(state.presentation?.current);
      const index = Math.max(0, queue.findIndex((item) => item.id === state.presentation?.selectedItemId));
      const next = queue[Math.max(0, Math.min(queue.length - 1, index + direction))];
      return {
        ...state,
        presentation: {
          ...(state.presentation || {}),
          selectedItemId: next?.id || state.presentation?.selectedItemId || "",
          selectedClipId: next?.clipId || state.presentation?.selectedClipId || "",
          activeSectionId: next?.sectionId || state.presentation?.activeSectionId || "",
        },
      };
    });
    return true;
  }
  if (target.closest("[data-video-analysis-presenter-fullscreen]")) {
    root?.querySelector(".video-analysis-presenter-mode")?.requestFullscreen?.().catch(() => {});
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
  const timelineLaneButton = target.closest("[data-video-analysis-timeline-lane]");
  if (timelineLaneButton) {
    run.store.update((state) => ({
      ...state,
      timeline: {
        ...(state.timeline || {}),
        laneMode: timelineLaneButton.dataset.videoAnalysisTimelineLane,
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
      run.store.setState({ message: "Presentation saved." });
    }).catch((error) => run.store.setState({ error: error.message || "Could not save presentation." }));
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
  const templateField = target.closest("[data-video-analysis-template-field]");
  if (templateField) {
    const key = templateField.dataset.videoAnalysisTemplateField;
    run.store.update((state) => ({
      ...state,
      template: { ...(state.template || {}), [key]: templateField.value },
    }));
    return true;
  }
  const templateBuilderField = target.closest("[data-video-analysis-template-builder-field]");
  if (templateBuilderField) {
    const key = templateBuilderField.dataset.videoAnalysisTemplateBuilderField;
    run.store.update((state) => ({
      ...state,
      codingSession: {
        ...(state.codingSession || {}),
        templateBuilder: {
          ...(state.codingSession?.templateBuilder || {}),
          [key]: templateBuilderField.value,
        },
      },
    }));
    return true;
  }
  const buttonField = target.closest("[data-video-analysis-button-field]");
  if (buttonField) {
    const [buttonId, fieldName] = String(buttonField.dataset.videoAnalysisButtonField || "").split(":");
    run.store.update((state) => ({
      ...state,
      template: updateCodingButtonField(state.template || {}, buttonId, fieldName, buttonField.value),
    }));
    return true;
  }
  const buttonMsField = target.closest("[data-video-analysis-button-ms-field]");
  if (buttonMsField) {
    const [buttonId, fieldName, mode] = String(buttonMsField.dataset.videoAnalysisButtonMsField || "").split(":");
    run.store.update((state) => ({
      ...state,
      template: updateCodingButtonMsField(state.template || {}, buttonId, fieldName, buttonMsField.value, mode),
    }));
    return true;
  }
  const presentationTitle = target.closest("[data-video-analysis-presentation-title]");
  if (presentationTitle) {
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        current: { ...(state.presentation?.current || createDefaultPresentation()), title: presentationTitle.value },
      },
    }));
    return true;
  }
  const presentationNotes = target.closest("[data-video-analysis-presentation-notes]");
  if (presentationNotes) {
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        current: { ...(state.presentation?.current || createDefaultPresentation()), notes: presentationNotes.value },
      },
    }));
    return true;
  }
  const presentationFilter = target.closest("[data-video-analysis-presentation-filter]");
  if (presentationFilter) {
    const key = presentationFilter.dataset.videoAnalysisPresentationFilter;
    const filters = { ...(run.store.getState().presentation?.sourceFilters || {}), [key]: presentationFilter.value };
    loadPresentationSources(filters, { silent: true });
    return true;
  }
  const presentationSectionTitle = target.closest("[data-video-analysis-presentation-section-title]");
  if (presentationSectionTitle) {
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        current: updatePresentationSection(
          state.presentation?.current,
          presentationSectionTitle.dataset.videoAnalysisPresentationSectionTitle,
          { title: presentationSectionTitle.value }
        ),
      },
    }));
    return true;
  }
  const presentationSectionNote = target.closest("[data-video-analysis-presentation-section-note]");
  if (presentationSectionNote) {
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        current: updatePresentationSection(
          state.presentation?.current,
          presentationSectionNote.dataset.videoAnalysisPresentationSectionNote,
          { coachNote: presentationSectionNote.value }
        ),
      },
    }));
    return true;
  }
  const presentationItemTitle = target.closest("[data-video-analysis-presentation-item-title]");
  if (presentationItemTitle) {
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        current: updatePresentationItem(
          state.presentation?.current,
          presentationItemTitle.dataset.videoAnalysisPresentationItemTitle,
          { customTitle: presentationItemTitle.value }
        ),
      },
    }));
    return true;
  }
  const presentationItemNote = target.closest("[data-video-analysis-presentation-item-note]");
  if (presentationItemNote) {
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        current: updatePresentationItem(
          state.presentation?.current,
          presentationItemNote.dataset.videoAnalysisPresentationItemNote,
          { coachNote: presentationItemNote.value }
        ),
      },
    }));
    return true;
  }
  const drawingField = target.closest("[data-video-analysis-drawing-field]");
  if (drawingField) {
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        drawingDraft: {
          ...(state.presentation?.drawingDraft || {}),
          [drawingField.dataset.videoAnalysisDrawingField]: drawingField.value,
        },
      },
    }));
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
  const presentationLoad = target.closest("[data-video-analysis-presentation-load]");
  if (presentationLoad) {
    if (presentationLoad.value) loadPresentation(presentationLoad.value);
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
  const state = run.store.getState();
  const category = state.timeline?.selectedCategory || {};
  if (
    state.activeAnalysisRoomTab === "fs-player"
    && category.viewOpen
    && category.laneMode
    && category.label
    && !shouldIgnoreShortcutTarget(event.target)
    && !event.metaKey
    && !event.ctrlKey
    && !event.altKey
    && !event.shiftKey
  ) {
    if (["ArrowDown", "ArrowRight"].includes(event.key)) {
      event.preventDefault?.();
      return selectTimelineCategoryClip(context, category.laneMode, category.label, 1);
    }
    if (["ArrowUp", "ArrowLeft"].includes(event.key)) {
      event.preventDefault?.();
      return selectTimelineCategoryClip(context, category.laneMode, category.label, -1);
    }
    if (event.key === "Escape") {
      event.preventDefault?.();
      run.store.update((current) => ({
        ...current,
        timeline: {
          ...(current.timeline || {}),
          selectedCategory: { ...(current.timeline?.selectedCategory || {}), viewOpen: false },
        },
      }));
      return true;
    }
  }
  if (state.presentation?.mode === "presenter") {
    if (["ArrowRight", " "].includes(event.key)) {
      event.preventDefault?.();
      run.store.update((current) => {
        const queue = presentationQueue(current.presentation?.current);
        const index = Math.max(0, queue.findIndex((item) => item.id === current.presentation?.selectedItemId));
        const next = queue[Math.max(0, Math.min(queue.length - 1, index + 1))];
        return {
          ...current,
          presentation: {
            ...(current.presentation || {}),
            selectedItemId: next?.id || current.presentation?.selectedItemId || "",
            selectedClipId: next?.clipId || current.presentation?.selectedClipId || "",
            activeSectionId: next?.sectionId || current.presentation?.activeSectionId || "",
          },
        };
      });
      return true;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault?.();
      run.store.update((current) => {
        const queue = presentationQueue(current.presentation?.current);
        const index = Math.max(0, queue.findIndex((item) => item.id === current.presentation?.selectedItemId));
        const next = queue[Math.max(0, Math.min(queue.length - 1, index - 1))];
        return {
          ...current,
          presentation: {
            ...(current.presentation || {}),
            selectedItemId: next?.id || current.presentation?.selectedItemId || "",
            selectedClipId: next?.clipId || current.presentation?.selectedClipId || "",
            activeSectionId: next?.sectionId || current.presentation?.activeSectionId || "",
          },
        };
      });
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault?.();
      run.store.update((current) => ({
        ...current,
        presentation: { ...(current.presentation || {}), mode: "builder" },
      }));
      return true;
    }
    if (String(event.key || "").toLowerCase() === "f") {
      event.preventDefault?.();
      root?.querySelector(".video-analysis-presenter-mode")?.requestFullscreen?.().catch(() => {});
      return true;
    }
  }
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
