import { expect, test } from "@playwright/test";
import { createScoutingDatabasePagingRenderer } from "../src/modules/scouting/index.mjs";

function createHarness(options = {}) {
  const state = {
    databaseFilters: {
      fsdbCursorStack: Array.isArray(options.fsdbCursorStack) ? options.fsdbCursorStack : [],
    },
  };
  const renderer = createScoutingDatabasePagingRenderer({
    ensureState: () => state,
    escapeHtml: (value = "") =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;"),
    normalizeDatabaseFilters: (filters = {}) => ({
      fsdbCursorStack: Array.isArray(filters.fsdbCursorStack) ? filters.fsdbCursorStack : [],
    }),
    pageSize: 50,
  });
  return { renderer, state };
}

test("Scouting database paging renderer stays quiet for short local result sets", () => {
  const { renderer } = createHarness();

  expect(renderer.render({ mode: "local", total: 50, offset: 0, limit: 50 })).toBe("");
});

test("Scouting database paging renderer renders local page controls", () => {
  const { renderer } = createHarness();

  const html = renderer.render({ mode: "local", total: 125, offset: 50, limit: 50 });

  expect(html).toContain("Showing 51-100 of 125");
  expect(html).toContain('data-scouting-page-offset="0"');
  expect(html).toContain('data-scouting-page-offset="100"');
  expect(html).toContain('max="3"');
  expect(html).toContain('value="2"');
});

test("Scouting database paging renderer renders paged API and worker controls", () => {
  const { renderer } = createHarness();

  const html = renderer.render({ mode: "api", total: 180, returned: 50, offset: 100, limit: 50, nextOffset: 150, hasMore: true });

  expect(html).toContain("Showing 101-150 of 180");
  expect(html).toContain('data-scouting-page-offset="50"');
  expect(html).toContain('data-scouting-page-offset="150"');
  expect(html).toContain('value="3"');
  expect(html).toContain("/ 4");
});

test("Scouting database paging renderer disables empty paged pages", () => {
  const { renderer } = createHarness();

  expect(renderer.render({ mode: "api", returned: 0, offset: 0, limit: 50, hasMore: true })).toBe("");
  expect(renderer.render({ mode: "fsdb", returned: 0, limit: 50, hasMore: true })).toBe("");
});

test("Scouting database paging renderer renders Football Science DB cursor controls", () => {
  const { renderer } = createHarness({ fsdbCursorStack: ["__first__", "cursor-1"] });

  const html = renderer.render({ mode: "fsdb", total: 0, returned: 50, limit: 50, hasMore: true, nextCursor: 'cursor-"next"' });

  expect(html).toContain("Showing 50 FS DB players");
  expect(html).toContain('aria-label="Football Science DB page"');
  expect(html).toContain('value="3"');
  expect(html).toContain('data-scouting-page-cursor="previous"');
  expect(html).toContain('data-scouting-next-cursor="cursor-&quot;next&quot;"');
  expect(html).not.toContain('data-scouting-page-cursor="previous" disabled');
});

test("Scouting database paging renderer disables unavailable Football Science DB cursor controls", () => {
  const { renderer } = createHarness();

  const html = renderer.render({ mode: "fsdb", total: 50, returned: 50, limit: 50, hasMore: false, nextCursor: "" });

  expect(html).toContain("Showing 50 FS DB players of 50");
  expect(html).toContain('data-scouting-page-cursor="previous" disabled');
  expect(html).toContain('data-scouting-page-cursor="next" data-scouting-next-cursor="" disabled');
});
