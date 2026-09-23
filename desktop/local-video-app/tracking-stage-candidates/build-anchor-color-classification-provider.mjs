#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FFMPEG_VERSION = "9.0.1";
const FFMPEG_ROOT = `ffmpeg-${FFMPEG_VERSION}`;
const FFMPEG_ARCHIVE_SHA256 = "cf38e0e28c7e5605942c4a77755349b0145804a397af37eb1fb4c77cb237f635";
const FFMPEG_ARCHIVE_BYTES = 12_036_420;
const FFMPEG_SIGNATURE_SHA256 = "b613a00005232a1245ace7080088781ac23a916119d3e5b0d6c042368eee0177";
const FFMPEG_SIGNATURE_BYTES = 520;
const EXPECTED_RUNTIME_SHA256 = "7c167a3e5a7e9021a0b3584a3a660bdd6880938b0d14128699486d97e12996b9";
const EXPECTED_RUNTIME_BYTES = 3_000_560;
const MAXIMUM_RUNTIME_BYTES = 32 * 1024 * 1024;
const commandOutputLimit = 512 * 1024;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const providerDir = path.join(scriptDir, "providers");
const sourceInputs = Object.freeze([
  ["anchor-color-classification-provider.hpp", "58ffd0e6e434f1609527bb95666fdc8996f4e3faab090ef40b4122185e312d8c"],
  ["tracking-native-stage-json.hpp", "45e442771919c1d2ca1dbee5f723b7ec87d9af6e0edc8e10f3c663e6c4a6ad3a"],
  ["anchor-color-classification-contract.mm", "0f4b26f77c9d0b95e8e7acea179d8ad75ba0b1fb004a6ca485c9d4ee599fd671"],
  ["anchor-color-classification.mm", "34a351b74d6beabc1ce6e702906154041ccd15d0a445a38d69174602b1070747"],
  ["anchor-color-classifier-spec.json", "54e69a6a1af93db0d6cf6d10df1fab3b6b2683851155b6a84c11ec44526a4294"],
  ["yolox-native-ffmpeg-decoder.hpp", "6599dc36cdaf3fe7461aa46b8b9218e9525747e7473a522d34a8d8cdd48e030f"],
  ["yolox-native-ffmpeg-decoder.cc", "666378bbd71c9a0a323a334a137c68170b93a6b977143da5a19eda029c1c4f1f"],
]);
const expectedFfmpegComponents = Object.freeze([
  "CONFIG_FILE_PROTOCOL", "CONFIG_H264_DECODER", "CONFIG_H264_PARSER", "CONFIG_MOV_DEMUXER",
]);

export function anchorColorClassificationBuildIdentity() {
  return {
    protocol: "football-science-anchor-color-native-build-v1",
    runtime: { sha256: EXPECTED_RUNTIME_SHA256, bytes: EXPECTED_RUNTIME_BYTES, architecture: "arm64" },
    ffmpeg: {
      version: FFMPEG_VERSION,
      archiveSha256: FFMPEG_ARCHIVE_SHA256,
      archiveBytes: FFMPEG_ARCHIVE_BYTES,
      detachedSignatureSha256: FFMPEG_SIGNATURE_SHA256,
      detachedSignatureBytes: FFMPEG_SIGNATURE_BYTES,
    },
    sourceFiles: sourceInputs.map(([name, sha256]) => ({ name, sha256 })),
  };
}

export class AnchorColorClassificationBuildError extends Error {
  constructor(message, code = "TRACKING_ANCHOR_COLOR_BUILD_FAILED", options = {}) {
    super(message, options);
    this.name = "AnchorColorClassificationBuildError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new AnchorColorClassificationBuildError(message, code);
}

function environment(extra = {}) {
  return {
    PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C", TZ: "UTC",
    SOURCE_DATE_EPOCH: "315532800", ZERO_AR_DATE: "1", ...extra,
  };
}

function appendBounded(current, chunk) {
  return `${current}${chunk}`.slice(-commandOutputLimit);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || environment(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = appendBounded(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = appendBounded(stderr, chunk); });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0 && !signal) resolve({ stdout, stderr });
      else reject(new AnchorColorClassificationBuildError(
        `${path.basename(command)} failed: ${(stderr || stdout).trim() || `exit ${code ?? signal}`}`,
        "TRACKING_ANCHOR_COLOR_BUILD_PROCESS_FAILED",
      ));
    });
  });
}

