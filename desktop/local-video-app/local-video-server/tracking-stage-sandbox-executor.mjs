import { execFile, spawn } from "node:child_process";
import { constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  captureTrackingFileSeal,
  verifyTrackingFileSeal,
} from "./tracking-file-integrity.mjs";

export const TRACKING_STAGE_EXECUTION_PROTOCOL = "football-science-tracking-stage-execution-v1";
export const TRACKING_STAGE_INVOCATION_PROTOCOL = "football-science-tracking-stage-invocation-v1";

const DARWIN_SANDBOX_PATH = "/usr/bin/sandbox-exec";
const MAXIMUM_DIAGNOSTIC_BYTES = 64 * 1024;
const execFileAsync = promisify(execFile);

export class TrackingStageExecutionError extends Error {
  constructor(message, code = "TRACKING_STAGE_EXECUTION_FAILED") {
    super(message);
    this.name = "TrackingStageExecutionError";
    this.code = code;
  }
}

function executionError(message, code) {
  throw new TrackingStageExecutionError(message, code);
}

function boundedInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum
    ? number
    : fallback;
}

function exactFingerprint(value, label) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) {
    executionError(`${label} must be a SHA-256 hash.`, "TRACKING_STAGE_INVOCATION_INVALID");
  }
  return text;
}

function sandboxLiteral(value) {
  return JSON.stringify(String(value || ""));
}

function ancestorDirectories(values = []) {
  const ancestors = new Set();
  for (const value of values) {
    let current = path.resolve(String(value || ""));
    while (current && current !== path.parse(current).root) {
      current = path.dirname(current);
      if (current && current !== path.parse(current).root) ancestors.add(current);
    }
  }
  return [...ancestors].sort((first, second) => first.length - second.length || first.localeCompare(second));
}

function isNativeExecutableMagic(buffer, platform = process.platform) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  if (platform === "linux") return buffer.readUInt32BE(0) === 0x7f454c46;
  if (platform !== "darwin") return false;
  return new Set([
    0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe,
    0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca,
  ]).has(buffer.readUInt32BE(0));
}

async function regularFile(filePath, options = {}) {
  const stat = await fs.lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    executionError("Tracking provider artifact is not a regular file.", "TRACKING_STAGE_ARTIFACT_UNSAFE");
  }
  if (options.executable && !(stat.mode & 0o111)) {
    executionError("Tracking provider runtime is not executable.", "TRACKING_STAGE_RUNTIME_NOT_EXECUTABLE");
  }
  if (options.immutable && (stat.mode & 0o222)) {
    executionError("Tracking provider artifact is not sealed read-only.", "TRACKING_STAGE_ARTIFACT_PERMISSIONS_UNSAFE");
  }
  return stat;
}

async function nativeRuntime(filePath, platform) {
  await regularFile(filePath, { executable: true, immutable: true });
  const handle = await fs.open(filePath, "r");
  try {
    const magic = Buffer.alloc(4);
    const { bytesRead } = await handle.read(magic, 0, magic.length, 0);
    if (bytesRead !== magic.length || !isNativeExecutableMagic(magic, platform)) {
      executionError(
        "Tracking provider runtime must be one sealed native executable.",
        "TRACKING_STAGE_RUNTIME_FORMAT_UNSUPPORTED",
      );
    }
  } finally {
    await handle.close();
  }
}

function darwinSandboxProfile({ providerDir, runtimePath, sourcePath, workDir }) {
  const systemReadPaths = [
    "/System/Library",
    "/Library/Apple/System/Library",
    "/System/Cryptexes/OS",
    "/System/Volumes/Preboot/Cryptexes/OS",
    "/usr/lib",
  ];
  const readRules = [
    '(literal "/")',
    `(subpath ${sandboxLiteral(providerDir)})`,
    `(subpath ${sandboxLiteral(workDir)})`,
    ...(sourcePath ? [`(literal ${sandboxLiteral(sourcePath)})`] : []),
    ...systemReadPaths.map((entry) => `(subpath ${sandboxLiteral(entry)})`),
    '(literal "/usr/lib/dyld")',
    '(literal "/dev/null")',
    '(literal "/dev/urandom")',
  ].join(" ");
  const metadataRules = ancestorDirectories([
    providerDir,
    runtimePath,
    sourcePath,
    workDir,
    ...systemReadPaths,
  ]).map((entry) => `(literal ${sandboxLiteral(entry)})`).join(" ");
  return [
    "(version 1)",
    "(deny default)",
    "(deny network*)",
    `(allow process-exec (literal ${sandboxLiteral(runtimePath)}))`,
    "(allow process-fork)",
    "(allow sysctl-read)",
    `(allow file-read-metadata ${metadataRules})`,
    `(allow file-read* ${readRules})`,
    `(allow file-write* (subpath ${sandboxLiteral(workDir)}))`,
  ].join("\n");
}

