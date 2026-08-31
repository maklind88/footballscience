#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  installTrackingCandidate,
  readTrackingCandidateManifest,
  trackingCandidateInstallPlan,
} from "./candidate-install-service.mjs";

export function parseCandidateInstallArguments(values = []) {
  const options = {
    acceptLicense: false,
    json: false,
    manifestPath: "",
    modelSources: new Map(),
    plan: false,
    registryDir: "",
    runtimePath: "",
  };
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--accept-license") options.acceptLicense = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--plan") options.plan = true;
    else if (["--manifest", "--runtime", "--registry-dir", "--model"].includes(argument)) {
      const value = values[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      if (argument === "--manifest") options.manifestPath = value;
      else if (argument === "--runtime") options.runtimePath = value;
      else if (argument === "--registry-dir") options.registryDir = value;
      else {
        const separator = value.indexOf("=");
        if (separator < 1 || separator === value.length - 1) throw new Error("--model requires <id>=<file>.");
        const id = value.slice(0, separator);
        if (options.modelSources.has(id)) throw new Error(`Duplicate model id: ${id}.`);
        options.modelSources.set(id, value.slice(separator + 1));
      }
      index += 1;
    } else {
      throw new Error(`Unknown candidate installer option: ${argument}`);
    }
  }
  if (!options.manifestPath) throw new Error("--manifest is required.");
  if (!options.plan && !options.runtimePath) throw new Error("--runtime is required.");
  return options;
}

async function main(values = process.argv.slice(2)) {
  let options;
  try {
    options = parseCandidateInstallArguments(values);
    const result = options.plan
      ? { ok: true, plan: trackingCandidateInstallPlan(
        await readTrackingCandidateManifest(options.manifestPath),
        options,
      ) }
      : await installTrackingCandidate(options);
    console.log(options.json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(options?.json
      ? JSON.stringify({ ok: false, code: error.code || "TRACKING_CANDIDATE_INSTALL_FAILED", error: error.message })
      : error.message);
    process.exitCode = 1;
  }
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (direct) await main();
