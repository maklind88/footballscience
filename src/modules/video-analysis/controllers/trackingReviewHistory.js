import { normalizeObjectTrack } from "../domain/tracking.model.js";

const maximumHistoryEntries = 20;

export function historyEntry(map, trackId = "") {
  return map.get(trackId) || [];
}

export function pushHistory(map, trackId = "", track = {}, sequence = 0) {
  const entries = [...historyEntry(map, trackId), {
    sequence,
    track: normalizeObjectTrack(track),
  }].slice(-maximumHistoryEntries);
  map.set(trackId, entries);
}

export function compoundHistory(map, itemId = "") {
  return map.get(itemId) || [];
}

export function pushCompoundHistory(map, itemId = "", transaction = {}) {
  map.set(itemId, [
    ...compoundHistory(map, itemId),
    transaction,
  ].slice(-maximumHistoryEntries));
}

export function latestHistoryCandidate(trackId, itemId, trackMap, compoundMap) {
  const single = historyEntry(trackMap, trackId).at(-1) || null;
  const compound = compoundHistory(compoundMap, itemId).at(-1) || null;
  const matchingCompound = compound?.affectedTrackIds?.includes(trackId) ? compound : null;
  if (!single) return matchingCompound ? { kind: "compound", value: matchingCompound } : null;
  if (!matchingCompound || single.sequence > matchingCompound.sequence) {
    return { kind: "single", value: single };
  }
  return { kind: "compound", value: matchingCompound };
}

export function historyDescriptor(itemId, trackId, undoByTrackId, redoByTrackId, compoundUndo, compoundRedo) {
  const undo = latestHistoryCandidate(trackId, itemId, undoByTrackId, compoundUndo);
  const redo = latestHistoryCandidate(trackId, itemId, redoByTrackId, compoundRedo);
  return {
    trackId,
    undoCount: undo ? 1 : 0,
    redoCount: redo ? 1 : 0,
  };
}

export function trackSnapshots(item = {}, tracks = [], indexes = []) {
  return tracks.map((track, index) => ({
    index: Number.isInteger(indexes[index])
      ? indexes[index]
      : Math.max(0, (item.objectTracks || []).findIndex((entry) => entry.id === track.id)),
    track: normalizeObjectTrack(track),
  }));
}
