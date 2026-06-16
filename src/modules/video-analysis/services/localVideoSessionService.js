import { createLocalVideoReference } from "./localVideoBridgeService.js";
import {
  getVideoHandle,
  isFileSystemAccessSupported,
  openVideoFileHandle,
  requestPermission,
  saveVideoHandle,
  verifyPermission,
} from "./localVideoHandleStore.js";

function text(value = "") {
  return String(value || "").trim();
}

function firstText(...values) {
  for (const value of values) {
    const safe = text(value);
    if (safe) return safe;
  }
  return "";
}

function metadataValue(record = {}, key = "") {
  const metadata = record?.metadata && typeof record.metadata === "object" ? record.metadata : {};
  return firstText(metadata[key], metadata[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)]);
}

function currentUserIdentity(context = {}) {
  const user = context.currentUser || {};
  return {
    organizationId: firstText(user.organizationId, user.organization_id, user.clubId, user.club_id, user.orgId, user.org_id),
    teamId: firstText(user.teamId, user.team_id, user.currentTeamId, user.current_team_id),
  };
}

export function isPreparedPlaybackUrl(objectUrl = "") {
  return /^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/playback\//.test(String(objectUrl || ""));
}

export function buildLocalVideoHandleIdentity(state = {}, context = {}, overrides = {}) {
  const source = overrides.source || state.source || {};
  const video = overrides.video || state.video || {};
  const match = overrides.match || state.match || {};
  const reference = overrides.reference || state.videoRef || {};
  const user = currentUserIdentity(context);
  return {
    organizationId: firstText(
      overrides.organizationId,
      overrides.organization_id,
      source.organizationId,
      source.organization_id,
      video.organizationId,
      video.organization_id,
      match.organizationId,
      match.organization_id,
      user.organizationId,
      "local"
    ),
    teamId: firstText(
      overrides.teamId,
      overrides.team_id,
      source.teamId,
      source.team_id,
      video.teamId,
      video.team_id,
      match.teamId,
      match.team_id,
      user.teamId,
      "team"
    ),
    matchId: firstText(overrides.matchId, overrides.match_id, source.matchId, source.match_id, video.matchId, video.match_id, match.id),
    videoId: firstText(overrides.videoId, overrides.video_id, source.videoId, source.video_id, video.id, video.video_id),
    localVideoIdentifier: firstText(
      overrides.localVideoIdentifier,
      overrides.local_video_identifier,
      source.localVideoIdentifier,
      source.local_video_identifier,
      video.localVideoIdentifier,
      video.local_video_identifier,
      reference.localVideoIdentifier,
      reference.local_video_identifier
    ),
    scheduleEventId: firstText(
      overrides.scheduleEventId,
      overrides.schedule_event_id,
      source.scheduleEventId,
      source.schedule_event_id,
      video.scheduleEventId,
      video.schedule_event_id,
      match.scheduleEventId,
      match.schedule_event_id,
      metadataValue(match, "scheduleEventId")
    ),
    scheduleDayKey: firstText(
      overrides.scheduleDayKey,
      overrides.schedule_day_key,
      source.scheduleDayKey,
      source.schedule_day_key,
      video.scheduleDayKey,
      video.schedule_day_key,
      match.scheduleDayKey,
      match.schedule_day_key,
      metadataValue(match, "scheduleDayKey"),
      match.matchDate,
      match.match_date
    ),
    matchDate: firstText(overrides.matchDate, overrides.match_date, match.matchDate, match.match_date, source.matchDate, source.match_date),
    displayName: firstText(overrides.displayName, overrides.display_name, reference.displayName, reference.display_name, source.displayName, source.display_name, video.title, match.title),
  };
}

function hasPersistentIdentity(identity = {}) {
  return Boolean(identity.matchId || identity.videoId || identity.localVideoIdentifier || identity.scheduleEventId || identity.scheduleDayKey || identity.matchDate || identity.displayName);
}

function hasCentralVideoIdentity(identity = {}) {
  return Boolean(identity.matchId || identity.videoId || identity.localVideoIdentifier);
}

