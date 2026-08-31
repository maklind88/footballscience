#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ORT_VERSION = "1.19.2";
const ORT_ROOT = `onnxruntime-osx-arm64-${ORT_VERSION}`;
const ORT_ARCHIVE_SHA256 = "370c49770e2e1f243e17c7b227bb7f4b3da793b847d02f38016dc0e46c30fbe1";
const ORT_DYLIB_SHA256 = "183dca3132c8f0e2f0a1a30da3bcf7dee634cd6a7d5bf99b47f3d7ffe2791799";
const ORT_DYLIB_BYTES = 26_090_520;
const FFMPEG_VERSION = "9.0.1";
const FFMPEG_ROOT = `ffmpeg-${FFMPEG_VERSION}`;
const FFMPEG_ARCHIVE_SHA256 = "cf38e0e28c7e5605942c4a77755349b0145804a397af37eb1fb4c77cb237f635";
const FFMPEG_ARCHIVE_BYTES = 12_036_420;
const FFMPEG_SIGNATURE_SHA256 = "b613a00005232a1245ace7080088781ac23a916119d3e5b0d6c042368eee0177";
const FFMPEG_SIGNATURE_BYTES = 520;
const EXPECTED_RUNTIME_SHA256 = "1af02eaa25f043b90b14d2c24afadd19888445d1c705635db8a9e209fd0d84e3";
const EXPECTED_RUNTIME_BYTES = 29_135_648;
const MAXIMUM_ORT_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAXIMUM_FFMPEG_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAXIMUM_SIGNATURE_BYTES = 4 * 1024;
const MAXIMUM_RUNTIME_BYTES = 64 * 1024 * 1024;
const commandOutputLimit = 512 * 1024;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const providerDir = path.join(scriptDir, "providers");
const sourceInputs = Object.freeze([
  ["yolox-native-coreml-provider.hpp", "1ecf58132fa5f1f29b8fa4a5baf5cb006272d95ec2ef316b2946183d09a67ee4"],
  ["yolox-native-coreml-provider.mm", "d1dced6ca412e77a722cda410b6eda482a864126353c31b66925741404f82a08"],
  ["yolox-native-coreml-contract.mm", "0f15ff8539e28a6b5cb8121393cf1375f909e61124ea926c97765f5ef3967c26"],
  ["yolox-native-coreml-inference.mm", "ff318478171ef567b665e47b3d0590d7be321d702479da06519baae79c807b6d"],
  ["yolox-native-ffmpeg-decoder.hpp", "6599dc36cdaf3fe7461aa46b8b9218e9525747e7473a522d34a8d8cdd48e030f"],
  ["yolox-native-ffmpeg-decoder.cc", "666378bbd71c9a0a323a334a137c68170b93a6b977143da5a19eda029c1c4f1f"],
]);
const expectedFfmpegComponents = Object.freeze([
  "CONFIG_FILE_PROTOCOL",
  "CONFIG_H264_DECODER",
  "CONFIG_H264_PARSER",
  "CONFIG_MOV_DEMUXER",
]);
const disabledFfmpegFeatures = Object.freeze([
  "CONFIG_AUDIOTOOLBOX", "CONFIG_AVDEVICE", "CONFIG_AVFILTER", "CONFIG_BZLIB",
  "CONFIG_ICONV", "CONFIG_LZMA", "CONFIG_NETWORK", "CONFIG_SECURETRANSPORT",
  "CONFIG_SWRESAMPLE", "CONFIG_VIDEOTOOLBOX", "CONFIG_ZLIB",
]);

