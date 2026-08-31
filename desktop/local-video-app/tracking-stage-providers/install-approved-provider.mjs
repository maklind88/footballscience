#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  installApprovedTrackingProvider,
  planApprovedTrackingProviderInstallation,
} from "./approved-provider-install-service.mjs";

export function parseApprovedProviderInstallArguments(values = []) {
  const options = {
    acceptLicense: false,
    approveActivation: false,
    candidateId: "",
    candidateRegistryDir: "",
    candidateVersion: "",
    evidencePath: "",
    json: false,
    plan: false,
    providerRegistryDir: "",
    reportPath: "",
  };
  const valueOptions = new Map([
    ["--candidate-id", "candidateId"],
    ["--candidate-version", "candidateVersion"],
    ["--candidate-registry-dir", "candidateRegistryDir"],
    ["--provider-registry-dir", "providerRegistryDir"],
    ["--report", "reportPath"],
    ["--evidence", "evidencePath"],
  ]);
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--accept-license") options.acceptLicense = true;
    else if (argument === "--approve-local-activation") options.approveActivation = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--plan") options.plan = true;
    else if (valueOptions.has(argument)) {
      const value = values[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      options[valueOptions.get(argument)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown approved provider installer option: ${argument}`);
    }
  }
  if (!options.candidateId) throw new Error("--candidate-id is required.");
  if (!options.candidateVersion) throw new Error("--candidate-version is required.");
  if (!options.reportPath) throw new Error("--report is required.");
  if (!options.evidencePath) throw new Error("--evidence is required.");
  return options;
}

async function main(values = process.argv.slice(2)) {
  let options;
  try {
    options = parseApprovedProviderInstallArguments(values);
    const result = options.plan
      ? await planApprovedTrackingProviderInstallation(options)
      : await installApprovedTrackingProvider(options);
    console.log(options.json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(options?.json
      ? JSON.stringify({ ok: false, code: error.code || "TRACKING_APPROVED_PROVIDER_INSTALL_FAILED", error: error.message })
      : error.message);
    process.exitCode = 1;
  }
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (direct) await main();
