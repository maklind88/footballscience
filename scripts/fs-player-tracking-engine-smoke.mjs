import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegStaticPath from "ffmpeg-static";
import { createTrackingEngineAdapter } from "../desktop/local-video-app/local-video-server/tracking-engine-adapter.mjs";

export const TRACKING_ENGINE_SMOKE_PROTOCOL = "football-science-tracking-engine-smoke-v1";
export const TRACKING_ENGINE_SMOKE_DURATION_MS = 1_000;
export const TRACKING_ENGINE_SMOKE_TIMEOUT_MS = 5 * 60 * 1000;
export const TRACKING_ENGINE_SMOKE_REFERENCE_MAX_REALTIME_FACTOR = 1;

function smokeError(message, code = "TRACKING_ENGINE_SMOKE_FAILED") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function runProcess(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handler(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref?.();
      finish(reject, smokeError("Synthetic tracking fixture generation timed out.", "TRACKING_ENGINE_SMOKE_TIMEOUT"));
    }, Math.max(10_000, Number(options.timeoutMs) || TRACKING_ENGINE_SMOKE_TIMEOUT_MS));
    timer.unref?.();
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-4_000); });
    child.on("error", (error) => finish(reject, error));
    child.on("close", (code) => {
      if (code === 0) finish(resolve, true);
      else finish(reject, smokeError(stderr.trim() || `Synthetic fixture generator exited with ${code}.`));
    });
  });
}

export function trackingEngineSmokePrompt() {
  return {
    id: "sam2-operational-smoke",
    clipId: "synthetic-smoke-clip",
    videoId: "synthetic-smoke-video",
    entityType: "player",
    playerId: "synthetic-player",
    playerLabel: "Synthetic player",
    teamSide: "home",
    startMs: 0,
    endMs: TRACKING_ENGINE_SMOKE_DURATION_MS,
    promptAtMs: 0,
    sourceStartMs: 0,
    sourceEndMs: TRACKING_ENGINE_SMOKE_DURATION_MS,
    sourcePromptAtMs: 0,
    box: { left: 0.15, top: 0.25, width: 0.11, height: 0.42 },
  };
}

export async function createSyntheticTrackingFixture(outputPath, options = {}) {
  const ffmpegPath = options.ffmpegPath || process.env.FS_FFMPEG_PATH || ffmpegStaticPath;
  if (!ffmpegPath) throw smokeError("The bundled FFmpeg engine is unavailable.", "TRACKING_ENGINE_SMOKE_FFMPEG");
  const filter = [
    "[1:v]drawbox=x=0:y=0:w=iw:h=ih:color=white:t=4",
    "drawbox=x=8:y=12:w=30:h=76:color=0x214f9b:t=fill[obj]",
    "[0:v][obj]overlay=x=110+45*t:y=100:shortest=1[composite]",
    "[composite]format=yuv420p[out]",
  ].join(";");
  await runProcess(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-f", "lavfi", "-i", `color=c=0x285c3a:s=640x360:r=12.5:d=${TRACKING_ENGINE_SMOKE_DURATION_MS / 1_000}`,
    "-f", "lavfi", "-i", `color=c=0xc92f3d:s=46x132:r=12.5:d=${TRACKING_ENGINE_SMOKE_DURATION_MS / 1_000}`,
    "-filter_complex", filter,
    "-map", "[out]", "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18",
    "-movflags", "+faststart", outputPath,
  ], options);
  const stat = await fs.stat(outputPath);
  if (!stat.isFile() || stat.size < 1_024 || stat.size > 16 * 1024 * 1024) {
    throw smokeError("The synthetic tracking fixture is invalid.", "TRACKING_ENGINE_SMOKE_FIXTURE");
  }
  return { byteLength: stat.size };
}

function boundedProviderInfo(value = {}) {
  return {
    engineName: String(value.engineName || "").slice(0, 120),
    displayName: String(value.displayName || "").slice(0, 160),
    engineVersion: String(value.engineVersion || "").slice(0, 80),
    protocol: String(value.protocol || "").slice(0, 120),
    source: String(value.source || "").slice(0, 80),
  };
}

function validateOperationalResult(result = {}, prompt = {}) {
  const artifact = result.artifact || {};
  const points = (artifact.segments || []).flatMap((segment) => segment.points || []);
  const times = [...new Set(points.map((point) => Number(point.atMs)).filter(Number.isFinite))].sort((a, b) => a - b);
  const observedDurationMs = times.length ? times.at(-1) - times[0] : 0;
  const confidence = Number(artifact.confidence);
  if (artifact.entityType !== "player"
    || points.length < 2
    || times.length < 2
    || observedDurationMs < Math.min(200, (prompt.endMs - prompt.startMs) * 0.2)
    || !Number.isFinite(confidence)
    || confidence < 0
    || confidence > 1
    || !artifact.metadata?.model
    || !artifact.metadata?.device
    || artifact.metadata?.providerProtocol !== "football-science-tracking-v1") {
    throw smokeError(
      "The installed tracking engine did not produce a valid propagated object track.",
      "TRACKING_ENGINE_SMOKE_OUTPUT",
    );
  }
  return {
    pointCount: points.length,
    segmentCount: artifact.segments.length,
    observedDurationMs,
    coverageRatio: observedDurationMs / Math.max(1, prompt.endMs - prompt.startMs),
    confidence,
    model: String(artifact.metadata.model).slice(0, 120),
    device: String(artifact.metadata.device).slice(0, 40),
  };
}

