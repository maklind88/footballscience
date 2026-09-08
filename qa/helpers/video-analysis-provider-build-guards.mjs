import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";

export async function expectMacTrackingBuildGuards(moduleUrl, exportName, options, errorPrefix) {
  for (const [platform, arch] of [
    ["linux", "x64"], ["linux", "arm64"], ["darwin", "x64"], ["darwin", "arm64"],
  ]) {
    await test.step(`build input guards on ${platform}/${arch}`, async () => {
      // Isolate simulated hosts from Playwright; never invoke native build tools.
      const script = `
        import childProcess from "node:child_process";
        import { syncBuiltinESMExports } from "node:module";
        const input = ${JSON.stringify({ moduleUrl, exportName, options, platform, arch })};
        for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) {
          childProcess[name] = () => { throw new Error("Unexpected native build invocation"); };
        }
        syncBuiltinESMExports();
        Object.defineProperties(process, {
          platform: { value: input.platform }, arch: { value: input.arch },
        });
        const service = await import(input.moduleUrl);
        try {
          await service[input.exportName](input.options);
          process.stdout.write(JSON.stringify({ code: "UNEXPECTED_BUILD_SUCCESS" }));
        } catch (error) {
          process.stdout.write(JSON.stringify({ code: error.code || error.message }));
        }
      `;
      const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
        encoding: "utf8", timeout: 10_000, maxBuffer: 64 * 1024,
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      const suffix = platform === "darwin" && arch === "arm64"
        ? "CHECKSUM_MISMATCH" : "PLATFORM_UNSUPPORTED";
      expect(JSON.parse(result.stdout)).toEqual({ code: `${errorPrefix}_${suffix}` });
      await expect(fs.stat(options.outputPath)).rejects.toMatchObject({ code: "ENOENT" });
    });
  }
}
