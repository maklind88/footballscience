import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { dataSafetyRegistry } from "../src/core/data-safety-contracts.mjs";

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

function readBaseline() {
  if (!fs.existsSync(baselinePath)) {
    fail(`Predeploy live content baseline is missing: ${path.relative(rootDir, baselinePath)}.`);
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    return parsed?.safety || parsed;
  } catch (error) {
    fail(`Predeploy live content baseline is not valid JSON: ${error?.message || "unknown error"}`);
    return null;
  }
}

function getCountEntries(entry = {}) {
  const counts = entry?.summary?.counts;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    return [];
  }
  return Object.entries(counts).filter(([, value]) => Number.isFinite(Number(value)));
}

function validateSafetyPayload(payload, label) {
  if (!payload || payload.ok !== true) {
    fail(`${label} did not return ok:true.`);
    return;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "entries")) {
    fail(`${label} must not expose raw app-state entries.`);
  }
  if (!payload.manifest || typeof payload.manifest !== "object" || Array.isArray(payload.manifest)) {
    fail(`${label} is missing a sanitized manifest.`);
    return;
  }
  const requiredKeys = dataSafetyRegistry.keys();
  if (Number(payload.keyCount) !== requiredKeys.length) {
    fail(`${label} keyCount does not match the Data Safety registry.`);
  }
  requiredKeys.forEach((key) => {
    if (!payload.manifest[key]) {
      fail(`${label} is missing manifest metadata for ${key}.`);
    }
  });
}

function compareAgainstBaseline(baseline, current) {
  const baselineManifest = baseline?.manifest || {};
  const currentManifest = current?.manifest || {};
  dataSafetyRegistry.keys().forEach((key) => {
    const before = baselineManifest[key] || {};
    const after = currentManifest[key] || {};
    if (!before.present) {
      return;
    }
    if (!after.present) {
      fail(`${key} was present before deploy but is missing after deploy.`);
      return;
    }
    if (Number(after.revision || 0) < Number(before.revision || 0)) {
      fail(`${key} revision moved backwards (${before.revision} -> ${after.revision}).`);
    }
    getCountEntries(before).forEach(([countName, beforeValue]) => {
      const beforeCount = Number(beforeValue);
      const afterCount = Number(after?.summary?.counts?.[countName] ?? 0);
      if (afterCount < beforeCount) {
        fail(`${key} ${countName} decreased during deploy (${beforeCount} -> ${afterCount}).`);
      }
    });
  });
}

if (!cronSecret) {
  fail("CRON_SECRET or APP_STATE_BACKUP_STATUS_TOKEN is required to verify live content after deploy.");
}

const baseline = readBaseline();
let currentPayload = null;

if (!failures.length) {
  const statusUrl = new URL("/api/app-state-backup", baseUrl);
  statusUrl.searchParams.set("mode", "live-safety-status");
  const response = await fetch(statusUrl, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
    },
  });
  currentPayload = await readJsonResponse(response);
  if (!response.ok || currentPayload.ok !== true) {
    fail(`Live content safety endpoint failed (${response.status}): ${currentPayload.reason || "unknown error"}`);
  }
}

if (!failures.length) {
  validateSafetyPayload(baseline, "Predeploy baseline");
  validateSafetyPayload(currentPayload, "Postdeploy live content status");
  compareAgainstBaseline(baseline, currentPayload);
}

if (failures.length) {
  console.error("Live content safety verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    `Live content safety: ok (${currentPayload.presentEntryCount || 0}/${currentPayload.keyCount || 0} protected entries checked).`
  );
}