export class NativeTrackingCandidateBuildError extends Error {
  constructor(message, code = "TRACKING_NATIVE_CANDIDATE_BUILD_FAILED", options = {}) {
    super(message, options);
    this.name = "NativeTrackingCandidateBuildError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new NativeTrackingCandidateBuildError(message, code);
}

function appendBounded(current, chunk) {
  return `${current}${chunk}`.slice(-commandOutputLimit);
}

function reproducibleEnvironment(extra = {}) {
  return {
    PATH: "/usr/bin:/bin",
    LANG: "C",
    LC_ALL: "C",
    TZ: "UTC",
    SOURCE_DATE_EPOCH: "315532800",
    ZERO_AR_DATE: "1",
    ...extra,
  };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || reproducibleEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = appendBounded(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = appendBounded(stderr, chunk); });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0 && !signal) resolve({ stdout, stderr });
      else reject(new NativeTrackingCandidateBuildError(
        `${path.basename(command)} failed: ${(stderr || stdout).trim() || `exit ${code ?? signal}`}`,
        "TRACKING_NATIVE_CANDIDATE_BUILD_PROCESS_FAILED",
      ));
    });
  });
}

async function regularFile(filePath, maximumBytes, label, options = {}) {
  let stat;
  try {
    stat = await fs.lstat(filePath);
  } catch (error) {
    throw new NativeTrackingCandidateBuildError(
      `${label} is unavailable.`,
      "TRACKING_NATIVE_CANDIDATE_BUILD_INPUT_MISSING",
      { cause: error },
    );
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > maximumBytes) {
    invalid(`${label} is not one bounded regular file.`, "TRACKING_NATIVE_CANDIDATE_BUILD_INPUT_UNSAFE");
  }
  if (options.executable && !(stat.mode & 0o111)) {
    invalid(`${label} is not executable.`, "TRACKING_NATIVE_CANDIDATE_BUILD_INPUT_UNSAFE");
  }
  return stat;
}

async function fileSha256(filePath, maximumBytes, label) {
  await regularFile(filePath, maximumBytes, label);
  const handle = await fs.open(filePath, "r");
  try {
    const digest = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    const initial = await handle.stat({ bigint: true });
    const bytes = Number(initial.size);
    let position = 0;
    while (position < bytes) {
      const { bytesRead } = await handle.read(
        buffer, 0, Math.min(buffer.length, bytes - position), position,
      );
      if (!bytesRead) invalid(`${label} changed while hashing.`, "TRACKING_NATIVE_CANDIDATE_BUILD_INPUT_CHANGED");
      digest.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const final = await handle.stat({ bigint: true });
    if (initial.dev !== final.dev || initial.ino !== final.ino || initial.size !== final.size
      || initial.mtimeNs !== final.mtimeNs || initial.ctimeNs !== final.ctimeNs) {
      invalid(`${label} changed while hashing.`, "TRACKING_NATIVE_CANDIDATE_BUILD_INPUT_CHANGED");
    }
    return { bytes, sha256: digest.digest("hex") };
  } finally {
    await handle.close();
  }
}

async function exactSha256(filePath, expected, maximumBytes, label) {
  const value = await fileSha256(filePath, maximumBytes, label);
  if (value.sha256 !== expected) {
    invalid(`${label} checksum does not match the reviewed input.`,
      "TRACKING_NATIVE_CANDIDATE_BUILD_CHECKSUM_MISMATCH");
  }
  return value;
}

export function parseNativeTrackingCandidateBuildArguments(values = []) {
  const options = {
    ffmpegArchivePath: "",
    ffmpegSignaturePath: "",
    json: false,
    onnxruntimeArchivePath: "",
    outputPath: "",
  };
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--json") options.json = true;
    else if (["--ffmpeg-archive", "--ffmpeg-signature", "--onnxruntime-archive", "--output"]
      .includes(argument)) {
      const value = values[index + 1];
      if (!value || value.startsWith("--")) invalid(`${argument} requires a value.`);
      if (argument === "--ffmpeg-archive") options.ffmpegArchivePath = value;
      else if (argument === "--ffmpeg-signature") options.ffmpegSignaturePath = value;
      else if (argument === "--onnxruntime-archive") options.onnxruntimeArchivePath = value;
      else if (argument === "--output") options.outputPath = value;
      index += 1;
    } else invalid(`Unknown build option: ${argument}`);
  }
  if (!options.ffmpegArchivePath || !options.ffmpegSignaturePath
    || !options.onnxruntimeArchivePath || !options.outputPath) {
    invalid("--ffmpeg-archive, --ffmpeg-signature, --onnxruntime-archive and --output are required.");
  }
  return options;
}

