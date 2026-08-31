const placeholderIdentities = new Set([
  "anonymous",
  "local-analyst",
  "replace-after-exhaustive-review",
  "replace_after_exhaustive_review",
  "unknown",
]);

function identityValue(value = null) {
  if (typeof value === "string") return value;
  return value?.id || value?.userId || value?.user_id || "";
}

export function normalizeTrackingReviewerIdentity(value = null) {
  const rawIdentity = String(identityValue(value) || "");
  if (/[\u0000-\u001f\u007f]/.test(rawIdentity)) return "";
  const identity = rawIdentity.trim().replace(/\s+/g, " ");
  if (!identity
    || identity.length > 160
    || placeholderIdentities.has(identity.toLowerCase())) return "";
  return identity;
}

export function trackingReviewerIdentityReady(value = null) {
  return Boolean(normalizeTrackingReviewerIdentity(value));
}
