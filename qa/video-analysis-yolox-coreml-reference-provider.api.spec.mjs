import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expectMacTrackingBuildGuards } from "./helpers/video-analysis-provider-build-guards.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const providerDir = path.join(
  rootDir,
  "desktop/local-video-app/tracking-stage-candidates/providers",
);

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

test("YOLOX CoreML wrapper preserves the pinned offline provider and refuses CPU-only activation", async () => {
  const wrapperPath = path.join(providerDir, "yolox-coreml-reference-detection-provider.py");
  const basePath = path.join(providerDir, "yolox-reference-detection-provider.py");
  const wrapper = await fs.readFile(wrapperPath);
  const base = await fs.readFile(basePath);
  const source = wrapper.toString("utf8");
  expect(source.split("\n").length).toBeLessThanOrEqual(100);
  expect(createHash("sha256").update(wrapper).digest("hex"))
    .toBe("30c2d5f438be1d750dc877272d3d49078a4fd53cc1c1271b4224cd9c820b9d38");
  expect(createHash("sha256").update(base).digest("hex"))
    .toBe("6c156bac230a2d5899ed6087977a5910211f4de8fc7fc986e16e5b1e68329a7a");
  expect(source).toContain('COREML_PROVIDER = "CoreMLExecutionProvider"');
  expect(source).toContain("[COREML_PROVIDER, CPU_PROVIDER]");
  expect(source).toContain("coreml-execution-provider-not-active");
  expect(source).toContain("yolox-reference-detection-provider.py");
  expect(source).not.toMatch(/^\s*(?:from|import)\s+(?:requests|socket|subprocess|urllib|httpx|aiohttp)\b/m);
  expect(source).not.toMatch(/https?:\/\//);

  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-yolox-coreml-pycache-"));
  try {
    const syntax = spawnSync("python3", ["-m", "py_compile", wrapperPath], {
      encoding: "utf8",
      env: { ...process.env, PYTHONPYCACHEPREFIX: cacheDir },
    });
    expect(syntax.status, syntax.stderr || syntax.stdout).toBe(0);
  } finally {
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});

test("YOLOX CoreML build pins the complete no-SysV runtime and accepts no downloader", async () => {
  const buildPath = "desktop/local-video-app/tracking-stage-candidates/build-yolox-coreml-reference-provider.mjs";
  const service = await import(moduleUrl(buildPath));
  const source = await fs.readFile(path.join(rootDir, buildPath), "utf8");
  expect(service.parseTrackingCandidateBuildArguments([
    "--python", "/tmp/venv/bin/python",
    "--pyinstaller-sdist", "/tmp/pyinstaller-6.15.0.tar.gz",
    "--output", "/tmp/provider",
    "--json",
  ])).toEqual({
    json: true,
    outputPath: "/tmp/provider",
    pythonPath: "/tmp/venv/bin/python",
    sdistPath: "/tmp/pyinstaller-6.15.0.tar.gz",
  });
  expect(() => service.parseTrackingCandidateBuildArguments(["--download"]))
    .toThrow(/Unknown build option/);
  expect(source).toContain("b3f0fe475d453269954db034cca1ca0881e29849cd0d35b55db0d33dcf272224");
  expect(source).toContain("52_022_320");
  expect(source).toContain('"--hidden-import", "cv2"');
  expect(source).toContain('"--hidden-import", "numpy"');
  expect(source).toContain('`${baseProviderSourcePath}:.`');
  expect(source).not.toMatch(/https?:\/\//);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-yolox-coreml-build-contract-"));
  try {
    const sdistPath = path.join(directory, "pyinstaller.tar.gz");
    await fs.writeFile(sdistPath, "not-the-reviewed-source-distribution");
    await expectMacTrackingBuildGuards(moduleUrl(buildPath), "buildYoloxCoremlReferenceProvider", {
      outputPath: path.join(directory, "provider"),
      pythonPath: process.execPath,
      sdistPath,
    }, "TRACKING_CANDIDATE_BUILD");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
