#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyTrackingCandidateReidentificationBundle } from "../desktop/local-video-app/local-video-server/tracking-candidate-reidentification-screening-verifier.mjs";

function parseArguments(values = []) {
  const options = { json: false, packPath: "", detectionScreeningDir: "", associationScreeningDir: "", screeningDir: "" };
  const valueOptions = new Set(["--pack", "--detection-screening", "--association-screening", "--screening"]);
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--json") options.json = true;
    else if (valueOptions.has(argument)) {
      const value = values[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      if (argument === "--pack") options.packPath = value;
      else if (argument === "--detection-screening") options.detectionScreeningDir = value;
      else if (argument === "--association-screening") options.associationScreeningDir = value;
      else options.screeningDir = value;
      index += 1;
    } else throw new Error(`Unknown re-identification verification option: ${argument}`);
  }
  if (!options.packPath || !options.detectionScreeningDir || !options.associationScreeningDir || !options.screeningDir) {
    throw new Error("--pack, --detection-screening, --association-screening, and --screening are required.");
  }
  return options;
}

async function main(values = process.argv.slice(2)) {
  let options;
  try {
    options = parseArguments(values);
    const result = await verifyTrackingCandidateReidentificationBundle(options);
    console.log(options.json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(options?.json
      ? JSON.stringify({ ok: false, code: error.code || "TRACKING_REIDENTIFICATION_VERIFICATION_FAILED", error: error.message })
      : error.message);
    process.exitCode = 1;
  }
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (direct) await main();
