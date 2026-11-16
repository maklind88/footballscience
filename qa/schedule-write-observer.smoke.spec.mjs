import { expect, test } from "@playwright/test";
import { observeScheduleWrite } from "./helpers/schedule-write-observer.mjs";
import { readScheduleSaveDiagnostics } from "./helpers/schedule-save-diagnostics.mjs";

for (const full of [false, true]) {
  test(`Schedule observer preserves real browser storage behavior (quota: ${full})`, async ({ page }) => {
    await page.route("**/__schedule-observer-test", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Storage test</title>" }));
    await page.goto("/__schedule-observer-test");
    await page.evaluate(full => {
      window.__originalStorageSetter = Storage.prototype.setItem;
      localStorage.setItem("football-schedule-v1", "retained original");
      if (!full) return;
      let count = 0;
      for (const size of [262144, 16384, 1024, 16, 1]) {
        for (let i = 0; i < 1000; i++) {
          try { localStorage.setItem(`test-fill-${count++}`, "x".repeat(size)); }
          catch (error) { if (error.name !== "QuotaExceededError") throw error; break; }
        }
      }
    }, full);
    const stop = await observeScheduleWrite(page, "football-schedule-v1");
    const result = await page.evaluate(() => {
      try { localStorage.setItem("football-schedule-v1", "new record ".repeat(100)); return "saved"; }
      catch (error) { return error.name; }
    });
    const report = await readScheduleSaveDiagnostics(page, "football-schedule-v1", "new record");
    expect(result).toBe(full ? "QuotaExceededError" : "saved");
    expect(report.writeObservation).toMatchObject({ attempts: 1, succeeded: !full, error: full ? "quota" : "none" });
    expect(report.localContains).toBe(!full);
    if (full) {
      expect(report.writeObservation.sizes.total).toBeGreaterThan(5_000_000);
      expect(await page.evaluate(() => localStorage.getItem("football-schedule-v1"))).toBe("retained original");
    }
    await stop();
    expect(await page.evaluate(() => Storage.prototype.setItem === window.__originalStorageSetter)).toBe(true);
  });
}
