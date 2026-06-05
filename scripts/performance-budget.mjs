import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const performanceBudgets = Object.freeze([
  {
    file: "app.js",
    maxBytes: 2_820_000,
    maxGzipBytes: 522_000,
    maxLines: 79_000,
    targetGzipBytes: 350_000,
    priority: "critical",
    nextStep: "Extract shared workspace renderers and legacy module state from app.js before adding broad new UI.",
  },
  {
    file: "styles.css",
    maxBytes: 485_000,
    maxGzipBytes: 72_000,
    maxLines: 22_300,
    targetGzipBytes: 45_000,
    priority: "high",
    nextStep: "Move repeated component styles into module stylesheets and keep global tokens/layout rules shared.",
  },
  {
    file: "dashboard-chat.css",
    maxBytes: 126_200,
    maxGzipBytes: 16_500,
    maxLines: 2_100,
    targetGzipBytes: 5_000,
    priority: "medium",
    nextStep: "Keep chat styling isolated and avoid adding unrelated platform styles to this file.",
  },
  {
    file: "index.html",
    maxBytes: 151_000,
    maxGzipBytes: 27_500,
    maxLines: 3_150,
    targetGzipBytes: 18_000,
    priority: "high",
    nextStep: "Keep boot/auth/loading code small and move reusable shell logic into JS modules.",
  },
  {
    file: "periodization-import-data.js",
    maxBytes: 60_000,
    maxGzipBytes: 5_000,
    maxLines: 10,
    targetGzipBytes: 4_000,
    priority: "low",
    nextStep: "Keep import payloads generated and lazy-loaded instead of inlining more static data.",
  },
]);

export function formatBytes(value) {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(2)} MB`;
  }

  return `${(value / 1024).toFixed(1)} KB`;
}

function countLines(source) {
  return source.length ? source.split("\n").length : 0;
}

export function createPerformanceBudgetReport(options = {}) {
  const baseDir = options.rootDir || rootDir;
  const budgets = options.budgets || performanceBudgets;
  const failures = [];
  const entries = budgets.map((budget) => {
    const filePath = path.join(baseDir, budget.file);
    const source = fs.readFileSync(filePath);
    const sourceText = source.toString("utf8");
    const stats = {
      file: budget.file,
      bytes: source.length,
      gzipBytes: zlib.gzipSync(source).length,
      lines: countLines(sourceText),
    };

    for (const [metric, maxValue] of [
      ["bytes", budget.maxBytes],
      ["gzipBytes", budget.maxGzipBytes],
      ["lines", budget.maxLines],
    ]) {
      if (stats[metric] > maxValue) {
        failures.push(
          `${budget.file} exceeds ${metric} budget: ${stats[metric].toLocaleString()} > ${maxValue.toLocaleString()}`
        );
      }
    }

    return Object.freeze({
      ...stats,
      priority: budget.priority,
      nextStep: budget.nextStep,
      maxBytes: budget.maxBytes,
      maxGzipBytes: budget.maxGzipBytes,
      maxLines: budget.maxLines,
      targetGzipBytes: budget.targetGzipBytes,
      gzipTargetDelta: stats.gzipBytes - budget.targetGzipBytes,
      gzipBudgetDelta: stats.gzipBytes - budget.maxGzipBytes,
    });
  });

  return Object.freeze({
    entries: Object.freeze(entries),
    failures: Object.freeze(failures),
    ok: failures.length === 0,
  });
}

export function printPerformanceBudgetReport(report = createPerformanceBudgetReport()) {
  console.log("Performance budget report");
  for (const entry of report.entries) {
    const targetStatus =
      entry.gzipTargetDelta <= 0
        ? "target met"
        : `${formatBytes(entry.gzipTargetDelta)} over long-term gzip target`;
    console.log(
      `- ${entry.file}: ${entry.lines.toLocaleString()} lines, ${formatBytes(entry.bytes)} raw, ${formatBytes(
        entry.gzipBytes
      )} gzip (${targetStatus})`
    );
  }

  if (report.failures.length) {
    console.error("\nPerformance budget failed:");
    report.failures.forEach((failure) => console.error(`- ${failure}`));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = createPerformanceBudgetReport();
  printPerformanceBudgetReport(report);
  if (!report.ok) {
    process.exitCode = 1;
  }
}