async function assertOutputAvailable(outputPath) {
  try {
    await fs.lstat(outputPath);
    invalid("Build output already exists.", "TRACKING_NATIVE_CANDIDATE_BUILD_OUTPUT_EXISTS");
  } catch (error) {
    if (error instanceof NativeTrackingCandidateBuildError) throw error;
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
      "TRACKING_NATIVE_CANDIDATE_BUILD_FFMPEG_UNSAFE");
  }
  const configuration = await fs.readFile(path.join(buildDir, "config.h"), "utf8");
  for (const feature of disabledFfmpegFeatures) {
    if (!configuration.includes(`#define ${feature} 0`)) {
      invalid(`FFmpeg feature boundary changed: ${feature}.`,
        "TRACKING_NATIVE_CANDIDATE_BUILD_FFMPEG_UNSAFE");
    }
  }
}

async function verifyRuntime(runtimePath) {
  const architecture = await run("/usr/bin/lipo", ["-archs", runtimePath]);
  if (architecture.stdout.trim() !== "arm64") {
    invalid("Native tracking runtime must be one arm64 executable.",
      "TRACKING_NATIVE_CANDIDATE_BUILD_RUNTIME_UNSAFE");
  }
  await run("/usr/bin/codesign", ["--verify", "--strict", runtimePath]);
  const dependencies = await run("/usr/bin/otool", ["-L", runtimePath]);
  if (dependencies.stdout.includes("onnxruntime") || dependencies.stdout.includes("libav")
    || /\s(?:@rpath|@loader_path|@executable_path)\//.test(dependencies.stdout)) {
    invalid("Native tracking runtime has an unsealed dynamic dependency.",
      "TRACKING_NATIVE_CANDIDATE_BUILD_RUNTIME_UNSAFE");
  }
  const loadCommands = await run("/usr/bin/otool", ["-l", runtimePath]);
  if (!/^\s*minos 13\.0$/m.test(loadCommands.stdout)
    || !/^\s*cmd LC_UUID$/m.test(loadCommands.stdout)) {
    invalid("Native tracking runtime does not preserve its macOS 13 boundary.",
      "TRACKING_NATIVE_CANDIDATE_BUILD_RUNTIME_UNSAFE");
  }
  const symbols = await run("/usr/bin/nm", ["-u", runtimePath]);
  if (/\b_(?:connect|getaddrinfo|socket)\b/.test(symbols.stdout)) {
    invalid("Native tracking runtime imports a network primitive.",
      "TRACKING_NATIVE_CANDIDATE_BUILD_RUNTIME_UNSAFE");
  }
  const runtime = await fileSha256(runtimePath, MAXIMUM_RUNTIME_BYTES, "Built native provider runtime");
  if (runtime.sha256 !== EXPECTED_RUNTIME_SHA256 || runtime.bytes !== EXPECTED_RUNTIME_BYTES) {
    invalid(`Native tracking runtime mismatch: ${runtime.sha256}/${runtime.bytes}.`,
      "TRACKING_NATIVE_CANDIDATE_BUILD_RUNTIME_MISMATCH");
  }
  return runtime;
}

