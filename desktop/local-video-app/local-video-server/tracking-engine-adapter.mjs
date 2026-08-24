import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

async function readBoundedJson(filePath, maxBytes = 64 * 1024 * 1024) {
  const stat = await fs.stat(filePath);
  if (stat.size > maxBytes) {
    const error = new Error("The tracking artifact exceeded the local safety limit.");
    error.code = "TRACKING_ARTIFACT_TOO_LARGE";
    throw error;
  }
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function validateArtifact(value = {}) {
  const segments = Array.isArray(value.segments) ? value.segments : [];
  const pointCount = segments.reduce((total, segment) => total + (Array.isArray(segment.points) ? segment.points.length : 0), 0);
  if (!segments.length || !pointCount) {
    const error = new Error("The tracking engine returned no object samples.");
    error.code = "TRACKING_EMPTY";
    throw error;
  }
  if (pointCount > 500_000) {
    const error = new Error("The tracking engine returned too many samples for one job.");
    error.code = "TRACKING_SAMPLE_LIMIT";
    throw error;
  }
  return { artifact: value, pointCount, segmentCount: segments.length };
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
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
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) {
        try {
          const progress = JSON.parse(line);
          if (progress?.stage || Number.isFinite(progress?.ratio)) options.onProgress?.(progress);
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
  const command = options.command || process.env.FS_TRACKING_ENGINE_PATH || "";
  const runner = options.runner || null;
  const engineName = options.engineName || process.env.FS_TRACKING_ENGINE_NAME || "external-prompt-tracker";
  const engineVersion = options.engineVersion || process.env.FS_TRACKING_ENGINE_VERSION || "1";

  return {
    available: () => Boolean(runner || command),
    async trackObject(inputPath, outputPath, prompt = {}, runOptions = {}) {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      const requestPath = path.join(path.dirname(outputPath), "tracking-request.json");
      await fs.writeFile(requestPath, JSON.stringify({ protocolVersion: 1, prompt }), { flag: "wx" });
      if (runner) {
        const result = await runner({ inputPath, outputPath, requestPath, prompt, ...runOptions });
        if (result && typeof result === "object") await fs.writeFile(outputPath, JSON.stringify(result));
      } else if (command) {
        await runCommand(command, [
          "--protocol", "football-science-tracking-v1",
          "--input", inputPath,
          "--request", requestPath,
          "--output", outputPath,
        ], runOptions);
      } else {
        const error = new Error("No local tracking provider is installed.");
        error.code = "TRACKING_PROVIDER_UNAVAILABLE";
        error.statusCode = 501;
        throw error;
      }
      const validated = validateArtifact(await readBoundedJson(outputPath, options.maxArtifactBytes));
      return { ...validated, engine: engineName, engineVersion };
    },
  };
}