async function fileSha256(filePath, maximumBytes, label) {
  const stat = await fs.lstat(filePath).catch((error) => {
    throw new AnchorColorClassificationBuildError(
      `${label} is unavailable.`, "TRACKING_ANCHOR_COLOR_BUILD_INPUT_MISSING", { cause: error },
    );
  });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > maximumBytes) {
    invalid(`${label} is not one bounded regular file.`, "TRACKING_ANCHOR_COLOR_BUILD_INPUT_UNSAFE");
  }
  const handle = await fs.open(filePath, "r");
  try {
    const initial = await handle.stat({ bigint: true });
    const digest = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (position < stat.size) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, stat.size - position), position);
      if (!bytesRead) invalid(`${label} changed while hashing.`, "TRACKING_ANCHOR_COLOR_BUILD_INPUT_CHANGED");
      digest.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const final = await handle.stat({ bigint: true });
    if (initial.dev !== final.dev || initial.ino !== final.ino || initial.size !== final.size
      || initial.mtimeNs !== final.mtimeNs || initial.ctimeNs !== final.ctimeNs) {
      invalid(`${label} changed while hashing.`, "TRACKING_ANCHOR_COLOR_BUILD_INPUT_CHANGED");
    }
    return { bytes: stat.size, sha256: digest.digest("hex") };
  } finally {
    await handle.close();
  }
}

async function exactFile(filePath, expectedSha256, maximumBytes, label, expectedBytes = 0) {
  const result = await fileSha256(filePath, maximumBytes, label);
  if (result.sha256 !== expectedSha256 || (expectedBytes && result.bytes !== expectedBytes)) {
    invalid(`${label} checksum or size changed: ${result.sha256}/${result.bytes}.`,
      "TRACKING_ANCHOR_COLOR_BUILD_CHECKSUM_MISMATCH");
  }
  return result;
}

export function parseAnchorColorClassificationBuildArguments(values = []) {
  const options = { ffmpegArchivePath: "", ffmpegSignaturePath: "", outputPath: "", json: false };
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--json") options.json = true;
    else if (["--ffmpeg-archive", "--ffmpeg-signature", "--output"].includes(argument)) {
      const value = values[++index];
      if (!value || value.startsWith("--")) invalid(`${argument} requires a value.`);
      if (argument === "--ffmpeg-archive") options.ffmpegArchivePath = value;
      else if (argument === "--ffmpeg-signature") options.ffmpegSignaturePath = value;
      else options.outputPath = value;
    } else invalid(`Unknown build option: ${argument}`);
  }
  if (!options.ffmpegArchivePath || !options.ffmpegSignaturePath || !options.outputPath) {
    invalid("--ffmpeg-archive, --ffmpeg-signature and --output are required.");
  }
  return options;
}

async function assertOutputAvailable(outputPath) {
  try {
    await fs.lstat(outputPath);
    invalid("Build output already exists.", "TRACKING_ANCHOR_COLOR_BUILD_OUTPUT_EXISTS");
  } catch (error) {
    if (error instanceof AnchorColorClassificationBuildError) throw error;
    if (error?.code !== "ENOENT") throw error;
  }
}

