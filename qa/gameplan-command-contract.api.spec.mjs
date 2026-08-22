import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  buildGameplanPreparation,
  resolveGameplanPhaseKeys,
} from "../src/modules/gameplan/gameplan-preparation-selectors.mjs";
import { resolveGameplanPresentationLineup } from "../src/modules/gameplan/gameplan-presentation-adapter.mjs";

const gameplanStateSource = readFileSync(new URL("../gameplan-state.js", import.meta.url), "utf8");
const gameplanState = await import(`data:text/javascript;base64,${Buffer.from(gameplanStateSource).toString("base64")}`);
const { createGameplanFromMatch, gameplanCommandPhaseKeys, normalizeGameplan } = gameplanState;

test("Gameplan uses four explicit phases without transition guessing or Set Pieces", () => {
  expect(gameplanCommandPhaseKeys).toEqual([
    "inPossession",
    "outOfPossession",
    "attackingTransition",
    "defensiveTransition",
  ]);
  expect(resolveGameplanPhaseKeys({ phase: "Offensive Transition" })).toEqual(["attackingTransition"]);
  expect(resolveGameplanPhaseKeys({ phase: "Attacking Transition" })).toEqual(["attackingTransition"]);
  expect(resolveGameplanPhaseKeys({ phase: "Defensive Transition" })).toEqual(["defensiveTransition"]);
  expect(resolveGameplanPhaseKeys({ phase: "Set Pieces", subPhase: "Offensive Set Pieces" })).toEqual([]);
});

test("Gameplan preparation reads structured weekly principles and excludes Set Pieces", () => {
  const preparation = buildGameplanPreparation({
    plan: { date: "2026-08-22" },
    periodizationState: {
      days: {
        "2026-08-19": {
          matchPhases: ["Defensive Transition"],
          subPhases: ["Defensive Transition"],
          teamPrinciples: ["Delay the opponent to allow recovery"],
          miniGamePrinciples: ["First 3 steps"],
          mainFocus: "Control after loss",
        },
        "2026-08-20": {
          matchPhases: ["Offensive Transition"],
          subPhases: ["Offensive Transition"],
          teamPrinciples: ["Attack immediately after regaining the ball"],
          miniGamePrinciples: [],
        },
        "2026-08-21": {
          matchPhases: ["Set Pieces"],
          subPhases: ["Offensive Set Pieces"],
          teamPrinciples: ["Create a clear scoring threat from set pieces"],
          miniGamePrinciples: [],
        },
      },
    },
    sessionState: {
      sessions: {
        "2026-08-18": {
          title: "Build up",
          blocks: [
            {
              id: "block-1",
              title: "Build through pressure",
              phase: "In Possession",
              subPhase: "Build Up",
              principles: "Break pressure with control to progress play",
            },
          ],
        },
      },
    },
  });

  expect(preparation.days.map((day) => day.mdLabel)).toEqual(["MD-5", "MD-4", "MD-3", "MD-2", "MD-1"]);
  expect(preparation.teamCandidates.map((item) => [item.phaseKey, item.principle])).toEqual(
    expect.arrayContaining([
      ["inPossession", "Break pressure with control to progress play"],
      ["attackingTransition", "Attack immediately after regaining the ball"],
      ["defensiveTransition", "Delay the opponent to allow recovery"],
    ])
  );
  expect(preparation.entries.some((entry) => entry.principle.includes("set pieces"))).toBe(false);
  expect(preparation.miniGameCandidates).toEqual([
    expect.objectContaining({ phaseKey: "defensiveTransition", principle: "First 3 steps" }),
  ]);
});

test("Gameplan reads the relevant Presentation XI and derives the bench from Match Squad", () => {
  const players = Array.from({ length: 14 }, (_, index) => ({ id: `p${index + 1}`, name: `Player ${index + 1}` }));
  const scheduleMatches = [
    { id: "match-1", date: "2026-08-22", time: "16:00" },
    { id: "match-2", date: "2026-08-29", time: "16:00" },
  ];
  const lineup = {
    gk: "p1",
    lb: "p2",
    lcb: "p3",
    rcb: "p4",
    rb: "p5",
    lcm: "p6",
    cm: "p7",
    rcm: "p8",
    lw: "p9",
    st: "p10",
    rw: "p11",
  };
  const presentationState = {
    decks: {
      "2026-08-18": {
        updatedAt: "2026-08-20T10:00:00.000Z",
        infoSlides: [
          { layout: "match-squad", matchSquadPlayerIds: players.slice(0, 14).map((player) => player.id) },
          { layout: "starting-xi", formation: "4-3-3", lineup },
        ],
      },
      "2026-08-25": {
        updatedAt: "2026-08-25T10:00:00.000Z",
        infoSlides: [{ layout: "starting-xi", formation: "4-4-2", lineup: { gk: "p14" } }],
      },
    },
  };

  const selection = resolveGameplanPresentationLineup({
    presentationState,
    scheduleMatches,
    plan: { matchEventId: "match-1", date: "2026-08-22", lineup: {} },
    players,
  });

  expect(selection.source).toBe("Presentation");
  expect(selection.sourceDate).toBe("2026-08-18");
  expect(selection.formationLabel).toBe("4-3-3");
  expect(selection.startingPlayerIds).toHaveLength(11);
  expect(selection.benchPlayerIds).toEqual(["p12", "p13", "p14"]);
  expect(selection.status).toBe("ready");
});

test("new Gameplans start empty instead of seeding synthetic coaching content", () => {
  const plan = createGameplanFromMatch({
    id: "match-1",
    title: "NCC - Boston",
    date: "2026-08-22",
  });

  expect(plan.scenarioCards).toEqual([]);
  expect(plan.staffResponsibilities).toEqual([]);
  expect(plan.checklist).toEqual([]);
  expect(plan.meeting.agenda).toBe("");
  expect(plan.matchFocus.focusItems).toEqual([]);
});

test("saved tactical principles migrate into explicit match focus without Set Pieces", () => {
  const plan = normalizeGameplan({
    id: "legacy-plan",
    title: "Legacy match",
    tactical: {
      inPossession: "Create the free player behind their first line.",
      defensiveTransition: "Protect the centre before pressing the ball.",
      setPieces: "Legacy corner routine.",
    },
  });

  expect(plan.matchFocus.focusItems).toEqual([
    expect.objectContaining({
      phaseKey: "inPossession",
      principle: "Create the free player behind their first line.",
      sourceRefs: [expect.objectContaining({ label: "Saved Gameplan" })],
    }),
    expect.objectContaining({
      phaseKey: "defensiveTransition",
      principle: "Protect the centre before pressing the ball.",
    }),
  ]);
  expect(plan.matchFocus.focusItems.some((item) => item.phaseKey === "setPieces")).toBe(false);
  expect(plan.tactical.setPieces).toBe("Legacy corner routine.");
});
