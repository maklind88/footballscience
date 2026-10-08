import { createLibrarySaveClient } from "./library-save-client.mjs";
import { librarySaveKeys } from "./library-save-protocol.mjs";

// Compatibility boundary: native legacy copies remain untouched and are never
// adopted as edits by a different account. New library reads/writes use IndexedDB.
export function createLibrarySaveBridge({ win, getScope, isDevelopment, canWrite, getPending, syncKey, setCached, readNative = () => null }) {
  const backupKeys = new Set(["football-session-exercise-library-backup-v1", "football-session-exercise-library-folders-backup-v1"]);
  const states = new Map();
  let inFlight = 0;
  win.addEventListener?.("beforeunload", event => {
    if (inFlight) { event.preventDefault(); event.returnValue = ""; }
  });
  const handles = key => !isDevelopment() && librarySaveKeys.includes(key) && !getPending(key)?.pendingCentralSync;
  const client = createLibrarySaveClient({ getScope,
    canWrite: key => handles(key) && canWrite(key),
    send: (key, change, revision, expected) => expected === getScope()
      ? syncKey(key, "", { libraryChange: change, baseRevision: revision })
      : Promise.resolve({ ok: false, staleContext: true }),
    onState(key, state) {
      const scope = getScope();
      states.set(key, { ...state, scope });
      if (typeof state.value === "string") setCached(key, state.value, {
        source: state.pending ? "library-journal-pending" : "library-central-read",
        durable: Boolean(state.cached || state.locallySaved), serverBacked: Boolean(state.centrallySaved || state.serverBacked), readScope: scope,
      });
      win.dispatchEvent?.(new win.CustomEvent("footballscience:library-save-status", {
        detail: { key, scope, pending: Boolean(state.pending), centrallySaved: Boolean(state.centrallySaved),
          offlineAvailable: Boolean(state.cached || state.locallySaved), conflict: Boolean(state.conflict || state.conflicts?.length) },
      }));
    },
  });
  return { handles, client,
    isLibraryKey: key => librarySaveKeys.includes(key) || backupKeys.has(key),
    async prepare(entries, metadata, options = {}) {
      const expected = getScope();
      if (!expected || isDevelopment()) return;
      for (const key of librarySaveKeys) {
        if (!handles(key) || (options.readKeys && !options.readKeys.includes(key))) continue;
        if (options.deniedKeys?.includes(key)) {
          await client.denyRead(key, expected); continue;
        }
        const present = Object.hasOwn(entries, key), absent = options.absentKeys?.includes(key);
        if (!present && !absent) continue;
        if (expected !== getScope() || options.isCurrent?.() === false) return;
        const value = present ? entries[key] : "[]";
        const revision = metadata[key]?.revision ?? 0;
        // Archive only an owned legacy generation or bytes already authorized by
        // this central read. Unknown/different legacy copies remain native.
        let nativeValue = null;
        try { nativeValue = readNative(key); } catch {}
        const entry = getPending(key);
        if (typeof nativeValue === "string" && (nativeValue === value || entry?.principalScope === expected)) {
          const ownership = entry?.principalScope === expected ? "owner-proven" : "central-content-match";
          // Fresh read receipts do not create another full copy of unchanged
          // legacy bytes. Keep the first complete metadata for this generation.
          const generation = Object.fromEntries(["hash", "writes", "updatedAt", "deletedAt", "principalScope", "pendingBaseRevision"]
            .filter(name => entry?.[name] !== undefined).map(name => [name, entry[name]]));
          await client.store.archive(expected, key, nativeValue, { ownership, entry: entry || {} }, { ownership, generation }).catch(() => {});
        }
        if (expected !== getScope() || options.isCurrent?.() === false) return;
        try {
          const view = await client.observe(key, value, revision, expected);
          if (!view && expected === getScope()) throw new Error("Invalid library revision.");
        } catch {
          if (expected !== getScope()) return;
          states.set(key, { ...states.get(key), scope: expected, readError: true });
          win.dispatchEvent?.(new win.CustomEvent("footballscience:library-save-status", { detail: { key, scope: expected, readError: true } }));
        }
      }
    },
    apply(key, value) {
      if (isDevelopment()) return false;
      if (backupKeys.has(key) && !getPending(key)?.pendingCentralSync) {
        setCached(key, value, { source: "library-central-backup", durable: false, serverBacked: true, readScope: getScope() });
        return true;
      }
      return handles(key);
    },
    async save(key, before, after) {
      if (!handles(key)) return { saved: false, reason: "An earlier local library version is still pending. Keep this page open." };
      inFlight++;
      try { return await client.save(key, before, after); }
      finally { inFlight--; }
    },
    async offline() {
      const expected = getScope();
      if (!expected || isDevelopment()) return;
      const readKeys = [];
      for (const key of librarySaveKeys) if (handles(key) && canWrite(key)) {
        if (expected !== getScope()) return;
        if (await client.loadOffline(key, expected)) readKeys.push(key);
      }
      if (expected === getScope() && readKeys.length) win.dispatchEvent(new win.CustomEvent("footballscience:central-state-partial", { detail: { readKeys } }));
    },
    state: key => states.get(key)?.scope === getScope() ? states.get(key) : null,
    replay: () => client.replay(),
    exportRecovery: () => client.exportRecovery(),
  };
}
