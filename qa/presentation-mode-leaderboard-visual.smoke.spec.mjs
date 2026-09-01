import { expect, test } from "@playwright/test";
import { createPresentationModeRenderer } from "../src/modules/presentation-mode/presentation-mode-renderer.mjs";

function createStandings(count = 23) {
  const positions = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
  return Array.from({ length: count }, (_, index) => ({
    playerId: `player-${index + 1}`,
    name: index === 7 ? "Alexandra Very Long Player Surname" : `Player Surname ${index + 1}`,
    number: String(index + 1),
    position: positions[index % positions.length],
    photoUrl: "",
    points: Math.max(1, 30 - index),
    rank: index + 1,
  }));
}

function renderLeaderboardMarkup() {
  const renderer = createPresentationModeRenderer();
  const slide = {
    id: "leaderboard-visual",
    type: "leaderboard",
    label: "Leaderboard",
    infoSlide: { id: "leaderboard-visual", title: "Leaderboard", accentColor: "#22c55e" },
    leaderboard: {
      status: "ready",
      month: "2026-09",
      monthLabel: "September 2026",
      teamName: "North Carolina Courage",
      standings: createStandings(),
    },
    style: {
      theme: "whiteboard",
      backgroundColor: "#f7f8fa",
      glowColor: "#dce9e2",
      textColor: "#15221b",
      accentColor: "#15803d",
    },
  };
  const model = {
    accentColor: "#15803d",
    brand: { teamName: "North Carolina Courage", logoUrl: "" },
    dateLabel: "Tuesday 1 September 2026",
    presenting: true,
    teamName: "North Carolina Courage",
    slideIndex: 0,
    slides: [slide],
  };
  return renderer.renderLeaderboardSlide(model, slide);
}

test("Leaderboard slide stays readable and inside the frame across presentation formats", async ({ page, baseURL }, testInfo) => {
  const markup = renderLeaderboardMarkup();
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <link rel="stylesheet" href="${baseURL}/styles.css">
        <link rel="stylesheet" href="${baseURL}/presentation-mode.css">
        <link rel="stylesheet" href="${baseURL}/src/modules/presentation-mode/presentation-mode-leaderboard.css">
        <style>
          html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #111; }
          body { display: grid; place-items: center; }
          .presentation-slide { width: min(100vw, calc(100vh * 1.7777778)); height: min(100vh, calc(100vw * .5625)); }
        </style>
      </head>
      <body>${markup}</body>
    </html>
  `);
  await page.waitForFunction(() => [...document.styleSheets].every((sheet) => {
    try { return sheet.cssRules.length > 0; } catch { return true; }
  }));

  const formats = [
    { name: "720p", width: 1280, height: 720 },
    { name: "1080p", width: 1920, height: 1080 },
    { name: "4k", width: 3840, height: 2160 },
    { name: "16-10", width: 1920, height: 1200 },
  ];

  for (const format of formats) {
    await page.setViewportSize({ width: format.width, height: format.height });
    const layout = page.locator(".presentation-leaderboard-layout");
    await expect(layout).toBeVisible();
    const result = await page.evaluate(() => {
      const slide = document.querySelector(".presentation-slide");
      const layoutNode = document.querySelector(".presentation-leaderboard-layout");
      const cards = [...document.querySelectorAll(".presentation-leaderboard-podium-player, .presentation-leaderboard-standing")];
      const slideRect = slide.getBoundingClientRect();
      const cardRects = cards.map((card) => card.getBoundingClientRect());
      const inside = cardRects.every((rect) => (
        rect.left >= slideRect.left - 1
        && rect.top >= slideRect.top - 1
        && rect.right <= slideRect.right + 1
        && rect.bottom <= slideRect.bottom + 1
      ));
      const overlapPairs = cardRects.flatMap((first, firstIndex) => cardRects.flatMap((second, secondIndex) => (
        secondIndex > firstIndex
        && Math.min(first.right, second.right) - Math.max(first.left, second.left) > 2
        && Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 2
          ? [[firstIndex, secondIndex]]
          : []
      )));
      const smallestName = Math.min(...[...document.querySelectorAll(".presentation-leaderboard-player-copy strong")]
        .map((node) => Number.parseFloat(getComputedStyle(node).fontSize)));
      return {
        cardCount: cards.length,
        inside,
        overlapPairs,
        layoutOverflowX: layoutNode.scrollWidth - layoutNode.clientWidth,
        layoutOverflowY: layoutNode.scrollHeight - layoutNode.clientHeight,
        smallestName,
      };
    });

    expect(result.cardCount, format.name).toBe(23);
    expect(result.inside, format.name).toBe(true);
    expect(result.overlapPairs, format.name).toEqual([]);
    expect(result.layoutOverflowX, format.name).toBeLessThanOrEqual(1);
    expect(result.layoutOverflowY, format.name).toBeLessThanOrEqual(1);
    expect(result.smallestName, format.name).toBeGreaterThanOrEqual(14);

    if (format.name === "1080p") {
      await page.screenshot({ path: testInfo.outputPath("leaderboard-1080p.png"), fullPage: true });
    }
  }
});
