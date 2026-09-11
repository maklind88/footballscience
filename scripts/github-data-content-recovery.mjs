import { X509Certificate, createHash } from "node:crypto";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { caFingerprint, caUrl, productionPooler, productionRef, recoveryPlan, requireExecution } from "./lib/data-content-recovery-plan.mjs";
import { createRecoveryWorkspace, runContentRecovery } from "./lib/data-content-recovery-drill.mjs";

if (process.argv.slice(2).join(" ") !== "--execute") {
  console.error("Use the offline recovery:data:plan command; execution requires the reviewed manual GitHub job.");
  process.exitCode = 1;
} else {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 480_000);
  let interrupted;
  let root;
  const handlers = new Map(["SIGHUP", "SIGINT", "SIGTERM"].map((signal) => [signal, () => { interrupted = signal; controller.abort(); }]));
  for (const [signal, handler] of handlers) process.on(signal, handler);
  try {
    requireExecution(process.env);
    // This CLI has no configurable destination, table list, PGOPTIONS or executable path.
    const bin = "/usr/lib/postgresql/17/bin";
    root = createRecoveryWorkspace("/tmp");
    const response = await fetch(caUrl, { redirect: "error", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
    if (!response.ok) throw new Error("ca-download-failed");
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 32_768) throw new Error("ca-too-large");
      chunks.push(chunk);
    }
    const pem = Buffer.concat(chunks).toString("utf8");
    const cert = new X509Certificate(pem);
    if (createHash("sha256").update(cert.raw).digest("hex") !== caFingerprint) throw new Error("ca-fingerprint-mismatch");
    const ca = join(root, "root.crt");
    writeFileSync(ca, pem, { mode: 0o600, flag: "wx" });
    const source = {
      PGHOST: productionPooler, PGPORT: "5432", PGUSER: `postgres.${productionRef}`, PGDATABASE: "postgres",
      PGPASSWORD: process.env.SUPABASE_DB_PASSWORD, PGSSLMODE: "verify-full", PGSSLROOTCERT: ca,
      PGAPPNAME: "footballscience-readonly-content-drill",
    };
    const result = await runContentRecovery({ bin, root, source, signal: controller.signal });
    controller.signal.throwIfAborted();
    if (existsSync(root)) throw new Error("recovery-cleanup-incomplete");
    console.log(JSON.stringify({ ...result, sourceProject: productionRef, commit: process.env.GITHUB_SHA, excludes: recoveryPlan().excludes, cleanupVerified: true }));
  } catch {
    // No exception messages: pg/client errors can embed credentials, SQL or row contents.
    console.error("Data content recovery failed closed. No recovery approval granted. No raw diagnostics published.");
    process.exitCode = interrupted ? { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 }[interrupted] : 1;
  } finally {
    clearTimeout(timer);
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    // Before initdb/start, this directory contains at most the verified CA.
    if (root && existsSync(root) && !existsSync(join(root, "data"))) rmSync(root, { recursive: true, force: true });
  }
}
