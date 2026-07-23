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
  storeSessionPlannerCanaryRecoveryPackage,
} from "./lib/session-planner-canary-recovery-storage.mjs";
import {
  SESSION_PLANNER_STAGING_CANARY_CONFIRMATION,
  SESSION_PLANNER_STAGING_CANARY_SCHEMA,
  parseSessionPlannerStagingCanaryArgs,
  validateSessionPlannerStagingCanaryOptions,
} from "./lib/session-planner-staging-canary-options.mjs";
import {
  recoverSessionPlannerCanaryBaseline,
} from "./lib/session-planner-staging-canary-recovery.mjs";

const require = createRequire(import.meta.url);
const { readConfig } = require("../api/_lib/supabase-admin.js");
const {
  SESSION_PLANNER_CANARY_MARKER_KEY,
  createSessionPlannerCanaryRecoveryPackage,
  createSessionPlannerCanaryRecoverySummary,
  hashText,
} = require("../api/_lib/session-planner-canary-recovery.js");

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

function createCanaryValue(baselineValue, options, primaryUserId, peerUserId) {
  const state = JSON.parse(baselineValue);
  state[SESSION_PLANNER_CANARY_MARKER_KEY] = {
    schema: SESSION_PLANNER_STAGING_CANARY_SCHEMA,
    requestId: options.requestId,
    createdAt: new Date(options.recoveryCreatedAt).toISOString(),
    primaryUserSha256: hashText(primaryUserId),
    peerUserSha256: hashText(peerUserId),
  };
  return JSON.stringify(state);
}

function checkpointsMatch(left, right) {
  return (
    left.ok === true &&
    right.ok === true &&
    left.revision === right.revision &&
    left.hash === right.hash &&
    left.value === right.value
  );
}

