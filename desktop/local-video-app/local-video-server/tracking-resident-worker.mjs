import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

export const TRACKING_RESIDENT_WORKER_PROTOCOL = "football-science-tracking-worker-v1";
const MAXIMUM_WORKER_MESSAGE_BYTES = 64 * 1024;

function workerError(message, code = "TRACKING_RESIDENT_WORKER_FAILED") {
  return Object.assign(new Error(String(message || "The resident tracking worker failed.").slice(0, 1000)), { code });
}

function abortError() {
  const error = new Error("Tracking was cancelled.");
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  return error;
}

function boundedNumber(value, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(maximum, number) : 0;
}

function boundedText(value, maximum = 120) {
  return String(value || "").slice(0, maximum);
}

export function createTrackingResidentWorker(options = {}) {
  const spawnProcess = options.spawn || spawn;
  const clock = options.clock || Date.now;
  const startupTimeoutMs = Math.max(30_000, Number(options.startupTimeoutMs) || 3 * 60 * 1000);
  const jobTimeoutMs = Math.max(60_000, Number(options.jobTimeoutMs) || 2 * 60 * 60 * 1000);
  let worker = null;
  let generation = 0;
  let completedJobs = 0;
  let disposed = false;
  let reusedJobs = 0;
  let lastReady = null;
  let lastJobMs = 0;
  let schedule = Promise.resolve();

  function settleActive(state, handler, value) {
    const active = state.active;
    if (!active || active.settled) return;
    active.settled = true;
    clearTimeout(active.timeout);
    active.signal?.removeEventListener?.("abort", active.abort);
    state.active = null;
    handler(value);
  }

  function terminate(state, error = workerError("The resident tracking worker stopped.")) {
    if (!state || state.closed) return;
    state.terminationError ||= error;
    state.child.kill("SIGTERM");
    if (!state.killTimer) {
      state.killTimer = setTimeout(() => state.child.kill("SIGKILL"), 2000);
      state.killTimer.unref?.();
    }
  }

  function handleMessage(state, message = {}) {
    if (message.protocol !== TRACKING_RESIDENT_WORKER_PROTOCOL) {
      terminate(state, workerError("The resident tracking worker protocol changed."));
      return;
    }
    if (message.type === "startup") {
      state.startupProgress?.({
        stage: boundedText(message.stage || "Loading resident tracker"),
        ratio: Math.max(0, Math.min(0.3, boundedNumber(message.ratio, 1))),
      });
      return;
    }
    if (message.type === "ready") {
      const modelLoadMs = boundedNumber(message.modelLoadMs, startupTimeoutMs);
      const startupMs = boundedNumber(message.startupMs, startupTimeoutMs);
      if (state.readyInfo
        || (options.expectedProvider && message.provider !== options.expectedProvider)
        || (options.expectedVersion && message.providerVersion !== options.expectedVersion)
        || message.modelResident !== true
        || modelLoadMs < 1
        || startupMs < modelLoadMs) {
        terminate(state, workerError("The resident tracking worker identity is invalid."));
        return;
      }
      clearTimeout(state.startupTimer);
      state.readyInfo = Object.freeze({
        provider: boundedText(message.provider),
        providerVersion: boundedText(message.providerVersion),
        device: boundedText(message.device, 24),
        modelResident: true,
        modelLoadMs,
        startupMs,
      });
      lastReady = state.readyInfo;
      state.readyResolve(state.readyInfo);
      return;
    }
    if (message.type === "fatal") {
      terminate(state, workerError(message.error || "The resident tracking worker rejected its command."));
      return;
    }
    const active = state.active;
    if (!active || message.jobId !== active.id) {
      terminate(state, workerError("The resident tracking worker returned an unknown job."));
      return;
    }
    if (message.type === "progress") {
      active.onProgress?.({
        stage: boundedText(message.stage || "Tracking object"),
        ratio: Math.max(0, Math.min(1, boundedNumber(message.ratio, 1))),
      });
      return;
    }
    if (message.type !== "result") {
      terminate(state, workerError("The resident tracking worker returned an invalid message."));
      return;
    }
    if (message.ok !== true) {
      terminate(state, workerError(message.error || "The resident tracking provider could not complete the job."));
      return;
    }
    const sequence = Math.round(boundedNumber(message.workerJobSequence, 1_000_000));
    const jobProcessingMs = boundedNumber(message.jobProcessingMs, jobTimeoutMs);
    if (sequence !== state.completedJobs + 1 || message.modelResident !== true || jobProcessingMs < 1) {
      terminate(state, workerError("The resident tracking worker telemetry is inconsistent."));
      return;
    }
    const hostElapsedMs = Math.max(1, Number(clock()) - active.startedAt);
    const runtime = Object.freeze({
      mode: TRACKING_RESIDENT_WORKER_PROTOCOL,
      generation: state.generation,
      workerJobSequence: sequence,
      workerReused: sequence > 1,
      modelResident: message.modelResident === true,
      device: boundedText(message.device, 24),
      modelLoadMs: boundedNumber(message.modelLoadMs, startupTimeoutMs),
      workerColdStartMs: state.readyInfo?.startupMs || 0,
      jobProcessingMs,
      hostElapsedMs,
    });
    completedJobs += 1;
    state.completedJobs = sequence;
    if (runtime.workerReused) reusedJobs += 1;
    lastJobMs = hostElapsedMs;
    settleActive(state, active.resolve, runtime);
  }

  function consumeOutput(state, chunk) {
    state.stdout = `${state.stdout}${chunk}`;
    const lines = state.stdout.split(/\r?\n/);
    state.stdout = lines.pop() || "";
    if (Buffer.byteLength(state.stdout) > MAXIMUM_WORKER_MESSAGE_BYTES) {
      terminate(state, workerError("The resident tracking worker exceeded its output limit."));
      return;
    }
    for (const line of lines) {
      if (!line.trim()) continue;
      if (Buffer.byteLength(line) > MAXIMUM_WORKER_MESSAGE_BYTES) {
        terminate(state, workerError("The resident tracking worker exceeded its output limit."));
        return;
      }
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        terminate(state, workerError("The resident tracking worker returned invalid JSON."));
        return;
      }
      handleMessage(state, message);
      if (state.terminationError) return;
    }
  }

  function startWorker(onProgress) {
    if (disposed) {
      return Promise.reject(workerError(
        "The resident tracking worker is closed.",
        "TRACKING_RESIDENT_WORKER_CLOSED",
      ));
    }
    if (worker) {
      worker.startupProgress = onProgress || worker.startupProgress;
      return worker.readyPromise;
    }
    generation += 1;
    const child = spawnProcess(options.command, [
      ...(options.args || []),
      "--worker",
      "--protocol", options.providerProtocol || "football-science-tracking-v1",
    ], {
      env: options.env || process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let readyResolve;
    let readyReject;
    let closeResolve;
    const readyPromise = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    const closePromise = new Promise((resolve) => { closeResolve = resolve; });
    const state = {
      active: null,
      child,
      closed: false,
      closePromise,
      closeResolve,
      completedJobs: 0,
      generation,
      killTimer: null,
      readyInfo: null,
      readyPromise,
      readyReject,
      readyResolve,
      startupProgress: onProgress,
      startupTimer: null,
      stderr: "",
      stdout: "",
      terminationError: null,
    };
    worker = state;
    state.startupTimer = setTimeout(() => terminate(
      state,
      workerError("The resident tracking worker exceeded its startup limit.", "TRACKING_RESIDENT_WORKER_STARTUP_TIMEOUT"),
    ), startupTimeoutMs);
    state.startupTimer.unref?.();
    child.stdout.on("data", (chunk) => consumeOutput(state, chunk));
    child.stderr.on("data", (chunk) => { state.stderr = `${state.stderr}${chunk}`.slice(-8000); });
    child.stdin.on("error", (error) => terminate(state, error));
    child.on("error", (error) => terminate(state, error));
    child.on("close", (code) => {
      if (state.closed) return;
      state.closed = true;
      clearTimeout(state.startupTimer);
      clearTimeout(state.killTimer);
      if (worker === state) worker = null;
      const error = state.terminationError || workerError(
        state.stderr.trim() || `The resident tracking worker exited with ${code}.`,
      );
      if (!state.readyInfo) state.readyReject(error);
      if (state.active) settleActive(state, state.active.reject, error);
      state.closeResolve();
    });
    return readyPromise;
  }

  async function execute(job = {}, runOptions = {}) {
    if (runOptions.signal?.aborted) throw abortError();
    const ready = await startWorker(runOptions.onProgress);
    if (runOptions.signal?.aborted) throw abortError();
    const state = worker;
    if (!state || state.closed || !ready?.modelResident || state.active) {
      throw workerError("The resident tracking worker is unavailable.");
    }
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const active = {
        abort: null,
        id,
        onProgress: runOptions.onProgress,
        reject,
        resolve,
        settled: false,
        signal: runOptions.signal,
        startedAt: Number(clock()),
        timeout: null,
      };
      active.abort = () => terminate(state, abortError());
      const requestedTimeoutMs = Number(runOptions.timeoutMs);
      const boundedTimeoutMs = Math.max(60_000, Math.min(
        jobTimeoutMs,
        Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0 ? requestedTimeoutMs : jobTimeoutMs,
      ));
      active.timeout = setTimeout(() => terminate(
        state,
        workerError("The resident tracking job exceeded its local time limit.", "TRACKING_RESIDENT_WORKER_JOB_TIMEOUT"),
      ), boundedTimeoutMs);
      active.timeout.unref?.();
      runOptions.signal?.addEventListener?.("abort", active.abort, { once: true });
      state.active = active;
      const command = JSON.stringify({
        protocol: TRACKING_RESIDENT_WORKER_PROTOCOL,
        type: "job",
        jobId: id,
        inputPath: String(job.inputPath || ""),
        requestPath: String(job.requestPath || ""),
        outputPath: String(job.outputPath || ""),
      });
      if (Buffer.byteLength(command) > 16 * 1024) {
        terminate(state, workerError("The resident tracking command exceeded its safety limit."));
        return;
      }
      state.child.stdin.write(`${command}\n`, (error) => {
        if (error) terminate(state, error);
      });
    });
  }

  function run(job = {}, runOptions = {}) {
    const result = schedule.then(() => execute(job, runOptions));
    schedule = result.catch(() => false);
    return result;
  }

  async function close() {
    disposed = true;
    const state = worker;
    if (!state) return true;
    terminate(state, workerError("The resident tracking worker was closed.", "ABORT_ERR"));
    await state.closePromise;
    return true;
  }

  function info() {
    return {
      mode: TRACKING_RESIDENT_WORKER_PROTOCOL,
      status: disposed
        ? "closed"
        : worker?.active ? "running" : worker?.readyInfo ? "ready" : worker ? "starting" : "stopped",
      modelResident: worker?.readyInfo?.modelResident === true,
      device: boundedText(worker?.readyInfo?.device || lastReady?.device, 24),
      generation,
      completedJobs,
      reusedJobs,
      coldStartMs: boundedNumber(worker?.readyInfo?.startupMs || lastReady?.startupMs, startupTimeoutMs),
      modelLoadMs: boundedNumber(worker?.readyInfo?.modelLoadMs || lastReady?.modelLoadMs, startupTimeoutMs),
      lastJobMs,
    };
  }

  return { close, info, run };
}
