import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { createArchiveReadsController } from '../src/modules/video-analysis/controllers/archiveReadsController.js';
import { findVideoLibraryItem, buildVideoLibraryItems } from '../src/modules/video-analysis/services/videoLibraryService.js';

const require = createRequire(import.meta.url);
const { normalizeArchiveQuery, readAnalysisRoomArchive } = require('../api/_lib/analysis-room-archive.js');
const actor = { id: 'coach', clubId: 'club-a', teamId: 'team-a' };
const id = '11111111-1111-4111-8111-111111111111';

test('archive actions retain the existing staff-only API permission guard', () => {
  const { guardApiRequest } = require('../api/_lib/platform-security.js');
  for (const action of ['library-search', 'library-calendar']) {
    for (const role of ['coach', 'analyst', 'player']) {
      const res = { setHeader() {}, end() {} };
      const guarded = guardApiRequest({ method: 'GET', url: `/api/video-analysis?action=${action}`, headers: {} }, res,
        { route: '/api/video-analysis', moduleId: 'video-analysis', actor: { ...actor, role } });
      expect(guarded.ok).toBe(role !== 'player');
      if (role === 'player') expect(res.statusCode).toBe(403);
    }
  }
});

test('archive validates bounded filters and calendar dates before reading', () => {
  expect(normalizeArchiveQuery({ search: '  High   press ', type: 'match' })).toMatchObject({ p_search: 'High press', p_type: 'match', p_limit: 8 });
  expect(normalizeArchiveQuery({ search: '15/6/2026' })).toMatchObject({ p_search: '', p_date_from: '2026-06-15', p_date_to: '2026-06-15' });
  expect(normalizeArchiveQuery({ month: '2028-02' }, 'calendar')).toMatchObject({ p_date_from: '2028-02-01', p_date_to: '2028-02-29' });
  for (const query of [{ date: '2026-02-30' }, { type: 'off' }, { limit: 51 }, { limit: 0 }, { search: 'a'.repeat(121) }, { cursor: 'malformed' }]) {
    expect(() => normalizeArchiveQuery(query)).toThrow();
  }
  expect(() => normalizeArchiveQuery({ month: '2026-13' }, 'calendar')).toThrow();
});