export async function executeSessionPlannerStagingCanary(
  options = {},
  injected = {}
) {
  const failures = validateSessionPlannerStagingCanaryOptions(options);
  if (failures.length) {
    throw new TypeError(
      `Session Planner staging canary blocked: ${failures.join(", ")}.`
    );
  }
  const dependencies = {
    readAppProject: injected.readAppProject || readSessionPlannerCanaryAppProject,
    login: injected.login || loginSessionPlannerCanaryUser,
    readState: injected.readState || readSessionPlannerCanaryState,
    writeState: injected.writeState || writeSessionPlannerCanaryState,
    storeRecovery:
      injected.storeRecovery || storeSessionPlannerCanaryRecoveryPackage,
  };
  const config = injected.config || readConfig();
  if (
    !config.url ||
    !config.serviceRoleKey ||
    projectRefFromConfig(config) !== options.expectedProjectRef
  ) {
    throw new Error("Session Planner canary Supabase configuration is not staging-bound.");
  }
  const appProject = await dependencies.readAppProject({
    appOrigin: options.appOrigin,
  });
  if (!appProject.ok || appProject.projectRef !== options.expectedProjectRef) {
    throw new Error("Session Planner canary app is not connected to the reviewed staging project.");
  }

  const primary = await dependencies.login({
    appOrigin: options.appOrigin,
    username: options.primaryUsername,
    password: options.primaryPassword,
  });
  const peer = await dependencies.login({
    appOrigin: options.appOrigin,
    username: options.peerUsername,
    password: options.peerPassword,
  });
  if (!primary.ok || !peer.ok || primary.userId === peer.userId) {
    throw new Error("Session Planner canary requires two authenticated staging users.");
  }
  const baseline = await dependencies.readState({
    appOrigin: options.appOrigin,
    accessToken: primary.accessToken,
  });
  const peerBaseline = await dependencies.readState({
    appOrigin: options.appOrigin,
    accessToken: peer.accessToken,
  });
  if (!checkpointsMatch(baseline, peerBaseline)) {
    throw new Error("Session Planner staging users do not share the same source checkpoint.");
  }
  if (
    baseline.revision !== options.expectedSourceRevision ||
    baseline.hash !== options.expectedSourceHash
  ) {
    throw new Error("Session Planner source changed after canary review.");
  }

  const canaryValue = createCanaryValue(
    baseline.value,
    options,
    primary.userId,
    peer.userId
  );
  const canaryHash = hashText(canaryValue);
  const recoveryPackage = createSessionPlannerCanaryRecoveryPackage({
    target: "staging",
    projectRef: options.expectedProjectRef,
    canonicalProductionProjectRef: options.canonicalProductionProjectRef,
    appOrigin: options.appOrigin,
    canonicalProductionAppOrigin: options.canonicalProductionAppOrigin,
    primaryUserId: primary.userId,
    peerUserId: peer.userId,
    requestId: options.requestId,
    createdAt: options.recoveryCreatedAt,
    baselineRevision: baseline.revision,
    baselineHash: baseline.hash,
    baselineValue: baseline.value,
    canaryHash,
    canaryValue,
  });
  if (!recoveryPackage.ok) {
    throw new Error("Session Planner canary recovery package is invalid.");
  }
  const recoverySummary =
    createSessionPlannerCanaryRecoverySummary(recoveryPackage);
  const baseReport = {
    schema: SESSION_PLANNER_STAGING_CANARY_SCHEMA,
    target: "staging",
    projectRef: options.expectedProjectRef,
    appOrigin: options.appOrigin,
    mode: options.apply ? "canary" : "dry-run",
    source: { revision: baseline.revision, hash: baseline.hash },
    users: { authenticated: 2, distinct: true },
    recoveryPackage: recoverySummary,
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
  if (recoveryPackage.integrity.contentSha256 !== options.expectedRecoverySha256) {
    throw new Error("Session Planner canary recovery package changed after review.");
  }
  const stored = await dependencies.storeRecovery({
    recoveryPackage,
    config,
  });
  if (
    !stored?.ok ||
    stored.readAfterWriteVerified !== true ||
    stored.contentSha256 !== recoveryPackage.integrity.contentSha256
  ) {
    throw new Error("Session Planner canary recovery package was not stored and verified.");
  }
  const recoveryReceipt = {
    bucket: stored.bucket,
    path: stored.path,
    contentSha256: stored.contentSha256,
    readAfterWriteVerified: true,
    containsCoachingContent: false,
  };
  if (injected.onCheckpoint) await injected.onCheckpoint(recoveryReceipt);

  const recoveryContext = {
    appOrigin: options.appOrigin,
    accessToken: primary.accessToken,
    baseline,
    canaryMarkerHash: recoveryPackage.canary.markerHash,
  };
  let writeAttempted = false;
  let lastRecovery = null;
  try {
    writeAttempted = true;
    const canaryWrite = await dependencies.writeState({
      appOrigin: options.appOrigin,
      accessToken: primary.accessToken,
      value: canaryValue,
      baseRevision: baseline.revision,
      baseHash: baseline.hash,
    });
    if (
      !canaryWrite.ok ||
      canaryWrite.revision !== baseline.revision + 1 ||
      canaryWrite.hash !== canaryHash ||
      canaryWrite.value !== canaryValue
    ) {
      throw new Error("Session Planner canary write did not produce the reviewed checkpoint.");
    }
    const peerCanary = await dependencies.readState({
      appOrigin: options.appOrigin,
      accessToken: peer.accessToken,
    });
    if (
      !peerCanary.ok ||
      peerCanary.revision !== canaryWrite.revision ||
      peerCanary.hash !== canaryHash ||
      peerCanary.value !== canaryValue
    ) {
      throw new Error("Session Planner peer did not receive the fresh canary checkpoint.");
    }
    const staleWrite = await dependencies.writeState({
      appOrigin: options.appOrigin,
      accessToken: peer.accessToken,
      value: baseline.value,
      baseRevision: baseline.revision,
      baseHash: baseline.hash,
    });
    if (staleWrite.ok || staleWrite.status !== 409 || staleWrite.conflict !== true) {
      throw new Error("Session Planner stale peer write was not rejected.");
    }
    lastRecovery = await recoverSessionPlannerCanaryBaseline(
      recoveryContext,
      dependencies
    );
    if (!lastRecovery.ok || !lastRecovery.exactBaselineRestored) {
      throw new Error(
        `Session Planner canary rollback failed: ${lastRecovery.reasonCode}.`
      );
    }
    const peerRestored = await dependencies.readState({
      appOrigin: options.appOrigin,
      accessToken: peer.accessToken,
    });
    if (
      !peerRestored.ok ||
      peerRestored.hash !== baseline.hash ||
      peerRestored.value !== baseline.value ||
      peerRestored.revision !== lastRecovery.revision
    ) {
      throw new Error("Session Planner peer did not receive the restored checkpoint.");
    }
    return Object.freeze({
      ok: true,
      ready: true,
      ...baseReport,
      recoveryPackageReceipt: recoveryReceipt,
      canaryWrite: {
        revision: canaryWrite.revision,
        hash: canaryWrite.hash,
      },
      peerFreshReadVerified: true,
      staleWriteRejected: true,
      rollback: {
        verified: true,
        revision: lastRecovery.revision,
        hash: baseline.hash,
      },
    });
  } catch (error) {
    const failure =
      error instanceof Error
        ? error
        : new Error("Session Planner staging canary failed.");
    if (writeAttempted) {
      const recovery =
        lastRecovery ||
        await recoverSessionPlannerCanaryBaseline(
          recoveryContext,
          dependencies
        );
      failure.recovery = recovery;
      failure.recoveryReceipt = recoveryReceipt;
    }
    throw failure;
  }
}

export {
  SESSION_PLANNER_STAGING_CANARY_CONFIRMATION,
  SESSION_PLANNER_STAGING_CANARY_SCHEMA,
  parseSessionPlannerStagingCanaryArgs,
};

function printHelp() {
  console.log(`Session Planner staging multi-user canary

Dry-run requires staging and production app/project identities, two staging QA
accounts, and the exact reviewed Session Planner source revision and hash.
Credentials are read from STAGING_QA_* environment variables only.

Write execution additionally requires:
  --apply
  --confirm=${SESSION_PLANNER_STAGING_CANARY_CONFIRMATION}
  --expected-recovery-sha256 <reviewed-sha256>

The canary stores and rereads a private recovery package before any app-state
write. It never targets production and public output contains no coaching data.
`);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const options = parseSessionPlannerStagingCanaryArgs();
  if (options.help) {
    printHelp();
  } else {
    executeSessionPlannerStagingCanary(options, {
      onCheckpoint: async (receipt) => {
        console.error(`Session Planner canary recovery checkpoint: ${JSON.stringify(receipt)}`);
      },
    })
      .then((report) => {
        console.log(JSON.stringify(report, null, options.json ? 2 : 0));
      })
      .catch((error) => {
        if (error.recoveryReceipt) {
          console.error(
            `Session Planner canary recovery receipt: ${JSON.stringify(error.recoveryReceipt)}`
          );
        }
        if (error.recovery) {
          console.error(
            `Session Planner canary automatic recovery: ${JSON.stringify(error.recovery)}`
          );
        }
        console.error(`Session Planner staging canary failed: ${error.message}`);
        process.exitCode = 1;
      });
  }
}
