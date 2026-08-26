import { pointerPercent } from "../services/presentationLayerGeometryService.js";
import { selectedPresentationItem, updatePresentationItem } from "../services/presentationService.js";
import { trackingPrompt } from "../services/trackingReviewService.js";
import { getVideoCurrentMs } from "../services/videoPlaybackService.js";

const trackingRangeFields = new Set(["startSeconds", "endSeconds"]);

export function trackingLocalId(prefix = "graphic") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function selectedTrackingItem(state = {}) {
  return selectedPresentationItem(
    state.presentation?.current,
    state.presentation?.selectedItemId,
    state.presentation?.selectedClipId,
  );
}

export function trackingItemById(state = {}, itemId = "") {
  return selectedPresentationItem(state.presentation?.current, itemId, "");
}

export function patchTrackingState(state = {}, patch = {}) {
  return {
    ...state,
    presentation: {
      ...(state.presentation || {}),
      tracking: { ...(state.presentation?.tracking || {}), ...patch },
    },
  };
}

export function replacePresentationItem(state = {}, itemId = "", patch = {}) {
  return {
    ...state,
    presentation: {
      ...(state.presentation || {}),
      current: updatePresentationItem(state.presentation?.current, itemId, patch),
    },
  };
}

export function normalizedTrackingPointer(event, surface) {
  const point = pointerPercent(event, surface);
  return { x: point.x / 100, y: point.y / 100 };
}

export function trackingPromptBox(start = {}, end = {}) {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  return {
    left,
    top,
    width: Math.max(0.02, Math.abs(end.x - start.x)),
    height: Math.max(0.04, Math.abs(end.y - start.y)),
  };
}

export function trackingItemRange(item = {}) {
  const clip = item.clip || {};
  const startMs = Math.max(0, Math.round(Number(item.startMs ?? clip.startMs ?? clip.start_ms) || 0));
  const endMs = Math.max(startMs + 1, Math.round(Number(item.endMs ?? clip.endMs ?? clip.end_ms) || startMs + 5000));
  return { startMs, endMs };
}

export function currentTrackingAtMs(getVideoElement, state = {}, getCurrentMatchMs = null) {
  const matchMs = getCurrentMatchMs?.();
  if (Number.isFinite(Number(matchMs))) return Math.max(0, Math.round(Number(matchMs)));
  const video = getVideoElement?.();
  return video ? getVideoCurrentMs(video) : Math.max(0, Number(state.timeline?.playheadMs) || 0);
}

export function updateTrackingPromptField(state = {}, field = "", value = "") {
  const item = selectedTrackingItem(state);
  const existing = state.presentation?.tracking?.prompt || trackingPrompt(trackingItemRange(item || {}));
  if (field === "playerId") {
    const player = (state.players || []).find((entry) => entry.id === value) || null;
    return patchTrackingState(state, {
      prompt: trackingPrompt({
        ...existing,
        entityType: "player",
        playerId: value,
        playerLabel: player?.name || "",
        teamSide: player?.teamSide || player?.team_side || existing.teamSide,
        shirtNumber: player?.shirtNumber || player?.shirt_number || player?.number || "",
      }),
      error: "",
    });
  }
  if (field === "entityType") {
    return patchTrackingState(state, {
      prompt: trackingPrompt({
        ...existing,
        entityType: value,
        playerId: "",
        playerLabel: "",
        teamSide: "",
        shirtNumber: "",
      }),
      error: "",
    });
  }
  if (["teamSide", "playerLabel", "shirtNumber"].includes(field)) {
    return patchTrackingState(state, {
      prompt: trackingPrompt({ ...existing, [field]: value }),
      error: "",
    });
  }
  if (!trackingRangeFields.has(field)) return state;
  const milliseconds = Math.max(0, Math.round(Number(value) * 1000) || 0);
  const changed = field === "startSeconds"
    ? { ...existing, startMs: milliseconds, endMs: Math.max(milliseconds + 1, existing.endMs) }
    : { ...existing, endMs: Math.max(existing.startMs + 1, milliseconds) };
  const prompt = trackingPrompt(changed);
  const pendingPrompts = (state.presentation?.tracking?.pendingPrompts || []).map((pending) => trackingPrompt({
    ...pending,
    startMs: prompt.startMs,
    endMs: prompt.endMs,
    promptAtMs: Math.max(prompt.startMs, Math.min(prompt.endMs, pending.promptAtMs)),
  }));
  return patchTrackingState(state, { prompt, pendingPrompts, error: "" });
}

export function toggleTrackingTrackSelection(state = {}, trackId = "") {
  const selected = [...(state.presentation?.tracking?.selectedTrackIds || [])].map(String);
  const existingIndex = selected.indexOf(trackId);
  const nextSelected = existingIndex >= 0
    ? selected.filter((id) => id !== trackId)
    : [trackId, ...selected.filter((id) => id !== trackId)].slice(0, 2);
  const item = selectedTrackingItem(state);
  const primary = (item?.objectTracks || []).find((track) => track.id === nextSelected[0]) || null;
  const existingPrompt = state.presentation?.tracking?.prompt || trackingPrompt(trackingItemRange(item || {}));
  const prompt = primary ? trackingPrompt({
    ...existingPrompt,
    entityType: primary.entityType,
    playerId: primary.playerId,
    playerLabel: primary.playerLabel,
    teamSide: primary.teamSide,
    shirtNumber: primary.shirtNumber,
  }) : existingPrompt;
  return patchTrackingState(state, { selectedTrackIds: nextSelected, prompt, error: "" });
}
