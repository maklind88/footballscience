import { expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidateDir = path.join(rootDir, "desktop/local-video-app/tracking-stage-candidates");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

test("native ByteTrack build accepts only pinned reviewed source inputs", async () => {
  const buildPath = "desktop/local-video-app/tracking-stage-candidates/build-bytetrack-native-reference-provider.mjs";
  const service = await import(moduleUrl(buildPath));
  expect(service.parseByteTrackBuildArguments([
    "--bytetrack-archive", "/tmp/bytetrack.tar",
    "--eigen-archive", "/tmp/eigen.tar.gz",
    "--ryu-archive", "/tmp/ryu.tar",
    "--output", "/tmp/provider",
    "--json",
  ])).toEqual({
    byteTrackArchivePath: "/tmp/bytetrack.tar",
    eigenArchivePath: "/tmp/eigen.tar.gz",
    json: true,
    outputPath: "/tmp/provider",
    ryuArchivePath: "/tmp/ryu.tar",
  });
  expect(() => service.parseByteTrackBuildArguments(["--download"])).toThrow(/Unknown build option/);
  expect(() => service.parseByteTrackBuildArguments([
    "--bytetrack-archive", "/tmp/bytetrack.tar",
  ])).toThrow(/required/);

  const source = await fs.readFile(path.join(rootDir, buildPath), "utf8");
  expect(source).toContain("d1bf0191adff59bc8fcfeaa0b33d3d1642552a99");
  expect(source).toContain("1bb85ad045049de1fe8d672b4c9700cb1f7ab59bb87084f3550dd9c8c97de6bc");
  expect(source).toContain("8586084f71f9bde545ee7fa6d00288b264a2b7ac3607b974e54d13e7162c1c72");
  expect(source).toContain("4c0618b0e44f7ef027ebae05d2cc7812048f7c8f");
  expect(source).toContain("092d0469a28b9854222a6182190816c3b2e04fa291622f97e210cc5e70397d5b");
  expect(source).toContain("db84c68916bf6b22b9b671d87eb59b70e5ae7e17fe8811055321f8d57a26c690");
  expect(source).toContain("cmd LC_UUID");
  expect(source).toContain("-Werror");
  expect(source).not.toMatch(/\b(?:curl|fetch|wget)\b/);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-bytetrack-native-build-contract-"));
  try {
    const byteTrackArchive = path.join(directory, "bytetrack.tar");
    const eigenArchive = path.join(directory, "eigen.tar.gz");
    const ryuArchive = path.join(directory, "ryu.tar");
    await Promise.all([
      fs.writeFile(byteTrackArchive, "not-reviewed-bytetrack"),
      fs.writeFile(eigenArchive, "not-reviewed-eigen"),
      fs.writeFile(ryuArchive, "not-reviewed-ryu"),
    ]);
    await expect(service.buildByteTrackNativeReferenceProvider({
      byteTrackArchivePath: byteTrackArchive,
      eigenArchivePath: eigenArchive,
      ryuArchivePath: ryuArchive,
      outputPath: path.join(directory, "provider"),
    })).rejects.toMatchObject({ code: "TRACKING_BYTETRACK_BUILD_CHECKSUM_MISMATCH" });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("native ByteTrack adapter preserves lineage and strict association boundaries", async () => {
  const names = [
    "providers/bytetrack-native-provider.hpp",
    "providers/bytetrack-native-contract.mm",
    "providers/bytetrack-native-association.mm",
    "providers/bytetrack-native-core.patch",
  ];
  const sources = await Promise.all(names.map(async (name) => ({
    name,
    source: await fs.readFile(path.join(candidateDir, name), "utf8"),
  })));
  const combined = sources.map(({ source }) => source).join("\n");
  expect(combined).toContain("observation_indices");
  expect(combined).toContain("AssociateEntity");
  expect(combined).toContain("ProfileForEntity");
  expect(combined).toContain('entityType == "ball"');
  expect(combined).toContain("AssociationProfile{12, 0.02F, 0.05F, 0.95F, 0.95F, 0.90F}");
  expect(combined).toContain("AssociationProfile{30, 0.20F, 0.35F, 0.80F, 0.50F, 0.70F}");
  expect(combined).toContain("second_match_thresh");
  expect(combined).toContain("unconfirmed_match_thresh");
  expect(combined).toContain("BuildFrameMotionOffsets");
  expect(combined).toContain("EstimateFrameMotion");
  expect(combined).toContain("NearestObservation");
  expect(combined).toContain("candidates.size() < 4");
  expect(combined).toContain("distance > 0.15F * 0.15F");
  expect(combined).toContain("std::clamp(3.0F * Median(residuals), 0.008F, 0.06F)");
  expect(combined).toContain("std::hypot(result.x, result.y) <= 0.08F");
  expect(combined).toContain("value.left - offset.x");
  expect(combined).toContain("value.top - offset.y");
  expect(combined).toContain('{"person", "player", "ball", "referee"}');
  expect(combined).toContain('[entity isEqual:@"person"]');
  expect(combined).toContain("bytetrack-entity-mismatch");
  expect(combined).toContain("EcmaNumber");
  expect(combined).toContain("requestFingerprint");
  expect(combined).not.toContain("1'000'000 + static_cast<int>(index)");
  expect(combined).toContain("tracks.size() > 1024");
  expect(combined).toContain("O_NOFOLLOW");
  expect(combined).toContain("RENAME_EXCL");
  expect(combined).toContain('std::getenv("FS_TRACKING_NETWORK_DISABLED")');
  expect(combined).not.toMatch(/NSURLSession|AVFoundation|CoreMedia|CoreVideo/);
  expect(sources.find(({ name }) => name.endsWith("association.mm")).source).not.toMatch(/opencv/i);
  expect(sources.find(({ name }) => name.endsWith("contract.mm")).source).not.toContain("RequestFingerprint(");
  expect(sources.find(({ name }) => name.endsWith("core.patch")).source).toContain("-#include <opencv2/opencv.hpp>");
  for (const { name, source } of sources) {
    expect(source.split("\n").length, name).toBeLessThanOrEqual(500);
  }
});
