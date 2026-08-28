import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const supabaseCliVersion = "2.109.0";
const dailyCommands = Object.freeze([
  "db-stats",
  "blocking",
  "long-running-queries",
  "locks",
  "outliers",
  "role-stats",
]);
const weeklyCommands = Object.freeze([
  ...dailyCommands,
  "index-stats",
  "bloat",
  "vacuum-stats",
  "table-stats",
  "traffic-profile",
  "replication-slots",
]);
const redSignalCommands = new Set(["blocking", "long-running-queries"]);
const yellowSignalCommands = new Set(["locks", "bloat"]);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function commandPlan(mode = "daily") {
  const normalizedMode = String(mode || "").trim().toLowerCase();
  if (normalizedMode === "daily") return [...dailyCommands];
  if (normalizedMode === "weekly") return [...weeklyCommands];
  throw new Error(`Unsupported database health mode: ${mode}`);
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = { dryRun: false, investigateSignals: false, mode: "daily", outputDir: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") {
      options.dryRun = true;
    } else if (value === "--investigate-signals") {
      options.investigateSignals = true;
    } else if (value === "--mode") {
      options.mode = String(argv[index + 1] || "");
      index += 1;
    } else if (value === "--output-dir") {
      options.outputDir = String(argv[index + 1] || "");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  commandPlan(options.mode);
  if (!options.outputDir) options.outputDir = path.join(os.tmpdir(), "footballscience-supabase-health");
  return options;
}

function parseJsonOutput(value = "") {
  const output = String(value || "").replace(/\u001b\[[0-9;]*m/g, "").trim();
  if (!output) return [];
  try {
    return JSON.parse(output);
  } catch {
    for (let index = 0; index < output.length; index += 1) {
      if (output[index] !== "[" && output[index] !== "{") continue;
      try {
        return JSON.parse(output.slice(index));
      } catch {
        // Continue until a valid JSON payload is found.
      }
    }
  }
  return null;
}

function countRecords(payload) {
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== "object") return 0;
  for (const key of ["rows", "records", "data", "result", "items"]) {
    if (key in payload) return countRecords(payload[key]);
  }
  return Object.keys(payload).length ? 1 : 0;
}

function countInspectOutputRecords(value = "") {
  const parsed = parseJsonOutput(value);
  if (parsed !== null) return countRecords(parsed);
  const lines = String(value || "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split(/\r?\n/);
  const separatorIndex = lines.findIndex((line) => {
    const normalized = line.trim();
    return normalized.includes("|") && /^[\s|+-]+$/.test(normalized);
  });
  if (separatorIndex < 0) return null;
  return lines.slice(separatorIndex + 1).filter((line) => line.trim() && line.includes("|")).length;
}

function extractInspectRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of ["rows", "records", "data", "result", "items"]) {
    if (!(key in payload)) continue;
    const rows = extractInspectRows(payload[key]);
    if (rows.length || Array.isArray(payload[key])) return rows;
  }
  return [];
}

function rowValue(row, names) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
  const entries = Object.entries(row);
  for (const name of names) {
    const match = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
    if (match) return match[1];
  }
  return undefined;
}

function normalizeStatement(value = "") {
  return String(value || "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n\r]*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function classifyStatement(value = "") {
  const statement = normalizeStatement(value);
  if (!statement) return "unknown";
  if (/\b(pg_stat_activity|pg_locks|pg_stat_statements)\b/.test(statement)) return "database-monitoring";
  if (/^(vacuum|analyze|reindex|cluster|refresh\s+materialized\s+view)\b/.test(statement)) return "maintenance";
  if (/^(insert|update|delete|merge|copy|truncate)\b/.test(statement)) return "data-write";
  if (/^(create|alter|drop|grant|revoke|comment)\b/.test(statement)) return "schema-or-permission-change";
  if (/^(select|with|show|explain)\b/.test(statement)) return "data-read";
  if (/^(begin|commit|rollback|savepoint|release)\b/.test(statement)) return "transaction-control";
  return "unknown";
}

function statementFingerprint(value = "") {
  const statement = normalizeStatement(value)
    .replace(/'(?:''|[^'])*'/g, "?")
    .replace(/\b\d+(?:\.\d+)?\b/g, "?");
  if (!statement) return "none";
  return crypto.createHash("sha256").update(statement).digest("hex").slice(0, 16);
}

function durationBucket(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "unknown";
  const days = Number(text.match(/(\d+)\s+days?/)?.[1] || 0);
  const time = text.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!time && !days) return "unknown";
  const seconds = days * 86_400 + Number(time?.[1] || 0) * 3_600 + Number(time?.[2] || 0) * 60 + Number(time?.[3] || 0);
  if (seconds < 10 * 60) return "5-10 minutes";
  if (seconds < 30 * 60) return "10-30 minutes";
  if (seconds < 60 * 60) return "30-60 minutes";
  return "over 60 minutes";
}

