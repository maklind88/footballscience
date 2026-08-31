import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../candidates/hosted/", import.meta.url));
const sharedRoot = fileURLToPath(new URL("../candidates/shared/", import.meta.url));
const port = Number(process.env.FS_DESKTOP_SPIKE_PORT || 47842);
const contentTypes = new Map([[".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".json", "application/json; charset=utf-8"]]);

function resolveFile(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0] || "/");
  if (cleanPath.startsWith("/shared/")) return join(sharedRoot, normalize(cleanPath.slice(8)));
  return join(root, normalize(cleanPath === "/" ? "index.html" : cleanPath.slice(1)));
}

createServer((request, response) => {
  try {
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
  console.log(`FS hosted spike listening on http://127.0.0.1:${port}`);
});
