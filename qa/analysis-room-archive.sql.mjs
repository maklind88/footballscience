import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Separate opt-in SQL proof: run against disposable WASM PostgreSQL, never a remote project.
const packageRoot = process.argv[2];
if (!packageRoot) throw new Error('Pass the local @electric-sql/pglite package directory. See docs/analysis-room/ARCHIVE_READS.md.');
const { PGlite } = await import(pathToFileURL(path.join(packageRoot, 'dist/index.js')));
const { pg_trgm } = await import(pathToFileURL(path.join(packageRoot, 'dist/contrib/pg_trgm.js')));
const { pgcrypto } = await import(pathToFileURL(path.join(packageRoot, 'dist/contrib/pgcrypto.js')));
const db = new PGlite({ extensions: { pg_trgm, pgcrypto } });
const root = new URL('../', import.meta.url);
const fixtureMatch = '00000000-0000-4000-8000-000000000001';
const fixtureVideo = '10000000-0000-4000-8000-000000000001';
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.platform_permission_matrix (
      module_id text, action text, roles text[], scope text, requires_organization_scope boolean,
      requires_team_scope boolean, description text, updated_at timestamptz, primary key(module_id, action)
    );
  `);
  await db.exec(await readFile(new URL('supabase/migrations/20260613000100_video_analysis_metadata_foundation.sql', root), 'utf8'));
  await db.exec(await readFile(new URL('supabase/migrations/20260908014213_analysis_room_video_archive_reads.sql', root), 'utf8'));
  await db.exec(`
    insert into public.video_matches (id,organization_id,team_id,title,match_date,metadata)
    select ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,'club-a','team-a',
      case when i = 1 then 'Historic needle_100%' else 'Session ' || i end,
      date '2020-01-01' + (i % 2000), jsonb_build_object('eventType','training')
    from generate_series(1,50000) i;
    insert into public.video_matches (organization_id,team_id,title,match_date) values
      ('club-b','team-a','Hidden other club','2026-06-15'),
      ('club-a','team-b','Hidden other team','2026-06-15'),
      ('club-a','team-a','Undated video',null);
    insert into public.video_videos (id,organization_id,team_id,match_id,title,local_video_identifier)
      values ('${fixtureVideo}','club-a','team-a','${fixtureMatch}','Video','test-identifier');
    insert into public.video_sources (organization_id,team_id,match_id,video_id,local_video_identifier,display_name,created_by,created_at) values
      ('club-a','team-a','${fixtureMatch}','${fixtureVideo}','coach-a-file','Coach A file','coach-a','2020-01-01'),
      ('club-a','team-a','${fixtureMatch}','${fixtureVideo}','coach-b-file','Coach B file','coach-b','2026-01-01');
    update public.video_matches set metadata = metadata || '{"scheduleEventId":"linked-day"}' where id='${fixtureMatch}';
    insert into public.video_clip_instances (organization_id,team_id,match_id,video_id,start_ms,end_ms,phase,sub_phase)
      select 'club-a','team-a','${fixtureMatch}','${fixtureVideo}',i*1000,i*1000+500,'In Possession','Build Up' from generate_series(1,50000) i;
    analyze public.video_matches; analyze public.video_clip_instances;
    set role service_role;
  `);
  const query = async (overrides = {}) => {
    const q = { org: 'club-a', team: 'team-a', mode: 'search', search: '', type: 'all', from: null, to: null, cursorDate: null, cursorId: null, limit: 8, ...overrides };
    const started = performance.now();
    const result = await db.query('select public.video_library_archive($1,$2,$3,$4,$5,$6,$7::date,$8::date,$9::date,$10::uuid,$11) as result',
      [q.org,q.team,'coach-a',q.mode,q.search,q.type,q.from,q.to,q.cursorDate,q.cursorId,q.limit]);
    console.log(`${q.mode}: ${Math.round(performance.now() - started)} ms, ${JSON.stringify(result.rows[0].result).length} bytes`);
    return result.rows[0].result;
  };
  const historic = await query({ search: 'needle_100%' });
  assert.equal(historic.matches.length, 1);
  assert.equal(historic.matches[0].id, fixtureMatch);
  assert.equal(historic.matches[0].clip_count, 50000);
  assert.equal(historic.matches[0].latest_source.created_by, 'coach-a');
  assert.equal(historic.matches[0].source_count, 2);
  assert.equal(historic.hasMore, false);
  const first = await query();
  assert.equal(first.matches.length, 8);
  assert.equal(first.hasMore, true);
  const last = first.matches.at(-1);
  const next = await query({ cursorDate: last.match_date, cursorId: last.id });
  assert.equal(new Set([...first.matches, ...next.matches].map((row) => row.id)).size, 16);
  assert.equal((await query({ search: 'Hidden' })).matches.length, 0);
  const undated = await query({ cursorDate: '2020-01-01', cursorId: fixtureMatch });
  assert.equal(undated.matches.at(-1).title, 'Undated video');
  const calendar = await query({ mode: 'calendar', from: '2020-01-01', to: '2020-01-31' });
  assert.equal(calendar.days.length, 31);
  assert.equal(calendar.days.every((day) => day.matches.length <= 2), true);
  assert.equal(calendar.days.reduce((sum, day) => sum + day.count, 0), 775);
  const filteredCalendar = await query({ mode: 'calendar', from: '2020-01-01', to: '2020-01-31', search: 'No such session' });
  assert.equal(filteredCalendar.days.length, 0);
  assert.deepEqual(filteredCalendar.linkedScheduleIds, ['linked-day']);
  assert.equal((await query({ search: "%' OR true --" })).matches.length, 0);
  await assert.rejects(query({ mode: 'calendar' }), /bounded month/);
  await assert.rejects(query({ org: '' }), /Invalid video library/);
  await assert.rejects(query({ limit: null }), /Invalid video library/);
  await assert.rejects(query({ mode: 'calendar', from: '2020-01-01', to: '2020-02-01' }), /bounded month/);
  await db.exec(`update public.video_matches set status='archived' where id='${fixtureMatch}';`);
  assert.equal((await query({ search: 'needle_100%' })).matches.length, 0);
  await db.exec('reset role; set role authenticated;');
  await assert.rejects(query(), /permission denied/);
  await db.exec('reset role; set role anon;');
  await assert.rejects(query(), /permission denied/);
  await db.exec('reset role;');
  const plan = await db.query(`explain (format json) select id from public.video_matches
    where organization_id='club-a' and team_id='team-a' and status='active'
      and (coalesce(match_date,date '0001-01-01'),id) < (date '2020-06-01','${fixtureMatch}'::uuid)
    order by coalesce(match_date,date '0001-01-01') desc,id desc limit 9`);
  assert.match(JSON.stringify(plan.rows), /video_library_archive_cursor_idx/);
  console.log('SQL proof passed: 50,000 sessions + 50,000 clips, keyset pages, month summaries, literal search, exact counts and role/tenant isolation.');
} finally {
  await db.close();
}