function buildSafeSignalEvidence(command, payload) {
  if (!new Set(["long-running-queries", "locks"]).has(command)) return [];
  return extractInspectRows(payload).map((row) => {
    const statement = rowValue(row, command === "locks" ? ["stmt", "query"] : ["query", "stmt"]);
    const age = rowValue(row, command === "locks" ? ["age", "duration"] : ["duration", "age"]);
    const evidence = {
      ageBucket: durationBucket(age),
      fingerprint: statementFingerprint(statement),
      statementCategory: classifyStatement(statement),
    };
    if (command === "locks") {
      const relation = String(rowValue(row, ["relname", "relation"]) || "").trim().toLowerCase();
      const transaction = String(rowValue(row, ["transactionid", "transaction id"]) || "").trim().toLowerCase();
      evidence.granted = String(rowValue(row, ["granted"]) || "").toLowerCase() === "true";
      evidence.relationReference = relation && relation !== "null" ? "present" : "none";
      evidence.transactionReference = transaction && transaction !== "null" ? "present" : "none";
    }
    return evidence;
  });
}

function correlateSafeSignals(results = []) {
  const commandsByFingerprint = new Map();
  for (const result of results) {
    for (const signal of result.safeSignals || []) {
      if (signal.fingerprint === "none") continue;
      const commands = commandsByFingerprint.get(signal.fingerprint) || new Set();
      commands.add(result.command);
      commandsByFingerprint.set(signal.fingerprint, commands);
    }
  }
  return [...commandsByFingerprint.entries()]
    .filter(([, commands]) => commands.size > 1)
    .map(([fingerprint, commands]) => ({ commands: [...commands].sort(), fingerprint }));
}

function safeProbeValue(value, allowedValues) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowedValues.has(normalized) ? normalized : "unknown";
}

function booleanProbeValue(value) {
  return value === true || String(value || "").trim().toLowerCase() === "true";
}

function sanitizeSafeProbeRows(payload) {
  const signalTypes = new Set(["exclusive-lock", "long-running-query"]);
  const statementCategories = new Set([
    "data-read",
    "data-write",
    "database-monitoring",
    "maintenance",
    "other",
    "schema-or-permission-change",
    "transaction-control",
  ]);
  const sourceCategories = new Set(["application-or-admin", "database-internal", "supabase-service"]);
  const stateCategories = new Set([
    "active",
    "disabled",
    "fastpath-function",
    "idle-in-transaction",
    "idle-in-transaction-aborted",
    "other",
  ]);
  const waitCategories = new Set(["activity", "client", "io", "ipc", "lock", "none", "other", "timeout"]);
  const ageBuckets = new Set(["5-10 minutes", "10-30 minutes", "30-60 minutes", "over 60 minutes"]);
  return extractInspectRows(payload).map((row) => ({
    ageBucket: safeProbeValue(rowValue(row, ["age_bucket", "age bucket"]), ageBuckets),
    hasBlockers: booleanProbeValue(rowValue(row, ["has_blockers", "has blockers"])),
    relationReference: booleanProbeValue(rowValue(row, ["relation_reference", "relation reference"])),
    signalType: safeProbeValue(rowValue(row, ["signal_type", "signal type"]), signalTypes),
    sourceCategory: safeProbeValue(rowValue(row, ["source_category", "source category"]), sourceCategories),
    stateCategory: safeProbeValue(rowValue(row, ["state_category", "state category"]), stateCategories),
    statementCategory: safeProbeValue(
      rowValue(row, ["statement_category", "statement category"]),
      statementCategories
    ),
    transactionOpen: booleanProbeValue(rowValue(row, ["transaction_open", "transaction open"])),
    transactionReference: booleanProbeValue(
      rowValue(row, ["transaction_reference", "transaction reference"])
    ),
    waitCategory: safeProbeValue(rowValue(row, ["wait_category", "wait category"]), waitCategories),
  }));
}

function buildInspectionDbUrl({
  password = process.env.SUPABASE_DB_PASSWORD,
  poolerHost = process.env.SUPABASE_DB_POOLER_HOST,
  projectRef = process.env.SUPABASE_PROJECT_REF,
} = {}) {
  const normalizedHost = String(poolerHost || "").trim();
  if (!normalizedHost) return "";
  const normalizedPassword = String(password || "");
  const normalizedProjectRef = String(projectRef || "").trim();
  if (!normalizedPassword || !normalizedProjectRef) {
    throw new Error("Pooler inspection requires SUPABASE_DB_PASSWORD and SUPABASE_PROJECT_REF.");
  }
  if (!/^[a-z0-9.-]+$/i.test(normalizedHost)) {
    throw new Error("SUPABASE_DB_POOLER_HOST must be a hostname.");
  }
  const username = encodeURIComponent(`postgres.${normalizedProjectRef}`);
  return `postgresql://${username}:${encodeURIComponent(normalizedPassword)}@${normalizedHost}:5432/postgres?sslmode=require`;
}

