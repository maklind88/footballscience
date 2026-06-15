import {
  findVideoLibraryItem,
  mergeScheduleCandidates,
  normalizeContextScheduleCandidates,
} from "./services/videoLibraryService.js";

function contextScheduleCandidates(context = {}) {
  try {
    return normalizeContextScheduleCandidates(context);
  } catch {
    return [];
  }
}

export function createVideoLibraryController(deps = {}) {
  const {
    ensureRuntime,
    getRuntime,
    loadClips,
    restoreLocalVideoHandle,
    revokeLocalVideoReference,
    shouldLoadMetadata,
    localVideoStatusPatch,
  } = deps;

  async function loadLibrary(options = {}) {
    const run = getRuntime?.();
    if (!run) return;
    const state = run.store.getState();
    const currentLibrary = state.library || {};
    run.store.update((current) => ({
      ...current,
      library: {
        ...(current.library || {}),
        status: options.silent ? current.library?.status || "ready" : "loading",
        error: "",
      },
    }));
    if (!shouldLoadMetadata(run.context, state)) {
      run.store.update((current) => ({
        ...current,
        library: {
          ...(current.library || {}),
          status: "ready",
          scheduleCandidates: mergeScheduleCandidates(contextScheduleCandidates(run.context)),
        },
      }));
      return;
    }
    try {
      const payload = await run.videos.listMatches({ limit: 160, scheduleLimit: 160 });
      run.store.update((current) => ({
        ...current,
        library: {
          ...(current.library || currentLibrary),
          status: "ready",
          matches: payload.matches || [],
          scheduleCandidates: mergeScheduleCandidates(payload.scheduleCandidates || [], contextScheduleCandidates(run.context)),
          error: "",
        },
      }));
    } catch (error) {
      run.store.update((current) => ({
        ...current,
        library: {
          ...(current.library || currentLibrary),
          status: "error",
          scheduleCandidates: mergeScheduleCandidates(contextScheduleCandidates(run.context)),
          error: error.message || "Could not load video library.",
        },
      }));
    }
  }

  async function openLibraryItem(itemKey = "", context = {}) {
    const run = ensureRuntime(context);
    const item = findVideoLibraryItem(run.store.getState(), itemKey);
    if (!item) return false;
    const previous = run.store.getState().videoRef;
    if (item.kind === "schedule-candidate") {
      revokeLocalVideoReference(previous, context.win || window);
      run.store.update((state) => ({
        ...state,
        view: "workspace",
        activeAnalysisRoomTab: "fs-player",
        pendingScheduleLink: item,
        match: {
          title: item.title,
          match_date: item.matchDate,
          event_type: item.eventType,
          schedule_event_id: item.scheduleEventId,
          schedule_day_key: item.scheduleDayKey,
        },
        video: null,
        source: null,
        videoRef: null,
        clips: [],
        selectedClipId: "",
        message: "Schedule day selected. Link the local video once and it will stay connected.",
        error: "",
        ...localVideoStatusPatch("none", "No video linked"),
      }));
      return true;
    }
    if (previous) revokeLocalVideoReference(previous, context.win || window);
    run.store.update((state) => ({
      ...state,
      view: "workspace",
      activeAnalysisRoomTab: "fs-player",
      pendingScheduleLink: null,
      match: item.match,
      video: item.latestVideo || null,
      source: item.latestSource || null,
      videoRef: null,
      clips: [],
      selectedClipId: "",
      message: item.hasVideo ? "Opening linked analysis video." : "Open session and link a local video.",
      error: "",
      ...localVideoStatusPatch(
        item.hasVideo ? "linked-unavailable" : "none",
        item.hasVideo ? "Reconnect local file on this device" : "No video linked"
      ),
    }));
    await loadClips();
    await restoreLocalVideoHandle(context, { silent: true });
    return true;
  }

  function openLibraryView(context = {}) {
    const run = ensureRuntime(context);
    run.store.setState({ view: "library", activeAnalysisRoomTab: "fs-player", message: "", error: "" });
    loadLibrary({ silent: true });
  }

  async function saveMatchLink(matchId = "", patch = {}, context = {}) {
    const run = ensureRuntime(context);
    if (!matchId) return false;
    run.store.update((state) => ({
      ...state,
      library: { ...(state.library || {}), savingLinkId: matchId, error: "" },
    }));
    try {
      const payload = await run.videos.updateMatchLink({ matchId, ...patch });
      run.store.update((state) => ({
        ...state,
        match: state.match?.id === matchId ? { ...state.match, ...(payload.match || {}) } : state.match,
        message: "Video day link saved.",
        error: "",
        library: { ...(state.library || {}), savingLinkId: "" },
      }));
      await loadLibrary({ silent: true });
      return true;
    } catch (error) {
      run.store.update((state) => ({
        ...state,
        error: error.message || "Could not save the video day link.",
        library: { ...(state.library || {}), savingLinkId: "", error: error.message || "Could not save link." },
      }));
      return false;
    }
  }

  return Object.freeze({
    loadLibrary,
    openLibraryItem,
    openLibraryView,
    saveMatchLink,
  });
}
