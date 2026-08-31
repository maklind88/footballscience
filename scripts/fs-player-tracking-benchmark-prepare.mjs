#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegStaticPath from "ffmpeg-static";
import {
  TRACKING_BENCHMARK_SCENARIOS,
  normalizeTrackingBenchmarkScenarios,
} from "../src/modules/video-analysis/services/trackingBenchmarkScenarioService.js";

export const TRACKING_ANNOTATION_PLAN_PROTOCOL = "football-science-tracking-annotation-plan-v1";
export const TRACKING_ANNOTATION_PACK_PROTOCOL = "football-science-tracking-annotation-pack-v1";

const MOT_IMPORT_MANIFEST_PROTOCOL = "football-science-mot-ground-truth-import-manifest-v1";
const MAXIMUM_PLAN_BYTES = 1024 * 1024;
const MAXIMUM_SOURCE_BYTES = 512 * 1024 * 1024 * 1024;
const MAXIMUM_CASE_BYTES = 8 * 1024 * 1024 * 1024;
const MINIMUM_DURATION_MS = 10 * 60 * 1000;
const MAXIMUM_DURATION_MS = 20 * 60 * 1000;
const requiredScenarios = TRACKING_BENCHMARK_SCENARIOS.filter((entry) => entry.required).map((entry) => entry.id);

export class TrackingAnnotationPackError extends Error {
  constructor(message, code = "TRACKING_ANNOTATION_PACK_FAILED", options = {}) {
    super(message, options);
    this.name = "TrackingAnnotationPackError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingAnnotationPackError(message, code);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
    invalid(`${label} contains unsupported or missing fields.`, "TRACKING_ANNOTATION_PLAN_INVALID");
  }
}

function identifier(value, label) {
  const text = String(value || "").trim();
  if (!text || text.length > 100 || !/^[a-z0-9][a-z0-9._-]*$/i.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function boundedString(value, label, maximum) {
  const text = String(value || "").trim();
  if (!text || text.length > maximum || /[\r\n]/.test(text)) invalid(`Invalid ${label}.`);
  return text;
}

function positiveInteger(value, label, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) invalid(`Invalid ${label}.`);
  return number;
}

function boundedInteger(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) invalid(`Invalid ${label}.`);
  return number;
}

function finiteRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 5 || number > 60) invalid("Invalid annotation frame rate.");
  return Math.round(number * 1000) / 1000;
}

function uniqueDuration(cases = []) {
  const sorted = cases.map((entry) => ({ startMs: entry.startMs, endMs: entry.endMs }))
    .sort((first, second) => first.startMs - second.startMs);
  let total = 0;
  let previousEnd = -1;
  for (const entry of sorted) {
    if (entry.startMs < previousEnd) {
      invalid("Annotation cases must not overlap.", "TRACKING_ANNOTATION_PLAN_OVERLAP");
    }
    total += entry.endMs - entry.startMs;
    previousEnd = entry.endMs;
  }
  return total;
}

