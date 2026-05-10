import process from "node:process";
import { dataSafetyRegistry } from "../src/core/data-safety-contracts.mjs";

const baseUrl = new URL(process.env.LIVE_QA_BASE_URL || process.argv[2] || "https://footballscience.xyz");
const cronSecret = String(process.env.CRON_SECRET || process.env.APP_STATE_BACKUP_STATUS_TOKEN || "").trim();
const failures = [];

function fail(message) {
  failures.push(message);
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ""));
}

function validateManifestEntry(key, entry) {
  const contract = dataSafetyRegistry.getByKey(key);
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    fail(`Backup manifest is missing ${key}.`);
    return;
  }

  if (entry.moduleId !== contract.moduleId) {
    fail(`Backup manifest module mismatch for ${key}: expected=${contract.moduleId} actual=${entry.moduleId || ""}.`);
  }

  if (entry.present !== true && entry.present !== false) {
    fail(`Backup manifest present flag is invalid for ${key}.`);
  }

  if (entry.present === true) {
    if (!entry.organizationId) {
      fail(`Backup manifest organizationId is missing for ${key}.`);
    }

    if (!Number.isInteger(Number(entry.revision)) || Number(entry.revision) < 0) {
      fail(`Backup manifest revision is invalid for ${key}.`);
    }

    if (!entry.mergePolicy) {
      fail(`Backup manifest mergePolicy is missing for ${key}.`);
    }

    if (!entry.updatedAt || Number.isNaN(Date.parse(entry.updatedAt))) {
      fail(`Backup manifest updatedAt is invalid for ${key}.`);
    }

    if (!Number.isInteger(Number(entry.bytes)) || Number(entry.bytes) < 0) {
      fail(`Backup manifest bytes is invalid for ${key}.`);
    }

    if (!isSha256(entry.sha256)) {
      fail(`Backup manifest sha256 is invalid for ${key}.`);
    }
  }
}

if (!cronSecret) {
  fail("CRON_SECRET or APP_STATE_BACKUP_STATUS_TOKEN is required to verify app-state restore readiness.");
}

if (!failures.length) {
  const statusUrl = new URL("/api/app-state-backup-status", baseUrl);
  const response = await fetch(statusUrl, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok !== true) {
    fail(`Backup status endpoint failed (${response.status}): ${payload.reason || "unknown error"}`);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "entries")) {
    fail("Backup status must not expose raw backup entries.");
  }

  if (!payload.backupMatchesPointer) {
    fail("Latest backup pointer does not match the stored backup object.");
  }

  const manifest = payload.manifest || {};
  const coverage = payload.manifestCoverage || {};
  const requiredKeys = dataSafetyRegistry.keys();

  if (!Number.isInteger(Number(coverage.keyCount)) || Number(coverage.keyCount) !== requiredKeys.length) {
    fail("Backup manifest coverage key count does not match the Data Safety registry.");
  }

  if (Array.isArray(coverage.missingKeys) && coverage.missingKeys.length > 0) {
    fail(`Backup manifest is missing protected keys: ${coverage.missingKeys.join(", ")}.`);
  }

  for (const key of requiredKeys) {
    validateManifestEntry(key, manifest[key]);
  }

  if (!failures.length) {
    const presentEntryCount = Number(coverage.presentEntryCount || 0);
    console.log(`App-state restore readiness: ok (${requiredKeys.length} protected keys, ${presentEntryCount} present entries).`);
  }
}

if (failures.length) {
  console.error("App-state restore readiness verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}
