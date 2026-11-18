// Consumer of Sessions' public working-copy export contract. No import/replay,
// storage access, saving, acknowledgement or mutation of the module's draft.
export const upgradeCopyMaxBytes = 8 * 1024 * 1024;
const keys = ['baseRevision', 'owner', 'previousValue', 'scope', 'token', 'value'];
const schema = 'football-science-session-working-copy-v1';
function readDraft(draft, owner) {
  if (!draft || !owner || draft.owner !== owner ||
      Object.keys(draft).sort().join() !== keys.join() ||
      ['owner','scope','token'].some(key => typeof draft[key] !== 'string' || !draft[key]) ||
      ['value','previousValue'].some(key => typeof draft[key] !== 'string') ||
      !Number.isSafeInteger(draft.baseRevision) || draft.baseRevision < 0)
    throw new Error('Current Sessions work cannot be verified. Keep this tab open.');
  return Object.fromEntries(keys.map(key => [key, draft[key]]));
}
export function encodeSessionUpgradeCopy(draft, owner) {
  const text = JSON.stringify({ schema, exportedAt: new Date().toISOString(), ...readDraft(draft, owner) });
  if (new TextEncoder().encode(text).byteLength > upgradeCopyMaxBytes)
    throw new Error('This copy exceeds the upgrade check limit. Use Sessions recovery and keep this tab open.');
  return text;
}
export function verifySessionUpgradeCopy(text, draft, owner) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > upgradeCopyMaxBytes) return false;
  try {
    const file = JSON.parse(text);
    if (file.schema !== schema || typeof file.exportedAt !== 'string' || !Number.isFinite(Date.parse(file.exportedAt)) ||
        Object.keys(file).sort().join() !== [...keys, 'schema', 'exportedAt'].sort().join()) return false;
    const {schema: ignoredSchema, exportedAt: ignoredTime, ...saved} = file;
    return JSON.stringify(readDraft(saved, owner)) === JSON.stringify(readDraft(draft, owner));
  } catch { return false; }
}
