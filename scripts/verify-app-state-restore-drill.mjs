import process from "node:process";
import { dataSafetyRegistry } from "../src/core/data-safety-contracts.mjs";

const baseUrl = new URL(process.env.LIVE_QA_BASE_URL || process.argv[2] || "https://footballscience.xyz");
const cronSecret = String(process.env.CRON_SECRET || process.env.APP_STATE_BACKUP_STATUS_TOKEN || "").trim();
const failures = [];

function fail(message) {
  failures.push(message);
}

if (!cronSecret) {
  fail("CRON_SECRET or APP_STATE_BACKUP_STATUS_TOKEN is required to run the app-state restore drill.");
}

if (!failures.length) {
  const restoreDrillUrl = new URL("/api/app-state-backup", baseUrl);
  restoreDrillUrl.searchParams.set("mode", "restore-drill");
  const response = await fetch(restoreDrillUrl, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok !== true) {
    fail(`Restore drill endpoint failed (${response.status}): ${payload.reason || "unknown error"}`);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "entries")) {
    fail("Restore drill must not expose raw backup entries.");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "manifest")) {
    fail("Restore drill must not expose the full backup manifest.");
  }

  const restoreDrill = payload.restoreDrill || {};
  const requiredKeyCount = dataSafetyRegistry.keys().length;

  if (restoreDrill.dryRun !== true || restoreDrill.restored !== false) {
    fail("Restore drill must be read-only and report dryRun=true/restored=false.");
  }

  if (restoreDrill.restorable !== true) {
    fail("Latest backup is not marked as restorable.");
  }

  if (Number(restoreDrill.keyCount) !== requiredKeyCount) {
    fail("Restore drill key count does not match the Data Safety registry.");
  }

  if (Number(restoreDrill.entryCount) !== Number(restoreDrill.declaredEntryCount)) {
    fail("Restore drill entry count does not match the backup envelope.");
  }

  if (Number(restoreDrill.entryCount) !== Number(restoreDrill.pointerEntryCount)) {
    fail("Restore drill entry count does not match the latest backup pointer.");
  }

  if (Number(restoreDrill.parsedEntryCount) !== Number(restoreDrill.entryCount)) {
    fail("Restore drill could not parse every present backup entry.");
  }

  for (const field of ["unknownEntryKeys", "missingEntryKeys", "unexpectedEntryKeys", "invalidEntries"]) {
    if (!Array.isArray(restoreDrill[field]) || restoreDrill[field].length > 0) {
      fail(`Restore drill reported ${field}.`);
    }
  }

  if (!restoreDrill.modules || typeof restoreDrill.modules !== "object" || Array.isArray(restoreDrill.modules)) {
    fail("Restore drill module summary is missing.");
  }

  if (!failures.length) {
    console.log(
      `App-state restore drill: ok (${restoreDrill.entryCount} entries parsed across ${restoreDrill.moduleCount} modules, no writes).`
    );
  }
}

if (failures.length) {
  console.error("App-state restore drill failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}
