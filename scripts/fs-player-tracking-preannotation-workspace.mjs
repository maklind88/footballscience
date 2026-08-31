#!/usr/bin/env node
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadVerifiedTrackingCandidateAssociationBundle } from "../desktop/local-video-app/local-video-server/tracking-candidate-association-screening-verifier.mjs";
import { loadVerifiedTrackingCandidateScreeningBundle } from "../desktop/local-video-app/local-video-server/tracking-candidate-screening-verifier.mjs";
import {
  createTrackingCandidatePreannotationCase,
  createTrackingCandidatePreannotationWorkspace,
} from "../desktop/local-video-app/local-video-server/tracking-candidate-preannotation-workspace.mjs";

export class TrackingCandidatePreannotationCliError extends Error {
  constructor(message, code = "TRACKING_CANDIDATE_PREANNOTATION_FAILED") {
    super(message);
    this.name = "TrackingCandidatePreannotationCliError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new TrackingCandidatePreannotationCliError(message, code);
}

export function parseTrackingCandidatePreannotationArguments(values = []) {
  const options = {
    json: false,
    packPath: "",
    detectionScreeningDir: "",
    associationScreeningDir: "",
    outputDir: "",
  };
  const valueOptions = new Set([
    "--pack", "--detection-screening", "--association-screening", "--output",
  ]);
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--json") options.json = true;
    else if (valueOptions.has(argument)) {
      const value = values[index + 1];
      if (!value || value.startsWith("--")) invalid(`${argument} requires a value.`);
      if (argument === "--pack") options.packPath = value;
      else if (argument === "--detection-screening") options.detectionScreeningDir = value;
      else if (argument === "--association-screening") options.associationScreeningDir = value;
      else options.outputDir = value;
      index += 1;
    } else invalid(`Unknown preannotation option: ${argument}`);
  }
  if (!options.packPath || !options.detectionScreeningDir || !options.outputDir) {
    invalid("--pack, --detection-screening, and --output are required.");
  }
  return options;
}

async function outputAvailable(outputDir) {
  try {
    await fs.lstat(outputDir);
    invalid(
      "Preannotation output already exists; suggestion evidence is never overwritten.",
      "TRACKING_CANDIDATE_PREANNOTATION_OUTPUT_EXISTS",
    );
  } catch (error) {
    if (error instanceof TrackingCandidatePreannotationCliError) throw error;
    if (error?.code !== "ENOENT") throw error;
  }
}

function descriptor(relativeFile, bytes) {
  return {
    file: relativeFile,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function writeImmutable(filePath, bytes) {
  await fs.writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
  await fs.chmod(filePath, 0o400);
}

export async function runTrackingCandidatePreannotation(options = {}, dependencies = {}) {
  const outputDir = path.resolve(String(options.outputDir || ""));
  await outputAvailable(outputDir);
  const packPath = path.resolve(String(options.packPath || ""));
  const detectionScreeningDir = path.resolve(String(options.detectionScreeningDir || ""));
  const associationScreeningDir = String(options.associationScreeningDir || "").trim();
  const loaded = await (dependencies.loadBundle || (associationScreeningDir
    ? loadVerifiedTrackingCandidateAssociationBundle
    : loadVerifiedTrackingCandidateScreeningBundle))(
    associationScreeningDir
      ? { packPath, detectionScreeningDir, screeningDir: path.resolve(associationScreeningDir) }
      : { packPath, screeningDir: detectionScreeningDir },
    dependencies.verifierDependencies,
  );
  const parentDir = path.dirname(outputDir);
  await fs.mkdir(parentDir, { recursive: true, mode: 0o700 });
  const stagedDir = await fs.mkdtemp(path.join(parentDir, ".tracking-preannotation-"));
  try {
    const casesDir = path.join(stagedDir, "cases");
    await fs.mkdir(casesDir, { mode: 0o700 });
    const cases = [];
    for (const value of loaded.cases) {
      const prepared = createTrackingCandidatePreannotationCase({
        ...value,
        extraction: loaded.pack.extraction,
      });
      const suggestionFile = `cases/${prepared.id}.suggestions.mot.txt`;
      const trackMapFile = `cases/${prepared.id}.track-map.json`;
      const suggestionBytes = Buffer.from(prepared.motText, "utf8");
      const trackMapBytes = Buffer.from(`${JSON.stringify(prepared.trackMap, null, 2)}\n`, "utf8");
      await writeImmutable(path.join(stagedDir, ...suggestionFile.split("/")), suggestionBytes);
      await writeImmutable(path.join(stagedDir, ...trackMapFile.split("/")), trackMapBytes);
      cases.push({
        id: prepared.id,
        suggestion: descriptor(suggestionFile, suggestionBytes),
        trackMap: descriptor(trackMapFile, trackMapBytes),
        summary: prepared.summary,
      });
    }
    const workspace = createTrackingCandidatePreannotationWorkspace(
      loaded.pack,
      loaded.associationManifest || {},
      cases,
      {
        id: options.id,
        now: dependencies.now,
        detectionScreeningSha256: loaded.detectionManifest.screeningSha256,
      },
    );
    await writeImmutable(
      path.join(stagedDir, "workspace.json"),
      Buffer.from(`${JSON.stringify(workspace, null, 2)}\n`, "utf8"),
    );
    await fs.rename(stagedDir, outputDir);
    return Object.freeze({ ok: true, outputDir, workspace });
  } catch (error) {
    await fs.rm(stagedDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function main(values = process.argv.slice(2)) {
  let options;
  try {
    options = parseTrackingCandidatePreannotationArguments(values);
    const result = await runTrackingCandidatePreannotation(options);
    console.log(options.json ? JSON.stringify(result) : JSON.stringify(result.workspace, null, 2));
  } catch (error) {
    console.error(options?.json
      ? JSON.stringify({ ok: false, code: error.code || "TRACKING_CANDIDATE_PREANNOTATION_FAILED", error: error.message })
      : error.message);
    process.exitCode = 1;
  }
}

const direct = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (direct) await main();
