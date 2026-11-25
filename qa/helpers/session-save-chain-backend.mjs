import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { syntheticPostgres, id } from './relations-permissions-postgres.mjs';
import { receiptPostgresHttp } from './session-receipt-postgres-http.mjs';

const require = createRequire(import.meta.url);
export const sessionKey = 'football-session-planner-v3';
export const date = '2026-11-24';
export const baseline = { selectedDate: date, sessions: { [date]: { date, title: 'Test training',
  selectedBlockId: 'fixture-block', blocks: [{ id: 'fixture-block', title: 'Original exercise', objective: 'Original objective', minutes: 20 }] } } };
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const config = { APP_STATE_DATABASE_MODE: 'database', SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'synthetic-public', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-server' };

export async function startSessionSaveBackend(timing, { seedSessions = true } = {}) {
  const db = await syntheticPostgres();
  const sql = input => db.pg.sql(db.source, input);
  const previous = Object.fromEntries(Object.keys(config).map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const handlerPath = require.resolve('../../api/app-state.js');
  const actors = new Map();
  const actorIds = new Map();
  const runId = randomUUID();
  let server, reject = false;
  const transport = receiptPostgresHttp(db, { resolveActor: authorization => actors.get(authorization), onReceipt: operationId => timing?.markCommit(operationId) });
  function actor(number, role = 'coach') {
    // Keep the same synthetic identity on reload within a case. A new
    // backend represents new users and must have independent rate limits.
    const actorId = actorIds.get(number) ?? randomUUID();
    actorIds.set(number, actorId);
    const user = { id: actorId, email: `qa-${number}@example.invalid`, user_metadata: { firstName: 'Synthetic', lastName: `Editor ${number}` },
      app_metadata: { role, status: 'active', organizationId: id(100), clubId: id(101), teamId: id(102) } };
    const token = `qa-set-pieces-token-${user.id}`;
    // Existing browser fixture uses the actor ID in its synthetic bearer.
    actors.set(`Bearer ${token}`, user);
    return { user, token };
  }
  async function close() {
    if (server?.listening) {
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    }
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    delete require.cache[handlerPath];
    await db.close();
  }
  try {
    await sql(await readFile(new URL('../../supabase/migrations/20260925200724_session_save_receipts.sql', import.meta.url), 'utf8'));
    for (const [key, moduleId, value] of [
      [sessionKey, 'session-planner', baseline],
      ['football-schedule-v1', 'schedule', { selectedDate: date, events: [{ id: 'qa-training', date, type: 'training', title: 'Test training' }] }],
    ]) {
      if (key === sessionKey && !seedSessions) continue;
      await sql(`insert into public.platform_app_state_records
        (organization_id,state_key,module_id,merge_policy,revision,value,value_hash)
        values ('global',${quote(key)},${quote(moduleId)},'date-scoped',10,${quote(JSON.stringify(value))},repeat('a',64))`);
    }
    Object.assign(process.env, config);
    globalThis.fetch = (input, options) => {
      const url = new URL(input);
      if (url.hostname === '127.0.0.1') return originalFetch(input, options);
      return transport.fetch(input, options);
    };
    delete require.cache[handlerPath];
    const handler = require(handlerPath);
    server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const authorization = req.headers.authorization;
      if (url.pathname !== '/api/app-state' || !actors.has(authorization) || !['GET', 'POST'].includes(req.method)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false }));
      }
      try {
        req.headers['x-forwarded-for'] = `qa-${runId}-${actors.get(authorization).id}`;
        if (req.method === 'POST' && reject) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, reason: 'Test transport unavailable' }));
        }
        await handler(req, res);
      } catch {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, reason: 'Synthetic handler failed' }));
      }
    });
    await new Promise((resolve, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(0, '127.0.0.1', resolve);
    });
    return { origin: `http://127.0.0.1:${server.address().port}`, actor, close,
      denyWrites(value) { reject = value; },
      state: async () => JSON.parse(await sql(`select json_build_object('revision',revision,'value',value::json) from platform_app_state_records where state_key=${quote(sessionKey)} and organization_id='global'`)),
      operations: async () => JSON.parse(await sql("select coalesce(json_agg(operation_id order by created_at), '[]'::json) from session_save_receipts")),
      counts: async () => JSON.parse(await sql(`select json_build_object('receipts',(select count(*) from session_save_receipts),'effects',(select count(*) from session_save_effects))`)),
    };
  } catch (error) {
    await close();
    throw error;
  }
}
