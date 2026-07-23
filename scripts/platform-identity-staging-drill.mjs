#!/usr/bin/env node
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  buildTenantBootstrapBody,
  executePlatformIdentityBackfill,
  listAuthUsersForBackfill,
  parseBackfillArgs,
} from "./platform-identity-backfill.mjs";
import { loadPlatformIdentitySnapshot } from "./lib/platform-identity-snapshot-io.mjs";
import {
  PLATFORM_IDENTITY_STAGING_DRILL_CONFIRMATION,
  executePlatformIdentityStagingDrill,
} from "./lib/platform-identity-migration-operator.mjs";
import { verifyPlatformIdentityBackfillEnvironment } from "./verify-platform-identity-backfill-env.mjs";

const require = createRequire(import.meta.url);
const { readConfig } = require("../api/_lib/supabase-admin.js");

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{8,120}$/;

function normalizeText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function flagValue(argv, name) {
  const prefix = `${name}=`;
  const index = argv.findIndex((value) => value === name || value.startsWith(prefix));
  if (index < 0) return "";
  return argv[index].startsWith(prefix)
    ? argv[index].slice(prefix.length)
    : argv[index + 1] || "";
}

function validIsoTimestamp(value) {
  const normalized = normalizeText(value, 80);
  return normalized && !Number.isNaN(Date.parse(normalized))
    ? new Date(normalized).toISOString()
    : "";
}

function sortedUserIds(users = []) {
  return users
    .map((user) => normalizeText(user?.id, 120))
    .filter(Boolean)
    .sort();
}

export function parsePlatformIdentityStagingDrillArgs(
  argv = process.argv.slice(2),
  env = process.env
) {
  const backfill = parseBackfillArgs(argv);
  return {
    apply: argv.includes("--apply"),
    confirm: normalizeText(flagValue(argv, "--confirm"), 80),
    json: argv.includes("--json"),
    help: argv.includes("--help") || argv.includes("-h"),
    target: normalizeText(env.PLATFORM_BACKFILL_TARGET, 40).toLowerCase(),
    projectRef: normalizeText(env.SUPABASE_PROJECT_REF, 80).toLowerCase(),
    snapshotPath: normalizeText(flagValue(argv, "--snapshot-path"), 900),
    expectedSnapshotSha256: normalizeText(
      flagValue(argv, "--expected-snapshot-sha256"),
      64
    ).toLowerCase(),
    expectedBundleSha256: normalizeText(
      flagValue(argv, "--expected-bundle-sha256"),
      64
    ).toLowerCase(),
    requestId: normalizeText(flagValue(argv, "--request-id"), 120),
    createdAt: validIsoTimestamp(flagValue(argv, "--migration-created-at")),
    rollbackCreatedAt: validIsoTimestamp(
      flagValue(argv, "--rollback-created-at")
    ),
    expectedPlanSha256: normalizeText(backfill.expectedPlanSha256, 64),
    expectedUserCount: backfill.expectedUserCount,
    backfill: {
      ...backfill,
      apply: false,
      confirm: "",
    },
    env,
  };
}

function validateCommandOptions(options, config) {
  const failures = [];
  const environment = verifyPlatformIdentityBackfillEnvironment(options.env);
  if (!environment.ok) failures.push(...environment.failures);
  if (options.target !== "staging") {
    failures.push("Platform Identity migration drill is staging-only.");
  }
  if (options.projectRef !== environment.projectRef) {
    failures.push("Staging project ref does not match the verified environment.");
  }
  let urlProjectRef = "";
  try {
    urlProjectRef = new URL(config?.url).hostname.split(".", 1)[0];
  } catch {
    failures.push("Supabase URL is invalid.");
  }
  if (urlProjectRef !== options.projectRef) {
    failures.push("Supabase URL and staging project ref do not match.");
  }
  if (!normalizeText(config?.serviceRoleKey, 2_000)) {
    failures.push("Supabase server configuration is required.");
  }
  if (!options.snapshotPath) failures.push("Snapshot path is required.");
  if (!SHA256_PATTERN.test(options.expectedSnapshotSha256)) {
    failures.push("Reviewed snapshot SHA-256 is required.");
  }
  if (!SHA256_PATTERN.test(options.expectedPlanSha256)) {
    failures.push("Reviewed plan SHA-256 is required.");
  }
  if (!Number.isSafeInteger(options.expectedUserCount) || options.expectedUserCount < 1) {
    failures.push("Reviewed user count is required.");
  }
  if (!REQUEST_ID_PATTERN.test(options.requestId)) {
    failures.push("Stable migration request id is required.");
  }
  if (!options.createdAt || !options.rollbackCreatedAt) {
    failures.push("Stable migration and rollback timestamps are required.");
  } else if (Date.parse(options.rollbackCreatedAt) <= Date.parse(options.createdAt)) {
    failures.push("Rollback timestamp must be later than migration timestamp.");
  }
  if (
    options.apply &&
    options.confirm !== PLATFORM_IDENTITY_STAGING_DRILL_CONFIRMATION
  ) {
    failures.push("Exact staging drill confirmation is required.");
  }
  if (options.apply && !SHA256_PATTERN.test(options.expectedBundleSha256)) {
    failures.push("Reviewed bundle SHA-256 is required.");
  }
  return failures;
}

