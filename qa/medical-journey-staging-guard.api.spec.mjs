import { test } from '@playwright/test';
import sessionTransport from '../api/_lib/session-state-transport.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMedicalJourneyGuard } from './helpers/medical-journey-staging-guard.mjs';
import { verifyJourneyCapability, selectJourneyDay, addJourneyPrerequisites, createJourneyRequestHandler } from './helpers/medical-journey-staging-browser.mjs';
import { medicalKey, sessionsKey } from './helpers/save-acceptance-staging.mjs';
import { saveAcceptanceAssets, verifySaveAcceptanceFrontend } from './helpers/save-acceptance-frontend.mjs';
const run = 'qa-save-test', day = '2026-10-30', actorId = 'synthetic-author';
const player = { id: run + '-player', name: 'Synthetic Journey' };
const origin = 'https://staging.footballscience.xyz';
function fixture() {
  const baseline = { rosterVersion: 'v1', policy: { version: 1 }, players: [{ id: 'unrelated-player', name: 'Private' }],
    records: [{ id: 'unrelated-record', playerId: 'unrelated-player', participation: 75 }], injuryPlans: [] };
  const row = { id: 'medical-record-new', playerId: player.id, date: day, participation: 50, status: 'modified',
    createdBy: actorId, createdAt: '2026-10-29T12:00:00Z', updatedAt: '2026-10-29T12:00:00Z',
    comment: '', coachNote: '', shareWithCoach: false, archivedAt: '', archivedBy: '', archiveReason: '' };
  const state = { ...structuredClone(baseline), players: [...structuredClone(baseline.players), player], records: [row, ...structuredClone(baseline.records)],
    selectedDate: day, selectedPlayerId: player.id, dataSafety: { lastClinicalChangeBy: actorId, lastClinicalChangeType: 'recommendation-saved' } };
  const body = { key: medicalKey, value: JSON.stringify(state), baseRevision: 10, removed: false,
    baseHash: '', baseUpdatedAt: '', metadata: { baseRevision: 10, revision: 10, hash: '', updatedAt: '' } };
  const event = { action: 'recordSyncEvent', eventType: 'recommendation-saved', legacyPlayerId: player.id,
    idempotencyKey: 'recommendation-saved:' + row.id, payload: { schema: 'footballscience-medical-room-event-v1',
      sourceKey: medicalKey, eventType: 'recommendation-saved', selectedDate: day, playerId: player.id, player, record: row, stateSummary: {} } };
  const guard = createMedicalJourneyGuard({ run, day, player, actorId, baseline });
  return { baseline, row, state, body, event, guard };
}

