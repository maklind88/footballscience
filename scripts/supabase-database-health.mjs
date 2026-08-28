import { spawnSync } from "node:child_process";
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
  const options = { dryRun: false, mode: "daily", outputDir: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") {
      options.dryRun = true;
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
  if (result.status === "failed") return "Collection failed; inspect credentials or connectivity.";
  if (result.status === "planned") return "Read-only check planned.";
  if (result.command === "blocking") return result.recordCount ? "Blocking queries need review." : "No blocking query signal.";
  if (result.command === "long-running-queries") {
    return result.recordCount ? "Queries over five minutes need review." : "No long-running query signal.";
  }
  if (result.command === "locks") return result.recordCount ? "Exclusive locks need review." : "No exclusive lock signal.";
  if (result.command === "bloat") return result.recordCount ? "Relation bloat needs review." : "No bloat signal.";
  return "Aggregate evidence collected; no automatic decision.";
}

function buildMarkdownSummary({ generatedAt, mode, results }) {
  const overall = assessResults(results);
  const rows = results.map(
    (result) => `| \`${result.command}\` | ${result.status} | ${result.recordCount} | ${interpretation(result)} |`
  );
  return [
    "# Supabase Database Health",
    "",
    `- Status: **${overall}**`,
    `- Mode: **${mode}**`,
    `- Generated: ${generatedAt}`,
    `- Supabase CLI: ${supabaseCliVersion}`,
    "- Database changes: **none**",
    "- Stored database/query details: **none**",
    "",
    "| Check | Collection | Signals | Meaning |",
    "|---|---:|---:|---|",
    ...rows,
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

function runInspectCommand({ command, dryRun = false }) {
  if (dryRun) return { command, durationMs: 0, recordCount: 0, status: "planned" };
  const cliPath = path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
  const dbUrl = buildInspectionDbUrl();
  const connectionArgs = dbUrl ? ["--db-url", dbUrl] : ["--linked"];
  const startedAt = Date.now();
  const result = spawnSync(cliPath, ["inspect", "db", command, ...connectionArgs], {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120_000,
  });
  const payload = result.status === 0 ? parseJsonOutput(result.stdout) : null;
  return {
    command,
    durationMs: Date.now() - startedAt,
    recordCount: payload === null ? 0 : countRecords(payload),
    status: result.status === 0 && payload !== null ? "completed" : "failed",
  };
}

function writeReport({ mode, outputDir, results, generatedAt = new Date().toISOString() }) {
  const status = assessResults(results);
  const markdown = buildMarkdownSummary({ generatedAt, mode, results });
  const report = {
    schema: "footballscience-supabase-database-health-v1",
    generatedAt,
    mode,
    status,
    supabaseCliVersion,
    databaseChanges: false,
    storedDatabaseDetails: false,
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
  commandPlan,
  countRecords,
  dailyCommands,
  parseArgs,
  parseJsonOutput,
  runInspectCommand,
  supabaseCliVersion,
  weeklyCommands,
  writeReport,
};

function main() {
  const options = parseArgs();
  const results = commandPlan(options.mode).map((command) => runInspectCommand({ command, dryRun: options.dryRun }));
  const { markdown, report } = writeReport({ mode: options.mode, outputDir: options.outputDir, results });
  console.log(markdown);
  console.log(`DATABASE_HEALTH_REPORT_JSON=${JSON.stringify(report)}`);
  if (results.some((result) => result.status === "failed")) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
