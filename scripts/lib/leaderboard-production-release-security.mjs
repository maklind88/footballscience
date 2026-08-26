import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
const secretNames = Object.freeze(["GITHUB_TOKEN", "VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID", "CRON_SECRET", "LIVE_QA_USERNAME", "LIVE_QA_PASSWORD", "LIVE_QA_PEER_USERNAME", "LIVE_QA_PEER_PASSWORD", "STAGING_QA_USERNAME", "STAGING_QA_PASSWORD"]);
export function invariant(condition, message) { if (!condition) throw new Error(message); }
export function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); } const readonlyRequestLabels = new Set(["login", "client-config", "identity", "leaderboard", "anonymous-leaderboard", "anonymous-dispose"]);
export async function sanitizedApiRequest(label, execute) {
  invariant(readonlyRequestLabels.has(label) && typeof execute === "function", "Read-only API request label was not allowlisted.");
  try { return await execute(); } catch { throw new Error(`Leaderboard read-only request failed: ${label}.`); }
}
export function canonicalJson(value) {
  const normalize = (input) => {
    if (Array.isArray(input)) return input.map(normalize);
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(Object.keys(input).sort().map((key) => [key, normalize(input[key])]));
  };
  return JSON.stringify(normalize(value));
}
export function canonicalDigest(value) { return sha256(`${canonicalJson(value)}\n`); }
export function readJson(filePath, label = filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} was not valid JSON: ${error.message}`);
  }
}
export function readDotenv(filePath) {
  const values = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2];
    try { value = JSON.parse(value); } catch {}
    values[match[1]] = String(value);
  }
  return values;
}
export function assertSupabaseUrl(value, expectedRef, deniedRef = "") {
  let parsed = null;
  try { parsed = new URL(String(value || "")); } catch {}
  const exactHost = `${expectedRef}.supabase.co`;
  invariant(parsed?.href === `https://${exactHost}/` && !parsed.port && !parsed.username && !parsed.password, "Supabase URL did not match the exact expected HTTPS root origin.");
  invariant(!deniedRef || parsed.hostname !== `${deniedRef}.supabase.co`, "Supabase URL crossed the denied project boundary.");
  return { hostname: parsed.hostname, ref: expectedRef };
}
function fileContains(filePath, needle) {
  const descriptor = fs.openSync(filePath, "r");
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  let tail = Buffer.alloc(0);
  try {
    for (let size = fs.readSync(descriptor, chunk, 0, chunk.length, null); size > 0; size = fs.readSync(descriptor, chunk, 0, chunk.length, null)) {
      const bytes = tail.length ? Buffer.concat([tail, chunk.subarray(0, size)]) : chunk.subarray(0, size);
      if (bytes.indexOf(needle) >= 0) return true;
      tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - Math.max(needle.length - 1, 0))));
    }
    return false;
  } finally { fs.closeSync(descriptor); }
}
function regularFileWithin(root, relative, label) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  invariant(resolved.startsWith(`${resolvedRoot}${path.sep}`), `${label} escaped its trusted root.`);
  invariant(fs.lstatSync(resolved).isFile(), `${label} was a symlink or special file.`);
  return resolved;
}
export function assertOnlyMirroredOccurrences(outputDir, sourceDir, needle, allowedPaths) {
  const outputRoot = path.resolve(outputDir);
  invariant(fs.lstatSync(outputRoot).isDirectory(), "Build output root must be a real directory.");
  const needleBytes = Buffer.from(needle);
  invariant(needleBytes.length > 0, "Build output scan needle must not be empty.");
  const found = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      const relative = path.relative(outputRoot, full);
      invariant(path.resolve(full).startsWith(`${outputRoot}${path.sep}`), "Build output traversal escaped its root.");
      const stat = fs.lstatSync(full);
      if (stat.isDirectory()) visit(full);
      else {
        invariant(stat.isFile(), `Build output contained a symlink or special entry at ${relative}.`);
        if (fileContains(full, needleBytes)) found.push(relative);
      }
    }
  };
  visit(outputRoot);
  invariant(canonicalJson(found.sort()) === canonicalJson([...allowedPaths].sort()), "Build output contained an unexpected staging-reference occurrence.");
  for (const relative of allowedPaths) {
    const output = fs.readFileSync(regularFileWithin(outputRoot, relative, "Allowed build-output mirror"));
    const source = fs.readFileSync(regularFileWithin(sourceDir, relative.replace(/^static\//, ""), "Allowed source mirror"));
    invariant(output.equals(source), `Build output mirror drifted at ${relative}.`);
  }
  return found;
}
export function captureSecrets(source = process.env) {
  const captured = {};
  for (const name of secretNames) {
    const value = String(source[name] || "");
    if (value) {
      captured[name] = value;
      if (source.GITHUB_ACTIONS === "true") {
        process.stdout.write(`::add-mask::${escapeWorkflowCommandData(value)}\n`);
        const encoded = encodeURIComponent(value);
        if (encoded !== value) process.stdout.write(`::add-mask::${escapeWorkflowCommandData(encoded)}\n`);
      }
    }
    delete source[name];
  }
  return Object.freeze(captured);
}
export function escapeWorkflowCommandData(value) {
  return String(value).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
export function redact(value, secrets = {}) {
  let output = String(value || "");
  for (const secret of Object.values(secrets).filter(Boolean).sort((a, b) => b.length - a.length)) {
    output = output.split(secret).join("***");
    output = output.split(encodeURIComponent(secret)).join("***");
  }
  output = output.replace(/\bBearer\s+[^\s"',}\]]+/gi, "Bearer ***"); output = output.replace(/((?:\\?["'])?(?:access_token|refresh_token|teamId)(?:\\?["'])?\s*[:=]\s*(?:\\?["'])?)[^&\s"',}\]\\]+/gi, "$1***"); output = output.replace(/(teamId(?:=|%3D)).*?(?=%26|[&#\s"'\\]|$)/gi, "$1***");
  output = output.replace(/(Authorization%3A(?:%20|\+)*Bearer(?:%20|\+)+).*?(?=%26|[&#\s"'\\]|$)/gi, "$1***");
  output = output.replace(/((?:access_token|refresh_token|teamId)(?:%3D|=)).*?(?=%26|[&#\s"'\\]|$)/gi, "$1***");
  output = output.replace(/((?:%22|%27)(?:access_token|refresh_token|teamId)(?:%22|%27)%3A(?:%22|%27)).*?(?=%22|%27|%26|[&#\s"'\\]|$)/gi, "$1***");
  return output;
}
export function childEnvironment(overrides = {}) {
  const source = process.env;
  const allowed = ["CI", "GITHUB_ACTIONS", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "HOME", "LANG", "LC_ALL", "NODE", "PATH", "RUNNER_OS", "RUNNER_TEMP", "SHELL", "TERM", "TMPDIR"];
  const env = Object.fromEntries(allowed.filter((name) => source[name]).map((name) => [name, source[name]]));
  return {
    ...env,
    CI: "1",
    DO_NOT_TRACK: "1",
    NO_UPDATE_NOTIFIER: "1",
    VERCEL_TELEMETRY_DISABLED: "1",
    ...overrides,
  };
}
export function runChecked(label, command, args, options = {}) {
  invariant(!args.some((arg) => /[\r\n\0]/.test(String(arg))), `${label} arguments contained forbidden control bytes.`);
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env || childEnvironment(),
    input: options.input,
    maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
    stdio: options.inherit ? "inherit" : [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    timeout: options.timeoutMs,
  });
  if (result.error) throw new Error(`${label} failed to start.`);
  const stdout = redact(result.stdout, options.secrets);
  const stderr = redact(result.stderr, options.secrets);
  if (result.status !== 0) {
    throw new Error(`${label} failed (${result.status ?? "unknown"}).\n${[stdout, stderr].filter(Boolean).join("\n").slice(-6000)}`);
  }
  if (options.print && stdout) process.stdout.write(stdout.endsWith("\n") ? stdout : `${stdout}\n`);
  if (options.print && stderr) process.stderr.write(stderr.endsWith("\n") ? stderr : `${stderr}\n`);
  return stdout;
}
export function runCaptured(label, command, args, options = {}) {
  invariant(!args.some((arg) => /[\r\n\0]/.test(String(arg))), `${label} arguments contained forbidden control bytes.`);
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env || childEnvironment(),
    input: options.input,
    maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    timeout: options.timeoutMs,
  });
  return {
    error: result.error ? new Error(`${label} failed to start.`) : undefined,
    status: result.status,
    signal: result.signal,
    stdout: redact(result.stdout, options.secrets),
    stderr: redact(result.stderr, options.secrets),
  };
}
export function git(cwd, args) {
  return runChecked(`git ${args.join(" ")}`, "git", args, { cwd, env: childEnvironment() }).trim();
}
export async function fetchJson(url, { token = "", method = "GET", body, label = "request", headers = {}, redirect = "follow" } = {}) {
  invariant(["error", "follow", "manual"].includes(redirect), "Unsupported fetch redirect policy.");
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) {
    const reason = payload?.error?.message || payload?.message || response.statusText;
    throw new Error(`${label} returned ${response.status}: ${redact(String(reason || "unknown"), token ? { token } : {}).slice(0, 300)}`);
  }
  return payload;
}
export async function fetchBytes(url, { token = "", label = "request", redirect = "follow" } = {}) {
  invariant(["error", "follow", "manual"].includes(redirect), "Unsupported fetch redirect policy.");
  const response = await fetch(url, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    redirect,
    signal: AbortSignal.timeout(20_000),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`${label} returned ${response.status}.`);
  return { bytes, response };
}
export function assertArtifactPath(filePath, runnerTemp) {
  const resolved = path.resolve(String(filePath || ""));
  const trusted = path.resolve(String(runnerTemp || ""));
  invariant(resolved.startsWith(`${trusted}${path.sep}`), "Release artifact must remain under RUNNER_TEMP.");
  return resolved;
}
export function writeArtifact(filePath, value) {
  const parent = path.dirname(filePath);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  fs.chmodSync(parent, 0o700);
  const bytes = Buffer.from(`${canonicalJson(value)}\n`, "utf8");
  fs.writeFileSync(filePath, bytes, { flag: "wx", mode: 0o600 });
  return { bytes, sha256: sha256(bytes) };
}
export function readArtifact(filePath, expectedSha256) {
  const bytes = fs.readFileSync(filePath);
  invariant(sha256(bytes) === expectedSha256, "Downloaded release artifact SHA256 did not match the plan output.");
  const mode = fs.statSync(filePath).mode & 0o777;
  invariant(mode === 0o600, "Downloaded release artifact must be mode 0600.");
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}
export function appendGithubOutput(values) {
  const output = String(process.env.GITHUB_OUTPUT || "");
  if (!output) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join("");
  fs.appendFileSync(output, lines, { encoding: "utf8" });
}
export function assertNoSecretLeak(value, secrets) {
  const serialized = Buffer.isBuffer(value) ? value.toString("utf8") : canonicalJson(value);
  for (const secret of Object.values(secrets).filter(Boolean)) {
    invariant(!serialized.includes(secret) && !serialized.includes(encodeURIComponent(secret)), "Release artifact contained secret material.");
  }
}
