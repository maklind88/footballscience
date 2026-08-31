#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BYTETRACK_COMMIT = "d1bf0191adff59bc8fcfeaa0b33d3d1642552a99";
const BYTETRACK_ROOT = "ByteTrack-d1bf019";
const BYTETRACK_ARCHIVE_SHA256 = "1bb85ad045049de1fe8d672b4c9700cb1f7ab59bb87084f3550dd9c8c97de6bc";
const BYTETRACK_ARCHIVE_BYTES = 61_440;
const EIGEN_VERSION = "3.4.0";
const EIGEN_ROOT = `eigen-${EIGEN_VERSION}`;
const EIGEN_ARCHIVE_SHA256 = "8586084f71f9bde545ee7fa6d00288b264a2b7ac3607b974e54d13e7162c1c72";
const EIGEN_ARCHIVE_BYTES = 2_705_005;
const EIGEN_MPL2_SHA256 = "fab3dd6bdab226f1c08630b1dd917e11fcb4ec5e1e020e2c16f83a0a13863e85";
const RYU_COMMIT = "4c0618b0e44f7ef027ebae05d2cc7812048f7c8f";
const RYU_ROOT = "ryu-4c0618b";
const RYU_ARCHIVE_SHA256 = "092d0469a28b9854222a6182190816c3b2e04fa291622f97e210cc5e70397d5b";
const RYU_ARCHIVE_BYTES = 92_160;
const RYU_APACHE2_SHA256 = "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4";
const EXPECTED_RUNTIME_SHA256 = "bc6f0dd9351e272feab80d24c915d30d7bee91cae3539c60d4cbdb193ba1fb4b";
const EXPECTED_RUNTIME_BYTES = 228_352;
const MAXIMUM_SOURCE_ARCHIVE_BYTES = 4 * 1024 * 1024;
const MAXIMUM_RUNTIME_BYTES = 4 * 1024 * 1024;
const commandOutputLimit = 512 * 1024;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const providerDir = path.join(scriptDir, "providers");
const adapterInputs = Object.freeze([
  ["bytetrack-native-provider.hpp", "d7bcf70a7f5ff2149223edca2348b0384cf79f9da7c2138cf6ccf362f700069c"],
  ["bytetrack-native-contract.mm", "5d0567201090dfe90ee5421e31ea86feae4a9126cddcad315eb89955571b8105"],
  ["bytetrack-native-association.mm", "f81585834a4e14ed0e93fdfa18ea521520b99b7e7e7dfa3a2dcbd819ebb67825"],
  ["bytetrack-native-core.patch", "88b9a0c2c95244172baf823414abfb85219e047f4ebfb0c55ef5392e3154cd6c"],
]);
const upstreamInputs = Object.freeze([
  ["LICENSE", "e9d83751678cbaba6dfba902ea39215c423d93425e58f8450d6001f7261696f9"],
  ["deploy/ncnn/cpp/include/BYTETracker.h", "009ca5da576d5981bbda299d2d79c2434ca0c777de9f384749165714c522c249"],
  ["deploy/ncnn/cpp/include/STrack.h", "ff4141ed68f4ece770e4e80f78f838fab637c47e485c931fb61af48e7c3ecad5"],
  ["deploy/ncnn/cpp/include/dataType.h", "9f3143d48535b0ccb1b092d3bc59e6d72321893b7a0d86fa4af3f9877495b7fb"],
  ["deploy/ncnn/cpp/include/kalmanFilter.h", "f4a2884262d4f77877fc2e9f3f1a6bf7284178be2ac596926e9594b118cee946"],
  ["deploy/ncnn/cpp/include/lapjv.h", "f89cff1b5d1858217956fd022bf807c309b82443622f13a6e8c7fcf584cc5790"],
  ["deploy/ncnn/cpp/src/BYTETracker.cpp", "0047c805608d9b7aa098c3e616363e7cd45f20f04fe251ef558a72ad8d58b3dc"],
  ["deploy/ncnn/cpp/src/STrack.cpp", "b4eb9c5b2f6b403fee80581f3387fdacb6dc008a35b407082b292f840e6e440c"],
  ["deploy/ncnn/cpp/src/kalmanFilter.cpp", "3efeac165a03955382cc157582f6e85173e264015dc5a1f70b0d2ff370df2fe6"],
  ["deploy/ncnn/cpp/src/lapjv.cpp", "8714e7e1204d4daeb1349f3310ef73cf5dcd848e387664700d3370d0bd301157"],
  ["deploy/ncnn/cpp/src/utils.cpp", "25907e02630e63d785f82a594700581f47c2c730c52e1355803a246728df8af2"],
]);
const ryuInputs = Object.freeze([
  ["ryu/d2s.c", "d24323c7eb77d63f1e52c415212b50060b776f0883525d907d04954fcd48cf64"],
  ["ryu/common.h", "0bbd71d26da6193e678d0776cf418f43f287c73d6fd6725353df0aadf70f2a19"],
  ["ryu/d2s_full_table.h", "2618f6e5fae6c4443899b184efe3d08295dd267dc9f1a994c983c7caca59ebe6"],
  ["ryu/d2s_intrinsics.h", "1d05702f2edacce428223d4b43dd3095c1bd1f3ad30128ce1761d84356dddc7d"],
  ["ryu/digit_table.h", "8b782573abc0b8554d74163ae6c02f0beb5c30d1e63eaebdb0ddf2c98d817e01"],
  ["ryu/ryu.h", "b7feab0ba1df5e9ef3d602f386592ad152491405e49b408fb21c0e0e9e6bfb16"],
]);

