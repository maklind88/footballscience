import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import {
  executeSessionPlannerStagingCanaryRecovery,
  SESSION_PLANNER_STAGING_CANARY_RECOVERY_CONFIRMATION,
} from "../scripts/session-planner-staging-canary-recovery.mjs";

const require = createRequire(import.meta.url);
const {
  SESSION_PLANNER_CANARY_MARKER_KEY,
  createSessionPlannerCanaryRecoveryPackage,
  hashText,
} = require("../api/_lib/session-planner-canary-recovery.js");
const {
  SESSION_PLANNER_STAGING_CANARY_SCHEMA,
} = await import("../scripts/lib/session-planner-staging-canary-options.mjs");

const primaryUserId = "11111111-1111-4111-8111-111111111111";
const peerUserId = "22222222-2222-4222-8222-222222222222";
const createdAt = "2026-07-23T14:00:00.000Z";
const baselineValue = JSON.stringify({
  selectedDate: "2026-07-23",
  sessions: {
    "2026-07-23": {
      id: "session-2026-07-23",
      title: "Private training",
      blocks: [{ id: "block-1", title: "Private exercise" }],
    },
  },
});
const baseline = Object.freeze({
  ok: true,
  revision: 42,
  hash: hashText(baselineValue),
  value: baselineValue,
});

function recoveryPackage() {
  const canaryState = JSON.parse(baselineValue);
  canaryState[SESSION_PLANNER_CANARY_MARKER_KEY] = {
    schema: SESSION_PLANNER_STAGING_CANARY_SCHEMA,
    requestId: "session-planner-two-user-canary",
    createdAt,
    primaryUserSha256: hashText(primaryUserId),
    peerUserSha256: hashText(peerUserId),
  };
  const canaryValue = JSON.stringify(canaryState);
  return createSessionPlannerCanaryRecoveryPackage({
    target: "staging",
    projectRef: "staging-project",
    canonicalProductionProjectRef: "production-project",
    appOrigin: "https://staging.footballscience.xyz",
    canonicalProductionAppOrigin: "https://footballscience.xyz",
    primaryUserId,
    peerUserId,
    requestId: "session-planner-two-user-canary",
    createdAt,
    baselineRevision: baseline.revision,
    baselineHash: baseline.hash,
    baselineValue,
    canaryHash: hashText(canaryValue),
    canaryValue,
  });
}

function options({ apply = false, ...overrides } = {}) {
  const packageValue = recoveryPackage();
  return {
    apply,
    help: false,
    json: true,
    target: "staging",
    appOrigin: "https://staging.footballscience.xyz",
    canonicalProductionAppOrigin: "https://footballscience.xyz",
    expectedProjectRef: "staging-project",
    canonicalProductionProjectRef: "production-project",
    username: "primary@example.com",
    password: "primary-secret",
    recoveryPath:
      "backups/session-planner-canary/staging/staging-project/recovery.json",
    expectedRecoverySha256: packageValue.integrity.contentSha256,
    confirm: apply
      ? SESSION_PLANNER_STAGING_CANARY_RECOVERY_CONFIRMATION
      : "",
    ...overrides,
  };
}

function harness({
  currentValue = baselineValue,
  currentRevision = 42,
  userId = primaryUserId,
  appProjectRef = "staging-project",
  packageOverrides = {},
} = {}) {
  const packageValue = {
    ...recoveryPackage(),
    ...packageOverrides,
  };
  const events = [];
  let current = {
    ok: true,
    value: currentValue,
    revision: currentRevision,
    hash: hashText(currentValue),
  };
  let writeCount = 0;
  const dependencies = {
    config: {
      url: "https://staging-project.supabase.co",
      serviceRoleKey: "staging-service-key",
    },
    readAppProject: async () => {
      events.push("app-project");
      return { ok: true, projectRef: appProjectRef };
    },
    loadRecovery: async () => {
      events.push("load-recovery");
      return {
        ok: true,
        privateRecoveryPackage: packageValue,
        receipt: {
          bucket: "footballscience-app-state",
          path:
            "backups/session-planner-canary/staging/staging-project/recovery.json",
          contentSha256: packageValue.integrity.contentSha256,
          readVerified: true,
          containsCoachingContent: false,
        },
      };
    },
    login: async () => {
      events.push("login");
      return { ok: true, accessToken: "primary-token", userId };
    },
    readState: async () => {
      events.push("read");
      return { ...current };
    },
    writeState: async ({ value, baseRevision, baseHash }) => {
      events.push("write");
      writeCount += 1;
      if (baseRevision !== current.revision || baseHash !== current.hash) {
        return { ok: false, status: 409, conflict: true };
      }
      current = {
        ok: true,
        value,
        revision: current.revision + 1,
        hash: hashText(value),
      };
      return { ...current, status: 200 };
    },
  };
  return {
    dependencies,
    events,
    get current() {
      return current;
    },
    get writeCount() {
      return writeCount;
    },
  };
}

