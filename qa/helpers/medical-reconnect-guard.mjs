import { createHash } from 'node:crypto';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const proof = (ok, message) => { if (!ok) throw Object.assign(new Error(message), { journeyGuard: true }); };

// Test transport boundary only. The original event must first pass the journey's
// ownership guard AND receive a real canonical receipt. Never infer ownership here.
export function createMedicalReconnectGuard() {
  let original, eventId, archived, phase = 'initial', delivered = false, confirmed = false;
  return {
    remember(body, payload) {
      proof(phase === 'initial' && payload.ok && payload.stored && payload.canonicalStored && payload.eventId,
        'Reconnect requires a real original receipt');
      proof(!original || (hash(original) === hash(body) && eventId === payload.eventId), 'Reconnect original receipt changed');
      original = structuredClone(body); eventId = payload.eventId;
    },
    freeze() { proof(phase === 'initial' && original, 'Reconnect has no accepted original'); phase = 'offline'; },
    expectArchive(state, timestamp) {
      proof(phase === 'offline' && typeof timestamp === 'string' && Number.isFinite(Date.parse(timestamp)), 'Invalid reconnect archive phase');
      const expected = { ...original.payload.record, archivedAt: timestamp, updatedAt: timestamp };
      const rows = (state.records || []).filter(row => row.id === expected.id);
      proof(rows.length === 1 && hash(rows[0]) === hash(expected), 'Peer archive differs from the owned intent; preserve it');
      archived = structuredClone(expected); phase = 'replay';
    },
    isReplaying: () => phase === 'replay',
    blocksReads: () => phase === 'offline' || phase === 'replay',
    event(body, state) {
      proof(phase === 'replay' && !delivered && hash(body) === hash(original), 'Only one exact original replay is permitted');
      const rows = (state.records || []).filter(row => row.id === archived.id);
      proof(rows.length === 1 && hash(rows[0]) === hash(archived), 'Archived record changed externally; preserve it');
      delivered = true;
      return archived.id;
    },
    response(status, payload) {
      proof(delivered && phase === 'replay' && status === 409 && payload.ok === false && payload.stored === true
        && payload.canonicalStored === false && payload.duplicate === true && payload.processingStatus === 'processed'
        && payload.eventId === eventId && payload.code === 'medical_recommendation_changed',
      'Archived replay did not return its original event with an explicit conflict');
      confirmed = true;
    },
    finish() { proof(phase === 'replay' && confirmed, 'Reconnect replay is incomplete'); phase = 'complete'; },
  };
}
