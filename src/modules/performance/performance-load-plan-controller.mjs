import { weekDates } from "./performance-overview.mjs";
import { selectReviewSession, trainingPlanAverage } from "./performance-session-review-data.mjs";
import { createWeekGps, formatGpsValue, updateGpsDelta } from "./performance-week-gps.mjs";
import { activityFormKey, createLoadPlanDraft, createLoadPlanWeek, loadMetrics, parseLoadInput, planningRole, playerTargetInputPrefix, previewTeamTargets, readLoadTargets, summarizePlayerWeek } from "./performance-load-plan.mjs";

export function createLoadPlanController(seed, isSample, persistence, render) {
  const modes = new Set(["team", "player", "references"]);
  let draft;
  let mode;
  let playerId;
  let referenceScope;
  let requestedPlayerId;
  let status;
  let feedbackForm;
  let activityId;
  let teamView;
  let gps;
  let gpsPreference;
  let gpsWeek;
  let previousGps;
  let reviewJump;
  let reviewDate;
  let reviewActivityId;
  let reviewMetric;
  let reviewEditing;
  let goalsOpen;
  const targetSources = new Map();
  const teamInputs = new Map();
  let players = [];
  let activities = [];
  let current;

  function reset() {
    draft = createLoadPlanDraft(seed);
    mode = "team";
    playerId = "";
    requestedPlayerId = "";
    referenceScope = "team";
    status = "";
    feedbackForm = "";
    activityId = "";
    teamView = "review";
    reviewDate = "";
    reviewActivityId = "";
    reviewMetric = "distance";
    reviewEditing = false;
    goalsOpen = false;
    targetSources.clear();
    gps = createWeekGps(seed?.gpsActuals);
    gpsPreference = undefined;
    gpsWeek = "";
    previousGps = null;
    reviewJump = null;
    teamInputs.clear();
    current = null;
  }

  function setMode(value) {
    if (!modes.has(value)) return false;
    mode = value;
    status = "";
    feedbackForm = "";
    return true;
  }

  function selectPlayer(value) {
    if (!players.some((player) => player.id === value)) return false;
    playerId = value;
    requestedPlayerId = "";
    status = "";
    return true;
  }

  function hasReferenceScope(value) {
    return value === "team" || players.some((player) =>
      value === `player:${player.id}` || (planningRole(player) && value === `role:${planningRole(player)}`)
    );
  }

  function selectReference(value) {
    if (!hasReferenceScope(value)) return false;
    referenceScope = value;
    setMode("references");
    return true;
  }

  function editablePlayers() {
    return current?.playerIds ? players.filter(({ id }) => current.playerIds.has(id)) : players;
  }

  function editableActivity(id) {
    return activities.some((activity) => activity.id === id) && (!current?.activityIds || current.activityIds.has(id));
  }

  function selectActivity(value) {
    if (mode !== "team" || !current?.canEdit || current.saving ||
        (value && !editableActivity(value))) return false;
    activityId = value;
    status = "";
    feedbackForm = "";
    return true;
  }

  function selectTeamView(value) {
    if (mode !== "team" || current?.saving || !["review", "activities", "players"].includes(value)) return false;
    teamView = value;
    return true;
  }

  function setReviewSelection(value, byDay) {
    if (mode !== "team" || teamView !== "review" || current?.saving) return false;
    const activity = activities.find(({ id }) => id === value);
    const nextDate = byDay ? value : activity?.date;
    if (!current?.days.some(({ date }) => date === nextDate)) return false;
    reviewDate = nextDate;
    reviewActivityId = byDay ? "" : activity.id;
    reviewEditing = false;
    return true;
  }

  function requestReviewJump(date, id) {
    if (mode !== "team" || teamView !== "review" || current?.saving) return false;
    reviewJump = { date, id };
    return true;
  }

  function getMatchGps(match, week) {
    if (!match) return null;
    const matchWeek = weekDates(match.date)[0];
    if (matchWeek === week) return gps;
    if (previousGps?.week === matchWeek) return previousGps.gps;
    if (!persistence || gps.status === "not-connected" || Date.parse(week) - Date.parse(matchWeek) !== 7 * 86400000) return null;
    // The preceding week can supply exposure for this match across the calendar boundary.
    const cached = { week: matchWeek, gps: null };
    previousGps = cached;
    void persistence.read(matchWeek).then((result) => {
      if (previousGps !== cached) return;
      cached.gps = createWeekGps(result.gpsActuals);
      render();
    }, () => {});
    return null;
  }

  function setReviewMetric(value) {
    if (current?.saving || !loadMetrics.some(({ key }) => key === value)) return false;
    reviewMetric = value;
    return true;
  }

  function setReviewEditing(value) {
    if (current?.saving || (value && !selectActivity(value))) return false;
    reviewEditing = Boolean(value);
    return true;
  }

  function toggleGoals() {
    if (current?.saving) return false;
    goalsOpen = !goalsOpen;
    return true;
  }

  function getTargetSource(activity, field) {
    return targetSources.get(activityFormKey(activity))?.get(field);
  }

  function toggleGpsComparison() {
    if (mode !== "team" || current?.saving) return false;
    gpsPreference = !(gpsPreference ?? gps.hasRows);
    return true;
  }

  function readTeamInput(key, field) {
    return teamInputs.get(key)?.get(field);
  }

  function getTeamWeekTotals(id) {
    const preview = { getTargets: (player, activity) => previewTeamTargets(draft, player, activity, readTeamInput) };
    return summarizePlayerWeek(current?.canEdit ? preview : draft, id, activities);
  }

  function teamFormKey(form) {
    if (form?.dataset.prLoadForm === "week-goal") return "week-goal";
    if (form?.dataset.prLoadForm === "team-activity") return activityFormKey(form.dataset.prActivityId);
    return "";
  }

  function writeTeamInput(key, name, value) {
    const values = teamInputs.get(key) ?? new Map();
    values.set(name, value);
    teamInputs.set(key, values);
  }

  function rememberTargetSource(key, name, source) {
    const fields = targetSources.get(key) ?? new Map();
    fields.set(name, source);
    targetSources.set(key, fields);
  }

  function refreshReviewWeek(form) {
    const review = form.closest(".pr-session-review");
    if (!review) return;
    const metric = loadMetrics.find(({ key }) => key === reviewMetric);
    const roster = editablePlayers();
    const { count, total } = trainingPlanAverage({ days: current.days, players: roster, draft, canEdit: true, readTeamInput }, metric);
    review.querySelector("[data-pr-review-week-label]").textContent = "Training week plan avg · draft";
    review.querySelector("[data-pr-review-week-avg]").textContent = formatGpsValue(count ? total / count : null, metric);
    review.querySelector("[data-pr-review-week-count]").textContent = `${count} of ${roster.length} players planned`;
  }

  function rememberTeamInput(input) {
    if (!input.form || mode !== "team" || !current?.canEdit || current.saving || !input.name) return null;
    const key = teamFormKey(input.form);
    if (key) {
      writeTeamInput(key, input.name, input.value);
      if (input.name.startsWith("player-")) {
        rememberTargetSource(key, input.name, "Individual draft");
        const sourceLabel = input.closest("td")?.querySelector("[data-pr-target-source]");
        if (sourceLabel) sourceLabel.textContent = "Individual draft";
        refreshReviewWeek(input.form);
      }
    }
    if (input.form.dataset.prLoadForm !== "team-week") return null;

    const row = input.closest("[data-pr-week-player]");
    const activity = input.closest("[data-pr-week-activity]")?.dataset.prWeekActivity;
    const metricKey = input.closest("[data-pr-week-metric]")?.dataset.prWeekMetric;
    const metric = loadMetrics.find(({ key }) => key === metricKey);
    if (!row || !activity || !metric) return null;
    const playerId = row.dataset.prWeekPlayer;
    const field = playerTargetInputPrefix(playerId) + metric.key;
    writeTeamInput(activityFormKey(activity), field, input.value);
    rememberTargetSource(activityFormKey(activity), field, "Individual draft");
    if (parseLoadInput(input.value, metric) === undefined) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
    if (!current.conflict && (feedbackForm !== "team-week" || status !== "Unsaved week changes.")) {
      setFormStatus(input.form, "Unsaved week changes.");
    }
    return { row, totals: getTeamWeekTotals(playerId) };
  }

  function fillTeamActivity(form, selectedOnly = false) {
    if (!form || !current?.canEdit || current.saving || current.conflict) return;
    const fields = new FormData(form);
    const { values, invalid } = readLoadTargets(fields, "bulk-");
    markInvalid(form, invalid);
    if (invalid.length) return;
    if (!Object.keys(values).length) {
      setFormStatus(form, "Enter one or more targets to apply.");
      return;
    }
    const selected = new Set(fields.getAll("selected-player"));
    if (selectedOnly && !selected.size) {
      setFormStatus(form, "Select the players whose targets you want to replace.");
      return;
    }
    const key = teamFormKey(form);
    const changed = new Set();
    for (const { id } of editablePlayers()) {
      if (selectedOnly && !selected.has(id)) continue;
      for (const { key: metric, scale } of loadMetrics) {
        if (values[metric] == null) continue;
        const field = playerTargetInputPrefix(id) + metric;
        const input = form.elements.namedItem(field);
        if (!input || (!selectedOnly && (input.value.trim() || readTeamInput(key, field) !== undefined))) continue;
        const value = String(values[metric] / scale);
        if (input.value === value) continue;
        input.value = value;
        writeTeamInput(key, field, value);
        const source = selectedOnly ? "Group draft" : "Team draft";
        rememberTargetSource(key, field, source);
        const sourceLabel = input.closest("td")?.querySelector("[data-pr-target-source]");
        if (sourceLabel) sourceLabel.textContent = source;
        updateGpsDelta(input);
        changed.add(id);
      }
    }
    if (changed.size) refreshReviewWeek(form);
    setFormStatus(form, changed.size
      ? `Draft targets updated for ${changed.size} players. Save player targets to update the plan.`
      : selectedOnly ? "The selected players already have these values." : "All matching targets are already set.");
  }

  function selectFromEvent(event) {
    if (event.target.matches("[data-pr-plan-player]")) return selectPlayer(event.target.value);
    if (event.target.matches("[data-pr-reference-scope]")) return selectReference(event.target.value);
    if (event.target.matches("[data-pr-team-activity]")) return selectActivity(event.target.value);
    return false;
  }

  async function load(state) {
    try {
      const result = await persistence.read(state.week);
      if (current !== state) return;
      draft = createLoadPlanDraft({ records: result.records });
      if (gpsWeek && gpsWeek !== state.week && gps.status === "ready") {
        previousGps = { week: gpsWeek, gps };
      }
      gpsWeek = state.week;
      gps = createWeekGps(result.gpsActuals);
      state.canEdit = result.canEdit === true;
      const { playerIds, activityIds } = result.planningSources ?? {};
      if (Array.isArray(playerIds)) state.playerIds = new Set(playerIds);
      if (Array.isArray(activityIds)) state.activityIds = new Set(activityIds);
      if (activityId && !editableActivity(activityId)) activityId = "";
      state.phase = "ready";
    } catch (error) {
      if (current !== state) return;
      state.phase = "error";
      status = [401, 403].includes(error.status) ? error.message : "Could not load saved plans. Try again.";
    }
    render();
  }

  function getView(overview, sources) {
    const days = createLoadPlanWeek(overview, sources.events);
    players = sources.playersFor?.(days.map(({ date }) => date)) ?? overview.squad;
    activities = days.flatMap((day) => day.activities);
    if (!hasReferenceScope(referenceScope)) referenceScope = "team";
    const requested = players.find(({ id }) => id === requestedPlayerId);
    const playerUnavailable = Boolean(requestedPlayerId && !requested);
    const selected = requested ?? (playerUnavailable ? null : players.find(({ id }) => id === playerId) ?? players[0]);
    playerId = selected?.id ?? "";
    const week = days[0].date;
    const key = JSON.stringify([week, players.map((player) => [player.id, planningRole(player)]), activities.map(({ id }) => id)]);
    if (current?.key !== key) {
      if (current && current.week !== week) {
        activityId = "";
        reviewDate = "";
        reviewActivityId = "";
        reviewEditing = false;
      }
      if (!activities.some(({ id }) => id === activityId)) activityId = "";
      teamInputs.clear();
      targetSources.clear();
      current = { key, week, days, phase: persistence ? "loading" : "ready", canEdit: !persistence, saving: false, conflict: false };
      status = "";
      feedbackForm = "";
      if (persistence) void load(current);
    }
    if (reviewJump) {
      reviewDate = reviewJump.date;
      reviewActivityId = reviewJump.id;
      reviewJump = null;
    }
    current.days = days;
    const review = selectReviewSession(days, sources.events, overview.selected.date, reviewDate, reviewActivityId, current.activityIds);
    const teamPlayers = editablePlayers();
    const reviewReady = current.phase === "ready" && mode === "team" && teamView === "review" && review.activity;
    const recommendation = reviewReady ? sources.getAvailability?.(review.day.date, teamPlayers) : null;
    return {
      days, players, selected, playerUnavailable, mode, referenceScope, status, draft, isSample, persisted: Boolean(persistence),
      phase: current.phase, canEdit: current.canEdit, retry: current.conflict,
      week, activityId, feedbackForm, teamView, teamPlayers, editableActivity,
      readTeamInput, getTeamWeekTotals, gps, showGps: gpsPreference ?? gps.hasRows,
      review, reviewMetric, reviewEditing: reviewEditing && activityId === review.activity?.id,
      recommendation, getTargetSource, goalsOpen, matchGps: reviewReady ? getMatchGps(review.match, week) : null,
    };
  }

  function setFormStatus(form, message) {
    status = message;
    feedbackForm = form.dataset.prLoadForm;
    const workbench = form.closest(".pr-plan-workbench");
    const live = workbench?.querySelector(".pr-plan-status");
    const inline = form.querySelector("[data-pr-team-feedback]");
    for (const note of workbench?.querySelectorAll("[data-pr-team-feedback]") ?? []) note.textContent = "";
    if (inline) inline.textContent = message;
    live?.classList.toggle("pr-plan-status-inline", Boolean(inline));
    live?.replaceChildren(message);
  }

  function markInvalid(form, invalid) {
    for (const input of form.querySelectorAll("input")) {
      if (invalid.includes(input.name)) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
    if (!invalid.length) return;
    form.elements.namedItem(invalid[0])?.focus();
    const weekGoal = form.dataset.prLoadForm === "week-goal";
    const limit = weekGoal ? Math.floor(10000000 / editablePlayers().length) : 1000000;
    const label = new Intl.NumberFormat("en-GB").format(limit);
    setFormStatus(form, `Enter non-negative values up to ${label} m or its equivalent in km. Use up to three decimal places for km and whole meters for HSR and sprint.`);
  }

  function prepareForm(form) {
    const fields = new FormData(form);
    const type = form.dataset.prLoadForm;
    if (type === "week-goal") {
      const playerCount = editablePlayers().length;
      return playerCount ? draft.prepareWeekGoal(current.week, fields, playerCount) : null;
    }
    if (type === "reference") return draft.prepareReference(referenceScope, fields);
    if (type === "player" && playerId) return draft.preparePlayerWeek(playerId, activities, fields);
    if (type === "team-activity" && activityId && activityId === form.dataset.prActivityId) {
      return draft.prepareTeamActivity(activityId, editablePlayers(), fields);
    }
    if (type === "team-week") {
      return draft.prepareTeamWeek(editablePlayers(), activities.filter(({ id }) => editableActivity(id)), fields);
    }
    return null;
  }

  function clearSavedPlayerInputs(records) {
    for (const { subjectKey, activityId } of records) {
      const inputs = teamInputs.get(activityFormKey(activityId));
      if (!inputs) continue;
      const prefix = playerTargetInputPrefix(subjectKey.slice("player:".length));
      for (const { key } of loadMetrics) {
        inputs.delete(prefix + key);
        targetSources.get(activityFormKey(activityId))?.delete(prefix + key);
      }
    }
  }

  function saveConfirmed(form, records) {
    const type = form.dataset.prLoadForm;
    const label = {
      "week-goal": "Weekly goals", reference: persistence ? "Baseline" : "Reference", player: "Player plan",
      "team-activity": "Player targets", "team-week": "Week changes",
    }[type];
    draft.applyRecords(records);
    teamInputs.delete(teamFormKey(form));
    targetSources.delete(teamFormKey(form));
    if (type === "player") clearSavedPlayerInputs(records);
    if (type === "team-week") {
      for (const { id } of activities) {
        const inputs = teamInputs.get(activityFormKey(id));
        targetSources.delete(activityFormKey(id));
        for (const key of inputs?.keys() ?? []) {
          if (key.startsWith("player-")) inputs.delete(key);
        }
      }
    }
    const result = label + (persistence ? " saved." : " saved in this tab.");
    setFormStatus(form, type === "reference" ? result : result + " Team week updated.");
    render();
  }

  async function submit(form) {
    const state = current;
    if (state?.phase !== "ready" || !state.canEdit || state.saving || state.conflict) return;
    const edit = prepareForm(form);
    if (!edit) return;
    markInvalid(form, edit.invalid);
    if (edit.invalid.length) return;
    if (!edit.records.length) {
      setFormStatus(form, "No changes to save.");
      return;
    }
    if (persistence && form.dataset.prLoadForm === "team-week" && edit.records.length > 500) {
      setFormStatus(form, "Save up to 500 changed player targets at once. Use By activity to save part of this week, then return here.");
      return;
    }
    if (!persistence) return saveConfirmed(form, edit.records);

    const controls = [...form.querySelectorAll("input, button, select")].filter((item) => !item.disabled);
    controls.forEach((item) => { item.disabled = true; });
    state.saving = true;
    setFormStatus(form, "Saving…");
    try {
      const result = await persistence.save(state.week, edit.records);
      if (current !== state) return;
      state.canEdit = result.canEdit === true;
      state.saving = false;
      saveConfirmed(form, result.records);
    } catch (error) {
      if (current !== state) return;
      state.conflict = error.status === 409;
      setFormStatus(form, error.status ? error.message : "Could not confirm the save. Your entered values are still in the form.");
      const reload = form.closest(".pr-plan-workbench")?.querySelector("[data-pr-action=plan-reload]");
      if (reload) reload.hidden = !state.conflict;
    } finally {
      state.saving = false;
      controls.forEach((item) => { item.disabled = false; });
    }
  }

  return {
    reset, selectFromEvent, selectReference, selectActivity, selectTeamView, toggleGpsComparison, setMode, getView, submit,
    fillTeamActivity, rememberTeamInput, setReviewSelection, requestReviewJump, setReviewMetric, setReviewEditing, toggleGoals,
    reload() { current = null; },
    openPlayer(value) {
      requestedPlayerId = value;
      setMode("player");
    },
  };
}
