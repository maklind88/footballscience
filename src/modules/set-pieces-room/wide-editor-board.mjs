const observers = new WeakMap();

export function getSetPiecesWideEditorProjection(rect = {}, viewBox = {}) {
  const width = Number(rect.width || 0);
  const height = Number(rect.height || 0);
  const viewBoxWidth = Number(viewBox.width || 0);
  const viewBoxHeight = Number(viewBox.height || 0);
  if (!width || !height || !viewBoxWidth || !viewBoxHeight) return { active: false, counterScale: 1 };
  const naturalAspect = viewBoxWidth / viewBoxHeight;
  const availableAspect = width / height;
  const active = availableAspect > naturalAspect * 1.04;
  const horizontalScale = width / viewBoxWidth;
  const verticalScale = height / viewBoxHeight;
  return {
    active,
    counterScale: active ? Math.min(1, Math.max(.38, verticalScale / horizontalScale)) : 1,
  };
}

function applyWideEditorProjection(root) {
  const pitch = root?.querySelector?.(".spr-pitch.is-wide-editor-pitch");
  const stage = pitch?.closest?.("[data-set-piece-board-stage]");
  const row = pitch?.closest?.(".spr-board-row");
  const slot = stage?.closest?.(".spr-board-stage-slot");
  if (!pitch || !stage || !row || !slot) return;
  const rect = slot.getBoundingClientRect?.();
  const viewBox = pitch.viewBox?.baseVal;
  if (!rect?.width || !rect?.height || !viewBox?.width || !viewBox?.height) return;
  const projection = getSetPiecesWideEditorProjection(rect, viewBox);
  row.classList.toggle("is-wide-projection-active", projection.active);
  pitch.classList.toggle("is-wide-projection-active", projection.active);
  pitch.setAttribute("preserveAspectRatio", projection.active ? "none" : "xMidYMid meet");
  if (!projection.active) {
    pitch.style.removeProperty("--spr-wide-counter-scale");
    return;
  }
  pitch.style.setProperty("--spr-wide-counter-scale", projection.counterScale.toFixed(4));
}

export function syncSetPiecesWideEditorBoard(root, win = globalThis) {
  observers.get(root)?.disconnect?.();
  observers.delete(root);
  const slot = root?.querySelector?.(".spr-shell.is-editing .spr-board-stage-slot");
  const pitch = slot?.querySelector?.(".spr-pitch.is-wide-editor-pitch");
  if (!slot || !pitch) return;
  const apply = () => applyWideEditorProjection(root);
  const ResizeObserverRef = win?.ResizeObserver;
  if (typeof ResizeObserverRef === "function") {
    const observer = new ResizeObserverRef(apply);
    observer.observe(slot);
    observers.set(root, observer);
  }
  if (typeof win?.requestAnimationFrame === "function") win.requestAnimationFrame(apply);
  else apply();
}