test('one new UI id is shared by both real write paths and exact retries', () => {
  for (const first of ['generic', 'event']) {
    const f = fixture(); f.guard.arm();
    f.guard[first](first === 'generic' ? f.body : f.event, f.baseline);
    assert.equal(f.guard.event(f.event, f.state), f.row.id);
    assert.equal(f.guard.generic(f.body, f.state), f.row.id);
    assert.deepEqual(f.guard.ids(), [f.row.id]);
    assert.ok(f.guard.unrelatedUnchanged(f.state));
  }
});
test('startup mutations are unarmed and cannot claim cleanup ownership', () => {
  const f = fixture();
  assert.throws(() => f.guard.event(f.event, f.baseline));
  assert.throws(() => f.guard.generic(f.body, f.baseline));
  assert.deepEqual(f.guard.ids(), []);
});
for (const [label, mutate] of Object.entries({
  actor: row => row.createdBy = 'someone-else', player: row => row.playerId = 'unrelated-player',
  date: row => row.date = '2026-11-01', participation: row => row.participation = 75,
  comment: row => row.comment = 'unexpected content', archive: row => row.archivedAt = '2026-10-29T13:00:00Z',
  extra: row => row.other = 'field', existing: row => row.id = 'unrelated-record',
})) test(`rejects canonical write outside the intent: ${label}`, () => {
  const f = fixture(); f.guard.arm(); mutate(f.event.payload.record);
  assert.throws(() => f.guard.event(f.event, f.baseline)); assert.deepEqual(f.guard.ids(), []);
});
for (const [label, mutate] of Object.entries({
  record: state => state.records[1].participation = 0, player: state => state.players[0].name = 'overwritten',
  policy: state => state.policy.version = 2, missing: state => state.records.pop(),
  plan: state => state.injuryPlans.push({ id: 'new-plan' }), duplicate: state => state.records.push(state.records[0]),
  topLevel: state => state.unknown = true,
})) test(`rejects generic mutation of unrelated content: ${label}`, () => {
  const f = fixture(); f.guard.arm(); mutate(f.state); f.body.value = JSON.stringify(f.state);
  assert.throws(() => f.guard.generic(f.body, f.baseline)); assert.deepEqual(f.guard.ids(), []);
});
test('changed retry and externally changed accepted records remain protected', () => {
  const f = fixture(); f.guard.arm(); f.guard.event(f.event, f.baseline);
  const changed = structuredClone(f.state); changed.records[0].participation = 75;
  assert.throws(() => f.guard.generic(f.body, changed), /externally/);
  assert.throws(() => f.guard.archiveEvent(f.row.id, changed, new Date().toISOString()), /externally/);
  const second = structuredClone(f.event); second.payload.record.id = 'medical-record-other';
  second.idempotencyKey = 'recommendation-saved:medical-record-other';
  assert.throws(() => f.guard.event(second, f.baseline));
  assert.deepEqual(f.guard.ids(), [f.row.id]);
});
test('a collision discovered in a fresh central read is not adopted for cleanup', () => {
  const f = fixture(); f.guard.arm();
  assert.throws(() => f.guard.event(f.event, f.state), /collision/);
  assert.deepEqual(f.guard.ids(), []);
  assert.throws(() => f.guard.archiveEvent(f.row.id, f.state, new Date().toISOString()), /observed/);
});
test('canonical cleanup targets only the exact observed recommendation', () => {
  const f = fixture(); f.guard.arm(); f.guard.event(f.event, f.baseline);
  const body = f.guard.archiveEvent(f.row.id, f.state, '2026-10-29T14:00:00Z');
  assert.equal(body.eventType, 'record-archived'); assert.equal(body.payload.recordId, f.row.id);
  assert.equal(body.payload.playerId, player.id); assert.ok(!JSON.stringify(body).includes('unrelated'));
});
test('prerequisite overlay preserves raw Medical and existing roster; collisions stop', async () => {
  const payload = { entries: { [medicalKey]: 'raw clinical bytes', 'football-player-profiles-v1': JSON.stringify({ players: [{ id: 'unrelated' }] }) },
    absentKeys: ['football-schedule-v1', sessionsKey] };
  const before = structuredClone(payload), next = await addJourneyPrerequisites(payload, { run, day, player });
  assert.deepEqual(payload, before); assert.equal(next.entries[medicalKey], 'raw clinical bytes');
  assert.equal(JSON.parse(next.entries['football-player-profiles-v1']).players.length, 2);
  for (const key of ['football-schedule-v1', sessionsKey]) {
    const collision = structuredClone(payload);
    collision.entries[key] = key === sessionsKey ? JSON.stringify({ sessions: { [day]: {} } }) : JSON.stringify({ events: [{ date: day }] });
    await assert.rejects(() => addJourneyPrerequisites(collision, { run, day, player }), /already/);
  }
});

