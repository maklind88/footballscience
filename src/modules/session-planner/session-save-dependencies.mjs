import { describeSessionDifferences } from "./session-save-protocol.mjs";

// Structural changes can affect the meaning of every field in a date. Ordinary
// field edits depend only on that field (or the addition/removal of its block).
export function sessionChangesOverlap(first, next) {
  if (first.date !== next.date) return false;
  if (!first.before.session || !next.before.session) return true;
  const changes = (change) => describeSessionDifferences(change.before, change.after, change.date);
  const a = changes(first), b = changes(next);
  const structural = (entry) => ["blockOrder", "deletedExercises"].includes(entry.field);
  if (a.some(structural) || b.some(structural)) return true;
  return a.some((left) => b.some((right) => left.blockId === right.blockId &&
    (left.field === right.field || left.field === "exercise" || right.field === "exercise")));
}
