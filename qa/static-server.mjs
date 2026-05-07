import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const args = new Map(
  process.argv.slice(2).reduce((pairs, item, index, source) => {
    if (item.startsWith("--")) {
      pairs.push([item.slice(2), source[index + 1]]);
    }
    return pairs;
  }, [])
);
const port = Number(args.get("port") || process.env.QA_PORT || 4173);
const host = "127.0.0.1";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(text);
}

function resolveRequestPath(url = "/") {
  const parsedUrl = new URL(url, `http://${host}:${port}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(rootDir, relativePath);

  if (!filePath.startsWith(rootDir + path.sep) && filePath !== rootDir) {
    return null;
  }

  return filePath;
}

const server = createServer(async (req, res) => {
  if (req.url?.startsWith("/api/")) {
    sendText(res, 404, JSON.stringify({ ok: false, reason: "API routes are not served by QA static server." }), "application/json; charset=utf-8");
    return;
  }

  const filePath = resolveRequestPath(req.url);
  if (!filePath) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      sendText(res, 404, "Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "Content-Length": fileStat.size,
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(res);
  } catch {
    sendText(res, 404, "Not found");
  }
});

server.listen(port, host, () => {
  process.stdout.write(`Football Science QA server running at http://${host}:${port}\n`);
});
