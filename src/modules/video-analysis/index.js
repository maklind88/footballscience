import { renderClipFilters } from "./components/ClipFilters.js";
import { confirmPlatformAction } from "../../core/platform-confirm-dialog.mjs";
import { renderClipList } from "./components/ClipList.js";
import { renderVideoLibrary } from "./components/VideoLibrary.js";
import { renderFsPlayerWorkspace } from "./components/FsPlayerWorkspace.js";
import {
  activeAnalysisRoomTab,
  renderAnalysisRoomHeader,
  renderClipLibraryWorkspace,
  renderPresentationWorkspace,
  renderTeamPerformanceWorkspace,
} from "./components/AnalysisRoomShell.js";
import { miniGamePrinciplePickerGroups, miniGamePrinciplePickerIds } from "./constants/miniGamePrinciples.js";
import { escapeHtml } from "./components/renderHelpers.js";
import { createDrawingController } from "./controllers/drawingController.js";
import { createPresentationController } from "./controllers/presentationController.js";
import { createPresenterController } from "./controllers/presenterController.js";
import { createThumbnailController } from "./controllers/thumbnailController.js";
import { createClipIntelligenceController } from "./controllers/clipIntelligenceController.js";
import { normalizeClipInstance } from "./domain/clipInstance.model.js";
import { normalizeTimelineWorkspace } from "./domain/timelineWorkspace.model.js";
import { createCodingTemplateRepository } from "./repositories/codingTemplateRepository.js";
import { createClipRepository } from "./repositories/clipRepository.js";
import { createClipIntelligenceRepository } from "./repositories/clipIntelligenceRepository.js";
import { createPlaylistRepository } from "./repositories/playlistRepository.js";
import { createPresentationRepository } from "./repositories/presentationRepository.js";
import { createVideoRepository } from "./repositories/videoRepository.js";
import {
  applyCodingButtonToClip,
  buildClipPayload,
  buildOutcomeOnlyClipPayload,
  buildPhaseOnlyClipPayload,
  buildPlayerOnlyClipPayload,
  buildUnitOnlyClipPayload,
  isMiniGamePrincipleOnlyClip,
  isPhaseOnlyClip,
  toApiClipPayload,
} from "./services/clipInstanceService.js";
import {
  clearTimelineClipSelection,
  clipsForTimelineSelection,
  editTimelineClip,
  mergeTimelineClips,
  popTimelineHistory,
  pushTimelineHistory,
  timelineSelectedClipIds,
  updateTimelineClipSelection,
  validateTimelineMerge,
} from "./services/clipEditingService.js";
import { buildClipLibraryClipOrder, clipEndMs, clipMatchesLibraryGroup, clipStartMs } from "./services/clipLibraryService.js";
import { filterClipsForMatrix, savedSearchTitle } from "./services/clipIntelligenceService.js";
import { clipsForIntelligenceState, resolveMatrixConfig } from "./services/clipAnalyticsService.js";
import { clipMatchesActiveVideo } from "./services/clipAnalysisFactService.js";
import { phaseForSubPhase } from "./services/footballLanguageService.js";
import {
  clipMiniGamePrincipleIds,
  miniGamePrincipleLabel,
  subPhaseForMiniGamePrinciple,
  uniqueMiniGamePrincipleIds,
  withMiniGamePrinciples,
} from "./services/miniGamePrincipleService.js";
import {
  addCodingButtonGroupToTemplate,
  addCodingButtonToTemplate,
  buildCodingButtonAction,
  canonicalCodingTargetField,
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
import {
  findReusableSameCategoryClip,
  resolveCodingTargetClip,
  resolveSameMomentCodingTargetClips,
  sameMomentTagWindowMs,
} from "./services/codingInteractionService.js";
import { handleVideoAnalysisShortcut } from "./services/keyboardShortcutService.js";
import {
  CODE_MODE_LAYOUT_VERSION,
  CODE_PIP_BOUND_MARGIN,
  CODE_PIP_MARGIN,
  CODE_PIP_MIN_HEIGHT,
  CODE_PIP_MIN_WIDTH,
  codePipConfig,
} from "./services/codePipLayoutService.js";
import { createLocalVideoReference, revokeLocalVideoReference } from "./services/localVideoBridgeService.js";
import { createPlayableLocalCopy } from "./services/localPlaybackTranscodeService.js";
import {
  activeMediaAngle,
  activeMediaReference,
  activeVideoTimeFromMatchMs,
  matchTimeFromActiveVideoMs,
} from "./services/mediaProductionService.js";
import { updateActiveMediaDurationState } from "./services/mediaPlaybackStateService.js";
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
import { createAnalysisReportPresentation } from "./services/analysisReportService.js";
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
import { normalizeUnitTagOptions, unitTagOptionsForState, withUnitTagOptions } from "./services/unitTagService.js";
import { describeVideoPlaybackError, getVideoCurrentMs, seekVideoToMs, toggleVideoPlayback } from "./services/videoPlaybackService.js";
import { createTimelineScrubController } from "./timeline/timeline.interaction.js";
import { findScheduleCandidate } from "./services/videoLibraryService.js";
import { bindPaintedVideoControls, bindRootEventFallback, eventElement } from "./video-analysis.dom-events.js";
import { createVideoAnalysisCollaborationRuntime } from "./video-analysis.collaboration-runtime.js";
import { createVideoLibraryController } from "./video-analysis.library-controller.js";
import { createVideoAnalysisStore } from "./video-analysis.store.js";
import { createVideoAnalysisTimelineWorkspaceRuntime } from "./video-analysis.timeline-workspace-runtime.js";
import { createVideoAnalysisTrackingRuntime } from "./video-analysis.tracking-runtime.js";
import { createVideoAnalysisSpatialRuntime } from "./video-analysis.spatial-runtime.js";
import { createVideoAnalysisMediaRuntime } from "./video-analysis.media-runtime.js";

let runtime = null;
let videoLibraryController = null;
let timelineScrubController = null;
let drawingController = null;
let presentationController = null;
let presenterController = null;
let thumbnailController = null;
let clipIntelligenceController = null;
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
const VIDEO_ANALYSIS_TOAST_DISMISS_MS = 1600;
const FS_PLAYER_HISTORY_GUARD_KEY = "__footballScienceFsPlayerHistoryGuard";
const FS_PLAYER_HISTORY_GUARD_DEPTH_KEY = "__footballScienceFsPlayerHistoryGuardDepth";
const FS_PLAYER_HISTORY_GUARD_DEPTH = 3;
const videoShuttleTimers = new WeakMap();
const videoShuttleSessions = new WeakMap();
const inFlightSubPhaseTagKeys = new Set();
const inFlightAutoPhaseTagKeys = new Set();
const pendingSubPhaseTagSaves = new Map();

function normalizePlaybackRate(value = 1) {
  const numeric = Number(value);
  return PLAYBACK_RATE_OPTIONS.includes(numeric) ? numeric : 1;
}

function getRoot(context = {}) {
  return context.ui?.analysisRoomWorkspace || null;
}

function createRuntime(context = {}) {
  const store = createVideoAnalysisStore(context);
  let collaborationRuntime = null;
  const timelineWorkspaceRuntime = createVideoAnalysisTimelineWorkspaceRuntime({
    context,
    getRuntime: () => runtime,
    getCollaborationRuntime: () => collaborationRuntime,
    shouldLoadMetadata,
  });
  collaborationRuntime = createVideoAnalysisCollaborationRuntime({
    context,
    repository: timelineWorkspaceRuntime.repository,
    getRuntime: () => runtime,
    loadClips,
    loadTimelineWorkspace: timelineWorkspaceRuntime.load,
  });
  const trackingRuntime = createVideoAnalysisTrackingRuntime({
    context,
    getRuntime: () => runtime,
    getVideoElement: () => videoElement(runtime?.context || context),
    getCurrentMatchMs: () => currentPlayheadMs(runtime?.context || context, runtime?.store.getState() || {}),
  });
  const spatialRuntime = createVideoAnalysisSpatialRuntime({
    context,
    getRuntime: () => runtime,
    getVideoElement: () => videoElement(runtime?.context || context),
  });
  const mediaRuntime = createVideoAnalysisMediaRuntime({
    context,
    getRuntime: () => runtime,
    getRoot: () => getRoot(runtime?.context || context),
    getVideoElement: () => videoElement(runtime?.context || context),
    getCurrentMatchMs: () => currentPlayheadMs(runtime?.context || context, runtime?.store.getState() || {}),
    seekToMatchMs: (matchMs) => timelineController(runtime?.context || context).seekToMs(matchMs, { commit: true }),
  });
  return {
    context,
    store,
    templates: createCodingTemplateRepository(context),
    clips: createClipRepository({
      ...context,
      getCollaborationContext: collaborationRuntime.operationContext,
    }),
    intelligence: createClipIntelligenceRepository(context),
    playlists: createPlaylistRepository(context),
    presentations: createPresentationRepository(context),
    timelines: timelineWorkspaceRuntime.repository,
    timelineWorkspaceRuntime,
    collaboration: collaborationRuntime.service,
    collaborationRuntime,
    tracking: trackingRuntime.repository,
    trackingRuntime,
    spatial: spatialRuntime.repository,
    spatialRuntime,
    mediaProduction: mediaRuntime.repository,
    mediaRuntime,
    videos: createVideoRepository(context),
    unsubscribe: null,
    keydownBound: false,
    lifecycleBound: false,
    wheelGuardBound: false,
    pointerGuardBound: false,
    historyGuardBound: false,
    fullscreenBound: false,
    codePipInteraction: null,
    toastDismissTimer: null,
    toastDismissMessage: "",
    fsPlayerHistoryGuardArmed: false,
    fsPlayerHistoryGuardDepth: 0,
    fsPlayerPointerInsideShuttle: false,
    workspaceObserver: null,
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
      videoToTimelineMs: (videoMs, state) => matchTimeFromActiveVideoMs(state, videoMs),
      timelineToVideoMs: (timelineMs, state) => activeVideoTimeFromMatchMs(state, timelineMs),
      updateState: (updater) => runtime?.store.update(updater),
    });
  }
  return timelineScrubController;
}

function workspaceTimelineController(context = {}) {
  return ensureRuntime(context).timelineWorkspaceRuntime.controller;
}

