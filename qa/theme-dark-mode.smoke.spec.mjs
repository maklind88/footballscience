import { expect, test } from "@playwright/test";

function parseRgb(value) {
  const match = String(value || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return null;
  return match.slice(1, 4).map(Number);
}

function luminance([red, green, blue]) {
  const values = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

async function waitForPlatformShell(page) {
  await page.waitForFunction(
    () => {
      const shell = document.getElementById("hubShell");
      const login = document.getElementById("loginScreen");
      return Boolean(
        window.__footballScienceAppReady &&
          document.body?.dataset.appReady === "true" &&
          shell &&
          !shell.hidden &&
          login &&
          login.hidden &&
          !document.body.classList.contains("is-booting")
      );
    },
    null,
    { timeout: 20_000 }
  );
}

test("dark mode foundation keeps shell surfaces dark and readable", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.localStorage.setItem("football-platform-theme-mode-v1", "dark");
  });

  await page.goto("/");
  await waitForPlatformShell(page);

  await expect(page.locator("body")).toHaveClass(/is-dark-mode/);
  await expect(page.locator("body")).toHaveAttribute("data-theme-mode", "dark");

  const audit = await page.evaluate(() => {
    const selectors = [
      "body",
      ".coach-platform",
      ".platform-sidebar",
      ".platform-content",
      ".platform-home-hero",
      ".workspace-heading",
      ".platform-nav-item",
      ".platform-profile-menu",
    ];
    return selectors
      .map((selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const styles = window.getComputedStyle(element);
        return {
          selector,
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          borderColor: styles.borderColor,
        };
      })
      .filter(Boolean);
  });

  expect(audit.length).toBeGreaterThanOrEqual(6);
  for (const row of audit) {
    const text = parseRgb(row.color);
    const background = parseRgb(row.backgroundColor);
    if (!text || !background) continue;
    const textLum = luminance(text);
    const backgroundLum = luminance(background);
    expect.soft(backgroundLum, `${row.selector} should not stay light in dark mode`).toBeLessThan(0.42);
    expect.soft(Math.abs(textLum - backgroundLum), `${row.selector} needs visible contrast`).toBeGreaterThan(0.25);
  }

  expect(pageErrors).toEqual([]);
});
