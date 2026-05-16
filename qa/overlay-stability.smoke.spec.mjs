import { expect, test } from "@playwright/test";

async function waitForPlatform(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#hubShell")).toBeVisible();
  await expect(page.locator("#loginScreen")).toBeHidden();
  await page.waitForFunction(() => Boolean(window.footballScienceOverlayStability), null, { timeout: 15_000 });
}

test("platform overlays keep their scroll position across rerenders", async ({ page }) => {
  await waitForPlatform(page);

  const result = await page.evaluate(async () => {
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const platformContent = document.querySelector(".platform-content");
    if (!platformContent || !window.footballScienceOverlayStability) {
      return { ok: false, reason: "platform stability hook missing" };
    }

    const spacer = document.createElement("div");
    spacer.setAttribute("data-qa-platform-scroll-spacer", "1");
    spacer.style.cssText = "height: 1400px; width: 1px;";
    platformContent.appendChild(spacer);
    await nextFrame();
    const backgroundScroller = window.footballScienceOverlayStability.getBackgroundScroller();
    const originalScrollTop = backgroundScroller.scrollTop;
    const originalScrollLeft = backgroundScroller.scrollLeft;

    const makeOverlayMarkup = () => `
      <section
        class="qa-overlay-dialog"
        data-qa-overlay-dialog
        role="dialog"
        aria-modal="true"
        aria-label="QA overlay stability"
        style="position: fixed; inset: 24px; overflow: auto; background: white; z-index: 10000;"
      >
        <button type="button">Close</button>
        <div style="height: 1600px;">
          <label>QA field <input value="focus target" /></label>
        </div>
      </section>
    `;

    try {
      backgroundScroller.scrollTop = 420;
      const lockedScrollTop = backgroundScroller.scrollTop;
      const host = document.createElement("div");
      host.setAttribute("data-qa-overlay-host", "1");
      host.innerHTML = makeOverlayMarkup();
      document.body.appendChild(host);
      window.footballScienceOverlayStability.sync();
      await nextFrame();

      const firstDialog = host.querySelector("[data-qa-overlay-dialog]");
      firstDialog.scrollTop = 640;
      firstDialog.dispatchEvent(new Event("scroll", { bubbles: true }));

      backgroundScroller.scrollTop = 0;
      window.footballScienceOverlayStability.sync();
      await nextFrame();
      const backgroundAfterForcedScroll = backgroundScroller.scrollTop;

      host.innerHTML = makeOverlayMarkup();
      await nextFrame();
      window.footballScienceOverlayStability.restore();
      const secondDialog = host.querySelector("[data-qa-overlay-dialog]");
      const dialogAfterRerender = secondDialog.scrollTop;

      host.remove();
      spacer.remove();
      window.footballScienceOverlayStability.sync();
      await nextFrame();

      backgroundScroller.scrollTop = originalScrollTop;
      backgroundScroller.scrollLeft = originalScrollLeft;
      return {
        ok: lockedScrollTop >= 300 && backgroundAfterForcedScroll === lockedScrollTop && dialogAfterRerender >= 620,
        backgroundAfterForcedScroll,
        lockedScrollTop,
        dialogAfterRerender,
      };
    } catch (error) {
      spacer.remove();
      return { ok: false, reason: error?.message || String(error) };
    }
  });

  expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
});
