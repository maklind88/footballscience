// Display only a scoped, internally consistent outcome. Older clients may update
// the legacy fields without updating this record; that must become unknown.
export function readSnapshotState(manifest, scope) {
  const outcome = manifest?.snapshotOutcome;
  if (typeof scope !== "string" || !scope || outcome?.scope !== scope) return "unknown";
  if (outcome.state === "available" && typeof outcome.snapshotAt === "string" && outcome.snapshotAt &&
      outcome.snapshotAt === manifest.lastSnapshotAt && !manifest.lastSnapshotError) return "available";
  if (["paused", "failed", "busy"].includes(outcome.state) && typeof outcome.error === "string" && outcome.error &&
      outcome.error === manifest.lastSnapshotError) return outcome.state;
  return "unknown";
}