test("Session Planner canary recovery dry-run verifies exact baseline without writing", async () => {
  const testHarness = harness();
  const report = await executeSessionPlannerStagingCanaryRecovery(
    options(),
    testHarness.dependencies
  );

  expect(report).toMatchObject({
    ok: true,
    ready: true,
    mode: "dry-run",
    writeCapability: false,
    recoveryRequired: false,
    exactBaselinePresent: true,
    containsCoachingContent: false,
  });
  expect(testHarness.writeCount).toBe(0);
});

test("Session Planner canary recovery removes the reviewed marker and restores baseline", async () => {
  const packageValue = recoveryPackage();
  const testHarness = harness({
    currentValue: packageValue.canary.value,
    currentRevision: 43,
  });
  const report = await executeSessionPlannerStagingCanaryRecovery(
    options({ apply: true }),
    testHarness.dependencies
  );

  expect(report.recovery).toMatchObject({
    verified: true,
    exactBaselineRestored: true,
    concurrentStatePreserved: false,
    revision: 44,
  });
  expect(testHarness.current).toMatchObject({
    value: baselineValue,
    hash: baseline.hash,
    revision: 44,
  });
  expect(testHarness.writeCount).toBe(1);
});

test("Session Planner canary recovery preserves concurrent colleague content", async () => {
  const packageValue = recoveryPackage();
  const concurrentState = JSON.parse(packageValue.canary.value);
  concurrentState.colleagueUpdate = { recommendation: "Modified training" };
  const testHarness = harness({
    currentValue: JSON.stringify(concurrentState),
    currentRevision: 44,
  });
  const report = await executeSessionPlannerStagingCanaryRecovery(
    options({ apply: true }),
    testHarness.dependencies
  );

  expect(report.recovery).toMatchObject({
    verified: true,
    exactBaselineRestored: false,
    concurrentStatePreserved: true,
    revision: 45,
  });
  expect(testHarness.current.value).toContain("Modified training");
  expect(testHarness.current.value).not.toContain(
    SESSION_PLANNER_CANARY_MARKER_KEY
  );
  expect(testHarness.writeCount).toBe(1);
});

test("Session Planner canary recovery blocks project and actor mismatches before state writes", async () => {
  const wrongProject = harness({ appProjectRef: "other-project" });
  await expect(
    executeSessionPlannerStagingCanaryRecovery(
      options(),
      wrongProject.dependencies
    )
  ).rejects.toThrow("app project mismatch");
  expect(wrongProject.events).toEqual(["app-project"]);

  const wrongActor = harness({ userId: peerUserId });
  await expect(
    executeSessionPlannerStagingCanaryRecovery(
      options(),
      wrongActor.dependencies
    )
  ).rejects.toThrow("original staging actor");
  expect(wrongActor.events).toEqual([
    "app-project",
    "load-recovery",
    "login",
  ]);
  expect(wrongActor.writeCount).toBe(0);
});

test("Session Planner canary recovery rejects production before external calls", async () => {
  const testHarness = harness();
  await expect(
    executeSessionPlannerStagingCanaryRecovery(
      options({ appOrigin: "https://footballscience.xyz" }),
      testHarness.dependencies
    )
  ).rejects.toThrow("staging app must differ from production");
  expect(testHarness.events).toEqual([]);
});

test("Session Planner canary recovery public report exposes no content or credentials", async () => {
  const testHarness = harness();
  const report = await executeSessionPlannerStagingCanaryRecovery(
    options(),
    testHarness.dependencies
  );
  const output = JSON.stringify(report);

  expect(output).not.toContain("Private training");
  expect(output).not.toContain("Private exercise");
  expect(output).not.toContain("primary-secret");
  expect(output).not.toContain("primary-token");
  expect(output).not.toContain(primaryUserId);
  expect(output).not.toContain(peerUserId);
});
