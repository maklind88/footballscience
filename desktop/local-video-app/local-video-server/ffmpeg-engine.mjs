import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import ffmpegStaticPath from "ffmpeg-static";

function abortError() {
  const error = new Error("Job cancelled.");
  error.code = "ABORT_ERR";
  return error;
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
  };
}
