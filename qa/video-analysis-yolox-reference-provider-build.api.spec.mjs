import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expectMacTrackingBuildGuards } from "./helpers/video-analysis-provider-build-guards.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

test("YOLOX reference build accepts only explicit offline inputs", async () => {
  const service = await import(moduleUrl(
    "desktop/local-video-app/tracking-stage-candidates/build-yolox-reference-provider.mjs",
  ));
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
  expect(() => service.parseTrackingCandidateBuildArguments(["--python", "/tmp/python"]))
    .toThrow(/required/);
});

test("YOLOX reference build pins the no-SysV patch and rejects another source distribution", async () => {
  const buildPath = "desktop/local-video-app/tracking-stage-candidates/build-yolox-reference-provider.mjs";
  const patchPath = path.join(
    rootDir,
    "desktop/local-video-app/tracking-stage-candidates/providers/pyinstaller-6.15.0-darwin-no-sysv.patch",
  );
  const patch = await fs.readFile(patchPath);
  expect(createHash("sha256").update(patch).digest("hex"))
    .toBe("14ec28aebf1e7ae4318dcdb1ebfa5c384210e9cd48d20c67e3b9d35fb1523b34");
  expect(patch.toString("utf8")).toContain("not ctx.env.DEST_OS == 'darwin'");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-yolox-build-contract-"));
  try {
    const sdistPath = path.join(directory, "pyinstaller.tar.gz");
    await fs.writeFile(sdistPath, "not-the-reviewed-source-distribution");
    await expectMacTrackingBuildGuards(moduleUrl(buildPath), "buildYoloxReferenceProvider", {
      outputPath: path.join(directory, "provider"),
      pythonPath: process.execPath,
      sdistPath,
    }, "TRACKING_CANDIDATE_BUILD");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