function shouldBackfillIdentity(record = {}, identity = {}) {
  return ["organizationId", "teamId", "matchId", "videoId", "localVideoIdentifier", "scheduleEventId", "scheduleDayKey", "matchDate", "displayName"]
    .some((key) => text(record[key]) !== text(identity[key]));
}

export function localVideoStatusPatch(localFileStatus, localFileMessage, extra = {}) {
  return {
    localFileStatus,
    localFileMessage,
    ...extra,
  };
}

export function browserFileAccessCapabilities(win = window) {
  return {
    fileSystemAccessSupported: isFileSystemAccessSupported(win),
  };
}

export async function pickLocalVideoFile(win = window) {
  if (!isFileSystemAccessSupported(win)) return { handle: null, file: null, usedFileSystemAccess: false };
  const handle = await openVideoFileHandle(win);
  if (!handle?.getFile) return { handle: null, file: null, usedFileSystemAccess: true };
  const file = await handle.getFile();
  return { handle, file, usedFileSystemAccess: true };
}

export async function persistLocalVideoHandle({ state = {}, context = {}, handle, reference = {}, payload = {} } = {}) {
  if (!handle) return null;
  const win = context.win || window;
  const identity = buildLocalVideoHandleIdentity(state, context, {
    match: payload.match,
    video: payload.video,
    source: payload.source,
    reference,
  });
  if (!hasPersistentIdentity(identity)) return null;
  return saveVideoHandle({ ...identity, handle, displayName: reference.displayName }, win);
}

export async function restoreLocalVideoHandleForState({ state = {}, context = {}, requestReadPermission = false } = {}) {
  const win = context.win || window;
  const identity = buildLocalVideoHandleIdentity(state, context);
  if (!hasPersistentIdentity(identity)) {
    return {
      ok: false,
      reason: "missing-metadata",
      patch: localVideoStatusPatch("none", "No video linked", {
        localFileHandleIdentity: null,
        fileSystemAccessSupported: isFileSystemAccessSupported(win),
      }),
    };
  }

  const record = await getVideoHandle(identity, win);
  if (!record?.handle) {
    const linkedMetadata = hasCentralVideoIdentity(identity);
    return {
      ok: false,
      reason: "missing-handle",
      patch: localVideoStatusPatch(linkedMetadata ? "linked-unavailable" : "none", linkedMetadata ? "Reconnect local file on this device" : "No video linked", {
        localFileHandleIdentity: identity,
        nativePlaybackReady: false,
        bridgeFallbackRecommended: false,
      }),
    };
  }

  let permission = await verifyPermission(record.handle);
  if (permission !== "granted" && requestReadPermission) permission = await requestPermission(record.handle);
  if (permission !== "granted") {
    return {
      ok: false,
      reason: "permission-needed",
      record,
      patch: localVideoStatusPatch("permission-needed", "Local file permission needed", {
        localFileHandleIdentity: identity,
        nativePlaybackReady: false,
        bridgeFallbackRecommended: false,
      }),
    };
  }

  if (typeof record.handle.getFile !== "function") {
    return {
      ok: false,
      reason: "missing-file",
      record,
      patch: localVideoStatusPatch("linked-unavailable", "Reconnect local file on this device", {
        localFileHandleIdentity: identity,
        nativePlaybackReady: false,
        bridgeFallbackRecommended: false,
      }),
    };
  }

  let file;
  try {
    file = await record.handle.getFile();
  } catch {
    return {
      ok: false,
      reason: "missing-file",
      record,
      patch: localVideoStatusPatch("linked-unavailable", "Reconnect local file on this device", {
        localFileHandleIdentity: identity,
        nativePlaybackReady: false,
        bridgeFallbackRecommended: false,
      }),
    };
  }

  if (shouldBackfillIdentity(record, identity)) {
    try {
      await saveVideoHandle({ ...identity, handle: record.handle, displayName: record.name }, win);
    } catch {
      // Restoring playback matters more than repairing a legacy local key.
    }
  }

  const reference = await createLocalVideoReference(file, win);
  return {
    ok: true,
    record,
    reference,
    patch: localVideoStatusPatch("restored", "Local file connected on this device", {
      localFileHandleIdentity: identity,
      nativePlaybackReady: false,
      bridgeFallbackRecommended: false,
      playbackPreparation: { active: false, token: "" },
    }),
  };
}
