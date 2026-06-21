import { renderClipFilters } from "./components/ClipFilters.js";
import { renderClipIntelligence } from "./components/ClipIntelligence.js";
import { renderClipLibrary } from "./components/ClipLibrary.js";
import { renderClipList } from "./components/ClipList.js";
import { renderCodingTemplateBuilder } from "./components/CodingTemplateBuilder.js";
import { renderPlayerClipDrawer } from "./components/PlayerClipDrawer.js";
import { renderPresentationModule } from "./components/PresentationModule.js";
import { renderTagFilterOverlay } from "./components/TagFilterOverlay.js";
import { renderTimeline } from "./components/Timeline.js";
import { renderVideoLibrary } from "./components/VideoLibrary.js";
import { renderVideoPlayer } from "./components/VideoPlayer.js";
import { miniGamePrinciplePickerGroups, miniGamePrinciplePickerIds } from "./constants/miniGamePrinciples.js";
import { escapeHtml } from "./components/renderHelpers.js";
import { createDrawingController } from "./controllers/drawingController.js";
import { createPresentationController } from "./controllers/presentationController.js";
import { createPresenterController } from "./controllers/presenterController.js";
import { createThumbnailController } from "./controllers/thumbnailController.js";
import { normalizeClipInstance } from "./domain/clipInstance.model.js";
import { createCodingTemplateRepository } from "./repositories/codingTemplateRepository.js";
import { createClipRepository } from "./repositories/clipRepository.js";
import { createPlaylistRepository } from "./repositories/playlistRepository.js";
import { createPresentationRepository } from "./repositories/presentationRepository.js";
import { createVideoRepository } from "./repositories/videoRepository.js";
import { applyCodingButtonToClip, buildClipPayload, toApiClipPayload } from "./services/clipInstanceService.js";
import { buildClipLibraryClipOrder, clipEndMs, clipMatchesLibraryGroup, clipStartMs } from "./services/clipLibraryService.js";
import { filterClipsForMatrix, savedSearchTitle } from "./services/clipIntelligenceService.js";
import {
  clipMiniGamePrincipleIds,
  miniGamePrincipleLabel,
  uniqueMiniGamePrincipleIds,
  withMiniGamePrinciples,
} from "./services/miniGamePrincipleService.js";
import {
  addCodingButtonGroupToTemplate,
  addCodingButtonToTemplate,
  buildCodingButtonAction,
  duplicateCodingButtonInTemplate,
  findTemplateButton,
  groupCodingTemplateButtons,
  moveCodingButtonByStep,
  moveCodingButtonInTemplate,
  moveCodingGroupByStep,
  moveCodingTemplateGroup,
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
  addPresentationSection,
  createDefaultPresentation,
  defaultShareTargets,
  movePresentationItem,
  movePresentationItemToSection,
  presentationQueue,
  removePresentationItem,
  selectedPresentationItem,
  updatePresentationItem,
  updatePresentationSection,
} from "./services/presentationService.js";
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
let drawingController = null;
let presentationController = null;
let presenterController = null;
let thumbnailController = null;
const pickerMiniGamePrincipleIdSet = new Set(miniGamePrinciplePickerIds);
const pickerMiniGamePrinciples = miniGamePrinciplePickerGroups.flatMap((group) => (
  group.principles.map((principle) => ({ ...principle, groupLabel: group.label }))
));
const CLIP_PAGE_LIMIT = 200;
const CLIP_WORKSPACE_LIMIT = 1000;
const PLAYBACK_RATE_OPTIONS = [0.5, 1, 1.5, 2, 3];
const KEYBOARD_CLIP_TRIM_MIN_MS = 1000;
const VIDEO_SHUTTLE_MIN_SPEED = 4;
const VIDEO_SHUTTLE_MAX_SPEED = 7;
const VIDEO_SHUTTLE_SPEED_DELTA_PX = 60;
const VIDEO_SHUTTLE_MIN_DELTA_PX = 6;
const VIDEO_SHUTTLE_CONTAIN_DELTA_PX = 2;
const VIDEO_SHUTTLE_CONTAIN_RATIO = 0.6;
const VIDEO_SHUTTLE_DOMINANCE_RATIO = 1.35;
const VIDEO_SHUTTLE_IDLE_MS = 520;
const VIDEO_SHUTTLE_MAX_FRAME_MS = 80;
const videoShuttleTimers = new WeakMap();
const videoShuttleSessions = new WeakMap();

function normalizePlaybackRate(value = 1) {
  const numeric = Number(value);
  return PLAYBACK_RATE_OPTIONS.includes(numeric) ? numeric : 1;
}

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
      updateState: (updater) => runtime?.store.update(updater),
    });
  }
  return timelineScrubController;
}

function drawingControls(context = {}) {
  if (!drawingController) {
    drawingController = createDrawingController({
      getRoot: () => getRoot(runtime?.context || context),
      getState: () => runtime?.store.getState() || {},
      getVideoElement: () => videoElement(runtime?.context || context),
      updateState: (updater) => runtime?.store.update(updater),
    });
  }
  return drawingController;
}

function presenterControls(context = {}) {
  if (!presenterController) {
    presenterController = createPresenterController({
      getRoot: () => getRoot(runtime?.context || context),
      getVideoElement: () => videoElement(runtime?.context || context),
      updateState: (updater) => runtime?.store.update(updater),
    });
  }
  return presenterController;
}

function thumbnails(context = {}) {
  if (!thumbnailController) {
    thumbnailController = createThumbnailController({
      getState: () => runtime?.store.getState() || {},
      getWindow: () => runtime?.context?.win || context.win || window,
      updateState: (updater) => runtime?.store.update(updater),
    });
  }
  return thumbnailController;
}

function presentationControls(context = {}) {
  if (!presentationController) {
    presentationController = createPresentationController({
      ensureRuntime,
      getRuntime: () => runtime,
      shouldLoadMetadata,
    });
  }
  ensureRuntime(runtime?.context || context);
  return presentationController;
}

const analysisRoomTabs = Object.freeze([
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "fs-player", label: "FS Player", icon: "play" },
  { id: "presentation", label: "Presentation", icon: "presentation" },
  { id: "match-report", label: "Clip Library", icon: "report" },
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
  return ["overview", "fs-player", "presentation", "match-report"].includes(tab.id);
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
  if (state.activeAnalysisRoomTab === "presentation") return "presentation";
  if (state.activeAnalysisRoomTab === "match-report") return "match-report";
  return "fs-player";
}

function renderFsPlayerWorkspace(displayState = {}) {
  const codeModeActive = displayState.fsPlayer?.mode === "code";
  return `
    <section class="video-analysis-fs-player-workstation${codeModeActive ? " is-code-mode" : ""}" data-video-analysis-fs-player-workstation>
      <section class="video-analysis-fs-player-main">
        <section class="video-analysis-fs-player-deck">
          ${renderVideoPlayer(displayState)}
        </section>
        <section class="video-analysis-fs-player-timeline">
          ${renderTimeline(displayState)}
        </section>
      </section>
      <section class="video-analysis-code-window-dock">
        ${renderCodingTemplateBuilder(displayState)}
      </section>
    </section>
    ${renderTagFilterOverlay(displayState)}
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

function renderClipLibraryWorkspace(state = {}) {
  return `
    <section class="video-analysis-clip-library-workspace">
      ${renderClipLibrary(state)}
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
    syncPlaybackControls(context, video, playing);
    if (!playing && video?.error) setVideoPlaybackError(video);
  });
}

function syncPlaybackControls(context = {}, video = videoElement(context), forcePlaying = null) {
  const root = getRoot(context);
  if (!root) return;
  const playing = forcePlaying === null
    ? Boolean(video && !video.paused && !video.ended)
    : Boolean(forcePlaying);
  root.querySelectorAll(".video-analysis-player [data-video-analysis-play]").forEach((button) => {
    const label = playing ? "Pause" : "Play";
    const labelNode = button.querySelector("[data-video-analysis-play-label]");
    const iconNode = button.querySelector("[data-video-analysis-play-icon]");
    button.dataset.videoAnalysisPlaybackState = playing ? "playing" : "paused";
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    if (labelNode) labelNode.textContent = label;
    if (iconNode) iconNode.textContent = playing ? "II" : "\u25b6";
  });
}

function applyPlaybackRate(context = {}, video = videoElement(context)) {
  const rate = normalizePlaybackRate(ensureRuntime(context).store.getState().fsPlayer?.playbackRate || 1);
  if (video) video.playbackRate = rate;
  return rate;
}

function setPlaybackRate(context = {}, value = 1) {
  const run = ensureRuntime(context);
  const rate = normalizePlaybackRate(value);
  const video = videoElement(context);
  if (video) video.playbackRate = rate;
  run.store.update((state) => ({
    ...state,
    fsPlayer: {
      ...(state.fsPlayer || {}),
      playbackRate: rate,
    },
  }));
  return true;
}

function fsPlayerWorkspaceElement(context = {}) {
  return getRoot(context)?.querySelector("[data-video-analysis-fs-player-workstation]") || null;
}

function fsPlayerVideoFrameElement(context = {}) {
  return getRoot(context)?.querySelector(".video-analysis-fs-player-deck .video-analysis-video-frame") || null;
}

function requestNativeFullscreen(element) {
  if (!element?.requestFullscreen) return Promise.resolve(false);
  return element.requestFullscreen().then(() => true).catch(() => false);
}

function exitNativeFullscreen(docRef) {
  if (!docRef?.fullscreenElement || !docRef?.exitFullscreen) return Promise.resolve(false);
  return docRef.exitFullscreen().then(() => true).catch(() => false);
}

function enterVideoFullscreen(context = {}) {
  const run = ensureRuntime(context);
  const element = fsPlayerVideoFrameElement(context);
  if (!element) {
    run.store.setState({ error: "Video area is not available yet.", message: "" });
    return false;
  }
  requestNativeFullscreen(element);
  return true;
}

function toggleFsPlayerCodeMode(context = {}) {
  const run = ensureRuntime(context);
  const doc = context.doc || document;
  const isActive = run.store.getState().fsPlayer?.mode === "code";
  run.store.update((state) => ({
    ...state,
    fsPlayer: { ...(state.fsPlayer || {}), mode: isActive ? "standard" : "code" },
    message: isActive ? "Code Mode closed." : "Code Mode ready.",
    error: "",
  }));
  if (isActive) {
    exitNativeFullscreen(doc);
  } else {
    requestNativeFullscreen(fsPlayerWorkspaceElement(context));
  }
  return true;
}

function nudgePlayer(context = {}, deltaMs = 0) {
  const video = videoElement(context);
  if (!video) return false;
  const nextMs = Math.max(0, getVideoCurrentMs(video) + Math.round(Number(deltaMs || 0)));
  seekVideoToMs(video, nextMs);
  ensureRuntime(context).store.update((state) => ({
    ...state,
    timeline: {
      ...(state.timeline || {}),
      playheadMs: nextMs,
    },
  }));
  return true;
}

function videoShuttleDurationMs(state = {}, video = null) {
  const stateDurationMs = Math.round(Number(state.videoRef?.durationMs || 0));
  const videoDurationMs = Math.round(Number(video?.duration || 0) * 1000);
  return Math.max(1, stateDurationMs, Number.isFinite(videoDurationMs) ? videoDurationMs : 0);
}

