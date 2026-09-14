import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const retryDelaysMs = [15_000, 30_000];

export function isTransientFfmpegDownloadFailure(output) {
  return /npm (?:error|ERR!) path [^\r\n]*[/\\]node_modules[/\\]ffmpeg-static\s*$/m.test(output)
    && /url: ['"]https:\/\/github\.com\/eugeneware\/ffmpeg-static\/releases\/download\//.test(output)
    && /statusCode: (?:429|502|503|504)\b/.test(output);
}

function runNpmCi() {
  return new Promise((resolve) => {
    let output = "";
    const child = spawn("npm", ["ci"], { stdio: ["ignore", "pipe", "pipe"] });
    const forward = (stream) => (chunk) => {
      stream.write(chunk);
      output = (output + chunk.toString()).slice(-65_536);
    };
    child.stdout.on("data", forward(process.stdout));
    child.stderr.on("data", forward(process.stderr));
    child.once("error", (error) => {
      console.error(error.message);
      resolve({ status: 1, output: "", signal: null });
    });
    child.once("close", (status, signal) => resolve({ status: status ?? 1, output, signal }));
  });
}

export async function installCiDependencies({
  runAttempt = runNpmCi,
  wait = sleep,
  log = console.error,
} = {}) {
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    const result = await runAttempt();
    if (result.status === 0) return 0;
    if (result.signal || attempt === retryDelaysMs.length
      || !isTransientFfmpegDownloadFailure(result.output)) return result.status || 1;

    // npm ci removes a partially installed binary and keeps lockfile/lifecycle checks intact.
    const delay = retryDelaysMs[attempt];
    log(`FFmpeg download returned a temporary HTTP error; retrying npm ci in ${delay / 1000}s (${attempt + 2}/3).`);
    await wait(delay);
  }
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await installCiDependencies();
}
