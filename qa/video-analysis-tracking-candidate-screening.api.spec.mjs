import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hash = "a".repeat(64);

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function pack() {
  return {
    version: 1,
    protocol: "football-science-tracking-annotation-pack-v1",
    id: "real-match-screening",
    createdAt: "2026-08-31T12:00:00.000Z",
    source: { bytes: 1000, sha256: "b".repeat(64) },
    extraction: { ffmpegSha256: "c".repeat(64), width: 1920, height: 1080, frameRate: 30, crf: 18 },
    summary: { caseCount: 1, uniqueDurationMs: 120_000, scenarioIds: ["transition"], reviewStatus: "not-reviewed" },
    cases: [{
      id: "transition",
      startMs: 0,
      endMs: 120_000,
      durationMs: 120_000,
      scenarioTags: ["transition"],
      expectedFrames: 3600,
      clipFile: "clips/transition.mp4",
      annotationFile: "annotations/transition.txt",
      clip: { bytes: 900, sha256: hash },
    }],
  };
}

function evidence({ ball = 0, realTimeFactor = 0.8 } = {}) {
  const observations = [{ frameIndex: 0, entityType: "player", confidence: 0.9 }];
  if (ball) observations.push({ frameIndex: 0, entityType: "ball", confidence: 0.6 });
  return {
    schemaVersion: 1,
    protocol: "football-science-tracking-candidate-stage-run-v1",
    benchmarkOnly: true,
    provider: {
      id: "detector",
      version: "1.0.0",
      protocol: "football-science-tracking-stage-v1",
      stage: "detection",
      capabilities: ["detect:ball", "detect:player"],
      manifestFingerprintSha256: "d".repeat(64),
      executionFingerprintSha256: "e".repeat(64),
    },
    source: { fingerprintSha256: hash },
    range: { startMs: 0, endMs: 5000 },
    result: { artifactSha256: "f".repeat(64), payload: { payload: { observations } } },
    execution: {
      realTimeFactor,
      wallTimeMs: Math.round(5000 * realTimeFactor),
      isolation: "darwin-sandbox-exec-network-denied-v1",
      runtimeMode: "cpu-reference",
    },
  };
}

function summarizedCase(service, evidenceValue) {
  const packValue = service.normalizeTrackingCandidateScreeningPack(pack());
  const summary = service.summarizeTrackingCandidateScreeningCase({
    packCase: packValue.cases[0],
    evidence: evidenceValue,
    evidenceFile: "cases/transition.candidate-stage.json",
    evidenceBytes: 100,
    evidenceSha256: "1".repeat(64),
    sampleDurationMs: 5000,
  });
  return { packValue, values: [{ provider: evidenceValue.provider, summary }] };
}

test("candidate screening exposes missing declared entities and never claims approval", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-screening.mjs",
  ));
  const sample = evidence({ ball: 0, realTimeFactor: 1.2 });
  const values = summarizedCase(service, sample);
  const manifest = service.createTrackingCandidateScreeningManifest(values.packValue, values.values, {
    now: () => "2026-08-31T12:30:00.000Z",
  });
  expect(manifest).toMatchObject({
    benchmarkOnly: true,
    approvalReady: false,
    groundTruthEvaluated: false,
    status: "failed-screening",
    policy: {
      realTimePassed: false,
      declaredCapabilityCoveragePassed: false,
      missingCapabilities: ["detect:ball"],
    },
    reviewGate: {
      suggestionLayerAllowed: true,
      groundTruthMutationAllowed: false,
      groundTruthLockAllowed: false,
      exhaustiveHumanReviewRequired: true,
      providerApprovalBlocked: true,
      nextStep: "replace-or-optimize-candidate-before-approval",
    },
    summary: { entityTotals: { player: 1, ball: 0, referee: 0 } },
  });
  expect(manifest.screeningSha256).toMatch(/^[a-f0-9]{64}$/);
});

test("screening pass still waits for reviewed ground truth", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-screening.mjs",
  ));
  const sample = evidence({ ball: 1, realTimeFactor: 0.8 });
  const values = summarizedCase(service, sample);
  const manifest = service.createTrackingCandidateScreeningManifest(values.packValue, values.values, {
    now: () => "2026-08-31T12:30:00.000Z",
  });
  expect(manifest).toMatchObject({
    approvalReady: false,
    groundTruthEvaluated: false,
    status: "screening-pass-awaiting-ground-truth",
    policy: { realTimePassed: true, declaredCapabilityCoveragePassed: true, missingCapabilities: [] },
    reviewGate: {
      suggestionLayerAllowed: true,
      groundTruthMutationAllowed: false,
      groundTruthLockAllowed: false,
      exhaustiveHumanReviewRequired: true,
      providerApprovalBlocked: false,
      nextStep: "independent-ground-truth-review",
    },
  });
  expect(() => service.createTrackingCandidateScreeningManifest(values.packValue, [{
    ...values.values[0],
    provider: { ...values.values[0].provider, untrusted: true },
  }])).toThrow(/unsupported or missing fields/);
});

