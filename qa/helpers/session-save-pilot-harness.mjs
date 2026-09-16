import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { syntheticPostgres, id } from "./relations-permissions-postgres.mjs";

const require = createRequire(import.meta.url);
const { createSessionSavePilotHandler } = require("../../api/_lib/session-save-pilot-http.js");
const { rateLimitBuckets } = require("../../api/_lib/platform-security.js");
export const date = "2026-09-16";
export const initial = { sessions: { [date]: { date, title: "Original", blocks: [{ id: "a", title: "Press", minutes: 15 }] } } };
export const principal = { actorId: id(1), organizationId: id(101), clubId: id(201), teamId: id(301), epoch: "login-a" };
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
export const hash = (value) => createHash("sha256").update(value).digest("hex");

// The external Auth service is synthetic; actor parsing/cache and API guards
// are real. Unexpected network requests fail, never fall through to Supabase.
export function syntheticAuth() {
  // Each case owns a fresh synthetic server/database, not the prior case's
  // process-local rate counters. Guards remain real for every request in it.
  rateLimitBuckets.clear();
  const env = Object.fromEntries(["SUPABASE_URL", "SUPABASE_ANON_KEY"].map((key) => [key, process.env[key]]));
  const nativeFetch = global.fetch, token = randomUUID(), peerToken = randomUUID();
  process.env.SUPABASE_URL = "https://session-save.synthetic.invalid";
  process.env.SUPABASE_ANON_KEY = "synthetic-anon";
  global.fetch = async (url, options) => {
    if (String(url) !== "https://session-save.synthetic.invalid/auth/v1/user") throw new Error("Unexpected network request");
    const actorId = options.headers.Authorization === `Bearer ${token}` ? id(1)
      : options.headers.Authorization === `Bearer ${peerToken}` ? id(3) : null;
    return new Response(JSON.stringify(actorId ? { id: actorId, app_metadata: { role: "guest", status: "active" },
      user_metadata: { role: "admin", organizationId: id(999), teamId: id(999) } } : {}), { status: actorId ? 200 : 401 });
  };
  return { token, peerToken, close() {
    global.fetch = nativeFetch;
    for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  } };
}

export async function invoke(handler, { body, token, method = "POST", raw } = {}) {
  const res = { headers: {}, body: "", statusCode: 200,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(chunk = "") { this.body += chunk; } };
  const req = { method, url: "/api/app-state?sessionTransport=gzip-base64-v1", headers: { authorization: token ? `Bearer ${token}` : "" },
    async *[Symbol.asyncIterator]() { if (raw !== undefined || body !== undefined) yield Buffer.from(raw ?? JSON.stringify(body)); } };
  await handler(req, res);
  return { status: res.statusCode, payload: res.body ? JSON.parse(res.body) : null, headers: res.headers };
}

export async function sessionPilotDatabase() {
  const db = await syntheticPostgres();
  const sql = (query) => db.pg.sql(db.source, query);
  const calls = [];
  try {
    for (const name of ["20260916163623_session_save_atomic_receipts.sql", "20260916165132_session_save_scope_history.sql", "20260916170114_session_save_authorized_context.sql"]) {
      await sql(readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8"));
    }
    const raw = JSON.stringify(initial);
    await sql(`INSERT INTO platform_app_state_records (organization_id,state_key,module_id,merge_policy,revision,value,value_hash,metadata) VALUES
      ('${id(101)}','football-session-planner-v3','session-planner','merge',10,${literal(raw)},'${hash(raw)}','${JSON.stringify({ teamId: id(301) })}'),
      ('${id(101)}','football-workspace-hub-v3','platform-shell','merge',1,'{}','${hash("{}")}', '${JSON.stringify({ teamId: id(301) })}');`);
    const request = async (name, body) => {
      if (!["read_session_save_context", "commit_authorized_session_save"].includes(name)
        || !Object.keys(body).every((key) => /^p_[a-z_]+$/.test(key))) throw new Error("Invalid synthetic RPC");
      const args = Object.entries(body).map(([key, value]) => `${key} => ${literal(typeof value === "object" ? JSON.stringify(value) : value)}${typeof value === "object" ? "::jsonb" : ""}`).join(",");
      const entry = { name, body: structuredClone(body) }; calls.push(entry);
      entry.result = JSON.parse(await sql(`SET ROLE service_role; SELECT public.${name}(${args});`));
      return entry.result;
    };
    return { sql, calls, handler: createSessionSavePilotHandler({ request }),
      async state() {
        return JSON.parse(await sql(`SELECT jsonb_build_object('value',value::jsonb,'revision',revision,'hash',value_hash)
          FROM platform_app_state_records WHERE state_key='football-session-planner-v3' AND organization_id='${id(101)}'`));
      },
      async evidence() { return JSON.parse(await sql(`SELECT jsonb_build_object(
        'receipts',(SELECT count(*) FROM app_private.session_save_receipts),
        'effects',(SELECT count(*) FROM app_private.session_save_effects))`)); },
      close: db.close,
    };
  } catch (error) { await db.close(); throw error; }
}
