import { localVideoIdentifierForFile } from "../services/localVideoBridgeService.js";
import { getVideoHandle, saveVideoHandle, verifyPermission } from "../services/localVideoHandleStore.js";
import { buildLocalVideoHandleIdentity, pickLocalVideoFile } from "../services/localVideoSessionService.js";
import { activeMediaAngle } from "../services/mediaProductionService.js";

function matchesVideo(state, clip) {
  return Boolean(clip.matchId && clip.videoId && state.match?.id === clip.matchId && state.video?.id === clip.videoId);
}

export function clipSourceDuration(state, clip) {
  return Number(clip.videoDurationMs || (matchesVideo(state, clip)
    ? state.videoRef?.durationMs || state.video?.durationMs || state.video?.duration_ms : 0) || 0);
}

export function createClipReviewSources(win, getState, getContext) {
  const references = new Map();
  const expectedIdentifier = (state, clip) => clip.videoSourceIdentifier || (matchesVideo(state, clip)
    ? state.video?.local_video_identifier || (state.source?.video_id === clip.videoId && state.source.local_video_identifier) || "" : "");
  const unavailable = { video: null, videoRef: null };
  const handleIdentity = (clip, identifier) => buildLocalVideoHandleIdentity({ match: getState().match }, getContext(), {
    matchId: clip.matchId, videoId: clip.videoId, localVideoIdentifier: identifier,
  });

  function playbackState(state, clip, originalOnly) {
    const match = matchesVideo(state, clip);
    const expected = expectedIdentifier(state, clip);
    const reference = state.videoRef;
    const mainSourceMatches = match && (!expected || reference?.localVideoIdentifier === expected);
    if (mainSourceMatches && reference?.objectUrl && state.status !== "saving-source") {
      const angle = activeMediaAngle(state);
      if (!originalOnly && !state.mediaProduction?.portable?.playback?.active
        && angle?.matchId === clip.matchId && angle?.videoId === clip.videoId) return state;
      return { ...state, mediaProduction: null };
    }
    const connected = references.get(clip.videoId);
    if (connected && expected && connected.localVideoIdentifier === expected) {
      return { match: { id: clip.matchId }, video: { id: clip.videoId }, videoRef: connected };
    }
    return unavailable;
  }

  async function connect(file, clip, isCurrent, handle) {
    const expected = expectedIdentifier(getState(), clip);
    if (!expected) throw new Error("The registered video source is unavailable.");
    const identifier = await localVideoIdentifierForFile(file);
    if (identifier !== expected) throw new Error("This file is not the source for this clip.");
    if (!isCurrent() || references.has(clip.videoId)) return;
    references.set(clip.videoId, {
      objectUrl: win.URL.createObjectURL(file),
      localVideoIdentifier: identifier,
      durationMs: clip.videoDurationMs || 0,
      displayName: file.name,
      file,
    });
    if (handle) {
      await saveVideoHandle({ ...handleIdentity(clip, identifier), handle, displayName: file.name }, win).catch(() => {});
    }
  }

  async function pick(clip, isCurrent, input) {
    try {
      const selection = await pickLocalVideoFile(win);
      if (selection.usedFileSystemAccess) {
        if (selection.file) await connect(selection.file, clip, isCurrent, selection.handle);
        return;
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (error?.name !== "NotAllowedError" && error?.name !== "SecurityError") throw error;
    }
    if (isCurrent()) { input.value = ""; input.click(); }
  }

  async function restore(clip, isCurrent) {
    const state = getState();
    const expected = expectedIdentifier(state, clip);
    if (!expected || playbackState(state, clip, true).videoRef) return;
    const identity = handleIdentity(clip, expected);
    const record = await getVideoHandle(identity, win);
    if (!record?.handle || record.videoId !== clip.videoId || record.matchId !== clip.matchId
      || record.localVideoIdentifier !== expected || record.organizationId !== identity.organizationId
      || record.teamId !== identity.teamId || record.userId !== identity.userId
      || await verifyPermission(record.handle) !== "granted" || !isCurrent()) return;
    await connect(await record.handle.getFile(), clip, isCurrent);
  }

  return {
    playbackState, connect, pick, restore,
    canConnect: clip => Boolean(expectedIdentifier(getState(), clip)),
    dispose() {
      for (const reference of references.values()) win.URL.revokeObjectURL(reference.objectUrl);
      references.clear();
    },
  };
}
