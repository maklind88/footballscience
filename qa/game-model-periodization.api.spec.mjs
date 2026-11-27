import { expect, test } from "@playwright/test";
import { defaultGameModelItems } from "../src/modules/game-model/catalog.mjs";
import { createPeriodizationRenderer } from "../src/modules/periodization/periodization-renderer.mjs";

const date = "2026-11-26";

function makeRenderer(day, catalog) {
  return createPeriodizationRenderer({
    getDay: () => day,
    getGameModelCatalog: () => catalog,
    getMultiSelectOpenField: () => "miniGamePrinciples",
  });
}

test("Periodization offers active team catalog principles in the selected sub-phase", () => {
  const teamTitle = "Team training theme";
  const miniTitle = "Current mini principle";
  const items = [
    { kind: "team-principle", subPhaseId: "build-up", title: teamTitle },
    { kind: "mini-game-principle", subPhaseId: "build-up", title: miniTitle },
    { kind: "mini-game-principle", subPhaseId: "build-up", title: "Archived principle", archived: true },
    { kind: "individual-action", subPhaseId: "build-up", title: "Player instruction" },
    { kind: "mini-game-principle", subPhaseId: "high-press", title: "Different sub-phase" },
  ];
  const day = { subPhases: ["Build Up"] };
  const renderer = makeRenderer(day, { items });
  expect(renderer.getMultiFieldOptions("teamPrinciples", date)).toEqual([teamTitle]);
  expect(renderer.getMultiFieldOptions("miniGamePrinciples", date)).toEqual([miniTitle]);
  expect(renderer.renderMultiFieldForDate("miniGamePrinciples", date)).toContain(`value="${miniTitle}"`);
  expect(makeRenderer(day, { items: [] }).getMultiFieldOptions("teamPrinciples", date)).toEqual([]);
  expect(makeRenderer(day, null).getMultiFieldOptions("miniGamePrinciples", date)).toContain("FT3 (Find the Third)");
});

test("Periodization resolves older combined High Press and Throw Ins labels", () => {
  const items = defaultGameModelItems;
  const highPress = makeRenderer({ subPhases: ["High Press"] }, { items });
  const combinedHighPress = makeRenderer({ subPhases: ["High Press vs GK & High Press"] }, { items });
  const teamPrinciples = highPress.getMultiFieldOptions("teamPrinciples", date);
  expect(teamPrinciples).toContain("Protect the centre first and then win the ball");
  expect(combinedHighPress.getMultiFieldOptions("teamPrinciples", date)).toEqual(teamPrinciples);

  const combinedThrowIns = makeRenderer({ subPhases: ["Throw Ins (Off & Def)"] }, { items });
  const miniPrinciples = combinedThrowIns.getMultiFieldOptions("miniGamePrinciples", date);
  expect(miniPrinciples).toContain("Quick restart");
  expect(miniPrinciples).toContain("Duels 1v1");
});

test("Selecting a current principle keeps the historical label on an older day", () => {
  const historical = "Defend in 2,5 corridors.";
  const replacement = "Defend in two and a half corridors";
  const day = { subPhases: ["Throw Ins (Def)"], miniGamePrinciples: [historical] };
  const items = [{ kind: "mini-game-principle", subPhaseId: "throw-ins-def", title: replacement }];
  const renderer = makeRenderer(day, { items });
  const markup = renderer.renderMultiFieldForDate("miniGamePrinciples", date);
  expect(markup).toContain(`value="${historical}"`);
  expect(markup).toContain(`value="${replacement}"`);
  const field = {
    dataset: { periodizationField: "miniGamePrinciples" },
    closest: () => ({
      querySelectorAll: () => [{ value: replacement, checked: true }],
      querySelector: () => ({ value: historical }),
    }),
  };
  expect(renderer.getMultiFieldValue(field, date)).toEqual([replacement, historical]);
  expect(day.miniGamePrinciples).toEqual([historical]);
});
