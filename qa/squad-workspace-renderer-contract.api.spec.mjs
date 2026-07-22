import { expect, test } from "@playwright/test";
import { createSquadWorkspaceRenderer } from "../src/modules/squad/index.mjs";

const renderer = createSquadWorkspaceRenderer({
  escapeHtml: (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
});

test("Squad workspace renderer owns message and pending import markup", () => {
  const messageMarkup = renderer.renderMessage({
    status: "warning",
    lines: ["Review import"],
    items: ["Row 1: duplicate"],
  });
  const importMarkup = renderer.renderPendingImport(
    { sourceRows: 2, canApply: true },
    { status: "success", lines: ["2 rows evaluated"], items: ["Row 1: CREATE"] },
    true
  );

  expect(messageMarkup).toContain("is-warning");
  expect(messageMarkup).toContain("Row 1: duplicate");
  expect(importMarkup).toContain("Import preview");
  expect(importMarkup).toContain("Source rows: 2");
  expect(importMarkup).toContain("Apply previewed import");
  expect(importMarkup).not.toContain("disabled");
});

test("Squad workspace renderer owns squad shell and filter controls", () => {
  const birthdayCalendarMarkup = renderer.renderBirthdayCalendar({
    items: [
      {
        id: "p8",
        name: "Ada Midfielder",
        number: "8",
        primaryRole: "8",
        dateLabel: "Jul 24",
        relativeLabel: "In 2 days",
        turningAge: 25,
      },
    ],
    next: {
      id: "p8",
      name: "Ada Midfielder",
      dateLabel: "Jul 24",
      relativeLabel: "In 2 days",
      turningAge: 25,
    },
    thisMonthCount: 1,
    trackedCount: 2,
    withBirthDateCount: 1,
    missingBirthDateCount: 1,
  });
  const markup = renderer.renderWorkspace({
    birthdayCalendarMarkup,
    canEdit: false,
    messageMarkup: '<div data-message></div>',
    newPlayerModalMarkup: '<section data-new-player></section>',
    pendingImportMarkup: '<section data-import></section>',
    playerModalMarkup: '<section data-player-modal></section>',
    roleGroupFilter: "midfield",
    roleGroupOptionsMarkup: '<option value="midfield" selected>Midfield</option>',
    rosterFilterOptionsMarkup: '<option value="squad" selected>Squad</option>',
    rosterSectionsMarkup: '<table data-roster></table>',
    searchQuery: "Mak",
    teamLogoMarkup: '<span data-logo></span>',
    teamName: "North Carolina Courage",
  });

  expect(markup).toContain("Squad Room");
  expect(markup).toContain("North Carolina Courage");
  expect(markup).toContain('value="Mak"');
  expect(markup).toContain("data-player-profile-new-open");
  expect(markup).toContain("disabled");
  expect(markup).toContain("Birthday Calendar");
  expect(markup).toContain("Ada Midfielder");
  expect(markup).toContain('data-player-profile-select="p8"');
  expect(markup).toContain("data-roster");
  expect(markup).toContain("data-player-modal");
});
