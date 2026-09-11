import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRecoveryWorkspace } from "../../scripts/lib/data-content-recovery-drill.mjs";
import { localOptions, postgresRunner } from "../../scripts/lib/data-content-recovery-process.mjs";

// A dependency-closed foundation slice, not the complete production migration history.
export const migrations = [
  "20260507130000_chat_module_multitenant.sql",
  "20260507185637_squad_module_multitenant.sql",
  "20260507230628_medical_module_multitenant.sql",
  "20260508000000_squad_data_loss_guards.sql",
  "20260510030705_platform_security_control_plane.sql",
  "20260511210558_add_scout_role_access.sql",
  "20260513155836_extend_squad_availability_statuses.sql",
  "20260515045748_platform_identity_foundation.sql",
  "20260721153039_platform_app_state_database_source_v1.sql",
  "20260721153918_platform_app_state_write_rpc_v2.sql",
];

export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const claims = (user = 1, role = "coach") => ({ sub: id(user), app_metadata: { role }, user_metadata: {} });
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

export async function syntheticPostgres() {
  assert.ok(process.env.FS_RECOVERY_PG_BIN, "Set FS_RECOVERY_PG_BIN to a verified PostgreSQL 17 installation");
  const bin = resolve(process.env.FS_RECOVERY_PG_BIN);
  const root = createRecoveryWorkspace();
  const data = join(root, "data");
  const socket = join(root, "socket");
  const pg = postgresRunner(bin, root);
  // No connection string is accepted, and inherited PG credentials are not used.
  const source = { PGHOST: socket, PGPORT: "5432", PGUSER: "synthetic", PGDATABASE: "postgres",
    PGOPTIONS: `${localOptions} -c search_path=public,extensions` };
  const start = () => pg.run("pg_ctl", ["-D", data, "-l", join(root, "log"), "-w", "start", "-o",
    `-h '' -k ${socket} -p 5432 -c unix_socket_permissions=0700`]);
  const stop = () => pg.run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"], { cleanup: true });
  const close = async () => {
    if (existsSync(join(data, "postmaster.pid"))) await stop();
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  };
  try {
    assert.match(await pg.run("psql", ["--version"]), /PostgreSQL\) 17\./);
    mkdirSync(socket, { mode: 0o700 });
    await pg.run("initdb", ["-D", data, "-U", "synthetic", "--auth-local=trust", "--auth-host=reject", "--encoding=UTF8", "--no-locale"]);
    await start();
    await pg.sql(source, `
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
      $$;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
    `);
    for (const file of migrations) {
      try { await pg.sql(source, readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8")); }
      catch (error) { throw new Error(`foundation-migration-failed:${file}`, { cause: error }); }
    }
    await pg.sql(source, readFileSync(new URL("../fixtures/relations-permissions.sql", import.meta.url), "utf8"));
    return { pg, root, source, close, restart: async () => { await stop(); await start(); } };
  } catch (error) { await close(); throw error; }
}

export async function asActor(db, query, { role = "authenticated", jwt = claims(), before = "" } = {}) {
  assert.ok(["authenticated", "anon", "service_role", "synthetic"].includes(role));
  return (await db.pg.sql(db.source, `\\o /dev/null
    BEGIN; ${before}
    \\o
    SET LOCAL SESSION AUTHORIZATION ${role};
    SET LOCAL ROLE ${role}; SET LOCAL request.jwt.claims = ${literal(JSON.stringify(jwt))};
    ${query}; ROLLBACK;`)).trim();
}

// SQLSTATE, not a generic rejected promise, distinguishes security/FK failures from harness errors.
export async function statementOutcome(db, query, options = {}) {
  const before = `${options.before ?? ""}
    CREATE FUNCTION pg_temp.audit_probe() RETURNS text LANGUAGE plpgsql AS $probe$
    BEGIN EXECUTE ${literal(query)}; RETURN 'accepted'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $probe$;`;
  return asActor(db, "SELECT pg_temp.audit_probe()", { ...options, before });
}

export async function catalog(db) {
  return JSON.parse(await db.pg.sql(db.source, `SELECT jsonb_build_object(
    'constraints', (SELECT jsonb_agg(v ORDER BY v::text) FROM (
      SELECT jsonb_build_array(conrelid::regclass::text, conname, pg_get_constraintdef(oid), convalidated) v
      FROM pg_constraint WHERE connamespace IN ('public'::regnamespace,'auth'::regnamespace)) s),
    'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public'),
    'tables', (SELECT jsonb_agg(jsonb_build_array(relname,relrowsecurity,relforcerowsecurity,
      coalesce(relacl,acldefault('r',relowner)),reloptions,
      CASE WHEN relkind='v' THEN pg_get_viewdef(oid,true) ELSE null END) ORDER BY relname)
      FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','v')),
    'columns', (SELECT jsonb_agg(jsonb_build_array(attrelid::regclass::text,attname,attacl) ORDER BY attrelid::regclass::text,attname)
      FROM pg_attribute WHERE attrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) AND attacl IS NOT NULL),
    'functions', (SELECT jsonb_agg(jsonb_build_array(proname,pg_get_functiondef(oid),
      ARRAY(SELECT item::text FROM unnest(coalesce(proacl,acldefault('f',proowner))) item ORDER BY item::text)) ORDER BY proname,oid::regprocedure::text)
      FROM pg_proc WHERE pronamespace='app_private'::regnamespace),
    'triggers', (SELECT jsonb_agg(pg_get_triggerdef(oid) ORDER BY tgrelid::regclass::text,tgname)
      FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace))
  );`));
}
