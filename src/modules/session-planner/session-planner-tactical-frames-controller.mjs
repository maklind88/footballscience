// The editor owns a draft view. Selecting a frame never mutates the saved block.
export function createSessionPlannerTacticalFramesController({
  getBlock,
  getKey,
  canEdit,
  cloneElement,
  cloneFrame,
  normalizeFrames,
  markFields,
  writeState,
  clearInteraction,
  render,
  showToast,
  confirmDelete,
  maxFrames = 24,
}) {
  let entry = null;
  const selection = new Map();
  const fields = ["tacticalFrames", "tacticalActiveFrameId", "tacticalElements", "tacticalPitchMode"];
  const signature = (block) => JSON.stringify([...fields, "visualImage", "diagram"].map((field) => block?.[field]));

  function readFrames(block) {
    const frames = normalizeFrames(block?.tacticalFrames);
    if (!frames.length) {
      frames.push(cloneFrame({
        id: `tactical-first-${block.id}`,
        label: "Frame 1",
        elements: block.tacticalElements || [],
      }));
    } else {
      const active = frames.find((frame) => frame.id === block.tacticalActiveFrameId);
      if (active && Array.isArray(block.tacticalElements)) {
        active.elements = block.tacticalElements.map(cloneElement);
      }
    }
    return frames;
  }

  function getEditorBlock() {
    const source = getBlock();
    if (!source) return null;
    const key = getKey();
    const stamp = signature(source);
    if (entry?.key === key && entry.stamp === stamp) {
      entry.source = source;
      return entry.view;
    }
    const frames = readFrames(source);
    const selectedId = selection.get(key) || source.tacticalActiveFrameId;
    const frame = frames.find((item) => item.id === selectedId) || frames[0];
    entry = {
      source, key, stamp,
      contentStamp: JSON.stringify([frames, source.tacticalPitchMode]),
      view: { ...source, tacticalFrames: frames, tacticalActiveFrameId: frame.id,
        tacticalElements: frame.elements.map(cloneElement) },
    };
    clearInteraction();
    return entry.view;
  }

  function getFrames() {
    return getEditorBlock()?.tacticalFrames || [];
  }

  function getActiveId() {
    return getEditorBlock()?.tacticalActiveFrameId || "";
  }

  function syncFrame(view) {
    const active = view?.tacticalFrames.find((frame) => frame.id === view.tacticalActiveFrameId);
    if (active) active.elements = view.tacticalElements.map(cloneElement);
  }

  function persist(view = entry?.view) {
    if (!canEdit() || !view || !entry) return false;
    const source = getBlock();
    if (view !== entry.view || source !== entry.source || getKey() !== entry.key || signature(source) !== entry.stamp) {
      entry = null;
      clearInteraction();
      showToast("The board changed. Review the latest frames before editing again.", "warning");
      render();
      return false;
    }
    syncFrame(view);
    const newContent = JSON.stringify([view.tacticalFrames, view.tacticalPitchMode]);
    if (entry.contentStamp === newContent) return false;
    source.tacticalFrames = normalizeFrames(view.tacticalFrames);
    source.tacticalActiveFrameId = view.tacticalActiveFrameId;
    source.tacticalElements = view.tacticalElements.map(cloneElement);
    source.tacticalPitchMode = view.tacticalPitchMode;
    // The active frame and its legacy mirror must retain the same merge timestamp.
    const changedFields = ["tacticalFrames", "tacticalActiveFrameId", "tacticalElements"];
    if (source.tacticalPitchMode !== JSON.parse(entry.stamp)[3]) changedFields.push("tacticalPitchMode");
    entry.stamp = signature(source);
    entry.contentStamp = newContent;
    markFields(source, changedFields);
    writeState();
    return true;
  }

  function select(frameId) {
    const view = getEditorBlock();
    const frame = view?.tacticalFrames.find((item) => item.id === frameId);
    if (!frame || frameId === view.tacticalActiveFrameId) return false;
    selection.set(entry.key, frameId);
    view.tacticalActiveFrameId = frameId;
    view.tacticalElements = frame.elements.map(cloneElement);
    clearInteraction();
    render();
    return true;
  }

  function replace(block, frames, activeId) {
    const view = getEditorBlock();
    if (!canEdit() || !view || (block !== view && block !== getBlock())) return false;
    const normalized = normalizeFrames(frames);
    if (!normalized.length) return false;
    const frame = normalized.find((item) => item.id === activeId) || normalized[0];
    view.tacticalFrames = normalized;
    view.tacticalActiveFrameId = frame.id;
    view.tacticalElements = frame.elements.map(cloneElement);
    selection.set(entry.key, frame.id);
    const saved = persist(view);
    clearInteraction();
    render();
    return saved;
  }

  function next() {
    if (!canEdit()) return false;
    const view = getEditorBlock();
    if (!view) return false;
    const frames = view.tacticalFrames;
    if (frames.length >= maxFrames) {
      showToast(`Max ${maxFrames} frames per board.`, "warning");
      return false;
    }
    syncFrame(view);
    const index = frames.findIndex((frame) => frame.id === view.tacticalActiveFrameId);
    const frame = cloneFrame({ label: `Frame ${frames.length + 1}`, elements: view.tacticalElements });
    frames.splice(index + 1, 0, frame);
    view.tacticalActiveFrameId = frame.id;
    view.tacticalElements = frame.elements.map(cloneElement);
    selection.set(entry.key, frame.id);
    const saved = persist(view);
    clearInteraction();
    render();
    return saved;
  }

  async function remove() {
    if (!canEdit()) return false;
    const view = getEditorBlock();
    if (!view || view.tacticalFrames.length <= 1) return false;
    const activeId = view.tacticalActiveFrameId;
    if (!(await confirmDelete())) return false;
    if (!canEdit() || view !== getEditorBlock() || view.tacticalActiveFrameId !== activeId) return false;
    const frames = view.tacticalFrames;
    const index = frames.findIndex((frame) => frame.id === view.tacticalActiveFrameId);
    frames.splice(index, 1);
    const frame = frames[Math.min(index, frames.length - 1)];
    view.tacticalActiveFrameId = frame.id;
    view.tacticalElements = frame.elements.map(cloneElement);
    selection.set(entry.key, frame.id);
    const saved = persist(view);
    clearInteraction();
    render();
    return saved;
  }

  function reset() {
    entry = null;
    selection.clear();
  }

  return { getEditorBlock, getFrames, getActiveId, persist, select, replace, next, remove, reset };
}
