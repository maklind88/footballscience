import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { installCiDependencies, isTransientFfmpegDownloadFailure } from "../scripts/ci-install.mjs";

function downloadError(status = 504, asset = "ffmpeg-linux-x64.gz") {
  return `npm error code 1
npm error path /__w/footballscience/footballscience/node_modules/ffmpeg-static
npm error Error: Failed to download ffmpeg b6.1.1.
npm error   url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/${asset}',
npm error   statusCode: ${status}`;
}

async function runInstall(results) {
  let attempts = 0;
  const waits = [];
  const logs = [];
  const status = await installCiDependencies({
    runAttempt: async () => results[Math.min(attempts++, results.length - 1)],
    wait: async (delay) => { waits.push(delay); },
    log: (message) => logs.push(message),
  });
  return { status, attempts, waits, logs };
}

test("CI recognizes only transient HTTP failures from the FFmpeg release download", () => {
  for (const status of [429, 502, 503, 504]) {
    for (const asset of ["ffmpeg-linux-x64.gz", "linux-x64.README", "linux-x64.LICENSE"]) {
      expect(isTransientFfmpegDownloadFailure(downloadError(status, asset))).toBe(true);
    }
  }
  for (const status of [200, 400, 401, 403, 404, 500]) {
    expect(isTransientFfmpegDownloadFailure(downloadError(status))).toBe(false);
  }
  expect(isTransientFfmpegDownloadFailure(downloadError().replace("node_modules/ffmpeg-static", "node_modules/other"))).toBe(false);
  expect(isTransientFfmpegDownloadFailure(downloadError().replace("https://github.com/", "https://example.com/"))).toBe(false);
  expect(isTransientFfmpegDownloadFailure("npm error code EINTEGRITY")).toBe(false);
  expect(isTransientFfmpegDownloadFailure("npm error code EUSAGE\nnpm ci requires a matching lockfile")).toBe(false);
});

test("successful CI installation runs once without waiting", async () => {
  expect(await runInstall([{ status: 0, output: "installed" }])).toEqual({
    status: 0, attempts: 1, waits: [], logs: [],
  });
});

test("a temporary download failure can recover without skipping npm ci", async () => {
  const result = await runInstall([
    { status: 1, output: downloadError() },
    { status: 0, output: "installed" },
  ]);
  expect(result).toMatchObject({ status: 0, attempts: 2, waits: [15_000] });
  expect(result.logs).toHaveLength(1);
});

test("repeated download failures remain fatal after exactly three attempts", async () => {
  const result = await runInstall([{ status: 1, output: downloadError() }]);
  expect(result).toMatchObject({ status: 1, attempts: 3, waits: [15_000, 30_000] });
  expect(result.logs).toHaveLength(2);
});

test("non-network installation errors and cancellation are never retried", async () => {
  for (const failure of [
    { status: 2, output: "npm error code EUSAGE" },
    { status: 1, output: downloadError(404) },
    { status: 1, output: downloadError(), signal: "SIGTERM" },
  ]) {
    expect(await runInstall([failure])).toEqual({
      status: failure.status, attempts: 1, waits: [], logs: [],
    });
  }
});

test("a deterministic failure after a retry stops immediately", async () => {
  const result = await runInstall([
    { status: 1, output: downloadError() },
    { status: 2, output: "npm error code EINTEGRITY" },
  ]);
  expect(result).toMatchObject({ status: 2, attempts: 2, waits: [15_000] });
});

test("the executable invokes plain npm ci and propagates its failing exit code", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ci-install-contract-"));
  try {
    writeFileSync(path.join(directory, "npm"), '#!/bin/sh\nprintf "%s\\n" "$@"\nexit 23\n', { mode: 0o755 });
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/ci-install.mjs", import.meta.url))], {
      env: { ...process.env, PATH: `${directory}${path.delimiter}${process.env.PATH}` },
      encoding: "utf8",
      timeout: 5_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(23);
    expect(result.stdout.trim()).toBe("ci");
    expect(result.stderr).toBe("");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("QA and deploy jobs retain full installation and use the same bounded retry", () => {
  const source = readFileSync(new URL("../scripts/ci-install.mjs", import.meta.url), "utf8");
  expect(source).toContain('spawn("npm", ["ci"]');
  expect(source).not.toMatch(/--ignore-scripts|--force|--omit|continue-on-error/);
  for (const workflow of ["full-qa", "staging-deploy", "production-deploy"]) {
    const yaml = readFileSync(new URL(`../.github/workflows/${workflow}.yml`, import.meta.url), "utf8");
    expect(yaml).toContain("run: node scripts/ci-install.mjs");
    expect(yaml).not.toContain("run: npm ci");
  }
});
