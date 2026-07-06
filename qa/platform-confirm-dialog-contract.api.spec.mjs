import { expect, test } from "@playwright/test";

test("platform confirmation dialog resolves cancel and confirm actions", async ({ page }) => {
  await page.goto("/");

  await page.evaluate(() => {
    window.__platformConfirmResult = "pending";
    void import("/src/core/platform-confirm-dialog.mjs").then(({ confirmPlatformAction }) => {
      void confirmPlatformAction({
        eyebrow: "Clip Bank",
        title: "Remove clip?",
        message: "Remove this clip from the player's IDP Clip Bank?",
        confirmLabel: "Remove",
        tone: "danger",
        win: window,
      }).then((result) => {
        window.__platformConfirmResult = result;
      });
    });
  });

  await expect(page.locator(".platform-confirm-dialog")).toBeVisible();
  await expect(page.locator(".platform-confirm-dialog h2")).toHaveText("Remove clip?");
  await expect(page.locator(".platform-confirm-message")).toContainText("Remove this clip");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect.poll(() => page.evaluate(() => window.__platformConfirmResult)).toBe(false);
  await expect(page.locator(".platform-confirm-dialog")).toHaveCount(0);

  await page.evaluate(() => {
    window.__platformConfirmResult = "pending";
    void import("/src/core/platform-confirm-dialog.mjs").then(({ confirmPlatformAction }) => {
      void confirmPlatformAction({
        eyebrow: "Admin",
        title: "Remove user?",
        message: "Remove this user from the platform?",
        confirmLabel: "Remove",
        tone: "danger",
        win: window,
      }).then((result) => {
        window.__platformConfirmResult = result;
      });
    });
  });

  await expect(page.locator(".platform-confirm-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect.poll(() => page.evaluate(() => window.__platformConfirmResult)).toBe(true);
});
