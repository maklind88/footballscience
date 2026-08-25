import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegStaticPath from "ffmpeg-static";
import { runCapture, selectPython } from "./install-support.mjs";
import { readSam2ProviderManifest, resolveInstalledSam2Provider, sam2ProviderInstallDir } from "./provider-runtime.mjs";

export async function preflightSam2Provider(options = {}) {
  const manifest = options.manifest || readSam2ProviderManifest();
  const installed = resolveInstalledSam2Provider(options.provider || {});
  if (!installed) {
    const python = await selectPython({ command: options.python, env: options.env || process.env });
    return {
      ok: false,
      status: "not-installed",
      provider: manifest.displayName,
      installDir: sam2ProviderInstallDir({ manifest, env: options.env || process.env }),
      python: python?.version || "Python 3.10-3.12 required",
      action: "npm run fs-player:tracking:install -- --accept-license",
    };
  }
  const result = await runCapture(installed.command, [
    ...installed.args,
    "--preflight",
    "--json",
  ], {
    allowFailure: true,
    env: {
      ...process.env,
      ...installed.env,
      FS_SAM2_FFMPEG_PATH: options.ffmpegPath || ffmpegStaticPath || "ffmpeg",
    },
  });
  if (result.code !== 0) {
    return { ok: false, status: "invalid-install", provider: manifest.displayName, error: result.stderr.trim() };
  }
  return { ...JSON.parse(result.stdout.trim()), status: "ready", installDir: installed.installDir };
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const json = process.argv.includes("--json");
  try {
    const report = await preflightSam2Provider();
    console.log(json ? JSON.stringify(report) : JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    console.error(json ? JSON.stringify({ ok: false, error: error.message }) : error.message);
    process.exitCode = 1;
  }
}