export class ByteTrackCandidateBuildError extends Error {
  constructor(message, code = "TRACKING_BYTETRACK_BUILD_FAILED", options = {}) {
    super(message, options);
    this.name = "ByteTrackCandidateBuildError";
    this.code = code;
  }
}

function invalid(message, code) {
  throw new ByteTrackCandidateBuildError(message, code);
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
      else reject(new ByteTrackCandidateBuildError(
        `${path.basename(command)} failed: ${(stderr || stdout).trim() || `exit ${code ?? signal}`}`,
        "TRACKING_BYTETRACK_BUILD_PROCESS_FAILED",
      ));
    });
  });
}

async function regularFile(filePath, maximumBytes, label) {
  let stat;
  try {
    stat = await fs.lstat(filePath);
  } catch (error) {
    throw new ByteTrackCandidateBuildError(
      `${label} is unavailable.`, "TRACKING_BYTETRACK_BUILD_INPUT_MISSING", { cause: error },
    );
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > maximumBytes) {
    invalid(`${label} is not one bounded regular file.`, "TRACKING_BYTETRACK_BUILD_INPUT_UNSAFE");
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
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, bytes - position), position);
      if (!bytesRead) invalid(`${label} changed while hashing.`, "TRACKING_BYTETRACK_BUILD_INPUT_CHANGED");
      digest.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const final = await handle.stat({ bigint: true });
    if (initial.dev !== final.dev || initial.ino !== final.ino || initial.size !== final.size
      || initial.mtimeNs !== final.mtimeNs || initial.ctimeNs !== final.ctimeNs) {
      invalid(`${label} changed while hashing.`, "TRACKING_BYTETRACK_BUILD_INPUT_CHANGED");
    }
    return { bytes, sha256: digest.digest("hex") };
  } finally {
    await handle.close();
  }
}

async function exactSha256(filePath, expected, maximumBytes, label) {
  const value = await fileSha256(filePath, maximumBytes, label);
  if (value.sha256 !== expected) {
    invalid(`${label} checksum does not match the reviewed input.`, "TRACKING_BYTETRACK_BUILD_CHECKSUM_MISMATCH");
  }
  return value;
}

export function parseByteTrackBuildArguments(values = []) {
  const options = {
    byteTrackArchivePath: "", eigenArchivePath: "", json: false, outputPath: "", ryuArchivePath: "",
  };
  const valueOptions = new Map([
    ["--bytetrack-archive", "byteTrackArchivePath"],
    ["--eigen-archive", "eigenArchivePath"],
    ["--ryu-archive", "ryuArchivePath"],
    ["--output", "outputPath"],
  ]);
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--json") options.json = true;
    else if (valueOptions.has(argument)) {
      const value = values[index + 1];
      if (!value || value.startsWith("--")) invalid(`${argument} requires a value.`);
      options[valueOptions.get(argument)] = value;
      index += 1;
    } else invalid(`Unknown build option: ${argument}`);
  }
  if (!options.byteTrackArchivePath || !options.eigenArchivePath || !options.ryuArchivePath || !options.outputPath) {
    invalid("--bytetrack-archive, --eigen-archive, --ryu-archive and --output are required.");
  }
  return options;
}

async function assertOutputAvailable(outputPath) {
  try {
    await fs.lstat(outputPath);
    invalid("Build output already exists.", "TRACKING_BYTETRACK_BUILD_OUTPUT_EXISTS");
  } catch (error) {
    if (error instanceof ByteTrackCandidateBuildError) throw error;
    if (error?.code !== "ENOENT") throw error;
  }
}

async function normalizeReviewedLineEndings(filePath) {
  const value = await fs.readFile(filePath, "utf8");
  if (value.replaceAll("\r\n", "").includes("\r")) {
    invalid("ByteTrack source has unreviewed line endings.", "TRACKING_BYTETRACK_BUILD_SOURCE_UNSAFE");
  }
  await fs.writeFile(filePath, value.replaceAll("\r\n", "\n"));
}

