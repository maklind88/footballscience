import { expect, test } from "@playwright/test";
import {
  renderHomeUpcomingLineupCard,
  selectHomeUpcomingLineup,
} from "../src/modules/home/upcoming-lineup-card.mjs";

const formationSlots = ["gk", "lb", "lcb", "rcb", "rb", "lcm", "cm", "rcm", "lw", "st", "rw"];
const players = formationSlots.map((slot, index) => ({
  id: `player-${index + 1}`,
  name: `${slot.toUpperCase()} Player`,
  number: String(index + 1),
}));
const lineupAssignments = Object.fromEntries(formationSlots.map((slot, index) => [slot, players[index].id]));

test("Home resolves the next match Starting XI from Presentation without creating a second data source", () => {
  const nextMatch = {
    id: "match-boston",
    date: "2026-08-29",
    time: "19:00",
    type: "match",
    title: "NCC - Boston",
  };
  const model = selectHomeUpcomingLineup({
    nextMatch,
    scheduleMatches: [nextMatch],
    players,
    dateLabel: "Sat 29 Aug",
    relativeLabel: "Sat 29 Aug",
    presentationState: {
      decks: {
        "2026-08-27": {
          updatedAt: "2026-08-27T15:00:00.000Z",
          infoSlides: [
            { layout: "starting-xi", formation: "4-3-3", lineup: lineupAssignments },
            { layout: "match-squad", matchSquadPlayerIds: players.map((player) => player.id) },
          ],
        },
      },
    },
  });

  expect(model).toMatchObject({
    hasMatch: true,
    matchId: "match-boston",
    title: "NCC - Boston",
    meta: "Sat 29 Aug · 19:00",
    formationLabel: "4-3-3",
    selectedCount: 11,
    status: "ready",
    source: "Presentation",
    sourceDate: "2026-08-27",
  });
  expect(model.slots).toHaveLength(11);
  expect(model.slots.find((slot) => slot.id === "gk")?.player?.name).toBe("GK Player");

  const html = renderHomeUpcomingLineupCard({ upcomingLineup: model }, (value) => String(value ?? ""));
  expect(html).toContain('aria-label="Upcoming match starting eleven"');
  expect(html).toContain("NCC - Boston");
  expect(html).toContain("11/11");
  expect(html).toContain("GK Player, GK");
  expect(html).toContain('data-open-workspace="gameplan"');
});

test("Home keeps the Starting XI card useful when no match is scheduled", () => {
  const model = selectHomeUpcomingLineup();
  const html = renderHomeUpcomingLineupCard({ upcomingLineup: model }, (value) => String(value ?? ""));

  expect(model).toMatchObject({ hasMatch: false, selectedCount: 0, status: "missing" });
  expect(model.slots).toHaveLength(11);
  expect(html).toContain("No upcoming match");
  expect(html).toContain("Schedule a match to prepare the lineup");
  expect(html).toContain('data-open-workspace="schedule"');
  expect(html).not.toContain('data-open-workspace="gameplan"');
});
