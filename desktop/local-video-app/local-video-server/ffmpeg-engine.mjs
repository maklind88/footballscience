import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import ffmpegStaticPath from "ffmpeg-static";

function abortError() {
  const error = new Error("Job cancelled.");
  error.code = "ABORT_ERR";
  return error;
}

function escapeFilterPath(value = "") {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/;/g, "\\;");
}

export function createFfmpegEngine(options = {}) {
  const ffmpegPath = options.ffmpegPath || process.env.FS_FFMPEG_PATH || ffmpegStaticPath || "ffmpeg";

  function run(args, runOptions = {}) {
    return new Promise((resolve, reject) => {
      if (runOptions.signal?.aborted) {
        reject(abortError());
        return;
      }
      const ffmpeg = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      let progressBuffer = "";
      let settled = false;
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        runOptions.signal?.removeEventListener("abort", onAbort);
        callback(value);
      };
      const onAbort = () => {
        ffmpeg.kill("SIGTERM");
        setTimeout(() => ffmpeg.kill("SIGKILL"), 2000).unref?.();
      };
      runOptions.signal?.addEventListener("abort", onAbort, { once: true });
      ffmpeg.stdout.on("data", (chunk) => {
        progressBuffer += chunk.toString();
        const lines = progressBuffer.split(/\r?\n/);
        progressBuffer = lines.pop() || "";
        for (const line of lines) {
          const [key, rawValue] = line.split("=", 2);
          if (key === "out_time_us") {
            runOptions.onProgress?.({
              stage: "processing",
              processedMs: Math.max(0, Math.round(Number(rawValue || 0) / 1000)),
            });
          }
        }
      });
      ffmpeg.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > 8000) stderr = stderr.slice(-8000);
      });
      ffmpeg.on("error", (error) => settle(reject, error));
      ffmpeg.on("close", (code) => {
        if (runOptions.signal?.aborted) {
          settle(reject, abortError());
        } else if (code === 0) {
          settle(resolve, stderr);
        } else {
          settle(reject, new Error(stderr || `ffmpeg exited with ${code}`));
        }
      });
    });
  }

  async function inspect(inputPath, signal) {
    try {
      return await run(["-hide_banner", "-i", inputPath], { signal });
    } catch (error) {
      if (error.code === "ABORT_ERR") throw error;
      return error.message || "";
    }
  }

  function canRemux(mediaInfo = "") {
    const info = String(mediaInfo || "").toLowerCase();
    const hasBrowserVideo = info.includes("video: h264") && info.includes("yuv420p");
    const hasAudio = info.includes("audio:");
    const hasBrowserAudio = !hasAudio || info.includes("audio: aac");
    return hasBrowserVideo && hasBrowserAudio;
  }

  return {
    async preparePlaybackCopy(inputPath, outputPath, requestedMode = "auto", runOptions = {}) {
      const mediaInfo = await inspect(inputPath, runOptions.signal);
      const mode = requestedMode === "transcode" || (requestedMode === "auto" && !canRemux(mediaInfo))
        ? "transcode"
        : "remux";
      const temporaryOutputPath = `${outputPath}.partial.mp4`;
      const shared = [
        "-y",
        "-hide_banner",
        "-progress", "pipe:1",
        "-nostats",
        "-i", inputPath,
        "-map", "0:v:0",
        "-map", "0:a:0?",
      ];
      const encoding = mode === "remux"
        ? ["-c", "copy"]
        : [
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-profile:v", "main",
          "-level:v", "4.0",
          "-pix_fmt", "yuv420p",
          "-c:a", "aac",
          "-b:a", "128k",
        ];
      try {
        await run([...shared, ...encoding, "-movflags", "+faststart", temporaryOutputPath], runOptions);
        await fs.rename(temporaryOutputPath, outputPath);
      } catch (error) {
        await fs.rm(temporaryOutputPath, { force: true });
        throw error;
      }
      return { mode, mediaInfo };
    },
    async renderExport(inputPath, outputPath, specification = {}, runOptions = {}) {
      const startMs = Math.max(0, Math.round(Number(specification.startMs) || 0));
      const endMs = Math.max(startMs + 1, Math.round(Number(specification.endMs) || startMs + 5000));
      const durationMs = endMs - startMs;
      const height = [720, 1080, 2160].includes(Number(specification.height))
        ? Number(specification.height)
        : 1080;
      const composited = Boolean(specification.overlayPath);
      const filters = [
        `scale=-2:min(${height}\\,ih)`,
        ...(composited ? [`ass=filename='${escapeFilterPath(specification.overlayPath)}'`] : []),
      ];
      const temporaryOutputPath = `${outputPath}.partial.mp4`;
      const args = [
        "-y",
        "-hide_banner",
        "-progress", "pipe:1",
        "-nostats",
        "-i", inputPath,
        "-ss", (startMs / 1000).toFixed(3),
        "-t", (durationMs / 1000).toFixed(3),
        "-map", "0:v:0",
        "-map", "0:a:0?",
        "-vf", filters.join(","),
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", String(Math.max(14, Math.min(28, Math.round(Number(specification.crf) || 18)))),
        "-profile:v", "high",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        "-metadata", `title=${String(specification.title || "Football Science export").slice(0, 180)}`,
        temporaryOutputPath,
      ];
      try {
        await run(args, {
          ...runOptions,
          onProgress(progress = {}) {
            const processedMs = Math.max(0, Number(progress.processedMs) || 0);
            runOptions.onProgress?.({
              ...progress,
              ratio: Math.min(0.98, processedMs / Math.max(1, durationMs)),
            });
          },
        });
        await fs.rename(temporaryOutputPath, outputPath);
      } catch (error) {
        await fs.rm(temporaryOutputPath, { force: true });
        throw error;
      }
      return { startMs, endMs, durationMs, height, codec: "h264", container: "mp4", composited };
    },
    async createProxy(inputPath, outputPath, specification = {}, runOptions = {}) {
      const height = specification.preset === "review-720p" ? 720 : 540;
      const fps = 25;
      const crf = specification.preset === "review-720p" ? 23 : 25;
      const keyframeSeconds = specification.preset === "review-720p" ? 2 : 1;
      const keyframeInterval = fps * keyframeSeconds;
      const temporaryOutputPath = `${outputPath}.partial.mp4`;
      const args = [
        "-y", "-hide_banner", "-progress", "pipe:1", "-nostats",
        "-i", inputPath,
        "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", `scale=-2:min(${height}\\,ih),fps=${fps}`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf),
        "-profile:v", "main", "-pix_fmt", "yuv420p",
        "-g", String(keyframeInterval), "-keyint_min", String(keyframeInterval), "-sc_threshold", "0",
        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
        temporaryOutputPath,
      ];
      try {
        await run(args, runOptions);
        await fs.rename(temporaryOutputPath, outputPath);
      } catch (error) {
        await fs.rm(temporaryOutputPath, { force: true });
        throw error;
      }
      return { preset: specification.preset, height, fps, crf, keyframeSeconds, codec: "h264", container: "mp4" };
    },
    async createReplayBuffer(inputPath, outputPath, specification = {}, runOptions = {}) {
      const startMs = Math.max(0, Math.round(Number(specification.startMs) || 0));
      const endMs = Math.max(startMs + 1, Math.round(Number(specification.endMs) || startMs + 15_000));
      const durationMs = endMs - startMs;
      const temporaryOutputPath = `${outputPath}.partial.mp4`;
      const args = [
        "-y", "-hide_banner", "-progress", "pipe:1", "-nostats",
        "-i", inputPath,
        "-ss", (startMs / 1000).toFixed(3), "-t", (durationMs / 1000).toFixed(3),
        "-map", "0:v:0", "-map", "0:a:0?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        "-profile:v", "main", "-pix_fmt", "yuv420p",
        "-g", "25", "-keyint_min", "25", "-sc_threshold", "0",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
        temporaryOutputPath,
      ];
      try {
        await run(args, {
          ...runOptions,
          onProgress(progress = {}) {
            const processedMs = Math.max(0, Number(progress.processedMs) || 0);
            runOptions.onProgress?.({ ...progress, ratio: Math.min(0.98, processedMs / Math.max(1, durationMs)) });
          },
        });
        await fs.rename(temporaryOutputPath, outputPath);
      } catch (error) {
        await fs.rm(temporaryOutputPath, { force: true });
        throw error;
      }
      return { startMs, endMs, durationMs, codec: "h264", container: "mp4" };
    },
  };
}