function minimalEnvironment(workDir) {
  return {
    HOME: workDir,
    TMPDIR: path.join(workDir, "tmp"),
    LANG: "C",
    LC_ALL: "C",
    PATH: "/usr/bin:/bin",
    FS_TRACKING_NETWORK_DISABLED: "1",
  };
}

function appendBounded(target, chunk, state) {
  const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  state.bytes += value.byteLength;
  if (state.bytes > MAXIMUM_DIAGNOSTIC_BYTES) {
    state.exceeded = true;
    return;
  }
  target.push(value);
}

function terminateProcessGroup(child, signal = "SIGTERM") {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The process may already have exited.
    }
  }
}

async function readBoundedOutput(outputPath, maximumBytes) {
  const stat = await regularFile(outputPath);
  if (stat.size < 1 || stat.size > maximumBytes) {
    executionError("Tracking stage output exceeded its declared limit.", "TRACKING_STAGE_OUTPUT_LIMIT");
  }
  return fs.readFile(outputPath);
}

async function processGroupRssBytes(processGroupId) {
  const id = Number(processGroupId);
  if (!Number.isSafeInteger(id) || id < 1) {
    executionError("Tracking provider process group is invalid.", "TRACKING_STAGE_MEMORY_MONITOR_FAILED");
  }
  let stdout;
  try {
    ({ stdout } = await execFileAsync("/bin/ps", ["-axo", "pgid=,rss="], {
      timeout: 1000,
      maxBuffer: 1024 * 1024,
      encoding: "utf8",
    }));
  } catch {
    executionError("Tracking provider memory could not be measured.", "TRACKING_STAGE_MEMORY_MONITOR_FAILED");
  }
  return String(stdout || "").split("\n").reduce((sum, line) => {
    const [pgid, rssKb] = line.trim().split(/\s+/).map(Number);
    return pgid === id && Number.isFinite(rssKb) && rssKb > 0 ? sum + rssKb * 1024 : sum;
  }, 0);
}

async function captureExecutionInputSeals(installation = {}, source = {}) {
  const runtime = await captureTrackingFileSeal(installation.runtime?.filePath, {
    expectedSha256: installation.runtime?.sha256,
    expectedBytes: installation.runtime?.bytes,
    executable: true,
    immutable: true,
  });
  const models = [];
  for (const model of installation.models || []) {
    models.push({
      filePath: model.filePath,
      seal: await captureTrackingFileSeal(model.filePath, {
        expectedSha256: model.sha256,
        expectedBytes: model.bytes,
        immutable: true,
      }),
    });
  }
  if (source?.filePath) await verifyTrackingFileSeal(source.filePath, source.seal);
  return {
    runtime: { filePath: installation.runtime.filePath, seal: runtime },
    models,
    source: source?.filePath ? { filePath: source.filePath, seal: source.seal } : null,
  };
}

async function verifyExecutionInputSeals(seals = {}) {
  await verifyTrackingFileSeal(seals.runtime.filePath, seals.runtime.seal, { executable: true });
  for (const model of seals.models || []) {
    await verifyTrackingFileSeal(model.filePath, model.seal);
  }
  if (seals.source) await verifyTrackingFileSeal(seals.source.filePath, seals.source.seal);
}

