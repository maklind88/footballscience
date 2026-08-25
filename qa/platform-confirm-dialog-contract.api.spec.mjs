import { expect, test } from "@playwright/test";

test("platform confirmation dialog resolves cancel and confirm actions", async ({ page }) => {
  await page.goto("/");

  await page.evaluate(() => {
    const clubMark = document.getElementById("dashboardClubMark");
    const clubLogo = document.getElementById("dashboardClubLogoImage");
    const clubInitials = document.getElementById("dashboardClubLogoInitials");
    clubMark?.setAttribute("aria-label", "North Carolina Courage logo");
    if (clubLogo) {
      clubLogo.src = "/assets/team-logos/north-carolina-courage.svg";
      clubLogo.hidden = false;
    }
    if (clubInitials) clubInitials.textContent = "NCC";
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
  await expect(page.locator("[data-platform-confirm-club-mark]")).toHaveClass(/has-logo/);
  await expect(page.locator("[data-platform-confirm-logo]")).toHaveAttribute(
    "src",
    /north-carolina-courage\.svg/
  );
  await expect(page.locator(".platform-confirm-mark-dot, .platform-confirm-mark-stem")).toHaveCount(0);
  await page.locator("body").evaluate((body) => body.classList.add("is-dark-mode"));
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCSS("background-color", "rgb(185, 28, 28)");
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

test("platform confirmation dialog falls back to club initials when its logo fails", async ({ page }) => {
  await page.goto("/");

  await page.evaluate(() => {
    const clubLogo = document.getElementById("dashboardClubLogoImage");
    const clubInitials = document.getElementById("dashboardClubLogoInitials");
    if (clubLogo) {
      clubLogo.src = "/assets/team-logos/missing-club.svg";
      clubLogo.hidden = false;
    }
    if (clubInitials) clubInitials.textContent = "NCC";
    void import("/src/core/platform-confirm-dialog.mjs").then(({ confirmPlatformAction }) => {
      void confirmPlatformAction({ title: "Delete plan?", tone: "danger", win: window });
    });
  });

  const logo = page.locator("[data-platform-confirm-logo]");
  await expect(logo).toHaveCount(1);
  await logo.dispatchEvent("error");
  await expect(logo).toBeHidden();
  await expect(page.locator("[data-platform-confirm-club-mark]")).toHaveClass(/is-fallback/);
  await expect(page.locator("[data-platform-confirm-logo-fallback]")).toHaveText("NCC");
  await expect(page.locator("[data-platform-confirm-logo-fallback]")).toBeVisible();
});
