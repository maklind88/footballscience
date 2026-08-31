#!/usr/bin/env node
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTrackingCandidateProviderRegistry } from "../desktop/local-video-app/local-video-server/tracking-candidate-provider-registry.mjs";
import { trackingCandidateStageRunArtifactJson } from "../desktop/local-video-app/local-video-server/tracking-candidate-stage-run-artifact.mjs";
import {
  createTrackingCandidateScreeningManifest,
  normalizeTrackingCandidateScreeningPack,
  summarizeTrackingCandidateScreeningCase,
} from "../desktop/local-video-app/local-video-server/tracking-candidate-screening.mjs";
import { sealTrackingSourceFile } from "../desktop/local-video-app/local-video-server/tracking-file-integrity.mjs";
import { createTrackingStageRunner } from "../desktop/local-video-app/local-video-server/tracking-stage-runner.mjs";

const MAXIMUM_PACK_BYTES = 4 * 1024 * 1024;
const MAXIMUM_EVIDENCE_BYTES = 160 * 1024 * 1024;

export class TrackingCandidateScreeningCliError extends Error {
  constructor(message, code = "TRACKING_CANDIDATE_SCREENING_FAILED", options = {}) {
    super(message, options);
    this.name = "TrackingCandidateScreeningCliError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingCandidateScreeningCliError(message, code);
}

function parseProvider(value) {
  const text = String(value || "");
  const separator = text.lastIndexOf("@");
  const id = text.slice(0, separator);
  const version = text.slice(separator + 1);
  if (separator < 1 || !/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(id)
    || !/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(version)) {
    invalid("--provider requires <id>@<version>.");
  }
  return { id, version };
}

function positiveInteger(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) invalid(`Invalid ${label}.`);
  return number;
}

export function parseTrackingCandidateScreeningArguments(values = []) {
  const options = { json: false, outputDir: "", packPath: "", providerId: "", providerVersion: "", sampleDurationMs: 5000 };
  const valueOptions = new Set(["--output", "--pack", "--provider", "--sample-ms"]);
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--json") options.json = true;
    else if (valueOptions.has(argument)) {
      const value = values[index + 1];
      if (!value || value.startsWith("--")) invalid(`${argument} requires a value.`);
      if (argument === "--output") options.outputDir = value;
      else if (argument === "--pack") options.packPath = value;
      else if (argument === "--sample-ms") {
        options.sampleDurationMs = positiveInteger(value, "sample duration", 1000, 120_000);
      } else {
        const provider = parseProvider(value);
        options.providerId = provider.id;
        options.providerVersion = provider.version;
      }
      index += 1;
    } else invalid(`Unknown screening option: ${argument}`);
  }
  if (!options.outputDir || !options.packPath || !options.providerId) {
    invalid("--pack, --provider, and --output are required.");
  }
  return options;
}

function fileIdentity(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(":");
}

