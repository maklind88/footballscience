#!/usr/bin/env node
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseBackfillArgs } from "./platform-identity-backfill.mjs";
import {
  executePlatformIdentityStagingDrill,
  STAGING_APPLY_CONFIRMATION,
} from "./lib/platform-identity-staging-backfill-drill.mjs";

export function parseStagingDrillArgs(argv = process.argv.slice(2)) {
  return parseBackfillArgs(argv);
}

function printHelp() {
  console.log(`Platform Identity staging drill

This command is staging-only. It captures a verified private baseline, applies
the reviewed identity plan, verifies it, proves rollback, verifies the
baseline, and reapplies the same verified scope.

Required:
  --apply
  --confirm=${STAGING_APPLY_CONFIRMATION}
  --expected-plan-sha256 <reviewed dry-run SHA-256>
  --expected-user-count <reviewed dry-run user count>
`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }
  const result = await executePlatformIdentityStagingDrill({ backfill: parseStagingDrillArgs() });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.message || "Platform Identity staging drill failed.");
    process.exitCode = 1;
  });
}
