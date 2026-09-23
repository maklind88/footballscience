import { getClipEndMs, getClipStartMs } from "./timeline.selectors.js";

export function timelineClipHitInsets(clips = [], window = {}) {
  const windowStart = Math.max(0, Number(window.startMs || 0));
  const windowEnd = windowStart + Math.max(1, Number(window.durationMs || 1));
  let previousEnd = windowStart;

  // Split empty gaps between chronological clips; never expand into another clip.
  return clips.map((clip, index) => {
    const start = Math.max(windowStart, getClipStartMs(clip));
    const end = Math.min(windowEnd, getClipEndMs(clip));
    const duration = Math.max(1, end - start);
    const nextStart = index + 1 < clips.length ? getClipStartMs(clips[index + 1]) : windowEnd;
    const before = Math.max(0, start - previousEnd) / 2;
    const after = previousEnd > end ? 0 : Math.max(0, Math.min(windowEnd, nextStart) - end) / 2;
    previousEnd = Math.max(previousEnd, end);
    return `--video-analysis-clip-hit-before:${before / duration * 100}%;--video-analysis-clip-hit-after:${after / duration * 100}%;--video-analysis-clip-space-end:${(windowEnd - start) / duration * 100}%;`;
  });
}
