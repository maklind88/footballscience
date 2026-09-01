import { leaderboardMaxPointsPerPlayer } from "./leaderboard-constants.mjs";
import {
  createLeaderboardIdempotencyKey,
  getLeaderboardMonthValue,
  normalizeLeaderboardDate,
  normalizeLeaderboardMonth,
  normalizeLeaderboardText,
} from "./leaderboard-helpers.mjs";
import {
  getLeaderboardDraftAwards,
  getLeaderboardEvents,
  getLeaderboardMonthBounds,
  getLeaderboardPlayerAvailability,
  getLeaderboardSquadPlayers,
} from "./leaderboard-selectors.mjs";
import { createLeaderboardAwardDraft } from "./leaderboard-state.mjs";

function normalizeResponse(payload = {}, fallbackMonth = "") {
  return {
    ok: payload.ok !== false,
    schema: normalizeLeaderboardText(payload.schema, 120),
    month: normalizeLeaderboardMonth(payload.month, fallbackMonth),
    competition: payload.competition && typeof payload.competition === "object" ? payload.competition : {},
    summary: payload.summary && typeof payload.summary === "object" ? payload.summary : {},
    roster: Array.isArray(payload.roster) ? payload.roster : [],
    standings: Array.isArray(payload.standings) ? payload.standings : [],
    events: Array.isArray(payload.events) ? payload.events : [],
  };
}

function getCanEdit(context = {}) {
  try {
    return typeof context.canEdit === "function" ? Boolean(context.canEdit()) : Boolean(context.canEdit);
  } catch {
    return false;
  }
}

