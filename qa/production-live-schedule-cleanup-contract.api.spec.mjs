import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createScheduleProbeFixture } from "./helpers/live-schedule-probe.mjs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("production Schedule smoke confirms deletion and proves central cleanup", () => {
  const source = fs.readFileSync(path.join(rootDir, "qa/production.live.spec.mjs"), "utf8");

  expect(source).toContain('await expect(eventChip).toHaveAttribute("aria-pressed", "true")');
  expect(source).toContain('confirmDialog.locator("[data-platform-confirm-ok]").click()');
  expect(source).toContain("await expectStorageExcludes(page, scheduleKey, title)");
  expect(source).toContain("await expectCentralSyncExcludes(page, scheduleKey, title)");
  expect(source).toContain("if (!centralResponse.ok())");
  expect(source).toContain("removeRecord: removeScheduleEventIfPresent");
  expect(source).not.toContain("removeScheduleEventIfPresent(page, title).catch");
  expect(source).toContain('await expect(eventChip).toHaveCount(1)');
  expect(source).toContain('if (!localContainsTitle) {\n    await expectCentralSyncExcludes(page, scheduleKey, title)');
  expect(source).toContain('scheduleProbe.arm({ title, targetDate, user });\n    await addInput.press("Enter")');
  expect(source).toContain('await openWorkspace(page, "schedule");\n    await showScheduleDateInPlanner(page, targetDate)');
});

const record = {
  title: "QA Live 1234567890-abcdef", targetDate: "2026-10-23",
  user: { id: "qa-user", clubId: "qa-club", teamId: "qa-team" },
};

function fixtureHarness({ user = record.user, cleanupError } = {}) {
  const calls = [];
  const page = { id: "fresh-cleanup-page" };
  const browser = { newContext: async () => {
    calls.push("new-context");
    return { newPage: async () => page, close: async () => calls.push("closed") };
  } };
  const [fixture, options] = createScheduleProbeFixture({
    signIn: async actualPage => { expect(actualPage).toBe(page); calls.push("signed-in"); },
    getCurrentUser: async () => user,
    removeRecord: async (actualPage, title, date) => {
      expect(actualPage).toBe(page);
      calls.push({ title, date });
      if (cleanupError) throw cleanupError;
    },
  });
  return { calls, options, run: use => fixture({ browser }, use) };
}

test("cleanup uses a new authenticated context and only the armed record", async () => {
  const harness = fixtureHarness();
  await harness.run(async probe => probe.arm(record));
  expect(harness.options.timeout).toBe(90_000);
  expect(harness.calls).toEqual([
    "new-context", "signed-in", { title: record.title, date: record.targetDate }, "closed",
  ]);
});

test("an unarmed probe makes no cleanup requests", async () => {
  const harness = fixtureHarness();
  await harness.run(async () => {});
  expect(harness.calls).toEqual([]);
});

test("cleanup fails closed when the account or team changes", async () => {
  for (const key of ["id", "clubId", "teamId"]) {
    const harness = fixtureHarness({ user: { ...record.user, [key]: "other" } });
    await expect(harness.run(async probe => probe.arm(record))).rejects.toThrow("Cleanup account/scope changed");
    expect(harness.calls).toEqual(["new-context", "signed-in", "closed"]);
  }
});

test("cleanup failures remain failures and still close the new context", async () => {
  const harness = fixtureHarness({ cleanupError: new Error("central deletion unconfirmed") });
  await expect(harness.run(async probe => probe.arm(record))).rejects.toThrow("central deletion unconfirmed");
  expect(harness.calls.at(-1)).toBe("closed");
});

test("cleanup cannot arm an ordinary user event or overwrite its identity", async () => {
  const harness = fixtureHarness();
  await harness.run(async probe => {
    expect(() => probe.arm({ ...record, title: "Team training" })).toThrow("run-owned record");
    probe.arm(record);
    expect(() => probe.arm({ ...record, title: "QA Live 9876543210-abcdef" })).toThrow("run-owned record");
  });
  expect(harness.calls[2]).toEqual({ title: record.title, date: record.targetDate });
});

test("Playwright runs cleanup after a real test timeout and retains both failures", () => {
  const require = createRequire(import.meta.url);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-probe-teardown-"));
  try {
    const helperPath = path.join(rootDir, "qa/helpers/live-schedule-probe.mjs");
    fs.writeFileSync(path.join(directory, "probe.spec.mjs"), `
      import playwright from ${JSON.stringify(require.resolve("@playwright/test"))};
      const { test: base } = playwright;
      import { createScheduleProbeFixture } from ${JSON.stringify(helperPath)};
      const user = { id: 'qa-user', clubId: 'qa-club', teamId: 'qa-team' };
      const test = base.extend({
        browser: [async ({}, use) => use({ newContext: async () => ({
          newPage: async () => ({}), close: async () => console.info('cleanup-context-closed'),
        }) }), { scope: 'worker' }],
        scheduleProbe: createScheduleProbeFixture({
          signIn: async () => {}, getCurrentUser: async () => user,
          removeRecord: async (_page, title) => {
            if (title.includes('1234567891')) throw new Error('central cleanup rejected');
          },
        }),
      });
      for (const stamp of [1234567890, 1234567891]) {
        test('timeout ' + stamp, async ({ scheduleProbe }) => {
          scheduleProbe.arm({ title: 'QA Live ' + stamp + '-abcdef', targetDate: '2026-10-23', user });
          test.setTimeout(100);
          await new Promise(() => {});
        });
      }
    `);
    const configPath = path.join(directory, "playwright.config.mjs");
    fs.writeFileSync(configPath, `export default ${JSON.stringify({
      testDir: directory, testMatch: "probe.spec.mjs", workers: 1, retries: 0,
      timeout: 5000, reporter: [["json"]], outputDir: path.join(directory, "results"),
    })};`);
    const result = spawnSync(process.execPath, [require.resolve("@playwright/test/cli"), "test", "--config", configPath], {
      encoding: "utf8", timeout: 20_000, cwd: rootDir,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1); // The synthetic body intentionally times out.
    const report = JSON.parse(result.stdout);
    expect(report.errors).toEqual([]);
    const results = report.suites.flatMap(suite => suite.specs.flatMap(spec => spec.tests.flatMap(test => test.results)));
    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.status).toBe("timedOut");
      expect(JSON.stringify(result.errors)).toContain("100ms exceeded");
      expect(JSON.stringify(result.stdout)).toContain("cleanup-context-closed");
    }
    expect(JSON.stringify(results[0].stdout)).toContain("cleanup verified");
    expect(JSON.stringify(results[1].errors)).toContain("central cleanup rejected");
    expect(JSON.stringify(results[1].stdout)).not.toContain("cleanup verified");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
