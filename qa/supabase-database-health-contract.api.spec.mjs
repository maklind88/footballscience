import { expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assessResults,
  buildInspectionDbUrl,
  buildSafeSignalEvidence,
  classifyStatement,
  classifyInspectFailure,
  commandPlan,
  correlateSafeSignals,
  countInspectOutputRecords,
  countRecords,
  durationBucket,
  parseJsonOutput,
  statementFingerprint,
  supabaseCliVersion,
} from "../scripts/supabase-database-health.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("database health plan separates daily and weekly read-only checks", () => {
  const daily = commandPlan("daily");
  const weekly = commandPlan("weekly");
  expect(daily).toEqual(["db-stats", "blocking", "long-running-queries", "locks", "outliers", "role-stats"]);
  expect(weekly).toEqual(expect.arrayContaining([...daily, "index-stats", "bloat", "vacuum-stats", "table-stats"]));
  expect(weekly.length).toBeGreaterThan(daily.length);
  expect(supabaseCliVersion).toBe("2.109.0");
});

test("database health parser keeps only aggregate record counts", () => {
  expect(countRecords(parseJsonOutput('[{"query":"private query"},{"query":"second query"}]'))).toBe(2);
  expect(countRecords(parseJsonOutput('{"data":[]}'))).toBe(0);
  expect(parseJsonOutput("not json")).toBeNull();
  expect(assessResults([{ command: "blocking", recordCount: 1, status: "completed" }])).toBe("RED");
  expect(assessResults([{ command: "locks", recordCount: 1, status: "completed" }])).toBe("YELLOW");
});

test("database health parser counts Supabase CLI table output without retaining row details", () => {
  const table = [
    " Name | Query | Age ",
    "------|-------|-----",
    " first | private query | 6m ",
    " second | another private query | 7m ",
    "",
  ].join("\n");
  expect(countInspectOutputRecords(table)).toBe(2);
  expect(countInspectOutputRecords(" Name | Query\n------|------\n")).toBe(0);
  expect(countInspectOutputRecords("unrecognized output")).toBeNull();
});

test("database health investigation classifies signals without retaining raw SQL or relation names", () => {
  const privateQuery = "select * from private_player_medical_records where athlete_id = 'secret'";
  const longRunning = buildSafeSignalEvidence("long-running-queries", {
    rows: [{ duration: "00:07:10", pid: 123, query: privateQuery }],
  });
  const locks = buildSafeSignalEvidence("locks", {
    rows: [
      {
        age: "00:07:10",
        granted: true,
        pid: 123,
        relname: "private_player_medical_records",
        stmt: privateQuery,
        transactionid: "98765",
      },
    ],
  });
  const serialized = JSON.stringify({ longRunning, locks });

  expect(longRunning).toEqual([
    expect.objectContaining({ ageBucket: "5-10 minutes", statementCategory: "data-read" }),
  ]);
  expect(locks).toEqual([
    expect.objectContaining({
      ageBucket: "5-10 minutes",
      granted: true,
      relationReference: "present",
      statementCategory: "data-read",
      transactionReference: "present",
    }),
  ]);
  expect(serialized).not.toContain(privateQuery);
  expect(serialized).not.toContain("private_player_medical_records");
  expect(serialized).not.toContain("98765");
  expect(
    correlateSafeSignals([
      { command: "long-running-queries", safeSignals: longRunning },
      { command: "locks", safeSignals: locks },
    ])
  ).toHaveLength(1);
});

test("database health investigation recognizes monitoring statements and safe age buckets", () => {
  expect(classifyStatement("select pid from pg_stat_activity")).toBe("database-monitoring");
  expect(classifyStatement("update private_table set value = 1")).toBe("data-write");
  expect(durationBucket("00:31:00")).toBe("30-60 minutes");
  expect(durationBucket("2 days 01:00:00")).toBe("over 60 minutes");
  expect(statementFingerprint("select * from private_table where id = 123")).toBe(
    statementFingerprint("select * from private_table where id = 987")
  );
});

test("database health uses the IPv4-compatible session pooler without exposing raw credentials", () => {
  const url = buildInspectionDbUrl({
    password: "secret with spaces/@",
    poolerHost: "aws-1-us-east-1.pooler.supabase.com",
    projectRef: "project-ref",
  });
  expect(url).toBe(
    "postgresql://postgres.project-ref:secret%20with%20spaces%2F%40@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
  );
  expect(() => buildInspectionDbUrl({ password: "secret", poolerHost: "host/invalid", projectRef: "ref" })).toThrow(
    "must be a hostname"
  );
});

test("database health diagnostics expose only a safe failure category", () => {
  expect(classifyInspectFailure({ status: 1, stderr: "password authentication failed for user postgres" })).toBe(
    "authentication"
  );
  expect(classifyInspectFailure({ status: 1, stderr: "dial tcp: network is unreachable" })).toBe("network");
  expect(classifyInspectFailure({ status: 0, stdout: "pretty table output" })).toBe("unexpected-output");
});

test("database health workflow is scheduled, aggregate-only, and non-mutating", () => {
  const workflow = readProjectFile(".github/workflows/supabase-database-health.yml");
  const script = readProjectFile("scripts/supabase-database-health.mjs");
  const docs = readProjectFile("docs/DEPLOYMENT.md");

  expect(workflow).toContain("name: Supabase Database Health");
  expect(workflow).toContain('cron: "30 9 * * 1-6"');
  expect(workflow).toContain('cron: "30 9 * * 0"');
  expect(workflow).toContain("environment: platform-production");
  expect(workflow).not.toContain("upload-artifact");
  expect(workflow).not.toContain("supabase db push");
  expect(workflow).not.toContain("supabase migration");
  expect(workflow).not.toContain("deploy");
  expect(workflow).toContain("SUPABASE_DB_POOLER_HOST");
  expect(workflow).toContain("--investigate-signals");
  expect(workflow).not.toContain("supabase link");
  expect(script).toContain('["inspect", "db", command, ...connectionArgs, "--output-format", "json"]');
  expect(script).toContain('["--db-url", dbUrl]');
  expect(script).not.toContain('"--output", "json"');
  expect(script).not.toContain("result.stdout,");
  expect(docs).toContain("Supabase Database Health");
  expect(docs).toContain("never changes the database automatically");
});

test("database health dry-run writes an approval-oriented aggregate report", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "footballscience-supabase-health-test-"));
  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/supabase-database-health.mjs", "--mode", "weekly", "--output-dir", outputDir, "--dry-run"],
      { cwd: rootDir, encoding: "utf8" }
    );
    expect(result.status).toBe(0);
    const summary = JSON.parse(fs.readFileSync(path.join(outputDir, "summary.json"), "utf8"));
    const markdown = fs.readFileSync(path.join(outputDir, "summary.md"), "utf8");
    expect(summary.databaseChanges).toBe(false);
    expect(summary.storedDatabaseDetails).toBe(false);
    expect(summary.results).toHaveLength(commandPlan("weekly").length);
    expect(markdown).toContain("Database changes: **none**");
    expect(markdown).toContain("Inspection plan verified. No database connection was attempted");
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});
