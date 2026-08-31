#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyTrackingCandidateAssociationBundle } from "../desktop/local-video-app/local-video-server/tracking-candidate-association-screening-verifier.mjs";

export class TrackingAssociationScreeningVerifyCliError extends Error {
  constructor(message, code = "TRACKING_ASSOCIATION_SCREENING_VERIFY_FAILED") {
    super(message);
    this.name = "TrackingAssociationScreeningVerifyCliError";
    this.code = code;
  }
}

function invalid(message) {
  throw new TrackingAssociationScreeningVerifyCliError(message);
}

export function parseTrackingAssociationScreeningVerifyArguments(values = []) {
  const options = { json: false, packPath: "", detectionScreeningDir: "", screeningDir: "" };
  const valueOptions = new Set(["--pack", "--detection-screening", "--screening"]);
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--json") options.json = true;
    else if (valueOptions.has(argument)) {
      const value = values[index + 1];
      if (!value || value.startsWith("--")) invalid(`${argument} requires a value.`);
      if (argument === "--pack") options.packPath = value;
      else if (argument === "--detection-screening") options.detectionScreeningDir = value;
      else options.screeningDir = value;
      index += 1;
    } else invalid(`Unknown association verification option: ${argument}`);
  }
  if (!options.packPath || !options.detectionScreeningDir || !options.screeningDir) {
    invalid("--pack, --detection-screening, and --screening are required.");
  }
  return options;
}

async function main(values = process.argv.slice(2)) {
  let options;
  try {
    options = parseTrackingAssociationScreeningVerifyArguments(values);
    const result = await verifyTrackingCandidateAssociationBundle(options);
    console.log(options.json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(options?.json
      ? JSON.stringify({ ok: false, code: error.code || "TRACKING_ASSOCIATION_SCREENING_VERIFY_FAILED", error: error.message })
      : error.message);
    process.exitCode = 1;
  }
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (direct) await main();
