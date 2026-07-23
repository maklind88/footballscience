import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import {
  loadSessionPlannerCanaryRecoveryPackage,
  storeSessionPlannerCanaryRecoveryPackage,
} from "../scripts/lib/session-planner-canary-recovery-storage.mjs";

const require = createRequire(import.meta.url);
const {
  SESSION_PLANNER_CANARY_MARKER_KEY,
  createSessionPlannerCanaryRecoveryPackage,
  createSessionPlannerCanaryRecoverySummary,
  hashText,
  verifySessionPlannerCanaryRecoveryPackage,
} = require("../api/_lib/session-planner-canary-recovery.js");
const primaryUserId = "11111111-1111-4111-8111-111111111111";
const peerUserId = "22222222-2222-4222-8222-222222222222";

function state() {
  return {
    selectedDate: "2026-07-23",
    sessions: {
      "2026-07-23": {
        id: "session-2026-07-23",
        date: "2026-07-23",
        title: "Private training",
        blocks: [{ id: "block-1", title: "Private exercise" }],
      },
    },
  };
}

function fixture(overrides = {}) {
  const baseline = state();
  const marker = {
    requestId: "session-planner-canary-1",
    createdAt: "2026-07-23T13:00:00.000Z",
  };
  const canary = {
    ...baseline,
    [SESSION_PLANNER_CANARY_MARKER_KEY]: marker,
  };
  const baselineValue = JSON.stringify(baseline);
  const canaryValue = JSON.stringify(canary);
  return {
    target: "staging",
    projectRef: "staging-project",
    canonicalProductionProjectRef: "production-project",
    appOrigin: "https://staging.footballscience.xyz",
    canonicalProductionAppOrigin: "https://footballscience.xyz",
    primaryUserId,
    peerUserId,
    requestId: marker.requestId,
    createdAt: marker.createdAt,
    baselineRevision: 42,
    baselineHash: hashText(baselineValue),
    baselineValue,
    canaryHash: hashText(canaryValue),
    canaryValue,
    ...overrides,
  };
}

test("Session Planner canary recovery package binds a private baseline and two staging users", () => {
  const recoveryPackage = createSessionPlannerCanaryRecoveryPackage(fixture());
  const verification = verifySessionPlannerCanaryRecoveryPackage(recoveryPackage);
  const summary = createSessionPlannerCanaryRecoverySummary(recoveryPackage);

  expect(verification).toMatchObject({
    ok: true,
    baselineRevision: 42,
    baselineHash: recoveryPackage.baseline.hash,
    canaryHash: recoveryPackage.canary.valueHash,
  });
  expect(summary).toMatchObject({
    ok: true,
    target: "staging",
    projectRef: "staging-project",
    appOrigin: "https://staging.footballscience.xyz",
    baselineRevision: 42,
    distinctUsers: true,
    privateRecoveryRequired: true,
    containsCoachingContent: false,
  });
  expect(JSON.stringify(summary)).not.toContain("Private training");
  expect(JSON.stringify(summary)).not.toContain("Private exercise");
  expect(JSON.stringify(recoveryPackage)).not.toContain("password");
  expect(JSON.stringify(recoveryPackage)).not.toContain("access_token");
});

test("Session Planner canary recovery refuses production and identical users", () => {
  const productionProject = createSessionPlannerCanaryRecoveryPackage(fixture({
    projectRef: "production-project",
  }));
  const productionOrigin = createSessionPlannerCanaryRecoveryPackage(fixture({
    appOrigin: "https://footballscience.xyz",
  }));
  const sameUser = createSessionPlannerCanaryRecoveryPackage(fixture({
    peerUserId: primaryUserId,
  }));

  expect(productionProject.failures).toContain("project_matches_production");
  expect(productionOrigin.failures).toContain("app_origin_matches_production");
  expect(sameUser.failures).toContain("users_not_distinct");
});

test("Session Planner canary recovery refuses invalid or pre-marked baselines", () => {
  const invalidValue = createSessionPlannerCanaryRecoveryPackage(fixture({
    baselineValue: "{}",
    baselineHash: hashText("{}"),
  }));
  const preMarked = state();
  preMarked[SESSION_PLANNER_CANARY_MARKER_KEY] = { stale: true };
  const preMarkedValue = JSON.stringify(preMarked);
  const existingMarker = createSessionPlannerCanaryRecoveryPackage(fixture({
    baselineValue: preMarkedValue,
    baselineHash: hashText(preMarkedValue),
  }));

  expect(invalidValue.failures).toContain("baseline_state_invalid");
  expect(existingMarker.failures).toContain("baseline_contains_canary_marker");
});

test("Session Planner canary recovery detects private baseline and envelope tampering", () => {
  const recoveryPackage = createSessionPlannerCanaryRecoveryPackage(fixture());
  const baselineTamper = structuredClone(recoveryPackage);
  baselineTamper.baseline.value = baselineTamper.baseline.value.replace(
    "Private training",
    "Changed training"
  );
  expect(verifySessionPlannerCanaryRecoveryPackage(baselineTamper)).toMatchObject({
    ok: false,
    code: "canary_recovery_hash_mismatch",
  });

  const contextTamper = structuredClone(recoveryPackage);
  contextTamper.appOrigin = contextTamper.canonicalProductionAppOrigin;
  const { integrity: ignoredIntegrity, ...body } = contextTamper;
  contextTamper.integrity = {
    algorithm: "sha256",
    contentSha256: require("../api/_lib/session-planner-domain-records.js")
      .hashJsonValue(body),
  };
  expect(verifySessionPlannerCanaryRecoveryPackage(contextTamper)).toMatchObject({
    ok: false,
    code: "canary_recovery_context_invalid",
  });

  const canaryTamper = structuredClone(recoveryPackage);
  canaryTamper.canary.value = canaryTamper.canary.value.replace(
    "session-planner-canary-1",
    "session-planner-canary-2"
  );
  const { integrity: ignoredCanaryIntegrity, ...canaryBody } = canaryTamper;
  canaryTamper.integrity = {
    algorithm: "sha256",
    contentSha256: require("../api/_lib/session-planner-domain-records.js")
      .hashJsonValue(canaryBody),
  };
  expect(verifySessionPlannerCanaryRecoveryPackage(canaryTamper)).toMatchObject({
    ok: false,
    code: "canary_recovery_context_invalid",
  });
});

