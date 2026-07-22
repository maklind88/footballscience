#!/usr/bin/env node
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  executePlatformIdentityBackfill,
  listAuthUsersForBackfill,
  parseBackfillArgs,
} from "./platform-identity-backfill.mjs";
import { createPlatformIdentitySnapshotSummary } from "./lib/platform-identity-snapshot.mjs";
import {
  buildPlatformIdentitySnapshot,
  storePlatformIdentitySnapshot,
} from "./lib/platform-identity-snapshot-io.mjs";

const require = createRequire(import.meta.url);
const { readConfig } = require("../api/_lib/supabase-admin.js");

export const SNAPSHOT_CONFIRMATION = "CAPTURE_PLATFORM_IDENTITY_SNAPSHOT";

function normalizeText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function parseLink(value) {
  const [moduleId, moduleTable, moduleRecordId] = normalizeText(value, 400).split(":");
  return moduleId && moduleTable && moduleRecordId ? { moduleId, moduleTable, moduleRecordId } : null;
}

export function parseSnapshotArgs(argv = process.argv.slice(2), env = process.env) {
  const capture = argv.includes("--capture");
  const backfillArgs = argv.filter((arg) => arg !== "--capture");
  const backfill = parseBackfillArgs(backfillArgs);
  return {
    capture,
    confirm: backfill.confirm,
    json: backfill.json,
    target: normalizeText(env.PLATFORM_BACKFILL_TARGET, 40),
    projectRef: normalizeText(env.SUPABASE_PROJECT_REF, 80),
    canonicalProductionProjectRef: normalizeText(env.CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF, 80),
    expectedPlanSha256: normalizeText(backfill.expectedPlanSha256, 64),
    expectedUserCount: backfill.expectedUserCount,
    backfill: { ...backfill, apply: false, confirm: "" },
  };
}

function validateEnvironmentTarget(options, config) {
  const failures = [];
  let urlProjectRef = "";
  try {
    urlProjectRef = new URL(config.url).hostname.split(".", 1)[0];
  } catch {
    failures.push("Supabase URL is invalid.");
  }
  if (urlProjectRef && urlProjectRef !== options.projectRef) {
    failures.push("Supabase URL and project ref do not match.");
  }
  if (!options.canonicalProductionProjectRef) {
    failures.push("Canonical production project ref is required.");
  } else if (options.target === "staging" && options.projectRef === options.canonicalProductionProjectRef) {
    failures.push("Staging snapshot cannot target production Supabase.");
  } else if (options.target === "production" && options.projectRef !== options.canonicalProductionProjectRef) {
    failures.push("Production snapshot must target canonical production Supabase.");
  }
  return failures;
}

function validateCaptureGuards(options, plan) {
  const failures = [];
  if (!options.capture) return failures;
  if (options.confirm !== SNAPSHOT_CONFIRMATION) {
    failures.push(`Snapshot capture requires --confirm=${SNAPSHOT_CONFIRMATION}.`);
  }
  if (options.expectedPlanSha256 !== plan?.planSha256) {
    failures.push("Snapshot plan SHA-256 does not match the reviewed dry-run.");
  }
  if (options.expectedUserCount !== plan?.usersPlanned) {
    failures.push("Snapshot user count does not match the reviewed dry-run.");
  }
  return failures;
}

export async function executePlatformIdentitySnapshot(options = {}) {
  const config = options.config || readConfig();
  if (!config.url || !config.serviceRoleKey) {
    return { ok: false, status: 500, reason: "Supabase server configuration is required." };
  }
  if (!["staging", "production"].includes(options.target) || !options.projectRef) {
    return { ok: false, status: 400, reason: "A validated staging or production environment is required." };
  }
  const environmentFailures = validateEnvironmentTarget(options, config);
  if (environmentFailures.length) return { ok: false, status: 400, failures: environmentFailures };

  const authUsers = await listAuthUsersForBackfill({
    config,
    fetchImpl: options.fetchImpl,
    limit: options.backfill?.limit,
    maxPages: options.backfill?.maxPages,
  });
  if (!authUsers.ok) {
    return { ok: false, status: authUsers.status || 500, reason: "Auth user scope could not be loaded." };
  }
  const userIds = authUsers.users.map((user) => normalizeText(user.id, 120)).filter(Boolean);
  const backfill = await executePlatformIdentityBackfill({
    ...options.backfill,
    apply: false,
    userIds,
    config,
    fetchImpl: options.fetchImpl,
  });
  if (!backfill.ok) {
    return { ok: false, status: backfill.status || 500, reason: "Reviewed identity plan could not be reproduced." };
  }

  const guardFailures = validateCaptureGuards(options, backfill.plan);
  if (guardFailures.length) return { ok: false, status: 409, failures: guardFailures };
  const links = (options.backfill?.links || []).map(parseLink).filter(Boolean);
  const createdAt = (options.now || (() => new Date()))().toISOString();
  const snapshot = await buildPlatformIdentitySnapshot({
    config,
    fetchImpl: options.fetchImpl,
    target: options.target,
    projectRef: options.projectRef,
    planSha256: backfill.plan.planSha256,
    userCount: backfill.plan.usersPlanned,
    createdAt,
    organizationId: options.backfill?.organization?.id,
    clubId: options.backfill?.club?.id,
    teamId: options.backfill?.team?.id,
    userIds,
    links,
    scope: {
      organizationId: options.backfill?.organization?.id,
      clubId: options.backfill?.club?.id,
      teamId: options.backfill?.team?.id,
      userIds,
      links,
    },
  });
  if (!snapshot.ok) return snapshot;

  const summary = createPlatformIdentitySnapshotSummary(snapshot);
  if (!options.capture) {
    return { ...summary, dryRun: true, stored: false };
  }
  const stored = await storePlatformIdentitySnapshot({ snapshot, config, fetchImpl: options.fetchImpl });
  if (!stored.ok) return stored;
  return {
    ...summary,
    dryRun: false,
    stored: true,
    storage: {
      bucket: stored.bucket,
      path: stored.path,
      contentSha256: stored.contentSha256,
      readAfterWriteVerified: stored.readAfterWriteVerified,
    },
  };
}

async function main() {
  const options = parseSnapshotArgs();
  const result = await executePlatformIdentitySnapshot(options);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.message || "Platform Identity snapshot failed.");
    process.exitCode = 1;
  });
}