async function readStablePack(filePath) {
  let handle;
  try {
    const lstat = await fs.lstat(filePath);
    if (!lstat.isFile() || lstat.isSymbolicLink() || lstat.size < 1 || lstat.size > MAXIMUM_PACK_BYTES) {
      invalid("Annotation pack file is unsafe.", "TRACKING_CANDIDATE_SCREENING_PACK_UNSAFE");
    }
    handle = await fs.open(filePath, "r");
    const before = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (fileIdentity(before) !== fileIdentity(after)) {
      invalid("Annotation pack changed while reading.", "TRACKING_CANDIDATE_SCREENING_PACK_CHANGED");
    }
    return normalizeTrackingCandidateScreeningPack(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch (error) {
    if (error instanceof TrackingCandidateScreeningCliError) throw error;
    invalid("Annotation pack could not be read.", "TRACKING_CANDIDATE_SCREENING_PACK_UNREADABLE");
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function outputAvailable(outputDir) {
  try {
    await fs.lstat(outputDir);
    invalid("Screening output already exists.", "TRACKING_CANDIDATE_SCREENING_OUTPUT_EXISTS");
  } catch (error) {
    if (error instanceof TrackingCandidateScreeningCliError) throw error;
    if (error?.code !== "ENOENT") throw error;
  }
}

async function boundClipPath(packDir, relativeFile) {
  const requested = path.resolve(packDir, ...relativeFile.split("/"));
  const boundary = `${packDir}${path.sep}`;
  if (!requested.startsWith(boundary)) invalid("Pack clip escaped its private directory.");
  const lstat = await fs.lstat(requested);
  if (!lstat.isFile() || lstat.isSymbolicLink()) invalid("Pack clip is not one regular file.");
  const canonical = await fs.realpath(requested);
  if (!canonical.startsWith(boundary)) invalid("Pack clip escaped its private directory.");
  return canonical;
}

async function writeImmutable(filePath, bytes) {
  await fs.writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
  await fs.chmod(filePath, 0o400);
}

function evidenceIdentity(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.byteLength < 1 || bytes.byteLength > MAXIMUM_EVIDENCE_BYTES) {
    invalid("Candidate evidence is outside its size limit.");
  }
  return { bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function runTrackingCandidateScreening(options = {}, dependencies = {}) {
  const requestedPackPath = path.resolve(String(options.packPath || ""));
  const requestedOutputDir = path.resolve(String(options.outputDir || ""));
  await outputAvailable(requestedOutputDir);
  const requestedPackStat = await fs.lstat(requestedPackPath);
  if (!requestedPackStat.isFile() || requestedPackStat.isSymbolicLink()) {
    invalid("Annotation pack file is unsafe.", "TRACKING_CANDIDATE_SCREENING_PACK_UNSAFE");
  }
  const packPath = await fs.realpath(requestedPackPath);
  if (packPath !== requestedPackPath) {
    invalid("Annotation pack file crossed a linked path.", "TRACKING_CANDIDATE_SCREENING_PACK_UNSAFE");
  }
  const packDir = await fs.realpath(path.dirname(packPath));
  if (path.dirname(packPath) !== packDir) invalid("Annotation pack file escaped its private directory.");
  const pack = await readStablePack(packPath);
  const sampleDurationMs = positiveInteger(options.sampleDurationMs ?? 5000, "sample duration", 1000, 120_000);
  if (pack.cases.some((entry) => sampleDurationMs > entry.durationMs)) {
    invalid("Sample duration exceeds one or more pack cases.");
  }
  const registry = dependencies.registry || createTrackingCandidateProviderRegistry();
  const runner = dependencies.runner || createTrackingStageRunner({
    registry,
    executionMode: "benchmark-candidate",
  });
  const installation = await registry.resolve(options.providerId, options.providerVersion);
  const parentDir = path.dirname(requestedOutputDir);
  await fs.mkdir(parentDir, { recursive: true, mode: 0o700 });
  const stagedDir = await fs.mkdtemp(path.join(parentDir, ".tracking-candidate-screening-"));
  const casesDir = path.join(stagedDir, "cases");
  try {
    await fs.mkdir(casesDir, { mode: 0o700 });
    const caseResults = [];
    for (const packCase of pack.cases) {
      const sourcePath = await boundClipPath(packDir, packCase.clipFile);
      const seal = await (dependencies.sealSource || sealTrackingSourceFile)(sourcePath, {
        expectedSha256: packCase.clip.sha256,
        expectedBytes: packCase.clip.bytes,
      });
      const result = await runner.run({
        providerId: options.providerId,
        providerVersion: options.providerVersion,
        request: {
          sourceFingerprint: packCase.clip.sha256,
          range: { startMs: 0, endMs: sampleDurationMs },
        },
        source: { filePath: sourcePath, sha256: packCase.clip.sha256, seal },
      }, {
        evidenceId: `screening-${pack.id}-${packCase.id}`,
        onProgress: dependencies.onProgress,
      });
      if (result.benchmarkOnly !== true || !result.evidence) invalid("Candidate runner returned non-screening output.");
      const evidenceBytes = Buffer.from(trackingCandidateStageRunArtifactJson(
        result.evidence,
        installation.provider,
      ));
      const evidence = evidenceIdentity(evidenceBytes);
      const evidenceFile = path.posix.join("cases", `${packCase.id}.candidate-stage.json`);
      await writeImmutable(path.join(stagedDir, evidenceFile), evidenceBytes);
      caseResults.push({
        provider: result.evidence.provider,
        summary: summarizeTrackingCandidateScreeningCase({
          packCase,
          evidence: result.evidence,
          evidenceFile,
          evidenceBytes: evidence.bytes,
          evidenceSha256: evidence.sha256,
          sampleDurationMs,
        }),
      });
    }
    const manifest = createTrackingCandidateScreeningManifest(pack, caseResults, {
      id: options.id,
      now: dependencies.now,
    });
    await writeImmutable(
      path.join(stagedDir, "screening.json"),
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
    );
    await fs.rename(stagedDir, requestedOutputDir);
    return Object.freeze({ ok: true, outputDir: requestedOutputDir, manifest });
  } catch (error) {
    await fs.rm(stagedDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function main(values = process.argv.slice(2)) {
  let options;
  try {
    options = parseTrackingCandidateScreeningArguments(values);
    const result = await runTrackingCandidateScreening(options);
    console.log(options.json ? JSON.stringify(result) : JSON.stringify(result.manifest, null, 2));
  } catch (error) {
    console.error(options?.json
      ? JSON.stringify({ ok: false, code: error.code || "TRACKING_CANDIDATE_SCREENING_FAILED", error: error.message })
      : error.message);
    process.exitCode = 1;
  }
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (direct) await main();
