import { expect, test } from "@playwright/test";
import {
  createPresentationModeController,
  createPresentationModeRenderer,
  dashboardPresentationStorageKey,
} from "../src/modules/presentation-mode/index.mjs";

function createDocumentHarness() {
  const classNames = new Set();
  const root = {
    hidden: true,
    innerHTML: "",
    className: "",
    id: "",
    setAttribute: () => {},
    querySelector: () => null,
    contains: () => true,
  };
  return {
    root,
    documentRef: {
      body: {
        appendChild: () => {},
        classList: {
          add: (className) => classNames.add(className),
          remove: (className) => classNames.delete(className),
        },
      },
      createElement: () => root,
      addEventListener: () => {},
      fullscreenElement: null,
    },
  };
}

test("Presentation Mode builds cover, info, overview and block slides from existing session data", () => {
  const storage = new Map();
  const harness = createDocumentHarness();
  const renderer = createPresentationModeRenderer({
    escapeHtml: (value) => String(value ?? ""),
    renderExerciseVisual: () => `<div data-exercise-visual></div>`,
  });
  const controller = createPresentationModeController({
    documentRef: harness.documentRef,
    win: {},
    renderer,
    readJson: (key, fallback) => storage.get(key) || fallback,
    writeJson: (key, value) => storage.set(key, value),
    getTodayValue: () => "2026-06-02",
    getPasses: () => [{ dateValue: "2026-06-02", dateLabel: "Tue 2 Jun", title: "Training", blockCount: 1, totalMinutes: 30 }],
    getSessionForDate: () => ({
      title: "Training Session",
      theme: "Build Up",
      blocks: [{ id: "b1", label: "Block 1", title: "Rondo", minutes: 30, pitchSize: "SSG", phase: "In Possession" }],
    }),
    getPeriodizationDay: () => ({ physicalLoad: "Hard", pitchSize: "SSG", matchPhases: ["In Possession"] }),
    getAvailabilityItems: () => [
      { player: { id: "p1", name: "Ada Keeper", position: "GK", photoUrl: "https://example.com/ada.jpg" }, record: { id: "r1" }, participation: 100, status: { label: "Full" } },
      { player: { id: "p2", name: "Bea Mid", position: "CM" }, record: { id: "r2" }, participation: 0, status: { label: "Unavailable" } },
    ],
    getCustomPeople: () => [{ id: "staff-1", name: "Coach", kind: "staff", role: "Staff" }],
    createCustomPersonItem: (person) => ({
      player: { id: person.id, name: person.name, position: person.role, playerBoardCustom: true },
      planningOnly: true,
      participation: 100,
      status: { label: "Added manually" },
    }),
    getTeamName: () => "North Carolina Courage",
    getTeamLogoUrl: () => "assets/football-science-logo.png",
  });

  controller.open("2026-06-02");

  const model = controller.buildModel();
  expect(model.slides.map((slide) => slide.type)).toEqual(["cover", "info", "overview", "block"]);
  expect(model.medicalRecommendations.map((item) => item.player.name)).toEqual(["Bea Mid", "Ada Keeper"]);
  const blockSlide = model.slides.find((slide) => slide.type === "block");
  expect(blockSlide.playerSummary.plannedPlayers.map((item) => item.player.name)).toEqual(["Ada Keeper", "Coach"]);
  expect(blockSlide.playerSummary.nonParticipants.map((item) => item.player.name)).toEqual(["Bea Mid"]);
  expect(harness.root.innerHTML).toContain("Presentation Mode");
  expect(harness.root.innerHTML).toMatch(/<footer class="presentation-footer-nav">[\s\S]*<nav class="presentation-slide-tabs"/);
  expect(harness.root.innerHTML).toMatch(/<nav class="presentation-slide-tabs"[\s\S]*<div class="presentation-footer-pager">/);
  expect(harness.root.innerHTML).not.toContain("data-presentation-pass-select");
  expect(harness.root.innerHTML).toContain("data-presentation-date-input");
  const coverHtml = renderer.renderCoverSlide(model);
  expect(coverHtml).not.toContain("presentation-cover-metrics");
  expect(coverHtml).not.toContain("<small>Blocks</small>");
  expect(coverHtml).not.toContain("<small>Minutes</small>");
  expect(coverHtml).not.toContain("<small>Load</small>");
  const overviewHtml = renderer.renderOverviewSlide(model);
  expect(overviewHtml).toContain("Training Overview");
  expect(overviewHtml).not.toContain("<h2>");
  expect(overviewHtml).toContain("presentation-load-gauge");
  expect(overviewHtml).toContain("presentation-load-needle");
  expect(overviewHtml).toContain("Physical load: Hard");
  expect(overviewHtml).toContain("is-load is-hard");
  expect(overviewHtml.indexOf("is-load")).toBeLessThan(overviewHtml.indexOf("is-phase"));
  expect(overviewHtml).toContain("presentation-medical-overview");
  expect(overviewHtml).toContain("Medical Plan");
  expect(overviewHtml).toContain("https://example.com/ada.jpg");
  expect(overviewHtml).toContain("100%");
  expect(overviewHtml).toContain("0%");
  expect(overviewHtml).toContain("presentation-block-flow");
  expect(overviewHtml.indexOf("is-pitch")).toBeLessThan(overviewHtml.indexOf("presentation-block-flow"));
  expect(overviewHtml.indexOf("is-match-day")).toBeLessThan(overviewHtml.indexOf("presentation-block-flow"));
  expect(overviewHtml).toContain("is-focus");
  const infoSlide = model.slides.find((slide) => slide.type === "info");
  const infoHtml = renderer.renderInfoSlide(model, infoSlide);
  expect(infoHtml.indexOf("presentation-info-title")).toBeLessThan(infoHtml.indexOf("presentation-info-rule"));
  expect(infoHtml).toContain('data-presentation-info-field="title"');
  expect(renderer.renderBlockSlide(model, blockSlide)).toContain("data-exercise-visual");
  expect(storage.has(dashboardPresentationStorageKey)).toBe(false);

  controller.writeDeckForDate("2026-06-02", (deck) => ({
    ...deck,
    infoSlides: [{ ...deck.infoSlides[0], title: "Daily Info", body: "- Arrival" }],
  }));

  expect(storage.get(dashboardPresentationStorageKey).decks["2026-06-02"].infoSlides[0]).toMatchObject({
    title: "Daily Info",
    body: "- Arrival",
  });
});
