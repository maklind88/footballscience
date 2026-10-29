import { createHash } from 'node:crypto';
import { medicalKey } from './save-acceptance-staging.mjs';

const requireProof = (ok, message) => { if (!ok) throw Object.assign(new Error(message), { journeyGuard: true }); };
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const fields = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(k => allowed.includes(k));
const recordFields = 'id playerId date status participation actualParticipation comment coachNote shareWithCoach rtpPhase createdAt updatedAt createdBy archivedAt archivedBy archiveReason'.split(' ');

// This is a fail-closed test boundary, not a production merge policy. A generated
// UI record ID is owned only after checking player/date/actor and absence in the
// authoritative baseline. Never infer ownership from a generic ID prefix alone.
export function createMedicalJourneyGuard({ run, day, player, actorId, baseline }) {
  requireProof(/^qa-save-[a-z0-9-]+$/.test(run) && player.id === run + '-player', 'Invalid journey owner');
  requireProof(/^\d{4}-\d{2}-\d{2}$/.test(day) && Boolean(actorId), 'Invalid journey date or actor');
  const initial = structuredClone(baseline), records = new Map();
  requireProof(!(initial.players || []).some(row => row.id === player.id)
    && !(initial.records || []).some(row => row.playerId === player.id), 'Journey player already exists');
  let armed = false;
  const checkRecord = (row, current) => {
    requireProof(armed && fields(row, recordFields), 'Journey write is not armed or has unexpected record fields');
    requireProof(typeof row.id === 'string' && /^medical-record-[a-zA-Z0-9-]+$/.test(row.id)
      && row.playerId === player.id && row.date === day && row.participation === 50
      && row.createdBy === actorId && row.comment === '' && row.coachNote === ''
      && row.shareWithCoach === false && !row.archivedAt && !row.archivedBy && !row.archiveReason,
    'Recommendation is outside the synthetic intent');
    requireProof(!(initial.records || []).some(item => item.id === row.id), 'Pre-existing record cannot become test-owned');
    const known = records.get(row.id);
    const accepted = (current.records || []).find(item => item.id === row.id);
    requireProof(!known || !accepted || hash(known) === hash(accepted), 'Test record changed externally; preserve it');
    requireProof(known ? hash(known) === hash(row) : records.size === 0
      && !(current.records || []).some(item => item.id === row.id), 'Record collision or changed retry');
    return row;
  };
  const remember = row => { records.set(row.id, structuredClone(row)); return row.id; };
  const clinical = state => {
    // The canonical projector stamps aggregate updatedAt after each accepted event.
    // It is receipt metadata; per-record timestamps remain fully protected below.
    requireProof(state.updatedAt == null || state.updatedAt === '' || (typeof state.updatedAt === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(state.updatedAt)
      && Number.isFinite(Date.parse(state.updatedAt))), 'Invalid aggregate save timestamp');
    const { selectedDate, selectedPlayerId, dataSafety, updatedAt, ...rest } = state;
    return { ...rest, players: (state.players || []).filter(row => row.id !== player.id).sort((a,b) => a.id.localeCompare(b.id)),
      records: (state.records || []).filter(row => !records.has(row.id)).sort((a,b) => a.id.localeCompare(b.id)),
      injuryPlans: [...(state.injuryPlans || [])].sort((a,b) => a.id.localeCompare(b.id)) };
  };
  function generic(body, current) {
    requireProof(fields(body, ['key', 'value', 'baseRevision', 'removed', 'baseHash', 'baseUpdatedAt', 'metadata']) && body.key === medicalKey
      && typeof body.value === 'string' && !body.removed && Number.isInteger(body.baseRevision)
      && (!body.metadata || fields(body.metadata, ['baseRevision', 'revision', 'hash', 'updatedAt'])), 'Unexpected generic write');
    let state; try { state = JSON.parse(body.value); } catch { throw new Error('Invalid Medical state'); }
    requireProof(state && !Array.isArray(state) && Array.isArray(state.records) && Array.isArray(state.players), 'Invalid Medical state');
    const own = state.records.filter(row => row.playerId === player.id);
    requireProof(own.length === 1, 'Exactly one new recommendation required');
    const row = checkRecord(own[0], current);
    const ownPlayers = state.players.filter(item => item.id === player.id);
    requireProof(ownPlayers.length === 1 && ownPlayers[0].name === player.name && !ownPlayers[0].archivedAt, 'Unexpected synthetic player');
    // Do not mutate ownership until all checks pass. Compare excluding this one
    // candidate ID as well as already observed IDs, without deleting any data.
    const withoutCandidate = value => ({ ...value, records: (value.records || []).filter(item => item.id !== row.id) });
    requireProof(hash(clinical(withoutCandidate(current))) === hash(clinical(withoutCandidate(state))), 'Unrelated Medical content would change');
    requireProof(new Set(state.records.map(item => item.id)).size === state.records.length, 'Duplicate recommendation IDs');
    requireProof(state.selectedDate === day && state.selectedPlayerId === player.id, 'Unexpected Medical view change');
    requireProof(fields(state.dataSafety, 'schema lastClinicalChangeAt lastClinicalChangeBy lastClinicalChangeType lastClinicalChangeSummary lastDatabaseSyncAt lastDatabaseSyncStatus lastDatabaseSyncEvent lastPayloadHash archivedRecordCount archivedPlanCount archivedPlayerCount'.split(' '))
      && state.dataSafety.lastClinicalChangeBy === actorId && state.dataSafety.lastClinicalChangeType === 'recommendation-saved', 'Unexpected save metadata');
    return remember(row);
  }
  function event(body, current) {
    requireProof(fields(body, ['action', 'eventType', 'legacyPlayerId', 'idempotencyKey', 'payload'])
      && body.action === 'recordSyncEvent' && body.eventType === 'recommendation-saved'
      && body.legacyPlayerId === player.id, 'Unexpected canonical event');
    const p = body.payload;
    requireProof(fields(p, ['schema', 'sourceKey', 'eventType', 'selectedDate', 'player', 'stateSummary', 'playerId', 'record'])
      && p.schema === 'footballscience-medical-room-event-v1' && p.sourceKey === medicalKey
      && p.eventType === body.eventType && p.selectedDate === day && p.playerId === player.id
      && fields(p.player, ['id', 'name', 'number', 'position', 'photoUrl', 'updatedAt'])
      && p.player.id === player.id && p.player.name === player.name, 'Unexpected canonical payload');
    const row = checkRecord(p.record, current);
    requireProof(body.idempotencyKey === 'recommendation-saved:' + row.id, 'Unexpected idempotency key');
    return remember(row);
  }
  function archiveEvent(id, current, timestamp) {
    requireProof(records.has(id), 'Only observed test records may be archived');
    const row = (current.records || []).find(item => item.id === id);
    requireProof(row && row.playerId === player.id && row.date === day && row.createdBy === actorId
      && hash({ ...row, archivedAt: '', archivedBy: '', archiveReason: '' }) === hash({ ...records.get(id), archivedAt: '', archivedBy: '', archiveReason: '' }),
    'Test record changed externally; preserve it');
    return { action: 'recordSyncEvent', eventType: 'record-archived', legacyPlayerId: player.id,
      idempotencyKey: 'record-archived:' + id + ':' + timestamp,
      payload: { schema: 'footballscience-medical-room-event-v1', sourceKey: medicalKey,
        playerId: player.id, recordId: id, archivedAt: timestamp } };
  }
  return { arm: () => { armed = true; }, seal: () => { armed = false; }, isArmed: () => armed, generic, event, archiveEvent,
    ids: () => [...records.keys()], unrelatedUnchanged: state => hash(clinical(initial)) === hash(clinical(state)) };
}