function videoShuttleCurrentMs(state = {}, video = null) {
  const videoMs = getVideoCurrentMs(video);
  if (videoMs > 0 || Number(video?.readyState || 0) > 0) return videoMs;
  return Math.max(0, Math.round(Number(state.timeline?.playheadMs || 0)));
}

function wheelDeltaPixelValue(value = 0, deltaMode = 0) {
  const numeric = Number(value || 0);
  if (!numeric) return 0;
  if (Number(deltaMode) === 1) return numeric * 16;
  if (Number(deltaMode) === 2) return numeric * 800;
  return numeric;
}

function videoShuttleHorizontalDelta(event = {}) {
  const deltaMode = Number(event.deltaMode || 0);
  const deltaX = wheelDeltaPixelValue(event.deltaX, deltaMode);
  const deltaY = wheelDeltaPixelValue(event.deltaY, deltaMode);
  if (event.shiftKey && Math.abs(deltaY) >= VIDEO_SHUTTLE_MIN_DELTA_PX) return deltaY;
  if (Math.abs(deltaX) < Math.max(VIDEO_SHUTTLE_MIN_DELTA_PX, Math.abs(deltaY) * VIDEO_SHUTTLE_DOMINANCE_RATIO)) return 0;
  return deltaX;
}

function videoShuttleHasHorizontalIntent(event = {}) {
  const deltaMode = Number(event.deltaMode || 0);
  const deltaX = wheelDeltaPixelValue(event.deltaX, deltaMode);
  const deltaY = wheelDeltaPixelValue(event.deltaY, deltaMode);
  if (event.shiftKey && Math.abs(deltaY) >= VIDEO_SHUTTLE_CONTAIN_DELTA_PX) return true;
  return Math.abs(deltaX) >= VIDEO_SHUTTLE_CONTAIN_DELTA_PX
    && Math.abs(deltaX) >= Math.abs(deltaY) * VIDEO_SHUTTLE_CONTAIN_RATIO;
}

function videoShuttleSpeedFromDelta(deltaPx = 0) {
  const intensity = Math.min(1, Math.abs(Number(deltaPx || 0)) / VIDEO_SHUTTLE_SPEED_DELTA_PX);
  const speed = VIDEO_SHUTTLE_MIN_SPEED + ((VIDEO_SHUTTLE_MAX_SPEED - VIDEO_SHUTTLE_MIN_SPEED) * intensity);
  return Math.round(speed * 10) / 10;
}

function commitVideoShuttlePlayhead(context = {}, video = null) {
  const currentMs = getVideoCurrentMs(video);
  ensureRuntime(context).store.update((state) => ({
    ...state,
    timeline: {
      ...(state.timeline || {}),
      playheadMs: currentMs,
    },
  }));
}

function stopVideoShuttle(frame = null, context = {}) {
  if (!frame) return;
  const session = videoShuttleSessions.get(frame);
  const winRef = session?.winRef || context.win || globalThis.window;
  if (session?.timer && winRef?.clearTimeout) winRef.clearTimeout(session.timer);
  if (session?.frameId && winRef?.cancelAnimationFrame) winRef.cancelAnimationFrame(session.frameId);
  if (session?.video) {
    session.video.playbackRate = session.basePlaybackRate;
    session.video.muted = session.wasMuted;
    if (session.wasPaused) {
      session.video.pause?.();
    } else if (session.mode === "step") {
      const resumePromise = session.video.play?.();
      resumePromise?.catch?.(() => {});
    }
    timelineController(context).handleVideoTimeUpdate(session.video);
    commitVideoShuttlePlayhead(context, session.video);
    syncPlaybackControls(context, session.video);
  }
  frame.classList.remove("is-shuttle-scrubbing");
  videoShuttleSessions.delete(frame);
  videoShuttleTimers.delete(frame);
}

function scheduleVideoShuttleStop(frame = null, context = {}) {
  if (!frame) return;
  const session = videoShuttleSessions.get(frame);
  const winRef = session?.winRef || context.win || globalThis.window;
  const existingTimer = session?.timer || videoShuttleTimers.get(frame);
  if (existingTimer && winRef?.clearTimeout) winRef.clearTimeout(existingTimer);
  const nextTimer = winRef?.setTimeout?.(() => stopVideoShuttle(frame, context), VIDEO_SHUTTLE_IDLE_MS);
  if (session) session.timer = nextTimer;
  if (nextTimer) videoShuttleTimers.set(frame, nextTimer);
}

function createVideoShuttleSession(frame, video, context = {}) {
  const winRef = context.win || globalThis.window;
  const session = {
    basePlaybackRate: Number(video.playbackRate || 1) || 1,
    direction: 1,
    frameId: 0,
    lastFrameTime: 0,
    mode: "step",
    speed: VIDEO_SHUTTLE_MIN_SPEED,
    timer: 0,
    token: 0,
    video,
    wasMuted: Boolean(video.muted),
    wasPaused: Boolean(video.paused || video.ended),
    winRef,
  };
  videoShuttleSessions.set(frame, session);
  return session;
}

function videoShuttleStep(frame, context = {}) {
  const session = videoShuttleSessions.get(frame);
  if (!session?.video) return;
  const winRef = session.winRef || context.win || globalThis.window;
  const step = (timestamp = 0) => {
    const activeSession = videoShuttleSessions.get(frame);
    if (!activeSession || activeSession.mode !== "step") return;
    activeSession.frameId = 0;
    const elapsedMs = activeSession.lastFrameTime
      ? Math.min(VIDEO_SHUTTLE_MAX_FRAME_MS, Math.max(8, Number(timestamp || 0) - activeSession.lastFrameTime))
      : 16;
    activeSession.lastFrameTime = Number(timestamp || 0);
    const state = ensureRuntime(context).store.getState();
    const durationMs = videoShuttleDurationMs(state, activeSession.video);
    const currentMs = videoShuttleCurrentMs(state, activeSession.video);
    const nextMs = Math.max(0, Math.min(durationMs, currentMs + (activeSession.direction * activeSession.speed * elapsedMs)));
    timelineController(context).seekToMs(nextMs, { commit: false });
    if (nextMs <= 0 || nextMs >= durationMs) {
      scheduleVideoShuttleStop(frame, context);
      return;
    }
    activeSession.frameId = winRef?.requestAnimationFrame?.(step) || 0;
  };
  if (!session.frameId) session.frameId = winRef?.requestAnimationFrame?.(step) || 0;
}

function activateVideoShuttle(frame, video, context = {}, direction = 1, speed = VIDEO_SHUTTLE_MIN_SPEED) {
  const session = videoShuttleSessions.get(frame) || createVideoShuttleSession(frame, video, context);
  const winRef = session.winRef || context.win || globalThis.window;
  session.token += 1;
  const token = session.token;
  session.direction = direction;
  session.speed = speed;
  frame.classList.add("is-shuttle-scrubbing");
  video.muted = true;

  if (direction > 0) {
    if (session.frameId && winRef?.cancelAnimationFrame) winRef.cancelAnimationFrame(session.frameId);
    session.frameId = 0;
    session.lastFrameTime = 0;
    session.mode = "native-forward";
    video.playbackRate = speed;
    const playPromise = video.play?.();
    if (!playPromise?.then) {
      syncPlaybackControls(context, video, true);
      return;
    }
    playPromise.then(() => {
      if (videoShuttleSessions.get(frame) !== session || session.token !== token || session.mode !== "native-forward" || session.direction <= 0) return;
      syncPlaybackControls(context, video, true);
    }).catch(() => {
      if (videoShuttleSessions.get(frame) !== session || session.token !== token || session.direction <= 0) return;
      session.mode = "step";
      video.pause?.();
      videoShuttleStep(frame, context);
    });
    return;
  }

  if (session.mode === "native-forward") {
    video.playbackRate = session.basePlaybackRate;
  }
  video.pause?.();
  session.mode = "step";
  session.lastFrameTime = 0;
  videoShuttleStep(frame, context);
}

