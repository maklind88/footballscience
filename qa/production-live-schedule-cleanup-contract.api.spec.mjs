import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("production Schedule smoke confirms deletion and proves central cleanup", () => {
  const source = fs.readFileSync(path.join(rootDir, "qa/production.live.spec.mjs"), "utf8");

  expect(source).toContain('confirmDialog.locator("[data-platform-confirm-ok]").click()');
  expect(source).toContain("await expectStorageExcludes(page, scheduleKey, title)");
  expect(source).toContain("await expectCentralSyncExcludes(page, scheduleKey, title)");
  expect(source).toContain("if (!centralResponse.ok())");
  expect(source).toContain("await removeScheduleEventIfPresent(page, title, targetDate)");
  expect(source).not.toContain("removeScheduleEventIfPresent(page, title).catch");
});