function transportHarness(mode = 'normal', writable = true) {
  const f = fixture(), ledger = [], calls = [];
  const qa = { origin, identity: async () => calls.push('identity'), primary: {},
    read: async () => ({ state: f.baseline }) };
  const routing = createJourneyRequestHandler({ qa, fixture: { run, day, player }, guard: f.guard, mode, ledger, writable });
  let duplicate = false;
  async function send(path = '/api/medical', body = f.event, method = 'POST') {
    const operations = [];
    await routing.handler({
      request: () => ({ url: () => path.startsWith('https:') ? path : origin + path, method: () => method, postDataJSON: () => body }),
      abort: async () => operations.push('abort'), continue: async () => operations.push('continue'),
      fulfill: async data => operations.push(data.status || 'real-response'),
      fetch: async options => { assert.equal(options.maxRedirects, 0); operations.push('fetch');
        const payload = { ok: true, stored: true, canonicalStored: true, eventId: 'synthetic-event', duplicate };
        duplicate = true;
        return { ok: () => true, status: () => 200, json: async () => payload };
      },
    });
    return operations;
  }
  return { ...f, ledger, calls, qa, ...routing, send };
}
test('unarmed, peer, foreign-origin and unrelated endpoint writes never reach the server', async () => {
  const h = transportHarness();
  assert.deepEqual(await h.send(), ['abort']);
  h.guard.arm();
  for (const path of ['https://footballscience.xyz/api/medical', '/api/admin-users']) assert.deepEqual(await h.send(path), ['abort']);
  const peer = transportHarness('normal', false); peer.guard.arm();
  assert.deepEqual(await peer.send(), ['abort']); assert.deepEqual(peer.calls, []);
});
test('sealed read phase cannot deliver queued retries', async () => {
  const h = transportHarness(); h.guard.arm();
  assert.deepEqual(await h.send(), ['fetch', 'real-response']);
  h.guard.seal();
  assert.deepEqual(await h.send(), ['abort']);
  assert.deepEqual(await h.send('/api/app-state', h.body), ['abort']);
});
test('lost response occurs only after real acceptance; retry remains a real server call', async () => {
  const h = transportHarness('lost-response'); h.guard.arm();
  assert.deepEqual(await h.send(), ['fetch', 'abort']);
  assert.deepEqual(await h.send(), ['fetch', 'real-response']);
  assert.equal(h.ledger.filter(e => e.stage === 'accepted-response-dropped').length, 1);
  assert.equal(h.ledger.filter(e => e.stage === 'canonical-server-response').at(-1).duplicate, true);
});
for (const mode of ['generic-failed', 'canonical-failed']) test(`independent failure is injected before server delivery: ${mode}`, async () => {
  const h = transportHarness(mode); h.guard.arm();
  const generic = mode === 'generic-failed';
  assert.deepEqual(await h.send(generic ? '/api/app-state' : '/api/medical', generic ? h.body : h.event), [503]);
  assert.ok(h.ledger.some(e => e.stage.endsWith('injected-failure')));
  assert.ok(!h.ledger.some(e => e.stage.endsWith('server-response')));
});
test('deployment drift and malformed ownership fail closed without logging private payloads', async () => {
  const h = transportHarness(); h.guard.arm();
  h.qa.identity = async () => { throw new Error('secret-token'); };
  assert.deepEqual(await h.send(), ['abort']);
  assert.ok(!JSON.stringify(h.errors).includes('secret')); assert.deepEqual(h.guard.ids(), []);
});
test('changed recommendation binding fails source verification before fixture setup', async () => {
  const asset = 'src/modules/medical/medical-runtime-bindings.mjs';
  assert.ok(saveAcceptanceAssets.includes(asset));
  await assert.rejects(verifySaveAcceptanceFrontend({ baseUrl: origin, readSource: p => Buffer.from(p),
    fetchImpl: async url => new Response(url.endsWith(asset) ? 'stale' : url.slice(origin.length + 1)) }), /differs/);
});
test('new staging acceptance is explicit, serialized, deployed-source only and has no sensitive captures', () => {
  const source = readFileSync(new URL('./medical-journey.staging.spec.mjs', import.meta.url), 'utf8');
  assert.ok(source.indexOf('await verifySaveAcceptanceFrontend') < source.indexOf('await createStagingAcceptance'));
  const workflow = readFileSync(new URL('../.github/workflows/staging-smoke.yml', import.meta.url), 'utf8');
  assert.match(workflow, /inputs.verify_medical_journey \|\| inputs.restore_staging_deployment/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /verify_medical_journey:[\s\S]*?default: false/);
  const config = readFileSync(new URL('./medical-journey.staging.config.mjs', import.meta.url), 'utf8');
  assert.match(config, /retries: 0, maxFailures: 1/);
  for (const type of ['screenshot', 'trace', 'video']) assert.ok(config.includes(type + ": 'off'"));
});


test('compressed session prerequisites preserve unrelated content and transport', async () => {
  const existing = { sessions: { '2026-01-01': { title: 'preserved', notes: 'synthetic'.repeat(40000) } } };
  const encoded = await sessionTransport.encodeSessionStateValue({ url: '/?sessionTransport=gzip-base64-v1' }, sessionsKey, JSON.stringify(existing));
  assert.equal(encoded.encoding, 'gzip-base64-v1');
  const payload = { entries: { [medicalKey]: 'raw clinical bytes', [sessionsKey]: encoded } };
  const before = structuredClone(payload);
  const next = await addJourneyPrerequisites(payload, { run, day, player });
  assert.deepEqual(payload, before);
  assert.equal(next.entries[medicalKey], 'raw clinical bytes');
  assert.equal(next.entries[sessionsKey].encoding, 'gzip-base64-v1');
  const decoded = JSON.parse(await sessionTransport.decodeSessionStateValue(sessionsKey, next.entries[sessionsKey]));
  assert.deepEqual(decoded.sessions['2026-01-01'], existing.sessions['2026-01-01']);
  assert.equal(decoded.sessions[day].title, run);
  await assert.rejects(addJourneyPrerequisites({ entries: { [sessionsKey]: { encoding: 'gzip-base64-v1', data: 'broken' } } }, { run, day, player }), /Unreadable/);
});


