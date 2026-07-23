import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import {
  executeSessionPlannerStagingCanary,
  parseSessionPlannerStagingCanaryArgs,
  SESSION_PLANNER_STAGING_CANARY_CONFIRMATION,
  SESSION_PLANNER_STAGING_CANARY_SCHEMA,
} from "../scripts/session-planner-staging-canary.mjs";
import {
  readSessionPlannerCanaryState,
  writeSessionPlannerCanaryState,
} from "../scripts/lib/session-planner-staging-canary-client.mjs";

const require = createRequire(import.meta.url);
const {
  SESSION_PLANNER_CANARY_MARKER_KEY,
  createSessionPlannerCanaryRecoveryPackage,
  hashText,
} = require("../api/_lib/session-planner-canary-recovery.js");

const primaryUserId = "11111111-1111-4111-8111-111111111111";
const peerUserId = "22222222-2222-4222-8222-222222222222";
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

function canaryValueFor(options) {
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

function reviewedRecoveryHash(options) {
  const canaryValue = canaryValueFor(options);
  const recoveryPackage = createSessionPlannerCanaryRecoveryPackage({
    target: "staging",
    projectRef: options.expectedProjectRef,
    canonicalProductionProjectRef: options.canonicalProductionProjectRef,
    appOrigin: options.appOrigin,
    canonicalProductionAppOrigin: options.canonicalProductionAppOrigin,
    primaryUserId,
    peerUserId,
    requestId: options.requestId,
    createdAt: options.recoveryCreatedAt,
    baselineRevision: baseline.revision,
    baselineHash: baseline.hash,
    baselineValue,
    canaryHash: hashText(canaryValue),
    canaryValue,
  });
  return recoveryPackage.integrity.contentSha256;
}

function options({ apply = false, ...overrides } = {}) {
  const result = {
    apply,
    help: false,
    json: true,
    target: "staging",
    appOrigin: "https://staging.footballscience.xyz",
    canonicalProductionAppOrigin: "https://footballscience.xyz",
    expectedProjectRef: "staging-project",
    canonicalProductionProjectRef: "production-project",
    primaryUsername: "primary@example.com",
    primaryPassword: "primary-secret",
    peerUsername: "peer@example.com",
    peerPassword: "peer-secret",
    expectedSourceRevision: baseline.revision,
    expectedSourceHash: baseline.hash,
    recoveryCreatedAt: "2026-07-23T14:00:00.000Z",
    requestId: "session-planner-two-user-canary",
    confirm: apply ? SESSION_PLANNER_STAGING_CANARY_CONFIRMATION : "",
    expectedRecoverySha256: "",
    ...overrides,
  };
  if (apply && !result.expectedRecoverySha256) {
    result.expectedRecoverySha256 = reviewedRecoveryHash(result);
  }
  return result;
}

function createHarness({
  readFailureAt = 0,
  driftOnReadFailure = false,
  firstWriteThrows = false,
  storageFails = false,
  appProjectRef = "staging-project",
} = {}) {
  const events = [];
  let current = { ...baseline };
  let readCount = 0;
  let writeCount = 0;

  const readState = async ({ accessToken }) => {
    readCount += 1;
    events.push(`read:${accessToken}:${readCount}`);
    if (readCount === readFailureAt) {
      if (driftOnReadFailure) {
        const driftValue = JSON.stringify({
          ...JSON.parse(current.value),
          concurrentColleagueUpdate: true,
        });
        current = {
          ok: true,
          revision: current.revision + 1,
          hash: hashText(driftValue),
          value: driftValue,
        };
      }
      return { ok: false, status: 503, reason: "Synthetic read failure." };
    }
    return { ...current };
  };

  const writeState = async ({
    accessToken,
    value,
    baseRevision,
    baseHash,
  }) => {
    writeCount += 1;
    events.push(`write:${accessToken}:${baseRevision}`);
    if (baseRevision !== current.revision || baseHash !== current.hash) {
      return {
        ok: false,
        status: 409,
        conflict: true,
        currentRevision: current.revision,
      };
    }
    current = {
      ok: true,
      revision: current.revision + 1,
      hash: hashText(value),
      value,
    };
    if (firstWriteThrows && writeCount === 1) {
      throw new Error("Synthetic response loss after persisted write.");
    }
    return { ...current, status: 200 };
  };

  const dependencies = {
    config: {
      url: "https://staging-project.supabase.co",
      serviceRoleKey: "staging-service-key",
    },
    readAppProject: async () => {
      events.push("app-project");
      return { ok: true, projectRef: appProjectRef };
    },
    login: async ({ username }) => {
      events.push(`login:${username}`);
      return username === "primary@example.com"
        ? { ok: true, accessToken: "primary-token", userId: primaryUserId }
        : { ok: true, accessToken: "peer-token", userId: peerUserId };
    },
    readState,
    writeState,
    storeRecovery: async ({ recoveryPackage }) => {
      events.push("store-recovery");
      if (storageFails) return { ok: false, status: 503 };
      return {
        ok: true,
        bucket: "footballscience-app-state",
        path: "backups/session-planner-canary/staging/staging-project/recovery.json",
        contentSha256: recoveryPackage.integrity.contentSha256,
        readAfterWriteVerified: true,
        containsCoachingContent: false,
      };
    },
    onCheckpoint: async () => events.push("checkpoint"),
  };
  return {
    dependencies,
    events,
    get current() {
      return current;
    },
    get readCount() {
      return readCount;
    },
    get writeCount() {
      return writeCount;
    },
  };
}

test("Session Planner staging canary dry-run authenticates two users without writes", async () => {
  const harness = createHarness();
  const report = await executeSessionPlannerStagingCanary(
    options(),
    harness.dependencies
  );

  expect(report).toMatchObject({
    ok: true,
    ready: true,
    mode: "dry-run",
    writeCapability: false,
    users: { authenticated: 2, distinct: true },
    containsCoachingContent: false,
  });
  expect(harness.writeCount).toBe(0);
  expect(harness.events).not.toContain("store-recovery");
  expect(harness.readCount).toBe(2);
});

test("Session Planner staging canary rejects production and project drift before data access", async () => {
  const productionOptions = options({
    appOrigin: "https://footballscience.xyz",
  });
  await expect(
    executeSessionPlannerStagingCanary(productionOptions, {})
  ).rejects.toThrow("staging app must differ from production");

  const harness = createHarness({ appProjectRef: "other-staging-project" });
  await expect(
    executeSessionPlannerStagingCanary(options(), harness.dependencies)
  ).rejects.toThrow("not connected to the reviewed staging project");
  expect(harness.events).toEqual(["app-project"]);
  expect(harness.readCount).toBe(0);
  expect(harness.writeCount).toBe(0);
});

test("Session Planner staging canary stores and verifies recovery before the first write", async () => {
  const harness = createHarness();
  const report = await executeSessionPlannerStagingCanary(
    options({ apply: true }),
    harness.dependencies
  );

  expect(report).toMatchObject({
    ok: true,
    mode: "canary",
    peerFreshReadVerified: true,
    staleWriteRejected: true,
    rollback: { verified: true, revision: 44, hash: baseline.hash },
  });
  expect(harness.current).toMatchObject({
    revision: 44,
    hash: baseline.hash,
    value: baseline.value,
  });
  const storedAt = harness.events.indexOf("store-recovery");
  const checkpointAt = harness.events.indexOf("checkpoint");
  const firstWriteAt = harness.events.findIndex((event) =>
    event.startsWith("write:")
  );
  expect(storedAt).toBeGreaterThan(-1);
  expect(checkpointAt).toBeGreaterThan(storedAt);
  expect(firstWriteAt).toBeGreaterThan(checkpointAt);
  expect(harness.writeCount).toBe(3);
});

test("Session Planner staging canary performs zero writes when recovery storage fails", async () => {
  const harness = createHarness({ storageFails: true });
  await expect(
    executeSessionPlannerStagingCanary(
      options({ apply: true }),
      harness.dependencies
    )
  ).rejects.toThrow("was not stored and verified");
  expect(harness.writeCount).toBe(0);
  expect(harness.current).toEqual(baseline);
});

test("Session Planner staging canary restores the exact baseline after peer read failure", async () => {
  const harness = createHarness({ readFailureAt: 3 });
  let failure;
  try {
    await executeSessionPlannerStagingCanary(
      options({ apply: true }),
      harness.dependencies
    );
  } catch (error) {
    failure = error;
  }

  expect(failure?.message).toContain("peer did not receive");
  expect(failure?.recovery).toMatchObject({
    ok: true,
    reasonCode: "recovery_verified",
    revision: 44,
  });
  expect(failure?.recoveryReceipt).toMatchObject({
    readAfterWriteVerified: true,
    containsCoachingContent: false,
  });
  expect(harness.current).toMatchObject({
    revision: 44,
    hash: baseline.hash,
    value: baseline.value,
  });
});

test("Session Planner staging canary recovers when the write persisted but its response was lost", async () => {
  const harness = createHarness({ firstWriteThrows: true });
  let failure;
  try {
    await executeSessionPlannerStagingCanary(
      options({ apply: true }),
      harness.dependencies
    );
  } catch (error) {
    failure = error;
  }

  expect(failure?.message).toContain("response loss");
  expect(failure?.recovery).toMatchObject({ ok: true, revision: 44 });
  expect(harness.current).toMatchObject({
    revision: 44,
    hash: baseline.hash,
    value: baseline.value,
  });
  expect(harness.writeCount).toBe(2);
});

test("Session Planner staging canary never overwrites concurrent colleague drift", async () => {
  const harness = createHarness({
    readFailureAt: 3,
    driftOnReadFailure: true,
  });
  let failure;
  try {
    await executeSessionPlannerStagingCanary(
      options({ apply: true }),
      harness.dependencies
    );
  } catch (error) {
    failure = error;
  }

  expect(failure?.recovery).toMatchObject({
    ok: true,
    reasonCode: "recovery_concurrent_state_preserved",
    concurrentStatePreserved: true,
    exactBaselineRestored: false,
  });
  expect(harness.current.value).toContain("concurrentColleagueUpdate");
  expect(harness.current.value).not.toContain(
    SESSION_PLANNER_CANARY_MARKER_KEY
  );
  expect(harness.writeCount).toBe(2);
});

test("Session Planner staging canary public reports contain no coaching content or secrets", async () => {
  const harness = createHarness();
  const report = await executeSessionPlannerStagingCanary(
    options({ apply: true }),
    harness.dependencies
  );
  const publicOutput = JSON.stringify(report);

  expect(publicOutput).not.toContain("Private training");
  expect(publicOutput).not.toContain("Private exercise");
  expect(publicOutput).not.toContain("primary-secret");
  expect(publicOutput).not.toContain("peer-secret");
  expect(publicOutput).not.toContain("primary-token");
  expect(publicOutput).not.toContain("peer-token");
  expect(publicOutput).not.toContain(primaryUserId);
  expect(publicOutput).not.toContain(peerUserId);
});

test("Session Planner canary client forces fresh reads and exact revision metadata", async () => {
  const requests = [];
  const fetchImpl = async (url, request = {}) => {
    requests.push({ url: String(url), request });
    if (request.method === "POST") {
      return new Response(JSON.stringify({
        ok: true,
        revision: 43,
        value: baselineValue,
        metadata: { hash: baseline.hash },
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      ok: true,
      entries: { "football-session-planner-v3": baselineValue },
      metadata: {
        "football-session-planner-v3": {
          revision: baseline.revision,
          hash: baseline.hash,
        },
      },
    }), { status: 200 });
  };

  await expect(readSessionPlannerCanaryState({
    appOrigin: "https://staging.footballscience.xyz",
    accessToken: "token",
    fetchImpl,
  })).resolves.toMatchObject(baseline);
  await expect(writeSessionPlannerCanaryState({
    appOrigin: "https://staging.footballscience.xyz",
    accessToken: "token",
    value: baselineValue,
    baseRevision: 42,
    baseHash: baseline.hash,
    fetchImpl,
  })).resolves.toMatchObject({ ok: true, revision: 43 });

  expect(requests[0].url).toContain("fresh=1");
  expect(requests[0].url).toContain("keys=football-session-planner-v3");
  expect(requests[0].request.headers["x-footballscience-fresh-state"]).toBe("1");
  const writeBody = JSON.parse(requests[1].request.body);
  expect(writeBody).toMatchObject({
    key: "football-session-planner-v3",
    baseRevision: 42,
    baseHash: baseline.hash,
    metadata: { baseRevision: 42, revision: 42, hash: baseline.hash },
  });
});

test("Session Planner staging canary credentials are environment-only", () => {
  const parsed = parseSessionPlannerStagingCanaryArgs(
    ["--target=staging", "--request-id=test-request"],
    {
      STAGING_QA_USERNAME: "primary@example.com",
      STAGING_QA_PASSWORD: "primary-secret",
      STAGING_QA_PEER_USERNAME: "peer@example.com",
      STAGING_QA_PEER_PASSWORD: "peer-secret",
      SUPABASE_PROJECT_REF: "staging-project",
      CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF: "production-project",
    }
  );
  expect(parsed).toMatchObject({
    target: "staging",
    requestId: "test-request",
    primaryUsername: "primary@example.com",
    peerUsername: "peer@example.com",
    canonicalProductionProjectRef: "production-project",
  });
  expect(JSON.stringify(process.argv)).not.toContain("primary-secret");
  expect(JSON.stringify(process.argv)).not.toContain("peer-secret");
  expect(() =>
    parseSessionPlannerStagingCanaryArgs(["--primary-password=unsafe"], {})
  ).toThrow("Unknown Session Planner staging canary option");
});