async function verifyRuntime(runtimePath) {
  const architecture = await run("/usr/bin/lipo", ["-archs", runtimePath]);
  if (architecture.stdout.trim() !== "arm64") {
    invalid("ByteTrack runtime must be one arm64 executable.", "TRACKING_BYTETRACK_BUILD_RUNTIME_UNSAFE");
  }
  await run("/usr/bin/codesign", ["--verify", "--strict", runtimePath]);
  const dependencies = await run("/usr/bin/otool", ["-L", runtimePath]);
  if (/\s(?:@rpath|@loader_path|@executable_path)\//.test(dependencies.stdout)) {
    invalid("ByteTrack runtime has an unsealed dynamic dependency.", "TRACKING_BYTETRACK_BUILD_RUNTIME_UNSAFE");
  }
  const commands = await run("/usr/bin/otool", ["-l", runtimePath]);
  if (!/^\s*minos 13\.0$/m.test(commands.stdout) || !/^\s*cmd LC_UUID$/m.test(commands.stdout)) {
    invalid("ByteTrack runtime does not preserve its macOS 13 boundary.", "TRACKING_BYTETRACK_BUILD_RUNTIME_UNSAFE");
  }
  const symbols = await run("/usr/bin/nm", ["-u", runtimePath]);
  if (/\b_(?:connect|getaddrinfo|socket|system)\b/.test(symbols.stdout)) {
    invalid("ByteTrack runtime imports a forbidden primitive.", "TRACKING_BYTETRACK_BUILD_RUNTIME_UNSAFE");
  }
  const runtime = await fileSha256(runtimePath, MAXIMUM_RUNTIME_BYTES, "Built ByteTrack runtime");
  if (runtime.sha256 !== EXPECTED_RUNTIME_SHA256 || runtime.bytes !== EXPECTED_RUNTIME_BYTES) {
    invalid(`ByteTrack runtime mismatch: ${runtime.sha256}/${runtime.bytes}.`,
      "TRACKING_BYTETRACK_BUILD_RUNTIME_MISMATCH");
  }
  return runtime;
}

