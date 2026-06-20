import { addClipToReviewSection } from "./reviewSessionService.js";
import { trimClipDraft } from "./timelineService.js";
import { findButtonByHotkey, shouldIgnoreShortcutTarget } from "./codingTemplateService.js";

export function handleVideoAnalysisShortcut(event, handlers = {}) {
  const {
    applyCodeButton,
    getCurrentMs,
    getState,
    root,
    saveDraftClip,
    togglePlayback,
    trimSelectedClipByKeyboard,
    update,
  } = handlers;
  if (!root || (event.target !== root.ownerDocument?.body && !root.contains(event.target))) return false;
  if (shouldIgnoreShortcutTarget(event.target)) return false;
  const key = String(event.key || "");
  const lowerKey = key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && lowerKey === "f") {
    event.preventDefault();
    root.querySelector('[data-video-analysis-filter="search"]')?.focus();
    return true;
  }
  if ((event.metaKey || event.ctrlKey) && lowerKey === "l") {
    event.preventDefault();
    const selectedClipId = getState().selectedClipId;
    if (selectedClipId) {
      update((state) => ({
        ...state,
        reviewSections: addClipToReviewSection(state.reviewSections, state.activeReviewSectionId, selectedClipId),
        message: "Clip added to review.",
      }));
    }
    return true;
  }
  if (key === " ") {
    event.preventDefault();
    togglePlayback();
    return true;
  }
  if ((event.metaKey || event.ctrlKey) && (lowerKey === "i" || lowerKey === "o")) {
    event.preventDefault();
    const deltaMs = lowerKey === "i"
      ? (event.shiftKey ? 1000 : -1000)
      : (event.shiftKey ? -1000 : 1000);
    trimSelectedClipByKeyboard?.({
      edge: lowerKey === "i" ? "start" : "end",
      deltaMs,
    });
    return true;
  }
  if (lowerKey === "i" || lowerKey === "o") {
    event.preventDefault();
    const currentMs = getCurrentMs();
    update((state) => ({
      ...state,
      draft: { ...state.draft, [lowerKey === "i" ? "startMs" : "endMs"]: currentMs },
      codingSession: { ...(state.codingSession || {}), manualInMs: lowerKey === "i" ? currentMs : state.codingSession?.manualInMs },
    }));
    return true;
  }
  if (lowerKey === "p") {
    event.preventDefault();
    update((state) => {
      const players = state.players || [];
      if (!players.length) return state;
      const index = players.findIndex((player) => player.id === state.draft.playerId);
      const nextPlayer = players[(index + 1) % players.length];
      return { ...state, draft: { ...state.draft, playerId: nextPlayer.id } };
    });
    return true;
  }
  if (key === "Enter") {
    event.preventDefault();
    saveDraftClip();
    return true;
  }
  if (event.shiftKey && (key === "ArrowLeft" || key === "ArrowRight")) {
    event.preventDefault();
    update((state) => ({
      ...state,
      draft: trimClipDraft(state.draft, key === "ArrowLeft" ? "start" : "end", key === "ArrowLeft" ? -100 : 100),
    }));
    return true;
  }
  const button = findButtonByHotkey(getState().template, lowerKey);
  if (button) {
    event.preventDefault();
    applyCodeButton(button.id);
    return true;
  }
  return false;
}
