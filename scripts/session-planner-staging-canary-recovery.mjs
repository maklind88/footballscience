#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  loginSessionPlannerCanaryUser,
  readSessionPlannerCanaryAppProject,
  readSessionPlannerCanaryState,
  writeSessionPlannerCanaryState,
} from "./lib/session-planner-staging-canary-client.mjs";
import {
  loadSessionPlannerCanaryRecoveryPackage,
} from "./lib/session-planner-canary-recovery-storage.mjs";
import {
  inspectSessionPlannerCanaryRecoveryState,
  recoverSessionPlannerCanaryBaseline,
} from "./lib/session-planner-staging-canary-recovery.mjs";

const require = createRequire(import.meta.url);
const { readConfig } = require("../api/_lib/supabase-admin.js");

export const SESSION_PLANNER_STAGING_CANARY_RECOVERY_SCHEMA =
  "footballscience-session-planner-staging-canary-recovery-run-v1";
export const SESSION_PLANNER_STAGING_CANARY_RECOVERY_CONFIRMATION =
  "RECOVER_SESSION_PLANNER_STAGING_CANARY";
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;

function normalizeText(value, maxLength = 900) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeOrigin(value) {
  try {
    const url = new URL(normalizeText(value, 500));
    return url.protocol === "https:" && !url.username && !url.password
      ? url.origin.toLowerCase()
      : "";
  } catch {
    return "";
  }
}

function projectRefFromConfig(config = {}) {
  try {
    const hostname = new URL(String(config.url || "")).hostname.toLowerCase();
    return hostname.endsWith(".supabase.co")
      ? hostname.slice(0, -".supabase.co".length)
      : "";
  } catch {
    return "";
  }
}

function flagValue(argv, index) {
  const equalsIndex = argv[index].indexOf("=");
  return equalsIndex === -1
    ? { value: argv[index + 1], consumed: 1 }
    : { value: argv[index].slice(equalsIndex + 1), consumed: 0 };
}

