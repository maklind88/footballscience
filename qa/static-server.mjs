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
  ".cjs": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
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

function sendJson(res, statusCode, payload) {
  sendText(res, statusCode, JSON.stringify(payload), "application/json; charset=utf-8");
}

function handleMockApi(req, res) {
  const parsedUrl = new URL(req.url || "/", `http://${host}:${port}`);
  if (parsedUrl.pathname === "/api/idp") {
    const action = parsedUrl.searchParams.get("action") || "dashboard";
    if (action === "dashboard") {
      sendJson(res, 200, {
        ok: true,
        dashboard: {
          activePlans: 0,
          dueReviews: 0,
          developmentClips: 0,
          focusAreas: [],
        },
      });
      return true;
    }

    if (action === "player") {
      sendJson(res, 200, {
        ok: true,
        player: {
          id: parsedUrl.searchParams.get("playerId") || "",
          plan: null,
          notes: [],
          reviews: [],
        },
      });
      return true;
    }

    sendJson(res, 200, { ok: true, result: null });
    return true;
  }

  return false;
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

async function handleRequest(req, res) {
  if (req.url?.startsWith("/api/")) {
    if (handleMockApi(req, res)) {
      return;
    }

    sendJson(res, 404, { ok: false, reason: "API routes are not served by QA static server." });
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
    const stream = createReadStream(filePath);
    stream.on("error", () => {
      if (!res.destroyed) {
        res.destroy();
      }
    });
    res.on("close", () => {
      stream.destroy();
    });
    stream.pipe(res);
  } catch {
    sendText(res, 404, "Not found");
  }
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    process.stderr.write(`QA static server request failed: ${error?.message || error}\n`);
    if (!res.headersSent && !res.destroyed) {
      sendText(res, 500, "Internal server error");
      return;
    }
    if (!res.destroyed) res.destroy();
  });
});

server.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(port, host, () => {
  process.stdout.write(`Football Science QA server running at http://${host}:${port}\n`);
});
