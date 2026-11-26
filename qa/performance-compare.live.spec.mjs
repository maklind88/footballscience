import { expect } from "@playwright/test";
import { test } from "./helpers/live-browser-readonly.mjs";

const week = "2026-04-27";
const production = "https://footballscience.xyz";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("Courage Team week renders real HML and Squad group comparisons", async ({ page, baseURL }) => {
  test.skip(new URL(baseURL).origin !== production, "The linked Courage workbook is production-only.");
  test.skip(!process.env.LIVE_QA_USERNAME || !process.env.LIVE_QA_PASSWORD, "Requires the protected Live QA account.");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(async () => Boolean(await window.platformAuthStore?.getAccessToken?.())), {
    timeout: 30000,
  }).toBe(true);
  const dataCheck = await page.evaluate(async (week) => {
    const token = await window.platformAuthStore.getAccessToken();
    const response = await fetch(`/api/performance-load-plan?week=${week}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = await response.json();
    const rows = data.gpsActuals?.rows ?? [];
    return { status: response.status, linked: rows.length, hasHml: rows.some(({ metrics }) => Number.isFinite(metrics.hml)) };
  }, week);
  test.skip(dataCheck.status === 403, "The Live QA account is outside the Courage Performance scope.");
  expect(dataCheck.status).toBe(200);
  test.skip(!dataCheck.linked, "The historical fixture week has no current Squad matches.");
  expect(dataCheck.hasHml).toBe(true);

  await page.goto("/?workspace=performance-room&performancePlan=team-week&performanceDate=2026-04-29", { waitUntil: "domcontentloaded" });
  const room = page.locator("#performanceWorkspace");
  const compare = room.getByRole("button", { name: "Compare", exact: true });
  await expect(compare).toBeVisible({ timeout: 30000 });
  await compare.evaluate((button) => button.click());
  const table = room.getByRole("table", { name: "GPS comparison for the selected activity" });
  await expect(table.getByRole("columnheader", { name: "Squad avg" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: /Midfielders|Defenders|Forwards|Goalkeepers/ }).first()).toBeVisible();
  const hml = table.getByRole("row", { name: /^HML/ });
  await expect.poll(() => hml.getByRole("cell").nth(1).locator("strong").evaluate((value) => /\d/.test(value.textContent))).toBe(true);
  await expect(room.getByRole("combobox", { name: "Compare player" })).toBeVisible();
});