export function normalizeTrackingAnnotationPlan(value = {}) {
  exactKeys(value, ["version", "protocol", "pack", "output", "cases"], "Annotation plan");
  if (Number(value.version) !== 1 || value.protocol !== TRACKING_ANNOTATION_PLAN_PROTOCOL) {
    invalid("Unsupported tracking annotation plan.", "TRACKING_ANNOTATION_PLAN_INVALID");
  }
  exactKeys(value.pack, ["id", "revision", "datasetName", "datasetVersion", "angleId"], "Pack descriptor");
  exactKeys(value.output, ["width", "height", "frameRate", "crf"], "Output profile");
  if (!Array.isArray(value.cases) || value.cases.length < 5 || value.cases.length > 20) {
    invalid("Annotation plan needs 5-20 cases.", "TRACKING_ANNOTATION_PLAN_CASE_COUNT");
  }
  const ids = new Set();
  const cases = value.cases.map((entry, index) => {
    exactKeys(entry, ["id", "startMs", "durationMs", "scenarioTags"], `Case ${index + 1}`);
    const id = identifier(entry.id, `case ${index + 1} id`);
    if (ids.has(id)) invalid("Annotation case ids must be unique.", "TRACKING_ANNOTATION_PLAN_DUPLICATE");
    ids.add(id);
    const startMs = boundedInteger(entry.startMs, `case ${id} start`, 0, 4 * 60 * 60 * 1000);
    const durationMs = boundedInteger(entry.durationMs, `case ${id} duration`, 30_000, 4 * 60 * 1000);
    if (!Array.isArray(entry.scenarioTags)) invalid(`Case ${id} scenario tags must be an array.`);
    const scenarioTags = normalizeTrackingBenchmarkScenarios(entry.scenarioTags);
    if (!scenarioTags.length || scenarioTags.length !== entry.scenarioTags.length) {
      invalid(`Case ${id} has unknown or duplicate scenario tags.`, "TRACKING_ANNOTATION_PLAN_SCENARIO_INVALID");
    }
    const endMs = startMs + durationMs;
    if (endMs > 4 * 60 * 60 * 1000) invalid(`Case ${id} ends outside the supported match range.`);
    return { id, startMs, endMs, durationMs, scenarioTags };
  });
  const durationMs = uniqueDuration(cases);
  if (durationMs < MINIMUM_DURATION_MS || durationMs > MAXIMUM_DURATION_MS) {
    invalid("Annotation plan must cover 10-20 unique minutes.", "TRACKING_ANNOTATION_PLAN_DURATION");
  }
  const scenarioIds = new Set(cases.flatMap((entry) => entry.scenarioTags));
  const missingScenarioIds = requiredScenarios.filter((id) => !scenarioIds.has(id));
  if (missingScenarioIds.length) {
    invalid(`Annotation plan is missing scenarios: ${missingScenarioIds.join(", ")}.`, "TRACKING_ANNOTATION_PLAN_SCENARIOS");
  }
  const width = boundedInteger(value.output.width, "output width", 320, 3840);
  const height = boundedInteger(value.output.height, "output height", 180, 2160);
  if (width % 2 || height % 2) {
    invalid("Annotation output dimensions must be even for YUV 4:2:0.", "TRACKING_ANNOTATION_PLAN_INVALID");
  }
  return {
    version: 1,
    protocol: TRACKING_ANNOTATION_PLAN_PROTOCOL,
    pack: {
      id: identifier(value.pack.id, "pack id"),
      revision: positiveInteger(value.pack.revision, "pack revision", 1_000_000),
      datasetName: boundedString(value.pack.datasetName, "dataset name", 120),
      datasetVersion: boundedString(value.pack.datasetVersion, "dataset version", 80),
      angleId: identifier(value.pack.angleId, "angle id"),
    },
    output: {
      width,
      height,
      frameRate: finiteRate(value.output.frameRate),
      crf: boundedInteger(value.output.crf, "output CRF", 0, 40),
    },
    cases,
    summary: { caseCount: cases.length, uniqueDurationMs: durationMs, scenarioIds: [...scenarioIds].sort() },
  };
}

function fileSignature(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs]
    .map((entry) => String(entry)).join(":");
}

async function openRegular(filePath, maximumBytes, label) {
  let handle;
  try {
    const lstat = await fs.lstat(filePath);
    if (!lstat.isFile() || lstat.isSymbolicLink() || lstat.size < 1 || lstat.size > maximumBytes) {
      invalid(`${label} is unsafe or outside the size limit.`, "TRACKING_ANNOTATION_FILE_UNSAFE");
    }
    handle = await fs.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile()) invalid(`${label} is not a regular file.`, "TRACKING_ANNOTATION_FILE_UNSAFE");
    return { handle, stat };
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error instanceof TrackingAnnotationPackError) throw error;
    invalid(`${label} could not be opened.`, "TRACKING_ANNOTATION_FILE_UNREADABLE");
  }
}

