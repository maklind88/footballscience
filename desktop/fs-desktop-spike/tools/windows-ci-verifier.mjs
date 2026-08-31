import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

if (process.argv.includes("--load-check")) {
  console.log("Windows runtime verifier loaded.");
  process.exit(0);
}

if (process.platform !== "win32") throw new Error("Windows runtime verification must run on a Windows runner.");

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsRoot = resolve(packageRoot, "artifacts", "windows");
const logsRoot = resolve(artifactsRoot, "logs");
const bundledExe = resolve(artifactsRoot, "fs-desktop-bundled.exe");
const hostedExe = resolve(artifactsRoot, "fs-desktop-hosted.exe");
const unauthorizedExe = resolve(artifactsRoot, "fs-desktop-unauthorized-origin.exe");
const bundledProbePath = resolve(tmpdir(), "fs-desktop-spike-bundled.json");
const hostedProbePath = resolve(tmpdir(), "fs-desktop-spike-hosted.json");
const negativeProbePath = resolve(artifactsRoot, "unauthorized-origin-probe.json");
const evidencePath = resolve(artifactsRoot, "windows-runtime-evidence.json");
const publicEnvironment = JSON.parse(readFileSync(resolve(packageRoot, "generated", "test-release-public-env.json"), "utf8"));
const expected = Object.freeze({
  cacheVersion: "fs-desktop-native-shell-cache-v2",
  localSchemaVersion: 3,
  syncProtocolVersion: 1,
  normalBuildId: publicEnvironment.releases.normal.buildId,
  incompatibleBuildId: publicEnvironment.releases.incompatible.buildId,
  hangingBuildId: publicEnvironment.releases.hanging.buildId,
  unknownKeyBuildId: publicEnvironment.releases.unknownKey.buildId,
  modifiedAssetBuildId: publicEnvironment.releases.modifiedAsset.buildId,
});
mkdirSync(logsRoot, { recursive: true });

const evidence = {
  schema: "fs-desktop-windows-runtime-evidence-v2",
  commit: process.env.GITHUB_SHA || "local",
  runner: process.env.ImageOS || "windows",
  architecture: process.env.PROCESSOR_ARCHITECTURE || process.arch,
  startedAt: new Date().toISOString(),
  productionCredentialsUsed: false,
  productionDataUsed: false,
  productionSigningKeysUsed: false,
  installerGenerated: false,
  releasePublished: false,
  expected,
  results: [],
  limitations: [
    "GitHub-hosted runner evidence is not physical Windows hardware verification.",
    "Installer UX, SmartScreen, sleep/wake, update installation UX, physical restart, and real adapter switching were not tested.",
    "The Windows Credential Manager backend compiled and its in-memory lifecycle contracts ran; no claim is made that a physical Credential Manager round trip was verified.",
    "Network transitions were simulated by starting and stopping a loopback-only synthetic release source, not by switching a physical network adapter.",
    "Process restart was exercised; operating-system restart was not.",
    "The verified release cache is native app-data storage, isolated from browser/PWA Cache Storage.",
  ],
};

