// Keep the existing byte representation (including its original save time) when
// the full payload is unchanged. Never omit the storage write: a bridge read may
// exist only in memory and still need a native durable copy.
export function reuseUnchangedLibraryBackup(previousValue, envelope, collection) {
  if (typeof previousValue !== "string") return JSON.stringify(envelope);
  try {
    const previous = JSON.parse(previousValue);
    if (previous?.schema === envelope.schema && previous.count === envelope.count &&
        typeof previous.savedAt === "string" && previous.savedAt &&
        Array.isArray(previous[collection]) &&
        JSON.stringify(previous[collection]) === JSON.stringify(envelope[collection])) return previousValue;
  } catch {}
  return JSON.stringify(envelope);
}
