export const TAG_BUTTON_FEEDBACK_MS = 700;

const now = () => performance.now();
const mediaKey = (state) => `${state.match?.id || ""}:${state.video?.id || ""}`;

// Keep success feedback separate from the draft and historical coding context.
export async function runTagButtonAction(store, key, action, clock = now) {
  const scope = mediaKey(store.getState());
  if (store.getState().codingSession?.tagButtonFeedback?.[key]) {
    store.update((current) => {
      const feedback = { ...current.codingSession.tagButtonFeedback };
      delete feedback[key];
      return { ...current, codingSession: { ...current.codingSession, tagButtonFeedback: feedback } };
    });
  }
  const result = await action();
  const state = store.getState();
  if (!result || state.error || state.status !== "ready" || mediaKey(state) !== scope) return result;
  if (key === `code:${state.codingSession?.openTag?.buttonId}`) return result;
  const at = clock();
  store.update((current) => ({
    ...current,
    codingSession: {
      ...(current.codingSession || {}),
      tagButtonFeedback: {
        ...Object.fromEntries(Object.entries(current.codingSession?.tagButtonFeedback || {})
          .filter(([, feedback]) => feedback.scope === scope && at - feedback.at < TAG_BUTTON_FEEDBACK_MS)),
        [key]: { at, scope },
      },
    },
  }));
  return result;
}

export function renderTagButtonFeedback(state, key, at = now()) {
  const feedback = state.codingSession?.tagButtonFeedback?.[key];
  if (!feedback || feedback.scope !== mediaKey(state)) return "";
  const elapsed = at - feedback.at;
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= TAG_BUTTON_FEEDBACK_MS) return "";
  // A repaint resumes the original pulse instead of restarting it.
  return `<span class="video-analysis-tag-feedback" aria-hidden="true" style="animation-duration:${TAG_BUTTON_FEEDBACK_MS}ms;animation-delay:-${Math.floor(elapsed)}ms"></span>`;
}
