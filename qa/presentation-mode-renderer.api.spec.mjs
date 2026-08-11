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
  const exerciseVisualCalls = [];
  const harness = createDocumentHarness();
  const renderer = createPresentationModeRenderer({
    escapeHtml: (value) => String(value ?? ""),
    renderExerciseVisual: (block, options = {}) => {
      exerciseVisualCalls.push({ block, options });
      return `<div data-exercise-visual data-landscape="${String(Boolean(options.landscape))}"></div>`;
    },
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
      blocks: [
        {
          id: "b1",
          label: "Block 1",
          title: "Rondo",
          minutes: 30,
          pitchSize: "SSG",
          phase: "In Possession, Out of Possession",
          subPhase: "Build Up, Block Defending",
          principles: "- Scan early\n\n- Play forward when open",
        },
      ],
    }),
    getPeriodizationDay: () => ({
      physicalLoad: "Hard",
      pitchSize: "SSG",
      matchPhases: ["In Possession"],
      subPhases: ["Build Up"],
      preTrainingVideo: "Scout clips",
      preTrainingNotes: "- Switches behind pressure\n\n- Opposite fullback timing",
    }),
    getAvailabilityItems: () => [
      { player: { id: "p1", name: "Ada Keeper", position: "GK", photoUrl: "https://example.com/ada.jpg" }, record: { id: "r1" }, participation: 100, status: { label: "Full" } },
      { player: { id: "p2", name: "Bea Mid", position: "CM" }, record: { id: "r2" }, participation: 0, status: { label: "Unavailable" } },
      { player: { id: "p3", name: "Zoe Striker", position: "Forward" }, participation: 100, status: { label: "Full" } },
      { player: { id: "p4", name: "Cara Defender", position: "Defender" }, participation: 100, status: { label: "Full" } },
      { player: { id: "p5", name: "Mia Midfield", position: "Midfielder" }, participation: 100, status: { label: "Full" } },
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
  expect(model.medicalRecommendations.map((item) => item.player.name)).toEqual([
    "Bea Mid",
    "Ada Keeper",
    "Cara Defender",
    "Mia Midfield",
    "Zoe Striker",
  ]);
  const blockSlide = model.slides.find((slide) => slide.type === "block");
  expect(blockSlide.playerSummary.plannedPlayers.map((item) => item.player.name)).toEqual(["Ada Keeper", "Coach"]);
  expect(blockSlide.playerSummary.nonParticipants.map((item) => item.player.name)).toEqual(["Bea Mid"]);
  expect(harness.root.innerHTML).toContain("Presentation Mode");
  expect(harness.root.innerHTML).toMatch(/<footer class="presentation-footer-nav">[\s\S]*<nav class="presentation-slide-tabs"/);
  expect(harness.root.innerHTML).toMatch(/<nav class="presentation-slide-tabs"[\s\S]*<div class="presentation-footer-pager">/);
  const controlHtml = renderer.renderControlBar(model);
  expect(controlHtml).toContain("<strong>Presentation Mode</strong>");
  expect(controlHtml).toContain("data-presentation-theme-menu");
  expect(controlHtml).toContain("data-presentation-theme-preset");
  expect(controlHtml).toContain('data-presentation-style-field="theme"');
  expect(controlHtml).toContain("Stadium Lights");
  expect(controlHtml).toContain("Tactical Board");
  expect(controlHtml).toContain("Recovery");
  expect(controlHtml).toContain("Film Room");
  expect(controlHtml).toContain("Whiteboard");
  expect(controlHtml).toContain("Medical Calm");
  expect(controlHtml.indexOf("data-presentation-theme-menu")).toBeLessThan(controlHtml.indexOf("data-presentation-add-info"));
  expect(controlHtml).toContain("data-presentation-add-info");
  expect(controlHtml).toContain(">New Slide</button>");
  expect(controlHtml).toContain("data-presentation-delete-slide");
  expect(controlHtml).toContain("Only custom slides can be deleted");
  expect(controlHtml).not.toContain("data-presentation-toggle-editor");
  expect(controlHtml).not.toContain(">Edit<");
  expect(controlHtml).not.toContain(model.sessionTitle);
  expect(controlHtml).not.toContain("<span>Date</span>");
  expect(harness.root.innerHTML).not.toContain("data-presentation-pass-select");
  expect(harness.root.innerHTML).toContain("data-presentation-date-input");
  const coverHtml = renderer.renderCoverSlide(model);
  expect(coverHtml).toContain("is-theme-classic");
  expect(coverHtml).toContain("--presentation-slide-bg: #08120f");
  expect(coverHtml).toContain('data-presentation-text-field="cover.title"');
  expect(coverHtml).toContain('contenteditable="true"');
  expect(renderer.renderCoverSlide({ ...model, presenting: true })).not.toContain('contenteditable="true"');
  expect(coverHtml).not.toContain(`<span>${model.passTypeLabel}</span>`);
  expect(coverHtml).not.toContain("presentation-cover-metrics");
  expect(coverHtml).not.toContain("<small>Blocks</small>");
  expect(coverHtml).not.toContain("<small>Minutes</small>");
  expect(coverHtml).not.toContain("<small>Load</small>");
  const overviewHtml = renderer.renderOverviewSlide(model);
  expect(overviewHtml).toContain("Training Overview");
  expect(overviewHtml).toContain('data-presentation-text-field="overview.heading"');
  expect(overviewHtml).toContain('data-presentation-text-field="overview.phase.value"');
  expect(overviewHtml).toContain('data-presentation-text-field="overview.subPhase.value"');
  expect(overviewHtml).toContain("presentation-day-overview");
  expect(overviewHtml).toContain('data-presentation-text-field="medical.p1.name"');
  expect(overviewHtml).not.toContain("<h2>");
  expect(overviewHtml).toContain("presentation-load-gauge");
  expect(overviewHtml).toContain("presentation-load-needle");
  expect(overviewHtml).toContain("Physical load: Hard");
  expect(overviewHtml).toContain("is-load is-hard");
  expect(overviewHtml).toContain("Planned Load");
  expect(overviewHtml).not.toContain("<span>Load</span>");
  expect(overviewHtml).not.toContain("presentation-load-copy");
  expect(overviewHtml).not.toContain("<strong>Hard</strong>");
  expect(overviewHtml).not.toContain("presentation-overview-metric is-phase");
  expect(overviewHtml.indexOf("is-load")).toBeLessThan(overviewHtml.indexOf("presentation-day-overview"));
  expect(overviewHtml).toContain("presentation-medical-overview");
  expect(overviewHtml).not.toContain("<header>");
  expect(overviewHtml).not.toContain("Medical Plan");
  expect(overviewHtml).toContain("https://example.com/ada.jpg");
  expect(overviewHtml).toContain("100%");
  expect(overviewHtml).toContain("0%");
  expect(overviewHtml).toContain("presentation-block-flow");
  expect(overviewHtml).not.toContain("Overview block meta");
  expect(overviewHtml).not.toContain('data-presentation-text-field="overview.b1.meta"');
  expect(overviewHtml.indexOf("is-pitch")).toBeLessThan(overviewHtml.indexOf("is-video"));
  expect(overviewHtml.indexOf("presentation-day-overview")).toBeLessThan(overviewHtml.indexOf("presentation-block-flow"));
  expect(overviewHtml).not.toContain("30 min");
  expect(overviewHtml).not.toContain("Ready");
  expect(overviewHtml).toContain("periodization-pitch-icon is-ssg");
  expect(overviewHtml).toContain("periodization-pitch-highlight");
  expect(overviewHtml.indexOf("is-pitch")).toBeLessThan(overviewHtml.indexOf("presentation-block-flow"));
  expect(overviewHtml).toContain('data-presentation-text-field="overview.video.notes"');
  expect(overviewHtml).toContain("presentation-overview-video-notes");
  expect(overviewHtml).toContain("- Switches behind pressure");
  expect(overviewHtml).toContain("- Opposite fullback timing");
  expect(overviewHtml.indexOf("is-match-day")).toBeLessThan(overviewHtml.indexOf("presentation-block-flow"));
  expect(overviewHtml).not.toContain("is-focus");
  expect(overviewHtml).not.toContain("Main Focus");
  const infoSlide = model.slides.find((slide) => slide.type === "info");
  const infoControlHtml = renderer.renderControlBar({ ...model, slideIndex: infoSlide.index });
  expect(infoControlHtml).toContain("data-presentation-delete-slide");
  expect(infoControlHtml).toContain("Delete current slide");
  const infoHtml = renderer.renderInfoSlide(model, infoSlide);
  expect(infoHtml.indexOf("presentation-info-title")).toBeLessThan(infoHtml.indexOf("presentation-info-rule"));
  expect(infoHtml).toContain('data-presentation-info-field="title"');
  expect(infoHtml).toContain('data-presentation-text-field="info.title"');
  expect(infoHtml).toContain('data-presentation-text-field="info.body"');
  expect(infoHtml).toContain("--presentation-info-body-size: 3.5rem;");
  const toolbarHtml = renderer.renderTextToolbar(model);
  expect(toolbarHtml).toContain("data-presentation-text-toolbar");
  expect(toolbarHtml).toContain("data-presentation-add-text-box");
  expect(toolbarHtml).toContain("presentation-keynote-tool");
  expect(toolbarHtml).toContain("data-presentation-active-font-size");
  expect(toolbarHtml).not.toContain("data-presentation-delete-text-box");
  expect(toolbarHtml).toContain("16 pt");
  expect(toolbarHtml).toContain("56 pt");
  expect(toolbarHtml).toContain("128 pt");
  expect(toolbarHtml).toContain("data-presentation-symbol-menu");
  expect(toolbarHtml).toContain("data-presentation-insert-symbol");
  expect(toolbarHtml).toContain("data-presentation-shape-menu");
  expect(toolbarHtml).toContain("data-presentation-add-shape");
  expect(toolbarHtml).toContain("data-presentation-color-menu");
  expect(toolbarHtml).not.toContain("presentation-quick-style-controls");
  expect(toolbarHtml).toContain("data-presentation-style-menu");
  expect(toolbarHtml).toContain("data-presentation-active-shape-fill");
  expect(toolbarHtml).toContain("data-presentation-active-shape-stroke");
  expect(toolbarHtml).toContain("data-presentation-active-shape-opacity");
  expect(toolbarHtml).toContain('data-presentation-style-field="backgroundColor"');
  expect(toolbarHtml).toContain('data-presentation-style-field="accentColor"');
  expect(toolbarHtml).not.toContain("New info slide");
  const shapeToolHtml = renderer.renderTextToolbar({ ...model, slideIndex: infoSlide.index, shapeDrawTool: "circle" });
  expect(shapeToolHtml).toContain('data-presentation-add-shape="circle"');
  expect(shapeToolHtml).toContain('aria-pressed="true"');
  const fullHtml = renderer.render({ ...model, slideIndex: infoSlide.index });
  expect(fullHtml).toContain("data-presentation-text-toolbar");
  expect(fullHtml).not.toContain("data-presentation-toggle-editor");
  expect(fullHtml).not.toContain("is-editor-open");
  const blockHtml = renderer.renderBlockSlide(model, blockSlide);
  expect(blockHtml).toContain("data-exercise-visual");
  expect(blockHtml).toContain('data-landscape="false"');
  expect(exerciseVisualCalls.at(-1)?.options).toMatchObject({ large: true });
  expect(exerciseVisualCalls.at(-1)?.options.landscape).toBeUndefined();
  expect(blockHtml).toContain("Block 1");
  expect(blockHtml).not.toContain("10%+");
  expect(blockHtml).toContain("In Possession (Build Up), Out of Possession (Block Defending)");
  expect(blockHtml).not.toContain("In Possession, Out of Possession / Build Up, Block Defending");
  expect(blockHtml).not.toContain("0% / Unavailable");
  expect(blockHtml).toContain('data-presentation-text-field="block.title"');
  expect(blockHtml).toContain('data-presentation-text-field="detail.principles.body"');
  expect(blockHtml).toContain('data-presentation-text-field="players.notInBlock.p2.name"');
  expect(blockHtml).not.toContain("30 min");
  expect(blockHtml).not.toContain("presentation-player-rule");
  expect(blockHtml).not.toContain("Focus");
  expect(blockHtml).not.toContain("5v2");
  expect(blockHtml).toContain("Team Principles & MG Principles");
  expect(blockHtml).toContain("presentation-detail-text");
  expect(blockHtml).toContain("- Scan early\n\n- Play forward when open");
  expect(blockHtml).not.toContain("<ul");
  expect(blockHtml).not.toContain("Coaching Points");
  expect(blockHtml).not.toContain("In this block");
  expect(blockHtml).toContain("Not in this block");
  expect(blockHtml).toContain("(1 Player)");
  expect(blockHtml).not.toContain("Ada Keeper");
  expect(blockHtml).not.toContain("Coach");
  expect(blockHtml).toContain("Bea Mid");
  expect(storage.has(dashboardPresentationStorageKey)).toBe(false);

  controller.writeDeckForDate("2026-06-02", (deck) => ({
    ...deck,
    infoSlides: [{ ...deck.infoSlides[0], title: "Daily Info", body: "- Arrival" }],
  }));

  expect(storage.get(dashboardPresentationStorageKey).decks["2026-06-02"].infoSlides[0]).toMatchObject({
    title: "Daily Info",
    body: "- Arrival",
  });

  controller.writeDeckForDate("2026-06-02", (deck) => ({
    ...deck,
    slideStyles: {
      ...deck.slideStyles,
      cover: {
        theme: "matchday",
        accentColor: "#f59e0b",
        textColor: "#ffffff",
        backgroundColor: "#14110b",
        glowColor: "#d92d3f",
      },
    },
  }));
  const styledModel = controller.buildModel();
  expect(styledModel.slides[0].style).toMatchObject({
    theme: "matchday",
    accentColor: "#f59e0b",
    backgroundColor: "#14110b",
    glowColor: "#d92d3f",
  });
  expect(renderer.renderCoverSlide(styledModel)).toContain("is-theme-matchday");

  controller.writeDeckForDate("2026-06-02", (deck) => ({
    ...deck,
    textOverrides: {
      cover: {
        "cover.title": "Custom Briefing",
      },
      overview: {
        "overview.heading": "Daily Flow",
        "overview.phase.value": "Custom Phase",
        "medical.p1.name": "Display Keeper",
      },
      b1: {
        "block.label": "Block 1 (10%+)",
        "block.title": "Custom Rondo",
        "detail.principles.body": "Play forward\n\nProtect center",
        "players.notInBlock.p2.name": "Display Mid",
        "players.notInBlock.p2.meta": "CM / 0% / Modified",
      },
    },
  }));
  const editableModel = controller.buildModel();
  expect(renderer.renderCoverSlide(editableModel)).toContain("Custom Briefing");
  expect(renderer.renderOverviewSlide(editableModel, editableModel.slides.find((slide) => slide.type === "overview"))).toContain("Daily Flow");
  expect(renderer.renderOverviewSlide(editableModel, editableModel.slides.find((slide) => slide.type === "overview"))).toContain("Custom Phase");
  expect(renderer.renderOverviewSlide(editableModel, editableModel.slides.find((slide) => slide.type === "overview"))).toContain("Display Keeper");
  expect(renderer.renderBlockSlide(editableModel, editableModel.slides.find((slide) => slide.type === "block"))).toContain("Custom Rondo");
  expect(renderer.renderBlockSlide(editableModel, editableModel.slides.find((slide) => slide.type === "block"))).not.toContain("10%+");
  expect(renderer.renderBlockSlide(editableModel, editableModel.slides.find((slide) => slide.type === "block"))).toContain("Play forward");
  expect(renderer.renderBlockSlide(editableModel, editableModel.slides.find((slide) => slide.type === "block"))).toContain("Play forward\n\nProtect center");
  expect(renderer.renderBlockSlide(editableModel, editableModel.slides.find((slide) => slide.type === "block"))).toContain("Display Mid");
  expect(renderer.renderBlockSlide(editableModel, editableModel.slides.find((slide) => slide.type === "block"))).toContain("CM / Modified");
  expect(renderer.renderBlockSlide(editableModel, editableModel.slides.find((slide) => slide.type === "block"))).not.toContain("CM / 0% / Modified");

  controller.writeDeckForDate("2026-06-02", (deck) => ({
    ...deck,
    textBoxes: {
      ...deck.textBoxes,
      cover: [
        { id: "note-1", text: "Free note", x: 50, y: 40, width: 30, fontSize: 32, textColor: "#ffffff" },
        { id: "symbol-1", kind: "symbol", text: "♥", x: 18, y: 18, width: 14, fontSize: 88, textColor: "#ffffff" },
      ],
    },
    shapes: {
      ...deck.shapes,
      cover: [{ id: "shape-1", type: "circle", x: 18, y: 20, width: 10, height: 10, fillColor: "#f59e0b", opacity: 55, strokeColor: "#ffffff" }],
    },
    textFieldStyles: {
      ...deck.textFieldStyles,
      cover: {
        ...(deck.textFieldStyles?.cover || {}),
        "cover.title": { fontSize: 64, textColor: "#38bdf8" },
      },
    },
  }));
  const styledTextModel = controller.buildModel();
  const styledCoverHtml = renderer.renderCoverSlide(styledTextModel);
  expect(styledCoverHtml).toContain("presentation-free-text-box");
  expect(styledCoverHtml).toContain("presentation-shape-layer");
  expect(styledCoverHtml).toContain("presentation-slide-shape is-circle");
  expect(styledCoverHtml).toContain('data-presentation-shape-id="shape-1"');
  expect(styledCoverHtml).toContain('data-presentation-resize-shape="shape-1"');
  expect(styledCoverHtml.match(/data-presentation-resize-shape="shape-1"/g)).toHaveLength(8);
  expect(styledCoverHtml).toContain('data-presentation-resize-axis="nw"');
  expect(styledCoverHtml).toContain('data-presentation-resize-axis="se"');
  expect(styledCoverHtml).toContain("--presentation-shape-fill: #f59e0b");
  expect(styledCoverHtml).toContain("--presentation-shape-opacity: 0.55");
  expect(styledCoverHtml).toContain("presentation-free-text-box-shell");
  expect(styledCoverHtml).toContain("Free note");
  expect(styledCoverHtml).toContain('data-presentation-text-box-id="note-1"');
  expect(styledCoverHtml).toContain('data-presentation-drag-text-box="note-1"');
  expect(styledCoverHtml).toContain('data-presentation-resize-text-box="note-1"');
  expect(styledCoverHtml.match(/data-presentation-resize-text-box="note-1"/g)).toHaveLength(8);
  expect(styledCoverHtml).toContain('data-presentation-text-box-kind="text"');
  expect(styledCoverHtml).toContain('data-presentation-text-box-kind="symbol"');
  expect(styledCoverHtml).toContain('data-presentation-text-box-id="symbol-1" data-presentation-drag-text-box="symbol-1"');
  expect(styledCoverHtml).toContain('data-presentation-resize-text-box="symbol-1"');
  expect(styledCoverHtml.match(/data-presentation-resize-text-box="symbol-1"/g)).toHaveLength(8);
  expect(styledCoverHtml).not.toContain("presentation-text-box-drag-handle");
  expect(styledCoverHtml).toContain("presentation-text-box-edge-handle is-top");
  expect(styledCoverHtml).toContain("presentation-text-box-edge-handle is-left");
  expect(styledCoverHtml).toContain('data-presentation-text-field="textbox.note-1.text"');
  expect(styledCoverHtml).toContain("left: 50%; top: 40%; width: 30%;");
  expect(styledCoverHtml).toContain("--presentation-editable-font-size: 4rem");
  expect(styledCoverHtml).toContain("--presentation-editable-font-size: 2rem");
  expect(styledCoverHtml).toContain("color: #38bdf8;");
  expect(styledCoverHtml).toContain("color: #ffffff;");
  const activeCoverTextHtml = renderer.renderCoverSlide({
    ...styledTextModel,
    activeTextTarget: { slideId: "cover", field: "cover.title" },
  });
  expect(activeCoverTextHtml).toContain('data-presentation-text-object="cover.title"');
  expect(activeCoverTextHtml).toContain('data-presentation-drag-text-field="cover.title"');
  expect(activeCoverTextHtml).toContain('data-presentation-resize-text-field="cover.title"');
  expect(activeCoverTextHtml.match(/data-presentation-resize-text-field="cover.title"/g)).toHaveLength(8);
  expect(renderer.renderCoverSlide({
    ...styledTextModel,
    activeShapeTarget: { slideId: "cover", shapeId: "shape-1" },
    activeTextTarget: { slideId: "cover", textBoxId: "note-1" },
  })).toContain("is-selected");

  controller.writeDeckForDate("2026-06-02", (deck) => ({
    ...deck,
    infoSlides: [],
  }));
  expect(storage.get(dashboardPresentationStorageKey).decks["2026-06-02"].infoSlides).toEqual([]);
  expect(controller.buildModel().slides.map((slide) => slide.type)).toEqual(["cover", "overview", "block"]);
});
