import process from "node:process";

const baseUrl = new URL(process.env.LIVE_QA_BASE_URL || process.argv[2] || "https://footballscience.xyz");
const cronSecret = String(process.env.CRON_SECRET || process.env.APP_STATE_BACKUP_STATUS_TOKEN || "").trim();
const maxAgeHours = Number(process.env.BACKUP_MAX_AGE_HOURS || process.env.APP_STATE_BACKUP_MAX_AGE_HOURS || 36);
const failures = [];

function fail(message) {
  failures.push(message);
}

if (!cronSecret) {
  fail("CRON_SECRET or APP_STATE_BACKUP_STATUS_TOKEN is required to verify app-state backup freshness.");
}

if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
  fail("BACKUP_MAX_AGE_HOURS must be a positive number.");
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

  const latest = payload.latest || {};
  const backup = payload.backup || {};
  const ageMs = Number(latest.ageMs);
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

  if (!payload.backupMatchesPointer) {
    fail("Latest backup pointer does not match the stored backup object.");
  }

  if (!latest.createdAt || Number.isNaN(Date.parse(latest.createdAt))) {
    fail("Latest backup has an invalid createdAt timestamp.");
  }

  if (!Number.isFinite(ageMs) || ageMs > maxAgeMs) {
    fail(`Latest backup is stale: age=${Math.round(ageMs / 60000)} minutes, max=${maxAgeHours} hours.`);
  }

  if (!latest.path || !latest.path.startsWith("backups/app-state/")) {
    fail("Latest backup path is missing or outside the expected prefix.");
  }

  if (!latest.contentSha256 || latest.contentSha256 !== backup.contentSha256) {
    fail("Latest backup hash is missing or does not match the backup object.");
  }

  if (!Number.isInteger(Number(latest.entryCount)) || Number(latest.entryCount) < 0) {
    fail("Latest backup entry count is invalid.");
  }

  if (!failures.length) {
    const ageMinutes = Math.round(ageMs / 60000);
    console.log(`App-state backup freshness: ok (${latest.path}, ${ageMinutes} minutes old, ${latest.entryCount} entries).`);
  }
}

if (failures.length) {
  console.error("App-state backup freshness verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}
