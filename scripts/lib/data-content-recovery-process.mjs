import { spawn } from "node:child_process";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { identifier, maxRecoveryBytes, snapshotTransaction, tableContentQuery } from "./data-content-recovery-plan.mjs";

export const readOnlyOptions = "-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=600000 -c timezone=UTC -c datestyle=ISO,YMD -c intervalstyle=postgres -c extra_float_digits=3 -c bytea_output=hex";
export const localOptions = "-c statement_timeout=30000 -c timezone=UTC -c datestyle=ISO,YMD -c intervalstyle=postgres -c extra_float_digits=3 -c bytea_output=hex";

export function postgresRunner(bin, root, signal) {
  // Deliberately exclude inherited PG*, tokens, startup files and arbitrary executable paths.
  const base = { PATH: `${bin}:/usr/bin:/bin`, HOME: root, TMPDIR: root, LANG: "C", LC_ALL: "C", PGCLIENTENCODING: "UTF8", PGCONNECT_TIMEOUT: "10" };
  function start(tool, args, { env = {}, input, onChunk, maxBytes = 4 * 1024 * 1024, timeout = 90_000, cleanup = false } = {}) {
    if (!/^(psql|pg_dump|pg_restore|initdb|pg_ctl|createdb)$/.test(tool)) throw new Error("unsupported-postgres-tool");
    if (!cleanup && signal?.aborted) throw new Error("recovery-aborted");
    let output = [];
    let bytes = 0;
    let failed = false;
    let forceTimer;
    const child = spawn(join(bin, tool), args, { cwd: root, env: { ...base, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    function stop() {
      failed = true;
      // psql/pg_dump SIGINT sends PostgreSQL's query-cancel request before disconnecting.
      child.kill(tool === "psql" || tool === "pg_dump" ? "SIGINT" : "SIGTERM");
      forceTimer ??= setTimeout(() => child.kill("SIGKILL"), 1000);
    }
    const timer = setTimeout(stop, timeout);
    const abort = () => stop();
    if (!cleanup) signal?.addEventListener("abort", abort, { once: true });
    const done = new Promise((resolve, reject) => {
      child.on("error", () => { failed = true; });
      child.stdin.on("error", () => { failed = true; });
      child.stderr.on("data", () => { /* Never publish raw database errors, values or SQL. */ });
      child.stdout.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) return stop();
        try {
          if (onChunk) onChunk(chunk);
          else output.push(chunk);
        } catch { stop(); }
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        clearTimeout(forceTimer);
        signal?.removeEventListener("abort", abort);
        if (failed || code !== 0) reject(new Error(`postgres-command-failed:${tool}`));
        else resolve(Buffer.concat(output).toString("utf8"));
        output = [];
      });
    });
    // Long-lived snapshot children can fail while another command is awaited.
    done.catch(() => {});
    if (input !== undefined) child.stdin.end(input);
    return { child, done, stop };
  }
  const run = async (tool, args, options) => start(tool, args, { input: "", ...options }).done;
  const sql = (env, input, options = {}) => run("psql", ["-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1"], { env, input, ...options });
  return { start, run, sql };
}

export async function holdRecoverySnapshot(pg, source, tables) {
  let text = "";
  let ready;
  let rejectReady;
  const readyPromise = new Promise((resolve, reject) => { ready = resolve; rejectReady = reject; });
  const held = pg.start("psql", ["-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1"], {
    env: source, timeout: 480_000, maxBytes: 4096,
    onChunk(chunk) {
      text += chunk.toString("utf8");
      if (text.includes("\n")) {
        const snapshot = text.trim();
        snapshotTransaction(snapshot, "SELECT 1");
        ready(snapshot);
      }
    },
  });
  held.done.then(() => rejectReady(new Error("snapshot-ended-early")), rejectReady);
  held.child.stdin.write(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; LOCK TABLE ${tables.map((table) => `public.${identifier(table)}`).join(",")} IN ACCESS SHARE MODE NOWAIT; SELECT pg_export_snapshot();\n`);
  const timeout = setTimeout(() => { held.stop(); rejectReady(new Error("snapshot-start-timeout")); }, 15_000);
  try {
    const snapshot = await readyPromise;
    return {
      snapshot,
      assertAlive() { if (held.child.exitCode !== null || held.child.signalCode !== null) throw new Error("snapshot-ended-early"); },
      async close() { held.child.stdin.end("ROLLBACK;\n"); await held.done; },
    };
  } catch (error) {
    held.stop();
    await held.done.catch(() => {});
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function contentDigests(pg, connection, tables, snapshot) {
  const result = {};
  let totalBytes = 0;
  for (const table of tables) {
    const hash = createHash("sha256");
    let bytes = 0;
    let rows = 0;
    const query = tableContentQuery(table);
    await pg.sql(connection, snapshot ? snapshotTransaction(snapshot, query) : query, {
      maxBytes: maxRecoveryBytes,
      onChunk(chunk) {
        totalBytes += chunk.length;
        if (totalBytes > maxRecoveryBytes) throw new Error("content-size-limit");
        hash.update(chunk);
        bytes += chunk.length;
        for (const byte of chunk) if (byte === 10) rows++;
      },
    });
    result[table] = { sha256: hash.digest("hex"), rows, bytes };
  }
  return result;
}
