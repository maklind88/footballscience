import { expect, test } from "@playwright/test";

test("the load plan uses position references and updates the team week from individual targets", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/qa/performance-microcycle-preview.html");
  const workbench = page.locator(".pr-plan-workbench");
  await workbench.getByRole("button", { name: "By activity", exact: true }).click();
  const teamTraining = workbench.getByRole("row", { name: /Wed 25 Nov.*Team training/ });
  await expect(teamTraining).toContainText("MD+2 · MD−3");
  await expect(teamTraining).toContainText("Moderate · 60 plan min");
  await expect(teamTraining).toContainText("4.95");
  await expect(teamTraining).toContainText("5 / 6 players");
  await expect(workbench.getByRole("row", { name: /Training week/ })).toContainText("15 / 18 activity targets set");
  await page.screenshot({ path: testInfo.outputPath("microcycle-team.png"), fullPage: true });

  await workbench.getByRole("button", { name: "Player plan" }).click();
  const reference = workbench.getByRole("term").filter({ hasText: "HSR reference" }).locator("..");
  await expect(reference).toContainText("650 m");
  await expect(reference).toContainText("Position");
  await page.screenshot({ path: testInfo.outputPath("microcycle-player.png"), fullPage: true });
  await workbench.getByRole("button", { name: "Edit player baselines" }).click();
  await expect(workbench.getByRole("combobox", { name: "Set reference for" })).toHaveValue("player:maya");
  await workbench.getByRole("textbox", { name: "Total distance", exact: true }).fill("10,8");
  await workbench.getByRole("button", { name: "Save reference" }).click();
  await expect(workbench.getByRole("status")).toContainText("Reference saved");
  await expect(workbench.getByRole("row", { name: /Maya Torres/ })).toContainText("10.8");

  await workbench.getByRole("button", { name: "Player plan" }).click();
  const distance = workbench.getByRole("textbox", { name: /Team training.*Total distance/ });
  await distance.fill("-3");
  await workbench.getByRole("button", { name: "Save player plan" }).click();
  await expect(distance).toHaveAttribute("aria-invalid", "true");
  await distance.fill("6,2");
  await workbench.getByRole("textbox", { name: /Team training.*High-speed running/ }).fill("450");
  await workbench.getByRole("textbox", { name: /Team training.*Sprint distance/ }).fill("75");
  await workbench.getByRole("button", { name: "Save player plan" }).click();
  await expect(workbench.getByRole("status")).toContainText("Team week updated");

  await workbench.getByRole("button", { name: "Team week" }).click();
  await expect(teamTraining).toContainText("5.15");
  await expect(teamTraining).toContainText("364");
  await expect(teamTraining).toContainText("75");
  await workbench.getByRole("button", { name: "Player plan" }).click();
  await workbench.getByRole("combobox", { name: "Player", exact: true }).selectOption("alex");
  const sprint = workbench.getByRole("textbox", { name: /Team training.*Sprint distance/ });
  await expect(sprint).toHaveValue("");
  await sprint.fill("0");
  await workbench.getByRole("button", { name: "Save player plan" }).click();
  await workbench.getByRole("button", { name: "Team week" }).click();
  await expect(teamTraining.getByRole("cell").last()).toContainText("6 / 6 players");
});

test("the mobile preview keeps the week and player controls usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/qa/performance-microcycle-preview.html");
  const workbench = page.locator(".pr-plan-workbench");
  await workbench.getByRole("button", { name: "Player plan" }).click();
  await expect(workbench.getByRole("combobox", { name: "Player", exact: true })).toBeVisible();
  await expect(workbench.getByRole("button", { name: "Save player plan" })).toBeVisible();
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(hasOverflow).toBe(false);
});