function classifyInspectFailure({ error, status, stderr, stdout } = {}) {
  if (status === 0 && countInspectOutputRecords(stdout) === null) return "unexpected-output";
  const message = `${error?.message || ""}\n${stderr || ""}`.toLowerCase();
  if (/password authentication failed|authentication failed|invalid password|sasl/.test(message)) return "authentication";
  if (/could not translate host|no such host|name or service not known|dns/.test(message)) return "dns";
  if (/network is unreachable|no route to host|connection refused|connection timed out|timeout/.test(message)) {
    return "network";
  }
  if (/certificate|ssl|tls/.test(message)) return "tls";
  if (/prepared statement|transaction pool/.test(message)) return "pooler-mode";
  if (/connect|connection/.test(message)) return "connection";
  return "command-error";
}

function assessResults(results = []) {
  const failed = results.filter((result) => result.status === "failed");
  const redSignals = results.filter(
    (result) => result.status === "completed" && redSignalCommands.has(result.command) && result.recordCount > 0
  );
  const yellowSignals = results.filter(
    (result) => result.status === "completed" && yellowSignalCommands.has(result.command) && result.recordCount > 0
  );
  if (failed.length || redSignals.length) return "RED";
  if (yellowSignals.length) return "YELLOW";
  if (results.some((result) => result.status === "planned")) return "PLAN";
  return "GREEN";
}

function interpretation(result) {
  if (result.status === "failed") {
    return `Collection failed (${result.failureReason || "unknown"}); inspect the connection path.`;
  }
  if (result.status === "planned") return "Read-only check planned.";
  if (result.command === "blocking") return result.recordCount ? "Blocking queries need review." : "No blocking query signal.";
  if (result.command === "long-running-queries") {
    return result.recordCount ? "Queries over five minutes need review." : "No long-running query signal.";
  }
  if (result.command === "locks") return result.recordCount ? "Exclusive locks need review." : "No exclusive lock signal.";
  if (result.command === "bloat") return result.recordCount ? "Relation bloat needs review." : "No bloat signal.";
  return "Aggregate evidence collected; no automatic decision.";
}

function buildMarkdownSummary({ generatedAt, investigation, mode, results }) {
  const overall = assessResults(results);
  const correlations = correlateSafeSignals(results);
  const rows = results.map(
    (result) => `| \`${result.command}\` | ${result.status} | ${result.recordCount} | ${interpretation(result)} |`
  );
  const safeSignalRows = results.flatMap((result) =>
    (result.safeSignals || []).map((signal, index) => {
      const lockDetails =
        result.command === "locks"
          ? `, granted ${signal.granted}, relation ${signal.relationReference}, transaction ${signal.transactionReference}`
          : "";
      return `- \`${result.command}#${index + 1}\`: ${signal.statementCategory}, ${signal.ageBucket}, fingerprint \`${signal.fingerprint}\`${lockDetails}`;
    })
  );
  const signalSection = safeSignalRows.length
    ? [
        "",
        "## Safe signal classification",
        "",
        "Raw SQL, relation names, process IDs and database values are intentionally omitted.",
        "",
        ...safeSignalRows,
        ...(correlations.length
          ? [
              "",
              `Matching fingerprints across checks: ${correlations.map((entry) => `\`${entry.fingerprint}\``).join(", ")}.`,
            ]
          : []),
      ]
    : [];
  const probeSection = investigation?.signals?.length
    ? [
        "",
        "## Fixed read-only probe",
        "",
        ...investigation.signals.map(
          (signal, index) =>
            `- \`${signal.signalType}#${index + 1}\`: ${signal.statementCategory}, source ${signal.sourceCategory}, state ${signal.stateCategory}, wait ${signal.waitCategory}, ${signal.ageBucket}, blockers ${signal.hasBlockers}, transaction open ${signal.transactionOpen}, relation ${signal.relationReference}, transaction reference ${signal.transactionReference}`
        ),
      ]
    : [];
  return [
    "# Supabase Database Health",
    "",
    `- Status: **${overall}**`,
    `- Mode: **${mode}**`,
    `- Generated: ${generatedAt}`,
    `- Supabase CLI: ${supabaseCliVersion}`,
    "- Database changes: **none**",
    "- Stored raw database/query details: **none**",
    "",
    "| Check | Collection | Signals | Meaning |",
    "|---|---:|---:|---|",
    ...rows,
    ...signalSection,
    ...probeSection,
    "",
    "## Next decision",
    "",
    overall === "GREEN"
      ? "No action is required now. Continue monitoring."
      : overall === "PLAN"
        ? "Inspection plan verified. No database connection was attempted."
        : "Codex should propose a targeted read-only investigation. No fix may run before the user approves the plan.",
  ].join("\n");
}