async function sha256File(filePath) {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

export async function runTrackingEngineSmoke(options = {}) {
  const clock = options.now || (() => Number(process.hrtime.bigint() / 1_000_000n));
  const temporaryParent = options.temporaryParent || os.tmpdir();
  const jobDir = await fs.mkdtemp(path.join(temporaryParent, "fs-player-tracking-smoke-"));
  const inputPath = path.join(jobDir, "synthetic-player.mp4");
  const outputPath = path.join(jobDir, "tracking-output.json");
  const prompt = trackingEngineSmokePrompt();
  const progressStages = [];
  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    Math.max(30_000, Number(options.timeoutMs) || TRACKING_ENGINE_SMOKE_TIMEOUT_MS),
  );
  timeout.unref?.();
  try {
    const fixture = await (options.generateFixture || createSyntheticTrackingFixture)(inputPath, options);
    const fixtureSha256 = await sha256File(inputPath);
    const adapter = options.adapter || createTrackingEngineAdapter({ ffmpegPath: options.ffmpegPath });
    if (!adapter.available()) {
      throw smokeError("No approved local tracking provider is installed.", "TRACKING_PROVIDER_UNAVAILABLE");
    }
    let result;
    let processingMs = 0;
    try {
      const providerStartedAt = clock();
      result = await adapter.trackObject(inputPath, outputPath, prompt, {
        signal: abortController.signal,
        onProgress: (progress) => {
          const stage = String(progress?.stage || "").trim().slice(0, 120);
          if (stage && progressStages.at(-1) !== stage) progressStages.push(stage);
          options.onProgress?.(progress);
        },
      });
      processingMs = Math.max(1, clock() - providerStartedAt);
    } catch (error) {
      if (abortController.signal.aborted) {
        throw smokeError(
          `Tracking engine self-test timed out${progressStages.at(-1) ? ` during ${progressStages.at(-1)}` : ""}.`,
          "TRACKING_ENGINE_SMOKE_TIMEOUT",
        );
      }
      throw error;
    }
    return Object.freeze({
      ok: true,
      protocol: TRACKING_ENGINE_SMOKE_PROTOCOL,
      provider: boundedProviderInfo(adapter.info()),
      fixture: {
        kind: "generated-synthetic-video",
        durationMs: TRACKING_ENGINE_SMOKE_DURATION_MS,
        width: 640,
        height: 360,
        byteLength: Number(fixture?.byteLength) || 0,
        sha256: fixtureSha256,
      },
      result: validateOperationalResult(result, prompt),
      performance: {
        processingMs,
        realtimeFactor: processingMs / TRACKING_ENGINE_SMOKE_DURATION_MS,
        referenceMaximumRealtimeFactor: TRACKING_ENGINE_SMOKE_REFERENCE_MAX_REALTIME_FACTOR,
        withinReferenceBudget: processingMs / TRACKING_ENGINE_SMOKE_DURATION_MS
          <= TRACKING_ENGINE_SMOKE_REFERENCE_MAX_REALTIME_FACTOR,
        coldStartIncluded: true,
      },
      progressStages,
      temporaryMediaRetained: false,
      realMatchQualityProven: false,
    });
  } finally {
    clearTimeout(timeout);
    await fs.rm(jobDir, { recursive: true, force: true });
  }
}

function safeError(error) {
  const home = os.homedir();
  const temporary = os.tmpdir();
  return String(error?.message || "Tracking engine self-test failed.")
    .replaceAll(home, "[home]")
    .replaceAll(temporary, "[tmp]")
    .slice(0, 1_000);
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const json = process.argv.includes("--json");
  const showProgress = process.argv.includes("--progress");
  try {
    const report = await runTrackingEngineSmoke({
      onProgress: showProgress
        ? (progress) => console.error(`${Math.round((Number(progress.ratio) || 0) * 100)}% ${progress.stage || "Tracking"}`)
        : undefined,
    });
    console.log(json ? JSON.stringify(report) : JSON.stringify(report, null, 2));
  } catch (error) {
    const report = { ok: false, code: error?.code || "TRACKING_ENGINE_SMOKE_FAILED", error: safeError(error) };
    console.error(json ? JSON.stringify(report) : `${report.code}: ${report.error}`);
    process.exitCode = 1;
  }
}
