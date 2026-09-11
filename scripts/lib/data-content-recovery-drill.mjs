import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, rmSync, statSync, writeSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compareContent, contentTableDDL, maxRecoveryBytes, metadataQuery, recoveryTables, snapshotTransaction, verifyDataOnlyToc } from "./data-content-recovery-plan.mjs";
import { contentDigests, holdRecoverySnapshot, localOptions, postgresRunner, readOnlyOptions } from "./data-content-recovery-process.mjs";

export function createRecoveryWorkspace(parent = tmpdir()) {
  const root = mkdtempSync(join(parent, "fs-content-recovery-"));
  chmodSync(root, 0o700);
  return root;
}

// Source injection is for synthetic tests. The only execution CLI binds production separately.
export async function runContentRecovery({ bin, root, source, signal, tables = recoveryTables }) {
  if ((statSync(root).mode & 0o777) !== 0o700) throw new Error("private-workspace-required");
  for (const name of ["data", "socket", "content.dump", "postgres.log"]) {
    if (existsSync(join(root, name))) throw new Error("recovery-workspace-not-empty");
  }
  const pg = postgresRunner(bin, root, signal);
  const socket = join(root, "socket");
  const data = join(root, "data");
  const archive = join(root, "content.dump");
  const local = { PGHOST: socket, PGPORT: "5432", PGUSER: "fs_recovery_operator", PGDATABASE: "recovered", PGOPTIONS: localOptions };
  const readonly = { ...source, PGOPTIONS: readOnlyOptions };
  let held;
  let serverAttempted = false;
  let archiveFd;
  let cleanupOK = true;
  try {
    for (const tool of ["pg_dump", "pg_restore", "initdb"]) {
      if (!/\(PostgreSQL\) 17\./.test(await pg.run(tool, ["--version"]))) throw new Error("postgres17-required");
    }
    mkdirSync(socket, { mode: 0o700 });
    await pg.run("initdb", ["-D", data, "-U", local.PGUSER, "--auth-local=trust", "--auth-host=reject", "--encoding=UTF8", "--no-locale"]);
    async function startLocal() {
      serverAttempted = true;
      // Finish the bounded startup handshake even on cancellation, then stop the known server.
      await pg.run("pg_ctl", ["-D", data, "-l", join(root, "postgres.log"), "-w", "-t", "20", "start", "-o", `-h '' -k ${socket} -p 5432 -c unix_socket_permissions=0700 -c log_statement=none -c log_min_error_statement=panic -c log_min_messages=panic`], { cleanup: true, timeout: 30_000 });
    }
    await startLocal();
    await pg.run("createdb", ["-w", "recovered"], { env: { ...local, PGDATABASE: "postgres" } });
    if ((await pg.sql(local, "SELECT inet_server_addr() IS NULL AND current_setting('listen_addresses') = '';")).trim() !== "t") {
      throw new Error("destination-not-private");
    }
    held = await holdRecoverySnapshot(pg, readonly, tables);
    const metadata = JSON.parse(await pg.sql(readonly, snapshotTransaction(held.snapshot, metadataQuery(tables))));
    const ddl = contentTableDDL(metadata, tables);
    const expected = await contentDigests(pg, readonly, tables, held.snapshot);
    held.assertAlive();
    archiveFd = openSync(archive, "wx", 0o600);
    await pg.run("pg_dump", ["-w", "--format=custom", "--data-only", "--no-owner", "--no-privileges", "--no-large-objects", "--strict-names", "--lock-wait-timeout=2000", `--snapshot=${held.snapshot}`, ...tables.map((table) => `--table=public.${table}`)], {
      env: readonly, maxBytes: maxRecoveryBytes, onChunk: (chunk) => {
        let offset = 0;
        while (offset < chunk.length) offset += writeSync(archiveFd, chunk, offset);
      },
    });
    closeSync(archiveFd);
    archiveFd = undefined;
    held.assertAlive();
    await held.close();
    held = undefined;
    verifyDataOnlyToc(await pg.run("pg_restore", ["--list", archive]), tables);
    await pg.sql(local, `BEGIN; ${ddl} COMMIT;`);
    await pg.run("pg_restore", ["-w", "--data-only", "--no-owner", "--no-privileges", "--exit-on-error", "--single-transaction", "--dbname=recovered", archive], { env: local });
    const comparison = compareContent(expected, await contentDigests(pg, local, tables));
    await pg.run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    await startLocal();
    compareContent(expected, await contentDigests(pg, local, tables));
    return { ok: true, kind: "data-content-drill-v1", ...comparison, restartVerified: true, fullRecoveryVerified: false, sourceWritten: false, retainedArchive: false };
  } finally {
    if (archiveFd !== undefined) closeSync(archiveFd);
    if (held) await held.close().catch(() => { cleanupOK = false; });
    if (serverAttempted && existsSync(join(data, "postmaster.pid"))) {
      await pg.run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"], { cleanup: true }).catch(() => { cleanupOK = false; });
    }
    if (existsSync(join(data, "postmaster.pid"))) throw new Error("recovery-cleanup-incomplete");
    rmSync(root, { recursive: true, force: true });
    if (!cleanupOK) throw new Error("recovery-cleanup-incomplete");
  }
}
