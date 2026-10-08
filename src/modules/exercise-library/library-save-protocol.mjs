export const librarySaveKeys = Object.freeze([
  "football-session-exercise-library-v1", "football-session-exercise-library-folders-v1",
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export const sameLibraryRecord = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

export function libraryRecords(value) {
  const records = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(records)) throw new Error("Library data must be a record list.");
  const ids = new Set();
  for (const row of records) {
    if (!row || typeof row !== "object" || Array.isArray(row) || typeof row.id !== "string" || !row.id.trim() || ids.has(row.id)) {
      throw new Error("Library records require unique ids.");
    }
    ids.add(row.id);
  }
  return records;
}

export function createLibraryChange(key, beforeValue, afterValue, id) {
  if (!librarySaveKeys.includes(key) || typeof id !== "string" || !id) throw new Error("Invalid library change.");
  const before = libraryRecords(beforeValue), after = libraryRecords(afterValue);
  const old = new Map(before.map(row => [row.id, row]));
  const afterIds = new Set(after.map(row => row.id));
  if (before.some(row => !afterIds.has(row.id))) throw new Error("Archive library records instead of deleting them.");
  return { schema: 1, id, key, records: after.filter(row => !sameLibraryRecord(old.get(row.id) ?? null, row)).map(row => ({
    id: row.id, before: old.get(row.id) ?? null, after: row,
  })) };
}

// Each changed record carries its actual observed predecessor. Unrelated records
// are never replaced. Replaying an already-applied change is a content no-op.
export function applyLibraryChange(value, change) {
  if (change?.schema !== 1 || !librarySaveKeys.includes(change.key) || typeof change.id !== "string" || !change.id ||
      !Array.isArray(change.records) || change.records.length > 10000) throw new Error("Invalid library change.");
  const current = libraryRecords(value), byId = new Map(current.map(row => [row.id, row]));
  const seen = new Set(), conflicts = [];
  for (const record of change.records) {
    if (!record || record.id !== record.after?.id || seen.has(record.id) ||
        (record.before !== null && record.before?.id !== record.id)) throw new Error("Invalid library record change.");
    libraryRecords([record.after]);
    if (record.before !== null) libraryRecords([record.before]);
    seen.add(record.id);
    const existing = byId.get(record.id) ?? null;
    if (!sameLibraryRecord(existing, record.before) && !sameLibraryRecord(existing, record.after)) conflicts.push(record.id);
  }
  if (conflicts.length) return { ok: false, conflicts };
  for (const record of change.records) byId.set(record.id, record.after);
  const valueNext = JSON.stringify([...byId.values()]);
  return { ok: true, value: valueNext, unchanged: sameLibraryRecord(current, [...byId.values()]) };
}