async function readStableJson(filePath) {
  const source = await openRegular(path.resolve(filePath), MAXIMUM_PLAN_BYTES, "Annotation plan");
  try {
    const bytes = await source.handle.readFile();
    if (fileSignature(source.stat) !== fileSignature(await source.handle.stat({ bigint: true }))) {
      invalid("Annotation plan changed while it was read.", "TRACKING_ANNOTATION_FILE_CHANGED");
    }
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      invalid("Annotation plan is not valid UTF-8 JSON.", "TRACKING_ANNOTATION_PLAN_INVALID");
    }
  } finally {
    await source.handle.close();
  }
}

async function digestStableFile(filePath, maximumBytes, label, options = {}) {
  const source = await openRegular(filePath, maximumBytes, label);
  try {
    const digest = createHash("sha256");
    const chunk = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    const bytes = Number(source.stat.size);
    while (position < bytes) {
      const { bytesRead } = await source.handle.read(chunk, 0, Math.min(chunk.length, bytes - position), position);
      if (!bytesRead) invalid(`${label} changed while it was hashed.`, "TRACKING_ANNOTATION_FILE_CHANGED");
      digest.update(chunk.subarray(0, bytesRead));
      position += bytesRead;
    }
    const hashedStat = await source.handle.stat({ bigint: true });
    if (fileSignature(source.stat) !== fileSignature(hashedStat)) {
      invalid(`${label} changed while it was hashed.`, "TRACKING_ANNOTATION_FILE_CHANGED");
    }
    let finalStat = hashedStat;
    if (options.sealReadOnly === true) {
      await source.handle.chmod(0o400);
      finalStat = await source.handle.stat({ bigint: true });
      if (source.stat.dev !== finalStat.dev
        || source.stat.ino !== finalStat.ino
        || source.stat.size !== finalStat.size
        || source.stat.mtimeNs !== finalStat.mtimeNs
        || (Number(finalStat.mode) & 0o222)) {
        invalid(`${label} changed while it was sealed.`, "TRACKING_ANNOTATION_FILE_CHANGED");
      }
    }
    return { bytes, sha256: digest.digest("hex"), signature: fileSignature(finalStat) };
  } finally {
    await source.handle.close();
  }
}

async function assertStablePath(filePath, signature, label) {
  let stat;
  try {
    stat = await fs.lstat(filePath, { bigint: true });
  } catch {
    invalid(`${label} disappeared while the pack was created.`, "TRACKING_ANNOTATION_FILE_CHANGED");
  }
  if (!stat.isFile() || stat.isSymbolicLink() || fileSignature(stat) !== signature) {
    invalid(`${label} changed while the pack was created.`, "TRACKING_ANNOTATION_FILE_CHANGED");
  }
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-128_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-128_000); });
    child.once("error", reject);
    child.once("close", (code) => (code === 0
      ? resolve({ stdout, stderr })
      : reject(new Error(stderr.trim() || `Media process exited with ${code}.`))));
  });
}

