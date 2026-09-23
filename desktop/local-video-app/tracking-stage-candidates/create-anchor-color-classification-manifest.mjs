#!/usr/bin/env node
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTrackingProviderManifest } from "../local-video-server/tracking-provider-contract.mjs";
import { anchorColorClassificationBuildIdentity } from "./build-anchor-color-classification-provider.mjs";

const PROVIDER_ID = "anchor-color-role-team-reference";
const PROVIDER_VERSION = "0.1.0";
const REPOSITORY = "https://github.com/maklind88/footballscience";
const INTERNAL_LICENSE = "LicenseRef-Football-Science-Internal";
const REVIEWED_AT = "2026-08-31";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const buildScriptPath = path.join(scriptDir, "build-anchor-color-classification-provider.mjs");
const modelPath = path.join(scriptDir, "providers", "anchor-color-classifier-spec.json");

export class AnchorColorManifestError extends Error {
  constructor(message, code = "TRACKING_ANCHOR_COLOR_MANIFEST_INVALID", options = {}) {
    super(message, options);
    this.name = "AnchorColorManifestError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new AnchorColorManifestError(message, code);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactCommit(value) {
  const commit = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commit)) invalid("--source-commit must be one full 40-character Git commit.");
  return commit;
}

function sourceUrl(commit, relativePath, fragment = "") {
  return `${REPOSITORY}/blob/${commit}/${relativePath}${fragment}`;
}

async function verifiedModel(build) {
  const bytes = await fs.readFile(modelPath);
  const expected = build.sourceFiles.find((entry) => entry.name === path.basename(modelPath));
  if (!expected || sha256(bytes) !== expected.sha256) {
    invalid("Anchor-color specification does not match the reproducible build identity.",
      "TRACKING_ANCHOR_COLOR_MANIFEST_MODEL_MISMATCH");
  }
  return { bytes: bytes.byteLength, sha256: expected.sha256 };
}

export function parseAnchorColorManifestArguments(values = []) {
  const options = { json: false, outputPath: "", sourceCommit: "" };
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--json") options.json = true;
    else if (["--output", "--source-commit"].includes(argument)) {
      const value = values[++index];
      if (!value || value.startsWith("--")) invalid(`${argument} requires a value.`);
      if (argument === "--output") options.outputPath = value;
      else options.sourceCommit = value;
    } else invalid(`Unknown manifest option: ${argument}`);
  }
  if (!options.outputPath || !options.sourceCommit) invalid("--source-commit and --output are required.");
  return options;
}

export async function createAnchorColorClassificationManifest(options = {}) {
  const sourceCommit = exactCommit(options.sourceCommit);
  const build = anchorColorClassificationBuildIdentity();
  const model = await verifiedModel(build);
  const builderSha256 = sha256(await fs.readFile(buildScriptPath));
  const provenancePath = "docs/video-analysis/TRACKING_ANCHOR_COLOR_PROVIDER.md";
  const fixturePath = "qa/fixtures/video-analysis/anchor-color-classifier-synthetic-fixture.json";
  const sourceSha256 = sha256(canonicalJson({
    protocol: "football-science-anchor-color-source-bundle-v1",
    sourceCommit,
    builderSha256,
    build,
  }));
  return normalizeTrackingProviderManifest({
    schemaVersion: 1,
    protocol: "football-science-tracking-stage-v1",
    providerId: PROVIDER_ID,
    providerVersion: PROVIDER_VERSION,
    displayName: "Anchor-calibrated role and team reference",
    stage: "classification",
    priority: 40,
    capabilities: ["classify:role", "classify:team"],
    approval: {
      status: "candidate",
      reviewedAt: REVIEWED_AT,
      networkAtInference: false,
      licenseReviewed: true,
      redistributeUpstreamAssets: false,
    },
    upstream: {
      repository: REPOSITORY,
      commit: sourceCommit,
      sourceSha256,
      license: INTERNAL_LICENSE,
      licenseUrl: sourceUrl(sourceCommit, provenancePath, "#licence-and-data-boundary"),
    },
    models: [{
      id: "anchor-color-classifier-spec-v1",
      sha256: model.sha256,
      bytes: model.bytes,
      license: INTERNAL_LICENSE,
      sourceUrl: sourceUrl(sourceCommit,
        "desktop/local-video-app/tracking-stage-candidates/providers/anchor-color-classifier-spec.json"),
      provenance: {
        modelCardUrl: sourceUrl(sourceCommit, provenancePath),
        trainingDataReviewed: true,
        datasets: [{
          id: "football-science-synthetic-kit-colour-fixture-v1",
          version: "1.0.0",
          usage: "evaluation",
          sourceUrl: sourceUrl(sourceCommit, fixturePath),
          terms: "synthetic-internal-evaluation",
          termsUrl: sourceUrl(sourceCommit, provenancePath, "#synthetic-reference-fixture"),
          rightsReviewed: true,
          identityUseReviewed: true,
        }],
      },
    }],
    runtime: {
      providerSha256: build.runtime.sha256,
      device: "cpu",
      runtimeMode: "native-stage-process-v1",
      cpuThreads: 8,
      sampleFps: 6.25,
      modelResident: false,
      maxFrames: 30_000,
      maxDurationMs: 1_200_000,
      maxWallTimeMs: 7_200_000,
      maxMemoryMb: 4096,
      maxOutputBytes: 64 * 1024 * 1024,
      maxConcurrentJobs: 1,
    },
    benchmark: { status: "not-run", evaluatorVersion: "not-run", profileId: "not-run" },
  });
}

export async function writeAnchorColorClassificationManifest(options = {}) {
  const outputPath = path.resolve(String(options.outputPath || ""));
  if (!options.outputPath) invalid("An output path is required.");
  const manifest = await createAnchorColorClassificationManifest(options);
  await fs.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(outputPath, `${canonicalJson(manifest)}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error?.code === "EEXIST") invalid("Manifest output already exists.",
      "TRACKING_ANCHOR_COLOR_MANIFEST_OUTPUT_EXISTS");
    throw error;
  }
  return { ok: true, outputPath, manifest };
}

async function main(values = process.argv.slice(2)) {
  let options;
  try {
    options = parseAnchorColorManifestArguments(values);
    const result = await writeAnchorColorClassificationManifest(options);
    console.log(options.json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(options?.json ? JSON.stringify({ ok: false, code: error.code, error: error.message })
      : `${error.code || "TRACKING_ANCHOR_COLOR_MANIFEST_INVALID"}: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
