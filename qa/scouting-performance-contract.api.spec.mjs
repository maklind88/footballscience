import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  createScoutingPerformanceMonitor,
  scoutingPerformanceBudgets,
} from "../src/modules/scouting/index.mjs";

const scoutingClickPerformanceSource = readFileSync(
  new URL("./scouting-click-performance.smoke.spec.mjs", import.meta.url),
  "utf8"
);

test("Scouting search gate measures real browser paint while preserving the strict budget", () => {
  expect(scoutingClickPerformanceSource).toContain("searchDatabase: budget(1000, 4000)");
  expect(scoutingClickPerformanceSource).toContain("armScoutingRefreshPaintProbe");
  expect(scoutingClickPerformanceSource).toContain('clock: "browser-paint"');
  expect(scoutingClickPerformanceSource).toContain(
    "requestAnimationFrame(() => requestAnimationFrame(() => resolvePaint(performance.now())))"
  );
  expect(scoutingClickPerformanceSource).toContain("await waitForScoutingRows");
});

test("Scouting performance monitor records bounded timing entries with budgets", () => {
  let now = 100;
  const windowRef = {};
  const monitor = createScoutingPerformanceMonitor({
    windowRef,
    performanceRef: {
      now: () => now,
    },
    maxEntries: 20,
  });

  const timer = monitor.start("tab.switch", { from: "shadow-xi", to: "lists" });
  now += scoutingPerformanceBudgets["tab.switch"] + 25;
  const entry = timer.end({ phase: "first" });

  expect(entry).toMatchObject({
    label: "tab.switch",
    budgetMs: scoutingPerformanceBudgets["tab.switch"],
    slow: true,
  });
  expect(entry.durationMs).toBeGreaterThan(scoutingPerformanceBudgets["tab.switch"]);
  expect(windowRef.__footballScienceScoutingPerformance.last.label).toBe("tab.switch");
  expect(windowRef.__footballScienceScoutingPerformance.entries).toHaveLength(1);
});

test("Scouting performance monitor caps entries and sanitizes detail", () => {
  let now = 0;
  const windowRef = {};
  const monitor = createScoutingPerformanceMonitor({
    windowRef,
    performanceRef: {
      now: () => now,
    },
    maxEntries: 20,
  });

  for (let index = 0; index < 25; index += 1) {
    now += 5;
    monitor.record("render.active-content", {
      durationMs: index,
      detail: {
        tab: "database",
        empty: "",
        long: "x".repeat(300),
      },
    });
  }

  expect(monitor.getEntries()).toHaveLength(20);
  expect(windowRef.__footballScienceScoutingPerformance.entries).toHaveLength(20);
  expect(windowRef.__footballScienceScoutingPerformance.entries[0].label).toBe("render.active-content");
  expect(windowRef.__footballScienceScoutingPerformance.entries.at(-1).detail.long.length).toBeLessThanOrEqual(180);
});