function verifyReviewedState(options, snapshot, authUsers, backfill) {
  const failures = [];
  const currentIds = sortedUserIds(authUsers);
  const snapshotIds = [...(snapshot.scope?.userIds || [])].sort();
  if (
    snapshot.projectRef !== options.projectRef ||
    snapshot.plan?.planSha256 !== options.expectedPlanSha256 ||
    snapshot.plan?.userCount !== options.expectedUserCount
  ) {
    failures.push("Stored snapshot does not match the reviewed plan.");
  }
  if (
    backfill.plan?.planSha256 !== options.expectedPlanSha256 ||
    backfill.plan?.usersPlanned !== options.expectedUserCount
  ) {
    failures.push("Current auth-derived plan does not match the reviewed plan.");
  }
  if (
    currentIds.length !== snapshotIds.length ||
    currentIds.some((id, index) => id !== snapshotIds[index])
  ) {
    failures.push("Auth user scope changed after snapshot capture.");
  }
  return failures;
}

export async function executePlatformIdentityStagingDrillCommand(
  options = {},
  dependencies = {}
) {
  const config = options.config || dependencies.readConfig?.() || readConfig();
  const failures = validateCommandOptions(options, config);
  if (failures.length) {
    return { ok: false, dryRun: !options.apply, failures, piiExposed: false };
  }
  const loadSnapshot =
    dependencies.loadSnapshot || loadPlatformIdentitySnapshot;
  const listUsers =
    dependencies.listUsers || listAuthUsersForBackfill;
  const executeBackfill =
    dependencies.executeBackfill || executePlatformIdentityBackfill;
  const executeDrill =
    dependencies.executeDrill || executePlatformIdentityStagingDrill;
  const snapshotResult = await loadSnapshot({
    path: options.snapshotPath,
    expectedContentSha256: options.expectedSnapshotSha256,
    config,
    fetchImpl: options.fetchImpl,
  });
  if (!snapshotResult.ok) {
    return {
      ok: false,
      dryRun: !options.apply,
      failures: [snapshotResult.reason || "Verified snapshot could not be loaded."],
      piiExposed: false,
    };
  }
  const usersResult = await listUsers({
    config,
    fetchImpl: options.fetchImpl,
    limit: options.backfill.limit,
    maxPages: options.backfill.maxPages,
  });
  if (!usersResult.ok) {
    return {
      ok: false,
      dryRun: !options.apply,
      failures: ["Current auth user scope could not be verified."],
      piiExposed: false,
    };
  }
  const userIds = sortedUserIds(usersResult.users);
  const backfill = await executeBackfill({
    ...options.backfill,
    apply: false,
    userIds,
    readOnlyAuthUsers: usersResult.users,
    config,
    fetchImpl: options.fetchImpl,
  });
  if (!backfill.ok) {
    return {
      ok: false,
      dryRun: !options.apply,
      failures: ["Current auth-derived plan could not be reproduced."],
      piiExposed: false,
    };
  }
  const reviewedFailures = verifyReviewedState(
    options,
    snapshotResult.snapshot,
    usersResult.users,
    backfill
  );
  if (reviewedFailures.length) {
    return {
      ok: false,
      dryRun: !options.apply,
      failures: reviewedFailures,
      piiExposed: false,
    };
  }
  const entries = usersResult.users.map((user) =>
    buildTenantBootstrapBody(user, { ...options.backfill, apply: false })
  );
  return executeDrill({
    ...options,
    config,
    snapshot: snapshotResult.snapshot,
    entries,
  });
}

function printHelp() {
  console.log(`Platform Identity staging migration drill

Dry-run is the default. It creates a deterministic, PII-free bundle summary.
Apply always rolls the reviewed bundle back and verifies the original baseline.

Required:
  --snapshot-path <private-object-path>
  --expected-snapshot-sha256 <sha256>
  --expected-plan-sha256 <sha256>
  --expected-user-count <count>
  --request-id <stable-id>
  --migration-created-at <ISO timestamp>
  --rollback-created-at <later ISO timestamp>

Apply additionally requires:
  --apply
  --confirm=${PLATFORM_IDENTITY_STAGING_DRILL_CONFIRMATION}
  --expected-bundle-sha256 <sha256>
`);
}

async function main() {
  const options = parsePlatformIdentityStagingDrillArgs();
  if (options.help) {
    printHelp();
    return;
  }
  const result = await executePlatformIdentityStagingDrillCommand(options);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.message || "Platform Identity staging drill failed.");
    process.exitCode = 1;
  });
}
