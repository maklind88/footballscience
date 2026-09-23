const blockedActions = new Set([
  "correct",
  "extend-earlier",
  "extend-later",
  "complete-range",
  "verify",
  "add-graphic",
]);

export const TRACKING_PREANNOTATION_PREVIEW_BLOCKED =
  "Save the preannotation suggestion before using tracking corrections or graphics.";

export function blockTrackingPreannotationPreview(track = null, onBlocked = () => {}, action = "") {
  if (track?.metadata?.preannotationReviewPreview !== true
    || (action && !blockedActions.has(action))) return false;
  onBlocked(TRACKING_PREANNOTATION_PREVIEW_BLOCKED);
  return true;
}