function runInspectCommand({ command, dryRun = false, investigateSignals = false }) {
  if (dryRun) return { command, durationMs: 0, recordCount: 0, status: "planned" };
  const cliPath = path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
  const dbUrl = buildInspectionDbUrl();
  const connectionArgs = dbUrl ? ["--db-url", dbUrl] : ["--linked"];
  const startedAt = Date.now();
  const result = spawnSync(cliPath, ["inspect", "db", command, ...connectionArgs, "--output-format", "json"], {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120_000,
  });
  const recordCount = result.status === 0 ? countInspectOutputRecords(result.stdout) : null;
  const completed = result.status === 0 && recordCount !== null;
  const safeSignals =
    completed && investigateSignals ? buildSafeSignalEvidence(command, parseJsonOutput(result.stdout)) : [];
  return {
    command,
    durationMs: Date.now() - startedAt,
    ...(safeSignals.length ? { safeSignals } : {}),
    ...(completed
      ? {}
      : { failureReason: classifyInspectFailure({ error: result.error, status: result.status, stderr: result.stderr, stdout: result.stdout }) }),
    recordCount: recordCount === null ? 0 : recordCount,
    status: completed ? "completed" : "failed",
  };
}

function runSafeSignalProbe({ dryRun = false } = {}) {
  if (dryRun) return { databaseChanges: false, signals: [], status: "planned" };
  const cliPath = path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
  const dbUrl = buildInspectionDbUrl();
  const sqlPath = path.join(rootDir, "scripts", "supabase-database-health-investigation.sql");
  const connectionArgs = dbUrl ? ["--db-url", dbUrl] : ["--linked"];
  const startedAt = Date.now();
  const result = spawnSync(
    cliPath,
    ["db", "query", "--file", sqlPath, ...connectionArgs, "--output-format", "json"],
    {
      cwd: rootDir,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1", PGOPTIONS: "-c default_transaction_read_only=on" },
      maxBuffer: 8 * 1024 * 1024,
      timeout: 120_000,
    }
  );
  const payload = result.status === 0 ? parseJsonOutput(result.stdout) : null;
  const completed = result.status === 0 && payload !== null;
  return {
    databaseChanges: false,
    durationMs: Date.now() - startedAt,
    ...(completed
      ? { signals: sanitizeSafeProbeRows(payload) }
      : {
          failureReason: classifyInspectFailure({
            error: result.error,
            status: result.status,
            stderr: result.stderr,
            stdout: result.stdout,
          }),
          signals: [],
        }),
    status: completed ? "completed" : "failed",
  };
}

function writeReport({ investigation = null, mode, outputDir, results, generatedAt = new Date().toISOString() }) {
  const status = assessResults(results);
  const markdown = buildMarkdownSummary({ generatedAt, investigation, mode, results });
  const report = {
    schema: "footballscience-supabase-database-health-v1",
    generatedAt,
    mode,
    status,
    supabaseCliVersion,
    databaseChanges: false,
    storedDatabaseDetails: false,
    storedDerivedSignalMetadata: results.some((result) => result.safeSignals?.length),
    investigation,
    signalCorrelations: correlateSafeSignals(results),
    results,
  };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "summary.md"), `${markdown}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { markdown, report };
}

export {
  assessResults,
  buildInspectionDbUrl,
  buildMarkdownSummary,
  buildSafeSignalEvidence,
  classifyStatement,
  classifyInspectFailure,
  commandPlan,
  correlateSafeSignals,
  countInspectOutputRecords,
  countRecords,
  dailyCommands,
  durationBucket,
  extractInspectRows,
  parseArgs,
  parseJsonOutput,
  runInspectCommand,
  runSafeSignalProbe,
  sanitizeSafeProbeRows,
  statementFingerprint,
  supabaseCliVersion,
  weeklyCommands,
  writeReport,
};

function main() {
  const options = parseArgs();
  const results = commandPlan(options.mode).map((command) =>
    runInspectCommand({ command, dryRun: options.dryRun, investigateSignals: options.investigateSignals })
  );
  const investigation = options.investigateSignals ? runSafeSignalProbe({ dryRun: options.dryRun }) : null;
  const { markdown, report } = writeReport({
    investigation,
    mode: options.mode,
    outputDir: options.outputDir,
    results,
  });
  console.log(markdown);
  console.log(`DATABASE_HEALTH_REPORT_JSON=${JSON.stringify(report)}`);
  if (results.some((result) => result.status === "failed") || investigation?.status === "failed") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
