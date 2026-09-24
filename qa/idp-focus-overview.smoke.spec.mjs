import { expect, test } from "@playwright/test";

const focuses = [
  { id: "main-focus", rowVersion: 4, focusLevel: "main", category: "Tactical", status: "Active", title: "Threat and timing of runs into Zone #3", description: "Body shaping forward to threaten in behind. Time the run as the ball leaves the passer's foot, while staying available for a second movement." },
  { id: "support-focus", rowVersion: 7, focusLevel: "secondary", category: "Technical", status: "Active", title: "Receive under pressure", description: "First touch away from pressure. Scan before receiving and open the next passing lane." },
  { id: "personal-focus", rowVersion: 2, focusLevel: "personal", category: "Leadership", status: "Active", title: "Organise the first line of pressure", description: "Communicate the trigger and bring teammates into the press." },
];

async function mount(page, { rows = focuses, canEdit = true } = {}) {
  const writes = [];
  const detail = {
    profile: { playerId: "p1", playerName: "Player One", position: "Forward" },
    focuses: structuredClone(rows),
    goals: [{ id: "g1", focusId: "support-focus", title: "Three controlled receptions", status: "active" }],
    evidence: [{ id: "e1", focusId: "support-focus", note: "Opened the passing lane", evidenceType: "Coach Note" }],
    interventions: [{ id: "i1", focusId: "support-focus", title: "Receive and turn", status: "active" }, { id: "i2", focusId: "", title: "Unlinked exercise", status: "active" }],
  };
  const initial = structuredClone(detail);
  await page.route("**/__idp-overview-test", (route) => route.fulfill({ contentType: "text/html", body: '<html><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/src/modules/idp/idp.css"></head><body style="margin:0"><main id="idpWorkspace"></main></body></html>' }));
  await page.route("**/api/idp**", (route) => {
    if (route.request().method() !== "GET") {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ status: 500, json: { error: "No writes expected" } });
    }
    return route.fulfill({ json: new URL(route.request().url()).searchParams.get("action") === "dashboard" ? { players: [{ profile: detail.profile }] } : detail });
  });
  await page.goto("/__idp-overview-test");
  await page.evaluate(async (editable) => {
    const module = await import("/src/modules/idp/index.mjs");
    const root = document.getElementById("idpWorkspace");
    root.addEventListener("click", module.handleClick);
    root.addEventListener("change", module.handleChange);
    root.addEventListener("submit", module.handleSubmit);
    module.render({ ui: { idpWorkspace: root }, win: window, canEdit: () => editable });
  }, canEdit);
  await page.locator('[data-idp-player="p1"]').click();
  await expect(page.locator(".idp-focus-overview")).toBeVisible();
  return { writes, detail, initial };
}

for (const width of [1450, 768, 390]) {
  test(`focus cards preserve data and stay readable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 950 });
    const { writes, detail, initial } = await mount(page);
    const overview = page.locator(".idp-focus-overview");
    const cards = overview.locator(".idp-focus-card");
    await expect(cards).toHaveCount(3);
    await expect(overview.locator('[data-idp-action="new-focus"]')).toHaveCount(0);
    for (const focus of focuses) {
      await expect(overview.getByRole("heading", { name: focus.title, exact: true })).toHaveCount(1);
    }
    const boxes = await cards.evaluateAll((items) => items.map((item) => { const { x, y, width, height } = item.getBoundingClientRect(); return { x, y, width, height }; }));
    expect(boxes.every((box) => box.x >= 0 && box.x + box.width <= width)).toBe(true);
    if (width === 1450) {
      expect(new Set(boxes.map((box) => box.y)).size).toBe(1);
      expect(Math.max(...boxes.map((box) => box.height)) - Math.min(...boxes.map((box) => box.height))).toBeLessThan(2);
    }
    if (width === 390) expect(boxes[1].y).toBeGreaterThan(boxes[0].y + boxes[0].height);
    await testInfo.attach(`focus-cards-light-${width}.png`, { body: await overview.screenshot({ path: testInfo.outputPath(`focus-cards-light-${width}.png`) }), contentType: "image/png" });
    await page.locator('[data-idp-select-focus="support-focus"]').press("Enter");
    const selected = page.locator('[data-idp-select-focus="support-focus"]');
    await expect(selected).toHaveAttribute("aria-expanded", "true");
    await expect(selected).toBeFocused();
    const linked = page.locator("#idp-focus-detail-support-focus");
    await expect(linked).toContainText("Three controlled receptions");
    await expect(linked).toContainText("Opened the passing lane");
    await expect(linked).toContainText("Receive and turn");
    await expect(linked).not.toContainText("Unlinked exercise");
    await selected.press("Enter");
    await expect(linked).toBeHidden();
    await page.locator('[data-idp-edit-focus="personal-focus"]').click();
    await expect(page.locator('[data-idp-create-focus] [name="focusId"]')).toHaveValue("personal-focus");
    await expect(page.locator('[data-idp-create-focus] [name="title"]')).toHaveValue(focuses[2].title);
    await page.locator("[data-idp-close-action]").first().click();
    await page.evaluate(() => document.body.classList.add("is-dark-mode"));
    await testInfo.attach(`focus-cards-dark-${width}.png`, { body: await overview.screenshot({ path: testInfo.outputPath(`focus-cards-dark-${width}.png`) }), contentType: "image/png" });
    expect(writes).toEqual([]);
    expect(detail).toEqual(initial);
  });
}

test("single and read-only focus overviews do not invent or lose focuses", async ({ page }) => {
  const { writes } = await mount(page, { rows: [focuses[0]], canEdit: false });
  await expect(page.locator(".idp-focus-card")).toHaveCount(1);
  await expect(page.locator("[data-idp-edit-focus]")).toHaveCount(0);
  await expect(page.locator('[data-idp-action="new-focus"]')).toHaveCount(0);
  await page.locator('[data-idp-select-focus="main-focus"]').click();
  await expect(page.locator("#idp-focus-detail-main-focus")).toBeVisible();
  expect(writes).toEqual([]);
});

test("previous focuses remain accessible without filling empty active slots", async ({ page }) => {
  const { writes } = await mount(page, { rows: [{ ...focuses[0], status: "Completed" }] });
  await expect(page.getByText("No active focus yet", { exact: true })).toBeVisible();
  await expect(page.locator('[data-idp-action="new-focus"]')).toBeVisible();
  await page.getByText("Previous focuses (1)", { exact: true }).click();
  await page.locator('[data-idp-select-focus="main-focus"]').click();
  await expect(page.locator("#idp-focus-detail-main-focus")).toBeVisible();
  expect(writes).toEqual([]);
});

test("empty overview stays compact without placeholder cards", async ({ page }) => {
  await mount(page, { rows: [] });
  await expect(page.locator(".idp-focus-card")).toHaveCount(0);
  await expect(page.getByText("No active focus yet", { exact: true })).toBeVisible();
  await expect(page.locator('[data-idp-action="new-focus"]')).toBeVisible();
});

test("draft focus stays visible rather than being treated as history", async ({ page }) => {
  await mount(page, { rows: [{ ...focuses[0], status: "Draft" }] });
  await expect(page.locator('[data-idp-select-focus="main-focus"]')).toBeVisible();
  await expect(page.locator(".idp-focus-history")).toHaveCount(0);
});