function storageFetchMock(recoveryPackage, options = {}) {
  const requests = [];
  const fetchImpl = async (url, request = {}) => {
    requests.push({ url: String(url), request });
    if (String(url).includes("/storage/v1/bucket/")) {
      return new Response(JSON.stringify({ public: options.publicBucket === true }), {
        status: 200,
      });
    }
    if (request.method === "POST") {
      return new Response(JSON.stringify(
        options.uploadPayload || { Key: "stored" }
      ), {
        status: options.uploadStatus || 200,
      });
    }
    return new Response(JSON.stringify(
      options.corruptRead ? { ...recoveryPackage, projectRef: "other-project" } : recoveryPackage
    ), { status: 200 });
  };
  return { fetchImpl, requests };
}

test("Session Planner canary recovery storage is private and read-after-write verified", async () => {
  const recoveryPackage = createSessionPlannerCanaryRecoveryPackage(fixture());
  const storage = storageFetchMock(recoveryPackage);
  const config = {
    url: "https://staging-project.supabase.co",
    serviceRoleKey: "test-service-key",
  };
  const stored = await storeSessionPlannerCanaryRecoveryPackage({
    recoveryPackage,
    config,
    fetchImpl: storage.fetchImpl,
  });

  expect(stored).toMatchObject({
    ok: true,
    readAfterWriteVerified: true,
    containsCoachingContent: false,
  });
  expect(stored.path).toContain(
    "backups/session-planner-canary/staging/staging-project/"
  );
  const upload = storage.requests.find(({ request }) => request.method === "POST");
  expect(upload.request.headers["x-upsert"]).toBe("false");
  expect(upload.request.headers["Cache-Control"]).toBe("private, no-store");

  const loaded = await loadSessionPlannerCanaryRecoveryPackage({
    path: stored.path,
    expectedContentSha256: stored.contentSha256,
    expectedProjectRef: "staging-project",
    config,
    fetchImpl: storage.fetchImpl,
  });
  expect(loaded.receipt).toMatchObject({
    readVerified: true,
    containsCoachingContent: false,
  });
  expect(loaded.privateRecoveryPackage.baseline.value).toContain("Private training");
});

test("Session Planner canary recovery storage fails closed on public or corrupt storage", async () => {
  const recoveryPackage = createSessionPlannerCanaryRecoveryPackage(fixture());
  const config = {
    url: "https://staging-project.supabase.co",
    serviceRoleKey: "test-service-key",
  };
  const publicStorage = storageFetchMock(recoveryPackage, { publicBucket: true });
  const corruptStorage = storageFetchMock(recoveryPackage, { corruptRead: true });

  await expect(storeSessionPlannerCanaryRecoveryPackage({
    recoveryPackage,
    config,
    fetchImpl: publicStorage.fetchImpl,
  })).resolves.toMatchObject({ ok: false, status: 409 });
  await expect(storeSessionPlannerCanaryRecoveryPackage({
    recoveryPackage,
    config,
    fetchImpl: corruptStorage.fetchImpl,
  })).resolves.toMatchObject({ ok: false, status: 409 });
  await expect(storeSessionPlannerCanaryRecoveryPackage({
    recoveryPackage,
    config: {
      url: "https://production-project.supabase.co",
      serviceRoleKey: "test-service-key",
    },
    fetchImpl: corruptStorage.fetchImpl,
  })).resolves.toMatchObject({ ok: false, status: 400 });
});

test("Session Planner canary recovery storage safely reuses only verified duplicate objects", async () => {
  const recoveryPackage = createSessionPlannerCanaryRecoveryPackage(fixture());
  const config = {
    url: "https://staging-project.supabase.co",
    serviceRoleKey: "test-service-key",
  };
  const duplicateStorage = storageFetchMock(recoveryPackage, {
    uploadStatus: 400,
    uploadPayload: {
      statusCode: "409",
      error: "Duplicate",
      message: "The resource already exists",
    },
  });
  const unrelatedFailure = storageFetchMock(recoveryPackage, {
    uploadStatus: 400,
    uploadPayload: {
      code: "InvalidRequest",
      message: "Upload request is malformed",
    },
  });

  await expect(storeSessionPlannerCanaryRecoveryPackage({
    recoveryPackage,
    config,
    fetchImpl: duplicateStorage.fetchImpl,
  })).resolves.toMatchObject({
    ok: true,
    reusedExisting: true,
    readAfterWriteVerified: true,
  });
  await expect(storeSessionPlannerCanaryRecoveryPackage({
    recoveryPackage,
    config,
    fetchImpl: unrelatedFailure.fetchImpl,
  })).resolves.toMatchObject({
    ok: false,
    status: 400,
  });
});