export function createLeaderboardActions({ store, api, context = {} } = {}) {
  const getNow = typeof context.getNow === "function" ? context.getNow : () => new Date();

  function getMonthCachePatch(month, patch = {}) {
    const current = store.getState().monthCache?.[month] || {};
    return { [month]: { ...current, ...patch } };
  }

  async function loadMonth(month = store.getState().month, options = {}) {
    const safeMonth = normalizeLeaderboardMonth(month, getLeaderboardMonthValue(getNow()));
    const isCurrent = typeof options.isCurrent === "function" ? options.isCurrent : () => true;
    store.setState({
      month: safeMonth,
      status: "loading",
      requestError: "",
      monthCache: getMonthCachePatch(safeMonth, { status: "loading", error: "" }),
    });
    try {
      const payload = await api.loadMonth(safeMonth, { signal: options.signal });
      if (!isCurrent()) return null;
      const responseMonth = normalizeLeaderboardMonth(payload.month, safeMonth);
      const data = normalizeResponse(payload, safeMonth);
      store.setState({
        status: "ready",
        month: responseMonth,
        data,
        requestError: "",
        monthCache: getMonthCachePatch(responseMonth, { status: "ready", data, error: "" }),
      });
      return payload;
    } catch (error) {
      if (!isCurrent() || error?.name === "AbortError") return null;
      const message = error?.message || "Leaderboard could not be loaded.";
      store.setState({
        status: "error",
        requestError: message,
        monthCache: getMonthCachePatch(safeMonth, { status: "error", error: message }),
      });
      throw error;
    }
  }

  function validateAward() {
    const state = store.getState();
    const title = normalizeLeaderboardText(state.draft.title, 160);
    const occurredOn = normalizeLeaderboardDate(state.draft.occurredOn);
    const bounds = getLeaderboardMonthBounds(state.month, getNow());
    const awards = getLeaderboardDraftAwards(state.draft);
    const squadPlayers = getLeaderboardSquadPlayers(state.data || {});
    const squadPlayerIds = new Set(squadPlayers.map((player) => player.id));
    const squadById = new Map(squadPlayers.map((player) => [player.id, player]));
    if (!getCanEdit(context)) return { error: "You do not have permission to award points." };
    if (state.month !== getLeaderboardMonthValue(getNow())) return { error: "Completed Leaderboard months are read-only." };
    if (!occurredOn || occurredOn < bounds.min || occurredOn > bounds.max) return { error: `Choose a date within ${state.month}.` };
    if (!title) return { error: "Add a competition or activity title." };
    if (!awards.length) return { error: "Select at least one player and award points." };
    if (awards.some((award) => !squadPlayerIds.has(award.playerId))) return { error: "One or more selected players are no longer in the active squad." };
    if (awards.some((award) => getLeaderboardPlayerAvailability(squadById.get(award.playerId), occurredOn).eligibility === "unavailable")) {
      return { error: "One or more selected players were unavailable for team activity on this date." };
    }
    if (awards.some((award) => award.points < 1 || award.points > leaderboardMaxPointsPerPlayer)) {
      return { error: `Points must be between 1 and ${leaderboardMaxPointsPerPlayer}.` };
    }
    return { occurredOn, title, awards };
  }

  async function awardPoints() {
    const state = store.getState();
    if (state.ui.pendingAction) return null;
    const validated = validateAward();
    if (validated.error) {
      store.setState({ ui: { draftError: validated.error } });
      return null;
    }
    const previousEventIds = new Set(getLeaderboardEvents(state.data || {}).map((event) => event.id));
    store.setState({ ui: { pendingAction: "award", draftError: "" } });
    try {
      const payload = await api.award({
        occurredOn: validated.occurredOn,
        title: validated.title,
        note: normalizeLeaderboardText(state.draft.note, 600),
        idempotencyKey: state.draft.idempotencyKey,
        awards: validated.awards,
      });
      const data = normalizeResponse(payload, validated.occurredOn.slice(0, 7));
      const createdEvent = getLeaderboardEvents(data).find((event) => !previousEventIds.has(event.id) && !event.reversedAt);
      store.setState({
        month: data.month || state.month,
        status: "ready",
        data,
        monthCache: getMonthCachePatch(data.month || state.month, { status: "ready", data, error: "" }),
        draft: createLeaderboardAwardDraft(getNow()),
        ui: {
          awardOpen: false,
          pendingAction: "",
          draftError: "",
          notice: {
            tone: "success",
            message: `Points awarded to ${validated.awards.length} player${validated.awards.length === 1 ? "" : "s"}.`,
            undoEventId: createdEvent?.id || "",
            idempotencyKey: createLeaderboardIdempotencyKey("leaderboard-undo"),
          },
        },
      });
      return payload;
    } catch (error) {
      store.setState({ ui: { pendingAction: "", draftError: error?.message || "Points could not be saved. Try again." } });
      return null;
    }
  }

  async function reverseEvent({ eventId = "", reason = "", idempotencyKey = "" } = {}) {
    const state = store.getState();
    if (state.ui.pendingAction || !getCanEdit(context)) return null;
    if (state.month !== getLeaderboardMonthValue(getNow())) {
      store.setState({ ui: { draftError: "Completed Leaderboard months are read-only." } });
      return null;
    }
    const safeEventId = normalizeLeaderboardText(eventId, 120);
    const safeReason = normalizeLeaderboardText(reason, 240);
    const safeIdempotencyKey = idempotencyKey || createLeaderboardIdempotencyKey("leaderboard-reverse");
    if (!safeEventId || !safeReason) {
      store.setState({ ui: { draftError: "Add a reason before reversing this award." } });
      return null;
    }
    store.setState({ ui: { pendingAction: "reverse", draftError: "" } });
    try {
      const payload = await api.reverseEvent({
        eventId: safeEventId,
        reason: safeReason,
        idempotencyKey: safeIdempotencyKey,
      });
      const data = normalizeResponse(payload, state.month);
      store.setState({
        status: "ready",
        month: data.month || state.month,
        data,
        monthCache: getMonthCachePatch(data.month || state.month, { status: "ready", data, error: "" }),
        ui: {
          reverseEventId: "",
          reverseReason: "",
          reverseIdempotencyKey: "",
          pendingAction: "",
          draftError: "",
          notice: { tone: "neutral", message: "Point award reversed.", undoEventId: "" },
        },
      });
      return payload;
    } catch (error) {
      const message = error?.message || "The award could not be reversed. Try again.";
      store.setState({ ui: {
        pendingAction: "",
        draftError: state.ui.reverseEventId ? message : "",
        notice: state.ui.reverseEventId ? state.ui.notice : { tone: "error", message, undoEventId: safeEventId, idempotencyKey: safeIdempotencyKey },
      } });
      return null;
    }
  }

  return Object.freeze({ loadMonth, awardPoints, reverseEvent, validateAward });
}