async function verifyFfmpegConfiguration(buildDir) {
  const components = await fs.readFile(path.join(buildDir, "config_components.h"), "utf8");
  const enabled = [...components.matchAll(
    /^#define (CONFIG_[A-Z0-9_]+_(?:DECODER|DEMUXER|PARSER|PROTOCOL)) 1$/gm,
  )].map((match) => match[1]).sort();
  if (JSON.stringify(enabled) !== JSON.stringify([...expectedFfmpegComponents].sort())) {
    invalid(`FFmpeg component boundary changed: ${enabled.join(",")}.`,
      "TRACKING_ANCHOR_COLOR_BUILD_FFMPEG_UNSAFE");
  }
  const configuration = await fs.readFile(path.join(buildDir, "config.h"), "utf8");
  for (const feature of ["CONFIG_NETWORK", "CONFIG_SECURETRANSPORT", "CONFIG_VIDEOTOOLBOX"]) {
    if (!configuration.includes(`#define ${feature} 0`)) {
      invalid(`FFmpeg feature boundary changed: ${feature}.`, "TRACKING_ANCHOR_COLOR_BUILD_FFMPEG_UNSAFE");
    }
  }
}

async function verifyRuntime(runtimePath) {
  const architecture = await run("/usr/bin/lipo", ["-archs", runtimePath]);
  if (architecture.stdout.trim() !== "arm64") invalid("Runtime must be one arm64 executable.");
  await run("/usr/bin/codesign", ["--verify", "--strict", runtimePath]);
  const dependencies = await run("/usr/bin/otool", ["-L", runtimePath]);
  if (dependencies.stdout.includes("libav") || /\s(?:@rpath|@loader_path|@executable_path)\//.test(dependencies.stdout)) {
    invalid("Runtime has an unsealed dynamic dependency.", "TRACKING_ANCHOR_COLOR_BUILD_RUNTIME_UNSAFE");
  }
  const symbols = await run("/usr/bin/nm", ["-u", runtimePath]);
  if (/\b_(?:connect|getaddrinfo|socket)\b/.test(symbols.stdout)) {
    invalid("Runtime imports a network primitive.", "TRACKING_ANCHOR_COLOR_BUILD_RUNTIME_UNSAFE");
  }
  const runtime = await fileSha256(runtimePath, MAXIMUM_RUNTIME_BYTES, "Built classifier runtime");
  if (runtime.sha256 !== EXPECTED_RUNTIME_SHA256 || runtime.bytes !== EXPECTED_RUNTIME_BYTES) {
    invalid(`Native classifier runtime mismatch: ${runtime.sha256}/${runtime.bytes}.`,
      "TRACKING_ANCHOR_COLOR_BUILD_RUNTIME_MISMATCH");
  }
  return runtime;
}