export function createTrackingStageSandboxExecutor(options = {}) {
  const platform = options.platform || process.platform;
  const sandboxPath = options.sandboxPath || DARWIN_SANDBOX_PATH;
  const temporaryRoot = path.resolve(options.temporaryRoot || os.tmpdir());
  const spawnProcess = options.spawnProcess || spawn;
  const rssSampler = options.rssSampler || processGroupRssBytes;
  const clock = options.clock || Date.now;

  async function inspect(installation = {}) {
    const reasons = [];
    if (platform !== "darwin") reasons.push("stage-sandbox-platform-unsupported");
    try {
      await fs.access(sandboxPath, fsConstants.X_OK);
    } catch {
      reasons.push("stage-sandbox-unavailable");
    }
    try {
      await fs.access("/bin/ps", fsConstants.X_OK);
    } catch {
      reasons.push("stage-memory-monitor-unavailable");
    }
    try {
      await nativeRuntime(installation.runtime?.filePath, platform);
      for (const model of installation.models || []) await regularFile(model.filePath, { immutable: true });
    } catch (error) {
      reasons.push(String(error?.code || "TRACKING_STAGE_ARTIFACT_UNSAFE").toLowerCase().replaceAll("_", "-"));
    }
    return {
      ready: reasons.length === 0,
      status: reasons.length ? "blocked" : "sandboxed-local",
      protocol: TRACKING_STAGE_EXECUTION_PROTOCOL,
      isolation: reasons.length ? "unavailable" : "darwin-sandbox-exec-network-denied-v1",
      reasons: [...new Set(reasons)],
    };
  }

  async function execute(installation = {}, request = {}, source = {}, executionOptions = {}) {
    const readiness = await inspect(installation);
    if (!readiness.ready) {
      executionError("Tracking stage sandbox is not ready.", "TRACKING_STAGE_SANDBOX_NOT_READY");
    }
    const provider = installation.provider || {};
    const maximumOutputBytes = boundedInteger(
      provider.runtime?.maxOutputBytes,
      1024,
      4 * 1024 * 1024 * 1024,
      64 * 1024 * 1024,
    );
    const maximumWallTimeMs = boundedInteger(
      provider.runtime?.maxWallTimeMs,
      1000,
      24 * 60 * 60 * 1000,
      2 * 60 * 60 * 1000,
    );
    const maximumMemoryMb = boundedInteger(provider.runtime?.maxMemoryMb, 64, 131_072, 8192);
    const requestFingerprint = ["association", "classification"].includes(provider.stage)
      ? exactFingerprint(executionOptions.requestFingerprint, "Stage request fingerprint")
      : "";
    const sourcePath = source?.filePath ? path.resolve(source.filePath) : "";
    const inputSeals = await captureExecutionInputSeals(installation, source);
    const stagedWorkDir = await fs.mkdtemp(path.join(temporaryRoot, "fs-tracking-stage-"));
    let workDir;
    try {
      workDir = await fs.realpath(stagedWorkDir);
    } catch (error) {
      await fs.rm(stagedWorkDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
    const invocationPath = path.join(workDir, "invocation.json");
    const outputPath = path.join(workDir, "result.json");
    const profilePath = path.join(workDir, "sandbox.sb");
    await fs.mkdir(path.join(workDir, "tmp"), { mode: 0o700 });
    const invocation = {
      schemaVersion: 1,
      protocol: TRACKING_STAGE_INVOCATION_PROTOCOL,
      provider: {
        id: provider.providerId,
        version: provider.providerVersion,
        stage: provider.stage,
      },
      request,
      ...(requestFingerprint ? { requestFingerprint } : {}),
      source: sourcePath ? { filePath: sourcePath, sha256: source.sha256 } : null,
      models: (installation.models || []).map((model) => ({
        id: model.id,
        filePath: model.filePath,
        bytes: model.bytes,
        sha256: model.sha256,
      })),
      output: { filePath: outputPath, maximumBytes: maximumOutputBytes },
    };
    await fs.writeFile(invocationPath, `${JSON.stringify(invocation)}\n`, { mode: 0o600 });
    await fs.writeFile(profilePath, darwinSandboxProfile({
      providerDir: installation.providerDir,
      runtimePath: installation.runtime.filePath,
      sourcePath,
      workDir,
    }), { mode: 0o600 });

    const maximumMemoryBytes = maximumMemoryMb * 1024 * 1024;
    const fileBlocks = Math.max(2, Math.ceil(maximumOutputBytes / 512));
    const shellProgram = [
      "ulimit -c 0",
      "ulimit -n 64",
      'ulimit -f "$1" || exit 125',
      "shift 1",
      'exec "$@"',
    ].join("; ");
    const startedAt = Number(clock()) || Date.now();
    let child = null;
    let terminalCode = "";
    let timeout = null;
    let hardKill = null;
    let resourceMonitor = null;
    let resourceMonitorClosed = false;
    const stdout = [];
    const stderr = [];
    const stdoutState = { bytes: 0, exceeded: false };
    const stderrState = { bytes: 0, exceeded: false };
    try {
      child = spawnProcess("/bin/sh", [
        "-c", shellProgram, "fs-tracking-stage",
        String(fileBlocks),
        sandboxPath, "-f", profilePath,
        installation.runtime.filePath,
        "--fs-tracking-stage-invocation", invocationPath,
        "--fs-tracking-stage-output", outputPath,
      ], {
        cwd: workDir,
        detached: true,
        env: minimalEnvironment(workDir),
        stdio: ["ignore", "pipe", "pipe"],
      });
      executionOptions.onProgress?.({ stage: "provider inference", ratio: 0.25 });
      child.stdout?.on("data", (chunk) => appendBounded(stdout, chunk, stdoutState));
      child.stderr?.on("data", (chunk) => appendBounded(stderr, chunk, stderrState));
      const stop = (code) => {
        if (terminalCode) return;
        terminalCode = code;
        terminateProcessGroup(child);
        hardKill = setTimeout(() => terminateProcessGroup(child, "SIGKILL"), 1000);
        hardKill.unref?.();
      };
      const abort = () => stop("TRACKING_STAGE_ABORTED");
      if (executionOptions.signal?.aborted) abort();
      else executionOptions.signal?.addEventListener("abort", abort, { once: true });
      timeout = setTimeout(() => stop("TRACKING_STAGE_TIMEOUT"), maximumWallTimeMs);
      timeout.unref?.();
      const monitorResources = async () => {
        if (resourceMonitorClosed || terminalCode) return;
        if (stdoutState.exceeded || stderrState.exceeded) {
          stop("TRACKING_STAGE_DIAGNOSTIC_LIMIT");
          return;
        }
        try {
          const stat = await fs.stat(outputPath);
          if (stat.size > maximumOutputBytes) stop("TRACKING_STAGE_OUTPUT_LIMIT");
        } catch (error) {
          if (error?.code !== "ENOENT") stop("TRACKING_STAGE_OUTPUT_INVALID");
        }
        try {
          const rssBytes = await rssSampler(child.pid);
          if (rssBytes > maximumMemoryBytes) stop("TRACKING_STAGE_MEMORY_LIMIT");
        } catch {
          stop("TRACKING_STAGE_MEMORY_MONITOR_FAILED");
        }
        if (!resourceMonitorClosed && !terminalCode) {
          resourceMonitor = setTimeout(monitorResources, 100);
          resourceMonitor.unref?.();
        }
      };
      resourceMonitor = setTimeout(monitorResources, 25);
      resourceMonitor.unref?.();
      const exit = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => resolve({ code, signal }));
      });
      executionOptions.signal?.removeEventListener?.("abort", abort);
      if (terminalCode === "TRACKING_STAGE_ABORTED") {
        const error = new TrackingStageExecutionError("Tracking stage was cancelled.", terminalCode);
        error.name = "AbortError";
        throw error;
      }
      if (terminalCode) executionError("Tracking stage crossed a runtime limit.", terminalCode);
      if (exit.code !== 0 || exit.signal) {
        const error = new TrackingStageExecutionError(
          "Tracking provider process failed.",
          "TRACKING_STAGE_PROCESS_FAILED",
        );
        if (executionOptions.captureDiagnostics === true) {
          error.diagnostics = {
            exitCode: exit.code,
            signal: exit.signal || "",
            stdout: Buffer.concat(stdout).toString("utf8"),
            stderr: Buffer.concat(stderr).toString("utf8"),
          };
        }
        throw error;
      }
      await verifyExecutionInputSeals(inputSeals);
      executionOptions.onProgress?.({ stage: "validating provider output", ratio: 0.9 });
      const output = await readBoundedOutput(outputPath, maximumOutputBytes);
      return {
        output,
        telemetry: {
          protocol: TRACKING_STAGE_EXECUTION_PROTOCOL,
          isolation: readiness.isolation,
          wallTimeMs: Math.max(1, (Number(clock()) || Date.now()) - startedAt),
          outputBytes: output.byteLength,
          stdoutBytes: stdoutState.bytes,
          stderrBytes: stderrState.bytes,
          exitCode: 0,
        },
      };
    } finally {
      if (timeout) clearTimeout(timeout);
      if (hardKill) clearTimeout(hardKill);
      resourceMonitorClosed = true;
      if (resourceMonitor) clearTimeout(resourceMonitor);
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }

  return {
    inspect,
    execute,
    info() {
      return {
        protocol: TRACKING_STAGE_EXECUTION_PROTOCOL,
        platform,
        sandbox: platform === "darwin" ? "darwin-sandbox-exec-network-denied-v1" : "unavailable",
      };
    },
  };
}

export const _private = Object.freeze({
  ancestorDirectories,
  darwinSandboxProfile,
  captureExecutionInputSeals,
  isNativeExecutableMagic,
  minimalEnvironment,
  processGroupRssBytes,
  verifyExecutionInputSeals,
});