test("candidate screening CLI requires explicit pack, provider, and output", async () => {
  const cli = await import(moduleUrl("scripts/fs-player-tracking-candidate-screening.mjs"));
  expect(cli.parseTrackingCandidateScreeningArguments([
    "--pack", "/tmp/annotation-pack.json",
    "--provider", "detector@1.0.0",
    "--sample-ms", "5000",
    "--output", "/tmp/screening",
    "--json",
  ])).toEqual({
    json: true,
    outputDir: "/tmp/screening",
    packPath: "/tmp/annotation-pack.json",
    providerId: "detector",
    providerVersion: "1.0.0",
    sampleDurationMs: 5000,
  });
  expect(() => cli.parseTrackingCandidateScreeningArguments(["--download"]))
    .toThrow(/Unknown screening option/);
});

test("candidate screening rejects a linked annotation pack before provider access", async () => {
  const cli = await import(moduleUrl("scripts/fs-player-tracking-candidate-screening.mjs"));
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-screening-link-"));
  try {
    const packPath = path.join(tempDir, "annotation-pack.json");
    const linkPath = path.join(tempDir, "linked-pack.json");
    await fs.writeFile(packPath, `${JSON.stringify(pack())}\n`, { mode: 0o600 });
    await fs.symlink(packPath, linkPath);
    await expect(cli.runTrackingCandidateScreening({
      packPath: linkPath,
      outputDir: path.join(tempDir, "screening"),
      providerId: "detector",
      providerVersion: "1.0.0",
      sampleDurationMs: 5000,
    })).rejects.toMatchObject({ code: "TRACKING_CANDIDATE_SCREENING_PACK_UNSAFE" });
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});

test("screening bundle verifier reproduces sealed raw evidence and rejects byte drift", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-screening.mjs",
  ));
  const verifier = await import(moduleUrl(
    "desktop/local-video-app/local-video-server/tracking-candidate-screening-verifier.mjs",
  ));
  const tempDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "fs-screening-verify-")));
  try {
    const packValue = pack();
    const normalizedPack = service.normalizeTrackingCandidateScreeningPack(packValue);
    const evidenceValue = evidence({ ball: 1, realTimeFactor: 0.8 });
    const evidenceBytes = Buffer.from(`${JSON.stringify(evidenceValue)}\n`);
    const evidenceSha256 = createHash("sha256").update(evidenceBytes).digest("hex");
    const summary = service.summarizeTrackingCandidateScreeningCase({
      packCase: normalizedPack.cases[0],
      evidence: evidenceValue,
      evidenceFile: "cases/transition.candidate-stage.json",
      evidenceBytes: evidenceBytes.byteLength,
      evidenceSha256,
      sampleDurationMs: 5000,
    });
    const manifest = service.createTrackingCandidateScreeningManifest(
      normalizedPack,
      [{ provider: evidenceValue.provider, summary }],
      { now: () => "2026-08-31T12:30:00.000Z" },
    );
    const packPath = path.join(tempDir, "annotation-pack.json");
    const screeningDir = path.join(tempDir, "screening");
    const casesDir = path.join(screeningDir, "cases");
    const evidencePath = path.join(casesDir, "transition.candidate-stage.json");
    const manifestPath = path.join(screeningDir, "screening.json");
    await fs.mkdir(casesDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(packPath, `${JSON.stringify(packValue)}\n`, { mode: 0o600 });
    await fs.writeFile(evidencePath, evidenceBytes, { mode: 0o400 });
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, { mode: 0o400 });
    const dependencies = {
      registry: { resolve: async () => ({ provider: { fixture: true } }) },
      validateEvidence: (value) => value,
    };
    await expect(verifier.verifyTrackingCandidateScreeningBundle({ packPath, screeningDir }, dependencies))
      .resolves.toMatchObject({
        ok: true,
        status: "screening-pass-awaiting-ground-truth",
        caseCount: 1,
        screeningSha256: manifest.screeningSha256,
      });
    await fs.chmod(evidencePath, 0o600);
    await fs.appendFile(evidencePath, " ");
    await expect(verifier.verifyTrackingCandidateScreeningBundle({ packPath, screeningDir }, dependencies))
      .rejects.toThrow(/not sealed read-only/);
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});
