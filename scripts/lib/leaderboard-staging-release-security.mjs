import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const CHILD_ENVIRONMENT_ALLOWLIST = Object.freeze([
  "PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "TMP", "TEMP",
]);

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assertPrivateDirectory(value, label) {
  const stat = fs.lstatSync(value);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700) {
    throw new Error(`${label} must be a private mode-0700 directory.`);
  }
}

function assertRegularFile(value, label) {
  const stat = fs.lstatSync(value);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file.`);
}

export function scopedChildEnvironment(extra = {}, source = process.env) {
  const allowed = Object.fromEntries(
    CHILD_ENVIRONMENT_ALLOWLIST.flatMap((key) => source[key] === undefined ? [] : [[key, source[key]]]),
  );
  return { ...allowed, ...extra };
}

function escapeWorkflowCommand(value) {
  return String(value).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

export function captureDatabasePassword(source = process.env, output = process.stdout) {
  const password = source.STAGING_SUPABASE_DB_PASSWORD;
  delete source.STAGING_SUPABASE_DB_PASSWORD;
  if (!password || /[\r\n\0]/.test(password)) {
    throw new Error("STAGING_SUPABASE_DB_PASSWORD is required and malformed values are rejected.");
  }
  if (source.GITHUB_ACTIONS === "true") {
    for (const secret of new Set([password, encodeURIComponent(password)])) {
      output.write(`::add-mask::${escapeWorkflowCommand(secret)}\n`);
    }
  }
  return password;
}

export function resolvePinnedTooling(contract, rootDir, source = process.env) {
  const runnerTemp = path.resolve(String(source.RUNNER_TEMP || ""));
  if (!path.isAbsolute(runnerTemp) || runnerTemp === path.parse(runnerTemp).root) {
    throw new Error("RUNNER_TEMP must be an absolute, scoped directory.");
  }
  assertPrivateDirectory(runnerTemp, "RUNNER_TEMP");

  const cliPath = path.resolve(String(source.SUPABASE_CLI_PATH || ""));
  const cliRoot = path.join(runnerTemp, "supabase-cli");
  if (cliPath !== path.join(cliRoot, "supabase")) throw new Error("Supabase CLI path must be the pinned RUNNER_TEMP binary.");
  assertPrivateDirectory(cliRoot, "Supabase CLI directory");
  assertRegularFile(cliPath, "Supabase CLI shim");
  const goPath = path.join(cliRoot, "supabase-go");
  assertRegularFile(goPath, "Supabase CLI Go binary");
  if (digest(fs.readFileSync(cliPath)) !== contract.cliShimSha256 || digest(fs.readFileSync(goPath)) !== contract.cliGoSha256) {
    throw new Error("Supabase CLI extracted binary fingerprint mismatch.");
  }

  const supabaseHome = path.resolve(String(source.SUPABASE_HOME || ""));
  if (supabaseHome !== path.join(runnerTemp, "supabase-home")) throw new Error("SUPABASE_HOME must be isolated under RUNNER_TEMP.");
  assertPrivateDirectory(supabaseHome, "SUPABASE_HOME");
  if (source.SUPABASE_TELEMETRY_DISABLED !== "1" || source.DO_NOT_TRACK !== "1" || source.SUPABASE_NO_UPDATE_NOTIFIER !== "1") {
    throw new Error("Supabase telemetry and update checks must be disabled in the isolated release process.");
  }

  const caPath = path.resolve(String(source.LEADERBOARD_SUPABASE_CA_PATH || ""));
  if (caPath !== path.join(rootDir, "scripts", "certs", "supabase-prod-ca-2021.crt")) {
    throw new Error("Supabase root CA must be the pinned repository certificate.");
  }
  assertRegularFile(caPath, "Supabase root CA");
  if (digest(fs.readFileSync(caPath)) !== contract.caSha256) throw new Error("Supabase root CA fingerprint mismatch.");
  return Object.freeze({ cliPath, supabaseHome, caPath });
}

export function makeStagingConnection(contract, password, caPath, source = process.env) {
  if (!password || /[\r\n\0]/.test(password)) throw new Error("STAGING_SUPABASE_DB_PASSWORD is required and malformed values are rejected.");
  const resolvedCaPath = path.resolve(caPath);
  assertRegularFile(resolvedCaPath, "Supabase root CA");
  if (digest(fs.readFileSync(resolvedCaPath)) !== contract.caSha256) throw new Error("Supabase root CA fingerprint mismatch.");
  const url = new URL("postgresql://placeholder/postgres");
  url.username = `postgres.${contract.projectRef}`;
  url.hostname = contract.poolerHost;
  url.port = String(contract.poolerPort);
  url.pathname = `/${contract.database}`;
  url.searchParams.set("sslmode", "verify-full");
  url.searchParams.set("sslrootcert", resolvedCaPath);
  const cliTarget = url.toString();
  if (cliTarget.includes(contract.productionProjectRef) || cliTarget.includes(encodeURIComponent(password))) {
    throw new Error("Staging connection target failed the production/credential deny guard.");
  }
  return {
    cliTarget,
    psqlArgs: [
      "--no-psqlrc", "--no-password", "--set=ON_ERROR_STOP=1", "--host", contract.poolerHost,
      "--port", String(contract.poolerPort), "--username", `postgres.${contract.projectRef}`,
      "--dbname", contract.database,
    ],
    env: scopedChildEnvironment({
      PGPASSWORD: password,
      PGSSLMODE: "verify-full",
      PGSSLROOTCERT: resolvedCaPath,
      PGCONNECT_TIMEOUT: "20",
      SUPABASE_HOME: source.SUPABASE_HOME,
      SUPABASE_TELEMETRY_DISABLED: "1",
      SUPABASE_NO_UPDATE_NOTIFIER: "1",
      DO_NOT_TRACK: "1",
    }, source),
    secrets: [password, encodeURIComponent(password)],
    tlsObservation: Object.freeze({ mode: "verify-full", caSha256: contract.caSha256 }),
  };
}

export function redact(value, secrets) {
  let output = String(value || "");
  for (const secret of secrets) if (secret) output = output.split(secret).join("***");
  return output.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://***");
}

export function assertSafeCommandArgs(productionProjectRef, args, secrets = []) {
  const values = args.map((value) => String(value));
  if (values.some((value) => value.includes(productionProjectRef))) {
    throw new Error("Production project ref is forbidden in every staging child command.");
  }
  if (values.some((value) => secrets.some((secret) => secret && value.includes(secret)))) {
    throw new Error("A credential was about to enter child-process argv.");
  }
  if (values.some((value) => /^postgres(?:ql)?:\/\/[^/@:]+:[^/@]+@/i.test(value))) {
    throw new Error("Credential-bearing database URLs are forbidden in child-process argv.");
  }
  return true;
}
