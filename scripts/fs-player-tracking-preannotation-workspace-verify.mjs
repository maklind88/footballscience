#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyTrackingCandidatePreannotationWorkspace } from "../desktop/local-video-app/local-video-server/tracking-candidate-preannotation-workspace-verifier.mjs";

function invalid(message) {
  const error = new Error(message);
  error.code = "TRACKING_CANDIDATE_PREANNOTATION_ARGUMENT_INVALID";
  throw error;
}

export function parseTrackingCandidatePreannotationVerificationArguments(values = []) {
  const options = {
    json: false,
    packPath: "",
    detectionScreeningDir: "",
    associationScreeningDir: "",
    workspaceDir: "",
  };
  const valueOptions = new Set([
    "--pack", "--detection-screening", "--association-screening", "--workspace",
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
      else options.workspaceDir = value;
      index += 1;
    } else invalid(`Unknown preannotation verification option: ${argument}`);
  }
  if (!options.packPath || !options.detectionScreeningDir
    || !options.associationScreeningDir || !options.workspaceDir) {
    invalid("--pack, --detection-screening, --association-screening, and --workspace are required.");
  }
  return options;
}

async function main(values = process.argv.slice(2)) {
  let options;
  try {
    options = parseTrackingCandidatePreannotationVerificationArguments(values);
    const result = await verifyTrackingCandidatePreannotationWorkspace(options);
    console.log(options.json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(options?.json
      ? JSON.stringify({ ok: false, code: error.code || "TRACKING_CANDIDATE_PREANNOTATION_VERIFICATION_FAILED", error: error.message })
      : error.message);
    process.exitCode = 1;
  }
}

const direct = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (direct) await main();
