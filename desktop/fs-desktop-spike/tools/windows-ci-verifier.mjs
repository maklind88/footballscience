import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

if (process.platform !== "win32") {
  throw new Error("Windows runtime verification must run on a Windows runner.");
}

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
const expectedCacheVersion = "fs-desktop-hosted-shell-v3";
const expectedPayloadBuildId = "hosted-spike-v4";
mkdirSync(logsRoot, { recursive: true });

const evidence = {
  schema: "fs-desktop-windows-runtime-evidence-v1",
  commit: process.env.GITHUB_SHA || "local",
  runner: process.env.ImageOS || "windows",
  architecture: process.env.PROCESSOR_ARCHITECTURE || process.arch,
  startedAt: new Date().toISOString(),
  productionCredentialsUsed: false,
  productionDataUsed: false,
  results: [],
  limitations: [
    "GitHub-hosted runner evidence is not physical Windows hardware verification.",
    "Installer UX, SmartScreen, sleep/wake, Credential Manager, update installation UX, physical restart, and real adapter switching were not tested.",
    "Network transitions were simulated by starting and stopping a loopback-only synthetic origin.",
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

function startServer({ mode = "hosted", port = 47842 } = {}) {
  const logPath = resolve(logsRoot, `${mode}-${port}.log`);
  const logFd = openSync(logPath, "a");
  const child = spawn(process.execPath, [resolve(packageRoot, "tools", "hosted-server.mjs")], {
    cwd: packageRoot,
    env: {
      ...process.env,
      FS_DESKTOP_SPIKE_MODE: mode,
      FS_DESKTOP_SPIKE_PORT: String(port),
      FS_DESKTOP_NEGATIVE_PROBE_PATH: mode === "unauthorized" ? negativeProbePath : "",
    },
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
  });
  child.spikeLogFd = logFd;
  return child;
}

function startApp(executable) {
  return spawn(executable, [], {
    cwd: artifactsRoot,
    stdio: "ignore",
    windowsHide: false,
  });
}

async function stopProcess(child) {
  if (!child) return;
  if (child.exitCode === null && child.pid) {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
    });
    await Promise.race([
      new Promise((resolveExit) => child.once("exit", resolveExit)),
      delay(3_000),
    ]);
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
      nativeBridge: "two granted commands",
      unauthorizedCommandRejected: true,
      networkDependency: false,
    });
  } finally {
    await stopProcess(app);
  }
}

function validateHostedProbe(probe, bootMode, requireController = true) {
  validateCommonProbe(probe, "hosted");
  if (probe.probe.bootMode !== bootMode) throw new Error(`Expected hosted ${bootMode} probe.`);
  if (probe.probe.cacheVersion !== expectedCacheVersion) throw new Error("Versioned cache marker did not match.");
  if (probe.probe.payloadBuildId !== expectedPayloadBuildId) throw new Error("Cached payload build ID did not match.");
  if (requireController && probe.probe.serviceWorkerControlled !== true) throw new Error("Service worker did not control the hosted window.");
  if (bootMode === "offline" && probe.probe.cachedPayload !== true) throw new Error("Offline hosted probe did not use cached payload.");
  return probe;
}

async function verifyHostedLifecycle() {
  let server = startServer();
  await waitForPort(47842, true);

  removeIfPresent(hostedProbePath);
  let app = startApp(hostedExe);
  try {
    const warmProbe = await waitForJson(hostedProbePath, (value) => value?.probe?.bootMode === "online", { process: app });
    validateHostedProbe(warmProbe, "online", false);
    addResult("Candidate A hosted startup", { bootMode: "online", cacheVersion: expectedCacheVersion });
  } finally {
    await stopProcess(app);
  }

  removeIfPresent(hostedProbePath);
  app = startApp(hostedExe);
  let onlineProbe = await waitForJson(hostedProbePath, (value) => value?.probe?.bootMode === "online", { process: app });
  validateHostedProbe(onlineProbe, "online", true);
  addResult("Service-worker control after restart", { persistedAcrossProcessRestart: true });

  removeIfPresent(hostedProbePath);
  await stopProcess(server);
  server = null;
  await waitForPort(47842, false);
  const transitionOffline = await waitForJson(hostedProbePath, (value) => value?.probe?.bootMode === "offline", { process: app });
  validateHostedProbe(transitionOffline, "offline", true);
  addResult("Online to offline transition", { mechanism: "loopback synthetic origin stopped", cachedPayload: true });

  await stopProcess(app);
  removeIfPresent(hostedProbePath);
  app = startApp(hostedExe);
  const restartOffline = await waitForJson(hostedProbePath, (value) => value?.probe?.bootMode === "offline", { process: app });
  validateHostedProbe(restartOffline, "offline", true);
  addResult("Offline restart persistence", { originConfirmedUnavailable: true, serviceWorkerControlled: true });

  removeIfPresent(hostedProbePath);
  server = startServer();
  await waitForPort(47842, true);
  const recovered = await waitForJson(hostedProbePath, (value) => value?.probe?.bootMode === "online", { process: app });
  validateHostedProbe(recovered, "online", true);
  addResult("Offline to online recovery", { sameProcess: true, cachedPayload: false });

  await stopProcess(app);
  await stopProcess(server);
}

async function verifyUnauthorizedOrigin() {
  removeIfPresent(negativeProbePath);
  const server = startServer({ mode: "unauthorized", port: 47843 });
  await waitForPort(47843, true);
  const app = startApp(unauthorizedExe);
  try {
    const probe = await waitForJson(
      negativeProbePath,
      (value) => value?.allowedCommandRejected === true,
      { process: app },
    );
    if (probe.origin !== "http://127.0.0.1:47843") throw new Error("Negative probe origin mismatch.");
    if (probe.attemptedCommand !== "desktop_runtime_info") throw new Error("Negative probe command mismatch.");
    addResult("Unauthorized origin rejected", {
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
