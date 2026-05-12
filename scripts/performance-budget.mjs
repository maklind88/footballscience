import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const budgets = [
  {
    file: "app.js",
    maxBytes: 2_800_000,
    maxGzipBytes: 490_000,
    maxLines: 78_200,
    targetGzipBytes: 350_000,
  },
  {
    file: "styles.css",
    maxBytes: 470_000,
    maxGzipBytes: 69_000,
    maxLines: 21_450,
    targetGzipBytes: 45_000,
  },
  {
    file: "dashboard-chat.css",
    maxBytes: 46_000,
    maxGzipBytes: 8_500,
    maxLines: 220,
    targetGzipBytes: 5_000,
  },
  {
    file: "index.html",
    maxBytes: 145_000,
    maxGzipBytes: 25_500,
    maxLines: 3_020,
    targetGzipBytes: 18_000,
  },
  {
    file: "periodization-import-data.js",
    maxBytes: 60_000,
    maxGzipBytes: 5_000,
    maxLines: 10,
    targetGzipBytes: 4_000,
  },
];

function formatBytes(value) {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(2)} MB`;
  }

  return `${(value / 1024).toFixed(1)} KB`;
}

function countLines(source) {
  return source.length ? source.split("\n").length : 0;
}

const failures = [];
const report = budgets.map((budget) => {
  const filePath = path.join(rootDir, budget.file);
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

  return {
    ...stats,
    gzipTargetDelta: stats.gzipBytes - budget.targetGzipBytes,
  };
});

console.log("Performance budget report");
for (const entry of report) {
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

if (failures.length) {
  console.error("\nPerformance budget failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}
