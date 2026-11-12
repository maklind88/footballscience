import { sessionPlannerStorageKey } from '../modules/session-planner/session-planner-autosave.mjs';
import { sessionDateValue, validateSessionDateChange } from '../modules/session-planner/session-save-protocol.mjs';
import { isReviewableSnapshot } from './snapshot-history-format.mjs';

export const recoveryDraftModuleKey = sessionPlannerStorageKey;
export const recoveryDraftSchema = 'football-science-history-recovery-draft-v1';
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export async function recoveryDigest(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// Validate using the module's public contract; never normalize stored content or
// construct a change against today's plan. This draft is not a replay command.
export function readRecoverySessions(value) {
  if (typeof value !== 'string') throw new Error('Unsupported Sessions copy');
  const state = JSON.parse(value);
  if (!object(state) || !object(state.sessions) || !Object.keys(state.sessions).length ||
      Object.keys(state.sessions).length > 366) throw new Error('Unsupported Sessions copy');
  for (const date of Object.keys(state.sessions)) {
    const current = sessionDateValue(state, date);
    validateSessionDateChange({ schema: 'session-date-change-v1', id: 'history-draft-validation',
      date, before: current, after: current });
  }
  return state;
}

export async function prepareRecoveryDraft(envelope, access) {
  const key = recoveryDraftModuleKey;
  if (!isReviewableSnapshot(envelope, access.scope, access.allowedKeys) || !access.allowedKeys.has(key))
    throw new Error('Copy cannot be verified for this account');
  const value = envelope.storage[key]; readRecoverySessions(value);
  const entry = structuredClone(envelope.saveContext.entries[key]);
  const content = { schema: recoveryDraftSchema, scope: access.scope, moduleKey: key, value, entry,
    source: { id: envelope.id, createdAt: envelope.createdAt,
      envelopeDigest: await recoveryDigest(JSON.stringify(envelope)) } };
  return { id: await recoveryDigest(JSON.stringify(content)), content, createdAt: new Date().toISOString() };
}

export async function verifyRecoveryDraft(row, scope) {
  const content = row?.content;
  if (content?.schema !== recoveryDraftSchema || content.scope !== scope || content.moduleKey !== recoveryDraftModuleKey ||
      content.entry?.principalScope !== scope || !Number.isFinite(Date.parse(row.createdAt)) ||
      typeof content.source?.id !== 'string' || !content.source.id ||
      !/^[a-f0-9]{64}$/.test(content.source.envelopeDigest) ||
      await recoveryDigest(JSON.stringify(content)) !== row.id) throw new Error('Recovery draft could not be verified');
  readRecoverySessions(content.value);
  return row;
}
