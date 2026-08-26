import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function provider(stage, capabilities, overrides = {}) {
  const id = overrides.providerId || `${stage}-provider`;
  return {
    schemaVersion: 1,
    protocol: "football-science-tracking-stage-v1",
    providerId: id,
    providerVersion: "1.0.0",
    displayName: `${stage} provider`,
    stage,
    priority: overrides.priority || 10,
    capabilities,
    approval: {
      status: "approved-local-optional",
      reviewedAt: "2026-08-25",
      networkAtInference: false,
      licenseReviewed: true,
      redistributeUpstreamAssets: false,
      ...overrides.approval,
    },
    upstream: {
      repository: `https://github.com/footballscience/${id}`,
      commit: "a".repeat(40),
      sourceSha256: "b".repeat(64),
      license: "Apache-2.0",
      licenseUrl: `https://github.com/footballscience/${id}/blob/main/LICENSE`,
    },
    models: stage === "association" ? [] : [{
      id: `${id}-weights`,
      sha256: "c".repeat(64),
      bytes: 1024,
      license: "Apache-2.0",
      sourceUrl: `https://models.footballscience.test/${id}.bin`,
    }],
    runtime: {
      maxFrames: 30_000,
      maxDurationMs: 1_200_000,
      maxMemoryMb: 8192,
      maxConcurrentJobs: 1,
    },
    benchmark: {
      status: "passed",
      evaluatorVersion: "tracking-benchmark-v1",
      profileId: "real-match-pilot-v1",
      reportSha256: "d".repeat(64),
      caseCount: 12,
      realMatchCaseCount: 10,
      capabilities,
      ...overrides.benchmark,
    },
  };
}

test("tracking provider contract accepts only pinned bounded offline providers", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const manifest = provider("segmentation", ["segment:selected-object", "propagate:selected-object"]);
  const normalized = contract.normalizeTrackingProviderManifest(manifest);

  expect(normalized).toMatchObject({
    providerId: "segmentation-provider",
    stage: "segmentation",
    runtime: { maxConcurrentJobs: 1 },
  });
  expect(contract.trackingProviderReadiness(manifest)).toMatchObject({ ready: true, reasons: [] });
});

test("tracking provider remains blocked without approval, offline inference and real evidence", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const manifest = provider("reidentification", ["reidentify:player"], {
    approval: { status: "candidate", networkAtInference: true, licenseReviewed: false },
    benchmark: { status: "failed", realMatchCaseCount: 1 },
  });
  const readiness = contract.trackingProviderReadiness(manifest);

  expect(readiness.ready).toBe(false);
  expect(readiness.reasons).toEqual(expect.arrayContaining([
    "provider-not-approved",
    "inference-network-enabled",
    "licence-not-reviewed",
    "benchmark-not-passed",
  ]));
});

test("tracking provider rejects capabilities from another pipeline stage", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  expect(() => contract.normalizeTrackingProviderManifest(
    provider("detection", ["reidentify:player"]),
  )).toThrow(/does not belong/i);
});

test("tracking pipeline plans all required stages and fails closed on missing evidence", async () => {
  const contract = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-provider-contract.mjs",
  ));
  const requiredCapabilities = [
    "detect:player",
    "detect:ball",
    "detect:referee",
    "segment:selected-object",
    "associate:multi-object",
    "reidentify:player",
    "classify:team",
  ];
  const providers = [
    provider("detection", ["detect:player", "detect:ball", "detect:referee"]),
    provider("segmentation", ["segment:selected-object"]),
    provider("association", ["associate:multi-object"]),
    provider("reidentification", ["reidentify:player"]),
    provider("classification", ["classify:team"], {
      benchmark: { capabilities: [] },
    }),
  ];
  const blocked = contract.buildTrackingPipelinePlan(providers, { requiredCapabilities });

  expect(blocked.ready).toBe(false);
  expect(blocked.missingCapabilities).toEqual(["classify:team"]);
  expect(blocked.blockedProviders).toEqual([{
    providerId: "classification-provider",
    reasons: ["capability-evidence-missing"],
  }]);

  providers[4].benchmark.capabilities = ["classify:team"];
  const ready = contract.buildTrackingPipelinePlan(providers, { requiredCapabilities });
  expect(ready).toMatchObject({ ready: true, missingCapabilities: [] });
  expect(ready.providers).toHaveLength(5);
  expect(JSON.stringify(ready)).not.toMatch(/repository|sourceUrl|licenseUrl|models/i);
});
