import { expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const providerPath = path.join(
  rootDir,
  "desktop/local-video-app/tracking-stage-candidates/providers/yolox-reference-detection-provider.py",
);

test("YOLOX reference provider is a bounded network-free benchmark runtime source", async () => {
  const source = await fs.readFile(providerPath, "utf8");
  expect(source.split("\n").length).toBeLessThanOrEqual(500);
  expect(source).toContain("football-science-tracking-stage-result-v1");
  expect(source).toContain("FS_TRACKING_NETWORK_DISABLED");
  expect(source).toContain("c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063");
  expect(source).toContain('providers=["CPUExecutionProvider"]');
  expect(source).not.toMatch(/^\s*(?:from|import)\s+(?:requests|socket|subprocess|urllib|httpx|aiohttp)\b/m);
  expect(source).not.toMatch(/https?:\/\//);

  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-yolox-pycache-"));
  try {
    const syntax = spawnSync("python3", ["-m", "py_compile", providerPath], {
      encoding: "utf8",
      env: { ...process.env, PYTHONPYCACHEPREFIX: cacheDir },
    });
    expect(syntax.status, syntax.stderr || syntax.stdout).toBe(0);
  } finally {
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});
