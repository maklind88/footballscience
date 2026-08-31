import { createReadStream, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.env.FS_DESKTOP_SPIKE_MODE === "unauthorized" ? "unauthorized" : "hosted";
const root = fileURLToPath(new URL(`../candidates/${mode}/`, import.meta.url));
const sharedRoot = fileURLToPath(new URL("../candidates/shared/", import.meta.url));
const port = Number(process.env.FS_DESKTOP_SPIKE_PORT || (mode === "unauthorized" ? 47843 : 47842));
const negativeProbePath = process.env.FS_DESKTOP_NEGATIVE_PROBE_PATH
  ? resolve(process.env.FS_DESKTOP_NEGATIVE_PROBE_PATH)
  : "";
const contentTypes = new Map([[".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".json", "application/json; charset=utf-8"]]);

function resolveFile(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0] || "/");
  if (cleanPath.startsWith("/shared/")) return join(sharedRoot, normalize(cleanPath.slice(8)));
  return join(root, normalize(cleanPath === "/" ? "index.html" : cleanPath.slice(1)));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) throw new Error("Probe body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validateNegativeProbe(value) {
  const expectedOrigin = `http://127.0.0.1:${port}`;
  if (!value || value.schema !== "fs-desktop-unauthorized-origin-probe-v1") throw new Error("Invalid probe schema");
  if (value.origin !== expectedOrigin) throw new Error("Unexpected probe origin");
  if (value.attemptedCommand !== "desktop_runtime_info") throw new Error("Unexpected probe command");
  if (value.allowedCommandRejected !== true) throw new Error("Unauthorized origin reached native command");
  if (typeof value.rejection !== "string" || value.rejection.length < 1 || value.rejection.length > 180) throw new Error("Invalid rejection evidence");
  return value;
}

createServer(async (request, response) => {
  try {
    if (mode === "unauthorized" && request.method === "POST" && request.url === "/negative-probe") {
      if (!negativeProbePath) throw new Error("Negative probe path is not configured");
      const probe = validateNegativeProbe(await readJsonBody(request));
      const pendingPath = `${negativeProbePath}.pending`;
      writeFileSync(pendingPath, `${JSON.stringify(probe, null, 2)}\n`, { mode: 0o600 });
      renameSync(pendingPath, negativeProbePath);
      response.writeHead(204, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    const filePath = resolveFile(request.url || "/");
    const stat = statSync(filePath);
    if (!stat.isFile() || (!filePath.startsWith(root) && !filePath.startsWith(sharedRoot))) throw new Error("Not found");
    response.writeHead(200, {
      "Content-Type": contentTypes.get(extname(filePath)) || "application/octet-stream",
      "Cache-Control": "no-store",
      "Service-Worker-Allowed": "/",
      "X-Content-Type-Options": "nosniff",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`FS ${mode} spike listening on http://127.0.0.1:${port}`);
});
