import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/__qa-chat-create-menu", (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><div id="chat-root"></div><input aria-label="Other field">',
  }));
  await page.goto("/__qa-chat-create-menu");
  await page.evaluate(async () => {
    const { createDashboardChatWidgetRuntime } = await import("/src/modules/chat/dashboard-chat-widget-runtime.mjs");
    const state = { isOpen: true, selectedThreadId: "team" };
    const controls = { creatorOpen: false, writes: 0 };
    let revision = 0;
    const runtime = createDashboardChatWidgetRuntime({
      ui: { dashboardChatWidgetRoot: document.querySelector("#chat-root") },
      documentRef: document,
      getCurrentPlatformUser: () => ({ id: "qa-coach" }),
      getDashboardChatThreadList: () => [{ threadId: "team" }],
      getDashboardHydratedThreadIds: () => new Set(["team"]),
      getDashboardChatThreadSummaryLastRequestedAt: () => Date.now(),
      readDashboardChatWidgetState: () => state,
      writeDashboardChatWidgetState: () => { controls.writes += 1; },
      getDashboardChatGroupCreatorOpen: () => controls.creatorOpen,
      dashboardChatWidgetRenderer: {
        render: () => ({
          activeThreadId: "team",
          replyDraft: null,
          html: `<section class="dashboard-chat-widget ${state.isOpen ? "is-open" : ""}" data-revision="${++revision}">
            ${state.isOpen ? `<details data-dashboard-chat-thread-presets>
              <summary data-dashboard-chat-create-menu-trigger>Create chat</summary>
              <button data-dashboard-chat-open-direct-creator>Private message</button>
              <button data-dashboard-chat-open-group-creator>New group</button>
            </details>` : ""}
          </section>`,
        }),
      },
    });
    window.chatMenuQa = { state, controls, render: runtime.renderDashboardChatWidget };
    runtime.renderDashboardChatWidget();
  });
});

test("Chat create menu keeps its open state and keyboard focus through background renders", async ({ page }) => {
  const menu = page.locator("[data-dashboard-chat-thread-presets]");
  await menu.locator("summary").focus();
  await menu.locator("summary").press("Enter");
  await menu.locator("summary").press("Tab");
  const direct = page.getByRole("button", { name: "Private message" });
  await expect(direct).toBeFocused();
  for (let update = 0; update < 3; update += 1) {
    await page.evaluate(() => window.chatMenuQa.render());
    await expect(menu).toHaveAttribute("open", "");
    await expect(direct).toBeFocused();
  }
  await expect.poll(() => page.evaluate(() => window.chatMenuQa.controls.writes)).toBe(0);
});

test("Chat create menu respects manual closure and does not steal outside focus", async ({ page }) => {
  const menu = page.locator("[data-dashboard-chat-thread-presets]");
  await menu.locator("summary").click();
  await page.getByLabel("Other field").focus();
  await page.evaluate(() => window.chatMenuQa.render());
  await expect(menu).toHaveAttribute("open", "");
  await expect(page.getByLabel("Other field")).toBeFocused();
  await menu.locator("summary").click();
  await page.evaluate(() => window.chatMenuQa.render());
  await expect(menu).not.toHaveAttribute("open");
});

test("Chat create menu stays closed after opening a dialog or closing the widget", async ({ page }) => {
  const menu = page.locator("[data-dashboard-chat-thread-presets]");
  await menu.locator("summary").click();
  await page.evaluate(() => {
    window.chatMenuQa.controls.creatorOpen = true;
    window.chatMenuQa.render();
  });
  await expect(menu).not.toHaveAttribute("open");
  await page.evaluate(() => { window.chatMenuQa.controls.creatorOpen = false; });
  await menu.locator("summary").click();
  await page.evaluate(() => {
    window.chatMenuQa.state.isOpen = false;
    window.chatMenuQa.render();
    window.chatMenuQa.state.isOpen = true;
    window.chatMenuQa.render();
  });
  await expect(menu).not.toHaveAttribute("open");
});
