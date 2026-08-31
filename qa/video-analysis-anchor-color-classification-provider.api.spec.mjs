import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidateDir = path.join(rootDir, "desktop/local-video-app/tracking-stage-candidates");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("anchor-color build accepts only pinned offline FFmpeg release inputs", async () => {
  const buildPath = "desktop/local-video-app/tracking-stage-candidates/build-anchor-color-classification-provider.mjs";
  const service = await import(moduleUrl(buildPath));
  expect(service.parseAnchorColorClassificationBuildArguments([
    "--ffmpeg-archive", "/tmp/ffmpeg.tar.xz",
    "--ffmpeg-signature", "/tmp/ffmpeg.tar.xz.asc",
    "--output", "/tmp/provider",
    "--json",
  ])).toEqual({
    ffmpegArchivePath: "/tmp/ffmpeg.tar.xz",
    ffmpegSignaturePath: "/tmp/ffmpeg.tar.xz.asc",
    json: true,
    outputPath: "/tmp/provider",
  });
  expect(() => service.parseAnchorColorClassificationBuildArguments(["--download"]))
    .toThrow(/Unknown build option/);

  const identity = service.anchorColorClassificationBuildIdentity();
  expect(identity).toMatchObject({
    protocol: "football-science-anchor-color-native-build-v1",
    runtime: {
      architecture: "arm64",
      bytes: 3_000_560,
      sha256: "7c167a3e5a7e9021a0b3584a3a660bdd6880938b0d14128699486d97e12996b9",
    },
    ffmpeg: {
      version: "9.0.1",
      archiveSha256: "cf38e0e28c7e5605942c4a77755349b0145804a397af37eb1fb4c77cb237f635",
      detachedSignatureSha256: "b613a00005232a1245ace7080088781ac23a916119d3e5b0d6c042368eee0177",
    },
  });
  const source = await fs.readFile(path.join(rootDir, buildPath), "utf8");
  expect(source).toContain('"--disable-network"');
  expect(source).toContain('"--enable-decoder=h264"');
  expect(source).toContain('"--enable-demuxer=mov"');
  expect(source).toContain('"--enable-protocol=file"');
  expect(source).not.toMatch(/https?:\/\//);
  expect(source).not.toMatch(/\b(?:curl|fetch|wget)\b/);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-anchor-color-build-contract-"));
  try {
    const archive = path.join(directory, "ffmpeg.tar.xz");
    const signature = path.join(directory, "ffmpeg.tar.xz.asc");
    await Promise.all([
      fs.writeFile(archive, "not-reviewed-ffmpeg"),
      fs.writeFile(signature, "not-reviewed-signature"),
    ]);
    await expect(service.buildAnchorColorClassificationProvider({
      ffmpegArchivePath: archive,
      ffmpegSignaturePath: signature,
      outputPath: path.join(directory, "provider"),
    })).rejects.toMatchObject({ code: "TRACKING_ANCHOR_COLOR_BUILD_CHECKSUM_MISMATCH" });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("anchor-color manifest is canonical, source-bound and benchmark-only", async () => {
  const manifestService = await import(moduleUrl(
    "desktop/local-video-app/tracking-stage-candidates/create-anchor-color-classification-manifest.mjs",
  ));
  const candidateService = await import(moduleUrl(
    "desktop/local-video-app/tracking-stage-candidates/candidate-install-service.mjs",
  ));
  const commit = "a".repeat(40);
  expect(manifestService.parseAnchorColorManifestArguments([
    "--source-commit", commit, "--output", "/tmp/manifest.json", "--json",
  ])).toEqual({ json: true, outputPath: "/tmp/manifest.json", sourceCommit: commit });
  expect(() => manifestService.parseAnchorColorManifestArguments([
    "--source-commit", "short", "--output", "/tmp/manifest.json",
  ])).not.toThrow();
  await expect(manifestService.createAnchorColorClassificationManifest({ sourceCommit: "short" }))
    .rejects.toMatchObject({ code: "TRACKING_ANCHOR_COLOR_MANIFEST_INVALID" });

  const manifest = await manifestService.createAnchorColorClassificationManifest({ sourceCommit: commit });
  expect(manifest).toMatchObject({
    providerId: "anchor-color-role-team-reference",
    providerVersion: "0.1.0",
    stage: "classification",
    capabilities: ["classify:role", "classify:team"],
    approval: {
      status: "candidate",
      networkAtInference: false,
      licenseReviewed: true,
      redistributeUpstreamAssets: false,
    },
    upstream: { commit, license: "LicenseRef-Football-Science-Internal" },
    models: [{
      id: "anchor-color-classifier-spec-v1",
      bytes: 713,
      sha256: "54e69a6a1af93db0d6cf6d10df1fab3b6b2683851155b6a84c11ec44526a4294",
      provenance: {
        trainingDataReviewed: true,
        datasets: [{
          usage: "evaluation",
          rightsReviewed: true,
          identityUseReviewed: true,
        }],
      },
    }],
    runtime: {
      providerSha256: "7c167a3e5a7e9021a0b3584a3a660bdd6880938b0d14128699486d97e12996b9",
      runtimeMode: "native-stage-process-v1",
      sampleFps: 6.25,
    },
    benchmark: { status: "not-run" },
  });
  expect(JSON.stringify(manifest)).not.toMatch(/passed|approved-local-optional/);
  const other = await manifestService.createAnchorColorClassificationManifest({ sourceCommit: "b".repeat(40) });
  expect(other.upstream.sourceSha256).not.toBe(manifest.upstream.sourceSha256);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-anchor-color-manifest-"));
  try {
    const outputPath = path.join(directory, "manifest.json");
    await manifestService.writeAnchorColorClassificationManifest({ sourceCommit: commit, outputPath });
    await expect(candidateService.readTrackingCandidateManifest(outputPath)).resolves.toEqual(manifest);
    await expect(manifestService.writeAnchorColorClassificationManifest({ sourceCommit: commit, outputPath }))
      .rejects.toMatchObject({ code: "TRACKING_ANCHOR_COLOR_MANIFEST_OUTPUT_EXISTS" });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("anchor-color native contract fails closed and keeps pixels inside the provider", async () => {
  const files = [
    ["providers/anchor-color-classification-contract.mm", "0f4b26f77c9d0b95e8e7acea179d8ad75ba0b1fb004a6ca485c9d4ee599fd671", 320],
    ["providers/anchor-color-classification.mm", "34a351b74d6beabc1ce6e702906154041ccd15d0a445a38d69174602b1070747", 360],
    ["providers/tracking-native-stage-json.hpp", "45e442771919c1d2ca1dbee5f723b7ec87d9af6e0edc8e10f3c663e6c4a6ad3a", 220],
  ];
  const sources = await Promise.all(files.map(async ([name, checksum, maximumLines]) => {
    const bytes = await fs.readFile(path.join(candidateDir, name));
    const source = bytes.toString("utf8");
    expect(sha256(bytes), name).toBe(checksum);
    expect(source.split("\n").length, name).toBeLessThanOrEqual(maximumLines);
    expect(source, name).not.toMatch(/\b(?:NSURLSession|connect|getaddrinfo|socket)\b/);
    return { name, source };
  }));
  const contract = sources[0].source;
  const classifier = sources[1].source;
  expect(contract).toContain('std::strcmp(std::getenv("FS_TRACKING_NETWORK_DISABLED"), "1")');
  expect(contract).toContain('trajectory->second == "person"');
  expect(contract).toContain('teamAnchors || trajectory->second != "player"');
  expect(contract).toContain("Sha256File(executablePath");
  expect(contract).toContain("Sha256String(requestFingerprint)");
  expect(contract).not.toContain("NSString* RequestFingerprint(");
  const sandbox = await fs.readFile(path.join(
    rootDir, "desktop/local-video-app/local-video-server/tracking-stage-sandbox-executor.mjs",
  ), "utf8");
  expect(sandbox).toContain('["association", "classification"].includes(provider.stage)');
  expect(sandbox).toContain('exactFingerprint(executionOptions.requestFingerprint, "Stage request fingerprint")');
  expect(classifier).toContain("grassHueMinimum");
  expect(classifier).toContain("maximumCosineDistance");
  expect(classifier).toContain('std::string label = "unknown"');
  expect(classifier).not.toMatch(/playerId|teamId|identityKey|embedding|imagePath|sourcePath.*payload/);

  const specification = JSON.parse(await fs.readFile(path.join(
    candidateDir, "providers/anchor-color-classifier-spec.json",
  ), "utf8"));
  expect(specification).toMatchObject({
    protocol: "football-science-anchor-color-classifier-v1",
    decision: {
      maximumCosineDistance: 0.42,
      minimumDistanceMargin: 0.08,
      minimumConfidence: 0.65,
      requirePlayerAndRefereeAnchors: true,
      requireHomeAndAwayAnchors: true,
    },
  });
  const fixture = JSON.parse(await fs.readFile(path.join(
    rootDir, "qa/fixtures/video-analysis/anchor-color-classifier-synthetic-fixture.json",
  ), "utf8"));
  expect(fixture.rights).toEqual({
    origin: "deterministic-computer-generated-scene",
    containsRealPeople: false,
    containsPersonalData: false,
    redistribution: "internal-evaluation-only",
  });
  expect(fixture.objects.filter((entry) => entry.role === "player")).toHaveLength(4);
  expect(fixture.objects.filter((entry) => entry.role === "referee")).toHaveLength(1);
});
