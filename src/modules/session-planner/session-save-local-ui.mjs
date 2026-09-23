export function preserveSessionSaveLocalUi(savedValue, localValue) {
  const saved = JSON.parse(savedValue), local = JSON.parse(localValue);
  if (typeof local?.selectedDate === "string") saved.selectedDate = local.selectedDate;
  for (const [date, session] of Object.entries(saved.sessions || {})) {
    const previous = local.sessions?.[date];
    if (!previous) continue;
    if (session.blocks?.some((block) => block.id === previous.selectedBlockId)) session.selectedBlockId = previous.selectedBlockId;
    const previousBlocks = new Map((previous.blocks || []).map((block) => [block.id, block]));
    for (const block of session.blocks || []) {
      const frameId = previousBlocks.get(block.id)?.tacticalActiveFrameId;
      if (block.tacticalFrames?.some((frame) => frame.id === frameId)) block.tacticalActiveFrameId = frameId;
    }
  }
  return JSON.stringify(saved);
}
