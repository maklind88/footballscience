import { createLibraryChange, libraryRecords, librarySaveKeys } from "./library-save-protocol.mjs";

// Import is a review operation only. It never replays an old queue or replaces
// current central data merely because a file was selected.
export async function importLibraryRecovery({ payload, client, getScope }) {
  const scope = getScope(), source = payload?.libraryRecovery || payload;
  if (!scope || source?.schema !== "football-library-recovery-v1") throw new Error("This file has no supported library recovery data.");
  const rows = [...(source.pending || []), ...(source.recovery || []), ...(source.baselines || [])];
  if (rows.length > 1000 || rows.some(row => row.scope !== scope || !librarySaveKeys.includes(row.key))) {
    throw new Error("This backup belongs to another account/team or exceeds the import limit.");
  }
  const prepared = [];
  for (const row of rows) {
    const before = client.centralValue(row.key);
    if (typeof before !== "string") throw new Error("Load the central library before reviewing this backup.");
    const desired = row.change ? row.change.records.map(record => record.after) : libraryRecords(row.value);
    const combined = new Map(libraryRecords(before).map(record => [record.id, record]));
    for (const record of libraryRecords(desired)) combined.set(record.id, record);
    const change = createLibraryChange(row.key, before, JSON.stringify([...combined.values()]), "import");
    if (!change.records.length) continue;
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([scope, change]))))]
      .map(byte => byte.toString(16).padStart(2, "0")).join("");
    change.id = `import-${hash}`;
    prepared.push({ scope, key: row.key, change, status: "review", createdAt: 0, imported: true });
  }
  for (const row of prepared) {
    if (scope !== getScope()) throw new Error("Account changed. Imported copies remain with their original account.");
    await client.store.putPending(row);
  }
  return { reviewCount: prepared.length };
}
