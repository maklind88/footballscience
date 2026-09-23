import { shouldIgnoreShortcutTarget } from "../services/codingTemplateService.js";
import { activeMediaAngle, mediaAnglesForState, mediaReferenceForAngle } from "../services/mediaProductionService.js";

const PANEL = "[data-video-analysis-media-production]";
const TOGGLE = ".video-analysis-player-camera-button";

export function createMediaCameraController(options = {}) {
  const state = () => options.getState?.() || {};
  const root = () => options.getRoot?.();
  let pendingSwitch = null;
  let cancelMetadata = () => {};

  function close() {
    options.updateState?.(current => ({
      ...current, mediaProduction: { ...current.mediaProduction, panelOpen: false },
    }));
    root()?.querySelector(TOGGLE)?.focus({ preventScroll: true });
    return true;
  }

  function beforePaint() {
    const dialog = root()?.querySelector(PANEL);
    const focused = dialog?.ownerDocument.activeElement;
    if (!dialog?.contains(focused)) return null;
    return {
      tag: focused.tagName, data: { ...focused.dataset },
      value: focused.matches("input:not([type=file]), textarea") ? focused.value : undefined,
      start: focused.selectionStart, end: focused.selectionEnd,
      scrollTop: dialog.scrollTop,
    };
  }

  function afterPaint(previousFocus) {
    const dialog = root()?.querySelector(PANEL);
    if (!dialog || !state().mediaProduction?.panelOpen) return;
    if (!dialog.open) {
      dialog.addEventListener("cancel", event => { event.preventDefault(); close(); }, { once: true });
      dialog.showModal();
    }
    const focus = previousFocus && [...dialog.querySelectorAll("button, input, select, textarea")].find(element => (
      !element.disabled && element.tagName === previousFocus.tag
      && Object.entries(previousFocus.data).every(([key, value]) => element.dataset[key] === value)
    ));
    if (focus) {
      if (previousFocus.value !== undefined) focus.value = previousFocus.value;
      focus.focus({ preventScroll: true });
      if (Number.isInteger(previousFocus.start)) focus.setSelectionRange?.(previousFocus.start, previousFocus.end);
      dialog.scrollTop = previousFocus.scrollTop;
    } else {
      (dialog.querySelector('[data-video-analysis-media-action="select-angle"][aria-pressed="true"]:not(:disabled)')
        || dialog.querySelector('[data-video-analysis-media-action="close"]'))?.focus({ preventScroll: true });
    }
  }

  function selectAngle(id) {
    const current = state();
    if (current.mediaProduction?.portable?.playback?.active) return false;
    const angle = mediaAnglesForState(current).find(entry => entry.id === id);
    if (!angle || !mediaReferenceForAngle(current, angle)?.objectUrl) return false;
    if (id === activeMediaAngle(current)?.id) return true;
    const previousVideo = options.getVideoElement?.();
    const selection = {
      id,
      matchMs: pendingSwitch?.matchMs ?? options.getCurrentMatchMs?.() ?? current.timeline?.playheadMs ?? 0,
      playing: pendingSwitch?.playing ?? Boolean(previousVideo && !previousVideo.paused && !previousVideo.ended),
    };
    cancelMetadata();
    pendingSwitch = selection;
    previousVideo?.pause?.();
    options.updateState?.(value => ({
      ...value,
      mediaProduction: { ...value.mediaProduction, activeAngleId: id, error: "" },
    }));
    options.getWindow?.()?.requestAnimationFrame(() => {
      if (pendingSwitch !== selection) return;
      const video = options.getVideoElement?.();
      const restore = () => {
        if (pendingSwitch !== selection || activeMediaAngle(state())?.id !== id) return;
        options.seekToMatchMs?.(selection.matchMs);
        if (selection.playing) options.getVideoElement?.()?.play?.().catch?.(() => {});
        options.syncSecondaryVideos?.(options.getVideoElement?.());
        pendingSwitch = null;
        cancelMetadata();
      };
      // A new source cannot reliably seek until its metadata has loaded.
      if (video && video.readyState < 1) {
        video.addEventListener("loadedmetadata", restore, { once: true });
        const fail = () => { if (pendingSwitch === selection) pendingSwitch = null; cancelMetadata(); };
        video.addEventListener("error", fail, { once: true });
        cancelMetadata = () => {
          video.removeEventListener("loadedmetadata", restore);
          video.removeEventListener("error", fail);
          cancelMetadata = () => {};
        };
      } else restore();
    });
    return true;
  }

  function handleShortcut(event) {
    const target = event.target;
    const doc = root()?.ownerDocument;
    const cameraDialog = root()?.querySelector(PANEL);
    if (doc?.querySelector("dialog[open]") && !cameraDialog?.open) return false;
    if (target !== doc?.body && !root()?.contains(target)) return false;
    if (shouldIgnoreShortcutTarget(target) || event.isComposing) return false;
    if (!event.altKey || event.ctrlKey || event.metaKey || (event.code !== "KeyC" && String(event.key).toLowerCase() !== "c")) return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat || state().mediaProduction?.portable?.playback?.active) return true;
    const angles = mediaAnglesForState(state()).filter(angle => mediaReferenceForAngle(state(), angle)?.objectUrl);
    if (angles.length < 2) return true;
    const index = angles.findIndex(angle => angle.id === activeMediaAngle(state())?.id);
    const next = index < 0 ? 0 : (index + (event.shiftKey ? -1 : 1) + angles.length) % angles.length;
    selectAngle(angles[next].id);
    return true;
  }

  function dispose() { pendingSwitch = null; cancelMetadata(); }
  return { afterPaint, beforePaint, close, dispose, handleShortcut, selectAngle };
}
