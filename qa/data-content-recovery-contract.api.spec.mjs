import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("normal API QA runs offline recovery guards without accessing production credentials", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const result = spawnSync(process.execPath, ["--test", "qa/data-content-recovery.test.mjs"], {
    cwd: root, encoding: "utf8", timeout: 15_000,
    env: { PATH: process.env.PATH, HOME: root, GITHUB_ACTIONS: "false" },
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toMatch(/(?:#|\u2139) fail 0/);
});
