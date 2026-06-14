import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const host = "127.0.0.1";
const port = Number(process.env.FS_LOCAL_VIDEO_PORT || 47831);
const cacheDir = path.join(os.homedir(), ".football-science", "local-video-cache");

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-football-science-file-name",
    "access-control-allow-private-network": "true",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function safeFileName(value = "match-video") {
  return decodeURIComponent(String(value || "match-video"))
    .replace(/[\\/]+/g, " ")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "match-video";
}

function runFfmpeg(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-map", "0:v:0",
      "-map", "0:a:0?",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-profile:v", "main",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-movflags", "+faststart",
      outputPath,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 6000) stderr = stderr.slice(-6000);
    });
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `ffmpeg exited with ${code}`));
    });
  });
}

async function writeRequestToFile(request, filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(filePath);
    request.pipe(stream);
    request.on("error", reject);
    stream.on("error", reject);
    stream.on("finish", resolve);
  });
}

async function handleTranscode(request, response) {
  const id = randomUUID();
  const originalName = safeFileName(request.headers["x-football-science-file-name"]);
  const workDir = path.join(cacheDir, id);
  const inputPath = path.join(workDir, originalName);
  const outputPath = path.join(workDir, "playback.mp4");
  try {
    await writeRequestToFile(request, inputPath);
    await runFfmpeg(inputPath, outputPath);
    json(response, 200, {
      ok: true,
      playbackUrl: `http://${host}:${port}/playback/${id}/playback.mp4`,
    });
  } catch (error) {
    json(response, 500, {
      ok: false,
      error: error.code === "ENOENT"
        ? "FFmpeg is not installed or not available in PATH on this computer."
        : `Could not create a playable local copy. ${error.message || ""}`.trim(),
    });
  }
}

async function handlePlayback(url, response) {
  const match = url.pathname.match(/^\/playback\/([a-f0-9-]+)\/playback\.mp4$/i);
  if (!match) {
    json(response, 404, { ok: false, error: "Playback file not found." });
    return;
  }
  const playbackPath = path.join(cacheDir, match[1], "playback.mp4");
  try {
    const stat = await fs.stat(playbackPath);
    response.writeHead(200, {
      "access-control-allow-origin": "*",
      "access-control-allow-private-network": "true",
      "content-length": stat.size,
      "content-type": "video/mp4",
    });
    createReadStream(playbackPath).pipe(response);
  } catch {
    json(response, 404, { ok: false, error: "Playback file not found." });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  if (request.method === "OPTIONS") {
    json(response, 204, {});
    return;
  }
  if (request.method === "GET" && url.pathname === "/health") {
    json(response, 200, { ok: true, service: "football-science-local-video-server" });
    return;
  }
  if (request.method === "POST" && url.pathname === "/transcode") {
    await handleTranscode(request, response);
    return;
  }
  if (request.method === "GET" && url.pathname.startsWith("/playback/")) {
    await handlePlayback(url, response);
    return;
  }
  json(response, 404, { ok: false, error: "Route not found." });
});

server.listen(port, host, () => {
  console.log(`Football Science local video server listening on http://${host}:${port}`);
  console.log("Video files stay on this computer. Metadata remains central.");
});
