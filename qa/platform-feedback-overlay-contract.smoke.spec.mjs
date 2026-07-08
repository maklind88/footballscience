import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const qaDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(qaDir, "..");

async function loadFeedbackCss() {
  return fs.readFile(path.join(projectRoot, "platform-feedback.css"), "utf8");
}

function renderFeedbackContractFixture(css) {
  return `
    <!doctype html>
    <html>
      <head>
        <style>
          ${css}
          body {
            margin: 0;
            min-height: 100vh;
            font-family: system-ui, sans-serif;
          }

          #content {
            box-sizing: border-box;
            margin-top: 24px;
            min-height: 420px;
            padding: 24px;
            border: 1px solid #d0d5dd;
          }
        </style>
      </head>
      <body>
        <div id="platform" class="platform-inline-toast is-success" role="status">Saved.</div>
        <div id="session" class="session-toast is-success" role="status"><strong>Session saved.</strong></div>
        <p id="staff-status" class="staff-message" role="status">Staff profile saved.</p>
        <div id="medical-status" class="medical-message" role="status">Medical note saved.</div>
        <div id="squad-status" class="player-profile-message" role="status">Player profile saved.</div>
        <p id="video-status" class="video-analysis-toast">Clip removed.</p>
        <div id="idp-status" class="idp-notice" role="status">Focus saved.</div>
        <main id="content">
          <h1>Workspace content</h1>
          <p>This content must not move when feedback appears.</p>
        </main>
        <p id="empty-state" class="staff-message">No users in this admin scope.</p>
        <div id="idp-warning" class="idp-notice is-warning" role="status">Persistent IDP warning.</div>
      </body>
    </html>
  `;
}

async function readToastMetrics(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      bottomGap: window.innerHeight - rect.bottom,
      left: rect.left,
      position: style.position,
      rightGap: window.innerWidth - rect.right,
      top: rect.top,
      width: rect.width,
    };
  });
}

test("platform feedback messages float above the interface without shifting content", async ({ page }) => {
  const css = await loadFeedbackCss();
  await page.setViewportSize({ width: 1200, height: 760 });
  await page.setContent(renderFeedbackContractFixture(css));

  const contentTop = await page.locator("#content").evaluate((element) => element.getBoundingClientRect().top);
  expect(contentTop).toBeCloseTo(24, 0);

  for (const selector of [
    "#platform",
    "#session",
    "#staff-status",
    "#medical-status",
    "#squad-status",
    "#video-status",
    "#idp-status",
  ]) {
    const metrics = await readToastMetrics(page, selector);
    expect(metrics.position, `${selector} should be fixed`).toBe("fixed");
    expect(metrics.width, `${selector} should stay compact`).toBeLessThanOrEqual(360);
    expect(metrics.top, `${selector} should sit near the top edge`).toBeGreaterThanOrEqual(72);
    expect(metrics.top, `${selector} should not drop into page flow`).toBeLessThanOrEqual(112);
    expect(metrics.rightGap, `${selector} should anchor on the right`).toBeGreaterThanOrEqual(10);
    expect(metrics.rightGap, `${selector} should anchor on the right`).toBeLessThanOrEqual(28);
  }

  await expect(page.locator("#empty-state")).not.toHaveCSS("position", "fixed");
  await expect(page.locator("#idp-warning")).not.toHaveCSS("position", "fixed");
});

test("platform feedback uses the same compact overlay contract on mobile", async ({ page }) => {
  const css = await loadFeedbackCss();
  await page.setViewportSize({ width: 390, height: 760 });
  await page.setContent(renderFeedbackContractFixture(css));

  const metrics = await readToastMetrics(page, "#staff-status");
  expect(metrics.position).toBe("fixed");
  expect(metrics.width).toBeLessThanOrEqual(360);
  expect(metrics.bottomGap).toBeGreaterThanOrEqual(8);
  expect(metrics.bottomGap).toBeLessThanOrEqual(24);
  expect(metrics.rightGap).toBeGreaterThanOrEqual(8);
  expect(metrics.rightGap).toBeLessThanOrEqual(24);
});
