import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TRACKING_BENCHMARK_TYPE_MULTI_OBJECT,
} from "../src/modules/video-analysis/services/trackingGroundTruthService.js";
import {
  createGroundTruthSuiteArtifact,
} from "../src/modules/video-analysis/services/trackingGroundTruthSuiteService.js";
import {
  normalizeTrackingReviewerIdentity,
} from "../src/modules/video-analysis/services/trackingReviewerIdentityService.js";
import {
  TRACKING_MOT_IMPORT_PROTOCOL,
  TrackingMotImportError,
  createGroundTruthArtifactFromMotAnnotations,
  inspectMotAnnotationProgress,
} from "../src/modules/video-analysis/services/trackingMotGroundTruthImportService.js";

export const TRACKING_MOT_IMPORT_MANIFEST_PROTOCOL =
  "football-science-mot-ground-truth-import-manifest-v1";
export const TRACKING_MOT_AUDIT_PROTOCOL = "football-science-mot-ground-truth-audit-v1";

const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_ANNOTATION_BYTES = 64 * 1024 * 1024;
const MAX_SOURCE_BYTES = 512 * 1024 * 1024 * 1024;
const MAX_SEQUENCES = 100;

function invalid(message, code) {
  throw new TrackingMotImportError(message, code);
}

function bounded(value, label, maximum = 160) {
  const text = String(value || "").trim();
  if (!text || text.length > maximum || /[\r\n]/.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length) invalid(`${label} contains unsupported field ${unsupported[0]}.`);
}

function fileIdentity(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mode, stat.mtimeMs, stat.ctimeMs].join(":");
}

export function parseMotImportArguments(argv = []) {
  const options = { manifest: "", output: "", audit: false, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--manifest") options.manifest = String(argv[++index] || "");
    else if (argument === "--output") options.output = String(argv[++index] || "");
    else if (argument === "--audit") options.audit = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else invalid(`Unknown argument: ${argument}.`);
  }
  if (!options.help && !options.manifest) invalid("--manifest is required.");
  if (!options.help && options.audit && options.output) invalid("--audit is read-only and does not accept --output.");
  if (!options.help && !options.audit && !options.output) invalid("--output is required unless --audit is used.");
  return options;
}

export function motImportHelp() {
  return [
    "FS Player SoccerNet/MOT Ground-Truth Import",
    "",
    "Usage:",
    "  npm --prefix desktop/local-video-app run tracking:mot:import -- --manifest <import.json> --output <ground-truth-suite.json>",
    "  npm --prefix desktop/local-video-app run tracking:mot:import -- --manifest <import.json> --audit --json",
    "",
    "The manifest must attest reviewed local dataset rights, map every MOT track to player/ball/referee metadata,",
    "and cover at least ten unique minutes plus every required football scenario.",
  ].join("\n");
}

async function regularFileStat(filePath, maximumBytes, label, options = {}) {
  let stat;
  try {
    stat = await fs.lstat(filePath);
  } catch {
    invalid(`${label} could not be read.`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()
    || (!options.allowEmpty && stat.size <= 0)
    || stat.size > maximumBytes) {
    invalid(`${label} is not a regular file or is outside the size limit.`);
  }
  return stat;
}

async function readStableRegularFile(filePath, maximumBytes, label, options = {}) {
  const before = await regularFileStat(filePath, maximumBytes, label, options);
  let buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    invalid(`${label} changed or could not be read.`);
  }
  const after = await regularFileStat(filePath, maximumBytes, label, options);
  if (fileIdentity(before) !== fileIdentity(after) || buffer.byteLength !== before.size) {
    invalid(`${label} changed while it was being read.`);
  }
  return buffer;
}

async function readManifest(filePath) {
  let document;
  try {
    const bytes = await readStableRegularFile(filePath, MAX_MANIFEST_BYTES, "Import manifest");
    document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof TrackingMotImportError) throw error;
    invalid("Import manifest is not valid JSON.");
  }
  if (!document || typeof document !== "object" || Array.isArray(document)
    || document.protocol !== TRACKING_MOT_IMPORT_MANIFEST_PROTOCOL
    || Number(document.version) !== 1) {
    invalid("Unsupported MOT import manifest.");
  }
  return document;
}

