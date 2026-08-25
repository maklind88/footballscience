import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function byteLimit(maxBytes) {
  let received = 0;
  return new Transform({
    transform(chunk, encoding, callback) {
      received += chunk.length;
      if (received > maxBytes) callback(new Error("The provider asset exceeded its approved size limit."));
      else callback(null, chunk);
    },
  });
}

async function verifyAsset(filePath, expected = {}) {
  const stat = await fs.stat(filePath);
  if (expected.bytes && stat.size !== expected.bytes) {
    throw new Error(`Provider asset size mismatch: expected ${expected.bytes}, received ${stat.size}.`);
  }
  const digest = await sha256File(filePath);
  if (digest !== expected.sha256) throw new Error("Provider asset checksum verification failed.");
  return { bytes: stat.size, sha256: digest };
}

export async function stageVerifiedAsset(options = {}) {
  const destination = path.resolve(options.destination);
  const temporary = `${destination}.partial`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.rm(temporary, { force: true });
  try {
    if (options.localPath) {
      await fs.copyFile(path.resolve(options.localPath), temporary);
    } else {
      const url = new URL(options.url);
      if (url.protocol !== "https:" || url.username || url.password) {
        throw new Error("Provider assets must use an approved HTTPS URL without embedded credentials.");
      }
      const response = await (options.fetcher || fetch)(url, { redirect: "follow" });
      if (!response.ok || !response.body) throw new Error(`Provider asset download failed with HTTP ${response.status}.`);
      await pipeline(
        Readable.fromWeb(response.body),
        byteLimit(Number(options.maxBytes) || Number(options.expected?.bytes) || 512 * 1024 * 1024),
        createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
      );
    }
    const verified = await verifyAsset(temporary, options.expected);
    await fs.rename(temporary, destination);
    return verified;
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

export function runCapture(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-2_000_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-100_000); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || options.allowFailure) resolve({ code, stdout, stderr });
      else reject(new Error(stderr.trim() || `${command} exited with ${code}.`));
    });
  });
}

export function runVisible(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env || process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}.`))));
  });
}

function supportedPython(version = "") {
  const match = String(version).match(/Python\s+(\d+)\.(\d+)/i);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major === 3 && minor >= 10 && minor < 13;
}

export async function selectPython(options = {}) {
  const candidates = [...new Set([
    options.command,
    options.env?.FS_SAM2_PYTHON,
    "python3.12",
    "python3.11",
    "python3.10",
    "python3",
  ].filter(Boolean))];
  for (const command of candidates) {
    try {
      const result = await runCapture(command, ["--version"], { allowFailure: true });
      const version = `${result.stdout} ${result.stderr}`.trim();
      if (result.code === 0 && supportedPython(version)) return { command, version };
    } catch {
      // Continue to the next explicit version candidate.
    }
  }
  return null;
}

export async function stageInstallDirectory(stagedDir, installDir, force = false) {
  let existing = false;
  try {
    existing = (await fs.stat(installDir)).isDirectory();
  } catch {
    existing = false;
  }
  if (existing && !force) throw new Error("The approved tracking provider is already installed. Use --force to reinstall it.");
  const backupDir = existing ? `${installDir}.backup-${Date.now()}` : "";
  if (backupDir) await fs.rename(installDir, backupDir);
  try {
    await fs.rename(stagedDir, installDir);
    return backupDir;
  } catch (error) {
    if (backupDir) await fs.rename(backupDir, installDir);
    throw error;
  }
}

export async function rollbackInstall(installDir, backupDir = "") {
  await fs.rm(installDir, { recursive: true, force: true });
  if (backupDir) await fs.rename(backupDir, installDir);
}

export async function completeInstall(backupDir = "") {
  if (backupDir) await fs.rm(backupDir, { recursive: true, force: true });
}
