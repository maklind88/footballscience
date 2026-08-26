import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TrackingBenchmarkError,
  evaluateTrackingBenchmarkCase,
  evaluateTrackingBenchmarkSuite,
} from "../src/modules/video-analysis/services/trackingBenchmarkService.js";

const MAX_INPUT_BYTES = 32 * 1024 * 1024;

export function parseTrackingBenchmarkArguments(argv = []) {
  const options = { input: "", output: "", json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") options.input = String(argv[++index] || "");
    else if (argument === "--output") options.output = String(argv[++index] || "");
    else if (argument === "--json") options.json = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new TrackingBenchmarkError(`Unknown argument: ${argument}.`, "TRACKING_BENCHMARK_ARGUMENT_INVALID");
  }
  if (!options.help && !options.input) {
    throw new TrackingBenchmarkError("--input is required.", "TRACKING_BENCHMARK_ARGUMENT_INVALID");
  }
  return options;
}

export function trackingBenchmarkHelp() {
  return [
    "FS Player Tracking Benchmark",
    "",
    "Usage:",
    "  npm run fs-player:tracking:benchmark -- --input <case-or-suite.json> [--output <report.json>] [--json]",
    "",
    "Exit codes: 0 passed, 1 quality threshold failed, 2 invalid input.",
  ].join("\n");
}

async function readBenchmarkDocument(inputPath) {
  let stat;
  try {
    stat = await fs.stat(inputPath);
  } catch {
    throw new TrackingBenchmarkError("Unable to read benchmark input.", "TRACKING_BENCHMARK_INPUT_UNREADABLE");
  }
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_INPUT_BYTES) {
    throw new TrackingBenchmarkError("Benchmark input is empty or outside the size limit.", "TRACKING_BENCHMARK_LIMIT");
  }
  try {
    return JSON.parse(await fs.readFile(inputPath, "utf8"));
  } catch {
    throw new TrackingBenchmarkError("Benchmark input is not valid JSON.", "TRACKING_BENCHMARK_JSON_INVALID");
  }
}

async function writeReport(outputPath, report) {
  const target = path.resolve(outputPath);
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.unlink(temporary).catch(() => {});
    throw new TrackingBenchmarkError("Unable to write benchmark report.", "TRACKING_BENCHMARK_OUTPUT_UNWRITABLE", { cause: error });
  }
}

function percent(value) {
  return value === null || value === undefined ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function factor(value) {
  return value === null || value === undefined ? "n/a" : `${value.toFixed(2)}x`;
}

export function trackingBenchmarkSummary(report = {}) {
  if (report.summary) {
    return [
      report.summary.passed ? "PASS" : "FAIL",
      report.suiteId,
      `${report.summary.passedCaseCount}/${report.summary.caseCount} cases`,
      `coverage ${percent(report.summary.weightedVisibleCoverage)}`,
      `IoU ${percent(report.summary.weightedMeanIou)}`,
    ].join(" | ");
  }
  return [
    report.verdict?.passed ? "PASS" : "FAIL",
    report.benchmarkId,
    `coverage ${percent(report.metrics?.visibleCoverage)}`,
    `IoU ${percent(report.metrics?.meanIou)}`,
    `p95 center ${percent(report.metrics?.p95CenterError)}`,
    `breaks ${report.metrics?.continuityBreaks ?? "n/a"}`,
    `realtime ${factor(report.metrics?.realtimeFactor)}`,
  ].join(" | ");
}

export async function runTrackingBenchmark(argv = process.argv.slice(2), streams = {}) {
  const stdout = streams.stdout || process.stdout;
  const stderr = streams.stderr || process.stderr;
  try {
    const options = parseTrackingBenchmarkArguments(argv);
    if (options.help) {
      stdout.write(`${trackingBenchmarkHelp()}\n`);
      return 0;
    }
    const document = await readBenchmarkDocument(path.resolve(options.input));
    const report = Array.isArray(document.cases)
      ? evaluateTrackingBenchmarkSuite(document)
      : evaluateTrackingBenchmarkCase(document);
    if (options.output) await writeReport(options.output, report);
    stdout.write(options.json ? `${JSON.stringify(report)}\n` : `${trackingBenchmarkSummary(report)}\n`);
    return (report.summary?.passed ?? report.verdict?.passed) ? 0 : 1;
  } catch (error) {
    const message = error instanceof TrackingBenchmarkError ? error.message : "Tracking benchmark failed safely.";
    stderr.write(`ERROR | ${message}\n`);
    return 2;
  }
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) process.exitCode = await runTrackingBenchmark();
