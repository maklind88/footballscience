#!/usr/bin/env node
import { createHash } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyTrackingCandidateAssociationBundle } from "../desktop/local-video-app/local-video-server/tracking-candidate-association-screening-verifier.mjs";
import { createTrackingCandidateProviderRegistry } from "../desktop/local-video-app/local-video-server/tracking-candidate-provider-registry.mjs";
import {
  createTrackingCandidateReidentificationManifest,
  summarizeTrackingCandidateReidentificationCase,
  _private as screeningPrivate,
} from "../desktop/local-video-app/local-video-server/tracking-candidate-reidentification-screening.mjs";
import { normalizeTrackingCandidateScreeningPack } from "../desktop/local-video-app/local-video-server/tracking-candidate-screening.mjs";
import {
  trackingCandidateStageRunArtifactJson,
  validateTrackingCandidateStageRunArtifact,
} from "../desktop/local-video-app/local-video-server/tracking-candidate-stage-run-artifact.mjs";
import { createTrackingStageRunner } from "../desktop/local-video-app/local-video-server/tracking-stage-runner.mjs";

const MAXIMUM_JSON_BYTES = 4 * 1024 * 1024;
const MAXIMUM_EVIDENCE_BYTES = 160 * 1024 * 1024;

export class TrackingReidentificationScreeningCliError extends Error {
  constructor(message, code = "TRACKING_REIDENTIFICATION_SCREENING_FAILED") {
    super(message);
    this.name = "TrackingReidentificationScreeningCliError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingReidentificationScreeningCliError(message, code);
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

export function parseTrackingReidentificationScreeningArguments(values = []) {
  const options = {
    json: false,
    outputDir: "",
    packPath: "",
    detectionScreeningDir: "",
    associationScreeningDir: "",
    providerId: "",
    providerVersion: "",
  };
  const valueOptions = new Set([
    "--output", "--pack", "--detection-screening", "--association-screening", "--provider",
  ]);
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--json") options.json = true;
    else if (valueOptions.has(argument)) {
      const value = values[index + 1];
      if (!value || value.startsWith("--")) invalid(`${argument} requires a value.`);
      if (argument === "--output") options.outputDir = value;
      else if (argument === "--pack") options.packPath = value;
      else if (argument === "--detection-screening") options.detectionScreeningDir = value;
      else if (argument === "--association-screening") options.associationScreeningDir = value;
      else {
        const provider = parseProvider(value);
        options.providerId = provider.id;
        options.providerVersion = provider.version;
      }
      index += 1;
    } else invalid(`Unknown re-identification screening option: ${argument}`);
  }
  if (!options.outputDir || !options.packPath || !options.detectionScreeningDir
    || !options.associationScreeningDir || !options.providerId) {
    invalid("--pack, --detection-screening, --association-screening, --provider, and --output are required.");
  }
  return options;
}

function fileIdentity(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(":");
}

async function canonicalDirectory(requestedPath, label) {
  const resolved = path.resolve(String(requestedPath || ""));
  const lstat = await fs.lstat(resolved).catch(() => invalid(`${label} is unavailable.`));
  if (!lstat.isDirectory() || lstat.isSymbolicLink()) invalid(`${label} is unsafe.`);
  const canonical = await fs.realpath(resolved);
  if (canonical !== resolved) invalid(`${label} crossed a linked path.`);
  return canonical;
}

async function readStableFile(requestedPath, maximumBytes, label, options = {}) {
  const resolved = path.resolve(String(requestedPath || ""));
  const canonical = await fs.realpath(resolved).catch(() => invalid(`${label} is unavailable.`));
  if (canonical !== resolved) invalid(`${label} crossed a linked path.`);
  const lstat = await fs.lstat(canonical);
  if (!lstat.isFile() || lstat.isSymbolicLink() || lstat.size < 1 || lstat.size > maximumBytes) {
    invalid(`${label} is unsafe.`);
  }
  if (options.readOnly && (lstat.mode & 0o222)) invalid(`${label} is not sealed read-only.`);
  const handle = await fs.open(canonical, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
  try {
    const before = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (fileIdentity(before) !== fileIdentity(after) || bytes.byteLength !== Number(after.size)) {
      invalid(`${label} changed while reading.`);
    }
    return { bytes, path: canonical, sha256: createHash("sha256").update(bytes).digest("hex") };
  } finally {
    await handle.close();
  }
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    invalid(`${label} is not valid UTF-8 JSON.`);
  }
}

async function readJson(requestedPath, maximumBytes, label, options = {}) {
  const file = await readStableFile(requestedPath, maximumBytes, label, options);
  return { ...file, value: parseJson(file.bytes, label) };
}

async function outputAvailable(outputDir) {
  try {
    await fs.lstat(outputDir);
    invalid("Re-identification screening output already exists.", "TRACKING_REIDENTIFICATION_SCREENING_OUTPUT_EXISTS");
  } catch (error) {
    if (error instanceof TrackingReidentificationScreeningCliError) throw error;
    if (error?.code !== "ENOENT") throw error;
  }
}

function evidenceRelativeFile(value, caseId) {
  const text = String(value || "");
  const expected = `cases/${caseId}.candidate-stage.json`;
  if (text !== expected || path.posix.normalize(text) !== text) invalid("Association evidence path is invalid.");
  return text;
}

async function readAssociationEvidence(screeningDir, summary) {
  const descriptor = summary?.evidence || {};
  const relativeFile = evidenceRelativeFile(descriptor.file, summary.id);
  const requested = path.join(screeningDir, ...relativeFile.split("/"));
  if (!requested.startsWith(`${screeningDir}${path.sep}`)) invalid("Association evidence escaped its bundle.");
  const file = await readJson(requested, MAXIMUM_EVIDENCE_BYTES, "Association evidence", { readOnly: true });
  if (file.bytes.byteLength !== Number(descriptor.bytes) || file.sha256 !== descriptor.sha256) {
    invalid("Association evidence does not match its verified manifest.");
  }
  return { descriptor, evidence: file.value };
}

async function writeImmutable(filePath, bytes) {
  await fs.writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
  await fs.chmod(filePath, 0o400);
}

function evidenceIdentity(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.byteLength < 1 || bytes.byteLength > MAXIMUM_EVIDENCE_BYTES) {
    invalid("Re-identification evidence is outside its size limit.");
  }
  return { bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function runTrackingReidentificationScreening(options = {}, dependencies = {}) {
  const requestedPackPath = path.resolve(String(options.packPath || ""));
  const outputDir = path.resolve(String(options.outputDir || ""));
  await outputAvailable(outputDir);
  const detectionScreeningDir = await canonicalDirectory(options.detectionScreeningDir, "Detection screening directory");
  const associationScreeningDir = await canonicalDirectory(options.associationScreeningDir, "Association screening directory");
  const verifyAssociation = dependencies.verifyAssociation || verifyTrackingCandidateAssociationBundle;
  await verifyAssociation({
    packPath: requestedPackPath,
    detectionScreeningDir,
    screeningDir: associationScreeningDir,
  });
  const packFile = await readJson(requestedPackPath, MAXIMUM_JSON_BYTES, "Annotation pack");
  const pack = normalizeTrackingCandidateScreeningPack(packFile.value);
  const associationManifestFile = await readJson(
    path.join(associationScreeningDir, "screening.json"),
    MAXIMUM_JSON_BYTES,
    "Association screening manifest",
    { readOnly: true },
  );
  const associationManifest = associationManifestFile.value;
  const registry = dependencies.registry || createTrackingCandidateProviderRegistry();
  const runner = dependencies.runner || createTrackingStageRunner({ registry, executionMode: "benchmark-candidate" });
  const reidentificationInstallation = await registry.resolve(options.providerId, options.providerVersion);
  if (reidentificationInstallation.provider.stage !== "reidentification") {
    invalid("Requested provider does not own re-identification.");
  }
  const associationInstallation = await registry.resolve(
    associationManifest.provider?.id,
    associationManifest.provider?.version,
  );
  const parentDir = path.dirname(outputDir);
  await fs.mkdir(parentDir, { recursive: true, mode: 0o700 });
  const stagedDir = await fs.mkdtemp(path.join(parentDir, ".tracking-reidentification-screening-"));
  const casesDir = path.join(stagedDir, "cases");
  try {
    await fs.mkdir(casesDir, { mode: 0o700 });
    const caseResults = [];
    for (const packCase of pack.cases) {
      const associationCase = associationManifest.cases?.find((entry) => entry.id === packCase.id);
      if (!associationCase) invalid("Association screening case is missing.");
      const input = await readAssociationEvidence(associationScreeningDir, associationCase);
      const associationEvidence = validateTrackingCandidateStageRunArtifact(
        input.evidence,
        associationInstallation.provider,
      );
      const trajectories = screeningPrivate.materializeTrajectories(associationEvidence);
      const result = await runner.run({
        providerId: options.providerId,
        providerVersion: options.providerVersion,
        request: {
          sourceFingerprint: associationEvidence.source.fingerprintSha256,
          range: { ...associationEvidence.range },
          trajectories,
        },
      }, {
        evidenceId: `reidentification-screening-${pack.id}-${packCase.id}`,
        onProgress: dependencies.onProgress,
      });
      if (result.benchmarkOnly !== true || !result.evidence) {
        invalid("Re-identification runner returned non-screening output.");
      }
      const evidenceBytes = Buffer.from(trackingCandidateStageRunArtifactJson(
        result.evidence,
        reidentificationInstallation.provider,
      ));
      const evidence = evidenceIdentity(evidenceBytes);
      const evidenceFile = path.posix.join("cases", `${packCase.id}.candidate-stage.json`);
      await writeImmutable(path.join(stagedDir, evidenceFile), evidenceBytes);
      caseResults.push({
        provider: result.evidence.provider,
        summary: summarizeTrackingCandidateReidentificationCase({
          packCase,
          associationEvidence,
          associationDescriptor: input.descriptor,
          reidentificationEvidence: result.evidence,
          evidenceFile,
          evidenceBytes: evidence.bytes,
          evidenceSha256: evidence.sha256,
        }),
      });
    }
    const manifest = createTrackingCandidateReidentificationManifest(pack, associationManifest, caseResults, {
      id: options.id,
      now: dependencies.now,
    });
    await writeImmutable(path.join(stagedDir, "screening.json"), Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
    await fs.rename(stagedDir, outputDir);
    return Object.freeze({ ok: true, outputDir, manifest });
  } catch (error) {
    await fs.rm(stagedDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function main(values = process.argv.slice(2)) {
  let options;
  try {
    options = parseTrackingReidentificationScreeningArguments(values);
    const result = await runTrackingReidentificationScreening(options);
    console.log(options.json ? JSON.stringify(result) : JSON.stringify(result.manifest, null, 2));
  } catch (error) {
    console.error(options?.json
      ? JSON.stringify({ ok: false, code: error.code || "TRACKING_REIDENTIFICATION_SCREENING_FAILED", error: error.message })
      : error.message);
    process.exitCode = 1;
  }
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (direct) await main();
