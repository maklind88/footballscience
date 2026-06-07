import { expect, test } from "@playwright/test";
import { createSessionPlannerWorkspaceRenderer } from "../src/modules/session-planner/index.mjs";

test("Session Planner workspace renderer keeps shell, builder, tools, and history contracts", () => {
  const block = { id: "b1", label: "Block 1", title: "Pressing Wave", focus: "Counter-press" };
  const renderer = createSessionPlannerWorkspaceRenderer({
    escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    periodizationOptionLibrary: { matchPhases: ["Attack"], subPhases: ["Build up"] },
    renderSessionPlannerActionIcon: (name) => `<span data-icon="${name}"></span>`,
    renderSessionPlannerBlockList: () => '<article data-session-block="b1">Block</article>',
    renderSessionPlannerDateStrip: () => '<button data-session-date="2026-05-31">31</button>',
    renderSessionPlannerEditableField: (_block, key) => `<label data-session-editable="${key}"></label>`,
    renderSessionPlannerExerciseVisual: () => '<div data-session-visual></div>',
    renderSessionPlannerHeaderField: (_block, key) => `<textarea data-session-field="${key}"></textarea>`,
    renderSessionPlannerLibraryOverlay: () => '<section data-library-overlay></section>',
    renderSessionPlannerLibrarySaveConflictOverlay: () => '<section data-library-conflict></section>',
    renderSessionPlannerMedicalAvailability: () => '<section class="session-medical-availability"></section>',
    renderSessionPlannerPeriodizationOverlay: () => '<section data-periodization-overlay></section>',
    renderSessionPlannerPeriodizationSummary: () => '<section data-periodization-summary></section>',
    renderSessionPlannerPlayerBoard: () => '<section data-player-board></section>',
    renderSessionPlannerPlayerBoardOverlay: () => '<section data-player-board-overlay></section>',
    renderSessionPlannerPostSessionNotesCard: () => '<article data-post-notes></article>',
    renderSessionPlannerPrintOverlay: () => '<section data-print-overlay></section>',
    renderSessionPlannerTacticalboardOverlay: () => '<section data-tactical-overlay></section>',
    renderSessionPlannerVisualPreviewOverlay: () => '<section data-visual-preview></section>',
  });

  const historyContext = {
    entries: [
      {
        id: "h1",
        action: "session.updated",
        beforeBlockCount: 1,
        afterBlockCount: 2,
        beforeSession: {},
        createdAt: "2026-05-31T12:00:00.000Z",
        date: "2026-05-31",
        actor: { name: "Mak" },
      },
    ],
    isAdmin: true,
    loadedDate: "2026-05-31",
    open: true,
    selectedDate: "2026-05-31",
    formatHistoryTime: () => "31 May",
    getHistoryActionLabel: () => "Updated",
    getHistoryActorLabel: () => "Mak",
  };

  const html = renderer.renderWorkspace({
    addMenuOpen: true,
    block,
    historyContext,
    isAdmin: true,
    selectedDate: "2026-05-31",
    selectedDateLabel: "Sunday, 31 May",
    session: { blocks: [block] },
    sessionMatchDayLabel: "MD -1",
    sessionTitle: "Training",
    sessionTotalMinutes: 75,
  });

  expect(html).toContain("session-planner-hero");
  expect(html).toContain("data-session-add-new");
  expect(html).toContain("data-session-save-exercise");
  expect(html).toContain('data-session-delete-block="b1"');
  expect(html).toContain("session-tools-card");
  expect(html).toContain("data-session-preview-visual");
  expect(html).toContain("data-session-restore-history");
  expect(html).toContain("data-print-overlay");

  const emptyTools = renderer.renderToolsPanel(null, historyContext);
  expect(emptyTools).toContain("Select a block");
  expect(emptyTools).toContain("session-history-panel");
});
