import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("../fixtures/session-save-versions/", import.meta.url);
export function historicalSources(name) {
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", root)));
  if (!Object.hasOwn(manifest, name)) throw new Error("Unknown historical Sessions fixture");
  const files = JSON.parse(readFileSync(new URL(name + ".json", root)));
  const expected = manifest[name].sha256;
  if (JSON.stringify(Object.keys(files).sort()) !== JSON.stringify(Object.keys(expected).sort())) throw new Error("Historical dependency set changed");
  for (const [path, source] of Object.entries(files)) {
    if (createHash("sha256").update(source).digest("hex") !== expected[path]) throw new Error("Historical Sessions bytes changed: " + path);
    // The pinned browser dependency closure must be self-contained. Never
    // silently load a current module behind a historical client's import.
    for (const [, dependency] of source.matchAll(/(?:from\s+|import\s*\()?["'](\.{1,2}\/[^"']+\.mjs)["']/g)) {
      const imported = new URL(dependency, "http://fixture" + path).pathname;
      if (!Object.hasOwn(files, imported)) throw new Error("Unpinned historical import: " + imported);
    }
  }
  return new Map(Object.entries(files));
}