export async function buildByteTrackNativeReferenceProvider(options = {}) {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    invalid("This ByteTrack build supports arm64 macOS only.", "TRACKING_BYTETRACK_BUILD_PLATFORM_UNSUPPORTED");
  }
  const byteTrackArchivePath = path.resolve(options.byteTrackArchivePath || "");
  const eigenArchivePath = path.resolve(options.eigenArchivePath || "");
  const ryuArchivePath = path.resolve(options.ryuArchivePath || "");
  const outputPath = path.resolve(options.outputPath || "");
  await assertOutputAvailable(outputPath);
  const byteTrackArchive = await exactSha256(
    byteTrackArchivePath, BYTETRACK_ARCHIVE_SHA256, MAXIMUM_SOURCE_ARCHIVE_BYTES, "ByteTrack source archive",
  );
  const eigenArchive = await exactSha256(
    eigenArchivePath, EIGEN_ARCHIVE_SHA256, MAXIMUM_SOURCE_ARCHIVE_BYTES, "Eigen source archive",
  );
  const ryuArchive = await exactSha256(
    ryuArchivePath, RYU_ARCHIVE_SHA256, MAXIMUM_SOURCE_ARCHIVE_BYTES, "Ryu source archive",
  );
  if (byteTrackArchive.bytes !== BYTETRACK_ARCHIVE_BYTES || eigenArchive.bytes !== EIGEN_ARCHIVE_BYTES
    || ryuArchive.bytes !== RYU_ARCHIVE_BYTES) {
    invalid("Reviewed source archive size changed.", "TRACKING_BYTETRACK_BUILD_CHECKSUM_MISMATCH");
  }
  const adapters = [];
  for (const [name, sha256] of adapterInputs) {
    adapters.push({ name, ...(await exactSha256(
      path.join(providerDir, name), sha256, 1024 * 1024, `ByteTrack adapter ${name}`,
    )) });
  }

  const stagedDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-bytetrack-native-build-"));
  try {
    await run("/usr/bin/tar", ["-xf", byteTrackArchivePath, "-C", stagedDir]);
    await run("/usr/bin/tar", ["-xzf", eigenArchivePath, "-C", stagedDir,
      `${EIGEN_ROOT}/Eigen`, `${EIGEN_ROOT}/COPYING.MPL2`]);
    await run("/usr/bin/tar", ["-xf", ryuArchivePath, "-C", stagedDir]);
    const sourceRoot = path.join(stagedDir, BYTETRACK_ROOT);
    const ryuRoot = path.join(stagedDir, RYU_ROOT);
    for (const [relativePath, sha256] of upstreamInputs) {
      const filePath = path.join(sourceRoot, relativePath);
      await exactSha256(filePath, sha256, 1024 * 1024, `ByteTrack upstream ${relativePath}`);
      if (/\.(?:h|cpp)$/.test(relativePath)) await normalizeReviewedLineEndings(filePath);
    }
    await exactSha256(
      path.join(stagedDir, EIGEN_ROOT, "COPYING.MPL2"), EIGEN_MPL2_SHA256,
      1024 * 1024, "Eigen MPL-2.0 licence",
    );
    await exactSha256(
      path.join(ryuRoot, "LICENSE-Apache2"), RYU_APACHE2_SHA256,
      1024 * 1024, "Ryu Apache-2.0 licence",
    );
    for (const [relativePath, sha256] of ryuInputs) {
      await exactSha256(path.join(ryuRoot, relativePath), sha256, 1024 * 1024, `Ryu upstream ${relativePath}`);
    }
    await run("/usr/bin/patch", ["-p1", "-i", path.join(providerDir, "bytetrack-native-core.patch")], {
      cwd: sourceRoot,
    });
    const includeDir = path.join(sourceRoot, "deploy", "ncnn", "cpp", "include");
    const sourceDir = path.join(sourceRoot, "deploy", "ncnn", "cpp", "src");
    const runtimePath = path.join(stagedDir, "provider");
    const ryuObjectPath = path.join(stagedDir, "ryu-d2s.o");
    await run("/usr/bin/xcrun", [
      "clang", "-std=c11", "-O3", "-DNDEBUG", "-fno-ident", "-arch", "arm64",
      "-mmacosx-version-min=13.0", "-Werror", `-ffile-prefix-map=${stagedDir}=/fs-build`,
      "-I", ryuRoot, "-c", path.join(ryuRoot, "ryu", "d2s.c"), "-o", ryuObjectPath,
    ], { cwd: stagedDir, env: reproducibleEnvironment({ HOME: stagedDir, TMPDIR: stagedDir }) });
    await run("/usr/bin/xcrun", [
      "clang++", "-std=c++20", "-O3", "-DNDEBUG", "-fobjc-arc", "-fno-ident",
      "-arch", "arm64", "-mmacosx-version-min=13.0", "-Werror",
      `-ffile-prefix-map=${stagedDir}=/fs-build`, `-ffile-prefix-map=${scriptDir}=/fs-source`,
      "-I", path.join(stagedDir, EIGEN_ROOT), "-I", includeDir, "-I", providerDir, "-I", ryuRoot,
      path.join(providerDir, "bytetrack-native-contract.mm"),
      path.join(providerDir, "bytetrack-native-association.mm"),
      ryuObjectPath,
      ...["BYTETracker.cpp", "STrack.cpp", "kalmanFilter.cpp", "lapjv.cpp", "utils.cpp"]
        .map((name) => path.join(sourceDir, name)),
      "-framework", "Foundation", "-Wl,-dead_strip", "-Wl,-fatal_warnings", "-o", runtimePath,
    ], { cwd: stagedDir, env: reproducibleEnvironment({ HOME: stagedDir, TMPDIR: stagedDir }) });
    await run("/usr/bin/strip", ["-S", "-x", runtimePath]);
    await run("/usr/bin/codesign", ["--force", "--sign", "-", "--timestamp=none", runtimePath]);
    const runtime = await verifyRuntime(runtimePath);
    await fs.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
    await fs.chmod(runtimePath, 0o555);
    await fs.rename(runtimePath, outputPath);
    return Object.freeze({
      ok: true,
      outputPath,
      runtime: { ...runtime, architecture: "arm64" },
      source: {
        byteTrackCommit: BYTETRACK_COMMIT,
        byteTrackArchiveSha256: byteTrackArchive.sha256,
        eigenArchiveSha256: eigenArchive.sha256,
        ryuCommit: RYU_COMMIT,
        ryuArchiveSha256: ryuArchive.sha256,
        files: adapters.map(({ name, sha256 }) => ({ name, sha256 })),
      },
    });
  } finally {
    await fs.rm(stagedDir, { recursive: true, force: true });
  }
}

async function main(values = process.argv.slice(2)) {
  let options;
  try {
    options = parseByteTrackBuildArguments(values);
    const result = await buildByteTrackNativeReferenceProvider(options);
    console.log(options.json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(options?.json
      ? JSON.stringify({ ok: false, code: error.code || "TRACKING_BYTETRACK_BUILD_FAILED", error: error.message })
      : error.message);
    process.exitCode = 1;
  }
}

const direct = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (direct) await main();
