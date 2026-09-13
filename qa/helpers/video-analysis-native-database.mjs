import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Synthetic local database only. No inherited database URL or TCP listener.
export function createVideoAnalysisNativeDatabase() {
  if (!process.env.FS_TEST_PG_BIN) throw new Error("FS_TEST_PG_BIN must point to PostgreSQL 17 binaries.");
  const bin = resolve(process.env.FS_TEST_PG_BIN);
  const root = mkdtempSync(join(tmpdir(), "fs-clip-db-test-"));
  const data = join(root, "data"), socket = join(root, "socket");
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C", PGHOST: socket, PGPORT: "55439", PGUSER: "fs_test", PGDATABASE: "postgres" };
  const run = (tool, args, input) => execFileSync(join(bin, tool), args, { env, input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  const sql = input => run("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], input).trim();
  const close = () => {
    if (existsSync(join(data, "postmaster.pid"))) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    rmSync(root, { recursive: true, force: true });
  };
  try {
    mkdirSync(socket, { mode: 0o700 });
    run("initdb", ["-D", data, "-U", "fs_test", "--auth-local=trust", "--auth-host=reject", "--encoding=UTF8", "--no-locale"]);
    run("pg_ctl", ["-D", data, "-l", join(root, "server.log"), "-w", "start", "-o", `-h '' -k ${socket} -p 55439 -c unix_socket_permissions=0700`]);
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create table platform_permission_matrix (module_id text, action text, roles text[], scope text,
        requires_organization_scope boolean, requires_team_scope boolean, description text,
        updated_at timestamptz, primary key (module_id, action));`);
    for (const name of ["20260613000100_video_analysis_metadata_foundation.sql", "20260614004604_video_analysis_workstation_v2_metadata.sql", "20260824212110_video_analysis_elite_workstation_foundation.sql"]) {
      sql(readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8"));
    }
    return { sql, close };
  } catch (error) { close(); throw error; }
}

const literal = value => value === null ? "null" : `'${String(typeof value === "object" ? JSON.stringify(value) : value).replaceAll("'", "''")}'`;
const identifier = value => {
  if (!/^[a-z_]+$/.test(value)) throw new Error("Unsupported test identifier");
  return `"${value}"`;
};

export function videoAnalysisTestRest(db, calls) {
  return async (address, options = {}) => {
    const url = new URL(address);
    if (url.origin !== "https://fs-clip-test.invalid" || !/^\/rest\/v1\/video_[a-z_]+$/.test(url.pathname)) throw new Error("Unexpected test request");
    const table = identifier(url.pathname.split("/").at(-1));
    const method = options.method || "GET", body = options.body ? JSON.parse(options.body) : {};
    calls.push({ method, table, body });
    const conditions = [];
    for (const [key, value] of url.searchParams) {
      if (["select", "order", "limit", "offset"].includes(key)) continue;
      const column = identifier(key);
      if (value.startsWith("eq.")) conditions.push(`${column} = ${literal(value.slice(3))}`);
      else if (value.startsWith("in.(")) conditions.push(`${column} in (${value.slice(4, -1).split(",").map(literal).join(",")})`);
      else throw new Error("Unsupported test filter");
    }
    const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
    let statement;
    if (method === "GET") statement = `select * from public.${table}${where}`;
    else if (method === "DELETE") statement = `delete from public.${table}${where} returning *`;
    else if (method === "PATCH") statement = `update public.${table} set ${Object.entries(body).map(([key, value]) => `${identifier(key)}=${literal(value)}`).join(",")}${where} returning *`;
    else if (method === "POST") statement = `insert into public.${table} (${Object.keys(body).map(identifier).join(",")}) values (${Object.values(body).map(literal).join(",")}) returning *`;
    else throw new Error("Unsupported test method");
    try {
      const payload = db.sql(`with result as (${statement}) select coalesce(jsonb_agg(result), '[]'::jsonb) from result;`);
      return new Response(payload, { status: 200 });
    } catch (error) {
      const message = String(error.stderr).match(/ERROR:\s+([A-Z0-9]+):\s+([^\n]+)/);
      return new Response(JSON.stringify({ code: message?.[1], message: message?.[2] || "Synthetic database error" }), { status: 400 });
    }
  };
}