function handleVideoFrameWheel(event = {}, context = {}) {
  const target = eventElement(event);
  const surface = target?.closest?.("[data-video-analysis-video-shuttle], .video-analysis-fs-player-deck");
  if (!surface || target.closest?.("input, select, textarea, a")) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;

  const video = videoElement(context);
  const frame = surface.matches?.("[data-video-analysis-video-shuttle]")
    ? surface
    : surface.querySelector?.(".video-analysis-video-frame");
  if (!video || !frame.contains(video)) return false;

  if (!videoShuttleHasHorizontalIntent(event)) return false;
  event.preventDefault?.();

  const horizontalDelta = videoShuttleHorizontalDelta(event);
  if (Math.abs(horizontalDelta) < VIDEO_SHUTTLE_MIN_DELTA_PX) return true;

  const direction = horizontalDelta > 0 ? 1 : -1;
  activateVideoShuttle(frame, video, context, direction, videoShuttleSpeedFromDelta(horizontalDelta));
  scheduleVideoShuttleStop(frame, context);
  return true;
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
  const focusedPresentationLibrarySearch = Boolean(root.querySelector("[data-video-analysis-presentation-library-search]:focus"));
  const focusedPresentationFilter = root.querySelector("[data-video-analysis-presentation-filter]:focus")?.dataset.videoAnalysisPresentationFilter || "";
  const focusedPresentationSectionTitle = root.querySelector("[data-video-analysis-presentation-section-title]:focus")?.dataset.videoAnalysisPresentationSectionTitle || "";
  const focusedPresentationSectionNote = root.querySelector("[data-video-analysis-presentation-section-note]:focus")?.dataset.videoAnalysisPresentationSectionNote || "";
  const focusedPresentationItemTitle = root.querySelector("[data-video-analysis-presentation-item-title]:focus")?.dataset.videoAnalysisPresentationItemTitle || "";
  const focusedPresentationItemNote = root.querySelector("[data-video-analysis-presentation-item-note]:focus")?.dataset.videoAnalysisPresentationItemNote || "";
  const focusedSmartDraft = root.querySelector("[data-video-analysis-smart-draft]:focus")?.dataset.videoAnalysisSmartDraft || "";
  const focusedPresentationShareDraft = root.querySelector("[data-video-analysis-presentation-share-draft]:focus")?.dataset.videoAnalysisPresentationShareDraft || "";
  const focusedDrawingField = root.querySelector("[data-video-analysis-drawing-field]:focus")?.dataset.videoAnalysisDrawingField || "";
  const focusedMgPrincipleSearch = Boolean(root.querySelector("[data-video-analysis-mg-principle-search]:focus"));
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
      <section class="analysis-room-tab-panel" aria-label="${escapeHtml(activeTabId === "presentation" ? "Presentation" : activeTabId === "match-report" ? "Clip Library" : activeTabId === "overview" ? "Overview" : "FS Player")}">
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
            ${activeTabId === "presentation"
              ? renderPresentationWorkspace(state)
              : activeTabId === "match-report"
                ? renderClipLibraryWorkspace(displayState)
                : renderFsPlayerWorkspace(displayState)}
          `}
        </section>
      </section>
    </section>
  `;
  bindPaintedVideoControls(root, {
    handleFileSelection,
    openLocalVideoPicker,
    handleWheel,
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
                    : focusedPresentationLibrarySearch
                      ? root.querySelector("[data-video-analysis-presentation-library-search]")
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
                                : focusedSmartDraft
                                  ? root.querySelector(`[data-video-analysis-smart-draft="${focusedSmartDraft}"]`)
                                  : focusedPresentationShareDraft
                                    ? root.querySelector(`[data-video-analysis-presentation-share-draft="${focusedPresentationShareDraft}"]`)
                                    : focusedDrawingField
                                      ? root.querySelector(`[data-video-analysis-drawing-field="${focusedDrawingField}"]`)
                                      : focusedMgPrincipleSearch
                                        ? root.querySelector("[data-video-analysis-mg-principle-search]")
                                        : null;
  if (nextFocus) {
    nextFocus.focus();
    if (Number.isFinite(selectionStart) && typeof nextFocus.setSelectionRange === "function") {
      nextFocus.setSelectionRange(selectionStart, selectionStart);
    }
  }
  if (video) {
    applyPlaybackRate(runtime?.context || context, video);
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
    video.addEventListener("play", () => syncPlaybackControls(runtime?.context || context, video, true));
    video.addEventListener("playing", () => {
      markNativePlaybackReady(video);
      syncPlaybackControls(runtime?.context || context, video, true);
    });
    video.addEventListener("pause", () => syncPlaybackControls(runtime?.context || context, video, false));
    video.addEventListener("ended", () => syncPlaybackControls(runtime?.context || context, video, false));
    video.addEventListener("error", () => setVideoPlaybackError(video), { once: true });
    syncPlaybackControls(runtime?.context || context, video);
    if (video.readyState >= 1) markNativePlaybackReady(video);
  }
  setupClipLibraryPreview(root, displayState);
  if (activeTabId === "presentation") thumbnails(runtime?.context || {}).ensureThumbnails();
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
        subPhase: filters.subPhase,
        outcome: filters.outcome,
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
    if (filters.subPhase) {
      clips = clips.filter((clip) => String(clip.subPhase || clip.sub_phase || "") === filters.subPhase);
    }
    if (filters.tag) clips = clips.filter((clip) => clipHasTag(clip, filters.tag));
    if (filters.ownerId) clips = clips.filter((clip) => clipMatchesOwner(clip, filters.ownerId));
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
  return presentationControls(runtime?.context || {}).loadPresentations(options);
}

async function loadPresentation(id = "") {
  return presentationControls(runtime?.context || {}).loadPresentation(id);
}

async function loadPresentationSources(nextFilters = null, options = {}) {
  return presentationControls(runtime?.context || {}).loadPresentationSources(nextFilters, options);
}

async function saveCurrentPresentation(context = {}) {
  return presentationControls(context).saveCurrentPresentation(context);
}

async function saveCurrentSmartCollection(context = {}) {
  return presentationControls(context).saveCurrentSmartCollection(context);
}

async function pinSmartCollection(collectionId = "", context = {}) {
  return presentationControls(context).pinSmartCollection(collectionId, context);
}

async function duplicateSmartCollectionById(collectionId = "", context = {}) {
  return presentationControls(context).duplicateSmartCollectionById(collectionId, context);
}

function openSmartCollectionShare(collectionId = "", context = {}) {
  return presentationControls(context).openSmartCollectionShare(collectionId, context);
}

function addSmartCollectionShareTarget(collectionId = "", context = {}) {
  return presentationControls(context).addSmartCollectionShareTarget(collectionId, context);
}

function removeSmartCollectionShareTarget(payload = "", context = {}) {
  return presentationControls(context).removeSmartCollectionShareTarget(payload, context);
}

async function saveSmartCollectionSharing(collectionId = "", context = {}) {
  return presentationControls(context).saveSmartCollectionSharing(collectionId, context);
}

function addPresentationShareTarget(context = {}) {
  return presentationControls(context).addPresentationShareTarget(context);
}

function removePresentationShareTarget(payload = "", context = {}) {
  return presentationControls(context).removePresentationShareTarget(payload, context);
}

async function savePresentationShareTargets(context = {}) {
  return presentationControls(context).savePresentationShareTargets(context);
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

function selectedClipFromPresentationSources(state = {}, clipId = "") {
  const sourceClips = Array.isArray(state.presentation?.sourceClips) ? state.presentation.sourceClips : [];
  const clips = Array.isArray(state.clips) ? state.clips : [];
  const allClips = Array.isArray(state.allClips) ? state.allClips : [];
  return sourceClips.find((clip) => clip.id === clipId)
    || clips.find((clip) => clip.id === clipId)
    || allClips.find((clip) => clip.id === clipId)
    || { id: clipId };
}

function clipLibraryPreviewPatch(state = {}, clipIds = [], activeIndex = 0) {
  const queueIds = clipIds.map((id) => String(id || "")).filter(Boolean);
  const safeIndex = Math.min(Math.max(0, activeIndex), Math.max(0, queueIds.length - 1));
  const clipId = queueIds[safeIndex] || queueIds[0] || "";
  const clip = selectedClipFromPresentationSources(state, clipId);
  return {
    selectedClipId: clipId,
    clipLibrary: {
      ...(state.clipLibrary || {}),
      previewClipId: clipId,
      previewQueueIds: queueIds,
      previewActiveIndex: safeIndex,
    },
    timeline: {
      ...(state.timeline || {}),
      playheadMs: clipStartMs(clip),
    },
  };
}

function setupClipLibraryPreview(root, state = {}) {
  const previewClipId = String(state.clipLibrary?.previewClipId || "");
  const video = root?.querySelector?.("[data-video-analysis-clip-library-video]");
  if (!previewClipId || !video || video.dataset.videoAnalysisPreviewStarted === "1") return;
  const clip = selectedClipFromPresentationSources(state, previewClipId);
  if (!clip?.id) return;
  const startSeconds = clipStartMs(clip) / 1000;
  const endSeconds = Math.max(startSeconds + 0.1, clipEndMs(clip) / 1000);
  video.dataset.videoAnalysisPreviewStarted = "1";
  video.dataset.videoAnalysisPreviewEnd = String(endSeconds);
  const startPlayback = () => {
    try {
      video.currentTime = startSeconds;
    } catch {
      // The browser may reject seeking before metadata is ready for a local object URL.
    }
    video.play?.().catch(() => {});
  };
  video.addEventListener("timeupdate", () => {
    const limit = Number(video.dataset.videoAnalysisPreviewEnd || endSeconds);
    if (Number.isFinite(limit) && Number(video.currentTime || 0) >= limit) {
      const queueIds = (Array.isArray(state.clipLibrary?.previewQueueIds) ? state.clipLibrary.previewQueueIds : [])
        .map((id) => String(id || ""))
        .filter(Boolean);
      const activeIndex = Math.max(0, Number(state.clipLibrary?.previewActiveIndex || 0));
      const nextIndex = activeIndex + 1;
      if (queueIds.length > 1 && nextIndex < queueIds.length && video.dataset.videoAnalysisPreviewAdvancing !== "1") {
        video.dataset.videoAnalysisPreviewAdvancing = "1";
        runtime?.store?.update((current) => ({
          ...current,
          ...clipLibraryPreviewPatch(current, queueIds, nextIndex),
        }));
        return;
      }
      video.pause?.();
      video.currentTime = limit;
    }
  });
  if (video.readyState >= 1) startPlayback();
  else video.addEventListener("loadedmetadata", startPlayback, { once: true });
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

function visibleTimelineLanes(state = {}) {
  const laneMode = normalizeTimelineLaneMode(state.timeline?.laneMode);
  const lanes = buildTimelineLanes(Array.isArray(state.clips) ? state.clips : [], laneMode);
  return { laneMode, lanes };
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

const clipTrimCommitQueues = new Map();

function findClipInStateById(state = {}, clipId = "") {
  return [...(state.clips || []), ...(state.allClips || [])].find((item) => item.id === clipId);
}

function stateHasClipTimes(state = {}, clipId = "", startMs = 0, endMs = 0) {
  const clip = findClipInStateById(state, clipId);
  return Boolean(clip?.id && clipStartMs(clip) === startMs && clipEndMs(clip) === endMs);
}

function enqueueClipTrimCommit(clipId = "", task = async () => {}) {
  const previous = clipTrimCommitQueues.get(clipId) || Promise.resolve();
  const queued = previous.catch(() => {}).then(task);
  const cleanup = queued.finally(() => {
    if (clipTrimCommitQueues.get(clipId) === cleanup) {
      clipTrimCommitQueues.delete(clipId);
    }
  });
  clipTrimCommitQueues.set(clipId, cleanup);
  return queued;
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

function activeMiniGamePrincipleIds(state = {}) {
  const playheadMs = currentPlayheadMs(runtime?.context || {}, state);
  const targetClip = findClipForLabelAction(state, playheadMs);
  if (targetClip?.id) return clipMiniGamePrincipleIds(targetClip);
  return uniqueMiniGamePrincipleIds([
    ...(Array.isArray(state.codingSession?.miniGamePrincipleDraftIds) ? state.codingSession.miniGamePrincipleDraftIds : []),
    ...(Array.isArray(state.draft?.miniGamePrincipleIds) ? state.draft.miniGamePrincipleIds : []),
    state.draft?.miniGamePrincipleId,
  ]);
}

function pickerVisibleMiniGamePrincipleIds(ids = []) {
  return uniqueMiniGamePrincipleIds(ids).filter((id) => pickerMiniGamePrincipleIdSet.has(id));
}

function normalizedPickerSearch(value = "") {
  return String(value || "").trim().toLowerCase();
}

function pickerPrincipleMatchesSearch(principle = {}, query = "") {
  if (!query) return true;
  return [principle.label, principle.id, principle.groupLabel]
    .some((value) => String(value || "").toLowerCase().includes(query));
}

function firstMiniGamePrincipleSearchMatchId(search = "") {
  const query = normalizedPickerSearch(search);
  if (!query) return "";
  return pickerMiniGamePrinciples.find((principle) => pickerPrincipleMatchesSearch(principle, query))?.id || "";
}

function toggleMiniGamePrincipleDraftId(state = {}, id = "") {
  const ids = toggledMiniGamePrincipleIds(state, id);
  if (!ids) return state;
  return patchMiniGamePrincipleDraftState(state, ids);
}

function toggledMiniGamePrincipleIds(state = {}, id = "") {
  const principleId = String(id || "").trim();
  if (!principleId || !pickerMiniGamePrincipleIdSet.has(principleId)) return null;
  const currentIds = pickerVisibleMiniGamePrincipleIds(state.codingSession?.miniGamePrincipleDraftIds || activeMiniGamePrincipleIds(state));
  const selected = new Set(currentIds);
  if (selected.has(principleId)) selected.delete(principleId);
  else selected.add(principleId);
  return pickerVisibleMiniGamePrincipleIds([...selected]);
}

function patchMiniGamePrincipleDraftState(state = {}, ids = []) {
  return {
    ...state,
    draft: {
      ...(state.draft || {}),
      miniGamePrincipleId: ids[0] || "",
      miniGamePrincipleIds: ids,
    },
    codingSession: {
      ...(state.codingSession || {}),
      miniGamePrincipleDraftIds: ids,
      miniGamePrinciplePickerOpen: true,
    },
  };
}

function clipHasTag(clip = {}, tag = "") {
  const target = String(tag || "").trim().toLowerCase();
  if (!target) return true;
  return (Array.isArray(clip.tags) ? clip.tags : []).some((value) => String(value || "").trim().toLowerCase() === target);
}

function clipOwnerId(clip = {}) {
  return String(clip.ownerId || clip.owner_id || clip.createdBy || clip.created_by || "").trim();
}

function clipMatchesOwner(clip = {}, ownerId = "") {
  const target = String(ownerId || "").trim();
  if (!target) return true;
  return clipOwnerId(clip) === target;
}

async function commitClipTrim(payload = {}, context = {}) {
  const run = ensureRuntime(context);
  const clipId = payload.clipId || "";
  if (!clipId) return false;
  return enqueueClipTrimCommit(clipId, async () => {
    try {
      const result = await run.clips.trim({ id: clipId, startMs: payload.startMs, endMs: payload.endMs });
      const savedClip = normalizeClipInstance(result.clip || {});
      const startMs = savedClip.startMs ?? payload.startMs;
      const endMs = savedClip.endMs ?? payload.endMs;
      run.store.update((current) => ({
        ...(
          stateHasClipTimes(current, clipId, payload.startMs, payload.endMs)
            ? patchClipTimesInState(current, clipId, startMs, endMs)
            : current
        ),
        selectedClipId: clipId,
        message: "Clip timing updated.",
        error: "",
      }));
      return true;
    } catch (error) {
      run.store.update((current) => ({
        ...(
          stateHasClipTimes(current, clipId, payload.startMs, payload.endMs)
            ? patchClipTimesInState(current, clipId, payload.originalStartMs, payload.originalEndMs)
            : current
        ),
        error: error.message || "Could not update clip timing.",
      }));
      return false;
    }
  });
}

function trimSelectedClipByKeyboard(context = {}, payload = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  const clipId = state.selectedClipId || state.timeline?.selectedCategory?.activeClipId || state.codingSession?.lastClipId || "";
  const clip = [...(state.clips || []), ...(state.allClips || [])].find((item) => item.id === clipId);
  if (!clip?.id) {
    run.store.update((current) => ({ ...current, message: "Select a tag before trimming." }));
    return true;
  }

  const originalStartMs = clipStartMs(clip);
  const originalEndMs = clipEndMs(clip);
  const deltaMs = Math.round(Number(payload.deltaMs || 0));
  const videoDurationMs = Math.max(0, Math.round(Number(state.videoRef?.durationMs || 0)));
  let startMs = originalStartMs;
  let endMs = originalEndMs;

  if (payload.edge === "start") {
    startMs = Math.max(0, Math.min(originalEndMs - KEYBOARD_CLIP_TRIM_MIN_MS, originalStartMs + deltaMs));
  } else if (payload.edge === "end") {
    const maxEndMs = videoDurationMs > 0 ? videoDurationMs : Number.POSITIVE_INFINITY;
    endMs = Math.min(maxEndMs, Math.max(originalStartMs + KEYBOARD_CLIP_TRIM_MIN_MS, originalEndMs + deltaMs));
  } else {
    return true;
  }

  if (startMs === originalStartMs && endMs === originalEndMs) {
    return true;
  }

  run.store.update((current) => ({
    ...patchClipTimesInState(current, clip.id, startMs, endMs),
    selectedClipId: clip.id,
    message: payload.edge === "start" ? "Tag start adjusted by 1s." : "Tag end adjusted by 1s.",
    error: "",
  }));
  void commitClipTrim({ clipId: clip.id, startMs, endMs, originalStartMs, originalEndMs }, context);
  return true;
}

function uniqueClipIds(ids = []) {
  return Array.from(new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)));
}

function removeArchivedClipIdsFromState(state = {}, clipIds = [], options = {}) {
  const archivedIds = new Set(uniqueClipIds(clipIds));
  if (!archivedIds.size) return state;
  const filterClips = (clips = []) => (Array.isArray(clips) ? clips.filter((clip) => !archivedIds.has(String(clip.id || ""))) : clips);
  const selectedClipId = archivedIds.has(String(state.selectedClipId || "")) ? "" : state.selectedClipId;
  const selectedCategory = options.clearCategory
    ? {}
    : {
        ...(state.timeline?.selectedCategory || {}),
        activeClipId: archivedIds.has(String(state.timeline?.selectedCategory?.activeClipId || ""))
          ? ""
          : state.timeline?.selectedCategory?.activeClipId || "",
      };
  const selectedClipIds = (Array.isArray(state.clipLibrary?.selectedClipIds) ? state.clipLibrary.selectedClipIds : [])
    .filter((id) => !archivedIds.has(String(id || "")));
  const previewQueueIds = (Array.isArray(state.clipLibrary?.previewQueueIds) ? state.clipLibrary.previewQueueIds : [])
    .filter((id) => !archivedIds.has(String(id || "")));
  const previewClipId = archivedIds.has(String(state.clipLibrary?.previewClipId || ""))
    ? previewQueueIds[0] || ""
    : state.clipLibrary?.previewClipId || "";
  return {
    ...state,
    clips: filterClips(state.clips),
    allClips: filterClips(state.allClips),
    selectedClipId,
    timeline: {
      ...(state.timeline || {}),
      selectedCategory,
    },
    clipLibrary: {
      ...(state.clipLibrary || {}),
      selectedClipIds,
      previewQueueIds,
      previewClipId,
      previewActiveIndex: previewClipId ? Math.max(0, previewQueueIds.indexOf(previewClipId)) : 0,
    },
  };
}

async function archiveTimelineClips(context = {}, clipIds = [], options = {}) {
  const run = ensureRuntime(context);
  const ids = uniqueClipIds(clipIds);
  if (!ids.length) {
    run.store.update((state) => ({ ...state, message: "Select a timeline tag first." }));
    return false;
  }
  try {
    run.store.update((state) => ({
      ...state,
      status: "saving-clip",
      message: ids.length === 1 ? "Deleting timeline tag." : `Deleting ${ids.length} timeline tags.`,
      error: "",
    }));
    if (ids.length === 1) await run.clips.archive(ids[0]);
    else await run.clips.archiveMany(ids);
    run.store.update((state) => ({
      ...removeArchivedClipIdsFromState(state, ids, options),
      status: "ready",
      message: ids.length === 1 ? "Timeline tag deleted." : `${ids.length} timeline tags deleted.`,
      error: "",
    }));
    await loadClips();
    return true;
  } catch (error) {
    run.store.update((state) => ({
      ...state,
      status: "error",
      message: "",
      error: error.message || "Could not delete timeline tag.",
    }));
    return false;
  }
}

function isTimelineDeleteKey(event = {}) {
  return ["Delete", "Backspace"].includes(event.key)
    && !event.metaKey
    && !event.ctrlKey
    && !event.altKey
    && !event.shiftKey;
}

function timelineDeleteEventTarget(event = {}, context = {}) {
  const doc = context.doc || document;
  const target = eventElement(event);
  const activeElement = doc.activeElement || null;
  if (!target || target === doc.body || target === doc.documentElement || target === context.win) {
    return activeElement || target;
  }
  return target;
}

function timelineDeleteIntent(event = {}, state = {}, context = {}) {
  const target = timelineDeleteEventTarget(event, context);
  const categoryButton = target?.closest?.("[data-video-analysis-timeline-category]");
  if (categoryButton) {
    const { laneMode, label } = categoryPayloadFromButton(categoryButton);
    const clips = findTimelineCategoryClips(state, laneMode, label);
    return clips.length ? { type: "category", laneMode, label, clipIds: clips.map((clip) => clip.id) } : null;
  }
  const clipButton = target?.closest?.(".video-analysis-timeline-module [data-video-analysis-seek]");
  if (clipButton?.dataset?.videoAnalysisSeek) {
    return { type: "clip", clipIds: [clipButton.dataset.videoAnalysisSeek] };
  }
  const selectedClipId = String(state.selectedClipId || state.timeline?.selectedCategory?.activeClipId || "");
  if (
    state.timeline?.selectedCategory?.keyboardDeleteScope === "category"
    && state.timeline.selectedCategory.laneMode
    && state.timeline.selectedCategory.label
  ) {
    const laneMode = state.timeline.selectedCategory.laneMode;
    const label = state.timeline.selectedCategory.label;
    const clips = findTimelineCategoryClips(state, laneMode, label);
    return clips.length ? { type: "category", laneMode, label, clipIds: clips.map((clip) => clip.id) } : null;
  }
  if (selectedClipId) {
    return { type: "clip", clipIds: [selectedClipId] };
  }
  return null;
}

function confirmTimelineCategoryDelete(intent = {}, context = {}) {
  const count = intent.clipIds?.length || 0;
  if (!count) return false;
  const confirm = (context.win || window).confirm || (() => false);
  return confirm(
    `Delete the "${intent.label}" timeline row?\n\n${count} tag${count === 1 ? "" : "s"} will be archived from this timeline. This cannot be undone from here.`
  );
}

function deleteTimelineSelectionByKeyboard(event = {}, context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  if (state.activeAnalysisRoomTab !== "fs-player" || !isTimelineDeleteKey(event) || shouldIgnoreShortcutTarget(event.target)) return false;
  const intent = timelineDeleteIntent(event, state, context);
  if (!intent) return false;
  event.preventDefault?.();
  event.stopPropagation?.();
  if (intent.type === "category" && !confirmTimelineCategoryDelete(intent, context)) return true;
  void archiveTimelineClips(context, intent.clipIds, { clearCategory: intent.type === "category" });
  return true;
}

function selectTimelineClip(context = {}, clip = {}, laneMode = "", label = "") {
  if (!clip?.id) return false;
  const run = ensureRuntime(context);
  const startMs = clipStartMs(clip);
  seekVideoToMs(videoElement(context), startMs);
  run.store.update((current) => ({
    ...current,
    selectedClipId: clip.id,
    timeline: {
      ...(current.timeline || {}),
      playheadMs: Math.max(0, Math.round(Number(startMs || 0))),
      selectedCategory: {
        ...(current.timeline?.selectedCategory || {}),
        laneMode: normalizeTimelineLaneMode(laneMode),
        label,
        activeClipId: clip.id,
        keyboardDeleteScope: "clip",
      },
    },
  }));
  return true;
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

function findTimelineClipPosition(state = {}, clipId = "") {
  const selectedId = String(clipId || state.selectedClipId || state.timeline?.selectedCategory?.activeClipId || "");
  if (!selectedId) return null;
  const { laneMode, lanes } = visibleTimelineLanes(state);
  for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
    const lane = lanes[laneIndex];
    const clipIndex = lane.clips.findIndex((clip) => String(clip.id || "") === selectedId);
    if (clipIndex !== -1) return { laneMode, lanes, lane, laneIndex, clipIndex };
  }
  return null;
}

function nextTimelineClipFromPosition(position = null, direction = 1) {
  if (!position?.lane || !Array.isArray(position.lanes)) return null;
  const step = direction < 0 ? -1 : 1;
  const { lanes, laneIndex, clipIndex } = position;
  const currentLane = lanes[laneIndex];
  if (step > 0) {
    if (clipIndex < currentLane.clips.length - 1) {
      return { lane: currentLane, clip: currentLane.clips[clipIndex + 1] };
    }
    const nextLane = lanes[laneIndex + 1];
    return nextLane?.clips?.length ? { lane: nextLane, clip: nextLane.clips[0] } : null;
  }
  if (clipIndex > 0) {
    return { lane: currentLane, clip: currentLane.clips[clipIndex - 1] };
  }
  const previousLane = lanes[laneIndex - 1];
  return previousLane?.clips?.length
    ? { lane: previousLane, clip: previousLane.clips[previousLane.clips.length - 1] }
    : null;
}

function tabToAdjacentTimelineClip(event = {}, context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  if (
    state.activeAnalysisRoomTab !== "fs-player"
    || event.key !== "Tab"
    || shouldIgnoreShortcutTarget(event.target)
    || event.metaKey
    || event.ctrlKey
    || event.altKey
  ) {
    return false;
  }
  const position = findTimelineClipPosition(state);
  if (!position) return false;
  const next = nextTimelineClipFromPosition(position, event.shiftKey ? -1 : 1);
  if (!next?.clip?.id) return false;
  event.preventDefault?.();
  event.stopPropagation?.();
  return selectTimelineClip(context, next.clip, position.laneMode, next.lane.label);
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

function templateDropTarget(target) {
  const groupTarget = target?.closest?.("[data-video-analysis-template-drop-group]");
  if (groupTarget) {
    return { type: "group", group: groupTarget.dataset.videoAnalysisTemplateDropGroup || "" };
  }
  const buttonTarget = target?.closest?.("[data-video-analysis-template-drop-button]");
  if (buttonTarget) {
    const [group, beforeButtonId] = String(buttonTarget.dataset.videoAnalysisTemplateDropButton || "").split(":");
    return { type: "button", group, beforeButtonId };
  }
  const emptyButtonTarget = target?.closest?.("[data-video-analysis-template-drop-button-empty]");
  if (emptyButtonTarget) {
    return { type: "button", group: emptyButtonTarget.dataset.videoAnalysisTemplateDropButtonEmpty || "", beforeButtonId: "" };
  }
  return null;
}

function codingTemplateBuilderPatch(state = {}, patch = {}, dirty = false) {
  return {
    ...(state.codingSession || {}),
    ...(dirty ? { templateDirty: true } : {}),
    templateBuilder: {
      ...(state.codingSession?.templateBuilder || {}),
      ...patch,
    },
  };
}

function firstButtonInGroup(template = {}, groupLabel = "") {
  const group = groupCodingTemplateButtons(template).find((item) => item.label === groupLabel);
  return group?.buttons?.[0] || null;
}

function selectedButtonFallback(template = {}, preferredButtonId = "", preferredGroup = "") {
  const buttons = template.buttons || [];
  return buttons.find((item) => item.id === preferredButtonId)
    || firstButtonInGroup(template, preferredGroup)
    || buttons[0]
    || null;
}

export function handleDragStart(event, context = {}) {
  ensureRuntime(context);
  const target = eventElement(event);
  const templateGroup = target?.closest?.("[data-video-analysis-template-drag-group]");
  if (templateGroup) {
    const groupLabel = templateGroup.dataset.videoAnalysisTemplateDragGroup || "";
    if (!groupLabel) return false;
    event.dataTransfer?.setData("text/plain", `video-analysis-template-group:${groupLabel}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    return true;
  }
  const templateButton = target?.closest?.("[data-video-analysis-template-drag-button]");
  if (templateButton) {
    const buttonId = templateButton.dataset.videoAnalysisTemplateDragButton || "";
    if (!buttonId) return false;
    event.dataTransfer?.setData("text/plain", `video-analysis-template-button:${buttonId}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    return true;
  }
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
  if (!presentationDropTarget(target) && !templateDropTarget(target)) return false;
  event.preventDefault?.();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  return true;
}

export function handleDrop(event, context = {}) {
  const run = ensureRuntime(context);
  const target = eventElement(event);
  const templateTarget = templateDropTarget(target);
  const transfer = event.dataTransfer?.getData("text/plain") || "";
  if (templateTarget) {
    event.preventDefault?.();
    run.store.update((state) => {
      if (transfer.startsWith("video-analysis-template-group:") && templateTarget.type === "group") {
        const groupLabel = transfer.replace("video-analysis-template-group:", "");
        const template = moveCodingTemplateGroup(state.template || {}, groupLabel, templateTarget.group);
        return {
          ...state,
          template,
          codingSession: codingTemplateBuilderPatch(state, { selectedGroup: groupLabel }, true),
          message: "Tag group reordered.",
          error: "",
        };
      }
      if (transfer.startsWith("video-analysis-template-button:") && templateTarget.type === "group") {
        const buttonId = transfer.replace("video-analysis-template-button:", "");
        const template = moveCodingButtonInTemplate(state.template || {}, buttonId, templateTarget.group, "");
        return {
          ...state,
          template,
          codingSession: codingTemplateBuilderPatch(state, {
            selectedGroup: templateTarget.group,
            selectedButtonId: buttonId,
            newButtonGroup: templateTarget.group,
          }, true),
          message: "Tag button moved to group.",
          error: "",
        };
      }
      if (transfer.startsWith("video-analysis-template-button:") && templateTarget.type === "button") {
        const buttonId = transfer.replace("video-analysis-template-button:", "");
        const template = moveCodingButtonInTemplate(state.template || {}, buttonId, templateTarget.group, templateTarget.beforeButtonId);
        return {
          ...state,
          template,
          codingSession: codingTemplateBuilderPatch(state, {
            selectedGroup: templateTarget.group,
            selectedButtonId: buttonId,
          }, true),
          message: "Tag button reordered.",
          error: "",
        };
      }
      return state;
    });
    return true;
  }
  const dropTarget = presentationDropTarget(target);
  if (!dropTarget?.sectionId) return false;
  const itemId = transfer;
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
      codingSession: {
        ...codingSessionForTemplate(template, current.codingSession || {}),
        templateDirty: false,
      },
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
  if (state.status === "saving-template") return false;
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
        templateDirty: false,
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
    wheel: handleWheel,
  });
  if (!run.unsubscribe) {
    run.unsubscribe = run.store.subscribe((state) => paint(root, state));
  }
  if (!run.keydownBound) {
    const win = context.win || window;
    win.addEventListener?.("keydown", (event) => handleKeydown(event, context), true);
    win.addEventListener?.("keyup", (event) => handleKeyup(event, context), true);
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
  drawingController = null;
  presentationController = null;
  presenterController = null;
  thumbnailController = null;
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
      draft: { ...current.draft, startMs: clip.endMs, endMs: clip.endMs + nextDurationMs, tags: "", note: "", miniGamePrincipleId: "", miniGamePrincipleIds: [] },
      codingSession: {
        ...(current.codingSession || {}),
        manualInMs: null,
        openTag: null,
        miniGamePrincipleDraftIds: [],
        miniGamePrinciplePickerOpen: false,
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
  const clips = [
    ...(Array.isArray(state.clips) ? state.clips : []),
    ...(Array.isArray(state.allClips) ? state.allClips : []),
  ];
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

async function saveMiniGamePrinciplesForActiveClip(context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  const ids = pickerVisibleMiniGamePrincipleIds(state.codingSession?.miniGamePrincipleDraftIds || []);
  const targetClip = findClipForLabelAction(state, currentPlayheadMs(context, state));
  if (!targetClip?.id) {
    run.store.update((current) => ({
      ...current,
      draft: {
        ...(current.draft || {}),
        miniGamePrincipleId: ids[0] || "",
        miniGamePrincipleIds: ids,
      },
      codingSession: {
        ...(current.codingSession || {}),
        miniGamePrincipleDraftIds: ids,
        miniGamePrinciplePickerOpen: false,
      },
      message: ids.length ? "MG principles ready for next tag." : "MG principles cleared for next tag.",
      error: "",
    }));
    return true;
  }
  const nextClip = normalizeClipInstance(withMiniGamePrinciples(targetClip, ids));
  run.store.update((current) => ({
    ...current,
    status: "saving-clip",
    selectedClipId: nextClip.id,
    message: "Saving MG principles.",
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
        miniGamePrincipleDraftIds: clipMiniGamePrincipleIds(savedClip),
        miniGamePrinciplePickerOpen: false,
      },
      message: ids.length ? "MG principles saved to clip." : "MG principles cleared from clip.",
      error: "",
    }));
    await loadClips();
    return true;
  } catch (error) {
    run.store.update((current) => ({
      ...replaceClipInState(current, targetClip),
      status: "error",
      error: error.message || "Could not save MG principles.",
    }));
    return false;
  }
}

async function toggleMiniGamePrincipleForActiveClip(principleId = "", context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  const ids = toggledMiniGamePrincipleIds(state, principleId);
  if (!ids) return false;
  const targetClip = findClipForLabelAction(state, currentPlayheadMs(context, state));
  if (!targetClip?.id) {
    run.store.update((current) => ({
      ...patchMiniGamePrincipleDraftState(current, ids),
      message: ids.length ? "MG principles ready for next tag." : "MG principles cleared for next tag.",
      error: "",
    }));
    return true;
  }
  const nextClip = normalizeClipInstance(withMiniGamePrinciples(targetClip, ids));
  const label = miniGamePrincipleLabel(principleId) || "MG principle";
  run.store.update((current) => ({
    ...replaceClipInState(patchMiniGamePrincipleDraftState(current, ids), nextClip),
    status: "saving-clip",
    selectedClipId: nextClip.id,
    codingSession: {
      ...(current.codingSession || {}),
      miniGamePrincipleDraftIds: ids,
      miniGamePrinciplePickerOpen: true,
      lastClipId: nextClip.id,
    },
    message: `${label} ${ids.includes(principleId) ? "tagged on clip." : "removed from clip."}`,
    error: "",
  }));
  try {
    const payload = await run.clips.save(toApiClipPayload(nextClip));
    const savedClip = normalizeClipInstance(payload?.clip || nextClip);
    const savedIds = pickerVisibleMiniGamePrincipleIds(clipMiniGamePrincipleIds(savedClip));
    run.store.update((current) => ({
      ...replaceClipInState(current, savedClip),
      status: "ready",
      selectedClipId: savedClip.id,
      codingSession: {
        ...(current.codingSession || {}),
        miniGamePrincipleDraftIds: savedIds,
        miniGamePrinciplePickerOpen: true,
        lastClipId: savedClip.id,
      },
      message: savedIds.length ? "MG principles saved to clip." : "MG principles cleared from clip.",
      error: "",
    }));
    await loadClips();
    return true;
  } catch (error) {
    run.store.update((current) => ({
      ...replaceClipInState(current, targetClip),
      status: "error",
      error: error.message || "Could not save MG principles.",
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

function playerLabel(player = {}) {
  return String(player.name || player.playerName || player.player_label || player.id || "Player").trim();
}

async function applyPlayerQuickTag(playerId = "", context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  const id = String(playerId || "").trim();
  const player = (state.players || []).find((item) => item.id === id || item.playerId === id || item.player_id === id);
  if (!player) {
    run.store.setState({ status: "error", message: "", error: "Player is not available in the current squad." });
    return false;
  }
  if (!state.match?.id || !state.video?.id) {
    run.store.setState({ status: "error", message: "", error: "Link a local match or training video before tagging players." });
    return false;
  }

  const currentMs = currentPlayheadMs(context, state);
  const durationMs = Math.max(1000, Number(state.template?.defaultClipDurationMs || state.codingSession?.defaultClipDurationMs || 15000));
  const nextState = {
    ...state,
    draft: {
      ...(state.draft || {}),
      playerId: player.id || id,
      playerRole: "primary",
      startMs: currentMs,
      endMs: currentMs + durationMs,
      visibility: "idp",
      clipVisibility: "idp",
    },
    codingSession: {
      ...(state.codingSession || {}),
      mode: "instant",
      preRollMs: 0,
      postRollMs: durationMs,
      activePlayerId: player.id || id,
      lastPlayerTagId: player.id || id,
    },
    timeline: {
      ...(state.timeline || {}),
      playheadMs: currentMs,
    },
    message: `${playerLabel(player)} tagged for IDP.`,
    error: "",
  };
  run.store.update(() => nextState);
  const saved = await saveDraftClip(context, nextState);
  if (saved) {
    run.store.update((current) => ({
      ...current,
      draft: {
        ...(current.draft || {}),
        playerId: "",
        playerRole: "primary",
        visibility: "private",
        clipVisibility: "private",
      },
      codingSession: {
        ...(current.codingSession || {}),
        activePlayerId: "",
        lastPlayerTagId: player.id || id,
      },
      message: `${playerLabel(player)} sent to IDP.`,
      error: "",
    }));
  }
  return saved;
}

export function handlePointerDown(event, context = {}) {
  const target = eventElement(event);
  const drawingSurface = target?.closest?.("[data-video-analysis-drawing-surface]");
  if (drawingSurface) {
    if (target.closest?.("input, textarea, select, button")) return false;
    const run = ensureRuntime(context);
    const state = run.store.getState();
    if (state.presentation?.mode !== "draw") return false;
    const presentation = state.presentation?.current;
    const item = selectedPresentationItem(presentation, state.presentation?.selectedItemId, state.presentation?.selectedClipId);
    if (!item) return false;
    return drawingControls(context).startInteraction(event, drawingSurface);
  }
  return timelineController(context).handlePointerDown(event);
}

export function handlePointerMove(event, context = {}) {
  return drawingControls(context).updateInteraction(event);
}

export function handlePointerUp(event, context = {}) {
  return drawingControls(context).finishInteraction(event);
}

export function handleWheel(event, context = {}) {
  if (handleVideoFrameWheel(event, context)) return true;
  return timelineController(context).handleWheel(event);
}

export function handleClick(event, context = {}) {
  const run = ensureRuntime(context);
  const target = eventElement(event);
  if (!target?.closest) return false;
  const roomTab = target.closest("[data-video-analysis-room-tab]");
  if (roomTab) {
    const tabId = roomTab.dataset.videoAnalysisRoomTab;
    if (tabId === "overview") {
      libraryController().openLibraryView(context);
      return true;
    }
    if (tabId === "fs-player" || tabId === "presentation" || tabId === "match-report") {
      run.store.update((state) => ({
        ...state,
        view: "workspace",
        activeAnalysisRoomTab: tabId,
        message: "",
        error: "",
      }));
      if (tabId === "presentation") loadPresentationSources(null, { silent: true });
      if (tabId === "match-report") loadClips(null);
      return true;
    }
    return true;
  }
  if (target.closest("[data-video-analysis-open-library]")) {
    libraryController().openLibraryView(context);
    return true;
  }
  if (target.closest("[data-video-analysis-video-fullscreen]")) {
    enterVideoFullscreen(context);
    return true;
  }
  if (target.closest("[data-video-analysis-code-mode]")) {
    toggleFsPlayerCodeMode(context);
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
  const presentationOpenButton = target.closest("[data-video-analysis-presentation-open]");
  if (presentationOpenButton) {
    const presentationId = presentationOpenButton.dataset.videoAnalysisPresentationOpen || "";
    if (presentationId) {
      loadPresentation(presentationId).then((loaded) => {
        if (!loaded) return;
        run.store.update((state) => ({
          ...state,
          presentation: {
            ...(state.presentation || {}),
            mode: "builder",
          },
        }));
      });
    } else {
      run.store.update((state) => ({
        ...state,
        presentation: {
          ...(state.presentation || {}),
          mode: "builder",
        },
      }));
    }
    return true;
  }
  const presentationPresentButton = target.closest("[data-video-analysis-presentation-present]");
  if (presentationPresentButton) {
    const presentationId = presentationPresentButton.dataset.videoAnalysisPresentationPresent || "";
    const openPresenter = () => run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        mode: "presenter",
      },
    }));
    if (presentationId) loadPresentation(presentationId).then((loaded) => { if (loaded) openPresenter(); });
    else openPresenter();
    return true;
  }
  if (target.closest("[data-video-analysis-presentation-refresh-sources]")) {
    loadPresentationSources();
    return true;
  }
  if (target.closest("[data-video-analysis-presentation-load-more]")) {
    loadPresentationSources(null, { append: true, silent: true });
    return true;
  }
  if (target.closest("[data-video-analysis-smart-save]")) {
    saveCurrentSmartCollection(context);
    return true;
  }
  const smartApply = target.closest("[data-video-analysis-smart-apply]");
  if (smartApply) {
    presentationControls(context).applySmartCollection(smartApply.dataset.videoAnalysisSmartApply || "");
    return true;
  }
  const smartPin = target.closest("[data-video-analysis-smart-pin]");
  if (smartPin) {
    pinSmartCollection(smartPin.dataset.videoAnalysisSmartPin || "", context);
    return true;
  }
  const smartDuplicate = target.closest("[data-video-analysis-smart-duplicate]");
  if (smartDuplicate) {
    duplicateSmartCollectionById(smartDuplicate.dataset.videoAnalysisSmartDuplicate || "", context);
    return true;
  }
  const smartShare = target.closest("[data-video-analysis-smart-share]");
  if (smartShare) {
    return openSmartCollectionShare(smartShare.dataset.videoAnalysisSmartShare || "", context);
  }
  const smartShareAdd = target.closest("[data-video-analysis-smart-share-add]");
  if (smartShareAdd) {
    return addSmartCollectionShareTarget(smartShareAdd.dataset.videoAnalysisSmartShareAdd || "", context);
  }
  const smartShareRemove = target.closest("[data-video-analysis-smart-share-remove]");
  if (smartShareRemove) {
    return removeSmartCollectionShareTarget(smartShareRemove.dataset.videoAnalysisSmartShareRemove || "", context);
  }
  const smartShareSave = target.closest("[data-video-analysis-smart-share-save]");
  if (smartShareSave) {
    saveSmartCollectionSharing(smartShareSave.dataset.videoAnalysisSmartShareSave || "", context);
    return true;
  }
  if (target.closest("[data-video-analysis-presentation-share-add]")) {
    return addPresentationShareTarget(context);
  }
  if (target.closest("[data-video-analysis-presentation-access-toggle]")) {
    event.preventDefault?.();
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        presentationAccessOpen: !state.presentation?.presentationAccessOpen,
      },
    }));
    return true;
  }
  const presentationShareRemove = target.closest("[data-video-analysis-presentation-share-remove]");
  if (presentationShareRemove) {
    return removePresentationShareTarget(presentationShareRemove.dataset.videoAnalysisPresentationShareRemove || "", context);
  }
  if (target.closest("[data-video-analysis-presentation-share-save]")) {
    savePresentationShareTargets(context);
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
  const playbackRateButton = target.closest("[data-video-analysis-playback-rate]");
  if (playbackRateButton) {
    return setPlaybackRate(context, playbackRateButton.dataset.videoAnalysisPlaybackRate || 1);
  }
  const playerNudge = target.closest("[data-video-analysis-player-nudge]");
  if (playerNudge) {
    return nudgePlayer(context, Number(playerNudge.dataset.videoAnalysisPlayerNudge || 0));
  }
  if (target.closest("[data-video-analysis-prepare-playback]")) {
    preparePlayableCopy(context);
    return true;
  }
  const panelModeButton = target.closest("[data-video-analysis-panel-mode]");
  if (panelModeButton) {
    run.store.update((state) => ({
      ...state,
      codingSession: {
        ...(state.codingSession || {}),
        panelMode: panelModeButton.dataset.videoAnalysisPanelMode || "use",
        templateBuilder: {
          ...(state.codingSession?.templateBuilder || {}),
          selectedGroup: state.codingSession?.templateBuilder?.selectedGroup || groupCodingTemplateButtons(state.template || {})[0]?.label || "Custom",
          selectedButtonId: state.codingSession?.templateBuilder?.selectedButtonId
            || groupCodingTemplateButtons(state.template || {})[0]?.buttons?.[0]?.id
            || "",
        },
      },
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
      const template = addCodingButtonGroupToTemplate(state.template || {}, groupName);
      const selectedButton = selectedButtonFallback(template, "", groupName);
      return {
        ...state,
        template,
        codingSession: codingTemplateBuilderPatch(state, {
          newGroupName: "",
          newButtonGroup: groupName,
          selectedGroup: groupName,
          selectedButtonId: selectedButton?.id || "",
        }, true),
        message: "Tag group added.",
        error: "",
      };
    });
    return true;
  }
  const groupAddButton = target.closest("[data-video-analysis-add-code-button-group]");
  if (groupAddButton) {
    const groupName = groupAddButton.dataset.videoAnalysisAddCodeButtonGroup || "Custom";
    run.store.update((state) => {
      const template = addCodingButtonToTemplate(state.template || {}, { group: groupName });
      const selectedButton = selectedButtonFallback(template, "", groupName);
      return {
        ...state,
        template,
        codingSession: codingTemplateBuilderPatch(state, {
          newButtonGroup: groupName,
          selectedGroup: groupName,
          selectedButtonId: selectedButton?.id || "",
        }, true),
        message: "Tag button added.",
        error: "",
      };
    });
    return true;
  }
  if (target.closest("[data-video-analysis-add-code-button]")) {
    run.store.update((state) => {
      const groups = (state.template?.buttons || []).map((button) => button.group || "Custom");
      const groupName = state.codingSession?.templateBuilder?.newButtonGroup || groups[0] || "Custom";
      const template = addCodingButtonToTemplate(state.template || {}, { group: groupName });
      const selectedButton = selectedButtonFallback(template, "", groupName);
      return {
        ...state,
        template,
        codingSession: codingTemplateBuilderPatch(state, {
          newButtonGroup: groupName,
          selectedGroup: groupName,
          selectedButtonId: selectedButton?.id || "",
        }, true),
        message: "Tag button added.",
        error: "",
      };
    });
    return true;
  }
  const duplicateCodeButton = target.closest("[data-video-analysis-duplicate-code-button]");
  if (duplicateCodeButton) {
    run.store.update((state) => {
      const source = findTemplateButton(state.template || {}, duplicateCodeButton.dataset.videoAnalysisDuplicateCodeButton);
      const template = duplicateCodingButtonInTemplate(state.template || {}, duplicateCodeButton.dataset.videoAnalysisDuplicateCodeButton);
      const selectedButton = selectedButtonFallback(template, "", source?.group || "");
      return {
        ...state,
        template,
        codingSession: codingTemplateBuilderPatch(state, {
          selectedGroup: selectedButton?.group || source?.group || state.codingSession?.templateBuilder?.selectedGroup || "Custom",
          selectedButtonId: selectedButton?.id || "",
        }, true),
        message: "Tag button duplicated.",
        error: "",
      };
    });
    return true;
  }
  const removeCodeButton = target.closest("[data-video-analysis-remove-code-button]");
  if (removeCodeButton) {
    run.store.update((state) => {
      const removed = findTemplateButton(state.template || {}, removeCodeButton.dataset.videoAnalysisRemoveCodeButton);
      const template = removeCodingButtonFromTemplate(state.template || {}, removeCodeButton.dataset.videoAnalysisRemoveCodeButton);
      const selectedButton = selectedButtonFallback(template, "", removed?.group || state.codingSession?.templateBuilder?.selectedGroup || "");
      return {
        ...state,
        template,
        codingSession: codingTemplateBuilderPatch(state, {
          selectedGroup: selectedButton?.group || removed?.group || state.codingSession?.templateBuilder?.selectedGroup || "Custom",
          selectedButtonId: selectedButton?.id || "",
        }, true),
        message: "Tag button archived from this panel.",
        error: "",
      };
    });
    return true;
  }
  const selectTemplateGroup = target.closest("[data-video-analysis-template-select-group]");
  if (selectTemplateGroup) {
    const selectedGroup = selectTemplateGroup.dataset.videoAnalysisTemplateSelectGroup || "Custom";
    const selectedButton = firstButtonInGroup(run.store.getState().template || {}, selectedGroup);
    run.store.update((state) => ({
      ...state,
      codingSession: codingTemplateBuilderPatch(state, {
        selectedGroup,
        selectedButtonId: selectedButton?.id || state.codingSession?.templateBuilder?.selectedButtonId || "",
        newButtonGroup: selectedGroup,
      }),
    }));
    return true;
  }
  const selectTemplateButton = target.closest("[data-video-analysis-template-select-button]");
  if (selectTemplateButton) {
    const buttonId = selectTemplateButton.dataset.videoAnalysisTemplateSelectButton || "";
    const button = findTemplateButton(run.store.getState().template || {}, buttonId);
    run.store.update((state) => ({
      ...state,
      codingSession: codingTemplateBuilderPatch(state, {
        selectedButtonId: buttonId,
        selectedGroup: button?.group || state.codingSession?.templateBuilder?.selectedGroup || "Custom",
        newButtonGroup: button?.group || state.codingSession?.templateBuilder?.newButtonGroup || "Custom",
      }),
    }));
    return true;
  }
  const moveTemplateGroup = target.closest("[data-video-analysis-template-move-group]");
  if (moveTemplateGroup) {
    const [groupLabel, direction] = String(moveTemplateGroup.dataset.videoAnalysisTemplateMoveGroup || "").split(":");
    run.store.update((state) => ({
      ...state,
      template: moveCodingGroupByStep(state.template || {}, groupLabel, Number(direction || 0)),
      codingSession: codingTemplateBuilderPatch(state, { selectedGroup: groupLabel }, true),
      message: "Tag group reordered.",
      error: "",
    }));
    return true;
  }
  const moveTemplateButton = target.closest("[data-video-analysis-template-move-button]");
  if (moveTemplateButton) {
    const [buttonId, direction] = String(moveTemplateButton.dataset.videoAnalysisTemplateMoveButton || "").split(":");
    const button = findTemplateButton(run.store.getState().template || {}, buttonId);
    run.store.update((state) => ({
      ...state,
      template: moveCodingButtonByStep(state.template || {}, buttonId, Number(direction || 0)),
      codingSession: codingTemplateBuilderPatch(state, {
        selectedGroup: button?.group || state.codingSession?.templateBuilder?.selectedGroup || "Custom",
        selectedButtonId: buttonId,
      }, true),
      message: "Tag button reordered.",
      error: "",
    }));
    return true;
  }
  const colorPreset = target.closest("[data-video-analysis-button-color-preset]");
  if (colorPreset) {
    const [buttonId, color] = String(colorPreset.dataset.videoAnalysisButtonColorPreset || "").split(":");
    run.store.update((state) => ({
      ...state,
      template: updateCodingButtonField(state.template || {}, buttonId, "color", color),
      codingSession: codingTemplateBuilderPatch(state, { selectedButtonId: buttonId }, true),
      message: "Button color updated.",
      error: "",
    }));
    return true;
  }
  if (target.closest("[data-video-analysis-mg-principles-open]")) {
    run.store.update((state) => ({
      ...state,
      codingSession: {
        ...(state.codingSession || {}),
        miniGamePrinciplePickerOpen: true,
        miniGamePrincipleDraftIds: pickerVisibleMiniGamePrincipleIds(activeMiniGamePrincipleIds(state)),
        miniGamePrincipleSearch: "",
      },
      message: "",
      error: "",
    }));
    return true;
  }
  if (target.closest("[data-video-analysis-mg-principles-close]")) {
    run.store.update((state) => ({
      ...state,
      codingSession: { ...(state.codingSession || {}), miniGamePrinciplePickerOpen: false, miniGamePrincipleSearch: "" },
    }));
    return true;
  }
  const miniGameToggle = target.closest("[data-video-analysis-mg-principle-toggle]");
  if (miniGameToggle) {
    const id = miniGameToggle.dataset.videoAnalysisMgPrincipleToggle;
    toggleMiniGamePrincipleForActiveClip(id, context);
    return true;
  }
  if (target.closest("[data-video-analysis-mg-principles-clear]")) {
    run.store.update((state) => ({
      ...state,
      codingSession: {
        ...(state.codingSession || {}),
        miniGamePrincipleDraftIds: [],
        miniGamePrinciplePickerOpen: true,
        miniGamePrincipleSearch: "",
      },
    }));
    return true;
  }
  if (target.closest("[data-video-analysis-mg-principles-apply]")) {
    saveMiniGamePrinciplesForActiveClip(context);
    return true;
  }
  const codeButton = target.closest("[data-video-analysis-code-button]");
  if (codeButton) {
    applyCodeButton(codeButton.dataset.videoAnalysisCodeButton, context);
    return true;
  }
  const playerTagButton = target.closest("[data-video-analysis-player-tag]");
  if (playerTagButton) {
    applyPlayerQuickTag(playerTagButton.dataset.videoAnalysisPlayerTag, context);
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
        selectedCategory: {
          ...(current.timeline?.selectedCategory || {}),
          keyboardDeleteScope: "clip",
        },
      },
      presentation: {
        ...(current.presentation || {}),
        selectedClipId: clip?.id || current.presentation?.selectedClipId || "",
      },
    }));
    return true;
  }
  const tagFilterTrigger = target.closest("[data-video-analysis-tag-filter-trigger]");
  if (tagFilterTrigger) {
    run.store.update((state) => ({
      ...state,
      timeline: {
        ...(state.timeline || {}),
        laneMode: "tags",
        tagFilterOpen: true,
      },
    }));
    return true;
  }
  if (target.closest("[data-video-analysis-tag-filter-close]")) {
    run.store.update((state) => ({
      ...state,
      timeline: {
        ...(state.timeline || {}),
        tagFilterOpen: false,
      },
    }));
    return true;
  }
  const tagFilterButton = target.closest("[data-video-analysis-tag-filter]");
  if (tagFilterButton) {
    const kind = tagFilterButton.dataset.videoAnalysisTagFilterKind || "";
    const value = tagFilterButton.dataset.videoAnalysisTagFilterValue || "";
    if (kind === "tag" || kind === "ownerId") {
      loadClips({ ...run.store.getState().filters, [kind]: value });
    }
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
          keyboardDeleteScope: "category",
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
    const currentState = run.store.getState();
    const item = presentationQueue(currentState.presentation?.current).find((entry) => entry.id === itemId);
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        selectedItemId: itemId,
        selectedClipId: item?.clipId || state.presentation?.selectedClipId || "",
        activeSectionId: item?.sectionId || state.presentation?.activeSectionId || "",
      },
    }));
    if (currentState.presentation?.mode === "presenter" && item) {
      const clip = item.clip || {};
      seekVideoToMs(videoElement(context), item.startMs ?? clip.startMs ?? clip.start_ms ?? 0);
    }
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
      if (state.activeAnalysisRoomTab === "presentation" || state.activeAnalysisRoomTab === "match-report") {
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
  const clipLibraryPlayButton = target.closest("[data-video-analysis-clip-library-play]");
  if (clipLibraryPlayButton) {
    const clipId = clipLibraryPlayButton.dataset.videoAnalysisClipLibraryPlay || "";
    run.store.update((state) => {
      return {
        ...state,
        ...clipLibraryPreviewPatch(state, [clipId], 0),
      };
    });
    return true;
  }
  if (target.closest("[data-video-analysis-clip-library-play-selected]")) {
    run.store.update((state) => {
      const selectedIds = new Set((Array.isArray(state.clipLibrary?.selectedClipIds) ? state.clipLibrary.selectedClipIds : [])
        .map((id) => String(id || ""))
        .filter(Boolean));
      if (!selectedIds.size) return { ...state, message: "Select clips first." };
      const visibleClips = filterClipsForMatrix(
        state.clips || [],
        state.matrix?.mode,
        state.matrix?.selectedRow,
        state.matrix?.selectedColumn
      );
      const orderedVisibleIds = buildClipLibraryClipOrder(visibleClips, state.clipLibrary?.groupBy || "subPhase");
      const hiddenSelectedIds = [...selectedIds].filter((id) => !orderedVisibleIds.includes(id));
      const queueIds = [...orderedVisibleIds.filter((id) => selectedIds.has(id)), ...hiddenSelectedIds];
      return {
        ...state,
        ...clipLibraryPreviewPatch(state, queueIds, 0),
      };
    });
    return true;
  }
  if (target.closest("[data-video-analysis-clip-library-clear-selected]")) {
    run.store.update((state) => ({
      ...state,
      clipLibrary: {
        ...(state.clipLibrary || {}),
        selectedClipIds: [],
      },
    }));
    return true;
  }
  if (target.closest("[data-video-analysis-clip-library-preview-close]")) {
    run.store.update((state) => ({
      ...state,
      clipLibrary: {
        ...(state.clipLibrary || {}),
        previewClipId: "",
        previewQueueIds: [],
        previewActiveIndex: 0,
      },
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
  if (target.closest("[data-video-analysis-drawing-add]")) {
    return drawingControls(context).addLayerAtPoint();
  }
  const selectDrawingButton = target.closest("[data-video-analysis-drawing-select]");
  if (selectDrawingButton) {
    return drawingControls(context).selectLayer(selectDrawingButton.dataset.videoAnalysisDrawingSelect || "");
  }
  const removeDrawingButton = target.closest("[data-video-analysis-drawing-remove]");
  if (removeDrawingButton) {
    return drawingControls(context).removeLayer(removeDrawingButton.dataset.videoAnalysisDrawingRemove || "");
  }
  if (target.closest("[data-video-analysis-drawing-save]")) {
    saveSelectedDrawingLayers(context);
    return true;
  }
  if (target.closest("[data-video-analysis-drawing-undo]")) {
    return drawingControls(context).undo();
  }
  if (target.closest("[data-video-analysis-drawing-redo]")) {
    return drawingControls(context).redo();
  }
  if (target.closest("[data-video-analysis-presenter-next]") || target.closest("[data-video-analysis-presenter-prev]")) {
    const direction = target.closest("[data-video-analysis-presenter-next]") ? 1 : -1;
    return presenterControls(context).step(direction);
  }
  if (target.closest("[data-video-analysis-presenter-fullscreen]")) {
    return presenterControls(context).enterFullscreen();
  }
  if (target.closest("[data-video-analysis-presenter-freeze]")) {
    return presenterControls(context).toggleFreeze();
  }
  const presenterNudge = target.closest("[data-video-analysis-presenter-nudge]");
  if (presenterNudge) {
    const video = videoElement(context);
    const deltaSeconds = Number(presenterNudge.dataset.videoAnalysisPresenterNudge || 0) / 1000;
    if (video && Number.isFinite(deltaSeconds)) {
      video.currentTime = Math.max(0, Number(video.currentTime || 0) + deltaSeconds);
    }
    return true;
  }
  if (target.closest("[data-video-analysis-thumbnail-cache-clear]")) {
    thumbnails(context).clearCache();
    return true;
  }
  const archiveButton = target.closest("[data-video-analysis-archive]");
  if (archiveButton) {
    run.clips.archive(archiveButton.dataset.videoAnalysisArchive).then(() => loadClips()).catch((error) => {
      run.store.setState({ error: error.message || "Could not archive clip." });
    });
    return true;
  }
  const shareClipButton = target.closest("[data-video-analysis-share-clip]");
  if (shareClipButton) {
    const [clipId, visibility] = String(shareClipButton.dataset.videoAnalysisShareClip || "").split(":");
    run.store.setState({ status: "saving-clip", error: "" });
    run.clips.share(clipId, visibility || "team").then((payload = {}) => {
      const savedClip = normalizeClipInstance(payload.clip || {});
      run.store.update((current) => ({
        ...replaceClipInState(current, savedClip),
        status: "ready",
        selectedClipId: savedClip.id || current.selectedClipId,
        message: savedClip.visibility === "private" ? "Clip is private." : "Clip shared.",
        error: "",
      }));
      return loadClips();
    }).catch((error) => {
      run.store.setState({ status: "error", error: error.message || "Could not update clip sharing." });
    });
    return true;
  }
  if (target.closest("[data-video-analysis-clear-filters]")) {
    loadClips({ search: "", phase: "", subPhase: "", playerId: "", ownerId: "", tag: "", miniGamePrincipleId: "", outcome: "", unit: "", descriptorValue: "" });
    run.store.update((state) => ({ ...state, matrix: { ...(state.matrix || {}), selectedRow: "", selectedColumn: "" } }));
    return true;
  }
  const clipLibraryGroupButton = target.closest("[data-video-analysis-clip-library-group]");
  if (clipLibraryGroupButton) {
    run.store.update((state) => ({
      ...state,
      clipLibrary: {
        ...(state.clipLibrary || {}),
        groupBy: clipLibraryGroupButton.dataset.videoAnalysisClipLibraryGroup || "subPhase",
      },
    }));
    return true;
  }
  const clipLibraryAddGroupButton = target.closest("[data-video-analysis-clip-library-add-group]");
  if (clipLibraryAddGroupButton) {
    const groupBy = clipLibraryAddGroupButton.dataset.videoAnalysisClipLibraryAddGroup || "subPhase";
    const value = clipLibraryAddGroupButton.dataset.videoAnalysisClipLibraryGroupValue || "";
    run.store.update((state) => {
      const visible = filterClipsForMatrix(
        state.clips || [],
        state.matrix?.mode,
        state.matrix?.selectedRow,
        state.matrix?.selectedColumn
      );
      const clips = visible.filter((clip) => clipMatchesLibraryGroup(clip, groupBy, value));
      const sectionId = state.presentation?.activeSectionId || state.presentation?.current?.sections?.[0]?.id || "";
      const current = addClipsToPresentation(state.presentation?.current || createDefaultPresentation(), sectionId, clips);
      const firstItem = presentationQueue(current).find((item) => item.clipId === clips[0]?.id);
      return {
        ...state,
        message: clips.length ? `${clips.length} clips added to Presentation.` : "No clips in this group.",
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
      codingSession: { ...(state.codingSession || {}), templateDirty: true },
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
      codingSession: codingTemplateBuilderPatch(state, { selectedButtonId: buttonId }, true),
    }));
    return true;
  }
  const buttonMsField = target.closest("[data-video-analysis-button-ms-field]");
  if (buttonMsField) {
    const [buttonId, fieldName, mode] = String(buttonMsField.dataset.videoAnalysisButtonMsField || "").split(":");
    run.store.update((state) => ({
      ...state,
      template: updateCodingButtonMsField(state.template || {}, buttonId, fieldName, buttonMsField.value, mode),
      codingSession: codingTemplateBuilderPatch(state, { selectedButtonId: buttonId }, true),
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
  const smartDraft = target.closest("[data-video-analysis-smart-draft]");
  if (smartDraft) {
    const key = smartDraft.dataset.videoAnalysisSmartDraft;
    run.store.update((state) => {
      const draft = { ...(state.presentation?.smartCollectionDraft || {}), [key]: smartDraft.value };
      if (key === "visibility" && !state.presentation?.sharePanelTargetId) {
        draft.shareTargets = defaultShareTargets(smartDraft.value);
      }
      return {
        ...state,
        presentation: {
          ...(state.presentation || {}),
          smartCollectionDraft: draft,
        },
      };
    });
    return true;
  }
  const presentationShareDraft = target.closest("[data-video-analysis-presentation-share-draft]");
  if (presentationShareDraft) {
    const key = presentationShareDraft.dataset.videoAnalysisPresentationShareDraft;
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        presentationAccessOpen: true,
        presentationShareDraft: {
          ...(state.presentation?.presentationShareDraft || {}),
          [key]: presentationShareDraft.value,
        },
      },
    }));
    return true;
  }
  const presentationLibrarySearch = target.closest("[data-video-analysis-presentation-library-search]");
  if (presentationLibrarySearch) {
    run.store.update((state) => ({
      ...state,
      presentation: {
        ...(state.presentation || {}),
        librarySearch: presentationLibrarySearch.value,
      },
    }));
    return true;
  }
  const miniGamePrincipleSearch = target.closest("[data-video-analysis-mg-principle-search]");
  if (miniGamePrincipleSearch) {
    run.store.update((state) => ({
      ...state,
      codingSession: {
        ...(state.codingSession || {}),
        miniGamePrinciplePickerOpen: true,
        miniGamePrincipleSearch: miniGamePrincipleSearch.value,
      },
    }));
    return true;
  }
  const presentationFilter = target.closest("[data-video-analysis-presentation-filter]");
  if (presentationFilter) {
    const key = presentationFilter.dataset.videoAnalysisPresentationFilter;
    const filters = { ...(run.store.getState().presentation?.sourceFilters || {}), offset: 0, [key]: presentationFilter.value };
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
    const key = drawingField.dataset.videoAnalysisDrawingField;
    if (key === "text") drawingControls(context).updateSelectedLayer({ text: drawingField.value });
    else {
      run.store.update((state) => ({
        ...state,
        presentation: {
          ...(state.presentation || {}),
          drawingDraft: {
            ...(state.presentation?.drawingDraft || {}),
            [key]: drawingField.value,
          },
        },
      }));
    }
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
  const playbackRateSelect = target.closest("[data-video-analysis-playback-rate-select]");
  if (playbackRateSelect) {
    return setPlaybackRate(context, playbackRateSelect.value || 1);
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
  const clipLibrarySelect = target.closest("[data-video-analysis-clip-library-select]");
  if (clipLibrarySelect) {
    const clipId = String(clipLibrarySelect.dataset.videoAnalysisClipLibrarySelect || "").trim();
    if (!clipId) return true;
    run.store.update((state) => {
      const selected = new Set((Array.isArray(state.clipLibrary?.selectedClipIds) ? state.clipLibrary.selectedClipIds : [])
        .map((id) => String(id || ""))
        .filter(Boolean));
      if (clipLibrarySelect.checked) selected.add(clipId);
      else selected.delete(clipId);
      return {
        ...state,
        clipLibrary: {
          ...(state.clipLibrary || {}),
          selectedClipIds: [...selected],
        },
      };
    });
    return true;
  }
  return handleInput(event, context);
}

export function handleKeydown(event, context = {}) {
  const run = ensureRuntime(context);
  const root = getRoot(context);
  const state = run.store.getState();
  const keyTarget = eventElement(event);
  const mgPrincipleSearch = keyTarget?.closest?.("[data-video-analysis-mg-principle-search]");
  if (mgPrincipleSearch && event.key === "Enter") {
    const firstId = String(
      mgPrincipleSearch.dataset.videoAnalysisMgPrincipleSearchFirst
      || firstMiniGamePrincipleSearchMatchId(mgPrincipleSearch.value)
      || ""
    ).trim();
    if (firstId) {
      event.preventDefault?.();
      event.stopPropagation?.();
      toggleMiniGamePrincipleForActiveClip(firstId, context);
      return true;
    }
  }
  if (deleteTimelineSelectionByKeyboard(event, context)) return true;
  if (tabToAdjacentTimelineClip(event, context)) return true;
  if (
    state.activeAnalysisRoomTab === "fs-player"
    && event.key === " "
    && !shouldIgnoreShortcutTarget(event.target)
    && !event.metaKey
    && !event.ctrlKey
    && !event.altKey
  ) {
    event.preventDefault?.();
    event.stopPropagation?.();
    togglePlayback(context);
    return true;
  }
  const category = state.timeline?.selectedCategory || {};
  if (
    state.activeAnalysisRoomTab === "fs-player"
    && state.fsPlayer?.mode === "code"
    && event.key === "Escape"
  ) {
    event.preventDefault?.();
    event.stopPropagation?.();
    run.store.update((current) => ({
      ...current,
      fsPlayer: { ...(current.fsPlayer || {}), mode: "standard" },
    }));
    return true;
  }
  if (
    state.activeAnalysisRoomTab === "fs-player"
    && state.timeline?.tagFilterOpen
    && event.key === "Escape"
  ) {
    event.preventDefault?.();
    event.stopPropagation?.();
    run.store.update((current) => ({
      ...current,
      timeline: { ...(current.timeline || {}), tagFilterOpen: false },
    }));
    return true;
  }
  if (
    state.activeAnalysisRoomTab === "fs-player"
    && state.codingSession?.panelMode === "edit"
    && event.key === "Escape"
    && !shouldIgnoreShortcutTarget(event.target)
  ) {
    event.preventDefault?.();
    event.stopPropagation?.();
    run.store.update((current) => ({
      ...current,
      codingSession: { ...(current.codingSession || {}), panelMode: "use" },
    }));
    return true;
  }
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
      return presenterControls(context).step(1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault?.();
      return presenterControls(context).step(-1);
    }
    if (event.key === "Escape") {
      event.preventDefault?.();
      return presenterControls(context).exitToBuilder();
    }
    if (String(event.key || "").toLowerCase() === "f") {
      event.preventDefault?.();
      return presenterControls(context).enterFullscreen();
    }
  }
  return handleVideoAnalysisShortcut(event, {
    applyCodeButton: (buttonId) => applyCodeButton(buttonId, context),
    getCurrentMs: () => getVideoCurrentMs(videoElement(context)),
    getState: run.store.getState,
    root,
    saveDraftClip: () => saveDraftClip(context),
    togglePlayback: () => togglePlayback(context),
    trimSelectedClipByKeyboard: (payload) => trimSelectedClipByKeyboard(context, payload),
    update: run.store.update,
  });
}

export function handleKeyup(event, context = {}) {
  const state = ensureRuntime(context).store.getState();
  if (
    state.activeAnalysisRoomTab === "fs-player"
    && event.key === " "
    && !shouldIgnoreShortcutTarget(event.target)
    && !event.metaKey
    && !event.ctrlKey
    && !event.altKey
  ) {
    event.preventDefault?.();
    event.stopPropagation?.();
    return true;
  }
  return false;
}

export function handleSubmit(event, context = {}) {
  const target = eventElement(event);
  if (!target?.closest("[data-video-analysis-form]")) return false;
  event.preventDefault();
  saveDraftClip(context);
  return true;
}
