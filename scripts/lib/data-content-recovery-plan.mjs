// A bounded data-content drill, not a schema/security restore or a retained backup.
export const recoveryTables = Object.freeze([
  "platform_organizations", "platform_clubs", "platform_teams", "platform_user_profiles",
  "platform_memberships", "platform_tenant_links", "platform_module_migration_checkpoints",
  "platform_membership_events", "squad_teams", "squad_players", "squad_roster_memberships",
  "platform_app_state_records", "medical_state_sync_events",
]);
export const productionRef = "bustidorxevacosqhkcz";
export const productionPooler = "aws-1-us-east-1.pooler.supabase.com";
export const maxRecoveryBytes = 256 * 1024 * 1024;
export const caUrl = "https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt";
export const caFingerprint = "807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa";

export function recoveryPlan() {
  return {
    kind: "data-content-drill-v1", mode: "plan", tables: [...recoveryTables],
    sourceReadOnly: true, destination: "new-private-unix-socket-database",
    retainedArchive: false, rawDataInLogs: false, fullRecoveryVerified: false,
    excludes: ["auth-secrets", "schema-security", "storage-object-bytes", "offline-drafts", "other-domain-tables"],
  };
}

export function requireExecution(env) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_EVENT_NAME !== "workflow_dispatch"
      || env.GITHUB_REPOSITORY !== "maklind88/footballscience" || env.GITHUB_REF !== "refs/heads/main"
      || env.RUNNER_ENVIRONMENT !== "github-hosted" || env.RUNNER_OS !== "Linux") {
    throw new Error("execution-requires-manual-main-on-github-hosted-linux");
  }
  if (!/^[a-f0-9]{40}$/.test(env.RECOVERY_EXPECTED_SHA || "")
      || env.RECOVERY_EXPECTED_SHA !== env.GITHUB_SHA
      || env.RECOVERY_CONFIRM !== "DATA_CONTENT_DRILL_ONLY") throw new Error("execution-not-confirmed-for-sha");
  if (env.SUPABASE_PROJECT_REF !== productionRef || env.SUPABASE_DB_POOLER_HOST !== productionPooler) {
    throw new Error("source-identity-mismatch");
  }
  if (!env.SUPABASE_DB_PASSWORD || /[\r\n\0]/.test(env.SUPABASE_DB_PASSWORD)) throw new Error("missing-or-invalid-credential");
}

export function identifier(value) {
  if (typeof value !== "string" || !/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("unsupported-identifier");
  return `"${value}"`;
}

export function snapshotTransaction(snapshot, sql) {
  if (!/^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$/.test(snapshot)) throw new Error("invalid-snapshot");
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT '${snapshot}'; ${sql}; ROLLBACK;`;
}

export function metadataQuery(tables = recoveryTables) {
  const names = tables.map((name) => { identifier(name); return `'${name}'`; }).join(",");
  return `SELECT coalesce(jsonb_agg(m ORDER BY m.name), '[]') FROM (
    SELECT c.relname AS name, c.relkind AS kind, pg_table_size(c.oid) AS bytes,
      (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
        'typeSchema',tn.nspname,'generated',a.attgenerated,'identity',a.attidentity,'notNull',a.attnotnull)
        ORDER BY a.attnum) FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid
        JOIN pg_namespace tn ON tn.oid=t.typnamespace
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN (${names})
  ) m`;
}

export function contentTableDDL(metadata, tables = recoveryTables) {
  if (!Array.isArray(metadata) || metadata.length !== tables.length
      || new Set(metadata.map((t) => t.name)).size !== tables.length
      || tables.some((name) => !metadata.some((t) => t.name === name))) throw new Error("incomplete-table-scope");
  let bytes = 0;
  const ddl = metadata.map((table) => {
    if (table.kind !== "r" || !Number.isSafeInteger(table.bytes) || table.bytes < 0
        || !Array.isArray(table.columns) || !table.columns.length) throw new Error("unsupported-table-shape");
    bytes += table.bytes;
    const columns = table.columns.map((column) => {
      // No source defaults, functions, generated expressions, enums or extensions execute locally.
      if (column.typeSchema !== "pg_catalog" || column.generated || column.identity
          || !/^(uuid|text|boolean|smallint|integer|bigint|real|double precision|json|jsonb|bytea|date|timestamp(?:\([0-6]\))? (?:with|without) time zone|numeric(?:\(\d+,\d+\))?|character varying(?:\(\d+\))?)(?:\[\])?$/.test(column.type)) {
        throw new Error("unsupported-column-type");
      }
      return `${identifier(column.name)} ${column.type}${column.notNull ? " NOT NULL" : ""}`;
    });
    return `CREATE TABLE public.${identifier(table.name)} (${columns.join(",")});`;
  });
  if (bytes > maxRecoveryBytes) throw new Error("source-size-limit");
  return ddl.join("\n");
}

export function tableContentQuery(table) {
  return `COPY (SELECT row_to_json(t)::text AS value FROM public.${identifier(table)} t ORDER BY (row_to_json(t)::text) COLLATE "C") TO STDOUT`;
}

export function verifyDataOnlyToc(toc, tables = recoveryTables) {
  const entries = toc.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith(";"));
  const names = entries.map((line) => line.match(/^\d+; \d+ \d+ TABLE DATA public ([a-z_][a-z0-9_]*) [^\r\n]+$/)?.[1]);
  if (names.length !== tables.length || new Set(names).size !== tables.length
      || names.some((name) => !tables.includes(name))) throw new Error("unexpected-archive-entry");
}

export function compareContent(expected, actual) {
  const keys = Object.keys(expected).sort();
  if (JSON.stringify(keys) !== JSON.stringify(Object.keys(actual).sort()) || keys.some((key) =>
    expected[key].sha256 !== actual[key].sha256 || expected[key].rows !== actual[key].rows
    || expected[key].bytes !== actual[key].bytes)) throw new Error("restored-content-mismatch");
  return { tablesCompared: keys.length, rowsCompared: keys.reduce((sum, key) => sum + expected[key].rows, 0) };
}
