import {
  getPresentationLineupFormation,
  normalizePresentationLineupAssignments,
  normalizePresentationMatchSquadPlayerIds,
} from "../presentation-mode/presentation-lineup-contract.mjs";

function parseDate(value = "") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDaysBetween(fromValue = "", toValue = "") {
  const from = parseDate(fromValue);
  const to = parseDate(toValue);
  if (!from || !to) return Number.POSITIVE_INFINITY;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function getDeckSlides(deck = {}) {
  return Array.isArray(deck.infoSlides) ? deck.infoSlides : [];
}

function deckContainsLineup(deck = {}) {
  return getDeckSlides(deck).some((slide) => slide?.layout === "starting-xi" || slide?.layout === "match-squad");
}

function deckContainsLayout(deck = {}, layout = "") {
  return getDeckSlides(deck).some((slide) => slide?.layout === layout);
}

function findNextMatch(deckDate = "", scheduleMatches = []) {
  return scheduleMatches
    .filter((match) => {
      const days = getDaysBetween(deckDate, match.date);
      return days >= 0 && days <= 14;
    })
    .sort((first, second) => `${first.date || ""} ${first.time || ""}`.localeCompare(`${second.date || ""} ${second.time || ""}`))[0] || null;
}

function deckMatchesPlan(deckDate = "", deck = {}, plan = {}, scheduleMatches = []) {
  const targetMatchId = String(plan.matchEventId || "").trim();
  const explicitIds = unique([
    deck.matchEventId,
    ...getDeckSlides(deck).map((slide) => slide?.matchEventId),
  ]);
  if (targetMatchId && explicitIds.includes(targetMatchId)) return true;
  if (plan.date && deckDate === plan.date) return true;
  const nextMatch = findNextMatch(deckDate, scheduleMatches);
  if (!nextMatch) return false;
  if (targetMatchId) return String(nextMatch.id || "") === targetMatchId;
  return Boolean(plan.date && nextMatch.date === plan.date);
}

function getDeckRecency(deckDate = "", deck = {}) {
  const timestamp = Date.parse(String(deck.updatedAt || ""));
  if (Number.isFinite(timestamp)) return timestamp;
  return parseDate(deckDate)?.getTime() || 0;
}

function getPlayerMap(players = []) {
  return new Map(players.map((player) => [String(player.id || ""), player]));
}

function buildSelection({
  sourceDate = "",
  sourceMeetingType = "team",
  deck = {},
  plan = {},
  players = [],
  source = "Presentation",
} = {}) {
  const slides = getDeckSlides(deck);
  const startingSlide = [...slides].reverse().find((slide) => slide?.layout === "starting-xi") || null;
  const matchSquadSlides = slides.filter((slide) => slide?.layout === "match-squad");
  const formation = getPresentationLineupFormation(startingSlide?.formation || plan.lineup?.formation);
  const assignments = normalizePresentationLineupAssignments(startingSlide?.lineup);
  const playerById = getPlayerMap(players);
  const slots = formation.slots.map((slot) => {
    const playerId = assignments[slot.id] || "";
    return { ...slot, playerId, player: playerById.get(playerId) || null };
  });
  const startingPlayerIds = unique(slots.map((slot) => slot.playerId)).slice(0, 11);
  const startingSet = new Set(startingPlayerIds);
  const matchSquadPlayerIds = unique(
    matchSquadSlides
      .flatMap((slide) => normalizePresentationMatchSquadPlayerIds(slide.matchSquadPlayerIds))
  );
  const benchPlayerIds = matchSquadPlayerIds.filter((playerId) => !startingSet.has(playerId));
  return {
    source,
    sourceDate,
    sourceMeetingType,
    hasStartingXi: Boolean(startingSlide),
    hasMatchSquad: Boolean(matchSquadSlides.length),
    formationId: formation.id,
    formationLabel: formation.label,
    slots,
    startingPlayerIds,
    matchSquadPlayerIds,
    benchPlayerIds,
    startingPlayers: startingPlayerIds.map((playerId) => playerById.get(playerId)).filter(Boolean),
    benchPlayers: benchPlayerIds.map((playerId) => playerById.get(playerId)).filter(Boolean),
    status: startingPlayerIds.length === 11 ? "ready" : startingPlayerIds.length ? "partial" : "missing",
  };
}

function buildLegacySelection(plan = {}, players = []) {
  const lineup = plan.lineup || {};
  const formation = getPresentationLineupFormation(lineup.formation);
  const startingPlayerIds = unique(lineup.startingPlayerIds).slice(0, 11);
  const assignments = Object.fromEntries(formation.slots.map((slot, index) => [slot.id, startingPlayerIds[index] || ""]));
  return buildSelection({
    sourceDate: plan.date || "",
    source: "Legacy Gameplan",
    plan,
    players,
    deck: {
      infoSlides: [
        { layout: "starting-xi", formation: formation.id, lineup: assignments },
        { layout: "match-squad", matchSquadPlayerIds: [...startingPlayerIds, ...unique(lineup.benchPlayerIds)] },
      ],
    },
  });
}

export function resolveGameplanPresentationLineup({ presentationState = {}, scheduleMatches = [], plan = {}, players = [] } = {}) {
  const teamDecks = presentationState.decks && typeof presentationState.decks === "object" ? presentationState.decks : {};
  const technicalDecks =
    presentationState.meetingDecks?.technical && typeof presentationState.meetingDecks.technical === "object"
      ? presentationState.meetingDecks.technical
      : {};
  const matches = scheduleMatches.map((match) => ({
    id: String(match.id || ""),
    date: String(match.date || ""),
    time: String(match.time || ""),
  }));
  const candidates = [
    ...Object.entries(teamDecks).map(([deckDate, deck]) => ({ deckDate, deck, meetingType: "team" })),
    ...Object.entries(technicalDecks).map(([deckDate, deck]) => ({ deckDate, deck, meetingType: "technical" })),
  ]
    .filter(({ deckDate, deck }) => parseDate(deckDate) && deckContainsLineup(deck) && deckMatchesPlan(deckDate, deck, plan, matches))
    .sort(
      (first, second) =>
        getDeckRecency(second.deckDate, second.deck) - getDeckRecency(first.deckDate, first.deck)
    );
  if (candidates.length) {
    const startingXiCandidate = candidates.find(({ deck }) => deckContainsLayout(deck, "starting-xi")) || null;
    const matchSquadCandidate = candidates.find(({ deck }) => deckContainsLayout(deck, "match-squad")) || null;
    const primaryCandidate = startingXiCandidate || matchSquadCandidate || candidates[0];
    const primarySelection = buildSelection({
      sourceDate: primaryCandidate.deckDate,
      sourceMeetingType: primaryCandidate.meetingType,
      deck: primaryCandidate.deck,
      plan,
      players,
      source: "Presentation",
    });
    const matchSquadSelection = matchSquadCandidate
      ? buildSelection({
          sourceDate: matchSquadCandidate.deckDate,
          sourceMeetingType: matchSquadCandidate.meetingType,
          deck: matchSquadCandidate.deck,
          plan,
          players,
          source: "Presentation",
        })
      : primarySelection;
    return {
      ...primarySelection,
      hasStartingXi: Boolean(startingXiCandidate),
      hasMatchSquad: Boolean(matchSquadCandidate),
      matchSquadPlayerIds: matchSquadCandidate ? matchSquadSelection.matchSquadPlayerIds : [],
      benchPlayerIds: matchSquadCandidate ? matchSquadSelection.benchPlayerIds : [],
      benchPlayers: matchSquadCandidate ? matchSquadSelection.benchPlayers : [],
      startingXiSourceDate: startingXiCandidate?.deckDate || "",
      startingXiSourceMeetingType: startingXiCandidate?.meetingType || "",
      matchSquadSourceDate: matchSquadCandidate?.deckDate || "",
      matchSquadSourceMeetingType: matchSquadCandidate?.meetingType || "",
    };
  }
  const legacy = plan.lineup || {};
  if (Array.isArray(legacy.startingPlayerIds) && legacy.startingPlayerIds.length) {
    const legacySelection = buildLegacySelection(plan, players);
    return {
      ...legacySelection,
      startingXiSourceDate: legacySelection.sourceDate,
      startingXiSourceMeetingType: legacySelection.sourceMeetingType,
      matchSquadSourceDate: legacySelection.sourceDate,
      matchSquadSourceMeetingType: legacySelection.sourceMeetingType,
    };
  }
  return {
    ...buildSelection({ sourceDate: plan.date || "", deck: {}, plan, players, source: "Presentation" }),
    startingXiSourceDate: "",
    startingXiSourceMeetingType: "",
    matchSquadSourceDate: "",
    matchSquadSourceMeetingType: "",
  };
}
