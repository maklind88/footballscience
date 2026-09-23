#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyTrackingCandidateScreeningBundle } from "../desktop/local-video-app/local-video-server/tracking-candidate-screening-verifier.mjs";

export class TrackingCandidateScreeningVerifyCliError extends Error {
  constructor(message, code = "TRACKING_CANDIDATE_SCREENING_VERIFY_FAILED") {
    super(message);
    this.name = "TrackingCandidateScreeningVerifyCliError";
    this.code = code;
  }
}

function invalid(message) {
  throw new TrackingCandidateScreeningVerifyCliError(message);
}

export function parseTrackingCandidateScreeningVerifyArguments(values = []) {
  const options = { json: false, packPath: "", screeningDir: "" };
  const valueOptions = new Set(["--pack", "--screening"]);
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--json") options.json = true;
    else if (valueOptions.has(argument)) {
      const value = values[index + 1];
      if (!value || value.startsWith("--")) invalid(`${argument} requires a value.`);
      if (argument === "--pack") options.packPath = value;
      else options.screeningDir = value;
      index += 1;
    } else invalid(`Unknown verification option: ${argument}`);
  }
  if (!options.packPath || !options.screeningDir) invalid("--pack and --screening are required.");
  return options;
}

async function main(values = process.argv.slice(2)) {
  let options;
  try {
    options = parseTrackingCandidateScreeningVerifyArguments(values);
    const result = await verifyTrackingCandidateScreeningBundle(options);
    console.log(options.json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(options?.json
      ? JSON.stringify({ ok: false, code: error.code || "TRACKING_CANDIDATE_SCREENING_VERIFY_FAILED", error: error.message })
      : error.message);
    process.exitCode = 1;
  }
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (direct) await main();
