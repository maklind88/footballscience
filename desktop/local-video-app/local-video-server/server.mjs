import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import ffmpegStaticPath from "ffmpeg-static";

const host = "127.0.0.1";
const port = Number(process.env.FS_LOCAL_VIDEO_PORT || 47831);
const cacheDir = path.join(os.homedir(), ".football-science", "local-video-cache");
const ffmpegPath = process.env.FS_FFMPEG_PATH || ffmpegStaticPath || "ffmpeg";

function corsHeaders(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,HEAD,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-football-science-file-name,x-football-science-prepare-mode,range",
    "access-control-allow-private-network": "true",
    "access-control-expose-headers": "content-length,content-range,accept-ranges",
    ...extra,
  };
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, corsHeaders({
    "content-type": "application/json; charset=utf-8",
  }));
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

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 6000) stderr = stderr.slice(-6000);
    });
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(stderr || `ffmpeg exited with ${code}`));
    });
  });
}

async function readMediaInfo(inputPath) {
  try {
    return await runFfmpeg(["-hide_banner", "-i", inputPath]);
  } catch (error) {
    return error.message || "";
  }
}

function canRemuxForBrowser(mediaInfo = "") {
  const info = String(mediaInfo || "").toLowerCase();
  const hasBrowserVideo = info.includes("video: h264") && info.includes("yuv420p");
  const hasAudio = info.includes("audio:");
  const hasBrowserAudio = !hasAudio || info.includes("audio: aac");
  return hasBrowserVideo && hasBrowserAudio;
}

async function preparePlaybackCopy(inputPath, outputPath, requestedMode = "auto") {
  const mediaInfo = await readMediaInfo(inputPath);
  const mode = requestedMode === "transcode" || (requestedMode === "auto" && !canRemuxForBrowser(mediaInfo))
    ? "transcode"
    : "remux";
  if (mode === "remux") {
    await runFfmpeg([
      "-y",
      "-hide_banner",
      "-i", inputPath,
      "-map", "0:v:0",
      "-map", "0:a:0?",
      "-c", "copy",
      "-movflags", "+faststart",
      outputPath,
    ]);
    return { mode, mediaInfo };
  }
  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-i", inputPath,
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-profile:v", "main",
    "-level:v", "4.0",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    outputPath,
  ]);
  return { mode, mediaInfo };
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
  const requestedMode = String(request.headers["x-football-science-prepare-mode"] || "auto").toLowerCase();
  const workDir = path.join(cacheDir, id);
  const inputPath = path.join(workDir, originalName);
  const outputPath = path.join(workDir, "playback.mp4");
  try {
    await writeRequestToFile(request, inputPath);
    const preparation = await preparePlaybackCopy(inputPath, outputPath, requestedMode);
    json(response, 200, {
      ok: true,
      playbackUrl: `http://${host}:${port}/playback/${id}/playback.mp4`,
      mode: preparation.mode,
    });
  } catch (error) {
    json(response, 500, {
      ok: false,
      error: error.code === "ENOENT"
        ? "The bundled FFmpeg engine could not be started on this computer."
        : `Could not create a playable local copy. ${error.message || ""}`.trim(),
    });
  }
}

function parseRange(rangeHeader = "", size = 0) {
  const match = String(rangeHeader || "").match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;
  if (!rawStart) {
    const suffix = Math.max(0, Number(rawEnd || 0));
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

async function handlePlayback(request, url, response) {
  const match = url.pathname.match(/^\/playback\/([a-f0-9-]+)\/playback\.mp4$/i);
  if (!match) {
    json(response, 404, { ok: false, error: "Playback file not found." });
    return;
  }
  const playbackPath = path.join(cacheDir, match[1], "playback.mp4");
  try {
    const stat = await fs.stat(playbackPath);
    const baseHeaders = corsHeaders({
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=86400",
      "content-type": "video/mp4",
    });
    const range = parseRange(request.headers.range, stat.size);
    if (request.headers.range && !range) {
      response.writeHead(416, {
        ...baseHeaders,
        "content-range": `bytes */${stat.size}`,
      });
      response.end();
      return;
    }
    if (range) {
      response.writeHead(206, {
        ...baseHeaders,
        "content-length": range.end - range.start + 1,
        "content-range": `bytes ${range.start}-${range.end}/${stat.size}`,
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(playbackPath, { start: range.start, end: range.end }).pipe(response);
      return;
    }
    response.writeHead(200, {
      ...baseHeaders,
      "content-length": stat.size,
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
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
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/playback/")) {
    await handlePlayback(request, url, response);
    return;
  }
  json(response, 404, { ok: false, error: "Route not found." });
});

server.listen(port, host, () => {
  console.log(`Football Science local video server listening on http://${host}:${port}`);
  console.log("Video files stay on this computer. Metadata remains central.");
});
