import { createLibraryChange, libraryRecords } from "./library-save-protocol.mjs";

// Display normalization may add defaults to old records. Compare the displayed
// versions to identify edits, but send the exact observed server predecessor.
export function prepareLibraryViewChange(key, observedValue, beforeView, afterView, retainedEdit = null) {
  if (retainedEdit) {
    beforeView = beforeView.map(row => row.id === retainedEdit.id ? retainedEdit.view : row);
    observedValue = JSON.stringify(libraryRecords(observedValue).map(row => row.id === retainedEdit.id ? retainedEdit.raw : row));
  }
  const changed = createLibraryChange(key, beforeView, afterView, "view");
  const records = new Map(libraryRecords(observedValue).map(record => [record.id, record]));
  for (const record of changed.records) records.set(record.id, { ...records.get(record.id), ...record.after });
  return { before: observedValue, after: JSON.stringify([...records.values()]) };
}
