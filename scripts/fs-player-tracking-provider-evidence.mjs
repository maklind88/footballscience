import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTrackingProviderManifest } from "../desktop/local-video-app/local-video-server/tracking-provider-contract.mjs";
import {
  TrackingProviderEvidenceError,
  createTrackingProviderEvidence,
  verifyTrackingProviderEvidence,
} from "../desktop/local-video-app/local-video-server/tracking-provider-evidence.mjs";

const maximumInputBytes = 16 * 1024 * 1024;

export function parseProviderEvidenceArguments(argv = []) {
  const options = { manifest: "", report: "", evidence: "", output: "", json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--manifest") options.manifest = String(argv[++index] || "");
    else if (argument === "--report") options.report = String(argv[++index] || "");
    else if (argument === "--evidence") options.evidence = String(argv[++index] || "");
    else if (argument === "--output") options.output = String(argv[++index] || "");
    else if (argument === "--json") options.json = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new TrackingProviderEvidenceError(`Unknown argument: ${argument}.`);
  }
  if (!options.help && (!options.manifest || !options.report)) {
    throw new TrackingProviderEvidenceError("--manifest and --report are required.");
  }
  return options;
}

export function providerEvidenceHelp() {
  return [
    "FS Player Tracking Provider Evidence",
    "",
    "Create:",
    "  npm run fs-player:tracking:provider:evidence -- --manifest <manifest.json> --report <report.json> --output <evidence.json>",
    "",
    "Verify an approved manifest:",
    "  npm run fs-player:tracking:provider:evidence -- --manifest <manifest.json> --report <report.json> --evidence <evidence.json>",
    "",
    "The command never reads source video or writes provider approval status.",
  ].join("\n");
}

async function readBoundedJson(filePath, label) {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    throw new TrackingProviderEvidenceError(`${label} could not be read.`);
  }
  if (!stat.isFile() || stat.size <= 0 || stat.size > maximumInputBytes) {
    throw new TrackingProviderEvidenceError(`${label} is empty or outside the size limit.`);
  }
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    throw new TrackingProviderEvidenceError(`${label} is not valid JSON.`);
  }
}

async function writeEvidence(filePath, evidence) {
  const target = path.resolve(filePath);
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw new TrackingProviderEvidenceError("Provider evidence could not be written.", undefined, { cause: error });
  }
}

function summary(provider, evidence, verified = false) {
  return [
    verified ? "VERIFIED" : "CREATED",
    `${provider.providerId}@${provider.providerVersion}`,
    `${evidence.benchmark.realMatchCaseCount} real-match cases`,
    `${(evidence.benchmark.realMatchDurationMs / 60_000).toFixed(1)} min`,
    evidence.evidenceSha256,
  ].join(" | ");
}

export async function runProviderEvidence(argv = process.argv.slice(2), streams = {}) {
  const stdout = streams.stdout || process.stdout;
  const stderr = streams.stderr || process.stderr;
  try {
    const options = parseProviderEvidenceArguments(argv);
    if (options.help) {
      stdout.write(`${providerEvidenceHelp()}\n`);
      return 0;
    }
    const provider = normalizeTrackingProviderManifest(
      await readBoundedJson(path.resolve(options.manifest), "Provider manifest"),
    );
    const report = await readBoundedJson(path.resolve(options.report), "Benchmark report");
    if (options.evidence) {
      const evidence = await readBoundedJson(path.resolve(options.evidence), "Provider evidence");
      verifyTrackingProviderEvidence(provider, evidence, report);
      stdout.write(options.json ? `${JSON.stringify(evidence)}\n` : `${summary(provider, evidence, true)}\n`);
      return 0;
    }
    const evidence = createTrackingProviderEvidence(provider, report);
    if (options.output) await writeEvidence(options.output, evidence);
    stdout.write(options.json ? `${JSON.stringify(evidence)}\n` : `${summary(provider, evidence)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`ERROR | ${error instanceof Error ? error.message : "Provider evidence failed safely."}\n`);
    return 2;
  }
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) process.exitCode = await runProviderEvidence();