async function sha256RegularFile(filePath, label) {
  const before = await regularFileStat(filePath, MAX_SOURCE_BYTES, label);
  const digest = createHash("sha256");
  try {
    for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  } catch {
    invalid(`${label} changed or could not be hashed.`);
  }
  const after = await regularFileStat(filePath, MAX_SOURCE_BYTES, label);
  if (fileIdentity(before) !== fileIdentity(after)) invalid(`${label} changed while it was being hashed.`);
  return digest.digest("hex");
}

async function readAnnotationFile(filePath, options = {}) {
  const bytes = await readStableRegularFile(
    filePath,
    MAX_ANNOTATION_BYTES,
    "MOT annotations",
    options,
  );
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    invalid("MOT annotations are not valid UTF-8 text.");
  }
  return { text, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function normalizeCommonManifest(value = {}) {
  const allowed = ["protocol", "version", "suite", "dataset", "review", "sequences"];
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length) invalid(`Import manifest contains unsupported field ${unsupported[0]}.`);
  const dataset = value.dataset && typeof value.dataset === "object" && !Array.isArray(value.dataset)
    ? value.dataset
    : invalid("Dataset evidence is required.");
  const review = value.review && typeof value.review === "object" && !Array.isArray(value.review)
    ? value.review
    : invalid("Review evidence is required.");
  exactKeys(value.suite || {}, ["id", "revision"], "Suite descriptor");
  exactKeys(dataset, [
    "name", "version", "videoUseReviewed", "annotationUseReviewed", "localBenchmarkOnly",
  ], "Dataset evidence");
  exactKeys(review, [
    "reviewedBy", "reviewedAt", "attested", "exhaustiveSceneAttested",
  ], "Review evidence");
  if (dataset.videoUseReviewed !== true
    || dataset.annotationUseReviewed !== true
    || dataset.localBenchmarkOnly !== true
    || review.attested !== true
    || review.exhaustiveSceneAttested !== true
    || !Number.isFinite(Date.parse(review.reviewedAt))) {
    invalid("Dataset rights and exhaustive local review must be explicitly attested.");
  }
  if (!Array.isArray(value.sequences) || !value.sequences.length || value.sequences.length > MAX_SEQUENCES) {
    invalid("Import manifest must contain 1-100 sequences.");
  }
  return {
    suiteId: bounded(value.suite?.id || "soccernet-real-match", "suite id", 120),
    revision: Math.max(1, Math.round(Number(value.suite?.revision) || 1)),
    datasetName: bounded(dataset.name, "dataset name", 120),
    datasetVersion: bounded(dataset.version, "dataset version", 80),
    rights: {
      videoUseReviewed: true,
      annotationUseReviewed: true,
      localBenchmarkOnly: true,
    },
    reviewedBy: normalizeTrackingReviewerIdentity(review.reviewedBy)
      || invalid("A named human reviewer or analyst ID is required."),
    reviewedAt: new Date(review.reviewedAt).toISOString(),
    sequences: value.sequences,
  };
}

function auditCommonEvidence(value = {}) {
  const allowed = ["protocol", "version", "suite", "dataset", "review", "sequences"];
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length) invalid(`Import manifest contains unsupported field ${unsupported[0]}.`);
  const dataset = value.dataset && typeof value.dataset === "object" && !Array.isArray(value.dataset)
    ? value.dataset
    : invalid("Dataset evidence is required.");
  const review = value.review && typeof value.review === "object" && !Array.isArray(value.review)
    ? value.review
    : invalid("Review evidence is required.");
  exactKeys(value.suite || {}, ["id", "revision"], "Suite descriptor");
  exactKeys(dataset, [
    "name", "version", "videoUseReviewed", "annotationUseReviewed", "localBenchmarkOnly",
  ], "Dataset evidence");
  exactKeys(review, [
    "reviewedBy", "reviewedAt", "attested", "exhaustiveSceneAttested",
  ], "Review evidence");
  if (!Array.isArray(value.sequences) || !value.sequences.length || value.sequences.length > MAX_SEQUENCES) {
    invalid("Import manifest must contain 1-100 sequences.");
  }
  const rightsReady = dataset.videoUseReviewed === true
    && dataset.annotationUseReviewed === true
    && dataset.localBenchmarkOnly === true;
  const reviewReady = Boolean(normalizeTrackingReviewerIdentity(review.reviewedBy))
    && Number.isFinite(Date.parse(review.reviewedAt))
    && review.attested === true
    && review.exhaustiveSceneAttested === true;
  return {
    suiteId: bounded(value.suite?.id || "soccernet-real-match", "suite id", 120),
    rightsReady,
    reviewReady,
    sequences: value.sequences,
    issues: [
      ...(!rightsReady ? [{
        code: "rights-attestation-incomplete",
        message: "Video, annotation and local-use rights are not fully attested.",
      }] : []),
      ...(!reviewReady ? [{
        code: "human-review-incomplete",
        message: "A named human reviewer and exhaustive review attestation are required.",
      }] : []),
    ],
  };
}

