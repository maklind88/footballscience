import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function readProjectFile(pathname) {
  return readFileSync(resolve(projectRoot, pathname), "utf8");
}

test("Scouting experience system keeps compact responsive navigation and progressive filters", () => {
  const experience = readProjectFile("src/modules/scouting/scouting-experience.css");
  const responsive = readProjectFile("src/modules/scouting/scouting-experience-responsive.css");
  const workspace = readProjectFile("scouting-workspace.js");

  expect(experience).toContain("--scout-radius-lg: 8px");
  expect(experience).toContain("--scout-control-height: 44px");
  expect(experience).toContain("content-visibility: auto");
  expect(experience).toContain("contain-intrinsic-size: auto 1160px");
  expect(responsive).toContain("#scoutingWorkspace .scouting-tab {\n    width: auto !important;");
  expect(responsive).toContain(".scouting-database-quick-filters.is-open > label");
  expect(workspace).toContain('scouting-database-quick-filters${advancedFiltersOpen ? " is-open" : ""}');
  expect(workspace).toContain('quickFilters?.classList.toggle("is-open", isOpen)');
  expect(workspace).toContain('aria-label="Advanced filters"');
  expect(workspace).toContain("const SCOUTING_API_DATABASE_PAGE_LIMIT = 20");
  expect(workspace).toContain("const SCOUTING_DATABASE_PAGE_SIZE = 20");
  expect(workspace).toContain("metricFilterOpen\n                ? `");
});

test("Scouting database readiness is explicit and uses a restrained progress state", () => {
  const controller = readProjectFile("src/modules/scouting/scouting-database-background-controller.mjs");
  const databaseRenderer = readProjectFile("src/modules/scouting/scouting-database.mjs");
  const workspace = readProjectFile("scouting-workspace.js");

  expect(controller).toContain("scheduleAutoLoad(delayMs = 320)");
  expect(workspace).toContain("scheduleScoutingDatabaseAutoLoad(delayMs = 320)");
  expect(workspace).toContain("createScoutingDatabaseCapabilityService");
  expect(workspace).toContain("loadScoutingPreferredDatabase");
  expect(workspace).toContain("renderActiveTabSurfaceOrWorkspace: renderScoutingLoadedDatabaseSurface");
  expect(workspace).toContain("renderScoutingProfileModalIntoDom(state.selectedRecordId)");
  expect(databaseRenderer).toContain('class="scouting-database-progress"');
  expect(databaseRenderer).toContain("Preparing player database");
  expect(databaseRenderer).not.toContain("scouting-loader-player");
});

test("Scouting mobile boards stack without absolute-position overlap", () => {
  const responsive = readProjectFile("src/modules/scouting/scouting-experience-responsive.css");

  expect(responsive).toContain(
    "#scoutingWorkspace :where(.scouting-shadow-layout, .scouting-my-team-layout) {\n    grid-template-columns: minmax(0, 1fr);"
  );
  expect(responsive).toContain("@media (max-width: 560px)");
  expect(responsive).toContain(
    "#scoutingWorkspace :where(.scouting-my-team-pitch, .scouting-shadow-pitch) .scouting-shadow-slot {\n    position: relative;"
  );
  expect(responsive).toContain("min-height: max-content;");
  expect(responsive).toContain("transform: none !important;");
});

test("Scouting product layer keeps premium surfaces restrained and mobile controls complete", () => {
  const product = readProjectFile("src/modules/scouting/scouting-product.css");
  const responsive = readProjectFile("src/modules/scouting/scouting-product-responsive.css");
  const database = readProjectFile("src/modules/scouting/scouting-database.mjs");
  const lists = readProjectFile("src/modules/scouting/scouting-lists.mjs");
  const comparison = readProjectFile("src/modules/scouting/scouting-comparison.mjs");
  const reports = readProjectFile("src/modules/scouting/scouting-reports.mjs");
  const theme = readProjectFile("src/modules/scouting/scouting-theme.css");

  expect(product).toContain(".scouting-database-toolbar");
  expect(product).toContain(".scouting-reports-tools");
  expect(product).toContain(".scouting-record-mini-radar-popover {\n  pointer-events: none;");
  expect(product).not.toMatch(/linear-gradient|letter-spacing:\s*-/);
  expect(responsive).toContain("grid-template-columns: repeat(2, minmax(0, 1fr)) !important;");
  expect(responsive).toContain(
    "#scoutingWorkspace :where(.scouting-my-team-pitch, .scouting-shadow-pitch) {\n    grid-template-columns: repeat(2, minmax(0, 1fr));"
  );
  expect(responsive).toContain("#scoutingWorkspace .scouting-record-best-role {\n    width: calc(100% - 144px);");
  expect(responsive).toContain("#scoutingWorkspace .scouting-record-card-recommendation {\n    grid-column: 1 / span 2;");
  expect(responsive).toContain("#scoutingWorkspace .scouting-reports-list-head {\n    align-items: stretch;");
  expect(responsive).toContain("grid-template-columns: repeat(4, minmax(0, 1fr));");
  expect(responsive).toContain("background: var(--scout-panel) !important;");
  expect(database).toContain('class="scouting-database-toolbar"');
  expect(lists).toContain("data-scouting-open-database");
  expect(comparison.match(/Add at least two players to begin\./g)).toHaveLength(2);
  expect(reports).toContain('class="scouting-reports-tools"');
  expect(theme).toContain(".scouting-radar-head,\n  .scouting-profile-spider-context,\n  .scouting-database-page-jump");
  expect(theme).toContain(".scouting-role-model-toolbar > span");
  expect(theme).toContain(".scouting-record-avatar-fallback");
});
