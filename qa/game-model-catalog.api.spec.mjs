import { expect, test } from "@playwright/test";
import {
  defaultGameModelItems,
  gameModelActionForFocus,
  gameModelPositions,
  gameModelSubPhases,
} from "../src/modules/game-model/catalog.mjs";
import { periodizationPhaseLibrary } from "../src/modules/periodization/periodization-state.mjs";

const buildUpActionId = "build-up-6-find-the-free-third-player";

test("the team catalogue starts with existing principles and keeps every IDP role covered", () => {
  expect(gameModelSubPhases.map(({ label }) => label).sort())
    .toEqual(Object.values(periodizationPhaseLibrary).flat().sort());
  expect(new Set(defaultGameModelItems.map(({ id }) => id)).size).toBe(defaultGameModelItems.length);

  const buildUp = defaultGameModelItems.filter(({ subPhaseId }) => subPhaseId === "build-up");
  expect(buildUp).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "team-principle", title: "Break pressure with control to progress play" }),
    expect.objectContaining({ kind: "mini-game-principle", title: "FT3 (Find the Third)" }),
    expect.objectContaining({ kind: "individual-action", id: buildUpActionId, positionIds: ["CMF-6"] }),
  ]));

  for (const subPhase of gameModelSubPhases) {
    const currentActions = defaultGameModelItems.filter((item) => item.subPhaseId === subPhase.id && item.kind === "individual-action");
    for (const position of gameModelPositions) {
      expect(currentActions.some(({ positionIds }) => positionIds.includes(position.id)), `${subPhase.label} / ${position.label}`).toBe(true);
    }
  }
});

test("IDP reads edited team actions and rejects archived or wrong-position links", () => {
  const initial = gameModelActionForFocus(defaultGameModelItems, buildUpActionId, "CMF-6");
  expect(initial).toMatchObject({
    actionId: buildUpActionId,
    positionId: "CMF-6",
    positionLabel: "CMF – 6",
    phase: "In Possession",
    subPhase: "Build Up",
    title: "Find the free third player",
  });

  const teamAction = {
    ...defaultGameModelItems.find(({ id }) => id === buildUpActionId),
    title: "Find the next forward angle",
    when: "The receiving player attracts pressure.",
    positionIds: ["CMF-8"],
    revision: 1,
  };
  const edited = gameModelActionForFocus([teamAction], buildUpActionId, "CMF-8");
  expect(edited).toMatchObject({
    actionId: buildUpActionId,
    positionId: "CMF-8",
    title: "Find the next forward angle",
    when: "The receiving player attracts pressure.",
  });
  expect(gameModelActionForFocus([teamAction], buildUpActionId, "CMF-6")).toBeNull();
  expect(gameModelActionForFocus([{ ...teamAction, archived: true }], buildUpActionId, "CMF-8")).toBeNull();
  expect(initial.title).toBe("Find the free third player");
});