async function extractClipWithFfmpeg(options = {}) {
  const output = options.output;
  const frames = Math.round((options.case.durationMs / 1000) * output.frameRate);
  const filter = [
    `fps=${output.frameRate}`,
    `scale=${output.width}:${output.height}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${output.width}:${output.height}:(ow-iw)/2:(oh-ih)/2:black`,
  ].join(",");
  await runProcess(options.ffmpegPath, [
    "-hide_banner", "-nostdin", "-loglevel", "error",
    "-ss", (options.case.startMs / 1000).toFixed(3), "-i", options.sourcePath,
    "-map", "0:v:0", "-an", "-vf", filter,
    "-frames:v", String(frames), "-c:v", "libx264", "-preset", "medium",
    "-crf", String(output.crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-y", options.destination,
  ]);
  const progress = await runProcess(options.ffmpegPath, [
    "-hide_banner", "-nostdin", "-loglevel", "error", "-i", options.destination,
    "-map", "0:v:0", "-progress", "pipe:1", "-nostats", "-f", "null", "-",
  ]);
  const counted = [...progress.stdout.matchAll(/^frame=(\d+)$/gm)].map((match) => Number(match[1])).at(-1);
  if (counted !== frames) {
    invalid(`Extracted case ${options.case.id} has ${counted || 0} of ${frames} frames.`, "TRACKING_ANNOTATION_CLIP_INCOMPLETE");
  }
  return frames;
}

function motImportTemplate(plan, source, cases) {
  return {
    version: 1,
    protocol: MOT_IMPORT_MANIFEST_PROTOCOL,
    suite: { id: plan.pack.id, revision: plan.pack.revision },
    dataset: {
      name: plan.pack.datasetName,
      version: `${plan.pack.datasetVersion}-${source.sha256.slice(0, 12)}`,
      videoUseReviewed: false,
      annotationUseReviewed: false,
      localBenchmarkOnly: true,
    },
    review: {
      reviewedBy: "REPLACE_AFTER_EXHAUSTIVE_REVIEW",
      reviewedAt: "REPLACE_AFTER_EXHAUSTIVE_REVIEW",
      attested: false,
      exhaustiveSceneAttested: false,
    },
    sequences: cases.map((entry) => ({
      id: entry.id,
      sourceFile: entry.clipFile,
      annotationFile: entry.annotationFile,
      angleId: plan.pack.angleId,
      frame: { width: plan.output.width, height: plan.output.height },
      frameRate: plan.output.frameRate,
      sequenceLengthFrames: entry.expectedFrames,
      firstFrameNumber: 1,
      sourceStartMs: entry.startMs,
      coordinateOrigin: "zero-based",
      maximumContinuousGapFrames: Math.max(1, Math.round(plan.output.frameRate / 2)),
      scenarioTags: entry.scenarioTags,
      benchmarkTargetTrackId: "REPLACE_AFTER_EXHAUSTIVE_REVIEW",
      trackMap: {},
    })),
  };
}

async function writePrivateJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
}

