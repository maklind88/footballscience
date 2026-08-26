import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCapture } from "../../tracking-providers/sam2/install-support.mjs";
import { selectTrackEvalPython } from "./install-evaluator.mjs";
import {
  readTrackEvalManifest,
  resolveInstalledTrackEval,
  trackEvalInstallDir,
} from "./evaluator-runtime.mjs";

export async function preflightTrackEval(options = {}) {
  const manifest = options.manifest || readTrackEvalManifest();
  const installed = resolveInstalledTrackEval({
    ...(options.evaluator || {}),
    manifest,
    env: options.env || process.env,
  });
  if (!installed) {
    const python = await selectTrackEvalPython({ command: options.python, env: options.env || process.env });
    return {
      ok: false,
      status: "not-installed",
      evaluator: manifest.displayName,
      installDir: trackEvalInstallDir({ manifest, env: options.env || process.env }),
      python: python?.version || "Python 3.10-3.12 required",
      action: "npm run fs-player:tracking:trackeval:install -- --accept-license",
    };
  }
  const result = await runCapture(installed.command, [...installed.args, "--preflight", "--json"], {
    allowFailure: true,
    env: { ...process.env, ...installed.env },
  });
  if (result.code !== 0) {
    return { ok: false, status: "invalid-install", evaluator: manifest.displayName, error: result.stderr.trim() };
  }
  const report = JSON.parse(result.stdout.trim());
  return { ...report, status: report.ok ? "ready" : "invalid-install", installDir: installed.installDir };
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const json = process.argv.includes("--json");
  try {
    const report = await preflightTrackEval();
    console.log(json ? JSON.stringify(report) : JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    console.error(json ? JSON.stringify({ ok: false, error: error.message }) : error.message);
    process.exitCode = 1;
  }
}