test('archive reads once, trusts actor scope only, and preserves exact counts with keyset cursor', async () => {
  const previous = { fetch: globalThis.fetch, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
  const requests = [];
  process.env.SUPABASE_URL = 'https://archive-test.invalid';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_archive_test';
  globalThis.fetch = async (url, options) => {
    requests.push({ url, ...options, body: JSON.parse(options.body) });
    return Response.json({ matches: [{ id, match_date: '2020-01-01', clip_count: 50000 }], hasMore: true });
  };
  try {
    const result = await readAnalysisRoomArchive({ search: 'Historic', organizationId: 'foreign', teamId: 'foreign' }, actor);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'POST', url: 'https://archive-test.invalid/rest/v1/rpc/video_library_archive', body: { p_organization_id: 'club-a', p_team_id: 'team-a', p_actor_id: 'coach', p_search: 'Historic', p_limit: 8 } });
    expect(result.payload.matches[0].clip_count).toBe(50000);
    expect(normalizeArchiveQuery({ cursor: result.payload.nextCursor })).toMatchObject({ p_cursor_date: '2020-01-01', p_cursor_id: id });
    expect(await readAnalysisRoomArchive({}, { id: 'coach' })).toMatchObject({ ok: false, status: 403 });
    expect(requests).toHaveLength(1);
    const empty = await readAnalysisRoomArchive({ month: '2026-06', date: '2026-07-01' }, actor, 'calendar');
    expect(empty.payload.days).toEqual([]);
    expect(requests).toHaveLength(1);
    globalThis.fetch = async () => Response.json({ message: 'Private schema error' }, { status: 500 });
    expect(await readAnalysisRoomArchive({}, actor)).toMatchObject({ ok: false, status: 503, reason: 'Video archive is unavailable. Please retry.' });
    globalThis.fetch = async () => { throw new Error('Private network details'); };
    expect(await readAnalysisRoomArchive({}, actor)).toMatchObject({ ok: false, status: 503, reason: 'Video archive is unavailable. Please retry.' });
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of [['SUPABASE_URL', previous.url], ['SUPABASE_SECRET_KEY', previous.key]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('archive search items open without being loaded in the calendar and hidden linked days are deduplicated', () => {
  const state = { library: { matches: [], calendar: { linkedScheduleIds: ['linked-event'] },
    archive: { matches: [{ id, title: 'Historic match', match_date: '2020-01-01' }] },
    scheduleCandidates: [{ id: 'linked-event', date: '2026-06-01', type: 'training' }] } };
  expect(findVideoLibraryItem(state, `match:${id}`).title).toBe('Historic match');
  expect(buildVideoLibraryItems(state)).toHaveLength(0);
});

function harness() {
  const listeners = new Set();
  let state = { view: 'library', library: { filters: { search: 'old', calendarMonth: '2026-06' } } };
  const win = new EventTarget();
  win.document = new EventTarget();
  win.document.visibilityState = 'visible';
  win.navigator = { onLine: true };
  const pending = [];
  const runtime = {
    context: { win, currentUser: actor },
    store: { getState: () => state, update: (fn) => { state = fn(state); listeners.forEach((fn) => fn(state)); }, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } },
    videos: {
      archiveCalendar: async () => ({ days: [], linkedScheduleIds: [] }),
      searchArchive: (query, { signal }) => new Promise((resolve) => pending.push({ query, signal, resolve })),
    },
  };
  const controller = createArchiveReadsController({ getRuntime: () => runtime, scheduleCandidates: () => [] });
  controller.bind();
  return { runtime, controller, pending, win, state: () => state };
}

test('archive ignores late responses and aborts superseded requests', async () => {
  const h = harness();
  try {
    const old = h.controller.load();
    h.runtime.store.update((s) => ({ ...s, library: { ...s.library, filters: { ...s.library.filters, search: 'new' } } }));
    const latest = h.controller.load();
    expect(h.pending[0].signal.aborted).toBe(true);
    h.pending[1].resolve({ matches: [{ id, title: 'New result' }], hasMore: false });
    await latest;
    h.pending[0].resolve({ matches: [{ id, title: 'Old result' }], hasMore: false });
    await old;
    expect(h.state().library.archive.matches[0].title).toBe('New result');
  } finally { h.controller.dispose(); }
});

test('archive cancels on hidden/offline/FS Player and discards previous team cache', async () => {
  const h = harness();
  try {
    const request = h.controller.load();
    h.win.document.visibilityState = 'hidden';
    h.win.document.dispatchEvent(new Event('visibilitychange'));
    expect(h.pending[0].signal.aborted).toBe(true);
    h.pending[0].resolve({ matches: [{ id }], hasMore: false });
    await request;
    expect(h.state().library.archive.matches).toBeUndefined();
    h.runtime.store.update((s) => ({ ...s, library: { ...s.library, matches: [{ id }], scheduleCandidates: [{ id: 'old-team' }] } }));
    h.runtime.context.currentUser = { ...actor, teamId: 'team-b' };
    h.controller.bind();
    expect(h.state().library.matches).toEqual([]);
    expect(h.state().library.scheduleCandidates).toEqual([]);
    h.win.document.visibilityState = 'visible';
    h.win.navigator.onLine = false;
    await h.controller.load();
    expect(h.pending).toHaveLength(1);
    h.win.navigator.onLine = true;
    h.runtime.store.update((s) => ({ ...s, view: 'workspace' }));
    await h.controller.load();
    expect(h.pending).toHaveLength(1);
  } finally { h.controller.dispose(); }
});
