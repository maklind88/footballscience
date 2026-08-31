#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectTrackingCandidateInstallations } from "./candidate-install-service.mjs";

export function parseCandidatePreflightArguments(values = []) {
  const options = { json: false, registryDir: "" };
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--registry-dir") {
      const value = values[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--registry-dir requires a value.");
      options.registryDir = value;
      index += 1;
    } else throw new Error(`Unknown candidate preflight option: ${argument}`);
  }
  return options;
}

async function main(values = process.argv.slice(2)) {
  let options;
  try {
    options = parseCandidatePreflightArguments(values);
    const result = await inspectTrackingCandidateInstallations(options);
    console.log(options.json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(options?.json
      ? JSON.stringify({ ok: false, error: error.message })
      : error.message);
    process.exitCode = 1;
  }
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (direct) await main();
