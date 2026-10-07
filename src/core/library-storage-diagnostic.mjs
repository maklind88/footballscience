const libraryKey = "football-session-exercise-library-v1";
const backupKey = "football-session-exercise-library-backup-v1";

// Native reads only, no normalization: an incomplete or different backup must
// never be called identical. Equality is diagnostic, never permission to delete.
export function inspectLibraryMirror(storage) {
  try {
    const raw = storage.getItem(libraryKey), backupRaw = storage.getItem(backupKey);
    if (raw === null || backupRaw === null) return { status: "missing" };
    if (typeof raw !== "string" || typeof backupRaw !== "string" || raw.length > 10_000_000 || backupRaw.length > 10_000_000) return { status: "unavailable" };
    const library = JSON.parse(raw), backup = JSON.parse(backupRaw);
    if (!Array.isArray(library) || backup?.schema !== backupKey || !Array.isArray(backup.exercises) ||
        backup.count !== backup.exercises.length) return { status: "invalid" };
    if (storage.getItem(libraryKey) !== raw || storage.getItem(backupKey) !== backupRaw) return { status: "changed" };
    return { status: JSON.stringify(library) === JSON.stringify(backup.exercises) ? "matching" : "different",
      exerciseCount: library.length, backupExerciseCount: backup.exercises.length };
  } catch { return { status: "unavailable" }; }
}