function sequencePaths(sequence = {}, manifestDir = "") {
  const sourceFile = bounded(sequence.sourceFile, "sequence source file", 2048);
  const annotationFile = bounded(sequence.annotationFile, "sequence annotation file", 2048);
  return {
    sourceFile: path.resolve(manifestDir, sourceFile),
    annotationFile: path.resolve(manifestDir, annotationFile),
  };
}

const sequenceFields = [
  "id", "sourceFile", "annotationFile", "angleId", "frame", "frameRate",
  "sequenceLengthFrames", "firstFrameNumber", "sourceStartMs", "coordinateOrigin",
  "maximumContinuousGapFrames", "scenarioTags", "benchmarkTargetTrackId", "trackMap",
];

function assertSequenceFields(sequence = {}) {
  const unsupported = Object.keys(sequence).filter((key) => !sequenceFields.includes(key));
  if (unsupported.length) invalid(`Sequence contains unsupported field ${unsupported[0]}.`);
}

async function importSequence(sequence = {}, common = {}, manifestDir = "") {
  assertSequenceFields(sequence);
  const paths = sequencePaths(sequence, manifestDir);
  const [sourceFingerprint, annotation] = await Promise.all([
    sha256RegularFile(paths.sourceFile, "Sequence source"),
    readAnnotationFile(paths.annotationFile),
  ]);
  return createGroundTruthArtifactFromMotAnnotations(annotation.text, {
    protocol: TRACKING_MOT_IMPORT_PROTOCOL,
    version: 1,
    sequenceId: bounded(sequence.id, "sequence id", 120),
    sourceFingerprint,
    angleId: sequence.angleId || "main",
    frame: sequence.frame,
    frameRate: sequence.frameRate,
    sequenceLengthFrames: sequence.sequenceLengthFrames,
    firstFrameNumber: sequence.firstFrameNumber,
    sourceStartMs: sequence.sourceStartMs,
    coordinateOrigin: sequence.coordinateOrigin,
    maximumContinuousGapFrames: sequence.maximumContinuousGapFrames,
    scenarioTags: sequence.scenarioTags,
    benchmarkTargetTrackId: sequence.benchmarkTargetTrackId,
    trackMap: sequence.trackMap,
    reviewedBy: common.reviewedBy,
    reviewedAt: common.reviewedAt,
    attested: true,
    exhaustiveSceneAttested: true,
    referenceEvidence: {
      datasetName: common.datasetName,
      datasetVersion: common.datasetVersion,
      annotationSha256: annotation.sha256,
      ...common.rights,
    },
  });
}

async function auditSequence(sequence = {}, manifestDir = "") {
  const id = bounded(sequence.id, "sequence id", 120);
  try {
    assertSequenceFields(sequence);
    const paths = sequencePaths(sequence, manifestDir);
    const [sourceFingerprint, annotation] = await Promise.all([
      sha256RegularFile(paths.sourceFile, "Sequence source"),
      readAnnotationFile(paths.annotationFile, { allowEmpty: true }),
    ]);
    return {
      id,
      sourceFingerprint,
      annotationSha256: annotation.sha256,
      ...inspectMotAnnotationProgress(annotation.text, sequence),
    };
  } catch (error) {
    return {
      id,
      rowCount: 0,
      trackCount: 0,
      annotatedFrameCount: 0,
      sequenceLengthFrames: Math.max(0, Math.round(Number(sequence.sequenceLengthFrames) || 0)),
      annotatedFrameRatio: 0,
      sceneCoverageRatio: 0,
      entityCounts: { player: 0, ball: 0, referee: 0 },
      structurallyReady: false,
      issues: [{
        code: "sequence-invalid",
        message: error instanceof Error ? error.message : "Sequence evidence is invalid.",
      }],
    };
  }
}

