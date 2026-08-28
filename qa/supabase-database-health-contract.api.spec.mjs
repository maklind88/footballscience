import { expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assessResults,
  commandPlan,
  countRecords,
  parseJsonOutput,
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

test("database health workflow is scheduled, aggregate-only, and non-mutating", () => {
  const workflow = readProjectFile(".github/workflows/supabase-database-health.yml");
  const script = readProjectFile("scripts/supabase-database-health.mjs");
  const docs = readProjectFile("docs/DEPLOYMENT.md");

  expect(workflow).toContain("name: Supabase Database Health");
  expect(workflow).toContain('cron: "30 10 * * 1-6"');
  expect(workflow).toContain('cron: "30 10 * * 0"');
  expect(workflow).toContain("environment: platform-production");
  expect(workflow).not.toContain("upload-artifact");
  expect(workflow).not.toContain("supabase db push");
  expect(workflow).not.toContain("supabase migration");
  expect(workflow).not.toContain("deploy");
  expect(script).toContain('"--linked", "--output", "json"');
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
