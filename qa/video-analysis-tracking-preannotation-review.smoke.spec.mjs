import { expect, test } from "@playwright/test";

test("preannotation review panel remains compact and actionable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/qa/video-analysis-browser-smoke.html?preannotation-review=1", {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate(async () => {
    const component = await import("/src/modules/video-analysis/components/TrackingPreannotationReviewPanel.js");
    document.body.innerHTML = `<main style="width:340px;padding:16px">${component.renderTrackingPreannotationReviewPanel({
      presentation: {
        tracking: {
          preannotationReview: {
            status: "review",
            caseId: "attacking-third",
            workspaceSha256: "a".repeat(64),
            associatedTrackCount: 312,
            unassociatedObservationCount: 4341,
            criticalEntityCount: 17,
            fragmentCount: 204,
            lowConfidenceCount: 48,
            pendingCount: 4652,
            acceptedCount: 1,
            rejectedCount: 0,
            savedCount: 0,
            reviewScope: "critical",
            scopePendingCount: 17,
            batchSize: 50,
            batchPendingCount: 17,
            batchTotalCount: 17,
            draftStatus: "restored",
            restoredDecisionCount: 12,
            current: {
              id: "suggestion-1",
              entityType: "ball",
              associationStatus: "unassociated",
              atMs: 1250,
              confidence: 0.4,
              pointCount: 1,
              priorityCode: "critical-entity",
              priorityLabel: "Ball/referee requires manual confirmation",
            },
          },
        },
      },
    }, { id: "item-1" })}</main>`;
  });

  const panel = page.locator(".video-analysis-preannotation");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Unassociated ball")).toBeVisible();
  await expect(panel.getByText(/Ball\/referee requires manual confirmation/)).toBeVisible();
  await expect(panel.getByLabel("Review focus")).toHaveValue("critical");
  await expect(panel.getByLabel("Review batch size")).toHaveValue("50");
  await expect(panel.getByRole("button", { name: "Accept", exact: true })).toBeEnabled();
  await expect(panel.getByRole("button", { name: "Save accepted", exact: true })).toBeEnabled();
  const layout = await panel.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    scrollWidth: element.scrollWidth,
    buttons: [...element.querySelectorAll("button")].map((button) => ({
      width: button.getBoundingClientRect().width,
      scrollWidth: button.scrollWidth,
    })),
    selects: [...element.querySelectorAll("select")].map((select) => ({
      width: select.getBoundingClientRect().width,
      scrollWidth: select.scrollWidth,
    })),
  }));
  expect(layout.width).toBeLessThanOrEqual(340);
  expect(layout.scrollWidth).toBeLessThanOrEqual(Math.ceil(layout.width));
  expect(layout.buttons.every((button) => button.scrollWidth <= Math.ceil(button.width))).toBe(true);
  expect(layout.selects.every((select) => select.scrollWidth <= Math.ceil(select.width))).toBe(true);
});