export async function auditMotGroundTruthManifest(document = {}, manifestDir = "") {
  const common = auditCommonEvidence(document);
  const sequences = [];
  for (const sequence of common.sequences) sequences.push(await auditSequence(sequence, manifestDir));
  const structurallyReady = sequences.every((sequence) => sequence.structurallyReady === true);
  return {
    schemaVersion: 1,
    protocol: TRACKING_MOT_AUDIT_PROTOCOL,
    suiteId: common.suiteId,
    rightsReady: common.rightsReady,
    reviewReady: common.reviewReady,
    sequenceCount: sequences.length,
    structurallyReadySequenceCount: sequences.filter((sequence) => sequence.structurallyReady).length,
    annotationRowCount: sequences.reduce((total, sequence) => total + sequence.rowCount, 0),
    readyForImport: common.rightsReady && common.reviewReady && structurallyReady,
    issues: common.issues,
    sequences,
  };
}

async function writeArtifact(filePath, artifact) {
  const target = path.resolve(filePath);
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await fs.lstat(target);
    invalid("Output already exists; ground-truth evidence is never overwritten.");
  } catch (error) {
    if (error instanceof TrackingMotImportError) throw error;
    if (error?.code !== "ENOENT") invalid("Unable to inspect the output target.");
  }
  try {
    await fs.writeFile(temporary, `${JSON.stringify(artifact, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    if (error instanceof TrackingMotImportError) throw error;
    invalid("Ground-truth suite could not be written.");
  }
}

function summary(artifact = {}) {
  return [
    "IMPORTED",
    artifact.id,
    `${artifact.summary?.caseCount || 0} cases`,
    `${((artifact.summary?.uniqueDurationMs || 0) / 60_000).toFixed(1)} min`,
    `${artifact.summary?.sourceCount || 0} exact sources`,
  ].join(" | ");
}

function auditSummary(report = {}) {
  return [
    report.readyForImport ? "READY" : "INCOMPLETE",
    report.suiteId,
    `${report.structurallyReadySequenceCount}/${report.sequenceCount} sequences`,
    `${report.annotationRowCount} annotation rows`,
    report.rightsReady ? "rights attested" : "rights missing",
    report.reviewReady ? "review attested" : "review missing",
  ].join(" | ");
}

export async function runMotGroundTruthImport(argv = process.argv.slice(2), streams = {}) {
  const stdout = streams.stdout || process.stdout;
  const stderr = streams.stderr || process.stderr;
  try {
    const options = parseMotImportArguments(argv);
    if (options.help) {
      stdout.write(`${motImportHelp()}\n`);
      return 0;
    }
    const manifestPath = path.resolve(options.manifest);
    const document = await readManifest(manifestPath);
    if (options.audit) {
      const report = await auditMotGroundTruthManifest(document, path.dirname(manifestPath));
      stdout.write(options.json ? `${JSON.stringify(report)}\n` : `${auditSummary(report)}\n`);
      return report.readyForImport ? 0 : 3;
    }
    const common = normalizeCommonManifest(document);
    const artifacts = [];
    for (const sequence of common.sequences) {
      artifacts.push(await importSequence(sequence, common, path.dirname(manifestPath)));
    }
    const suite = createGroundTruthSuiteArtifact({
      id: common.suiteId,
      revision: common.revision,
      benchmarkType: TRACKING_BENCHMARK_TYPE_MULTI_OBJECT,
      cases: artifacts,
    }, { now: () => Date.parse(common.reviewedAt) });
    await writeArtifact(options.output, suite);
    stdout.write(options.json ? `${JSON.stringify(suite)}\n` : `${summary(suite)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`ERROR | ${error instanceof Error ? error.message : "MOT import failed safely."}\n`);
    return 2;
  }
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) process.exitCode = await runMotGroundTruthImport();