export function parseSessionPlannerStagingCanaryRecoveryArgs(
  argv = process.argv.slice(2),
  env = process.env
) {
  const options = {
    apply: false,
    help: false,
    json: false,
    target: normalizeText(env.SESSION_PLANNER_CANARY_TARGET, 40).toLowerCase(),
    appOrigin: normalizeOrigin(env.STAGING_QA_BASE_URL),
    canonicalProductionAppOrigin: normalizeOrigin(
      env.LIVE_QA_BASE_URL || "https://footballscience.xyz"
    ),
    expectedProjectRef: normalizeText(
      env.STAGING_SUPABASE_PROJECT_REF ||
        env.SESSION_PLANNER_EXPECTED_PROJECT_REF,
      80
    ).toLowerCase(),
    canonicalProductionProjectRef: normalizeText(
      env.CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF ||
        env.SUPABASE_PROJECT_REF,
      80
    ).toLowerCase(),
    username: normalizeText(env.STAGING_QA_USERNAME, 180),
    password: normalizeText(env.STAGING_QA_PASSWORD, 256),
    recoveryPath: normalizeText(
      env.SESSION_PLANNER_CANARY_RECOVERY_PATH,
      900
    ),
    expectedRecoverySha256: normalizeText(
      env.SESSION_PLANNER_CANARY_EXPECTED_RECOVERY_SHA256,
      64
    ).toLowerCase(),
    confirm: "",
  };
  const supported = new Set([
    "--target",
    "--app-origin",
    "--canonical-production-app-origin",
    "--expected-project-ref",
    "--canonical-production-project-ref",
    "--recovery-path",
    "--expected-recovery-sha256",
    "--confirm",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    const flag = arg.split("=", 1)[0];
    if (!supported.has(flag)) {
      throw new TypeError(`Unknown Session Planner canary recovery option: ${flag}`);
    }
    const parsed = flagValue(argv, index);
    index += parsed.consumed;
    if (flag === "--target") options.target = normalizeText(parsed.value, 40).toLowerCase();
    if (flag === "--app-origin") options.appOrigin = normalizeOrigin(parsed.value);
    if (flag === "--canonical-production-app-origin") {
      options.canonicalProductionAppOrigin = normalizeOrigin(parsed.value);
    }
    if (flag === "--expected-project-ref") {
      options.expectedProjectRef = normalizeText(parsed.value, 80).toLowerCase();
    }
    if (flag === "--canonical-production-project-ref") {
      options.canonicalProductionProjectRef =
        normalizeText(parsed.value, 80).toLowerCase();
    }
    if (flag === "--recovery-path") {
      options.recoveryPath = normalizeText(parsed.value, 900);
    }
    if (flag === "--expected-recovery-sha256") {
      options.expectedRecoverySha256 =
        normalizeText(parsed.value, 64).toLowerCase();
    }
    if (flag === "--confirm") options.confirm = normalizeText(parsed.value, 80);
  }
  return options;
}

function validateOptions(options = {}) {
  const failures = [];
  if (options.target !== "staging") failures.push("target must be staging");
  if (!options.appOrigin) failures.push("staging app origin is required");
  if (
    !options.canonicalProductionAppOrigin ||
    options.appOrigin === options.canonicalProductionAppOrigin
  ) {
    failures.push("staging app must differ from production");
  }
  if (!PROJECT_REF_PATTERN.test(options.expectedProjectRef || "")) {
    failures.push("staging project ref is required");
  }
  if (
    !PROJECT_REF_PATTERN.test(options.canonicalProductionProjectRef || "") ||
    options.expectedProjectRef === options.canonicalProductionProjectRef
  ) {
    failures.push("staging project must differ from production");
  }
  if (!options.username || !options.password) {
    failures.push("primary staging credentials are required");
  }
  if (
    !options.recoveryPath.startsWith(
      `backups/session-planner-canary/staging/${options.expectedProjectRef}/`
    )
  ) {
    failures.push("a project-bound private recovery path is required");
  }
  if (!HASH_PATTERN.test(options.expectedRecoverySha256 || "")) {
    failures.push("the exact recovery package SHA-256 is required");
  }
  if (
    options.apply &&
    options.confirm !== SESSION_PLANNER_STAGING_CANARY_RECOVERY_CONFIRMATION
  ) {
    failures.push("the recovery confirmation is invalid");
  }
  return failures;
}

export async function executeSessionPlannerStagingCanaryRecovery(
  options = {},
  injected = {}
) {
  const failures = validateOptions(options);
  if (failures.length) {
    throw new TypeError(
      `Session Planner canary recovery blocked: ${failures.join(", ")}.`
    );
  }
  const dependencies = {
    readAppProject:
      injected.readAppProject || readSessionPlannerCanaryAppProject,
    login: injected.login || loginSessionPlannerCanaryUser,
    readState: injected.readState || readSessionPlannerCanaryState,
    writeState: injected.writeState || writeSessionPlannerCanaryState,
    loadRecovery:
      injected.loadRecovery || loadSessionPlannerCanaryRecoveryPackage,
  };
  const config = injected.config || readConfig();
  if (
    !config.url ||
    !config.serviceRoleKey ||
    projectRefFromConfig(config) !== options.expectedProjectRef
  ) {
    throw new Error("Session Planner canary recovery is not staging-bound.");
  }
  const appProject = await dependencies.readAppProject({
    appOrigin: options.appOrigin,
  });
  if (!appProject.ok || appProject.projectRef !== options.expectedProjectRef) {
    throw new Error("Session Planner recovery app project mismatch.");
  }
  const loaded = await dependencies.loadRecovery({
    path: options.recoveryPath,
    expectedContentSha256: options.expectedRecoverySha256,
    expectedProjectRef: options.expectedProjectRef,
    config,
  });
  if (!loaded?.ok) {
    throw new Error("Session Planner private recovery package could not be verified.");
  }
  const recoveryPackage = loaded.privateRecoveryPackage;
  if (
    recoveryPackage.target !== "staging" ||
    recoveryPackage.projectRef !== options.expectedProjectRef ||
    recoveryPackage.canonicalProductionProjectRef !==
      options.canonicalProductionProjectRef ||
    recoveryPackage.appOrigin !== options.appOrigin ||
    recoveryPackage.canonicalProductionAppOrigin !==
      options.canonicalProductionAppOrigin
  ) {
    throw new Error("Session Planner recovery package context mismatch.");
  }
  const primary = await dependencies.login({
    appOrigin: options.appOrigin,
    username: options.username,
    password: options.password,
  });
  if (
    !primary.ok ||
    primary.userId !== recoveryPackage.actors?.primaryUserId
  ) {
    throw new Error("Session Planner recovery requires the original staging actor.");
  }
  const current = await dependencies.readState({
    appOrigin: options.appOrigin,
    accessToken: primary.accessToken,
  });
  const inspection = inspectSessionPlannerCanaryRecoveryState(
    current,
    recoveryPackage.baseline,
    recoveryPackage.canary.markerHash
  );
  if (!inspection.ok) {
    throw new Error(
      `Session Planner recovery inspection failed: ${inspection.reasonCode}.`
    );
  }
  const baseReport = {
    schema: SESSION_PLANNER_STAGING_CANARY_RECOVERY_SCHEMA,
    target: "staging",
    projectRef: options.expectedProjectRef,
    appOrigin: options.appOrigin,
    mode: options.apply ? "recovery" : "dry-run",
    recoveryPackageReceipt: loaded.receipt,
    recoveryRequired: inspection.requiresWrite,
    exactBaselinePresent: inspection.exactBaselineRestored,
    concurrentStatePreserved: inspection.concurrentStatePreserved,
    containsCoachingContent: false,
  };
  if (!options.apply) {
    return Object.freeze({
      ok: true,
      ready: true,
      writeCapability: false,
      ...baseReport,
    });
  }
  const recovery = await recoverSessionPlannerCanaryBaseline(
    {
      appOrigin: options.appOrigin,
      accessToken: primary.accessToken,
      baseline: recoveryPackage.baseline,
      canaryMarkerHash: recoveryPackage.canary.markerHash,
    },
    dependencies
  );
  if (!recovery.ok) {
    const error = new Error(
      `Session Planner canary recovery failed: ${recovery.reasonCode}.`
    );
    error.recovery = recovery;
    error.recoveryReceipt = loaded.receipt;
    throw error;
  }
  return Object.freeze({
    ok: true,
    ready: true,
    ...baseReport,
    recovery: {
      verified: true,
      exactBaselineRestored: recovery.exactBaselineRestored,
      concurrentStatePreserved: recovery.concurrentStatePreserved,
      revision: recovery.revision,
      reasonCode: recovery.reasonCode,
    },
  });
}

function printHelp() {
  console.log(`Session Planner staging canary recovery

Dry-run verifies the private recovery package and current staging state.
Write recovery additionally requires:
  --apply
  --confirm=${SESSION_PLANNER_STAGING_CANARY_RECOVERY_CONFIRMATION}

Credentials are read from STAGING_QA_* environment variables only. The command
cannot target production and public output contains no coaching content.
`);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const options = parseSessionPlannerStagingCanaryRecoveryArgs();
    if (options.help) {
      printHelp();
    } else {
      executeSessionPlannerStagingCanaryRecovery(options)
        .then((report) => console.log(JSON.stringify(report, null, options.json ? 2 : 0)))
        .catch((error) => {
          if (error.recoveryReceipt) {
            console.error(
              `Session Planner canary recovery receipt: ${JSON.stringify(error.recoveryReceipt)}`
            );
          }
          if (error.recovery) {
            console.error(
              `Session Planner canary recovery status: ${JSON.stringify(error.recovery)}`
            );
          }
          console.error(`Session Planner staging canary recovery failed: ${error.message}`);
          process.exitCode = 1;
        });
    }
  } catch (error) {
    console.error(`Session Planner staging canary recovery blocked: ${error.message}`);
    process.exitCode = 1;
  }
}
