#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  preflightTrackingGroundTruthReviewCampaign,
} from "../desktop/local-video-app/local-video-server/tracking-ground-truth-review-preflight.mjs";

function invalid(message) {
  const error = new Error(message);
  error.code = "TRACKING_GROUND_TRUTH_REVIEW_PREFLIGHT_ARGUMENT_INVALID";
  throw error;
}

export function parseTrackingGroundTruthReviewPreflightArguments(values = []) {
  const options = {
    json: false,
    packPath: "",
    detectionScreeningDir: "",
    associationScreeningDir: "",
    workspaceDir: "",
    reviewManifestPath: "",
  };
  const valueOptions = new Set([
    "--pack",
    "--detection-screening",
    "--association-screening",
    "--workspace",
    "--review-manifest",
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
      else if (argument === "--workspace") options.workspaceDir = value;
      else options.reviewManifestPath = value;
      index += 1;
    } else invalid(`Unknown ground-truth review preflight option: ${argument}`);
  }
  if (!options.packPath || !options.detectionScreeningDir
    || !options.workspaceDir || !options.reviewManifestPath) {
    invalid("--pack, --detection-screening, --workspace, and --review-manifest are required.");
  }
  return options;
}

export async function runTrackingGroundTruthReviewPreflight(values = process.argv.slice(2), streams = {}) {
  const stdout = streams.stdout || process.stdout;
  const stderr = streams.stderr || process.stderr;
  let options;
  try {
    options = parseTrackingGroundTruthReviewPreflightArguments(values);
    const report = await preflightTrackingGroundTruthReviewCampaign(options);
    stdout.write(`${options.json ? JSON.stringify(report) : JSON.stringify(report, null, 2)}\n`);
    return report.ok ? 0 : 1;
  } catch (error) {
    const failure = {
      ok: false,
      code: error.code || "TRACKING_GROUND_TRUTH_REVIEW_PREFLIGHT_FAILED",
      error: error.message,
    };
    stderr.write(`${options?.json ? JSON.stringify(failure) : failure.error}\n`);
    return 2;
  }
}

const direct = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (direct) process.exitCode = await runTrackingGroundTruthReviewPreflight();
