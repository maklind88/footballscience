import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const lockSchema = "footballscience-release-lock-v1";
const defaultPollMs = 5_000;
const defaultStatusMs = 30_000;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function safeGit(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function currentCommand() {
  return [process.argv[1] || "node", ...process.argv.slice(2)].join(" ").trim();
}

export function getReleaseLockDir() {
  return path.resolve(process.env.FOOTBALLSCIENCE_RELEASE_LOCK_DIR || path.join(os.tmpdir(), "footballscience-release.lock"));
}

export function isProcessAlive(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return true;
  try {
    process.kill(numericPid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

export function readReleaseLockOwner(lockDir = getReleaseLockDir()) {
  const ownerPath = path.join(lockDir, "owner.json");
  const raw = fs.readFileSync(ownerPath, "utf8");
  const owner = JSON.parse(raw);
  if (owner?.schema !== lockSchema || !owner?.token || !owner?.pid) {
    throw new Error("Release lock owner metadata is invalid.");
  }
  return owner;
}

function writeReleaseLockOwner(lockDir, owner) {
  const ownerPath = path.join(lockDir, "owner.json");
  fs.writeFileSync(ownerPath, `${JSON.stringify(owner, null, 2)}\n`, { mode: 0o600 });
}

function describeOwner(owner) {
  const branch = owner.branch || "unknown branch";
  const sha = owner.sha ? String(owner.sha).slice(0, 12) : "unknown sha";
  const since = owner.acquiredAt || owner.processStartTime || "unknown time";
  return `${owner.command || "release"} on ${branch}@${sha}, pid ${owner.pid}, since ${since}, worktree ${owner.worktree || "unknown"}`;
}

function removeStaleLock(lockDir, owner) {
  if (isProcessAlive(owner.pid)) return false;
  fs.rmSync(lockDir, { recursive: true, force: true });
  console.log(`Release lock: removed stale lock from dead pid ${owner.pid}.`);
  return true;
}

function buildOwner(options = {}) {
  const worktree = path.resolve(options.worktree || options.rootDir || process.cwd());
  const branch = options.branch || safeGit(["branch", "--show-current"], worktree);
  const sha = options.sha || safeGit(["rev-parse", "HEAD"], worktree);
  return {
    schema: lockSchema,
    token: options.token || randomUUID(),
    pid: process.pid,
    processStartTime: new Date(Date.now() - Math.round(process.uptime() * 1000)).toISOString(),
    acquiredAt: new Date().toISOString(),
    worktree,
    branch,
    sha,
    command: options.command || currentCommand(),
  };
}

export function acquireReleaseLock(options = {}) {
  const lockDir = path.resolve(options.lockDir || getReleaseLockDir());
  const wait = options.wait !== false;
  const pollMs = Number(options.pollMs || defaultPollMs);
  const statusMs = Number(options.statusMs || defaultStatusMs);
  const timeoutMs = Number(options.timeoutMs || 0);
  const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : 0;
  let lastStatusAt = 0;

  while (true) {
    const owner = buildOwner(options);
    try {
      fs.mkdirSync(lockDir, { mode: 0o700 });
      writeReleaseLockOwner(lockDir, owner);
      return {
        owner,
        lockDir,
        release() {
          releaseReleaseLock({ lockDir, token: owner.token });
        },
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }

    let currentOwner;
    try {
      currentOwner = readReleaseLockOwner(lockDir);
    } catch (error) {
      throw new Error(`Release lock exists but cannot be trusted: ${error.message}`);
    }

    if (removeStaleLock(lockDir, currentOwner)) continue;
    if (!wait) {
      throw new Error(`Another release is already active: ${describeOwner(currentOwner)}`);
    }
    if (deadline && Date.now() >= deadline) {
      throw new Error(`Timed out waiting for release lock: ${describeOwner(currentOwner)}`);
    }

    if (Date.now() - lastStatusAt >= statusMs) {
      console.log(`Release lock: waiting for ${describeOwner(currentOwner)}`);
      lastStatusAt = Date.now();
    }
    sleep(Math.min(pollMs, deadline ? Math.max(1, deadline - Date.now()) : pollMs));
  }
}

export function releaseReleaseLock({ lockDir = getReleaseLockDir(), token } = {}) {
  let owner;
  try {
    owner = readReleaseLockOwner(lockDir);
  } catch {
    return false;
  }

  if (owner.token !== token) return false;
  fs.rmSync(lockDir, { recursive: true, force: true });
  return true;
}

export async function withReleaseLock(options, callback) {
  const lock = acquireReleaseLock({ ...options, wait: options?.wait !== false });
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    lock.release();
  };
  const signalHandler = (signal) => {
    release();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.once(signal, signalHandler);
  }

  try {
    console.log(`Release lock: acquired ${lock.lockDir}`);
    return await callback(lock.owner);
  } finally {
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
      process.removeListener(signal, signalHandler);
    }
    release();
    console.log("Release lock: released");
  }
}
