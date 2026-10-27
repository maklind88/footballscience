// Display projection only: never acknowledges, replays or removes retained work.
export function projectSaveStatusScope(manifest, centralStatus, scope) {
  const pendingEntries = Object.values(manifest.entries || {}).filter(entry =>
    entry?.pendingCentralSync && (!scope || !entry.principalScope || entry.principalScope === scope));
  const ownedPending = pendingEntries.filter(entry => scope && entry.principalScope === scope);
  // Legacy/unknown ownership remains visible, but cannot borrow another account's timestamp.
  const pendingAt = pendingEntries.length === ownedPending.length
    ? ownedPending.map(entry => entry.updatedAt || "").sort().at(-1) || "" : "";
  const savedAt = scope && centralStatus.lastSavedScope === scope ? centralStatus.lastSavedAt || "" : "";
  const fetchedAt = scope && centralStatus.lastFetchedScope === scope ? centralStatus.lastFetchedAt || "" : "";
  return { pending: pendingEntries.length > 0, pendingAt, savedAt, fetchedAt,
    confirmedAt: [savedAt, fetchedAt].sort().at(-1) || "" };
}
