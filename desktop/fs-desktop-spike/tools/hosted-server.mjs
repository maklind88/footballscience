import { createReadStream, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.includes("--load-check")) {
  console.log("hosted server helper loaded");
  process.exit(0);
}

const argument = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || "";
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const mode = process.env.FS_DESKTOP_SPIKE_MODE === "unauthorized" || process.argv.includes("--unauthorized")
  ? "unauthorized"
  : "hosted";
const port = Number(process.env.FS_DESKTOP_SPIKE_PORT || argument("--port") || (mode === "unauthorized" ? 47843 : 47842));
const requestedReleaseMode = process.env.FS_DESKTOP_MANIFEST_MODE || argument("--release-mode") || "normal";
const supportedReleaseModes = new Set(["normal", "incompatible", "hanging", "rollback", "invalid-signature", "unknown-key", "modified-asset"]);
if (mode === "hosted" && !supportedReleaseModes.has(requestedReleaseMode)) {
  throw new Error(`Unsupported synthetic release mode: ${requestedReleaseMode}`);
}
const releaseMode = ["invalid-signature"].includes(requestedReleaseMode)
  ? "normal"
  : requestedReleaseMode;
const configuredNegativeProbePath = process.env.FS_DESKTOP_NEGATIVE_PROBE_PATH || argument("--negative-probe");
const negativeProbePath = configuredNegativeProbePath ? resolve(configuredNegativeProbePath) : "";
const unauthorizedRoot = resolve(packageRoot, "candidates", "unauthorized");
const pointerPath = resolve(packageRoot, "generated", "pointers", `${releaseMode}.json`);
const pointer = mode === "hosted" ? JSON.parse(readFileSync(pointerPath, "utf8")) : null;
const hostedRoot = mode === "hosted"
  ? resolve(packageRoot, "generated", "releases", pointer.buildId)
  : "";
const root = mode === "hosted" ? hostedRoot : unauthorizedRoot;
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".sig", "application/json; charset=utf-8"],
]);

function resolveFile(urlPath) {
  const cleanPath = decodeURIComponent((urlPath || "/").split("?")[0]);
  const relative = cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "");
  const filePath = resolve(root, relative);
  if (filePath !== root && !filePath.startsWith(`${root}/`)) throw new Error("Not found");
  return filePath;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4_096) throw new Error("Probe body too large");
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
  if (typeof value.rejection !== "string" || value.rejection.length < 1 || value.rejection.length > 180) {
    throw new Error("Invalid rejection evidence");
  }
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
    if (request.method !== "GET" && request.method !== "HEAD") throw new Error("Not found");
    const filePath = resolveFile(request.url);
    const stat = statSync(filePath);
    if (!stat.isFile()) throw new Error("Not found");
    const headers = {
      "Content-Type": contentTypes.get(extname(filePath)) || "application/octet-stream",
      "Content-Length": String(stat.size),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    };
    if (mode === "hosted" && requestedReleaseMode === "invalid-signature" && filePath.endsWith("manifest.sig")) {
      const envelope = JSON.parse(readFileSync(filePath, "utf8"));
      envelope.signatureBase64 = `${envelope.signatureBase64.slice(0, -4)}AAAA`;
      const bytes = Buffer.from(`${JSON.stringify(envelope)}\n`, "utf8");
      headers["Content-Length"] = String(bytes.length);
      response.writeHead(200, headers);
      if (request.method !== "HEAD") response.end(bytes);
      else response.end();
      return;
    }
    if (mode === "hosted" && requestedReleaseMode === "modified-asset" && filePath.endsWith("app.js")) {
      const bytes = Buffer.concat([readFileSync(filePath), Buffer.from("\n// synthetic post-signing modification\n", "utf8")]);
      headers["Content-Length"] = String(bytes.length);
      response.writeHead(200, headers);
      if (request.method !== "HEAD") response.end(bytes);
      else response.end();
      return;
    }
    response.writeHead(200, headers);
    if (request.method === "HEAD") response.end();
    else createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  const detail = mode === "hosted" ? ` (${requestedReleaseMode}: ${pointer.buildId})` : "";
  console.log(`FS ${mode} synthetic source listening on http://127.0.0.1:${port}${detail}`);
});
