import { expect, test } from "@playwright/test";

async function openPlayer(page, status = "linked-unavailable") {
  await page.addInitScript(status => {
    window.__videoAnalysisInitialState = {
      view: "workspace", activeAnalysisRoomTab: "fs-player", status: "ready",
      match: { id: "header-match", title: "NCC v Seattle 4 July.mp4" },
      video: { id: "header-video", match_id: "header-match" },
      source: { id: "header-source", match_id: "header-match", video_id: "header-video", local_video_identifier: "header-local-file" },
      localFileStatus: status,
      localFileMessage: status === "permission-needed" ? "Local file permission needed" : "Reconnect local file on this device",
    };
    window.__headerPickerClicks = 0;
    Object.defineProperty(window, "showOpenFilePicker", { configurable: true, value: undefined });
    const click = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.matches("[data-video-analysis-file]")) window.__headerPickerClicks++;
      return click.call(this);
    };
  }, status);
  await page.goto("/qa/video-analysis-browser-smoke.html?header-settings=1");
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
}

for (const width of [1388, 390]) {
  test(`camera and settings stay compact, ordered and functional at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 762 });
    await openPlayer(page);
    const camera = page.getByRole("button", { name: "Cameras and media", exact: true });
    const settings = page.getByRole("button", { name: "Settings", exact: true });
    const panel = page.locator("[data-video-analysis-media-production]");
    const menu = page.getByRole("menu", { name: "Player settings" });
    await expect(panel).toBeHidden();
    const a = await camera.boundingBox(), b = await settings.boundingBox();
    expect(a.x + a.width).toBeLessThanOrEqual(b.x);
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
    await expect(page.locator(".video-analysis-media-production__toggle")).toHaveCount(0);
    await expect(page.locator(".video-analysis-empty-video [data-video-analysis-load]")).toBeVisible();
    await settings.click();
    await expect(settings).toHaveAttribute("aria-expanded", "true");
    await expect(menu.getByRole("menuitem", { name: "Reconnect local file" })).toBeFocused();
    const popup = await menu.boundingBox();
    expect(popup.x).toBeGreaterThanOrEqual(0);
    expect(popup.x + popup.width).toBeLessThanOrEqual(width);
    expect(popup.y + popup.height).toBeLessThanOrEqual(762);
    await page.screenshot({ path: testInfo.outputPath(`player-settings-${width}.png`), fullPage: false });
    await menu.press("Escape");
    await expect(menu).toBeHidden();
    await expect(settings).toBeFocused();
    await settings.click();
    await settings.click();
    await expect(menu).toBeHidden();
    await camera.click();
    await expect(panel).toBeVisible();
    await expect(camera).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("navigation", { name: "Media production" })).toBeVisible();
    await camera.click();
    await expect(panel).toBeHidden();
    await settings.click();
    await menu.getByRole("menuitem", { name: "Reconnect local file" }).click();
    await expect.poll(() => page.evaluate(() => window.__headerPickerClicks)).toBe(1);
    await expect(menu).toBeHidden();
  });
}

test("settings dismiss outside and preserve permission reconnect and keyboard navigation", async ({ page }) => {
  await openPlayer(page, "permission-needed");
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  const menu = page.getByRole("menu", { name: "Player settings" });
  await settings.press("ArrowDown");
  await expect(menu.locator("[data-video-analysis-restore-local-file]")).toBeFocused();
  await expect(menu.locator("[data-video-analysis-load]")).toHaveCount(0);
  await menu.press("End");
  await menu.press("Tab");
  await expect(menu).toBeHidden();
  await settings.click();
  await page.locator(".video-analysis-player h2").click();
  await expect(menu).toBeHidden();
  await expect(settings).toHaveAttribute("aria-expanded", "false");
});

test("camera and settings remain reachable in code mode", async ({ page }) => {
  await openPlayer(page);
  await page.locator("[data-video-analysis-code-mode]").click();
  await expect(page.locator("[data-video-analysis-fs-player-workstation]")).toHaveClass(/is-code-mode/);
  await expect(page.getByRole("button", { name: "Cameras and media", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("menu", { name: "Player settings" })).toBeVisible();
  await page.getByRole("menu", { name: "Player settings" }).press("Escape");
  await expect(page.locator("[data-video-analysis-fs-player-workstation]")).toHaveClass(/is-code-mode/);
});