export async function buildAnchorColorClassificationProvider(options = {}) {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    invalid("This native reference build supports arm64 macOS only.",
      "TRACKING_ANCHOR_COLOR_BUILD_PLATFORM_UNSUPPORTED");
  }
  const archivePath = path.resolve(options.ffmpegArchivePath || "");
  const signaturePath = path.resolve(options.ffmpegSignaturePath || "");
  const outputPath = path.resolve(options.outputPath || "");
  await assertOutputAvailable(outputPath);
  const ffmpegArchive = await exactFile(
    archivePath, FFMPEG_ARCHIVE_SHA256, 32 * 1024 * 1024, "FFmpeg release archive", FFMPEG_ARCHIVE_BYTES,
  );
  const ffmpegSignature = await exactFile(
    signaturePath, FFMPEG_SIGNATURE_SHA256, 4096, "FFmpeg detached signature", FFMPEG_SIGNATURE_BYTES,
  );
  const sources = [];
  for (const [name, sha256] of sourceInputs) {
    sources.push({ name, ...(await exactFile(path.join(providerDir, name), sha256, 2 * 1024 * 1024,
      `Classifier source ${name}`)) });
  }
  const stagedDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-anchor-color-build-"));
  try {
    await run("/usr/bin/tar", ["-xf", archivePath, "-C", stagedDir, FFMPEG_ROOT]);
    const ffmpegSourceDir = path.join(stagedDir, FFMPEG_ROOT);
    const buildDir = path.join(stagedDir, "ffmpeg-build");
    const installDir = path.join(stagedDir, "ffmpeg-install");
    const tmpDir = path.join(stagedDir, "tmp");
    await fs.mkdir(buildDir, { mode: 0o700 });
    await fs.mkdir(tmpDir, { mode: 0o700 });
    const buildEnvironment = environment({
      HOME: stagedDir, TMPDIR: tmpDir, MACOSX_DEPLOYMENT_TARGET: "13.0",
    });
    const mappedFlags = `-mmacosx-version-min=13.0 -ffile-prefix-map=${stagedDir}=/fs-build`;
    await run(path.join(ffmpegSourceDir, "configure"), [
      `--prefix=${installDir}`, "--arch=arm64", "--target-os=darwin", "--cc=/usr/bin/clang",
      "--cxx=/usr/bin/clang++", "--disable-autodetect", "--disable-programs", "--disable-doc",
      "--disable-debug", "--disable-network", "--disable-everything", "--disable-avdevice",
      "--disable-avfilter", "--disable-swresample", "--disable-iconv", "--disable-zlib",
      "--disable-bzlib", "--disable-lzma", "--disable-securetransport", "--disable-videotoolbox",
      "--disable-audiotoolbox", "--enable-avcodec", "--enable-avformat", "--enable-avutil",
      "--enable-swscale", "--enable-decoder=h264", "--enable-parser=h264", "--enable-demuxer=mov",
      "--enable-protocol=file", "--enable-pthreads", "--enable-static", "--disable-shared",
      `--extra-cflags=${mappedFlags}`, `--extra-cxxflags=${mappedFlags}`,
      "--extra-ldflags=-mmacosx-version-min=13.0",
    ], { cwd: buildDir, env: buildEnvironment });
    await verifyFfmpegConfiguration(buildDir);
    await run("/usr/bin/make", ["-j1"], { cwd: buildDir, env: buildEnvironment });
    await run("/usr/bin/make", ["install-libs", "install-headers"], { cwd: buildDir, env: buildEnvironment });
    const runtimePath = path.join(stagedDir, "provider");
    await run("/usr/bin/xcrun", [
      "clang++", "-std=c++20", "-O3", "-DNDEBUG", "-fobjc-arc", "-arch", "arm64",
      "-mmacosx-version-min=13.0", `-ffile-prefix-map=${stagedDir}=/fs-build`,
      "-I", providerDir, "-I", path.join(installDir, "include"),
      path.join(providerDir, "anchor-color-classification-contract.mm"),
      path.join(providerDir, "anchor-color-classification.mm"),
      path.join(providerDir, "yolox-native-ffmpeg-decoder.cc"),
      path.join(installDir, "lib", "libavformat.a"), path.join(installDir, "lib", "libavcodec.a"),
      path.join(installDir, "lib", "libswscale.a"), path.join(installDir, "lib", "libavutil.a"),
      "-framework", "Foundation", "-Wl,-dead_strip", "-Wl,-fatal_warnings", "-o", runtimePath,
    ], { cwd: stagedDir, env: environment({ HOME: stagedDir, TMPDIR: tmpDir }) });
    await run("/usr/bin/strip", ["-S", "-x", runtimePath]);
    await run("/usr/bin/codesign", ["--force", "--sign", "-", "--timestamp=none", runtimePath]);
    const runtime = await verifyRuntime(runtimePath);
    await fs.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
    await fs.chmod(runtimePath, 0o555);
    await fs.rename(runtimePath, outputPath);
    return Object.freeze({
      ok: true,
      outputPath,
      modelPath: path.join(providerDir, "anchor-color-classifier-spec.json"),
      runtime: { ...runtime, architecture: "arm64" },
      source: {
        ffmpegArchiveSha256: ffmpegArchive.sha256,
        ffmpegDetachedSignatureSha256: ffmpegSignature.sha256,
        files: sources.map(({ name, sha256 }) => ({ name, sha256 })),
      },
    });
  } finally {
    await fs.rm(stagedDir, { recursive: true, force: true });
  }
}

async function main(values = process.argv.slice(2)) {
  let options;
  try {
    options = parseAnchorColorClassificationBuildArguments(values);
    const result = await buildAnchorColorClassificationProvider(options);
    console.log(options.json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(options?.json ? JSON.stringify({ ok: false, code: error.code, error: error.message })
      : `${error.code || "TRACKING_ANCHOR_COLOR_BUILD_FAILED"}: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
