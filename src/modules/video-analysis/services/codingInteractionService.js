const defaultTargetToleranceMs = 250;
export const sameMomentTagWindowMs = 2000;
const defaultSameMomentToleranceMs = sameMomentTagWindowMs;

function normalizeMs(value = 0, fallback = 0) {
  const number = Math.round(Number(value ?? fallback));
  return Number.isFinite(number) ? number : fallback;
}

function clipId(clip = {}) {
  return String(clip.id || clip.clipId || clip.clip_id || "").trim();
}

export function codingClipStartMs(clip = {}) {
  return Math.max(0, normalizeMs(clip.startMs ?? clip.start_ms, 0));
}

export function codingClipEndMs(clip = {}) {
  const startMs = codingClipStartMs(clip);
  return Math.max(startMs + 1, normalizeMs(clip.endMs ?? clip.end_ms, startMs + 1));
}

export function clipContainsPlayhead(clip = {}, playheadMs = 0, toleranceMs = defaultTargetToleranceMs) {
  if (!clipId(clip)) return false;
  const currentMs = Math.max(0, normalizeMs(playheadMs, 0));
  const tolerance = Math.max(0, normalizeMs(toleranceMs, defaultTargetToleranceMs));
  return currentMs >= codingClipStartMs(clip) - tolerance && currentMs <= codingClipEndMs(clip) + tolerance;
}

export function codingClipsFromState(state = {}) {
  const clips = [
    ...(Array.isArray(state.clips) ? state.clips : []),
    ...(Array.isArray(state.allClips) ? state.allClips : []),
  ];
  const seen = new Set();
  return clips.filter((clip) => {
    const id = clipId(clip);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function compareSpecificClip(a = {}, b = {}) {
  const durationA = codingClipEndMs(a) - codingClipStartMs(a);
  const durationB = codingClipEndMs(b) - codingClipStartMs(b);
  if (durationA !== durationB) return durationA - durationB;
  return codingClipStartMs(b) - codingClipStartMs(a);
}

export function resolveCodingTargetClip(state = {}, playheadMs = 0, options = {}) {
  const clips = codingClipsFromState(state);
  const toleranceMs = options.toleranceMs ?? defaultTargetToleranceMs;
  const clipsById = new Map(clips.map((clip) => [clipId(clip), clip]));
  const priorityIds = [
    state.selectedClipId,
    state.timeline?.selectedCategory?.activeClipId,
    state.codingSession?.lastClipId,
  ].map((id) => String(id || "").trim()).filter(Boolean);

  for (const id of priorityIds) {
    const clip = clipsById.get(id);
    if (clip && clipContainsPlayhead(clip, playheadMs, toleranceMs)) return clip;
  }

  return clips
    .filter((clip) => clipContainsPlayhead(clip, playheadMs, toleranceMs))
    .sort(compareSpecificClip)[0] || null;
}

export function resolveSameMomentCodingTargetClips(state = {}, playheadMs = 0, options = {}) {
  const targetClip = resolveCodingTargetClip(state, playheadMs, options);
  if (!targetClip) return [];
  const clips = codingClipsFromState(state);
  const toleranceMs = options.toleranceMs ?? defaultTargetToleranceMs;
  const sameMomentToleranceMs = Math.max(
    0,
    normalizeMs(options.sameMomentToleranceMs ?? defaultSameMomentToleranceMs, defaultSameMomentToleranceMs)
  );
  const targetId = clipId(targetClip);
  const targetStartMs = codingClipStartMs(targetClip);
  return clips
    .filter((clip) => (
      clipId(clip) === targetId
      || (
        clipContainsPlayhead(clip, playheadMs, toleranceMs)
        && Math.abs(codingClipStartMs(clip) - targetStartMs) <= sameMomentToleranceMs
      )
    ))
    .sort(compareSpecificClip);
}

export function currentCodingPlayheadMs(state = {}) {
  return Math.max(0, normalizeMs(
    state.timeline?.playheadMs
    ?? state.draft?.startMs
    ?? state.videoRef?.currentTimeMs
    ?? 0,
    0
  ));
}

export function resolveCurrentCodingTargetClip(state = {}, options = {}) {
  return resolveCodingTargetClip(state, currentCodingPlayheadMs(state), options);
}
