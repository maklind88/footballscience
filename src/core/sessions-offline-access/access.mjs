import { isSessionsOfflineDate, matchesSessionsOfflineLogin, parseSessionsOfflineOwner, verifySessionsOfflineGrant } from "./grant.mjs";
import { readSessionsOfflineDate } from "./reader.mjs";
import { readSessionsOfflinePermission, writeSessionsOfflinePermission } from "./store.mjs";
import { trustedSessionsOfflineKeys } from "./trust.mjs";

export const sessionsOfflinePreparationKey = "football-science-sessions-offline-preparation-v1";

export async function reconcileSessionsOfflineOwner(owner, storage = globalThis.localStorage, indexedDB = globalThis.indexedDB) {
  const marker = storage.getItem(sessionsOfflinePreparationKey);
  if (marker === null) return;
  let currentOwner;
  try { currentOwner = JSON.parse(marker)?.owner; } catch { /* malformed markers are disarmed */ }
  if (!owner || currentOwner !== owner) await invalidateSessionsOfflineAccess({ storage, indexedDB });
}

export async function invalidateSessionsOfflineAccess({ storage = globalThis.localStorage, indexedDB = globalThis.indexedDB } = {}) {
  const marker = storage.getItem(sessionsOfflinePreparationKey);
  if (marker === null) return;
  storage.removeItem(sessionsOfflinePreparationKey);
  if (storage.getItem(sessionsOfflinePreparationKey) !== null) throw new Error("Offline Sessions permission could not be disarmed.");
  await writeSessionsOfflinePermission(indexedDB, null, () => storage.getItem(sessionsOfflinePreparationKey) === null);
}

export async function readPreparedSessionsOffline({
  date, keys = trustedSessionsOfflineKeys, origin = globalThis.location.origin, now,
  storage = globalThis.localStorage, indexedDB = globalThis.indexedDB,
} = {}) {
  const marker = storage.getItem(sessionsOfflinePreparationKey);
  const prepared = JSON.parse(marker);
  if (!prepared?.ready) throw new Error("Connect to prepare Sessions on this device.");
  const record = await readSessionsOfflinePermission(indexedDB);
  if (record?.epoch !== prepared.epoch || !record.grant) throw new Error("Connect to prepare Sessions on this device.");
  const lease = await verifySessionsOfflineGrant(record.grant, keys, { origin, now });
  const valid = async () => storage.getItem(sessionsOfflinePreparationKey) === marker &&
    await matchesSessionsOfflineLogin(lease, storage) && (now ?? Date.now()) < lease.expiresAt &&
    storage.getItem(sessionsOfflinePreparationKey) === marker;
  if (lease.owner !== prepared.owner || date && lease.date !== date || !await valid()) {
    throw new Error("Offline Sessions access or date is unavailable. Connect to prepare it again.");
  }
  const view = await readSessionsOfflineDate(lease, indexedDB);
  if (!await valid()) throw new Error("Offline Sessions access changed while reading this date.");
  return view;
}

export async function prepareSessionsOfflineAccess({
  owner, date, requestGrant, isCurrent, keys = trustedSessionsOfflineKeys, origin = globalThis.location.origin,
  storage = globalThis.localStorage, indexedDB = globalThis.indexedDB,
}) {
  parseSessionsOfflineOwner(owner);
  if (!isSessionsOfflineDate(date) || !isCurrent()) throw new Error("Select a date for the current Sessions team.");
  if (!Object.keys(keys).length) throw new Error("Offline Sessions preparation is disabled.");
  const epoch = crypto.randomUUID();
  const preparing = JSON.stringify({ epoch, owner, ready: false });
  const ready = JSON.stringify({ epoch, owner, ready: true });
  const remainsCurrent = () => isCurrent() && storage.getItem(sessionsOfflinePreparationKey) === preparing;
  // Disarm the previous lease before sending a request that may reveal a denial.
  // Only this preparation can arm its verified result, and only for this owner.
  storage.removeItem(sessionsOfflinePreparationKey);
  storage.setItem(sessionsOfflinePreparationKey, preparing);
  try {
    await writeSessionsOfflinePermission(indexedDB, { epoch }, remainsCurrent);
    if (!remainsCurrent()) throw new Error("The account or team changed during offline preparation.");
    const grant = await requestGrant({ owner, date });
    const lease = await verifySessionsOfflineGrant(grant, keys, { origin });
    if (lease.owner !== owner || lease.date !== date || !await matchesSessionsOfflineLogin(lease, storage) || !remainsCurrent()) {
      throw new Error("Offline Sessions permission does not match this login, team and date.");
    }
    await readSessionsOfflineDate(lease, indexedDB);
    await writeSessionsOfflinePermission(indexedDB, { epoch, grant }, remainsCurrent);
    if (!remainsCurrent()) throw new Error("The account or team changed during offline preparation.");
    storage.setItem(sessionsOfflinePreparationKey, ready);
    return await readPreparedSessionsOffline({ date, keys, origin, storage, indexedDB });
  } catch (error) {
    const marker = storage.getItem(sessionsOfflinePreparationKey);
    if (marker === preparing || marker === ready) storage.removeItem(sessionsOfflinePreparationKey);
    throw error;
  }
}
