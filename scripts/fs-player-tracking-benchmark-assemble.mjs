import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleTrackingBenchmarkSuite } from "../src/modules/video-analysis/services/trackingBenchmarkAssemblyService.js";
import { validateGroundTruthSuiteArtifact } from "../src/modules/video-analysis/services/trackingGroundTruthSuiteService.js";
import { validateTrackingProviderRunSuiteArtifact } from "../src/modules/video-analysis/services/trackingProviderRunService.js";

const MAX_INPUT_BYTES = 64 * 1024 * 1024;

export function parseTrackingBenchmarkAssemblyArguments(argv = []) {
  const options = { groundTruth: "", runs: "", output: "", json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--ground-truth") options.groundTruth = String(argv[++index] || "");
    else if (argument === "--runs") options.runs = String(argv[++index] || "");
    else if (argument === "--output") options.output = String(argv[++index] || "");
    else if (argument === "--json") options.json = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${argument}.`);
  }
  if (!options.help && (!options.groundTruth || !options.runs || !options.output)) {
    throw new Error("--ground-truth, --runs and --output are required.");
  }
  return options;
}

export function trackingBenchmarkAssemblyHelp() {
  return [
    "FS Player Tracking Benchmark Assembler",
    "",
    "Usage:",
    "  npm run fs-player:tracking:assemble -- --ground-truth <suite.json> --runs <provider-runs.json> --output <benchmark.json> [--json]",
    "",
    "The command validates and hashes both immutable inputs before assembly.",
  ].join("\n");
}

async function readBoundedJson(filePath, validator) {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    throw new Error("Unable to read an assembly input.");
  }
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_INPUT_BYTES) {
    throw new Error("Assembly input is empty or outside the size limit.");
  }
  let document;
  try {
    document = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    throw new Error("Assembly input is not valid JSON.");
  }
  return validator(document);
}

function artifactSha256(value = {}) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function writeArtifact(outputPath, value) {
  const target = path.resolve(outputPath);
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.unlink(temporary).catch(() => {});
    throw new Error("Unable to write the assembled benchmark.", { cause: error });
  }
}

function summary(suite = {}) {
  const evidence = suite.providerRunEvidence || {};
  return [
    "ASSEMBLED",
    suite.id,
    suite.cases?.[0]?.profileId || "unknown-profile",
    `${suite.cases?.length || 0} cases`,
    `${evidence.runIds?.length || 0} runs`,
    `${evidence.provider?.providerId || "unknown"}@${evidence.provider?.providerVersion || "unknown"}`,
  ].join(" | ");
}

export async function runTrackingBenchmarkAssembly(argv = process.argv.slice(2), streams = {}) {
  const stdout = streams.stdout || process.stdout;
  const stderr = streams.stderr || process.stderr;
  try {
    const options = parseTrackingBenchmarkAssemblyArguments(argv);
    if (options.help) {
      stdout.write(`${trackingBenchmarkAssemblyHelp()}\n`);
      return 0;
    }
    const groundTruth = await readBoundedJson(
      path.resolve(options.groundTruth),
      validateGroundTruthSuiteArtifact,
    );
    const runs = await readBoundedJson(
      path.resolve(options.runs),
      validateTrackingProviderRunSuiteArtifact,
    );
    const assembled = assembleTrackingBenchmarkSuite(groundTruth, runs, {
      groundTruthSuiteSha256: artifactSha256(groundTruth),
      providerRunSuiteSha256: artifactSha256(runs),
    });
    await writeArtifact(options.output, assembled);
    stdout.write(options.json ? `${JSON.stringify(assembled)}\n` : `${summary(assembled)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`ERROR | ${error?.message || "Tracking benchmark assembly failed safely."}\n`);
    return 2;
  }
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) process.exitCode = await runTrackingBenchmarkAssembly();
