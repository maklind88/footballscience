import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = new URL(process.env.LIVE_QA_BASE_URL || process.argv[2] || "https://footballscience.xyz");
const cronSecret = String(process.env.CRON_SECRET || process.env.APP_STATE_BACKUP_STATUS_TOKEN || "").trim();
const baselinePath = path.resolve(
  rootDir,
  process.env.LIVE_CONTENT_BASELINE_PATH || ".release/predeploy-live-content-safety.json"
);
const failures = [];

function fail(message) {
  failures.push(message);
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 400) };
  }
}

async function callProtectedEndpoint(pathname) {
  const url = new URL(pathname, baseUrl);
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
    },
  });
  const payload = await readJsonResponse(response);
  return { response, payload };
}

if (!cronSecret) {
  fail("CRON_SECRET or APP_STATE_BACKUP_STATUS_TOKEN is required before production deploy.");
}

let backupPayload = null;
let safetyPayload = null;

if (!failures.length) {
  const backup = await callProtectedEndpoint("/api/app-state-backup");
  backupPayload = backup.payload;
  if (!backup.response.ok || backupPayload.ok !== true) {
    fail(`App-state backup failed (${backup.response.status}): ${backupPayload.reason || "unknown error"}`);
  }

  const safety = await callProtectedEndpoint("/api/app-state-backup?mode=live-safety-status");
  safetyPayload = safety.payload;
  if (!safety.response.ok || safetyPayload.ok !== true) {
    fail(`Live content safety snapshot failed (${safety.response.status}): ${safetyPayload.reason || "unknown error"}`);
  }

  if (Object.prototype.hasOwnProperty.call(safetyPayload, "entries")) {
    fail("Live content safety snapshot must not expose raw app-state entries.");
  }
}

if (!failures.length) {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(
    baselinePath,
    `${JSON.stringify(
      {
        schema: "footballscience-predeploy-live-content-baseline-v1",
        capturedAt: new Date().toISOString(),
        baseUrl: baseUrl.origin,
        backup: {
          createdAt: backupPayload.createdAt || "",
          path: backupPayload.path || "",
          latestPath: backupPayload.latestPath || "",
          entryCount: Number(backupPayload.entryCount || 0),
          contentSha256: backupPayload.contentSha256 || "",
        },
        safety: safetyPayload,
      },
      null,
      2
    )}\n`
  );
  console.log(
    `Predeploy app-state backup: ok (${backupPayload.path}, ${backupPayload.entryCount} entries). Baseline: ${path.relative(
      rootDir,
      baselinePath
    )}`
  );
}

if (failures.length) {
  console.error("Predeploy app-state backup failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}
