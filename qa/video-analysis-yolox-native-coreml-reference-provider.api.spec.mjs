import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expectMacTrackingBuildGuards } from "./helpers/video-analysis-provider-build-guards.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidateDir = path.join(
  rootDir,
  "desktop/local-video-app/tracking-stage-candidates",
);

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("native YOLOX build accepts only pinned offline release inputs", async () => {
  const buildPath = "desktop/local-video-app/tracking-stage-candidates/build-yolox-native-coreml-reference-provider.mjs";
  const service = await import(moduleUrl(buildPath));
  expect(service.parseNativeTrackingCandidateBuildArguments([
    "--onnxruntime-archive", "/tmp/onnxruntime.tgz",
    "--ffmpeg-archive", "/tmp/ffmpeg.tar.xz",
    "--ffmpeg-signature", "/tmp/ffmpeg.tar.xz.asc",
    "--output", "/tmp/provider",
    "--json",
  ])).toEqual({
    ffmpegArchivePath: "/tmp/ffmpeg.tar.xz",
    ffmpegSignaturePath: "/tmp/ffmpeg.tar.xz.asc",
    json: true,
    onnxruntimeArchivePath: "/tmp/onnxruntime.tgz",
    outputPath: "/tmp/provider",
  });
  expect(() => service.parseNativeTrackingCandidateBuildArguments(["--download"]))
    .toThrow(/Unknown build option/);
  expect(() => service.parseNativeTrackingCandidateBuildArguments([
    "--onnxruntime-archive", "/tmp/onnxruntime.tgz",
  ])).toThrow(/required/);

  const source = await fs.readFile(path.join(rootDir, buildPath), "utf8");
  expect(source).toContain("cf38e0e28c7e5605942c4a77755349b0145804a397af37eb1fb4c77cb237f635");
  expect(source).toContain("370c49770e2e1f243e17c7b227bb7f4b3da793b847d02f38016dc0e46c30fbe1");
  expect(source).toContain("00683295a76dfc720092c2457143812e41aca32047f3115f04df78bd5926306f");
  expect(source).toContain('"--disable-network"');
  expect(source).toContain('"--enable-decoder=h264"');
  expect(source).toContain('"--enable-demuxer=mov"');
  expect(source).toContain('"--enable-protocol=file"');
  expect(source).toContain("cmd LC_UUID");
  expect(source).not.toMatch(/https?:\/\//);
  expect(source).not.toMatch(/\b(?:curl|fetch|wget)\b/);
  expect(source).not.toMatch(/AVFoundation|CoreMedia|CoreVideo|Accelerate/);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-yolox-native-build-contract-"));
  try {
    const invalidArchive = path.join(directory, "onnxruntime.tgz");
    const invalidFfmpeg = path.join(directory, "ffmpeg.tar.xz");
    const invalidSignature = path.join(directory, "ffmpeg.tar.xz.asc");
    await Promise.all([
      fs.writeFile(invalidArchive, "not-reviewed-onnxruntime"),
      fs.writeFile(invalidFfmpeg, "not-reviewed-ffmpeg"),
      fs.writeFile(invalidSignature, "not-reviewed-signature"),
    ]);
    await expectMacTrackingBuildGuards(moduleUrl(buildPath), "buildYoloxNativeCoremlReferenceProvider", {
      ffmpegArchivePath: invalidFfmpeg,
      ffmpegSignaturePath: invalidSignature,
      onnxruntimeArchivePath: invalidArchive,
      outputPath: path.join(directory, "provider"),
    }, "TRACKING_NATIVE_CANDIDATE_BUILD");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("native YOLOX provider keeps decoding and inference inside the sealed contract", async () => {
  const files = {
    contract: "providers/yolox-native-coreml-contract.mm",
    decoder: "providers/yolox-native-ffmpeg-decoder.cc",
    decoderHeader: "providers/yolox-native-ffmpeg-decoder.hpp",
    inference: "providers/yolox-native-coreml-inference.mm",
    provider: "providers/yolox-native-coreml-provider.mm",
    providerHeader: "providers/yolox-native-coreml-provider.hpp",
  };
  const sources = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => {
    const bytes = await fs.readFile(path.join(candidateDir, file));
    return [key, { bytes, source: bytes.toString("utf8") }];
  })));
  expect(sources.decoder.source).toContain('av_dict_set(&openOptions, "protocol_whitelist", "file"');
  expect(sources.decoder.source).toContain('av_dict_set(&openOptions, "format_whitelist", "mov"');
  expect(sources.decoder.source).toContain("AV_CODEC_ID_H264");
  expect(sources.decoder.source).toContain("frameMs + 0.5 < endMs");
  expect(sources.inference.source).toContain("COREML_FLAG_ONLY_ALLOW_STATIC_INPUT_SHAPES");
  expect(sources.inference.source).toContain("FSDecodeSampledH264Frames");
  expect(sources.inference.source).toContain("BoundedNormalizedExtent");
  expect(sources.inference.source).toContain('containsObject:@"detect:person"');
  expect(sources.inference.source).toContain('kPersonClass, @"person"');
  expect(sources.contract.source).toContain("genericPerson == roleBoundPlayer");
  expect(sources.contract.source).toContain('containsObject:@"detect:ball"');
  expect(sources.contract.source).toContain('std::strcmp(std::getenv("FS_TRACKING_NETWORK_DISABLED"), "1")');
  expect(sources.contract.source).toContain("O_NOFOLLOW");
  expect(sources.contract.source).toContain("RENAME_EXCL");
  for (const { source } of Object.values(sources)) {
    expect(source).not.toMatch(/AVFoundation|CoreMedia|CoreVideo|Accelerate/);
    expect(source).not.toMatch(/\b(?:NSURLSession|connect|getaddrinfo|socket)\b/);
  }
  expect(sha256(sources.decoder.bytes))
    .toBe("666378bbd71c9a0a323a334a137c68170b93a6b977143da5a19eda029c1c4f1f");
  expect(sha256(sources.contract.bytes))
    .toBe("340d3072dc4e9a6a5e26c4b5a0c505247d4d1e8556195427a1b54f919a6a0914");
  expect(sha256(sources.inference.bytes))
    .toBe("b78f60123eb106a310846d56c2f055c86620debdf068717be196d3a9377157df");
  expect(sources.decoder.source.split("\n").length).toBeLessThanOrEqual(300);
  expect(sources.inference.source.split("\n").length).toBeLessThanOrEqual(400);

  const sandbox = await fs.readFile(path.join(
    rootDir,
    "desktop/local-video-app/local-video-server/tracking-stage-sandbox-executor.mjs",
  ), "utf8");
  expect(sandbox).toContain('"(deny network*)"');
  expect(sandbox).not.toMatch(/com\.apple\.coremedia\.videodecoder|IOSurfaceRootUserClient/);
});