export async function buildYoloxNativeCoremlReferenceProvider(options = {}) {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    invalid("This native reference build supports arm64 macOS only.",
      "TRACKING_NATIVE_CANDIDATE_BUILD_PLATFORM_UNSUPPORTED");
  }
  const archivePath = path.resolve(options.onnxruntimeArchivePath || "");
  const ffmpegArchivePath = path.resolve(options.ffmpegArchivePath || "");
  const ffmpegSignaturePath = path.resolve(options.ffmpegSignaturePath || "");
  const outputPath = path.resolve(options.outputPath || "");
  await assertOutputAvailable(outputPath);
  const archive = await exactSha256(
    archivePath, ORT_ARCHIVE_SHA256, MAXIMUM_ORT_ARCHIVE_BYTES, "ONNX Runtime release archive",
  );
  const ffmpegArchive = await exactSha256(
    ffmpegArchivePath, FFMPEG_ARCHIVE_SHA256,
    MAXIMUM_FFMPEG_ARCHIVE_BYTES, "FFmpeg release archive",
  );
  const ffmpegSignature = await exactSha256(
    ffmpegSignaturePath, FFMPEG_SIGNATURE_SHA256,
    MAXIMUM_SIGNATURE_BYTES, "FFmpeg detached release signature",
  );
  if (ffmpegArchive.bytes !== FFMPEG_ARCHIVE_BYTES
    || ffmpegSignature.bytes !== FFMPEG_SIGNATURE_BYTES) {
    invalid("FFmpeg reviewed release input size changed.",
      "TRACKING_NATIVE_CANDIDATE_BUILD_CHECKSUM_MISMATCH");
  }
  const sources = [];
  for (const [name, sha256] of sourceInputs) {
    sources.push({ name, ...(await exactSha256(
      path.join(providerDir, name), sha256, 1024 * 1024, `Native provider source ${name}`,
    )) });
  }

  const stagedDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-yolox-native-provider-build-"));
  try {
    const members = [
      `${ORT_ROOT}/include`,
      `${ORT_ROOT}/lib/libonnxruntime.${ORT_VERSION}.dylib`,
      `${ORT_ROOT}/LICENSE`,
      `${ORT_ROOT}/ThirdPartyNotices.txt`,
      `${ORT_ROOT}/GIT_COMMIT_ID`,
      `${ORT_ROOT}/VERSION_NUMBER`,
    ];
    await run("/usr/bin/tar", ["-xzf", archivePath, "-C", stagedDir, ...members]);
    const ortRoot = path.join(stagedDir, ORT_ROOT);
    const dylibPath = path.join(ortRoot, "lib", `libonnxruntime.${ORT_VERSION}.dylib`);
    const dylib = await exactSha256(
      dylibPath, ORT_DYLIB_SHA256, 32 * 1024 * 1024, "ONNX Runtime CoreML library",
    );
    if (dylib.bytes !== ORT_DYLIB_BYTES) {
      invalid("ONNX Runtime CoreML library size changed.",
        "TRACKING_NATIVE_CANDIDATE_BUILD_CHECKSUM_MISMATCH");
    }
    await run("/usr/bin/codesign", ["--verify", "--strict", dylibPath]);

    await run("/usr/bin/tar", ["-xf", ffmpegArchivePath, "-C", stagedDir, FFMPEG_ROOT]);
    const ffmpegSourceDir = path.join(stagedDir, FFMPEG_ROOT);
    const ffmpegBuildDir = path.join(stagedDir, "ffmpeg-build");
    const ffmpegInstallDir = path.join(stagedDir, "ffmpeg-install");
    await fs.mkdir(ffmpegBuildDir, { mode: 0o700 });
    const compilerTmpDir = path.join(stagedDir, "tmp");
    await fs.mkdir(compilerTmpDir, { mode: 0o700 });
    const ffmpegEnvironment = reproducibleEnvironment({
      HOME: stagedDir,
      TMPDIR: compilerTmpDir,
      MACOSX_DEPLOYMENT_TARGET: "13.0",
    });
    const mappedCFlags = `-mmacosx-version-min=13.0 -ffile-prefix-map=${stagedDir}=/fs-build`;
    await run(path.join(ffmpegSourceDir, "configure"), [
      `--prefix=${ffmpegInstallDir}`,
      "--arch=arm64", "--target-os=darwin", "--cc=/usr/bin/clang", "--cxx=/usr/bin/clang++",
      "--disable-autodetect", "--disable-programs", "--disable-doc", "--disable-debug",
      "--disable-network", "--disable-everything", "--disable-avdevice", "--disable-avfilter",
      "--disable-swresample", "--disable-iconv", "--disable-zlib", "--disable-bzlib",
      "--disable-lzma", "--disable-securetransport", "--disable-videotoolbox",
      "--disable-audiotoolbox", "--enable-avcodec", "--enable-avformat", "--enable-avutil",
      "--enable-swscale", "--enable-decoder=h264", "--enable-parser=h264",
      "--enable-demuxer=mov", "--enable-protocol=file", "--enable-pthreads",
      "--enable-static", "--disable-shared", `--extra-cflags=${mappedCFlags}`,
      `--extra-cxxflags=${mappedCFlags}`, "--extra-ldflags=-mmacosx-version-min=13.0",
    ], { cwd: ffmpegBuildDir, env: ffmpegEnvironment });
    await verifyFfmpegConfiguration(ffmpegBuildDir);
    await run("/usr/bin/make", ["-j1"], { cwd: ffmpegBuildDir, env: ffmpegEnvironment });
    await run("/usr/bin/make", ["install-libs", "install-headers"], {
      cwd: ffmpegBuildDir,
      env: ffmpegEnvironment,
    });

    const runtimePath = path.join(stagedDir, "provider");
    await run("/usr/bin/xcrun", [
      "clang++", "-std=c++20", "-O3", "-DNDEBUG", "-fobjc-arc", "-arch", "arm64",
      "-mmacosx-version-min=13.0", "-ffile-prefix-map=" + stagedDir + "=/fs-build",
      "-I", path.join(ortRoot, "include"), "-I", path.join(ffmpegInstallDir, "include"),
      ...sourceInputs.filter(([name]) => name.endsWith(".mm") || name.endsWith(".cc"))
        .map(([name]) => path.join(providerDir, name)),
      path.join(ffmpegInstallDir, "lib", "libavformat.a"),
      path.join(ffmpegInstallDir, "lib", "libavcodec.a"),
      path.join(ffmpegInstallDir, "lib", "libswscale.a"),
      path.join(ffmpegInstallDir, "lib", "libavutil.a"),
      "-framework", "Foundation", "-Wl,-dead_strip", "-Wl,-fatal_warnings",
      `-Wl,-sectcreate,__DATA,__ortlib,${dylibPath}`,
      "-o", runtimePath,
    ], {
      cwd: stagedDir,
      env: reproducibleEnvironment({ HOME: stagedDir, TMPDIR: compilerTmpDir }),
    });
    await run("/usr/bin/strip", ["-S", "-x", runtimePath]);
    await run("/usr/bin/codesign", [
      "--force", "--sign", "-", "--timestamp=none", runtimePath,
    ]);
    const runtime = await verifyRuntime(runtimePath);
    await fs.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
    await fs.chmod(runtimePath, 0o555);
    await fs.rename(runtimePath, outputPath);
    return Object.freeze({
      ok: true,
      outputPath,
      runtime: { ...runtime, architecture: "arm64", embeddedOrtSha256: dylib.sha256 },
      source: {
        ffmpegArchiveSha256: ffmpegArchive.sha256,
        ffmpegDetachedSignatureSha256: ffmpegSignature.sha256,
        onnxruntimeArchiveSha256: archive.sha256,
        onnxruntimeDylibSha256: dylib.sha256,
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
    options = parseNativeTrackingCandidateBuildArguments(values);
    const result = await buildYoloxNativeCoremlReferenceProvider(options);
    console.log(options.json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(options?.json
      ? JSON.stringify({ ok: false, code: error.code || "TRACKING_NATIVE_CANDIDATE_BUILD_FAILED",
        error: error.message })
      : error.message);
    process.exitCode = 1;
  }
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (direct) await main();
