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

test("Home links the next match squad and Starting XI to their Presentation source without exposing the lineup", () => {
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
    startingXiCount: 11,
    matchSquadCount: 11,
    hasStartingXi: true,
    hasMatchSquad: true,
    status: "ready",
    source: "Presentation",
    sourceDate: "2026-08-27",
    routes: {
      matchSquad: { dateValue: "2026-08-27", meetingType: "team", target: "match-squad" },
      startingXi: { dateValue: "2026-08-27", meetingType: "team", target: "starting-xi" },
    },
  });

  const html = renderHomeUpcomingLineupCard({ upcomingLineup: model }, (value) => String(value ?? ""));
  expect(html).toContain('aria-label="Upcoming match selection"');
  expect(html).toContain("<h2>NCC - Boston</h2>");
  expect(html).not.toContain("<h2>Team Selection</h2>");
  expect(html).not.toContain("<strong>NCC - Boston</strong>");
  expect(html).not.toContain("dashboard-match-gateway-summary");
  expect(html).not.toContain("Prepare the matchday squad");
  expect(html).toContain("11 selected");
  expect(html).toContain("11/11");
  expect(html).toContain('data-match-selection-target="match-squad"');
  expect(html).toContain('data-match-selection-target="starting-xi"');
  expect(html).toContain('data-match-selection-date="2026-08-27"');
  expect(html).not.toContain("GK Player");
  expect(html).not.toContain("dashboard-lineup-pitch");
  expect(html).not.toContain('data-open-workspace="gameplan"');
});

test("Home routes separately saved squad and lineup selections to the correct meeting decks", () => {
  const nextMatch = { id: "match-gotham", date: "2026-09-06", type: "match", title: "NCC - Gotham" };
  const model = selectHomeUpcomingLineup({
    nextMatch,
    scheduleMatches: [nextMatch],
    players,
    presentationState: {
      decks: {
        "2026-09-04": {
          updatedAt: "2026-09-04T09:00:00.000Z",
          infoSlides: [{ layout: "match-squad", matchSquadPlayerIds: players.slice(0, 7).map((player) => player.id) }],
        },
      },
      meetingDecks: {
        technical: {
          "2026-09-05": {
            updatedAt: "2026-09-05T14:00:00.000Z",
            infoSlides: [{ layout: "starting-xi", formation: "4-3-3", lineup: lineupAssignments }],
          },
        },
      },
    },
  });

  expect(model.matchSquadCount).toBe(7);
  expect(model.startingXiCount).toBe(11);
  expect(model.routes.matchSquad).toEqual({ dateValue: "2026-09-04", meetingType: "team", target: "match-squad" });
  expect(model.routes.startingXi).toEqual({ dateValue: "2026-09-05", meetingType: "technical", target: "starting-xi" });
});

test("Home creates the match squad on matchday and Starting XI on MD-1", () => {
  const nextMatch = { id: "match-angel-city", date: "2026-08-26", type: "match", title: "NCC - Angel City" };
  const emptyModel = selectHomeUpcomingLineup({ nextMatch, scheduleMatches: [nextMatch], players });

  expect(emptyModel.routes.matchSquad).toEqual({ dateValue: "2026-08-26", meetingType: "team", target: "match-squad" });
  expect(emptyModel.routes.startingXi).toEqual({ dateValue: "2026-08-25", meetingType: "team", target: "starting-xi" });

  const squadOnlyModel = selectHomeUpcomingLineup({
    nextMatch,
    scheduleMatches: [nextMatch],
    players,
    presentationState: {
      decks: {
        "2026-08-26": {
          infoSlides: [{ layout: "match-squad", matchSquadPlayerIds: players.map((player) => player.id) }],
        },
      },
    },
  });
  expect(squadOnlyModel.routes.matchSquad.dateValue).toBe("2026-08-26");
  expect(squadOnlyModel.routes.startingXi.dateValue).toBe("2026-08-25");

  const html = renderHomeUpcomingLineupCard({ upcomingLineup: emptyModel }, (value) => String(value ?? ""));
  expect(html).toContain("matchday squad");
  expect(html).toContain("MD-1");
  expect(html).toContain('data-match-selection-date="2026-08-26"');
  expect(html).toContain('data-match-selection-date="2026-08-25"');
});

test("Home keeps Schedule and saved match history available when no future match exists", () => {
  const historyItem = {
    title: "NCC - Portland",
    meta: "Sat 22 Aug · 18:00",
    formationLabel: "4-3-3",
    startingXiCount: 11,
    matchSquadCount: 18,
    hasStartingXi: true,
    hasMatchSquad: true,
    startingXiStatus: "ready",
    matchSquadStatus: "partial",
    routes: {
      matchSquad: { dateValue: "2026-08-20", meetingType: "team", target: "match-squad" },
      startingXi: { dateValue: "2026-08-20", meetingType: "team", target: "starting-xi" },
    },
  };
  const model = selectHomeUpcomingLineup({ history: [historyItem] });
  const html = renderHomeUpcomingLineupCard({ upcomingLineup: model }, (value) => String(value ?? ""));

  expect(model).toMatchObject({ hasMatch: false, selectedCount: 0, status: "missing" });
  expect(html).toContain("No upcoming match");
  expect(html).toContain("Previous matches");
  expect(html).toContain("NCC - Portland");
  expect(html).toContain('data-match-selection-create="false"');
  expect(html).toContain('data-open-workspace="schedule"');
  expect(html).not.toContain('data-open-workspace="gameplan"');
});
