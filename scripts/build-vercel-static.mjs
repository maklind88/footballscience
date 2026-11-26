import { cp, lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join, matchesGlob, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSessionsOfflinePackage } from "./build-sessions-offline-package.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const buildDirectory = join(root, ".vercel");
const output = join(buildDirectory, "footballscience-static");
const manifestName = "sessions-offline-package.json";

// Preserve the Other preset's deployed source roots and root assets. Adding
// a build command with "." as output would also serve API and workspace files.
const publicDirectories = new Set(["assets", "desktop", "docs", "scripts", "src", "supabase"]);
const rootDocuments = new Set(["AGENTS.md", "PROJECT_CONTEXT.md", "requirements-scouting-statsbomb.txt"]);
const rootWebAsset = /^[\w.-]+\.(?:css|html|js|mjs|webmanifest)$/;
const platformFiles = new Set(["middleware.js", "middleware.ts", "scripts/build-vercel-static.mjs"]);
const ignoreRules = (await readFile(join(root, ".vercelignore"), "utf8"))
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line && !line.startsWith("#"));

function isIgnored(path, directory) {
  let ignored = false;
  for (const rule of ignoreRules) {
    const pattern = rule.replace(/^!/, "").replace(/^\.\//, "");
    if (pattern.endsWith("/") && !directory) continue;
    const match = pattern.replace(/^\/|\/$/g, "");
    const target = pattern.startsWith("/") || match.includes("/") ? path : basename(path);
    if (match && matchesGlob(target, match)) ignored = !rule.startsWith("!");
  }
  return ignored;
}

async function include(path) {
  const file = relative(root, path).split(sep).join("/");
  if (file.split("/").some(part => part.startsWith(".") || part === "node_modules") || platformFiles.has(file)) return false;
  const stats = await lstat(path);
  if (isIgnored(file, stats.isDirectory())) return false;
  if (stats.isSymbolicLink()) throw new Error("Unexpected symbolic link among public Vercel files: " + file);
  return stats.isDirectory() || stats.isFile();
}

await mkdir(buildDirectory, { recursive: true });
if (!(await lstat(buildDirectory)).isDirectory()) throw new Error(".vercel must be a local directory.");
const staging = await mkdtemp(join(buildDirectory, "footballscience-static-"));
try {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const rootAsset = !entry.isDirectory() && (rootWebAsset.test(entry.name) || rootDocuments.has(entry.name));
    if (!publicDirectories.has(entry.name) && !rootAsset) continue;
    await cp(join(root, entry.name), join(staging, entry.name), { recursive: true, filter: include });
  }
  const { manifest } = await buildSessionsOfflinePackage({ directory: staging });
  await writeFile(join(staging, manifestName), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  await rm(output, { recursive: true, force: true });
  await rename(staging, output);
  console.log("Prepared Sessions offline package " + manifest.packageId);
} finally {
  await rm(staging, { recursive: true, force: true });
}
