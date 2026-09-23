import { timelineSelectedClipIds, clipsForTimelineSelection } from "../services/clipEditingService.js";

export function selectTimelineGroup(state, clips, { toggle = false, category = null } = {}) {
  const ids = [...new Set(clips.map(clip => clip.id).filter(Boolean))];
  const selected = new Set(timelineSelectedClipIds(state));
  const alreadySelected = ids.length > 0 && ids.every(id => selected.has(id));
  if (toggle) {
    for (const id of ids) alreadySelected ? selected.delete(id) : selected.add(id);
  } else if (!alreadySelected) {
    selected.clear();
    for (const id of ids) selected.add(id);
  }
  const selectedClipId = ids.find(id => selected.has(id)) || [...selected].at(-1) || "";
  const versions = { ...state.timeline?.selectedReviewClips };
  if (!toggle && !alreadySelected) for (const id of Object.keys(versions)) delete versions[id];
  for (const clip of clips) if ((!toggle || !alreadySelected) && selected.has(clip.id)) versions[clip.id] = clip;
  for (const id of Object.keys(versions)) if (!selected.has(id)) delete versions[id];
  return {
    ...state, selectedClipId,
    timeline: {
      ...state.timeline, selectedClipIds: [...selected], selectedReviewClips: versions, editorOpen: false,
      selectedCategory: {
        ...state.timeline?.selectedCategory, ...category,
        activeClipId: selectedClipId, viewOpen: false, menuOpen: false,
        keyboardDeleteScope: category ? "category" : "clip",
      },
    },
  };
}

export function timelineReviewSelection(state, clickedClips) {
  const selected = clipsForTimelineSelection(state).map(clip => state.timeline?.selectedReviewClips?.[clip.id] || clip);
  const ids = new Set(selected.map(clip => clip.id));
  return clickedClips.length && clickedClips.every(clip => ids.has(clip.id)) ? selected : clickedClips;
}
