import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import {
  createPlatformReadinessReport,
  platformReadinessStatuses,
} from "../src/core/platform-readiness-contracts.mjs";
import {
  createPerformanceBudgetReport,
  formatBytes,
} from "./performance-budget.mjs";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json");

function capture(command, args = []) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function lines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function statusIcon(status) {
  if (status === platformReadinessStatuses.pass) return "OK";
  if (status === platformReadinessStatuses.warning) return "WARN";
  return "MISSING";
}

function printSection(title) {
  console.log(`\n${title}`);
}

const required = process.argv.includes("--required");
const gitStatusLines = lines(capture("git", ["status", "--short"]));
const readiness = createPlatformReadinessReport({
  env: process.env,
  scripts: packageJson.scripts || {},
  gitStatusLines,
});
const performance = createPerformanceBudgetReport();

console.log("Platform health report");
console.log(`- overall: ${statusIcon(readiness.overallStatus)}`);
console.log(`- readiness: ${readiness.summary.readySections}/${readiness.summary.totalSections} sections ready`);
console.log(`- modules: ${readiness.summary.totalModules} mapped (${readiness.summary.legacyModules} legacy)`);
console.log(`- local changes: ${gitStatusLines.length}`);

printSection("Readiness sections");
for (const section of readiness.sections) {
  console.log(`- ${statusIcon(section.status)} ${section.label}: ${section.details}`);
}

printSection("Top operating priorities");
for (const item of readiness.operatingPriorities.slice(0, 6)) {
  console.log(`- P${item.priority} ${item.label}: ${item.nextStep}`);
}

printSection("Database-primary migration order");
for (const item of readiness.databasePrimaryMigrationPlan.slice(0, 10)) {
  console.log(`- P${item.priority} ${item.moduleId}: ${item.current} -> ${item.target}`);
}

printSection("Performance ratchet");
for (const entry of performance.entries) {
  const budgetStatus = entry.gzipBudgetDelta <= 0 ? "OK" : "OVER";
  const targetDebt = entry.gzipTargetDelta <= 0 ? "target met" : `${formatBytes(entry.gzipTargetDelta)} over target`;
  console.log(`- ${budgetStatus} ${entry.file}: ${formatBytes(entry.gzipBytes)} gzip, ${targetDebt}`);
}

printSection("Scouting contract");
console.log(`- signals: ${readiness.scoutingPerformance.requiredSignals.length}`);
console.log(`- first page max records: ${readiness.scoutingPerformance.datasetRules.firstPageMaxRecords}`);
console.log(`- worker source required: ${readiness.scoutingPerformance.datasetRules.requiresWorkerSource ? "yes" : "no"}`);

const missingEnvironment = readiness.environment.filter((entry) => entry.status === platformReadinessStatuses.missing);
if (missingEnvironment.length) {
  printSection("Missing environment");
  for (const entry of missingEnvironment) {
    console.log(`- ${entry.label}: ${entry.missing.join(", ")}`);
  }
}

const failures = [
  ...performance.failures,
  ...(required && readiness.overallStatus === platformReadinessStatuses.missing
    ? ["Platform readiness still has missing required environment."]
    : []),
];

if (failures.length) {
  printSection("Blocking issues");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
}
