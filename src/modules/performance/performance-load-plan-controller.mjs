import { createLoadPlanDraft, createLoadPlanWeek, planningRole } from "./performance-load-plan.mjs";

export function createLoadPlanController(seed, isSample, persistence, render) {
  const modes = new Set(["team", "player", "references"]);
  let draft;
  let mode;
  let playerId;
  let referenceScope;
  let requestedPlayerId;
  let status;
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
    current = null;
  }

  function setMode(value) {
    if (!modes.has(value)) return false;
    mode = value;
    status = "";
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

  function selectFromEvent(event) {
    if (event.target.matches("[data-pr-plan-player]")) return selectPlayer(event.target.value);
    if (event.target.matches("[data-pr-reference-scope]")) return selectReference(event.target.value);
    return false;
  }

  async function load(state) {
    try {
      const result = await persistence.read(state.week);
      if (current !== state) return;
      draft = createLoadPlanDraft({ records: result.records });
      state.canEdit = result.canEdit === true;
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
    if (persistence && current?.key !== key) {
      current = { key, week, phase: "loading", canEdit: false, saving: false, conflict: false };
      status = "";
      void load(current);
    }
    return {
      days, players, selected, playerUnavailable, mode, referenceScope, status, draft, isSample, persisted: Boolean(persistence),
      phase: current?.phase ?? "ready", canEdit: current?.canEdit ?? !persistence, retry: current?.conflict,
    };
  }

  function setFormStatus(form, message) {
    form.closest(".pr-plan-workbench")?.querySelector(".pr-plan-status")?.replaceChildren(message);
  }

  function markInvalid(form, invalid) {
    for (const input of form.querySelectorAll("input")) {
      if (invalid.includes(input.name)) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
    if (!invalid.length) return;
    form.elements.namedItem(invalid[0])?.focus();
    setFormStatus(form, "Enter non-negative values up to 1,000 km or 1,000,000 m. Use up to three decimal places for km and whole meters for HSR and sprint.");
  }

  async function submit(form) {
    const state = current;
    if (persistence && (state?.phase !== "ready" || !state.canEdit || state.saving || state.conflict)) return;
    const fields = new FormData(form);
    const isPlan = form.dataset.prLoadForm === "player";
    if (isPlan && !playerId) return;
    const edit = isPlan ? draft.preparePlayerWeek(playerId, activities, fields) : draft.prepareReference(referenceScope, fields);
    markInvalid(form, edit.invalid);
    if (edit.invalid.length) return;
    if (!edit.records.length) {
      setFormStatus(form, "No changes to save.");
      return;
    }

    if (!persistence) {
      draft.applyRecords(edit.records);
      status = isPlan ? "Player plan saved in this tab. Team week updated." : "Reference saved in this tab.";
      render();
      return;
    }

    const controls = [...form.querySelectorAll("input, button[type=submit]")].filter((item) => !item.disabled);
    controls.forEach((item) => { item.disabled = true; });
    state.saving = true;
    setFormStatus(form, "Saving…");
    try {
      const result = await persistence.save(state.week, edit.records);
      if (current !== state) return;
      draft.applyRecords(result.records);
      state.canEdit = result.canEdit === true;
      status = isPlan ? "Player plan saved. Team week updated." : "Baseline saved.";
      render();
    } catch (error) {
      if (current !== state) return;
      const message = error.status ? error.message : "Could not confirm the save. Your entered values are still in the form.";
      state.conflict = error.status === 409;
      status = message;
      setFormStatus(form, message);
      const reload = form.closest(".pr-plan-workbench")?.querySelector("[data-pr-action=plan-reload]");
      if (reload) reload.hidden = !state.conflict;
    } finally {
      state.saving = false;
      controls.forEach((item) => { item.disabled = false; });
    }
  }

  return {
    reset, selectFromEvent, selectReference, setMode, getView, submit,
    reload() { current = null; },
    openPlayer(value) {
      requestedPlayerId = value;
      setMode("player");
    },
  };
}