test('journey date must be unused in both Sessions and Schedule; neither is changed', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const sessions = { sessions: { '2026-10-30': { title: 'existing' } } };
  const schedule = { events: [{ date: '2026-10-31', title: 'existing' }] };
  const before = structuredClone({ sessions, schedule });
  assert.equal(selectJourneyDay(sessions, schedule, now), '2026-11-01');
  assert.deepEqual({ sessions, schedule }, before);
  const busy = { events: Array.from({ length: 14 }, (_, index) => ({ date: new Date(now + (index + 1) * 86400000).toISOString().slice(0, 10) })) };
  assert.equal(selectJourneyDay({}, busy, now), '2026-11-13');
  const fullyBusy = { events: Array.from({ length: 90 }, (_, index) => ({ date: new Date(now + (index + 1) * 86400000).toISOString().slice(0, 10) })) };
  assert.throws(() => selectJourneyDay({}, fullyBusy, now), /No unused/);
  assert.throws(() => selectJourneyDay({}, { events: {} }, now), /Invalid Schedule/);
});


test('canonical capability must be explicitly enabled before any recommendation', async () => {
  const qa = { origin, primary: { token: 'synthetic-secret' }, identity: async () => {} };
  const enabled = { ok: true, enabled: true, canWrite: true, mode: 'database' };
  assert.equal((await verifyJourneyCapability(qa, async () => new Response(JSON.stringify(enabled)))).enabled, true);
  for (const change of [{ enabled: false }, { canWrite: false }, { mode: 'legacy' }, { ok: false }]) {
    await assert.rejects(verifyJourneyCapability(qa, async () => new Response(JSON.stringify({ ...enabled, ...change, private: 'sensitive' }))), error => error.message.includes('unavailable') && !error.message.includes('sensitive'));
  }
  await assert.rejects(verifyJourneyCapability(qa, async () => { throw new Error('synthetic-secret'); }), error => !error.message.includes('synthetic-secret'));
});


test('server aggregate receipt timestamp is distinct from protected clinical record timestamps', () => {
  const f = fixture(); f.guard.arm(); f.guard.event(f.event, f.baseline);
  const projected = { ...structuredClone(f.state), updatedAt: '2026-10-29T12:00:01.123Z' };
  assert.ok(f.guard.unrelatedUnchanged(projected));
  assert.equal(f.guard.generic(f.body, projected), f.row.id);
  const unrelatedEdit = structuredClone(projected);
  unrelatedEdit.records[1].updatedAt = '2026-10-29T12:00:02.000Z';
  assert.equal(f.guard.unrelatedUnchanged(unrelatedEdit), false);
  assert.throws(() => f.guard.generic(f.body, unrelatedEdit), /Unrelated/);
  const ownEdit = structuredClone(projected); ownEdit.records[0].updatedAt = '2026-10-29T12:00:02.000Z';
  assert.throws(() => f.guard.archiveEvent(f.row.id, ownEdit, new Date().toISOString()), /externally/);
  assert.throws(() => f.guard.unrelatedUnchanged({ ...projected, updatedAt: { unexpected: true } }), /timestamp/);
});

test('reconnect blocks generic/foreign requests and preserves the real non-conflict response as a failed proof', async () => {
  const h=transportHarness('peer-archived');h.guard.arm();
  assert.deepEqual(await h.send(),['fetch','real-response']);h.guard.seal();h.reconnect.freeze();
  assert.deepEqual(await h.send('/api/app-state',undefined,'GET'),['abort']);
  const timestamp='2026-10-29T15:00:00Z';
  const archived={...h.state,records:[{...h.row,archivedAt:timestamp,updatedAt:timestamp},h.state.records[1]]};
  h.reconnect.expectArchive(archived,timestamp);h.qa.read=async()=>({state:archived});
  assert.deepEqual(await h.send('/api/app-state',h.body),['abort']);
  assert.deepEqual(await h.send('https://footballscience.xyz/api/medical'),['abort']);
  assert.deepEqual(await h.send('/api/admin-users'),['abort']);
  // A real server 200 must fail the proof, never be replaced with an invented 409.
  assert.deepEqual(await h.send(),['fetch','abort']);
  assert.equal(h.errors.length,1);assert.match(h.errors[0],/explicit conflict/);
  assert.equal(h.ledger.some(e=>e.stage==='archived-replay-conflict'),false);
});