function removeIfPresent(path) {
  if (existsSync(path)) unlinkSync(path);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function waitForJson(path, predicate, { timeoutMs = 45_000, process: watchedProcess } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (watchedProcess?.exitCode !== null) {
      throw new Error(`Probe process exited before evidence was produced (exit ${watchedProcess.exitCode}).`);
    }
    if (existsSync(path)) {
      try {
        const value = readJson(path);
        if (predicate(value)) return value;
      } catch (error) {
        lastError = error;
      }
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${path}${lastError ? `: ${lastError.message}` : ""}`);
}

function portIsOpen(port) {
  return new Promise((resolvePort) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolvePort(true);
    });
    const close = () => {
      socket.destroy();
      resolvePort(false);
    };
    socket.once("error", close);
    socket.once("timeout", close);
  });
}

async function waitForPort(port, expectedOpen, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await portIsOpen(port)) === expectedOpen) return;
    await delay(250);
  }
  throw new Error(`Port ${port} did not become ${expectedOpen ? "available" : "unavailable"}.`);
}

function startServer({ mode = "hosted", port = 47842, manifestMode = "normal" } = {}) {
  const logPath = resolve(logsRoot, `${mode}-${manifestMode}-${port}.log`);
  const logFd = openSync(logPath, "a");
  const child = spawn(process.execPath, [resolve(packageRoot, "tools", "hosted-server.mjs")], {
    cwd: packageRoot,
    env: {
      ...process.env,
      FS_DESKTOP_SPIKE_MODE: mode,
      FS_DESKTOP_SPIKE_PORT: String(port),
      FS_DESKTOP_MANIFEST_MODE: manifestMode,
      FS_DESKTOP_NEGATIVE_PROBE_PATH: mode === "unauthorized" ? negativeProbePath : "",
    },
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
  });
  child.spikeLogFd = logFd;
  return child;
}

function startApp(executable) {
  return spawn(executable, [], { cwd: artifactsRoot, stdio: "ignore", windowsHide: false });
}

async function stopProcess(child) {
  if (!child) return;
  if (child.exitCode === null && child.pid) {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { encoding: "utf8", windowsHide: true });
    await Promise.race([new Promise((resolveExit) => child.once("exit", resolveExit)), delay(3_000)]);
  }
  if (Number.isInteger(child.spikeLogFd)) {
    try { closeSync(child.spikeLogFd); } catch {}
    child.spikeLogFd = null;
  }
}

function validateCommonProbe(probe, candidate) {
  if (probe?.probe?.candidate !== candidate) throw new Error(`Unexpected ${candidate} probe candidate.`);
  if (probe.probe.unauthorizedCommandRejected !== true) throw new Error("Known ungranted native command was not rejected.");
  return probe;
}

function validateHostedProbe(probe, bootMode) {
  validateCommonProbe(probe, "hosted");
  if (probe.probe.bootMode !== bootMode) throw new Error(`Expected hosted ${bootMode} probe.`);
  if (probe.probe.cacheVersion !== expected.cacheVersion) throw new Error("Versioned native cache marker did not match.");
  if (probe.probe.payloadBuildId !== expected.normalBuildId) throw new Error("Active payload build ID changed unexpectedly.");
  if (probe.probe.serviceWorkerControlled !== false) throw new Error("Signed shell unexpectedly depended on browser service-worker control.");
  if (probe.nativeEvidence?.activeBuildId !== expected.normalBuildId) throw new Error("Native registry did not retain the expected active generation.");
  if (probe.nativeEvidence?.localProjectionLoaded !== true || probe.nativeEvidence?.partitionValidated !== true) {
    throw new Error("Native Session Planner projection or partition validation evidence is missing.");
  }
  if (probe.nativeEvidence?.localSchemaVersion !== expected.localSchemaVersion
    || probe.nativeEvidence?.syncProtocolVersion !== expected.syncProtocolVersion) {
    throw new Error("Native data compatibility evidence did not match.");
  }
  if (probe.nativeEvidence?.customProtocol !== true) throw new Error("Custom-protocol evidence is missing.");
  if (probe.nativeEvidence?.contentOrigin !== "https://fs-active.localhost") {
    throw new Error(`Unexpected Windows custom-protocol origin: ${probe.nativeEvidence?.contentOrigin}`);
  }
  if (probe.nativeEvidence?.activeIsolationProofSchema !== "fs-desktop-candidate-isolation-v1") {
    throw new Error("Promoted generation lacks candidate-isolation proof evidence.");
  }
  return probe;
}

function addResult(name, details) {
  evidence.results.push({ name, result: "passed", ...details });
  console.log(`PASS ${name}`);
}

async function verifyBundled() {
  removeIfPresent(bundledProbePath);
  const app = startApp(bundledExe);
  try {
    const probe = validateCommonProbe(await waitForJson(
      bundledProbePath,
      (value) => value?.probe?.candidate === "bundled",
      { process: app },
    ), "bundled");
    if (probe.probe.cacheVersion !== "not-applicable") throw new Error("Bundled probe reported an unexpected cache version.");
    addResult("Candidate B bundled startup", {
      nativeBridge: "two typed commands",
      unauthorizedCommandRejected: true,
      networkDependency: false,
    });
  } finally {
    await stopProcess(app);
  }
}

async function verifyHostedLifecycle() {
  let server = startServer();
  let app = null;
  const replaceServer = async (manifestMode) => {
    removeIfPresent(hostedProbePath);
    await stopProcess(server);
    server = null;
    await waitForPort(47842, false);
    server = startServer({ manifestMode });
    await waitForPort(47842, true);
  };
  try {
    await waitForPort(47842, true);
    removeIfPresent(hostedProbePath);
    app = startApp(hostedExe);
    const initial = validateHostedProbe(await waitForJson(
      hostedProbePath,
      (value) => value?.probe?.bootMode === "online" && value?.nativeEvidence?.activeBuildId === expected.normalBuildId,
      { process: app, timeoutMs: 60_000 },
    ), "online");
    addResult("Candidate A signed custom-protocol activation", {
      activeBuildId: expected.normalBuildId,
      releaseSequence: publicEnvironment.releases.normal.releaseSequence,
      candidateIsolationProof: initial.nativeEvidence.activeIsolationProofSchema,
      privateSigningKeyAvailableToApp: false,
    });

    await stopProcess(app);
    removeIfPresent(hostedProbePath);
    app = startApp(hostedExe);
    validateHostedProbe(await waitForJson(hostedProbePath, (value) => value?.probe?.bootMode === "online", { process: app }), "online");
    addResult("Native active generation and SQLite projection survive process restart", {
      processRestart: true,
      physicalWindowsRestart: false,
    });

    for (const negative of [
      { mode: "invalid-signature", name: "Invalid detached signature rejected", buildId: expected.normalBuildId },
      { mode: "unknown-key", name: "Unknown signing key rejected", buildId: expected.unknownKeyBuildId },
      { mode: "modified-asset", name: "Post-signing asset modification rejected", buildId: expected.modifiedAssetBuildId },
      { mode: "incompatible", name: "Incompatible candidate rejected", buildId: expected.incompatibleBuildId },
    ]) {
      await replaceServer(negative.mode);
      const rejected = validateHostedProbe(await waitForJson(
        hostedProbePath,
        (value) => value?.probe?.bootMode === "compatibility-blocked",
        { process: app },
      ), "compatibility-blocked");
      if (rejected.nativeEvidence?.candidateBuildId) throw new Error(`${negative.mode} unexpectedly reached candidate state.`);
      addResult(negative.name, {
        rejectedBuildId: negative.buildId,
        activeGeneration: expected.normalBuildId,
        candidatePromoted: false,
      });
      await replaceServer("normal");
      validateHostedProbe(await waitForJson(hostedProbePath, (value) => value?.probe?.bootMode === "online", { process: app }), "online");
    }

    await replaceServer("hanging");
    const timedOut = validateHostedProbe(await waitForJson(
      hostedProbePath,
      (value) => value?.nativeEvidence?.latestQuarantine?.buildId === expected.hangingBuildId
        && value?.nativeEvidence?.latestQuarantine?.failureCode === "timeout",
      { process: app, timeoutMs: 40_000 },
    ), "online");
    if (timedOut.nativeEvidence.candidateBuildId) throw new Error("Timed-out candidate retained candidate authority.");
    if (!(timedOut.nativeEvidence.latestQuarantine.retryAfterUnixMs > Number(timedOut.recordedAtUnixMs))) {
      throw new Error("Candidate quarantine backoff evidence is missing.");
    }
    addResult("Candidate timeout, quarantine and backoff", {
      quarantinedBuildId: expected.hangingBuildId,
      failureCode: "timeout",
      failureCount: timedOut.nativeEvidence.latestQuarantine.failureCount,
      activeGenerationUntouched: true,
      candidateAuthorityCleared: true,
    });

    await stopProcess(app);
    removeIfPresent(hostedProbePath);
    app = startApp(hostedExe);
    const quarantinedRestart = validateHostedProbe(await waitForJson(
      hostedProbePath,
      (value) => value?.nativeEvidence?.latestQuarantine?.buildId === expected.hangingBuildId,
      { process: app },
    ), "online");
    if (quarantinedRestart.nativeEvidence.candidateBuildId) throw new Error("Quarantined generation was retried before backoff elapsed.");
    addResult("Quarantined candidate is not retried on process restart", {
      retrySuppressedByBackoff: true,
      activeGeneration: expected.normalBuildId,
    });

    await replaceServer("normal");
    validateHostedProbe(await waitForJson(hostedProbePath, (value) => value?.probe?.bootMode === "online", { process: app }), "online");

    removeIfPresent(hostedProbePath);
    await stopProcess(server);
    server = null;
    await waitForPort(47842, false);
    validateHostedProbe(await waitForJson(hostedProbePath, (value) => value?.probe?.bootMode === "offline", { process: app }), "offline");
    addResult("Online to offline transition", { mechanism: "loopback synthetic source stopped", realAdapterSwitch: false });

    await stopProcess(app);
    removeIfPresent(hostedProbePath);
    app = startApp(hostedExe);
    validateHostedProbe(await waitForJson(hostedProbePath, (value) => value?.probe?.bootMode === "offline", { process: app }), "offline");
    addResult("Offline process restart persistence", {
      activeGeneration: expected.normalBuildId,
      localProjectionLoaded: true,
      physicalWindowsRestart: false,
    });

    server = startServer();
    await waitForPort(47842, true);
    removeIfPresent(hostedProbePath);
    validateHostedProbe(await waitForJson(hostedProbePath, (value) => value?.probe?.bootMode === "online", { process: app }), "online");
    addResult("Offline to online recovery", { sameProcess: true, activeGenerationUnchanged: true });
  } finally {
    await stopProcess(app);
    await stopProcess(server);
  }
}

async function verifyUnauthorizedOrigin() {
  removeIfPresent(negativeProbePath);
  const server = startServer({ mode: "unauthorized", port: 47843 });
  await waitForPort(47843, true);
  const app = startApp(unauthorizedExe);
  try {
    const probe = await waitForJson(negativeProbePath, (value) => value?.allowedCommandRejected === true, { process: app });
    if (probe.origin !== "http://127.0.0.1:47843") throw new Error("Negative probe origin mismatch.");
    if (probe.attemptedCommand !== "desktop_runtime_info") throw new Error("Negative probe command mismatch.");
    addResult("Unauthorized origin rejected from native command", {
      origin: probe.origin,
      attemptedGrantedCommand: probe.attemptedCommand,
      rejected: true,
    });
  } finally {
    await stopProcess(app);
    await stopProcess(server);
  }
}

async function main() {
  for (const executable of [bundledExe, hostedExe, unauthorizedExe]) {
    if (!existsSync(executable)) throw new Error(`Missing Windows build artifact: ${executable}`);
  }
  await verifyBundled();
  await verifyHostedLifecycle();
  await verifyUnauthorizedOrigin();
  evidence.completedAt = new Date().toISOString();
  evidence.status = "passed";
}

try {
  await main();
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.status = "failed";
  evidence.failure = String(error?.stack || error?.message || error).slice(0, 2_000);
  console.error(evidence.failure);
  process.exitCode = 1;
} finally {
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}
