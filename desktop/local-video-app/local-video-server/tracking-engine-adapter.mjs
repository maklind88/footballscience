import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
import { resolveInstalledSam2Provider } from "../tracking-providers/sam2/provider-runtime.mjs";
import {
  validateTrackingArtifact,
  validateTrackingArtifacts,
} from "./tracking-artifact-validator.mjs";

async function readBoundedJson(filePath, maxBytes = 64 * 1024 * 1024) {
  const stat = await fs.stat(filePath);
  if (stat.size > maxBytes) {
    const error = new Error("The tracking artifact exceeded the local safety limit.");
    error.code = "TRACKING_ARTIFACT_TOO_LARGE";
    throw error;
  }
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      const error = new Error("Tracking was cancelled.");
      error.name = "AbortError";
      reject(error);
      return;
    }
    const child = spawn(command, args, {
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let stdoutBuffer = "";
    let settled = false;
    const settle = (handler, value) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener?.("abort", abort);
      handler(value);
    };
    const abort = () => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000).unref?.();
      const error = new Error("Tracking was cancelled.");
      error.name = "AbortError";
      settle(reject, error);
    };
    options.signal?.addEventListener?.("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => {
      stdoutBuffer = `${stdoutBuffer}${chunk}`.slice(-16_384);
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) {
        try {
          const progress = JSON.parse(line);
          if (progress?.stage || Number.isFinite(progress?.ratio)) {
            options.onProgress?.({
              stage: String(progress.stage || "tracking").slice(0, 120),
              ratio: Math.max(0, Math.min(1, Number(progress.ratio) || 0)),
            });
          }
        } catch {
          // Provider stdout may include diagnostics in addition to JSON progress.
        }
      }
    });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8000); });
    child.on("error", (error) => settle(reject, error));
    child.on("close", (code) => {
      if (code === 0) settle(resolve, true);
      else settle(reject, new Error(stderr || `Tracking engine exited with ${code}.`));
    });
  });
}

export function createTrackingEngineAdapter(options = {}) {
  const runner = options.runner || null;
  const explicitCommand = options.command || process.env.FS_TRACKING_ENGINE_PATH || "";
  const installed = !runner && !explicitCommand ? resolveInstalledSam2Provider(options.provider || {}) : null;
  const command = explicitCommand || installed?.command || "";
  const commandArgs = options.commandArgs || installed?.args || [];
  const engineName = options.engineName || process.env.FS_TRACKING_ENGINE_NAME
    || installed?.engineName || "external-prompt-tracker";
  const displayName = options.displayName || installed?.displayName || engineName;
  const engineVersion = options.engineVersion || process.env.FS_TRACKING_ENGINE_VERSION
    || installed?.engineVersion || "1";
  const providerEnv = {
    ...process.env,
    ...(installed?.env || {}),
    FS_SAM2_FFMPEG_PATH: options.ffmpegPath || process.env.FS_FFMPEG_PATH || ffmpegStaticPath || "ffmpeg",
  };

  async function runTracking(inputPath, outputPath, request = {}, runOptions = {}) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const requestPath = path.join(path.dirname(outputPath), "tracking-request.json");
    await fs.writeFile(requestPath, JSON.stringify({ protocolVersion: 1, ...request }), { flag: "wx" });
    try {
      if (runner) {
        const result = await runner({ inputPath, outputPath, requestPath, ...request, ...runOptions });
        if (result && typeof result === "object") await fs.writeFile(outputPath, JSON.stringify(result));
      } else if (command) {
        await runCommand(command, [
          ...commandArgs,
          "--protocol", "football-science-tracking-v1",
          "--input", inputPath,
          "--request", requestPath,
          "--output", outputPath,
        ], { ...runOptions, env: providerEnv });
      } else {
        const error = new Error("No local tracking provider is installed.");
        error.code = "TRACKING_PROVIDER_UNAVAILABLE";
        error.statusCode = 501;
        throw error;
      }
      const rawArtifact = await readBoundedJson(outputPath, options.maxArtifactBytes);
      if (Array.isArray(request.prompts)) {
        const validated = validateTrackingArtifacts(rawArtifact, request.prompts, options.validation);
        await fs.writeFile(outputPath, JSON.stringify({ schemaVersion: 1, tracks: validated.artifacts }));
        return { ...validated, engine: engineName, engineVersion };
      }
      const validated = validateTrackingArtifact(rawArtifact, request.prompt, options.validation);
      await fs.writeFile(outputPath, JSON.stringify(validated.artifact));
      return { ...validated, engine: engineName, engineVersion };
    } finally {
      await fs.rm(requestPath, { force: true });
    }
  }

  return {
    available: () => Boolean(runner || command),
    info: () => ({
      available: Boolean(runner || command),
      engineName,
      displayName,
      engineVersion,
      protocol: "football-science-tracking-v1",
      source: installed ? "approved-packaged" : runner ? "embedded-test" : command ? "external" : "none",
    }),
    async trackObject(inputPath, outputPath, prompt = {}, runOptions = {}) {
      return runTracking(inputPath, outputPath, { prompt }, runOptions);
    },
    async trackObjects(inputPath, outputPath, prompts = [], runOptions = {}) {
      return runTracking(inputPath, outputPath, { prompts }, runOptions);
    },
  };
}