export async function prepareTrackingAnnotationPack(options = {}, dependencies = {}) {
  const sourcePath = path.resolve(String(options.sourcePath || ""));
  const outputDir = path.resolve(String(options.outputDir || ""));
  if (!options.planPath || !options.sourcePath || !options.outputDir) {
    invalid("Plan, source, and output directory are required.", "TRACKING_ANNOTATION_ARGUMENT_INVALID");
  }
  const plan = normalizeTrackingAnnotationPlan(await readStableJson(options.planPath));
  const source = await digestStableFile(sourcePath, MAXIMUM_SOURCE_BYTES, "Match source");
  const ffmpegPath = path.resolve(options.ffmpegPath || ffmpegStaticPath || "");
  if (!ffmpegPath) invalid("The bundled FFmpeg runtime is unavailable.", "TRACKING_ANNOTATION_FFMPEG_UNAVAILABLE");
  const ffmpeg = await digestStableFile(ffmpegPath, MAXIMUM_SOURCE_BYTES, "FFmpeg runtime");
  try {
    await fs.lstat(outputDir);
    invalid("Annotation pack output already exists.", "TRACKING_ANNOTATION_OUTPUT_EXISTS");
  } catch (error) {
    if (error instanceof TrackingAnnotationPackError) throw error;
    if (error?.code !== "ENOENT") invalid("Annotation pack output could not be inspected.");
  }
  const parent = path.dirname(outputDir);
  await fs.mkdir(parent, { recursive: true, mode: 0o700 });
  const stagedDir = path.join(parent, `.tracking-annotation-pack-${process.pid}-${Date.now()}`);
  const clipsDir = path.join(stagedDir, "clips");
  const annotationsDir = path.join(stagedDir, "annotations");
  const extractClip = dependencies.extractClip || extractClipWithFfmpeg;
  try {
    await fs.mkdir(clipsDir, { recursive: true, mode: 0o700 });
    await fs.mkdir(annotationsDir, { recursive: true, mode: 0o700 });
    const cases = [];
    for (const entry of plan.cases) {
      await assertStablePath(sourcePath, source.signature, "Match source");
      const clipFile = path.posix.join("clips", `${entry.id}.mp4`);
      const annotationFile = path.posix.join("annotations", `${entry.id}.txt`);
      const destination = path.join(stagedDir, clipFile);
      const expectedFrames = Math.round((entry.durationMs / 1000) * plan.output.frameRate);
      const extractedFrames = await extractClip({
        sourcePath,
        destination,
        case: entry,
        output: plan.output,
        ffmpegPath,
      });
      if (extractedFrames !== expectedFrames) {
        invalid(`Case ${entry.id} did not produce its exact frame count.`, "TRACKING_ANNOTATION_CLIP_INCOMPLETE");
      }
      const clip = await digestStableFile(destination, MAXIMUM_CASE_BYTES, `Case ${entry.id}`, {
        sealReadOnly: true,
      });
      await assertStablePath(sourcePath, source.signature, "Match source");
      await fs.writeFile(path.join(stagedDir, annotationFile), "", { flag: "wx", mode: 0o600 });
      cases.push({
        id: entry.id,
        startMs: entry.startMs,
        endMs: entry.endMs,
        durationMs: entry.durationMs,
        scenarioTags: [...entry.scenarioTags],
        expectedFrames,
        clipFile,
        annotationFile,
        clip: { bytes: clip.bytes, sha256: clip.sha256 },
      });
    }
    const pack = {
      version: 1,
      protocol: TRACKING_ANNOTATION_PACK_PROTOCOL,
      id: `${plan.pack.id}-r${plan.pack.revision}`,
      createdAt: new Date(dependencies.now?.() ?? Date.now()).toISOString(),
      source: { bytes: source.bytes, sha256: source.sha256 },
      extraction: {
        ffmpegSha256: ffmpeg.sha256,
        width: plan.output.width,
        height: plan.output.height,
        frameRate: plan.output.frameRate,
        crf: plan.output.crf,
      },
      summary: { ...plan.summary, reviewStatus: "not-reviewed" },
      cases,
    };
    if (JSON.stringify(pack).includes(sourcePath)) invalid("Annotation pack leaked its local source path.");
    await writePrivateJson(path.join(stagedDir, "annotation-pack.json"), pack);
    await writePrivateJson(path.join(stagedDir, "mot-import.template.json"), motImportTemplate(plan, source, cases));
    await fs.rename(stagedDir, outputDir);
    return { ok: true, outputDir, pack };
  } catch (error) {
    await fs.rm(stagedDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export function parseTrackingAnnotationPackArguments(values = []) {
  const options = { json: false, outputDir: "", planPath: "", sourcePath: "" };
  const valueOptions = new Map([
    ["--output", "outputDir"],
    ["--plan", "planPath"],
    ["--source", "sourcePath"],
  ]);
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--json") options.json = true;
    else if (valueOptions.has(argument)) {
      const value = values[index + 1];
      if (!value || value.startsWith("--")) invalid(`${argument} requires a value.`);
      options[valueOptions.get(argument)] = value;
      index += 1;
    } else invalid(`Unknown argument: ${argument}.`);
  }
  if (!options.outputDir || !options.planPath || !options.sourcePath) {
    invalid("--plan, --source, and --output are required.");
  }
  return options;
}

async function main(values = process.argv.slice(2)) {
  let options;
  try {
    options = parseTrackingAnnotationPackArguments(values);
    const result = await prepareTrackingAnnotationPack(options);
    console.log(options.json ? JSON.stringify({ ok: true, pack: result.pack }) : JSON.stringify(result.pack, null, 2));
  } catch (error) {
    console.error(options?.json
      ? JSON.stringify({ ok: false, code: error.code || "TRACKING_ANNOTATION_PACK_FAILED", error: error.message })
      : error.message);
    process.exitCode = 1;
  }
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (direct) await main();
