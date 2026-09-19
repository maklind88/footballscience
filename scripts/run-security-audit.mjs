import { spawnSync } from "node:child_process";

const defaultRetryDelaysMs = [15_000, 45_000, 90_000];
const retryDelaysMs = process.env.SECURITY_AUDIT_RETRY_DELAYS_MS
  ? process.env.SECURITY_AUDIT_RETRY_DELAYS_MS.split(",").map((value) => Number.parseInt(value, 10))
  : defaultRetryDelaysMs;

if (retryDelaysMs.some((delayMs) => !Number.isSafeInteger(delayMs) || delayMs < 0)) {
  throw new Error("SECURITY_AUDIT_RETRY_DELAYS_MS must contain non-negative integer delays.");
}

function runAudit() {
  return spawnSync("npm", ["audit", "--audit-level=high"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function writeOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function isTransientRegistryFailure(result) {
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  return /npm (?:warn|error) audit\s+(?:502|503|504)\b/i.test(output) && /audit endpoint returned an error/i.test(output);
}

for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
  const result = runAudit();
  writeOutput(result);

  if (result.status === 0) process.exit(0);

  if (!isTransientRegistryFailure(result) || attempt === retryDelaysMs.length) {
    process.exit(result.status || 1);
  }

  const delayMs = retryDelaysMs[attempt];
  console.warn(`npm audit registry request failed transiently; retrying in ${delayMs / 1000}s (${attempt + 1}/${retryDelaysMs.length}).`);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
