import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test, expect } from "@playwright/test";

const rootDir = new URL("..", import.meta.url);

async function runAuditWithFakeNpm(mode) {
  const dir = await mkdtemp(path.join(tmpdir(), "footballscience-audit-"));
  const binDir = path.join(dir, "bin");
  const counterPath = path.join(dir, "calls");
  await mkdir(binDir);
  const fakeNpmPath = path.join(binDir, "npm");
  await writeFile(fakeNpmPath, `#!/usr/bin/env node\nconst fs = require("fs");\nconst count = Number(fs.existsSync(process.env.AUDIT_COUNTER) ? fs.readFileSync(process.env.AUDIT_COUNTER, "utf8") : 0) + 1;\nfs.writeFileSync(process.env.AUDIT_COUNTER, String(count));\nif (process.env.AUDIT_MODE === "transient" && count === 1) { console.error("npm warn audit 503 Service Unavailable"); console.error("npm error audit endpoint returned an error"); process.exit(1); }\nif (process.env.AUDIT_MODE === "vulnerability") { console.error("found 1 high severity vulnerability"); process.exit(1); }\n`);
  await chmod(fakeNpmPath, 0o755);

  try {
    const result = spawnSync(process.execPath, ["scripts/run-security-audit.mjs"], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: { ...process.env, AUDIT_COUNTER: counterPath, AUDIT_MODE: mode, PATH: `${binDir}:${process.env.PATH}`, SECURITY_AUDIT_RETRY_DELAYS_MS: "0" }
    });
    const calls = Number(await readFile(counterPath, "utf8"));
    return { calls, result };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("security audit retries only transient npm registry failures and still fails closed", async () => {
  const source = await readFile(new URL("scripts/run-security-audit.mjs", rootDir), "utf8");

  expect(source).toContain('spawnSync("npm", ["audit", "--audit-level=high"]');
  expect(source).toContain("const defaultRetryDelaysMs = [15_000, 45_000, 90_000]");
  expect(source).toContain("npm (?:warn|error) audit\\s+(?:502|503|504)");
  expect(source).toContain("audit endpoint returned an error");
  expect(source).toContain("process.exit(result.status || 1)");

  const transient = await runAuditWithFakeNpm("transient");
  expect(transient.result.status).toBe(0);
  expect(transient.calls).toBe(2);

  const vulnerability = await runAuditWithFakeNpm("vulnerability");
  expect(vulnerability.result.status).toBe(1);
  expect(vulnerability.calls).toBe(1);
});