function drawingControls(context = {}) {
  if (!drawingController) {
    drawingController = createDrawingController({
      getRoot: () => getRoot(runtime?.context || context),
      getState: () => runtime?.store.getState() || {},
      getVideoElement: () => videoElement(runtime?.context || context),
      getCurrentMatchMs: () => currentPlayheadMs(runtime?.context || context, runtime?.store.getState() || {}),
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

function intelligenceControls(context = {}) {
  if (!clipIntelligenceController) {
    clipIntelligenceController = createClipIntelligenceController({
      getRuntime: () => runtime,
      getWindow: () => runtime?.context?.win || context.win || window,
      loadPresentationSources,
    });
  }
  ensureRuntime(runtime?.context || context);
  return clipIntelligenceController;
}

function updateVideoDuration(durationMs = 0) {
  const safeDurationMs = Math.round(Number(durationMs || 0));
  if (!Number.isFinite(safeDurationMs) || safeDurationMs <= 0) return;
  const state = runtime?.store.getState();
  const activeReference = activeMediaReference(state || {});
  const currentDurationMs = Math.round(Number(activeReference?.durationMs || 0));
  if (!activeReference || currentDurationMs === safeDurationMs) return;
  runtime?.store.update((current) => updateActiveMediaDurationState(current, safeDurationMs));
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
  const reference = activeMediaReference(state || {});
  const angle = activeMediaAngle(state || {});
  if (!reference || video?.error) return;
  if (!isCurrentVideoElement(video)) return;
  if (state.playbackPreparation?.active || state.status === "preparing-playback") return;
  const preparedPlayback = isPreparedPlaybackUrl(reference.objectUrl);
  const nextStatus = preparedPlayback ? "prepared" : "native-ready";
  updateVideoDurationFromElement(video);
  if (angle && !angle.primary) {
    runtime?.store.update((current) => ({
      ...current,
      status: "ready",
      error: "",
      mediaProduction: { ...(current.mediaProduction || {}), error: "" },
    }));
    runtime?.mediaRuntime?.controller.syncSecondaryVideos(video);
    return;
  }
  if (state.nativePlaybackReady && state.localFileStatus === nextStatus && !state.error) return;
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
  const reference = activeMediaReference(state || {}) || state?.videoRef;
  const angle = activeMediaAngle(state || {});
  const message = reference?.playbackCompatibility?.warning || describeVideoPlaybackError(video, reference);
  if (!message) return;
  if (state?.status === "error" && state.error === message) return;
  if (angle && !angle.primary) {
    runtime?.store.update((current) => ({
      ...current,
      mediaProduction: { ...(current.mediaProduction || {}), error: message },
    }));
    return;
  }
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

function analysisRoomWorkspaceView(context = {}) {
  return getRoot(context)?.closest?.(".workspace-view") || null;
}

function isAnalysisRoomWorkspaceActive(context = {}) {
  const view = analysisRoomWorkspaceView(context);
  return !view || view.classList.contains("is-active");
}

function isFsPlayerInteractionActive(context = {}, state = {}) {
  return Boolean(
    isAnalysisRoomWorkspaceActive(context)
    && state.view === "workspace"
    && activeAnalysisRoomTab(state) === "fs-player"
  );
}

function fsPlayerVideoFrameElement(context = {}) {
  return getRoot(context)?.querySelector(".video-analysis-fs-player-deck .video-analysis-video-frame") || null;
}

function fsPlayerPlayerElement(context = {}) {
  return getRoot(context)?.querySelector(".video-analysis-fs-player-deck .video-analysis-player") || null;
}

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

function codePipBounds(context = {}) {
  const workspace = fsPlayerWorkspaceElement(context);
  const rect = workspace?.getBoundingClientRect?.();
  const win = context.win || window;
  const width = Math.max(CODE_PIP_MIN_WIDTH + (CODE_PIP_MARGIN * 2), Number(rect?.width || win.innerWidth || 1280));
  const height = Math.max(CODE_PIP_MIN_HEIGHT + (CODE_PIP_MARGIN * 2), Number(rect?.height || win.innerHeight || 720));
  return { width, height };
}

function normalizeCodePipBox(box = {}, context = {}) {
  const config = codePipConfig(box.target);
  const bounds = codePipBounds(context);
  const maxWidth = Math.max(config.minWidth, bounds.width - (CODE_PIP_BOUND_MARGIN * 2));
  const maxHeight = Math.max(config.minHeight, bounds.height - (CODE_PIP_BOUND_MARGIN * 2));
  const width = clampNumber(box.width, config.minWidth, maxWidth);
  const height = clampNumber(box.height, config.minHeight, maxHeight);
  const x = clampNumber(box.x, CODE_PIP_BOUND_MARGIN, Math.max(CODE_PIP_BOUND_MARGIN, bounds.width - width - CODE_PIP_BOUND_MARGIN));
  const y = clampNumber(box.y, CODE_PIP_BOUND_MARGIN, Math.max(CODE_PIP_BOUND_MARGIN, bounds.height - height - CODE_PIP_BOUND_MARGIN));
  return {
    target: config.target,
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function resizeCodePipBox(startBox = {}, direction = "se", dx = 0, dy = 0, context = {}) {
  const config = codePipConfig(startBox.target);
  const bounds = codePipBounds(context);
  const normalizedDirection = String(direction || "se").toLowerCase();
  const minX = CODE_PIP_BOUND_MARGIN;
  const minY = CODE_PIP_BOUND_MARGIN;
  const maxX = Math.max(minX, bounds.width - CODE_PIP_BOUND_MARGIN);
  const maxY = Math.max(minY, bounds.height - CODE_PIP_BOUND_MARGIN);
  let left = Number(startBox.x || 0);
  let top = Number(startBox.y || 0);
  let right = left + Number(startBox.width || config.minWidth);
  let bottom = top + Number(startBox.height || config.minHeight);

  if (normalizedDirection.includes("w")) {
    left = clampNumber(left + dx, minX, Math.max(minX, right - config.minWidth));
  }
  if (normalizedDirection.includes("e")) {
    right = clampNumber(right + dx, Math.min(maxX, left + config.minWidth), maxX);
  }
  if (normalizedDirection.includes("n")) {
    top = clampNumber(top + dy, minY, Math.max(minY, bottom - config.minHeight));
  }
  if (normalizedDirection.includes("s")) {
    bottom = clampNumber(bottom + dy, Math.min(maxY, top + config.minHeight), maxY);
  }

  return normalizeCodePipBox({
    target: config.target,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }, context);
}

function codeModeDefaultLayout(context = {}) {
  const win = context.win || globalThis.window;
  const viewportWidth = Math.max(720, Number(win?.innerWidth || 1280));
  const viewportHeight = Math.max(520, Number(win?.innerHeight || 720));
  const edge = Math.round(clampNumber(Math.min(viewportWidth, viewportHeight) * 0.006, 4, 8));
  const gutter = Math.round(clampNumber(viewportWidth * 0.003, 2, 6));
  const codeRatio = viewportWidth >= 1800 ? 0.18 : viewportWidth >= 1280 ? 0.21 : 0.27;
  const codeWidth = Math.round(clampNumber(viewportWidth * codeRatio, 260, 390));
  const timelineHeight = Math.round(clampNumber(viewportHeight * 0.16, 104, 168));
  const upperHeight = Math.max(CODE_PIP_MIN_HEIGHT, viewportHeight - timelineHeight - edge);
  const deckX = edge + codeWidth + gutter;
  const deckWidth = Math.max(CODE_PIP_MIN_WIDTH, viewportWidth - deckX - edge);
  const deckHeight = upperHeight;
  return {
    codeWindowPip: normalizeCodePipBox({
      target: "code-window",
      x: edge,
      y: edge,
      width: codeWidth,
      height: upperHeight,
    }, context),
    pip: normalizeCodePipBox({
      target: "video",
      x: deckX,
      y: edge,
      width: deckWidth,
      height: deckHeight,
    }, context),
    timelinePip: normalizeCodePipBox({
      target: "timeline",
      x: 0,
      y: viewportHeight - timelineHeight,
      width: viewportWidth,
      height: timelineHeight,
    }, context),
  };
}

function codeModeLayoutPatch(context = {}, currentFsPlayer = {}, options = {}) {
  if (!options.force && Number(currentFsPlayer.codeModeLayoutVersion || 0) === CODE_MODE_LAYOUT_VERSION) {
    return {};
  }
  const layout = codeModeDefaultLayout(context);
  return {
    pip: layout.pip,
    timelinePip: layout.timelinePip,
    codeWindowPip: layout.codeWindowPip,
    codeModeLayoutVersion: CODE_MODE_LAYOUT_VERSION,
  };
}

function codePipBoxFromElement(deck = null, context = {}) {
  const workspace = fsPlayerWorkspaceElement(context);
  const deckRect = deck?.getBoundingClientRect?.();
  const workspaceRect = workspace?.getBoundingClientRect?.();
  const target = codePipConfig(deck?.getAttribute?.("data-video-analysis-code-pip")).target;
  if (!deckRect || !workspaceRect) return normalizeCodePipBox({ target }, context);
  return normalizeCodePipBox({
    target,
    x: deckRect.left - workspaceRect.left,
    y: deckRect.top - workspaceRect.top,
    width: deckRect.width,
    height: deckRect.height,
  }, context);
}

function applyCodePipBox(deck = null, box = {}) {
  if (!deck?.style) return;
  const target = box.target || deck.getAttribute?.("data-video-analysis-code-pip");
  const config = codePipConfig(target);
  deck.style.setProperty(`${config.cssPrefix}-x`, `${box.x}px`);
  deck.style.setProperty(`${config.cssPrefix}-y`, `${box.y}px`);
  deck.style.setProperty(`${config.cssPrefix}-width`, `${box.width}px`);
  deck.style.setProperty(`${config.cssPrefix}-height`, `${box.height}px`);
}

function clearToastDismissTimer(run = runtime) {
  if (!run?.toastDismissTimer) return;
  const winRef = run.context?.win || globalThis.window;
  winRef?.clearTimeout?.(run.toastDismissTimer);
  run.toastDismissTimer = null;
}

function scheduleToastDismiss(context = {}, state = {}) {
  const run = ensureRuntime(context);
  const winRef = context.win || globalThis.window;
  const message = String(state.message || "");
  if (!message || state.error || !winRef?.setTimeout) {
    clearToastDismissTimer(run);
    run.toastDismissMessage = "";
    return;
  }
  if (run.toastDismissTimer && run.toastDismissMessage === message) return;
  clearToastDismissTimer(run);
  run.toastDismissMessage = message;
  run.toastDismissTimer = winRef.setTimeout(() => {
    run.toastDismissTimer = null;
    run.toastDismissMessage = "";
    run.store.update((current) => {
      if (current.message !== message || current.error) return current;
      return { ...current, message: "" };
    });
  }, VIDEO_ANALYSIS_TOAST_DISMISS_MS);
}

function isCodePipBlockedDragTarget(target = null) {
  if (!target?.closest) return true;
  return Boolean(target.closest([
    "button",
    "input",
    "textarea",
    "select",
    "option",
    "a[href]",
    "[contenteditable='true']",
    "[data-video-analysis-code-pip-resize]",
    "[data-video-analysis-timeline-module]",
    "[data-video-analysis-timeline-pan]",
    "[data-video-analysis-timeline-ruler]",
    "[data-video-analysis-timeline-scrub]",
    "[data-video-analysis-timeline-scrub-surface]",
    "[data-video-analysis-timeline-track]",
    "[data-video-analysis-timeline-lane-select]",
    "[data-video-analysis-seek]",
    "[data-video-analysis-drawing-surface]",
  ].join(",")));
}

function startCodePipInteraction(event = {}, context = {}) {
  const target = eventElement(event);
  const resizeHandle = target?.closest?.("[data-video-analysis-code-pip-resize]");
  const dragHandle = target?.closest?.("[data-video-analysis-code-pip-drag]");
  const dragDeck = !resizeHandle && !dragHandle && !isCodePipBlockedDragTarget(target)
    ? target?.closest?.("[data-video-analysis-code-pip]")
    : null;
  const handle = resizeHandle || dragHandle || dragDeck;
  if (!handle) return false;
  const run = ensureRuntime(context);
  const state = run.store.getState();
  if (state.fsPlayer?.mode !== "code") return false;
  const deck = dragDeck || handle.closest?.("[data-video-analysis-code-pip]");
  if (!deck) return false;
  const pipTarget = codePipConfig(deck.getAttribute?.("data-video-analysis-code-pip")).target;
  const startBox = codePipBoxFromElement(deck, context);
  run.codePipInteraction = {
    target: pipTarget,
    type: resizeHandle ? "resize" : "move",
    direction: resizeHandle?.dataset?.videoAnalysisCodePipResize || "se",
    pointerId: event.pointerId,
    pointerHandle: handle,
    startX: Number(event.clientX || 0),
    startY: Number(event.clientY || 0),
    startBox,
    deck,
  };
  handle.setPointerCapture?.(event.pointerId);
  event.preventDefault?.();
  return true;
}

function updateCodePipInteraction(event = {}, context = {}) {
  const run = ensureRuntime(context);
  const interaction = run.codePipInteraction;
  if (!interaction?.deck) return false;
  const dx = Number(event.clientX || 0) - interaction.startX;
  const dy = Number(event.clientY || 0) - interaction.startY;
  let nextBox;
  if (interaction.type === "resize") {
    nextBox = resizeCodePipBox(interaction.startBox, interaction.direction, dx, dy, context);
  } else {
    nextBox = {
      ...interaction.startBox,
      x: interaction.startBox.x + dx,
      y: interaction.startBox.y + dy,
    };
  }
  applyCodePipBox(interaction.deck, normalizeCodePipBox({ ...nextBox, target: interaction.target }, context));
  event.preventDefault?.();
  return true;
}

function finishCodePipInteraction(event = {}, context = {}) {
  const run = ensureRuntime(context);
  const interaction = run.codePipInteraction;
  if (!interaction?.deck) return false;
  const nextPip = codePipBoxFromElement(interaction.deck, context);
  const config = codePipConfig(interaction.target);
  const storedPip = {
    x: nextPip.x,
    y: nextPip.y,
    width: nextPip.width,
    height: nextPip.height,
  };
  run.codePipInteraction = null;
  interaction.pointerHandle?.releasePointerCapture?.(interaction.pointerId);
  run.store.update((state) => ({
    ...state,
    fsPlayer: {
      ...(state.fsPlayer || {}),
      [config.stateKey]: storedPip,
    },
  }));
  event.preventDefault?.();
  return true;
}

function fsPlayerHistoryGuardState(state = {}, depth = 1) {
  return {
    ...((state && typeof state === "object") ? state : {}),
    [FS_PLAYER_HISTORY_GUARD_KEY]: true,
    [FS_PLAYER_HISTORY_GUARD_DEPTH_KEY]: depth,
  };
}

function armFsPlayerHistoryGuard(context = {}) {
  const win = context.win || globalThis.window;
  const run = ensureRuntime(context);
  const state = run.store.getState();
  if (!isFsPlayerInteractionActive(context, state)) return false;
  if (!win?.history?.pushState || !win.location?.href) return false;
  try {
    const currentState = win.history.state;
    const currentDepth = currentState?.[FS_PLAYER_HISTORY_GUARD_KEY]
      ? Math.max(0, Number(currentState?.[FS_PLAYER_HISTORY_GUARD_DEPTH_KEY] || 1))
      : 0;
    if (currentDepth >= FS_PLAYER_HISTORY_GUARD_DEPTH) {
      run.fsPlayerHistoryGuardArmed = true;
      run.fsPlayerHistoryGuardDepth = currentDepth;
      return true;
    }
    for (let depth = currentDepth + 1; depth <= FS_PLAYER_HISTORY_GUARD_DEPTH; depth += 1) {
      win.history.pushState(fsPlayerHistoryGuardState(win.history.state, depth), "", win.location.href);
    }
    run.fsPlayerHistoryGuardArmed = true;
    run.fsPlayerHistoryGuardDepth = FS_PLAYER_HISTORY_GUARD_DEPTH;
    return true;
  } catch {
    return false;
  }
}

function shouldAbsorbFsPlayerHistoryNavigation(context = {}, state = {}) {
  if (!isFsPlayerInteractionActive(context, state)) return false;
  return true;
}

function syncFsPlayerGestureContainment(context = {}, state = {}) {
  const doc = context.doc || getRoot(context)?.ownerDocument || document;
  const body = doc?.body;
  const root = doc?.documentElement;
  if (!body?.classList || !root?.classList) return;
  const isActive = isFsPlayerInteractionActive(context, state);
  const isCodeMode = isActive && state.fsPlayer?.mode === "code";
  const isFullscreen = isActive && state.fsPlayer?.fullscreen === true;
  [root, body].forEach((element) => {
    element.classList.toggle("is-video-analysis-fs-player-active", isActive);
    element.classList.toggle("is-video-analysis-fs-player-code-mode", isCodeMode);
    element.classList.toggle("is-video-analysis-fs-player-fullscreen", isFullscreen);
  });
  if (isActive) {
    armFsPlayerHistoryGuard(context);
  } else if (!isActive) {
    const run = ensureRuntime(context);
    run.fsPlayerHistoryGuardArmed = false;
    run.fsPlayerHistoryGuardDepth = 0;
    run.fsPlayerPointerInsideShuttle = false;
  }
}

function fsPlayerOwnsFullscreen(context = {}) {
  const fullscreenElement = (context.doc || document)?.fullscreenElement || null;
  const workspace = fsPlayerWorkspaceElement(context);
  return Boolean(
    fullscreenElement
    && workspace
    && (
      fullscreenElement === workspace
      || workspace.contains?.(fullscreenElement)
      || fullscreenElement.contains?.(workspace)
    )
  );
}

function fsPlayerFullscreenRequestElement(context = {}) {
  const doc = context.doc || getRoot(context)?.ownerDocument || document;
  return doc?.documentElement || doc?.body || fsPlayerWorkspaceElement(context) || fsPlayerVideoFrameElement(context);
}

function requestNativeFullscreen(element) {
  if (!element?.requestFullscreen) return Promise.resolve(false);
  return element.requestFullscreen({ navigationUI: "hide" }).then(() => true).catch(() => false);
}

function exitNativeFullscreen(context = {}) {
  const docRef = context.doc || document;
  if (!docRef?.fullscreenElement || !docRef?.exitFullscreen) return Promise.resolve(false);
  return docRef.exitFullscreen().then(() => true).catch(() => false);
}

function setFsPlayerFullscreenState(context = {}, fullscreen = false, patch = {}) {
  const run = ensureRuntime(context);
  run.store.update((state) => ({
    ...state,
    fsPlayer: {
      ...(state.fsPlayer || {}),
      fullscreen: Boolean(fullscreen),
    },
    ...patch,
  }));
}

function exitFsPlayerFullscreen(context = {}, options = {}) {
  setFsPlayerFullscreenState(context, false, {
    message: options.message ?? "",
    error: "",
  });
  if (options.native !== false) {
    exitNativeFullscreen(context);
  }
  return true;
}

function enterVideoFullscreen(context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  if (state.fsPlayer?.fullscreen === true || fsPlayerOwnsFullscreen(context)) {
    return exitFsPlayerFullscreen(context, { native: true });
  }
  const element = fsPlayerFullscreenRequestElement(context);
  if (!element) {
    run.store.setState({ error: "Video area is not available yet.", message: "" });
    return false;
  }
  requestNativeFullscreen(element).then((ok) => {
    if (!isFsPlayerInteractionActive(context, run.store.getState())) return;
    if (!ok && !fsPlayerOwnsFullscreen(context)) {
      setFsPlayerFullscreenState(context, true, {
        message: "Fullscreen mode ready.",
        error: "",
      });
      return;
    }
    setFsPlayerFullscreenState(context, true, {
      message: "",
      error: "",
    });
  });
  return true;
}

function enterFsPlayerCodeMode(context = {}) {
  const run = ensureRuntime(context);
  run.store.update((state) => ({
    ...state,
    fsPlayer: {
      ...(state.fsPlayer || {}),
      ...codeModeLayoutPatch(context, state.fsPlayer || {}),
      mode: "code",
      fullscreen: false,
    },
    message: "Code Mode ready.",
    error: "",
  }));
  if (!fsPlayerOwnsFullscreen(context)) {
    requestNativeFullscreen(fsPlayerFullscreenRequestElement(context)).then((ok) => {
      const current = run.store.getState();
      if (!ok || current.fsPlayer?.mode !== "code") return;
      run.store.update((state) => ({
        ...state,
        fsPlayer: {
          ...(state.fsPlayer || {}),
          ...codeModeLayoutPatch(context, state.fsPlayer || {}, { force: true }),
          mode: "code",
          fullscreen: false,
        },
        message: "",
        error: "",
      }));
    });
  }
  return true;
}

function exitFsPlayerCodeMode(context = {}, options = {}) {
  const run = ensureRuntime(context);
  run.store.update((state) => ({
    ...state,
    fsPlayer: {
      ...(state.fsPlayer || {}),
      mode: "standard",
      fullscreen: false,
    },
    message: "Code Mode closed.",
    error: "",
  }));
  if (options.native !== false) {
    exitNativeFullscreen(context);
  }
  return true;
}

function toggleFsPlayerCodeMode(context = {}) {
  const run = ensureRuntime(context);
  const isActive = run.store.getState().fsPlayer?.mode === "code";
  return isActive ? exitFsPlayerCodeMode(context) : enterFsPlayerCodeMode(context);
}

function nudgePlayer(context = {}, deltaMs = 0) {
  const video = videoElement(context);
  if (!video) return false;
  const state = ensureRuntime(context).store.getState();
  const nextMs = Math.max(0, matchTimeFromActiveVideoMs(state, getVideoCurrentMs(video)) + Math.round(Number(deltaMs || 0)));
  timelineController(context).seekToMs(nextMs, { commit: false });
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
  if (videoMs > 0 || Number(video?.readyState || 0) > 0) return matchTimeFromActiveVideoMs(state, videoMs);
  return Math.max(0, Math.round(Number(state.timeline?.playheadMs || 0)));
}

function wheelDeltaPixelValue(value = 0, deltaMode = 0) {
  const numeric = Number(value || 0);
  if (!numeric) return 0;
  if (Number(deltaMode) === 1) return numeric * 16;
  if (Number(deltaMode) === 2) return numeric * 800;
  return numeric;
}

function wheelDeltaX(event = {}) {
  if ("deltaX" in event) return Number(event.deltaX || 0);
  const wheelDeltaXValue = Number(event.wheelDeltaX || 0);
  return wheelDeltaXValue ? -wheelDeltaXValue : 0;
}

function wheelDeltaY(event = {}) {
  if ("deltaY" in event) return Number(event.deltaY || 0);
  const wheelDeltaYValue = Number(event.wheelDeltaY || event.wheelDelta || 0);
  return wheelDeltaYValue ? -wheelDeltaYValue : 0;
}

function videoShuttleHorizontalDelta(event = {}) {
  const deltaMode = Number(event.deltaMode || 0);
  const deltaX = wheelDeltaPixelValue(wheelDeltaX(event), deltaMode);
  const deltaY = wheelDeltaPixelValue(wheelDeltaY(event), deltaMode);
  if (event.shiftKey && Math.abs(deltaY) >= VIDEO_SHUTTLE_MIN_DELTA_PX) return deltaY;
  if (Math.abs(deltaX) < Math.max(VIDEO_SHUTTLE_MIN_DELTA_PX, Math.abs(deltaY) * VIDEO_SHUTTLE_DOMINANCE_RATIO)) return 0;
  return deltaX;
}

function videoShuttleHasHorizontalIntent(event = {}) {
  const deltaMode = Number(event.deltaMode || 0);
  const deltaX = wheelDeltaPixelValue(wheelDeltaX(event), deltaMode);
  const deltaY = wheelDeltaPixelValue(wheelDeltaY(event), deltaMode);
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
  const state = ensureRuntime(context).store.getState();
  const currentMs = matchTimeFromActiveVideoMs(state, getVideoCurrentMs(video));
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

function forcePauseVideoShuttle(frame = null, context = {}) {
  if (!frame) return;
  const session = videoShuttleSessions.get(frame);
  const winRef = session?.winRef || context.win || globalThis.window;
  if (session?.timer && winRef?.clearTimeout) winRef.clearTimeout(session.timer);
  if (session?.frameId && winRef?.cancelAnimationFrame) winRef.cancelAnimationFrame(session.frameId);
  if (session?.video) {
    session.video.playbackRate = session.basePlaybackRate || 1;
    session.video.muted = session.wasMuted;
    session.video.pause?.();
    timelineController(context).handleVideoTimeUpdate(session.video);
    commitVideoShuttlePlayhead(context, session.video);
    syncPlaybackControls(context, session.video, false);
  }
  frame.classList.remove("is-shuttle-scrubbing");
  videoShuttleSessions.delete(frame);
  videoShuttleTimers.delete(frame);
}

function pauseFsPlayerPlayback(context = {}) {
  const frame = fsPlayerVideoFrameElement(context);
  forcePauseVideoShuttle(frame, context);
  if (ensureRuntime(context).store.getState().fsPlayer?.fullscreen === true || fsPlayerOwnsFullscreen(context)) {
    exitFsPlayerFullscreen(context, { native: true, message: "" });
  }
  const video = videoElement(context);
  if (video) {
    video.pause?.();
    syncPlaybackControls(context, video, false);
    timelineController(context).handleVideoTimeUpdate(video);
    commitVideoShuttlePlayhead(context, video);
  }
  ensureRuntime(context).fsPlayerPointerInsideShuttle = false;
  return Boolean(video || frame);
}

function pauseFsPlayerIfInactive(context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  if (isFsPlayerInteractionActive(context, state)) return false;
  syncFsPlayerGestureContainment(context, state);
  return pauseFsPlayerPlayback(context);
}

function bindFsPlayerLifecycle(context = {}) {
  const run = ensureRuntime(context);
  const doc = context.doc || document;
  if (!run.lifecycleBound) {
    const view = analysisRoomWorkspaceView(context);
    if (view && typeof MutationObserver === "function") {
      run.workspaceObserver = new MutationObserver(() => pauseFsPlayerIfInactive(runtime?.context || context));
      run.workspaceObserver.observe(view, { attributes: true, attributeFilter: ["class", "hidden"] });
    }
    doc?.addEventListener?.("visibilitychange", () => {
      if (doc.hidden) pauseFsPlayerPlayback(runtime?.context || context);
    });
    run.lifecycleBound = true;
  }
  if (!run.fullscreenBound) {
    doc?.addEventListener?.("fullscreenchange", () => {
      const activeContext = runtime?.context || context;
      const activeRun = ensureRuntime(activeContext);
      const current = activeRun.store.getState();
      const ownsFullscreen = fsPlayerOwnsFullscreen(activeContext);
      if (current.fsPlayer?.mode === "code" && !ownsFullscreen) {
        exitFsPlayerCodeMode(activeContext, { native: false });
        return;
      }
      if (current.fsPlayer?.fullscreen === true && !ownsFullscreen) {
        setFsPlayerFullscreenState(activeContext, false, { message: "", error: "" });
      }
    });
    run.fullscreenBound = true;
  }
}

function bindFsPlayerHistoryGuard(context = {}) {
  const run = ensureRuntime(context);
  if (run.historyGuardBound) return;
  const win = context.win || window;
  win?.addEventListener?.("popstate", (event) => {
    const activeContext = runtime?.context || context;
    const activeRun = ensureRuntime(activeContext);
    const state = activeRun.store.getState();
    if (!activeRun.fsPlayerHistoryGuardArmed && !shouldAbsorbFsPlayerHistoryNavigation(activeContext, state)) return;
    if (!shouldAbsorbFsPlayerHistoryNavigation(activeContext, state)) {
      activeRun.fsPlayerHistoryGuardArmed = false;
      return;
    }
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
    armFsPlayerHistoryGuard(activeContext);
  }, true);
  run.historyGuardBound = true;
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

function updateFsPlayerPointerGuard(event = {}, context = {}) {
  const run = ensureRuntime(context);
  const target = eventElement(event);
  const player = fsPlayerPlayerElement(context);
  const isInside = Boolean(target && player?.contains?.(target));
  run.fsPlayerPointerInsideShuttle = isInside;
  if (isInside) {
    armFsPlayerHistoryGuard(context);
  }
}

function fsPlayerGlobalWheelFrame(event = {}, context = {}, state = {}) {
  const target = eventElement(event);
  const frame = fsPlayerVideoFrameElement(context);
  const player = fsPlayerPlayerElement(context);
  if (!frame || !player) return null;
  if (fsPlayerOwnsFullscreen(context)) return frame;
  if (target && player.contains?.(target)) return frame;
  if (ensureRuntime(context).fsPlayerPointerInsideShuttle) return frame;
  if (state.fsPlayer?.mode === "code" && target && player.contains?.(target)) return frame;
  return null;
}

function fsPlayerWheelTargetInfo(event = {}, context = {}, state = {}) {
  const target = eventElement(event);
  const workspace = fsPlayerWorkspaceElement(context);
  const frame = fsPlayerVideoFrameElement(context);
  const player = fsPlayerPlayerElement(context);
  if (!workspace || !frame || !player) {
    return { shouldContain: false, frame: null, allowTimeline: false };
  }

  const ownsFullscreen = fsPlayerOwnsFullscreen(context);
  const targetInWorkspace = Boolean(target && workspace.contains?.(target));
  const targetInPlayer = Boolean(target && player.contains?.(target));
  const targetInTimeline = Boolean(target?.closest?.(
    ".video-analysis-fs-player-timeline, [data-video-analysis-timeline-module], [data-video-analysis-timeline-pan]"
  ));
  const pointerInsidePlayer = ensureRuntime(context).fsPlayerPointerInsideShuttle;
  const codeMode = state.fsPlayer?.mode === "code";
  const shouldContain = ownsFullscreen || codeMode || targetInWorkspace || targetInPlayer || pointerInsidePlayer;
  if (!shouldContain) {
    return { shouldContain: false, frame: null, allowTimeline: false };
  }
  if (targetInTimeline) {
    return { shouldContain: true, frame: null, allowTimeline: true };
  }
  const shouldShuttle = ownsFullscreen || targetInPlayer || pointerInsidePlayer || codeMode;
  return { shouldContain: true, frame: shouldShuttle ? frame : null, allowTimeline: false };
}

function handleFsPlayerGlobalWheel(event = {}, context = {}) {
  if (event.__videoAnalysisHandled) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (!videoShuttleHasHorizontalIntent(event)) return false;

  const run = ensureRuntime(context);
  const state = run.store.getState();
  if (!isFsPlayerInteractionActive(context, state)) return false;

  const target = eventElement(event);
  if (target?.closest?.("input, select, textarea, a")) return false;

  const targetInfo = fsPlayerWheelTargetInfo(event, context, state);
  if (!targetInfo.shouldContain) return false;

  armFsPlayerHistoryGuard(context);
  event.preventDefault?.();
  if (targetInfo.allowTimeline) return false;

  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
  event.__videoAnalysisHandled = true;

  const frame = targetInfo.frame || fsPlayerGlobalWheelFrame(event, context, state);
  if (!frame) return true;

  const video = videoElement(context);
  if (!video) return true;

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
  const previousFsPlayerVideo = root.querySelector(".video-analysis-fs-player-deck [data-video-analysis-video]");
  const previousVideo = previousFsPlayerVideo || root.querySelector("[data-video-analysis-video]");
  const previousSrc = previousVideo?.currentSrc || previousVideo?.src || "";
  const previousTime = Number(previousVideo?.currentTime || 0);
  const wasPlaying = Boolean(previousVideo && !previousVideo.paused && !previousVideo.ended);
  const parkedFsPlayerVideo = parkPaintedVideoForPaint(root, previousFsPlayerVideo, state);
  const focusedDraft = root.querySelector("[data-video-analysis-draft]:focus")?.dataset.videoAnalysisDraft || "";
  const focusedFilter = root.querySelector("[data-video-analysis-filter]:focus")?.dataset.videoAnalysisFilter || "";
  const focusedLibraryFilter = root.querySelector("[data-video-analysis-library-filter]:focus")?.dataset.videoAnalysisLibraryFilter || "";
  const focusedIntelligenceQuery = Boolean(root.querySelector("[data-video-analysis-intelligence-query]:focus"));
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
  const activeTabId = activeAnalysisRoomTab(state);
  const sourceClips = activeTabId === "match-report"
    ? clipsForIntelligenceState({ ...state, allClips: state.clips })
    : state.clips || [];
  const visibleClips = filterClipsForMatrix(
    sourceClips,
    state.matrix || {},
    state.matrix?.selectedRow,
    state.matrix?.selectedColumn
  );
  const displayState = { ...state, clips: visibleClips, allClips: sourceClips };
  syncFsPlayerGestureContainment(runtime?.context || {}, state);
  root.innerHTML = `
    <section class="analysis-room-shell">
      ${renderAnalysisRoomHeader(runtime?.context || {}, activeTabId)}
      <section class="analysis-room-tab-panel" aria-label="${escapeHtml(activeTabId === "team-performance" ? "Team Performance" : activeTabId === "presentation" ? "Presentation" : activeTabId === "match-report" ? "Clip Library" : activeTabId === "overview" ? "Overview" : "FS Player")}">
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
            ${activeTabId === "team-performance"
              ? renderTeamPerformanceWorkspace()
              : activeTabId === "presentation"
                ? renderPresentationWorkspace(state)
                : activeTabId === "match-report"
                  ? renderClipLibraryWorkspace(displayState)
                  : renderFsPlayerWorkspace(displayState)}
          `}
        </section>
      </section>
    </section>
  `;
  const timelineWorkspaceEditor = root.querySelector("[data-video-analysis-workspace-editor]");
  if (timelineWorkspaceEditor) root.appendChild(timelineWorkspaceEditor);
  bindPaintedVideoControls(root, {
    handleFileSelection,
    openLocalVideoPicker,
    handleWheel,
    preparePlayableCopy,
    restoreLocalVideoHandle,
    togglePlayback,
  });
  const video = preservePaintedVideoElement(root, parkedFsPlayerVideo || previousFsPlayerVideo) || root.querySelector("[data-video-analysis-video]");
  const nextFocus = focusedDraft
    ? root.querySelector(`[data-video-analysis-draft="${focusedDraft}"]`)
    : focusedFilter
      ? root.querySelector(`[data-video-analysis-filter="${focusedFilter}"]`)
      : focusedLibraryFilter
        ? root.querySelector(`[data-video-analysis-library-filter="${focusedLibraryFilter}"]`)
        : focusedIntelligenceQuery
          ? root.querySelector("[data-video-analysis-intelligence-query]")
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
    bindVideoRuntimeHandlers(video, runtime?.context || context);
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
    await run.timelineWorkspaceRuntime.load({ matchId: state.match?.id || state.videoRef?.matchId || "" });
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
      const pendingArchiveIds = new Set(uniqueClipIds(current.timeline?.pendingArchiveClipIds || []));
      const visibleClips = pendingArchiveIds.size
        ? clips.filter((clip) => !pendingArchiveIds.has(String(clip.id || "")))
        : clips;
      return {
        ...current,
        status: preservePlaybackPreparation ? current.status : "ready",
        clips: visibleClips,
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

function orderedSelectedClipLibraryClips(state = {}) {
  const selectedIds = new Set((Array.isArray(state.clipLibrary?.selectedClipIds) ? state.clipLibrary.selectedClipIds : [])
    .map((id) => String(id || ""))
    .filter(Boolean));
  const source = state.intelligence?.active
    ? clipsForIntelligenceState(state)
    : (Array.isArray(state.allClips) && state.allClips.length ? state.allClips : state.clips || []);
  const orderedIds = buildClipLibraryClipOrder(source, state.clipLibrary?.groupBy || "subPhase");
  const byId = new Map(source.map((clip) => [String(clip.id || ""), clip]));
  const visible = orderedIds.filter((id) => selectedIds.has(id)).map((id) => byId.get(id)).filter(Boolean);
  const visibleIds = new Set(visible.map((clip) => String(clip.id || "")));
  return [
    ...visible,
    ...source.filter((clip) => selectedIds.has(String(clip.id || "")) && !visibleIds.has(String(clip.id || ""))),
  ];
}

function presentationFromClipLibrarySelection(state = {}, kind = "playlist") {
  if (kind === "report") {
    return createAnalysisReportPresentation(state, currentClipsForReport(state));
  }
  const clips = orderedSelectedClipLibraryClips(state);
  let current = createDefaultPresentation();
  current = {
    ...current,
    title: "FS Player Playlist",
    purpose: "clip-playlist",
    metadata: {
      source: "clip-library-selection",
      filters: { ...(state.filters || {}) },
    },
  };
  current = updatePresentationSection(current, "opening", { title: "Playlist" });
  current = addClipsToPresentation(current, "opening", clips);
  return { current, activeSectionId: "opening", clips };
}

function currentClipsForReport(state = {}) {
  return state.intelligence?.corpus?.length
    ? state.intelligence.corpus
    : (Array.isArray(state.allClips) && state.allClips.length ? state.allClips : state.clips || []);
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

function videoSourceOf(video) {
  return String(video?.currentSrc || video?.src || video?.getAttribute?.("src") || "");
}

function shouldParkPaintedVideoForPaint(previousVideo, state = {}) {
  if (!previousVideo || previousVideo.error) return false;
  if (!previousVideo.classList?.contains("video-analysis-video")) return false;
  if (state.view !== "workspace" || activeAnalysisRoomTab(state) !== "fs-player") return false;
  if (state.fsPlayer?.mode !== "code" && state.fsPlayer?.fullscreen !== true) return false;
  const nextSrc = String(activeMediaReference(state)?.objectUrl || state.videoRef?.objectUrl || "");
  return Boolean(nextSrc && videoSourceOf(previousVideo) === nextSrc);
}

function videoParkingElement(root) {
  const doc = root?.ownerDocument || document;
  if (!doc?.body) return null;
  let parking = doc.querySelector("[data-video-analysis-video-parking]");
  if (!parking) {
    parking = doc.createElement("div");
    parking.dataset.videoAnalysisVideoParking = "1";
    parking.setAttribute("aria-hidden", "true");
    Object.assign(parking.style, {
      height: "1px",
      left: "-10000px",
      overflow: "hidden",
      pointerEvents: "none",
      position: "fixed",
      top: "-10000px",
      width: "1px",
    });
    doc.body.appendChild(parking);
  }
  return parking;
}

function parkPaintedVideoForPaint(root, previousVideo, state = {}) {
  if (!shouldParkPaintedVideoForPaint(previousVideo, state)) return null;
  const parking = videoParkingElement(root);
  if (!parking) return null;
  parking.appendChild(previousVideo);
  return previousVideo;
}

function shouldReusePaintedVideo(previousVideo, nextVideo) {
  if (!previousVideo || !nextVideo || previousVideo === nextVideo) return false;
  if (previousVideo.error) return false;
  if (!previousVideo.classList?.contains("video-analysis-video")) return false;
  if (!nextVideo.classList?.contains("video-analysis-video")) return false;
  const previousSrc = videoSourceOf(previousVideo);
  const nextSrc = videoSourceOf(nextVideo);
  return Boolean(previousSrc && nextSrc && previousSrc === nextSrc);
}

function copyRenderedVideoAttributes(fromVideo, toVideo) {
  if (!fromVideo || !toVideo) return;
  const nextNames = new Set(Array.from(fromVideo.attributes || []).map((attribute) => attribute.name));
  Array.from(toVideo.attributes || []).forEach((attribute) => {
    if (!nextNames.has(attribute.name)) toVideo.removeAttribute(attribute.name);
  });
  Array.from(fromVideo.attributes || []).forEach((attribute) => {
    if (attribute.name === "src" && videoSourceOf(toVideo) === attribute.value) return;
    toVideo.setAttribute(attribute.name, attribute.value);
  });
}

function preservePaintedVideoElement(root, previousVideo) {
  const nextVideo = root?.querySelector?.(".video-analysis-fs-player-deck [data-video-analysis-video]");
  if (!shouldReusePaintedVideo(previousVideo, nextVideo)) {
    if (previousVideo?.parentElement?.dataset?.videoAnalysisVideoParking === "1") previousVideo.remove();
    return nextVideo;
  }
  copyRenderedVideoAttributes(nextVideo, previousVideo);
  nextVideo.replaceWith(previousVideo);
  return previousVideo;
}

function bindVideoRuntimeHandlers(video, context = {}) {
  const effectiveContext = runtime?.context || context;
  video.ontimeupdate = () => {
    timelineController(effectiveContext).handleVideoTimeUpdate(video);
    runtime?.mediaRuntime?.controller.handleVideoTimeUpdate(video);
  };
  video.onloadedmetadata = () => {
    markNativePlaybackReady(video);
    runtime?.mediaRuntime?.controller.syncSecondaryVideos(video);
  };
  video.oncanplay = () => {
    markNativePlaybackReady(video);
    runtime?.mediaRuntime?.controller.syncSecondaryVideos(video);
  };
  video.onplay = () => {
    syncPlaybackControls(effectiveContext, video, true);
    runtime?.mediaRuntime?.controller.syncSecondaryVideos(video);
  };
  video.onplaying = () => {
    markNativePlaybackReady(video);
    syncPlaybackControls(effectiveContext, video, true);
    runtime?.mediaRuntime?.controller.syncSecondaryVideos(video);
  };
  video.onpause = () => {
    syncPlaybackControls(effectiveContext, video, false);
    runtime?.mediaRuntime?.controller.syncSecondaryVideos(video);
  };
  video.onended = () => {
    syncPlaybackControls(effectiveContext, video, false);
    runtime?.mediaRuntime?.controller.syncSecondaryVideos(video);
  };
  video.onerror = () => setVideoPlaybackError(video);
}

function currentPlayheadMs(context = {}, state = {}) {
  const video = videoElement(context);
  const timelineMs = Math.max(0, Math.round(Number(state.timeline?.playheadMs ?? state.draft?.startMs ?? 0)));
  if (!video) return timelineMs;
  const videoMs = getVideoCurrentMs(video);
  const videoReady = Number(video.readyState || 0) > 0 || videoMs > 0;
  return videoReady ? matchTimeFromActiveVideoMs(state, videoMs) : timelineMs;
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
  const id = String(clipId || "").trim();
  if (!id) return null;
  return [...(state.clips || []), ...(state.allClips || [])].find((item) => String(item.id || "") === id) || null;
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

function buildMiniGamePrincipleCapture(state = {}, startMs = 0, targetClip = null) {
  const durationMs = defaultMomentTagDurationMs(state);
  const draft = state.draft || {};
  const clip = targetClip || {};
  const players = Array.isArray(clip.players) ? clip.players : [];
  const player = players[0] || null;
  return {
    startMs: Math.max(0, Math.round(Number(startMs || 0))),
    durationMs,
    targetClipId: clip.id || "",
    period: clip.period || draft.period || "1",
    phase: clip.phase || clip.phase_id || draft.phase || "",
    subPhase: clip.subPhase || clip.sub_phase || draft.subPhase || "",
    teamPrincipleId: clip.teamPrincipleId || clip.team_principle_id || draft.teamPrincipleId || "",
    outcome: clip.outcome || draft.outcome || "",
    playerId: player?.playerId || player?.player_id || draft.playerId || "",
    playerRole: player?.role || draft.playerRole || "primary",
    unit: draft.unit || "",
    pitchZone: draft.pitchZone || "",
    pressure: draft.pressure || "",
    decision: draft.decision || "",
    execution: draft.execution || "",
    visibility: clip.visibility || draft.visibility || draft.clipVisibility || "private",
  };
}

function closeMiniGamePrinciplePickerState(state = {}) {
  return {
    ...state,
    codingSession: {
      ...(state.codingSession || {}),
      miniGamePrinciplePickerOpen: false,
      miniGamePrincipleSearch: "",
      miniGamePrincipleCapture: null,
    },
  };
}

function defaultMomentTagDurationMs(state = {}) {
  return Math.max(1000, Number(state.template?.defaultClipDurationMs || state.codingSession?.defaultClipDurationMs || 15000));
}

function closeUnitPickerState(state = {}) {
  return {
    ...state,
    codingSession: {
      ...(state.codingSession || {}),
      unitPickerOpen: false,
      unitEditorOpen: false,
      unitEditorDraft: [],
      unitCapture: null,
    },
  };
}

function closeUnitEditorState(state = {}) {
  return {
    ...state,
    codingSession: {
      ...(state.codingSession || {}),
      unitEditorOpen: false,
      unitEditorDraft: [],
    },
  };
}

function nextUnitEditorLabel(options = []) {
  const labels = new Set((Array.isArray(options) ? options : [])
    .map((option) => String(option || "").trim().toLowerCase())
    .filter(Boolean));
  if (!labels.has("new unit")) return "New unit";
  let index = 2;
  while (labels.has(`new unit ${index}`)) index += 1;
  return `New unit ${index}`;
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
      const sourceClip = run.store.getState().clips.find((clip) => clip.id === clipId);
      const result = await run.clips.trim({
        id: clipId,
        startMs: payload.startMs,
        endMs: payload.endMs,
        expectedRevision: sourceClip?.revision || null,
      });
      const savedClip = normalizeClipInstance(result.clip || {});
      const startMs = savedClip.startMs ?? payload.startMs;
      const endMs = savedClip.endMs ?? payload.endMs;
      run.store.update((current) => pushTimelineHistory({
        ...(
          stateHasClipTimes(current, clipId, payload.startMs, payload.endMs)
            ? patchClipTimesInState(current, clipId, startMs, endMs)
            : current
        ),
        selectedClipId: clipId,
        message: "Clip timing updated.",
        error: "",
      }, {
        type: "trim",
        clipId,
        before: { startMs: payload.originalStartMs, endMs: payload.originalEndMs },
        after: { startMs, endMs },
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

function clipIdsWithout(ids = [], removeIds = []) {
  const removeSet = new Set(uniqueClipIds(removeIds));
  return uniqueClipIds(ids).filter((id) => !removeSet.has(id));
}

function removePendingArchiveClipIdsFromState(state = {}, clipIds = []) {
  const pendingArchiveClipIds = clipIdsWithout(state.timeline?.pendingArchiveClipIds, clipIds);
  return {
    ...state,
    timeline: {
      ...(state.timeline || {}),
      pendingArchiveClipIds,
    },
  };
}

function clipByIdFromState(state = {}, clipId = "") {
  const targetId = String(clipId || "");
  return (Array.isArray(state.clips) ? state.clips : []).find((clip) => String(clip.id || "") === targetId)
    || (Array.isArray(state.allClips) ? state.allClips : []).find((clip) => String(clip.id || "") === targetId)
    || null;
}

function deletedTimelineNavigationAnchor(state = {}, clipIds = []) {
  const ids = uniqueClipIds(clipIds);
  if (!ids.length) return null;
  const activeId = String(state.selectedClipId || state.timeline?.selectedCategory?.activeClipId || "");
  const anchorId = ids.includes(activeId) ? activeId : ids[0];
  const position = findTimelineClipPosition(state, anchorId);
  const clip = position?.lane?.clips?.[position.clipIndex] || clipByIdFromState(state, anchorId);
  if (!clip?.id || !position?.laneMode || !position?.lane?.label) return null;
  return {
    clipId: String(clip.id || ""),
    laneMode: position.laneMode,
    label: position.lane.label,
    startMs: clipStartMs(clip),
    endMs: clipEndMs(clip),
  };
}

function removeArchivedClipIdsFromState(state = {}, clipIds = [], options = {}) {
  const archivedIds = new Set(uniqueClipIds(clipIds));
  if (!archivedIds.size) return state;
  const filterClips = (clips = []) => (Array.isArray(clips) ? clips.filter((clip) => !archivedIds.has(String(clip.id || ""))) : clips);
  const selectedClipId = archivedIds.has(String(state.selectedClipId || "")) ? "" : state.selectedClipId;
  const timelineClipSelection = timelineSelectedClipIds(state)
    .filter((id) => !archivedIds.has(String(id || "")));
  const pendingArchiveClipIds = uniqueClipIds([
    ...(Array.isArray(state.timeline?.pendingArchiveClipIds) ? state.timeline.pendingArchiveClipIds : []),
    ...archivedIds,
  ]);
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
      selectedClipIds: timelineClipSelection,
      editorOpen: timelineClipSelection.length === 1 ? Boolean(state.timeline?.editorOpen) : false,
      pendingArchiveClipIds,
      navigationAnchor: options.navigationAnchor || state.timeline?.navigationAnchor || null,
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
  const stateBeforeArchive = run.store.getState();
  const archivedClips = ids.map((id) => clipByIdFromState(stateBeforeArchive, id)).filter(Boolean);
  const navigationAnchor = deletedTimelineNavigationAnchor(stateBeforeArchive, ids);
  try {
    run.store.update((state) => ({
      ...removeArchivedClipIdsFromState(state, ids, { ...options, navigationAnchor }),
      status: "saving-clip",
      message: ids.length === 1 ? "Deleting timeline tag." : `Deleting ${ids.length} timeline tags.`,
      error: "",
    }));
    if (ids.length === 1) await run.clips.archive(ids[0]);
    else await run.clips.archiveMany(ids);
    run.store.update((state) => ({
      ...removeArchivedClipIdsFromState(state, ids, { ...options, navigationAnchor }),
      status: "ready",
      message: ids.length === 1 ? "Timeline tag deleted." : `${ids.length} timeline tags deleted.`,
      error: "",
    }));
    await loadClips();
    run.store.update((state) => pushTimelineHistory(
      removePendingArchiveClipIdsFromState(state, ids),
      { type: "archive", clipIds: ids, clips: archivedClips }
    ));
    return true;
  } catch (error) {
    const errorMessage = error.message || "Could not delete timeline tag.";
    run.store.update((state) => ({
      ...removePendingArchiveClipIdsFromState(state, ids),
      status: "loading-clips",
      message: "",
      error: errorMessage,
    }));
    await loadClips();
    run.store.update((state) => ({
      ...state,
      status: "error",
      message: "",
      error: errorMessage,
    }));
    return false;
  }
}

async function saveTimelineClipEdits(context = {}, values = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  const clips = clipsForTimelineSelection(state);
  if (clips.length !== 1) {
    run.store.update((current) => ({ ...current, error: "Select one clip to edit." }));
    return false;
  }
  const before = normalizeClipInstance(clips[0]);
  const nextClip = editTimelineClip(before, values);
  try {
    run.store.update((current) => ({ ...current, status: "saving-clip", error: "", message: "Saving clip changes." }));
    const result = await run.clips.save(toApiClipPayload(nextClip));
    const savedClip = normalizeClipInstance(result.clip || nextClip);
    run.store.update((current) => pushTimelineHistory({
      ...replaceClipInState(current, savedClip),
      status: "ready",
      selectedClipId: savedClip.id,
      timeline: {
        ...(current.timeline || {}),
        selectedClipIds: [savedClip.id],
        editorOpen: false,
      },
      message: "Clip updated.",
      error: "",
    }, {
      type: "edit",
      clipId: savedClip.id,
      before,
      after: savedClip,
    }));
    return true;
  } catch (error) {
    run.store.update((current) => ({
      ...current,
      status: "error",
      error: error.message || "Could not update clip.",
    }));
    return false;
  }
}

async function mergeTimelineSelection(context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  const clips = clipsForTimelineSelection(state);
  const validation = validateTimelineMerge(clips);
  if (!validation.ok) {
    run.store.update((current) => ({ ...current, error: validation.reason }));
    return false;
  }
  const sourceClipIds = clips.map((clip) => clip.id).filter(Boolean);
  let savedClip = null;
  try {
    run.store.update((current) => ({ ...current, status: "saving-clip", error: "", message: "Merging clips." }));
    const mergedDraft = mergeTimelineClips(clips);
    const result = await run.clips.save(toApiClipPayload(mergedDraft));
    savedClip = normalizeClipInstance(result.clip || {});
    if (!savedClip.id) throw new Error("Merged clip could not be created.");
    try {
      await run.clips.archiveMany(sourceClipIds);
    } catch (archiveError) {
      await run.clips.archive(savedClip.id).catch(() => {});
      throw archiveError;
    }
    await loadClips();
    run.store.update((current) => pushTimelineHistory({
      ...current,
      status: "ready",
      selectedClipId: savedClip.id,
      timeline: {
        ...(current.timeline || {}),
        selectedClipIds: [savedClip.id],
        editorOpen: false,
        viewMode: "focus",
        selectedCategory: {
          ...(current.timeline?.selectedCategory || {}),
          activeClipId: savedClip.id,
          keyboardDeleteScope: "clip",
        },
      },
      message: `${sourceClipIds.length} clips merged.`,
      error: "",
    }, {
      type: "merge",
      sourceClipIds,
      sourceClips: clips.map(normalizeClipInstance),
      mergedClipId: savedClip.id,
    }));
    return true;
  } catch (error) {
    await loadClips().catch(() => {});
    run.store.update((current) => ({
      ...current,
      status: "error",
      error: error.message || "Could not merge clips.",
    }));
    return false;
  }
}

async function undoTimelineAction(context = {}) {
  const run = ensureRuntime(context);
  const currentState = run.store.getState();
  const history = Array.isArray(currentState.timeline?.history) ? currentState.timeline.history : [];
  const entry = history.at(-1);
  if (!entry) {
    run.store.update((current) => ({ ...current, message: "Nothing to undo." }));
    return false;
  }
  try {
    run.store.update((current) => ({ ...current, status: "saving-clip", error: "", message: "Undoing timeline change." }));
    let selectedClipIds = [];
    if (entry.type === "archive") {
      await run.clips.restoreMany(entry.clipIds || []);
      selectedClipIds = uniqueClipIds(entry.clipIds || []);
    } else if (entry.type === "merge") {
      await run.clips.restoreMany(entry.sourceClipIds || []);
      await run.clips.archive(entry.mergedClipId);
      selectedClipIds = uniqueClipIds(entry.sourceClipIds || []);
    } else if (entry.type === "trim") {
      await run.clips.trim({
        id: entry.clipId,
        startMs: entry.before?.startMs,
        endMs: entry.before?.endMs,
      });
      selectedClipIds = uniqueClipIds([entry.clipId]);
    } else if (entry.type === "edit") {
      const undoPayload = toApiClipPayload(entry.before || {});
      delete undoPayload.expectedRevision;
      await run.clips.save(undoPayload);
      selectedClipIds = uniqueClipIds([entry.clipId]);
    } else {
      throw new Error("This timeline action cannot be undone.");
    }
    await loadClips();
    run.store.update((current) => {
      const popped = popTimelineHistory(current).state;
      return {
        ...popped,
        status: "ready",
        selectedClipId: selectedClipIds.at(-1) || "",
        timeline: {
          ...(popped.timeline || {}),
          selectedClipIds,
          editorOpen: false,
          selectedCategory: {
            ...(popped.timeline?.selectedCategory || {}),
            activeClipId: selectedClipIds.at(-1) || "",
            keyboardDeleteScope: "clip",
          },
        },
        message: "Timeline change undone.",
        error: "",
      };
    });
    return true;
  } catch (error) {
    run.store.update((current) => ({
      ...current,
      status: "error",
      error: error.message || "Could not undo timeline change.",
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
  if (!count) return Promise.resolve(false);
  return confirmPlatformAction({
    eyebrow: "Video Analysis",
    title: "Delete timeline row?",
    message: `Delete the "${intent.label}" timeline row?\n\n${count} tag${count === 1 ? "" : "s"} will be archived and can be restored with Undo.`,
    confirmLabel: "Delete row",
    tone: "danger",
    win: context.win || window,
  });
}

function deleteTimelineSelectionByKeyboard(event = {}, context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  if (state.activeAnalysisRoomTab !== "fs-player" || !isTimelineDeleteKey(event) || shouldIgnoreShortcutTarget(event.target)) return false;
  const intent = timelineDeleteIntent(event, state, context);
  if (!intent) return false;
  event.preventDefault?.();
  event.stopPropagation?.();
  if (intent.type === "category") {
    void confirmTimelineCategoryDelete(intent, context).then((confirmed) => {
      if (!confirmed) return;
      void archiveTimelineClips(context, intent.clipIds, { clearCategory: true });
    });
    return true;
  }
  void archiveTimelineClips(context, intent.clipIds, { clearCategory: false });
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
      selectedClipIds: [clip.id],
      editorOpen: false,
      playheadMs: Math.max(0, Math.round(Number(startMs || 0))),
      selectedCategory: {
        ...(current.timeline?.selectedCategory || {}),
        laneMode: normalizeTimelineLaneMode(laneMode),
        label,
        activeClipId: clip.id,
        keyboardDeleteScope: "clip",
      },
      navigationAnchor: null,
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
        ...(current.timeline?.selectedCategory || {}),
        laneMode: normalizeTimelineLaneMode(laneMode),
        label,
        viewOpen: Boolean(current.timeline?.selectedCategory?.viewOpen),
        menuOpen: Boolean(current.timeline?.selectedCategory?.menuOpen),
        activeClipId: clip.id,
      },
    },
  }));
  return true;
}

function timelineCategoryMenuPosition(event = {}, context = {}) {
  const win = context.win || (typeof window !== "undefined" ? window : {});
  const menuWidth = 380;
  const menuHeight = 320;
  const viewportWidth = Math.max(menuWidth + 24, Number(win.innerWidth || 0) || menuWidth + 24);
  const viewportHeight = Math.max(menuHeight + 24, Number(win.innerHeight || 0) || menuHeight + 24);
  const rawX = Number(event.clientX || 0) || 12;
  const rawY = Number(event.clientY || 0) || 12;
  return {
    x: Math.max(12, Math.min(Math.round(rawX), viewportWidth - menuWidth - 12)),
    y: Math.max(12, Math.min(Math.round(rawY), viewportHeight - menuHeight - 12)),
  };
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

function firstAdjacentClipFromLane(lane = {}, anchorStartMs = 0, direction = 1) {
  const clips = Array.isArray(lane.clips) ? lane.clips : [];
  if (!clips.length) return null;
  if (direction < 0) {
    return clips.slice().reverse().find((clip) => clipStartMs(clip) <= anchorStartMs) || null;
  }
  return clips.find((clip) => clipStartMs(clip) >= anchorStartMs) || null;
}

function nextTimelineClipFromNavigationAnchor(state = {}, direction = 1) {
  const anchor = state.timeline?.navigationAnchor || null;
  if (!anchor?.laneMode || !anchor.label) return null;
  const { laneMode, lanes } = visibleTimelineLanes(state);
  if (laneMode !== normalizeTimelineLaneMode(anchor.laneMode) || !lanes.length) return null;
  const step = direction < 0 ? -1 : 1;
  const laneIndex = lanes.findIndex((lane) => lane.label === anchor.label);
  if (laneIndex !== -1) {
    const sameLaneClip = firstAdjacentClipFromLane(lanes[laneIndex], Number(anchor.startMs || 0), step);
    if (sameLaneClip?.id) return { lane: lanes[laneIndex], clip: sameLaneClip };
  }
  if (step > 0) {
    for (let index = Math.max(0, laneIndex + 1); index < lanes.length; index += 1) {
      if (lanes[index]?.clips?.length) return { lane: lanes[index], clip: lanes[index].clips[0] };
    }
    return null;
  }
  for (let index = (laneIndex === -1 ? lanes.length : laneIndex) - 1; index >= 0; index -= 1) {
    const clips = lanes[index]?.clips || [];
    if (clips.length) return { lane: lanes[index], clip: clips[clips.length - 1] };
  }
  return null;
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
  const direction = event.shiftKey ? -1 : 1;
  const next = position
    ? nextTimelineClipFromPosition(position, direction)
    : nextTimelineClipFromNavigationAnchor(state, direction);
  if (!next?.clip?.id) return false;
  event.preventDefault?.();
  event.stopPropagation?.();
  return selectTimelineClip(context, next.clip, position?.laneMode || state.timeline?.navigationAnchor?.laneMode || "", next.lane.label);
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
    contextmenu: handleContextMenu,
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
    run.unsubscribe = run.store.subscribe((state) => {
      scheduleToastDismiss(context, state);
      paint(root, state);
    });
  }
  bindFsPlayerLifecycle(context);
  bindFsPlayerHistoryGuard(context);
  if (!run.keydownBound) {
    const win = context.win || window;
    win.addEventListener?.("keydown", (event) => handleKeydown(event, context), true);
    win.addEventListener?.("keyup", (event) => handleKeyup(event, context), true);
    run.keydownBound = true;
  }
  if (!run.wheelGuardBound) {
    const win = context.win || window;
    const doc = context.doc || document;
    const wheelGuard = (event) => {
      handleFsPlayerGlobalWheel(event, runtime?.context || context);
    };
    [win, doc, root].forEach((surface) => {
      surface?.addEventListener?.("wheel", wheelGuard, { capture: true, passive: false });
      surface?.addEventListener?.("mousewheel", wheelGuard, { capture: true, passive: false });
    });
    run.wheelGuardBound = true;
  }
  if (!run.pointerGuardBound) {
    const win = context.win || window;
    const doc = context.doc || document;
    const pointerGuard = (event) => updateFsPlayerPointerGuard(event, runtime?.context || context);
    [win, doc, root].forEach((surface) => {
      surface?.addEventListener?.("pointerover", pointerGuard, true);
      surface?.addEventListener?.("pointermove", pointerGuard, true);
      surface?.addEventListener?.("mouseover", pointerGuard, true);
    });
    win.addEventListener?.("blur", () => {
      ensureRuntime(runtime?.context || context).fsPlayerPointerInsideShuttle = false;
    });
    run.pointerGuardBound = true;
  }
  const currentState = run.store.getState();
  scheduleToastDismiss(context, currentState);
  paint(root, currentState);
  if (run.store.getState().status === "idle") initialize(context);
}

export function resetVideoAnalysisRuntimeForTests() {
  clearToastDismissTimer(runtime);
  void runtime?.collaborationRuntime?.dispose?.();
  void runtime?.mediaRuntime?.dispose?.();
  runtime?.unsubscribe?.();
  runtime?.workspaceObserver?.disconnect?.();
  runtime?.context?.doc?.documentElement?.classList?.remove?.(
    "is-video-analysis-fs-player-active",
    "is-video-analysis-fs-player-code-mode",
    "is-video-analysis-fs-player-fullscreen"
  );
  runtime?.context?.doc?.body?.classList?.remove?.(
    "is-video-analysis-fs-player-active",
    "is-video-analysis-fs-player-code-mode",
    "is-video-analysis-fs-player-fullscreen"
  );
  runtime = null;
  videoLibraryController = null;
  timelineScrubController = null;
  drawingController = null;
  presentationController = null;
  presenterController = null;
  thumbnailController = null;
  clipIntelligenceController = null;
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
    return savedClip;
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
  return resolveCodingTargetClip(state, playheadMs);
}

function findClipsForSameMomentLabelAction(state = {}, playheadMs = 0) {
  return resolveSameMomentCodingTargetClips(state, playheadMs, {
    toleranceMs: 750,
    sameMomentToleranceMs: sameMomentTagWindowMs,
  });
}

function replaceClipsInState(current = {}, nextClips = []) {
  return nextClips.reduce((nextState, clip) => replaceClipInState(nextState, clip), current);
}

function clipMomentKey(clip = {}) {
  return String(clip.metadata?.momentKey || clip.metadata?.moment_key || "").trim();
}

function buildMomentKey(state = {}, startMs = 0) {
  const videoId = state.video?.id || state.videoId || "video";
  const bucketMs = Math.round(Math.max(0, Number(startMs || 0)) / 2000) * 2000;
  return `${videoId}:${bucketMs}`;
}

function momentKeyForTagAction(state = {}, playheadMs = 0) {
  const sameMoment = findClipsForSameMomentLabelAction(state, playheadMs);
  return sameMoment.map(clipMomentKey).find(Boolean) || buildMomentKey(state, playheadMs);
}

function subPhaseTagActionKey(state = {}, button = {}, startMs = 0, endMs = 0, momentKey = "") {
  return [
    state.match?.id || "",
    state.video?.id || "",
    button.databaseId || button.id || button.value || "",
    Math.max(0, Math.round(Number(startMs || 0))),
    Math.max(0, Math.round(Number(endMs || 0))),
    momentKey,
  ].join(":");
}

function reusableSubPhaseClipForTag(state = {}, subPhase = "", startMs = 0, endMs = 0, excludeIds = []) {
  return findReusableSameCategoryClip(state, {
    laneMode: "subPhase",
    label: subPhase,
    startMs,
    endMs,
    toleranceMs: sameMomentTagWindowMs,
    excludeIds,
  });
}

function pendingSubPhaseTagForMoment(state = {}, subPhase = "", startMs = 0) {
  const label = String(subPhase || "").trim();
  if (!label) return null;
  const matchId = String(state.match?.id || state.matchId || state.match_id || "").trim();
  const videoId = String(state.video?.id || state.videoId || state.video_id || "").trim();
  const targetStartMs = Math.max(0, Math.round(Number(startMs || 0)));
  return [...pendingSubPhaseTagSaves.values()].find((entry) => (
    entry
    && entry.subPhase === label
    && (!matchId || !entry.matchId || entry.matchId === matchId)
    && (!videoId || !entry.videoId || entry.videoId === videoId)
    && Math.abs(entry.startMs - targetStartMs) <= sameMomentTagWindowMs
  )) || null;
}

function registerPendingSubPhaseTagSave(key = "", state = {}, subPhase = "", startMs = 0, endMs = 0) {
  let resolvePending = () => {};
  const promise = new Promise((resolve) => {
    resolvePending = resolve;
  });
  const entry = {
    key,
    promise,
    resolve: resolvePending,
    matchId: String(state.match?.id || state.matchId || state.match_id || "").trim(),
    videoId: String(state.video?.id || state.videoId || state.video_id || "").trim(),
    subPhase: String(subPhase || "").trim(),
    startMs: Math.max(0, Math.round(Number(startMs || 0))),
    endMs: Math.max(0, Math.round(Number(endMs || 0))),
  };
  pendingSubPhaseTagSaves.set(key, entry);
  return entry;
}

function selectReusableSubPhaseClipState(current = {}, clip = {}, startMs = 0, message = "") {
  return {
    ...replaceClipInState(current, clip),
    status: "ready",
    selectedClipId: clip.id || current.selectedClipId,
    codingSession: {
      ...(current.codingSession || {}),
      lastClipId: clip.id || current.codingSession?.lastClipId || "",
    },
    timeline: {
      ...(current.timeline || {}),
      playheadMs: Math.max(0, Math.round(Number(startMs || clipStartMs(clip) || 0))),
    },
    message,
    error: "",
  };
}

function autoPhaseTagActionKey(state = {}, phase = "", startMs = 0, endMs = 0, momentKey = "") {
  return [
    state.match?.id || "",
    state.video?.id || "",
    String(phase || "").trim(),
    Math.max(0, Math.round(Number(startMs || 0))),
    Math.max(0, Math.round(Number(endMs || 0))),
    momentKey,
  ].join(":");
}

function hasAutoPhaseTagForMoment(state = {}, phase = "", startMs = 0, endMs = 0, momentKey = "") {
  const label = String(phase || "").trim();
  const start = Math.max(0, Math.round(Number(startMs || 0)));
  const end = Math.max(start + 1, Math.round(Number(endMs || start + 1)));
  return (state.clips || []).some((clip) => (
    isPhaseOnlyClip(clip)
    && String(clip.phase || clip.phase_id || "").trim() === label
    && Math.max(0, Math.round(Number(clip.startMs ?? clip.start_ms ?? 0))) === start
    && Math.max(0, Math.round(Number(clip.endMs ?? clip.end_ms ?? 0))) === end
    && (!momentKey || clipMomentKey(clip) === momentKey)
  ));
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
  if (state.codingSession?.miniGamePrincipleCapture) {
    run.store.update((current) => closeMiniGamePrinciplePickerState(current));
    return true;
  }
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

function openMiniGamePrincipleCapture(context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  if (!state.match?.id || !state.video?.id) {
    run.store.setState({
      status: "error",
      message: "",
      error: "Link a local match or training video before tagging MG principles.",
    });
    return false;
  }
  const currentMs = currentPlayheadMs(context, state);
  const video = videoElement(context);
  if (video) {
    try {
      video.pause();
    } catch {
      // Pausing is best-effort here; timestamp capture should still open if the browser rejects it.
    }
  }
  syncPlaybackControls(context, video, false);
  const targetClip = findClipForLabelAction(state, currentMs);
  const capture = { ...buildMiniGamePrincipleCapture(state, currentMs, targetClip), targetClipId: "" };
  run.store.update((current) => ({
    ...current,
    codingSession: {
      ...(current.codingSession || {}),
      mode: "instant",
      miniGamePrinciplePickerOpen: true,
      miniGamePrincipleDraftIds: [],
      miniGamePrincipleSearch: "",
      miniGamePrincipleCapture: capture,
    },
    timeline: {
      ...(current.timeline || {}),
      playheadMs: capture.startMs,
    },
    message: "MG timestamp captured. Choose one or more principles.",
    error: "",
  }));
  return true;
}

async function createMiniGamePrincipleTagFromCapture(principleId = "", context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  const id = String(principleId || "").trim();
  const capture = state.codingSession?.miniGamePrincipleCapture || null;
  if (!capture) return false;
  if (!id || !pickerMiniGamePrincipleIdSet.has(id)) return false;
  if (!state.match?.id || !state.video?.id) {
    run.store.setState({
      status: "error",
      message: "",
      error: "Link a local match or training video before tagging MG principles.",
    });
    return false;
  }
  const startMs = Math.max(0, Math.round(Number(capture.startMs || 0)));
  const durationMs = Math.max(1000, Number(capture.durationMs || defaultMomentTagDurationMs(state)));
  const endMs = startMs + durationMs;
  const subPhase = subPhaseForMiniGamePrinciple(id, capture.targetClipId ? capture.subPhase : "")
    || capture.subPhase
    || state.draft?.subPhase
    || "";
  const phase = phaseForSubPhase(subPhase, capture.phase || state.draft?.phase || "");
  const label = miniGamePrincipleLabel(id) || "MG principle";
  const targetClip = findClipInStateById(state, capture.targetClipId);
  const captureTargetIsMiniGameClip = Boolean(targetClip?.id && isMiniGamePrincipleOnlyClip(targetClip));
  const reusableMiniGameClip = findReusableSameCategoryClip(state, {
    laneMode: "miniGamePrinciple",
    label,
    startMs,
    endMs,
    toleranceMs: sameMomentTagWindowMs,
  });
  const targetPrincipleClip = captureTargetIsMiniGameClip
    ? targetClip
    : (reusableMiniGameClip?.id && isMiniGamePrincipleOnlyClip(reusableMiniGameClip) ? reusableMiniGameClip : null);
  const baseIds = pickerVisibleMiniGamePrincipleIds(
    state.codingSession?.miniGamePrincipleDraftIds?.length
      ? state.codingSession.miniGamePrincipleDraftIds
      : targetPrincipleClip
        ? clipMiniGamePrincipleIds(targetPrincipleClip)
        : []
  );
  const selectedIds = new Set(baseIds);
  const adding = !selectedIds.has(id) || !captureTargetIsMiniGameClip;
  if (adding) selectedIds.add(id);
  else selectedIds.delete(id);
  const nextIds = pickerVisibleMiniGamePrincipleIds([...selectedIds]);

  if (targetPrincipleClip?.id) {
    const nextClip = normalizeClipInstance(withMiniGamePrinciples(targetPrincipleClip, nextIds));
    run.store.update((current) => ({
      ...replaceClipInState(patchMiniGamePrincipleDraftState(current, nextIds), nextClip),
      status: "saving-clip",
      selectedClipId: nextClip.id,
      codingSession: {
        ...(current.codingSession || {}),
        miniGamePrincipleDraftIds: nextIds,
        miniGamePrinciplePickerOpen: true,
        miniGamePrincipleCapture: { ...capture, targetClipId: nextClip.id || capture.targetClipId || "" },
        lastClipId: nextClip.id,
      },
      message: `${label} ${adding ? "tagged on clip." : "removed from clip."}`,
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
          miniGamePrincipleCapture: { ...capture, targetClipId: savedClip.id || nextClip.id || capture.targetClipId || "" },
          lastClipId: savedClip.id,
        },
        message: savedIds.length ? "MG principles saved to clip." : "MG principles cleared from clip.",
        error: "",
      }));
      await loadClips();
      return true;
    } catch (error) {
      run.store.update((current) => ({
        ...replaceClipInState(current, targetPrincipleClip),
        status: "error",
        error: error.message || "Could not save MG principles.",
      }));
      return false;
    }
  }

  if (!nextIds.length) {
    run.store.update((current) => ({
      ...patchMiniGamePrincipleDraftState(current, nextIds),
      message: "No MG principles selected for this timestamp.",
      error: "",
    }));
    return true;
  }
  const nextState = {
    ...state,
    draft: {
      ...(state.draft || {}),
      startMs,
      endMs,
      period: capture.period || state.draft?.period || "1",
      phase,
      subPhase,
      teamPrincipleId: capture.teamPrincipleId || state.draft?.teamPrincipleId || "",
      outcome: capture.outcome || state.draft?.outcome || "",
      playerId: capture.playerId || state.draft?.playerId || "",
      playerRole: capture.playerRole || state.draft?.playerRole || "primary",
      unit: capture.unit || state.draft?.unit || "",
      pitchZone: capture.pitchZone || state.draft?.pitchZone || "",
      pressure: capture.pressure || state.draft?.pressure || "",
      decision: capture.decision || state.draft?.decision || "",
      execution: capture.execution || state.draft?.execution || "",
      visibility: capture.visibility || state.draft?.visibility || "private",
      clipVisibility: capture.visibility || state.draft?.clipVisibility || "private",
      miniGamePrincipleId: nextIds[0] || "",
      miniGamePrincipleIds: nextIds,
      tags: "",
      note: "",
      metadata: {
        clipKind: "miniGamePrinciple",
        momentKey: buildMomentKey(state, startMs),
        source: "mg-principle-capture",
      },
    },
    codingSession: {
      ...(state.codingSession || {}),
      mode: "instant",
      preRollMs: 0,
      postRollMs: durationMs,
      miniGamePrincipleDraftIds: nextIds,
      miniGamePrinciplePickerOpen: true,
      miniGamePrincipleCapture: capture,
    },
    timeline: {
      ...(state.timeline || {}),
      playheadMs: startMs,
    },
    message: `${label} ${adding ? "selected for timestamp." : "removed from timestamp."}`,
    error: "",
  };
  try {
    const clip = buildClipPayload(nextState);
    run.store.update(() => ({ ...nextState, status: "saving-clip" }));
    const payload = await run.clips.save(toApiClipPayload(clip));
    const savedClip = normalizeClipInstance(payload?.clip || clip);
    const savedIds = pickerVisibleMiniGamePrincipleIds(clipMiniGamePrincipleIds(savedClip));
    run.store.update((current) => ({
      ...current,
      draft: {
        ...(current.draft || {}),
        startMs,
        endMs,
        miniGamePrincipleId: savedIds[0] || "",
        miniGamePrincipleIds: savedIds,
      },
      codingSession: {
        ...(current.codingSession || {}),
        mode: "instant",
        preRollMs: 0,
        postRollMs: durationMs,
        miniGamePrincipleDraftIds: savedIds,
        miniGamePrinciplePickerOpen: true,
        miniGamePrincipleSearch: current.codingSession?.miniGamePrincipleSearch || state.codingSession?.miniGamePrincipleSearch || "",
        miniGamePrincipleCapture: { ...capture, targetClipId: savedClip.id || "" },
        lastClipId: savedClip.id || current.codingSession?.lastClipId || "",
      },
      selectedClipId: savedClip.id || current.selectedClipId,
      status: "ready",
      timeline: {
        ...(current.timeline || {}),
        playheadMs: startMs,
      },
      message: "MG principles saved to timestamp.",
      error: "",
    }));
    await loadClips();
    return true;
  } catch (error) {
    run.store.setState({ status: "error", message: "", error: error.message || "Could not save MG principles." });
    return false;
  }
}

async function toggleMiniGamePrincipleForActiveClip(principleId = "", context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  if (state.codingSession?.miniGamePrincipleCapture) {
    return createMiniGamePrincipleTagFromCapture(principleId, context);
  }
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

function openUnitCapture(context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  if (!state.match?.id || !state.video?.id) {
    run.store.setState({
      status: "error",
      message: "",
      error: "Link a local match or training video before tagging a unit.",
    });
    return false;
  }
  const currentMs = currentPlayheadMs(context, state);
  const video = videoElement(context);
  if (video) {
    try {
      video.pause();
    } catch {
      // Best-effort pause; the timestamp capture is still valid if playback rejects pause.
    }
  }
  syncPlaybackControls(context, video, false);
  const capture = {
    startMs: Math.max(0, Math.round(Number(currentMs || 0))),
    durationMs: defaultMomentTagDurationMs(state),
    period: state.draft?.period || "1",
    visibility: state.draft?.visibility || state.draft?.clipVisibility || "private",
  };
  run.store.update((current) => ({
    ...current,
    codingSession: {
      ...(current.codingSession || {}),
      mode: "instant",
      unitPickerOpen: true,
      unitCapture: capture,
    },
    timeline: {
      ...(current.timeline || {}),
      playheadMs: capture.startMs,
    },
    message: "Unit timestamp captured. Choose the involved unit.",
    error: "",
  }));
  return true;
}

function openUnitEditor(context = {}) {
  const run = ensureRuntime(context);
  run.store.update((state) => ({
    ...state,
    codingSession: {
      ...(state.codingSession || {}),
      unitEditorOpen: true,
      unitEditorDraft: unitTagOptionsForState(state),
    },
    message: "",
    error: "",
  }));
  return true;
}

function updateUnitEditorDraft(index = 0, value = "", context = {}) {
  const run = ensureRuntime(context);
  const draftIndex = Math.max(0, Number(index || 0));
  run.store.update((state) => {
    const draft = Array.isArray(state.codingSession?.unitEditorDraft)
      ? [...state.codingSession.unitEditorDraft]
      : unitTagOptionsForState(state);
    draft[draftIndex] = String(value ?? "");
    return {
      ...state,
      codingSession: {
        ...(state.codingSession || {}),
        unitEditorDraft: draft,
      },
    };
  });
  return true;
}

function addUnitEditorDraftOption(context = {}) {
  const run = ensureRuntime(context);
  run.store.update((state) => {
    const draft = Array.isArray(state.codingSession?.unitEditorDraft)
      ? [...state.codingSession.unitEditorDraft]
      : unitTagOptionsForState(state);
    return {
      ...state,
      codingSession: {
        ...(state.codingSession || {}),
        unitEditorOpen: true,
        unitEditorDraft: [...draft, nextUnitEditorLabel(draft)],
      },
      message: "",
      error: "",
    };
  });
  return true;
}

function removeUnitEditorDraftOption(index = 0, context = {}) {
  const run = ensureRuntime(context);
  const draftIndex = Math.max(0, Number(index || 0));
  run.store.update((state) => {
    const draft = Array.isArray(state.codingSession?.unitEditorDraft)
      ? [...state.codingSession.unitEditorDraft]
      : unitTagOptionsForState(state);
    const nextDraft = draft.filter((_, optionIndex) => optionIndex !== draftIndex);
    return {
      ...state,
      codingSession: {
        ...(state.codingSession || {}),
        unitEditorOpen: true,
        unitEditorDraft: nextDraft.length ? nextDraft : [""],
      },
      message: "",
      error: "",
    };
  });
  return true;
}

function saveUnitEditorOptions(context = {}) {
  const run = ensureRuntime(context);
  run.store.update((state) => {
    const draft = Array.isArray(state.codingSession?.unitEditorDraft)
      ? state.codingSession.unitEditorDraft
      : unitTagOptionsForState(state);
    const options = normalizeUnitTagOptions(draft);
    if (!options.length) {
      return {
        ...state,
        message: "",
        error: "Keep at least one unit button.",
      };
    }
    const currentUnit = String(state.draft?.unit || "").trim();
    const currentLastUnit = String(state.codingSession?.lastUnitTag || "").trim();
    const hasCurrentUnit = !currentUnit || options.includes(currentUnit);
    const hasLastUnit = !currentLastUnit || options.includes(currentLastUnit);
    return {
      ...state,
      template: withUnitTagOptions(state.template || {}, options),
      draft: {
        ...(state.draft || {}),
        unit: hasCurrentUnit ? currentUnit : "",
      },
      codingSession: {
        ...(state.codingSession || {}),
        unitEditorOpen: false,
        unitEditorDraft: [],
        lastUnitTag: hasLastUnit ? currentLastUnit : "",
        templateDirty: true,
      },
      message: "Unit buttons updated.",
      error: "",
    };
  });
  return true;
}

async function createUnitTagFromCapture(unit = "", context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  const label = String(unit || "").trim();
  const capture = state.codingSession?.unitCapture || null;
  if (!capture) return false;
  if (!unitTagOptionsForState(state).includes(label)) return false;
  if (!state.match?.id || !state.video?.id) {
    run.store.setState({ status: "error", message: "", error: "Link a local match or training video before tagging a unit." });
    return false;
  }
  const startMs = Math.max(0, Math.round(Number(capture.startMs || 0)));
  const durationMs = Math.max(1000, Number(capture.durationMs || defaultMomentTagDurationMs(state)));
  const momentKey = momentKeyForTagAction(state, startMs);
  let unitClip = null;
  try {
    unitClip = buildUnitOnlyClipPayload({
      ...state,
      draft: {
        ...(state.draft || {}),
        period: capture.period || state.draft?.period || "1",
        visibility: capture.visibility || state.draft?.visibility || "private",
        clipVisibility: capture.visibility || state.draft?.clipVisibility || "private",
      },
    }, label, startMs, durationMs, {
      momentKey,
      metadata: { source: "unit-button" },
    });
  } catch (error) {
    run.store.setState({ status: "error", message: "", error: error.message || "Could not tag unit." });
    return false;
  }
  run.store.update((current) => ({
    ...current,
    status: "saving-clip",
    codingSession: {
      ...(current.codingSession || {}),
      mode: "instant",
      unitPickerOpen: true,
      lastUnitTag: label,
    },
    draft: {
      ...(current.draft || {}),
      unit: label,
    },
    timeline: {
      ...(current.timeline || {}),
      playheadMs: startMs,
    },
    message: `${label} tagged.`,
    error: "",
  }));
  try {
    const payload = await run.clips.save(toApiClipPayload(unitClip));
    const savedClip = normalizeClipInstance(payload?.clip || unitClip);
    run.store.update((current) => ({
      ...replaceClipInState(closeUnitPickerState(current), savedClip),
      status: "ready",
      selectedClipId: savedClip.id || current.selectedClipId,
      codingSession: {
        ...(current.codingSession || {}),
        mode: "instant",
        unitPickerOpen: false,
        unitCapture: null,
        lastUnitTag: label,
        lastClipId: savedClip.id || current.codingSession?.lastClipId || "",
      },
      timeline: {
        ...(current.timeline || {}),
        playheadMs: startMs,
      },
      message: `${label} unit tag created.`,
      error: "",
    }));
    await loadClips();
    return true;
  } catch (error) {
    run.store.setState({ status: "error", message: "", error: error.message || "Could not tag unit for this moment." });
    return false;
  }
}

async function applyOutcomeQuickTag(outcome = "", context = {}) {
  const run = ensureRuntime(context);
  const state = run.store.getState();
  const label = String(outcome || "").trim();
  if (!state.match?.id || !state.video?.id) {
    run.store.setState({ status: "error", message: "", error: "Link a local match or training video before tagging an outcome." });
    return false;
  }
  const currentMs = currentPlayheadMs(context, state);
  const durationMs = defaultMomentTagDurationMs(state);
  const momentKey = momentKeyForTagAction(state, currentMs);
  let outcomeClip = null;
  try {
    outcomeClip = buildOutcomeOnlyClipPayload(state, label, currentMs, durationMs, {
      momentKey,
      metadata: { source: "outcome-button" },
    });
  } catch (error) {
    run.store.setState({ status: "error", message: "", error: error.message || "Could not tag outcome." });
    return false;
  }
  run.store.update((current) => ({
    ...current,
    status: "saving-clip",
    codingSession: {
      ...(current.codingSession || {}),
      mode: "instant",
      lastOutcomeTag: label,
    },
    timeline: {
      ...(current.timeline || {}),
      playheadMs: currentMs,
    },
    message: `${label} tagged.`,
    error: "",
  }));
  try {
    const payload = await run.clips.save(toApiClipPayload(outcomeClip));
    const savedClip = normalizeClipInstance(payload?.clip || outcomeClip);
    run.store.update((current) => ({
      ...replaceClipInState(current, savedClip),
      status: "ready",
      selectedClipId: savedClip.id || current.selectedClipId,
      codingSession: {
        ...(current.codingSession || {}),
        mode: "instant",
        lastOutcomeTag: label,
        lastClipId: savedClip.id || current.codingSession?.lastClipId || "",
      },
      timeline: {
        ...(current.timeline || {}),
        playheadMs: currentMs,
      },
      message: `${label} outcome tag created.`,
      error: "",
    }));
    await loadClips();
    return true;
  } catch (error) {
    run.store.setState({ status: "error", message: "", error: error.message || "Could not tag outcome for this moment." });
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
  const targetField = canonicalCodingTargetField(button.targetField || button.type || "");
  if (action.shouldCreateClip && state.match?.id && state.video?.id) {
    if (targetField === "subPhase") {
      const startMs = Math.max(0, Math.round(Number(action.nextDraft?.startMs ?? currentMs)));
      const endMs = Math.max(startMs + 1000, Math.round(Number(action.nextDraft?.endMs ?? startMs + 15000)));
      const durationMs = endMs - startMs;
      const resolvedPhase = phaseForSubPhase(action.nextDraft?.subPhase, action.nextDraft?.phase);
      const momentKey = momentKeyForTagAction(state, startMs);
      const subPhaseActionKey = subPhaseTagActionKey(state, button, startMs, endMs, momentKey);
      const reusableSubPhaseClip = reusableSubPhaseClipForTag(state, action.nextDraft?.subPhase, startMs, endMs);
      if (reusableSubPhaseClip?.id) {
        run.store.update((current) => selectReusableSubPhaseClipState(
          current,
          reusableSubPhaseClip,
          startMs,
          `${button.label || "Sub-phase"} already tagged for this moment.`
        ));
        return true;
      }
      const pendingSubPhaseTag = pendingSubPhaseTagForMoment(state, action.nextDraft?.subPhase, startMs);
      if (pendingSubPhaseTag?.promise) {
        const savedPendingClip = await pendingSubPhaseTag.promise;
        if (savedPendingClip?.id) {
          run.store.update((current) => selectReusableSubPhaseClipState(
            current,
            savedPendingClip,
            startMs,
            `${button.label || "Sub-phase"} already tagged for this moment.`
          ));
          return true;
        }
        return false;
      }
      if (inFlightSubPhaseTagKeys.has(subPhaseActionKey)) {
        return true;
      }
      inFlightSubPhaseTagKeys.add(subPhaseActionKey);
      const pendingSave = registerPendingSubPhaseTagSave(subPhaseActionKey, state, action.nextDraft?.subPhase, startMs, endMs);
      const subPhaseState = {
        ...nextState,
        draft: {
          ...(nextState.draft || {}),
          playerId: "",
          playerIds: [],
          metadata: {
            ...(nextState.draft?.metadata && typeof nextState.draft.metadata === "object" ? nextState.draft.metadata : {}),
            clipKind: "subPhase",
            momentKey,
            source: "sub-phase-button",
          },
        },
      };
      let phaseActionKey = "";
      try {
        run.store.update(() => subPhaseState);
        const savedSubPhaseClip = await saveDraftClip(context, subPhaseState);
        pendingSave.resolve(savedSubPhaseClip || false);
        if (!savedSubPhaseClip) return false;
        const currentAfterSubPhase = run.store.getState();
        phaseActionKey = autoPhaseTagActionKey(state, resolvedPhase, startMs, endMs, momentKey);
        if (hasAutoPhaseTagForMoment(currentAfterSubPhase, resolvedPhase, startMs, endMs, momentKey)
          || inFlightAutoPhaseTagKeys.has(phaseActionKey)) {
          run.store.update((current) => ({
            ...current,
            status: "ready",
            selectedClipId: savedSubPhaseClip.id || current.selectedClipId,
            codingSession: {
              ...(current.codingSession || {}),
              lastClipId: savedSubPhaseClip.id || current.codingSession?.lastClipId || "",
            },
            timeline: {
              ...(current.timeline || {}),
              playheadMs: startMs,
            },
            message: `${button.label || "Sub-phase"} tagged.`,
            error: "",
          }));
          return true;
        }
        inFlightAutoPhaseTagKeys.add(phaseActionKey);
        const phaseClip = buildPhaseOnlyClipPayload(subPhaseState, resolvedPhase, startMs, durationMs, {
          momentKey,
          metadata: {
            source: "auto-phase-from-sub-phase",
            sourceSubPhase: action.nextDraft?.subPhase || "",
          },
        });
        const payload = await run.clips.save(toApiClipPayload(phaseClip));
        const savedPhaseClip = normalizeClipInstance(payload?.clip || phaseClip);
        inFlightAutoPhaseTagKeys.delete(phaseActionKey);
        run.store.update((current) => ({
          ...replaceClipInState(current, savedPhaseClip),
          status: "ready",
          selectedClipId: savedSubPhaseClip.id || savedPhaseClip.id || current.selectedClipId,
          codingSession: {
            ...(current.codingSession || {}),
            lastClipId: savedSubPhaseClip.id || current.codingSession?.lastClipId || "",
          },
          timeline: {
            ...(current.timeline || {}),
            playheadMs: startMs,
          },
          message: `${button.label || "Sub-phase"} tagged with ${resolvedPhase}.`,
          error: "",
        }));
        await loadClips();
      } catch (error) {
        pendingSave.resolve(false);
        run.store.setState({
          status: "error",
          message: "",
          error: error.message || "Sub-phase was saved, but automatic phase tag could not be created.",
        });
        return false;
      } finally {
        if (phaseActionKey) inFlightAutoPhaseTagKeys.delete(phaseActionKey);
        pendingSubPhaseTagSaves.delete(subPhaseActionKey);
        inFlightSubPhaseTagKeys.delete(subPhaseActionKey);
      }
      return true;
    }
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
  const momentKey = momentKeyForTagAction(state, currentMs);
  let playerClip = null;
  try {
    playerClip = buildPlayerOnlyClipPayload(state, player, currentMs, durationMs, {
      momentKey,
      metadata: { source: "player-button" },
    });
  } catch (error) {
    run.store.setState({ status: "error", message: "", error: error.message || "Could not tag player." });
    return false;
  }

  run.store.update((current) => ({
    ...current,
    status: "saving-clip",
    codingSession: {
      ...(current.codingSession || {}),
      mode: "instant",
      activePlayerId: player.id || id,
      lastPlayerTagId: player.id || id,
    },
    timeline: {
      ...(current.timeline || {}),
      playheadMs: currentMs,
    },
    message: `${playerLabel(player)} tagged.`,
    error: "",
  }));
  try {
    const payload = await run.clips.save(toApiClipPayload(playerClip));
    const savedClip = normalizeClipInstance(payload?.clip || playerClip);
    run.store.update((current) => ({
      ...replaceClipInState(current, savedClip),
      status: "ready",
      selectedClipId: savedClip.id || current.selectedClipId,
      codingSession: {
        ...(current.codingSession || {}),
        mode: "instant",
        activePlayerId: player.id || id,
        lastPlayerTagId: player.id || id,
        lastClipId: savedClip.id || current.codingSession?.lastClipId || "",
      },
      timeline: {
        ...(current.timeline || {}),
        playheadMs: currentMs,
      },
      message: `${playerLabel(player)} player tag created.`,
      error: "",
    }));
    await loadClips();
    return true;
  } catch (error) {
    run.store.setState({ status: "error", message: "", error: error.message || "Could not tag player for this moment." });
    return false;
  }
}

export function handlePointerDown(event, context = {}) {
  if (startCodePipInteraction(event, context)) return true;
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
    if (state.presentation?.tracking?.mode === "tracking") {
      if (run.spatialRuntime.controller.startInteraction(event, drawingSurface)) return true;
      return run.trackingRuntime.controller.startInteraction(event, drawingSurface);
    }
    return drawingControls(context).startInteraction(event, drawingSurface);
  }
  return timelineController(context).handlePointerDown(event);
}

export function handlePointerMove(event, context = {}) {
  if (updateCodePipInteraction(event, context)) return true;
  if (runtime?.trackingRuntime?.controller.updateInteraction(event)) return true;
  return drawingControls(context).updateInteraction(event);
}

export function handlePointerUp(event, context = {}) {
  if (finishCodePipInteraction(event, context)) return true;
  if (runtime?.trackingRuntime?.controller.finishInteraction(event)) return true;
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
  if (run.mediaRuntime.controller.handleClick(event)) return true;
  if (run.spatialRuntime.controller.handleClick(event)) return true;
  if (run.trackingRuntime.controller.handleClick(event)) return true;
  if (intelligenceControls(context).handleClick(event)) return true;
  if (workspaceTimelineController(context).handleClick(event)) return true;
  const roomTab = target.closest("[data-video-analysis-room-tab]");
  if (roomTab) {
    const tabId = roomTab.dataset.videoAnalysisRoomTab;
    if (tabId === "overview") {
      pauseFsPlayerPlayback(context);
      libraryController().openLibraryView(context);
      return true;
    }
    if (tabId === "fs-player" || tabId === "presentation" || tabId === "match-report") {
      if (tabId !== "fs-player") pauseFsPlayerPlayback(context);
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
    pauseFsPlayerPlayback(context);
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
  if (target.closest("[data-video-analysis-unit-open]")) {
    return openUnitCapture(context);
  }
  if (target.closest("[data-video-analysis-unit-edit-open]")) {
    return openUnitEditor(context);
  }
  if (target.closest("[data-video-analysis-unit-editor-close]")) {
    run.store.update((state) => closeUnitEditorState(state));
    return true;
  }
  if (target.closest("[data-video-analysis-unit-editor-add]")) {
    return addUnitEditorDraftOption(context);
  }
  const unitEditorRemove = target.closest("[data-video-analysis-unit-editor-remove]");
  if (unitEditorRemove) {
    return removeUnitEditorDraftOption(unitEditorRemove.dataset.videoAnalysisUnitEditorRemove, context);
  }
  if (target.closest("[data-video-analysis-unit-editor-save]")) {
    return saveUnitEditorOptions(context);
  }
  if (target.closest("[data-video-analysis-unit-close]")) {
    run.store.update((state) => closeUnitPickerState(state));
    return true;
  }
  const unitTagButton = target.closest("[data-video-analysis-unit-tag]");
  if (unitTagButton) {
    createUnitTagFromCapture(unitTagButton.dataset.videoAnalysisUnitTag, context);
    return true;
  }
  const outcomeTagButton = target.closest("[data-video-analysis-outcome-tag]");
  if (outcomeTagButton) {
    applyOutcomeQuickTag(outcomeTagButton.dataset.videoAnalysisOutcomeTag, context);
    return true;
  }
  if (target.closest("[data-video-analysis-mg-principles-open]")) {
    return openMiniGamePrincipleCapture(context);
  }
  if (target.closest("[data-video-analysis-mg-principles-close]")) {
    run.store.update((state) => closeMiniGamePrinciplePickerState(state));
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
    const currentMs = currentPlayheadMs(context, run.store.getState());
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
  const timelineViewButton = target.closest("[data-video-analysis-timeline-view]");
  if (timelineViewButton) {
    const viewMode = timelineViewButton.dataset.videoAnalysisTimelineView === "focus" ? "focus" : "overview";
    run.store.update((state) => ({
      ...state,
      timeline: {
        ...(state.timeline || {}),
        viewMode,
      },
    }));
    return true;
  }
  const timelineZoomButton = target.closest("[data-video-analysis-timeline-zoom]");
  if (timelineZoomButton) {
    run.store.update((state) => ({
      ...state,
      timeline: {
        ...(state.timeline || {}),
        zoom: Math.min(6, Math.max(1, Number(state.timeline?.zoom || 1) + Number(timelineZoomButton.dataset.videoAnalysisTimelineZoom || 0))),
      },
    }));
    return true;
  }
  if (target.closest("[data-video-analysis-timeline-clear-selection]")) {
    run.store.update((state) => clearTimelineClipSelection(state));
    return true;
  }
  if (target.closest("[data-video-analysis-timeline-edit]")) {
    run.store.update((state) => ({
      ...state,
      timeline: {
        ...(state.timeline || {}),
        editorOpen: !state.timeline?.editorOpen,
      },
    }));
    return true;
  }
  if (target.closest("[data-video-analysis-timeline-edit-cancel]")) {
    run.store.update((state) => ({
      ...state,
      timeline: {
        ...(state.timeline || {}),
        editorOpen: false,
      },
    }));
    return true;
  }
  if (target.closest("[data-video-analysis-timeline-edit-save]")) {
    const form = target.closest("[data-video-analysis-timeline-editor]");
    const field = (name) => form?.querySelector(`[data-video-analysis-timeline-edit-field="${name}"]`);
    const principleSelect = field("miniGamePrincipleIds");
    void saveTimelineClipEdits(context, {
      subPhase: field("subPhase")?.value || "",
      outcome: field("outcome")?.value || "",
      miniGamePrincipleIds: [...(principleSelect?.selectedOptions || [])].map((option) => option.value),
      tags: field("tags")?.value || "",
      note: field("note")?.value || "",
    });
    return true;
  }
  const timelineNudgeButton = target.closest("[data-video-analysis-timeline-nudge]");
  if (timelineNudgeButton) {
    const [edge, deltaMs] = String(timelineNudgeButton.dataset.videoAnalysisTimelineNudge || "").split(":");
    return trimSelectedClipByKeyboard(context, { edge, deltaMs: Number(deltaMs || 0) });
  }
  if (target.closest("[data-video-analysis-timeline-merge]")) {
    void mergeTimelineSelection(context);
    return true;
  }
  if (target.closest("[data-video-analysis-timeline-delete-selection]")) {
    const state = run.store.getState();
    const clipIds = timelineSelectedClipIds(state);
    if (!clipIds.length) return true;
    void confirmPlatformAction({
      eyebrow: "Video Analysis",
      title: clipIds.length === 1 ? "Delete timeline tag?" : "Delete selected timeline tags?",
      message: `${clipIds.length} tag${clipIds.length === 1 ? "" : "s"} will be archived and can be restored with Undo.`,
      confirmLabel: "Delete",
      tone: "danger",
      win: context.win || window,
    }).then((confirmed) => {
      if (confirmed) void archiveTimelineClips(context, clipIds);
    });
    return true;
  }
  if (target.closest("[data-video-analysis-timeline-undo]")) {
    void undoTimelineAction(context);
    return true;
  }
  const seekButton = target.closest("[data-video-analysis-seek]");
  if (seekButton) {
    const state = run.store.getState();
    const clip = selectedClipFromPresentationSources(state, seekButton.dataset.videoAnalysisSeek);
    const startMs = clip?.startMs ?? clip?.start_ms ?? 0;
    if (clip?.id) seekVideoToMs(videoElement(context), startMs);
    const toggleSelection = Boolean(event.shiftKey || event.metaKey || event.ctrlKey);
    run.store.update((current) => {
      const selectedState = clip?.id
        ? updateTimelineClipSelection(current, clip.id, { toggle: toggleSelection })
        : current;
      return {
        ...selectedState,
        timeline: {
        ...(selectedState.timeline || {}),
        playheadMs: Math.max(0, Math.round(Number(startMs || 0))),
        selectedCategory: {
          ...(selectedState.timeline?.selectedCategory || {}),
          keyboardDeleteScope: "clip",
        },
      },
      presentation: {
        ...(selectedState.presentation || {}),
        selectedClipId: clip?.id || selectedState.presentation?.selectedClipId || "",
      },
      };
    });
    return true;
  }
  const tagFilterTrigger = target.closest("[data-video-analysis-tag-filter-trigger]");
  if (tagFilterTrigger) {
    run.store.update((state) => ({
      ...state,
      timeline: {
        ...(state.timeline || {}),
        laneMode: "all",
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
        selectedClipIds: clips.map((clip) => clip.id).filter(Boolean),
        editorOpen: false,
        selectedCategory: {
          laneMode: normalizeTimelineLaneMode(laneMode),
          label,
          viewOpen: false,
          menuOpen: false,
          activeClipId: clips[0]?.id || "",
          keyboardDeleteScope: "category",
        },
      },
    }));
    return true;
  }
  const categoryCloseButton = target.closest("[data-video-analysis-timeline-category-close]");
  if (categoryCloseButton) {
    run.store.update((state) => ({
      ...state,
      timeline: {
        ...(state.timeline || {}),
        selectedCategory: {
          ...(state.timeline?.selectedCategory || {}),
          viewOpen: false,
          menuOpen: false,
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
            menuOpen: true,
            menuX: currentCategory.menuX || 12,
            menuY: currentCategory.menuY || 12,
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
      const clip = clipsForIntelligenceState(state).find((entry) => String(entry.id || "") === clipId);
      if (!clipMatchesActiveVideo(clip, state)) {
        return { ...state, message: "Open this clip source before playback." };
      }
      return {
        ...state,
        ...clipLibraryPreviewPatch(state, [clipId], 0),
      };
    });
    return true;
  }
  const clipLibrarySourceButton = target.closest("[data-video-analysis-clip-library-open-source]");
  if (clipLibrarySourceButton) {
    const matchId = clipLibrarySourceButton.dataset.videoAnalysisClipLibraryOpenSource || "";
    pauseFsPlayerPlayback(context);
    const controller = libraryController();
    controller.loadLibrary({ silent: true }).then(() => (
      controller.openLibraryItem(`match:${matchId}`, context, { activeTab: "match-report" })
    )).then((opened) => {
      if (!opened) controller.openLibraryView(context);
    }).catch((error) => {
      run.store.setState({ error: error.message || "Could not open the clip source." });
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
        clipsForIntelligenceState(state),
        state.matrix || {},
        state.matrix?.selectedRow,
        state.matrix?.selectedColumn
      );
      const orderedVisibleIds = buildClipLibraryClipOrder(visibleClips, state.clipLibrary?.groupBy || "subPhase");
      const hiddenSelectedIds = [...selectedIds].filter((id) => !orderedVisibleIds.includes(id));
      const orderedIds = [...orderedVisibleIds.filter((id) => selectedIds.has(id)), ...hiddenSelectedIds];
      const clipsById = new Map(clipsForIntelligenceState(state).map((clip) => [String(clip.id || ""), clip]));
      const queueIds = orderedIds.filter((id) => clipMatchesActiveVideo(clipsById.get(id), state));
      if (!queueIds.length) return { ...state, message: "Open a selected clip source before playback." };
      return {
        ...state,
        ...clipLibraryPreviewPatch(state, queueIds, 0),
        message: queueIds.length < orderedIds.length ? `${queueIds.length} clips from the active source queued.` : state.message,
      };
    });
    return true;
  }
  if (target.closest("[data-video-analysis-clip-library-compare]")) {
    run.store.update((state) => ({
      ...state,
      clipLibrary: {
        ...(state.clipLibrary || {}),
        outputMode: "comparison",
      },
      message: "Comparison opened.",
    }));
    return true;
  }
  if (target.closest("[data-video-analysis-clip-library-close-output]")) {
    run.store.update((state) => ({
      ...state,
      clipLibrary: {
        ...(state.clipLibrary || {}),
        outputMode: "",
      },
    }));
    return true;
  }
  const createLibraryOutput = target.closest(
    "[data-video-analysis-clip-library-create-playlist], [data-video-analysis-clip-library-build-report]"
  );
  if (createLibraryOutput) {
    const kind = createLibraryOutput.hasAttribute("data-video-analysis-clip-library-build-report") ? "report" : "playlist";
    run.store.update((state) => {
      const output = presentationFromClipLibrarySelection(state, kind);
      const firstItem = presentationQueue(output.current)[0];
      if (!output.clips.length) return { ...state, message: "Select clips first." };
      return {
        ...state,
        activeAnalysisRoomTab: "presentation",
        selectedClipId: output.clips[0]?.id || state.selectedClipId || "",
        message: kind === "report" ? "Analysis report draft created." : "Playlist draft created.",
        presentation: {
          ...(state.presentation || {}),
          current: output.current,
          mode: "builder",
          activeSectionId: output.activeSectionId,
          selectedItemId: firstItem?.id || "",
          selectedClipId: firstItem?.clipId || "",
        },
      };
    });
    loadPresentationSources(null, { silent: true });
    return true;
  }
  if (target.closest("[data-video-analysis-clip-library-clear-selected]")) {
    run.store.update((state) => ({
      ...state,
      clipLibrary: {
        ...(state.clipLibrary || {}),
        selectedClipIds: [],
        outputMode: "",
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
        clipsForIntelligenceState(state),
        state.matrix || {},
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
    const mode = matrixButton.dataset.videoAnalysisMatrix;
    const config = resolveMatrixConfig(mode);
    run.store.update((state) => ({
      ...state,
      matrix: {
        ...(state.matrix || {}),
        mode,
        rowAxis: config.rowAxis,
        columnAxis: config.columnAxis,
        selectedRow: "",
        selectedColumn: "",
      },
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
    const queryText = String(state.intelligence?.queryText || "").trim();
    const search = {
      title: (queryText || savedSearchTitle(state.filters)).slice(0, 180),
      search: {
        ...state.filters,
        matrix: state.matrix,
        intelligence: queryText ? {
          queryText,
          querySpec: state.intelligence?.querySpec || {},
          cohortA: state.intelligence?.cohortA || null,
          cohortB: state.intelligence?.cohortB || null,
        } : null,
      },
    };
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
    if (searchJson.intelligence?.queryText) {
      run.store.update((state) => ({
        ...state,
        intelligence: {
          ...(state.intelligence || {}),
          queryText: searchJson.intelligence.queryText,
          querySpec: searchJson.intelligence.querySpec || state.intelligence?.querySpec,
          cohortA: searchJson.intelligence.cohortA || null,
          cohortB: searchJson.intelligence.cohortB || null,
        },
      }));
      intelligenceControls(context).runQuery();
    } else {
      const { matrix: ignoredMatrix, intelligence: ignoredIntelligence, ...savedFilters } = searchJson;
      loadClips({ ...run.store.getState().filters, ...savedFilters });
    }
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
  if (intelligenceControls(context).handleInput(event)) return true;
  if (workspaceTimelineController(context).handleInput(event)) return true;
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
  const unitEditorField = target.closest("[data-video-analysis-unit-editor-name]");
  if (unitEditorField) {
    return updateUnitEditorDraft(unitEditorField.dataset.videoAnalysisUnitEditorName, unitEditorField.value, context);
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
  if (run.mediaRuntime.controller.handleChange(event)) return true;
  if (run.spatialRuntime.controller.handleChange(event)) return true;
  if (run.trackingRuntime.controller.handleChange(event)) return true;
  if (intelligenceControls(context).handleChange(event)) return true;
  if (workspaceTimelineController(context).handleChange(event)) return true;
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
  const timelineLaneSelect = target.closest("[data-video-analysis-timeline-lane-select]");
  if (timelineLaneSelect) {
    run.store.update((state) => ({
      ...state,
      timeline: {
        ...(state.timeline || {}),
        laneMode: timelineLaneSelect.value || "all",
        tagFilterOpen: false,
        selectedCategory: {
          laneMode: "",
          label: "",
          viewOpen: false,
          menuOpen: false,
          menuX: 0,
          menuY: 0,
        },
      },
    }));
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

export function handleContextMenu(event, context = {}) {
  if (!isAnalysisRoomWorkspaceActive(context)) return false;
  const run = ensureRuntime(context);
  const target = eventElement(event);
  if (!target?.closest) return false;
  const categorySelectButton = target.closest("[data-video-analysis-timeline-category]");
  if (!categorySelectButton) return false;
  const { laneMode, label } = categoryPayloadFromButton(categorySelectButton);
  const clips = findTimelineCategoryClips(run.store.getState(), laneMode, label);
  if (!clips.length) return false;
  const position = timelineCategoryMenuPosition(event, context);
  event.preventDefault?.();
  event.stopPropagation?.();
  run.store.update((current) => ({
    ...current,
    selectedClipId: clips[0]?.id || current.selectedClipId || "",
    timeline: {
      ...(current.timeline || {}),
      selectedClipIds: clips.map((clip) => clip.id).filter(Boolean),
      editorOpen: false,
      selectedCategory: {
        laneMode: normalizeTimelineLaneMode(laneMode),
        label,
        viewOpen: false,
        menuOpen: true,
        menuX: position.x,
        menuY: position.y,
        activeClipId: clips[0]?.id || "",
        keyboardDeleteScope: "category",
      },
    },
  }));
  return true;
}

export function handleKeydown(event, context = {}) {
  if (!isAnalysisRoomWorkspaceActive(context)) return false;
  const run = ensureRuntime(context);
  const root = getRoot(context);
  const state = run.store.getState();
  const fsPlayerShortcutsActive = isFsPlayerInteractionActive(context, state);
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
  if (fsPlayerShortcutsActive && deleteTimelineSelectionByKeyboard(event, context)) return true;
  if (fsPlayerShortcutsActive && tabToAdjacentTimelineClip(event, context)) return true;
  if (
    fsPlayerShortcutsActive
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
    fsPlayerShortcutsActive
    && state.fsPlayer?.mode === "code"
    && event.key === "Escape"
  ) {
    event.preventDefault?.();
    event.stopPropagation?.();
    return exitFsPlayerCodeMode(context);
  }
  if (
    fsPlayerShortcutsActive
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
    fsPlayerShortcutsActive
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
    fsPlayerShortcutsActive
    && (category.viewOpen || category.menuOpen)
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
          selectedCategory: { ...(current.timeline?.selectedCategory || {}), viewOpen: false, menuOpen: false },
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
  if (!fsPlayerShortcutsActive) return false;
  return handleVideoAnalysisShortcut(event, {
    applyCodeButton: (buttonId) => applyCodeButton(buttonId, context),
    getCurrentMs: () => currentPlayheadMs(context, run.store.getState()),
    getState: run.store.getState,
    root,
    saveDraftClip: () => saveDraftClip(context),
    togglePlayback: () => togglePlayback(context),
    trimSelectedClipByKeyboard: (payload) => trimSelectedClipByKeyboard(context, payload),
    update: run.store.update,
  });
}

export function handleKeyup(event, context = {}) {
  if (!isAnalysisRoomWorkspaceActive(context)) return false;
  const state = ensureRuntime(context).store.getState();
  if (
    isFsPlayerInteractionActive(context, state)
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
