import { expect, test } from "@playwright/test";

function parseRgb(value) {
  const match = String(value || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?/i);
  if (!match) return null;
  return {
    rgb: match.slice(1, 4).map(Number),
    alpha: match[4] === undefined ? 1 : Number(match[4]),
  };
}

function luminance({ rgb: [red, green, blue] }) {
  const values = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function contrastRatio(foreground, background) {
  const foregroundLum = luminance(foreground);
  const backgroundLum = luminance(background);
  const lighter = Math.max(foregroundLum, backgroundLum);
  const darker = Math.min(foregroundLum, backgroundLum);
  return (lighter + 0.05) / (darker + 0.05);
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

async function collectThemeRows(page, rootSelector, auditName) {
  return page.evaluate(
    ({ rootSelector: selector, auditName: name }) => {
      function parseAlpha(value) {
        const match = String(value || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?/i);
        if (!match) return 0;
        return match[4] === undefined ? 1 : Number(match[4]);
      }

      function visible(element) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width >= 8 && rect.height >= 8 && style.visibility !== "hidden" && style.display !== "none";
      }

      function effectiveBackground(element) {
        let node = element;
        while (node && node.nodeType === Node.ELEMENT_NODE) {
          const background = window.getComputedStyle(node).backgroundColor;
          if (parseAlpha(background) >= 0.2) return background;
          node = node.parentElement;
        }
        return window.getComputedStyle(document.body).backgroundColor;
      }

      const root = document.querySelector(selector) || document.body;
      const candidates = [
        root,
        ...root.querySelectorAll(
          [
            "button",
            "input",
            "select",
            "textarea",
            "a",
            "[role='button']",
            "[role='tab']",
            "[class*='-hero']",
            "[class*='-card']",
            "[class*='-panel']",
            "[class*='-row']",
            "[class*='-item']",
            "[class*='-chip']",
            "[class*='-pill']",
            "[class*='-badge']",
          ].join(", ")
        ),
      ];

      return candidates
        .filter((element, index, list) => list.indexOf(element) === index)
        .filter(visible)
        .slice(0, 90)
        .map((element) => {
          const style = window.getComputedStyle(element);
          const className = typeof element.className === "string" ? element.className : "";
          return {
            name,
            tagName: element.tagName.toLowerCase(),
            className,
            color: style.color,
            backgroundColor: style.backgroundColor,
            effectiveBackgroundColor: effectiveBackground(element),
            isPrimaryAction: element.matches("button[type='submit'], .primary, .is-primary, .primary-button"),
            isSurface: element.matches(
              [
                ".platform-sidebar",
                ".platform-topbar",
                ".workspace-view",
                "[class*='-hero']",
                "[class*='-card']",
                "[class*='-panel']",
                "[class*='-row']",
                "[class*='-item']",
              ].join(", ")
            ),
            isMuted: element.matches("small, [class*='-muted'], [class*='-meta'], [class*='-subtitle'], [class*='-hint'], [class*='-empty']"),
          };
        });
    },
    { rootSelector, auditName }
  );
}

function assertDarkThemeRows(rows, auditName) {
  expect.soft(rows.length, `${auditName} should expose themed surfaces`).toBeGreaterThan(0);

  for (const row of rows) {
    const text = parseRgb(row.color);
    const background = parseRgb(row.effectiveBackgroundColor);
    if (!text || !background || background.alpha < 0.2) continue;

    const ratio = contrastRatio(text, background);
    const backgroundLum = luminance(background);
    const minimumRatio = row.isPrimaryAction ? 4.5 : row.isMuted ? 2.7 : 3.0;

    expect.soft(ratio, `${row.name}:${row.tagName}.${row.className} needs readable dark-mode contrast`).toBeGreaterThanOrEqual(minimumRatio);

    if (row.isSurface && !row.isPrimaryAction) {
      expect.soft(backgroundLum, `${row.name}:${row.tagName}.${row.className} should not leak a light surface in dark mode`).toBeLessThan(0.54);
    }
  }
}

test("dark mode foundation keeps all major workspaces visually consistent and readable", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.localStorage.setItem("football-platform-theme-mode-v1", "dark");
  });

  await page.goto("/");
  await waitForPlatformShell(page);

  await expect(page.locator("body")).toHaveClass(/is-dark-mode/);
  await expect(page.locator("body")).toHaveAttribute("data-theme-mode", "dark");

  assertDarkThemeRows(await collectThemeRows(page, "body", "shell"), "shell");

  for (const workspaceId of [
    "player-profiles",
    "schedule",
    "periodization",
    "medical-team",
    "session-planner",
    "idp",
    "scouting",
    "gameplan",
    "transfer-room",
    "analysis-room",
    "staff",
    "admin",
    "team-identity",
  ]) {
    const navItem = page.locator(`[data-open-workspace="${workspaceId}"]`).first();
    if (!(await navItem.count())) continue;
    if (!(await navItem.isVisible())) {
      await page.locator(".platform-nav-more").evaluate((element) => {
        element.open = true;
      }).catch(() => {});
    }
    if (!(await navItem.isVisible())) continue;

    await navItem.click();
    await expect(navItem).toHaveClass(/is-active/);
    assertDarkThemeRows(await collectThemeRows(page, ".workspace-view.is-active", workspaceId), workspaceId);
  }

  expect(pageErrors).toEqual([]);
});
